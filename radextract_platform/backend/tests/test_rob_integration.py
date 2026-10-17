"""Integration tests for RoB auto-triggering after full-text inclusion.

Covers:
- Pipeline auto-include -> RoB assessment auto-created + AI-prefilled
- Idempotency (no duplicate assessments)
- Manual FT include (single-reviewer + multi-reviewer paths) -> RoB triggered
- TA-stage include / exclusion -> no RoB
- ai-prefill endpoint sends REAL study metadata (regression for empty-metadata bug)
- Tool auto-selection by study design
- RoB failure is non-fatal to the pipeline
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token
from services.db_backend import SQLiteBackend


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_rob_integration.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('rev1', 'Reviewer One', 'test', 'owner')")
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('rev2', 'Reviewer Two', 'test', 'owner')")
    conn.commit()
    yield


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {create_access_token('rev1', 'Reviewer One', 'owner')}"
    return c


def _db():
    return SQLiteBackend(get_connection())


def _make_project_and_study(client, title="RCT of Drug X", design="randomized controlled trial"):
    r = client.post("/api/projects", json={"name": "RoB Integration Review"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": title, "study_design": design,
        "abstract": "A randomized trial of Drug X versus placebo in 200 adults.",
    })
    sid = r.json()["study_id"]
    reviewer_id = "rev1"
    reviewer_name = "Reviewer 1"
    db = get_connection()
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES (?, ?, ?)", (reviewer_id, reviewer_name, "test"))
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES (?, ?, ?)", ("rev2", "Reviewer 2", "test"))
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)", (f"{pid}-{reviewer_id}", pid, reviewer_id, "reviewer"))
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)", (f"{pid}-rev2", pid, "rev2", "reviewer"))
    db.commit()
    client.headers["Authorization"] = f"Bearer {create_access_token(reviewer_id, reviewer_name, 'reviewer')}"
    return pid, sid


def _assessments_for(sid):
    from services import rob_service
    return rob_service.list_assessments_for_study(sid, db=_db())


class TestPipelineAutoTrigger:
    def _run_pipeline(self, sid, pid, recommendation="included"):
        """Run the pipeline with Docling/extraction mocked out and screening stubbed."""
        from services import pipeline_service
        with patch.object(pipeline_service.pdf_service, "process_pdf", return_value={"processor_engine": "mock"}), \
             patch.object(pipeline_service.pdf_service, "get_pdf_data", return_value={"full_text": "Full text of the trial. " * 20}), \
             patch.object(pipeline_service, "screen_fulltext_with_llm", return_value={
                 "recommendation": recommendation, "reason_text": "r", "rationale": "meets PICO",
             }), \
             patch.object(pipeline_service.auto_extract_service, "auto_extract", return_value={"extracted_count": 3}):
            pipeline_service.run_pdf_screening_pipeline(sid, pid, db=_db())

    def test_pipeline_inclusion_triggers_rob(self, client):
        pid, sid = _make_project_and_study(client)
        self._run_pipeline(sid, pid, "included")
        assessments = _assessments_for(sid)
        assert len(assessments) == 1
        assert assessments[0]["tool"] == "rob2"
        assert assessments[0]["ai_prefilled"] == 1

    def test_pipeline_skips_existing_assessment(self, client):
        pid, sid = _make_project_and_study(client)
        self._run_pipeline(sid, pid, "included")
        self._run_pipeline(sid, pid, "included")  # second run
        assert len(_assessments_for(sid)) == 1

    def test_pipeline_exclusion_does_not_trigger_rob(self, client):
        pid, sid = _make_project_and_study(client)
        self._run_pipeline(sid, pid, "excluded")
        assert _assessments_for(sid) == []

    def test_pipeline_rob_failure_is_nonfatal(self, client):
        pid, sid = _make_project_and_study(client)
        from services import pipeline_service, rob_service
        with patch.object(pipeline_service.pdf_service, "process_pdf", return_value={"processor_engine": "mock"}), \
             patch.object(pipeline_service.pdf_service, "get_pdf_data", return_value={"full_text": "Full text. " * 30}), \
             patch.object(pipeline_service, "screen_fulltext_with_llm", return_value={
                 "recommendation": "included", "reason_text": "", "rationale": "ok",
             }), \
             patch.object(pipeline_service.auto_extract_service, "auto_extract", return_value={"extracted_count": 1}), \
             patch.object(rob_service, "auto_assess_study", side_effect=RuntimeError("boom")):
            # Must not raise
            pipeline_service.run_pdf_screening_pipeline(sid, pid, db=_db())
        study = _db().get("studies", sid)
        assert study["screening_status"] == "included"


class TestManualIncludeTrigger:
    def test_manual_ft_include_triggers_rob(self, client):
        pid, sid = _make_project_and_study(client)
        db = get_connection()
        db.execute("UPDATE studies SET screening_stage = 'ft' WHERE study_id = ?", (sid,))
        db.commit()
        r = client.put(f"/api/studies/{sid}/screening", json={
            "status": "included", "stage": "ft", "reason": "meets criteria",
        })
        assert r.status_code == 200
        # TestClient runs background tasks synchronously
        assessments = _assessments_for(sid)
        assert len(assessments) == 1
        assert assessments[0]["tool"] == "rob2"

    def test_ta_include_does_not_trigger_rob(self, client):
        pid, sid = _make_project_and_study(client)
        client.put(f"/api/studies/{sid}/screening", json={
            "status": "included", "stage": "ta", "reason": "passes TA",
        })
        assert _assessments_for(sid) == []

    def test_exclude_does_not_trigger_rob(self, client):
        pid, sid = _make_project_and_study(client)
        db = get_connection()
        db.execute("UPDATE studies SET screening_stage = 'ft' WHERE study_id = ?", (sid,))
        db.commit()
        client.put(f"/api/studies/{sid}/screening", json={
            "status": "excluded", "stage": "ft", "reason": "wrong population",
        })
        assert _assessments_for(sid) == []

    def test_multi_reviewer_agree_include_triggers_rob(self, client):
        pid, sid = _make_project_and_study(client)
        db_inst = _db()
        db_inst.update("studies", sid, {"screening_stage": "ft"})
        db_inst.commit()
        conn = get_connection()
        for reviewer in ("rev1", "rev2"):
            conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES (?, ?, 'test', 'owner')", (reviewer, reviewer))
            conn.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", (f"{pid}-{reviewer}", pid, reviewer))
        conn.commit()

        for reviewer in ("rev1", "rev2"):
            client.headers["Authorization"] = f"Bearer {create_access_token(reviewer, reviewer, 'owner')}"
            r = client.post(f"/api/studies/{sid}/screening-decision", json={
                "study_id": sid, "project_id": pid, "reviewer_id": reviewer,
                "decision": "included", "stage": "ft",
            })
            assert r.status_code == 200
        assert len(_assessments_for(sid)) == 1


class TestAutoSelectTool:
    def test_auto_select_tool_rct(self, client):
        pid, sid = _make_project_and_study(client, design="randomized controlled trial")
        db = get_connection()
        db.execute("UPDATE studies SET screening_stage = 'ft' WHERE study_id = ?", (sid,))
        db.commit()
        client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ft", "reason": ""})
        assert _assessments_for(sid)[0]["tool"] == "rob2"

    def test_auto_select_tool_quadas(self, client):
        pid, sid = _make_project_and_study(client, title="CT vs MRI", design="diagnostic accuracy")
        db = get_connection()
        db.execute("UPDATE studies SET screening_stage = 'ft' WHERE study_id = ?", (sid,))
        db.commit()
        client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ft", "reason": ""})
        assert _assessments_for(sid)[0]["tool"] == "quadas2"


class TestAiPrefillMetadata:
    def test_ai_prefill_uses_real_metadata(self, client):
        """Regression: ai-prefill must send the study's real title, not empty strings."""
        pid, sid = _make_project_and_study(client, title="Unique Title XYZ-123")
        r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=randomized+controlled+trial")
        assert r.status_code == 200
        aid = r.json()["assessment_id"]

        captured = {}
        from services import rob_ai
        original_prefill = rob_ai.prefill_assessment

        def spy_model_fn(prompt, **kwargs):
            captured["prompt"] = prompt
            return rob_ai.mock_model_fn(prompt, **kwargs)

        def prefill_with_spy(**kwargs):
            kwargs["model_fn"] = spy_model_fn
            return original_prefill(**kwargs)

        with patch("services.rob_ai.prefill_assessment", side_effect=prefill_with_spy):
            r = client.post(f"/api/rob/assessments/{aid}/ai-prefill", json={
                "abstract": "A randomized trial of Drug X versus placebo in 200 adults with outcomes at 12 months.",
                "model_fn_name": "mock",
            })
            assert r.status_code == 200
        assert "Unique Title XYZ-123" in captured.get("prompt", "")
