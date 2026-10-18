"""Variable auto-generation service: generate extraction variables strictly grounded
in the project's research question + hypothesis + PICO.

Uses an LLM to design a coding form that would let a reviewer test THIS hypothesis
from primary studies. Section names and variables are derived dynamically from the
research question / hypothesis / PICO — no domain content is hardcoded.

Each generated variable carries an `extraction_prompt`: a complete per-variable
extraction instruction (column-header-as-prompt pattern) used by the coded
extraction service.

Falls back to a PICO-token-derived deterministic schema if the LLM is unavailable.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any, Callable, Dict, List, Optional

from services.llm_extractor import is_llm_available
from services.tool_calling_client import ToolCallingClient

logger = logging.getLogger("radextract.variables")

_SYSTEM_PROMPT = "You are a systematic review methodologist designing data extraction forms."


def generate_variables_from_picos(
    pico_dict: dict,
    hypothesis_text: str = "",
    research_question: str = "",
    use_llm: bool = True,
    model_fn: Optional[Callable[..., Any]] = None,
) -> list[dict]:
    """Generate extraction variables specifically tailored to test the project's
    hypothesis and PICO.

    Args:
        pico_dict: dict with keys population, index_test, comparator, outcome, study_design
        hypothesis_text: the research hypothesis text
        research_question: the project's research question
        use_llm: if True and LLM is available, generates hypothesis-grounded variables via LLM
        model_fn: Optional custom model function or callable(prompt, **kwargs) -> dict

    Returns:
        List of variable dicts:
        [{section, name, field_type, allowed_values, range_min, range_max,
          description, extraction_prompt, order_index}, ...]
    """
    population = pico_dict.get("population", "")
    index_test = pico_dict.get("index_test", pico_dict.get("intervention", ""))
    comparator = pico_dict.get("comparator", "")
    outcome = pico_dict.get("outcome", "")
    study_design = pico_dict.get("study_design", "")

    prompt = f"""You are a systematic review methodologist designing a data extraction form.

Research Question: {research_question}
Hypothesis: {hypothesis_text}
PICO:
- Population: {population}
- Intervention / Index Test: {index_test}
- Comparator: {comparator}
- Outcome: {outcome}
- Study Design: {study_design}

Design a coding form that would let a reviewer test THIS hypothesis from primary studies.

Rules:
1. Invent 4-6 section names that fit THIS review (e.g. Study_Metadata, Population,
   Index_Test_Details, Comparator_Details, Outcomes, Analysis) — do not reuse generic
   names unless they fit.
2. Generate 15-25 variables total, distributed across your sections.
3. Every variable must be answerable from a typical included study AND relevant to
   the hypothesis or PICO — no filler demographics unless the hypothesis needs them.
4. For each variable provide: section, name (snake_case), field_type
   (free_text | int | float | dropdown | boolean), allowed_values (for dropdown,
   semicolon-separated), description (one-sentence extraction rule a human coder
   could follow), and extraction_prompt (a complete instruction: what to find,
   preferred source e.g. 'Table 1', format, unit conversions, and what to do if
   not reported).
5. Include at minimum: study_design, sample_size, and one variable per PICO outcome.

Return JSON: {{"variables": [{{"section": ..., "name": ..., "field_type": ...,
"allowed_values": ..., "description": ..., "extraction_prompt": ...}}, ...]}}"""

    # 1. Custom model_fn provided (e.g. for testing / injected engines)
    if model_fn is not None:
        try:
            raw = model_fn(prompt, system_prompt=_SYSTEM_PROMPT)
            vars_found = _extract_var_list(raw)
            if vars_found:
                return _format_variable_dicts(vars_found)
        except Exception as e:
            logger.warning(f"Custom model_fn execution failed in variable generator: {e}")

    # 2. Try ToolCallingClient if LLM is enabled
    elif use_llm and is_llm_available() and (hypothesis_text or research_question or population or outcome):
        try:
            client = ToolCallingClient()
            result = client.call_with_tool(
                tool_name="generate_variables",
                prompt=prompt,
                system_prompt=_SYSTEM_PROMPT,
            )
            if result and "variables" in result and isinstance(result["variables"], list):
                formatted = _format_variable_dicts(result["variables"])
                if formatted:
                    logger.info(f"Generated {len(formatted)} hypothesis-tailored variables via ToolCallingClient")
                    return formatted
        except Exception as e:
            logger.warning(f"LLM variable generation error, falling back to heuristic: {e}")

    # 3. Heuristic Fallback
    return _generate_heuristic_variables(pico_dict, hypothesis_text, research_question)


def _extract_var_list(raw: Any) -> list[dict]:
    """Extract list of variable definitions from arbitrary dict or list structure."""
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ["variables", "fields", "items", "data"]:
            if key in raw and isinstance(raw[key], list):
                return [x for x in raw[key] if isinstance(x, dict)]
        if "name" in raw:
            return [raw]
    return []


def _format_variable_dicts(var_list: list[dict]) -> list[dict]:
    """Normalize variable definitions into standard platform format.

    Section names are dynamic (hypothesis-driven): order_index is assigned by
    first-seen section order, 100 apart, so sections sort stably.
    """
    variables = []
    section_order: Dict[str, int] = {}

    for i, v in enumerate(var_list):
        sec = str(v.get("section") or v.get("sheet") or v.get("category") or "").strip()
        if not sec:
            sec = "General"
        sec = re.sub(r"[^a-zA-Z0-9_ ]", "", sec).strip().replace(" ", "_") or "General"
        if sec not in section_order:
            section_order[sec] = len(section_order) * 100

        f_type = str(v.get("field_type") or v.get("type") or "free_text").lower().strip()
        if f_type in ("integer", "int"):
            f_type = "int"
        elif f_type in ("float", "number", "numeric"):
            f_type = "float"
        elif f_type in ("categorical", "enum", "select", "dropdown"):
            f_type = "enum"
        elif f_type in ("boolean", "bool"):
            f_type = "bool"
        elif f_type in ("percentage", "percent"):
            f_type = "percent"
        else:
            f_type = "free_text"

        allowed = v.get("allowed_values", "")
        if isinstance(allowed, list):
            allowed = "; ".join(str(x) for x in allowed)

        name_clean = re.sub(r"[^a-zA-Z0-9_]", "_", str(v.get("name") or v.get("prompt") or "").strip().lower())
        name_clean = re.sub(r"_+", "_", name_clean).strip("_")
        if not name_clean:
            continue

        description = str(v.get("description") or v.get("why") or "")
        extraction_prompt = str(v.get("extraction_prompt") or "").strip()
        if not extraction_prompt:
            # Column-header-as-prompt fallback: name + description IS the prompt
            extraction_prompt = _default_extraction_prompt(name_clean, description, f_type)

        variables.append({
            "section": sec,
            "name": name_clean,
            "field_type": f_type,
            "allowed_values": str(allowed) if allowed else "",
            "range_min": v.get("range_min"),
            "range_max": v.get("range_max"),
            "description": description,
            "extraction_prompt": extraction_prompt,
            "order_index": section_order[sec] + i + 1,
            "is_base": False,
        })

    return variables


def _default_extraction_prompt(name: str, description: str, field_type: str) -> str:
    """Build a per-variable extraction prompt from its name + description
    (column-header-as-prompt rule)."""
    readable = name.replace("_", " ").strip()
    parts = [f"Extract: {readable}."]
    if description:
        parts.append(description.rstrip(".") + ".")
    fmt = {
        "int": "Return a single integer.",
        "float": "Return a single numeric value.",
        "percent": "Return a numeric percentage (0-100).",
        "enum": "Return exactly one of the allowed values.",
        "bool": "Return Yes or No.",
    }.get(field_type, "Return the value as reported.")
    parts.append(fmt)
    parts.append("If not reported anywhere in the full text, tables, or supplement, return NOT_FOUND.")
    return " ".join(parts)


def _tokenize(*texts: str) -> list[str]:
    """Extract meaningful lowercase tokens from text for heuristic naming."""
    stop = {
        "the", "a", "an", "and", "or", "of", "in", "on", "for", "with", "to",
        "by", "vs", "versus", "is", "are", "was", "were", "be", "been", "at",
        "from", "that", "this", "these", "those", "patients", "study", "studies",
    }
    tokens: list[str] = []
    for t in texts:
        for tok in re.findall(r"[a-zA-Z][a-zA-Z0-9-]+", (t or "").lower()):
            if tok not in stop and len(tok) > 2 and tok not in tokens:
                tokens.append(tok)
    return tokens


def _generate_heuristic_variables(pico_dict: dict, hypothesis_text: str,
                                  research_question: str = "") -> list[dict]:
    """PICO-token-derived fallback variables (no domain hardcoding).

    Section and variable names are built from the actual PICO / hypothesis
    vocabulary so the form reflects the review topic even without an LLM.
    """
    population = pico_dict.get("population", "")
    index_test = pico_dict.get("index_test", pico_dict.get("intervention", ""))
    comparator = pico_dict.get("comparator", "")
    outcome = pico_dict.get("outcome", "")
    study_design = pico_dict.get("study_design", "")

    pop_tokens = _tokenize(population)
    idx_tokens = _tokenize(index_test)
    cmp_tokens = _tokenize(comparator)
    out_tokens = _tokenize(outcome)

    def _name(prefix: str, tokens: list[str], fallback: str) -> str:
        base = "_".join(tokens[:2]) if tokens else fallback
        return re.sub(r"_+", "_", f"{prefix}_{base}".lower()).strip("_")

    fields: list[dict] = []

    def add(section: str, name: str, field_type: str, description: str,
            allowed: str = "", order: int = 0):
        fields.append({
            "section": section,
            "name": name,
            "field_type": field_type,
            "allowed_values": allowed,
            "range_min": None,
            "range_max": None,
            "description": description,
            "extraction_prompt": _default_extraction_prompt(name, description, field_type),
            "order_index": order,
            "is_base": False,
        })

    # Study metadata
    add("Study_Metadata", "study_design", "free_text",
        "Study design as reported by the authors", order=1)
    add("Study_Metadata", "sample_size", "int",
        "Total number of participants enrolled", order=2)
    add("Study_Metadata", "follow_up_duration", "free_text",
        "Length of follow-up with units as reported", order=3)

    # Population (derived from PICO population tokens)
    pop_label = " ".join(pop_tokens[:3]) if pop_tokens else "the study population"
    add("Population", _name("population", pop_tokens, "characteristics"), "free_text",
        f"Key characteristics of the population ({pop_label})", order=101)
    add("Population", "mean_age", "float", "Mean or median participant age in years", order=102)
    add("Population", "male_percentage", "percent", "Percentage of male participants", order=103)

    # Intervention / index test (derived from index test tokens)
    idx_label = " ".join(idx_tokens[:3]) if idx_tokens else "the intervention / index test"
    add("Intervention_Details", _name("intervention", idx_tokens, "details"), "free_text",
        f"How the intervention/index test was delivered ({idx_label})", order=201)

    # Comparator (only when a comparator exists)
    if comparator.strip():
        cmp_label = " ".join(cmp_tokens[:3])
        add("Comparator_Details", _name("comparator", cmp_tokens, "details"), "free_text",
            f"How the comparator was delivered ({cmp_label})", order=301)

    # Outcomes (one variable per outcome token group)
    out_label = " ".join(out_tokens[:3]) if out_tokens else "the primary outcome"
    add("Outcomes", _name("outcome", out_tokens, "primary_result"), "free_text",
        f"Result for the primary outcome ({out_label})", order=401)
    add("Outcomes", "effect_estimate", "float",
        "Primary effect size estimate (OR, RR, HR, MD, or accuracy measure)", order=402)
    add("Outcomes", "confidence_interval", "free_text",
        "95% confidence interval as reported (lower-upper)", order=403)
    add("Outcomes", "p_value", "float", "Statistical significance p-value", order=404)
    add("Outcomes", "supports_hypothesis", "enum",
        "Whether findings support the central research hypothesis",
        allowed="Yes; No; Partially; Unclear", order=450)

    return fields
