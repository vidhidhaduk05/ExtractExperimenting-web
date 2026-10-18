# Ch 9 — Continuous Outcomes: Linear Models, ANCOVA, and Mixed Models

**Source basis:** Harrell RMS ch7, ch14.

## Linear models with splines

Continuous outcomes (volume change, biomarker increments, severity-score deltas): linear model with RCS for key continuous predictors (ch06). Report out-of-bag R² (ch11) rather than in-sample R².

**Nested model comparison:** likelihood ratio test for spline vs linear, and for added predictors. The cleanest way to show a predictor set adds nothing is the out-of-bag R² comparison: baseline predictor alone vs baseline + the rest, with CIs on both and their difference. If the interval on the R² difference covers zero, say "no detectable contribution" — that is a publishable, decision-relevant finding.

## ANCOVA for change outcomes

When comparing groups on a change score, adjust for the baseline value (ANCOVA) rather than analyzing change alone — regression to the mean otherwise biases group contrasts. A typical adjustment set: baseline measure, age, severity score, lesion volume, center.

## Repeated measures: mixed models

Two measurements per patient (baseline, follow-up): a linear mixed model of outcome on time, group, and time×group with a random intercept per patient is **algebraically a difference-in-differences** on the increment — it does not estimate trajectory *shape*. State this limitation explicitly when it applies. With ≥3 measurements, random slopes become estimable and trajectory shape questions open up.

- Random intercept: accounts for within-patient correlation.
- Random slope: allows individual trajectories to vary — only with enough timepoints.
- Report the covariance structure choice in the trace.

## Assumption checks

Residual diagnostics (QQ plot, fitted-vs-residual), heteroscedasticity (robust/HC standard errors if needed), influential points (dfbeta). For skewed positive outcomes, model on the log scale and back-transform with care (differences become ratios).

## Reporting template

Estimate per unit (or per percentile contrast) with CI and P; R² out-of-bag for prediction claims; LR tests for nested comparisons; the exact covariate set and random-effects structure.

## Anti-patterns

- In-sample R² as a prediction claim.
- Change-score models without baseline adjustment.
- Over-interpreting a two-timepoint mixed model as "trajectory analysis".
- Log-transforming without saying how CIs were back-transformed.
