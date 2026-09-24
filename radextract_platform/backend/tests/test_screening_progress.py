"""Tests for live AI-screening progress tracking."""
from services import screening_progress as sp


def test_lifecycle():
    sp.start("p1", "abstract", ["a", "b", "c"])
    snap = sp.get("p1")
    assert snap["active"] and snap["total"] == 3 and snap["done"] == 0 and snap["pending_ids"] == ["a", "b", "c"]

    sp.set_current("p1", "a", "Title A")
    assert sp.get("p1")["current_study_id"] == "a"

    sp.mark_done("p1", "a")
    snap = sp.get("p1")
    assert snap["done"] == 1 and snap["done_ids"] == ["a"] and snap["pending_ids"] == ["b", "c"]
    assert snap["current_study_id"] is None

    sp.finish("p1")
    assert sp.get("p1")["active"] is False


def test_unknown_project_is_inactive():
    assert sp.get("nope")["active"] is False


def test_stale_run_is_not_active(monkeypatch):
    sp.start("p2", "title", ["a"])
    monkeypatch.setattr(sp, "_STALE_AFTER_S", -1)
    assert sp.get("p2")["active"] is False


def test_pipeline_reports_progress(monkeypatch):
    """The pipeline marks every study current then done, in order."""
    from services import ai_screening_pipeline as pl

    seen = []
    monkeypatch.setattr(pl.progress, "set_current", lambda pid, sid, t="": seen.append(("cur", sid)))
    monkeypatch.setattr(pl.progress, "mark_done", lambda pid, sid: seen.append(("done", sid)))
    monkeypatch.setattr(pl.progress, "start", lambda pid, stage, ids: seen.append(("start", stage, tuple(ids))))
    monkeypatch.setattr(
        pl, "screen_title_only_with_llm",
        lambda **k: {"decision": "uncertain", "confidence": 0.1, "reason_text": "x", "reason_code": ""},
    )

    class Rows:
        def __init__(self, rows):
            self.rows = rows

        def fetchall(self):
            return self.rows

        def fetchone(self):
            return self.rows[0] if self.rows else None

    class Conn:
        def execute(self, sql, params=()):
            if "FROM projects" in sql:
                return Rows([{"pico_json": "{}", "exclusion_reasons_json": ""}])
            if "FROM studies" in sql:
                return Rows([{"study_id": "s1", "title": "T1"}, {"study_id": "s2", "title": "T2"}])
            return Rows([])

        def commit(self):
            pass

    pl.AIScreeningPipeline().run_title_screening("proj", Conn(), client=object())
    assert seen[0] == ("start", "title", ("s1", "s2"))
    assert [e for e in seen if e[0] == "done"] == [("done", "s1"), ("done", "s2")]
    assert seen.index(("cur", "s1")) < seen.index(("done", "s1")) < seen.index(("cur", "s2"))
