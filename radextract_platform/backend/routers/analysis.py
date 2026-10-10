"""Descriptive analysis & statistical computation API router.

Endpoints:
  GET  /api/projects/{project_id}/analysis/profile           — full data profiling report
  GET  /api/projects/{project_id}/analysis/stats/{variable_id} — descriptive stats for one variable
  GET  /api/projects/{project_id}/analysis/heterogeneity      — heterogeneity diagnostics (query: outcome)
  GET  /api/projects/{project_id}/analysis/forest-data        — forest plot data (query: outcome)
  GET  /api/projects/{project_id}/analysis/funnel-data        — funnel plot data (query: outcome)
  GET  /api/projects/{project_id}/analysis/sensitivity        — leave-one-out sensitivity (query: outcome)
  GET  /api/projects/{project_id}/analysis/report             — full combined report (JSON)
  GET  /api/projects/{project_id}/analysis/outcomes           — list available outcome labels
"""
from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response
import sqlite3

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from services import analysis_service

router = APIRouter(prefix="/api", tags=["analysis"])


def _verify_project(project_id: str, conn: sqlite3.Connection) -> None:
    """Raise 404 if project does not exist."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/projects/{project_id}/analysis/descriptive")
async def get_descriptive_synthesis(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Wilson proportions and medians for extracted variables. NR stays missing."""
    from services.descriptive_synthesis import synthesize_project
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    rows = conn.execute(
        """SELECT v.name, v.field_type, e.value, e.study_id
           FROM extractions e
           JOIN variables v ON v.variable_id = e.variable_id
           JOIN studies s ON s.study_id = e.study_id
           WHERE v.project_id = ?
             AND COALESCE(s.is_duplicate, 0) = 0
             AND s.screening_status IN ('ta_included', 'ft_included', 'included')""",
        (project_id,),
    ).fetchall()
    payload = synthesize_project([dict(row) for row in rows])
    studies = conn.execute(
        """SELECT screening_status, COUNT(*) AS n
           FROM studies WHERE project_id = ? AND COALESCE(is_duplicate, 0) = 0
           GROUP BY screening_status""",
        (project_id,),
    ).fetchall()
    identified = conn.execute(
        "SELECT COUNT(*) AS n FROM studies WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    duplicates = conn.execute(
        "SELECT COUNT(*) AS n FROM studies WHERE project_id = ? AND COALESCE(is_duplicate, 0) = 1",
        (project_id,),
    ).fetchone()
    payload["prisma"] = {
        "identified": identified["n"] if identified else 0,
        "duplicates_removed": duplicates["n"] if duplicates else 0,
        "by_status": {row["screening_status"]: row["n"] for row in studies},
    }
    return payload


@router.get("/projects/{project_id}/analysis/profile")
async def get_analysis_profile(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Full data profiling report: distributions, missing values, outliers, correlations."""
    _verify_project(project_id, conn)
    try:
        return analysis_service.profile_extraction_data(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/stats/{variable_id}")
async def get_variable_stats(project_id: str, variable_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Descriptive statistics for a single variable."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_descriptive_stats(project_id, variable_id)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/heterogeneity")
async def get_heterogeneity(
    project_id: str,
    outcome: str = Query(..., description="Outcome label (meta-analysis outcome_label)"),
    conn: DBBackend = Depends(get_db),
):
    """Heterogeneity diagnostics: I², Q-statistic, tau², H-statistic."""
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_heterogeneity(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/forest-data")
async def get_forest_data(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    conn: DBBackend = Depends(get_db),
):
    """Forest plot data: per-study effect sizes, CIs, weights, pooled estimate."""
    _verify_project(project_id, conn)
    try:
        result = analysis_service.prepare_forest_plot_data(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/funnel-data")
async def get_funnel_data(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    conn: DBBackend = Depends(get_db),
):
    """Funnel plot data: effect size vs SE, Egger's test for asymmetry."""
    _verify_project(project_id, conn)
    try:
        result = analysis_service.prepare_funnel_plot_data(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/sensitivity")
async def get_sensitivity(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    conn: DBBackend = Depends(get_db),
):
    """Leave-one-out sensitivity analysis."""
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_sensitivity_analysis(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/outcomes")
async def list_outcomes(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """List available meta-analysis outcome labels for this project."""
    _verify_project(project_id, conn)
    rows = conn.execute(
        "SELECT outcome_label, meta_id, effect_measure, n_studies "
        "FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/projects/{project_id}/analysis/report")
async def get_full_report(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Full combined analysis report (data profile + all meta-analyses)."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        report = analysis_service.generate_full_report(project_id)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/report/download")
async def download_full_report(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Download the full analysis report as a JSON file."""
    _verify_project(project_id, conn)
    try:
        report = analysis_service.generate_full_report(project_id)
        content = json.dumps(report, indent=2, ensure_ascii=False, default=str)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="analysis_report_{project_id}.json"'
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")
    check_project_access(conn, project_id, user)
