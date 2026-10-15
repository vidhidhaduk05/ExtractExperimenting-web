"""Phase 0 of automatic full-text retrieval: check which studies have a legal free full text.

Read-only. For each study (by PMID / DOI) it asks three official services whether a free copy exists,
and reports what could be retrieved automatically. Nothing is downloaded, stored or changed.

  - Europe PMC   (no key)        -> PMCID, open-access flag, whether full text / PDF exists there
  - PMC OA service (NCBI)        -> whether the article is in the open-access subset with a PDF
  - Unpaywall    (needs email)   -> best legal open-access location, direct PDF link if any

Job state is kept in memory per process (like screening_progress): fine locally and on one container,
and the result endpoint simply reports "no job" if the process restarted.
"""
from __future__ import annotations

import logging
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any, Optional

import requests

from services import pubmed_service

logger = logging.getLogger("fulltext_availability")

EUROPEPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
PMC_OA_SERVICE = "https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi"
UNPAYWALL_BASE = "https://api.unpaywall.org/v2"

# Statuses, best first. The first three can be fetched automatically in a later phase.
RETRIEVABLE = ("pmc_pdf", "unpaywall_pdf", "europepmc_text")
STATUSES = RETRIEVABLE + ("oa_page_only", "free_to_read", "not_available", "error")

_HEADERS = {"User-Agent": "RadExtract-fulltext-check/1.0"}


def _fetch_json(url: str) -> Any:
    resp = requests.get(url, headers=_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def _fetch_xml(url: str, api_key: str = "") -> ET.Element:
    resp = pubmed_service._eutils_get(url, api_key=api_key, timeout=20)
    return ET.fromstring(resp.text)


def _clean_doi(doi: str) -> str:
    d = (doi or "").strip()
    for prefix in ("https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "doi:"):
        if d.lower().startswith(prefix):
            d = d[len(prefix):]
    return d.strip()


def _europepmc(pmid: str, doi: str) -> Optional[dict]:
    if pmid:
        query = f"EXT_ID:{pmid} AND SRC:MED"
    elif doi:
        query = f'DOI:"{doi}"'
    else:
        return None
    url = EUROPEPMC_SEARCH + "?" + urllib.parse.urlencode(
        {"query": query, "format": "json", "resultType": "lite", "pageSize": 1}
    )
    results = (_fetch_json(url).get("resultList") or {}).get("result") or []
    return results[0] if results else None


def _pmc_oa_pdf(pmcid: str, api_key: str) -> tuple[bool, str]:
    """True + license when the PMC open-access subset lists a PDF for this PMCID."""
    root = _fetch_xml(f"{PMC_OA_SERVICE}?id={pmcid}", api_key)
    if root.find(".//error") is not None:
        return False, ""
    record = root.find(".//record")
    if record is None:
        return False, ""
    has_pdf = any(link.get("format") == "pdf" for link in record.findall("link"))
    return has_pdf, record.get("license", "")


def _unpaywall(doi: str, email: str) -> Optional[dict]:
    url = f"{UNPAYWALL_BASE}/{urllib.parse.quote(doi, safe='/')}?email={urllib.parse.quote(email)}"
    return _fetch_json(url)


def check_study(pmid: str = "", doi: str = "", api_key: str = "", email: str = "") -> dict[str, Any]:
    """Classify one study. Never raises; lookup failures are reported in ``notes`` / status ``error``."""
    pmid, doi = (pmid or "").strip(), _clean_doi(doi)
    out: dict[str, Any] = {
        "status": "not_available", "retrievable": False, "pmcid": "", "pdf_url": "",
        "license": "", "sources": [], "notes": [],
    }
    if not pmid and not doi:
        out["notes"].append("No PMID or DOI")
        return out

    errors = 0
    pmc_pdf = pmc_restricted = europe_text = False
    try:
        epmc = _europepmc(pmid, doi)
        if epmc:
            out["pmcid"] = epmc.get("pmcid") or ""
            is_oa = epmc.get("isOpenAccess") == "Y"
            if epmc.get("inEPMC") == "Y" and is_oa:
                europe_text = True
                out["sources"].append("Europe PMC full text")
            elif out["pmcid"]:
                pmc_restricted = True
    except Exception as e:
        errors += 1
        out["notes"].append(f"Europe PMC lookup failed: {e}")

    if out["pmcid"]:
        try:
            pmc_pdf, lic = _pmc_oa_pdf(out["pmcid"], api_key)
            if pmc_pdf:
                out["sources"].append("PMC open-access PDF")
                out["license"] = lic
        except Exception as e:
            errors += 1
            out["notes"].append(f"PMC OA lookup failed: {e}")

    unpaywall_pdf = unpaywall_page = False
    if doi and email:
        try:
            up = _unpaywall(doi, email) or {}
            if up.get("is_oa"):
                best = up.get("best_oa_location") or {}
                pdf = best.get("url_for_pdf") or next(
                    (loc.get("url_for_pdf") for loc in up.get("oa_locations") or [] if loc.get("url_for_pdf")), ""
                )
                if pdf:
                    unpaywall_pdf = True
                    out["pdf_url"] = pdf
                    out["license"] = out["license"] or (best.get("license") or "")
                    out["sources"].append("Unpaywall PDF")
                else:
                    unpaywall_page = True
                    out["sources"].append("Unpaywall page (no direct PDF)")
        except Exception as e:
            errors += 1
            out["notes"].append(f"Unpaywall lookup failed: {e}")
    elif doi and not email:
        out["notes"].append("Unpaywall skipped: set RADEXTRACT_CONTACT_EMAIL")

    if pmc_pdf:
        out["status"] = "pmc_pdf"
    elif unpaywall_pdf:
        out["status"] = "unpaywall_pdf"
    elif europe_text:
        out["status"] = "europepmc_text"
    elif unpaywall_page:
        out["status"] = "oa_page_only"
    elif pmc_restricted:
        out["status"] = "free_to_read"
    elif errors:
        out["status"] = "error"
    out["retrievable"] = out["status"] in RETRIEVABLE
    return out


# ── Background job (in-memory) ──

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def _summary(results: list[dict]) -> dict[str, int]:
    counts = {s: 0 for s in STATUSES}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    counts["retrievable"] = sum(counts[s] for s in RETRIEVABLE)
    counts["checked"] = len(results)
    return counts


def get_job(project_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(project_id)
        if not job:
            return {"exists": False, "active": False, "total": 0, "done": 0, "results": [], "summary": _summary([])}
        return {
            "exists": True, "active": job["active"], "total": job["total"], "done": len(job["results"]),
            "results": list(job["results"]), "summary": _summary(job["results"]),
            "started_at": job["started_at"], "finished_at": job.get("finished_at"),
        }


def start_job(project_id: str, studies: list[dict], api_key: str = "", email: str = "") -> dict[str, Any]:
    """Start (or return the running) availability check. ``studies``: dicts with study_id/title/pmid/doi."""
    with _lock:
        existing = _jobs.get(project_id)
        if existing and existing["active"]:
            already = True
        else:
            already = False
            _jobs[project_id] = {
                "active": True, "total": len(studies), "results": [], "started_at": time.time(),
            }
    if not already:
        threading.Thread(target=_run, args=(project_id, studies, api_key, email), daemon=True).start()
    return get_job(project_id)


def _run(project_id: str, studies: list[dict], api_key: str, email: str) -> None:
    try:
        for s in studies:
            res = check_study(s.get("pmid") or "", s.get("doi") or "", api_key, email)
            res.update(
                study_id=s.get("study_id"), title=s.get("title") or "",
                pmid=s.get("pmid") or "", doi=_clean_doi(s.get("doi") or ""),
            )
            with _lock:
                _jobs[project_id]["results"].append(res)
    except Exception:
        logger.exception("Full-text availability job failed")
    finally:
        with _lock:
            _jobs[project_id]["active"] = False
            _jobs[project_id]["finished_at"] = time.time()
