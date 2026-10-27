"""Tests for Phase 2: Access control enforcement.

Work Order Requirements:
- Anonymous GET /api/grade/{id} -> 401
- Anonymous DELETE /api/grade/{id} -> 401
- Authenticated non-member GET /api/grade/{id} -> 403
- Authenticated non-member DELETE /api/grade/{id} -> 403
- Member GET /api/grade/{id} -> 200
- Member (editor/owner) DELETE /api/grade/{id} -> 200
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db
from dependencies import create_access_token

client = TestClient(app)

PROJECT_ID = "p_grade_access_test"
GRADE_ID = "g_grade_access_test_1"
ALICE_ID = "usr_alice_member"
BOB_ID = "usr_bob_nonmember"


@pytest.fixture(autouse=True)
def setup_access_data():
    init_db()
    conn = get_connection()
    try:
        # Clean previous
        conn.execute("DELETE FROM grade_factors WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM users WHERE user_id IN (?, ?)", (ALICE_ID, BOB_ID))

        # Create users
        conn.execute(
            "INSERT INTO users (user_id, username, email, role, password_hash) VALUES (?, ?, ?, ?, ?)",
            (ALICE_ID, "alice_member", "alice@example.com", "reviewer", "hash_placeholder"),
        )
        conn.execute(
            "INSERT INTO users (user_id, username, email, role, password_hash) VALUES (?, ?, ?, ?, ?)",
            (BOB_ID, "bob_nonmember", "bob@example.com", "reviewer", "hash_placeholder"),
        )

        # Create project and assign Alice as owner member, Bob is NOT a member
        conn.execute(
            "INSERT INTO projects (project_id, name, created_by) VALUES (?, ?, ?)",
            (PROJECT_ID, "Grade Access Test Project", ALICE_ID),
        )
        conn.execute(
            "INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)",
            ("pm_alice_grade", PROJECT_ID, ALICE_ID, "owner"),
        )

        # Create grade assessment
        conn.execute(
            "INSERT INTO grade_assessments (grade_id, project_id, outcome_label, certainty_rating, created_by) VALUES (?, ?, ?, ?, ?)",
            (GRADE_ID, PROJECT_ID, "All-cause mortality", "high", ALICE_ID),
        )
        conn.commit()
    finally:
        conn.close()

    yield

    conn = get_connection()
    try:
        conn.execute("DELETE FROM grade_factors WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM users WHERE user_id IN (?, ?)", (ALICE_ID, BOB_ID))
        conn.commit()
    finally:
        conn.close()


def test_anonymous_get_grade_returns_401():
    response = client.get(f"/api/grade/{GRADE_ID}")
    assert response.status_code == 401, f"Expected 401 for anonymous GET, got {response.status_code}: {response.text}"


def test_anonymous_delete_grade_returns_401():
    response = client.delete(f"/api/grade/{GRADE_ID}")
    assert response.status_code == 401, f"Expected 401 for anonymous DELETE, got {response.status_code}: {response.text}"


def test_non_member_get_grade_returns_403():
    token_bob = create_access_token(user_id=BOB_ID, username="bob_nonmember", role="reviewer")
    response = client.get(
        f"/api/grade/{GRADE_ID}",
        headers={"Authorization": f"Bearer {token_bob}"},
    )
    assert response.status_code == 403, f"Expected 403 for non-member GET, got {response.status_code}: {response.text}"


def test_non_member_delete_grade_returns_403():
    token_bob = create_access_token(user_id=BOB_ID, username="bob_nonmember", role="reviewer")
    response = client.delete(
        f"/api/grade/{GRADE_ID}",
        headers={"Authorization": f"Bearer {token_bob}"},
    )
    assert response.status_code == 403, f"Expected 403 for non-member DELETE, got {response.status_code}: {response.text}"


def test_member_get_grade_returns_200():
    token_alice = create_access_token(user_id=ALICE_ID, username="alice_member", role="reviewer")
    response = client.get(
        f"/api/grade/{GRADE_ID}",
        headers={"Authorization": f"Bearer {token_alice}"},
    )
    assert response.status_code == 200, f"Expected 200 for member GET, got {response.status_code}: {response.text}"
    assert response.json()["grade_id"] == GRADE_ID


def test_member_delete_grade_returns_200():
    token_alice = create_access_token(user_id=ALICE_ID, username="alice_member", role="reviewer")
    response = client.delete(
        f"/api/grade/{GRADE_ID}",
        headers={"Authorization": f"Bearer {token_alice}"},
    )
    assert response.status_code == 200, f"Expected 200 for member DELETE, got {response.status_code}: {response.text}"
