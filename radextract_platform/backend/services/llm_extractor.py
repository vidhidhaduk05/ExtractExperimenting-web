"""
AIDE-Web Enhanced LLM Extraction Service for RadExtract.
Incorporates:
1. Field Aliasing & Resilient JSON normalizers (prompt, response, source, page).
2. Verbatim Quote extraction with Page Number cross-referencing.
3. Fallback extraction modes (Docling layout + Raw Multimodal PDF).
4. Multi-retry exponential backoff and schema validation.
"""

import json
import logging
import re
import httpx
from typing import Any, Dict, List, Optional

from config import settings
from services.json_utils import parse_json_from_text
from services.tool_calling_client import ToolCallingClient
from services.laya_screener import jev_gate

logger = logging.getLogger("aide_extractor")

SYSTEM_PROMPT = """You are a specialized clinical research data extraction assistant for systematic reviews and meta-analyses.
Extract structured data from the provided document accurately.
Rules:
1. Extract concise, direct values.
2. For every extracted value, provide a direct verbatim quote from the text as supporting evidence.
3. State the exact page number (1-indexed) where the quote appears.
4. If a field is not present in the document, set response to "Not found", source to "Not found", and page to "N/A".
5. For every extracted value, assign a confidence tag:
   - [DS] if directly stated verbatim in table or text
   - [INF] if inferred from context
   - [CALC] if calculated from other values (show calculation in source)
   - [SUP: eTable X] if from supplementary material
   - [FIG] if approximated from a figure
   - [PDF-p.N: "quote"] if from a specific PDF page"""

FIELD_ALIASES = {
    "prompt": ["prompt", "question", "field", "label", "name", "item", "variable", "variable_name"],
    "response": ["response", "answer", "result", "value", "extracted_value", "extraction", "text", "content", "output"],
    "source": ["source", "evidence", "supporting_source", "supporting_evidence", "supporting_text", "quote", "quotes", "citation", "rationale"],
    "page": ["page", "pages", "page_number", "pageNumber", "page_num", "location"],
    "confidence_tag": ["confidence_tag", "tag", "confidenceTag", "evidence_tag", "method"]
}


def _normalize_extracted_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Resolves field aliases into standardized AIDE-Web {prompt, response, source, page, confidence_tag} structure."""
    normalized = {"prompt": "", "response": "Not found", "source": "Not found", "page": "1", "confidence_tag": ""}
    
    for std_key, aliases in FIELD_ALIASES.items():
        for k, v in item.items():
            if k.lower() in aliases and v is not None:
                normalized[std_key] = str(v).strip()
                break

    # Clean quotes and not found tokens
    if normalized["response"].lower() in ["none", "null", "n/a", "not mentioned", "not found", "unknown"]:
        normalized["response"] = ""
    if normalized["source"].lower() in ["none", "null", "n/a", "not mentioned", "not found", "unknown"]:
        normalized["source"] = ""

    return normalized


def _clean_json_response(raw_text: str) -> Optional[List[Dict[str, Any]]]:
    """Finds balanced JSON snippets or arrays within LLM output text using json_utils."""
    if not raw_text:
        return None

    parsed = parse_json_from_text(raw_text)
    if parsed is None:
        return None

    if isinstance(parsed, list):
        return [_normalize_extracted_item(x) for x in parsed if isinstance(x, dict)]
    if isinstance(parsed, dict):
        for arr_key in ["responses", "results", "answers", "extractions", "items", "data", "variables"]:
            if arr_key in parsed and isinstance(parsed[arr_key], list):
                return [_normalize_extracted_item(x) for x in parsed[arr_key] if isinstance(x, dict)]
        return [_normalize_extracted_item(parsed)]

    return None




def extract_variables_with_aide_engine(
    study_text: str,
    variables: List[Dict[str, Any]],
    api_url: Optional[str] = None,
    api_key: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Runs AIDE-Web style high-precision structured data extraction over document text."""
    if not variables or not study_text:
        return []

    # Build structured variable prompts with guidance
    var_prompts = []
    for idx, v in enumerate(variables):
        name = v.get("name", f"Var_{idx+1}")
        desc = v.get("description", "")
        ftype = v.get("field_type", "text")
        opts = v.get("allowed_values", "")
        prompt_line = f"{idx+1}. {name} (Type: {ftype})"
        if desc:
            prompt_line += f" - Description: {desc}"
        if opts:
            prompt_line += f" [Allowed Values: {opts}]"
        var_prompts.append(prompt_line)

    prompt_text = f"""Document Content:
{study_text[:28000]}

For each coding form field below, extract:
- "prompt": the exact variable name
- "response": concise value extracted from the document
- "source": verbatim supporting quote directly from the document
- "page": page number (integer) where the evidence was found

Coding form fields:
{chr(10).join(var_prompts)}

Return JSON only in this exact shape:
{{
  "responses": [
    {{
      "prompt": "variable_name",
      "response": "extracted value",
      "source": "verbatim sentence quote from text",
      "page": "1"
    }}
  ]
}}"""

    client = ToolCallingClient(api_url=api_url, api_key=api_key)
    result = client.call_with_tool(
        tool_name="extract_variables",
        prompt=prompt_text,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.1,
        max_tokens=4096,
    )

    if not result:
        logger.warning("Could not extract variables from LLM response, returning empty.")
        return []

    extracted_items = result.get("responses", [])
    if not extracted_items:
        return []

    # Map extracted items back to original variables
    results = []
    for v in variables:
        v_name = v.get("name", "").lower()
        matched_item = None
        for item in extracted_items:
            p_name = item.get("prompt", "").lower()
            if p_name == v_name or v_name in p_name or p_name in v_name:
                matched_item = item
                break

        if matched_item and matched_item.get("response") and matched_item["response"].lower() != "not found":
            try:
                p_num = int(re.search(r"\d+", str(matched_item.get("page", "1"))).group(0))
            except Exception:
                p_num = 1

            source = matched_item.get("source", "")
            tag = matched_item.get("confidence_tag", "")
            if not tag:
                if source and source != "Not found" and len(source) > 5:
                    tag = f"[PDF-p.{p_num}: \"{source[:40]}...\"]" if p_num > 1 else "[DS]"
                else:
                    tag = "[INF]"

            results.append({
                "variable_id": v.get("variable_id"),
                "name": v.get("name"),
                "value": matched_item["response"],
                "source_text": source,
                "source_page": p_num,
                "confidence": 0.95 if source and source != "Not found" else 0.70,
                "confidence_tag": tag,
            })

    return results


def is_llm_available() -> bool:
    """Checks if local Gemini Web2API / LLM gateway is reachable."""
    try:
        with httpx.Client(timeout=2) as client:
            resp = client.get(
                settings.llm_models_url,
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            )
            return resp.status_code == 200
    except Exception:
        return False

# Backward compatibility alias
extract_variables_with_llm = extract_variables_with_aide_engine


def _eligibility_block(
    pico_criteria: Optional[Dict[str, Any]],
    exclusion_reasons: Optional[List[str]] = None,
    inclusion_criteria: Optional[List[str]] = None,
) -> str:
    """Render eligibility text. Only listed exclusions may exclude a study."""
    pico_criteria = pico_criteria or {}
    inclusion = list(inclusion_criteria or [])
    extra = pico_criteria.get("inclusion_criteria") or pico_criteria.get("inclusion") or []
    if isinstance(extra, str):
        extra = [extra]
    for item in extra:
        if item and item not in inclusion:
            inclusion.append(str(item))
    lines = [
        "PICO Eligibility Criteria:",
        f"Population: {pico_criteria.get('population', 'Patients with relevant clinical conditions')}",
        f"Intervention: {pico_criteria.get('intervention', pico_criteria.get('index_test', 'See the protocol. Do not invent an intervention criterion.'))}",
        f"Comparator: {pico_criteria.get('comparator', 'See the protocol contrasts.')}",
        f"Outcome: {pico_criteria.get('outcomes', pico_criteria.get('outcome', 'See the protocol outcomes.'))}",
    ]
    if inclusion:
        lines.append("Inclusion Criteria:\n- " + "\n- ".join(str(item) for item in inclusion))
    if exclusion_reasons:
        lines.append("Exclusion Criteria:\n- " + "\n- ".join(str(item) for item in exclusion_reasons))
    lines.append(
        "Apply only the exclusion criteria listed above. "
        "Do not exclude a study because it is a case report, a case series, or written in a "
        "language other than English unless an exclusion criterion says so. "
        "If the inclusion criteria allow case reports or all languages, those studies stay eligible."
    )
    return "\n".join(lines)



# ── Optional Jev screening (settings.jev_mode; "off" leaves the LLM path untouched) ──

def _jev_args_title(a: Dict[str, Any]):
    return "title", {"title": a.get("title"), "pico": a.get("pico_criteria"), "exclusion_reasons": a.get("exclusion_reasons")}


def _jev_args_abstract(a: Dict[str, Any]):
    return "abstract", {
        "title": a.get("title"), "abstract": a.get("abstract"),
        "pico": a.get("pico_criteria"), "exclusion_reasons": a.get("exclusion_reasons"),
    }


def _jev_args_fulltext(a: Dict[str, Any]):
    text = a.get("study_text") if a.get("study_text") is not None else a.get("text")
    if text is None:
        return None
    meta = a.get("study_metadata") or {}
    return "fulltext", {
        "title": meta.get("title", ""), "abstract": meta.get("abstract", ""), "full_text": text,
        "pico": a.get("pico_criteria") or a.get("pico"), "exclusion_reasons": a.get("exclusion_reasons"),
    }


@jev_gate(_jev_args_fulltext)
def screen_fulltext_with_llm(
    study_text: Optional[str] = None,
    pico_criteria: Optional[Dict[str, Any]] = None,
    exclusion_reasons: Optional[List[str]] = None,
    study_metadata: Optional[Dict[str, Any]] = None,
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    client: Optional[ToolCallingClient] = None,
    # Backward-compat aliases for callers that use different param names
    text: Optional[str] = None,
    pico: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Runs AI full-text screening against PICO eligibility criteria.

    Returns a dict with keys:
      - recommendation: "included" | "excluded" | "uncertain"
      - decision: same as recommendation but "include"/"exclude" (backward compat)
      - confidence: float 0-1
      - reason_code: short code for exclusion reason
      - reason_text: human-readable justification
      - reason: alias for reason_text (backward compat)
      - rationale: detailed explanation
      - evidence_quote: verbatim quote (backward compat)
      - quotes: list of verbatim quotes
    """
    # Handle backward-compat param aliases
    if study_text is None and text is not None:
        study_text = text
    if pico_criteria is None and pico is not None:
        pico_criteria = pico
    if pico_criteria is None:
        pico_criteria = {}
    if study_text is None:
        return {"recommendation": "uncertain", "confidence": 0.0, "reason_text": "No text provided"}

    eligibility = _eligibility_block(pico_criteria, exclusion_reasons)

    prompt = f"""{eligibility}

Study Full Text:
{study_text[:20000]}

Determine if this study should be INCLUDED or EXCLUDED based on the PICO framework and exclusion criteria.
Return JSON:
{{
  "decision": "include" | "exclude",
  "confidence": 0.95,
  "reason": "Clear justification matching PICO",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote supporting decision"
}}
"""
    if client is None:
        client = ToolCallingClient(api_url=api_url, api_key=api_key)
    raw = client.call_with_tool(
        tool_name="screen_fulltext",
        prompt=prompt,
        system_prompt="You are a clinical systematic review screening expert.",
        temperature=0.1,
        max_tokens=1024,
    )

    if not raw:
        return {
            "recommendation": "uncertain",
            "decision": "uncertain",
            "confidence": 0.0,
            "reason_code": "",
            "reason_text": "LLM screening failed",
            "reason": "LLM screening failed",
            "rationale": "LLM screening failed",
            "evidence_quote": "",
            "quotes": [],
        }

    # Normalize to the response format callers expect
    decision = raw.get("decision", "uncertain")
    recommendation = "included" if decision == "include" else ("excluded" if decision == "exclude" else "uncertain")
    reason_text = raw.get("reason", "")
    evidence = raw.get("evidence_quote", "")

    return {
        "recommendation": recommendation,
        "decision": decision,  # backward compat
        "confidence": float(raw.get("confidence", 0.0)),
        "reason_code": raw.get("reason_code", ""),
        "reason_text": reason_text,
        "reason": reason_text,  # backward compat
        "rationale": reason_text,
        "evidence_quote": evidence,  # backward compat
        "quotes": [evidence] if evidence else [],
    }


@jev_gate(_jev_args_title)
def screen_title_only_with_llm(
    title: str,
    pico_criteria: Optional[Dict[str, Any]] = None,
    exclusion_reasons: Optional[List[str]] = None,
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    client: Optional[ToolCallingClient] = None,
) -> Dict[str, Any]:
    """Runs AI title-only screening against PICO eligibility criteria.

    Returns dict with recommendation, decision, confidence, reason_code, reason_text, matched_keywords.
    """
    if pico_criteria is None:
        pico_criteria = {}

    title = (title or "").strip()
    if not title:
        return {
            "recommendation": "uncertain",
            "decision": "uncertain",
            "confidence": 0.0,
            "reason_code": "NO_TITLE",
            "reason_text": "No title provided for screening",
            "reason": "No title provided for screening",
            "matched_keywords": [],
        }

    eligibility = _eligibility_block(pico_criteria, exclusion_reasons)

    prompt = f"""{eligibility}

Study Title: {title}

Based on the TITLE ONLY, determine if this study should be:
- "include": Title clearly matches the eligibility criteria, including an eligible case report
- "exclude": Title clearly matches one of the listed exclusion criteria
- "uncertain": Cannot determine from title alone — needs abstract review

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.95,
  "reason": "Brief justification",
  "reason_code": "short_snake_case_code_or_empty",
  "matched_keywords": ["keyword1", "keyword2"]
}}
"""
    if client is None:
        client = ToolCallingClient(api_url=api_url, api_key=api_key)

    raw = client.call_with_tool(
        tool_name="screen_title_only",
        prompt=prompt,
        system_prompt="You are a clinical systematic review screening expert evaluating study titles.",
        temperature=0.1,
        max_tokens=1024,
    )

    if not raw:
        return {
            "recommendation": "uncertain",
            "decision": "uncertain",
            "confidence": 0.0,
            "reason_code": "LLM_FAIL",
            "reason_text": "LLM title screening failed",
            "reason": "LLM title screening failed",
            "matched_keywords": [],
        }

    decision = str(raw.get("decision", "uncertain")).lower().strip()
    if decision in ("include", "included"):
        recommendation = "included"
        decision_clean = "include"
    elif decision in ("exclude", "excluded"):
        recommendation = "excluded"
        decision_clean = "exclude"
    else:
        recommendation = "uncertain"
        decision_clean = "uncertain"

    reason_text = raw.get("reason", "")
    confidence = float(raw.get("confidence", 0.0))
    matched_kws = raw.get("matched_keywords", [])
    if isinstance(matched_kws, str):
        matched_kws = [matched_kws]

    return {
        "recommendation": recommendation,
        "decision": decision_clean,
        "confidence": confidence,
        "reason_code": raw.get("reason_code", ""),
        "reason_text": reason_text,
        "reason": reason_text,
        "matched_keywords": matched_kws,
    }


@jev_gate(_jev_args_abstract)
def screen_title_abstract_with_llm(
    title: str,
    abstract: str,
    pico_criteria: Optional[Dict[str, Any]] = None,
    exclusion_reasons: Optional[List[str]] = None,
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    client: Optional[ToolCallingClient] = None,
) -> Dict[str, Any]:
    """Run AI title/abstract screening against PICO eligibility criteria.

    Enhanced to return keywords, PICO spans, and clarification questions if uncertain.
    """
    if pico_criteria is None:
        pico_criteria = {}

    title = (title or "").strip()
    abstract = (abstract or "").strip()

    if not title and not abstract:
        return {
            "recommendation": "uncertain",
            "decision": "uncertain",
            "confidence": 0.0,
            "reason_code": "NO_TEXT",
            "reason_text": "No text provided for title/abstract screening",
            "reason": "No text provided for title/abstract screening",
            "quotes": [],
            "pico_spans": [],
            "include_keywords": [],
            "exclude_keywords": [],
            "needs_clarification": False,
        }

    eligibility = _eligibility_block(pico_criteria, exclusion_reasons)

    prompt = f"""{eligibility}

Study Title: {title}
Study Abstract: {abstract}

Evaluate this study's eligibility based on title AND abstract.
Also identify keywords relevant to inclusion or exclusion.
If uncertain about a specific aspect where a reviewer clarification question would resolve it, set needs_clarification=true and provide clarification question.

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.95,
  "reason": "Clear justification matching PICO",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote supporting decision",
  "include_keywords": ["term1", "term2"],
  "exclude_keywords": ["term1", "term2"],
  "needs_clarification": false,
  "clarification_type": "study_design" | "population_match" | "intervention_match" | "outcome_match" | null,
  "clarification_question": "Question text if needs_clarification is true",
  "clarification_options": [{{"label": "Option A", "value": "a"}}, {{"label": "Option B", "value": "b"}}]
}}
"""
    if client is None:
        client = ToolCallingClient(api_url=api_url, api_key=api_key)

    raw = client.call_with_tool(
        tool_name="screen_title_abstract",
        prompt=prompt,
        system_prompt="You are a clinical systematic review screening expert evaluating abstracts.",
        temperature=0.1,
        max_tokens=2048,
    )

    if not raw:
        return {
            "recommendation": "uncertain",
            "decision": "uncertain",
            "confidence": 0.0,
            "reason_code": "LLM_FAIL",
            "reason_text": "LLM screening failed",
            "reason": "LLM screening failed",
            "rationale": "LLM screening failed",
            "evidence_quote": "",
            "quotes": [],
            "include_keywords": [],
            "exclude_keywords": [],
            "needs_clarification": False,
        }

    decision = str(raw.get("decision", "uncertain")).lower().strip()
    if decision in ("include", "included"):
        recommendation = "included"
        decision_clean = "include"
    elif decision in ("exclude", "excluded"):
        recommendation = "excluded"
        decision_clean = "exclude"
    else:
        recommendation = "uncertain"
        decision_clean = "uncertain"

    reason_text = raw.get("reason", raw.get("reason_text", ""))
    evidence = raw.get("evidence_quote", "")
    include_kws = raw.get("include_keywords", [])
    if isinstance(include_kws, str):
        include_kws = [include_kws]
    exclude_kws = raw.get("exclude_keywords", [])
    if isinstance(exclude_kws, str):
        exclude_kws = [exclude_kws]

    needs_clar = bool(raw.get("needs_clarification", False))
    clar_q = raw.get("clarification_question", "")
    clar_opts = raw.get("clarification_options", [])
    clar_type = raw.get("clarification_type", "study_design")

    return {
        "recommendation": recommendation,
        "decision": decision_clean,
        "confidence": float(raw.get("confidence", 0.0)),
        "reason_code": raw.get("reason_code", ""),
        "reason_text": reason_text,
        "reason": reason_text,
        "rationale": reason_text,
        "evidence_quote": evidence,
        "quotes": [evidence] if evidence else [],
        "include_keywords": include_kws,
        "exclude_keywords": exclude_kws,
        "needs_clarification": needs_clar,
        "clarification_type": clar_type,
        "clarification_question": clar_q,
        "clarification_options": clar_opts,
    }

