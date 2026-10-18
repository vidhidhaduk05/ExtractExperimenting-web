# Glossary

**ALE (accumulated local effects)** — Model-agnostic effect plot robust to correlated predictors, unlike PDP (ch14).

**ANCOVA** — Linear model of an outcome (often a change score) adjusted for its baseline value; guards against regression-to-the-mean (ch09).

**Apparent performance** — Model evaluated on its own training data; always optimistic, never a result (ch11).

**AUC / C-statistic** — Probability a model ranks a random case above a random control; discrimination only, says nothing about calibration (ch12).

**Barnard–Rubin df** — Small-sample degrees of freedom for pooled MI intervals (ch03).

**Brier score** — Mean squared error of probabilistic predictions; decomposes into discrimination + calibration (ch12).

**Calibration-in-the-large** — Mean predicted risk vs observed event rate; intercept 0 = perfect (ch12).

**Calibration slope** — Regression of outcome on logit of predicted risk; 1 = perfect, <1 = overfitting (ch12).

**Competing risks** — When one event (death) precludes another (recurrence); needs Fine–Gray or cause-specific hazards (ch08).

**Decision curve analysis (DCA)** — Net benefit of acting on the model across threshold probabilities vs treat-all/treat-none (ch12).

**Decision trace** — Structured JSON log of every modeling decision, alternatives, rationale, and software versions (ch15).

**Discrimination** — Ability to rank cases above controls (AUC/C-index); distinct from calibration (ch12).

**EPV (events per variable)** — Event count divided by candidate parameters (not variables); ≥10–20 desired (ch02).

**Excess progression** — Generic term for a residual phenotype: the residual of a follow-up increment on a spline of the baseline measurement; orthogonal to the baseline by construction (ch06).

**Full-pipeline bootstrap** — Resampling patients and refitting imputation, derivation, and model inside every resample; out-of-bag evaluation (ch11).

**IPCW** — Inverse-probability-of-censoring weights; used for time-dependent Brier scores (ch08).

**Marginal standardization** — Averaging model-based counterfactual predictions over the cohort to get adjusted risks/risk differences (ch07).

**MICE** — Multiple imputation by chained equations; one conditional model per incomplete variable (ch03).

**MNAR / MAR / MCAR** — Missingness mechanisms; MAR (explained by observed data) is the usual MI working assumption (ch03).

**Monotone constraint** — Boosting constraint forcing predictions to move in one direction with a predictor; encodes firm clinical knowledge (ch13).

**NWU (net water uptake)** — CT-derived ischemic edema measure; serial NWU change is a common stroke edema phenotype (ch17).

**Optimism** — Apparent minus out-of-sample performance; estimated by bootstrap (ch11).

**Out-of-bag (OOB)** — Patients not in a bootstrap resample; the honest evaluation set for that replicate (ch11).

**PDP (partial dependence)** — Marginal model-agnostic effect plot; misleading under strong predictor correlation (ch14).

**Percentile interval** — CI from percentiles of the bootstrap distribution; preferred over normal approximations (ch11).

**Predictive mean matching** — MICE method imputing from observed donors with similar predicted means; robust for skewed variables (ch03).

**Restricted cubic spline (RCS)** — Cubic spline linear beyond boundary knots; k knots = k−1 parameters (ch06).

**Rubin's rules** — Pooling estimates across m imputed datasets: total variance = W + (1+1/m)B (ch03).

**SHAP** — Shapley-additive attribution; additive feature contributions with consistency guarantees; not causal effects (ch14).

**Shrinkage factor** — 1 − df/apparent chi-square; diagnostic for needed penalization (ch10).

**TRIPOD+AI** — 27-item reporting guideline for prediction model studies, superseding TRIPOD 2015 (ch15).

**Internal-external validation** — Train in some centers, test in held-out centers; tests transportability (ch11).
