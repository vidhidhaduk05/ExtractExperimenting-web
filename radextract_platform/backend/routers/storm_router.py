"""FastAPI Router for Stanford STORM & LAYA Multi-Perspective Deliberation."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.clinical_storm_service import (
    CLINICAL_PERSONAS,
    deliberate_study_flaws,
    deliberate_protocol_flaws,
    resolve_personas_for_protocol,
    detect_clinical_domain,
    run_laya_fast_triage,
    get_laya_engine
)

logger = logging.getLogger("storm_router")
router = APIRouter(prefix="/storm", tags=["Clinical STORM"])


class DeliberateRequest(BaseModel):
    title: str = Field(..., description="Title of the clinical study")
    abstract: str = Field(default="", description="Abstract text of the clinical study")
    topic: str = Field(default="acute ischemic stroke & neurovascular intervention", description="PICO / clinical topic")
    extracted_variables: Optional[List[Dict[str, Any]]] = Field(default=None, description="Optional extracted variables")
    gathered_studies: Optional[List[Dict[str, Any]]] = Field(default=None, description="ClaimScape gathered studies")


class FastTriageRequest(BaseModel):
    title: str
    abstract: str = ""
    topic: str = "clinical medicine"


class ProtocolDeliberateRequest(BaseModel):
    pico: Dict[str, Any] = Field(default_factory=dict, description="PICO elements (population, index_test, comparator, outcome, study_design)")
    hypothesis: Optional[str] = Field(default="", description="Primary hypothesis")
    criteria: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Inclusion and exclusion criteria")
    research_question: Optional[str] = Field(default="", description="Research question")
    topic: str = Field(default="clinical medicine", description="General or specialized clinical topic")
    gathered_studies: Optional[List[Dict[str, Any]]] = Field(default=None, description="ClaimScape evidence base")
    max_reviewers: Optional[int] = Field(default=4, description="Configurable execution limit for AI reviewers to control latency")


class ResolvePersonasRequest(BaseModel):
    topic: str = Field(default="clinical medicine", description="Clinical topic")
    pico: Optional[Dict[str, Any]] = Field(default=None, description="PICO elements")
    gathered_studies: Optional[List[Dict[str, Any]]] = Field(default=None, description="ClaimScape evidence base")
    max_reviewers: Optional[int] = Field(default=4, description="Configurable limit for personas")


@router.get("/health")
def storm_health():
    """Verify local Laya System-1 engine and persona configuration."""
    engine = get_laya_engine()
    return {
        "status": "ready",
        "laya_loaded": engine is not None,
        "engine_type": "laya_system1_onnx" if engine is not None else "heuristic_fallback",
        "total_personas": len(CLINICAL_PERSONAS),
        "personas": [p["role"] for p in CLINICAL_PERSONAS]
    }


@router.get("/personas")
def list_personas(topic: Optional[str] = Query(None, description="Optional topic for dynamic resolution")):
    """Return active Stanford STORM clinical specialist personas, optionally adapted to a topic."""
    if topic:
        return resolve_personas_for_protocol(topic=topic)
    return CLINICAL_PERSONAS


@router.post("/resolve-personas")
def resolve_personas(req: ResolvePersonasRequest):
    """Dynamically resolve multidisciplinary personas based on protocol & ClaimScape gathered literature."""
    return resolve_personas_for_protocol(
        pico=req.pico,
        topic=req.topic,
        gathered_studies=req.gathered_studies,
        max_reviewers=req.max_reviewers or 4
    )


@router.post("/fast-triage")
def fast_triage(req: FastTriageRequest):
    """Run sub-150ms Laya System-1 screening for design flaws and specialty affinity."""
    return run_laya_fast_triage(req.title, req.abstract, req.topic)


@router.post("/deliberate")
def deliberate(req: DeliberateRequest):
    """Run full Clinical STORM multi-perspective grand rounds deliberation on an individual paper."""
    try:
        result = deliberate_study_flaws(
            title=req.title,
            abstract=req.abstract,
            extracted_variables=req.extracted_variables,
            topic=req.topic,
            gathered_studies=req.gathered_studies
        )
        return result
    except Exception as e:
        logger.exception("Clinical STORM paper deliberation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/deliberate-protocol")
def deliberate_protocol(req: ProtocolDeliberateRequest):
    """Run full Clinical STORM Grand Rounds deliberation on a study protocol (PICO + Hypotheses + Criteria)."""
    try:
        result = deliberate_protocol_flaws(
            pico=req.pico,
            hypothesis=req.hypothesis,
            criteria=req.criteria,
            research_question=req.research_question,
            topic=req.topic,
            gathered_studies=req.gathered_studies,
            max_reviewers=req.max_reviewers or 4
        )
        return result
    except Exception as e:
        logger.exception("Clinical STORM protocol deliberation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export-protocol")
def export_protocol(req: ProtocolDeliberateRequest):
    """Export study protocol conforming to PRISMA 2020 / PROSPERO standards (adapted from RevAIse/prismAId)."""
    try:
        from services.clinical_storm_service import export_prisma2020_protocol
        return export_prisma2020_protocol(
            pico=req.pico,
            hypothesis=req.hypothesis,
            criteria=req.criteria,
            research_question=req.research_question,
            topic=req.topic,
            gathered_studies=req.gathered_studies
        )
    except Exception as e:
        logger.exception("PRISMA 2020 protocol export failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
