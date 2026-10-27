"""Safety contracts: examples are software fixtures, not a labeled accuracy benchmark."""
import json

import pytest

from services import duplicate_finder as finder


def record(sid, **changes):
    return dict(study_id=sid, title="Imaging for acute stroke", authors="Smith J; Jones K",
                publication_year=2023, journal="Radiology", doi="", pmid="", **changes)


def pair(a=None, b=None, human=(), rejected=()):
    a = {"study_id": "a", **(a or {})}
    b = {"study_id": "b", **(b or {})}
    base = dict(title="Imaging for acute stroke", authors="Smith J; Jones K",
                publication_year=2023, journal="Radiology", doi="", pmid="")
    return finder.find_candidate_pairs([{**base, **a}, {**base, **b}], set(human), set(rejected))


def test_t0_conflicting_identifier_veto():
    matches = pair({"doi": "10.1234/same", "pmid": "123"},
                   {"doi": "10.1234/same", "pmid": "456"})
    assert matches and not any(p.auto_mergeable for p in matches)


def test_nct_only_is_review():
    matches = pair({"abstract": "Registered NCT01234567", "title": "Protocol for stroke trial"},
                   {"abstract": "Registered NCT01234567", "title": "Long term trial outcomes"})
    assert matches and not any(p.auto_mergeable for p in matches)


def test_numeric_title_and_negation_are_not_erased():
    assert finder.title_fuzzy_similarity("Drug 1 in adults", "Drug 2 in adults") < 1
    matches = pair({"title": "Drug 1 in adults"}, {"title": "Drug 2 in adults"})
    assert not any(p.auto_mergeable for p in matches)
    assert "versus" in finder.normalize_title("Drug A vs. placebo")


def test_real_first_author_not_alphabetic_minimum():
    matches = pair({"authors": "Smith J; Adams K"}, {"authors": "Brown L; Adams K"})
    assert all(p.tier != "T1" for p in matches)


def test_invalid_doi_not_t0():
    matches = pair({"doi": "10.1/fixture"}, {"doi": "10.1/fixture"})
    assert all(p.tier != "T0" for p in matches)


@pytest.mark.parametrize("year", ["in press", "2022-2023", None])
def test_year_parsing_is_total(year):
    pair({"publication_year": year}, {"publication_year": 2023})


def test_publication_ids_keep_namespaces():
    matches = pair({"pmid": "123"}, {"pmid": "", "metadata_json": json.dumps({"pmcid": "PMC123"})})
    assert all(p.tier != "T0" for p in matches)


def test_identifier_confirmed_protocol_duplicates_can_merge():
    matches = pair({"doi": "10.1234/protocol", "title": "Study protocol for imaging trial"},
                   {"doi": "10.1234/protocol", "title": "Study protocol for imaging trial."})
    assert any(p.auto_mergeable for p in matches)


def test_group_conflict_cannot_bridge_through_missing_doi():
    studies = [
        {"study_id": sid, "title": "The same imaging trial", "authors": "Smith J",
         "publication_year": 2023, "doi": doi}
        for sid, doi in (("a", "10.1234/one"), ("b", ""), ("c", "10.1234/two"))
    ]
    pairs = finder.find_candidate_pairs(studies)
    groups, _ = finder.build_merge_groups(studies, pairs)
    assert not groups


def test_group_respects_rejected_indirect_pair():
    studies = [{"study_id": sid, "title": "The same imaging trial", "doi": "10.1234/same"}
               for sid in ("a", "b", "c")]
    pairs = finder.find_candidate_pairs(studies, non_duplicate_pairs={("b", "c")})
    groups, _ = finder.build_merge_groups(studies, pairs, {("b", "c")})
    assert not groups


def test_oversize_component_never_auto_merges():
    studies = [{"study_id": str(i), "title": "Trial", "doi": "10.1234/same"} for i in range(6)]
    groups, review = finder.build_merge_groups(studies, finder.find_candidate_pairs(studies))
    assert not groups and review
