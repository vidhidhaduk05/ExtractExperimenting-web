import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db

client = TestClient(app)

def test_charts_from_meta_authorization():
    init_db()
    # Insert a project and a meta_analysis record belonging to proj_sec_1
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO projects (project_id, name) VALUES ('proj_sec_1', 'Security Project')")

    results = json.dumps({"studies": [{"name": "Study A", "effect": 1.5, "se": 0.2}]})
    conn.execute(
        """INSERT OR REPLACE INTO meta_analyses
        (meta_id, project_id, outcome_label, pooled_effect, pooled_ci_lower, pooled_ci_upper, results_json)
        VALUES ('meta_sec_1', 'proj_sec_1', 'Outcome Test', 1.2, 0.9, 1.5, ?)""",
        (results,)
    )
    conn.commit()

    # Test when check_project_access raises HTTPException (e.g. 403 Access Denied)
    from fastapi import HTTPException
    def mock_check_access(db, project_id, user, min_role="viewer"):
        if project_id == "proj_sec_1":
            raise HTTPException(status_code=403, detail="Access denied to project")

    with patch("routers.charts.check_project_access", side_effect=mock_check_access):
        # 1. Forest plot endpoint
        resp1 = client.post("/api/charts/forest/from-meta/meta_sec_1")
        assert resp1.status_code == 403
        assert resp1.json()["detail"] == "Access denied to project"

        # 2. Funnel plot endpoint
        resp2 = client.post("/api/charts/funnel/from-meta/meta_sec_1")
        assert resp2.status_code == 403
        assert resp2.json()["detail"] == "Access denied to project"

        # 3. SROC curve endpoint
        resp3 = client.post("/api/charts/sroc/from-meta/meta_sec_1")
        assert resp3.status_code == 403
        assert resp3.json()["detail"] == "Access denied to project"

def test_charts_from_meta_authorized_success():
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO projects (project_id, name) VALUES ('proj_sec_2', 'Allowed Project')")

    results = json.dumps({"studies": [{"name": "Study B", "effect": 1.1, "se": 0.1}]})
    conn.execute(
        """INSERT OR REPLACE INTO meta_analyses
        (meta_id, project_id, outcome_label, pooled_effect, pooled_ci_lower, pooled_ci_upper, results_json)
        VALUES ('meta_sec_2', 'proj_sec_2', 'Outcome Allowed', 1.1, 0.8, 1.4, ?)""",
        (results,)
    )
    conn.commit()

    with patch("routers.charts.check_project_access", return_value=None):
        resp = client.post("/api/charts/forest/from-meta/meta_sec_2")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
