"""Plain-text PubMed searches must be phrase searches; advanced queries stay as typed."""
import pytest

from services import literature_search_service as svc


@pytest.mark.parametrize("query", [
    'pure arterial malformation AND aneurysm',
    '"pure arterial malformation"',
    'aneurysm[MeSH Terms]',
    '(stroke OR infarct) NOT animal',
    'arter*',
    'cerebral NOT spinal',
])
def test_advanced_queries_are_sent_unchanged(query):
    assert svc.pubmed_terms(query) == [query]


def test_plain_text_becomes_phrase_then_all_words():
    assert svc.pubmed_terms("pure arterial malformation") == [
        '"pure arterial malformation"[Title/Abstract]',
        "pure[Title/Abstract] AND arterial[Title/Abstract] AND malformation[Title/Abstract]",
    ]


def test_stopwords_dropped_from_the_all_words_search_only():
    terms = svc.pubmed_terms("diagnosis of pure arterial malformation in adults")
    assert terms[0] == '"diagnosis of pure arterial malformation in adults"[Title/Abstract]'
    assert "of[" not in terms[1] and "in[" not in terms[1] and "adults[Title/Abstract]" in terms[1]


def test_single_word_and_blank_queries():
    assert svc.pubmed_terms("aneurysm") == ['"aneurysm"[Title/Abstract]']
    assert svc.pubmed_terms("   ") == [] and svc.pubmed_terms("") == []


def test_extra_whitespace_is_collapsed():
    assert svc.pubmed_terms("  pure   arterial \n malformation ")[0] == '"pure arterial malformation"[Title/Abstract]'


def _fake(monkeypatch, by_term):
    calls = []
    monkeypatch.setattr(svc, "_pubmed_ids", lambda term, n: (calls.append(term), by_term.get(term, []))[1])

    class Resp:
        def raise_for_status(self): pass
        def json(self): return {"result": {}}

    class Client:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **k): return Resp()

    monkeypatch.setattr(svc.httpx, "Client", Client)
    return calls


def test_phrase_hits_fill_the_result_without_a_second_query(monkeypatch):
    phrase = '"pure arterial malformation"[Title/Abstract]'
    calls = _fake(monkeypatch, {phrase: ["1", "2", "3"]})
    out = svc.search_pubmed("pure arterial malformation", max_results=3)
    assert [r["pmid"] for r in out] == ["1", "2", "3"] and calls == [phrase]


def test_all_words_search_tops_up_a_short_phrase_result_without_duplicates(monkeypatch):
    phrase = '"pure arterial malformation"[Title/Abstract]'
    words = "pure[Title/Abstract] AND arterial[Title/Abstract] AND malformation[Title/Abstract]"
    calls = _fake(monkeypatch, {phrase: ["1", "2"], words: ["2", "3", "4", "5"]})
    out = svc.search_pubmed("pure arterial malformation", max_results=4)
    assert [r["pmid"] for r in out] == ["1", "2", "3", "4"] and calls == [phrase, words]


def test_advanced_query_makes_a_single_unchanged_request(monkeypatch):
    calls = _fake(monkeypatch, {"stroke AND mri": ["9"]})
    out = svc.search_pubmed("stroke AND mri", max_results=5)
    assert [r["pmid"] for r in out] == ["9"] and calls == ["stroke AND mri"]


def test_no_results_returns_empty(monkeypatch):
    _fake(monkeypatch, {})
    assert svc.search_pubmed("nothing matches this", max_results=5) == []
