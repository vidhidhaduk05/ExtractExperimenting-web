"""Performance metrics for prediction models, all designed to be computed on
out-of-bag or held-out patients: AUC with percentile intervals, paired AUC
differences, calibration (intercept + slope), Brier score, and decision curve
analysis. See ch12.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.metrics import roc_auc_score


def auc_with_ci(y_true: np.ndarray, y_score: np.ndarray, level: float = 0.95,
                n_bootstrap: int = 2000, seed: int | None = None) -> dict[str, float]:
    """AUC with a patient-level bootstrap percentile interval."""
    y_true = np.asarray(y_true)
    y_score = np.asarray(y_score)
    point = float(roc_auc_score(y_true, y_score))
    rng = np.random.default_rng(seed)
    n = len(y_true)
    boot = np.empty(n_bootstrap)
    for b in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        yb, sb = y_true[idx], y_score[idx]
        if len(np.unique(yb)) < 2:
            boot[b] = np.nan
        else:
            boot[b] = roc_auc_score(yb, sb)
    boot = boot[~np.isnan(boot)]
    alpha = (1.0 - level) / 2.0
    lo, hi = np.percentile(boot, [100 * alpha, 100 * (1 - alpha)])
    return {"auc": point, "ci_lower": float(lo), "ci_upper": float(hi)}


def paired_auc_difference(y_true: np.ndarray, scores_a: np.ndarray, scores_b: np.ndarray,
                          level: float = 0.95, n_bootstrap: int = 2000,
                          seed: int | None = None) -> dict[str, float]:
    """Paired AUC difference (A - B) with percentile interval; same patients."""
    y_true = np.asarray(y_true)
    a = np.asarray(scores_a)
    b = np.asarray(scores_b)
    rng = np.random.default_rng(seed)
    n = len(y_true)
    diffs = np.empty(n_bootstrap)
    for i in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        yb, ab, bb = y_true[idx], a[idx], b[idx]
        if len(np.unique(yb)) < 2:
            diffs[i] = np.nan
        else:
            diffs[i] = roc_auc_score(yb, ab) - roc_auc_score(yb, bb)
    diffs = diffs[~np.isnan(diffs)]
    alpha = (1.0 - level) / 2.0
    lo, hi = np.percentile(diffs, [100 * alpha, 100 * (1 - alpha)])
    z = abs(np.mean(diffs)) / (np.std(diffs, ddof=1) / np.sqrt(len(diffs)))
    return {
        "mean_difference": float(np.mean(diffs)),
        "ci_lower": float(lo),
        "ci_upper": float(hi),
        "p_value": float(2 * norm.sf(z)),
    }


def calibration(y_true: np.ndarray, y_prob: np.ndarray) -> dict[str, float]:
    """Calibration-in-the-large (intercept) and calibration slope.

    Logistic regression of the outcome on the logit of predicted risk:
    slope 1 = perfect; slope < 1 = overfitting (predictions too extreme).
    """
    import statsmodels.api as sm

    y_true = np.asarray(y_true, dtype=float)
    if len(np.unique(y_true)) < 2:
        import warnings
        warnings.warn("calibration is undefined for a single-class outcome; "
                      "returning NaN", stacklevel=2)
        return {"calibration_intercept": float("nan"),
                "calibration_slope": float("nan")}
    eps = 1e-9
    logit = np.log((np.asarray(y_prob) + eps) / (1 - np.asarray(y_prob) + eps))
    citl = sm.Logit(y_true, np.ones(len(y_true))).fit(disp=0)
    full = sm.Logit(y_true, sm.add_constant(logit)).fit(disp=0)
    return {
        "calibration_intercept": float(citl.params[0]),
        "calibration_slope": float(full.params[1]),
    }


def brier_score(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Mean squared error of probabilistic predictions."""
    y_true = np.asarray(y_true, dtype=float)
    return float(np.mean((np.asarray(y_prob) - y_true) ** 2))


def decision_curve(y_true: np.ndarray, y_prob: np.ndarray,
                   thresholds: np.ndarray | None = None) -> pd.DataFrame:
    """Net benefit across threshold probabilities (Vickers & Elkin 2006).

    Net benefit = (TP - FP * t / (1 - t)) / n, compared against treat-all and
    treat-none strategies. Interpret within the clinically plausible threshold
    range only.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob)
    if thresholds is None:
        thresholds = np.arange(0.01, 0.99, 0.01)
    n = len(y_true)
    rows = []
    prevalence = y_true.mean()
    for t in thresholds:
        predicted_positive = y_prob >= t
        tp = float(np.sum(predicted_positive & (y_true == 1)))
        fp = float(np.sum(predicted_positive & (y_true == 0)))
        nb_model = (tp - fp * t / (1 - t)) / n
        nb_all = prevalence - (1 - prevalence) * t / (1 - t)
        rows.append({"threshold": t, "net_benefit_model": nb_model,
                     "net_benefit_treat_all": nb_all, "net_benefit_treat_none": 0.0})
    return pd.DataFrame(rows)


def oob_r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Out-of-sample R-squared (1 - MSE / variance of outcome)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    return 1.0 - ss_res / ss_tot
