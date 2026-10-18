"""
tsr.py — Table Structure Recognition (TSR) module.

Combines rule-based extraction (pdfplumber) and vision-based table parsing (Unlimited-OCR)
into a unified interface.
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional, Union
from .ocr import OCRBackend, NullOCRBackend


class TSRBackend:
    """Interface for Table Structure Recognition."""
    name: str = "base_tsr"

    def extract_table(self, pdfplumber_page: Any = None, fitz_page: Any = None, bbox: Optional[tuple] = None) -> List[List[str]]:
        """Extract table rows from a page or specific bounding box region."""
        raise NotImplementedError


class PdfplumberTSR(TSRBackend):
    """Rule-based table extraction using pdfplumber."""
    name: str = "pdfplumber_tsr"

    def extract_table(self, pdfplumber_page: Any = None, fitz_page: Any = None, bbox: Optional[tuple] = None) -> List[List[str]]:
        if pdfplumber_page is None:
            return []
        try:
            target = pdfplumber_page
            if bbox is not None:
                # Crop to bbox
                target = pdfplumber_page.crop(bbox)
            tables = target.extract_tables()
            if tables and len(tables) > 0:
                # Return first extracted table cleaned
                cleaned = []
                for row in tables[0]:
                    cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
                    cleaned.append(cleaned_row)
                return cleaned
        except Exception:
            pass
        return []


class VisionTSR(TSRBackend):
    """Vision-based table recognition using an OCR backend (e.g. Unlimited-OCR)."""
    name: str = "vision_tsr"

    def __init__(self, ocr_backend: Optional[OCRBackend] = None):
        self.ocr_backend = ocr_backend or NullOCRBackend()

    def extract_table(self, pdfplumber_page: Any = None, fitz_page: Any = None, bbox: Optional[tuple] = None) -> List[List[str]]:
        if fitz_page is None or bbox is None:
            return []
        try:
            import fitz
            import io

            # Render bbox region to PNG image
            rect = fitz.Rect(*bbox)
            pix = fitz_page.get_pixmap(clip=rect, dpi=200)
            img_bytes = pix.tobytes("png")

            # Call OCR backend
            markdown_text = self.ocr_backend.ocr(img_bytes)
            return _parse_markdown_table(markdown_text)
        except Exception:
            return []


class HybridTSR(TSRBackend):
    """Hybrid TSR: Tries pdfplumber first; falls back to VisionTSR if result is empty or sparse."""
    name: str = "hybrid_tsr"

    def __init__(self, ocr_backend: Optional[OCRBackend] = None):
        self.pdfplumber_tsr = PdfplumberTSR()
        self.vision_tsr = VisionTSR(ocr_backend=ocr_backend)

    def extract_table(self, pdfplumber_page: Any = None, fitz_page: Any = None, bbox: Optional[tuple] = None) -> List[List[str]]:
        # 1. Try pdfplumber
        rows = self.pdfplumber_tsr.extract_table(pdfplumber_page=pdfplumber_page, bbox=bbox)

        # Check if table extraction was successful (at least 2 rows with non-empty cells)
        non_empty_cells = sum(1 for row in rows for cell in row if cell.strip())
        if len(rows) >= 2 and non_empty_cells >= 4:
            return rows

        # 2. Fall back to Vision TSR
        vision_rows = self.vision_tsr.extract_table(fitz_page=fitz_page, bbox=bbox)
        if vision_rows:
            return vision_rows

        return rows  # Return pdfplumber rows even if sparse if vision produced nothing


def _parse_markdown_table(md_text: str) -> List[List[str]]:
    """Convert a markdown formatted table string into a 2D list of row strings."""
    lines = [line.strip() for line in md_text.splitlines() if line.strip()]
    table_rows = []

    for line in lines:
        if "|" in line:
            # Skip delimiter lines (e.g. |---|---|)
            if set(line.replace("|", "").replace("-", "").replace(":", "").strip()) == set():
                continue
            cells = [c.strip() for c in line.split("|")]
            # Strip empty leading/trailing elements from split
            if line.startswith("|"):
                cells = cells[1:]
            if line.endswith("|"):
                cells = cells[:-1]
            table_rows.append(cells)

    return table_rows
