"""Test Clinical STORM & LAYA Multi-Perspective Deliberation Service."""
import pytest
from fastapi.testclient import TestClient

from main import create_app
from services.clinical_storm_service import (
    CLINICAL_PERSONAS,
    run_laya_fast_triage,
    deliberate_study_flaws,
)


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_personas_exist():
    assert len(CLINICAL_PERSONAS) == 4
    roles = [p["role"] for p in CLINICAL_PERSONAS]
    assert "Neurointerventional Radiologist" in roles
    assert "Stroke Neurologist & Neurointensivist" in roles
    assert "Cerebrovascular Neurosurgeon" in roles
    assert "Lead Clinical Trial Biostatistician" in roles


def test_laya_fast_triage_speed_and_keys():
    res = run_laya_fast_triage(
        title="Mechanical Thrombectomy in Pure Arterial Malformations of the Brain",
        abstract="We retrospectively analyzed 12 patients presenting with ischemic symptoms. Recanalization was achieved.",
        topic="acute ischemic stroke & pure arterial malformations"
    )
    assert "flaw_probability" in res
    assert "primary_specialty" in res
    assert "rob_level" in res
    assert 0.0 <= res["flaw_probability"] <= 1.0


def test_deliberate_study_flaws_detects_tici_and_sich_issues():
    res = deliberate_study_flaws(
        title="Retrospective Series of EVT for Acute Ischemic Stroke with Concurrent Pseudoaneurysm",
        abstract="Patients underwent thrombectomy with TICI 2b/3 recanalization. Intracranial hemorrhage occurred in 2 cases without specified criteria.",
        topic="stroke EVT"
    )
    assert res["total_flaws"] >= 2
    flaw_codes = [f["flaw_code"] for f in res["design_flaws"]]
    assert "TICI_POOLED_ENDPOINT" in flaw_codes
    assert "SICH_CRITERIA_UNSPECIFIED" in flaw_codes

    assert len(res["persona_opinions"]) == 4
    assert res["consensus_status"] in ("CRITICAL_FLAW_DETECTED", "QUALIFIED_CONSENSUS")


def test_storm_router_endpoints(client):
    res = client.get("/api/storm/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["total_personas"] == 4

    res = client.get("/api/storm/personas")
    assert res.status_code == 200
    assert len(res.json()) == 4

    deliberate_payload = {
        "title": "A Prospective Cohort of MCA Occlusion",
        "abstract": "Modified TICI 3 recanalization was achieved. Blinded mRS assessment performed at 90 days according to ECASS-III criteria.",
        "topic": "stroke"
    }
    res = client.post("/api/storm/deliberate", json=deliberate_payload)
    assert res.status_code == 200
    out = res.json()
    assert "consensus_status" in out
    assert "persona_opinions" in out
    assert len(out["persona_opinions"]) == 4
