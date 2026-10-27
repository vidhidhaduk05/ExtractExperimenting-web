"""Todos router: Google Tasks behavior for project to-dos with study and notification integration."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from models import (
    TodoCreate,
    TodoUpdate,
    TodoFromNotification,
    TodoResponse,
)

router = APIRouter(prefix="/api", tags=["todos"])


def _row_to_todo_response(row: Any) -> TodoResponse:
    r = dict(row)
    return TodoResponse(
        id=str(r["id"]),
        project_id=str(r["project_id"]),
        text=str(r["text"]),
        done=bool(r.get("done", 0)),
        source=str(r.get("source", "manual")),
        study_id=str(r["study_id"]) if r.get("study_id") else None,
        notification_id=str(r["notification_id"]) if r.get("notification_id") else None,
        created_at=str(r.get("created_at", "")),
        study_title=str(r["study_title"]) if r.get("study_title") else None,
        study_pmid=str(r["study_pmid"]) if r.get("study_pmid") else None,
    )


def _fetch_todo_by_id(conn: DBBackend, todo_id: str) -> Optional[TodoResponse]:
    query = """
        SELECT t.id, t.project_id, t.text, t.done, t.source, t.study_id, t.notification_id, t.created_at,
               s.title as study_title, s.pmid as study_pmid
        FROM todos t
        LEFT JOIN studies s ON t.study_id = s.study_id
        WHERE t.id = ?
    """
    row = conn.execute(query, (todo_id,)).fetchone()
    if not row:
        return None
    return _row_to_todo_response(row)


@router.get("/projects/{project_id}/todos", response_model=list[TodoResponse])
async def list_project_todos(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List to-dos for a project, newest first, with embedded study title/PMID."""
    check_project_access(conn, project_id, user)

    query = """
        SELECT t.id, t.project_id, t.text, t.done, t.source, t.study_id, t.notification_id, t.created_at,
               s.title as study_title, s.pmid as study_pmid
        FROM todos t
        LEFT JOIN studies s ON t.study_id = s.study_id
        WHERE t.project_id = ?
        ORDER BY t.created_at DESC
    """
    rows = conn.execute(query, (project_id,)).fetchall()
    return [_row_to_todo_response(row) for row in rows]


@router.post("/projects/{project_id}/todos", response_model=TodoResponse, status_code=status.HTTP_201_CREATED)
async def create_todo(
    project_id: str,
    body: TodoCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a new to-do in a project (manual or study source)."""
    check_project_access(conn, project_id, user)

    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="To-do text cannot be empty")

    todo_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()
    source = (body.source or "manual").strip().lower()
    study_id = body.study_id.strip() if body.study_id else None

    # If study_id provided, verify study belongs to project or exists
    if study_id:
        study = conn.execute("SELECT study_id, project_id, title FROM studies WHERE study_id = ?", (study_id,)).fetchone()
        if not study:
            # Study might not exist or be external, still allowed but keep warning
            pass

    conn.execute(
        """
        INSERT INTO todos (id, project_id, text, done, source, study_id, notification_id, created_at)
        VALUES (?, ?, ?, 0, ?, ?, NULL, ?)
        """,
        (todo_id, project_id, text, source, study_id, now_iso),
    )

    created = _fetch_todo_by_id(conn, todo_id)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to retrieve created to-do")
    return created


@router.patch("/todos/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: str,
    body: TodoUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Update to-do text and/or done status."""
    existing = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="To-do not found")

    check_project_access(conn, existing["project_id"], user)

    updates = []
    params = []

    if body.text is not None:
        text = body.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="To-do text cannot be empty")
        updates.append("text = ?")
        params.append(text)

    if body.done is not None:
        updates.append("done = ?")
        params.append(1 if body.done else 0)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    params.append(todo_id)
    sql = f"UPDATE todos SET {', '.join(updates)} WHERE id = ?"
    conn.execute(sql, tuple(params))

    updated = _fetch_todo_by_id(conn, todo_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to fetch updated to-do")
    return updated


@router.delete("/todos/{todo_id}")
async def delete_todo(
    todo_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Delete a to-do by id."""
    existing = conn.execute("SELECT project_id FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="To-do not found")

    check_project_access(conn, existing["project_id"], user)
    conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    return {"status": "deleted", "id": todo_id}


@router.post(
    "/projects/{project_id}/todos/from-notification",
    response_model=TodoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_todo_from_notification(
    project_id: str,
    body: TodoFromNotification,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a to-do item from a clarification notification and mark the notification as tracked."""
    check_project_access(conn, project_id, user)

    notif_id = (body.notification_id or "").strip()
    if not notif_id:
        raise HTTPException(status_code=400, detail="notification_id is required")

    # Look up the clarification question
    q_row = conn.execute(
        "SELECT question_id, study_id, question_text, stage, pico_aspect FROM clarification_questions WHERE question_id = ?",
        (notif_id,),
    ).fetchone()

    study_id: Optional[str] = None
    if q_row:
        study_id = q_row["study_id"]
        default_text = q_row["question_text"] or f"Clarification ({q_row['stage']}): study {study_id}"
    else:
        default_text = f"Clarification question {notif_id}"

    todo_text = (body.text or "").strip() or default_text
    todo_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()

    conn.execute(
        """
        INSERT INTO todos (id, project_id, text, done, source, study_id, notification_id, created_at)
        VALUES (?, ?, ?, 0, 'notification', ?, ?, ?)
        """,
        (todo_id, project_id, todo_text, study_id, notif_id, now_iso),
    )

    # Mark clarification question as tracked
    if q_row:
        try:
            conn.execute("UPDATE clarification_questions SET is_tracked = 1 WHERE question_id = ?", (notif_id,))
        except Exception:
            pass

    created = _fetch_todo_by_id(conn, todo_id)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to retrieve created notification to-do")
    return created
