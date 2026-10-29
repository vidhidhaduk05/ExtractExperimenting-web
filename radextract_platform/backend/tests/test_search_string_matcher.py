"""Unit tests for services/search_string_matcher.py"""
import pytest
from services.search_string_matcher import match_search_string, clean_search_string


def test_clean_search_string():
    raw = '("metformin"[Title/Abstract] OR "glucophage"[tiab]) AND TITLE-ABS-KEY("aging")'
    cleaned = clean_search_string(raw)
    assert "[Title/Abstract]" not in cleaned
    assert "[tiab]" not in cleaned
    assert "TITLE-ABS-KEY" not in cleaned
    assert "metformin" in cleaned
    assert "aging" in cleaned


def test_boolean_and_or_matching():
    query = '("metformin"[tiab] OR glucophage) AND (longevity OR lifespan)'
    matched_text = "In this trial, metformin significantly improved lifespan in geriatric patients."
    unmatched_text = "In this trial, metformin had no effect on blood pressure."

    matched, reason = match_search_string(matched_text, query)
    assert matched is True
    assert "Matched" in reason

    unmatched, reason2 = match_search_string(unmatched_text, query)
    assert unmatched is False
    assert "did not satisfy" in reason2


def test_wildcard_matching():
    query = "diabet* AND cardio*"
    text = "We investigated cardiovascular outcomes in diabetic cohorts."
    matched, _ = match_search_string(text, query)
    assert matched is True

    text_no = "We investigated renal outcomes in hypertensive cohorts."
    matched_no, _ = match_search_string(text_no, query)
    assert matched_no is False


def test_not_matching():
    query = "cancer NOT animal"
    t1 = "Clinical study on lung cancer in human patients."
    t2 = "Preliminary study on lung cancer in an animal model."

    assert match_search_string(t1, query)[0] is True
    assert match_search_string(t2, query)[0] is False


def test_empty_query_passes():
    assert match_search_string("Some abstract text", "")[0] is True
