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
from services.db_backend import SQLiteBackend


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_rob_integration.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    from dependencies import create_access_token, create_user
    u = create_user("testuser", "pass", role="owner")
    token = create_access_token(u["user_id"], u["username"], u["role"])
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
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
        client.put(f"/api/studies/{sid}/screening", json={
            "status": "excluded", "stage": "ft", "reason": "wrong population",
        })
        assert _assessments_for(sid) == []

    def test_multi_reviewer_agree_include_triggers_rob(self, client):
        pid, sid = _make_project_and_study(client)
        client.put(f"/api/studies/{sid}/screening", json={"status": "pending", "stage": "ft", "reason": ""})
        for reviewer in ("rev1", "rev2"):
            r = client.post(f"/api/studies/{sid}/screening-decision", json={
                "study_id": sid, "project_id": pid, "reviewer_id": reviewer,
                "decision": "included", "stage": "ft",
            })
            assert r.status_code == 200
        assert len(_assessments_for(sid)) == 1


class TestAutoSelectTool:
    def test_auto_select_tool_rct(self, client):
        pid, sid = _make_project_and_study(client, design="randomized controlled trial")
        client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ft", "reason": ""})
        assert _assessments_for(sid)[0]["tool"] == "rob2"

    def test_auto_select_tool_quadas(self, client):
        pid, sid = _make_project_and_study(client, title="CT vs MRI", design="diagnostic accuracy")
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
