"""Jev (TypeSafe) method advisor: typed, calibrated proposals for modeling
decisions, logged as ADVISORY entries in the decision trace.

Boundary (see SKILL.md core framework 9): Jev proposes; a human decides. It
never computes statistics, never replaces bootstrap intervals or tests, and
never autonomously sets a threshold that determines a scientific result.

Privacy: only aggregate analysis metadata crosses the API boundary — sample
sizes, event counts, variable types, missingness rates. An allowlist guard
rejects anything resembling patient-level data. The API key is read from the
TYPESAFE_API_KEY environment variable and is never logged or written anywhere.

Offline behavior: with no key set or on API failure, a deterministic
rule-based advisor (EPV rule, n-based design choice) returns the same typed
structure with source="rule_based", so the skill works fully offline.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

ALLOWED_STATE_KEYS = {
    "outcome_type",        # "binary" | "survival" | "continuous"
    "n_patients",
    "n_events",
    "n_predictors",        # parameter count, not variable count
    "n_centers",
    "max_missing_rate",    # largest per-variable missing fraction
    "has_time_varying",    # bool
    "correlated_predictors",  # bool
}

VALIDATION_DESIGNS = ("full_pipeline_bootstrap", "nested_cv", "held_out_split")
SPLINE_KNOT_OPTIONS = ("3", "4", "5")

# Literature-based rule thresholds (ch02, ch10, ch11) — named so they are
# visible and citable, not buried in expressions.
BOOTSTRAP_N_THRESHOLD = 1000   # below: full-pipeline bootstrap over held-out split
EPV_ADEQUATE = 10              # events per parameter needed for stable fits
EPV_COMFORTABLE = 20           # events per parameter at which penalization is optional


class PrivacyViolation(ValueError):
    """Raised when the state dict contains non-metadata content."""


def guard_state(state: dict[str, Any]) -> dict[str, Any]:
    """Enforce the metadata-only allowlist; return the cleaned state."""
    unexpected = set(state) - ALLOWED_STATE_KEYS
    if unexpected:
        raise PrivacyViolation(
            f"state contains keys outside the metadata allowlist: {sorted(unexpected)}. "
            "Only aggregate analysis metadata may be sent to the advisor."
        )
    for key in ("n_patients", "n_events", "n_predictors", "n_centers", "max_missing_rate"):
        if key in state and not isinstance(state[key], (int, float)):
            raise PrivacyViolation(f"{key} must be a number, not {type(state[key]).__name__}")
    cleaned = {k: v for k, v in state.items() if k in ALLOWED_STATE_KEYS}
    if "n_patients" not in cleaned or "outcome_type" not in cleaned:
        raise ValueError("state requires at least n_patients and outcome_type")
    return cleaned


@dataclass
class Advisory:
    source: str                       # "jev" | "rule_based"
    validation_design: str
    penalization_needed: float        # probability
    spline_knots: str
    epv_adequate: float               # probability
    probabilities: dict = field(default_factory=dict)
    note: str = ""

    def to_trace_entry(self) -> dict:
        return {
            "proposal": {
                "validation_design": self.validation_design,
                "penalization_needed_probability": self.penalization_needed,
                "spline_knots": self.spline_knots,
                "epv_adequate_probability": self.epv_adequate,
            },
            "source": self.source,
            "final_decision": None,  # filled by the human; see ch15
        }


def _rule_based_advisor(state: dict[str, Any]) -> Advisory:
    """Deterministic fallback following ch02/ch10/ch11 rules."""
    n = state["n_patients"]
    events = state.get("n_events", n)
    params = state.get("n_predictors", 10)
    epv = events / max(params, 1)
    design = ("full_pipeline_bootstrap" if n < BOOTSTRAP_N_THRESHOLD
              else "held_out_split")
    # precedence made explicit: time-varying effects force nested CV;
    # otherwise large survival cohorts may use a held-out split
    if state.get("has_time_varying"):
        design = "nested_cv"
    penalize = max(0.0, min(1.0, 1.0 - epv / float(EPV_COMFORTABLE)))
    knots = "4" if epv >= EPV_ADEQUATE else "3"
    return Advisory(
        source="rule_based",
        validation_design=design,
        penalization_needed=penalize,
        spline_knots=knots,
        epv_adequate=float(epv >= EPV_ADEQUATE),
        probabilities={"epv": epv},
        note=f"deterministic rules: EPV={epv:.1f}, n={n}",
    )


def _jev_questions() -> dict:
    from typesafe_sdk import Choice, Noul, Score

    return {
        "validation_design": Choice(
            "Which validation design fits this analysis?",
            {
                "full_pipeline_bootstrap": "n below ~1000 or events below ~100; resample and refit everything",
                "nested_cv": "hyperparameter tuning required, e.g. ML models or time-varying effects",
                "held_out_split": "large n where a single split is stable and cheap",
            },
        ),
        "penalization_needed": Noul(
            "Is penalization (ridge/lasso/elastic net) warranted given events per parameter?"
        ),
        "spline_knots": Choice(
            "How many knots for restricted cubic splines on key continuous predictors?",
            {
                "3": "tight events-per-parameter budget",
                "4": "default flexibility when EPV allows",
                "5": "ample events and suspected nonlinearity",
            },
        ),
        "epv_adequate": Noul("Are events per parameter at least 10?"),
        "flexibility_score": Score(
            "How much model flexibility does this dataset support?",
            ["very tight", "tight", "adequate", "ample"],
        ),
    }


def advise(state: dict[str, Any], trace=None, *, timeout_s: float = 5.0) -> Advisory:
    """Request advisory proposals for a modeling context.

    Sends metadata only (enforced by guard_state). Logs a `jev_advisory` entry
    with final_decision=None for the human to fill.
    """
    cleaned = guard_state(state)
    api_key = os.environ.get("TYPESAFE_API_KEY")
    if not api_key:
        advisory = _rule_based_advisor(cleaned)
    else:
        try:
            from typesafe_sdk import TypeSafeClient

            client = TypeSafeClient(timeout=timeout_s)
            response = client.system_one(
                model="jev-latest",
                state=cleaned,
                questions=_jev_questions(),
            )
            answers = response.answers
            advisory = Advisory(
                source="jev",
                validation_design=answers["validation_design"].choice,
                penalization_needed=float(answers["penalization_needed"].noul),
                spline_knots=answers["spline_knots"].choice,
                epv_adequate=float(answers["epv_adequate"].noul),
                probabilities={
                    "validation_design": dict(answers["validation_design"].probabilities),
                    "flexibility_score": dict(answers["flexibility_score"].probabilities),
                },
            )
        except Exception as exc:  # offline fallback on any API failure
            advisory = _rule_based_advisor(cleaned)
            advisory.note += f" | jev unavailable ({type(exc).__name__}), used rule-based fallback"

    if trace is not None:
        trace.log(
            "jev_advisory",
            chosen=advisory.to_trace_entry(),
            alternatives="human decides; advisory input only — never autonomous",
            rationale=advisory.note or "calibrated System One proposal on metadata only",
            stage="planning",
        )
    return advisory
