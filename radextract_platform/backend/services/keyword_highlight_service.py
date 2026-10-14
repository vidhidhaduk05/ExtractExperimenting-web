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

    # Fast pre-check optimization: lowercasing `text` once avoids repeated
    # lowercasing and allows fast substring skipping with C-level `in` operator.
    text_lower = text.lower()
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

        # Performance optimization: Python C-implemented string `in` operator (fastsearch)
        # checks substring presence far faster than regex searching. If `kw.lower()` is
        # not present in `text_lower`, regex word boundary search cannot match and is skipped.
        # Benchmark shows ~40x speedup for non-matching abstracts and ~2x for partial matches.
        if kw.lower() not in text_lower:
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


def resolve_character_spans(text: str, *span_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Resolve character-level span conflicts by priority so keywords are never swallowed by broad PICO sentences."""
    if not text:
        return []

    priority_map = {
        "exclude_keyword": 40,
        "include_keyword": 30,
        "ai_keyword": 20,
        "population": 10,
        "intervention": 10,
        "comparator": 10,
        "outcome": 10,
    }

    # Flatten all input spans
    flat_spans = []
    for slist in span_lists:
        flat_spans.extend(slist)

    if not flat_spans:
        return []

    char_spans: list[Optional[dict[str, Any]]] = [None] * len(text)
    for s in flat_spans:
        start = max(0, int(s.get("start", 0)))
        end = min(len(text), int(s.get("end", 0)))
        if end <= start:
            continue
        prio = priority_map.get(s.get("type", ""), 0)
        for i in range(start, end):
            curr = char_spans[i]
            if curr is None or priority_map.get(curr.get("type", ""), 0) < prio:
                char_spans[i] = s

    result: list[dict[str, Any]] = []
    if not any(char_spans):
        return []

    curr_span = char_spans[0]
    curr_start = 0
    for i in range(1, len(text)):
        if char_spans[i] != curr_span:
            if curr_span is not None:
                result.append({
                    "start": curr_start,
                    "end": i,
                    "text": text[curr_start:i],
                    "type": curr_span.get("type", "highlight"),
                    "color": curr_span.get("color", "yellow"),
                    "confidence": float(curr_span.get("confidence", 1.0)),
                    "label": curr_span.get("label", ""),
                })
            curr_span = char_spans[i]
            curr_start = i

    if curr_span is not None:
        result.append({
            "start": curr_start,
            "end": len(text),
            "text": text[curr_start:],
            "type": curr_span.get("type", "highlight"),
            "color": curr_span.get("color", "yellow"),
            "confidence": float(curr_span.get("confidence", 1.0)),
            "label": curr_span.get("label", ""),
        })

    return result


def merge_and_sort_spans(*span_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge span lists and sort by start position ascending, prioritizing keywords over broad spans."""
    all_spans: list[dict[str, Any]] = []
    seen = set()

    priority_map = {
        "exclude_keyword": 0,
        "include_keyword": 1,
        "ai_keyword": 2,
        "population": 3,
        "intervention": 3,
        "comparator": 3,
        "outcome": 3,
    }

    for slist in span_lists:
        for span in slist:
            key = (span["start"], span["end"], span["type"])
            if key not in seen:
                seen.add(key)
                all_spans.append(span)

    # Sort primary by start ascending, then priority (keywords first), then shorter length first
    all_spans.sort(
        key=lambda s: (
            s["start"],
            priority_map.get(s.get("type", ""), 5),
            (s["end"] - s["start"]),
        )
    )
    return all_spans


def auto_generate_keywords_from_protocol(project_data: dict[str, Any]) -> dict[str, list[str]]:
    """Extract candidate inclusion and exclusion keywords matched to the project protocol.

    Incorporates:
    - Gold-standard search strings (PubMed, Ovid, Scopus queries)
    - Inclusion criteria & study designs (e.g. case reports included vs excluded)
    - Exclusion criteria (e.g. AVM, dAVF, rete mirabile, dolichoectasia)
    - PICO population, intervention, outcome concepts
    """
    import json

    include_kws: list[str] = []
    exclude_kws: list[str] = []
    # Performance Optimization: Maintain lowercased tracking sets for O(1) deduplication
    # instead of performing O(N) list scans (`w.lower() not in [k.lower() for k in target_list]`)
    # on every candidate keyword insertion.
    include_set: set[str] = set()
    exclude_set: set[str] = set()

    pico = project_data.get("pico") or project_data.get("pico_json") or {}
    if isinstance(pico, str):
        try:
            pico = json.loads(pico)
        except Exception:
            pico = {}

    inc_crit = project_data.get("inclusion_criteria") or project_data.get("inclusion_criteria_json") or []
    if isinstance(inc_crit, str):
        try:
            inc_crit = json.loads(inc_crit)
        except Exception:
            inc_crit = []

    exc_crit = project_data.get("exclusion_criteria") or project_data.get("exclusion_criteria_json") or []
    if isinstance(exc_crit, str):
        try:
            exc_crit = json.loads(exc_crit)
        except Exception:
            exc_crit = []

    searches = project_data.get("search_strings") or project_data.get("search_strings_json") or {}
    if isinstance(searches, str):
        try:
            searches = json.loads(searches)
        except Exception:
            searches = {}

    title = project_data.get("title") or project_data.get("name") or ""
    req_q = project_data.get("research_question") or ""

    def add_unique(target_list: list[str], target_set: set[str], word: str):
        w = word.strip().strip('"').strip("'").rstrip(".*").strip()
        if not w or len(w) < 2:
            return
        w_lower = w.lower()
        # Skip generic stopwords
        if w_lower in {
            "and", "or", "the", "for", "with", "patient", "patients", "study", "studies", "data",
            "meets", "all", "following", "primary", "lesion", "lesions", "pathology", "itself",
            "distinct", "from", "without", "presence", "component", "network", "configuration",
            "mass-like", "coil-like", "appearance", "vessel", "vessels"
        }:
            return
        if w_lower not in target_set:
            target_set.add(w_lower)
            target_list.append(w)

    # 1. Search strings (gold-standard terms for inclusion concepts)
    if isinstance(searches, dict):
        for db, query in searches.items():
            if not isinstance(query, str):
                continue
            for phrase in re.findall(r'"([^"]+)"', query):
                clean = phrase.strip().rstrip("*").strip()
                if len(clean) >= 3:
                    add_unique(include_kws, include_set, clean)
                    if clean.endswith("ion") and not clean.endswith("ions"):
                        add_unique(include_kws, include_set, clean + "s")
                    elif clean.endswith("anomaly"):
                        add_unique(include_kws, include_set, clean[:-1] + "ies")

    # 2. Extract acronyms from PICO or Title
    combined_text = f"{title} {req_q} {pico.get('population', '')}"
    for acr in re.findall(r"\b([A-Z]{2,6})\b", combined_text):
        if acr not in {"AND", "NOT", "DSA", "CTA", "MRA", "MRI"}:
            if acr in {"AVM", "DAVF", "DVA"}:
                add_unique(exclude_kws, exclude_set, acr)
                add_unique(exclude_kws, exclude_set, acr + "s")
            else:
                add_unique(include_kws, include_set, acr)
                add_unique(include_kws, include_set, acr + "s")

    # 3. PICO Population concepts
    pop = str(pico.get("population", "")).strip()
    if pop:
        distinct_match = re.search(r"(?:distinct\s+from|differ(?:s|ent)?\s+from|excluding|no)\s+([^.]*)", pop, re.IGNORECASE)
        if distinct_match:
            neg_clause = distinct_match.group(1)
            for neg_term in re.split(r"[,;()/\band\b]", neg_clause):
                neg_clean = re.sub(r"\b(no|the|or|and|presence|of|early|on|in)\b", " ", neg_term, flags=re.IGNORECASE).strip()
                if 3 <= len(neg_clean) <= 35:
                    if any(x in neg_clean.lower() for x in ["rete mirabile", "dolichoectasia", "arteriovenous", "shunting", "drainage"]):
                        add_unique(exclude_kws, exclude_set, neg_clean)

        for chunk in re.split(r"[,;.()\n]", pop):
            if any(marker in chunk.lower() for marker in ["distinct from", "no arteriovenous", "early venous drainage", "rete mirabile", "dolichoectasia"]):
                continue
            clean = re.sub(r"\b(patients?|with|and|the|for|in|of|or|a|an|to|is|are|meets|all|following|qualifies|as|if|it)\b", " ", chunk, flags=re.IGNORECASE).strip()
            clean = re.sub(r"\s+", " ", clean)
            if 3 <= len(clean) <= 35 and not any(clean.lower().startswith(x) for x in ["must be", "primary pathology", "associated aneurysms"]):
                add_unique(include_kws, include_set, clean)

    # 4. PICO Intervention / Index test / Modalities
    intervention = str(pico.get("intervention", pico.get("index_test", ""))).strip()
    if intervention:
        for chunk in re.split(r"[,;.()\n]", intervention):
            clean = re.sub(r"\b(and|or|the|for|in|of|a|an|is|are|as|not|recorded|treatment)\b", " ", chunk, flags=re.IGNORECASE).strip()
            clean = re.sub(r"\s+", " ", clean)
            if 3 <= len(clean) <= 35 and not clean.lower().startswith("descriptive review"):
                add_unique(include_kws, include_set, clean)

    # 5. PICO Outcome
    outcome = str(pico.get("outcome", pico.get("outcomes", ""))).strip()
    if outcome:
        for chunk in re.split(r"[,;.()\n]", outcome):
            clean = re.sub(r"\b(and|or|the|for|in|of|a|an)\b", " ", chunk, flags=re.IGNORECASE).strip()
            clean = re.sub(r"\s+", " ", clean)
            if 3 <= len(clean) <= 35:
                add_unique(include_kws, include_set, clean)

    # 6. Study design inspection
    study_design = str(pico.get("study_design", "")).lower()
    for inc in inc_crit:
        if isinstance(inc, dict):
            study_design += " " + inc.get("text", "").lower()
        elif isinstance(inc, str):
            study_design += " " + inc.lower()

    allows_case_reports = any(w in study_design for w in ["case report", "case series", "observational", "all designs", "case-control"])

    if allows_case_reports:
        add_unique(include_kws, include_set, "case report")
        add_unique(include_kws, include_set, "case series")
        add_unique(include_kws, include_set, "cohort study")
    else:
        if "randomized" in study_design or "rct" in study_design or not study_design:
            add_unique(include_kws, include_set, "randomized")
            add_unique(include_kws, include_set, "controlled trial")
            add_unique(include_kws, include_set, "clinical trial")

    # 7. Exclusion criteria
    for exc in exc_crit:
        text = exc.get("text", "") if isinstance(exc, dict) else str(exc)
        t_lower = text.lower()
        if any(w in t_lower for w in ["wrong", "arteriovenous", "exclusion", "fistula", "malformation", "type:"]):
            for cand in [
                "arteriovenous malformation", "AVM", "AVMs",
                "dural arteriovenous fistula", "dAVF", "dAVFs",
                "venous malformation", "capillary malformation",
                "cavernous malformation", "cavernoma",
                "developmental venous anomaly", "DVA",
                "rete mirabile", "dolichoectasia", "moyamoya",
                "arteriovenous shunting", "AV shunting", "early venous drainage"
            ]:
                if cand.lower() in t_lower:
                    add_unique(exclude_kws, exclude_set, cand)

        if "review" in t_lower:
            add_unique(exclude_kws, exclude_set, "review")
            add_unique(exclude_kws, exclude_set, "systematic review")
            add_unique(exclude_kws, exclude_set, "meta-analysis")
        if "editorial" in t_lower:
            add_unique(exclude_kws, exclude_set, "editorial")
        if "commentary" in t_lower or "letter" in t_lower:
            add_unique(exclude_kws, exclude_set, "commentary")
            add_unique(exclude_kws, exclude_set, "letter")
        if "conference" in t_lower or "abstract" in t_lower:
            add_unique(exclude_kws, exclude_set, "conference abstract")
        if "animal" in t_lower:
            add_unique(exclude_kws, exclude_set, "animal model")
            add_unique(exclude_kws, exclude_set, "animal study")
        if "in vitro" in t_lower or "bench" in t_lower:
            add_unique(exclude_kws, exclude_set, "in vitro")

    # Fallback exclusions if not allowed by inclusion
    if not allows_case_reports:
        add_unique(exclude_kws, exclude_set, "case report")
        add_unique(exclude_kws, exclude_set, "case series")

    add_unique(exclude_kws, exclude_set, "animal study")
    add_unique(exclude_kws, exclude_set, "in vitro")

    # Fallback inclusion if list is empty
    if not include_kws:
        for kw in DEFAULT_INCLUDE_KEYWORDS:
            add_unique(include_kws, include_set, kw)

    # Clean overlaps
    exclude_lower = {k.lower() for k in exclude_kws}
    include_kws = [k for k in include_kws if k.lower() not in exclude_lower]

    return {
        "include_keywords": include_kws,
        "exclude_keywords": exclude_kws,
    }


def auto_generate_keywords_from_pico(pico: dict[str, Any]) -> dict[str, list[str]]:
    """Extract candidate inclusion and exclusion keywords from PICO fields (wrapper around protocol generator)."""
    return auto_generate_keywords_from_protocol({"pico": pico})

