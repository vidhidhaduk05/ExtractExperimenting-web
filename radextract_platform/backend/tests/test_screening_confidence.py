"""Unit and integration tests for AI Screening Confidence & Decision Logic.

Covers:
1. Signal calculation and logistic fusion score_record
2. Sensitivity lower bound calculations
3. Conformal risk control threshold selection
4. Decision state machine (no auto-include, conservative fallback, auto-exclude)
5. Audit sampling determinism
6. Continuous accuracy audit and human reversal feedback loop
7. Calibration and recalibration endpoints
"""
from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient

from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.screening_confidence import (
    PassResult,
    Calibration,
    score_record,
    _sens_lower_bound,
    select_threshold,
    decide,
    is_sampled_for_audit,
    record_human_decision_feedback,
    compute_workload_and_recall,
    recalibrate_project,
    get_calibration,
    save_calibration,
    TARGET_SENSITIVITY,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_confidence.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    monkeypatch.setattr(settings, "jev_mode", "off")
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    from dependencies import create_access_token, create_user
    u = create_user("reviewer_one", "pass", role="owner")
    token = create_access_token(u["user_id"], u["username"], u["role"])
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


def test_score_record_pass_agreement_and_signals():
    cal = Calibration()

    # Pass A and B both agree include with high confidence
    p_inc_agree = score_record(
        PassResult(decision="include", confidence=0.95),
        PassResult(decision="include", confidence=0.95),
        safety_net_flag=False,
        text_len=500,
        cal=cal,
    )
    assert p_inc_agree > 0.90

    # Disagreeing passes (A include, B exclude)
    p_disagree = score_record(
        PassResult(decision="include", confidence=0.80),
        PassResult(decision="exclude", confidence=0.80, criterion_hits={"wrong_population": 0.80}),
        safety_net_flag=False,
        text_len=500,
        cal=cal,
    )
    assert 0.20 < p_disagree < 0.80

    # Pass A and B both agree exclude
    p_excl_agree = score_record(
        PassResult(decision="exclude", confidence=0.92, criterion_hits={"wrong_population": 0.92}),
        PassResult(decision="exclude", confidence=0.92, criterion_hits={"wrong_population": 0.92}),
        safety_net_flag=False,
        text_len=500,
        cal=cal,
    )
    assert p_excl_agree < 0.20

    # Very short text (< 200 chars) pulls probability downward toward uncertainty
    p_short = score_record(
        PassResult(decision="include", confidence=0.95),
        PassResult(decision="include", confidence=0.95),
        safety_net_flag=False,
        text_len=80,
        cal=cal,
    )
    assert p_short < p_inc_agree


def test_sens_lower_bound_statistics():
    # Zero positive records
    assert _sens_lower_bound(0, 1.0) == 0.0

    # Exact Clopper-Pearson: at 50/50, lower bound is ~0.941845, NOT 1.0
    lb_50 = _sens_lower_bound(50, 1.0)
    assert 0.9418 < lb_50 < 0.9419

    # At 100/100, lower bound is 0.05^(1/100) ~ 0.97048
    lb_100_perfect = _sens_lower_bound(100, 1.0)
    assert 0.970 < lb_100_perfect < 0.971

    # At least 149 independent eligible examples with no misses are needed to exceed 0.98
    assert _sens_lower_bound(148, 1.0) < 0.98
    assert _sens_lower_bound(150, 1.0) > 0.98

    # With 99% empirical sensitivity over 100 records
    lb_100 = _sens_lower_bound(100, 0.99)
    assert 0.94 < lb_100 < 0.99

    # With larger sample (500 records), bound is tighter
    lb_500 = _sens_lower_bound(500, 0.99)
    assert lb_500 > lb_100


def test_select_threshold_conformal_risk_control():
    # 1. Under minimum calibration sample (< 50) -> auto-exclusion disabled
    small_records = [{"p_include": 0.95, "human_decision": "included"}] * 30
    cal_small = select_threshold(small_records)
    assert cal_small.t_excl is None
    assert cal_small.n_pos == 30

    # 2. Large calibration sample with high include probabilities
    pos_records = [{"p_include": 0.90 + (i % 10) * 0.01, "human_decision": "included"} for i in range(160)]
    cal_large = select_threshold(pos_records, target=TARGET_SENSITIVITY)
    assert cal_large.t_excl is not None
    assert cal_large.t_excl <= 0.35
    assert cal_large.n_pos == 160


def test_decide_never_auto_includes():
    cal = Calibration(t_include=0.90)

    # Both passes include with high probability -> proposed_include (never 'included')
    status, crit = decide(
        p_include=0.98,
        pass_a=PassResult(decision="include", confidence=0.95),
        pass_b=PassResult(decision="include", confidence=0.95),
        safety_net_flag=False,
        cal=cal,
    )
    assert status == "proposed_include"
    assert status != "included"
    assert crit is None


def test_decide_auto_exclude_rules():
    # 1. Conservative fallback when uncalibrated (cal.t_excl is None)
    uncal = Calibration(t_excl=None)
    status, crit = decide(
        p_include=0.12,
        pass_a=PassResult(decision="exclude", confidence=0.92, criterion_hits={"animal_model": 0.92}),
        pass_b=PassResult(decision="exclude", confidence=0.92, criterion_hits={"animal_model": 0.92}),
        safety_net_flag=False,
        cal=uncal,
    )
    assert status == "auto_excluded"
    assert crit == "animal_model"

    # 2. Safety net flag blocks auto-exclusion even if both passes say exclude
    status_blocked, _ = decide(
        p_include=0.10,
        pass_a=PassResult(decision="exclude", confidence=0.95),
        pass_b=PassResult(decision="exclude", confidence=0.95),
        safety_net_flag=True,
        cal=uncal,
    )
    assert status_blocked == "uncertain"

    # 3. Disagreement routes to uncertain
    status_disagree, _ = decide(
        p_include=0.45,
        pass_a=PassResult(decision="include", confidence=0.80),
        pass_b=PassResult(decision="exclude", confidence=0.80),
        safety_net_flag=False,
        cal=uncal,
    )
    assert status_disagree == "uncertain"


def test_audit_sampling_is_deterministic():
    # Determinism: same study_id always yields same audit boolean
    r1 = is_sampled_for_audit("study_uuid_12345", sample_rate=0.05)
    r2 = is_sampled_for_audit("study_uuid_12345", sample_rate=0.05)
    assert r1 == r2

    # Rate 0.0 always False, 1.0 always True
    assert is_sampled_for_audit("any_id", sample_rate=0.0) is False
    assert is_sampled_for_audit("any_id", sample_rate=1.0) is True


def test_continuous_audit_metrics_and_reversal_feedback():
    conn = get_connection()
    pid = "proj_audit_1"
    conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Audit Project"))

    # Add 10 studies: 6 auto-excluded, 4 pending
    for i in range(10):
        sid = f"study_audit_{i}"
        is_auto = 1 if i < 6 else 0
        status = "excluded" if is_auto else "pending"
        conn.execute(
            """INSERT INTO studies (study_id, project_id, title, screening_status, auto_decision, sampled_audit, ai_p_include)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (sid, pid, f"Study {i}", status, is_auto, 1 if i == 0 else 0, 0.05 if is_auto else 0.50),
        )
    conn.commit()

    # Initial calibration with t_excl = 0.20
    save_calibration(pid, "ta", Calibration(t_excl=0.20))

    metrics = compute_workload_and_recall(pid, stage="ta")
    assert metrics["total_studies"] == 10
    assert metrics["auto_excluded_count"] == 6
    assert metrics["auto_excluded_percentage"] == 60.0
    assert metrics["reversals_count"] == 0
    assert metrics["sampled_audits_count"] == 1

    # Human reviewer re-includes auto-excluded study 0 -> triggers threshold tightening
    tightened = record_human_decision_feedback(pid, "study_audit_0", "included", stage="ta")
    assert tightened is True

    updated_cal = get_calibration(pid, "ta")
    assert updated_cal.t_excl is not None
    assert updated_cal.t_excl < 0.20  # Tightened from 0.20 down to 0.18


def test_calibration_api_endpoints(client):
    # Setup project
    p_resp = client.post("/api/projects", json={"name": "Calibration API Test Project"})
    assert p_resp.status_code == 200
    pid = p_resp.json()["project_id"]

    # 1. GET calibration metrics
    get_res = client.get(f"/api/projects/{pid}/screening-calibration?stage=ta")
    assert get_res.status_code == 200
    data = get_res.json()
    assert "auto_excluded_count" in data
    assert "estimated_minutes_saved" in data
    assert "calibration" in data

    # 2. POST recalibrate
    recal_res = client.post(f"/api/projects/{pid}/screening-calibration/recalibrate?stage=ta")
    assert recal_res.status_code == 200
    recal_data = recal_res.json()
    assert recal_data["project_id"] == pid
    assert "sensitivity_guarantee_met" in recal_data
