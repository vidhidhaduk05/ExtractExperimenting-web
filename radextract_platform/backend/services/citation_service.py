"""Citation generation service: produce citations in 6 standard formats.

Formats supported:
  - Vancouver (ICMJE standard for medical journals)
  - APA (7th edition)
  - MLA (9th edition)
  - Chicago (author-date)
  - Harvard
  - BibTeX (for reference managers)

Author parsing handles both common formats:
  - "Smith J, Doe A" (Vancouver-style, initials after surname)
  - "Smith, John; Doe, Alice" (full names, semicolon-separated)
"""
from __future__ import annotations
import re
from typing import Optional


def parse_authors(authors_str: str) -> list[dict]:
    """Parse an author string into a list of author dicts.

    Returns list of {"surname": str, "initials": str, "full_name": str}
    """
    if not authors_str or not authors_str.strip():
        return []

    # Split on semicolons or commas followed by space + capital (for "Smith J, Doe A" format)
    # First try semicolon separation
    if ";" in authors_str:
        parts = [p.strip() for p in authors_str.split(";") if p.strip()]
    else:
        # Vancouver style: "Smith J, Doe A, Brown C"
        # Split on comma, but group surname + initials
        # Pattern: Surname Initials, Surname Initials, ...
        parts = re.split(r',\s*(?=[A-Z][a-z]+ [A-Z])', authors_str)
        parts = [p.strip() for p in parts if p.strip()]

    authors = []
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Check if it's "Surname, FirstName" format (with internal comma)
        if "," in part and part.count(",") == 1:
            sub = part.split(",", 1)
            surname = sub[0].strip()
            given = sub[1].strip()
            initials = "".join(w[0].upper() + "." for w in given.split() if w)
            authors.append({
                "surname": surname,
                "initials": initials,
                "full_name": f"{given} {surname}",
            })
        else:
            # "Surname Initials" or "Surname Initials." format
            # e.g., "Smith J" or "Smith JA" or "Smith J.A."
            match = re.match(r'^([A-Z][a-z\'-]+)\s+([A-Z](?:\.?[A-Z]*)*)\.?$', part)
            if match:
                surname = match.group(1)
                initials_raw = match.group(2).replace(".", "")
                initials = ". ".join(initials_raw) + "."
                authors.append({
                    "surname": surname,
                    "initials": initials,
                    "full_name": f"{surname} {initials}",
                })
            else:
                # Just use as-is
                words = part.split()
                if len(words) >= 2:
                    surname = words[0]
                    initials = "".join(w[0].upper() + "." for w in words[1:] if w)
                    authors.append({
                        "surname": surname,
                        "initials": initials,
                        "full_name": part,
                    })
                else:
                    authors.append({
                        "surname": part,
                        "initials": "",
                        "full_name": part,
                    })

    return authors


def _format_vancouver(authors: list[dict], n: int = 6) -> str:
    """Format authors in Vancouver style: Smith J, Doe A, et al."""
    if not authors:
        return ""
    if len(authors) <= n:
        parts = []
        for a in authors:
            if a["initials"]:
                parts.append(f"{a['surname']} {a['initials']}")
            else:
                parts.append(a["surname"])
        return ", ".join(parts)
    else:
        parts = []
        for a in authors[:n]:
            if a["initials"]:
                parts.append(f"{a['surname']} {a['initials']}")
            else:
                parts.append(a["surname"])
        return ", ".join(parts) + ", et al"


def _format_apa_authors(authors: list[dict]) -> str:
    """Format authors in APA 7th style: Smith, J., & Doe, A."""
    if not authors:
        return ""
    parts = []
    for a in authors:
        if a["initials"]:
            # Remove spaces from initials for APA: "J." not "J. A."
            initials = a["initials"].replace(" ", "")
            parts.append(f"{a['surname']}, {initials}")
        else:
            parts.append(a["surname"])

    if len(parts) == 1:
        return parts[0]
    elif len(parts) == 2:
        return f"{parts[0]}, & {parts[1]}"
    else:
        return ", ".join(parts[:-1]) + ", & " + parts[-1]


def _format_mla_authors(authors: list[dict]) -> str:
    """Format authors in MLA 9th style: Smith, John, and Alice Doe."""
    if not authors:
        return ""
    if len(authors) == 1:
        a = authors[0]
        return a["full_name"] if a["full_name"] else a["surname"]
    elif len(authors) == 2:
        return f"{authors[0]['full_name']}, and {authors[1]['full_name']}"
    else:
        return f"{authors[0]['full_name']}, et al"


def _format_chicago_authors(authors: list[dict]) -> str:
    """Format authors in Chicago author-date style: Smith, John, and Alice Doe."""
    if not authors:
        return ""
    if len(authors) == 1:
        a = authors[0]
        return a["full_name"] if a["full_name"] else a["surname"]
    elif len(authors) <= 3:
        parts = [a["full_name"] for a in authors]
        return ", ".join(parts[:-1]) + ", and " + parts[-1]
    else:
        return f"{authors[0]['full_name']}, et al"


def _format_harvard_authors(authors: list[dict]) -> str:
    """Format authors in Harvard style: Smith, J. and Doe, A."""
    if not authors:
        return ""
    parts = []
    for a in authors:
        if a["initials"]:
            initials = a["initials"].replace(" ", "")
            parts.append(f"{a['surname']}, {initials}")
        else:
            parts.append(a["surname"])

    if len(parts) == 1:
        return parts[0]
    elif len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    else:
        return ", ".join(parts[:-1]) + ", and " + parts[-1]


def _bibtex_key(authors: list[dict], year: Optional[int]) -> str:
    """Generate a BibTeX citation key."""
    if authors:
        key = re.sub(r'[^a-zA-Z]', '', authors[0]["surname"].lower())
    else:
        key = "anon"
    year_str = str(year) if year else "nd"
    return f"{key}{year_str}"


def generate_citation(study_data: dict, fmt: str) -> str:
    """Generate a single citation in the specified format.

    Args:
        study_data: dict with keys: authors, title, journal, publication_year,
                    doi, pmid, volume, issue, pages
        fmt: one of vancouver, apa, mla, chicago, harvard, bibtex
    """
    fmt = fmt.lower().strip()
    authors = parse_authors(study_data.get("authors", ""))
    title = study_data.get("title", "")
    journal = study_data.get("journal", "")
    year = study_data.get("publication_year")
    doi = study_data.get("doi", "")
    volume = study_data.get("volume", "")
    issue = study_data.get("issue", "")
    pages = study_data.get("pages", "")

    if fmt == "vancouver":
        auth_str = _format_vancouver(authors)
        parts = []
        if auth_str:
            parts.append(auth_str)
        if title:
            parts.append(title)
        if journal:
            parts.append(journal)
        if year:
            parts.append(str(year))
        vol_issue = ""
        if volume:
            vol_issue = volume
            if issue:
                vol_issue += f"({issue})"
        if pages:
            vol_issue += f":{pages}" if vol_issue else pages
        if vol_issue:
            parts.append(vol_issue)
        citation = ". ".join(parts) + "."
        if doi:
            citation += f" doi: {doi}"
        return citation

    elif fmt == "apa":
        auth_str = _format_apa_authors(authors)
        parts = []
        if auth_str:
            parts.append(auth_str)
        if year:
            parts.append(f"({year})")
        if title:
            parts.append(title)
        if journal:
            journal_part = journal
            if volume:
                journal_part += f", {volume}"
                if issue:
                    journal_part += f"({issue})"
            if pages:
                journal_part += f", {pages}"
            parts.append(journal_part + ".")
        citation = ". ".join(parts)
        if doi:
            citation += f" https://doi.org/{doi}"
        return citation

    elif fmt == "mla":
        auth_str = _format_mla_authors(authors)
        parts = []
        if auth_str:
            parts.append(auth_str)
        if title:
            parts.append(f'"{title}."')
        if journal:
            journal_part = journal
            if volume:
                journal_part += f", vol. {volume}"
            if issue:
                journal_part += f", no. {issue}"
            if year:
                journal_part += f", {year}"
            if pages:
                journal_part += f", pp. {pages}"
            parts.append(journal_part + ".")
        citation = ". ".join(parts)
        if doi:
            citation += f" {doi}"
        return citation

    elif fmt == "chicago":
        auth_str = _format_chicago_authors(authors)
        parts = []
        if auth_str:
            parts.append(auth_str)
        if title:
            parts.append(f'"{title}."')
        if journal:
            journal_part = journal
            if volume:
                journal_part += f" {volume}"
            if issue:
                journal_part += f", no. {issue}"
            if year:
                journal_part += f" ({year})"
            if pages:
                journal_part += f": {pages}"
            parts.append(journal_part + ".")
        citation = ". ".join(parts)
        if doi:
            citation += f" https://doi.org/{doi}"
        return citation

    elif fmt == "harvard":
        auth_str = _format_harvard_authors(authors)
        parts = []
        if auth_str:
            parts.append(auth_str)
        if year:
            parts.append(f"({year})")
        if title:
            parts.append(f"'{title}',")
        if journal:
            journal_part = journal
            if volume:
                journal_part += f", {volume}"
                if issue:
                    journal_part += f"({issue})"
            if pages:
                journal_part += f", pp. {pages}"
            parts.append(journal_part + ".")
        citation = " ".join(parts)
        if doi:
            citation += f" Available at: https://doi.org/{doi}"
        return citation

    elif fmt == "bibtex":
        key = _bibtex_key(authors, year)
        lines = [f"@article{{{key},"]
        if authors:
            # BibTeX format: "Surname, Given and Surname, Given"
            bib_authors = " and ".join(a["full_name"] for a in authors)
            lines.append(f"  author = {{{bib_authors}}},")
        if title:
            lines.append(f"  title = {{{{{title}}}}},")
        if journal:
            lines.append(f"  journal = {{{journal}}},")
        if year:
            lines.append(f"  year = {{{year}}},")
        if volume:
            lines.append(f"  volume = {{{volume}}},")
        if issue:
            lines.append(f"  number = {{{issue}}},")
        if pages:
            lines.append(f"  pages = {{{pages}}},")
        if doi:
            lines.append(f"  doi = {{{doi}}},")
        if study_data.get("pmid"):
            lines.append(f"  pmid = {{{study_data['pmid']}}},")
        lines.append("}")
        return "\n".join(lines)

    else:
        raise ValueError(f"Unknown citation format: {fmt}. Use vancouver, apa, mla, chicago, harvard, or bibtex.")


def generate_citations(study_data: dict) -> dict[str, str]:
    """Generate citations in all 6 formats.

    Returns:
        {"vancouver": str, "apa": str, "mla": str, "chicago": str, "harvard": str, "bibtex": str}
    """
    formats = ["vancouver", "apa", "mla", "chicago", "harvard", "bibtex"]
    return {fmt: generate_citation(study_data, fmt) for fmt in formats}


def study_to_bibtex(study: dict) -> str:
    """Convert study metadata into a clean, standard BibTeX entry."""
    title = study.get("title", "Untitled Study")
    authors = study.get("authors", "Anonymous")
    if isinstance(authors, list):
        authors_str = " and ".join(authors)
    else:
        authors_str = str(authors or "Anonymous")

    year = str(study.get("year", study.get("publication_year", "2024")))
    journal = study.get("journal", study.get("venue", "Journal Article"))
    doi = study.get("doi", "")
    pmid = study.get("pmid", "")
    study_id = study.get("study_id", "study")

    # Generate clean citekey
    first_author = re.sub(r"[^a-zA-Z]", "", authors_str.split(" ")[0].split(",")[0])
    citekey = f"{first_author}{year}_{study_id[:6]}" if first_author else f"ref_{study_id[:6]}"

    bib = [
        f"@article{{{citekey},",
        f"  title = {{{title}}},",
        f"  author = {{{authors_str}}},",
        f"  journal = {{{journal}}},",
        f"  year = {{{year}}},",
    ]
    if doi:
        bib.append(f"  doi = {{{doi}}},")
    if pmid:
        bib.append(f"  pmid = {{{pmid}}},")
    bib.append("}")
    return "\n".join(bib)


def study_to_ris(study: dict) -> str:
    """Convert study metadata into RIS format for EndNote / Zotero."""
    title = study.get("title", "Untitled")
    authors = study.get("authors", [])
    if isinstance(authors, str):
        authors = [a.strip() for a in authors.split(";") if a.strip()]

    year = str(study.get("year", study.get("publication_year", "2024")))
    journal = study.get("journal", "")
    doi = study.get("doi", "")

    ris = ["TY  - JOUR", f"TI  - {title}"]
    for a in authors:
        ris.append(f"AU  - {a}")
    if journal:
        ris.append(f"JO  - {journal}")
    ris.append(f"PY  - {year}")
    if doi:
        ris.append(f"DO  - {doi}")
    ris.append("ER  - ")
    return "\n".join(ris)


def generate_formatted_bibliography(studies: list[dict], style: str = "APA") -> str:
    """Format study list into APA / Vancouver / Nature formatted text."""
    entries = []
    for i, s in enumerate(studies):
        title = s.get("title", "Untitled")
        authors = s.get("authors", "Author(s)")
        if isinstance(authors, list):
            authors = ", ".join(authors)
        year = s.get("year", s.get("publication_year", "2024"))
        journal = s.get("journal", "")
        doi = s.get("doi", "")
        doi_str = f" https://doi.org/{doi}" if doi else ""

        if style.upper() == "VANCOUVER":
            entries.append(f"{i+1}. {authors}. {title}. {journal}. {year}.{doi_str}")
        elif style.upper() == "NATURE":
            entries.append(f"{i+1}. {authors} {title}. <i>{journal}</i> ({year}).{doi_str}")
        else:  # Default APA 7th
            entries.append(f"{authors} ({year}). {title}. <i>{journal}</i>.{doi_str}")

    return "\n\n".join(entries)

