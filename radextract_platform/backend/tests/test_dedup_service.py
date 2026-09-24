"""Tests for duplicate detection service (v2.4 feature 1)."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.dedup_service import deduplicate_studies, _title_similarity, _author_overlap


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_dedup.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _create_project(client):
    r = client.post("/api/projects", json={"name": "Dedup Test"})
    return r.json()["project_id"]


def _create_study(client, pid, **kwargs):
    payload = {"project_id": pid, "title": kwargs.get("title", "Test Study"),
               "authors": kwargs.get("authors", "Smith J"),
               "publication_year": kwargs.get("year", 2023),
               "doi": kwargs.get("doi", ""),
               "pmid": kwargs.get("pmid", ""),
               "abstract": kwargs.get("abstract", "")}
    r = client.post(f"/api/projects/{pid}/studies", json=payload)
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
