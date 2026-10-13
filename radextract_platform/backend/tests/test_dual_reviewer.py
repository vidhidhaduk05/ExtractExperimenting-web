"""Tests for dual-reviewer verification and adjudication endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import get_current_user, get_current_user_optional
import uuid


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_dual.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "r1", "username": "Alice", "role": "owner"}
    app.dependency_overrides[get_current_user_optional] = lambda: {"user_id": "r1", "username": "Alice", "role": "owner"}
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        ("r1", "Alice", "test", "reviewer")
    )
    conn.commit()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project_study_extraction(client):
    """Create project, study, variable, and a primary extraction."""
    r = client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": "Study 1",
    })
    sid = r.json()["study_id"]
    r = client.post(f"/api/projects/{pid}/variables", json={
        "project_id": pid, "section": "Methods", "name": "sample_size",
        "field_type": "number",
    })
    vid = r.json()["variable_id"]
    r = client.post(f"/api/studies/{sid}/extractions", json={
        "study_id": sid, "variable_id": vid, "value": "100",
        "extracted_by": "reviewer1",
    })
    eid = r.json()["extraction_id"]
    return pid, sid, vid, eid


class TestExtractionVerification:

    def test_verify_agree(self, client, project_study_extraction):
        _, _, _, eid = project_study_extraction
        r = client.put(f"/api/extractions/{eid}/verify", json={
            "agree": True, "reviewer": "reviewer2",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "verified"
        assert r.json()["second_reviewer"] == "reviewer2"

    def test_verify_disagree(self, client, project_study_extraction):
        _, _, _, eid = project_study_extraction
        r = client.put(f"/api/extractions/{eid}/verify", json={
            "agree": False, "alternative_value": "150", "reviewer": "reviewer2",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "disagreed"
        assert r.json()["second_value"] == "150"

    def test_verify_nonexistent(self, client):
        r = client.put("/api/extractions/nonexistent/verify", json={"agree": True})
        assert r.status_code == 404


class TestExtractionAdjudication:

    def test_adjudicate(self, client, project_study_extraction):
        _, _, _, eid = project_study_extraction
        # First create a disagreement
        client.put(f"/api/extractions/{eid}/verify", json={
            "agree": False, "alternative_value": "150",
        })
        # Then adjudicate
        r = client.put(f"/api/extractions/{eid}/adjudicate", json={
            "final_value": "120", "adjudicator": "adjudicator1", "notes": "compromise",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "adjudicated"
        assert r.json()["value"] == "120"
        assert r.json()["adjudicated_value"] == "120"
        assert r.json()["adjudicator"] == "adjudicator1"

    def test_adjudicate_nonexistent(self, client):
        r = client.put("/api/extractions/nonexistent/adjudicate", json={"final_value": "100"})
        assert r.status_code == 404

    def test_adjudication_creates_audit_log(self, client, project_study_extraction):
        pid, sid, _, eid = project_study_extraction
        client.put(f"/api/extractions/{eid}/verify", json={"agree": False, "alternative_value": "200"})
        client.put(f"/api/extractions/{eid}/adjudicate", json={"final_value": "150"})
        r = client.get(f"/api/studies/{sid}/extractions/audit")
        assert r.status_code == 200
        logs = r.json()
        assert any("Adjudication" in log.get("reason", "") for log in logs)


class TestRobVerification:

    def test_verify_assessment(self, client):
        """Test RoB assessment verification."""
        # Setup
        r = client.post("/api/projects", json={"name": "Test"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid, "title": "S1", "study_design": "diagnostic accuracy",
        })
        sid = r.json()["study_id"]
        r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=diagnostic+accuracy&outcome_label=primary")
        aid = r.json()["assessment_id"]

        # Verify (agree)
        r = client.put(f"/api/rob/assessments/{aid}/verify", json={
            "agree": True, "assessor": "assessor2",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "verified"

    def test_verify_disagree(self, client):
        r = client.post("/api/projects", json={"name": "Test"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid, "title": "S1", "study_design": "rct",
        })
        sid = r.json()["study_id"]
        r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=rct&outcome_label=primary")
        aid = r.json()["assessment_id"]

        r = client.put(f"/api/rob/assessments/{aid}/verify", json={
            "agree": False, "second_assessment": {"overall": "high"}, "assessor": "a2",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "disagreed"

    def test_adjudicate_assessment(self, client):
        r = client.post("/api/projects", json={"name": "Test"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid, "title": "S1", "study_design": "rct",
        })
        sid = r.json()["study_id"]
        r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=rct&outcome_label=primary")
        aid = r.json()["assessment_id"]

        # Disagree first
        client.put(f"/api/rob/assessments/{aid}/verify", json={"agree": False})
        # Adjudicate
        r = client.put(f"/api/rob/assessments/{aid}/adjudicate", json={
            "final_judgment": "low", "adjudicator": "adj1",
        })
        assert r.status_code == 200
        assert r.json()["verification_status"] == "adjudicated"
        assert r.json()["overall_judgment"] == "low"

    def test_verify_nonexistent(self, client):
        r = client.put("/api/rob/assessments/nonexistent/verify", json={"agree": True})
        assert r.status_code == 404


class TestPrismaFlow:

    def test_prisma_empty(self, client):
        r = client.post("/api/projects", json={"name": "Test"})
        pid = r.json()["project_id"]
        r = client.get(f"/api/projects/{pid}/prisma")
        assert r.status_code == 200
        data = r.json()
        assert data["identification"]["database_records"] == 0
        assert data["included"]["studies_in_review"] == 0

    def test_prisma_with_studies(self, client):
        r = client.post("/api/projects", json={"name": "Test"})
        pid = r.json()["project_id"]
        # Add 5 studies
        for i in range(5):
            r = client.post(f"/api/projects/{pid}/studies", json={
                "project_id": pid, "title": f"Study {i}",
            })
            sid = r.json()["study_id"]
            if i < 3:
                client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ta", "reason": ""})
            else:
                client.put(f"/api/studies/{sid}/screening", json={"status": "excluded", "stage": "ta", "reason": "wrong population"})

        r = client.get(f"/api/projects/{pid}/prisma")
        assert r.status_code == 200
        data = r.json()
        assert data["identification"]["database_records"] == 5
        assert data["screening"]["records_excluded"] == 2
        assert data["included"]["studies_in_review"] == 3
