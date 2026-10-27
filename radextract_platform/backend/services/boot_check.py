"""Startup boot self-check, reconciliation, and health report service.

Verifies:
1. All critical packages are importable.
2. SQLite DB is writable, persistent, and using WAL mode.
3. Storage directories (uploads, exports) are present and writable.
4. LLM endpoint status (local Biomni/Ollama or configured gateway).
5. Laya ONNX models directory & weights presence.
6. File lifecycle reconciliation (DB rows vs files on disk).
7. Old exports cleanup (>30 days).
"""
from __future__ import annotations

import os
import sys
import time
import shutil
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import settings

logger = logging.getLogger("radextract.boot_check")

# In-memory storage for startup report
_BOOT_REPORT: Dict[str, Any] = {
    "boot_time": None,
    "status": "pending",
    "checks": {},
    "reconciliation": {},
}


def check_required_packages() -> Dict[str, Any]:
    """Verify that critical requirements can be imported without crashing."""
    packages = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "pydantic": "pydantic",
        "httpx": "httpx",
        "bcrypt": "bcrypt",
        "pypdfium2": "pypdfium2",
        "pdfplumber": "pdfplumber",
        "pymupdf": "fitz",
        "openpyxl": "openpyxl",
        "docx": "docx",
        "reportlab": "reportlab",
        "numpy": "numpy",
        "pandas": "pandas",
    }

    results = {}
    all_ok = True

    # Check jose / jwt specifically
    jwt_ok = False
    jwt_pkg = None
    try:
        import jose
        jwt_ok = True
        jwt_pkg = f"python-jose ({getattr(jose, '__version__', 'installed')})"
    except ImportError:
        try:
            import jwt
            jwt_ok = True
            jwt_pkg = f"PyJWT ({getattr(jwt, '__version__', 'installed')})"
        except ImportError:
            jwt_ok = False

    results["jwt_library"] = {
        "status": "ok" if jwt_ok else "missing",
        "detail": jwt_pkg or "Neither python-jose nor PyJWT found"
    }
    if not jwt_ok:
        all_ok = False

    for name, import_name in packages.items():
        try:
            mod = __import__(import_name)
            ver = getattr(mod, "__version__", "installed")
            results[name] = {"status": "ok", "version": str(ver)}
        except ImportError as e:
            results[name] = {"status": "missing", "error": str(e)}
            all_ok = False

    return {"ok": all_ok, "modules": results}


def check_db_writability() -> Dict[str, Any]:
    """Verify that the database is reachable, persistent, and writable."""
    from database import get_connection

    db_path = Path(settings.db_path).resolve()
    is_scratch = "/tmp" in str(db_path) or "scratch" in str(db_path).lower()

    try:
        conn = get_connection()
        journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        busy_timeout = conn.execute("PRAGMA busy_timeout;").fetchone()[0]
        
        # Test write capability
        conn.execute("CREATE TABLE IF NOT EXISTS _boot_probe (id INTEGER PRIMARY KEY, ts REAL);")
        conn.execute("INSERT INTO _boot_probe (ts) VALUES (?);", (time.time(),))
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM _boot_probe;").fetchone()[0]
        conn.execute("DELETE FROM _boot_probe;")
        conn.commit()
        conn.close()

        return {
            "ok": True,
            "db_path": str(db_path),
            "is_persistent": not is_scratch,
            "journal_mode": str(journal_mode).upper(),
            "busy_timeout_ms": busy_timeout,
            "write_probe_verified": True,
        }
    except Exception as e:
        logger.error(f"[BootCheck] DB writability check failed: {e}")
        return {
            "ok": False,
            "db_path": str(db_path),
            "is_persistent": not is_scratch,
            "error": str(e),
        }


def check_storage_directories() -> Dict[str, Any]:
    """Verify that uploads and exports directories are present and writable."""
    upload_dir = Path(settings.upload_dir).resolve()
    export_dir = Path(settings.export_dir).resolve()

    res = {}
    for label, dir_path in [("uploads", upload_dir), ("exports", export_dir)]:
        try:
            dir_path.mkdir(parents=True, exist_ok=True)
            probe_file = dir_path / f".write_probe_{os.getpid()}_{int(time.time())}"
            probe_file.write_text("ok")
            probe_file.unlink(missing_ok=True)
            res[label] = {"ok": True, "path": str(dir_path), "writable": True}
        except Exception as e:
            res[label] = {"ok": False, "path": str(dir_path), "error": str(e)}

    return {"ok": all(v.get("ok") for v in res.values()), "directories": res}


def check_laya_model() -> Dict[str, Any]:
    """Check whether Laya local ONNX weights exist and are ready for evidence tracing."""
    from services.laya_client import _get_laya_model_dir

    model_dir = _get_laya_model_dir()
    if not model_dir:
        return {
            "ok": False,
            "status": "disabled",
            "message": "Laya ONNX model directory not found; tracing will be visibly marked as disabled.",
            "model_dir": "",
        }

    onnx_file = Path(model_dir) / "laya.onnx"
    weights_file = Path(model_dir) / "laya.onnx.data"

    has_onnx = onnx_file.is_file()
    has_weights = weights_file.is_file()

    if has_onnx:
        return {
            "ok": True,
            "status": "verified",
            "model_dir": str(model_dir),
            "onnx_size_bytes": onnx_file.stat().st_size,
            "has_weights_data": has_weights,
            "message": "Laya System-1 ONNX model ready for verified evidence tracing.",
        }
    return {
        "ok": False,
        "status": "disabled",
        "model_dir": str(model_dir),
        "message": f"laya.onnx not found in {model_dir}; tracing disabled.",
    }


def check_llm_status() -> Dict[str, Any]:
    """Inspect LLM gateway configuration and key presence."""
    has_key = bool(settings.llm_api_key and settings.llm_api_key.strip() and not settings.llm_api_key.startswith("sk-biomni-4f8a"))
    url = settings.llm_api_url
    model = settings.llm_model

    return {
        "ok": True,
        "url": url,
        "model": model,
        "key_present": has_key,
        "provider": settings.llm_provider,
        "note": "Biomni-R0 on GPU endpoint" if "18000" in url else "Remote LLM endpoint",
    }


def reconcile_file_storage() -> Dict[str, Any]:
    """Reconcile DB records with filesystem.
    
    1. If a study claims to have a PDF (pdf_status != 'none') but the file is missing:
       marks pdf_status = 'missing', error_message = 'File missing from storage'.
    2. Moves orphaned files in uploads without any matching study into a quarantine folder.
    """
    from database import get_connection

    upload_dir = Path(settings.upload_dir).resolve()
    quarantine_dir = upload_dir / "quarantine"

    conn = get_connection()
    try:
        rows = conn.execute("SELECT study_id, project_id, pdf_path, pdf_status FROM studies WHERE pdf_status != 'none';").fetchall()
        missing_count = 0
        reconciled_studies = []

        valid_rel_paths = set()

        for r in rows:
            sid = r["study_id"]
            pid = r["project_id"]
            ppath = r["pdf_path"] or f"{pid}/{sid}.pdf"

            # Check full path on disk
            full_path = upload_dir / ppath
            if not full_path.exists():
                # Check directly in upload_dir without project prefix
                alt_path = upload_dir / f"{sid}.pdf"
                if alt_path.exists():
                    full_path = alt_path
                    valid_rel_paths.add(f"{sid}.pdf")
                else:
                    conn.execute(
                        "UPDATE studies SET pdf_status = 'missing', error_message = 'File missing from storage' WHERE study_id = ?;",
                        (sid,)
                    )
                    missing_count += 1
                    reconciled_studies.append(sid)
            else:
                valid_rel_paths.add(ppath)

        if missing_count > 0:
            conn.commit()

        # Identify orphaned files (only scan first-level project dirs and files)
        orphaned_count = 0
        if upload_dir.exists():
            for p in upload_dir.rglob("*.pdf"):
                if "quarantine" in p.parts:
                    continue
                rel = str(p.relative_to(upload_dir))
                if rel not in valid_rel_paths:
                    # Check if filename is a study_id
                    sid_candidate = p.stem
                    row = conn.execute("SELECT study_id FROM studies WHERE study_id = ?;", (sid_candidate,)).fetchone()
                    if not row:
                        quarantine_dir.mkdir(parents=True, exist_ok=True)
                        dest = quarantine_dir / p.name
                        try:
                            shutil.move(str(p), str(dest))
                            orphaned_count += 1
                            logger.info(f"[Reconciliation] Quarantined orphaned PDF: {p} -> {dest}")
                        except Exception as e:
                            logger.warning(f"[Reconciliation] Failed to quarantine {p}: {e}")

        conn.close()
        return {
            "reconciled_missing_studies": missing_count,
            "missing_study_ids": reconciled_studies[:10],
            "quarantined_orphaned_files": orphaned_count,
        }
    except Exception as e:
        logger.error(f"[Reconciliation] Error during file reconciliation: {e}")
        try:
            conn.close()
        except Exception:
            pass
        return {"error": str(e)}


def cleanup_old_exports(max_age_days: int = 30) -> int:
    """Delete export copies older than max_age_days."""
    export_dir = Path(settings.export_dir).resolve()
    if not export_dir.exists():
        return 0

    now = time.time()
    max_age_sec = max_age_days * 86400
    deleted_count = 0

    for f in export_dir.glob("*"):
        if f.is_file() and not f.name.startswith("."):
            try:
                if (now - f.stat().st_mtime) > max_age_sec:
                    f.unlink(missing_ok=True)
                    deleted_count += 1
            except Exception as e:
                logger.warning(f"[Cleanup] Could not remove old export {f}: {e}")

    if deleted_count > 0:
        logger.info(f"[Cleanup] Cleaned up {deleted_count} export files older than {max_age_days} days.")
    return deleted_count


def run_boot_self_check() -> Dict[str, Any]:
    """Execute complete boot self-check and cache result."""
    global _BOOT_REPORT
    logger.info("Running RadExtract startup boot self-check...")

    pkg_check = check_required_packages()
    db_check = check_db_writability()
    storage_check = check_storage_directories()
    laya_check = check_laya_model()
    llm_check = check_llm_status()
    reconciliation = reconcile_file_storage()
    exports_cleaned = cleanup_old_exports(max_age_days=30)

    overall_healthy = (
        pkg_check["ok"] and
        db_check["ok"] and
        storage_check["ok"]
    )

    _BOOT_REPORT = {
        "boot_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "healthy" if overall_healthy else "degraded",
        "overall_ok": overall_healthy,
        "checks": {
            "packages": pkg_check,
            "database": db_check,
            "storage": storage_check,
            "laya": laya_check,
            "llm": llm_check,
        },
        "reconciliation": reconciliation,
        "exports_cleaned": exports_cleaned,
    }

    logger.info(
        f"Boot self-check completed: status={_BOOT_REPORT['status']}, "
        f"db_persistent={db_check.get('is_persistent')}, "
        f"laya={laya_check.get('status')}, "
        f"reconciled_missing={reconciliation.get('reconciled_missing_studies', 0)}"
    )
    return _BOOT_REPORT


def get_boot_report() -> Dict[str, Any]:
    """Return the cached startup boot report."""
    global _BOOT_REPORT
    if not _BOOT_REPORT.get("boot_time"):
        return run_boot_self_check()
    return _BOOT_REPORT
