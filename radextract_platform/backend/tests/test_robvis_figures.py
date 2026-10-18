"""robvis figures (per tool, with fallback) and the MTR/RC reporting profile."""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import rob
from services import reporting_profile_service as rps
from services import robvis_service, rob_service


_PID: dict = {}


def _real_matplotlib():
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        _, axes = plt.subplots(1, 2)
        plt.close("all")
        return len(axes) == 2
    except Exception:
        return False


needs_matplotlib = pytest.mark.skipif(not _real_matplotlib(), reason="matplotlib unavailable in this environment")


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    # Never shell out to R in tests: use the built-in matplotlib fallback.
    monkeypatch.setattr(robvis_service, "call_r_script", lambda *a, **k: None)
    monkeypatch.setattr(robvis_service, "call_r_script_bytes", lambda *a, **k: None)
    yield
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(rob.router)
    return TestClient(app)


def _project_with(designs):
    """A project with one included study per design, each with an auto-selected assessment."""
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        sids = []
        for i, design in enumerate(designs):
            sid = str(uuid.uuid4())
            sids.append(sid)
            conn.execute(
                "INSERT INTO studies (study_id, project_id, title, study_design, screening_status) "
                "VALUES (?, ?, ?, ?, 'included')", (sid, pid, f"Study {i}", design))
        conn.commit()
    finally:
        conn.close()
    for sid in sids:
        _PID[sid] = pid
    return pid, sids


def _assess(sid, tool_key):
    return rob_service.create_assessment(sid, _PID[sid], tool_key)


def test_summary_groups_assessments_by_tool():
    pid, (a, b) = _project_with(["randomized controlled trial", "diagnostic accuracy study"])
    _assess(a, "rob2")
    _assess(b, "quadas2")
    summary = rob_service.get_project_summary(pid)
    assert summary["tool"] == "mixed"
    assert set(summary["tool_groups"]) == {"rob2", "quadas2"}
    assert summary["tool_groups"]["rob2"]["total_assessments"] == 1
    assert all(item["tool"] for item in summary["assessments"])


def test_single_tool_summary_keeps_its_tool():
    pid, (a,) = _project_with(["randomized controlled trial"])
    _assess(a, "rob2")
    assert rob_service.get_project_summary(pid)["tool"] == "rob2"
    assert rob_service.get_project_summary("nothing")["tool_groups"] == {}


@needs_matplotlib
def test_figure_falls_back_to_matplotlib_when_r_is_missing(client):
    pid, (a,) = _project_with(["randomized controlled trial"])
    _assess(a, "rob2")
    for plot in ("traffic", "summary"):
        body = client.get(f"/api/rob/projects/{pid}/figure?plot={plot}").json()
        assert body["success"] is True and body["engine"] == "matplotlib"
        assert body["svg"].lstrip().startswith(("<?xml", "<svg")) and body["png_base64"]
        assert body["study_count"] == 1


def test_figure_for_a_project_without_assessments_is_not_invented(client):
    pid, _ = _project_with([])
    body = client.get(f"/api/rob/projects/{pid}/figure").json()
    assert body["success"] is False and body["svg"] == ""


def test_figure_rejects_unknown_plot_and_tool(client):
    pid, (a,) = _project_with(["randomized controlled trial"])
    _assess(a, "rob2")
    assert client.get(f"/api/rob/projects/{pid}/figure?plot=pie").status_code == 422
    assert client.get(f"/api/rob/projects/{pid}/figure?tool=quadas2").status_code == 404


@needs_matplotlib
def test_figures_are_separated_per_tool(client):
    pid, (a, b) = _project_with(["randomized controlled trial", "diagnostic accuracy study"])
    _assess(a, "rob2")
    _assess(b, "quadas2")
    figures = client.get(f"/api/rob/projects/{pid}/figures").json()["figures"]
    assert sorted((f["tool"], f["plot"]) for f in figures) == [
        ("quadas2", "summary"), ("quadas2", "traffic"), ("rob2", "summary"), ("rob2", "traffic")]
    assert {f["template"] for f in figures} == {"ROB2", "QUADAS-2"}


@needs_matplotlib
def test_figure_for_one_tool_of_a_mixed_project(client):
    pid, (a, b) = _project_with(["randomized controlled trial", "diagnostic accuracy study"])
    _assess(a, "rob2")
    _assess(b, "quadas2")
    body = client.get(f"/api/rob/projects/{pid}/figure?tool=quadas2").json()
    assert body["tool"] == "QUADAS-2" and body["study_count"] == 1


# ───────────────────────── reporting profile ─────────────────────────

def _backend():
    return db_mod.get_db_backend()


def test_profile_definition_has_both_sections():
    profile = rps.load_profile()
    assert [s["key"] for s in profile["sections"]] == ["mtr", "rc"]


def test_assess_profile_marks_matches_complete_and_misses_not_reported():
    study = {"title": "CVR with fMRI", "abstract": ""}
    text = ("Cerebrovascular reactivity was measured with fMRI. Repetition time was 2 s and "
            "end-tidal CO2 (EtCO2) was recorded. " + "x" * 100)
    items = {i["item_key"]: i for i in rps.assess_profile(study, {"full_text": text})}
    assert items["mtr_3"]["status"] == "complete" and "EtCO2" in items["mtr_3"]["evidence"]
    assert items["mtr_8"]["status"] == "not_reported"


def test_assess_profile_is_not_applicable_outside_the_topic():
    items = rps.assess_profile({"title": "Knee surgery outcomes", "abstract": "A trial."}, None)
    assert {i["status"] for i in items} == {"not_applicable"}


def test_model_quotes_not_in_the_article_are_dropped():
    study = {"title": "fMRI CVR", "abstract": "cerebrovascular reactivity in fMRI"}
    fake = lambda prompt: {"items": [{"item_key": "mtr_1", "status": "complete",
                                      "evidence": "invented quote", "confidence": 0.99}]}
    item = next(i for i in rps.assess_profile(study, None, model_fn=fake) if i["item_key"] == "mtr_1")
    assert item["status"] == "complete" and item["evidence"] == "" and item["confidence"] <= 0.5


@needs_matplotlib
def test_profile_roundtrip_and_endpoint(client):
    pid, (sid,) = _project_with(["cohort"])
    empty = client.get(f"/api/rob/projects/{pid}/reporting-profile").json()
    assert empty["study_count"] == 0 and empty["svg"] == "" and empty["counts"] == {}

    items = rps.assess_profile({"title": "fMRI CVR", "abstract": "cerebrovascular reactivity"}, None)
    rps.persist_profile(_backend(), pid, sid, items)
    rps.persist_profile(_backend(), pid, sid, items)  # re-assessing replaces, never duplicates

    body = client.get(f"/api/rob/projects/{pid}/reporting-profile").json()
    assert body["study_count"] == 1
    assert sum(body["counts"]["mtr_9"].values()) == 1
    assert body["svg"] and body["png_base64"]
