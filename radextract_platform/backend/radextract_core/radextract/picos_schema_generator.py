"""
picos_schema_generator.py — generate topic-specific extraction fields from PICOS.

The core innovation of RadExtract: the extraction schema is NOT fully fixed.
It has a base layer (universal radiology fields) plus a PICOS-generated layer
(topic-specific fields produced by an LLM from the user's PICOS input).

Flow:
  1. User confirms PICOS (Population, Intervention, Comparator, Outcome, Study design)
  2. LLM generates 5–15 topic-specific fields with types, allowed values, descriptions
  3. Generated fields are merged with the base radiology template
  4. A complete LitExtract config folder is written:
     - schema.yaml (entity graph + merged field types)
     - codebook.xlsx (all fields with metadata)
     - validation_rules.yaml (base + PICOS-generated rules)
     - prompts/field_prompts.json (base + PICOS field prompts)
     - picos.yaml (original PICOS for audit/reproducibility)

Two backends (mirroring extract.py and screening.py):
  DeterministicSchemaGenerator — injected fields, for tests/demos
  LLMSchemaGenerator — delegates field generation to a model_fn
"""
from __future__ import annotations
import json
import os
import re
import shutil
from dataclasses import dataclass, field
from typing import Callable, Optional, Dict, List, Any

import yaml
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation


# --------------------------------------------------------------------------- #
# Data structures
# --------------------------------------------------------------------------- #
@dataclass
class GeneratedField:
    """A topic-specific field generated from PICOS."""
    sheet: str               # Cohort_Level | Protocol_Level | Outcome_Level
    order: int               # column order within the sheet (continues from base)
    name: str                # Final Column Name
    field_type: str          # int | float | percent | enum | free_text
    allowed_values: list     # for enum type: list of allowed values
    range_min: Optional[float] = None  # for numeric types
    range_max: Optional[float] = None
    description: str = ""    # what to enter
    why: str = ""            # rationale
    notes: str = ""

    def to_codebook_row(self) -> tuple:
        """Return a tuple matching the codebook column layout."""
        fmt_map = {"int": "Integer", "float": "Number", "percent": "Percentage",
                   "enum": "Category", "free_text": "Text"}
        fmt = fmt_map.get(self.field_type, "Text")
        if self.allowed_values:
            allowed = "; ".join(self.allowed_values)
        elif self.range_min is not None and self.range_max is not None:
            allowed = f"{self.range_min}-{self.range_max}"
        else:
            allowed = "Unique free text"
        return (self.sheet, self.order, self.name, self.why, self.description,
                fmt, allowed, "Conditional", self.notes)

    def to_schema_entry(self) -> dict:
        """Return a field_types entry for schema.yaml."""
        entry = {"type": self.field_type}
        if self.field_type in ("float", "percent") and self.range_min is not None:
            entry["tol"] = 0.01
        return entry

    def to_prompt_entry(self) -> dict:
        """Return a prompt entry for field_prompts.json."""
        fmt_map = {"int": "Integer", "float": "Number", "percent": "Percentage (0-100)",
                   "enum": "Category", "free_text": "Text"}
        constraints = f"Format: {fmt_map.get(self.field_type, 'Text')}."
        if self.allowed_values:
            constraints = f"Controlled vocabulary (must match a dropdown value exactly). {constraints}"
        allowed = "; ".join(self.allowed_values) if self.allowed_values else "Unique free text"
        return {
            "sheet": self.sheet,
            "order": self.order,
            "name": self.name,
            "required": "Conditional",
            "prompt": f"From this study, identify the **{self.name.lower()}**: {self.description}. (Purpose: {self.why}.)",
            "constraints": constraints,
            "allowed": allowed,
            "missing": "If not reported, use `NR`.",
            "notes": self.notes,
            "navigation_hint": "",  # LLM can fill this in
        }

    def to_validation_rules(self) -> list:
        """Return validation rules for this field (range or vocab)."""
        rules = []
        if self.field_type in ("float", "percent", "int") and self.range_min is not None:
            rules.append({
                "id": f"picos_{re.sub(r'[^a-z0-9]', '_', self.name.lower())}_range",
                "kind": "range",
                "sheet": self.sheet,
                "field": self.name,
                "min": self.range_min,
                "max": self.range_max,
                "severity": "error",
                "message": f"{self.name} outside {self.range_min}-{self.range_max}",
            })
        return rules


@dataclass
class PICOS:
    """PICOS input for a systematic review."""
    population: str
    intervention: str
    comparator: str
    outcome: str
    study_design: str

    def to_dict(self) -> dict:
        return {"population": self.population, "intervention": self.intervention,
                "comparator": self.comparator, "outcome": self.outcome,
                "study_design": self.study_design}

    @staticmethod
    def from_dict(d: dict) -> "PICOS":
        return PICOS(**{k: d.get(k, "") for k in
                        ("population", "intervention", "comparator", "outcome", "study_design")})


# --------------------------------------------------------------------------- #
# Schema generator interface
# --------------------------------------------------------------------------- #
class SchemaGenerator:
    """Interface: ``generate_fields(picos) -> list[GeneratedField]``."""

    def generate_fields(self, picos: PICOS) -> list:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# DeterministicSchemaGenerator — for tests and demos
# --------------------------------------------------------------------------- #
class DeterministicSchemaGenerator(SchemaGenerator):
    """Returns injected fields, for reproducible tests.

    Provide ONE of:
      * ``fields`` — a static list of GeneratedField objects
      * ``fields_fn(picos) -> list[GeneratedField]`` — computed fields
    """
    def __init__(self, *, fields: Optional[list] = None,
                 fields_fn: Optional[Callable] = None):
        self.fields = fields or []
        self.fields_fn = fields_fn

    def generate_fields(self, picos: PICOS) -> list:
        if self.fields_fn:
            return self.fields_fn(picos)
        return self.fields


# --------------------------------------------------------------------------- #
# LLMSchemaGenerator — delegates to a model_fn
# --------------------------------------------------------------------------- #
class LLMSchemaGenerator(SchemaGenerator):
    """LLM-driven schema generator.

    ``model_fn(prompt, **kwargs) -> dict`` must return a dict with key
    ``fields`` containing a list of field dicts.
    """
    def __init__(self, model_fn: Callable, *, base_field_names: Optional[list] = None):
        self.model_fn = model_fn
        self.base_field_names = base_field_names or []

    def _build_prompt(self, picos: PICOS) -> str:
        base_list = "\n".join(f"  {n}" for n in self.base_field_names) if self.base_field_names else "  (none)"
        return (
            f"You are a radiology systematic review expert. Given the following PICOS:\n"
            f"- Population: {picos.population}\n"
            f"- Intervention: {picos.intervention}\n"
            f"- Comparator: {picos.comparator}\n"
            f"- Outcome: {picos.outcome}\n"
            f"- Study design: {picos.study_design}\n\n"
            f"Generate topic-specific extraction fields for a radiology systematic review.\n"
            f"For each field, provide:\n"
            f"  - sheet: one of Cohort_Level, Protocol_Level, Outcome_Level\n"
            f"  - name: snake_case or human-readable field name\n"
            f"  - field_type: one of int, float, percent, enum, free_text\n"
            f"  - allowed_values: list of allowed values (for enum type only)\n"
            f"  - range_min: minimum value (for numeric types, optional)\n"
            f"  - range_max: maximum value (for numeric types, optional)\n"
            f"  - description: what to extract\n"
            f"  - why: rationale for including this field\n"
            f"  - notes: any additional notes\n\n"
            f"Base template fields already covered (do NOT duplicate):\n{base_list}\n\n"
            f"Generate 5–15 topic-specific fields that are NOT in the base template\n"
            f"but are essential for answering this specific PICOS question.\n\n"
            f"Return JSON: {{\"fields\": [{{...}}, ...]}}"
        )

    def generate_fields(self, picos: PICOS) -> list:
        prompt = self._build_prompt(picos)
        out = self.model_fn(prompt, picos=picos.to_dict())
        if isinstance(out, list):
            field_dicts = out
        else:
            field_dicts = (out or {}).get("fields", [])

        fields = []
        for i, fd in enumerate(field_dicts):
            sheet = fd.get("sheet", "Outcome_Level")
            # Determine order: continue from base field count for this sheet
            base_counts = {"Cohort_Level": 16, "Protocol_Level": 24, "Outcome_Level": 26}
            order = base_counts.get(sheet, 0) + i + 1
            fields.append(GeneratedField(
                sheet=sheet,
                order=order,
                name=fd.get("name", f"picos_field_{i}"),
                field_type=fd.get("field_type", "free_text"),
                allowed_values=fd.get("allowed_values", []),
                range_min=fd.get("range_min"),
                range_max=fd.get("range_max"),
                description=fd.get("description", ""),
                why=fd.get("why", ""),
                notes=fd.get("notes", ""),
            ))
        return fields


# --------------------------------------------------------------------------- #
# Config writer — merges base + PICOS fields and writes a complete config folder
# --------------------------------------------------------------------------- #
def generate_project_config(
    picos: PICOS,
    generator: SchemaGenerator,
    base_config_dir: str,
    output_dir: str,
    project_slug: Optional[str] = None,
) -> dict:
    """Generate a complete LitExtract config folder from PICOS + base template.

    Args:
        picos: PICOS input
        generator: a SchemaGenerator instance
        base_config_dir: path to the base radiology config (configs/radiology_base/)
        output_dir: parent directory for the generated config
        project_slug: folder name for the generated config (auto-derived if None)

    Returns:
        {"config_dir": str, "n_base_fields": int, "n_picos_fields": int,
         "n_total_fields": int, "fields": [GeneratedField, ...]}
    """
    # Derive project slug from PICOS if not provided
    if project_slug is None:
        # Simple slug: first few words of intervention, snake_case
        words = re.sub(r'[^a-z0-9\s]', '', picos.intervention.lower()).split()[:3]
        project_slug = "_".join(words) or "radiology_project"

    config_dir = os.path.join(output_dir, project_slug)
    os.makedirs(config_dir, exist_ok=True)
    os.makedirs(os.path.join(config_dir, "prompts"), exist_ok=True)

    # 1. Generate PICOS fields
    picos_fields = generator.generate_fields(picos)

    # 2. Load base config (standard LitExtract file names)
    base_schema_path = os.path.join(base_config_dir, "schema.yaml")
    base_rules_path = os.path.join(base_config_dir, "validation_rules.yaml")
    base_prompts_path = os.path.join(base_config_dir, "prompts", "field_prompts.json")
    base_codebook_path = os.path.join(base_config_dir, "codebook.xlsx")

    with open(base_schema_path, "r") as f:
        base_schema = yaml.safe_load(f)
    with open(base_rules_path, "r") as f:
        base_rules = yaml.safe_load(f)
    with open(base_prompts_path, "r") as f:
        base_prompts = json.load(f)

    # 3. Merge schema: add PICOS field types
    merged_field_types = dict(base_schema.get("field_types", {}))
    for pf in picos_fields:
        key = f"{pf.sheet}::{pf.name}"
        merged_field_types[key] = pf.to_schema_entry()

    merged_schema = dict(base_schema)
    merged_schema["field_types"] = merged_field_types

    # 4. Merge validation rules: add PICOS-generated rules
    merged_rules = list(base_rules.get("rules", []))
    for pf in picos_fields:
        merged_rules.extend(pf.to_validation_rules())

    merged_rules_doc = {"rules": merged_rules}

    # 5. Merge prompts: add PICOS field prompts
    merged_prompts = list(base_prompts)
    for pf in picos_fields:
        merged_prompts.append(pf.to_prompt_entry())

    # 6. Write picos.yaml (audit/reproducibility)
    picos_path = os.path.join(config_dir, "picos.yaml")
    with open(picos_path, "w") as f:
        yaml.safe_dump(picos.to_dict(), f, default_flow_style=False)

    # 7. Write schema.yaml
    schema_path = os.path.join(config_dir, "schema.yaml")
    with open(schema_path, "w") as f:
        yaml.safe_dump(merged_schema, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    # 8. Write validation_rules.yaml
    rules_path = os.path.join(config_dir, "validation_rules.yaml")
    with open(rules_path, "w") as f:
        yaml.safe_dump(merged_rules_doc, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    # 9. Write prompts/field_prompts.json
    prompts_path = os.path.join(config_dir, "prompts", "field_prompts.json")
    with open(prompts_path, "w", encoding="utf-8") as f:
        json.dump(merged_prompts, f, indent=2, ensure_ascii=False)

    # 10. Write project.yaml
    project_yaml = {
        "name": project_slug,
        "description": f"Radiology systematic review: {picos.intervention} for {picos.outcome} in {picos.population}",
        "codebook": "codebook.xlsx",
    }
    project_path = os.path.join(config_dir, "project.yaml")
    with open(project_path, "w") as f:
        yaml.safe_dump(project_yaml, f, default_flow_style=False)

    # 11. Generate codebook.xlsx (base + PICOS fields)
    _generate_merged_codebook(base_codebook_path, picos_fields,
                              os.path.join(config_dir, "codebook.xlsx"))

    # Count fields
    n_base = len(base_prompts)
    n_picos = len(picos_fields)

    return {
        "config_dir": config_dir,
        "project_slug": project_slug,
        "n_base_fields": n_base,
        "n_picos_fields": n_picos,
        "n_total_fields": n_base + n_picos,
        "fields": [pf.to_codebook_row() for pf in picos_fields],
    }


def _generate_merged_codebook(base_codebook_path: str, picos_fields: list,
                               output_path: str):
    """Generate a merged codebook.xlsx from the base codebook + PICOS fields."""
    # Load base codebook
    wb = openpyxl.load_workbook(base_codebook_path, data_only=True)

    # Read base Codebook sheet rows
    cb = wb["Codebook"]
    base_rows = []
    for r in range(2, cb.max_row + 1):
        row = [cb.cell(r, c).value for c in range(1, 10)]
        if row[0] is not None:  # sheet name
            base_rows.append(row)

    # Group PICOS fields by sheet
    picos_by_sheet = {}
    for pf in picos_fields:
        picos_by_sheet.setdefault(pf.sheet, []).append(pf)

    # Add PICOS fields to Codebook sheet
    next_row = cb.max_row + 1
    for pf in picos_fields:
        row_data = pf.to_codebook_row()
        for c, val in enumerate(row_data, 1):
            cb.cell(next_row, c, val)
        next_row += 1

    # Add PICOS field columns to data sheets
    for sheet_name, fields in picos_by_sheet.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        # Find the next empty column
        max_col = ws.max_column
        for i, pf in enumerate(fields):
            col = max_col + 1 + i
            ws.cell(1, col, pf.name)  # header
            ws.cell(2, col, "Enter data below. Use NR for not reported.")  # instruction

            # Add dropdown for enum fields
            if pf.allowed_values:
                formula = '"' + ",".join(pf.allowed_values) + '"'
                if len(formula) <= 255:
                    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
                    col_letter = openpyxl.utils.get_column_letter(col)
                    dv.add(f"{col_letter}3:{col_letter}1000")
                    ws.add_data_validation(dv)

    # Save (stage to /workspace first, then copy for S3 safety)
    staging = output_path.replace(".xlsx", ".staging.xlsx")
    if os.path.dirname(staging):
        os.makedirs(os.path.dirname(staging), exist_ok=True)
    wb.save(staging)
    wb.close()

    shutil.copyfile(staging, output_path)
    try:
        os.remove(staging)
    except OSError:
        pass
