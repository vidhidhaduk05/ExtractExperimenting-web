"""AI Multi-Stage Screening Router.

Provides API endpoints for:
- Starting the full multi-stage AI screening pipeline (title -> abstract -> full-text)
- Starting AI analysis (title screening only checkpoint)
- Continuing to the next screening stage (abstract or fulltext)
- Getting the pipeline status and counts
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from database import get_db
from dependencies import check_project_access, get_current_user_optional
from models import AIScreeningSummary, ContinueScreeningRequest
from services import screening_progress
from services.ai_screening_pipeline import AIScreeningPipeline
from services.db_backend import DBBackend

router = APIRouter(prefix="/api", tags=["ai_screening"])
pipeline = AIScreeningPipeline()


def _maybe_start_batch_rob(db: DBBackend, project_id: str):
    """Start batch RoB run if project has opted in via auto_rob_enabled (default: off)."""
    try:
        if hasattr(db, "execute"):
            p_row = db.execute("SELECT auto_rob_enabled FROM projects WHERE project_id = ?", (project_id,)).fetchone()
            enabled = bool(p_row[0] if (p_row and p_row[0] is not None) else 0)
        else:
            p = db.get("projects", project_id)
            enabled = bool(p.get("auto_rob_enabled")) if p else False
        if enabled:
            from services import rob_service
            return rob_service.start_batch_rob_run(project_id, db=db)
    except Exception:
        pass
    return None


@router.post("/projects/{project_id}/ai-screening/start", response_model=AIScreeningSummary)
async def start_ai_screening(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run the full multi-stage AI screening pipeline.

    Processes all pending studies across title -> abstract -> full-text stages.
    """
    check_project_access(conn, project_id, user)
    # Run off the event loop so status/study requests are answered while screening is in progress
    try:
        summary = await run_in_threadpool(pipeline.run_full_pipeline, project_id, conn)
        _maybe_start_batch_rob(conn, project_id)
    finally:
        screening_progress.finish(project_id)
    return AIScreeningSummary(**summary)


@router.post("/projects/{project_id}/ai-screening/start-analysis", response_model=AIScreeningSummary)
async def start_ai_analysis(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run title screening only as an initial checkpoint for human review."""
    check_project_access(conn, project_id, user)
    try:
        title_results = await run_in_threadpool(pipeline.run_title_screening, project_id, conn)
    finally:
        screening_progress.finish(project_id)
    summary = pipeline.get_pipeline_summary(project_id, conn, title_count=len(title_results))
    return AIScreeningSummary(**summary)


@router.post("/projects/{project_id}/ai-screening/continue", response_model=AIScreeningSummary)
async def continue_ai_screening(
    project_id: str,
    body: ContinueScreeningRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Continue AI screening to the specified stage ('abstract' or 'fulltext')."""
    check_project_access(conn, project_id, user)
    stage = body.stage.lower().strip()

    if stage == "abstract":
        try:
            results = await run_in_threadpool(pipeline.run_abstract_screening, project_id, conn)
        finally:
            screening_progress.finish(project_id)
        summary = pipeline.get_pipeline_summary(project_id, conn, abstract_count=len(results))
    elif stage in ("fulltext", "ft"):
        try:
            results = await run_in_threadpool(pipeline.run_fulltext_screening, project_id, conn)
            # Auto-trigger RoB batch after fulltext stage
            try:
                p_row = conn.execute("SELECT auto_rob_enabled FROM projects WHERE project_id = ?", (project_id,)).fetchone()
                if p_row is None or bool(p_row[0] if p_row[0] is not None else 1):
                    from services import rob_service
                    rob_service.start_batch_rob_run(project_id, db=conn)
            except Exception:
                pass
        finally:
            screening_progress.finish(project_id)
        summary = pipeline.get_pipeline_summary(project_id, conn, ft_count=len(results))
    else:
        raise HTTPException(status_code=400, detail=f"Invalid stage '{stage}'. Must be 'abstract' or 'fulltext'.")

    return AIScreeningSummary(**summary)


@router.get("/projects/{project_id}/ai-screening/status", response_model=AIScreeningSummary)
async def get_ai_screening_status(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get current screening pipeline status and counts."""
    check_project_access(conn, project_id, user)
    summary = pipeline.get_pipeline_summary(project_id, conn)
    return AIScreeningSummary(**summary)


@router.get("/projects/{project_id}/ai-screening/progress")
async def get_ai_screening_progress(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Live progress of a running AI screening: current study, done/pending ids, stage, paused."""
    check_project_access(conn, project_id, user)
    return screening_progress.get(project_id)


@router.post("/projects/{project_id}/ai-screening/pause")
async def pause_ai_screening(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Pause the active AI screening run. The current in-flight study finishes, then the loop pauses."""
    check_project_access(conn, project_id, user)
    screening_progress.pause(project_id)
    return screening_progress.get(project_id)


@router.post("/projects/{project_id}/ai-screening/resume")
async def resume_ai_screening(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Resume a paused AI screening run."""
    check_project_access(conn, project_id, user)
    screening_progress.resume(project_id)
    return screening_progress.get(project_id)


@router.post("/projects/{project_id}/ai-screening/cancel")
@router.post("/projects/{project_id}/ai-screening/stop")
async def cancel_ai_screening(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Cancel and stop the active AI screening run."""
    check_project_access(conn, project_id, user)
    screening_progress.cancel(project_id)
    return screening_progress.get(project_id)

