"""Coded data extraction service.

Per-study extraction following the clinical-data-extraction skill pattern:
  1. PROMPT   — one extraction prompt per variable (extraction_prompt_builder)
  2. EXTRACT  — LLM returns value + verbatim source quote + page + confidence tag
  3. CODE     — confidence tags [DS]/[INF]/[CALC]/[SUP]/[FIG] and missing-data
                codes -99 (not reported) / -77 (not applicable) / -88 (unable)
  4. DOUBLE-CHECK — numeric values re-located in the source before writing
  5. EXHAUSTIVE SEARCH — tables, then pages with synonyms, then derivations
  6. RECHECK  — one final targeted pass before any -99 is written

The Docling PDF -> JSON conversion (pdf_service.process_pdf) is the unchanged
source of truth; this service only reads pdf_documents.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import pdf_service
from services.extraction_prompt_builder import build_field_prompt
from services.laya_extraction_tracer import trace_variable_evidence

logger = logging.getLogger("radextract.coded_extraction")

# ── Coding taxonomy ──
CONFIDENCE_TAGS = {"DS", "INF", "CALC", "SUP", "FIG"}
MISSING_NOT_REPORTED = "-99"
MISSING_NOT_APPLICABLE = "-77"
MISSING_UNABLE = "-88"
MISSING_CODES = {MISSING_NOT_REPORTED, MISSING_NOT_APPLICABLE, MISSING_UNABLE}

TAG_TO_CONFIDENCE = {
    "DS": 0.95,
    "CALC": 0.90,
    "SUP": 0.85,
    "INF": 0.70,
    "FIG": 0.60,
}

# Universal synonym table for the exhaustive-search pass
SYNONYMS: dict[str, list[str]] = {
    "follow_up": ["follow up", "follow-up", "followed for", "median duration",
                  "observation period", "monitoring period"],
    "sample_size": ["sample size", "total of", "patients were", "participants were",
                    "subjects were", "n =", "enrolled", "included"],
    "age": ["mean age", "average age", "median age", "age range", "years old"],
    "male": ["male", "men", "sex", "gender"],
    "female": ["female", "women", "sex", "gender"],
    "sensitivity": ["sensitivity", "sensitivities", "true positive rate"],
    "specificity": ["specificity", "specificities", "true negative rate"],
    "study_design": ["study design", "retrospective", "prospective", "cohort",
                     "randomized", "cross-sectional", "case-control"],
}

# Simple derivation rules: (name fragment, unit pattern, factor, target unit)
_DERIVATIONS = [
    ("follow_up", r"(\d+(?:\.\d+)?)\s*years?", 12.0, "months"),
    ("follow_up", r"(\d+(?:\.\d+)?)\s*yrs?\.?", 12.0, "months"),
    ("follow_up", r"(\d+(?:\.\d+)?)\s*weeks?", 0.25, "months"),
]

_NOT_FOUND_TOKENS = {"", "not found", "not_found", "not reported", "n/a", "none",
                     "unknown", "null", "not stated", "not available"}
_NOT_APPLICABLE_TOKENS = {"not applicable", "not_applicable", "na", "n/a."}


def _is_missing(value: str) -> bool:
    return value.strip().lower() in _NOT_FOUND_TOKENS


def _is_not_applicable(value: str) -> bool:
    return value.strip().lower() in _NOT_APPLICABLE_TOKENS


def _page_texts(pdf_data: dict) -> list[tuple[int, str]]:
    """[(page_number, text)] from the Docling page list."""
    out = []
    for pg in pdf_data.get("pages", []) or []:
        txt = pg.get("text") or ""
        if txt:
            out.append((int(pg.get("page_number", len(out) + 1)), txt))
    return out


def _find_quote_page(quote: str, pages: list[tuple[int, str]], full_text: str) -> Optional[int]:
    """Locate a verbatim quote in the page texts; return page number or None."""
    if not quote:
        return None
    q = quote[:60].lower()
    for pnum, ptext in pages:
        if q in ptext.lower():
            return pnum
    if q in full_text.lower():
        return None  # present in document but not localized to a page
    return None


def _quote_verbatim(quote: str, pages: list[tuple[int, str]], full_text: str) -> bool:
    """True when the quote appears verbatim (case-insensitive) in the document."""
    if not quote or len(quote.strip()) < 8:
        return False
    q = quote[:60].lower()
    if q in full_text.lower():
        return True
    return any(q in ptext.lower() for _, ptext in pages)


def _search_sentences(text: str, keywords: list[str]) -> Optional[str]:
    """Return the first sentence containing any keyword (case-insensitive)."""
    text_lower = text.lower()
    for kw in keywords:
        idx = text_lower.find(kw.lower())
        if idx == -1:
            continue
        start = max(0, text.rfind(".", 0, idx) + 1)
        end = text.find(".", idx + len(kw))
        end = len(text) if end == -1 else end + 1
        sentence = text[start:end].strip()
        if 10 < len(sentence) < 400:
            return sentence
    return None


def _variable_keywords(var: dict) -> list[str]:
    """Search keywords for a variable: name tokens + synonym table."""
    name = var.get("name", "")
    kws = [name.replace("_", " ")]
    for key, syns in SYNONYMS.items():
        if key in name.lower():
            kws.extend(syns)
    # Also add individual name tokens (length > 3)
    kws.extend(t for t in name.lower().split("_") if len(t) > 3)
    return list(dict.fromkeys(kws))


def _search_tables(var: dict, tables: list[dict]) -> Optional[dict]:
    """Scan Docling table cells for the variable name tokens; return the
    adjacent cell value when a row header matches."""
    tokens = [t for t in var.get("name", "").lower().split("_") if len(t) > 2]
    if not tokens:
        return None
    for table in tables or []:
        rows = table.get("rows", [])
        page = table.get("page", 1)
        for row in rows:
            if not row:
                continue
            header = str(row[0]).lower()
            if any(tok in header for tok in tokens) and len(row) > 1:
                value = str(row[1]).strip()
                if value:
                    return {
                        "value": value,
                        "source_text": " | ".join(str(c) for c in row)[:300],
                        "source_page": page,
                        "confidence_tag": "DS",
                    }
    return None


def _try_derivations(var: dict, full_text: str) -> Optional[dict]:
    """Apply unit-derivation rules (e.g. years -> months for follow-up)."""
    name = var.get("name", "").lower()
    name_squashed = name.replace("_", "")
    for fragment, pattern, factor, target_unit in _DERIVATIONS:
        if fragment.replace("_", "") not in name_squashed or target_unit not in name:
            continue
        m = re.search(pattern, full_text, flags=re.IGNORECASE)
        if m:
            original = float(m.group(1))
            derived = original * factor
            derived = int(derived) if derived == int(derived) else round(derived, 1)
            return {
                "value": str(derived),
                "source_text": m.group(0),
                "source_page": 1,
                "confidence_tag": "CALC",
                "calc_note": f"{original} {m.group(0).split()[-1]} x {factor} = {derived} {target_unit}",
            }
    return None


def _exhaustive_search(var: dict, pdf_data: dict, full_text: str) -> Optional[dict]:
    """Exhaustive search before writing -99: tables -> derivations -> pages/synonyms."""
    # 1. Structured tables
    hit = _search_tables(var, pdf_data.get("tables", []))
    if hit:
        return hit

    # 2. Derivation rules first for unit-targeted numeric fields — a raw sentence
    #    hit would carry the wrong unit (e.g. years for a *_months variable)
    derived = _try_derivations(var, full_text)
    if derived:
        return derived

    # 3. Page-level synonym search
    keywords = _variable_keywords(var)
    for pnum, ptext in _page_texts(pdf_data):
        sentence = _search_sentences(ptext, keywords)
        if sentence:
            return {
                "value": sentence[:150],
                "source_text": sentence[:300],
                "source_page": pnum,
                "confidence_tag": "INF",
            }

    # 4. Full-text fallback (un-paginated)
    if not pdf_data.get("pages"):
        sentence = _search_sentences(full_text, keywords)
        if sentence:
            return {
                "value": sentence[:150],
                "source_text": sentence[:300],
                "source_page": 1,
                "confidence_tag": "INF",
            }

    return None


def _recheck(var: dict, pdf_data: dict, full_text: str) -> Optional[dict]:
    """Final targeted recheck pass for a field about to be coded -99.

    Baseline/demographic fields -> first table (Table 1) and first pages.
    Outcome fields -> tables and later pages. Uses loose matching: any two
    name tokens in the same sentence.
    """
    tokens = [t for t in var.get("name", "").lower().split("_") if len(t) > 3]
    if not tokens:
        return None

    section = (var.get("section") or "").lower()
    tables = pdf_data.get("tables", []) or []
    pages = _page_texts(pdf_data)

    # Priority locations
    if any(k in section for k in ("population", "cohort", "baseline", "metadata", "study")):
        tables = tables[:1] or tables
        pages = pages[:3] or pages
    else:
        tables = tables[1:] or tables
        pages = pages[2:] or pages

    def loose_hit(text: str) -> Optional[str]:
        text_lower = text.lower()
        matched = [t for t in tokens if t in text_lower]
        if len(matched) >= min(2, len(tokens)):
            for sent in re.split(r"(?<=[.!?])\s+", text):
                sl = sent.lower()
                if any(t in sl for t in matched) and 10 < len(sent) < 400:
                    return sent.strip()
        return None

    for table in tables:
        for row in table.get("rows", []):
            row_text = " | ".join(str(c) for c in row)
            if loose_hit(row_text) and len(row) > 1 and str(row[1]).strip():
                return {
                    "value": str(row[1]).strip(),
                    "source_text": row_text[:300],
                    "source_page": table.get("page", 1),
                    "confidence_tag": "INF",
                }

    for pnum, ptext in pages:
        sent = loose_hit(ptext)
        if sent:
            return {
                "value": sent[:150],
                "source_text": sent[:300],
                "source_page": pnum,
                "confidence_tag": "INF",
            }
    return None


def _numeric_double_check(var: dict, value: str, quote: str,
                          pages: list[tuple[int, str]], full_text: str) -> bool:
    """For numeric fields, verify the number appears in the source quote or text."""
    if var.get("field_type") not in ("int", "float", "percent"):
        return True
    m = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    if not m:
        return True  # non-numeric value in a numeric field — leave to reviewers
    num = m.group(0).rstrip(".")
    if num in quote.replace(",", ""):
        return True
    if num in full_text.replace(",", ""):
        return True
    return any(num in ptext.replace(",", "") for _, ptext in pages)


def _gate_relevant_text(section: str, variables: list[dict], pdf_data: Optional[dict], full_text: str) -> str:
    """SLIDERS-inspired relevance gating:
    Scores and extracts only the pages and tables that discuss the target section/variables.
    Prevents token bloat and hallucination by discarding irrelevant pages.
    """
    if not pdf_data:
        return full_text[:24000]

    pages = _page_texts(pdf_data)
    if not pages:
        return full_text[:24000]

    # Collect keywords from section name and variable names/prompts
    keywords = set()
    for tok in re.split(r"[\s_/,()-]+", section.lower()):
        if len(tok) >= 3 and tok not in ("and", "the", "for", "with", "from", "section"):
            keywords.add(tok)
    for v in variables:
        for tok in re.split(r"[\s_/,()-]+", v.get("name", "").lower()):
            if len(tok) >= 3 and tok not in ("and", "the", "for", "with", "from", "variable"):
                keywords.add(tok)

    # Score pages based on keyword density and presence of tables
    scored_pages = []
    for pnum, ptext in pages:
        ptext_lower = ptext.lower()
        score = sum(1 for kw in keywords if kw in ptext_lower)
        if "table" in ptext_lower or re.search(r"\b\d+(?:\.\d+)?%", ptext):
            score += 2
        if score > 0:
            scored_pages.append((score, pnum, ptext))

    if not scored_pages:
        # Fall back to first 3 pages
        scored_pages = [(1, pnum, ptext) for pnum, ptext in pages[:3]]

    scored_pages.sort(key=lambda x: x[0], reverse=True)
    # Re-sort top pages in document order
    top_pages = sorted(scored_pages[:5], key=lambda x: x[1])
    assembled = []
    curr_len = 0
    for score, pnum, ptext in top_pages:
        chunk = f"--- [Page {pnum}] ---\n{ptext}\n"
        if curr_len + len(chunk) > 24000:
            assembled.append(chunk[:(24000 - curr_len)])
            break
        assembled.append(chunk)
        curr_len += len(chunk)

    return "\n".join(assembled) if assembled else full_text[:24000]


def _llm_extract_section(section: str, variables: list[dict], full_text: str,
                         model_fn: Callable, pdf_data: Optional[dict] = None) -> dict[str, dict]:
    """One LLM call per section; returns {var_name: response dict} with gated context."""
    var_lines = []
    for v in variables:
        var_lines.append(f"- {v['name']}: {build_field_prompt(v)}")

    gated_context = _gate_relevant_text(section, variables, pdf_data, full_text)

    prompt = f"""Extract data from this clinical study for the coding form section "{section}".

Document text:
{gated_context}

For EACH variable below, follow its extraction instruction exactly:
{chr(10).join(var_lines)}

Return JSON only:
{{
  "responses": [
    {{
      "prompt": "<variable name>",
      "response": "<extracted value, NOT_FOUND, or NOT_APPLICABLE>",
      "source": "<verbatim quote from the document>",
      "page": "<page number>",
      "confidence_tag": "DS | INF | CALC | SUP | FIG",
      "calc_note": "<only for CALC: show the arithmetic>"
    }}
  ]
}}

Confidence tags: DS = directly stated verbatim; INF = inferred; CALC = calculated
(show work in calc_note); SUP = from supplement; FIG = from a figure."""

    raw = model_fn(prompt, system_prompt=(
        "You are a clinical data extraction assistant. Extract exactly what each "
        "field instruction asks, with verbatim source quotes."
    ))

    items: list[dict] = []
    if isinstance(raw, dict):
        items = raw.get("responses", []) or raw.get("variables", []) or []
    elif isinstance(raw, list):
        items = raw

    out: dict[str, dict] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("prompt") or item.get("name") or "").strip().lower()
        if name:
            out[name] = item
    return out


def coded_extract_study(
    study_id: str,
    project_id: str,
    db: Optional[DBBackend] = None,
    model_fn: Optional[Callable] = None,
    reviewer: str = "coded_auto",
    require_fulltext: bool = False,
) -> dict:
    """Run coded extraction for one study. Returns a per-study summary.

    When require_fulltext is set, a missing PDF/PMC text is reported as not
    retrieved and the abstract is not used as a substitute document.
    """
    db = db or get_db_backend()

    study = db.get("studies", study_id)
    if not study:
        raise ValueError(f"Study {study_id} not found")

    pdf_data = pdf_service.get_pdf_data(study_id, db=db) or {}
    full_text = pdf_data.get("full_text", "") or ""
    if not full_text and require_fulltext:
        return {
            "study_id": study_id,
            "extracted": 0,
            "fulltext": "not_retrieved",
            "message": "Full text not retrieved",
        }
    if not full_text:
        full_text = f"Title: {study.get('title') or ''}\nAbstract: {study.get('abstract') or ''}"
    pages = _page_texts(pdf_data)

    variables = db.query("variables", {"project_id": project_id}, order_by="section")
    if not variables:
        return {"study_id": study_id, "extracted": 0, "message": "No variables defined"}

    # Group variables by section for batched LLM calls
    sections: dict[str, list[dict]] = {}
    for v in variables:
        sections.setdefault(v.get("section") or "General", []).append(v)

    # LLM extraction per section (when a model is available)
    llm_by_name: dict[str, dict] = {}
    if model_fn is not None and full_text:
        for section, sec_vars in sections.items():
            try:
                llm_by_name.update(_llm_extract_section(section, sec_vars, full_text, model_fn, pdf_data=pdf_data))
            except Exception as e:
                logger.warning(f"[CodedExtraction] LLM section '{section}' failed for {study_id}: {e}")

    now = datetime.now(timezone.utc).isoformat()
    summary = {
        "study_id": study_id,
        "extracted": 0,
        "coded_ds": 0, "coded_inf": 0, "coded_calc": 0, "coded_sup": 0, "coded_fig": 0,
        "minus_99": [], "minus_77": [], "minus_88": [],
        "conflicts": [],
    }

    for var in variables:
        var_id = var["variable_id"]
        var_name = var["name"]
        prompt_used = build_field_prompt(var)

        value: Optional[str] = None
        quote = ""
        src_page = 1
        tag = ""
        calc_note = ""
        missing_code = ""

        # ── 1-2. LLM result for this variable ──
        item = llm_by_name.get(var_name.lower())
        if item is not None:
            resp = str(item.get("response", "")).strip()
            if _is_not_applicable(resp):
                missing_code = MISSING_NOT_APPLICABLE
            elif not _is_missing(resp):
                value = resp
                quote = str(item.get("source", "")).strip()
                try:
                    src_page = int(re.search(r"\d+", str(item.get("page", "1"))).group(0))
                except Exception:
                    src_page = 1
                tag = str(item.get("confidence_tag", "")).strip().upper().strip("[]")
                if tag not in CONFIDENCE_TAGS:
                    tag = "DS" if quote else "INF"
                calc_note = str(item.get("calc_note", "")).strip()
                if tag == "CALC" and not calc_note:
                    tag = "INF"  # CALC requires shown arithmetic

        # ── 3. Coding verification & Laya Tracing ──
        if value and tag in ("DS", "INF"):
            # If quote is missing or not verbatim, attempt Laya trace to accurately bind verbatim quote & page
            if not _quote_verbatim(quote, pages, full_text):
                traced = trace_variable_evidence(var_name, value, pdf_data, full_text)
                if traced and traced.get("verified"):
                    quote = traced["source_text"]
                    src_page = traced["source_page"]
                    tag = "DS"
                elif tag == "DS":
                    tag = "INF"

        # ── 4. Numeric double-check ──
        if value and not _numeric_double_check(var, value, quote, pages, full_text):
            # Attempt rescue via Laya numeric quote locator
            traced_num = trace_variable_evidence(var_name, value, pdf_data, full_text)
            if traced_num and traced_num.get("verified"):
                quote = traced_num["source_text"]
                src_page = traced_num["source_page"]
            else:
                tag = "INF"
                summary["conflicts"].append(
                    f"{var_name}: numeric value not re-located in source (kept, tagged [INF])"
                )

        # ── 5-6. Exhaustive search + recheck before -99 ──
        if not value and not missing_code:
            hit = _exhaustive_search(var, pdf_data, full_text)
            if hit is None:
                hit = _recheck(var, pdf_data, full_text)
            if hit:
                value = hit["value"]
                quote = hit.get("source_text", "")
                src_page = hit.get("source_page", 1)
                tag = hit.get("confidence_tag", "INF")
                calc_note = hit.get("calc_note", "")
            else:
                # -88 when the document itself is unusable, else -99
                garbled = bool(pdf_data) and len(full_text.strip()) < 200
                missing_code = MISSING_UNABLE if garbled else MISSING_NOT_REPORTED

        # ── Write the extraction row ──
        confidence = TAG_TO_CONFIDENCE.get(tag, 0.0) if value else 0.0
        stored_value = value if value else missing_code

        existing = db.query("extractions", {"study_id": study_id, "variable_id": var_id})
        row_data = {
            "value": stored_value,
            "confidence": confidence,
            "source_page": src_page,
            "source_text": quote,
            "extracted_by": reviewer,
            "extracted_at": now,
            "is_edited": 0,
            "confidence_tag": tag,
            "missing_code": missing_code,
            "extraction_prompt": prompt_used,
            "calc_note": calc_note,
        }
        if existing:
            db.update("extractions", existing[0]["extraction_id"], row_data)
        else:
            db.insert("extractions", {
                "extraction_id": str(uuid.uuid4()),
                "study_id": study_id,
                "variable_id": var_id,
                "source_bbox": "",
                **row_data,
            })

        # ── Summary accounting ──
        if value:
            summary["extracted"] += 1
            key = f"coded_{tag.lower()}"
            if key in summary:
                summary[key] += 1
        elif missing_code == MISSING_NOT_REPORTED:
            summary["minus_99"].append(var_name)
        elif missing_code == MISSING_NOT_APPLICABLE:
            summary["minus_77"].append(var_name)
        elif missing_code == MISSING_UNABLE:
            summary["minus_88"].append(var_name)

    db.update("studies", study_id, {"extraction_status": "coded_extracted"})
    db.commit()

    logger.info(
        f"[CodedExtraction] {study_id}: {summary['extracted']} extracted, "
        f"-99={len(summary['minus_99'])} -77={len(summary['minus_77'])} "
        f"-88={len(summary['minus_88'])} conflicts={len(summary['conflicts'])}"
    )
    return summary
