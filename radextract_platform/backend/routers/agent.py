"""Antigravity Agent Router.

Provides API endpoints for the Antigravity SDK-powered screening + extraction
agent. These endpoints are additive to the existing AI screening pipeline —
they offer an alternative orchestration layer that uses the Antigravity Agent
for autonomous, multi-tool reasoning.

Endpoints:
- POST /api/agent/screen-and-extract  — process a single study (synchronous)
- POST /api/agent/batch               — process multiple studies (background)
- GET  /api/agent/status              — check if the agent layer is available
- GET  /api/agent/batch/{job_id}      — get batch job status (in-memory)

When ``antigravity_enabled`` is False, all endpoints except /status return 503.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import get_db
from dependencies import check_project_access, get_current_user_optional
from services.db_backend import DBBackend
from services.antigravity_agent import (
    is_antigravity_available,
    run_screening_extraction_agent,
    run_batch_agent,
)

logger = logging.getLogger("radextract.agent_router")

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ──────────────────────────────────────────────────────────────────────
# Request / Response models
# ──────────────────────────────────────────────────────────────────────

class AgentRequest(BaseModel):
    """Request to process a single study with the agent."""

    study_id: str = Field(..., description="The study to process.")
    project_id: str = Field(..., description="The project the study belongs to.")


class BatchAgentRequest(BaseModel):
    """Request to process multiple studies with the agent."""

    study_ids: list[str] = Field(
        ..., description="List of study IDs to process."
    )
    project_id: str = Field(..., description="The project all studies belong to.")


class AgentResponse(BaseModel):
    """Response from a single-study agent run."""

    study_id: str
    project_id: str
    agent_summary: dict = Field(
        default_factory=dict,
        description="Full StudyProcessingResult from the agent.",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Antigravity conversation ID for session resume.",
    )


class BatchAgentResponse(BaseModel):
    """Response from a batch agent run."""

    job_id: str = Field(..., description="Background job ID for status polling.")
    project_id: str
    total_studies: int
    status: str = Field(
        ..., description="Job status: 'queued', 'running', 'completed', 'failed'."
    )


class AgentStatusResponse(BaseModel):
    """Status of the Antigravity agent layer."""

    available: bool
    sdk_installed: bool
    enabled: bool
    model: str = ""
    max_concurrent: int = 0


# ──────────────────────────────────────────────────────────────────────
# In-memory batch job tracking (for background tasks)
# ──────────────────────────────────────────────────────────────────────

_batch_jobs: dict[str, dict] = {}


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=AgentStatusResponse)
async def get_agent_status():
    """Check whether the Antigravity agent layer is available."""
    from services.antigravity_agent import _SDK_AVAILABLE, _max_concurrent
    from config import settings

    return AgentStatusResponse(
        available=is_antigravity_available(),
        sdk_installed=_SDK_AVAILABLE,
        enabled=getattr(settings, "antigravity_enabled", False),
        model=getattr(settings, "antigravity_model", "gemini-2.5-flash"),
        max_concurrent=_max_concurrent,
    )


@router.post("/screen-and-extract", response_model=AgentResponse)
async def screen_and_extract(
    body: AgentRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run the Antigravity agent to screen and extract a single study.

    The agent autonomously:
    1. Retrieves project PICO criteria and study metadata
    2. Screens by title/abstract, then full text if available
    3. Extracts all project variables from the PDF
    4. Rechecks for gaps and validates biomedical entities
    5. Persists the screening decision to the database

    Returns the full StudyProcessingResult as ``agent_summary``.
    """
    if not is_antigravity_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Antigravity agent is not available. Install the SDK "
                "(pip install google-antigravity) and set "
                "RADEXTRACT_ANTIGRAVITY_ENABLED=true and GEMINI_API_KEY."
            ),
        )

    check_project_access(conn, body.project_id, user)

    # Verify the study exists
    study = conn.get("studies", body.study_id)
    if not study:
        raise HTTPException(
            status_code=404,
            detail=f"Study '{body.study_id}' not found.",
        )

    try:
        result = await run_screening_extraction_agent(
            study_id=body.study_id,
            project_id=body.project_id,
        )

        return AgentResponse(
            study_id=body.study_id,
            project_id=body.project_id,
            agent_summary=result,
            conversation_id=result.get("conversation_id"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Agent endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")


@router.post("/batch", response_model=BatchAgentResponse)
async def batch_screen_and_extract(
    body: BatchAgentRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Start a batch agent run for multiple studies.

    Returns immediately with a job_id. Poll GET /api/agent/batch/{job_id}
    for status and results. The batch runs as a background asyncio task.
    """
    if not is_antigravity_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Antigravity agent is not available. Install the SDK "
                "(pip install google-antigravity) and set "
                "RADEXTRACT_ANTIGRAVITY_ENABLED=true and GEMINI_API_KEY."
            ),
        )

    check_project_access(conn, body.project_id, user)

    if not body.study_ids:
        raise HTTPException(status_code=400, detail="study_ids must not be empty.")

    job_id = str(uuid.uuid4())
    _batch_jobs[job_id] = {
        "job_id": job_id,
        "project_id": body.project_id,
        "total_studies": len(body.study_ids),
        "status": "queued",
        "results": None,
        "error": None,
    }

    # Launch background task
    asyncio.create_task(
        _run_batch_background(job_id, body.study_ids, body.project_id)
    )

    return BatchAgentResponse(
        job_id=job_id,
        project_id=body.project_id,
        total_studies=len(body.study_ids),
        status="queued",
    )


@router.get("/batch/{job_id}")
async def get_batch_status(job_id: str):
    """Get the status and results of a batch agent job."""
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Batch job '{job_id}' not found.",
        )
    return job


# ──────────────────────────────────────────────────────────────────────
# Background task
# ──────────────────────────────────────────────────────────────────────

async def _run_batch_background(
    job_id: str,
    study_ids: list[str],
    project_id: str,
):
    """Run the batch agent in the background and update job status."""
    job = _batch_jobs[job_id]
    job["status"] = "running"

    try:
        result = await run_batch_agent(
            study_ids=study_ids,
            project_id=project_id,
        )
        job["results"] = result
        job["status"] = "completed"
        logger.info(
            f"Batch job {job_id} completed: "
            f"{result.get('included', 0)} included, "
            f"{result.get('excluded', 0)} excluded, "
            f"{result.get('uncertain', 0)} uncertain"
        )
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        logger.error(f"Batch job {job_id} failed: {e}", exc_info=True)
