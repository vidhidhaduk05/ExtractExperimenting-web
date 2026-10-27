"""Tests for Phase 5: GRADE Finalize workflow and state transitions.

Work Order Requirements:
1. GRADE assessment starts in 'draft' status.
2. Finalize is rejected (HTTP 400) if synthesis has not run for that outcome.
3. Finalize succeeds (HTTP 200) once synthesis is ready, transitioning status to 'final' and recording finalized_at timestamp.
4. Anonymous requests return HTTP 401, non-members return HTTP 403.
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db
from dependencies import create_access_token

client = TestClient(app)

PROJECT_ID = "p_grade_finalize_test"
GRADE_ID = "g_grade_finalize_test_1"
META_ID = "m_grade_finalize_test_1"
ALICE_ID = "usr_alice_grade_fin"
BOB_ID = "usr_bob_grade_fin"

ALICE_TOKEN = create_access_token(ALICE_ID, "alice_fin", "editor")
BOB_TOKEN = create_access_token(BOB_ID, "bob_fin", "viewer")

ALICE_HEADERS = {"Authorization": f"Bearer {ALICE_TOKEN}"}
BOB_HEADERS = {"Authorization": f"Bearer {BOB_TOKEN}"}


@pytest.fixture(autouse=True)
def setup_grade_finalize_data():
    init_db()
    conn = get_connection()
    try:
        # Cleanup
        conn.execute("DELETE FROM grade_factors WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (META_ID,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (META_ID,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM users WHERE user_id IN (?, ?)", (ALICE_ID, BOB_ID))

        # Users
        conn.execute(
            "INSERT INTO users (user_id, username, email, role, password_hash) VALUES (?, 'alice_fin', 'alice@fin.com', 'editor', 'placeholder')",
            (ALICE_ID,),
        )
        conn.execute(
            "INSERT INTO users (user_id, username, email, role, password_hash) VALUES (?, 'bob_fin', 'bob@fin.com', 'viewer', 'placeholder')",
            (BOB_ID,),
        )

        # Project with Alice as owner/editor. Bob is NOT a member.
        conn.execute("INSERT INTO projects (project_id, name, created_by) VALUES (?, 'GRADE Finalize Project', ?)", (PROJECT_ID, ALICE_ID))
        conn.execute(
            "INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')",
            ("pm_alice_fin", PROJECT_ID, ALICE_ID),
        )

        # Meta-analysis without pooled effect or studies (synthesis not ready)
        conn.execute(
            "INSERT INTO meta_analyses (meta_id, project_id, outcome_label, n_studies) VALUES (?, ?, 'Mortality Rate', 0)",
            (META_ID, PROJECT_ID),
        )

        # GRADE assessment in draft status without synthesis
        conn.execute(
            """INSERT INTO grade_assessments (grade_id, project_id, outcome_label, meta_analysis_id, certainty_rating, status, created_by)
               VALUES (?, ?, 'Mortality Rate', ?, 'moderate', 'draft', ?)""",
            (GRADE_ID, PROJECT_ID, META_ID, ALICE_ID),
        )
        conn.commit()
    finally:
        conn.close()

    yield

    conn = get_connection()
    try:
        conn.execute("DELETE FROM grade_factors WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE grade_id = ?", (GRADE_ID,))
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (META_ID,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (META_ID,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM users WHERE user_id IN (?, ?)", (ALICE_ID, BOB_ID))
        conn.commit()
    finally:
        conn.close()


def test_anonymous_finalize_returns_401():
    resp = client.post(f"/api/grade/{GRADE_ID}/finalize")
    assert resp.status_code == 401


def test_non_member_finalize_returns_403():
    resp = client.post(f"/api/grade/{GRADE_ID}/finalize", headers=BOB_HEADERS)
    assert resp.status_code == 403


def test_finalize_rejected_before_synthesis():
    """Finalize must fail if no pooled or descriptive synthesis has run for that outcome."""
    resp = client.post(f"/api/grade/{GRADE_ID}/finalize", headers=ALICE_HEADERS)
    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "synthesis" in detail.lower()


def test_finalize_succeeds_after_synthesis_ready():
    """Once synthesis has run (meta_analysis has pooled effect or n_studies >= 2), finalize succeeds."""
    conn = get_connection()
    try:
        conn.execute(
            """UPDATE meta_analyses
               SET n_studies = 2, pooled_effect = 0.45, pooled_ci_lower = 0.20, pooled_ci_upper = 0.70
               WHERE meta_id = ?""",
            (META_ID,),
        )
        conn.commit()
    finally:
        conn.close()

    resp = client.post(f"/api/grade/{GRADE_ID}/finalize", headers=ALICE_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "final"
    assert data["finalized_at"] != ""
    assert data["finalized_at"] is not None

    # Verify persisted in database
    conn = get_connection()
    try:
        row = conn.execute("SELECT status, finalized_at FROM grade_assessments WHERE grade_id = ?", (GRADE_ID,)).fetchone()
        assert row["status"] == "final"
        assert row["finalized_at"] is not None
    finally:
        conn.close()
