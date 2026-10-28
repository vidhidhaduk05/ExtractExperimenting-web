"""Zoplicate-style deduplication acceptance tests (zoplicate_integration_plan §5).

Covers:
  1. Normalization utils (cleanDOI / normalizeString ports)
  2. Cascade T0-T2 + non_duplicates exclusion + conflicting-DOI routing
  3. Master-item additive merge; human-decided records never auto-marked (F7)
  4. Candidate accept/reject/keep-both/set-master endpoints; sticky rejections
  5. merge-all dry-run plan == executed merges; pause leaves completed groups
  6. PRISMA duplicates_removed by tier
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient as FastAPITestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from dependencies import create_access_token
from routers import screening
from services import dedup_service, duplicate_finder


TEST_USER_ID = "dedup-test-owner"


def TestClient(app):
    token = create_access_token(TEST_USER_ID, "dedup-owner", "owner")
    return FastAPITestClient(app, headers={"Authorization": f"Bearer {token}"})


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT INTO users (user_id, username, password_hash) VALUES (?, ?, ?)",
                 (TEST_USER_ID, "dedup-owner", "unused-test-password"))
    conn.commit()
    conn.close()
    dedup_service._merge_runs.clear()
    yield
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def client():
    from fastapi import FastAPI
    return TestClient(FastAPI(include_router=screening.router))


def _make_app():
    from fastapi import FastAPI
    from routers import meta
    app = FastAPI()
    app.include_router(screening.router)
    app.include_router(meta.router)
    return app


def _add_study(conn, pid, title, doi="", pmid="", abstract="", year=2020,
               journal="", authors="", status="pending"):
    sid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, doi, pmid, abstract, "
        "publication_year, journal, authors, screening_status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (sid, pid, title, doi, pmid, abstract, year, journal, authors, status),
    )
    return sid


def _make_project(*studies_rows):
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "P"))
        conn.execute("INSERT INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)",
                     (str(uuid.uuid4()), pid, TEST_USER_ID, "owner"))
        sids = [_add_study(conn, pid, *row) if isinstance(row, tuple) else _add_study(conn, pid, **row)
                for row in studies_rows]
        conn.commit()
    finally:
        conn.close()
    return pid, sids


def _study(sid):
    conn = get_connection()
    try:
        return dict(conn.execute("SELECT * FROM studies WHERE study_id = ?", (sid,)).fetchone())
    finally:
        conn.close()


# ── Step 1: normalization utils ──

def test_clean_doi_strips_prefixes_and_folds_case():
    assert duplicate_finder.clean_doi("https://doi.org/10.1234/ABC") == "10.1234/abc"
    assert duplicate_finder.clean_doi("doi: 10.1234/X.Y;") == "10.1234/x.y"
    assert duplicate_finder.clean_doi("info:doi/10.1234/zz") == "10.1234/zz"
    assert duplicate_finder.clean_doi("10.1234/x") == "10.1234/x"
    assert duplicate_finder.clean_doi("10.1/x") == ""  # registrant < 4 digits: not a DOI
    assert duplicate_finder.clean_doi("not-a-doi") == ""


def test_normalize_string_folds_diacritics_and_punctuation():
    assert duplicate_finder.normalize_string("Diagnóstic—accüracy!") == "DIAGNOSTIC ACCURACY"
    assert duplicate_finder.normalize_title("MRI vs. CT: a comparison") == \
        duplicate_finder.normalize_title("MRI vs CT   a comparison")


def test_normalize_id_strips_pmid_prefixes():
    assert duplicate_finder.normalize_id("PMID:12345") == "12345"
    assert duplicate_finder.normalize_id("PMC12345") == "12345"
    assert duplicate_finder.normalize_id(" 12345 ") == "12345"


# ── Step 2: cascade ──

def test_protocol_vs_results_not_auto_merged():
    """Near-title distinct papers (protocol vs results) are NOT merged (H9)."""
    pid, (a, b) = _make_project(
        {"title": "Effect of drug X on survival", "authors": "Smith J", "year": 2023},
        {"title": "Effect of drug X on survival: study protocol", "authors": "Smith J", "year": 2023},
    )
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert result["duplicates_marked"] == 0
    assert _study(a)["is_duplicate"] == 0 and _study(b)["is_duplicate"] == 0
    # but they ARE proposed for review
    assert result["review_queue_size"] >= 1


def test_pmid_prefix_variants_merge():
    """'PMID:123' ≡ '123' (T0)."""
    pid, (a, b) = _make_project(
        {"title": "Study One", "pmid": "PMID:12345"},
        {"title": "Study Two", "pmid": "12345"},
    )
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert result["duplicates_marked"] == 1
    tiers = [d["tier"] for g in result["duplicate_groups"] for d in g["duplicates"]]
    assert "T0" in tiers


def test_conflicting_dois_route_to_review():
    """Same title, different valid DOIs -> review queue, never merge."""
    pid, (a, b) = _make_project(
        {"title": "Trial of drug X in hypertension", "authors": "Smith J", "year": 2023, "doi": "10.1111/aaa"},
        {"title": "Trial of drug X in hypertension", "authors": "Smith J", "year": 2023, "doi": "10.2222/bbb"},
    )
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert result["duplicates_marked"] == 0
    assert result["review_queue_size"] >= 1
    assert _study(a)["is_duplicate"] == 0 and _study(b)["is_duplicate"] == 0


def test_fuzzy_title_without_corroboration_goes_to_review():
    """Fuzzy title alone is never enough (H9)."""
    pid, (a, b) = _make_project(
        {"title": "Effect of drug X on survival in adults", "authors": "Smith J", "year": 2019, "journal": "Lancet"},
        {"title": "Effect of drug X on survival in adults", "authors": "Jones K", "year": 2023, "journal": "BMJ"},
    )
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    # exact title but different surname -> T1 skips; T2 needs corroboration
    # (same title exact match with different author/year is not T1-eligible)
    assert result["duplicates_marked"] == 0


# ── Step 3: master-item additive merge + F7 ──

def test_human_included_record_survives_dedup_untouched():
    """A human-decided record is never auto-marked (F7)."""
    pid, (a, b) = _make_project(
        {"title": "Imaging trial results", "doi": "10.1234/x", "status": "included"},
        {"title": "Imaging trial results", "doi": "10.1234/x"},
    )
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert result["duplicates_marked"] == 0
    assert _study(a)["is_duplicate"] == 0
    assert _study(a)["screening_status"] == "included"
    assert result["review_queue_size"] >= 1


def test_merge_fills_missing_fields_master_wins_conflicts():
    """Additive merge: master wins conflicts, missing fields filled (zoplicate mergeItems).

    The pair has conflicting DOIs, so the cascade routes it to review; the
    human picks the master (set-master) and accepts — the master keeps its
    own DOI and gains the duplicate's missing fields."""
    master = {"title": "Trial A", "doi": "10.1234/m", "abstract": "", "journal": "", "year": 2021}
    dup = {"title": "Trial A", "doi": "10.1234/dup", "abstract": "Full abstract text", "journal": "Radiology", "year": 2021}
    pid, (a, b) = _make_project(master, dup)
    result = dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert result["duplicates_marked"] == 0  # conflicting DOIs -> review, never auto-merge

    r = TestClient(_make_app())
    groups = r.get(f"/api/projects/{pid}/dedup/candidates?status=pending").json()["groups"]
    gid = groups[0]["group_id"]
    # force the human's choice of master (study a)
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/set-master", json={"master_study_id": a})
    assert resp.status_code == 200
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/accept")
    assert resp.status_code == 200

    m = _study(a)
    # master keeps its own DOI (conflict: master wins)
    assert m["doi"] == "10.1234/m"
    # missing fields filled from duplicate
    assert m["abstract"] == "Full abstract text"
    assert m["journal"] == "Radiology"
    assert _study(b)["is_duplicate"] == 1


def test_merge_is_reversible_with_audit_trail():
    pid, (a, b) = _make_project(
        {"title": "Trial A", "doi": "10.1234/m", "year": 2021, "abstract": "Master text"},
        {"title": "Trial A", "doi": "10.1234/m", "year": 2021},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=True)
    assert _study(b)["is_duplicate"] == 1
    # audit rows exist
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM dedup_audit WHERE project_id = ?", (pid,)).fetchall()
        assert len(rows) >= 1
        audit = dict(rows[0])
        assert audit["action"] == "auto_merge" and audit["tier"] == "T0"
    finally:
        conn.close()
    # revert via keep_both
    dedup_service.resolve_duplicate_decision(
        pid, "keep_both", primary_study_id=a, duplicate_study_id=b)
    assert _study(b)["is_duplicate"] == 0 and _study(b)["screening_status"] == "pending"


# ── Step 4: candidate endpoints + sticky rejections ──

def test_reject_group_writes_non_duplicates_and_never_reappears():
    pid, (a, b) = _make_project(
        {"title": "Distinct paper one", "authors": "Smith J", "year": 2021},
        {"title": "Distinct paper one", "authors": "Smith J", "year": 2021},
    )
    # generate pending candidates (auto_mark=False)
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    groups = r.get(f"/api/projects/{pid}/dedup/candidates?status=pending").json()["groups"]
    assert len(groups) >= 1
    gid = groups[0]["group_id"]

    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/reject")
    assert resp.status_code == 200

    # non_duplicates memory written
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM non_duplicates WHERE project_id = ?", (pid,)).fetchall()
        assert len(rows) >= 1
    finally:
        conn.close()

    # re-scan: the rejected pair never reappears as pending
    result = dedup_service.deduplicate_studies(pid, auto_mark=False)
    assert result["total_duplicates"] == 0
    pending = r.get(f"/api/projects/{pid}/dedup/candidates?status=pending").json()["groups"]
    assert len(pending) == 0


def _make_app():
    from fastapi import FastAPI
    from routers import meta
    app = FastAPI()
    app.include_router(screening.router)
    app.include_router(meta.router)
    return app


def test_accept_endpoint_merges_and_reports_master():
    pid, (a, b) = _make_project(
        {"title": "Paper P", "doi": "10.5432/p", "abstract": "", "year": 2022},
        {"title": "Paper P", "doi": "10.5432/p", "abstract": "Rich abstract", "year": 2022},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    groups = r.get(f"/api/projects/{pid}/dedup/candidates?status=pending").json()["groups"]
    gid = groups[0]["group_id"]
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/accept")
    assert resp.status_code == 200
    data = resp.json()
    assert data["merged_count"] == 1
    # one record marked, one clean
    flagged = [s for s in (a, b) if _study(s)["is_duplicate"] == 1]
    assert len(flagged) == 1


def test_set_master_endpoint_changes_master():
    pid, (a, b) = _make_project(
        {"title": "Paper Q", "doi": "10.6543/q", "year": 2022},
        {"title": "Paper Q", "doi": "10.6543/q", "year": 2022},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    groups = r.get(f"/api/projects/{pid}/dedup/candidates?status=pending").json()["groups"]
    gid = groups[0]["group_id"]
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/set-master", json={"master_study_id": b})
    assert resp.status_code == 200
    assert resp.json()["master_study_id"] == b
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/accept")
    assert resp.status_code == 200
    assert _study(b)["is_duplicate"] == 0 and _study(a)["is_duplicate"] == 1


# ── Step 5: merge-all ──

def test_merge_all_dry_run_matches_executed_merges():
    rows = [
        {"title": "Study A", "doi": "10.7654/a", "year": 2020},
        {"title": "Study A", "doi": "10.7654/a", "year": 2020},
        {"title": "Study B", "doi": "10.7654/b", "year": 2021},
        {"title": "Study B", "doi": "10.7654/b", "year": 2021},
        {"title": "Study C", "doi": "10.7654/c", "year": 2022},
    ]
    pid, sids = _make_project(*rows)
    dedup_service.deduplicate_studies(pid, auto_mark=False)

    r = TestClient(_make_app())
    dry = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True}).json()
    assert dry["dry_run"] is True
    assert dry["total_groups"] == 2
    assert dry["skipped_human_decided"] == 0
    assert "plan_id" in dry
    plan_id = dry["plan_id"]
    plan_masters = {g["master_study_id"] for g in dry["plan"]}
    assert len(plan_masters) == 2

    # execute: requires plan_id, plan matches exactly
    exec_res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False, "plan_id": plan_id}).json()
    assert exec_res["merged"] == 2 and exec_res["failed"] == 0
    exec_masters = {g["master_study_id"] for g in exec_res["plan"]}
    assert exec_masters == plan_masters
    # exactly 2 records flagged
    flagged = [s for s in sids if _study(s)["is_duplicate"] == 1]
    assert len(flagged) == 2


def test_merge_all_skips_human_decided_records():
    pid, (a, b, c) = _make_project(
        {"title": "Study H", "doi": "10.8765/h", "year": 2020, "status": "excluded"},
        {"title": "Study H", "doi": "10.8765/h", "year": 2020},
        {"title": "Study I", "doi": "10.8765/i", "year": 2021},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    dry = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True}).json()
    res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False, "plan_id": dry["plan_id"]}).json()
    assert res["skipped_human_decided"] >= 1
    # the human-decided record was never touched
    assert _study(a)["is_duplicate"] == 0 and _study(a)["screening_status"] == "excluded"


def test_merge_all_pause_leaves_completed_groups_merged():
    # 3 independent duplicate pairs with mutually dissimilar titles
    titles = ["PET for lung cancer lesions", "MRI for brain tumors in children", "CT for acute appendicitis"]
    rows = []
    for i, t in enumerate(titles):
        rows.append({"title": t, "doi": f"10.9876/{i}a", "year": 2020, "authors": "Smith J"})
        rows.append({"title": t, "doi": f"10.9876/{i}a", "year": 2020, "authors": "Smith J"})
    pid, sids = _make_project(*rows)
    dedup_service.deduplicate_studies(pid, auto_mark=False)

    from services import dedup_service as ds
    orig_accept = ds.accept_group
    calls = {"n": 0}

    def pausing_accept(*args, **kwargs):
        result = orig_accept(*args, **kwargs)
        calls["n"] += 1
        if calls["n"] >= 1:
            # request pause after the first completed group
            for run in ds._merge_runs.values():
                if run["status"] == "running":
                    run["pause_requested"] = True
        return result

    ds.accept_group = pausing_accept
    try:
        dry = ds.merge_all(pid, dry_run=True)
        res = ds.merge_all(pid, dry_run=False, plan_id=dry["plan_id"])
    finally:
        ds.accept_group = orig_accept

    assert res["status"] == "paused"
    assert res["merged"] == 1
    # completed group is merged; the rest remain pending
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM dedup_groups WHERE project_id = ? AND status = 'pending'",
            (pid,)).fetchone()
        pending = (row["c"] if isinstance(row, dict) else row[0])
    finally:
        conn.close()
    assert pending == 2


def test_merge_all_execute_without_plan_id_raises_400():
    pid, (a, b) = _make_project(
        {"title": "Study Test 400", "doi": "10.4001/a", "year": 2020},
        {"title": "Study Test 400", "doi": "10.4001/a", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False})
    assert res.status_code == 400
    assert "plan_id is required" in res.json()["detail"]


def test_merge_all_stale_plan_raises_409():
    pid, (a, b) = _make_project(
        {"title": "Study Test Stale", "doi": "10.4091/a", "year": 2020},
        {"title": "Study Test Stale", "doi": "10.4091/a", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    dry = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True}).json()
    plan_id = dry["plan_id"]

    # Invalidate plan by marking a study as human decided
    conn = get_connection()
    try:
        conn.execute("UPDATE studies SET screening_status = 'excluded' WHERE study_id = ?", (a,))
        conn.commit()
    finally:
        conn.close()

    res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False, "plan_id": plan_id})
    assert res.status_code == 409
    assert "stale" in res.json()["detail"].lower()


def test_merge_all_active_run_conflict_raises_409():
    pid, (a, b) = _make_project(
        {"title": "Study Test Active Run", "doi": "10.4092/a", "year": 2020},
        {"title": "Study Test Active Run", "doi": "10.4092/a", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    dry = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True}).json()
    plan_id = dry["plan_id"]

    # Insert an active running job in dedup_merge_runs
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO dedup_merge_runs (run_id, project_id, status, created_at, updated_at)
               VALUES ('active_run_1', ?, 'running', datetime('now'), datetime('now'))""",
            (pid,),
        )
        conn.commit()
    finally:
        conn.close()

    res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False, "plan_id": plan_id})
    assert res.status_code == 409
    assert "active merge-all run" in res.json()["detail"].lower()


def test_merge_all_pause_and_resume_durability():
    titles = ["CT for Stroke diagnosis", "MRI for knee cartilage", "Ultrasound for thyroid nodule"]
    rows = []
    for i, t in enumerate(titles):
        rows.append({"title": t, "doi": f"10.5555/{i}x", "year": 2020, "authors": "Lee K"})
        rows.append({"title": t, "doi": f"10.5555/{i}x", "year": 2020, "authors": "Lee K"})
    pid, sids = _make_project(*rows)
    dedup_service.deduplicate_studies(pid, auto_mark=False)

    from services import dedup_service as ds
    orig_accept = ds.accept_group
    calls = {"n": 0}

    def pausing_accept(*args, **kwargs):
        result = orig_accept(*args, **kwargs)
        calls["n"] += 1
        if calls["n"] >= 1:
            for run in ds._merge_runs.values():
                if run["status"] == "running":
                    run["pause_requested"] = True
        return result

    ds.accept_group = pausing_accept
    r = TestClient(_make_app())
    dry = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True}).json()
    try:
        paused_res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False, "plan_id": dry["plan_id"]}).json()
    finally:
        ds.accept_group = orig_accept

    assert paused_res["status"] == "paused"
    run_id = paused_res["run_id"]

    # Verify status from status endpoint
    st_res = r.get(f"/api/projects/{pid}/dedup/merge-all/status?run_id={run_id}").json()
    assert st_res["status"] == "paused"
    assert st_res["merged"] == 1

    # Resume the paused run
    resume_res = r.post(f"/api/projects/{pid}/dedup/merge-all/resume", json={"run_id": run_id}).json()
    assert resume_res["status"] == "completed"
    assert resume_res["merged"] == 3


# ── Step 7: PRISMA by-tier & Undo reconciliation ──


def test_merge_all_executes_the_previewed_master_strategy():
    pid, (older, newer) = _make_project(
        {"title": "Stable duplicate", "doi": "10.5555/master", "pmid": "123", "year": 2020},
        {"title": "Stable duplicate", "doi": "10.5555/master", "year": 2022},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True, master_strategy="newest")
    assert preview["plan"][0]["master_study_id"] == newer
    result = dedup_service.merge_all(pid, plan_id=preview["plan_id"], master_strategy="newest")
    assert result["merged"] == 1 and result["failed"] == 0
    assert _study(older)["duplicate_of_study_id"] == newer
    assert _study(newer)["is_duplicate"] == 0


def test_merge_all_leaves_conflicting_identifiers_for_individual_review():
    pid, (a, b) = _make_project(
        {"title": "Identical title", "doi": "10.5555/a", "authors": "Smith J", "year": 2020},
        {"title": "Identical title", "doi": "10.5555/b", "authors": "Smith J", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True)
    assert preview["total_groups"] == 0
    assert _study(a)["is_duplicate"] == _study(b)["is_duplicate"] == 0


def test_merge_all_rejects_metadata_changes_after_preview():
    pid, (a, b) = _make_project(
        {"title": "Original title", "doi": "10.5555/stale", "year": 2020},
        {"title": "Original title", "doi": "10.5555/stale", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True)
    conn = get_connection()
    conn.execute("UPDATE studies SET title = 'Edited by reviewer' WHERE study_id = ?", (a,))
    conn.commit()
    conn.close()
    with pytest.raises(dedup_service.StalePlanError):
        dedup_service.merge_all(pid, plan_id=preview["plan_id"])


def test_rescan_does_not_merge_the_same_duplicate_twice():
    pid, (a, b) = _make_project(
        {"title": "Repeat scan", "doi": "10.5555/repeat"},
        {"title": "Repeat scan", "doi": "10.5555/repeat"},
    )
    assert dedup_service.deduplicate_studies(pid, auto_mark=True)["duplicates_marked"] == 1
    assert dedup_service.deduplicate_studies(pid, auto_mark=True)["duplicates_marked"] == 0
    conn = get_connection()
    count = conn.execute("SELECT COUNT(*) FROM dedup_audit WHERE project_id = ? AND action = 'auto_merge'", (pid,)).fetchone()[0]
    conn.close()
    assert count == 1


def test_failed_bulk_group_rolls_back_metadata_flags_and_audit(monkeypatch):
    pid, (a, b) = _make_project(
        {"title": "Atomic group", "doi": "10.5555/atomic", "pmid": "123"},
        {"title": "Atomic group", "doi": "10.5555/atomic", "abstract": "Source abstract"},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True)
    original = dedup_service._execute_merge

    def fail_after_writes(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("simulated interrupted group")

    monkeypatch.setattr(dedup_service, "_execute_merge", fail_after_writes)
    result = dedup_service.merge_all(pid, plan_id=preview["plan_id"])
    assert result["failed"] == 1 and result["merged"] == 0
    assert _study(a)["abstract"] == ""
    assert _study(b)["is_duplicate"] == 0
    conn = get_connection()
    assert conn.execute("SELECT COUNT(*) FROM dedup_audit WHERE project_id = ? AND action = 'accept_merge'", (pid,)).fetchone()[0] == 0
    conn.close()
    monkeypatch.setattr(dedup_service, "_execute_merge", original)
    resumed = dedup_service.resume_merge_all(pid, result["run_id"])
    assert resumed["status"] == "completed"
    assert resumed["merged"] == 1 and resumed["failed"] == 0


def test_non_default_master_strategy_survives_pause_and_restart(monkeypatch):
    pid, ids = _make_project(
        {"title": "First independent pair", "doi": "10.5555/first", "year": 2019, "pmid": "123"},
        {"title": "First independent pair", "doi": "10.5555/first", "year": 2022},
        {"title": "Second independent pair", "doi": "10.5555/second", "year": 2018, "pmid": "456"},
        {"title": "Second independent pair", "doi": "10.5555/second", "year": 2023},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True, master_strategy="newest")
    original = dedup_service.accept_group

    def pause_after_group(*args, **kwargs):
        result = original(*args, **kwargs)
        for run in dedup_service._merge_runs.values():
            run["pause_requested"] = True
        return result

    monkeypatch.setattr(dedup_service, "accept_group", pause_after_group)
    paused = dedup_service.merge_all(pid, plan_id=preview["plan_id"], master_strategy="newest")
    assert paused["status"] == "paused"
    monkeypatch.setattr(dedup_service, "accept_group", original)
    dedup_service._merge_runs.clear()
    result = dedup_service.resume_merge_all(pid, paused["run_id"])
    assert result["status"] == "completed" and result["merged"] == 2
    assert _study(ids[0])["duplicate_of_study_id"] == ids[1]
    assert _study(ids[2])["duplicate_of_study_id"] == ids[3]


def test_identifier_confirmed_protocol_duplicates_merge_in_bulk():
    pid, (a, b) = _make_project(
        {"title": "Protocol for imaging trial", "doi": "10.5555/protocol"},
        {"title": "Protocol for imaging trial.", "doi": "10.5555/protocol"},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    preview = dedup_service.merge_all(pid, dry_run=True)
    assert preview["total_groups"] == 1
    result = dedup_service.merge_all(pid, plan_id=preview["plan_id"])
    assert result["merged"] == 1 and result["failed"] == 0


def test_dedup_api_still_requires_authentication_and_project_membership():
    pid, _ = _make_project({"title": "Private study"})
    client = FastAPITestClient(_make_app())
    assert client.get(f"/api/projects/{pid}/dedup/candidates").status_code == 401
    conn = get_connection()
    conn.execute("INSERT INTO users (user_id, username, password_hash) VALUES ('outsider', 'outsider', 'unused')")
    conn.commit()
    conn.close()
    token = create_access_token("outsider", "outsider", "owner")
    response = client.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": True},
                           headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

def test_prisma_duplicates_removed_by_tier():
    from services.prisma_service import get_prisma_2020_data
    pid, (a, b) = _make_project(
        {"title": "PRISMA study", "doi": "10.1123/p", "year": 2020},
        {"title": "PRISMA study", "doi": "10.1123/p", "year": 2020},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=True)
    conn = get_connection()
    try:
        data = get_prisma_2020_data(pid, conn)
    finally:
        conn.close()
    by_tier = data["identification"]["duplicates_removed_by_tier"]
    assert by_tier.get("T0") == 1
    assert data["identification"]["duplicates_removed"] == 1


def test_prisma_counts_after_undo_stay_correct():
    from services.prisma_service import get_prisma_2020_data
    pid, (a, b) = _make_project(
        {"title": "PRISMA study reversible", "doi": "10.1124/rev", "year": 2020},
        {"title": "PRISMA study reversible", "doi": "10.1124/rev", "year": 2020},
    )
    res = dedup_service.deduplicate_studies(pid, auto_mark=True)
    gid = res["duplicate_groups"][0]["group_id"]
    conn = get_connection()
    try:
        data_before = get_prisma_2020_data(pid, conn)
        assert data_before["identification"]["duplicates_removed"] == 1
        assert data_before["identification"]["duplicates_removed_by_tier"].get("T0") == 1

        # Now undo via keep_both
        dedup_service.keep_both_group(pid, gid)
        data_after = get_prisma_2020_data(pid, conn)
        # Reconciles back to 0!
        assert data_after["identification"]["duplicates_removed"] == 0
        assert data_after["identification"]["duplicates_removed_by_tier"].get("T0", 0) == 0
    finally:
        conn.close()


def test_meta_analysis_pooling_guard_blocks_duplicate_family():
    pid, (a, b, c) = _make_project(
        {"title": "Trial Alpha", "doi": "10.9999/alpha", "year": 2020},
        {"title": "Trial Alpha", "doi": "10.9999/alpha", "year": 2020},
        {"title": "Trial Beta", "doi": "10.9999/beta", "year": 2021},
    )
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())

    # Attempt to pool studies a and b (which belong to the same dedup group)
    payload = {
        "outcome_label": "Sensitivity",
        "analysis_type": "generic",
        "effect_measure": "md",
        "study_data": [
            {"study_id": a, "effect": 1.2, "se": 0.2, "included": True},
            {"study_id": b, "effect": 1.3, "se": 0.2, "included": True},
            {"study_id": c, "effect": 0.9, "se": 0.1, "included": True},
        ],
    }
    resp = r.post(f"/api/projects/{pid}/meta-analyses", json=payload)
    assert resp.status_code == 409
    assert "Cannot pool duplicate studies in meta-analysis" in resp.json()["detail"]


def test_keep_both_conflict_raises_409():
    pid, (a, b) = _make_project(
        {"title": "Master Record", "doi": "10.8888/orig", "pmid": "88888", "abstract": "", "year": 2020},
        {"title": "Duplicate Record", "doi": "10.8888/orig", "abstract": "Dup abstract", "year": 2020},
    )
    res = dedup_service.deduplicate_studies(pid, auto_mark=True)
    gid = res["duplicate_groups"][0]["group_id"]

    # Verify abstract was filled into master 'a'
    assert _study(a)["abstract"] == "Dup abstract"

    # User manually edits master's filled abstract to something else
    conn = get_connection()
    try:
        conn.execute("UPDATE studies SET abstract = 'Modified abstract' WHERE study_id = ?", (a,))
        conn.commit()
    finally:
        conn.close()

    r = TestClient(_make_app())
    resp = r.post(f"/api/projects/{pid}/dedup/{gid}/keep-both")
    assert resp.status_code == 409
    assert "edited after the merge" in resp.json()["detail"].lower()
