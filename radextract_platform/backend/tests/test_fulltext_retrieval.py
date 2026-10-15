"""Tests for open-access full-text retrieval (Europe PMC calls are mocked)."""
import time

import pytest

from config import settings
from database import get_connection, init_db, reset_db
from services import fulltext_availability as fa
from services import fulltext_retrieval as fr
from services.ai_screening_pipeline import AIScreeningPipeline
from services.db_backend import SQLiteBackend

LONG_PARA = "Deep learning was applied to chest radiographs of patients with pneumonia. " * 30

JATS = f"""<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front>
    <article-meta>
      <title-group><article-title>A CNN for pneumonia detection</article-title></title-group>
      <abstract><p>We built a classifier for pneumonia.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec><title>Methods</title><p>{LONG_PARA}</p></sec>
    <sec><title>Results</title><p>Sensitivity was 0.95 and specificity 0.91.</p>
      <table-wrap><label>Table 1</label><caption><p>Performance</p></caption>
        <table><tr><th>Metric</th><th>Value</th></tr><tr><td>AUC</td><td>0.97</td></tr></table>
      </table-wrap>
    </sec>
  </body>
  <back><ref-list><ref><mixed-citation>SHOULD NOT APPEAR IN TEXT</mixed-citation></ref></ref-list></back>
</article>"""


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "t.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "up"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "ex"))
    reset_db()
    init_db()
    conn = get_connection()
    conn.execute("INSERT INTO projects (project_id, name, pico_json) VALUES ('P1', 'Proj', '{}')")
    for sid, status in (("s1", "awaiting_pdf"), ("s2", "awaiting_pdf"), ("s3", "awaiting_pdf")):
        conn.execute(
            "INSERT INTO studies (study_id, project_id, title, pmid, screening_status) VALUES (?, 'P1', ?, ?, ?)",
            (sid, f"T-{sid}", sid, status),
        )
    conn.commit()
    return SQLiteBackend(conn)


def test_parse_jats_extracts_text_and_skips_references():
    out = fr.parse_jats(JATS)
    text = out["full_text"]
    assert out["title"] == "A CNN for pneumonia detection"
    assert "## Methods" in text and "Sensitivity was 0.95" in text
    assert "Table 1 Performance" in text and "AUC | 0.97" in text
    assert "SHOULD NOT APPEAR" not in text


def _study(sid="s1"):
    return {"study_id": sid, "title": f"T-{sid}", "pmid": sid, "doi": "", "pdf_path": ""}


def test_fetch_one_stores_text_and_marks_text_only(db, monkeypatch):
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: {"pmcid": "PMC1", "isOpenAccess": "Y", "inEPMC": "Y"})
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: JATS)
    res = fr.fetch_one(db, _study())
    assert res["outcome"] == "fetched" and res["pmcid"] == "PMC1"
    doc = db.query("pdf_documents", {"study_id": "s1"})[0]
    assert "Sensitivity was 0.95" in doc["full_text"] and doc["processor_engine"] == "europepmc_xml"
    assert db.get("studies", "s1")["pdf_status"] == "text_only"


def test_fetch_one_skips_existing_text(db, monkeypatch):
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: {"pmcid": "PMC1", "isOpenAccess": "Y", "inEPMC": "Y"})
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: JATS)
    fr.fetch_one(db, _study())
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: pytest.fail("must not refetch"))
    assert fr.fetch_one(db, _study())["outcome"] == "already_has_text"


@pytest.mark.parametrize(
    "epmc, xml, outcome",
    [
        (None, None, "not_open_access"),
        ({"pmcid": "PMC1", "isOpenAccess": "N"}, None, "not_open_access"),
        ({"pmcid": "PMC1", "isOpenAccess": "Y"}, None, "not_open_access"),  # 404 -> None
        ({"pmcid": "PMC1", "isOpenAccess": "Y"}, "<article><body><p>tiny</p></body></article>", "too_short"),
    ],
)
def test_fetch_one_outcomes(db, monkeypatch, epmc, xml, outcome):
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: epmc)
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: xml)
    res = fr.fetch_one(db, _study())
    assert res["outcome"] == outcome
    assert db.query("pdf_documents", {"study_id": "s1"}) == []


def test_fetch_one_reports_errors_without_raising(db, monkeypatch):
    def boom(pmid, doi):
        raise RuntimeError("network down")

    monkeypatch.setattr(fa, "_europepmc", boom)
    res = fr.fetch_one(db, _study())
    assert res["outcome"] == "error" and "network down" in res["note"]


def test_pipeline_screens_awaiting_pdf_studies_that_have_text(db, monkeypatch):
    """s1 has retrieved text -> screened; s2 has none -> stays awaiting_pdf and is not screened."""
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: {"pmcid": "PMC1", "isOpenAccess": "Y", "inEPMC": "Y"})
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: JATS)
    fr.fetch_one(db, _study("s1"))

    from services import ai_screening_pipeline as pl

    seen = []

    def fake_ft(**kw):
        seen.append(kw["study_text"])
        return {"decision": "include", "confidence": 0.9, "reason_text": "matches", "reason_code": ""}

    monkeypatch.setattr(pl, "screen_fulltext_with_llm", fake_ft)
    out = AIScreeningPipeline().run_fulltext_screening("P1", db, client=object())

    assert [r["study_id"] for r in out] == ["s1"]
    assert len(seen) == 1 and "Sensitivity was 0.95" in seen[0]
    assert db.get("studies", "s1")["screening_status"] == "included"
    assert db.get("studies", "s2")["screening_status"] == "awaiting_pdf"


def test_job_fetches_then_screens(db, monkeypatch):
    monkeypatch.setattr(
        fa, "_europepmc",
        lambda pmid, doi: {"pmcid": "PMC1", "isOpenAccess": "Y"} if pmid in ("s1", "s2") else None,
    )
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: JATS)
    monkeypatch.setattr(fr, "REQUEST_DELAY_S", 0)

    from services import ai_screening_pipeline as pl

    monkeypatch.setattr(
        pl, "screen_fulltext_with_llm",
        lambda **kw: {"decision": "exclude", "confidence": 0.9, "reason_text": "no", "reason_code": "x"},
    )
    studies = [_study("s1"), _study("s2"), _study("s3")]
    fr.start_job("P1", studies, screen=True)
    for _ in range(100):
        if not fr.get_job("P1")["active"]:
            break
        time.sleep(0.1)
    job = fr.get_job("P1")
    assert not job["active"] and job["phase"] == "done" and not job["error"]
    assert job["summary"]["fetched"] == 2 and job["summary"]["not_open_access"] == 1
    assert job["summary"]["screened"] == 2
    verify = get_connection()
    assert verify.execute("SELECT screening_status FROM studies WHERE study_id='s1'").fetchone()[0] == "excluded"
    assert verify.execute("SELECT screening_status FROM studies WHERE study_id='s3'").fetchone()[0] == "awaiting_pdf"


def test_unknown_project_has_no_job():
    assert fr.get_job("nope")["exists"] is False
