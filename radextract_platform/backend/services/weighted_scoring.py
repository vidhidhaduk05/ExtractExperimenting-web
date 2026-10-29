"""Weighted inclusion/exclusion scoring engine (blueprint §4E contract).

Design decisions locked here:
- Weights are RELATIVE INFLUENCE (0.00-1.00), never probabilities and never a
  forced final decision. The engine output is a recommendation for human review.
- Hard rules dominate: a confirmed strict exclusion can NEVER be compensated by
  positive soft signals, and a failed required inclusion can NEVER be hidden by
  unrelated positive signals.
- Soft aggregation is an explicit, versioned heuristic (FORMULA_VERSION), not a
  validated probability. Every output carries the formula id so displayed scores
  are never mistaken for calibrated correctness.
- Missing evidence is fail-closed: unscored criteria are pulled out of the
  denominator and reported; they never silently push a study toward inclusion.
- Every evaluation produces an immutable, replayable trace.

FORMULA weighted-soft-v1
  For each weighted criterion i with known evidence score s_i in [0,1]:
    inclusion criterion: contribution c_i = +w_i * s_i
    exclusion criterion: contribution c_i = -w_i * s_i   (s_i = strength of
                                                          evidence FOR the
                                                          exclusion)
  aggregate a   = sum(c_i) / sum(|w_i|)          over SCORED criteria only
  rec_score     = (a + 1) / 2                    mapped to [0,1]
  Bands (policy): rec_score >= include_band  -> "include_review"
                   rec_score <= exclude_band  -> "exclude_review"
                   otherwise                  -> "uncertain"
  Hard flags override bands: "hard_exclude" | "required_inclusion_failed".
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

FORMULA_VERSION = "weighted-soft-v1"


class WeightedCriterion(BaseModel):
    """One protocol criterion with an influence weight.

    rule_mode:
      - "required": hard eligibility logic. Exclusion fires when score == 1.0;
        inclusion fails when score == 0.0. Missing evidence blocks (fail-closed).
      - "weighted": soft signal scaled by `weight`.
    Legacy criteria stored with rule_mode "strict" are normalized to "required".
    """

    id: str
    text: str
    direction: Literal["inclusion", "exclusion"]
    rule_mode: Literal["required", "weighted"] = "weighted"
    weight: float = Field(default=0.50, ge=0.0, le=1.0)
    threshold: float = Field(default=0.90, ge=0.0, le=1.0)
    score_source: Literal["keyword", "model", "hybrid", "laya"] = "laya"
    enabled: bool = True
    version: int = 1

    @field_validator("rule_mode", mode="before")
    @classmethod
    def _normalize_rule_mode(cls, v):
        if v == "strict":
            return "required"
        return v


class ScreeningPolicy(BaseModel):
    """Versioned decision bands. Changing these invalidates calibration."""

    include_band: float = Field(default=0.65, ge=0.0, le=1.0)
    exclude_band: float = Field(default=0.35, ge=0.0, le=1.0)
    policy_version: str = "policy-v1"


class CriterionEvidence(BaseModel):
    criterion_id: str
    score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    quote: str = ""
    source_locator: str = ""  # page/offset or section anchor when available
    engine: str = ""          # laya | biomni-r0 | keyword | human
    applicability: Literal["applicable", "not_applicable", "unknown"] = "applicable"


class EvaluationTrace(BaseModel):
    """Immutable, replayable record of one weighted evaluation."""

    trace_id: str
    project_id: str
    study_id: str
    stage: Literal["ta", "ft"]
    formula_version: str
    policy_version: str
    criteria_version: int
    criteria_hash: str
    input_text_hash: str
    model_config_json: str = ""
    created_at: str
    recommendation: str
    rec_score: float
    contributions: List[Dict[str, Any]]
    missing: List[str]
    not_applicable: List[str]
    hard_flags: List[str]


def _hash_json(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def evaluate_weighted(
    evidence: List[CriterionEvidence],
    criteria: List[WeightedCriterion],
    policy: Optional[ScreeningPolicy] = None,
) -> Dict[str, Any]:
    """Evaluate one study. Returns recommendation + full how-calculated table.

    Never raises on missing evidence; missingness is part of the result.
    """
    policy = policy or ScreeningPolicy()
    by_id = {c.id: c for c in criteria}
    ev_by_id: Dict[str, CriterionEvidence] = {}
    for ev in evidence:
        if ev.criterion_id in by_id:
            ev_by_id[ev.criterion_id] = ev
    unmatched_evidence = sorted(
        ev.criterion_id for ev in evidence if ev.criterion_id not in by_id
    )

    contributions: List[Dict[str, Any]] = []
    missing: List[str] = []
    not_applicable: List[str] = []
    hard_flags: List[str] = []
    weighted_scored: List[tuple[float, float]] = []  # (weight, signed contribution)

    for c in criteria:
        if not c.enabled:
            continue
        ev = ev_by_id.get(c.id)
        if ev is None:
            ev = CriterionEvidence(criterion_id=c.id, score=None)
        if ev.applicability == "not_applicable":
            not_applicable.append(c.id)
            contributions.append({
                "criterion": c.id, "direction": c.direction,
                "rule_mode": c.rule_mode, "weight": c.weight,
                "score": None, "contribution": 0.0,
                "state": "not_applicable", "quote": ev.quote,
                "source_locator": ev.source_locator, "engine": ev.engine,
            })
            continue
        if ev.applicability == "unknown" or ev.score is None:
            if c.rule_mode == "required":
                # Fail-closed: a required rule with unknown evidence blocks an
                # automated recommendation; it is reported, never guessed.
                hard_flags.append(f"required_unscored:{c.id}")
            missing.append(c.id)
            contributions.append({
                "criterion": c.id, "direction": c.direction,
                "rule_mode": c.rule_mode, "weight": c.weight,
                "score": None, "contribution": 0.0,
                "state": "missing", "quote": ev.quote,
                "source_locator": ev.source_locator, "engine": ev.engine,
            })
            continue

        s = float(ev.score)
        if c.rule_mode == "required":
            fired = (s >= 1.0) if c.direction == "exclusion" else (s <= 0.0)
            if c.direction == "exclusion" and fired:
                hard_flags.append(f"hard_exclude:{c.id}")
            if c.direction == "inclusion" and fired:
                hard_flags.append(f"required_inclusion_failed:{c.id}")
            contributions.append({
                "criterion": c.id, "direction": c.direction,
                "rule_mode": c.rule_mode, "weight": c.weight,
                "score": s, "contribution": 0.0,
                "state": "fired" if fired else "passed", "quote": ev.quote,
                "source_locator": ev.source_locator, "engine": ev.engine,
            })
            continue

        # weighted soft signal
        signed = (s if c.direction == "inclusion" else -s) * c.weight
        weighted_scored.append((c.weight, signed))
        contributions.append({
            "criterion": c.id, "direction": c.direction,
            "rule_mode": c.rule_mode, "weight": c.weight,
            "score": s, "contribution": round(signed, 6),
            "state": "scored", "quote": ev.quote,
            "source_locator": ev.source_locator, "engine": ev.engine,
        })

    # Hard rules dominate the recommendation.
    if any(f.startswith("hard_exclude:") for f in hard_flags):
        recommendation = "exclude"
        rec_score = 0.0
    elif any(f.startswith("required_inclusion_failed:") for f in hard_flags):
        recommendation = "exclude"
        rec_score = 0.0
    elif any(f.startswith("required_unscored:") for f in hard_flags):
        recommendation = "uncertain"
        rec_score = 0.5
    else:
        denom = sum(abs(w) for w, _ in weighted_scored)
        if denom <= 0.0 or not weighted_scored:
            # No scored soft signal at all: no number may be invented.
            recommendation = "uncertain"
            rec_score = 0.5
        else:
            aggregate = sum(c for _, c in weighted_scored) / denom
            aggregate = max(-1.0, min(1.0, aggregate))
            rec_score = round((aggregate + 1.0) / 2.0, 6)
            if rec_score >= policy.include_band:
                recommendation = "include_review"
            elif rec_score <= policy.exclude_band:
                recommendation = "exclude_review"
            else:
                recommendation = "uncertain"

    return {
        "recommendation": recommendation,
        "rec_score": rec_score,
        "hard_flags": hard_flags,
        "contributions": contributions,
        "missing": missing,
        "not_applicable": not_applicable,
        "unmatched_evidence": unmatched_evidence,
        "formula_version": FORMULA_VERSION,
        "policy_version": policy.policy_version,
        "note": (
            "Heuristic weighted aggregation, not a calibrated probability. "
            "Human review is final."
        ),
    }


def build_trace(
    result: Dict[str, Any],
    *,
    trace_id: str,
    project_id: str,
    study_id: str,
    stage: str,
    criteria: List[WeightedCriterion],
    input_text: str,
    model_config: Optional[Dict[str, Any]] = None,
) -> EvaluationTrace:
    """Assemble the immutable trace for one evaluation."""
    crit_payload = [c.dict() for c in criteria]
    return EvaluationTrace(
        trace_id=trace_id,
        project_id=project_id,
        study_id=study_id,
        stage=stage,
        formula_version=result["formula_version"],
        policy_version=result["policy_version"],
        criteria_version=max((c.version for c in criteria), default=1),
        criteria_hash=_hash_json(crit_payload),
        input_text_hash=_hash_json(input_text),
        model_config_json=json.dumps(model_config or {}, sort_keys=True),
        created_at=datetime.now(timezone.utc).isoformat(),
        recommendation=result["recommendation"],
        rec_score=result["rec_score"],
        contributions=result["contributions"],
        missing=result["missing"],
        not_applicable=result["not_applicable"],
        hard_flags=result["hard_flags"],
    )


def replay_trace(trace: EvaluationTrace, criteria: List[WeightedCriterion],
                 input_text: str, policy: Optional[ScreeningPolicy] = None) -> Dict[str, Any]:
    """Recompute from stored evidence and verify the trace reproduces.

    Returns {"reproduces": bool, "result": ...}. Same formula + same evidence
    + same policy MUST give the same recommendation and score.
    """
    if trace.criteria_hash != _hash_json([c.dict() for c in criteria]):
        return {"reproduces": False, "reason": "criteria_hash_mismatch", "result": None}
    if trace.input_text_hash != _hash_json(input_text):
        return {"reproduces": False, "reason": "input_hash_mismatch", "result": None}
    evidence = [
        CriterionEvidence(
            criterion_id=cb["criterion"],
            score=cb["score"],
            quote=cb.get("quote", ""),
            source_locator=cb.get("source_locator", ""),
            engine=cb.get("engine", ""),
            applicability=(
                "not_applicable" if cb.get("state") == "not_applicable"
                else "unknown" if cb.get("state") == "missing"
                else "applicable"
            ),
        )
        for cb in trace.contributions
    ]
    result = evaluate_weighted(evidence, criteria, policy)
    reproduces = (
        result["recommendation"] == trace.recommendation
        and math.isclose(result["rec_score"], trace.rec_score, abs_tol=1e-9)
    )
    return {"reproduces": reproduces, "result": result}
