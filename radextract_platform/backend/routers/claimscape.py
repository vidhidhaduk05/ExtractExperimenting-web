"""ClaimScape FastAPI router for dynamic high-speed claim mapping."""
from __future__ import annotations

import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

from services.claimscape_fast_pipeline import evaluate_claim_fast, _get_laya_model

logger = logging.getLogger("radextract.claimscape")

router = APIRouter(prefix="/api/claimscape", tags=["claimscape"])


class EvaluateRequest(BaseModel):
    claim: str = Field(..., description="The clinical claim statement (e.g. 'Metformin extends lifespan in humans')")
    query: Optional[str] = Field(None, description="Optional custom PubMed query string")
    count: Optional[int] = Field(None, ge=20, le=300, description="Target number of PubMed abstracts to read (20-300)")
    size: Optional[int] = Field(None, ge=20, le=300, description="Alias for count (k-dense parameter compatibility)")
    includeCommentary: Optional[bool] = Field(False, description="Whether to include narrative commentary/reviews")


@router.post("/evaluate")
async def evaluate_claim(request: EvaluateRequest) -> Dict[str, Any]:
    """Evaluate a clinical claim against PubMed literature in high-speed batch mode."""
    if not request.claim.strip():
        raise HTTPException(status_code=400, detail="Claim statement cannot be empty")

    effective_count = request.count or request.size or 200

    try:
        result = evaluate_claim_fast(
            claim=request.claim,
            query=request.query,
            count=effective_count,
        )
        return result
    except Exception as e:
        logger.error("ClaimScape evaluation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evaluation pipeline error: {str(e)}")


@router.post("/scan")
async def scan_claim(request: EvaluateRequest) -> Dict[str, Any]:
    """Direct alias for /evaluate matching k-dense scan endpoint."""
    return await evaluate_claim(request)


@router.get("/status")
async def claimscape_status() -> Dict[str, Any]:
    """Check Laya System-1 model and ClaimScape pipeline readiness."""
    laya = _get_laya_model()
    return {
        "status": "ready" if laya is not None else "degraded",
        "engine": "local_laya_onnx" if laya is not None else "heuristic_fallback",
        "model": "ModernBERT-large-system-1",
        "max_papers_per_batch": 300,
    }
