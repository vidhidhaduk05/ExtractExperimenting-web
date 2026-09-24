"""Reference export service: export studies to reference manager formats.

Generates RIS, BibTeX, and EndNote XML files from study records.
Used for exporting included studies to reference managers like
EndNote, Zotero, Mendeley, etc.
"""
from __future__ import annotations

import html
import re
from typing import Optional


def _escape_bibtex(text: str) -> str:
    """Escape special characters for BibTeX."""
    if not text:
        return ""
    text = text.replace("&", r"\&")
    text = text.replace("%", r"\%")
    text = text.replace("_", r"\_")
    text = text.replace("#", r"\#")
    text = text.replace("{", r"\{")
    text = text.replace("}", r"\}")
    return text


def _make_bibtex_key(title: str, year: Optional[int], index: int) -> str:
    """Generate a BibTeX citation key from title and year."""
    # Take first significant word from title
    words = re.findall(r"[a-zA-Z]+", title or "")
    first_word = words[0].lower() if words else "ref"
    return f"{first_word}{year or 'nd'}{index}"


def export_ris(studies: list[dict]) -> str:
    """Export studies as RIS format string.

    Args:
        studies: List of study dicts with keys: title, authors, journal,
                 publication_year, doi, pmid, abstract, etc.

    Returns:
        RIS format string ready for download.
    """
    lines = []

    for study in studies:
        lines.append("TY  - JOUR")

        # Title
        if study.get("title"):
            lines.append(f"TI  - {study['title']}")

        # Authors — split on comma and add each as AU
        authors = study.get("authors", "")
        if authors:
            for author in [a.strip() for a in authors.split(",") if a.strip()]:
                lines.append(f"AU  - {author}")

        # Journal
        if study.get("journal"):
            lines.append(f"JO  - {study['journal']}")

        # Year
        if study.get("publication_year"):
            lines.append(f"PY  - {study['publication_year']}")

        # DOI
        if study.get("doi"):
            lines.append(f"DO  - {study['doi']}")

        # PMID
        if study.get("pmid"):
            lines.append(f"ID  - {study['pmid']}")

        # Abstract
        if study.get("abstract"):
            lines.append(f"AB  - {study['abstract']}")

        # Volume
        if study.get("volume"):
            lines.append(f"VL  - {study['volume']}")

        # Issue
        if study.get("issue"):
            lines.append(f"IS  - {study['issue']}")

        # Start page
        if study.get("start_page"):
            lines.append(f"SP  - {study['start_page']}")

        # End page
        if study.get("end_page"):
            lines.append(f"EP  - {study['end_page']}")

        # Language
        if study.get("language"):
            lines.append(f"LA  - {study['language']}")

        lines.append("ER  - ")
        lines.append("")  # blank line between records

    return "\n".join(lines)


def export_bibtex(studies: list[dict]) -> str:
    """Export studies as BibTeX format string.

    Args:
        studies: List of study dicts with keys: title, authors, journal,
                 publication_year, doi, pmid, abstract, etc.

    Returns:
        BibTeX format string ready for download.
    """
    entries = []

    for i, study in enumerate(studies, 1):
        key = _make_bibtex_key(study.get("title", ""), study.get("publication_year"), i)
        lines = [f"@article{{{key},"]

        # Authors — BibTeX uses "and" separator
        authors = study.get("authors", "")
        if authors:
            # Convert comma-separated to "and" separated
            author_list = [a.strip() for a in authors.split(",") if a.strip()]
            # Pair consecutive entries (LastName, FirstName → "FirstName LastName")
            paired = []
            j = 0
            while j < len(author_list):
                if j + 1 < len(author_list) and "," not in author_list[j + 1]:
                    paired.append(f"{author_list[j]} {author_list[j + 1]}")
                    j += 2
                else:
                    paired.append(author_list[j])
                    j += 1
            bib_authors = " and ".join(paired)
            lines.append(f"  author = {{{_escape_bibtex(bib_authors)}}},")

        if study.get("title"):
            lines.append(f"  title = {{{_escape_bibtex(study['title'])}}},")

        if study.get("journal"):
            lines.append(f"  journal = {{{_escape_bibtex(study['journal'])}}},")

        if study.get("publication_year"):
            lines.append(f"  year = {{{study['publication_year']}}},")

        if study.get("doi"):
            lines.append(f"  doi = {{{study['doi']}}},")

        if study.get("abstract"):
            lines.append(f"  abstract = {{{_escape_bibtex(study['abstract'])}}},")

        if study.get("volume"):
            lines.append(f"  volume = {{{study['volume']}}},")

        if study.get("issue"):
            lines.append(f"  number = {{{study['issue']}}},")

        if study.get("start_page"):
            pages = study["start_page"]
            if study.get("end_page"):
                pages = f"{study['start_page']}--{study['end_page']}"
            lines.append(f"  pages = {{{pages}}},")

        if study.get("pmid"):
            lines.append(f"  pmid = {{{study['pmid']}}},")

        # Remove trailing comma from last field
        if lines[-1].endswith(","):
            lines[-1] = lines[-1][:-1]

        lines.append("}")
        entries.append("\n".join(lines))

    return "\n\n".join(entries)


def export_endnote_xml(studies: list[dict]) -> str:
    """Export studies as EndNote XML format string.

    Args:
        studies: List of study dicts with keys: title, authors, journal,
                 publication_year, doi, pmid, abstract, etc.

    Returns:
        EndNote XML format string ready for download.
    """
    records = []

    for study in studies:
        rec_lines = ["  <record>"]

        # Title
        if study.get("title"):
            rec_lines.append(f"    <title><style face=\"normal\" font=\"default\" size=\"100%\">{html.escape(study['title'])}</style></title>")

        # Authors
        authors = study.get("authors", "")
        if authors:
            for author in [a.strip() for a in authors.split(",") if a.strip()]:
                rec_lines.append(f"    <author><style face=\"normal\" font=\"default\" size=\"100%\">{html.escape(author)}</style></author>")

        # Journal / periodical
        if study.get("journal"):
            rec_lines.append(f"    <periodical><style face=\"italic\" font=\"default\" size=\"100%\">{html.escape(study['journal'])}</style></periodical>")

        # Year
        if study.get("publication_year"):
            rec_lines.append(f"    <year><style face=\"normal\" font=\"default\" size=\"100%\">{study['publication_year']}</style></year>")

        # DOI
        if study.get("doi"):
            rec_lines.append(f"    <electronic-resource-num><style face=\"normal\" font=\"default\" size=\"100%\">{html.escape(study['doi'])}</style></electronic-resource-num>")

        # Abstract
        if study.get("abstract"):
            rec_lines.append(f"    <abstract><style face=\"normal\" font=\"default\" size=\"100%\">{html.escape(study['abstract'])}</style></abstract>")

        # PMID
        if study.get("pmid"):
            rec_lines.append(f"    <accession-num><style face=\"normal\" font=\"default\" size=\"100%\">{study['pmid']}</style></accession-num>")

        # Volume
        if study.get("volume"):
            rec_lines.append(f"    <volume><style face=\"normal\" font=\"default\" size=\"100%\">{study['volume']}</style></volume>")

        # Pages
        if study.get("start_page"):
            pages = study["start_page"]
            if study.get("end_page"):
                pages = f"{study['start_page']}-{study['end_page']}"
            rec_lines.append(f"    <pages><style face=\"normal\" font=\"default\" size=\"100%\">{pages}</style></pages>")

        rec_lines.append("  </record>")
        records.append("\n".join(rec_lines))

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<records>\n'
    xml += "\n".join(records)
    xml += '\n</records>'

    return xml
