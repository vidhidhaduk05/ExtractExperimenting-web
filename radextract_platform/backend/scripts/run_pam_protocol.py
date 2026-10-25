"""Load PAM Protocol V2 into a new blank project and run the review pipeline.

A project is created empty. The protocol file is the only source of PICO,
criteria, search strings, and variables. PubMed is paged inside 1960-01-01
to 2026-08-31. OpenAlex stands in for Scopus and Web of Science.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

import requests

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

PROTOCOL = os.environ.get(
    "PAM_PROTOCOL",
    r"d:\Desktop\Pure Arterial Malformation\PAM_Systematic_Review_Protocol_V2.docx",
)
API = os.environ.get("RADEXTRACT_API", "http://127.0.0.1:8000/api")
MINDATE = "1960/01/01"
MAXDATE = "2026/08/31"
OPENALEX_MIN = "1960-01-01"
OPENALEX_MAX = "2026-08-31"


def _api(method: str, path: str, timeout: int = 120, retries: int = 5, **kwargs):
    for attempt in range(1, retries + 1):
        try:
            response = requests.request(method, f"{API}{path}", timeout=timeout, **kwargs)
            if response.status_code in (502, 503, 504) and attempt < retries:
                time.sleep(attempt * 2)
                continue
            if response.status_code >= 400:
                raise RuntimeError(f"{method} {path} -> {response.status_code}: {response.text[:800]}")
            if not response.content:
                return {}
            return response.json()
        except (requests.ConnectionError, requests.Timeout) as e:
            if attempt < retries:
                time.sleep(attempt * 2)
                continue
            raise


def _store_pmc_text(conn, study_id: str, fulltext: str, source: str) -> None:
    existing = conn.execute(
        "SELECT doc_id FROM pdf_documents WHERE study_id = ?",
        (study_id,),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE pdf_documents SET full_text = ?, processor_engine = ?, processed_at = ? WHERE study_id = ?",
            (fulltext, source, datetime.now(timezone.utc).isoformat(), study_id),
        )
    else:
        conn.execute(
            """INSERT INTO pdf_documents
               (doc_id, study_id, full_text, pages_json, annotations_json, tables_json,
                metadata_json, processor_engine, processed_at)
               VALUES (?, ?, ?, '[]', '{}', '[]', '{}', ?, ?)""",
            (str(uuid.uuid4()), study_id, fulltext, source, datetime.now(timezone.utc).isoformat()),
        )
    conn.execute(
        "UPDATE studies SET pdf_status = ? WHERE study_id = ?",
        ("retrieved", study_id),
    )


def main() -> int:
    if not os.path.isfile(PROTOCOL):
        print(f"Protocol file not found: {PROTOCOL}")
        return 1

    health = requests.get(API.replace("/api", "") + "/health", timeout=10)
    health.raise_for_status()
    print(f"API healthy: {health.json()}")

    project = _api("POST", "/projects", json={
        "name": "Pure Arterial Malformations of the Brain",
        "description": "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes",
    })
    project_id = project["project_id"]
    print(f"Blank project {project_id}")

    studies_before = _api("GET", f"/projects/{project_id}/studies")
    variables_before = _api("GET", f"/projects/{project_id}/variables")
    study_count = len(studies_before) if isinstance(studies_before, list) else studies_before.get("studies", studies_before)
    if isinstance(study_count, list):
        study_count = len(study_count)
    variable_count = len(variables_before) if isinstance(variables_before, list) else 0
    print(f"Before protocol load: studies={study_count} variables={variable_count}")
    if study_count or variable_count:
        raise RuntimeError("New project was not blank")

    with open(PROTOCOL, "rb") as handle:
        extracted = _api(
            "POST",
            f"/projects/{project_id}/pico/extract",
            files={"file": (os.path.basename(PROTOCOL), handle, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            timeout=180,
        )
    print(
        "Extracted confidence="
        f"{extracted.get('extraction_confidence')} "
        f"inclusion={len(extracted.get('inclusion') or [])} "
        f"exclusion={len(extracted.get('exclusion') or [])} "
        f"variables={len(extracted.get('variables') or [])}"
    )
    if not extracted.get("population") or not extracted.get("search_strings", {}).get("pubmed"):
        raise RuntimeError("Protocol upload did not map population and the PubMed string")
    if "case report" not in (extracted.get("study_design") or "").lower() and not any(
        "case report" in item.lower() for item in (extracted.get("inclusion") or [])
    ):
        raise RuntimeError("Protocol upload dropped case-report eligibility")

    _api("PUT", f"/projects/{project_id}/settings", json={"auto_rob_enabled": False})

    pubmed = _api(
        "POST",
        f"/projects/{project_id}/search-strings/pubmed/fetch",
        json={"max_results": 10000, "mindate": MINDATE, "maxdate": MAXDATE},
        timeout=600,
    )
    print(f"PubMed imported={pubmed.get('imported_count')} found={pubmed.get('total_found')}")

    openalex = _api(
        "POST",
        f"/projects/{project_id}/search-strings/openalex/fetch",
        json={"max_results": 500, "mindate": OPENALEX_MIN, "maxdate": OPENALEX_MAX},
        timeout=600,
    )
    print(f"OpenAlex imported={openalex.get('imported_count')} found={openalex.get('total_found')} skipped={openalex.get('skipped_duplicates')}")

    dedup = _api("POST", f"/projects/{project_id}/studies/deduplicate", timeout=180)
    print(f"Dedup total={dedup.get('total_studies')} duplicates={dedup.get('total_duplicates')}")

    from services.llm_extractor import is_llm_available
    if not is_llm_available():
        print("LLM at LLM_BASE_URL is not answering. Search and dedup are saved. Screening was not invented.")
        print(f"PROJECT_ID={project_id}")
        return 2

    from database import get_connection
    from services.ai_screening_pipeline import AIScreeningPipeline
    from services.coded_extraction_service import coded_extract_study
    from services.db_backend import SQLiteBackend
    from services.llm_client import get_client
    from services.pubmed_service import fetch_fulltext

    conn = SQLiteBackend(get_connection())
    client = get_client()
    pipeline = AIScreeningPipeline()
    print("Title screening...")
    pipeline.run_title_screening(project_id, conn, client=client)
    print("Abstract screening...")
    pipeline.run_abstract_screening(project_id, conn, client=client)

    included = conn.execute(
        "SELECT study_id, pmid, title FROM studies WHERE project_id = ? AND screening_status = 'ta_included'",
        (project_id,),
    ).fetchall()
    print(f"Title/abstract includes: {len(included)}")
    retrieved = 0
    for row in included:
        study = dict(row)
        pmid = (study.get("pmid") or "").strip()
        if not pmid:
            conn.execute(
                "UPDATE studies SET pdf_status = 'not_retrieved', screening_reason = 'Full text not retrieved' WHERE study_id = ?",
                (study["study_id"],),
            )
            continue
        try:
            full = fetch_fulltext(pmid)
        except Exception as exc:
            print(f"Full text failed {pmid}: {exc}")
            full = {"has_fulltext": False}
        text = (full.get("fulltext") or "").strip()
        if full.get("has_fulltext") and text:
            _store_pmc_text(conn, study["study_id"], text, full.get("source") or "PMC")
            retrieved += 1
        else:
            conn.execute(
                "UPDATE studies SET pdf_status = 'not_retrieved' WHERE study_id = ?",
                (study["study_id"],),
            )
    conn.commit()
    print(f"Full text retrieved: {retrieved}")

    print("Full-text screening...")
    pipeline.run_fulltext_screening(project_id, conn, client=client)

    final_includes = conn.execute(
        """SELECT study_id FROM studies
           WHERE project_id = ? AND screening_status = 'included'""",
        (project_id,),
    ).fetchall()
    extracted = 0
    for row in final_includes:
        summary = coded_extract_study(
            dict(row)["study_id"],
            project_id,
            db=conn,
            model_fn=client.as_model_fn("coded_extract"),
            reviewer="pam_protocol",
            require_fulltext=True,
        )
        if summary.get("extracted"):
            extracted += 1
    conn.commit()
    print(f"Studies with extracted fields: {extracted}")

    synthesis = _api("GET", f"/projects/{project_id}/analysis/descriptive", timeout=120)
    print("PRISMA", json.dumps(synthesis.get("prisma"), indent=2))
    print(synthesis.get("note"))
    print(f"PROJECT_ID={project_id}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
