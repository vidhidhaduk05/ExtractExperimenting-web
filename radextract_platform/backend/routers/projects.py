"""Projects router: CRUD for systematic review projects."""
from __future__ import annotations
import json
import os
import tempfile
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional
import sqlite3

from models import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    PICOUpdate, PICOResponse,
    HypothesisUpdate, HypothesisResponse,
    PubMedKeyUpdate,
    Criterion, CriteriaUpdate, CriteriaResponse,
    SearchStringsResponse,
    ResearchQuestionRequest, ResearchQuestionResponse,
    PicoFromQuestionRequest, PicoFromQuestionResponse,
    PicoExtractionResponse,
    PubMedFetchRequest, PubMedFetchResponse,
    OpenAlexFetchRequest,
    ReferenceUploadResponse, ReferencePreviewResponse, MalformedRecordDetail,
    ImportBatchResponse, ImportBatchDetailResponse, ImportBatchRecord,
    UndoImpactPreviewResponse, UndoBatchResponse, UpdateBatchSourceRequest,
    ProjectMemberResponse, ProjectMemberInvite, ProjectMemberUpdate,
    KeywordGroupCreate, KeywordGroupUpdate, KeywordGroupResponse,
    ProjectSettingsUpdate, ProjectSettingsResponse,
)
from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/projects")
async def list_projects(
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    if user and user.get("role") != "owner":
        rows = conn.execute(
            """SELECT p.* FROM projects p
               JOIN project_members pm ON p.project_id = pm.project_id
               WHERE pm.user_id = ?
               ORDER BY p.created_at DESC""",
            (user["user_id"],),
        ).fetchall()
        if not rows:
            rows = conn.execute(
                "SELECT * FROM projects ORDER BY created_at DESC"
            ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM projects ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    project_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO projects (project_id, name, description, pico_json,
           hypothesis, research_question, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (project_id, body.name, body.description, body.pico_json,
         body.hypothesis, body.research_question,
         user["user_id"] if user else "system"),
    )
    # Auto-create owner membership
    if user:
        conn.execute(
            """INSERT INTO project_members (member_id, project_id, user_id, role, invited_by)
               VALUES (?, ?, ?, 'owner', ?)""",
            (str(uuid.uuid4()), project_id, user["user_id"], user["user_id"]),
        )
    conn.commit()
    return ProjectResponse(
        project_id=project_id, name=body.name, description=body.description,
        pico_json=body.pico_json, hypothesis=body.hypothesis,
        research_question=body.research_question,
        created_by=user["user_id"] if user else "system",
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    return dict(row)


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    updates = []
    params = []
    for field in ["name", "description", "pico_json", "hypothesis",
                   "research_question", "status"]:
        val = getattr(body, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        params.append(project_id)
        conn.execute(
            f"UPDATE projects SET {', '.join(updates)} WHERE project_id = ?",
            params,
        )
        conn.commit()

    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    return dict(row)


def _settings_payload(p: dict) -> dict:
    threshold = p.get("rob_confidence_threshold")
    return {
        "project_id": p["project_id"],
        "name": p.get("name") or "",
        "auto_rob_enabled": bool(p.get("auto_rob_enabled") or 0),
        "rob_confidence_threshold": float(threshold if threshold is not None else 0.7),
    }


@router.get("/projects/{project_id}/settings", response_model=ProjectSettingsResponse)
async def get_project_settings(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Project settings: automatic risk of bias after screening, and the AI confidence threshold."""
    row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    return _settings_payload(dict(row))


@router.put("/projects/{project_id}/settings", response_model=ProjectSettingsResponse)
async def update_project_settings(
    project_id: str,
    body: ProjectSettingsUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Change project settings. Only the fields that are sent are updated."""
    row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    updates, params = [], []
    if body.auto_rob_enabled is not None:
        updates.append("auto_rob_enabled = ?")
        params.append(1 if body.auto_rob_enabled else 0)
    if body.rob_confidence_threshold is not None:
        updates.append("rob_confidence_threshold = ?")
        params.append(float(body.rob_confidence_threshold))
    if updates:
        params.append(project_id)
        conn.execute(f"UPDATE projects SET {', '.join(updates)} WHERE project_id = ?", tuple(params))
        conn.commit()

    row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    return _settings_payload(dict(row))


@router.post("/projects/{project_id}/rob/run")
async def start_project_rob_run_alias(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Alias for batch RoB run at /api/projects/{id}/rob/run."""
    from services import rob_service
    check_project_access(conn, project_id, user)
    return rob_service.start_batch_rob_run(project_id, db=conn)


@router.get("/projects/{project_id}/rob/run/progress")
async def get_project_rob_run_progress_alias(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Alias for batch RoB run progress at /api/projects/{id}/rob/run/progress."""
    from services import rob_service
    check_project_access(conn, project_id, user)
    return rob_service.get_batch_rob_progress(project_id, db=conn)


@router.get("/projects/{project_id}/rob/summary")
async def get_project_rob_summary_alias(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Alias for RoB summary at /api/projects/{id}/rob/summary."""
    from services import rob_service
    check_project_access(conn, project_id, user)
    return rob_service.get_project_summary(project_id, db=conn)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="owner")
    # Children first: foreign keys are enforced, so a project that has members,
    # studies, tags or assessments cannot be deleted with a bare DELETE.
    study_ids = "SELECT study_id FROM studies WHERE project_id = ?"
    for table in ("extractions", "pdf_documents", "pdf_highlights", "audit_log"):
        conn.execute(f"DELETE FROM {table} WHERE study_id IN ({study_ids})", (project_id,))
    for table in (
        "record_annotations",
        "study_tag_links",
        "project_tags",
        "reporting_profile_items",  # keyed by assessment, cleared below
    ):
        if table == "reporting_profile_items":
            conn.execute(
                "DELETE FROM reporting_profile_items WHERE profile_assessment_id IN "
                "(SELECT profile_assessment_id FROM reporting_profile_assessments WHERE project_id = ?)",
                (project_id,),
            )
        else:
            conn.execute(f"DELETE FROM {table} WHERE project_id = ?", (project_id,))
    conn.execute(
        "DELETE FROM rob_signaling_answers WHERE judgment_id IN (SELECT judgment_id FROM rob_domain_judgments "
        "WHERE assessment_id IN (SELECT assessment_id FROM rob_assessments WHERE project_id = ?))",
        (project_id,),
    )
    conn.execute(
        "DELETE FROM rob_domain_judgments WHERE assessment_id IN "
        "(SELECT assessment_id FROM rob_assessments WHERE project_id = ?)",
        (project_id,),
    )
    for table in (
        "rob_assessments",
        "rob_runs",
        "reporting_profile_assessments",
        "extraction_decisions",
        "screening_decisions",
        "screening_conflicts",
        "screening_keywords",
        "search_logs",
        "clarification_questions",
        "project_members",
        "user_review_state",
        "variables",
        "studies",
    ):
        conn.execute(f"DELETE FROM {table} WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
    conn.commit()
    return {"deleted": True, "project_id": project_id}


# ═══════════════════════════════════════════════════════════════════════
#  PICO Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/pico", response_model=PICOResponse)
async def get_pico(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT pico_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    pico = json.loads(row["pico_json"]) if row["pico_json"] else {}
    is_defined = any(v.strip() for v in pico.values() if isinstance(v, str))
    return PICOResponse(
        project_id=project_id,
        population=pico.get("population", ""),
        index_test=pico.get("index_test", ""),
        comparator=pico.get("comparator", ""),
        outcome=pico.get("outcome", ""),
        study_design=pico.get("study_design", ""),
        is_defined=is_defined,
    )


@router.put("/projects/{project_id}/pico", response_model=PICOResponse)
async def update_pico(
    project_id: str,
    body: PICOUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    pico = {
        "population": body.population,
        "index_test": body.index_test,
        "comparator": body.comparator,
        "outcome": body.outcome,
        "study_design": body.study_design,
    }
    conn.execute(
        "UPDATE projects SET pico_json = ? WHERE project_id = ?",
        (json.dumps(pico), project_id),
    )
    conn.commit()
    is_defined = any(v.strip() for v in pico.values())
    return PICOResponse(
        project_id=project_id, is_defined=is_defined, **pico,
    )


# ═══════════════════════════════════════════════════════════════════════
#  Hypothesis Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/hypothesis", response_model=HypothesisResponse)
async def get_hypothesis(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT hypothesis, research_question, secondary_hypotheses_json FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    secondary = []
    if row["secondary_hypotheses_json"]:
        try:
            secondary = json.loads(row["secondary_hypotheses_json"])
        except json.JSONDecodeError:
            secondary = []
    return HypothesisResponse(
        project_id=project_id,
        hypothesis=row["hypothesis"] or "",
        research_question=row["research_question"] or "",
        secondary_hypotheses=secondary,
    )


@router.put("/projects/{project_id}/hypothesis", response_model=HypothesisResponse)
async def update_hypothesis(
    project_id: str,
    body: HypothesisUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    secondary_json = json.dumps([h.model_dump() for h in body.secondary_hypotheses])
    conn.execute(
        "UPDATE projects SET hypothesis = ?, research_question = ?, secondary_hypotheses_json = ? WHERE project_id = ?",
        (body.hypothesis, body.research_question, secondary_json, project_id),
    )
    conn.commit()
    return HypothesisResponse(
        project_id=project_id,
        hypothesis=body.hypothesis,
        research_question=body.research_question,
        secondary_hypotheses=body.secondary_hypotheses,
    )


# ═══════════════════════════════════════════════════════════════════════
#  PubMed API Key Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.put("/projects/{project_id}/pubmed-key")
async def update_pubmed_key(
    project_id: str,
    body: PubMedKeyUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    cursor = conn.execute(
        "UPDATE projects SET pubmed_api_key = ? WHERE project_id = ?",
        (body.pubmed_api_key, project_id),
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project_id": project_id, "pubmed_api_key_set": bool(body.pubmed_api_key)}


@router.get("/projects/{project_id}/pubmed-key")
async def get_pubmed_key(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT pubmed_api_key FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    key = row["pubmed_api_key"] or ""
    return {"project_id": project_id, "has_key": bool(key), "key_preview": key[:8] + "..." if len(key) > 8 else key}


def _slug_code(text: str) -> str:
    chars = []
    for ch in text.lower():
        chars.append(ch if ch.isalnum() else "_")
    slug = "".join(chars).strip("_")
    while "__" in slug:
        slug = slug.replace("__", "_")
    return (slug[:48] or "criterion")


def _persist_protocol_extraction(conn, project_id: str, result: dict) -> None:
    """Save extracted protocol fields onto a project. A blank project stays blank until this runs."""
    inclusion = [text for text in (result.get("inclusion") or []) if str(text).strip()]
    exclusion = [text for text in (result.get("exclusion") or []) if str(text).strip()]
    strings = dict(result.get("search_strings") or {})
    variables = result.get("variables") or []
    has_structure = bool(inclusion or exclusion or strings or variables)
    has_pico = any(str(result.get(key) or "").strip() for key in (
        "population", "index_test", "comparator", "outcome", "study_design",
    ))
    if not has_structure and not has_pico:
        return

    if strings.get("pubmed") and not strings.get("openalex"):
        from services.literature_search_service import pubmed_query_to_openalex
        strings["openalex"] = pubmed_query_to_openalex(strings["pubmed"])
        result["search_strings"] = strings

    pico = {
        "population": result.get("population") or "",
        "index_test": result.get("index_test") or "",
        "comparator": result.get("comparator") or "",
        "outcome": result.get("outcome") or "",
        "study_design": result.get("study_design") or "",
    }

    if (not inclusion or not exclusion) and has_pico:
        try:
            from services.search_string_generator import generate_criteria_from_pico
            draft = generate_criteria_from_pico(pico)
            if not inclusion and draft.get("inclusion"):
                inclusion = [item["text"] for item in draft["inclusion"]]
                result["inclusion"] = inclusion
            if not exclusion and draft.get("exclusion"):
                exclusion = [item["text"] for item in draft["exclusion"]]
                result["exclusion"] = exclusion
        except Exception:
            pass

    sets = ["pico_json = ?", "hypothesis = ?", "research_question = ?"]
    params = [
        json.dumps(pico),
        result.get("hypothesis") or "",
        result.get("research_question") or "",
    ]
    if inclusion or exclusion:
        sets.extend([
            "inclusion_criteria_json = ?",
            "exclusion_criteria_json = ?",
        ])
        params.extend([
            json.dumps([{"id": str(uuid.uuid4()), "text": text} for text in inclusion]),
            json.dumps([{"id": str(uuid.uuid4()), "text": text} for text in exclusion]),
        ])
    if strings or exclusion:
        sets.extend([
            "search_strings_json = ?",
            "exclusion_reasons_json = ?",
        ])
        params.extend([
            json.dumps(strings),
            json.dumps([
                {"code": _slug_code(text), "label": text}
                for text in exclusion
            ]),
        ])
    params.append(project_id)
    conn.execute(
        f"UPDATE projects SET {', '.join(sets)} WHERE project_id = ?",
        tuple(params),
    )

    if variables:
        from services.variable_generator import _default_extraction_prompt
        existing = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM variables WHERE project_id = ?", (project_id,)
            ).fetchall()
        }
        for var in variables:
            name = str(var.get("name") or "").strip()
            if not name or name in existing:
                continue
            prompt = _default_extraction_prompt(
                name, var.get("description") or "", var.get("field_type") or "text",
            )
            conn.execute(
                """INSERT INTO variables
                   (variable_id, project_id, section, name, field_type, allowed_values,
                    range_min, range_max, description, extraction_prompt, order_index, is_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    str(uuid.uuid4()), project_id, var.get("section") or "Context", name,
                    var.get("field_type") or "text", var.get("allowed_values") or "",
                    None, None, var.get("description") or "", prompt,
                    int(var.get("order_index") or 0),
                ),
            )
            existing.add(name)
    conn.commit()


# ═══════════════════════════════════════════════════════════════════════
#  PICO Extraction from Document
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/pico/extract", response_model=PicoExtractionResponse)
async def extract_pico_from_document(
    project_id: str,
    file: UploadFile = File(...),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Upload a protocol document and extract PICO elements via NLP analysis."""
    from services import pico_extractor

    # Verify project exists
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    # Save uploaded file to temp
    filename = file.filename or "document.txt"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".pdf", ".docx", ".doc", ".txt", ".md", ".rtf"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Supported: PDF, Word (DOCX/DOC), TXT, MD, RTF")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = pico_extractor.extract_pico_from_file(tmp_path, filename)
        _persist_protocol_extraction(conn, project_id, result)
        return PicoExtractionResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


# ═══════════════════════════════════════════════════════════════════════
#  Inclusion/Exclusion Criteria Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/criteria", response_model=CriteriaResponse)
async def get_criteria(project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    row = conn.execute(
        "SELECT inclusion_criteria_json, exclusion_criteria_json FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    inclusion = []
    exclusion = []
    try:
        inclusion = json.loads(row["inclusion_criteria_json"]) if row["inclusion_criteria_json"] else []
    except json.JSONDecodeError:
        pass
    try:
        exclusion = json.loads(row["exclusion_criteria_json"]) if row["exclusion_criteria_json"] else []
    except json.JSONDecodeError:
        pass
    return CriteriaResponse(
        project_id=project_id,
        inclusion=[Criterion(**c) for c in inclusion],
        exclusion=[Criterion(**c) for c in exclusion],
    )


@router.put("/projects/{project_id}/criteria", response_model=CriteriaResponse)
async def update_criteria(project_id: str,
    body: CriteriaUpdate, user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    inclusion_json = json.dumps([c.model_dump() for c in body.inclusion])
    exclusion_json = json.dumps([c.model_dump() for c in body.exclusion])
    conn.execute(
        "UPDATE projects SET inclusion_criteria_json = ?, exclusion_criteria_json = ? WHERE project_id = ?",
        (inclusion_json, exclusion_json, project_id),
    )
    conn.commit()
    return CriteriaResponse(
        project_id=project_id,
        inclusion=body.inclusion,
        exclusion=body.exclusion,
    )


@router.post("/projects/{project_id}/criteria/generate", response_model=CriteriaResponse)
async def generate_criteria(project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    """Auto-generate inclusion/exclusion criteria from the project's PICO framework."""
    from services import search_string_generator

    row = conn.execute(
        "SELECT pico_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    pico = json.loads(row["pico_json"]) if row["pico_json"] else {}
    if not any(v.strip() for v in pico.values() if isinstance(v, str)):
        raise HTTPException(status_code=400, detail="PICO framework is not defined. Please define PICO first.")
    result = search_string_generator.generate_criteria_from_pico(pico)
    return CriteriaResponse(
        project_id=project_id,
        inclusion=[Criterion(**c) for c in result["inclusion"]],
        exclusion=[Criterion(**c) for c in result["exclusion"]],
    )


# ═══════════════════════════════════════════════════════════════════════
#  Search String Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/search-strings/generate", response_model=SearchStringsResponse)
async def generate_search_strings(project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    """Generate database-specific search strings from the project's PICO framework."""
    from services import search_string_generator

    row = conn.execute(
        "SELECT pico_json, research_question FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")
    pico = json.loads(row["pico_json"]) if row["pico_json"] else {}
    if not any(v.strip() for v in pico.values() if isinstance(v, str)):
        raise HTTPException(status_code=400, detail="PICO framework is not defined. Please define PICO first.")
    try:
        strings = await run_in_threadpool(
            search_string_generator.generate_ai_search_strings, pico,
            dict(row).get("research_question") or "",
        )
    except search_string_generator.SearchGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    strings_json = json.dumps(strings)
    conn.execute(
        "UPDATE projects SET search_strings_json = ? WHERE project_id = ?",
        (strings_json, project_id),
    )
    conn.commit()
    return SearchStringsResponse(project_id=project_id, strings=strings)


@router.get("/projects/{project_id}/search-strings", response_model=SearchStringsResponse)
async def get_search_strings(project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    row = conn.execute(
        "SELECT search_strings_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    strings = {}
    try:
        strings = json.loads(row["search_strings_json"]) if row["search_strings_json"] else {}
    except json.JSONDecodeError:
        pass
    return SearchStringsResponse(project_id=project_id, strings=strings)


class SearchStringsUpdate(BaseModel):
    """Request body for manually setting search strings."""
    strings: dict  # e.g. {"pubmed": "...", "ovid": "...", "scopus": "...", "wos": "..."}


@router.put("/projects/{project_id}/search-strings", response_model=SearchStringsResponse)
async def update_search_strings(project_id: str,
    body: SearchStringsUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Manually set search strings for each database (no LLM required)."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    strings_json = json.dumps(body.strings)
    conn.execute(
        "UPDATE projects SET search_strings_json = ? WHERE project_id = ?",
        (strings_json, project_id),
    )
    conn.commit()
    return SearchStringsResponse(project_id=project_id, strings=body.strings)


@router.post("/projects/{project_id}/search-from-question", response_model=ResearchQuestionResponse)
async def search_from_question(
    project_id: str,
    body: ResearchQuestionRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Generate PICO and search strings from a plain-language research question.

    Uses LLM to extract PICO elements from the question, then generates
    database-specific search strings. Saves both PICO and search strings
    to the project.
    """
    from services import search_string_generator

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="Research question is required.")

    # Extract PICO from the question
    try:
        result = await run_in_threadpool(search_string_generator.extract_pico_from_question, body.question.strip())
    except search_string_generator.SearchGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    pico = result["pico"]
    strings = result["strings"]
    hypothesis = result.get("hypothesis", "")
    secondary = result.get("secondary_hypotheses", [])
    secondary_objs = [
        {"text": txt, "type": "alternative", "status": "pending"}
        for txt in secondary
    ]
    secondary_json = json.dumps(secondary_objs)

    # Save PICO and hypothesis to project
    pico_json = json.dumps(pico)
    strings_json = json.dumps(strings)
    conn.execute(
        "UPDATE projects SET pico_json = ?, search_strings_json = ?, research_question = ?, hypothesis = ?, secondary_hypotheses_json = ? WHERE project_id = ?",
        (pico_json, strings_json, body.question.strip(), hypothesis, secondary_json, project_id),
    )
    conn.commit()

    return ResearchQuestionResponse(
        project_id=project_id,
        pico=pico,
        strings=strings,
        hypothesis=hypothesis,
        secondary_hypotheses=secondary,
    )


@router.post("/projects/{project_id}/pico/from-question", response_model=PicoFromQuestionResponse)
async def generate_pico_from_question(
    project_id: str,
    body: PicoFromQuestionRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Generate editable PICO framework fields from a plain-language research question.

    Identifies ambiguity and missing information without generating or overwriting
    search strings prematurely.
    """
    from services import search_string_generator

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="Research question is required.")

    try:
        result = await run_in_threadpool(search_string_generator.extract_pico_from_question, body.question.strip())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PICO extraction failed: {str(exc)}") from exc

    pico = result.get("pico", {})
    hypothesis = result.get("hypothesis", "")
    null_hypothesis = result.get("null_hypothesis", "")
    secondary = result.get("secondary_hypotheses", [])

    # Identify missing fields
    missing_fields = []
    field_labels = {
        "population": "Population / Participants (P)",
        "index_test": "Intervention / Index Test (I)",
        "comparator": "Comparator / Reference Standard (C)",
        "outcome": "Outcome / Primary Endpoint (O)",
        "study_design": "Study Design (S)",
    }
    for k, label in field_labels.items():
        if not pico.get(k) or not str(pico.get(k)).strip():
            missing_fields.append(label)

    # Detect ambiguity signals
    ambiguities = []
    comp_val = str(pico.get("comparator", "")).lower().strip()
    if not comp_val or comp_val in ["none", "n/a", "no comparator", "standard care"]:
        ambiguities.append("Comparator is not explicitly contrasted; please verify reference standard or control.")
    pop_val = str(pico.get("population", "")).strip()
    if len(pop_val.split()) < 3 and pop_val:
        ambiguities.append("Population description is brief; confirm eligibility limits (e.g. age, disease severity, imaging modality).")
    out_val = str(pico.get("outcome", "")).strip()
    if out_val and not any(w in out_val.lower() for w in ["rate", "sensitivity", "survival", "score", "time", "accuracy", "mortality", "safety", "recurrence"]):
        ambiguities.append("Outcome measurement criteria or operational metrics are not explicitly quantified.")

    if body.persist:
        pico_json = json.dumps(pico)
        secondary_objs = [
            {"text": txt, "type": "alternative", "status": "pending"}
            for txt in secondary
        ]
        secondary_json = json.dumps(secondary_objs)
        conn.execute(
            "UPDATE projects SET pico_json = ?, research_question = ?, hypothesis = ?, secondary_hypotheses_json = ? WHERE project_id = ?",
            (pico_json, body.question.strip(), hypothesis, secondary_json, project_id),
        )
        conn.commit()

    return PicoFromQuestionResponse(
        project_id=project_id,
        pico=pico,
        hypothesis=hypothesis,
        null_hypothesis=null_hypothesis,
        secondary_hypotheses=secondary,
        ambiguities=ambiguities,
        missing_fields=missing_fields,
    )


@router.post("/projects/{project_id}/generate-hypothesis", response_model=HypothesisResponse)
async def generate_project_hypothesis(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Generate or re-generate directional scientific hypotheses from project PICO."""
    from services import search_string_generator

    row = conn.execute(
        "SELECT * FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    pico = json.loads(row["pico_json"]) if row["pico_json"] else {}
    question = row["research_question"] or ""

    hypo_result = await run_in_threadpool(
        search_string_generator.generate_hypothesis_from_pico, pico, question
    )
    primary = hypo_result.get("primary_hypothesis", "")
    secondary_texts = hypo_result.get("secondary_hypotheses", [])
    secondary_objs = [
        {"text": txt, "type": "alternative", "status": "pending"}
        for txt in secondary_texts
    ]
    secondary_json = json.dumps(secondary_objs)

    conn.execute(
        "UPDATE projects SET hypothesis = ?, secondary_hypotheses_json = ? WHERE project_id = ?",
        (primary, secondary_json, project_id),
    )
    conn.commit()

    return HypothesisResponse(
        project_id=project_id,
        hypothesis=primary,
        research_question=question,
        secondary_hypotheses=[SecondaryHypothesis(**h) for h in secondary_objs],
    )


# ═══════════════════════════════════════════════════════════════════════
#  PubMed Auto-Fetch Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/search-strings/pubmed/fetch", response_model=PubMedFetchResponse)
async def pubmed_fetch_studies(project_id: str,
    body: PubMedFetchRequest, user: Optional[dict] = Depends(get_current_user_optional), conn: DBBackend = Depends(get_db)):
    """Auto-fetch studies from PubMed using the saved search string + project API key."""
    from services import pubmed_service

    try:
        row = conn.execute(
            "SELECT search_strings_json, pubmed_api_key FROM projects WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        check_project_access(conn, project_id, user, min_role="editor")

        strings = {}
        try:
            strings = json.loads(row["search_strings_json"]) if row["search_strings_json"] else {}
        except json.JSONDecodeError:
            pass

        pubmed_query = strings.get("pubmed", "")
        if not pubmed_query:
            raise HTTPException(status_code=400, detail="No PubMed search string found. Generate search strings first.")

        api_key = row["pubmed_api_key"] or ""

        # Search PubMed. Date bounds are optional; an empty bound does not filter.
        results = pubmed_service.batch_search(
            pubmed_query,
            api_key=api_key,
            max_results=body.max_results,
            mindate=body.mindate,
            maxdate=body.maxdate,
        )

        # Get existing PMIDs to skip duplicates
        existing_pmids = set()
        existing_rows = conn.execute(
            "SELECT pmid FROM studies WHERE project_id = ? AND pmid != ''", (project_id,)
        ).fetchall()
        for r in existing_rows:
            existing_pmids.add(r["pmid"])

        imported = 0
        skipped = 0
        for study_data in results:
            pmid = study_data.get("pmid", "")
            if pmid and pmid in existing_pmids:
                skipped += 1
                continue
            study_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO studies
                   (study_id, project_id, title, authors, publication_year, journal,
                    doi, pmid, abstract, source, study_design, metadata_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (study_id, project_id, study_data.get("title", ""),
                 study_data.get("authors", ""), study_data.get("publication_year"),
                 study_data.get("journal", ""), study_data.get("doi", ""),
                 pmid, study_data.get("abstract", ""), "PubMed",
                 study_data.get("study_design", ""), ""),
            )
            existing_pmids.add(pmid)
            imported += 1

        conn.commit()
        from services.search_audit_service import log_search
        log_search(
            project_id,
            "PubMed",
            pubmed_query,
            filters={
                "mindate": body.mindate,
                "maxdate": body.maxdate,
                "datetype": "pdat",
                "note": (
                    "Eligibility text may say no date restriction. "
                    "The executed window is the search-strategy header when dates are set. "
                    "Ovid MEDLINE has no API in this app. "
                    "Scopus and Web of Science are not queried; OpenAlex is the substitute."
                ),
            },
            results_count=len(results),
            db=conn,
        )
        return PubMedFetchResponse(
            query=pubmed_query,
            imported_count=imported,
            skipped_duplicates=skipped,
            total_found=len(results),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PubMed fetch failed: {str(e)}")

@router.post("/projects/{project_id}/search-strings/openalex/fetch", response_model=PubMedFetchResponse)
async def openalex_fetch_studies(
    project_id: str,
    body: OpenAlexFetchRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Import OpenAlex records for the saved PubMed concepts.

    OpenAlex stands in for Scopus and Web of Science, which this app cannot query.
    PubMed [tiab] tags are not sent; quoted phrases are searched in title and abstract.
    """
    from services.literature_search_service import openalex_phrases, search_openalex_phrases
    from services.search_audit_service import log_search

    row = conn.execute(
        "SELECT search_strings_json FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    strings = {}
    try:
        strings = json.loads(row["search_strings_json"]) if row["search_strings_json"] else {}
    except json.JSONDecodeError:
        strings = {}
    pubmed_query = strings.get("pubmed", "")
    if not pubmed_query and not strings.get("openalex"):
        raise HTTPException(status_code=400, detail="No search string found. Save a protocol search first.")

    phrases = openalex_phrases(pubmed_query or strings.get("openalex", ""))
    found = search_openalex_phrases(
        phrases,
        mindate=body.mindate or "1960-01-01",
        maxdate=body.maxdate or "2026-08-31",
        max_results=body.max_results,
    )
    if found["errors"] and not found["results"]:
        raise HTTPException(status_code=502, detail="; ".join(found["errors"]))

    existing_dois = set()
    existing_pmids = set()
    existing_titles = set()
    for existing in conn.execute(
        "SELECT doi, pmid, title FROM studies WHERE project_id = ?",
        (project_id,),
    ).fetchall():
        if existing["doi"]:
            existing_dois.add(existing["doi"].strip().lower().removeprefix("https://doi.org/"))
        if existing["pmid"]:
            existing_pmids.add(existing["pmid"].strip())
        if existing["title"]:
            existing_titles.add("".join(ch.lower() for ch in existing["title"] if ch.isalnum()))

    imported = 0
    skipped = 0
    for study_data in found["results"]:
        doi = (study_data.get("doi") or "").strip().lower()
        pmid = (study_data.get("pmid") or "").strip()
        title_key = "".join(ch.lower() for ch in (study_data.get("title") or "") if ch.isalnum())
        if (doi and doi in existing_dois) or (pmid and pmid in existing_pmids) or (title_key and title_key in existing_titles):
            skipped += 1
            continue
        conn.execute(
            """INSERT INTO studies
               (study_id, project_id, title, authors, publication_year, journal,
                doi, pmid, abstract, source, study_design, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()), project_id, study_data.get("title") or "",
                study_data.get("authors") or "", study_data.get("publication_year"),
                study_data.get("journal") or "", study_data.get("doi") or "",
                pmid, study_data.get("abstract") or "", "OpenAlex", "",
                json.dumps({"oa_url": study_data.get("oa_url") or "", "openalex_id": study_data.get("id") or ""}),
            ),
        )
        if doi:
            existing_dois.add(doi)
        if pmid:
            existing_pmids.add(pmid)
        if title_key:
            existing_titles.add(title_key)
        imported += 1
    conn.commit()

    query_record = " OR ".join(f'"{phrase}"' for phrase in phrases)
    for database_name, key, reason in (
        ("Ovid MEDLINE", "ovid_medline", "No Ovid API connector in this app."),
        ("Scopus", "scopus", "Scopus search is pending in the protocol and has no API connector here."),
        ("Web of Science", "web_of_science", "Web of Science search is pending in the protocol and has no API connector here."),
    ):
        if strings.get(key):
            log_search(
                project_id,
                database_name,
                strings[key],
                filters={"executed": False, "reason": reason},
                results_count=0,
                db=conn,
            )
    log_search(
        project_id,
        "OpenAlex",
        query_record,
        filters={
            "mindate": body.mindate,
            "maxdate": body.maxdate,
            "phrases": phrases,
            "reported_count": found["reported_count"],
            "errors": found["errors"],
            "note": "Substitute for pending Scopus and Web of Science searches. Ovid MEDLINE was not queried.",
        },
        results_count=len(found["results"]),
        db=conn,
    )
    return PubMedFetchResponse(
        query=query_record,
        imported_count=imported,
        skipped_duplicates=skipped,
        total_found=len(found["results"]),
    )


# ═══════════════════════════════════════════════════════════════════════
#  Reference Upload Endpoint
# ═══════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════
#  Reference Preview & Upload Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/references/preview", response_model=ReferencePreviewResponse)
async def preview_references(
    project_id: str,
    file: UploadFile = File(...),
    column_mapping: Optional[str] = None,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Preview a reference file before importing: detect format, preview records, inspect malformed rows."""
    from services import reference_parser
    import csv, io

    # Verify project exists
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")

    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = content_bytes.decode("latin-1")

    filename = file.filename or "references.ris"
    parsed_mapping = None
    if column_mapping:
        try:
            parsed_mapping = json.loads(column_mapping)
        except Exception:
            parsed_mapping = None

    # Detect columns if it's CSV
    detected_cols = []
    fmt = reference_parser.detect_reference_format(content, filename)
    if fmt == "CSV with column mapping" or filename.lower().endswith(".csv"):
        try:
            sample_reader = csv.DictReader(io.StringIO(content))
            if sample_reader.fieldnames:
                detected_cols = [c for c in sample_reader.fieldnames if c]
        except Exception:
            pass

    result = reference_parser.parse_references_detailed(
        content=content,
        filename=filename,
        column_mapping=parsed_mapping,
    )

    malformed_details = [
        MalformedRecordDetail(
            index=m.get("index"),
            reason=m.get("reason", "Malformed record"),
            snippet=m.get("snippet")
        )
        for m in result.get("malformed_records", [])
    ]

    return ReferencePreviewResponse(
        format=result.get("format", "Unknown"),
        filename=filename,
        total_found=result.get("total_parsed", 0) + result.get("total_malformed", 0),
        total_valid=result.get("total_parsed", 0),
        total_malformed=result.get("total_malformed", 0),
        preview_records=result.get("records", [])[:10],
        malformed_records=malformed_details,
        columns_detected=detected_cols,
    )


@router.post("/projects/{project_id}/references/upload", response_model=ReferenceUploadResponse)
async def upload_references(
    project_id: str,
    files: list[UploadFile] = File(...),
    column_mapping: Optional[str] = None,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Upload one or more reference files and import studies with persistent batch tracking.

    Supports RIS, BibTeX, CSV with column mapping, PubMed/NBIB, EndNote Tagged,
    EndNote XML, PubMed XML, and Web of Science CIW.
    """
    from services import reference_parser

    # Verify project exists
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    parsed_mapping = None
    if column_mapping:
        try:
            parsed_mapping = json.loads(column_mapping)
        except Exception:
            parsed_mapping = None

    # Collect existing DOIs and titles with their study_id for exact duplicate linking
    existing_doi_map: dict[str, str] = {}
    existing_title_map: dict[str, str] = {}
    rows = conn.execute(
        "SELECT study_id, doi, title FROM studies WHERE project_id = ?", (project_id,)
    ).fetchall()
    for r in rows:
        if r["doi"]:
            existing_doi_map[r["doi"].lower().strip()] = r["study_id"]
        if r["title"]:
            existing_title_map[r["title"].lower().strip()] = r["study_id"]

    total_imported = 0
    total_skipped = 0
    source_names: list[str] = []
    overall_errors: list[str] = []
    all_malformed: list[MalformedRecordDetail] = []
    detected_formats: list[str] = []
    created_batches: list[ImportBatchResponse] = []
    all_imported_studies: list[dict] = []
    created_batch_ids: list[str] = []

    username = user.get("username", "") if user else ""

    for file in files:
        file_batch_id = str(uuid.uuid4())
        created_batch_ids.append(file_batch_id)

        # Read file content
        content_bytes = await file.read()
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = content_bytes.decode("latin-1")

        filename = file.filename or "references.ris"
        source_names.append(filename)

        file_errors: list[str] = []
        file_malformed: list[MalformedRecordDetail] = []
        studies: list[dict] = []
        file_format = "Unknown"
        now_formatted = datetime.utcnow().strftime("%d %b %Y %H:%M UTC")

        # Create parent import_batch record first to satisfy foreign key constraints
        conn.execute(
            """INSERT INTO import_batches
               (batch_id, project_id, filename, source, format,
                total_records, imported_count, duplicate_count, merged_count, failed_count,
                status, created_at, created_by, details_json)
               VALUES (?, ?, ?, 'Unknown', 'Unknown', 0, 0, 0, 0, 0, 'importing', ?, ?, '{}')""",
            (file_batch_id, project_id, filename, now_formatted, username)
        )

        # Parse references with detailed reporting
        try:
            parse_res = reference_parser.parse_references_detailed(
                content=content,
                filename=filename,
                column_mapping=parsed_mapping,
            )
            file_format = parse_res.get("format", "Unknown")
            detected_formats.append(file_format)
            studies = parse_res.get("records", [])
            for m in parse_res.get("malformed_records", []):
                md = MalformedRecordDetail(
                    index=m.get("index"),
                    reason=f"[{filename}] {m.get('reason', 'Malformed')}",
                    snippet=m.get("snippet")
                )
                file_malformed.append(md)
                all_malformed.append(md)
        except Exception as e:
            err_msg = f"Failed to parse {filename}: {str(e)}"
            file_errors.append(err_msg)
            overall_errors.append(err_msg)

        if not studies:
            err_msg = f"No valid references found in {filename}"
            if err_msg not in file_errors:
                file_errors.append(err_msg)
            if err_msg not in overall_errors:
                overall_errors.append(err_msg)

        # Detect source truthfully without guessing "Scopus"
        detected_source = "Unknown"
        if studies:
            known_sources = {
                s.get("source") for s in studies
                if s.get("source") and s.get("source").lower() not in ("reference upload", "unknown", "")
            }
            if len(known_sources) == 1:
                detected_source = list(known_sources)[0]

        file_imported = 0
        file_duplicates = 0
        file_records_details: list[dict] = []

        # Process each reference record
        for idx, study_data in enumerate(studies, 1):
            doi = study_data.get("doi", "").lower().strip()
            title = study_data.get("title", "").lower().strip()

            matched_study_id: Optional[str] = None
            match_reason: Optional[str] = None

            if doi and doi in existing_doi_map:
                matched_study_id = existing_doi_map[doi]
                match_reason = "doi"
            elif title and title in existing_title_map:
                matched_study_id = existing_title_map[title]
                match_reason = "title"

            if matched_study_id:
                # Duplicate record - link batch contribution as secondary creator
                file_duplicates += 1
                total_skipped += 1
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO batch_study_contributions
                           (contribution_id, batch_id, study_id, project_id, is_primary_creator, created_at)
                           VALUES (?, ?, ?, ?, 0, datetime('now'))""",
                        (str(uuid.uuid4()), file_batch_id, matched_study_id, project_id)
                    )
                except Exception:
                    pass

                file_records_details.append({
                    "index": idx,
                    "study_id": matched_study_id,
                    "title": study_data.get("title", ""),
                    "authors": study_data.get("authors", ""),
                    "publication_year": study_data.get("publication_year"),
                    "journal": study_data.get("journal", ""),
                    "doi": study_data.get("doi", ""),
                    "pmid": study_data.get("pmid", ""),
                    "status": "duplicate",
                    "match_reason": match_reason,
                })
                continue

            # New unique study to add to intake screening
            new_study_id = str(uuid.uuid4())
            final_study_source = detected_source if detected_source != "Unknown" else (study_data.get("source") or "Reference upload")

            conn.execute(
                """INSERT INTO studies
                   (study_id, project_id, title, authors, publication_year, journal,
                    doi, pmid, abstract, source, study_design, metadata_json,
                    screening_status, screening_stage, import_batch_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'ta', ?)""",
                (new_study_id, project_id, study_data.get("title", ""),
                 study_data.get("authors", ""), study_data.get("publication_year"),
                 study_data.get("journal", ""), study_data.get("doi", ""),
                 study_data.get("pmid", ""), study_data.get("abstract", ""),
                 final_study_source,
                 study_data.get("study_design", ""), "", file_batch_id),
            )

            # Link primary contribution
            conn.execute(
                """INSERT INTO batch_study_contributions
                   (contribution_id, batch_id, study_id, project_id, is_primary_creator, created_at)
                   VALUES (?, ?, ?, ?, 1, datetime('now'))""",
                (str(uuid.uuid4()), file_batch_id, new_study_id, project_id)
            )

            if doi:
                existing_doi_map[doi] = new_study_id
            if title:
                existing_title_map[title] = new_study_id

            file_imported += 1
            total_imported += 1

            study_record = {
                "study_id": new_study_id,
                "project_id": project_id,
                "title": study_data.get("title", ""),
                "authors": study_data.get("authors", ""),
                "publication_year": study_data.get("publication_year"),
                "journal": study_data.get("journal", ""),
                "doi": study_data.get("doi", ""),
                "pmid": study_data.get("pmid", ""),
                "source": final_study_source,
                "screening_status": "pending",
                "screening_stage": "ta",
            }
            all_imported_studies.append(study_record)

            file_records_details.append({
                "index": idx,
                "study_id": new_study_id,
                "title": study_data.get("title", ""),
                "authors": study_data.get("authors", ""),
                "publication_year": study_data.get("publication_year"),
                "journal": study_data.get("journal", ""),
                "doi": study_data.get("doi", ""),
                "pmid": study_data.get("pmid", ""),
                "status": "added",
                "match_reason": None,
            })

        # Calculate reconciling counts for the batch
        file_failed = len(file_malformed)
        if file_errors and not studies and file_failed == 0:
            file_failed = 1
        file_total = file_imported + file_duplicates + file_failed

        if file_total == 0 and file_errors:
            batch_status = "failed"
        elif file_errors or file_malformed:
            batch_status = "completed_with_errors" if file_imported > 0 else "failed"
        else:
            batch_status = "completed"

        details_payload = {
            "records": file_records_details,
            "errors": file_errors,
            "malformed_records": [m.dict() for m in file_malformed],
        }

        # Update batch with final counts and status
        conn.execute(
            """UPDATE import_batches
               SET source = ?, format = ?, total_records = ?, imported_count = ?,
                   duplicate_count = ?, merged_count = 0, failed_count = ?,
                   status = ?, details_json = ?
               WHERE batch_id = ?""",
            (detected_source, file_format, file_total, file_imported,
             file_duplicates, file_failed, batch_status, json.dumps(details_payload),
             file_batch_id)
        )

        created_batches.append(ImportBatchResponse(
            batch_id=file_batch_id,
            project_id=project_id,
            filename=filename,
            source=detected_source,
            format=file_format,
            total_records=file_total,
            imported_count=file_imported,
            duplicate_count=file_duplicates,
            merged_count=0,
            failed_count=file_failed,
            status=batch_status,
            undone_at=None,
            created_at=now_formatted,
            created_by=username,
            retained_studies_count=file_imported,
        ))

    conn.commit()

    return ReferenceUploadResponse(
        imported_count=total_imported,
        skipped_duplicates=total_skipped,
        source=", ".join(source_names) if source_names else "Unknown",
        format=", ".join(sorted(set(detected_formats))) if detected_formats else None,
        errors=overall_errors,
        malformed_records=all_malformed,
        batch_id=created_batch_ids[0] if created_batch_ids else None,
        batch_ids=created_batch_ids,
        total_records=total_imported + total_skipped + len(all_malformed),
        batches=created_batches,
        imported_studies=all_imported_studies,
    )


# ═══════════════════════════════════════════════════════════════════════
#  Import Batches & Screening Intake History
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/batches", response_model=list[ImportBatchResponse])
async def list_import_batches(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """List all bibliographic reference import batches for a project."""
    row = conn.execute("SELECT project_id FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")

    rows = conn.execute(
        """SELECT batch_id, project_id, filename, source, format,
                  total_records, imported_count, duplicate_count, merged_count, failed_count,
                  status, undone_at, created_at, created_by
           FROM import_batches
           WHERE project_id = ?
           ORDER BY created_at DESC""",
        (project_id,)
    ).fetchall()

    result: list[ImportBatchResponse] = []
    for r in rows:
        b_dict = dict(r)
        # Calculate how many studies contributed by this batch currently remain in studies table
        retained_row = conn.execute(
            """SELECT COUNT(DISTINCT s.study_id) as retained_count
               FROM studies s
               JOIN batch_study_contributions bsc ON s.study_id = bsc.study_id
               WHERE bsc.batch_id = ? AND s.project_id = ?""",
            (b_dict["batch_id"], project_id)
        ).fetchone()
        b_dict["retained_studies_count"] = retained_row["retained_count"] if retained_row else 0
        result.append(ImportBatchResponse(**b_dict))
    return result


@router.get("/projects/{project_id}/batches/{batch_id}", response_model=ImportBatchDetailResponse)
async def get_import_batch_detail(
    project_id: str,
    batch_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Get full details of a specific import batch including parsed records and duplicate outcomes."""
    check_project_access(conn, project_id, user, min_role="viewer")
    row = conn.execute(
        """SELECT batch_id, project_id, filename, source, format,
                  total_records, imported_count, duplicate_count, merged_count, failed_count,
                  status, undone_at, created_at, created_by, details_json
           FROM import_batches
           WHERE batch_id = ? AND project_id = ?""",
        (batch_id, project_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Import batch not found")

    b_dict = dict(row)
    details_raw = b_dict.pop("details_json", "{}") or "{}"
    try:
        details = json.loads(details_raw)
    except Exception:
        details = {}

    # Query currently active study IDs in this project
    active_study_ids = {
        s["study_id"] for s in conn.execute(
            "SELECT study_id FROM studies WHERE project_id = ?", (project_id,)
        ).fetchall()
    }

    records: list[ImportBatchRecord] = []
    for rec in details.get("records", []):
        sid = rec.get("study_id")
        rec_copy = dict(rec)
        rec_copy["study_active"] = bool(sid and sid in active_study_ids)
        records.append(ImportBatchRecord(**rec_copy))

    retained_row = conn.execute(
        """SELECT COUNT(DISTINCT s.study_id) as retained_count
           FROM studies s
           JOIN batch_study_contributions bsc ON s.study_id = bsc.study_id
           WHERE bsc.batch_id = ? AND s.project_id = ?""",
        (batch_id, project_id)
    ).fetchone()
    b_dict["retained_studies_count"] = retained_row["retained_count"] if retained_row else 0

    return ImportBatchDetailResponse(
        **b_dict,
        records=records,
        errors=details.get("errors", []),
        malformed_records=[MalformedRecordDetail(**m) for m in details.get("malformed_records", [])],
    )


@router.patch("/projects/{project_id}/batches/{batch_id}/source", response_model=ImportBatchResponse)
async def update_batch_source(
    project_id: str,
    batch_id: str,
    body: UpdateBatchSourceRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Update the database/source metadata for an import batch and its associated studies."""
    check_project_access(conn, project_id, user, min_role="editor")
    row = conn.execute(
        "SELECT * FROM import_batches WHERE batch_id = ? AND project_id = ?",
        (batch_id, project_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Import batch not found")

    cleaned_source = body.source.strip() or "Unknown"
    conn.execute(
        "UPDATE import_batches SET source = ? WHERE batch_id = ? AND project_id = ?",
        (cleaned_source, batch_id, project_id)
    )
    conn.execute(
        "UPDATE studies SET source = ? WHERE import_batch_id = ? AND project_id = ?",
        (cleaned_source, batch_id, project_id)
    )
    conn.commit()

    updated = conn.execute(
        "SELECT * FROM import_batches WHERE batch_id = ? AND project_id = ?",
        (batch_id, project_id)
    ).fetchone()
    u_dict = dict(updated)
    u_dict.pop("details_json", None)

    retained_row = conn.execute(
        """SELECT COUNT(DISTINCT s.study_id) as retained_count
           FROM studies s
           JOIN batch_study_contributions bsc ON s.study_id = bsc.study_id
           WHERE bsc.batch_id = ? AND s.project_id = ?""",
        (batch_id, project_id)
    ).fetchone()
    u_dict["retained_studies_count"] = retained_row["retained_count"] if retained_row else 0

    return ImportBatchResponse(**u_dict)


@router.get("/projects/{project_id}/batches/{batch_id}/undo-preview", response_model=UndoImpactPreviewResponse)
async def preview_undo_batch(
    project_id: str,
    batch_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Calculate the exact server-side impact before undoing an import batch."""
    check_project_access(conn, project_id, user, min_role="editor")
    batch = conn.execute(
        "SELECT * FROM import_batches WHERE batch_id = ? AND project_id = ?",
        (batch_id, project_id)
    ).fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    if batch["status"] == "undone":
        return UndoImpactPreviewResponse(
            batch_id=batch_id,
            filename=batch["filename"],
            status="undone",
            can_undo=False,
            blocking_reason="Batch has already been undone.",
            studies_to_remove_count=0,
            studies_to_remove=[],
            studies_retained_count=0,
            studies_retained=[],
            downstream_work={},
            has_downstream_work=False,
        )

    # Get all studies contributed by this batch
    contributions = conn.execute(
        """SELECT bsc.study_id, bsc.is_primary_creator, s.title, s.screening_status, s.pdf_path
           FROM batch_study_contributions bsc
           LEFT JOIN studies s ON bsc.study_id = s.study_id
           WHERE bsc.batch_id = ? AND bsc.project_id = ?""",
        (batch_id, project_id)
    ).fetchall()

    studies_to_remove: list[dict] = []
    studies_retained: list[dict] = []

    total_screening_decisions = 0
    total_extractions = 0
    total_rob = 0
    total_pdfs = 0

    for c in contributions:
        sid = c["study_id"]
        title = c["title"] or f"Study {sid}"

        # If study no longer exists in studies table, skip
        if not c["title"]:
            continue

        # Check if another ACTIVE batch contributed this study
        other_active = conn.execute(
            """SELECT ib.batch_id, ib.filename
               FROM batch_study_contributions bsc
               JOIN import_batches ib ON bsc.batch_id = ib.batch_id
               WHERE bsc.study_id = ? AND bsc.batch_id != ? AND ib.status != 'undone' AND ib.project_id = ?""",
            (sid, batch_id, project_id)
        ).fetchall()

        if other_active:
            other_names = [o["filename"] for o in other_active]
            studies_retained.append({
                "study_id": sid,
                "title": title,
                "reason": f"Also contributed by active batch(es): {', '.join(other_names)}"
            })
        else:
            # Study will be removed. Check downstream work.
            dec_row = conn.execute("SELECT COUNT(*) as c FROM screening_decisions WHERE study_id = ?", (sid,)).fetchone()
            n_decisions = dec_row["c"] if dec_row else 0
            ext_row = conn.execute("SELECT COUNT(*) as c FROM extractions WHERE study_id = ?", (sid,)).fetchone()
            n_extractions = ext_row["c"] if ext_row else 0
            rob_row = conn.execute("SELECT COUNT(*) as c FROM rob_assessments WHERE study_id = ?", (sid,)).fetchone()
            n_rob = rob_row["c"] if rob_row else 0
            pdf_row = conn.execute("SELECT COUNT(*) as c FROM pdf_documents WHERE study_id = ?", (sid,)).fetchone()
            has_pdf = bool(c["pdf_path"]) or (pdf_row and pdf_row["c"] > 0)
            n_pdf = 1 if has_pdf else 0

            # Also check if manual screening status changed
            if c["screening_status"] in ("included", "excluded"):
                n_decisions = max(n_decisions, 1)

            total_screening_decisions += n_decisions
            total_extractions += n_extractions
            total_rob += n_rob
            total_pdfs += n_pdf

            studies_to_remove.append({
                "study_id": sid,
                "title": title,
                "screening_status": c["screening_status"],
                "has_downstream": (n_decisions > 0 or n_extractions > 0 or n_rob > 0 or n_pdf > 0),
            })

    downstream_work = {
        "screening_decisions_count": total_screening_decisions,
        "extractions_count": total_extractions,
        "rob_assessments_count": total_rob,
        "pdfs_count": total_pdfs,
    }
    has_downstream = any(v > 0 for v in downstream_work.values())

    return UndoImpactPreviewResponse(
        batch_id=batch_id,
        filename=batch["filename"],
        status=batch["status"],
        can_undo=True,
        blocking_reason=None,
        studies_to_remove_count=len(studies_to_remove),
        studies_to_remove=studies_to_remove,
        studies_retained_count=len(studies_retained),
        studies_retained=studies_retained,
        downstream_work=downstream_work,
        has_downstream_work=has_downstream,
    )


@router.post("/projects/{project_id}/batches/{batch_id}/undo", response_model=UndoBatchResponse)
async def undo_import_batch(
    project_id: str,
    batch_id: str,
    force: bool = False,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)
):
    """Safely and atomically undo an import batch, protecting shared studies and downstream work."""
    check_project_access(conn, project_id, user, min_role="editor")
    batch = conn.execute(
        "SELECT * FROM import_batches WHERE batch_id = ? AND project_id = ?",
        (batch_id, project_id)
    ).fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    # Idempotent: repeated undo requests return safely
    if batch["status"] == "undone":
        return UndoBatchResponse(
            batch_id=batch_id,
            status="undone",
            undone_at=batch["undone_at"] or "",
            studies_removed_count=0,
            studies_retained_count=0,
            message=f"Import of {batch['filename']} was already undone."
        )

    # Preview to verify studies to remove vs retain
    contributions = conn.execute(
        """SELECT bsc.study_id, s.title, s.screening_status, s.pdf_path
           FROM batch_study_contributions bsc
           LEFT JOIN studies s ON bsc.study_id = s.study_id
           WHERE bsc.batch_id = ? AND bsc.project_id = ?""",
        (batch_id, project_id)
    ).fetchall()

    studies_to_remove_ids = []
    studies_retained_ids = []
    has_downstream_work = False

    for c in contributions:
        sid = c["study_id"]
        if not c["title"]:
            continue

        other_active = conn.execute(
            """SELECT ib.batch_id
               FROM batch_study_contributions bsc
               JOIN import_batches ib ON bsc.batch_id = ib.batch_id
               WHERE bsc.study_id = ? AND bsc.batch_id != ? AND ib.status != 'undone' AND ib.project_id = ?""",
            (sid, batch_id, project_id)
        ).fetchall()

        if other_active:
            studies_retained_ids.append(sid)
        else:
            # Check downstream work
            dec_row = conn.execute("SELECT COUNT(*) as c FROM screening_decisions WHERE study_id = ?", (sid,)).fetchone()
            n_dec = dec_row["c"] if dec_row else 0
            ext_row = conn.execute("SELECT COUNT(*) as c FROM extractions WHERE study_id = ?", (sid,)).fetchone()
            n_ext = ext_row["c"] if ext_row else 0
            rob_row = conn.execute("SELECT COUNT(*) as c FROM rob_assessments WHERE study_id = ?", (sid,)).fetchone()
            n_rob = rob_row["c"] if rob_row else 0
            if n_dec > 0 or n_ext > 0 or n_rob > 0 or c["screening_status"] in ("included", "excluded"):
                has_downstream_work = True
            studies_to_remove_ids.append(sid)

    if has_downstream_work and not force:
        raise HTTPException(
            status_code=409,
            detail="Cannot undo batch without explicit confirmation: one or more studies have active downstream screening decisions, extractions, or risk-of-bias assessments. Please review the undo preview and confirm force=true."
        )

    # Atomic removal in transaction
    for sid in studies_to_remove_ids:
        for bookmark in conn.query("user_review_state", {"study_id": sid, "stage": "bookmark"}):
            conn.delete("user_review_state", bookmark["state_id"])
        for table, pk in (("record_annotations", "annotation_id"), ("study_tag_links", "link_id")):
            for row in conn.query(table, {"study_id": sid}):
                conn.delete(table, row[pk])
        # Clean downstream rows
        conn.execute("DELETE FROM screening_decisions WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM screening_conflicts WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM extractions WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM extraction_decisions WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM rob_assessments WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM pdf_highlights WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM pdf_documents WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM clarification_questions WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM meta_analysis_studies WHERE study_id = ?", (sid,))
        conn.execute("DELETE FROM studies WHERE study_id = ?", (sid,))

    now_iso = datetime.utcnow().strftime("%d %b %Y %H:%M UTC")
    conn.execute(
        "UPDATE import_batches SET status = 'undone', undone_at = ? WHERE batch_id = ? AND project_id = ?",
        (now_iso, batch_id, project_id)
    )
    conn.commit()

    return UndoBatchResponse(
        batch_id=batch_id,
        status="undone",
        undone_at=now_iso,
        studies_removed_count=len(studies_to_remove_ids),
        studies_retained_count=len(studies_retained_ids),
        message=f"Batch {batch['filename']} successfully undone on {now_iso}. Removed {len(studies_to_remove_ids)} studies ({len(studies_retained_ids)} retained from other active batches)."
    )


# ═══════════════════════════════════════════════════════════════════════
#  Project Member Management (roles-based access control)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List all members of a project."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")
    rows = conn.execute(
        """SELECT pm.user_id, pm.role, pm.joined_at,
                  u.username, u.email
           FROM project_members pm
           JOIN users u ON pm.user_id = u.user_id
           WHERE pm.project_id = ?
           ORDER BY pm.joined_at ASC""",
        (project_id,),
    ).fetchall()
    return [ProjectMemberResponse(**dict(r)) for r in rows]


@router.post("/projects/{project_id}/members", response_model=ProjectMemberResponse)
async def add_project_member(
    project_id: str,
    body: ProjectMemberInvite,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Invite a user to a project (owner only)."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="owner")

    # Find user by username
    user_row = conn.execute(
        "SELECT user_id, username, email FROM users WHERE username = ?", (body.username,)
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail=f"User '{body.username}' not found")

    if body.role not in ("owner", "editor", "reviewer", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be: owner, editor, reviewer, or viewer")

    member_id = str(uuid.uuid4())
    try:
        conn.execute(
            """INSERT INTO project_members (member_id, project_id, user_id, role, invited_by)
               VALUES (?, ?, ?, ?, ?)""",
            (member_id, project_id, user_row["user_id"],
             body.role, user["user_id"] if user else "system"),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="User is already a member of this project")

    return ProjectMemberResponse(
        user_id=user_row["user_id"],
        username=user_row["username"],
        email=user_row["email"],
        role=body.role,
        joined_at="",
    )


@router.put("/projects/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
async def update_project_member(
    project_id: str,
    user_id: str,
    body: ProjectMemberUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Change a member's role (owner only)."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="owner")

    if body.role not in ("owner", "editor", "reviewer", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be: owner, editor, reviewer, or viewer")

    cursor = conn.execute(
        "UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?",
        (body.role, project_id, user_id),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    conn.commit()

    member = conn.execute(
        """SELECT pm.user_id, pm.role, pm.joined_at, u.username, u.email
           FROM project_members pm JOIN users u ON pm.user_id = u.user_id
           WHERE pm.project_id = ? AND pm.user_id = ?""",
        (project_id, user_id),
    ).fetchone()
    return ProjectMemberResponse(**dict(member))


@router.delete("/projects/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Remove a member from a project (owner only, cannot remove self)."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="owner")

    if user and user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself as owner")

    cursor = conn.execute(
        "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
        (project_id, user_id),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    conn.commit()
    return {"removed": True, "user_id": user_id}


# ═══════════════════════════════════════════════════════════════════════
#  Keyword Groups (customizable highlighting for screening)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/keyword-groups", response_model=list[KeywordGroupResponse])
async def list_keyword_groups(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List all keyword groups for a project."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="viewer")

    rows = conn.execute(
        "SELECT * FROM keyword_groups WHERE project_id = ? ORDER BY created_at ASC",
        (project_id,),
    ).fetchall()

    result = []
    for r in rows:
        result.append(KeywordGroupResponse(
            group_id=r["group_id"],
            project_id=r["project_id"],
            name=r["name"],
            color=r["color"],
            keywords=json.loads(r["keywords_json"]) if r["keywords_json"] else [],
            created_at=r["created_at"] or "",
            updated_at=r["updated_at"] or "",
        ))
    return result


@router.post("/projects/{project_id}/keyword-groups", response_model=KeywordGroupResponse)
async def create_keyword_group(
    project_id: str,
    body: KeywordGroupCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a new keyword group for customizable highlighting."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    group_id = str(uuid.uuid4())
    keywords_json = json.dumps(body.keywords)
    conn.execute(
        """INSERT INTO keyword_groups (group_id, project_id, name, color, keywords_json)
           VALUES (?, ?, ?, ?, ?)""",
        (group_id, project_id, body.name, body.color, keywords_json),
    )
    conn.commit()

    return KeywordGroupResponse(
        group_id=group_id,
        project_id=project_id,
        name=body.name,
        color=body.color,
        keywords=body.keywords,
    )


@router.put("/projects/{project_id}/keyword-groups/{group_id}", response_model=KeywordGroupResponse)
async def update_keyword_group(
    project_id: str,
    group_id: str,
    body: KeywordGroupUpdate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Update a keyword group."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    existing = conn.execute(
        "SELECT * FROM keyword_groups WHERE group_id = ? AND project_id = ?",
        (group_id, project_id),
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Keyword group not found")

    name = body.name if body.name is not None else existing["name"]
    color = body.color if body.color is not None else existing["color"]
    keywords = body.keywords if body.keywords is not None else json.loads(existing["keywords_json"] or "[]")
    keywords_json = json.dumps(keywords)

    conn.execute(
        """UPDATE keyword_groups SET name = ?, color = ?, keywords_json = ?,
           updated_at = datetime('now') WHERE group_id = ?""",
        (name, color, keywords_json, group_id),
    )
    conn.commit()

    return KeywordGroupResponse(
        group_id=group_id,
        project_id=project_id,
        name=name,
        color=color,
        keywords=keywords,
    )


@router.delete("/projects/{project_id}/keyword-groups/{group_id}")
async def delete_keyword_group(
    project_id: str,
    group_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Delete a keyword group."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user, min_role="editor")

    cursor = conn.execute(
        "DELETE FROM keyword_groups WHERE group_id = ? AND project_id = ?",
        (group_id, project_id),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Keyword group not found")
    conn.commit()
    return {"deleted": True, "group_id": group_id}
