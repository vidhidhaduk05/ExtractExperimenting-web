"""Wilson intervals and NR handling for descriptive synthesis."""
from services.descriptive_synthesis import median_iqr, summarize_variable, wilson_ci


def test_wilson_known_interval():
    interval = wilson_ci(1, 4)
    assert interval is not None
    assert interval["proportion"] == 0.25
    assert 0 < interval["ci_low"] < 0.25
    assert 0.25 < interval["ci_high"] < 1


def test_numeric_summary_drops_nr():
    summary = summarize_variable("V3_diameter", "number", ["2", "NR", "4", ""])
    assert summary["summary"] == "median_iqr"
    assert summary["missing"] == 2
    assert summary["result"]["n"] == 2
    assert summary["result"]["median"] == 3


def test_binary_proportion_excludes_nr():
    summary = summarize_variable("V9", "categorical", ["present", "absent", "NR", "present"])
    assert summary["binary"]["k"] == 2
    assert summary["binary"]["n"] == 3


def test_median_iqr_single_value():
    assert median_iqr([5])["median"] == 5
