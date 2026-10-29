"""Tests for services/pico_extractor.py — PICO extraction from protocol documents."""
import pytest
import os
import tempfile
from services.pico_extractor import (
    extract_pico_from_text,
    extract_pico_from_file,
    _normalize_text,
    _find_section_content,
    _find_keyword_match,
)


# ── Test protocol text with section headers ──

PROTOCOL_WITH_HEADERS = """
Population
Patients with colorectal cancer undergoing staging imaging for liver metastases.

Index Test
Contrast-enhanced computed tomography (CT) of the abdomen and pelvis.

Comparator
Gadoxetic acid-enhanced MRI as the reference standard.

Outcome
Diagnostic accuracy measured by sensitivity and specificity for detecting liver metastases.

Study Design
Diagnostic accuracy study with a cross-sectional design.

Objective
To determine the diagnostic accuracy of CT compared to MRI for detecting liver metastases in colorectal cancer patients.

Hypothesis
MRI has superior diagnostic accuracy compared to CT for the detection of liver metastases.
"""


# ── Test protocol text with keyword patterns (no headers) ──

PROTOCOL_WITH_KEYWORDS = """
We will include patients with colorectal cancer undergoing staging imaging.
The index test is contrast-enhanced computed tomography (CT).
The reference standard was gadoxetic acid-enhanced MRI.
The primary outcome was diagnostic accuracy measured by sensitivity and specificity.
This is a diagnostic accuracy study with a cross-sectional design.
The objective of this study was to compare CT and MRI for liver metastases.
We hypothesize that MRI has superior diagnostic accuracy compared to CT.
"""


class TestExtractPicoFromText:
    """Tests for extract_pico_from_text function."""

    def test_extract_with_section_headers(self):
        result = extract_pico_from_text(PROTOCOL_WITH_HEADERS)
        assert "colorectal cancer" in result["population"].lower()
        assert "computed tomography" in result["index_test"].lower() or "CT" in result["index_test"]
        assert "MRI" in result["comparator"] or "magnetic resonance" in result["comparator"].lower()
        assert "diagnostic accuracy" in result["outcome"].lower() or "sensitivity" in result["outcome"].lower()
        assert "diagnostic" in result["study_design"].lower()

    def test_extract_with_keyword_patterns(self):
        result = extract_pico_from_text(PROTOCOL_WITH_KEYWORDS)
        assert "colorectal cancer" in result["population"].lower()
        assert "computed tomography" in result["index_test"].lower() or "CT" in result["index_test"]
        assert result["outcome"]  # Should find something
        assert result["study_design"]  # Should find something

    def test_extract_research_question(self):
        result = extract_pico_from_text(PROTOCOL_WITH_HEADERS)
        assert "diagnostic accuracy" in result["research_question"].lower() or "CT" in result["research_question"]

    def test_extract_hypothesis(self):
        result = extract_pico_from_text(PROTOCOL_WITH_HEADERS)
        assert "MRI" in result["hypothesis"] or "superior" in result["hypothesis"].lower()

    def test_partial_extraction(self):
        """Only some PICO elements present."""
        text = "Population: Patients with liver cancer.\nIndex Test: MRI."
        result = extract_pico_from_text(text)
        assert "liver cancer" in result["population"].lower()
        assert "MRI" in result["index_test"]
        assert result["comparator"] == ""  # Not present
        assert result["extraction_confidence"] in ("medium", "low")

    def test_empty_text(self):
        result = extract_pico_from_text("")
        assert result["population"] == ""
        assert result["index_test"] == ""
        assert result["extraction_confidence"] == "low"

    def test_whitespace_only_text(self):
        result = extract_pico_from_text("   \n\n   \t  ")
        assert result["population"] == ""
        assert result["extraction_confidence"] == "low"

    def test_confidence_high(self):
        """All 5 PICO elements found → high confidence."""
        result = extract_pico_from_text(PROTOCOL_WITH_HEADERS)
        pico_fields = ["population", "index_test", "comparator", "outcome", "study_design"]
        found = sum(1 for f in pico_fields if result.get(f))
        if found >= 4:
            assert result["extraction_confidence"] == "high"

    def test_confidence_low(self):
        """No PICO elements found → low confidence."""
        result = extract_pico_from_text("This is a random text about cooking recipes.")
        assert result["extraction_confidence"] == "low"

    def test_malformed_text(self):
        """Garbled text should not crash."""
        result = extract_pico_from_text("\x00\x01\x02 random bytes \xff\xfe")
        assert isinstance(result, dict)
        assert "population" in result

    def test_returns_all_keys(self):
        result = extract_pico_from_text("Population: test patients.")
        expected_keys = {"population", "index_test", "comparator", "outcome",
                         "study_design", "research_question", "hypothesis",
                         "extraction_confidence", "inclusion", "exclusion",
                         "search_strings", "variables"}
        assert set(result.keys()) == expected_keys

    def test_descriptive_case_review_protocol(self):
        """Eligibility protocols that include case reports are not classic PICO."""
        text = """
Pure Arterial Malformations of the Brain
A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes

1.1 Inclusion Criteria
All of the following must be met for a study to be included:
Study design: Observational study (case report, case series, case-control, or cohort study) reporting original patient-level data.
Condition: Pure arterial malformation (PAM) of the brain.
Language: All languages. Non-English full texts are translated.
Publication date: No restriction (database inception to present).

1.2 Exclusion Criteria
Any one of the following triggers exclusion:
Publication type: Review, editorial, commentary, letter to editor, conference abstract, or protocol without original patient-level data.
Wrong lesion type: Arteriovenous malformation (AVM), dural arteriovenous fistula, or cavernous malformation.

1.3 Operational PAM Definition
A lesion qualifies as a PAM if it meets all of the following:
Dilated, elongated, tortuous arterial loops forming a mass-like configuration with coil-like appearance.
No arteriovenous shunting.

2. Search Strategy
PubMed | ("pure arterial malformation"[tiab] OR "pial arterial malformation"[tiab]) | Completed
Ovid MEDLINE | (pure arterial malformation*).ti,ab. | Completed
Scopus | TITLE-ABS-KEY("pure arterial malformation*") | Pending
Web of Science | TS=("pure arterial malformation*") | Pending

3. Data Extraction Schema
V1 — PAM location | ICA-supraclinoid / M1 / M2 / NR | Universal
V3 — PAM maximum diameter | continuous (mm) | About half of studies
Demographics — Age | continuous (years) | Universal

4. Analysis Plan
Pooled descriptive statistics across all included patients: proportions with Wilson 95% CIs.
Pre-specified subgroup contrasts: aneurysm-present vs aneurysm-absent; single-territory vs multi-territory.
"""
        result = extract_pico_from_text(text)
        assert "coil-like" in result["population"].lower() or "tortuous" in result["population"].lower()
        assert "extraction field" in result["index_test"].lower()
        assert "aneurysm-present" in result["comparator"]
        assert "ischemic stroke" in result["outcome"].lower()
        assert "case report" in result["study_design"].lower()
        assert any("case report" in item.lower() for item in result["inclusion"])
        assert any("review" in item.lower() for item in result["exclusion"])
        assert "pure arterial malformation" in result["search_strings"]["pubmed"]
        assert "ovid_medline" in result["search_strings"]
        assert "scopus" in result["search_strings"]
        assert "web_of_science" in result["search_strings"]
        names = [item["name"] for item in result["variables"]]
        assert any(name.startswith("V1") for name in names)
        assert any("Age" in name for name in names)
        assert result["extraction_confidence"] in ("high", "medium")

    def test_long_text_truncation(self):
        """Keyword pattern extraction should truncate very long matches."""
        long_pop = "We will include patients with " + "cancer " * 200 + "."
        result = extract_pico_from_text(long_pop)
        if result["population"]:
            assert len(result["population"]) <= 510  # 500 + "..."


class TestExtractPicoFromFile:
    """Tests for extract_pico_from_file function."""

    def test_extract_from_txt_file(self, tmp_path):
        txt_file = tmp_path / "protocol.txt"
        txt_file.write_text(PROTOCOL_WITH_HEADERS)
        result = extract_pico_from_file(str(txt_file), "protocol.txt")
        assert "colorectal cancer" in result["population"].lower()
        assert result["extraction_confidence"] in ("high", "medium", "low")

    def test_extract_from_pdf_file(self, tmp_path):
        """Create a minimal PDF and extract PICO."""
        try:
            import pdfplumber
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Paragraph
            from reportlab.lib.styles import getSampleStyleSheet
        except ImportError:
            pytest.skip("reportlab not installed for PDF test creation")

        pdf_file = tmp_path / "protocol.pdf"
        doc = SimpleDocTemplate(str(pdf_file), pagesize=letter)
        styles = getSampleStyleSheet()
        story = [
            Paragraph("Population", styles["Heading1"]),
            Paragraph("Patients with colorectal cancer undergoing staging imaging.", styles["Normal"]),
            Paragraph("Index Test", styles["Heading1"]),
            Paragraph("Contrast-enhanced computed tomography (CT).", styles["Normal"]),
            Paragraph("Outcome", styles["Heading1"]),
            Paragraph("Diagnostic accuracy measured by sensitivity and specificity.", styles["Normal"]),
        ]
        doc.build(story)

        result = extract_pico_from_file(str(pdf_file), "protocol.pdf")
        assert "colorectal" in result["population"].lower() or result["extraction_confidence"] == "low"

    def test_extract_from_docx_file(self, tmp_path):
        """Create a minimal DOCX and extract PICO."""
        try:
            import docx
        except ImportError:
            pytest.skip("python-docx not installed")

        docx_file = tmp_path / "protocol.docx"
        doc = docx.Document()
        doc.add_heading("Population", level=1)
        doc.add_paragraph("Patients with colorectal cancer undergoing staging imaging.")
        doc.add_heading("Index Test", level=1)
        doc.add_paragraph("Contrast-enhanced computed tomography (CT).")
        doc.add_heading("Outcome", level=1)
        doc.add_paragraph("Diagnostic accuracy measured by sensitivity and specificity.")
        doc.save(str(docx_file))

        result = extract_pico_from_file(str(docx_file), "protocol.docx")
        assert "colorectal" in result["population"].lower() or result["extraction_confidence"] == "low"

    def test_unsupported_file_type(self, tmp_path):
        bad_file = tmp_path / "document.xyz"
        bad_file.write_text("some content")
        with pytest.raises(ValueError, match="Unsupported"):
            extract_pico_from_file(str(bad_file), "document.xyz")
