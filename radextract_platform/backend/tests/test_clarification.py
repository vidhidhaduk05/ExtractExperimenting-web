"""Tests for Interactive AI Screening with Mid-Pipeline Clarification Questions."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from config import settings
from database import init_db, reset_db, get_connection
from main import app
from dependencies import get_current_user, get_current_user_optional
from services.clarification_generator import screen_with_clarification
from services.clarification_resolver import resolve_clarification


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_clar.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "human_reviewer1", "username": "Human Reviewer", "role": "owner"}
    app.dependency_overrides[get_current_user_optional] = lambda: {"user_id": "human_reviewer1", "username": "Human Reviewer", "role": "owner"}
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        ("human_reviewer1", "Human Reviewer", "test", "reviewer")
    )
    conn.commit()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project(client):
    r = client.post("/api/projects", json={"name": "Clarification Test"})
    assert r.status_code == 200
    return r.json()["project_id"]


@pytest.fixture
def project_with_pico(client, project):
    client.put(
        f"/api/projects/{project}/pico",
        json={
            "population": "patients with heart failure",
            "intervention": "SGLT2 inhibitors",
            "comparator": "placebo",
            "outcome": "all-cause mortality",
        },
    )
    return project


# ═══════════════════════════════════════════════════════════════════════
#  1-10: Clarification Question Generation
# ═══════════════════════════════════════════════════════════════════════

def test_screen_returns_needs_clarification():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "confidence": 0.5,
        "reason": "Unclear study design from abstract.",
        "clarification": {
            "question_type": "study_design",
            "pico_aspect": "study_design",
            "question_text": "What study design is this study?",
            "context_excerpt": "We performed a prospective evaluation of 100 patients.",
            "options": [
                {"value": "rct", "label": "Randomized controlled trial"},
                {"value": "cohort", "label": "Cohort study"},
            ],
            "interim_decision": "uncertain",
            "interim_reason": "Could be RCT or observational cohort.",
        },
    }

    res = screen_with_clarification(
        title="Prospective evaluation of SGLT2i",
        abstract="We performed a prospective evaluation of 100 patients with heart failure.",
        pico_criteria={"population": "heart failure", "intervention": "SGLT2i"},
        client=mock_client,
    )

    assert res["recommendation"] == "needs_clarification"
    assert "clarification" in res
    assert res["clarification"]["question_type"] == "study_design"
    assert len(res["clarification"]["options"]) == 2


def test_clarification_has_valid_options():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "population_match",
            "options": [
                {"value": "yes", "label": "Yes, matches"},
                {"value": "no", "label": "No, doesn't match"},
            ],
            "question_text": "Does this match heart failure?",
        },
    }

    res = screen_with_clarification(
        title="Study Title",
        abstract="Some abstract text here.",
        pico_criteria={},
        client=mock_client,
    )
    assert res["recommendation"] == "needs_clarification"
    opts = res["clarification"]["options"]
    assert len(opts) >= 2
    for o in opts:
        assert "value" in o and "label" in o


def test_clarification_has_context_excerpt():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "study_design",
            "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
            "context_excerpt": "Sentence explaining design.",
        },
    }

    res = screen_with_clarification(
        title="Study Title",
        abstract="Sentence explaining design in full detail.",
        pico_criteria={},
        client=mock_client,
    )
    assert res["clarification"]["context_excerpt"] == "Sentence explaining design."


def test_screen_returns_definitive_when_confident():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "include",
        "confidence": 0.95,
        "reason": "Direct match to PICO criteria.",
    }

    res = screen_with_clarification(
        title="Clear RCT of SGLT2i",
        abstract="Randomized controlled trial of 500 heart failure patients.",
        pico_criteria={},
        client=mock_client,
    )
    assert res["recommendation"] == "included"
    assert "clarification" not in res


def test_screen_returns_uncertain_when_vague():
    res = screen_with_clarification(
        title="",
        abstract="",
        pico_criteria={},
    )
    assert res["recommendation"] == "uncertain"
    assert "clarification" not in res


def test_clarification_study_design_type():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "study_design",
            "pico_aspect": "study_design",
            "question_text": "What study design is this study?",
            "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
        },
    }
    res = screen_with_clarification("Title", "Abstract", {}, client=mock_client)
    assert res["clarification"]["question_type"] == "study_design"


def test_clarification_population_match_type():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "population_match",
            "pico_aspect": "population",
            "question_text": "Does HFpEF match heart failure?",
            "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}],
        },
    }
    res = screen_with_clarification("Title", "Abstract", {}, client=mock_client)
    assert res["clarification"]["question_type"] == "population_match"


def test_clarification_intervention_match_type():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "intervention_match",
            "pico_aspect": "index_test",
            "question_text": "Which is the index test?",
            "options": [{"value": "mri", "label": "MRI"}, {"value": "ct", "label": "CT"}],
        },
    }
    res = screen_with_clarification("Title", "Abstract", {}, client=mock_client)
    assert res["clarification"]["question_type"] == "intervention_match"


def test_clarification_outcome_match_type():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = {
        "decision": "needs_clarification",
        "clarification": {
            "question_type": "outcome_match",
            "pico_aspect": "outcome",
            "question_text": "Does composite outcome meet all-cause mortality?",
            "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}],
        },
    }
    res = screen_with_clarification("Title", "Abstract", {}, client=mock_client)
    assert res["clarification"]["question_type"] == "outcome_match"


def test_clarification_llm_fallback():
    mock_client = MagicMock()
    mock_client.call_with_tool.return_value = None  # LLM failure
    res = screen_with_clarification("Title", "Abstract", {}, client=mock_client)
    assert res["recommendation"] == "uncertain"
    assert res["is_llm_failure"] is True
    assert "clarification" not in res


# ═══════════════════════════════════════════════════════════════════════
#  11-25: API Endpoints & Resolution
# ═══════════════════════════════════════════════════════════════════════

def test_list_clarifications_empty(client, project):
    r = client.get(f"/api/projects/{project}/clarifications")
    assert r.status_code == 200
    assert r.json() == []


def test_list_clarifications_pending(client, project):
    # Add study and clarification
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Unclear Study",
        "abstract": "We studied heart failure in 50 patients.",
    })
    sid = r_study.json()["study_id"]

    # Mock clarification generation on single screen
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "confidence": 0.5,
            "clarification": {
                "question_type": "study_design",
                "question_text": "What design?",
                "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
            },
        }
        r_screen = client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")
        assert r_screen.status_code == 200
        assert r_screen.json()["recommendation"] == "needs_clarification"

    r_list = client.get(f"/api/projects/{project}/clarifications")
    assert r_list.status_code == 200
    data = r_list.json()
    assert len(data) == 1
    assert data[0]["study_id"] == sid
    assert data[0]["status"] == "pending"
    assert data[0]["study_title"] == "Unclear Study"


def test_list_clarifications_filter_by_status(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Study 1",
        "abstract": "Abstract 1",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "question_text": "Design?",
                "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    r_pending = client.get(f"/api/projects/{project}/clarifications?status=pending")
    assert len(r_pending.json()) == 1

    r_answered = client.get(f"/api/projects/{project}/clarifications?status=answered")
    assert len(r_answered.json()) == 0


def test_get_single_clarification(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Study Single",
        "abstract": "Abstract Single",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "population_match",
                "question_text": "Match population?",
                "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    q_list = client.get(f"/api/projects/{project}/clarifications").json()
    qid = q_list[0]["question_id"]

    r_single = client.get(f"/api/clarifications/{qid}")
    assert r_single.status_code == 200
    data = r_single.json()
    assert data["question_id"] == qid
    assert data["study_title"] == "Study Single"


def test_answer_clarification(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Ambiguous RCT",
        "abstract": "Abstract describing treatment.",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "question_text": "Study design?",
                "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    q_list = client.get(f"/api/projects/{project}/clarifications").json()
    qid = q_list[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {
            "decision": "include",
            "confidence": 0.92,
            "reason": "Confirmed RCT meets inclusion criteria.",
        }
        r_ans = client.post(f"/api/clarifications/{qid}/answer", json={
            "answer": "rct",
            "answer_label": "RCT",
            "answered_by": "dr_reviewer",
        })
        assert r_ans.status_code == 200
        ans_data = r_ans.json()
        assert ans_data["status"] == "answered"
        assert ans_data["final_decision"] == "included"


def test_answer_updates_study_status(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Study Status Test",
        "abstract": "Abstract",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    # Study should be awaiting_clarification
    s_before = client.get(f"/api/studies/{sid}").json()
    assert s_before["screening_status"] == "awaiting_clarification"

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.9, "reason": "Included"}
        client.post(f"/api/clarifications/{qid}/answer", json={"answer": "rct"})

    s_after = client.get(f"/api/studies/{sid}").json()
    assert s_after["screening_status"] == "included"


def test_answer_records_screening_decision(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Study Decision Test",
        "abstract": "Abstract",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "rct", "label": "Randomized controlled trial"}, {"value": "cohort", "label": "Cohort"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.88, "reason": "Valid RCT"}
        client.post(f"/api/clarifications/{qid}/answer", json={"answer": "rct", "answer_label": "Randomized controlled trial"})

    # Check decisions
    r_dec = client.get(f"/api/projects/{project}/screening")
    assert r_dec.status_code == 200
    study_item = next(s for s in r_dec.json() if s["study_id"] == sid)
    assert study_item["screening_status"] == "included"
    assert "[CLARIFIED BY HUMAN: Randomized controlled trial]" in study_item["screening_reason"]


def test_answer_with_freetext(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Freetext Test",
        "abstract": "Abstract text",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "population_match",
                "options": [{"value": "class_ii", "label": "NYHA Class II"}, {"value": "other", "label": "Other (specify)"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.85, "reason": "Freetext verified"}
        r_ans = client.post(f"/api/clarifications/{qid}/answer", json={
            "answer": "other",
            "answer_label": "Other (specify)",
            "answer_freetext": "Study subgroup had 100% NYHA Class III patients",
        })
        assert r_ans.status_code == 200
        assert r_ans.json()["final_decision"] == "included"


def test_answer_other_option(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Other Option Test",
        "abstract": "Abstract",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "other", "label": "Other"}, {"value": "rct", "label": "RCT"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "exclude", "confidence": 0.9, "reason": "Excluded based on other"}
        r_ans = client.post(f"/api/clarifications/{qid}/answer", json={
            "answer": "other",
            "answer_freetext": "Animal in vivo model",
        })
        assert r_ans.status_code == 200
        assert r_ans.json()["final_decision"] == "excluded"


def test_answer_unsure_option(client, project):
    r_study = client.post(f"/api/projects/{project}/studies", json={
        "project_id": project,
        "title": "Unsure Test",
        "abstract": "Abstract",
    })
    sid = r_study.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "outcome_match",
                "options": [{"value": "unsure", "label": "Unsure"}, {"value": "yes", "label": "Yes"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "uncertain", "confidence": 0.4, "reason": "Still uncertain"}
        r_ans = client.post(f"/api/clarifications/{qid}/answer", json={"answer": "unsure"})
        assert r_ans.status_code == 200
        assert r_ans.json()["final_decision"] == "uncertain"


def test_batch_answer(client, project):
    qids = []
    for i in range(3):
        r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": f"Study {i}", "abstract": f"Abs {i}"})
        sid = r_s.json()["study_id"]
        with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
            mock_call.return_value = {
                "decision": "needs_clarification",
                "clarification": {
                    "question_type": "study_design",
                    "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}],
                },
            }
            client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    all_q = client.get(f"/api/projects/{project}/clarifications").json()
    assert len(all_q) == 3
    answers = [{"question_id": q["question_id"], "answer": "rct", "answer_label": "RCT"} for q in all_q]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.9, "reason": "Batch included"}
        r_batch = client.post(f"/api/projects/{project}/clarifications/batch-answer", json={"answers": answers})
        assert r_batch.status_code == 200
        assert len(r_batch.json()) == 3
        for res in r_batch.json():
            assert res["status"] == "answered"


def test_dismiss_clarification(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Dismiss Test", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]
    r_del = client.delete(f"/api/clarifications/{qid}?dismiss_reason=Not relevant")
    assert r_del.status_code == 200
    assert r_del.json()["status"] == "expired"

    s_check = client.get(f"/api/studies/{sid}").json()
    assert s_check["screening_status"] == "uncertain"


def test_clarification_stats(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Stats Study", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    r_stats = client.get(f"/api/projects/{project}/clarifications/stats")
    assert r_stats.status_code == 200
    stats = r_stats.json()
    assert stats["pending"] == 1
    assert stats["answered"] == 0
    assert stats["by_type"].get("study_design") == 1


def test_answer_already_answered_question(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Double Answer", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
            },
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.9, "reason": "Done"}
        client.post(f"/api/clarifications/{qid}/answer", json={"answer": "a"})
        r_second = client.post(f"/api/clarifications/{qid}/answer", json={"answer": "b"})
        assert r_second.status_code == 400


def test_answer_nonexistent_question(client):
    r = client.post("/api/clarifications/nonexistent-id/answer", json={"answer": "a"})
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
#  26-30: Batch Screening Integration
# ═══════════════════════════════════════════════════════════════════════

def test_batch_screen_generates_clarifications(client, project):
    # Create 3 studies
    sids = []
    for i in range(3):
        r_s = client.post(f"/api/projects/{project}/studies", json={
            "project_id": project,
            "title": f"Batch Study {i}",
            "abstract": f"Abstract content {i}",
        })
        sids.append(r_s.json()["study_id"])

    # Mock screen_with_clarification to return 1 include, 2 needs_clarification
    responses = [
        {"decision": "include", "confidence": 0.95, "reason": "Included"},
        {"decision": "needs_clarification", "confidence": 0.5, "clarification": {"question_type": "study_design", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]}},
        {"decision": "needs_clarification", "confidence": 0.5, "clarification": {"question_type": "population_match", "options": [{"value": "y", "label": "Y"}, {"value": "n", "label": "N"}]}},
    ]

    with patch("services.llm_client.ToolCallingClient.call_with_tool", side_effect=responses):
        r_batch = client.post(f"/api/projects/{project}/screening/batch-ai-screen?stage=ta")
        assert r_batch.status_code == 200
        data = r_batch.json()
        assert data["total_screened"] == 3
        assert data["included"] == 1
        assert data["clarifications_generated"] == 2


def test_batch_screen_summary_counts(client, project):
    client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "S1", "abstract": "A1"})
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {"question_type": "study_design", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]},
        }
        r_batch = client.post(f"/api/projects/{project}/screening/batch-ai-screen?stage=ta")
        assert r_batch.json()["clarifications_generated"] == 1


def test_batch_screen_sets_awaiting_status(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "S1", "abstract": "A1"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {"question_type": "study_design", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]},
        }
        client.post(f"/api/projects/{project}/screening/batch-ai-screen?stage=ta")

    s_row = client.get(f"/api/studies/{sid}").json()
    assert s_row["screening_status"] == "awaiting_clarification"


def test_single_screen_returns_clarification(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Single Screen", "abstract": "A1"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "confidence": 0.5,
            "clarification": {
                "question_type": "outcome_match",
                "question_text": "Is mortality reported?",
                "options": [{"value": "y", "label": "Yes"}, {"value": "n", "label": "No"}],
            },
        }
        resp = client.post(f"/api/studies/{sid}/ai-screen-title-abstract")
        assert resp.status_code == 200
        data = resp.json()
        assert data["recommendation"] == "needs_clarification"
        assert data["clarification"]["question_type"] == "outcome_match"


def test_clarification_then_answer_flow(client, project):
    # 1. Add study
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "End-to-End Study", "abstract": "Abstract"})
    sid = r_s.json()["study_id"]

    # 2. Batch screen generates question
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {
                "question_type": "study_design",
                "options": [{"value": "rct", "label": "RCT"}, {"value": "observational", "label": "Observational"}],
            },
        }
        client.post(f"/api/projects/{project}/screening/batch-ai-screen?stage=ta")

    # 3. Check question queue
    q_list = client.get(f"/api/projects/{project}/clarifications").json()
    assert len(q_list) == 1
    qid = q_list[0]["question_id"]

    # 4. Human answers question
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.95, "reason": "Confirmed RCT meets criteria."}
        ans_resp = client.post(f"/api/clarifications/{qid}/answer", json={"answer": "rct", "answer_label": "RCT"})
        assert ans_resp.json()["final_decision"] == "included"

    # 5. Study is final
    s_final = client.get(f"/api/studies/{sid}").json()
    assert s_final["screening_status"] == "included"


# ═══════════════════════════════════════════════════════════════════════
#  31-33: Conflicts & Summary Metrics
# ═══════════════════════════════════════════════════════════════════════

def test_clarification_answer_conflicts_with_human(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Conflict Study", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    # Human screens "included"
    client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": project,
        "reviewer_id": "human_reviewer1",
        "decision": "included",
        "stage": "ta",
    })

    # AI clarification question generated
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {"question_type": "study_design", "options": [{"value": "cohort", "label": "Cohort"}, {"value": "rct", "label": "RCT"}]},
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    # AI resolves to "excluded"
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "exclude", "confidence": 0.9, "reason": "Cohort excluded"}
        ans = client.post(f"/api/clarifications/{qid}/answer", json={"answer": "cohort"}).json()
        assert ans["conflict_detected"] is True


def test_clarification_answer_agrees_with_human(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Agreement Study", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    # Human screens "included"
    client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": project,
        "reviewer_id": "human_reviewer1",
        "decision": "included",
        "stage": "ta",
    })

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {"question_type": "study_design", "options": [{"value": "rct", "label": "RCT"}, {"value": "cohort", "label": "Cohort"}]},
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    qid = client.get(f"/api/projects/{project}/clarifications").json()[0]["question_id"]

    # AI resolves to "included"
    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_res:
        mock_res.return_value = {"decision": "include", "confidence": 0.9, "reason": "RCT included"}
        ans = client.post(f"/api/clarifications/{qid}/answer", json={"answer": "rct"}).json()
        assert ans["conflict_detected"] is False


def test_summary_includes_clarification_counts(client, project):
    r_s = client.post(f"/api/projects/{project}/studies", json={"project_id": project, "title": "Summary Study", "abstract": "Abs"})
    sid = r_s.json()["study_id"]

    with patch("services.llm_client.ToolCallingClient.call_with_tool") as mock_call:
        mock_call.return_value = {
            "decision": "needs_clarification",
            "clarification": {"question_type": "study_design", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]},
        }
        client.post(f"/api/studies/{sid}/ai-screen-title-abstract?record_decision=true")

    sum_resp = client.get(f"/api/projects/{project}/screening/summary").json()
    assert "awaiting_clarification" in sum_resp
    assert sum_resp["awaiting_clarification"] == 1
    assert "clarifications_pending" in sum_resp
    assert sum_resp["clarifications_pending"] == 1
    assert "clarifications_answered" in sum_resp
    assert sum_resp["clarifications_answered"] == 0
