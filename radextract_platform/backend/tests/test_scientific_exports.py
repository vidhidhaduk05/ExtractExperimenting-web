"""Tests for scientific exports authorization and functionality."""
import sqlite3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import SCHEMA_SQL, get_db
from dependencies import get_current_user_optional
from routers.scientific_exports import router
from services.db_backend import SQLiteBackend


@pytest.fixture
def workspace():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_SQL)
    connection.execute("PRAGMA foreign_keys = ON")
    db = SQLiteBackend(connection)

    # Insert test users
    for name in ("alice", "outsider"):
        db.insert("users", {"user_id": name, "username": name, "password_hash": "test"})

    # Insert test project
    db.insert("projects", {"project_id": "p1", "name": "Project 1"})
    db.insert("project_members", {
        "member_id": "p1-alice",
        "project_id": "p1",
        "user_id": "alice",
        "role": "viewer",
    })

    # Insert test study
    db.insert("studies", {
        "study_id": "s1",
        "project_id": "p1",
        "title": "Test Study Title",
        "authors": "Author A, Author B",
        "publication_year": 2023,
        "journal": "Test Journal",
        "doi": "10.1000/182",
        "pmid": "12345678",
    })
    db.commit()

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield app, client, db
    app.dependency_overrides.clear()
    connection.close()


def acting(app, name):
    if name is None:
        app.dependency_overrides[get_current_user_optional] = lambda: None
    else:
        app.dependency_overrides[get_current_user_optional] = lambda: {"user_id": name, "username": name}


def test_export_bibliography_access(workspace):
    app, client, _ = workspace

    # Authorized user
    acting(app, "alice")
    resp = client.post("/api/scientific-export/bibliography", json={"project_id": "p1", "format": "bibtex"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert "Test Study Title" in resp.json()["content"]

    # Unauthorized user
    acting(app, "outsider")
    resp = client.post("/api/scientific-export/bibliography", json={"project_id": "p1", "format": "bibtex"})
    assert resp.status_code == 403


def test_draft_manuscript_access(workspace):
    app, client, _ = workspace

    # Authorized user
    acting(app, "alice")
    resp = client.post("/api/scientific-export/draft-manuscript", json={"project_id": "p1", "section": "all"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert "# Manuscript Sections: Project 1" in resp.json()["markdown"]

    # Unauthorized user
    acting(app, "outsider")
    resp = client.post("/api/scientific-export/draft-manuscript", json={"project_id": "p1", "section": "all"})
    assert resp.status_code == 403
