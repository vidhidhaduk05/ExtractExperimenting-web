"""Tests for exclusion reason taxonomy (v2.4 feature 3)."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_excl.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _create_project(client):
    r = client.post("/api/projects", json={"name": "Exclusion Test"})
    return r.json()["project_id"]


def test_get_default_exclusion_reasons(client):
    """GET /projects/{id}/exclusion-reasons should return default taxonomy."""
    pid = _create_project(client)
    r = client.get(f"/api/projects/{pid}/exclusion-reasons")
    assert r.status_code == 200
    data = r.json()
    assert "reasons" in data
    assert len(data["reasons"]) >= 14  # 14 predefined reasons

    # Check some expected reasons
    codes = [r["code"] for r in data["reasons"]]
    assert "wrong_population" in codes
    assert "wrong_index_test" in codes
    assert "duplicate" in codes
    assert "other" in codes


def test_update_exclusion_reasons(client):
    """PUT /projects/{id}/exclusion-reasons should update the taxonomy."""
    pid = _create_project(client)
    custom_reasons = [
        {"code": "wrong_population", "label": "Wrong population", "is_custom": False},
        {"code": "custom_reason_1", "label": "My custom reason", "is_custom": True},
    ]
    r = client.put(f"/api/projects/{pid}/exclusion-reasons", json={"reasons": custom_reasons})
    assert r.status_code == 200
    data = r.json()
    assert len(data["reasons"]) == 2
    assert data["reasons"][1]["code"] == "custom_reason_1"


def test_reset_exclusion_reasons(client):
    """POST /projects/{id}/exclusion-reasons/reset should restore defaults."""
    pid = _create_project(client)

    # First update with custom
    client.put(f"/api/projects/{pid}/exclusion-reasons", json={
        "reasons": [{"code": "custom", "label": "Custom", "is_custom": True}]
    })

    # Then reset
    r = client.post(f"/api/projects/{pid}/exclusion-reasons/reset")
    assert r.status_code == 200
    data = r.json()
    assert len(data["reasons"]) >= 14  # back to defaults


def test_exclusion_reason_with_screening_decision(client):
    """A screening decision with exclusion should store the reason_code."""
    pid = _create_project(client)
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": "Test Study", "abstract": "Test",
    })
    sid = r.json()["study_id"]

    r = client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid, "reviewer_id": "r1", "reviewer_name": "Alice",
        "decision": "excluded", "reason_code": "wrong_population",
        "reason_text": "Study population was pediatric, not adult",
        "stage": "ta",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["decision"] == "excluded"
    assert data["reason_code"] == "wrong_population"
    assert data["reason_text"] is not None


def test_exclusion_reasons_persist_across_queries(client):
    """Exclusion reasons should persist after being set."""
    pid = _create_project(client)

    # Update
    custom = [
        {"code": "test_reason", "label": "Test Reason", "is_custom": True},
    ]
    client.put(f"/api/projects/{pid}/exclusion-reasons", json={"reasons": custom})

    # Query again
    r = client.get(f"/api/projects/{pid}/exclusion-reasons")
    data = r.json()
    codes = [reason["code"] for reason in data["reasons"]]
    assert "test_reason" in codes
