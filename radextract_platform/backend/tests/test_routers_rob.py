"""Tests for routers/rob.py — API endpoint integration tests."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token
import os


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    db_path = str(tmp_path / "test_api.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project_and_study(client):
    """Create a project and study, return (project_id, study_id)."""
    r = client.post("/api/projects", json={"name": "Test Review"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "CT vs MRI Diagnostic Accuracy Study",
        "study_design": "diagnostic accuracy",
        "abstract": "This retrospective study evaluated CT vs MRI in 51 consecutive patients.",
    })
    sid = r.json()["study_id"]
    return pid, sid


class TestToolEndpoints:

    def test_list_tools(self, client):
        r = client.get("/api/rob/tools")
        assert r.status_code == 200
        tools = r.json()
        assert len(tools) == 7
        keys = {t["key"] for t in tools}
        assert keys == {
            "quadas2", "robins_i", "rob2", "robins_e", "nos",
            "jbi_case_report", "jbi_case_series",
        }

    def test_get_specific_tool(self, client):
        r = client.get("/api/rob/tools/quadas2")
        assert r.status_code == 200
        tool = r.json()
        assert tool["name"] == "QUADAS-2"
        assert len(tool["domains"]) == 4

    def test_get_invalid_tool(self, client):
        r = client.get("/api/rob/tools/nonexistent")
        assert r.status_code == 404

    def test_auto_select_diagnostic(self, client):
        r = client.get("/api/rob/tools/auto-select/diagnostic+accuracy")
        assert r.status_code == 200
        assert r.json()["tool"] == "quadas2"

    def test_auto_select_no_match(self, client):
        r = client.get("/api/rob/tools/auto-select/narrative+review")
        assert r.status_code == 200
        assert r.json()["tool"] == "manual"


class TestAssessmentCRUD:

    def test_create_assessment(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["tool"] == "quadas2"
        assert len(data["domain_judgments"]) == 4

    def test_auto_create_assessment(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=diagnostic+accuracy")
        assert r.status_code == 200
        assert r.json()["tool"] == "quadas2"

    def test_list_study_assessments(self, client, project_and_study):
        pid, sid = project_and_study
        client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        r = client.get(f"/api/rob/studies/{sid}/rob")
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_get_assessment_detail(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        r = client.get(f"/api/rob/assessments/{aid}")
        assert r.status_code == 200
        assert r.json()["assessment_id"] == aid
        assert "tool_definition" in r.json()

    def test_get_nonexistent_assessment(self, client):
        r = client.get("/api/rob/assessments/nonexistent-id")
        assert r.status_code == 404

    def test_delete_assessment(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        r = client.delete(f"/api/rob/assessments/{aid}")
        assert r.status_code == 200
        # Verify deleted
        r = client.get(f"/api/rob/assessments/{aid}")
        assert r.status_code == 404


class TestAIPrefill:

    def test_ai_prefill_mock(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        r = client.post(f"/api/rob/assessments/{aid}/ai-prefill", json={
            "abstract": "This retrospective study evaluated CT vs MRI in 51 consecutive patients with blinded interpretation.",
            "model_fn_name": "mock",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["domains_prefilled"] == 4
        assert data["questions_prefilled"] == 11
        assert data["used_full_text"] is False

    def test_accept_ai(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        # Pre-fill
        client.post(f"/api/rob/assessments/{aid}/ai-prefill", json={
            "abstract": "This retrospective study evaluated CT vs MRI in 51 consecutive patients.",
            "model_fn_name": "mock",
        })
        # Accept
        r = client.post(f"/api/rob/assessments/{aid}/accept-ai")
        assert r.status_code == 200
        assert r.json()["answers_accepted"] == 11
        # Verify overall judgment was computed
        r = client.get(f"/api/rob/assessments/{aid}")
        assert r.json()["overall_judgment"] != "pending"


class TestJudgmentUpdates:

    def test_update_signaling_answer(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        # Get first answer
        detail = client.get(f"/api/rob/assessments/{aid}").json()
        first_answer = detail["domain_judgments"][0]["signaling_answers"][0]
        # Update it
        r = client.put(f"/api/rob/answers/{first_answer['answer_id']}", json={
            "answer": "yes", "human_verified": True,
        })
        assert r.status_code == 200

    def test_update_domain_judgment(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        detail = client.get(f"/api/rob/assessments/{aid}").json()
        first_judgment = detail["domain_judgments"][0]
        r = client.put(f"/api/rob/judgments/{first_judgment['judgment_id']}", json={
            "risk_judgment": "high", "human_verified": True,
        })
        assert r.status_code == 200


class TestProjectSummary:

    def test_summary(self, client, project_and_study):
        pid, sid = project_and_study
        client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        r = client.get(f"/api/rob/projects/{pid}/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["total_assessments"] == 1
        assert data["tool"] == "quadas2"
        assert len(data["assessments"][0]["domains"]) == 4

    def test_summary_empty(self, client):
        r = client.post("/api/projects", json={"name": "Empty"})
        pid = r.json()["project_id"]
        r = client.get(f"/api/rob/projects/{pid}/summary")
        assert r.status_code == 200
        assert r.json()["total_assessments"] == 0


class TestExport:

    def test_export_csv(self, client, project_and_study):
        pid, sid = project_and_study
        client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        r = client.get(f"/api/rob/projects/{pid}/export?format=csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "") or "octet-stream" in r.headers.get("content-type", "")


class TestToolOverrideAndBatchRun:

    def test_override_tool(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]
        # Override to rob2
        r2 = client.put(f"/api/rob/assessments/{aid}/tool", json={"tool_id": "rob2"})
        assert r2.status_code == 200
        data = r2.json()
        assert data["tool"] == "rob2"
        assert len(data["domain_judgments"]) == 5

    def test_batch_rob_endpoints(self, client, project_and_study):
        pid, sid = project_and_study
        db = get_connection()
        db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES ('rev1', 'rev1', 'test')")
        db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, 'rev1', 'reviewer')", (f"{pid}-rev1", pid))
        db.execute("UPDATE studies SET screening_stage = 'ft' WHERE study_id = ?", (sid,))
        db.commit()
        db.close()
        client.headers["Authorization"] = f"Bearer {create_access_token('rev1', 'rev1', 'reviewer')}"
        # Mark study as included
        client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ft", "reason": ""})
        # Start batch RoB
        r = client.post(f"/api/rob/projects/{pid}/run")
        assert r.status_code == 200
        assert "run_id" in r.json()
        # Progress
        prog = client.get(f"/api/rob/projects/{pid}/run/progress")
        assert prog.status_code == 200
        # Cancel
        c = client.post(f"/api/rob/projects/{pid}/run/cancel")
        assert c.status_code == 200
        assert c.json()["cancelled"] is True

    def test_project_settings(self, client, project_and_study):
        pid, _ = project_and_study
        r = client.get(f"/api/projects/{pid}/settings")
        assert r.status_code == 200
        assert r.json()["auto_rob_enabled"] is False
        assert r.json()["rob_confidence_threshold"] == 0.7

        r2 = client.put(f"/api/projects/{pid}/settings", json={
            "auto_rob_enabled": False,
            "rob_confidence_threshold": 0.85,
        })
        assert r2.status_code == 200
        assert r2.json()["auto_rob_enabled"] is False
        assert r2.json()["rob_confidence_threshold"] == 0.85

    def test_auto_assess_study_rob(self, client, project_and_study):
        pid, sid = project_and_study
        # Call auto-assess endpoint
        r = client.post(f"/api/rob/projects/{pid}/studies/{sid}/auto-assess?tool_id=rob2")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "assessment_id" in data
        assert "overall_judgment" in data

        # Test repeat call (updates existing assessment)
        r_repeat = client.post(f"/api/rob/projects/{pid}/studies/{sid}/auto-assess?tool_id=rob2")
        assert r_repeat.status_code == 200
        assert r_repeat.json()["success"] is True

        # Test calling with non-existent study_id returns 404
        r_invalid = client.post(f"/api/rob/projects/{pid}/studies/nonexistent-sid/auto-assess?tool_id=rob2")
        assert r_invalid.status_code == 404


class TestSecurityAccessControl:

    def test_unauthorized_user_denied_access(self, client, project_and_study):
        pid, sid = project_and_study
        r = client.post(f"/api/rob/studies/{sid}/rob", json={
            "study_id": sid, "project_id": pid, "tool": "quadas2",
        })
        aid = r.json()["assessment_id"]

        db = get_connection()
        db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES ('unauth_rob_user', 'unauth_rob_user', 'test')")
        db.commit()
        db.close()
        token = create_access_token('unauth_rob_user', 'unauth_rob_user', 'viewer')
        headers = {"Authorization": f"Bearer {token}"}

        assert client.get(f"/api/rob/projects/{pid}/summary", headers=headers).status_code == 403
        assert client.get(f"/api/rob/projects/{pid}/figure", headers=headers).status_code == 403
        assert client.get(f"/api/rob/projects/{pid}/figures", headers=headers).status_code == 403
        assert client.get(f"/api/rob/projects/{pid}/reporting-profile", headers=headers).status_code == 403

        # Assessment authorization checks
        assert client.get(f"/api/rob/assessments/{aid}", headers=headers).status_code == 403
        assert client.delete(f"/api/rob/assessments/{aid}", headers=headers).status_code == 403
        assert client.put(f"/api/rob/assessments/{aid}/tool", json={"tool_id": "rob2"}, headers=headers).status_code == 403
