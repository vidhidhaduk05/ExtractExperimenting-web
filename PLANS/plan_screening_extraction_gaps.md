# VDExtract: Screening & Extraction Quality Gap Fixes

## Summary

Seven gaps in VDExtract's AI-assisted systematic review pipeline need to be filled. The screening side needs signal-based pre-filtering, a PICO hard-override safety net, and AI-reviewer integration with the existing human conflict-detection infrastructure (one human + one LLM, not two LLMs). The extraction side needs a structured confidence taxonomy, an exhaustive multi-location search strategy with recheck pass, five universal gap rules, and standardized missing-data codes with color highlighting.

**Repo:** `/workspace/VDExtract` (backend: `radextract_platform/backend/`, frontend: `radextract_platform/frontend/`)
**Python venv:** `/workspace/.venv/bin/python`
**Test command:** `cd /workspace/VDExtract/radextract_platform/backend && /workspace/.venv/bin/python -m pytest tests/ -q --tb=short`
**Graphify map:** `/mnt/user-uploads/graphify_codebase_map.md` — ALWAYS USE GRAPHIFY TO NAVIGATE THE CODE
**Git push:** `git push https://vidhidhaduk05:<PAT>@github.com/vidhidhaduk05/VDExtract.git main` (PAT at `/mnt/user-uploads/fine-grained token all repo.txt`, read with `tr -d '[:space:]'`)

---

## Part A — Screening: Signals, Safety Net, AI-Reviewer Integration

### A1. Signal Generation Service (Hybrid: MeSH + LLM)

**New file:** `services/signal_generator.py`

**Purpose:** Before screening begins, generate topic-specific signal lists from the project's PICO criteria and inclusion/exclusion reasons. These signals power the pre-filter and safety net.

**Function:** `generate_signals(project_id, db=None) -> dict`

**How it works (hybrid approach):**

1. **Baseline from existing infrastructure:** Load the project's PICO from `pico_json`. For each PICO element (population, index_test/intervention, comparator, outcome), look up corresponding terms in `MESH_MAPPING` and `SYNONYM_MAP` from `services/search_string_generator.py`. These form the baseline signal lists.

2. **LLM augmentation:** One `ToolCallingClient.call_with_tool()` call with a prompt that sends the PICO, inclusion criteria, and exclusion criteria, asking the LLM to return JSON with:
   ```json
   {
     "population_signals": ["heart failure", "hfrEF", "reduced ejection fraction", ...],
     "intervention_signals": ["sglt2 inhibitor", "empagliflozin", "dapagliflozin", ...],
     "study_type_signals": ["randomized", "rct", "controlled trial", ...],
     "hard_exclude_signals": ["animal model", "pediatric", "case report", ...],
     "lenient_outcome_signals": ["mortality", "death", "survival", "hospitalization", ...],
     "strict_outcome_signals": ["all-cause mortality", "cardiovascular death", ...]
   }
   ```

3. **Merge:** Combine baseline (MeSH/synonym) signals with LLM-generated signals, deduplicate, lowercase all terms.

4. **Add universal signals** (always active regardless of topic):
   - `UNIVERSAL_EDITORIAL_SIGNALS`: `["editorial", "letter to the editor", "commentary", "erratum", "correction", "retraction"]`
   - `UNIVERSAL_ANIMAL_SIGNALS`: `["mouse model", "rat model", "murine", "animal model", "in vitro"]`

5. **Cache:** Store the merged signal dict as JSON in the `projects` table (new column `signals_json TEXT DEFAULT ''`). Subsequent screening calls load from cache; a `force_regenerate` flag triggers re-generation.

**Fallback:** If the LLM call fails, use only the MeSH/synonym baseline signals. Log a warning.

**New models in `models.py`:**
```python
class SignalSet(BaseModel):
    population_signals: list[str] = []
    intervention_signals: list[str] = []
    study_type_signals: list[str] = []
    hard_exclude_signals: list[str] = []
    lenient_outcome_signals: list[str] = []
    strict_outcome_signals: list[str] = []

class SignalSetResponse(BaseModel):
    project_id: str
    signals: SignalSet
    generated_at: str = ""
    source: str = ""  # "hybrid" | "mesh_only_fallback"
```

**New endpoints in `routers/screening.py`:**
- `POST /projects/{project_id}/signals/generate` — generates and caches signals, returns `SignalSetResponse`. Optional query param `force=true` to regenerate.
- `GET /projects/{project_id}/signals` — returns cached signals or 404 if not yet generated.

**Database change:** Add column `signals_json TEXT DEFAULT ''` to `projects` table via `ALTER TABLE` migration in `database.py` (in the `_run_migrations()` function or equivalent, using `ALTER TABLE projects ADD COLUMN signals_json TEXT DEFAULT ''` wrapped in try/except for idempotency).

---

### A2. Signal-Based Pre-Filter

**New file:** `services/signal_prefilter.py`

**Purpose:** Before running the LLM screening call, check each study against the signal lists for quick triage and confidence ceilings.

**Function:** `prefilter_study(title, abstract, signals, stage="ta") -> dict`

**Returns:**
```python
{
    "population_matches": int,       # count of population signals found in title+abstract
    "intervention_matches": int,     # count of intervention signals found
    "hard_exclude_matches": list[str],  # which hard-exclude signals triggered
    "outcome_matches": int,          # count of outcome signals (lenient for TA, strict for FT)
    "has_abstract": bool,
    "abstract_word_count": int,
    "confidence_ceiling": float,     # max confidence allowed for this record
    "prefilter_flag": str,           # "clear" | "weak_signals" | "hard_exclude_hit" | "no_abstract" | "short_abstract"
}
```

**Logic:**
- Search for each signal term in `title + " " + abstract` (case-insensitive, word-boundary matching using `re.search(r'\b' + re.escape(term) + r'\b', text_lower)`)
- **No abstract** → `confidence_ceiling = 0.40`, `prefilter_flag = "no_abstract"`
- **Abstract < 80 words** → `confidence_ceiling = 0.55`, `prefilter_flag = "short_abstract"`
- **Hard-exclude signal matched** → `prefilter_flag = "hard_exclude_hit"` (safety net will force EXCLUDE)
- **Zero population matches AND zero intervention matches** → `prefilter_flag = "weak_signals"` (safety net will force EXCLUDE if LLM says INCLUDE)
- **Otherwise** → `confidence_ceiling = 1.0`, `prefilter_flag = "clear"`

---

### A3. PICO Hard-Override Safety Net

**New file:** `services/safety_net.py`

**Purpose:** After the LLM returns a screening decision, apply safety-net rules that can override the LLM's decision based on pre-filter results.

**Function:** `apply_overrides(llm_result, prefilter_result, signals, stage="ta") -> dict`

**Takes:** The LLM screening result dict (recommendation, confidence, reason_text, etc.) and the pre-filter result dict.

**Returns:** Modified dict with potentially overridden `recommendation`, `confidence`, and appended `override_note` in `reason_text`.

**Rules (applied in order):**

1. **Hard-exclude override:** If `prefilter_flag == "hard_exclude_hit"` → force `recommendation = "excluded"`, append `"[SAFETY-NET: Hard-exclude signal '{term}' matched]"` to reason_text. Regardless of LLM decision.

2. **Weak-signals override:** If `prefilter_flag == "weak_signals"` AND `llm_result.recommendation == "included"` → force `recommendation = "uncertain"`, append `"[SAFETY-NET: Zero population/intervention signals — downgraded to uncertain]"`. (Don't force exclude — let human review.)

3. **Confidence ceiling:** If `llm_result.confidence > prefilter_result.confidence_ceiling` → cap confidence to ceiling, append `"[SAFETY-NET: Confidence capped to {ceiling} due to {flag}]"`.

4. **LLM failure:** If `llm_result.recommendation == "uncertain"` and `llm_result.reason_text == "LLM screening failed"` → set `recommendation = "uncertain"`, append `"[LLM-FAIL]"`, ensure confidence = 0.0. Always goes to human review.

5. **R1=EXCLUDE + R2=INCLUDE conflict (for human+AI mode):** If the AI says "excluded" but an existing human decision says "included" (or vice versa), this is handled by the existing conflict detection in `screening_decisions` — no additional logic needed here, but the response should include `conflict_detected: true`.

6. **Full-text specific:** If `stage == "ft"` and no PDF text was available (abstract-only screening) → `confidence_ceiling = 0.45`, append `"[SAFETY-NET: Full-text screened from abstract only — no PDF text available]"`.

---

### A4. AI-Reviewer Integration (Human + LLM)

**Modified files:** `routers/studies.py`, `services/llm_extractor.py`

**Current state:** `POST /studies/{id}/ai-screen-fulltext` and `POST /studies/{id}/ai-screen-title-abstract` return suggestions but do NOT record decisions in `screening_decisions`. The existing `screening_decisions` table and conflict detection in `routers/screening.py` already auto-detect conflicts when 2+ reviewers disagree.

**Changes:**

1. **Modify `POST /studies/{id}/ai-screen-title-abstract`** in `routers/studies.py`:
   - After getting the LLM result, run it through `prefilter_study()` and `apply_overrides()`
   - Add optional query param `record_decision: bool = True` (default true)
   - If `record_decision=true`, insert a `screening_decisions` row with `reviewer_id="ai_reviewer"`, `reviewer_name="AI Reviewer"`, `decision=<final recommendation>`, `stage="ta"`, `reason_code=<from LLM>`, `reason_text=<LLM reason + override notes>`
   - The existing conflict detection logic in `create_screening_decision()` fires automatically when a human reviewer also screens this study — BUT since we're inserting directly, we need to replicate the conflict check here. Extract the conflict-detection logic from `create_screening_decision()` into a shared helper `_check_and_record_conflict(conn, study_id, project_id, stage)` in `routers/screening.py` and call it after inserting the AI decision.
   - Response includes: `recommendation`, `confidence`, `reason_text`, `reason_code`, `quotes`, `prefilter_flag`, `override_notes` (list), `conflict_detected` (bool), `human_decision` (str or null if no human has screened yet)

2. **Modify `POST /studies/{id}/ai-screen-fulltext`** in `routers/studies.py`:
   - Same changes as above but `stage="ft"`
   - Additionally check if PDF text was available; if not, apply the FT-specific safety net rule
   - Use `strict_outcome_signals` instead of `lenient_outcome_signals` in the pre-filter

3. **New endpoint: `POST /projects/{project_id}/screening/batch-ai-screen`** in `routers/screening.py`:
   - Screens all pending studies in a project (optional `stage` query param, default "ta")
   - For each study: load signals (from cache or generate), run pre-filter, run LLM screening, apply safety net, record decision
   - Returns a summary: `{total_screened, included, excluded, uncertain, conflicts, overrides_applied}`
   - This is a long-running operation — consider making it async or running in background for large projects
   - Rate-limit LLM calls to avoid overwhelming the API (use existing `rate_limiter.py`)

4. **Update `AiScreenResult` in `models.py`:**
   ```python
   class AiScreenResult(BaseModel):
       study_id: str
       recommendation: str  # included | excluded | uncertain
       confidence: float
       reason_code: str = ""
       reason_text: str = ""
       rationale: str = ""
       quotes: list[str] = []
       # New fields:
       prefilter_flag: str = "clear"
       confidence_ceiling: float = 1.0
       override_notes: list[str] = []
       conflict_detected: bool = False
       human_decision: Optional[str] = None
       reviewer_id: str = "ai_reviewer"
   ```

5. **Update frontend `AiScreenResult` interface in `lib/api.ts`** to include the new fields.

---

### A5. Screening Summary Enhancement

**Modified:** `GET /projects/{project_id}/screening/summary` in `routers/screening.py`

Add to the response:
- `ai_screened`: count of studies with an `ai_reviewer` decision
- `human_screened`: count of studies with a human reviewer decision
- `ai_human_conflicts`: count of unresolved conflicts between AI and human
- `safety_net_overrides`: count of studies where the safety net changed the LLM's decision

---

## Part B — Extraction: Confidence Taxonomy, Exhaustive Search, Gap Rules, Missing-Data Codes

### B1. Confidence Taxonomy

**Database change:** Add column `confidence_tag TEXT DEFAULT ''` to `extractions` table (migration in `database.py`).

**Tags:**
| Tag | Meaning | When to assign |
|-----|---------|----------------|
| `[DS]` | Directly stated | Value found verbatim in table or text |
| `[INF]` | Inferred | Value logically derived from context (not stated directly) |
| `[CALC]` | Calculated | Arithmetic performed from other found values |
| `[SUP: eTable X]` | From supplementary file | Value found in supplement |
| `[FIG]` | From figure | Value approximated from a figure/graph |
| `[PDF-p.N: "quote"]` | From PDF page N | Value found on specific PDF page with exact quote |

**Modified: `services/llm_extractor.py`**

Update `SYSTEM_PROMPT` to instruct the LLM to also return a `confidence_tag` for each extracted value:
```
5. For every extracted value, assign a confidence tag:
   - [DS] if directly stated verbatim in table or text
   - [INF] if inferred from context
   - [CALC] if calculated from other values (show the calculation)
   - [SUP: eTable X] if from supplementary material
   - [FIG] if approximated from a figure
   - [PDF-p.N: "exact quote"] if from a specific PDF page
```

Update the JSON schema in the prompt to include `"confidence_tag"` field.

Update `extract_variables_with_aide_engine()` to parse and return `confidence_tag` in each result item.

**Modified: `services/auto_extract_service.py`**

In `auto_extract()`, assign confidence tags based on how the value was found:
- LLM result with `source_text` (verbatim quote) → use the LLM's tag, or `[DS]` if not provided
- LLM result without source_text → `[INF]`
- Keyword match in text → `[DS]`
- Keyword match where value was inferred from sentence context → `[INF]`
- Value derived from arithmetic (e.g., `100 - pct_male` for `pct_female`) → `[CALC]` with calculation in source_text
- Value from supplement text → `[SUP: supplement]`

Store `confidence_tag` in the `extractions` table alongside `value`, `confidence`, `source_text`, `source_page`.

**Modified: `models.py`**
- Add `confidence_tag: str = ""` to `ExtractionCreate`, `ExtractionUpdate`, `ExtractionResponse`

**Modified: `routers/extraction.py`**
- Include `confidence_tag` in create/update/list endpoints

---

### B2. Exhaustive Search Strategy (7-Step + Recheck)

**New file:** `services/exhaustive_search.py`

**Purpose:** When the LLM fails to find a value, systematically search multiple locations in the document before marking it as missing.

**Function:** `exhaustive_extract(variable, full_text, pdf_pages=None, supplement_text=None, existing_values=None) -> dict | None`

**7-Step Search (in priority order):**

1. **LLM structured blocks:** Check if the LLM already extracted this variable (from `auto_extract_service.py`'s LLM results). If yes, return with appropriate confidence tag.

2. **Abstract search:** Search the abstract for the variable name and its synonyms (from `VARIABLE_KEYWORDS` in `auto_extract_service.py`). Use word-boundary regex. Return the sentence containing the match.

3. **Table search:** If `pdf_pages` available, search for table-like text (lines with multiple numbers, tab-separated, or pipe-separated). Look for the variable name in table headers or row labels. Use `pdfplumber` table extraction if available (the `docling_extract_service.py` already has table parsing — reuse `_extract_from_table_data()`).

4. **Results text search:** Search the Results section (text between "Results" heading and "Discussion" heading) for the variable and its synonyms.

5. **Supplement search:** If `supplement_text` provided, search it for the variable.

6. **Synonym search:** Repeat steps 2-5 with expanded synonyms. Build synonyms from:
   - `VARIABLE_KEYWORDS` mapping in `auto_extract_service.py`
   - Common abbreviations (e.g., "HR" → "hazard ratio", "CI" → "confidence interval")
   - Variable name split on underscores, each word searched separately

7. **Derivation:** Try to derive the value from already-extracted values using these rules:
   - `pct_female` = `100 - pct_male` (if `pct_male` was found)
   - `total_n` = `n_arm1 + n_arm2` (if both arm sizes found)
   - `sd` = `iqr / 1.35` (if IQR was found, normal approximation)
   - `median_followup_months` = `fixed_horizon_years * 12` (if fixed horizon stated)
   - Tag derived values with `[CALC]` and show the calculation in `source_text`

**Returns:** `{"value": str, "confidence": float, "source_text": str, "source_page": int, "confidence_tag": str}` or `None` if not found after all 7 steps.

**Recheck pass:** `recheck_missing(extractions, full_text, pdf_pages) -> list[dict]`

After all variables are extracted, collect every extraction with value `-99` (not reported). For each, re-read the **single most likely source location** based on field type:

| Field type | Most likely location to recheck |
|---|---|
| Baseline demographics | Table 1 / Baseline characteristics |
| Follow-up duration | Methods > Study follow-up / Statistical analysis |
| Primary outcome HR + CI | Abstract results paragraph |
| Secondary outcomes | Results tables (Table 2/3) |
| Procedural details | Methods > Procedure / Intervention |
| Registration ID | Title page, Methods > Ethics/Registration |
| Funding source | Funding/Acknowledgements (last pages) |
| Subgroup flag | Methods > Study population, first paragraph of Results |

If found on recheck: overwrite `-99` with the value, tag `[RECHECK]`, note the source. If still not found: leave as `-99`.

**Integration into `auto_extract_service.py`:**

In `auto_extract()`, after the LLM extraction pass:
1. For each variable where the LLM didn't find a value, call `exhaustive_extract()`
2. After all variables are processed, call `recheck_missing()` on any remaining `-99` values
3. Log how many values were found by LLM vs exhaustive search vs recheck

---

### B3. Universal Gap Rules (G1-G5)

**New file:** `services/gap_rules.py`

**Purpose:** Apply five universal extraction gap rules that catch common data extraction errors across all clinical study types.

**Each rule is a function that takes the extractions list (list of dicts with variable_name, value, source_text, confidence_tag) and the full text, and returns modified extractions with notes appended.**

**G1: Fixed-Horizon Follow-Up**
```python
def apply_g1_fixed_horizon(extractions: list[dict], full_text: str) -> list[dict]
```
- Check if `median_followup_months` is `-99` (missing)
- Search full text for phrases: "followed for X years", "censored at X months", "administrative censoring at X"
- If found: write `X * 12` (or `X` if already in months), tag `[CALC]`, add note: `"Fixed administrative censoring at X months — no reported median"`
- Do NOT leave as `-99` just because the word "median" doesn't appear

**G2: Comparator Arm Heterogeneity**
```python
def apply_g2_comparator_heterogeneity(extractions: list[dict], full_text: str) -> list[dict]
```
- Check if a comparator arm variable exists (e.g., `comparator_type`, `control_arm`)
- Search full text for mixed drug class indicators: "VKA" + "DOAC", "any oral anticoagulant", "standard of care" with multiple drugs
- If mixed: write `"mixed"` in comparator type field, add note: `"[NOTE: Comparator arm includes mixed drug classes — check pooling eligibility.]"`
- Applies to any comparative study where the control arm is a drug class, not a single agent

**G3: Subgroup/Substudy Detection**
```python
def apply_g3_subgroup_detection(extractions: list[dict], full_text: str) -> list[dict]
```
- Check if `subgroup_or_substudy` variable exists
- Search for phrases: "enrolled in", "drawn from", "restricted to", "subset of", "participants from", "data from the [X] registry/trial"
- If found: write `"Y"` and name the parent in notes
- If the study is the primary publication of its own cohort: write `"N"`
- Do NOT default to `"N"` without checking

**G4: Immortal Time Bias**
```python
def apply_g4_immortal_time_bias(extractions: list[dict], full_text: str) -> list[dict]
```
- Only applies to non-randomized comparative studies (check `study_design` variable)
- Search for indications that follow-up starts at different times for different arms (e.g., "after procedure", "after waiting period", "from time of device implantation")
- If detected: add note to risk-of-bias/confounding field: `"[IMMORTAL TIME BIAS: Follow-up starts at different time points for intervention vs control arm]"`
- This is a flag for the RoB assessment, not a data modification

**G5: Effect Estimate Conflict Resolution**
```python
def apply_g5_effect_conflict(extractions: list[dict], full_text: str) -> list[dict]
```
- Check if the same effect estimate (HR, RR, OR) appears in multiple extracted fields with different values
- If conflict detected:
  1. Check if the rate ratio (n1/N1 ÷ n2/N2) is consistent with one of the reported values
  2. If rate ratio supports one value: enter that value, tag `[CONFLICT]`, note both values and the arbiter
  3. If ambiguous: enter the more conservative value (closer to null), tag `[CONFLICT]`, note both values
  4. Never average conflicting values or silently pick one without flagging

**Integration into `auto_extract_service.py`:**

In `auto_extract()`, after exhaustive search and recheck pass:
1. Run all 5 gap rules in sequence (G1 → G2 → G3 → G4 → G5)
2. Each rule may modify extraction values, add notes to `source_text`, or change `confidence_tag`
3. Log which rules triggered for each study

---

### B4. Missing-Data Codes

**Standard codes (fixed, used across all projects):**
| Code | Meaning | Color (for Excel export) |
|------|---------|--------------------------|
| `-99` | Not reported (searched, couldn't find) | Yellow (`FFD700`) |
| `-77` | Not applicable (e.g., NMA arm absent) | Grey (`D3D3D3`) |
| `-88` | Unable to extract (scanned PDF, unreadable) | Orange (`FFA500`) |

**Modified: `services/auto_extract_service.py`**

In `auto_extract()`:
- When a variable is not found after exhaustive search + recheck → write `-99` as the value, set `confidence = 0.0`, set `confidence_tag = ""`, add note in `source_text`: `"[MISSING: -99] <variable_name> — not reported. Checked: abstract, tables, results, supplement, synonyms, derivation."`
- When PDF is scanned (no text layer) → write `-88` for ALL variables, add note: `"[MISSING: -88] Unable to extract — PDF is scanned/image-only"`
- When a variable doesn't apply (e.g., NMA arm absent, single-arm study with no comparator) → write `-77`, add note: `"[MISSING: -77] Not applicable — <reason>"`

**New helper:** `_is_scanned_pdf(pdf_data) -> bool` — check if `pdf_data["full_text"]` is empty or very short (< 100 chars) despite having pages, indicating a scanned PDF.

**Modified: `routers/export.py`**

In the existing CSV/XLSX export endpoints, add color highlighting for missing-data codes:
- When exporting to XLSX, apply `PatternFill` to cells containing `-99`, `-77`, `-88` using the colors above
- Add an `Extraction_Legend` sheet to the XLSX export explaining the codes and colors
- When exporting to CSV, missing-data codes are just values (no color), but include a legend row at the top

**New endpoint: `GET /projects/{project_id}/extraction/missing-data-summary`** in `routers/extraction.py`:
- Returns counts of `-99`, `-77`, `-88` per variable across all studies
- Helps reviewers identify systematically missing fields

**Response model:**
```python
class MissingDataSummary(BaseModel):
    project_id: str
    total_extractions: int
    not_reported: int  # -99 count
    not_applicable: int  # -77 count
    unable_to_extract: int  # -88 count
    per_variable: list[dict]  # [{variable_name, total, -99, -77, -88}]
```

---

## Database Migration Summary

All migrations go in `database.py` in the migration function, each wrapped in try/except for idempotency:

```sql
ALTER TABLE projects ADD COLUMN signals_json TEXT DEFAULT '';
ALTER TABLE extractions ADD COLUMN confidence_tag TEXT DEFAULT '';
```

No new tables needed — the existing `screening_decisions`, `screening_conflicts`, and `extractions` tables cover all use cases.

---

## New Files Summary

| File | Purpose |
|------|---------|
| `services/signal_generator.py` | Hybrid signal generation (MeSH baseline + LLM augmentation) |
| `services/signal_prefilter.py` | Pre-screening signal matching and confidence ceilings |
| `services/safety_net.py` | Post-LLM hard-override safety net rules |
| `services/exhaustive_search.py` | 7-step multi-location search + recheck pass |
| `services/gap_rules.py` | Five universal gap rules (G1-G5) |
| `tests/test_screening_gaps.py` | Tests for signals, pre-filter, safety net, AI-reviewer integration |
| `tests/test_extraction_gaps.py` | Tests for confidence taxonomy, exhaustive search, gap rules, missing-data codes |

## Modified Files Summary

| File | Changes |
|------|---------|
| `database.py` | Add `signals_json` column to projects, `confidence_tag` column to extractions |
| `models.py` | Add `SignalSet`, `SignalSetResponse`, `AiScreenResult` (updated), `MissingDataSummary`; update `ExtractionCreate/Update/Response` with `confidence_tag` |
| `routers/studies.py` | Modify `ai-screen-fulltext` and `ai-screen-title-abstract` to run pre-filter, safety net, record decisions, detect conflicts; add `batch-ai-screen` endpoint |
| `routers/screening.py` | Add signal generation/retrieval endpoints, batch AI screening endpoint, extract shared conflict-detection helper, enhance screening summary |
| `routers/extraction.py` | Include `confidence_tag` in CRUD, add missing-data summary endpoint |
| `routers/export.py` | Add missing-data code color highlighting and legend sheet to XLSX export |
| `services/llm_extractor.py` | Update SYSTEM_PROMPT and extraction prompt to request `confidence_tag`; update `extract_variables_with_aide_engine()` to parse and return tags |
| `services/auto_extract_service.py` | Integrate exhaustive search, recheck pass, gap rules, missing-data codes, confidence tag assignment |
| `frontend/src/lib/api.ts` | Update `AiScreenResult` interface, add signal API methods, add missing-data summary method |
| `frontend/src/pages/ScreeningPage.tsx` | Show pre-filter flag, safety-net override notes, AI vs human decision comparison, conflict badge (Phase 2) |
| `frontend/src/pages/ReviewPage.tsx` | Show confidence tags next to extracted values, color-code missing-data codes (Phase 2) |

---

## Test Cases

### `tests/test_screening_gaps.py`

**Signal Generation:**
1. `test_generate_signals_hybrid` — PICO with "heart failure" + "SGLT2 inhibitors" → signals include both MeSH terms and LLM-augmented terms
2. `test_generate_signals_fallback` — LLM unavailable → returns MeSH-only signals with `source="mesh_only_fallback"`
3. `test_signals_cached` — generate twice without force → second call returns cached
4. `test_signals_force_regenerate` — generate with `force=true` → regenerates
5. `test_signals_endpoint` — `POST /projects/{id}/signals/generate` returns 200 with SignalSetResponse
6. `test_get_signals_not_generated` — `GET /projects/{id}/signals` returns 404 before generation

**Pre-Filter:**
7. `test_prefilter_no_abstract` — empty abstract → `confidence_ceiling=0.40`, `prefilter_flag="no_abstract"`
8. `test_prefilter_short_abstract` — 50-word abstract → `confidence_ceiling=0.55`, `prefilter_flag="short_abstract"`
9. `test_prefilter_hard_exclude` — abstract contains "animal model" → `prefilter_flag="hard_exclude_hit"`
10. `test_prefilter_weak_signals` — abstract with no population/intervention signal matches → `prefilter_flag="weak_signals"`
11. `test_prefilter_clear` — abstract with matching signals → `prefilter_flag="clear"`, `confidence_ceiling=1.0`
12. `test_prefilter_ft_uses_strict_outcomes` — FT stage uses strict_outcome_signals instead of lenient

**Safety Net:**
13. `test_safety_net_hard_exclude_override` — LLM says "included" but hard-exclude signal matched → forced to "excluded"
14. `test_safety_net_weak_signals_downgrade` — LLM says "included" but zero signals → downgraded to "uncertain"
15. `test_safety_net_confidence_ceiling` — LLM confidence 0.95 but ceiling 0.40 → confidence capped to 0.40
16. `test_safety_net_llm_fail` — LLM failure → "uncertain" with `[LLM-FAIL]` flag, confidence 0.0
17. `test_safety_net_ft_no_pdf` — FT stage, no PDF text → ceiling 0.45, note appended
18. `test_safety_net_no_override_on_exclude` — LLM says "excluded", weak signals → no override (exclude is safe)

**AI-Reviewer Integration:**
19. `test_ai_screen_records_decision` — `POST /studies/{id}/ai-screen-title-abstract` with `record_decision=true` → row in `screening_decisions` with `reviewer_id="ai_reviewer"`
20. `test_ai_screen_no_record` — `record_decision=false` → no row in `screening_decisions`
21. `test_ai_human_conflict_detected` — AI screens "included", then human screens "excluded" → conflict in `screening_conflicts` with `status="unresolved"`
22. `test_ai_human_agreement` — AI and human both say "included" → no conflict, study status updated
23. `test_batch_ai_screen` — `POST /projects/{id}/screening/batch-ai-screen` with 5 pending studies → all screened, summary returned
24. `test_batch_ai_screen_summary_counts` — summary includes correct included/excluded/uncertain/conflict counts

### `tests/test_extraction_gaps.py`

**Confidence Taxonomy:**
1. `test_confidence_tag_ds` — LLM extracts value with verbatim quote → `confidence_tag="[DS]"`
2. `test_confidence_tag_inf` — LLM extracts value without source quote → `confidence_tag="[INF]"`
3. `test_confidence_tag_calc` — Value derived from arithmetic → `confidence_tag="[CALC]"`, calculation in source_text
4. `test_confidence_tag_pdf_quote` — LLM extracts from PDF page 4 with quote → `confidence_tag="[PDF-p.4: \"quote\"]"`
5. `test_confidence_tag_stored` — `POST /studies/{id}/extractions` with `confidence_tag` → stored and returned
6. `test_confidence_tag_in_list` — `GET /studies/{id}/extractions` includes `confidence_tag` field

**Exhaustive Search:**
7. `test_exhaustive_finds_in_abstract` — LLM misses value, exhaustive search step 2 finds it in abstract
8. `test_exhaustive_finds_in_table` — LLM misses value, exhaustive search step 3 finds it in table text
9. `test_exhaustive_finds_in_results` — LLM misses value, exhaustive search step 4 finds it in Results section
10. `test_exhaustive_derivation` — `pct_female` missing but `pct_male=60` found → derived as 40 with `[CALC]` tag
11. `test_exhaustive_not_found` — All 7 steps fail → returns None, value written as `-99`
12. `test_recheck_finds_value` — Value marked `-99`, recheck pass finds it in Table 1 → overwritten with `[RECHECK]` tag
13. `test_recheck_still_missing` — Value marked `-99`, recheck doesn't find it → stays `-99`

**Gap Rules:**
14. `test_g1_fixed_horizon` — Text says "followed for 2 years", `median_followup_months` is `-99` → G1 writes 24 with `[CALC]`
15. `test_g1_no_horizon` — No fixed horizon mentioned → G1 does nothing
16. `test_g2_mixed_comparator` — Text mentions "VKA and DOAC" in comparator → G2 writes "mixed" with note
17. `test_g2_homogeneous_comparator` — Text mentions only "warfarin" → G2 does nothing
18. `test_g3_subgroup_detected` — Text says "subset of the RE-LY trial" → G3 writes "Y" with parent name
19. `test_g3_no_subgroup` — Text is primary publication → G3 writes "N"
20. `test_g4_immortal_time` — Non-randomized study, text says "follow-up started after device implantation" → G4 flags immortal time bias
21. `test_g4_randomized_no_flag` — RCT → G4 does nothing
22. `test_g5_effect_conflict_resolved` — HR 0.68 in abstract, HR 0.72 in table, rate ratio supports 0.68 → G5 enters 0.68 with `[CONFLICT]` tag
23. `test_g5_effect_conflict_ambiguous` — Two HRs, rate ratio ambiguous → G5 enters more conservative (closer to 1.0) with `[CONFLICT]`

**Missing-Data Codes:**
24. `test_missing_code_not_reported` — Variable not found after exhaustive search + recheck → value is `-99`
25. `test_missing_code_scanned_pdf` — PDF has no text layer → all values are `-88`
26. `test_missing_code_not_applicable` — Single-arm study, comparator variable → value is `-77`
27. `test_missing_data_summary` — `GET /projects/{id}/extraction/missing-data-summary` returns correct counts
28. `test_missing_data_legend_in_export` — XLSX export includes `Extraction_Legend` sheet with code explanations
29. `test_missing_data_color_highlight` — XLSX export applies yellow fill to `-99` cells, grey to `-77`, orange to `-88`

---

## Frontend Changes (Phase 2 — Optional)

Mark these as Phase 2 in the plan. The backend endpoints work standalone; the frontend enhances the UX.

### ScreeningPage.tsx
- When AI screening result returns, show:
  - Pre-filter flag as a colored badge (green=clear, yellow=weak_signals, red=hard_exclude, grey=no_abstract)
  - Safety-net override notes in a warning panel (amber background)
  - AI decision vs human decision side-by-side with conflict badge if they disagree
  - Confidence bar with ceiling indicator (dashed line at ceiling value)
- Batch AI screening button: "Screen All Pending" with progress indicator

### ReviewPage.tsx (Extraction)
- Show `confidence_tag` as a colored chip next to each extracted value:
  - `[DS]` → green chip
  - `[INF]` → yellow chip
  - `[CALC]` → blue chip with tooltip showing calculation
  - `[PDF-p.N]` → purple chip with tooltip showing quote
  - `[SUP]` → teal chip
  - `[FIG]` → orange chip
- Show missing-data codes with background color:
  - `-99` → yellow background
  - `-77` → grey background
  - `-88` → orange background
- Missing-data summary panel at top of extraction page

### lib/api.ts
- Add `generateSignals(projectId, force?)`, `getSignals(projectId)`, `batchAIScreen(projectId, stage?)`, `getMissingDataSummary(projectId)` methods
- Update `AiScreenResult` interface with new fields
- Update `Extraction` interface with `confidence_tag` field

---

## Implementation Order

1. **Database migrations** — add `signals_json` to projects, `confidence_tag` to extractions
2. **Signal generation service** — `services/signal_generator.py` + endpoints
3. **Pre-filter service** — `services/signal_prefilter.py`
4. **Safety net service** — `services/safety_net.py`
5. **AI-reviewer integration** — modify `routers/studies.py`, extract conflict helper in `routers/screening.py`
6. **Batch screening endpoint** — `routers/screening.py`
7. **Confidence taxonomy** — modify `services/llm_extractor.py`, `services/auto_extract_service.py`, `models.py`, `routers/extraction.py`
8. **Exhaustive search** — `services/exhaustive_search.py`, integrate into `auto_extract_service.py`
9. **Gap rules** — `services/gap_rules.py`, integrate into `auto_extract_service.py`
10. **Missing-data codes** — modify `services/auto_extract_service.py`, `routers/export.py`, add missing-data summary endpoint
11. **Tests** — `tests/test_screening_gaps.py`, `tests/test_extraction_gaps.py`
12. **Run full test suite** — ensure all existing 548 tests still pass
13. **Frontend (Phase 2)** — `lib/api.ts`, `ScreeningPage.tsx`, `ReviewPage.tsx`
14. **Git commit and push**

---

## Assumptions

1. **One LLM provider:** The existing `ToolCallingClient` infrastructure is used for all LLM calls. No additional LLM providers need to be configured.
2. **Human + AI review model:** The "dual" in screening is one human reviewer + one AI reviewer, NOT two AI reviewers. The existing `screening_decisions` table and conflict detection infrastructure supports this — the AI just records decisions as `reviewer_id="ai_reviewer"`.
3. **Signal caching:** Signals are generated once per project and cached in `projects.signals_json`. They can be regenerated with `force=true`. Signals do not change per study.
4. **Fixed missing-data codes:** `-99`, `-77`, `-88` are hardcoded standard codes used across all projects. No project-level configuration of codes.
5. **Gap rules are universal:** G1-G5 apply to all study types. G4 (immortal time bias) only triggers for non-randomized studies. The rules do not replace disease-specific logic — they supplement it.
6. **Exhaustive search runs after LLM:** The LLM extraction is still the primary extraction method. Exhaustive search only runs for variables the LLM couldn't find. This minimizes extra computation.
7. **Recheck pass is lightweight:** It re-reads only the single most likely source location for each `-99` field, not the full 7-step search. It's a targeted second look.
8. **Frontend is Phase 2:** Backend endpoints are fully functional without frontend changes. Frontend changes enhance UX but are not blocking.
9. **Backward compatibility:** Existing extraction records without `confidence_tag` will have empty string as default. Existing screening decisions are unaffected. All new columns have defaults.
10. **Test fixtures:** New test files use the same fixture pattern as existing tests (`fresh_db`, `client`, `project` autouse fixtures with tmp_path database).
