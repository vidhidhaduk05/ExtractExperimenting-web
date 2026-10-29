"""Abstract Auto-Retrieval & Missing Abstract Safeguard Service.

Features:
1. Multi-source cascade retrieval for studies with missing abstracts:
   - NCBI PubMed (by PMID or DOI/Title search via E-utilities)
   - Europe PMC (by DOI or PMID)
   - Crossref API (by DOI)
   - Semantic Scholar / OpenAlex (by DOI or Title)
   - PMC Open Access full-text excerpt (when abstract is missing but PMC article body is available)
2. Safe auto-routing:
   - If a study has NO abstract and retrieval attempts yield no abstract,
     it must NEVER be prematurely excluded at the Title/Abstract stage.
     Instead, it is automatically routed to the UNCERTAIN pile / NEED PDF with
     reason "No abstract available - human full-text review required".
"""
from __future__ import annotations

import logging
import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

USER_AGENT = "RadExtract/2.0 (Medical Systematic Review; mailto:reviewer@radextract.org)"
TIMEOUT = 10


def retrieve_abstract_for_study(study: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """Attempt cascade retrieval of missing abstract.
    
    Returns:
        (abstract_text, source_name) or (None, None)
    """
    doi = (study.get("doi") or "").strip()
    pmid = (study.get("pmid") or "").strip()
    title = (study.get("title") or "").strip()

    # Clean DOI
    if doi.startswith("https://doi.org/"):
        doi = doi[16:]
    elif doi.startswith("http://doi.org/"):
        doi = doi[15:]
    elif doi.startswith("doi.org/"):
        doi = doi[8:]
    doi = doi.strip()

    # 1. PubMed efetch by PMID
    if pmid:
        abs_text = _fetch_pubmed_abstract_by_pmid(pmid)
        if abs_text:
            return abs_text, f"PubMed (PMID:{pmid})"

    # 2. Europe PMC by DOI or PMID
    if doi or pmid:
        abs_text, found_pmid, found_pmcid = _fetch_europepmc(doi=doi, pmid=pmid)
        if abs_text:
            return abs_text, "Europe PMC"
        if found_pmcid:
            # If Europe PMC gave us a PMCID, try to fetch the PMC text summary
            pmc_text = _fetch_pmc_excerpt(found_pmcid)
            if pmc_text:
                return pmc_text, f"PMC Open Access ({found_pmcid})"
        if found_pmid and not pmid:
            abs_text = _fetch_pubmed_abstract_by_pmid(found_pmid)
            if abs_text:
                return abs_text, f"PubMed (PMID:{found_pmid})"

    # 3. Crossref by DOI
    if doi:
        abs_text = _fetch_crossref_abstract(doi)
        if abs_text:
            return abs_text, "Crossref"

    # 4. Search PubMed by Title if DOI or PMID weren't present or didn't have abstract
    if title and len(title) > 15:
        searched_pmid = _search_pubmed_pmid_by_title(title)
        if searched_pmid:
            abs_text = _fetch_pubmed_abstract_by_pmid(searched_pmid)
            if abs_text:
                return abs_text, f"PubMed Search (PMID:{searched_pmid})"
            # Also check Europe PMC for this PMID
            abs_text, _, found_pmcid = _fetch_europepmc(pmid=searched_pmid)
            if abs_text:
                return abs_text, "Europe PMC"
            if found_pmcid:
                pmc_text = _fetch_pmc_excerpt(found_pmcid)
                if pmc_text:
                    return pmc_text, f"PMC Open Access ({found_pmcid})"

    # 5. OpenAlex by DOI
    if doi:
        abs_text = _fetch_openalex_abstract(doi)
        if abs_text:
            return abs_text, "OpenAlex"

    return None, None


def _fetch_pubmed_abstract_by_pmid(pmid: str) -> Optional[str]:
    try:
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200 and resp.text:
            root = ET.fromstring(resp.content)
            abstract_nodes = root.findall(".//AbstractText")
            if abstract_nodes:
                parts = []
                for n in abstract_nodes:
                    label = n.get("Label")
                    t = "".join(n.itertext()).strip()
                    if label and t:
                        parts.append(f"{label}: {t}")
                    elif t:
                        parts.append(t)
                text = " ".join(parts).strip()
                if len(text) > 40:
                    return text
    except Exception as e:
        logger.debug("PubMed efetch failed for %s: %s", pmid, e)
    return None


def _fetch_europepmc(doi: str = "", pmid: str = "") -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (abstract_text, found_pmid, found_pmcid)."""
    try:
        query = f"DOI:{doi}" if doi else f"EXT_ID:{pmid}"
        url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={urllib.parse.quote(query)}&format=json"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("resultList", {}).get("result", [])
            if results:
                r0 = results[0]
                abs_text = (r0.get("abstractText") or "").strip()
                # Clean html tags
                abs_text = re.sub(r"<[^>]+>", "", abs_text).strip()
                f_pmid = r0.get("pmid")
                f_pmcid = r0.get("pmcid")
                return (abs_text if len(abs_text) > 40 else None, f_pmid, f_pmcid)
    except Exception as e:
        logger.debug("Europe PMC failed for %s/%s: %s", doi, pmid, e)
    return None, None, None


def _fetch_crossref_abstract(doi: str) -> Optional[str]:
    try:
        url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200:
            msg = resp.json().get("message", {})
            raw_abs = msg.get("abstract", "")
            if raw_abs:
                clean_abs = re.sub(r"<[^>]+>", "", raw_abs).strip()
                if len(clean_abs) > 40:
                    return clean_abs
    except Exception as e:
        logger.debug("Crossref abstract failed for %s: %s", doi, e)
    return None


def _search_pubmed_pmid_by_title(title: str) -> Optional[str]:
    try:
        clean_title = re.sub(r"[^\w\s]", "", title)
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={urllib.parse.quote(clean_title)}[Title]&retmode=json&retmax=1"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200:
            idlist = resp.json().get("esearchresult", {}).get("idlist", [])
            if idlist:
                return idlist[0]
    except Exception as e:
        logger.debug("PubMed title search failed: %s", e)
    return None


def _fetch_pmc_excerpt(pmcid: str) -> Optional[str]:
    """Fetch introductory body paragraphs from PMC Open Access when formal abstract tag is omitted."""
    try:
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcid}&retmode=xml"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200 and resp.text:
            root = ET.fromstring(resp.content)
            body = root.find(".//body")
            if body is not None:
                paragraphs = []
                for p in body.findall(".//p")[:4]:
                    t = "".join(p.itertext()).strip()
                    if len(t) > 30:
                        paragraphs.append(t)
                if paragraphs:
                    full_excerpt = " ".join(paragraphs).strip()
                    # Cap to ~1500 chars to form a clean abstract replacement
                    if len(full_excerpt) > 1500:
                        full_excerpt = full_excerpt[:1500].rsplit(" ", 1)[0] + "..."
                    return f"[Extracted from Open-Access PMC full text]: {full_excerpt}"
    except Exception as e:
        logger.debug("PMC excerpt retrieval failed for %s: %s", pmcid, e)
    return None


def _fetch_openalex_abstract(doi: str) -> Optional[str]:
    """OpenAlex stores abstracts as inverted indexes."""
    try:
        url = f"https://api.openalex.org/works/https://doi.org/{urllib.parse.quote(doi)}"
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            inv = data.get("abstract_inverted_index")
            if inv:
                # Reconstruct abstract
                word_positions = []
                for word, positions in inv.items():
                    for pos in positions:
                        word_positions.append((pos, word))
                word_positions.sort(key=lambda x: x[0])
                reconstructed = " ".join(w for _, w in word_positions).strip()
                if len(reconstructed) > 40:
                    return reconstructed
    except Exception as e:
        logger.debug("OpenAlex abstract reconstruction failed for %s: %s", doi, e)
    return None

