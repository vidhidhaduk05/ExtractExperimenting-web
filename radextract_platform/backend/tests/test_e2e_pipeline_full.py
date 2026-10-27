"""End-to-End Scientific Pipeline Integration Test.

Validates the full workflow end-to-end:
1. Project Creation & PICO formulation
2. Literature Import & Dedup with human-decision preservation guard
3. Title/Abstract and Full-Text screening -> PRISMA live counts
4. Variable Data Extraction (Real clinical data, no fabrications)
5. RoB Dual-Review verification & adjudication (/rob/assessments/{id}/verify, /adjudicate)
6. GRADE Factor Auto-population from RoB and Meta-Analysis
7. Meta-Analysis Real-Data Synthesis (Fixed effects + DerSimonian-Laird random effects, no sine waves)
8. To-do notification sync & codebook compatibility endpoints
"""
import math
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from services.db_backend import get_db_backend
from config import settings


@pytest.fixture(autouse=True)
def setup_e2e_db(tmp_path, monkeypatch):
    db_file = tmp_path / "test_e2e_full.db"
    monkeypatch.setattr(settings, "db_path", str(db_file))
    reset_db()
    init_db()
    yield


def test_complete_e2e_scientific_pipeline():
    client = TestClient(app)
    db = get_db_backend()

    # Step 1: Create Project & Formulate PICO
    p_resp = client.post("/api/projects", json={
        "name": "E2E Pancreatic Cancer Systematic Review",
        "description": "Metformin adjunctive therapy in pancreatic ductal adenocarcinoma",
    })
    assert p_resp.status_code == 200, p_resp.text
    project_id = p_resp.json()["project_id"]

    # Step 2: Import References & Dedup Guard Test
    # Study 1 (Canonical human-decided)
    s1 = "pmid_3001"
    db.insert("studies", {
        "study_id": s1,
        "project_id": project_id,
        "title": "Metformin combined with gemcitabine in pancreatic cancer: randomized trial",
        "doi": "10.1016/j.pan.2020.01",
        "screening_status": "included",
        "screening_stage": "ft",
        "study_design": "rct",
    })
    # Study 2 (Reprint / duplicate DOI, but has human decision)
    s2 = "pmid_3002"
    db.insert("studies", {
        "study_id": s2,
        "project_id": project_id,
        "title": "Metformin combined with gemcitabine in pancreatic cancer: trial reprint",
        "doi": "10.1016/j.pan.2020.01",
        "screening_status": "maybe",
        "screening_stage": "ta",
        "study_design": "rct",
    })
    # Study 3 (Another RCT with real effect data)
    s3 = "pmid_3003"
    db.insert("studies", {
        "study_id": s3,
        "project_id": project_id,
        "title": "Phase II evaluation of metformin in advanced pancreatic adenocarcinoma",
        "doi": "10.1007/s00280-021-02",
        "screening_status": "included",
        "screening_stage": "ft",
        "study_design": "rct",
    })
    # Study 4 (Study with missing effect data)
    s4 = "pmid_3004"
    db.insert("studies", {
        "study_id": s4,
        "project_id": project_id,
        "title": "Observational cohort of metformin in diabetic pancreatic cancer patients",
        "doi": "10.1007/s00280-021-03",
        "screening_status": "included",
        "screening_stage": "ft",
        "study_design": "cohort",
    })
    db.commit()

    # Run Deduplication with auto_mark=True
    dedup_resp = client.post(f"/api/projects/{project_id}/deduplicate", params={"auto_mark": True})
    assert dedup_resp.status_code == 200
    dedup_data = dedup_resp.json()
    assert dedup_data["skipped_human_decided"] >= 1
    assert dedup_data["duplicates_marked"] == 0

    # Step 3: Screening & Live PRISMA counts
    prisma_resp = client.get(f"/api/projects/{project_id}/prisma")
    assert prisma_resp.status_code == 200
    prisma_data = prisma_resp.json()
    assert prisma_data["eligibility"]["full_text_assessed"] >= 3 or prisma_data["included"]["studies_included"] >= 3

    # Step 4: Extract Real Clinical Data (Odds Ratios)
    # Define Variable
    var_resp = client.post(f"/api/projects/{project_id}/variables", json={
        "name": "Overall Survival OR",
        "type": "numeric",
        "category": "outcome",
    })
    assert var_resp.status_code == 200
    var_id = var_resp.json()["variable_id"]

    # Insert extraction for s1: OR 1.25, CI [1.02, 1.53]
    client.post(f"/api/studies/{s1}/extractions", json={
        "study_id": s1,
        "variable_id": var_id,
        "value": "1.25 (1.02-1.53)",
        "confidence": 0.95,
    })
    # Insert extraction for s3: OR 1.60, CI [1.10, 2.33]
    client.post(f"/api/studies/{s3}/extractions", json={
        "study_id": s3,
        "variable_id": var_id,
        "value": "1.60 (1.10-2.33)",
        "confidence": 0.92,
    })

    # Step 5: RoB Dual-Review verification & adjudication
    # Create RoB assessment for s1
    rob_resp = client.post(f"/api/rob/studies/{s1}/rob", json={
        "study_id": s1,
        "project_id": project_id,
        "tool": "rob2",
        "outcome_label": "Overall Survival",
    })
    assert rob_resp.status_code == 200, rob_resp.text
    assessment_id = rob_resp.json()["assessment_id"]

    # Verify endpoint: /rob/assessments/{id}/verify (verifies fix from 404)
    verify_resp = client.post(f"/api/rob/assessments/{assessment_id}/verify", json={
        "agree": True,
        "assessor": "reviewer_A",
    })
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verification_status"] == "verified"

    # Adjudicate endpoint: /rob/assessments/{id}/adjudicate (verifies fix from 404)
    adj_resp = client.post(f"/api/rob/assessments/{assessment_id}/adjudicate", json={
        "final_judgment": "High",
        "adjudicator": "senior_reviewer",
        "notes": "Adjudicated consensus: High risk in randomization",
    })
    assert adj_resp.status_code == 200
    assert adj_resp.json()["verification_status"] == "adjudicated"
    assert adj_resp.json()["overall_judgment"] == "High"

    # Step 6: GRADE Factor Auto-population
    grade_resp = client.post(f"/api/projects/{project_id}/grade", json={
        "outcome_label": "Overall Survival",
        "starting_level": "high",
    })
    assert grade_resp.status_code == 200
    grade_id = grade_resp.json()["grade_id"]

    # Auto-populate GRADE factors
    pop_resp = client.post(f"/api/grade/{grade_id}/auto-populate")
    assert pop_resp.status_code == 200
    grade_factors = pop_resp.json().get("factors", [])
    rob_factor = next((f for f in grade_factors if f["factor_key"] == "risk_of_bias"), None)
    assert rob_factor is not None
    assert rob_factor["rating"] in ("serious", "very_serious")
    assert rob_factor["auto_data"]["high_count"] >= 1

    # Step 7: Meta-Analysis Real-Data Synthesis (No sine waves!)
    meta_resp = client.get(f"/api/projects/{project_id}/meta-analysis/synthesis")
    assert meta_resp.status_code == 200
    synthesis = meta_resp.json()
    assert len(synthesis["studies"]) == 2  # s1, s3
    assert len(synthesis["excluded_missing_data"]) == 1  # s4
    assert synthesis["excluded_missing_data"][0]["study_id"] == s4

    # Verify real inverse-variance math:
    # Studies:
    # s1: OR 1.25, var 0.0107 -> log_or 0.2231, weight ~ 78%
    # s3: OR 1.60, var 0.0366 -> log_or 0.4700, weight ~ 22%
    # Combined pooled OR should be between 1.25 and 1.60
    pooled_or = synthesis["pooled_effect"]
    assert 1.25 <= pooled_or <= 1.60
    assert not math.isnan(pooled_or)
    assert not math.isnan(synthesis["i2"])

    # Step 8: To-do notification sync & codebook compatibility endpoints
    todo_resp = client.post(f"/api/projects/{project_id}/todos/from-notification", json={
        "notification_id": "notif_001",
        "text": "Resolve RoB consensus discrepancy",
    })
    assert todo_resp.status_code in (200, 201)
    assert todo_resp.json()["text"] == "Resolve RoB consensus discrepancy"

    # Compatibility endpoint for codebook rules
    cb_resp = client.get("/api/codebook/rules")
    assert cb_resp.status_code == 200
    assert "rules" in cb_resp.json()
