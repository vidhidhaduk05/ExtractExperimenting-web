import re
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import SCHEMA_SQL, get_db
from dependencies import get_current_user_optional
from routers.export import router
from services.db_backend import SQLiteBackend
from services.reference_export import export_bibtex


@pytest.fixture
def client():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    db = SQLiteBackend(conn)
    db.insert("projects", {"project_id": "p", "name": "Review"})
    db.insert("projects", {"project_id": "other", "name": "Other review"})
    db.insert("users", {"user_id": "viewer", "username": "viewer", "password_hash": "test"})
    db.insert("project_members", {"member_id": "m", "user_id": "viewer", "project_id": "p", "role": "viewer"})
    for status in ["included", "excluded", "ta_included", "pending", "maybe"]:
        db.insert("studies", {"study_id": status, "project_id": "p", "title": status,
            "screening_status": status, "authors": "Smith John, Doe Alice", "publication_year": 2024})
    db.insert("studies", {"study_id": "outside", "project_id": "other", "title": "Outside", "screening_status": "included"})
    db.commit()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user_optional] = lambda: {"user_id": "viewer"}
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    conn.close()


def test_included_download_is_project_scoped_and_valid_attachment(client):
    response = client.get("/api/projects/p/export/references?format=bibtex&status=included")
    assert response.status_code == 200
    assert response.text.count("@article{") == 1
    assert "title = {included}" in response.text
    for omitted in ("excluded", "ta_included", "pending", "maybe", "Outside"):
        assert f"title = {{{omitted}}}" not in response.text
    assert response.headers["content-type"].startswith("application/x-bibtex")
    assert response.headers["content-disposition"].endswith('.bib"')


def test_invalid_status_rejected(client):
    assert client.get("/api/projects/p/export/references?format=bibtex&status=typo").status_code == 422


def test_non_member_cannot_export(client):
    assert client.get("/api/projects/other/export/references?format=bibtex").status_code == 403


def test_no_included_studies_returns_clear_error(client):
    client.app.dependency_overrides[get_db]().execute("DELETE FROM studies WHERE screening_status = 'included'")
    response = client.get("/api/projects/p/export/references?format=bibtex")
    assert response.status_code == 404
    assert "No studies" in response.json()["detail"]


def test_distinct_authors_and_name_order_preserved():
    text = export_bibtex([{"title": "Test", "authors": "Smith John, Doe Alice"},
                          {"title": "Other", "authors": "Smith, John; Doe, Alice"}])
    assert "author = {Smith John and Doe Alice}" in text
    assert "author = {Smith, John and Doe, Alice}" in text


def test_ambiguous_flattened_names_are_preserved_as_literal_text():
    text = export_bibtex([{"title": "Test", "authors": "Smith, John, Doe, Alice"}])
    assert "author = {{Smith, John, Doe, Alice}}" in text


def test_special_characters_are_escaped_in_metadata():
    text = export_bibtex([{"title": "Café & {MRI} 50% $5 #1 _ ~ ^ \\ test",
                           "doi": "10.1234/a_b", "pmid": "123", "journal": "Science & Health"}])
    for escaped in (r"\&", r"\textbraceleft", r"\textbraceright", r"\%", r"\$", r"\#", r"\_", r"\textasciitilde", r"\textasciicircum", r"\textbackslash"):
        assert escaped in text
    assert "Café" in text
    assert "pmid = {123}" in text


def test_unmatched_literal_braces_do_not_break_bibtex_structure():
    text = export_bibtex([{"title": "One opening { brace", "journal": "One closing } brace"}])
    depth = 0
    for char in text:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        assert depth >= 0
    assert depth == 0


def test_keys_are_unique_and_stable_for_persisted_records():
    records = [{"study_id": sid, "title": "Same title", "publication_year": 2024} for sid in ("s1", "s2")]
    keys = re.findall(r"@article\{([^,]+),", export_bibtex(records))
    reversed_keys = re.findall(r"@article\{([^,]+),", export_bibtex(list(reversed(records))))
    assert len(set(keys)) == 2
    assert reversed_keys == list(reversed(keys))
    assert all(re.fullmatch(r"[A-Za-z0-9_]+", key) for key in keys)


def test_missing_fields_are_omitted_without_placeholders():
    text = export_bibtex([{"title": "Only title"}])
    assert "title = {Only title}" in text
    assert "author =" not in text
    assert "year =" not in text
    assert "doi =" not in text
    assert export_bibtex([]) == ""
