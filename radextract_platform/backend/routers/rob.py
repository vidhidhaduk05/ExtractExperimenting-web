"""Risk-of-bias API router.

Endpoints:
  GET    /api/rob/tools                     — list all RoB tools
  GET    /api/rob/tools/{tool_key}          — get specific tool definition
  POST   /api/studies/{study_id}/rob        — create assessment for a study
  GET    /api/studies/{study_id}/rob        — list assessments for a study
  GET    /api/rob/assessments/{id}          — get full assessment detail
  DELETE /api/rob/assessments/{id}          — delete assessment
  PUT    /api/rob/judgments/{id}            — update domain judgment
  PUT    /api/rob/answers/{id}             — update signaling answer
  POST   /api/rob/assessments/{id}/ai-prefill — run AI pre-fill
  GET    /api/projects/{project_id}/rob/summary — project summary
  GET    /api/projects/{project_id}/rob/figure  — robvis traffic-light or summary figure
  GET    /api/projects/{project_id}/rob/export  — export RoB data
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import sqlite3

from models import (
    RobAssessmentCreate, RobAssessmentDetail, RobAssessmentResponse,
    RobDomainJudgmentUpdate, RobSignalingAnswerUpdate,
    RobAIPrefillRequest, RobAIPrefillResult, RobProjectSummary,
    RobRunProgressResponse,
)
from services.rob_tools import (
    list_tools, get_tool, tool_to_dict, select_rob_tool,
    select_rob_tool_with_alternatives,
)
from services import rob_service, rob_ai, robvis_service
from services import pdf_service
from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from pydantic import BaseModel

router = APIRouter(prefix="/api/rob", tags=["risk-of-bias"])


class RobToolOverrideRequest(BaseModel):
    """Request to change tool for an existing assessment."""
    tool_id: str


# ── Dual-reviewer models ──

class RobVerifyRequest(BaseModel):
    """Second assessor verification of a RoB assessment."""
    agree: bool = True
    second_assessment: dict = {}  # alternative judgments if disagree
    assessor: str = ""


class RobAdjudicateRequest(BaseModel):
    """Adjudicator resolves a RoB disagreement."""
    final_judgment: str  # final overall judgment
    adjudicator: str = ""
    notes: str = ""


# ── Tool definitions ──

@router.get("/tools")
async def list_rob_tools():
    """List all available RoB tools with full definitions."""
    return [tool_to_dict(t) for t in list_tools()]


@router.get("/tools/{tool_key}")
async def get_rob_tool(tool_key: str):
    """Get a specific RoB tool definition."""
    tool = get_tool(tool_key)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Unknown RoB tool: {tool_key}")
    return tool_to_dict(tool)


@router.get("/tools/auto-select/{study_design}")
async def auto_select_tool(study_design: str):
    """Auto-select the appropriate RoB tool based on study design."""
    tool_key, confidence, alternatives = select_rob_tool_with_alternatives(study_design)
    if tool_key == "manual":
        return {
            "tool": "manual",
            "confidence": confidence,
            "alternatives": alternatives,
            "message": "No automatic match; please select manually.",
        }
    tool = get_tool(tool_key)
    return {
        "tool": tool_key,
        "confidence": confidence,
        "alternatives": alternatives,
        "tool_definition": tool_to_dict(tool) if tool else None,
    }


# ── Assessment CRUD ──

@router.post("/studies/{study_id}/rob", response_model=dict)
async def create_assessment(
    study_id: str,
    body: RobAssessmentCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a new RoB assessment for a study."""
    if body.study_id != study_id:
        raise HTTPException(status_code=400, detail="study_id mismatch")
    check_project_access(conn, body.project_id, user, min_role="reviewer")
    try:
        result = rob_service.create_assessment(
            study_id=body.study_id,
            project_id=body.project_id,
            tool=body.tool,
            outcome_label=body.outcome_label,
            assessed_by=user["username"] if user else "system",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studies/{study_id}/rob/auto", response_model=dict)
async def auto_create_assessment(
    study_id: str,
    project_id: str = Query(...),
    study_design: str = Query(""),
    outcome_label: str = Query(""),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Auto-select RoB tool based on study design and create assessment."""
    check_project_access(conn, project_id, user, min_role="reviewer")
    try:
        result = rob_service.auto_select_and_create_assessment(
            study_id=study_id,
            project_id=project_id,
            study_design=study_design,
            outcome_label=outcome_label,
            assessed_by=user["username"] if user else "system",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/studies/{study_id}/rob")
async def list_study_assessments(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List all RoB assessments for a study."""
    study = conn.get("studies", study_id)
    if study:
        check_project_access(conn, study["project_id"], user)
    return rob_service.list_assessments_for_study(study_id, db=conn)


@router.get("/assessments/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get full assessment detail with all domain judgments and signaling answers."""
    result = rob_service.get_assessment(assessment_id, db=conn)
    if not result:
        raise HTTPException(status_code=404, detail="Assessment not found")
    check_project_access(conn, result.get("project_id", ""), user, min_role="viewer")
    return result


@router.delete("/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Delete a RoB assessment and all its child records."""
    assessment = rob_service.get_assessment(assessment_id, db=conn)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    check_project_access(conn, assessment.get("project_id", ""), user, min_role="reviewer")
    success = rob_service.delete_assessment(assessment_id, db=conn)
    if not success:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {"deleted": True, "assessment_id": assessment_id}


@router.put("/assessments/{assessment_id}/tool")
async def override_assessment_tool(
    assessment_id: str,
    body: RobToolOverrideRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Override or switch the tool used for an assessment."""
    assessment = rob_service.get_assessment(assessment_id, db=conn)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    check_project_access(conn, assessment.get("project_id", ""), user, min_role="reviewer")
    try:
        return rob_service.change_assessment_tool(assessment_id, body.tool_id, db=conn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Domain Judgment Updates ──

@router.put("/judgments/{judgment_id}")
async def update_judgment(
    judgment_id: str,
    body: RobDomainJudgmentUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Update a domain judgment (human override or verification)."""
    judgment = conn.get("rob_domain_judgments", judgment_id)
    if judgment:
        assessment = rob_service.get_assessment(judgment["assessment_id"], db=conn)
        if assessment:
            check_project_access(conn, assessment["project_id"], user, min_role="reviewer")
    try:
        result = rob_service.update_domain_judgment(
            judgment_id=judgment_id,
            risk_judgment=body.risk_judgment,
            applicability=body.applicability,
            support_text=body.support_text,
            human_verified=body.human_verified,
            verified_by=user["username"] if user else "anonymous",
            db=conn,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Signaling Answer Updates ──

@router.put("/answers/{answer_id}")
async def update_answer(
    answer_id: str,
    body: RobSignalingAnswerUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Update a signaling answer and recompute parent domain judgment."""
    answer = conn.get("rob_signaling_answers", answer_id)
    if answer:
        judgment = conn.get("rob_domain_judgments", answer.get("judgment_id"))
        if judgment:
            assessment = rob_service.get_assessment(judgment.get("assessment_id"), db=conn)
            if assessment:
                check_project_access(conn, assessment["project_id"], user, min_role="reviewer")
    try:
        result = rob_service.update_signaling_answer(
            answer_id=answer_id,
            answer=body.answer,
            human_verified=body.human_verified,
            db=conn,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── AI Pre-fill ──

@router.post("/assessments/{assessment_id}/ai-prefill", response_model=RobAIPrefillResult)
async def ai_prefill(
    assessment_id: str,
    body: RobAIPrefillRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Run AI pre-fill for an assessment.

    Automatically fetches the processed PDF full text from pdf_documents
    if available. Falls back to the abstract from the request body.

    Uses model_fn pattern. If body.model_fn_name is 'mock', uses the
    deterministic mock (no LLM required). Otherwise, would use a real
    LLM backend (configured externally).
    """
    assessment = rob_service.get_assessment(assessment_id, db=db)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    check_project_access(db, assessment["project_id"], user, min_role="reviewer")

    tool_key = assessment["tool"]

    # Fetch processed PDF full text automatically
    pdf_full_text = pdf_service.get_full_text(assessment["study_id"])
    full_text = pdf_full_text if pdf_full_text and len(pdf_full_text) > 100 else (body.full_text or "")
    used_full_text = len(full_text) > 100

    if body.model_fn_name == "mock":
        model_fn = rob_ai.mock_model_fn
    else:
        from services.llm_client import get_client
        from services.llm_extractor import is_llm_available
        if is_llm_available():
            model_fn = get_client().as_model_fn("prefill_rob_domain")
        else:
            raise HTTPException(
                status_code=503,
                detail="LLM service unavailable for Risk of Bias prefill. Configure an LLM provider to prefill assessments.",
            )

    # Build study metadata from the actual study row (was: all empty strings,
    # which gave the LLM no study context and degraded every prefill)
    study = db.execute(
        "SELECT title, authors, journal, publication_year, study_design FROM studies WHERE study_id = ?",
        (assessment["study_id"],),
    ).fetchone()
    study_metadata = {
        "title": study["title"] if study else "",
        "authors": study["authors"] if study else "",
        "journal": study["journal"] if study else "",
        "publication_year": study["publication_year"] if study else "",
        "study_design": study["study_design"] if study else "",
    }

    # Run pre-fill
    ai_results = rob_ai.prefill_assessment(
        tool_key=tool_key,
        study_metadata=study_metadata,
        full_text=full_text,
        abstract=body.abstract,
        model_fn=model_fn,
    )

    # Apply results to database
    result = rob_service.apply_ai_prefill(assessment_id, ai_results)
    result["used_full_text"] = used_full_text
    return RobAIPrefillResult(**result)


@router.post("/assessments/{assessment_id}/accept-ai")
async def accept_ai_suggestions(
    assessment_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Accept all AI-suggested answers and recompute judgments.

    This is the 'accept all' shortcut — the researcher can still override
    individual answers afterward via PUT /api/rob/answers/{id}.
    """
    assessment = rob_service.get_assessment(assessment_id, db=conn)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    check_project_access(conn, assessment["project_id"], user, min_role="reviewer")
    try:
        result = rob_service.accept_ai_suggestions(
            assessment_id,
            verified_by=user["username"] if user else "anonymous",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Project Summary & Batch Runner ──

@router.get("/projects/{project_id}/summary")
async def project_rob_summary(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get RoB summary for traffic-light chart rendering."""
    check_project_access(conn, project_id, user)
    return rob_service.get_project_summary(project_id)


@router.get("/projects/{project_id}/figure")
async def project_rob_figure(
    project_id: str,
    plot: str = Query("traffic", pattern="^(traffic|traffic_light|summary)$"),
    colour: str = Query("cochrane"),
    tool: Optional[str] = Query(None),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Publication RoB figure from the robvis R package.

    plot is traffic or summary. colour is cochrane or colourblind.
    When R or robvis is missing, the traffic light uses the matplotlib chart.
    """
    check_project_access(conn, project_id, user)
    summary = rob_service.get_project_summary(project_id)
    groups = summary.get("tool_groups") or {}
    if tool:
        if tool not in groups:
            raise HTTPException(status_code=404, detail=f"No assessments use tool: {tool}")
        summary = {**groups[tool], "project_id": project_id, "tool": tool}
    elif len(groups) > 1:
        first_tool = sorted(groups)[0]
        summary = {**groups[first_tool], "project_id": project_id, "tool": first_tool}
    return robvis_service.render_robvis(summary, plot=plot, colour=colour)


@router.get("/projects/{project_id}/figures")
async def project_rob_figures(
    project_id: str,
    colour: str = Query("cochrane"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Traffic-light and summary figures separated by applicable tool."""
    check_project_access(conn, project_id, user)
    summary = rob_service.get_project_summary(project_id)
    return {"project_id": project_id, "figures": robvis_service.render_project_figures(summary, colour)}


@router.get("/projects/{project_id}/reporting-profile")
async def project_reporting_profile(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Separate MTR/RC reporting-completeness data and publication figure."""
    check_project_access(conn, project_id, user)
    import base64
    from services.reporting_profile_service import get_project_profile, render_profile_figure
    data = get_project_profile(project_id, conn)
    if data.get("rows"):
        svg = render_profile_figure(data, "svg").decode("utf-8")
        png = base64.b64encode(render_profile_figure(data, "png")).decode("ascii")
    else:
        svg = ""
        png = ""
    return {
        "profile": data["profile"],
        "counts": data["counts"],
        "study_count": len({row["study_id"] for row in data["rows"]}),
        "svg": svg,
        "png_base64": png,
    }


@router.post("/projects/{project_id}/run")
async def run_batch_rob(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Start batch risk-of-bias assessment for included studies."""
    check_project_access(conn, project_id, user)
    return rob_service.start_batch_rob_run(project_id, db=conn)


@router.get("/projects/{project_id}/run/progress")
async def get_batch_rob_run_progress(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get live progress of the batch risk-of-bias assessment."""
    check_project_access(conn, project_id, user)
    return rob_service.get_batch_rob_progress(project_id, db=conn)


@router.post("/projects/{project_id}/run/cancel")
async def cancel_batch_rob(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Cancel an active batch risk-of-bias run."""
    check_project_access(conn, project_id, user)
    res = rob_service.cancel_batch_rob_run(project_id, db=conn)
    return {"cancelled": True if res.get("status") == "cancelled" else False}


# ── Export ──

@router.get("/projects/{project_id}/export")
async def export_rob(
    project_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx|zip)$"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Export RoB assessments or the complete mixed-tool ZIP package."""
    check_project_access(conn, project_id, user)
    if format == "zip":
        from services.rob_export_service import export_project_package
        filepath = export_project_package(project_id, db=conn)
    else:
        filepath = rob_service.export_project_rob(project_id, format=format, db=conn)
    filename = filepath.split("/")[-1]
    from fastapi.responses import FileResponse
    return FileResponse(
        filepath,
        filename=filename,
        media_type="application/zip" if format == "zip" else "application/octet-stream",
    )


# ── Dual-reviewer verification & adjudication ──

@router.put("/assessments/{assessment_id}/verify")
@router.post("/assessments/{assessment_id}/verify")
async def verify_assessment(
    assessment_id: str,
    body: RobVerifyRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Second assessor verifies a RoB assessment.

    If agree=True, marks as verified.
    If agree=False, stores second_assessment JSON and marks as disagreed.
    """
    import json
    row = conn.execute(
        "SELECT * FROM rob_assessments WHERE assessment_id = ?", (assessment_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Assessment not found")

    assessor = body.assessor or (user["username"] if user else "second_assessor")
    status = "verified" if body.agree else "disagreed"
    second_json = json.dumps(body.second_assessment) if body.second_assessment else ""

    conn.execute(
        """UPDATE rob_assessments SET
           verification_status = ?, second_assessor = ?,
           second_assessment_json = ?
           WHERE assessment_id = ?""",
        (status, assessor, second_json, assessment_id),
    )
    conn.commit()

    return rob_service.get_assessment(assessment_id)


@router.put("/assessments/{assessment_id}/adjudicate")
@router.post("/assessments/{assessment_id}/adjudicate")
async def adjudicate_assessment(
    assessment_id: str,
    body: RobAdjudicateRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Adjudicator resolves a RoB disagreement."""
    row = conn.execute(
        "SELECT * FROM rob_assessments WHERE assessment_id = ?", (assessment_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Assessment not found")

    adjudicator = body.adjudicator or (user["username"] if user else "adjudicator")

    conn.execute(
        """UPDATE rob_assessments SET
           verification_status = 'adjudicated',
           adjudicator = ?,
           overall_judgment = ?
           WHERE assessment_id = ?""",
        (adjudicator, body.final_judgment, assessment_id),
    )
    conn.commit()

    return rob_service.get_assessment(assessment_id)

@router.post("/projects/{project_id}/studies/{study_id}/auto-assess")
def auto_assess_study_rob(project_id: str, study_id: str, tool_id: str = "rob2", user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Auto-assess Risk of Bias for a study using RCT-Reviewer Cochrane domain engine."""
    from services.rct_rob_engine import assess_study_risk_of_bias

    check_project_access(conn, project_id, user)

    try:
        doc = conn.execute(
            "SELECT title, abstract FROM studies WHERE study_id = ?", (study_id,)
        ).fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Study not found")

        title_str = str(doc["title"] or "")
        abstract_str = str(doc["abstract"] or "")
        study_text = title_str + "\n" + abstract_str

        pdf_doc = conn.execute(
            "SELECT pages_json FROM pdf_documents WHERE study_id = ?", (study_id,)
        ).fetchone()
        if pdf_doc and pdf_doc["pages_json"]:
            try:
                pages = json.loads(pdf_doc["pages_json"])
                text_parts = [p.get("text", "") for p in pages if p.get("text")]
                if text_parts:
                    study_text = "\n\n".join(text_parts)
            except Exception:
                pass

        result = assess_study_risk_of_bias(study_text, tool_type=tool_id)

        now = datetime.now(timezone.utc).isoformat()
        assessment_id = f"rob_{study_id}_{tool_id}"
        
        # Check if assessment exists
        existing = conn.execute(
            "SELECT assessment_id FROM rob_assessments WHERE study_id = ? AND tool = ?",
            (study_id, tool_id)
        ).fetchone()

        if existing:
            conn.execute(
                """UPDATE rob_assessments SET
                   overall_judgment = ?,
                   overall_risk = ?,
                   ai_prefilled = 1,
                   ai_prefilled_at = ?
                   WHERE assessment_id = ?""",
                (result.get("overall_judgment", "Unclear"), result.get("overall_judgment", "Unclear"), now, existing["assessment_id"])
            )
            assessment_id = existing["assessment_id"]
        else:
            conn.execute(
                """INSERT INTO rob_assessments 
                   (assessment_id, study_id, project_id, tool, overall_judgment, overall_risk, ai_prefilled, ai_prefilled_at)
                   VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
                (assessment_id, study_id, project_id, tool_id, result.get("overall_judgment", "Unclear"), result.get("overall_judgment", "Unclear"), now)
            )

        # Save individual domain judgments & rationales
        for d in result.get("domains", []):
            d_key = d.get("domain_id")
            d_label = d.get("domain_name")
            judgment = d.get("judgment", "Unclear")
            support_quote = d.get("support_quote", "")
            confidence = d.get("confidence", 0.85)
            justification = d.get("justification", "")
            
            # Upsert into rob_domain_judgments
            existing_dj = conn.execute(
                "SELECT judgment_id FROM rob_domain_judgments WHERE assessment_id = ? AND domain_key = ?",
                (assessment_id, d_key)
            ).fetchone()

            if existing_dj:
                conn.execute(
                    """UPDATE rob_domain_judgments SET
                       risk_judgment = ?,
                       support_text = ?,
                       ai_suggested = ?,
                       ai_support = ?,
                       ai_confidence = ?
                       WHERE judgment_id = ?""",
                    (judgment, justification, judgment, support_quote, confidence, existing_dj["judgment_id"])
                )
            else:
                dj_id = f"dj_{assessment_id}_{d_key}"
                conn.execute(
                    """INSERT INTO rob_domain_judgments
                       (judgment_id, assessment_id, domain_key, domain_label, risk_judgment, support_text, ai_suggested, ai_support, ai_confidence)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (dj_id, assessment_id, d_key, d_label, judgment, justification, judgment, support_quote, confidence)
                )

        conn.commit()
        return {
            "success": True,
            "assessment_id": assessment_id,
            "overall_judgment": result.get("overall_judgment", "Unclear"),
            "domains": result.get("domains", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
