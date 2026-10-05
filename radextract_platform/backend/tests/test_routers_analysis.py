"""Tests for routers/analysis.py — analysis & statistical router endpoints."""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


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
    r = client.post("/api/projects", json={"name": "Test Analysis Project"})
    return r.json()["project_id"]


class TestGetVariableStats:

    def test_get_variable_stats_success(self, client, project):
        stats_data = {
            "variable_id": "var_123",
            "count": 50,
            "mean": 42.5,
            "std": 5.2,
            "min": 30.0,
            "max": 55.0,
        }
        with patch("services.analysis_service.compute_descriptive_stats", return_value=stats_data):
            r = client.get(f"/api/projects/{project}/analysis/stats/var_123")
            assert r.status_code == 200
            assert r.json() == stats_data

    def test_get_variable_stats_not_found_error_dict(self, client, project):
        error_resp = {"error": "Variable var_999 not found"}
        with patch("services.analysis_service.compute_descriptive_stats", return_value=error_resp):
            r = client.get(f"/api/projects/{project}/analysis/stats/var_999")
            assert r.status_code == 404
            assert r.json()["detail"] == "Variable var_999 not found"

    def test_get_variable_stats_project_not_found(self, client):
        r = client.get("/api/projects/nonexistent_project/analysis/stats/var_123")
        assert r.status_code == 404
        assert r.json()["detail"] == "Project not found"

    def test_get_variable_stats_internal_error(self, client, project):
        with patch("services.analysis_service.compute_descriptive_stats", side_effect=ValueError("Unexpected DB error")):
            r = client.get(f"/api/projects/{project}/analysis/stats/var_123")
            assert r.status_code == 500
            assert "Analysis failed: Unexpected DB error" in r.json()["detail"]


class TestOtherAnalysisEndpoints:

    def test_get_analysis_profile_success(self, client, project):
        profile_data = {"missing": [], "outliers": []}
        with patch("services.analysis_service.profile_extraction_data", return_value=profile_data):
            r = client.get(f"/api/projects/{project}/analysis/profile")
            assert r.status_code == 200
            assert r.json() == profile_data

    def test_get_analysis_profile_project_not_found(self, client):
        r = client.get("/api/projects/nonexistent/analysis/profile")
        assert r.status_code == 404

    def test_get_analysis_profile_error(self, client, project):
        with patch("services.analysis_service.profile_extraction_data", side_effect=RuntimeError("Profile error")):
            r = client.get(f"/api/projects/{project}/analysis/profile")
            assert r.status_code == 500

    def test_get_heterogeneity_success(self, client, project):
        data = {"i_squared": 0.25}
        with patch("services.analysis_service.compute_heterogeneity", return_value=data):
            r = client.get(f"/api/projects/{project}/analysis/heterogeneity?outcome=mortality")
            assert r.status_code == 200
            assert r.json() == data

    def test_get_heterogeneity_error_resp(self, client, project):
        with patch("services.analysis_service.compute_heterogeneity", return_value={"error": "Insufficient data"}):
            r = client.get(f"/api/projects/{project}/analysis/heterogeneity?outcome=mortality")
            assert r.status_code == 400
            assert r.json()["detail"] == "Insufficient data"

    def test_get_forest_data(self, client, project):
        with patch("services.analysis_service.prepare_forest_plot_data", return_value={"studies": []}):
            r = client.get(f"/api/projects/{project}/analysis/forest-data?outcome=mortality")
            assert r.status_code == 200

    def test_get_funnel_data(self, client, project):
        with patch("services.analysis_service.prepare_funnel_plot_data", return_value={"points": []}):
            r = client.get(f"/api/projects/{project}/analysis/funnel-data?outcome=mortality")
            assert r.status_code == 200

    def test_get_sensitivity(self, client, project):
        with patch("services.analysis_service.compute_sensitivity_analysis", return_value={"loo": []}):
            r = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome=mortality")
            assert r.status_code == 200

    def test_list_outcomes(self, client, project):
        r = client.get(f"/api/projects/{project}/analysis/outcomes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_full_report(self, client, project):
        with patch("services.analysis_service.generate_full_report", return_value={"title": "Report"}):
            r = client.get(f"/api/projects/{project}/analysis/report")
            assert r.status_code == 200
            assert r.json()["title"] == "Report"

    def test_download_full_report(self, client, project):
        with patch("services.analysis_service.generate_full_report", return_value={"title": "Report"}):
            r = client.get(f"/api/projects/{project}/analysis/report/download")
            assert r.status_code == 200
            assert "attachment;" in r.headers["Content-Disposition"]
