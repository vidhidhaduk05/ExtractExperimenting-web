"""
test_document_processor.py — tests for the Docling wrapper.

Tests cover:
  - MockProcessor (deterministic, no external deps)
  - FallbackProcessor (pdfplumber-based, tested with text fixtures)
  - DoclingProcessor availability check and bbox normalization
  - ProcessedDocument serialization round-trip
  - Batch processing error resilience
"""
import os
import json
import tempfile
import pytest

# Ensure project root is on path
os.environ.setdefault("PYTHONPATH", "/workspace/radextract")

from radextract_core.radextract.document_processor import (
    MockProcessor, FallbackProcessor, DoclingProcessor,
    ProcessedDocument, TextAnnotation, TableAnnotation, FigureAnnotation,
    get_processor, process_pdf, save_processed_document, load_processed_document,
)


# --------------------------------------------------------------------------- #
# MockProcessor tests
# --------------------------------------------------------------------------- #
class TestMockProcessor:
    def test_convert_text_single_page(self):
        proc = MockProcessor()
        text = "This is a test document with enough text to pass the threshold check for full text triage."
        doc = proc.convert(text, doc_id="test1")
        assert doc.doc_id == "test1"
        assert doc.n_pages == 1
        assert doc.triage == "FULL_TEXT"
        assert "test document" in doc.parsed["full_text"]
        assert len(doc.text_annotations) == 1
        assert doc.text_annotations[0].page == 1
        assert doc.text_annotations[0].bbox == (0.0, 0.0, 1.0, 1.0)

    def test_convert_text_multi_page(self):
        proc = MockProcessor()
        page1 = "Page 1 content with sufficient text to be counted as a text page for triage purposes."
        page2 = "Page 2 content also with sufficient text to be counted as a text page for triage."
        text = f"{page1}\f{page2}"
        doc = proc.convert(text, doc_id="multi")
        assert doc.n_pages == 2
        assert doc.triage == "FULL_TEXT"
        assert len(doc.text_annotations) == 2
        assert doc.text_annotations[0].page == 1
        assert doc.text_annotations[1].page == 2

    def test_convert_from_dict(self):
        proc = MockProcessor()
        parsed = {
            "full_text": "Test content",
            "pages": [{"page": 1, "text": "Test content"}],
            "tables": [{"page": 1, "rows": [["A", "B"], ["1", "2"]]}],
            "figures": [],
            "triage": "FULL_TEXT",
            "n_pages": 1,
            "n_text_pages": 1,
        }
        doc = proc.convert_from_dict(parsed, doc_id="from_dict")
        assert doc.doc_id == "from_dict"
        assert doc.parsed["full_text"] == "Test content"
        assert len(doc.text_annotations) == 1

    def test_scanned_triage(self):
        """Pages with very little text should be triaged as SCANNED."""
        proc = MockProcessor()
        text = "x\f\f\f"  # 4 pages, only first has minimal text
        doc = proc.convert(text, doc_id="scanned")
        assert doc.triage == "SCANNED"
        assert doc.n_pages == 4

    def test_partial_triage(self):
        """Mix of text and empty pages should be PARTIAL."""
        proc = MockProcessor()
        good = "This page has enough text content to be counted as a text page for triage purposes here."
        text = f"{good}\f\f\f\f"  # 5 pages, 1 text page = 20% < 30% → SCANNED
        doc = proc.convert(text, doc_id="partial")
        # 1/5 = 0.2 < 0.3 → SCANNED, not PARTIAL
        assert doc.triage == "SCANNED"

    def test_metadata_engine(self):
        proc = MockProcessor()
        doc = proc.convert("test content here", doc_id="m1")
        assert doc.metadata["engine"] == "mock"


# --------------------------------------------------------------------------- #
# FallbackProcessor tests
# --------------------------------------------------------------------------- #
class TestFallbackProcessor:
    def test_available(self):
        proc = FallbackProcessor()
        assert proc.available is True
        assert proc.name == "fallback"

    def test_convert_textfile(self, tmp_path):
        """FallbackProcessor should handle .txt files via parse_document."""
        proc = FallbackProcessor()
        textfile = tmp_path / "test.txt"
        content = "This is a test document with enough text to pass the threshold for full text triage classification."
        textfile.write_text(content)
        doc = proc.convert(str(textfile), doc_id="txt_test")
        assert doc.doc_id == "txt_test"
        assert doc.n_pages == 1
        assert doc.triage == "FULL_TEXT"
        assert doc.metadata["engine"] == "fallback"

    def test_batch_error_resilience(self, tmp_path):
        """Batch should not fail entirely if one file is bad."""
        proc = FallbackProcessor()
        good_file = tmp_path / "good.txt"
        good_file.write_text("This is a good document with enough text for full text triage classification.")
        results = proc.convert_batch([str(good_file), "/nonexistent/file.pdf"])
        assert len(results) == 2
        assert results[0].triage == "FULL_TEXT"
        assert results[1].triage == "ERROR"


# --------------------------------------------------------------------------- #
# DoclingProcessor tests
# --------------------------------------------------------------------------- #
class TestDoclingProcessor:
    def test_availability(self):
        proc = DoclingProcessor()
        # Docling should be installed in this environment
        assert proc.available is True
        assert proc.name == "docling"

    def test_bbox_normalization_topleft(self):
        """Test bbox normalization with TOPLEFT origin."""
        from docling_core.types.doc import BoundingBox, CoordOrigin

        bbox = BoundingBox(l=10, t=20, r=50, b=60, coord_origin=CoordOrigin.TOPLEFT)
        page_size = (100.0, 100.0)
        result = DoclingProcessor._normalize_bbox(bbox, page_size)
        assert result == (0.1, 0.2, 0.5, 0.6)

    def test_bbox_normalization_bottomleft(self):
        """Test bbox normalization with BOTTOMLEFT origin (Y flip)."""
        from docling_core.types.doc import BoundingBox, CoordOrigin

        bbox = BoundingBox(l=10, t=20, r=50, b=60, coord_origin=CoordOrigin.BOTTOMLEFT)
        page_size = (100.0, 100.0)
        result = DoclingProcessor._normalize_bbox(bbox, page_size)
        # Y flip: top = h - b = 100 - 60 = 40, bottom = h - t = 100 - 20 = 80
        assert result == (0.1, 0.4, 0.5, 0.8)

    def test_bbox_normalization_none_page_size(self):
        """Should return None when page_size is None."""
        from docling_core.types.doc import BoundingBox, CoordOrigin

        bbox = BoundingBox(l=10, t=20, r=50, b=60, coord_origin=CoordOrigin.TOPLEFT)
        result = DoclingProcessor._normalize_bbox(bbox, None)
        assert result is None

    def test_bbox_normalization_clamping(self):
        """Coordinates should be clamped to [0, 1]."""
        from docling_core.types.doc import BoundingBox, CoordOrigin

        bbox = BoundingBox(l=-10, t=-20, r=150, b=160, coord_origin=CoordOrigin.TOPLEFT)
        page_size = (100.0, 100.0)
        result = DoclingProcessor._normalize_bbox(bbox, page_size)
        assert result == (0.0, 0.0, 1.0, 1.0)

    def test_table_data_to_rows(self):
        """Test conversion of Docling TableData to row format."""
        from docling_core.types.doc import TableData, TableCell

        cells = [
            TableCell(text="A", start_row_offset_idx=0, end_row_offset_idx=1,
                      start_col_offset_idx=0, end_col_offset_idx=1),
            TableCell(text="B", start_row_offset_idx=0, end_row_offset_idx=1,
                      start_col_offset_idx=1, end_col_offset_idx=2),
            TableCell(text="1", start_row_offset_idx=1, end_row_offset_idx=2,
                      start_col_offset_idx=0, end_col_offset_idx=1),
            TableCell(text="2", start_row_offset_idx=1, end_row_offset_idx=2,
                      start_col_offset_idx=1, end_col_offset_idx=2),
        ]
        data = TableData(table_cells=cells, num_rows=2, num_cols=2)
        rows = DoclingProcessor._table_data_to_rows(data)
        assert rows == [["A", "B"], ["1", "2"]]


# --------------------------------------------------------------------------- #
# ProcessedDocument serialization tests
# --------------------------------------------------------------------------- #
class TestProcessedDocumentSerialization:
    def test_as_dict_structure(self):
        proc = MockProcessor()
        doc = proc.convert("Test content with enough text for triage classification purposes.", doc_id="ser1")
        d = doc.as_dict()
        assert "doc_id" in d
        assert "parsed" in d
        assert "annotations" in d
        assert "texts" in d["annotations"]
        assert "tables" in d["annotations"]
        assert "figures" in d["annotations"]
        assert "metadata" in d

    def test_to_json(self):
        proc = MockProcessor()
        doc = proc.convert("Test content with enough text for triage classification purposes.", doc_id="ser2")
        j = doc.to_json()
        parsed = json.loads(j)
        assert parsed["doc_id"] == "ser2"

    def test_save_and_load_roundtrip(self, tmp_path):
        proc = MockProcessor()
        doc = proc.convert("Test content with enough text for triage classification purposes.", doc_id="rt1")
        # Add a table annotation
        doc.table_annotations.append(TableAnnotation(
            page=1, rows=[["X", "Y"], ["1", "2"]], bbox=(0.1, 0.1, 0.9, 0.9),
            n_rows=2, n_cols=2,
        ))
        doc.page_sizes = {1: (612.0, 792.0)}

        out_path = str(tmp_path / "processed.json")
        save_processed_document(doc, out_path)

        loaded = load_processed_document(out_path)
        assert loaded.doc_id == "rt1"
        assert loaded.n_pages == doc.n_pages
        assert len(loaded.text_annotations) == len(doc.text_annotations)
        assert len(loaded.table_annotations) == len(doc.table_annotations)
        assert loaded.table_annotations[0].rows == [["X", "Y"], ["1", "2"]]
        assert loaded.page_sizes[1] == (612.0, 792.0)

    def test_save_to_workspace(self, tmp_path):
        """Save to a regular (non-S3) path should work directly."""
        proc = MockProcessor()
        doc = proc.convert("Test content with enough text for triage classification purposes.", doc_id="ws1")
        out_path = str(tmp_path / "doc.json")
        save_processed_document(doc, out_path)
        assert os.path.exists(out_path)
        with open(out_path) as f:
            data = json.load(f)
        assert data["doc_id"] == "ws1"


# --------------------------------------------------------------------------- #
# Auto-selecting facade tests
# --------------------------------------------------------------------------- #
class TestFacade:
    def test_get_processor_prefers_docling(self):
        proc = get_processor(prefer_docling=True)
        # In this environment Docling is installed
        assert isinstance(proc, DoclingProcessor)

    def test_get_processor_fallback(self):
        proc = get_processor(prefer_docling=False)
        assert isinstance(proc, FallbackProcessor)

    def test_process_pdf_with_textfile(self, tmp_path):
        """process_pdf should work with text files via fallback."""
        textfile = tmp_path / "test.txt"
        textfile.write_text("This is a test document with enough text to pass the threshold for full text triage classification.")
        doc = process_pdf(str(textfile), prefer_docling=False)
        assert doc.triage == "FULL_TEXT"
        assert doc.n_pages == 1


# --------------------------------------------------------------------------- #
# Integration: ProcessedDocument feeds into LitExtract extraction
# --------------------------------------------------------------------------- #
class TestIntegrationWithLitExtract:
    def test_parsed_dict_compatible_with_find_in_document(self):
        """The parsed dict should work with litextract.document.find_in_document."""
        from radextract_core.litextract.document import find_in_document, in_document

        proc = MockProcessor()
        text = "This study by Smith et al. evaluated MRI sensitivity for glioma detection. The AUC was 0.92."
        doc = proc.convert(text, doc_id="int1")
        parsed = doc.parsed

        # find_in_document should locate "sensitivity"
        hits = find_in_document(parsed, "sensitivity")
        assert len(hits) > 0
        assert hits[0][0] == 1  # page 1

        # in_document should find "AUC"
        assert in_document(parsed, "AUC")
        assert not in_document(parsed, "nonexistent_phrase_xyz")
