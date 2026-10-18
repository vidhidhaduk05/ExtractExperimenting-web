"""Full-text availability check (read-only): which studies have a legal free full text?"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import settings
from database import get_db
from dependencies import check_project_access, get_current_user_optional
from services import fulltext_availability, fulltext_retrieval
from services.db_backend import DBBackend

router = APIRouter(prefix="/api", tags=["fulltext"])


@router.post("/projects/{project_id}/fulltext/availability")
async def start_availability_check(
    project_id: str,
    status: str = Query("awaiting_pdf", description="Only check studies with this screening_status ('all' for every study)"),
    limit: int = Query(500, ge=1, le=2000),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Start a background check of PMC / Europe PMC / Unpaywall for the project's studies.

    Read-only: nothing is downloaded or changed. Poll GET .../fulltext/availability for results.
    """
    check_project_access(conn, project_id, user)
    row = conn.execute("SELECT pubmed_api_key FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    sql = "SELECT study_id, title, pmid, doi FROM studies WHERE project_id = ?"
    params: list = [project_id]
    if status != "all":
        sql += " AND screening_status = ?"
        params.append(status)
    sql += " LIMIT ?"
    params.append(limit)
    studies = [dict(r) for r in conn.execute(sql, tuple(params)).fetchall()]

    return fulltext_availability.start_job(
        project_id, studies, api_key=row["pubmed_api_key"] or "", email=settings.contact_email
    )


@router.get("/projects/{project_id}/fulltext/availability")
async def get_availability_check(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Progress and results of the availability check (empty if none has been started in this process)."""
    check_project_access(conn, project_id, user)
    return fulltext_availability.get_job(project_id)


@router.post("/projects/{project_id}/fulltext/fetch")
async def start_fulltext_fetch(
    project_id: str,
    screen: bool = Query(True, description="Run full-text screening on the retrieved texts afterwards"),
    status: str = Query("awaiting_pdf", description="Only studies with this screening_status ('all' for every study)"),
    limit: int = Query(500, ge=1, le=2000),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Fetch open-access full text (Europe PMC) for studies awaiting a PDF, then optionally screen it.

    Only open-access articles are fetched. Studies get pdf_status 'text_only' (no PDF file).
    Poll GET .../fulltext/fetch for progress.
    """
    check_project_access(conn, project_id, user, min_role="editor")
    if not conn.execute("SELECT 1 FROM projects WHERE project_id = ?", (project_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Project not found")

    sql = "SELECT study_id, title, pmid, doi, pdf_path FROM studies WHERE project_id = ?"
    params: list = [project_id]
    if status != "all":
        sql += " AND screening_status = ?"
        params.append(status)
    sql += " LIMIT ?"
    params.append(limit)
    studies = [dict(r) for r in conn.execute(sql, tuple(params)).fetchall()]
    return fulltext_retrieval.start_job(project_id, studies, screen=screen)


@router.get("/projects/{project_id}/fulltext/fetch")
async def get_fulltext_fetch(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Progress and results of the open-access full-text fetch."""
    check_project_access(conn, project_id, user)
    return fulltext_retrieval.get_job(project_id)
