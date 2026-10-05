"""Tests for routers/analysis.py — sensitivity analysis and data analysis API endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services import analysis_service


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_analysis_api.db"))
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
    r = client.post("/api/projects", json={"name": "Analysis Test Project"})
    return r.json()["project_id"]


def setup_meta_analysis_with_studies(project_id: str, outcome_label: str, studies_data: list[dict]):
    """Helper to insert a meta-analysis and study records into DB."""
    conn = get_connection()
    meta_id = f"meta_{outcome_label}"
    conn.execute(
        """INSERT INTO meta_analyses
           (meta_id, project_id, outcome_label, analysis_type, effect_measure, n_studies)
           VALUES (?, ?, ?, 'generic', 'md', ?)""",
        (meta_id, project_id, outcome_label, len(studies_data)),
    )
    for i, sd in enumerate(studies_data):
        link_id = f"link_{meta_id}_{i}"
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_id, study_label, effect_size, variance, se, included)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
            (
                link_id,
                meta_id,
                sd.get("study_id", f"study_{i}"),
                sd.get("study_label", f"Study {i+1}"),
                sd.get("effect_size"),
                sd.get("variance"),
                sd.get("se"),
            ),
        )
    conn.commit()
    conn.close()
    return meta_id


class TestGetSensitivityEndpoint:
    """Tests for GET /api/projects/{project_id}/analysis/sensitivity."""

    def test_get_sensitivity_success(self, client, project):
        """Happy path: valid project with >=3 studies returns leave-one-out sensitivity analysis."""
        outcome = "Mortality"
        studies = [
            {"study_label": "Study A", "effect_size": 0.5, "variance": 0.04, "se": 0.2},
            {"study_label": "Study B", "effect_size": 0.8, "variance": 0.05, "se": 0.22},
            {"study_label": "Study C", "effect_size": 0.3, "variance": 0.03, "se": 0.17},
        ]
        setup_meta_analysis_with_studies(project, outcome, studies)

        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome={outcome}")
        assert response.status_code == 200
        data = response.json()

        assert data["outcome_label"] == outcome
        assert data["n_studies"] == 3
        assert "full_pooled" in data
        assert "full_ci_lower" in data
        assert "full_ci_upper" in data
        assert "full_i_squared" in data
        assert "full_tau_squared" in data
        assert len(data["leave_one_out"]) == 3

        # Check structure of leave_one_out items
        item = data["leave_one_out"][0]
        assert "study_label" in item
        assert "pooled_without" in item
        assert "ci_lower" in item
        assert "ci_upper" in item
        assert "pooled_change" in item

    def test_get_sensitivity_project_not_found(self, client):
        """Should return 404 when project_id does not exist."""
        response = client.get("/api/projects/nonexistent_proj/analysis/sensitivity?outcome=Mortality")
        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

    def test_get_sensitivity_outcome_not_found(self, client, project):
        """Should return 400 when no meta-analysis exists for the specified outcome."""
        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome=NonExistentOutcome")
        assert response.status_code == 400
        assert "No meta-analysis found for outcome" in response.json()["detail"]

    def test_get_sensitivity_insufficient_studies(self, client, project):
        """Should return 400 when meta-analysis has fewer than 3 studies."""
        outcome = "RareOutcome"
        studies = [
            {"study_label": "Study A", "effect_size": 0.5, "variance": 0.04, "se": 0.2},
            {"study_label": "Study B", "effect_size": 0.8, "variance": 0.05, "se": 0.22},
        ]
        setup_meta_analysis_with_studies(project, outcome, studies)

        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome={outcome}")
        assert response.status_code == 400
        assert "Need at least 3 studies for sensitivity analysis" in response.json()["detail"]

    def test_get_sensitivity_insufficient_numeric_data(self, client, project):
        """Should return 400 when fewer than 3 studies have numeric effect sizes/variances."""
        outcome = "IncompleteDataOutcome"
        studies = [
            {"study_label": "Study A", "effect_size": 0.5, "variance": 0.04, "se": 0.2},
            {"study_label": "Study B", "effect_size": None, "variance": None, "se": None},
            {"study_label": "Study C", "effect_size": None, "variance": None, "se": None},
        ]
        setup_meta_analysis_with_studies(project, outcome, studies)

        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome={outcome}")
        assert response.status_code == 400
        assert "Insufficient numeric data" in response.json()["detail"]

    def test_get_sensitivity_missing_query_param(self, client, project):
        """Should return 422 Unprocessable Entity when outcome query param is missing."""
        response = client.get(f"/api/projects/{project}/analysis/sensitivity")
        assert response.status_code == 422

    def test_get_sensitivity_internal_server_error(self, client, project, monkeypatch):
        """Should return 500 Internal Server Error when analysis_service raises an unhandled exception."""
        outcome = "ServerErrorOutcome"
        studies = [
            {"study_label": "Study A", "effect_size": 0.5, "variance": 0.04, "se": 0.2},
            {"study_label": "Study B", "effect_size": 0.8, "variance": 0.05, "se": 0.22},
            {"study_label": "Study C", "effect_size": 0.3, "variance": 0.03, "se": 0.17},
        ]
        setup_meta_analysis_with_studies(project, outcome, studies)

        def mock_compute_sensitivity_analysis(*args, **kwargs):
            raise RuntimeError("Database connection broken")

        monkeypatch.setattr(analysis_service, "compute_sensitivity_analysis", mock_compute_sensitivity_analysis)

        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome={outcome}")
        assert response.status_code == 500
        assert "Analysis failed: Database connection broken" in response.json()["detail"]
