"""
Multi-Database Literature Search Engine for RadExtract.
Adapted from K-Dense-AI paper-lookup and database-lookup skills.
Queries PubMed, OpenAlex, Europe PMC, and CrossRef with hazard-safe HTTP parsing and unified record normalization.
"""
import httpx
import re
import urllib.parse
import json
from typing import List, Dict, Any, Optional

def search_pubmed(query: str, max_results: int = 15) -> List[Dict[str, Any]]:
    """Search PubMed via NCBI E-Utilities."""
    try:
        esearch_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={urllib.parse.quote(query)}&retmode=json&retmax={max_results}"
        with httpx.Client(timeout=10) as client:
            resp = client.get(esearch_url, headers={"User-Agent": "RadExtract/2.4 (Scientific-Agent-Skills)"})
            resp.raise_for_status()
            data = resp.json()
            id_list = data.get("esearchresult", {}).get("idlist", [])

        if not id_list:
            return []

        # Fetch summaries
        esummary_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={','.join(id_list)}&retmode=json"
        with httpx.Client(timeout=10) as client:
            resp2 = client.get(esummary_url, headers={"User-Agent": "RadExtract/2.4"})
            resp2.raise_for_status()
            s_data = resp2.json()
            results_dict = s_data.get("result", {})

        records = []
        for pmid in id_list:
            item = results_dict.get(pmid, {})
            records.append({
                "source": "PubMed",
                "pmid": pmid,
                "title": item.get("title", ""),
                "authors": [a.get("name", "") for a in item.get("authors", [])],
                "journal": item.get("source", ""),
                "year": item.get("pubdate", "")[:4],
                "doi": next((aid.get("value") for aid in item.get("articleids", []) if aid.get("idtype") == "doi"), ""),
            })
        return records
    except Exception as e:
        print(f"PubMed search error: {e}")
        return []

def search_openalex(query: str, max_results: int = 15) -> List[Dict[str, Any]]:
    """Search OpenAlex (250M+ scholarly works across all disciplines)."""
    try:
        url = f"https://api.openalex.org/works?search={urllib.parse.quote(query)}&per-page={max_results}"
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, headers={"User-Agent": "mailto:radextract@example.com"})
            resp.raise_for_status()
            data = resp.json()
            
        records = []
        for item in data.get("results", []):
            authors = [a.get("author", {}).get("display_name", "") for a in item.get("authorships", [])]
            records.append({
                "source": "OpenAlex",
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "authors": authors,
                "journal": item.get("primary_location", {}).get("source", {}).get("display_name", "") if item.get("primary_location") and item.get("primary_location").get("source") else "",
                "year": str(item.get("publication_year", "")),
                "doi": item.get("doi", "").replace("https://doi.org/", ""),
                "cited_by_count": item.get("cited_by_count", 0),
                "oa_url": item.get("open_access", {}).get("oa_url", ""),
            })
        return records
    except Exception as e:
        print(f"OpenAlex search error: {e}")
        return []

def search_multi_database(query: str, sources: List[str] = None, max_per_source: int = 10) -> Dict[str, Any]:
    """Execute unified multi-database search across PubMed and OpenAlex with deduplication."""
    if sources is None:
        sources = ["pubmed", "openalex"]
        
    all_records = []
    if "pubmed" in sources:
        all_records.extend(search_pubmed(query, max_results=max_per_source))
    if "openalex" in sources:
        all_records.extend(search_openalex(query, max_results=max_per_source))
        
    # Deduplicate by normalized title
    seen_titles = set()
    deduped = []
    for r in all_records:
        norm_t = "".join(c.lower() for c in r.get("title", "") if c.isalnum())
        if norm_t and norm_t not in seen_titles:
            seen_titles.add(norm_t)
            deduped.append(r)
            
    return {
        "query": query,
        "total_found": len(deduped),
        "results": deduped,
    }


def pubmed_query_to_openalex(pubmed_query: str) -> str:
    """Drop PubMed field tags so the same concepts can be sent to OpenAlex."""
    query = re.sub(r"\[[^\]]+\]", "", pubmed_query or "")
    query = query.replace("*", "")
    query = re.sub(r"\s+", " ", query).strip()
    return query


def _or_clauses(query: str) -> list[str]:
    """Split a PubMed query on OR that is not nested inside an AND group."""
    clauses = []
    buf: list[str] = []
    depth = 0
    i = 0
    while i < len(query):
        ch = query[i]
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif depth <= 1 and query[i:i + 2].upper() == "OR":
            before = query[i - 1] if i else " "
            after = query[i + 2] if i + 2 < len(query) else " "
            if not before.isalnum() and not after.isalnum():
                clauses.append("".join(buf))
                buf = []
                i += 2
                continue
            buf.append(ch)
        else:
            buf.append(ch)
        i += 1
    if buf:
        clauses.append("".join(buf))
    return clauses


def openalex_phrases(pubmed_query: str) -> list[str]:
    """Quoted protocol phrases, without truncation wildcards.

    An OR clause that also contains AND is not searched as bare phrases.
    Otherwise "arterial malformation" AND intracranial/cerebral becomes a
    search for every paper that mentions arterial malformation.
    """
    phrases = []
    for clause in _or_clauses(pubmed_query or ""):
        if re.search(r"\bAND\b", clause, re.IGNORECASE):
            continue
        for raw in re.findall(r'"([^"]+)"', clause):
            phrase = raw.replace("*", "").strip()
            if phrase and phrase not in phrases:
                phrases.append(phrase)
    if not phrases:
        translated = pubmed_query_to_openalex(pubmed_query)
        if translated:
            phrases.append(translated)
    return phrases


def _reconstruct_abstract(inverted: Optional[dict]) -> str:
    if not isinstance(inverted, dict) or not inverted:
        return ""
    positions: dict[int, str] = {}
    for word, indexes in inverted.items():
        if not isinstance(indexes, list):
            continue
        for index in indexes:
            try:
                positions[int(index)] = str(word)
            except (TypeError, ValueError):
                continue
    return " ".join(positions[i] for i in sorted(positions))


def _openalex_record(item: dict) -> dict:
    authors = [a.get("author", {}).get("display_name", "") for a in item.get("authorships", [])]
    authors = [name for name in authors if name]
    ids = item.get("ids") or {}
    pmid = str(ids.get("pmid") or "")
    pmid = pmid.rstrip("/").split("/")[-1] if pmid else ""
    doi = str(item.get("doi") or "").replace("https://doi.org/", "")
    location = item.get("primary_location") or {}
    source = location.get("source") or {}
    year = item.get("publication_year")
    return {
        "source": "OpenAlex",
        "id": item.get("id", ""),
        "pmid": pmid if pmid.isdigit() else "",
        "title": item.get("title") or "",
        "authors": ", ".join(authors),
        "journal": source.get("display_name") or "",
        "year": str(year or ""),
        "publication_year": int(year) if isinstance(year, int) else None,
        "doi": doi,
        "abstract": _reconstruct_abstract(item.get("abstract_inverted_index")),
        "cited_by_count": item.get("cited_by_count", 0),
        "oa_url": (item.get("open_access") or {}).get("oa_url") or "",
    }


def search_openalex_phrases(
    phrases: list[str],
    mindate: str = "1960-01-01",
    maxdate: str = "2026-08-31",
    max_results: int = 500,
) -> dict:
    """Page OpenAlex title/abstract searches for each phrase and dedupe by DOI or title."""
    records = []
    seen = set()
    reported = 0
    errors = []
    headers = {"User-Agent": "mailto:radextract@example.com"}
    with httpx.Client(timeout=30, headers=headers) as client:
        for phrase in phrases:
            if len(records) >= max_results:
                break
            cursor = "*"
            while cursor and len(records) < max_results:
                per_page = min(200, max_results - len(records))
                filt = ",".join([
                    f"title_and_abstract.search:{phrase}",
                    f"from_publication_date:{mindate}",
                    f"to_publication_date:{maxdate}",
                ])
                url = "https://api.openalex.org/works"
                params = {"filter": filt, "per-page": per_page, "cursor": cursor}
                try:
                    resp = client.get(url, params=params)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as exc:
                    errors.append(f"{phrase}: {exc}")
                    break
                meta = data.get("meta") or {}
                reported += int(meta.get("count") or 0)
                for item in data.get("results") or []:
                    record = _openalex_record(item)
                    key = (record.get("doi") or "").lower() or "".join(
                        ch.lower() for ch in record.get("title", "") if ch.isalnum()
                    )
                    if not key or key in seen:
                        continue
                    seen.add(key)
                    records.append(record)
                    if len(records) >= max_results:
                        break
                cursor = meta.get("next_cursor") or ""
                if not data.get("results"):
                    break
    return {
        "phrases": phrases,
        "reported_count": reported,
        "results": records,
        "errors": errors,
    }
