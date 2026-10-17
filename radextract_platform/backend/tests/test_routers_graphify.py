"""Tests for graphify router authorization checks."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_graphify.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_review_graph_authorization(client):
    # Register Owner
    client.post("/api/auth/register", json={"username": "owner", "password": "password123"})
    owner_token = client.post("/api/auth/login", json={"username": "owner", "password": "password123"}).json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # Create project
    p_res = client.post("/api/projects", json={"name": "Owner Project"}, headers=owner_headers)
    assert p_res.status_code == 200
    project_id = p_res.json()["project_id"]

    # Register Unauthorized User
    client.post("/api/auth/register", json={"username": "stranger", "password": "password123"})
    stranger_token = client.post("/api/auth/login", json={"username": "stranger", "password": "password123"}).json()["access_token"]
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}

    # Owner can access review graph
    r_owner = client.get(f"/api/projects/{project_id}/graphify/review/graph", headers=owner_headers)
    assert r_owner.status_code == 200

    # Unauthorized stranger gets 403 Forbidden
    r_stranger = client.get(f"/api/projects/{project_id}/graphify/review/graph", headers=stranger_headers)
    assert r_stranger.status_code == 403
    assert "Insufficient permissions" in r_stranger.json()["detail"]
