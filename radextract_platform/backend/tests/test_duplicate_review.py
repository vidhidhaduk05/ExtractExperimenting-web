"""Duplicate review: read-only candidate list, resolve decisions, and their safeguards."""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import screening


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
    app.include_router(screening.router)
    return TestClient(app)


def _add_study(conn, pid, title, doi="", abstract="", year=2020, journal="", status="pending"):
    sid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, doi, abstract, publication_year, journal, screening_status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (sid, pid, title, doi, abstract, year, journal, status),
    )
    return sid


@pytest.fixture
def project():
    """A project with one duplicate pair (same DOI) and one unrelated study."""
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        a = _add_study(conn, pid, "Deep learning for chest X-ray", doi="10.1234/x", abstract="short", journal="")
        b = _add_study(conn, pid, "Deep learning for chest X-ray.", doi="10.1234/x",
                       abstract="A much longer abstract that the other record lacks entirely.", journal="Radiology")
        c = _add_study(conn, pid, "Something completely different about MRI", doi="10.2234/y")
        conn.commit()
    finally:
        conn.close()
    return {"pid": pid, "a": a, "b": b, "c": c}


def _study(sid):
    conn = get_connection()
    try:
        return dict(conn.execute("SELECT * FROM studies WHERE study_id = ?", (sid,)).fetchone())
    finally:
        conn.close()


def _group(client, pid):
    groups = client.get(f"/api/projects/{pid}/studies/duplicates").json()["duplicate_groups"]
    assert len(groups) == 1
    return groups[0]


def test_candidate_list_is_read_only_and_rich(client, project):
    group = _group(client, project["pid"])
    ids = {group["canonical_study_id"], group["duplicates"][0]["study_id"]}
    assert ids == {project["a"], project["b"]}
    dup = group["duplicates"][0]
    assert dup["match_reason"] == "doi" and {"journal", "abstract", "is_duplicate", "screening_status"} <= set(dup)
    assert {"canonical_doi", "canonical_journal", "canonical_abstract", "canonical_screening_status"} <= set(group)
    # nothing was marked
    assert _study(project["a"])["is_duplicate"] == 0 and _study(project["b"])["is_duplicate"] == 0


def test_auto_mark_flags_the_duplicate_and_reports_it(client, project):
    r = client.post(f"/api/projects/{project['pid']}/studies/deduplicate?auto_mark=true").json()
    assert r["duplicates_marked"] == 1
    assert r["duplicate_groups"][0]["duplicates"][0]["is_duplicate"] == 1
    flagged = [s for s in (project["a"], project["b"]) if _study(s)["is_duplicate"] == 1]
    assert len(flagged) == 1


def test_keep_primary_excludes_the_duplicate(client, project):
    pid, a, b = project["pid"], project["a"], project["b"]
    r = client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                    json={"action": "keep_primary", "primary_study_id": a, "duplicate_study_id": b})
    assert r.status_code == 200 and r.json()["status"] == "success"
    dup, primary = _study(b), _study(a)
    assert dup["is_duplicate"] == 1 and dup["duplicate_of_study_id"] == a
    assert dup["screening_status"] == "excluded" and dup["screening_stage"] == "dedup"
    assert dup["screening_reason"] == "Duplicate publication"
    assert primary["is_duplicate"] == 0 and primary["screening_status"] == "pending"


def test_keep_both_restores_a_dedup_excluded_study(client, project):
    pid, a, b = project["pid"], project["a"], project["b"]
    client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                json={"action": "keep_primary", "primary_study_id": a, "duplicate_study_id": b})
    r = client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                    json={"action": "keep_both", "primary_study_id": a, "duplicate_study_id": b})
    assert r.status_code == 200
    restored = _study(b)
    assert restored["is_duplicate"] == 0 and restored["duplicate_of_study_id"] == ""
    assert restored["screening_status"] == "pending" and restored["screening_stage"] == ""


def test_keep_both_never_wipes_an_existing_screening_decision(client, project):
    """A study already screened (and only flagged by auto-mark) must keep its decision."""
    pid, a, b = project["pid"], project["a"], project["b"]
    conn = get_connection()
    try:
        conn.execute("UPDATE studies SET screening_status='included', screening_stage='ta', "
                     "is_duplicate=1, duplicate_of_study_id=? WHERE study_id=?", (a, b))
        conn.commit()
    finally:
        conn.close()
    client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                json={"action": "revert_duplicate", "primary_study_id": a, "duplicate_study_id": b})
    kept = _study(b)
    assert kept["is_duplicate"] == 0 and kept["screening_status"] == "included" and kept["screening_stage"] == "ta"


def test_merge_metadata_fills_gaps_on_the_primary(client, project):
    pid, a, b = project["pid"], project["a"], project["b"]
    r = client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                    json={"action": "merge_metadata", "primary_study_id": a, "duplicate_study_id": b})
    body = r.json()
    assert set(body["updated_fields"]) >= {"journal", "abstract"}
    primary = _study(a)
    assert primary["journal"] == "Radiology" and primary["abstract"].startswith("A much longer")
    assert _study(b)["screening_reason"] == "Duplicate publication (merged into primary)"


def test_merge_metadata_with_explicit_fields(client, project):
    pid, a, b = project["pid"], project["a"], project["b"]
    client.post(f"/api/projects/{pid}/studies/deduplicate/resolve",
                json={"action": "merge_metadata", "primary_study_id": a, "duplicate_study_id": b,
                      "merged_fields": {"journal": "Chosen Journal", "pmid": ""}})
    primary = _study(a)
    assert primary["journal"] == "Chosen Journal" and primary["pmid"] == ""


@pytest.mark.parametrize("payload,code", [
    ({"action": "explode", "primary_study_id": "{a}", "duplicate_study_id": "{b}"}, 400),
    ({"action": "keep_primary", "primary_study_id": "nope", "duplicate_study_id": "{b}"}, 400),
    ({"action": "keep_primary", "primary_study_id": "{a}", "duplicate_study_id": "nope"}, 400),
    ({"action": "keep_primary", "primary_study_id": "{a}"}, 400),
    ({"action": "keep_primary", "primary_study_id": "{a}", "duplicate_study_id": "{a}"}, 400),
])
def test_bad_resolve_requests_are_rejected(client, project, payload, code):
    payload = {k: v.format(**project) if isinstance(v, str) else v for k, v in payload.items()}
    r = client.post(f"/api/projects/{project['pid']}/studies/deduplicate/resolve", json=payload)
    assert r.status_code == code


def test_unknown_project_is_404(client):
    assert client.get("/api/projects/missing/studies/duplicates").status_code == 404
    assert client.post("/api/projects/missing/studies/deduplicate/resolve",
                       json={"action": "keep_both", "primary_study_id": "x"}).status_code == 404
