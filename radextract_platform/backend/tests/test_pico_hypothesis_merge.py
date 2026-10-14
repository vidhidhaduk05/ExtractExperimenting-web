"""Tests for merged PICO/Hypothesis endpoints: criteria, search strings, PubMed fetch, reference upload."""
import pytest
import json
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    db_path = str(tmp_path / "test_api.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project(client):
    """Create a project and return its ID."""
    r = client.post("/api/projects", json={"name": "Test Review", "description": "A test"})
    return r.json()["project_id"]


@pytest.fixture
def project_with_pico(client, project):
    """Create a project with PICO defined."""
    client.put(f"/api/projects/{project}/pico", json={
        "population": "patients with colorectal cancer",
        "index_test": "MRI",
        "comparator": "CT",
        "outcome": "diagnostic accuracy",
        "study_design": "diagnostic accuracy study",
    })
    return project


# ── Criteria endpoints ──

class TestCriteria:
    """Tests for inclusion/exclusion criteria endpoints."""

    def test_get_criteria_empty(self, client, project):
        r = client.get(f"/api/projects/{project}/criteria")
        assert r.status_code == 200
        data = r.json()
        assert data["inclusion"] == []
        assert data["exclusion"] == []

    def test_put_criteria(self, client, project):
        r = client.put(f"/api/projects/{project}/criteria", json={
            "inclusion": [{"id": "i1", "text": "Must include adults"}],
            "exclusion": [{"id": "e1", "text": "No case reports"}],
        })
        assert r.status_code == 200
        data = r.json()
        assert len(data["inclusion"]) == 1
        assert data["inclusion"][0]["text"] == "Must include adults"
        assert len(data["exclusion"]) == 1

    def test_get_criteria_after_put(self, client, project):
        client.put(f"/api/projects/{project}/criteria", json={
            "inclusion": [{"id": "i1", "text": "Criterion 1"}, {"id": "i2", "text": "Criterion 2"}],
            "exclusion": [{"id": "e1", "text": "Exclusion 1"}],
        })
        r = client.get(f"/api/projects/{project}/criteria")
        assert r.status_code == 200
        data = r.json()
        assert len(data["inclusion"]) == 2
        assert len(data["exclusion"]) == 1

    def test_generate_criteria_from_pico(self, client, project_with_pico):
        r = client.post(f"/api/projects/{project_with_pico}/criteria/generate")
        assert r.status_code == 200
        data = r.json()
        assert len(data["inclusion"]) >= 3  # P, I, O at minimum
        assert len(data["exclusion"]) >= 3  # Default exclusions

    def test_generate_criteria_without_pico(self, client, project):
        r = client.post(f"/api/projects/{project}/criteria/generate")
        assert r.status_code == 400
        assert "PICO" in r.json()["detail"]

    def test_criteria_project_not_found(self, client):
        r = client.get("/api/projects/nonexistent/criteria")
        assert r.status_code == 404


@pytest.fixture(autouse=True)
def mock_ai_search(monkeypatch):
    """Mock generate_ai_search_strings for search string tests when LLM is offline."""
    from services import search_string_generator

    def mock_gen(pico, research_question=""):
        return search_string_generator.generate_search_strings(pico)

    monkeypatch.setattr(search_string_generator, "generate_ai_search_strings", mock_gen)


# ── Search string endpoints ──

class TestSearchStrings:
    """Tests for search string generation endpoints."""

    def test_generate_search_strings(self, client, project_with_pico):
        r = client.post(f"/api/projects/{project_with_pico}/search-strings/generate")
        assert r.status_code == 200
        data = r.json()
        strings = data["strings"]
        assert "pubmed" in strings
        assert "embase" in strings
        assert "cochrane" in strings
        assert "web_of_science" in strings
        assert "scopus" in strings
        assert "cinahl" in strings
        assert len(strings["pubmed"]) > 20

    def test_get_search_strings_after_generate(self, client, project_with_pico):
        client.post(f"/api/projects/{project_with_pico}/search-strings/generate")
        r = client.get(f"/api/projects/{project_with_pico}/search-strings")
        assert r.status_code == 200
        data = r.json()
        assert "pubmed" in data["strings"]
        assert len(data["strings"]["pubmed"]) > 20

    def test_get_search_strings_empty(self, client, project):
        r = client.get(f"/api/projects/{project}/search-strings")
        assert r.status_code == 200
        assert r.json()["strings"] == {}

    def test_generate_search_strings_without_pico(self, client, project):
        r = client.post(f"/api/projects/{project}/search-strings/generate")
        assert r.status_code == 400
        assert "PICO" in r.json()["detail"]

    def test_search_strings_project_not_found(self, client):
        r = client.post("/api/projects/nonexistent/search-strings/generate")
        assert r.status_code == 404


# ── PICO extraction endpoint ──

class TestPicoExtraction:
    """Tests for PICO extraction from uploaded documents."""

    def test_extract_pico_from_txt(self, client, project):
        content = (
            "Population\n"
            "Patients with colorectal cancer undergoing staging imaging.\n\n"
            "Index Test\n"
            "Contrast-enhanced computed tomography (CT).\n\n"
            "Outcome\n"
            "Diagnostic accuracy measured by sensitivity and specificity.\n\n"
        )
        r = client.post(
            f"/api/projects/{project}/pico/extract",
            files={"file": ("protocol.txt", content.encode(), "text/plain")},
        )
        assert r.status_code == 200
        data = r.json()
        assert "population" in data
        assert "extraction_confidence" in data

    def test_extract_pico_unsupported_type(self, client, project):
        r = client.post(
            f"/api/projects/{project}/pico/extract",
            files={"file": ("document.xyz", b"content", "application/octet-stream")},
        )
        assert r.status_code == 400
        assert "Unsupported" in r.json()["detail"]

    def test_extract_pico_project_not_found(self, client):
        r = client.post(
            "/api/projects/nonexistent/pico/extract",
            files={"file": ("protocol.txt", b"test", "text/plain")},
        )
        assert r.status_code == 404

    def test_extract_does_not_auto_save(self, client, project):
        """Extraction returns extracted data and persists protocol fields."""
        content = "Population: Patients with liver cancer.\nIndex Test: MRI."
        r = client.post(
            f"/api/projects/{project}/pico/extract",
            files={"file": ("protocol.txt", content.encode(), "text/plain")},
        )
        assert r.status_code == 200
        # Verify PICO was saved
        pico_r = client.get(f"/api/projects/{project}/pico")
        pico_data = pico_r.json()
        assert pico_data["population"] == "Patients with liver cancer."


# ── PubMed fetch endpoint ──

class TestPubMedFetch:
    """Tests for PubMed auto-fetch endpoint."""

    def test_pubmed_fetch_without_search_string(self, client, project):
        r = client.post(
            f"/api/projects/{project}/search-strings/pubmed/fetch",
            json={"max_results": 10},
        )
        assert r.status_code == 400
        assert "search string" in r.json()["detail"].lower()

    def test_pubmed_fetch_project_not_found(self, client):
        r = client.post(
            "/api/projects/nonexistent/search-strings/pubmed/fetch",
            json={"max_results": 10},
        )
        assert r.status_code == 404

    @pytest.fixture
    def project_with_search_string(self, client, project_with_pico):
        """Generate search strings so PubMed string is saved."""
        client.post(f"/api/projects/{project_with_pico}/search-strings/generate")
        return project_with_pico

    def test_pubmed_fetch_with_mock(self, client, project_with_search_string, monkeypatch):
        """Mock the PubMed search to avoid real API calls."""
        from services import pubmed_service

        def mock_batch_search(query, api_key="", max_results=50, **kwargs):
            return [
                {"title": "Test Study 1", "authors": "Smith J", "journal": "Radiology",
                 "publication_year": 2023, "doi": "10.1/test1", "pmid": "11111", "source": "PubMed"},
                {"title": "Test Study 2", "authors": "Doe A", "journal": "AJR",
                 "publication_year": 2022, "doi": "10.1/test2", "pmid": "22222", "source": "PubMed"},
            ]

        monkeypatch.setattr(pubmed_service, "batch_search", mock_batch_search)

        r = client.post(
            f"/api/projects/{project_with_search_string}/search-strings/pubmed/fetch",
            json={"max_results": 10},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["imported_count"] == 2
        assert data["skipped_duplicates"] == 0
        assert data["total_found"] == 2

    def test_pubmed_fetch_skips_duplicates(self, client, project_with_search_string, monkeypatch):
        """Studies with existing PMIDs should be skipped."""
        from services import pubmed_service

        def mock_batch_search(query, api_key="", max_results=50, **kwargs):
            return [
                {"title": "Test Study 1", "authors": "Smith J", "journal": "Radiology",
                 "publication_year": 2023, "doi": "10.1/test1", "pmid": "11111", "source": "PubMed"},
                {"title": "Test Study 2", "authors": "Doe A", "journal": "AJR",
                 "publication_year": 2022, "doi": "10.1/test2", "pmid": "22222", "source": "PubMed"},
            ]

        monkeypatch.setattr(pubmed_service, "batch_search", mock_batch_search)

        # First fetch — imports 2
        r1 = client.post(
            f"/api/projects/{project_with_search_string}/search-strings/pubmed/fetch",
            json={"max_results": 10},
        )
        assert r1.json()["imported_count"] == 2

        # Second fetch — should skip both as duplicates
        r2 = client.post(
            f"/api/projects/{project_with_search_string}/search-strings/pubmed/fetch",
            json={"max_results": 10},
        )
        assert r2.json()["imported_count"] == 0
        assert r2.json()["skipped_duplicates"] == 2


# ── Reference upload endpoint ──

class TestReferenceUpload:
    """Tests for RIS/BibTeX reference upload endpoint."""

    RIS_CONTENT = (
        "TY  - JOUR\n"
        "AU  - Smith, John\n"
        "TI  - Diagnostic accuracy of MRI\n"
        "JO  - Radiology\n"
        "PY  - 2023\n"
        "DO  - 10.1148/test1\n"
        "ER  - \n"
        "TY  - JOUR\n"
        "AU  - Chen, Wei\n"
        "TI  - CT for liver imaging\n"
        "JO  - European Radiology\n"
        "PY  - 2022\n"
        "DO  - 10.1007/test2\n"
        "ER  - \n"
    )

    def test_upload_ris(self, client, project):
        r = client.post(
            f"/api/projects/{project}/references/upload",
            files={"files": ("refs.ris", self.RIS_CONTENT.encode(), "application/octet-stream")},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["imported_count"] == 2
        assert data["skipped_duplicates"] == 0

    def test_upload_ris_skips_duplicates(self, client, project):
        # First upload
        client.post(
            f"/api/projects/{project}/references/upload",
            files={"files": ("refs.ris", self.RIS_CONTENT.encode(), "application/octet-stream")},
        )
        # Second upload — should skip all
        r = client.post(
            f"/api/projects/{project}/references/upload",
            files={"files": ("refs.ris", self.RIS_CONTENT.encode(), "application/octet-stream")},
        )
        assert r.json()["imported_count"] == 0
        assert r.json()["skipped_duplicates"] == 2

    def test_upload_bibtex(self, client, project):
        bibtex = (
            "@article{smith2023,\n"
            "  author = {Smith, John},\n"
            "  title = {Diagnostic accuracy of MRI},\n"
            "  journal = {Radiology},\n"
            "  year = {2023},\n"
            "  doi = {10.1148/bibtex1},\n"
            "}\n"
        )
        r = client.post(
            f"/api/projects/{project}/references/upload",
            files={"files": ("refs.bib", bibtex.encode(), "application/octet-stream")},
        )
        assert r.status_code == 200
        assert r.json()["imported_count"] == 1

    def test_upload_empty_file(self, client, project):
        r = client.post(
            f"/api/projects/{project}/references/upload",
            files={"files": ("empty.ris", b"", "application/octet-stream")},
        )
        # Empty file now returns 200 with errors in the response (not 400)
        assert r.status_code == 200
        assert r.json()["imported_count"] == 0
        assert len(r.json()["errors"]) > 0

    def test_upload_project_not_found(self, client):
        r = client.post(
            "/api/projects/nonexistent/references/upload",
            files={"files": ("refs.ris", b"TY  - JOUR\nER  - \n", "application/octet-stream")},
        )
        assert r.status_code == 404
