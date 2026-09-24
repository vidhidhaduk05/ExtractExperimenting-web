"""
document.py — generic document parsing + search.

Parses a source document (PDF today; the interface is format-agnostic) into a
normalized structure consumed by the extractor backends:

    {full_text, pages[{page, text}], tables[{page, rows}], triage, n_pages, n_text_pages}

PDF libraries (pdfplumber / pymupdf) are imported *lazily* inside the parse
functions so that the package — and the full test suite, which uses text
fixtures — imports and runs even when those libraries are not installed.
"""
from __future__ import annotations
import re
from typing import Optional


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def parse_document(path: str, *, text_page_min_chars: int = 50,
                   full_text_frac: float = 0.8, partial_frac: float = 0.3,
                   use_pipeline: bool = False, ocr_backend=None, tsr_backend=None) -> dict:
    """Parse a document into the normalized structure.

    Currently dispatches by extension. PDFs are parsed with pdfplumber/fitz (lazy
    import). Plain-text/markdown files are read directly (useful for fixtures
    and non-PDF sources).
    """
    low = path.lower()
    if low.endswith(".pdf"):
        if use_pipeline:
            return parse_pdf_pipeline(
                path,
                text_page_min_chars=text_page_min_chars,
                full_text_frac=full_text_frac,
                partial_frac=partial_frac,
                ocr_backend=ocr_backend,
                tsr_backend=tsr_backend,
            )
        return _parse_pdf(path, text_page_min_chars, full_text_frac, partial_frac)
    if low.endswith((".txt", ".md", ".text")):
        return _parse_textfile(path)
    raise ValueError(f"Unsupported document type for {path!r}; "
                     "supported: .pdf, .txt, .md")


def parse_text(text: str, *, page_sep: str = "\f") -> dict:
    """Build the normalized structure directly from an in-memory string.

    Pages may be separated by form-feed (\\f). No external dependencies — this
    is the path used by deterministic tests and synthetic fixtures.
    """
    raw_pages = text.split(page_sep)
    pages = [{"page": i + 1, "text": t} for i, t in enumerate(raw_pages)]
    n_text = sum(1 for p in pages if len(p["text"].strip()) >= 50)
    n = len(pages)
    frac = (n_text / n) if n else 0.0
    triage = "FULL_TEXT" if frac >= 0.8 else ("PARTIAL" if frac >= 0.3 else "SCANNED")
    return {"full_text": "\n".join(p["text"] for p in pages), "pages": pages,
            "tables": [], "figures": [], "triage": triage, "n_pages": n, "n_text_pages": n_text}


def _parse_textfile(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return parse_text(fh.read())


def _parse_pdf(path: str, text_page_min_chars: int,
               full_text_frac: float, partial_frac: float) -> dict:
    try:
        import pdfplumber  # lazy
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise ImportError(
            "PDF parsing needs pdfplumber + pymupdf. Install with:\n"
            "    pip install pdfplumber pymupdf"
        ) from exc
    pages, tables, n_text = [], [], 0
    with pdfplumber.open(path) as pdf:
        for i, p in enumerate(pdf.pages, start=1):
            t = p.extract_text() or ""
            pages.append({"page": i, "text": t})
            if len(t.strip()) >= text_page_min_chars:
                n_text += 1
            for tbl in (p.extract_tables() or []):
                tables.append({"page": i, "rows": tbl})
    n = len(pages)
    frac = (n_text / n) if n else 0.0
    triage = ("FULL_TEXT" if frac >= full_text_frac
              else ("PARTIAL" if frac >= partial_frac else "SCANNED"))
    return {"full_text": "\n".join(p["text"] for p in pages), "pages": pages,
            "tables": tables, "figures": [], "triage": triage, "n_pages": n, "n_text_pages": n_text}


def parse_pdf_pipeline(path: str, *, text_page_min_chars: int = 50,
                       full_text_frac: float = 0.8, partial_frac: float = 0.3,
                       ocr_backend=None, tsr_backend=None) -> dict:
    """Full multi-channel PDF parsing pipeline:

        Layout Detection -> (Text: Native, Tables: TSR + Vision, Figures: OCR + Vision) -> Structured JSON
    """
    try:
        import pdfplumber
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise ImportError(
            "Pipeline PDF parsing needs pdfplumber + pymupdf. Install with:\n"
            "    pip install pdfplumber pymupdf"
        ) from exc

    from .layout import detect_page_layout
    from .tsr import HybridTSR
    from .ocr import NullOCRBackend
    from .structured import DocumentJSON, PageJSON, TableJSON, FigureJSON, to_parsed_dict

    ocr = ocr_backend or NullOCRBackend()
    tsr = tsr_backend or HybridTSR(ocr_backend=ocr)

    doc_id = path.replace("\\", "/").split("/")[-1].rsplit(".", 1)[0]
    pages_json: list[PageJSON] = []
    all_tables: list[TableJSON] = []
    all_figures: list[FigureJSON] = []
    n_text_pages = 0

    fitz_doc = fitz.open(path)
    with pdfplumber.open(path) as pdf_doc:
        n_pages = len(pdf_doc.pages)
        for idx in range(n_pages):
            page_num = idx + 1
            plumber_page = pdf_doc.pages[idx]
            fitz_page = fitz_doc[idx] if idx < len(fitz_doc) else None

            # Step 1: Layout Detection
            page_layout = detect_page_layout(page_num, pdfplumber_page=plumber_page, fitz_page=fitz_page)

            # Step 2: Multi-channel Routing
            text_chunks = []
            page_tables = []
            page_figures = []

            for reg in page_layout.regions:
                if reg.type == "text":
                    if reg.content:
                        text_chunks.append(str(reg.content))
                elif reg.type == "table":
                    rows = tsr.extract_table(pdfplumber_page=plumber_page, fitz_page=fitz_page, bbox=reg.bbox)
                    tbl_json = TableJSON(page=page_num, rows=rows, bbox=reg.bbox, extraction_method=tsr.name)
                    page_tables.append(tbl_json)
                    all_tables.append(tbl_json)
                elif reg.type == "figure":
                    fig_text = ""
                    if fitz_page and reg.bbox:
                        try:
                            rect = fitz.Rect(*reg.bbox)
                            pix = fitz_page.get_pixmap(clip=rect, dpi=200)
                            img_bytes = pix.tobytes("png")
                            fig_text = ocr.ocr(img_bytes)
                        except Exception:
                            pass
                    fig_json = FigureJSON(page=page_num, ocr_text=fig_text, bbox=reg.bbox)
                    page_figures.append(fig_json)
                    all_figures.append(fig_json)

            page_text = "\n".join(text_chunks).strip()
            if not page_text and plumber_page:
                page_text = plumber_page.extract_text() or ""

            if len(page_text.strip()) >= text_page_min_chars:
                n_text_pages += 1

            pages_json.append(
                PageJSON(
                    page=page_num,
                    text=page_text,
                    layout_type=page_layout.layout_type,
                    tables=page_tables,
                    figures=page_figures,
                )
            )

    fitz_doc.close()

    full_text = "\n".join(p.text for p in pages_json)
    frac = (n_text_pages / n_pages) if n_pages else 0.0
    triage = ("FULL_TEXT" if frac >= full_text_frac
              else ("PARTIAL" if frac >= partial_frac else "SCANNED"))

    doc_json = DocumentJSON(
        doc_id=doc_id,
        n_pages=n_pages,
        pages=pages_json,
        full_text=full_text,
        tables=all_tables,
        figures=all_figures,
        triage=triage,
        metadata={"extraction_method": "pipeline", "ocr_backend": ocr.name, "tsr_backend": tsr.name},
    )

    return to_parsed_dict(doc_json)


# --------------------------------------------------------------------------- #
# Search (whitespace-insensitive, proven necessary for two-column PDFs)
# --------------------------------------------------------------------------- #
def _norm(s: Optional[str]) -> str:
    return re.sub(r"\s+", "", (s or ""))


def find_in_document(parsed: dict, needle: str, *, window: int = 120,
                     flags: int = re.IGNORECASE) -> list:
    """Locate ``needle`` across pages; return list of (page, snippet).

    Falls back to a whitespace-insensitive scan because two-column PDF text
    extraction frequently drops spaces between adjacent tokens.
    """
    hits = []
    for pg in parsed["pages"]:
        text = pg.get("text") or ""
        for m in re.finditer(re.escape(needle), text, flags=flags):
            i = m.start()
            snip = text[max(0, i - window):i + window].replace("\n", " ")
            hits.append((pg["page"], snip))
    if hits:
        return hits
    # whitespace-insensitive fallback
    target = _norm(needle)
    if len(target) >= 4:
        for pg in parsed["pages"]:
            if target in _norm(pg.get("text")):
                hits.append((pg["page"], (pg.get("text") or "")[:2 * window].replace("\n", " ")))
    return hits


def in_document(parsed: dict, needle: str) -> bool:
    """True if ``needle`` appears anywhere (space-insensitive), incl. table cells."""
    nd = _norm(needle)
    if nd and nd in _norm(parsed.get("full_text")):
        return True
    for t in parsed.get("tables", []):
        for row in t.get("rows", []):
            for cv in row:
                if cv and nd in _norm(str(cv)):
                    return True
    return False
