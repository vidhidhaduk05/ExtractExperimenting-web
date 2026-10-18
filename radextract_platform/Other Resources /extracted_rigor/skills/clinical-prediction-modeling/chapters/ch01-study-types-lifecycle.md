# Ch 1 — Study Types & the Prediction Model Lifecycle

**Source basis:** TRIPOD+AI (Collins et al., BMJ 2024); Steyerberg's framework as cited in Harrell RMS.

## The three study types

1. **Development study.** Fit a model, estimate its performance with internal validation (bootstrap or cross-validation — never apparent/in-sample performance).
2. **Validation study.** Evaluate an *existing, unchanged* model on new data. Internal-external validation: train in some centers, test in held-out centers.
3. **Update/extension study.** Recalibrate or refit an existing model on new data.

Label which one you are doing in the title and abstract. Mixing them (refitting during "validation") invalidates the label.

## Questions to answer before any modeling

- **Target population:** who exactly? (e.g., "adults with anterior-circulation LVO stroke treated with thrombectomy")
- **Intended use:** will the model inform a decision? Which one, at what threshold? A screening model needs high sensitivity; a triage model needs calibration across the risk range.
- **Predictor availability:** only predictors available *at the intended time of use*. A model using 24-hour imaging cannot guide admission decisions — post-treatment predictors define a different (later) decision point.
- **Outcome:** definition, ascertainment window, blinded adjudication. 90-day mRS must be dichotomized with a pre-specified cut (0–2 vs 3–6, 0–3 vs 4–6, death) — the cut defines the population the model applies to.

## The lifecycle (TRIPOD+AI)

Specify → data → predictors → outcome → analysis (missing data, model, validation) → performance (discrimination, calibration, utility) → report. Every stage generates decisions; the decision trace (templates/decision_trace.py) records them as they happen, not retrospectively.

## Association vs prediction

- **Association/etiology:** "is this predictor independently associated with the outcome?" — adjusted ORs, confounder control, Rubin-pooled inference. Overfitting matters less; causal language is forbidden without stronger designs.
- **Prediction:** "how well do admission variables rank patients by risk?" — out-of-bag AUC, calibration, Brier. Confounders are irrelevant; generalizability is everything.
- A variable can be strongly associated with an outcome and add nothing to prediction. When both claims appear in one paper, report the association estimate *and* the out-of-sample performance contribution (e.g., paired Brier difference) side by side — never let a significant OR stand in for predictive value.

## Study design (Steyerberg ch3)

- **Consecutive sampling** of eligible patients beats convenience samples; report eligibility, dates, and centers so the sampling frame is auditable.
- **Prospective-style discipline in retrospective data**: define predictors and outcome exactly as they would have been available at the intended time of use; blind outcome ascertainment to predictor values where adjudication exists.
- **Predictor availability timing** is a design constraint, not an afterthought — a predictor measured post-treatment defines a different decision point (ch01's availability rule).
- **Validation data need their own design attention**: a validation cohort should match the intended setting (case mix, predictor definitions, outcome ascertainment); mismatches produce the patterns of invalidity covered in ch18.

## Anti-patterns

- Calling apparent (in-sample) AUC "model performance".
- Building a "prediction model" but reporting only adjusted ORs.
- Using post-treatment variables in a model advertised for admission decisions.
- Retrospective outcome-based cohorts (enriched by follow-up) presented as prospective prediction tools — disclose the design.
