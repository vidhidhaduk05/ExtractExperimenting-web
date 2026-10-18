"""Data Migration Tool: Migrate SQLite database to DynamoDB (Floci or AWS)."""
from __future__ import annotations

import logging
import sqlite3
import sys
from pathlib import Path

from config import settings
from services.db_backend import get_db_backend, init_dynamodb_tables

logger = logging.getLogger("radextract.migration")

TABLES_TO_MIGRATE = [
    "users",
    "projects",
    "studies",
    "variables",
    "extractions",
    "audit_log",
    "cache_store",
    "pdf_documents",
    "pdf_highlights",
    "screening_decisions",
    "screening_conflicts",
    "rob_assessments",
    "rob_domain_judgments",
    "rob_signaling_answers",
    "meta_analyses",
    "meta_analysis_studies",
    "grade_assessments",
    "grade_factors",
]


def migrate_sqlite_to_dynamodb(sqlite_path: str, table_prefix: str = "radextract") -> int:
    """Read all records from SQLite and insert into DynamoDB."""
    p = Path(sqlite_path)
    if not p.exists():
        raise FileNotFoundError(f"SQLite database file not found: {sqlite_path}")

    # Ensure DynamoDB tables exist
    init_dynamodb_tables(table_prefix)

    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    db = get_db_backend()

    total_migrated = 0

    for table in TABLES_TO_MIGRATE:
        try:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
            count = 0
            for r in rows:
                item = dict(r)
                # Convert None to empty string
                clean_item = {k: (v if v is not None else "") for k, v in item.items()}
                db.insert(table, clean_item)
                count += 1
            logger.info(f"Migrated {count} records from table '{table}'")
            total_migrated += count
        except sqlite3.OperationalError as e:
            logger.warning(f"Skipping table '{table}': {e}")

    conn.close()
    logger.info(f"Migration completed successfully. Total records migrated: {total_migrated}")
    return total_migrated


if __name__ == "__main__":
    db_file = sys.argv[1] if len(sys.argv) > 1 else settings.db_path
    migrate_sqlite_to_dynamodb(db_file)
