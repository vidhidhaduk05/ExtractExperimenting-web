"""Persistent storage-root setting for the Zotero-style single data directory.

The user picks ONE folder that contains everything — reference PDFs, RIS files,
exports, AND the SQLite database (in a ``database/`` subfolder). One folder =
one complete review. No automatic backup machinery: the user owns their device
and their copies.

The chosen root is saved to ``backend/data/storage_config.json`` (git-ignored)
following the same pattern as ``llm_config_service``, so it survives a restart.
Applying it at import time keeps ``config.settings.storage_root`` and
``config.settings.db_path`` consistent before the database initializes.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Optional

from config import settings

logger = logging.getLogger("radextract.storage_settings")

CONFIG_FILE = Path(__file__).parent.parent / "data" / "storage_config.json"
_LOCK = threading.Lock()


def _load_saved() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except Exception as e:
        logger.warning(f"[StorageSettings] Could not read {CONFIG_FILE}: {e}")
        return {}


def apply_persisted_storage() -> None:
    """Apply the saved storage root (and DB inside it) to the live settings.

    Called once at app startup, before ``init_db()``. If the saved root no
    longer exists on disk it is kept anyway — the folder may be on a drive
    that mounts later; the storage endpoints report ``exists: false``.
    """
    saved = _load_saved()
    root = saved.get("storage_root")
    if root and str(root).strip():
        settings.storage_root = str(root)
        logger.info(f"[StorageSettings] Applied saved storage root: {root}")
    db_in_root = saved.get("db_path")
    if db_in_root and Path(str(db_in_root)).exists():
        settings.db_path = str(db_in_root)
        logger.info(f"[StorageSettings] Applied saved database path: {db_in_root}")


def persist_storage_root(root: str, db_path: Optional[str] = None,
                         previous_root: Optional[str] = None) -> None:
    """Save the storage root (and optional DB path) so it survives restarts.

    ``previous_root`` records where the data lives NOW, so a later
    ``POST /settings/storage/migrate`` knows what to copy from.
    """
    with _LOCK:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = _load_saved()
        payload["storage_root"] = str(root)
        if db_path:
            payload["db_path"] = str(db_path)
        if previous_root is not None:
            payload["previous_storage_root"] = str(previous_root)
        try:
            CONFIG_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"[StorageSettings] Could not persist storage config: {e}")
            raise


def get_previous_storage_root() -> Optional[str]:
    """The root the app served from before the last PUT (None if unknown)."""
    return _load_saved().get("previous_storage_root")


def clear_previous_storage_root() -> None:
    """Forget the previous root after a successful migration."""
    with _LOCK:
        payload = _load_saved()
        if "previous_storage_root" in payload:
            payload.pop("previous_storage_root")
            try:
                CONFIG_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            except Exception as e:
                logger.warning(f"[StorageSettings] Could not update storage config: {e}")


def get_database_dir(root: str) -> Path:
    """The ``database/`` subfolder inside the chosen data directory."""
    return Path(root) / "database"


def get_database_path_in_root(root: str) -> Path:
    return get_database_dir(root) / "radextract.db"

