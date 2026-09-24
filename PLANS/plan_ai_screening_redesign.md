# VDExtract: AI-Driven Multi-Stage Screening with Keyword Highlighting, Preview Pane, and Clarification Questions

## Summary

Redesign VDExtract's screening page to match the UX patterns of Elicit and Rayyan: a single "Start AI Screening" button kicks off a fully automated, multi-stage pipeline (title → abstract → full-text) that screens every study, displays a confidence score for each decision, highlights PICO and inclusion/exclusion keywords directly in the abstract text (Rayyan-style), and shows a preview pane with the full study record beside the screening list. When the AI encounters a conflicting or ambiguous classification, it pauses that study and generates a targeted multiple-choice clarification question for the human reviewer (hybrid flow — pipeline continues screening other studies while the question waits). The broken Include/Exclude buttons are fixed by routing all decisions through the existing `screening-decision` endpoint with proper status updates.

**Related plans:**
- `plan_screening_extraction_gaps.md` — signal pre-filter, safety net, AI-reviewer integration, confidence taxonomy
- `plan_interactive_clarification.md` — clarification question schema, generator, resolver, API endpoints

**Repo:** `/workspace/VDExtract` (backend: `radextract_platform/backend/`, frontend: `radextract_platform/frontend/`)
**Python venv:** `/workspace/.venv/bin/python`
**Test command:** `cd /workspace/VDExtract/radextract_platform/backend && /workspace/.venv/bin/python -m pytest tests/ -q --tb=short`
**Graphify map:** `/mnt/user-uploads/graphify_codebase_map.md` — ALWAYS USE GRAPHIFY TO NAVIGATE THE CODE
**Git push:** `git push https://vidhidhaduk05:<PAT>@github.com/vidhidhaduk05/VDExtract.git main` (PAT at `/mnt/user-uploads/fine-grained token all repo.txt`, read with `tr -d '[:space:]'`)

---

## Reference: How Elicit and Rayyan Work

### Elicit (researched from support.elicit.com and elicit.com/blog)
- **Step-by-step guided workflow:** Gather → Abstract Screening → Full-Text Screening → Extraction → Report. Each stage is a visible step in a timeline [9][10].
- **AI generates screening recommendations** with explanations and supporting quotes. Human can agree, edit, or override [11].
- **Strict criteria toggle:** mark a criterion as "strict" → any paper failing it is auto-excluded (with manual override) [16].
- **Per-criterion scores:** each screening criterion is scored independently, not just a single include/exclude [11].
- **PRISMA-auditable:** every decision has exclusion reasons and supporting quotes [11][12].
- **Dual review:** pairs two humans with AI assistance, or uses AI as the second reviewer [11].
- **94% screening accuracy** in internal evaluations [13][15].

### Rayyan (researched from help.rayyan.ai)
- **Keyword highlighting:** "Keywords for Include" highlighted in green, "Keywords for Exclude" highlighted in red, directly in the abstract text. Pre-populated with RCT/CCT-associated terms [1][2][6].
- **PICO highlighting:** AI extracts PICO terms and highlights them in abstracts — Population=purple, Intervention/Comparator=blue, Outcome=orange. Hover shows which PICO element [5].
- **Preview pane:** full record details (title, authors, abstract, publication info) shown beside the reference list. Click a reference → see full details [8].
- **Decision buttons:** Include / Exclude / Maybe with keyboard shortcuts [8].
- **Auto-scroll:** automatically advances to next reference after a decision [1][3].
- **AI relevance ranking:** predicts likelihood of inclusion for each undecided reference [1].
- **Filters panel:** keyword filters, labels, exclusion reasons, decision filters, years, publication types [1][2].

---

## Architecture: Multi-Stage AI Screening Pipeline

```
User clicks "Start AI Screening"
  │
  ├── Stage 1: TITLE SCREENING
  │     For each study with screening_status = "pending":
  │       → AI evaluates title only against PICO + inclusion/exclusion criteria
  │       → Returns: decision (include/exclude/uncertain), confidence (0-1), reason
  │       → If confident include → screening_status = "ta_included", stage = "ta"
  │       → If confident exclude → screening_status = "excluded", stage = "ta", reason recorded
  │       → If uncertain → advance to Stage 2 (abstract screening)
  │       → Store AI decision + confidence in screening_decisions (reviewer_id = "ai_screener")
  │
  ├── Stage 2: ABSTRACT SCREENING (only for studies not decided in Stage 1)
  │     For each uncertain study:
  │       → AI evaluates title + abstract against PICO + criteria
  │       → Returns: decision, confidence, reason, pico_matches, highlighted_keywords
  │       → If confident include → screening_status = "ta_included", stage = "ta"
  │       → If confident exclude → screening_status = "excluded", stage = "ta", reason recorded
  │       → If uncertain → check if clarification question would help
  │         → If yes: generate clarification question, status = "awaiting_clarification"
  │         → If no: screening_status = "uncertain", stage = "ta" (human review)
  │       → Store AI decision + confidence in screening_decisions
  │
  ├── Stage 3: FULL-TEXT SCREENING (only for ta_included studies)
  │     Check: does study have a PDF uploaded?
  │       → If no PDF: screening_status = "awaiting_pdf", stage = "ft"
  │         → Show "Upload PDF" button in UI for this study
  │         → User uploads PDF → triggers Stage 3 automatically
  │       → If PDF exists: AI evaluates full text against PICO + criteria
  │         → Returns: decision, confidence, reason, evidence_quotes
  │         → If confident include → screening_status = "included", stage = "ft"
  │         → If confident exclude → screening_status = "excluded", stage = "ft", reason recorded
  │         → If uncertain → generate clarification question if applicable
  │         → Store AI decision + confidence in screening_decisions
  │
  └── Pipeline Complete:
        → Return summary: {total, title_screened, abstract_screened, fulltext_screened,
           included, excluded, uncertain, awaiting_clarification, awaiting_pdf}
        → Frontend refreshes screening list with all decisions + confidence scores
        → Clarification questions appear in a notification panel for human review

Human reviewer (parallel, via UI):
  → Sees screening results with confidence badges (High/Medium/Low)
  → Sees keyword-highlighted abstracts in preview pane
  → Sees notification badge: "N studies need clarification"
  → Answers clarification questions → AI re-evaluates → final decision recorded
  → Can override any AI decision via Include/Exclude/Maybe buttons (now working)
```

**Key principles:**
1. **AI does the complete screening** — the human reviews and overrides, not the other way around
2. **Confidence is always shown** — every AI decision has a confidence score displayed as a colored badge
3. **One pass through all stages** — the pipeline runs title → abstract → full-text in sequence, automatically advancing studies that pass each stage
4. **Clarification only on conflict/uncertainty** — the AI asks the human only when it genuinely cannot decide
5. **PDF upload is a gate** — full-text screening requires a PDF; studies without one pause at "awaiting_pdf" until the user uploads

---

## Part 1 — Database Schema Changes

### 1A. New columns on `studies` table

```sql
ALTER TABLE studies ADD COLUMN ai_confidence REAL DEFAULT 0.0;
ALTER TABLE studies ADD COLUMN ai_decision TEXT DEFAULT '';        -- include/exclude/uncertain
ALTER TABLE studies ADD COLUMN ai_reason TEXT DEFAULT '';          -- human-readable reason
ALTER TABLE studies ADD COLUMN ai_reason_code TEXT DEFAULT '';     -- taxonomy code
ALTER TABLE studies ADD COLUMN ai_screened_at TEXT DEFAULT '';     -- ISO timestamp
ALTER TABLE studies ADD COLUMN ai_stage TEXT DEFAULT '';           -- title/abstract/fulltext
```

These store the latest AI screening result directly on the study row for fast frontend rendering without joining `screening_decisions`.

### 1B. New `clarification_questions` table

(From `plan_interactive_clarification.md` — included here for completeness)

```sql
CREATE TABLE IF NOT EXISTS clarification_questions (
    question_id         TEXT PRIMARY KEY,
    study_id            TEXT NOT NULL,
    project_id          TEXT NOT NULL,
    stage               TEXT NOT NULL,          -- ta | ft
    question_type       TEXT NOT NULL,          -- study_design | population_match | intervention_match | outcome_match
    question_text       TEXT NOT NULL,
    options_json        TEXT NOT NULL,          -- JSON array of {label, value} options
    context_excerpt     TEXT DEFAULT '',        -- relevant text snippet that triggered the question
    pico_aspect         TEXT DEFAULT '',        -- which PICO element is uncertain
    ai_interim_decision TEXT DEFAULT '',        -- what the AI was leaning toward
    ai_confidence       REAL DEFAULT 0.0,
    ai_reason           TEXT DEFAULT '',
    status              TEXT DEFAULT 'pending', -- pending | answered | expired
    answer              TEXT DEFAULT '',
    answer_label        TEXT DEFAULT '',
    answer_freetext     TEXT DEFAULT '',
    answered_by         TEXT DEFAULT '',
    answered_at         TEXT DEFAULT '',
    final_decision      TEXT DEFAULT '',        -- include/exclude/uncertain
    final_confidence    REAL DEFAULT 0.0,
    final_reason_text   TEXT DEFAULT '',
    final_reason_code   TEXT DEFAULT '',
    created_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);
```

### 1C. New `screening_keywords` table (Rayyan-style keyword highlighting)

```sql
CREATE TABLE IF NOT EXISTS screening_keywords (
    keyword_id      TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    keyword         TEXT NOT NULL,
    keyword_type    TEXT NOT NULL,              -- include | exclude
    color           TEXT DEFAULT '',            -- green | red (auto-assigned)
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);
```

This stores per-project inclusion/exclusion keywords for highlighting in abstracts. Pre-populated with RCT/CCT terms (from Rayyan's Mahmić-Kaknjo study) plus keywords auto-extracted from the project's PICO criteria.

### 1D. Migration in `database.py`

Add to `_run_migrations()`:
```python
# AI screening columns
for col, default in [("ai_confidence", "0.0"), ("ai_decision", ""), ("ai_reason", ""),
                      ("ai_reason_code", ""), ("ai_screened_at", ""), ("ai_stage", "")]:
    try:
        conn.execute(f"ALTER TABLE studies ADD COLUMN {col} {'REAL' if col == 'ai_confidence' else 'TEXT'} DEFAULT {default}")
    except sqlite3.OperationalError:
        pass  # Column already exists
```

Add `clarification_questions` and `screening_keywords` to the schema `CREATE TABLE IF NOT EXISTS` block and to `reset_db()` drop order.

---

## Part 2 — Backend: Multi-Stage AI Screening Service

### New file: `services/ai_screening_pipeline.py`

This is the orchestrator that runs the full multi-stage pipeline when the user clicks "Start AI Screening".

```python
class AIScreeningPipeline:
    """Runs multi-stage AI screening: title → abstract → full-text."""

    def run_full_pipeline(self, project_id: str, conn) -> dict:
        """Run all stages sequentially. Returns summary dict."""
        # Stage 1: Title screening
        title_results = self._run_title_screening(project_id, conn)
        # Stage 2: Abstract screening (for uncertain studies from Stage 1)
        abstract_results = self._run_abstract_screening(project_id, conn)
        # Stage 3: Full-text screening (for ta_included studies with PDFs)
        ft_results = self._run_fulltext_screening(project_id, conn)
        # Build summary
        return self._build_summary(project_id, conn, title_results, abstract_results, ft_results)

    def _run_title_screening(self, project_id, conn) -> list:
        """Screen all pending studies by title only."""
        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'pending'",
            (project_id,)
        ).fetchall()
        # ... call LLM with title-only prompt for each study

    def _run_abstract_screening(self, project_id, conn) -> list:
        """Screen uncertain studies by title + abstract."""
        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'pending' AND ai_decision = 'uncertain'",
            (project_id,)
        ).fetchall()
        # ... call LLM with title+abstract prompt, extract PICO spans + keyword highlights

    def _run_fulltext_screening(self, project_id, conn) -> list:
        """Screen ta_included studies by full text."""
        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'ta_included'",
            (project_id,)
        ).fetchall()
        # For each study: check PDF exists → screen full text → record decision
```

### 2A. Title screening LLM prompt

```python
TITLE_SCREENING_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention: {intervention}
Comparator: {comparator}
Outcome: {outcome}

Exclusion Criteria:
{exclusion_criteria}

Study Title: {title}

Based on the TITLE ONLY, determine if this study should be:
- "include": Title clearly matches PICO criteria
- "exclude": Title clearly does NOT match (wrong population, wrong intervention, etc.)
- "uncertain": Cannot determine from title alone — needs abstract review

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.0-1.0,
  "reason": "Brief justification",
  "reason_code": "short_snake_case_code_or_empty",
  "matched_keywords": ["keyword1", "keyword2"]
}}
"""
```

### 2B. Abstract screening LLM prompt (enhanced with keyword extraction)

```python
ABSTRACT_SCREENING_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention: {intervention}
Comparator: {comparator}
Outcome: {outcome}

Exclusion Criteria:
{exclusion_criteria}

Study Title: {title}
Study Abstract: {abstract}

Evaluate this study's eligibility based on title AND abstract.

Also identify which keywords from the abstract are relevant to:
1. Inclusion keywords (terms that support inclusion)
2. Exclusion keywords (terms that suggest exclusion)
3. PICO elements (Population, Intervention, Comparator, Outcome spans)

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.0-1.0,
  "reason": "Clear justification matching PICO",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote supporting decision",
  "pico_spans": [
    {{"element": "population", "start": int, "end": int, "text": "...", "confidence": 0.9}},
    {{"element": "intervention", "start": int, "end": int, "text": "...", "confidence": 0.9}},
    {{"element": "outcome", "start": int, "end": int, "text": "...", "confidence": 0.9}}
  ],
  "include_keywords": ["term1", "term2"],
  "exclude_keywords": ["term1", "term2"],
  "needs_clarification": false,
  "clarification_type": "study_design" | "population_match" | "intervention_match" | "outcome_match" | null,
  "clarification_question": "Question text if needs_clarification is true",
  "clarification_options": [{{"label": "Option A", "value": "a"}}, ...]
}}
"""
```

### 2C. Full-text screening LLM prompt

Same as existing `screen_fulltext_with_llm` but enhanced to return:
- `confidence` (already returned)
- `evidence_quotes` (list, not just one)
- `needs_clarification` + clarification fields (same schema as abstract)
- `pico_spans` from full text (for highlighting in the PDF viewer)

### 2D. Confidence display logic

Confidence scores map to display badges:
- **≥ 0.80 → "High"** (green badge) — AI is very confident
- **0.60–0.79 → "Medium"** (yellow badge) — AI is moderately confident
- **< 0.60 → "Low"** (red badge) — AI is uncertain, human should review

### 2E. Recording AI decisions

After each stage, the pipeline:
1. Updates `studies` table: `ai_decision`, `ai_confidence`, `ai_reason`, `ai_reason_code`, `ai_screened_at`, `ai_stage`, and `screening_status` / `screening_stage` / `screening_reason`
2. Inserts a row into `screening_decisions` with `reviewer_id = "ai_screener"`, `reviewer_name = "AI Screener"`, `decision = <include/exclude/uncertain>`, `stage = <ta/ft>`, `reason_code`, `reason_text`
3. If `needs_clarification` is true, inserts a row into `clarification_questions`

### 2F. Screening status values

| Status | Meaning |
|---|---|
| `pending` | Not yet screened by AI |
| `ta_included` | Passed title/abstract screening → awaiting full-text |
| `included` | Passed full-text screening → included in review |
| `excluded` | Excluded at any stage |
| `uncertain` | AI uncertain, needs human review |
| `awaiting_clarification` | AI generated a clarification question, waiting for human answer |
| `awaiting_pdf` | Passed TA screening, needs PDF upload for full-text screening |

---

## Part 3 — Backend: Clarification Question Generator & Resolver

### 3A. `services/clarification_generator.py`

When the AI's abstract or full-text screening returns `needs_clarification: true`, this service:
1. Parses the `clarification_type`, `clarification_question`, and `clarification_options` from the LLM response
2. Stores the question in `clarification_questions` table with `status = "pending"`
3. Sets the study's `screening_status = "awaiting_clarification"`
4. Returns the question object to the pipeline (pipeline continues to next study)

**Four question types** (from `plan_interactive_clarification.md`):
- `study_design` — "What study design does this paper report?" → RCT / Cohort / Case-control / Case series / Systematic review / Other
- `population_match` — "Does the study population match your PICO population?" → Yes / No / Partially / Unsure
- `intervention_match` — "Does the intervention/test described match your PICO intervention?" → Yes / No / Partially / Unsure (options are dynamic, extracted from abstract)
- `outcome_match` — "Does the reported outcome match your PICO outcome?" → Yes / No / Partially / Unsure

### 3B. `services/clarification_resolver.py`

When the human answers a clarification question:
1. Updates `clarification_questions`: `answer`, `answer_label`, `answered_by`, `answered_at`, `status = "answered"`
2. Calls the LLM with a re-evaluation prompt that includes:
   - Original study text (title + abstract or full text)
   - PICO criteria
   - The clarification question + human's answer
3. LLM returns a final decision: `include` / `exclude` / `uncertain`
4. Updates `clarification_questions`: `final_decision`, `final_confidence`, `final_reason_text`, `final_reason_code`
5. Updates `studies`: `screening_status`, `screening_stage`, `screening_reason`, `ai_decision`, `ai_confidence`, `ai_reason`
6. Records a new `screening_decisions` row with `reviewer_id = "ai_screener"`, `reason_text = "Resolved via clarification: <answer>"`

**Re-evaluation prompt:**
```python
RESOLVER_PROMPT = """Original Study:
Title: {title}
Abstract: {abstract}

PICO Criteria: {pico}

The AI was uncertain about: {question_type}
Question asked: {question_text}
Human reviewer answered: "{answer}"

Based on this additional information, make a final screening decision.

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.0-1.0,
  "reason": "Justification incorporating the human's answer",
  "reason_code": "short_snake_case_code_or_empty"
}}
"""
```

**Edge cases:**
- Human selects "Other" with free-text → free-text is included in the resolver prompt
- Human selects "Unsure" → AI returns "uncertain", study goes to human review
- AI still uncertain after answer → study stays "uncertain" for human review
- Human dismisses question → `status = "expired"`, study goes to "uncertain"

---

## Part 4 — Backend: Keyword Highlighting Service

### 4A. `services/keyword_highlight_service.py`

This service combines three sources of keywords for highlighting in abstracts:

1. **PICO spans** — already exists via `extract_pico_spans_from_abstract()` in `pico_extractor.py`. Returns character offsets with colors: Population=purple, Intervention/Comparator=blue, Outcome=orange.

2. **Inclusion/exclusion keywords** — from the `screening_keywords` table. Include keywords highlighted in green, exclude keywords highlighted in red. Pre-populated with:
   - **Default include keywords** (from Rayyan's RCT/CCT study): "randomized", "randomised", "randomly", "random allocation", "double-blind", "single-blind", "controlled trial", "clinical trial", "placebo", "trial"
   - **Default exclude keywords**: "case report", "case series", "review", "meta-analysis", "editorial", "letter", "comment", "animal study", "in vitro", "phantom"
   - **PICO-derived keywords**: auto-extracted from the project's PICO criteria (e.g., if population is "stroke patients", add "stroke", "cerebrovascular", "CVA" as include keywords)

3. **AI-identified keywords** — from the abstract screening LLM response (`include_keywords` and `exclude_keywords` fields). These are study-specific keywords the AI identified as relevant.

### 4B. Highlighting API endpoint

```python
@router.get("/studies/{study_id}/abstract-highlights")
async def get_abstract_highlights(study_id: str, conn):
    """Returns combined highlight spans for an abstract:
    - PICO spans (purple/blue/orange)
    - Include keyword spans (green)
    - Exclude keyword spans (red)
    - AI-identified keyword spans (green/red)
    """
    study = conn.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    project_id = study["project_id"]
    abstract = study["abstract"] or ""

    # 1. PICO spans (existing service)
    pico_spans = extract_pico_spans_from_abstract(abstract)

    # 2. Project keywords from screening_keywords table
    keywords = conn.execute(
        "SELECT * FROM screening_keywords WHERE project_id = ?", (project_id,)
    ).fetchall()

    # 3. Find keyword matches in abstract
    keyword_spans = find_keyword_matches(abstract, keywords)

    # 4. AI-identified keywords from latest screening decision
    ai_decision = conn.execute(
        """SELECT * FROM screening_decisions WHERE study_id = ? AND reviewer_id = 'ai_screener'
           ORDER BY created_at DESC LIMIT 1""",
        (study_id,)
    ).fetchone()
    ai_keywords = extract_ai_keywords(ai_decision) if ai_decision else []

    return {
        "study_id": study_id,
        "abstract": abstract,
        "pico_spans": pico_spans,
        "keyword_spans": keyword_spans,
        "ai_keyword_spans": ai_keywords,
        "all_spans": merge_and_sort_spans(pico_spans, keyword_spans, ai_keywords),
    }
```

### 4C. Keyword management endpoints

```python
@router.get("/projects/{project_id}/screening-keywords")
async def list_screening_keywords(project_id: str, conn):
    """List all include/exclude keywords for a project."""

@router.post("/projects/{project_id}/screening-keywords")
async def add_screening_keyword(project_id: str, body: ScreeningKeywordCreate, conn):
    """Add a keyword. Auto-assigns color: green for include, red for exclude."""

@router.delete("/screening-keywords/{keyword_id}")
async def delete_screening_keyword(keyword_id: str, conn):
    """Delete a keyword."""

@router.post("/projects/{project_id}/screening-keywords/auto-generate")
async def auto_generate_keywords(project_id: str, conn):
    """Auto-generate keywords from PICO criteria + defaults.
    Uses LLM to extract key terms from PICO population/intervention/outcome fields."""
```

---

## Part 5 — Backend: API Endpoints

### 5A. Pipeline endpoints (new file: `routers/ai_screening.py`)

```python
# Start the full AI screening pipeline
@router.post("/projects/{project_id}/ai-screening/start")
async def start_ai_screening(project_id: str, conn):
    """Run the full multi-stage AI screening pipeline.
    Returns immediately with a job summary after processing all studies.
    Stages: title → abstract → full-text (for studies with PDFs)."""

# Start AI analysis (title screening only, then stops for human to review)
@router.post("/projects/{project_id}/ai-screening/start-analysis")
async def start_ai_analysis(project_id: str, conn):
    """Run title screening only. Returns results for human review.
    Human can then click 'Continue to Abstract Screening' to proceed."""

# Continue to next stage
@router.post("/projects/{project_id}/ai-screening/continue")
async def continue_ai_screening(project_id: str, body: ContinueRequest, conn):
    """Continue to the next screening stage.
    body.stage: 'abstract' | 'fulltext'
    Only processes studies that are pending/uncertain from the previous stage."""

# Get pipeline status
@router.get("/projects/{project_id}/ai-screening/status")
async def get_ai_screening_status(project_id: str, conn):
    """Returns current screening pipeline status:
    counts per stage, counts per status, clarification questions count."""
```

### 5B. Clarification endpoints (from `plan_interactive_clarification.md`)

```python
# List pending clarification questions for a project
@router.get("/projects/{project_id}/clarifications")
async def list_clarifications(project_id: str, status: str = "pending", conn):

# Get a specific clarification question
@router.get("/clarifications/{question_id}")

# Answer a clarification question (triggers AI re-evaluation)
@router.post("/clarifications/{question_id}/answer")
async def answer_clarification(question_id: str, body: ClarificationAnswer, conn):
    """body: {answer: str, answer_label: str, answer_freetext: str}
    Triggers clarification_resolver → AI re-evaluates → final decision recorded."""

# Dismiss a clarification question
@router.delete("/clarifications/{question_id}")
async def dismiss_clarification(question_id: str, conn):
    """Marks question as 'expired'. Study goes to 'uncertain' for human review."""

# Get clarification history for a study
@router.get("/studies/{study_id}/clarifications")
```

### 5C. Fix broken Include/Exclude buttons

**Root cause:** The current `handleScreen` function in `ScreeningPage.tsx` calls either `decisionMutation` (multi-reviewer mode) or `updateMutation` (legacy mode). The `updateMutation` calls `PUT /studies/{studyId}/screening` which updates `screening_status`, `screening_stage`, and `screening_reason` — but this endpoint does NOT record a `screening_decisions` row, so the decision is not auditable. The `decisionMutation` calls `POST /studies/{studyId}/screening-decision` which does record properly but has a bug: when only one reviewer exists, the study's `screening_status` is never updated (the update only happens in the "all agree" branch, which requires 2+ decisions).

**Fix in `routers/screening.py` — `create_screening_decision` endpoint:**

After recording the decision, always update the study's screening status (not just when 2+ reviewers agree):

```python
# After recording the decision, always update study screening status
# (not just in the "all agree" branch)
conn.execute(
    """UPDATE studies SET
       screening_status = ?, screening_stage = ?,
       screening_reason = ?
       WHERE study_id = ?""",
    (body.decision, body.stage,
     body.reason_text or body.reason_code, study_id),
)
```

This ensures that even with a single reviewer, clicking Include/Exclude immediately updates the study's status.

**Fix in frontend `ScreeningPage.tsx`:**

Always use `decisionMutation` (not `updateMutation`). Remove the `useMultiReviewer` toggle — all decisions go through `POST /studies/{studyId}/screening-decision`. The legacy `PUT /studies/{studyId}/screening` endpoint remains for backward compatibility but is no longer called from the UI.

### 5D. Enhanced screening summary endpoint

Update `GET /projects/{project_id}/screening/summary` to include AI screening counts:

```python
return {
    "project_id": project_id,
    "total": total,
    "ta_included": ta_included,
    "ta_excluded": ta_excluded,
    "ft_included": ft_included,
    "ft_excluded": ft_excluded,
    "pending": pending,
    # NEW fields:
    "uncertain": uncertain_count,
    "awaiting_clarification": clarification_count,
    "awaiting_pdf": awaiting_pdf_count,
    "ai_screened": ai_screened_count,
    "high_confidence": high_confidence_count,    # ai_confidence >= 0.80
    "medium_confidence": medium_confidence_count, # 0.60-0.79
    "low_confidence": low_confidence_count,       # < 0.60
}
```

---

## Part 6 — Frontend: Screening Page Redesign

### 6A. Layout: Two-pane design (Rayyan-style)

```
┌─────────────────────────────────────────────────────────────────┐
│  Screening                                          [Start AI   │
│  Project: Neurovascular Diagnostic Accuracy Review   Screening]  │
│                                                     [Start AI    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             Analysis]    │
│  │ Total:45 │ │ TA Inc:12│ │ FT Inc:8 │                           │
│  └──────────┘ └──────────┘ └──────────┘                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Excl: 20 │ │ Uncert: 3│ │ Clarif: 2│ │ Need PDF:│             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
│                                                                   │
│  Filters: [All ▾] [Stage ▾] [Status ▾] [Confidence ▾]            │
│  Keywords: [Include ▾] [Exclude ▾] [☑ Highlights]                │
├──────────────────────────────┬────────────────────────────────────┤
│  Study List (scrollable)     │  Preview Pane (selected study)     │
│                              │                                    │
│  ┌────────────────────────┐  │  ┌──────────────────────────────┐ │
│  │ ● Study Title 1        │  │  │ Title: ...                    │ │
│  │ Authors, Journal, Year │  │ │ Authors: ...                  │ │
│  │ [High 95%] [Included]  │  │ │ Year: 2023  Journal: ...      │ │
│  │ "Matches PICO..."      │  │ │                                │ │
│  ├────────────────────────┤  │  │ ABSTRACT (with highlights):   │ │
│  │ ● Study Title 2        │  │  │ ┌──────────────────────────┐ │ │
│  │ Authors, Journal, Year │  │  │ │ Patients with [stroke]   │ │ │
│  │ [Med 72%] [Uncertain]  │  │  │ │ were randomized to      │ │ │
│  │ "Population unclear..."│  │  │ │ [MRI] or [CT]...        │ │ │
│  ├────────────────────────┤  │  │ │ Primary [outcome] was   │ │ │
│  │ ● Study Title 3        │  │  │ │ [mortality]...          │ │ │
│  │ Authors, Journal, Year │  │  │ └──────────────────────────┘ │ │
│  │ [Low 45%] [Clarif?]    │  │  │  P: purple  I: blue  O: orange │ │
│  │ "Needs clarification"  │  │  │  Include kw: green  Exclude: red│
│  ├────────────────────────┤  │  │                                │ │
│  │ ● Study Title 4        │  │  │ AI Decision: Include (95%)    │ │
│  │ Authors, Journal, Year │  │  │ Reason: "Clear RCT matching   │ │
│  │ [—] [Awaiting PDF]     │  │  │ PICO population and outcome"  │ │
│  │ [Upload PDF]           │  │  │                                │ │
│  └────────────────────────┘  │  │ [Include] [Exclude] [Maybe]   │ │
│                              │  │ [Run AI Screen] [Auto-Extract] │ │
│                              │  └──────────────────────────────┘ │
└──────────────────────────────┴────────────────────────────────────┘
```

### 6B. "Start AI Screening" button

- Prominent button at top right of screening page
- On click: calls `POST /projects/{projectId}/ai-screening/start`
- Shows progress indicator while pipeline runs
- On completion: refreshes study list with all AI decisions + confidence scores
- Shows toast notification: "AI screening complete: 12 included, 20 excluded, 3 uncertain, 2 need clarification"

### 6C. "Start AI Analysis" button

- Secondary button next to "Start AI Screening"
- On click: calls `POST /projects/{projectId}/ai-screening/start-analysis` (title screening only)
- Shows results with a "Continue to Abstract Screening" button
- This gives the human a checkpoint to review title-level decisions before proceeding

### 6D. Study list (left pane)

Each study card shows:
- **Title** (bold, clickable to select → updates preview pane)
- **Authors, journal, year** (gray, small)
- **Confidence badge:** colored pill — green "High 95%", yellow "Med 72%", red "Low 45%"
- **Status badge:** Included / Excluded / Uncertain / Awaiting Clarification / Awaiting PDF
- **AI reason** (one line, italic, gray)
- **Action buttons** (appear on hover or always visible):
  - If awaiting PDF: "Upload PDF" button
  - If awaiting clarification: "Answer Question" button (opens clarification modal)
  - Always: Include / Exclude / Maybe buttons (now working — see fix in Part 5C)

### 6E. Preview pane (right pane, Rayyan-style)

When a study is selected in the list, the preview pane shows:
- **Full bibliographic info:** title, authors, journal, year, DOI, PMID
- **Abstract with keyword highlighting:**
  - PICO terms highlighted (purple/blue/orange) — from `GET /studies/{studyId}/abstract-highlights`
  - Include keywords highlighted in green
  - Exclude keywords highlighted in red
  - Hover tooltip shows which element/keyword matched
  - Legend at bottom: P=Population, I=Intervention, O=Outcome, green=Include kw, red=Exclude kw
- **AI screening result:**
  - Decision + confidence badge
  - Reason text
  - Evidence quote (if available)
  - PICO match summary (which elements matched)
- **Action buttons:**
  - Include / Exclude / Maybe (working — calls `POST /studies/{studyId}/screening-decision`)
  - Run AI Screen (single study)
  - Auto-Extract (if included)
  - Upload PDF (if awaiting PDF)
  - Answer Clarification (if awaiting clarification)

### 6F. Clarification question modal

When a study has `screening_status = "awaiting_clarification"`:
- Notification badge on screening page: "N studies need clarification"
- Clicking "Answer Question" opens a modal:
  ```
  ┌──────────────────────────────────────┐
  │  Clarification Needed                │
  │                                      │
  │  Study: "MRI vs CT for stroke..."    │
  │                                      │
  │  The AI is uncertain about the       │
  │  study design.                       │
  │                                      │
  │  Context: "This study compared       │
  │  imaging modalities in a..."         │
  │                                      │
  │  What study design does this paper   │
  │  report?                             │
  │                                      │
  │  ○ RCT                               │
  │  ○ Cohort study                      │
  │  ○ Case-control study                │
  │  ○ Case series                       │
  │  ○ Systematic review                 │
  │  ○ Other: [________________]         │
  │                                      │
  │  [Submit Answer]  [Dismiss]          │
  └──────────────────────────────────────┘
  ```
- On submit: calls `POST /clarifications/{questionId}/answer`
- Shows AI's re-evaluated decision: "Based on your answer, the AI has decided to: Include (88%)"
- On dismiss: calls `DELETE /clarifications/{questionId}` → study goes to "uncertain"

### 6G. Keyword management panel

A collapsible panel (toggle button in toolbar) that shows:
- **Include keywords** (green chips, with + button to add, × to remove)
- **Exclude keywords** (red chips, with + button to add, × to remove)
- **Auto-generate from PICO** button
- **Reset to defaults** button
- **Highlight toggle** checkbox (show/hide all highlights in abstracts)

### 6H. Confidence filter

A dropdown filter in the toolbar:
- All confidences
- High (≥ 80%)
- Medium (60–79%)
- Low (< 60%)

Filters the study list by AI confidence level.

---

## Part 7 — Frontend: API Client Updates (`lib/api.ts`)

### New types:

```typescript
export interface AIScreeningResult {
  study_id: string;
  decision: "include" | "exclude" | "uncertain";
  confidence: number;
  reason: string;
  reason_code: string;
  evidence_quote: string;
  pico_spans: PicoSpan[];
  include_keywords: string[];
  exclude_keywords: string[];
  needs_clarification: boolean;
}

export interface AIScreeningSummary {
  total: number;
  title_screened: number;
  abstract_screened: number;
  fulltext_screened: number;
  included: number;
  excluded: number;
  uncertain: number;
  awaiting_clarification: number;
  awaiting_pdf: number;
}

export interface AbstractHighlights {
  study_id: string;
  abstract: string;
  all_spans: HighlightSpan[];
  pico_spans: HighlightSpan[];
  keyword_spans: HighlightSpan[];
  ai_keyword_spans: HighlightSpan[];
}

export interface HighlightSpan {
  start: number;
  end: number;
  text: string;
  type: "population" | "intervention" | "comparator" | "outcome" | "include_keyword" | "exclude_keyword";
  color: "purple" | "blue" | "orange" | "green" | "red";
  confidence: number;
  label: string;  // e.g., "Population", "Include keyword: RCT"
}

export interface ClarificationQuestion {
  question_id: string;
  study_id: string;
  stage: string;
  question_type: string;
  question_text: string;
  options: { label: string; value: string }[];
  context_excerpt: string;
  ai_interim_decision: string;
  ai_confidence: number;
  status: "pending" | "answered" | "expired";
  answer?: string;
  final_decision?: string;
  final_confidence?: number;
}

export interface ScreeningKeyword {
  keyword_id: string;
  project_id: string;
  keyword: string;
  keyword_type: "include" | "exclude";
  color: string;
}
```

### New API methods:

```typescript
// AI Screening Pipeline
startAIScreening: (projectId: string) =>
  request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start`, { method: "POST" }),

startAIAnalysis: (projectId: string) =>
  request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start-analysis`, { method: "POST" }),

continueAIScreening: (projectId: string, stage: string) =>
  request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/continue`, {
    method: "POST", body: JSON.stringify({ stage })
  }),

getAIScreeningStatus: (projectId: string) =>
  request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/status`),

// Abstract Highlights
getAbstractHighlights: (studyId: string) =>
  request<AbstractHighlights>(`/studies/${studyId}/abstract-highlights`),

// Clarification Questions
listClarifications: (projectId: string, status?: string) =>
  request<ClarificationQuestion[]>(`/projects/${projectId}/clarifications${status ? `?status=${status}` : ""}`),

answerClarification: (questionId: string, answer: string, answerLabel: string, answerFreetext?: string) =>
  request(`/clarifications/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, answer_label: answerLabel, answer_freetext: answerFreetext || "" })
  }),

dismissClarification: (questionId: string) =>
  request(`/clarifications/${questionId}`, { method: "DELETE" }),

// Screening Keywords
listScreeningKeywords: (projectId: string) =>
  request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords`),

addScreeningKeyword: (projectId: string, keyword: string, type: "include" | "exclude") =>
  request<ScreeningKeyword>(`/projects/${projectId}/screening-keywords`, {
    method: "POST", body: JSON.stringify({ keyword, keyword_type: type })
  }),

deleteScreeningKeyword: (keywordId: string) =>
  request(`/screening-keywords/${keywordId}`, { method: "DELETE" }),

autoGenerateKeywords: (projectId: string) =>
  request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords/auto-generate`, { method: "POST" }),
```

---

## Part 8 — Pydantic Models (`models.py`)

```python
class AIScreeningStartRequest(BaseModel):
    stage: str = "all"  # "title" | "abstract" | "fulltext" | "all"

class AIScreeningSummary(BaseModel):
    total: int
    title_screened: int = 0
    abstract_screened: int = 0
    fulltext_screened: int = 0
    included: int = 0
    excluded: int = 0
    uncertain: int = 0
    awaiting_clarification: int = 0
    awaiting_pdf: int = 0

class ContinueScreeningRequest(BaseModel):
    stage: str  # "abstract" | "fulltext"

class HighlightSpan(BaseModel):
    start: int
    end: int
    text: str
    type: str  # population | intervention | comparator | outcome | include_keyword | exclude_keyword
    color: str  # purple | blue | orange | green | red
    confidence: float = 1.0
    label: str = ""

class AbstractHighlightsResponse(BaseModel):
    study_id: str
    abstract: str
    all_spans: list[HighlightSpan] = []
    pico_spans: list[HighlightSpan] = []
    keyword_spans: list[HighlightSpan] = []
    ai_keyword_spans: list[HighlightSpan] = []

class ScreeningKeywordCreate(BaseModel):
    keyword: str
    keyword_type: str  # include | exclude

class ScreeningKeywordResponse(BaseModel):
    keyword_id: str
    project_id: str
    keyword: str
    keyword_type: str
    color: str

class ClarificationAnswer(BaseModel):
    answer: str
    answer_label: str = ""
    answer_freetext: str = ""

class ClarificationQuestionResponse(BaseModel):
    question_id: str
    study_id: str
    project_id: str
    stage: str
    question_type: str
    question_text: str
    options: list[dict] = []
    context_excerpt: str = ""
    ai_interim_decision: str = ""
    ai_confidence: float = 0.0
    status: str
    answer: str = ""
    answer_label: str = ""
    final_decision: str = ""
    final_confidence: float = 0.0
    final_reason_text: str = ""
    created_at: str = ""
```

---

## Part 9 — Router Registration (`main.py`)

Register new routers:
```python
from routers.ai_screening import router as ai_screening_router
from routers.clarification import router as clarification_router

app.include_router(ai_screening_router)
app.include_router(clarification_router)
```

---

## Part 10 — Files Modified and Created

### New files:
| File | Purpose |
|---|---|
| `services/ai_screening_pipeline.py` | Multi-stage pipeline orchestrator (title → abstract → full-text) |
| `services/clarification_generator.py` | Generates clarification questions from LLM uncertain responses |
| `services/clarification_resolver.py` | Re-evaluates with human answer, produces final decision |
| `services/keyword_highlight_service.py` | Combines PICO + include/exclude keyword spans for highlighting |
| `routers/ai_screening.py` | Pipeline start/continue/status endpoints |
| `routers/clarification.py` | Clarification question CRUD + answer endpoints |
| `tests/test_ai_screening_pipeline.py` | Tests for multi-stage pipeline |
| `tests/test_clarification.py` | Tests for clarification generator + resolver |
| `tests/test_keyword_highlight.py` | Tests for keyword highlighting service |

### Modified files:
| File | Changes |
|---|---|
| `database.py` | Add `ai_confidence`, `ai_decision`, `ai_reason`, `ai_reason_code`, `ai_screened_at`, `ai_stage` columns to `studies`. Add `clarification_questions` and `screening_keywords` tables. Add to `reset_db()` drop order. |
| `models.py` | Add all new Pydantic models (Part 8) |
| `main.py` | Register `ai_screening` and `clarification` routers |
| `routers/screening.py` | Fix `create_screening_decision` to always update study status (Part 5C). Enhance screening summary with new fields (Part 5D). Add keyword management endpoints (Part 4C). Add abstract highlights endpoint (Part 4B). |
| `routers/studies.py` | No changes needed — existing AI screen endpoints remain for single-study use |
| `services/llm_extractor.py` | Enhance `screen_fulltext_with_llm` and `screen_title_abstract_with_llm` to return `needs_clarification`, `pico_spans`, `include_keywords`, `exclude_keywords` fields. Add new `screen_title_only_with_llm` function. |
| `services/pico_extractor.py` | No changes — existing `extract_pico_spans_from_abstract` is reused |
| `frontend/src/lib/api.ts` | Add all new types and API methods (Part 7) |
| `frontend/src/pages/ScreeningPage.tsx` | Full redesign: two-pane layout, Start AI Screening/Analysis buttons, confidence badges, keyword highlighting in preview pane, clarification modal, keyword management panel, confidence filter. Fix Include/Exclude buttons to always use `decisionMutation`. |

---

## Part 11 — Test Cases

### `tests/test_ai_screening_pipeline.py` (20 tests)

1. `test_title_screening_confident_include` — title clearly matches PICO → status = "ta_included"
2. `test_title_screening_confident_exclude` — title clearly wrong population → status = "excluded"
3. `test_title_screening_uncertain_advances_to_abstract` — title ambiguous → stays "pending" with ai_decision = "uncertain"
4. `test_abstract_screening_confident_include` — abstract matches → status = "ta_included"
5. `test_abstract_screening_confident_exclude` — abstract wrong outcome → status = "excluded"
6. `test_abstract_screening_uncertain_no_clarification` — uncertain but no clarification needed → status = "uncertain"
7. `test_abstract_screening_uncertain_with_clarification` — uncertain + needs_clarification → status = "awaiting_clarification"
8. `test_fulltext_screening_with_pdf` — PDF exists → full-text screening runs → status = "included" or "excluded"
9. `test_fulltext_screening_without_pdf` — no PDF → status = "awaiting_pdf"
10. `test_full_pipeline_run_all_stages` — run full pipeline → summary returned with correct counts
11. `test_start_analysis_title_only` — start-analysis runs title screening only
12. `test_continue_to_abstract` — continue from title to abstract stage
13. `test_continue_to_fulltext` — continue from abstract to fulltext stage
14. `test_ai_decision_recorded_in_screening_decisions` — each AI decision creates a screening_decisions row with reviewer_id = "ai_screener"
15. `test_confidence_stored_on_study` — ai_confidence, ai_decision, ai_reason stored on studies table
16. `test_pipeline_idempotent` — running pipeline twice doesn't re-screen already-decided studies
17. `test_pipeline_handles_no_studies` — project with no studies → returns empty summary
18. `test_pipeline_handles_no_pico` — project with no PICO criteria → uses defaults
19. `test_pipeline_llm_unavailable_fallback` — LLM unavailable → all studies go to "uncertain"
20. `test_pipeline_summary_counts` — summary counts match actual database state

### `tests/test_clarification.py` (15 tests)

1. `test_generate_clarification_study_design` — study design question generated correctly
2. `test_generate_clarification_population_match` — population match question generated
3. `test_generate_clarification_intervention_match` — intervention match question generated
4. `test_generate_clarification_outcome_match` — outcome match question generated
5. `test_answer_clarification_include` — human answers → AI re-evaluates → includes
6. `test_answer_clarification_exclude` — human answers → AI re-evaluates → excludes
7. `test_answer_clarification_still_uncertain` — human answers → AI still uncertain → status = "uncertain"
8. `test_answer_clarification_with_freetext` — "Other" with free-text answer
9. `test_dismiss_clarification` — dismiss → status = "expired", study = "uncertain"
10. `test_list_pending_clarifications` — list returns only pending questions
11. `test_list_answered_clarifications` — list returns answered questions with final decision
12. `test_clarification_status_update_on_answer` — question status changes to "answered"
13. `test_final_decision_recorded_in_screening_decisions` — resolved decision creates screening_decisions row
14. `test_one_question_per_study_per_stage` — only one clarification question per study per stage
15. `test_clarification_with_no_llm` — LLM unavailable → resolver returns "uncertain"

### `tests/test_keyword_highlight.py` (10 tests)

1. `test_pico_spans_returned` — PICO spans extracted from abstract
2. `test_include_keyword_highlight` — include keywords found and highlighted green
3. `test_exclude_keyword_highlight` — exclude keywords found and highlighted red
4. `test_ai_keywords_from_screening` — AI-identified keywords from screening decision
5. `test_merged_spans_sorted_by_position` — all spans sorted by start position
6. `test_overlapping_spans_handled` — overlapping PICO and keyword spans don't break rendering
7. `test_no_abstract_returns_empty` — study with no abstract → empty spans
8. `test_add_screening_keyword` — add keyword to project
9. `test_delete_screening_keyword` — delete keyword from project
10. `test_auto_generate_keywords_from_pico` — auto-generate produces relevant keywords

### `tests/test_screening_fixes.py` (5 tests)

1. `test_single_reviewer_include_updates_status` — Include button updates screening_status immediately
2. `test_single_reviewer_exclude_updates_status` — Exclude button updates screening_status immediately
3. `test_decision_recorded_in_screening_decisions` — decision creates auditable row
4. `test_maybe_decision_works` — Maybe/uncertain decision works correctly
5. `test_enhanced_summary_includes_new_fields` — summary includes uncertain, awaiting_clarification, awaiting_pdf, confidence counts

---

## Part 12 — Implementation Order

1. **Database schema** — add columns to `studies`, create `clarification_questions` and `screening_keywords` tables, migrations
2. **Models** — add all Pydantic models to `models.py`
3. **Fix Include/Exclude buttons** — fix `create_screening_decision` in `routers/screening.py` to always update study status
4. **Keyword highlight service** — `services/keyword_highlight_service.py` + endpoints in `routers/screening.py`
5. **Clarification generator** — `services/clarification_generator.py`
6. **Clarification resolver** — `services/clarification_resolver.py`
7. **Clarification endpoints** — `routers/clarification.py`, register in `main.py`
8. **AI screening pipeline** — `services/ai_screening_pipeline.py` with title/abstract/fulltext stages
9. **Pipeline endpoints** — `routers/ai_screening.py`, register in `main.py`
10. **Enhanced LLM prompts** — update `services/llm_extractor.py` with new prompt fields
11. **Enhanced screening summary** — update summary endpoint with new fields
12. **Tests** — write and run all 50 test cases
13. **Run full test suite** — ensure all existing 548+ tests still pass
14. **Frontend API client** — add types and methods to `lib/api.ts`
15. **Frontend ScreeningPage redesign** — two-pane layout, buttons, confidence badges, preview pane, keyword highlighting, clarification modal, keyword management
16. **Git commit and push**

---

## Assumptions

1. **AI does the complete screening:** The pipeline screens all studies through all stages automatically. The human reviews AI decisions and overrides as needed, rather than screening from scratch.
2. **Confidence is always displayed:** Every AI decision has a confidence score (0.0–1.0) shown as a colored badge (High ≥80%, Medium 60–79%, Low <60%).
3. **One question per study per stage:** The AI generates at most one clarification question per study per screening stage (title/abstract or full-text). If multiple aspects are uncertain, it picks the most decision-critical one.
4. **Hybrid clarification flow:** The pipeline queues clarification questions and continues screening other studies. The human answers via UI with 5-second polling. The AI re-evaluates with the answer to produce a final decision.
5. **PDF upload is a gate for full-text:** Studies that pass TA screening but have no PDF are set to "awaiting_pdf". The user must upload a PDF to trigger full-text screening.
6. **"Start AI Analysis" = title screening only:** This gives the human a checkpoint to review title-level decisions before committing to abstract screening. "Start AI Screening" = full pipeline (all stages).
7. **Keyword highlighting combines three sources:** PICO spans (existing service), project include/exclude keywords (new table), and AI-identified keywords (from LLM screening response). All are merged and sorted by position.
8. **Pre-populated keywords:** Include keywords default to RCT/CCT-associated terms (from Rayyan's Mahmić-Kaknjo study). Exclude keywords default to non-primary-study terms. Both are customizable per project.
9. **Include/Exclude fix:** The root cause is that `create_screening_decision` only updates `studies.screening_status` in the "all agree" branch (2+ reviewers). The fix is to always update study status after recording any decision, regardless of reviewer count.
10. **Backward compatibility:** Existing screening endpoints continue to work. The new AI screening pipeline is additive — it doesn't replace the manual screening workflow, it augments it.
11. **LLM availability:** If the LLM is unavailable, the pipeline falls back to "uncertain" for all studies (no decisions made). The clarification resolver also falls back to "uncertain".
12. **Test fixtures:** New test files use the same fixture pattern as existing tests (`fresh_db`, `client`, `project` autouse fixtures with tmp_path database).
