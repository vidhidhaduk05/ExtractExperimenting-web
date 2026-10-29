"""Tests for the PRISMA retrieval buckets (blueprint §3.11 contract).

TA inclusion is NOT evidence of retrieval. awaiting_pdf is its own
retrieval-pending bucket and never lands under "not retrieved".
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.prisma_service import get_prisma_2020_data
from config import settings
from database import get_connection, init_db, reset_db


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_prisma_retrieval.db"))
    reset_db()
    init_db()


def _project(pid="proj_retr"):
    conn = get_connection()
    conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Retrieval Test"))
    conn.commit()
    conn.close()
    return pid


def _study(pid, sid, status, stage="", pdf_status="none", error_message="", dup=0):
    conn = get_connection()
    conn.execute(
        """INSERT INTO studies (study_id, project_id, title, screening_status,
           screening_stage, pdf_status, error_message, is_duplicate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (sid, pid, sid, status, stage, pdf_status, error_message, dup),
    )
    conn.commit()
    conn.close()


def test_awaiting_pdf_is_retrieval_pending_not_not_retrieved():
    pid = _project()
    _study(pid, "s1", "awaiting_pdf", stage="ta")                      # pending
    _study(pid, "s2", "ta_included", pdf_status="processed")           # retrieved
    _study(pid, "s3", "ta_included", pdf_status="none",
           error_message="paywall: no OA copy found")                  # not retrieved
    _study(pid, "s4", "excluded", stage="ta", pdf_status="none")       # screened out

    d = get_prisma_2020_data(pid, get_connection())
    r = d["retrieval"]
    assert r["reports_needed"] == 3
    assert r["reports_retrieved"] == 1
    assert r["reports_not_retrieved"] == 1
    assert r["retrieval_pending"] == 1
    # the excluded study never enters the retrieval accounting
    assert d["screening"]["records_excluded"] == 1


def test_ta_inclusion_without_pdf_is_never_full_text_assessed():
    """A TA-included study with no PDF must not appear as full-text assessed."""
    pid = _project("proj_retr2")
    _study(pid, "s1", "ta_included", pdf_status="none")
    d = get_prisma_2020_data(pid, get_connection())
    assert d["eligibility"]["full_text_assessed"] == 0
    assert d["retrieval"]["retrieval_pending"] == 1


def test_text_only_counts_as_retrieved():
    """Open-access text-only records (no PDF file) were still retrieved."""
    pid = _project("proj_retr3")
    _study(pid, "s1", "ta_included", pdf_status="text_only")
    d = get_prisma_2020_data(pid, get_connection())
    assert d["retrieval"]["reports_retrieved"] == 1
    assert d["retrieval"]["retrieval_pending"] == 0


def test_duplicates_never_enter_retrieval_counts():
    pid = _project("proj_retr4")
    _study(pid, "s1", "awaiting_pdf", stage="ta", dup=1)
    d = get_prisma_2020_data(pid, get_connection())
    assert d["retrieval"]["reports_needed"] == 0
