import asyncio
import sqlite3

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

from database import SCHEMA_SQL
from models import ScreeningDecisionCreate
from routers.screening import create_screening_decision
from services.db_backend import SQLiteBackend


@pytest.fixture
def db():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA_SQL)
    connection.execute("ALTER TABLE projects ADD COLUMN screening_config_json TEXT DEFAULT '{}'")
    store = SQLiteBackend(connection)
    store.insert("projects", {"project_id": "p", "name": "Review"})
    store.insert("users", {"user_id": "reviewer", "username": "Reviewer", "password_hash": "test"})
    store.insert("project_members", {"member_id": "member", "user_id": "reviewer", "project_id": "p", "role": "reviewer"})
    for sid, stage, status in [("abstract", "ta", "pending"), ("fulltext", "ft", "pending"),
                               ("new", "", "pending"), ("legacy-fulltext", "", "awaiting_pdf"),
                               ("corrupt", "unexpected", "pending")]:
        store.insert("studies", {"study_id": sid, "project_id": "p", "title": sid,
            "screening_stage": stage, "screening_status": status})
    store.commit()
    yield store
    connection.close()


def save(db, sid, stage, project="p", decision="maybe"):
    body = ScreeningDecisionCreate(study_id=sid, project_id=project, reviewer_id="reviewer",
                                   stage=stage, decision=decision)
    return asyncio.run(create_screening_decision(sid, body, BackgroundTasks(), {"user_id": "reviewer", "username": "Reviewer"}, db))


@pytest.mark.parametrize("sid,stage", [("abstract", "ta"), ("fulltext", "ft"),
                                     ("new", "ta"), ("legacy-fulltext", "ft")])
def test_saves_against_actual_record_stage(db, sid, stage):
    result = save(db, sid, stage)
    assert result.stage == stage
    assert db.get("studies", sid)["screening_stage"] == stage
    assert db.query("screening_decisions", {"study_id": sid})[0]["stage"] == stage


@pytest.mark.parametrize("sid,wrong_stage", [("abstract", "ft"), ("fulltext", "ta"),
                                           ("new", "ft"), ("legacy-fulltext", "ta"), ("corrupt", "ta")])
def test_stage_mismatch_has_no_side_effects(db, sid, wrong_stage):
    before = db.get("studies", sid)
    with pytest.raises(HTTPException) as error:
        save(db, sid, wrong_stage)
    assert error.value.status_code == 409
    assert db.get("studies", sid) == before
    assert db.query("screening_decisions", {}) == []
    assert db.query("screening_conflicts", {}) == []


@pytest.mark.parametrize("stage", ["all", "abstract", "fulltext", "", "wrong"])
def test_request_rejects_noncanonical_stage(stage):
    with pytest.raises(ValidationError):
        ScreeningDecisionCreate(study_id="s", project_id="p", reviewer_id="r", decision="maybe", stage=stage)


def test_project_mismatch_rejected_before_writes(db):
    with pytest.raises(HTTPException) as error:
        save(db, "abstract", "ta", project="other")
    assert error.value.status_code == 400
    assert db.query("screening_decisions", {}) == []


def test_stale_retry_does_not_overwrite_previous_stage_decision(db):
    original = save(db, "abstract", "ta")
    db.update("studies", "abstract", {"screening_stage": "ft"})
    db.commit()
    with pytest.raises(HTTPException) as error:
        save(db, "abstract", "ta", decision="excluded")
    assert error.value.status_code == 409
    assert db.get("screening_decisions", original.decision_id)["decision"] == "maybe"
    new = save(db, "abstract", "ft")
    assert new.decision_id != original.decision_id
    assert len(db.query("screening_decisions", {"study_id": "abstract"})) == 2
