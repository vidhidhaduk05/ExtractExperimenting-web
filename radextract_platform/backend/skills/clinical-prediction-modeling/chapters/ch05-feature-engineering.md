# Ch 5 — Feature Engineering and Categorical Encoding

**Source basis:** Kuhn & Johnson, *Feature Engineering and Selection*; *Applied Predictive Modeling* ch5–7; Harrell RMS.

## Principles

- Engineer from domain knowledge first; data-driven transforms second. A stroke modeler knows NIHSS is ordinal and skewed, glucose is right-skewed, and ASPECTS is bounded 0–10 — encode that, don't discover it.
- Every transform is a pipeline step: fit on training resamples, apply unchanged to evaluation patients. A scaler or target encoder fit on the full dataset leaks (ch11).
- Prefer interpretable engineered features over opaque automatic ones in clinical models — reviewers and clinicians must be able to read the model.

## Categorical predictors

- **Ordinal with meaningful spacing** (NIHSS bands, mRS): consider integer coding or splines on the score; check the linearity assumption rather than defaulting to dummy variables.
- **Nominal:** one-hot (dummy) coding; set the reference level deliberately (clinically meaningful, not the smallest group).
- **Sparse levels** (<~5% prevalence): collapse to "other" — pre-specify the rule, log it.
- **High-cardinality** (center IDs, ICD codes): target/likelihood encoding *inside folds*, or mixed models / random effects for center (ch09). Never target-encode on the full dataset.

## Continuous predictors

- Skewed positive variables (volumes, times, lab values): log or Box-Cox; splines (ch06) as the flexible default when n allows.
- Units and bounds: document them; a "0–100%" variable that exceeds 1 is a data error, not an outlier to trim.
- Ratios and derived scores (e.g., rCBF ratios, NWU): derive after imputation of components (ch03).

## Interactions

- Pre-specify clinically motivated interactions (e.g., age × severity, time × reperfusion); test exploratory interactions explicitly labeled as such.
- In ML models, trees find interactions automatically — but report them (ch14) rather than letting them hide.

## Dimension reduction

- PCA for correlated imaging features; keep components interpretable or accept the opacity trade-off and say so.
- Collapsing correlated predictors into a pre-specified composite (e.g., core volume + rCBF) beats silent PCA when interpretability matters.

## Anti-patterns

- Fitting encoders/scalers before the resample split.
- Dummy-coding an ordinal scale and losing the ordering.
- Data-driven binning of continuous variables (dichotomization destroys information — Harrell's most repeated warning).
- Target leakage through engineered features computed using outcome information (e.g., "change relative to outcome mean").
