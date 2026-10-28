"""Tests for duplicate detection service (v2.4 feature 1)."""
import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from routers import projects, studies, screening
from database import reset_db, init_db, get_connection
from config import settings
from dependencies import create_access_token
from services.dedup_service import deduplicate_studies, _title_similarity, _author_overlap

app = FastAPI()
for router in (projects.router, studies.router, screening.router):
    app.include_router(router)


import os
import shutil

TEST_TMP = os.path.join(os.path.dirname(__file__), ".test_dedup_tmp")


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    os.makedirs(TEST_TMP, exist_ok=True)
    db_file = os.path.join(TEST_TMP, "test_dedup.db")
    upload_dir = os.path.join(TEST_TMP, "uploads")
    export_dir = os.path.join(TEST_TMP, "exports")
    os.makedirs(upload_dir, exist_ok=True)
    os.makedirs(export_dir, exist_ok=True)
    monkeypatch.setattr(settings, "db_path", db_file)
    monkeypatch.setattr(settings, "upload_root", upload_dir)
    monkeypatch.setattr(settings, "export_root", export_dir)
    monkeypatch.setattr(settings, "storage_root", os.path.join(TEST_TMP, "storage"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT INTO users (user_id, username, password_hash) VALUES (?, ?, ?)",
                 ("legacy-dedup-owner", "legacy-dedup-owner", "unused-test-password"))
    conn.commit()
    conn.close()
    yield
    reset_db()
    shutil.rmtree(TEST_TMP, ignore_errors=True)



@pytest.fixture
def client():
    token = create_access_token("legacy-dedup-owner", "legacy-dedup-owner", "owner")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def _create_project(client):
    r = client.post("/api/projects", json={"name": "Dedup Test"})
    assert r.status_code == 200, r.text
    return r.json()["project_id"]


def _create_study(client, pid, **kwargs):
    payload = {"project_id": pid, "title": kwargs.get("title", "Test Study"),
               "authors": kwargs.get("authors", "Smith J"),
               "publication_year": kwargs.get("year", 2023),
               "doi": kwargs.get("doi", ""),
               "pmid": kwargs.get("pmid", ""),
               "abstract": kwargs.get("abstract", "")}
    r = client.post(f"/api/projects/{pid}/studies", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["study_id"]


# ── Unit tests for helper functions ──

def test_title_similarity_identical():
    assert _title_similarity("CT for appendicitis", "CT for appendicitis") == 1.0


def test_title_similarity_similar():
    ratio = _title_similarity(
        "Diagnostic accuracy of CT for acute appendicitis",
        "Diagnostic accuracy of CT for acute appendicitis"
    )
    assert ratio > 0.95


def test_title_similarity_different():
    ratio = _title_similarity("MRI for brain tumors", "CT for lung cancer screening")
    assert ratio < 0.5


def test_title_similarity_empty():
    # Levenshtein ratio of two empty strings is 1.0 (they're identical)
    assert _title_similarity("", "") == 1.0


def test_author_overlap_same():
    assert _author_overlap("Smith J", "Smith J") == 1.0


def test_author_overlap_different():
    assert _author_overlap("Smith J", "Jones K") == 0.0


def test_author_overlap_partial():
    """Two authors with one shared last name should have partial overlap."""
    score = _author_overlap("Smith J, Jones K", "Smith L, Brown M")
    assert 0 < score <= 1.0


def test_author_overlap_empty():
    assert _author_overlap("", "") == 0.0


# ── Integration tests ──

def test_dedup_doi_exact_match(client):
    """Studies with same DOI should be detected as duplicates."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Study A", doi="10.1234/test")
    sid2 = _create_study(client, pid, title="Study B", doi="10.1234/test")

    result = deduplicate_studies(pid)
    assert result["total_duplicates"] >= 1
    assert len(result["duplicate_groups"]) >= 1


def test_dedup_pmid_exact_match(client):
    """Studies with same PMID should be detected as duplicates."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Study C", pmid="12345678")
    sid2 = _create_study(client, pid, title="Study D", pmid="12345678")

    result = deduplicate_studies(pid)
    assert result["total_duplicates"] >= 1


def test_dedup_title_similarity(client):
    """Studies with very similar titles should be detected as duplicates."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid,
                         title="Diagnostic accuracy of CT for acute appendicitis",
                         authors="Smith J", year=2023)
    sid2 = _create_study(client, pid,
                         title="Diagnostic accuracy of CT for acute appendicitis",
                         authors="Smith J", year=2023)

    result = deduplicate_studies(pid)
    assert result["total_duplicates"] >= 1


def test_dedup_no_duplicates(client):
    """Studies with different titles/DOIs/PMIDs should not be flagged."""
    pid = _create_project(client)
    _create_study(client, pid, title="MRI for brain tumors", doi="10.1111/a", pmid="11111111")
    _create_study(client, pid, title="CT for lung cancer", doi="10.2222/b", pmid="22222222")

    result = deduplicate_studies(pid)
    assert result["total_duplicates"] == 0


def test_dedup_endpoint(client):
    """POST /projects/{id}/studies/deduplicate should work."""
    pid = _create_project(client)
    _create_study(client, pid, title="Study X", doi="10.9999/dup")
    _create_study(client, pid, title="Study Y", doi="10.9999/dup")

    r = client.post(f"/api/projects/{pid}/studies/deduplicate")
    assert r.status_code == 200
    data = r.json()
    assert data["total_duplicates"] >= 1


def test_dedup_marks_is_duplicate_flag(client):
    """After dedup, the duplicate study should have is_duplicate=1 in DB."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Original", doi="10.5555/orig")
    sid2 = _create_study(client, pid, title="Duplicate", doi="10.5555/orig")

    client.post(f"/api/projects/{pid}/studies/deduplicate")

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT study_id, is_duplicate FROM studies WHERE project_id = ?",
            (pid,)
        ).fetchall()
        dup_count = sum(1 for r in rows if r["is_duplicate"])
        assert dup_count >= 1
    finally:
        conn.close()


def test_get_duplicate_studies_endpoint(client):
    """GET /projects/{id}/studies/duplicates should return candidates with side-by-side metadata without auto-marking."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Study 1", doi="10.1000/dup", pmid="111", abstract="Abstract 1")
    sid2 = _create_study(client, pid, title="Study 2", doi="10.1000/dup", pmid="111", abstract="Abstract 2")

    r = client.get(f"/api/projects/{pid}/studies/duplicates")
    assert r.status_code == 200
    data = r.json()
    assert data["total_duplicates"] >= 1
    assert len(data["duplicate_groups"]) >= 1

    group = data["duplicate_groups"][0]
    assert group["canonical_study_id"] in (sid1, sid2)
    assert "canonical_title" in group
    assert "canonical_doi" in group
    assert "canonical_abstract" in group
    assert len(group["duplicates"]) >= 1

    dup = group["duplicates"][0]
    assert "match_reason" in dup
    assert "similarity_score" in dup
    assert "abstract" in dup


def test_resolve_keep_primary(client):
    """POST /projects/{id}/studies/deduplicate/resolve with keep_primary."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Alpha Study", doi="10.2000/keep")
    sid2 = _create_study(client, pid, title="Beta Study", doi="10.2000/keep")

    r = client.post(
        f"/api/projects/{pid}/studies/deduplicate/resolve",
        json={
            "action": "keep_primary",
            "primary_study_id": sid1,
            "duplicate_study_id": sid2,
        },
    )
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "success"
    assert res["action"] == "keep_primary"

    conn = get_connection()
    try:
        s1 = conn.execute("SELECT is_duplicate FROM studies WHERE study_id = ?", (sid1,)).fetchone()
        s2 = conn.execute("SELECT is_duplicate, screening_status, duplicate_of_study_id FROM studies WHERE study_id = ?", (sid2,)).fetchone()
        assert s1["is_duplicate"] == 0
        assert s2["is_duplicate"] == 1
        assert s2["screening_status"] == "excluded"
        assert s2["duplicate_of_study_id"] == sid1
    finally:
        conn.close()


def test_resolve_keep_both_reversible(client):
    """POST /projects/{id}/studies/deduplicate/resolve with keep_both (reversible duplicate marking)."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Gamma Study", doi="10.3000/both")
    sid2 = _create_study(client, pid, title="Delta Study", doi="10.3000/both")

    # First mark sid2 as duplicate
    client.post(f"/api/projects/{pid}/studies/deduplicate")

    # Now reversibly keep both
    r = client.post(
        f"/api/projects/{pid}/studies/deduplicate/resolve",
        json={
            "action": "keep_both",
            "primary_study_id": sid1,
            "duplicate_study_id": sid2,
        },
    )
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "success"

    conn = get_connection()
    try:
        s2 = conn.execute("SELECT is_duplicate, screening_status FROM studies WHERE study_id = ?", (sid2,)).fetchone()
        assert s2["is_duplicate"] == 0
        assert s2["screening_status"] == "pending"
    finally:
        conn.close()


def test_resolve_merge_metadata(client):
    """POST /projects/{id}/studies/deduplicate/resolve with merge_metadata."""
    pid = _create_project(client)
    sid1 = _create_study(client, pid, title="Epsilon Study", doi="10.4000/merge", abstract="Short abstract")
    sid2 = _create_study(client, pid, title="Epsilon Study", doi="10.4000/merge", pmid="998877", abstract="A much longer and comprehensive abstract with full details")

    r = client.post(
        f"/api/projects/{pid}/studies/deduplicate/resolve",
        json={
            "action": "merge_metadata",
            "primary_study_id": sid1,
            "duplicate_study_id": sid2,
        },
    )
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "success"
    assert res["action"] == "merge_metadata"

    conn = get_connection()
    try:
        s1 = conn.execute("SELECT pmid, abstract, is_duplicate FROM studies WHERE study_id = ?", (sid1,)).fetchone()
        s2 = conn.execute("SELECT is_duplicate, screening_status FROM studies WHERE study_id = ?", (sid2,)).fetchone()
        # pmid from s2 should have merged into s1
        assert s1["pmid"] == "998877"
        assert "much longer" in s1["abstract"]
        assert s1["is_duplicate"] == 0
        assert s2["is_duplicate"] == 1
    finally:
        conn.close()


def test_dedup_none_title_handling():
    """Ensure studies with None or empty title in DB do not raise TypeError during deduplication."""
    class MockDB:
        def query(self, table, filter_dict, order_by=None):
            if table != "studies":
                return []
            return [
                {"study_id": "s1", "title": None, "doi": "10.8888/none1", "authors": "Smith J", "publication_year": 2021},
                {"study_id": "s2", "title": None, "doi": "10.8888/none2", "authors": "Jones K", "publication_year": 2022},
            ]

        def commit(self):
            pass

        def execute(self, sql, params=()):
            return self

        def fetchall(self):
            return []

    db = MockDB()
    res = deduplicate_studies("test_project", auto_mark=False, db=db)
    assert res["total_studies"] == 2
    assert res["total_duplicates"] == 0


def test_dedup_title_formatting_variations(client):
    """Ensure titles differing only by punctuation or formatting are correctly detected as duplicates."""
    pid = _create_project(client)
    sid1 = _create_study(
        client, pid,
        title="Diagnostic accuracy of CT for acute appendicitis: a systematic review",
        authors="Smith J; Jones K", year=2022
    )
    sid2 = _create_study(
        client, pid,
        title="Diagnostic accuracy of CT for acute appendicitis - a systematic review",
        authors="Smith J & Jones K", year=2022
    )

    res = deduplicate_studies(pid)
    assert res["total_duplicates"] >= 1
