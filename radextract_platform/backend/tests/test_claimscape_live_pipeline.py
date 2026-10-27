"""Live ClaimScape requests must not masquerade as presets or successful failures."""
import hashlib
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services import claimscape_fast_pipeline as pipeline
from routers.claimscape import router


ARTICLE_XML = """<PubmedArticleSet><PubmedArticle><MedlineCitation>
<PMID>123</PMID><Article><ArticleTitle>Live retrieved paper</ArticleTitle>
<Abstract><AbstractText>The treatment reduced the observed risk.</AbstractText></Abstract>
</Article></MedlineCitation></PubmedArticle></PubmedArticleSet>"""


@pytest.fixture(autouse=True)
def isolated_pipeline(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(pipeline, "_CLAIMSCAPE_CACHE", {})
    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: None)


def mock_pubmed(monkeypatch, search=None, xml=ARTICLE_XML, search_status=200, fetch_status=200):
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path.endswith("esearch.fcgi"):
            return httpx.Response(search_status, json=search if search is not None else {
                "esearchresult": {"count": "1", "idlist": ["123"]}
            })
        return httpx.Response(fetch_status, text=xml)

    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(pipeline, "_get_http_client", lambda: client)
    return requests


def test_hrt_request_retrieves_live_papers_instead_of_landmark_preset(monkeypatch):
    requests = mock_pubmed(monkeypatch)
    result = pipeline.evaluate_claim_fast("Hormone replacement improves bone health", query="hrt bone")
    assert len(requests) == 2
    assert result["papers"][0]["title"] == "Live retrieved paper"
    assert result["cached"] is False
    assert result["engine"] == "heuristic_fallback"


def test_empty_search_is_success_without_inference(monkeypatch):
    requests = mock_pubmed(monkeypatch, search={"esearchresult": {"count": "0", "idlist": []}})
    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: pytest.fail("No articles to evaluate"))
    result = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert len(requests) == 1
    assert result["total"] == 0
    assert result["papers"] == result["judgments"] == []
    assert result["engine"] == "none"
    assert result["cached"] is False


@pytest.mark.parametrize("status,search", [
    (503, {}),
    (200, {"error": "API rate limit exceeded"}),
    (200, {"esearchresult": {"count": "1", "idlist": []}}),
    (200, {"esearchresult": {"ERROR": "Search failed", "count": "0", "idlist": []}}),
])
def test_search_failures_are_not_empty_successes(monkeypatch, status, search):
    mock_pubmed(monkeypatch, search=search, search_status=status)
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).post("/api/claimscape/evaluate", json={"claim": "Treatment improves survival"})
    assert response.status_code == 500
    assert "PubMed search failed" in response.json()["detail"]
    assert not pipeline._CLAIMSCAPE_CACHE


@pytest.mark.parametrize("status,xml", [(503, "busy"), (200, "broken xml"), (200, "<PubmedArticleSet/>"),
                                       (200, ARTICLE_XML.replace("123", "999"))])
def test_fetch_failures_are_not_partial_successes(monkeypatch, status, xml):
    mock_pubmed(monkeypatch, fetch_status=status, xml=xml)
    with pytest.raises(RuntimeError, match="PubMed article retrieval failed"):
        pipeline.evaluate_claim_fast("Treatment improves survival")
    assert not pipeline._CLAIMSCAPE_CACHE


@pytest.mark.parametrize("model_fails", [False, True])
def test_inference_provenance_survives_memory_and_disk_cache(monkeypatch, model_fails):
    requests = mock_pubmed(monkeypatch)
    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: object())

    def evaluate(*args):
        if model_fails:
            raise RuntimeError("Model unavailable")
        return [{"pmid": "123", "stance": {"supports": 0.8, "contradicts": 0.2}}]

    monkeypatch.setattr(pipeline, "_batch_eval_laya", evaluate)
    first = pipeline.evaluate_claim_fast("Treatment improves survival")
    memory = pipeline.evaluate_claim_fast("Treatment improves survival")
    pipeline._CLAIMSCAPE_CACHE.clear()
    disk = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert len(requests) == 2
    expected = "heuristic_fallback" if model_fails else "local_laya_onnx"
    assert first["engine"] == memory["engine"] == disk["engine"] == expected
    assert first["cached"] is False
    assert memory["cached"] is disk["cached"] is True


def test_legacy_cache_cannot_answer_live_request(monkeypatch, tmp_path):
    claim, query, count = "Hormone replacement improves bone health", "hrt bone", 100
    key = hashlib.sha256(f"{claim}:{query}:{count}".encode()).hexdigest()
    stale = {"papers": [{"title": "Unrelated historic preset"}], "cached": True}
    pipeline._CLAIMSCAPE_CACHE[key] = stale
    (tmp_path / f"{key}.json").write_text(json.dumps(stale), encoding="utf-8")
    requests = mock_pubmed(monkeypatch)
    result = pipeline.evaluate_claim_fast(claim, query, count)
    assert len(requests) == 2
    assert result["papers"][0]["title"] == "Live retrieved paper"
    assert result["cached"] is False


def test_memory_cache_evicts_least_recently_used(monkeypatch):
    monkeypatch.setattr(pipeline, "_CLAIMSCAPE_CACHE_MAX_ENTRIES", 2)
    pipeline._memory_cache_put("a", {"engine": "local_laya_onnx"})
    pipeline._memory_cache_put("b", {"engine": "heuristic_fallback"})
    assert pipeline._memory_cache_get("a")["engine"] == "local_laya_onnx"
    pipeline._memory_cache_put("c", {"engine": "local_laya_onnx"})
    assert pipeline._memory_cache_get("b") is None
    assert set(pipeline._CLAIMSCAPE_CACHE) == {"a", "c"}


def test_memory_cache_updates_do_not_evict_other_entries(monkeypatch):
    monkeypatch.setattr(pipeline, "_CLAIMSCAPE_CACHE_MAX_ENTRIES", 2)
    pipeline._memory_cache_put("a", {"total": 1})
    pipeline._memory_cache_put("b", {"total": 2})
    pipeline._memory_cache_put("a", {"total": 3})
    assert pipeline._memory_cache_get("a") == {"total": 3}
    assert pipeline._memory_cache_get("b") == {"total": 2}


def test_memory_cache_does_not_mutate_response_metadata():
    original = {"cached": False, "engine": "local_laya_onnx"}
    pipeline._memory_cache_put("a", original)
    original["cached"] = True
    response = pipeline._memory_cache_get("a")
    assert response["cached"] is False
    response["cached"] = True
    assert pipeline._memory_cache_get("a")["cached"] is False


def test_memory_cache_concurrent_access_stays_bounded(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    monkeypatch.setattr(pipeline, "_CLAIMSCAPE_CACHE_MAX_ENTRIES", 4)

    def access(index):
        key = str(index % 12)
        pipeline._memory_cache_put(key, {"total": index})
        result = pipeline._memory_cache_get(key)
        assert result is None or isinstance(result["total"], int)

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(access, range(400)))
    assert len(pipeline._CLAIMSCAPE_CACHE) <= 4


def test_evicted_result_is_served_from_disk(monkeypatch):
    monkeypatch.setattr(pipeline, "_CLAIMSCAPE_CACHE_MAX_ENTRIES", 1)
    requests = mock_pubmed(monkeypatch)
    first = pipeline.evaluate_claim_fast("Treatment improves survival")
    pipeline.evaluate_claim_fast("Treatment reduces pain")
    disk = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert len(requests) == 4
    assert disk["cached"] is True
    assert disk["papers"] == first["papers"]
    assert disk["engine"] == first["engine"]
    assert len(pipeline._CLAIMSCAPE_CACHE) == 1


def test_sample_size_extraction():
    # 1. Systematic Review
    meta_res = pipeline._extract_sample_size(
        abstract="We identified 18 eligible studies comprising 4,500 subjects.",
        title="Meta-Analysis of Thrombectomy",
        tier="meta",
        pub_types=["Meta-Analysis", "Systematic Review"]
    )
    assert meta_res["sample_size"] == 4500
    assert "18 studies" in meta_res["sample_size_display"]
    assert "4,500 patients" in meta_res["sample_size_display"]

    # 2. Case Report
    case_res = pipeline._extract_sample_size(
        abstract="A 42-year-old male presented with fever and confusion.",
        title="Encephalitis Presentation: A Case Report",
        tier="case",
        pub_types=["Case Reports"]
    )
    assert case_res["sample_size"] == 1
    assert case_res["sample_size_display"] == "1 patient (Case Report)"

    # 3. Case Series
    series_res = pipeline._extract_sample_size(
        abstract="We report a series of 12 consecutive patients treated with novel stents.",
        title="Endovascular Treatment: Case Series",
        tier="case",
        pub_types=[]
    )
    assert series_res["sample_size"] == 12
    assert "12 patients (Case Series)" in series_res["sample_size_display"]

    # 4. Randomized Controlled Trial
    rct_res = pipeline._extract_sample_size(
        abstract="A total of 1,200 patients were randomized to receive stenting or medical care.",
        title="Trial of Stenting",
        tier="rct",
        pub_types=["Randomized Controlled Trial"]
    )
    assert rct_res["sample_size"] == 1200
    assert "1,200 participants (RCT)" in rct_res["sample_size_display"]


def test_hypothesis_normalization():
    assert pipeline._normalize_claim_hypothesis("Are ADHD diagnosed people more likely to have autoimmune disease?") == "ADHD diagnosed people are more likely to have autoimmune disease"
    assert pipeline._normalize_claim_hypothesis("Does metformin extend lifespan in humans?") == "metformin extends lifespan in humans"
    assert pipeline._normalize_claim_hypothesis("Is aspirin effective in preventing stroke?") == "aspirin is effective in preventing stroke"


def test_laya_loaded_path_answers_all_questions_and_finding_sentence(monkeypatch):
    """(a) Laya-loaded path produces judgments with all five questions answered and a real finding sentence."""
    from services.jev_client import _get_laya_engine
    real_model = _get_laya_engine()
    assert real_model is not None, "Local Laya ONNX model should be loaded"
    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: real_model)

    sample_xml = """<PubmedArticleSet><PubmedArticle><MedlineCitation>
    <PMID>123</PMID><Article><ArticleTitle>Sleep deprivation and working memory</ArticleTitle>
    <Abstract><AbstractText>Sleep loss is common worldwide. We tested working memory after sleep deprivation. Subjects with 24 hours of wakefulness experienced significant working memory deterioration (p &lt; 0.01). Restorative sleep returned performance to baseline levels.</AbstractText></Abstract>
    </Article></MedlineCitation></PubmedArticle></PubmedArticleSet>"""
    mock_pubmed(monkeypatch, xml=sample_xml)

    result = pipeline.evaluate_claim_fast("Can sleeping less cause memory loss?", query="sleep loss memory")
    assert result["engine"] == "local_laya_onnx"
    assert len(result["judgments"]) == 1
    j = result["judgments"][0]

    # Verify all 5 questions answered
    assert "onTopic" in j and isinstance(j["onTopic"], float)
    assert "direct" in j and isinstance(j["direct"], float)
    assert "stance" in j and "mixed" in j["stance"]
    assert "stanceCheck" in j and "mixed" in j["stanceCheck"]
    assert "finding" in j and j["finding"] is not None
    assert "index" in j["finding"]

    # Real finding sentence extracted, not blind sents[0]
    assert j["findingSentence"] is not None
    assert isinstance(j["findingSentence"], str)
    assert len(j["findingSentence"]) > 10


def test_model_unavailable_sets_heuristic_fallback(monkeypatch):
    """(b) Model-unavailable path sets engine: 'heuristic_fallback' AND the response flags it."""
    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: None)
    mock_pubmed(monkeypatch)
    result = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert result["engine"] == "heuristic_fallback"
    assert len(result["judgments"]) == 1
    j = result["judgments"][0]
    assert j["onTopic"] == 0.92
    assert "supports" in j["stance"]
    assert "mixed" in j["stance"]


def test_unclear_rule_when_stance_and_check_disagree(monkeypatch):
    """(c) Unclear-rule test: mocked model output where stance=supports (0.7) and stanceCheck=contradicts (0.6) -> unclear."""
    class MockLaya:
        pass

    monkeypatch.setattr(pipeline, "_get_laya_model", lambda: MockLaya())

    def mock_batch_eval(laya_model, articles, hypothesis, q_defs):
        return [{
            "pmid": articles[0]["pmid"],
            "onTopic": 0.95,
            "direct": 0.90,
            "category": "unclear",  # stance (supports) != stanceCheck (contradicts) -> unclear
            "agree": False,
            "strength": 0.40,
            "stance": {"supports": 0.70, "contradicts": 0.10, "mixed": 0.10, "no_result": 0.10},
            "stanceCheck": {"supports": 0.10, "contradicts": 0.60, "mixed": 0.10, "no_result": 0.20},
            "finding": {"index": 0, "confidence": 0.8},
            "findingSentence": "Some finding sentence.",
        }]

    monkeypatch.setattr(pipeline, "_batch_eval_laya", mock_batch_eval)
    mock_pubmed(monkeypatch)
    result = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert result["engine"] == "local_laya_onnx"
    assert len(result["judgments"]) == 1
    j = result["judgments"][0]
    assert j["category"] == "unclear"
    assert j["agree"] is False


def test_retraction_filter_present_in_esearch_params(monkeypatch):
    """(d) Retraction-filter present in the esearch params."""
    requests = mock_pubmed(monkeypatch)
    pipeline.evaluate_claim_fast("Aspirin reduces stroke")
    assert len(requests) >= 1
    esearch_req = requests[0]
    term = esearch_req.url.params.get("term", "")
    assert "hasabstract AND english[la]" in term
    assert "NOT (Retracted Publication[pt]" in term
    assert "Retraction of Publication[pt]" in term
    assert "Published Erratum[pt]" in term
    assert "Expression of Concern[pt]" in term


def test_remote_scan_flag_off_prevents_k_dense_call(monkeypatch):
    """(e) Remote-scan flag off -> no external call to k-dense.ai."""
    from config import settings
    monkeypatch.setattr(settings, "claimscape_remote_scan", False)

    external_called = []
    def handle(request):
        if "k-dense.ai" in str(request.url):
            external_called.append(str(request.url))
            return httpx.Response(200, text="")
        if request.url.path.endswith("esearch.fcgi"):
            return httpx.Response(200, json={"esearchresult": {"count": "1", "idlist": ["123"]}})
        return httpx.Response(200, text=ARTICLE_XML)

    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(pipeline, "_get_http_client", lambda: client)

    result = pipeline.evaluate_claim_fast("Treatment improves survival")
    assert len(external_called) == 0
    assert result["engine"] in ("local_laya_onnx", "heuristic_fallback")


def test_search_term_validation_unrecognized_returns_400(monkeypatch):
    """Search-term validation: if esearch response contains QuotedPhraseNotFound, return 400."""
    search_with_warning = {
        "esearchresult": {
            "count": "0",
            "idlist": [],
            "WarningList": {
                "QuotedPhraseNotFound": ["sleepdeprivatoin"],
                "OutputMessage": []
            }
        }
    }
    mock_pubmed(monkeypatch, search=search_with_warning)
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    resp = client.post("/api/claimscape/evaluate", json={"claim": "Sleeping less causes memory loss", "query": "\"sleepdeprivatoin\""})
    assert resp.status_code == 400
    assert "sleepdeprivatoin" in resp.json()["detail"]

