"""Tests for Rigor Scan service and FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
from main import app
from services.rigor_scan_service import (
    run_full_rigor_scan,
    load_preset_example,
    load_check_specs,
    verify_statistical_consistencies,
    verify_references_and_retractions,
    verify_cell_lines,
    verify_data_code_registries,
)

client = TestClient(app)


def test_rigor_status():
    """Verify rigor scan status endpoint."""
    res = client.get("/api/rigor-scan/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert "local" in data["engine"].lower()
    assert data["total_checks"] >= 61


def test_rigor_example_dataset():
    """Verify full benchmark reference scan loads correctly."""
    res = client.get("/api/rigor-scan/example")
    assert res.status_code == 200
    data = res.json()
    assert "paper" in data
    assert "Dubowitz" in data["paper"]["authors"]
    assert data["completenessIndex"] == 79
    assert data["counts"]["good"] == 47
    assert data["counts"]["mid"] == 2
    assert data["counts"]["bad"] == 12
    assert data["counts"]["na"] == 13
    assert len(data["domains"]) == 6
    assert len(data["checks"]) == 61


def test_rigor_specs():
    """Verify check specifications are available."""
    res = client.get("/api/rigor-scan/specs")
    assert res.status_code == 200
    specs = res.json()
    assert len(specs) >= 61
    first = specs[0]
    assert "id" in first
    assert "domain" in first
    assert "question" in first


def test_statistical_verifier():
    """Verify HR/OR and 95% CI mathematical consistency engine."""
    sample_text = (
        "Disease-free survival was comparable between groups "
        "(hazard ratio: 0.94, 95% CI: 0.68-1.31, p = 0.72)."
    )
    results = verify_statistical_consistencies(sample_text)
    assert len(results) >= 1
    item = results[0]
    assert item["status"] == "pass"
    assert "consistent" in item["title"].lower()
    assert "0.94" in item["meta"]


def test_cell_line_verifier():
    """Verify Cellosaurus validation and contaminated cell line alerts."""
    sample_text = "Experiments were performed using 4T1 mouse mammary carcinoma and contaminated HeLa derivatives."
    results = verify_cell_lines(sample_text)
    assert any("4T1" in c["title"] and c["status"] == "pass" for c in results)
    assert any("HELA" in c["title"].upper() and c["status"] == "bad" for c in results)



def test_scan_text_endpoint():
    """Test full rigor scan on raw manuscript text."""
    sample_text = """
    We hypothesized that propofol confers superior recurrence-free survival compared to sevoflurane.
    Mice were randomly allocated (n = 30 per group). Investigators performing tumor measurements
    were blinded to treatment assignment. Cell line identities were confirmed by short tandem repeat profiling.
    Primary recurrence demonstrated hazard ratio 0.94 (95% CI: 0.68-1.31, p = 0.72).
    Data are available on Figshare: doi: 10.6084/m9.figshare.24108819.
    """
    res = client.post(
        "/api/rigor-scan/scan-text",
        json={"text": sample_text, "title": "Test Anesthesia Trial"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "view" in data
    view = data["view"]
    assert view["paper"]["title"] == "Test Anesthesia Trial"
    assert len(view["checks"]) >= 61
    assert len(view["domains"]) == 6
    assert "counts" in view
    assert "software" in view
    assert len(view["software"]) == 4
