"""Storage abstraction layer: local filesystem ↔ S3.

Provides a unified interface for file operations so the platform can
run locally (filesystem) or in production (S3 / Floci S3).

Usage:
    from services.storage_backend import get_storage
    storage = get_storage()
    storage.save_bytes("projects/abc/study1.pdf", pdf_bytes)
    data = storage.get_bytes("projects/abc/study1.pdf")
    path = storage.get_file_path("projects/abc/study1.pdf")  # local path for FileResponse
"""
from __future__ import annotations

import os
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from config import settings


class StorageBackend(ABC):
    """Abstract storage interface."""

    @abstractmethod
    def save_bytes(self, key: str, data: bytes) -> str:
        """Save bytes under key. Returns the key (or path)."""
        ...

    @abstractmethod
    def get_bytes(self, key: str) -> Optional[bytes]:
        """Read bytes for key. Returns None if not found."""
        ...

    @abstractmethod
    def get_file_path(self, key: str) -> Optional[str]:
        """Return a local filesystem path for the file.

        For LocalStorage this is the actual path.
        For S3Storage this downloads to a temp file and returns that path.
        Returns None if the file does not exist.
        """
        ...

    @abstractmethod
    def file_exists(self, key: str) -> bool:
        """Check if a file exists."""
        ...

    @abstractmethod
    def delete_file(self, key: str) -> bool:
        """Delete a file. Returns True if deleted, False if not found."""
        ...

    @abstractmethod
    def get_presigned_url(self, key: str, expiry: int = 3600) -> str:
        """Return a URL for direct access.

        For LocalStorage this returns a relative API path.
        For S3Storage this returns a presigned URL.
        """
        ...


class LocalStorage(StorageBackend):
    """Local filesystem storage — the current default behavior."""

    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _full_path(self, key: str) -> Path:
        resolved_root = self.root.resolve()
        key_norm = key.replace("\\", "/")
        resolved_path = (self.root / key_norm).resolve()
        if not resolved_path.is_relative_to(resolved_root):
            raise ValueError(f"Access denied: path traversal attempt in key '{key}'")
        return resolved_path

    def save_bytes(self, key: str, data: bytes) -> str:
        path = self._full_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    def get_bytes(self, key: str) -> Optional[bytes]:
        path = self._full_path(key)
        if not path.exists():
            return None
        return path.read_bytes()

    def get_file_path(self, key: str) -> Optional[str]:
        path = self._full_path(key)
        if not path.exists():
            return None
        return str(path)

    def file_exists(self, key: str) -> bool:
        return self._full_path(key).exists()

    def delete_file(self, key: str) -> bool:
        path = self._full_path(key)
        if not path.exists():
            return False
        path.unlink()
        return True

    def get_presigned_url(self, key: str, expiry: int = 3600) -> str:
        # For local storage, return an API-relative path
        return f"/api/files/{key}"


class S3Storage(StorageBackend):
    """S3-compatible storage (works with AWS S3 or Floci on localhost:4566)."""

    def __init__(self, bucket: str, endpoint_url: str = "", region: str = "us-east-1"):
        import boto3

        kwargs = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
        if settings.aws_secret_access_key:
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        self._s3 = boto3.client("s3", **kwargs)
        self._bucket = bucket
        self._endpoint_url = endpoint_url

    def save_bytes(self, key: str, data: bytes) -> str:
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=data)
        return key

    def get_bytes(self, key: str) -> Optional[bytes]:
        try:
            resp = self._s3.get_object(Bucket=self._bucket, Key=key)
            return resp["Body"].read()
        except Exception:
            return None

    def get_file_path(self, key: str) -> Optional[str]:
        """Download S3 object to a temp file and return the local path."""
        if not self.file_exists(key):
            return None
        # Use a temp directory that persists for the request lifecycle
        tmp_dir = Path(tempfile.gettempdir()) / "radextract_s3_cache"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        # Preserve extension for FileResponse media type detection
        ext = Path(key).suffix
        tmp_path = tmp_dir / f"{hash(key)}{ext}"
        self._s3.download_file(self._bucket, key, str(tmp_path))
        return str(tmp_path)

    def file_exists(self, key: str) -> bool:
        try:
            self._s3.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def delete_file(self, key: str) -> bool:
        try:
            self._s3.delete_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def get_presigned_url(self, key: str, expiry: int = 3600) -> str:
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expiry,
        )


# ── Factory ──

_storage_instances: dict[str, StorageBackend] = {}


def get_storage(bucket_type: str = "upload") -> StorageBackend:
    """Get the configured storage backend.

    Args:
        bucket_type: "upload" for PDF uploads, "export" for exported files.
    """
    cache_key = f"{settings.storage_backend}:{bucket_type}"
    if cache_key in _storage_instances:
        return _storage_instances[cache_key]

    if settings.storage_backend == "s3":
        bucket = settings.s3_pdf_bucket if bucket_type == "upload" else settings.s3_export_bucket
        backend = S3Storage(
            bucket=bucket,
            endpoint_url=settings.aws_endpoint_url,
            region=settings.aws_region,
        )
    else:
        root = settings.effective_upload_root if bucket_type == "upload" else settings.effective_export_root
        backend = LocalStorage(root=root)

    _storage_instances[cache_key] = backend
    return backend


def init_s3_buckets():
    """Create S3 buckets if they don't exist (called on startup when using S3)."""
    if settings.storage_backend != "s3":
        return
    import boto3

    kwargs = {"region_name": settings.aws_region}
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

    s3 = boto3.client("s3", **kwargs)
    for bucket in [settings.s3_pdf_bucket, settings.s3_export_bucket]:
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception:
            pass  # bucket already exists


def resolve_pdf_path(stored_path: str) -> Optional[str]:
    """Resolve a stored pdf_path from the database to a local file path.

    Handles three cases:
    1. New-style storage key (e.g. "proj123/study456.pdf") — uses storage backend
    2. Old-style absolute path that still exists on disk — returns it directly
    3. Old-style absolute path that no longer exists — tries as a storage key

    Returns None if the file cannot be located.
    """
    if not stored_path:
        return None

    # Case 2: old-style absolute path that still exists
    if os.path.isabs(stored_path) and os.path.exists(stored_path):
        return stored_path

    # Case 1 & 3: treat as a storage key
    storage = get_storage("upload")
    return storage.get_file_path(stored_path)
