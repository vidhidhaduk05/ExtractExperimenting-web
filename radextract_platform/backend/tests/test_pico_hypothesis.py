"""Tests for PICO and Hypothesis endpoints in routers/projects.py."""
import pytest
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


# ── PICO endpoints ──

class TestPICOEndpoints:

    def test_get_pico_empty(self, client, project):
        """New project should have empty PICO."""
        r = client.get(f"/api/projects/{project}/pico")
        assert r.status_code == 200
        data = r.json()
        assert data["population"] == ""
        assert data["index_test"] == ""
        assert data["comparator"] == ""
        assert data["outcome"] == ""
        assert data["study_design"] == ""
        assert data["is_defined"] is False

    def test_update_pico(self, client, project):
        """Updating PICO should persist values."""
        r = client.put(f"/api/projects/{project}/pico", json={
            "population": "Adults with suspected liver metastases",
            "index_test": "Contrast-enhanced CT",
            "comparator": "Gadoxetic acid MRI",
            "outcome": "Diagnostic accuracy",
            "study_design": "Diagnostic accuracy study",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["population"] == "Adults with suspected liver metastases"
        assert data["index_test"] == "Contrast-enhanced CT"
        assert data["is_defined"] is True

    def test_get_pico_after_update(self, client, project):
        """PICO should persist after update."""
        client.put(f"/api/projects/{project}/pico", json={
            "population": "Test population",
            "index_test": "CT",
            "comparator": "MRI",
            "outcome": "Accuracy",
            "study_design": "Cross-sectional",
        })
        r = client.get(f"/api/projects/{project}/pico")
        assert r.status_code == 200
        assert r.json()["population"] == "Test population"
        assert r.json()["is_defined"] is True

    def test_partial_pico_not_defined(self, client, project):
        """PICO with only some fields filled should still be is_defined=True if any field has content."""
        r = client.put(f"/api/projects/{project}/pico", json={
            "population": "Test pop",
            "index_test": "",
            "comparator": "",
            "outcome": "",
            "study_design": "",
        })
        assert r.status_code == 200
        assert r.json()["is_defined"] is True

    def test_pico_project_not_found(self, client):
        """Non-existent project should return 404."""
        r = client.get("/api/projects/nonexistent/pico")
        assert r.status_code == 404

    def test_update_pico_project_not_found(self, client):
        """Updating PICO on non-existent project should return 404."""
        r = client.put("/api/projects/nonexistent/pico", json={
            "population": "test",
        })
        assert r.status_code == 404


# ── Hypothesis endpoints ──

class TestHypothesisEndpoints:

    def test_get_hypothesis_empty(self, client, project):
        """New project should have empty hypothesis."""
        r = client.get(f"/api/projects/{project}/hypothesis")
        assert r.status_code == 200
        data = r.json()
        assert data["hypothesis"] == ""
        assert data["research_question"] == ""
        assert data["secondary_hypotheses"] == []

    def test_update_hypothesis(self, client, project):
        """Updating hypothesis should persist."""
        r = client.put(f"/api/projects/{project}/hypothesis", json={
            "hypothesis": "MRI is more accurate than CT for detecting liver metastases",
            "research_question": "Is MRI superior to CT for liver metastasis detection?",
            "secondary_hypotheses": [],
        })
        assert r.status_code == 200
        data = r.json()
        assert "MRI is more accurate" in data["hypothesis"]
        assert "Is MRI superior" in data["research_question"]

    def test_secondary_hypotheses(self, client, project):
        """Secondary hypotheses should persist and be retrievable."""
        r = client.put(f"/api/projects/{project}/hypothesis", json={
            "hypothesis": "Primary hypothesis",
            "research_question": "Primary RQ",
            "secondary_hypotheses": [
                {"text": "MRI has higher specificity", "type": "alternative", "status": "pending"},
                {"text": "CT is faster", "type": "null", "status": "pending"},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert len(data["secondary_hypotheses"]) == 2
        assert data["secondary_hypotheses"][0]["text"] == "MRI has higher specificity"
        assert data["secondary_hypotheses"][1]["type"] == "null"

    def test_get_hypothesis_after_update(self, client, project):
        """Hypothesis should persist after update."""
        client.put(f"/api/projects/{project}/hypothesis", json={
            "hypothesis": "Test hypothesis",
            "research_question": "Test RQ",
            "secondary_hypotheses": [],
        })
        r = client.get(f"/api/projects/{project}/hypothesis")
        assert r.status_code == 200
        assert r.json()["hypothesis"] == "Test hypothesis"

    def test_hypothesis_project_not_found(self, client):
        """Non-existent project should return 404."""
        r = client.get("/api/projects/nonexistent/hypothesis")
        assert r.status_code == 404


# ── Variable auto-generation endpoint ──

class TestAutoGenerateVariables:

    def test_auto_generate_success(self, client, project):
        """Auto-generate should create variables from PICO."""
        # First set PICO
        client.put(f"/api/projects/{project}/pico", json={
            "population": "Patients with liver metastases",
            "index_test": "CT",
            "comparator": "MRI",
            "outcome": "Diagnostic accuracy (sensitivity and specificity)",
            "study_design": "Diagnostic accuracy study",
        })

        r = client.post(f"/api/projects/{project}/variables/auto-generate")
        assert r.status_code == 200
        data = r.json()
        assert data["generated_count"] > 0
        assert len(data["variables"]) > 0
        names = {v["name"] for v in data["variables"]}
        # Hypothesis-driven generation: variables derive from the PICO content,
        # not from a hardcoded radiology template
        assert any("ct" in n or "index" in n or "intervention" in n for n in names)
        assert any("mri" in n or "comparator" in n for n in names)
        assert any("sensitivity" in n or "specificity" in n or "accuracy" in n or "outcome" in n for n in names)

    def test_auto_generate_no_pico(self, client, project):
        """Auto-generate without PICO should return 400."""
        r = client.post(f"/api/projects/{project}/variables/auto-generate")
        assert r.status_code == 400
        assert "PICO" in r.json()["detail"]

    def test_auto_generate_project_not_found(self, client):
        """Auto-generate on non-existent project should return 404."""
        r = client.post("/api/projects/nonexistent/variables/auto-generate")
        assert r.status_code == 404

    def test_auto_generate_no_duplicates(self, client, project):
        """Running auto-generate twice should not create duplicates."""
        client.put(f"/api/projects/{project}/pico", json={
            "population": "Test pop",
            "index_test": "CT",
            "comparator": "MRI",
            "outcome": "Diagnostic accuracy",
            "study_design": "Diagnostic accuracy study",
        })

        r1 = client.post(f"/api/projects/{project}/variables/auto-generate")
        assert r1.status_code == 200
        created1 = r1.json()["created_count"]

        r2 = client.post(f"/api/projects/{project}/variables/auto-generate")
        assert r2.status_code == 200
        created2 = r2.json()["created_count"]

        # Second run should create 0 new variables (all already exist)
        assert created2 == 0
        assert created1 > 0


# ── Citation endpoints ──

class TestCitationEndpoints:

    @pytest.fixture
    def study(self, client, project):
        """Create a study with full metadata."""
        r = client.post(f"/api/projects/{project}/studies", json={
            "project_id": project,
            "title": "CT vs MRI Diagnostic Accuracy Study",
            "authors": "Smith J, Doe A",
            "journal": "Radiology",
            "publication_year": 2023,
            "doi": "10.1148/radiol.202323001",
            "pmid": "36789123",
            "study_design": "diagnostic accuracy",
        })
        return r.json()["study_id"]

    def test_get_all_citations(self, client, project, study):
        """Should return citations in all 6 formats."""
        r = client.get(f"/api/studies/{study}/citations")
        assert r.status_code == 200
        data = r.json()
        assert "citations" in data
        assert set(data["citations"].keys()) == {
            "vancouver", "apa", "mla", "chicago", "harvard", "bibtex"
        }

    def test_get_single_format(self, client, project, study):
        """Should return a single format citation."""
        r = client.get(f"/api/studies/{study}/citations/vancouver")
        assert r.status_code == 200
        text = r.text
        assert "Smith" in text
        assert "Radiology" in text

    def test_invalid_format(self, client, project, study):
        """Invalid format should return 400."""
        r = client.get(f"/api/studies/{study}/citations/invalid")
        assert r.status_code == 400

    def test_citations_study_not_found(self, client):
        """Non-existent study should return 404."""
        r = client.get("/api/studies/nonexistent/citations")
        assert r.status_code == 404
