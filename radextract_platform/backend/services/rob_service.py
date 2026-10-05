from __future__ import annotations
import uuid
import json
from datetime import datetime
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services.rob_tools import (
    get_tool, list_tools, select_rob_tool, tool_to_dict,
    compute_domain_judgment, compute_overall_judgment,
    get_judgment_label, get_judgment_color,
)


# ── Helpers ──

def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.utcnow().isoformat()


# ═══════════════════════════════════════════════════════════════════════
#  Assessment CRUD
# ═══════════════════════════════════════════════════════════════════════

def create_assessment(
    study_id: str,
    project_id: str,
    tool: str,
    outcome_label: str = "",
    assessed_by: str = "",
    db: Optional[DBBackend] = None,
) -> dict:
    """Create a new RoB assessment with all domain judgments and signaling answers."""
    rob_tool = get_tool(tool)
    if not rob_tool:
        raise ValueError(f"Unknown RoB tool: {tool}")

    assessment_id = _uuid()
    db = db or get_db_backend()

    db.insert("rob_assessments", {
        "assessment_id": assessment_id,
        "study_id": study_id,
        "project_id": project_id,
        "tool": tool,
        "outcome_label": outcome_label,
        "overall_judgment": "pending",
        "overall_risk": "",
        "assessed_by": assessed_by,
        "assessed_at": "",
        "ai_prefilled": 0,
        "ai_prefilled_at": "",
    })

    # Create domain judgments + signaling answers
    for domain in rob_tool.domains:
        judgment_id = _uuid()
        db.insert("rob_domain_judgments", {
            "judgment_id": judgment_id,
            "assessment_id": assessment_id,
            "domain_key": domain.key,
            "domain_label": domain.label,
            "risk_judgment": "",
            "applicability": "",
            "support_text": "",
            "ai_suggested": "",
            "ai_support": "",
            "ai_confidence": 0.0,
            "human_verified": 0,
            "verified_by": "",
            "verified_at": "",
        })

        for sq in domain.signaling_questions:
            answer_id = _uuid()
            db.insert("rob_signaling_answers", {
                "answer_id": answer_id,
                "judgment_id": judgment_id,
                "question_key": sq.key,
                "question_text": sq.text,
                "answer": "",
                "ai_answer": "",
                "ai_quote": "",
                "ai_page": None,
                "ai_confidence": 0.0,
                "human_verified": 0,
            })

    db.commit()
    return get_assessment(assessment_id, db=db)


def get_assessment(assessment_id: str, db: Optional[DBBackend] = None) -> Optional[dict]:
    """Get full assessment detail with all domain judgments and signaling answers."""
    db = db or get_db_backend()
    row = db.get("rob_assessments", assessment_id)
    if not row:
        return None

    assessment = dict(row)
    rob_tool = get_tool(assessment["tool"])

    judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    domain_judgments = []
    for j_row in judgments:
        jd = dict(j_row)
        answers = db.query("rob_signaling_answers", {"judgment_id": jd["judgment_id"]})
        jd["signaling_answers"] = [dict(a) for a in answers]
        domain_judgments.append(jd)

    domain_judgments.sort(key=lambda x: x.get("domain_key", ""))
    assessment["domain_judgments"] = domain_judgments

    if rob_tool:
        assessment["tool_definition"] = tool_to_dict(rob_tool)

    return assessment


def list_assessments_for_study(study_id: str, db: Optional[DBBackend] = None) -> list[dict]:
    """List all RoB assessments for a study (without full detail)."""
    db = db or get_db_backend()
    return db.query("rob_assessments", {"study_id": study_id}, order_by="assessed_at DESC")


def list_assessments_for_project(project_id: str, db: Optional[DBBackend] = None) -> list[dict]:
    """List all RoB assessments for a project (without full detail)."""
    db = db or get_db_backend()
    assessments = db.query("rob_assessments", {"project_id": project_id}, order_by="assessed_at DESC")
    studies = db.query("studies", {"project_id": project_id})
    study_map = {s["study_id"]: s for s in studies}

    results = []
    for a in assessments:
        item = dict(a)
        s = study_map.get(a.get("study_id"), {})
        item["study_title"] = s.get("title", "")
        item["study_design"] = s.get("study_design", "")
        results.append(item)

    return results


def delete_assessment(assessment_id: str, db: Optional[DBBackend] = None) -> bool:
    """Delete an assessment and all its child records."""
    db = db or get_db_backend()
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        return False
    judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    for j in judgments:
        answers = db.query("rob_signaling_answers", {"judgment_id": j["judgment_id"]})
        for a in answers:
            db.delete("rob_signaling_answers", a["answer_id"])
        db.delete("rob_domain_judgments", j["judgment_id"])
    db.delete("rob_assessments", assessment_id)
    db.commit()
    return True


# ═══════════════════════════════════════════════════════════════════════
#  Signaling Answer Updates
# ═══════════════════════════════════════════════════════════════════════

def update_signaling_answer(
    answer_id: str,
    answer: Optional[str] = None,
    human_verified: Optional[bool] = None,
    db: Optional[DBBackend] = None,
) -> dict:
    """Update a signaling answer and recompute the parent domain judgment."""
    db = db or get_db_backend()
    row = db.get("rob_signaling_answers", answer_id)
    if not row:
        raise ValueError(f"Signaling answer not found: {answer_id}")

    updates = {}
    if answer is not None:
        updates["answer"] = answer
    if human_verified is not None:
        updates["human_verified"] = 1 if human_verified else 0

    if updates:
        db.update("rob_signaling_answers", answer_id, updates)

    # Recompute domain judgment
    judgment_id = row["judgment_id"]
    _recompute_domain_judgment(db, judgment_id)
    db.commit()

    j_row = db.get("rob_domain_judgments", judgment_id)
    assessment_id = j_row["assessment_id"] if j_row else None
    if assessment_id:
        return get_assessment(assessment_id, db=db)
    return None


def _recompute_domain_judgment(db, judgment_id: str):
    """Recompute a domain judgment from its signaling answers and update overall."""
    j_row = db.get("rob_domain_judgments", judgment_id)
    if not j_row:
        return

    assessment_id = j_row["assessment_id"]
    domain_key = j_row["domain_key"]

    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        return
    tool_key = a_row["tool"]

    answers = db.query("rob_signaling_answers", {"judgment_id": judgment_id})
    answer_dict = {a["question_key"]: a.get("answer", "") for a in answers}

    # Filter to active questions
    rob_tool = get_tool(tool_key)
    if rob_tool:
        domain = rob_tool.get_domain(domain_key)
        if domain:
            active_answers = {}
            for sq in domain.signaling_questions:
                if sq.parent_key:
                    parent_answer = answer_dict.get(sq.parent_key, "")
                    if sq.trigger_answers and parent_answer not in sq.trigger_answers:
                        continue
                active_answers[sq.key] = answer_dict.get(sq.key, "")
            answer_dict = active_answers

    new_judgment = compute_domain_judgment(tool_key, answer_dict)
    db.update("rob_domain_judgments", judgment_id, {"risk_judgment": new_judgment})
    _recompute_overall_judgment(db, assessment_id)


def _recompute_overall_judgment(db, assessment_id: str):
    """Recompute the overall judgment from all domain judgments."""
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        return
    tool_key = a_row["tool"]

    judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    domain_judgments = {j["domain_key"]: j.get("risk_judgment", "") for j in judgments}
    overall = compute_overall_judgment(tool_key, domain_judgments)

    db.update("rob_assessments", assessment_id, {"overall_judgment": overall})


# ═══════════════════════════════════════════════════════════════════════
#  Domain Judgment Updates
# ═══════════════════════════════════════════════════════════════════════

def update_domain_judgment(
    judgment_id: str,
    risk_judgment: Optional[str] = None,
    applicability: Optional[str] = None,
    support_text: Optional[str] = None,
    human_verified: Optional[bool] = None,
    verified_by: str = "",
    db: Optional[DBBackend] = None,
) -> dict:
    """Update a domain judgment (human override or verification)."""
    db = db or get_db_backend()
    row = db.get("rob_domain_judgments", judgment_id)
    if not row:
        raise ValueError(f"Domain judgment not found: {judgment_id}")

    updates = {}
    if risk_judgment is not None:
        updates["risk_judgment"] = risk_judgment
    if applicability is not None:
        updates["applicability"] = applicability
    if support_text is not None:
        updates["support_text"] = support_text
    if human_verified is not None:
        updates["human_verified"] = 1 if human_verified else 0
        updates["verified_by"] = verified_by if human_verified else ""
        updates["verified_at"] = _now() if human_verified else ""

    if updates:
        db.update("rob_domain_judgments", judgment_id, updates)

    _recompute_overall_judgment(db, row["assessment_id"])
    db.commit()

    return get_assessment(row["assessment_id"], db=db)


# ═══════════════════════════════════════════════════════════════════════
#  AI Pre-fill Application
# ═══════════════════════════════════════════════════════════════════════

def apply_ai_prefill(
    assessment_id: str,
    ai_results: dict,
    db: Optional[DBBackend] = None,
) -> dict:
    """Apply AI pre-fill results to an assessment."""
    db = db or get_db_backend()
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        raise ValueError(f"Assessment not found: {assessment_id}")

    domains_data = ai_results.get("domains", {})
    domains_prefilled = 0
    questions_prefilled = 0
    confidences = []

    domain_judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    domain_map = {j["domain_key"]: j for j in domain_judgments}

    for domain_key, domain_data in domains_data.items():
        j_row = domain_map.get(domain_key)
        if not j_row:
            continue

        judgment_id = j_row["judgment_id"]
        ai_suggested = domain_data.get("ai_suggested", "")
        ai_support = domain_data.get("ai_support", "")
        ai_confidence = domain_data.get("ai_confidence", 0.0)

        db.update("rob_domain_judgments", judgment_id, {
            "ai_suggested": ai_suggested,
            "ai_support": ai_support,
            "ai_confidence": ai_confidence,
        })
        domains_prefilled += 1
        if ai_confidence > 0:
            confidences.append(ai_confidence)

        # Update signaling answers
        answers_data = domain_data.get("answers", {})
        existing_answers = db.query("rob_signaling_answers", {"judgment_id": judgment_id})
        ans_map = {a["question_key"]: a for a in existing_answers}

        for q_key, q_data in answers_data.items():
            a_row2 = ans_map.get(q_key)
            if not a_row2:
                continue

            db.update("rob_signaling_answers", a_row2["answer_id"], {
                "ai_answer": q_data.get("ai_answer", ""),
                "ai_quote": q_data.get("ai_quote", ""),
                "ai_page": q_data.get("ai_page"),
                "ai_confidence": q_data.get("ai_confidence", 0.0),
            })
            questions_prefilled += 1
            if q_data.get("ai_confidence", 0) > 0:
                confidences.append(q_data["ai_confidence"])

    db.update("rob_assessments", assessment_id, {
        "ai_prefilled": 1,
        "ai_prefilled_at": _now(),
    })
    db.commit()

    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "assessment_id": assessment_id,
        "domains_prefilled": domains_prefilled,
        "questions_prefilled": questions_prefilled,
        "avg_confidence": round(avg_conf, 3),
        "used_full_text": ai_results.get("used_full_text", False),
        "warnings": ai_results.get("warnings", []),
    }


def accept_ai_suggestions(assessment_id: str, verified_by: str = "", db: Optional[DBBackend] = None) -> dict:
    """Accept all AI-suggested answers for an assessment."""
    db = db or get_db_backend()
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        raise ValueError(f"Assessment not found: {assessment_id}")

    judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    accepted_count = 0
    for j in judgments:
        answers = db.query("rob_signaling_answers", {"judgment_id": j["judgment_id"]})
        for a in answers:
            ai_ans = a.get("ai_answer")
            if ai_ans:
                db.update("rob_signaling_answers", a["answer_id"], {"answer": ai_ans})
                accepted_count += 1

        _recompute_domain_judgment(db, j["judgment_id"])

    db.commit()

    return {
        "assessment_id": assessment_id,
        "answers_accepted": accepted_count,
    }


# ═══════════════════════════════════════════════════════════════════════
#  Project Summary (traffic-light chart)
# ═══════════════════════════════════════════════════════════════════════

def get_project_summary(project_id: str, db: Optional[DBBackend] = None) -> dict:
    """Get a summary of RoB assessments for traffic-light chart rendering."""
    db = db or get_db_backend()
    assessments = db.query("rob_assessments", {"project_id": project_id})
    studies = db.query("studies", {"project_id": project_id})
    study_map = {s["study_id"]: s for s in studies}

    if not assessments:
        return {
            "project_id": project_id,
            "tool": "",
            "total_assessments": 0,
            "judgment_counts": {},
            "assessments": [],
        }

    tool = assessments[0].get("tool", "")
    judgment_counts = {}
    for a in assessments:
        j = a.get("overall_judgment", "")
        judgment_counts[j] = judgment_counts.get(j, 0) + 1

    assessment_list = []
    for a in assessments:
        s = study_map.get(a.get("study_id"), {})
        detail = {
            "assessment_id": a["assessment_id"],
            "study_id": a["study_id"],
            "study_title": s.get("title", ""),
            "study_design": s.get("study_design", ""),
            "outcome_label": a.get("outcome_label", ""),
            "overall_judgment": a.get("overall_judgment", ""),
            "ai_prefilled": bool(a.get("ai_prefilled")),
            "domains": [],
        }

        domains = db.query("rob_domain_judgments", {"assessment_id": a["assessment_id"]})
        domains.sort(key=lambda x: x.get("domain_key", ""))

        for d in domains:
            rj = d.get("risk_judgment", "")
            detail["domains"].append({
                "domain_key": d.get("domain_key", ""),
                "domain_label": d.get("domain_label", ""),
                "risk_judgment": rj,
                "applicability": d.get("applicability", ""),
                "human_verified": bool(d.get("human_verified")),
                "color": get_judgment_color(rj),
                "label": get_judgment_label(rj),
            })

        assessment_list.append(detail)

    return {
        "project_id": project_id,
        "tool": tool,
        "total_assessments": len(assessment_list),
        "judgment_counts": judgment_counts,
        "assessments": assessment_list,
    }


# ═══════════════════════════════════════════════════════════════════════
#  Export
# ═══════════════════════════════════════════════════════════════════════

def export_project_rob(project_id: str, format: str = "csv", db: Optional[DBBackend] = None) -> str:
    """Export RoB assessments for a project as CSV or Excel."""
    import io
    import csv
    from services.storage_backend import get_storage

    db = db or get_db_backend()
    assessments = db.query("rob_assessments", {"project_id": project_id})
    studies = db.query("studies", {"project_id": project_id})
    study_map = {s["study_id"]: s for s in studies}

    # Bulk fetch domain judgments and signaling answers to avoid N+1 queries
    assessment_ids = {a["assessment_id"] for a in assessments if "assessment_id" in a}

    # Query all domain judgments and signaling answers in bulk
    all_domains = db.query_all("rob_domain_judgments")
    all_answers = db.query_all("rob_signaling_answers")

    # Map assessment_id -> list of domain judgments
    domains_by_assessment = {}
    for d in all_domains:
        aid = d.get("assessment_id")
        if aid in assessment_ids:
            domains_by_assessment.setdefault(aid, []).append(d)

    # Sort domain judgments for each assessment by domain_key
    for aid in domains_by_assessment:
        domains_by_assessment[aid].sort(key=lambda x: x.get("domain_key", ""))

    # Map judgment_id -> list of signaling answers
    all_judgment_ids = {d["judgment_id"] for d in all_domains if "judgment_id" in d}
    answers_by_judgment = {}
    for ans in all_answers:
        jid = ans.get("judgment_id")
        if jid in all_judgment_ids:
            answers_by_judgment.setdefault(jid, []).append(ans)

    # Sort signaling answers for each judgment by question_key
    for jid in answers_by_judgment:
        answers_by_judgment[jid].sort(key=lambda x: x.get("question_key", ""))

    rows = []
    for a in assessments:
        s = study_map.get(a.get("study_id"), {})
        domains = domains_by_assessment.get(a["assessment_id"], [])

        for d in domains:
            answers = answers_by_judgment.get(d["judgment_id"], [])

            for ans in answers:
                rows.append({
                    "study_title": s.get("title", ""),
                    "authors": s.get("authors", ""),
                    "year": s.get("publication_year", ""),
                    "journal": s.get("journal", ""),
                    "doi": s.get("doi", ""),
                    "study_design": s.get("study_design", ""),
                    "tool": a.get("tool", ""),
                    "outcome_label": a.get("outcome_label", ""),
                    "overall_judgment": get_judgment_label(a.get("overall_judgment", "")),
                    "domain": d.get("domain_label", ""),
                    "domain_judgment": get_judgment_label(d.get("risk_judgment", "")),
                    "applicability": d.get("applicability", ""),
                    "signaling_question": ans.get("question_text", ""),
                    "answer": ans.get("answer", ""),
                    "ai_answer": ans.get("ai_answer", ""),
                    "ai_quote": ans.get("ai_quote", ""),
                    "ai_confidence": ans.get("ai_confidence", 0.0),
                    "human_verified": "Yes" if ans.get("human_verified") else "No",
                    "support_text": d.get("support_text", ""),
                })

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    storage = get_storage("export")

    if format == "xlsx":
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "RoB Export"
        if rows:
            headers = list(rows[0].keys())
            ws.append(headers)
            for r in rows:
                ws.append([r[h] for h in headers])
        out_stream = io.BytesIO()
        wb.save(out_stream)
        filename = f"rob_export_{project_id}_{timestamp}.xlsx"
        return storage.save_bytes(filename, out_stream.getvalue())
    else:
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        else:
            output.write("No RoB assessments found for this project.\n")
        filename = f"rob_export_{project_id}_{timestamp}.csv"
        return storage.save_bytes(filename, output.getvalue().encode("utf-8"))


# ═══════════════════════════════════════════════════════════════════════
#  Auto-select tool for a study
# ═══════════════════════════════════════════════════════════════════════

def auto_select_and_create_assessment(
    study_id: str,
    project_id: str,
    study_design: str = "",
    outcome_label: str = "",
    assessed_by: str = "",
    db: Optional[DBBackend] = None,
) -> dict:
    """Auto-select the appropriate RoB tool based on study design and create assessment."""
    tool_key = select_rob_tool(study_design)
    if tool_key == "manual":
        raise ValueError(
            f"Could not auto-select RoB tool for study design: '{study_design}'. "
            "Please specify a tool manually."
        )
    return create_assessment(
        study_id=study_id,
        project_id=project_id,
        tool=tool_key,
        outcome_label=outcome_label,
        assessed_by=assessed_by,
        db=db,
    )



def auto_assess_study(
    study_id: str,
    project_id: str,
    db: Optional[DBBackend] = None,
    assessed_by: str = "ai_pipeline",
) -> Optional[dict]:
    """Auto-create a RoB assessment for an included study and AI-prefill it.

    Used by the PDF pipeline (after full-text inclusion) and by the manual
    full-text include path. Idempotent: returns the existing assessment if
    one already exists for the study. Never raises — RoB failure must not
    block screening/extraction.

    Returns the assessment dict (with 'created' and 'prefilled' flags), or
    None if the study is missing or tool auto-selection failed.
    """
    import logging
    logger = logging.getLogger("radextract.rob")

    db = db or get_db_backend()

    study = db.get("studies", study_id)
    if not study:
        logger.warning(f"[RoB] auto_assess_study: study {study_id} not found")
        return None

    # Idempotent: one assessment per study
    existing = list_assessments_for_study(study_id, db=db)
    if existing:
        logger.info(f"[RoB] Assessment already exists for {study_id}, skipping auto-create")
        return {**existing[0], "created": False, "prefilled": False}

    try:
        assessment = auto_select_and_create_assessment(
            study_id=study_id,
            project_id=project_id,
            study_design=study.get("study_design", "") or "",
            outcome_label="",
            assessed_by=assessed_by,
            db=db,
        )
    except ValueError as e:
        logger.warning(f"[RoB] Tool auto-selection failed for {study_id}: {e}")
        return None

    # AI prefill with real study metadata
    prefilled = False
    try:
        from services import rob_ai, pdf_service
        from services.llm_extractor import is_llm_available

        if is_llm_available():
            from services.llm_client import get_client
            model_fn = get_client().as_model_fn("prefill_rob_domain")
        else:
            model_fn = rob_ai.mock_model_fn

        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        full_text = (pdf_data or {}).get("full_text", "") or ""
        if len(full_text) <= 100:
            full_text = ""

        ai_results = rob_ai.prefill_assessment(
            tool_key=assessment["tool"],
            study_metadata={
                "title": study.get("title", "") or "",
                "authors": study.get("authors", "") or "",
                "journal": study.get("journal", "") or "",
                "publication_year": study.get("publication_year", "") or "",
                "study_design": study.get("study_design", "") or "",
            },
            full_text=full_text,
            abstract=study.get("abstract", "") or "",
            model_fn=model_fn,
        )
        apply_ai_prefill(assessment["assessment_id"], ai_results, db=db)
        prefilled = True
        logger.info(f"[RoB] Auto-assessed {study_id} (tool={assessment['tool']}, prefilled=True)")
    except Exception as e:
        logger.warning(f"[RoB] AI prefill failed for {study_id}: {e}")

    return {**assessment, "created": True, "prefilled": prefilled}
