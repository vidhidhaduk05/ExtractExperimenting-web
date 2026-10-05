#!/usr/bin/env python3
"""
Literature Database Search, Deduplication, and Normalization Script.
Processes normalized search records, removes duplicates across databases, and outputs Markdown/BibTeX/JSON.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote
from typing import Dict, List, Set, Any
from datetime import datetime


def normalize_doi(value: str) -> str:
    """Normalize a bare DOI or doi.org URL."""
    if not value:
        return ""
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value.strip(), flags=re.I)
    return unquote(value).lower().rstrip(".,;:")


def normalize_title(title: str) -> str:
    """Normalize title for fuzzy matching."""
    if not title:
        return ""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def deduplicate_records(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    4-Tier Deduplication waterfall:
      1. Clean DOI match
      2. Unique database ID (PMID, arXiv ID)
      3. Exact title match
      4. Normalized title + First Author + Year
    """
    seen_dois: Set[str] = set()
    seen_pmids: Set[str] = set()
    seen_arxiv: Set[str] = set()
    seen_titles: Set[str] = set()
    seen_composite: Set[str] = set()

    unique_records: List[Dict[str, Any]] = []
    duplicates_removed = 0

    for rec in records:
        doi = normalize_doi(rec.get("doi", ""))
        pmid = str(rec.get("pmid", "")).strip()
        arxiv = str(rec.get("arxiv_id", "")).strip()
        title = rec.get("title", "").strip().lower()
        norm_title = normalize_title(title)
        first_author = (rec.get("authors", [""])[0] if isinstance(rec.get("authors"), list) else rec.get("authors", "")).split()[0].lower()
        year = str(rec.get("year", ""))

        is_dup = False

        if doi and doi in seen_dois:
            is_dup = True
        elif pmid and pmid in seen_pmids:
            is_dup = True
        elif arxiv and arxiv in seen_arxiv:
            is_dup = True
        elif title and title in seen_titles:
            is_dup = True
        elif norm_title and f"{norm_title}_{first_author}_{year}" in seen_composite:
            is_dup = True

        if is_dup:
            duplicates_removed += 1
            continue

        if doi:
            seen_dois.add(doi)
        if pmid:
            seen_pmids.add(pmid)
        if arxiv:
            seen_arxiv.add(arxiv)
        if title:
            seen_titles.add(title)
        if norm_title:
            seen_composite.add(f"{norm_title}_{first_author}_{year}")

        unique_records.append(rec)

    return unique_records, duplicates_removed


def format_search_results(results: List[Dict[str, Any]], output_format: str = 'markdown') -> str:
    """Format search results for output (markdown, json, or bibtex)."""
    if output_format == 'json':
        return json.dumps(results, indent=2)

    elif output_format == 'markdown':
        md = f"# Systematic Literature Search Results\n\n"
        md += f"- **Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
        md += f"- **Total Unique Records**: {len(results)}\n\n"

        for i, res in enumerate(results, 1):
            md += f"### {i}. {res.get('title', 'Untitled')}\n\n"
            authors = ", ".join(res.get('authors', [])) if isinstance(res.get('authors'), list) else res.get('authors', 'Unknown')
            md += f"- **Authors**: {authors}\n"
            md += f"- **Year**: {res.get('year', 'N/A')}\n"
            md += f"- **Source/Journal**: {res.get('journal') or res.get('source', 'Unknown')}\n"
            if res.get('doi'):
                md += f"- **DOI**: [{res['doi']}](https://doi.org/{normalize_doi(res['doi'])})\n"
            if res.get('pmid'):
                md += f"- **PMID**: [{res['pmid']}](https://pubmed.ncbi.nlm.nih.gov/{res['pmid']}/)\n"
            if res.get('abstract'):
                md += f"\n> **Abstract**: {res['abstract']}\n"
            md += "\n---\n\n"
        return md

    elif output_format == 'bibtex':
        bib = []
        for i, res in enumerate(results, 1):
            first_author = (res.get("authors", ["Unknown"])[0] if isinstance(res.get("authors"), list) else "Unknown").split()[-1]
            first_author_clean = re.sub(r'[^a-zA-Z]', '', first_author)
            year = res.get("year", "2024")
            key = f"{first_author_clean}{year}_{i}"
            bib.append(f"@article{{{key},")
            bib.append(f"  title = {{{res.get('title', '')}}},")
            bib.append(f"  author = {{{', '.join(res.get('authors', [])) if isinstance(res.get('authors'), list) else res.get('authors', '')}}},")
            bib.append(f"  year = {{{year}}},")
            if res.get('journal'):
                bib.append(f"  journal = {{{res['journal']}}},")
            if res.get('doi'):
                bib.append(f"  doi = {{{res['doi']}}},")
            bib.append("}\n")
        return "\n".join(bib)

    return ""


def main():
    parser = argparse.ArgumentParser(description="Deduplicate and format literature search results.")
    parser.add_argument("input_file", help="Path to input JSON file containing search records array")
    parser.add_argument("--deduplicate", action="store_true", default=True, help="Perform 4-tier deduplication")
    parser.add_argument("--format", choices=["markdown", "json", "bibtex"], default="markdown", help="Output format")
    parser.add_argument("--output", "-o", help="Output file path (default: stdout)")
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file {args.input_file} not found.", file=sys.stderr)
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = data if isinstance(data, list) else data.get("records", [])

    if args.deduplicate:
        records, num_dups = deduplicate_records(records)
        print(f"Deduplication complete: {num_dups} duplicates removed, {len(records)} unique records retained.", file=sys.stderr)

    formatted = format_search_results(records, output_format=args.format)

    if args.output:
        Path(args.output).write_text(formatted, encoding="utf-8")
        print(f"Wrote output to {args.output}", file=sys.stderr)
    else:
        print(formatted)


if __name__ == "__main__":
    main()
