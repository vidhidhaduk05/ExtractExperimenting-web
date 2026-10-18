"""Tests for the read-only full-text availability check (all network calls are mocked)."""
import time
import xml.etree.ElementTree as ET

import pytest

from services import fulltext_availability as fa


def _epmc(pmcid="", oa="N", in_epmc="N"):
    return {"pmcid": pmcid, "isOpenAccess": oa, "inEPMC": in_epmc}


@pytest.fixture
def net(monkeypatch):
    """Configure mocked service responses per test."""
    state = {"epmc": None, "oa_pdf": (False, ""), "unpaywall": None, "epmc_error": False, "up_error": False}

    def epmc(pmid, doi):
        if state["epmc_error"]:
            raise RuntimeError("boom")
        return state["epmc"]

    def oa(pmcid, api_key):
        return state["oa_pdf"]

    def up(doi, email):
        if state["up_error"]:
            raise RuntimeError("boom")
        return state["unpaywall"]

    monkeypatch.setattr(fa, "_europepmc", epmc)
    monkeypatch.setattr(fa, "_pmc_oa_pdf", oa)
    monkeypatch.setattr(fa, "_unpaywall", up)
    return state


def test_pmc_open_access_pdf_wins(net):
    net["epmc"] = _epmc("PMC123", "Y", "Y")
    net["oa_pdf"] = (True, "CC BY")
    net["unpaywall"] = {"is_oa": True, "best_oa_location": {"url_for_pdf": "http://x/a.pdf"}}
    r = fa.check_study("1", "10.1/x", email="a@b.org")
    assert r["status"] == "pmc_pdf" and r["retrievable"] and r["license"] == "CC BY"


def test_unpaywall_pdf_when_not_in_pmc(net):
    net["epmc"] = None
    net["unpaywall"] = {"is_oa": True, "best_oa_location": {"url_for_pdf": "http://x/a.pdf", "license": "cc-by"}}
    r = fa.check_study("1", "https://doi.org/10.1/x", email="a@b.org")
    assert r["status"] == "unpaywall_pdf" and r["pdf_url"] == "http://x/a.pdf" and r["retrievable"]


def test_unpaywall_finds_pdf_in_other_locations(net):
    net["unpaywall"] = {
        "is_oa": True,
        "best_oa_location": {"url_for_pdf": None},
        "oa_locations": [{"url_for_pdf": None}, {"url_for_pdf": "http://repo/p.pdf"}],
    }
    assert fa.check_study("", "10.1/x", email="a@b.org")["pdf_url"] == "http://repo/p.pdf"


def test_europepmc_text_only(net):
    net["epmc"] = _epmc("PMC9", "Y", "Y")
    r = fa.check_study("1", "", email="")
    assert r["status"] == "europepmc_text" and r["retrievable"]


def test_landing_page_only_is_not_retrievable(net):
    net["unpaywall"] = {"is_oa": True, "best_oa_location": {"url": "http://x/landing", "url_for_pdf": None}}
    r = fa.check_study("", "10.1/x", email="a@b.org")
    assert r["status"] == "oa_page_only" and not r["retrievable"]


def test_in_pmc_but_not_open_access(net):
    net["epmc"] = _epmc("PMC5", "N", "N")
    assert fa.check_study("1", "", email="")["status"] == "free_to_read"


def test_not_available(net):
    net["epmc"] = None
    net["unpaywall"] = {"is_oa": False}
    assert fa.check_study("1", "10.1/x", email="a@b.org")["status"] == "not_available"


def test_lookup_failures_are_reported_not_raised(net):
    net["epmc_error"] = True
    net["up_error"] = True
    r = fa.check_study("1", "10.1/x", email="a@b.org")
    assert r["status"] == "error" and len(r["notes"]) == 2


def test_no_email_skips_unpaywall_with_note(net):
    net["epmc"] = None
    r = fa.check_study("1", "10.1/x", email="")
    assert r["status"] == "not_available" and any("RADEXTRACT_CONTACT_EMAIL" in n for n in r["notes"])


def test_no_identifiers():
    r = fa.check_study("", "", email="a@b.org")
    assert r["status"] == "not_available" and r["notes"]


def test_pmc_oa_response_parsing(monkeypatch):
    with_pdf = ET.fromstring(
        '<OA><records><record id="PMC1" license="CC BY"><link format="tgz" href="x"/>'
        '<link format="pdf" href="ftp://x/a.pdf"/></record></records></OA>'
    )
    monkeypatch.setattr(fa, "_fetch_xml", lambda url, api_key="": with_pdf)
    assert fa._pmc_oa_pdf("PMC1", "") == (True, "CC BY")

    not_oa = ET.fromstring('<OA><error code="idIsNotOpenAccess">no</error></OA>')
    monkeypatch.setattr(fa, "_fetch_xml", lambda url, api_key="": not_oa)
    assert fa._pmc_oa_pdf("PMC1", "") == (False, "")


def test_job_runs_and_summarises(monkeypatch):
    def fake_check(pmid, doi, api_key="", email=""):
        ok = pmid == "1"
        return {"status": "pmc_pdf" if ok else "not_available", "retrievable": ok, "notes": [], "sources": []}

    monkeypatch.setattr(fa, "check_study", fake_check)
    studies = [{"study_id": "a", "pmid": "1", "title": "A"}, {"study_id": "b", "pmid": "2", "title": "B"}]
    fa.start_job("job-proj", studies)
    for _ in range(50):
        if not fa.get_job("job-proj")["active"]:
            break
        time.sleep(0.05)
    job = fa.get_job("job-proj")
    assert not job["active"] and job["done"] == 2
    assert job["summary"]["retrievable"] == 1 and job["summary"]["not_available"] == 1
    assert job["results"][0]["study_id"] == "a"


def test_unknown_project_has_no_job():
    assert fa.get_job("nope")["exists"] is False


def test_endpoints_start_and_read(tmp_path, monkeypatch):
    """POST starts the job for awaiting_pdf studies only; GET returns results."""
    from fastapi.testclient import TestClient

    from config import settings
    from database import get_connection, init_db, reset_db
    from main import app

    monkeypatch.setattr(settings, "db_path", str(tmp_path / "t.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "up"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "ex"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT INTO projects (project_id, name) VALUES ('P1', 'Proj')")
    for sid, status in (("s1", "awaiting_pdf"), ("s2", "excluded")):
        conn.execute(
            "INSERT INTO studies (study_id, project_id, title, pmid, screening_status) VALUES (?, 'P1', ?, ?, ?)",
            (sid, f"T-{sid}", sid, status),
        )
    conn.commit()
    conn.close()

    monkeypatch.setattr(
        fa, "check_study",
        lambda pmid, doi, api_key="", email="": {"status": "pmc_pdf", "retrievable": True, "notes": [], "sources": []},
    )
    client = TestClient(app)
    assert client.post("/api/projects/P1/fulltext/availability").status_code == 200
    for _ in range(50):
        job = client.get("/api/projects/P1/fulltext/availability").json()
        if not job["active"]:
            break
        time.sleep(0.05)
    assert job["done"] == 1 and job["results"][0]["study_id"] == "s1"
    assert client.post("/api/projects/nope/fulltext/availability").status_code == 404
