"""Tests for batch extraction persistence endpoint."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection

client = TestClient(app)


@pytest.fixture
def test_setup():
    conn = get_connection()
    proj_id = "test_batch_proj"
    study_id = "test_batch_study"
    var_id = "test_batch_var"

    # Clean up
    conn.execute("DELETE FROM audit_log WHERE study_id = ?", (study_id,))
    conn.execute("DELETE FROM extractions WHERE study_id = ?", (study_id,))
    conn.execute("DELETE FROM variables WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))

    # Insert test project, study, and variable
    conn.execute(
        "INSERT INTO projects (project_id, name) VALUES (?, ?)",
        (proj_id, "Test Batch Project")
    )
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title) VALUES (?, ?, ?)",
        (study_id, proj_id, "Test Batch Study")
    )
    conn.execute(
        "INSERT INTO variables (variable_id, project_id, section, name, field_type) VALUES (?, ?, ?, ?, ?)",
        (var_id, proj_id, "Clinical", "Sample Size", "number")
    )
    conn.commit()

    yield {
        "project_id": proj_id,
        "study_id": study_id,
        "variable_id": var_id,
    }

    # Teardown
    conn.execute("DELETE FROM audit_log WHERE study_id = ?", (study_id,))
    conn.execute("DELETE FROM extractions WHERE study_id = ?", (study_id,))
    conn.execute("DELETE FROM variables WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))
    conn.commit()


def test_batch_extraction_insert_and_update(test_setup):
    pid = test_setup["project_id"]
    sid = test_setup["study_id"]
    vid = test_setup["variable_id"]

    # 1. Test Insert
    payload = {
        "cells": [
            {
                "study_id": sid,
                "variable_id": vid,
                "value": "120",
                "evidence_quote": "A cohort of 120 patients was enrolled.",
                "source_page": 3,
                "confidence": 0.95,
                "verification_status": "unverified",
            }
        ]
    }
    res = client.post(f"/api/projects/{pid}/extractions/batch", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["saved_count"] == 1
    assert data["failed_count"] == 0
    assert len(data["details"]) == 1
    assert data["details"][0]["status"] == "inserted"

    # 2. Verify via GET grid
    grid_res = client.get(f"/api/projects/{pid}/extractions/grid")
    assert grid_res.status_code == 200
    grid = grid_res.json()
    assert grid["cells"][sid][vid]["value"] == "120"
    assert grid["cells"][sid][vid]["evidence_quote"] == "A cohort of 120 patients was enrolled."

    # 3. Test Update with verification
    update_payload = {
        "cells": [
            {
                "study_id": sid,
                "variable_id": vid,
                "value": "125",
                "evidence_quote": "A cohort of 125 patients was enrolled.",
                "source_page": 3,
                "confidence": 0.99,
                "verification_status": "verified",
            }
        ]
    }
    res2 = client.post(f"/api/projects/{pid}/extractions/batch", json=update_payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["saved_count"] == 1
    assert data2["details"][0]["status"] == "updated"

    # Verify grid reflection
    grid_res2 = client.get(f"/api/projects/{pid}/extractions/grid")
    grid2 = grid_res2.json()
    assert grid2["cells"][sid][vid]["value"] == "125"
    assert grid2["cells"][sid][vid]["verification_status"] == "verified"


def test_batch_extraction_validation_failure(test_setup):
    pid = test_setup["project_id"]
    payload = {
        "cells": [
            {
                "study_id": "nonexistent_study",
                "variable_id": "nonexistent_var",
                "value": "foo",
            }
        ]
    }
    res = client.post(f"/api/projects/{pid}/extractions/batch", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["saved_count"] == 0
    assert data["failed_count"] == 1
    assert data["details"][0]["status"] == "failed"
