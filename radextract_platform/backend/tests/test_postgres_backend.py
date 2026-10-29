"""Tests for the Postgres backend (Stellar target) using a fake psycopg2.

No real Postgres server is needed: the fake verifies SQL translation,
placeholder swapping, dict-row semantics, and backend selection wiring.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


class FakeCursor:
    def __init__(self, store):
        self.store = store
        self._sql = ""
        self._params = ()
        self.description = None
        self.rowcount = 0

    def execute(self, sql, params=()):
        self._sql = sql
        self._params = params
        self.store["last_sql"] = sql
        self.store["last_params"] = params
        q = " ".join(sql.split()).upper()
        if q.startswith("SELECT 1 FROM INFORMATION_SCHEMA.TABLES"):
            self.description = [("1",)]
            self._rows = [(1,)]
        elif q.startswith("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"):
            self.description = [("column_name",)]
            self._rows = [(c,) for c in self.store.get("columns", [])]
        elif q.startswith("SELECT COUNT(*)"):
            self.description = [("c",)]
            self._rows = [(self.store.get("count", 0),)]
        elif q.startswith("SELECT"):
            self.description = [("col",)]
            self._rows = list(self.store.get("rows", []))
        else:
            self.description = None
            self._rows = []
            self.rowcount = self.store.get("rowcount", 1)

    def fetchall(self):
        return getattr(self, "_rows", [])

    def fetchone(self):
        rows = getattr(self, "_rows", [])
        return rows[0] if rows else None

    def close(self):
        pass


class FakeConnection:
    def __init__(self, store):
        self.store = store
        self.autocommit = False
        self.committed = 0

    def cursor(self):
        return FakeCursor(self.store)

    def commit(self):
        self.committed += 1

    def close(self):
        pass


@pytest.fixture
def backend(monkeypatch):
    store = {"rows": [("s1", "Study One")], "columns": ["study_id", "title"], "count": 7}
    fake_psycopg2 = type("m", (), {})
    fake_psycopg2.connect = lambda dsn: FakeConnection(store)
    fake_psycopg2.extras = type("x", (), {})
    import importlib
    pb = importlib.import_module("services.postgres_backend")
    monkeypatch.setitem(__import__("sys").modules, "psycopg2", fake_psycopg2)
    monkeypatch.setitem(__import__("sys").modules, "psycopg2.extras", fake_psycopg2.extras)
    be = pb.PostgresBackend.__new__(pb.PostgresBackend)
    be._psycopg2 = fake_psycopg2
    be._extras = fake_psycopg2.extras
    be._conn = FakeConnection(store)
    be._conn.autocommit = True
    be._store = store
    return be


def test_placeholder_translation(backend):
    backend.execute("SELECT * FROM studies WHERE project_id = ? AND is_duplicate = 0", ("p1",))
    assert backend._store["last_sql"] == \
        "SELECT * FROM studies WHERE project_id = %s AND is_duplicate = 0"
    assert backend._store["last_params"] == ("p1",)


def test_get_uses_singular_pk_for_studies(backend):
    backend.get("studies", "s1")
    assert "WHERE study_id = %s" in backend._store["last_sql"]
    assert backend._store["last_params"] == ("s1",)


def test_count_returns_int(backend):
    assert backend.count("studies") == 7


def test_commit_respects_autocommit(backend):
    before = backend._conn.committed
    backend.commit()
    assert backend._conn.committed == before  # autocommit: no explicit commit


def test_backend_selection_postgres(monkeypatch):
    """get_db_backend returns PostgresBackend when db_backend=postgres."""
    from config import settings
    from services.db_backend import get_db_backend
    fake_psycopg2 = type("m", (), {})
    fake_psycopg2.connect = lambda dsn: FakeConnection({"rows": [], "columns": []})
    fake_psycopg2.extras = type("x", (), {})
    monkeypatch.setitem(__import__("sys").modules, "psycopg2", fake_psycopg2)
    monkeypatch.setitem(__import__("sys").modules, "psycopg2.extras", fake_psycopg2.extras)
    monkeypatch.setattr(settings, "db_backend", "postgres")
    monkeypatch.setattr(settings, "database_url", "postgresql://u:p@localhost:5432/stellar")
    be = get_db_backend()
    assert type(be).__name__ == "PostgresBackend"
