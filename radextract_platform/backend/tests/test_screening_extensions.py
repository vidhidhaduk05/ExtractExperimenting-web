import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db
import uuid


@pytest.fixture
def client():
    init_db()
    return TestClient(app)


@pytest.fixture
def sample_project(client):
    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO projects (project_id, name, description) VALUES (?, ?, ?)",
            (proj_id, "Test Systematic Review", "Test project for screening extensions")
        )
        conn.commit()
    finally:
        conn.close()
    return proj_id


def test_pubmed_preview_dry_run(client, sample_project):
    """Test PubMed preview search dry-run endpoint."""
    res = client.post("/api/pubmed/preview", json={
        "query": "Multiparametric MRI prostate cancer",
        "project_id": sample_project,
        "sample_size": 3,
    })
    assert res.status_code == 200
    data = res.json()
    assert "total_matching_records" in data
    assert "sample_previews" in data
    assert data["total_matching_records"] > 0
    assert len(data["sample_previews"]) <= 3


def test_reviewer_agreement_endpoint_empty(client, sample_project):
    """Test agreement endpoint when no dual decisions exist."""
    res = client.get(f"/api/projects/{sample_project}/screening/agreement")
    assert res.status_code == 200
    data = res.json()
    assert data["project_id"] == sample_project
    assert data["total_dual_screened"] == 0
    assert data["interpretation"] == "insufficient_data"


def test_reviewer_agreement_with_concordant_and_conflicts(client, sample_project):
    """Test Cohen's kappa and agreement calculation with dual reviews."""
    conn = get_connection()
    try:
        # Create 4 studies
        s_ids = [f"s_{uuid.uuid4().hex[:8]}" for _ in range(4)]
        for sid in s_ids:
            conn.execute(
                "INSERT INTO studies (study_id, project_id, title, screening_status) VALUES (?, ?, ?, 'pending')",
                (sid, sample_project, f"Study {sid}")
            )

        # Study 0: Both include (Concordant include)
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev1', 'included', 'ta')", (str(uuid.uuid4()), s_ids[0], sample_project))
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev2', 'included', 'ta')", (str(uuid.uuid4()), s_ids[0], sample_project))

        # Study 1: Both exclude (Concordant exclude)
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev1', 'excluded', 'ta')", (str(uuid.uuid4()), s_ids[1], sample_project))
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev2', 'excluded', 'ta')", (str(uuid.uuid4()), s_ids[1], sample_project))

        # Study 2: Rev1 include, Rev2 exclude (Discordant Conflict)
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev1', 'included', 'ta')", (str(uuid.uuid4()), s_ids[2], sample_project))
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev2', 'excluded', 'ta')", (str(uuid.uuid4()), s_ids[2], sample_project))

        # Study 3: Both include (Concordant include)
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev1', 'included', 'ta')", (str(uuid.uuid4()), s_ids[3], sample_project))
        conn.execute("INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, decision, stage) VALUES (?, ?, ?, 'rev2', 'included', 'ta')", (str(uuid.uuid4()), s_ids[3], sample_project))

        conn.commit()
    finally:
        conn.close()

    res = client.get(f"/api/projects/{sample_project}/screening/agreement")
    assert res.status_code == 200
    data = res.json()
    assert data["total_dual_screened"] == 4
    assert data["concordant_includes"] == 2
    assert data["concordant_excludes"] == 1
    assert data["conflicts_count"] == 1
    assert data["percentage_agreement"] == 75.0
    assert "cohen_kappa" in data
