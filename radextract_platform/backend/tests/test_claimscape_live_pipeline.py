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
