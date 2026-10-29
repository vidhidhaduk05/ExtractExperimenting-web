"""Pydantic schemas for Antigravity agent structured output.

These models are passed as ``response_schema`` to ``LocalAgentConfig`` so the
agent returns validated, structured data instead of free-form text. The SDK
converts the Pydantic model to a JSON schema and validates the model's
response against it via ``response.structured_output()``.

Design notes:
- All fields have defaults so a partial/empty agent response still validates.
- ``reason_code`` uses a constrained vocabulary matching VDExtract's existing
  screening reason codes.
- Missing-data sentinel values (-99 not found, -88 scanned PDF) are documented
  inline so the agent understands what they mean when it sees them in tool
  results.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────
# Screening schemas
# ──────────────────────────────────────────────────────────────────────

class ScreeningResult(BaseModel):
    """Structured result of a screening decision (title, abstract, or full-text)."""

    decision: Literal["include", "exclude", "uncertain"] = Field(
        default="uncertain",
        description="Eligibility decision for the study.",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence score from 0.0 (no confidence) to 1.0 (certain).",
    )
    reason: str = Field(
        default="",
        description="Human-readable explanation for the screening decision.",
    )
    reason_code: str = Field(
        default="",
        description=(
            "Short machine-readable code for the exclusion/uncertainty reason. "
            "Common values: 'population_mismatch', 'intervention_mismatch', "
            "'outcome_mismatch', 'study_design', 'no_full_text', "
            "'ambiguous_population', 'ambiguous_intervention', "
            "'data_not_extractable', 'other'."
        ),
    )
    evidence_quote: str = Field(
        default="",
        description=(
            "Direct quote from the study title/abstract/full text that "
            "supports the decision. Empty for title-only screening."
        ),
    )
    needs_clarification: bool = Field(
        default=False,
        description=(
            "True when a human reviewer should be asked to resolve ambiguity "
            "before a final decision is made."
        ),
    )
    clarification_question: str = Field(
        default="",
        description=(
            "If needs_clarification is True, the question to present to the "
            "human reviewer."
        ),
    )


# ──────────────────────────────────────────────────────────────────────
# Extraction schemas
# ──────────────────────────────────────────────────────────────────────

class ExtractionItem(BaseModel):
    """A single extracted variable value with provenance."""

    variable_name: str = Field(
        default="",
        description="Name of the project variable being extracted.",
    )
    value: str = Field(
        default="Not found",
        description=(
            "Extracted value. 'Not found' or '-99' means no evidence was found. "
            "'-88' means the PDF was scanned and text could not be extracted."
        ),
    )
    source: str = Field(
        default="",
        description=(
            "Where the value was found: 'llm' (LLM extraction), 'keyword' "
            "(exhaustive keyword search), 'gap_rule' (gap rule inference), "
            "or 'not_found'."
        ),
    )
    page: Optional[int] = Field(
        default=None,
        description="PDF page number where the evidence was found, if applicable.",
    )
    confidence_tag: str = Field(
        default="",
        description=(
            "Confidence tag from the extraction engine: "
            "'[VS]' very strong, '[S]' strong, '[DS]' somewhat, "
            "'[W]' weak, '[VW]' very weak, '[NF]' not found."
        ),
    )


class ExtractionResult(BaseModel):
    """Structured result of variable extraction for a study."""

    extracted: list[ExtractionItem] = Field(
        default_factory=list,
        description="List of extracted variable values with provenance.",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description=(
            "Names of variables that could not be extracted (value is "
            "'Not found' or '-99') after all extraction passes."
        ),
    )
    recheck_found: list[str] = Field(
        default_factory=list,
        description=(
            "Names of variables that were found during the recheck pass "
            "but were initially missing."
        ),
    )


# ──────────────────────────────────────────────────────────────────────
# Composite study processing schema
# ──────────────────────────────────────────────────────────────────────

class StudyProcessingResult(BaseModel):
    """Complete result of agent-driven screening + extraction for one study.

    This is the top-level ``response_schema`` passed to the agent. It captures
    the full pipeline output: screening decision, extracted variables, gaps,
    and a natural-language summary.
    """

    study_id: str = Field(default="", description="The study that was processed.")
    project_id: str = Field(default="", description="The project the study belongs to.")
    screening: ScreeningResult = Field(
        default_factory=ScreeningResult,
        description="Screening decision for the study.",
    )
    extractions: ExtractionResult = Field(
        default_factory=ExtractionResult,
        description="Extracted variable values and gaps.",
    )
    summary: str = Field(
        default="",
        description=(
            "Natural-language summary of what the agent did: which tools it "
            "called, key decisions, and any issues encountered."
        ),
    )


# ──────────────────────────────────────────────────────────────────────
# Batch processing schema
# ──────────────────────────────────────────────────────────────────────

class BatchProcessingResult(BaseModel):
    """Result of processing multiple studies in a batch."""

    results: list[StudyProcessingResult] = Field(
        default_factory=list,
        description="Per-study processing results.",
    )
    total_studies: int = Field(
        default=0,
        description="Total number of studies in the batch.",
    )
    included: int = Field(default=0, description="Number of studies included.")
    excluded: int = Field(default=0, description="Number of studies excluded.")
    uncertain: int = Field(default=0, description="Number of studies with uncertain screening.")
    errors: list[str] = Field(
        default_factory=list,
        description="Per-study error messages, if any.",
    )
