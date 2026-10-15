"""Screening router: title/abstract and full-text screening, dedup, multi-reviewer."""
from __future__ import annotations
import json
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Depends
from typing import Optional
import sqlite3

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user, get_current_user_optional, check_project_access
from models import (
    DeduplicationResult, DuplicateResolveRequest,
    ExclusionReason, ExclusionReasonsUpdate, ExclusionReasonsResponse,
    ScreeningConfig, ScreeningConfigUpdate, ScreeningConfigResponse,
    ScreeningDecisionCreate, ScreeningDecisionResponse,
    ScreeningConflictResponse, ConflictResolveRequest,
    AIPrioritizationResult,
    PicoHighlightResponse,
    ActiveLearningFeedbackRequest,
    ReviewerAgreementResponse,
    ScreeningUpdate,
    SignalSet,
    SignalSetResponse,
    AiScreenResult,
    HighlightSpan,
    AbstractHighlightsResponse,
    ScreeningKeywordCreate,
    ScreeningKeywordResponse,
)
from services.signal_generator import generate_signals
from services.signal_prefilter import prefilter_study
from services.safety_net import apply_overrides
from services.keyword_highlight_service import (
    extract_pico_highlights,
    find_keyword_matches,
    merge_and_sort_spans,
    resolve_character_spans,
    auto_generate_keywords_from_pico,
    auto_generate_keywords_from_protocol,
    DEFAULT_INCLUDE_KEYWORDS,
    DEFAULT_EXCLUDE_KEYWORDS,
)

router = APIRouter(prefix="/api", tags=["screening"])


@router.get("/projects/{project_id}/screening")
async def list_screening(
    project_id: str,
    stage: Optional[str] = Query(None, description="Filter by stage: ta, ft, or all"),
    status: Optional[str] = Query(None, description="Filter by status: pending, included, excluded"),
    conn: DBBackend = Depends(get_db),
):
    query = "SELECT * FROM studies WHERE project_id = ?"
    params = [project_id]
    if stage and stage != "all":
        query += " AND screening_stage = ?"
        params.append(stage)
    if status:
        query += " AND screening_status = ?"
        params.append(status)
    query += " ORDER BY title"
    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.put("/studies/{study_id}/screening")
async def update_screening(
    study_id: str,
    body: ScreeningUpdate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    conn: DBBackend = Depends(get_db),
):
    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    check_project_access(conn, row["project_id"], user, min_role="reviewer")
    if body.status in ("included", "excluded", "maybe"):
        await create_screening_decision(study_id, ScreeningDecisionCreate(
            study_id=study_id, project_id=row["project_id"], decision=body.status,
            stage=body.stage, reason_text=body.reason,
        ), background_tasks, user, conn)
        return dict(conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone())

    conn.execute(
        """UPDATE studies
           SET screening_status = ?, screening_stage = ?, screening_reason = ?
           WHERE study_id = ?""",
        (body.status, body.stage, body.reason, study_id),
    )
    conn.commit()

    # Auto-create + AI-prefill RoB when a study is included at full-text stage
    if body.status == "included" and body.stage == "ft":
        from services import rob_service
        background_tasks.add_task(
            rob_service.auto_assess_study, study_id, row["project_id"],
        )

    row = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    return dict(row)


@router.get("/projects/{project_id}/screening/summary")
async def screening_summary(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """PRISMA-style screening counts."""
    total = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ?", (project_id,)
    ).fetchone()["c"]

    ta_included = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND (screening_status = 'ta_included' OR (screening_stage = 'ta' AND screening_status = 'included'))",
        (project_id,),
    ).fetchone()["c"]

    ta_excluded = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ta' AND screening_status = 'excluded'",
        (project_id,),
    ).fetchone()["c"]

    ft_included = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'included'",
        (project_id,),
    ).fetchone()["c"]

    ft_excluded = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'excluded'",
        (project_id,),
    ).fetchone()["c"]

    pending = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'pending'",
        (project_id,),
    ).fetchone()["c"]

    uncertain_count = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'uncertain'",
        (project_id,),
    ).fetchone()["c"]

    awaiting_pdf_count = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'awaiting_pdf'",
        (project_id,),
    ).fetchone()["c"]

    high_confidence_count = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND ai_confidence >= 0.80",
        (project_id,),
    ).fetchone()["c"]

    medium_confidence_count = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND ai_confidence >= 0.60 AND ai_confidence < 0.80",
        (project_id,),
    ).fetchone()["c"]

    low_confidence_count = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND ai_confidence < 0.60 AND ai_screened_at != ''",
        (project_id,),
    ).fetchone()["c"]

    ai_screened = conn.execute(
        "SELECT COUNT(DISTINCT study_id) as c FROM screening_decisions WHERE project_id = ? AND reviewer_id IN ('ai_reviewer', 'ai_screener')",
        (project_id,),
    ).fetchone()["c"]

    human_screened = conn.execute(
        "SELECT COUNT(DISTINCT study_id) as c FROM screening_decisions WHERE project_id = ? AND reviewer_id NOT IN ('ai_reviewer', 'ai_screener')",
        (project_id,),
    ).fetchone()["c"]

    ai_human_conflicts = conn.execute(
        "SELECT COUNT(*) as c FROM screening_conflicts WHERE project_id = ? AND status = 'unresolved' AND ((reviewer1_id IN ('ai_reviewer', 'ai_screener') AND reviewer2_id NOT IN ('ai_reviewer', 'ai_screener')) OR (reviewer2_id IN ('ai_reviewer', 'ai_screener') AND reviewer1_id NOT IN ('ai_reviewer', 'ai_screener')))",
        (project_id,),
    ).fetchone()["c"]

    safety_net_overrides = conn.execute(
        "SELECT COUNT(*) as c FROM screening_decisions WHERE project_id = ? AND reviewer_id IN ('ai_reviewer', 'ai_screener') AND reason_text LIKE '%[SAFETY-NET%'",
        (project_id,),
    ).fetchone()["c"]

    awaiting_clarification = conn.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'awaiting_clarification'",
        (project_id,),
    ).fetchone()["c"]

    clarifications_pending = conn.execute(
        "SELECT COUNT(*) as c FROM clarification_questions WHERE project_id = ? AND status = 'pending'",
        (project_id,),
    ).fetchone()["c"]

    clarifications_answered = conn.execute(
        "SELECT COUNT(*) as c FROM clarification_questions WHERE project_id = ? AND status = 'answered'",
        (project_id,),
    ).fetchone()["c"]

    return {
        "project_id": project_id,
        "total": total,
        "ta_included": ta_included,
        "ta_excluded": ta_excluded,
        "ft_included": ft_included,
        "ft_excluded": ft_excluded,
        "pending": pending,
        "uncertain": uncertain_count,
        "awaiting_clarification": awaiting_clarification,
        "awaiting_pdf": awaiting_pdf_count,
        "ai_screened": ai_screened,
        "high_confidence": high_confidence_count,
        "medium_confidence": medium_confidence_count,
        "low_confidence": low_confidence_count,
        "human_screened": human_screened,
        "ai_human_conflicts": ai_human_conflicts,
        "safety_net_overrides": safety_net_overrides,
        "clarifications_pending": clarifications_pending,
        "clarifications_answered": clarifications_answered,
    }


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Duplicate Detection
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/studies/deduplicate", response_model=DeduplicationResult)
async def deduplicate_studies(
    project_id: str,
    auto_mark: bool = Query(True, description="Mark duplicates in the database"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Detect and optionally mark duplicate studies using DOI, PMID, exact title,
    then normalized title plus first author and year."""
    check_project_access(conn, project_id, user)
    from services.dedup_service import deduplicate_studies as _dedup

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    result = _dedup(project_id, auto_mark=auto_mark)
    return DeduplicationResult(**result)


@router.get("/projects/{project_id}/studies/duplicates", response_model=DeduplicationResult)
async def get_duplicate_studies(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Fetch duplicate candidate groups without marking or altering study records."""
    check_project_access(conn, project_id, user)
    from services.dedup_service import deduplicate_studies as _dedup

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    result = _dedup(project_id, auto_mark=False, db=conn)
    return DeduplicationResult(**result)


@router.post("/projects/{project_id}/studies/deduplicate/resolve")
async def resolve_duplicate(
    project_id: str,
    payload: DuplicateResolveRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Resolve duplicate review decision for a pair or group:
    - keep_primary: Keep primary, mark candidate as duplicate
    - keep_both: Reversibly unmark duplicate, retaining both studies
    - merge_metadata: Merge non-empty fields to primary and mark duplicate
    - revert_duplicate: Reversible duplicate restoration
    """
    check_project_access(conn, project_id, user)
    from services.dedup_service import resolve_duplicate_decision

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        res = resolve_duplicate_decision(
            project_id=project_id,
            action=payload.action,
            primary_study_id=payload.primary_study_id,
            duplicate_study_id=payload.duplicate_study_id,
            group_id=payload.group_id,
            merged_fields=payload.merged_fields,
            db=conn,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Exclusion Reason Taxonomy
# ═══════════════════════════════════════════════════════════════════════

# Predefined radiology SR exclusion reasons
DEFAULT_EXCLUSION_REASONS = [
    ExclusionReason(code="wrong_population", label="Wrong population"),
    ExclusionReason(code="wrong_index_test", label="Wrong index test / imaging modality"),
    ExclusionReason(code="wrong_comparator", label="Wrong comparator / reference standard"),
    ExclusionReason(code="wrong_outcome", label="Wrong outcome / target condition"),
    ExclusionReason(code="wrong_study_design", label="Wrong study design"),
    ExclusionReason(code="no_full_text", label="Full text not available"),
    ExclusionReason(code="duplicate", label="Duplicate publication"),
    ExclusionReason(code="conference_abstract", label="Conference abstract only"),
    ExclusionReason(code="no_data", label="No extractable data"),
    ExclusionReason(code="review_article", label="Review article / editorial"),
    ExclusionReason(code="animal_study", label="Animal / phantom study"),
    ExclusionReason(code="language_non_english", label="Non-English language"),
    ExclusionReason(code="wrong_setting", label="Wrong clinical setting"),
    ExclusionReason(code="other", label="Other (specify in reason text)"),
]


@router.get("/projects/{project_id}/exclusion-reasons", response_model=ExclusionReasonsResponse)
async def get_exclusion_reasons(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the exclusion reason taxonomy for a project.
    Returns custom reasons if defined, otherwise returns defaults."""
    row = conn.execute(
        "SELECT exclusion_reasons_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    reasons = []
    if row["exclusion_reasons_json"]:
        try:
            data = json.loads(row["exclusion_reasons_json"])
            reasons = [ExclusionReason(**r) for r in data]
        except (json.JSONDecodeError, TypeError):
            pass

    # Fall back to defaults if empty
    if not reasons:
        reasons = DEFAULT_EXCLUSION_REASONS

    return ExclusionReasonsResponse(project_id=project_id, reasons=reasons)


@router.put("/projects/{project_id}/exclusion-reasons", response_model=ExclusionReasonsResponse)
async def update_exclusion_reasons(project_id: str, body: ExclusionReasonsUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Update the exclusion reason taxonomy for a project."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    reasons_json = json.dumps([r.model_dump() for r in body.reasons])
    conn.execute(
        "UPDATE projects SET exclusion_reasons_json = ? WHERE project_id = ?",
        (reasons_json, project_id),
    )
    conn.commit()
    return ExclusionReasonsResponse(project_id=project_id, reasons=body.reasons)


@router.post("/projects/{project_id}/exclusion-reasons/reset", response_model=ExclusionReasonsResponse)
async def reset_exclusion_reasons(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Reset exclusion reasons to the default taxonomy."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    defaults = DEFAULT_EXCLUSION_REASONS
    reasons_json = json.dumps([r.model_dump() for r in defaults])
    conn.execute(
        "UPDATE projects SET exclusion_reasons_json = ? WHERE project_id = ?",
        (reasons_json, project_id),
    )
    conn.commit()
    return ExclusionReasonsResponse(project_id=project_id, reasons=defaults)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Multi-Reviewer Screening Config
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/screening-config", response_model=ScreeningConfigResponse)
async def get_screening_config(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the multi-reviewer screening configuration for a project."""
    row = conn.execute(
        "SELECT screening_config_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    config = {"blind_mode": True, "n_reviewers": 2, "conflict_mode": "manual"}
    if row["screening_config_json"]:
        try:
            config = json.loads(row["screening_config_json"])
        except (json.JSONDecodeError, TypeError):
            pass

    return ScreeningConfigResponse(
        project_id=project_id,
        blind_mode=config.get("blind_mode", True),
        n_reviewers=config.get("n_reviewers", 2),
        conflict_mode=config.get("conflict_mode", "manual"),
    )


@router.put("/projects/{project_id}/screening-config", response_model=ScreeningConfigResponse)
async def update_screening_config(project_id: str, body: ScreeningConfigUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Update the multi-reviewer screening configuration."""
    row = conn.execute(
        "SELECT screening_config_json FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    config = {"blind_mode": True, "n_reviewers": 2, "conflict_mode": "manual"}
    if row["screening_config_json"]:
        try:
            config = json.loads(row["screening_config_json"])
        except (json.JSONDecodeError, TypeError):
            pass

    if body.blind_mode is not None:
        config["blind_mode"] = body.blind_mode
    if body.n_reviewers is not None:
        config["n_reviewers"] = body.n_reviewers
    if body.conflict_mode is not None:
        config["conflict_mode"] = body.conflict_mode

    conn.execute(
        "UPDATE projects SET screening_config_json = ? WHERE project_id = ?",
        (json.dumps(config), project_id),
    )
    conn.commit()
    return ScreeningConfigResponse(
        project_id=project_id,
        blind_mode=config["blind_mode"],
        n_reviewers=config["n_reviewers"],
        conflict_mode=config["conflict_mode"],
    )


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Multi-Reviewer Screening Decisions
# ═══════════════════════════════════════════════════════════════════════

def _check_and_record_conflict(
    conn: Any,
    study_id: str,
    project_id: str,
    stage: str,
    latest_decision: Optional[str] = None,
    reason_text: Optional[str] = None,
) -> bool:
    """Auto-detect conflicts or sync consensus decisions for a study stage.

    Returns True if conflict is detected/unresolved, False otherwise.
    """
    raw_decisions = conn.execute(
        """SELECT * FROM screening_decisions
           WHERE study_id = ? AND stage = ?""",
        (study_id, stage),
    ).fetchall()

    all_decisions = [dict(d) for d in raw_decisions]

    conflict_detected = False
    decisions_set = {d["decision"] for d in all_decisions}
    if latest_decision:
        decisions_set.add(latest_decision)

    if len(decisions_set) > 1 and len(all_decisions) >= 1:
        conflict_detected = True
        existing_conflict = conn.execute(
            """SELECT * FROM screening_conflicts
               WHERE study_id = ? AND stage = ? AND status = 'unresolved'""",
            (study_id, stage),
        ).fetchone()

        if not existing_conflict:
            r1_id = all_decisions[0].get("reviewer_id", "reviewer1")
            r1_dec = all_decisions[0].get("decision", "uncertain")
            r2_id = all_decisions[1].get("reviewer_id", "ai_reviewer") if len(all_decisions) > 1 else "ai_reviewer"
            r2_dec = all_decisions[1].get("decision", latest_decision or "uncertain") if len(all_decisions) > 1 else (latest_decision or "uncertain")

            conn.execute(
                """INSERT INTO screening_conflicts
                   (conflict_id, study_id, project_id, stage,
                    reviewer1_id, reviewer1_decision,
                    reviewer2_id, reviewer2_decision, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unresolved')""",
                (str(uuid.uuid4()), study_id, project_id, stage,
                 r1_id, r1_dec, r2_id, r2_dec),
            )
    elif len(all_decisions) >= 2 and len(decisions_set) == 1:
        # All agree — resolve any existing conflict and update study status
        decision = latest_decision or all_decisions[0]["decision"]
        conn.execute(
            """UPDATE screening_conflicts SET
               status = 'resolved', resolution = ?,
               resolved_by = 'auto', resolved_at = datetime('now')
               WHERE study_id = ? AND stage = ? AND status = 'unresolved'""",
            (decision, study_id, stage),
        )
        # Update study screening status
        reason_val = reason_text or all_decisions[0].get("reason_text") or all_decisions[0].get("reason_code") or ""
        conn.execute(
            """UPDATE studies SET
               screening_status = ?, screening_stage = ?,
               screening_reason = ?
               WHERE study_id = ?""",
            (decision, stage, reason_val, study_id),
        )

    if hasattr(conn, "commit"):
        conn.commit()

    return conflict_detected


@router.post("/studies/{study_id}/screening-decision", response_model=ScreeningDecisionResponse)
async def create_screening_decision(
    study_id: str,
    body: ScreeningDecisionCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    conn: DBBackend = Depends(get_db),
):
    """Record a single reviewer's screening decision for a study.
    In blind mode, other reviewers' decisions are not visible.
    Conflicts are auto-detected when 2+ reviewers disagree."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user, min_role="reviewer")
    if body.study_id != study_id:
        raise HTTPException(status_code=400, detail="study_id mismatch")

    study = conn.execute(
        "SELECT * FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    if body.project_id != study["project_id"]:
        raise HTTPException(status_code=400, detail="project_id mismatch")
    record_stage = study["screening_stage"] or ""
    if not record_stage:
        record_stage = "ft" if study["screening_status"] == "awaiting_pdf" else "ta"
    if record_stage not in ("ta", "ft"):
        raise HTTPException(status_code=409, detail="Record has an invalid screening stage. Refresh before saving.")
    if body.stage != record_stage:
        raise HTTPException(status_code=409, detail="Screening stage changed or does not match this record. Refresh before saving.")

    reviewer_id = user["user_id"]
    reviewer_name = user["username"]

    # Get screening config for blind mode
    proj = conn.execute(
        "SELECT screening_config_json FROM projects WHERE project_id = ?",
        (body.project_id,),
    ).fetchone()
    blind_mode = True
    if proj and proj["screening_config_json"]:
        try:
            cfg = json.loads(proj["screening_config_json"])
            blind_mode = cfg.get("blind_mode", True)
        except (json.JSONDecodeError, TypeError):
            pass

    # Check if this reviewer already has a decision for this study+stage
    existing = conn.execute(
        """SELECT * FROM screening_decisions
           WHERE study_id = ? AND reviewer_id = ? AND stage = ?""",
        (study_id, reviewer_id, body.stage),
    ).fetchone()

    decision_id = str(uuid.uuid4())

    if existing:
        # Update existing decision
        conn.execute(
            """UPDATE screening_decisions SET
               decision = ?, reason_code = ?, reason_text = ?, is_blinded = ?, reviewer_name = ?
               WHERE decision_id = ?""",
            (body.decision, body.reason_code, body.reason_text,
             1 if blind_mode else 0, reviewer_name, existing["decision_id"]),
        )
        decision_id = existing["decision_id"]
    else:
        conn.execute(
            """INSERT INTO screening_decisions
               (decision_id, study_id, project_id, reviewer_id, reviewer_name,
                decision, reason_code, reason_text, stage, is_blinded)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (decision_id, study_id, body.project_id, reviewer_id,
             reviewer_name, body.decision, body.reason_code, body.reason_text,
             body.stage, 1 if blind_mode else 0),
        )

    # Auto-detect conflicts via shared helper
    _check_and_record_conflict(
        conn, study_id, body.project_id, body.stage,
        latest_decision=body.decision,
        reason_text=body.reason_text or body.reason_code,
    )

    # Always update study screening status (single or multi reviewer)
    conn.execute(
        """UPDATE studies SET
           screening_status = ?, screening_stage = ?,
           screening_reason = ?
           WHERE study_id = ?""",
        (body.decision, body.stage,
         body.reason_text or body.reason_code, study_id),
    )

    # Auto-create + AI-prefill RoB on full-text inclusion
    if body.decision == "included" and body.stage == "ft":
        from services import rob_service
        background_tasks.add_task(
            rob_service.auto_assess_study, study_id, body.project_id,
        )

    # Laya background verification of exclusion reason for PRISMA audit
    if body.decision == "excluded" and (body.reason_text or body.reason_code):
        from services.prisma_service import verify_exclusion_with_laya
        try:
            title = study["title"] if "title" in study.keys() else ""
            abstract = study["abstract"] if "abstract" in study.keys() else ""
        except Exception:
            title = getattr(study, "title", "") or ""
            abstract = getattr(study, "abstract", "") or ""
        reason_to_verify = body.reason_text or body.reason_code or ""
        background_tasks.add_task(
            verify_exclusion_with_laya, title, abstract, reason_to_verify,
        )

    if hasattr(conn, "commit"):
        conn.commit()

    row = conn.execute(
        "SELECT * FROM screening_decisions WHERE decision_id = ?", (decision_id,)
    ).fetchone()
    return ScreeningDecisionResponse(**dict(row))


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Rayyan-Style Keyword Highlighting & Management
# ═══════════════════════════════════════════════════════════════════════

@router.get("/studies/{study_id}/abstract-highlights", response_model=AbstractHighlightsResponse)
async def get_abstract_highlights(
    study_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Returns combined highlight spans for an abstract:
    - PICO spans (purple/blue/orange)
    - Include keyword spans (green)
    - Exclude keyword spans (red)
    - AI-identified keyword spans
    """
    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    s_dict = dict(study)
    project_id = s_dict["project_id"]
    check_project_access(conn, project_id, user)
    abstract = s_dict.get("abstract") or ""

    title = s_dict.get("title") or ""

    # Project keywords from screening_keywords table (or protocol-derived if none)
    kw_rows = conn.execute(
        "SELECT * FROM screening_keywords WHERE project_id = ?", (project_id,)
    ).fetchall()

    if kw_rows:
        keywords = [dict(r) for r in kw_rows]
    else:
        # Load project to derive protocol-matched keywords
        proj_row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        proto_kws = auto_generate_keywords_from_protocol(dict(proj_row) if proj_row else {})
        keywords = [
            {"keyword": k, "keyword_type": "include"} for k in proto_kws.get("include_keywords", [])
        ] + [
            {"keyword": k, "keyword_type": "exclude"} for k in proto_kws.get("exclude_keywords", [])
        ]

    title_spans = find_keyword_matches(title, keywords) if title else []

    if not abstract.strip():
        # Title can still have keyword highlights
        return AbstractHighlightsResponse(
            study_id=study_id,
            abstract="",
            all_spans=[],
            pico_spans=[],
            keyword_spans=[],
            ai_keyword_spans=[],
            title_spans=[HighlightSpan(**s) for s in title_spans],
        )

    # 1. PICO spans
    pico_spans = extract_pico_highlights(abstract)

    keyword_spans = find_keyword_matches(abstract, keywords)
    title_spans = find_keyword_matches(title, keywords) if title else []

    # 3. AI-identified keywords from latest AI screening decision if any
    ai_dec = conn.execute(
        """SELECT * FROM screening_decisions
           WHERE study_id = ? AND reviewer_id IN ('ai_screener', 'ai_reviewer')
           ORDER BY created_at DESC LIMIT 1""",
        (study_id,),
    ).fetchone()

    ai_keyword_spans = []
    if ai_dec:
        d = dict(ai_dec)
        ai_kws = []
        if d.get("reason_text"):
            pass

    # Resolve character spans by priority so include/exclude keywords are NEVER swallowed by PICO spans
    all_spans = resolve_character_spans(abstract, pico_spans, keyword_spans, ai_keyword_spans)
    if not all_spans and (pico_spans or keyword_spans or ai_keyword_spans):
        all_spans = merge_and_sort_spans(pico_spans, keyword_spans, ai_keyword_spans)

    return AbstractHighlightsResponse(
        study_id=study_id,
        abstract=abstract,
        all_spans=[HighlightSpan(**s) for s in all_spans],
        pico_spans=[HighlightSpan(**s) for s in pico_spans],
        keyword_spans=[HighlightSpan(**s) for s in keyword_spans],
        ai_keyword_spans=[HighlightSpan(**s) for s in ai_keyword_spans],
        title_spans=[HighlightSpan(**s) for s in title_spans],
    )


@router.get("/projects/{project_id}/screening-keywords", response_model=list[ScreeningKeywordResponse])
async def list_screening_keywords(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List all include/exclude screening keywords for a project."""
    check_project_access(conn, project_id, user)
    rows = conn.execute(
        "SELECT * FROM screening_keywords WHERE project_id = ? ORDER BY keyword_type, keyword",
        (project_id,),
    ).fetchall()

    if not rows:
        # Initialize keywords directly from project protocol
        proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        proto_kws = auto_generate_keywords_from_protocol(dict(proj) if proj else {})
        defaults = []
        for kw in proto_kws.get("include_keywords", []):
            kid = str(uuid.uuid4())
            if proj:
                conn.execute(
                    "INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, color) VALUES (?, ?, ?, 'include', 'green')",
                    (kid, project_id, kw),
                )
            defaults.append(ScreeningKeywordResponse(keyword_id=kid, project_id=project_id, keyword=kw, keyword_type="include", color="green"))
        for kw in proto_kws.get("exclude_keywords", []):
            kid = str(uuid.uuid4())
            if proj:
                conn.execute(
                    "INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, color) VALUES (?, ?, ?, 'exclude', 'red')",
                    (kid, project_id, kw),
                )
            defaults.append(ScreeningKeywordResponse(keyword_id=kid, project_id=project_id, keyword=kw, keyword_type="exclude", color="red"))
        if proj and hasattr(conn, "commit"):
            conn.commit()
        return defaults

    return [
        ScreeningKeywordResponse(
            keyword_id=r["keyword_id"],
            project_id=r["project_id"],
            keyword=r["keyword"],
            keyword_type=r["keyword_type"],
            color=dict(r).get("color") or ("green" if r["keyword_type"] == "include" else "red"),
        )
        for r in rows
    ]


@router.post("/projects/{project_id}/screening-keywords", response_model=ScreeningKeywordResponse)
async def add_screening_keyword(
    project_id: str,
    body: ScreeningKeywordCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Add a new include/exclude keyword to a project."""
    check_project_access(conn, project_id, user)
    kw = body.keyword.strip()
    if not kw:
        raise HTTPException(status_code=400, detail="Keyword cannot be empty")

    kw_type = body.keyword_type.lower().strip()
    if kw_type not in ("include", "exclude"):
        raise HTTPException(status_code=400, detail="keyword_type must be 'include' or 'exclude'")

    color = "green" if kw_type == "include" else "red"
    kid = str(uuid.uuid4())

    conn.execute(
        """INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, color)
           VALUES (?, ?, ?, ?, ?)""",
        (kid, project_id, kw, kw_type, color),
    )
    if hasattr(conn, "commit"):
        conn.commit()

    return ScreeningKeywordResponse(
        keyword_id=kid,
        project_id=project_id,
        keyword=kw,
        keyword_type=kw_type,
        color=color,
    )


@router.delete("/screening-keywords/{keyword_id}")
async def delete_screening_keyword(
    keyword_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Delete a screening keyword by ID."""
    row = conn.execute("SELECT * FROM screening_keywords WHERE keyword_id = ?", (keyword_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Screening keyword not found")

    check_project_access(conn, dict(row)["project_id"], user)
    conn.execute("DELETE FROM screening_keywords WHERE keyword_id = ?", (keyword_id,))
    if hasattr(conn, "commit"):
        conn.commit()

    return {"status": "deleted", "keyword_id": keyword_id}


@router.post("/projects/{project_id}/screening-keywords/auto-generate", response_model=list[ScreeningKeywordResponse])
async def auto_generate_keywords(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Auto-generate inclusion/exclusion keywords from project protocol (PICO, search strings, criteria)."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    generated = auto_generate_keywords_from_protocol(dict(proj))

    # Delete existing keywords for fresh generation
    conn.execute("DELETE FROM screening_keywords WHERE project_id = ?", (project_id,))

    results: list[ScreeningKeywordResponse] = []
    for kw in generated.get("include_keywords", []):
        kid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, color) VALUES (?, ?, ?, 'include', 'green')",
            (kid, project_id, kw),
        )
        results.append(ScreeningKeywordResponse(keyword_id=kid, project_id=project_id, keyword=kw, keyword_type="include", color="green"))

    for kw in generated.get("exclude_keywords", []):
        kid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO screening_keywords (keyword_id, project_id, keyword, keyword_type, color) VALUES (?, ?, ?, 'exclude', 'red')",
            (kid, project_id, kw),
        )
        results.append(ScreeningKeywordResponse(keyword_id=kid, project_id=project_id, keyword=kw, keyword_type="exclude", color="red"))

    if hasattr(conn, "commit"):
        conn.commit()

    return results


@router.get("/projects/{project_id}/screening-decisions")
async def list_screening_decisions(
    project_id: str,
    stage: Optional[str] = Query(None),
    reviewer_id: Optional[str] = Query(None),
    conn: DBBackend = Depends(get_db),
):
    """List all screening decisions for a project.
    In blind mode, only the requesting reviewer's decisions are shown
    (pass reviewer_id query param to filter)."""
    query = "SELECT * FROM screening_decisions WHERE project_id = ?"
    params = [project_id]
    if stage:
        query += " AND stage = ?"
        params.append(stage)
    if reviewer_id:
        query += " AND reviewer_id = ?"
        params.append(reviewer_id)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/studies/{study_id}/screening-decisions")
async def get_study_screening_decisions(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get all screening decisions for a single study."""
    rows = conn.execute(
        "SELECT * FROM screening_decisions WHERE study_id = ? ORDER BY created_at",
        (study_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Screening Conflicts
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/screening-conflicts")
async def list_screening_conflicts(
    project_id: str,
    status: Optional[str] = Query(None, description="unresolved or resolved"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """List screening conflicts for a project."""
    check_project_access(conn, project_id, user)
    query = """SELECT c.*, s.title as study_title
               FROM screening_conflicts c
               JOIN studies s ON c.study_id = s.study_id
               WHERE c.project_id = ?"""
    params = [project_id]
    if status:
        query += " AND c.status = ?"
        params.append(status)
    query += " ORDER BY c.created_at DESC"
    rows = conn.execute(query, params).fetchall()
    return [ScreeningConflictResponse(**dict(r)) for r in rows]


@router.put("/screening-conflicts/{conflict_id}/resolve", response_model=ScreeningConflictResponse)
async def resolve_conflict(conflict_id: str, body: ConflictResolveRequest, user: dict = Depends(get_current_user),
    conn: DBBackend = Depends(get_db)):
    """Resolve a screening conflict with a final decision."""
    row = conn.execute(
        "SELECT * FROM screening_conflicts WHERE conflict_id = ?", (conflict_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conflict not found")

    check_project_access(conn, row["project_id"], user, min_role="reviewer")

    conn.execute(
        """UPDATE screening_conflicts SET
           resolution = ?, resolved_by = ?, resolved_at = datetime('now'),
           status = 'resolved'
           WHERE conflict_id = ?""",
        (body.resolution, user["user_id"], conflict_id),
    )

    # Update the study's screening status to the resolved decision
    conn.execute(
        """UPDATE studies SET
           screening_status = ?, screening_stage = ?
           WHERE study_id = ?""",
        (body.resolution, row["stage"], row["study_id"]),
    )

    conn.commit()

    row = conn.execute(
        """SELECT c.*, s.title as study_title
           FROM screening_conflicts c
           JOIN studies s ON c.study_id = s.study_id
           WHERE c.conflict_id = ?""",
        (conflict_id,),
    ).fetchone()
    return ScreeningConflictResponse(**dict(row))


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: AI Screening Prioritization
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/screening/prioritize", response_model=AIPrioritizationResult)
async def prioritize_screening(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """AI-prioritize pending studies using TF-IDF + LogisticRegression
    trained on existing Include/Exclude decisions.
    Requires at least 20 decisions (10 include + 10 exclude)."""
    from services.ai_screening_service import prioritize_studies

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    result = prioritize_studies(project_id)
    return AIPrioritizationResult(**result)


@router.post("/projects/{project_id}/screening/feedback", response_model=AIPrioritizationResult)
async def submit_screening_feedback(project_id: str, body: ActiveLearningFeedbackRequest, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Submit reviewer correction for a misprioritized study (Active Learning feedback).
    Updates the study status and immediately retrains the classifier with active learning weights."""
    from services.ai_screening_service import submit_active_learning_feedback

    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    result = submit_active_learning_feedback(
        project_id=project_id,
        study_id=body.study_id,
        corrected_decision=body.corrected_decision,
        reviewer_id=body.reviewer_id,
    )
    return AIPrioritizationResult(**result)


@router.get("/projects/{project_id}/screening/agreement", response_model=ReviewerAgreementResponse)
async def get_reviewer_agreement(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Calculate inter-rater agreement (Cohen's Kappa & percentage agreement)
    across dual-screened studies in a project."""
    # Group decisions by study_id and stage
    check_project_access(conn, project_id, user)
    rows = conn.execute(
        """SELECT study_id, reviewer_id, decision
           FROM screening_decisions
           WHERE project_id = ? AND decision IN ('included', 'excluded')
           ORDER BY study_id, created_at""",
        (project_id,),
    ).fetchall()

    # Group by study_id
    study_decisions: dict[str, list[dict]] = {}
    for r in rows:
        study_decisions.setdefault(r["study_id"], []).append(dict(r))

    # Filter to studies with at least 2 distinct reviewers
    dual_studies = [
        decs for decs in study_decisions.values()
        if len({d["reviewer_id"] for d in decs}) >= 2
    ]

    total_dual = len(dual_studies)
    if total_dual == 0:
        return ReviewerAgreementResponse(
            project_id=project_id,
            cohen_kappa=0.0,
            percentage_agreement=0.0,
            concordant_includes=0,
            concordant_excludes=0,
            conflicts_count=0,
            total_dual_screened=0,
            interpretation="insufficient_data",
            pairwise_reviewers=[],
        )

    a = 0  # Both include
    d = 0  # Both exclude
    b = 0  # Reviewer 1 include, Reviewer 2 exclude
    c = 0  # Reviewer 1 exclude, Reviewer 2 include

    for decs in dual_studies:
        # Take the first two unique reviewer decisions
        seen_revs = set()
        pair = []
        for dec in decs:
            if dec["reviewer_id"] not in seen_revs:
                seen_revs.add(dec["reviewer_id"])
                pair.append(dec["decision"])
            if len(pair) == 2:
                break

        if len(pair) == 2:
            dec1, dec2 = pair[0], pair[1]
            if dec1 == "included" and dec2 == "included":
                a += 1
            elif dec1 == "excluded" and dec2 == "excluded":
                d += 1
            elif dec1 == "included" and dec2 == "excluded":
                b += 1
            elif dec1 == "excluded" and dec2 == "included":
                c += 1

    n = a + b + c + d
    if n == 0:
        pct_agree = 0.0
        kappa = 0.0
        interp = "insufficient_data"
    else:
        po = (a + d) / n
        pct_agree = round(po * 100.0, 1)

        # Expected agreement by chance
        p_inc = ((a + b) * (a + c)) / (n * n)
        p_exc = ((c + d) * (b + d)) / (n * n)
        pe = p_inc + p_exc

        if pe >= 1.0 or (1.0 - pe) == 0:
            kappa = 1.0 if po == 1.0 else 0.0
        else:
            kappa = round((po - pe) / (1.0 - pe), 3)

        # Interpretation guideline (Landis & Koch, 1977)
        if kappa < 0.20:
            interp = "slight_agreement"
        elif kappa < 0.40:
            interp = "fair_agreement"
        elif kappa < 0.60:
            interp = "moderate_agreement"
        elif kappa < 0.80:
            interp = "substantial_agreement"
        else:
            interp = "almost_perfect"

    return ReviewerAgreementResponse(
        project_id=project_id,
        cohen_kappa=max(-1.0, min(1.0, kappa)),
        percentage_agreement=pct_agree,
        concordant_includes=a,
        concordant_excludes=d,
        conflicts_count=b + c,
        total_dual_screened=n,
        interpretation=interp,
        pairwise_reviewers=[
            {"pair": "Reviewer 1 vs Reviewer 2", "a": a, "b": b, "c": c, "d": d, "kappa": kappa}
        ],
    )


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: PICO Highlighting in Abstracts
# ═══════════════════════════════════════════════════════════════════════

@router.get("/studies/{study_id}/pico-highlight", response_model=PicoHighlightResponse)
async def get_pico_highlight(study_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Extract PICO spans from a study's abstract for highlighting in the screening view.
    Returns character offsets and confidence scores for each PICO element found."""
    _pid = conn.execute("SELECT project_id FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if _pid: check_project_access(conn, _pid["project_id"], user)
    from services.pico_extractor import extract_pico_spans_from_abstract

    row = conn.execute(
        "SELECT study_id, abstract FROM studies WHERE study_id = ?", (study_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Study not found")

    abstract = row["abstract"] or ""
    spans = extract_pico_spans_from_abstract(abstract)

    return PicoHighlightResponse(
        study_id=study_id,
        abstract=abstract,
        spans=spans,
    )


@router.get("/projects/{project_id}/prisma/svg")
async def prisma_flow_svg(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """PRISMA 2020 flow diagram as an SVG image (R grid graphics)."""
    from services.r_plot_service import generate_prisma_flow
    from services.prisma_export_service import get_prisma_flow_data
    from fastapi.responses import Response

    check_project_access(conn, project_id, user)
    flow_data = get_prisma_flow_data(project_id, conn)
    svg = generate_prisma_flow(flow_data)
    if not svg:
        raise HTTPException(status_code=500, detail="PRISMA diagram generation failed")

    return Response(content=svg, media_type="image/svg+xml")


@router.get("/projects/{project_id}/prisma/png")
async def prisma_flow_png(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """PRISMA 2020 flow diagram as a downloadable PNG image."""
    from services.prisma_export_service import get_prisma_flow_data, render_prisma_png
    from fastapi.responses import Response

    check_project_access(conn, project_id, user)
    flow_data = get_prisma_flow_data(project_id, conn)
    png = render_prisma_png(flow_data)
    if not png:
        raise HTTPException(status_code=500, detail="PRISMA PNG generation failed")

    return Response(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="prisma_flow_{project_id}.png"'},
    )


@router.get("/projects/{project_id}/prisma/docx")
async def prisma_flow_docx(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """PRISMA 2020 flow diagram as an editable Word document.

    The DOCX embeds the diagram image plus native Word tables holding every
    count and exclusion reason, so numbers can be edited afterwards.
    """
    from services.prisma_export_service import (
        get_prisma_flow_data, render_prisma_png, render_prisma_docx,
    )
    from fastapi.responses import Response

    check_project_access(conn, project_id, user)
    flow_data = get_prisma_flow_data(project_id, conn)
    proj = conn.execute("SELECT name FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    project_name = proj["name"] if proj else ""
    png = render_prisma_png(flow_data)
    docx_bytes = render_prisma_docx(flow_data, project_name=project_name, png_bytes=png)

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="prisma_flow_{project_id}.docx"'},
    )


@router.get("/projects/{project_id}/prisma")
async def prisma_flow(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """PRISMA 2020 flow diagram data.

    Returns structured counts for each phase of the PRISMA flow:
    Identification → Screening → Eligibility → Inclusion.
    """
    check_project_access(conn, project_id, user)
    from services.prisma_export_service import get_prisma_flow_data
    return get_prisma_flow_data(project_id, conn)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Screening Signals & Batch AI Screening
# ═══════════════════════════════════════════════════════════════════════

@router.post("/projects/{project_id}/signals/generate", response_model=SignalSetResponse)
async def generate_project_signals(
    project_id: str,
    force: bool = Query(False, description="Force regenerate signals instead of returning cached"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Generate or refresh screening signal lists for a project."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    result = generate_signals(project_id, db=conn, force=force)
    return SignalSetResponse(**result)


@router.get("/projects/{project_id}/signals", response_model=SignalSetResponse)
async def get_project_signals(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Get cached screening signals for a project."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    signals_json = proj["signals_json"] if "signals_json" in proj.keys() else None
    if not signals_json:
        raise HTTPException(status_code=404, detail="Signals have not been generated yet for this project")

    try:
        signals_data = json.loads(signals_json)
        return SignalSetResponse(
            project_id=project_id,
            signals=SignalSet(**signals_data),
            source="cached",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse cached signals: {str(e)}")


@router.post("/projects/{project_id}/screening/batch-ai-screen")
async def batch_ai_screen(
    project_id: str,
    stage: str = Query("ta", description="Screening stage: ta (title/abstract) or ft (full-text)"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Batch screen pending studies in a project using signals, pre-filter, and LLM with safety-net overrides."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load signals
    sig_res = generate_signals(project_id, db=conn, force=False)
    signals = sig_res.get("signals", {})

    studies = conn.execute(
        "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'pending'",
        (project_id,),
    ).fetchall()

    total_screened = 0
    included = 0
    excluded = 0
    uncertain = 0
    conflicts = 0
    overrides_applied = 0

    from services.clarification_generator import screen_with_clarification
    from services.llm_extractor import screen_fulltext_with_llm
    from services.pdf_service import get_pdf_data

    pico = json.loads(proj["pico_json"]) if proj["pico_json"] else {}
    clarifications_generated = 0

    for s in studies:
        sid = s["study_id"]
        title = (s["title"] or "").strip()
        abstract = (s["abstract"] or "").strip()

        if stage == "ta":
            pre = prefilter_study(title=title, abstract=abstract, signals=signals, stage="ta")
            reasons_raw = proj["exclusion_reasons_json"] if proj["exclusion_reasons_json"] else "[]"
            try:
                reasons_data = json.loads(reasons_raw) if reasons_raw else []
            except json.JSONDecodeError:
                reasons_data = []
            reason_labels = []
            for reason in reasons_data:
                if isinstance(reason, dict) and reason.get("label"):
                    reason_labels.append(reason["label"])
                elif isinstance(reason, str):
                    reason_labels.append(reason)
            try:
                inclusion_data = json.loads(proj["inclusion_criteria_json"]) if proj["inclusion_criteria_json"] else []
            except (json.JSONDecodeError, KeyError, TypeError):
                inclusion_data = []
            inclusion_labels = []
            for item in inclusion_data:
                if isinstance(item, dict) and item.get("text"):
                    inclusion_labels.append(item["text"])
                elif isinstance(item, str):
                    inclusion_labels.append(item)
            if inclusion_labels:
                pico = dict(pico)
                pico["inclusion_criteria"] = inclusion_labels
            llm_res = screen_with_clarification(
                title=title,
                abstract=abstract,
                pico_criteria=pico,
                exclusion_reasons=reason_labels,
                stage="ta",
                signals=signals,
            )
            final_res = apply_overrides(llm_res, pre, signals=signals, stage="ta", pdf_text_available=True)
            if llm_res.get("recommendation") == "needs_clarification" and final_res.get("recommendation") == "needs_clarification":
                final_res["clarification"] = llm_res.get("clarification")
        else:
            pdf_data = get_pdf_data(sid, db=conn)
            pdf_text_available = bool(pdf_data and pdf_data.get("full_text"))
            full_text = pdf_data.get("full_text", "") if pdf_data else abstract

            pre = prefilter_study(title=title, abstract=full_text or abstract, signals=signals, stage="ft")
            reasons_raw = proj["exclusion_reasons_json"] if proj["exclusion_reasons_json"] else "[]"
            try:
                reasons = json.loads(reasons_raw) if reasons_raw else []
            except json.JSONDecodeError:
                reasons = []
            reason_labels = [
                reason.get("label") if isinstance(reason, dict) else str(reason)
                for reason in reasons
                if (isinstance(reason, dict) and reason.get("label")) or isinstance(reason, str)
            ]

            llm_raw = screen_fulltext_with_llm(
                text=full_text or abstract,
                study_metadata=dict(s),
                pico=pico,
                exclusion_reasons=reason_labels,
            )
            llm_res = {
                "recommendation": llm_raw.get("recommendation", "uncertain"),
                "confidence": float(llm_raw.get("confidence", 0.0)),
                "reason_text": llm_raw.get("reason_text", ""),
                "reason_code": llm_raw.get("reason_code", ""),
            }
            final_res = apply_overrides(llm_res, pre, signals=signals, stage="ft", pdf_text_available=pdf_text_available)

        rec = final_res["recommendation"]
        conf = final_res["confidence"]
        reason_text = final_res["reason_text"]
        reason_code = final_res.get("reason_code", "")

        total_screened += 1

        if rec == "needs_clarification":
            clar = final_res.get("clarification", {})
            question_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO clarification_questions (
                    question_id, study_id, project_id, stage, question_type,
                    question_text, options_json, context_excerpt, pico_aspect,
                    ai_interim_decision, ai_interim_confidence, ai_interim_reason, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    question_id,
                    sid,
                    project_id,
                    stage,
                    clar.get("question_type", "study_design"),
                    clar.get("question_text", ""),
                    json.dumps(clar.get("options", [])),
                    clar.get("context_excerpt", ""),
                    clar.get("pico_aspect", "study_design"),
                    clar.get("interim_decision", "uncertain"),
                    float(final_res.get("confidence", 0.0)),
                    clar.get("interim_reason", final_res.get("reason_text", "")),
                ),
            )
            conn.execute(
                "UPDATE studies SET screening_status = 'awaiting_clarification' WHERE study_id = ?",
                (sid,),
            )
            clarifications_generated += 1
        else:
            # Record decision
            dec_id = str(uuid.uuid4())
            existing_dec = conn.execute(
                "SELECT * FROM screening_decisions WHERE study_id = ? AND reviewer_id = 'ai_reviewer' AND stage = ?",
                (sid, stage),
            ).fetchone()
            if existing_dec:
                conn.execute(
                    "UPDATE screening_decisions SET decision = ?, reason_code = ?, reason_text = ? WHERE decision_id = ?",
                    (rec, reason_code, reason_text, existing_dec["decision_id"]),
                )
            else:
                conn.execute(
                    """INSERT INTO screening_decisions
                       (decision_id, study_id, project_id, reviewer_id, reviewer_name,
                        decision, reason_code, reason_text, stage, is_blinded)
                       VALUES (?, ?, ?, 'ai_reviewer', 'AI Reviewer', ?, ?, ?, ?, 0)""",
                    (dec_id, sid, project_id, rec, reason_code, reason_text, stage),
                )

            conn.execute(
                "UPDATE studies SET screening_status = ?, screening_reason = ? WHERE study_id = ?",
                (rec, reason_text, sid),
            )

            is_conflict = _check_and_record_conflict(conn, sid, project_id, stage, latest_decision=rec, reason_text=reason_text)

            if rec == "included":
                included += 1
            elif rec == "excluded":
                excluded += 1
            else:
                uncertain += 1

            if is_conflict:
                conflicts += 1

        if final_res.get("override_notes"):
            overrides_applied += 1

    if hasattr(conn, "commit"):
        conn.commit()

    return {
        "project_id": project_id,
        "total_screened": total_screened,
        "included": included,
        "excluded": excluded,
        "uncertain": uncertain,
        "clarifications_generated": clarifications_generated,
        "conflicts": conflicts,
        "overrides_applied": overrides_applied,
        "message": f"Screened {total_screened} studies. {clarifications_generated} need clarification.",
    }

