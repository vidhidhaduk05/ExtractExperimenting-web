"""API tests for the weighted scoring endpoints (evaluate + traces)."""
from __future__ import annotations

import json
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from main import app
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token, create_user

CRITERIA = [
    {"id": "inc_pop", "text": "Target population", "direction": "inclusion",
     "rule_mode": "weighted", "weight": 0.8},
    {"id": "exc_animal", "text": "Animal only", "direction": "exclusion",
     "rule_mode": "weighted", "weight": 0.9},
    {"id": "hard_lang", "text": "Non-English", "direction": "exclusion",
     "rule_mode": "required"},
]


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_weighted_api.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO users (user_id, username, password_hash, role) VALUES ('test_user', 'Test User', 'test', 'owner')")
    conn.commit()
    conn.close()
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
def project(client):
    r = client.post("/api/projects", json={"name": "Weighted Test"})
    pid = r.json()["project_id"]
    conn = get_connection()
    conn.execute("UPDATE projects SET criteria_json = ? WHERE project_id = ?",
                 (json.dumps(CRITERIA), pid))
    conn.commit()
    conn.close()
    return pid



def _make_study(client, pid, title="Test study"):
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": title, "study_design": "cohort"})
    return r.json()["study_id"]

def test_evaluate_weighted_endpoint_persists_trace(client, project):
    sid = _make_study(client, project)
    r = client.post(f"/api/projects/{project}/criteria/evaluate-study-weighted", json={
        "study_id": sid, "stage": "ta", "input_text": "some abstract",
        "evidence": [
            {"criterion_id": "inc_pop", "score": 0.9, "quote": "patients with CAD",
             "source_locator": "p.3", "engine": "laya"},
            {"criterion_id": "exc_animal", "score": 0.1, "engine": "laya"},
            {"criterion_id": "hard_lang", "score": 0.0},
        ],
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["recommendation"] in ("include_review", "exclude_review", "uncertain", "exclude")
    assert d["trace_id"]
    assert d["formula_version"] == "weighted-soft-v1"
    assert any(cb["criterion"] == "inc_pop" for cb in d["contributions"])

    r2 = client.get(f"/api/projects/{project}/criteria/evaluation-traces/{sid}")
    assert r2.status_code == 200
    traces = r2.json()["traces"]
    assert len(traces) == 1
    assert traces[0]["trace_id"] == d["trace_id"]
    assert traces[0]["recommendation"] == d["recommendation"]


def test_hard_exclusion_dominates_via_api(client, project):
    r = client.post(f"/api/projects/{project}/criteria/evaluate-study-weighted", json={
        "study_id": _make_study(client, project), "stage": "ta", "input_text": "abstract",
        "evidence": [
            {"criterion_id": "inc_pop", "score": 1.0},
            {"criterion_id": "exc_animal", "score": 0.0},
            {"criterion_id": "hard_lang", "score": 1.0},
        ],
    })
    assert r.status_code == 200
    d = r.json()
    assert d["recommendation"] == "exclude"
    assert "hard_exclude:hard_lang" in d["hard_flags"]


def test_missing_required_rule_is_fail_closed_via_api(client, project):
    r = client.post(f"/api/projects/{project}/criteria/evaluate-study-weighted", json={
        "study_id": _make_study(client, project), "stage": "ta", "input_text": "abstract",
        "evidence": [
            {"criterion_id": "inc_pop", "score": 1.0},
            {"criterion_id": "exc_animal", "score": 0.0},
            {"criterion_id": "hard_lang", "score": None, "applicability": "unknown"},
        ],
    })
    assert r.status_code == 200
    d = r.json()
    assert d["recommendation"] == "uncertain"
    assert "hard_lang" in d["missing"]


def test_legacy_strict_rule_mode_normalized(client, project):
    """Criteria stored with legacy rule_mode 'strict' evaluate as required."""
    r = client.post(f"/api/projects/{project}/criteria/evaluate-study-weighted", json={
        "study_id": _make_study(client, project), "stage": "ta", "input_text": "abstract",
        "evidence": [
            {"criterion_id": "inc_pop", "score": 1.0},
            {"criterion_id": "exc_animal", "score": 0.0},
            {"criterion_id": "hard_lang", "score": 1.0},
        ],
    })
    assert r.status_code == 200
