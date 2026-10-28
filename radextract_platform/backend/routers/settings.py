"""System settings: AI model / endpoint / key, and the storage data directory."""
from __future__ import annotations

import shutil
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings
from services import llm_config_service
from services import storage_settings_service
from services.storage_manager import ensure_storage_tree, get_projects_root

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Held while the database is copied during a storage migration so the app is
# quiesced (no new writes land mid-copy). SQLite's online backup API keeps the
# copy consistent even if a write sneaks through on another connection.
_MIGRATION_LOCK = threading.Lock()


class LLMConfigUpdate(BaseModel):
    provider: Optional[str] = Field(None, description="'antigravity' | 'local' | 'custom'")
    custom_api_key: Optional[str] = Field(None, description="API key for the local / custom endpoint")
    local_endpoint_url: Optional[str] = Field(None, description="OpenAI-compatible /v1 endpoint")
    local_model_name: Optional[str] = Field(None, description="Model id, e.g. llama3.3")
    antigravity_model: Optional[str] = Field(None, description="Model name for the default gateway")
    antigravity_api_key: Optional[str] = Field(None, description="Optional Gemini key (connection test only)")
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)


class ConnectionTestRequest(BaseModel):
    provider: Optional[str] = None
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None


@router.get("/llm-config")
def get_llm_config():
    """The active AI configuration. Keys are masked."""
    return {"status": "success", "config": llm_config_service.get_active_config(mask_keys=True)}


@router.post("/llm-config")
def update_llm_config(payload: LLMConfigUpdate):
    """Change the AI configuration at runtime (saved to disk, no restart needed)."""
    try:
        updated = llm_config_service.update_active_config(payload.model_dump(exclude_unset=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success", "message": "AI model configuration updated successfully.", "config": updated}


@router.post("/llm-config/reset")
def reset_llm_config():
    """Forget saved settings and go back to the gateway from config.py."""
    try:
        config = llm_config_service.reset_to_defaults()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "success", "message": "Reset to the default AI gateway.", "config": config}


@router.post("/llm-config/test")
async def test_llm_connection(payload: Optional[ConnectionTestRequest] = None):
    """Ping the active or proposed endpoint. Always answers 200; ``success`` says whether it worked."""
    kwargs = payload.model_dump(exclude_unset=True) if payload else {}
    return await llm_config_service.test_connection(**kwargs)


# ═══════════════════════════════════════════════════════════════════════
#  Storage: the single data directory (Zotero-style)
# ═══════════════════════════════════════════════════════════════════════

class StorageRootUpdate(BaseModel):
    storage_root: str = Field(..., description="Absolute path to the data directory")


class StorageMigrateRequest(BaseModel):
    target_root: str = Field(..., description="Absolute path to migrate everything into")


def _storage_payload() -> dict:
    root = Path(settings.storage_root).resolve()
    exists = root.is_dir()
    writable = False
    if exists:
        probe = root / ".write_probe"
        try:
            probe.write_text("probe", encoding="utf-8")
            probe.unlink()
            writable = True
        except OSError:
            writable = False
    try:
        disk_free_gb = round(shutil.disk_usage(str(root)).free / (1024 ** 3), 2)
    except Exception:
        disk_free_gb = None

    project_count = 0
    try:
        from database import get_connection
        conn = get_connection()
        try:
            project_count = conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        finally:
            conn.close()
    except Exception:
        project_count = 0

    db_path = Path(settings.db_path).resolve() if settings.db_path else None
    return {
        "storage_root": str(root),
        "exists": exists,
        "writable": writable,
        "disk_free_gb": disk_free_gb,
        "project_count": project_count,
        "db_path": str(db_path) if db_path else "",
        "db_inside_root": bool(db_path) and str(db_path).startswith(str(root) + "/"),
    }


@router.get("/storage")
def get_storage_settings():
    """Current data directory: where studies live, free space, project count."""
    return {"status": "success", **_storage_payload()}


@router.put("/storage")
def update_storage_settings(payload: StorageRootUpdate):
    """Choose the data directory. Validates BEFORE saving: absolute path,
    created if missing, probe-written. Existing files are NOT moved."""
    raw = payload.storage_root.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="storage_root must not be empty")
    root = Path(raw)
    if not root.is_absolute():
        raise HTTPException(status_code=400, detail=f"Path must be absolute: {raw}")

    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Cannot create folder: {e}")

    probe = root / ".write_probe"
    try:
        probe.write_text("probe", encoding="utf-8")
        probe.unlink()
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Folder is not writable: {e}")

    # Persist first, then point the live settings at the new root and
    # re-initialize the storage tree. Nothing is moved or deleted.
    previous_root = str(Path(settings.storage_root).resolve())
    storage_settings_service.persist_storage_root(str(root), previous_root=previous_root)
    settings.storage_root = str(root)
    ensure_storage_tree()

    return {
        "status": "success",
        "moved_files": False,
        "message": "Existing files stay in the old folder. Use Move to transfer them.",
        **_storage_payload(),
    }


@router.post("/storage/migrate")
def migrate_storage(payload: StorageMigrateRequest):
    """Copy everything (files + database) from the previous root into the target.

    Runs the scripts/migrate_storage.py logic server-side. The database is
    copied with SQLite's online backup API while writes are quiesced. Paths in
    the DB are relative to the storage root, so nothing needs rewriting.
    The old folder is left untouched (never deletes files).
    """
    raw = payload.target_root.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="target_root must not be empty")
    target = Path(raw)
    if not target.is_absolute():
        raise HTTPException(status_code=400, detail=f"Path must be absolute: {raw}")

    previous = storage_settings_service.get_previous_storage_root()
    if not previous:
        raise HTTPException(
            status_code=400,
            detail="No previous folder to move from. Change the folder first, then migrate.",
        )
    source = Path(previous).resolve()
    target_resolved = target.resolve()
    if target_resolved == source:
        raise HTTPException(status_code=400, detail="Target folder is the same as the source folder")
    if str(target_resolved) in str(source) or str(source) in str(target_resolved):
        raise HTTPException(status_code=400, detail="Source and target folders must not overlap")

    try:
        target_resolved.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Cannot create target folder: {e}")

    files_copied = 0
    errors: list[str] = []

    with _MIGRATION_LOCK:
        # 1. Copy the file tree (everything except a live SQLite journal)
        skip_names = {"radextract.db", "radextract.db-wal", "radextract.db-shm", ".write_probe"}
        for src in source.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(source)
            if any(part in skip_names for part in rel.parts):
                continue
            dest = target_resolved / rel
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(src), str(dest))
                files_copied += 1
            except Exception as e:
                errors.append(f"{rel}: {e}")

        # 2. Copy the database (online backup API — WAL-safe, consistent)
        try:
            target_db = storage_settings_service.get_database_path_in_root(str(target_resolved))
            target_db.parent.mkdir(parents=True, exist_ok=True)
            src_conn = sqlite3.connect(str(settings.db_path), timeout=30.0)
            dst_conn = sqlite3.connect(str(target_db), timeout=30.0)
            try:
                with dst_conn:
                    src_conn.backup(dst_conn)
            finally:
                dst_conn.close()
                src_conn.close()
        except Exception as e:
            errors.append(f"database: {e}")
            return {
                "status": "error",
                "files_copied": files_copied,
                "errors": errors,
                **_storage_payload(),
            }

        # 3. Switch over: point settings + persisted config at the new root
        storage_settings_service.persist_storage_root(
            str(target_resolved), db_path=str(target_db)
        )
        storage_settings_service.clear_previous_storage_root()
        settings.storage_root = str(target_resolved)
        settings.db_path = str(target_db)
        ensure_storage_tree()

    return {
        "status": "success",
        "files_copied": files_copied,
        "errors": errors,
        "message": "Everything was copied to the new folder. The old folder is untouched.",
        **_storage_payload(),
    }
