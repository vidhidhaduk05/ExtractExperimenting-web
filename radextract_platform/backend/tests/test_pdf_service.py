"""Tests for services/pdf_service.py and auto_extract_service.py."""
import pytest
import os
import uuid
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services import pdf_service, auto_extract_service


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_pdf.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _create_test_pdf(path: str):
    """Create a minimal PDF with reportlab for testing."""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=letter)
    c.drawString(100, 700, "Diagnostic Accuracy Study of CT for Appendicitis")
    c.drawString(100, 680, "Sensitivity was 85% and specificity was 80%.")
    c.drawString(100, 660, "The study included 150 patients (50 positive, 100 negative).")
    c.drawString(100, 640, "Mean age was 45 years. 60% were male.")
    c.drawString(100, 620, "Reference standard was histopathology.")
    c.drawString(100, 600, "Study design: retrospective cross-sectional.")
    c.showPage()
    c.drawString(100, 700, "Results: The modality used was CT imaging.")
    c.drawString(100, 680, "PPV was 77% and NPV was 88%.")
    c.drawString(100, 660, "AUC was 0.85. Interobserver agreement kappa = 0.75.")
    c.showPage()
    c.save()


@pytest.fixture
def project_study_with_pdf(client, tmp_path):
    """Create a project, study with an uploaded PDF."""
    r = client.post("/api/projects", json={"name": "Test"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": "CT Accuracy Study",
        "study_design": "diagnostic accuracy",
        "abstract": "This study evaluated CT sensitivity and specificity.",
    })
    sid = r.json()["study_id"]

    # Create a test PDF and upload it
    pdf_path = str(tmp_path / "test.pdf")
    _create_test_pdf(pdf_path)

    with open(pdf_path, "rb") as f:
        r = client.post(f"/api/studies/{sid}/upload-pdf", files={"file": ("test.pdf", f, "application/pdf")})
    assert r.status_code == 200

    return pid, sid


class TestPdfService:

    def test_process_pdf(self, project_study_with_pdf):
        """Test that PDF processing extracts text and stores it."""
        _, sid = project_study_with_pdf
        result = pdf_service.process_pdf(sid)

        assert result["study_id"] == sid
        assert result["processor_engine"] in ("docling", "fallback")
        assert result["n_pages"] >= 1
        assert len(result["full_text"]) > 50
        assert "sensitivity" in result["full_text"].lower()

    def test_get_pdf_data(self, project_study_with_pdf):
        """Test retrieving processed PDF data."""
        _, sid = project_study_with_pdf
        pdf_service.process_pdf(sid)
        data = pdf_service.get_pdf_data(sid)

        assert data is not None
        assert data["study_id"] == sid
        assert len(data["full_text"]) > 50
        assert len(data["pages"]) >= 1

    def test_get_full_text(self, project_study_with_pdf):
        """Test getting just the full text."""
        _, sid = project_study_with_pdf
        pdf_service.process_pdf(sid)
        text = pdf_service.get_full_text(sid)
        assert len(text) > 50
        assert "sensitivity" in text.lower()

    def test_get_pdf_summary(self, project_study_with_pdf):
        """Test getting a lightweight summary."""
        _, sid = project_study_with_pdf
        pdf_service.process_pdf(sid)
        summary = pdf_service.get_pdf_summary(sid)

        assert summary["processed"] is True
        assert summary["text_length"] > 50

    def test_get_pdf_summary_not_processed(self, client):
        """Summary for unprocessed study should return processed=False."""
        r = client.post("/api/projects", json={"name": "T"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={"project_id": pid, "title": "S"})
        sid = r.json()["study_id"]
        summary = pdf_service.get_pdf_summary(sid)
        assert summary["processed"] is False

    def test_delete_pdf_data(self, project_study_with_pdf):
        """Test deleting processed PDF data."""
        _, sid = project_study_with_pdf
        pdf_service.process_pdf(sid)
        assert pdf_service.delete_pdf_data(sid) is True
        assert pdf_service.get_pdf_data(sid) is None

    def test_process_no_pdf(self, client):
        """Processing a study without a PDF should raise ValueError."""
        r = client.post("/api/projects", json={"name": "T"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={"project_id": pid, "title": "S"})
        sid = r.json()["study_id"]
        with pytest.raises(ValueError, match="No uploaded PDF"):
            pdf_service.process_pdf(sid)


class TestPdfEndpoints:

    def test_process_pdf_endpoint(self, client, project_study_with_pdf):
        _, sid = project_study_with_pdf
        r = client.post(f"/api/studies/{sid}/process-pdf")
        assert r.status_code == 200
        assert r.json()["processor_engine"] in ("docling", "fallback")

    def test_get_pdf_data_endpoint(self, client, project_study_with_pdf):
        _, sid = project_study_with_pdf
        client.post(f"/api/studies/{sid}/process-pdf")
        r = client.get(f"/api/studies/{sid}/pdf-data")
        assert r.status_code == 200
        assert "full_text" in r.json()

    def test_get_pdf_summary_endpoint(self, client, project_study_with_pdf):
        _, sid = project_study_with_pdf
        client.post(f"/api/studies/{sid}/process-pdf")
        r = client.get(f"/api/studies/{sid}/pdf-summary")
        assert r.status_code == 200
        assert r.json()["processed"] is True

    def test_delete_pdf_data_endpoint(self, client, project_study_with_pdf):
        _, sid = project_study_with_pdf
        client.post(f"/api/studies/{sid}/process-pdf")
        r = client.delete(f"/api/studies/{sid}/pdf-data")
        assert r.status_code == 200

    def test_get_pdf_data_not_processed(self, client, project_study_with_pdf):
        _, sid = project_study_with_pdf
        r = client.get(f"/api/studies/{sid}/pdf-data")
        assert r.status_code == 404


class TestAutoExtract:

    def test_auto_extract(self, client, project_study_with_pdf):
        """Test automated extraction from processed PDF."""
        pid, sid = project_study_with_pdf

        # Add variables to the project
        client.post(f"/api/projects/{pid}/variables", json={
            "project_id": pid, "section": "Results", "name": "sensitivity",
            "field_type": "text",
        })
        client.post(f"/api/projects/{pid}/variables", json={
            "project_id": pid, "section": "Results", "name": "specificity",
            "field_type": "text",
        })
        client.post(f"/api/projects/{pid}/variables", json={
            "project_id": pid, "section": "Methods", "name": "sample_size",
            "field_type": "number",
        })

        # Process PDF first
        client.post(f"/api/studies/{sid}/process-pdf")

        # Run auto-extract
        r = client.post(f"/api/studies/{sid}/auto-extract?project_id={pid}")
        assert r.status_code == 200
        data = r.json()
        assert data["total_variables"] == 3
        assert data["extracted"] > 0  # at least some variables should match

    def test_auto_extract_no_pdf(self, client):
        """Auto-extract without processed PDF should fail."""
        r = client.post("/api/projects", json={"name": "T"})
        pid = r.json()["project_id"]
        r = client.post(f"/api/projects/{pid}/studies", json={"project_id": pid, "title": "S"})
        sid = r.json()["study_id"]
        r = client.post(f"/api/studies/{sid}/auto-extract?project_id={pid}")
        assert r.status_code == 400

    def test_auto_extract_no_variables(self, client, project_study_with_pdf):
        """Auto-extract with no variables defined should return 0 extracted."""
        pid, sid = project_study_with_pdf
        client.post(f"/api/studies/{sid}/process-pdf")
        r = client.post(f"/api/studies/{sid}/auto-extract?project_id={pid}")
        assert r.status_code == 200
        assert r.json()["extracted"] == 0
