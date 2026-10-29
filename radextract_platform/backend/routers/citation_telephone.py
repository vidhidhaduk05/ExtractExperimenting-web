"""Router for Citation Telephone claim extraction and verification using local Laya."""

from __future__ import annotations

import logging
from typing import Any, Dict
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
    if not req.source_passage.strip():
        raise HTTPException(status_code=400, detail="Provide the actual source passage, not a bibliography entry")
    laya = get_laya_engine()
    if laya is None:
        raise HTTPException(status_code=503, detail="Local Laya is unavailable. No citation verdict was generated.")

    res = evaluate_passage_with_laya(
        citing_sentence=req.citing_sentence,
        source_title=req.source_title,
        source_passage=req.source_passage,
        laya=laya,
    )
    if res.get("engine") != "local_laya_system_1":
        raise HTTPException(status_code=503, detail="Local Laya evaluation failed. No citation verdict was generated.")
    return res


@router.post("/upload-manuscript")
async def upload_manuscript(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload manuscript (.docx or .txt) and extract in-text citations and context claims."""
    filename = file.filename or "manuscript.txt"
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in {"docx", "txt"}:
        raise HTTPException(status_code=415, detail="Upload a .docx or UTF-8 .txt manuscript. PDF parsing is not supported here.")
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Manuscript exceeds the 20 MB limit")

    text = ""
    if extension == "docx":
        import io
        import docx
        try:
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Could not read this DOCX manuscript") from exc
    else:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="Text manuscripts must use UTF-8 encoding") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="Manuscript contains no readable paragraph text")

    extracted = extract_citations_and_claims_from_text(text)
    return {
        "filename": filename,
        **extracted,
        "engine": "citation_parser",
        "verificationStatus": "source_passages_required",
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
