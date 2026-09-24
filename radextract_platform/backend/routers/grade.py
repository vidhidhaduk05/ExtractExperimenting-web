"""GRADE certainty assessment API router.

Endpoints:
  POST   /api/projects/{project_id}/grade              — create GRADE assessment
  GET    /api/projects/{project_id}/grade              — list all for project
  GET    /api/grade/{id}                               — get detail with all factors
  DELETE /api/grade/{id}                               — delete
  PUT    /api/grade/factors/{factor_id}                — update factor rating/rationale
  POST   /api/grade/{id}/auto-populate                 — auto-populate from RoB + meta
  POST   /api/grade/{id}/compute                       — recompute certainty
  GET    /api/grade/{id}/sof-table                     — get Summary of Findings table
  GET    /api/projects/{project_id}/grade/export       — export as CSV
  GET    /api/projects/{project_id}/grade/starting-level — auto-determine starting level
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from typing import Optional

from database import get_db
from dependencies import get_current_user_optional, check_project_access
from services import grade_service
from services.db_backend import DBBackend

router = APIRouter(prefix="/api", tags=["grade"])


# ── Request models ──

class GradeCreate(BaseModel):
    outcome_label: str
    meta_analysis_id: Optional[str] = None
    starting_level: str = ""  # auto-determine if empty


class GradeFactorUpdate(BaseModel):
    rating: str
    rationale: str = ""


# ── CRUD ──

@router.post("/projects/{project_id}/grade")
async def create_grade(
    project_id: str,
    body: GradeCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a new GRADE assessment with all 8 factors initialized."""
    # Auto-determine starting level if not provided
    starting_level = body.starting_level
    if not starting_level:
        starting_level = grade_service.determine_starting_level(project_id, db=conn)

    try:
        result = grade_service.create_grade_assessment(
            project_id=project_id,
            outcome_label=body.outcome_label,
            meta_analysis_id=body.meta_analysis_id,
            starting_level=starting_level,
            created_by=user["username"] if user else "system",
            db=conn,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/grade")
async def list_grade(project_id: str, conn: DBBackend = Depends(get_db)):
    """List all GRADE assessments for a project."""
    return grade_service.list_grade_assessments(project_id, db=conn)


@router.get("/grade/{grade_id}")
async def get_grade(grade_id: str, conn: DBBackend = Depends(get_db)):
    """Get GRADE assessment detail with all factors."""
    result = grade_service.get_grade_assessment(grade_id, db=conn)
    if not result:
        raise HTTPException(status_code=404, detail="GRADE assessment not found")
    return result


@router.delete("/grade/{grade_id}")
async def delete_grade(grade_id: str, conn: DBBackend = Depends(get_db)):
    """Delete a GRADE assessment and all its factors."""
    success = grade_service.delete_grade_assessment(grade_id, db=conn)
    if not success:
        raise HTTPException(status_code=404, detail="GRADE assessment not found")
    return {"deleted": True, "grade_id": grade_id}


# ── Factor updates ──

@router.put("/grade/factors/{factor_id}")
async def update_grade_factor(factor_id: str, body: GradeFactorUpdate, conn: DBBackend = Depends(get_db)):
    """Update a single GRADE factor's rating and rationale.

    Automatically recomputes the certainty rating after the update.
    """
    result = grade_service.update_factor(factor_id, body.rating, body.rationale, db=conn)
    if not result:
        raise HTTPException(status_code=404, detail="Factor not found")
    return result


# ── Auto-population ──

@router.post("/grade/{grade_id}/auto-populate")
async def auto_populate_grade(grade_id: str, conn: DBBackend = Depends(get_db)):
    """Auto-populate GRADE factors from linked RoB assessments and meta-analysis."""
    try:
        result = grade_service.auto_populate_factors(grade_id, db=conn)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Certainty computation ──

@router.post("/grade/{grade_id}/compute")
async def compute_grade_certainty(grade_id: str, conn: DBBackend = Depends(get_db)):
    """Recompute the certainty rating from current factor ratings."""
    try:
        result = grade_service.compute_certainty(grade_id, db=conn)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Summary of Findings ──

@router.get("/grade/{grade_id}/sof-table")
async def get_sof_table(grade_id: str, conn: DBBackend = Depends(get_db)):
    """Get the Summary of Findings table for a GRADE assessment."""
    try:
        result = grade_service.generate_sof_table(grade_id, db=conn)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Starting level ──

@router.get("/projects/{project_id}/grade/starting-level")
async def get_starting_level(project_id: str, conn: DBBackend = Depends(get_db)):
    """Auto-determine the GRADE starting level from study designs."""
    level = grade_service.determine_starting_level(project_id, db=conn)
    return {"project_id": project_id, "starting_level": level}


# ── Export ──

@router.get("/projects/{project_id}/grade/export")
async def export_grade(
    project_id: str,
    format: str = Query("csv", pattern="^(csv)$"),
    conn: DBBackend = Depends(get_db),
):
    """Export all GRADE assessments for a project as CSV."""
    filepath = grade_service.export_grade_csv(project_id, db=conn)
    filename = filepath.split("/")[-1]
    from fastapi.responses import FileResponse
    return FileResponse(filepath, filename=filename, media_type="text/csv")
