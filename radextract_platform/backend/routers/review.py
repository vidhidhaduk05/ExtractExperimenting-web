"""Review router: data review matrix and cross-study comparison."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import sqlite3

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["review"])


@router.get("/projects/{project_id}/review/matrix")
async def review_matrix(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get extraction data as a matrix: studies × variables."""
    check_project_access(conn, project_id, user)

    # Get all variables for this project
    variables = conn.execute(
        "SELECT * FROM variables WHERE project_id = ? ORDER BY section, order_index",
        (project_id,),
    ).fetchall()

    # Get all studies that have been screened in
    studies = conn.execute(
        "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'included' ORDER BY title",
        (project_id,),
    ).fetchall()

    # Get all extractions
    extractions = {}
    for s in studies:
        rows = conn.execute(
            """SELECT e.*, v.name as variable_name
               FROM extractions e
               LEFT JOIN variables v ON e.variable_id = v.variable_id
               WHERE e.study_id = ?""",
            (s["study_id"],),
        ).fetchall()
        extractions[s["study_id"]] = {r["variable_id"]: dict(r) for r in rows}

    # Build matrix
    matrix = []
    for s in studies:
        row = {
            "study_id": s["study_id"],
            "title": s["title"],
            "authors": s["authors"],
            "year": s["publication_year"],
            "journal": s["journal"],
            "values": {},
        }
        for v in variables:
            ext = extractions.get(s["study_id"], {}).get(v["variable_id"])
            row["values"][v["variable_id"]] = {
                "value": ext["value"] if ext else "",
                "confidence": ext["confidence"] if ext else 0.0,
                "is_edited": bool(ext["is_edited"]) if ext else False,
                "extraction_id": ext["extraction_id"] if ext else None,
                "confidence_tag": (ext["confidence_tag"] if ext else "") or "",
                "missing_code": (ext["missing_code"] if ext else "") or "",
                "calc_note": (ext["calc_note"] if ext else "") or "",
                "source_text": (ext["source_text"] if ext else "") or "",
                "source_page": (ext["source_page"] if ext else None),
            }
        matrix.append(row)

    return {
        "variables": [dict(v) for v in variables],
        "studies": matrix,
    }


@router.get("/projects/{project_id}/review/progress")
async def review_progress(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get extraction progress summary."""
    check_project_access(conn, project_id, user)

    total_studies = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'included'",
        (project_id,),
    ).fetchone()["c"]

    total_vars = conn.execute(
        "SELECT COUNT(*) as c FROM variables WHERE project_id = ?",
        (project_id,),
    ).fetchone()["c"]

    total_extractions = conn.execute(
        """SELECT COUNT(*) as c FROM extractions e
           JOIN studies s ON e.study_id = s.study_id
           WHERE s.project_id = ?""",
        (project_id,),
    ).fetchone()["c"]

    edited = conn.execute(
        """SELECT COUNT(*) as c FROM extractions e
           JOIN studies s ON e.study_id = s.study_id
           WHERE s.project_id = ? AND e.is_edited = 1""",
        (project_id,),
    ).fetchone()["c"]

    expected = total_studies * total_vars
    completion = (total_extractions / expected * 100) if expected > 0 else 0

    return {
        "project_id": project_id,
        "total_studies": total_studies,
        "total_variables": total_vars,
        "total_extractions": total_extractions,
        "expected_extractions": expected,
        "completion_pct": round(completion, 1),
        "edited_count": edited,
    }
