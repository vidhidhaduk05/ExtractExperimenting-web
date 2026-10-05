"""Tests for Multi-Stage AI Screening Pipeline (Part 11 of Redesign Plan).

Covers:
1. Title screening confident include -> ta_included
2. Title screening confident exclude -> excluded
3. Title screening uncertain -> pending
4. Abstract screening confident include -> ta_included
5. Abstract screening confident exclude -> excluded
6. Abstract screening uncertain no clarification -> uncertain
7. Abstract screening uncertain with clarification -> awaiting_clarification
8. Fulltext screening with PDF -> included / excluded
9. Fulltext screening without PDF -> awaiting_pdf
10. Full pipeline run across all stages
11. Start analysis (title only)
12. Continue to abstract stage
13. Continue to fulltext stage
14. AI decision recorded in screening_decisions table (reviewer_id = 'ai_screener')
15. Confidence and reasons stored on studies table
16. Pipeline idempotent
17. Handles empty project (no studies)
18. Handles no PICO criteria
19. LLM unavailable fallback
20. Pipeline summary counts match database state
"""
import json
import re
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.ai_screening_pipeline import AIScreeningPipeline


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_pipeline.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


class MockLLMClient:
    """Mock LLM client returning predictable decisions for pipeline testing."""

    def __init__(self, mode="default"):
        self.mode = mode

    def call_with_tool(self, tool_name, prompt, system_prompt=None, temperature=0.1, max_tokens=1024):
        if self.mode == "fail":
            return None

        # Extract Study Title and Study Abstract lines
        t_match = re.search(r"Study Title:\s*([^\n\r]*)", prompt)
        title_text = t_match.group(1).lower().strip() if t_match else ""

        a_match = re.search(r"Study Abstract:\s*([^\n\r]*)", prompt)
        abstract_text = a_match.group(1).lower().strip() if a_match else ""

        if tool_name == "screen_title_only":
            if "animal" in title_text or "rodent" in title_text:
                return {
                    "decision": "exclude",
                    "confidence": 0.92,
                    "reason": "Animal model study excluded",
                    "reason_code": "wrong_population",
                    "matched_keywords": ["animal"],
                }
            elif "rct" in title_text or "multicenter" in title_text:
                return {
                    "decision": "include",
                    "confidence": 0.95,
                    "reason": "Title clearly matches PICO RCT design",
                    "reason_code": "CLEAR_INCLUDE",
                    "matched_keywords": ["RCT", "randomized"],
                }
            else:
                return {
                    "decision": "uncertain",
                    "confidence": 0.50,
                    "reason": "Cannot determine from title alone",
                    "reason_code": "UNCERTAIN_TITLE",
                    "matched_keywords": [],
                }

        elif tool_name == "screen_title_abstract":
            if "clarification" in title_text or "clarification" in abstract_text:
                return {
                    "decision": "uncertain",
                    "confidence": 0.55,
                    "reason": "Study design unclear from abstract",
                    "reason_code": "AMBIGUOUS_DESIGN",
                    "needs_clarification": True,
                    "clarification_type": "study_design",
                    "clarification_question": "What study design does this paper report?",
                    "clarification_options": [
                        {"label": "RCT", "value": "rct"},
                        {"label": "Cohort", "value": "cohort"},
                        {"label": "Case Series", "value": "case_series"},
                    ],
                }
            elif "wrong outcome" in abstract_text or "economic" in abstract_text:
                return {
                    "decision": "exclude",
                    "confidence": 0.88,
                    "reason": "Wrong outcome assessed",
                    "reason_code": "wrong_outcome",
                    "evidence_quote": "Only economic endpoints were reported.",
                    "include_keywords": [],
                    "exclude_keywords": ["economic"],
                    "needs_clarification": False,
                }
            elif "mri" in abstract_text or "stroke" in abstract_text or "randomized" in abstract_text:
                return {
                    "decision": "include",
                    "confidence": 0.90,
                    "reason": "Matches PICO population and MRI intervention",
                    "reason_code": "MATCHES_PICO",
                    "evidence_quote": "Patients underwent MRI for stroke diagnosis.",
                    "include_keywords": ["MRI", "stroke"],
                    "exclude_keywords": [],
                    "needs_clarification": False,
                }
            else:
                return {
                    "decision": "uncertain",
                    "confidence": 0.45,
                    "reason": "Abstract lacks sufficient details",
                    "reason_code": "INSUFFICIENT_DATA",
                    "needs_clarification": False,
                }

        elif tool_name == "screen_fulltext":
            if "non-eligible" in prompt.lower() or "wrong comparator" in prompt.lower() or "ineligible" in prompt.lower():
                return {
                    "decision": "exclude",
                    "confidence": 0.95,
                    "reason": "Full text shows non-eligible comparator",
                    "reason_code": "wrong_comparator",
                    "evidence_quote": "No reference standard was performed.",
                }
            else:
                return {
                    "decision": "include",
                    "confidence": 0.96,
                    "reason": "Full text confirms all PICO criteria met",
                    "reason_code": "FULL_MATCH",
                    "evidence_quote": "All 200 patients had confirmed diagnosis via gold standard.",
                }

        return None


def _setup_project_and_studies(client):
    p_resp = client.post("/api/projects", json={
        "name": "Pipeline Project",
        "pico_json": json.dumps({
            "population": "Patients with acute ischemic stroke",
            "intervention": "MRI DWI",
            "comparator": "CT angiography",
            "outcome": "Diagnostic accuracy and sensitivity",
        }),
    })
    pid = p_resp.json()["project_id"]

    # 1. Clear include title
    s1 = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "A multicenter RCT of MRI in acute stroke patients",
        "abstract": "Patients with stroke were randomized to MRI or CT.",
    }).json()["study_id"]

    # 2. Clear exclude title
    s2 = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Animal model study of rodent cerebral perfusion",
        "abstract": "Rodents were studied using in vitro imaging.",
    }).json()["study_id"]

    # 3. Uncertain title -> needs abstract
    s3 = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Stroke Diagnostic Evaluation Study",
        "abstract": "Patients underwent MRI for stroke diagnosis.",
    }).json()["study_id"]

    # 4. Clarification candidate
    s4 = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Clarification Study for Emergency Evaluation",
        "abstract": "Clarification needed for retrospective cohort study.",
    }).json()["study_id"]

    return pid, s1, s2, s3, s4


def test_title_screening_confident_include():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s1,)).fetchone()

    assert row["screening_status"] == "ta_included"
    assert row["ai_decision"] == "include"
    assert row["ai_confidence"] >= 0.80
    assert row["ai_stage"] == "title"


def test_title_screening_confident_exclude():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, s2, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s2,)).fetchone()

    assert row["screening_status"] == "excluded"
    assert row["ai_decision"] == "exclude"
    assert row["ai_confidence"] >= 0.80


def test_title_screening_uncertain_advances_to_abstract():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, s3, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s3,)).fetchone()

    assert row["screening_status"] == "pending"
    assert row["ai_decision"] == "uncertain"


def test_abstract_screening_confident_include():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, s3, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    pipe.run_abstract_screening(pid, conn, client=MockLLMClient())

    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s3,)).fetchone()
    assert row["screening_status"] == "ta_included"
    assert row["ai_decision"] == "include"
    assert row["ai_stage"] == "abstract"


def test_abstract_screening_confident_exclude():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, _, _ = _setup_project_and_studies(client)

    s_excl = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "General Evaluation Study",
        "abstract": "Wrong Outcome evaluated with economic focus only.",
    }).json()["study_id"]

    pipe.run_abstract_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s_excl,)).fetchone()
    assert row["screening_status"] == "excluded"
    assert row["ai_decision"] == "exclude"


def test_abstract_screening_uncertain_no_clarification():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, _, _ = _setup_project_and_studies(client)

    s_unc = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Unclear Study Title",
        "abstract": "Short vague text.",
    }).json()["study_id"]

    pipe.run_abstract_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s_unc,)).fetchone()
    assert row["screening_status"] == "uncertain"


def test_abstract_screening_uncertain_with_clarification():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, _, s4 = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    pipe.run_abstract_screening(pid, conn, client=MockLLMClient())

    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s4,)).fetchone()
    assert row["screening_status"] == "awaiting_clarification"

    cq = conn.execute("SELECT * FROM clarification_questions WHERE study_id = ?", (s4,)).fetchone()
    assert cq is not None
    assert cq["status"] == "pending"
    assert "study design" in cq["question_text"].lower()


def test_fulltext_screening_without_pdf():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    # s1 passes title screening to ta_included
    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    # fulltext screening runs without PDF
    pipe.run_fulltext_screening(pid, conn, client=MockLLMClient())

    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s1,)).fetchone()
    assert row["screening_status"] == "awaiting_pdf"


def test_fulltext_screening_with_pdf():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())

    # Add mock full-text document
    conn.execute(
        "INSERT INTO pdf_documents (doc_id, study_id, full_text) VALUES (?, ?, ?)",
        ("doc_1", s1, "Full-text report confirming all 200 patients underwent MRI for stroke diagnosis."),
    )
    conn.commit()

    pipe.run_fulltext_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s1,)).fetchone()
    assert row["screening_status"] == "included"
    assert row["ai_stage"] == "fulltext"


def test_full_pipeline_run_all_stages():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, s2, s3, s4 = _setup_project_and_studies(client)

    summary = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())

    assert summary["total"] == 4
    assert summary["title_screened"] == 4
    assert summary["abstract_screened"] >= 1
    assert summary["excluded"] >= 1
    assert summary["awaiting_clarification"] >= 1


def test_start_analysis_title_only(client, monkeypatch):
    monkeypatch.setattr("services.ai_screening_pipeline.get_client", lambda: MockLLMClient())
    pid, _, _, _, _ = _setup_project_and_studies(client)
    r = client.post(f"/api/projects/{pid}/ai-screening/start-analysis")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4
    assert data["title_screened"] == 4


def test_start_ai_analysis_finally_clears_progress_on_error(client, monkeypatch):
    """Ensure screening_progress.finish is called even when run_title_screening raises an exception."""
    from unittest.mock import MagicMock
    from routers import ai_screening

    pid, _, _, _, _ = _setup_project_and_studies(client)

    finish_mock = MagicMock()
    monkeypatch.setattr(ai_screening.screening_progress, "finish", finish_mock)

    def mock_run_title_screening(*args, **kwargs):
        raise RuntimeError("LLM service unavailable")

    monkeypatch.setattr(ai_screening.pipeline, "run_title_screening", mock_run_title_screening)

    with pytest.raises(RuntimeError, match="LLM service unavailable"):
        client.post(f"/api/projects/{pid}/ai-screening/start-analysis")

    finish_mock.assert_called_once_with(pid)


def test_start_ai_analysis_check_project_access_denied(client, monkeypatch):
    """Ensure check_project_access exception halts execution before screening runs."""
    from fastapi import HTTPException
    from unittest.mock import MagicMock
    from routers import ai_screening

    pid, _, _, _, _ = _setup_project_and_studies(client)

    def mock_check_access(conn, project_id, user):
        raise HTTPException(status_code=403, detail="Access denied")

    finish_mock = MagicMock()
    monkeypatch.setattr(ai_screening, "check_project_access", mock_check_access)
    monkeypatch.setattr(ai_screening.screening_progress, "finish", finish_mock)

    r = client.post(f"/api/projects/{pid}/ai-screening/start-analysis")
    assert r.status_code == 403
    assert r.json()["detail"] == "Access denied"
    finish_mock.assert_not_called()


@pytest.mark.asyncio
async def test_start_ai_analysis_direct_function_call(monkeypatch):
    """Directly test start_ai_analysis async function with mocks."""
    from unittest.mock import MagicMock
    from routers.ai_screening import start_ai_analysis

    mock_conn = MagicMock()
    mock_pipeline = MagicMock()
    mock_pipeline.run_title_screening.return_value = [{"study_id": "s1"}]
    mock_pipeline.get_pipeline_summary.return_value = {
        "project_id": "p1",
        "total": 10,
        "title_screened": 1,
        "abstract_screened": 0,
        "fulltext_screened": 0,
        "included": 0,
        "excluded": 0,
        "uncertain": 0,
        "awaiting_clarification": 0,
        "awaiting_pdf": 0,
        "pending": 9,
    }

    mock_progress = MagicMock()

    monkeypatch.setattr("routers.ai_screening.check_project_access", MagicMock())
    monkeypatch.setattr("routers.ai_screening.pipeline", mock_pipeline)
    monkeypatch.setattr("routers.ai_screening.screening_progress", mock_progress)

    res = await start_ai_analysis("p1", user={"id": "u1"}, conn=mock_conn)

    assert res.total == 10
    assert res.title_screened == 1
    mock_progress.finish.assert_called_once_with("p1")
    mock_pipeline.get_pipeline_summary.assert_called_once_with("p1", mock_conn, title_count=1)


def test_continue_to_abstract(client, monkeypatch):
    monkeypatch.setattr("services.ai_screening_pipeline.get_client", lambda: MockLLMClient())
    pid, _, _, _, _ = _setup_project_and_studies(client)
    client.post(f"/api/projects/{pid}/ai-screening/start-analysis")
    r = client.post(f"/api/projects/{pid}/ai-screening/continue", json={"stage": "abstract"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4


def test_continue_to_fulltext(client, monkeypatch):
    monkeypatch.setattr("services.ai_screening_pipeline.get_client", lambda: MockLLMClient())
    pid, _, _, _, _ = _setup_project_and_studies(client)
    client.post(f"/api/projects/{pid}/ai-screening/start-analysis")
    client.post(f"/api/projects/{pid}/ai-screening/continue", json={"stage": "abstract"})
    r = client.post(f"/api/projects/{pid}/ai-screening/continue", json={"stage": "fulltext"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4


def test_ai_decision_recorded_in_screening_decisions():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    dec = conn.execute(
        "SELECT * FROM screening_decisions WHERE study_id = ? AND reviewer_id = 'ai_screener'",
        (s1,),
    ).fetchone()
    assert dec is not None
    assert dec["reviewer_name"] == "AI Screener"


def test_confidence_stored_on_study():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient())
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s1,)).fetchone()
    assert row["ai_confidence"] > 0
    assert row["ai_decision"] != ""
    assert row["ai_screened_at"] != ""


def test_pipeline_idempotent():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, _, _ = _setup_project_and_studies(client)

    summary1 = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())
    summary2 = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())

    assert summary1["total"] == summary2["total"]
    assert summary1["included"] == summary2["included"]
    assert summary1["excluded"] == summary2["excluded"]


def test_pipeline_handles_no_studies():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    p_resp = client.post("/api/projects", json={"name": "Empty Project"})
    pid = p_resp.json()["project_id"]

    summary = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())
    assert summary["total"] == 0
    assert summary["included"] == 0


def test_pipeline_handles_no_pico():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    p_resp = client.post("/api/projects", json={"name": "No PICO Project"})
    pid = p_resp.json()["project_id"]

    client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Study without PICO defined",
        "abstract": "Abstract text",
    })

    summary = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())
    assert summary["total"] == 1


def test_pipeline_llm_unavailable_fallback():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, s1, _, _, _ = _setup_project_and_studies(client)

    pipe.run_title_screening(pid, conn, client=MockLLMClient(mode="fail"))
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (s1,)).fetchone()
    assert row["screening_status"] == "pending"
    assert row["ai_decision"] == "uncertain"


def test_pipeline_summary_counts():
    conn = get_connection()
    pipe = AIScreeningPipeline()
    client = TestClient(app)
    pid, _, _, _, _ = _setup_project_and_studies(client)

    summary = pipe.run_full_pipeline(pid, conn, client=MockLLMClient())
    db_total = conn.execute("SELECT COUNT(*) as c FROM studies WHERE project_id = ?", (pid,)).fetchone()["c"]
    assert summary["total"] == db_total
