"""
Router for Multi-Database Literature Discovery.
Adapted from K-Dense-AI paper-lookup & database-lookup skills.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from services.literature_search_service import search_multi_database

logger = logging.getLogger("radextract.literature_search")
router = APIRouter(prefix="/api/search", tags=["literature_search"])


class MultiSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Search query string")
    sources: Optional[List[str]] = ["pubmed", "openalex"]
    max_per_source: int = Field(15, ge=1, le=100, description="Max results per source")


@router.post("/multi-database")
def search_literature(req: MultiSearchRequest):
    """Unified literature search across PubMed and OpenAlex with deduplication."""
    clean_query = req.query.strip()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty or whitespace only.",
        )
    try:
        res = search_multi_database(
            query=clean_query,
            sources=req.sources,
            max_per_source=req.max_per_source,
        )
        return {"success": True, **res}
    except Exception as e:
        logger.exception("Multi-database literature search failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while executing the literature search.",
        )
