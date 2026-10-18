# Ch 18 — Model Updating for a New Setting

**Source basis:** Steyerberg, *Clinical Prediction Models* 2nd ed., ch19–20 (part III).

## Why updating

A model developed in one setting (time, place, case mix) rarely transfers perfectly. Validation may reveal several **patterns of invalidity** (ch19): poor calibration-in-the-large (systematic over/under-prediction), miscalibration slope (predictions too extreme or too weak), or poor discrimination. **Detection of calibration-in-the-large problems has top priority** — miscalibration can cause systematically wrong decisions (negative net benefit) even when discrimination is fine.

## The updating hierarchy (8 methods, ordered by parameters estimated)

For a previously developed model with its original coefficients:

1. **No updating** — apply the original model unchanged. The reference; any updating must beat this.
2. **Update intercept** — fix the original linear predictor as an offset, re-estimate only the intercept. Corrects calibration-in-the-large (1 parameter).
3. **Recalibration: intercept + overall calibration slope** — regress the outcome on the original linear predictor alone ("logistic calibration"; 2 parameters).
4. **Recalibration + selective re-estimation** — method 3, then LR-test each predictor's effect for a *difference* from the original; re-estimate only significant deviations (2–9 parameters).
5. **Full re-estimation** — re-estimate all original coefficients in the new data (p parameters).
6–8. **Model extension** — methods 3–5 plus new candidate predictors, selectively or fully.

## Principles

- **Parsimony usually wins.** Re-estimating all coefficients in a small validation sample risks replacing reliable, slightly biased estimates with unbiased but very unreliable ones. Methods 2–3 (1–2 parameters) are often sufficient and should be tried first.
- **Extensive revision needs large validation samples** — and even then, shrink or penalize the *differences* between updated and original coefficients.
- **Updating is a validation activity**: report the pattern of invalidity that motivated the update, the method chosen, and the post-update performance (calibration and discrimination) in the same patients.
- The same hierarchy applies to survival models (update baseline hazard first, then slope, then coefficients).

## Python implementation sketch

Recalibration is two parameters and needs no special machinery: compute the original linear predictor, fit `statsmodels` Logit/OLS of the outcome on it (intercept-only with offset for method 2; single covariate for method 3). Log the chosen method and the pre/post calibration metrics in the decision trace.

## Anti-patterns

- Refitting from scratch in the new setting and calling it "updating" (that's a new development study — ch01).
- Updating after looking at test performance without reporting the pre-update pattern.
- Full re-estimation in a small validation sample without penalization.
- Treating a decision rule (fixed cutoff) as if it were a prediction model (ch19).
