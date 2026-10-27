#!/usr/bin/env python3
"""Database backup script for RadExtract Storage Plan.

Safely copies radextract.db into STUDY DATA/_BACKUPS/radextract-YYYY-MM-DD.db.
Maintains the last 8 backups and prunes older ones.

Can be run manually or scheduled via cron/Task Scheduler.
"""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.storage_manager import backup_database


def main():
    print("=" * 60)
    print("RadExtract Database Backup")
    print("=" * 60)
    try:
        backup_path = backup_database()
        print(f"✓ Backup successfully created at: {backup_path}")
        print("✓ Last 8 backups maintained in _BACKUPS folder.")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"✗ Backup failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
