"""
litextract — a generic, config-driven, multi-agent literature data-extraction engine.

Domain-agnostic core. A *project* is defined entirely by a config folder
(codebook + schema.yaml + validation_rules.yaml + prompts/); nothing in this
package is specific to any review. The CVR systematic review ships as the first
example project under ``configs/cvr/``.

Extraction model: two independent extractors (Agent A, Agent B) → type-aware
reconciliation → a third "referee" adjudicator on disagreements → append-only
workbook write + full audit sidecars.

Public surface:
    load_project            -> Project (codebook + schema + rules + prompts)
    parse_document          -> parsed document dict
    Extractor backends      -> DeterministicBackend, AgentBackend
    reconcile               -> per-cell agreement/disagreement audit
    Adjudicator backends    -> DeterministicAdjudicator, AgentAdjudicator
    validate                -> (issues, summary)
    append_records          -> append-only workbook writer
    run                     -> full per-document pipeline
"""
from __future__ import annotations

__version__ = "0.1.0"

from .schema import load_project, Project, Schema  # noqa: F401
from .codebook import load_codebook, controlled_vocab, verify_headers  # noqa: F401
from .document import parse_document, parse_text, parse_pdf_pipeline, find_in_document, in_document  # noqa: F401
from .extract import Extractor, DeterministicBackend, AgentBackend, Record  # noqa: F401
from .reconcile import reconcile, compare_values  # noqa: F401
from .adjudicate import Adjudicator, DeterministicAdjudicator, AgentAdjudicator  # noqa: F401
from .validate import validate  # noqa: F401
from .writer import append_records  # noqa: F401
from .pipeline import run  # noqa: F401
from .layout import detect_page_layout, PageLayout, LayoutRegion  # noqa: F401
from .ocr import OCRBackend, NullOCRBackend, TesseractFallback, UnlimitedOCRBackend, UnlimitedOCRServerBackend  # noqa: F401
from .tsr import TSRBackend, PdfplumberTSR, VisionTSR, HybridTSR  # noqa: F401
from .structured import DocumentJSON, PageJSON, TableJSON, FigureJSON, to_parsed_dict, from_parsed_dict  # noqa: F401

__all__ = [
    "load_project", "Project", "Schema",
    "load_codebook", "controlled_vocab", "verify_headers",
    "parse_document", "parse_text", "parse_pdf_pipeline", "find_in_document", "in_document",
    "Extractor", "DeterministicBackend", "AgentBackend", "Record",
    "reconcile", "compare_values",
    "Adjudicator", "DeterministicAdjudicator", "AgentAdjudicator",
    "validate", "append_records", "run",
    "detect_page_layout", "PageLayout", "LayoutRegion",
    "OCRBackend", "NullOCRBackend", "TesseractFallback", "UnlimitedOCRBackend", "UnlimitedOCRServerBackend",
    "TSRBackend", "PdfplumberTSR", "VisionTSR", "HybridTSR",
    "DocumentJSON", "PageJSON", "TableJSON", "FigureJSON", "to_parsed_dict", "from_parsed_dict",
]
