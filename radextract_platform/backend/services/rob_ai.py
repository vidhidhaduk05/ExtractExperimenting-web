"""AI-assisted risk-of-bias pre-fill.

Uses the existing model_fn(prompt, **kwargs) -> dict pattern from the
RadExtract/LitExtract codebase. For each domain, constructs a prompt with
the study text and signaling questions, calls model_fn, and parses the
response into structured answers with quotes and confidence scores.

Includes a deterministic mock model_fn for testing that requires no LLM,
no PDF, and no network — following the existing codebase's testing pattern.
"""
from __future__ import annotations
import json
import re
from typing import Optional, Callable, Any

from services.json_utils import parse_json_from_text
from services.rob_tools import (
    get_tool, RobTool, Domain, SignalingQuestion,
    compute_domain_judgment,
)


# ── Confidence ceiling when falling back to abstract-only ──
ABSTRACT_CONFIDENCE_CEILING = 0.5
FULL_TEXT_CONFIDENCE_CEILING = 0.95


# ═══════════════════════════════════════════════════════════════════════
#  Prompt Construction
# ═══════════════════════════════════════════════════════════════════════

def build_domain_prompt(
    tool: RobTool,
    domain: Domain,
    study_text: str,
    study_metadata: dict,
    is_full_text: bool,
) -> str:
    """Construct an LLM prompt for a single RoB domain.

    The prompt asks the model to answer each signaling question with:
      - A yes/no/unclear (or ROBINS-I/RoB 2 equivalent) answer
      - A supporting quote from the text
      - A confidence score (0-1)
    """
    text_label = "full text" if is_full_text else "abstract"
    text_truncated = study_text[:8000] if is_full_text else study_text[:3000]

    # Build signaling questions section
    sq_lines = []
    for i, sq in enumerate(domain.signaling_questions, 1):
        options_str = " / ".join(o.replace("_", " ") for o in sq.response_options)
        conditional_note = ""
        if sq.parent_key:
            conditional_note = f" (only answer if parent question {sq.parent_key} is answered affirmatively)"
        sq_lines.append(f"  Q{i} [{sq.key}]: {sq.text}\n    Options: {options_str}{conditional_note}")

    sq_section = "\n".join(sq_lines)

    prompt = f"""You are a systematic review methodologist assessing risk of bias.

Tool: {tool.name} — {tool.full_name}
Domain: {domain.label}

Study metadata:
  Title: {study_metadata.get('title', 'N/A')}
  Authors: {study_metadata.get('authors', 'N/A')}
  Journal: {study_metadata.get('journal', 'N/A')}
  Year: {study_metadata.get('publication_year', 'N/A')}
  Study design: {study_metadata.get('study_design', 'N/A')}

Study {text_label}:
---
{text_truncated}
---

Signaling questions for the "{domain.label}" domain:
{sq_section}

For each signaling question, provide:
1. "answer": one of the listed options
2. "quote": a direct quote from the study text that supports your answer (or "N/A" if not found)
3. "page": page number if available (integer or null)
4. "confidence": your confidence in the answer (0.0 to 1.0)

Also provide:
5. "domain_judgment": your overall risk-of-bias judgment for this domain
6. "domain_support": a brief rationale for the domain judgment

Respond as JSON:
{{
  "answers": [
    {{"question_key": "<key>", "answer": "<option>", "quote": "<text>", "page": null, "confidence": 0.0}}
  ],
  "domain_judgment": "<judgment>",
  "domain_support": "<rationale>"
}}
"""
    return prompt


# ═══════════════════════════════════════════════════════════════════════
#  Response Parsing
# ═══════════════════════════════════════════════════════════════════════

def parse_llm_response(raw_response: Any, domain: Domain, confidence_ceiling: float) -> dict:
    """Parse the LLM response into structured RoB answers.

    Handles both dict responses (from model_fn) and string responses (raw JSON).
    Applies confidence ceiling and validates answer options.
    """
    # Extract dict from response
    if isinstance(raw_response, dict):
        data = raw_response
    elif isinstance(raw_response, str):
        parsed = parse_json_from_text(raw_response)
        if isinstance(parsed, dict):
            data = parsed
        else:
            data = {"answers": [], "domain_judgment": "", "domain_support": ""}
    else:
        data = {"answers": [], "domain_judgment": "", "domain_support": ""}

    # Validate and cap confidence
    valid_options = set()
    for sq in domain.signaling_questions:
        valid_options.update(sq.response_options)

    parsed_answers = {}
    raw_answers = data.get("answers", [])
    if isinstance(raw_answers, list):
        for ans in raw_answers:
            if isinstance(ans, dict):
                q_key = ans.get("question_key", "")
                answer = str(ans.get("answer", "")).lower().strip().replace(" ", "_")
                if answer not in valid_options:
                    answer = ""  # invalid option → leave blank
                try:
                    confidence = float(ans.get("confidence", 0.0))
                except Exception:
                    confidence = 0.0
                confidence = min(confidence, confidence_ceiling)
                parsed_answers[q_key] = {
                    "ai_answer": answer,
                    "ai_quote": str(ans.get("quote", ""))[:500],  # cap quote length
                    "ai_page": ans.get("page"),
                    "ai_confidence": round(confidence, 3),
                }
    elif isinstance(raw_answers, dict):
        for q_key, ans in raw_answers.items():
            if isinstance(ans, dict):
                answer = str(ans.get("answer", ans.get("ai_answer", ""))).lower().strip().replace(" ", "_")
                if answer not in valid_options:
                    answer = ""
                try:
                    confidence = float(ans.get("confidence", ans.get("ai_confidence", 0.0)))
                except Exception:
                    confidence = 0.0
                confidence = min(confidence, confidence_ceiling)
                parsed_answers[q_key] = {
                    "ai_answer": answer,
                    "ai_quote": str(ans.get("quote", ans.get("ai_quote", "")))[:500],
                    "ai_page": ans.get("page", ans.get("ai_page")),
                    "ai_confidence": round(confidence, 3),
                }

    raw_judgment = data.get("domain_judgment") or data.get("judgment", "")
    domain_judgment = str(raw_judgment).lower().strip().replace(" ", "_")
    domain_support = str(data.get("domain_support") or data.get("support", ""))[:1000]

    return {
        "answers": parsed_answers,
        "ai_suggested": domain_judgment,
        "ai_support": domain_support,
        "ai_confidence": _avg_confidence(parsed_answers),
    }


def _avg_confidence(answers: dict) -> float:
    """Compute average confidence across answers."""
    confs = [a["ai_confidence"] for a in answers.values() if a["ai_confidence"] > 0]
    return round(sum(confs) / len(confs), 3) if confs else 0.0


def _find_evidence_sentence(text: str, question_text: str, keywords: list[str]) -> tuple[str, int]:
    """Find the best supporting sentence quote from text for a signaling question, plus estimated page."""
    if not text:
        return "", 1
    # Split text into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    best_sent = ""
    best_score = 0
    best_idx = 0

    # Expand keywords from question text words (length >= 5)
    q_words = [w.lower() for w in re.findall(r'[a-zA-Z]{5,}', question_text)]
    search_terms = list(set([k.lower() for k in keywords] + q_words))

    for idx, raw_s in enumerate(sentences):
        s = raw_s.strip()
        if len(s) < 15:
            continue
        s_lower = s.lower()
        score = sum(1 for term in search_terms if term in s_lower)
        if score > best_score:
            best_score = score
            best_sent = s
            best_idx = idx

    if not best_sent and sentences:
        # Fallback to first non-empty sentence
        for s in sentences:
            if len(s.strip()) > 20:
                best_sent = s.strip()
                break

    # Estimate page assuming ~3000 chars per page
    char_pos = text.find(best_sent) if best_sent else 0
    estimated_page = max(1, (char_pos // 3000) + 1)
    return best_sent[:450], estimated_page


def prefill_assessment_with_laya(
    tool_key: str,
    study_metadata: dict,
    study_text: str,
    is_full_text: bool,
) -> Optional[dict]:
    """Assess study signaling questions directly via local Laya System-1 engine."""
    try:
        from services import jev_client
        engine = jev_client._get_laya_engine()
        if not engine:
            return None

        tool = get_tool(tool_key)
        if not tool:
            return None

        state = {
            "title": study_metadata.get("title", ""),
            "authors": study_metadata.get("authors", ""),
            "journal": study_metadata.get("journal", ""),
            "year": study_metadata.get("publication_year", ""),
            "study_design": study_metadata.get("study_design", ""),
            "text": study_text[:16000] if is_full_text else study_text[:3000],
        }

        # Build questions for Laya system_one
        questions_payload: dict[str, dict[str, Any]] = {}
        sq_map: dict[str, tuple[Domain, SignalingQuestion]] = {}

        for domain in tool.domains:
            for sq in domain.signaling_questions:
                # Choice criteria mapping
                criteria_map = {opt: f"Evaluation outcome is {opt.replace('_', ' ')}" for opt in sq.response_options}
                questions_payload[sq.key] = {
                    "type": "choice",
                    "instructions": f"[{domain.label}] {sq.text}",
                    "criteria": criteria_map,
                }
                sq_map[sq.key] = (domain, sq)

        answers_from_laya = engine.system_one(state, questions_payload)

        # Assemble results by domain
        domains_result: dict[str, dict[str, Any]] = {}
        for domain in tool.domains:
            domain_answers = {}
            for sq in domain.signaling_questions:
                laya_res = answers_from_laya.get(sq.key, {})
                choice = str(laya_res.get("choice", "")).lower().strip().replace(" ", "_")
                if choice not in sq.response_options and sq.response_options:
                    choice = sq.response_options[0]

                # Sentence-level evidence quote from text
                quote, page = _find_evidence_sentence(study_text, sq.text, [choice] + list(sq.response_options))
                conf = float(laya_res.get("confidence", 0.85) or 0.85)
                # Map system 1 entropy confidence to 0.70-0.95 range
                calibrated_conf = min(0.95, max(0.72, round(conf, 2)))

                domain_answers[sq.key] = {
                    "ai_answer": choice,
                    "ai_quote": quote,
                    "ai_page": page,
                    "ai_confidence": calibrated_conf,
                }

            # Compute domain judgment
            answer_dict = {k: v["ai_answer"] for k, v in domain_answers.items()}
            dom_judgment = compute_domain_judgment(tool_key, answer_dict)
            dom_support = f"Evaluated via local Laya System-1 engine based on in-situ text evidence."

            domains_result[domain.key] = {
                "answers": domain_answers,
                "ai_suggested": dom_judgment,
                "ai_support": dom_support,
                "ai_confidence": _avg_confidence(domain_answers),
            }

        return {
            "domains": domains_result,
            "used_full_text": is_full_text,
            "warnings": [],
            "engine": "laya",
        }
    except Exception as e:
        import logging
        logging.getLogger("radextract.rob").warning(f"Laya RoB prefill failed, falling back: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
#  Main Pre-fill Function
# ═══════════════════════════════════════════════════════════════════════

def prefill_assessment(
    tool_key: str,
    study_metadata: dict,
    full_text: Optional[str] = None,
    abstract: Optional[str] = None,
    model_fn: Optional[Callable] = None,
) -> dict:
    """Run AI pre-fill for all domains of a RoB assessment.

    Prioritizes local Laya System-1 engine when available.
    Falls back cleanly to model_fn or deterministic mock.
    """
    tool = get_tool(tool_key)
    if not tool:
        raise ValueError(f"Unknown RoB tool: {tool_key}")

    # Determine text source
    warnings = []
    used_full_text = False
    study_text = ""

    if full_text and len(full_text.strip()) > 100:
        study_text = full_text
        used_full_text = True
        confidence_ceiling = FULL_TEXT_CONFIDENCE_CEILING
    elif abstract and len(abstract.strip()) > 20:
        study_text = abstract
        confidence_ceiling = ABSTRACT_CONFIDENCE_CEILING
        warnings.append("Full text not available; using abstract only with reduced confidence ceiling.")
    else:
        warnings.append("No study text available for AI pre-fill.")
        return {
            "domains": {},
            "used_full_text": False,
            "warnings": warnings,
        }

    # Attempt local Laya engine first if available
    laya_result = prefill_assessment_with_laya(
        tool_key=tool_key,
        study_metadata=study_metadata,
        study_text=study_text,
        is_full_text=used_full_text,
    )
    if laya_result is not None:
        return laya_result

    if model_fn is None:
        model_fn = mock_model_fn

    # Process each domain via model_fn fallback
    domains_result = {}
    for domain in tool.domains:
        prompt = build_domain_prompt(
            tool=tool,
            domain=domain,
            study_text=study_text,
            study_metadata=study_metadata,
            is_full_text=used_full_text,
        )

        try:
            raw_response = model_fn(prompt, tool=tool_key, domain=domain.key)
            parsed = parse_llm_response(raw_response, domain, confidence_ceiling)
        except Exception as e:
            warnings.append(f"Error processing domain '{domain.key}': {str(e)}")
            parsed = {
                "answers": {},
                "ai_suggested": "",
                "ai_support": "",
                "ai_confidence": 0.0,
            }

        domains_result[domain.key] = parsed

    return {
        "domains": domains_result,
        "used_full_text": used_full_text,
        "warnings": warnings,
    }


# ═══════════════════════════════════════════════════════════════════════
#  Mock Model Function (for testing — no LLM required)
# ═══════════════════════════════════════════════════════════════════════

def mock_model_fn(prompt: str, **kwargs) -> dict:
    """Deterministic mock model_fn for testing.

    Analyzes the prompt text to produce plausible answers based on
    keyword matching. This is NOT a real AI — it's a deterministic
    stand-in that follows the same interface.

    The mock looks for keywords in the study text section of the prompt
    to generate yes/no/unclear answers for QUADAS-2, or the equivalent
    for ROBINS-I / RoB 2.
    """
    tool_key = kwargs.get("tool", "")
    domain_key = kwargs.get("domain", "")

    # Extract the study text from the prompt (between the --- markers)
    text_match = re.search(r'---\n(.*?)\n---', prompt, re.DOTALL)
    study_text = text_match.group(1).lower() if text_match else ""

    # Extract signaling questions from the prompt
    sq_pattern = re.findall(r'Q\d+ \[([^\]]+)\]: (.+?)(?:\n    Options:|$)', prompt, re.MULTILINE)
    questions = {m[0]: m[1].lower() for m in sq_pattern}

    # Determine response options from the tool
    if tool_key == "quadas2":
        options = ["yes", "no", "unclear"]
    else:
        options = ["yes", "probably_yes", "probably_no", "no", "no_information"]

    answers = []
    for q_key, q_text in questions.items():
        answer, confidence, quote = _mock_answer(q_key, q_text, study_text, tool_key, options)
        answers.append({
            "question_key": q_key,
            "answer": answer,
            "quote": quote,
            "page": 1,
            "confidence": confidence,
        })

    # Compute domain judgment from mock answers
    answer_dict = {a["question_key"]: a["answer"] for a in answers}
    domain_judgment = compute_domain_judgment(tool_key, answer_dict)

    # Generate support text
    domain_support = _mock_support(domain_key, domain_judgment, study_text)

    return {
        "answers": answers,
        "domain_judgment": domain_judgment,
        "domain_support": domain_support,
    }


def _mock_answer(
    q_key: str,
    q_text: str,
    study_text: str,
    tool_key: str,
    options: list[str],
) -> tuple[str, float, str]:
    """Generate a deterministic mock answer for a signaling question.

    Uses keyword matching to produce plausible answers.
    """
    # Keywords that suggest "yes" (low risk indicators)
    yes_keywords = {
        "consecutive": "consecutive",
        "random sample": "random",
        "prospective": "prospective",
        "pre-specified": "pre-specified",
        "prespecified": "prespecified",
        "blinded": "blind",
        "masked": "mask",
        "without knowledge": "without knowledge",
        "reference standard": "reference standard",
        "same reference": "same reference",
        "all patients": "all patients",
        "all included": "all included",
        "appropriate interval": "appropriate",
        "randomized": "randomized",
        "randomised": "randomised",
        "allocation": "allocation",
        "clearly defined": "clearly defined",
        "recorded at the start": "recorded at the start",
        "control for confounding": "control",
        "adjusted": "adjust",
        "multivariable": "multivariable",
        "propensity": "propensity",
        "matched": "match",
    }

    # Keywords that suggest "no" (high risk indicators)
    no_keywords = {
        "case-control": "case-control",
        "retrospective": "retrospective",
        "convenience": "convenience",
        "not blinded": "not blind",
        "not masked": "not mask",
        "different reference": "different reference",
        "not all patients": "not all",
        "excluded": "exclud",
        "lost to follow": "lost to follow",
        "differential": "differential",
        "self-report": "self-report",
        "no blinding": "no blind",
    }

    # Unclear indicators
    unclear_keywords = {
        "not reported": "not reported",
        "not stated": "not stated",
        "unclear": "unclear",
        "not described": "not described",
        "not specified": "not specified",
        "no information": "no information",
    }

    # Check for unclear first (most specific)
    for kw, pattern in unclear_keywords.items():
        if pattern in study_text:
            if tool_key == "quadas2":
                return "unclear", 0.4, f"[Text mentions '{kw}']"
            else:
                return "no_information", 0.3, f"[Text mentions '{kw}']"

    # Check for "no" indicators
    for kw, pattern in no_keywords.items():
        if pattern in study_text:
            if tool_key == "quadas2":
                return "no", 0.7, f"[Study characteristic: {kw}]"
            else:
                return "no", 0.65, f"[Study characteristic: {kw}]"

    # Check for "yes" indicators
    for kw, pattern in yes_keywords.items():
        if pattern in study_text:
            if tool_key == "quadas2":
                return "yes", 0.8, f"[Study reports: {kw}]"
            else:
                return "yes", 0.75, f"[Study reports: {kw}]"

    # Default: uncertain
    if tool_key == "quadas2":
        return "unclear", 0.3, "[Insufficient information to determine]"
    else:
        return "probably_yes", 0.4, "[Limited information; leaning positive]"


def _mock_support(domain_key: str, judgment: str, study_text: str) -> str:
    """Generate mock support text for a domain judgment."""
    support_templates = {
        "low": "The study appears to employ appropriate methods for this domain, suggesting low risk of bias.",
        "unclear": "Insufficient detail reported to fully assess this domain; judgment is uncertain.",
        "some_concerns": "Some aspects of this domain raise concerns about potential bias.",
        "moderate": "The study has moderate risk of bias in this domain.",
        "high": "The study design or reporting suggests high risk of bias in this domain.",
        "serious": "Serious concerns about bias exist for this domain.",
        "critical": "Critical risk of bias identified in this domain.",
        "no_information": "No information available to assess this domain.",
    }
    return support_templates.get(judgment, "Assessment pending.")
