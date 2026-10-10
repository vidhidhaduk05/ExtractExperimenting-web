"""PubMed integration service: fetch study metadata and full text via NCBI E-utilities.

Uses:
  - NCBI E-utilities (esummary, efetch, esearch) for metadata and abstracts
  - PMC Open Access for full-text retrieval when available
  - Unpaywall API (api.unpaywall.org) as a fallback for open-access full text

API key is optional but increases rate limits from 3 to 10 requests/second.
"""
from __future__ import annotations
import time
import xml.etree.ElementTree as ET
from typing import Optional
from urllib.parse import quote

import requests

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
UNPAYWALL_BASE = "https://api.unpaywall.org/v2"
PMC_BASE = "https://www.ncbi.nlm.nih.gov/pmc/articles"

# ── Rate limiting ──
# NCBI allows 3 requests/second without API key, 10/sec with key.
# We track the last request time and sleep if needed.
_last_request_time: float = 0.0


def _rate_limit(api_key: str = ""):
    """Enforce NCBI rate limits: 3/sec without key, 10/sec with key."""
    global _last_request_time
    min_interval = 0.12 if api_key else 0.35  # 10/sec with key, ~3/sec without
    elapsed = time.time() - _last_request_time
    if elapsed < min_interval:
        time.sleep(min_interval - elapsed)
    _last_request_time = time.time()


def _eutils_get(url: str, api_key: str = "", timeout: int = 15, retries: int = 2) -> requests.Response:
    """Make a rate-limited GET request to NCBI E-utilities with retry on 429."""
    for attempt in range(retries + 1):
        _rate_limit(api_key)
        resp = requests.get(url, timeout=timeout)
        if resp.status_code == 429:
            if attempt < retries:
                wait = 1.0 * (attempt + 1)
                time.sleep(wait)
                continue
        resp.raise_for_status()
        return resp
    return resp  # unreachable but satisfies type checker


def _eutils_url(endpoint: str, params: dict, api_key: str = "") -> str:
    """Build an E-utilities URL with optional API key."""
    params = dict(params)
    params.setdefault("retmode", "xml")
    if api_key:
        params["api_key"] = api_key
    query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    return f"{EUTILS_BASE}/{endpoint}?{query}"


def _parse_abstract_from_efetch(xml_text: str) -> dict[str, str]:
    """Parse abstracts from efetch XML. Returns {pmid: abstract_text}."""
    abstracts = {}
    try:
        root = ET.fromstring(xml_text)
        for article_elem in root.findall(".//PubmedArticle"):
            pmid_elem = article_elem.find(".//PMID")
            if pmid_elem is None or not pmid_elem.text:
                continue
            pmid = pmid_elem.text.strip()
            abstract_parts = []
            for abstract_elem in article_elem.findall(".//Abstract"):
                for text_elem in abstract_elem.findall(".//AbstractText"):
                    label = text_elem.get("Label", "")
                    text = "".join(text_elem.itertext()).strip()
                    if label:
                        abstract_parts.append(f"{label}: {text}")
                    else:
                        abstract_parts.append(text)
            if abstract_parts:
                abstracts[pmid] = " ".join(abstract_parts)
    except ET.ParseError:
        pass
    return abstracts


def _parse_study_design(pub_types: list) -> str:
    """Parse study design from publication type list."""
    for pt in pub_types:
        pt_lower = pt.lower()
        if "randomized" in pt_lower:
            return "randomized controlled trial"
        elif "meta-analysis" in pt_lower:
            return "meta-analysis"
        elif "systematic review" in pt_lower or "review" in pt_lower:
            return "systematic review"
        elif "cohort" in pt_lower:
            return "cohort study"
        elif "case-control" in pt_lower:
            return "case-control study"
        elif "cross-sectional" in pt_lower:
            return "cross-sectional study"
        elif "clinical trial" in pt_lower:
            return "clinical trial"
    if pub_types:
        return pub_types[0].lower()
    return ""


def _parse_article_metadata(article: dict) -> dict:
    """Parse a single article from esummary JSON into our standard format."""
    authors_list = article.get("authors", [])
    author_names = [a.get("name", "") for a in authors_list if a.get("name")]
    authors_str = ", ".join(author_names)

    pubdate = article.get("pubdate", "")
    year = int(pubdate[:4]) if pubdate[:4].isdigit() else None

    doi = ""
    for aid in article.get("articleids", []):
        if aid.get("idtype") == "doi":
            doi = aid.get("value", "")
            break

    return {
        "title": article.get("title", ""),
        "authors": authors_str,
        "journal": article.get("fulljournalname", "") or article.get("source", ""),
        "publication_year": year,
        "doi": doi,
        "study_design": _parse_study_design(article.get("pubtype", [])),
    }


def fetch_by_pmid(pmid: str, api_key: str = "") -> dict:
    """Fetch study metadata by PMID via NCBI E-utilities.

    Returns a dict with: title, authors, journal, publication_year, doi, pmid, abstract
    """
    # 1. Fetch summary (metadata)
    summary_url = _eutils_url("esummary.fcgi", {
        "db": "pubmed",
        "id": pmid,
        "retmode": "json",
    }, api_key)

    resp = _eutils_get(summary_url, api_key, timeout=15)
    data = resp.json()

    result = data.get("result", {})
    if str(pmid) not in result:
        raise ValueError(f"PMID {pmid} not found in PubMed")

    article = result[str(pmid)]
    if article.get("error"):
        raise ValueError(f"PubMed error for PMID {pmid}: {article['error']}")

    metadata = _parse_article_metadata(article)

    # 2. Fetch abstract via efetch
    abstract = ""
    try:
        efetch_url = _eutils_url("efetch.fcgi", {
            "db": "pubmed",
            "id": pmid,
            "rettype": "abstract",
            "retmode": "xml",
        }, api_key)

        resp2 = _eutils_get(efetch_url, api_key, timeout=15)
        if resp2.status_code == 200:
            abstracts = _parse_abstract_from_efetch(resp2.text)
            abstract = abstracts.get(str(pmid), "")
    except Exception:
        pass  # Abstract fetch is non-fatal

    return {
        **metadata,
        "pmid": str(pmid),
        "abstract": abstract,
        "source": "PubMed",
    }


def fetch_fulltext(pmid: str, api_key: str = "", email: str = "radextract@noreply.com") -> dict:
    """Attempt to retrieve full-text for a PMID.

    Tries:
      1. PMC Open Access via E-utilities (efetch with db=pmc)
      2. Unpaywall API (if DOI is available)

    Returns:
        {"pmid": str, "has_fulltext": bool, "source": str, "fulltext": str, "url": str}
    """
    # First get the DOI
    metadata = fetch_by_pmid(pmid, api_key)
    doi = metadata.get("doi", "")

    # 1. Try PMC Open Access
    try:
        pmc_url = _eutils_url("esearch.fcgi", {
            "db": "pmc",
            "term": f"{pmid}[PMID]",
            "retmode": "json",
        }, api_key)

        resp = _eutils_get(pmc_url, api_key, timeout=15)
        if resp.status_code == 200:
            pmc_data = resp.json()
            pmc_ids = pmc_data.get("esearchresult", {}).get("idlist", [])
            if pmc_ids:
                pmc_id = pmc_ids[0]
                efetch_url = _eutils_url("efetch.fcgi", {
                    "db": "pmc",
                    "id": pmc_id,
                    "retmode": "xml",
                }, api_key)

                resp2 = _eutils_get(efetch_url, api_key, timeout=30)
                if resp2.status_code == 200:
                    root = ET.fromstring(resp2.text)
                    text_parts = []
                    for sec in root.findall(".//sec"):
                        for p in sec.findall(".//p"):
                            text = "".join(p.itertext()).strip()
                            if text:
                                text_parts.append(text)
                    if not text_parts:
                        for p in root.findall(".//p"):
                            text = "".join(p.itertext()).strip()
                            if text:
                                text_parts.append(text)

                    fulltext = "\n\n".join(text_parts)
                    if fulltext:
                        return {
                            "pmid": str(pmid),
                            "has_fulltext": True,
                            "source": "PMC Open Access",
                            "fulltext": fulltext,
                            "url": f"{PMC_BASE}/PMC{pmc_id}/",
                            "pmc_id": pmc_id,
                        }
    except Exception:
        pass

    # 2. Try Unpaywall
    if doi:
        try:
            _rate_limit()  # Rate limit Unpaywall too
            unpaywall_url = f"{UNPAYWALL_BASE}/{doi}?email={email}"
            resp = requests.get(unpaywall_url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                best_oa = data.get("best_oa_location", {})
                if best_oa:
                    oa_url = best_oa.get("url_for_pdf") or best_oa.get("url")
                    if oa_url:
                        return {
                            "pmid": str(pmid),
                            "has_fulltext": True,
                            "source": "Unpaywall",
                            "fulltext": "",  # URL only, not fetched
                            "url": oa_url,
                            "doi": doi,
                        }
        except Exception:
            pass

    return {
        "pmid": str(pmid),
        "has_fulltext": False,
        "source": "none",
        "fulltext": "",
        "url": "",
        "message": "Full text not available via open access. Article may be behind a paywall.",
    }


def batch_search(query: str, api_key: str = "", max_results: int = 50,
                 mindate: str = "", maxdate: str = "", datetype: str = "pdat") -> list[dict]:
    """Search PubMed and return metadata + abstracts for matching articles.

    Pages with retstart until the result count is exhausted or max_results is reached.
    mindate and maxdate use NCBI form YYYY/MM/DD. Sort is omitted so the page
    walk is a complete retrieval rather than a relevance sample.
    """
    if max_results < 1:
        return []

    page_size = 200
    pmids: list[str] = []
    retstart = 0
    total = None
    while len(pmids) < max_results:
        take = min(page_size, max_results - len(pmids))
        params = {
            "db": "pubmed",
            "term": query,
            "retmax": str(take),
            "retstart": str(retstart),
            "retmode": "json",
        }
        if mindate:
            params["mindate"] = mindate
            params["datetype"] = datetype
        if maxdate:
            params["maxdate"] = maxdate
            params["datetype"] = datetype
        resp = _eutils_get(_eutils_url("esearch.fcgi", params, api_key), api_key, timeout=30)
        esearch_res = resp.json().get("esearchresult", {})
        ids = [str(pmid) for pmid in esearch_res.get("idlist", []) if pmid]
        if total is None:
            raw_count = esearch_res.get("count")
            total = int(raw_count) if raw_count not in (None, "") else None
        if not ids:
            break
        pmids.extend(ids)
        retstart += len(ids)
        if len(ids) < take:
            break
        if total is not None and retstart >= total:
            break

    if not pmids:
        return []

    results = []
    abstracts: dict[str, str] = {}
    for offset in range(0, len(pmids), page_size):
        chunk = pmids[offset:offset + page_size]
        summary_url = _eutils_url("esummary.fcgi", {
            "db": "pubmed",
            "id": ",".join(chunk),
            "retmode": "json",
        }, api_key)
        summary_data = _eutils_get(summary_url, api_key, timeout=60).json()
        result_dict = summary_data.get("result", {})
        for pmid in chunk:
            article = result_dict.get(str(pmid), {})
            if not article or article.get("error"):
                continue
            metadata = _parse_article_metadata(article)
            metadata["pmid"] = str(pmid)
            metadata["source"] = "PubMed"
            metadata["abstract"] = ""
            results.append(metadata)

        try:
            efetch_url = _eutils_url("efetch.fcgi", {
                "db": "pubmed",
                "id": ",".join(chunk),
                "rettype": "abstract",
                "retmode": "xml",
            }, api_key)
            resp3 = _eutils_get(efetch_url, api_key, timeout=60)
            if resp3.status_code == 200:
                abstracts.update(_parse_abstract_from_efetch(resp3.text))
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("PubMed abstract fetch failed: %s", e)

    for record in results:
        record["abstract"] = abstracts.get(record["pmid"], "")
    return results


def preview_search(query: str, project_id: str = "", api_key: str = "",
                   sample_size: int = 5, conn=None) -> dict:
    """Preview search PubMed with dry-run counts and sample records before importing.

    Args:
        query: PubMed search query
        project_id: optional project ID to detect duplicate PMIDs already in project
        api_key: optional NCBI API key
        sample_size: number of sample preview records to return (default: 5)
        conn: optional database connection (avoids creating a new one)

    Returns:
        Dict with total_matching_records, already_in_project_count,
        new_records_count, and sample_previews
    """
    # 1. Search for PMIDs and total count
    esearch_url = _eutils_url("esearch.fcgi", {
        "db": "pubmed",
        "term": query,
        "retmax": str(sample_size),
        "retmode": "json",
        "sort": "relevance",
    }, api_key)

    resp = _eutils_get(esearch_url, api_key, timeout=15)
    data = resp.json()

    esearch_res = data.get("esearchresult", {})
    total_count = int(esearch_res.get("count", 0))
    sample_pmids = esearch_res.get("idlist", [])

    # 2. Check existing PMIDs in project database if project_id provided
    existing_pmids = set()
    if project_id:
        should_close = False
        if conn is None:
            from database import get_connection
            conn = get_connection()
            should_close = True
        try:
            rows = conn.execute(
                "SELECT pmid FROM studies WHERE project_id = ? AND pmid IS NOT NULL AND pmid != ''",
                (project_id,)
            ).fetchall()
            existing_pmids = {str(r["pmid"]).strip() for r in rows}
        finally:
            if should_close:
                conn.close()

    # 3. Fetch summary for sample previews
    sample_previews = []
    if sample_pmids:
        summary_url = _eutils_url("esummary.fcgi", {
            "db": "pubmed",
            "id": ",".join(sample_pmids),
            "retmode": "json",
        }, api_key)

        resp2 = _eutils_get(summary_url, api_key, timeout=20)
        if resp2.status_code == 200:
            summary_data = resp2.json().get("result", {})
            for pmid in sample_pmids:
                article = summary_data.get(str(pmid), {})
                if not article or article.get("error"):
                    continue

                authors_list = article.get("authors", [])
                author_names = [a.get("name", "") for a in authors_list if a.get("name")]
                authors_str = ", ".join(author_names[:3]) + (" et al." if len(author_names) > 3 else "")

                pubdate = article.get("pubdate", "")
                year = int(pubdate[:4]) if pubdate[:4].isdigit() else None

                doi = ""
                for aid in article.get("articleids", []):
                    if aid.get("idtype") == "doi":
                        doi = aid.get("value", "")
                        break

                sample_previews.append({
                    "pmid": str(pmid),
                    "title": article.get("title", ""),
                    "authors": authors_str,
                    "journal": article.get("fulljournalname", "") or article.get("source", ""),
                    "publication_year": year,
                    "doi": doi,
                    "is_in_project": str(pmid) in existing_pmids,
                })

    existing_in_samples = sum(1 for s in sample_previews if s["is_in_project"])

    return {
        "query": query,
        "total_matching_records": total_count,
        "already_in_project_count": len(existing_pmids),
        "new_records_count": max(0, total_count - len(existing_pmids)),
        "sample_previews": sample_previews,
        "sample_count": len(sample_previews),
        "existing_in_project_samples": existing_in_samples,
    }
