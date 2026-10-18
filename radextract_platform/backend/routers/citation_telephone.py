"""Router for Citation Telephone claim extraction and verification using local Laya."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from services.citation_telephone_service import (
    extract_citations_and_claims_from_text,
    evaluate_passage_with_laya,
    get_laya_engine,
)

logger = logging.getLogger("radextract.citation_telephone")
router = APIRouter(prefix="/api/citation-telephone", tags=["citation-telephone"])


class AuditTextRequest(BaseModel):
    text: str = Field(..., description="Full text or manuscript excerpt with citations and references")


class EvaluateClaimPassageRequest(BaseModel):
    citing_sentence: str
    source_title: str = ""
    source_passage: str


@router.post("/audit-text")
async def audit_text(req: AuditTextRequest) -> Dict[str, Any]:
    """Parse raw text, extract citations and referenced context, and return structure."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    extracted = extract_citations_and_claims_from_text(req.text)
    return extracted


@router.post("/evaluate-claim")
async def evaluate_claim(req: EvaluateClaimPassageRequest) -> Dict[str, Any]:
    """Evaluate citing claim against cited source passage using local Laya System-1."""
    if not req.citing_sentence.strip():
        raise HTTPException(status_code=400, detail="Citing sentence cannot be empty")

    res = evaluate_passage_with_laya(
        citing_sentence=req.citing_sentence,
        source_title=req.source_title,
        source_passage=req.source_passage,
    )
    return res


@router.post("/upload-manuscript")
async def upload_manuscript(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload manuscript (.docx or .txt) and extract in-text citations and context claims."""
    filename = file.filename or "manuscript.txt"
    content = await file.read()

    text = ""
    if filename.endswith(".docx"):
        import io
        import docx
        doc = docx.Document(io.BytesIO(content))
        text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
    else:
        text = content.decode("utf-8", errors="ignore")

    extracted = extract_citations_and_claims_from_text(text)
    laya = get_laya_engine()

    # Pre-score top claims if available
    scored_claims = []
    for c in extracted["claims"][:15]:
        ev = evaluate_passage_with_laya(
            citing_sentence=c["citingSentence"],
            source_title="",
            source_passage=c["refText"],
            laya=laya,
        )
        scored_claims.append({
            **c,
            **ev,
        })

    return {
        "filename": filename,
        "totalClaimsFound": extracted["totalClaimsFound"],
        "totalReferencesFound": extracted["totalReferencesFound"],
        "references": extracted["references"],
        "claims": scored_claims,
        "engine": "local_laya_system_1" if laya is not None else "heuristic_fallback",
    }


@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Check Laya System-1 readiness for Citation Telephone."""
    laya = get_laya_engine()
    return {
        "status": "ready" if laya is not None else "degraded",
        "engine": "local_laya_system_1" if laya is not None else "offline",
        "model": "ModernBERT-large-system-1",
        "has_unsureness_matrix": True,
    }
