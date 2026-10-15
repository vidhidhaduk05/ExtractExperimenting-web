"""Batch Risk-of-Bias run: skipping, progress contract, failures, cancel, endpoints, opt-in trigger."""
from __future__ import annotations

import time
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import ai_screening, rob_run
from services import rob_ai, rob_service


from pathlib import Path


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    test_dir = Path("radextract_platform/backend/tests/.test_db_dir")
    test_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "db_path", str(test_dir / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(test_dir / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(test_dir / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    rob_service.ROB_BATCH_RUNS.clear()
    yield
    rob_service.ROB_BATCH_RUNS.clear()
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def mock_ai(monkeypatch):
    """Pretend the AI service is reachable; pre-fill with the deterministic mock."""
    monkeypatch.setattr(rob_service, "_resolve_prefill_model_fn", lambda: rob_ai.mock_model_fn)


def _project(n_included=3, design="randomized controlled trial", extra_statuses=()):
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        sids = []
        for i in range(n_included):
            sid = str(uuid.uuid4())
            sids.append(sid)
            conn.execute(
                "INSERT INTO studies (study_id, project_id, title, study_design, abstract, screening_status) "
                "VALUES (?, ?, ?, ?, ?, 'included')",
                (sid, pid, f"Study {i}", design, "Randomised trial of treatment versus placebo."),
            )
        for status in extra_statuses:
            conn.execute(
                "INSERT INTO studies (study_id, project_id, title, study_design, screening_status) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), pid, f"{status} study", design, status),
            )
        conn.commit()
    finally:
        conn.close()
    return pid, sids


def _wait_done(pid, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        p = rob_service.get_batch_rob_progress(pid)
        if p["status"] != "running":
            return p
        time.sleep(0.05)
    raise AssertionError("batch run did not finish")


def test_idle_progress_has_frontend_fields():
    p = rob_service.get_batch_rob_progress("nope")
    assert p["status"] == "idle"
    assert {"total_studies", "completed_studies", "failed_studies", "flagged_questions_count"} <= set(p)


def test_run_assesses_included_studies_only(mock_ai):
    pid, sids = _project(3, extra_statuses=("pending", "excluded", "awaiting_pdf"))
    started = rob_service.start_batch_rob_run(pid)
    assert started["total_studies"] == 3
    done = _wait_done(pid)
    assert done["status"] == "completed"
    assert done["completed_studies"] == 3 and done["failed_studies"] == 0
    assessments = rob_service.list_assessments_for_project(pid)
    assert {a["study_id"] for a in assessments} == set(sids)
    assert all(a["tool"] == "rob2" for a in assessments)
    assert all(a["run_id"] == started["run_id"] for a in assessments)
    assert all(a["ai_prefilled"] == 1 for a in assessments)


def test_second_run_skips_assessed_studies(mock_ai):
    pid, _ = _project(2)
    rob_service.start_batch_rob_run(pid)
    _wait_done(pid)
    again = rob_service.start_batch_rob_run(pid)
    assert again["total_studies"] == 0 and again["status"] == "idle"
    assert len(rob_service.list_assessments_for_project(pid)) == 2


def test_no_ai_service_creates_empty_assessments_not_mock_data(monkeypatch):
    monkeypatch.setattr(rob_service, "_resolve_prefill_model_fn", lambda: None)
    pid, _ = _project(2)
    rob_service.start_batch_rob_run(pid)
    done = _wait_done(pid)
    assert done["completed_studies"] == 2
    assert "AI service not reachable" in (done["error_message"] or "")
    assessments = rob_service.list_assessments_for_project(pid)
    assert len(assessments) == 2 and all(a["ai_prefilled"] == 0 for a in assessments)


def test_study_without_matching_tool_is_flagged_for_manual_review(mock_ai):
    pid, sids = _project(1, design="some unclassifiable design")
    rob_service.start_batch_rob_run(pid)
    done = _wait_done(pid)
    assert sids[0] in done["manual_review_ids"]
    assert rob_service.list_assessments_for_project(pid) == []


def test_one_failing_study_does_not_stop_the_run(mock_ai, monkeypatch):
    pid, sids = _project(3)
    real = rob_service.assess_study_for_batch

    def flaky(study_id, *a, **kw):
        if study_id == sids[1]:
            raise RuntimeError("boom")
        return real(study_id, *a, **kw)

    monkeypatch.setattr(rob_service, "assess_study_for_batch", flaky)
    rob_service.start_batch_rob_run(pid)
    done = _wait_done(pid)
    assert done["completed_studies"] == 2 and done["failed_studies"] == 1
    assert sids[1] in done["error_message"]


def test_cancel_stops_the_run_and_keeps_finished_work(mock_ai, monkeypatch):
    pid, sids = _project(4)
    real = rob_service.assess_study_for_batch

    def slow(study_id, *a, **kw):
        time.sleep(0.15)
        return real(study_id, *a, **kw)

    monkeypatch.setattr(rob_service, "assess_study_for_batch", slow)
    rob_service.start_batch_rob_run(pid)
    time.sleep(0.2)
    assert rob_service.cancel_batch_rob_run(pid)["status"] == "cancelled"
    done = _wait_done(pid)
    assert done["status"] == "cancelled"
    assert done["completed_studies"] < 4
    assert len(rob_service.list_assessments_for_project(pid)) == done["completed_studies"]


def test_progress_survives_restart_via_rob_runs_table(mock_ai):
    pid, _ = _project(2)
    started = rob_service.start_batch_rob_run(pid)
    _wait_done(pid)
    rob_service.ROB_BATCH_RUNS.clear()  # simulate a restart
    p = rob_service.get_batch_rob_progress(pid)
    assert p["run_id"] == started["run_id"] and p["status"] == "completed" and p["total_studies"] == 2


def test_start_while_running_returns_the_same_run(mock_ai, monkeypatch):
    pid, _ = _project(3)
    real = rob_service.assess_study_for_batch
    monkeypatch.setattr(rob_service, "assess_study_for_batch",
                        lambda *a, **kw: (time.sleep(0.2), real(*a, **kw))[1])
    first = rob_service.start_batch_rob_run(pid)
    second = rob_service.start_batch_rob_run(pid)
    assert second["run_id"] == first["run_id"]
    _wait_done(pid)


def test_http_endpoints(mock_ai):
    app = FastAPI()
    app.include_router(rob_run.router)
    client = TestClient(app)
    pid, _ = _project(2)

    assert client.post("/api/projects/missing/rob/run").status_code == 404
    r = client.post(f"/api/projects/{pid}/rob/run")
    assert r.status_code == 200 and r.json()["total_studies"] == 2
    _wait_done(pid)
    body = client.get(f"/api/projects/{pid}/rob/run/progress").json()
    assert body["status"] == "completed" and body["completed_studies"] == 2
    assert client.post(f"/api/projects/{pid}/rob/run/cancel").status_code == 200


def test_auto_trigger_after_screening_is_opt_in(mock_ai):
    conn = get_connection()
    try:
        pid, _ = _project(2)
        # default: off, nothing starts
        ai_screening._maybe_start_batch_rob(db_mod.get_db_backend(), pid)
        assert rob_service.get_batch_rob_progress(pid)["status"] == "idle"
        # opt in
        conn.execute("UPDATE projects SET auto_rob_enabled = 1 WHERE project_id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()
    ai_screening._maybe_start_batch_rob(db_mod.get_db_backend(), pid)
    assert _wait_done(pid)["completed_studies"] == 2
