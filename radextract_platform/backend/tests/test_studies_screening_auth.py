"""Tests for studies and screening endpoint authorization controls."""
import pytest
from fastapi.testclient import TestClient

from main import app
from database import get_connection, reset_db, init_db
from config import settings
from dependencies import create_access_token


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_studies_screening_auth.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_studies_and_screening_auth(client):
    """Test that studies and screening endpoints enforce project access control (403 for unauthorized users)."""
    conn = get_connection()

    # 1. Create a project
    pid = "proj_auth_test_100"
    conn.execute(
        "INSERT OR REPLACE INTO projects (project_id, name, pico_json, exclusion_reasons_json) VALUES (?, ?, ?, ?)",
        (pid, "Auth Test Project", "{}", "[]"),
    )

    # 2. Add an owner/member to the project
    owner_id = "user_owner_101"
    conn.execute(
        "INSERT OR REPLACE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        (owner_id, "owner_user", "hashed", "reviewer"),
    )
    conn.execute(
        "INSERT OR REPLACE INTO project_members (member_id, project_id, user_id, role) VALUES (?, ?, ?, ?)",
        (f"{pid}_{owner_id}", pid, owner_id, "owner"),
    )

    # 3. Create a study in the project
    sid = "study_auth_test_200"
    conn.execute(
        "INSERT OR REPLACE INTO studies (study_id, project_id, title, abstract) VALUES (?, ?, ?, ?)",
        (sid, pid, "Sample Study Title", "Sample study abstract for testing."),
    )

    # 4. Create an unauthorized user (not a member of project)
    unauth_id = "user_unauth_102"
    conn.execute(
        "INSERT OR REPLACE INTO users (user_id, username, password_hash, role) VALUES (?, ?, ?, ?)",
        (unauth_id, "unauth_user", "hashed", "reviewer"),
    )

    conn.commit()

    owner_token = create_access_token(user_id=owner_id, username="owner_user", role="reviewer")
    unauth_token = create_access_token(user_id=unauth_id, username="unauth_user", role="reviewer")

    # A. GET /api/projects/{pid}/screening
    res_owner_list = client.get(
        f"/api/projects/{pid}/screening",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert res_owner_list.status_code == 200

    res_unauth_list = client.get(
        f"/api/projects/{pid}/screening",
        headers={"Authorization": f"Bearer {unauth_token}"},
    )
    assert res_unauth_list.status_code == 403

    # B. POST /api/projects/{pid}/screening/batch-upload-pdf
    res_unauth_batch = client.post(
        f"/api/projects/{pid}/screening/batch-upload-pdf",
        headers={"Authorization": f"Bearer {unauth_token}"},
        files=[("files", ("test.pdf", b"%PDF-1.4 dummy", "application/pdf"))],
    )
    assert res_unauth_batch.status_code == 403

    # C. POST /api/studies/{sid}/ai-screen-fulltext
    res_unauth_fulltext = client.post(
        f"/api/studies/{sid}/ai-screen-fulltext",
        headers={"Authorization": f"Bearer {unauth_token}"},
    )
    assert res_unauth_fulltext.status_code == 403

    # D. POST /api/studies/{sid}/ai-screen-title-abstract
    res_unauth_ta = client.post(
        f"/api/studies/{sid}/ai-screen-title-abstract",
        headers={"Authorization": f"Bearer {unauth_token}"},
    )
    assert res_unauth_ta.status_code == 403
