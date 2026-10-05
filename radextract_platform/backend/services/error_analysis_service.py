"""Error analysis and active learning dataset generator for clinical data extraction.

Tracks human corrections during Track Changes review, automatically classifies
error modalities (Normalization, False Extraction, Missed Context, Value Correction,
Numeric Mismatch), and generates JSONL fine-tuning / prompt-tuning datasets.
"""
from __future__ import annotations
import os
import json
import re
import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path


DATA_DIR = Path(__file__).parent.parent / "data"
LOG_FILE = DATA_DIR / "error_analysis_log.json"


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_FILE.exists():
        LOG_FILE.write_text("[]", encoding="utf-8")


def _classify_discrepancy(original: str, corrected: str, decision: str) -> str:
    orig = (original or "").strip()
    corr = (corrected or "").strip()

    if decision == "accepted" or orig.lower() == corr.lower():
        return "VERIFIED_ACCURATE"
    
    if decision == "rejected" or corr.upper() in ("NR", "NOT REPORTED", "NA", "N/A"):
        return "FALSE_EXTRACTION"
    
    if not orig or orig.upper() in ("NR", "NOT REPORTED", "NA", "N/A"):
        return "MISSED_CONTEXT"
    
    # Check for normalization (units, casing, punctuation, percentage)
    orig_clean = re.sub(r'[^a-zA-Z0-9]', '', orig).lower()
    corr_clean = re.sub(r'[^a-zA-Z0-9]', '', corr).lower()
    if orig_clean == corr_clean:
        return "NORMALIZATION"
    
    # Check numeric mismatch
    orig_nums = re.findall(r"[-+]?\d*\.?\d+", orig)
    corr_nums = re.findall(r"[-+]?\d*\.?\d+", corr)
    if orig_nums and corr_nums:
        if orig_nums != corr_nums:
            return "NUMERIC_MISMATCH"
        else:
            return "NORMALIZATION"

    return "VALUE_CORRECTION"


def _generate_learning_rationale(category: str, orig: str, corr: str, var_name: str) -> str:
    if category == "VERIFIED_ACCURATE":
        return f"AI prediction '{orig}' for {var_name} was verified directly by domain expert."
    elif category == "NORMALIZATION":
        return f"Prediction '{orig}' held the correct information but violated codebook format guidelines; standardized to '{corr}'."
    elif category == "FALSE_EXTRACTION":
        return f"Model hallucinated or falsely identified '{orig}' when {var_name} was unmeasured or inapplicable in the text; marked as Not Reported."
    elif category == "MISSED_CONTEXT":
        return f"Model missed context for {var_name}; human reviewer located evidence and extracted '{corr}'."
    elif category == "NUMERIC_MISMATCH":
        return f"Model extracted conflicting numerical figures '{orig}' instead of the true study cohort metric '{corr}'."
    else:
        return f"Expert corrected '{orig}' to '{corr}' based on specific codebook operational definitions."


class ErrorAnalysisService:
    def __init__(self):
        _ensure_dir()

    def record_decision(
        self,
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
        notes: str = ""
    ) -> Dict[str, Any]:
        _ensure_dir()
        category = _classify_discrepancy(original_value, corrected_value, decision)
        rationale = _generate_learning_rationale(category, original_value, corrected_value, variable_name)

        record = {
            "id": f"err_{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "project_id": project_id,
            "study_id": study_id,
            "variable_id": variable_id,
            "variable_name": variable_name,
            "decision": decision,  # 'accepted' | 'modified' | 'rejected'
            "original_value": original_value,
            "corrected_value": corrected_value,
            "has_discrepancy": category != "VERIFIED_ACCURATE",
            "category": category,
            "rationale": rationale,
            "evidence_quote": evidence_quote,
            "page_number": page_number,
            "codebook_rules": codebook_rules,
            "reviewer": reviewer,
            "notes": notes
        }

        try:
            records = json.loads(LOG_FILE.read_text(encoding="utf-8"))
        except Exception:
            records = []

        records.append(record)
        LOG_FILE.write_text(json.dumps(records, indent=2), encoding="utf-8")
        return record

    def get_analysis_summary(self, project_id: Optional[str] = None) -> Dict[str, Any]:
        _ensure_dir()
        try:
            records = json.loads(LOG_FILE.read_text(encoding="utf-8"))
        except Exception:
            records = []

        if project_id:
            records = [r for r in records if r.get("project_id") == project_id]

        total = len(records)
        if total == 0:
            return {
                "total_decisions": 0,
                "verified_accurate": 0,
                "total_discrepancies": 0,
                "accuracy_rate": 100.0,
                "category_breakdown": {
                    "NORMALIZATION": 0,
                    "FALSE_EXTRACTION": 0,
                    "MISSED_CONTEXT": 0,
                    "NUMERIC_MISMATCH": 0,
                    "VALUE_CORRECTION": 0,
                },
                "high_error_variables": [],
                "suggested_prompt_rules": [
                    "Follow codebook categorical allowed values strictly.",
                    "Verify cohort denominator before extracting percentage values.",
                    "Flag 'NR' if no explicit measurement is found in text."
                ],
                "recent_records": []
            }

        verified = sum(1 for r in records if not r.get("has_discrepancy"))
        discrepancies = total - verified
        accuracy = round((verified / total) * 100, 1)

        breakdown = {
            "NORMALIZATION": 0,
            "FALSE_EXTRACTION": 0,
            "MISSED_CONTEXT": 0,
            "NUMERIC_MISMATCH": 0,
            "VALUE_CORRECTION": 0,
        }
        var_errors: Dict[str, int] = {}

        for r in records:
            cat = r.get("category", "VALUE_CORRECTION")
            if cat in breakdown:
                breakdown[cat] += 1
            if r.get("has_discrepancy"):
                vname = r.get("variable_name") or r.get("variable_id") or "Unknown"
                var_errors[vname] = var_errors.get(vname, 0) + 1

        sorted_vars = sorted(
            [{"variable": k, "error_count": v} for k, v in var_errors.items()],
            key=lambda x: x["error_count"],
            reverse=True
        )

        prompt_rules = []
        if breakdown["NORMALIZATION"] > 0:
            prompt_rules.append("Rule: Standardize numerical ranges and percentages to uniform decimal / bracket notation.")
        if breakdown["FALSE_EXTRACTION"] > 0:
            prompt_rules.append("Rule: Do not infer variable values from background or discussion sections; require explicit methodology reporting.")
        if breakdown["NUMERIC_MISMATCH"] > 0:
            prompt_rules.append("Rule: Cross-check baseline table totals against the analyzed cohort N before recording mean values.")
        if not prompt_rules:
            prompt_rules.append("Maintain rigorous adherence to operational definitions in codebook.")

        return {
            "total_decisions": total,
            "verified_accurate": verified,
            "total_discrepancies": discrepancies,
            "accuracy_rate": accuracy,
            "category_breakdown": breakdown,
            "high_error_variables": sorted_vars[:5],
            "suggested_prompt_rules": prompt_rules,
            "recent_records": list(reversed(records[-15:]))
        }

    def export_training_dataset(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Exports verified human decisions as fine-tuning chat / prompt dataset."""
        _ensure_dir()
        try:
            records = json.loads(LOG_FILE.read_text(encoding="utf-8"))
        except Exception:
            records = []

        if project_id:
            records = [r for r in records if r.get("project_id") == project_id]

        training_pairs = []
        for r in records:
            system_msg = (
                "You are an expert biomedical data extractor for systematic literature reviews. "
                "Adhere rigorously to codebook operational definitions, quote supporting text verbatim, "
                "and format values according to standard notation."
            )
            user_msg = (
                f"Variable to extract: {r.get('variable_name')}\n"
                f"Operational Rules: {r.get('codebook_rules') or 'Standard clinical review rules'}\n"
                f"Evidence Passage: \"{r.get('evidence_quote') or 'Document text'}\""
            )
            assistant_msg = json.dumps({
                "variable": r.get("variable_name"),
                "extracted_value": r.get("corrected_value") or r.get("original_value"),
                "status": "VERIFIED",
                "notes": r.get("notes") or r.get("rationale")
            }, indent=2)

            training_pairs.append({
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                    {"role": "assistant", "content": assistant_msg}
                ],
                "metadata": {
                    "id": r.get("id"),
                    "category": r.get("category"),
                    "had_discrepancy": r.get("has_discrepancy"),
                    "timestamp": r.get("timestamp")
                }
            })

        return training_pairs


error_analysis_service = ErrorAnalysisService()
