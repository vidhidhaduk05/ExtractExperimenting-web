---
name: clinical-data-extraction
description: >
  Universal skill for extracting data from any clinical research study files (.md, .pdf) into any
  structured Excel extraction sheet for systematic reviews and meta-analyses. Fully schema-driven:
  reads arm labels, sheet names, layout modes, outcome domains, scope rules, and missing-data codes
  entirely from the uploaded workbook — never assumes any specific disease area, intervention type,
  arm name, or sheet structure. Use whenever the user uploads study files alongside an Excel
  extraction sheet and asks for data to be extracted, filled in, or populated. Also trigger for:
  "extract data from this paper", "fill in the extraction sheet", "populate this form from the
  study", "compare my two extraction sheets", "reconcile disagreements between extractors", or any
  similar phrasing. Handles any number of arms, any outcome taxonomy, all sheet layout modes
  (per_study, per_arm_long, per_arm_outcome_long, per_comparison_per_outcome, per_stratum,
  per_stratum_arm_outcome, per_study_wide, per_study_wide_multirow, per_entity_per_study),
  single-arm proportional MA, multi-arm NMA, hybrid single/comparative designs, stratum-indexed
  sheets, split binary/continuous outcome sheets, special registry/pharmacovigilance sheets,
  multi-sheet workbooks with merged headers, large-batch PDF extraction (10-20 studies), paperetl-backed section-aware PDF parsing (GROBID optional with pdfplumber fallback), strict per-study
  isolation, PDF table extraction via pdfplumber/pymupdf, dual-extractor reconciliation with AI
  adjudication, versioned output files, and scope exclusion flagging.
---

# Clinical Data Extraction Skill — Universal Edition v4

Extracts structured data from clinical research files (.md or .pdf) into Excel extraction
sheets for any meta-analysis design. Every operating parameter — arm labels, design type,
sheet names, layout modes, column lists, outcome domains, missing-data codes, and scope
rules — is read from the uploaded workbook at runtime. Nothing is hardcoded.

---

## PRIME DIRECTIVE: Read the Workbook, Don't Assume It

Before writing a single data value, the skill must have answered these questions from
the workbook itself:

| Question | Where to find the answer |
|---|---|
| What is the design type? | Codebook — single-arm, comparative, NMA, hybrid, stratified |
| What are the arm/stratum labels? | Codebook "ARMS coded as:" + Arm column values + events_ headers |
| How many arms? | Unique values in Arm columns; Codebook arm list |
| What sheets exist? | `wb.sheetnames` |
| What is each sheet's layout mode? | Column 1-3 headers + merged cell detection (Step 1c) |
| What are the missing-data codes? | Codebook section "MISSING DATA CODES" |
| What are the scope rules? | Codebook — project-specific, never substitute generic rules |
| Which fields are required? | Green-highlighted header cells (Step 1e); fallback: all non-Notes columns |
| What outcome domains exist? | Row 1 merged headers (multirow sheets) or Outcome column values |
| Are any sheets non-extraction (registry/provenance)? | Sheet name + col1 header check |
| Where is the Notes column for each sheet? | Step 1f — varies by sheet type |

If ANY of these cannot be determined from the workbook, stop and ask the user before
extracting.

---

## Operating Modes

| Mode | Trigger | Action |
|---|---|---|
| **Extraction** | User uploads study file(s) + one extraction sheet | Run Steps 0-9 |
| **Single-study append** | User uploads exactly one study file (+ optionally its supplement) alongside an existing partially-filled extraction sheet | Run Steps 0-9 for that one study only; append to the sheet; return updated sheet + compact summary |
| **Reconciliation** | User uploads two filled extraction sheets (± study files) | Run Step R instead |

### Single-Study Append Workflow

When exactly one study file is uploaded alongside an existing partially-filled extraction sheet:

1. Load the existing extraction sheet — read all existing StudyIDs (Step 0b)
2. Check if this study is already extracted — if yes, ask user before overwriting
3. Run full extraction for the one study (Steps 1-9)
4. Apply Step 4.6 (exhaustive search) and Step 4.7 (-99 recheck)
5. Write to sheet, save versioned output (increment version number)
6. Return: updated Excel file + compact per-study summary (see format below)

**Compact per-study summary format (returned after every single-study extraction):**

```
STUDY: <StudyID>
Design: <design> | N: <Arm1>=X, <Arm2>=Y | Follow-up: X months
Sheets written: Study_Metadata ✓ | Baseline_PerArm ✓ | Intervention_Detail ✓ | Outcomes_EventCounts ✓ | TimeToEvent_KM ✓ | RiskOfBias ✓

-99 fields (not found after exhaustive search + recheck):
  Baseline_PerArm: [field1 — checked: Table 1, text, supplement; not reported]
  Intervention_Detail: [field2 — checked: Methods, supplement; not reported]
  ... (only fields where -99 was written after full search)

Conflicts flagged: [list any CONFLICT cells, or "none"]
Notes for reviewer: [any material caveats — comparator heterogeneity, subgroup flag, immortal time bias, etc.]
```

-99 fields are listed with the reason they weren't found — no action required from the user unless they want to redirect the search. The sheet is already written.

---

### Four-Phase Workflow (Large Batch PDFs)

When processing 10-20 PDFs against a fixed extraction sheet, work in exactly four phases.
Do not start a phase until the previous one is fully complete.

**Phase 1 - Orient (once per session, before touching any PDF)**
1. Read the extraction sheet: schema, all column headers, all header comments, layout modes
2. Scan for existing StudyIDs already in the sheet -- build the "already done" list
3. List all uploaded PDFs and assign a StudyID to each (ask user for any ambiguous filenames)
4. Build the processing queue: only studies NOT already in the sheet
5. Declare the queue out loud before proceeding

**Phase 2 - Assess each PDF (before extracting from it)**
1. Attempt text extraction; classify PDF quality as: FULL_TEXT / PARTIAL / SCANNED
2. If SCANNED: mark all fields -88, add to manual-review list, move to next PDF -- do not attempt extraction
3. If PARTIAL: flag which pages/sections are unreadable; extract what is possible
4. If FULL_TEXT: proceed to Phase 3

**Phase 3 - Extract one study completely (one sheet-tab at a time)**
1. Open the study PDF
2. Work through each sheet-tab in this fixed order: Study_Metadata -> Baseline_PerArm -> domain sheets -> Outcomes -> TimeToEvent_KM -> RiskOfBias
3. Complete each tab fully before moving to the next -- never jump between tabs mid-study
4. Double-check all numbers (Step 4.5) before writing
5. Mark the study complete before opening the next PDF

**Phase 4 - Batch summary (after all studies processed)**
- Print the end-of-batch report (Step 9)
- List studies needing manual review
- Save the output file

---

## Step 0 -- Identify and Register All Inputs

Complete this step fully **before reading any PDF content**.

### 0a. List every uploaded file

```python
import os
uploads = os.listdir('/mnt/user-uploads/')
print(uploads)
```

Categorise every file:

| Role | Pattern | Notes |
|---|---|---|
| Extraction sheet | `*.xlsx` | Required -- ask user if missing |
| Main study PDF | `*.pdf` (not supplement) | One per study |
| Supplementary PDF | `*supplement*`, `*appendix*`, `*supp*`, `*eTable*` in filename | Belongs to matching study only |
| Second extractor sheet | Second `*.xlsx` | Reconciliation mode only |

### 0b. Scan the Extraction Sheet for Already-Extracted Studies

**Before building the study queue**, open the extraction sheet and collect all StudyIDs
already present. These must be skipped -- never re-extracted or overwritten.

```python
import openpyxl

def get_existing_study_ids(wb):
    """Collect all StudyIDs already in the sheet across all data tabs."""
    existing = set()
    for sn in wb.sheetnames:
        ws = wb[sn]
        if str(ws.cell(1, 1).value or '').strip().lower() != 'studyid':
            continue
        for row in range(2, ws.max_row + 1):
            val = ws.cell(row, 1).value
            if val:
                existing.add(str(val).strip())
    return existing

wb = openpyxl.load_workbook('/mnt/user-uploads/<sheet>.xlsx', data_only=True)
ALREADY_EXTRACTED = get_existing_study_ids(wb)
print(f"Already extracted ({len(ALREADY_EXTRACTED)}): {sorted(ALREADY_EXTRACTED)}")
```

### 0c. Assign StudyIDs to PDF Files

PDF filenames from journals are often not in `FirstAuthor_Year` format
(e.g., `1-s2.0-S0735109723045821-main.pdf`, `nihms-1234567.pdf`).

**For every PDF file:**
1. Attempt to auto-detect StudyID from filename
2. If auto-detection fails or is ambiguous: **ask the user** to confirm the StudyID
3. Never guess a StudyID from PDF content alone -- always confirm with the user first

```python
import re

def auto_detect_study_id(filename):
    """Try to extract FirstAuthor_Year from filename."""
    m = re.search(r'([A-Za-z][A-Za-z-]+)[_-](\d{4})', filename)
    if m:
        return f"{m.group(1)}_{m.group(2)}", 'auto'
    return None, 'ambiguous'
```

Declare the full StudyID assignment before proceeding:
```
PDF ASSIGNMENT
==============
nihms-1234567.pdf          -> Reddy_2023        [auto-detected]
1-s2.0-S073510972304.pdf   -> Kirchhof_2021     [user confirmed]
Duytschaever2023.pdf       -> Duytschaever_2023 [auto-detected]
```

### 0d. Build the Processing Queue

```python
QUEUE = [
    {'study_id': sid, 'pdf': pdf_path, 'supp': supp_or_None}
    for sid, pdf_path, supp_or_None in all_assigned_pdfs
    if sid not in ALREADY_EXTRACTED
]

print(f"Queue: {len(QUEUE)} studies to extract")
print(f"Skipped (already extracted): {len(ALREADY_EXTRACTED)}")
for item in QUEUE:
    print(f"  -> {item['study_id']} ({item['pdf']})")
```

**Do not proceed until the queue is declared and confirmed.**

### 0e. Process Order

Work through the queue in order. For each study:
1. Assess PDF quality (Phase 2)
2. Extract completely across all sheets (Phase 3)
3. Mark done before moving to the next

Never interleave data from two studies in the same pass.

---

## Step 0.5 — Parse & Index All Study Files

**Run this step immediately after Step 0e and before Step 1.**
This step processes every study file once, building a `STUDY_INDEX` that all
downstream steps (2, 4.5, 4.6) query instead of re-reading raw files.

### Dependencies

```python
# Required packages (all available in the execution environment)
import requests
import pdfplumber
import fitz  # pymupdf
import nltk
from nltk.tokenize import sent_tokenize
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

# paperetl text cleaner — strips citation noise, URLs, emails, OCR artefacts
# Install if not present: pip install paperetl
try:
    from paperetl.text import Text as PaperText
    PAPERETL_AVAILABLE = True
except ImportError:
    PAPERETL_AVAILABLE = False
    import re
    class PaperText:
        @staticmethod
        def transform(text):
            text = re.sub(r'(\[\d+\],?\s?){3,}(\.|\.)?)', ' ', text)
            text = re.sub(r'\[[\d\,\s]+\]', ' ', text)
            text = re.sub(r'http(s)?\:\/\/\S+', ' ', text)
            text = re.sub(r'\w+@\w+(\.[a-z]{2,})+', ' ', text)
            text = re.sub(r'(^|\s)(\w\s+){3,}', ' ', text)
            return re.sub(r' {2,}|\.{2,}', ' ', text)
```

### 0.5a. Probe GROBID

```python
GROBID_URL = os.environ.get('GROBID_URL', 'http://localhost:8070')

def probe_grobid(url=GROBID_URL):
    """Returns True if GROBID is reachable. Silent — never raises."""
    try:
        return requests.get(url + '/api/isalive', timeout=2).ok
    except Exception:
        return False

GROBID_AVAILABLE = probe_grobid()
print(f"GROBID: {'available (' + GROBID_URL + ')' if GROBID_AVAILABLE else 'unavailable — using pdfplumber fallback'}")
```

### 0.5b. Section heading detector (pdfplumber fallback)

Used when GROBID is unavailable to assign section labels to sentences from raw page text.

```python
SECTION_HEADINGS = {
    'abstract': 'ABSTRACT',
    'introduction': 'INTRODUCTION',
    'background': 'BACKGROUND',
    'methods': 'METHODS',
    'materials and methods': 'METHODS',
    'patients and methods': 'METHODS',
    'study design': 'METHODS',
    'statistical analysis': 'METHODS',
    'results': 'RESULTS',
    'outcomes': 'RESULTS',
    'primary outcome': 'RESULTS',
    'secondary outcomes': 'RESULTS',
    'discussion': 'DISCUSSION',
    'conclusion': 'CONCLUSION',
    'conclusions': 'CONCLUSION',
    'limitations': 'LIMITATIONS',
    'funding': 'FUNDING',
    'funding sources': 'FUNDING',
    'acknowledgements': 'ACKNOWLEDGEMENTS',
    'acknowledgments': 'ACKNOWLEDGEMENTS',
    'references': 'REFERENCES',
    'supplementary': 'SUPPLEMENTARY',
    'appendix': 'SUPPLEMENTARY',
    'online supplement': 'SUPPLEMENTARY',
}

def label_sections_heuristic(raw_pages: dict) -> list:
    """
    Assigns section labels to sentences from pdfplumber page text.
    Returns list of (section_name, sentence_text) tuples.
    Used when GROBID is unavailable.
    """
    sections = []
    current_section = 'UNKNOWN'
    for page_num in sorted(raw_pages.keys()):
        text = raw_pages[page_num]
        for line in text.split('\n'):
            stripped = line.strip().lower().rstrip('.')
            if stripped in SECTION_HEADINGS:
                current_section = SECTION_HEADINGS[stripped]
                continue
            if line.strip():
                for sent in sent_tokenize(line.strip()):
                    cleaned = PaperText.transform(sent)
                    if cleaned.strip():
                        sections.append((current_section, cleaned))
    return sections
```

### 0.5c. GROBID PDF parser (primary path)

```python
def parse_pdf_grobid(pdf_path: str, source: str = None) -> list:
    """
    Parse PDF via GROBID → TEI XML → labeled sections.
    Returns list of (section_name, sentence_text) tuples.
    Requires GROBID running at GROBID_URL.
    """
    try:
        from paperetl.file.tei import TEI
        from io import StringIO

        with open(pdf_path, 'rb') as f:
            response = requests.post(
                GROBID_URL + '/api/processFulltextDocument',
                files={'input': f},
                timeout=120
            )
        if not response.ok:
            print(f"  GROBID error ({response.status_code}) for {pdf_path} — falling back to pdfplumber")
            return None

        article = TEI.parse(StringIO(response.text), source or os.path.basename(pdf_path))
        if article is None:
            return None

        return [(name, PaperText.transform(text)) for name, text in article.sections]

    except Exception as e:
        print(f"  GROBID parse failed for {pdf_path}: {e} — falling back to pdfplumber")
        return None
```

### 0.5d. pdfplumber extractor (fallback text + always-on tables)

```python
def extract_pdf_pdfplumber(pdf_path: str) -> tuple:
    """
    Extract text per page and all tables from a PDF using pdfplumber.
    Returns:
        raw_pages: dict {page_num (int): str}  — for page-level citations
        tables:    list of {'page': int, 'data': list[list]}  — 2D grids
    Always runs regardless of GROBID availability (tables always come from pdfplumber).
    """
    raw_pages = {}
    tables = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ''
                raw_pages[i] = text
                for tbl in (page.extract_tables() or []):
                    if tbl:
                        tables.append({'page': i, 'data': tbl})
    except Exception:
        try:
            doc = fitz.open(pdf_path)
            for i, page in enumerate(doc, start=1):
                raw_pages[i] = page.get_text('text')
        except Exception as e:
            print(f"  PDF extraction failed entirely for {pdf_path}: {e}")
    return raw_pages, tables
```

### 0.5e. .md file parser

```python
def parse_md_to_sections(md_text: str) -> list:
    """
    Parse a .md file into labeled (section_name, sentence) tuples.
    Uses ## / ### headings as section labels.
    Applies PaperText.transform() cleaning to every sentence.
    """
    sections = []
    current_section = 'UNKNOWN'
    for line in md_text.split('\n'):
        if line.startswith('## ') or line.startswith('### '):
            current_section = line.lstrip('#').strip().upper()
        elif line.strip():
            for sent in sent_tokenize(line.strip()):
                cleaned = PaperText.transform(sent)
                if cleaned.strip():
                    sections.append((current_section, cleaned))
    return sections
```

### 0.5f. Scanned PDF detection

```python
def is_scanned(raw_pages: dict) -> bool:
    """
    Returns True if the PDF appears to be scanned (no extractable text).
    Threshold: fewer than 20% of pages have >50 characters of text.
    """
    if not raw_pages:
        return True
    text_pages = sum(1 for t in raw_pages.values() if len(t.strip()) > 50)
    return (text_pages / len(raw_pages)) < 0.2
```

### 0.5g. Build STUDY_INDEX

```python
# STUDY_INDEX: keyed by StudyID, built once, queried by all downstream steps
STUDY_INDEX = {}

def build_study_index(queue: list) -> dict:
    """
    Process every study in the queue and build STUDY_INDEX.
    queue: list of {'study_id': str, 'pdf': str or None, 'md': str or None, 'supp': str or None}
    Returns STUDY_INDEX dict.
    """
    index = {}

    for item in queue:
        sid = item['study_id']
        pdf_path = item.get('pdf')
        md_path = item.get('md')
        supp_path = item.get('supp')

        entry = {
            'sections': [],
            'tables': [],
            'source_type': None,
            'raw_pages': {},
            'scanned': False,
        }

        if md_path and os.path.exists(md_path):
            with open(md_path, encoding='utf-8') as f:
                md_text = f.read()
            entry['sections'] = parse_md_to_sections(md_text)
            entry['source_type'] = 'md'
            if supp_path and supp_path.endswith('.md') and os.path.exists(supp_path):
                with open(supp_path, encoding='utf-8') as f:
                    supp_text = f.read()
                entry['sections'] += parse_md_to_sections(supp_text)

        elif pdf_path and os.path.exists(pdf_path):
            raw_pages, tables = extract_pdf_pdfplumber(pdf_path)
            entry['raw_pages'] = raw_pages
            entry['tables'] = tables

            if supp_path and supp_path.endswith('.pdf') and os.path.exists(supp_path):
                supp_pages, supp_tables = extract_pdf_pdfplumber(supp_path)
                offset = max(raw_pages.keys(), default=0)
                entry['raw_pages'].update({k + offset: v for k, v in supp_pages.items()})
                entry['tables'] += supp_tables

            if is_scanned(raw_pages):
                entry['scanned'] = True
                entry['source_type'] = 'scanned'
                index[sid] = entry
                continue

            if GROBID_AVAILABLE:
                grobid_sections = parse_pdf_grobid(pdf_path)
                if grobid_sections:
                    entry['sections'] = grobid_sections
                    entry['source_type'] = 'grobid'
                    if supp_path and supp_path.endswith('.pdf') and os.path.exists(supp_path):
                        supp_sections = parse_pdf_grobid(supp_path) or []
                        entry['sections'] += supp_sections
                else:
                    entry['sections'] = label_sections_heuristic(raw_pages)
                    entry['source_type'] = 'pdfplumber'
            else:
                entry['sections'] = label_sections_heuristic(raw_pages)
                entry['source_type'] = 'pdfplumber'

        index[sid] = entry

    return index

STUDY_INDEX = build_study_index(QUEUE)
```

### 0.5h. Declare Parse & Index results

Print this declaration before proceeding to Step 1:

```
PARSE & INDEX COMPLETE
======================
GROBID: available (http://localhost:8070)   [or: unavailable — pdfplumber fallback]

StudyID              Format   Parser       Sections   Tables   Status
Reddy_2023           PDF      GROBID       142 sents  4 tbls   OK
Kirchhhof_2021       PDF      pdfplumber   98 sents   3 tbls   OK [GROBID fallback]
Duytschaever_2023    MD       md           87 sents   0 tbls   OK
nihms-1234567        PDF      scanned      0 sents    0 tbls   SCANNED — all fields -88

Scanned PDFs (manual review required): nihms-1234567 → Reddy_2022
```

**Rules:**
- Scanned studies: mark all fields `-88` during extraction; add to manual-review list; do NOT attempt extraction.
- `source_type` is stored in `STUDY_INDEX[sid]['source_type']` and used in Step 2 to format `**SECTION:**` vs `**PAGE:**` citations.
- Do NOT proceed to Step 1 until all studies in QUEUE are indexed and the declaration is printed.

---

## Step 1 — Parse the Workbook Schema

**Complete this step fully before extracting any study data.**

```python
import openpyxl, re
wb = openpyxl.load_workbook('/mnt/user-uploads/<filename>.xlsx', data_only=True)
print("Sheets:", wb.sheetnames)
```

Build and store a `SCHEMA` dictionary:

```python
SCHEMA = {
    'design_type': '',      # 'comparative' | 'single_arm' | 'nma' | 'hybrid' | 'stratified_single_arm'
    'arm_labels': [],       # detected arm codes — never assumed
    'stratum_labels': [],   # detected stratum values (stratified designs)
    'n_arms': 0,
    'missing_codes': {},    # e.g. {'-99': 'not reported', '-77': 'not applicable', '-88': 'unable to extract'}
    'scope_rules': [],
    'outcome_definitions': {},
    'sheets': {},           # sheet_name -> {mode, col_names, required_fields, data_start_row, skip, notes_col}
}
```

### 1a. Read the Codebook First

Find the sheet whose name contains `Codebook`, `Instructions`, `Guide`, or `ReadMe`
(case-insensitive). Also read any uploaded `.docx` / `.docx.md` protocol file.

Extract and store:

**Design type** — look for these keywords in the Codebook text:
```python
def detect_design_type(cb_text):
    t = cb_text.lower()
    if re.search(r'single.arm|no\s+comparator|no\s+formal\s+pairwise', t):
        if re.search(r'hybrid|where\s+comparator|pairwise.*where', t):
            return 'hybrid'          # single-arm + optional comparator (e.g., sheet 9)
        if re.search(r'stratum|etiology|system\s+stratum', t):
            return 'stratified_single_arm'
        return 'single_arm'
    if re.search(r'nma|network\s+meta|multi.arm|four\s+arm|multiple\s+arm', t):
        return 'nma'
    return 'comparative'
```

**Missing-data codes** — read from the Codebook "MISSING DATA CODES" section.
Use **only** the codes defined in the Codebook. Do not invent or add codes.
All 11 known workbooks use exactly these three codes:

| Code | Meaning |
|---|---|
| `-99` | Explicitly not reported in source |
| `-77` | Not applicable (e.g., arm-specific outcome not relevant to this arm) |
| `-88` | Unable to extract (e.g., figure-only data, cohort-level only, PDF garbled) |

```python
SCHEMA['missing_codes'] = {}  # populated from Codebook — never hardcoded
```

**Scope rules** — project-specific; never substitute generic rules.

**Outcome definitions** — store each outcome name and definition string from the
"KEY OUTCOME DEFINITIONS" / "OUTCOME DEFINITIONS" section of the Codebook.
These are used in Step 4 to generate the correct Outcome values for Mode H/I/J/K rows.

```python
SCHEMA['outcome_definitions'] = {
    'Outcome_Name': 'Full definition string...',
    ...
}
```

### 1b. Detect Arm Labels (6-Method Cascade)

Apply methods in order; stop when a clear answer is found.

**Method 0 — Single-arm / stratified-single-arm shortcut**
If `SCHEMA['design_type']` is `'single_arm'` or `'stratified_single_arm'`:
- Set `SCHEMA['arm_labels'] = []`
- Detect stratum labels from the stratum column (see Method 6 below)
- Skip Methods 1-5

**Method 1 — Arm column values**
```python
def detect_arms_from_arm_column(wb):
    arm_values = set()
    arm_col_names = {'arm', 'group', 'treatment', 'branch', 'intervention'}
    for sn in wb.sheetnames:
        ws = wb[sn]
        col2_header = str(ws.cell(1, 2).value or '').strip().lower()
        if col2_header in arm_col_names:
            for row in range(2, ws.max_row + 1):
                v = ws.cell(row, 2).value
                if v:
                    arm_values.add(str(v).strip())
    return sorted(arm_values)
```

**Method 2 — events_ header suffixes** (wide multirow outcomes sheets)
```python
def detect_arms_from_outcome_headers(wb):
    arm_labels, seen = [], set()
    for sn in wb.sheetnames:
        ws = wb[sn]
        for col in range(2, ws.max_column + 1):
            header = str(ws.cell(2, col).value or '')
            m = re.match(r'^events_(.+)$', header)
            if m and m.group(1) not in seen:
                arm_labels.append(m.group(1)); seen.add(m.group(1))
    return arm_labels
```

**Method 3 — Comparison column "X vs Y" parse** (Outcomes_PairwiseEffects sheets)
```python
def detect_arms_from_comparison_column(wb):
    arms, seen = [], set()
    for sn in wb.sheetnames:
        ws = wb[sn]
        if str(ws.cell(1, 2).value or '').strip().lower() == 'comparison':
            for row in range(2, ws.max_row + 1):
                v = str(ws.cell(row, 2).value or '')
                for part in re.split(r'\s+vs\s+', v, flags=re.IGNORECASE):
                    p = part.strip()
                    if p and p not in seen:
                        arms.append(p); seen.add(p)
    return arms
```

**Method 4 — Codebook "ARMS coded as:" section** (NMA and multi-arm designs)
```python
def detect_arms_from_codebook_coded_as(cb_text):
    m = re.search(r'ARMS?\s+coded\s+as[:\s]+([^\n]+)', cb_text, re.IGNORECASE)
    if m:
        raw = m.group(1)
        tokens = re.findall(r'(\w[\w\.]*)\s*\(', raw)   # tokens before parentheses
        if not tokens:
            tokens = [t.strip() for t in raw.split('/') if t.strip()]
        if not tokens:
            tokens = [t.strip() for t in raw.split(',') if t.strip()]
        return [t for t in tokens if t]
    return []
```

**Method 5 — Codebook pairwise comparison lines "C1: X vs Y"**
```python
def detect_arms_from_codebook_pairwise(cb_text):
    comparisons = re.findall(r'C\d+:\s*(\w[\w\.]*)\s+vs\s+(\w[\w\.]*)', cb_text)
    if comparisons:
        return list(dict.fromkeys([a for pair in comparisons for a in pair]))
    return []
```

**Method 6 — Stratum column values** (stratified designs)
```python
def detect_strata_from_stratum_column(wb):
    strata = set()
    stratum_col_names = {'etiology_stratum', 'pfa_system', 'stratum', 'system', 'etiology'}
    for sn in wb.sheetnames:
        ws = wb[sn]
        col2_header = str(ws.cell(1, 2).value or '').strip().lower()
        if col2_header in stratum_col_names:
            for row in range(2, ws.max_row + 1):
                v = ws.cell(row, 2).value
                if v:
                    strata.add(str(v).strip())
    return sorted(strata)
```

**Conflict resolution**: Method 1 (Arm column values) is the authority for comparative
designs. Method 4 (Codebook "ARMS coded as:") is the authority for NMA designs.

**If arm labels still cannot be determined**, ask the user before proceeding.

Store results:
```python
SCHEMA['arm_labels'] = [...]      # comparative / NMA
SCHEMA['stratum_labels'] = [...]  # stratified designs
SCHEMA['n_arms'] = len(SCHEMA['arm_labels'])
```

### 1c. Classify Every Sheet's Layout Mode

For each sheet, detect its layout mode using this extended decision tree:

```
Does col1 = 'StudyID'?
├── No  → SKIP (Codebook, registry, or provenance sheet — read for schema only)
│         [Detect: sheet name contains 'MAUDE', 'Provenance', 'Registry',
│          'Pharmacovigilance', 'Matrix', or col1 is not 'StudyID']
└── Yes → What is col2?
           ├── 'Arm' / 'Group' / 'Treatment' / 'Branch'
           │   └── What is col3?
           │       ├── 'Outcome' / 'Endpoint' / 'KM_Outcome'
           │       │   → PER_ARM_OUTCOME_LONG
           │       │     (one row per StudyID × Arm × Outcome)
           │       └── anything else
           │           → PER_ARM_LONG
           │             (one row per StudyID × Arm)
           ├── 'Comparison'
           │   → PER_COMPARISON_PER_OUTCOME
           │     (one row per StudyID × Comparison × Outcome)
           ├── 'Outcome' / 'KM_Outcome' / 'Endpoint'
           │   → PER_ENTITY_PER_STUDY
           │     (one row per StudyID × Outcome)
           ├── 'Tool' / 'RoB_Tool' / 'Bias_Tool'
           │   → PER_STUDY_ROB
           ├── 'Etiology_Stratum' / 'PFA_System' / 'Stratum' / 'System'
           │   └── What is col3?
           │       ├── 'Arm'
           │       │   → PER_STRATUM_ARM_OUTCOME
           │       │     (one row per StudyID × Stratum × Arm [× Outcome])
           │       └── anything else
           │           → PER_STRATUM
           │             (one row per StudyID × Stratum)
           └── anything else
               └── Does the sheet have merged cells in row 1?
                   ├── Yes → PER_STUDY_WIDE_MULTIROW
                   │         (one row per study; 2-row header; data starts row 3)
                   └── No  → Do column names contain arm-label prefixes?
                             ├── Yes → PER_STUDY_WIDE
                             └── No  → PER_STUDY
```

**TimeToEvent_KM special case** — this sheet has 5 different structures across workbooks.
Always re-detect its mode from col2 rather than assuming:

| col2 value | Mode | Example workbooks |
|---|---|---|
| `Outcome` | PER_ENTITY_PER_STUDY | Sheets 1, 2, 3 |
| `Comparison` | PER_COMPARISON_PER_OUTCOME | Sheets 4, 5 |
| `Arm` | PER_ARM_OUTCOME_LONG | Sheets 10, 11 |
| `Etiology_Stratum` (col2) + `Arm` (col3) | PER_STRATUM_ARM_OUTCOME | Sheet 9 |

**Outcome sheet name variants** — the following sheet names all represent the same
conceptual "events per arm" data but with different structures. Always detect mode
from column headers, not from the sheet name:

| Sheet name | Typical mode | Notes |
|---|---|---|
| `Outcomes_EventCounts` | PER_STUDY_WIDE_MULTIROW | Sheets 1-3; 2-row merged header; 163 cols |
| `Outcomes_ArmEvents` | PER_ARM_OUTCOME_LONG | Sheets 4, 5, 9; col1=StudyID, col2=Arm, col3=Outcome |
| `Outcomes_BinaryEvents` | PER_ARM_OUTCOME_LONG | Sheets 10, 11; col1=StudyID, col2=Arm, col3=Outcome |
| `Outcomes_ContinuousChanges` | PER_ARM_OUTCOME_LONG | Sheets 10, 11; col1=StudyID, col2=Arm, col3=Outcome |
| `Outcomes_PairwiseEffects` | PER_COMPARISON_PER_OUTCOME | Sheets 4, 5, 9, 10, 11 |

Store for each sheet:
```python
SCHEMA['sheets'][sheet_name] = {
    'mode': '<mode>',
    'col_names': {},            # col_index -> reconstructed column name
    'required_fields': [],      # column names with green header fill (may be empty — see Step 1e)
    'data_start_row': 2,        # 3 for multirow headers
    'skip': False,              # True for Codebook, MAUDE, ZOLL, provenance sheets
    'notes_col': None,          # column index of the Notes/Definition_Note column (see Step 1f)
}
```

**Detecting merged-cell multi-row headers — with None propagation fix:**

```python
def reconstruct_column_names(ws):
    max_col = ws.max_column
    domain_map = {}
    for merge in ws.merged_cells.ranges:
        if merge.min_row == 1:
            anchor_val = ws.cell(1, merge.min_col).value
            for c in range(merge.min_col, merge.max_col + 1):
                domain_map[c] = anchor_val  # propagate anchor to all columns in range

    row2_vals = [ws.cell(2, c).value for c in range(1, max_col + 1)]
    has_row2 = any(v is not None for v in row2_vals)

    col_names = {}
    for c in range(1, max_col + 1):
        domain = domain_map.get(c, ws.cell(1, c).value) or ''
        if has_row2:
            subfield = ws.cell(2, c).value or ''
            name = (f"{domain}__{subfield}"
                    if (domain and subfield and domain != subfield)
                    else (domain or subfield))
        else:
            name = str(domain)
        col_names[c] = name

    return col_names, (3 if has_row2 else 2)
```

**Detecting skip sheets** (non-extraction sheets):
```python
def is_skip_sheet(ws, sn):
    skip_name_keywords = {'maude', 'provenance', 'registry', 'pharmacovigilance',
                          'matrix', 'codebook', 'instruction', 'guide', 'readme', 'legend'}
    if any(k in sn.lower() for k in skip_name_keywords):
        return True
    col1 = str(ws.cell(1, 1).value or '').strip().lower()
    return col1 != 'studyid'
```


### 1g. Read Header Cell Comments for Every Sheet

The Codebook says: *"Comments on each header cell define the field. Hover to view."*
These comments contain field-level extraction rules that override general assumptions.
Read them in Step 1 and store them alongside the column names.

```python
def read_header_comments(ws, col_names, data_start_row):
    """
    Read openpyxl cell comments from header rows.
    Returns dict: col_index -> comment text string.
    """
    header_row = data_start_row - 1
    comments = {}
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(header_row, col)
        if cell.comment and cell.comment.text:
            comments[col] = cell.comment.text.strip()
        # For 2-row headers, also check row 1
        if data_start_row == 3:
            cell_r1 = ws.cell(1, col)
            if cell_r1.comment and cell_r1.comment.text:
                comments[col] = comments.get(col, '') + ' | ' + cell_r1.comment.text.strip()
    return comments
```

Store in SCHEMA:
```python
SCHEMA['sheets'][sn]['col_comments'] = read_header_comments(ws, col_names, data_start_row)
```

**Before extracting any field**, check `SCHEMA['sheets'][sn]['col_comments'].get(col_index)`.
If a comment exists, it is the authoritative instruction for that field. Examples of
comment-driven rules that override defaults:

| Comment says | Rule |
|---|---|
| `"Median, not mean. Convert from years if needed."` | Use median field; convert units before writing |
| `"Use mean if reported; otherwise use median in Median_Age and leave Mean blank."` | Do not fill Mean with median — use the correct field |
| `"Format: YYYY-YYYY."` | Enrolment_Years must be formatted exactly as `2018-2022` |
| `"Format: FirstAuthor_Year."` | StudyID must match this format exactly |
| `"Y/N."` | Only `Y` or `N` are valid — not `Yes`, `No`, `1`, `0` |
| `"Use -77 if arm absent."` | Explicit missing-code instruction for this field |
| `"Prefer ISTH; record BARC 3-5 / TIMI major as fallback in Definition_Note."` | Record the definition used in Definition_Note |
| `"Intention-to-treat or as-randomised denominator. Specify in Notes if PP only."` | Note the denominator type if it is per-protocol |
| `"One row per (study, arm, outcome)."` | Confirms layout mode — use as cross-check |

---


### 1h. Full Sheet Read-Through Before Any Data Entry

**Before writing a single data value into any sheet, read the entire target sheet
from top to bottom.** This is a mandatory orientation pass — not optional.

What to do in the read-through:

```
FOR EACH sheet in the workbook (that is not SKIP):
  1. Read all column headers (row 1, and row 2 if multirow)
  2. Read all header cell comments (Step 1g)
  3. Note the layout mode (Step 1c)
  4. Note the notes column location (Step 1f)
  5. Note any existing data rows (do not overwrite them)
  6. Note the last occupied row (next empty row = where new data goes)
  7. Identify any columns with controlled vocabulary from comments
     (e.g., Y/N fields, coded fields like Design, Arm, Tool)
  8. Identify any columns with unit requirements from comments
     (e.g., "months not years", "integer only", "number only not %")
```

Only after completing this read-through for ALL sheets should you open the first
study file and begin extraction.

**Why this matters**: Writing data into the wrong column, wrong row, or wrong sheet
is the most common structural error. The read-through makes the full target structure
explicit before any data is touched.

Declare the read-through complete before proceeding:
```
SHEET READ-THROUGH COMPLETE
============================
Study_Metadata       : 21 cols | last data row = 1 (empty) | notes_col = 21
Baseline_PerArm      : 32 cols | last data row = 1 (empty) | notes_col = None
Outcomes_EventCounts : 163 cols | 2-row header | last data row = 2 (empty) | notes_col = [10,19,28,...]
Outcomes_PairwiseEffects: 13 cols | last data row = 1 (empty) | notes_col = 13
TimeToEvent_KM       : 18 cols | last data row = 1 (empty) | notes_col = 17
RiskOfBias           : 13 cols | last data row = 1 (empty) | notes_col = 13
Controlled vocab fields:
  Study_Metadata.Design       → RCT / propensity-matched cohort / unmatched comparative cohort / single-arm
  Study_Metadata.Industry_Sponsored → Y / N
  Baseline_PerArm.Arm         → LAAO / DOAC
  RiskOfBias.Tool             → RoB2 / ROBINS-I
  RiskOfBias.Overall_Judgement → Low / Some concerns / High (RoB2) | Low / Moderate / Serious / Critical (ROBINS-I)
Unit-constrained fields:
  Baseline_PerArm.Pct_*       → number only, no % sign
  Study_Metadata.Median_FollowUp_Months → months (convert from years if needed)
  Study_Metadata.Enrolment_Years → format YYYY-YYYY
```

---

### 1d. Declare Schema Before Proceeding

Print and confirm the full detected schema before reading any study:

```
SCHEMA DECLARATION
==================
Design type : comparative / single_arm / nma / hybrid / stratified_single_arm
Arms        : ['Arm1', 'Arm2']  [detected via: <method>]
Strata      : ['Stratum1', 'Stratum2']  [if stratified design]
Missing codes: -99 = not reported | -77 = not applicable | -88 = unable to extract
Scope rules : [list from Codebook, or "none specified"]

Sheet layout:
  Study_Metadata           per_study               21 cols, 4 required, notes_col=21
  Baseline_PerArm          per_arm_long            32 cols, 0 required (no green), notes_col=None
  Outcomes_ArmEvents       per_arm_outcome_long     8 cols, 3 required, notes_col=8
  Outcomes_PairwiseEffects per_comparison_per_outcome 13 cols, 4 required, notes_col=13
  Outcomes_EventCounts     per_study_wide_multirow 163 cols, 2-row header, notes_col=[10,19,28,...]
  Cohort_Baseline_Stratum  per_stratum             27 cols, 5 required, notes_col=27
  MAUDE_Pharmacovigilance  SKIP (non-extraction)
  RiskOfBias               per_study_rob           13 cols, 4 required, notes_col=13
```

If anything looks wrong, stop and clarify with the user before proceeding.

### 1e. Required Field Detection (Green Highlight — with Fallback)

**IMPORTANT**: Some workbooks do not use green header fills even though the Codebook
says "required fields highlighted green". This is a known workbook inconsistency.
Always check for green fills first; if none are found, apply the fallback rule.

```python
def get_required_fields(ws, header_row=1):
    """
    Detect required fields from green header fill.
    RGB is stored as 8-char ARGB: first 2 chars = alpha, next 6 = RGB.
    Green: G channel > 150, G > R, G > B.
    Returns list of column names with green fill.
    """
    required = []
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(header_row, col)
        try:
            argb = cell.fill.fgColor.rgb  # 8-char ARGB string
            if len(argb) == 8:
                r = int(argb[2:4], 16)
                g = int(argb[4:6], 16)
                b = int(argb[6:8], 16)
                if g > 150 and g > r and g > b:
                    required.append(ws.cell(header_row, col).value)
        except Exception:
            pass
    return required

def get_required_fields_with_fallback(ws, header_row=1, notes_col_names=None):
    """
    Try green-fill detection first. If no green fills found, fall back to
    treating all non-Notes columns as required.
    notes_col_names: set of column name substrings that identify notes columns
    (e.g., {'notes', 'definition_note', 'reconstruction_notes', 'justification_notes'})
    """
    if notes_col_names is None:
        notes_col_names = {'notes', 'definition_note', 'reconstruction_notes',
                           'justification_notes', 'comment', 'remark'}
    required = get_required_fields(ws, header_row)
    if required:
        return required, 'green_fill'
    # Fallback: all non-Notes columns
    fallback = []
    for col in range(1, ws.max_column + 1):
        name = str(ws.cell(header_row, col).value or '').strip()
        if name and not any(k in name.lower() for k in notes_col_names):
            fallback.append(name)
    return fallback, 'fallback_all_non_notes'
```

Store the detection method alongside the required fields:
```python
SCHEMA['sheets'][sn]['required_fields'], SCHEMA['sheets'][sn]['required_fields_method'] = \
    get_required_fields_with_fallback(ws, header_row)
```

When reporting required-field coverage in Step 9, note whether green-fill or fallback
detection was used.

### 1f. Locate the Notes Column for Each Sheet

The Notes column location varies by sheet type. Always detect it dynamically — never
assume it is the last column or a fixed column index.

```python
NOTES_KEYWORDS = {'notes', 'definition_note', 'reconstruction_notes',
                  'justification_notes', 'comment', 'remark', 'annotation'}

def find_notes_col(ws, col_names, data_start_row):
    """
    Find the notes column index for a sheet.
    For single-row headers: scan row 1.
    For two-row headers (PER_STUDY_WIDE_MULTIROW): scan row 2 sub-fields.
    Returns: int (1-based column index) or None if no notes column exists.
    For PER_STUDY_WIDE_MULTIROW: returns list of ints (one per outcome domain).
    """
    header_row = data_start_row - 1
    notes_cols = []
    for col, name in col_names.items():
        if any(k in str(name).lower() for k in NOTES_KEYWORDS):
            notes_cols.append(col)
    if not notes_cols:
        return None
    if len(notes_cols) == 1:
        return notes_cols[0]
    return notes_cols  # multiple notes columns (e.g., one per outcome domain in multirow sheets)
```

**When no Notes column exists** (e.g., `Baseline_PerArm` in sheets 1-5):
- Do NOT silently drop confidence tags and missing-data notes.
- Write a structured annotation to the **last non-empty column** of the row, appended
  as a string suffix: `" | [NOTE: <tag> <reason>]"`.
- If even that is not possible (read-only sheet), log the note in the extraction summary
  (Step 9) under "Reviewer actions needed".
- Never create a new column in the output file.

```python
def write_note(ws, row, notes_col, note_text, col_names):
    """Write a note to the notes column, or append to last data column if no notes col."""
    if notes_col is not None:
        cols = notes_col if isinstance(notes_col, list) else [notes_col]
        # For multirow sheets, write to the notes col of the relevant domain
        target_col = cols[0]  # default to first; caller should pass domain-specific col
        existing = ws.cell(row, target_col).value or ''
        ws.cell(row, target_col).value = (existing + ' | ' + note_text).strip(' | ')
    else:
        # No notes column — append to last data column
        last_col = max(col_names.keys())
        existing = str(ws.cell(row, last_col).value or '')
        ws.cell(row, last_col).value = (existing + ' | [NOTE: ' + note_text + ']').strip(' | ')
```

---

## Step 2 — Read Study Files (One Study at a Time)

### Source priority

1. Supplementary eTables / appendices (most granular)
2. Main paper tables
3. Main paper results text
4. Abstract (least reliable — flag with `[INF]` if used)

### 2a. Column-Header-as-Prompt Rule

Every column in the extraction sheet is an extraction instruction.
Before extracting any field, construct its prompt from two sources:

| Source | What to use |
|---|---|
| Column name | The field being extracted (e.g., `Median_FollowUp_Months`) |
| Header comment (`col_comments`) | The field-level rule from the Codebook (e.g., `"Convert from years if needed. Median preferred."`) |

```python
def build_field_prompt(col_name, col_comment=''):
    """
    Construct the extraction prompt for a single column.
    Mirrors PrismaMind's column-header-as-prompt pattern.
    """
    base = col_name.replace('_', ' ')
    if col_comment:
        return f"{base}. {col_comment.strip()}"
    return base
```

**Example:**
```
Column:  Median_FollowUp_Months
Comment: "Convert from years if needed. Median preferred over mean."
Prompt:  "Median Follow Up Months. Convert from years if needed. Median preferred over mean."
```

Use this prompt as the search instruction when scanning the PDF or .md file for that field's value.

### 2a-PROMPTS. Pre-Built Prompt Library (PROMPTS.md)

A complete natural-language extraction prompt has been pre-written for **every column
across all 26 sheet tabs** in this project. This library is stored in `PROMPTS.md`
(in the same skill folder as this SKILL.md).

**When to use PROMPTS.md:**
- When `build_field_prompt()` produces a vague prompt (e.g., column name is a code like `Pct_LVEF_Below_25`)
- When a header comment is absent or too brief
- When you need the exact expected format/constraints for a field
- When you are unsure what a column is asking for

**How to use it:**
1. Find the tab name (e.g., `## TAB: Baseline_PerArm`)
2. Find the column name in the table
3. Read the **Extraction Prompt** column — this is the question to ask the PDF
4. Read the **Format / Constraints** column — this is what value to write

**Example lookup:**

| Column | Extraction Prompt | Format / Constraints |
|--------|-------------------|----------------------|
| `Pct_LVEF_Below_25` | What percentage of patients had LVEF <25%? | Numeric (%) or -99. |
| `Mean_Native_QRS_ms` | What was the mean native (intrinsic) QRS duration in milliseconds before pacing? | Numeric (ms) or -99. |
| `Pct_Pre_TAVR_RBBB` | What percentage of patients had pre-existing RBBB before TAVR? | Numeric (%) or -99. |

**PROMPTS.md covers:**
- All 26 sheet tabs across all 11 extraction workbooks
- ~800+ unique columns with precise extraction instructions
- Format constraints (numeric, %, integer, controlled vocabulary, free text)
- Missing code guidance (-99 / -77 / -88) for every field
- Stratum-specific fields (e.g., PPCM-only, Sarcoidosis-only) with -77 rules

**Priority rule:** If PROMPTS.md and `build_field_prompt()` give different prompts,
PROMPTS.md takes precedence — it was written with full knowledge of the clinical context.
If a column appears in the sheet but not in PROMPTS.md, fall back to `build_field_prompt()`.

### 2b. Structured Extraction Output Format

**Before writing any value to the sheet**, declare a structured block for every field
in the current sheet-tab. This makes every extraction auditable and provides source
citations automatically.

For each field, output:

```
### FIELD: <ColumnName>
**ANSWER:** <value to write -- already formatted per enforce_format()>
**SOURCE:** "<exact quote from the paper>"
**PAGE:** <page number or section heading>
**CONFIDENCE:** <[DS] / [INF] / [CALC] / [SUP: eTableX] / [FIG]>
```

**Full example for one study, Study_Metadata tab:**
```
### FIELD: StudyID
**ANSWER:** Reddy_2023
**SOURCE:** "Reddy et al. (2023)"
**PAGE:** 1
**CONFIDENCE:** [DS]

### FIELD: Design
**ANSWER:** RCT
**SOURCE:** "Patients were randomly assigned 1:1 to..."
**PAGE:** 2
**CONFIDENCE:** [DS]

### FIELD: Total_N
**ANSWER:** 1395
**SOURCE:** "A total of 1395 patients were enrolled"
**PAGE:** 3
**CONFIDENCE:** [DS]

### FIELD: Median_FollowUp_Months
**ANSWER:** 24
**SOURCE:** "Patients were followed for a median of 2 years (IQR 1.5-2.8)"
**PAGE:** 4
**CONFIDENCE:** [CALC] 2 years x 12 = 24 months

### FIELD: Industry_Sponsored
**ANSWER:** Y
**SOURCE:** "This study was funded by..."
**PAGE:** 1
**CONFIDENCE:** [DS]

### FIELD: Notes
**ANSWER:** [DS] Design=RCT | [CALC] FollowUp converted from years
**SOURCE:** --
**PAGE:** --
**CONFIDENCE:** --
```

Rules for the structured block:
- Output the **complete block for all fields in the tab** before writing anything to the sheet.
- If a value cannot be found: `**ANSWER:** -99` (or `-77`/`-88` as appropriate) with `**SOURCE:** Not found after checking [sections searched]`.
- If two sources conflict: `**ANSWER:** [CONFLICT] Table=47, Text=51` -- resolve per Step 4.5 before writing.
- The `**SOURCE:**` field must be an **exact quote** from the paper, not a paraphrase.
- The `**PAGE:**` field must be a page number (PDF) or section heading (.md file).
- After the user reviews the block (or immediately in batch mode), write all values to the sheet.

### .md files

Read as plain text. Tables are pipe-delimited; values may contain +/-, ranges, CIs.
Use `##`/`###` headings to navigate sections efficiently.
Check both main `.md` and any `_supplement.md` before finalising any field as "not reported".

**Note**: `.md` files are already text-extracted from PDFs -- they are the preferred
input format. Do NOT ask users to re-upload as raw PDFs.

When citing a value from a .md file, use the section heading as the PAGE reference:
```
**PAGE:** Methods > Patient Population
```

### .pdf files

PDF text and tables are extracted in Step 0.5 and stored in `STUDY_INDEX`. Do NOT
re-open PDF files during extraction — always query `STUDY_INDEX[study_id]` instead.

**For page-level citations** (pdfplumber source): use `STUDY_INDEX[sid]['raw_pages']`
**For table data**: use `STUDY_INDEX[sid]['tables']` (always pdfplumber 2D grids)
**For section text**: use `STUDY_INDEX[sid]['sections']` (labeled sentences)

If extracted text is empty or `STUDY_INDEX[sid]['scanned'] == True`, mark all fields
`-88` and inform user. Do not attempt extraction from a scanned study.

### Section-aware field search

Use `search_field()` to find values in study text. This replaces the old `find_in_pdf()`
flat-text scan with a section-prioritised search.

```python
# Section priority map: for each field type, which sections to search first
FIELD_SECTION_PRIORITY = {
    'StudyID':            ['TITLE'],
    'Design':             ['METHODS', 'ABSTRACT', 'INTRODUCTION'],
    'Total_N':            ['ABSTRACT', 'RESULTS', 'METHODS'],
    'Enrolment_Years':    ['METHODS', 'RESULTS'],
    'Median_FollowUp':    ['METHODS', 'RESULTS', 'ABSTRACT'],
    'Industry_Sponsored': ['FUNDING', 'ACKNOWLEDGEMENTS', 'ABSTRACT'],
    'Registration_ID':    ['METHODS', 'ABSTRACT'],
    'Pct_':               ['RESULTS', 'METHODS', 'ABSTRACT'],
    'Mean_':              ['RESULTS', 'METHODS'],
    'Median_':            ['RESULTS', 'METHODS'],
    'Events':             ['RESULTS', 'ABSTRACT'],
    'HR':                 ['RESULTS', 'ABSTRACT'],
    'P_value':            ['RESULTS', 'ABSTRACT'],
    'RoB':                ['METHODS', 'ABSTRACT'],
    'DEFAULT':            ['RESULTS', 'METHODS', 'ABSTRACT', 'INTRODUCTION',
                           'DISCUSSION', 'CONCLUSION', 'UNKNOWN'],
}

def search_field(study_id: str, search_term: str, col_name: str = '') -> list:
    """
    Search STUDY_INDEX sections for a term, prioritised by section relevance.
    Returns list of (section_name, sentence, citation_ref) tuples.
    citation_ref: section name for GROBID/md, 'p.N' for pdfplumber.
    """
    entry = STUDY_INDEX[study_id]
    sections = entry['sections']
    raw_pages = entry['raw_pages']
    source_type = entry['source_type']

    priority = FIELD_SECTION_PRIORITY['DEFAULT']
    for key, plist in FIELD_SECTION_PRIORITY.items():
        if key != 'DEFAULT' and (col_name.startswith(key) or key in col_name.upper()):
            priority = plist
            break

    results = []
    seen = set()

    for target_section in priority:
        for (sec_name, sentence) in sections:
            if sec_name == target_section and search_term.lower() in sentence.lower():
                ref = _citation_ref(sentence, raw_pages, source_type, sec_name)
                key = (sec_name, sentence[:60])
                if key not in seen:
                    results.append((sec_name, sentence, ref))
                    seen.add(key)

    for (sec_name, sentence) in sections:
        if sec_name not in priority and search_term.lower() in sentence.lower():
            ref = _citation_ref(sentence, raw_pages, source_type, sec_name)
            key = (sec_name, sentence[:60])
            if key not in seen:
                results.append((sec_name, sentence, ref))
                seen.add(key)

    return results

def _citation_ref(sentence: str, raw_pages: dict, source_type: str, sec_name: str) -> str:
    """Returns section name for GROBID/md, page number for pdfplumber."""
    if source_type in ('grobid', 'md'):
        return sec_name
    for page_num, text in raw_pages.items():
        if sentence[:40].lower() in text.lower():
            return f'p.{page_num}'
    return sec_name
```

**Updated structured block format** — use `**SECTION:**` for GROBID/md, `**PAGE:**` for pdfplumber:

```
### FIELD: Median_FollowUp_Months
**ANSWER:** 24
**SOURCE:** "Patients were followed for a median of 2 years (IQR 1.5-2.8)"
**SECTION:** RESULTS          ← for GROBID or .md source
**PAGE:** p.4                 ← for pdfplumber fallback source
**CONFIDENCE:** [CALC] 2 years × 12 = 24 months
```

Use whichever label matches `STUDY_INDEX[sid]['source_type']`:
- `source_type = 'grobid'` or `'md'` → use `**SECTION:** <section_name>`
- `source_type = 'pdfplumber'` → use `**PAGE:** p.N`

### Table search

For numeric fields (event counts, percentages, effect estimates), always search tables
first — they are the authoritative source for numeric data.

```python
def search_tables(study_id: str, search_term: str) -> list:
    """
    Search pdfplumber tables for a term in headers or row values.
    Returns list of {'page': int, 'headers': list, 'rows': list[list]} dicts.
    Always uses pdfplumber 2D grids — never paperetl text-row output.
    """
    results = []
    for tbl in STUDY_INDEX[study_id]['tables']:
        page = tbl['page']
        data = tbl['data']
        if not data:
            continue
        headers = [str(c or '').strip() for c in data[0]]
        header_match = any(search_term.lower() in h.lower() for h in headers)
        matching_rows = [
            row for row in data[1:]
            if search_term.lower() in ' '.join(str(c or '') for c in row).lower()
        ]
        if header_match or matching_rows:
            results.append({
                'page': page,
                'headers': headers,
                'rows': matching_rows if matching_rows else data[1:]
            })
    return results
```


### Isolation Rule

> While reading Study A's files, never reference or use any value from Study B's files.

---

## Step 3 — Scope Check

Verify the study against `SCHEMA['scope_rules']` (loaded from Codebook in Step 1a).
These are project-specific — never apply generic rules.

**If a study fails scope:**
- Extract all available fields regardless.
- Add `[OUT-OF-SCOPE: <rule>] Extracted for record; exclude from meta-analysis pool.` to Notes.
- Apply orange fill to the StudyID cell.

---

## Step 4 — Extract Data by Layout Mode


### StudyID Validation

Before writing any row, validate the StudyID format.

```python
import re

def validate_study_id(study_id):
    """
    Valid format: FirstAuthor_Year or FirstAuthor_Year_SUB
    Examples: Reddy_2023, Duytschaever_2023, Kirchhof_2021_SUB
    """
    pattern = r'^[A-Za-z][A-Za-z\-]+_\d{4}(_SUB)?$'
    if not re.match(pattern, str(study_id)):
        return False, f"StudyID '{study_id}' does not match required format FirstAuthor_Year. Fix before writing."
    return True, None
```

If validation fails:
- Do NOT write the row.
- Ask the user to confirm the correct StudyID format before proceeding.
- Common mistakes to auto-correct (with user confirmation):
  - `Reddy et al 2023` → `Reddy_2023`
  - `Reddy2023` → `Reddy_2023`
  - `Reddy_23` → `Reddy_2023` (only if year is unambiguous)

---

Use `SCHEMA['sheets'][sheet_name]['mode']` to choose the extraction pattern.
Column names and arm labels always come from `SCHEMA` — never from memory.


### Format Enforcement Rules (apply to every field before writing)

These rules apply universally across all sheets and all layout modes.
Check the header comment first — if it specifies a format, that overrides these defaults.

| Field type | Rule | Example |
|---|---|---|
| `Pct_` columns | Strip `%` sign; enter number only | `73.5` not `73.5%` |
| Event counts (`Events`, `N_`, `N_AtRisk`) | Integer only; no decimals | `47` not `47.0` |
| `Y/N` fields | Exactly `Y` or `N`; never `Yes`, `No`, `1`, `0`, `True` | `Y` |
| `Design` field | Use exact controlled vocabulary from header comment | `RCT` not `Randomised controlled trial` |
| `Arm` field | Use exact arm code from `SCHEMA['arm_labels']` | `LAAO` not `LAAO arm` |
| `Outcome` field | Use exact outcome string from `SCHEMA['outcome_definitions']` | `Stroke_or_SE` not `Stroke/SE` |
| `Comparison` field | Use exact comparison code from header comment | `C1_Apix5_vs_VKA` not `Apix5 vs VKA` |
| `Enrolment_Years` | Format `YYYY-YYYY` | `2018-2022` not `2018 to 2022` |
| `FollowUp_Months` | Convert years to months if source reports years | `24` not `2 years` |
| `StudyID` | Format `FirstAuthor_Year`; suffix `_SUB` for substudies | `Reddy_2023` not `Reddy et al 2023` |
| Means and SDs | Decimal to same precision as source | `73.5` not `74` if source says `73.5` |
| `Effect_Type` | Record the actual measure from the source | `HR` not `effect estimate` |
| Free-text fields (`Notes`, `Definition_Note`) | Plain text; no special characters | — |

```python
def enforce_format(value, col_name, col_comment=''):
    """Apply format rules before writing any value."""
    if value is None:
        return value
    s = str(value).strip()

    # Y/N fields
    if col_comment and 'Y/N' in col_comment:
        if s.lower() in ('yes', '1', 'true'):
            return 'Y'
        if s.lower() in ('no', '0', 'false'):
            return 'N'

    # Pct_ fields — strip % sign
    if col_name and col_name.startswith('Pct_'):
        s = s.replace('%', '').strip()
        try:
            return float(s)
        except ValueError:
            return s

    # Event count fields — integer
    if col_name and any(col_name.startswith(p) for p in ('Events', 'N_', 'N_AtRisk')):
        try:
            return int(float(s))
        except ValueError:
            return s

    # FollowUp in months — convert years if needed
    if 'months' in col_name.lower() and re.search(r'year', s, re.IGNORECASE):
        m = re.search(r'([\d.]+)\s*year', s, re.IGNORECASE)
        if m:
            return round(float(m.group(1)) * 12, 1)

    return value
```

---

### Mode SKIP — Non-Extraction Sheets

Sheets flagged `skip=True` (Codebook, MAUDE, ZOLL Provenance Matrix, legend sheets):
- Do NOT write any data rows.
- These sheets were already read in Step 1a for schema information.
- Leave them completely unchanged in the output file.

### Mode A — PER_STUDY

One row per study. No arm split.

**Applies to**: `Study_Metadata`, `Intervention_Detail`, `Acute_Hemodynamic`,
`Genotype_Narrative`, and any sheet with no arm/stratum/outcome column as col2.

Extraction:
- Find the next empty row after any existing StudyID rows.
- Write `StudyID` in col 1.
- For each subsequent column, search the study file using the column name as the search term.
- Apply missing-data codes for any unfound fields.

**Standard metadata fields** (search Methods/Abstract):
- `StudyID`, author, year, trial acronym, country, design, N per arm, enrolment years,
  follow-up duration, registration ID, DOI, publication status.
- Design classification: RCT / PSM cohort / unmatched registry / non-randomised comparative /
  single-arm + historical control. Determines RoB tool in Mode F.
- **Era/period flag fields**: derive from enrolment year — never hardcode.
- **Crossover/rescue fields**: extract from protocol section; note exact language in Notes.
- **Monitoring/follow-up fields**: summarise modality and schedule verbatim.
- **Protocol recommendation fields**: quote or paraphrase verbatim.
- **Pre-randomisation procedure fields**: check both baseline table AND Methods section.

### Mode B — PER_ARM_LONG

One row per (StudyID × Arm). Col 2 = `Arm`.

**Applies to**: `Baseline_PerArm`, `Lesion_Set_Composition`, `AAD_Composition`,
`Device_Composition`, `Procedure_Detail` (when col2=Arm), `Outcomes_BinaryEvents`
(when col2=Arm), `Outcomes_ContinuousChanges` (when col2=Arm), `TimeToEvent_KM`
(when col2=Arm), `CKD_Renal_Detail`, `Geriatric_Frailty_Detail`.

Extraction:
- For each study, create **exactly** `len(SCHEMA['arm_labels'])` rows.
- For NMA designs (>2 arms): create one row per arm code listed in `SCHEMA['arm_labels']`.
  A study that only has 2 of 4 possible arms still gets only those 2 rows — use `-77`
  (not applicable) for arms not present in that study.
- Fill remaining columns from the paper per arm.

**NMA multi-arm rule**: Check the paper's Table 1 / Methods to confirm which arms are
present in this specific study. Do not create rows for arms not enrolled.

**Per-arm extraction rules:**
- Arm-specific values in separate table columns → extract directly per arm.
- Total population only → enter total in all arm rows + note `[total population only]`.
- `Pct_` columns → numeric only (e.g., `73.5` not `73.5%`).
- Continuous variables → prefer mean±SD; if only median[IQR], use median fields + `-99` for mean/SD.

### Mode H — PER_ARM_OUTCOME_LONG

One row per (StudyID × Arm × Outcome). Col 1 = `StudyID`, col 2 = `Arm`, col 3 = `Outcome`.

**Applies to**: `Outcomes_ArmEvents` (sheets 4, 5, 9, 10, 11), `Outcomes_BinaryEvents`
(when col3=Outcome), `Outcomes_ContinuousChanges` (when col3=Outcome),
`TimeToEvent_KM` (when col2=Arm and col3=Outcome).

This is the standard outcome sheet for NMA, hybrid, and split binary/continuous designs.

**Outcome list sourcing**: The set of Outcome values to create rows for comes from
`SCHEMA['outcome_definitions']` (loaded from the Codebook in Step 1a). Do NOT invent
outcome names or use generic names. Only create rows for outcomes that are:
1. Listed in the Codebook outcome definitions, AND
2. Potentially reportable for this study's design and arms.

Extraction:
- For each study, create one row per (Arm × Outcome) combination.
- Arm values come from `SCHEMA['arm_labels']` — only arms present in this study.
- Outcome values come from `SCHEMA['outcome_definitions'].keys()`.
- Key columns: `Events`, `N_AtRisk`, `PersonYears`, `FollowUp_Months`, `Definition_Note`.
- For `Outcomes_ContinuousChanges`: key columns are `Baseline_Mean`, `Baseline_SD`,
  `FollowUp_Mean`, `FollowUp_SD`, `Change_Mean`, `Change_SD`, `Reported_Effect_Type`.
- `Definition_Note`: always populate — state whether trial definition matches Codebook,
  note any deviation (different scale, time horizon, composite vs component).

**Single_Arm coding**: For hybrid designs (e.g., sheet 9), studies without a comparator
use `Single_Arm` as the Arm value. Create one row per outcome with `Arm = Single_Arm`.
Studies with a comparator use the actual arm codes (e.g., `Ablation` + `AAD_or_MedicalManagement`).

### Mode I — PER_COMPARISON_PER_OUTCOME

One row per (StudyID × Comparison × Outcome). Col 2 = `Comparison`.

**Applies to**: `Outcomes_PairwiseEffects` (sheets 4, 5, 9, 10, 11),
`TimeToEvent_KM` (when col2=Comparison).

Extraction:
- For each study, create one row per (Comparison × Outcome) combination.
- `Comparison` values are the pre-specified pairwise comparisons from the Codebook
  (e.g., `Apix5 vs VKA`, `LOT_CRT vs BiV_CRT`).
- Only create rows for comparisons that are estimable from this study's arms.
  Use `-77` (not applicable) for comparisons where one arm is absent.
- Key columns: `Effect_Type`, `Effect_Estimate`, `LCL_95`, `UCL_95`, `P_value`,
  `Adjusted`, `Adjustment_Variables`, `FollowUp_Months`, `Source_Table_Or_Figure`,
  `Definition_Note`.
- `Effect_Type`: always record the actual measure (HR, RR, OR, IRR, MD, SMD) — do not
  assume from column name.
- `Adjusted`: `Yes` / `No` / `-99`. If `Yes`, populate `Adjustment_Variables`.

### Mode J — PER_STRATUM

One row per (StudyID × Stratum). Col 2 = stratum column (e.g., `Etiology_Stratum`,
`PFA_System`).

**Applies to**: `Cohort_Baseline_Stratum` (sheets 6, 8), `WCD_Wear_Detail` (sheet 8),
`Outcomes_StratumStratified` (sheet 8), `Outcomes_SystemStratified` (sheet 6).

Extraction:
- For each study, create one row per stratum reported in the paper.
- Stratum values come from `SCHEMA['stratum_labels']` (Codebook controlled vocabulary).
- If a study reports only one stratum, create one row.
- If a study reports mixed/unseparable data, use the `Mixed_*_NotSeparable` stratum
  code from the Codebook and note in Definition_Note.
- Apply `-77` (not applicable) for stratum-specific fields that don't apply to this stratum.

### Mode K — PER_STRATUM_ARM_OUTCOME

One row per (StudyID × Stratum × Arm × Outcome). Col 1 = `StudyID`, col 2 = stratum
column, col 3 = `Arm`.

**Applies to**: `Outcomes_ArmEvents` and `Cohort_Baseline_Stratum` in sheet 9
(VT Ablation NICM — hybrid design with stratum + arm indexing).
Also `TimeToEvent_KM` when col2=stratum and col3=Arm (sheet 9).

Extraction:
- For each study, create one row per (Stratum × Arm × Outcome) combination.
- Stratum values from `SCHEMA['stratum_labels']`.
- Arm values from `SCHEMA['arm_labels']` (or `Single_Arm` for single-arm cohorts).
- Only create rows for stratum × arm combinations actually present in the paper.
- This is the most complex layout — read the Codebook row-structure instructions carefully
  before writing any rows.

### Mode C — PER_STUDY_WIDE

One row per study. Both arms appear as column groups with arm-label prefixes.

**Applies to**: `Procedure_Detail` (when columns are named `<Arm>_<Field>`),
`Intervention_Detail` (when arm-prefixed).

Extraction:
- One row per study.
- For each column, the arm label is the prefix before the first `_`.
- Shared fields (no arm prefix) → extract once per study.
- Arm-only fields → use `-77` for the non-applicable arm's column.

### Mode D — PER_STUDY_WIDE_MULTIROW

One row per study. Two-row header: row 1 = domain (merged), row 2 = sub-fields.
Data starts at row 3.

**Applies to**: `Outcomes_EventCounts` (sheets 1, 2, 3 — the wide 163-column format).

Column names reconstructed as `DomainName__SubFieldName` using `reconstruct_column_names()`.

Sub-field pattern per domain (9 columns per outcome domain):
```
events_<Arm1>  N_<Arm1>  events_<Arm2>  N_<Arm2>  <EffectMeasure>  LCL_95  UCL_95  P_value  Definition_Note
```

The `Definition_Note` sub-field appears at column 10, 19, 28, ... (every 9 columns,
starting at column 10). Use `reconstruct_column_names()` to find these columns — do
not hardcode the column indices.

Always record actual effect measure type (HR/RR/OR/IRR) in `Definition_Note`.

### Mode E — PER_ENTITY_PER_STUDY

One row per (StudyID × Outcome). Col 2 = `Outcome` / `KM_Outcome` / `Endpoint`.

**Applies to**: `TimeToEvent_KM` (sheets 1-3, when col2=Outcome),
`Outcomes_Combined` (sheet 7), `Staged_Procedure_Descriptive` (sheet 7),
`Outcomes_PairwiseEffects` (sheet 10, 11 when col2=Outcome not Comparison).

Extraction:
- One row per outcome per study.
- `KM_Curve_Available`: check all figures and supplementary figures.
- `Suitable_For_Reconstruction`: `Yes` only if KM curve image + at-risk numbers at
  regular intervals. `No` otherwise.
- HR and CIs: prefer reported values in Results text/tables over figure-derived values.

### Mode F — PER_STUDY_ROB (Risk of Bias)

One row per study. Col 2 = `Tool` / `RoB_Tool`.

Select RoB tool from study design detected in metadata:
- **RCT** → **RoB 2** (5 domains): Randomisation process / Deviations from intended
  interventions / Missing outcome data / Measurement of outcome / Selection of reported result.
  Judgements: `Low` / `Some concerns` / `High`.
- **Non-randomised comparative / PSM / registry** → **ROBINS-I** (7 domains):
  Confounding / Selection / Classification / Deviations / Missing data / Measurement /
  Selection of reported result.
  Judgements: `Low` / `Moderate` / `Serious` / `Critical`.
- **Single-arm cohort** → **JBI Prevalence Checklist** (or NIH Quality Assessment Tool
  for cohort studies, per Codebook instruction).
- **Single-arm with historical control** → **ROBINS-I**; note design limitation in Notes.

`Reviewer1_Initials`: Enter `AI` when the skill is acting as extractor.
`Reconciled`: Leave blank / `No`.

**Multiple RoB tools in one project** (e.g., sheets 8, 9, 10, 11 use RoB 2 + ROBINS-I +
JBI depending on study design): detect the correct tool per study from the design field
in `Study_Metadata`. Never apply the same tool to all studies without checking.

**Study-specific RoB domain variants**: Some workbooks add a study-specific domain
(e.g., `LBBAP_Capture_Confirmation_Adequate` in sheets 10-11,
`VT_Recurrence_Adjudication_Independent` in sheet 9). Always extract these from the
actual column headers — do not assume a fixed domain list.

### Mode G — ANY UNRECOGNISED SHEET

1. Determine layout mode using the decision tree in Step 1c.
2. Read the Codebook for sheet-specific instructions.
3. Extract column by column using the column header as the search term.
4. Apply the same missing-data codes, confidence tags, and Notes conventions.

---


---

## Step 4.5 — Numeric Double-Check Before Writing

**Every numeric value must be verified against the source a second time before it is
written to the sheet.** Do not write a number on the first read. Read it, note it,
then locate it again in the source and confirm it matches. Only then write it.

### What to double-check

Apply this rule to every numeric field:

| Field type | Double-check method |
|---|---|
| Event counts (n, N, Events) | Re-read the exact table cell or sentence; confirm numerator and denominator separately |
| Percentages (`Pct_` columns) | Re-derive from n/N if both are available; confirm the % matches |
| Means and SDs | Re-read the table cell; confirm units match the column (e.g., months not years) |
| Effect estimates (HR, RR, OR) | Re-read the result sentence AND the table; confirm they agree |
| Confidence intervals | Confirm LCL < point estimate < UCL; if not, flag `[CONFLICT]` |
| P-values | Re-read; confirm the comparison direction matches the effect estimate |
| Follow-up durations | Confirm units (months vs years); convert to the column's expected unit |

### Double-check procedure

For each numeric value:

1. **First read** — locate the value in the source (table, text, or supplement).
   **For numeric fields**: call `search_tables(study_id, search_term)` first.
   Tables are the authoritative source for event counts, percentages, and effect
   estimates. Only fall back to `search_field()` text search if no matching table
   is found.
   Note it internally: `"First read: 47 events out of 312 patients"`.

2. **Second read** — locate the same value again independently in the source.
   Confirm it is the same number in the same context.
   Note: `"Second read confirmed: 47/312"`.

3. **Sanity checks** — before writing, verify:
   - Is the number plausible for this field? (e.g., a percentage must be 0-100;
     an N must be ≤ Total_N; an SD must be > 0)
   - Does it match related fields already written?
     (e.g., `events / N_AtRisk` should approximate the reported rate)
   - Does the arm-level value sum correctly to the total?
     (e.g., `N_Arm1 + N_Arm2` should ≈ `Total_N` in Study_Metadata)

4. **Write** — only after both reads agree and sanity checks pass.

### When the two reads disagree

If the first and second reads give different numbers (e.g., different table vs text):
- Do NOT average them or pick one arbitrarily.
- Flag as `[CONFLICT]` with light-red fill.
- Write the more conservative value (lower event count, wider CI, higher p-value).
- Note both values in the Notes column:
  `[CONFLICT] Table reports 47; Results text reports 51. Entered 47 (table). Verify.`

### When a sanity check fails

If a sanity check fails (e.g., percentage > 100, LCL > UCL, N_arm > Total_N):
- Do NOT write the implausible value.
- Enter `-88` (unable to extract) with orange fill.
- Note the specific failure:
  `[SANITY FAIL] LCL (0.91) > UCL (0.87) — impossible CI. Entered -88. Verify source.`

### Calculated values

When a value is calculated (e.g., deriving % from n/N, or converting months to years):
- Show the calculation in the Notes column: `[CALC] 47/312 = 15.1%`
- Round to the same decimal precision as the source reports.
- Do not over-round (e.g., do not round 15.06% to 15% if the source gives one decimal).

---

---

## Step 4.6 — Exhaustive Source Search Before Writing -99

**A field may only be coded -99 after ALL of the following search locations have been checked and found empty.**
This rule applies universally — to every field, every sheet, every study design.

| Search order | Location | Implementation |
|---|---|---|
| 1 | Results tables | `search_tables(study_id, search_term)` — 2D pdfplumber grids |
| 2 | Results text | `search_field(study_id, search_term, col_name)` → sections `['RESULTS']` |
| 3 | Methods section | `search_field(study_id, search_term, col_name)` → sections `['METHODS']` |
| 4 | Abstract | `search_field(study_id, search_term, col_name)` → sections `['ABSTRACT']` |
| 5 | Supplementary | Supplement sections already in `STUDY_INDEX[sid]['sections']` (appended in Step 0.5g); search `['SUPPLEMENTARY']` |
| 6 | Synonym search | Repeat steps 1-5 with synonym terms from the Universal Synonym Table |
| 7 | Derivation | Arithmetic from already-found values (see Universal Derivation Rules) |

**Implementation note**: Steps 1-5 use `STUDY_INDEX` — no file re-reading required. Supplement content is already indexed in Step 0.5g under the same StudyID.

Only after all 7 search steps and derivation attempts fail: write -99, and note in the Notes column which locations were checked.

### Universal Synonym Table

| Column concept | Synonyms to search |
|---|---|
| Follow-up duration | "median follow-up", "mean follow-up", "follow-up period", "observation period", "censoring at X years/months", "administrative censoring", "study duration" |
| Comparator arm type | "control group", "standard of care", "OAT", "anticoagulation", "medical therapy", "drug therapy" — note if it includes VKA, DOAC, or both |
| Subgroup / substudy flag | "subgroup", "subset", "sub-cohort", "restricted to", "limited to", "enrolled from", "drawn from", "derived from" a larger registry or trial |
| Procedural success | "technical success", "implant success", "successful procedure", "per-protocol population" |
| Adherence / persistence | "compliance", "persistence", "on-treatment", "discontinuation", "drug gap", "treatment interruption" |
| eGFR / renal function | "GFR", "creatinine clearance", "CKD stage", "renal impairment", "kidney function" |
| AF type | "paroxysmal", "persistent", "permanent", "long-standing persistent", "AF type", "AF pattern" |
| Prior ICH | "intracranial haemorrhage", "intracranial hemorrhage", "ICH", "intracerebral bleed", "prior brain bleed" |
| OAC naive | "anticoagulant-naive", "OAC-naive", "no prior anticoagulation", "first anticoagulant" |

### Universal Derivation Rules

| Target field | Derivation if not directly reported |
|---|---|
| `Pct_Female` | 100 − Pct_Male (if male % reported) |
| `Total_N` | N_Arm1 + N_Arm2 (+ N_Arm3 for NMA) |
| `Median_FollowUp_Months` | If fixed administrative censoring stated (e.g. "2-year follow-up"), use that horizon × 12 and tag [CALC] with note "fixed administrative censoring, not reported median" |
| `Pct_X` | n_X / N_arm × 100 if both numerator and denominator are reported |
| `SD` | If IQR reported: SD ≈ IQR / 1.35 (normal approximation) — tag [CALC] with note |

---

## Step 4.7 — -99 Recheck Pass

**After completing the full extraction of one study across all sheet tabs**, run a single targeted recheck of every -99 cell.

1. Collect every cell written as -99 for that study.
2. For each -99 cell, re-read the **one most likely source location** for that field (see priority table below).
3. If found on recheck: overwrite -99 with the value, tag [RECHECK], note the source.
4. If still not found: leave as -99. Do not repeat the full 7-step search — this is a single targeted re-read only.
5. Log recheck results in the per-study summary (Step 9).

### Recheck Priority Locations by Field Type (Universal)

| Field type | Most likely location to recheck |
|---|---|
| Baseline demographics (age, sex, comorbidities) | Table 1 / Baseline characteristics table |
| Follow-up duration | Methods > Study follow-up / Statistical analysis |
| Primary outcome HR + CI | Abstract results paragraph |
| Secondary outcome HRs | Results tables (Table 2 / Table 3) |
| Procedural details | Methods > Procedure / Intervention section |
| Comparator drug details | Methods > Study population / Intervention |
| Registration ID | Title page header, Methods > Ethics/Registration, journal DOI page |
| Funding source | Funding / Acknowledgements section (last pages) |
| Subgroup flag | Methods > Study population, first paragraph of Results |

---

## Step 4.8 — Universal Gap Rules (apply to every study, every design)

These five rules address the most common extraction gaps across all clinical study types.
They are not disease-specific. Apply them during extraction (Steps 4-4.7) for every study.

### Rule G1 — Fixed-Horizon Follow-Up (No Reported Median)

When a study uses administrative censoring at a fixed time point (e.g. "patients were followed for 2 years", "censored at 36 months") and no median follow-up is explicitly reported:
- Write the fixed horizon value (converted to months) in `Median_FollowUp_Months`
- Tag [CALC] and add to Notes: "Fixed administrative censoring at X months — no reported median"
- Do NOT leave as -99 simply because the word "median" does not appear

### Rule G2 — Comparator Arm Heterogeneity

Before writing any value into a comparator arm column, check whether the comparator arm is homogeneous (one drug class) or mixed (e.g. VKA + DOAC, or "any oral anticoagulant"):
- If mixed: write "mixed" in the comparator type field and document the composition in Notes (e.g. "VKA 56% + NOAC 44%")
- Flag in `Study_Metadata.Notes`: "[NOTE: Comparator arm includes mixed drug classes — check pooling eligibility.]"
- This applies to any comparative study where the control arm is a drug class, not a single agent

### Rule G3 — Subgroup / Substudy Detection

Before writing `Subgroup_or_Substudy` (or equivalent field), actively check whether the study population was drawn from a larger parent registry, trial, or cohort:
- Search for phrases: "enrolled in", "drawn from", "restricted to", "subset of", "participants from", "data from the [X] registry/trial"
- If the study population is a subset of a larger dataset: write Y and name the parent in Notes
- If the study is the primary publication of its own cohort: write N
- Do NOT default to N without checking

### Rule G4 — Immortal Time Bias (Universal RoB Domain)

For any non-randomised comparative study (PSM cohort, registry comparison, unmatched cohort):
- In `RiskOfBias.Domain1_Confounding` (or equivalent confounding domain), explicitly check: "Does follow-up start at the same time point for both arms?"
- If the intervention arm's follow-up starts later than the control arm's (e.g. after a procedure, after a waiting period), flag immortal time bias in the confounding domain and justify in `Justification_Notes`
- This applies to any study where one arm undergoes a procedure or intervention that takes time to schedule/perform

### Rule G5 — Effect Estimate Conflict Resolution

When the same effect estimate (HR, RR, OR) appears in multiple locations (abstract, results text, table) with different values:
1. First check whether the rate ratio (annualized event rate Arm1 / Arm2, or n1/N1 ÷ n2/N2) is consistent with one of the reported values — use this as the arbiter
2. If the rate ratio supports one value: enter that value, flag [CONFLICT], note both values and the arbiter calculation in Definition_Note
3. If the rate ratio is ambiguous: enter the more conservative value (closer to null), flag [CONFLICT], note both values
4. Never average conflicting values or silently pick one without flagging

---

## Step 5 — Confidence Tagging

For every extracted value, assign a confidence tag in the **Notes column of the same row**
(or last data column if no Notes column — see Step 1f).
Multiple tags separated by ` | `.

| Tag | Meaning | Required detail |
|---|---|---|
| `[DS]` | Directly Stated -- verbatim from table or text | None |
| `[INF]` | Inferred -- logically derived | Brief reasoning |
| `[CALC]` | Calculated -- arithmetic performed | Show the calculation: `[CALC] 2 yrs x 12 = 24 mo` |
| `[SUP: eTable X]` | From supplementary file | Specify which file and table |
| `[FIG]` | From figure -- value approximated visually | Specify figure number |
| `[PDF-p.N: "quote"]` | From PDF page N | **Must include exact quote** |

### Source citation rule (from PrismaMind)

The `[PDF-p.N]` tag must always include the **exact quote** from the source, not just
the page number. This is the same as PrismaMind's `**SOURCE:**` field.

**Correct:**
```
[PDF-p.4: "Patients were followed for a median of 2 years (IQR 1.5-2.8)"]
```

**Wrong (page only, no quote):**
```
[PDF-p.4]
```

**Wrong (paraphrase instead of quote):**
```
[PDF-p.4: follow-up was 2 years]
```

For .md files, use the section heading instead of a page number:
```
[MD: Methods > Patient Population: "A total of 1395 patients were enrolled"]
```

The structured block in Step 2b generates these citations automatically -- the
`**SOURCE:**` and `**PAGE:**` fields map directly to this tag format:
```
**PAGE:** 4   +   **SOURCE:** "Patients were followed for a median of 2 years..."
→ [PDF-p.4: "Patients were followed for a median of 2 years..."]
```

---

## Step 6 — Conflict Detection

Before writing output, detect and flag:

1. **Cross-source discrepancy**: Same variable differs across abstract / table / supplement.
2. **Arm-total mismatch**: Sum of per-arm N ≠ Total_N.
3. **Percentage anomalies**: Percentages implying impossible denominators.
4. **Effect measure without CIs**: Flag but do not block extraction.
5. **Outcome definition deviation**: Trial definition differs from Codebook.
6. **PDF extraction artefacts**: Implausible numerics → `[PDF-ARTEFACT: verify against source]`.
7. **NMA arm absent**: Study enrolled only a subset of the Codebook arm list — flag which
   arms are absent and apply `-77` to their rows.

---

## Step 7 — Missing Field Highlighting and Notes

Every cell containing a missing-data code must be highlighted and documented.

### Build colour map dynamically from SCHEMA missing codes

```python
from openpyxl.styles import PatternFill

BASE_FILLS = {
    'not_reported':      PatternFill('solid', fgColor='FFD700'),  # Yellow
    'not_applicable':    PatternFill('solid', fgColor='D3D3D3'),  # Grey
    'unable_to_extract': PatternFill('solid', fgColor='FFA500'),  # Orange
    'conflict':          PatternFill('solid', fgColor='FF6666'),  # Light red
    'required_missing':  PatternFill('solid', fgColor='FF0000'),  # Bright red
    'scope_fail':        PatternFill('solid', fgColor='FFA500'),  # Orange
    'pdf_artefact':      PatternFill('solid', fgColor='FFB3DE'),  # Pink
}

def build_fill_map(missing_codes: dict) -> dict:
    fill_map = {}
    for code, meaning in missing_codes.items():
        m = meaning.lower()
        if any(w in m for w in ['not applic', 'not apply', 'n/a']):
            fill_map[code] = BASE_FILLS['not_applicable']
        elif any(w in m for w in ['unable', 'figure', 'unreadable', 'cannot extract']):
            fill_map[code] = BASE_FILLS['unable_to_extract']
        else:
            fill_map[code] = BASE_FILLS['not_reported']
    return fill_map
```

### Colour legend

| Colour | Semantic role |
|---|---|
| Yellow (`FFD700`) | "Not reported" code |
| Grey (`D3D3D3`) | "Not applicable" code |
| Orange (`FFA500`) | "Unable to extract" code |
| Light red (`FF6666`) | Conflict between sources |
| Bright red (`FF0000`) | Required field still missing |
| Pink (`FFB3DE`) | PDF extraction artefact |
| Orange on StudyID cell | Out-of-scope study |

### Structured reason strings

```
[MISSING: <code>] <FieldName> — <reason>. Checked: <sources>.
```

### Required field post-check

```python
def post_check_required_fields(ws, sheet_name, data_start_row):
    col_names = SCHEMA['sheets'][sheet_name]['col_names']
    required_fields = SCHEMA['sheets'][sheet_name]['required_fields']
    notes_col = SCHEMA['sheets'][sheet_name]['notes_col']
    col_map = {name: idx for idx, name in col_names.items()}
    for field in required_fields:
        col = col_map.get(field)
        if col is None:
            continue
        for row in range(data_start_row, ws.max_row + 1):
            if ws.cell(row, 1).value:
                val = ws.cell(row, col).value
                if val in SCHEMA['missing_codes'] or val is None:
                    ws.cell(row, col).fill = BASE_FILLS['required_missing']
                    write_note(ws, row, notes_col,
                               f'[REQUIRED MISSING] {field}', col_names)
```

---

## Step 8 — Write Output (Versioned File)

Never overwrite the original. Stage in `/workspace/` first, then copy to `/mnt/results/`.

```python
import shutil
from datetime import date
from openpyxl import load_workbook

wb = load_workbook('/mnt/user-uploads/<original_filename>.xlsx')

# Add Extraction_Legend sheet
legend_ws = wb.create_sheet('Extraction_Legend')
legend_ws.append(['Colour', 'Code / Tag', 'Meaning'])
for code, meaning in SCHEMA['missing_codes'].items():
    legend_ws.append(['See fill', code, meaning])
legend_ws.append(['Light Red (FF6666)',  'CONFLICT',     'Conflicting values across sources'])
legend_ws.append(['Bright Red (FF0000)', 'REQUIRED',     'Required field missing'])
legend_ws.append(['Pink (FFB3DE)',       'PDF_ARTEFACT', 'PDF extraction artefact — verify'])
legend_ws.append(['Orange on StudyID',  'OUT-OF-SCOPE', 'Study excluded from meta-analysis'])
legend_ws.append(['Teal (008080)',       'RECONCILED',   'Reconciled cell (reconciliation mode)'])
legend_ws.append(['', '', ''])
legend_ws.append(['CONFIDENCE TAGS', '', ''])
for tag, meaning in [('[DS]','Directly stated'), ('[INF]','Inferred'),
                     ('[CALC]','Calculated'), ('[SUP: eTable X]','From supplementary'),
                     ('[FIG]','From figure'), ('[PDF-p.N]','From PDF page N')]:
    legend_ws.append([tag, '', meaning])

fill_map = build_fill_map(SCHEMA['missing_codes'])
for i, code in enumerate(list(SCHEMA['missing_codes'].keys()), start=2):
    if code in fill_map:
        legend_ws.cell(row=i, column=1).fill = fill_map[code]

today = date.today().strftime('%Y-%m-%d')
stem = '<original_filename_without_extension>'
local_path = f'/workspace/{stem}_extracted_v1_{today}.xlsx'
wb.save(local_path)
shutil.copy(local_path, f'/mnt/results/{stem}_extracted_v1_{today}.xlsx')
```

**Naming**: `<OriginalFilename>_extracted_v1_<YYYY-MM-DD>.xlsx`
**On re-run**: increment to `_v2_`, `_v3_`, etc.

---

## Step 9 — Post-Extraction Summary

| StudyID | Format | Parser | Design | Scope | Sheets | Req. filled | -99 | -77 | -88 | Conflicts | Actions needed |
|---|---|---|---|---|---|---|---|---|---|---|
| Reddy_2023 | MD | md | comparative | IN | 7/7 | 51/58 | 5 | 2 | 0 | 1 | Verify Table 3 conflict |

Also report:
- **Design type detected** and method used
- **Arms/strata detected** and detection method
- **Required field detection method**: green-fill or fallback (all non-Notes columns)
- **Schema assumptions** — anything inferred rather than explicitly stated
- **Confidence breakdown**: DS / INF / CALC / SUP / FIG / PDF-p.N counts
- **Notes column status per sheet**: column index found, or "none — notes appended to last column"
- **Reviewer actions**: specific cells requiring human verification
- **Parser used per study**: GROBID / pdfplumber / md (from `STUDY_INDEX[sid]['source_type']`) — note any GROBID fallbacks
- **Section coverage**: list of unique section names found per study (e.g. `TITLE, ABSTRACT, METHODS, RESULTS, DISCUSSION`) — flag studies where RESULTS or METHODS sections were not detected

---

## Step R — Reconciliation Mode

**Trigger**: User uploads two filled extraction sheets ± study files.

### R1. Load both sheets and detect schema

```python
wb1 = openpyxl.load_workbook('/mnt/user-uploads/extractor1.xlsx', data_only=True)
wb2 = openpyxl.load_workbook('/mnt/user-uploads/extractor2.xlsx', data_only=True)
# Re-run Step 1 schema detection on wb1
```

### R2. Cell-by-cell comparison

Use `data_start_row` from `SCHEMA['sheets'][sn]['data_start_row']` — never hardcode as 2.

```python
def values_agree(v1, v2):
    if v1 == v2:
        return True
    try:
        f1, f2 = float(v1), float(v2)
        abs_diff = abs(f1 - f2)
        rel_threshold = 0.01 * max(abs(f1), abs(f2))
        return abs_diff <= max(rel_threshold, 0.5)  # combined relative + absolute floor
    except (TypeError, ValueError):
        return False

def compare_sheets(ws1, ws2, sheet_name):
    data_start_row = SCHEMA['sheets'][sheet_name]['data_start_row']
    header_row = data_start_row - 1
    disagreements = []
    for row in range(data_start_row, ws1.max_row + 1):
        study_id = ws1.cell(row, 1).value
        if not study_id:
            continue
        for col in range(2, ws1.max_column + 1):
            v1 = ws1.cell(row, col).value
            v2 = ws2.cell(row, col).value
            if not values_agree(v1, v2):
                disagreements.append({
                    'study_id': study_id, 'sheet': sheet_name,
                    'field': ws1.cell(header_row, col).value,
                    'e1': v1, 'e2': v2, 'row': row, 'col': col
                })
    return disagreements
```

### R3. AI Adjudication Verdicts

Re-read the relevant study passage before adjudicating each disagreement.

| Verdict | Meaning |
|---|---|
| `AGREE_E1` | Extractor 1 correct — cite source passage |
| `AGREE_E2` | Extractor 2 correct — cite source passage |
| `BOTH_WRONG` | Neither correct — provide correct value with source |
| `AMBIGUOUS` | Source genuinely ambiguous — flag; enter most conservative value |
| `MISSING_SOURCE` | Study file not uploaded — flag for human review |

Apply teal fill to reconciled cells: `PatternFill('solid', fgColor='FF008080')`

### R4 & R5. Output and Summary

Add `Reconciliation_Log` sheet. Report: total cells compared, disagreement count (%),
verdict breakdown, unresolved items, inter-rater agreement rate.

---

## Large-Batch PDF Mode (10-20 Studies)

### Before starting

1. Run Step 0 fully -- schema read, existing StudyID scan, PDF assignment, queue declaration
2. Confirm the queue with the user before processing any PDF
3. Never start extraction until Phase 1 (Orient) is complete

### PDF quality triage (Phase 2, per study)

```python
import pdfplumber

def assess_pdf_quality(path):
    """Returns: ('FULL_TEXT' | 'PARTIAL' | 'SCANNED', details_string)"""
    try:
        with pdfplumber.open(path) as pdf:
            total = len(pdf.pages)
            text_pages = sum(1 for p in pdf.pages
                             if p.extract_text() and len(p.extract_text().strip()) > 100)
            ratio = text_pages / total if total > 0 else 0
            if ratio >= 0.8:
                return 'FULL_TEXT', f'{text_pages}/{total} pages have text'
            elif ratio >= 0.3:
                return 'PARTIAL', f'Only {text_pages}/{total} pages have text'
            else:
                return 'SCANNED', f'Only {text_pages}/{total} pages have text -- likely scanned'
    except Exception as e:
        return 'SCANNED', f'PDF could not be opened: {e}'
```

| Quality | Action |
|---|---|
| `FULL_TEXT` | Proceed with extraction |
| `PARTIAL` | Extract available text; mark unreadable sections `-88` with `[PDF-PARTIAL: page X unreadable]` |
| `SCANNED` | Mark ALL fields `-88`; add to manual-review list; move to next study immediately |

### Per-study tab order (Phase 3)

Always process sheet-tabs in this fixed order:
1. `Study_Metadata`
2. `Baseline_PerArm`
3. Domain-specific sheets (`Intervention_Detail`, `Procedure_Detail`, `CKD_Renal_Detail`, etc.)
4. Outcomes sheets (`Outcomes_EventCounts`, `Outcomes_ArmEvents`, `Outcomes_BinaryEvents`, `Outcomes_ContinuousChanges`)
5. `Outcomes_PairwiseEffects`
6. `TimeToEvent_KM`
7. `RiskOfBias`

Complete each tab fully before moving to the next. Never jump ahead.

### Error isolation

If extraction fails on one study:
- Log: `[EXTRACTION FAILED] StudyID -- reason`
- Add to manual-review list
- Continue with the next study in the queue -- do NOT stop the batch

### Append-only rule

```python
def find_next_empty_row(ws, data_start_row=2):
    """Find the first row with no StudyID value."""
    for row in range(data_start_row, ws.max_row + 2):
        if not ws.cell(row, 1).value:
            return row
    return ws.max_row + 1
```

Every write must use `find_next_empty_row()`. Never overwrite existing rows.
Check `ALREADY_EXTRACTED` before writing any StudyID -- if it exists, skip that tab.

### Batch progress tracking

After each study completes, print a one-line status:
```
[3/15] OK  Kirchhof_2021     -- 7/7 tabs | 58 fields | 3x-99 | 1x-88 | 0 conflicts
[4/15] ERR Brandes_2018      -- SCANNED PDF -- added to manual review
[5/15] OK  Rillig_2021       -- 7/7 tabs | 55 fields | 5x-99 | 0x-88 | 1 conflict
```

---

## Anti-Mixing Guardrails

| Risk | Guardrail |
|---|---|
| Using Study B's N to fill Study A's missing arm count | Only use values from Study A's own files |
| Reusing "similar-looking" values across studies | Re-extract independently every time |
| Supplement belonging to Study B used for Study A | File ownership by filename prefix only |
| Ambiguous filename | Stop and ask user — never guess |
| Same first author + same year | Require disambiguation before building registry |
| Overwriting a previous study's row | Always find next empty row |
| Processing studies interleaved | Complete all sheets for Study A before starting Study B |
| Hardcoding arm labels | Always read from `SCHEMA['arm_labels']` |
| Using column names from memory | Always use `SCHEMA['sheets'][sn]['col_names']` |
| Applying scope rules from a different project | Scope rules come from the current Codebook only |
| Writing data to SKIP sheets | Check `SCHEMA['sheets'][sn]['skip']` before writing |

---

## Error Prevention Checklist

| Error | Prevention |
|---|---|
| Hardcoding arm labels (e.g., `ERC`, `PFA`, `LAAO`) | Always read from `SCHEMA['arm_labels']` |
| Hardcoding era/period flags | Derive from enrolment year — never hardcode |
| Merged-cell None domain in outcomes sheet | `reconstruct_column_names()` propagates anchor to all merge columns |
| Wrong row count in per_arm_long sheets | Create exactly `len(SCHEMA['arm_labels'])` rows per study |
| NMA study with only 2 of 4 arms | Only create rows for arms present; use `-77` for absent arms |
| Single_Arm coding in hybrid design | Use `Single_Arm` as Arm value for studies without comparator |
| Writing to MAUDE / ZOLL / provenance sheets | Check `skip=True` flag — never write data to these sheets |
| Misclassifying hybrid design as single-arm | Check Codebook for "hybrid" / "where comparator" language |
| Misclassifying stratified design as comparative | Check col2 for stratum column names |
| Using abstract values when table values exist | Table > text > abstract — always |
| Leaving cells blank | No blank cells — always use the appropriate missing-data code |
| Losing merged-cell structure on save | Use `openpyxl` (not pandas); preserve styles |
| Conflating effect measure types | Always record HR vs RR vs OR in Definition_Note |
| Skipping supplementary files | Scan uploads directory before finalising any "not reported" code |
| Missing cell unhighlighted | Every missing-data code cell gets a colour fill |
| Notes column blank for missing cells | Every missing cell gets a `[MISSING: code]` note |
| No Notes column in sheet (e.g., Baseline_PerArm) | Use `write_note()` — appends to last data column |
| Confidence tags silently dropped when no Notes col | `write_note()` always finds a target column |
| Required field missing without red flag | Run `post_check_required_fields()` after writing all values |
| `post_check_required_fields` wrong column map | Use `SCHEMA['sheets'][sn]['col_names']`, not raw row-1 values |
| Green-fill detection returns empty (no green fills) | `get_required_fields_with_fallback()` — treat all non-Notes cols as required |
| Assuming green fills exist in all workbooks | Always check; many workbooks use uniform dark-blue headers |
| Conflict not highlighted | Cross-source discrepancy → light-red fill + `[CONFLICT]` note |
| Legend sheet absent | Always create `Extraction_Legend` in every output file |
| Overwriting original file | Always save as `_extracted_v1_<date>.xlsx` |
| Saving .xlsx directly to /mnt/results/ | Stage in `/workspace/` first, then `shutil.copy` |
| PDF numeric artefacts silently accepted | Flag with `[PDF-ARTEFACT]` + pink fill |
| Scope failure silently skipped | Always extract + flag with `[OUT-OF-SCOPE]` + orange fill |
| Reconciling without re-reading study | Always re-read the study passage before adjudicating |
| Reconciliation `data_start_row` hardcoded as 2 | Always use `SCHEMA['sheets'][sn]['data_start_row']` |
| Numeric tolerance false positives near zero | Use `max(0.01 × max(|v1|,|v2|), 0.5)` |
| Schema from memory across sessions | Re-run Step 1 at the start of every new session |
| `.docx` protocol file treated as a study | Register as protocol/codebook supplement in Step 0a |
| Confidence tags written to a separate log | Tags go in the Notes column of the same row |
| Asking user to re-upload .md files as PDFs | .md files are already text-extracted — preferred format |
| Applying same RoB tool to all studies | Detect RoB tool per study from design field in Study_Metadata |
| Assuming fixed RoB domain list | Read domain column names from actual sheet headers |
| Hardcoding Definition_Note column index | Use `reconstruct_column_names()` to find it dynamically |
| Assuming TimeToEvent_KM always has col2=Outcome | Re-detect mode from col2 — 5 variants exist |
| Assuming Outcomes_ArmEvents = Outcomes_BinaryEvents | Same concept, different names — always detect mode from headers |
| Inventing outcome names for Mode H/I/J/K rows | Outcome list comes from `SCHEMA['outcome_definitions']` only |
| Using codes not in the Codebook | Only use codes defined in the Codebook MISSING DATA CODES section — never invent new ones |
| Notes_col hardcoded as last column | Use `find_notes_col()` — location varies by sheet type |
| Multirow sheet Definition_Note at wrong column | Use `reconstruct_column_names()` — it appears every 9 cols in Outcomes_EventCounts |
| Header cell comments not read | Step 1g — read all comments before extraction; they override general rules |
| Sheet structure not reviewed before data entry | Step 1h — full read-through of all sheets before opening any study file |
| `%` sign written in Pct_ column | `enforce_format()` strips % sign; enter number only |
| `Yes`/`No` written in Y/N field | `enforce_format()` converts to `Y`/`N` |
| Follow-up in years when column expects months | `enforce_format()` converts years × 12 |
| Wrong controlled vocabulary in Design/Arm/Tool | Use exact strings from header comment or SCHEMA |
| StudyID in wrong format | `validate_study_id()` — must be `FirstAuthor_Year` before any row is written |
| Outcome string not matching Codebook | Use exact strings from `SCHEMA['outcome_definitions']` keys |
| Writing a number after only one read | Always read the value twice from the source before writing (Step 4.5) |
| Implausible numeric value written silently | Run sanity checks before writing: % in 0-100, LCL < estimate < UCL, N_arm ≤ Total_N |
| Two sources give different numbers | Flag `[CONFLICT]`, enter the more conservative value, note both in Notes |
| Calculated value not documented | Always show the calculation in Notes: `[CALC] n/N = %` |
| Re-extracting a study already in the sheet | Check `ALREADY_EXTRACTED` in Step 0b before adding to queue |
| Overwriting existing rows from previous sessions | `find_next_empty_row()` — always append, never overwrite |
| Ambiguous PDF filename assigned wrong StudyID | Ask user to confirm every non-standard filename before queuing |
| Scanned PDF silently filled with guessed values | `assess_pdf_quality()` — SCANNED → all fields `-88`, skip to next |
| Batch stopped by one failed study | Error isolation — log failure, continue with remaining queue |
| Sheet-tabs processed out of order | Fixed tab order: Metadata → Baseline → Domain → Outcomes → KM → RoB |
| Re-extracting a study already in the sheet | Check `ALREADY_EXTRACTED` in Step 0b before adding to queue |
| Overwriting existing rows from previous sessions | `find_next_empty_row()` -- always append, never overwrite |
| Ambiguous PDF filename assigned wrong StudyID | Ask user to confirm every non-standard filename before queuing |
| Scanned PDF silently filled with guessed values | `assess_pdf_quality()` -- SCANNED -> all fields `-88`, skip to next |
| Batch stopped by one failed study | Error isolation -- log failure, continue with remaining queue |
| Sheet-tabs processed out of order | Fixed tab order: Metadata -> Baseline -> Domain -> Outcomes -> KM -> RoB |
| Extracting without declaring source citations | Step 2b -- output full FIELD/ANSWER/SOURCE/PAGE block before writing |
| Writing -99 without exhaustive search | Step 4.6 — check all 7 locations + synonyms + derivation before writing -99 |
| Skipping -99 recheck pass | Step 4.7 — after completing all tabs for a study, recheck every -99 cell once |
| Fixed-horizon follow-up left as -99 | Rule G1 — derive from stated censoring horizon; tag [CALC] |
| Comparator arm heterogeneity not flagged | Rule G2 — check if comparator is mixed drug class; note composition |
| Subgroup/substudy flag defaulted to N | Rule G3 — actively search for parent registry/trial language |
| Immortal time bias not assessed | Rule G4 — check follow-up start symmetry for all non-randomised studies |
| Conflicting HRs resolved by picking one silently | Rule G5 — use rate-ratio arbiter; flag [CONFLICT]; note both values |
| `[PDF-p.N]` tag missing the source quote | Always include exact quote: `[PDF-p.4: "exact text from paper"]` |
| Searching whole-doc text when page citation needed | Use `extract_pdf_by_page()` -- per-page dict keyed by page number |
| Column name used as-is without field-level rules | `build_field_prompt()` -- combine column name + header comment |
| Writing values before declaring structured block | Step 2b block must be output first; write only after block is complete |
| Step 0.5 not run before Step 1 | Always run `build_study_index()` after Step 0e; `STUDY_INDEX` must exist before any extraction |
| GROBID unavailable causing silent failure | `probe_grobid()` runs at startup; fallback to pdfplumber is automatic and logged |
| GROBID 503 (pool exhausted) treated as success | `parse_pdf_grobid()` checks `response.ok`; any non-200 triggers pdfplumber fallback |
| Re-opening PDF files during extraction | Never call `pdfplumber.open()` in Steps 2-9; always query `STUDY_INDEX[sid]` |
| Using paperetl table text instead of pdfplumber grids | `search_tables()` always uses `STUDY_INDEX[sid]['tables']` which are pdfplumber 2D lists |
| Supplement sections missing from index | Step 0.5g appends supplement sections to main study entry — check `supp` field in QUEUE |
| Scanned PDF attempted for extraction | `STUDY_INDEX[sid]['scanned'] == True` → all fields `-88`; skip extraction entirely |
| `search_field()` searching wrong sections for field type | `FIELD_SECTION_PRIORITY` maps col_name prefixes to section order; DEFAULT covers all others |
| Section names not detected (all UNKNOWN) | Occurs with pdfplumber fallback on unusual layouts; flag in Step 9 section coverage report |
| `**PAGE:**` used for GROBID source | Use `**SECTION:**` for `source_type='grobid'` or `'md'`; `**PAGE:** p.N` only for `source_type='pdfplumber'` |
| Text cleaning not applied to .md files | `parse_md_to_sections()` applies `PaperText.transform()` to every sentence |
| paperetl not installed | Fallback cleaner in Step 0.5 dependencies block handles this transparently |
