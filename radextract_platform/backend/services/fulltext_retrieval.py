"""Phase 1 of automatic full-text retrieval: fetch open-access article text and (optionally) screen it.

For each study awaiting a PDF this asks Europe PMC for the article's JATS XML (only served for the
open-access subset, so reuse is legal), converts it to plain text, and stores it in ``pdf_documents``
exactly where an uploaded PDF's text would be. The study is marked ``pdf_status = 'text_only'`` because
there is no PDF file (no PDF viewer / page highlights). Existing full-text screening then works on it.

Job state is kept in memory per process, like the availability check.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from services import fulltext_availability as fa

logger = logging.getLogger("fulltext_retrieval")

EUROPEPMC_FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
MIN_TEXT_CHARS = 1500  # anything shorter is an abstract stub, not a usable full text
REQUEST_DELAY_S = 0.2  # be polite to Europe PMC

OUTCOMES = ("fetched", "already_has_text", "not_open_access", "too_short", "error")


def _fetch_xml(pmcid: str) -> Optional[str]:
    """Europe PMC full-text XML, or None when the article is not served (not open access)."""
    resp = requests.get(EUROPEPMC_FULLTEXT.format(pmcid=pmcid), headers=fa._HEADERS, timeout=30)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.text


def _local(tag: Any) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _text(el: ET.Element) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def _walk(el: ET.Element, out: list[str]) -> None:
    tag = _local(el.tag)
    if tag == "title":
        t = _text(el)
        if t:
            out.append("\n## " + t)
    elif tag == "p":
        t = _text(el)
        if t:
            out.append(t)
    elif tag in ("table-wrap", "fig"):
        cap = next((c for c in el if _local(c.tag) == "caption"), None)
        label = next((c for c in el if _local(c.tag) == "label"), None)
        head = " ".join(x for x in (_text(label) if label is not None else "", _text(cap) if cap is not None else "") if x)
        if head:
            out.append(head)
        for row in el.iter():
            if _local(row.tag) == "tr":
                cells = [_text(c) for c in row if _local(c.tag) in ("td", "th")]
                if any(cells):
                    out.append(" | ".join(cells))
    else:
        for child in el:
            _walk(child, out)


def parse_jats(xml_text: str) -> dict[str, str]:
    """Plain text (title, abstract, body sections, table captions/rows) from a JATS article."""
    root = ET.fromstring(xml_text)
    title_el = next((e for e in root.iter() if _local(e.tag) == "article-title"), None)
    abstract_el = next((e for e in root.iter() if _local(e.tag) == "abstract"), None)
    body_el = next((e for e in root.iter() if _local(e.tag) == "body"), None)

    parts: list[str] = []
    title = _text(title_el) if title_el is not None else ""
    if title:
        parts.append(title)
    if abstract_el is not None:
        parts.append("\n## Abstract")
        _walk(abstract_el, parts)
    if body_el is not None:
        _walk(body_el, parts)
    return {"title": title, "full_text": "\n\n".join(p.strip() for p in parts if p.strip())}


def _store(db, study: dict, pmcid: str, full_text: str) -> None:
    for old in db.query("pdf_documents", {"study_id": study["study_id"]}):
        db.delete("pdf_documents", old["doc_id"])
    db.insert("pdf_documents", {
        "doc_id": str(uuid.uuid4()),
        "study_id": study["study_id"],
        "full_text": full_text,
        "pages_json": json.dumps([{"page_number": 1, "text": full_text}], ensure_ascii=False),
        "annotations_json": "{}",
        "tables_json": "[]",
        "metadata_json": json.dumps(
            {"source": "Europe PMC open-access XML", "pmcid": pmcid, "text_only": True}, ensure_ascii=False
        ),
        "processor_engine": "europepmc_xml",
        "processed_at": datetime.now(timezone.utc).isoformat(),
    })
    if not (study.get("pdf_path") or "").strip():
        db.update("studies", study["study_id"], {"pdf_status": "text_only"})
    db.commit()


def fetch_one(db, study: dict) -> dict[str, Any]:
    """Fetch and store the open-access text for one study. Never raises."""
    res: dict[str, Any] = {
        "study_id": study.get("study_id"), "title": study.get("title") or "", "outcome": "error", "note": "",
    }
    try:
        existing = db.query("pdf_documents", {"study_id": study["study_id"]})
        if existing and (existing[0].get("full_text") or "").strip():
            res["outcome"] = "already_has_text"
            return res

        epmc = fa._europepmc((study.get("pmid") or "").strip(), fa._clean_doi(study.get("doi") or ""))
        pmcid = (epmc or {}).get("pmcid") or ""
        if not epmc or not pmcid or epmc.get("isOpenAccess") != "Y":
            res["outcome"], res["note"] = "not_open_access", "Not in the open-access subset"
            return res

        xml_text = _fetch_xml(pmcid)
        if xml_text is None:
            res["outcome"], res["note"] = "not_open_access", "Europe PMC has no full-text XML"
            return res

        full_text = parse_jats(xml_text)["full_text"]
        if len(full_text) < MIN_TEXT_CHARS:
            res["outcome"], res["note"] = "too_short", f"Only {len(full_text)} characters of text"
            return res

        _store(db, study, pmcid, full_text)
        res.update(outcome="fetched", pmcid=pmcid, chars=len(full_text))
    except Exception as e:
        logger.warning("Full-text fetch failed for %s: %s", study.get("study_id"), e)
        res["outcome"], res["note"] = "error", str(e)[:200]
    return res


# ── Background job (in-memory) ──

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def _summary(results: list[dict], screened: int = 0) -> dict[str, int]:
    counts = {o: 0 for o in OUTCOMES}
    for r in results:
        counts[r["outcome"]] = counts.get(r["outcome"], 0) + 1
    counts["checked"] = len(results)
    counts["screened"] = screened
    return counts


def get_job(project_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(project_id)
        if not job:
            return {"exists": False, "active": False, "phase": "", "total": 0, "done": 0, "results": [],
                    "summary": _summary([])}
        return {
            "exists": True, "active": job["active"], "phase": job["phase"], "total": job["total"],
            "done": len(job["results"]), "results": list(job["results"]),
            "summary": _summary(job["results"], job.get("screened", 0)), "screen": job["screen"],
            "error": job.get("error", ""),
        }


def start_job(project_id: str, studies: list[dict], screen: bool = True) -> dict[str, Any]:
    with _lock:
        existing = _jobs.get(project_id)
        already = bool(existing and existing["active"])
        if not already:
            _jobs[project_id] = {
                "active": True, "phase": "fetching", "total": len(studies), "results": [],
                "screen": screen, "screened": 0, "started_at": time.time(),
            }
    if not already:
        threading.Thread(target=_run, args=(project_id, studies, screen), daemon=True).start()
    return get_job(project_id)


def _run(project_id: str, studies: list[dict], screen: bool) -> None:
    from database import get_db_backend  # local import: keeps module import light and test-friendly

    db = None
    try:
        db = get_db_backend()
        for s in studies:
            res = fetch_one(db, s)
            with _lock:
                _jobs[project_id]["results"].append(res)
            if res["outcome"] == "fetched":
                time.sleep(REQUEST_DELAY_S)

        if screen:
            with _lock:
                _jobs[project_id]["phase"] = "screening"
            from services import screening_progress
            from services.ai_screening_pipeline import AIScreeningPipeline

            try:
                out = AIScreeningPipeline().run_fulltext_screening(project_id, db)
                with _lock:
                    _jobs[project_id]["screened"] = sum(
                        1 for r in out if r.get("screening_status") != "awaiting_pdf"
                    )
            finally:
                screening_progress.finish(project_id)
    except Exception as e:
        logger.exception("Full-text retrieval job failed")
        with _lock:
            _jobs[project_id]["error"] = str(e)[:200]
    finally:
        with _lock:
            _jobs[project_id]["active"] = False
            _jobs[project_id]["phase"] = "done"
        try:
            if db is not None and hasattr(db, "close"):
                db.close()
        except Exception:
            pass
