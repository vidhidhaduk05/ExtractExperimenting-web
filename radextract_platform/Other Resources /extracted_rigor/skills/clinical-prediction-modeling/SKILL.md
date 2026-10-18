---
name: clinical-prediction-modeling
description: "Methodology and code skill for developing, validating, and reporting clinical prediction models in Python. Covers missing data, restricted cubic splines, logistic/survival/continuous outcomes, penalization, bootstrap and out-of-bag validation, calibration, decision curves, ML benchmarking, interpretability, and TRIPOD+AI reporting. Built from Harrell (Regression Modeling Strategies), Kuhn & Johnson (Applied Predictive Modeling), ISLP, ESL, van Buuren (FIMD), Molnar (Interpretable ML), Kuhn & Johnson (Feature Engineering and Selection), and TRIPOD+AI. Use when building or reviewing any clinical prediction, prognostic, or association model, especially in stroke research."
---

# Clinical Prediction Modeling

Methodology distilled from the canonical sources, with runnable Python templates that enforce the methods. Every analysis emits a **decision trace** — a structured log of choices, thresholds, and rationale — so statistical decisions are auditable at publication time.

**Language policy: Python only.** All code generated under this skill is Python (numpy/pandas/scikit-learn/statsmodels/lifelines ecosystem). R packages (e.g., `rms`, `mice`) may be cited in prose as the canonical reference implementation, but never generate R code.

## Approval Gate (mandatory)

Before deciding any of the following, present the options with tradeoffs and **wait for the user's approval** — do not proceed on assumption:

- **Validation design** — bootstrap vs nested CV vs held-out split vs external validation (ch02, ch11)
- **Imputation strategy** — MICE vs complete-case as a bias decision; m, handling inside resamples (ch03)
- **Spline and feature choices** — knots, which predictors get splines, interactions, transforms (ch05, ch06)
- **Model selection** — penalized regression vs ML, and the benchmarking protocol (ch10, ch13)
- **Risk thresholds and risk groups** — any cutpoint used for reporting or decision curves (ch12)
- **External-validation claims** — never describe a result as externally validated without an approved external cohort

Routine execution (preprocessing, standard pipeline code, plotting, table generation) proceeds without asking. Every gate decision, once approved, is logged in the decision trace with the alternatives considered.

## Core Frameworks

**1. The full-pipeline bootstrap (Harrell).** Any performance estimate that ignores model-building steps is optimistic. Resample patients with replacement, refit the *entire* pipeline (imputation → feature selection → spline fitting → model) inside every resample, evaluate on the out-of-bag patients. Never impute once on the full dataset before resampling. → ch11, templates/validation.py

**2. Imputation is part of the model (van Buuren, Harrell).** Missing data handled by multiple imputation by chained equations (MICE). For prediction: impute inside every resample, apply the training imputation to out-of-bag patients. For inference: m≥20 imputed datasets with posterior draws, pool by Rubin's rules. Complete-case analysis is a bias decision, not a default — report who is excluded and how they differ. → ch03, templates/imputation.py

**3. Continuous predictors get splines by default (Harrell).** Linearity is an assumption to be tested, not imposed. Restricted cubic splines (4–5 knots; 4 df default) for predictors with enough support; keep a linear fallback when the spline is indistinguishable (report the LR test). → ch06, templates/splines.py

**4. Discrimination ≠ calibration ≠ utility.** Report all three: AUC (with percentile CIs from the same bootstrap), calibration slope/intercept and Brier score, and decision-curve analysis for net benefit at plausible thresholds. A model can rank well and still mislead at the bedside. → ch12, templates/metrics.py

**5. Penalize before you select (Harrell, ESL).** In small-n/high-p settings, shrinkage (ridge, lasso, elastic net) beats stepwise selection, which is biased and unstable. If using ML (boosting, RF), tune hyperparameters inside CV folds and compare against a penalized regression baseline on the same folds with paired tests. → ch10, ch13, templates/ml_benchmark.py

**6. Feature selection happens inside folds. Any threshold, filter, or top-N rule computed on the full dataset leaks. → ch13**

**7. Every decision is logged.** Each template call appends to a JSON decision trace: the choice, the alternatives considered, the rationale, the software versions. The trace is the audit trail for the TRIPOD+AI checklist. → ch15, templates/decision_trace.py

**8. Association ≠ prediction ≠ causation.** State which question is being asked. Adjusted ORs from an inferential model answer association; out-of-bag AUC answers prediction; neither answers causation. → ch01

**9. Temporal alignment is a design lock, not advice (ch21).** Every question declares a **decision point** — the moment and setting at which the model would be used. The predictor set is restricted to variables available strictly before that point; derived quantities inherit the latest input time. Before any modeling, run the Temporal-Alignment Lock: inventory each candidate predictor's availability time, write the forbidden list, and audit the model spec against it — including conditional structures (a model whose inputs change based on a post-decision variable such as mTICI is a post-decision model, whatever its label). Post-decision information appears only in labeled oracle/sensitivity models or as a separate aim with its own later decision point. A model that violates its lock is invalid regardless of performance. Enforced by `templates/prompt_generator.py` (`TemporalLeakError`); logged in the decision trace. → ch21

**10. Advisory AI proposes; humans decide.** The Jev method advisor (templates/method_advisor.py) returns calibrated, typed proposals for design choices from analysis metadata only. Proposals are logged in the decision trace with their probability and the human's final decision — never applied autonomously, never a substitute for computed statistics. → ch15, templates/method_advisor.py

## Chapter Index

| Chapter | File | Topic |
|---|---|---|
| Study types & lifecycle | ch01-study-types-lifecycle.md | Development vs validation, target population, intended use |
| Sample size & splitting | ch02-sample-size-splitting.md | EPV, when to split vs bootstrap, Riley criteria |
| Missing data | ch03-missing-data.md | MICE, Rubin's rules, MI inside resampling |
| Exploratory analysis | ch04-exploratory-analysis.md | Distributions, pre-specification, tables |
| Feature engineering | ch05-feature-engineering.md | Encoding, transforms, interactions |
| Splines & nonlinearity | ch06-splines-nonlinearity.md | RCS, knots, linearity testing, residual phenotyping |
| Binary outcomes | ch07-binary-outcomes.md | Logistic regression, ORs, standardization |
| Survival outcomes | ch08-survival-outcomes.md | Cox, PH tests, time-dependent AUC |
| Continuous outcomes | ch09-continuous-outcomes.md | Linear models, ANCOVA, mixed models |
| Penalization | ch10-penalization.md | Ridge, lasso, elastic net, shrinkage |
| Validation | ch11-validation-bootstrap.md | Bootstrap, out-of-bag, nested CV, external |
| Performance metrics | ch12-performance-metrics.md | AUC, calibration, Brier, decision curves |
| ML benchmarking | ch13-ml-benchmarking.md | Boosting, RF, fair comparison protocol |
| Interpretability | ch14-interpretability.md | Permutation, SHAP, partial dependence |
| Reporting & traceability | ch15-reporting-traceability.md | TRIPOD+AI, decision traces |
| Anti-patterns | ch16-anti-patterns.md | What to avoid and why |
| Stroke domain notes | ch17-stroke-domain.md | NIHSS, mRS, ASPECTS, stroke-specific pitfalls |
| Model updating | ch18-model-updating.md | Recalibration, revision, extension hierarchy |
| Presenting models | ch19-presenting-models.md | Formats, absolute risk, decision rules |
| Radiology submission | ch20-radiology-submission.md | RSNA figure specs, TRIPOD+AI checklist, script organization |
| Methodology prompt generation | ch21-methodology-prompt-generation.md | Frozen explicit analysis prompts; Temporal-Alignment Lock |

## Topic Index

- **AUC** → ch11, ch12
- **ANCOVA** → ch09
- **Bootstrap, out-of-bag** → ch11, ch12
- **Brier score** → ch12
- **Calibration** → ch12
- **Cox model** → ch08
- **Decision curve analysis** → ch12
- **Elastic net** → ch10
- **Feature selection** → ch05, ch13
- **Gradient boosting** → ch13
- **Imputation, multiple** → ch03
- **Knots (RCS)** → ch06
- **Marginal standardization** → ch07
- **Mixed models** → ch09
- **NIHSS / mRS / ASPECTS** → ch17
- **Net water uptake (NWU)** → ch17
- **Overfitting** → ch10, ch11
- **Permutation importance** → ch14
- **Residual phenotyping** → ch06
- **Restricted cubic splines** → ch06
- **Rubin's rules** → ch03
- **SHAP** → ch14
- **TRIPOD+AI** → ch01, ch15
- **Calibration-in-the-large** → ch12, ch18
- **Model updating** → ch18
- **Nomogram / score chart** → ch19
- **pmsampsize / Riley criteria** → ch02
- **Radiology / RSNA figures** → ch20, templates/figures.py
- **Validation, external** → ch11, ch18

## Templates (runnable code)

In `templates/` — import, don't copy-paste. All functions accept a `DecisionTrace` and log every choice.

- `decision_trace.py` — structured JSON audit log
- `imputation.py` — MICE inside resamples, Rubin's rules pooling
- `splines.py` — restricted cubic spline basis and linearity tests
- `validation.py` — full-pipeline bootstrap with out-of-bag evaluation, nested CV
- `metrics.py` — AUC with percentile CIs, paired AUC tests, calibration, Brier, decision curves
- `binary.py` — logistic pipeline with splines + MI + standardization
- `survival.py` — Cox pipeline with PH diagnostics
- `continuous.py` — linear/ANCOVA/mixed pipelines
- `ml_benchmark.py` — boosting/RF vs penalized regression, fair protocol
- `tripod_check.py` — TRIPOD+AI checklist generator from a decision trace
- `method_advisor.py` — Jev (TypeSafe) advisory proposals from metadata only; offline rule-based fallback; human decides
- `figures.py` — seaborn publication figures; PNG drafts + 300-dpi TIFF finals for Radiology, column sizing, panel limits
- `prompt_generator.py` — emits a frozen methodology prompt (ch21 template) from analysis metadata; runs the Temporal-Alignment Lock per question and raises `TemporalLeakError` on predictors unavailable at the declared decision point

## Methodology Prompt Generation

When asked to produce an analysis plan or kickoff prompt for an analyst/agent (e.g., a
re-analysis of a published study), use ch21: collect metadata (questions with decision
points, cohort, predictors with availability times, outcome definitions, centers,
journal), run the Temporal-Alignment Lock per question, then emit the frozen prompt via
`templates/prompt_generator.py` or the canonical template in ch21. The generated prompt
must always include the approval gate, the interpretation rules ("no detectable
difference" never "equivalent"; all signs preserved; unflattering results reported as
prominently as flattering ones), and the deliverables contract. See
`PROMPT_for_PI.md` for the PI-facing kickoff variant.

## Voice Calibration

Write like the sources: prescriptive, mechanism-first, honest about uncertainty. "Use X when Y" — never "it is worth noting that". Report the estimate, the interval, and what would change the conclusion. Flag discovery-only results as discovery-only.

## Metadata

- **Generated:** 2026-09-17; **Revised:** 2026-09-26 (hardening pass: MICE distinct-dataset and leakage fixes, fit-time knot sharing, pooled prediction, parameterized hyperparameters, regression suite); **Revised:** 2026-10-11 (ch21 added: methodology prompt generation and the Temporal-Alignment Lock — decision-point declaration, predictor-availability audit, forbidden lists, oracle-model labeling — enforced by templates/prompt_generator.py; motivated by a re-analysis in which a pretreatment prediction model was built on post-reperfusion variable selection)
- **Sources:** Steyerberg, *Clinical Prediction Models* (2nd ed., 2019); Harrell, *Regression Modeling Strategies* (2nd ed., 2015); Kuhn & Johnson, *Applied Predictive Modeling*; James/Hastie/Tibshirani/Witten, *ISL with Python* (2023); Hastie/Tibshirani/Friedman, *ESL* (2nd ed.); van Buuren, *Flexible Imputation of Missing Data*; Molnar, *Interpretable ML*; Kuhn & Johnson, *Feature Engineering and Selection*; TRIPOD+AI statement + expanded checklist (BMJ 2024).
- **Chapters:** 21 (on-demand, ~1,000 tokens each)
- **Templates:** 14 Python modules + smoke tests (`tests/test_smoke.py`) and regression tests (`tests/test_regressions.py`, one per correctness fix), all passing on synthetic data
- **Language:** Python only — no R code is generated under this skill
- **Submission target:** Radiology (RSNA) — figures via templates/figures.py (300-dpi TIFF finals), TRIPOD+AI checklist required
- **Approval gate:** ask-first for validation design, imputation, splines/features, model selection, thresholds, external-validation claims
- **License note:** synthesized methodology summaries, not source text. Derived in part from copyrighted books — keep this skill private.
