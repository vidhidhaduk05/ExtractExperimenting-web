# Change Log — clinical-prediction-modeling hardening pass (2026-09-26)

Scope: bug fixes + parameterization + regression tests (agreed). Every fix below
is mapped to the regression test that fails on the pre-fix code and passes on
the post-fix code. Full smoke suite (`tests/test_smoke.py`) also passes.

## Correctness bugs fixed

| # | File | Bug | Fix | Regression test |
|---|------|-----|-----|-----------------|
| 1 | `templates/imputation.py` | The m "imputed datasets" were identical copies of one frame (chained equations overwrote a single frame in place). Rubin's rules on identical estimates give zero between-imputation variance → silently too-narrow CIs. | m independently chained datasets, each with its own stochastic draws. | `test_mice_datasets_are_distinct` |
| 2 | `templates/imputation.py` | `transform()` imputed from the *evaluation data's own* median/mode (leakage) and discarded all fitted models. | `transform()`/`transform_all()` apply training-fitted models and training donor pools only; PMM for continuous, seeded draws for categorical. | `test_transform_uses_training_statistics_only` |
| 3 | `templates/imputation.py` | Categorical chained-equation path crashed (`np.nanmean` over strings). | Mode-agreement convergence metric for categorical variables. | `test_categorical_imputation_runs` |
| 4 | `templates/binary.py` | Per-imputation models fit with dataset-specific knots but predictions applied dataset-1's knots to all; default prediction used model #1 only. | Knots computed once at fit time and reused everywhere; `predict_proba` pools across all m models (Rubin's rules for predictions); design matrices aligned to training columns by name (statsmodels predicts positionally). | `test_binary_pipeline_knots_and_pooling` |
| 5 | `templates/validation.py` | `nested_cv` hard-coded the outcome column name `"y"`. | `outcome`, `scoring`, and `stratified` are explicit parameters; missing outcome column raises a clear KeyError. | `test_nested_cv_custom_outcome_column` |
| 6 | `templates/decision_trace.py` | `DecisionTrace` crashed at construction if any core package was not installed. | Tolerant version lookup (`"not installed"`). | `test_decision_trace_missing_package` |

## Parameterization (hard-coded values removed or named)

- `templates/ml_benchmark.py`: boosting/forest hyperparameters exposed as
  `BoostingParams` / `ForestParams` dataclasses (documented as starting points,
  not recommendations); `seed=None` now draws a random seed **recorded in the
  trace** so runs are reproducible post hoc (was fixed `2024`).
  Test: `test_benchmark_seed_is_recorded`.
- `templates/validation.py`: `bootstrap_validate` records the realized seed
  (fixes `seed or -1` falsy-zero bug); `keep_fits=False` default stops
  retaining 400 refitted pipelines in memory; OOB redraw loop with a clear
  error for datasets too small to bootstrap.
- `templates/figures.py`: `save_final()` no longer uses `bbox_inches="tight"` —
  the exported TIFF/PDF keeps the exact Radiology column width (3.35 / 7.0 in).
  Test: `test_save_final_preserves_column_width`. Panel-label margins fixed for
  multi-panel figures.
- `templates/survival.py`, `templates/continuous.py`: fit-time knots and
  training fills stored on returned `CoxPipeline` / `LinearPipeline` objects
  (both backward-compatible: unpack / index like the old tuple/list), so
  out-of-bag designs never recompute knots on evaluation data.
- `templates/splines.py`: new shared `compute_knots()` / `build_design()` —
  single source of truth for design construction across all three pipelines.
- `templates/method_advisor.py`: literature thresholds named as module
  constants (`EPV_ADEQUATE=10`, `EPV_COMFORTABLE=20`,
  `BOOTSTRAP_N_THRESHOLD=1000`); `or`/`and` precedence made explicit.
- `templates/metrics.py`: `calibration()` returns NaN with a warning for
  single-class outcomes instead of crashing.

## Package hygiene

- Removed stale `__pycache__/` (including corrupt `.pyc.<numbers>` files) from
  the package.
- SKILL.md metadata corrected: 20 chapters (was 19), 13 modules (was 11),
  revision note added.

## Approval Gate defaults recorded (all delegated — execute when data arrives)

Outcome, cohort, sample size, missingness, validation, predictors/splines,
model selection, and thresholds were all deferred to data-driven defaults:
Riley/pmsampsize with EPV≥10 fallback; MICE inside resamples if any predictor
>5% missing or outcome-associated; full-pipeline bootstrap (nested CV if
tuning enters); 4-knot RCS with LR-test linear fallback inside resamples;
penalized regression primary (ML benchmark only if n≥~1000 and ≥~100 events);
DCA across the plausible range without arbitrary cutpoints. Each executed
default is logged to the DecisionTrace with alternatives and rationale.
Without an external cohort, all results are flagged **discovery-only**.

## Verification

- `python tests/test_smoke.py` — all smoke tests pass.
- `python tests/test_regressions.py` — all 8 regression tests pass on the
  fixed code and fail on the original code (verified per test).
