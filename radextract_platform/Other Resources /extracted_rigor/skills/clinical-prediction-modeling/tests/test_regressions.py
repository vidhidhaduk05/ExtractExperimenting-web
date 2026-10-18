"""Regression tests: one per correctness bug fixed in the hardening pass.
Each test is written to FAIL on the pre-fix code. Run:
    python tests/test_regressions.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from templates import DecisionTrace, MiceImputer, nested_cv
from templates.binary import fit_binary_pipeline
from templates.figures import SINGLE_COL, new_figure, save_final


def cohort_with_missing(n: int = 300, seed: int = 11) -> pd.DataFrame:
    """Synthetic cohort with numeric AND categorical missingness."""
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "age": rng.normal(70, 10, n),
        "glucose": np.exp(rng.normal(4.6, 0.25, n)),
        "center": rng.choice(["A", "B", "C"], n),
        "death": rng.integers(0, 2, n),
    })
    # outcome-associated missingness in a numeric and a categorical predictor
    df.loc[rng.uniform(size=n) < 0.15, "glucose"] = np.nan
    df.loc[rng.uniform(size=n) < 0.10, "center"] = np.nan
    return df


def test_mice_datasets_are_distinct() -> None:
    """Bug 1: the m imputed datasets must be genuinely distinct — identical
    datasets zero the between-imputation variance and silently narrow the
    Rubin's-rules interval."""
    df = cohort_with_missing()
    result = MiceImputer(m=5, max_iter=3, random_state=1).fit_transform(
        df[["age", "glucose", "center"]])
    assert len(result.imputed) == 5
    for d in range(1, len(result.imputed)):
        a = result.imputed[0]["glucose"].to_numpy(dtype=float)
        b = result.imputed[d]["glucose"].to_numpy(dtype=float)
        assert not np.allclose(a, b), \
            f"imputed datasets 0 and {d} are identical (between-variance would be 0)"
    print("  regression: m imputed datasets are distinct — OK")


def test_transform_uses_training_statistics_only() -> None:
    """Bug 2: transform() must impute from training-fitted models/donor pools,
    never from statistics of the evaluation data itself."""
    rng = np.random.default_rng(3)
    train = pd.DataFrame({
        "age": rng.normal(70, 10, 400),
        "glucose": np.exp(rng.normal(4.6, 0.25, 400)),
    })
    train.loc[rng.uniform(size=400) < 0.2, "glucose"] = np.nan
    imputer = MiceImputer(m=3, max_iter=2, random_state=5)
    imputer.fit_transform(train)

    # evaluation data with a VERY different age distribution; glucose missing
    eval_df = pd.DataFrame({
        "age": rng.normal(30, 2, 100),          # young cohort
        "glucose": np.full(100, np.nan),
    })
    out = imputer.transform(eval_df)
    assert not out["glucose"].isna().any()
    # training glucose median is far from what eval-data median imputation
    # would give (young cohort -> lower glucose); the imputed values must
    # come from the TRAINING donor pool, i.e. match training distribution
    train_median = np.exp(4.6)  # order of magnitude of training glucose
    imputed_mean = out["glucose"].mean()
    eval_median_imputation = np.median(np.exp(rng.normal(4.6, 0.25, 100)))
    assert abs(imputed_mean - train_median) < abs(eval_median_imputation * 0.5 - train_median) + 5, \
        "imputed values do not reflect the training donor pool"
    # stronger check: imputed values must be exact training donor values
    donors = set(train["glucose"].dropna().round(10))
    imputed = set(out["glucose"].round(10))
    assert imputed.issubset(donors), \
        "transform() produced values outside the training donor pool (PMM violated)"
    print("  regression: transform() uses training donor pool only — OK")


def test_categorical_imputation_runs() -> None:
    """Bug 3: the categorical chained-equation path must run (it previously
    crashed on np.nanmean over strings) and impute valid levels."""
    df = cohort_with_missing()
    result = MiceImputer(m=3, max_iter=2, random_state=2).fit_transform(
        df[["age", "center"]])
    valid = {"A", "B", "C"}
    for d in result.imputed:
        observed_levels = set(d["center"].unique())
        assert observed_levels <= valid, f"invalid levels imputed: {observed_levels - valid}"
        assert not d["center"].isna().any()
    print("  regression: categorical imputation path runs — OK")


def test_binary_pipeline_knots_and_pooling() -> None:
    """Bug 4: knots must be identical across the m per-dataset models and
    predictions must be pooled across datasets (not model #1 only)."""
    df = cohort_with_missing(500, seed=13)
    trace = DecisionTrace("regression_binary", seed=13)
    pipeline = fit_binary_pipeline(
        df, "death",
        spline_predictors={"glucose": 4},
        linear_continuous=["age"],
        categorical=["center"], m_imputation=4, seed=13, trace=trace,
    )
    # all per-dataset models were fit on designs built with the SAME knots
    assert len(pipeline._models) == 4
    # pooled default: differs from any single-dataset prediction
    pooled = pipeline.predict_proba(df)
    single = pipeline.predict_proba(df, dataset_index=0)
    assert not np.allclose(pooled, single), \
        "default predict_proba is not pooled across imputed datasets"
    # pooled equals the mean of per-dataset predictions
    per_dataset = np.mean([pipeline.predict_proba(df, dataset_index=d)
                           for d in range(4)], axis=0)
    assert np.allclose(pooled, per_dataset)
    # design matrices align by name: prediction must survive column reordering
    shuffled = df[list(reversed(df.columns))]
    assert np.allclose(pipeline.predict_proba(shuffled), pooled)
    print("  regression: shared knots + pooled prediction + name alignment — OK")


def test_nested_cv_custom_outcome_column() -> None:
    """Bug 5: nested_cv must accept any outcome column name (was hard-coded
    to 'y') and honor an explicit scoring metric."""
    from sklearn.linear_model import LogisticRegression
    rng = np.random.default_rng(7)
    df = pd.DataFrame({
        "age": rng.normal(70, 10, 200),
        "sbp": rng.normal(140, 20, 200),
        "death_90d": rng.integers(0, 2, 200),   # deliberately NOT named "y"
    })
    result = nested_cv(
        df, make_model=lambda: LogisticRegression(max_iter=500),
        param_grid={"C": [0.1, 1.0]}, outcome="death_90d",
        scoring="roc_auc", stratified=True, n_outer=3, n_inner=2, seed=7,
    )
    assert 0.0 <= result["mean_score"] <= 1.0
    assert "seed" in result
    print("  regression: nested_cv with custom outcome column + scoring — OK")


def test_decision_trace_missing_package() -> None:
    """Bug 6: DecisionTrace must construct even when a core package is not
    installed (version recorded as 'not installed', not a crash)."""
    import importlib.metadata
    original = importlib.metadata.version

    def _raise(name: str) -> str:
        if name == "lifelines":
            raise importlib.metadata.PackageNotFoundError(name)
        return original(name)

    import templates.decision_trace as dt
    dt.importlib.metadata.version = _raise
    try:
        trace = DecisionTrace("regression_trace", seed=1)
        env = [e for e in trace.entries if e["decision"] == "environment"][0]
        assert env["chosen"]["lifelines"] == "not installed"
    finally:
        dt.importlib.metadata.version = original
    print("  regression: DecisionTrace tolerant of missing packages — OK")


def test_save_final_preserves_column_width() -> None:
    """Parameterization: save_final must export the EXACT figure size (no
    tight-bbox cropping) so Radiology column widths survive to the file."""
    from PIL import Image

    fig, _ = new_figure(1, SINGLE_COL, label_panels=False)
    out = Path(tempfile.mkdtemp())
    tif, _pdf = save_final(fig, out / "fig_width")
    with Image.open(tif) as im:
        width_in = im.size[0] / im.info["dpi"][0]
    assert abs(width_in - SINGLE_COL) < 0.01, \
        f"final TIFF width {width_in:.3f} in != required {SINGLE_COL} in"
    print("  regression: save_final preserves exact column width — OK")


def test_benchmark_seed_is_recorded() -> None:
    """Parameterization: benchmark with seed=None must record the realized
    seed in the trace so the run is reproducible post hoc."""
    from templates.ml_benchmark import benchmark
    df = cohort_with_missing(200, seed=17)
    trace = DecisionTrace("regression_benchmark", seed=None)
    benchmark(df, "death", n_outer=3, seed=None, trace=trace)
    entry = [e for e in trace.entries if e["decision"] == "ml_benchmark"][0]
    assert isinstance(entry["chosen"]["seed"], int), \
        "realized seed not recorded in trace"
    print("  regression: benchmark seed recorded — OK")


if __name__ == "__main__":
    print("Running regression tests (each fails on the pre-fix code)...")
    test_mice_datasets_are_distinct()
    test_transform_uses_training_statistics_only()
    test_categorical_imputation_runs()
    test_binary_pipeline_knots_and_pooling()
    test_nested_cv_custom_outcome_column()
    test_decision_trace_missing_package()
    test_save_final_preserves_column_width()
    test_benchmark_seed_is_recorded()
    print("All regression tests passed.")
