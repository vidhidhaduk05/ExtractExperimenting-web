"""Tests for services/reference_parser.py — RIS and BibTeX parsing."""
import pytest
from services.reference_parser import (
    parse_ris,
    parse_bibtex,
    parse_file,
    _clean_latex,
)


# ── RIS test data ──

RIS_SINGLE = """TY  - JOUR
AU  - Smith, John
AU  - Doe, Alice
TI  - Diagnostic accuracy of MRI for liver metastases
JO  - Radiology
PY  - 2023
DO  - 10.1148/radiol.202323001
ID  - 36789123
AB  - Background: MRI shows promise for detecting liver metastases.
ER  - 
"""

RIS_MULTIPLE = """TY  - JOUR
AU  - Smith, John
TI  - Diagnostic accuracy of MRI
JO  - Radiology
PY  - 2023
DO  - 10.1148/radiol.202323001
ER  - 
TY  - JOUR
AU  - Chen, Wei
TI  - CT versus MRI for liver imaging
JO  - European Radiology
PY  - 2022
DO  - 10.1007/s00330-022-09001
ER  - 
TY  - JOUR
AU  - Johnson, Robert
TI  - Meta-analysis of imaging modalities
JO  - AJR
PY  - 2021
ER  - 
"""

RIS_MISSING_FIELDS = """TY  - JOUR
TI  - Article with no authors or journal
PY  - 2020
ER  - 
"""

RIS_NO_ER = """TY  - JOUR
AU  - Brown, Sarah
TI  - Article without ER terminator
JO  - JAMA
PY  - 2021
"""

# ── BibTeX test data ──

BIBTEX_SINGLE = """@article{smith2023,
  author = {Smith, John and Doe, Alice},
  title = {Diagnostic accuracy of MRI for liver metastases},
  journal = {Radiology},
  year = {2023},
  doi = {10.1148/radiol.202323001},
  abstract = {MRI shows promise for detecting liver metastases.},
}
"""

BIBTEX_MULTIPLE = """@article{smith2023,
  author = {Smith, John and Doe, Alice},
  title = {Diagnostic accuracy of MRI},
  journal = {Radiology},
  year = {2023},
  doi = {10.1148/radiol.202323001},
}

@article{chen2022,
  author = {Chen, Wei},
  title = {CT versus MRI for liver imaging},
  journal = {European Radiology},
  year = {2022},
  doi = {10.1007/s00330-022-09001},
}

@inproceedings{johnson2021,
  author = {Johnson, Robert},
  title = {Meta-analysis of imaging modalities},
  booktitle = {Proceedings of SPIE},
  year = {2021},
}
"""

BIBTEX_LATEX = """@article{latex2023,
  author = {M{\\\"u}ller, Klaus},
  title = {Diagnostic \\textbf{accuracy} of \\textit{MRI}},
  journal = {Radiology},
  year = {2023},
  doi = {10.1148/test.001},
}
"""


class TestParseRIS:
    """Tests for parse_ris function."""

    def test_parse_single_record(self):
        records = parse_ris(RIS_SINGLE)
        assert len(records) == 1
        assert records[0]["title"] == "Diagnostic accuracy of MRI for liver metastases"
        assert "Smith" in records[0]["authors"]
        assert "Doe" in records[0]["authors"]
        assert records[0]["journal"] == "Radiology"
        assert records[0]["publication_year"] == 2023
        assert records[0]["doi"] == "10.1148/radiol.202323001"

    def test_parse_multiple_records(self):
        records = parse_ris(RIS_MULTIPLE)
        assert len(records) == 3
        assert records[0]["title"] == "Diagnostic accuracy of MRI"
        assert records[1]["title"] == "CT versus MRI for liver imaging"
        assert records[2]["title"] == "Meta-analysis of imaging modalities"

    def test_parse_missing_fields(self):
        records = parse_ris(RIS_MISSING_FIELDS)
        assert len(records) == 1
        assert records[0]["title"] == "Article with no authors or journal"
        assert records[0]["authors"] == ""
        assert records[0]["journal"] == ""

    def test_parse_no_er_terminator(self):
        """Records without ER should still be captured."""
        records = parse_ris(RIS_NO_ER)
        assert len(records) >= 1
        assert records[0]["title"] == "Article without ER terminator"

    def test_parse_empty_content(self):
        records = parse_ris("")
        assert records == []

    def test_pmid_extraction(self):
        records = parse_ris(RIS_SINGLE)
        assert records[0]["pmid"] == "36789123"

    def test_multiple_authors(self):
        records = parse_ris(RIS_SINGLE)
        authors = records[0]["authors"]
        assert "Smith" in authors
        assert "Doe" in authors

    def test_source_field(self):
        records = parse_ris(RIS_SINGLE)
        assert "source" in records[0]


class TestParseBibtex:
    """Tests for parse_bibtex function."""

    def test_parse_single_entry(self):
        records = parse_bibtex(BIBTEX_SINGLE)
        assert len(records) == 1
        assert "Diagnostic accuracy of MRI" in records[0]["title"]
        assert "Smith" in records[0]["authors"]
        assert "Doe" in records[0]["authors"]
        assert records[0]["journal"] == "Radiology"
        assert records[0]["publication_year"] == 2023

    def test_parse_multiple_entries(self):
        records = parse_bibtex(BIBTEX_MULTIPLE)
        assert len(records) == 3
        assert "Diagnostic accuracy" in records[0]["title"]
        assert "CT versus MRI" in records[1]["title"]
        assert "Meta-analysis" in records[2]["title"]

    def test_parse_latex_cleanup(self):
        records = parse_bibtex(BIBTEX_LATEX)
        assert len(records) == 1
        # LaTeX commands should be cleaned
        assert "\\textbf" not in records[0]["title"]
        assert "\\textit" not in records[0]["title"]

    def test_parse_empty_content(self):
        records = parse_bibtex("")
        assert records == []

    def test_author_splitting(self):
        records = parse_bibtex(BIBTEX_SINGLE)
        authors = records[0]["authors"]
        # Authors should be split by "and" and joined by ", "
        assert "Smith" in authors
        assert "Doe" in authors


class TestParseFile:
    """Tests for parse_file auto-detection."""

    def test_detect_ris_by_extension(self):
        records = parse_file(RIS_SINGLE, "references.ris")
        assert len(records) == 1

    def test_detect_bibtex_by_extension(self):
        records = parse_file(BIBTEX_SINGLE, "references.bib")
        assert len(records) == 1

    def test_detect_ris_by_content(self):
        records = parse_file(RIS_SINGLE, "unknown.txt")
        assert len(records) == 1

    def test_detect_bibtex_by_content(self):
        records = parse_file(BIBTEX_SINGLE, "unknown.txt")
        assert len(records) == 1

    def test_empty_file(self):
        records = parse_file("", "empty.ris")
        assert records == []


class TestCleanLatex:
    """Tests for _clean_latex helper."""

    def test_remove_braces(self):
        assert _clean_latex("{test}") == "test"

    def test_clean_textbf(self):
        result = _clean_latex("\\textbf{important}")
        assert "important" in result
        assert "\\textbf" not in result

    def test_clean_textit(self):
        result = _clean_latex("\\textit{italic}")
        assert "italic" in result
        assert "\\textit" not in result
