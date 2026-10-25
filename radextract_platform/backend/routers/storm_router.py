"""FastAPI Router for Stanford STORM & LAYA Multi-Perspective Deliberation."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.clinical_storm_service import (
    CLINICAL_PERSONAS,
    deliberate_study_flaws,
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


class FastTriageRequest(BaseModel):
    title: str
    abstract: str = ""
    topic: str = "vascular neurology"


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
def list_personas():
    """Return all active Stanford STORM clinical specialist personas."""
    return CLINICAL_PERSONAS


@router.post("/fast-triage")
def fast_triage(req: FastTriageRequest):
    """Run sub-150ms Laya System-1 screening for design flaws and specialty affinity."""
    return run_laya_fast_triage(req.title, req.abstract, req.topic)


@router.post("/deliberate")
def deliberate(req: DeliberateRequest):
    """Run full Clinical STORM multi-perspective grand rounds deliberation."""
    try:
        result = deliberate_study_flaws(
            title=req.title,
            abstract=req.abstract,
            extracted_variables=req.extracted_variables,
            topic=req.topic
        )
        return result
    except Exception as e:
        logger.exception("Clinical STORM deliberation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
