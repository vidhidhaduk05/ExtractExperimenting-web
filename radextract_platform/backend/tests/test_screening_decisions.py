"""Tests for blinded multi-reviewer screening (v2.4 feature 2)."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_screening.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _create_project_and_studies(client, n_studies=3):
    r = client.post("/api/projects", json={"name": "Screening Test"})
    pid = r.json()["project_id"]
    sids = []
    for i in range(n_studies):
        r = client.post(f"/api/projects/{pid}/studies", json={
            "project_id": pid, "title": f"Study {i}",
            "abstract": f"Abstract {i}",
        })
        sids.append(r.json()["study_id"])
    return pid, sids


def _make_decision(client, sid, pid, reviewer_id, reviewer_name, decision, reason_code="", stage="ta"):
    """Helper to create a screening decision with correct field names."""
    body = {
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": reviewer_id,
        "reviewer_name": reviewer_name,
        "decision": decision,
        "stage": stage,
    }
    if reason_code:
        body["reason_code"] = reason_code
    db = get_connection()
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES (?, ?, ?)", (reviewer_id, reviewer_name, "test"))
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)", (f"{pid}-{reviewer_id}", pid, reviewer_id, "reviewer"))
    db.commit()
    client.headers["Authorization"] = f"Bearer {create_access_token(reviewer_id, reviewer_name, 'reviewer')}"
    return client.post(f"/api/studies/{sid}/screening-decision", json=body)


def test_create_screening_decision(client):
    """POST /studies/{id}/screening-decision should create a decision."""
    pid, sids = _create_project_and_studies(client, 1)
    r = _make_decision(client, sids[0], pid, "reviewer1", "Alice", "included")
    assert r.status_code == 200
    data = r.json()
    assert data["decision"] == "included"
    assert data["reviewer_name"] == "Alice"


def test_list_screening_decisions(client):
    """GET /projects/{id}/screening-decisions should list all decisions."""
    pid, sids = _create_project_and_studies(client, 2)

    _make_decision(client, sids[0], pid, "r1", "Alice", "included")
    _make_decision(client, sids[1], pid, "r1", "Alice", "excluded", "wrong_population")

    r = client.get(f"/api/projects/{pid}/screening-decisions")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 2


def test_get_study_screening_decisions(client):
    """GET /studies/{id}/screening-decisions should return decisions for one study."""
    pid, sids = _create_project_and_studies(client, 1)
    _make_decision(client, sids[0], pid, "r1", "Alice", "included")

    r = client.get(f"/api/studies/{sids[0]}/screening-decisions")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1


def test_conflict_detection(client):
    """When two reviewers disagree, a conflict should be created."""
    pid, sids = _create_project_and_studies(client, 1)

    _make_decision(client, sids[0], pid, "r1", "Alice", "included")
    _make_decision(client, sids[0], pid, "r2", "Bob", "excluded", "wrong_population")

    r = client.get(f"/api/projects/{pid}/screening-conflicts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["status"] == "unresolved"


def test_no_conflict_when_agree(client):
    """When two reviewers agree, no conflict should be created."""
    pid, sids = _create_project_and_studies(client, 1)

    _make_decision(client, sids[0], pid, "r1", "Alice", "included")
    _make_decision(client, sids[0], pid, "r2", "Bob", "included")

    r = client.get(f"/api/projects/{pid}/screening-conflicts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_resolve_conflict(client):
    """PUT /screening-conflicts/{id}/resolve should resolve a conflict."""
    pid, sids = _create_project_and_studies(client, 1)

    _make_decision(client, sids[0], pid, "r1", "Alice", "included")
    _make_decision(client, sids[0], pid, "r2", "Bob", "excluded", "wrong_population")

    r = client.get(f"/api/projects/{pid}/screening-conflicts")
    conflict_id = r.json()[0]["conflict_id"]

    r = client.put(f"/api/screening-conflicts/{conflict_id}/resolve", json={
        "resolution": "included",
        "resolved_by": "admin",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"


def test_screening_config_get_update(client):
    """GET/PUT /projects/{id}/screening-config should work."""
    pid, _ = _create_project_and_studies(client, 1)

    r = client.get(f"/api/projects/{pid}/screening-config")
    assert r.status_code == 200
    config = r.json()
    assert "blind_mode" in config

    r = client.put(f"/api/projects/{pid}/screening-config", json={
        "blind_mode": True,
        "n_reviewers": 2,
        "conflict_mode": "manual",
    })
    assert r.status_code == 200
    assert r.json()["blind_mode"] is True
    assert r.json()["n_reviewers"] == 2


def test_blind_mode_sets_is_blinded(client):
    """When blind mode is on, decisions should be marked as blinded."""
    pid, sids = _create_project_and_studies(client, 1)

    client.put(f"/api/projects/{pid}/screening-config", json={
        "blind_mode": True, "n_reviewers": 2, "conflict_mode": "manual",
    })

    r = _make_decision(client, sids[0], pid, "r1", "Alice", "included")
    assert r.status_code == 200
    assert r.json()["is_blinded"] == 1
