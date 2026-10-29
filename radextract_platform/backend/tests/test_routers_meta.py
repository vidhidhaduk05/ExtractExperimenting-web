"""Tests for routers/meta.py — meta-analysis API endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_meta_api.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    from dependencies import create_access_token, create_user
    u = create_user("reviewer_meta", "pass", role="owner")
    token = create_access_token(u["user_id"], u["username"], u["role"])
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


@pytest.fixture
def project(client):
    r = client.post("/api/projects", json={"name": "Test"})
    return r.json()["project_id"]


class TestMetaAnalysisCRUD:

    def test_create(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "Diagnostic Accuracy",
            "analysis_type": "diagnostic_accuracy",
            "effect_measure": "md",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["outcome_label"] == "Diagnostic Accuracy"
        assert "meta_id" in data

    def test_list(self, client, project):
        client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic",
        })
        client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O2", "analysis_type": "diagnostic_accuracy",
        })
        r = client.get(f"/api/projects/{project}/meta-analyses")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_detail(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic",
        })
        meta_id = r.json()["meta_id"]
        r = client.get(f"/api/meta-analyses/{meta_id}")
        assert r.status_code == 200
        assert r.json()["meta_id"] == meta_id

    def test_get_nonexistent(self, client):
        r = client.get("/api/meta-analyses/nonexistent")
        assert r.status_code == 404

    def test_delete(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic",
        })
        meta_id = r.json()["meta_id"]
        r = client.delete(f"/api/meta-analyses/{meta_id}")
        assert r.status_code == 200
        r = client.get(f"/api/meta-analyses/{meta_id}")
        assert r.status_code == 404


class TestRunAnalysis:

    def test_run_diagnostic(self, client, project):
        # Create with study data
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "Sensitivity/Specificity",
            "analysis_type": "diagnostic_accuracy",
            "study_data": [
                {"label": "A", "sensitivity": 0.85, "specificity": 0.80, "n_pos": 50, "n_neg": 100},
                {"label": "B", "sensitivity": 0.90, "specificity": 0.85, "n_pos": 60, "n_neg": 120},
                {"label": "C", "sensitivity": 0.78, "specificity": 0.75, "n_pos": 40, "n_neg": 80},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "completed"
        assert "bivariate" in data
        assert data["n_studies"] == 3

    def test_run_generic(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "Mean Difference",
            "analysis_type": "generic",
            "effect_measure": "generic",
            "study_data": [
                {"label": "A", "effect_size": 0.5, "variance": 0.04},
                {"label": "B", "effect_size": 0.8, "variance": 0.05},
                {"label": "C", "effect_size": 0.3, "variance": 0.03},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "completed"
        assert "pooled" in data

    def test_run_too_few_studies(self, client, project):
        # Create without data, then try to run
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic",
        })
        meta_id = r.json()["meta_id"]
        r = client.post(f"/api/meta-analyses/{meta_id}/run")
        assert r.status_code == 200
        assert r.json()["status"] == "cannot_pool"

    def test_run_after_update_studies(self, client, project):
        # Create empty, update studies, then run
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic", "effect_measure": "md",
        })
        meta_id = r.json()["meta_id"]

        # Update studies
        client.put(f"/api/meta-analyses/{meta_id}/studies", json={
            "studies": [
                {"label": "X", "effect_size": 0.4, "variance": 0.03},
                {"label": "Y", "effect_size": 0.6, "variance": 0.04},
            ],
        })

        # Run
        r = client.post(f"/api/meta-analyses/{meta_id}/run")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


class TestPlotEndpoints:

    def test_forest_plot(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic", "effect_measure": "md",
            "study_data": [
                {"label": "A", "effect_size": 0.5, "variance": 0.04},
                {"label": "B", "effect_size": 0.8, "variance": 0.05},
            ],
        })
        meta_id = r.json()["meta_id"]
        r = client.get(f"/api/meta-analyses/{meta_id}/forest-plot")
        assert r.status_code == 200
        assert "image/svg+xml" in r.headers.get("content-type", "")
        assert "<svg" in r.text

    def test_funnel_plot(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic", "effect_measure": "md",
            "study_data": [
                {"label": "A", "effect_size": 0.5, "variance": 0.04},
                {"label": "B", "effect_size": 0.8, "variance": 0.05},
                {"label": "C", "effect_size": 0.3, "variance": 0.03},
            ],
        })
        meta_id = r.json()["meta_id"]
        r = client.get(f"/api/meta-analyses/{meta_id}/funnel-plot")
        assert r.status_code == 200
        assert "<svg" in r.text

    def test_sroc_curve(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "diagnostic_accuracy",
            "study_data": [
                {"label": "A", "sensitivity": 0.85, "specificity": 0.80, "n_pos": 50, "n_neg": 100},
                {"label": "B", "sensitivity": 0.90, "specificity": 0.85, "n_pos": 60, "n_neg": 120},
            ],
        })
        meta_id = r.json()["meta_id"]
        r = client.get(f"/api/meta-analyses/{meta_id}/sroc-curve")
        assert r.status_code == 200
        assert "<svg" in r.text

    def test_plot_not_generated(self, client, project):
        r = client.post(f"/api/projects/{project}/meta-analyses", json={
            "outcome_label": "O1", "analysis_type": "generic",
        })
        meta_id = r.json()["meta_id"]
        r = client.get(f"/api/meta-analyses/{meta_id}/forest-plot")
        assert r.status_code == 404
