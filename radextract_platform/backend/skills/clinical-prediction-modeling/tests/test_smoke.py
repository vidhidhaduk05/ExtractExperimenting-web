"""Smoke tests: every template module runs end-to-end on synthetic data
(n=500, mixed missingness) and emits a decision trace. Run:
    python tests/test_smoke.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from templates import (DecisionTrace, MiceImputer, auc_with_ci, brier_score,
                       bootstrap_validate, calibration, decision_curve,
                       likelihood_ratio_test, oob_r_squared, rcs_design,
                       rubins_rules)
from templates.binary import fit_binary_pipeline, marginal_standardization
from templates.continuous import ancova, fit_linear_pipeline, repeated_measures
from templates.ml_benchmark import benchmark
from templates.method_advisor import PrivacyViolation, advise, guard_state
from templates.survival import fit_cox_pipeline, ph_diagnostics
from templates.tripod_check import check


def synthetic_cohort(n: int = 500, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    age = rng.normal(75, 10, n)
    glucose = np.exp(rng.normal(4.6, 0.25, n))
    nihss = rng.poisson(8, n).clip(0, 40)
    nwu_admission = rng.normal(6.5, 1.2, n).clip(2)
    increment = 6.0 + 0.9 * (nwu_admission - 6.5) + 0.02 * age + 0.01 * glucose + rng.normal(0, 1.5, n)
    nwu_24h = nwu_admission + increment.clip(min=0)
    logit = -8 + 0.05 * (age - 75) + 0.35 * nihss + 0.4 * (nwu_24h - 13) + 0.1 * (increment - 6)
    death = rng.uniform(size=n) < 1 / (1 + np.exp(-logit))
    df = pd.DataFrame({
        "age": age, "glucose": glucose, "nihss": nihss.astype(float),
        "nwu_admission": nwu_admission, "nwu_24h": nwu_24h,
        "increment": increment, "death": death.astype(int),
        "center": rng.choice(["A", "B"], n),
        "time_days": rng.exponential(90, n),
    })
    # outcome-associated missingness, as in real stroke cohorts
    df.loc[rng.uniform(size=n) < 0.13, "glucose"] = np.nan
    df.loc[rng.uniform(size=n) < 0.09, "age"] = np.nan
    return df


def test_splines() -> None:
    df = synthetic_cohort(200)
    design = rcs_design(df["nwu_admission"].to_numpy(), 4, name="nwu")
    assert design.shape[1] == 3  # linear + 2 nonlinear terms for 4 knots
    assert not design.isna().any().any()
    print("  splines: OK")


def test_imputation_and_rubin() -> None:
    df = synthetic_cohort(300)
    imputer = MiceImputer(m=5, max_iter=3, random_state=1)
    result = imputer.fit_transform(df[["age", "glucose", "nihss"]])
    assert len(result.imputed) == 5
    assert not result.imputed[0].isna().any().any()
    pooled = rubins_rules(np.array([1.1, 1.2, 1.15, 1.05, 1.12]),
                          np.array([0.01, 0.012, 0.011, 0.009, 0.01]))
    assert pooled["m"] == 5 and pooled["se"] > 0
    print("  imputation + Rubin: OK")


def test_binary_pipeline() -> None:
    df = synthetic_cohort()
    trace = DecisionTrace("smoke_binary", seed=7)
    pipeline = fit_binary_pipeline(
        df, "death",
        spline_predictors={"nwu_admission": 4, "glucose": 4},
        linear_continuous=["age", "nihss"],
        categorical=["center"], m_imputation=5, seed=7, trace=trace,
    )
    proba = pipeline.predict_proba(df)
    assert (proba > 0).all() and (proba < 1).all()
    risks = marginal_standardization(pipeline, df, "nihss", values=(5.0, 15.0))
    assert risks[15.0] > risks[5.0]
    trace.save(Path(tempfile.gettempdir()) / "smoke_binary_trace.json")
    print("  binary pipeline + standardization: OK")


def test_validation_and_metrics() -> None:
    df = synthetic_cohort()
    trace = DecisionTrace("smoke_validation", seed=7)

    def fit(d: pd.DataFrame) -> dict:
        from sklearn.linear_model import LogisticRegression
        X = d[["age", "nihss", "nwu_admission"]].fillna(d[["age", "nihss", "nwu_admission"]].median())
        y = d["death"]
        return {"model": LogisticRegression(max_iter=500).fit(X, y), "medians": X.median()}

    def evaluate(fitted: dict, d: pd.DataFrame) -> float:
        from sklearn.metrics import roc_auc_score
        X = d[["age", "nihss", "nwu_admission"]].fillna(fitted["medians"])
        return roc_auc_score(d["death"], fitted["model"].predict_proba(X)[:, 1])

    result = bootstrap_validate(df, fit=fit, evaluate=evaluate,
                                metric_name="auc", n_replicates=50, seed=7, trace=trace)
    summary = result.summary()
    assert 0 <= summary["oob_mean"] <= 1

    y_true = df["death"].to_numpy()
    y_prob = np.clip(0.2 + 0.05 * df["nihss"].to_numpy() / 10, 0.01, 0.99)
    auc_with_ci(y_true, y_prob, n_bootstrap=200, seed=7)
    calibration(y_true, y_prob)
    brier_score(y_true, y_prob)
    dc = decision_curve(y_true, y_prob, thresholds=np.array([0.1, 0.3, 0.5]))
    assert len(dc) == 3
    print("  validation + metrics: OK")


def test_continuous_pipeline() -> None:
    df = synthetic_cohort()
    models = fit_linear_pipeline(
        df, "increment",
        spline_predictors={"nwu_admission": 4},
        linear_continuous=["age", "glucose", "nihss"],
        categorical=["center"], m_imputation=5, seed=7,
    )
    assert len(models) == 5
    ancova(df.assign(change=df["increment"]), "change", "nwu_admission",
           ["age", "nihss"], "center")
    long = pd.concat([
        df.assign(nwu=df["nwu_admission"], t=0.0),
        df.assign(nwu=df["nwu_24h"], t=1.0),
    ]).reset_index().rename(columns={"index": "pid"})
    repeated_measures(long, "nwu", "t", "death", patient_id="pid")
    print("  continuous pipeline + ANCOVA + mixed model: OK")


def test_survival_pipeline() -> None:
    df = synthetic_cohort()
    models, frames = fit_cox_pipeline(
        df, "time_days", "death",
        spline_predictors={"nwu_admission": 4},
        linear_continuous=["age", "nihss"],
        categorical=["center"], m_imputation=5, seed=7,
    )
    assert len(models) == 5 and len(frames) == 5
    ph = ph_diagnostics(models[0], frames[0])
    assert not ph.empty
    print("  survival pipeline + PH diagnostics: OK")


def test_ml_benchmark() -> None:
    df = synthetic_cohort()
    report = benchmark(df, "death", n_outer=3, seed=7)
    assert set(report["model"]) == {"penalized_logistic", "gradient_boosting", "random_forest"}
    print("  ML benchmark: OK")


def test_tripod_check() -> None:
    trace = DecisionTrace("smoke_tripod", seed=7)
    trace.log("study_type", chosen="development", stage="design")
    trace.log("bootstrap_validation", chosen={"n_replicates": 400}, stage="validation")
    path = trace.save(Path(tempfile.gettempdir()) / "smoke_tripod_trace.json")
    report = check(path)
    assert report.to_text()
    print("  TRIPOD check: OK")


def test_method_advisor() -> None:
    trace = DecisionTrace("smoke_advisor", seed=7)
    # privacy guard: patient-level content must be rejected
    try:
        guard_state({"n_patients": 100, "outcome_type": "binary",
                     "rows": [[1, 2, 3], [4, 5, 6]]})
        raise AssertionError("privacy guard did not fire")
    except PrivacyViolation:
        pass
    # offline path (no TYPESAFE_API_KEY in test env): rule-based fallback
    advisory = advise({"outcome_type": "binary", "n_patients": 626,
                       "n_events": 125, "n_predictors": 16,
                       "max_missing_rate": 0.24}, trace=trace)
    assert advisory.source == "rule_based"
    assert advisory.validation_design in ("full_pipeline_bootstrap", "nested_cv", "held_out_split")
    assert advisory.spline_knots in ("3", "4", "5")
    # mocked Jev path: verify the client is called with metadata-only state
    try:
        import typesafe_sdk
    except ModuleNotFoundError:
        print("  method advisor (guard + offline; Jev SDK not installed, mocked path skipped): OK")
        return
    class _FakeAnswer:
        def __init__(self, value, probs=None):
            self.choice = value if isinstance(value, str) else None
            self.noul = value if isinstance(value, float) else None
            self.probabilities = probs or {}
    class _FakeResponse:
        answers = {
            "validation_design": _FakeAnswer("full_pipeline_bootstrap", {"full_pipeline_bootstrap": 0.9}),
            "penalization_needed": _FakeAnswer(0.7),
            "spline_knots": _FakeAnswer("4", {"4": 0.8}),
            "epv_adequate": _FakeAnswer(0.95),
            "flexibility_score": _FakeAnswer("adequate", {"adequate": 0.6}),
        }
    import templates.method_advisor as ma
    original = ma._jev_questions
    ma._jev_questions = lambda: {"validation_design": None, "penalization_needed": None,
                                 "spline_knots": None, "epv_adequate": None,
                                 "flexibility_score": None}

    class _FakeClient:
        def __init__(self, timeout=None): pass
        def system_one(self, **kwargs):
            assert "rows" not in kwargs["state"]
            return _FakeResponse()
    import typesafe_sdk
    real_client = typesafe_sdk.TypeSafeClient
    typesafe_sdk.TypeSafeClient = _FakeClient
    try:
        import os
        os.environ["TYPESAFE_API_KEY"] = "test-only-mock-key"
        advisory = advise({"outcome_type": "binary", "n_patients": 626,
                           "n_events": 125, "n_predictors": 16}, trace=trace)
        assert advisory.source == "jev"
        assert advisory.validation_design == "full_pipeline_bootstrap"
    finally:
        typesafe_sdk.TypeSafeClient = real_client
        ma._jev_questions = original
        del os.environ["TYPESAFE_API_KEY"]
    print("  method advisor (guard + offline + mocked Jev): OK")


def test_figures() -> None:
    import tempfile as _tf
    from PIL import Image

    from templates.figures import (DOUBLE_COL, MAX_PANELS, apply_theme,
                                   new_figure, plot_calibration,
                                   plot_decision_curve, save_draft,
                                   save_final)

    df = synthetic_cohort()
    y_true = df["death"].to_numpy()
    y_prob = np.clip(0.2 + 0.05 * df["nihss"].to_numpy() / 10, 0.01, 0.99)
    trace = DecisionTrace("smoke_figures", seed=7)

    apply_theme()
    fig, ax = plot_calibration(y_true, y_prob, trace=trace)
    dc = decision_curve(y_true, y_prob, thresholds=np.arange(0.1, 0.9, 0.1))
    plot_decision_curve(dc, trace=trace)

    # panel limit enforced
    try:
        new_figure(MAX_PANELS + 1)
        raise AssertionError("panel limit did not fire")
    except ValueError:
        pass

    out = Path(_tf.mkdtemp())
    draft = save_draft(fig, out / "fig_calibration")
    assert draft.suffix == ".png" and draft.stat().st_size > 0
    tif, pdf = save_final(fig, out / "fig_calibration")
    with Image.open(tif) as im:
        assert im.info.get("dpi", (0,))[0] >= 299, f"dpi={im.info.get('dpi')}"
    assert pdf.stat().st_size > 0
    assert any(e["decision"] == "calibration_figure" for e in trace.entries)
    plt.close("all")
    print("  figures (PNG draft + 300-dpi TIFF final): OK")


if __name__ == "__main__":
    print("Running smoke tests on synthetic data (n=500)...")
    test_splines()
    test_imputation_and_rubin()
    test_binary_pipeline()
    test_validation_and_metrics()
    test_continuous_pipeline()
    test_survival_pipeline()
    test_ml_benchmark()
    test_method_advisor()
    test_tripod_check()
    test_figures()
    print("All smoke tests passed.")
