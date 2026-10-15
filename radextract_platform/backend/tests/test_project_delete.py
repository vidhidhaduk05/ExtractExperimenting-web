"""Deleting a project removes everything hanging off it, including data from the ported features."""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import projects
from services import error_analysis_service as eas, reporting_profile_service as rps, rob_service


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    yield
    reset_db()
    db_mod._backend_instance = None


def _count(table):
    conn = get_connection()
    try:
        return conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]
    finally:
        conn.close()


def test_project_with_ported_data_can_be_deleted():
    app = FastAPI()
    app.include_router(projects.router)
    client = TestClient(app)
    pid, other, sid = (str(uuid.uuid4()) for _ in range(3))
    conn = get_connection()
    try:
        for p in (pid, other):
            conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (p, p[:4]))
        conn.execute("INSERT INTO studies (study_id, project_id, title, study_design) VALUES (?, ?, 'S', 'randomized controlled trial')", (sid, pid))
        conn.execute("INSERT INTO variables (variable_id, project_id, section, name, field_type) VALUES ('v', ?, 'S', 'V', 'text')", (pid,))
        conn.execute("INSERT INTO extractions (extraction_id, study_id, variable_id, value) VALUES ('e', ?, 'v', '1')", (sid,))
        conn.execute("INSERT INTO rob_runs (run_id, project_id) VALUES ('r', ?)", (pid,))
        conn.commit()
    finally:
        conn.close()
    rob_service.create_assessment(sid, pid, "rob2")
    backend = db_mod.get_db_backend()
    rps.persist_profile(backend, pid, sid, rps.assess_profile({"title": "fMRI CVR", "abstract": "cerebrovascular reactivity"}, None))
    eas.record_decision(backend, pid, sid, "v", "V", "a", "b", "modified")

    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 200 and r.json()["deleted"] is True
    for table in ("studies", "extractions", "rob_assessments", "rob_domain_judgments", "rob_signaling_answers",
                  "rob_runs", "reporting_profile_assessments", "reporting_profile_items", "extraction_decisions", "variables"):
        assert _count(table) == 0, table
    assert _count("projects") == 1  # the other project is untouched
