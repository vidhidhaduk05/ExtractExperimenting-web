"""Binary-outcome pipeline: logistic regression with restricted cubic splines,
multiple imputation inside resampling, and marginal standardization for
adjusted risks. See ch03, ch06, ch07, ch11.

The pipeline object returned by `fit_binary_pipeline` is self-contained: it
carries its own imputer, spline knots, and scaler, so applying it to
out-of-bag patients never leaks information.

Correctness guarantees (regression-tested in tests/test_regressions.py):
- spline knots are computed once from the training data and reused for every
  imputed dataset and every prediction (per-dataset knots would misalign the
  spline basis between fit and predict);
- `predict_proba` pools predictions across all m imputed-dataset models by
  averaging predicted probabilities (Rubin's rules for predictions) — using a
  single imputed dataset's model discards between-imputation uncertainty;
- design matrices are aligned to the training columns BY NAME before
  statsmodels' positional `predict`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import statsmodels.api as sm

from .imputation import MiceImputer
from .splines import build_design, compute_knots


@dataclass
class BinaryPipeline:
    continuous_splines: dict[str, int]          # predictor -> n_knots
    linear_continuous: list[str]
    categorical: list[str]
    m_imputation: int = 20
    seed: int | None = None
    _imputer: MiceImputer | None = None
    _models: list = field(default_factory=list)  # one statsmodels fit per imputed dataset
    _design_columns: list[str] = field(default_factory=list)
    _knots: dict[str, np.ndarray] = field(default_factory=dict)   # fit-time knots
    _fill_values: dict[str, float] = field(default_factory=dict)  # training-derived fills

    def predict_proba(self, data: pd.DataFrame,
                      dataset_index: int | None = None) -> np.ndarray:
        """Predicted risk. By default, pooled across all m imputed datasets
        (mean predicted probability — Rubin's rules for predictions).
        Pass `dataset_index=d` for the single-dataset prediction (diagnostics)."""
        if dataset_index is not None:
            datasets = [self._imputed_data(data, dataset_index)]
            models = [self._models[dataset_index % len(self._models)]]
        else:
            datasets = [self._imputed_data(data, d) for d in range(len(self._models))]
            models = self._models
        proba = np.mean([
            np.asarray(model.predict(sm.add_constant(self._design(d), has_constant="add")))
            for d, model in zip(datasets, models)
        ], axis=0)
        return proba

    def _imputed_data(self, data: pd.DataFrame, dataset_index: int) -> pd.DataFrame:
        """Out-of-bag imputation from training-fitted models; falls back to
        training-derived fills if the imputer cannot be applied."""
        data = data.copy()
        if self._imputer is not None:
            try:
                imputed = self._imputer.transform(data, dataset_index=dataset_index)
                for col in self._fill_values:
                    if col in data.columns:
                        data[col] = imputed[col]
                return data
            except (KeyError, IndexError):
                pass  # evaluation data lacks a training column; use fills
        for col, value in self._fill_values.items():
            data[col] = data[col].fillna(value)
        return data

    def _design(self, data: pd.DataFrame) -> pd.DataFrame:
        data = data.copy()
        for col, value in self._fill_values.items():
            data[col] = data[col].fillna(value)
        design = build_design(
            data,
            spline_predictors=self.continuous_splines,
            knots=self._knots,
            linear_continuous=self.linear_continuous,
            categorical=self.categorical,
        )
        # align to training columns BY NAME (handles unseen levels / column
        # order — statsmodels predicts positionally)
        return design.reindex(columns=self._design_columns, fill_value=0)


def fit_binary_pipeline(
    data: pd.DataFrame,
    outcome: str,
    *,
    spline_predictors: dict[str, int],
    linear_continuous: list[str],
    categorical: list[str],
    m_imputation: int = 20,
    seed: int | None = None,
    trace=None,
) -> BinaryPipeline:
    """Fit the full pipeline: MICE -> spline design -> logistic model per dataset."""
    imputer = MiceImputer(m=m_imputation, random_state=seed)
    result = imputer.fit_transform(data)

    pipeline = BinaryPipeline(
        continuous_splines=spline_predictors,
        linear_continuous=linear_continuous,
        categorical=categorical,
        m_imputation=m_imputation,
        seed=seed,
        _imputer=imputer,
    )

    first = result.imputed[0]
    # knots computed ONCE from the first imputed dataset; reused everywhere
    pipeline._knots = compute_knots(first, spline_predictors)
    probe = build_design(first, spline_predictors=spline_predictors,
                         knots=pipeline._knots,
                         linear_continuous=linear_continuous, categorical=categorical)
    pipeline._design_columns = list(probe.columns)
    for predictor in [*spline_predictors, *linear_continuous]:
        pipeline._fill_values[predictor] = float(first[predictor].median())
    for predictor in categorical:
        pipeline._fill_values[predictor] = first[predictor].mode().iloc[0]

    for completed in result.imputed:
        design = build_design(completed, spline_predictors=spline_predictors,
                              knots=pipeline._knots,
                              linear_continuous=linear_continuous, categorical=categorical)
        design = design.reindex(columns=pipeline._design_columns, fill_value=0)
        model = sm.Logit(completed[outcome].astype(float),
                         sm.add_constant(design, has_constant="add")).fit(disp=0)
        pipeline._models.append(model)

    if trace is not None:
        trace.log(
            "binary_pipeline",
            chosen={
                "spline_predictors": spline_predictors,
                "linear_continuous": linear_continuous,
                "categorical": categorical,
                "m_imputation": m_imputation,
                "n_observations": len(data),
            },
            alternatives=["complete-case analysis (rejected: outcome-associated missingness)",
                          "median-split exposure (rejected: display only)"],
            rationale="MICE inside pipeline; RCS default for continuous predictors; "
                      "knots fixed at fit time; predictions pooled across m datasets",
            stage="modeling",
        )
    return pipeline


def marginal_standardization(
    pipeline: BinaryPipeline,
    data: pd.DataFrame,
    exposure: str,
    values: tuple[float, ...] = (0.0, 1.0),
) -> dict[float, float]:
    """Adjusted absolute risks at given exposure values, averaged over the cohort.

    Predicts every patient's risk with the exposure fixed at each value and
    averages — the communicable counterpart of the adjusted OR (ch07).
    """
    risks: dict[float, float] = {}
    for value in values:
        counterfactual = data.copy()
        counterfactual[exposure] = value
        proba = pipeline.predict_proba(counterfactual)
        risks[value] = float(np.mean(proba))
    return risks
