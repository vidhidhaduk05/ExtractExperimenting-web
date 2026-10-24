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


def extract_text_from_docx_bytes(content: bytes, filename: str) -> tuple[str, list[str], str]:
    """Extract full text, pseudo-pages/sections, and title from DOCX bytes."""
    paragraphs: list[str] = []
    title = filename.rsplit(".", 1)[0]

    try:
        import docx
        doc = docx.Document(io.BytesIO(content))
        for p in doc.paragraphs:
            clean = p.text.strip()
            if clean:
                paragraphs.append(clean)
        for table in doc.tables:
            for row in table.rows:
                row_str = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
                if row_str:
                    paragraphs.append(row_str)

        if paragraphs:
            for p in paragraphs:
                if len(p) > 15:
                    title = p[:140]
                    break
    except Exception as docx_err:
        logger.warning("python-docx extraction failed, trying zipfile XML parser: %s", docx_err)
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                xml_content = z.read("word/document.xml")
                tree = ET.fromstring(xml_content)
                parts = []
                for elem in tree.iter():
                    if elem.tag.endswith("}t") and elem.text:
                        parts.append(elem.text)
                    elif elem.tag.endswith("}p"):
                        parts.append("\n")
                raw_text = "".join(parts).strip()
                paragraphs = [p.strip() for p in raw_text.split("\n") if p.strip()]
                if paragraphs:
                    title = paragraphs[0][:140]
        except Exception as zip_err:
            logger.error("DOCX XML extraction also failed: %s", zip_err)
            raise docx_err

    full_text = "\n\n".join(paragraphs)

    # Chunk into ~400 word pages for reader navigation
    pages: list[str] = []
    current_page: list[str] = []
    words = 0
    for p in paragraphs:
        current_page.append(p)
        words += len(p.split())
        if words >= 400:
            pages.append("\n\n".join(current_page))
            current_page = []
            words = 0
    if current_page:
        pages.append("\n\n".join(current_page))

    return full_text, pages or [full_text], title


@router.post("/scan-file")
@router.post("/scan-pdf")
@router.post("/scan-docx")
async def scan_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload PDF, DOCX, or text file, extract text & layout, and execute rigor scan."""
    filename = file.filename or "manuscript.pdf"
    content = await file.read()
    lower_name = filename.lower()

    try:
        # Check if DOCX (by extension or zip magic bytes PK\x03\x04)
        if lower_name.endswith(".docx") or (content[:4] == b"PK\x03\x04" and not lower_name.endswith(".pdf")):
            full_text, page_texts, paper_title = extract_text_from_docx_bytes(content, filename)
            page_count = max(len(page_texts), 1)
        elif lower_name.endswith(".txt") or lower_name.endswith(".md"):
            full_text = content.decode("utf-8", errors="replace")
            page_texts = [p.strip() for p in full_text.split("\n\n\n") if p.strip()] or [full_text]
            page_count = len(page_texts)
            paper_title = filename.rsplit(".", 1)[0]
        else:
            # PDF via fitz / PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            page_texts = [page.get_text() for page in doc]
            full_text = "\n".join(page_texts)
            page_count = len(doc)

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
        logger.error("Scan manuscript file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Manuscript extraction error: {str(e)}")


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
