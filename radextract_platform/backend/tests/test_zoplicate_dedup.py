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
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import screening
from services import dedup_service, duplicate_finder


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    yield
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def client():
    from fastapi import FastAPI
    return TestClient(FastAPI(include_router=screening.router))


def _make_app():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(screening.router)
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
        {"title": "Trial A", "doi": "10.1234/m", "year": 2021},
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
    app = FastAPI()
    app.include_router(screening.router)
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
    plan_masters = {g["master_study_id"] for g in dry["plan"]}
    assert len(plan_masters) == 2

    # execute: plan matches exactly
    exec_res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False}).json()
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
    # second auto pair for study c? make one more
    dedup_service.deduplicate_studies(pid, auto_mark=False)
    r = TestClient(_make_app())
    res = r.post(f"/api/projects/{pid}/dedup/merge-all", json={"dry_run": False}).json()
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
        res = ds.merge_all(pid, dry_run=False)
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


# ── Step 7: PRISMA by-tier ──

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
