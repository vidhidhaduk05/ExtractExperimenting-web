"""
validate.py — config-driven validation.

Generalizes the original hardcoded checks (cvr_helpers.check_relational_integrity
and validate_cvr_workbook.py) into rule kinds driven by validation_rules.yaml,
plus two codebook-wide checks applied automatically:

  * required : codebook 'Required' fields must be populated
  * vocab    : controlled-vocab cells hold an allowed value or a missing token

Input is a *records* structure: {sheet: [row_dict, ...]} for each data sheet.
A convenience loader reads this structure from a written workbook.

Returns (issues, summary) — the SAME tuple contract as the original validator,
so existing callers keep working. Each issue:
    {sheet, row, column, issue, severity}   severity in {error, warn}.
"""
from __future__ import annotations
import re
from typing import Optional


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _num(x):
    if x is None:
        return None
    s = str(x).replace(",", "").strip()
    if re.search(r"(±|–|—|\bto\b|:|/|\s-\s)", s):
        return None
    try:
        return float(s.rstrip("%"))
    except Exception:
        return None


# Dropdown placeholders that mean "nothing entered yet" (template defaults).
# These are treated as truly-empty for the REQUIRED check.
_PLACEHOLDERS = {"select category", "select option", "select", "choose", "choose one"}


def _truly_blank(v) -> bool:
    """True only when a cell is genuinely empty / an unfilled dropdown default.

    Mirrors the proven CVR validator's ``_is_blank``: a controlled-vocab answer
    such as ``none`` / ``not_reported`` / ``NR`` is a *meaningful datum*, NOT an
    empty cell, even though those tokens also appear in ``missing_tokens`` (which
    is used elsewhere only to skip numeric/format checks).
    """
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() in _PLACEHOLDERS


def _blank(v, missing_tokens) -> bool:
    """Empty OR a designated missing token.

    Used where a missing token should be *skipped* (numeric-format and
    comparator-resolution checks), NOT for the required-field check.
    """
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() in _PLACEHOLDERS or s in missing_tokens


def _rows(records, sheet):
    return records.get(sheet, [])


# --------------------------------------------------------------------------- #
# Rule implementations
# --------------------------------------------------------------------------- #
def _rule_key_resolves(rule, records, project, issues):
    sheet = rule["sheet"]
    parent_sheet = rule.get("parent_sheet") or project.schema.parent_of(sheet)
    pkf = rule["parent_key_field"]
    parent_key_field = project.schema.key_of(parent_sheet) if rule.get("use_parent_key") else pkf
    parent_vals = {str(r.get(parent_key_field)) for r in _rows(records, parent_sheet)}
    for i, r in enumerate(_rows(records, sheet), start=1):
        val = r.get(pkf)
        if val is not None and str(val) not in parent_vals:
            issues.append({"sheet": sheet, "row": i, "column": pkf,
                           "issue": f"{rule['message']}: {val!r}", "severity": rule["severity"]})


def _rule_unique_within_parent(rule, records, project, issues):
    sheet, pf, kf = rule["sheet"], rule["parent_field"], rule["key_field"]
    seen = set()
    for i, r in enumerate(_rows(records, sheet), start=1):
        key = (str(r.get(pf)), str(r.get(kf)))
        if key in seen:
            issues.append({"sheet": sheet, "row": i, "column": kf,
                           "issue": f"{rule['message']}: {r.get(kf)!r} in {r.get(pf)!r}",
                           "severity": rule["severity"]})
        seen.add(key)


def _rule_comparator_resolves(rule, records, project, issues):
    sheet = rule["sheet"]
    parent_sheet = rule.get("parent_sheet") or project.schema.parent_of(sheet)
    ref_field = rule["ref_field"]
    pkf, prf = rule["parent_key_field"], rule["parent_ref_field"]
    allow_missing = rule.get("allow_missing", False)
    mt = project.schema.missing_tokens
    valid = {(str(r.get(pkf)), str(r.get(prf))) for r in _rows(records, parent_sheet)}
    for i, r in enumerate(_rows(records, sheet), start=1):
        ref = r.get(ref_field)
        if _blank(ref, mt):
            if allow_missing:
                continue
            # required ref left blank is caught by the 'required' pass
            continue
        key = (str(r.get(pkf)), str(ref))
        if key not in valid:
            issues.append({"sheet": sheet, "row": i, "column": ref_field,
                           "issue": f"{rule['message']}: {ref!r}", "severity": rule["severity"]})


def _rule_range(rule, records, project, issues):
    sheet, fld = rule["sheet"], rule["field"]
    lo, hi = rule.get("min"), rule.get("max")
    for i, r in enumerate(_rows(records, sheet), start=1):
        n = _num(r.get(fld))
        if n is None:
            continue
        if (lo is not None and n < lo) or (hi is not None and n > hi):
            issues.append({"sheet": sheet, "row": i, "column": fld,
                           "issue": f"{rule['message']}: {n}", "severity": rule["severity"]})


def _rule_year(rule, records, project, issues):
    sheet, fld = rule["sheet"], rule["field"]
    lo, hi = rule.get("min", 1000), rule.get("max", 9999)
    for i, r in enumerate(_rows(records, sheet), start=1):
        v = r.get(fld)
        if v is None or str(v).strip() == "":
            continue
        s = str(v).strip()
        ok = bool(re.fullmatch(r"\d{4}", s)) and lo <= int(s) <= hi
        if not ok:
            issues.append({"sheet": sheet, "row": i, "column": fld,
                           "issue": f"{rule['message']}: {v!r}", "severity": rule["severity"]})


def _rule_le_field(rule, records, project, issues):
    sheet, fa, fb = rule["sheet"], rule["field_a"], rule["field_b"]
    for i, r in enumerate(_rows(records, sheet), start=1):
        a, b = _num(r.get(fa)), _num(r.get(fb))
        if a is not None and b is not None and a > b:
            issues.append({"sheet": sheet, "row": i, "column": fa,
                           "issue": f"{rule['message']}: {a} > {b}", "severity": rule["severity"]})


def _rule_le_parent_field(rule, records, project, issues):
    sheet = rule["sheet"]
    parent_sheet = rule.get("parent_sheet") or project.schema.parent_of(sheet)
    fld, pfld = rule["field"], rule["parent_field"]
    pkf, prf = rule["parent_key_field"], rule["parent_ref_field"]
    self_ref = rule["self_ref_field"]
    # index parent rows by (parent_key, parent_ref)
    pidx = {}
    for r in _rows(records, parent_sheet):
        pidx[(str(r.get(pkf)), str(r.get(prf)))] = r
    for i, r in enumerate(_rows(records, sheet), start=1):
        n = _num(r.get(fld))
        if n is None:
            continue
        parent = pidx.get((str(r.get(pkf)), str(r.get(self_ref))))
        if not parent:
            continue
        pn = _num(parent.get(pfld))
        if pn is not None and n > pn:
            issues.append({"sheet": sheet, "row": i, "column": fld,
                           "issue": f"{rule['message']}: {n} > {pn}", "severity": rule["severity"]})


def _rule_numeric_format(rule, records, project, issues):
    sheet, fld = rule["sheet"], rule["field"]
    mt = project.schema.missing_tokens
    for i, r in enumerate(_rows(records, sheet), start=1):
        v = r.get(fld)
        if _blank(v, mt):
            continue
        if _num(v) is None:  # non-scalar
            issues.append({"sheet": sheet, "row": i, "column": fld,
                           "issue": f"{rule['message']}: {v!r}", "severity": rule["severity"]})


def _rule_conditional_required(rule, records, project, issues):
    """A field is required when another field in the same row has a specific value.

    Parameters:
        condition_field  : the field whose value triggers the requirement
        condition_value  : the value that triggers the requirement
        required_field   : the field that becomes required
        condition_mode   : 'equal' (default) or 'not_equal'
                           — 'equal': required when condition_field == condition_value
                           — 'not_equal': required when condition_field != condition_value
    """
    sheet = rule["sheet"]
    cond_field = rule["condition_field"]
    cond_value = rule["condition_value"]
    req_field = rule["required_field"]
    mode = rule.get("condition_mode", "equal")
    for i, r in enumerate(_rows(records, sheet), start=1):
        cv = r.get(cond_field)
        if cv is None or str(cv).strip() == "":
            continue  # condition field itself is blank — skip
        cv_str = str(cv).strip()
        triggered = (cv_str == str(cond_value)) if mode == "equal" else (cv_str != str(cond_value))
        if not triggered:
            continue
        # condition is met — check if required_field is truly blank
        if req_field not in r:
            issues.append({"sheet": sheet, "row": i, "column": req_field,
                           "issue": rule["message"], "severity": rule["severity"]})
            continue
        if _truly_blank(r.get(req_field)):
            issues.append({"sheet": sheet, "row": i, "column": req_field,
                           "issue": rule["message"], "severity": rule["severity"]})


_RULE_DISPATCH = {
    "key_resolves": _rule_key_resolves,
    "unique_within_parent": _rule_unique_within_parent,
    "comparator_resolves": _rule_comparator_resolves,
    "range": _rule_range,
    "year": _rule_year,
    "le_field": _rule_le_field,
    "le_parent_field": _rule_le_parent_field,
    "numeric_format": _rule_numeric_format,
    "conditional_required": _rule_conditional_required,
}


# --------------------------------------------------------------------------- #
# Codebook-wide automatic checks
# --------------------------------------------------------------------------- #
def _check_required(records, project, issues):
    for sheet in project.data_sheets():
        for i, r in enumerate(_rows(records, sheet), start=1):
            for _, name in project.sheet_order[sheet]:
                rec = project.codebook.get((sheet, name), {})
                if str(rec.get("required", "")).strip().lower() == "required":
                    if name not in r:
                        continue  # field absent from row dict -> treat as not-yet-entered, skip
                    # truly-empty only: a controlled-vocab 'none'/'not_reported'/'NR'
                    # is a real answer, not an empty cell (matches proven CVR validator)
                    if _truly_blank(r.get(name)):
                        issues.append({"sheet": sheet, "row": i, "column": name,
                                       "issue": "Required field is empty", "severity": "error"})


def _check_vocab(records, project, issues):
    mt = set(project.schema.missing_tokens)
    for (sheet, name), allowed in project.vocab.items():
        allowset = set(allowed)
        for i, r in enumerate(_rows(records, sheet), start=1):
            if name not in r:
                continue
            v = r.get(name)
            if v is None or str(v).strip() == "":
                continue
            sval = str(v).strip()
            if sval not in allowset and sval not in mt:
                issues.append({"sheet": sheet, "row": i, "column": name,
                               "issue": f"Value {sval!r} not in controlled vocabulary",
                               "severity": "error"})


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def validate(records, project, *, run_required=True, run_vocab=True):
    """Validate a records structure ({sheet: [row,...]}) against the project.

    Returns (issues, summary). Summary counts errors/warnings and lists rule ids
    that fired.
    """
    issues = []
    if run_required:
        _check_required(records, project, issues)
    if run_vocab:
        _check_vocab(records, project, issues)
    for rule in project.rules:
        kind = rule.get("kind")
        fn = _RULE_DISPATCH.get(kind)
        if fn is None:
            # documented-but-auto kinds (required/vocab) or unknown -> skip silently for auto
            continue
        fn(rule, records, project, issues)

    errs = [i for i in issues if i.get("severity") == "error"]
    warns = [i for i in issues if i.get("severity") == "warn"]
    summary = {"n_issues": len(issues), "n_errors": len(errs), "n_warnings": len(warns),
               "ok": len(errs) == 0}
    return issues, summary


def workbook_to_records(workbook_path, project) -> dict:
    """Read a written workbook into the {sheet: [row_dict,...]} records structure."""
    import openpyxl
    wb = openpyxl.load_workbook(workbook_path, data_only=True)
    start = project.schema.data_start_row
    out = {}
    for sheet in project.data_sheets():
        ws = wb[sheet]
        headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
        rows = []
        for r in range(start, ws.max_row + 1):
            if ws.cell(r, 1).value in (None, ""):
                continue
            row = {}
            for c, h in enumerate(headers, start=1):
                if h is None:
                    continue
                row[str(h).strip()] = ws.cell(r, c).value
            rows.append(row)
        out[sheet] = rows
    return out
