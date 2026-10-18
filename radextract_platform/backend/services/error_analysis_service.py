"""Error analysis and active-learning dataset for clinical data extraction.

Tracks the human decision on each AI-extracted value during Track Changes review
(accepted / modified / rejected), classifies the discrepancy (normalization, false
extraction, missed context, numeric mismatch, value correction) and exports the
verified decisions as a chat-format fine-tuning / prompt-tuning dataset.

Decisions live in the ``extraction_decisions`` table (not a flat file), so they
are per project, survive redeploys and work with either database backend.
"""
from __future__ import annotations

import datetime
import json
import re
import uuid
from typing import Any, Dict, List, Optional

from services.db_backend import DBBackend

VALID_DECISIONS = ("accepted", "modified", "rejected")
_NOT_REPORTED = ("NR", "NOT REPORTED", "NA", "N/A")
CATEGORIES = ("NORMALIZATION", "FALSE_EXTRACTION", "MISSED_CONTEXT", "NUMERIC_MISMATCH", "VALUE_CORRECTION")


def classify_discrepancy(original: str, corrected: str, decision: str) -> str:
    orig = (original or "").strip()
    corr = (corrected or "").strip()

    if decision == "accepted" or orig.lower() == corr.lower():
        return "VERIFIED_ACCURATE"
    if decision == "rejected" or corr.upper() in _NOT_REPORTED:
        return "FALSE_EXTRACTION"
    if not orig or orig.upper() in _NOT_REPORTED:
        return "MISSED_CONTEXT"

    # Same characters once units, casing and punctuation are ignored: a format fix.
    if re.sub(r"[^a-zA-Z0-9]", "", orig).lower() == re.sub(r"[^a-zA-Z0-9]", "", corr).lower():
        return "NORMALIZATION"

    orig_nums = re.findall(r"[-+]?\d*\.?\d+", orig)
    corr_nums = re.findall(r"[-+]?\d*\.?\d+", corr)
    if orig_nums and corr_nums:
        return "NUMERIC_MISMATCH" if orig_nums != corr_nums else "NORMALIZATION"
    return "VALUE_CORRECTION"


def learning_rationale(category: str, orig: str, corr: str, var_name: str) -> str:
    if category == "VERIFIED_ACCURATE":
        return f"AI prediction '{orig}' for {var_name} was verified directly by domain expert."
    if category == "NORMALIZATION":
        return f"Prediction '{orig}' held the correct information but violated codebook format guidelines; standardized to '{corr}'."
    if category == "FALSE_EXTRACTION":
        return f"Model hallucinated or falsely identified '{orig}' when {var_name} was unmeasured or inapplicable in the text; marked as Not Reported."
    if category == "MISSED_CONTEXT":
        return f"Model missed context for {var_name}; human reviewer located evidence and extracted '{corr}'."
    if category == "NUMERIC_MISMATCH":
        return f"Model extracted conflicting numerical figures '{orig}' instead of the true study cohort metric '{corr}'."
    return f"Expert corrected '{orig}' to '{corr}' based on specific codebook operational definitions."


def record_decision(
    db: DBBackend,
    project_id: str,
    study_id: str,
    variable_id: str,
    variable_name: str,
    original_value: str,
    corrected_value: str,
    decision: str,
    evidence_quote: str = "",
    page_number: Optional[int] = None,
    codebook_rules: str = "",
    reviewer: str = "Expert Reviewer",
    notes: str = "",
) -> Dict[str, Any]:
    category = classify_discrepancy(original_value, corrected_value, decision)
    row = {
        "decision_id": f"err_{uuid.uuid4().hex}",
        "project_id": project_id,
        "study_id": study_id,
        "variable_id": variable_id,
        "variable_name": variable_name,
        "decision": decision,
        "original_value": original_value,
        "corrected_value": corrected_value,
        "category": category,
        "has_discrepancy": 0 if category == "VERIFIED_ACCURATE" else 1,
        "rationale": learning_rationale(category, original_value, corrected_value, variable_name),
        "evidence_quote": evidence_quote,
        "page_number": page_number,
        "codebook_rules": codebook_rules,
        "reviewer": reviewer,
        "notes": notes,
        "undone": 0,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    db.insert("extraction_decisions", row)
    db.commit()
    return _public(row)


def undo_last_decision(db: DBBackend, study_id: str, variable_id: str) -> bool:
    """Retire the newest live decision for this cell so it no longer counts in stats or exports."""
    live = [
        r for r in db.query("extraction_decisions", {"study_id": study_id, "variable_id": variable_id})
        if not r.get("undone")
    ]
    if not live:
        return False
    newest = max(live, key=lambda r: r.get("created_at") or "")
    db.update("extraction_decisions", newest["decision_id"], {"undone": 1})
    db.commit()
    return True


def _public(row: dict) -> Dict[str, Any]:
    """The record shape the review screens expect."""
    return {
        "id": row["decision_id"],
        "timestamp": row.get("created_at", ""),
        "project_id": row["project_id"],
        "study_id": row["study_id"],
        "variable_id": row["variable_id"],
        "variable_name": row.get("variable_name", ""),
        "decision": row["decision"],
        "original_value": row.get("original_value", ""),
        "corrected_value": row.get("corrected_value", ""),
        "has_discrepancy": bool(row.get("has_discrepancy")),
        "category": row.get("category", ""),
        "rationale": row.get("rationale", ""),
        "evidence_quote": row.get("evidence_quote", ""),
        "page_number": row.get("page_number"),
        "codebook_rules": row.get("codebook_rules", ""),
        "reviewer": row.get("reviewer", ""),
        "notes": row.get("notes", ""),
    }


def _live_records(db: DBBackend, project_id: str) -> List[Dict[str, Any]]:
    rows = [r for r in db.query("extraction_decisions", {"project_id": project_id}) if not r.get("undone")]
    rows.sort(key=lambda r: r.get("created_at") or "")
    return [_public(r) for r in rows]


def get_analysis_summary(db: DBBackend, project_id: str) -> Dict[str, Any]:
    records = _live_records(db, project_id)
    total = len(records)
    if total == 0:
        return {
            "total_decisions": 0,
            "verified_accurate": 0,
            "total_discrepancies": 0,
            "accuracy_rate": 100.0,
            "category_breakdown": {c: 0 for c in CATEGORIES},
            "high_error_variables": [],
            "suggested_prompt_rules": [
                "Follow codebook categorical allowed values strictly.",
                "Verify cohort denominator before extracting percentage values.",
                "Flag 'NR' if no explicit measurement is found in text.",
            ],
            "recent_records": [],
        }

    verified = sum(1 for r in records if not r["has_discrepancy"])
    breakdown = {c: 0 for c in CATEGORIES}
    var_errors: Dict[str, int] = {}
    for r in records:
        if r["category"] in breakdown:
            breakdown[r["category"]] += 1
        if r["has_discrepancy"]:
            name = r["variable_name"] or r["variable_id"] or "Unknown"
            var_errors[name] = var_errors.get(name, 0) + 1

    worst = sorted(
        ({"variable": k, "error_count": v} for k, v in var_errors.items()),
        key=lambda x: x["error_count"], reverse=True,
    )

    rules = []
    if breakdown["NORMALIZATION"]:
        rules.append("Rule: Standardize numerical ranges and percentages to uniform decimal / bracket notation.")
    if breakdown["FALSE_EXTRACTION"]:
        rules.append("Rule: Do not infer variable values from background or discussion sections; require explicit methodology reporting.")
    if breakdown["NUMERIC_MISMATCH"]:
        rules.append("Rule: Cross-check baseline table totals against the analyzed cohort N before recording mean values.")
    if not rules:
        rules.append("Maintain rigorous adherence to operational definitions in codebook.")

    return {
        "total_decisions": total,
        "verified_accurate": verified,
        "total_discrepancies": total - verified,
        "accuracy_rate": round(verified / total * 100, 1),
        "category_breakdown": breakdown,
        "high_error_variables": worst[:5],
        "suggested_prompt_rules": rules,
        "recent_records": list(reversed(records[-15:])),
    }


def export_training_dataset(db: DBBackend, project_id: str) -> List[Dict[str, Any]]:
    """Verified human decisions as chat-format fine-tuning examples."""
    system_msg = (
        "You are an expert biomedical data extractor for systematic literature reviews. "
        "Adhere rigorously to codebook operational definitions, quote supporting text verbatim, "
        "and format values according to standard notation."
    )
    pairs = []
    for r in _live_records(db, project_id):
        user_msg = (
            f"Variable to extract: {r['variable_name']}\n"
            f"Operational Rules: {r['codebook_rules'] or 'Standard clinical review rules'}\n"
            f"Evidence Passage: \"{r['evidence_quote'] or 'Document text'}\""
        )
        assistant_msg = json.dumps({
            "variable": r["variable_name"],
            "extracted_value": r["corrected_value"] or r["original_value"],
            "status": "VERIFIED",
            "notes": r["notes"] or r["rationale"],
        }, indent=2)
        pairs.append({
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": assistant_msg},
            ],
            "metadata": {
                "id": r["id"],
                "category": r["category"],
                "had_discrepancy": r["has_discrepancy"],
                "timestamp": r["timestamp"],
            },
        })
    return pairs
