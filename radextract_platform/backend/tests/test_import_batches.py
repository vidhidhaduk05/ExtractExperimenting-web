"""Unit and integration tests for Import Batches, Scoping, Reconciliation, and Safe Undo."""
import io
import json
import uuid
import pytest
from fastapi.testclient import TestClient

from main import app
from database import get_connection, init_db, reset_db
from models import ImportBatchResponse, ReferenceUploadResponse

SAMPLE_RIS_1 = """TY  - JOUR
TI  - Study Alpha on Intracranial PAM
AU  - Smith, J.
PY  - 2024
DO  - 10.1000/alpha.2024
AB  - This is an abstract for study Alpha describing aneurysm coil embolization.
ER  - 

TY  - JOUR
TI  - Study Beta on Stent-Assisted Coiling
AU  - Johnson, K.
PY  - 2023
DO  - 10.1000/beta.2023
AB  - This is an abstract for study Beta examining clinical outcomes.
ER  - 
"""

SAMPLE_RIS_2 = """TY  - JOUR
TI  - Study Alpha on Intracranial PAM
AU  - Smith, J.
PY  - 2024
DO  - 10.1000/alpha.2024
AB  - Duplicate of study Alpha with identical DOI.
ER  - 

TY  - JOUR
TI  - Study Gamma on Flow Diverter Therapy
AU  - Lee, R.
PY  - 2025
DO  - 10.1000/gamma.2025
AB  - This is an abstract for study Gamma.
ER  - 
"""

MALFORMED_RIS = """TY  - JOUR
TI  - Broken Record Without End
AU  - Unknown
DO  - 10.1000/broken
"""


@pytest.fixture(autouse=True)
def clean_database():
    """Ensure clean database for each test."""
    reset_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def create_test_project(client, name="Test Project"):
    resp = client.post("/api/projects", json={"name": name, "description": "Testing import batches"})
    assert resp.status_code == 200, resp.text
    return resp.json()["project_id"]


def test_empty_project_has_zero_batches_and_zero_studies(client):
    """Empty project must return [] batches and 0 studies with zero demo fallback."""
    pid = create_test_project(client, "Empty Review")

    # 1. Batches endpoint
    resp = client.get(f"/api/projects/{pid}/batches")
    assert resp.status_code == 200
    batches = resp.json()
    assert batches == []

    # 2. Studies endpoint
    studies_resp = client.get(f"/api/projects/{pid}/studies")
    assert studies_resp.status_code == 200
    assert studies_resp.json() == []


def test_valid_reference_import_creates_batch_with_reconciling_counts(client):
    """Upload creates batch entity, assigns intake studies to 'pending' 'ta', and reconciles counts."""
    pid = create_test_project(client, "Alpha Review")

    files = [("files", ("studies_set1.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    resp = client.post(f"/api/projects/{pid}/references/upload", files=files)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["imported_count"] == 2
    assert data["skipped_duplicates"] == 0
    assert data["batch_id"] is not None
    assert len(data["batches"]) == 1

    batch = data["batches"][0]
    assert batch["filename"] == "studies_set1.ris"
    assert batch["imported_count"] == 2
    assert batch["duplicate_count"] == 0
    assert batch["failed_count"] == 0
    assert batch["total_records"] == 2
    assert batch["status"] == "completed"
    assert batch["retained_studies_count"] == 2

    # Verify studies in project
    studies_resp = client.get(f"/api/projects/{pid}/studies")
    studies = studies_resp.json()
    assert len(studies) == 2
    for s in studies:
        assert s["screening_status"] == "pending"
        assert s["screening_stage"] == "ta"
        assert s["import_batch_id"] == batch["batch_id"]

    # Verify batch listing endpoint
    list_resp = client.get(f"/api/projects/{pid}/batches")
    assert list_resp.status_code == 200
    batch_list = list_resp.json()
    assert len(batch_list) == 1
    assert batch_list[0]["batch_id"] == batch["batch_id"]
    assert batch_list[0]["retained_studies_count"] == 2


def test_duplicate_and_shared_study_handling(client):
    """Importing a second batch with a shared record counts 1 added, 1 duplicate, and shares contribution."""
    pid = create_test_project(client, "Multi-Batch Review")

    # Batch 1: Alpha, Beta (2 imported)
    f1 = [("files", ("batch1.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    r1 = client.post(f"/api/projects/{pid}/references/upload", files=f1)
    assert r1.status_code == 200
    b1_id = r1.json()["batch_id"]

    # Batch 2: Alpha (duplicate), Gamma (new)
    f2 = [("files", ("batch2.ris", io.BytesIO(SAMPLE_RIS_2.encode("utf-8")), "text/plain"))]
    r2 = client.post(f"/api/projects/{pid}/references/upload", files=f2)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["imported_count"] == 1
    assert d2["skipped_duplicates"] == 1
    b2_id = d2["batch_id"]

    b2 = d2["batches"][0]
    assert b2["imported_count"] == 1
    assert b2["duplicate_count"] == 1
    assert b2["total_records"] == 2
    assert b2["status"] == "completed"

    # Total active studies in project should be 3 (Alpha, Beta, Gamma)
    studies = client.get(f"/api/projects/{pid}/studies").json()
    assert len(studies) == 3


def test_batch_detail_endpoint(client):
    """Batch detail endpoint returns records with titles, duplicate match reasons, and study_active flags."""
    pid = create_test_project(client, "Detail Review")

    # Upload Batch 1
    f1 = [("files", ("b1.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    b1_id = client.post(f"/api/projects/{pid}/references/upload", files=f1).json()["batch_id"]

    # Upload Batch 2 (with duplicate)
    f2 = [("files", ("b2.ris", io.BytesIO(SAMPLE_RIS_2.encode("utf-8")), "text/plain"))]
    b2_id = client.post(f"/api/projects/{pid}/references/upload", files=f2).json()["batch_id"]

    detail_resp = client.get(f"/api/projects/{pid}/batches/{b2_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()

    assert detail["batch_id"] == b2_id
    assert detail["filename"] == "b2.ris"
    assert len(detail["records"]) == 2

    dup_rec = next(r for r in detail["records"] if r["status"] == "duplicate")
    assert "Study Alpha" in dup_rec["title"]
    assert dup_rec["match_reason"] == "doi"
    assert dup_rec["study_active"] is True

    added_rec = next(r for r in detail["records"] if r["status"] == "added")
    assert "Study Gamma" in added_rec["title"]
    assert added_rec["study_active"] is True


def test_update_batch_source(client):
    """Updating source persists to database and cascades to associated studies."""
    pid = create_test_project(client, "Source Update Review")

    files = [("files", ("studies.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    b_id = client.post(f"/api/projects/{pid}/references/upload", files=files).json()["batch_id"]

    patch_resp = client.patch(
        f"/api/projects/{pid}/batches/{b_id}/source",
        json={"source": "PubMed Central Live"}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["source"] == "PubMed Central Live"

    # Verify batch list returns updated source
    batches = client.get(f"/api/projects/{pid}/batches").json()
    assert batches[0]["source"] == "PubMed Central Live"

    # Verify studies have updated source
    studies = client.get(f"/api/projects/{pid}/studies").json()
    for s in studies:
        assert s["source"] == "PubMed Central Live"


def test_project_isolation(client):
    """Project A cannot access or mutate Project B's batches."""
    p_a = create_test_project(client, "Project A")
    p_b = create_test_project(client, "Project B")

    # Upload to Project A
    files = [("files", ("project_a.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    b_a = client.post(f"/api/projects/{p_a}/references/upload", files=files).json()["batch_id"]

    # Project B cannot view Project A's batch
    resp = client.get(f"/api/projects/{p_b}/batches/{b_a}")
    assert resp.status_code == 404

    # Project B's batch list is empty
    b_list = client.get(f"/api/projects/{p_b}/batches").json()
    assert b_list == []

    # Project B cannot undo Project A's batch
    undo_resp = client.post(f"/api/projects/{p_b}/batches/{b_a}/undo")
    assert undo_resp.status_code == 404


def test_undo_impact_preview_and_atomic_undo(client):
    """Undo impact preview correctly distinguishes exclusive vs shared studies and safely removes them."""
    pid = create_test_project(client, "Undo Test Review")

    # Batch 1: Alpha, Beta (2 studies)
    f1 = [("files", ("batch1.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    b1_id = client.post(f"/api/projects/{pid}/references/upload", files=f1).json()["batch_id"]

    # Batch 2: Alpha (duplicate), Gamma (new)
    f2 = [("files", ("batch2.ris", io.BytesIO(SAMPLE_RIS_2.encode("utf-8")), "text/plain"))]
    b2_id = client.post(f"/api/projects/{pid}/references/upload", files=f2).json()["batch_id"]

    assert len(client.get(f"/api/projects/{pid}/studies").json()) == 3

    # Preview undoing Batch 1:
    # Alpha is shared with Batch 2, so Alpha should be RETAINED.
    # Beta was exclusive to Batch 1, so Beta should be REMOVED.
    preview_resp = client.get(f"/api/projects/{pid}/batches/{b1_id}/undo-preview")
    assert preview_resp.status_code == 200
    preview = preview_resp.json()

    assert preview["can_undo"] is True
    assert preview["studies_to_remove_count"] == 1
    assert "Study Beta" in preview["studies_to_remove"][0]["title"]
    assert preview["studies_retained_count"] == 1
    assert "Study Alpha" in preview["studies_retained"][0]["title"]

    # Execute Undo for Batch 1
    undo_resp = client.post(f"/api/projects/{pid}/batches/{b1_id}/undo")
    assert undo_resp.status_code == 200
    undo_data = undo_resp.json()
    assert undo_data["status"] == "undone"
    assert undo_data["studies_removed_count"] == 1
    assert undo_data["studies_retained_count"] == 1

    # Remaining studies: Alpha (via Batch 2) and Gamma (via Batch 2) = 2 studies
    studies = client.get(f"/api/projects/{pid}/studies").json()
    assert len(studies) == 2
    titles = [s["title"] for s in studies]
    assert any("Study Alpha" in t for t in titles)
    assert any("Study Gamma" in t for t in titles)
    assert not any("Study Beta" in t for t in titles)

    # Batch 1 is marked undone in history
    batches = client.get(f"/api/projects/{pid}/batches").json()
    b1 = next(b for b in batches if b["batch_id"] == b1_id)
    assert b1["status"] == "undone"
    assert b1["undone_at"] is not None

    # Idempotent: repeated undo requests do not fail or alter counts
    undo_repeat = client.post(f"/api/projects/{pid}/batches/{b1_id}/undo")
    assert undo_repeat.status_code == 200
    assert undo_repeat.json()["status"] == "undone"
    assert len(client.get(f"/api/projects/{pid}/studies").json()) == 2


def test_undo_downstream_protection(client):
    """Studies with downstream screening decisions require force=true to undo."""
    pid = create_test_project(client, "Downstream Review")

    files = [("files", ("set1.ris", io.BytesIO(SAMPLE_RIS_1.encode("utf-8")), "text/plain"))]
    b_id = client.post(f"/api/projects/{pid}/references/upload", files=files).json()["batch_id"]

    studies = client.get(f"/api/projects/{pid}/studies").json()
    study_id = studies[0]["study_id"]

    # Add a screening decision directly
    conn = get_connection()
    conn.execute(
        "UPDATE studies SET screening_status = 'included' WHERE study_id = ?",
        (study_id,)
    )
    conn.execute(
        """INSERT INTO screening_decisions
           (decision_id, project_id, study_id, reviewer_id, stage, decision, reason_text, created_at)
           VALUES (?, ?, ?, 'test_reviewer', 'ta', 'included', 'PICO match', datetime('now'))""",
        (str(uuid.uuid4()), pid, study_id)
    )
    conn.commit()
    conn.close()

    # Preview shows downstream work
    preview = client.get(f"/api/projects/{pid}/batches/{b_id}/undo-preview").json()
    assert preview["has_downstream_work"] is True
    assert preview["downstream_work"]["screening_decisions_count"] >= 1

    # Normal undo without force is blocked with 409 Conflict
    undo_resp = client.post(f"/api/projects/{pid}/batches/{b_id}/undo")
    assert undo_resp.status_code == 409
    assert "downstream" in undo_resp.json()["detail"].lower()

    # Undo with force=true succeeds
    force_undo = client.post(f"/api/projects/{pid}/batches/{b_id}/undo?force=true")
    assert force_undo.status_code == 200
    assert force_undo.json()["status"] == "undone"

    # All studies from this batch were removed
    remaining = client.get(f"/api/projects/{pid}/studies").json()
    assert len(remaining) == 0
