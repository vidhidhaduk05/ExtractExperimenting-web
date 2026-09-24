"""
schema.py — project schema + the Project bundle.

``schema.yaml`` declares everything domain-specific that is *not* already in the
codebook workbook:

    data_sheets:        ordered list of sheet names (parent first)
    entity_graph:       parent/child relationships and the linking keys
    field_types:        per-field type + optional unit + numeric tolerance
    missing_tokens:     strings that count as "missing" (NR / NA / unclear ...)
    type_defaults:      fallback type per codebook 'Expected Format' value
    data_start_row:     first data row in the workbook (row 1 header, 2 hint)

A ``Project`` bundles the parsed codebook, the schema, the validation rules, and
the prompt library — everything a pipeline run needs.
"""
from __future__ import annotations
import os
from dataclasses import dataclass, field
from typing import Optional

import yaml

from .codebook import load_codebook, controlled_vocab


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
@dataclass
class Schema:
    data_sheets: list
    entity_graph: dict          # {sheet: {role, key, parent, parent_key}}
    field_types: dict           # {(sheet, name): {type, unit?, tol?}}
    missing_tokens: list
    type_defaults: dict         # {format_string_lower: type}
    data_start_row: int = 3
    codebook_sheet: str = "Codebook"

    # -- type lookups -------------------------------------------------------
    def field_type(self, sheet: str, name: str, codebook: Optional[dict] = None) -> str:
        """Resolve a field's type: explicit field_types override, else mapped
        from the codebook 'Expected Format', else 'free_text'."""
        ft = self.field_types.get((sheet, name)) or self.field_types.get(f"{sheet}::{name}")
        if ft and ft.get("type"):
            return ft["type"]
        if codebook is not None:
            rec = codebook.get((sheet, name))
            if rec and rec.get("format"):
                return self.type_defaults.get(str(rec["format"]).strip().lower(), "free_text")
        return "free_text"

    def tolerance(self, sheet: str, name: str) -> float:
        ft = self.field_types.get((sheet, name)) or self.field_types.get(f"{sheet}::{name}") or {}
        return float(ft.get("tol", 0.0) or 0.0)

    def unit(self, sheet: str, name: str):
        ft = self.field_types.get((sheet, name)) or self.field_types.get(f"{sheet}::{name}") or {}
        return ft.get("unit")

    def parent_of(self, sheet: str) -> Optional[str]:
        return self.entity_graph.get(sheet, {}).get("parent")

    def key_of(self, sheet: str) -> Optional[str]:
        return self.entity_graph.get(sheet, {}).get("key")


def _normalize_field_types(raw: dict) -> dict:
    """Accept both 'Sheet::Field' string keys and nested {sheet: {field: {...}}}."""
    out = {}
    if not raw:
        return out
    for k, v in raw.items():
        if isinstance(v, dict) and all(isinstance(vv, dict) for vv in v.values()):
            # nested {sheet: {field: {...}}}
            for fld, meta in v.items():
                out[(k, fld)] = meta or {}
        else:
            if "::" in k:
                sheet, fld = k.split("::", 1)
                out[(sheet, fld)] = v or {}
            else:
                out[k] = v or {}
    return out


def load_schema(path: str) -> Schema:
    with open(path, "r", encoding="utf-8") as fh:
        d = yaml.safe_load(fh) or {}
    return Schema(
        data_sheets=d["data_sheets"],
        entity_graph=d.get("entity_graph", {}),
        field_types=_normalize_field_types(d.get("field_types", {})),
        missing_tokens=d.get("missing_tokens", ["NR", "NA", "unclear", ""]),
        type_defaults={str(k).lower(): v for k, v in (d.get("type_defaults", {}) or {}).items()},
        data_start_row=int(d.get("data_start_row", 3)),
        codebook_sheet=d.get("codebook_sheet", "Codebook"),
    )


# --------------------------------------------------------------------------- #
# Validation rules
# --------------------------------------------------------------------------- #
def load_rules(path: str) -> list:
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as fh:
        d = yaml.safe_load(fh) or {}
    return d.get("rules", [])


# --------------------------------------------------------------------------- #
# Project bundle
# --------------------------------------------------------------------------- #
@dataclass
class Project:
    name: str
    root: str
    codebook: dict
    sheet_order: dict
    vocab: dict
    schema: Schema
    rules: list
    prompts: dict = field(default_factory=dict)
    codebook_path: str = ""

    def data_sheets(self) -> list:
        return self.schema.data_sheets


def _load_prompts(prompt_dir: str) -> dict:
    """Load any JSON prompt files in prompts/ into {stem: parsed}."""
    import json
    prompts = {}
    if prompt_dir and os.path.isdir(prompt_dir):
        for fn in sorted(os.listdir(prompt_dir)):
            if fn.lower().endswith(".json"):
                with open(os.path.join(prompt_dir, fn), "r", encoding="utf-8") as fh:
                    try:
                        prompts[os.path.splitext(fn)[0]] = json.load(fh)
                    except Exception:
                        prompts[os.path.splitext(fn)[0]] = None
    return prompts


def load_project(config_dir: str) -> Project:
    """Load a project config folder into a Project.

    Expected layout:
        <config_dir>/project.yaml          (name + codebook filename)
        <config_dir>/<codebook>.xlsx       (codebook workbook)
        <config_dir>/schema.yaml
        <config_dir>/validation_rules.yaml
        <config_dir>/prompts/*.json        (optional)
    """
    meta_path = os.path.join(config_dir, "project.yaml")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = yaml.safe_load(fh) or {}
    name = meta.get("name", os.path.basename(os.path.normpath(config_dir)))
    codebook_file = meta.get("codebook", "codebook.xlsx")
    codebook_path = os.path.join(config_dir, codebook_file)

    schema = load_schema(os.path.join(config_dir, "schema.yaml"))
    cb, so, cv = load_codebook(codebook_path, codebook_sheet=schema.codebook_sheet)
    rules = load_rules(os.path.join(config_dir, "validation_rules.yaml"))
    prompts = _load_prompts(os.path.join(config_dir, "prompts"))

    # sanity: schema data_sheets must exist in the codebook
    missing = [s for s in schema.data_sheets if s not in so]
    if missing:
        raise ValueError(f"schema.data_sheets {missing} not found in codebook "
                         f"sheets {list(so.keys())}")
    return Project(name=name, root=config_dir, codebook=cb, sheet_order=so, vocab=cv,
                   schema=schema, rules=rules, prompts=prompts, codebook_path=codebook_path)
