"""Postgres backend for the DBBackend abstraction (Stellar target schema).

Implements the same contract as SQLiteBackend/DynamoDBBackend so the whole
router layer works unchanged against the Stellar Postgres database while
SQLite remains the local-dev backend.

Selected automatically when settings.db_backend == "postgres" (or DATABASE_URL
is set with RADEXTRACT_DB_BACKEND=postgres). Files never live in Postgres:
studies.pdf_path / study_files.storage_key hold HPC-mount paths only, per the
Stellar schema.

Requires psycopg2 (pip install psycopg2-binary). Import errors surface only
when the postgres backend is actually selected.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from services.db_backend import DBBackend, TABLE_PK

logger = logging.getLogger(__name__)


class PostgresBackend(DBBackend):
    """DBBackend over psycopg2 with SQLite-compatible semantics.

    - Rows are returned as dicts (RealDictCursor), matching SQLiteBackend.
    - `execute()` accepts the SQLite-style SQL used across the routers.
      Placeholder translation (? -> %s) happens here so callers do not change.
    - Schema uses TEXT primary keys and TIMESTAMPTZ per the Stellar schema doc.
    """

    def __init__(self, dsn: str = "", autocommit: bool = True):
        try:
            import psycopg2
            import psycopg2.extras
        except ImportError as e:  # pragma: no cover - only when backend selected
            raise RuntimeError(
                "Postgres backend selected but psycopg2 is not installed. "
                "Run: uv pip install psycopg2-binary"
            ) from e
        self._psycopg2 = psycopg2
        self._extras = psycopg2.extras
        if not dsn:
            from config import settings
            dsn = getattr(settings, "database_url", "") or ""
        if not dsn:
            raise RuntimeError("Postgres backend selected but no DATABASE_URL set")
        self._conn = psycopg2.connect(dsn)
        self._conn.autocommit = autocommit

    # ── helpers ──

    def _q(self, sql: str) -> str:
        """Translate SQLite-style SQL to Postgres (placeholder swap)."""
        return sql.replace("?", "%s")

    def _rows(self, cur) -> list[dict]:
        if cur.description is None:
            return []
        rows = cur.fetchall()
        if rows and isinstance(rows[0], dict):
            return [dict(r) for r in rows]
        cols = [d[0] for d in cur.description] if isinstance(cur.description[0], tuple) \
            else [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]

    def _table_exists(self, table: str) -> bool:
        cur = self._conn.cursor()
        cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            (table,),
        )
        ok = cur.fetchone() is not None
        cur.close()
        return ok

    def _get_columns(self, table: str) -> set[str]:
        cur = self._conn.cursor()
        cur.execute(
            """SELECT column_name FROM information_schema.columns
               WHERE table_name = %s""",
            (table,),
        )
        cols = {r[0] for r in cur.fetchall()}
        cur.close()
        return cols

    # ── DBBackend contract ──

    def _pk(self, table: str) -> str:
        return TABLE_PK.get(table, f"{table.rstrip('s')}_id")

    def get(self, table: str, pk_value: str) -> Optional[dict]:
        pk = self._pk(table)
        cur = self._conn.cursor()
        cur.execute(self._q(f"SELECT * FROM {table} WHERE {pk} = %s"), (pk_value,))
        rows = self._rows(cur)
        cur.close()
        return rows[0] if rows else None

    def query(self, table: str, filters: Optional[dict] = None, order_by: str = "",
              limit: int = 0) -> list[dict]:
        sql = f"SELECT * FROM {table}"
        params: list = []
        if filters:
            clauses = []
            for k, v in filters.items():
                if v is None:
                    clauses.append(f"{k} IS NULL")
                elif isinstance(v, tuple) and len(v) == 2 and v[0] == "in":
                    clauses.append(f"{k} = ANY(%s)")
                    params.append(list(v[1]))
                else:
                    clauses.append(f"{k} = %s")
                    params.append(v)
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {int(limit)}"
        cur = self._conn.cursor()
        cur.execute(self._q(sql), tuple(params))
        rows = self._rows(cur)
        cur.close()
        return rows

    def query_all(self, table: str, order_by: str = "", limit: int = 0) -> list[dict]:
        return self.query(table, None, order_by=order_by, limit=limit)

    def insert(self, table: str, data: dict) -> str:
        cols = sorted(data.keys())
        placeholders = ", ".join(["%s"] * len(cols))
        sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
        cur = self._conn.cursor()
        cur.execute(self._q(sql), tuple(data[c] for c in cols))
        cur.close()
        return data.get("project_id") or data.get("study_id") or data.get(
            next(iter(data)), "")

    def batch_write(self, table: str, items: list[dict]) -> list[str]:
        ids = []
        for item in items:
            ids.append(self.insert(table, item))
        return ids

    def update(self, table: str, pk_value: str, data: dict) -> bool:
        if not data:
            return False
        pk = self._pk(table)
        sets = ", ".join(f"{k} = %s" for k in data)
        cur = self._conn.cursor()
        cur.execute(
            self._q(f"UPDATE {table} SET {sets} WHERE {pk} = %s"),
            tuple(list(data.values()) + [pk_value]),
        )
        affected = cur.rowcount
        cur.close()
        return affected > 0

    def delete(self, table: str, pk_value: str) -> bool:
        pk = self._pk(table)
        cur = self._conn.cursor()
        cur.execute(self._q(f"DELETE FROM {table} WHERE {pk} = %s"), (pk_value,))
        affected = cur.rowcount
        cur.close()
        return affected > 0

    def count(self, table: str, filters: dict = None) -> int:
        sql = f"SELECT COUNT(*) AS c FROM {table}"
        params: list = []
        if filters:
            clauses = [f"{k} = %s" for k in filters]
            sql += " WHERE " + " AND ".join(clauses)
            params = list(filters.values())
        cur = self._conn.cursor()
        cur.execute(self._q(sql), tuple(params))
        row = cur.fetchone()
        cur.close()
        return int(row[0])

    def execute(self, sql: str, params: tuple = ()) -> Any:
        """Pass-through with placeholder translation; returns list[dict] for SELECTs."""
        cur = self._conn.cursor()
        cur.execute(self._q(sql), tuple(params))
        rows = self._rows(cur)
        cur.close()
        return rows

    def commit(self):
        if not self._conn.autocommit:
            self._conn.commit()

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass
