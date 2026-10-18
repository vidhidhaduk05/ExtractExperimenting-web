"""Zero-downtime online SQLite database backup script for RadExtract Platform.

Uses the official SQLite Online Backup API (supported natively in SQLite WAL mode)
to create consistent snapshots without locking active read/write transactions.

Usage:
    python backup_db.py [--output-dir /path/to/backups] [--retention 30] [--compress]
    docker compose exec api python backup_db.py
"""
from __future__ import annotations
import argparse
import gzip
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import settings


def backup_database(output_dir: str | None = None, retention_days: int = 30, compress: bool = True) -> Path:
    source_db = Path(settings.db_path)
    if not source_db.exists():
        raise FileNotFoundError(f"Source database not found at {source_db}")

    if output_dir is None:
        target_dir = source_db.parent / "backups"
    else:
        target_dir = Path(output_dir)

    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    temp_backup_path = target_dir / f"radextract_backup_{timestamp}.db"
    final_backup_path = target_dir / f"radextract_backup_{timestamp}.db.gz" if compress else temp_backup_path

    print(f"[*] Starting online SQLite backup of: {source_db}")
    start_time = time.perf_counter()

    # Perform online SQLite backup
    src_conn = sqlite3.connect(str(source_db), timeout=60.0)
    dst_conn = sqlite3.connect(str(temp_backup_path))

    try:
        with dst_conn:
            src_conn.backup(dst_conn, pages=100)
    finally:
        dst_conn.close()
        src_conn.close()

    duration = time.perf_counter() - start_time
    raw_size_mb = temp_backup_path.stat().st_size / (1024 * 1024)
    print(f"[*] Online snapshot completed in {duration:.2f}s ({raw_size_mb:.2f} MB)")

    # Compress if requested
    if compress:
        print("[*] Compressing backup with gzip...")
        with open(temp_backup_path, "rb") as f_in:
            with gzip.open(final_backup_path, "wb", compresslevel=9) as f_out:
                shutil.copyfileobj(f_in, f_out)
        temp_backup_path.unlink()
        comp_size_mb = final_backup_path.stat().st_size / (1024 * 1024)
        print(f"[+] Compressed backup created: {final_backup_path} ({comp_size_mb:.2f} MB)")
    else:
        print(f"[+] Uncompressed backup created: {final_backup_path}")

    # Retention clean up
    now = time.time()
    cutoff = now - (retention_days * 86400)
    cleaned = 0
    for file in target_dir.glob("radextract_backup_*"):
        if file.stat().st_mtime < cutoff:
            file.unlink()
            cleaned += 1
    if cleaned > 0:
        print(f"[*] Cleaned up {cleaned} backup file(s) older than {retention_days} days.")

    return final_backup_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backup RadExtract SQLite Database")
    parser.add_argument("--output-dir", default=None, help="Directory to store backup files")
    parser.add_argument("--retention", type=int, default=30, help="Days to keep backup files")
    parser.add_argument("--no-compress", action="store_true", help="Skip gzip compression")

    args = parser.parse_args()
    backup_database(
        output_dir=args.output_dir,
        retention_days=args.retention,
        compress=not args.no_compress
    )
