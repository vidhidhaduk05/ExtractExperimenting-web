"""Tests for routers/pubmed.py — PubMed API endpoints (mocked network calls)."""
import pytest
from unittest.mock import patch, MagicMock
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
    r = client.post("/api/projects", json={"name": "Test Review"})
    return r.json()["project_id"]


# ── Mock PubMed responses ──

MOCK_ESUMMARY = {
    "result": {
        "36789123": {
            "title": "Diagnostic accuracy of CT for liver metastases",
            "authors": [
                {"name": "Smith J"},
                {"name": "Doe A"},
            ],
            "fulljournalname": "Radiology",
            "pubdate": "2023 Mar",
            "articleids": [
                {"idtype": "doi", "value": "10.1148/radiol.202323001"},
                {"idtype": "pubmed", "value": "36789123"},
            ],
            "pubtype": ["Journal Article"],
        }
    }
}

MOCK_EFETCH_XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>36789123</PMID>
      <Article>
        <Abstract>
          <AbstractText>This study evaluated CT diagnostic accuracy.</AbstractText>
        </Abstract>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>"""

MOCK_ESEARCH = {
    "esearchresult": {
        "idlist": ["36789123", "36789124"],
    }
}

MOCK_ESEARCH_PMC_EMPTY = {
    "esearchresult": {
        "idlist": [],
    }
}

MOCK_UNPAYWALL = {
    "best_oa_location": {
        "url_for_pdf": "https://example.com/article.pdf",
        "url": "https://example.com/article",
    }
}


class TestPubMedLookup:

    @patch("services.pubmed_service.requests.get")
    def test_lookup_success(self, mock_get, client):
        """PMID lookup should return study metadata."""
        mock_summary = MagicMock()
        mock_summary.status_code = 200
        mock_summary.json.return_value = MOCK_ESUMMARY

        mock_efetch = MagicMock()
        mock_efetch.status_code = 200
        mock_efetch.text = MOCK_EFETCH_XML

        mock_get.side_effect = [mock_summary, mock_efetch]

        r = client.get("/api/pubmed/lookup/36789123")
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "Diagnostic accuracy of CT for liver metastases"
        assert data["journal"] == "Radiology"
        assert data["doi"] == "10.1148/radiol.202323001"
        assert data["pmid"] == "36789123"
        assert "Smith J" in data["authors"]
        assert data["publication_year"] == 2023
        assert data["abstract"] != ""

    @patch("services.pubmed_service.requests.get")
    def test_lookup_not_found(self, mock_get, client):
        """Non-existent PMID should return 404."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"result": {"36789123": {"error": "cannot find article"}}}
        mock_get.return_value = mock_resp

        r = client.get("/api/pubmed/lookup/36789123")
        assert r.status_code == 404


class TestPubMedBatch:

    @patch("services.pubmed_service.requests.get")
    def test_batch_search(self, mock_get, client):
        """Batch search should return results list."""
        mock_esearch = MagicMock()
        mock_esearch.status_code = 200
        mock_esearch.json.return_value = MOCK_ESEARCH

        mock_esummary = MagicMock()
        mock_esummary.status_code = 200
        mock_esummary.json.return_value = {
            "result": {
                "36789123": MOCK_ESUMMARY["result"]["36789123"],
                "36789124": {
                    "title": "Another study",
                    "authors": [{"name": "Lee K"}],
                    "fulljournalname": "AJR",
                    "pubdate": "2022",
                    "articleids": [{"idtype": "doi", "value": "10.2214/AJR.22.1"}],
                    "pubtype": ["Journal Article"],
                }
            }
        }

        mock_get.side_effect = [mock_esearch, mock_esummary]

        r = client.post("/api/pubmed/batch", json={"query": "CT MRI liver", "max_results": 10})
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2
        assert len(data["results"]) == 2

    def test_batch_empty_query(self, client):
        """Empty query should return 400."""
        r = client.post("/api/pubmed/batch", json={"query": "", "max_results": 10})
        assert r.status_code == 400

    def test_batch_invalid_max_results(self, client):
        """max_results > 200 should return 400."""
        r = client.post("/api/pubmed/batch", json={"query": "test", "max_results": 500})
        assert r.status_code == 400


class TestPubMedKey:

    def test_set_and_get_key(self, client, project):
        """Set and retrieve PubMed API key."""
        r = client.put(f"/api/projects/{project}/pubmed-key", json={"pubmed_api_key": "abc123key"})
        assert r.status_code == 200
        assert r.json()["pubmed_api_key_set"] is True

        r = client.get(f"/api/projects/{project}/pubmed-key")
        assert r.status_code == 200
        assert r.json()["has_key"] is True
        assert "abc123ke" in r.json()["key_preview"]

    def test_get_key_no_key(self, client, project):
        """Project without key should report has_key=False."""
        r = client.get(f"/api/projects/{project}/pubmed-key")
        assert r.status_code == 200
        assert r.json()["has_key"] is False

    def test_get_key_project_not_found(self, client):
        """Non-existent project should return 404."""
        r = client.get("/api/projects/nonexistent/pubmed-key")
        assert r.status_code == 404

    def test_set_key_project_not_found(self, client):
        """Setting key on non-existent project should return 404."""
        r = client.put("/api/projects/nonexistent/pubmed-key", json={"pubmed_api_key": "test"})
        assert r.status_code == 404


class TestPubMedFulltext:

    @patch("services.pubmed_service.requests.get")
    def test_fulltext_not_available(self, mock_get, client):
        """Full text not in PMC or Unpaywall should report has_fulltext=False."""
        # 1. esummary (for DOI)
        mock_summary = MagicMock()
        mock_summary.status_code = 200
        mock_summary.json.return_value = MOCK_ESUMMARY
        mock_summary.raise_for_status = MagicMock()

        # 2. efetch (for abstract - non-fatal)
        mock_efetch = MagicMock()
        mock_efetch.status_code = 200
        mock_efetch.text = MOCK_EFETCH_XML

        # 3. esearch PMC (empty)
        mock_pmc_search = MagicMock()
        mock_pmc_search.status_code = 200
        mock_pmc_search.json.return_value = MOCK_ESEARCH_PMC_EMPTY

        # 4. Unpaywall (no OA)
        mock_unpaywall = MagicMock()
        mock_unpaywall.status_code = 200
        mock_unpaywall.json.return_value = {"best_oa_location": None}

        mock_get.side_effect = [mock_summary, mock_efetch, mock_pmc_search, mock_unpaywall]

        r = client.get("/api/pubmed/fulltext/36789123")
        assert r.status_code == 200
        data = r.json()
        assert data["has_fulltext"] is False

    @patch("services.pubmed_service.requests.get")
    def test_fulltext_via_unpaywall(self, mock_get, client):
        """Full text available via Unpaywall should report has_fulltext=True."""
        # 1. esummary
        mock_summary = MagicMock()
        mock_summary.status_code = 200
        mock_summary.json.return_value = MOCK_ESUMMARY
        mock_summary.raise_for_status = MagicMock()

        # 2. efetch (abstract)
        mock_efetch = MagicMock()
        mock_efetch.status_code = 200
        mock_efetch.text = MOCK_EFETCH_XML

        # 3. esearch PMC (empty)
        mock_pmc_search = MagicMock()
        mock_pmc_search.status_code = 200
        mock_pmc_search.json.return_value = MOCK_ESEARCH_PMC_EMPTY

        # 4. Unpaywall (has OA)
        mock_unpaywall = MagicMock()
        mock_unpaywall.status_code = 200
        mock_unpaywall.json.return_value = MOCK_UNPAYWALL

        mock_get.side_effect = [mock_summary, mock_efetch, mock_pmc_search, mock_unpaywall]

        r = client.get("/api/pubmed/fulltext/36789123")
        assert r.status_code == 200
        data = r.json()
        assert data["has_fulltext"] is True
        assert data["source"] == "Unpaywall"
        assert "example.com" in data["url"]
