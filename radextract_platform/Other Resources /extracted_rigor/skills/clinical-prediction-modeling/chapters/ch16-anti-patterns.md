# Ch 17 — Anti-Patterns Catalog

**Source basis:** all sources; Harrell's warnings, APM's pitfalls, TRIPOD+AI's rationale, Molnar's caveats.

## Data handling

- **Pre-resample leakage:** imputing, scaling, encoding, or feature-selecting on the full dataset before validation splits (ch03, ch11).
- **Silent complete-case filtering:** dropping records without reporting who and how they differ (ch03).
- **Imputing derived quantities** (change scores, residuals, indices) instead of components (ch03).
- **Dichotomizing continuous predictors** — discards information, biases estimates, and hides nonlinearity (ch05, ch06).

## Modeling

- **Temporal leakage (the decision-point mismatch):** using a predictor unavailable at the question's decision point — e.g., selecting the CTP map by mTICI and presenting the model as pretreatment, or conditioning model inputs on a post-decision variable while labeling the model pretreatment. The model answers a different, later question; no validation design repairs it. Run the Temporal-Alignment Lock before modeling (ch21); post-decision information belongs only in labeled oracle/sensitivity models or a separate later-decision-point aim.
- **Undeclared decision point:** building a "prediction model" without stating when and where it would be used, so predictor availability cannot be audited (ch21).
- **Stepwise selection:** biased SEs, unstable sets, optimistic fit (ch10).
- **Untested linearity:** imposing linear terms without spline comparison (ch06).
- **Apparent performance as a result:** in-sample AUC/R² presented as model performance (ch11).
- **Tuning on evaluation data:** hyperparameters chosen on the test set or outer folds (ch13).
- **Ignoring the PH assumption** after significant Schoenfeld tests (ch08).
- **Censoring deaths in competing-risk settings** (ch08).
- **Change-score models without baseline adjustment** (ch09).

## Inference and interpretation

- **ORs narrated as risk changes** (ch07).
- **Association language drifting into causal claims** (ch01).
- **"Significant" OR paired with a null Brier difference, reported as predictive value** — report both and let the reader see the gap (ch12).
- **Median-split inference** presented as the primary analysis (ch07).
- **SHAP/importance read as causal effects** (ch14).

## Reporting

- **Methods written from memory** without a decision trace (ch15).
- **Post hoc choices unlabeled:** every exploratory pivot must be labeled exploratory (ch04).
- **Selective metric reporting:** AUC without calibration, or without the comparator's paired difference (ch12).
- **"External validation" of a model refit on the validation data** (ch01, ch11).
- **No discovery-only label** when validation was internal only (ch11).

## Meta

- **Choosing the number of knots / penalty / model by which yields the smaller P-value** — selection on the estimand (ch06, ch10).
- **Benchmarking tuned ML against untuned regression** and generalizing (ch13).
- **Reporting the best of several validation designs post hoc** (ch11).
