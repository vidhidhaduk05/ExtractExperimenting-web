"""PubMed router: endpoints for fetching study metadata and full text from PubMed."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import get_db
from services.db_backend import DBBackend
from services import pubmed_service

router = APIRouter(prefix="/api", tags=["pubmed"])


class BatchSearchRequest(BaseModel):
    query: str
    max_results: int = 50
    project_id: str = ""  # Optional: look up project's PubMed API key


class PreviewSearchRequest(BaseModel):
    query: str
    project_id: str = ""
    sample_size: int = 5


def _get_project_api_key(conn, project_id: str) -> str:
    """Look up the PubMed API key stored for a project."""
    if not project_id:
        return ""
    row = conn.execute(
        "SELECT pubmed_api_key FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    return (row["pubmed_api_key"] or "") if row else ""


@router.post("/pubmed/preview")
async def pubmed_preview(body: PreviewSearchRequest, conn: DBBackend = Depends(get_db)):
    """Preview / dry-run search PubMed. Returns total count and sample results without importing."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    try:
        api_key = _get_project_api_key(conn, body.project_id)
        result = pubmed_service.preview_search(
            query=body.query,
            project_id=body.project_id,
            api_key=api_key,
            sample_size=body.sample_size,
            conn=conn,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PubMed preview search failed: {str(e)}")


@router.get("/pubmed/lookup/{pmid}")
async def pubmed_lookup(pmid: str, project_id: str = "", conn: DBBackend = Depends(get_db)):
    """Fetch study metadata by PMID from PubMed E-utilities."""
    try:
        api_key = _get_project_api_key(conn, project_id)
        result = pubmed_service.fetch_by_pmid(pmid, api_key=api_key)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PubMed lookup failed: {str(e)}")


@router.get("/pubmed/fulltext/{pmid}")
async def pubmed_fulltext(pmid: str, project_id: str = "", conn: DBBackend = Depends(get_db)):
    """Attempt to retrieve full text for a PMID via PMC Open Access or Unpaywall."""
    try:
        api_key = _get_project_api_key(conn, project_id)
        result = pubmed_service.fetch_fulltext(pmid, api_key=api_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Full-text retrieval failed: {str(e)}")


@router.post("/pubmed/batch")
async def pubmed_batch(body: BatchSearchRequest, conn: DBBackend = Depends(get_db)):
    """Batch search PubMed by query string. Returns metadata + abstracts for matching articles."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    if body.max_results < 1 or body.max_results > 200:
        raise HTTPException(status_code=400, detail="max_results must be between 1 and 200")
    try:
        api_key = _get_project_api_key(conn, body.project_id)
        results = pubmed_service.batch_search(body.query, api_key=api_key, max_results=body.max_results)
        return {"query": body.query, "count": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PubMed search failed: {str(e)}")


# NOTE: pubmed-key endpoints are defined in routers/projects.py (with proper
# PubMedKeyUpdate body model). Do NOT add duplicate endpoints here — having
# the same route in two routers causes undefined FastAPI behavior.
