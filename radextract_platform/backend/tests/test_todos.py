"""Tests for routers/todos.py — Project To-dos API endpoints."""
import uuid
import json
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db, get_connection
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_todos_api.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project(client):
    r = client.post("/api/projects", json={"name": "Systematic Review 2026"})
    assert r.status_code == 200
    return r.json()["project_id"]


@pytest.fixture
def sample_study(project):
    conn = get_connection()
    study_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO studies (study_id, project_id, title, authors, publication_year, pmid, journal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            study_id,
            project,
            "Advanced Neuroimaging in Acute Ischemic Stroke",
            "Smith J et al.",
            2025,
            "39876543",
            "Radiology",
        ),
    )
    conn.commit()
    conn.close()
    return study_id


class TestTodosCRUD:
    def test_create_and_list_manual_todos(self, client, project):
        # 1. Create manual todo
        res = client.post(
            f"/api/projects/{project}/todos",
            json={"text": "Review title/abstract screening inclusion criteria"},
        )
        assert res.status_code == 201
        todo = res.json()
        assert todo["text"] == "Review title/abstract screening inclusion criteria"
        assert todo["done"] is False
        assert todo["source"] == "manual"
        assert todo["study_id"] is None
        todo_id = todo["id"]

        # 2. Create second todo
        res2 = client.post(
            f"/api/projects/{project}/todos",
            json={"text": "Export PRISMA 2020 diagram for journal submission"},
        )
        assert res2.status_code == 201
        todo2 = res2.json()

        # 3. List todos - newest first
        list_res = client.get(f"/api/projects/{project}/todos")
        assert list_res.status_code == 200
        items = list_res.json()
        assert len(items) == 2
        assert items[0]["id"] == todo2["id"]
        assert items[1]["id"] == todo_id

    def test_patch_text_and_toggle_done(self, client, project):
        res = client.post(
            f"/api/projects/{project}/todos",
            json={"text": "Draft protocol hypothesis"},
        )
        todo_id = res.json()["id"]

        # Edit text
        patch_res = client.patch(f"/api/todos/{todo_id}", json={"text": "Finalize protocol hypothesis"})
        assert patch_res.status_code == 200
        assert patch_res.json()["text"] == "Finalize protocol hypothesis"
        assert patch_res.json()["done"] is False

        # Toggle done to True
        tick_res = client.patch(f"/api/todos/{todo_id}", json={"done": True})
        assert tick_res.status_code == 200
        assert tick_res.json()["done"] is True

        # Verify in list
        items = client.get(f"/api/projects/{project}/todos").json()
        assert items[0]["done"] is True

        # Untick done back to False
        untick_res = client.patch(f"/api/todos/{todo_id}", json={"done": False})
        assert untick_res.status_code == 200
        assert untick_res.json()["done"] is False

    def test_delete_todo(self, client, project):
        res = client.post(
            f"/api/projects/{project}/todos",
            json={"text": "Temporary task to discard"},
        )
        todo_id = res.json()["id"]

        del_res = client.delete(f"/api/todos/{todo_id}")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"

        # Verify gone from list
        items = client.get(f"/api/projects/{project}/todos").json()
        assert len(items) == 0

        # Delete again returns 404
        assert client.delete(f"/api/todos/{todo_id}").status_code == 404


class TestStudyAndNotificationTodos:
    def test_study_todo_embeds_joined_fields(self, client, project, sample_study):
        # Create a todo with study source
        res = client.post(
            f"/api/projects/{project}/todos",
            json={
                "text": "Check infarct volume measurement technique",
                "source": "study",
                "study_id": sample_study,
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["source"] == "study"
        assert data["study_id"] == sample_study
        assert data["study_title"] == "Advanced Neuroimaging in Acute Ischemic Stroke"
        assert data["study_pmid"] == "39876543"

        # List returns joined study fields
        items = client.get(f"/api/projects/{project}/todos").json()
        assert len(items) == 1
        assert items[0]["study_title"] == "Advanced Neuroimaging in Acute Ischemic Stroke"
        assert items[0]["study_pmid"] == "39876543"

    def test_todo_from_notification_and_tracks_notification(self, client, project, sample_study):
        # Seed a clarification question
        conn = get_connection()
        q_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO clarification_questions (
                question_id, study_id, project_id, stage, question_type,
                question_text, options_json, context_excerpt, status, is_tracked
            ) VALUES (?, ?, ?, 'ta', 'population_match', ?, '[]', 'Sample text', 'pending', 0)
            """,
            (q_id, sample_study, project, "Is this adult or pediatric cohort?"),
        )
        conn.commit()
        conn.close()

        # Create todo from notification
        res = client.post(
            f"/api/projects/{project}/todos/from-notification",
            json={"notification_id": q_id},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["source"] == "notification"
        assert data["notification_id"] == q_id
        assert data["study_id"] == sample_study
        assert data["study_title"] == "Advanced Neuroimaging in Acute Ischemic Stroke"
        assert "Is this adult or pediatric cohort?" in data["text"]

        # Verify clarification question is now marked as tracked
        clar_res = client.get(f"/api/projects/{project}/clarifications")
        assert clar_res.status_code == 200
        questions = clar_res.json()
        assert len(questions) == 1
        assert questions[0]["is_tracked"] is True


class TestTodosValidation:
    def test_empty_text_rejected(self, client, project):
        res = client.post(f"/api/projects/{project}/todos", json={"text": "   "})
        assert res.status_code == 400

    def test_empty_patch_rejected(self, client, project):
        res = client.post(f"/api/projects/{project}/todos", json={"text": "Valid task"})
        todo_id = res.json()["id"]
        patch_res = client.patch(f"/api/todos/{todo_id}", json={})
        assert patch_res.status_code == 400

    def test_missing_notification_id_rejected(self, client, project):
        res = client.post(
            f"/api/projects/{project}/todos/from-notification",
            json={"notification_id": ""},
        )
        assert res.status_code == 400
