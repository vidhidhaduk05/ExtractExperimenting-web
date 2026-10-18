"""FastAPI router for Rigor Scan methodology & reporting completeness analysis."""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import fitz

from services.rigor_scan_service import (
    run_full_rigor_scan,
    load_preset_example,
    load_check_specs,
    get_laya_model,
)

logger = logging.getLogger("radextract.rigor_scan")
router = APIRouter(prefix="/api/rigor-scan", tags=["rigor-scan"])


class ScanTextRequest(BaseModel):
    text: str = Field(..., description="Full text or manuscript excerpt to scan")
    title: Optional[str] = Field("Manuscript", description="Manuscript title")
    doi: Optional[str] = Field("", description="DOI if known")


@router.get("/example")
async def get_example() -> Dict[str, Any]:
    """Retrieve the full reference scan (Dubowitz et al. PLOS ONE)."""
    ex = load_preset_example()
    if not ex:
        raise HTTPException(status_code=404, detail="Example dataset not found")
    return ex


@router.get("/example/pdf")
async def get_example_pdf():
    """Serve the reference example PDF."""
    import os
    pdf_path = os.path.join(os.path.dirname(__file__), "..", "data", "example.pdf")
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path, media_type="application/pdf", filename="example.pdf")
    raise HTTPException(status_code=404, detail="Example PDF not found")


@router.get("/specs")
async def get_specs() -> List[Dict[str, Any]]:
    """Retrieve the 74 check specifications across the 6 domains."""
    return load_check_specs()


@router.post("/scan-text")
async def scan_text(req: ScanTextRequest) -> Dict[str, Any]:
    """Run full rigor scan on raw manuscript text."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        return run_full_rigor_scan(
            text=req.text,
            paper_title=req.title or "Manuscript",
            doi=req.doi or "",
        )
    except Exception as e:
        logger.error("Scan text failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan-pdf")
async def scan_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload PDF file, extract per-page text & layout, and execute rigor scan."""
    filename = file.filename or "paper.pdf"
    content = await file.read()
    
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        page_texts = [page.get_text() for page in doc]
        full_text = "\n".join(page_texts)
        page_count = len(doc)
        
        # Simple title extraction from first page lines
        first_page = page_texts[0] if page_texts else ""
        first_lines = [l.strip() for l in first_page.split("\n") if len(l.strip()) > 15]
        paper_title = first_lines[0] if first_lines else filename
        
        result = run_full_rigor_scan(
            text=full_text,
            paper_title=paper_title,
            page_count=page_count,
            page_texts=page_texts,
        )
        return result
    except Exception as e:
        logger.error("Scan PDF failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF extraction error: {str(e)}")


@router.get("/status")
async def rigor_status() -> Dict[str, Any]:
    """Check Laya System-1 model readiness for Rigor Scan."""
    laya = get_laya_model()
    return {
        "status": "ready" if laya is not None else "degraded",
        "engine": "local_laya_system_1" if laya is not None else "heuristic_fallback",
        "total_checks": 74,
        "domains": ["Study design", "Statistics", "Materials", "Data & code", "Ethics & disclosure", "Claims"],
        "software_verifiers": ["Statistics (HR/OR & p-value consistency)", "Retracted references & notices", "Cellosaurus cell line authentication", "Data, code & registries"],
    }
