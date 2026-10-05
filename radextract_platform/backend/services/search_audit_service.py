"""Search Audit Logging Service for PRISMA 2020 Compliance.

Implements K-Dense-AI systematic review search protocol logging:
Tracks electronic databases searched, exact query syntax, filters applied,
date searched, and records retrieved.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.db_backend import DBBackend, get_db_backend


def log_search(
    project_id: str,
    database_name: str,
    query_string: str,
    filters: Optional[Dict[str, Any]] = None,
    results_count: int = 0,
    export_format: str = "json",
    raw_results: Optional[List[Dict[str, Any]]] = None,
    created_by: str = "",
    db: Optional[DBBackend] = None,
) -> Dict[str, Any]:
    """Log an executed search to the persistent audit log."""
    db = db or get_db_backend()
    log_id = str(uuid.uuid4())
    date_searched = datetime.now(timezone.utc).isoformat()
    filters_json = json.dumps(filters or {})
    raw_json = json.dumps(raw_results or [])

    db.execute(
        """INSERT INTO search_logs (
            log_id, project_id, database_name, date_searched, query_string,
            filters_json, results_count, export_format, raw_results_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            log_id,
            project_id,
            database_name,
            date_searched,
            query_string,
            filters_json,
            results_count,
            export_format,
            raw_json,
            created_by,
        ),
    )
    if hasattr(db, "commit"):
        db.commit()

    return {
        "log_id": log_id,
        "project_id": project_id,
        "database_name": database_name,
        "date_searched": date_searched,
        "query_string": query_string,
        "filters": filters or {},
        "results_count": results_count,
        "export_format": export_format,
        "created_by": created_by,
    }


def get_search_logs(project_id: str, db: Optional[DBBackend] = None) -> List[Dict[str, Any]]:
    """Retrieve all search logs for a given project."""
    db = db or get_db_backend()
    rows = db.execute(
        "SELECT * FROM search_logs WHERE project_id = ? ORDER BY date_searched DESC",
        (project_id,),
    ).fetchall()

    logs = []
    for r in rows:
        item = dict(r)
        try:
            item["filters"] = json.loads(item.get("filters_json") or "{}")
        except Exception:
            item["filters"] = {}
        try:
            item["raw_results"] = json.loads(item.get("raw_results_json") or "[]")
        except Exception:
            item["raw_results"] = []
        logs.append(item)
    return logs


def generate_prisma_search_table(project_id: str, db: Optional[DBBackend] = None) -> str:
    """Generate a publication-ready Markdown table of the search audit log."""
    logs = get_search_logs(project_id, db=db)
    if not logs:
        return "No search records logged for this project."

    lines = [
        "| Database | Date Searched | Query String | Filters | Results Count | Export Format |",
        "| :--- | :--- | :--- | :--- | ---: | :--- |",
    ]
    for l in logs:
        db_name = l.get("database_name", "Unknown")
        date_str = str(l.get("date_searched", ""))[:10]
        query = l.get("query_string", "").replace("|", "\\|")
        filters_dict = l.get("filters", {})
        filter_str = ", ".join(f"{k}: {v}" for k, v in filters_dict.items()) if filters_dict else "None"
        count = l.get("results_count", 0)
        fmt = l.get("export_format", "JSON")
        lines.append(f"| {db_name} | {date_str} | `{query}` | {filter_str} | {count} | {fmt} |")

    return "\n".join(lines)
