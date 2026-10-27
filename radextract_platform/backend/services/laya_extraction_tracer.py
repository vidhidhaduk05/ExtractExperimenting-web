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

from services.jev_client import ask, is_jev_enabled

logger = logging.getLogger(__name__)
MAX_VERIFICATION_CHARS = 350


def _page_number(page: dict) -> Optional[int]:
    """Return a supplied positive page number, never a guessed location."""
    value = page.get("page_number")
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if number > 0 and str(value).strip() == str(number) else None


def _locate_quote(quote: str, pdf_data: dict, full_text: str) -> Tuple[bool, Optional[int]]:
    """Check the complete quote, allowing whitespace changes only."""
    normalized = " ".join(quote.split())
    if not normalized:
        return False, None
    matches: List[Optional[int]] = [
        _page_number(page) for page in pdf_data.get("pages") or []
        if normalized in " ".join((page.get("text") or "").split())
    ]
    # Also check tables for the quote
    for tbl in pdf_data.get("tables") or []:
        if not isinstance(tbl, dict):
            continue
        tpnum = _page_number(tbl)
        tbl_text = tbl.get("caption") or tbl.get("text") or ""
        rows = tbl.get("rows") or []
        row_texts = [" ".join(str(c) for c in r) if isinstance(r, (list, tuple)) else str(r) for r in rows]
        all_tbl = " ".join([str(tbl_text)] + row_texts)
        if normalized in " ".join(all_tbl.split()):
            matches.append(tpnum)

    if matches:
        # Repeated excerpts cannot establish one unique page.
        valid_matches = [m for m in matches if m is not None]
        return True, valid_matches[0] if len(valid_matches) == 1 else None
    return normalized in " ".join(full_text.split()), None


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


def _extract_page_sentences(pdf_data: dict, full_text: str = "") -> List[Tuple[Optional[int], str]]:
    """Return a list of (page_number, sentence) pairs across the document and tables."""
    items: List[Tuple[Optional[int], str]] = []
    pages = pdf_data.get("pages") or []
    if pages:
        for p in pages:
            pnum = _page_number(p)
            ptext = p.get("text", "") or ""
            for sent in _split_into_sentences(ptext):
                items.append((pnum, sent))
    elif full_text:
        for sent in _split_into_sentences(full_text):
            items.append((None, sent))

    # Feed table cell / row text into the candidate sentence index (A7)
    tables = pdf_data.get("tables") or []
    for tbl in tables:
        if not isinstance(tbl, dict):
            continue
        tpnum = _page_number(tbl)
        rows = tbl.get("rows") or []
        for row in rows:
            if isinstance(row, (list, tuple)):
                row_str = " | ".join(str(cell).strip() for cell in row if str(cell).strip())
                if 12 <= len(row_str) <= MAX_VERIFICATION_CHARS:
                    items.append((tpnum, row_str))
            elif isinstance(row, dict):
                row_str = " | ".join(f"{k}: {v}" for k, v in row.items() if str(v).strip())
                if 12 <= len(row_str) <= MAX_VERIFICATION_CHARS:
                    items.append((tpnum, row_str))
        tbl_text = tbl.get("caption") or tbl.get("text") or ""
        if tbl_text:
            for sent in _split_into_sentences(str(tbl_text)):
                items.append((tpnum, sent))

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

    candidates: List[Tuple[Optional[int], str, int]] = []
    for pnum, sent in page_sentences:
        # Do not certify an entire sentence after showing only a prefix to the model.
        if len(sent) > MAX_VERIFICATION_CHARS:
            continue
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
    has_warned = False
    for idx, (pnum, sent, _) in enumerate(top_candidates):
        try:
            q_single = {f"c_{idx}": questions[f"c_{idx}"]}
            res = ask(state=sent, questions=q_single)
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
            if not has_warned:
                logger.warning(f"[LayaTracer] Verification error on candidate {idx}: {e}")
                has_warned = True

    return best_result


def trace_all_extractions(
    extractions: List[Dict[str, Any]],
    pdf_data: dict,
    full_text: str = "",
) -> List[Dict[str, Any]]:
    """Run Laya tracing across a batch of extraction records.

    Updates or annotates existing extractions with verified quotes,
    pages, and Laya confidence scores. Annotates tracing_status:
    "verified" | "unverified" | "failed" | "disabled".
    """
    enabled = is_jev_enabled()
    has_warned = False

    for item in extractions:
        # A previous run is not proof that this value/source is verified now.
        item["laya_verified"] = False
        item["laya_confidence"] = 0.0
        item["tracing_status"] = "disabled" if not enabled else "unverified"

        if not enabled:
            continue
        val = str(item.get("value", "")).strip()
        if not val or val in ("-99", "-77", "-88"):
            continue

        var_name = item.get("name") or item.get("variable_name") or ""
        if not var_name:
            continue

        # Semantic agreement is useful only after independent source membership.
        existing_quote = item.get("source_text") or ""
        located = False
        source_page = None
        if existing_quote:
            located, source_page = _locate_quote(existing_quote, pdf_data, full_text)
            if located:
                item["source_page"] = source_page
            else:
                # Quote cannot be found verbatim in the document
                item["source_page"] = None
                item["laya_verified"] = False
                item["laya_confidence"] = 0.0
                item["tracing_status"] = "unverified"
                if not existing_quote.startswith("[UNVERIFIED QUOTE]"):
                    item["confidence_tag"] = "[UNVERIFIED QUOTE]"

        if located and 15 < len(existing_quote) <= MAX_VERIFICATION_CHARS:
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
                res = ask(state=existing_quote, questions=q)
                noul_val = res.get("verify", {}).get("noul", 0.0)
                is_ver = bool(noul_val >= 0.50)
                item["laya_verified"] = is_ver
                item["laya_confidence"] = round(float(noul_val), 4)
                item["tracing_status"] = "verified" if is_ver else "unverified"
                continue
            except Exception as e:
                item["tracing_status"] = "failed"
                if not has_warned:
                    logger.warning(f"[LayaTracer] Verification error on existing quote: {e}")
                    has_warned = True

        # Otherwise trace from document text
        try:
            traced = trace_variable_evidence(var_name, val, pdf_data, full_text)
            if traced and traced.get("verified"):
                item["source_text"] = traced["source_text"]
                item["source_page"] = traced["source_page"]
                item["laya_confidence"] = traced["confidence"]
                item["laya_verified"] = True
                item["tracing_status"] = "verified"
                # Upgrade tag to [DS] if strongly verified
                if traced["confidence"] >= 0.70:
                    item["confidence_tag"] = "[DS]"
            else:
                item["tracing_status"] = "unverified"
        except Exception as e:
            item["tracing_status"] = "failed"
            if not has_warned:
                logger.warning(f"[LayaTracer] Document text tracing failed: {e}")
                has_warned = True

    return extractions
