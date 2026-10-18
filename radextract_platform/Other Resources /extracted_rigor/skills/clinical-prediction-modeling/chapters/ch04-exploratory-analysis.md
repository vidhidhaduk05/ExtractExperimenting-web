# Ch 4 — Exploratory Analysis and Pre-Specification

**Source basis:** Harrell RMS ch4–5; Kuhn & Johnson APM ch3–4; FE&S ch4.

## Purpose and discipline

EDA in a prediction study has one job: inform *pre-specified* modeling decisions (transforms, knots, encoding) without becoming a fishing expedition. Decisions made during EDA go in the decision trace with the reason; anything discovered post hoc and then "confirmed" on the same data is exploratory — label it.

## What to always look at

- **Distributions of every predictor:** skew (consider log transform for lab values like glucose), impossible values (data-entry errors), heaping (times rounded to 5-minute intervals), and sparse categories.
- **Predictor vs outcome:** empirical plots (e.g., loess of outcome vs predictor) to check direction and rough shape — this is how you choose spline knots (ch06).
- **Missingness patterns:** pairwise co-occurrence of missing values (are glucose and time-to-imaging missing together?).
- **Predictor intercorrelation:** collinearity flags for the trace; highly correlated imaging measures may need collapsing.

## Baseline table

Report median [IQR] and n (%) in the baseline table. Compare across groups for description, but do not present P-values from baseline comparisons in randomized/explanatory contexts as if they were inference.

## Pre-specification list (write before modeling)

1. Candidate predictors and their expected directions
2. Which continuous predictors get splines and how many knots
3. Encoding of categoricals; collapsing rules for sparse levels
4. Missing-data plan (ch03)
5. Primary outcome definition and cut points
6. Validation design and primary performance metric

## Anti-patterns

- Choosing predictors by univariate P-values (ignores confounding and multivariable effects).
- Winsorizing/normalizing after seeing the results.
- Presenting dozens of unplanned subgroup tests as findings.
- Letting the test set participate in any EDA-informed choice.
