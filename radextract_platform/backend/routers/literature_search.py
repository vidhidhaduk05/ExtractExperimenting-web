"""
Router for Multi-Database Literature Discovery.
Adapted from K-Dense-AI paper-lookup & database-lookup skills.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.literature_search_service import search_multi_database

router = APIRouter(prefix="/api/search", tags=["literature_search"])

class MultiSearchRequest(BaseModel):
    query: str
    sources: Optional[List[str]] = ["pubmed", "openalex"]
    max_per_source: int = 15

@router.post("/multi-database")
def search_literature(req: MultiSearchRequest):
    """Unified literature search across PubMed and OpenAlex with deduplication."""
    try:
        res = search_multi_database(
            query=req.query,
            sources=req.sources,
            max_per_source=req.max_per_source,
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
