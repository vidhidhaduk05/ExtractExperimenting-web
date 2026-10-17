"""Tests for Screening Fixes & Single Reviewer Status Updates (Part 11 of Plan)."""
import json
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_screen_fixes.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('single_reviewer', 'Reviewer One', 'test', 'owner')")
    conn.commit()
    yield


@pytest.fixture
def client():
    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {create_access_token('single_reviewer', 'Reviewer One', 'owner')}"
    return c


def _setup_project_and_study(client):
    p = client.post("/api/projects", json={"name": "Fixes Test Project"}).json()
    pid = p["project_id"]
    s = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Clinical Trial in Diagnostic Imaging",
        "abstract": "Evaluation of diagnostic accuracy in stroke.",
    }).json()
    reviewer_id = "single_reviewer"
    reviewer_name = "Reviewer One"
    db = get_connection()
    db.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash) VALUES (?, ?, ?)", (reviewer_id, reviewer_name, "test"))
    db.execute("INSERT OR IGNORE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)", (f"{pid}-{reviewer_id}", pid, reviewer_id, "reviewer"))
    db.commit()
    client.headers["Authorization"] = f"Bearer {create_access_token(reviewer_id, reviewer_name, 'reviewer')}"
    return pid, s["study_id"]


def test_single_reviewer_include_updates_status(client):
    """Include decision by a single reviewer immediately updates studies.screening_status."""
    pid, sid = _setup_project_and_study(client)

    r = client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": "single_reviewer",
        "reviewer_name": "Reviewer One",
        "decision": "included",
        "stage": "ta",
        "reason_text": "Matches PICO population",
    })
    assert r.status_code == 200

    conn = get_connection()
    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (sid,)).fetchone()
    assert study["screening_status"] == "included"
    assert study["screening_stage"] == "ta"


def test_single_reviewer_exclude_updates_status(client):
    """Exclude decision by a single reviewer immediately updates studies.screening_status."""
    pid, sid = _setup_project_and_study(client)

    r = client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": "single_reviewer",
        "reviewer_name": "Reviewer One",
        "decision": "excluded",
        "stage": "ta",
        "reason_code": "wrong_population",
        "reason_text": "Pediatric population only",
    })
    assert r.status_code == 200

    conn = get_connection()
    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (sid,)).fetchone()
    assert study["screening_status"] == "excluded"
    assert study["screening_stage"] == "ta"


def test_decision_recorded_in_screening_decisions(client):
    """Screening decision creates an auditable row in screening_decisions table."""
    pid, sid = _setup_project_and_study(client)

    client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": "single_reviewer",
        "reviewer_name": "Reviewer One",
        "decision": "included",
        "stage": "ta",
    })

    conn = get_connection()
    rows = conn.execute("SELECT * FROM screening_decisions WHERE study_id = ?", (sid,)).fetchall()
    assert len(rows) == 1
    assert rows[0]["reviewer_id"] == "single_reviewer"
    assert rows[0]["decision"] == "included"


def test_maybe_decision_works(client):
    """Maybe / uncertain decision updates status appropriately."""
    pid, sid = _setup_project_and_study(client)

    r = client.post(f"/api/studies/{sid}/screening-decision", json={
        "study_id": sid,
        "project_id": pid,
        "reviewer_id": "single_reviewer",
        "reviewer_name": "Reviewer One",
        "decision": "maybe",
        "stage": "ta",
        "reason_text": "Need full-text to decide",
    })
    assert r.status_code == 200

    conn = get_connection()
    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (sid,)).fetchone()
    assert study["screening_status"] == "maybe"


def test_enhanced_summary_includes_new_fields(client):
    """Screening summary returns all new fields: uncertain, awaiting_clarification, awaiting_pdf, confidence counts."""
    pid, sid = _setup_project_and_study(client)

    r = client.get(f"/api/projects/{pid}/screening/summary")
    assert r.status_code == 200
    data = r.json()

    assert "uncertain" in data
    assert "awaiting_clarification" in data
    assert "awaiting_pdf" in data
    assert "high_confidence" in data
    assert "medium_confidence" in data
    assert "low_confidence" in data
    assert "ai_screened" in data
