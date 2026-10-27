"""Tests for threshold-based criterion evaluation and single-reviewer screening endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection

client = TestClient(app)


@pytest.fixture
def criteria_test_setup():
    conn = get_connection()
    proj_id = "test_criteria_proj"
    study_id = "test_crit_study_1"

    # Clean up
    conn.execute("DELETE FROM screening_conflicts WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM screening_decisions WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))

    conn.execute(
        "INSERT INTO projects (project_id, name) VALUES (?, ?)",
        (proj_id, "Test Criteria Project"),
    )
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title) VALUES (?, ?, ?)",
        (study_id, proj_id, "Comparative evaluation of deep learning in radiology"),
    )
    conn.commit()

    yield {
        "project_id": proj_id,
        "study_id": study_id,
    }

    conn.execute("DELETE FROM screening_conflicts WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM screening_decisions WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM studies WHERE project_id = ?", (proj_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (proj_id,))
    conn.commit()


def test_default_screening_config_is_single_reviewer(criteria_test_setup):
    pid = criteria_test_setup["project_id"]
    res = client.get(f"/api/projects/{pid}/screening-config")
    assert res.status_code == 200
    data = res.json()
    assert data["n_reviewers"] == 1
    assert data["blind_mode"] is False
    assert data["conflict_mode"] == "single"


def test_get_criteria_seeds_defaults(criteria_test_setup):
    pid = criteria_test_setup["project_id"]
    res = client.get(f"/api/projects/{pid}/criteria")
    assert res.status_code == 200
    data = res.json()
    assert data["project_id"] == pid
    assert len(data["inclusion"]) == 1
    assert len(data["exclusion"]) == 3
    assert data["inclusion"][0]["id"] == "crit_incl_human"
    assert data["inclusion"][0]["threshold"] == 0.80
    assert data["exclusion"][0]["id"] == "crit_excl_animal"
    assert data["exclusion"][0]["threshold"] == 0.90


def test_update_threshold_criteria(criteria_test_setup):
    pid = criteria_test_setup["project_id"]
    new_criteria = [
        {
            "id": "c1",
            "text": "Must have MRI dataset",
            "direction": "inclusion",
            "rule_mode": "strict",
            "threshold": 0.7,
            "score_source": "model",
            "enabled": True,
            "version": 1,
        },
        {
            "id": "c2",
            "text": "Exclude review papers",
            "direction": "exclusion",
            "rule_mode": "strict",
            "threshold": 0.4,
            "score_source": "model",
            "enabled": True,
            "version": 1,
        },
    ]
    put_res = client.put(f"/api/projects/{pid}/threshold-criteria", json={"criteria": new_criteria})
    assert put_res.status_code == 200
    put_data = put_res.json()
    assert len(put_data["criteria"]) == 2
    assert put_data["criteria"][0]["threshold"] == 0.7

    get_res = client.get(f"/api/projects/{pid}/threshold-criteria")
    assert get_res.status_code == 200
    assert len(get_res.json()["criteria"]) == 2


def test_evaluate_study_criteria_endpoint(criteria_test_setup):
    pid = criteria_test_setup["project_id"]
    sid = criteria_test_setup["study_id"]

    # 1. Clear exclusion: animal study score = 0.95 (threshold 0.90)
    eval_res = client.post(
        f"/api/projects/{pid}/criteria/evaluate-study",
        json={
            "study_id": sid,
            "scores": {
                "crit_excl_animal": 0.95,
                "crit_excl_case_report": 0.05,
                "crit_excl_language": 0.0,
                "crit_incl_imaging": 0.92,
            },
        },
    )
    assert eval_res.status_code == 200
    data = eval_res.json()
    assert data["decision"] == "Propose-Exclude"
    assert len(data["fired"]) == 1
    assert data["fired"][0]["criterion"] == "crit_excl_animal"

    # 2. Clear inclusion: all passing, animal = 0.05
    eval_res2 = client.post(
        f"/api/projects/{pid}/criteria/evaluate-study",
        json={
            "study_id": sid,
            "scores": {
                "crit_excl_animal": 0.05,
                "crit_excl_case_report": 0.02,
                "crit_excl_language": 0.0,
                "crit_incl_imaging": 0.95,
            },
        },
    )
    assert eval_res2.status_code == 200
    data2 = eval_res2.json()
    assert data2["decision"] == "Keep for Manual Review"
    assert len(data2["fired"]) == 0


def test_validation_bounds_endpoint(criteria_test_setup):
    pid = criteria_test_setup["project_id"]
    res = client.get(f"/api/projects/{pid}/criteria/validation-bounds?k=0&n=100&alpha=0.05")
    assert res.status_code == 200
    data = res.json()
    assert data["k_false_negatives"] == 0
    assert data["n_samples"] == 100
    assert abs(data["clopper_pearson_upper_bound"] - 0.0295) < 0.001
