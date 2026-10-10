"""Laya-powered extraction evidence tracer.

Modeled after choxos/jev-reviewer and TypeSafe System One verification:
Given extracted variables and document text (pages/tables/sentences),
this service uses local Laya (or remote Jev if configured) to:
1. Locate the exact candidate sentence containing verbatim evidence for a variable.
2. Verify with high-precision calibrated probability (Noul) whether the candidate
   sentence directly and accurately states the extracted value.
3. Bind the extraction to an exact verbatim source_text quote, source_page number,
   and calibrated verification confidence score.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from radextract_platform.backend.services.jev_client import ask, is_jev_enabled

logger = logging.getLogger(__name__)


def _split_into_sentences(text: str) -> List[str]:
    """Split text into reasonable sentence chunks for tracing."""
    if not text:
        return []
    # Split on sentence boundaries while preserving content
    raw = re.split(r"(?<=[.!?])\s+", text)
    sentences = []
    for s in raw:
        s_clean = s.strip()
        # Keep non-empty sentences with informative length
        if len(s_clean) >= 12:
            sentences.append(s_clean)
    return sentences


def _extract_page_sentences(pdf_data: dict, full_text: str = "") -> List[Tuple[int, str]]:
    """Return a list of (page_number, sentence) pairs across the document."""
    items: List[Tuple[int, str]] = []
    pages = pdf_data.get("pages") or []
    if pages:
        for p in pages:
            pnum = int(p.get("page_number", 1))
            ptext = p.get("text", "") or ""
            for sent in _split_into_sentences(ptext):
                items.append((pnum, sent))
    elif full_text:
        for sent in _split_into_sentences(full_text):
            items.append((1, sent))
    return items


def trace_variable_evidence(
    var_name: str,
    extracted_value: str,
    pdf_data: dict,
    full_text: str = "",
    min_confidence: float = 0.50,
) -> Optional[Dict[str, Any]]:
    """Trace and verify verbatim evidence for an extracted variable using Laya.

    Returns:
        dict with:
            source_text: exact verbatim sentence from the document
            source_page: page number where the sentence occurs
            confidence: Laya verification score (0.0 to 1.0)
            verified: bool (whether Laya confirmed the evidence)
        or None if no candidate sentence could be verified.
    """
    if not is_jev_enabled():
        return None

    val_str = str(extracted_value).strip()
    if not val_str or val_str in ("-99", "-77", "-88", "not reported", "n/a", "none"):
        return None

    # Find candidates that match variable keywords or numbers
    page_sentences = _extract_page_sentences(pdf_data, full_text)
    if not page_sentences:
        return None

    var_tokens = [t.lower() for t in re.split(r"[\s_]+", var_name) if len(t) > 2]
    val_tokens = [t.lower() for t in re.split(r"[\s,%\(\)]+", val_str) if t]

    candidates: List[Tuple[int, str, int]] = []
    for pnum, sent in page_sentences:
        s_lower = sent.lower()
        # Score candidate based on presence of value tokens and variable tokens
        val_matches = sum(1 for v in val_tokens if v in s_lower)
        var_matches = sum(1 for v in var_tokens if v in s_lower)
        score = (val_matches * 3) + var_matches
        if score > 0:
            candidates.append((pnum, sent, score))

    if not candidates:
        return None

    # Sort candidates by match score and take top 5
    candidates.sort(key=lambda x: x[2], reverse=True)
    top_candidates = candidates[:5]

    # Use Laya Noul question to verify candidates
    questions: Dict[str, Dict[str, Any]] = {}
    for idx, (pnum, sent, _) in enumerate(top_candidates):
        qid = f"c_{idx}"
        # Truncate sentence to fit Laya context limit if needed
        clean_sent = sent[:350]
        questions[qid] = {
            "type": "noul",
            "instructions": f"Does this excerpt state {var_name.replace('_', ' ')}: {val_str}?",
            "criteria": {
                "false": f"No, does not state {var_name}",
                "true": f"Yes, states {var_name}",
            },
        }

    best_result: Optional[Dict[str, Any]] = None
    best_prob = 0.0

    # Test top candidates with Laya System-1
    for idx, (pnum, sent, _) in enumerate(top_candidates):
        try:
            q_single = {f"c_{idx}": questions[f"c_{idx}"]}
            res = ask(state=sent[:350], questions=q_single)
            noul_val = res.get(f"c_{idx}", {}).get("noul", 0.0)
            if noul_val > best_prob:
                best_prob = noul_val
                best_result = {
                    "source_text": sent,
                    "source_page": pnum,
                    "confidence": round(float(noul_val), 4),
                    "verified": bool(noul_val >= min_confidence),
                }
        except Exception as e:
            logger.debug(f"[LayaTracer] Verification error on candidate {idx}: {e}")

    return best_result


def trace_all_extractions(
    extractions: List[Dict[str, Any]],
    pdf_data: dict,
    full_text: str = "",
) -> List[Dict[str, Any]]:
    """Run Laya tracing across a batch of extraction records.

    Updates or annotates existing extractions with verified quotes,
    pages, and Laya confidence scores.
    """
    if not is_jev_enabled():
        return extractions

    for item in extractions:
        val = str(item.get("value", "")).strip()
        if not val or val in ("-99", "-77", "-88"):
            continue

        var_name = item.get("name") or item.get("variable_name") or ""
        if not var_name:
            continue

        # If already has verbatim quote and page, run a quick Laya confirmation
        existing_quote = item.get("source_text") or ""
        if existing_quote and len(existing_quote) > 15 and not existing_quote.startswith("[MISSING"):
            try:
                q = {
                    "verify": {
                        "type": "noul",
                        "instructions": f"Does this excerpt state {var_name.replace('_', ' ')}: {val}?",
                        "criteria": {
                            "false": f"No, does not state {var_name}",
                            "true": f"Yes, states {var_name}",
                        },
                    }
                }
                res = ask(state=existing_quote[:350], questions=q)
                noul_val = res.get("verify", {}).get("noul", 0.0)
                item["laya_verified"] = bool(noul_val >= 0.50)
                item["laya_confidence"] = round(float(noul_val), 4)
                continue
            except Exception:
                pass

        # Otherwise trace from document text
        traced = trace_variable_evidence(var_name, val, pdf_data, full_text)
        if traced and traced.get("verified"):
            item["source_text"] = traced["source_text"]
            item["source_page"] = traced["source_page"]
            item["laya_confidence"] = traced["confidence"]
            item["laya_verified"] = True
            # Upgrade tag to [DS] if strongly verified
            if traced["confidence"] >= 0.70:
                item["confidence_tag"] = "[DS]"

    return extractions
