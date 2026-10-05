"""Tests for routers/analysis.py — focus on get_heterogeneity endpoint."""
from unittest.mock import patch
import uuid
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
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
    r = client.post("/api/projects", json={"name": "Analysis Test Project"})
    return r.json()["project_id"]


class TestGetHeterogeneity:

    def test_get_heterogeneity_success(self, client, project):
        """Test happy path when valid project and meta-analysis with >= 2 studies exists."""
        # Create meta-analysis record
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

        # Insert study data directly with effect_size and variance set on meta_analysis_studies
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

        # Call get_heterogeneity
        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "Overall Survival"},
        )
        assert resp.status_code == 200
        data = resp.json()

        # Check returned heterogeneity structure
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
        """Test 404 when project does not exist."""
        resp = client.get(
            "/api/projects/nonexistent-project-id/analysis/heterogeneity",
            params={"outcome": "Overall Survival"},
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Project not found"

    def test_get_heterogeneity_outcome_not_found(self, client, project):
        """Test 400 when outcome label does not exist in meta-analyses."""
        resp = client.get(
            f"/api/projects/{project}/analysis/heterogeneity",
            params={"outcome": "Nonexistent Outcome"},
        )
        assert resp.status_code == 400
        assert "No meta-analysis found for outcome" in resp.json()["detail"]

    def test_get_heterogeneity_insufficient_studies(self, client, project):
        """Test 400 when meta-analysis exists but has fewer than 2 studies."""
        # Create meta-analysis with only 1 study
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
        """Test 400 when studies exist but lack numeric effect_size/variance data."""
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
        """Test 422 validation error when 'outcome' query param is omitted."""
        resp = client.get(f"/api/projects/{project}/analysis/heterogeneity")
        assert resp.status_code == 422

    def test_get_heterogeneity_server_error(self, client, project):
        """Test 500 status code when analysis service raises an unexpected exception."""
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
