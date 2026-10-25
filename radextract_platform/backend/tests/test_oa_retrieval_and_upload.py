"""Tests for automatic transition to data extraction, OA PDF retrieval with Docling,
and universal user upload (PDF, ZIP, RIS, EndNote XML, ENW, BibTeX).
"""
import io
import json
import zipfile
import pytest

from config import settings
from database import get_connection, init_db, reset_db
from services.db_backend import SQLiteBackend
from services import fulltext_availability as fa
from services import fulltext_retrieval as fr
from services import pdf_service
from services.storage_backend import get_storage
from fastapi.testclient import TestClient
from main import app

from dependencies import get_current_user, get_current_user_optional

MOCK_PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF\n"

LONG_BODY = "We evaluated 500 patients using convolutional neural networks for pneumonia diagnosis. Sensitivity was 94.2% and specificity was 91.8%. AUC was 0.96. " * 20

MOCK_JATS = f"""<?xml version="1.0"?>
<article>
  <front>
    <article-meta><title-group><article-title>Pneumonia AI Study</article-title></title-group></article-meta>
  </front>
  <body>
    <sec><title>Methods</title><p>{LONG_BODY}</p></sec>
    <sec><title>Results</title><p>Sensitivity was 94.2% and specificity was 91.8%. AUC was 0.96.</p></sec>
  </body>
</article>"""


@pytest.fixture
def test_setup(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()

    app.dependency_overrides[get_current_user] = lambda: {"user_id": "test_user", "username": "testuser", "email": "test@example.com", "role": "admin"}
    app.dependency_overrides[get_current_user_optional] = lambda: {"user_id": "test_user", "username": "testuser", "email": "test@example.com", "role": "admin"}

    conn = get_connection()
    conn.execute("INSERT INTO users (user_id, email, username, password_hash) VALUES ('test_user', 'test@example.com', 'testuser', 'secret')")
    conn.execute("INSERT INTO projects (project_id, name, pico_json) VALUES ('PROJ1', 'Test SR Project', '{}')")
    conn.execute("INSERT INTO project_members (project_id, user_id, role) VALUES ('PROJ1', 'test_user', 'owner')")
    
    # Study 1: Has DOI, needs PDF, in full-text screening
    conn.execute(
        """INSERT INTO studies (study_id, project_id, title, doi, pmid, screening_stage, screening_status, extraction_status)
           VALUES ('s1', 'PROJ1', 'Deep learning for pneumonia detection', '10.1016/j.rad.2023.01', '33445566', 'ft', 'pending', 'pending')"""
    )
    # Study 2: Has PMID, needs PDF, in full-text screening
    conn.execute(
        """INSERT INTO studies (study_id, project_id, title, doi, pmid, screening_stage, screening_status, extraction_status)
           VALUES ('s2', 'PROJ1', 'Chest radiograph triage in emergency', '10.1056/nejm.2022.02', '22334455', 'ft', 'pending', 'pending')"""
    )
    # Study 3: Paywalled study, in full-text screening
    conn.execute(
        """INSERT INTO studies (study_id, project_id, title, doi, pmid, screening_stage, screening_status, extraction_status)
           VALUES ('s3', 'PROJ1', 'Proprietary clinical trial of CT scanner', '10.9999/closed.2021', '99887766', 'ft', 'pending', 'pending')"""
    )
    conn.commit()

    backend = SQLiteBackend(conn)
    client = TestClient(app)
    yield {"backend": backend, "client": client, "tmp_path": tmp_path}
    app.dependency_overrides.clear()


def test_transition_included_without_pdf_sets_awaiting_pdf(test_setup, monkeypatch):
    """When a study without a PDF is included, it automatically moves to extraction with awaiting_pdf."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    # Prevent actual network calls in background
    monkeypatch.setattr(fr, "retrieve_and_process_oa_study", lambda sid, pid: None)

    resp = client.post(
        "/api/studies/s1/screening-decision",
        json={
            "study_id": "s1",
            "project_id": "PROJ1",
            "stage": "ft",
            "decision": "included",
            "reason_text": "Meets all PICO criteria",
        },
    )
    assert resp.status_code == 200

    study = backend.get("studies", "s1")
    assert study["screening_status"] == "included"
    assert study["extraction_status"] == "awaiting_pdf"


def test_transition_included_with_pdf_sets_ready_for_extraction(test_setup):
    """When a study with an existing PDF is included, it immediately sets ready_for_extraction."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    # Pre-upload mock PDF for s2
    storage = get_storage("upload")
    storage_key = "PROJ1/s2.pdf"
    storage.save_bytes(storage_key, MOCK_PDF)
    backend.execute("UPDATE studies SET pdf_path = ?, pdf_status = 'processed' WHERE study_id = 's2'", (storage_key,))
    backend.commit()

    resp = client.post(
        "/api/studies/s2/screening-decision",
        json={
            "study_id": "s2",
            "project_id": "PROJ1",
            "stage": "ft",
            "decision": "included",
            "reason_text": "Meets criteria",
        },
    )
    assert resp.status_code == 200

    study = backend.get("studies", "s2")
    assert study["screening_status"] == "included"
    assert study["extraction_status"] == "ready_for_extraction"


def test_oa_retrieval_downloads_pdf_and_converts_docling(test_setup, monkeypatch):
    """Auto-retrieval downloads OA PDF via Unpaywall/Europe PMC and runs Docling."""
    backend = test_setup["backend"]

    # Mock Unpaywall returning OA PDF URL
    monkeypatch.setattr(fa, "_unpaywall", lambda doi, email: {
        "is_oa": True,
        "best_oa_location": {"url_for_pdf": "https://example.org/oa.pdf"},
    })
    # Mock download returning mock PDF bytes
    monkeypatch.setattr(fr, "_download_pdf", lambda url, timeout=30: MOCK_PDF)

    res = fr.retrieve_and_process_oa_study("s1", "PROJ1")
    assert res["outcome"] == "fetched"
    assert res.get("pdf") is True

    study = backend.get("studies", "s1")
    assert study["pdf_status"] in ("uploaded", "processed")
    assert study["extraction_status"] == "ready_for_extraction"
    assert study["pdf_path"] == "PROJ1/s1.pdf"

    # Verify structured pdf_documents entry exists
    docs = backend.query("pdf_documents", {"study_id": "s1"})
    assert len(docs) == 1
    assert docs[0]["processor_engine"] in ("docling", "fallback")


def test_oa_retrieval_fallback_to_jats_xml(test_setup, monkeypatch):
    """When direct PDF is not served, Europe PMC JATS XML is parsed into pdf_documents."""
    backend = test_setup["backend"]

    monkeypatch.setattr(fa, "_unpaywall", lambda doi, email: None)
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: {"pmcid": "PMC8888", "isOpenAccess": "Y", "inEPMC": "Y"})
    monkeypatch.setattr(fr, "_download_pdf", lambda url, timeout=30: None)  # direct PDF download fails
    monkeypatch.setattr(fr, "_fetch_xml", lambda pmcid: MOCK_JATS)

    res = fr.retrieve_and_process_oa_study("s2", "PROJ1")
    assert res["outcome"] == "fetched"
    assert res.get("pdf") is False

    study = backend.get("studies", "s2")
    assert study["pdf_status"] == "text_only"
    assert study["extraction_status"] == "ready_for_extraction"

    docs = backend.query("pdf_documents", {"study_id": "s2"})
    assert len(docs) == 1
    assert "Sensitivity was 94.2%" in docs[0]["full_text"]


def test_oa_retrieval_paywalled_leaves_awaiting_pdf(test_setup, monkeypatch):
    """Paywalled or non-OA study remains in awaiting_pdf."""
    backend = test_setup["backend"]

    monkeypatch.setattr(fa, "_unpaywall", lambda doi, email: {"is_oa": False})
    monkeypatch.setattr(fa, "_europepmc", lambda pmid, doi: {"isOpenAccess": "N"})
    monkeypatch.setattr(fr, "_download_pdf", lambda url, timeout=30: None)

    res = fr.retrieve_and_process_oa_study("s3", "PROJ1")
    assert res["outcome"] == "not_open_access"

    study = backend.get("studies", "s3")
    assert study["extraction_status"] == "awaiting_pdf"


def test_single_pdf_upload_converts_docling_and_readies_extraction(test_setup):
    """User uploading single PDF attaches it, runs Docling, and sets ready_for_extraction."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    backend.execute("UPDATE studies SET screening_status = 'included', extraction_status = 'awaiting_pdf' WHERE study_id = 's3'")
    backend.commit()

    file_payload = ("s3_paper.pdf", io.BytesIO(MOCK_PDF), "application/pdf")
    resp = client.post(
        "/api/studies/s3/upload-pdf",
        files={"file": file_payload},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pdf_status"] == "processed"
    assert data["extraction_status"] == "ready_for_extraction"

    study = backend.get("studies", "s3")
    assert study["extraction_status"] == "ready_for_extraction"
    docs = backend.query("pdf_documents", {"study_id": "s3"})
    assert len(docs) == 1


def test_universal_upload_included_files_pdf_matching(test_setup):
    """Bulk PDF upload automatically matches included studies by DOI/PMID/title and processes them."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    # Mark s1 and s2 as included and awaiting_pdf
    backend.execute("UPDATE studies SET screening_status = 'included', extraction_status = 'awaiting_pdf' WHERE study_id IN ('s1', 's2')")
    backend.commit()

    # Create files: one with PMID in name, one with title words in name
    pdf1 = ("paper_pmid_33445566.pdf", io.BytesIO(MOCK_PDF), "application/pdf")
    pdf2 = ("Chest_radiograph_triage_emergency.pdf", io.BytesIO(MOCK_PDF), "application/pdf")

    resp = client.post(
        "/api/projects/PROJ1/studies/upload-included-files",
        files=[("files", pdf1), ("files", pdf2)],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["matched_studies"]) == 2
    assert data["processed_with_docling"] == 2

    # Check database
    s1 = backend.get("studies", "s1")
    s2 = backend.get("studies", "s2")
    assert s1["extraction_status"] == "ready_for_extraction"
    assert s2["extraction_status"] == "ready_for_extraction"


def test_universal_upload_zip_with_pdfs(test_setup):
    """User uploading a .zip archive of PDFs unpacks and matches included studies."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    backend.execute("UPDATE studies SET screening_status = 'included', extraction_status = 'awaiting_pdf' WHERE study_id = 's1'")
    backend.commit()

    # Build zip file in memory
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as z:
        z.writestr("included_papers/s1.pdf", MOCK_PDF)
    zip_buf.seek(0)

    resp = client.post(
        "/api/projects/PROJ1/studies/upload-included-files",
        files=[("files", ("export.zip", zip_buf, "application/zip"))],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["matched_studies"]) == 1
    assert data["matched_studies"][0]["study_id"] == "s1"

    s1 = backend.get("studies", "s1")
    assert s1["extraction_status"] == "ready_for_extraction"


def test_universal_upload_zotero_ris_and_endnote_xml(test_setup, monkeypatch):
    """Uploading Zotero RIS or EndNote XML with URLs/DOIs matches and triggers retrieval."""
    client = test_setup["client"]
    backend = test_setup["backend"]

    # Mock download for remote PDF URL
    monkeypatch.setattr(fr, "_download_pdf", lambda url, timeout=30: MOCK_PDF)

    # RIS with remote PDF link matching s1 by DOI
    ris_content = """TY  - JOUR
TI  - Deep learning for pneumonia detection
DO  - 10.1016/j.rad.2023.01
L1  - https://open.org/download/pneumonia.pdf
ER  - 
"""
    resp = client.post(
        "/api/projects/PROJ1/studies/upload-included-files",
        files=[("files", ("zotero_export.ris", io.BytesIO(ris_content.encode("utf-8")), "application/x-research-info-systems"))],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["matched_studies"]) == 1
    assert data["matched_studies"][0]["study_id"] == "s1"
    assert data["matched_studies"][0]["pdf_attached"] is True

    s1 = backend.get("studies", "s1")
    assert s1["extraction_status"] == "ready_for_extraction"
