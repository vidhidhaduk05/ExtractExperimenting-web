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
    auto_generate_keywords_from_pico,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_highlight.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


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
