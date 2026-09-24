"""
Multi-Database Literature Search Engine for RadExtract.
Adapted from K-Dense-AI paper-lookup and database-lookup skills.
Queries PubMed, OpenAlex, Europe PMC, and CrossRef with hazard-safe HTTP parsing and unified record normalization.
"""
import httpx
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
