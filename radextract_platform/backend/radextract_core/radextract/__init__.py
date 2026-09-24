"""
RadExtract — radiology systematic review data extraction platform.

Built on the LitExtract engine (multi-agent extraction, type-aware reconciliation,
config-driven validation, append-only writing, audit sidecars), extended with:
  - PICOS-driven dynamic schema generation
  - IBM Docling for structured PDF-to-JSON parsing with bounding boxes
  - Graphify as a navigation/token-reduction layer
  - Two-stage PRISMA screening (title/abstract → full-text)
  - Pre-review modules (evidence scanning, query generation, PubMed auto-import)
  - QUADAS-2/ROBINS-I quality assessment
  - Web app with Excel-like grid and click-to-highlight PDF viewer
  - Dual Excel + JSON/database output
"""
from .screening import (
    ScreeningDecision,
    Screener,
    DeterministicScreener,
    LLMScreener,
    screen_batch,
    get_ready_papers,
    advance_status,
)
