import sqlite3
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from config import settings
from database import SCHEMA_SQL, get_db
from dependencies import create_access_token
from routers.screening import router
from services.db_backend import SQLiteBackend


@pytest.fixture
def client():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_SQL)
    connection.execute("ALTER TABLE projects ADD COLUMN screening_config_json TEXT DEFAULT '{}'")
    store = SQLiteBackend(connection)
    store.insert("projects", {"project_id": "p", "name": "Review"})
    for uid, role in [("alice", "reviewer"), ("bob", "reviewer"), ("viewer", "viewer"), ("outsider", None)]:
        store.insert("users", {"user_id": uid, "username": uid.title(), "password_hash": "test"})
        if role:
            store.insert("project_members", {"member_id": uid, "project_id": "p", "user_id": uid, "role": role})
    store.insert("studies", {"study_id": "s", "project_id": "p", "title": "Study", "screening_stage": "ta"})
    store.commit()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: store
    with TestClient(app) as result:
        result.store = store
        yield result
    connection.close()


def header(uid):
    # A forged token username must not replace the authoritative database username.
    return {"Authorization": f"Bearer {create_access_token(uid, 'Forged token name', 'owner')}"}


def post(client, uid="alice", **overrides):
    body = {"study_id": "s", "project_id": "p", "decision": "maybe", "stage": "ta", **overrides}
    return client.post("/api/studies/s/screening-decision", json=body, headers=header(uid))


def test_server_owns_reviewer_identity_despite_forged_body(client):
    response = post(client, reviewer_id="bob", reviewer_name="Impersonated Bob")
    assert response.status_code == 200
    assert response.json()["reviewer_id"] == "alice"
    assert response.json()["reviewer_name"] == "Alice"


def test_two_signed_in_users_keep_independent_decisions_and_updates(client):
    first = post(client).json()
    second = post(client, "bob", reviewer_id="alice").json()
    assert first["decision_id"] != second["decision_id"]
    changed = post(client, decision="included", reviewer_id="bob").json()
    assert changed["decision_id"] == first["decision_id"]
    assert client.store.get("screening_decisions", second["decision_id"])["decision"] == "maybe"
    assert len(client.store.query("screening_decisions", {})) == 2


@pytest.mark.parametrize("token", [None, "invalid-token", "expired", "deleted-account"])
def test_unauthenticated_or_invalid_tokens_cannot_write(client, token):
    if token == "expired":
        token = jwt.encode({"sub": "alice", "exp": int(time.time()) - 60}, settings.effective_jwt_secret, algorithm=settings.jwt_algorithm)
    elif token == "deleted-account":
        token = create_access_token("missing", "Missing", "owner")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = client.post("/api/studies/s/screening-decision", json={"study_id": "s", "project_id": "p", "decision": "included", "stage": "ta"}, headers=headers)
    assert response.status_code == 401
    assert client.store.query("screening_decisions", {}) == []
    assert client.store.get("studies", "s")["screening_status"] == "pending"


@pytest.mark.parametrize("uid", ["viewer", "outsider"])
def test_membership_and_reviewer_role_are_required(client, uid):
    assert post(client, uid).status_code == 403
    assert client.store.query("screening_decisions", {}) == []


def test_legacy_status_write_cannot_bypass_authentication_or_attribution(client):
    body = {"status": "maybe", "stage": "ta", "reason": "Uncertain"}
    assert client.put("/api/studies/s/screening", json=body).status_code == 401
    assert client.put("/api/studies/s/screening", json=body, headers=header("alice")).status_code == 200
    assert client.store.query("screening_decisions", {})[0]["reviewer_id"] == "alice"


def test_conflict_resolution_uses_authenticated_resolver(client):
    post(client, decision="included")
    post(client, "bob", decision="excluded", reason_code="wrong_population")
    conflict = client.store.query("screening_conflicts", {})[0]
    url = f'/api/screening-conflicts/{conflict["conflict_id"]}/resolve'
    body = {"resolution": "included", "resolved_by": "bob"}
    assert client.put(url, json=body).status_code == 401
    response = client.put(url, json=body, headers=header("alice"))
    assert response.status_code == 200
    assert response.json()["resolved_by"] == "alice"
