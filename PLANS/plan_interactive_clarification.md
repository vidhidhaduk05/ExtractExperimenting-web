# VDExtract: Interactive AI Screening with Mid-Pipeline Clarification Questions

## Summary

When the AI screening pipeline encounters a study it can't confidently include or exclude — because the study design is ambiguous, the population partially matches, the index test is unclear, or the outcome is a composite — it generates a **targeted multiple-choice question** for the human reviewer instead of guessing. The pipeline queues the question and continues screening other studies. The human can answer immediately (the AI uses the answer to finalize the decision right away) or later (the study stays in a clarification queue). This eliminates assumptions, reduces false includes/excludes, and produces a cleaner screening outcome with zero rechecking needed.

**Related plan:** `plan_screening_extraction_gaps.md` (signal pre-filter, safety net, AI-reviewer integration). This plan builds on that infrastructure — the signal pre-filter identifies weak matches, and this feature handles the cases where the AI needs human input to resolve ambiguity.

**Repo:** `/workspace/VDExtract` (backend: `radextract_platform/backend/`, frontend: `radextract_platform/frontend/`)
**Python venv:** `/workspace/.venv/bin/python`
**Test command:** `cd /workspace/VDExtract/radextract_platform/backend && /workspace/.venv/bin/python -m pytest tests/ -q --tb=short`
**Graphify map:** `/mnt/user-uploads/graphify_codebase_map.md` — ALWAYS USE GRAPHIFY TO NAVIGATE THE CODE
**Git push:** `git push https://vidhidhaduk05:<PAT>@github.com/vidhidhaduk05/VDExtract.git main` (PAT at `/mnt/user-uploads/fine-grained token all repo.txt`, read with `tr -d '[:space:]'`)

---

## Architecture: Hybrid Pipeline Flow

```
Batch AI Screening starts
  │
  ├── Study 1: AI confident → INCLUDE/EXCLUDE → record decision → next
  ├── Study 2: AI confident → INCLUDE/EXCLUDE → record decision → next
  ├── Study 3: AI uncertain, can identify specific ambiguity
  │     → generate multiple-choice question
  │     → store in clarification_questions table (status=pending)
  │     → set study screening_status = "awaiting_clarification"
  │     → continue to next study (pipeline does NOT block)
  ├── Study 4: AI confident → INCLUDE/EXCLUDE → record decision → next
  │     ... (pipeline continues through all studies)
  │
  └── After all studies processed:
        → Check if any questions were answered during the run
        → For answered questions: re-evaluate with human's answer → final decision
        → For unanswered: stay in queue, human can answer later via UI

Human reviewer (parallel, via UI):
  → Sees notification badge: "3 studies need clarification"
  → Opens clarification panel
  → Answers question for Study 3: selects "Cohort study"
  → API triggers AI re-evaluation with the answer
  → AI returns final decision: EXCLUDE (cohort doesn't meet RCT inclusion criterion)
  → Study screening_status updated, decision recorded
```

**Key principle:** The AI generates at most ONE question per study per screening pass. If multiple aspects are uncertain, it picks the one that would most change the decision. This prevents question fatigue.

---

## Part 1 — Database Schema

### New table: `clarification_questions`

In `database.py`, add to the schema and to `reset_db()`'s drop list:

```sql
CREATE TABLE IF NOT EXISTS clarification_questions (
    question_id        TEXT PRIMARY KEY,
    study_id           TEXT NOT NULL,
    project_id         TEXT NOT NULL,
    stage              TEXT NOT NULL,          -- ta | ft
    question_type      TEXT NOT NULL,          -- study_design | population_match | intervention_match | outcome_match
    question_text      TEXT NOT NULL,          -- the multiple-choice question
    options_json       TEXT NOT NULL,          -- JSON array: [{"value": "rct", "label": "Randomized controlled trial"}, ...]
    context_excerpt    TEXT DEFAULT '',        -- relevant excerpt from abstract/full-text that triggered the question
    pico_aspect        TEXT DEFAULT '',        -- which PICO element is uncertain: population | index_test | comparator | outcome | study_design
    ai_interim_decision TEXT DEFAULT '',       -- what AI would decide without the answer (usually "uncertain")
    ai_interim_confidence REAL DEFAULT 0.0,
    ai_interim_reason  TEXT DEFAULT '',        -- why the AI is uncertain
    status             TEXT DEFAULT 'pending', -- pending | answered | expired
    answer             TEXT DEFAULT '',        -- the selected option value
    answer_label       TEXT DEFAULT '',        -- the selected option label (human-readable)
    answer_freetext    TEXT DEFAULT '',        -- if "Other" was selected, the free-text answer
    answered_by        TEXT DEFAULT '',
    answered_at        TEXT DEFAULT '',
    final_decision     TEXT DEFAULT '',        -- AI's decision after incorporating the answer
    final_confidence   REAL DEFAULT 0.0,
    final_reason_text  TEXT DEFAULT '',
    final_reason_code  TEXT DEFAULT '',
    created_at         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_clarification_project ON clarification_questions(project_id);
CREATE INDEX IF NOT EXISTS idx_clarification_status ON clarification_questions(status);
CREATE INDEX IF NOT EXISTS idx_clarification_study ON clarification_questions(study_id);
```

### New screening status value

The `studies.screening_status` column already accepts arbitrary strings (TEXT). Add `"awaiting_clarification"` as a new status value. No schema change needed — just use the value in code. Update the screening summary endpoint to count this status.

---

## Part 2 — Clarification Question Generation

### New file: `services/clarification_generator.py`

**Purpose:** Modify the LLM screening prompt to detect when the AI is uncertain about a specific identifiable aspect, and generate a structured multiple-choice question instead of just returning "uncertain."

**Function:** `screen_with_clarification(title, abstract, pico_criteria, exclusion_reasons, stage="ta", signals=None) -> dict`

**How it works:**

1. Calls the LLM with a modified screening prompt (see below) that includes an additional `needs_clarification` decision path.

2. The LLM returns one of three outcomes:
   - **Definitive decision** (`include` or `exclude` with confidence ≥ 0.65) → return as normal screening result
   - **Needs clarification** (`needs_clarification` with a structured question) → return the question
   - **Vague uncertainty** (`uncertain` without a identifiable aspect) → return as normal "uncertain" for human review (no question generated)

3. Returns a dict with the standard screening fields PLUS optional `clarification` field when a question was generated.

**Modified LLM prompt:**

```python
CLARIFICATION_SCREENING_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention/Index Test: {intervention}
Comparator: {comparator}
Outcome: {outcome}
{exclusion_text}

Study to Screen:
Title: {title}
Abstract: {abstract}

Determine if this study should be INCLUDED or EXCLUDED based on the PICO framework.

If you can make a confident decision (include or exclude), return that decision.

If you are uncertain about a SPECIFIC aspect of this study, and a human's answer to a question
about that aspect would help you make a definitive decision, set "decision" to "needs_clarification"
and generate a multiple-choice question.

Only generate a question if ALL of these are true:
- You cannot confidently include or exclude based on the available text
- The uncertainty is about a SPECIFIC, identifiable aspect (not a general feeling)
- A human reviewer with expertise could resolve it by answering one question
- The question has clear, mutually exclusive answer options

Do NOT generate a question if:
- The abstract is too short or vague to formulate a specific question (just return "uncertain")
- You are uncertain about multiple aspects equally (pick the one most critical to the decision)
- The study clearly doesn't match the population (just exclude it)

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain" | "needs_clarification",
  "confidence": 0.0-1.0,
  "reason": "Clear justification",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote",
  "clarification": {{
    "question_type": "study_design" | "population_match" | "intervention_match" | "outcome_match",
    "pico_aspect": "population" | "index_test" | "comparator" | "outcome" | "study_design",
    "question_text": "The specific question to ask the human reviewer",
    "context_excerpt": "The relevant sentence(s) from the abstract that triggered the uncertainty",
    "options": [
      {{"value": "option_value", "label": "Human-readable option label"}},
      ...
    ],
    "interim_decision": "uncertain",
    "interim_reason": "Why the AI is uncertain - what specific information is missing"
  }}
}}

Question type guidelines:
- study_design: Use when the study design is ambiguous. Options: RCT, Cohort, Case-control, Cross-sectional, Case report, Systematic review, Other
- population_match: Use when the study population partially matches but isn't clearly in/out of scope. Options: "Yes, matches", "No, doesn't match", "Partially matches", "Unsure"
- intervention_match: Use when multiple interventions/tests are mentioned and it's unclear which is the index test. Options should list the specific interventions mentioned + "None of these"
- outcome_match: Use when the study reports a composite or related outcome. Options: "Yes, meets criterion", "No, doesn't meet", "Partially meets", "Unsure"
"""
```

**Parsing logic:**

```python
def screen_with_clarification(title, abstract, pico_criteria, exclusion_reasons, stage="ta", signals=None):
    prompt = CLARIFICATION_SCREENING_PROMPT.format(
        population=pico_criteria.get('population', 'N/A'),
        intervention=pico_criteria.get('intervention', pico_criteria.get('index_test', 'N/A')),
        comparator=pico_criteria.get('comparator', 'N/A'),
        outcome=pico_criteria.get('outcome', pico_criteria.get('outcomes', 'N/A')),
        exclusion_text=exclusion_text,
        title=title,
        abstract=abstract,
    )

    client = ToolCallingClient()
    raw = client.call_with_tool(
        tool_name="screen_with_clarification",
        prompt=prompt,
        system_prompt="You are a clinical systematic review screening expert. When uncertain about a specific aspect, generate a clear multiple-choice question for the human reviewer.",
        temperature=0.1,
        max_tokens=2048,
    )

    if not raw:
        return {"recommendation": "uncertain", "confidence": 0.0, "reason_text": "LLM screening failed"}

    decision = raw.get("decision", "uncertain")

    if decision == "needs_clarification" and raw.get("clarification"):
        clar = raw["clarification"]
        return {
            "recommendation": "needs_clarification",
            "confidence": float(raw.get("confidence", 0.0)),
            "reason_text": raw.get("reason", ""),
            "reason_code": raw.get("reason_code", ""),
            "evidence_quote": raw.get("evidence_quote", ""),
            "clarification": {
                "question_type": clar.get("question_type", ""),
                "pico_aspect": clar.get("pico_aspect", ""),
                "question_text": clar.get("question_text", ""),
                "context_excerpt": clar.get("context_excerpt", ""),
                "options": clar.get("options", []),
                "interim_decision": clar.get("interim_decision", "uncertain"),
                "interim_reason": clar.get("interim_reason", ""),
            },
        }

    # Normal decision (include/exclude/uncertain)
    recommendation = "included" if decision == "include" else ("excluded" if decision == "exclude" else "uncertain")
    return {
        "recommendation": recommendation,
        "confidence": float(raw.get("confidence", 0.0)),
        "reason_text": raw.get("reason", ""),
        "reason_code": raw.get("reason_code", ""),
        "evidence_quote": raw.get("evidence_quote", ""),
        "quotes": [raw.get("evidence_quote")] if raw.get("evidence_quote") else [],
    }
```

**Fallback:** If the LLM call fails entirely, return `{"recommendation": "uncertain", ...}` — no question is generated, study goes to normal human review.

---

## Part 3 — Re-Evaluation with Human Answer

### New file: `services/clarification_resolver.py`

**Purpose:** When the human answers a clarification question, re-run the LLM screening with the human's answer incorporated as additional context, producing a final definitive decision.

**Function:** `resolve_clarification(question_id, answer, answer_label, answer_freetext, db=None) -> dict`

**How it works:**

1. Load the clarification question from DB (gets study_id, question_type, context_excerpt, interim_reason).
2. Load the study's title and abstract.
3. Load the project's PICO criteria.
4. Call the LLM with a re-evaluation prompt that includes:
   - The original study text
   - The PICO criteria
   - The question that was asked
   - The human's answer
5. The LLM returns a final decision (include/exclude) with high confidence, since the ambiguity is now resolved.
6. Store the final decision in the clarification_questions table.
7. Record a screening_decisions row with `reviewer_id="ai_reviewer"`, `reason_text` including `[CLARIFIED BY HUMAN: {answer_label}]`.
8. Update the study's `screening_status` to the final decision.
9. Check for conflicts with existing human decisions (using the shared conflict-detection helper).

**Re-evaluation prompt:**

```python
RESOLUTION_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention/Index Test: {intervention}
Comparator: {comparator}
Outcome: {outcome}

Study:
Title: {title}
Abstract: {abstract}

Previous AI assessment:
- The AI was uncertain about: {question_type} ({pico_aspect})
- AI's question: {question_text}
- AI's interim reason: {interim_reason}

Human reviewer's answer: {answer_label}
{answer_freetext_section}

Based on the PICO criteria AND the human reviewer's clarification, make a definitive screening decision.
The human's answer resolves the specific ambiguity the AI identified. Use it to make a confident decision now.

Return JSON:
{{
  "decision": "include" | "exclude",
  "confidence": 0.0-1.0,
  "reason": "Justification incorporating the human's answer",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote"
}}
"""
```

**Edge case — AI still uncertain after answer:** If the LLM returns "uncertain" even after the human's answer (rare, but possible if the answer was "Unsure" or "Partially matches"), the study stays as `screening_status="uncertain"` and goes to normal human review. The clarification question is marked as `status="answered"` with `final_decision="uncertain"`.

**Edge case — "Other" free-text answer:** If the human selected "Other" and provided free-text, the free-text is included in the re-evaluation prompt as: `Additional context from reviewer: "{freetext}"`. The AI uses this context to make its decision.

---

## Part 4 — API Endpoints

### New file: `routers/clarification.py`

**Router prefix:** `/api`, tags: `["clarification"]`

**Endpoints:**

#### 1. `GET /projects/{project_id}/clarifications`
List all clarification questions for a project.

**Query params:**
- `status` (optional): Filter by `pending`, `answered`, `expired`, or `all` (default: `pending`)

**Response:**
```python
class ClarificationQuestionResponse(BaseModel):
    question_id: str
    study_id: str
    project_id: str
    stage: str
    question_type: str
    pico_aspect: str
    question_text: str
    options: list[dict]  # [{"value": "...", "label": "..."}, ...]
    context_excerpt: str
    ai_interim_decision: str
    ai_interim_reason: str
    status: str
    answer: str = ""
    answer_label: str = ""
    answered_by: str = ""
    answered_at: str = ""
    final_decision: str = ""
    final_confidence: float = 0.0
    final_reason_text: str = ""
    created_at: str = ""
    # Joined study fields for UI display:
    study_title: str = ""
    study_authors: str = ""
    study_abstract: str = ""
```

#### 2. `GET /clarifications/{question_id}`
Get a single clarification question with full details (including study abstract for context).

#### 3. `POST /clarifications/{question_id}/answer`
Submit an answer to a clarification question. Triggers AI re-evaluation.

**Request body:**
```python
class ClarificationAnswerRequest(BaseModel):
    answer: str           # the selected option value
    answer_label: str = ""  # the selected option label
    answer_freetext: str = ""  # if "Other" was selected
    answered_by: str = ""  # reviewer ID/name
```

**Response:**
```python
class ClarificationAnswerResponse(BaseModel):
    question_id: str
    study_id: str
    status: str  # "answered"
    final_decision: str  # "included" | "excluded" | "uncertain"
    final_confidence: float
    final_reason_text: str
    conflict_detected: bool  # if AI decision conflicts with existing human decision
    human_decision: Optional[str]  # existing human decision if any
```

**Implementation:**
1. Validate the question exists and is `status="pending"`.
2. Store the answer in the `clarification_questions` row.
3. Call `clarification_resolver.resolve_clarification()`.
4. Store the final decision.
5. Record a `screening_decisions` row for the AI reviewer.
6. Run conflict detection against existing human decisions.
7. Update study `screening_status`.
8. Return the response.

#### 4. `POST /projects/{project_id}/clarifications/batch-answer`
Answer multiple questions at once (for when the human wants to quickly clear the queue).

**Request body:**
```python
class BatchClarificationAnswerRequest(BaseModel):
    answers: list[dict]  # [{"question_id": "...", "answer": "...", "answer_label": "...", "answer_freetext": ""}, ...]
    answered_by: str = ""
```

**Response:** List of `ClarificationAnswerResponse` objects.

#### 5. `GET /projects/{project_id}/clarifications/stats`
Summary counts for the clarification queue.

**Response:**
```python
class ClarificationStatsResponse(BaseModel):
    project_id: str
    pending: int
    answered: int
    expired: int
    by_type: dict  # {"study_design": 3, "population_match": 1, ...}
    by_stage: dict  # {"ta": 4, "ft": 0}
```

#### 6. `DELETE /clarifications/{question_id}`
Dismiss a clarification question without answering (marks as `status="expired"`, study goes to normal "uncertain" human review).

**Query param:** `dismiss_reason: str = ""` (optional — why the human dismissed it)

### Register router in `main.py`:
```python
from routers import clarification
app.include_router(clarification.router)
```

---

## Part 5 — Batch Screening Integration

### Modified: `routers/screening.py` or `routers/studies.py`

The batch AI screening endpoint (from the related plan: `POST /projects/{project_id}/screening/batch-ai-screen`) needs to use `screen_with_clarification()` instead of the plain `screen_title_abstract_with_llm()`.

**Modified batch screening flow:**

```python
@router.post("/projects/{project_id}/screening/batch-ai-screen")
async def batch_ai_screen(project_id, stage="ta", conn=Depends(get_db)):
    # Load signals (from related plan's signal cache)
    signals = load_signals(project_id, conn)

    # Get all pending studies
    pending_studies = get_pending_studies(project_id, conn)

    results = {"included": 0, "excluded": 0, "uncertain": 0, "clarifications_generated": 0}

    for study in pending_studies:
        title = study["title"]
        abstract = study["abstract"]

        # Run pre-filter (from related plan)
        prefilter = prefilter_study(title, abstract, signals, stage)

        # Run screening with clarification support
        screen_result = screen_with_clarification(
            title, abstract, pico, exclusion_reasons, stage, signals
        )

        if screen_result["recommendation"] == "needs_clarification":
            # Store clarification question
            clar = screen_result["clarification"]
            question_id = str(uuid.uuid4())
            conn.insert("clarification_questions", {
                "question_id": question_id,
                "study_id": study["study_id"],
                "project_id": project_id,
                "stage": stage,
                "question_type": clar["question_type"],
                "pico_aspect": clar["pico_aspect"],
                "question_text": clar["question_text"],
                "options_json": json.dumps(clar["options"]),
                "context_excerpt": clar["context_excerpt"],
                "ai_interim_decision": clar["interim_decision"],
                "ai_interim_reason": clar["interim_reason"],
                "status": "pending",
            })

            # Update study status
            conn.update("studies", study["study_id"], {
                "screening_status": "awaiting_clarification"
            })
            results["clarifications_generated"] += 1

        else:
            # Normal decision — apply safety net, record decision
            # (same as related plan's AI-reviewer integration)
            final = apply_overrides(screen_result, prefilter, signals, stage)
            record_ai_decision(study["study_id"], project_id, stage, final, conn)
            results[final["recommendation"]] += 1

    conn.commit()

    return {
        "project_id": project_id,
        "total_screened": len(pending_studies),
        **results,
        "message": f"Screened {len(pending_studies)} studies. {results['clarifications_generated']} need clarification.",
    }
```

**Single-study screening:** The existing `POST /studies/{id}/ai-screen-title-abstract` endpoint should also be updated to use `screen_with_clarification()`. When a clarification is generated for a single study, the response includes the `clarification` object so the frontend can display the question immediately.

---

## Part 6 — Models (Pydantic)

### New models in `models.py`:

```python
class ClarificationOption(BaseModel):
    value: str
    label: str

class ClarificationData(BaseModel):
    question_type: str  # study_design | population_match | intervention_match | outcome_match
    pico_aspect: str
    question_text: str
    options: list[ClarificationOption]
    context_excerpt: str = ""
    interim_decision: str = "uncertain"
    interim_reason: str = ""

class ClarificationQuestionResponse(BaseModel):
    question_id: str
    study_id: str
    project_id: str
    stage: str
    question_type: str
    pico_aspect: str = ""
    question_text: str
    options: list[ClarificationOption] = []
    context_excerpt: str = ""
    ai_interim_decision: str = ""
    ai_interim_reason: str = ""
    status: str = "pending"
    answer: str = ""
    answer_label: str = ""
    answered_by: str = ""
    answered_at: str = ""
    final_decision: str = ""
    final_confidence: float = 0.0
    final_reason_text: str = ""
    created_at: str = ""
    # Joined study fields
    study_title: str = ""
    study_authors: str = ""
    study_abstract: str = ""

class ClarificationAnswerRequest(BaseModel):
    answer: str
    answer_label: str = ""
    answer_freetext: str = ""
    answered_by: str = ""

class ClarificationAnswerResponse(BaseModel):
    question_id: str
    study_id: str
    status: str
    final_decision: str
    final_confidence: float
    final_reason_text: str
    conflict_detected: bool = False
    human_decision: Optional[str] = None

class ClarificationStatsResponse(BaseModel):
    project_id: str
    pending: int
    answered: int
    expired: int
    by_type: dict = {}
    by_stage: dict = {}

class BatchClarificationAnswerRequest(BaseModel):
    answers: list[ClarificationAnswerRequest]
    answered_by: str = ""
```

### Updated `AiScreenResult` (add clarification field):

```python
class AiScreenResult(BaseModel):
    study_id: str
    recommendation: str  # included | excluded | uncertain | needs_clarification
    confidence: float
    reason_code: str = ""
    reason_text: str = ""
    rationale: str = ""
    quotes: list[str] = []
    # From related plan:
    prefilter_flag: str = "clear"
    confidence_ceiling: float = 1.0
    override_notes: list[str] = []
    conflict_detected: bool = False
    human_decision: Optional[str] = None
    # New for this plan:
    clarification: Optional[ClarificationData] = None
```

---

## Part 7 — Frontend Changes

### `lib/api.ts` — New API methods and types

```typescript
export interface ClarificationOption {
  value: string;
  label: string;
}

export interface ClarificationQuestion {
  question_id: string;
  study_id: string;
  project_id: string;
  stage: string;
  question_type: string;
  pico_aspect: string;
  question_text: string;
  options: ClarificationOption[];
  context_excerpt: string;
  ai_interim_reason: string;
  status: string;
  answer?: string;
  answer_label?: string;
  final_decision?: string;
  final_confidence?: number;
  final_reason_text?: string;
  created_at: string;
  study_title: string;
  study_authors: string;
  study_abstract: string;
}

export interface ClarificationAnswerResponse {
  question_id: string;
  study_id: string;
  status: string;
  final_decision: string;
  final_confidence: number;
  final_reason_text: string;
  conflict_detected: boolean;
  human_decision: string | null;
}

// API methods
listClarifications: (projectId: string, status?: string) =>
  request<ClarificationQuestion[]>(`/projects/${projectId}/clarifications?status=${status || 'pending'}`),

answerClarification: (questionId: string, data: { answer: string; answer_label?: string; answer_freetext?: string; answered_by?: string }) =>
  request<ClarificationAnswerResponse>(`/clarifications/${questionId}/answer`, { method: "POST", body: JSON.stringify(data) }),

batchAnswerClarifications: (projectId: string, answers: any[], answeredBy?: string) =>
  request<ClarificationAnswerResponse[]>(`/projects/${projectId}/clarifications/batch-answer`, { method: "POST", body: JSON.stringify({ answers, answered_by: answeredBy }) }),

dismissClarification: (questionId: string, reason?: string) =>
  request<any>(`/clarifications/${questionId}?dismiss_reason=${reason || ''}`, { method: "DELETE" }),

clarificationStats: (projectId: string) =>
  request<any>(`/projects/${projectId}/clarifications/stats`),
```

### `ScreeningPage.tsx` — Clarification queue UI

**New UI elements:**

1. **Clarification badge** in the page header (next to the screening summary):
   - Shows count of pending clarifications as a red badge on a "HelpCircle" icon
   - Clicking opens the clarification panel
   - Polls every 5 seconds for new questions (using `useQuery` with `refetchInterval: 5000` when there are pending studies with `screening_status === "awaiting_clarification"`)

2. **Clarification panel** (slide-out or modal):
   - Lists pending questions as cards
   - Each card shows:
     - Study title and authors
     - Question type badge (color-coded: blue=study_design, purple=population, green=intervention, orange=outcome)
     - The question text
     - Context excerpt from the abstract (in a grey blockquote)
     - AI's interim reason ("I'm uncertain because...")
     - Multiple-choice options as clickable buttons
     - "Other (specify)" option with a text input that appears when selected
   - When an option is clicked:
     - Button highlights as selected
     - "Submit Answer" button appears
     - On submit: calls `answerClarification()`, shows loading spinner
     - On response: shows AI's final decision with confidence bar and reason
     - Card collapses with result badge (green=included, red=excluded, yellow=uncertain)
   - "Dismiss" button per card (with optional reason text)

3. **Batch answer mode:**
   - "Answer All" button that lets the human quickly go through all pending questions
   - Shows questions one at a time in a focused view with "Next" / "Previous" navigation
   - Progress indicator: "Question 2 of 5"

4. **Single-study AI screening result:**
   - When `POST /studies/{id}/ai-screen-title-abstract` returns `recommendation: "needs_clarification"`:
     - Show the clarification question inline in the AI screening result panel
     - Options appear as buttons right there
     - Human can answer without opening the separate clarification panel
     - On answer, calls `answerClarification()` and shows the final decision

5. **Screening summary enhancement:**
   - Add "Awaiting Clarification" count to the summary stats
   - Show as a distinct color (amber/orange) in the summary bar

---

## Part 8 — Screening Summary Enhancement

### Modified: `GET /projects/{project_id}/screening/summary` in `routers/screening.py`

Add to the response:
```python
awaiting_clarification = conn.execute(
    "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'awaiting_clarification'",
    (project_id,),
).fetchone()["c"]

clarifications_pending = conn.execute(
    "SELECT COUNT(*) as c FROM clarification_questions WHERE project_id = ? AND status = 'pending'",
    (project_id,),
).fetchone()["c"]

clarifications_answered = conn.execute(
    "SELECT COUNT(*) as c FROM clarification_questions WHERE project_id = ? AND status = 'answered'",
    (project_id,),
).fetchone()["c"]
```

Add to response dict: `awaiting_clarification`, `clarifications_pending`, `clarifications_answered`.

---

## Part 9 — Question Type Specifications

### Study Design Question

**Trigger:** AI cannot determine the study design from the abstract, or the design is ambiguous (e.g., "prospective study" could be cohort or RCT).

**Question format:**
``"What study design is this study?"``
**Options:**
- `{"value": "rct", "label": "Randomized controlled trial"}`
- `{"value": "cohort", "label": "Cohort study"}`
- `{"value": "case_control", "label": "Case-control study"}`
- `{"value": "cross_sectional", "label": "Cross-sectional study"}`
- `{"value": "case_report", "label": "Case report / case series"}`
- `{"value": "systematic_review", "label": "Systematic review / meta-analysis"}`
- `{"value": "other", "label": "Other (specify)"}`

**How answer is used:** Check against inclusion criteria's study type requirements. If the inclusion criteria require RCTs and the human says "cohort", the AI excludes. If the human says "rct", the AI includes (if other criteria met).

### Population Match Question

**Trigger:** The study population partially matches the inclusion criteria but isn't clearly in or out of scope (e.g., inclusion criteria says "heart failure" and the study says "heart failure with preserved EF" — is that in scope?).

**Question format:**
``"The study includes patients with '{study_population}'. Does this match your population criterion of '{inclusion_population}'?"``
**Options:**
- `{"value": "yes", "label": "Yes, matches"}`
- `{"value": "no", "label": "No, doesn't match"}`
- `{"value": "partial", "label": "Partially matches"}`
- `{"value": "unsure", "label": "Unsure"}`
- `{"value": "other", "label": "Other (specify)"}`

**How answer is used:** "Yes" → proceed with other criteria checks. "No" → exclude with `reason_code="wrong_population"`. "Partial" or "Unsure" → mark as "uncertain" for full human review.

### Intervention/Test Match Question

**Trigger:** The abstract mentions multiple interventions or tests, and it's unclear which is the index test for the review (e.g., "MRI and CT were performed" — is MRI the index test and CT the comparator, or vice versa?).

**Question format:**
``"The abstract mentions these interventions/tests: {list}. Which is the index test for your review?"``
**Options:** Dynamically generated from the interventions mentioned in the abstract, plus:
- `{"value": "none", "label": "None of these"}`

**How answer is used:** If the selected intervention matches the inclusion criteria's index_test → proceed. If "None" → exclude with `reason_code="wrong_index_test"`.

### Outcome Match Question

**Trigger:** The study reports a composite or related outcome that may or may not meet the inclusion criteria (e.g., inclusion criteria says "all-cause mortality" and the study reports "composite of cardiovascular death and hospitalization").

**Question format:**
``"This study reports '{study_outcome}'. Does this meet your outcome criterion of '{inclusion_outcome}'?"``
**Options:**
- `{"value": "yes", "label": "Yes, meets criterion"}`
- `{"value": "no", "label": "No, doesn't meet"}`
- `{"value": "partial", "label": "Partially meets"}`
- `{"value": "unsure", "label": "Unsure"}`
- `{"value": "other", "label": "Other (specify)"}`

**How answer is used:** "Yes" → proceed with other criteria. "No" → exclude with `reason_code="wrong_outcome"`. "Partial" or "Unsure" → "uncertain" for human review.

---

## Part 10 — Test Cases

### New file: `tests/test_clarification.py`

**Fixture setup (same pattern as existing tests):**
```python
@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_clar.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def project(client):
    r = client.post("/api/projects", json={"name": "Clarification Test"})
    return r.json()["project_id"]

@pytest.fixture
def project_with_pico(client, project):
    client.put(f"/api/projects/{project}/pico", json={
        "population": "patients with heart failure",
        "index_test": "SGLT2 inhibitors",
        "comparator": "placebo",
        "outcome": "all-cause mortality",
    })
    return project
```

**Question Generation:**
1. `test_screen_returns_needs_clarification` — Study with ambiguous design → `screen_with_clarification()` returns `recommendation="needs_clarification"` with a valid `clarification` object
2. `test_clarification_has_valid_options` — Generated question has ≥2 options, each with `value` and `label`
3. `test_clarification_has_context_excerpt` — Generated question includes a non-empty `context_excerpt` from the abstract
4. `test_screen_returns_definitive_when_confident` — Study clearly matches/excludes → returns `include` or `exclude`, no clarification
5. `test_screen_returns_uncertain_when_vague` — Abstract too short/vague → returns `uncertain`, no clarification (no specific question possible)
6. `test_clarification_study_design_type` — Ambiguous design → `question_type="study_design"` with standard design options
7. `test_clarification_population_match_type` — Partial population match → `question_type="population_match"` with yes/no/partial options
8. `test_clarification_intervention_match_type` — Multiple interventions mentioned → `question_type="intervention_match"` with specific intervention options
9. `test_clarification_outcome_match_type` — Composite outcome → `question_type="outcome_match"` with yes/no/partial options
10. `test_clarification_llm_fallback` — LLM fails → returns `uncertain`, no clarification generated

**API Endpoints:**
11. `test_list_clarifications_empty` — `GET /projects/{id}/clarifications` on fresh project → empty list
12. `test_list_clarifications_pending` — After batch screening generates questions → list shows pending questions
13. `test_list_clarifications_filter_by_status` — `?status=answered` → only answered questions
14. `test_get_single_clarification` — `GET /clarifications/{id}` → full question with study fields
15. `test_answer_clarification` — `POST /clarifications/{id}/answer` with a valid option → `status="answered"`, `final_decision` set
16. `test_answer_updates_study_status` — After answering, study `screening_status` updated from `awaiting_clarification` to final decision
17. `test_answer_records_screening_decision` — After answering, `screening_decisions` has a row with `reviewer_id="ai_reviewer"` and `[CLARIFIED BY HUMAN]` in reason
18. `test_answer_with_freetext` — Answer with `answer_freetext` → AI re-evaluation includes the free-text context
19. `test_answer_other_option` — Select "Other" with free-text → works correctly, AI uses free-text
20. `test_answer_unsure_option` — Select "Unsure" → final decision is "uncertain", study goes to human review
21. `test_batch_answer` — `POST /projects/{id}/clarifications/batch-answer` with 3 answers → all 3 resolved
22. `test_dismiss_clarification` — `DELETE /clarifications/{id}` → status="expired", study goes to "uncertain"
23. `test_clarification_stats` — `GET /projects/{id}/clarifications/stats` → correct counts by status, type, stage
24. `test_answer_already_answered_question` — Answering a question that's already `status="answered"` → 400 error
25. `test_answer_nonexistent_question` — `POST /clarifications/badid/answer` → 404

**Batch Screening Integration:**
26. `test_batch_screen_generates_clarifications` — Batch screen 5 studies where 2 are ambiguous → 2 clarification questions created, 3 definitive decisions recorded
27. `test_batch_screen_summary_counts` — Batch screen summary includes `clarifications_generated` count
28. `test_batch_screen_sets_awaiting_status` — Studies with clarification questions have `screening_status="awaiting_clarification"`
29. `test_single_screen_returns_clarification` — `POST /studies/{id}/ai-screen-title-abstract` on ambiguous study → response includes `clarification` object
30. `test_clarification_then_answer_flow` — Full flow: batch screen generates question → human answers → study gets final decision → no recheck needed

**Conflict Detection:**
31. `test_clarification_answer_conflicts_with_human` — Human previously screened "included", AI (after clarification) says "excluded" → conflict detected
32. `test_clarification_answer_agrees_with_human` — Human and AI (after clarification) agree → no conflict, study status updated

**Screening Summary:**
33. `test_summary_includes_clarification_counts` — Summary includes `awaiting_clarification`, `clarifications_pending`, `clarifications_answered`

---

## New Files Summary

| File | Purpose |
|------|---------|
| `services/clarification_generator.py` | Modified LLM screening prompt that generates multiple-choice questions when uncertain |
| `services/clarification_resolver.py` | Re-evaluates study with human's answer to produce final decision |
| `routers/clarification.py` | API endpoints for listing, answering, dismissing, and stats |
| `tests/test_clarification.py` | 33 test cases covering question generation, API, batch integration, conflicts |

## Modified Files Summary

| File | Changes |
|------|---------|
| `database.py` | Add `clarification_questions` table + indexes; add to `reset_db()` drop list |
| `models.py` | Add `ClarificationOption`, `ClarificationData`, `ClarificationQuestionResponse`, `ClarificationAnswerRequest`, `ClarificationAnswerResponse`, `ClarificationStatsResponse`, `BatchClarificationAnswerRequest`; update `AiScreenResult` with optional `clarification` field |
| `main.py` | Register `clarification.router` |
| `routers/studies.py` | Update `ai-screen-title-abstract` to use `screen_with_clarification()`; return `clarification` in response when generated |
| `routers/screening.py` | Update batch screening to use `screen_with_clarification()`; add `awaiting_clarification` count to summary |
| `frontend/src/lib/api.ts` | Add `ClarificationQuestion` interface, `ClarificationAnswerResponse` interface, and 5 new API methods |
| `frontend/src/pages/ScreeningPage.tsx` | Add clarification badge, clarification panel, inline question display, batch answer mode, polling for new questions |

---

## Implementation Order

1. **Database schema** — add `clarification_questions` table to `database.py`
2. **Models** — add all Pydantic models to `models.py`
3. **Clarification generator** — `services/clarification_generator.py` with modified LLM prompt
4. **Clarification resolver** — `services/clarification_resolver.py` with re-evaluation prompt
5. **API endpoints** — `routers/clarification.py`, register in `main.py`
6. **Single-study screening integration** — modify `routers/studies.py` `ai-screen-title-abstract`
7. **Batch screening integration** — modify `routers/screening.py` batch endpoint
8. **Screening summary** — add clarification counts to summary endpoint
9. **Tests** — `tests/test_clarification.py` (33 test cases)
10. **Run full test suite** — ensure all existing 548+ tests still pass
11. **Frontend** — `lib/api.ts` types and methods, `ScreeningPage.tsx` clarification UI
12. **Git commit and push**

---

## Assumptions

1. **One question per study per screening pass:** The AI generates at most one clarification question per study. If multiple aspects are uncertain, it picks the most decision-critical one. This prevents question fatigue and keeps the pipeline moving.
2. **Human + AI model:** This plan assumes the "dual" screening model is one human reviewer + one AI reviewer (as decided in the related plan). The clarification feature is the AI asking the human for help, not a second AI.
3. **LLM availability:** The clarification generator and resolver both use `ToolCallingClient.call_with_tool()`. If the LLM is unavailable, the screening falls back to "uncertain" (no question generated) and the resolver falls back to "uncertain" (study goes to human review).
4. **Polling for new questions:** The frontend polls every 5 seconds for new clarification questions when there are studies with `awaiting_clarification` status. No WebSocket/SSE needed — polling is sufficient for this use case since batch screening typically processes studies in a few seconds each.
5. **Clarification questions are per-stage:** A study can have separate clarification questions for TA and FT stages. The `stage` field in the `clarification_questions` table distinguishes them.
6. **Answered questions are immutable:** Once a question is answered and the AI has made its final decision, the answer cannot be changed. If the human disagrees with the AI's final decision after answering, they can override it via the normal screening decision endpoint.
7. **Expired questions:** If a human dismisses a question (DELETE endpoint), the study goes to `screening_status="uncertain"` for normal human review. The question is marked `status="expired"` and is no longer actionable.
8. **Cross-reference with related plan:** This plan assumes the signal pre-filter, safety net, and AI-reviewer integration from `plan_screening_extraction_gaps.md` are implemented. The clarification feature integrates with those: the pre-filter runs first, then the clarification-aware screening runs, then the safety net applies to the final decision.
9. **Backward compatibility:** Existing screening endpoints that don't use clarification continue to work. The `needs_clarification` recommendation is a new value that older callers will see as "uncertain" (they just won't see the `clarification` object).
10. **Test fixtures:** New test file uses the same fixture pattern as existing tests (`fresh_db`, `client`, `project` autouse fixtures with tmp_path database).
