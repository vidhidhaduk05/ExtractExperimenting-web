"""Database helper utilities: decomposed JOINs and cross-table helpers for DBBackend."""
from __future__ import annotations
from typing import Optional, Any
from services.db_backend import DBBackend


def get_project_studies(db: DBBackend, project_id: str, order_by: str = "") -> list[dict]:
    """Get all studies for a project."""
    return db.query("studies", {"project_id": project_id}, order_by=order_by)


def get_project_variables(db: DBBackend, project_id: str, order_by: str = "") -> list[dict]:
    """Get all extraction variables defined for a project."""
    return db.query("variables", {"project_id": project_id}, order_by=order_by)


def get_study_extractions(db: DBBackend, study_id: str) -> list[dict]:
    """Get all extractions for a given study."""
    return db.query("extractions", {"study_id": study_id})


def get_project_extractions(db: DBBackend, project_id: str) -> list[dict]:
    """Get all extractions for all studies in a project (decomposed JOIN)."""
    studies = get_project_studies(db, project_id)
    result = []
    for s in studies:
        study_id = s.get("study_id")
        if study_id:
            result.extend(get_study_extractions(db, study_id))
    return result


def get_study_extractions_with_variable_names(db: DBBackend, study_id: str, project_id: Optional[str] = None) -> list[dict]:
    """Get extractions for a study enriched with variable_name, category, and data_type."""
    extractions = db.query("extractions", {"study_id": study_id})
    if not extractions:
        return []

    if not project_id:
        study = db.get("studies", study_id)
        if study:
            project_id = study.get("project_id")

    var_map = {}
    if project_id:
        variables = db.query("variables", {"project_id": project_id})
        var_map = {v["variable_id"]: v for v in variables}

    enriched = []
    for ext in extractions:
        item = dict(ext)
        var_info = var_map.get(item.get("variable_id"), {})
        item["variable_name"] = var_info.get("name", "")
        item["category"] = var_info.get("category", "")
        item["data_type"] = var_info.get("data_type", "")
        enriched.append(item)
    return enriched


def get_study_rob_assessment(db: DBBackend, study_id: str) -> Optional[dict]:
    """Get the risk-of-bias assessment for a study."""
    assessments = db.query("rob_assessments", {"study_id": study_id})
    return assessments[0] if assessments else None


def get_project_rob_assessments(db: DBBackend, project_id: str) -> list[dict]:
    """Get all risk-of-bias assessments for a project."""
    return db.query("rob_assessments", {"project_id": project_id})


def get_full_rob_assessment(db: DBBackend, assessment_id: str) -> Optional[dict]:
    """Get an RoB assessment with its domain judgments and signaling answers."""
    assessment = db.get("rob_assessments", assessment_id)
    if not assessment:
        return None

    judgments = db.query("rob_domain_judgments", {"assessment_id": assessment_id})
    answers = db.query("rob_signaling_answers", {"assessment_id": assessment_id})

    # Group answers by domain_id
    answers_by_domain = {}
    for a in answers:
        d_id = a.get("domain_id")
        if d_id:
            answers_by_domain.setdefault(d_id, []).append(a)

    for j in judgments:
        d_id = j.get("domain_id")
        j["signaling_answers"] = answers_by_domain.get(d_id, [])

    result = dict(assessment)
    result["domain_judgments"] = judgments
    return result


def get_study_screening_decision(db: DBBackend, study_id: str) -> Optional[dict]:
    """Get the latest screening decision for a study."""
    decisions = db.query("screening_decisions", {"study_id": study_id}, order_by="created_at DESC", limit=1)
    return decisions[0] if decisions else None
