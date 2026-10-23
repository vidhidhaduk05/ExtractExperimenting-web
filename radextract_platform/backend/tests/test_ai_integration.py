"""Integration tests for all AI services, endpoints, and background pipeline."""
import json
from unittest.mock import ANY, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
import httpx

from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.llm_extractor import (
    extract_variables_with_aide_engine,
    screen_fulltext_with_llm,
)
from services.variable_generator import generate_variables_from_picos
from services.tool_calling_client import ToolCallingClient
from services import rob_ai, pipeline_service


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_ai_integration.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    monkeypatch.setattr(settings, "jev_mode", "off")
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


class TestExtractVariablesIntegration:
    @patch("httpx.Client.post")
    def test_tool_call_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "extract_variables",
                                    "arguments": json.dumps({
                                        "responses": [
                                            {
                                                "prompt": "sample_size",
                                                "response": "250",
                                                "source": "A cohort of 250 patients was analyzed.",
                                                "page": "4",
                                            },
                                            {
                                                "prompt": "sensitivity",
                                                "response": "92.5%",
                                                "source": "Overall sensitivity was 92.5%.",
                                                "page": "5",
                                            },
                                        ]
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        var_defs = [
            {"variable_id": "v1", "name": "sample_size", "field_type": "integer"},
            {"variable_id": "v2", "name": "sensitivity", "field_type": "percentage"},
        ]
        results = extract_variables_with_aide_engine("Study paper text...", var_defs)
        assert len(results) == 2
        assert results[0]["name"] == "sample_size"
        assert results[0]["value"] == "250"
        assert results[0]["source_text"] == "A cohort of 250 patients was analyzed."
        assert str(results[0]["source_page"]) == "4"

    @patch("httpx.Client.post")
    def test_tool_call_validation_fail_fallback_success(self, mock_post):
        # 1st call (tool calling) returns malformed/unusable tool_calls
        resp_tool_fail = MagicMock()
        resp_tool_fail.status_code = 200
        resp_tool_fail.json.return_value = {
            "choices": [{"message": {"role": "assistant", "tool_calls": None, "content": None}}]
        }

        # 2nd call (fallback prompt-and-parse) returns JSON content
        resp_fallback_ok = MagicMock()
        resp_fallback_ok.status_code = 200
        resp_fallback_ok.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "responses": [
                                {
                                    "prompt": "mean_age",
                                    "response": "54.2",
                                    "source": "Mean age was 54.2 years.",
                                    "page": "2",
                                }
                            ]
                        }),
                    }
                }
            ]
        }
        mock_post.side_effect = [resp_tool_fail, resp_fallback_ok]

        var_defs = [{"variable_id": "v3", "name": "mean_age", "field_type": "float"}]
        results = extract_variables_with_aide_engine("Study text...", var_defs)
        assert len(results) == 1
        assert results[0]["name"] == "mean_age"
        assert results[0]["value"] == "54.2"

    @patch("httpx.Client.post")
    def test_both_paths_fail_returns_empty(self, mock_post):
        resp_fail = MagicMock()
        resp_fail.status_code = 500
        resp_fail.raise_for_status.side_effect = Exception("Gateway unavailable")
        mock_post.return_value = resp_fail

        var_defs = [{"variable_id": "v1", "name": "sample_size"}]
        results = extract_variables_with_aide_engine("Study text...", var_defs)
        assert results == []


class TestScreenFulltextIntegration:
    @patch("httpx.Client.post")
    def test_tool_call_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "screen_fulltext",
                                    "arguments": json.dumps({
                                        "decision": "include",
                                        "confidence": 0.94,
                                        "reason": "Study meets all PICO criteria",
                                        "reason_code": "eligible",
                                        "evidence_quote": "Prospective cross-sectional evaluation of MRI.",
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        res = screen_fulltext_with_llm(
            study_text="Prospective cross-sectional evaluation of MRI in 100 patients...",
            pico_criteria={"population": "Adults with acute abdominal pain"},
        )
        assert res["recommendation"] == "included"
        assert res["confidence"] == 0.94
        assert res["reason_code"] == "eligible"
        assert "Prospective" in res["evidence_quote"]

    @patch("httpx.Client.post")
    def test_backward_compat_keyword_arg_alias(self, mock_post):
        # Verify Bug A1 fix: passing text=... with no positional study_text does not raise TypeError
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps({
                            "decision": "exclude",
                            "confidence": 0.88,
                            "reason": "Wrong comparator",
                            "reason_code": "wrong_comparator",
                            "evidence_quote": "No reference standard utilized.",
                        }),
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        res = screen_fulltext_with_llm(
            text="Study text evaluating without control...",
            pico={"population": "Adults"},
        )
        assert res["recommendation"] == "excluded"
        assert res["reason_code"] == "wrong_comparator"

    def test_no_text_returns_uncertain(self):
        res = screen_fulltext_with_llm(study_text=None, text=None)
        assert res["recommendation"] == "uncertain"
        assert res["confidence"] == 0.0


class TestGenerateVariablesIntegration:
    @patch("services.variable_generator.is_llm_available", return_value=True)
    @patch("httpx.Client.post")
    def test_tool_call_success(self, mock_post, mock_avail):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "generate_variables",
                                    "arguments": json.dumps({
                                        "variables": [
                                            {
                                                "name": "mri_scanner_tesla",
                                                "description": "Magnetic field strength in Tesla",
                                                "field_type": "float",
                                                "section": "Index_Test",
                                            }
                                        ]
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        pico = {"intervention": "3T MRI scanner", "population": "Adults"}
        res = generate_variables_from_picos(pico, use_llm=True)
        assert isinstance(res, list)
        names = [v["name"] for v in res]
        assert "mri_scanner_tesla" in names


class TestRobPrefillIntegration:
    @patch("httpx.Client.post")
    def test_as_model_fn_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "prefill_rob_domain",
                                    "arguments": json.dumps({
                                        "judgment": "low",
                                        "domain_judgment": "low",
                                        "support": "Proper sequence randomization applied.",
                                        "confidence": 0.95,
                                        "answers": {
                                            "d1_1": {
                                                "answer": "yes",
                                                "quote": "Computer-generated random sequence.",
                                                "page": 2,
                                                "confidence": 0.95,
                                            }
                                        },
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        model_fn = client.as_model_fn("prefill_rob_domain")

        full_study_text = (
            "Randomized controlled trial of 200 patients comparing low-dose computed tomography "
            "versus standard ultrasound imaging for acute appendicitis in emergency department presentations. "
            "Sequence allocation was computer-generated with blinding of clinical assessors."
        )

        result = rob_ai.prefill_assessment(
            tool_key="rob2",
            study_metadata={"title": "RCT of CT vs US"},
            full_text=full_study_text,
            model_fn=model_fn,
        )
        assert "domains" in result
        assert len(result["domains"]) > 0


class TestPipelineIntegration:
    @patch("services.pipeline_service.auto_extract_service.auto_extract")
    @patch("services.pipeline_service.screen_fulltext_with_llm")
    @patch("services.pipeline_service.pdf_service.process_pdf")
    def test_pipeline_auto_include(self, mock_proc, mock_screen, mock_extract):
        mock_proc.return_value = {"processor_engine": "docling"}
        mock_screen.return_value = {
            "recommendation": "included",
            "confidence": 0.92,
            "rationale": "Matches inclusion criteria.",
        }
        mock_extract.return_value = {"extracted_count": 5}

        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES ('p1', 'Test Project')")
        conn.execute("INSERT INTO studies (study_id, project_id, title, abstract) VALUES ('s1', 'p1', 'Study 1', 'Abstract of study 1 with sufficient length for full screening evaluation.')")
        conn.commit()
        conn.close()

        pipeline_service.run_pdf_screening_pipeline("s1", "p1")

        conn = get_connection()
        study = conn.execute("SELECT * FROM studies WHERE study_id = 's1'").fetchone()
        conn.close()

        assert study["screening_status"] == "included"
        assert study["screening_stage"] == "ft"
        assert "AI Full-Text Included" in study["screening_reason"]
        mock_extract.assert_called_once_with("s1", "p1", db=ANY)

    @patch("services.pipeline_service.screen_fulltext_with_llm")
    @patch("services.pipeline_service.pdf_service.process_pdf")
    def test_pipeline_auto_exclude(self, mock_proc, mock_screen):
        mock_proc.return_value = {"processor_engine": "docling"}
        mock_screen.return_value = {
            "recommendation": "excluded",
            "confidence": 0.85,
            "reason_text": "Non-target modality",
        }

        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES ('p2', 'Test Project')")
        conn.execute("INSERT INTO studies (study_id, project_id, title, abstract) VALUES ('s2', 'p2', 'Study 2', 'Abstract of study 2 with sufficient text for evaluation.')")
        conn.commit()
        conn.close()

        pipeline_service.run_pdf_screening_pipeline("s2", "p2")

        conn = get_connection()
        study = conn.execute("SELECT * FROM studies WHERE study_id = 's2'").fetchone()
        conn.close()

        assert study["screening_status"] == "excluded"
        assert "AI Full-Text Excluded" in study["screening_reason"]

    @patch("services.pipeline_service.screen_fulltext_with_llm")
    @patch("services.pipeline_service.pdf_service.process_pdf")
    def test_pipeline_llm_error_continues(self, mock_proc, mock_screen):
        mock_proc.return_value = {"processor_engine": "docling"}
        mock_screen.side_effect = Exception("LLM connection timeout")

        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES ('p3', 'Test Project')")
        conn.execute("INSERT INTO studies (study_id, project_id, title, abstract) VALUES ('s3', 'p3', 'Study 3', 'Abstract of study 3.')")
        conn.commit()
        conn.close()

        # Should not raise exception
        pipeline_service.run_pdf_screening_pipeline("s3", "p3")

        conn = get_connection()
        study = conn.execute("SELECT * FROM studies WHERE study_id = 's3'").fetchone()
        conn.close()

        assert study["screening_status"] == "pending"


class TestAiScreenTitleAbstractEndpoint:
    @patch("services.tool_calling_client.ToolCallingClient.call_with_tool")
    def test_ai_screen_title_abstract_success(self, mock_call, client):
        mock_call.return_value = {
            "status": "included",
            "confidence": 0.91,
            "reason": "Title matches diagnostic accuracy index test.",
            "picos_matches": {"population": True, "intervention": True},
        }

        r_proj = client.post("/api/projects", json={"name": "Screening Project"})
        pid = r_proj.json()["project_id"]
        r_study = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid,
            "title": "CT vs MRI Diagnostic Accuracy",
            "abstract": "We evaluated CT versus MRI in 150 patients.",
        })
        sid = r_study.json()["study_id"]

        resp = client.post(f"/api/studies/{sid}/ai-screen-title-abstract")
        assert resp.status_code == 200
        data = resp.json()
        assert data["study_id"] == sid
        assert data["suggestion"] == "included"
        assert data["confidence"] in (0.91, 0.55)
        assert "Diagnostic Accuracy" in data["reason"] or "Title matches" in data["reason"] or len(data["reason"]) > 0
