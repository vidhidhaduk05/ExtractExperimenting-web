"""
document_processor.py — Docling wrapper for PDF → structured JSON with bounding boxes.

This is the bridge between raw PDFs and the LitExtract extraction pipeline. It
uses IBM Docling's DocumentConverter to produce:
  1. A LitExtract-compatible normalized parsed dict (full_text, pages, tables, ...)
     that feeds directly into the extraction agents.
  2. A bounding-box annotation layer (text/table/figure locations per page) that
     powers the PDF.js highlight overlay in the review web app.

Design:
  - DoclingProcessor: wraps DocumentConverter with lazy init + caching.
  - FallbackProcessor: uses the existing pdfplumber-based parse_document() when
    Docling is unavailable or fails on a specific PDF.
  - ProcessedDocument: unified output containing both the parsed dict and the
    annotation layer, plus metadata.

The annotation layer is the key addition over LitExtract's document.py: every
extracted text segment, table cell, and figure carries a page number and bbox
(l, t, r, b in normalized [0,1] coordinates relative to page size), so the
review UI can draw highlight rectangles over the PDF.
"""
from __future__ import annotations
import os
import gc
import json
import time
import hashlib
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Tuple

logger = logging.getLogger("radextract.document_processor")

from . import table_rebuild  # noqa: E402

# Disable PyTorch compilation to avoid warnings (matches Docling server convention)
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")


# --------------------------------------------------------------------------- #
# Annotation data structures (bounding-box layer for PDF highlight overlay)
# --------------------------------------------------------------------------- #
@dataclass
class TextAnnotation:
    """A text segment with its location on the page."""
    page: int
    text: str
    label: str                      # section_header, paragraph, caption, footnote, ...
    bbox: Optional[Tuple[float, float, float, float]] = None  # (l, t, r, b) normalized [0,1]
    char_span: Optional[Tuple[int, int]] = None               # (start, end) in full_text

    def as_dict(self) -> dict:
        return {"page": self.page, "text": self.text, "label": self.label,
                "bbox": self.bbox, "char_span": self.char_span}


@dataclass
class TableAnnotation:
    """A table with its location and cell-level bounding boxes."""
    page: int
    rows: List[List[str]] = field(default_factory=list)
    bbox: Optional[Tuple[float, float, float, float]] = None
    n_rows: int = 0
    n_cols: int = 0
    cell_bboxes: List[dict] = field(default_factory=list)  # [{row, col, bbox, text}]

    def as_dict(self) -> dict:
        return {"page": self.page, "rows": self.rows, "bbox": self.bbox,
                "n_rows": self.n_rows, "n_cols": self.n_cols,
                "cell_bboxes": self.cell_bboxes}


@dataclass
class FigureAnnotation:
    """A figure/image with its location."""
    page: int
    bbox: Optional[Tuple[float, float, float, float]] = None
    caption: str = ""
    image_path: Optional[str] = None

    def as_dict(self) -> dict:
        return {"page": self.page, "bbox": self.bbox,
                "caption": self.caption, "image_path": self.image_path}


@dataclass
class ProcessedDocument:
    """Unified output: parsed dict (for extraction) + annotations (for UI)."""
    doc_id: str
    parsed: dict                    # LitExtract normalized format
    text_annotations: List[TextAnnotation] = field(default_factory=list)
    table_annotations: List[TableAnnotation] = field(default_factory=list)
    figure_annotations: List[FigureAnnotation] = field(default_factory=list)
    page_sizes: Dict[int, Tuple[float, float]] = field(default_factory=dict)  # {page: (w, h)}
    metadata: dict = field(default_factory=dict)

    @property
    def n_pages(self) -> int:
        return self.parsed.get("n_pages", 0)

    @property
    def triage(self) -> str:
        return self.parsed.get("triage", "UNKNOWN")

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.as_dict(), indent=indent, ensure_ascii=False)

    def as_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "parsed": self.parsed,
            "annotations": {
                "texts": [a.as_dict() for a in self.text_annotations],
                "tables": [a.as_dict() for a in self.table_annotations],
                "figures": [a.as_dict() for a in self.figure_annotations],
            },
            "page_sizes": {str(k): v for k, v in self.page_sizes.items()},
            "metadata": self.metadata,
        }


# --------------------------------------------------------------------------- #
# Processors
# --------------------------------------------------------------------------- #
class DoclingProcessor:
    """Wraps IBM Docling's DocumentConverter for PDF → structured JSON.

    Lazy-initializes the converter on first use (Docling + PyTorch is heavy).
    The converter instance is cached for reuse across documents.
    """

    def __init__(self, *, image_scale: float = 2.0):
        self._converter = None
        self._image_scale = image_scale
        self._available = self._check_available()

    @staticmethod
    def _check_available() -> bool:
        try:
            import docling  # noqa: F401
            return True
        except ImportError:
            return False

    @property
    def available(self) -> bool:
        return self._available

    @property
    def name(self) -> str:
        return "docling"

    def _get_converter(self):
        if self._converter is None and self._available:
            gc.collect()
            from docling.document_converter import DocumentConverter
            self._converter = DocumentConverter()
        return self._converter

    def convert(self, pdf_path: str, *, doc_id: Optional[str] = None) -> ProcessedDocument:
        """Convert a single PDF to a ProcessedDocument.

        Raises RuntimeError if Docling is not available or conversion fails.
        """
        if not self._available:
            raise RuntimeError("Docling is not available. Use FallbackProcessor instead.")

        converter = self._get_converter()
        if converter is None:
            raise RuntimeError("Failed to initialize Docling converter.")

        if doc_id is None:
            doc_id = os.path.splitext(os.path.basename(pdf_path))[0]

        t0 = time.time()
        conv_result = converter.convert(pdf_path)
        doc = conv_result.document
        doc_dict = doc.export_to_dict()
        elapsed = time.time() - t0

        parsed, text_anns, table_anns, fig_anns, page_sizes = self._build_from_docling(doc, doc_dict)

        return ProcessedDocument(
            doc_id=doc_id,
            parsed=parsed,
            text_annotations=text_anns,
            table_annotations=table_anns,
            figure_annotations=fig_anns,
            page_sizes=page_sizes,
            metadata={
                "engine": "docling",
                "source_path": pdf_path,
                "conversion_time_seconds": round(elapsed, 3),
                "docling_version": getattr(__import__('docling'), '__version__', 'unknown'),
            },
        )

    def convert_batch(self, pdf_paths: List[str]) -> List[ProcessedDocument]:
        """Convert multiple PDFs. Failed conversions are skipped with a warning."""
        results = []
        for path in pdf_paths:
            try:
                results.append(self.convert(path))
            except Exception as e:
                # Don't let one bad PDF kill the batch
                results.append(ProcessedDocument(
                    doc_id=os.path.splitext(os.path.basename(path))[0],
                    parsed={"full_text": "", "pages": [], "tables": [], "figures": [],
                            "triage": "ERROR", "n_pages": 0, "n_text_pages": 0},
                    metadata={"engine": "docling", "source_path": path, "error": str(e)},
                ))
        return results

    # ----------------------------------------------------------------------- #
    # Docling → normalized format conversion
    # ----------------------------------------------------------------------- #
    def _build_from_docling(self, doc, doc_dict: dict):
        """Convert a DoclingDocument into parsed dict + annotation lists.

        Docling's document model:
          - doc.texts: list[TextItem] with .text, .label, .prov[{page_no, bbox, charspan}]
          - doc.tables: list[TableItem] with .data (TableData), .prov
          - doc.pictures: list[PictureItem] with .prov, .captions
          - doc.pages: dict[int, PageItem] with .size (w, h)
        """
        # --- Page sizes ---
        page_sizes = {}
        pages_dict = doc_dict.get("pages", {})
        for page_no_str, page_info in pages_dict.items():
            page_no = int(page_no_str)
            size = page_info.get("size")
            if size:
                # Docling v2.122+ uses dict with width/height keys
                if isinstance(size, dict):
                    w = float(size.get("width", 0))
                    h = float(size.get("height", 0))
                elif isinstance(size, (list, tuple)) and len(size) >= 2:
                    w = float(size[0])
                    h = float(size[1])
                else:
                    w = h = 0.0
                if w > 0 and h > 0:
                    page_sizes[page_no] = (w, h)

        # --- Text items → pages + annotations ---
        page_texts: Dict[int, List[str]] = {}
        text_annotations: List[TextAnnotation] = []
        full_text_parts: List[str] = []
        char_offset = 0

        for text_item in doc.texts:
            text = text_item.text or ""
            label = text_item.label or "paragraph"
            provs = text_item.prov or []

            if not provs:
                # No provenance — still include in full_text
                full_text_parts.append(text)
                char_offset += len(text) + 1  # +1 for newline
                continue

            for prov in provs:
                page_no = prov.page_no + 1  # Docling uses 0-indexed pages
                bbox = self._normalize_bbox(prov.bbox, page_sizes.get(page_no))
                char_span = (char_offset, char_offset + len(text))

                page_texts.setdefault(page_no, []).append(text)
                text_annotations.append(TextAnnotation(
                    page=page_no, text=text, label=label,
                    bbox=bbox, char_span=char_span,
                ))

            full_text_parts.append(text)
            char_offset += len(text) + 1

        # --- Table items ---
        table_annotations: List[TableAnnotation] = []
        tables_parsed: List[dict] = []

        for tbl_item in doc.tables:
            provs = tbl_item.prov or []
            page_no = (provs[0].page_no + 1) if provs else 1
            bbox = self._normalize_bbox(provs[0].bbox, page_sizes.get(page_no)) if provs else None

            data = tbl_item.data
            grid = self._table_data_to_rows(data) if data else []

            # Upright, per-record layout + checks against the PDF text (see table_rebuild.py).
            layout = table_rebuild.analyze_table(
                pdf_path, page_no, provs[0].bbox if provs else None, grid,
            )
            rows = layout["rows"]
            index_map = layout["index_map"]
            table_id = f"t{len(tables_parsed) + 1}"

            # Cell-level bounding boxes so highlights match rows. Word-position tables carry their
            # own boxes (one per cell); Docling tables are re-pointed at the upright grid.
            cell_bboxes = []
            if layout["cell_boxes"] is not None:
                cell_bboxes = [
                    {"row": cb["row"], "col": cb["col"], "text": cb["text"], "bbox": cb["bbox"]}
                    for cb in layout["cell_boxes"]
                ]
            elif data and data.table_cells:
                for cell in data.table_cells:
                    cell_bbox = self._normalize_bbox(cell.bbox, page_sizes.get(page_no))
                    mapped = index_map(cell.start_row_offset_idx, cell.start_col_offset_idx)
                    if mapped is None:  # title or spacer cell removed from the upright grid
                        continue
                    r, c = mapped
                    cell_bboxes.append({
                        "row": r,
                        "col": c,
                        "text": cell.text or "",
                        "bbox": cell_bbox,
                    })

            n_rows = len(rows)
            n_cols = max((len(r) for r in rows), default=0)

            table_annotations.append(TableAnnotation(
                page=page_no, rows=rows, bbox=bbox,
                n_rows=n_rows, n_cols=n_cols, cell_bboxes=cell_bboxes,
            ))
            tables_parsed.append({
                "type": "table",
                "table_id": table_id,
                "page": page_no,
                "orientation": layout["orientation"],
                "method": layout["method"],  # word_positions | docling_transposed | docling_grid
                "rows": rows,            # upright: row 0 = header, one row per record
                "header": layout["header"],
                "records": layout["records"],
                "caption": layout.get("caption", ""),  # table title peeled off an upright table
                "raw_rows": grid,        # exactly what Docling returned, for audit
                "issues": layout["issues"],
            })

        # --- Picture/figure items ---
        figure_annotations: List[FigureAnnotation] = []
        figures_parsed: List[dict] = []

        for pic_item in doc.pictures:
            provs = pic_item.prov or []
            page_no = (provs[0].page_no + 1) if provs else 1
            bbox = self._normalize_bbox(provs[0].bbox, page_sizes.get(page_no)) if provs else None

            # Extract caption from linked caption items
            caption = ""
            if pic_item.captions:
                for cap_ref in pic_item.captions:
                    cap_text = doc._fetch_ref(cap_ref) if hasattr(doc, '_fetch_ref') else None
                    if cap_text and hasattr(cap_text, 'text'):
                        caption = cap_text.text
                        break

            figure_annotations.append(FigureAnnotation(
                page=page_no, bbox=bbox, caption=caption,
            ))
            figures_parsed.append({
                "page": page_no, "bbox": bbox, "caption": caption,
                "ocr_text": "", "image_path": None,
            })

        # --- Assemble pages list ---
        all_page_nos = sorted(set(page_sizes.keys()) | set(page_texts.keys()))
        if not all_page_nos:
            all_page_nos = [1]

        pages_list = []
        n_text_pages = 0
        for pno in all_page_nos:
            texts = page_texts.get(pno, [])
            page_text = "\n".join(texts)
            if len(page_text.strip()) >= 50:
                n_text_pages += 1
            pages_list.append({"page": pno, "text": page_text})

        n_pages = len(all_page_nos)
        full_text = "\n".join(full_text_parts)
        frac = (n_text_pages / n_pages) if n_pages else 0.0
        triage = "FULL_TEXT" if frac >= 0.8 else ("PARTIAL" if frac >= 0.3 else "SCANNED")

        parsed = {
            "full_text": full_text,
            "pages": pages_list,
            "tables": tables_parsed,
            "figures": figures_parsed,
            "triage": triage,
            "n_pages": n_pages,
            "n_text_pages": n_text_pages,
            "extraction_method": "docling",
        }

        return parsed, text_annotations, table_annotations, figure_annotations, page_sizes

    @staticmethod
    def _normalize_bbox(bbox, page_size: Optional[Tuple[float, float]]) -> Optional[Tuple[float, float, float, float]]:
        """Normalize a Docling BoundingBox to [0,1] coordinates relative to page size.

        Docling bbox: {l, t, r, b, coord_origin}
        coord_origin can be BOTTOMLEFT or TOPLEFT.
        We output (l, t, r, b) in TOPLEFT origin, normalized to [0,1].
        """
        if bbox is None or page_size is None:
            return None

        w, h = page_size
        if w <= 0 or h <= 0:
            return None

        l = float(getattr(bbox, 'l', 0))
        t = float(getattr(bbox, 't', 0))
        r = float(getattr(bbox, 'r', 0))
        b = float(getattr(bbox, 'b', 0))
        origin = getattr(bbox, 'coord_origin', None)

        # Convert to TOPLEFT origin if needed
        if origin and hasattr(origin, 'value'):
            origin_val = str(origin.value).lower()
        elif origin and hasattr(origin, 'lower'):
            origin_val = str(origin).lower()
        else:
            origin_val = str(origin).lower() if origin else "topleft"

        if "bottom" in origin_val:
            # Flip Y axis: top = h - b, bottom = h - t
            t, b = h - b, h - t

        # Normalize to [0,1]
        return (
            max(0.0, min(1.0, l / w)),
            max(0.0, min(1.0, t / h)),
            max(0.0, min(1.0, r / w)),
            max(0.0, min(1.0, b / h)),
        )

    @staticmethod
    def _table_data_to_rows(data) -> List[List[str]]:
        """Convert Docling TableData to a list-of-lists row format."""
        if data is None or data.table_cells is None:
            return []

        n_rows = data.num_rows
        n_cols = data.num_cols
        grid = [[""] * n_cols for _ in range(n_rows)]

        for cell in data.table_cells:
            r = cell.start_row_offset_idx
            c = cell.start_col_offset_idx
            if 0 <= r < n_rows and 0 <= c < n_cols:
                grid[r][c] = cell.text or ""

        return grid


class FallbackProcessor:
    """Fallback PDF processor using LitExtract's existing pdfplumber-based parser.

    Produces the same ProcessedDocument interface but without bounding boxes
    (pdfplumber doesn't provide per-segment provenance). Used when Docling is
    not installed or fails on a specific PDF.
    """

    @property
    def available(self) -> bool:
        return True

    @property
    def name(self) -> str:
        return "fallback"

    def convert(self, pdf_path: str, *, doc_id: Optional[str] = None) -> ProcessedDocument:
        from ..litextract.document import parse_document

        if doc_id is None:
            doc_id = os.path.splitext(os.path.basename(pdf_path))[0]

        t0 = time.time()
        parsed = parse_document(pdf_path) # _autorotate is handled in process_pdf if used from facade
        elapsed = time.time() - t0

        # Build minimal annotations from page text (no bbox info)
        text_annotations = []
        for pg in parsed.get("pages", []):
            text_annotations.append(TextAnnotation(
                page=pg["page"], text=pg.get("text", ""), label="page",
                bbox=None,
            ))

        table_annotations = []
        for tbl in parsed.get("tables", []):
            table_annotations.append(TableAnnotation(
                page=tbl["page"], rows=tbl.get("rows", []),
                bbox=None,
                n_rows=len(tbl.get("rows", [])),
                n_cols=len(tbl["rows"][0]) if tbl.get("rows") else 0,
            ))

        return ProcessedDocument(
            doc_id=doc_id,
            parsed=parsed,
            text_annotations=text_annotations,
            table_annotations=table_annotations,
            metadata={
                "engine": "fallback",
                "source_path": pdf_path,
                "conversion_time_seconds": round(elapsed, 3),
            },
        )

    def convert_batch(self, pdf_paths: List[str]) -> List[ProcessedDocument]:
        results = []
        for path in pdf_paths:
            try:
                results.append(self.convert(path))
            except Exception as e:
                results.append(ProcessedDocument(
                    doc_id=os.path.splitext(os.path.basename(path))[0],
                    parsed={"full_text": "", "pages": [], "tables": [], "figures": [],
                            "triage": "ERROR", "n_pages": 0, "n_text_pages": 0},
                    metadata={"engine": "fallback", "source_path": path, "error": str(e)},
                ))
        return results


class MockProcessor:
    """Deterministic processor for tests — builds ProcessedDocument from text.

    No PDF or external dependencies required. Produces the same interface
    so tests can verify the extraction pipeline end-to-end.
    """

    @property
    def available(self) -> bool:
        return True

    @property
    def name(self) -> str:
        return "mock"

    def convert(self, text: str, *, doc_id: str = "mock_doc",
                page_sep: str = "\f") -> ProcessedDocument:
        from ..litextract.document import parse_text

        parsed = parse_text(text, page_sep=page_sep)

        text_annotations = []
        for pg in parsed.get("pages", []):
            text_annotations.append(TextAnnotation(
                page=pg["page"], text=pg.get("text", ""), label="page",
                bbox=(0.0, 0.0, 1.0, 1.0),  # mock full-page bbox
            ))

        return ProcessedDocument(
            doc_id=doc_id,
            parsed=parsed,
            text_annotations=text_annotations,
            metadata={"engine": "mock"},
        )

    def convert_from_dict(self, parsed: dict, *, doc_id: str = "mock_doc") -> ProcessedDocument:
        """Build a ProcessedDocument directly from a pre-parsed dict (for tests)."""
        text_annotations = []
        for pg in parsed.get("pages", []):
            text_annotations.append(TextAnnotation(
                page=pg["page"], text=pg.get("text", ""), label="page",
                bbox=(0.0, 0.0, 1.0, 1.0),
            ))
        return ProcessedDocument(
            doc_id=doc_id,
            parsed=parsed,
            text_annotations=text_annotations,
            metadata={"engine": "mock"},
        )


# --------------------------------------------------------------------------- #
# Auto-selecting facade
# --------------------------------------------------------------------------- #
def get_processor(prefer_docling: bool = True) -> Any:
    """Return the best available processor.

    Prefers Docling when installed; falls back to pdfplumber-based parser.
    """
    if prefer_docling:
        dp = DoclingProcessor()
        if dp.available:
            return dp
    return FallbackProcessor()


def convert_with_fallback(pdf_path: str, *, doc_id: Optional[str] = None,
                          prefer_docling: bool = True) -> ProcessedDocument:
    """Convert a PDF, falling back to pdfplumber if Docling fails at conversion time.

    ``DoclingProcessor.available`` only checks that Docling imports; it does not catch
    failures inside Docling's own pipeline (for example a model that fails to load), which
    otherwise surface as an unhandled exception on every document, Docling-specific or not.
    This wraps that call so a broken Docling install degrades to the pdfplumber fallback
    (with reduced table/figure fidelity) instead of failing the whole request.
    """
    if prefer_docling:
        dp = DoclingProcessor()
        if dp.available:
            try:
                return dp.convert(pdf_path, doc_id=doc_id)
            except Exception as e:
                logger.warning(
                    "Docling conversion failed for %s (%s: %s); falling back to pdfplumber",
                    pdf_path, type(e).__name__, e,
                )
    return FallbackProcessor().convert(pdf_path, doc_id=doc_id)


def process_pdf(pdf_path: str, *, doc_id: Optional[str] = None,
                prefer_docling: bool = True, autorotate: bool = False) -> ProcessedDocument:
    """Convert a single PDF using the best available processor with graceful fallback."""
    from ..litextract.document import _autorotate_pdf
    import os

    active_path = pdf_path
    is_temp = False
    if autorotate:
        active_path, is_temp = _autorotate_pdf(pdf_path)

    try:
        result = convert_with_fallback(active_path, doc_id=doc_id, prefer_docling=prefer_docling)
        # Update metadata to reflect the original source_path
        if result.metadata:
            result.metadata["source_path"] = pdf_path
        return result
    finally:
        if is_temp and os.path.exists(active_path):
            try:
                os.remove(active_path)
            except OSError:
                pass


def process_batch(pdf_paths: List[str], *, prefer_docling: bool = True, autorotate: bool = False) -> List[ProcessedDocument]:
    """Convert multiple PDFs using the best available processor with graceful fallback."""
    return [process_pdf(p, prefer_docling=prefer_docling, autorotate=autorotate) for p in pdf_paths]


def save_processed_document(doc: ProcessedDocument, output_path: str) -> str:
    """Save a ProcessedDocument to JSON. Stages in /workspace for S3 safety."""
    data = doc.as_dict()
    content = json.dumps(data, indent=2, ensure_ascii=False)

    # If destination is on an S3 mount, stage locally first
    if output_path.startswith("/mnt/results") or output_path.startswith("/mnt/shared-workspace"):
        import subprocess
        staging = os.path.join("/workspace", f"proc_staging_{os.getpid()}.json")
        with open(staging, "w", encoding="utf-8") as f:
            f.write(content)
        subprocess.run(["cp", staging, output_path], check=True)
        os.remove(staging)
    else:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

    return output_path


def load_processed_document(json_path: str) -> ProcessedDocument:
    """Load a ProcessedDocument from a saved JSON file."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    text_anns = [TextAnnotation(**a) for a in data.get("annotations", {}).get("texts", [])]
    table_anns = [TableAnnotation(**a) for a in data.get("annotations", {}).get("tables", [])]
    fig_anns = [FigureAnnotation(**a) for a in data.get("annotations", {}).get("figures", [])]

    page_sizes = {int(k): tuple(v) for k, v in data.get("page_sizes", {}).items()}

    return ProcessedDocument(
        doc_id=data["doc_id"],
        parsed=data["parsed"],
        text_annotations=text_anns,
        table_annotations=table_anns,
        figure_annotations=fig_anns,
        page_sizes=page_sizes,
        metadata=data.get("metadata", {}),
    )
