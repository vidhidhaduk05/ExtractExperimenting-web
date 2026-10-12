"""Personal bookmarks must not alter eligibility or leak across reviewers."""
import asyncio
import sqlite3

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from database import SCHEMA_SQL, get_db
from routers.studies import BookmarkUpdate, delete_study, list_bookmarks, router, set_bookmark
from services.db_backend import SQLiteBackend


@pytest.fixture
def db():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_SQL)
    connection.execute("PRAGMA foreign_keys = ON")
    store = SQLiteBackend(connection)
    for user_id in ("alice", "bob", "outsider"):
        store.insert("users", {"user_id": user_id, "username": user_id, "password_hash": "test"})
    for project_id in ("p1", "p2"):
        store.insert("projects", {"project_id": project_id, "name": project_id})
        for user_id in ("alice", "bob"):
            store.insert("project_members", {"member_id": f"{project_id}-{user_id}",
                "project_id": project_id, "user_id": user_id, "role": "viewer"})
        store.insert("studies", {"study_id": f"{project_id}-study", "project_id": project_id,
            "title": "A study", "screening_status": "included"})
    store.commit()
    yield store
    connection.close()


def save(db, user="alice", study="p1-study", saved=True):
    return asyncio.run(set_bookmark(study, BookmarkUpdate(bookmarked=saved), {"user_id": user}, db))


def listed(db, user="alice", project="p1"):
    return asyncio.run(list_bookmarks(project, {"user_id": user}, db))["study_ids"]


def test_save_is_idempotent_and_personal(db):
    save(db)
    save(db)
    assert listed(db) == ["p1-study"]
    assert listed(db, "bob") == []
    assert listed(db, project="p2") == []
    assert len(db.query("user_review_state", {})) == 1
    assert db.get("studies", "p1-study")["screening_status"] == "included"


def test_remove_only_own_bookmark_and_repeated_remove_is_safe(db):
    save(db)
    save(db, "bob")
    save(db, saved=False)
    save(db, saved=False)
    assert listed(db) == []
    assert listed(db, "bob") == ["p1-study"]


def test_bookmarks_require_project_membership(db):
    for operation in (lambda: save(db, "outsider"), lambda: listed(db, "outsider")):
        with pytest.raises(HTTPException) as error:
            operation()
        assert error.value.status_code == 403
    assert db.query("user_review_state", {}) == []


def test_missing_resources_and_strict_boolean(db):
    with pytest.raises(HTTPException) as error:
        save(db, study="missing")
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        listed(db, project="missing")
    assert error.value.status_code == 404
    with pytest.raises(ValidationError):
        BookmarkUpdate(bookmarked="false")


def test_delete_study_removes_all_personal_bookmarks(db):
    save(db)
    save(db, "bob")
    asyncio.run(delete_study("p1-study", {"user_id": "alice"}, db))
    assert db.query("user_review_state", {}) == []
    assert db.get("studies", "p1-study") is None


def test_http_routes_require_authentication(db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        assert client.get("/api/projects/p1/bookmarks").status_code == 401
        assert client.put("/api/studies/p1-study/bookmark", json={"bookmarked": True}).status_code == 401
    app.dependency_overrides.clear()


def test_failed_removal_is_reported(db, monkeypatch):
    save(db)
    monkeypatch.setattr(db, "delete", lambda *_: False)
    with pytest.raises(HTTPException) as error:
        save(db, saved=False)
    assert error.value.status_code == 503
    assert listed(db) == ["p1-study"]
