"""Survival pipeline: Cox proportional hazards with RCS predictors, Schoenfeld
residual PH tests, concordance, and time-horizon Brier scoring. See ch08.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import proportional_hazard_test

from .imputation import MiceImputer
from .splines import build_design, compute_knots


@dataclass
class CoxPipeline:
    """Fitted Cox pipeline. Unpacks as (models, frames) for backward
    compatibility; also carries the fit-time knots and training fills so
    out-of-bag designs can be rebuilt without recomputing knots (leakage)."""
    models: list[CoxPHFitter]
    frames: list[pd.DataFrame]
    knots: dict[str, np.ndarray]
    fill_values: dict[str, float]
    spline_predictors: dict[str, int]
    linear_continuous: list[str]
    categorical: list[str]
    _imputer: MiceImputer | None = field(default=None, repr=False)

    def __iter__(self):
        yield self.models
        yield self.frames

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


def fit_cox_pipeline(
    data: pd.DataFrame,
    duration_col: str,
    event_col: str,
    *,
    spline_predictors: dict[str, int] | None = None,
    linear_continuous: list[str] | None = None,
    categorical: list[str] | None = None,
    m_imputation: int = 20,
    seed: int | None = None,
    trace=None,
) -> CoxPipeline:
    """Fit a Cox model in each of m imputed datasets.

    Returns a CoxPipeline (unpack as `models, frames = fit_cox_pipeline(...)`);
    spline knots are computed once from the first imputed dataset and reused
    for every fit and every out-of-bag design. Pool coefficients with
    rubins_rules() from imputation.py; test the PH assumption with
    ph_diagnostics() (report per-covariate tests, ch08).
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

    models, frames = [], []
    for completed in result.imputed:
        design = build_design(completed, spline_predictors=spline_predictors,
                              knots=knots, linear_continuous=linear_continuous,
                              categorical=categorical)
        frame = design.copy()
        frame[duration_col] = completed[duration_col].to_numpy()
        frame[event_col] = completed[event_col].to_numpy()
        cph = CoxPHFitter()
        cph.fit(frame, duration_col=duration_col, event_col=event_col)
        models.append(cph)
        frames.append(frame)

    pipeline = CoxPipeline(
        models=models, frames=frames, knots=knots, fill_values=fill_values,
        spline_predictors=spline_predictors, linear_continuous=linear_continuous,
        categorical=categorical, _imputer=imputer,
    )

    if trace is not None:
        trace.log(
            "cox_pipeline",
            chosen={"spline_predictors": spline_predictors,
                    "linear_continuous": linear_continuous,
                    "categorical": categorical, "m_imputation": m_imputation},
            alternatives=["binary outcome model (rejected: censoring present)"],
            rationale="Cox PH with RCS; knots fixed at fit time; PH assumption tested separately",
            stage="modeling",
        )
    return pipeline


def ph_diagnostics(model: CoxPHFitter, frame: pd.DataFrame) -> pd.DataFrame:
    """Per-covariate Schoenfeld residual tests for the PH assumption.

    Significant P values indicate time-varying effects; report time-averaged
    effects with a caveat or fit time-varying coefficients (ch08).
    """
    test = proportional_hazard_test(model, frame, time_transform="rank")
    return test.summary


def concordance(models: list[CoxPHFitter], frames: list[pd.DataFrame]) -> float:
    """Pooled concordance across imputed datasets (mean of per-dataset C-indices)."""
    return float(np.mean([m.concordance_index_ for m in models]))


def km_curve(durations: np.ndarray, events: np.ndarray):
    """Kaplan-Meier estimate; returns the fitted KaplanMeierFitter."""
    kmf = KaplanMeierFitter()
    kmf.fit(durations, event_observed=events)
    return kmf
