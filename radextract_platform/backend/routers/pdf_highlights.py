"""PDF Highlights API router.

Endpoints:
  GET    /api/studies/{study_id}/pdf-highlights        — list all highlights for a study
  POST   /api/studies/{study_id}/pdf-highlights        — create a new highlight
  PUT    /api/pdf-highlights/{highlight_id}             — update a highlight
  DELETE /api/pdf-highlights/{highlight_id}             — delete a highlight
  GET    /api/projects/{project_id}/pdf-highlights      — list all highlights for a project
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional
import sqlite3

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["pdf-highlights"])


# ── Request models ──

class HighlightCreate(BaseModel):
    variable_id: str = ""
    highlight_type: str = "text"  # text | area
    page_number: int
    position_json: dict[str, Any] = {}  # {boundingRect, rects} in scaled coords
    content_text: str = ""
    comment: str = ""
    color: str = "#ffd700"
    created_by: str = ""


class HighlightUpdate(BaseModel):
    variable_id: Optional[str] = None
    content_text: Optional[str] = None
    comment: Optional[str] = None
    color: Optional[str] = None
    position_json: Optional[dict[str, Any]] = None


# ── Endpoints ──

@router.get("/studies/{study_id}/pdf-highlights")
async def list_study_highlights(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """List all PDF highlights for a study."""
    # Verify study exists
    study = conn.execute(
        "SELECT study_id, project_id FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    rows = conn.execute(
        "SELECT * FROM pdf_highlights WHERE study_id = ? ORDER BY page_number, created_at",
        (study_id,),
    ).fetchall()

    highlights = []
    for r in rows:
        h = dict(r)
        h["position"] = json.loads(r["position_json"]) if r["position_json"] else {}
        del h["position_json"]
        highlights.append(h)

    return highlights


@router.post("/studies/{study_id}/pdf-highlights")
async def create_highlight(study_id: str, body: HighlightCreate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Create a new PDF highlight."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    study = conn.execute(
        "SELECT study_id, project_id FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    highlight_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    conn.execute(
        """INSERT INTO pdf_highlights
           (highlight_id, study_id, project_id, variable_id, highlight_type,
            page_number, position_json, content_text, comment, color,
            created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (highlight_id, study_id, study["project_id"], body.variable_id,
         body.highlight_type, body.page_number,
         json.dumps(body.position_json, ensure_ascii=False),
         body.content_text, body.comment, body.color,
         body.created_by, now, now),
    )
    conn.commit()

    return {
        "highlight_id": highlight_id,
        "study_id": study_id,
        "project_id": study["project_id"],
        "variable_id": body.variable_id,
        "highlight_type": body.highlight_type,
        "page_number": body.page_number,
        "position": body.position_json,
        "content_text": body.content_text,
        "comment": body.comment,
        "color": body.color,
        "created_by": body.created_by,
        "created_at": now,
    }


@router.put("/pdf-highlights/{highlight_id}")
async def update_highlight(highlight_id: str, body: HighlightUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Update a PDF highlight."""
    existing = conn.execute(
        "SELECT * FROM pdf_highlights WHERE highlight_id = ?", (highlight_id,)
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Highlight not found")

    now = datetime.utcnow().isoformat()
    updates = []
    params = []

    if body.variable_id is not None:
        updates.append("variable_id = ?")
        params.append(body.variable_id)
    if body.content_text is not None:
        updates.append("content_text = ?")
        params.append(body.content_text)
    if body.comment is not None:
        updates.append("comment = ?")
        params.append(body.comment)
    if body.color is not None:
        updates.append("color = ?")
        params.append(body.color)
    if body.position_json is not None:
        updates.append("position_json = ?")
        params.append(json.dumps(body.position_json, ensure_ascii=False))

    if updates:
        updates.append("updated_at = ?")
        params.append(now)
        params.append(highlight_id)
        conn.execute(
            f"UPDATE pdf_highlights SET {', '.join(updates)} WHERE highlight_id = ?",
            params,
        )
        conn.commit()

    row = conn.execute(
        "SELECT * FROM pdf_highlights WHERE highlight_id = ?", (highlight_id,)
    ).fetchone()
    result = dict(row)
    result["position"] = json.loads(row["position_json"]) if row["position_json"] else {}
    del result["position_json"]
    return result


@router.delete("/pdf-highlights/{highlight_id}")
async def delete_highlight(highlight_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Delete a PDF highlight."""
    cursor = conn.execute(
        "DELETE FROM pdf_highlights WHERE highlight_id = ?", (highlight_id,)
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Highlight not found")
    return {"deleted": True, "highlight_id": highlight_id}


@router.get("/projects/{project_id}/pdf-highlights")
async def list_project_highlights(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """List all PDF highlights for a project (across all studies)."""
    proj = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    rows = conn.execute(
        """SELECT h.*, s.title as study_title
           FROM pdf_highlights h
           JOIN studies s ON h.study_id = s.study_id
           WHERE h.project_id = ?
           ORDER BY h.study_id, h.page_number, h.created_at""",
        (project_id,),
    ).fetchall()

    highlights = []
    for r in rows:
        h = dict(r)
        h["position"] = json.loads(r["position_json"]) if r["position_json"] else {}
        del h["position_json"]
        highlights.append(h)

    return highlights
