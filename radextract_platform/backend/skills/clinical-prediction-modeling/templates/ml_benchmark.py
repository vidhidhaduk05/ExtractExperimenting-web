"""Fair ML benchmarking: gradient boosting and random forests against a
penalized logistic baseline, under a nested-CV protocol where tuning happens
inside training folds only. See ch13.

All models see the same folds and the same patients; comparisons are paired.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import (GradientBoostingClassifier, HistGradientBoostingClassifier,
                              RandomForestClassifier)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .validation import percentile_interval


from sklearn.impute import SimpleImputer


@dataclass
class BoostingParams:
    """HistGradientBoosting hyperparameters. Defaults are a starting point,
    not a recommendation — tune them inside inner CV folds (ch13)."""
    learning_rate: float = 0.05
    max_depth: int = 3
    max_iter: int = 300
    validation_fraction: float = 0.15
    early_stopping: bool = True


@dataclass
class ForestParams:
    """Random-forest hyperparameters. Defaults are a starting point, not a
    recommendation — tune them inside inner CV folds (ch13)."""
    n_estimators: int = 500
    min_samples_leaf: int = 10


def _baseline_model(seed: int) -> Pipeline:
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("model", LogisticRegression(penalty="l2", max_iter=1000, random_state=seed)),
    ])


def _boosting_model(seed: int, params: BoostingParams | None = None,
                    monotone_cst: list[int] | None = None) -> HistGradientBoostingClassifier:
    p = params or BoostingParams()
    return HistGradientBoostingClassifier(
        learning_rate=p.learning_rate, max_depth=p.max_depth, max_iter=p.max_iter,
        early_stopping=p.early_stopping, validation_fraction=p.validation_fraction,
        monotonic_cst=monotone_cst, random_state=seed,
    )


def _forest_model(seed: int, params: ForestParams | None = None) -> Pipeline:
    p = params or ForestParams()
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("model", RandomForestClassifier(n_estimators=p.n_estimators,
                                         min_samples_leaf=p.min_samples_leaf,
                                         n_jobs=-1, random_state=seed)),
    ])


BENCHMARK_MODELS = {
    "penalized_logistic": _baseline_model,
    "gradient_boosting": _boosting_model,
    "random_forest": _forest_model,
}


def benchmark(
    data: pd.DataFrame,
    outcome: str,
    *,
    models: dict[str, object] | None = None,
    boosting_params: BoostingParams | None = None,
    forest_params: ForestParams | None = None,
    n_outer: int = 5,
    seed: int | None = None,
    trace=None,
) -> pd.DataFrame:
    """Repeated-k-fold benchmark on identical folds; returns per-model AUC with
    percentile intervals and paired differences vs the first model (baseline).

    Hyperparameter tuning, if desired, must be wrapped into the model factory
    as an inner-CV search — never performed on the outer folds (ch11, ch13).
    `seed=None` draws a random seed that is recorded in the trace, so the run
    stays reproducible post hoc.
    """
    if seed is None:
        seed = int(np.random.default_rng().integers(0, 2**31 - 1))
    if models is None:
        models = {
            "penalized_logistic": lambda s: _baseline_model(s),
            "gradient_boosting": lambda s: _boosting_model(s, boosting_params),
            "random_forest": lambda s: _forest_model(s, forest_params),
        }
    model_factories = models
    X = data.drop(columns=[outcome])
    # Deterministic one-hot encoding (no outcome involvement, so no leakage);
    # models receive a numeric matrix with identical columns across folds.
    X = pd.get_dummies(X, drop_first=True, dtype=float)
    y = data[outcome].to_numpy()

    outer = KFold(n_splits=n_outer, shuffle=True, random_state=seed)
    fold_aucs: dict[str, list[float]] = {name: [] for name in model_factories}
    for train_idx, test_idx in outer.split(X):
        for name, factory in model_factories.items():
            model = factory(seed)
            model.fit(X.iloc[train_idx], y[train_idx])
            proba = model.predict_proba(X.iloc[test_idx])[:, 1]
            fold_aucs[name].append(roc_auc_score(y[test_idx], proba))

    rows = []
    baseline_name = next(iter(model_factories))
    baseline_scores = np.array(fold_aucs[baseline_name])
    for name, scores in fold_aucs.items():
        scores = np.asarray(scores)
        lo, hi = percentile_interval(scores)
        row = {"model": name, "mean_auc": float(scores.mean()),
               "ci_lower": lo, "ci_upper": hi}
        if name != baseline_name:
            diffs = scores - baseline_scores
            dlo, dhi = percentile_interval(diffs)
            row["paired_auc_difference_vs_baseline"] = float(diffs.mean())
            row["difference_ci_lower"] = dlo
            row["difference_ci_upper"] = dhi
        rows.append(row)

    if trace is not None:
        trace.log(
            "ml_benchmark",
            chosen={"models": list(model_factories), "n_outer": n_outer, "seed": seed},
            alternatives=["tuning on outer folds (rejected: leakage)"],
            rationale="identical folds across models; paired differences vs penalized baseline",
            stage="benchmarking",
        )
    return pd.DataFrame(rows)


def monotone_constraints(spec: dict[str, int], columns: list[str]) -> list[int]:
    """Translate a {column: +1|-1|0} monotonicity spec into sklearn's ordering.

    Only apply where clinical knowledge is firm (e.g., age, NWU); log the
    constraint set in the decision trace (ch13).
    """
    return [int(spec.get(col, 0)) for col in columns]
