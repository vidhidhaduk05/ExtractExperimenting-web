"""TRIPOD+AI reporting checklist generator.

Maps the entries of a DecisionTrace onto the 27 TRIPOD+AI items (Collins et al.,
BMJ 2024) and reports coverage. This is a completeness aid, not a substitute
for writing the checklist by hand — items requiring prose (title, discussion)
are listed as manual follow-ups.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

# TRIPOD+AI items with the decision-trace keywords that satisfy them.
CHECKLIST: dict[str, dict[str, object]] = {
    "1 Title": {"keywords": [], "manual": True,
                "hint": "Identify study as development/validation, population, outcome."},
    "2 Abstract": {"keywords": [], "manual": True,
                   "hint": "TRIPOD+AI for Abstracts checklist."},
    "3 Background": {"keywords": [], "manual": True, "hint": "Context and rationale."},
    "4 Objectives": {"keywords": ["study_type"], "manual": False,
                     "hint": "State development vs validation."},
    "5 Source of data": {"keywords": ["cohort", "data_source"], "manual": False,
                         "hint": "Eligibility, dates, centers, consecutive sampling."},
    "6 Follow-up": {"keywords": ["followup"], "manual": False, "hint": "Ascertainment window."},
    "7 Outcome": {"keywords": ["outcome_definition"], "manual": False,
                  "hint": "Definition, blinding, ascertainment method."},
    "8 Predictors": {"keywords": ["predictors", "spline_predictors"], "manual": False,
                     "hint": "Definitions, units, timing."},
    "9 Sample size": {"keywords": ["epv", "sample_size"], "manual": False,
                      "hint": "EPV reasoning; how sample size was arrived at."},
    "10 Missing data": {"keywords": ["m_imputation", "missing"], "manual": False,
                        "hint": "Amounts, mechanism, imputation method."},
    "11 Statistical analysis": {"keywords": ["binary_pipeline", "cox_pipeline",
                                             "linear_pipeline", "bootstrap_validation"],
                                "manual": False, "hint": "Model form, validation, metrics."},
    "12 Risk groups": {"keywords": ["thresholds"], "manual": False,
                       "hint": "Pre-specified thresholds or none."},
    "13-25 Results": {"keywords": ["bootstrap_validation", "calibration", "brier",
                                   "decision_curve"], "manual": False,
                      "hint": "Performance with CIs; calibration; DCA."},
    "26 Discussion/limitations": {"keywords": [], "manual": True,
                                  "hint": "Specific limitations, incl. no external validation."},
    "27 Data/code availability": {"keywords": ["environment"], "manual": False,
                                  "hint": "Decision trace + pipeline code + versions."},
    # Radiology (RSNA) submission requirements — always manual follow-ups.
    "R1 Figure format (Radiology)": {"keywords": [], "manual": True,
                                     "hint": "Figures as 300-dpi TIF/EPS/AI/PSD; PNG not accepted."},
    "R2 Figure assembly (Radiology)": {"keywords": [], "manual": True,
                                       "hint": "New submissions: one Word doc, one figure per page, legend after each; max 4 panels (a-d)."},
    "R3 Figure limits (Radiology)": {"keywords": [], "manual": True,
                                     "hint": "Confirm figure/table count against the article-type limit (e.g., Radiology: AI — 6 figures, 4 tables)."},
}


@dataclass
class TripodReport:
    covered: list[str]
    manual_follow_ups: list[str]
    missing: list[str]

    def to_text(self) -> str:
        lines = ["TRIPOD+AI coverage report", "=" * 40]
        lines += [f"Covered by trace ({len(self.covered)}):"] + [f"  - {c}" for c in self.covered]
        lines += [f"Manual follow-up required ({len(self.manual_follow_ups)}):"]
        lines += [f"  - {m}" for m in self.manual_follow_ups]
        if self.missing:
            lines += [f"MISSING from trace ({len(self.missing)}):"] + [f"  - {m}" for m in self.missing]
        return "\n".join(lines)


def check(trace_path: str | Path) -> TripodReport:
    """Assess TRIPOD+AI coverage of a saved decision trace."""
    trace = json.loads(Path(trace_path).read_text(encoding="utf-8"))
    decisions_blob = json.dumps(trace.get("decisions", [])).lower()

    covered, missing, manual = [], [], []
    for item, spec in CHECKLIST.items():
        if spec["manual"]:
            manual.append(f"{item} — {spec['hint']}")
        elif any(kw in decisions_blob for kw in spec["keywords"]):
            covered.append(item)
        else:
            missing.append(f"{item} — {spec['hint']}")
    return TripodReport(covered=covered, manual_follow_ups=manual, missing=missing)
