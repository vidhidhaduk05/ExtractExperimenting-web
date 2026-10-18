"""Unit tests for signal prefilter service."""
from __future__ import annotations

import pytest
from services.signal_prefilter import _count_matches, prefilter_study


def test_count_matches_basic():
    text = "mri evaluation of acute ischemic stroke in adult patients"
    terms = ["mri", "stroke", "ct", "ultrasound"]
    count, matched = _count_matches(text, terms)
    assert count == 2
    assert matched == ["mri", "stroke"]


def test_count_matches_case_insensitive_and_whitespace():
    text = "Magnetic Resonance Imaging (MRI) for Ischemic Stroke"
    terms = [" MRI ", "ISCHEMIC STROKE", "PET scan"]
    count, matched = _count_matches(text.lower(), terms)
    assert count == 2
    assert matched == ["mri", "ischemic stroke"]


def test_count_matches_empty_and_invalid_terms():
    text = "clinical trial of aspirin for cardiovascular disease"
    count, matched = _count_matches(text, ["", None, 123, "   ", "aspirin"])
    assert count == 1
    assert matched == ["aspirin"]


def test_count_matches_word_boundaries():
    text = "patient had hyperthermia"
    terms = ["term", "hyperthermia"]
    count, matched = _count_matches(text, terms)
    assert count == 1
    assert matched == ["hyperthermia"]


def test_prefilter_study_clear():
    title = "MRI in Ischemic Stroke"
    # Long abstract (>80 words)
    abstract = (
        "Background and Purpose: Magnetic resonance imaging (MRI) is widely used for acute ischemic stroke evaluation. "
        "Methods: We conducted a prospective cohort study of 200 adult patients undergoing MRI for acute ischemic stroke. "
        "Clinical assessments and neuroimaging findings were recorded at baseline and during follow-up evaluations. "
        "Results: MRI demonstrated high diagnostic accuracy and clinical efficacy in identifying early ischemic changes. "
        "Sensitivity was 94% and specificity was 91% across all diagnostic categories examined in this trial. "
        "Conclusion: MRI is a robust diagnostic modality for hyperacute ischemia identification in emergency settings."
    )
    signals = {
        "population_signals": ["stroke", "ischemic stroke"],
        "intervention_signals": ["mri"],
        "hard_exclude_signals": ["case report"],
        "lenient_outcome_signals": ["accuracy"],
    }
    res = prefilter_study(title, abstract, signals)
    assert res["population_matches"] == 2
    assert res["intervention_matches"] == 1
    assert res["hard_exclude_matches"] == []
    assert res["outcome_matches"] == 1
    assert res["has_abstract"] is True
    assert res["confidence_ceiling"] == 1.0
    assert res["prefilter_flag"] == "clear"


def test_prefilter_study_hard_exclude_hit():
    title = "Case Report: Rare stroke presentation"
    abstract = "We present a case report of a 45-year-old male with stroke symptoms."
    signals = {
        "population_signals": ["stroke"],
        "hard_exclude_signals": ["case report"],
    }
    res = prefilter_study(title, abstract, signals)
    assert res["hard_exclude_matches"] == ["case report"]
    assert res["prefilter_flag"] == "hard_exclude_hit"


def test_prefilter_study_no_abstract():
    title = "Title only study"
    res = prefilter_study(title=title, abstract="")
    assert res["has_abstract"] is False
    assert res["confidence_ceiling"] == 0.40
    assert res["prefilter_flag"] == "no_abstract"


def test_prefilter_study_short_abstract():
    title = "Short abstract study"
    abstract = "Brief abstract with few words."
    res = prefilter_study(title=title, abstract=abstract)
    assert res["confidence_ceiling"] == 0.55
    assert res["prefilter_flag"] == "short_abstract"


def test_prefilter_study_weak_signals():
    title = "Onology study on lung neoplasms"
    abstract = "A randomized trial evaluating chemotherapy in non-small cell lung carcinoma over 5 years. " * 10
    signals = {
        "population_signals": ["ischemic stroke"],
        "intervention_signals": ["mri"],
    }
    res = prefilter_study(title, abstract, signals)
    assert res["population_matches"] == 0
    assert res["intervention_matches"] == 0
    assert res["prefilter_flag"] == "weak_signals"
