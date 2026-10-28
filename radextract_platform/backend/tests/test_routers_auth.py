"""Tests for routers/auth.py — Authentication API endpoints."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_auth_api.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


class TestRegister:

    def test_register_success(self, client):
        r = client.post("/api/auth/register", json={
            "username": "alice",
            "password": "secretpassword123",
            "email": "alice@example.com",
            "role": "reviewer",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"
        assert data["role"] == "reviewer"
        assert "user_id" in data
        assert "password" not in data
        assert "password_hash" not in data

    def test_register_duplicate_username(self, client):
        payload = {
            "username": "bob",
            "password": "password123",
            "email": "bob@example.com",
            "role": "reviewer",
        }
        r1 = client.post("/api/auth/register", json=payload)
        assert r1.status_code == 200

        r2 = client.post("/api/auth/register", json=payload)
        assert r2.status_code == 409
        assert "already exists" in r2.json()["detail"]


class TestLogin:

    def test_login_success(self, client):
        # Register user
        client.post("/api/auth/register", json={
            "username": "carol",
            "password": "password123",
            "email": "carol@example.com",
            "role": "editor",
        })

        # Login with correct credentials
        r = client.post("/api/auth/login", json={
            "username": "carol",
            "password": "password123",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["username"] == "carol"
        assert data["role"] == "editor"
        assert "user_id" in data

    def test_login_invalid_username(self, client):
        r = client.post("/api/auth/login", json={
            "username": "nonexistentuser",
            "password": "password123",
        })
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid credentials"

    def test_login_wrong_password(self, client):
        client.post("/api/auth/register", json={
            "username": "dave",
            "password": "correctpassword",
            "email": "dave@example.com",
            "role": "reviewer",
        })

        r = client.post("/api/auth/login", json={
            "username": "dave",
            "password": "wrongpassword",
        })
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid credentials"


class TestRefreshToken:

    def test_refresh_token_success(self, client):
        # Register & Login
        client.post("/api/auth/register", json={
            "username": "eve",
            "password": "password123",
        })
        login_res = client.post("/api/auth/login", json={
            "username": "eve",
            "password": "password123",
        }).json()

        old_refresh = login_res["refresh_token"]

        # Refresh token
        r = client.post("/api/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["username"] == "eve"
        assert data["refresh_token"] != old_refresh

        # Reuse old refresh token should fail (due to rotation)
        r_old = client.post("/api/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert r_old.status_code == 401
        assert r_old.json()["detail"] == "Invalid or expired refresh token"

    def test_refresh_token_invalid(self, client):
        r = client.post("/api/auth/refresh", json={
            "refresh_token": "invalid_refresh_token_123",
        })
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid or expired refresh token"


class TestMe:

    def test_me_authenticated(self, client):
        # Register & Login
        client.post("/api/auth/register", json={
            "username": "frank",
            "password": "password123",
            "email": "frank@example.com",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "frank",
            "password": "password123",
        }).json()

        token = login_data["access_token"]

        # Request /me with token
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "frank"
        assert data["email"] == "frank@example.com"

    def test_me_unauthenticated(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401

        r_invalid = client.get("/api/auth/me", headers={"Authorization": "Bearer invalidtoken"})
        assert r_invalid.status_code == 401


class TestSessions:

    def test_list_sessions(self, client):
        client.post("/api/auth/register", json={
            "username": "grace",
            "password": "password123",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "grace",
            "password": "password123",
        }).json()

        token = login_data["access_token"]

        r = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        sessions = r.json()
        assert len(sessions) == 1
        assert "session_id" in sessions[0]
        assert "created_at" in sessions[0]
        assert "expires_at" in sessions[0]

    def test_revoke_one_session(self, client):
        client.post("/api/auth/register", json={
            "username": "heidi",
            "password": "password123",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "heidi",
            "password": "password123",
        }).json()

        token = login_data["access_token"]

        # List sessions to get session_id
        sessions = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"}).json()
        session_id = sessions[0]["session_id"]

        # Revoke session
        r = client.delete(f"/api/auth/sessions/{session_id}", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["message"] == "Session revoked"

        # List sessions should now be empty
        sessions_after = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(sessions_after) == 0

    def test_revoke_one_session_not_found(self, client):
        client.post("/api/auth/register", json={
            "username": "ivan",
            "password": "password123",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "ivan",
            "password": "password123",
        }).json()

        token = login_data["access_token"]

        r = client.delete("/api/auth/sessions/nonexistent-session-id", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 404
        assert r.json()["detail"] == "Session not found"

    def test_revoke_all_sessions(self, client):
        client.post("/api/auth/register", json={
            "username": "judy",
            "password": "password123",
        })
        login1 = client.post("/api/auth/login", json={"username": "judy", "password": "password123"}).json()
        login2 = client.post("/api/auth/login", json={"username": "judy", "password": "password123"}).json()

        token = login2["access_token"]

        # Verify 2 active sessions
        sessions = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(sessions) == 2

        # Revoke all
        r = client.delete("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["message"] == "All sessions revoked"

        # Verify 0 active sessions
        sessions_after = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(sessions_after) == 0


class TestLogout:

    def test_logout_success(self, client):
        client.post("/api/auth/register", json={
            "username": "mallory",
            "password": "password123",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "mallory",
            "password": "password123",
        }).json()

        access_token = login_data["access_token"]
        refresh_token = login_data["refresh_token"]

        r = client.post(
            "/api/auth/logout",
            json={"refresh_token": refresh_token},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert r.status_code == 200
        assert r.json()["message"] == "Logged out"

        # Check that refresh token is revoked
        r_ref = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert r_ref.status_code == 401

    def test_logout_invalid_token(self, client):
        client.post("/api/auth/register", json={
            "username": "oscar",
            "password": "password123",
        })
        login_data = client.post("/api/auth/login", json={
            "username": "oscar",
            "password": "password123",
        }).json()

        access_token = login_data["access_token"]

        r = client.post(
            "/api/auth/logout",
            json={"refresh_token": "nonexistent_token"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert r.status_code == 404
        assert r.json()["detail"] == "Session not found"


def test_export_prisma_mermaid_unauthorized(client):
    """Verify that export_prisma_mermaid checks project permissions when project_id is specified for an authenticated user without project access."""
    # Register & Login user
    client.post("/api/auth/register", json={
        "username": "unauthorized_user",
        "password": "password123",
        "email": "unauth@example.com",
    })
    login_data = client.post("/api/auth/login", json={
        "username": "unauthorized_user",
        "password": "password123",
    }).json()

    token = login_data["access_token"]

    r = client.post(
        "/api/scientific-export/prisma-mermaid",
        json={"project_id": "unauthorized-proj-123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
