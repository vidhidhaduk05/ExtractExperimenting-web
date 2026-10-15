"""Project-level batch Risk-of-Bias run: start, progress, cancel."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import get_db
from dependencies import get_current_user_optional, check_project_access
from services import rob_service
from services.db_backend import DBBackend

router = APIRouter(prefix="/api", tags=["risk-of-bias"])


@router.post("/projects/{project_id}/rob/run")
def start_rob_run(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Assess every included study that has no assessment yet (background job)."""
    check_project_access(conn, project_id, user, min_role="editor")
    if not conn.execute("SELECT 1 FROM projects WHERE project_id = ?", (project_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Project not found")
    return rob_service.start_batch_rob_run(project_id, db=conn, trigger="manual")


@router.get("/projects/{project_id}/rob/run/progress")
def rob_run_progress(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user)
    return rob_service.get_batch_rob_progress(project_id, db=conn)


@router.post("/projects/{project_id}/rob/run/cancel")
def cancel_rob_run(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user, min_role="editor")
    return rob_service.cancel_batch_rob_run(project_id, db=conn)
