"""Pause / resume / cancel for AI screening (in-memory progress + HTTP endpoints)."""
from __future__ import annotations

import threading
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import ai_screening
from services import screening_progress as sp

# Only the screening router is mounted, so these tests do not depend on the whole app
# (and its heavy optional imports such as matplotlib) being importable.
app = FastAPI()
app.include_router(ai_screening.router)


@pytest.fixture(autouse=True)
def _clean_runs():
    sp._runs.clear()
    yield
    sp._runs.clear()


def test_new_run_starts_unpaused():
    sp.start("p1", "title", ["a", "b"])
    snap = sp.get("p1")
    assert snap["active"] is True and snap["paused"] is False and snap["canceled"] is False


def test_idle_snapshot_has_pause_fields():
    snap = sp.get("nobody")
    assert snap["active"] is False and snap["paused"] is False and snap["canceled"] is False


def test_pause_blocks_until_resume():
    sp.start("p1", "title", ["a"])
    sp.pause("p1")
    result = {}

    def worker():
        result["go"] = sp.check_pause_or_cancel("p1", poll_interval=0.01)

    t = threading.Thread(target=worker)
    t.start()
    time.sleep(0.15)
    assert t.is_alive(), "loop must wait while paused"
    sp.resume("p1")
    t.join(timeout=2)
    assert not t.is_alive() and result["go"] is True


def test_cancel_stops_a_paused_loop():
    sp.start("p1", "title", ["a"])
    sp.pause("p1")
    result = {}
    t = threading.Thread(target=lambda: result.update(go=sp.check_pause_or_cancel("p1", poll_interval=0.01)))
    t.start()
    time.sleep(0.1)
    sp.cancel("p1")
    t.join(timeout=2)
    assert not t.is_alive() and result["go"] is False
    snap = sp.get("p1")
    assert snap["active"] is False and snap["canceled"] is True and snap["paused"] is False


def test_pause_has_no_effect_when_nothing_is_running():
    sp.pause("ghost")
    assert sp.get("ghost")["paused"] is False
    assert sp.check_pause_or_cancel("ghost") is True


def test_new_run_clears_previous_cancel():
    sp.start("p1", "title", ["a"])
    sp.cancel("p1")
    sp.start("p1", "title", ["b"])
    assert sp.check_pause_or_cancel("p1") is True


def test_http_endpoints_exist_and_return_progress():
    client = TestClient(app)
    for action in ("pause", "resume", "cancel", "stop"):
        r = client.post(f"/api/projects/some-project/ai-screening/{action}")
        assert r.status_code == 200, (action, r.text)
        body = r.json()
        assert {"active", "paused", "canceled", "total", "done"} <= set(body)


def test_http_pause_then_resume_roundtrip():
    sp.start("p2", "abstract", ["x", "y"])
    client = TestClient(app)
    assert client.post("/api/projects/p2/ai-screening/pause").json()["paused"] is True
    assert client.get("/api/projects/p2/ai-screening/progress").json()["paused"] is True
    assert client.post("/api/projects/p2/ai-screening/resume").json()["paused"] is False
    assert client.post("/api/projects/p2/ai-screening/cancel").json()["canceled"] is True
