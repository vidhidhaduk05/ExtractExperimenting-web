"""Official PRISMA2020 Shiny app sync: field arithmetic, CSV, and prefilled URL."""
import csv
import io
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from config import settings
from database import get_connection, init_db, reset_db
from main import app
from services.prisma2020_sync import (
    build_prisma2020_sync,
    build_shiny_url,
    classify_source,
    render_prisma2020_csv,
    sync_prisma2020,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "prisma2020.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _study(source, status, stage="", reason="", duplicate=0, pdf_status="none"):
    return {
        "source": source,
        "screening_status": status,
        "screening_stage": stage,
        "screening_reason": reason,
        "is_duplicate": duplicate,
        "pdf_status": pdf_status,
    }


def test_classify_source_arms():
    assert classify_source("") == "database"
    assert classify_source("PubMed") == "database"
    assert classify_source("Semantic Scholar") == "database"
    assert classify_source("ClinicalTrials.gov") == "register"
    assert classify_source("Cochrane CENTRAL") == "register"
    assert classify_source("Google Scholar") == "website"
    assert classify_source("Backward citation search") == "citation"
    assert classify_source("WHO organisation website") == "website"


def test_flow_adds_up_across_database_register_and_other_arms():
    studies = [
        _study("PubMed", "pending", "ta", duplicate=1),
        _study("PubMed", "excluded", "ta", "Wrong population"),
        _study("PubMed", "included", "ft"),
        _study("Embase", "excluded", "ta", "Marked ineligible by automation tools"),
        _study("ClinicalTrials.gov", "included", "ft"),
        _study("ClinicalTrials.gov", "awaiting_pdf", "ft"),
        _study("Google Scholar", "excluded", "ta", "Wrong design"),
        _study("Citation searching", "included", "ft"),
        _study("Citation searching", "pending", "ta", duplicate=1),
    ]
    payload = build_prisma2020_sync(studies, meta_studies=2)
    counts = payload["counts"]
    fields = payload["fields"]

    assert counts["database_results"] == 4
    assert counts["register_results"] == 2
    assert counts["duplicates"] == 1
    assert counts["excluded_automatic"] == 1
    assert counts["records_screened"] == 4
    assert counts["records_excluded"] == 1
    assert counts["dbr_sought_reports"] == 3
    assert counts["dbr_notretrieved_reports"] == 1
    assert counts["dbr_assessed"] == 2
    assert counts["new_studies"] == 2
    assert counts["website_results"] == 1
    assert counts["citations_results"] == 1
    assert counts["other_duplicates_omitted"] == 1
    assert counts["other_excluded"] == 1
    assert counts["other_included"] == 1
    assert counts["total_studies"] == 3
    assert counts["total_studies_ma"] == 2

    assert (
        counts["database_results"] + counts["register_results"]
        - counts["duplicates"] - counts["excluded_automatic"]
        == counts["records_screened"]
    )
    assert counts["records_screened"] - counts["records_excluded"] == counts["dbr_sought_reports"]
    assert (
        counts["dbr_sought_reports"] - counts["dbr_notretrieved_reports"]
        == counts["dbr_assessed"]
    )
    assert counts["dbr_assessed"] == counts["new_studies"] + counts["dbr_excluded"]
    assert (
        counts["website_results"] + counts["organisation_results"] + counts["citations_results"]
        == counts["other_sought_reports"]
    )
    assert fields["dbr_excluded"] == "0"
    assert "Title/abstract: Wrong design, 1" == fields["other_excluded"]
    assert "PubMed, 3" in fields["database_specific_results"]
    assert "Embase, 1" in fields["database_specific_results"]
    assert payload["options"] == {
        "previous": 0,
        "other": 1,
        "dbDetail": 1,
        "regDetail": 1,
        "metaAnalysis": 1,
    }
    assert counts["open_dbr"] == 1
    assert any("Reports not retrieved" in note for note in payload["notes"])
    assert any("omitted" in note for note in payload["notes"])


def test_empty_project_hides_optional_arms():
    payload = build_prisma2020_sync([], meta_studies=0)
    assert payload["counts"]["total_studies"] == 0
    assert payload["options"]["other"] == 0
    assert payload["options"]["dbDetail"] == 0
    assert payload["options"]["metaAnalysis"] == 0
    assert payload["fields"]["database_results"] == "0"
    assert payload["notes"] == []


def test_one_imported_unscreened_record_reproduction():
    """Reviewer reproduction test: one imported, unscreened record.
    Identified=1, screened=0, pending=1 — nothing else.
    Must never classify unscreened records as screened or notretrieved.
    """
    studies = [_study("PubMed", "pending", "ta")]
    payload = build_prisma2020_sync(studies, meta_studies=0)
    counts = payload["counts"]
    fields = payload["fields"]

    assert counts["database_results"] == 1
    assert counts["records_screened"] == 0
    assert counts["pending_screening"] == 1
    assert counts["records_excluded"] == 0
    assert counts["dbr_sought_reports"] == 0
    assert counts["dbr_notretrieved_reports"] == 0
    assert counts["dbr_assessed"] == 0
    assert counts["new_studies"] == 0
    assert counts["total_studies"] == 0
    assert fields["records_screened"] == "0"


def test_shiny_url_uses_template_data_names():
    fields = {"database_results": "12", "dbr_excluded": "Wrong population, 3"}
    options = {"previous": 0, "other": 1, "dbDetail": 0, "regDetail": 0, "metaAnalysis": 0}
    url = build_shiny_url(fields, options)
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "estech.shinyapps.io"
    assert parsed.path == "/prisma_flowdiagram/"
    query = parse_qs(parsed.query)
    assert query["database_results"] == ["12"]
    assert query["previous"] == ["0"]
    assert query["other"] == ["1"]
    assert query["dbr_excluded"] == ["Wrong population, 3"]


def test_csv_overwrites_template_n_and_keeps_official_columns():
    payload = build_prisma2020_sync([
        _study("PubMed", "included", "ft"),
        _study("PubMed", "excluded", "ft", "No outcome"),
    ])
    text = render_prisma2020_csv(payload["fields"])
    rows = list(csv.DictReader(io.StringIO(text)))
    by_data = {row["data"]: row for row in rows}
    assert by_data["database_results"]["n"] == "2"
    assert by_data["new_studies"]["n"] == "1"
    assert by_data["dbr_excluded"]["n"] == "No outcome, 1"
    assert by_data["database_results"]["box"] == "box2"
    assert "node" in rows[0]


def test_endpoint_matches_service(client):
    from dependencies import create_access_token
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO users (user_id, username, role, password_hash) VALUES ('u_prisma', 'prisma_user', 'owner', 'hash_test')")
    conn.commit()
    conn.close()

    token = create_access_token(user_id="u_prisma", username="prisma_user", role="owner")
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/api/projects", json={"name": "PRISMA2020 sync"}, headers=headers)
    project_id = created.json()["project_id"]
    added = client.post(f"/api/projects/{project_id}/studies", json={
        "project_id": project_id,
        "title": "Included PubMed study",
        "source": "PubMed",
    }, headers=headers)
    study_id = added.json()["study_id"]
    client.put(f"/api/studies/{study_id}", json={
        "screening_stage": "ft",
        "screening_status": "included",
    }, headers=headers)

    from services.db_backend import SQLiteBackend

    expected = sync_prisma2020(project_id, SQLiteBackend(get_connection()))
    response = client.get(f"/api/projects/{project_id}/prisma/prisma2020", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["counts"] == expected["counts"]
    assert body["shiny_url"].startswith("https://estech.shinyapps.io/prisma_flowdiagram/?")
    assert "database_results=1" in body["shiny_url"]

    csv_response = client.get(f"/api/projects/{project_id}/prisma/prisma2020.csv", headers=headers)
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert b"database_results" in csv_response.content
    assert b",1\n" in csv_response.content or b",1\r\n" in csv_response.content
