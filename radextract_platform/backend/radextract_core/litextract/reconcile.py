"""
reconcile.py — type-aware comparison of two extractor records.

Decision (per the approved plan): compare values with a per-field-type
comparator —
  * int / float / percent / year : numeric equality within the field tolerance
  * enum                          : exact string match (controlled vocab)
  * free_text                     : normalized match (casefold, collapse
                                    whitespace, strip surrounding punctuation)
Provenance (page / source quote) is recorded for the audit but is NOT decisive
for agreement, so cosmetic differences do not needlessly invoke the referee.

Output: a list of per-cell decisions plus a summary. Each cell:
    {path, sheet, key, field, a, b, status}  status in {agree, disagree, one_missing}
``path`` is a stable string like "Cohort_Methods[Choi_2022_C1].Female (%)".
"""
from __future__ import annotations
import re
import unicodedata
from typing import Any, Optional

from .extract import Record


# --------------------------------------------------------------------------- #
# Value normalization + numeric parsing
# --------------------------------------------------------------------------- #
def _is_missing(v, missing_tokens) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s in missing_tokens


def _to_number(x) -> Optional[float]:
    """Parse the FIRST numeric token in a value; None if not a clean scalar.

    Returns None for non-scalars (ranges, mean±SD), which therefore never
    'agree' numerically — they fall back to text comparison.
    """
    if x is None:
        return None
    s = str(x).strip().replace(",", "")
    # reject obvious non-scalars so they don't silently match
    if re.search(r"(±|–|—|\bto\b|:|/|\s-\s)", s):
        return None
    m = re.fullmatch(r"[-+]?\d*\.?\d+%?", s)
    if not m:
        return None
    return float(s.rstrip("%"))


def _norm_text(s) -> str:
    s = unicodedata.normalize("NFKC", str(s))
    s = s.casefold()
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip(" .,;:")


def compare_values(a, b, *, field_type: str = "free_text", tol: float = 0.0,
                   missing_tokens=("NR", "NA", "unclear", "")) -> str:
    """Return 'agree' | 'disagree' | 'one_missing' for a single cell."""
    a_missing, b_missing = _is_missing(a, missing_tokens), _is_missing(b, missing_tokens)
    if a_missing and b_missing:
        return "agree"
    if a_missing != b_missing:
        return "one_missing"

    if field_type in ("int", "float", "percent", "year"):
        na, nb = _to_number(a), _to_number(b)
        if na is not None and nb is not None:
            # '<= tol' with a tiny epsilon so a difference *equal* to the
            # tolerance (e.g. 0.80 vs 0.79 at tol=0.01) is not rejected purely
            # by floating-point representation error.
            eps = 1e-9 + 1e-9 * max(abs(na), abs(nb), abs(tol))
            return "agree" if abs(na - nb) <= tol + eps else "disagree"
        # non-scalar in a numeric field -> compare as text
        return "agree" if _norm_text(a) == _norm_text(b) else "disagree"

    if field_type == "enum":
        return "agree" if str(a).strip() == str(b).strip() else "disagree"

    # free_text
    return "agree" if _norm_text(a) == _norm_text(b) else "disagree"


# --------------------------------------------------------------------------- #
# Record-level reconciliation
# --------------------------------------------------------------------------- #
def _key_for(sheet: str, row: dict, project) -> str:
    kf = project.schema.key_of(sheet)
    return str(row.get(kf, "?")) if kf else "?"


def _iter_cells(rec: Record, project):
    """Yield (sheet, key, field, value) for the parent row + all child rows."""
    parent_sheet = project.data_sheets()[0]
    pkey = _key_for(parent_sheet, rec.parent_row, project)
    for fld, val in rec.parent_row.items():
        yield parent_sheet, pkey, fld, val
    for sheet, rows in rec.child_rows.items():
        for row in rows:
            key = _key_for(sheet, row, project)
            for fld, val in row.items():
                yield sheet, key, fld, val


def _index(rec: Record, project) -> dict:
    """{(sheet, key, field): value} for fast lookup."""
    return {(s, k, f): v for (s, k, f, v) in _iter_cells(rec, project)}


def reconcile(rec_a, rec_b, project) -> dict:
    """Compare two records cell-by-cell.

    Returns {"cells": [...], "summary": {...}}. ``cells`` covers the UNION of
    cells present in either record, so a field one agent omitted surfaces as
    'one_missing'.
    """
    if not isinstance(rec_a, Record):
        rec_a = Record.from_dict(rec_a)
    if not isinstance(rec_b, Record):
        rec_b = Record.from_dict(rec_b)

    idx_a, idx_b = _index(rec_a, project), _index(rec_b, project)
    all_keys = list(idx_a.keys())
    for k in idx_b.keys():
        if k not in idx_a:
            all_keys.append(k)

    missing_tokens = project.schema.missing_tokens
    cells = []
    counts = {"agree": 0, "disagree": 0, "one_missing": 0}
    for (sheet, key, fld) in all_keys:
        a = idx_a.get((sheet, key, fld))
        b = idx_b.get((sheet, key, fld))
        ft = project.schema.field_type(sheet, fld, project.codebook)
        tol = project.schema.tolerance(sheet, fld)
        status = compare_values(a, b, field_type=ft, tol=tol, missing_tokens=missing_tokens)
        counts[status] += 1
        cells.append({"path": f"{sheet}[{key}].{fld}", "sheet": sheet, "key": key,
                      "field": fld, "field_type": ft, "a": a, "b": b, "status": status})

    total = len(cells) or 1
    summary = {"n_cells": len(cells), **counts,
               "agreement_rate": round(counts["agree"] / total, 4),
               "n_to_adjudicate": counts["disagree"] + counts["one_missing"]}
    return {"cells": cells, "summary": summary}
