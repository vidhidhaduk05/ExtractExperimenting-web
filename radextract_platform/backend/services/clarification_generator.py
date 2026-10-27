"""Clarification question generator service for mid-pipeline interactive clarification.

Detects when the AI screening pipeline encounters specific, identifiable ambiguities
(study design, partial population match, index test vs comparator, composite outcome)
and generates a structured multiple-choice question for the human reviewer.
"""
from __future__ import annotations

import json
from typing import Any, Optional
from services.llm_client import get_client, ToolCallingClient
from services.laya_screener import jev_gate, to_clarification_shape


def _jev_args(a: dict[str, Any]):
    if (a.get("stage") or "ta") != "ta":
        return None
    return "abstract", {
        "title": a.get("title"), "abstract": a.get("abstract"),
        "pico": a.get("pico_criteria"), "exclusion_reasons": a.get("exclusion_reasons"),
    }

CLARIFICATION_SCREENING_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention/Index Test: {intervention}
Comparator: {comparator}
Outcome: {outcome}
{exclusion_text}

Study to Screen:
Title: {title}
Abstract: {abstract}

Determine if this study should be INCLUDED or EXCLUDED based on the PICO framework.

If you can make a confident decision (include or exclude), return that decision.

If you are uncertain about a SPECIFIC aspect of this study, and a human's answer to a question
about that aspect would help you make a definitive decision, set "decision" to "needs_clarification"
and generate a multiple-choice question.

Only generate a question if ALL of these are true:
- You cannot confidently include or exclude based on the available text
- The uncertainty is about a SPECIFIC, identifiable aspect (not a general feeling)
- A human reviewer with expertise could resolve it by answering one question
- The question has clear, mutually exclusive answer options

Do NOT generate a question if:
- The abstract is too short or vague to formulate a specific question (just return "uncertain")
- You are uncertain about multiple aspects equally (pick the one most critical to the decision)
- The study clearly doesn't match the population (just exclude it)

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain" | "needs_clarification",
  "confidence": 0.0-1.0,
  "reason": "Clear justification",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote",
  "clarification": {{
    "question_type": "study_design" | "population_match" | "intervention_match" | "outcome_match",
    "pico_aspect": "population" | "index_test" | "comparator" | "outcome" | "study_design",
    "question_text": "The specific question to ask the human reviewer",
    "context_excerpt": "The relevant sentence(s) from the abstract that triggered the uncertainty",
    "options": [
      {{"value": "option_value", "label": "Human-readable option label"}},
      ...
    ],
    "interim_decision": "uncertain",
    "interim_reason": "Why the AI is uncertain - what specific information is missing"
  }}
}}

Question type guidelines:
- study_design: Use when the study design is ambiguous. Options: RCT, Cohort, Case-control, Cross-sectional, Case report, Systematic review, Other
- population_match: Use when the study population partially matches but isn't clearly in/out of scope. Options: "Yes, matches", "No, doesn't match", "Partially matches", "Unsure", "Other (specify)"
- intervention_match: Use when multiple interventions/tests are mentioned and it's unclear which is the index test. Options should list the specific interventions mentioned + "None of these"
- outcome_match: Use when the study reports a composite or related outcome. Options: "Yes, meets criterion", "No, doesn't meet", "Partially meets", "Unsure", "Other (specify)"
"""


@jev_gate(_jev_args, adapt=to_clarification_shape)
def screen_with_clarification(
    title: str,
    abstract: str,
    pico_criteria: dict[str, Any],
    exclusion_reasons: Optional[list[str]] = None,
    stage: str = "ta",
    signals: Optional[dict[str, Any]] = None,
    client: Optional[ToolCallingClient] = None,
) -> dict[str, Any]:
    """Screen a study with mid-pipeline clarification generation for specific ambiguities."""
    title = (title or "").strip()
    abstract = (abstract or "").strip()

    if not title and not abstract:
        return {
            "recommendation": "uncertain",
            "confidence": 0.0,
            "reason_text": "No title or abstract available for screening",
            "reason_code": "NO_TEXT",
            "quotes": [],
            "evidence_quote": "",
        }

    # Format exclusion reasons if provided. Do not invent case-report or language exclusions.
    exclusion_text = ""
    inclusion = pico_criteria.get("inclusion_criteria") or pico_criteria.get("inclusion") or []
    if isinstance(inclusion, str):
        inclusion = [inclusion]
    if inclusion:
        exclusion_text += "Inclusion Criteria:\n" + "\n".join(f"- {item}" for item in inclusion) + "\n"
    if exclusion_reasons:
        exclusion_text += "Exclusion Reasons / Criteria:\n" + "\n".join(f"- {r}" for r in exclusion_reasons) + "\n"
    exclusion_text += (
        "Apply only the exclusion criteria listed above. "
        "Do not exclude a case report, case series, or non-English paper unless an exclusion criterion says so."
    )

    prompt = CLARIFICATION_SCREENING_PROMPT.format(
        population=pico_criteria.get("population", "N/A"),
        intervention=pico_criteria.get("intervention", pico_criteria.get("index_test", "N/A")),
        comparator=pico_criteria.get("comparator", "N/A"),
        outcome=pico_criteria.get("outcome", pico_criteria.get("outcomes", "N/A")),
        exclusion_text=exclusion_text,
        title=title,
        abstract=abstract,
    )

    if client is None:
        client = get_client()

    raw = client.call_with_tool(
        tool_name="screen_with_clarification",
        prompt=prompt,
        system_prompt="You are a clinical systematic review screening expert. When uncertain about a specific aspect, generate a clear multiple-choice question for the human reviewer.",
        temperature=0.1,
        max_tokens=2048,
    )

    if not raw:
        return {
            "recommendation": "uncertain",
            "confidence": 0.0,
            "reason_text": "LLM screening failed",
            "reason_code": "LLM_FAIL",
            "evidence_quote": "",
            "quotes": [],
            "is_llm_failure": True,
        }

    decision = str(raw.get("decision", raw.get("status", "uncertain"))).lower().strip()
    confidence = float(raw.get("confidence", 0.0))
    reason_text = raw.get("reason", raw.get("reason_text", ""))
    reason_code = raw.get("reason_code", "")
    evidence_quote = raw.get("evidence_quote", "")
    quotes = [evidence_quote] if evidence_quote else raw.get("quotes", [])

    if decision == "needs_clarification" and raw.get("clarification"):
        clar = raw["clarification"]
        raw_options = clar.get("options", [])
        formatted_options = []
        for opt in raw_options:
            if isinstance(opt, dict) and "value" in opt and "label" in opt:
                formatted_options.append({"value": str(opt["value"]), "label": str(opt["label"])})
            elif isinstance(opt, str):
                formatted_options.append({"value": opt.lower().replace(" ", "_"), "label": opt})

        # Must have at least 2 options to be a valid multiple choice question
        if len(formatted_options) >= 2:
            context_excerpt = clar.get("context_excerpt", "")
            if not context_excerpt and abstract:
                # Fallback to first 200 chars of abstract if context_excerpt missing
                context_excerpt = abstract[:200]

            return {
                "recommendation": "needs_clarification",
                "confidence": confidence,
                "reason_text": reason_text or clar.get("interim_reason", "Ambiguity identified requiring human clarification"),
                "reason_code": reason_code or "NEEDS_CLARIFICATION",
                "evidence_quote": evidence_quote or context_excerpt,
                "quotes": quotes or ([context_excerpt] if context_excerpt else []),
                "clarification": {
                    "question_type": clar.get("question_type", "study_design"),
                    "pico_aspect": clar.get("pico_aspect", "study_design"),
                    "question_text": clar.get("question_text", "What is the study design or characteristic?"),
                    "context_excerpt": context_excerpt,
                    "options": formatted_options,
                    "interim_decision": clar.get("interim_decision", "uncertain"),
                    "interim_reason": clar.get("interim_reason", reason_text),
                },
            }

    # Normal decision (included/excluded/uncertain)
    if decision in ("include", "included"):
        rec_val = "included"
    elif decision in ("exclude", "excluded"):
        rec_val = "excluded"
    else:
        rec_val = "uncertain"

    return {
        "recommendation": rec_val,
        "confidence": confidence,
        "reason_text": reason_text,
        "reason_code": reason_code,
        "evidence_quote": evidence_quote,
        "quotes": quotes,
    }
