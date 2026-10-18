"""Tests for rob_ai.py — AI pre-fill, prompt construction, response parsing, mock model_fn."""
import pytest
from services.rob_ai import (
    build_domain_prompt, parse_llm_response, prefill_assessment,
    mock_model_fn, _mock_answer, _avg_confidence,
    ABSTRACT_CONFIDENCE_CEILING, FULL_TEXT_CONFIDENCE_CEILING,
)
from services.rob_tools import QUADAS_2, ROBINS_I, ROB_2, get_tool


class TestPromptConstruction:

    def test_build_domain_prompt_quadas2(self):
        domain = QUADAS_2.domains[0]
        prompt = build_domain_prompt(
            tool=QUADAS_2, domain=domain,
            study_text="This is a test study about diagnostic accuracy.",
            study_metadata={"title": "Test", "journal": "Test Journal"},
            is_full_text=True,
        )
        assert "QUADAS-2" in prompt
        assert domain.label in prompt
        assert "This is a test study" in prompt
        assert "full text" in prompt
        assert "JSON" in prompt

    def test_build_domain_prompt_abstract(self):
        domain = QUADAS_2.domains[0]
        prompt = build_domain_prompt(
            tool=QUADAS_2, domain=domain,
            study_text="Short abstract text.",
            study_metadata={"title": "Test"},
            is_full_text=False,
        )
        assert "abstract" in prompt

    def test_prompt_includes_all_signaling_questions(self):
        domain = ROBINS_I.domains[0]  # confounding
        prompt = build_domain_prompt(
            tool=ROBINS_I, domain=domain,
            study_text="test", study_metadata={}, is_full_text=True,
        )
        for sq in domain.signaling_questions:
            assert sq.key in prompt
            assert sq.text in prompt


class TestResponseParsing:

    def test_parse_dict_response(self):
        domain = QUADAS_2.domains[0]
        raw = {
            "answers": [
                {"question_key": "sq_1_1", "answer": "yes", "quote": "consecutive", "page": 1, "confidence": 0.9},
                {"question_key": "sq_1_2", "answer": "yes", "quote": "no case-control", "page": 1, "confidence": 0.8},
            ],
            "domain_judgment": "low",
            "domain_support": "Good methods",
        }
        result = parse_llm_response(raw, domain, FULL_TEXT_CONFIDENCE_CEILING)
        assert result["ai_suggested"] == "low"
        assert "sq_1_1" in result["answers"]
        assert result["answers"]["sq_1_1"]["ai_answer"] == "yes"
        assert result["answers"]["sq_1_1"]["ai_confidence"] == 0.9

    def test_parse_string_response(self):
        domain = QUADAS_2.domains[0]
        raw = '{"answers": [{"question_key": "sq_1_1", "answer": "no", "quote": "test", "page": null, "confidence": 0.7}], "domain_judgment": "high", "domain_support": "Bad"}'
        result = parse_llm_response(raw, domain, FULL_TEXT_CONFIDENCE_CEILING)
        assert result["ai_suggested"] == "high"
        assert result["answers"]["sq_1_1"]["ai_answer"] == "no"

    def test_confidence_ceiling_applied(self):
        domain = QUADAS_2.domains[0]
        raw = {
            "answers": [
                {"question_key": "sq_1_1", "answer": "yes", "quote": "test", "page": 1, "confidence": 0.99},
            ],
            "domain_judgment": "low",
            "domain_support": "test",
        }
        result = parse_llm_response(raw, domain, ABSTRACT_CONFIDENCE_CEILING)
        assert result["answers"]["sq_1_1"]["ai_confidence"] == ABSTRACT_CONFIDENCE_CEILING

    def test_invalid_answer_option_filtered(self):
        domain = QUADAS_2.domains[0]
        raw = {
            "answers": [
                {"question_key": "sq_1_1", "answer": "maybe", "quote": "", "page": None, "confidence": 0.5},
            ],
            "domain_judgment": "low",
            "domain_support": "",
        }
        result = parse_llm_response(raw, domain, FULL_TEXT_CONFIDENCE_CEILING)
        assert result["answers"]["sq_1_1"]["ai_answer"] == ""  # invalid option → blank

    def test_malformed_string_returns_empty(self):
        domain = QUADAS_2.domains[0]
        result = parse_llm_response("not json at all", domain, 1.0)
        assert result["answers"] == {}
        assert result["ai_suggested"] == ""


class TestMockModelFn:

    def test_mock_returns_dict(self):
        prompt = build_domain_prompt(
            tool=QUADAS_2, domain=QUADAS_2.domains[0],
            study_text="This was a consecutive prospective study with blinded interpretation.",
            study_metadata={"title": "Test"}, is_full_text=True,
        )
        result = mock_model_fn(prompt, tool="quadas2", domain="patient_selection")
        assert isinstance(result, dict)
        assert "answers" in result
        assert "domain_judgment" in result
        assert len(result["answers"]) == 3  # 3 SQs in patient_selection

    def test_mock_detects_consecutive(self):
        answer, conf, quote = _mock_answer(
            "sq_1_1", "was a consecutive or random sample enrolled",
            "consecutive patients were enrolled in this prospective study",
            "quadas2", ["yes", "no", "unclear"],
        )
        assert answer == "yes"
        assert conf > 0.5

    def test_mock_detects_retrospective(self):
        answer, conf, quote = _mock_answer(
            "sq_1_2", "was a case-control design avoided",
            "this was a retrospective case-control study",
            "quadas2", ["yes", "no", "unclear"],
        )
        assert answer == "no"

    def test_mock_detects_not_reported(self):
        answer, conf, quote = _mock_answer(
            "sq_1_1", "test question",
            "the method was not reported in the text",
            "quadas2", ["yes", "no", "unclear"],
        )
        assert answer == "unclear"


class TestPrefillAssessment:

    def test_prefill_with_full_text(self):
        metadata = {"title": "Test", "study_design": "diagnostic accuracy"}
        result = prefill_assessment(
            tool_key="quadas2",
            study_metadata=metadata,
            full_text="This was a consecutive prospective study with blinded interpretation and MRI as reference standard. All patients received the same reference standard within an appropriate interval.",
            model_fn=mock_model_fn,
        )
        assert result["used_full_text"] is True
        assert len(result["domains"]) == 4
        assert result["warnings"] == []

    def test_prefill_with_abstract_fallback(self):
        metadata = {"title": "Test"}
        result = prefill_assessment(
            tool_key="quadas2",
            study_metadata=metadata,
            abstract="Short abstract about the study.",
            model_fn=mock_model_fn,
        )
        assert result["used_full_text"] is False
        assert len(result["warnings"]) == 1
        assert "abstract" in result["warnings"][0].lower()

    def test_prefill_no_text(self):
        result = prefill_assessment(
            tool_key="quadas2",
            study_metadata={},
            model_fn=mock_model_fn,
        )
        assert result["used_full_text"] is False
        assert len(result["warnings"]) == 1
        assert result["domains"] == {}

    def test_prefill_invalid_tool_raises(self):
        with pytest.raises(ValueError, match="Unknown RoB tool"):
            prefill_assessment("invalid", {}, full_text="test", model_fn=mock_model_fn)

    def test_prefill_robins_i(self):
        metadata = {"title": "Test", "study_design": "cohort"}
        result = prefill_assessment(
            tool_key="robins_i",
            study_metadata=metadata,
            full_text="This was a retrospective cohort study with adjusted analysis using propensity score matching. Intervention groups were clearly defined and recorded at the start of the intervention.",
            model_fn=mock_model_fn,
        )
        assert len(result["domains"]) == 7

    def test_avg_confidence(self):
        answers = {
            "q1": {"ai_confidence": 0.8},
            "q2": {"ai_confidence": 0.6},
        }
        assert _avg_confidence(answers) == 0.7
        assert _avg_confidence({}) == 0.0
