"""Variables router: CRUD for extraction variables within projects."""
from __future__ import annotations
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import sqlite3

from models import VariableCreate, VariableUpdate, VariableResponse
from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["variables"])


@router.get("/projects/{project_id}/variables")
async def list_variables(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    check_project_access(conn, project_id, user)
    rows = conn.execute(
        "SELECT * FROM variables WHERE project_id = ? ORDER BY section, order_index",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/projects/{project_id}/variables", response_model=VariableResponse)
async def create_variable(project_id: str, body: VariableCreate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    check_project_access(conn, project_id, user)
    pid = body.project_id or project_id
    if body.project_id and body.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id mismatch")
    variable_id = str(uuid.uuid4())
    # Determine next order index if not provided
    max_order = conn.execute(
        "SELECT MAX(order_index) as max_idx FROM variables WHERE project_id = ? AND section = ?",
        (project_id, body.section),
    ).fetchone()
    order_idx = body.order_index if body.order_index > 0 else ((max_order["max_idx"] or 0) + 1)

    # Auto-generate the per-variable extraction prompt (column-header-as-prompt)
    from services.variable_generator import _default_extraction_prompt
    extraction_prompt = _default_extraction_prompt(
        body.name.strip(), body.description or "", body.field_type,
    )

    conn.execute(
        """INSERT INTO variables
           (variable_id, project_id, section, name, field_type, allowed_values,
            range_min, range_max, description, extraction_prompt, order_index, is_base)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) """,
        (variable_id, project_id, body.section, body.name.strip(), body.field_type,
         body.allowed_values or "", body.range_min, body.range_max,
         body.description or "", extraction_prompt, order_idx, 1 if body.is_base else 0),
    )
    conn.commit()
    return VariableResponse(
        variable_id=variable_id, project_id=project_id, section=body.section,
        name=body.name.strip(), field_type=body.field_type, allowed_values=body.allowed_values or "",
        range_min=body.range_min, range_max=body.range_max,
        description=body.description or "", order_index=order_idx,
        is_base=1 if body.is_base else 0,
    )


@router.put("/variables/{variable_id}", response_model=VariableResponse)
async def update_variable(variable_id: str, body: VariableUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM variables WHERE variable_id = ?", (variable_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Variable not found")

    updates = []
    params = []
    for field in ["section", "name", "field_type", "allowed_values",
                   "range_min", "range_max", "description", "order_index"]:
        val = getattr(body, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    # Regenerate the extraction prompt when name/description/type changes
    if body.name is not None or body.field_type is not None or body.description is not None:
        from services.variable_generator import _default_extraction_prompt
        new_name = body.name if body.name is not None else row["name"]
        new_type = body.field_type if body.field_type is not None else row["field_type"]
        new_desc = body.description if body.description is not None else row["description"]
        updates.append("extraction_prompt = ?")
        params.append(_default_extraction_prompt(new_name, new_desc or "", new_type))

    if updates:
        params.append(variable_id)
        conn.execute(
            f"UPDATE variables SET {', '.join(updates)} WHERE variable_id = ?",
            params,
        )
        conn.commit()

    row = conn.execute(
        "SELECT * FROM variables WHERE variable_id = ?", (variable_id,)
    ).fetchone()
    return dict(row)


@router.delete("/variables/{variable_id}")
async def delete_variable(variable_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    cursor = conn.execute(
        "DELETE FROM variables WHERE variable_id = ?", (variable_id,)
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Variable not found")
    return {"deleted": True, "variable_id": variable_id}


# ═══════════════════════════════════════════════════════════════════════
#  Auto-Generate Variables from PICO + Hypothesis
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/variables/auto-generate")
async def auto_generate_variables(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Generate extraction variables from the project's PICO framework + hypothesis."""
    from services.variable_generator import generate_variables_from_picos

    # Fetch project PICO + hypothesis + research_question + name
    row = conn.execute(
        "SELECT name, pico_json, hypothesis, research_question FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    pico_json = row["pico_json"] or "{}"
    hypothesis = row["hypothesis"] or ""
    rq = row["research_question"] or ""
    try:
        pico_dict = json.loads(pico_json)
    except Exception:
        pico_dict = {}

    if not isinstance(pico_dict, dict) or not any(str(v).strip() for v in pico_dict.values() if v):
        raise HTTPException(
            status_code=400,
            detail="PICO criteria must be defined for the project before auto-generating variables."
        )

    # Generate variables (hypothesis-driven; heuristic fallback is built in)
    generated = generate_variables_from_picos(
        pico_dict, hypothesis_text=hypothesis, research_question=rq,
    )

    if not generated:
        from services.variable_generator import _generate_heuristic_variables
        generated = _generate_heuristic_variables(pico_dict, hypothesis, rq)

    # Get existing variable names to avoid duplicates
    existing = {
        r["name"] for r in conn.execute(
            "SELECT name FROM variables WHERE project_id = ?", (project_id,)
        ).fetchall()
    }

    # Insert non-duplicate variables
    created = []
    for v in generated:
        if v["name"] in existing:
            continue
        variable_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO variables
               (variable_id, project_id, section, name, field_type, allowed_values,
                range_min, range_max, description, extraction_prompt, order_index, is_base)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) """,
            (variable_id, project_id, v["section"], v["name"], v["field_type"],
             v.get("allowed_values", ""), v.get("range_min"), v.get("range_max"),
             v.get("description", ""), v.get("extraction_prompt", ""),
             v.get("order_index", 0), 0),
        )
        created.append({
            "variable_id": variable_id,
            "project_id": project_id,
            "section": v["section"],
            "name": v["name"],
            "field_type": v["field_type"],
            "allowed_values": v.get("allowed_values", ""),
            "range_min": v.get("range_min"),
            "range_max": v.get("range_max"),
            "description": v.get("description", ""),
            "extraction_prompt": v.get("extraction_prompt", ""),
            "order_index": v.get("order_index", 0),
            "is_base": 0,
        })

    conn.commit()
    return {
        "project_id": project_id,
        "generated_count": len(generated),
        "created_count": len(created),
        "skipped_duplicates": len(generated) - len(created),
        "variables": created,
    }
