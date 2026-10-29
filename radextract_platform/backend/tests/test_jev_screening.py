"""Tests for the opt-in Jev screening integration (mode off / shadow / on, fallback, composition)."""
import pytest

from config import settings
from services import jev_client, jev_screener
from services import llm_extractor
from services.jev_client import JevError
from services.clarification_generator import screen_with_clarification

PICO = {"population": "Adults with pure arterial malformation", "intervention": "Endovascular treatment"}


def _noul(v):
    return {"type": "noul", "noul": v}


def _answers(pop=0.95, inter=0.95, non_human=0.01, non_research=0.01, reason=None):
    a = {
        "population_match": _noul(pop),
        "intervention_match": _noul(inter),
        "non_human_study": _noul(non_human),
        "non_research_article": _noul(non_research),
    }
    if reason:
        a["exclusion_reason"] = {"type": "choice", "choice": reason, "probabilities": {}, "confidence": 0.9}
    return a


class FakeClient:
    """Stand-in for ToolCallingClient; records use so tests can prove the LLM path was (not) taken."""
    calls = 0


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    jev_client.reset_breaker()
    monkeypatch.setattr(settings, "jev_api_key", "test-key")
    monkeypatch.setattr(settings, "jev_mode", "off")
    monkeypatch.setattr(settings, "jev_provider", "typesafe")
    yield
    jev_client.reset_breaker()


@pytest.fixture
def llm_calls(monkeypatch):
    calls = {"n": 0}

    def fake_call(self, *a, **k):
        calls["n"] += 1
        return {"decision": "include", "confidence": 0.9, "reason": "llm"}

    monkeypatch.setattr(llm_extractor.ToolCallingClient, "call_with_tool", fake_call)
    return calls


def _abstract():
    return llm_extractor.screen_title_abstract_with_llm(title="T", abstract="A", pico_criteria=PICO)


def test_off_uses_llm_only(monkeypatch, llm_calls):
    monkeypatch.setattr(jev_client, "ask", lambda *a, **k: pytest.fail("Jev must not be called when off"))
    res = _abstract()
    assert res["reason"] == "llm" and llm_calls["n"] == 1


def test_on_returns_jev_and_skips_llm(monkeypatch, llm_calls):
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(jev_client, "ask", lambda *a, **k: _answers())
    res = _abstract()
    assert res["engine"] == "jev" and res["decision"] == "include" and llm_calls["n"] == 0


def test_on_falls_back_to_llm_when_jev_fails(monkeypatch, llm_calls):
    monkeypatch.setattr(settings, "jev_mode", "on")

    def boom(*a, **k):
        raise JevError("down")

    monkeypatch.setattr(jev_client, "ask", boom)
    res = _abstract()
    assert res["reason"] == "llm" and llm_calls["n"] == 1


def test_shadow_returns_llm_result_and_calls_jev(monkeypatch, llm_calls):
    monkeypatch.setattr(settings, "jev_mode", "shadow")
    seen = {"n": 0}

    def ask(*a, **k):
        seen["n"] += 1
        return _answers(pop=0.05)

    monkeypatch.setattr(jev_client, "ask", ask)
    res = _abstract()
    assert res["reason"] == "llm" and llm_calls["n"] == 1 and seen["n"] == 1


def test_no_key_never_calls_jev(monkeypatch, llm_calls):
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(settings, "jev_api_key", "")
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    monkeypatch.setattr(jev_client, "ask", lambda *a, **k: pytest.fail("no key"))
    assert _abstract()["reason"] == "llm"


def test_no_pico_falls_back(monkeypatch, llm_calls):
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(jev_client, "ask", lambda *a, **k: pytest.fail("no PICO"))
    res = llm_extractor.screen_title_abstract_with_llm(title="T", abstract="A", pico_criteria={})
    assert res["reason"] == "llm"


def test_compose_exclude_on_population_mismatch():
    r = jev_screener.compose("abstract", _answers(pop=0.05), jev_screener._pico_fields(PICO), None)
    assert r["decision"] == "exclude" and r["reason_code"] == "population_mismatch" and r["confidence"] >= 0.85


def test_compose_hard_exclude_wins():
    r = jev_screener.compose("abstract", _answers(non_human=0.97), jev_screener._pico_fields(PICO), None)
    assert r["decision"] == "exclude" and r["reason_code"] == "non_human_study"


def test_compose_uses_project_exclusion_reason():
    reasons = ["Wrong population", "Animal study"]
    r = jev_screener.compose(
        "abstract", _answers(pop=0.03, reason="wrong_population"), jev_screener._pico_fields(PICO), reasons
    )
    assert r["decision"] == "exclude" and r["reason_code"] == "wrong_population"


def test_compose_uncertain_asks_clarification_for_ambiguous_aspect():
    r = jev_screener.compose("abstract", _answers(pop=0.5, inter=0.95), jev_screener._pico_fields(PICO), None, "abs")
    assert r["decision"] == "uncertain" and r["needs_clarification"]
    assert r["clarification_type"] == "population_match" and len(r["clarification_options"]) >= 2


def test_compose_uncertain_no_clarification_when_not_ambiguous():
    r = jev_screener.compose("abstract", _answers(pop=0.7, inter=0.7), jev_screener._pico_fields(PICO), None)
    assert r["decision"] == "uncertain" and not r["needs_clarification"]


def test_title_stage_needs_higher_include_confidence():
    r = jev_screener.compose("title", _answers(pop=0.85, inter=0.85), jev_screener._pico_fields(PICO), None)
    assert r["decision"] == "uncertain"
    r = jev_screener.compose("title", _answers(pop=0.95, inter=0.95), jev_screener._pico_fields(PICO), None)
    assert r["decision"] == "include"


def test_clarification_flow_shape(monkeypatch):
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(jev_client, "ask", lambda *a, **k: _answers(pop=0.5))
    res = screen_with_clarification(title="T", abstract="A", pico_criteria=PICO)
    assert res["recommendation"] == "needs_clarification"
    assert {"question_text", "options", "pico_aspect", "question_type"} <= set(res["clarification"])


def test_dict_exclusion_reasons_are_accepted(monkeypatch):
    monkeypatch.setattr(settings, "jev_mode", "on")
    captured = {}

    def ask(state, questions):
        captured["q"] = questions
        return _answers()

    monkeypatch.setattr(jev_client, "ask", ask)
    res = jev_screener.screen("abstract", "T", "A", pico=PICO, exclusion_reasons=[{"label": "Animal study"}])
    assert res and "animal_study" in captured["q"]["exclusion_reason"]["criteria"]


def test_circuit_breaker_opens_after_repeated_failures(monkeypatch):
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(settings, "jev_max_retries", 0)

    class R:
        status_code = 400
        text = "bad"

    monkeypatch.setattr(jev_client.httpx, "post", lambda *a, **k: R())
    for _ in range(3):
        with pytest.raises(JevError):
            jev_client.ask("s", {})
    assert jev_client.is_jev_enabled() is False


def test_tier1_search_string_exclusion(monkeypatch):
    """Search syntax is a retrieval filter and does not veto PICO eligibility, but is tracked."""
    monkeypatch.setattr(settings, "jev_mode", "on")
    jev_called = []

    def mock_ask(*a, **k):
        jev_called.append(True)
        return _answers()

    monkeypatch.setattr(jev_client, "ask", mock_ask)
    search_str = '("metformin"[tiab]) AND (longevity OR lifespan)'
    abstract_text = "This trial evaluates acetaminophen for acute migraine in adolescents."

    res = jev_screener.screen(
        "abstract",
        title="Migraine treatment",
        abstract=abstract_text,
        pico=PICO,
        search_string=search_str,
    )
    assert res is not None
    assert res.get("search_matched") is False
    assert res["decision"] == "include"
    assert len(jev_called) == 1


def test_tier1_search_string_match_reaches_tier2(monkeypatch):
    """Studies passing the search string proceed to Tier-2 Laya inference."""
    monkeypatch.setattr(settings, "jev_mode", "on")
    jev_called = []

    def mock_ask(*a, **k):
        jev_called.append(True)
        return _answers(pop=0.92, inter=0.92)

    monkeypatch.setattr(jev_client, "ask", mock_ask)
    search_str = '("arterial malformation"[tiab]) AND (endovascular)'
    abstract_text = "In this trial, adults with pure arterial malformation underwent endovascular treatment."

    res = jev_screener.screen(
        "abstract",
        title="Pure Arterial Malformation Trial",
        abstract=abstract_text,
        pico=PICO,
        search_string=search_str,
        fast_mode=True,
    )
    assert res is not None
    assert res["decision"] == "include"
    assert len(jev_called) == 1  # Proceeded to Tier 2!


def test_screen_batch_two_tier(monkeypatch):
    """Batched screening evaluates studies with PICO inference and attaches search_matched status."""
    monkeypatch.setattr(settings, "jev_mode", "on")

    def mock_ask_batch(requests):
        return {req[0]: _answers(pop=0.9, inter=0.9) for req in requests}

    monkeypatch.setattr(jev_client, "ask_batch", mock_ask_batch)

    studies = [
        {"study_id": "s1", "title": "Adults with pure arterial malformation", "abstract": "Endovascular treatment outcomes"},
        {"study_id": "s2", "title": "Unrelated Pediatric Study", "abstract": "Antibiotics in pediatric otitis media"},
    ]
    search_str = '("arterial malformation") AND (endovascular)'

    results = jev_screener.screen_batch(
        studies,
        pico=PICO,
        search_string=search_str,
        fast_mode=True,
    )
    assert len(results) == 2
    assert results[0]["decision"] == "include"
    assert results[0].get("search_matched") is True
    assert results[1]["decision"] == "include"
    assert results[1].get("search_matched") is False

