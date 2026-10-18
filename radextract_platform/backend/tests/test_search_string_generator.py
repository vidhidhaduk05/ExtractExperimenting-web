"""Tests for services/search_string_generator.py — database-specific search strings + criteria."""
import pytest
from services.search_string_generator import (
    generate_search_strings,
    generate_criteria_from_pico,
    _extract_key_phrases,
    _lookup_term,
    MESH_MAPPING,
)


# ── Test PICO data ──

FULL_PICO = {
    "population": "patients with colorectal cancer",
    "index_test": "MRI",
    "comparator": "CT",
    "outcome": "diagnostic accuracy",
    "study_design": "diagnostic accuracy study",
}

PARTIAL_PICO = {
    "population": "patients with liver cancer",
    "index_test": "CT",
    "comparator": "",
    "outcome": "sensitivity and specificity",
    "study_design": "",
}

EMPTY_PICO = {
    "population": "",
    "index_test": "",
    "comparator": "",
    "outcome": "",
    "study_design": "",
}


class TestGenerateSearchStrings:
    """Tests for generate_search_strings function."""

    def test_returns_all_6_databases(self):
        result = generate_search_strings(FULL_PICO)
        expected_dbs = {"pubmed", "embase", "cochrane", "web_of_science", "scopus", "cinahl"}
        assert set(result.keys()) == expected_dbs

    def test_pubmed_has_mesh_terms(self):
        result = generate_search_strings(FULL_PICO)
        assert "[MeSH Terms]" in result["pubmed"]
        assert "[tiab]" in result["pubmed"]

    def test_pubmed_has_and_operator(self):
        result = generate_search_strings(FULL_PICO)
        assert " AND " in result["pubmed"]

    def test_embase_has_emtree_syntax(self):
        result = generate_search_strings(FULL_PICO)
        assert "/exp" in result["embase"]
        assert ":ab,ti" in result["embase"]

    def test_cochrane_has_ti_ab_kw(self):
        result = generate_search_strings(FULL_PICO)
        assert ":ti,ab,kw" in result["cochrane"]

    def test_web_of_science_has_ts_prefix(self):
        result = generate_search_strings(FULL_PICO)
        assert result["web_of_science"].startswith("TS=")
        assert "(" in result["web_of_science"]

    def test_scopus_has_title_abs_key(self):
        result = generate_search_strings(FULL_PICO)
        assert result["scopus"].startswith("TITLE-ABS-KEY(")

    def test_cinahl_has_mh_headings(self):
        result = generate_search_strings(FULL_PICO)
        assert "MH " in result["cinahl"]
        assert "TI " in result["cinahl"]

    def test_partial_pico(self):
        """Missing comparator and study design should still produce strings."""
        result = generate_search_strings(PARTIAL_PICO)
        assert result["pubmed"]  # Should not be empty
        assert "[MeSH Terms]" in result["pubmed"]

    def test_empty_pico(self):
        """Empty PICO should produce empty strings."""
        result = generate_search_strings(EMPTY_PICO)
        for db in ["pubmed", "embase", "cochrane", "web_of_science", "scopus", "cinahl"]:
            assert result[db] == ""

    def test_pubmed_string_is_nonempty(self):
        result = generate_search_strings(FULL_PICO)
        assert len(result["pubmed"]) > 20

    def test_mesh_mapping_has_known_terms(self):
        assert "colorectal cancer" in MESH_MAPPING
        assert "mri" in MESH_MAPPING
        assert "ct" in MESH_MAPPING
        assert "diagnostic accuracy" in MESH_MAPPING

    def test_mesh_mapping_lookup_known(self):
        mapping = _lookup_term("MRI")
        assert mapping is not None
        assert "mesh" in mapping
        assert mapping["mesh"] == "magnetic resonance imaging"

    def test_mesh_mapping_lookup_unknown(self):
        mapping = _lookup_term("quantum computing device")
        assert mapping is None

    def test_mesh_mapping_partial_match(self):
        """Phrase containing a known term should find the mapping."""
        mapping = _lookup_term("patients with colorectal cancer")
        assert mapping is not None
        assert "colorectal neoplasms" in mapping["mesh"]


class TestGenerateCriteria:
    """Tests for generate_criteria_from_pico function."""

    def test_returns_inclusion_and_exclusion(self):
        result = generate_criteria_from_pico(FULL_PICO)
        assert "inclusion" in result
        assert "exclusion" in result
        assert isinstance(result["inclusion"], list)
        assert isinstance(result["exclusion"], list)

    def test_inclusion_count_matches_pico(self):
        """4 PICO elements (P, I, O, S) → 4 inclusion criteria."""
        result = generate_criteria_from_pico(FULL_PICO)
        assert len(result["inclusion"]) == 4

    def test_exclusion_has_defaults(self):
        """Should have at least 3 default exclusion criteria."""
        result = generate_criteria_from_pico(FULL_PICO)
        assert len(result["exclusion"]) >= 3

    def test_exclusion_includes_comparator(self):
        """When comparator is defined, an exclusion criterion references it."""
        result = generate_criteria_from_pico(FULL_PICO)
        comparator_exclusions = [c for c in result["exclusion"] if "CT" in c["text"]]
        assert len(comparator_exclusions) >= 1

    def test_inclusion_contains_pico_text(self):
        result = generate_criteria_from_pico(FULL_PICO)
        pop_criteria = [c for c in result["inclusion"] if "colorectal" in c["text"].lower()]
        assert len(pop_criteria) >= 1

    def test_criteria_have_ids(self):
        result = generate_criteria_from_pico(FULL_PICO)
        for c in result["inclusion"]:
            assert "id" in c
            assert "text" in c
            assert len(c["id"]) > 0

    def test_empty_pico_criteria(self):
        """Empty PICO should produce no inclusion criteria but still have default exclusions."""
        result = generate_criteria_from_pico(EMPTY_PICO)
        assert len(result["inclusion"]) == 0
        assert len(result["exclusion"]) >= 3  # Default exclusions

    def test_partial_pico_criteria(self):
        """Partial PICO should produce criteria only for defined elements."""
        result = generate_criteria_from_pico(PARTIAL_PICO)
        # P, I, O are defined → 3 inclusion criteria
        assert len(result["inclusion"]) == 3


class TestExtractKeyPhrases:
    """Tests for _extract_key_phrases helper."""

    def test_simple_phrase(self):
        phrases = _extract_key_phrases("colorectal cancer")
        assert len(phrases) >= 1
        assert "colorectal cancer" in phrases[0].lower()

    def test_multiple_phrases(self):
        phrases = _extract_key_phrases("colorectal cancer, liver metastases")
        assert len(phrases) >= 2

    def test_empty_text(self):
        phrases = _extract_key_phrases("")
        assert phrases == []

    def test_stopwords_filtered(self):
        """Phrases that are only stopwords should be filtered out."""
        phrases = _extract_key_phrases("the and or")
        assert phrases == []
