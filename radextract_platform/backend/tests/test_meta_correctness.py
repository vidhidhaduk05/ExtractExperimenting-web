"""Tests for Phase 1 correctness: zero fabrication in meta-analysis and synthesis.

Work Order Requirements:
- Hand-computed 3-study pool reproduces to 4 decimals.
- Empty project or < 2 studies with usable effect data returns {"status": "cannot_pool", "reason": "...", "studies": [...]}.
- Zero references to Miller et al. or math.sin in synthesis endpoints.
- Valid multi-study data pools with real DerSimonian-Laird mathematics.
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db
from dependencies import create_access_token
from services import meta_analysis as ma

client = TestClient(app)

USER_ID = "usr_meta_correctness_tester"
AUTH_TOKEN = create_access_token(USER_ID, "meta_tester", "admin")
AUTH_HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}"}


@pytest.fixture(autouse=True)
def setup_meta_test_user():
    init_db()
    conn = get_connection()
    try:
        conn.execute("DELETE FROM users WHERE user_id = ?", (USER_ID,))
        conn.execute(
            "INSERT INTO users (user_id, username, email, role, password_hash) VALUES (?, 'meta_tester', 'meta@test.com', 'admin', 'placeholder')",
            (USER_ID,)
        )
        conn.commit()
    finally:
        conn.close()
    yield
    conn = get_connection()
    try:
        conn.execute("DELETE FROM users WHERE user_id = ?", (USER_ID,))
        conn.commit()
    finally:
        conn.close()


def test_hand_computed_three_study_pool():
    """DerSimonian-Laird random-effects model reproduces hand-calculated 3-study pool to 4 decimals."""
    effects = [0.5, 0.8, 0.3]
    variances = [0.04, 0.05, 0.04]
    res = ma.fit_generic_meta_analysis(effects, variances, "md")

    assert res["pooled_effect"] == pytest.approx(0.5194, abs=1e-4)
    assert res["se"] == pytest.approx(0.1413, abs=1e-4)
    assert res["ci_lower"] == pytest.approx(0.2424, abs=1e-4)
    assert res["ci_upper"] == pytest.approx(0.7963, abs=1e-4)
    assert res["tau_squared"] == pytest.approx(0.0169, abs=1e-4)
    assert res["q_statistic"] == pytest.approx(2.7857, abs=1e-4)


def test_empty_project_cannot_pool():
    """Empty project must return HTTP 200 with status: cannot_pool, never numbers or Miller sample studies."""
    conn = get_connection()
    pid = "proj_test_empty_meta_pool"
    try:
        conn.execute("DELETE FROM studies WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM meta_analyses WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.execute("INSERT INTO projects (project_id, name, created_by) VALUES (?, 'Empty Project', ?)", (pid, USER_ID))
        conn.execute("INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", (f"pm_{pid}", pid, USER_ID))
        conn.commit()
    finally:
        conn.close()

    resp = client.get(f"/api/meta-analysis/{pid}", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cannot_pool"
    assert "reason" in data
    assert "studies" in data
    assert "pooled_effect" not in data
    assert "Miller" not in str(data)

    conn = get_connection()
    try:
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()


def test_project_with_insufficient_studies_cannot_pool():
    """Project with only 1 included study must return cannot_pool with missing data listing."""
    conn = get_connection()
    pid = "proj_test_one_study_meta"
    sid = "s_meta_lone"
    try:
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id = ?", (pid, sid))
        conn.execute("DELETE FROM meta_analyses WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.execute("INSERT INTO projects (project_id, name, created_by) VALUES (?, 'One Study Project', ?)", (pid, USER_ID))
        conn.execute("INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", (f"pm_{pid}", pid, USER_ID))
        conn.execute(
            "INSERT INTO studies (study_id, project_id, title, authors, publication_year, screening_status) VALUES (?, ?, 'Lone Study', 'Solo', 2023, 'included')",
            (sid, pid)
        )
        conn.commit()
    finally:
        conn.close()

    resp = client.get(f"/api/meta-analysis/{pid}", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cannot_pool"
    assert "reason" in data
    assert len(data["studies"]) == 1
    assert data["studies"][0]["study_id"] == sid
    assert "insufficient" in data["studies"][0].get("missing_data", "").lower() or "usable" in data["reason"].lower()

    conn = get_connection()
    try:
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id = ?", (pid, sid))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()


def test_run_endpoint_cannot_pool_when_under_two_studies():
    """POST /api/meta-analyses/{id}/run returns HTTP 200 with cannot_pool if < 2 studies with effect data."""
    conn = get_connection()
    pid = "proj_test_run_insufficient"
    mid = "meta_test_insufficient"
    try:
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.execute("INSERT INTO projects (project_id, name, created_by) VALUES (?, 'Run Test Project', ?)", (pid, USER_ID))
        conn.execute("INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", (f"pm_{pid}", pid, USER_ID))
        conn.execute(
            "INSERT INTO meta_analyses (meta_id, project_id, outcome_label, analysis_type, effect_measure) VALUES (?, ?, 'Mortality', 'generic', 'or')",
            (mid, pid)
        )
        conn.commit()
    finally:
        conn.close()

    resp = client.post(f"/api/meta-analyses/{mid}/run", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cannot_pool"
    assert "reason" in data
    assert "studies" in data

    conn = get_connection()
    try:
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()


def test_real_pooling_when_sufficient_studies_present():
    """When >= 2 studies have extractable data, run endpoint pools them without math.sin fiction."""
    conn = get_connection()
    pid = "proj_test_real_pool"
    mid = "meta_test_real_pool"
    sids = ["s_meta_pool_1", "s_meta_pool_2", "s_meta_pool_3"]
    try:
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id IN (?, ?, ?)", (pid, *sids))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.execute("INSERT INTO projects (project_id, name, created_by) VALUES (?, 'Real Pool Project', ?)", (pid, USER_ID))
        conn.execute("INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, 'owner')", (f"pm_{pid}", pid, USER_ID))
        conn.execute(
            "INSERT INTO meta_analyses (meta_id, project_id, outcome_label, analysis_type, effect_measure) VALUES (?, ?, 'Pain Reduction', 'generic', 'md')",
            (mid, pid)
        )
        # Study 1: effect=0.5, var=0.04
        import json
        raw1 = json.dumps({"effect_size": 0.5, "variance": 0.04, "label": "Study A"})
        raw2 = json.dumps({"effect_size": 0.8, "variance": 0.05, "label": "Study B"})
        raw3 = json.dumps({"effect_size": 0.3, "variance": 0.04, "label": "Study C"})
        conn.execute(
            "INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, study_label, raw_data_json, included) VALUES ('l1', ?, ?, 'Study A', ?, 1)",
            (mid, sids[0], raw1)
        )
        conn.execute(
            "INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, study_label, raw_data_json, included) VALUES ('l2', ?, ?, 'Study B', ?, 1)",
            (mid, sids[1], raw2)
        )
        conn.execute(
            "INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, study_label, raw_data_json, included) VALUES ('l3', ?, ?, 'Study C', ?, 1)",
            (mid, sids[2], raw3)
        )
        conn.commit()
    finally:
        conn.close()

    resp = client.post(f"/api/meta-analyses/{mid}/run", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["n_studies"] == 3
    # Check that pooled effect matches hand computed 0.5194
    pooled = data["pooled"]
    assert pooled["pooled_effect"] == pytest.approx(0.5194, abs=1e-4)

    conn = get_connection()
    try:
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (mid,))
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id IN (?, ?, ?)", (pid, *sids))
        conn.execute("DELETE FROM project_members WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()
