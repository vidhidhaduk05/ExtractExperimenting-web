"""Improved extraction service using Docling's structured table data.

When a PDF is processed with Docling, it produces structured JSON with:
- Tables (with row/column structure preserved)
- Text blocks with bounding boxes
- Document layout information

This service leverages that structured data to extract numerical values
(sensitivity, specificity, PPV, NPV, AUC, sample size, etc.) from table
cells with higher accuracy than keyword-based text search.

Falls back to the legacy keyword-based auto_extract_service if Docling
structured data is not available.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import pdf_service
from services.llm_extractor import is_llm_available, extract_variables_with_llm
from services.auto_extract_service import (
    auto_extract as legacy_auto_extract,
    _match_variable_to_keywords,
    _find_keyword_in_text,
)


# ── Numerical extraction patterns ──
# These patterns look for numbers near diagnostic accuracy keywords
NUMERIC_PATTERNS: dict[str, list[re.Pattern]] = {
    "sensitivity": [
        re.compile(r"sensitiv(?:ity|ities)\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*[%\)]?", re.I),
        re.compile(r"(?:sensitivity|sens)\s*[:=]\s*(\d+\.?\d*)\s*%?", re.I),
    ],
    "specificity": [
        re.compile(r"specificit(?:y|ies)\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*[%\)]?", re.I),
        re.compile(r"(?:specificity|spec)\s*[:=]\s*(\d+\.?\d*)\s*%?", re.I),
    ],
    "ppv": [
        re.compile(r"(?:positive\s*predictive\s*value|PPV)\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*[%\)]?", re.I),
        re.compile(r"PPV\s*[:=]\s*(\d+\.?\d*)\s*%?", re.I),
    ],
    "npv": [
        re.compile(r"(?:negative\s*predictive\s*value|NPV)\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*[%\)]?", re.I),
        re.compile(r"NPV\s*[:=]\s*(\d+\.?\d*)\s*%?", re.I),
    ],
    "auc": [
        re.compile(r"(?:AUC|area\s*under\s*(?:the\s*)?curve)\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*\)?", re.I),
        re.compile(r"AUC\s*[:=]\s*(\d+\.?\d*)", re.I),
        re.compile(r"(?:AUC|area\s*under\s*(?:the\s*)?curve)\s*(?:of\s*)?(\d+\.?\d*)", re.I),
    ],
    "accuracy": [
        re.compile(r"accuracy\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*[%\)]?", re.I),
        re.compile(r"accuracy\s*[:=]\s*(\d+\.?\d*)\s*%?", re.I),
    ],
    "sample_size": [
        re.compile(r"(?:sample\s*size|total\s*(?:of\s*)?|n\s*=)\s*(\d{2,6})", re.I),
        re.compile(r"(\d{2,6})\s*(?:patients|participants|subjects|cases|women|men)\s*(?:were|enrolled|included|recruited)", re.I),
        re.compile(r"(?:a\s*total\s*of\s*)(\d{2,6})\s*(?:patients|participants|subjects|cases)", re.I),
    ],
    "mean_age": [
        re.compile(r"(?:mean|average)\s*age\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*\+?\s*±?\s*\d*\.?\d*\s*\)?\s*(?:years)?", re.I),
        re.compile(r"(?:mean|average)\s*age\s*[:=]\s*(\d+\.?\d*)", re.I),
    ],
    "median_age": [
        re.compile(r"median\s*age\s*(?:was|of|=|:|\s)\s*\(?\s*(\d+\.?\d*)\s*\)?", re.I),
    ],
}

# Keywords that indicate table headers for diagnostic performance tables
TABLE_HEADER_KEYWORDS = [
    "sensitivity", "specificity", "ppv", "npv", "accuracy", "auc",
    "positive predictive value", "negative predictive value",
    "true positive", "true negative", "false positive", "false negative",
    "tp", "tn", "fp", "fn",
]


def _extract_numeric_from_text(text: str, var_pattern_key: str) -> Optional[dict]:
    """Try to extract a numeric value from text using regex patterns.

    Returns dict with value, confidence, source_text, or None.
    """
    patterns = NUMERIC_PATTERNS.get(var_pattern_key, [])
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            value = match.group(1)
            # Get surrounding context
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 50)
            context = text[start:end].strip()

            # Confidence: higher for exact numeric matches
            confidence = 0.85
            # Boost confidence if the value looks reasonable
            try:
                num_val = float(value)
                if var_pattern_key in ("sensitivity", "specificity", "ppv", "npv", "accuracy"):
                    if 0 < num_val <= 100:
                        confidence = 0.9
                    elif 0 < num_val <= 1:
                        confidence = 0.85
                        value = f"{num_val * 100:.1f}"  # normalize to percentage
                elif var_pattern_key == "auc":
                    if 0.5 <= num_val <= 1.0:
                        confidence = 0.9
                elif var_pattern_key == "sample_size":
                    if num_val >= 5:
                        confidence = 0.88
                elif var_pattern_key in ("mean_age", "median_age"):
                    if 0 < num_val < 120:
                        confidence = 0.88
            except (ValueError, TypeError):
                pass

            return {
                "value": value,
                "confidence": confidence,
                "source_text": context,
                "source_page": None,  # will be set by caller
            }
    return None


def _extract_from_table_data(
    tables: list[dict],
    var_name: str,
    var_pattern_key: str,
) -> Optional[dict]:
    """Search Docling-extracted tables for a variable value.

    Tables are expected to be in format:
    [{"page": N, "rows": [["header1", "header2"], ["val1", "val2"]], ...}]

    Returns dict with value, confidence, source_text, source_page, or None.
    """
    if not tables:
        return None

    # Keywords to look for in table headers
    header_keywords = {
        "sensitivity": ["sensitivity", "sens", "sen"],
        "specificity": ["specificity", "spec", "sp"],
        "ppv": ["ppv", "positive predictive value", "precision"],
        "npv": ["npv", "negative predictive value"],
        "auc": ["auc", "area under curve", "area under the curve"],
        "accuracy": ["accuracy", "acc"],
        "sample_size": ["n", "total", "sample size", "patients", "number"],
        "mean_age": ["mean age", "age", "average age"],
        "median_age": ["median age", "age"],
    }

    target_keywords = header_keywords.get(var_pattern_key, [])
    if not target_keywords:
        return None

    for table in tables:
        rows = table.get("rows", [])
        if not rows:
            continue

        page = table.get("page", 1)

        # Find the column index matching our target keyword
        header_row = rows[0]
        col_idx = None
        for i, cell in enumerate(header_row):
            cell_lower = str(cell).lower().strip()
            for kw in target_keywords:
                if kw in cell_lower or cell_lower == kw:
                    col_idx = i
                    break
            if col_idx is not None:
                break

        if col_idx is None:
            continue

        # Get the value from the first data row (or the row with the best value)
        for row in rows[1:]:
            if col_idx < len(row):
                cell_val = str(row[col_idx]).strip()
                # Try to parse as number
                cleaned = re.sub(r"[^\d.]", "", cell_val)
                if cleaned and cleaned != ".":
                    try:
                        num_val = float(cleaned)
                        # Validate range
                        if var_pattern_key in ("sensitivity", "specificity", "ppv", "npv", "accuracy"):
                            if 0 < num_val <= 100:
                                return {
                                    "value": f"{num_val:.1f}" if num_val != int(num_val) else str(int(num_val)),
                                    "confidence": 0.92,  # higher confidence from table data
                                    "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                    "source_page": page,
                                }
                            elif 0 < num_val <= 1:
                                return {
                                    "value": f"{num_val * 100:.1f}",
                                    "confidence": 0.90,
                                    "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                    "source_page": page,
                                }
                        elif var_pattern_key == "auc":
                            if 0.5 <= num_val <= 1.0:
                                return {
                                    "value": f"{num_val:.3f}",
                                    "confidence": 0.93,
                                    "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                    "source_page": page,
                                }
                        elif var_pattern_key == "sample_size":
                            if num_val >= 5:
                                return {
                                    "value": str(int(num_val)),
                                    "confidence": 0.90,
                                    "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                    "source_page": page,
                                }
                        elif var_pattern_key in ("mean_age", "median_age"):
                            if 0 < num_val < 120:
                                return {
                                    "value": f"{num_val:.1f}" if num_val != int(num_val) else str(int(num_val)),
                                    "confidence": 0.90,
                                    "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                    "source_page": page,
                                }
                        else:
                            return {
                                "value": cell_val,
                                "confidence": 0.85,
                                "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                "source_page": page,
                            }
                    except (ValueError, TypeError):
                        # Non-numeric cell value — still return it as text
                        if cell_val and cell_val.lower() not in ("", "-", "n/a", "na", "—"):
                            return {
                                "value": cell_val,
                                "confidence": 0.75,
                                "source_text": f"Table (page {page}): {header_row[col_idx]} = {cell_val}",
                                "source_page": page,
                            }

    return None


def _get_pattern_key(var_name: str, var_description: str) -> Optional[str]:
    """Map a variable name to a NUMERIC_PATTERNS key."""
    name_lower = var_name.lower().replace("_", " ").replace("-", " ")
    desc_lower = var_description.lower()

    for key in NUMERIC_PATTERNS:
        if key in name_lower or key in desc_lower:
            return key
        # Also check common aliases
        if key == "sample_size" and any(w in name_lower for w in ["n patients", "n patient", "number of patient", "total patient", "enrolled"]):
            return key
        if key == "mean_age" and "age" in name_lower and "mean" in name_lower:
            return key
        if key == "median_age" and "age" in name_lower and "median" in name_lower:
            return key

    return None


def auto_extract_with_docling(study_id: str, project_id: str, reviewer: str = "auto", db: Optional[DBBackend] = None) -> dict:
    """Run improved extraction using Docling structured data when available.

    1. Check if the PDF was processed with Docling (has structured table data)
    2. For each variable, try table-based extraction first (highest accuracy)
    3. Fall back to numeric regex extraction from full text
    4. Fall back to legacy keyword-based extraction
    5. Store results in extractions table

    Returns summary dict.
    """
    db = db or get_db_backend()
    tables: list[dict] = []
    processor_used = "abstract_fallback"
    full_text = ""

    # Get processed PDF data if available
    pdf_data = pdf_service.get_pdf_data(study_id, db=db)
    if pdf_data and pdf_data.get("full_text"):
        full_text = pdf_data.get("full_text", "")
        processor_used = "docling_or_pdfplumber"

    if not full_text:
        # Fall back to abstract from studies table
        row = db.get("studies", study_id)
        abstract = (row.get("abstract") if row else "") or ""
        if row and len(abstract.strip()) >= 10:
            full_text = f"{row.get('title') or ''}\n\n{abstract}"
            processor_used = "abstract_text"
        else:
            raise ValueError(f"No processed PDF or abstract available for study {study_id}. Upload and process a PDF first.")

    pdf_docs = db.query("pdf_documents", {"study_id": study_id})
    if pdf_docs:
        row = pdf_docs[0]
        processor_used = row.get("processor_engine") or "unknown"
        if row.get("tables_json"):
            try:
                tables = json.loads(row["tables_json"])
            except (json.JSONDecodeError, TypeError):
                tables = []

    # Get all variables for this project
    variables = db.query("variables", {"project_id": project_id}, order_by="section")

    if not variables:
        return {"study_id": study_id, "extracted": 0, "skipped": 0, "message": "No variables defined"}

    extracted = 0
    skipped = 0
    results = []
    now = datetime.utcnow().isoformat()

    # Step 0: Try LLM extraction (via gemini-web2api) if available
    llm_results = {}
    if is_llm_available():
        try:
            raw_llm = extract_variables_with_llm(full_text, variables)
            # Convert list of dicts to dict keyed by variable name
            for item in raw_llm:
                name = item.get("name", "")
                if name:
                    llm_results[name] = item
        except Exception as e:
            print(f"LLM extraction error: {e}")
            llm_results = {}

    for var in variables:
        var_name = var["name"]
        var_desc = var.get("description") or ""
        var_id = var["variable_id"]

        match = None
        extraction_method = "none"

        # Check if LLM extracted this variable
        if llm_results and var_name in llm_results:
            llm_val = llm_results[var_name]
            if isinstance(llm_val, dict) and llm_val.get("value") and llm_val.get("value").lower() not in ("not reported", "n/a", "none", "unknown"):
                raw_sp = llm_val.get("source_page")
                match = {
                    "value": str(llm_val["value"]),
                    "confidence": float(llm_val.get("confidence", 0.90)),
                    "source_text": str(llm_val.get("source_text", llm_val.get("quote", ""))),
                    "source_page": int(raw_sp) if raw_sp is not None and str(raw_sp).isdigit() else None,
                }
                extraction_method = "gemini_llm"

        # Step 1: Try table-based extraction (Docling structured data)
        if not match:
            pattern_key = _get_pattern_key(var_name, var_desc)
            if pattern_key and tables:
                match = _extract_from_table_data(tables, var_name, pattern_key)
                if match:
                    extraction_method = "docling_table"

        # Step 2: Try numeric regex extraction from full text
        if not match:
            pattern_key = _get_pattern_key(var_name, var_desc)
            if pattern_key:
                match = _extract_numeric_from_text(full_text, pattern_key)
                if match:
                    extraction_method = "numeric_regex"
                    if not match.get("source_page"):
                        match["source_page"] = None

        # Step 3: Fall back to legacy keyword-based extraction
        if not match:
            keywords = _match_variable_to_keywords(var_name, var_desc)
            match = _find_keyword_in_text(full_text, keywords)
            if match:
                extraction_method = "keyword"

        if match:
            # Check if extraction already exists
            existing = db.query("extractions", {"study_id": study_id, "variable_id": var_id})

            extraction_id = str(uuid.uuid4())
            if existing:
                db.update("extractions", existing[0]["extraction_id"], {
                    "value": match["value"],
                    "confidence": match["confidence"],
                    "source_page": match.get("source_page"),
                    "source_text": match.get("source_text", ""),
                    "extracted_by": reviewer,
                    "extracted_at": now,
                    "is_edited": 0,
                })
                extraction_id = existing[0]["extraction_id"]
            else:
                db.insert("extractions", {
                    "extraction_id": extraction_id,
                    "study_id": study_id,
                    "variable_id": var_id,
                    "value": match["value"],
                    "confidence": match["confidence"],
                    "source_page": match.get("source_page"),
                    "source_bbox": "",
                    "source_text": match.get("source_text", ""),
                    "extracted_by": reviewer,
                    "extracted_at": now,
                })

            results.append({
                "variable_id": var_id,
                "variable_name": var_name,
                "value": match["value"][:100],
                "confidence": match["confidence"],
                "source_page": match.get("source_page"),
                "method": extraction_method,
            })
            extracted += 1
        else:
            skipped += 1

    # Update study extraction status
    db.update("studies", study_id, {"extraction_status": "auto_extracted"})
    db.commit()

    return {
        "study_id": study_id,
        "extracted": extracted,
        "skipped": skipped,
        "total_variables": len(variables),
        "processor": processor_used,
        "tables_available": len(tables),
        "results": results,
    }
