"""Track Changes decisions: how they change extractions, are classified, counted and exported."""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import extraction
from services.error_analysis_service import classify_discrepancy


from pathlib import Path


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    test_dir = Path("radextract_platform/backend/tests/.test_db_dir")
    test_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "db_path", str(test_dir / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(test_dir / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(test_dir / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    yield
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(extraction.router)
    return TestClient(app)


@pytest.fixture
def project():
    pid, sid, other = (str(uuid.uuid4()) for _ in range(3))
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (other, "Other"))
        conn.execute("INSERT INTO studies (study_id, project_id, title) VALUES (?, ?, ?)", (sid, pid, "S"))
        for vid in ("v1", "v2"):
            conn.execute("INSERT INTO variables (variable_id, project_id, section, name, field_type) VALUES (?, ?, 'S', ?, 'text')",
                         (f"{vid}-{pid}", pid, vid))
        conn.execute("INSERT INTO extractions (extraction_id, study_id, variable_id, value) VALUES (?, ?, ?, ?)",
                     ("e1", sid, f"v1-{pid}", "12 mm"))
        conn.commit()
    finally:
        conn.close()
    return {"pid": pid, "sid": sid, "v1": f"v1-{pid}", "v2": f"v2-{pid}", "other": other}


def _decide(client, p, variable="v1", **kw):
    body = {"project_id": p["pid"], "study_id": p["sid"], "variable_id": p[variable], "variable_name": variable,
            "original_value": "12 mm", "decision": "accepted", **kw}
    return client.post("/api/extraction/decide", json=body)


def _value(sid, vid):
    conn = get_connection()
    try:
        return dict(conn.execute("SELECT * FROM extractions WHERE study_id=? AND variable_id=?", (sid, vid)).fetchone())
    finally:
        conn.close()


@pytest.mark.parametrize("original,corrected,decision,category", [
    ("12 mm", "12 mm", "accepted", "VERIFIED_ACCURATE"),
    ("12 mm", "NR", "rejected", "FALSE_EXTRACTION"),
    ("NR", "12 mm", "modified", "MISSED_CONTEXT"),
    ("12 MM", "12mm.", "modified", "NORMALIZATION"),
    ("12 mm", "15 mm", "modified", "NUMERIC_MISMATCH"),
    ("left side", "right side", "modified", "VALUE_CORRECTION"),
])
def test_classification(original, corrected, decision, category):
    assert classify_discrepancy(original, corrected, decision) == category


def test_accepting_keeps_the_value_and_is_counted(client, project):
    r = _decide(client, project)
    assert r.status_code == 200 and r.json()["record"]["category"] == "VERIFIED_ACCURATE"
    assert _value(project["sid"], project["v1"])["value"] == "12 mm"
    assert _value(project["sid"], project["v1"])["is_edited"] == 0


def test_modifying_updates_the_value_and_writes_the_audit_log(client, project):
    _decide(client, project, decision="modified", corrected_value="15 mm", reviewer="Dr A")
    row = _value(project["sid"], project["v1"])
    assert row["value"] == "15 mm" and row["is_edited"] == 1 and row["edited_by"] == "Dr A"
    conn = get_connection()
    try:
        audit = conn.execute("SELECT old_value, new_value FROM audit_log WHERE study_id=?", (project["sid"],)).fetchall()
    finally:
        conn.close()
    assert [(a["old_value"], a["new_value"]) for a in audit] == [("12 mm", "15 mm")]


def test_rejecting_sets_nr(client, project):
    _decide(client, project, decision="rejected")
    assert _value(project["sid"], project["v1"])["value"] == "NR"


def test_deciding_on_a_missing_extraction_creates_it(client, project):
    _decide(client, project, variable="v2", original_value="left", decision="accepted")
    assert _value(project["sid"], project["v2"])["value"] == "left"


def test_undo_restores_the_value_and_drops_the_decision_from_stats(client, project):
    _decide(client, project, decision="modified", corrected_value="15 mm")
    assert client.get(f"/api/extraction/error-analysis?project_id={project['pid']}").json()["total_decisions"] == 1
    r = _decide(client, project, decision="undone")
    assert r.json() == {"status": "success", "undone": True}
    row = _value(project["sid"], project["v1"])
    assert row["value"] == "12 mm" and row["is_edited"] == 0
    assert client.get(f"/api/extraction/error-analysis?project_id={project['pid']}").json()["total_decisions"] == 0
    assert client.get(f"/api/extraction/export-training-data?project_id={project['pid']}").json() == []


def test_error_analysis_summary(client, project):
    empty = client.get(f"/api/extraction/error-analysis?project_id={project['pid']}").json()
    assert empty["total_decisions"] == 0 and empty["accuracy_rate"] == 100.0
    _decide(client, project, decision="accepted")
    _decide(client, project, variable="v2", original_value="left", decision="modified", corrected_value="right")
    s = client.get(f"/api/extraction/error-analysis?project_id={project['pid']}").json()
    assert s["total_decisions"] == 2 and s["verified_accurate"] == 1 and s["accuracy_rate"] == 50.0
    assert s["category_breakdown"]["VALUE_CORRECTION"] == 1
    assert s["high_error_variables"] == [{"variable": "v2", "error_count": 1}]
    assert s["recent_records"][0]["variable_name"] == "v2"  # newest first


def test_training_export_is_chat_format_and_scoped_to_the_project(client, project):
    _decide(client, project, decision="modified", corrected_value="15 mm", evidence_quote="a 15 mm aneurysm")
    pairs = client.get(f"/api/extraction/export-training-data?project_id={project['pid']}").json()
    assert len(pairs) == 1
    roles = [m["role"] for m in pairs[0]["messages"]]
    assert roles == ["system", "user", "assistant"]
    assert "a 15 mm aneurysm" in pairs[0]["messages"][1]["content"]
    assert '"extracted_value": "15 mm"' in pairs[0]["messages"][2]["content"]
    assert client.get(f"/api/extraction/export-training-data?project_id={project['other']}").json() == []


@pytest.mark.parametrize("override,code", [
    ({"decision": "explode"}, 400),
    ({"decision": "modified", "corrected_value": "  "}, 400),
    ({"study_id": "nope"}, 404),
    ({"variable_id": "nope"}, 404),
])
def test_bad_requests_are_rejected(client, project, override, code):
    body = {"project_id": project["pid"], "study_id": project["sid"], "variable_id": project["v1"],
            "original_value": "12 mm", "decision": "accepted", **override}
    assert client.post("/api/extraction/decide", json=body).status_code == code


def test_a_study_from_another_project_is_refused(client, project):
    body = {"project_id": project["other"], "study_id": project["sid"], "variable_id": project["v1"],
            "original_value": "x", "decision": "accepted"}
    assert client.post("/api/extraction/decide", json=body).status_code == 404


def test_project_id_is_required_for_the_reports(client):
    assert client.get("/api/extraction/error-analysis").status_code == 422
    assert client.get("/api/extraction/export-training-data").status_code == 422
