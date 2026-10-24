"""Jev-based study screening (opt-in).

Replaces one "decide everything and self-report confidence" LLM prompt with a batch of narrow
typed questions answered in a single System One request. Code composes the answers into an
include / exclude / uncertain decision using explicit, configurable thresholds.

Nothing here runs unless ``settings.jev_mode`` is "shadow" or "on" and an API key is set.
Every public function returns ``None`` when Jev is unavailable or fails, so callers can fall
straight through to the existing LLM screening path.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from config import settings
from services import jev_client
from services.jev_client import JevError
from services.search_string_matcher import match_search_string

logger = logging.getLogger("jev_screener")

FULLTEXT_CHAR_LIMIT = 20000  # mirrors the existing LLM full-text truncation
TITLE_INCLUDE_FLOOR = 0.90   # a title alone rarely justifies a confident include
NO_REASON = "none_of_these"


def _pico_fields(pico: Optional[dict[str, Any]]) -> dict[str, str]:
    """Normalise the project's inconsistent PICO keys (outcome/outcomes, intervention/index_test)."""
    pico = pico or {}

    def first(*keys: str) -> str:
        for k in keys:
            v = pico.get(k)
            if v:
                return str(v).strip()
        return ""

    return {
        "population": first("population"),
        "intervention": first("intervention", "index_test"),
        "comparator": first("comparator"),
        "outcome": first("outcomes", "outcome"),
    }


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:60] or "excluded"


def build_state(
    stage: str, title: str, abstract: str, full_text: str, fields: dict[str, str], fast_mode: bool = False
) -> dict[str, Any]:
    if fast_mode or stage == "abstract":
        # Fast Pipeline: Only map abstract (and title) with Population & Intervention
        return {
            "abstract": abstract,
            "title": title,
            "eligibility": {
                k: v for k, v in fields.items() if k in ("population", "intervention") and v
            },
        }
    state: dict[str, Any] = {"eligibility": {k: v for k, v in fields.items() if v}, "title": title}
    if stage == "title":
        state["note"] = "Only the title is available. Absence of detail in a title is not evidence of a mismatch."
    elif stage == "fulltext":
        state["full_text"] = full_text[:FULLTEXT_CHAR_LIMIT]
    else:
        state["abstract"] = abstract
    return state


def build_questions(
    stage: str, fields: dict[str, str], exclusion_reasons: Optional[list[str]], fast_mode: bool = False
) -> dict[str, dict[str, Any]]:
    q: dict[str, dict[str, Any]] = {}
    if fields.get("population"):
        q["population_match"] = {
            "type": "noul",
            "instructions": "Does the study population match `eligibility.population`?",
            "criteria": {
                "true": "The studied patients/subjects fall within the eligible population",
                "false": "The studied patients/subjects are clearly outside the eligible population",
            },
        }
    if fields.get("intervention"):
        q["intervention_match"] = {
            "type": "noul",
            "instructions": "Does the study assess the intervention or index test in `eligibility.intervention`?",
            "criteria": {
                "true": "The eligible intervention/index test is studied or reported",
                "false": "The eligible intervention/index test is clearly not what the study is about",
            },
        }

    # In fast mode, return immediately with Population & Intervention to maximize ONNX throughput
    if fast_mode:
        if exclusion_reasons:
            criteria = {_slug(r): r for r in exclusion_reasons[:200]}
            criteria[NO_REASON] = "None of the listed exclusion reasons applies"
            q["exclusion_reason"] = {
                "type": "choice",
                "instructions": "Which exclusion reason, if any, best describes why this study would not be eligible?",
                "criteria": criteria,
            }
        return q

    if fields.get("outcome") and stage != "abstract":
        q["outcome_reported"] = {
            "type": "noul",
            "instructions": "Does the study report or plausibly report the outcome in `eligibility.outcome`?",
            "criteria": {"true": "The outcome is reported or clearly measured", "false": "The outcome is not addressed"},
        }
    q["non_human_study"] = {
        "type": "noul",
        "instructions": "Is this an animal, in-vitro, phantom, or purely computational study rather than a study of human patients?",
        "criteria": {"true": "Non-human or non-clinical study", "false": "Study of human patients or human data"},
    }
    q["non_research_article"] = {
        "type": "noul",
        "instructions": "Is this an editorial, letter, commentary, erratum, correction, or retraction notice rather than a research report?",
        "criteria": {"true": "Not a research report", "false": "A research report (including case reports and reviews)"},
    }
    if exclusion_reasons:
        criteria = {_slug(r): r for r in exclusion_reasons[:200]}
        criteria[NO_REASON] = "None of the listed exclusion reasons applies"
        q["exclusion_reason"] = {
            "type": "choice",
            "instructions": "Which exclusion reason, if any, best describes why this study would not be eligible?",
            "criteria": criteria,
        }
    if stage == "fulltext":
        q["study_design"] = {
            "type": "choice",
            "instructions": "What is the study design?",
            "criteria": {
                "rct": "Randomised controlled trial",
                "cohort": "Cohort study (prospective or retrospective)",
                "case_control": "Case-control study",
                "case_series": "Case series",
                "case_report": "Single case report",
                "diagnostic_accuracy": "Diagnostic accuracy study",
                "systematic_review": "Systematic review or meta-analysis",
                "other": "Any other design or cannot tell",
            },
        }
    return q


def _noul(answers: dict, key: str) -> Optional[float]:
    a = answers.get(key)
    if isinstance(a, dict) and isinstance(a.get("noul"), (int, float)):
        return float(a["noul"])
    return None


def _aspect_question(aspect: str, fields: dict[str, str]) -> tuple[str, str, list[dict[str, str]]]:
    label = {"population": "population", "intervention": "intervention / index test"}[aspect]
    text = f"Does this study match the eligible {label}: \"{fields[aspect]}\"?"
    options = [
        {"value": "yes", "label": "Yes, matches"},
        {"value": "no", "label": "No, does not match"},
        {"value": "partial", "label": "Partially matches"},
        {"value": "unsure", "label": "Unsure"},
    ]
    return f"{aspect}_match", text, options


def compose(
    stage: str,
    answers: dict[str, dict[str, Any]],
    fields: dict[str, str],
    exclusion_reasons: Optional[list[str]],
    abstract: str = "",
) -> dict[str, Any]:
    """Turn raw Jev answers into a screening result shaped like the existing LLM results."""
    inc_thr = float(settings.jev_include_threshold)
    exc_thr = float(settings.jev_exclude_threshold)
    band = float(settings.jev_clarify_band)
    if stage == "title":
        inc_thr = max(inc_thr, TITLE_INCLUDE_FLOOR)

    pop = _noul(answers, "population_match")
    inter = _noul(answers, "intervention_match")
    outc = _noul(answers, "outcome_reported")
    non_human = _noul(answers, "non_human_study")
    non_research = _noul(answers, "non_research_article")

    raw = {
        k: (v.get("noul") if v.get("type") == "noul" else v.get("choice"))
        for k, v in answers.items()
        if isinstance(v, dict)
    }
    decision, confidence, code, reason = "uncertain", 0.0, "", ""

    # Exclusion evidence, strongest first
    excl_candidates: list[tuple[float, str, str]] = []
    if non_human is not None:
        excl_candidates.append((non_human, "non_human_study", "Non-human / non-clinical study"))
    if non_research is not None:
        excl_candidates.append((non_research, "non_research_article", "Not a research report"))
    if pop is not None:
        excl_candidates.append((1 - pop, "population_mismatch", "Population does not match"))
    if inter is not None:
        excl_candidates.append((1 - inter, "intervention_mismatch", "Intervention/index test does not match"))
    excl_candidates.sort(key=lambda t: t[0], reverse=True)

    include_scores = [s for s in (pop, inter) if s is not None]
    include_conf = min(include_scores) if include_scores else 0.0

    if excl_candidates and excl_candidates[0][0] >= exc_thr:
        p, code, why = excl_candidates[0]
        decision, confidence = "exclude", round(p, 3)
        reason = f"{why} (P={p:.2f})"
        chosen = (answers.get("exclusion_reason") or {}).get("choice")
        if exclusion_reasons and chosen and chosen != NO_REASON:
            lookup = {_slug(r): r for r in exclusion_reasons}
            if chosen in lookup:
                code, reason = chosen, f"{lookup[chosen]}; {reason}"
    elif include_scores and include_conf >= inc_thr:
        decision, confidence = "include", round(include_conf, 3)
        reason = "Matches eligibility: " + ", ".join(
            f"{n} P={v:.2f}" for n, v in (("population", pop), ("intervention", inter)) if v is not None
        )
    else:
        best_excl = excl_candidates[0][0] if excl_candidates else 0.0
        confidence = round(max(include_conf, best_excl), 3)
        reason = "Insufficient certainty: " + ", ".join(
            f"{n} P={v:.2f}" for n, v in (("population", pop), ("intervention", inter), ("outcome", outc)) if v is not None
        )

    result: dict[str, Any] = {
        "recommendation": {"include": "included", "exclude": "excluded"}.get(decision, "uncertain"),
        "decision": decision,
        "confidence": confidence,
        "reason_code": code,
        "reason_text": reason,
        "reason": reason,
        "rationale": reason,
        "evidence_quote": "",
        "quotes": [],
        "include_keywords": [],
        "exclude_keywords": [],
        "matched_keywords": [],
        "needs_clarification": False,
        "engine": "jev",
        "jev_answers": raw,
    }

    # Clarify only genuinely ambiguous PICO aspects, and only when text beyond the title exists
    if decision == "uncertain" and stage != "title":
        ambiguous = [
            (abs(p - 0.5), a) for a, p in (("population", pop), ("intervention", inter))
            if p is not None and abs(p - 0.5) <= band
        ]
        if ambiguous:
            _, aspect = min(ambiguous)
            qtype, qtext, opts = _aspect_question(aspect, fields)
            result.update(
                needs_clarification=True,
                clarification_type=qtype,
                clarification_question=qtext,
                clarification_options=opts,
                clarification_aspect=aspect,
                clarification_context=abstract[:250],
            )
    return result


def screen(
    stage: str,
    title: str = "",
    abstract: str = "",
    full_text: str = "",
    pico: Optional[dict[str, Any]] = None,
    exclusion_reasons: Optional[list[str]] = None,
    search_string: Optional[str] = None,
    fast_mode: bool = False,
) -> Optional[dict[str, Any]]:
    """Screen one study with Jev/Laya. stage is "title", "abstract" or "fulltext".

    Includes:
    - Tier-1 Deterministic Search String Filter (instant microsecond drop if criteria unmet)
    - Tier-2 Focused PICO Abstract Laya ONNX Inference (Population + Intervention)
    """
    if not jev_client.is_jev_enabled():
        return None
    try:
        return _screen(stage, title, abstract, full_text, pico, exclusion_reasons, search_string, fast_mode)
    except Exception:  # never let Jev break the caller; the LLM path takes over
        logger.exception("Jev screening raised unexpectedly")
        return None


def _labels(exclusion_reasons: Optional[list[Any]]) -> list[str]:
    """Project exclusion reasons arrive as strings or {"label": ...} dicts depending on the caller."""
    out: list[str] = []
    for r in exclusion_reasons or []:
        label = r.get("label") if isinstance(r, dict) else r
        if isinstance(label, str) and label.strip():
            out.append(label.strip())
    return out


def _screen(
    stage, title, abstract, full_text, pico, exclusion_reasons, search_string=None, fast_mode=False
) -> Optional[dict[str, Any]]:
    title, abstract = (title or "").strip(), (abstract or "").strip()

    # ── Tier 1: Deterministic Boolean Search String Filter ──
    if search_string and (title or abstract):
        matched, reason_str = match_search_string(f"{title} {abstract}", search_string)
        if not matched:
            return {
                "recommendation": "excluded",
                "decision": "exclude",
                "confidence": 0.99,
                "reason_code": "SEARCH_STRING_EXCLUSION",
                "reason_text": f"Search string filter excluded abstract: {reason_str}",
                "reason": f"Search string filter excluded abstract: {reason_str}",
                "rationale": reason_str,
                "evidence_quote": "",
                "quotes": [],
                "include_keywords": [],
                "exclude_keywords": [],
                "matched_keywords": [],
                "needs_clarification": False,
                "engine": "search_string_tier1",
                "jev_answers": {"search_string_match": False},
            }

    # ── Tier 2: Focused PICO Abstract Laya ONNX Inference ──
    exclusion_reasons = _labels(exclusion_reasons)
    fields = _pico_fields(pico)
    if not (fields["population"] or fields["intervention"]):
        return None  # nothing to judge against; let the existing path handle it

    if stage == "fulltext":
        if not (full_text or abstract or title):
            return None
    elif not (title or abstract):
        return None

    state = build_state(stage, title, abstract, full_text or "", fields, fast_mode=fast_mode)
    questions = build_questions(stage, fields, exclusion_reasons, fast_mode=fast_mode)
    try:
        answers = jev_client.ask(state, questions)
    except JevError as e:
        logger.warning("Jev screening failed (%s stage): %s", stage, e)
        return None
    try:
        return compose(stage, answers, fields, exclusion_reasons, abstract)
    except Exception:  # never let a composition bug break screening
        logger.exception("Jev answer composition failed")
        return None


def screen_batch(
    studies: list[dict[str, Any]],
    pico: Optional[dict[str, Any]] = None,
    search_string: Optional[str] = None,
    exclusion_reasons: Optional[list[str]] = None,
    stage: str = "abstract",
    fast_mode: bool = True,
) -> list[dict[str, Any]]:
    """Screen a batch of studies in parallel with Tier-1 Boolean filtering and Tier-2 batched Laya ONNX inference."""
    if not studies:
        return []

    fields = _pico_fields(pico)
    labels = _labels(exclusion_reasons)
    results: list[dict[str, Any]] = [{}] * len(studies)

    to_infer_indices = []
    to_infer_requests = []

    for idx, study in enumerate(studies):
        title = (study.get("title") or "").strip()
        abstract = (study.get("abstract") or "").strip()
        full_text = (study.get("full_text") or "").strip()
        study_id = str(study.get("study_id") or f"study_{idx}")

        # Tier-1 Search String Evaluation
        if search_string and (title or abstract):
            matched, reason_str = match_search_string(f"{title} {abstract}", search_string)
            if not matched:
                results[idx] = {
                    "study_id": study_id,
                    "recommendation": "excluded",
                    "decision": "exclude",
                    "confidence": 0.99,
                    "reason_code": "SEARCH_STRING_EXCLUSION",
                    "reason_text": f"Search string filter excluded abstract: {reason_str}",
                    "reason": f"Search string filter excluded abstract: {reason_str}",
                    "rationale": reason_str,
                    "evidence_quote": "",
                    "quotes": [],
                    "include_keywords": [],
                    "exclude_keywords": [],
                    "matched_keywords": [],
                    "needs_clarification": False,
                    "engine": "search_string_tier1",
                    "jev_answers": {"search_string_match": False},
                }
                continue

        if not (fields["population"] or fields["intervention"]):
            continue

        state = build_state(stage, title, abstract, full_text, fields, fast_mode=fast_mode)
        questions = build_questions(stage, fields, labels, fast_mode=fast_mode)

        to_infer_indices.append(idx)
        to_infer_requests.append((study_id, state, questions))

    if to_infer_requests and jev_client.is_jev_enabled():
        try:
            batch_answers = jev_client.ask_batch(to_infer_requests)
            for idx, (study_id, state, questions) in zip(to_infer_indices, to_infer_requests):
                answers = batch_answers.get(study_id, {})
                study = studies[idx]
                abstract = study.get("abstract") or ""
                res = compose(stage, answers, fields, labels, abstract)
                res["study_id"] = study_id
                results[idx] = res
        except Exception as e:
            logger.warning("Batch inference fallback to sequential: %s", e)
            for idx in to_infer_indices:
                study = studies[idx]
                results[idx] = screen(
                    stage,
                    title=study.get("title", ""),
                    abstract=study.get("abstract", ""),
                    full_text=study.get("full_text", ""),
                    pico=pico,
                    exclusion_reasons=exclusion_reasons,
                    search_string=search_string,
                    fast_mode=fast_mode,
                ) or {}

    return results


def to_clarification_shape(res: dict[str, Any]) -> dict[str, Any]:
    """Adapt a Jev result to the dict shape returned by clarification_generator.screen_with_clarification."""
    base = {
        "recommendation": res["recommendation"],
        "confidence": res["confidence"],
        "reason_text": res["reason_text"],
        "reason_code": res["reason_code"],
        "evidence_quote": "",
        "quotes": [],
        "engine": "jev",
    }
    if res.get("needs_clarification"):
        base.update(
            recommendation="needs_clarification",
            reason_code="NEEDS_CLARIFICATION",
            clarification={
                "question_type": res["clarification_type"],
                "pico_aspect": res["clarification_aspect"],
                "question_text": res["clarification_question"],
                "context_excerpt": res.get("clarification_context", ""),
                "options": res["clarification_options"],
                "interim_decision": "uncertain",
                "interim_reason": res["reason_text"],
            },
        )
    return base


def jev_gate(extract, adapt=None):
    """Decorator that lets Jev handle a screening entry point without changing its behaviour when off.

    ``extract(bound_args)`` returns ``(stage, kwargs_for_screen)`` or ``None`` to skip Jev for that call.
    Mode "off" (the default) calls the wrapped function directly. Mode "on" returns the Jev result and
    falls back to the wrapped function if Jev is unavailable or fails. Mode "shadow" returns the wrapped
    function's result and only logs how Jev would have decided.
    """
    import functools
    import inspect

    def deco(fn):
        sig = inspect.signature(fn)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if jev_client.jev_mode() == "off":
                return fn(*args, **kwargs)
            try:
                bound = sig.bind(*args, **kwargs)
                bound.apply_defaults()
                spec = extract(bound.arguments)
            except Exception:
                logger.exception("Jev gate could not read arguments; using LLM path")
                return fn(*args, **kwargs)
            if spec is None or not jev_client.is_jev_enabled():
                return fn(*args, **kwargs)
            stage, jev_kwargs = spec
            if jev_client.jev_mode() == "on":
                res = screen(stage, **jev_kwargs)
                if res is not None:
                    return adapt(res) if adapt else res
                return fn(*args, **kwargs)
            # shadow
            baseline = fn(*args, **kwargs)
            try:
                res = screen(stage, **jev_kwargs)
                if res is not None:
                    logger.info(
                        "JEV_SHADOW stage=%s llm=%s/%.2f jev=%s/%.2f code=%s",
                        stage,
                        baseline.get("decision") or baseline.get("recommendation"),
                        float(baseline.get("confidence", 0.0)),
                        res["decision"], res["confidence"], res.get("reason_code"),
                    )
            except Exception:
                logger.exception("Jev shadow run failed")
            return baseline

        return wrapper

    return deco
