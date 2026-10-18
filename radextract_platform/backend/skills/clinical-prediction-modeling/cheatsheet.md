# Cheatsheet — Decision Tables

## Validation design

| Situation | Design |
|---|---|
| n < 1,000 or events < 100 | Full-pipeline bootstrap, OOB evaluation (B = 200–800) |
| n large, cheap model | Single held-out split + calibration on held-out |
| Multi-center | Internal-external (leave-one-center-out) |
| ML with tuning | Nested CV (tune inside outer-training folds only) |
| No external cohort | Label everything discovery-only |

## Missing data

| Situation | Action |
|---|---|
| <5% missing, MCAR plausible | MI anyway (cheap, safe); report amounts |
| 5–25% missing | MICE, m ≥ 20 for inference; include outcome |
| Outcome-associated missingness | MI mandatory; report completer comparison |
| MNAR suspected | MI + sensitivity analysis, stated |
| Derived target (residual/index) | Impute components, recompute derivation per dataset |

## Continuous predictor

| Situation | Action |
|---|---|
| Default, n allows | RCS, 4–5 knots (quantile placement) |
| EPV tight | RCS, 3 knots |
| Spline ≈ linear (LR ns, r > 0.98) | Linear acceptable; report the comparison |
| Firm monotone knowledge + big n | Boosting with monotone constraint |

## Model choice

| Situation | Action |
|---|---|
| EPV ≥ 20, few predictors | Unpenalized logistic/Cox with splines |
| EPV < 20 | Elastic net (λ inside folds) |
| Correlated predictors | Ridge/elastic net; never lasso alone |
| n ≥ several thousand, interactions suspected | Benchmark boosting vs penalized regression, paired |
| Interpretability required | Sparse penalized regression unless ML clearly wins |

## Metrics to report (all from same validation replicates)

| Metric | What it answers |
|---|---|
| AUC + percentile CI | Can it rank? |
| Paired ΔAUC + percentile CI | Is model A better than B? |
| Calibration intercept + slope | Are risks right? (<1 slope = overfit) |
| Brier + paired Δ | Overall accuracy; honest "adds nothing" check |
| Decision curve | Does acting on it help at plausible thresholds? |
| OOB R² (continuous) | How much variance out-of-sample? |

## Association reporting (binary)

| Quantity | Use |
|---|---|
| Adjusted OR (Rubin-pooled) | Inferential association, per natural unit |
| Adjusted risk difference (marginal standardization) | Communicable magnitude |
| Percentile contrasts of continuous exposure | Avoids median-split inference |
| LR test | Nested comparisons (spline vs linear, added predictors) |

## Red flags → chapters

| Red flag | Fix |
|---|---|
| Apparent AUC reported | ch11 |
| Imputation before split | ch03, ch11 |
| Stepwise selection | ch10 |
| OR narrated as % risk | ch07 |
| AUC-only reporting | ch12 |
| Tuned ML vs untuned regression | ch13 |
| SHAP on training data | ch14 |
| Post-treatment predictor in admission model | ch01 |
