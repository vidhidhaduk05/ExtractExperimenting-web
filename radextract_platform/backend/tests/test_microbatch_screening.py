"""Tests for the Laya-first micro-batch title screening worker."""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.ai_screening_pipeline import AIScreeningPipeline
from config import settings
from database import get_connection, init_db, reset_db


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_microbatch.db"))
    reset_db()
    init_db()
    yield
    from services import screening_progress
    screening_progress._active.clear() if hasattr(screening_progress, "_active") else None


def _project_with_studies(n=5):
    conn = get_connection()
    pid = f"proj_mb_{uuid.uuid4().hex[:8]}"
    conn.execute("INSERT INTO projects (project_id, name, pico_json) VALUES (?, ?, ?)",
                 (pid, "MicroBatch", '{"population": "adults with CAD", "intervention": "IVI", "outcome": "MACE"}'))
    for i in range(n):
        conn.execute(
            """INSERT INTO studies (study_id, project_id, title, abstract, screening_status)
               VALUES (?, ?, ?, ?, 'pending')""",
            (f"{pid}_s{i}", pid, f"Study {i} intravenous ultrasound guidance",
             "A study of intravascular imaging guided PCI."),
        )
    conn.commit()
    conn.close()
    return pid


def _laya_stub(decision="include", confidence=0.95):
    """Patch laya_screener.screen with a deterministic stub."""
    from services import laya_screener

    calls = {"n": 0}

    def fake_screen(stage, title="", abstract="", full_text="", pico=None, exclusion_reasons=None):
        calls["n"] += 1
        if decision is None:
            return None
        return {
            "decision": decision, "confidence": confidence,
            "reason_code": "", "reason_text": "stub",
            "engine": "laya",
        }

    return laya_screener, fake_screen, calls


def test_laya_decisive_results_never_call_llm(monkeypatch):
    pid = _project_with_studies(5)
    mod, fake, calls = _laya_stub("include", 0.95)
    monkeypatch.setattr(mod, "screen", fake)

    llm_calls = {"n": 0}

    def fake_llm(**kwargs):
        llm_calls["n"] += 1
        return {"decision": "include", "confidence": 0.9, "reason_text": "llm"}

    import services.ai_screening_pipeline as pipe_mod
    monkeypatch.setattr(pipe_mod, "screen_title_only_with_llm", fake_llm)

    out = AIScreeningPipeline().run_title_screening_microbatch(pid, get_connection())
    assert llm_calls["n"] == 0
    assert out["cost_accounting"]["laya_decided"] == 5
    assert out["cost_accounting"]["llm_escalated"] == 0
    assert out["cost_accounting"]["llm_calls_avoided"] == 5


def test_uncertain_studies_escalate_to_llm(monkeypatch):
    pid = _project_with_studies(4)
    mod, fake, calls = _laya_stub("uncertain", 0.4)
    monkeypatch.setattr(mod, "screen", fake)

    llm_calls = {"n": 0}

    def fake_llm(**kwargs):
        llm_calls["n"] += 1
        return {"decision": "exclude", "confidence": 0.9, "reason_text": "llm exclude"}

    import services.ai_screening_pipeline as pipe_mod
    monkeypatch.setattr(pipe_mod, "screen_title_only_with_llm", fake_llm)

    out = AIScreeningPipeline().run_title_screening_microbatch(pid, get_connection())
    assert llm_calls["n"] == 4
    assert out["cost_accounting"]["llm_escalated"] == 4
    assert out["cost_accounting"]["laya_decided"] == 0


def test_laya_offline_falls_back_to_llm_for_all(monkeypatch):
    pid = _project_with_studies(3)
    mod, fake, calls = _laya_stub(None)  # returns None = unavailable
    monkeypatch.setattr(mod, "screen", fake)

    llm_calls = {"n": 0}

    def fake_llm(**kwargs):
        llm_calls["n"] += 1
        return {"decision": "include", "confidence": 0.85, "reason_text": "llm"}

    import services.ai_screening_pipeline as pipe_mod
    monkeypatch.setattr(pipe_mod, "screen_title_only_with_llm", fake_llm)

    out = AIScreeningPipeline().run_title_screening_microbatch(pid, get_connection())
    assert llm_calls["n"] == 3
    assert out["cost_accounting"]["laya_offline"] is True


def test_checkpointing_no_duplicate_decisions_after_interrupt(monkeypatch):
    """Per-study commits mean an interrupted run leaves no duplicates on resume."""
    pid = _project_with_studies(6)
    mod, fake, calls = _laya_stub("include", 0.95)
    monkeypatch.setattr(mod, "screen", fake)

    import services.ai_screening_pipeline as pipe_mod
    monkeypatch.setattr(pipe_mod, "screen_title_only_with_llm",
                        lambda **k: (_ for _ in ()).throw(AssertionError("LLM must not be called")))

    from services import screening_progress
    pipe = AIScreeningPipeline()

    # Simulate a pause after the 3rd study by cancelling inside progress.
    orig_mark_done = screening_progress.mark_done
    done_count = {"n": 0}

    def counting_mark_done(pid_, sid_):
        done_count["n"] += 1
        if done_count["n"] == 3:
            screening_progress.cancel(pid_)
        return orig_mark_done(pid_, sid_)

    monkeypatch.setattr(screening_progress, "mark_done", counting_mark_done)
    out = pipe.run_title_screening_microbatch(pid, get_connection())
    assert done_count["n"] == 3

    # Reset and resume: remaining 3 are screened, no study decided twice.
    screening_progress.resume(pid)
    monkeypatch.setattr(screening_progress, "mark_done", orig_mark_done)
    out2 = pipe.run_title_screening_microbatch(pid, get_connection())

    conn = get_connection()
    rows = conn.execute(
        "SELECT study_id, COUNT(*) c FROM screening_decisions WHERE project_id = ? GROUP BY study_id HAVING c > 1",
        (pid,),
    ).fetchall()
    total_decisions = conn.execute(
        "SELECT COUNT(*) c FROM screening_decisions WHERE project_id = ?", (pid,)
    ).fetchone()["c"]
    conn.close()
    assert len(rows) == 0  # no study has two AI decisions
    assert total_decisions == 6  # 3 before interrupt + 3 on resume
