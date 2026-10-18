"""Extraction prompt builder: one extraction prompt per variable.

Implements the column-header-as-prompt rule: the prompt for a field is built
from the variable name (underscores -> spaces), its description (the field-level
rule, like a header comment), and its format constraints (field_type,
allowed_values, range).

The generated prompt is stored on the variable (`variables.extraction_prompt`)
at creation time and regenerated on edit, so the instruction behind every
extracted value is visible and auditable.
"""
from __future__ import annotations

from typing import Optional


_FORMAT_HINTS = {
    "int": "Format: a single integer.",
    "float": "Format: a single numeric value.",
    "percent": "Format: a numeric percentage between 0 and 100.",
    "enum": "Format: exactly one of the allowed values.",
    "bool": "Format: Yes or No.",
    "free_text": "Format: the value exactly as reported.",
}


def build_field_prompt(var: dict) -> str:
    """Build the extraction prompt for one variable.

    Args:
        var: variable row/dict with name, description, field_type,
             allowed_values, range_min, range_max, and optionally a stored
             extraction_prompt (which takes precedence when non-empty).

    Returns:
        The extraction prompt string.
    """
    stored = (var.get("extraction_prompt") or "").strip()
    if stored:
        return stored

    name = (var.get("name") or "").strip()
    readable = name.replace("_", " ").strip()
    description = (var.get("description") or "").strip()
    field_type = (var.get("field_type") or "free_text").strip()

    parts = [f"Extract: {readable}."]
    if description:
        parts.append(description.rstrip(".") + ".")

    fmt = _FORMAT_HINTS.get(field_type, _FORMAT_HINTS["free_text"])
    parts.append(fmt)

    if field_type == "enum" and var.get("allowed_values"):
        parts.append(f"Allowed values: {var['allowed_values']}.")

    lo, hi = var.get("range_min"), var.get("range_max")
    if lo is not None and hi is not None:
        parts.append(f"Valid range: {lo} to {hi}.")

    parts.append(
        "Search the full text, all tables, and any supplementary material. "
        "If the field is not reported, return NOT_FOUND."
    )
    return " ".join(parts)


def build_all_prompts(variables: list[dict]) -> dict[str, str]:
    """Build {variable_id: prompt} for the whole coding form."""
    return {v["variable_id"]: build_field_prompt(v) for v in variables}
