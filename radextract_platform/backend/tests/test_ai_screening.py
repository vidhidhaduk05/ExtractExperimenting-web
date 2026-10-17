"""Tests for AI screening prioritization (v2.4 feature 4)."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_ai_screen.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('r1', 'Reviewer One', 'test', 'owner')")
    conn.commit()
    yield


@pytest.fixture
def client():
    from dependencies import create_access_token, create_user
    u = create_user("reviewer_one", "pass", role="owner")
    token = create_access_token(u["user_id"], u["username"], u["role"])
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


def _create_project(client):
    r = client.post("/api/projects", json={"name": "AI Screening Test"})
    return r.json()["project_id"]


def _create_study(client, pid, title, abstract):
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": title, "abstract": abstract,
    })
    return r.json()["study_id"]


def _add_decision(client, sid, pid, decision, reviewer="r1"):
    db = get_connection()
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES (?, ?, ?)", (reviewer, reviewer, "test"))
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)", (f"{pid}-{reviewer}", pid, reviewer, "reviewer"))
    db.commit()
    client.headers["Authorization"] = f"Bearer {create_access_token(reviewer, reviewer, 'reviewer')}"
    client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": reviewer,
        "reviewer_name": reviewer,
        "decision": decision,
        "stage": "ta",
    })


def test_ai_prioritization_insufficient_data(client):
    """Should return model_trained=False when fewer than 10 include + 10 exclude."""
    pid = _create_project(client)
    for i in range(5):
        sid = _create_study(client, pid, f"Include Study {i}", f"CT imaging for diagnosis {i}")
        _add_decision(client, sid, pid, "included")
    for i in range(5):
        sid = _create_study(client, pid, f"Exclude Study {i}", f"Animal model experiment {i}")
        _add_decision(client, sid, pid, "excluded")

    for i in range(5):
        _create_study(client, pid, f"Unlabeled Study {i}", f"MRI for detection {i}")

    r = client.post(f"/api/projects/{pid}/screening/prioritize")
    assert r.status_code == 200
    data = r.json()
    assert data["model_trained"] is False
    assert len(data["prioritized_studies"]) == 0


def test_ai_prioritization_success(client):
    """With enough decisions, should return priority scores for unlabeled studies."""
    pid = _create_project(client)

    for i in range(12):
        sid = _create_study(client, pid, f"CT Accuracy Study {i}",
                            f"This study evaluated the diagnostic accuracy of CT imaging for detecting "
                            f"appendicitis. Sensitivity and specificity were calculated. {i} patients enrolled.")
        _add_decision(client, sid, pid, "included")

    for i in range(12):
        sid = _create_study(client, pid, f"Lab Study {i}",
                            f"This in vitro study examined cell culture properties of drug compounds. "
                            f"Molecular binding assay was performed. No imaging involved.")
        _add_decision(client, sid, pid, "excluded")

    _create_study(client, pid, "CT Diagnostic Study",
                  "CT imaging for detecting pulmonary embolism. Diagnostic accuracy assessment.")
    _create_study(client, pid, "MRI Brain Study",
                  "MRI for brain tumor detection. Sensitivity specificity analysis.")
    _create_study(client, pid, "Drug Trial",
                  "Pharmacological intervention for hypertension. Randomized controlled trial.")
    _create_study(client, pid, "Ultrasound Study",
                  "Ultrasound imaging for gallstone detection. Diagnostic performance.")
    _create_study(client, pid, "Cell Culture Study",
                  "In vitro experiment on cancer cell lines. Molecular pathway analysis.")

    r = client.post(f"/api/projects/{pid}/screening/prioritize")
    assert r.status_code == 200
    data = r.json()
    assert data["model_trained"] is True
    assert len(data["prioritized_studies"]) == 5

    for s in data["prioritized_studies"]:
        assert "ai_priority_score" in s
        assert 0 <= s["ai_priority_score"] <= 1


def test_ai_prioritization_scores_persist(client):
    """After prioritization, ai_priority_score should be stored in DB."""
    pid = _create_project(client)

    for i in range(12):
        sid = _create_study(client, pid, f"CT Study {i}",
                            f"CT imaging diagnostic accuracy sensitivity specificity {i}")
        _add_decision(client, sid, pid, "included")

    for i in range(12):
        sid = _create_study(client, pid, f"Non-imaging {i}",
                            f"Drug treatment molecular pathway cell culture {i}")
        _add_decision(client, sid, pid, "excluded")

    _create_study(client, pid, "New CT Study", "CT for lung cancer screening diagnostic accuracy")

    client.post(f"/api/projects/{pid}/screening/prioritize")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT ai_priority_score FROM studies WHERE title = 'New CT Study'"
        ).fetchone()
        assert row is not None
        assert row["ai_priority_score"] is not None
    finally:
        conn.close()
