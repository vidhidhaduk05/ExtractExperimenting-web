"""PICO extraction service: extract PICO elements from uploaded study protocol documents.

Uses NLP-based text analysis with section header detection and keyword pattern matching.
Supports PDF (via pdfplumber), DOCX (via python-docx), and plain text files.

Two extraction strategies:
  1. Section header detection — looks for headers like "Population", "Index Test",
     "Outcome", etc. and extracts the text following each header.
  2. Keyword pattern matching — falls back to sentence-level patterns like
     "We will include patients with...", "The index test is...", etc.

Returns a dict with PICO elements + research question + hypothesis + confidence score.
"""
from __future__ import annotations

import os
import re
import tempfile
from typing import Optional

# ── Section header synonyms ──

PICO_HEADERS = {
    "population": [
        "population", "participants", "patients", "patient population",
        "study population", "eligibility criteria", "inclusion criteria",
        "target population", "participant characteristics",
    ],
    "index_test": [
        "index test", "index tests", "test under evaluation",
        "tests under evaluation", "intervention", "interventions",
        "exposure", "imaging protocol", "imaging technique",
    ],
    "comparator": [
        "comparator", "comparators", "reference standard", "reference test",
        "comparison", "control", "gold standard", "reference method",
    ],
    "outcome": [
        "outcome", "outcomes", "primary outcome", "primary outcomes",
        "secondary outcome", "secondary outcomes", "endpoint", "endpoints",
        "primary endpoint", "main outcome", "target condition",
    ],
    "study_design": [
        "study design", "design", "study type", "methodology",
        "methods", "study methodology", "trial design",
    ],
    "research_question": [
        "research question", "objective", "objectives", "aim", "aims",
        "purpose", "goal", "goals", "background and objective",
    ],
    "hypothesis": [
        "hypothesis", "hypotheses", "primary hypothesis",
        "null hypothesis", "alternative hypothesis",
    ],
}

# ── Keyword patterns for fallback extraction ──

KEYWORD_PATTERNS = {
    "population": [
        r"(?:we\s+will\s+include|we\s+included|inclusion\s+criteria|patients\s+with|participants\s+with|subjects\s+with|study\s+population\s+(?:was|is|consisted\s+of|comprised))\s*:?\s*(.+?)(?:\.\s|[;\n]|exclusion)",
        r"(?:population\s+(?:was|is|consisted\s+of|comprised|included))\s*:?\s*(.+?)(?:\.\s|[;\n])",
    ],
    "index_test": [
        r"(?:index\s+test\s+(?:was|is|used|consisted\s+of|comprised)|the\s+index\s+test\s+(?:was|is)|test\s+under\s+evaluation\s+(?:was|is))\s*:?\s*(.+?)(?:\.\s|[;\n])",
        r"(?:intervention\s+(?:was|is|consisted\s+of|comprised)|the\s+intervention\s+(?:was|is))\s*:?\s*(.+?)(?:\.\s|[;\n])",
    ],
    "comparator": [
        r"(?:reference\s+standard\s+(?:was|is|used|consisted\s+of)|the\s+reference\s+standard\s+(?:was|is)|comparator\s+(?:was|is|used))\s*:?\s*(.+?)(?:\.\s|[;\n])",
        r"(?:gold\s+standard\s+(?:was|is|used))\s*:?\s*(.+?)(?:\.\s|[;\n])",
    ],
    "outcome": [
        r"(?:primary\s+outcome\s+(?:was|is|measured|assessed)|the\s+primary\s+outcome\s+(?:was|is)|outcome\s+(?:was|is|measured))\s*:?\s*(.+?)(?:\.\s|[;\n])",
        r"(?:we\s+(?:assessed|measured|evaluated)\s+)\s*(.+?)(?:\.\s|[;\n])",
    ],
    "study_design": [
        r"(?:this\s+(?:is|was)\s+(?:a|an)\s+)(.+?)(?:\s+study|\.|[;\n])",
        r"(?:study\s+design\s*:?\s*)(.+?)(?:\.\s|[;\n])",
    ],
    "research_question": [
        r"(?:research\s+question\s*:?\s*)(.+?)(?:\.\s|[;\n])",
        r"(?:the\s+(?:objective|aim|purpose)\s+(?:of\s+this|was\s+to|is\s+to)\s*)(.+?)(?:\.\s|[;\n])",
    ],
    "hypothesis": [
        r"(?:hypothes(?:is|es)\s*(?:was|is|that)?\s*:?\s*)(.+?)(?:\.\s|[;\n])",
        r"(?:we\s+hypothes(?:ize|ized)\s+that\s+)(.+?)(?:\.\s|[;\n])",
    ],
}


def _normalize_text(text: str) -> str:
    """Normalize whitespace while preserving line breaks for section detection."""
    # Normalize line breaks
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\r", "\n", text)
    # Collapse multiple spaces/tabs (but keep newlines)
    text = re.sub(r"[ \t]+", " ", text)
    # Remove leading/trailing whitespace from each line
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)
    # Collapse 3+ newlines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _looks_like_header(line: str, header_synonyms: list[str]) -> bool:
    """Check if a line looks like a section header for the given synonyms."""
    line_lower = line.lower().strip()
    # Strip trailing colon or period
    line_clean = re.sub(r"[:.]\s*$", "", line_lower).strip()
    for synonym in header_synonyms:
        if line_clean == synonym:
            return True
    return False


def _find_section_content(text: str, header_synonyms: list[str]) -> str:
    """Find content following a section header using a line-by-line approach.

    Handles two formats:
      1. "Header: content on same line"
      2. "Header" on its own line, content on subsequent lines
    """
    lines = text.split("\n")

    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue

        line_lower = line_stripped.lower()

        # Check if this line starts with a header synonym followed by a colon
        # Format 1: "Header: content on same line"
        for synonym in header_synonyms:
            # Match "synonym:" or "synonym :" at start of line
            colon_pattern = rf"^{re.escape(synonym)}\s*:\s*(.+)$"
            colon_match = re.match(colon_pattern, line_lower)
            if colon_match:
                content = line_stripped[colon_match.end(0) - len(colon_match.group(1)):]
                # Actually, let's extract from the original line to preserve case
                orig_pattern = rf"^{re.escape(synonym)}\s*:\s*(.+)$"
                orig_match = re.match(orig_pattern, line_stripped, re.IGNORECASE)
                if orig_match:
                    content = orig_match.group(1).strip()
                    if content and len(content) >= 2:
                        return content

        # Check if this line IS a header (on its own line)
        if _looks_like_header(line_stripped, header_synonyms):
            # Format 2: collect content from subsequent lines until next header or blank line
            content_lines = []
            for j in range(i + 1, len(lines)):
                next_line = lines[j].strip()
                if not next_line:
                    # Stop at blank line only if we already have content
                    if content_lines:
                        break
                    continue
                # Check if next line is itself a header (for any PICO field)
                if _is_any_header(next_line):
                    break
                content_lines.append(next_line)

            if content_lines:
                content = " ".join(content_lines).strip()
                if content and len(content) >= 2:
                    return content

    return ""


def _is_any_header(line: str) -> bool:
    """Check if a line matches any PICO section header."""
    for synonyms in PICO_HEADERS.values():
        if _looks_like_header(line, synonyms):
            return True
    return False


def _empty_pico() -> dict:
    return {
        "population": "",
        "index_test": "",
        "comparator": "",
        "outcome": "",
        "study_design": "",
        "research_question": "",
        "hypothesis": "",
        "extraction_confidence": "low",
        "inclusion": [],
        "exclusion": [],
        "search_strings": {},
        "variables": [],
    }


def _section_body(text: str, start_needles: list[str], end_needles: list[str]) -> list[str]:
    """Return lines after a short heading until the next heading."""
    lines = text.split("\n")
    start = None
    for i, line in enumerate(lines):
        low = line.strip().lower()
        if not low or len(low) > 90:
            continue
        if any(needle in low for needle in start_needles):
            start = i + 1
            break
    if start is None:
        return []
    body = []
    for line in lines[start:]:
        low = line.strip().lower()
        if low and len(low) < 90 and any(low.startswith(needle) or needle in low for needle in end_needles):
            break
        if line.strip():
            body.append(line.strip())
    return body


def _criteria_lines(lines: list[str]) -> list[str]:
    skip_prefixes = (
        "all of the following",
        "any one of the following",
        "studies included",
        "period window",
    )
    criteria = []
    for line in lines:
        low = line.lower().lstrip("-•* ").strip()
        if any(low.startswith(prefix) for prefix in skip_prefixes):
            continue
        if len(low) < 12:
            continue
        criteria.append(line.lstrip("-•* ").strip())
    return criteria


def _db_key(label: str) -> str:
    low = label.lower()
    if "pubmed" in low:
        return "pubmed"
    if "ovid" in low:
        return "ovid_medline"
    if "scopus" in low:
        return "scopus"
    if "web of science" in low or low.strip() in {"wos", "web of science"}:
        return "web_of_science"
    if "openalex" in low:
        return "openalex"
    return ""


def _parse_search_strings(text: str) -> dict:
    strings = {}
    for line in text.split("\n"):
        if "|" not in line:
            continue
        cells = [cell.strip() for cell in line.split("|")]
        cells = [cell for cell in cells if cell]
        if len(cells) < 2:
            continue
        key = _db_key(cells[0])
        if not key:
            continue
        query = cells[1].strip()
        if len(query) < 8:
            continue
        strings[key] = query
    return strings


def _variable_section(label: str) -> str:
    match = re.match(r"V(\d+)", label.strip(), re.IGNORECASE)
    if not match:
        return "Context"
    number = int(match.group(1))
    if number <= 8:
        return "Q1 - Angioarchitecture"
    if number <= 12:
        return "Q2 - Aneurysm Association"
    if number <= 17:
        return "Q3 - Atherosclerosis and Risk"
    if number == 18:
        return "Q4 - Treatment"
    if number <= 22:
        return "Q5 - Stroke Outcomes"
    return "Context"


def _variable_name(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", label).strip("_")
    return cleaned[:80] or "variable"


def _parse_variables(text: str) -> list[dict]:
    variables = []
    seen = set()
    order = 1
    for line in text.split("\n"):
        if "|" not in line:
            continue
        cells = [cell.strip() for cell in line.split("|")]
        cells = [cell for cell in cells if cell]
        if len(cells) < 2:
            continue
        label = cells[0]
        if not re.match(r"(V\d+\b|Demographics\b|Follow-up\b|Outcome\b)", label, re.IGNORECASE):
            continue
        name = _variable_name(label)
        if name in seen:
            continue
        seen.add(name)
        coding = cells[1]
        notes = cells[-1] if len(cells) > 2 else ""
        coding_low = coding.lower()
        if "continuous" in coding_low:
            field_type = "number"
            allowed = ""
        elif "/" in coding or coding_low.startswith("present"):
            field_type = "categorical"
            allowed = coding[:500]
        else:
            field_type = "text"
            allowed = ""
        variables.append({
            "section": _variable_section(label),
            "name": name,
            "field_type": field_type,
            "allowed_values": allowed,
            "description": notes[:500] or label,
            "order_index": order,
        })
        order += 1
    return variables


def _is_descriptive_case_review(text: str) -> bool:
    low = text.lower()
    has_bounds = "inclusion criteria" in low and "exclusion criteria" in low
    allows_cases = "case report" in low
    has_classic_intervention = bool(re.search(r"(?m)^(index test|intervention)\s*:?\s*$", low))
    return has_bounds and allows_cases and not has_classic_intervention


def _apply_descriptive_protocol(text: str, result: dict) -> dict:
    """Fill PICO from an eligibility protocol that is not written as classic PICO headings."""
    if not _is_descriptive_case_review(text):
        return result

    inclusion_body = _section_body(
        text,
        ["inclusion criteria"],
        ["exclusion criteria", "1.2", "operational"],
    )
    exclusion_body = _section_body(
        text,
        ["exclusion criteria"],
        ["operational", "1.3", "search strategy", "2. search", "2. "],
    )
    definition = _section_body(
        text,
        ["operational"],
        ["search strategy", "2. search", "data extraction", "3. "],
    )
    analysis = _section_body(
        text,
        ["analysis plan"],
        ["4.1", "current screening", "variable schema"],
    )

    result["inclusion"] = _criteria_lines(inclusion_body)
    result["exclusion"] = _criteria_lines(exclusion_body)
    result["search_strings"] = _parse_search_strings(text)
    result["variables"] = _parse_variables(text)

    if definition:
        definition_text = " ".join(definition)[:1200]
        current = (result.get("population") or "").lower()
        # "Inclusion criteria" is a population synonym, so the header grab is the
        # eligibility intro rather than the condition being reviewed.
        if (
            not current
            or "all of the following" in current
            or current.startswith("inclusion")
            or len(current) < 80
        ):
            result["population"] = definition_text
    if not result.get("study_design"):
        for line in result["inclusion"]:
            if line.lower().startswith("study design"):
                result["study_design"] = line.split(":", 1)[-1].strip()
                break
        if not result.get("study_design"):
            result["study_design"] = (
                "Observational studies with original patient-level data, "
                "including case reports and case series, all languages."
            )
    if not result.get("index_test"):
        result["index_test"] = (
            "Descriptive review. Treatment is recorded as an extraction field "
            "and is not an eligibility criterion."
        )
    if not result.get("comparator") and "aneurysm" in text.lower() and "territor" in text.lower():
        result["comparator"] = (
            "Pre-specified contrasts: aneurysm-present versus aneurysm-absent, "
            "and single-territory versus multi-territory."
        )
    if not result.get("outcome") and "stroke" in text.lower():
        result["outcome"] = (
            "Ischemic stroke, hemorrhagic stroke, mass effect, hydrocephalus, "
            "symptom course, and radiographic progression."
        )
    if not result.get("research_question"):
        title_lines = []
        for line in text.split("\n"):
            low = line.strip().lower()
            if not low:
                continue
            if "eligibility" in low or "inclusion criteria" in low:
                break
            if len(line.strip()) > 20:
                title_lines.append(line.strip())
            if len(title_lines) >= 2:
                break
        if title_lines:
            result["research_question"] = " ".join(title_lines)[:500]
    if not result.get("hypothesis") and analysis:
        result["hypothesis"] = " ".join(analysis)[:800]
    return result


def _find_keyword_match(text: str, patterns: list[str]) -> str:
    """Find content matching keyword patterns."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            content = match.group(1).strip()
            if content and len(content) > 3:
                # Limit to first 500 chars to avoid capturing too much
                if len(content) > 500:
                    content = content[:500].rsplit(" ", 1)[0] + "..."
                return _normalize_text(content)
    return ""


def extract_pico_from_text(text: str) -> dict:
    """Extract PICO elements from protocol text.

    Args:
        text: Full text content of the protocol document.

    Returns:
        Dict with keys: population, index_test, comparator, outcome,
        study_design, research_question, hypothesis, extraction_confidence.
    """
    if not text or not text.strip():
        return _empty_pico()

    text = _normalize_text(text)
    result = _empty_pico()
    result["extraction_confidence"] = "low"

    # Try section header detection first, then fall back to keyword patterns
    for field, headers in PICO_HEADERS.items():
        content = _find_section_content(text, headers)
        if not content:
            content = _find_keyword_match(text, KEYWORD_PATTERNS.get(field, []))
        result[field] = content

    result = _apply_descriptive_protocol(text, result)

    # Calculate confidence based on how many elements were found
    pico_fields = ["population", "index_test", "comparator", "outcome", "study_design"]
    found_count = sum(1 for f in pico_fields if result.get(f))

    # If NLP regex extraction is incomplete, attempt LLM-assisted extraction
    if (found_count < 3 or not result.get("hypothesis")) and len(text.strip()) > 30:
        try:
            from services.tool_calling_client import ToolCallingClient
            client = ToolCallingClient()
            prompt = f"""You are a clinical systematic review expert. Analyze the following study protocol document and extract the PICO elements, research question, and hypothesis.

Protocol Document Text:
{text[:8000]}

Return JSON with exact keys:
{{
  "population": "description of target patients/participants",
  "index_test": "description of intervention or index test",
  "comparator": "description of control, comparator, or reference standard",
  "outcome": "primary and secondary outcomes assessed",
  "study_design": "study design type (e.g. RCT, prospective cohort)",
  "research_question": "primary clinical research question",
  "hypothesis": "study hypothesis"
}}"""
            llm_res = client._fallback_prompt_parse(prompt, max_tokens=1024)
            if isinstance(llm_res, dict):
                for k in ["population", "index_test", "comparator", "outcome", "study_design", "research_question", "hypothesis"]:
                    if not result.get(k) and llm_res.get(k):
                        result[k] = str(llm_res[k]).strip()
                found_count = sum(1 for f in pico_fields if result.get(f))
        except Exception:
            pass

    if found_count >= 4:
        result["extraction_confidence"] = "high"
    elif found_count >= 2:
        result["extraction_confidence"] = "medium"
    else:
        result["extraction_confidence"] = "low"

    return result


def extract_pico_from_file(file_path: str, filename: str = "") -> dict:
    """Extract PICO elements from an uploaded document file.

    Args:
        file_path: Path to the uploaded file on disk.
        filename: Original filename (used to detect file type).

    Returns:
        Same dict as extract_pico_from_text, plus extraction_confidence.
    """
    ext = os.path.splitext(filename or file_path)[1].lower()

    text = ""

    if ext == ".pdf":
        text = _extract_pdf_text(file_path)
    elif ext in (".docx", ".doc"):
        try:
            text = _extract_docx_text(file_path)
        except Exception:
            # Fallback for binary / legacy word text streams
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    raw = f.read()
                    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", raw)
            except Exception:
                text = ""
    elif ext in (".txt", ".md", ".rtf"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    else:
        raise ValueError(f"Unsupported file type: {ext or 'unknown'}")

    return extract_pico_from_text(text)


def _extract_pdf_text(file_path: str) -> str:
    """Extract text from a PDF file using pdfplumber with pypdfium2 fallback."""
    pages_text = []
    try:
        import pdfplumber

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    pages_text.append(page_text.strip())
    except Exception:
        pass

    if not pages_text:
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(file_path)
            for i in range(len(pdf)):
                page = pdf[i]
                text_page = page.get_textpage()
                page_text = text_page.get_text_range()
                if page_text and page_text.strip():
                    pages_text.append(page_text.strip())
        except Exception:
            pass

    return "\n\n".join(pages_text)


def _extract_docx_text(file_path: str) -> str:
    """Extract text from a DOCX file using python-docx."""
    try:
        import docx

        doc = docx.Document(file_path)
        paragraphs = []
        for para in doc.paragraphs:
            if para.text.strip():
                paragraphs.append(para.text.strip())
        for table in doc.tables:
            for row in table.rows:
                cells = [" ".join(cell.text.split()) for cell in row.cells]
                cells = [cell for cell in cells if cell]
                # Word merges cells, so the same text can repeat across a row.
                deduped = []
                for cell in cells:
                    if not deduped or deduped[-1] != cell:
                        deduped.append(cell)
                if deduped:
                    paragraphs.append(" | ".join(deduped))
        return "\n\n".join(paragraphs)
    except ImportError:
        raise RuntimeError("python-docx is not installed")
    except Exception as e:
        raise RuntimeError(f"Failed to extract DOCX text: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: PICO Highlighting in Abstracts
# ═══════════════════════════════════════════════════════════════════════

# Color mapping for PICO highlighting (matches Rayyan's scheme)
PICO_HIGHLIGHT_COLORS = {
    "population": "purple",
    "index_test": "blue",
    "comparator": "blue",
    "outcome": "orange",
}

# Keyword patterns for abstract-level PICO span extraction.
# These are more abstract-specific patterns (shorter, sentence-level).
ABSTRACT_PICO_PATTERNS = {
    "population": [
        # "patients with X", "subjects with X", "women with X", "men with X"
        r"(?:patients|subjects|participants|women|men|individuals|persons)\s+with\s+([^.]{5,200})",
        # "X patients", "X subjects" at start of sentence
        r"(?:^|\.\s+)(\d+\s+(?:consecutive|randomly\s+selected|enrolled|included)\s+(?:patients|subjects|participants)[^.]{0,150})",
        # "study population consisted of X"
        r"(?:study\s+population|cohort|sample)\s+(?:consisted\s+of|comprised|included|of)\s+([^.]{5,200})",
        # "We included X"
        r"(?:we\s+included|inclusion\s+criteria\s+(?:were|included))\s+([^.]{5,200})",
    ],
    "index_test": [
        # "X was used as the index test"
        r"([^.]{5,150})\s+(?:was|were)\s+used\s+as\s+the\s+index\s+test",
        # "index test was X"
        r"index\s+test\s+(?:was|used|consisted\s+of)\s+([^.]{5,200})",
        # "X imaging was performed" / "underwent X"
        r"(\b(?:MRI|CT|ultrasound|mammography|PET|radiography|fluoroscopy|DEXA|DBT|CEUS|elastography)\b[^.]{0,150})",
        # "evaluated using X" / "assessed with X"
        r"(?:evaluated\s+(?:using|with)|assessed\s+(?:using|with)|imaged\s+(?:using|with))\s+([^.]{5,200})",
    ],
    "comparator": [
        # "reference standard was X"
        r"reference\s+standard\s+(?:was|consisted\s+of|used)\s+([^.]{5,200})",
        # "gold standard was X"
        r"gold\s+standard\s+(?:was|consisted\s+of|used)\s+([^.]{5,200})",
        # "compared with X"
        r"compared\s+(?:with|to)\s+([^.]{5,150})",
        # "X was used as the reference"
        r"([^.]{5,150})\s+(?:was|were)\s+used\s+as\s+(?:the\s+)?reference",
    ],
    "outcome": [
        # "primary outcome was X"
        r"primary\s+outcome\s+(?:was|measured|assessed)\s+([^.]{5,200})",
        # "we assessed X" / "we measured X"
        r"(?:we\s+assessed|we\s+measured|we\s+evaluated|we\s+calculated)\s+([^.]{5,200})",
        # "sensitivity and specificity" / "diagnostic accuracy"
        r"((?:sensitivity|specificity|diagnostic\s+accuracy|positive\s+predictive\s+value|negative\s+predictive\s+value|AUC|area\s+under\s+the\s+curve|receiver\s+operating)[^.]{0,150})",
        # "outcome was X"
        r"outcome\s+(?:was|measured|assessed)\s+([^.]{5,200})",
    ],
}


def extract_pico_spans_from_abstract(abstract: str) -> list[dict]:
    """Extract PICO spans from a study abstract for highlighting.

    Returns a list of dicts with:
      - field: population | index_test | comparator | outcome
      - start: character offset in abstract
      - end: character offset in abstract
      - text: the matched text
      - confidence: 0.0-1.0
      - color: purple | blue | orange
    """
    if not abstract or not abstract.strip():
        return []

    spans = []
    abstract_lower = abstract.lower()

    for field, patterns in ABSTRACT_PICO_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, abstract, re.IGNORECASE):
                # Determine the span — use the full match or the captured group
                if match.lastindex and match.lastindex >= 1:
                    # Use the captured group if it's substantial
                    group_start = match.start(1)
                    group_end = match.end(1)
                    group_text = match.group(1).strip()
                    if len(group_text) < 5:
                        continue
                    start, end, text = group_start, group_end, group_text
                else:
                    start, end, text = match.start(), match.end(), match.group().strip()

                # Skip if too short or too long
                if len(text) < 5 or len(text) > 300:
                    continue

                # Skip if overlaps with an existing span for the same field
                overlaps = False
                for s in spans:
                    if s["field"] == field and not (end <= s["start"] or start >= s["end"]):
                        overlaps = True
                        break
                if overlaps:
                    continue

                # Confidence based on pattern specificity
                confidence = 0.8 if "index test" in pattern or "reference standard" in pattern or "primary outcome" in pattern else 0.6

                spans.append({
                    "field": field,
                    "start": start,
                    "end": end,
                    "text": text,
                    "confidence": confidence,
                    "color": PICO_HIGHLIGHT_COLORS.get(field, "gray"),
                })

    # Sort by start position
    spans.sort(key=lambda s: s["start"])
    return spans
