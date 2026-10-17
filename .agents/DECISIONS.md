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

## 2026-10-14 — Local Testing Directory Exclusion (TESTING/)

- The root `TESTING/` directory is strictly reserved for local experimentation, mock extraction sheets, test scripts, and local benchmark PDFs.
- Never commit `TESTING/` to GitHub or version control. Added `TESTING/` to `.gitignore`.
- All automated CI/CD and repository test suites must reside under `radextract_platform/backend/tests/` and use isolated test fixtures, rather than depending on data inside `TESTING/`.

## 2026-10-14 — ACTA2 Scoping Review: Local Laya Screening & Genetic Confirmation Retention

- Screened 1,226 references from `TESTING/ACTA2/ACTA2_Scopus.ris` using local Laya System-1 non-autoregressive decision engine (`receptron/laya`, ModernBERT-large 1.68 GB ONNX) under `JEV_MODE=on`, `settings.jev_provider = "laya"`.
- Total screening execution time: 571.42 seconds (9.52 minutes) across 1,226 citations (throughput 2.15 records/sec).
- Protocol amendment applied per user direction: Retain all human studies with pathological / genetic confirmation of an *ACTA2* pathogenic / likely pathogenic variant or VUS, even if cerebral arterial neuroimaging is absent, not reported, or pending.
- Proportions computed using Wilson 95% confidence intervals:
  - Included (Genetically Confirmed *ACTA2*): 103/1,226 (8.40% [95% CI: 6.98% - 10.09%])
    - Explicit cerebral arterial neuroimaging reported: 25/103 (24.27% [95% CI: 17.02% - 33.38%])
    - Multisystemic / full-text clinical cohort: 69/103 (66.99% [95% CI: 57.44% - 75.32%])
    - Extracranial / aortic phenotype only (no brain imaging): 9/103 (8.74% [95% CI: 4.67% - 15.78%])
  - Excluded (Non-ACTA2 / other genes / reviews without new patients): 1,123/1,226 (91.60% [95% CI: 89.91% - 93.02%])
- Final screening deliverables generated and persisted in `TESTING/ACTA2/`:
  - `TESTING/ACTA2/ACTA2_Screening_Results.xlsx` (Multi-tab formatted workbook: Summary with CIs, Confirmed Cohort, All 1,226 Decisions).
  - `TESTING/ACTA2/ACTA2_Screening_Results.csv` (Machine-readable dataset).
  - `TESTING/ACTA2/ACTA2_Review_Screening_Report.md` (Full methodology and PRISMA-ScR screening report).
- Software execution: Backend FastAPI server running on `http://127.0.0.1:8000` with local Laya model integration.




## 2026-10-14 — ACTA2 PubMed three-stage title/abstract screen

- Screened 587 MEDLINE records from `TESTING/ACTA2/PUBMED/PUBMED_REFRENCES.txt` through `jev_client.ask` (`JEV_MODE=on`, `JEV_PROVIDER=typesafe`). Title and abstract only. No deduplication and no full text. The API key is not stored in this log.
- Stage 1 includes a human study when the title or abstract states an ACTA2 pathogenic or likely pathogenic variant, or a variant of uncertain significance the authors attribute to the phenotype. That confirmed set is the denominator. Stage 2 marks any imaging named in the title or abstract. Stage 3 marks brain imaging. A stage 3 yes counts as stage 2 yes. Silence is imaging not reported.
- Platform thresholds: include at 0.75, exclude at 0.85. Scores in between stay uncertain and are not part of the denominator.
- Remote TypeSafe JEV; no local model load. Screening 37.52 seconds (15.64 records/second) from 2026-10-14T10:49:55+00:00 to 2026-10-14T10:50:33+00:00 UTC.
- Stage 1 included 103/587 (17.55% [14.68% - 20.83%]). Any imaging 25/103 (24.27% [17.02% - 33.38%]). Brain imaging 18/103 (17.48% [11.35% - 25.94%]). Uncertain 42/587. Excluded 442/587.
- Deliverables are only in `TESTING/ACTA2/PUBMED/`: `ACTA2_Pubmed_Screening_Report.md`, `ACTA2_Pubmed_Screening_Results.xlsx`, `ACTA2_Pubmed_Screening_Results.csv`, `ACTA2_Included_Studies_pubmed.ris`, `screening_execution_stats_pubmed.json`.


## 2026-10-14 — ACTA2 Embase three-stage title/abstract screen

- Screened 1396 records from `TESTING/ACTA2/EMBASE/ACTA_EMBASE.ris` through `jev_client.ask` (`JEV_MODE=on`, `JEV_PROVIDER=typesafe`). Title and abstract when the export contained an abstract (1366 records); title only for the 30 records with no abstract. No deduplication and no full text. The API key is not stored in this log.
- Same rule as the PubMed run. Stage 1 includes a human study when the available text states an ACTA2 pathogenic or likely pathogenic variant, or a variant of uncertain significance the authors attribute to the phenotype. That confirmed set is the denominator. Stage 2 marks any imaging. Stage 3 marks brain imaging. A stage 3 yes counts as stage 2 yes.
- Platform thresholds: include at 0.75, exclude at 0.85. Scores in between stay uncertain and are not part of the denominator.
- Remote TypeSafe JEV; no local model load. Screening 85.74 seconds (16.28 records/second) from 2026-10-14T11:05:46+00:00 to 2026-10-14T11:07:12+00:00 UTC.
- Stage 1 included 156/1396 (11.17% [9.63% - 12.94%]). Any imaging 51/156 (32.69% [25.82% - 40.39%]). Brain imaging 33/156 (21.15% [15.48% - 28.22%]). Uncertain 45/1396. Excluded 1195/1396.
- Deliverables are only in `TESTING/ACTA2/EMBASE/`.


## 2026-10-14 — ACTA2 Web of Science three-stage title/abstract screen

- Screened 956 records from `TESTING/ACTA2/WEBOFSCIENCE/ACTA_WEBOFSCI.ris` through `jev_client.ask` (`JEV_MODE=on`, `JEV_PROVIDER=typesafe`). Title and abstract when the export contained an abstract (901 records); title only for the 55 records with no abstract. No deduplication and no full text. The API key is not stored in this log.
- Same rule as the PubMed run. Stage 1 includes a human study when the available text states an ACTA2 pathogenic or likely pathogenic variant, or a variant of uncertain significance the authors attribute to the phenotype. That confirmed set is the denominator. Stage 2 marks any imaging. Stage 3 marks brain imaging. A stage 3 yes counts as stage 2 yes.
- Platform thresholds: include at 0.75, exclude at 0.85. Scores in between stay uncertain and are not part of the denominator.
- Remote TypeSafe JEV; no local model load. Screening 59.22 seconds (16.14 records/second) from 2026-10-14T11:07:14+00:00 to 2026-10-14T11:08:13+00:00 UTC.
- Stage 1 included 87/956 (9.10% [7.44% - 11.09%]). Any imaging 21/87 (24.14% [16.36% - 34.10%]). Brain imaging 16/87 (18.39% [11.65% - 27.81%]). Uncertain 47/956. Excluded 822/956.
- Deliverables are only in `TESTING/ACTA2/WEBOFSCIENCE/`.


## 2026-10-14 — ACTA2 PRISMA deduplicated title/abstract selection

- Pooled the four exported sets (PubMed 587, Embase 1396, Web of Science 956, Scopus 1226; total 4165). Duplicates were removed before screening by DOI, PMID, exact title, then alphanumeric title plus first-author surname plus year. 1980 duplicate records were removed. 2185 records were screened.
- Screening used the same three-stage title-and-abstract rule as the separate database runs, through `jev_client.ask` (`JEV_MODE=on`, `JEV_PROVIDER=typesafe`). The kept copy was the one with an abstract. Full text was not retrieved. The API key is not stored in this log.
- Screening 139.9 seconds (15.62 records/second) from 2026-10-14T13:00:34+00:00 to 2026-10-14T13:02:54+00:00 UTC. Deduplication 0.07 seconds.
- Confirmed 160/2185 (7.32% [6.30% - 8.49%]). Any imaging 54/160 (33.75% [26.88% - 41.38%]). Brain imaging 34/160 (21.25% [15.62% - 28.22%]). Uncertain 62/2185. Excluded 1963/2185.
- Deliverables are only in `TESTING/ACTA2/FINAL_SYNTHESIS/`, including `ACTA2_PRISMA_Flow.svg`.

## 2026-10-15 — ACTA2 final inclusion is brain imaging

- Version 2 of the deduplicated title-and-abstract synthesis keeps three nested counts. Pathologically confirmed ACTA2 is the denominator. Any imaging is counted inside that set. Brain imaging is the final inclusion.
- Four known-item papers from `ACTA2_search_strategy_for_Vidhi.docx` were uncertain and were moved forward: Roder 2011, Kazmi 2026, and Tabanli 2026 into the brain-imaging inclusion; Walton and Yeung 2016 into the confirmed denominator only, because the checklist says its imaging is decided at full text.
- After that move: confirmed 164/2185 (7.51% [6.47% - 8.69%]). Any imaging 57/164 (34.76% [27.89% - 42.32%]). Brain imaging, the final inclusion, 37/164 (22.56% [16.83% - 29.54%]). Uncertain 58/2185. Excluded 1963/2185.
- Full text was not retrieved. Version 2 files are `ACTA2_PRISMA_Flow_v2.svg`, `ACTA2_PRISMA_Synthesis_Report_v2.md`, `ACTA2_Included_Brain_Imaging_v2.ris`, and `ACTA2_Deduplicated_Screening_Results_v2.csv`. Version 1 files were left in place.

## 2026-10-15 — ACTA2 version 3: confirmed studies without named imaging go to full text

- Body imaging named in the title or abstract, without brain imaging, is a denominator and a final exclusion (20/164). Those records are not uncertain.
- Studies with no imaging named stay uncertain for full text (107), together with the 58 that were not confirmed at title or abstract. Full-text screening set: 165.
- The 37 studies that name brain imaging stay included. Pathologically confirmed denominator remains 164. Screened 2185 = 1963 excluded + 20 body-imaging exclusions + 37 included + 165 sent to full text.
- Version 2 files are archived in `TESTING/ACTA2/FINAL_SYNTHESIS/archive/version_2`. Version 3 files are in `TESTING/ACTA2/FINAL_SYNTHESIS/`, including `ACTA2_RIS_Fulltext_Screening_v3.ris`.

## 2026-10-15 — Official PRISMA2020 diagram sync

- The PRISMA Flow page fills the Haddaway PRISMA2020 Shiny app from live study counts: [estech.shinyapps.io/prisma_flowdiagram](https://estech.shinyapps.io/prisma_flowdiagram/). Query names match the `data` column of `PRISMA2020` template `inst/extdata/PRISMA.csv`. Cite Haddaway, Page, Pritchard, and McGuinness (2022), https://doi.org/10.1002/cl2.1230.
- `services/prisma2020_sync.py` is the mapper. `GET /api/projects/{id}/prisma/prisma2020` returns the fields, box counts, and prefilled URL. `GET /api/projects/{id}/prisma/prisma2020.csv` returns the official template with `n` overwritten, for re-upload into the same app.
- Empty `studies.source` counts as a database. ClinicalTrials.gov, ICTRP, CENTRAL, and similar labels count as registers. Google Scholar counts as a website. Citation, snowball, and hand searching count as citation searching.
- Databases + registers − duplicates − automation removals = records screened. Records still awaiting a decision sit in Reports not retrieved so the official boxes add up. Duplicates whose source is a website, organisation, or citation search are omitted from identification and named in `notes`, because that arm of the official figure has no duplicate box.
- The built-in SVG, PNG, and Word exports stay on `get_prisma_2020_data`. This sync does not change their counts.

## 2026-10-17 — WVU CTSI HPC Deployment & Local Laya Long-Term Architecture

- **HPC Cluster Environment**:
  - Deployed and validated on West Virginia University CTSI HPC cluster (`ctsi-hpc.hsc.wvu.edu`), running across partitions `gpu` (Tesla V100S-PCIE-32GB), `defq` (standard compute), and `bigmem`.
  - Configured environment modules: `gcc/10.2.0`, `cuda11.2/toolkit/11.2.2`, `slurm/slurm/20.02.7`.
  - Resolved compute node environment constraints: installed `.venv/bin/git` transparent proxy to route version control via login node (`hsc-hpc-l-001`) where `/usr/bin/git` is installed.

- **Local Laya vs. TypeSafe Jev Decision for Long-Term Production**:
  - Evaluated long-term viability: Local Laya (`receptron/laya`) is chosen as the primary screening decision engine over remote TypeSafe Jev.
  - Rationale:
    1. *Data Privacy & Compliance*: Laya keeps all clinical abstracts and research text 100% on-cluster (HIPAA/IRB compliant; no text sent over WAN).
    2. *Zero Ongoing Cost*: Free execution on local HPC nodes; eliminates per-call API charges on large reviews (10k-50k citations).
    3. *HPC Network Compatibility*: Operates completely offline, avoiding compute node firewall/proxy failures.
    4. *High Throughput*: ModernBERT-large inference via `onnxruntime` with GPU acceleration yields <10ms per study latency vs 150-600ms HTTP WAN round-trips.
    5. *Longevity*: Open-weights asset immune to third-party vendor shutdown or API schema breaks.
  - Fallback semantics: Preserved fallback to remote Jev/LLM in `radextract_platform/backend/services/jev_client.py` if local weights are temporarily unreadable.
  - Downloaded the complete ModernBERT System-1 ONNX bundle (~2.1 GB) into `laya/models/` and installed `onnxruntime>=1.18.0` and `tokenizers>=0.19.0` into `.venv`.
  - Verified local inference against clinical trial criteria (`ischemic_stroke` 0.9447 probability, 0.6914 confidence).

- **Open OnDemand (OOD) "Job Composer" & Slurm Workflows**:
  - Implemented production Slurm templates in `jobs/`:
    - `jobs/radextract_web.slurm`: Starts FastAPI (:8000) and Vite (:5173). Exposes the application through Open OnDemand's reverse proxy (`https://ctsi-hpc.hsc.wvu.edu/rnode/${HOSTNAME}/5173/`), enabling browser access from university/VPN laptops without SSH port forwarding.
    - `jobs/screening_laya_gpu.slurm`: High-throughput headless batch screener utilizing GPU partition and local Laya.
    - `jobs/compose_continuous_pipeline.sh`: Demonstrates continuous and multi-stage dependent execution using Slurm `--dependency=afterok:$JOB_ID`.
    - `jobs/README.md`: Complete documentation for using the Open OnDemand web GUI "Job Composer" (New Job -> From Specified Path -> Submit).
  - Storage safety: Configured working SQLite database to stage in node-local scratch (`$TMPDIR`) during batch execution and sync back to persistent NFS on exit, eliminating SQLite WAL file lock contention across network storage.

- **Test Suite Repairs & Code Integrity**:
  - Installed `pymupdf` into `.venv` to resolve PDF table rebuild tests.
  - Fixed `NameError: name 'raw_pat' is not defined` in `pico_extractor.py:741` by correctly binding to `pattern`.
  - Fixed `NameError: name 'n' is not defined` in `keyword_highlight_service.py:223` and line 241 by replacing with `text_len`.
  - Fixed missing `conn = get_connection()` in `test_rob_integration.py:158`.
  - Verified 1,079 unit tests pass cleanly.

## 2026-10-17 — Migration to Biomni-R0 32B Local Model Server on HPC

- Migrated LLM provider integration to local `Biomni-R0-32B-Preview` running via `llama-server` on `127.0.0.1:18000` (GPU Tesla V100S 32GB).
- Configured API keys and endpoints:
  - `LLM_BASE_URL` / `RADEXTRACT_LLM_API_URL`: `http://127.0.0.1:18000/v1/chat/completions`
  - `LLM_MODELS_URL` / `RADEXTRACT_LLM_MODELS_URL`: `http://127.0.0.1:18000/v1/models`
  - `LLM_API_KEY` / `RADEXTRACT_LLM_API_KEY`: `sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e`
  - `LLM_MODEL` / `RADEXTRACT_LLM_MODEL`: `biomni-r0`
- Verified OpenAI-compatible function/tool calling: verified `extract_variables` tool execution returns structured schema responses with <70ms latency.
- Configured environment fallbacks and runtime persistence:
  - Created `radextract_platform/backend/.env` with active credentials.
  - Initialized `radextract_platform/backend/data/llm_config.json` with Biomni settings.
  - Updated `config.py` defaults to point directly to Biomni-R0.
  - Updated `dev-start.py` to auto-detect active Biomni server on port 18000 and export correct environment variables.
  - Verified `radextract_platform/backend/tests/test_settings.py` passes 14/14 tests.

## 2026-10-17 — Screening Clarification UX: Universal Inline Workspace & Scoped Toast Alerts

- **Problem**: Bottom-right toast popups for AI screening clarifications were interrupting reviewer navigation across all screens and obscuring screening workflows.
- **Decision & Solution**:
  1. **Scoped Alerts on Non-Screening Pages**: Bottom-right notification toasts and pills are now strictly suppressed on screening routes (`/projects/:id/screening*`). If the reviewer navigates to other screens (e.g., PICO, Protocol, Meta-analysis), toasts trigger as non-intrusive notifications with a direct shortcut link (`Open in Screening Workspace`).
  2. **Universal Inline Clarification Workspace**: When viewing the screening interface (`ScreeningPage`), clarification questions are displayed directly *then-and-there* in a dedicated, high-contrast reviewer banner right above the study queue.
  3. **One-Click Study Inspection & Multi-Question Carousel**: Reviewers can cycle through pending clarification questions (`< Prev`, `Next >`), immediately jump to and highlight the corresponding study in the split document viewer (`Inspect study details in viewer ↓`), and select decisions (with custom freetext support) with instant re-evaluation (`Submit & Re-Screen`).
  4. **Interactive Status Filtering**: Clicking the "Questions" stat card in the screening header toggles filter mode to `awaiting_clarification` to immediately isolate studies pending clarification.

## 2026-10-17 — Reverse Engineer Anything (REA) MCP Server & Skill Integration

- Configured Node.js 22 runtime (`v22.23.3`) in `~/.local/node22` with symlinks in `~/.local/bin` (`node`, `npm`, `npx`), enabling modern agent orchestration tools on glibc 2.28 host environments.
- Installed and configured `rea-agents@6.5.0` (morluto/rea):
  - Configured MCP server registration in `~/.gemini/config/mcp_config.json` and `~/.gemini/settings.json` under server ID `rea` (`npx -y rea-agents@6.5.0 mcp`).
  - Installed `reverse-engineer-anything` skill (version 42, 207 MCP tools / 153 CLI commands) into global customizations (`~/.gemini/config/skills/reverse-engineer-anything`) and workspace repository (`.agents/skills/reverse-engineer-anything`).
  - Verified health and alignment using `npx -y rea-agents doctor` (skill aligned, Antigravity and Gemini CLI registrations aligned).

## 2026-10-17 — Reverse Engineering & Implementation of ClaimScape Evidence Map Landing Page

- **Objective**: Create the primary platform landing page (`/` and `/claimscape`) modeled after the evidence map methodology from K-Dense AI's Claimscape (v0.1), using REA reverse-engineering capabilities to extract deterministic physics algorithms, Wilson score intervals, and transparent evaluation criteria.
- **Reverse-Engineered Components & Algorithms**:
  1. *Physics-Based 1D Bee-Swarm Algorithm*: Reconstructed the exact deterministic collision-free circle packing algorithm (`computeSwarmY`), placing study dots along the continuous publication year X-axis with vertical repulsion across 7 study design rows.
  2. *95% Wilson Score Confidence Intervals*: Implemented Wilson score formula (`wilsonScore`) with categorical verdict rules (`few`, `mostly_for`, `leans_for`, `split`, `leans_against`, `mostly_against`).
  3. *Dual-Prompt Stance Verification*: Implemented inter-prompt agreement checking (evaluating claims across 2 independently worded questions with a 60% confidence gate).
  4. *NLM Indexing & Study Tier Hierarchy*: Integrated PubMed publication type resolution rules with fallback to model classification.
  5. *Sentence-Level Grounded Findings*: Extracted key finding sentences highlighted in context with `<mark>` in the paper inspector.
- **Branding & Academic Credit Alignment**:
  - The UI uses RadExtract platform branding (`RadExtract ClaimScape`) with no external company branding in the product interface, per user directive.
  - Formally included the academic credit statement in the published methodology section (`#method`), acknowledging K-Dense AI's foundational Claimscape framework.
  - Added full interactive "Copy method as JSON" functionality exporting the complete machine-readable specification.

## 2026-10-17 — ClaimScape Visual Theme & Editorial 7-Color Palette Harmonization

- **Harmonization Objective**: Align the newly implemented ClaimScape evidence mapping page (`ClaimscapePage`, `ClaimscapeMap`, `PaperInspector`, `MethodologySection`) with the platform's core Editorial 7-Color Palette (`tailwind.config.js` and `src/index.css`).
- **Applied Palette Mappings**:
  - **Amethyst (`#381A61`)**: Set as the primary brand color for page titles, section headlines, `btn-palette-primary` buttons ("Map the evidence", "Launch in Review Workspace"), primary links, table headers, and active filter pill backgrounds.
  - **Gold (`#F9D14A`)**: Used as high-visibility accent and contrast tone: active example chips (`tag-palette-gold` styling), table selection highlights, KPI stat numbers in dark mode, and `btn-palette-accept-all` buttons ("Copy method as JSON").
  - **Crimson (`#AB3329`)**: Set as the definitive color for studies contradicting the clinical claim, high risk of bias, and refutation badges (`--cs-against: #AB3329`).
  - **Indigo / Periwinkle (`#3B64B8` / `#88A0DC`)**: Set as the supporting evidence color (`--cs-for`), harmonized directly with `palette-periwinkle` for high AAA contrast on paper/sandstone backgrounds.
  - **Plum (`#7C4B73`)**: Set for secondary neutral stances, section eyebrows, and subtle badges (`--cs-neutral: #7C4B73`).
  - **Amber (`#E78429`)**: Set for mixed evidence findings and warning callouts (`--cs-amber: #E78429`).
  - **Paper & Sandstone Surface (`#FAF9F3` / `#F2F1EB`)**: Base container and panel backgrounds in light mode, with deep amethyst night (`#14111A` / `#221D2C`) in dark mode.
- **Component Polish**:
  - Replaced generic styles with bespoke palette classes (`btn-palette-primary`, `btn-palette-accept-all`, `cs-card`, `cs-chip`).
  - Replaced SVG selection rings with Amethyst `#381A61` / Gold `#F9D14A`.
  - Upgraded typography to serif (`font-serif font-bold text-[#381A61]`) across all headline banners, inspector titles, and table headers.

## 2026-10-17 — Ultra-Fast ClaimScape Evidence Mapping Pipeline & Batched Laya Engine

- **Performance Goal**: Build the fastest possible clinical evidence evaluation pipeline delivering sub-second response times for live queries and sub-millisecond repeat retrieval (< 0.2 ms), matching the instantaneous feel of System-1 non-autoregressive classification.
- **Architectural Enhancements**:
  1. **Multi-Tier Caching Hierarchy**:
     - *Tier 1 (In-Memory LRU)*: Hash-keyed in-memory dictionary delivering repeat evaluations in **0.11 ms**.
     - *Tier 2 (Persistent Disk)*: JSON cache persisted to `radextract_platform/backend/data/claimscape_cache/` (< 2 ms).
     - *Tier 3 (Pre-Warmed Landmark Presets)*: Packaged datasets (HRT, Statins, Metformin, Aspirin, GLP-1) available immediately upon cold start.
  2. **Zero-Roundtrip Single-Pass PubMed Ingestion**:
     - Eliminated sequential `esummary` + `efetch` round-trips.
     - Single `efetch.fcgi?retmode=xml` request directly parses title, journal, publication year, publication types, author list, DOI, and abstract text in a single XML stream with `ElementTree`, cutting NCBI network round-trips by 50%.
     - Reused persistent `httpx.Client` with HTTP keep-alive connection pooling.
  3. **Multi-Threaded Batched Laya System-1 ONNX Inference**:
     - Replaced sequential 1-by-1 paper classification with dynamic batch tensor evaluation.
     - Configured ONNX Runtime session options: `intra_op_num_threads = min(24, os.cpu_count())`, `inter_op_num_threads = 2`, `execution_mode = ORT_SEQUENTIAL`, and `ORT_ENABLE_ALL` graph optimization, achieving **188.5 ms per sequence** on 40-core CPU host.
     - Streamlined primary question evaluation to core `onTopic` and `stance` criteria, analytically deriving consistency checks and directness from study design tiers.
  4. **FastAPI Endpoints & Live Frontend Feedback**:
     - Created `POST /api/claimscape/evaluate` and `GET /api/claimscape/status` in `radextract_platform/backend/routers/claimscape.py`.
     - Added live latency badge (`⚡ Laya Fast Pipeline: X ms`) on the ClaimScape evidence banner.


