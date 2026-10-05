"""
dual_writer.py — multi-format output writer for reconciled extraction records.

Extends LitExtract's Excel-only writer with two additional first-class outputs:
  1. JSON — both flat (all sheets) and nested (entity-graph hierarchy)
  2. SQLite — relational database mirroring the entity graph with FKs

All three formats are written from the same reconciled records structure:
    {sheet: [row_dict, ...]}

SQLite schema mirrors the entity graph from schema.yaml:
    study_level (PK: study_id)
      ├── cohort_level (PK: cohort_id, FK: study_id)
      │     └── protocol_level (PK: protocol_id, FK: cohort_id)
      │           └── outcome_level (PK: outcome_id, FK: protocol_id)
      └── quality_assessment (PK: qa_id, FK: study_id)

Column names are sanitized for SQL (spaces → underscores, special chars removed).
A mapping table preserves the original field name ↔ SQL column name correspondence.

S3-safe: SQLite and JSON files are staged in /workspace, then cp'd to the
destination (the FUSE mount rejects random-access writes).
"""
from __future__ import annotations
import os
import re
import json
import sqlite3
import shutil
import subprocess
from typing import Optional, Dict, List, Any, Tuple

from ..litextract.writer import append_records, FLAG_FILLS


# --------------------------------------------------------------------------- #
# Column name sanitization
# --------------------------------------------------------------------------- #
def sanitize_column_name(name: str) -> str:
    """Convert a field name to a valid SQLite column identifier.

    'Study ID' → 'study_id'
    'D1: Patient Selection — Risk of Bias' → 'd1_patient_selection_risk_of_bias'
    'Age, Central Value (years)' → 'age_central_value_years'
    """
    # Replace non-alphanumeric with underscores
    s = re.sub(r'[^a-zA-Z0-9]+', '_', name)
    # Strip leading/trailing underscores, lowercase
    s = s.strip('_').lower()
    # Ensure it doesn't start with a digit
    if s and s[0].isdigit():
        s = f'col_{s}'
    return s or 'unnamed'


def build_column_map(sheet_fields: List[str]) -> Dict[str, str]:
    """Build {original_name: sql_column_name} for a list of field names."""
    seen = {}
    mapping = {}
    for name in sheet_fields:
        sql_name = sanitize_column_name(name)
        # Handle collisions
        if sql_name in seen:
            seen[sql_name] += 1
            sql_name = f"{sql_name}_{seen[sql_name]}"
        else:
            seen[sql_name] = 0
        mapping[name] = sql_name
    return mapping


# --------------------------------------------------------------------------- #
# SQLite writer
# --------------------------------------------------------------------------- #
SQL_TYPE_MAP = {
    "int": "INTEGER",
    "float": "REAL",
    "percent": "REAL",
    "enum": "TEXT",
    "free_text": "TEXT",
}


def _sql_type(field_type: str) -> str:
    return SQL_TYPE_MAP.get(field_type, "TEXT")


def write_sqlite(records: dict, project, db_path: str, *,
                 work_dir: Optional[str] = None) -> dict:
    """Write reconciled records to a SQLite database.

    Creates tables mirroring the entity graph with foreign keys, inserts all
    records, and creates indexes on key/parent_key columns.

    Args:
        records: {sheet: [row_dict, ...]}
        project: a litextract Project
        db_path: destination .db file path
        work_dir: staging directory for S3 safety

    Returns:
        {"db_path": str, "tables": {sheet: n_rows}, "column_maps": {sheet: {orig: sql}}}
    """
    schema = project.schema
    entity_graph = schema.entity_graph

    # Stage in work_dir for S3 safety (default to dest_dir if work_dir not writable)
    dest_dir = os.path.dirname(db_path) or "."
    if not work_dir:
        work_dir = dest_dir if os.access(dest_dir, os.W_OK) else "/tmp"
    else:
        try:
            os.makedirs(work_dir, exist_ok=True)
        except OSError:
            work_dir = dest_dir if os.access(dest_dir, os.W_OK) else "/tmp"

    staging_path = os.path.join(work_dir, f"extract_staging_{os.getpid()}.db")

    # Remove any existing staging file
    if os.path.exists(staging_path):
        os.remove(staging_path)

    conn = sqlite3.connect(staging_path)
    conn.execute("PRAGMA foreign_keys = ON")

    column_maps = {}
    table_info = {}

    # Create tables in parent-first order (data_sheets is already ordered)
    for sheet in schema.data_sheets:
        fields = [name for _, name in project.sheet_order.get(sheet, [])]
        col_map = build_column_map(fields)
        column_maps[sheet] = col_map

        eg = entity_graph.get(sheet, {})
        key_field = eg.get("key")
        parent_sheet = eg.get("parent")
        parent_key_field = eg.get("parent_key")

        # Build column definitions and table-level constraints separately
        col_defs = []
        table_constraints = []
        for fname in fields:
            sql_name = col_map[fname]
            ftype = schema.field_type(sheet, fname, project.codebook)
            sql_type = _sql_type(ftype)

            if fname == key_field:
                # Primary key
                col_defs.append(f'  "{sql_name}" {sql_type} PRIMARY KEY')
            elif fname == parent_key_field and parent_sheet:
                # Column + separate FK constraint (must be at table level)
                col_defs.append(f'  "{sql_name}" {sql_type}')
                parent_sql = sanitize_column_name(parent_key_field)
                parent_table = sanitize_table_name(parent_sheet)
                table_constraints.append(
                    f'  FOREIGN KEY ("{sql_name}") REFERENCES "{parent_table}" ("{parent_sql}")'
                )
            else:
                col_defs.append(f'  "{sql_name}" {sql_type}')

        table_name = sanitize_table_name(sheet)
        all_defs = col_defs + table_constraints
        create_sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n' + ",\n".join(all_defs) + "\n)"
        conn.execute(create_sql)

        # Create index on parent_key for faster joins
        if parent_key_field and parent_key_field in col_map:
            idx_name = f"idx_{table_name}_{col_map[parent_key_field]}"
            conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{table_name}" ("{col_map[parent_key_field]}")')

        # Insert records
        rows = records.get(sheet, [])
        for row in rows:
            columns = []
            placeholders = []
            values = []
            for fname in fields:
                if fname in row:
                    sql_name = col_map[fname]
                    columns.append(f'"{sql_name}"')
                    placeholders.append("?")
                    values.append(row[fname])
            if columns:
                insert_sql = f'INSERT OR REPLACE INTO "{table_name}" ({", ".join(columns)}) VALUES ({", ".join(placeholders)})'
                conn.execute(insert_sql, values)

        table_info[sheet] = len(rows)

    # Store column maps in a metadata table for round-tripping
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _radextract_metadata (
            sheet TEXT, original_name TEXT, sql_column TEXT, field_order INTEGER
        )
    """)
    for sheet in schema.data_sheets:
        fields = [name for _, name in project.sheet_order.get(sheet, [])]
        col_map = column_maps[sheet]
        for i, fname in enumerate(fields):
            conn.execute(
                "INSERT INTO _radextract_metadata VALUES (?, ?, ?, ?)",
                (sheet, fname, col_map[fname], i)
            )

    conn.commit()
    conn.close()

    # Copy staging to destination (S3-safe)
    dest_dir = os.path.dirname(db_path)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)
    shutil.copyfile(staging_path, db_path)
    os.remove(staging_path)

    return {
        "db_path": db_path,
        "tables": table_info,
        "column_maps": column_maps,
        "bytes": os.path.getsize(db_path),
    }


def sanitize_table_name(sheet: str) -> str:
    """Convert a sheet name to a valid SQLite table identifier."""
    return sanitize_column_name(sheet)


# --------------------------------------------------------------------------- #
# JSON writer
# --------------------------------------------------------------------------- #
def write_json_flat(records: dict, project, json_path: str) -> dict:
    """Write records as a flat JSON file (all sheets, all rows).

    Structure:
        {
            "project": "radiology_base",
            "sheets": {
                "Study_Level": [{"Study ID": "S001", ...}, ...],
                "Cohort_Level": [...],
                ...
            }
        }
    """
    data = {
        "project": project.name,
        "sheets": {},
    }
    for sheet in project.data_sheets():
        data["sheets"][sheet] = records.get(sheet, [])

    content = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    _write_text_s3_safe(content, json_path)
    return {"json_path": json_path, "sheets": {s: len(records.get(s, [])) for s in project.data_sheets()}}


def write_json_nested(records: dict, project, json_path: str) -> dict:
    """Write records as a nested JSON file preserving the entity graph hierarchy.

    Structure:
        {
            "project": "radiology_base",
            "studies": [
                {
                    "Study_Level": {...},
                    "cohorts": [
                        {
                            "Cohort_Level": {...},
                            "protocols": [
                                {
                                    "Protocol_Level": {...},
                                    "outcomes": [{...}, ...]
                                }
                            ]
                        }
                    ],
                    "quality_assessments": [{...}, ...]
                }
            ]
        }
    """
    schema = project.schema
    eg = schema.entity_graph

    # Build parent-key indexes: {sheet: {parent_key_value: [rows]}}
    # This lets us find all children of a given parent row.
    by_parent: Dict[str, Dict[str, list]] = {}
    for sheet in schema.data_sheets:
        sheet_eg = eg.get(sheet, {})
        parent_key_field = sheet_eg.get("parent_key")
        if not parent_key_field:
            continue
        index = {}
        for row in records.get(sheet, []):
            pkv = row.get(parent_key_field)
            if pkv is not None:
                index.setdefault(str(pkv), []).append(row)
        by_parent[sheet] = index

    # Build hierarchy starting from root sheets (those with no parent)
    root_sheets = [s for s in schema.data_sheets if not eg.get(s, {}).get("parent")]

    def build_children(sheet: str, parent_row: dict) -> Dict[str, list]:
        """Find all child sheets of `sheet` and nest their records under parent_row."""
        children = {}
        for child_sheet in schema.data_sheets:
            child_eg = eg.get(child_sheet, {})
            if child_eg.get("parent") == sheet:
                parent_key_field = child_eg.get("parent_key")
                pk_value = parent_row.get(parent_key_field)
                if pk_value is None:
                    children[child_sheet] = []
                    continue
                child_rows = by_parent.get(child_sheet, {}).get(str(pk_value), [])
                # Recursively build grandchildren
                nested_children = []
                for crow in child_rows:
                    entry = dict(crow)
                    sub = build_children(child_sheet, crow)
                    entry["_children"] = sub
                    nested_children.append(entry)
                children[child_sheet] = nested_children
        return children

    studies = []
    for root_sheet in root_sheets:
        for row in records.get(root_sheet, []):
            entry = {root_sheet: row}
            entry["_children"] = build_children(root_sheet, row)
            studies.append(entry)

    data = {
        "project": project.name,
        "studies": studies,
    }

    content = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    _write_text_s3_safe(content, json_path)
    return {"json_path": json_path, "n_studies": len(studies)}


# --------------------------------------------------------------------------- #
# Combined writer: Excel + JSON + SQLite
# --------------------------------------------------------------------------- #
def write_all(records: dict, project, src_workbook: str, dest_dir: str, *,
              project_slug: Optional[str] = None,
              do_excel: bool = True,
              do_json_flat: bool = True,
              do_json_nested: bool = True,
              do_sqlite: bool = True,
              flags: Optional[dict] = None,
              work_dir: Optional[str] = None) -> dict:
    if not work_dir:
        work_dir = dest_dir if os.access(dest_dir, os.W_OK) else "/tmp"
    """Write reconciled records to all enabled formats.

    Args:
        records: {sheet: [row_dict, ...]}
        project: litextract Project
        src_workbook: path to the source codebook .xlsx (template for Excel output)
        dest_dir: directory for output files
        project_slug: base filename for outputs (defaults to project.name)
        do_excel/do_json_flat/do_json_nested/do_sqlite: toggles
        flags: optional confidence flags for Excel cell coloring
        work_dir: staging directory

    Returns:
        {
            "excel": {...} | None,
            "json_flat": {...} | None,
            "json_nested": {...} | None,
            "sqlite": {...} | None,
            "dest_dir": str,
        }
    """
    slug = project_slug or project.name or "extraction"
    os.makedirs(dest_dir, exist_ok=True)

    result = {"dest_dir": dest_dir, "excel": None, "json_flat": None,
              "json_nested": None, "sqlite": None}

    # Excel
    if do_excel:
        xlsx_path = os.path.join(dest_dir, f"{slug}_extraction.xlsx")
        result["excel"] = append_records(
            records, project, src_workbook, xlsx_path,
            flags=flags, work_dir=work_dir,
        )

    # JSON flat
    if do_json_flat:
        json_path = os.path.join(dest_dir, f"{slug}_extraction_flat.json")
        result["json_flat"] = write_json_flat(records, project, json_path)

    # JSON nested
    if do_json_nested:
        json_path = os.path.join(dest_dir, f"{slug}_extraction_nested.json")
        result["json_nested"] = write_json_nested(records, project, json_path)

    # SQLite
    if do_sqlite:
        db_path = os.path.join(dest_dir, f"{slug}_extraction.db")
        result["sqlite"] = write_sqlite(records, project, db_path, work_dir=work_dir)

    return result


# --------------------------------------------------------------------------- #
# SQLite reader (for round-trip verification and the review app)
# --------------------------------------------------------------------------- #
def read_sqlite(db_path: str, project) -> dict:
    """Read all records from a SQLite database back into the {sheet: [row_dict]} format.

    Uses the _radextract_metadata table to restore original field names.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Load column maps from metadata
    meta_rows = conn.execute(
        "SELECT sheet, original_name, sql_column, field_order FROM _radextract_metadata ORDER BY sheet, field_order"
    ).fetchall()

    # Build {sheet: [(orig_name, sql_col, order), ...]}
    sheet_cols: Dict[str, List[Tuple[str, str, int]]] = {}
    for r in meta_rows:
        sheet_cols.setdefault(r["sheet"], []).append(
            (r["original_name"], r["sql_column"], r["field_order"])
        )

    records = {}
    for sheet in project.data_sheets():
        table_name = sanitize_table_name(sheet)
        cols = sheet_cols.get(sheet, [])
        if not cols:
            records[sheet] = []
            continue

        sql_cols = [c[1] for c in cols]
        orig_names = [c[0] for c in cols]

        try:
            col_list = ", ".join('"' + c + '"' for c in sql_cols)
            rows = conn.execute(
                'SELECT ' + col_list + ' FROM "' + table_name + '"'
            ).fetchall()
        except sqlite3.OperationalError:
            records[sheet] = []
            continue

        sheet_records = []
        for row in rows:
            rec = {}
            for orig, sql_col in zip(orig_names, sql_cols):
                rec[orig] = row[sql_col]
            sheet_records.append(rec)
        records[sheet] = sheet_records

    conn.close()
    return records


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _write_text_s3_safe(content: str, dest_path: str):
    """Write text content, staging in /workspace for S3-backed destinations."""
    if dest_path.startswith("/mnt/results") or dest_path.startswith("/mnt/shared-workspace"):
        staging = os.path.join("/workspace", f"json_staging_{os.getpid()}.tmp")
        with open(staging, "w", encoding="utf-8") as f:
            f.write(content)
        subprocess.run(["cp", staging, dest_path], check=True)
        os.remove(staging)
    else:
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(content)
