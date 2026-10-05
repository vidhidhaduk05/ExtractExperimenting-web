"""Tests for routers/analysis.py — data profiling and meta-analysis analysis API endpoints."""
import json
import pytest
from unittest.mock import patch, MagicMock
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


class TestGetAnalysisProfile:

    def test_get_analysis_profile_success(self, client, project, monkeypatch):
        mock_report = {
            "project_id": project,
            "total_studies": 5,
            "distributions": {"age": {"mean": 45.0, "std": 10.0}},
            "missing_values": {"age": 0},
            "outliers": [],
            "correlations": {},
        }
        monkeypatch.setattr(
            "services.analysis_service.profile_extraction_data",
            lambda pid: mock_report,
        )

        response = client.get(f"/api/projects/{project}/analysis/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == project
        assert data["total_studies"] == 5
        assert data["distributions"]["age"]["mean"] == 45.0

    def test_get_analysis_profile_project_not_found(self, client):
        response = client.get("/api/projects/nonexistent-project-id/analysis/profile")
        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

    def test_get_analysis_profile_service_error(self, client, project, monkeypatch):
        def raise_exception(pid):
            raise ValueError("Data profiling computation failed")

        monkeypatch.setattr(
            "services.analysis_service.profile_extraction_data",
            raise_exception,
        )

        response = client.get(f"/api/projects/{project}/analysis/profile")
        assert response.status_code == 500
        assert "Analysis failed: Data profiling computation failed" in response.json()["detail"]


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

    def test_get_variable_stats_not_found_error(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_descriptive_stats",
            lambda pid, vid: {"error": "Variable not found"},
        )

        response = client.get(f"/api/projects/{project}/analysis/stats/invalid_var")
        assert response.status_code == 404
        assert response.json()["detail"] == "Variable not found"

    def test_get_variable_stats_project_not_found(self, client):
        response = client.get("/api/projects/nonexistent/analysis/stats/var1")
        assert response.status_code == 404

    def test_get_variable_stats_exception(self, client, project, monkeypatch):
        def raise_err(pid, vid):
            raise RuntimeError("Unexpected stats error")

        monkeypatch.setattr(
            "services.analysis_service.compute_descriptive_stats",
            raise_err,
        )

        response = client.get(f"/api/projects/{project}/analysis/stats/var1")
        assert response.status_code == 500
        assert "Analysis failed: Unexpected stats error" in response.json()["detail"]


class TestHeterogeneityForestFunnelSensitivity:

    def test_get_heterogeneity_success(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_heterogeneity",
            lambda pid, outcome: {"i2": 25.0, "q": 4.2, "tau2": 0.01},
        )
        response = client.get(f"/api/projects/{project}/analysis/heterogeneity?outcome=O1")
        assert response.status_code == 200
        assert response.json()["i2"] == 25.0

    def test_get_heterogeneity_error(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_heterogeneity",
            lambda pid, outcome: {"error": "Insufficient studies"},
        )
        response = client.get(f"/api/projects/{project}/analysis/heterogeneity?outcome=O1")
        assert response.status_code == 400
        assert response.json()["detail"] == "Insufficient studies"

    def test_get_forest_data_success(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.prepare_forest_plot_data",
            lambda pid, outcome: {"studies": [{"label": "S1", "es": 0.5}]},
        )
        response = client.get(f"/api/projects/{project}/analysis/forest-data?outcome=O1")
        assert response.status_code == 200
        assert len(response.json()["studies"]) == 1

    def test_get_forest_data_error(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.prepare_forest_plot_data",
            lambda pid, outcome: {"error": "Outcome not found"},
        )
        response = client.get(f"/api/projects/{project}/analysis/forest-data?outcome=O1")
        assert response.status_code == 400

    def test_get_funnel_data_success(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.prepare_funnel_plot_data",
            lambda pid, outcome: {"points": [{"es": 0.5, "se": 0.1}]},
        )
        response = client.get(f"/api/projects/{project}/analysis/funnel-data?outcome=O1")
        assert response.status_code == 200

    def test_get_funnel_data_error(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.prepare_funnel_plot_data",
            lambda pid, outcome: {"error": "No funnel data"},
        )
        response = client.get(f"/api/projects/{project}/analysis/funnel-data?outcome=O1")
        assert response.status_code == 400

    def test_get_sensitivity_success(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_sensitivity_analysis",
            lambda pid, outcome: {"results": [{"omitted": "S1", "pooled": 0.45}]},
        )
        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome=O1")
        assert response.status_code == 200

    def test_get_sensitivity_error(self, client, project, monkeypatch):
        monkeypatch.setattr(
            "services.analysis_service.compute_sensitivity_analysis",
            lambda pid, outcome: {"error": "Cannot run sensitivity"},
        )
        response = client.get(f"/api/projects/{project}/analysis/sensitivity?outcome=O1")
        assert response.status_code == 400


class TestListOutcomes:

    def test_list_outcomes_empty(self, client, project):
        response = client.get(f"/api/projects/{project}/analysis/outcomes")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_outcomes_with_data(self, client, project):
        client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "Primary Outcome",
            "analysis_type": "generic",
            "effect_measure": "md",
        })
        response = client.get(f"/api/projects/{project}/analysis/outcomes")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["outcome_label"] == "Primary Outcome"


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

    def test_get_full_report_exception(self, client, project, monkeypatch):
        def raise_err(pid):
            raise Exception("Report failed")

        monkeypatch.setattr(
            "services.analysis_service.generate_full_report",
            raise_err,
        )
        response = client.get(f"/api/projects/{project}/analysis/report")
        assert response.status_code == 500
        assert "Report generation failed: Report failed" in response.json()["detail"]

    def test_download_full_report_success(self, client, project, monkeypatch):
        mock_report = {"data_profile": {"a": 1}, "meta_analyses": []}
        monkeypatch.setattr(
            "services.analysis_service.generate_full_report",
            lambda pid: mock_report,
        )
        response = client.get(f"/api/projects/{project}/analysis/report/download")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        assert f'attachment; filename="analysis_report_{project}.json"' in response.headers["content-disposition"]
        data = json.loads(response.text)
        assert data == mock_report

    def test_download_full_report_exception(self, client, project, monkeypatch):
        def raise_err(pid):
            raise Exception("Download generation failed")

        monkeypatch.setattr(
            "services.analysis_service.generate_full_report",
            raise_err,
        )
        response = client.get(f"/api/projects/{project}/analysis/report/download")
        assert response.status_code == 500
        assert "Report generation failed: Download generation failed" in response.json()["detail"]
