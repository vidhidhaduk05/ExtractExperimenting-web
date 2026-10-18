# Ch 12 — Performance Metrics: Discrimination, Calibration, Clinical Utility

**Source basis:** Harrell RMS ch10; TRIPOD+AI; Vickers & Elkin (decision curves).

## Discrimination

- **AUC/C-statistic** with percentile CIs from the validation resamples (ch11). An interval crossing 0.5 is the honest way to report "no signal".
- **Paired AUC differences** within replicates, with percentile intervals and percentile-based P values. Never compare AUCs from different patient sets.

## Calibration

- **Calibration-in-the-large:** mean predicted vs observed event rate (intercept).
- **Calibration slope:** regression of outcome on the logit of predicted risk; 1 = perfect, <1 = overfit. Report slopes even when they indicate overfitting — reviewers can trust a paper that says "some overfitting" more than one claiming perfection.
- Plot observed vs predicted by decile/risk group. A model with good AUC and slope <1 ranks well but overestimates extremes — clinically different conclusions.

## Overall accuracy

- **Brier score** (and its paired difference between models, out-of-bag). This is the honest quantification of "associated but not predictive": a predictor can carry a significant adjusted OR while changing the Brier score negligibly. Report both facts side by side.

## Clinical utility

- **Decision curve analysis:** net benefit across threshold probabilities vs treat-all/treat-none. Report the plausible threshold range for the intended decision (ch01). Placing DCA in a supplement is acceptable, but state the threshold range examined.

## Steyerberg's evaluation structure (ch15–16)

- His ch15 organizes performance into three families — **explained variance** (R², Brier), **discrimination** (AUC/C), **calibration** (calibration-in-the-large, slope) — and insists all three be reported; his ch16 adds **clinical usefulness** (net benefit, decision curves) as the fourth. The reporting template below is exactly this structure.
- **R² family**: Nagelkerke R² for model-strength comparison across studies; out-of-bag R² for honest prediction claims (ch09).
- **Discrimination vs calibration asymmetry**: discrimination is a property of the *ranking* and transfers better across settings; calibration is a property of the *predictions* and degrades with case-mix shift — which is why ch18's updating starts with calibration.
- **Clinical usefulness** (ch16): net benefit at the intended decision threshold, against treat-all/treat-none, is the metric that answers "should this model be used" — the others answer "is it statistically respectable".

## Explained variance

For continuous outcomes: out-of-bag R² with CI, for nested predictor sets. This is the cleanest way to show a predictor set adds nothing.

## Reporting template (per model)

Discrimination (AUC, CI) → calibration (intercept, slope, plot) → Brier → DCA at stated thresholds → paired differences vs comparator. All from the same validation replicates.

## Anti-patterns

- AUC as the only metric.
- Calibration plots without a slope/intercept number.
- Comparing models on metrics computed in different patients.
- Reporting net benefit without the treat-all/treat-none references.
- Claiming clinical utility from discrimination alone.
