"""Record collaboration: privacy, access, project scope and durable tag lifecycle."""
import sqlite3
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import SCHEMA_SQL, get_db
from dependencies import get_current_user
from routers.record_collaboration import router
from services.db_backend import SQLiteBackend


@pytest.fixture
def workspace():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_SQL)
    connection.execute("PRAGMA foreign_keys = ON")
    db = SQLiteBackend(connection)
    for name in ("alice", "bob", "viewer", "outsider"):
        db.insert("users", {"user_id": name, "username": name, "password_hash": "test"})
    for project in ("p1", "p2"):
        db.insert("projects", {"project_id": project, "name": project})
        for name in ("alice", "bob", "viewer"):
            db.insert("project_members", {"member_id": f"{project}-{name}",
                "project_id": project, "user_id": name,
                "role": "viewer" if name == "viewer" else "reviewer"})
        for number in (1, 2):
            db.insert("studies", {"study_id": f"{project}-s{number}",
                "project_id": project, "title": "A study", "screening_status": "pending"})
    db.commit()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield app, client, db
    app.dependency_overrides.clear()
    connection.close()


def acting(app, name):
    app.dependency_overrides[get_current_user] = lambda: {"user_id": name, "username": name}


def tag(client, name="Pilot", project="p1"):
    response = client.post(f"/api/projects/{project}/tags", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["tag_id"]


def test_authentication_required(workspace):
    _, client, _ = workspace
    assert client.get("/api/studies/p1-s1/annotations").status_code == 401
    assert client.get("/api/projects/p1/tags").status_code == 401
    assert client.post("/api/projects/p1/tags", json={"name": "Pilot"}).status_code == 401


def test_private_notes_never_leak_and_authors_are_server_owned(workspace):
    app, client, db = workspace
    acting(app, "alice")
    for visibility, text in (("shared", "Check supplement"), ("private", "My assessment")):
        response = client.post("/api/studies/p1-s1/annotations", json={"text": text, "visibility": visibility})
        assert response.status_code == 200
        assert response.json()["author_id"] == "alice"
        assert response.json()["author_name"] == "alice"
        assert response.json()["created_at"]
    assert len(client.get("/api/studies/p1-s1/annotations").json()["annotations"]) == 2
    acting(app, "bob")
    notes = client.get("/api/studies/p1-s1/annotations").json()["annotations"]
    assert [row["text"] for row in notes] == ["Check supplement"]
    assert client.post("/api/studies/p1-s1/annotations", json={
        "text": "Forged", "visibility": "shared", "author_id": "alice"}).status_code == 422
    assert db.get("studies", "p1-s1")["screening_status"] == "pending"
    assert client.get("/api/studies/p2-s1/annotations").json()["annotations"] == []


def test_retry_does_not_duplicate_comments(workspace):
    app, client, _ = workspace
    acting(app, "alice")
    payload = {"text": "A comment", "visibility": "shared", "request_id": "09bcfe57-cb1e-4b5a-9339-229951c6adcf"}
    first = client.post("/api/studies/p1-s1/annotations", json=payload)
    second = client.post("/api/studies/p1-s1/annotations", json=payload)
    assert first.json() == second.json()
    assert len(client.get("/api/studies/p1-s1/annotations").json()["annotations"]) == 1
    assert client.post("/api/studies/p1-s1/annotations", json={**payload, "text": "Changed"}).status_code == 409


def test_tag_lifecycle_multiple_assignment_search_and_project_scope(workspace):
    app, client, db = workspace
    acting(app, "alice")
    pilot, fulltext = tag(client), tag(client, "Full text needed")
    other = tag(client, project="p2")
    for tag_id in (pilot, fulltext):
        path = f"/api/studies/p1-s1/tags/{tag_id}"
        assert client.put(path).status_code == 200
        assert client.put(path).status_code == 200
    assert len(db.query("study_tag_links", {})) == 2
    assert client.put(f"/api/studies/p1-s1/tags/{other}").status_code == 400
    result = client.get("/api/projects/p1/tags").json()
    assert set(result["study_tags"]["p1-s1"]) == {pilot, fulltext}
    assert client.get(f"/api/projects/p1/tags/{pilot}/studies").json()["study_ids"] == ["p1-s1"]
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"name": "Calibration"}).status_code == 200
    assert [t["name"] for t in client.get("/api/projects/p1/tags?q=calib").json()["tags"]] == ["Calibration"]
    assert client.patch(f"/api/projects/p2/tags/{pilot}", json={"name": "Wrong project"}).status_code == 404
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"archived": True}).status_code == 200
    assert client.put(f"/api/studies/p1-s2/tags/{pilot}").status_code == 409
    assert [t["tag_id"] for t in client.get("/api/projects/p1/tags?include_archived=false").json()["tags"]] == [fulltext]
    assert len(db.query("study_tag_links", {})) == 2  # Archive retains existing associations.
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"archived": False}).status_code == 200
    assert client.delete(f"/api/studies/p1-s1/tags/{pilot}").status_code == 200
    assert client.delete(f"/api/studies/p1-s1/tags/{pilot}").status_code == 200
    assert client.get(f"/api/projects/p1/tags/{pilot}/studies").json()["study_ids"] == []


def test_duplicate_and_invalid_names_are_rejected(workspace):
    app, client, _ = workspace
    acting(app, "alice")
    pilot = tag(client, " Pilot ")
    assert client.post("/api/projects/p1/tags", json={"name": "pIlOt"}).status_code == 409
    other = tag(client, "Other")
    assert client.patch(f"/api/projects/p1/tags/{other}", json={"name": "PILOT"}).status_code == 409
    for name in ("   ", "x" * 81):
        assert client.post("/api/projects/p1/tags", json={"name": name}).status_code == 422
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={}).status_code == 422
    assert client.post("/api/studies/p1-s1/annotations", json={"text": " ", "visibility": "shared"}).status_code == 422


def test_nonmembers_denied_viewers_read_only(workspace):
    app, client, db = workspace
    acting(app, "alice")
    pilot = tag(client)
    for name, expected in (("outsider", 403), ("viewer", 200)):
        acting(app, name)
        assert client.get("/api/projects/p1/tags").status_code == expected
        assert client.get("/api/studies/p1-s1/annotations").status_code == expected
        assert client.post("/api/studies/p1-s1/annotations", json={"text": "No", "visibility": "shared"}).status_code == 403
        assert client.put(f"/api/studies/p1-s1/tags/{pilot}").status_code == 403
        assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"archived": True}).status_code == 403
    assert db.query("record_annotations", {}) == []


def test_storage_failures_are_not_reported_as_success(workspace, monkeypatch):
    app, client, _ = workspace
    acting(app, "alice")
    pilot = tag(client)
    monkeypatch.setattr(workspace[2], "update", lambda *_: False)
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"name": "New"}).status_code == 503


def test_missing_resources_and_strict_archive_values(workspace):
    app, client, _ = workspace
    acting(app, "alice")
    assert client.get("/api/studies/missing/annotations").status_code == 404
    assert client.get("/api/projects/missing/tags").status_code == 404
    assert client.put("/api/studies/p1-s1/tags/missing").status_code == 404
    pilot = tag(client)
    assert client.patch(f"/api/projects/p1/tags/{pilot}", json={"archived": "false"}).status_code == 422


def test_removing_a_record_cleans_its_annotations_and_links(workspace):
    app, client, db = workspace
    acting(app, "alice")
    pilot = tag(client)
    client.put(f"/api/studies/p1-s1/tags/{pilot}")
    client.post("/api/studies/p1-s1/annotations", json={"text": "Note", "visibility": "private"})
    from routers.studies import delete_study
    asyncio.run(delete_study("p1-s1", {"user_id": "alice"}, db))
    assert db.query("record_annotations", {}) == []
    assert db.query("study_tag_links", {}) == []
    assert db.get("project_tags", pilot) is not None


def test_schema_upgrade_is_idempotent_and_preserves_notes(workspace):
    app, client, db = workspace
    acting(app, "alice")
    client.post("/api/studies/p1-s1/annotations", json={"text": "Keep me", "visibility": "private"})
    db._conn.executescript(SCHEMA_SQL)
    assert client.get("/api/studies/p1-s1/annotations").json()["annotations"][0]["text"] == "Keep me"


def test_project_deletion_removes_collaboration_records(workspace):
    app, client, db = workspace
    acting(app, "alice")
    pilot = tag(client)
    other = tag(client, project="p2")
    client.put(f"/api/studies/p1-s1/tags/{pilot}")
    client.post("/api/studies/p1-s1/annotations", json={"text": "Note", "visibility": "shared"})
    db.update("project_members", "p1-alice", {"role": "owner"})
    db.commit()
    from routers.projects import delete_project
    asyncio.run(delete_project("p1", {"user_id": "alice"}, db))
    assert db.query("record_annotations", {}) == []
    assert db.query("study_tag_links", {}) == []
    assert db.get("project_tags", pilot) is None
    assert db.get("project_tags", other) is not None
