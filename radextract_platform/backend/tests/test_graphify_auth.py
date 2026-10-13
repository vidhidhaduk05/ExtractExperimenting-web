"""Tests for graphify endpoint authorization controls."""
import pytest
from fastapi.testclient import TestClient

from main import app
from database import get_connection, reset_db, init_db
from config import settings
from dependencies import create_access_token


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_graphify_auth.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_get_review_graph_auth(client):
    """Test that GET /api/projects/{project_id}/graphify/review/graph enforces project access control."""
    conn = get_connection()

    # 1. Create a project
    pid = "proj_graph_test_123"
    conn.execute("INSERT OR REPLACE INTO projects (project_id, name) VALUES (?, ?)", (pid, "Test Graph Auth Project"))

    # 2. Add an owner to the project
    owner_id = "user_owner_456"
    conn.execute("INSERT OR REPLACE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                 (owner_id, "owner_user", "hashed", "reviewer"))
    conn.execute("INSERT OR REPLACE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)",
                 (f"{pid}_{owner_id}", pid, owner_id, "owner"))

    # 3. Create another user who is NOT a member of the project
    unauthorized_user_id = "user_unauth_789"
    conn.execute("INSERT OR REPLACE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                 (unauthorized_user_id, "unauth_user", "hashed", "reviewer"))

    conn.commit()

    # Token for project owner
    owner_token = create_access_token(user_id=owner_id, username="owner_user", role="reviewer")

    # Token for unauthorized user
    unauth_token = create_access_token(user_id=unauthorized_user_id, username="unauth_user", role="reviewer")

    # Access graph as owner -> should succeed (200)
    response_owner = client.get(
        f"/api/projects/{pid}/graphify/review/graph",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert response_owner.status_code == 200

    # Access stats as owner -> should succeed (200)
    response_stats_owner = client.get(
        f"/api/projects/{pid}/graphify/review/stats",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert response_stats_owner.status_code == 200

    # Access graph as unauthorized user -> should be forbidden (403)
    response_unauth = client.get(
        f"/api/projects/{pid}/graphify/review/graph",
        headers={"Authorization": f"Bearer {unauth_token}"}
    )
    assert response_unauth.status_code == 403

    # Access stats as unauthorized user -> should be forbidden (403)
    response_stats_unauth = client.get(
        f"/api/projects/{pid}/graphify/review/stats",
        headers={"Authorization": f"Bearer {unauth_token}"}
    )
    assert response_stats_unauth.status_code == 403
