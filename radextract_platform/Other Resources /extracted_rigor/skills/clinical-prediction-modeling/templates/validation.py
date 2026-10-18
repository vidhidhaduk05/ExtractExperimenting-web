"""Full-pipeline bootstrap validation with out-of-bag evaluation, following
Harrell (RMS ch5) and Steyerberg & Harrell (J Clin Epidemiol 2016).

The caller supplies `fit` and `evaluate` callables; this module handles the
resampling, out-of-bag bookkeeping, paired comparisons, and percentile
intervals. Everything the pipeline does (imputation, derivation, feature
selection, tuning) happens inside `fit`, which is what makes the estimate
honest.

Usage:
    result = bootstrap_validate(
        data, fit=fit_pipeline, evaluate=score_pipeline, n_replicates=400,
        seed=2024, trace=trace,
    )
    result.summary()          # point estimate + percentile interval
    result.paired_difference(result_other)  # same-patients comparison
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.stats import norm


@dataclass
class BootstrapResult:
    metric_name: str
    oob_values: np.ndarray          # per-replicate metric on out-of-bag patients
    apparent: float                 # metric on the full-sample fit
    n_replicates: int
    seed: int
    per_replicate: list = field(default_factory=list)  # caller-defined extras

    def summary(self, level: float = 0.95) -> dict[str, float]:
        lo, hi = percentile_interval(self.oob_values, level)
        return {
            "metric": self.metric_name,
            "oob_mean": float(np.mean(self.oob_values)),
            "ci_lower": lo,
            "ci_upper": hi,
            "apparent": self.apparent,
            "optimism": self.apparent - float(np.mean(self.oob_values)),
            "n_replicates": self.n_replicates,
        }

    def paired_difference(self, other: "BootstrapResult", level: float = 0.95) -> dict[str, float]:
        """Paired difference (self - other) using the same replicates and patients."""
        if self.n_replicates != other.n_replicates:
            raise ValueError("paired comparison requires the same number of replicates")
        diffs = self.oob_values - other.oob_values
        lo, hi = percentile_interval(diffs, level)
        stat, p = _percentile_p(diffs)
        return {
            "mean_difference": float(np.mean(diffs)),
            "ci_lower": lo,
            "ci_upper": hi,
            "p_value": p,
            "n_replicates": self.n_replicates,
        }


def percentile_interval(values: np.ndarray, level: float = 0.95) -> tuple[float, float]:
    alpha = (1.0 - level) / 2.0
    lo, hi = np.percentile(values, [100 * alpha, 100 * (1.0 - alpha)])
    return float(lo), float(hi)


def _percentile_p(diffs: np.ndarray) -> tuple[float, float]:
    """Two-sided percentile-based P value for a bootstrap distribution."""
    centered = diffs - np.mean(diffs)
    z = abs(np.mean(diffs)) / (np.std(centered, ddof=1) / np.sqrt(len(diffs)))
    return float(2 * norm.sf(z)), float(z)


def bootstrap_validate(
    data: pd.DataFrame,
    *,
    fit: Callable[[pd.DataFrame], object],
    evaluate: Callable[[object, pd.DataFrame], float],
    metric_name: str = "metric",
    n_replicates: int = 400,
    seed: int | None = None,
    keep_fits: bool = False,
    trace=None,
) -> BootstrapResult:
    """Refit the complete pipeline in each resample; evaluate on out-of-bag patients.

    `fit(data_resample)` returns a fitted pipeline object.
    `evaluate(fitted_pipeline, data_oob)` returns one scalar metric computed on
    the out-of-bag patients only.

    `seed=None` draws a random seed that is recorded on the result and in the
    trace, so the run stays reproducible post hoc. `keep_fits=True` retains
    every refitted pipeline in `per_replicate` (memory-heavy; only needed for
    per-replicate extras such as ROC bands).
    """
    if seed is None:
        seed = int(np.random.default_rng().integers(0, 2**31 - 1))
    rng = np.random.default_rng(seed)
    n = len(data)
    full_fit = fit(data)
    apparent = float(evaluate(full_fit, data))

    oob_values = np.empty(n_replicates)
    extras: list = []
    for b in range(n_replicates):
        idx = rng.integers(0, n, size=n)
        in_bag = np.zeros(n, dtype=bool)
        in_bag[idx] = True
        oob = data.loc[~in_bag]
        attempts = 0
        while len(oob) < 10 and attempts < 10:  # pathological resample; redraw
            idx = rng.integers(0, n, size=n)
            in_bag = np.zeros(n, dtype=bool)
            in_bag[idx] = True
            oob = data.loc[~in_bag]
            attempts += 1
        if len(oob) < 10:
            raise RuntimeError(
                "could not draw a resample with >=10 out-of-bag patients; "
                "the dataset may be too small for bootstrap validation")
        fitted = fit(data.iloc[idx])
        oob_values[b] = evaluate(fitted, oob)
        if keep_fits:
            extras.append(fitted)

    result = BootstrapResult(
        metric_name=metric_name,
        oob_values=oob_values,
        apparent=apparent,
        n_replicates=n_replicates,
        seed=seed,
        per_replicate=extras,
    )
    if trace is not None:
        trace.log(
            "bootstrap_validation",
            chosen={"metric": metric_name, "n_replicates": n_replicates, "seed": seed},
            alternatives=["single train/test split (rejected: wastes data at this n)",
                          "apparent performance (rejected: optimistic)"],
            rationale="full-pipeline refit per resample; OOB evaluation; paired comparisons valid",
            stage="validation",
        )
    return result


def nested_cv(
    data: pd.DataFrame,
    *,
    make_model: Callable[[], object],
    param_grid: dict,
    outcome: str = "y",
    scoring: str | None = None,
    stratified: bool = False,
    fit_params: dict | None = None,
    n_outer: int = 5,
    n_inner: int = 3,
    seed: int | None = None,
) -> dict[str, float]:
    """Nested cross-validation: outer folds estimate performance, inner folds tune.

    `make_model()` returns a fresh sklearn-compatible estimator;
    `param_grid` is passed to GridSearchCV inside each outer training fold.
    `outcome` names the outcome column (never hard-coded); `scoring` is the
    sklearn scoring string used for BOTH tuning and evaluation — set it
    explicitly (e.g. "roc_auc"); the sklearn default is accuracy, which is
    usually wrong for clinical prediction. `stratified=True` uses stratified
    folds for imbalanced binary outcomes.
    """
    from sklearn.model_selection import GridSearchCV, KFold, StratifiedKFold
    from sklearn.base import clone

    if outcome not in data.columns:
        raise KeyError(f"outcome column {outcome!r} not in data")
    if seed is None:
        seed = int(np.random.default_rng().integers(0, 2**31 - 1))

    X = data.drop(columns=[outcome])
    y = data[outcome]
    outer = (StratifiedKFold(n_splits=n_outer, shuffle=True, random_state=seed)
             if stratified else
             KFold(n_splits=n_outer, shuffle=True, random_state=seed))
    scores = []
    for train_idx, test_idx in outer.split(X, y):
        inner = (StratifiedKFold(n_splits=n_inner, shuffle=True, random_state=seed)
                 if stratified else
                 KFold(n_splits=n_inner, shuffle=True, random_state=seed))
        search = GridSearchCV(make_model(), param_grid, cv=inner, n_jobs=-1,
                              scoring=scoring)
        search.fit(X.iloc[train_idx], y.iloc[train_idx])
        model = clone(make_model()).set_params(**search.best_params_)
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        scores.append(float(model.score(X.iloc[test_idx], y.iloc[test_idx])))
    scores = np.asarray(scores)
    lo, hi = percentile_interval(scores)
    return {"mean_score": float(scores.mean()), "ci_lower": lo, "ci_upper": hi,
            "fold_scores": scores.tolist(), "seed": seed}
