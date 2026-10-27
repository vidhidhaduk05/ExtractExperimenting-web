---
name: systematic-review-screener
version: 3.1.0
description: >
  Independent systematic review screener for any clinical domain and meta-analysis.
  Performs both Title & Abstract (first-pass) and Full-text (second-pass) screening
  of RIS files against a user-uploaded protocol. Uses ASReview (active learning,
  pip-installable from PyPI) as the primary screening engine. Enriches every NCT
  number found in the RIS file with live ClinicalTrials.gov API v2 data (free, no
  key required): confirms study design, rescues sparse/missing abstracts, detects
  protocol papers, and feeds a second forward-search channel via CT.gov
  referencesModule running in parallel with Semantic Scholar forward search.
  Extracts PICO, boundary definitions, inclusion/exclusion criteria, and required
  study design from the protocol file, then screens every record and outputs a CSV
  with Decision, Primary_Criterion, Reason, Confidence, ASReview_Score, CT_Enriched,
  CT_Status, and Source_URL. Full-text screening uses user-uploaded PDFs (pdfplumber).
  v3.1 changes: ClinicalTrials.gov NCT enrichment layer (Step 2.7); dual-channel
  forward search (Step 7); two new output CSV columns (CT_Enriched, CT_Status);
  sparse-abstract confidence ceiling lifted to <=75 when CT.gov supplements abstract.
  Use this skill whenever someone uploads a .ris file alongside a protocol file and
  asks to screen, apply inclusion/exclusion criteria, or perform title-and-abstract
  or full-text screening.
tags:
  - systematic-review
  - screening
  - meta-analysis
  - PICO
  - RIS
  - asreview
  - active-learning
  - citation-search
  - full-text
  - PDF
  - clinicaltrials
  - nct-enrichment
---

# Systematic Review Screener (v3.1 — ASReview + ClinicalTrials.gov Edition)

## Scope

Screens every record in a RIS file against PICO and inclusion/exclusion criteria
extracted from a systematic review protocol file. Uses **ASReview** (active learning)
as the primary screening engine, enriched with **ClinicalTrials.gov API v2** data
for every NCT number found in the RIS file. Covers **both** screening stages:

- **Stage 1 — Title & Abstract (T&A):** ASReview ranks and screens all records using
  title + abstract text, seeded with PICO-derived prior labels. CT.gov enrichment
  supplements sparse/missing abstracts and confirms study design before scoring.
- **Stage 2 — Full-text (FT):** pdfplumber extracts text from user-uploaded PDFs;
  ASReview re-ranks using full text where available, falls back to abstract-only
  with confidence ceiling <= 45 where no PDF is matched.

After screening, runs a **dual-channel forward citation search** (Step 7):
- Channel 1: Semantic Scholar API on seed articles extracted from the protocol file
- Channel 2: ClinicalTrials.gov referencesModule on all enriched NCTs (no extra API
  calls -- references already fetched in Step 2.7)

Does NOT retrieve full-text PDFs autonomously, perform data extraction, assess risk
of bias, or run statistical meta-analysis.

---

## Environment Setup

**Install once per session:**

```python
import subprocess, sys

subprocess.run([
    sys.executable, "-m", "pip", "install", "asreview", "pdfplumber", "requests", "-q"
], check=True)

import asreview, pdfplumber, requests
print(f"asreview {asreview.__version__} | pdfplumber {pdfplumber.__version__}")
```

Verify all three packages import before proceeding.

---

## Trigger Phrases

Activate this skill when the user says any of:
- "screen this RIS file", "title and abstract screening", "full-text screening"
- "screen against my protocol", "apply inclusion/exclusion criteria"
- "systematic review screening", "meta-analysis screening"
- uploads a `.ris` file alongside a protocol file (`.docx`, `.md`, `.pdf`, `.txt`)
- "PICO screening", "screen records", "screen abstracts"
- uploads PDFs alongside a RIS file for full-text screening
- "use ASReview", "run ASReview on this"

---

## Inputs

| Input | Format | Required |
|-------|--------|----------|
| Protocol file | `.docx`, `.md`, `.pdf`, `.txt` | Yes |
| RIS file | `.ris` (standard RIS format) | Yes |
| Screening stage | "Title & Abstract" OR "Full-text" | Yes |
| Database name | Free text (e.g., PubMed, Embase) | Yes (for filename) |
| Full-text PDFs | One or more `.pdf` files (FT stage only) | Required for FT stage |

If any input is missing, ask the user before proceeding.

---

## Outputs

| File | Description |
|------|-------------|
| `screening_[STAGE]_[DATABASE]_[DATE].csv` | Full results table, all records, 16 columns incl. CT_Enriched, CT_Status |
| `screening_[STAGE]_[DATABASE]_[DATE]_UNCERTAIN_for_human_review.csv` | UNCERTAIN + Confidence <70 records |
| `forward_search_[STAGE]_[DATABASE]_[DATE].csv` | Forward citation candidates (both channels) with full screening rationale |

All files saved to `/mnt/results/`.

---

## Screener Model

**ASReview** is the primary screener, enriched by **ClinicalTrials.gov** metadata.
Biomni applies PICO criteria and CT.gov data to:
1. Generate prior labels that seed ASReview's active learning model
2. Override ASReview decisions where PICO rules or CT.gov data mandate a hard
   EXCLUDE (wrong design confirmed, explicit OUT-boundary intervention, protocol
   paper detected, true NCT duplicate)
3. Flag UNCERTAIN where ASReview confidence is borderline or PICO criteria are ambiguous

The user reviews only:
- All UNCERTAIN records
- All records with Confidence < 70
- All forward search candidates marked INCLUDE or UNCERTAIN

INCLUDE and EXCLUDE records with Confidence >= 70 do not require user review unless
the user chooses to spot-check them.

---
## Workflow

### STEP 0 — Gather Inputs & Install Dependencies

If the user has not provided all required inputs (protocol file, RIS file, screening
stage, database name), ask before proceeding. Do not assume defaults.

For FT stage: ask the user to upload all available full-text PDFs. Warn that records
without a matching PDF will be assessed as abstract-only with a confidence ceiling <= 45.

Install and verify `asreview`, `pdfplumber`, and `requests` (see Environment Setup).

---

### STEP 1 — Extract Criteria from Protocol File

Read the protocol file in full. Output a structured summary in this exact format
**in the chat** before screening any record:

```
PICO SUMMARY:
  P (Population): [extracted text]
  I (Intervention): [extracted text]
  C (Comparator): [extracted text]
  O (Primary outcome): [extracted text]
  O (Secondary outcomes): [extracted text]

REQUIRED STUDY DESIGN: [extracted from protocol]
  Primary design: [e.g., RCT / Cohort / Case-Control / Any]
  Design detection source: [verbatim protocol phrase]
  RCT default applied: [Yes / No]

PICO BOUNDARY DEFINITIONS:
  INTERVENTION BOUNDARY:
    IN: [exact modalities/strategies/doses explicitly included]
    OUT: [exact modalities/strategies/doses explicitly excluded]
    UNCERTAIN: [partial or ambiguous matches]
  COMPARATOR BOUNDARY:
    IN: [...] OUT: [...] UNCERTAIN: [...]
  POPULATION BOUNDARY:
    IN: [...] OUT: [...] UNCERTAIN: [mixed populations, age ranges not specified]
  OUTCOME BOUNDARY:
    PRIMARY OUTCOME(S): [exact definitions from protocol]
    SURROGATE ENDPOINTS ACCEPTED: [yes/no]
    COMPOSITE OUTCOMES: [list components]
    MINIMUM FOLLOW-UP: [duration if specified]

INCLUSION CRITERIA (numbered exactly as in protocol):
  IC1: [text] IC2: [text] ...

EXCLUSION CRITERIA (numbered exactly as in protocol):
  EC1: [text] EC2: [text] ...

SAMPLE SIZE THRESHOLD: [minimum N; "not specified" if absent]
LANGUAGE RESTRICTION: [languages permitted; "none stated" if absent]
CONFERENCE ABSTRACT RULE: [protocol rule; "not stated -- apply three-signal rule" if absent]
MINIMUM FOLLOW-UP: [duration if specified; "not specified"]
CROSSOVER TRIALS: [accepted / not accepted / not stated]

OUTCOME ALIAS MAP:
  [Primary outcome name]: [alias1, alias2, ...]
  (e.g., "MACE": ["death", "MI", "myocardial infarction", "stroke", "TVR"])

POPULATION SIGNALS: [list of population descriptors from P definition]
INTERVENTION SIGNALS: [list of intervention descriptors from IN list]

SEEDS EXTRACTED FROM PROTOCOL (for forward citation search -- Step 7):
  PMIDs found: [list]
  DOIs found: [list]
  NCT numbers found: [list]
  Total unique seeds: [N]
  [If 0 seeds: WARN -- "No PMIDs or DOIs found. Forward search Channel 1 will be
   skipped unless you paste seed identifiers in chat. Channel 2 (CT.gov) will still
   run on NCTs found in the RIS file."]

Criteria extracted. Ready to screen [N] records.
```

**CRITICAL:** PICO BOUNDARY DEFINITIONS, REQUIRED STUDY DESIGN, OUTCOME ALIAS MAP,
POPULATION SIGNALS, and INTERVENTION SIGNALS must be completed before any record
is screened. These are used consistently across all records to prevent criterion drift.

#### Study Design Detection

```python
DESIGN_KEYWORDS = {
    'rct': ['randomized controlled trial', 'randomised controlled trial', 'RCT',
             'randomized trial', 'randomised trial', 'parallel-group trial',
             'double-blind trial', 'placebo-controlled trial'],
    'cohort': ['cohort study', 'prospective cohort', 'retrospective cohort',
                'longitudinal study', 'observational cohort'],
    'case_control': ['case-control', 'case control study', 'case-control'],
    'cross_sectional': ['cross-sectional', 'cross sectional study', 'prevalence study'],
    'any': ['all study designs', 'any study design', 'no restriction on study design']
}

def detect_study_design(protocol_text):
    text_lower = protocol_text.lower()
    for design, keywords in DESIGN_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text_lower:
                idx = text_lower.find(kw.lower())
                verbatim = protocol_text[max(0, idx-20):idx+len(kw)+20].strip()
                return design, verbatim
    return 'rct', 'Not specified -- RCT default applied'
```

**Seed extraction (run during Step 1):**
```python
import re

def extract_seed_references(protocol_text):
    pmids = list(set(re.findall(
        r'(?:PMID|PubMed\s*ID)[:\s]+(\d{7,8})', protocol_text, re.IGNORECASE)))
    dois = list(set(re.findall(r'10\.\d{4,}/\S+', protocol_text)))
    ncts = list(set(re.findall(r'NCT\d{8}', protocol_text)))
    dois = [re.sub(r'[.,;)\]]+$', '', d) for d in dois]
    return {'pmids': pmids, 'dois': dois, 'ncts': ncts}
```

---

### STEP 2 — Parse the RIS File

Parse every record using `rispy` (bundled with ASReview) or the manual parser below.

#### Auto-detect batch size

```python
def get_record_count(filepath):
    count = 0
    with open(filepath, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('ER'): count += 1
    return count

CHUNK_SIZE = 500
n_records = get_record_count(ris_filepath)
use_chunking = n_records > 1000
```

**Preferred: use rispy:**
```python
import rispy
with open(ris_filepath, encoding='utf-8', errors='replace') as f:
    records = rispy.load(f)
```

**Fallback manual parser:**
```python
def parse_ris(filepath):
    records, current = [], {}
    with open(filepath, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('
')
            if line.startswith('ER'):
                if current: records.append(current); current = {}
            elif '  - ' in line:
                tag, _, value = line.partition('  - ')
                tag = tag.strip()
                if tag in current:
                    if isinstance(current[tag], list): current[tag].append(value)
                    else: current[tag] = [current[tag], value]
                else: current[tag] = value
    return records
```

**Per-record extraction helpers:**
```python
def parse_year(record):
    raw = record.get('PY', record.get('Y1', record.get('year', '')))
    if isinstance(raw, list): raw = raw[0]
    raw = str(raw).strip()
    match = re.search(r'\d{4}', raw)
    return (int(match.group(0)), False) if match else (0, True)

def extract_nct(record):
    fields = ['AB', 'N2', 'UR', 'L2', 'N1', 'TI', 'T1', 'abstract', 'url']
    for field in fields:
        text = record.get(field, '')
        if isinstance(text, list): text = ' '.join(text)
        match = re.search(r'NCT\d{8}', str(text))
        if match: return match.group(0)
    return ''

def build_url(record):
    pmid = str(record.get('PM', record.get('pubmed_id', ''))).strip()
    doi  = str(record.get('DO', record.get('doi', ''))).strip()
    url  = str(record.get('UR', record.get('url', ''))).strip()
    if pmid and pmid.isdigit(): return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    elif doi: return f"https://doi.org/{doi}"
    elif url: return url
    return ""

def classify_pub_type(record):
    ty = str(record.get('TY', record.get('type_of_reference', ''))).strip().upper()
    journal = str(record.get('JO', record.get('JF', record.get('T2', '')))).lower()
    if ty in ('ABST', 'CONF'): return 'conference_abstract'
    if ty in ('JOUR', 'ARTICLE', 'JOUR '): return 'journal_article'
    conf_kw = ['suppl', 'supplement', 'congress', 'conference', 'meeting',
               'abstract book', 'oral presentation', 'poster']
    if any(k in journal for k in conf_kw): return 'conference_abstract'
    return 'unknown'

def normalize_title(title):
    return re.sub(r'[^a-z0-9]', '', str(title).lower())[:80]
```

Apply NCT-registry and title-registry deduplication. After parsing, report in chat:

```
Parsed [N] records from [DATABASE].
NCT numbers found: [N] unique.
  - Same NCT + same title (true duplicates): [N] flagged for EXCLUDE
  - Same NCT + different title (related publications): [N] flagged as UNCERTAIN
Title-based duplicates (same title + same author): [N]
Records with no abstract: [N]
Records with no identifier (PMID/DOI): [N]
Chunking: [Yes/No] -- [N] chunks of [CHUNK_SIZE] records
Please confirm before CT.gov enrichment proceeds.
```

---
### STEP 2.7 — ClinicalTrials.gov NCT Enrichment (NEW in v3.1)

Runs after Step 2 (RIS parsing) and before Step 2.5 (PDF matching). For every
record that has an NCT number, fetch the full trial record from CT.gov API v2.
**Always on** -- no user toggle required.

#### Helper: fetch_ctgov_trial()

```python
import requests, time, re

CTGOV_API = "https://clinicaltrials.gov/api/v2/studies"
CTGOV_FIELDS = ",".join([
    "protocolSection.identificationModule",
    "protocolSection.statusModule",
    "protocolSection.designModule",
    "protocolSection.armsInterventionsModule",
    "protocolSection.outcomesModule",
    "protocolSection.eligibilityModule",
    "protocolSection.sponsorCollaboratorsModule",
    "protocolSection.referencesModule",
])

def fetch_ctgov_trial(nct_id, delay=0.3, timeout=10):
    """
    Fetch trial metadata from ClinicalTrials.gov API v2.
    Returns a dict of enrichment fields, or None on failure.
    Rate-limit: 0.3s delay between calls (conservative; avoids 429s in batch runs).
    """
    try:
        time.sleep(delay)
        r = requests.get(
            f"{CTGOV_API}/{nct_id}",
            params={"fields": CTGOV_FIELDS},
            timeout=timeout
        )
        if r.status_code != 200:
            return None
        data = r.json().get("protocolSection", {})

        id_mod       = data.get("identificationModule", {})
        status_mod   = data.get("statusModule", {})
        design_mod   = data.get("designModule", {})
        arms_mod     = data.get("armsInterventionsModule", {})
        outcomes_mod = data.get("outcomesModule", {})
        elig_mod     = data.get("eligibilityModule", {})
        sponsor_mod  = data.get("sponsorCollaboratorsModule", {})
        refs_mod     = data.get("referencesModule", {})

        arms = [
            f"{a.get('label','?')}: {a.get('type','?')}"
            for a in arms_mod.get("armGroups", [])
        ]
        primary_outcomes = [
            o.get("measure", "")
            for o in outcomes_mod.get("primaryOutcomes", [])
        ]
        references = [
            {"pmid": ref.get("pmid", ""), "citation": ref.get("citation", "")}
            for ref in refs_mod.get("references", [])
        ]

        return {
            "ct_official_title": id_mod.get("officialTitle", id_mod.get("briefTitle", "")),
            "ct_status":         status_mod.get("overallStatus", ""),
            "ct_phase":          (design_mod.get("phases") or ["N/A"])[0],
            "ct_study_type":     design_mod.get("studyType", ""),
            "ct_allocation":     design_mod.get("designInfo", {}).get("allocation", ""),
            "ct_masking":        design_mod.get("designInfo", {}).get(
                                     "maskingInfo", {}).get("masking", ""),
            "ct_enrollment":     design_mod.get("enrollmentInfo", {}).get("count", ""),
            "ct_arms":           arms,
            "ct_primary_outcomes": primary_outcomes,
            "ct_eligibility_criteria": elig_mod.get("eligibilityCriteria", ""),
            "ct_sponsor":        sponsor_mod.get("leadSponsor", {}).get("name", ""),
            "ct_references":     references,
            "ct_enriched":       True,
        }
    except Exception:
        return None
```

#### Enrichment loop

```python
ct_enrichment_cache = {}   # nct_id -> enrichment dict (shared across all records)
ct_failed = []

for record in records:
    nct = record.get("NCT", "")
    if not nct:
        record["ct_enriched"] = False
        record["ct_status"] = ""
        continue
    if nct not in ct_enrichment_cache:
        result = fetch_ctgov_trial(nct)
        if result:
            ct_enrichment_cache[nct] = result
        else:
            ct_enrichment_cache[nct] = None
            ct_failed.append(nct)
    enrichment = ct_enrichment_cache[nct]
    if enrichment:
        record.update(enrichment)
    else:
        record["ct_enriched"] = False
        record["ct_status"] = ""
```

#### Apply enrichment to screening logic (four uses)

**A. Design confirmation (replaces text inference when CT.gov data available):**
```python
def infer_study_design_with_ctgov(record, title, abstract, nct, required_design):
    """
    CT.gov-confirmed design takes precedence over text-based inference.
    Returns: (result, source_note)
      result: True (design satisfied), False (design violated), None (uncertain)
    """
    if required_design == "any":
        return True, "Design: any -- satisfied"

    ct_type = record.get("ct_study_type", "").upper()
    ct_alloc = record.get("ct_allocation", "").upper()

    if ct_type and ct_alloc:
        if required_design == "rct":
            if ct_type == "INTERVENTIONAL" and ct_alloc == "RANDOMIZED":
                return True, "IC1: RCT confirmed from CT.gov (INTERVENTIONAL/RANDOMIZED) -- satisfied"
            elif ct_type == "OBSERVATIONAL" or ct_alloc == "NON_RANDOMIZED":
                return False, "EC1: CT.gov confirms non-randomized/observational design -- EXCLUDE"
        elif required_design == "cohort":
            if ct_type == "OBSERVATIONAL":
                return True, "IC1: Observational design confirmed from CT.gov -- satisfied"
        # Fall through to text-based inference if CT.gov type doesn't match expected
    elif ct_type:
        # Partial CT.gov data -- use as supporting evidence only
        pass

    # Fall back to text-based inference
    text = f"{title} {abstract}"
    if required_design == "rct" and nct:
        return True, "IC1: RCT inferred from NCT number presence"
    for pattern in DESIGN_SIGNAL_MAP.get(required_design, RCT_SIGNALS):
        if re.search(pattern, text, re.IGNORECASE):
            return True, f"IC1: {required_design.upper()} signals found in text"
    return None, f"IC1: {required_design.upper()} not confirmed -- UNCERTAIN"
```

**B. Sparse abstract rescue:**
```python
def supplement_abstract_from_ctgov(record):
    """
    When abstract < 100 words or missing, inject CT.gov structured data.
    Confidence ceiling lifted from <=40/<=60 to <=75 for supplemented records.
    """
    abstract = str(record.get("AB", record.get("N2", record.get("abstract", ""))))
    word_count = len(abstract.split())
    if word_count >= 100 or not record.get("ct_enriched"):
        return abstract, False

    ct = record
    arms_str = "; ".join(ct.get("ct_arms", [])) or "not specified"
    outcomes_str = "; ".join(ct.get("ct_primary_outcomes", [])) or "not specified"
    elig_str = str(ct.get("ct_eligibility_criteria", ""))[:500]

    supplement = (
        f" Trial title: {ct.get('ct_official_title','')}. "
        f"Phase: {ct.get('ct_phase','N/A')}. "
        f"Enrollment: {ct.get('ct_enrollment','?')} participants. "
        f"Arms: {arms_str}. "
        f"Primary outcomes: {outcomes_str}. "
        f"Eligibility: {elig_str}"
    )
    supplemented = (abstract + supplement).strip()
    record["_ct_supplemented"] = True
    return supplemented, True
```

**C. Protocol paper detection:**
```python
PROTOCOL_STATUSES = {"NOT_YET_RECRUITING", "WITHDRAWN"}
RESULTS_LANGUAGE = ["results", "outcomes", "we found", "demonstrated",
                    "showed", "reported", "primary endpoint", "secondary endpoint"]

def detect_protocol_paper(record):
    """
    Returns (is_protocol, reason) based on CT.gov status.
    Exception: if abstract contains results language, downgrade to UNCERTAIN.
    """
    ct_status = record.get("ct_status", "").upper()
    if ct_status not in PROTOCOL_STATUSES:
        return False, None
    abstract = str(record.get("AB", record.get("N2", record.get("abstract", "")))).lower()
    has_results = any(phrase in abstract for phrase in RESULTS_LANGUAGE)
    if has_results:
        return None, (f"EC_PROTO: CT.gov status is {ct_status} but abstract contains "
                      f"results language -- UNCERTAIN (manual review required)")
    return True, (f"EC_PROTO: CT.gov status is {ct_status} -- "
                  f"likely protocol/registration paper -- EXCLUDE")
```

**D. NCT deduplication enrichment:**

For same-NCT / different-title pairs (flagged UNCERTAIN in Step 2), compare each
RIS title against `ct_official_title` using normalized Levenshtein distance.
If one RIS title matches CT.gov official title (distance <= 0.2), that record is
the primary publication; the other is a secondary/sub-study publication.

```python
def levenshtein_ratio(s1, s2):
    """Normalized Levenshtein distance (0=identical, 1=completely different)."""
    s1, s2 = normalize_title(s1), normalize_title(s2)
    if not s1 or not s2: return 1.0
    m, n = len(s1), len(s2)
    dp = list(range(n+1))
    for i in range(1, m+1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n+1):
            dp[j] = min(prev[j]+1, dp[j-1]+1,
                        prev[j-1] + (0 if s1[i-1]==s2[j-1] else 1))
    return dp[n] / max(m, n)
```

#### Report enrichment stats (append to Step 2 parse summary)

```
CT.gov enrichment:
  NCTs found in RIS: [N]
  Successfully enriched: [N]
  Failed / not found: [N] -- [list of NCTs]
  Records with abstract supplemented from CT.gov: [N]
  Protocol papers detected (NOT_YET_RECRUITING / WITHDRAWN): [N]
  Design confirmed as RCT from CT.gov: [N]
  Design confirmed as non-RCT from CT.gov: [N]
```

---
### STEP 2.5 — Match PDFs to RIS Records (FT Stage Only)

```python
import pdfplumber, os

def extract_pdf_text(pdf_path):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "
".join(pages)
    except Exception as e:
        return f"[PDF_EXTRACTION_ERROR: {e}]"

def match_pdf_to_record(pdf_text, records):
    pmid_match = re.search(r"PMID[:\s]+(\d{7,8})", pdf_text, re.IGNORECASE)
    if pmid_match:
        pmid = pmid_match.group(1)
        for i, r in enumerate(records):
            if str(r.get("PM", r.get("pubmed_id", ""))).strip() == pmid:
                return i, "PMID"
    doi_match = re.search(r"10\.\d{4,}/\S+", pdf_text)
    if doi_match:
        doi = re.sub(r"[.,;)\]]+$", "", doi_match.group(0)).lower()
        for i, r in enumerate(records):
            rec_doi = re.sub(r"[.,;)\]]+$", "",
                             str(r.get("DO", r.get("doi", ""))).strip().lower())
            if rec_doi and rec_doi == doi:
                return i, "DOI"
    pdf_title_key = normalize_title(pdf_text[:500])
    for i, r in enumerate(records):
        rec_title_key = normalize_title(r.get("TI", r.get("T1",
                        r.get("title", r.get("primary_title", "")))))
        if rec_title_key and rec_title_key in pdf_title_key:
            return i, "title"
    return None, None
```

Build `pdf_lookup = {record_index: {"path": ..., "text": ..., "match_method": ...}}`.
Records without a matched PDF -> abstract-only; confidence ceiling <= 45.

---

### STEP 3 — ASReview Screening Engine

ASReview is used as the active-learning relevance ranker. The workflow:

1. Build the ASReview dataset from parsed + CT.gov-enriched RIS records
2. Generate PICO-derived prior labels to seed the model
3. Run ASReview simulation / batch screening to score all records
4. Map ASReview relevance scores -> Confidence using the scale below
5. Apply PICO hard-override rules and CT.gov override rules on top of ASReview decisions
6. Produce final Decision (INCLUDE / EXCLUDE / UNCERTAIN) per record

#### Step 3.1 — Build ASReview Dataset

```python
import pandas as pd
from asreview import ASReviewData

rows = []
for i, r in enumerate(records):
    title    = r.get("TI", r.get("T1", r.get("title", r.get("primary_title", ""))))
    abstract = r.get("AB", r.get("N2", r.get("abstract", "")))
    # For FT stage: replace abstract with full PDF text if matched
    if stage == "FT" and i in pdf_lookup:
        abstract = pdf_lookup[i]["text"]
    # Supplement sparse abstracts with CT.gov data (Step 2.7B)
    abstract, was_supplemented = supplement_abstract_from_ctgov(r)
    rows.append({
        "record_id": r.get("Record_ID", f"RIS-{i+1}"),
        "title":     str(title),
        "abstract":  str(abstract),
        "doi":       str(r.get("DO", r.get("doi", ""))),
        "url":       build_url(r),
    })

df_asreview = pd.DataFrame(rows)
as_data = ASReviewData(df_asreview)
```

#### Step 3.2 — Generate PICO Prior Labels

```python
def pico_prior_label(record, pico_criteria):
    title    = str(record.get("title", ""))
    abstract = str(record.get("abstract", ""))
    text     = f"{title} {abstract}".lower()
    for out_term in pico_criteria["intervention_out"]:
        if out_term.lower() in text:
            return 0
    pop_hit = any(s.lower() in text for s in pico_criteria["population_signals"] if s)
    int_hit = any(s.lower() in text for s in pico_criteria["intervention_in"] if s)
    out_hit, _ = outcome_in_abstract(abstract, alias_map)
    if pop_hit and int_hit and out_hit:
        return 1
    return None

prior_indices, prior_labels = [], []
for i, row in df_asreview.iterrows():
    label = pico_prior_label(row, pico_criteria)
    if label is not None:
        prior_indices.append(i)
        prior_labels.append(label)
```

#### Step 3.3 — Run ASReview Batch Scoring

```python
from asreview.models.classifiers import NaiveBayesClassifier
from asreview.models.feature_extraction import Tfidf
from asreview.models.balancers import DoubleBalance
from asreview.models.queriers import MaxQuerier

try:
    from asreview.simulation import Simulate
    simulate = Simulate(
        as_data,
        classifier=NaiveBayesClassifier(),
        feature_model=Tfidf(),
        balancer=DoubleBalance(),
        querier=MaxQuerier(),
    )
    simulate.label(prior_indices, prior_labels)
    simulate.review()
    relevance_scores = simulate.get_scores()
except Exception as e:
    print(f"ASReview simulation API error: {e} -- using fallback TF-IDF + NB scorer")
    relevance_scores = _asreview_fallback_score(df_asreview, prior_indices, prior_labels)
```

**Fallback scorer (TF-IDF + Multinomial NB -- mirrors ASReview default):**
```python
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

def _asreview_fallback_score(df, prior_idx, prior_lbl):
    corpus = (df["title"].fillna("") + " " + df["abstract"].fillna("")).tolist()
    vec = TfidfVectorizer(max_features=10000, sublinear_tf=True)
    X = vec.fit_transform(corpus)
    clf = MultinomialNB()
    clf.fit(X[prior_idx], np.array(prior_lbl))
    proba = clf.predict_proba(X)
    relevant_col = list(clf.classes_).index(1)
    return proba[:, relevant_col]
```

#### Step 3.4 — Map Scores -> Confidence & Decision (with CT.gov overrides)

```python
def score_to_confidence_and_decision(score, record, pico_criteria,
                                      alias_map, required_design):
    confidence = int(round(score * 100))
    if score >= 0.70:   decision = "INCLUDE"
    elif score <= 0.30: decision = "EXCLUDE"
    else:               decision = "UNCERTAIN"

    # --- CT.gov Hard-Override Rules (checked before PICO overrides) ---

    # Protocol paper detection (Step 2.7C)
    is_proto, proto_reason = detect_protocol_paper(record)
    if is_proto is True:
        return "EXCLUDE", 88, proto_reason
    if is_proto is None:
        confidence = min(confidence, 55)
        return "UNCERTAIN", confidence, proto_reason

    # Design confirmed non-RCT by CT.gov
    design_result, design_note = infer_study_design_with_ctgov(
        record, str(record.get("TI","")), str(record.get("AB","")),
        record.get("NCT",""), required_design)
    if design_result is False:
        return "EXCLUDE", max(confidence, 85), design_note

    # --- PICO Hard-Override Rules ---
    title    = str(record.get("TI", record.get("title", "")))
    abstract = str(record.get("AB", record.get("abstract", "")))
    nct      = record.get("NCT", "")
    text     = f"{title} {abstract}".lower()

    for out_term in pico_criteria["intervention_out"]:
        if out_term.lower() in text:
            return "EXCLUDE", max(confidence, 80), (
                f"EC_INT: '{out_term}' is explicitly outside protocol boundary -- EXCLUDE")

    if record.get("_nct_duplicate_of"):
        return "EXCLUDE", 92, (
            f"Duplicate -- same NCT {nct} and same title as Record_ID "            f"{record['_nct_duplicate_of']} -- EXCLUDE")

    if record.get("_title_duplicate_of"):
        return "EXCLUDE", 87, (
            f"Duplicate -- same title and first author as Record_ID "            f"{record['_title_duplicate_of']} -- EXCLUDE")

    if record.get("_nct_related"):
        confidence = min(confidence, 55)
        return "UNCERTAIN", confidence, (
            f"Same NCT {nct} as Record_ID {record['_nct_related']} but different title "            f"-- may be distinct publication -- UNCERTAIN")

    # Apply confidence ceiling rules
    confidence = _apply_ceiling_rules(confidence, record, pico_criteria,
                                       alias_map, required_design)
    if confidence < 50:   decision = "UNCERTAIN"
    elif confidence < 70 and decision == "INCLUDE": decision = "UNCERTAIN"

    return decision, confidence, None

def _apply_ceiling_rules(confidence, record, pico_criteria, alias_map, required_design):
    abstract = str(record.get("AB", record.get("abstract", "")))
    nct      = record.get("NCT", "")
    pub_type = record.get("_pub_type", "unknown")
    abstract_words = len(abstract.split())

    if abstract_words == 0:
        return min(confidence, 40)

    if abstract_words < 100:
        if record.get("_ct_supplemented"):
            # CT.gov supplemented -- lifted ceiling
            return min(confidence, 75)
        signals = detect_key_signals(
            str(record.get("TI","")), abstract, nct,
            pico_criteria["intervention_signals"],
            pico_criteria["population_signals"],
            alias_map, required_design)
        n_sig = sum(signals.values())
        return min(confidence, 70 if n_sig == 3 else 60)

    if pub_type == "conference_abstract":
        signals = conference_abstract_signals(record, alias_map, required_design)
        n_sig = sum(signals.values())
        if n_sig == 3:   return min(confidence, 72)
        elif n_sig == 2: return min(confidence, 55)
        else:            return min(confidence, 40)

    if record.get("_ft_abstract_only"):
        return min(confidence, 45)

    if record.get("_partial_intervention_match"):
        return min(confidence, 49)

    outcome_found, _ = outcome_in_abstract(abstract, alias_map)
    if not outcome_found and stage == "TA":
        return min(confidence, 65)

    return confidence
```

#### Step 3.5 — Build Reason Field

```python
def build_reason(record, decision, confidence, score, override_reason,
                 pico_criteria, alias_map, required_design):
    if override_reason:
        return override_reason

    title    = str(record.get("TI", record.get("title", "")))
    abstract = str(record.get("AB", record.get("abstract", "")))
    nct      = record.get("NCT", "")

    design_result, design_note = infer_study_design_with_ctgov(
        record, title, abstract, nct, required_design)
    outcome_found, matched_outcome = outcome_in_abstract(abstract, alias_map)
    int_in  = any(t.lower() in f"{title} {abstract}".lower()
                  for t in pico_criteria["intervention_in"] if t)
    int_out = any(t.lower() in f"{title} {abstract}".lower()
                  for t in pico_criteria["intervention_out"] if t)

    parts = [f"ASReview relevance score: {score:.3f}"]
    if record.get("_ct_supplemented"):
        enroll = record.get("ct_enrollment", "?")
        arms   = "; ".join(record.get("ct_arms", []))[:80]
        parts.append(f"Abstract supplemented from CT.gov (enrollment N={enroll}, arms: {arms})")
    parts.append(design_note)
    if int_in:   parts.append("IC2: Intervention IN boundary -- satisfied")
    elif int_out: parts.append("EC_INT: Intervention OUT boundary -- EXCLUDE")
    else:         parts.append("IC2: Intervention not specified -- UNCERTAIN")
    if outcome_found:
        parts.append(f"IC_OUT: Outcome '{matched_outcome}' found -- satisfied")
    else:
        parts.append("IC_OUT: Primary outcome not mentioned -- UNCERTAIN at T&A stage")
    return " | ".join(parts)
```

#### Step 3.6 — Internal Consistency Check

For every 20th record, re-score independently using the fallback TF-IDF + NB scorer.
If re-score decision differs from primary ASReview decision: override to UNCERTAIN,
note "Auto-disagreement: ASReview and re-score decisions differ -- UNCERTAIN".
Report auto-disagreement rate in summary. Rate >10% -> FLAG protocol ambiguity.

---
### STEP 4 — Build the Output Table

Produce a CSV with EXACTLY these 16 columns:

```
#, Record_ID, NCT, Record_Type, Authors, Year, Title, Journal,
Decision, Primary_Criterion, Reason, Confidence, ASReview_Score,
CT_Enriched, CT_Status, Source_URL
```

Column definitions:
- `#` -> Sequential row number
- `Record_ID` -> PMID / EMID / DOI; else `RIS-[N]`
- `NCT` -> NCT number if found; else empty
- `Record_Type` -> "Journal Article", "Conference Abstract", or "Unknown"
- `Authors` -> First author surname + "et al." (or all if <= 2)
- `Year` -> Publication year
- `Title` -> Full title
- `Journal` -> Journal/source name
- `Decision` -> INCLUDE / EXCLUDE / UNCERTAIN
- `Primary_Criterion` -> Most decisive criterion code (IC1, EC2, EC_INT, EC_PROTO, etc.)
- `Reason` -> Standardized format including ASReview score and CT.gov notes
- `Confidence` -> Integer 0-100 (after all ceiling and override rules)
- `ASReview_Score` -> Raw relevance score from ASReview (0.000-1.000)
- `CT_Enriched` -> TRUE/FALSE: whether CT.gov data was fetched for this record
- `CT_Status` -> CT.gov trial status (RECRUITING, COMPLETED, etc.) or empty
- `Source_URL` -> PubMed URL (PMID) -> DOI URL -> URL field -> empty

**Reason Field Format:**
```
"ASReview relevance score: [X.XXX] | [CT.gov note if applicable] | [Criterion code]: [rationale]"
```

Examples:
- `"ASReview relevance score: 0.923 | IC1: RCT confirmed from CT.gov (INTERVENTIONAL/RANDOMIZED) -- satisfied | IC2: IVUS-guided PCI stated -- IN boundary -- satisfied | IC_OUT: MACE found -- satisfied"`
- `"ASReview relevance score: 0.041 | IC1: No RCT signals found -- UNCERTAIN | IC2: Intervention not specified -- UNCERTAIN"`
- `"EC_PROTO: CT.gov status is NOT_YET_RECRUITING -- likely protocol/registration paper -- EXCLUDE"`
- `"EC1: CT.gov confirms non-randomized design -- EXCLUDE"`
- `"ASReview relevance score: 0.712 | Abstract supplemented from CT.gov (enrollment N=450, arms: Drug A: EXPERIMENTAL; Placebo: PLACEBO_COMPARATOR) | IC1: RCT confirmed from CT.gov -- satisfied"`
- `"EC_INT: 'FFR-guided PCI' is explicitly outside protocol boundary (OUT list) -- EXCLUDE"`
- `"Duplicate -- same NCT NCT01234567 and same title as Record_ID 38291456 -- EXCLUDE"`
- `"Auto-disagreement: ASReview and re-score decisions differ -- UNCERTAIN"`

---

### STEP 5 — Output Screening Summary

```
SCREENING SUMMARY (ASReview v[X.X.X]):
  Total records screened: [N]
  INCLUDE: [N] ([%])
  EXCLUDE: [N] ([%])
  UNCERTAIN: [N] ([%])

  ASReview prior labels used: [N] relevant, [N] irrelevant
  ASReview model: TF-IDF + Naive Bayes (default)
  Fallback scorer used: [Yes/No]

  Records requiring human review (UNCERTAIN + Confidence <70): [N]
  [List: Record_ID | Title | Decision | Confidence | ASReview_Score | Source_URL]

  Priority human review -- Confidence <50: [N]
  [List: Record_ID | Title | Primary_Criterion | ASReview_Score]

  PICO hard-overrides applied:
    OUT-boundary intervention -> EXCLUDE: [N]
    True NCT duplicates -> EXCLUDE: [N]
    Title/author duplicates -> EXCLUDE: [N]
    Same NCT, different title -> UNCERTAIN: [N]

  CT.gov enrichment applied:
    Records enriched from CT.gov: [N]
    Design confirmed RCT: [N] | Non-RCT: [N]
    Abstract supplemented (sparse/missing): [N]
    Protocol papers excluded (EC_PROTO): [N]
    NCT deduplication refined: [N]

  Auto-disagreement rate: [N]/[total checked] = [%]
  [If >10%: FLAG -- protocol ambiguity detected]

  Study design:
    Required design: [rct / cohort / case_control / cross_sectional / any]
    RCT default applied: [Yes/No]
    Design confirmed from CT.gov: [N] records
    Design inferred from text: [N] records
    Design UNCERTAIN (no signals found): [N] records

  Deduplication:
    True duplicates removed (same NCT + same title): [N]
    Related publications flagged UNCERTAIN (same NCT, different title): [N]
    Title/author-based duplicates removed: [N]

  [FT stage only] PDF matching:
    PDFs uploaded: [N] | PDFs matched: [N] | Unmatched: [N]
    RIS records assessed from full text: [N]
    RIS records assessed abstract-only (no PDF): [N]

  Outcome alias matches (abbreviation resolved): [N] records
  Sparse abstract ceiling applied: [N] records
    - CT.gov supplemented (ceiling lifted to <=75): [N]
    - No CT.gov data (ceiling <=40/<=60): [N]
  Conference abstracts screened: [N]
  Most common exclusion criterion: [ECX] ([N] records)
  Records with no abstract: [N]
  Non-English records: [N]

  Publication type breakdown:
    Journal articles: [N] | Conference abstracts: [N] | Unknown: [N]

PRISMA FLOW NUMBERS:
  Records identified from [DATABASE]: [N]
  Duplicates removed: [N]
  Records screened (T&A): [N]
  Records excluded (T&A): [N]
    - [EC1]: [N]
    - [EC_PROTO]: [N]
    ...
  Records assessed for eligibility (FT): [N]*
  Records excluded (FT): [N]*
  Studies included: [N]*
  (* N/A at T&A stage)
```

---

### STEP 6 — Save CSV Files

```python
import pandas as pd
from datetime import date

stage    = "TA"      # or "FT"
database = "PubMed"  # from user input
today    = date.today().strftime("%Y-%m-%d")

# File 1 -- Full results (16 columns)
df.to_csv(f"/mnt/results/screening_{stage}_{database}_{today}.csv", index=False)

# File 2 -- Human review (UNCERTAIN + Confidence <70)
df_review = df[(df["Decision"] == "UNCERTAIN") | (df["Confidence"] < 70)]
df_review.to_csv(
    f"/mnt/results/screening_{stage}_{database}_{today}_UNCERTAIN_for_human_review.csv",
    index=False
)

# Clean up checkpoint files
import glob, os
for f in glob.glob(f"/mnt/results/screening_{stage}_{database}_checkpoint_*.csv"):
    os.remove(f)
```

Both files must include ALL 16 columns including `NCT`, `ASReview_Score`,
`CT_Enriched`, `CT_Status`, and `Source_URL`.

---
### STEP 7 — Dual-Channel Forward Citation Search

Runs two parallel forward-search channels and merges results before screening.
**Channel 2 requires no extra API calls** -- CT.gov references were already fetched
in Step 2.7 and stored in `ct_references` for each enriched record.

#### Step 7.0 — Confirm Seeds

If 0 seeds found from protocol AND 0 NCTs enriched: warn and ask user to paste
PMIDs/DOIs or type "skip".

If 0 protocol seeds but NCTs exist: proceed with Channel 2 only; note Channel 1 skipped.

#### Channel 1 — Semantic Scholar (unchanged from v3.0)

Seeds: PMIDs and DOIs extracted from protocol file in Step 1.

```python
import requests, time

def get_citing_papers(identifier, id_type="pmid"):
    base   = "https://api.semanticscholar.org/graph/v1/paper"
    fields = "paperId,title,abstract,year,authors,externalIds,publicationTypes,journal"
    lookup_url = (f"{base}/PMID:{identifier}" if id_type == "pmid"
                  else f"{base}/DOI:{re.sub(r'[.,;)]+$', '', identifier)}")
    try:
        r = requests.get(lookup_url, params={"fields": fields}, timeout=15)
        if r.status_code != 200: return [], None
        paper_data = r.json()
        paper_id   = paper_data.get("paperId")
        seed_title = paper_data.get("title", identifier)
        if not paper_id: return [], None
    except Exception: return [], None

    results, offset, limit = [], 0, 100
    while True:
        try:
            r2 = requests.get(f"{base}/{paper_id}/citations",
                              params={"fields": fields, "limit": limit, "offset": offset},
                              timeout=15)
            if r2.status_code != 200: break
            batch = r2.json().get("data", [])
            results.extend([i["citingPaper"] for i in batch if "citingPaper" in i])
            if len(batch) < limit: break
            offset += limit
            time.sleep(0.5)
        except Exception: break
    return results, seed_title
```

Deduplicate against original RIS file by PMID, DOI, and normalized title.
Screen new candidates using the ASReview + PICO pipeline.
Reason prefix: `"[Semantic Scholar forward search] Cites seed PMID:[seed_pmid] ([seed_title]): [standard reason]"`

#### Channel 2 — ClinicalTrials.gov referencesModule (NEW in v3.1)

Seeds: all NCTs in the RIS file that were successfully enriched in Step 2.7.
References already in memory -- no additional API calls needed.

```python
def collect_ctgov_forward_candidates(records, original_ris_pmids, original_ris_dois,
                                      original_ris_titles):
    """
    Collect publications from CT.gov referencesModule for all enriched NCTs.
    Returns list of candidate dicts with pmid, citation, source_nct, source_title.
    """
    seen_pmids  = set(original_ris_pmids)
    seen_dois   = set(original_ris_dois)
    seen_titles = set(original_ris_titles)
    candidates  = []

    for record in records:
        if not record.get("ct_enriched"): continue
        nct        = record.get("NCT", "")
        ct_title   = record.get("ct_official_title", "")
        ct_refs    = record.get("ct_references", [])

        for ref in ct_refs:
            pmid     = str(ref.get("pmid", "")).strip()
            citation = ref.get("citation", "")
            # Skip if already in original RIS
            if pmid and pmid in seen_pmids: continue
            norm_cit = normalize_title(citation)
            if norm_cit and norm_cit in seen_titles: continue
            if pmid: seen_pmids.add(pmid)
            if norm_cit: seen_titles.add(norm_cit)
            candidates.append({
                "pmid":         pmid,
                "citation":     citation,
                "source_nct":   nct,
                "source_title":  ct_title,
                "channel":      "CT.gov referencesModule",
            })

    return candidates
```

For each CT.gov candidate: look up full metadata via Semantic Scholar (PMID lookup)
to get title + abstract for ASReview scoring. If Semantic Scholar lookup fails,
use citation string as title with empty abstract (confidence ceiling <= 45).

Reason prefix: `"[CT.gov forward search] Associated with trial {NCT} ({ct_official_title}): [standard reason]"`

#### Merge and Screen

Combine Channel 1 and Channel 2 candidates, deduplicate across channels by PMID/DOI/title.
Screen all new candidates using the same ASReview + PICO pipeline (Steps 3.1-3.5).

Save to `/mnt/results/forward_search_{stage}_{database}_{today}.csv` with a
`Channel` column indicating "Semantic Scholar" or "CT.gov referencesModule".

#### Dual-Channel Forward Search Summary (in chat)

```
FORWARD CITATION SEARCH SUMMARY (dual-channel):

  Channel 1 -- Semantic Scholar:
    Seeds from protocol: [N]
    Seeds resolved on Semantic Scholar: [N]
    Seeds not found: [N] -- [list]
    Total citing papers retrieved: [N]
    Already in original RIS file (skipped): [N]
    New candidates: [N]

  Channel 2 -- ClinicalTrials.gov referencesModule:
    NCTs with reference lists: [N]
    Total associated publications: [N]
    Already in original RIS file (skipped): [N]
    New candidates: [N]

  Combined (deduplicated across channels):
    INCLUDE: [N]
    [List: Record_ID | Title | Channel | Source | Confidence | ASReview_Score | Source_URL]
    UNCERTAIN: [N]
    EXCLUDE: [N]

  ACTION REQUIRED:
  [N] new INCLUDE candidates found by forward search not in original RIS file.
  [If 0: "Forward search found no new eligible studies."]
```

---
## Helper Functions (shared across steps)

```python
RCT_SIGNALS = [
    r'\ballocated\b', r'\brandomly\s+assigned\b', r'\brandomly\s+allocated\b',
    r'\bparallel[\s-]group\b', r'\bcrossover\b', r'\bcross[\s-]over\b',
    r'\bblinded\b', r'\bdouble[\s-]blind\b', r'\bsingle[\s-]blind\b',
    r'\bplacebo[\s-]controlled\b', r'\bintention[\s-]to[\s-]treat\b',
    r'\bITT\s+analysis\b', r'\bper[\s-]protocol\b',
    r'\b1\s*:\s*1\s+ratio\b', r'\b2\s*:\s*1\s+ratio\b',
    r'\bstratified\s+randomiz\w+\b', r'\bblock\s+randomiz\w+\b',
    r'\brandomized\b', r'\brandomised\b', r'\bRCT\b'
]
COHORT_SIGNALS = [r'\bprospective\b', r'\bretrospective\b', r'\bcohort\b',
                  r'\bfollowed\s+for\b', r'\blongitudinal\b', r'\bfollow[\s-]up\b']
CASE_CONTROL_SIGNALS = [r'\bcases\b', r'\bcontrols\b', r'\bodds\s+ratio\b',
                         r'\bmatched\b', r'\bcase[\s-]control\b']
CROSS_SECTIONAL_SIGNALS = [r'\bcross[\s-]sectional\b', r'\bprevalence\b', r'\bsurvey\b']
DESIGN_SIGNAL_MAP = {
    'rct': RCT_SIGNALS, 'cohort': COHORT_SIGNALS,
    'case_control': CASE_CONTROL_SIGNALS, 'cross_sectional': CROSS_SECTIONAL_SIGNALS,
    'any': []
}

def build_outcome_alias_map(protocol_text, pico_outcomes):
    alias_map = {}
    defn_pattern = re.compile(
        r'([A-Z][A-Za-z\s\-]+?)\s*\((?:defined as|comprising|including|i\.e\.)?'
        r'\s*([^)]{5,})\)', re.IGNORECASE)
    for match in defn_pattern.finditer(protocol_text):
        term = match.group(1).strip()
        components = [c.strip() for c in re.split(r'[,/]|\bor\b|\band\b',
                      match.group(2).strip()) if c.strip()]
        alias_map[term.lower()] = [c.lower() for c in components] + [term.lower()]
    for outcome in pico_outcomes:
        key = outcome.lower().strip()
        if key not in alias_map: alias_map[key] = [key]
    return alias_map

def outcome_in_abstract(abstract, alias_map):
    abstract_lower = abstract.lower()
    for canonical, aliases in alias_map.items():
        for alias in aliases:
            if alias and alias in abstract_lower: return True, canonical
    return False, ''

def detect_key_signals(title, abstract, nct, intervention_signals,
                        population_signals, alias_map, required_design):
    text = f"{title} {abstract}".lower()
    return {
        'design':       infer_study_design_with_ctgov(
                            {}, title, abstract, nct, required_design)[0] is True,
        'intervention': any(s.lower() in text for s in intervention_signals if s),
        'population':   any(s.lower() in text for s in population_signals if s),
    }

def conference_abstract_signals(record, alias_map, required_design):
    title    = str(record.get('TI', record.get('T1', record.get('title', ''))))
    abstract = str(record.get('AB', record.get('N2', record.get('abstract', ''))))
    nct      = record.get('NCT', '')
    n_ok     = bool(re.search(
        r'(?:n\s*=\s*\d+|\d+\s*patients|\d+\s*participants|\d+\s*subjects)',
        abstract, re.IGNORECASE))
    outcome_ok, _ = outcome_in_abstract(abstract, alias_map)
    return {
        'design':  infer_study_design_with_ctgov(
                       record, title, abstract, nct, required_design)[0] is True,
        'n':       n_ok,
        'outcome': outcome_ok,
    }
```

---

## Scientific Caveats & Edge Cases

| Situation | T&A Handling | FT Handling |
|-----------|-------------|-------------|
| Abstract missing, CT.gov enriched | Supplement from CT.gov; ceiling <=75 | Assess from full text |
| Abstract missing, no CT.gov | UNCERTAIN; ceiling <=40 | UNCERTAIN if FT not retrieved |
| Abstract < 100 words, CT.gov enriched | Supplement; ceiling <=75 | Assess from full text |
| Abstract < 100 words, no CT.gov, all 3 signals | Ceiling <=70 | Assess from full text |
| Abstract < 100 words, no CT.gov, missing signals | Ceiling <=60 | Assess from full text |
| CT.gov confirms RCT (INTERVENTIONAL/RANDOMIZED) | IC1: satisfied; no text inference needed | IC1: satisfied |
| CT.gov confirms non-RCT (OBSERVATIONAL/NON_RANDOMIZED) | EXCLUDE if RCT required; confidence >=85 | EXCLUDE |
| CT.gov status NOT_YET_RECRUITING / WITHDRAWN | EC_PROTO: EXCLUDE (confidence 88) | EXCLUDE |
| CT.gov status NOT_YET_RECRUITING + results language | UNCERTAIN; ceiling <=55 | Manual review |
| CT.gov enrichment failed (API error) | Fall back to text-based inference | Same |
| Non-English, no English abstract | UNCERTAIN; note language | UNCERTAIN if FT not retrieved |
| Language restriction in protocol | EXCLUDE -- "Language restriction" | EXCLUDE |
| Conference abstract, all 3 signals | Ceiling <=72 | Assess from full text if PDF uploaded |
| Conference abstract, 2 signals | UNCERTAIN; ceiling <=55 | UNCERTAIN if FT not retrieved |
| Conference abstract, 0-1 signals | UNCERTAIN; ceiling <=40 | UNCERTAIN if FT not retrieved |
| True NCT duplicate (same title) | EXCLUDE; confidence >=90 | EXCLUDE |
| Same NCT, different title | UNCERTAIN; confidence 55 | Assess: retain most complete |
| Title/author duplicate | EXCLUDE; confidence >=85 | EXCLUDE |
| Ambiguous study design | UNCERTAIN | Assess from methods |
| Wrong study type confirmed (CT.gov) | EXCLUDE with EC code; confidence >=85 | EXCLUDE |
| Design = 'any' | SATISFIED -- no design check | SATISFIED |
| Outcome absent from abstract | UNCERTAIN; ceiling <=65 -- NEVER EXCLUDE at T&A | EXCLUDE only if genuinely absent from full text |
| Intervention clearly IN boundary | SATISFIED | SATISFIED |
| Intervention clearly OUT boundary | EXCLUDE; confidence 80-90 | EXCLUDE |
| Intervention genuinely unspecified | UNCERTAIN; ceiling <=49 | UNCERTAIN |
| Protocol/registry paper | EXCLUDE -- "Protocol paper" | EXCLUDE |
| Narrative review / systematic review | EXCLUDE -- "Secondary research" | EXCLUDE |
| ASReview prior labels = 0 relevant | WARN; proceed with random seed | WARN |
| ASReview simulation API unavailable | Use fallback TF-IDF + NB scorer | Same |
| Auto-disagreement rate >10% | FLAG -- protocol ambiguity | FLAG |
| CT.gov referencesModule empty | Channel 2 skipped for that NCT; note in summary | Same |

---

## Universal Rules (Both Stages)

- Always cite specific criterion code (IC1, EC3, EC_INT, EC_PROTO, etc.) in Reason
- Always include ASReview relevance score in Reason field
- When in doubt between EXCLUDE and UNCERTAIN -> ALWAYS choose UNCERTAIN
- Never fabricate or infer abstract content not present in the RIS record or CT.gov data
- Apply PICO BOUNDARY DEFINITIONS from Step 1 consistently to every record
- CT.gov hard-override rules take precedence over ASReview score thresholds
- PICO hard-override rules take precedence over ASReview score thresholds
- ASReview score thresholds (>=0.70 INCLUDE, <=0.30 EXCLUDE) are defaults;
  confidence ceiling rules and override rules always apply on top
- CT.gov enrichment is additive -- it never removes information from the original RIS record
- CT.gov API failures are non-fatal -- fall back to text-based inference gracefully
