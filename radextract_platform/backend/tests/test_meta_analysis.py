"""Tests for services/meta_analysis.py — bivariate model, generic pooling, plots."""
import pytest
import math
import numpy as np
from services import meta_analysis as ma


class TestBivariateModel:
    """Tests for the diagnostic accuracy bivariate model (Reitsma 2005)."""

    def test_basic_fit(self):
        """Bivariate model with 5 studies should produce valid pooled estimates."""
        sens = [0.85, 0.90, 0.78, 0.92, 0.88]
        spec = [0.80, 0.85, 0.75, 0.88, 0.82]
        n_pos = [50, 60, 40, 70, 55]
        n_neg = [100, 120, 80, 140, 110]

        result = ma.fit_bivariate_model(sens, spec, n_pos, n_neg)

        assert 0 < result["pooled_sensitivity"] < 1
        assert 0 < result["pooled_specificity"] < 1
        assert result["sens_ci_lower"] < result["pooled_sensitivity"] < result["sens_ci_upper"]
        assert result["spec_ci_lower"] < result["pooled_specificity"] < result["spec_ci_upper"]
        assert -1 <= result["correlation"] <= 1
        assert 0 < result["auc"] < 1
        assert result["n_studies"] == 5

    def test_pooled_within_range(self):
        """Pooled sensitivity should be within the range of study sensitivities."""
        sens = [0.70, 0.95]
        spec = [0.65, 0.90]
        n_pos = [30, 50]
        n_neg = [60, 100]

        result = ma.fit_bivariate_model(sens, spec, n_pos, n_neg)
        assert min(sens) - 0.1 <= result["pooled_sensitivity"] <= max(sens) + 0.1

    def test_too_few_studies(self):
        """Should raise ValueError with < 2 studies."""
        with pytest.raises(ValueError, match="at least 2"):
            ma.fit_bivariate_model([0.9], [0.8], [50], [100])

    def test_sroc_curve(self):
        """SROC curve should produce valid FPR/TPR pairs."""
        points = ma.compute_sroc_curve(a=2.0, b=0.5, n_points=50)
        assert len(points) == 50
        for p in points:
            assert 0 < p["fpr"] < 1
            assert 0 < p["tpr"] < 1


class TestGenericMetaAnalysis:
    """Tests for DerSimonian-Laird random-effects pooling."""

    def test_basic_pooling(self):
        """Generic pooling with 5 studies should produce valid results."""
        effects = [0.5, 0.8, 0.3, 0.6, 0.7]
        variances = [0.04, 0.05, 0.03, 0.06, 0.04]

        result = ma.fit_generic_meta_analysis(effects, variances, "md")

        assert result["ci_lower"] < result["pooled_effect"] < result["ci_upper"]
        assert result["z_statistic"] > 0
        assert result["p_value"] < 0.05  # clearly significant
        assert 0 <= result["i_squared"] <= 100
        assert result["n_studies"] == 5

    def test_homogeneous_studies(self):
        """Homogeneous studies should have low I²."""
        effects = [0.5, 0.52, 0.48, 0.51, 0.49]
        variances = [0.04, 0.04, 0.04, 0.04, 0.04]

        result = ma.fit_generic_meta_analysis(effects, variances, "md")
        assert result["i_squared"] < 25  # low heterogeneity

    def test_heterogeneous_studies(self):
        """Heterogeneous studies should have high I²."""
        effects = [0.1, 1.5, -0.5, 2.0, -0.3]
        variances = [0.01, 0.01, 0.01, 0.01, 0.01]

        result = ma.fit_generic_meta_analysis(effects, variances, "md")
        assert result["i_squared"] > 50  # high heterogeneity

    def test_too_few_studies(self):
        """Should raise ValueError with < 2 studies."""
        with pytest.raises(ValueError, match="at least 2"):
            ma.fit_generic_meta_analysis([0.5], [0.04], "md")


class TestEffectSizeComputation:
    """Tests for compute_effect_size with different measures."""

    def test_mean_difference(self):
        data = {"mean1": 10, "sd1": 3, "n1": 50, "mean2": 7, "sd2": 3, "n2": 50}
        es, var = ma.compute_effect_size(data, "md")
        assert es == pytest.approx(3.0)
        assert var > 0

    def test_smd(self):
        data = {"mean1": 10, "sd1": 3, "n1": 50, "mean2": 7, "sd2": 3, "n2": 50}
        es, var = ma.compute_effect_size(data, "smd")
        assert es > 0  # positive effect
        assert var > 0

    def test_odds_ratio(self):
        data = {"a": 30, "b": 20, "c": 10, "d": 40}
        es, var = ma.compute_effect_size(data, "or")
        # log(OR) = log((30*40)/(20*10)) = log(6) ≈ 1.79
        assert es == pytest.approx(math.log(6), rel=0.01)
        assert var > 0

    def test_risk_ratio(self):
        data = {"a": 30, "b": 20, "c": 10, "d": 40}
        es, var = ma.compute_effect_size(data, "rr")
        # log(RR) = log((30/50)/(10/50)) = log(3) ≈ 1.10
        assert es == pytest.approx(math.log(3), rel=0.01)
        assert var > 0

    def test_zero_cell_correction(self):
        """Zero cells should get continuity correction."""
        data = {"a": 0, "b": 50, "c": 5, "d": 45}
        es, var = ma.compute_effect_size(data, "or")
        assert es < 0  # zero events in treatment → negative log OR
        assert var > 0

    def test_generic(self):
        data = {"effect_size": 0.5, "variance": 0.04}
        es, var = ma.compute_effect_size(data, "generic")
        assert es == 0.5
        assert var == 0.04


class TestEggersTest:
    """Tests for Egger's regression test."""

    def test_basic(self):
        effects = [0.5, 0.8, 0.3, 0.6, 0.7]
        variances = [0.04, 0.05, 0.03, 0.06, 0.04]
        result = ma.eggers_test(effects, variances)
        assert result["intercept"] is not None
        assert result["p_value"] is not None
        assert 0 <= result["p_value"] <= 1

    def test_too_few_studies(self):
        result = ma.eggers_test([0.5, 0.8], [0.04, 0.05])
        assert result["intercept"] is None
        assert "Need at least 3" in result["message"]


class TestSVGGeneration:
    """Tests that SVG plots are generated correctly."""

    def test_forest_plot(self):
        effects = [0.5, 0.8, 0.3, 0.6, 0.7]
        variances = [0.04, 0.05, 0.03, 0.06, 0.04]
        result = ma.fit_generic_meta_analysis(effects, variances, "md")
        svg = ma.generate_forest_plot_svg(
            ["A", "B", "C", "D", "E"], effects, variances, result, "md"
        )
        assert "<svg" in svg
        assert "</svg>" in svg

    def test_sroc_curve(self):
        sens = [0.85, 0.90, 0.78]
        spec = [0.80, 0.85, 0.75]
        n_pos = [50, 60, 40]
        n_neg = [100, 120, 80]
        bivar = ma.fit_bivariate_model(sens, spec, n_pos, n_neg)
        svg = ma.generate_sroc_curve_svg(sens, spec, bivar)
        assert "<svg" in svg
        assert "</svg>" in svg

    def test_funnel_plot(self):
        effects = [0.5, 0.8, 0.3, 0.6, 0.7]
        variances = [0.04, 0.05, 0.03, 0.06, 0.04]
        egger = ma.eggers_test(effects, variances)
        svg = ma.generate_funnel_plot_svg(effects, variances, egger)
        assert "<svg" in svg
        assert "</svg>" in svg


class TestFullRun:
    """Tests for run_meta_analysis end-to-end."""

    def test_diagnostic_accuracy(self):
        studies = [
            {"label": "A", "sensitivity": 0.85, "specificity": 0.80, "n_pos": 50, "n_neg": 100},
            {"label": "B", "sensitivity": 0.90, "specificity": 0.85, "n_pos": 60, "n_neg": 120},
            {"label": "C", "sensitivity": 0.78, "specificity": 0.75, "n_pos": 40, "n_neg": 80},
        ]
        result = ma.run_meta_analysis("diagnostic_accuracy", studies)
        assert result["analysis_type"] == "diagnostic_accuracy"
        assert "bivariate" in result
        assert "forest_plot_svg" in result
        assert "sroc_curve_svg" in result
        assert "funnel_plot_svg" in result

    def test_generic(self):
        studies = [
            {"label": "A", "effect_size": 0.5, "variance": 0.04},
            {"label": "B", "effect_size": 0.8, "variance": 0.05},
            {"label": "C", "effect_size": 0.3, "variance": 0.03},
        ]
        result = ma.run_meta_analysis("generic", studies, "generic")
        assert result["analysis_type"] == "generic"
        assert "pooled" in result
        assert "forest_plot_svg" in result
        assert "funnel_plot_svg" in result

    def test_invalid_type(self):
        with pytest.raises(ValueError, match="Unknown analysis type"):
            ma.run_meta_analysis("invalid", [])
