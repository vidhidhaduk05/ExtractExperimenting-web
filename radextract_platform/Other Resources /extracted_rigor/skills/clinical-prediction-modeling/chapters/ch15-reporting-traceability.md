# Ch 15 — Reporting and Traceability: TRIPOD+AI and the Decision Trace

**Source basis:** TRIPOD+AI (Collins et al., BMJ 2024) + expanded checklist.

## The decision trace

Every analysis emits a structured log as it runs (templates/decision_trace.py): each entry records
- the **decision** (e.g., "4-knot RCS on the exposure"),
- the **alternatives considered** (3 knots, linear),
- the **rationale** (LR test result, robustness checks),
- the **software versions** and the code path.

Written at decision time, the trace is the difference between "methods written from memory six months later" and an audit trail. At submission, run `tripod_check.py` to map trace entries onto the TRIPOD+AI checklist and expose gaps.

## TRIPOD+AI essentials (27 items, condensed)

- **Title/abstract:** identify the study as model development/validation, the population, the outcome.
- **Background/objectives:** intended use and users (ch01).
- **Source of data:** eligibility, dates, centers, consecutive sampling.
- **Outcome:** definition, ascertainment, blinding.
- **Predictors:** full definitions, units, timing of measurement — and disclosure of any retrospective quantification or post-treatment measurement.
- **Sample size:** EPV reasoning (ch02).
- **Missing data:** amounts, mechanism assumption, method (ch03).
- **Statistical analysis:** model form, splines, penalization, validation design, metrics (ch11–12).
- **Risk groups / thresholds:** pre-specified.
- **Results:** unadjusted and adjusted associations; model performance with CIs; calibration; DCA.
- **Discussion:** limitations stated specifically — retrospective design, absent external validation, restricted measurement timepoints, outcome-associated missingness, measurement-bias sources, cohort overlap, population scope are all standard candidates.
- **Data/code availability:** the decision trace and pipeline code are the deliverable.

## Reproducibility package

1. Decision trace (JSON) — every choice with rationale
2. Pipeline code (the templates, instantiated)
3. Environment file (package versions — the trace records them automatically)
4. Random seeds for every resample
5. The TRIPOD+AI checklist, filled from the trace

## Anti-patterns

- Writing methods from memory after the fact.
- "Standard methods were used" — name them, with parameters.
- Reporting the successful specification without the failed alternatives (the trace keeps them).
- No external validation and no discovery-only label.
- Suppressing the calibration plot because the AUC looked good.
