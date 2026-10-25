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
    db.update("studies", study["study_id"], {
        "pdf_status": "text_only",
        "extraction_status": "ready_for_extraction",
    })
    db.commit()


def _download_pdf(url: str, timeout: int = 30) -> Optional[bytes]:
    """Download PDF bytes with streaming and content-type / magic byte check."""
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadExtract/1.0 (mailto:team@radextract.local)",
                "Accept": "application/pdf,*/*",
            },
            timeout=timeout,
            stream=True,
            allow_redirects=True,
        )
        if resp.status_code == 200:
            content = resp.content
            if len(content) >= 1000 and (content.startswith(b"%PDF") or "pdf" in resp.headers.get("Content-Type", "").lower()):
                return content
    except Exception as e:
        logger.debug("PDF download failed from %s: %s", url, e)
    return None


def _store_pdf(db, study: dict, pdf_bytes: bytes, source: str, source_url: str = "", pmcid: str = "") -> dict[str, Any]:
    """Save downloaded PDF bytes, convert with Docling, and transition to ready_for_extraction."""
    from services.storage_backend import get_storage
    from services import pdf_service

    study_id = study["study_id"]
    project_id = study.get("project_id") or "default"
    storage = get_storage("upload")
    storage_key = f"{project_id}/{study_id}.pdf"
    storage.save_bytes(storage_key, pdf_bytes)

    db.update("studies", study_id, {
        "pdf_path": storage_key,
        "pdf_status": "uploaded",
    })
    db.commit()

    # Convert with IBM Docling (persists .docling.json and structured tables/layout in pdf_documents)
    proc_res = pdf_service.process_pdf(study_id, db)
    db.update("studies", study_id, {
        "extraction_status": "ready_for_extraction",
    })
    db.commit()

    return {
        "outcome": "fetched",
        "pdf": True,
        "pmcid": pmcid,
        "source": source,
        "chars": len(proc_res.get("full_text", "")),
        "pages": proc_res.get("n_pages", 1),
    }


def fetch_one(db, study: dict) -> dict[str, Any]:
    """Fetch and store open-access PDF (preferred) or text for one study. Never raises."""
    res: dict[str, Any] = {
        "study_id": study.get("study_id"), "title": study.get("title") or "", "outcome": "error", "note": "",
    }
    try:
        study_id = study["study_id"]
        # Check if study already has processed PDF or full text
        existing = db.query("pdf_documents", {"study_id": study_id})
        if existing and (existing[0].get("full_text") or "").strip():
            db.update("studies", study_id, {"extraction_status": "ready_for_extraction"})
            db.commit()
            res["outcome"] = "already_has_text"
            return res

        doi = fa._clean_doi(study.get("doi") or "")
        pmid = (study.get("pmid") or "").strip()

        # 1. Try Unpaywall direct PDF if DOI is available
        if doi:
            try:
                from config import settings
                email = getattr(settings, "contact_email", "") or "team@radextract.local"
                up = fa._unpaywall(doi, email) or {}
                if up.get("is_oa"):
                    best = up.get("best_oa_location") or {}
                    pdf_url = best.get("url_for_pdf") or next(
                        (loc.get("url_for_pdf") for loc in up.get("oa_locations") or [] if loc.get("url_for_pdf")), ""
                    )
                    if pdf_url:
                        pdf_bytes = _download_pdf(pdf_url)
                        if pdf_bytes:
                            stored = _store_pdf(db, study, pdf_bytes, source="Unpaywall", source_url=pdf_url)
                            res.update(stored)
                            return res
            except Exception as e_up:
                logger.debug("Unpaywall direct PDF attempt failed for %s: %s", study_id, e_up)

        # 2. Check Europe PMC for open-access metadata
        epmc = fa._europepmc(pmid, doi)
        pmcid = (epmc or {}).get("pmcid") or ""
        is_oa = (epmc or {}).get("isOpenAccess") == "Y"

        if epmc and pmcid and is_oa:
            # 2a. Try direct Europe PMC PDF
            try:
                epmc_pdf_url = f"https://europepmc.org/backend/ptpmcrender.fcgi?accid={pmcid}&blobtype=pdf"
                pdf_bytes = _download_pdf(epmc_pdf_url)
                if pdf_bytes:
                    stored = _store_pdf(db, study, pdf_bytes, source="Europe PMC OA PDF", source_url=epmc_pdf_url, pmcid=pmcid)
                    res.update(stored)
                    return res
            except Exception as e_epmc_pdf:
                logger.debug("Europe PMC direct PDF attempt failed for %s: %s", study_id, e_epmc_pdf)

            # 2b. Fallback to Europe PMC JATS XML (full text)
            xml_text = _fetch_xml(pmcid)
            if xml_text is not None:
                full_text = parse_jats(xml_text)["full_text"]
                if len(full_text) >= MIN_TEXT_CHARS:
                    _store(db, study, pmcid, full_text)
                    res.update(outcome="fetched", pmcid=pmcid, chars=len(full_text), pdf=False)
                    return res
                else:
                    res["outcome"], res["note"] = "too_short", f"Only {len(full_text)} characters of text"
                    db.update("studies", study_id, {"extraction_status": "awaiting_pdf"})
                    db.commit()
                    return res
            else:
                res["outcome"], res["note"] = "not_open_access", "Europe PMC has no full-text XML"
                db.update("studies", study_id, {"extraction_status": "awaiting_pdf"})
                db.commit()
                return res

        # Not open access or not found
        res["outcome"], res["note"] = "not_open_access", "Not in the open-access subset"
        db.update("studies", study_id, {"extraction_status": "awaiting_pdf"})
        db.commit()
    except Exception as e:
        logger.warning("Full-text fetch failed for %s: %s", study.get("study_id"), e)
        res["outcome"], res["note"] = "error", str(e)[:200]
        try:
            db.update("studies", study.get("study_id"), {"extraction_status": "awaiting_pdf"})
            db.commit()
        except Exception:
            pass
    return res


def retrieve_and_process_oa_study(study_id: str, project_id: Optional[str] = None) -> dict[str, Any]:
    """Retrieve and process OA PDF/text for a single study, running Docling conversion."""
    from database import get_db_backend
    db = get_db_backend()
    try:
        study = db.get("studies", study_id)
        if not study:
            return {"outcome": "error", "note": f"Study {study_id} not found"}

        # If study already has a PDF file
        pdf_path = (study.get("pdf_path") or "").strip()
        pdf_status = study.get("pdf_status") or ""

        if pdf_path and pdf_status == "processed":
            db.update("studies", study_id, {"extraction_status": "ready_for_extraction"})
            db.commit()
            return {"outcome": "already_has_text", "note": "PDF already processed"}

        if pdf_path and pdf_status == "uploaded":
            from services import pdf_service
            try:
                pdf_service.process_pdf(study_id, db)
                db.update("studies", study_id, {"extraction_status": "ready_for_extraction"})
                db.commit()
                return {"outcome": "processed_existing_pdf", "note": "Converted uploaded PDF with Docling"}
            except Exception as e:
                logger.warning("Failed converting existing PDF for %s: %s", study_id, e)

        # Check existing pdf_documents text
        existing = db.query("pdf_documents", {"study_id": study_id})
        if existing and (existing[0].get("full_text") or "").strip():
            db.update("studies", study_id, {"extraction_status": "ready_for_extraction"})
            db.commit()
            return {"outcome": "already_has_text"}

        return fetch_one(db, study)
    finally:
        try:
            if hasattr(db, "close"):
                db.close()
        except Exception:
            pass


def transition_study_to_extraction(study_id: str, conn: Any, background_tasks: Any = None) -> str:
    """Automatically move an included study to the Data Extraction stage.

    - If PDF is already processed: sets extraction_status = 'ready_for_extraction'.
    - If PDF is uploaded but not processed: runs Docling processor -> 'ready_for_extraction'.
    - If study has stored OA full text: sets extraction_status = 'ready_for_extraction'.
    - If missing PDF: sets extraction_status = 'awaiting_pdf' and launches OA retrieval in background.
    """
    row = conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    if not row:
        return "not_found"

    study = dict(row)
    project_id = study.get("project_id", "")
    pdf_path = (study.get("pdf_path") or "").strip()
    pdf_status = study.get("pdf_status") or ""

    # Check if doc exists in pdf_documents
    doc_row = conn.execute("SELECT full_text FROM pdf_documents WHERE study_id = ?", (study_id,)).fetchone()
    has_fulltext = bool(doc_row and (dict(doc_row).get("full_text") or "").strip())

    if pdf_path and pdf_status == "processed":
        conn.execute("UPDATE studies SET extraction_status = 'ready_for_extraction' WHERE study_id = ?", (study_id,))
        if hasattr(conn, "commit"):
            conn.commit()
        return "ready_for_extraction"

    if pdf_path and pdf_status == "uploaded":
        from services import pdf_service
        try:
            pdf_service.process_pdf(study_id, conn)
            conn.execute("UPDATE studies SET extraction_status = 'ready_for_extraction' WHERE study_id = ?", (study_id,))
            if hasattr(conn, "commit"):
                conn.commit()
            return "ready_for_extraction"
        except Exception as e:
            logger.warning("Error processing uploaded PDF during transition: %s", e)

    if has_fulltext:
        conn.execute("UPDATE studies SET extraction_status = 'ready_for_extraction' WHERE study_id = ?", (study_id,))
        if hasattr(conn, "commit"):
            conn.commit()
        return "ready_for_extraction"

    # Missing PDF: set awaiting_pdf and trigger OA retrieval in background
    conn.execute("UPDATE studies SET extraction_status = 'awaiting_pdf' WHERE study_id = ?", (study_id,))
    if hasattr(conn, "commit"):
        conn.commit()

    if background_tasks is not None:
        background_tasks.add_task(retrieve_and_process_oa_study, study_id, project_id)
    else:
        threading.Thread(target=retrieve_and_process_oa_study, args=(study_id, project_id), daemon=True).start()

    return "awaiting_pdf"


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
