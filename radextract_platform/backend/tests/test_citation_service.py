"""Tests for services/citation_service.py — citation generation in 6 formats."""
import pytest
from services.citation_service import (
    parse_authors,
    generate_citation,
    generate_citations,
)


# ── Test data ──

STUDY_FULL = {
    "authors": "Smith J, Doe A, Brown C",
    "title": "Diagnostic accuracy of CT for detecting liver metastases",
    "journal": "Radiology",
    "publication_year": 2023,
    "doi": "10.1148/radiol.202323001",
    "pmid": "36789123",
    "volume": "305",
    "issue": "2",
    "pages": "e123-e131",
}

STUDY_MINIMAL = {
    "authors": "",
    "title": "An anonymous study",
    "journal": "",
    "publication_year": None,
    "doi": "",
    "pmid": "",
}

STUDY_FULLNAME_AUTHORS = {
    "authors": "Smith, John; Doe, Alice; Brown, Charlie",
    "title": "MRI vs CT for abdominal imaging",
    "journal": "AJR",
    "publication_year": 2022,
    "doi": "10.2214/AJR.22.12345",
    "pmid": "",
    "volume": "218",
    "issue": "",
    "pages": "45-52",
}


# ── Author parsing ──

class TestParseAuthors:

    def test_vancouver_style(self):
        """Vancouver-style 'Smith J, Doe A' should parse correctly."""
        authors = parse_authors("Smith J, Doe A, Brown C")
        assert len(authors) == 3
        assert authors[0]["surname"] == "Smith"
        assert authors[1]["surname"] == "Doe"
        assert authors[2]["surname"] == "Brown"

    def test_fullname_style(self):
        """Full-name 'Smith, John; Doe, Alice' should parse correctly."""
        authors = parse_authors("Smith, John; Doe, Alice")
        assert len(authors) == 2
        assert authors[0]["surname"] == "Smith"
        assert authors[0]["full_name"] == "John Smith"
        assert authors[1]["surname"] == "Doe"
        assert authors[1]["full_name"] == "Alice Doe"

    def test_empty_string(self):
        assert parse_authors("") == []
        assert parse_authors("   ") == []

    def test_single_author(self):
        authors = parse_authors("Smith J")
        assert len(authors) == 1
        assert authors[0]["surname"] == "Smith"

    def test_many_authors(self):
        authors = parse_authors("Smith J, Doe A, Brown C, Lee K, Wang Y, Garcia M, Patel S")
        assert len(authors) == 7


# ── Vancouver format ──

class TestVancouver:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "vancouver")
        assert "Smith J" in cite
        assert "Radiology" in cite
        assert "2023" in cite
        assert "305(2)" in cite
        assert "e123-e131" in cite
        # Citation ends with DOI when present, otherwise with period
        assert cite.rstrip().endswith(("doi: 10.1148/radiol.202323001", "."))

    def test_doi_included(self):
        cite = generate_citation(STUDY_FULL, "vancouver")
        assert "10.1148/radiol.202323001" in cite

    def test_minimal_study(self):
        cite = generate_citation(STUDY_MINIMAL, "vancouver")
        assert "An anonymous study" in cite

    def test_et_al(self):
        """More than 6 authors should produce 'et al'."""
        data = dict(STUDY_FULL)
        data["authors"] = "Smith J, Doe A, Brown C, Lee K, Wang Y, Garcia M, Patel S"
        cite = generate_citation(data, "vancouver")
        assert "et al" in cite


# ── APA format ──

class TestAPA:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "apa")
        assert "Smith" in cite
        assert "(2023)" in cite
        assert "Radiology" in cite
        assert "305" in cite

    def test_ampersand_for_two_authors(self):
        data = dict(STUDY_FULL)
        data["authors"] = "Smith J, Doe A"
        cite = generate_citation(data, "apa")
        assert "&" in cite

    def test_doi_as_url(self):
        cite = generate_citation(STUDY_FULL, "apa")
        assert "https://doi.org/10.1148" in cite


# ── MLA format ──

class TestMLA:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "mla")
        assert "Smith" in cite
        assert '"Diagnostic accuracy' in cite
        assert "Radiology" in cite
        assert "vol. 305" in cite
        assert "2023" in cite

    def test_two_authors(self):
        data = dict(STUDY_FULL)
        data["authors"] = "Smith, John; Doe, Alice"
        cite = generate_citation(data, "mla")
        assert "and" in cite


# ── Chicago format ──

class TestChicago:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "chicago")
        assert "Smith" in cite
        assert '"Diagnostic accuracy' in cite
        assert "Radiology" in cite
        assert "(2023)" in cite

    def test_three_authors_listed(self):
        data = dict(STUDY_FULL)
        data["authors"] = "Smith, John; Doe, Alice; Brown, Charlie"
        cite = generate_citation(data, "chicago")
        assert "Smith" in cite
        assert "Doe" in cite
        assert "Brown" in cite


# ── Harvard format ──

class TestHarvard:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "harvard")
        assert "Smith" in cite
        assert "(2023)" in cite
        assert "Radiology" in cite

    def test_available_at_doi(self):
        cite = generate_citation(STUDY_FULL, "harvard")
        assert "Available at" in cite
        assert "doi.org" in cite


# ── BibTeX format ──

class TestBibTeX:

    def test_basic_format(self):
        cite = generate_citation(STUDY_FULL, "bibtex")
        assert cite.startswith("@article{")
        assert "author" in cite
        assert "title" in cite
        assert "journal" in cite
        assert "year = {2023}" in cite
        assert cite.endswith("}")

    def test_citation_key(self):
        cite = generate_citation(STUDY_FULL, "bibtex")
        # Key should be surname+year
        assert "smith2023" in cite.split("{")[1].split(",")[0]

    def test_pmid_included(self):
        cite = generate_citation(STUDY_FULL, "bibtex")
        assert "pmid = {36789123}" in cite


# ── All formats together ──

class TestGenerateAllCitations:

    def test_returns_all_six_formats(self):
        citations = generate_citations(STUDY_FULL)
        assert set(citations.keys()) == {
            "vancouver", "apa", "mla", "chicago", "harvard", "bibtex"
        }

    def test_all_non_empty(self):
        citations = generate_citations(STUDY_FULL)
        for fmt, cite in citations.items():
            assert cite, f"{fmt} citation should not be empty"

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError, match="Unknown citation format"):
            generate_citation(STUDY_FULL, "invalid_format")


class TestBibliographyHelpers:

    def test_study_to_bibtex(self):
        from services.citation_service import study_to_bibtex
        bib = study_to_bibtex(STUDY_FULL)
        assert "@article{" in bib
        assert "Radiology" in bib
        assert "2023" in bib

    def test_study_to_ris(self):
        from services.citation_service import study_to_ris
        ris = study_to_ris(STUDY_FULL)
        assert "TY  - JOUR" in ris
        assert "TI  - Diagnostic accuracy" in ris
        assert "ER  - " in ris

    def test_generate_formatted_bibliography(self):
        from services.citation_service import generate_formatted_bibliography
        bib_apa = generate_formatted_bibliography([STUDY_FULL], style="APA")
        assert "Diagnostic accuracy" in bib_apa
        bib_van = generate_formatted_bibliography([STUDY_FULL], style="VANCOUVER")
        assert "1. " in bib_van

