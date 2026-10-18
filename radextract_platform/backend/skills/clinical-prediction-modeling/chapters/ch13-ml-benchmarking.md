# Ch 13 — ML Benchmarking: Boosting, Forests, and Fair Comparison

**Source basis:** Kuhn & Johnson APM (entire book); ESL ch10, ch15, ch17; ISLP ch8; TRIPOD+AI.

## The fair-comparison protocol

Every candidate model (penalized logistic baseline, RF, gradient boosting) must:
1. See the **same training resamples** and the **same out-of-bag/fold patients**;
2. Have hyperparameters tuned **inside the training fold only** (nested CV, ch11);
3. Receive the **same imputed, encoded data** — or, better, be wrapped in the same pipeline so preprocessing is fit per fold;
4. Be compared with **paired** differences and percentile intervals (ch11, ch12).

## Baselines first

Always include a penalized logistic regression with splines (ch06, ch10). If boosting beats it by 0.01 AUC with overlapping CIs, the honest conclusion is "no detectable difference" — and the interpretable model wins on other grounds. A well-specified ~16-parameter clinical model is exactly the baseline an ML model must beat.

## Models

- **Gradient boosting (XGBoost/LightGBM):** strong tabular default. Tune: learning rate, tree depth (2–4 for clinical data), subsampling, regularization. Early stopping needs a validation fold *inside* the training data.
- **Random forests:** robust, little tuning; report number of trees and mtry.
- **Neural nets:** rarely justified under n≈1,000 tabular clinical data; if used, justify and pre-register the architecture.

## Monotonicity and constraints

Clinical knowledge says risk should move monotonically with a predictor (e.g., age, NWU). XGBoost/LightGBM support monotone constraints — use them when knowledge is firm, and log the constraint in the trace. This is often where ML earns its keep over unconstrained splines in very large n.

## Feature selection inside folds

Any filter (univariate screen, variance threshold, top-N by importance) is fit per training fold. Selection on the full dataset is leakage (ch11) and the most common ML-vs-regression comparison error in the literature.

## Reporting

- Tuning grid and search strategy (log to trace).
- Per-model performance with CIs; paired differences vs the regression baseline.
- Compute cost (fitting time matters for deployment).
- If ML wins: interpretability analysis (ch14) before claiming adoption.

## Steyerberg's counterpoint (ch13, ch18.5)

- His default is **parsimony with external grounding**: a full model with pre-specified predictors, splines, and shrinkage is a strong, transparent baseline that ML must beat — and in clinical tabular data of typical size, it often does or ties.
- **Transparency as a selection criterion**: proprietary ML models that cannot disclose coefficients or generalizability assessment conflict with clinical reporting norms (his ch18.5 remark, and ch15 here). When performance ties, the transparent model wins by default.
- ML earns its place through **demonstrated net benefit** (ch12), not novelty — benchmark, then decide with the decision curve.

## Anti-patterns

- Comparing tuned XGBoost against untuned logistic.
- Reporting the best fold instead of the pooled estimate.
- One-hot encoding high-cardinality variables into thousands of columns for trees without regularization.
- SMOTE/oversampling applied before the split (distorts calibration, ch02).
- Presenting a benchmark on one dataset as "XGBoost is better than regression".
