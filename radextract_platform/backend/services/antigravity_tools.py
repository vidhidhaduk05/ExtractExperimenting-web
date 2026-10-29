"""Antigravity SDK custom tool wrappers for VDExtract.

Each function is a thin wrapper around an existing VDExtract service.
Antigravity auto-generates the tool schema from the function's type hints
and docstring, so both must be clear and accurate.

Design principles:
- Tools are stateless — they create their own DB/client per call.
- Tools return JSON-serializable dicts (no ORM objects, no datetimes).
- Tools do NOT contain business logic — they delegate to existing services.
- If the agent layer is removed, the platform works exactly as before.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services.llm_client import get_client
from services.llm_extractor import (
    screen_title_only_with_llm,
    screen_title_abstract_with_llm,
    screen_fulltext_with_llm,
)
from services import pdf_service, auto_extract_service, biomni_service

logger = logging.getLogger("radextract.antigravity_tools")


# ──────────────────────────────────────────────────────────────────────
# Data access tools
# ──────────────────────────────────────────────────────────────────────

def get_study(study_id: str) -> dict:
    """Fetch a study record by ID.

    Returns title, abstract, authors, journal, publication year,
    screening status, screening stage, AI confidence, and PDF path.
    Returns {"error": "not found"} if the study does not exist.
    """
    db = get_db_backend()
    study = db.get("studies", study_id)
    if not study:
        return {"error": "not found", "study_id": study_id}
    # Strip non-serializable values and ensure strings
    safe = {}
    for k, v in study.items():
        if isinstance(v, (str, int, float, bool, type(None))):
            safe[k] = v
        elif isinstance(v, bytes):
            safe[k] = v.decode("utf-8", errors="replace")
        else:
            safe[k] = str(v)
    return safe


def get_project(project_id: str) -> dict:
    """Fetch a project record by ID.

    Returns the project name, PICO criteria (parsed from pico_json),
    exclusion reasons (parsed from exclusion_reasons_json), and project
    configuration. Returns {"error": "not found"} if the project does not exist.
    """
    db = get_db_backend()
    project = db.get("projects", project_id)
    if not project:
        return {"error": "not found", "project_id": project_id}

    # Parse JSON fields for the agent
    pico = {}
    if project.get("pico_json"):
        try:
            pico = json.loads(project["pico_json"])
        except Exception:
            pico = {}

    exclusions: List[str] = []
    if project.get("exclusion_reasons_json"):
        try:
            raw = json.loads(project["exclusion_reasons_json"])
            for r in raw:
                if isinstance(r, dict) and "label" in r:
                    exclusions.append(r["label"])
                elif isinstance(r, str):
                    exclusions.append(r)
        except Exception:
            pass

    return {
        "project_id": project.get("project_id", project_id),
        "name": project.get("name", ""),
        "pico": pico,
        "exclusion_reasons": exclusions,
        "review_type": project.get("review_type", ""),
        "status": project.get("status", ""),
    }


def get_pdf_text(study_id: str) -> dict:
    """Retrieve processed PDF full text and page-level content for a study.

    Returns a dict with 'full_text' (string), 'pages' (list of page dicts),
    and 'processor_engine' (string). Returns {'full_text': '', 'pages': []}
    if the PDF has not been processed or does not exist.
    """
    db = get_db_backend()
    pdf_data = pdf_service.get_pdf_data(study_id, db=db)
    if not pdf_data:
        return {"full_text": "", "pages": [], "processor_engine": "none"}
    return {
        "full_text": pdf_data.get("full_text", ""),
        "pages": pdf_data.get("pages", []),
        "processor_engine": pdf_data.get("processor_engine", "unknown"),
    }


def get_project_variables(project_id: str) -> list[dict]:
    """List all extraction variables defined for a project.

    Returns a list of dicts, each with 'variable_id', 'name', 'field_type',
    'description', 'section', 'allowed_values', and 'order_index'.
    Returns an empty list if no variables are defined.
    """
    db = get_db_backend()
    variables = db.query("variables", {"project_id": project_id}, order_by="section")
    result = []
    for v in variables:
        result.append({
            "variable_id": v.get("variable_id", ""),
            "name": v.get("name", ""),
            "field_type": v.get("field_type", "free_text"),
            "description": v.get("description", ""),
            "section": v.get("section", "Cohort_Level"),
            "allowed_values": v.get("allowed_values", ""),
            "order_index": v.get("order_index", 0),
        })
    return result


# ──────────────────────────────────────────────────────────────────────
# Screening tools
# ──────────────────────────────────────────────────────────────────────

def screen_title(study_id: str, project_id: str) -> dict:
    """Screen a study by title only against PICO criteria.

    Uses the project's PICO and exclusion reasons. Returns a dict with
    'decision' (include/exclude/uncertain), 'confidence' (0-1), 'reason',
    'reason_code', and 'matched_keywords'.
    """
    db = get_db_backend()
    study = db.get("studies", study_id)
    project = db.get("projects", project_id)
    if not study or not project:
        return {"error": "study or project not found"}

    pico = {}
    if project.get("pico_json"):
        try:
            pico = json.loads(project["pico_json"])
        except Exception:
            pico = {}

    exclusions: List[str] = []
    if project.get("exclusion_reasons_json"):
        try:
            raw = json.loads(project["exclusion_reasons_json"])
            for r in raw:
                if isinstance(r, dict) and "label" in r:
                    exclusions.append(r["label"])
                elif isinstance(r, str):
                    exclusions.append(r)
        except Exception:
            pass

    client = get_client()
    result = screen_title_only_with_llm(
        title=study.get("title", ""),
        pico_criteria=pico,
        exclusion_reasons=exclusions,
        client=client,
    )
    return {
        "decision": result.get("decision", "uncertain"),
        "confidence": float(result.get("confidence", 0.0)),
        "reason": result.get("reason_text") or result.get("reason", ""),
        "reason_code": result.get("reason_code", ""),
        "matched_keywords": result.get("matched_keywords", []),
    }


def screen_title_abstract(study_id: str, project_id: str) -> dict:
    """Screen a study by title and abstract against PICO criteria.

    Uses the project's PICO and exclusion reasons. Returns a dict with
    'decision' (include/exclude/uncertain), 'confidence' (0-1), 'reason',
    'reason_code', 'evidence_quote', 'needs_clarification' (bool), and
    optional 'clarification_question' and 'clarification_options'.
    """
    db = get_db_backend()
    study = db.get("studies", study_id)
    project = db.get("projects", project_id)
    if not study or not project:
        return {"error": "study or project not found"}

    pico = {}
    if project.get("pico_json"):
        try:
            pico = json.loads(project["pico_json"])
        except Exception:
            pico = {}

    exclusions: List[str] = []
    if project.get("exclusion_reasons_json"):
        try:
            raw = json.loads(project["exclusion_reasons_json"])
            for r in raw:
                if isinstance(r, dict) and "label" in r:
                    exclusions.append(r["label"])
                elif isinstance(r, str):
                    exclusions.append(r)
        except Exception:
            pass

    client = get_client()
    result = screen_title_abstract_with_llm(
        title=study.get("title", ""),
        abstract=study.get("abstract", ""),
        pico_criteria=pico,
        exclusion_reasons=exclusions,
        client=client,
    )
    return {
        "decision": result.get("decision", "uncertain"),
        "confidence": float(result.get("confidence", 0.0)),
        "reason": result.get("reason_text") or result.get("reason", ""),
        "reason_code": result.get("reason_code", ""),
        "evidence_quote": result.get("evidence_quote", ""),
        "needs_clarification": result.get("needs_clarification", False),
        "clarification_question": result.get("clarification_question", ""),
        "clarification_options": result.get("clarification_options", []),
    }


def screen_fulltext(study_id: str, project_id: str) -> dict:
    """Screen a study by full text against PICO eligibility criteria.

    Requires the PDF to have been processed (use get_pdf_text to check).
    Falls back to abstract if full text is not available. Returns a dict
    with 'decision' (include/exclude/uncertain), 'confidence' (0-1),
    'reason', 'reason_code', and 'evidence_quote'.
    """
    db = get_db_backend()
    study = db.get("studies", study_id)
    project = db.get("projects", project_id)
    if not study or not project:
        return {"error": "study or project not found"}

    pico = {}
    if project.get("pico_json"):
        try:
            pico = json.loads(project["pico_json"])
        except Exception:
            pico = {}

    exclusions: List[str] = []
    if project.get("exclusion_reasons_json"):
        try:
            raw = json.loads(project["exclusion_reasons_json"])
            for r in raw:
                if isinstance(r, dict) and "label" in r:
                    exclusions.append(r["label"])
                elif isinstance(r, str):
                    exclusions.append(r)
        except Exception:
            pass

    # Get full text from processed PDF, fall back to abstract
    pdf_data = pdf_service.get_pdf_data(study_id, db=db)
    full_text = ""
    if pdf_data:
        full_text = pdf_data.get("full_text", "")
    if not full_text:
        full_text = study.get("abstract") or study.get("title") or ""

    if not full_text.strip():
        return {
            "decision": "uncertain",
            "confidence": 0.0,
            "reason": "No full text or abstract available for full-text screening",
            "reason_code": "NO_TEXT",
            "evidence_quote": "",
        }

    client = get_client()
    result = screen_fulltext_with_llm(
        study_text=full_text,
        pico_criteria=pico,
        exclusion_reasons=exclusions,
        study_metadata=study,
        client=client,
    )
    return {
        "decision": result.get("decision", result.get("recommendation", "uncertain")),
        "confidence": float(result.get("confidence", 0.0)),
        "reason": result.get("reason_text") or result.get("rationale", ""),
        "reason_code": result.get("reason_code", ""),
        "evidence_quote": result.get("evidence_quote", ""),
    }


# ──────────────────────────────────────────────────────────────────────
# Extraction tools
# ──────────────────────────────────────────────────────────────────────

def extract_variables(study_id: str, project_id: str) -> dict:
    """Extract all project variables from a study's PDF text.

    Runs the full auto-extraction pipeline including LLM extraction,
    exhaustive keyword search, and gap rule application. Returns a dict
    with 'extracted_count', 'skipped_count', 'message', and 'extractions'
    (list of per-variable results with value, source, page, confidence).
    Variables with no evidence return value 'Not found'.
    """
    db = get_db_backend()
    try:
        result = auto_extract_service.auto_extract(study_id, project_id, db=db)
        # Fetch the persisted extractions for the agent
        extractions = db.query("extractions", {"study_id": study_id})
        ext_list = []
        for ext in extractions:
            ext_list.append({
                "variable_id": ext.get("variable_id", ""),
                "variable_name": ext.get("variable_name", ""),
                "value": ext.get("value", ""),
                "confidence": float(ext.get("confidence", 0.0)),
                "confidence_tag": ext.get("confidence_tag", ""),
                "source_page": ext.get("source_page"),
                "source_text": ext.get("source_text", ""),
            })
        return {
            "extracted_count": result.get("extracted_count", 0),
            "skipped_count": result.get("skipped_count", 0),
            "message": result.get("message", ""),
            "extractions": ext_list,
        }
    except Exception as e:
        logger.error(f"extract_variables failed for study {study_id}: {e}")
        return {"error": str(e), "extracted_count": 0, "extractions": []}


def recheck_extractions(study_id: str, project_id: str) -> dict:
    """Re-run exhaustive search for variables that returned 'Not found' or '-99'.

    Searches alternative keyword locations in the PDF text and applies gap
    rules (fixed horizon, comparator heterogeneity, subgroup detection, etc.).
    Returns a dict with 'rechecked_count' and 'updated_extractions' listing
    variables that were successfully found in the recheck pass.
    """
    db = get_db_backend()
    try:
        from services.exhaustive_search import recheck_missing

        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        full_text = pdf_data.get("full_text", "") if pdf_data else ""
        pdf_pages = pdf_data.get("pages") if pdf_data else None

        extractions = db.query("extractions", {"study_id": study_id})
        if not extractions:
            return {"rechecked_count": 0, "updated_extractions": [], "message": "No extractions to recheck"}

        updated = recheck_missing(extractions, full_text, pdf_pages)

        # Persist any updated values
        now_str = datetime.now(timezone.utc).isoformat()
        updated_list = []
        for ext in updated:
            val = str(ext.get("value", "")).strip()
            prev_val = str(ext.get("_prev_value", "")).strip()
            if val and val not in ("Not found", "-99", "-88") and val != prev_val:
                ext_id = ext.get("extraction_id", "")
                if ext_id:
                    db.update("extractions", ext_id, {
                        "value": val,
                        "confidence": float(ext.get("confidence", 0.7)),
                        "confidence_tag": ext.get("confidence_tag", "[DS]"),
                        "source_text": ext.get("source_text", ""),
                        "source_page": ext.get("source_page"),
                        "updated_at": now_str,
                    })
                    updated_list.append({
                        "variable_name": ext.get("variable_name", ""),
                        "value": val,
                        "source_text": ext.get("source_text", ""),
                        "source_page": ext.get("source_page"),
                    })
        db.commit()

        return {
            "rechecked_count": len(updated_list),
            "updated_extractions": updated_list,
            "message": f"Recheck found values for {len(updated_list)} previously-missing variables",
        }
    except Exception as e:
        logger.error(f"recheck_extractions failed for study {study_id}: {e}")
        return {"error": str(e), "rechecked_count": 0, "updated_extractions": []}


# ──────────────────────────────────────────────────────────────────────
# Biomedical validation tools
# ──────────────────────────────────────────────────────────────────────

def query_biomedical_entity(entity_type: str, query_term: str) -> dict:
    """Cross-reference a biomedical entity against external databases.

    Use this to validate extracted drug names, gene symbols, disease terms,
    or phenotypes before committing them. entity_type must be one of:
    'uniprot' (proteins/genes), 'hpo' (human phenotypes), or 'pdb'
    (compounds/structures). Returns a dict with 'type', 'results' (list),
    and optional 'error'.
    """
    try:
        return biomni_service.query_biomedical_entity(entity_type, query_term)
    except Exception as e:
        logger.error(f"query_biomedical_entity failed: {e}")
        return {"type": entity_type, "error": str(e), "results": []}


# ──────────────────────────────────────────────────────────────────────
# State mutation tools
# ──────────────────────────────────────────────────────────────────────

def update_screening_status(
    study_id: str,
    status: str,
    stage: str,
    reason: str,
    confidence: float,
) -> dict:
    """Update a study's screening status in the database.

    Args:
        study_id: The study to update.
        status: One of 'included', 'excluded', 'uncertain',
                'awaiting_pdf', 'awaiting_clarification'.
        stage: 'ta' for title/abstract screening, 'ft' for full-text.
        reason: Human-readable reason for the decision.
        confidence: Confidence score from 0.0 to 1.0.

    Returns a dict with 'study_id', 'updated' (bool), and the new status.
    """
    db = get_db_backend()
    now_str = datetime.now(timezone.utc).isoformat()

    valid_statuses = {"included", "excluded", "uncertain", "awaiting_pdf", "awaiting_clarification"}
    if status not in valid_statuses:
        return {"error": f"Invalid status '{status}'. Must be one of {valid_statuses}"}

    valid_stages = {"ta", "ft"}
    if stage not in valid_stages:
        return {"error": f"Invalid stage '{stage}'. Must be one of {valid_stages}"}

    update_data = {
        "screening_status": status,
        "screening_stage": stage,
        "screening_reason": reason,
        "ai_confidence": float(confidence),
        "ai_decision": status,
        "ai_reason": reason,
        "ai_screened_at": now_str,
    }
    db.update("studies", study_id, update_data)
    db.commit()

    return {
        "study_id": study_id,
        "updated": True,
        "new_status": status,
        "new_stage": stage,
    }


def create_clarification_question(
    study_id: str,
    project_id: str,
    question: str,
    options: list[dict],
    ai_decision: str,
    ai_confidence: float,
    ai_reason: str,
) -> dict:
    """Create a clarification question for a human reviewer.

    Use this when screening is uncertain and a specific aspect of the study
    needs human input (e.g., study design ambiguity, population match).
    Pauses the study at 'awaiting_clarification' status until the reviewer
    responds.

    Args:
        study_id: The study that needs clarification.
        project_id: The project the study belongs to.
        question: The multiple-choice question text for the reviewer.
        options: List of {"value": str, "label": str} option dicts.
        ai_decision: The AI's interim decision (usually 'uncertain').
        ai_confidence: The AI's interim confidence (0-1).
        ai_reason: Why the AI is uncertain and what it needs clarified.

    Returns a dict with 'question_id' and 'status' set to 'awaiting_clarification'.
    """
    db = get_db_backend()
    question_id = str(uuid.uuid4())
    now_str = datetime.now(timezone.utc).isoformat()

    # Ensure options are serializable
    safe_options = []
    for opt in options:
        if isinstance(opt, dict):
            safe_options.append({
                "value": str(opt.get("value", "")),
                "label": str(opt.get("label", opt.get("value", ""))),
            })
        elif isinstance(opt, str):
            safe_options.append({"value": opt, "label": opt})
    if not safe_options:
        safe_options = [
            {"value": "yes", "label": "Yes"},
            {"value": "no", "label": "No"},
        ]

    db.insert("clarification_questions", {
        "question_id": question_id,
        "study_id": study_id,
        "project_id": project_id,
        "stage": "ta",
        "question_type": "study_design",
        "question_text": question,
        "options_json": json.dumps(safe_options),
        "context_excerpt": "",
        "pico_aspect": "",
        "ai_interim_decision": ai_decision,
        "ai_interim_confidence": float(ai_confidence),
        "ai_interim_reason": ai_reason,
        "status": "pending",
        "created_at": now_str,
    })
    db.commit()

    # Update study status to awaiting_clarification
    db.update("studies", study_id, {
        "screening_status": "awaiting_clarification",
        "screening_stage": "ta",
        "screening_reason": f"Awaiting clarification: {ai_reason}",
        "ai_confidence": float(ai_confidence),
        "ai_decision": ai_decision,
        "ai_reason": ai_reason,
        "ai_screened_at": now_str,
    })
    db.commit()

    return {
        "question_id": question_id,
        "study_id": study_id,
        "status": "awaiting_clarification",
        "question": question,
    }
