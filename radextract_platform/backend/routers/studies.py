"""Studies router: CRUD for studies within projects, PDF processing."""
from __future__ import annotations
import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from typing import Optional
import sqlite3

from models import StudyCreate, StudyUpdate, StudyResponse
from database import get_db
from services.db_backend import DBBackend
from config import settings
from dependencies import get_current_user, get_current_user_optional, check_project_access
from pydantic import BaseModel, StrictBool
from services import pdf_service, auto_extract_service
from services.pipeline_service import run_pdf_screening_pipeline
from services import docling_extract_service
from services.storage_backend import get_storage, resolve_pdf_path

router = APIRouter(prefix="/api", tags=["studies"])


class BookmarkUpdate(BaseModel):
    bookmarked: StrictBool


@router.get("/projects/{project_id}/bookmarks")
async def list_bookmarks(project_id: str, user: dict = Depends(get_current_user),
                         conn: DBBackend = Depends(get_db)):
    if not conn.get("projects", project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    saved = conn.query("user_review_state", {
        "user_id": user["user_id"], "project_id": project_id,
        "stage": "bookmark", "status": "saved",
    })
    existing = {s["study_id"] for s in conn.query("studies", {"project_id": project_id})}
    return {"study_ids": sorted({s["study_id"] for s in saved if s["study_id"] in existing})}


@router.put("/studies/{study_id}/bookmark")
async def set_bookmark(study_id: str, body: BookmarkUpdate,
                       user: dict = Depends(get_current_user), conn: DBBackend = Depends(get_db)):
    study = conn.get("studies", study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    project_id = study["project_id"]
    check_project_access(conn, project_id, user, min_role="viewer")
    # Deterministic per-user ID makes repeated saves idempotent across stores.
    state_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'bookmark:{user["user_id"]}:{project_id}:{study_id}'))
    if body.bookmarked:
        data = {"user_id": user["user_id"], "project_id": project_id,
                "study_id": study_id, "stage": "bookmark", "status": "saved"}
        if not conn.update("user_review_state", state_id, data):
            try:
                conn.insert("user_review_state", {"state_id": state_id, **data})
            except sqlite3.IntegrityError:
                # Another request may have inserted the same bookmark meanwhile.
                if not conn.update("user_review_state", state_id, data):
                    raise HTTPException(status_code=503, detail="Bookmark could not be saved. Please retry.")
    else:
        if not conn.delete("user_review_state", state_id) and conn.get("user_review_state", state_id):
            raise HTTPException(status_code=503, detail="Bookmark could not be removed. Please retry.")
    conn.commit()
    return {"study_id": study_id, "bookmarked": body.bookmarked}


@router.get("/projects/{project_id}/studies")
async def list_studies(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    check_project_access(conn, project_id, user)
    rows = conn.execute(
        "SELECT * FROM studies WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/projects/{project_id}/studies", response_model=StudyResponse)
async def create_study(
    project_id: str,
    body: StudyCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user)
    if body.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id mismatch")
    study_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO studies
           (study_id, project_id, title, authors, publication_year, journal,
            doi, pmid, abstract, source, study_design, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (study_id, project_id, body.title, body.authors,
         body.publication_year, body.journal, body.doi, body.pmid,
         body.abstract, body.source, body.study_design, body.metadata_json),
    )
    conn.commit()
    return StudyResponse(
        study_id=study_id, project_id=project_id, title=body.title,
        authors=body.authors, publication_year=body.publication_year,
        journal=body.journal, doi=body.doi, pmid=body.pmid,
        abstract=body.abstract, source=body.source,
        study_design=body.study_design, metadata_json=body.metadata_json,
    )


@router.get("/studies/{study_id}", response_model=StudyResponse)
async def get_study(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")
    return dict(row)


@router.put("/studies/{study_id}", response_model=StudyResponse)
async def update_study(study_id: str, body: StudyUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    updates = []
    params = []
    for field in ["title", "authors", "publication_year", "journal", "doi",
                   "pmid", "abstract", "study_design", "screening_status",
                   "screening_reason", "screening_stage", "extraction_status",
                   "pdf_status", "metadata_json"]:
        val = getattr(body, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        params.append(study_id)
        conn.execute(
            f"UPDATE studies SET {', '.join(updates)} WHERE study_id = ?",
            params,
        )
        conn.commit()

    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    return dict(row)


@router.delete("/studies/{study_id}")
async def delete_study(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    for bookmark in conn.query("user_review_state", {"study_id": study_id, "stage": "bookmark"}):
        if not conn.delete("user_review_state", bookmark["state_id"]):
            raise HTTPException(status_code=503, detail="Study bookmarks could not be removed. Please retry.")
    for table, pk in (("record_annotations", "annotation_id"), ("study_tag_links", "link_id")):
        for row in conn.query(table, {"study_id": study_id}):
            if not conn.delete(table, row[pk]):
                raise HTTPException(status_code=503, detail="Record collaboration data could not be removed. Please retry.")
    cursor = conn.execute(
        "DELETE FROM studies WHERE study_id = ?", (study_id,)
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Study not found")
    return {"deleted": True, "study_id": study_id}


@router.post("/studies/{study_id}/upload-pdf")
async def upload_pdf(
    study_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    auto_process: bool = Query(False, description="Automatically convert PDF to Docling JSON and run screening pipeline"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    project_id = row["project_id"]
    check_project_access(conn, project_id, user)

    # Save file via storage backend
    storage = get_storage("upload")
    storage_key = f"{project_id}/{study_id}.pdf"
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    storage.save_bytes(storage_key, content)
    filepath = storage.get_file_path(storage_key)

    conn.execute(
        "UPDATE studies SET pdf_path = ?, pdf_status = 'uploaded' WHERE study_id = ?",
        (storage_key, study_id),
    )
    conn.commit()

    # Always run Docling conversion + AI screening + Data Review auto-extraction in background
    if auto_process:
        background_tasks.add_task(run_pdf_screening_pipeline, study_id, project_id)

    return {
        "study_id": study_id,
        "project_id": project_id,
        "pdf_path": filepath,
        "pdf_status": "uploaded",
        "pipeline_status": "queued_in_background",
        "message": "PDF uploaded. Docling IBM conversion, full-text screening, and Data Review extraction running in background.",
    }


@router.post("/studies/{study_id}/ai-screen-fulltext")
async def ai_screen_fulltext(
    study_id: str,
    record_decision: bool = Query(True, description="Record decision in screening_decisions table as ai_reviewer"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run AI full-text screening using parsed Docling JSON and Gemini LLM with signals and safety net."""
    import json
    import uuid
    from services.llm_extractor import screen_fulltext_with_llm
    from services.signal_generator import generate_signals
    from services.signal_prefilter import prefilter_study
    from services.safety_net import apply_overrides
    from routers.screening import _check_and_record_conflict

    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    project_id = study["project_id"]
    project = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    pico = json.loads(project["pico_json"]) if project and project["pico_json"] else {}

    reasons_raw = project["exclusion_reasons_json"] if project and project["exclusion_reasons_json"] else "[]"
    reasons = json.loads(reasons_raw) if reasons_raw else []

    # Load signals
    sig_res = generate_signals(project_id, db=conn, force=False)
    signals = sig_res.get("signals", {})

    # Get full text from pdf_documents
    pdf_data = pdf_service.get_pdf_data(study_id)
    pdf_text_available = bool(pdf_data and pdf_data.get("full_text"))
    full_text = pdf_data.get("full_text", "") if pdf_data else (study["abstract"] or "")

    title = (study["title"] or "").strip()
    abstract = (study["abstract"] or "").strip()

    if not full_text:
        raise HTTPException(status_code=400, detail="No PDF text or abstract available for screening.")

    # 1. Run Pre-filter
    pre = prefilter_study(title=title, abstract=full_text or abstract, signals=signals, stage="ft")

    # 2. Run LLM screening
    llm_raw = screen_fulltext_with_llm(
        text=full_text,
        study_metadata=dict(study),
        pico=pico,
        exclusion_reasons=reasons,
    )
    llm_res = {
        "recommendation": llm_raw.get("recommendation", "uncertain"),
        "confidence": float(llm_raw.get("confidence", 0.0)),
        "reason_code": llm_raw.get("reason_code", ""),
        "reason_text": llm_raw.get("reason_text", ""),
        "rationale": llm_raw.get("rationale", ""),
        "quotes": llm_raw.get("quotes", []),
    }

    # 3. Apply Safety-net overrides
    final_res = apply_overrides(llm_res, pre, signals=signals, stage="ft", pdf_text_available=pdf_text_available)

    # Check human decision
    human_row = conn.execute(
        "SELECT decision FROM screening_decisions WHERE study_id = ? AND reviewer_id NOT IN ('ai_reviewer', 'ai_screener', 'ai') AND stage = 'ft' ORDER BY created_at DESC",
        (study_id,),
    ).fetchone()
    human_decision = human_row["decision"] if human_row else None

    conflict_detected = False
    if record_decision:
        dec_id = str(uuid.uuid4())
        existing_dec = conn.execute(
            "SELECT * FROM screening_decisions WHERE study_id = ? AND reviewer_id IN ('ai_reviewer', 'ai_screener') AND stage = 'ft'",
            (study_id,),
        ).fetchone()
        if existing_dec:
            conn.execute(
                "UPDATE screening_decisions SET decision = ?, reason_code = ?, reason_text = ? WHERE decision_id = ?",
                (final_res["recommendation"], final_res.get("reason_code", ""), final_res.get("reason_text", ""), existing_dec["decision_id"]),
            )
        else:
            conn.execute(
                """INSERT INTO screening_decisions
                   (decision_id, study_id, project_id, reviewer_id, reviewer_name,
                    decision, reason_code, reason_text, stage, is_blinded)
                   VALUES (?, ?, ?, 'ai_reviewer', 'AI Reviewer', ?, ?, ?, 'ft', 0)""",
                (dec_id, study_id, project_id, final_res["recommendation"], final_res.get("reason_code", ""), final_res.get("reason_text", "")),
            )
        conflict_detected = _check_and_record_conflict(
            conn, study_id, project_id, "ft",
            latest_decision=final_res["recommendation"],
            reason_text=final_res.get("reason_text", ""),
        )
    else:
        if human_decision and human_decision != final_res["recommendation"]:
            conflict_detected = True

    if hasattr(conn, "commit"):
        conn.commit()

    return {
        "study_id": study_id,
        "recommendation": final_res["recommendation"],
        "confidence": float(final_res["confidence"]),
        "reason_code": final_res.get("reason_code", ""),
        "reason_text": final_res.get("reason_text", ""),
        "rationale": final_res.get("rationale", ""),
        "quotes": final_res.get("quotes", []),
        "prefilter_flag": final_res.get("prefilter_flag", "clear"),
        "confidence_ceiling": float(final_res.get("confidence_ceiling", 1.0)),
        "override_notes": final_res.get("override_notes", []),
        "conflict_detected": conflict_detected,
        "human_decision": human_decision,
        "reviewer_id": "ai_reviewer",
        "suggestion": final_res["recommendation"],
        "reason": final_res.get("reason_text", ""),
    }


@router.post("/studies/{study_id}/ai-screen-title-abstract")
async def ai_screen_title_abstract(
    study_id: str,
    record_decision: bool = Query(True, description="Record decision in screening_decisions table as ai_reviewer"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """AI-assisted title/abstract screening suggestion using signals, pre-filter, and safety net."""
    import json
    import uuid
    from services.llm_client import get_client
    from services.signal_generator import generate_signals
    from services.signal_prefilter import prefilter_study
    from services.safety_net import apply_overrides
    from routers.screening import _check_and_record_conflict

    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    project_id = study["project_id"]
    project = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    pico = json.loads(project["pico_json"]) if project and project["pico_json"] else {}

    # Load signals
    sig_res = generate_signals(project_id, db=conn, force=False)
    signals = sig_res.get("signals", {})

    title = (study["title"] or "").strip()
    abstract = (study["abstract"] or "").strip()
    text = f"Title: {title}\nAbstract: {abstract}".strip()

    from services.clarification_generator import screen_with_clarification

    # 1. Pre-filter
    pre = prefilter_study(title=title, abstract=abstract, signals=signals, stage="ta")

    if not text or (not title and not abstract):
        llm_res = {
            "recommendation": "uncertain",
            "confidence": 0.0,
            "reason_code": "NO_TEXT",
            "reason_text": "No title or abstract available for screening",
            "quotes": [],
            "evidence_quote": "",
        }
    else:
        llm_res = screen_with_clarification(
            title=title,
            abstract=abstract,
            pico_criteria=pico,
            exclusion_reasons=None,
            stage="ta",
            signals=signals,
        )

    # 2. Safety-net overrides
    final_res = apply_overrides(llm_res, pre, signals=signals, stage="ta", pdf_text_available=True)
    if llm_res.get("recommendation") == "needs_clarification" and final_res.get("recommendation") == "needs_clarification":
        final_res["clarification"] = llm_res.get("clarification")

    # Check human decision
    human_row = conn.execute(
        "SELECT decision FROM screening_decisions WHERE study_id = ? AND reviewer_id NOT IN ('ai_reviewer', 'ai_screener', 'ai') AND stage = 'ta' ORDER BY created_at DESC",
        (study_id,),
    ).fetchone()
    human_decision = human_row["decision"] if human_row else None

    conflict_detected = False
    if record_decision:
        if final_res.get("recommendation") == "needs_clarification":
            clar = final_res.get("clarification", {})
            question_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO clarification_questions (
                    question_id, study_id, project_id, stage, question_type,
                    question_text, options_json, context_excerpt, pico_aspect,
                    ai_interim_decision, ai_interim_confidence, ai_interim_reason, status
                ) VALUES (?, ?, ?, 'ta', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    question_id,
                    study_id,
                    project_id,
                    clar.get("question_type", "study_design"),
                    clar.get("question_text", ""),
                    json.dumps(clar.get("options", [])),
                    clar.get("context_excerpt", ""),
                    clar.get("pico_aspect", "study_design"),
                    clar.get("interim_decision", "uncertain"),
                    float(final_res.get("confidence", 0.0)),
                    clar.get("interim_reason", final_res.get("reason_text", "")),
                ),
            )
            conn.execute(
                "UPDATE studies SET screening_status = 'awaiting_clarification' WHERE study_id = ?",
                (study_id,),
            )
        else:
            dec_id = str(uuid.uuid4())
            existing_dec = conn.execute(
                "SELECT * FROM screening_decisions WHERE study_id = ? AND reviewer_id IN ('ai_reviewer', 'ai_screener') AND stage = 'ta'",
                (study_id,),
            ).fetchone()
            if existing_dec:
                conn.execute(
                    "UPDATE screening_decisions SET decision = ?, reason_code = ?, reason_text = ? WHERE decision_id = ?",
                    (final_res["recommendation"], final_res.get("reason_code", ""), final_res.get("reason_text", ""), existing_dec["decision_id"]),
                )
            else:
                conn.execute(
                    """INSERT INTO screening_decisions
                       (decision_id, study_id, project_id, reviewer_id, reviewer_name,
                        decision, reason_code, reason_text, stage, is_blinded)
                       VALUES (?, ?, ?, 'ai_reviewer', 'AI Reviewer', ?, ?, ?, 'ta', 0)""",
                    (dec_id, study_id, project_id, final_res["recommendation"], final_res.get("reason_code", ""), final_res.get("reason_text", "")),
                )
            conflict_detected = _check_and_record_conflict(
                conn, study_id, project_id, "ta",
                latest_decision=final_res["recommendation"],
                reason_text=final_res.get("reason_text", ""),
            )
    else:
        if human_decision and human_decision != final_res["recommendation"] and final_res["recommendation"] != "needs_clarification":
            conflict_detected = True

    if hasattr(conn, "commit"):
        conn.commit()

    return {
        "study_id": study_id,
        "recommendation": final_res["recommendation"],
        "confidence": float(final_res["confidence"]),
        "reason_code": final_res.get("reason_code", ""),
        "reason_text": final_res.get("reason_text", ""),
        "rationale": final_res.get("reason_text", ""),
        "quotes": final_res.get("quotes", []),
        "prefilter_flag": final_res.get("prefilter_flag", "clear"),
        "confidence_ceiling": float(final_res.get("confidence_ceiling", 1.0)),
        "override_notes": final_res.get("override_notes", []),
        "conflict_detected": conflict_detected,
        "human_decision": human_decision,
        "reviewer_id": "ai_reviewer",
        "suggestion": final_res["recommendation"],
        "reason": final_res.get("reason_text", ""),
        "clarification": final_res.get("clarification"),
    }


@router.post("/projects/{project_id}/screening/batch-upload-pdf")
async def batch_upload_pdf(
    project_id: str,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    auto_screen: bool = Query(True, description="Also trigger AI full-text screening after Docling JSON conversion"),
    conn: DBBackend = Depends(get_db),
):
    """Batch upload PDFs for full-text screening with automatic Docling JSON conversion.

    Matches each file by PMID in filename (e.g. 37557060.pdf), DOI, or title keywords.
    Unmatched PDFs auto-create new study records from PDF metadata (title, authors).
    Queues Docling conversion + AI screening + Data Review auto-extraction in the background.
    """
    import re
    studies = conn.execute(
        "SELECT study_id, title, pmid, doi FROM studies WHERE project_id = ?",
        (project_id,),
    ).fetchall()

    matched = 0
    auto_created = 0
    errors = []
    results = []

    storage = get_storage("upload")

    for file in files:
        fname = file.filename or ""
        content = await file.read()
        target_study = None

        # Try PMID match
        pmid_match = re.search(r"(\d{7,9})", fname)
        if pmid_match:
            extracted_pmid = pmid_match.group(1)
            for s in studies:
                if s["pmid"] and str(s["pmid"]).strip() == extracted_pmid:
                    target_study = s
                    break

        # Try title substring match if no PMID match
        if not target_study:
            fname_clean = re.sub(r"[^a-zA-Z0-9\s]", " ", fname).lower()
            for s in studies:
                t_clean = re.sub(r"[^a-zA-Z0-9\s]", " ", s["title"] or "").lower()
                words = [w for w in fname_clean.split() if len(w) > 4]
                if words and sum(1 for w in words if w in t_clean) >= 2:
                    target_study = s
                    break

        if target_study:
            sid = target_study["study_id"]
            storage_key = f"{project_id}/{sid}.pdf"
            storage.save_bytes(storage_key, content)

            conn.execute(
                "UPDATE studies SET pdf_path = ?, pdf_status = 'uploaded' WHERE study_id = ?",
                (storage_key, sid),
            )
            conn.commit()

            # Queue background pipeline: Docling -> AI screening -> auto-extraction to Review
            background_tasks.add_task(run_pdf_screening_pipeline, sid, project_id)

            matched += 1
            results.append({
                "filename": fname,
                "study_id": sid,
                "title": target_study["title"],
                "status": "matched",
                "engine": "docling_background_worker",
            })
        else:
            # Auto-create a new study from PDF metadata
            try:
                meta = pdf_service.extract_pdf_metadata(content)
                title = meta.get("title", "") or fname.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
                authors = meta.get("authors", "")

                sid = str(uuid.uuid4())
                storage_key = f"{project_id}/{sid}.pdf"
                storage.save_bytes(storage_key, content)

                conn.execute(
                    """INSERT INTO studies
                       (study_id, project_id, title, authors, pdf_path, pdf_status,
                        source, screening_status)
                       VALUES (?, ?, ?, ?, ?, 'uploaded', 'PDF upload', 'pending')""",
                    (sid, project_id, title, authors, storage_key),
                )
                conn.commit()

                # Queue background pipeline
                background_tasks.add_task(run_pdf_screening_pipeline, sid, project_id)

                auto_created += 1
                results.append({
                    "filename": fname,
                    "study_id": sid,
                    "title": title,
                    "status": "auto_created",
                    "engine": "docling_background_worker",
                })
            except Exception as e:
                errors.append(f"{fname}: {str(e)}")

    return {
        "total_files": len(files),
        "matched_and_processed": matched + auto_created,
        "matched": matched,
        "auto_created": auto_created,
        "unmatched_files": errors,
        "details": results,
        "message": f"Queued {matched + auto_created} PDFs for background Docling conversion & AI full-text screening ({matched} matched, {auto_created} auto-created)",
    }


@router.get("/studies/{study_id}/find-quote-location")
async def find_quote_location(study_id: str, quote: str = Query(...), user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Find exact multiline bounding boxes for a quote matching AIDE-Web architecture.
    Returns: {found: bool, page: int, rects: [{left, top, width, height}]}
    """
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    import pypdfium2 as pdfium

    try:
        row = conn.execute(
            "SELECT pdf_path FROM studies WHERE study_id = ?", (study_id,)
        ).fetchone()
        pdf_path = resolve_pdf_path(row["pdf_path"]) if row else None
        if not pdf_path:
            raise HTTPException(status_code=404, detail="PDF not found")

        pdf = pdfium.PdfDocument(pdf_path)
        
        # Clean and normalize search string (mirroring AIDE-Web normalizeForMatch)
        q_norm = (
            quote.replace("‘", "'")
            .replace("’", "'")
            .replace("“", '"')
            .replace("”", '"')
            .replace(r"-\s+", "")
            .lower()
            .strip()
        )
        
        # Build search candidates: full quote, 8-word prefix, 4-word prefix, keywords
        candidates = [q_norm]
        words = [w for w in q_norm.replace(".", " ").replace(",", " ").replace(";", " ").split() if len(w) > 3]
        if len(words) >= 8:
            candidates.append(" ".join(words[:8]))
        if len(words) >= 4:
            candidates.append(" ".join(words[:4]))
        if len(words) >= 2:
            candidates.append(" ".join(words[:2]))

        for p_idx, page in enumerate(pdf):
            tp = page.get_textpage()
            raw_text = tp.get_text_range()
            norm_page_text = raw_text.lower()
            w, h = page.get_width(), page.get_height()

            for cand in candidates:
                if not cand or len(cand) < 4:
                    continue
                
                # Check for match in page text
                idx = norm_page_text.find(cand)
                if idx != -1:
                    match_len = len(cand)
                    # Group character boxes into lines (AIDE-Web itemsToPercentRects pattern)
                    char_boxes = []
                    for i in range(idx, idx + match_len):
                        try:
                            l, b, r, t = tp.get_charbox(i)
                            if r > l and t > b:
                                char_boxes.append((l, b, r, t))
                        except Exception:
                            continue

                    if not char_boxes:
                        continue

                    # Cluster character boxes into lines based on Y-proximity (tolerance = 4pt)
                    lines = []
                    current_line = [char_boxes[0]]
                    for cb in char_boxes[1:]:
                        prev_mid_y = (current_line[0][1] + current_line[0][3]) / 2
                        curr_mid_y = (cb[1] + cb[3]) / 2
                        if abs(curr_mid_y - prev_mid_y) <= 4:
                            current_line.append(cb)
                        else:
                            lines.append(current_line)
                            current_line = [cb]
                    lines.append(current_line)

                    # Compute union rect for each line as percentage (0-100%)
                    rects = []
                    for line in lines:
                        min_l = min(b[0] for b in line)
                        min_b = min(b[1] for b in line)
                        max_r = max(b[2] for b in line)
                        max_t = max(b[3] for b in line)

                        rects.append({
                            "left": (min_l / w) * 100,
                            "top": (1 - (max_t / h)) * 100,
                            "width": ((max_r - min_l) / w) * 100,
                            "height": ((max_t - min_b) / h) * 100,
                        })

                    return {
                        "found": True,
                        "page": p_idx + 1,
                        "matched_text": cand,
                        "rects": rects,
                    }

        return {"found": False, "page": 1, "rects": []}
    except HTTPException:
        raise
    except Exception as e:
        return {"found": False, "error": str(e), "page": 1, "rects": []}

@router.get("/studies/{study_id}/pdf-page")
async def render_pdf_page(study_id: str, page: int = Query(1, ge=1), scale: float = Query(2.0, ge=0.5, le=4.0), user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Render a specific PDF page to high-resolution PNG image on the server using pypdfium2.
    Zero client-side WebWorker issues, 100% reliable across all browsers & web environments.
    """
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    import io
    import pypdfium2 as pdfium
    from fastapi.responses import Response

    try:
        row = conn.execute(
            "SELECT pdf_path FROM studies WHERE study_id = ?", (study_id,)
        ).fetchone()
        pdf_path = resolve_pdf_path(row["pdf_path"]) if row else None
        if not pdf_path:
            raise HTTPException(status_code=404, detail="PDF not found")

        pdf = pdfium.PdfDocument(pdf_path)
        page_idx = page - 1
        if page_idx < 0 or page_idx >= len(pdf):
            raise HTTPException(status_code=400, detail=f"Page {page} out of bounds (1-{len(pdf)})")

        page_obj = pdf[page_idx]
        pil_img = page_obj.render(scale=scale).to_pil()
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG", optimize=True)
        return Response(content=buf.getvalue(), media_type="image/png", headers={"X-Total-Pages": str(len(pdf))})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF render failed: {str(e)}")

@router.get("/studies/{study_id}/pdf-file")
async def serve_pdf(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Serve the raw PDF file for the PDF.js viewer."""
    row = conn.execute(
        "SELECT project_id, pdf_path FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")
    check_project_access(conn, row["project_id"], user)
    pdf_path = resolve_pdf_path(row["pdf_path"]) if row["pdf_path"] else None
    if not pdf_path:
        raise HTTPException(status_code=404, detail="No PDF file uploaded")
    from fastapi.responses import FileResponse
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        headers={"Accept-Ranges": "bytes"},
    )


# ── PDF processing endpoints ──

@router.post("/studies/{study_id}/process-pdf")
async def process_pdf(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Process the uploaded PDF for a study using Docling or pdfplumber fallback.

    Extracts full text, pages, tables, and bounding-box annotations.
    Stores results in the pdf_documents table.
    """
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid:
        check_project_access(conn, _pid["project_id"], user)
    try:
        result = pdf_service.process_pdf(study_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")


@router.get("/studies/{study_id}/pdf-data")
async def get_pdf_data(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get processed PDF data (full text, pages, annotations, tables)."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid:
        check_project_access(conn, _pid["project_id"], user)
    data = pdf_service.get_pdf_data(study_id)
    if not data:
        raise HTTPException(status_code=404, detail="No processed PDF data. Process the PDF first.")
    return data


@router.get("/studies/{study_id}/pdf-summary")
async def get_pdf_summary(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get a lightweight summary of the processed PDF (no full text payload)."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid:
        check_project_access(conn, _pid["project_id"], user)
    return pdf_service.get_pdf_summary(study_id)


@router.get("/studies/{study_id}/docling-json")
async def get_docling_json(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get the raw Docling JSON structure for a study's PDF."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid:
        check_project_access(conn, _pid["project_id"], user)
    data = pdf_service.get_docling_json(study_id, db=conn)
    if not data:
        raise HTTPException(status_code=404, detail="No Docling JSON found for this study. Process the PDF first.")
    return data



@router.delete("/studies/{study_id}/pdf-data")
async def delete_pdf_data(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Delete processed PDF data for a study."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid:
        check_project_access(conn, _pid["project_id"], user)
    success = pdf_service.delete_pdf_data(study_id)
    if not success:
        raise HTTPException(status_code=404, detail="No processed PDF data to delete.")
    return {"deleted": True, "study_id": study_id}


@router.post("/studies/{study_id}/auto-extract")
async def auto_extract(
    study_id: str,
    project_id: str = Query(...),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user)
    """Run automated data extraction from the processed PDF.

    Uses the improved Docling-based extraction service when available, which
    leverages structured table data for numerical value extraction (sensitivity,
    specificity, PPV, NPV, AUC, sample size). Falls back to legacy keyword-based
    extraction when no table data is available.

    Results are stored in the extractions table with extracted_by='auto'.
    """
    try:
        result = docling_extract_service.auto_extract_with_docling(
            study_id=study_id,
            project_id=project_id,
            reviewer=user["username"] if user else "auto",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Auto-extraction failed: {str(e)}")


# ── Citation endpoints ──

@router.get("/studies/{study_id}/citations")
async def get_citations(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get citations in all 6 formats (vancouver, apa, mla, chicago, harvard, bibtex)."""
    from services.citation_service import generate_citations

    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    study_data = {
        "authors": row["authors"] or "",
        "title": row["title"] or "",
        "journal": row["journal"] or "",
        "publication_year": row["publication_year"],
        "doi": row["doi"] or "",
        "pmid": row["pmid"] or "",
    }

    # Try to extract volume/issue/pages from metadata_json
    try:
        import json
        meta = json.loads(row["metadata_json"]) if row["metadata_json"] else {}
        study_data["volume"] = meta.get("volume", "")
        study_data["issue"] = meta.get("issue", "")
        study_data["pages"] = meta.get("pages", "")
    except (json.JSONDecodeError, TypeError):
        pass

    citations = generate_citations(study_data)
    return {"study_id": study_id, "citations": citations}


@router.get("/studies/{study_id}/citations/{fmt}")
async def get_citation_format(study_id: str, fmt: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get a citation in a single format."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    from services.citation_service import generate_citation

    valid_formats = ["vancouver", "apa", "mla", "chicago", "harvard", "bibtex"]
    if fmt.lower() not in valid_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format. Use one of: {', '.join(valid_formats)}"
        )

    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    study_data = {
        "authors": row["authors"] or "",
        "title": row["title"] or "",
        "journal": row["journal"] or "",
        "publication_year": row["publication_year"],
        "doi": row["doi"] or "",
        "pmid": row["pmid"] or "",
    }

    try:
        import json
        meta = json.loads(row["metadata_json"]) if row["metadata_json"] else {}
        study_data["volume"] = meta.get("volume", "")
        study_data["issue"] = meta.get("issue", "")
        study_data["pages"] = meta.get("pages", "")
    except (json.JSONDecodeError, TypeError):
        pass

    citation = generate_citation(study_data, fmt.lower())
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(citation, media_type="text/plain")
