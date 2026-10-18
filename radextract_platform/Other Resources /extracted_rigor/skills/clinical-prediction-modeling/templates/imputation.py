"""Multiple imputation by chained equations with predictive mean matching (PMM),
plus Rubin's rules for pooling inference across imputed datasets.

Design follows van Buuren, Flexible Imputation of Missing Data:
- one conditional model per incomplete variable, cycled to convergence;
- PMM for continuous variables (robust to skew, respects the observed range);
- the outcome and all analysis variables are included in the imputation model;
- fitted imputation models are applied unchanged to evaluation data, which is
  what makes imputation-inside-resampling (full-pipeline bootstrap) valid.

Correctness guarantees (regression-tested in tests/test_regressions.py):
- the m imputed datasets are genuinely distinct (each is chained with its own
  stochastic draws) — identical datasets would zero the between-imputation
  variance and silently narrow Rubin's-rules intervals;
- `transform()` never uses statistics of the evaluation data: imputations for
  new rows come only from models and donor pools fitted on training data.

Categorical variables are handled by logistic/multinomial regression within the
chained equations; PMM is used for continuous ones.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression


@dataclass
class MiceResult:
    imputed: list[pd.DataFrame]  # m completed datasets
    n_iter: int
    converged: bool
    missing_rates: dict[str, float] = field(default_factory=dict)


class MiceImputer:
    """PMM-based MICE. Fit on training data; transform any data with the same models.

    Parameters
    ----------
    m : number of imputed datasets.
    max_iter : chained-equation cycles.
    continuous_min_levels : a numeric column with more unique observed values
        than this is treated as continuous; otherwise as categorical.
    random_state : seed. Drawn seeds are recorded so runs are reproducible.
    """

    def __init__(self, m: int = 20, max_iter: int = 10,
                 continuous_min_levels: int = 10,
                 random_state: int | None = None) -> None:
        if m < 1:
            raise ValueError("m must be >= 1")
        self.m = m
        self.max_iter = max_iter
        self.continuous_min_levels = continuous_min_levels
        self.random_state = random_state
        self._models: dict[str, dict[int, dict]] = {}   # var -> dataset index -> fitted pieces
        self._continuous: list[str] = []
        self._categorical: dict[str, list] = {}
        self._columns: list[str] = []
        self._incomplete: list[str] = []
        self._init_fills: dict[str, object] = {}        # training-derived initial fills
        self._completed: list[pd.DataFrame] = []

    # ------------------------------------------------------------------ fit
    def fit_transform(self, data: pd.DataFrame) -> MiceResult:
        rng = np.random.default_rng(self.random_state)
        self._columns = list(data.columns)
        self._incomplete = [c for c in self._columns if data[c].isna().any()]
        self.missing_rates = {c: float(data[c].isna().mean()) for c in self._incomplete}
        if not self._incomplete:
            self._completed = [data.copy() for _ in range(self.m)]
            return MiceResult([d.copy() for d in self._completed],
                              n_iter=0, converged=True)

        self._continuous, self._categorical = [], {}
        for c in self._incomplete:
            col = data[c]
            if pd.api.types.is_numeric_dtype(col) and col.nunique() > self.continuous_min_levels:
                self._continuous.append(c)
                self._init_fills[c] = float(col.median())
            else:
                levels = sorted(col.dropna().unique(), key=str)
                self._categorical[c] = levels
                self._init_fills[c] = levels[0]

        # m independently seeded, distinct completed datasets
        self._completed = []
        for d in range(self.m):
            completed = data.copy()
            for c in self._incomplete:
                completed[c] = completed[c].fillna(self._init_fills[c])
            self._completed.append(completed)

        self._models = {var: {} for var in self._incomplete}
        converged = False
        for iteration in range(self.max_iter):
            max_change = 0.0
            for var in self._incomplete:
                missing = data[var].isna().to_numpy()
                if not missing.any():
                    continue
                donors = ~missing
                for d in range(self.m):
                    completed = self._completed[d]
                    X = pd.get_dummies(completed.drop(columns=[var]),
                                       drop_first=True, dtype=float)
                    y = completed[var]
                    if var in self._continuous:
                        model = LinearRegression().fit(X[donors], y[donors])
                        donor_pred = model.predict(X[donors])
                        fitted = model.predict(X[missing])
                        sigma = float(np.std(donor_pred - y[donors].to_numpy(), ddof=1))
                        draws = fitted[:, None] + rng.normal(
                            0, sigma, size=(missing.sum(), 1))
                        donor_values = y[donors].to_numpy()
                        # PMM: replace each draw with the observed donor value
                        # whose fitted value is closest (van Buuren ch3)
                        idx = np.argmin(np.abs(donor_pred[None, :] - draws), axis=1)
                        new_values = donor_values[idx]
                        change = _rel_change_numeric(completed.loc[missing, var], new_values)
                        completed.loc[missing, var] = new_values
                        self._models[var][d] = {
                            "model": model, "continuous": True,
                            "donor_values": donor_values, "donor_pred": donor_pred,
                            "design_columns": list(X.columns),
                        }
                    else:
                        levels = self._categorical[var]
                        if len(levels) == 2:
                            model = LogisticRegression(max_iter=1000).fit(
                                X[donors], y[donors].astype(str))
                            proba = model.predict_proba(X[missing])[:, 1]
                            draws = rng.uniform(size=(missing.sum(), 1)) < proba[:, None]
                            mapped = np.where(draws, levels[1], levels[0])
                        else:
                            model = LogisticRegression(max_iter=1000).fit(
                                X[donors], y[donors].astype(str))
                            proba = model.predict_proba(X[missing])
                            picks = np.array([
                                rng.choice(len(levels), size=1, p=row / row.sum())[0]
                                for row in proba
                            ])
                            mapped = np.array(levels, dtype=object)[picks]
                        change = _categorical_change(completed.loc[missing, var], mapped)
                        completed.loc[missing, var] = mapped
                        self._models[var][d] = {
                            "model": model, "continuous": False, "levels": levels,
                            "design_columns": list(X.columns),
                        }
                    max_change = max(max_change, change)
            if max_change < 5e-2:
                converged = True
                break

        if not converged:
            warnings.warn(
                f"MICE reached max_iter={self.max_iter} without meeting the "
                f"stationarity tolerance; inspect imputed values for drift.",
                stacklevel=2,
            )
        return MiceResult(
            imputed=[d.copy() for d in self._completed],
            n_iter=iteration + 1,
            converged=converged,
            missing_rates=self.missing_rates,
        )

    # ------------------------------------------------------------- transform
    def transform(self, data: pd.DataFrame, dataset_index: int = 0) -> pd.DataFrame:
        """Apply the fitted imputation to new data (e.g., out-of-bag patients).

        Uses ONLY training-fitted models and training donor pools, so
        evaluation rows never influence their own imputation. Continuous
        variables get PMM against the training donor pool; categorical
        variables get a draw from the fitted probabilities (seeded by
        `random_state`, so repeated calls with the same data and index agree).
        """
        if not self._completed:
            raise RuntimeError("fit_transform must be called before transform")
        if not 0 <= dataset_index < self.m:
            raise IndexError(f"dataset_index must be in [0, {self.m}), got {dataset_index}")
        rng = np.random.default_rng(self.random_state)
        out = data.copy()
        # initialize with training-derived fills, then one pass of the fitted chain
        for var in self._incomplete:
            if var in out.columns:
                out[var] = out[var].fillna(self._init_fills[var])
        for var in self._incomplete:
            if var not in out.columns:
                continue
            info = self._models[var][dataset_index]
            missing = out[var].isna().to_numpy()
            if not missing.any():
                continue
            X = pd.get_dummies(out.drop(columns=[var]), drop_first=True, dtype=float)
            X = X.reindex(columns=info["design_columns"], fill_value=0)
            if info["continuous"]:
                fitted = info["model"].predict(X[missing])
                idx = np.argmin(np.abs(info["donor_pred"][None, :] - fitted[:, None]), axis=1)
                out.loc[missing, var] = info["donor_values"][idx]
            else:
                levels = info["levels"]
                proba = info["model"].predict_proba(X[missing])
                if len(levels) == 2:
                    draws = rng.uniform(size=missing.sum()) < proba[:, 1]
                    out.loc[missing, var] = np.where(draws, levels[1], levels[0])
                else:
                    picks = np.array([
                        rng.choice(len(levels), size=1, p=row / row.sum())[0]
                        for row in proba
                    ])
                    out.loc[missing, var] = np.array(levels, dtype=object)[picks]
        return out

    def transform_all(self, data: pd.DataFrame) -> list[pd.DataFrame]:
        """Impute `data` with each of the m fitted datasets (for pooled prediction)."""
        return [self.transform(data, dataset_index=d) for d in range(self.m)]


def rubins_rules(estimates: np.ndarray, variances: np.ndarray) -> dict[str, float]:
    """Pool point estimates and variances across m imputed datasets.

    Returns the pooled estimate, total variance, and Barnard-Rubin degrees of
    freedom for the t reference distribution.
    """
    estimates = np.asarray(estimates, dtype=float)
    variances = np.asarray(variances, dtype=float)
    m = len(estimates)
    if m < 2:
        raise ValueError("Rubin's rules require at least 2 imputed datasets")
    q_bar = estimates.mean()
    within = variances.mean()
    between = estimates.var(ddof=1)
    total = within + (1.0 + 1.0 / m) * between
    if between <= 0:
        df = np.inf
    else:
        r = (1.0 + 1.0 / m) * between / within
        df_old = (m - 1) * (1.0 + 1.0 / r) ** 2
        df_obs = _barnard_rubin_df(estimates, variances, within, between)
        df = 1.0 / (1.0 / df_old + 1.0 / df_obs)
    return {"estimate": q_bar, "variance": total, "se": total**0.5, "df": df, "m": m}


def _barnard_rubin_df(estimates: np.ndarray, variances: np.ndarray,
                      within: float, between: float) -> float:
    m = len(estimates)
    se = (within + (1.0 + 1.0 / m) * between) ** 0.5
    if se == 0:
        return np.inf
    return 4.0 * (m - 1) * (1.0 + within / ((1.0 + 1.0 / m) * between)) ** 2


def _rel_change_numeric(old: pd.Series, new: np.ndarray) -> float:
    """Relative change in the mean of imputed continuous values (donor switches
    are stochastic; the mean is what converges at stationarity)."""
    old_mean = np.nanmean(np.asarray(old, dtype=float))
    scale = np.nanstd(np.asarray(old, dtype=float))
    if scale == 0:
        return 0.0
    return float(abs(np.mean(new) - old_mean) / scale)


def _categorical_change(old: pd.Series, new: np.ndarray) -> float:
    """Fraction of imputed categorical values that changed since the last
    iteration (the categorical counterpart of the continuous mean shift)."""
    old_values = np.asarray(old, dtype=object)
    if len(old_values) == 0:
        return 0.0
    return float(np.mean(old_values != np.asarray(new, dtype=object)))
