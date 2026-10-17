"""Tests for routers/analysis.py — data profiling, heterogeneity, sensitivity, and meta-analysis API endpoints."""
import json
import uuid
import pytest
from unittest.mock import patch
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


class TestGetHeterogeneity:

    def test_get_heterogeneity_success(self, client, project):
        """Test happy path when valid project and meta-analysis with >= 2 studies exists."""
        r = client.post(
            f"/api/projects/{project}/meta-analyses",
            json={
                "outcome_label": "Overall Survival",
                "analysis_type": "generic",
                "effect_measure": "md",
            },
        )
        assert r.status_code == 200
        meta_id = r.json()["meta_id"]

        conn = get_connection()
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_label, effect_size, variance, se, ci_lower, ci_upper, included)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (str(uuid.uuid4()), meta_id, "Study A", 0.5, 0.04, 0.2, 0.1, 0.9),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_label, effect_size, variance, se, ci_lower, ci_upper, included)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (str(uuid.uuid4()), meta_id, "Study B", 0.8, 0.05, 0.2236, 0.36, 1.24),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_label, effect_size, variance, se, ci_lower, ci_upper, included)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (str(uuid.uuid4()), meta_id, "Study C", 0.3, 0.03, 0.1732, -0.04, 0.64),
        )
        conn.commit()
        conn.close()

        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "Overall Survival"},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta_id"] == meta_id
        assert data["outcome_label"] == "Overall Survival"
        assert data["n_studies"] == 3
        assert "q_statistic" in data
        assert "q_df" in data
        assert data["q_df"] == 2
        assert "q_p_value" in data
        assert "i_squared" in data
        assert "i_squared_interpretation" in data
        assert "tau_squared" in data
        assert "h_statistic" in data
        assert "pooled_effect_fixed" in data
        assert "pooled_effect_random" in data
        assert "se_pooled" in data
        assert "ci_lower" in data
        assert "ci_upper" in data

    def test_get_heterogeneity_project_not_found(self, client):
        resp = client.get(
            "/api/projects/nonexistent-project-id/analysis/heterogeneity",
            params={"outcome": "Overall Survival"},
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Project not found"

    def test_get_heterogeneity_outcome_not_found(self, client, project):
        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "Nonexistent Outcome"},
        )
        assert resp.status_code == 400
        assert "No meta-analysis found for outcome" in resp.json()["detail"]

    def test_get_heterogeneity_insufficient_studies(self, client, project):
        client.post(
            f"/api/projects/{project}/meta-analyses",
            json={
                "outcome_label": "Single Study Outcome",
                "analysis_type": "generic",
                "effect_measure": "md",
            },
        )
        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "Single Study Outcome"},
        )
        assert resp.status_code == 400
        assert "Need at least 2 studies" in resp.json()["detail"]

    def test_get_heterogeneity_insufficient_numeric_data(self, client, project):
        r = client.post(
            f"/api/projects/{project}/meta-analyses",
            json={
                "outcome_label": "No Variance Outcome",
                "analysis_type": "generic",
            },
        )
        meta_id = r.json()["meta_id"]

        conn = get_connection()
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_label, included)
               VALUES (?, ?, ?, 1)""",
            (str(uuid.uuid4()), meta_id, "Study A"),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_label, included)
               VALUES (?, ?, ?, 1)""",
            (str(uuid.uuid4()), meta_id, "Study B"),
        )
        conn.commit()
        conn.close()

        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "No Variance Outcome"},
        )
        assert resp.status_code == 400
        assert "Insufficient numeric effect size data" in resp.json()["detail"]

    def test_get_heterogeneity_missing_query_param(self, client, project):
        resp = client.get(f"/api/projects/{project}/analysis/heterogeneity")
        assert resp.status_code == 422

    def test_get_heterogeneity_server_error(self, client, project):
        with patch(
            "services.analysis_service.compute_heterogeneity",
            side_effect=RuntimeError("Unexpected processing exception"),
        ):
            resp = client.get(
                f"/api/projects/{project}/analysis/heterogeneity",
                params={"outcome": "Overall Survival"},
            )
            assert resp.status_code == 500
            assert "Analysis failed: Unexpected processing exception" in resp.json()["detail"]


class TestGetSensitivityEndpoint:

    def test_get_sensitivity_success(self, client, project):
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
        assert len(data["leave_one_out"]) == 3

    def test_get_sensitivity_project_not_found(self, client):
        response = client.get("/api/projects/nonexistent_proj/analysis/sensitivity?outcome=Mortality")
        assert response.status_code == 404

    def test_get_sensitivity_outcome_not_found(self, client, project):
        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome=NonExistentOutcome")
        assert response.status_code == 400

    def test_get_sensitivity_insufficient_studies(self, client, project):
        outcome = "RareOutcome"
        studies = [
            {"study_label": "Study A", "effect_size": 0.5, "variance": 0.04, "se": 0.2},
            {"study_label": "Study B", "effect_size": 0.8, "variance": 0.05, "se": 0.22},
        ]
        setup_meta_analysis_with_studies(project, outcome, studies)
        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome={outcome}")
        assert response.status_code == 400

    def test_get_sensitivity_missing_query_param(self, client, project):
        response = client.get(f"/api/projects/{project}/analysis/sensitivity")
        assert response.status_code == 422


class TestGetAnalysisProfile:

    def test_get_analysis_profile_success(self, client, project, monkeypatch):
        mock_profile = {
            "n_studies": 5,
            "n_variables": 3,
            "completeness_overall": 92.5,
            "variable_summary": [],
            "outliers": [],
            "missing_matrix": [],
        }
        monkeypatch.setattr(
            "services.analysis_service.profile_extraction_data",
            lambda pid: mock_profile,
        )
        response = client.get(f"/api/projects/{project}/analysis/profile")
        assert response.status_code == 200
        assert response.json()["n_studies"] == 5

    def test_get_analysis_profile_project_not_found(self, client):
        response = client.get("/api/projects/nonexistent-project-id/analysis/profile")
        assert response.status_code == 404


class TestGetVariableStats:

    def test_get_variable_stats_success(self, client, project, monkeypatch):
        mock_stats = {
            "variable_id": "var1",
            "mean": 12.5,
            "median": 12.0,
            "sd": 2.1,
        }
        monkeypatch.setattr(
            "services.analysis_service.compute_descriptive_stats",
            lambda pid, vid: mock_stats,
        )
        response = client.get(f"/api/projects/{project}/analysis/stats/var1")
        assert response.status_code == 200
        assert response.json()["variable_id"] == "var1"

    def test_get_variable_stats_not_found(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_descriptive_stats",
            lambda pid, vid: {"error": "Variable not found"},
        )
        response = client.get(f"/api/projects/{project}/analysis/stats/invalid_var")
        assert response.status_code == 404


class TestReportEndpoints:

    def test_get_full_report_success(self, client, project, monkeypatch):
        mock_report = {"data_profile": {}, "meta_analyses": []}
        monkeypatch.setattr(
            "services.analysis_service.generate_full_report",
            lambda pid: mock_report,
        )
        response = client.get(f"/api/projects/{project}/analysis/report")
        assert response.status_code == 200
        assert response.json() == mock_report

    def test_download_full_report_success(self, client, project, monkeypatch):
        mock_report = {"data_profile": {"a": 1}, "meta_analyses": []}
        monkeypatch.setattr(
            "services.analysis_service.generate_full_report",
            lambda pid: mock_report,
        )
        response = client.get(f"/api/projects/{project}/analysis/report/download")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        data = json.loads(response.text)
        assert data == mock_report


class TestAnalysisAuthorization:

    def test_analysis_endpoints_authorization(self, client):
        # Register owner and create project
        client.post("/api/auth/register", json={"username": "owner_user", "password": "password123"})
        owner_token = client.post("/api/auth/login", json={"username": "owner_user", "password": "password123"}).json()["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        p_res = client.post("/api/projects", json={"name": "Secure Analysis Project"}, headers=owner_headers)
        assert p_res.status_code == 200
        project_id = p_res.json()["project_id"]

        # Register unauthorized user
        client.post("/api/auth/register", json={"username": "unauthorized_user", "password": "password123"})
        unauthorized_token = client.post("/api/auth/login", json={"username": "unauthorized_user", "password": "password123"}).json()["access_token"]
        unauthorized_headers = {"Authorization": f"Bearer {unauthorized_token}"}

        # Verify 403 Forbidden for unauthorized user on all analysis endpoints
        endpoints = [
            f"/api/projects/{project_id}/analysis/descriptive",
            f"/api/projects/{project_id}/analysis/profile",
            f"/api/projects/{project_id}/analysis/stats/v1",
            f"/api/projects/{project_id}/analysis/heterogeneity?outcome=Overall",
            f"/api/projects/{project_id}/analysis/forest-data?outcome=Overall",
            f"/api/projects/{project_id}/analysis/funnel-data?outcome=Overall",
            f"/api/projects/{project_id}/analysis/sensitivity?outcome=Overall",
            f"/api/projects/{project_id}/analysis/outcomes",
            f"/api/projects/{project_id}/analysis/report",
            f"/api/projects/{project_id}/analysis/report/download",
        ]

        for url in endpoints:
            r = client.get(url, headers=unauthorized_headers)
            assert r.status_code == 403, f"Endpoint {url} did not return 403 for unauthorized user"
            assert "Insufficient permissions" in r.json()["detail"]
