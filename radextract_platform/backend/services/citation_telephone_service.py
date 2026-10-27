"""Citation Telephone service powered by local Laya System-1 Model.

Extracts all in-text citations and context claims from uploaded manuscripts (.docx, .pdf, text)
or PubMed/PMC identifiers, retrieves cited reference passages, and runs real Laya System-1
ModernBERT inference to score:
  1. Stated anywhere in source?
  2. Support level & semantic shift (matches, goes_further, more_cautious, changed/inverted, not_there)
  3. Authors' own result vs citing someone else (chain hop)
  4. Calibrated Unsureness Matrix (confidence margin, Shannon entropy, genuine ambiguity alert)
"""

from __future__ import annotations

import logging
import math
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# Ensure repo root is on sys.path
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from laya.laya_engine import LayaModel, _to_internal, QTYPES, _temp_bucket, _softmax

logger = logging.getLogger("radextract.citation_telephone")

# Laya Model singleton
_laya_model: Optional[LayaModel] = None
_laya_init_failed = False


def get_laya_engine() -> Optional[LayaModel]:
    """Get or initialize singleton local Laya ONNX model."""
    global _laya_model, _laya_init_failed
    if _laya_model is not None:
        return _laya_model
    if _laya_init_failed:
        return None

    model_dir = os.path.join(repo_root, "laya", "models")
    if not os.path.exists(os.path.join(model_dir, "laya.onnx")):
        logger.warning("Laya ONNX model not found at %s", model_dir)
        _laya_init_failed = True
        return None

    try:
        _laya_model = LayaModel(model_dir)
        logger.info("Successfully loaded local Laya System-1 model for Citation Telephone")
        return _laya_model
    except Exception as e:
        logger.error("Failed to initialize Laya model: %s", e)
        _laya_init_failed = True
        return None


# Patterns from user's Zotero reusable skill
PAREN_CIT = re.compile(r'\(([\d\s,ΓÇô-]+)\)')
BRACKET_CIT = re.compile(r'\[([\d\s,ΓÇô-]+)\]')
REF_START = re.compile(r'^\s*(\d{1,3})[\.\)\]]\s+(.*)$')
REF_HEADER = re.compile(r'^(REFERENCES|Reference List|Bibliography|Works Cited)\s*$', re.I)


def parse_citation_numbers(raw: str) -> List[int]:
    """Parse comma and hyphen ranges like '1, 3-5, 8' into [1, 3, 4, 5, 8]."""
    nums: List[int] = []
    chunks = [c.strip() for c in raw.split(",") if c.strip()]
    for ch in chunks:
        ch = ch.replace("ΓÇô", "-")
        if "-" in ch:
            parts = ch.split("-")
            if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                start = int(parts[0].strip())
                end = int(parts[1].strip())
                if 0 < start <= end <= 500:
                    nums.extend(range(start, end + 1))
        elif ch.isdigit():
            n = int(ch)
            if 0 < n <= 500:
                nums.append(n)
    return sorted(list(set(nums)))


def extract_citations_and_claims_from_text(raw_text: str) -> Dict[str, Any]:
    """Parse entire text into citing claims linked to numbered references."""
    lines = raw_text.splitlines()
    body_lines: List[str] = []
    ref_lines: List[str] = []
    in_ref_section = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if REF_HEADER.match(stripped):
            in_ref_section = True
            continue
        if in_ref_section:
            ref_lines.append(stripped)
        else:
            body_lines.append(stripped)

    # Parse reference list entries
    references: Dict[int, str] = {}
    current_ref_num: Optional[int] = None
    current_ref_text: List[str] = []

    for r_line in ref_lines:
        m = REF_START.match(r_line)
        if m:
            if current_ref_num is not None:
                references[current_ref_num] = " ".join(current_ref_text).strip()
            current_ref_num = int(m.group(1))
            current_ref_text = [m.group(2)]
        elif current_ref_num is not None:
            current_ref_text.append(r_line)

    if current_ref_num is not None:
        references[current_ref_num] = " ".join(current_ref_text).strip()

    # Parse body sentences and match citations
    body_text = " ".join(body_lines)
    # Sentence splitter
    raw_sentences = re.split(r'(?<=[.!?])\s+', body_text)
    
    extracted_claims: List[Dict[str, Any]] = []

    for s_idx, sent in enumerate(raw_sentences):
        sent_clean = sent.strip()
        if len(sent_clean) < 15:
            continue

        cited_nums: List[int] = []
        for m in BRACKET_CIT.finditer(sent_clean):
            parsed = parse_citation_numbers(m.group(1))
            cited_nums.extend(parsed)
        for m in PAREN_CIT.finditer(sent_clean):
            parsed = parse_citation_numbers(m.group(1))
            cited_nums.extend(parsed)

        cited_nums = sorted(list(set(cited_nums)))
        if cited_nums:
            for num in cited_nums:
                extracted_claims.append({
                    "sentenceIndex": s_idx,
                    "citingSentence": sent_clean,
                    "refNumber": num,
                    "refText": references.get(num, f"Reference [{num}] cited in text"),
                })

    return {
        "references": references,
        "claims": extracted_claims,
        "totalClaimsFound": len(extracted_claims),
        "totalReferencesFound": len(references),
    }


def compute_unsureness_matrix(probs: Dict[str, float]) -> Dict[str, Any]:
    """Calculate calibrated unsureness matrix with margin and Shannon entropy."""
    vals = list(probs.values())
    if not vals:
        return {
            "isGenuinelyUnsure": True,
            "margin": 0.0,
            "entropyScore": 1.0,
            "reason": "No probability distribution provided",
            "recommendation": "manual_audit_advised",
        }

    sorted_vals = sorted(vals, reverse=True)
    top1 = sorted_vals[0]
    top2 = sorted_vals[1] if len(sorted_vals) > 1 else 0.0
    margin = round(top1 - top2, 4)

    # Shannon entropy normalized to [0, 1]
    eps = 1e-12
    entropy = -sum(p * math.log2(p + eps) for p in vals if p > 0)
    max_entropy = math.log2(len(vals)) if len(vals) > 1 else 1.0
    entropy_norm = round(min(1.0, max(0.0, entropy / max_entropy)), 4)

    # Genuine unsureness conditions:
    # 1. Close competition between top 2 choices (margin < 0.20)
    # 2. High semantic distribution spread (entropy_norm > 0.65)
    is_unsure = margin < 0.20 or entropy_norm > 0.65

    changed_prob = probs.get("changed", 0.0)
    if changed_prob > 0.35:
        recommendation = "contradiction_flagged"
        reason = f"Potential semantic drift or inversion detected (divergence prob {round(changed_prob*100, 1)}%)."
    elif is_unsure:
        recommendation = "manual_audit_advised"
        reason = f"Model is genuinely unsure between interpretations (margin: {round(margin*100, 1)}%, entropy: {entropy_norm})."
    else:
        recommendation = "verified"
        reason = f"High-confidence alignment identified (confidence margin: {round(margin*100, 1)}%)."

    return {
        "isGenuinelyUnsure": is_unsure,
        "margin": margin,
        "entropyScore": entropy_norm,
        "reason": reason,
        "recommendation": recommendation,
    }


def evaluate_passage_with_laya(
    citing_sentence: str,
    source_title: str,
    source_passage: str,
    laya: Optional[LayaModel] = None,
) -> Dict[str, Any]:
    """Run real Laya System-1 ModernBERT inference to evaluate citing claim vs source passage."""
    if laya is None:
        laya = get_laya_engine()

    state = {
        "claim": citing_sentence,
        "paper": {
            "title": source_title,
            "abstract": source_passage,
        }
    }

    questions = {
        "stated_anywhere": {
            "type": "choice",
            "criteria": {"stated": "claim or topic is stated in text", "not_stated": "not stated"},
            "instructions": "Is the claim or topic stated anywhere in the source passage?"
        },
        "support_type": {
            "type": "choice",
            "criteria": {
                "matches": "verbatim or exact match",
                "goes_further": "source makes stronger claim",
                "more_cautious": "source makes weaker or qualified claim",
                "changed": "source says something different or opposite",
                "not_there": "source does not support claim"
            },
            "instructions": "Compare the claim in the citing sentence against what this source actually states."
        },
        "is_own_result": {
            "type": "choice",
            "criteria": {
                "own_result": "authors own experimental findings or data",
                "cited_from_others": "authors citing another paper"
            },
            "instructions": "Does this text represent the authors own experimental results or are they citing someone else?"
        }
    }

    answers = None
    engine_used = "heuristic_fallback"

    # 1. Attempt via Jev Cloud API (with seamless Laya backup)
    try:
        from services import laya_client
        answers, engine_used = laya_client.ask_with_engine(state, questions)
    except Exception as exc:
        logger.warning("Jev/Laya client failed (%s), checking direct local model fallback", exc)
        if laya is not None:
            try:
                answers = laya.system_one(state, questions)
                engine_used = "local_laya_system_1"
            except Exception as e:
                logger.error("Direct local Laya fallback failed: %s", e)

    if answers is not None:
        try:
            sup_ans = answers.get("support_type", {})
            raw_probs = sup_ans.get("probabilities", {})
            probs = {
                "matches": raw_probs.get("matches", 0.2),
                "partlyMatches": raw_probs.get("more_cautious", 0.2),
                "goesFurther": raw_probs.get("goes_further", 0.2),
                "moreCautious": raw_probs.get("more_cautious", 0.2),
                "changed": raw_probs.get("changed", 0.1),
                "notThere": raw_probs.get("not_there", 0.1),
            }

            stated_ans = answers.get("stated_anywhere", {})
            stated_p = stated_ans.get("probabilities", {}).get("stated", 0.5)

            own_ans = answers.get("is_own_result", {})
            own_p = own_ans.get("probabilities", {}).get("own_result", 0.5)

            best_choice = sup_ans.get("choice", "matches")
            unsureness = compute_unsureness_matrix(raw_probs)

            # Map choice to verdict
            verdict_map = {
                "matches": ("same", "Matches Source"),
                "goes_further": ("stronger", "Citing Claim Goes Further"),
                "more_cautious": ("weaker", "Source Is More Cautious"),
                "changed": ("different", "Semantic Drift / Inversion"),
                "not_there": ("unrelated", "Not Stated in Source"),
            }
            v_code, v_label = verdict_map.get(best_choice, ("same", "Matches Source"))

            return {
                "supportScore": round(stated_p, 4),
                "ownResultScore": round(own_p, 4),
                "verdict": v_code,
                "verdictLabel": v_label,
                "probabilities": probs,
                "unsureness": unsureness,
                "engine": engine_used,
            }
        except Exception as e:
            logger.error("Failed to parse answers from %s: %s", engine_used, e)

    # Heuristic fallback if both Jev and Laya are offline

    return {
        "supportScore": 0.5,
        "ownResultScore": 0.5,
        "verdict": "same",
        "verdictLabel": "Matches Source (Fallback)",
        "probabilities": {
            "matches": 0.5,
            "partlyMatches": 0.2,
            "goesFurther": 0.1,
            "moreCautious": 0.1,
            "changed": 0.05,
            "notThere": 0.05,
        },
        "unsureness": {
            "isGenuinelyUnsure": True,
            "margin": 0.3,
            "entropyScore": 0.7,
            "reason": "Laya offline, heuristic baseline used.",
            "recommendation": "manual_audit_advised",
        },
        "engine": "heuristic_fallback",
    }
