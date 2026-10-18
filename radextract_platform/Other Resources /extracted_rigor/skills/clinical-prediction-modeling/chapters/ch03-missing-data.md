# Ch 3 — Missing Data: MICE, Rubin's Rules, and Imputation Inside Resampling

**Source basis:** van Buuren, *Flexible Imputation of Missing Data*; Harrell RMS ch3; Sterne et al. BMJ 2009.

## First: characterize the missingness

Before any imputation, report per-variable missingness and compare completers vs non-completers on the outcome. In stroke cohorts, missingness is routinely outcome-associated (sicker patients get fewer measurements) — e.g., workup times missing in ~20% of records, labs missing preferentially in the most severe presentations. A complete-case analysis is then a *selection decision*, not a neutral convenience: quantify who would be excluded and how they differ before accepting it.

- **MCAR:** missingness unrelated to anything — complete-case is unbiased but wasteful.
- **MAR:** missingness explained by observed data — MI is appropriate (the usual working assumption).
- **MNAR:** missingness depends on the unobserved value itself — MI needs sensitivity analysis; state the assumption.

## Multiple imputation by chained equations (MICE)

- One conditional imputation model per incomplete variable, cycled to convergence (burn-in), then m completed datasets (m ≥ 20 for inference; m ≈ percentage missing for estimation efficiency).
- Include the **outcome** in the imputation model (omitting it biases associations toward null). Include all analysis variables.
- Use predictive mean matching for skewed/continuous variables, logistic for binary, polyreg for categorical.
- Check convergence (trace plots of means/SDs across iterations) and plausibility of imputed values.

## Two distinct regimes — do not confuse them

**Prediction regime (performance estimation):** imputation is part of the pipeline. Fit the MICE on each bootstrap training resample; apply the *fitted* imputation models to the out-of-bag patients. Imputing once on the full data before resampling leaks information and overstates AUC.

**Inference regime (association models):** fit the model in each of m imputed datasets, pool with **Rubin's rules**:
- pooled estimate = mean of estimates
- within-variance = mean of variances
- between-variance = variance of estimates
- total variance = W + (1 + 1/m)·B; intervals use a t reference distribution with Barnard–Rubin df.

## Derived targets need care

When the analysis target is a *derived quantity* (a spline of a variable, a residual, a risk difference), impute the raw variables and recompute the derivation inside each imputed dataset — never impute the derived quantity. When the target is a residual of one measurement on another, fit that derivation inside each resample so patients do not contribute to constructing their own target.

## Steyerberg's perspective (ch7–8)

- **Quantify the problem before choosing machinery**: with <5% missing and few incomplete variables, the choice of method barely matters; with >25% or outcome-linked missingness, it dominates. Match effort to impact and say so.
- **Beware the historical defaults**: complete-case indicator ("missingness category") methods bias estimates when missingness is outcome-associated — the very case where they were popular. Modern practice is MICE or joint modeling.
- **Case-study discipline** (his ch8): run the imputation exercise on a case study with known structure first; check imputed distributions against observed ones before trusting the pooled analysis.
- **Imputation model ≠ analysis model** is acceptable (it must be *broader*, never narrower): more predictors, outcome included, auxiliary variables that predict missingness.

## Anti-patterns

- Single imputation (mean/median/mode) — understates uncertainty, distorts relationships.
- Imputing before train/test separation.
- Imputing a derived index (e.g., change score) instead of its components.
- Dropping records silently; reporting only "n = 626" without the missingness table.
- Using the outcome to select complete cases but not including it in the imputation model.
