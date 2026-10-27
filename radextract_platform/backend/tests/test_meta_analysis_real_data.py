"""Tests for real-data meta-analysis synthesis without sine-wave fabrication.

Requirements (PHASE 2):
1. No sine-wave fabrication: effect sizes come ONLY from extracted study data.
2. Studies lacking extracted effect data are EXCLUDED from pooling and listed in
   an 'excluded_missing_data' list.
3. Inverse-variance fixed effects + DerSimonian-Laird random effects match
   hand-calculated reference values to 4 decimal places.
4. With 0 extracted studies, an empty state is returned (never fake numbers).
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_file = tmp_path / "test_meta_real.db"
    monkeypatch.setattr(settings, "db_path", str(db_file))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_meta_analysis_empty_state_when_no_extracted_studies(client):
    """When a project has 0 extracted studies, it returns an empty state, never fabricated numbers."""
    r = client.post("/api/projects", json={"name": "Empty Meta Project"})
    assert r.status_code == 200
    project_id = r.json()["project_id"]

    res = client.get(f"/api/meta-analysis/{project_id}?model=random&measure=OR")
    assert res.status_code == 200
    data = res.json()

    # Must NOT return fake 1.48 or 1.42 or fake studies
    assert data["pooled_effect"] is None
    assert data["ci_lower"] is None
    assert data["ci_upper"] is None
    assert len(data["studies"]) == 0
    assert "excluded_missing_data" in data


def test_meta_analysis_hand_computed_pool_reproduces_to_4_decimals(client):
    """Hand-computed 3-study meta-analysis with known DerSimonian-Laird and fixed effects."""
    # 1. Create project
    r = client.post("/api/projects", json={"name": "Hand Computed Meta"})
    assert r.status_code == 200
    project_id = r.json()["project_id"]

    # 2. Add variable for Odds Ratio and CI
    var_res = client.post(f"/api/projects/{project_id}/variables", json={
        "name": "Odds Ratio",
        "section": "Outcomes",
        "field_type": "number",
        "description": "Primary Odds Ratio"
    })
    assert var_res.status_code == 200
    var_or_id = var_res.json()["variable_id"]

    var_ci_low = client.post(f"/api/projects/{project_id}/variables", json={
        "name": "CI Lower",
        "section": "Outcomes",
        "field_type": "number",
        "description": "95% CI Lower Bound"
    }).json()["variable_id"]

    var_ci_high = client.post(f"/api/projects/{project_id}/variables", json={
        "name": "CI Upper",
        "section": "Outcomes",
        "field_type": "number",
        "description": "95% CI Upper Bound"
    }).json()["variable_id"]

    # 3. Create 3 studies with extracted effect data + 1 study with missing data
    # Study 1: OR 1.50, CI [1.0145, 2.2178] (se_ln = 0.20)
    s1 = client.post(f"/api/projects/{project_id}/studies", json={
        "project_id": project_id, "title": "Alpha Study 2021", "authors": "Alpha et al.",
        "publication_year": 2021, "screening_status": "included"
    }).json()["study_id"]
    client.post(f"/api/studies/{s1}/extractions", json={"study_id": s1, "variable_id": var_or_id, "value": "1.50"})
    client.post(f"/api/studies/{s1}/extractions", json={"study_id": s1, "variable_id": var_ci_low, "value": "1.0145"})
    client.post(f"/api/studies/{s1}/extractions", json={"study_id": s1, "variable_id": var_ci_high, "value": "2.2178"})

    # Study 2: OR 1.80, CI [1.1030, 2.9375] (se_ln = 0.25)
    s2 = client.post(f"/api/projects/{project_id}/studies", json={
        "project_id": project_id, "title": "Beta Study 2022", "authors": "Beta et al.",
        "publication_year": 2022, "screening_status": "included"
    }).json()["study_id"]
    client.post(f"/api/studies/{s2}/extractions", json={"study_id": s2, "variable_id": var_or_id, "value": "1.80"})
    client.post(f"/api/studies/{s2}/extractions", json={"study_id": s2, "variable_id": var_ci_low, "value": "1.1030"})
    client.post(f"/api/studies/{s2}/extractions", json={"study_id": s2, "variable_id": var_ci_high, "value": "2.9375"})

    # Study 3: OR 1.20, CI [0.8943, 1.6099] (se_ln = 0.15)
    s3 = client.post(f"/api/projects/{project_id}/studies", json={
        "project_id": project_id, "title": "Gamma Study 2023", "authors": "Gamma et al.",
        "publication_year": 2023, "screening_status": "included"
    }).json()["study_id"]
    client.post(f"/api/studies/{s3}/extractions", json={"study_id": s3, "variable_id": var_or_id, "value": "1.20"})
    client.post(f"/api/studies/{s3}/extractions", json={"study_id": s3, "variable_id": var_ci_low, "value": "0.8943"})
    client.post(f"/api/studies/{s3}/extractions", json={"study_id": s3, "variable_id": var_ci_high, "value": "1.6099"})

    # Study 4: NO extraction data — MUST be excluded from pooling
    s4 = client.post(f"/api/projects/{project_id}/studies", json={
        "project_id": project_id, "title": "Delta Study 2024", "authors": "Delta et al.",
        "publication_year": 2024, "screening_status": "included"
    }).json()["study_id"]

    # 4. Test Random-Effects pooling
    res_re = client.get(f"/api/meta-analysis/{project_id}?model=random&measure=OR")
    assert res_re.status_code == 200
    data_re = res_re.json()
    print("DEBUG DATA_RE:", data_re)

    # Pooled results must reproduce the DerSimonian-Laird calculation to 4 decimals
    assert round(data_re["pooled_effect"], 4) == 1.3901
    assert round(data_re["ci_lower"], 4) == 1.1120
    assert round(data_re["ci_upper"], 4) == 1.7377
    assert round(data_re["q_statistic"], 4) == 2.1736
    assert round(data_re["p_heterogeneity"], 4) == 0.3373
    assert round(data_re["tau_squared"], 4) == 0.0033
    assert round(data_re["i2"], 2) == 7.99

    # Exactly 3 studies included in pooling, 1 excluded
    assert len(data_re["studies"]) == 3
    assert any(s["study_id"] == s4 for s in data_re["excluded_missing_data"])

    # 5. Test Fixed-Effect pooling
    res_fe = client.get(f"/api/meta-analysis/{project_id}?model=fixed&measure=OR")
    assert res_fe.status_code == 200
    data_fe = res_fe.json()

    assert round(data_fe["pooled_effect"], 4) == 1.3822
    assert round(data_fe["ci_lower"], 4) == 1.1183
    assert round(data_fe["ci_upper"], 4) == 1.7083
    assert len(data_fe["studies"]) == 3
    assert any(s["study_id"] == s4 for s in data_fe["excluded_missing_data"])
