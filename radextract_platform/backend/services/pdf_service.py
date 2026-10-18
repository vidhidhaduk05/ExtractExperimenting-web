"""PDF processing service: wraps document_processor and persists results.

Uses DoclingProcessor (if installed) or FallbackProcessor (pdfplumber)
to convert uploaded PDFs into structured JSON with text, pages, tables,
and bounding-box annotations. Results are stored in the pdf_documents
table for retrieval by the frontend PDF viewer and AI pre-fill.
"""
from __future__ import annotations
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services.storage_backend import resolve_pdf_path
from radextract_core.radextract.document_processor import (
    convert_with_fallback, ProcessedDocument, DoclingProcessor, FallbackProcessor,
)


def process_pdf(study_id: str, db: Optional[DBBackend] = None) -> dict:
    """Process the uploaded PDF for a study and store results.

    Reads the PDF path from studies.pdf_path, runs it through the best
    available processor, and stores the structured output in pdf_documents.

    Returns the stored document as a dict.
    Raises ValueError if the study has no uploaded PDF.
    """
    db = db or get_db_backend()
    study = db.get("studies", study_id)
    if not study:
        raise ValueError(f"Study not found: {study_id}")
    pdf_path = resolve_pdf_path(study.get("pdf_path", ""))
    if not pdf_path:
        raise ValueError(f"No uploaded PDF for study {study_id}")

    # Convert with graceful fallback
    doc = convert_with_fallback(pdf_path, doc_id=study_id, prefer_docling=True)

    # Build storage dict
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    full_text = doc.parsed.get("full_text", "")
    pages_json = json.dumps(doc.parsed.get("pages", []), ensure_ascii=False)
    annotations = doc.as_dict().get("annotations", {})
    annotations_json = json.dumps(annotations, ensure_ascii=False)
    tables_json = json.dumps(doc.parsed.get("tables", []), ensure_ascii=False)
    metadata_json = json.dumps(doc.metadata, ensure_ascii=False)
    engine = doc.metadata.get("engine", "unknown")

    # Delete any existing record for this study
    existing = db.query("pdf_documents", {"study_id": study_id})
    for e in existing:
        db.delete("pdf_documents", e["doc_id"])

    # Insert new record
    db.insert("pdf_documents", {
        "doc_id": doc_id,
        "study_id": study_id,
        "full_text": full_text,
        "pages_json": pages_json,
        "annotations_json": annotations_json,
        "tables_json": tables_json,
        "metadata_json": metadata_json,
        "processor_engine": engine,
        "processed_at": now,
    })

    # Update study status
    db.update("studies", study_id, {"pdf_status": "processed"})
    db.commit()

    return {
        "doc_id": doc_id,
        "study_id": study_id,
        "full_text": full_text,
        "n_pages": doc.parsed.get("n_pages", 0),
        "n_text_pages": doc.parsed.get("n_text_pages", 0),
        "triage": doc.parsed.get("triage", "UNKNOWN"),
        "processor_engine": engine,
        "processed_at": now,
        "n_tables": len(doc.parsed.get("tables", [])),
        "n_annotations": len(annotations.get("texts", [])),
    }


def get_pdf_data(study_id: str, db: Optional[DBBackend] = None) -> Optional[dict]:
    """Retrieve processed PDF data for a study.

    Returns full text, pages, annotations, tables, and metadata.
    Returns None if no processed document exists.
    """
    db = db or get_db_backend()
    rows = db.query("pdf_documents", {"study_id": study_id})
    if not rows:
        return None
    row = rows[0]

    return {
        "doc_id": row.get("doc_id", ""),
        "study_id": row.get("study_id", ""),
        "full_text": row.get("full_text", ""),
        "pages": json.loads(row["pages_json"]) if row.get("pages_json") else [],
        "annotations": json.loads(row["annotations_json"]) if row.get("annotations_json") else {},
        "tables": json.loads(row["tables_json"]) if row.get("tables_json") else [],
        "metadata": json.loads(row["metadata_json"]) if row.get("metadata_json") else {},
        "processor_engine": row.get("processor_engine", ""),
        "processed_at": row.get("processed_at", ""),
    }


def get_full_text(study_id: str, db: Optional[DBBackend] = None) -> str:
    """Convenience: return just the full text of the processed PDF.

    Returns empty string if no processed document exists.
    """
    db = db or get_db_backend()
    rows = db.query("pdf_documents", {"study_id": study_id})
    return rows[0].get("full_text", "") if rows else ""


def delete_pdf_data(study_id: str, db: Optional[DBBackend] = None) -> bool:
    """Delete processed PDF data for a study."""
    db = db or get_db_backend()
    rows = db.query("pdf_documents", {"study_id": study_id})
    if not rows:
        return False
    for r in rows:
        db.delete("pdf_documents", r["doc_id"])
    db.commit()
    return True


def get_pdf_summary(study_id: str, db: Optional[DBBackend] = None) -> dict:
    """Get a lightweight summary of the processed PDF (no full text)."""
    db = db or get_db_backend()
    rows = db.query("pdf_documents", {"study_id": study_id})
    if not rows:
        return {"study_id": study_id, "processed": False}
    row = rows[0]
    full_text = row.get("full_text") or ""
    tables_json = row.get("tables_json") or ""
    pages_json = row.get("pages_json") or ""

    return {
        "doc_id": row.get("doc_id", ""),
        "study_id": row.get("study_id", ""),
        "processed": True,
        "processor_engine": row.get("processor_engine", ""),
        "processed_at": row.get("processed_at", ""),
        "text_length": len(full_text),
        "has_tables": len(tables_json) > 4,
    }


def extract_pdf_metadata(pdf_bytes: bytes) -> dict:
    """Extract title and authors from PDF metadata.

    Tries pdfplumber's metadata first, then falls back to pypdfium2.
    If metadata is empty, attempts to extract a title from the first page text.

    Args:
        pdf_bytes: Raw PDF file bytes.

    Returns:
        dict with keys: title (str), authors (str)
    """
    title = ""
    authors = ""

    # Try pdfplumber first
    try:
        import pdfplumber
        import io as _io
        with pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf:
            meta = pdf.metadata or {}
            title = meta.get("Title", "") or ""
            authors = meta.get("Author", "") or ""

            # If no title in metadata, try to extract from first page
            if not title and len(pdf.pages) > 0:
                first_page = pdf.pages[0]
                text = first_page.extract_text() or ""
                lines = [l.strip() for l in text.split("\n") if l.strip()]
                # Heuristic: the title is usually in the first few non-empty lines
                # Skip lines that look like journal names, DOIs, or headers
                for line in lines[:10]:
                    # Skip DOI lines, URL lines, very short lines, or lines that are all caps journal names
                    if line.startswith("doi:") or line.startswith("DOI:") or line.startswith("http"):
                        continue
                    if line.startswith("©") or line.startswith("(c)"):
                        continue
                    if len(line) < 10:
                        continue
                    # If the line looks like a title (mixed case, reasonable length)
                    if len(line) > 15 and not line.isupper():
                        title = line
                        break
                    elif len(line) > 15:
                        title = line
                        break
    except Exception:
        pass

    # Fallback: try pypdfium2 if pdfplumber didn't get metadata
    if not title or not authors:
        try:
            import pypdfium2 as pdfium
            import io as _io
            doc = pdfium.PdfDocument(_io.BytesIO(pdf_bytes))
            meta = doc.get_metadata_dict()
            if not title:
                title = meta.get("Title", "") or ""
            if not authors:
                authors = meta.get("Author", "") or ""
            doc.close()
        except Exception:
            pass

    # Clean up
    title = title.strip() if title else ""
    authors = authors.strip() if authors else ""

    # If authors looks like a single name or "et al", keep it
    # If it's an institution or empty, leave it
    if authors and len(authors) > 200:
        authors = authors[:200]

    return {"title": title, "authors": authors}
