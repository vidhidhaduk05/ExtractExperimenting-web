import os
import shutil
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from main import app
from database import get_connection
from routers.projects import REVIEW_LIFECYCLE_SUBDIRS

client = TestClient(app)

def test_create_project_provisions_hpc_storage_and_lifecycle_subfolders():
    payload = {
        "name": "Moyamoya Collaterals Meta-Analysis",
        "description": "Systematic review of moyamoya collateral circulation",
        "hypothesis": "High collateral score correlates with reduced perioperative stroke",
        "research_question": "Does collateral status predict surgical outcome in pediatric moyamoya?",
        "pico_json": "{}"
    }

    res = client.post("/api/projects", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["project_id"]
    assert data["storage_path"]
    
    project_dir = Path(data["storage_path"])
    assert project_dir.exists(), f"Project directory does not exist: {project_dir}"
    assert project_dir.is_dir()

    # Verify all 9 lifecycle subdirectories exist
    for sub in REVIEW_LIFECYCLE_SUBDIRS:
        subdir = project_dir / sub
        assert subdir.exists(), f"Expected lifecycle subfolder missing: {sub}"
        assert subdir.is_dir()

    # Verify database persistence of storage_path
    conn = get_connection()
    try:
        row = conn.execute("SELECT storage_path FROM projects WHERE project_id = ?", (data["project_id"],)).fetchone()
        assert row is not None
        assert row["storage_path"] == data["storage_path"]
    finally:
        conn.close()

    # Clean up created test folder
    shutil.rmtree(project_dir, ignore_errors=True)

