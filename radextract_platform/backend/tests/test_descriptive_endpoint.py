"""GET /analysis/descriptive: which extractions are pooled, and the PRISMA counts."""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import analysis


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


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(analysis.router)
    return TestClient(app)


def _seed():
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        for vid, name, ftype in (("v1", "Diameter", "number"), ("v2", "Rupture", "categorical")):
            conn.execute("INSERT INTO variables (variable_id, project_id, section, name, field_type) VALUES (?, ?, 'S', ?, ?)",
                         (vid, pid, name, ftype))
        studies = {}
        for key, status, dup in (("a", "included", 0), ("b", "included", 0), ("c", "excluded", 0), ("d", "included", 1)):
            sid = str(uuid.uuid4())
            studies[key] = sid
            conn.execute("INSERT INTO studies (study_id, project_id, title, screening_status, is_duplicate) "
                         "VALUES (?, ?, ?, ?, ?)", (sid, pid, key, status, dup))
        rows = [("a", "v1", "2"), ("b", "v1", "NR"), ("c", "v1", "100"), ("d", "v1", "50"),
                ("a", "v2", "present"), ("b", "v2", "absent"), ("c", "v2", "present")]
        for key, vid, value in rows:
            conn.execute("INSERT INTO extractions (extraction_id, study_id, variable_id, value) VALUES (?, ?, ?, ?)",
                         (str(uuid.uuid4()), studies[key], vid, value))
        conn.commit()
    finally:
        conn.close()
    return pid


def test_only_included_non_duplicate_studies_are_pooled(client):
    body = client.get(f"/api/projects/{_seed()}/analysis/descriptive").json()
    by_name = {v["name"]: v for v in body["variables"]}
    diameter = by_name["Diameter"]
    assert diameter["missing"] == 1 and diameter["result"]["n"] == 1 and diameter["result"]["median"] == 2
    assert by_name["Rupture"]["binary"]["k"] == 1 and by_name["Rupture"]["binary"]["n"] == 2
    assert "not a formal meta-analysis" in body["note"]


def test_prisma_counts(client):
    prisma = client.get(f"/api/projects/{_seed()}/analysis/descriptive").json()["prisma"]
    assert prisma["identified"] == 4 and prisma["duplicates_removed"] == 1
    assert prisma["by_status"] == {"included": 2, "excluded": 1}


def test_unknown_project_is_404(client):
    assert client.get("/api/projects/missing/analysis/descriptive").status_code == 404
