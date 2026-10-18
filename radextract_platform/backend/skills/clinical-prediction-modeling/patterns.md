# Patterns (Techniques and Methods)

## Validation patterns

**Full-pipeline bootstrap** — For b in 1..B: resample patients → fit MICE → fit derivation steps → fit model → evaluate OOB. Paired comparisons within replicates. Use for n < ~1,000. (ch11, validation.py)

**Nested CV** — Outer folds estimate performance; inner folds tune. Mandatory for ML benchmarking. (ch11, ch13, ml_benchmark.py)

**Internal-external validation** — Leave-one-center-out training/testing for transportability. (ch11)

**Optimism correction** — Optimism = apparent − bootstrap performance; corrected = apparent − optimism. Alternative framing to OOB. (ch11)

## Missing-data patterns

**MI-inside-resampling** — Imputation models fit per training resample, applied to OOB. (ch03, imputation.py)

**Rubin pooling** — Fit per imputed dataset; pool estimates and variances; Barnard–Rubin df. (ch03, imputation.py)

**Rotation bootstrap over imputations** — Draw each bootstrap replicate from one of the m imputed datasets in rotation so imputation + sampling uncertainty both propagate into standardized-risk CIs. (ch03)

**Recompute derivations per imputation** — Splines/residuals/indices rebuilt inside each imputed dataset from imputed components. (ch03, ch06)

## Modeling patterns

**RCS with LR-test fallback** — 4–5 knots default; LR test vs linear; report how much the choice matters (R²/r difference). (ch06, splines.py)

**Residual phenotyping** — Define a derived phenotype as the residual of a later measurement increment on a spline of the baseline; check reparameterization when baseline + increment = follow-up. (ch06)

**Marginal standardization** — Counterfactual predictions averaged over the cohort for adjusted risks and risk differences. (ch07, binary.py)

**Penalize-don't-select** — Elastic net/ridge instead of stepwise; λ tuned inside folds. (ch10, ml_benchmark.py)

**Monotone boosting** — Gradient boosting with monotone constraints where clinical knowledge is firm. (ch13)

## Evaluation patterns

**Paired differences with percentile intervals** — Compare models on the same OOB patients within replicates. (ch11, ch12, metrics.py)

**Calibration trio** — Calibration-in-the-large + calibration slope + groupwise plot, always with AUC. (ch12, metrics.py)

**Decision curve analysis** — Net benefit vs threshold with treat-all/treat-none references. (ch12, metrics.py)

**Out-of-bag R²** — For continuous outcomes; the cleanest "does this predictor set add anything" test. (ch09, ch12)

## Interpretability patterns

**OOB permutation importance** — Importance computed on held-out data, distribution across resamples reported. (ch14)

**SHAP with caveats** — TreeExplainer summary + dependence plots; correlated-feature caveat stated. (ch14)

**Spline curves over PDPs** — When the model is a spline regression, plot the fitted curve with CIs instead of model-agnostic tools. (ch06, ch14)

## Process patterns

**Decision trace** — Every choice logged at decision time with alternatives, rationale, versions. (ch15, decision_trace.py)

**TRIPOD+AI mapping** — Trace entries mapped to checklist items at submission; gaps exposed. (ch15, tripod_check.py)

**Pre-specification list** — Predictors, transforms, knots, encoding, missing-data plan, outcome cuts, validation design written before modeling. (ch04)
