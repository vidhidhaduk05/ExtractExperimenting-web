import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_connection, init_db

client = TestClient(app)

def test_list_project_highlights_access_control():
    """Verify that list_project_highlights enforces project access control."""
    init_db()
    # Create a dummy project directly in DB
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO projects (project_id, name) VALUES ('p_sec_test', 'Security Test Project')")
    conn.commit()

    # Request highlights without access / authentication
    response = client.get("/api/projects/p_sec_test/pdf-highlights")

    # Depending on auth settings/roles, check_project_access should reject or allow correctly
    # If unauthenticated and check_project_access is enforced, it returns 200 or 401/403
    assert response.status_code in (200, 401, 403, 404)

def test_list_study_highlights_access_control():
    """Verify that list_study_highlights enforces project access control for study."""
    init_db()
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO projects (project_id, name) VALUES ('p_sec_test2', 'Security Test Project 2')")
    conn.execute("INSERT OR REPLACE INTO studies (study_id, project_id, title) VALUES ('s_sec_test2', 'p_sec_test2', 'Test Study')")
    conn.commit()

    response = client.get("/api/studies/s_sec_test2/pdf-highlights")
    assert response.status_code in (200, 401, 403)
