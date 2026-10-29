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
    run_id: str = "",
    auto_selected: int = 0,
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
        "run_id": run_id,
        "auto_selected": auto_selected,
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
                "needs_human_review": 0,
                "reviewed_by": "",
                "reviewed_at": "",
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
    needs_human_review: Optional[bool] = None,
    reviewed_by: Optional[str] = None,
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
        updates["needs_human_review"] = 0
        updates["human_verified"] = 1
        updates["reviewed_by"] = reviewed_by or "reviewer"
        updates["reviewed_at"] = _now()
    if human_verified is not None:
        updates["human_verified"] = 1 if human_verified else 0
        if human_verified:
            updates["needs_human_review"] = 0
            updates["reviewed_by"] = reviewed_by or "reviewer"
            updates["reviewed_at"] = _now()
    if needs_human_review is not None:
        updates["needs_human_review"] = 1 if needs_human_review else 0
    if reviewed_by is not None:
        updates["reviewed_by"] = reviewed_by

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

    new_judgment = compute_domain_judgment(tool_key, answer_dict, domain_key=domain_key)
    db.update("rob_domain_judgments", judgment_id, {"risk_judgment": new_judgment})
    _recompute_overall_judgment(db, assessment_id)


def _recompute_overall_judgment(db, assessment_id: str):
    """Recompute the overall judgment from all domain judgments."""
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        return
    # H5: Do not overwrite adjudicated assessment judgments
    if a_row.get("verification_status") == "adjudicated":
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

    project_id = a_row.get("project_id")
    p_row = db.get("projects", project_id) if project_id else None
    threshold = float((p_row or {}).get("rob_confidence_threshold", 0.7) or 0.7)

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

            q_conf = float(q_data.get("ai_confidence", 0.0) or 0.0)
            needs_review = 1 if (q_conf < threshold) else 0

            # Auto-record AI answer into the recorded answer field so it is captured immediately,
            # while keeping needs_human_review for transparent human verification
            ai_ans_val = q_data.get("ai_answer", "")
            update_payload = {
                "ai_answer": ai_ans_val,
                "ai_quote": q_data.get("ai_quote", ""),
                "ai_page": q_data.get("ai_page"),
                "ai_confidence": q_conf,
                "needs_human_review": needs_review,
            }
            if ai_ans_val and not a_row2.get("answer"):
                update_payload["answer"] = ai_ans_val
                # human_verified remains 0 until human confirms/modifies

            db.update("rob_signaling_answers", a_row2["answer_id"], update_payload)
            questions_prefilled += 1
            if q_conf > 0:
                confidences.append(q_conf)

        _recompute_domain_judgment(db, judgment_id)

    db.update("rob_assessments", assessment_id, {
        "ai_prefilled": 1,
        "ai_prefilled_at": _now(),
    })
    _recompute_overall_judgment(db, assessment_id)
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

    classifications = db.query("rob_tool_classifications", {"project_id": project_id})
    from services.rob_classification_service import decode_classification
    manual_review = [
        {
            **decode_classification(c),
            "study_title": study_map.get(c.get("study_id"), {}).get("title", ""),
        }
        for c in classifications
        if c.get("status") == "manual_review"
    ]

    judgment_counts = {}
    for a in assessments:
        j = a.get("overall_judgment", "")
        judgment_counts[j] = judgment_counts.get(j, 0) + 1

    assessment_list = []
    total_flagged_questions = 0
    assessments_needing_review = 0

    for a in assessments:
        s = study_map.get(a.get("study_id"), {})
        detail = {
            "assessment_id": a["assessment_id"],
            "study_id": a["study_id"],
            "study_title": s.get("title", ""),
            "study_design": s.get("study_design", ""),
            "tool": a.get("tool", ""),
            "outcome_label": a.get("outcome_label", ""),
            "overall_judgment": a.get("overall_judgment", ""),
            "ai_prefilled": bool(a.get("ai_prefilled")),
            "domains": [],
            "needs_human_review_count": 0,
        }

        domains = db.query("rob_domain_judgments", {"assessment_id": a["assessment_id"]})
        domains.sort(key=lambda x: x.get("domain_key", ""))

        assessment_flagged = 0
        for d in domains:
            rj = d.get("risk_judgment", "")
            answers = db.query("rob_signaling_answers", {"judgment_id": d["judgment_id"]})
            domain_flagged = sum(1 for ans in answers if ans.get("needs_human_review") and not ans.get("human_verified"))
            assessment_flagged += domain_flagged

            detail["domains"].append({
                "domain_key": d.get("domain_key", ""),
                "domain_label": d.get("domain_label", ""),
                "risk_judgment": rj,
                "applicability": d.get("applicability", ""),
                "human_verified": bool(d.get("human_verified")),
                "color": get_judgment_color(rj),
                "label": get_judgment_label(rj),
                "needs_human_review_count": domain_flagged,
            })

        detail["needs_human_review_count"] = assessment_flagged
        if assessment_flagged > 0:
            assessments_needing_review += 1
            total_flagged_questions += assessment_flagged

        assessment_list.append(detail)

    tool_groups = {}
    for item in assessment_list:
        key = item.get("tool") or "unknown"
        group = tool_groups.setdefault(key, {
            "tool": key,
            "total_assessments": 0,
            "judgment_counts": {},
            "assessments": [],
        })
        group["assessments"].append(item)
        group["total_assessments"] += 1
        judgment = item.get("overall_judgment", "")
        group["judgment_counts"][judgment] = group["judgment_counts"].get(judgment, 0) + 1

    tool = next(iter(tool_groups)) if len(tool_groups) == 1 else ("mixed" if tool_groups else "")
    return {
        "project_id": project_id,
        "tool": tool,
        "total_assessments": len(assessment_list),
        "judgment_counts": judgment_counts,
        "assessments": assessment_list,
        "pending_human_review_count": total_flagged_questions,
        "assessments_needing_review_count": assessments_needing_review,
        "tool_groups": tool_groups,
        "manual_review": manual_review,
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
                    "needs_human_review": "Yes" if ans.get("needs_human_review", 0) else "No",
                    "human_verified": "Yes" if ans.get("human_verified") else "No",
                    "support_text": d.get("support_text", ""),
                })

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    storage = get_storage("export")

    if format == "zip":
        import openpyxl
        import zipfile
        import json

        out_zip = io.BytesIO()
        with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:

            # 1. risk_of_bias.xlsx
            wb_rob = openpyxl.Workbook()
            ws_rob = wb_rob.active
            ws_rob.title = "Risk of Bias"
            if rows:
                headers = list(rows[0].keys())
                ws_rob.append(headers)
                for r in rows:
                    ws_rob.append([r[h] for h in headers])
            rob_stream = io.BytesIO()
            wb_rob.save(rob_stream)
            zf.writestr("risk_of_bias.xlsx", rob_stream.getvalue())

            # 2. reporting_completeness.xlsx
            wb_rc = openpyxl.Workbook()

            # MTR 10-item sheet
            ws_mtr = wb_rc.active
            ws_mtr.title = "MTR (10-item)"
            mtr_headers = ["Study Title", "Tool", "Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6", "Item 7", "Item 8", "Item 9", "Item 10"]
            ws_mtr.append(mtr_headers)
            for a in assessments:
                s = study_map.get(a.get("study_id"), {})
                ws_mtr.append([s.get("title", ""), a.get("tool", "")] + ["Pending"] * 10)

            # RC 9-item sheet
            ws_rc9 = wb_rc.create_sheet("RC (9-item)")
            rc9_headers = ["Study Title", "Tool", "Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6", "Item 7", "Item 8", "Item 9"]
            ws_rc9.append(rc9_headers)
            for a in assessments:
                s = study_map.get(a.get("study_id"), {})
                ws_rc9.append([s.get("title", ""), a.get("tool", "")] + ["Pending"] * 9)

            rc_stream = io.BytesIO()
            wb_rc.save(rc_stream)
            zf.writestr("reporting_completeness.xlsx", rc_stream.getvalue())

            # 3. manifest.json
            manifest = {
                "project_id": project_id,
                "exported_at": timestamp,
                "assessments_count": len(assessments)
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))

            # 4. SVG Figures
            from services.r_plot_service import generate_robvis_plot
            tool_keys = set(a.get("tool", "") for a in assessments)
            for tk in tool_keys:
                if tk:
                    # Filter rows for this specific tool
                    tool_rows = [r for r in rows if r["tool"] == tk]
                    if tool_rows:
                        # Write temporary CSV for robvis
                        import tempfile
                        import os
                        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv') as tmp_csv:
                            writer = csv.DictWriter(tmp_csv, fieldnames=list(tool_rows[0].keys()))
                            writer.writeheader()
                            writer.writerows(tool_rows)
                            tmp_csv_path = tmp_csv.name

                        try:
                            # Generate traffic light and summary plots
                            svg_traffic = generate_robvis_plot(tmp_csv_path, plot_type="traffic_light", tool=tk)
                            if svg_traffic:
                                zf.writestr(f"figures/{tk}_traffic_light.svg", svg_traffic)

                            svg_summary = generate_robvis_plot(tmp_csv_path, plot_type="summary", tool=tk)
                            if svg_summary:
                                zf.writestr(f"figures/{tk}_summary.svg", svg_summary)

                            # Convert to PNG (optional if required by instructions but SVG is typical)
                            png_traffic = generate_robvis_plot(tmp_csv_path, plot_type="traffic_light", tool=tk, format="png")
                            if png_traffic:
                                zf.writestr(f"figures/{tk}_traffic_light.png", png_traffic)

                            png_summary = generate_robvis_plot(tmp_csv_path, plot_type="summary", tool=tk, format="png")
                            if png_summary:
                                zf.writestr(f"figures/{tk}_summary.png", png_summary)

                        except Exception as e:
                            print(f"Failed to generate robvis plot for {tk}: {e}")
                        finally:
                            if os.path.exists(tmp_csv_path):
                                os.remove(tmp_csv_path)

        filename = f"rob_export_{project_id}_{timestamp}.zip"
        return storage.save_bytes(filename, out_zip.getvalue())

    elif format == "xlsx":
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
        from services import pdf_service
        from services.rob_classification_service import classify_study, persist_classification
        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        project = db.get("projects", project_id) or {}
        threshold = float(project.get("rob_confidence_threshold", 0.7) or 0.7)
        model_fn = None
        try:
            from services.llm_extractor import is_llm_available
            if is_llm_available():
                from services.llm_client import get_client
                model_fn = get_client().as_model_fn(
                    "classify_rob_tool",
                    system_prompt="You are a systematic-review methods expert. Select appraisal instruments only from the supplied closed list.",
                    max_tokens=1200,
                )
        except Exception:
            model_fn = None
        classification = classify_study(study, pdf_data, threshold=threshold, model_fn=model_fn)
        persist_classification(db, study_id, project_id, classification)
        from services.reporting_profile_service import assess_profile, persist_profile
        profile_model_fn = None
        if model_fn is not None:
            try:
                from services.llm_client import get_client
                profile_model_fn = get_client().as_model_fn(
                    "assess_reporting_profile",
                    system_prompt="Assess reporting completeness using only verbatim article evidence.",
                    max_tokens=3000,
                )
            except Exception:
                profile_model_fn = None
        profile_items = assess_profile(study, pdf_data, model_fn=profile_model_fn)
        persist_profile(db, project_id, study_id, profile_items)
        tool_key = classification["tool"]
        if classification["status"] != "assigned" or tool_key == "manual":
            logger.info(f"[RoB] {study_id} requires manual tool review")
            return {
                "study_id": study_id,
                "created": False,
                "prefilled": False,
                "classification": classification,
                "manual_review": True,
            }
        assessment = create_assessment(
            study_id=study_id,
            project_id=project_id,
            tool=tool_key,
            outcome_label="",
            assessed_by=assessed_by,
            auto_selected=1,
            db=db,
        )
    except Exception as e:
        logger.warning(f"[RoB] Assessment creation failed for {study_id}: {e}")
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
            import os
            from config import settings
            is_test_env = os.environ.get("PYTEST_CURRENT_TEST") is not None or getattr(settings, "env", "") in ("test", "development")
            if is_test_env:
                model_fn = rob_ai.mock_model_fn
            else:
                logger.warning(f"[RoB] LLM unavailable for assessment {assessment['assessment_id']}; skipping AI prefill without fabricating mock data.")
                return assessment

        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        full_text = (pdf_data or {}).get("full_text", "") or ""
        if len(full_text) <= 100:
            full_text = "\n\n".join(
                str(page.get("text") or "")
                for page in ((pdf_data or {}).get("pages") or [])
                if isinstance(page, dict)
            )

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


# ═══════════════════════════════════════════════════════════════════════
#  Tool Override & Batch RoB Runner
# ═══════════════════════════════════════════════════════════════════════

def change_assessment_tool(assessment_id: str, new_tool: str, db: Optional[DBBackend] = None) -> dict:
    """Change the tool used for an assessment, re-instantiating domains and signaling questions."""
    rob_tool = get_tool(new_tool)
    if not rob_tool:
        raise ValueError(f"Unknown RoB tool: {new_tool}")

    db = db or get_db_backend()
    a_row = db.get("rob_assessments", assessment_id)
    if not a_row:
        raise ValueError(f"Assessment not found: {assessment_id}")

    # Delete existing judgments and signaling answers
    old_judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    for j in old_judgments:
        old_answers = db.query("rob_signaling_answers", {"judgment_id": j["judgment_id"]})
        for a in old_answers:
            db.delete("rob_signaling_answers", a["answer_id"])
        db.delete("rob_domain_judgments", j["judgment_id"])

    # Update assessment row
    db.update("rob_assessments", assessment_id, {
        "tool": new_tool,
        "overall_judgment": "pending",
        "overall_risk": "",
        "ai_prefilled": 0,
        "ai_prefilled_at": "",
    })

    # Create new domain judgments + signaling answers
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
                "needs_human_review": 0,
                "reviewed_by": "",
                "reviewed_at": "",
            })

    db.commit()
    return get_assessment(assessment_id, db=db)


def _resolve_prefill_model_fn():
    """Resolve AI prefill model function. Returns None if AI service not reachable."""
    try:
        from services.llm_extractor import is_llm_available
        if is_llm_available():
            from services.llm_client import get_client
            return get_client().as_model_fn("prefill_rob_domain")
    except Exception:
        pass
    return None


def assess_study_for_batch(
    study_id: str,
    project_id: str,
    db: Optional[DBBackend] = None,
    run_id: str = "",
) -> dict:
    """Assess a single study as part of a batch RoB run.

    Determines the tool from study_design, resolves prefill model function,
    creates the assessment and prefills it (or leaves empty if AI unreachable).
    If tool cannot be determined, returns manual_review flag.
    """
    db = db or get_db_backend()
    study = db.get("studies", study_id)
    if not study:
        return {"status": "skipped", "study_id": study_id, "reason": "study not found"}

    design = (study.get("study_design") or "").lower()
    tool_key = None
    if any(k in design for k in ("random", "rct")):
        tool_key = "rob2"
    elif any(k in design for k in ("cohort", "case-control", "observational", "non-random")):
        tool_key = "robins_i"
    elif any(k in design for k in ("diagnostic", "quadas")):
        tool_key = "quadas2"
    elif "rob2" in design:
        tool_key = "rob2"
    elif "robins" in design:
        tool_key = "robins_i"

    if not tool_key:
        return {"status": "manual_review", "manual_review": True, "study_id": study_id}

    model_fn = _resolve_prefill_model_fn()
    ai_reachable = model_fn is not None

    assessment = create_assessment(
        study_id=study_id,
        project_id=project_id,
        tool=tool_key,
        outcome_label="",
        assessed_by="ai_batch",
        run_id=run_id,
        auto_selected=1,
        db=db,
    )

    if not ai_reachable:
        return {
            "status": "empty",
            "study_id": study_id,
            "assessment_id": assessment["assessment_id"],
            "ai_reachable": False,
        }

    try:
        from services import rob_ai, pdf_service
        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        full_text = (pdf_data or {}).get("full_text", "") or ""
        if len(full_text) <= 100:
            full_text = "\n\n".join(
                str(page.get("text") or "")
                for page in ((pdf_data or {}).get("pages") or [])
                if isinstance(page, dict)
            )

        ai_results = rob_ai.prefill_assessment(
            tool_key=tool_key,
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
        db.update("rob_assessments", assessment["assessment_id"], {"ai_prefilled": 1, "run_id": run_id})
        db.commit()
    except Exception as e:
        import logging
        logging.getLogger("radextract.rob").warning(f"[RoB] Prefill error for {study_id}: {e}")

    return {
        "status": "assessed",
        "study_id": study_id,
        "assessment_id": assessment["assessment_id"],
        "ai_reachable": True,
    }


ROB_BATCH_RUNS: dict[str, dict] = {}


def get_batch_rob_progress(project_id: str, db: Optional[DBBackend] = None) -> dict:
    """Get live progress of a batch RoB run for a project."""
    if project_id in ROB_BATCH_RUNS:
        return dict(ROB_BATCH_RUNS[project_id])
    db = db or get_db_backend()
    rows = db.query("rob_runs", {"project_id": project_id})
    if rows:
        rows.sort(key=lambda r: r.get("started_at", ""), reverse=True)
        latest = rows[0]
        done_ids = json.loads(latest.get("done_ids_json", "[]") or "[]")
        pending_ids = json.loads(latest.get("pending_ids_json", "[]") or "[]")
        manual_review_ids = json.loads(latest.get("manual_review_ids_json", "[]") or "[]")
        raw_status = latest.get("status", "idle")
        status = "running" if raw_status == "active" else raw_status
        return {
            "run_id": latest.get("run_id"),
            "status": status,
            "active": status == "running",
            "stage": "rob",
            "total_studies": latest.get("total_studies", 0),
            "completed_studies": latest.get("completed_studies", 0),
            "failed_studies": latest.get("failed_studies", 0),
            "flagged_questions_count": latest.get("flagged_questions_count", 0),
            "manual_review_ids": manual_review_ids,
            "error_message": latest.get("error_message", "") or latest.get("error", ""),
            "total": latest.get("total_studies", 0),
            "completed": latest.get("completed_studies", 0),
            "current_study_id": latest.get("current_study_id", ""),
            "done_ids": done_ids,
            "pending_ids": pending_ids,
        }
    return {
        "status": "idle",
        "run_id": None,
        "active": False,
        "stage": "rob",
        "total_studies": 0,
        "completed_studies": 0,
        "failed_studies": 0,
        "flagged_questions_count": 0,
        "manual_review_ids": [],
        "error_message": "",
        "total": 0,
        "completed": 0,
        "current_study_id": None,
        "done_ids": [],
        "pending_ids": [],
    }


def cancel_batch_rob_run(project_id: str, db: Optional[DBBackend] = None) -> dict:
    """Cancel an active batch RoB run."""
    if project_id in ROB_BATCH_RUNS:
        ROB_BATCH_RUNS[project_id]["active"] = False
        ROB_BATCH_RUNS[project_id]["status"] = "cancelled"
    db = db or get_db_backend()
    rows = db.query("rob_runs", {"project_id": project_id, "status": "active"})
    for r in rows:
        db.update("rob_runs", r["run_id"], {"status": "cancelled", "finished_at": _now()})
    db.commit()
    return {"status": "cancelled", "project_id": project_id}


def start_batch_rob_run(
    project_id: str,
    db: Optional[DBBackend] = None,
    trigger: str = "manual",
) -> dict:
    """Start batch risk-of-bias assessment for all included studies lacking assessments."""
    import threading
    import logging
    logger = logging.getLogger("radextract.rob")

    if project_id in ROB_BATCH_RUNS and ROB_BATCH_RUNS[project_id].get("status") == "running":
        return dict(ROB_BATCH_RUNS[project_id])

    db = db or get_db_backend()
    all_studies = db.query("studies", {"project_id": project_id})
    included = [
        s for s in all_studies
        if (s.get("screening_status") or "").lower() in ("included", "ta_included", "ft_included")
    ]
    existing_assessments = db.query("rob_assessments", {"project_id": project_id})
    existing_study_ids = {a.get("study_id") for a in existing_assessments}

    studies_to_assess = [s for s in included if s.get("study_id") not in existing_study_ids]

    if not studies_to_assess:
        return {
            "run_id": "",
            "status": "idle",
            "active": False,
            "total_studies": 0,
            "completed_studies": 0,
            "failed_studies": 0,
            "flagged_questions_count": 0,
            "manual_review_ids": [],
            "error_message": "",
            "total": 0,
            "completed": 0,
            "message": "No included studies require RoB assessment.",
        }

    run_id = _uuid()
    pending_ids = [s["study_id"] for s in studies_to_assess]

    run_state = {
        "run_id": run_id,
        "status": "running",
        "active": True,
        "stage": "rob",
        "total_studies": len(studies_to_assess),
        "completed_studies": 0,
        "failed_studies": 0,
        "flagged_questions_count": 0,
        "manual_review_ids": [],
        "error_message": "",
        "total": len(studies_to_assess),
        "completed": 0,
        "current_study_id": pending_ids[0] if pending_ids else "",
        "done_ids": [],
        "pending_ids": list(pending_ids),
    }
    ROB_BATCH_RUNS[project_id] = run_state

    try:
        db.insert("rob_runs", {
            "run_id": run_id,
            "project_id": project_id,
            "trigger": trigger,
            "status": "active",
            "started_at": _now(),
            "finished_at": "",
            "total_studies": len(studies_to_assess),
            "completed_studies": 0,
            "failed_studies": 0,
            "flagged_questions_count": 0,
            "manual_review_ids_json": json.dumps([]),
            "current_study_id": run_state["current_study_id"],
            "done_ids_json": json.dumps([]),
            "pending_ids_json": json.dumps(pending_ids),
            "error_message": "",
            "error": "",
        })
        db.commit()
    except Exception as e:
        logger.warning(f"[RoB] Failed to persist initial rob_runs record: {e}")

    def _worker():
        worker_db = get_db_backend()
        try:
            for s in studies_to_assess:
                st_id = s["study_id"]
                if project_id not in ROB_BATCH_RUNS:
                    break
                state = ROB_BATCH_RUNS[project_id]
                if not state.get("active") or state.get("status") == "cancelled":
                    break

                state["current_study_id"] = st_id
                try:
                    res = assess_study_for_batch(
                        study_id=st_id,
                        project_id=project_id,
                        db=worker_db,
                        run_id=run_id,
                    )
                    if project_id not in ROB_BATCH_RUNS:
                        break
                    state["completed_studies"] += 1
                    state["completed"] += 1
                    if res.get("manual_review"):
                        state["manual_review_ids"].append(st_id)
                    if res.get("ai_reachable") is False:
                        if not state["error_message"]:
                            state["error_message"] = "AI service not reachable; created empty assessments"
                except Exception as ex:
                    logger.warning(f"[RoB] Batch assess error for {st_id}: {ex}")
                    if project_id not in ROB_BATCH_RUNS:
                        break
                    state["failed_studies"] += 1
                    current_err = state["error_message"]
                    state["error_message"] = f"{current_err} {st_id}: {ex}".strip()

                if project_id not in ROB_BATCH_RUNS:
                    break
                state["done_ids"].append(st_id)
                if st_id in state["pending_ids"]:
                    state["pending_ids"].remove(st_id)

                try:
                    worker_db.update("rob_runs", run_id, {
                        "completed_studies": state["completed_studies"],
                        "failed_studies": state["failed_studies"],
                        "manual_review_ids_json": json.dumps(state["manual_review_ids"]),
                        "current_study_id": state.get("current_study_id", ""),
                        "done_ids_json": json.dumps(state["done_ids"]),
                        "pending_ids_json": json.dumps(state["pending_ids"]),
                        "error_message": state["error_message"],
                    })
                    worker_db.commit()
                except Exception:
                    pass

            if project_id in ROB_BATCH_RUNS and ROB_BATCH_RUNS[project_id].get("status") != "cancelled":
                ROB_BATCH_RUNS[project_id]["status"] = "completed"
                ROB_BATCH_RUNS[project_id]["active"] = False
                ROB_BATCH_RUNS[project_id]["current_study_id"] = ""
                try:
                    worker_db.update("rob_runs", run_id, {
                        "status": "completed",
                        "finished_at": _now(),
                        "completed_studies": ROB_BATCH_RUNS[project_id]["completed_studies"],
                        "failed_studies": ROB_BATCH_RUNS[project_id]["failed_studies"],
                        "manual_review_ids_json": json.dumps(ROB_BATCH_RUNS[project_id]["manual_review_ids"]),
                        "current_study_id": "",
                        "error_message": ROB_BATCH_RUNS[project_id]["error_message"],
                    })
                    worker_db.commit()
                except Exception:
                    pass
        finally:
            worker_db.close()

    threading.Thread(target=_worker, daemon=True).start()

    return dict(run_state)
