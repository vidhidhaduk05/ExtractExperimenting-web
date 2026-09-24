"""
layout.py — layout detection engine for PDF documents.

Classifies regions of a PDF page into text, table, and figure/image blocks.
Uses PyMuPDF (fitz) and pdfplumber for visual and textual spatial analysis.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple


@dataclass
class LayoutRegion:
    type: str  # "text" | "table" | "figure"
    bbox: Tuple[float, float, float, float]  # (x0, top, x1, bottom)
    page: int
    confidence: float = 1.0
    content: Optional[Any] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "type": self.type,
            "bbox": self.bbox,
            "page": self.page,
            "confidence": self.confidence,
            "content": self.content,
            "metadata": self.metadata,
        }


@dataclass
class PageLayout:
    page: int
    width: float
    height: float
    layout_type: str  # "text_heavy" | "table_heavy" | "figure_heavy" | "mixed"
    regions: List[LayoutRegion] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "width": self.width,
            "height": self.height,
            "layout_type": self.layout_type,
            "regions": [r.as_dict() for r in self.regions],
        }


def detect_page_layout(page_num: int, pdfplumber_page: Any = None, fitz_page: Any = None) -> PageLayout:
    """Detect layout regions (text, table, figure) for a single PDF page."""
    regions: List[LayoutRegion] = []
    width, height = 0.0, 0.0

    # Extract dimensions
    if fitz_page is not None:
        rect = fitz_page.rect
        width, height = float(rect.width), float(rect.height)
    elif pdfplumber_page is not None:
        width, height = float(pdfplumber_page.width), float(pdfplumber_page.height)

    # 1. Detect Tables (via pdfplumber table finder)
    table_bboxes = []
    if pdfplumber_page is not None:
        try:
            found_tables = pdfplumber_page.find_tables()
            for tbl in found_tables:
                bbox = tuple(float(x) for x in tbl.bbox)
                table_bboxes.append(bbox)
                regions.append(
                    LayoutRegion(
                        type="table",
                        bbox=bbox,
                        page=page_num,
                        confidence=0.95,
                        metadata={"extract_method": "pdfplumber"},
                    )
                )
        except Exception:
            pass

    # 2. Detect Figures / Images
    figure_bboxes = []
    if fitz_page is not None:
        try:
            image_list = fitz_page.get_images(full=True)
            for img_info in image_list:
                xref = img_info[0]
                rects = fitz_page.get_image_rects(xref)
                for r in rects:
                    bbox = (float(r.x0), float(r.y0), float(r.x1), float(r.y1))
                    # Avoid duplicate or tiny icons (< 20x20)
                    if (bbox[2] - bbox[0]) > 20 and (bbox[3] - bbox[1]) > 20:
                        figure_bboxes.append(bbox)
                        regions.append(
                            LayoutRegion(
                                type="figure",
                                bbox=bbox,
                                page=page_num,
                                confidence=0.90,
                                metadata={"xref": xref},
                            )
                        )
        except Exception:
            pass

    # 3. Detect Text Blocks
    if fitz_page is not None:
        try:
            blocks = fitz_page.get_text("blocks")
            for b in blocks:
                # b format: (x0, y0, x1, y1, "text_content", block_no, block_type)
                # block_type 0 = text, 1 = image
                if len(b) >= 7 and b[6] == 0:
                    bbox = (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
                    text_str = str(b[4]).strip()
                    if text_str:
                        # Check if overlaps significantly with an identified table or figure
                        if not _is_overlapping_any(bbox, table_bboxes + figure_bboxes, threshold=0.5):
                            regions.append(
                                LayoutRegion(
                                    type="text",
                                    bbox=bbox,
                                    page=page_num,
                                    confidence=0.98,
                                    content=text_str,
                                )
                            )
        except Exception:
            pass
    elif pdfplumber_page is not None:
        try:
            text = pdfplumber_page.extract_text() or ""
            if text.strip():
                regions.append(
                    LayoutRegion(
                        type="text",
                        bbox=(0.0, 0.0, width, height),
                        page=page_num,
                        confidence=0.85,
                        content=text,
                    )
                )
        except Exception:
            pass

    # Classify overall page layout type
    layout_type = _classify_layout_type(regions, width, height)

    return PageLayout(
        page=page_num,
        width=width,
        height=height,
        layout_type=layout_type,
        regions=regions,
    )


def _is_overlapping(bbox1: Tuple[float, float, float, float], bbox2: Tuple[float, float, float, float], threshold: float = 0.5) -> bool:
    """Check if area overlap of bbox1 inside bbox2 exceeds threshold."""
    x0 = max(bbox1[0], bbox2[0])
    y0 = max(bbox1[1], bbox2[1])
    x1 = min(bbox1[2], bbox2[2])
    y1 = min(bbox1[3], bbox2[3])

    if x1 <= x0 or y1 <= y0:
        return False

    intersection = (x1 - x0) * (y1 - y0)
    area1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])

    if area1 <= 0:
        return False

    return (intersection / area1) >= threshold


def _is_overlapping_any(bbox: Tuple[float, float, float, float], target_bboxes: List[Tuple[float, float, float, float]], threshold: float = 0.5) -> bool:
    return any(_is_overlapping(bbox, tb, threshold) for tb in target_bboxes)


def _classify_layout_type(regions: List[LayoutRegion], width: float, height: float) -> str:
    n_tables = sum(1 for r in regions if r.type == "table")
    n_figures = sum(1 for r in regions if r.type == "figure")
    n_text = sum(1 for r in regions if r.type == "text")

    if n_tables > 0 and n_tables >= n_text and n_tables >= n_figures:
        return "table_heavy"
    elif n_figures > 0 and n_figures >= n_text:
        return "figure_heavy"
    elif n_text > 0:
        return "text_heavy"
    return "mixed"
