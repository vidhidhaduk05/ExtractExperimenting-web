"""
structured.py — unified structured document representation (DocumentJSON).

Defines structured data structures for pages, tables, figures, and layouts,
and provides bidirectional conversion to litextract's normalized parsed document dict.
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from .layout import PageLayout, LayoutRegion


@dataclass
class TableJSON:
    page: int
    rows: List[List[str]] = field(default_factory=list)
    caption: str = ""
    bbox: Optional[tuple] = None
    extraction_method: str = "pdfplumber"

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "rows": self.rows,
            "caption": self.caption,
            "bbox": self.bbox,
            "extraction_method": self.extraction_method,
        }


@dataclass
class FigureJSON:
    page: int
    image_path: Optional[str] = None
    ocr_text: str = ""
    caption: str = ""
    bbox: Optional[tuple] = None

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "image_path": self.image_path,
            "ocr_text": self.ocr_text,
            "caption": self.caption,
            "bbox": self.bbox,
        }


@dataclass
class PageJSON:
    page: int
    text: str = ""
    layout_type: str = "mixed"
    tables: List[TableJSON] = field(default_factory=list)
    figures: List[FigureJSON] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "text": self.text,
            "layout_type": self.layout_type,
            "tables": [t.as_dict() for t in self.tables],
            "figures": [f.as_dict() for f in self.figures],
        }


@dataclass
class DocumentJSON:
    doc_id: str
    n_pages: int
    pages: List[PageJSON] = field(default_factory=list)
    full_text: str = ""
    tables: List[TableJSON] = field(default_factory=list)
    figures: List[FigureJSON] = field(default_factory=list)
    triage: str = "FULL_TEXT"  # "FULL_TEXT" | "PARTIAL" | "SCANNED"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_json(self, indent: Optional[int] = 2) -> str:
        return json.dumps(self.as_dict(), indent=indent, ensure_ascii=False)

    def as_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "n_pages": self.n_pages,
            "triage": self.triage,
            "full_text": self.full_text,
            "pages": [p.as_dict() for p in self.pages],
            "tables": [t.as_dict() for t in self.tables],
            "figures": [f.as_dict() for f in self.figures],
            "metadata": self.metadata,
        }


def to_parsed_dict(doc: DocumentJSON) -> dict:
    """Convert DocumentJSON into litextract's normalized parsed document dict format.

    Preserves full backward compatibility:
        {full_text, pages[{page, text}], tables[{page, rows}], triage, n_pages, n_text_pages, figures, layout}
    """
    pages_list = [{"page": p.page, "text": p.text} for p in doc.pages]
    tables_list = [{"page": t.page, "rows": t.rows} for t in doc.tables]
    figures_list = [f.as_dict() for f in doc.figures]
    n_text_pages = sum(1 for p in doc.pages if len(p.text.strip()) >= 50)

    return {
        "full_text": doc.full_text,
        "pages": pages_list,
        "tables": tables_list,
        "figures": figures_list,
        "triage": doc.triage,
        "n_pages": doc.n_pages,
        "n_text_pages": n_text_pages,
        "extraction_method": doc.metadata.get("extraction_method", "pipeline"),
    }


def from_parsed_dict(d: dict, doc_id: str = "doc") -> DocumentJSON:
    """Build DocumentJSON from a legacy parsed document dict."""
    pages = []
    for p in d.get("pages", []):
        pages.append(
            PageJSON(
                page=p.get("page", 1),
                text=p.get("text", ""),
                layout_type="mixed",
            )
        )

    tables = []
    for t in d.get("tables", []):
        tables.append(
            TableJSON(
                page=t.get("page", 1),
                rows=t.get("rows", []),
            )
        )

    figures = []
    for f in d.get("figures", []):
        figures.append(
            FigureJSON(
                page=f.get("page", 1),
                image_path=f.get("image_path"),
                ocr_text=f.get("ocr_text", ""),
                caption=f.get("caption", ""),
                bbox=f.get("bbox"),
            )
        )

    return DocumentJSON(
        doc_id=doc_id,
        n_pages=d.get("n_pages", len(pages)),
        pages=pages,
        full_text=d.get("full_text", ""),
        tables=tables,
        figures=figures,
        triage=d.get("triage", "FULL_TEXT"),
        metadata={"extraction_method": d.get("extraction_method", "legacy")},
    )
