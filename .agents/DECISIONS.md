# Decision log

Memory for later agents. Read this before changing search, screening, extraction, synthesis, or risk-of-bias behavior. Append a dated entry when a decision is made. Chat history is not this log.

## 2026-10-09 — Pure arterial malformation protocol

Source file: `d:\Desktop\Pure Arterial Malformation\PAM_Systematic_Review_Protocol_V2.docx`. A new project starts empty. Do not run `seed.py` or `seed_pam_protocol.py`; that codebook is an older schema and does not match Protocol V2.

- Load the protocol through the app extractor. It is a descriptive case-level review. Case reports are included. All languages are included. Do not apply the old default exclusions `case_report` or `non_english`.
- Search again from the protocol strings. Do not lock the protocol's earlier 28 studies or 74 patients.
- PubMed is searched with paging and the search-header window 1960-01-01 through 2026-08-31. The eligibility text also says no date restriction; that conflict stays logged, and the executed window is the search header.
- OpenAlex stands in for Scopus and Web of Science, which have no API here. Ovid MEDLINE is logged as not executed. Quoted phrases inside an AND clause are not searched on their own.
- Synthesis for this protocol is Wilson 95% intervals for proportions and median/IQR. Do not impute NR.
- If the LLM at `LLM_BASE_URL` (default `http://127.0.0.1:8081/v1/chat/completions`) is down, stop before screening. Do not invent include or exclude decisions.
- Protocol V2 names no RoB 2, ROBINS-I, or GRADE tool. Leave `auto_rob_enabled` off for this project. Do not force a risk-of-bias tool onto the case-report cohort.

## 2026-10-09 — robvis for risk-of-bias figures

[robvis](https://github.com/mcguinlu/robvis) (MIT) draws the publication traffic-light and summary bar figures for assessments the platform already stores.

- Supported templates: RoB 2, ROBINS-I, ROBINS-E, QUADAS-2. NOS has no robvis template.
- Plot script: `radextract_platform/backend/r_scripts/robvis_plot.R`. Install with `Rscript r_scripts/install_robvis.R`, which runs `remotes::install_github("mcguinlu/robvis")`.
- API: `GET /api/rob/projects/{id}/figure?plot=traffic|summary`. The RoB summary page shows both figures. The existing in-app traffic-light table remains.
- This is a figure layer. It does not choose a risk-of-bias tool for a protocol that never named one.

## 2026-10-09 — Study-specific RoB classification and export package

- RoB instruments are selected per study from parsed article evidence, not once per project. Selection is constrained to RoB 2, ROBINS-I, ROBINS-E, QUADAS-2, NOS, JBI Case Report, and JBI Case Series.
- A classification below the project's confidence threshold is stored in the manual-review queue. Never silently substitute ROBINS-I for an unknown design.
- Case reports and case series use the corresponding JBI critical-appraisal checklist. JBI item responses are exported without inventing a Cochrane-style overall risk judgment.
- Project summaries and figures are grouped by the assessment's stored tool. Do not combine incompatible domains or judgment scales in one robvis figure.
- The complete export is a ZIP containing per-tool Excel sheets, SVG/PNG figures, a separate MTR/RC reporting-completeness workbook and figure, and a JSON manifest.
- MTR/RC is a reporting-completeness profile, not a risk-of-bias instrument. Keep it labeled and aggregated separately.

## 2026-10-11 — TypeSafe Jev for screening

- For study eligibility screening (title/abstract and full-text), always enable and use TypeSafe Jev (`JEV_MODE=on`, `settings.jev_mode = "on"`).
- Fallback semantics: In case of temporary Jev API failure or circuit breaker trip, fallback to the standard LLM screening route is preserved so jobs do not break unexpectedly.

## 2026-10-11 — Local Laya adoption for screening

- Cloned `receptron/laya` into workspace (`./laya`) and downloaded ONNX weights (`laya/models/`).
- Added Python native engine [`laya/laya_engine.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/laya/laya_engine.py) using `onnxruntime` and `tokenizers`.
- Integrated local Laya engine into [`radextract_platform/backend/services/jev_client.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_client.py) as the primary provider (`settings.jev_provider = "laya"`), eliminating cloud API keys and latency while preserving full contract compatibility with TypeSafe Jev schemas and LLM fallback.

## 2026-10-11 — Laya Extraction Evidence Tracing (choxos/jev-reviewer paradigm)

- Adopted the `choxos/jev-reviewer` verbatim verification pattern: Every extracted variable must be traced back to an exact sentence quote and page number in the source document.
- Created [`radextract_platform/backend/services/laya_extraction_tracer.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/laya_extraction_tracer.py):
  - Chunks document text into candidate sentences per page.
  - Formulates Laya System-1 `noul` queries to verify verbatim evidence accuracy and calibrate confidence.
  - Binds verified `source_text`, `source_page`, and calibrated `laya_confidence` to extraction records.
- Integrated tracing into [`radextract_platform/backend/services/auto_extract_service.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/auto_extract_service.py) (Step 4.5) and [`radextract_platform/backend/services/coded_extraction_service.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/coded_extraction_service.py) (Steps 3 & 4).

## 2026-10-11 — Side-by-Side Duplicate Review & Reversible Resolution
- Added Duplicate Review Workspace to Deduplication step in Studies (`StudyList`) and Screening (`ScreeningPage`):
  - Side-by-side comparison of Title, Abstract, DOI, PMID, Publication Year, Journal, and Authors.
  - Transparent match reason diagnostics (`doi`, `pmid`, `title_similarity`, `author_year`) with similarity scoring.
  - Supported resolution actions:
    - `Keep this record`: Retains canonical record as active; marks candidate as excluded duplicate (`is_duplicate = 1`).
    - `Keep both`: Reversibly restores both records as active non-duplicates (`is_duplicate = 0`, `screening_status = 'pending'`).
    - `Merge metadata`: Copies non-empty and richer fields (DOI, PMID, longer abstract, journal, year) from candidate into canonical record, and marks candidate as merged duplicate.
    - `Reversible duplicate marking`: Unmarks previously excluded duplicates at any time without data loss.
- Backend endpoints:
  - `GET /api/projects/{project_id}/studies/duplicates`: Fetches candidate duplicate groups with side-by-side metadata without auto-marking.
  - `POST /api/projects/{project_id}/studies/deduplicate/resolve`: Applies user resolution decisions (`keep_primary`, `keep_both`, `merge_metadata`, `revert_duplicate`).
## 2026-10-11 — Task 27: Screening Exclusion Reason Requirement & Removal of Fallback

- Removed the automatic fallback that silently assigned `"wrong_population"` when an exclusion decision was executed without a selected reason.
- Enforced strict validation across all exclusion triggers (main "Exclude Study" button, row-level quick exclude icons, and keyboard hotkeys `E` / `2`):
  - Requires the reviewer to explicitly select an exclusion reason from the project/protocol reason selector.
  - Displays a visible warning alert banner and focuses the reason selector when an exclusion is attempted without a reason.
  - Halts the flow: does not submit an exclusion mutation and does not advance to the next study record until a valid reason is chosen.
  - Clears the validation warning upon selecting an exclusion reason or navigating to another study.
  - Preserves the selected reason (`reason_code` and `reason_text`) when persisting the decision.
  - Preserves existing recorded historical screening decisions without modification.
  - Preserves include and uncertain ("maybe") decisions and hotkeys (`I` / `1`, `M` / `3`) to advance and save normally without requiring exclusion reasons.## 2026-10-11 — Task 30: Screening Save Failure Recovery & Duplicate Submission Prevention

- Screening decisions advance to the next study record strictly in `decisionMutation.onSuccess` only after the backend confirms successful persistence.
- Added duplicate submission prevention across buttons, row-level quick actions, and keyboard hotkeys (`I`/`1`, `E`/`2`, `M`/`3`/`U`) by guarding with `if (decisionMutation.isPending) return;`.
- Visual in-flight progress indicators:
  - Active button displays loading spinner `<Loader2 className="animate-spin" />` with "Saving..." label and disables all decision buttons.
  - Save progress status ribbon indicates network transmission.
- Error retention and recovery:
  - If server/network failure occurs, `onError` captures the error message and preserves the payload.
  - The current record remains active (does not advance).
  - Selected exclusion reason dropdown value and custom rationale notes are fully preserved.
  - Renders an error alert banner with explicit error details and a prominent `Retry Save` action.
- Retrying re-executes `decisionMutation.mutate(failedDecision)` targeting the same study without duplicating decision records.
- Preserves Task 27's strict requirement that exclusion decisions must have a valid exclusion reason selected before mutating.


## 2026-10-11 — AI-led search generation with syntax guardrails

- Automatic PICO/question generation uses the configured model to choose concepts, synonyms, headings and breadth. No forced P AND I AND C AND O or invented restrictions.
- Syntax guidance distinguishes PubMed, Embase.com, Ovid MEDLINE, Ovid Embase, Cochrane Search Manager, Web of Science, Scopus and CINAHL/EBSCOhost.
- Conservative lint checks obvious delimiters/operators, known cross-interface syntax, placeholders and PubMed wildcard/proximity incompatibility; it does not certify live database acceptance or vocabulary validity.
- One AI repair attempt; valid queries stay unchanged. Failure returns a clear error before persistence and preserves saved searches; no silent deterministic fallback. Legacy deterministic helper remains for compatibility only.
- Manual edits and uploaded protocol searches are not rewritten.

## 2026-10-11 — Personal study bookmarks

- Save-for-later controls appear in Studies and Screening, with a saved-only filter and count. Bookmarking does not change study eligibility, screening decisions, reasons, or extraction status.
- Authenticated bookmarks are personal to each reviewer and project, reusing user_review_state with stage=bookmark and status=saved. Viewer membership is sufficient; non-members and unauthenticated requests are rejected.
- Saves are idempotent. Removing a study cleans up its personal bookmarks. Failed saves/removals are surfaced with retry and do not report success.
- Demo bookmarks persist in browser storage, scoped by demo user and project, with explicit browser-only labeling. Live API failures never silently switch bookmark storage to demo mode.

## 2026-10-11 — Dedicated bookmarked studies view

- Project navigation and Studies include a Bookmarked studies destination at /projects/:projectId/bookmarks. It reuses the existing study table and personal bookmarks with saved-only filtering forced on.
- The bookmarked view includes a saved count, empty-state guidance, removal controls, existing study review actions, and a View all studies link. Screening decisions and storage semantics are unchanged.

## 2026-10-11 — Task 16: included-study BibTeX download

- The Export page downloads a .bib attachment through the existing project reference-export endpoint with status=included. Only the current persisted included status qualifies; ta_included, pending, maybe and excluded records are omitted. This exports current recorded eligibility, not a claim of reviewer consensus or confirmation.
- Reuse the existing serializer and access checks. Validate status parameters, return a clear error for no matches, and show visible retryable download errors without silently substituting demo references.
- UTF-8 metadata is retained; absent fields are omitted. Citation keys are ASCII, unique within an export and stable for saved study IDs. Escape TeX-sensitive metadata in a single pass, including unbalanced literal braces.
- Author names separated by semicolons/and or comma-separated full names remain independent; arbitrary adjacent names are no longer merged. Ambiguous comma-only name strings are preserved rather than guessed.

## 2026-10-11 — Protocol-Aware Screening Keywords & Priority Span Highlighting

- **Root Cause Resolution**:
  - Previously, newly created projects and keyword generation defaulted to hardcoded Randomized Controlled Trial (RCT) terms (`randomized`, `double-blind`, and excluding `case report`, `case series`), directly contradicting observational, case-report, and condition-specific systematic review protocols (such as Pure Arterial Malformation Protocol V2).
  - Furthermore, `auto_generate_keywords_from_pico` used substring checks (`w in clean.lower()` for `for` and `or`), which incorrectly discarded medical keywords containing those substrings (e.g. `pure arterial malformation` contains `for`).
  - In the abstract highlight renderer, broad outer sentence spans (e.g. full PICO sentences) swallowed inner inclusion/exclusion keyword spans because `currentIdx` advanced to the sentence end.
- **Protocol Keyword Extraction**:
  - Implemented `auto_generate_keywords_from_protocol(project_data)` in `services/keyword_highlight_service.py`:
    - Gold-standard concept search strings (PubMed, Ovid, Scopus queries) are parsed for core medical phrases and morphology plurals.
    - Acronyms (e.g. PAM, AVM, dAVF, DVA) are extracted and categorized based on protocol inclusions/exclusions.
    - Study design criteria explicitly dictate whether `case report` and `case series` are included or excluded.
    - Exclusion criteria are dynamically parsed for specific excluded pathologies (`AVM`, `dAVF`, `rete mirabile`, `dolichoectasia`, `animal study`, `in vitro`).
  - `list_screening_keywords` and `auto_generate_keywords` in `routers/screening.py` now derive keywords from the project's real protocol data instead of generic RCT defaults.
- **Priority Character-Level Span Resolution**:
  - Implemented `resolve_character_spans` in Python backend and `renderHighlightedText` in React frontend.
  - Resolves overlapping spans with strict priority: `exclude_keyword` (red) > `include_keyword` (green) > `ai_keyword` (yellow/blue) > PICO sentence spans.
  - Keyword marks nested inside PICO sentences light up in bold green or red without being suppressed.
  - Added keyword highlighting to study titles (`title_spans`) and an instant client-side keyword fallback when highlights are loading.
  - Added "Sync with Protocol" action in the Screening Keywords drawer.


## 2026-10-11 — Task 28: per-record screening stage routing

- Human screening decisions use the target record's persisted ta/ft stage in every toolbar view, including All Stages and card actions. The stage is captured with the pending decision and retained on retry; a filter change cannot retarget the save.
- Server requests accept only canonical ta/ft stages, verify project identity, and reject a stage mismatch before writing decisions, conflicts, status, or background work. Refresh is required after a stale-stage rejection.
- Legacy records with a blank stage start at ta, except awaiting_pdf records which resolve to ft. Explicit ta/ft always takes precedence. Unknown nonblank stages are rejected rather than guessed. Deliberate workflow transitions must update the record stage through the existing workflow first; this endpoint does not silently change stages.
- Reviewer identity and consensus rules remain separate tasks; no screening model or eligibility criteria change.

## 2026-10-11 — Task 29: authenticated screening reviewer identity

- Screening decision writes require a valid authenticated account and project reviewer-or-higher membership. Reviewer ID and name come exclusively from the authenticated user's database record; legacy identity fields in request bodies are accepted for compatibility but ignored.
- Re-saving updates only that account's study/stage decision and refreshes its stored display name. One user cannot overwrite another reviewer's decision by forging body IDs or JWT display-name claims.
- The legacy screening-status write route requires authentication and routes human eligibility decisions through the same attributed save path. Conflict resolution requires project reviewer access and records the authenticated resolver ID.
- Screening uses a verified /auth/me response rather than localStorage username/reviewer1. Buttons and hotkeys cannot submit without a verified account. Auth reads, decision saves, and conflict resolution use strict requests; 401/403/server/network failures never become demo success or advance the record.
- Existing anonymous/fallback history is not retroactively reassigned because its true author cannot be established. Task 28's stage capture/validation remains intact; local Laya screening configuration is unchanged.

## 2026-10-11 — Record comments, private notes and project tags (Task 23)

- Record collaboration is available from Studies and Screening through one shared panel. Shared comments are visible to project members; private notes are queried on the server with the authenticated author's ID and never returned to another reviewer, including project owners.
- All collaboration routes require authentication and project membership. Viewer members can read shared comments and tags; reviewer-or-higher members can add annotations and create, assign, rename, archive or restore project tags. Authors and UTC timestamps are server-owned.
- Comments and private notes are separate immutable entries. Per-request IDs make comment retries idempotent; failed saves retain the current draft. Private annotations do not use demo/browser-storage fallbacks. Query caches are scoped by backend, authenticated session, project and study.
- Tags have stable IDs, project-scoped case-insensitive unique names, and multiple assignments per record. Rename retains assignments; archive preserves historical assignments, disables new assignments and hides the tag from ordinary selectors. Restore is available in Manage tags. Tag filtering combines with existing study/screening filters, and screening preview/hotkeys use the visible record set.
- Existing databases acquire the three collaboration tables at normal initialization. Record/project deletion and test reset clean up the new data. Screening eligibility, criteria and local Laya configuration are unaffected.
- User explicitly authorized direct local implementation in this chat because the prescribed Jules API key was unavailable.


## 2026-10-11 — AI Multi-Stage Screening Pause, Resume, and Cancel Controls

- Thread-safe tracking in screening_progress.py (pause, 
esume, cancel, is_paused, is_canceled, check_pause_or_cancel).
- AI screening sequential loops (
un_title_screening, 
un_abstract_screening, 
un_fulltext_screening, and inter-stage transitions in 
un_full_pipeline) verify pause and cancellation cleanly between individual studies, guaranteeing that in-flight study decisions are committed and persisted cleanly before halting to prevent partial writes or database locks.
- REST endpoints added: POST /projects/{project_id}/ai-screening/pause, POST /projects/{project_id}/ai-screening/resume, and POST /projects/{project_id}/ai-screening/cancel (with alias /stop).
- Frontend UI updated in ScreeningPage.tsx with dynamic toolbar buttons (Pause button when active; Resume + Stop buttons when paused) and a Live AI Screening Status & Control banner with real-time progress bar, study count, current title, and inline Pause/Resume/Stop controls.
