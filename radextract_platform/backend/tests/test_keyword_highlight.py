"""Tests for Rayyan-style Keyword Highlighting & Management (Part 11 of Redesign Plan)."""
import json
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings
from services.keyword_highlight_service import (
    extract_pico_highlights,
    find_keyword_matches,
    merge_and_sort_spans,
    resolve_character_spans,
    auto_generate_keywords_from_pico,
    auto_generate_keywords_from_protocol,
)


import pathlib

_TEST_DIR = pathlib.Path(__file__).parent / ".test_tmp"
_TEST_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    test_db = _TEST_DIR / "test_highlight.db"
    monkeypatch.setattr(settings, "db_path", str(test_db))
    monkeypatch.setattr(settings, "upload_root", str(_TEST_DIR / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(_TEST_DIR / "exports"))
    reset_db()
    init_db()
    yield
    reset_db()


@pytest.fixture
def client():
    return TestClient(app)


def test_pico_spans_returned():
    abstract = "In this study, patients with acute ischemic stroke were evaluated using MRI compared with CT. The primary outcome was diagnostic accuracy and sensitivity."
    spans = extract_pico_highlights(abstract)
    assert len(spans) >= 1
    types = [s["type"] for s in spans]
    assert any(t in ("population", "intervention", "comparator", "outcome") for t in types)


def test_include_keyword_highlight():
    abstract = "This was a double-blind, randomized controlled trial of 150 patients."
    keywords = [{"keyword": "randomized", "keyword_type": "include"}, {"keyword": "double-blind", "keyword_type": "include"}]
    spans = find_keyword_matches(abstract, keywords)
    assert len(spans) == 2
    for s in spans:
        assert s["color"] == "green"
        assert s["type"] == "include_keyword"


def test_exclude_keyword_highlight():
    abstract = "This is a case report of a rare complication."
    keywords = [{"keyword": "case report", "keyword_type": "exclude"}]
    spans = find_keyword_matches(abstract, keywords)
    assert len(spans) == 1
    assert spans[0]["color"] == "red"
    assert spans[0]["type"] == "exclude_keyword"


def test_ai_keywords_from_screening(client):
    p_resp = client.post("/api/projects", json={"name": "Keyword Highlight Project"})
    pid = p_resp.json()["project_id"]

    s_resp = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Study of Stroke Imaging",
        "abstract": "Patients with acute stroke were randomized to receive MRI scanning.",
    })
    sid = s_resp.json()["study_id"]

    # Call highlights endpoint
    r = client.get(f"/api/studies/{sid}/abstract-highlights")
    assert r.status_code == 200
    data = r.json()
    assert data["study_id"] == sid
    assert len(data["all_spans"]) >= 1


def test_merged_spans_sorted_by_position():
    spans1 = [{"start": 10, "end": 20, "type": "population", "color": "purple", "label": "P"}]
    spans2 = [{"start": 5, "end": 15, "type": "include_keyword", "color": "green", "label": "K"}]
    merged = merge_and_sort_spans(spans1, spans2)
    assert merged[0]["start"] <= merged[1]["start"]


def test_overlapping_spans_handled():
    spans1 = [{"start": 10, "end": 30, "type": "population", "color": "purple", "label": "P"}]
    spans2 = [{"start": 15, "end": 25, "type": "include_keyword", "color": "green", "label": "K"}]
    merged = merge_and_sort_spans(spans1, spans2)
    assert len(merged) == 2


def test_no_abstract_returns_empty(client):
    p_resp = client.post("/api/projects", json={"name": "No Abstract Project"})
    pid = p_resp.json()["project_id"]

    s_resp = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Title Only Study",
        "abstract": "",
    })
    sid = s_resp.json()["study_id"]

    r = client.get(f"/api/studies/{sid}/abstract-highlights")
    assert r.status_code == 200
    data = r.json()
    assert data["all_spans"] == []


def test_add_screening_keyword(client):
    p_resp = client.post("/api/projects", json={"name": "Add Keyword Project"})
    pid = p_resp.json()["project_id"]

    r = client.post(f"/api/projects/{pid}/screening-keywords", json={
        "keyword": "angiography",
        "keyword_type": "include",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["keyword"] == "angiography"
    assert data["keyword_type"] == "include"
    assert data["color"] == "green"


def test_delete_screening_keyword(client):
    p_resp = client.post("/api/projects", json={"name": "Delete Keyword Project"})
    pid = p_resp.json()["project_id"]

    add_r = client.post(f"/api/projects/{pid}/screening-keywords", json={
        "keyword": "ultrasound",
        "keyword_type": "exclude",
    })
    kid = add_r.json()["keyword_id"]

    del_r = client.delete(f"/api/screening-keywords/{kid}")
    assert del_r.status_code == 200
    assert del_r.json()["status"] == "deleted"


def test_auto_generate_keywords_from_pico():
    pico = {
        "population": "Patients with acute stroke and intracranial hemorrhage",
        "intervention": "MRI Diffusion Weighted Imaging",
        "outcome": "Diagnostic sensitivity and specificity",
    }
    result = auto_generate_keywords_from_pico(pico)
    assert len(result["include_keywords"]) > 0
    assert len(result["exclude_keywords"]) > 0
    assert any("randomized" in k.lower() for k in result["include_keywords"])


def test_auto_generate_keywords_from_protocol():
    project_data = {
        "title": "Pure Arterial Malformation Systematic Review",
        "pico": {
            "population": "Patients with pure arterial malformation (PAM). Distinct from rete mirabile, dolichoectasia, and arteriovenous malformation.",
            "study_design": "Case reports, case series, and observational studies.",
        },
        "search_strings": {
            "pubmed": '"pure arterial malformation" OR "PAM" OR "pial arterial malformation"',
        },
        "exclusion_criteria": [
            {"text": "Wrong pathology: arteriovenous malformation, dAVF, or developmental venous anomaly"},
            {"text": "Animal studies or in vitro models"},
        ],
    }
    res = auto_generate_keywords_from_protocol(project_data)
    inc = [k.lower() for k in res["include_keywords"]]
    exc = [k.lower() for k in res["exclude_keywords"]]

    assert "pure arterial malformation" in inc
    assert "pam" in inc
    assert "case report" in inc  # Allowed and included in this protocol!
    assert "case report" not in exc
    assert any("arteriovenous malformation" in x for x in exc)
    assert any("davf" in x for x in exc)


def test_resolve_character_spans_priority():
    text = "Patients with pure arterial malformation treated."
    pico_span = {"start": 0, "end": 40, "type": "population", "color": "purple", "label": "P"}
    kw_span = {"start": 14, "end": 40, "type": "include_keyword", "color": "green", "label": "Include"}

    resolved = resolve_character_spans(text, [pico_span], [kw_span])
    # The keyword should take precedence over the overlapping portion
    assert len(resolved) == 2
    assert resolved[0]["text"] == "Patients with "
    assert resolved[0]["color"] == "purple"
    assert resolved[1]["text"] == "pure arterial malformation"
    assert resolved[1]["color"] == "green"


def test_title_spans_in_abstract_highlights(client):
    p_resp = client.post("/api/projects", json={"name": "Title Highlight Project"})
    pid = p_resp.json()["project_id"]

    client.post(f"/api/projects/{pid}/screening-keywords", json={
        "keyword": "aneurysm",
        "keyword_type": "include",
    })

    s_resp = client.post(f"/api/projects/{pid}/studies", json={
        "project_id": pid,
        "title": "Case of intracranial aneurysm with rupture",
        "abstract": "Patient presented with sudden headache.",
    })
    sid = s_resp.json()["study_id"]

    r = client.get(f"/api/studies/{sid}/abstract-highlights")
    assert r.status_code == 200
    data = r.json()
    assert "title_spans" in data
    assert len(data["title_spans"]) >= 1
    assert data["title_spans"][0]["text"].lower() == "aneurysm"
    assert data["title_spans"][0]["color"] == "green"

