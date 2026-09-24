"""Tests for AWS Serverless Migration (StorageBackend, DBBackend, init_dynamodb_tables, lambda_handler)."""
import io
import os
import uuid
import pytest
from unittest.mock import MagicMock, patch

from config import settings
from services.storage_backend import LocalStorage, S3Storage, get_storage
from services.db_backend import SQLiteBackend, DynamoDBBackend, get_db_backend, init_dynamodb_tables, TABLE_PK


class TestStorageBackend:
    def test_local_storage_lifecycle(self, tmp_path):
        storage = LocalStorage(root=str(tmp_path))
        test_key = "project123/study456.pdf"
        test_content = b"%PDF-1.4 Mock PDF Content For Testing"

        # 1. Upload bytes
        saved_path = storage.save_bytes(test_key, test_content)
        assert os.path.exists(saved_path)
        assert storage.file_exists(test_key) is True

        # 2. Download
        downloaded = storage.get_bytes(test_key)
        assert downloaded == test_content

        # 3. URL/Path resolution
        url = storage.get_presigned_url(test_key)
        assert "study456.pdf" in url

        # 4. Delete
        deleted = storage.delete_file(test_key)
        assert deleted is True
        assert storage.file_exists(test_key) is False

    def test_local_storage_file_obj(self, tmp_path):
        storage = LocalStorage(root=str(tmp_path))
        test_key = "project_obj/study_obj.pdf"
        file_bytes = b"%PDF-1.4 File Object Content"

        saved_path = storage.save_bytes(test_key, file_bytes)
        assert os.path.exists(saved_path)
        assert storage.get_bytes(test_key) == file_bytes

    def test_get_storage_factory(self):
        with patch.object(settings, "storage_backend", "local"):
            backend = get_storage()
            assert isinstance(backend, LocalStorage)


class TestDBBackend:
    def test_sqlite_backend_crud(self, tmp_path, monkeypatch):
        db_file = str(tmp_path / "test_serverless.db")
        monkeypatch.setattr(settings, "db_path", db_file)
        monkeypatch.setattr(settings, "db_backend", "sqlite")
        from database import init_sqlite_db, get_connection
        conn = get_connection()
        init_sqlite_db(conn)
        backend = SQLiteBackend(conn=conn)

        # Insert project
        pid = f"test_proj_{uuid.uuid4().hex[:6]}"
        item = {
            "project_id": pid,
            "name": "Serverless Migration Test",
            "hypothesis": "AI improves radiology review",
            "created_by": "test_user",
        }
        inserted_id = backend.insert("projects", item)
        assert inserted_id == pid

        # Get by id
        fetched = backend.get("projects", pid)
        assert fetched is not None
        assert fetched["name"] == "Serverless Migration Test"

        # Query by field
        results = backend.query("projects", {"created_by": "test_user"})
        assert any(p["project_id"] == pid for p in results)

        # Count
        cnt = backend.count("projects", {"created_by": "test_user"})
        assert cnt >= 1

        # Update
        updated = backend.update("projects", pid, {"name": "Updated Serverless Name"})
        assert updated is True

        # Delete
        deleted = backend.delete("projects", pid)
        assert deleted is True
        assert backend.get("projects", pid) is None

    def test_get_db_backend_factory(self, monkeypatch):
        monkeypatch.setattr(settings, "db_backend", "sqlite")
        backend = get_db_backend()
        assert isinstance(backend, SQLiteBackend)


class TestAwsInit:
    def test_table_definitions_count(self):
        assert len(TABLE_PK) >= 13


class TestLambdaHandler:
    def test_lambda_handler_import(self):
        import lambda_handler
        assert lambda_handler.app is not None
        assert hasattr(lambda_handler, "handler")
