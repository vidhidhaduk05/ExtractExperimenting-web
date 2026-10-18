"""Methodology prompt generator with the Temporal-Alignment Lock.

Emits a frozen, explicit methodology prompt (ch21) from analysis metadata.
Every question must declare a decision point; candidate predictors are audited
against it before the prompt is produced. Violations raise TemporalLeakError.

Python only. Every artifact is logged to a DecisionTrace (templates/decision_trace.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field


class TemporalLeakError(ValueError):
    """A candidate predictor is not available at the question's decision point."""


@dataclass
class Question:
    text: str
    decision_point: str                      # e.g., "admission CT, before thrombectomy"
    candidate_predictors: list[str]
    allowed_predictors: list[str] = field(default_factory=list)
    forbidden_predictors: list[str] = field(default_factory=list)
    # availability map: predictor -> decision point at which it is available
    availability: dict[str, str] = field(default_factory=dict)
    oracle_model: bool = False               # post-decision info allowed, labeled not-for-use

    def run_temporal_lock(self, trace: "object | None" = None) -> None:
        """Audit candidate predictors against the declared decision point."""
        if not self.decision_point:
            raise TemporalLeakError("Every question must declare a decision point.")
        self.allowed_predictors, leaked = [], []
        for p in self.candidate_predictors:
            available_at = self.availability.get(p, "unknown")
            if available_at == "unknown":
                raise TemporalLeakError(
                    f"Predictor '{p}' has no recorded availability time; "
                    "inventory availability before modeling (ch21)."
                )
            if available_at <= self.decision_point:  # string comparison on ordered time labels
                self.allowed_predictors.append(p)
            else:
                leaked.append((p, available_at))
        if leaked:
            names = ", ".join(f"{p} (available {t})" for p, t in leaked)
            raise TemporalLeakError(
                f"Temporal leak: [{names}] are NOT available at the decision point "
                f"'{self.decision_point}'. Move them to the forbidden list, relabel the "
                "question with a later decision point, or run them only in a labeled "
                "oracle/sensitivity model."
            )
        if trace is not None:
            trace.log("temporal_alignment_lock", {
                "question": self.text,
                "decision_point": self.decision_point,
                "allowed": self.allowed_predictors,
                "forbidden": self.forbidden_predictors,
                "oracle_model": self.oracle_model,
            })


def build_methodology_prompt(
    cohort_description: str,
    questions: list[Question],
    target_journal: str = "Radiology",
    bootstrap_replicates: dict[str, int] | None = None,
    seed: int | None = None,
) -> str:
    """Emit the frozen methodology prompt (ch21 template) from metadata."""
    if bootstrap_replicates is None:
        bootstrap_replicates = {"continuous": 500, "binary": 200}

    qblocks = []
    for q in questions:
        q.run_temporal_lock()
        oracle = (
            "\n   A post-decision oracle/sensitivity model is permitted but must be "
            "labeled not-for-intended-use." if q.oracle_model else ""
        )
        qblocks.append(
            f"- {q.text}\n"
            f"  Decision point: {q.decision_point}.\n"
            f"  Allowed predictors: {', '.join(q.allowed_predictors)}.\n"
            f"  Forbidden predictors: {', '.join(q.forbidden_predictors) or '(none declared — declare explicitly)'}.{oracle}"
        )
    questions_block = "\n".join(qblocks)

    return f"""Reanalyze {cohort_description} to answer the following questions as rigorously as
current prediction-model methodology allows. Justify every methodological choice in
writing, separate design decisions made BEFORE seeing outcomes from choices made after,
and follow the interpretation rules at the end.

APPROVAL GATE
Present a frozen analysis plan (cohorts, imputation, splines/features, model forms,
validation design, metrics, primary comparisons) and WAIT for approval before
executing. Log every approved choice and its alternatives in a JSON decision trace.

QUESTIONS
{questions_block}

TEMPORAL-ALIGNMENT LOCK (per question)
Each question above declares a decision point with an audited allowed/forbidden
predictor list. Do not add any predictor that is unavailable at the decision point.
A model whose inputs change based on a post-decision variable is a post-decision
model regardless of its label; it may appear only as a labeled oracle/sensitivity
analysis or as a separate aim with its own later decision point.

SAMPLE SIZE AND FEASIBILITY
- Events per PARAMETER (spline = knots-1; k-level categorical = k-1); report EPV.
- Riley/pmsampsize criteria: shrinkage >= 0.9, optimism in Nagelkerke R² <= 0.05,
  intercept margin <= 0.1; reduce parameters if unmet; log the computation.
- Low-event subgroups: state what can/cannot be estimated; label exploratory.

MISSING DATA (default MICE inside every resample)
- Characterize missingness overall/by center; compare completers vs non-completers on
  the outcome; complete case is a selection decision, reported as sensitivity.
- m >= 20 datasets; outcome included in imputation models; fit inside every training
  resample; apply fitted models to out-of-bag patients; never impute once upfront.
- State the MAR assumption and its plausibility.

FUNCTIONAL FORM (splines by default, tested)
- Restricted cubic splines (4-5 knots) by default for continuous/ordinal predictors;
  keep linear only where an LR test shows no gain; report the test. Penalize or
  collapse correlated predictors.

OUTCOME MODELING
- Pre-specify the primary outcome cut; pre-specify ordinal/shift secondary models with
  assumption tests.

CENTER
- Per-center n, events, internal performance; pooled primary; center-covariate and
  hierarchical-pooling sensitivities.

VALIDATION DESIGN (mandatory)
A. Stratified full-pipeline out-of-bag bootstrap (>= {bootstrap_replicates.get('continuous')} replicates
   continuous outcomes, >= {bootstrap_replicates.get('binary')} binary; seed {seed if seed is not None else 'TBD'}):
   refit everything inside each resample; evaluate on out-of-bag patients; percentile
   intervals; ALL comparisons as paired differences on the same replicates;
   optimism-corrected framing for headline models.
B. Leave-one-center-out both directions with full refit; report AUC/Brier/calibration
   per direction with test-set n and events; label a two-center swap a transportability
   STRESS TEST, never external validation; discovery-only without an external cohort.
C. Three metric families on the same replicates: discrimination (AUC + paired
   differences), calibration (intercept, slope, decile plot — report overfitting
   honestly), Brier; plus decision curves (net benefit vs treat-all/treat-none across a
   stated plausible threshold range). For continuous outcomes: OOB R²/MAE/RMSE/bias
   with ALL signs preserved — never clip at zero or take absolute values.

DESIGN RULES (non-negotiable)
- Each model uses only predictors allowed by its temporal-alignment lock.
- No data-derived thresholds; supplemental sens/spec/PPV/NPV only at literature-
  precedented cut-points, cited.
- Pre-specified sensitivities: clinically indicated subgroup exclusions (e.g.,
  hemorrhagic transformation when NWU is densitometric), complete case vs MI,
  transformed volumes.
- Report unflattering results as prominently as flattering ones.

REPORTING STANDARDS
- TRIPOD+AI checklist from the decision trace; STROBE for the cohort.
- Name every perfusion/imaging measure explicitly; univariable/bivariable, not
  unimodal/multimodal; state outcome cuts in the abstract.
- Report replicate counts, hyperparameter distributions, seed, software versions.

DELIVERABLES
- Frozen approved plan; executed results with deviations flagged.
- Cohort flow with exact counts and per-variable missingness, overall and by center,
  plus completers-vs-non-completers comparison.
- Machine-readable CSV/JSON: bootstrap summaries, paired differences, center-held-out
  results, calibration, decision curves, hyperparameter traces, seed, versions.
- Figures: flow diagram, design schematic, outcome scatterplots (linear axes, identity
  line), ROC AND calibration plots, decision curves, center-held-out forest plot.
  300-dpi TIFF finals + PNG drafts at {target_journal} column widths; colorblind-safe
  palette; no interpretive annotations inside panels.
- An honest limitations section written by the analyst, unprompted.
"""


if __name__ == "__main__":
    # Smoke test: the NWU-CTP case that motivated the lock.
    availability = {
        "age": "admission CT", "NIHSS": "admission CT", "NWU": "admission CT",
        "rCBF<30% volume": "admission CT", "Tmax>6s volume": "admission CT",
        "mTICI": "post-procedure", "24h FIV": "24-hour follow-up",
    }
    q2 = Question(
        text="Pretreatment prediction of 90-day mRS 0-2 beyond age and NIHSS.",
        decision_point="admission CT",
        candidate_predictors=["age", "NIHSS", "NWU", "rCBF<30% volume",
                              "Tmax>6s volume", "mTICI", "24h FIV"],
        forbidden_predictors=["mTICI", "24h FIV"],
        availability=dict(availability),
        oracle_model=True,
    )
    try:
        q2.run_temporal_lock()
        print("UNEXPECTED: leak not caught")
    except TemporalLeakError as e:
        print("LOCK OK —", e)
