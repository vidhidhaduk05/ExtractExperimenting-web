"""Database abstraction layer: SQLite ↔ DynamoDB.

Provides a unified interface for database operations so the platform can
run locally (SQLite) or in production (DynamoDB / Floci DynamoDB).

Design:
- DBBackend ABC defines high-level CRUD methods that work for both backends.
- SQLiteBackend wraps sqlite3.Connection and generates SQL under the hood.
- DynamoDBBackend uses boto3 and maps operations to DynamoDB APIs.
- For complex queries (JOINs, aggregates), use execute() which only works
  with SQLite. DynamoDB mode requires refactoring those to use the
  high-level methods or application-level joins.

Usage:
    from database import get_db
    conn = get_db()  # returns DBBackend (SQLite or DynamoDB)

    # High-level (works with both backends):
    row = conn.get("studies", "study123")
    rows = conn.query("studies", {"project_id": "proj1"})
    conn.insert("studies", {"study_id": "s1", "title": "..."})
    conn.update("studies", "s1", {"title": "new title"})
    conn.delete("studies", "s1")
    count = conn.count("studies", {"project_id": "proj1"})

    # Raw SQL (SQLite only):
    rows = conn.execute("SELECT * FROM studies WHERE ...", params).fetchall()
"""
from __future__ import annotations

import sqlite3
import json
import uuid
from abc import ABC, abstractmethod
from typing import Any, Optional, Union, Generator
from datetime import datetime

from config import settings


# ── Table primary key mapping ──
# Maps table name → primary key column name
TABLE_PK = {
    "record_annotations": "annotation_id",
    "project_tags": "tag_id",
    "study_tag_links": "link_id",
    "projects": "project_id",
    "studies": "study_id",
    "variables": "variable_id",
    "extractions": "extraction_id",
    "audit_log": "audit_id",
    "users": "user_id",
    "cache_store": "cache_key",
    "rob_assessments": "assessment_id",
    "rob_domain_judgments": "judgment_id",
    "rob_signaling_answers": "answer_id",
    "pdf_documents": "doc_id",
    "meta_analyses": "meta_id",
    "meta_analysis_studies": "link_id",
    "grade_assessments": "grade_id",
    "grade_factors": "factor_id",
    "screening_decisions": "decision_id",
    "screening_conflicts": "conflict_id",
    "pdf_highlights": "highlight_id",
    "sessions": "session_id",
    "project_members": "member_id",
    "user_review_state": "state_id",
    "rob_runs": "run_id",
    "rob_tool_classifications": "classification_id",
    "reporting_profile_assessments": "profile_assessment_id",
    "reporting_profile_items": "profile_item_id",
    "extraction_decisions": "decision_id",
    "todos": "id",
}

# Tables that have project_id for GSI
PROJECT_GSI_TABLES = {
    "record_annotations", "project_tags", "study_tag_links",
    "studies", "variables", "rob_assessments", "meta_analyses",
    "grade_assessments", "screening_decisions", "screening_conflicts",
    "pdf_highlights", "project_members", "user_review_state",
    "rob_tool_classifications", "reporting_profile_assessments",
    "extraction_decisions", "todos",
}

# Tables that have study_id for GSI
STUDY_GSI_TABLES = {
    "record_annotations", "study_tag_links",
    "extractions", "audit_log", "rob_assessments", "pdf_documents",
    "screening_decisions", "screening_conflicts", "pdf_highlights",
    "user_review_state",
    "rob_tool_classifications", "reporting_profile_assessments",
    "extraction_decisions", "todos",
}


class DBBackend(ABC):
    """Abstract database backend interface."""

    @abstractmethod
    def get(self, table: str, pk_value: str) -> Optional[dict]:
        """Get a single row by primary key. Returns dict or None."""
        ...

    @abstractmethod
    def query(self, table: str, filters: Optional[dict] = None, order_by: str = "",
              limit: int = 0) -> list[dict]:
        """Query rows with equality filters. Returns list of dicts."""
        ...

    @abstractmethod
    def query_all(self, table: str, order_by: str = "", limit: int = 0) -> list[dict]:
        """Retrieve all rows from a table."""
        ...

    @abstractmethod
    def insert(self, table: str, data: dict) -> str:
        """Insert a row. Auto-generates PK if not provided. Returns PK value."""
        ...

    @abstractmethod
    def batch_write(self, table: str, items: list[dict]) -> list[str]:
        """Insert multiple rows in bulk. Returns list of PK values."""
        ...

    @abstractmethod
    def update(self, table: str, pk_value: str, data: dict) -> bool:
        """Update a row by primary key. Returns True if updated."""
        ...

    @abstractmethod
    def delete(self, table: str, pk_value: str) -> bool:
        """Delete a row by primary key. Returns True if deleted."""
        ...

    @abstractmethod
    def count(self, table: str, filters: dict = None) -> int:
        """Count rows matching filters. If no filters, count all."""
        ...

    @abstractmethod
    def execute(self, sql: str, params: tuple = ()) -> Any:
        """Execute raw SQL (SQLite only). Raises NotImplementedError for DynamoDB."""
        ...

    @abstractmethod
    def commit(self):
        """Commit the current transaction."""
        ...

    @abstractmethod
    def close(self):
        """Close the connection."""
        ...

    # ── Context manager support ──
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class SQLiteBackend(DBBackend):
    """SQLite backend — wraps sqlite3.Connection with high-level methods."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    @property
    def row_factory(self):
        return self._conn.row_factory

    @row_factory.setter
    def row_factory(self, value):
        self._conn.row_factory = value

    def get(self, table: str, pk_value: str) -> Optional[dict]:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        row = self._conn.execute(
            f"SELECT * FROM {table} WHERE {pk} = ?", (pk_value,)
        ).fetchone()
        return dict(row) if row else None

    def query(self, table: str, filters: Optional[dict] = None, order_by: str = "",
              limit: int = 0) -> list[dict]:
        filters = filters or {}
        where_parts = [f"{k} = ?" for k in filters]
        params = tuple(filters.values())
        sql = f"SELECT * FROM {table}"
        if where_parts:
            sql += " WHERE " + " AND ".join(where_parts)
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {limit}"
        rows = self._conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def query_all(self, table: str, order_by: str = "", limit: int = 0) -> list[dict]:
        sql = f"SELECT * FROM {table}"
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {limit}"
        rows = self._conn.execute(sql).fetchall()
        return [dict(r) for r in rows]

    def _get_columns(self, table: str) -> set[str]:
        if not hasattr(self, "_cols_cache"):
            self._cols_cache: dict[str, set[str]] = {}
        if table not in self._cols_cache:
            try:
                info = self._conn.execute(f"PRAGMA table_info({table})").fetchall()
                self._cols_cache[table] = {row[1] for row in info}
            except Exception:
                self._cols_cache[table] = set()
        return self._cols_cache[table]

    def insert(self, table: str, data: dict) -> str:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        insert_data = dict(data)
        if pk not in insert_data or not insert_data[pk]:
            insert_data[pk] = str(uuid.uuid4())

        cols = self._get_columns(table)
        if cols:
            if "created_at" in cols and "created_at" not in insert_data:
                insert_data["created_at"] = datetime.utcnow().isoformat()
            insert_data = {k: v for k, v in insert_data.items() if k in cols}
        elif "created_at" not in insert_data:
            insert_data["created_at"] = datetime.utcnow().isoformat()

        cols_list = list(insert_data.keys())
        placeholders = ", ".join(["?"] * len(cols_list))
        col_names = ", ".join(cols_list)
        self._conn.execute(
            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})",
            tuple(insert_data.values()),
        )
        return insert_data.get(pk, data.get(pk, ""))

    def batch_write(self, table: str, items: list[dict]) -> list[str]:
        pks = []
        for item in items:
            pk = self.insert(table, item)
            pks.append(pk)
        return pks

    def update(self, table: str, pk_value: str, data: dict) -> bool:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        cols = self._get_columns(table)
        update_data = dict(data)
        if cols:
            update_data = {k: v for k, v in update_data.items() if k in cols and k != pk}
        if not update_data:
            return False
        set_parts = [f"{k} = ?" for k in update_data]
        params = tuple(update_data.values()) + (pk_value,)
        sql = f"UPDATE {table} SET " + ", ".join(set_parts) + f" WHERE {pk} = ?"
        cursor = self._conn.execute(sql, params)
        return cursor.rowcount > 0

    def delete(self, table: str, pk_value: str) -> bool:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        cursor = self._conn.execute(
            f"DELETE FROM {table} WHERE {pk} = ?", (pk_value,)
        )
        return cursor.rowcount > 0

    def count(self, table: str, filters: dict = None) -> int:
        sql = f"SELECT COUNT(*) as c FROM {table}"
        params = ()
        if filters:
            where_parts = [f"{k} = ?" for k in filters]
            params = tuple(filters.values())
            sql += " WHERE " + " AND ".join(where_parts)
        return self._conn.execute(sql, params).fetchone()["c"]

    def execute(self, sql: str, params: tuple = ()) -> Any:
        """Pass-through to sqlite3.Connection.execute for backward compatibility."""
        return self._conn.execute(sql, params)

    def executescript(self, sql: str):
        """Pass-through for schema scripts."""
        return self._conn.executescript(sql)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


class DynamoDBBackend(DBBackend):
    """DynamoDB backend — uses boto3 to interact with DynamoDB.

    Uses a multi-table design: one DynamoDB table per logical table.
    Primary key column → partition key.
    project_id, study_id, username, and refresh_token → GSIs for efficient querying.
    """

    def __init__(self, table_prefix: str = "", endpoint_url: str = "",
                 region: str = "us-east-1"):
        import boto3

        kwargs = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
        if settings.aws_secret_access_key:
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        self._dynamodb = boto3.resource("dynamodb", **kwargs)
        self._client = boto3.client("dynamodb", **kwargs)
        self._prefix = table_prefix
        self._tables_cache: dict[str, Any] = {}

    def _table_name(self, table: str) -> str:
        return f"{self._prefix}{table}"

    def _get_table(self, table: str):
        name = self._table_name(table)
        if name not in self._tables_cache:
            self._tables_cache[name] = self._dynamodb.Table(name)
        return self._tables_cache[name]

    def _to_dynamo(self, value: Any) -> Any:
        """Convert Python value to DynamoDB-compatible type."""
        if isinstance(value, bool):
            return value
        elif isinstance(value, (int, float)):
            return value
        elif isinstance(value, str):
            return value
        elif isinstance(value, dict) or isinstance(value, list):
            return json.dumps(value, ensure_ascii=False)
        elif value is None:
            return None
        return str(value)

    def _from_dynamo(self, item: dict) -> dict:
        """Convert DynamoDB item to Python dict."""
        result = {}
        for k, v in item.items():
            if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                try:
                    result[k] = json.loads(v)
                except (json.JSONDecodeError, TypeError):
                    result[k] = v
            else:
                result[k] = v
        return result

    def get(self, table: str, pk_value: str) -> Optional[dict]:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        try:
            resp = self._get_table(table).get_item(Key={pk: pk_value})
            item = resp.get("Item")
            return self._from_dynamo(item) if item else None
        except Exception:
            return None

    def query(self, table: str, filters: Optional[dict] = None, order_by: str = "",
              limit: int = 0) -> list[dict]:
        filters = filters or {}
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")

        # If filtering by PK, use GetItem
        if pk in filters and len(filters) == 1:
            row = self.get(table, filters[pk])
            return [row] if row else []

        items = []

        # If filtering by project_id, use GSI
        if "project_id" in filters and table in PROJECT_GSI_TABLES:
            kwargs = {
                "IndexName": "project_id-index",
                "KeyConditionExpression": "project_id = :pid",
                "ExpressionAttributeValues": {":pid": filters["project_id"]},
            }
            if limit:
                kwargs["Limit"] = limit
            resp = self._get_table(table).query(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]
            for k, v in filters.items():
                if k != "project_id":
                    items = [i for i in items if i.get(k) == v]

        # If filtering by study_id, use GSI
        elif "study_id" in filters and table in STUDY_GSI_TABLES:
            kwargs = {
                "IndexName": "study_id-index",
                "KeyConditionExpression": "study_id = :sid",
                "ExpressionAttributeValues": {":sid": filters["study_id"]},
            }
            if limit:
                kwargs["Limit"] = limit
            resp = self._get_table(table).query(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]
            for k, v in filters.items():
                if k != "study_id":
                    items = [i for i in items if i.get(k) == v]

        # If filtering users by username, use username GSI
        elif "username" in filters and table == "users":
            kwargs = {
                "IndexName": "username-index",
                "KeyConditionExpression": "username = :u",
                "ExpressionAttributeValues": {":u": filters["username"]},
            }
            resp = self._get_table(table).query(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]

        # If filtering sessions by refresh_token
        elif "refresh_token" in filters and table == "sessions":
            kwargs = {
                "IndexName": "refresh_token-index",
                "KeyConditionExpression": "refresh_token = :rt",
                "ExpressionAttributeValues": {":rt": filters["refresh_token"]},
            }
            resp = self._get_table(table).query(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]

        # If filtering sessions by user_id
        elif "user_id" in filters and table == "sessions":
            kwargs = {
                "IndexName": "user_id-index",
                "KeyConditionExpression": "user_id = :uid",
                "ExpressionAttributeValues": {":uid": filters["user_id"]},
            }
            resp = self._get_table(table).query(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]

        else:
            # Fallback: scan with filter
            if filters:
                filter_expr = " AND ".join([f"{k} = :{k}" for k in filters])
                expr_values = {f":{k}": self._to_dynamo(v) for k, v in filters.items()}
                kwargs = {
                    "FilterExpression": filter_expr,
                    "ExpressionAttributeValues": expr_values,
                }
            else:
                kwargs = {}
            if limit:
                kwargs["Limit"] = limit
            resp = self._get_table(table).scan(**kwargs)
            items = [self._from_dynamo(dict(item)) for item in resp.get("Items", [])]

        # In-memory sorting for order_by (e.g. "created_at DESC" or "name ASC")
        if order_by and items:
            desc = "desc" in order_by.lower()
            sort_field = order_by.split()[0].strip()
            items = sorted(
                items,
                key=lambda x: str(x.get(sort_field, "")),
                reverse=desc,
            )

        if limit and len(items) > limit:
            items = items[:limit]

        return items

    def query_all(self, table: str, order_by: str = "", limit: int = 0) -> list[dict]:
        return self.query(table, filters={}, order_by=order_by, limit=limit)

    def insert(self, table: str, data: dict) -> str:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        if pk not in data or not data[pk]:
            data[pk] = str(uuid.uuid4())
        if "created_at" not in data:
            data["created_at"] = datetime.utcnow().isoformat()

        item = {k: self._to_dynamo(v) for k, v in data.items() if v is not None}
        self._get_table(table).put_item(Item=item)
        return data[pk]

    def batch_write(self, table: str, items: list[dict]) -> list[str]:
        pks = []
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        dynamo_table = self._get_table(table)
        with dynamo_table.batch_writer() as batch:
            for d in items:
                if pk not in d or not d[pk]:
                    d[pk] = str(uuid.uuid4())
                if "created_at" not in d:
                    d["created_at"] = datetime.utcnow().isoformat()
                item = {k: self._to_dynamo(v) for k, v in d.items() if v is not None}
                batch.put_item(Item=item)
                pks.append(d[pk])
        return pks

    def update(self, table: str, pk_value: str, data: dict) -> bool:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        set_expr = ", ".join([f"#{k} = :{k}" for k in data])
        expr_names = {f"#{k}": k for k in data}
        expr_values = {f":{k}": self._to_dynamo(v) for k, v in data.items()}
        try:
            self._get_table(table).update_item(
                Key={pk: pk_value},
                UpdateExpression=f"SET {set_expr}",
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
            return True
        except Exception:
            return False

    def delete(self, table: str, pk_value: str) -> bool:
        pk = TABLE_PK.get(table, f"{table.rstrip('s')}_id")
        try:
            self._get_table(table).delete_item(Key={pk: pk_value})
            return True
        except Exception:
            return False

    def count(self, table: str, filters: dict = None) -> int:
        if not filters:
            resp = self._get_table(table).scan(Select="COUNT")
            return resp.get("Count", 0)

        # Use query if possible for efficiency
        if "project_id" in filters and table in PROJECT_GSI_TABLES:
            resp = self._get_table(table).query(
                IndexName="project_id-index",
                KeyConditionExpression="project_id = :pid",
                ExpressionAttributeValues={":pid": filters["project_id"]},
                Select="COUNT",
            )
            return resp.get("Count", 0)

        if "study_id" in filters and table in STUDY_GSI_TABLES:
            resp = self._get_table(table).query(
                IndexName="study_id-index",
                KeyConditionExpression="study_id = :sid",
                ExpressionAttributeValues={":sid": filters["study_id"]},
                Select="COUNT",
            )
            return resp.get("Count", 0)

        # Fallback: scan with count
        filter_expr = " AND ".join([f"{k} = :{k}" for k in filters])
        expr_values = {f":{k}": self._to_dynamo(v) for k, v in filters.items()}
        resp = self._get_table(table).scan(
            FilterExpression=filter_expr,
            ExpressionAttributeValues=expr_values,
            Select="COUNT",
        )
        return resp.get("Count", 0)

    def execute(self, sql: str, params: tuple = ()) -> Any:
        raise NotImplementedError(
            "Raw SQL execute() is not supported with DynamoDB backend. "
            "Use get(), query(), insert(), update(), delete(), or count() instead."
        )

    def commit(self):
        pass

    def close(self):
        pass


# ── Factory ──

def get_db_backend() -> DBBackend:
    """Create a NEW database backend instance per call.

    Each request gets its own connection. The caller (get_db dependency)
    is responsible for closing it. Do NOT cache the result in a global —
    doing so causes 'Cannot operate on a closed database' errors when
    the first request's finally block closes the shared connection.
    """
    if settings.db_backend == "dynamodb":
        return DynamoDBBackend(
            table_prefix=settings.dynamodb_table_prefix,
            endpoint_url=settings.aws_endpoint_url,
            region=settings.aws_region,
        )
    else:
        from database import get_connection
        return SQLiteBackend(get_connection())


def init_dynamodb_tables():
    """Create DynamoDB tables if they don't exist (called on startup when using DynamoDB)."""
    if settings.db_backend != "dynamodb":
        return

    import boto3

    kwargs = {"region_name": settings.aws_region}
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

    client = boto3.client("dynamodb", **kwargs)

    for table_name, pk_col in TABLE_PK.items():
        full_name = f"{settings.dynamodb_table_prefix}{table_name}"
        try:
            client.describe_table(TableName=full_name)
            continue  # table already exists
        except client.exceptions.ResourceNotFoundException:
            pass

        # Build attribute definitions and key schema
        attr_defs = [{"AttributeName": pk_col, "AttributeType": "S"}]
        key_schema = [{"AttributeName": pk_col, "KeyType": "HASH"}]
        gsi_defs = []

        if table_name in PROJECT_GSI_TABLES:
            attr_defs.append({"AttributeName": "project_id", "AttributeType": "S"})
            gsi_defs.append({
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            })

        if table_name in STUDY_GSI_TABLES:
            attr_defs.append({"AttributeName": "study_id", "AttributeType": "S"})
            gsi_defs.append({
                "IndexName": "study_id-index",
                "KeySchema": [{"AttributeName": "study_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            })

        if table_name == "users":
            attr_defs.append({"AttributeName": "username", "AttributeType": "S"})
            gsi_defs.append({
                "IndexName": "username-index",
                "KeySchema": [{"AttributeName": "username", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            })

        if table_name == "sessions":
            attr_defs.extend([
                {"AttributeName": "refresh_token", "AttributeType": "S"},
                {"AttributeName": "user_id", "AttributeType": "S"},
            ])
            gsi_defs.extend([
                {
                    "IndexName": "refresh_token-index",
                    "KeySchema": [{"AttributeName": "refresh_token", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "user_id-index",
                    "KeySchema": [{"AttributeName": "user_id", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ])

        create_kwargs = {
            "TableName": full_name,
            "AttributeDefinitions": attr_defs,
            "KeySchema": key_schema,
            "BillingMode": "PAY_PER_REQUEST",
        }
        if gsi_defs:
            create_kwargs["GlobalSecondaryIndexes"] = gsi_defs

        client.create_table(**create_kwargs)

