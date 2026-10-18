# Ch 7 — Binary Outcomes: Logistic Regression, ORs, and Standardized Risks

**Source basis:** Harrell RMS ch10; TRIPOD+AI.

## The workhorse

Logistic regression for binary outcomes (death, poor outcome mRS 3–6, symptomatic ICH). With splines (ch06), penalization when EPV is tight (ch10), and MI (ch03).

## Two languages: odds and risk

- **Adjusted OR** — the inferential quantity. Pool across imputed datasets with Rubin's rules (ch03). ORs exaggerate risk when the outcome is common; say so.
- **Adjusted absolute risk** — the communicable quantity. Use **marginal standardization**: predict each patient's risk under exposure and under no exposure (or at percentile positions of a continuous exposure), average over the cohort, difference = adjusted risk difference.
- Intervals for standardized risks must include imputation uncertainty — e.g., draw each bootstrap replicate from one of the m imputed datasets in rotation and take percentiles of the pooled replicate distribution, so imputation and sampling uncertainty both propagate.

## Continuous exposures

Keep the exposure continuous (ch06). Median splits are for *display only*. When sparse cells make a 2×2 stratified contrast unstable, prefer the direct within-stratum model contrast and flag the tabular ORs as secondary summaries.

## Model checking

- **Calibration** (ch12): calibration-in-the-large (intercept) and calibration slope; slopes <1 indicate overfitting — report them even when unflattering.
- **Functional form:** splines for continuous predictors; LR test spline vs linear.
- **Influential observations:** dfbeta inspection; report sensitivity analyses rather than deleting patients.

## Reporting template

For each association: adjusted OR (per natural unit) with 95% CI and P; adjusted risk difference at stated percentile contrasts; the covariate set; the imputation and pooling method; and which model is primary.

## Anti-patterns

- Reporting ORs as "risk increased X%".
- Dichotomizing the primary continuous exposure for inference.
- Standardizing risks without propagating imputation uncertainty.
- Selecting covariates by stepwise P-values instead of a pre-specified, clinically motivated set.
- Presenting the median-split table as the primary analysis.
