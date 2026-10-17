"""Tests for routers/grade.py — GRADE API endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token
import uuid


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_grade_api.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project_with_study(client):
    """Create a project with an included RCT study and a RoB assessment."""
    r = client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["project_id"]
    db = get_connection()
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES ('rev1', 'rev1', 'test')")
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, 'rev1', 'reviewer')", (f"{pid}-rev1", pid))
    db.commit()
    db.close()
    client.headers["Authorization"] = f"Bearer {create_access_token('rev1', 'rev1', 'reviewer')}"
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": "RCT Study",
        "study_design": "randomized controlled trial",
    })
    sid = r.json()["study_id"]
    # Update screening to included
    client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ta", "reason": ""})
    # Create RoB assessment
    r = client.post(f"/api/rob/studies/{sid}/rob/auto?project_id={pid}&study_design=randomized+controlled+trial&outcome_label=primary")
    aid = r.json()["assessment_id"]
    # Set overall judgment to high
    conn = get_connection()
    conn.execute("UPDATE rob_assessments SET overall_judgment = 'high' WHERE assessment_id = ?", (aid,))
    conn.commit()
    conn.close()
    return pid, sid, aid


class TestGradeCRUD:

    def test_create(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={
            "outcome_label": "Primary Outcome",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["outcome_label"] == "Primary Outcome"
        assert len(data["factors"]) == 8
        assert data["certainty_rating"] == "high"  # RCT → high start

    def test_create_observational(self, client):
        # Create project with observational study
        r = client.post("/api/projects", json={"name": "Obs"})
        pid = r.json()["project_id"]
        db = get_connection()
        db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES ('rev1', 'rev1', 'test')")
        db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, 'rev1', 'reviewer')", (f"{pid}-rev1", pid))
        db.commit()
        db.close()
        client.headers["Authorization"] = f"Bearer {create_access_token('rev1', 'rev1', 'reviewer')}"
        r = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid, "title": "Cohort",
            "study_design": "retrospective cohort",
        })
        sid = r.json()["study_id"]
        client.put(f"/api/studies/{sid}/screening", json={"status": "included", "stage": "ta", "reason": ""})

        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        assert r.status_code == 200
        assert r.json()["starting_level"] == "low"

    def test_list(self, client, project_with_study):
        pid, _, _ = project_with_study
        client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O1"})
        client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O2"})
        r = client.get(f"/api/projects/{pid}/grade")
        assert len(r.json()) == 2

    def test_get_detail(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        gid = r.json()["grade_id"]
        r = client.get(f"/api/grade/{gid}")
        assert r.status_code == 200
        assert len(r.json()["factors"]) == 8

    def test_delete(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        gid = r.json()["grade_id"]
        r = client.delete(f"/api/grade/{gid}")
        assert r.status_code == 200
        r = client.get(f"/api/grade/{gid}")
        assert r.status_code == 404


class TestFactorUpdate:

    def test_update_factor(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        gid = r.json()["grade_id"]
        rob_factor = [f for f in r.json()["factors"] if f["factor_key"] == "risk_of_bias"][0]

        r = client.put(f"/api/grade/factors/{rob_factor['factor_id']}", json={
            "rating": "serious", "rationale": "Some concerns",
        })
        assert r.status_code == 200
        assert r.json()["certainty_rating"] == "moderate"  # high - 1 = moderate

    def test_update_nonexistent_factor(self, client):
        r = client.put("/api/grade/factors/nonexistent", json={"rating": "serious"})
        assert r.status_code == 404


class TestAutoPopulate:

    def test_auto_populate_with_rob(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        gid = r.json()["grade_id"]
        r = client.post(f"/api/grade/{gid}/auto-populate")
        assert r.status_code == 200
        rob_f = [f for f in r.json()["factors"] if f["factor_key"] == "risk_of_bias"][0]
        assert rob_f["auto_populated"] == 1
        # RoB is high → should downgrade
        assert rob_f["rating"] in ("serious", "very_serious")

    def test_auto_populate_nonexistent(self, client):
        r = client.post("/api/grade/nonexistent/auto-populate")
        assert r.status_code == 404


class TestComputeCertainty:

    def test_compute(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        gid = r.json()["grade_id"]
        r = client.post(f"/api/grade/{gid}/compute")
        assert r.status_code == 200
        assert r.json()["certainty_rating"] == "high"


class TestSoFTable:

    def test_get_sof(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "Primary"})
        gid = r.json()["grade_id"]
        r = client.get(f"/api/grade/{gid}/sof-table")
        assert r.status_code == 200
        assert r.json()["outcome"] == "Primary"
        assert len(r.json()["factors"]) == 8


class TestStartingLevel:

    def test_starting_level_rct(self, client, project_with_study):
        pid, _, _ = project_with_study
        r = client.get(f"/api/projects/{pid}/grade/starting-level")
        assert r.status_code == 200
        assert r.json()["starting_level"] == "high"


class TestExport:

    def test_export_csv(self, client, project_with_study):
        pid, _, _ = project_with_study
        client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "O"})
        r = client.get(f"/api/projects/{pid}/grade/export?format=csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "Outcome" in r.text
