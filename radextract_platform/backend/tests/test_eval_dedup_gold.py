"""Tests for scripts/eval_dedup_gold.py."""
import pytest
from scripts.eval_dedup_gold import (
    wilson_score_interval,
    evaluate_pair,
    evaluate_labeled_records,
    make_mock_evaluation_dataset,
)


def test_wilson_score_interval_bounds():
    lower, upper = wilson_score_interval(10, 10)
    assert 0.0 <= lower <= 1.0
    assert 0.0 <= upper <= 1.0
    assert lower > 0.6  # 10/10 successes lower bound is ~0.72

    # Zero total handles gracefully
    l0, u0 = wilson_score_interval(0, 0)
    assert l0 == 0.0 and u0 == 1.0


def test_evaluate_mock_dataset():
    data = make_mock_evaluation_dataset()
    results = evaluate_labeled_records(data, min_precision=0.99)
    assert results["total_pairs"] == 5
    assert results["fp"] == 0
    assert results["precision"] == 1.0
    assert results["gate_passed"] is True
    assert results["review_count"] >= 1
