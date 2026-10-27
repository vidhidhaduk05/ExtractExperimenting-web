"""Unit tests for Antigravity SDK tool wrappers.

Each test mocks the underlying VDExtract services (DB backend, LLM extractor,
PDF service, auto-extract, biomni) to verify the tool wrappers:
- Return JSON-serializable dicts
- Handle missing data gracefully
- Delegate correctly to the underlying services
- Validate inputs and return error dicts on invalid data
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from services import agent_tools as tools


# ──────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Create a mock DBBackend."""
    db = MagicMock()
    db.get = MagicMock(return_value=None)
    db.query = MagicMock(return_value=[])
    db.insert = MagicMock(return_value=None)
    db.update = MagicMock(return_value=None)
    db.commit = MagicMock(return_value=None)
    return db


@pytest.fixture
def mock_study():
    return {
        "study_id": "s1",
        "project_id": "p1",
        "title": "Effect of SGLT2 inhibitors on heart failure mortality",
        "abstract": "A randomized trial of 1000 patients...",
        "authors": "Smith et al.",
        "journal": "NEJM",
        "pub_year": 2023,
        "screening_status": "pending",
        "screening_stage": "",
    }


@pytest.fixture
def mock_project():
    return {
        "project_id": "p1",
        "name": "Heart Failure Review",
        "pico_json": json.dumps({
            "population": "heart failure patients",
            "intervention": "SGLT2 inhibitors",
            "comparator": "placebo",
            "outcome": "mortality",
        }),
        "exclusion_reasons_json": json.dumps([
            {"label": "pediatric population"},
            {"label": "animal study"},
        ]),
        "review_type": "intervention",
        "status": "active",
    }


@pytest.fixture
def mock_variables():
    return [
        {"variable_id": "v1", "name": "sample_size", "field_type": "number",
         "description": "Total participants", "section": "Cohort_Level",
         "allowed_values": "", "order_index": 1},
        {"variable_id": "v2", "name": "mean_age", "field_type": "number",
         "description": "Mean age in years", "section": "Cohort_Level",
         "allowed_values": "", "order_index": 2},
    ]


# ──────────────────────────────────────────────────────────────────────
# get_study
# ──────────────────────────────────────────────────────────────────────

class TestGetStudy:
    @patch("services.agent_tools.get_db_backend")
    def test_returns_study_data(self, mock_get_db, mock_db, mock_study):
        mock_db.get.return_value = mock_study
        mock_get_db.return_value = mock_db
        result = tools.get_study("s1")
        assert result["study_id"] == "s1"
        assert result["title"] == mock_study["title"]
        mock_db.get.assert_called_once_with("studies", "s1")

    @patch("services.agent_tools.get_db_backend")
    def test_returns_error_for_missing_study(self, mock_get_db, mock_db):
        mock_db.get.return_value = None
        mock_get_db.return_value = mock_db
        result = tools.get_study("nonexistent")
        assert result["error"] == "not found"
        assert result["study_id"] == "nonexistent"

    @patch("services.agent_tools.get_db_backend")
    def test_strips_non_serializable_values(self, mock_get_db, mock_db):
        mock_db.get.return_value = {
            "study_id": "s1",
            "title": "Test",
            "binary_data": b"\x00\x01",
            "complex_obj": object(),
        }
        mock_get_db.return_value = mock_db
        result = tools.get_study("s1")
        assert result["study_id"] == "s1"
        assert isinstance(result["binary_data"], str)
        assert isinstance(result["complex_obj"], str)


# ──────────────────────────────────────────────────────────────────────
# get_project
# ──────────────────────────────────────────────────────────────────────

class TestGetProject:
    @patch("services.agent_tools.get_db_backend")
    def test_returns_parsed_project(self, mock_get_db, mock_db, mock_project):
        mock_db.get.return_value = mock_project
        mock_get_db.return_value = mock_db
        result = tools.get_project("p1")
        assert result["project_id"] == "p1"
        assert result["pico"]["population"] == "heart failure patients"
        assert result["exclusion_reasons"] == ["pediatric population", "animal study"]

    @patch("services.agent_tools.get_db_backend")
    def test_returns_error_for_missing_project(self, mock_get_db, mock_db):
        mock_db.get.return_value = None
        mock_get_db.return_value = mock_db
        result = tools.get_project("nonexistent")
        assert result["error"] == "not found"

    @patch("services.agent_tools.get_db_backend")
    def test_handles_malformed_json(self, mock_get_db, mock_db):
        mock_db.get.return_value = {
            "project_id": "p1",
            "name": "Test",
            "pico_json": "{invalid json}",
            "exclusion_reasons_json": "not a list",
        }
        mock_get_db.return_value = mock_db
        result = tools.get_project("p1")
        assert result["pico"] == {}
        assert result["exclusion_reasons"] == []


# ──────────────────────────────────────────────────────────────────────
# get_pdf_text
# ──────────────────────────────────────────────────────────────────────

class TestGetPdfText:
    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_db_backend")
    def test_returns_pdf_data(self, mock_get_db, mock_pdf, mock_db):
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = {
            "full_text": "This is the full text...",
            "pages": [{"page": 1, "text": "This is..."}],
            "processor_engine": "docling",
        }
        result = tools.get_pdf_text("s1")
        assert result["full_text"] == "This is the full text..."
        assert len(result["pages"]) == 1
        assert result["processor_engine"] == "docling"

    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_db_backend")
    def test_returns_empty_when_no_pdf(self, mock_get_db, mock_pdf, mock_db):
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = None
        result = tools.get_pdf_text("s1")
        assert result["full_text"] == ""
        assert result["pages"] == []
        assert result["processor_engine"] == "none"


# ──────────────────────────────────────────────────────────────────────
# get_project_variables
# ──────────────────────────────────────────────────────────────────────

class TestGetProjectVariables:
    @patch("services.agent_tools.get_db_backend")
    def test_returns_variables(self, mock_get_db, mock_db, mock_variables):
        mock_db.query.return_value = mock_variables
        mock_get_db.return_value = mock_db
        result = tools.get_project_variables("p1")
        assert len(result) == 2
        assert result[0]["variable_id"] == "v1"
        assert result[0]["name"] == "sample_size"
        mock_db.query.assert_called_once_with(
            "variables", {"project_id": "p1"}, order_by="section"
        )

    @patch("services.agent_tools.get_db_backend")
    def test_returns_empty_list_when_no_variables(self, mock_get_db, mock_db):
        mock_db.query.return_value = []
        mock_get_db.return_value = mock_db
        result = tools.get_project_variables("p1")
        assert result == []


# ──────────────────────────────────────────────────────────────────────
# screen_title
# ──────────────────────────────────────────────────────────────────────

class TestScreenTitle:
    @patch("services.agent_tools.get_client")
    @patch("services.agent_tools.screen_title_only_with_llm")
    @patch("services.agent_tools.get_db_backend")
    def test_returns_screening_result(self, mock_get_db, mock_screen, mock_client,
                                       mock_db, mock_study, mock_project):
        mock_db.get.side_effect = [mock_study, mock_project]
        mock_get_db.return_value = mock_db
        mock_screen.return_value = {
            "decision": "include",
            "confidence": 0.85,
            "reason_text": "Population and intervention match",
            "reason_code": "",
            "matched_keywords": ["SGLT2", "heart failure"],
        }
        result = tools.screen_title("s1", "p1")
        assert result["decision"] == "include"
        assert result["confidence"] == 0.85
        assert result["reason"] == "Population and intervention match"
        assert "SGLT2" in result["matched_keywords"]

    @patch("services.agent_tools.get_db_backend")
    def test_returns_error_when_study_missing(self, mock_get_db, mock_db):
        mock_db.get.return_value = None
        mock_get_db.return_value = mock_db
        result = tools.screen_title("s1", "p1")
        assert result["error"] == "study or project not found"


# ──────────────────────────────────────────────────────────────────────
# screen_title_abstract
# ──────────────────────────────────────────────────────────────────────

class TestScreenTitleAbstract:
    @patch("services.agent_tools.get_client")
    @patch("services.agent_tools.screen_title_abstract_with_llm")
    @patch("services.agent_tools.get_db_backend")
    def test_returns_result_with_clarification(self, mock_get_db, mock_screen,
                                                mock_client, mock_db, mock_study, mock_project):
        mock_db.get.side_effect = [mock_study, mock_project]
        mock_get_db.return_value = mock_db
        mock_screen.return_value = {
            "decision": "uncertain",
            "confidence": 0.45,
            "reason_text": "Ambiguous population",
            "reason_code": "ambiguous_population",
            "evidence_quote": "patients with cardiac conditions",
            "needs_clarification": True,
            "clarification_question": "Does the study include heart failure patients specifically?",
            "clarification_options": ["yes", "no"],
        }
        result = tools.screen_title_abstract("s1", "p1")
        assert result["decision"] == "uncertain"
        assert result["needs_clarification"] is True
        assert result["clarification_question"] != ""
        assert result["evidence_quote"] != ""


# ──────────────────────────────────────────────────────────────────────
# screen_fulltext
# ──────────────────────────────────────────────────────────────────────

class TestScreenFulltext:
    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_client")
    @patch("services.agent_tools.screen_fulltext_with_llm")
    @patch("services.agent_tools.get_db_backend")
    def test_screens_with_full_text(self, mock_get_db, mock_screen, mock_client,
                                     mock_pdf, mock_db, mock_study, mock_project):
        mock_db.get.side_effect = [mock_study, mock_project]
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = {"full_text": "Full text here...", "pages": []}
        mock_screen.return_value = {
            "decision": "include",
            "confidence": 0.9,
            "reason_text": "Meets all PICO criteria",
            "reason_code": "",
            "evidence_quote": "1000 HF patients randomized to empagliflozin vs placebo",
        }
        result = tools.screen_fulltext("s1", "p1")
        assert result["decision"] == "include"
        assert result["confidence"] == 0.9

    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_client")
    @patch("services.agent_tools.screen_fulltext_with_llm")
    @patch("services.agent_tools.get_db_backend")
    def test_falls_back_to_abstract(self, mock_get_db, mock_screen, mock_client,
                                     mock_pdf, mock_db, mock_study, mock_project):
        mock_db.get.side_effect = [mock_study, mock_project]
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = None
        mock_screen.return_value = {
            "decision": "exclude",
            "confidence": 0.7,
            "reason_text": "No full text, abstract suggests wrong population",
            "reason_code": "population_mismatch",
            "evidence_quote": "",
        }
        result = tools.screen_fulltext("s1", "p1")
        assert result["decision"] == "exclude"


# ──────────────────────────────────────────────────────────────────────
# extract_variables
# ──────────────────────────────────────────────────────────────────────

class TestExtractVariables:
    @patch("services.agent_tools.get_db_backend")
    @patch("services.agent_tools.auto_extract_service.auto_extract")
    def test_returns_extraction_results(self, mock_auto, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        mock_auto.return_value = {
            "extracted_count": 5,
            "skipped_count": 1,
            "message": "Extraction complete",
        }
        mock_db.query.return_value = [
            {"variable_id": "v1", "variable_name": "sample_size", "value": "1000",
             "confidence": 0.9, "confidence_tag": "[VS]", "source_page": 3,
             "source_text": "1000 patients were enrolled"},
            {"variable_id": "v2", "variable_name": "mean_age", "value": "Not found",
             "confidence": 0.0, "confidence_tag": "[NF]", "source_page": None,
             "source_text": ""},
        ]
        result = tools.extract_variables("s1", "p1")
        assert result["extracted_count"] == 5
        assert len(result["extractions"]) == 2
        assert result["extractions"][0]["value"] == "1000"
        assert result["extractions"][1]["value"] == "Not found"

    @patch("services.agent_tools.get_db_backend")
    @patch("services.agent_tools.auto_extract_service.auto_extract")
    def test_handles_extraction_error(self, mock_auto, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        mock_auto.side_effect = RuntimeError("LLM unavailable")
        result = tools.extract_variables("s1", "p1")
        assert result["error"] is not None
        assert result["extracted_count"] == 0
        assert result["extractions"] == []


# ──────────────────────────────────────────────────────────────────────
# recheck_extractions
# ──────────────────────────────────────────────────────────────────────

class TestRecheckExtractions:
    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_db_backend")
    def test_rechecks_and_persists(self, mock_get_db, mock_pdf, mock_db):
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = {"full_text": "Mean age was 65 years", "pages": []}
        mock_db.query.return_value = [
            {"extraction_id": "e1", "variable_name": "mean_age", "value": "Not found",
             "confidence": 0.0, "confidence_tag": "[NF]"},
        ]
        with patch("services.exhaustive_search.recheck_missing") as mock_recheck:
            mock_recheck.return_value = [
                {"extraction_id": "e1", "variable_name": "mean_age",
                 "value": "65", "confidence": 0.8, "confidence_tag": "[S]",
                 "source_text": "Mean age was 65 years", "source_page": 2,
                 "_prev_value": "Not found"},
            ]
            result = tools.recheck_extractions("s1", "p1")
            assert result["rechecked_count"] == 1
            assert result["updated_extractions"][0]["value"] == "65"
            mock_db.update.assert_called()
            mock_db.commit.assert_called()

    @patch("services.agent_tools.pdf_service.get_pdf_data")
    @patch("services.agent_tools.get_db_backend")
    def test_returns_empty_when_no_extractions(self, mock_get_db, mock_pdf, mock_db):
        mock_get_db.return_value = mock_db
        mock_pdf.return_value = {"full_text": "text", "pages": []}
        mock_db.query.return_value = []
        result = tools.recheck_extractions("s1", "p1")
        assert result["rechecked_count"] == 0
        assert "No extractions" in result["message"]


# ──────────────────────────────────────────────────────────────────────
# query_biomedical_entity
# ──────────────────────────────────────────────────────────────────────

class TestQueryBiomedicalEntity:
    @patch("services.agent_tools.biomni_service.query_biomedical_entity")
    def test_returns_entity_results(self, mock_biomni):
        mock_biomni.return_value = {
            "type": "uniprot",
            "results": [{"accession": "P12345", "name": "Test protein"}],
        }
        result = tools.query_biomedical_entity("uniprot", "TP53")
        assert result["type"] == "uniprot"
        assert len(result["results"]) == 1

    @patch("services.agent_tools.biomni_service.query_biomedical_entity")
    def test_handles_service_error(self, mock_biomni):
        mock_biomni.side_effect = RuntimeError("API down")
        result = tools.query_biomedical_entity("hpo", "HP:0001")
        assert result["error"] is not None
        assert result["results"] == []


# ──────────────────────────────────────────────────────────────────────
# update_screening_status
# ──────────────────────────────────────────────────────────────────────

class TestUpdateScreeningStatus:
    @patch("services.agent_tools.get_db_backend")
    def test_updates_valid_status(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.update_screening_status("s1", "included", "ta", "Matches PICO", 0.9)
        assert result["updated"] is True
        assert result["new_status"] == "included"
        mock_db.update.assert_called_once()
        mock_db.commit.assert_called()

    @patch("services.agent_tools.get_db_backend")
    def test_rejects_invalid_status(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.update_screening_status("s1", "maybe", "ta", "test", 0.5)
        assert result["error"] is not None
        assert "maybe" in result["error"]
        mock_db.update.assert_not_called()

    @patch("services.agent_tools.get_db_backend")
    def test_rejects_invalid_stage(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.update_screening_status("s1", "included", "xyz", "test", 0.5)
        assert result["error"] is not None
        mock_db.update.assert_not_called()


# ──────────────────────────────────────────────────────────────────────
# create_clarification_question
# ──────────────────────────────────────────────────────────────────────

class TestCreateClarificationQuestion:
    @patch("services.agent_tools.get_db_backend")
    def test_creates_question_and_updates_study(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.create_clarification_question(
            study_id="s1",
            project_id="p1",
            question="Does this study include HF patients?",
            options=[{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}],
            ai_decision="uncertain",
            ai_confidence=0.4,
            ai_reason="Population description is ambiguous",
        )
        assert result["question_id"] is not None
        assert result["status"] == "awaiting_clarification"
        # Should insert the question and update the study
        mock_db.insert.assert_called_once()
        assert mock_db.update.call_count == 1
        mock_db.commit.assert_called()

    @patch("services.agent_tools.get_db_backend")
    def test_handles_string_options(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.create_clarification_question(
            study_id="s1",
            project_id="p1",
            question="Is this an RCT?",
            options=["yes", "no"],
            ai_decision="uncertain",
            ai_confidence=0.3,
            ai_reason="Study design unclear",
        )
        assert result["question_id"] is not None
        # Verify options were converted to dicts
        insert_call = mock_db.insert.call_args
        options_json = insert_call[0][1]["options_json"]
        parsed = json.loads(options_json)
        assert parsed[0]["value"] == "yes"

    @patch("services.agent_tools.get_db_backend")
    def test_uses_default_options_when_empty(self, mock_get_db, mock_db):
        mock_get_db.return_value = mock_db
        result = tools.create_clarification_question(
            study_id="s1",
            project_id="p1",
            question="Include this study?",
            options=[],
            ai_decision="uncertain",
            ai_confidence=0.5,
            ai_reason="Borderline",
        )
        insert_call = mock_db.insert.call_args
        options_json = insert_call[0][1]["options_json"]
        parsed = json.loads(options_json)
        assert len(parsed) == 2  # Default yes/no
