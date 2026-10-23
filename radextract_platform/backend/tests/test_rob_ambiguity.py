"""Unit tests for RoB tool selection ambiguity detection and LLM fallback (§1.3)."""
import pytest
from services.rob_tools import select_rob_tool_with_alternatives
from services.rob_classification_service import classify_study


def test_ambiguous_design_detection():
    # String contains both RCT and observational cohort keywords
    design = "A randomized controlled trial with an observational cohort extension"
    tool, conf, alts = select_rob_tool_with_alternatives(design)
    assert tool == "rob2"
    assert conf == 0.55  # Penalized due to ambiguity
    assert "nos" in alts  # Observational cohort alternative ranked


def test_ambiguous_study_heuristic_routes_to_manual_when_no_llm():
    study = {
        "study_id": "study-ambig-1",
        "title": "Trial with Observational Followup",
        "study_design": "randomized controlled trial with prospective cohort",
        "abstract": "We conducted a randomized trial and an observational cohort.",
    }
    # With no LLM, ambiguous design (conf 0.55 < 0.70) routes to manual_review
    res = classify_study(study, pdf_data=None, threshold=0.70, model_fn=None, use_llm=False)
    assert res["status"] == "manual_review"
    assert res["tool"] == "manual"
    assert "rob2" in res["alternatives"]
    assert "nos" in res["alternatives"]


def test_ambiguous_study_llm_fallback_resolves():
    study = {
        "study_id": "study-ambig-2",
        "title": "Trial with Observational Followup",
        "study_design": "randomized controlled trial with prospective cohort",
        "abstract": "We conducted a randomized trial and an observational cohort.",
    }
    # Mock LLM fallback that adjudicates the ambiguity
    def mock_model(prompt: str) -> dict:
        return {
            "tool": "rob2",
            "study_design": "randomized controlled trial",
            "confidence": 0.95,
            "alternatives": ["nos", "robins_i"],
            "rationale": "Primary analysis was based on randomized allocation.",
            "evidence": ["randomized trial"],
        }

    res = classify_study(study, pdf_data=None, threshold=0.70, model_fn=mock_model)
    assert res["status"] == "assigned"
    assert res["tool"] == "rob2"
    assert res["confidence"] == 0.95
    assert "nos" in res["alternatives"]
