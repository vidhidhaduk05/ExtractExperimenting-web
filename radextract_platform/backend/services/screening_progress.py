"""In-memory live progress for AI screening runs (which study is being screened, which are done).

State is kept per process, not in the database, so it needs no schema change. It is only meant to
drive the progress UI: if the process restarts, or a request lands on a different worker/container,
the endpoint simply reports ``active: false`` and the UI falls back to the persisted per-study results.
All functions swallow their own errors so progress reporting can never break screening.
"""
from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_runs: dict[str, dict[str, Any]] = {}
_STALE_AFTER_S = 15 * 60  # a run that stops reporting (crashed worker) is no longer shown as active


def start(project_id: str, stage: str, study_ids: list[str]) -> None:
    try:
        now = time.time()
        with _lock:
            _runs[project_id] = {
                "active": True, "paused": False, "canceled": False, "stage": stage,
                "total": len(study_ids), "done": 0,
                "current_study_id": None, "current_title": "",
                "pending_ids": list(study_ids), "done_ids": [],
                "started_at": now, "updated_at": now,
            }
    except Exception:
        pass


def pause(project_id: str) -> None:
    """Pause the active screening run for a project."""
    try:
        with _lock:
            r = _runs.get(project_id)
            if r and r.get("active"):
                r["paused"] = True
                r["updated_at"] = time.time()
    except Exception:
        pass


def resume(project_id: str) -> None:
    """Resume a paused screening run for a project."""
    try:
        with _lock:
            r = _runs.get(project_id)
            if r and r.get("active"):
                r["paused"] = False
                r["updated_at"] = time.time()
    except Exception:
        pass


def cancel(project_id: str) -> None:
    """Cancel / stop the active screening run for a project."""
    try:
        with _lock:
            r = _runs.get(project_id)
            if r:
                r["canceled"] = True
                r["active"] = False
                r["paused"] = False
                r["current_study_id"] = None
                r["current_title"] = ""
                r["updated_at"] = time.time()
    except Exception:
        pass


def is_paused(project_id: str) -> bool:
    try:
        with _lock:
            r = _runs.get(project_id)
            return bool(r and r.get("paused"))
    except Exception:
        return False


def is_canceled(project_id: str) -> bool:
    try:
        with _lock:
            r = _runs.get(project_id)
            return bool(r and r.get("canceled"))
    except Exception:
        return False


def check_pause_or_cancel(project_id: str, poll_interval: float = 0.25) -> bool:
    """Check if screening should continue.

    If canceled: returns False immediately.
    While paused: blocks and waits until resumed or canceled.
    Returns True if screening should proceed with next study.
    """
    if is_canceled(project_id):
        return False

    while is_paused(project_id):
        if is_canceled(project_id):
            return False
        time.sleep(poll_interval)

    return not is_canceled(project_id)


def set_current(project_id: str, study_id: str, title: str = "") -> None:
    try:
        with _lock:
            r = _runs.get(project_id)
            if r:
                r["current_study_id"], r["current_title"] = study_id, (title or "")[:300]
                r["updated_at"] = time.time()
    except Exception:
        pass


def mark_done(project_id: str, study_id: str) -> None:
    try:
        with _lock:
            r = _runs.get(project_id)
            if r:
                if study_id in r["pending_ids"]:
                    r["pending_ids"].remove(study_id)
                if study_id not in r["done_ids"]:
                    r["done_ids"].append(study_id)
                r["done"] = len(r["done_ids"])
                r["current_study_id"], r["current_title"] = None, ""
                r["updated_at"] = time.time()
    except Exception:
        pass


def finish(project_id: str) -> None:
    try:
        with _lock:
            r = _runs.get(project_id)
            if r:
                r["active"], r["paused"], r["current_study_id"], r["current_title"] = False, False, None, ""
                r["updated_at"] = time.time()
    except Exception:
        pass


def get(project_id: str) -> dict[str, Any]:
    with _lock:
        r = _runs.get(project_id)
        if not r:
            return {"active": False, "paused": False, "canceled": False, "stage": "",
                    "total": 0, "done": 0, "current_study_id": None,
                    "current_title": "", "pending_ids": [], "done_ids": []}
        snap = {k: (list(v) if isinstance(v, list) else v) for k, v in r.items()}
    if snap["active"] and time.time() - snap["updated_at"] > _STALE_AFTER_S:
        snap["active"] = False
        snap["paused"] = False
    return snap

