"""Continuous-outcome pipelines: linear models with RCS, ANCOVA adjustment,
and a random-intercept mixed model for repeated measures. See ch09.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from .imputation import MiceImputer
from .metrics import oob_r_squared
from .splines import build_design, compute_knots, likelihood_ratio_test


@dataclass
class LinearPipeline:
    """Fitted linear pipeline. Behaves like the list of per-dataset model fits
    (len(), iteration, indexing) and additionally carries the fit-time knots
    and training fills so out-of-bag designs can be rebuilt without leakage."""
    models: list
    knots: dict[str, np.ndarray]
    fill_values: dict[str, float]
    spline_predictors: dict[str, int]
    linear_continuous: list[str]
    categorical: list[str]

    def __len__(self) -> int:
        return len(self.models)

    def __iter__(self):
        return iter(self.models)

    def __getitem__(self, i):
        return self.models[i]

    def design(self, data: pd.DataFrame) -> pd.DataFrame:
        """Design matrix for new data using fit-time knots and training fills."""
        data = data.copy()
        for col, value in self.fill_values.items():
            if col in data.columns:
                data[col] = data[col].fillna(value)
        return build_design(data, spline_predictors=self.spline_predictors,
                            knots=self.knots,
                            linear_continuous=self.linear_continuous,
                            categorical=self.categorical)


def fit_linear_pipeline(
    data: pd.DataFrame,
    outcome: str,
    *,
    spline_predictors: dict[str, int] | None = None,
    linear_continuous: list[str] | None = None,
    categorical: list[str] | None = None,
    m_imputation: int = 20,
    seed: int | None = None,
    trace=None,
) -> LinearPipeline:
    """Fit a linear model in each imputed dataset.

    Spline knots are computed once from the first imputed dataset and reused
    for every fit and every out-of-bag design. Compare nested models with
    likelihood_ratio_test(); report out-of-sample R-squared from
    validation.py, never in-sample R-squared.
    """
    spline_predictors = spline_predictors or {}
    linear_continuous = linear_continuous or []
    categorical = categorical or []

    imputer = MiceImputer(m=m_imputation, random_state=seed)
    result = imputer.fit_transform(data)

    knots = compute_knots(result.imputed[0], spline_predictors)
    fill_values = {p: float(result.imputed[0][p].median())
                   for p in [*spline_predictors, *linear_continuous]}
    fill_values.update({p: result.imputed[0][p].mode().iloc[0] for p in categorical})

    models = []
    for completed in result.imputed:
        design = build_design(completed, spline_predictors=spline_predictors,
                              knots=knots, linear_continuous=linear_continuous,
                              categorical=categorical)
        model = sm.OLS(completed[outcome].astype(float), sm.add_constant(design)).fit()
        models.append(model)

    pipeline = LinearPipeline(
        models=models, knots=knots, fill_values=fill_values,
        spline_predictors=spline_predictors, linear_continuous=linear_continuous,
        categorical=categorical,
    )

    if trace is not None:
        trace.log(
            "linear_pipeline",
            chosen={"spline_predictors": spline_predictors,
                    "linear_continuous": linear_continuous,
                    "categorical": categorical},
            rationale="OLS with RCS; knots fixed at fit time; nested comparisons by LR test",
            stage="modeling",
        )
    return pipeline


def ancova(data: pd.DataFrame, outcome_change: str, baseline: str,
           covariates: list[str], group: str) -> sm.regression.linear_model.RegressionResults:
    """Change-score model adjusted for the baseline value (guards regression to
    the mean). Covariates follow the case study: baseline measure, age, severity,
    volume, center. (ch09)
    """
    formula = f"{outcome_change} ~ {group} + {baseline} + " + " + ".join(covariates)
    return smf.ols(formula, data=data).fit()


def repeated_measures(
    data: pd.DataFrame,
    outcome: str,
    time: str,
    group: str,
    patient_id: str,
    covariates: list[str] | None = None,
) -> sm.regression.mixed_linear_model.MixedLMResults:
    """Random-intercept mixed model: outcome ~ time * group + covariates.

    With exactly two timepoints this is algebraically a difference-in-differences
    on the increment and does NOT estimate trajectory shape — say so in the
    paper (ch09, ch16). Random slopes require >= 3 timepoints.
    """
    covariates = covariates or []
    formula = f"{outcome} ~ {time} * {group}"
    if covariates:
        formula += " + " + " + ".join(covariates)
    return smf.mixedlm(formula, data=data, groups=data[patient_id]).fit()


__all__ = [
    "fit_linear_pipeline", "ancova", "repeated_measures",
    "oob_r_squared", "likelihood_ratio_test", "LinearPipeline",
]
