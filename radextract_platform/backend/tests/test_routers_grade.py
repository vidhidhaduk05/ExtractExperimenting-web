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
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('test_user', 'Test User', 'test', 'owner')")
    conn.commit()
    yield


@pytest.fixture
def client():
    from dependencies import create_access_token, create_user
    u = create_user("testuser", "pass", role="owner")
    token = create_access_token(u["user_id"], u["username"], u["role"])
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


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


class TestGradeAuthorization:

    def test_non_member_access_forbidden(self, client, project_with_study):
        pid, _, _ = project_with_study
        # Create a non-member user and token
        from dependencies import create_access_token, create_user
        other_u = create_user("other_user", "pass", role="reviewer")
        other_token = create_access_token(other_u["user_id"], other_u["username"], other_u["role"])
        non_member_headers = {"Authorization": f"Bearer {other_token}"}

        # Attempt to access project grade endpoints
        r_list = client.get(f"/api/projects/{pid}/grade", headers=non_member_headers)
        assert r_list.status_code == 403
        assert "Insufficient permissions" in r_list.json()["detail"]

        r_start = client.get(f"/api/projects/{pid}/grade/starting-level", headers=non_member_headers)
        assert r_start.status_code == 403
        assert "Insufficient permissions" in r_start.json()["detail"]

        r_export = client.get(f"/api/projects/{pid}/grade/export?format=csv", headers=non_member_headers)
        assert r_export.status_code == 403
        assert "Insufficient permissions" in r_export.json()["detail"]

    def test_anonymous_and_member_grade_access(self, client, project_with_study):
        pid, _, _ = project_with_study
        r_create = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "Auth Check Outcome"})
        assert r_create.status_code == 200
        grade_id = r_create.json()["grade_id"]

        # Anonymous client without auth header
        anon_client = TestClient(app)

        # 1. Anonymous GET -> 401
        r_anon_get = anon_client.get(f"/api/grade/{grade_id}")
        assert r_anon_get.status_code == 401

        # 2. Anonymous DELETE -> 401
        r_anon_del = anon_client.delete(f"/api/grade/{grade_id}")
        assert r_anon_del.status_code == 401

        # Non-member client
        from dependencies import create_access_token, create_user
        non_mem = create_user("non_member_user", "pass", role="reviewer")
        non_mem_token = create_access_token(non_mem["user_id"], non_mem["username"], non_mem["role"])
        non_mem_client = TestClient(app)
        non_mem_client.headers.update({"Authorization": f"Bearer {non_mem_token}"})

        # 3. Non-member GET -> 403
        r_non_get = non_mem_client.get(f"/api/grade/{grade_id}")
        assert r_non_get.status_code == 403

        # 4. Non-member DELETE -> 403
        r_non_del = non_mem_client.delete(f"/api/grade/{grade_id}")
        assert r_non_del.status_code == 403

        # Member client (client fixture is authenticated as rev1 member)
        # 5. Member GET -> 200
        r_mem_get = client.get(f"/api/grade/{grade_id}")
        assert r_mem_get.status_code == 200
        assert r_mem_get.json()["grade_id"] == grade_id

        # 6. Member DELETE -> 200
        r_mem_del = client.delete(f"/api/grade/{grade_id}")
        assert r_mem_del.status_code == 200
        assert r_mem_del.json()["deleted"] is True


class TestGradeWorkflowAndFinalization:

    def test_grade_final_impossible_before_synthesis_and_export_labels_descriptive(self, client, project_with_study):
        pid, sid, aid = project_with_study

        # 1. Create a GRADE assessment for an outcome before synthesis has run
        r_create = client.post(f"/api/projects/{pid}/grade", json={"outcome_label": "Unsynthesized Outcome"})
        assert r_create.status_code == 200
        grade_data = r_create.json()
        gid = grade_data["grade_id"]
        assert grade_data["status"] == "draft"

        # 2. CHECK: Finalizing before synthesis must fail (400)
        r_fin_fail = client.post(f"/api/grade/{gid}/finalize")
        assert r_fin_fail.status_code == 400
        assert "Cannot finalize GRADE assessment: synthesis" in r_fin_fail.json()["detail"]

        # 3. Simulate synthesis running for this outcome (e.g. meta-analysis created with cannot_pool)
        conn = get_connection()
        mid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO meta_analyses (meta_id, project_id, outcome_label, results_json) VALUES (?, ?, 'Unsynthesized Outcome', '{\"status\": \"cannot_pool\"}')",
            (mid, pid),
        )
        conn.commit()
        conn.close()

        # 4. Now finalization succeeds
        r_fin_ok = client.post(f"/api/grade/{gid}/finalize")
        assert r_fin_ok.status_code == 200
        final_data = r_fin_ok.json()
        assert final_data["status"] == "final"
        assert final_data["finalized_at"] != ""

        # 5. CHECK: Export labels descriptive-synthesis review correctly
        r_export_json = client.get(f"/api/projects/{pid}/export/json")
        assert r_export_json.status_code == 200
        exp_json = r_export_json.json()
        assert exp_json["is_descriptive_synthesis"] is True
        assert exp_json["synthesis_label"] == "Descriptive Synthesis (Narrative Pooling)"

        r_export_csv = client.get(f"/api/projects/{pid}/export?format=csv")
        assert r_export_csv.status_code == 200
        assert "Descriptive Synthesis (Narrative Pooling)" in r_export_csv.text


