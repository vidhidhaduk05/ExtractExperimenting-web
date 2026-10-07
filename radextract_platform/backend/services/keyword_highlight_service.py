"""Keyword Highlighting Service for Rayyan-style abstract screening.

Combines three keyword sources:
1. PICO spans (Population=purple, Intervention/Comparator=blue, Outcome=orange)
2. Inclusion/Exclusion keywords (Include=green, Exclude=red) from project configuration / defaults
3. AI-identified keywords from LLM screening responses
"""
from __future__ import annotations

import re
import uuid
from functools import lru_cache
from typing import Any, Optional
from services.pico_extractor import extract_pico_spans_from_abstract


# Cache compiled regexes for keyword matching (~1.7x performance improvement)
@lru_cache(maxsize=512)
def _get_keyword_regex(kw: str) -> re.Pattern:
    """Compile and cache word-boundary regex pattern for a keyword."""
    return re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)

DEFAULT_INCLUDE_KEYWORDS = [
    "randomized",
    "randomised",
    "randomly",
    "random allocation",
    "double-blind",
    "single-blind",
    "controlled trial",
    "clinical trial",
    "placebo",
    "trial",
]

DEFAULT_EXCLUDE_KEYWORDS = [
    "case report",
    "case series",
    "review",
    "meta-analysis",
    "editorial",
    "letter",
    "comment",
    "animal study",
    "in vitro",
    "phantom",
]


def find_keyword_matches(
    text: str,
    keywords: list[dict | str | Any],
    default_type: str = "include",
) -> list[dict[str, Any]]:
    """Find occurrences of inclusion and exclusion keywords in text with regex."""
    if not text or not keywords:
        return []

    spans: list[dict[str, Any]] = []

    for kw_item in keywords:
        if isinstance(kw_item, dict):
            kw = kw_item.get("keyword", "").strip()
            kw_type = kw_item.get("keyword_type", default_type).lower()
        else:
            kw = str(kw_item).strip()
            kw_type = default_type.lower()

        if not kw:
            continue

        color = "green" if kw_type == "include" else "red"
        span_type = "include_keyword" if kw_type == "include" else "exclude_keyword"
        label = f"Include keyword: {kw}" if kw_type == "include" else f"Exclude keyword: {kw}"

        # Match keyword as word or phrase using cached compiled regex
        try:
            pattern = _get_keyword_regex(kw)
            for match in pattern.finditer(text):
                spans.append({
                    "start": match.start(),
                    "end": match.end(),
                    "text": match.group(0),
                    "type": span_type,
                    "color": color,
                    "confidence": 1.0,
                    "label": label,
                })
        except re.error:
            # Fallback to simple find if regex fails
            idx = text.lower().find(kw.lower())
            while idx != -1:
                spans.append({
                    "start": idx,
                    "end": idx + len(kw),
                    "text": text[idx:idx + len(kw)],
                    "type": span_type,
                    "color": color,
                    "confidence": 1.0,
                    "label": label,
                })
                idx = text.lower().find(kw.lower(), idx + 1)

    return spans


def extract_pico_highlights(abstract: str) -> list[dict[str, Any]]:
    """Extract PICO spans from abstract and format for highlighting."""
    raw_spans = extract_pico_spans_from_abstract(abstract)
    formatted: list[dict[str, Any]] = []

    for s in raw_spans:
        field = s.get("field", "")
        # Map field to highlight type
        if field == "population":
            stype = "population"
            color = "purple"
            label = "Population"
        elif field in ("index_test", "intervention"):
            stype = "intervention"
            color = "blue"
            label = "Intervention / Index Test"
        elif field == "comparator":
            stype = "comparator"
            color = "blue"
            label = "Comparator / Reference"
        elif field == "outcome":
            stype = "outcome"
            color = "orange"
            label = "Outcome"
        else:
            stype = field or "pico"
            color = s.get("color", "gray")
            label = field.capitalize()

        formatted.append({
            "start": s["start"],
            "end": s["end"],
            "text": s["text"],
            "type": stype,
            "color": color,
            "confidence": float(s.get("confidence", 0.8)),
            "label": label,
        })

    return formatted


def merge_and_sort_spans(*span_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge span lists and sort by start position ascending, end position descending."""
    all_spans: list[dict[str, Any]] = []
    seen = set()

    for slist in span_lists:
        for span in slist:
            key = (span["start"], span["end"], span["type"])
            if key not in seen:
                seen.add(key)
                all_spans.append(span)

    # Sort primary by start ascending, then length descending
    all_spans.sort(key=lambda s: (s["start"], -(s["end"] - s["start"])))
    return all_spans


def auto_generate_keywords_from_pico(pico: dict[str, Any]) -> dict[str, list[str]]:
    """Extract candidate inclusion and exclusion keywords from PICO fields."""
    include_kws = list(DEFAULT_INCLUDE_KEYWORDS)
    exclude_kws = list(DEFAULT_EXCLUDE_KEYWORDS)

    # Extract terms from population
    pop = str(pico.get("population", "")).strip()
    if pop:
        # Split on commas, semicolons, parentheses
        for part in re.split(r"[,;/()]", pop):
            clean = part.strip()
            if 3 <= len(clean) <= 40 and not any(w in clean.lower() for w in ["patient", "patients", "with", "and", "or", "the", "for"]):
                if clean.lower() not in [k.lower() for k in include_kws]:
                    include_kws.append(clean)

    # Extract terms from intervention / index test
    intervention = str(pico.get("intervention", pico.get("index_test", ""))).strip()
    if intervention:
        for part in re.split(r"[,;/()]", intervention):
            clean = part.strip()
            if 2 <= len(clean) <= 40 and not any(w in clean.lower() for w in ["and", "or", "the", "for", "vs", "versus"]):
                if clean.lower() not in [k.lower() for k in include_kws]:
                    include_kws.append(clean)

    # Extract terms from outcome
    outcome = str(pico.get("outcome", pico.get("outcomes", ""))).strip()
    if outcome:
        for part in re.split(r"[,;/()]", outcome):
            clean = part.strip()
            if 3 <= len(clean) <= 40 and not any(w in clean.lower() for w in ["and", "or", "the", "for"]):
                if clean.lower() not in [k.lower() for k in include_kws]:
                    include_kws.append(clean)

    return {
        "include_keywords": include_kws,
        "exclude_keywords": exclude_kws,
    }
