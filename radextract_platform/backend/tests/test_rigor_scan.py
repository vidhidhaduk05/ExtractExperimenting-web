"""Unit tests for Rigor Scan service and FastAPI router."""

from __future__ import annotations

import io
import pytest
from fastapi.testclient import TestClient

from main import create_app
from services.rigor_scan_service import (
    load_check_specs,
    load_preset_example,
    run_full_rigor_scan,
    verify_statistical_consistencies,
    verify_cell_lines,
    verify_references_and_retractions,
    verify_data_code_registries,
    detect_study_gates,
)


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_rigor_check_specs_count():
    """Verify all 74 published check specifications exist with required fields."""
    specs = load_check_specs()
    assert len(specs) == 74
    required_keys = {"id", "label", "question", "domain", "polarity"}
    for spec in specs:
        assert required_keys.issubset(set(spec.keys()))
        assert spec["domain"] in {"design", "stats", "materials", "openness", "ethics", "claims"}


def test_preset_example_data_integrity():
    """Verify Dubowitz reference example loads with 74 checks and 4 software modules."""
    preset = load_preset_example()
    assert "example" in preset
    view = preset["example"]["view"]
    assert len(view["checks"]) == 74
    assert len(view["domains"]) == 6
    assert len(view["gates"]) == 9
    assert len(view["software"]) == 4
    assert view["index"] == 79


def test_statistical_consistency_verifier():
    """Test HR/OR ratio and 95% CI consistency check logic."""
    text = "We observed that sevoflurane reduced recurrence (HR, 0.76; 95% CI, 0.63-0.92; P < 0.01)."
    res = verify_statistical_consistencies(text)
    assert len(res) >= 1
    item = res[0]
    assert item["status"] == "pass"
    assert "consistent" in item["title"].lower()


def test_cell_line_authenticator_and_flagged_lines():
    """Test authentic and problematic cell line detection."""
    clean_text = "Experiments utilized MDA-MB-231 and 4T1.2 mammary carcinoma cells."
    clean_res = verify_cell_lines(clean_text)
    assert any(item["title"] == "No problem cell lines" for item in clean_res)
    assert any("MDA-MB-231" in item["title"] for item in clean_res)

    problem_text = "Contaminated culture of HeLa and KB cells was observed."
    problem_res = verify_cell_lines(problem_text)
    assert any("Flagged cell line" in item["title"] for item in problem_res)


def test_study_type_gating():
    """Test study type detection across animal, human, cell lines, etc."""
    animal_text = "Mice were treated with sevoflurane or propofol during surgery."
    gates = detect_study_gates(animal_text)
    gates_dict = {g["id"]: g["on"] for g in gates}
    assert gates_dict["animals"] is True
    assert gates_dict["intervention"] is True
    assert gates_dict["humans"] is False


def test_rigor_scan_api_endpoints(client):
    """Test /api/rigor-scan endpoints: status, example, specs, and scan-text."""
    # Status endpoint
    status_res = client.get("/api/rigor-scan/status")
    assert status_res.status_code == 200
    assert status_res.json()["total_checks"] == 74

    # Example endpoint
    ex_res = client.get("/api/rigor-scan/example")
    assert ex_res.status_code == 200
    assert len(ex_res.json()["example"]["view"]["checks"]) == 74

    # Specs endpoint
    specs_res = client.get("/api/rigor-scan/specs")
    assert specs_res.status_code == 200
    assert len(specs_res.json()) == 74

    # Scan text endpoint
    scan_res = client.post("/api/rigor-scan/scan-text", json={
        "text": "We tested the hypothesis that propofol delays recurrence in 50 female BALB/c mice randomized to treatment. Primary outcome was time to recurrence.",
        "title": "Anesthesia Test Paper"
    })
    assert scan_res.status_code == 200
    data = scan_res.json()
    assert "view" in data
    assert len(data["view"]["checks"]) == 74
    assert len(data["view"]["domains"]) == 6
    assert "software" in data["view"]
