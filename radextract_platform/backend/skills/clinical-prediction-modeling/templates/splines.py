"""Restricted cubic spline (RCS) basis, following Harrell's Regression Modeling
Strategies. The basis is linear beyond the boundary knots, so extrapolation is
benign. Knots are placed at fixed quantiles of the predictor.

The design matrix produced here plugs into any linear-model interface
(statsmodels OLS/Logit, sklearn LinearRegression, lifelines CoxPHFitter).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

_KNOT_QUANTILES = {
    3: [0.10, 0.50, 0.90],
    4: [0.05, 0.35, 0.65, 0.95],
    5: [0.05, 0.275, 0.50, 0.725, 0.95],
}


def knot_quantiles(x: np.ndarray, n_knots: int) -> np.ndarray:
    """Harrell's default knot placement at fixed quantiles."""
    if n_knots not in _KNOT_QUANTILES:
        raise ValueError(f"n_knots must be one of {sorted(_KNOT_QUANTILES)}, got {n_knots}")
    return np.quantile(x, _KNOT_QUANTILES[n_knots])


def rcs_basis(x: np.ndarray, knots: np.ndarray) -> dict[str, np.ndarray]:
    """Restricted cubic spline basis columns (excluding the linear term).

    Returns a dict of column name -> values, names following Harrell's
    convention (x', x'', x'''). The caller prepends the raw `x` column.
    """
    x = np.asarray(x, dtype=float)
    k = len(knots)
    if k < 3:
        raise ValueError("RCS requires at least 3 knots")
    denom = (knots[-1] - knots[0]) ** 2
    columns: dict[str, np.ndarray] = {}
    primes = ["", "''", "'''", "''''"]
    for j in range(k - 2):
        # Harrell RMS eq. 2.24
        term = (
            _cube(x - knots[j])
            - _cube(x - knots[k - 2]) * (knots[k - 1] - knots[j]) / (knots[k - 1] - knots[k - 2])
            + _cube(x - knots[k - 1]) * (knots[k - 2] - knots[j]) / (knots[k - 1] - knots[k - 2])
        )
        columns[f"rcs{primes[j + 1]}"] = term / denom
    return columns


def _cube(v: np.ndarray) -> np.ndarray:
    return np.where(v > 0, v**3, 0.0)


def rcs_design(x: np.ndarray, n_knots: int = 4, *, name: str = "x") -> pd.DataFrame:
    """Full RCS design columns for one predictor: linear term + nonlinear terms.

    Knots are computed from the passed data — use only for the training fit.
    For evaluation data, use rcs_design_with_knots with the stored training knots.
    """
    knots = knot_quantiles(np.asarray(x, dtype=float), n_knots)
    return rcs_design_with_knots(x, knots, name=name)


def rcs_design_with_knots(x: np.ndarray, knots: np.ndarray, *, name: str = "x") -> pd.DataFrame:
    """RCS design columns using pre-specified knots (fit-time knots reused at
    evaluation time — recomputing them on new data is leakage)."""
    x = np.asarray(x, dtype=float)
    design = pd.DataFrame({name: x})
    for col, values in rcs_basis(x, np.asarray(knots, dtype=float)).items():
        design[f"{name}{col[3:] if col.startswith('rcs') else col}"] = values
    design.attrs["knots"] = list(knots)
    return design


def likelihood_ratio_test(ll_full: float, ll_reduced: float, df: int) -> tuple[float, float]:
    """LR statistic and chi-square p-value for nested models."""
    from scipy.stats import chi2

    stat = 2.0 * (ll_full - ll_reduced)
    return stat, float(chi2.sf(stat, df))


# ---------------------------------------------------------------------------
# Shared design-matrix builder used by the binary, survival, and continuous
# pipelines. Knots are computed ONCE from the training data and reused for
# every imputed dataset and every evaluation call — recomputing knots per
# dataset (or on evaluation data) silently misaligns the spline basis.
# ---------------------------------------------------------------------------

def compute_knots(data: pd.DataFrame, spline_predictors: dict[str, int]) -> dict[str, np.ndarray]:
    """Knot placement per splined predictor, from the (training) data passed."""
    return {predictor: knot_quantiles(data[predictor].to_numpy(dtype=float), n_knots)
            for predictor, n_knots in spline_predictors.items()}


def build_design(data: pd.DataFrame, *, spline_predictors: dict[str, int],
                 knots: dict[str, np.ndarray],
                 linear_continuous: list[str],
                 categorical: list[str]) -> pd.DataFrame:
    """Design matrix with stored knots (never recompute them here)."""
    parts = []
    for predictor, _n_knots in spline_predictors.items():
        parts.append(rcs_design_with_knots(
            data[predictor].to_numpy(dtype=float), knots[predictor], name=predictor))
    for predictor in linear_continuous:
        parts.append(pd.DataFrame({predictor: data[predictor].to_numpy(dtype=float)}))
    if categorical:
        parts.append(pd.get_dummies(data[categorical], drop_first=True, dtype=float))
    return pd.concat(parts, axis=1)
