# RadExtract — Agent Handoff Document

> **Read this entire file before touching any code.** It contains every detail
> you need to continue this project: what exists, how it works, what broke, how
> it was fixed, and exactly what to build next. Do not skip sections.

---

## 0. TL;DR — What Is This Project?

RadExtract is a **full-lifecycle systematic review data extraction platform
for radiology research articles**. It takes a user from evidence scanning
through a published extraction workbook with highlighted PDF sources.

It is built on top of an existing engine called **LitExtract** (multi-agent
extraction, type-aware reconciliation, config-driven validation, append-only
writing, audit sidecars). RadExtract adds:

1. **PICOS-driven dynamic schema** — LLM generates topic-specific extraction
   fields from the user's PICOS input, merged with a base radiology template
2. **IBM Docling** — PDF to structured JSON with bounding boxes for highlight overlay
3. **Graphify** — navigation layer for token savings (cloned to `/workspace/graphify/`)
4. **Two-stage PRISMA screening** — title/abstract then full-text, with tags
5. **Pre-review modules** — evidence scanning, query generation, PubMed auto-import
6. **QUADAS-2/ROBINS-I** quality assessment with conditional validation
7. **Web app** — Excel-like grid + PDF.js viewer with click-to-highlight
8. **Dual output** — Excel + JSON (flat + nested) + SQLite

**Current status**: Phase 1 (Foundation) is COMPLETE. All 130 tests pass.
Phases 2-5 remain (see Section 11).

---

## 1. Directory Structure

```
/workspace/radextract/
├── HANDOFF.md                    ← THIS FILE
├── litextract/                   ← The engine core (modified from original)
│   ├── __init__.py
│   ├── adjudicate.py             ← Referee adjudicator (resolves disagreements)
│   ├── audit.py                  ← Audit sidecar writer (4 sidecars)
│   ├── codebook.py               ← Codebook loader (MODIFIED: numeric range detection)
│   ├── document.py               ← PDF/text parser (pdfplumber-based)
│   ├── extract.py                ← Extractor interface + DeterministicBackend + AgentBackend
│   ├── layout.py                 ← Layout detection (region + page layout)
│   ├── ocr.py                    ← OCR backend interface
│   ├── pipeline.py               ← Pipeline orchestrator (run + run_batch)
│   ├── reconcile.py              ← Type-aware cell comparison
│   ├── schema.py                 ← Schema + Project bundle loader
│   ├── structured.py             ← Structured data extraction helpers
│   ├── tsr.py                    ← Table structure recognition
│   ├── validate.py               ← Config-driven validation (MODIFIED: +conditional_required)
│   └── writer.py                 ← Append-only Excel writer
│
├── radextract/                   ← NEW RadExtract package
│   ├── __init__.py               ← Public API exports
│   ├── screening.py              ← PRISMA two-stage screening
│   ├── picos_schema_generator.py ← PICOS → dynamic schema generation
│   ├── document_processor.py     ← Docling wrapper (PDF → JSON + bounding boxes)
│   └── dual_writer.py            ← Multi-format output (Excel + JSON + SQLite)
│
├── configs/
│   ├── radiology_base/           ← Base radiology template (107 fields, 5 sheets)
│   │   ├── schema.yaml           ← Entity graph + field types + missing tokens
│   │   ├── codebook.xlsx         ← 107 fields with dropdowns
│   │   ├── validation_rules.yaml ← 8 referential + 10 range + 11 conditional_required
│   │   ├── prompts/
│   │   │   └── field_prompts.json← 107 per-field extraction prompts
│   │   ├── project.yaml          ← Project metadata
│   │   ├── picos.yaml            ← (not present in base; generated per-project)
│   │   ├── base_schema.yaml      ← OLD COPY (ignore; use schema.yaml)
│   │   ├── base_codebook.xlsx    ← OLD COPY (ignore; use codebook.xlsx)
│   │   ├── base_validation_rules.yaml ← OLD COPY (ignore)
│   │   ├── base_prompts.json     ← OLD COPY (ignore)
│   │   └── prompts.json          ← OLD COPY (ignore; use prompts/field_prompts.json)
│   ├── cvr/                      ← Existing CVR config (cardiovascular radiology)
│   └── toy_clinical/             ← Toy config for testing
│
├── configs_existing/             ← Backup of original configs (don't modify)
│   ├── cvr/
│   └── toy_clinical/
│
├── scripts/
│   ├── generate_base_codebook.py ← Script that generated codebook.xlsx
│   └── generate_base_prompts.py  ← Script that generated field_prompts.json
│
├── tests/                        ← NEW RadExtract tests (87 tests)
│   ├── test_conditional_required.py  ← 11 tests
│   ├── test_screening.py             ← 17 tests
│   ├── test_picos_schema.py          ← 13 tests
│   ├── test_document_processor.py    ← 23 tests
│   ├── test_dual_writer.py           ← 19 tests
│   └── test_end_to_end.py            ← 4 tests
│
└── tests_existing/               ← Original LitExtract tests (43 tests)
    ├── conftest.py
    ├── test_01_config_load.py
    ├── test_02_agreement.py
    ├── test_03_type_aware_matching.py
    ├── test_04_adjudicator.py
    ├── test_05_validation_config_driven.py
    ├── test_06_append_only_writer.py
    ├── test_07_reusability.py
    ├── test_08_audit_completeness.py
    └── test_09_layout_detection.py
```

**IMPORTANT**: The `configs/radiology_base/` directory has BOTH standard-named
files (`schema.yaml`, `codebook.xlsx`, etc.) AND old `base_`-prefixed copies
(`base_schema.yaml`, `base_codebook.xlsx`, etc.). **Always use the
standard-named files.** The `base_` prefixed files are leftover copies from
early development. The PICOS generator and `load_project()` read the
standard-named files.

---

## 2. Environment Setup

### Python version
- Python 3.11.13

### Virtual environment
- Located at `/workspace/.venv/`
- Activate: `source /workspace/.venv/bin/activate`
- Or just use the full path: `/workspace/.venv/bin/python`

### Key dependencies (already installed)
```
docling==2.121.0          # IBM Docling for PDF processing
openpyxl                  # Excel read/write
pyyaml                    # YAML config files
pdfplumber                # Fallback PDF parser (used by litextract.document)
pytest                    # Test runner
```

### Environment variables
```bash
export PYTHONPATH=/workspace/radextract
export TORCH_COMPILE_DISABLE=1    # Required for Docling (avoids PyTorch warnings)
export TORCHDYNAMO_DISABLE=1      # Required for Docling
```

### How to install new packages
```bash
uv pip install <package>    # NEVER use plain pip install
```

---

## 3. How to Run Tests

### Full test suite (130 tests, ~16 seconds)
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/ tests_existing/ -q
```

### Only new RadExtract tests (87 tests)
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/ -q
```

### Only existing LitExtract tests (43 tests)
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests_existing/ -q
```

### Verbose output with test names
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/ tests_existing/ -v
```

### Single test file
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/test_end_to_end.py -v
```

### Single test
```bash
cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/test_end_to_end.py::TestEndToEnd::test_full_pipeline_deterministic -v
```

**CRITICAL**: You MUST set `PYTHONPATH=/workspace/radextract` or imports will fail.
The `litextract` and `radextract` packages are not installed via pip; they are
imported from the project root via PYTHONPATH.

---

## 4. Architecture — How Everything Connects

### The full pipeline flow (end-to-end)

```
User enters PICOS
    ↓
PICOS → Schema Generator (picos_schema_generator.py)
    → Merges base radiology template + LLM-generated topic fields
    → Writes complete config folder (schema.yaml, codebook.xlsx, validation_rules.yaml, prompts/)
    ↓
Auto-Importer (NOT YET BUILT — Phase 3)
    → Fetches papers from PubMed
    → Downloads PDFs from PMC open access
    ↓
Screening (screening.py)
    → Stage 1: Title/Abstract screening (LLM or deterministic)
    → Stage 2: Full-text screening (only for TA-included papers with PDFs)
    → Tags: include, exclude, uncertain, needs_pdf_upload, ready_for_extraction
    → PRISMA flow tracking
    ↓
Document Processing (document_processor.py)
    → PDF → Docling → structured JSON + bounding box annotations
    → Three backends: DoclingProcessor, FallbackProcessor, MockProcessor
    ↓
Extraction (litextract/pipeline.py — the CORE engine)
    → Agent A extracts all fields (using config prompts)
    → Agent B extracts all fields (blind, independent)
    → Reconcile: type-aware cell comparison (int vs float tolerance, enum exact, etc.)
    → Adjudicate: referee resolves disagreements
    → Assemble: merge agreed + adjudicated records
    → Validate: config-driven rules (required, vocab, range, conditional_required, etc.)
    ↓
Dual Output (dual_writer.py)
    → Excel workbook (append-only, color-coded flags)
    → JSON flat (all sheets, all rows)
    → JSON nested (entity-graph hierarchy)
    → SQLite (5 tables with FKs, indexes, column-name mapping)
```

### Module dependency graph

```
radextract.screening           → (standalone, no litextract deps)
radextract.picos_schema_generator → litextract.schema (load_project for testing)
                                   → yaml, openpyxl
radextract.document_processor  → litextract.document (parse_document, parse_text)
radextract.dual_writer         → litextract.writer (append_records, FLAG_FILLS)
                                   → litextract.schema (Project for schema info)

litextract.pipeline            → litextract.document, extract, reconcile, adjudicate,
                                   validate, writer, audit
litextract.schema              → litextract.codebook (load_codebook)
litextract.validate            → (uses Project for rules, schema, codebook, vocab)
```

---

## 5. Module-by-Module API Reference

### 5.1 radextract.screening

```python
from radextract.screening import (
    ScreeningDecision,    # dataclass
    Screener,             # interface
    DeterministicScreener,# for tests/demos
    LLMScreener,          # for production
    screen_batch,         # batch screening with PRISMA flow
    get_ready_papers,     # filter papers ready for extraction
    advance_status,       # compute final status from TA + FT decisions
)
```

**ScreeningDecision dataclass:**
```python
@dataclass
class ScreeningDecision:
    paper_id: str          # from paper["pmid"] or ["doi"] or ["id"]
    stage: str             # "title_abstract" or "full_text"
    status: str            # "include", "exclude", "uncertain", "needs_pdf"
    reason: str = ""
    confidence: float = 1.0
    picos_matches: dict = {}  # {P: bool, I: bool, C: bool, O: bool, S: bool}
```

**DeterministicScreener:**
```python
# Option 1: per-paper decisions with stage-specific keys
screener = DeterministicScreener(decisions_by_id={
    "111": {"ta_status": "include", "ta_reason": "relevant",
            "ft_status": "include", "ft_reason": "meets criteria"},
    "222": {"ta_status": "exclude", "ta_reason": "wrong topic"},
})

# Option 2: per-paper decisions with generic keys (legacy format)
screener = DeterministicScreener(decisions_by_id={
    "111": {"status": "include", "reason": "relevant"},
})

# Option 3: same decision for all papers
screener = DeterministicScreener(default_status="include")

# Option 4: function-based
screener = DeterministicScreener(decision_fn=lambda paper, picos, stage: {...})
```

**IMPORTANT — dict format handling:**
The `screen_title_abstract` method handles TWO dict formats:
1. `{"ta_status": "include", "ta_reason": "..."}` — stage-specific keys
2. `{"status": "include", "reason": "..."}` — generic keys

The `screen_full_text` method handles:
1. `{"ft_status": "include", "ft_reason": "..."}` — stage-specific keys
2. `ScreeningDecision` objects with `stage == "full_text"`

If you pass a dict with `status`/`reason` to `screen_full_text`, it will NOT
be handled (it falls through to default). This is by design — the generic
format is only for title/abstract.

**screen_batch function:**
```python
result = screen_batch(
    papers,           # list of dicts: [{"pmid": "111", "title": "...", "abstract": "..."}, ...]
    screener,         # a Screener instance
    picos,            # dict: {"population": "...", "intervention": "...", ...}
    full_texts=None,  # optional: {"paper_id": "full text string", ...}
    has_pdf_fn=None,  # optional: callable(paper) -> bool
)
# Returns:
# {
#     "decisions": [decision_dict, ...],
#     "final_statuses": {paper_id: status_str},
#     "prisma_flow": {identified, ta_screened, ta_included, ...},
#     "excluded_with_reasons": [{paper_id, stage, reason}, ...],
# }
```

**get_ready_papers function:**
```python
ready = get_ready_papers(
    result["final_statuses"],  # dict from screen_batch
    papers,                     # original papers list
)
# Returns list of paper dicts where status == "ready_for_extraction"
```

**advance_status function:**
```python
status = advance_status(ta_decision, ft_decision=None, has_pdf=True)
# Returns one of: "exclude_ta", "uncertain_ta", "needs_pdf_upload",
#                  "include_ta", "exclude_ft", "uncertain_ft", "ready_for_extraction"
```

### 5.2 radextract.picos_schema_generator

```python
from radextract.picos_schema_generator import (
    PICOS,                       # dataclass for PICOS input
    GeneratedField,              # dataclass for a topic-specific field
    SchemaGenerator,             # interface
    DeterministicSchemaGenerator,# for tests/demos
    LLMSchemaGenerator,          # for production
    generate_project_config,     # main function: PICOS → complete config folder
)
```

**PICOS dataclass:**
```python
@dataclass
class PICOS:
    population: str
    intervention: str
    comparator: str
    outcome: str
    study_design: str
```

**GeneratedField dataclass:**
```python
@dataclass
class GeneratedField:
    sheet: str               # "Cohort_Level" | "Protocol_Level" | "Outcome_Level"
    order: int               # column order within the sheet (continues from base)
    name: str                # Final Column Name (human-readable)
    field_type: str          # "int" | "float" | "percent" | "enum" | "free_text"
    allowed_values: list     # for enum: ["mutant", "wildtype", ...]; for others: []
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    description: str = ""
    why: str = ""
    notes: str = ""
```

**CRITICAL**: `allowed_values` is a REQUIRED positional argument (no default).
You MUST pass `[]` for non-enum fields. If you forget, you get:
`TypeError: GeneratedField.__init__() missing 1 required positional argument: 'allowed_values'`

**DeterministicSchemaGenerator:**
```python
# MUST provide fields or fields_fn, otherwise returns empty list
gen = DeterministicSchemaGenerator(fields=[GeneratedField(...), ...])
gen = DeterministicSchemaGenerator(fields_fn=lambda picos: [GeneratedField(...), ...])
# DeterministicSchemaGenerator() with NO args returns 0 fields — this is intentional
```

**generate_project_config function:**
```python
result = generate_project_config(
    picos,              # PICOS instance
    generator,          # SchemaGenerator instance
    base_config_dir,    # path to configs/radiology_base/
    output_dir,         # parent directory for generated config
    project_slug=None,  # folder name (auto-derived from PICOS if None)
)
# Returns:
# {
#     "config_dir": str,
#     "project_slug": str,
#     "n_base_fields": int,
#     "n_picos_fields": int,
#     "n_total_fields": int,
#     "fields": [codebook_row_tuple, ...],
# }
```

This function reads from the STANDARD-named files in `base_config_dir`:
- `schema.yaml` (NOT `base_schema.yaml`)
- `validation_rules.yaml` (NOT `base_validation_rules.yaml`)
- `prompts/field_prompts.json` (NOT `base_prompts.json`)
- `codebook.xlsx` (NOT `base_codebook.xlsx`)

It writes a complete config folder with:
- `schema.yaml` (base + PICOS field types merged)
- `validation_rules.yaml` (base + PICOS range rules merged)
- `prompts/field_prompts.json` (base + PICOS prompts merged)
- `codebook.xlsx` (base + PICOS fields with dropdowns)
- `project.yaml` (name, description, codebook path)
- `picos.yaml` (original PICOS for audit)

### 5.3 radextract.document_processor

```python
from radextract.document_processor import (
    TextAnnotation,        # dataclass
    TableAnnotation,       # dataclass
    FigureAnnotation,      # dataclass
    ProcessedDocument,     # dataclass (unified output)
    DoclingProcessor,      # production: wraps IBM Docling
    FallbackProcessor,     # fallback: uses pdfplumber via litextract.document
    MockProcessor,         # tests: builds from text, no external deps
    get_processor,         # auto-select best available
    process_pdf,           # convenience: process single PDF
    process_batch,         # convenience: process multiple PDFs
    save_processed_document,  # save to JSON (S3-safe)
    load_processed_document,  # load from JSON
)
```

**ProcessedDocument dataclass:**
```python
@dataclass
class ProcessedDocument:
    doc_id: str
    parsed: dict                    # LitExtract normalized format
    text_annotations: list          # [TextAnnotation, ...]
    table_annotations: list         # [TableAnnotation, ...]
    figure_annotations: list        # [FigureAnnotation, ...]
    page_sizes: dict                # {page: (w, h)}
    metadata: dict                  # {engine, source_path, conversion_time, ...}

    @property
    def n_pages(self) -> int: ...
    @property
    def triage(self) -> str: ...    # "FULL_TEXT", "PARTIAL", "SCANNED"
```

**MockProcessor (for tests):**
```python
proc = MockProcessor()
doc = proc.convert("some text", doc_id="test_doc")
# Or from a pre-parsed dict:
doc = proc.convert_from_dict({"full_text": "...", "pages": [...], ...}, doc_id="test")
```

**Bounding box normalization:**
- Docling bboxes have `coord_origin` (TOPLEFT or BOTTOMLEFT)
- All bboxes are normalized to [0,1] relative to page size
- BOTTOMLEFT is flipped: `t = h - b`, `b = h - t`
- **BUG WAS FIXED**: `CoordOrigin.BOTTOMLEFT.value` returns "BOTTOMLEFT" (uppercase).
  The check `"bottom" in origin_val` failed because Python `in` is case-sensitive.
  Fix: `.lower()` is applied before checking.

**Docling document model (for reference):**
- `doc.texts`: list of `TextItem` with `.text`, `.label`, `.prov` (list of `ProvenanceItem`)
- `ProvenanceItem`: `.page_no` (0-indexed!), `.bbox` (`BoundingBox` with `.l`, `.t`, `.r`, `.b`)
- `doc.tables`: list of `TableItem` with `.data` (`TableData` with `.table_cells`, `.num_rows`, `.num_cols`)
- `TableCell`: `.text`, `.start_row_offset_idx`, `.start_col_offset_idx`, `.bbox`
- `doc.pictures`: list of `PictureItem` with `.prov`, `.captions`
- `doc.pages`: dict[int, PageItem] with `.size` (w, h)
- `CoordOrigin` is imported from `docling_core.types.doc` (NOT `docling_core.types.doc.bounding_box`)

### 5.4 radextract.dual_writer

```python
from radextract.dual_writer import (
    sanitize_column_name,   # "Study ID" → "study_id"
    sanitize_table_name,    # "Study_Level" → "study_level"
    build_column_map,       # {orig: sql_col} with collision handling
    write_sqlite,           # records → SQLite database
    write_json_flat,        # records → flat JSON
    write_json_nested,      # records → nested JSON (entity graph hierarchy)
    write_all,              # combined: Excel + JSON + SQLite
    read_sqlite,            # SQLite → records (round-trip)
)
```

**write_all function:**
```python
result = write_all(
    records,           # {sheet: [row_dict, ...]}
    project,           # litextract.Project
    src_workbook,      # path to codebook.xlsx (template for Excel output)
    dest_dir,          # output directory
    project_slug=None, # base filename (defaults to project.name)
    do_excel=True,
    do_json_flat=True,
    do_json_nested=True,
    do_sqlite=True,
    flags=None,        # {(sheet, row_idx, field): confidence} for cell coloring
    work_dir="/workspace",
)
# Returns:
# {
#     "dest_dir": str,
#     "excel": {...} | None,
#     "json_flat": {...} | None,
#     "json_nested": {...} | None,
#     "sqlite": {...} | None,
# }
```

**CRITICAL — parameter naming**: The `write_all` function uses `do_` prefix
for boolean toggles (`do_excel`, `do_json_flat`, etc.) to avoid shadowing
the imported function names (`write_json_flat`, `write_json_nested`).
If you rename these parameters to match the function names, you'll get a
`TypeError` because the parameter shadows the function.

**SQLite schema:**
- 5 tables: `study_level`, `cohort_level`, `protocol_level`, `outcome_level`, `quality_assessment`
- Foreign keys: `cohort_level.study_id → study_level.study_id`, etc.
- `_radextract_metadata` table stores original field name ↔ SQL column name mapping
- Column names sanitized: spaces → underscores, special chars removed, lowercase
- Names starting with digit get `col_` prefix
- Collisions get `_N` suffix

**S3 safety**: SQLite files are staged in `/workspace/` first, then `cp`'d to
the destination. This is because `/mnt/results/` is S3-backed and doesn't
support random-access writes.

### 5.5 litextract.schema (Project loader)

```python
from litextract.schema import load_project, Project, Schema

project = load_project("/workspace/radextract/configs/radiology_base")
# project.name           → "radiology_base"
# project.data_sheets()  → ["Study_Level", "Cohort_Level", "Protocol_Level", "Outcome_Level", "Quality_Assessment"]
# project.sheet_order    → {sheet: [(order, name), ...]} sorted by order
# project.codebook       → {(sheet, name): {sheet, order, name, why, enter, format, allowed, required, notes}}
# project.vocab          → {(sheet, name): [allowed, ...]} for controlled-vocab fields only
# project.schema         → Schema object
# project.rules          → list of validation rule dicts
# project.prompts        → {"field_prompts": [...]} loaded from prompts/*.json
# project.codebook_path  → path to codebook.xlsx
```

**load_project expects this directory layout:**
```
<config_dir>/
  project.yaml          (name + codebook filename)
  <codebook>.xlsx       (codebook workbook)
  schema.yaml
  validation_rules.yaml
  prompts/*.json        (optional)
```

The `project.yaml` must have a `codebook:` key pointing to the codebook filename:
```yaml
name: radiology_base
codebook: codebook.xlsx
```

### 5.6 litextract.pipeline (Core engine)

```python
from litextract.pipeline import run, run_batch
from litextract.extract import DeterministicBackend, AgentBackend, Record
from litextract.adjudicate import DeterministicAdjudicator

# Single document
result = run(
    project,           # litextract.Project
    document,          # path to PDF, or raw text string
    extractor_a=...,   # Extractor instance (agent_id="A")
    extractor_b=...,   # Extractor instance (agent_id="B")
    adjudicator=None,  # defaults to DeterministicAdjudicator()
    parsed=None,       # pre-parsed dict (skip parsing)
    doc_id=None,       # document ID
    src_workbook=None, # for write=True
    dest_workbook=None,# for write=True
    audit_dir=None,    # for audit sidecars
    write=False,       # if True, writes Excel workbook
)
# Returns:
# {
#     "doc_id": str,
#     "reconcile_summary": {...},
#     "adjudication": {"resolved": N, "escalated": N},
#     "records": {sheet: [row_dict, ...]},
#     "flags": {(sheet, row_idx, field): confidence},
#     "validation": {"n_issues": N, "n_errors": N, "n_warnings": N, "ok": bool},
#     "issues": [{sheet, row, column, issue, severity}, ...],
# }
```

**Record dataclass:**
```python
@dataclass
class Record:
    parent_row: dict = {}           # Study_Level row (the root parent)
    child_rows: dict = {}           # {sheet: [row_dict, ...]} for child sheets
    citations: list = []            # [{sheet, key, field, value, page, quote, confidence}]
    status: str = "ok"
    note: str = ""
```

**DeterministicBackend (for tests):**
```python
# Option 1: same record for all agents
backend = DeterministicBackend(record=Record(parent_row={...}, child_rows={...}))

# Option 2: different records per agent
backend = DeterministicBackend(records_by_agent={"A": Record(...), "B": Record(...)})

# Option 3: function-based
backend = DeterministicBackend(record_fn=lambda parsed, project, agent_id: Record(...))
```

### 5.7 litextract.validate (Config-driven validation)

```python
from litextract.validate import validate, workbook_to_records

issues, summary = validate(records, project)
# issues: [{sheet, row, column, issue, severity}, ...]
# summary: {"n_issues": N, "n_errors": N, "n_warnings": N, "ok": bool}
```

**Rule kinds (in _RULE_DISPATCH):**
1. `key_resolves` — child key's parent value exists in parent sheet
2. `unique_within_parent` — child key unique within its parent group
3. `comparator_resolves` — cross-reference field resolves
4. `range` — numeric field within [min, max]
5. `year` — 4-digit year in [min, max]
6. `le_field` — field_a <= field_b within same row
7. `le_parent_field` — child numeric <= parent numeric
8. `numeric_format` — numeric field parses to scalar
9. `conditional_required` — **NEW** field required when another field has specific value

**Automatic checks (not in rules, always run):**
- `required` — codebook 'Required' fields must be populated
- `vocab` — controlled-vocab cells hold allowed value or missing token

**conditional_required rule format:**
```yaml
- id: some_rule_id
  kind: conditional_required
  sheet: Protocol_Level
  condition_field: Modality        # field whose value triggers the requirement
  condition_value: MRI             # value that triggers
  required_field: Field Strength (T)  # field that becomes required
  condition_mode: equal            # "equal" (default) or "not_equal"
  severity: error
  message: "Field Strength required when Modality is MRI"
```

**Missing tokens**: NR, NA, unclear, not_reported, none, '' — these are
legitimate controlled-vocab answers, NOT blank cells. The `_truly_blank()`
function distinguishes: `none` is a real answer, `""` is blank.

### 5.8 litextract.codebook (Codebook loader)

```python
from litextract.codebook import load_codebook, split_allowed, controlled_vocab

codebook, sheet_order, controlled_vocab = load_codebook("path/to/codebook.xlsx")
```

**Codebook column layout (1-indexed):**
| Col | Field |
|-----|-------|
| 1 | Worksheet (sheet name) |
| 2 | Column Order |
| 3 | Final Column Name |
| 4 | Why |
| 5 | What-to-enter |
| 6 | Expected Format |
| 7 | Allowed/Standardized Entries |
| 8 | Required? |
| 9 | Notes |

Data starts at row 2 (row 1 is headers).

**split_allowed function:**
- Parses the "Allowed/Standardized Entries" cell (col 7)
- Controlled vocabularies are `;`-separated
- Free-text/numeric/instruction cells return `[]`
- **MODIFIED**: Added `_NUMERIC_RANGE_RE` to detect numeric ranges like
  "0-1", "1-100000", "0.0-1.0" — these are NOT controlled vocabularies

---

## 6. The Radiology Base Config (107 fields)

### Entity graph
```
Study_Level (parent, key: "Study ID")
  ├── Cohort_Level (child, key: "Cohort ID", parent_key: "Study ID")
  │     └── Protocol_Level (child, key: "Protocol ID", parent_key: "Cohort ID")
  │           └── Outcome_Level (child, key: "Outcome ID", parent_key: "Protocol ID")
  └── Quality_Assessment (child, key: "QA ID", parent_key: "Study ID")
```

### Field counts
| Sheet | Base Fields | Description |
|-------|-------------|-------------|
| Study_Level | 15 | Study metadata (author, year, journal, design, etc.) |
| Cohort_Level | 16 | Patient demographics (age, sex, sample size, etc.) |
| Protocol_Level | 24 | Imaging parameters (modality, scanner, sequence, etc.) |
| Outcome_Level | 26 | Diagnostic accuracy metrics (sens, spec, AUC, etc.) |
| Quality_Assessment | 26 | QUADAS-2 (4 domains × 2) + ROBINS-I (7 domains) + overall + support |
| **Total** | **107** | |

### Quality_Assessment sheet (shared QUADAS-2 / ROBINS-I)
- `Assessment Tool` enum: `QUADAS_2` or `ROBINS_I`
- When `QUADAS_2`: D1-D4 Risk of Bias + D1-D3 Applicability + Overall required
- When `ROBINS_I`: D1-D7 domain judgments + Overall required
- Field names contain colons: `"D1: Patient Selection — Risk of Bias"`
- **In YAML, these MUST be quoted** as both keys and values

### Validation rules (29 total)
- 8 referential integrity (key_resolves + unique_within_parent)
- 10 range/logical (year, range, le_field, le_parent_field)
- 11 conditional_required (QUADAS-2, ROBINS-I, modality-specific, etc.)

### Field type mapping
| Codebook Format | Schema Type |
|----------------|-------------|
| Integer | int |
| Number | float |
| Percentage | percent |
| Category | enum |
| Text | free_text |

### SQL type mapping
| Schema Type | SQL Type |
|-------------|----------|
| int | INTEGER |
| float | REAL |
| percent | REAL |
| enum | TEXT |
| free_text | TEXT |

---

## 7. Every Bug That Was Found and Fixed

### 7.1 YAML colon issue
**Problem**: Field names in Quality_Assessment contain colons (e.g.,
`"D1: Patient Selection — Risk of Bias"`). In YAML, colons in keys and values
cause parsing errors.

**Fix**: All field names containing colons are quoted in:
- `schema.yaml` — as YAML keys: `"Quality_Assessment::D1: Patient Selection — Risk of Bias":`
- `validation_rules.yaml` — as `required_field:` values: `required_field: "D1: Patient Selection — Risk of Bias"`

**If you add new fields with colons, you MUST quote them in YAML.**

### 7.2 Numeric range vs controlled vocabulary
**Problem**: The `split_allowed()` function in `codebook.py` determines whether
an "Allowed/Standardized Entries" cell is a controlled vocabulary or free-text.
Numeric ranges like "0-1", "1-100000" were being incorrectly treated as
controlled vocabularies (split by `;` but the whole string was one entry).

**Fix**: Added `_NUMERIC_RANGE_RE = re.compile(r'^-?\d+(?:\.\d+)?\s*[-–]\s*-?\d+(?:\.\d+)?$')`
to `split_allowed()`. If the cell matches this regex, return `[]` (not a
controlled vocabulary).

### 7.3 Config file naming
**Problem**: The base config originally used `base_` prefixed filenames
(`base_schema.yaml`, `base_codebook.xlsx`, etc.). But `load_project()` hardcodes
`schema.yaml` and `validation_rules.yaml` (no prefix).

**Fix**: Renamed all base config files to standard LitExtract names
(`schema.yaml`, `codebook.xlsx`, etc.). Updated the PICOS generator to read
from standard-named files. The `base_` prefixed files still exist as copies
but are NOT used.

### 7.4 Docling coord_origin case sensitivity
**Problem**: `CoordOrigin.BOTTOMLEFT.value` returns `"BOTTOMLEFT"` (uppercase).
The check `"bottom" in origin_val` failed because Python `in` is case-sensitive.

**Fix**: Added `.lower()` to the origin value extraction:
```python
origin_val = str(origin.value).lower()  # was: str(origin.value) without .lower()
if "bottom" in origin_val:
    t, b = h - b, h - t
```

### 7.5 SQLite FK constraint placement
**Problem**: FOREIGN KEY clauses were being interleaved with column definitions
in CREATE TABLE, which is invalid SQL.

**Fix**: Separated `col_defs` and `table_constraints` lists. Column definitions
come first, then table-level constraints (FOREIGN KEYs) at the end:
```python
all_defs = col_defs + table_constraints
create_sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n' + ",\n".join(all_defs) + "\n)"
```

### 7.6 Function name shadowing in write_all
**Problem**: In `write_all()`, parameters named `write_json_flat` and
`write_json_nested` shadowed the imported functions of the same name, causing
`TypeError` when the functions were called inside `write_all`.

**Fix**: Renamed parameters to `do_json_flat`, `do_json_nested`, `do_excel`,
`do_sqlite` (all use `do_` prefix).

### 7.7 GeneratedField missing allowed_values
**Problem**: `GeneratedField` dataclass has `allowed_values` as a required
positional argument (no default). Forgetting to pass it for non-enum fields
causes `TypeError`.

**Fix**: Always pass `allowed_values=[]` for non-enum fields.

### 7.8 DeterministicScreener dict format handling
**Problem**: `screen_title_abstract` only handled dicts with `ta_status` keys
(stage-specific format), but existing tests used dicts with `status`/`reason`
keys (generic format).

**Fix**: Added support for both formats in `screen_title_abstract`:
```python
if isinstance(out, dict) and "ta_status" in out:
    # stage-specific format
elif isinstance(out, dict) and "status" in out:
    # generic format (legacy)
```

### 7.9 JSON nested writer parent_key indexing
**Problem**: The nested JSON writer was indexing child rows by the sheet's own
key field instead of by the parent_key field, causing children to not be found.

**Fix**: Index by `parent_key` value, not by the sheet's own key:
```python
pkv = row.get(parent_key_field)  # NOT row.get(key_field)
index.setdefault(str(pkv), []).append(row)
```

---

## 8. S3 Mount Limitations (CRITICAL)

The Biomni sandbox has three filesystem locations:

| Path | Type | Supports | Use For |
|------|------|----------|---------|
| `/workspace/` | Local disk | Full POSIX (random access, append, rename) | Active computation, SQLite staging |
| `/mnt/shared-workspace/` | S3-backed | No append, no random-access, no rename | Session-scoped checkpoints |
| `/mnt/results/` | S3-backed | No append, no random-access, no rename | User-facing deliverables |

**Rules:**
1. SQLite, HDF5, and other random-access files MUST be written to `/workspace/`
   first, then `cp`'d (or `shutil.copyfile`) to the destination.
2. NEVER use `>>` (append) on S3-backed mounts.
3. NEVER use `os.rename()` on S3-backed mounts.
4. R's `file.copy()` produces 0-byte files on S3 mounts — use shell `cp` instead.
5. Multiple machines writing to the same S3 path can fail silently — give each
   machine its own output file.

The `dual_writer.py` and `document_processor.py` modules already handle this
correctly (staging in `/workspace/` then copying).

---

## 9. The End-to-End Test (What It Proves)

The test in `tests/test_end_to_end.py` exercises the COMPLETE pipeline:

1. **PICOS → Schema**: Creates a PICOS for "glioma IDH MRI", generates 6
   topic-specific fields via `DeterministicSchemaGenerator`, merges with base
   template → complete config folder with 107+6=113 fields
2. **Screening**: 3 sample papers screened through TA + FT stages, 1 passes
   as `ready_for_extraction`
3. **Document Processing**: `MockProcessor` converts paper text to
   `ProcessedDocument` with `triage == "FULL_TEXT"`
4. **Extraction**: Two `DeterministicBackend` extractors (A and B) produce
   identical clean records
5. **Reconciliation**: Type-aware comparison (all agree since both are identical)
6. **Adjudication**: No disagreements to resolve
7. **Validation**: 0 errors, 0 warnings on clean records
8. **Dual Output**: Excel + JSON flat + JSON nested + SQLite all written
9. **SQLite Round-Trip**: Read back from SQLite, verify field names and values
10. **JSON Nested Hierarchy**: Verify entity-graph nesting (Study→Cohort→Protocol→Outcome + QA)

**The test uses deterministic backends only — no LLM, no PDF, no network.**
This proves the plumbing works. Real LLM extraction is Phase 2+.

---

## 10. External Resources

### IBM Docling
- Installed: `docling==2.121.0` via `uv pip install docling`
- User's custom converter: `/workspace/docling_converter/docling_pdf_converter_json/`
- Requires PyTorch (set `TORCH_COMPILE_DISABLE=1`)
- `CoordOrigin` imported from `docling_core.types.doc`

### Graphify
- Cloned to: `/workspace/graphify/`
- Purpose: Maps code/docs/PDFs into queryable knowledge graph (71.5x fewer tokens)
- Used as library, not CLI
- NOT YET INTEGRATED (Phase 2)

### Original LitExtract
- Location: `/workspace/litextract/8.7.26 LitExtract/litextract/`
- The `litextract/` directory in the project is a MODIFIED COPY of this
- 43 original tests still pass (backward compatibility maintained)

### Example extraction files
- `/workspace/litextract/8.7.26 LitExtract/EXAMPLE EXTRACTION SHEET.xlsx` (76 columns)
- `/workspace/litextract/8.7.26 LitExtract/IVLBCL_Extraction_Results.xlsx`
- `/workspace/litextract/8.7.26 LitExtract/CVR codebook.xlsx`

### The Plan
- `/mnt/results/execution_trace/PLAN.md` — 834 lines, 8 subsystems, approved by user
- This is the master plan for all 5 phases

---

## 11. What to Build Next (Phases 2-5)

### Phase 2: Graphify Integration (token efficiency)

**Goal**: Use Graphify to build a knowledge graph from Docling JSON output,
then query it to locate relevant text spans for each extraction field. This
reduces the prompt size by ~78% (from full text to just relevant spans).

**Files to create:**
- `radextract/graph_navigator.py` — wraps Graphify's `extract()`, `build()`,
  `cluster()`, and `query` functions

**Files to modify:**
- `litextract/extract.py` — extend `AgentBackend.build_prompt` to accept an
  optional `graph_navigator` parameter. When present, query the graph for each
  field's likely location and include only located spans in the prompt.

**Steps:**
1. Read the Graphify repo at `/workspace/graphify/` to understand its API
2. Build `graph_navigator.py`:
   - `build_graph(processed_docs: list[ProcessedDocument]) → Graph`
   - `query_field(graph, field_name, sheet) → list[TextSpan]`
   - `query_section(graph, section_name) → list[TextSpan]`
3. Extend `AgentBackend`:
   ```python
   class AgentBackend:
       def __init__(self, model_fn, agent_id, instruction, graph_navigator=None):
           ...
       def build_prompt(self, parsed, project):
           if self.graph_navigator:
               # Query graph for each field's likely location
               # Include only located spans
           else:
               # Fall back to full-text prompt (existing behavior)
   ```
4. Benchmark token usage with vs without Graphify on 10 papers
5. Verify extraction accuracy is maintained or improved

### Phase 3: Pre-Review Modules (literature search)

**Files to create:**
- `radextract/evidence_scanner.py` — PubMed gap analysis
  - Query PubMed for existing systematic reviews on the topic
  - Generate a gap analysis report
  - Uses NCBI E-utilities API (free, rate-limited to 3 req/sec without API key)
- `radextract/query_generator.py` — PICOS → database search strings
  - Generate PubMed, Embase, Cochrane search queries from PICOS
  - Use MeSH terms, Boolean operators, field tags
- `radextract/auto_importer.py` — PubMed fetch + dedup + PDF download
  - Execute PubMed search via E-utilities
  - Fetch metadata (title, abstract, authors, journal, year, DOI, PMID)
  - Download PDFs from PMC open access (free REST API)
  - Deduplicate by DOI/PMID/title similarity
  - Non-OA papers tagged `needs_pdf_upload`

**API details:**
- NCBI E-utilities: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
  - `esearch.fcgi` — search PubMed
  - `efetch.fcgi` — fetch records
  - `esummary.fcgi` — fetch summaries
  - Rate limit: 3 req/sec without API key, 10 req/sec with key
  - Add `api_key` parameter if user has one
- PMC OA: `https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi`
  - Fetch PDFs for open-access articles

**Steps:**
1. Build `evidence_scanner.py` with PubMed search for existing SRs
2. Build `query_generator.py` with PICOS → search string conversion
3. Build `auto_importer.py` with PubMed fetch + PDF download
4. Test full pre-review flow on a sample topic (e.g., "MRI for IDH detection in glioma")

### Phase 4: Review Web App (interactive review)

**Backend (FastAPI):**
- `radextract/web/app.py` — FastAPI application
- `radextract/web/routes.py` — API routes
- `radextract/web/pdf_server.py` — serve PDFs + annotation JSON
- `radextract/web/websocket.py` — real-time updates

**Frontend (React + PDF.js):**
- Excel-like grid showing all extracted fields per study
- Click a field → PDF opens at the correct page with highlight overlay
- Highlight overlay uses bounding boxes from `ProcessedDocument.text_annotations`
- Human verification workflow: override values, add notes, audit log

**Bounding box → PDF.js mapping:**
- Docling bboxes are normalized [0,1] relative to page size
- PDF.js viewport: `pdf.getPage(page).getViewport({scale: 1})`
- Convert: `x_px = bbox.l * viewport.width`, `y_px = bbox.t * viewport.height`
- Draw rectangle overlay on canvas

**Steps:**
1. Build FastAPI backend with pipeline orchestration endpoints
2. Build React frontend with grid component
3. Wire PDF.js viewer with highlight overlay
4. Implement human verification workflow
5. Implement dual export from the UI

### Phase 5: Polish & Scale

1. **QUADAS-2/ROBINS-I extraction prompts**: Write detailed per-domain prompts
   for the quality assessment fields (currently they have basic prompts)
2. **PostgreSQL support**: Add `write_postgresql()` to `dual_writer.py` for
   scaling beyond 50 users (SQLite is fine for 20-50)
3. **Batch processing**: Reuse `pipeline.run_batch` with checkpointing for
   processing 100+ papers
4. **Documentation**: Onboarding guide for new radiology subspecialty configs

---

## 12. Key Design Decisions (Don't Change These)

1. **Two-layer schema**: Base template (107 universal fields) + PICOS-generated
   layer (5-15 topic-specific fields). This is the core innovation. Don't
   replace it with a single fixed schema.

2. **Hybrid build-vs-extend**: Keep the LitExtract engine core unchanged (except
   for the `conditional_required` addition to `validate.py` and the numeric
   range fix in `codebook.py`). Add new modules in the `radextract/` package.

3. **Deterministic backends for testing**: Every module has a deterministic
   backend (`DeterministicScreener`, `DeterministicSchemaGenerator`,
   `DeterministicBackend`, `MockProcessor`) that requires no LLM, no PDF, no
   network. This is how we test the plumbing. Don't remove these.

4. **S3-safe file writes**: All binary/random-access files (SQLite, xlsx) are
   staged in `/workspace/` then `cp`'d to destination. Don't write directly
   to `/mnt/results/` with openpyxl or sqlite3.

5. **Entity graph from schema.yaml**: The entity graph (parent/child
   relationships, keys) is read from `schema.yaml`, not hardcoded. Don't
   hardcode sheet relationships in Python.

6. **Missing tokens are real answers**: NR, NA, unclear, not_reported, none
   are legitimate controlled-vocab answers, not blank cells. The `_truly_blank()`
   function in `validate.py` distinguishes. Don't treat them as errors.

7. **Controlled vocabulary values for "Age, Dispersion Type"**: SD; SE; IQR;
   range; none; NR (NOT "mean_sd"). This is in the codebook.

8. **Field Strength (T) is enum, not float**: Values are "1.5", "3.0", "7.0",
   "other", "NR". It's a controlled vocabulary, not a free numeric field.

---

## 13. Common Pitfalls (Read Before Coding)

1. **PYTHONPATH**: Always set `PYTHONPATH=/workspace/radextract` when running
   anything. Without it, `from litextract...` and `from radextract...` fail.

2. **YAML colons**: Any field name containing a colon MUST be quoted in YAML.
   This applies to both keys and values. Example:
   `"D1: Patient Selection — Risk of Bias"` (with quotes).

3. **GeneratedField.allowed_values**: This is a REQUIRED argument. Pass `[]`
   for non-enum fields. Forgetting this is the most common test failure.

4. **DeterministicSchemaGenerator() with no args**: Returns 0 fields. This is
   intentional. You MUST pass `fields=[...]` or `fields_fn=callable`.

5. **Docling page numbers are 0-indexed**: `prov.page_no` starts at 0. Add 1
   to get 1-indexed page numbers (which is what everything else uses).

6. **Docling CoordOrigin**: Import from `docling_core.types.doc`, NOT from
   `docling_core.types.doc.bounding_box`. The `.value` attribute returns
   uppercase strings — always `.lower()` before string matching.

7. **SQLite FK placement**: FOREIGN KEY clauses must come AFTER all column
   definitions in CREATE TABLE, not interleaved.

8. **write_all parameter names**: Use `do_` prefix (`do_excel`, `do_json_flat`,
   etc.) to avoid shadowing imported function names.

9. **screen_batch picos parameter**: Pass a plain dict, not a PICOS dataclass.
   Example: `{"population": "...", "intervention": "...", ...}`

10. **DeterministicScreener dict formats**: `screen_title_abstract` handles
    both `ta_status`/`ta_reason` and `status`/`reason` dict formats.
    `screen_full_text` only handles `ft_status`/`ft_reason` and
    `ScreeningDecision` objects.

11. **load_project file names**: Expects `schema.yaml` (NOT `base_schema.yaml`),
    `validation_rules.yaml` (NOT `base_validation_rules.yaml`), and
    `prompts/*.json` (NOT `prompts.json` in the root).

12. **Codebook data starts at row 2**: Row 1 is headers. The `data_start_row`
    in schema.yaml is 3 (for data sheets, where row 1 = header, row 2 = hint,
    row 3+ = data). But the Codebook sheet itself starts data at row 2.

13. **Never use plain `pip install`**: Always use `uv pip install`.

14. **Don't write directly to /mnt/results/ with openpyxl**: Stage in
    `/workspace/` first, then `cp`. The `writer.py` and `dual_writer.py`
    already do this correctly.

---

## 14. Quick Reference — Test Counts

| Test File | Tests | What It Tests |
|-----------|-------|---------------|
| test_conditional_required.py | 11 | New conditional_required validation rule |
| test_screening.py | 17 | PRISMA screening (TA + FT, all status transitions) |
| test_picos_schema.py | 13 | PICOS → schema generation + config folder creation |
| test_document_processor.py | 23 | Docling/Fallback/Mock processors, bbox normalization, serialization |
| test_dual_writer.py | 19 | SQLite/JSON writers, column sanitization, round-trip |
| test_end_to_end.py | 4 | Full pipeline: PICOS→screen→process→extract→validate→write→round-trip |
| test_01_config_load.py | 7 | CVR config loads correctly |
| test_02_agreement.py | 3 | Identical records fully agree |
| test_03_type_aware_matching.py | 11 | Type-aware cell comparison |
| test_04_adjudicator.py | 4 | Referee adjudication |
| test_05_validation_config_driven.py | 3 | Config-driven validation |
| test_06_append_only_writer.py | 3 | Append-only Excel writer |
| test_07_reusability.py | 3 | Toy config runs end-to-end |
| test_08_audit_completeness.py | 4 | Audit sidecars |
| test_09_layout_detection.py | 5 | Layout detection |
| **TOTAL** | **130** | All passing |

---

## 15. If Something Breaks

1. **Tests fail with ImportError**: You forgot `PYTHONPATH=/workspace/radextract`.
   Fix: `cd /workspace/radextract && PYTHONPATH=/workspace/radextract python -m pytest tests/ -q`

2. **YAML parsing error**: You have an unquoted colon in a field name.
   Fix: Wrap the field name in double quotes.

3. **TypeError: GeneratedField.__init__() missing 'allowed_values'**:
   Fix: Add `allowed_values=[]` to the GeneratedField constructor call.

4. **SQLite OperationalError near "FOREIGN"**: FK clause is interleaved with
   column defs. Fix: Move all FK clauses to the end of CREATE TABLE.

5. **Docling bbox Y-axis flipped**: You forgot to check coord_origin or forgot
   `.lower()`. Fix: `origin_val = str(origin.value).lower(); if "bottom" in origin_val: flip`

6. **0-byte xlsx file on /mnt/results/**: You wrote directly to S3 mount.
   Fix: Stage in `/workspace/` first, then `shutil.copyfile` or `cp`.

7. **DeterministicSchemaGenerator returns 0 fields**: You didn't pass `fields`
   or `fields_fn`. Fix: `DeterministicSchemaGenerator(fields=[...])`

8. **screen_batch crashes on picos**: You passed a PICOS dataclass instead of
   a dict. Fix: Pass `picos.to_dict()` or a plain dict.

---

## 16. File Checksums (for verification)

After unzipping, verify the project is intact:

```bash
cd /workspace/radextract
PYTHONPATH=/workspace/radextract python -m pytest tests/ tests_existing/ -q
# Should output: 130 passed
```

If any test fails after unzipping, something went wrong with the transfer.
Compare file sizes and contents against this document.

---

## 17. Contact / Context

- **User**: Yang C.
- **Project**: RadExtract — Radiology Systematic Review Data Extraction Platform
- **Plan file**: `/mnt/results/execution_trace/PLAN.md` (834 lines, approved)
- **Phase completed**: Phase 1 (Foundation) — all 10 steps done
- **Next phase**: Phase 2 (Graphify Integration)
- **Date**: 2026-08-25
