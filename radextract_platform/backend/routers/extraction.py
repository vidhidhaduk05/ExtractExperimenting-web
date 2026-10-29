"""Extraction router: CRUD for data extractions, dual-reviewer verification."""
from __future__ import annotations
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import sqlite3

from models import ExtractionCreate, ExtractionUpdate, ExtractionResponse, MissingDataSummary, ExtractionBatchUpsert, ExtractionBatchCell
from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["extraction"])


# ── Dual-reviewer models ──

class ExtractionVerifyRequest(BaseModel):
    """Second reviewer verification of a primary extraction."""
    agree: bool = True
    alternative_value: str = ""
    reviewer: str = ""


class ExtractionAdjudicateRequest(BaseModel):
    """Adjudicator resolves a disagreement between primary and second reviewer."""
    final_value: str
    adjudicator: str = ""
    notes: str = ""


@router.get("/projects/{project_id}/extractions/grid")
async def get_extraction_grid(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Retrieve full project extraction workspace grid: variables (ordered), studies, and all extraction cells."""
    check_project_access(conn, project_id, user)

    # 1. Variables ordered globally
    var_rows = conn.execute(
        "SELECT * FROM variables WHERE project_id = ? ORDER BY order_index ASC, name ASC",
        (project_id,),
    ).fetchall()
    variables = [dict(v) for v in var_rows]

    # 2. Studies
    study_rows = conn.execute(
        "SELECT * FROM studies WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    studies = []
    for r in study_rows:
        d = dict(r)
        if not d.get("study_label"):
            first_author = d.get("authors", "").split(",")[0].split(";")[0].split(" et al")[0].strip() if d.get("authors") else ""
            year_str = str(d.get("publication_year")) if d.get("publication_year") else ""
            if first_author and year_str:
                d["study_label"] = f"{first_author} {year_str}"
            elif first_author:
                d["study_label"] = first_author
            elif d.get("title"):
                d["study_label"] = d["title"][:30]
            else:
                d["study_label"] = d.get("study_id", "Study")[:8]
        studies.append(d)

    # 3. All extractions for studies in this project
    ext_rows = conn.execute(
        """SELECT e.*, v.name as variable_name
           FROM extractions e
           JOIN studies s ON e.study_id = s.study_id
           LEFT JOIN variables v ON e.variable_id = v.variable_id
           WHERE s.project_id = ?""",
        (project_id,),
    ).fetchall()

    extractions: dict[str, dict[str, dict]] = {s["study_id"]: {} for s in studies}
    for r in ext_rows:
        sid = r["study_id"]
        vid = r["variable_id"]
        if sid in extractions:
            d = dict(r)
            d["evidence_quote"] = d.get("source_text") or d.get("quote") or ""
            d["is_verified"] = d.get("verification_status") in ("verified", "accepted")
            extractions[sid][vid] = d

    return {
        "project_id": project_id,
        "variables": variables,
        "studies": studies,
        "cells": extractions,
        "extractions": extractions,
    }


@router.post("/projects/{project_id}/extractions/batch")
async def batch_update_extractions(
    project_id: str,
    body: ExtractionBatchUpsert,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Upsert a rectangular batch of extraction cells with change tracking and verification guards."""
    check_project_access(conn, project_id, user, min_role="editor")
    username = user["username"] if user else "reviewer"
    now_iso = datetime.datetime.utcnow().isoformat()

    updated_count = 0
    created_count = 0
    skipped_verified = 0

    # Pre-fetch variable names for audit logging
    var_map = {
        r["variable_id"]: r["name"]
        for r in conn.execute("SELECT variable_id, name FROM variables WHERE project_id = ?", (project_id,)).fetchall()
    }

    for cell in body.cells:
        # Check existing
        existing = conn.execute(
            "SELECT * FROM extractions WHERE study_id = ? AND variable_id = ?",
            (cell.study_id, cell.variable_id),
        ).fetchone()

        if existing:
            old_val = existing["value"]
            has_val_change = cell.value != old_val
            has_verif_change = cell.verification_status is not None and cell.verification_status != existing["verification_status"]
            has_conf_change = cell.confidence is not None and cell.confidence != existing["confidence"]
            has_tag_change = cell.confidence_tag is not None and cell.confidence_tag != existing["confidence_tag"]
            has_page_change = cell.source_page is not None and cell.source_page != existing["source_page"]
            has_text_change = cell.source_text is not None and cell.source_text != existing["source_text"]
            has_missing_change = cell.missing_code is not None and cell.missing_code != existing["missing_code"]

            if (has_val_change or has_verif_change or has_conf_change or
                    has_tag_change or has_page_change or has_text_change or has_missing_change):
                is_edited_flag = 1 if (has_val_change or existing["is_edited"]) else 0
                conn.execute(
                    """UPDATE extractions SET
                       value = ?, is_edited = ?, edited_by = ?, edited_at = ?,
                       verification_status = COALESCE(?, verification_status),
                       confidence = COALESCE(?, confidence),
                       confidence_tag = COALESCE(?, confidence_tag),
                       source_page = COALESCE(?, source_page),
                       source_text = COALESCE(?, source_text),
                       missing_code = COALESCE(?, missing_code)
                       WHERE extraction_id = ?""",
                    (cell.value, is_edited_flag, username, now_iso,
                     cell.verification_status, cell.confidence, cell.confidence_tag,
                     cell.source_page, cell.source_text, cell.missing_code,
                     existing["extraction_id"]),
                )
                audit_reason = "Spreadsheet batch update" if has_val_change else f"Metadata updated ({cell.verification_status or 'verified'})"
                conn.execute(
                    """INSERT INTO audit_log
                       (audit_id, study_id, variable_id, variable_name,
                        old_value, new_value, changed_by, reason)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (str(uuid.uuid4()), cell.study_id, cell.variable_id,
                     var_map.get(cell.variable_id, ""), old_val, cell.value,
                     username, audit_reason),
                )
                updated_count += 1
        else:
            ext_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO extractions
                   (extraction_id, study_id, variable_id, value, confidence, confidence_tag,
                    source_page, source_text, extracted_by, verification_status, missing_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (ext_id, cell.study_id, cell.variable_id, cell.value,
                 cell.confidence if cell.confidence is not None else 1.0,
                 cell.confidence_tag or "manual",
                 cell.source_page, cell.source_text or "",
                 username, cell.verification_status or "pending",
                 cell.missing_code or ""),
            )
            conn.execute(
                """INSERT INTO audit_log
                   (audit_id, study_id, variable_id, variable_name,
                    old_value, new_value, changed_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), cell.study_id, cell.variable_id,
                 var_map.get(cell.variable_id, ""), "", cell.value,
                 username, "Spreadsheet initial entry"),
            )
            created_count += 1

    conn.commit()
    return {
        "status": "success",
        "total_submitted": len(body.cells),
        "updated_count": updated_count,
        "created_count": created_count,
        "skipped_verified": skipped_verified,
    }


@router.get("/studies/{study_id}/extractions")
async def list_extractions(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    rows = conn.execute(
        """SELECT e.*, v.name as variable_name, v.section as variable_section
           FROM extractions e
           LEFT JOIN variables v ON e.variable_id = v.variable_id
           WHERE e.study_id = ?
           ORDER BY v.order_index ASC, v.name ASC""",
        (study_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/studies/{study_id}/extractions", response_model=ExtractionResponse)
async def create_extraction(
    study_id: str,
    body: ExtractionCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    if body.study_id != study_id:
        raise HTTPException(status_code=400, detail="study_id mismatch")
    extraction_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO extractions
           (extraction_id, study_id, variable_id, value, confidence, confidence_tag,
            source_page, source_bbox, source_text, extracted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (extraction_id, study_id, body.variable_id, body.value,
         body.confidence, body.confidence_tag, body.source_page, body.source_bbox,
         body.source_text, body.extracted_by or (user["username"] if user else "system")),
    )
    conn.commit()
    return ExtractionResponse(
        extraction_id=extraction_id, study_id=study_id,
        variable_id=body.variable_id, value=body.value,
        confidence=body.confidence, confidence_tag=body.confidence_tag, source_page=body.source_page,
        source_bbox=body.source_bbox, source_text=body.source_text,
        extracted_by=body.extracted_by or (user["username"] if user else "system"),
    )


@router.put("/extractions/{extraction_id}", response_model=ExtractionResponse)
async def update_extraction(
    extraction_id: str,
    body: ExtractionUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Extraction not found")

    # Track changes in audit log
    old_value = row["value"]
    updates = []
    params = []
    if body.value is not None and body.value != old_value:
        updates.append("value = ?")
        params.append(body.value)
        updates.append("is_edited = 1")
        updates.append("edited_by = ?")
        params.append(user["username"] if user else "anonymous")
        updates.append("edited_at = ?")
        import datetime
        params.append(datetime.datetime.utcnow().isoformat())

        # Get variable name for audit
        v_row = conn.execute(
            "SELECT name FROM variables WHERE variable_id = ?", (row["variable_id"],)
        ).fetchone()
        v_name = v_row["name"] if v_row else ""

        # Write audit log
        conn.execute(
            """INSERT INTO audit_log
               (audit_id, study_id, variable_id, variable_name,
                old_value, new_value, changed_by, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), row["study_id"], row["variable_id"],
             v_name, old_value, body.value,
             user["username"] if user else "anonymous",
             body.reason or ""),
        )

    if body.confidence is not None:
        updates.append("confidence = ?")
        params.append(body.confidence)
    if body.confidence_tag is not None:
        updates.append("confidence_tag = ?")
        params.append(body.confidence_tag)
    if body.source_page is not None:
        updates.append("source_page = ?")
        params.append(body.source_page)
    if body.source_text is not None:
        updates.append("source_text = ?")
        params.append(body.source_text)

    if updates:
        params.append(extraction_id)
        conn.execute(
            f"UPDATE extractions SET {', '.join(updates)} WHERE extraction_id = ?",
            params,
        )
        conn.commit()

    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    return ExtractionResponse(**dict(row))


@router.get("/studies/{study_id}/extractions/audit")
async def get_audit_log(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    rows = conn.execute(
        "SELECT * FROM audit_log WHERE study_id = ? ORDER BY changed_at DESC",
        (study_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ── Dual-reviewer verification & adjudication ──

@router.put("/extractions/{extraction_id}/verify")
async def verify_extraction(
    extraction_id: str,
    body: ExtractionVerifyRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Second reviewer verifies a primary extraction.

    If agree=True, marks as verified.
    If agree=False, stores alternative_value and marks as disagreed.
    """
    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Extraction not found")

    reviewer = body.reviewer or (user["username"] if user else "second_reviewer")
    now = datetime.datetime.utcnow().isoformat()

    if body.agree:
        status = "verified"
        second_value = row["value"]
    else:
        status = "disagreed"
        second_value = body.alternative_value

    conn.execute(
        """UPDATE extractions SET
           verification_status = ?, second_value = ?, second_reviewer = ?,
           verified_at = ?
           WHERE extraction_id = ?""",
        (status, second_value, reviewer, now, extraction_id),
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    return dict(row)


@router.put("/extractions/{extraction_id}/adjudicate")
async def adjudicate_extraction(
    extraction_id: str,
    body: ExtractionAdjudicateRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Adjudicator resolves a disagreement between primary and second reviewer."""
    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Extraction not found")

    adjudicator = body.adjudicator or (user["username"] if user else "adjudicator")
    now = datetime.datetime.utcnow().isoformat()

    # Write audit log for the adjudication
    v_row = conn.execute(
        "SELECT name FROM variables WHERE variable_id = ?", (row["variable_id"],)
    ).fetchone()
    v_name = v_row["name"] if v_row else ""

    conn.execute(
        """INSERT INTO audit_log
           (audit_id, study_id, variable_id, variable_name,
            old_value, new_value, changed_by, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (str(uuid.uuid4()), row["study_id"], row["variable_id"],
         v_name, row["value"], body.final_value, adjudicator,
         f"Adjudication: {body.notes}"),
    )

    conn.execute(
        """UPDATE extractions SET
           verification_status = 'adjudicated',
           adjudicated_value = ?, adjudicator = ?,
           adjudication_notes = ?, value = ?,
           is_edited = 1, edited_by = ?, edited_at = ?
           WHERE extraction_id = ?""",
        (body.final_value, adjudicator, body.notes,
         body.final_value, adjudicator, now, extraction_id),
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM extractions WHERE extraction_id = ?", (extraction_id,)
    ).fetchone()
    return dict(row)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Missing Data Summary Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/extraction/missing-data-summary", response_model=MissingDataSummary)
async def get_missing_data_summary(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get counts of -99, -77, -88 missing data codes across all variables for a project."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    variables = conn.execute(
        "SELECT variable_id, name FROM variables WHERE project_id = ? ORDER BY section, order_index",
        (project_id,),
    ).fetchall()

    total_extractions = 0
    total_99 = 0
    total_77 = 0
    total_88 = 0
    per_var_list = []

    for v in variables:
        vid = v["variable_id"]
        vname = v["name"]
        rows = conn.execute(
            """SELECT e.value FROM extractions e
               JOIN studies s ON e.study_id = s.study_id
               WHERE s.project_id = ? AND e.variable_id = ?""",
            (project_id, vid),
        ).fetchall()

        v_total = len(rows)
        v_99 = sum(1 for r in rows if str(r["value"]).strip() == "-99")
        v_77 = sum(1 for r in rows if str(r["value"]).strip() == "-77")
        v_88 = sum(1 for r in rows if str(r["value"]).strip() == "-88")

        total_extractions += v_total
        total_99 += v_99
        total_77 += v_77
        total_88 += v_88

        per_var_list.append({
            "variable_name": vname,
            "total": v_total,
            "not_reported": v_99,
            "not_applicable": v_77,
            "unable_to_extract": v_88,
        })

    return MissingDataSummary(
        project_id=project_id,
        total_extractions=total_extractions,
        not_reported=total_99,
        not_applicable=total_77,
        unable_to_extract=total_88,
        per_variable=per_var_list,
    )


# ═══════════════════════════════════════════════════════════════════════
#  Coded Extraction (per-variable prompts + confidence tags + missing codes)
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/extractions/ai-batch")
@router.post("/projects/{project_id}/extraction/batch-run")
async def run_ai_batch_extraction(
    project_id: str,
    require_fulltext: bool = Query(False),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run AI batch extraction across all included studies in the project."""
    check_project_access(conn, project_id, user)
    from services.coded_extraction_service import coded_extract_study
    from services.llm_extractor import is_llm_available

    studies = conn.execute(
        "SELECT study_id FROM studies WHERE project_id = ? AND (screening_status IN ('included', 'ta_included') OR is_duplicate = 0)",
        (project_id,),
    ).fetchall()

    model_fn = None
    if is_llm_available():
        from services.llm_client import get_client
        model_fn = get_client().as_model_fn("coded_extract")

    results = []
    for s in studies:
        try:
            res = coded_extract_study(
                s["study_id"],
                project_id,
                db=conn,
                model_fn=model_fn,
                reviewer=user["username"] if user else "ai_batch",
                require_fulltext=require_fulltext,
            )
            results.append({"study_id": s["study_id"], "status": "success", "extractions": res})
        except Exception as e:
            results.append({"study_id": s["study_id"], "status": "error", "error": str(e)})

    return {
        "project_id": project_id,
        "total_studies": len(studies),
        "processed": len(results),
        "results": results,
    }


@router.post("/studies/{study_id}/coded-extract")
async def coded_extract(
    study_id: str,
    project_id: str,
    require_fulltext: bool = Query(False),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run coded extraction for one study.

    For every variable: builds its extraction prompt, extracts via LLM
    (when available) with verbatim source quotes, assigns a confidence tag
    ([DS]/[INF]/[CALC]/[SUP]/[FIG]) or a missing-data code (-99/-77/-88)
    after an exhaustive search + recheck pass. Returns a per-study summary.
    """
    from services.coded_extraction_service import coded_extract_study
    from services.llm_extractor import is_llm_available

    study = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    check_project_access(conn, study["project_id"], user)

    model_fn = None
    if is_llm_available():
        from services.llm_client import get_client
        model_fn = get_client().as_model_fn("coded_extract")

    try:
        return coded_extract_study(
            study_id, project_id, db=conn, model_fn=model_fn,
            reviewer=user["username"] if user else "coded_auto",
            require_fulltext=require_fulltext,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/extraction/prompts")
async def extraction_prompts(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Preview the generated extraction prompt for every variable in the project."""
    from services.extraction_prompt_builder import build_field_prompt

    check_project_access(conn, project_id, user)
    rows = conn.execute(
        "SELECT * FROM variables WHERE project_id = ? ORDER BY section, order_index",
        (project_id,),
    ).fetchall()
    return [
        {
            "variable_id": r["variable_id"],
            "name": r["name"],
            "section": r["section"],
            "field_type": r["field_type"],
            "extraction_prompt": build_field_prompt(dict(r)),
        }
        for r in rows
    ]


@router.get("/projects/{project_id}/extraction/xlsx-coded")
@router.get("/projects/{project_id}/extraction/srma-workbook")
async def coded_extraction_xlsx(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Download the coded extraction workbook (Excel).

    One sheet per variable section (StudyID rows x variable columns), missing-data
    codes color-coded (-99 yellow, -77 grey, -88 orange), a Notes column with the
    confidence tags and source citations, a Prompts sheet, and an Extraction_Legend.
    """
    from services.extraction_excel_service import build_coded_extraction_workbook
    from fastapi.responses import Response

    check_project_access(conn, project_id, user)
    blob = build_coded_extraction_workbook(project_id, conn)
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="coded_extraction_{project_id}.xlsx"'},
    )


# ═══════════════════════════════════════════════════════════════════════
#  Track Changes Review & Active Learning Error Analysis
# ═══════════════════════════════════════════════════════════════════════

class ExtractionDecisionRequest(BaseModel):
    project_id: str
    study_id: str
    variable_id: str
    variable_name: Optional[str] = ""
    original_value: Optional[str] = ""
    corrected_value: Optional[str] = ""
    decision: str  # 'accepted' | 'modified' | 'rejected'
    evidence_quote: Optional[str] = ""
    page_number: Optional[int] = None
    codebook_rules: Optional[str] = ""
    reviewer: Optional[str] = "Expert Reviewer"
    notes: Optional[str] = ""


@router.post("/extraction/decide")
async def record_extraction_decision(
    body: ExtractionDecisionRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Record a human Track Changes decision on one AI-extracted value.

    accepted keeps the value, modified stores corrected_value, rejected sets it to NR,
    undone restores original_value and retires the last decision. The decision is also
    classified (normalization, false extraction, missed context, ...) for error analysis.
    """
    from services import error_analysis_service as eas

    check_project_access(conn, body.project_id, user, "editor")
    if body.decision not in (*eas.VALID_DECISIONS, "undone"):
        raise HTTPException(status_code=400, detail=f"Unknown decision: {body.decision}")
    if body.decision == "modified" and not (body.corrected_value or "").strip():
        raise HTTPException(status_code=400, detail="A modified decision needs corrected_value")
    study = conn.execute(
        "SELECT study_id FROM studies WHERE study_id = ? AND project_id = ?",
        (body.study_id, body.project_id),
    ).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found in this project")
    variable = conn.execute(
        "SELECT variable_id, name FROM variables WHERE variable_id = ? AND project_id = ?",
        (body.variable_id, body.project_id),
    ).fetchone()
    if not variable:
        raise HTTPException(status_code=404, detail="Variable not found in this project")
    var_name = body.variable_name or (variable["name"] if variable and "name" in variable.keys() else "") or ""

    actor = body.reviewer or (user["username"] if user else "") or "reviewer"
    now = datetime.datetime.utcnow().isoformat()
    existing = conn.execute(
        "SELECT extraction_id, value, is_edited FROM extractions WHERE study_id = ? AND variable_id = ?",
        (body.study_id, body.variable_id),
    ).fetchone()

    if body.decision == "undone":
        if existing:
            conn.execute(
                "UPDATE extractions SET value = ?, is_edited = 0, edited_by = '', edited_at = '' WHERE extraction_id = ?",
                (body.original_value, existing["extraction_id"]),
            )
            conn.commit()
        eas.undo_last_decision(conn, body.study_id, body.variable_id)
        return {"status": "success", "undone": True}

    final_value = (
        body.corrected_value if body.decision == "modified"
        else "NR" if body.decision == "rejected"
        else (body.corrected_value or body.original_value or "")
    )
    verification_status = "verified" if body.decision == "accepted" else ("modified" if body.decision == "modified" else "unverified")
    is_edited_flag = 1 if body.decision == "modified" else (existing["is_edited"] if existing else 0)

    if existing:
        conn.execute(
            """UPDATE extractions
               SET value = ?, is_edited = ?, edited_by = ?, edited_at = ?,
                   verification_status = ?, verified_at = ?, verified_by = ?,
                   source_text = COALESCE(NULLIF(?, ''), source_text),
                   source_page = COALESCE(NULLIF(?, 0), source_page)
               WHERE extraction_id = ?""",
            (final_value, is_edited_flag, actor, now,
             verification_status, now if verification_status == "verified" else "",
             actor if verification_status == "verified" else "",
             body.evidence_quote or "", body.page_number or 0,
             existing["extraction_id"]),
        )
        if final_value != existing["value"]:
            conn.execute(
                """INSERT INTO audit_log
                   (audit_id, study_id, variable_id, variable_name, old_value, new_value, changed_by, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), body.study_id, body.variable_id, var_name,
                 existing["value"], final_value, actor, f"Track Changes: {body.decision}"),
            )
    else:
        conn.execute(
            """INSERT INTO extractions
               (extraction_id, study_id, variable_id, value, extracted_by, verification_status, verified_at, verified_by, source_text, source_page)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), body.study_id, body.variable_id, final_value, actor,
             verification_status, now if verification_status == "verified" else "",
             actor if verification_status == "verified" else "",
             body.evidence_quote or "", body.page_number or 1),
        )
    conn.commit()

    record = eas.record_decision(
        conn,
        project_id=body.project_id, study_id=body.study_id, variable_id=body.variable_id,
        variable_name=var_name, original_value=body.original_value or "",
        corrected_value=final_value, decision=body.decision,
        evidence_quote=body.evidence_quote or "", page_number=body.page_number,
        codebook_rules=body.codebook_rules or "", reviewer=actor, notes=body.notes or "",
    )
    return {"status": "success", "record": record}


@router.get("/extraction/error-analysis")
async def get_extraction_error_analysis(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Error breakdown by category and variable, with suggested prompt-tuning rules."""
    from services import error_analysis_service as eas
    check_project_access(conn, project_id, user)
    return eas.get_analysis_summary(conn, project_id)


@router.get("/extraction/export-training-data")
async def export_extraction_training_data(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Verified human decisions as chat-format fine-tuning examples."""
    from services import error_analysis_service as eas
    check_project_access(conn, project_id, user)
    return eas.export_training_dataset(conn, project_id)
