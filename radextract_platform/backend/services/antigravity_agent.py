"""Antigravity agent orchestration layer for VDExtract.

This module creates and runs an Antigravity SDK ``Agent`` that orchestrates
the screening + extraction pipeline using custom tool wrappers. The agent
layer is fully additive — if ``antigravity_enabled`` is False or the SDK is
not installed, the platform works exactly as before.

Architecture:
- ``AGENT_TOOLS`` — list of callable tool wrappers from ``antigravity_tools``.
- ``SYSTEM_INSTRUCTIONS`` — guides the agent through the screening →
  extraction → recheck → gap-reporting workflow.
- ``create_agent_config()`` — builds a ``LocalAgentConfig`` with all builtin
  tools disabled, custom tools allowed via policy, token budget, and
  ``StudyProcessingResult`` as the response schema.
- ``run_screening_extraction_agent()`` — runs the agent for a single study
  and returns validated structured output.
- ``run_batch_agent()`` — processes multiple studies sequentially (the
  semaphore limits concurrent agent runs to avoid Gemini rate limits).
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any

from config import settings

logger = logging.getLogger("radextract.antigravity_agent")

# ──────────────────────────────────────────────────────────────────────
# Lazy SDK imports — fail gracefully if not installed
# ──────────────────────────────────────────────────────────────────────

_SDK_AVAILABLE = False
_Agent = None
_LocalAgentConfig = None
_CapabilitiesConfig = None
_BuiltinTools = None
_BudgetConfig = None
_policy = None

try:
    from google.antigravity import (
        Agent as _Agent,
        LocalAgentConfig as _LocalAgentConfig,
        CapabilitiesConfig as _CapabilitiesConfig,
        BuiltinTools as _BuiltinTools,
    )
    from google.antigravity.types import BudgetConfig as _BudgetConfig
    from google.antigravity.hooks import policy as _policy

    _SDK_AVAILABLE = True
except ImportError:
    logger.info("google-antigravity SDK not installed; agent endpoints will return 503")


def is_antigravity_available() -> bool:
    """Return True if the Antigravity SDK is installed and enabled."""
    return _SDK_AVAILABLE and getattr(settings, "antigravity_enabled", False)


# ──────────────────────────────────────────────────────────────────────
# Tool registry
# ──────────────────────────────────────────────────────────────────────

from services.antigravity_tools import (
    get_study,
    get_project,
    get_pdf_text,
    get_project_variables,
    screen_title,
    screen_title_abstract,
    screen_fulltext,
    extract_variables,
    recheck_extractions,
    query_biomedical_entity,
    update_screening_status,
    create_clarification_question,
)

# Ordered list — the agent sees these in its tool context.
AGENT_TOOLS = [
    get_study,
    get_project,
    get_pdf_text,
    get_project_variables,
    screen_title,
    screen_title_abstract,
    screen_fulltext,
    extract_variables,
    recheck_extractions,
    query_biomedical_entity,
    update_screening_status,
    create_clarification_question,
]

# Tool names for policy.allow() — must match function __name__.
AGENT_TOOL_NAMES = [t.__name__ for t in AGENT_TOOLS]


# ──────────────────────────────────────────────────────────────────────
# System instructions
# ──────────────────────────────────────────────────────────────────────

SYSTEM_INSTRUCTIONS = """\
You are a biomedical systematic review assistant integrated into the VDExtract
(VDExtract/RadExtract) platform. Your job is to screen studies for eligibility
and extract predefined variables from their full-text PDFs.

## Workflow

For each study you are asked to process, follow this pipeline:

1. **Retrieve context**: Call `get_project(project_id)` to read the PICO
   criteria and exclusion reasons. Call `get_study(study_id)` to see the
   study's title, abstract, and current screening status. Call
   `get_project_variables(project_id)` to see what variables need extraction.

2. **Screen by title/abstract**: Call `screen_title_abstract(study_id,
   project_id)`. If the decision is "include" with confidence >= 0.6,
   proceed to full-text screening. If "exclude" with confidence >= 0.8,
   call `update_screening_status` to record the exclusion and stop. If
   "uncertain", call `create_clarification_question` to ask a human
   reviewer and stop.

3. **Screen by full text**: Call `get_pdf_text(study_id)` to check if the
   PDF has been processed. If full_text is empty, call
   `update_screening_status` with status "awaiting_pdf" and stop. Otherwise
   call `screen_fulltext(study_id, project_id)`. Apply the same
   include/exclude/uncertain logic as step 2.

4. **Extract variables**: Call `extract_variables(study_id, project_id)`.
   This runs the full extraction pipeline (LLM + keyword search + gap rules)
   and persists results to the database.

5. **Recheck gaps**: Call `recheck_extractions(study_id, project_id)` to
   run a second-pass exhaustive search for any variables that returned
   "Not found" or "-99".

6. **Validate entities** (optional): If any extracted values look like drug
   names, gene symbols, or disease terms, call `query_biomedical_entity` to
   cross-reference them against UniProt, HPO, or PDB.

7. **Summarize**: Report the screening decision, extracted variables, any
   remaining gaps, and a brief summary of what you did.

## Rules

- Always call `update_screening_status` to persist the final screening
  decision before finishing.
- Never fabricate data. If a variable cannot be found, report it as a gap.
- Missing data codes: "-99" = not found, "-88" = scanned PDF (text not
  extractable). Do not treat these as real values.
- Use `create_clarification_question` only when screening is genuinely
  ambiguous — not as a default for low-confidence includes.
- You have a token budget. Be efficient: don't re-call tools you've already
  called for the same study unless you need fresh data.
"""


# ──────────────────────────────────────────────────────────────────────
# Concurrency control
# ──────────────────────────────────────────────────────────────────────

# Semaphore limits concurrent agent runs to avoid Gemini API rate limits.
_max_concurrent = int(os.environ.get("RADEXTRACT_ANTIGRAVITY_MAX_CONCURRENT", "3"))
_agent_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    """Lazily create the semaphore (must be created inside an event loop)."""
    global _agent_semaphore
    if _agent_semaphore is None:
        _agent_semaphore = asyncio.Semaphore(_max_concurrent)
    return _agent_semaphore


# ──────────────────────────────────────────────────────────────────────
# Agent config factory
# ──────────────────────────────────────────────────────────────────────

def create_agent_config(
    *,
    save_dir: str | None = None,
    conversation_id: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    max_total_tokens: int | None = None,
) -> Any:
    """Build a LocalAgentConfig for the VDExtract screening + extraction agent.

    Args:
        save_dir: Directory for session persistence. If None, a temp dir is used.
        conversation_id: 32+ char alphanumeric ID for session resume. If None,
            a new UUID-based ID is generated.
        api_key: Gemini API key. Falls back to GEMINI_API_KEY env var, then
            settings.antigravity_api_key.
        model: Gemini model name. Falls back to settings.antigravity_model.
        max_total_tokens: Token budget per run. Falls back to
            settings.antigravity_max_tokens_per_run (default 50000).

    Returns:
        LocalAgentConfig ready to pass to Agent().

    Raises:
        RuntimeError if the Antigravity SDK is not installed.
    """
    if not _SDK_AVAILABLE:
        raise RuntimeError(
            "google-antigravity SDK is not installed. "
            "Install with: pip install google-antigravity"
        )

    from services.antigravity_schemas import StudyProcessingResult

    # Resolve API key
    try:
        from services import llm_config_service
        cfg_key = llm_config_service.get_active_config(mask_keys=False).get("active_key")
    except Exception:
        cfg_key = None

    resolved_key = (
        api_key
        or cfg_key
        or os.environ.get("GEMINI_API_KEY")
        or getattr(settings, "antigravity_api_key", "")
        or "AQ.Ab8RN6KpRDE0t3Zij8KVIm8jnloStXmx1UlzxjcMfcWLGYqKKg"
    )

    # Resolve model
    resolved_model = model or getattr(settings, "antigravity_model", "gemini-2.5-flash")

    # Resolve token budget
    resolved_budget = max_total_tokens or getattr(
        settings, "antigravity_max_tokens_per_run", 50000
    )

    # Generate conversation_id if not provided (must be 32+ chars, alphanumeric+hyphens)
    resolved_conv_id = conversation_id or f"vdextract-{uuid.uuid4()}-agent"

    # Build capabilities: disable ALL builtin tools
    capabilities = _CapabilitiesConfig(enabled_tools=[])

    # Build policies: deny everything, then allow only our custom tools
    policies = [_policy.deny_all()]
    for tool_name in AGENT_TOOL_NAMES:
        policies.append(_policy.allow(tool_name))

    # Build budget config
    budget = _BudgetConfig(max_total_tokens=resolved_budget)

    config = _LocalAgentConfig(
        system_instructions=SYSTEM_INSTRUCTIONS,
        capabilities=capabilities,
        tools=AGENT_TOOLS,
        policies=policies,
        response_schema=StudyProcessingResult,
        budget_config=budget,
        api_key=resolved_key,
        model=resolved_model,
        save_dir=save_dir,
        conversation_id=resolved_conv_id,
    )

    return config


# ──────────────────────────────────────────────────────────────────────
# Agent run functions
# ──────────────────────────────────────────────────────────────────────

async def run_screening_extraction_agent(
    study_id: str,
    project_id: str,
    save_dir: str | None = None,
) -> dict:
    """Run the Antigravity agent to screen and extract a single study.

    The agent autonomously calls tools to retrieve context, screen the study,
    extract variables, recheck gaps, and persist results. Returns the
    validated ``StudyProcessingResult`` as a dict.

    Args:
        study_id: The study to process.
        project_id: The project the study belongs to.
        save_dir: Optional directory for session persistence.

    Returns:
        Dict matching the StudyProcessingResult schema. On error, returns
        {"study_id": ..., "project_id": ..., "error": str, "summary": str}.

    Raises:
        RuntimeError if Antigravity is not available.
    """
    if not is_antigravity_available():
        raise RuntimeError(
            "Antigravity agent is not available. Ensure the SDK is installed "
            "and RADEXTRACT_ANTIGRAVITY_ENABLED=true."
        )

    async with _get_semaphore():
        logger.info(f"Starting agent for study {study_id} in project {project_id}")

        config = create_agent_config(save_dir=save_dir)

        prompt = (
            f"Process study '{study_id}' in project '{project_id}'. "
            f"Follow the full screening and extraction workflow: "
            f"retrieve context, screen by title/abstract, screen by full text "
            f"if available, extract all project variables, recheck for gaps, "
            f"and persist the screening decision. "
            f"Return a complete StudyProcessingResult."
        )

        try:
            async with _Agent(config) as agent:
                response = await agent.chat(prompt)
                structured = await response.structured_output()

                if structured is not None:
                    # Ensure study_id and project_id are set
                    if isinstance(structured, dict):
                        result = structured
                    else:
                        result = structured.model_dump()
                    result.setdefault("study_id", study_id)
                    result.setdefault("project_id", project_id)
                    logger.info(
                        f"Agent completed for study {study_id}: "
                        f"screening={result.get('screening', {}).get('decision', 'unknown')}"
                    )
                    return result
                else:
                    # Fallback: get text response
                    text = await response.text()
                    logger.warning(
                        f"Agent returned no structured output for study {study_id}. "
                        f"Text: {text[:200]}..."
                    )
                    return {
                        "study_id": study_id,
                        "project_id": project_id,
                        "screening": {"decision": "uncertain", "confidence": 0.0},
                        "extractions": {"extracted": [], "gaps": [], "recheck_found": []},
                        "summary": text[:500] if text else "Agent returned no structured output.",
                    }
        except Exception as e:
            logger.error(f"Agent failed for study {study_id}: {e}", exc_info=True)
            return {
                "study_id": study_id,
                "project_id": project_id,
                "error": str(e),
                "screening": {"decision": "uncertain", "confidence": 0.0},
                "extractions": {"extracted": [], "gaps": [], "recheck_found": []},
                "summary": f"Agent error: {e}",
            }


async def run_batch_agent(
    study_ids: list[str],
    project_id: str,
    save_dir: str | None = None,
) -> dict:
    """Run the Antigravity agent for multiple studies in a batch.

    Processes studies sequentially (the semaphore limits concurrency across
    any parallel callers). Returns a batch result dict with per-study results
    and aggregate counts.

    Args:
        study_ids: List of study IDs to process.
        project_id: The project all studies belong to.
        save_dir: Optional directory for session persistence.

    Returns:
        Dict matching the BatchProcessingResult schema.
    """
    if not is_antigravity_available():
        raise RuntimeError(
            "Antigravity agent is not available. Ensure the SDK is installed "
            "and RADEXTRACT_ANTIGRAVITY_ENABLED=true."
        )

    results = []
    errors = []
    included = 0
    excluded = 0
    uncertain = 0

    for study_id in study_ids:
        try:
            result = await run_screening_extraction_agent(
                study_id=study_id,
                project_id=project_id,
                save_dir=save_dir,
            )
            results.append(result)

            decision = result.get("screening", {}).get("decision", "uncertain")
            if decision == "include":
                included += 1
            elif decision == "exclude":
                excluded += 1
            else:
                uncertain += 1

            if result.get("error"):
                errors.append(f"Study {study_id}: {result['error']}")

        except Exception as e:
            logger.error(f"Batch agent failed for study {study_id}: {e}", exc_info=True)
            errors.append(f"Study {study_id}: {e}")
            results.append({
                "study_id": study_id,
                "project_id": project_id,
                "error": str(e),
                "screening": {"decision": "uncertain", "confidence": 0.0},
                "extractions": {"extracted": [], "gaps": [], "recheck_found": []},
                "summary": f"Error: {e}",
            })
            uncertain += 1

    return {
        "results": results,
        "total_studies": len(study_ids),
        "included": included,
        "excluded": excluded,
        "uncertain": uncertain,
        "errors": errors,
    }
