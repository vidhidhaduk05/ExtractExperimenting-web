"""Tests for services/r_plot_service.py — R plot generation with matplotlib fallback."""
import pytest
import os
from services import r_plot_service


# ── R availability ──

class TestRAvailability:

    def test_is_r_available(self):
        """R availability check should return boolean."""
        assert isinstance(r_plot_service._is_r_available(), bool)


    def test_r_scripts_dir_exists(self):
        """R scripts directory should exist."""
        assert os.path.isdir(r_plot_service.R_SCRIPTS_DIR)

    def test_all_r_scripts_present(self):
        """All 4 R scripts should exist."""
        for script in ["forest_plot.R", "sroc_curve.R", "funnel_plot.R", "prisma_flow.R"]:
            path = os.path.join(r_plot_service.R_SCRIPTS_DIR, script)
            assert os.path.exists(path), f"{script} should exist"


# ── Forest plot ──

class TestForestPlot:

    def test_generates_svg(self):
        """Forest plot should produce valid SVG."""
        svg = r_plot_service.generate_forest_plot(
            labels=["Study A", "Study B", "Study C"],
            effect_sizes=[0.5, 0.8, 1.2],
            variances=[0.04, 0.09, 0.06],
            pooled_effect=0.83,
            pooled_ci_lower=0.45,
            pooled_ci_upper=1.21,
            weights=[33.0, 33.0, 34.0],
            effect_measure="md",
            is_log=False,
            i_squared=45.2,
        )
        assert svg
        assert "<svg" in svg or "<?xml" in svg

    def test_log_scale(self):
        """Forest plot with log scale should still produce SVG."""
        svg = r_plot_service.generate_forest_plot(
            labels=["Study A", "Study B"],
            effect_sizes=[0.3, 0.7],
            variances=[0.05, 0.08],
            pooled_effect=0.5,
            pooled_ci_lower=0.2,
            pooled_ci_upper=0.8,
            weights=[50.0, 50.0],
            effect_measure="or",
            is_log=True,
            i_squared=10.0,
        )
        assert svg
        assert "<svg" in svg or "<?xml" in svg


# ── SROC curve ──

class TestSROCCurve:

    def test_generates_svg(self):
        """SROC curve should produce valid SVG."""
        svg = r_plot_service.generate_sroc_curve(
            sensitivities=[0.85, 0.90, 0.78, 0.92, 0.88],
            specificities=[0.80, 0.85, 0.75, 0.88, 0.82],
            n_pos=[50, 60, 40, 70, 55],
            n_neg=[100, 120, 80, 140, 110],
            bivariate_result={
                "pooled_sensitivity": 0.87,
                "pooled_specificity": 0.82,
                "sroc_a": 2.0,
                "sroc_b": 0.3,
                "auc": 0.91,
            },
        )
        assert svg
        assert "<svg" in svg or "<?xml" in svg


# ── Funnel plot ──

class TestFunnelPlot:

    def test_generates_svg(self):
        """Funnel plot should produce valid SVG."""
        svg = r_plot_service.generate_funnel_plot(
            effect_sizes=[0.5, 0.8, 1.2, 0.3, 0.9],
            variances=[0.04, 0.09, 0.06, 0.02, 0.07],
            egger_result={"intercept": 0.5, "p_value": 0.12},
            is_log=False,
            pooled_effect=0.74,
        )
        assert svg
        assert "<svg" in svg or "<?xml" in svg

    def test_without_egger(self):
        """Funnel plot without Egger result should still work."""
        svg = r_plot_service.generate_funnel_plot(
            effect_sizes=[0.5, 0.8, 1.2],
            variances=[0.04, 0.09, 0.06],
            egger_result=None,
            is_log=False,
            pooled_effect=0.83,
        )
        assert svg


# ── PRISMA flow ──

class TestPRISMAFlow:

    def test_generates_svg(self):
        """PRISMA flow diagram should produce valid SVG."""
        flow_data = {
            "identification": {
                "records_database": 1250,
                "registers_other": 45,
                "records_total": 1295,
            },
            "screening": {
                "duplicates": 180,
                "screened": 1115,
                "excluded": 850,
                "sought": 265,
                "not_retrieved": 15,
                "assessed": 250,
                "excluded_eligibility": 190,
            },
            "included": {
                "new_studies": 60,
                "new_reports": 60,
                "total_studies": 60,
                "total_reports": 60,
            },
        }
        svg = r_plot_service.generate_prisma_flow(flow_data)
        assert svg
        assert "<svg" in svg or "<?xml" in svg


# ── call_r_script directly ──

class TestCallRScript:

    def test_invalid_script_returns_none(self):
        """Non-existent script should return None."""
        result = r_plot_service.call_r_script("nonexistent.R", {})
        assert result is None
