"""Tests for PICO highlighting in screening view (v2.4 feature 5)."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.pico_extractor import extract_pico_spans_from_abstract


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_pico.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


# ── Unit tests for extract_pico_spans_from_abstract ──
# Returns list[dict] with keys: field, start, end, text, confidence, color

def test_extract_population_span():
    """Should detect population terms in abstract."""
    abstract = "This study included 150 patients with suspected appendicitis."
    spans = extract_pico_spans_from_abstract(abstract)
    pop_spans = [s for s in spans if s["field"] == "population"]
    assert len(pop_spans) >= 1


def test_extract_index_test_span():
    """Should detect imaging modality (index test) in abstract."""
    abstract = "All patients underwent CT imaging for diagnosis."
    spans = extract_pico_spans_from_abstract(abstract)
    test_spans = [s for s in spans if s["field"] == "index_test"]
    assert len(test_spans) >= 1


def test_extract_outcome_span():
    """Should detect outcome measures in abstract."""
    abstract = "The sensitivity was 85% and specificity was 90%."
    spans = extract_pico_spans_from_abstract(abstract)
    outcome_spans = [s for s in spans if s["field"] == "outcome"]
    assert len(outcome_spans) >= 1


def test_extract_comparator_span():
    """Should detect comparator terms."""
    abstract = "MRI was compared to ultrasound as the reference standard."
    spans = extract_pico_spans_from_abstract(abstract)
    comp_spans = [s for s in spans if s["field"] == "comparator"]
    assert len(comp_spans) >= 1


def test_word_boundary_ct():
    """CT should not match inside 'suspected'."""
    abstract = "The suspected appendicitis was confirmed by CT scan."
    spans = extract_pico_spans_from_abstract(abstract)
    # CT should be detected as an index_test span
    ct_spans = [s for s in spans if "CT" in s["text"] and s["field"] == "index_test"]
    assert len(ct_spans) >= 1
    # Make sure "suspected" is not matched as a modality
    for s in spans:
        assert "suspected" not in s["text"].lower() or s["text"] == "suspected"


def test_empty_abstract():
    """Empty abstract should return empty spans."""
    spans = extract_pico_spans_from_abstract("")
    assert len(spans) == 0


def test_no_pico_terms():
    """Abstract with no PICO terms should return empty spans."""
    spans = extract_pico_spans_from_abstract("The weather is nice today.")
    assert len(spans) == 0


def test_multiple_modality_spans():
    """Multiple modalities in abstract should all be detected."""
    abstract = "We compared CT, MRI, and ultrasound for detecting liver lesions."
    spans = extract_pico_spans_from_abstract(abstract)
    test_spans = [s for s in spans if s["field"] in ("index_test", "comparator")]
    # The pattern captures the modality plus surrounding text, so check if modalities appear
    all_text = " ".join(s["text"] for s in test_spans)
    assert "CT" in all_text
    assert "MRI" in all_text


def test_span_has_color():
    """Each span should have a color field."""
    abstract = "CT imaging for 100 patients. Sensitivity was 90%."
    spans = extract_pico_spans_from_abstract(abstract)
    for s in spans:
        assert "color" in s
        assert s["color"] is not None
        assert s["color"] != ""


# ── Integration tests ──

def test_pico_highlight_endpoint(client):
    """GET /studies/{id}/pico-highlight should return highlighted spans."""
    r = client.post("/api/projects", json={"name": "PICO Test"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "CT Accuracy",
        "abstract": "This study included 200 patients who underwent CT imaging. "
                    "Sensitivity was 85% and specificity was 92%.",
    })
    sid = r.json()["study_id"]

    r = client.get(f"/api/studies/{sid}/pico-highlight")
    assert r.status_code == 200
    data = r.json()
    assert "spans" in data
    assert len(data["spans"]) >= 2
    assert data["study_id"] == sid


def test_pico_highlight_no_abstract(client):
    """Study without abstract should return empty spans."""
    r = client.post("/api/projects", json={"name": "PICO Test 2"})
    pid = r.json()["project_id"]
    r = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid, "title": "No Abstract", "abstract": "",
    })
    sid = r.json()["study_id"]

    r = client.get(f"/api/studies/{sid}/pico-highlight")
    assert r.status_code == 200
    data = r.json()
    assert len(data["spans"]) == 0
