"""FastAPI router for Rigor Scan methodology & reporting completeness analysis."""

from __future__ import annotations

import gc
import io
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile, Response, Body
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
async def scan_text(req: ScanTextRequest, response: Response) -> Dict[str, Any]:
    """Run full rigor scan on raw manuscript text with zero server retention."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    # Enforce strict zero-retention response headers
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Zero-Retention"] = "true"

    try:
        return run_full_rigor_scan(
            text=req.text,
            paper_title=req.title or "Manuscript",
            doi=req.doi or "",
        )
    except Exception as e:
        logger.error("Scan text failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        gc.collect()


def extract_text_from_docx_bytes(content: bytes, filename: str) -> tuple[str, list[str], str]:
    """Extract full text, pseudo-pages/sections, and title strictly in memory from DOCX bytes."""
    paragraphs: list[str] = []
    title = filename.rsplit(".", 1)[0]

    try:
        import docx
        with io.BytesIO(content) as bio:
            doc = docx.Document(bio)
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
            with io.BytesIO(content) as bio:
                with zipfile.ZipFile(bio) as z:
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
async def scan_pdf(file: UploadFile = File(...), response: Response = None) -> Dict[str, Any]:
    """Upload PDF, DOCX, or text file, extract text & layout, and execute rigor scan.
    
    Zero Server Retention Policy:
    Files are parsed strictly in volatile RAM. No file or extracted text is EVER
    saved to server disk, temporary directories, or database. Buffers are purged
    immediately upon scan completion.
    """
    if response:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Zero-Retention"] = "true"

    filename = file.filename or "manuscript.pdf"
    content: bytes = b""
    doc = None

    try:
        content = await file.read()
        lower_name = filename.lower()

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
            # PDF via fitz / PyMuPDF strictly from in-memory byte stream
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
    finally:
        # Guarantee all stream resources, file handles, and memory are purged
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass
        try:
            await file.close()
        except Exception:
            pass
        del content
        gc.collect()


@router.post("/lookup")
async def lookup_registries(req: Dict[str, Any] = Body(...)) -> Any:
    """Live registry and reference resolver for DOI, PMID, ClinicalTrials, Cellosaurus."""
    import httpx
    client = httpx.AsyncClient(timeout=25.0)
    try:
        resp = await client.post(
            "https://www.k-dense.ai/api/rigor-scan/lookup",
            json=req,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Content-Type": "application/json"}
        )
        if resp.status_code == 200:
            return resp.json()
        return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")
    except Exception as e:
        logger.warning("Rigor lookup bypass: %s", e)
        return {"refs": {}, "cells": {}, "links": {}}
    finally:
        await client.aclose()


@router.post("/scan")
async def scan_paragraphs(req: Dict[str, Any] = Body(...)) -> Response:
    """Stream live rigor scan evaluation across manuscript paragraphs."""
    import httpx
    client = httpx.AsyncClient(timeout=45.0)
    try:
        resp = await client.post(
            "https://www.k-dense.ai/api/rigor-scan/scan",
            json=req,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Content-Type": "application/json"}
        )
        return Response(content=resp.content, status_code=resp.status_code, media_type="text/plain")
    except Exception as e:
        logger.error("Rigor scan forward error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.aclose()


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
