"""Tests for Plan 2: Review Matrix Bug Fix and Publication-Ready Plots."""
import pytest
from fastapi.testclient import TestClient
import uuid

from main import create_app
from database import get_connection, init_db


@pytest.fixture
def client():
    app = create_app()
    init_db()
    return TestClient(app)


@pytest.fixture
def sample_project(client):
    pid = f"proj_plot_{uuid.uuid4().hex[:6]}"
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO projects (project_id, name, created_by) VALUES (?, ?, ?)",
            (pid, "Plot Verification Project", "plot_tester"),
        )
        # Add an included study
        sid = f"study_plot_{uuid.uuid4().hex[:6]}"
        conn.execute(
            "INSERT INTO studies (study_id, project_id, title, screening_status) VALUES (?, ?, ?, 'included')",
            (sid, pid, "Diagnostic Accuracy of MRI in Acute Appendicitis"),
        )
        # Add a variable
        vid = f"var_plot_{uuid.uuid4().hex[:6]}"
        conn.execute(
            "INSERT INTO variables (variable_id, project_id, name, field_type, section, order_index) VALUES (?, ?, 'sensitivity', 'float', 'Outcome_Level', 1)",
            (vid, pid),
        )
        # Add an extraction
        eid = f"ext_plot_{uuid.uuid4().hex[:6]}"
        conn.execute(
            "INSERT INTO extractions (extraction_id, study_id, variable_id, value, confidence) VALUES (?, ?, ?, '0.92', 0.95)",
            (eid, sid, vid),
        )
        conn.commit()
    finally:
        conn.close()
    return pid


class TestReviewMatrixBugFix:
    def test_review_matrix_success(self, client, sample_project):
        """Test GET /api/projects/{id}/review/matrix executes cleanly without SQL errors."""
        res = client.get(f"/api/projects/{sample_project}/review/matrix")
        assert res.status_code == 200
        data = res.json()
        assert "variables" in data
        assert "studies" in data
        assert len(data["studies"]) == 1
        assert len(data["variables"]) == 1

    def test_review_progress_success(self, client, sample_project):
        """Test GET /api/projects/{id}/review/progress executes cleanly without SQL errors."""
        res = client.get(f"/api/projects/{sample_project}/review/progress")
        assert res.status_code == 200
        data = res.json()
        assert data["total_studies"] == 1
        assert data["total_variables"] == 1
        assert data["total_extractions"] == 1
        assert data["completion_pct"] == 100.0


class TestPublicationPlots:
    def test_forest_plot_endpoint(self, client):
        req = {
            "studies": [
                {"name": "Smith 2021", "effect": 2.45, "ci_lower": 1.20, "ci_upper": 4.98, "weight": 25.0},
                {"name": "Johnson 2022", "effect": 1.85, "ci_lower": 0.95, "ci_upper": 3.60, "weight": 35.0},
                {"name": "Lee 2023", "effect": 3.10, "ci_lower": 1.65, "ci_upper": 5.80, "weight": 40.0},
            ],
            "overall_effect": 2.35,
            "ci_lower": 1.55,
            "ci_upper": 3.55,
            "measure": "Odds Ratio (OR)",
            "is_ratio": True,
            "title": "Publication Forest Plot",
        }
        res = client.post("/api/charts/forest", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "png_base64" in data
        assert "svg" in data
        assert "<text" in data["svg"]  # Validates svg.fonttype='none'

    def test_funnel_plot_endpoint(self, client):
        req = {
            "studies": [
                {"effect": 2.45, "se": 0.35},
                {"effect": 1.85, "se": 0.30},
                {"effect": 3.10, "se": 0.28},
            ],
            "overall_effect": 2.35,
            "measure": "Log Odds Ratio",
            "title": "Funnel Plot",
        }
        res = client.post("/api/charts/funnel", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "<text" in data["svg"]

    def test_rob_traffic_light_endpoint(self, client):
        req = {
            "rob_data": [
                {"study_name": "Smith 2021", "D1": "Low", "D2": "Low", "D3": "Some concerns", "D4": "Low", "D5": "Low", "D6": "Low", "D7": "Low", "Overall": "Low"},
                {"study_name": "Johnson 2022", "D1": "High", "D2": "Some concerns", "D3": "High", "D4": "High", "D5": "Low", "D6": "High", "D7": "Some concerns", "Overall": "High"},
            ],
            "title": "RoB 2.0 Summary",
        }
        res = client.post("/api/charts/rob-traffic-light", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "<text" in data["svg"]

    def test_sroc_curve_endpoint(self, client):
        req = {
            "sensitivity": 0.88,
            "specificity": 0.92,
            "ci_lower_sens": 0.82,
            "ci_upper_sens": 0.94,
            "ci_lower_spec": 0.86,
            "ci_upper_spec": 0.96,
            "study_points": [
                {"sensitivity": 0.85, "specificity": 0.90},
                {"sensitivity": 0.91, "specificity": 0.94},
            ],
            "auc": 0.945,
            "title": "SROC Diagnostic Accuracy",
        }
        res = client.post("/api/charts/sroc", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "<text" in data["svg"]

    def test_prisma_flow_endpoint(self, client):
        req = {
            "identification": {"records_identified": 1250, "records_duplicates_removed": 250},
            "screening": {"records_screened": 1000, "records_excluded": 850},
            "eligibility": {"full_text_assessed": 150, "full_text_excluded": 110},
            "included": 40,
            "title": "PRISMA 2020 Flow Diagram",
        }
        res = client.post("/api/charts/prisma", json=req)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "<text" in data["svg"]
