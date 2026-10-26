"""Test Clinical STORM & LAYA Multi-Perspective Deliberation Service."""
import pytest
from fastapi.testclient import TestClient

from main import create_app
from services.clinical_storm_service import (
    CLINICAL_PERSONAS,
    run_laya_fast_triage,
    deliberate_study_flaws,
    deliberate_protocol_flaws,
    resolve_personas_for_protocol,
    detect_clinical_domain,
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


def test_dynamic_persona_resolution_breast_imaging():
    """Verify that when a breast imaging topic or ClaimScape data is supplied, roles dynamically change to Breast Specialists."""
    personas = resolve_personas_for_protocol(
        pico={"population": "Women with dense breasts undergoing screening mammography or breast MRI"},
        topic="breast cancer screening with digital breast tomosynthesis"
    )
    assert len(personas) == 4
    roles = [p["role"] for p in personas]
    assert "Breast Imaging Radiologist" in roles
    assert "Breast Surgical Oncologist" in roles
    assert "Medical Oncologist & Breast Trialist" in roles
    assert "Diagnostic Screening & Meta-Analysis Biostatistician" in roles


def test_deliberate_protocol_flaws_breast_imaging():
    """Verify protocol critique and 1-click suggestions for breast imaging."""
    protocol_pico = {
        "population": "Women aged 40-75 presenting for routine screening",
        "index_test": "Digital Breast Tomosynthesis (DBT)",
        "comparator": "",  # Missing comparator
        "outcome": "Diagnostic cancer detection rate and recall rate",  # Missing BI-RADS cutoff
        "study_design": "Prospective cross-sectional diagnostic accuracy"
    }
    res = deliberate_protocol_flaws(
        pico=protocol_pico,
        topic="breast imaging",
        research_question="Does DBT improve cancer detection in breast screening?"
    )
    assert res["domain"] == "breast_imaging"
    assert "Breast Imaging Radiologist" in [p["role"] for p in res["personas"]]
    assert res["total_flaws"] >= 2
    assert res["total_suggestions"] >= 2

    flaw_codes = [f["flaw_code"] for f in res["design_flaws"]]
    assert "BIRADS_CUTOFF_AMBIGUITY" in flaw_codes
    assert "MISSING_COMPARATOR_SPECIFICATION" in flaw_codes

    # Verify actionable suggestions structure for 1-click adoption
    sugg_targets = [s["target_type"] for s in res["suggestions"]]
    assert "pico_outcome" in sugg_targets
    assert "pico_comparator" in sugg_targets


def test_deliberate_protocol_flaws_neurovascular_pam():
    """Verify protocol critique and 1-click suggestions for Neurovascular PAM benchmark."""
    protocol_pico = {
        "population": "Patients with intracranial Pure Arterial Malformations (PAM)",
        "index_test": "Endovascular intervention and parent vessel reconstruction",
        "comparator": "Standard of care",
        "outcome": "Recanalization and symptomatic hemorrhage rate",
        "study_design": "Multicenter observational series"
    }
    criteria = {
        "inclusion": [{"text": "Angiographically confirmed PAM"}],
        "exclusion": []  # Missing AVM/dAVF exclusion
    }
    res = deliberate_protocol_flaws(
        pico=protocol_pico,
        criteria=criteria,
        topic="acute ischemic stroke & pure arterial malformations"
    )
    assert res["domain"] == "neurovascular"
    assert res["total_flaws"] >= 3
    flaw_codes = [f["flaw_code"] for f in res["design_flaws"]]
    assert "TICI_POOLED_ENDPOINT" in flaw_codes
    assert "SICH_CRITERIA_UNSPECIFIED" in flaw_codes
    assert "ANATOMICAL_SHUNT_CONFOUNDING" in flaw_codes

    # Check that suggested text is populated
    for sugg in res["suggestions"]:
        assert len(sugg["suggested_text"]) > 10
        assert sugg["action_label"] != ""


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

    # Test static personas
    res = client.get("/api/storm/personas")
    assert res.status_code == 200
    assert len(res.json()) == 4

    # Test dynamic personas by topic
    res = client.get("/api/storm/personas?topic=breast+cancer+mammography")
    assert res.status_code == 200
    breast_roles = [p["role"] for p in res.json()]
    assert "Breast Imaging Radiologist" in breast_roles

    # Test paper deliberation
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

    # Test protocol deliberation endpoint
    proto_payload = {
        "pico": {
            "population": "Women with suspicious breast lesions",
            "index_test": "Contrast-enhanced mammography (CEM)",
            "comparator": "",
            "outcome": "Diagnostic accuracy without clear cutoff",
            "study_design": "Diagnostic cohort"
        },
        "topic": "breast imaging CEM vs MRI",
        "research_question": "What is the accuracy of CEM in dense breasts?"
    }
    res = client.post("/api/storm/deliberate-protocol", json=proto_payload)
    assert res.status_code == 200
    proto_out = res.json()
    assert proto_out["domain"] == "breast_imaging"
    assert proto_out["rigor_score"] <= 100
    assert len(proto_out["suggestions"]) > 0
    assert len(proto_out["personas"]) == 4
