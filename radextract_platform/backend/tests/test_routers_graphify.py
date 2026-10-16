"""Tests for graphify router endpoints and access control."""
from fastapi.testclient import TestClient
from main import app
from dependencies import create_access_token
from database import get_connection, init_db, reset_db

client = TestClient(app)


def setup_function():
    reset_db()
    init_db()


def test_review_graph_access_control():
    # Setup database with a project and member/non-member users
    conn = get_connection()
    conn.execute("INSERT INTO projects (project_id, name) VALUES ('proj-g1', 'Graph Test Proj')")
    conn.execute(
        "INSERT INTO users (user_id, username, password_hash, role) VALUES ('u-member', 'member', 'hash', 'reviewer')"
    )
    conn.execute(
        "INSERT INTO users (user_id, username, password_hash, role) VALUES ('u-unauthorized', 'unauth', 'hash', 'reviewer')"
    )
    conn.execute(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ('proj-g1', 'u-member', 'viewer')"
    )
    conn.commit()

    member_token = create_access_token("u-member", "member", "reviewer")
    unauth_token = create_access_token("u-unauthorized", "unauth", "reviewer")

    # Authorized member can access review graph and stats
    res_graph = client.get(
        "/api/projects/proj-g1/graphify/review/graph",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res_graph.status_code == 200
    assert res_graph.json()["project_id"] == "proj-g1"

    res_stats = client.get(
        "/api/projects/proj-g1/graphify/review/stats",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res_stats.status_code == 200
    assert res_stats.json()["project_id"] == "proj-g1"

    # Unauthorized user is denied access (403)
    res_graph_unauth = client.get(
        "/api/projects/proj-g1/graphify/review/graph",
        headers={"Authorization": f"Bearer {unauth_token}"},
    )
    assert res_graph_unauth.status_code == 403

    res_stats_unauth = client.get(
        "/api/projects/proj-g1/graphify/review/stats",
        headers={"Authorization": f"Bearer {unauth_token}"},
    )
    assert res_stats_unauth.status_code == 403
