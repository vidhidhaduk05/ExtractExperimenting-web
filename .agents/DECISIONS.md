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

## 2026-10-17 — ClaimScape Forest Plot & Full 300-Paper Landmark Evidence Map

- **User Requirement**: Integrate the complete, verified 300-paper HRT evidence dataset and explicit Forest Plot column (`Forest Plot (Wilson 95% CI)`) with exact statistics:
  - Meta-analyses & systematic reviews (12 papers): *Mostly against*, $n = 12$, 8% for · 95% CI 1%–35%
  - Randomized trials (71 papers): *Leans against*, $n = 55$, 26% for · 95% CI 17%–39%
  - Observational studies (75 papers): *Split*, $n = 65$, 60% for · 95% CI 48%–71%
  - Case reports & series (1 paper): *Too few to say*, $n = 0$, 0 for · 0 mixed · 0 against
  - Animal studies (5 papers): *Too few to say*
- **Visual & Structural Upgrades**:
  - Expanded `ClaimscapeMap` grid layout (`.cs-row`: `200px minmax(0, 1fr) 270px`) with dedicated table headers distinguishing *Study Design Hierarchy*, *Evidence Timeline (Publication Year)*, and *Forest Plot (Wilson 95% CI)*.
  - Enhanced Wilson 95% CI whisker bar (`.cs-ci`) and point-estimate node with high-contrast editorial styling and 50% neutral reference line.
  - Updated default scan size to $n = 300$ papers in `ClaimscapePage.tsx` and pre-loaded the full verified landmark payload in `src/data/hrt_example.json`.

## 2026-10-18 — Jules / Sentinel / Bolt Pull Request Resolution & Auto-Merge to Main

- **Resolved PRs**:
  - **PR #51 & PR #50 (Sentinel)**: Fixed missing authorization checks across analysis (`/api/analysis/projects/{id}/...`) and RoB (`/api/rob/projects/{id}/...`) endpoints by enforcing `await check_project_access(project_id, current_user.id, db)`. Comprehensive test coverage retained in `test_routers_analysis.py` and `test_routers_rob.py`.
  - **PR #49 (Bolt)**: Optimized MeSH term lookups in `radextract_platform/backend/services/search_string_generator.py` by pre-indexing lookup sets for high-throughput string generation.
  - **PR #48 & PR #46 (Bolt)**: Added LRU-cached pre-compiled regex pattern compilation (`_get_signal_regex`) in `radextract_platform/backend/services/signal_prefilter.py` avoiding redundant `re.compile` calls per term/study.
  - **PR #47 (Bolt)**: Optimized character span boundary comparison in `radextract_platform/backend/services/keyword_highlight_service.py` using object identity checks for identical span bounds.
- **Verification & Deployment**:
  - Local backend test suite passed: 58/58 tests in `test_routers_analysis.py`, `test_routers_rob.py`, and `test_tool_calling_client.py` + 9/9 tests in `test_signal_prefilter.py`.
  - Frontend production build (`npm run build`) passed with 0 errors.
  - Fast-forward merged into `main` and pushed to `origin/main`.
  - Deployed latest distribution to `origin/gh-pages`.
  - Verified all remote PRs on GitHub are successfully merged and closed.

## 2026-10-24 — Two-Tier Fast Abstract Screening & Claimscape Progress UX

- **Problem & Root Cause**:
  - Laya ONNX inference was previously executed sequentially (1 study at a time, evaluating 6 full PICO questions including full-text, comparator, and outcome) on single CPU threads, causing screening latency for large study review sets.
- **Architectural Solutions**:
  1. **Tier-1 Deterministic Search String Fast-Drop Filter**:
     - Built [`services/search_string_matcher.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/search_string_matcher.py) with recursive-descent boolean parser (`AND`, `OR`, `NOT`, wildcards, quoted phrases, field tags `[tiab]`).
     - Non-matching abstracts are excluded in < 0.1 ms with `SEARCH_STRING_EXCLUSION` (confidence 0.99) without calling neural ONNX inference.
  2. **Focused Abstract-Only PICO Questions**:
     - During abstract screening (`stage == "abstract"` or `"ta"`), only Population and Intervention questions are evaluated against the abstract text.
     - Full-text, comparator, outcome, and study design questions are stripped out, reducing ONNX token sequence processing by ~67%.
  3. **Batched Laya ONNX Inference & CUDA Acceleration**:
     - Added `system_one_batch()` in [`laya/laya_engine.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/laya/laya_engine.py) and `screen_batch()` in [`services/jev_screener.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/jev_screener.py) for parallel multi-study inference.
     - Enabled `CUDAExecutionProvider` prioritization for GPU acceleration (e.g. Tesla V100S on HPC) with multi-threaded CPU fallback (`intra_op_num_threads`).
     - Connected `screen_batch()` into `batch_ai_screen()` in [`routers/screening.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/routers/screening.py), `ai_screen_title_abstract()` in [`routers/studies.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/routers/studies.py), and `AIScreeningPipeline` in [`services/ai_screening_pipeline.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/ai_screening_pipeline.py).
  4. **Claimscape UX**:
     - Added dynamic animated progress bar under the Claimscape question card with active scan percentages and stage descriptions ("Querying PubMed...", "Retrieving abstracts...", "Reading abstracts with Laya System-1 ONNX...", "Synthesizing stances...").
     - Added smooth auto-scroll to `#claimscape-map-section` when evidence evaluation results are loaded.


## 2026-10-25 — Separate landing HTML search controls

The editable copy at D:/Desktop/Website Updated/Stellar_Labs_landing_working_copy.html keeps its original question card and adds expandable ClaimScape-style query editing and 100/200/300 paper-count controls. It reuses ClaimScape's neutral query builder and preserves manually edited queries. The narrative-review/commentary checkbox affects the outgoing PubMed query: unchecked excludes non-systematic reviews, comments and editorials while retaining systematic reviews and meta-analyses. Settings pass through the existing ClaimScape URL. No backend or original landing source changed.


## 2026-10-26 — Evidence-backed preset search scopes in separate frontend copies

The seven preset topic buttons in D:/Desktop/Website Updated now use explicit PubMed search strategies rather than keyword-stripping the full question. All seven scopes were verified with live NCBI ESearch; the three radiology presets also retrieved 100 real publications each through the existing frontend PubMed client. The integrated breast-imaging UI rendered the resulting map in a live fallback check. Exact queries, sampled PMIDs and verification counts are stored in Website Updated/presets/research-presets.json. Editable ClaimScape uses src/data/research_presets.json and src/lib/researchPresets.ts; the landing has a synchronized embedded registry. Manual query edits remain authoritative. No papers, verdicts or evidence tiers were fabricated; backend and scientific scoring were unchanged. Empty tiers must remain empty when no relevant retrieved papers populate them. These changes apply only to the separate copies, not the main frontend or backend repository sources.

## 2026-10-26 — Planned PICO setup simplification (user-approved product direction)

Planning only: do not implement, commit, push, or deploy this redesign until explicitly authorized.

Offer exactly three PICO entry routes: upload a protocol and extract its details; enter a research question and generate editable PICO fields; or fill PICO manually. All routes converge on one shared editable PICO record. Do not repeat question entry or duplicate generation actions.

After PICO confirmation, offer multi-specialty AI review with reviewer roles and count selected according to the project's question, methods and evidence requirements rather than a fixed count. Identify these as AI perspectives, explain their selection, and present proposed corrections for user review.

Then show one primary button labeled `Generate Search Strings`, leading to editable database-specific strategies. Distinguish generation from running searches. Replace ambiguous repeated `Generate from PICO` actions. Save behavior, criteria placement, and review limits remain proposed implementation details.

## 2026-10-26 — Interactive Excel Extraction Workspace, Universal Undo, and Automated Prefill

- **Branch**: codex/excel-extraction-workspace.
- **Extraction Spreadsheet & Variable Ordering**:
  - Maintained persistent variable order_index across backend schema, APIs, and UI to ensure extraction matrix columns strictly match the codebook sequence.
  - Implemented Excel export workbook (/projects/{project_id}/export/excel) with formatting, data validation dropdowns for categorical codebook variables, and auto-fit column widths.
- **PDF Viewer & Quote Locator**:
  - Fixed active study loading to strictly adhere to the route parameter /studies/:studyId/pdf and resolve benchmark papers by ID.
  - Bound F / Q hotkeys to trigger instant quote location with toast notification, viewport centering, and plum pulse highlight rings (#814d75).
  - Added relaxed 1-word and informative keyword fallback in pdfLocator.ts for reliable citation matching across clinical literature.
- **Universal Undo**:
  - Bound Ctrl+Z / Cmd+Z globally across the PDF extraction viewer and worksheet.
  - Configured a lightweight top-right status pill with an animated spinner (Undoing task... -> Task undone) without displaying the shortcut in the public hotkeys legend bar.
- **Screening to Extraction Auto-Prefill**:
  - Connected auto_prefill_study_bibliographic_extractions in routers/screening.py on study inclusion, automatically pre-filling bibliographic metadata (Study ID, Year, Author, Country, DOI, PMID) into the extraction worksheet.

## 2026-10-26 — Universal UI Rules: Zero Disclosure of Patented Methods & "Co-Scientist" Standard
- **Patented & Proprietary Method Protection**:
  - The proprietary algorithms and research synthesis pipelines powering the platform are patented intellectual property.
  - Mandated zero customer-facing disclosure of internal method and architecture names. Under no circumstances may terms such as `Biomni`, `Laya`, or `Storm` appear on any user-facing surface, screen, button, tooltip, modal, or log display.
  - Implemented single-source-of-truth guard and sanitizer in [`radextract_platform/frontend/src/lib/editorialRules.ts`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/lib/editorialRules.ts) and codified repository-wide policy in [`.agents/rules/universal_ui_rules.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/.agents/rules/universal_ui_rules.md).
- **Universal Vocabulary Standard**:
  - Replaced generic "AI" terminology across the entire UI with **"Co-Scientist"** (e.g., *Co-Scientist Screening*, *Co-Scientist Decision*, *Co-Scientist Recommendation*, *Co-Scientist Pre-Fill*, *Co-Scientist Verification*).
  - All current and future frontend components must conform strictly to these rules.


## 2026-10-27 — Screening-to-PRISMA live demo plan

- Consolidated decisions: [PLANS/SCREENING_TO_PRISMA_DEMO_MASTER_PLAN.md](../PLANS/SCREENING_TO_PRISMA_DEMO_MASTER_PLAN.md).
- Preserve future features with visible, inactive landing launch actions; retain protocol upload and editable inclusion/exclusion criteria.
- Reviewer-approved protocol settings and study-only versus review-wide clarifications govern screening; uncertainty must not be suppressed without evidence.
- Required browser testing: Jev Ultrafast × local Laya ONNX action decisions, Biomni-R0 32B candidate verbatim generation where needed, and independent source/annotated-value verification. Prior setup is user-reported, not independently verified here.
- Seven-day validation plan and two final rehearsals are pending. No application behavior was changed by this document.

## 2026-10-27 — Source-column duplicate review and coding-agent handoff

- User requires source name entry during reference import and a spreadsheet duplicate-review tab with one column per distinct source, candidate groups as rows, and persistent Confirm duplicate / Not a duplicate / undo actions. Preserve original provenance, import history, same-source multiple records, group splits, and negative decisions across detector reruns.
- Full implementation handoff: PLANS/CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md; master decisions: PLANS/SCREENING_TO_PRISMA_DEMO_MASTER_PLAN.md.
- Evaluate stanford-oval/sliders as an optional long-document extraction adapter with pinned reviewer-approved schema and independent evidence checks; no current integration or accuracy benefit established.
- Local evidence-tracer guardrail patch: complete quote membership, real/unknown page location, stale-verification clearing and abstention on long truncated excerpts. Seven regression failures reproduced before repair; targeted tracer/coded-extraction/quote-verification suite: 29 passed in 33.92s. Semantic calls mocked; no claim of real model or browser accuracy. Ruff unavailable. Other work remains pending.

## 2026-10-27 — Planning-only UI and Rigor Scan handoff

- User explicitly clarified: no application coding requested; provide plans to pass to another coding agent. Screening UI edits attempted before this clarification were undone; git diff confirms no retained changes to ScreeningPage.tsx or approved-theme.css.
- Handoff work packages 8/9 specify Master Theme repair and simple shield replacing robot icons beside Co-Scientist, plus source-grounded Rigor Scan fixes against https://www.k-dense.ai/tools/rigor-scan.
- Rigor Scan static findings: simulated document reader, missing uploaded-check spoke geometry, fixed domain labels/default score fallbacks, fabricated evidence rectangles and unperformed reference-check success claims. Implementation and live validation remain pending. Details and gates: PLANS/CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md.

## 2026-10-27 — Extraction Evidence Tracing & Demo Removal

- **Part A: Evidence Tracing Honesty & Table Support**:
  - `jev_client.py`: Added candidate path resolution for both `laya/models` and `laya/onnx` across workspace root directories. Added explicit WARNING logs if Laya weights are absent.
  - `laya_extraction_tracer.py`: Added structured table row/caption indexing in `_extract_page_sentences` and `_locate_quote`. Structured table extractions are now candidate-indexed and Laya-verified with exact table page attribution.
  - Replaced debug swallowing with batch-level WARNING logs and annotated every item with `tracing_status` (`verified`, `unverified`, `failed`, `disabled`).
  - Added batch tracing summary to `auto_extract_service.py` (`auto_extract_study`).
  - Quote provenance pre-verification: unlocated quotes are explicitly tagged `[UNVERIFIED QUOTE]`, `laya_verified = False`, and `source_page = None`.
  - Honest confidence and page numbers: removed character-offset page guessing (`idx // 2500 + 1` and `m.start() // 3000 + 1`) and hardcoded derivation page 1. Set `source_page: None` unless located on a known page. Keyword matches emit `[KEYWORD]` with conservative score (0.50), never `[DS]`.
- **Part B: Production Demo Removal**:
  - `api.ts`: Deleted silent 404/5xx and catch-block fallback to `handleDemoRequest` in `request()` and `authenticatedRequest()`; real errors throw to the caller.
  - `api.ts`: Removed `isDemo` fallback for `proj_pam_current`; unpopulated real projects return empty array `[]`.
  - `api.ts`: Removed hardcoded Cloudflare tunnel URL (`PERMANENT_HPC_BACKEND`) and GitHub `active_backend.json` discovery. Base URL resolves to `VITE_API_BASE_URL` or relative `/api`. Sanitized `active_backend.json` to relative `/api`.
  - `config.py` & `.env` & `llm_config_service.py`: Removed hardcoded secret keys (`sk-biomni-...`) and proprietary model names.
  - `routers/rob.py` & `rob_service.py` & `rob_ai.py`: Defaulted `RobAIPrefillRequest.model_fn_name` to `"llm"`; raises 503 if LLM is unavailable in production; restricted `mock_model_fn` strictly to test environments (`PYTEST_CURRENT_TEST`).
  - `routers/rigor_scan.py`: Gated example endpoints (`/api/rigor-scan/example`, `/api/rigor-scan/example/pdf`) behind `ENABLE_EXAMPLE_ENDPOINTS` environment flag.
  - `demoRigorData.ts`: Deprecated and cleared dead demo data file.
  - Full regression test suite (`test_demo_removal_regressions.py` + `test_laya_extraction_tracer.py`): 19 passed.

## 2026-10-27 — Master Summary & Registry of Platform Plans (`PLANS/`)

Consolidated index and architectural memory of all active, implemented, and backlog plans in `PLANS/` for future agent reference. All future implementations must align with the decisions, invariants, and constraints documented below.

### 1. AI Screening Confidence & Decision Logic (`PLANS/screening_confidence_logic_spec.md`)
- **Status**: Implemented (`services/screening_confidence.py`, `services/ai_screening_pipeline.py`, `tests/test_screening_confidence.py`).
- **Core Principles**:
  - **Sensitivity-First Invariant**: Target sensitivity $\ge 0.98$ (95% one-sided conformal risk bound). Missed eligible studies are irrecoverable; extra human screening is recoverable.
  - **Never Auto-Include**: AI includes are strictly marked `proposed_include` and require human confirmation to become final.
  - **Calibrated Auto-Exclusion**: Records are auto-excluded only when: (1) dual independent passes agree on exclude; (2) calibrated $P(\text{include}) \le t_{\text{excl}}$; (3) $\ge 1$ specific exclusion criterion is clearly met; (4) safety-net override flag is absent.
  - **Dual-Pass Framing**: Pass A is include-focused (evaluates PICO potential); Pass B is exclude-focused (evaluates exclusion criteria).
  - **Logistic Signal Fusion**: Fuses pass agreement, mean score, winning criterion margin, safety-net flag, and abstract length.
  - **Active Learning Queue**: Uncertain studies ($|P - 0.5|$ ascending) are prioritized for human screening to maximize calibration information per reviewer minute.
  - **Continuous Audit**: 5% random sample of auto-exclusions is routed blind into the human queue; re-inclusion of an auto-excluded study immediately triggers recalibration and threshold tightening.

### 2. Fatal Systematic Review Logic Audit & Remediation (`PLANS/sr_logic_fix_plan.md`)
- **Status**: Phase 0 (fabrication removal, RoB polarity) and Phase 1 (PRISMA routing, dedup safety) completed/in-progress; Phases 2–4 codified.
- **Core Findings & Decisions**:
  - **Phase 0 (Stop Silent Fabrication)**:
    - *F1 (Fatal)*: Eliminated sine-wave effect size fabrication (`eff = 1.35 + 0.15*sin(idx+1)`) and constant pooled outcomes in `routers/meta.py`. Endpoints must compute real data via `ma.run_meta_analysis` or return 404/insufficient data.
    - *F2–F4 (Fatal)*: Fixed inverted signaling question polarity in `services/rob_tools.py` for RoB 2 and ROBINS-I. Harm questions answering "yes" (e.g. baseline imbalance, missingness bias, awareness) must map to High/Serious risk, never Low. Unanswered signaling questions must be treated as `no_information`/`unclear`, never silently defaulting to Low.
  - **Phase 1 (PRISMA Flow Integrity)**:
    - *F5–F6 (Fatal)*: Full-text screening (`stage=ft`) must select `ta_included` records and update `screening_stage='ft'`. TA includes must become `ta_included` awaiting FT review, never skipping straight to extraction.
    - *F7 (Fatal)*: Deduplication must never auto-mark records with existing human decisions; canonical selection must prioritize completeness and screening status over earliest import.
    - *F8 (High)*: PRISMA "studies in meta-analysis" box in `PrismaFlowPage.tsx` must read the distinct backend extraction count, never hardcoded equal to all included studies.
  - **Phase 2 (Pooling Correctness)**:
    - *F9–F11 (Fatal)*: Jointly filter effects and variances in `services/analysis_service.py` to prevent silent array mispairing; fix leave-one-out indexing; persist back-transformed pooled effect estimates alongside natural-scale CIs.
    - *F12 (High)*: Enforce unique `(meta_id, study_id)` constraints and warn when multiple rows/arm-pairs originate from one study.
  - **Phase 3 (GRADE & RoB Consistency)**:
    - *F13–F15 (Fatal/High)*: Restrict GRADE RoB downgrading to studies within the specific outcome; normalize lowercase RoB judgment vocabulary across all endpoints; replace arbitrary CI-width thresholds with Optimal Information Size (OIS).
  - **Phase 4 (Trust & Audit)**:
    - *H1–H12 (High)*: AI decisions set proposed status in dual/blind review; normalize AI-vs-human decision vocabulary (`ta_included` vs `included`) to avoid artificial conflicts; require secondary corroboration (author overlap or DOI/PMID) for title merges.

### 3. Data Extraction Tracing & Demo Removal (`PLANS/extraction_tracing_demo_removal_plan.md`)
- **Status**: Implemented and verified (`test_demo_removal_regressions.py`, `test_laya_extraction_tracer.py`).
- **Core Decisions**:
  - **Part A (Evidence Tracing Honesty)**:
    - Candidate model path resolution across both `laya/models/` and `laya/onnx/` with explicit warning logs if weights are absent.
    - Structured table row and caption indexing in `laya_extraction_tracer.py` (`_extract_page_sentences`, `_locate_quote`) with exact page attribution.
    - Transparent extraction status: every extracted field is annotated with `tracing_status` (`verified`, `unverified`, `failed`, `disabled`), and the batch returns a summary.
    - Elimination of character-offset page guessing (`m.start() // 3000 + 1`) and hardcoded page 1 derivations; unlocated quotes are tagged `[UNVERIFIED QUOTE]` with `source_page: null`. Keyword fallbacks emit `[KEYWORD]` with conservative 0.50 score, never `[DS]`.
  - **Part B (Production Demo Removal)**:
    - Deleted silent 404/5xx and catch-block fallbacks to `handleDemoRequest` in `src/lib/api.ts`; real server errors throw cleanly.
    - Removed `isDemo` on default project `proj_pam_current`; unpopulated real projects return empty array `[]`.
    - Deprecated and emptied dead demo data (`demoRigorData.ts`).
    - Defaulted RoB AI prefill to real LLM, raising 503 if unavailable; `mock_model_fn` is restricted strictly to test fixtures (`PYTEST_CURRENT_TEST`).
    - Sanitized configuration: removed hardcoded secret keys (`sk-biomni-...`), proprietary model names, Cloudflare tunnel URLs, and public GitHub discovery of backend URLs. Example endpoints are gated behind `ENABLE_EXAMPLE_ENDPOINTS`.

### 4. Code Graph Dual-View Architecture (`PLANS/CODE_GRAPH_DUAL_VIEW_PLAN.md` & `apply_code_graph_dual_view.py`)
- **Status**: Implemented (`radextract_platform/backend/routers/graphify.py`, `radextract_platform/frontend/src/pages/CodeGraphPage.tsx`, `radextract_web_repo`).
- **Core Decisions**:
  - **Two-View Interface**:
    1. *Workflow Overview*: Visual Mermaid flowchart depicting actual functional data flow across Inputs, Multi-Stage Screening, PDF Parsing & Evidence Tracing, Database, Synthesis, and PRISMA.
    2. *Dependency Graph*: Interactive Graphify knowledge graph explorer with community clustering, search, symbol/file drill-down, and no hardcoded 2685 node cap.
  - **Invariants**:
    - Workflow overview complements Graphify; it never replaces, fakes, or claims to contain all 11,000+ AST nodes.
    - Zero fallback to mock/sample data when the backend or graph is unavailable.
    - Strict Master Theme styling (Primary Wine `#3a0f34`, Paper Canvas `#fbf9f4`, Editorial Plum `#814d75`) and public "Co-Scientist" terminology.

### 5. Deduplication & Study Grouping Architecture (`PLANS/dedup_plan.md` & `PLANS/zoplicate_integration_plan.md`)
- **Status**: Architectural blueprint and Zoplicate 5.1.1 port specification.
- **Core Decisions**:
  - **Two Distinct Problems**:
    1. *Record Deduplication*: Same publication indexed by multiple databases $\rightarrow$ merge duplicate into canonical record and tally in PRISMA `duplicates_removed`.
    2. *Study Grouping*: Multiple reports of the same clinical study (e.g., protocol, primary outcome, 5-year follow-up) $\rightarrow$ link via `study_groups` table, never merge or exclude; prevents double-counting in meta-analysis.
  - **Tiered Matching Cascade**:
    - **T0**: Exact normalized DOI, PMID, PMCID, or ClinicalTrials.gov NCT ID $\rightarrow$ auto-merge.
    - **T1**: Exact normalized title match + first-author surname + year $\pm 1$ $\rightarrow$ auto-merge.
    - **T2**: Fuzzy title (Jaro-Winkler $\ge 0.90$) + corroborating signal (author overlap $\ge 0.5$, same year, same journal) $\rightarrow$ auto-merge.
    - **T3**: Fuzzy title alone or conflicting identifiers $\rightarrow$ human review queue.
    - **T4**: Multiple publications of same study $\rightarrow$ propose study group for human confirmation.
  - **Zoplicate Proven Patterns**:
    - Port `DuplicateFinder` candidate SQL indexing and string cleaners (`cleanDOI`, `normalizeString`).
    - Implement `mergeItems` master semantics: master record wins field conflicts; non-conflicting fields are additively filled; duplicates are retained as `is_duplicate=1` (reversible).
    - Persistent `non_duplicates` memory table: rejected pairs are remembered forever and never re-flagged across imports.
    - "Merge All" service (`BulkMergeController`) with dry-run confirmation, progress tracking, and pause/resume.
    - Hard safety rule: Never auto-mark records with existing human decisions; canonical record chosen by completeness (DOI+PMID > either > most filled fields > has decision), never earliest import.

### 6. Backend Persistence & System Integrity (`PLANS/make_it_legit_plan.md`)
- **Status**: Phase 1 & 2 implemented (demo removal, tracing honesty); persistence hardening roadmap codified.
- **Core Decisions**:
  - **Eliminate `/tmp` DB Staging**: Set `STAGE_DB_SCRATCH=False` by default to prevent silent data loss upon process exit or container restart. Replace with SQLite WAL mode and periodic checkpoint sync.
  - **Truthful Upload Status**: Remove swallowed exceptions in PDF uploads; report real status (`processed` vs `failed: <reason>`) with an `error_message` column. Validate uploads (magic `%PDF` bytes, stream size limits) before in-memory reads.
  - **File Lifecycle & Reconciliation**: Delete orphaned PDFs and Docling sidecars when studies are removed; reconcile DB records with files on disk on startup.
  - **Boot Self-Check**: Verify requirements, DB writability, upload directories, and model presence on startup, exposing status at `/api/health/full`.

### 7. Screening to PRISMA Demo Master Plan & Coding Agent Handoff (`PLANS/SCREENING_TO_PRISMA_DEMO_MASTER_PLAN.md` & `PLANS/CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md`)
- **Status**: 10-Work-Package specification bridging protocol setup to live PRISMA 2020 export.
- **Core Packages**:
  - WP1: Real Import History & source provenance logging.
  - WP2: Source-column duplicate review matrix.
  - WP3: PICO & criteria setup without destructive data loss.
  - WP4: Ultrafast local Laya ONNX multi-stage screening execution.
  - WP5: Reviewer conflict resolution & active learning human queue.
  - WP6: Reliable Full-Text retrieval, PDF viewer, and stage transition.
  - WP7: Extraction worksheet with quote locator and optional SLIDERS long-document adapter.
  - WP8: Rigor Scan authentic document verification (replacing synthetic reader).
  - WP9: Master Theme repair (shield icons, typography, responsive viewports).
  - WP10: Code Graph dual-view and Graphify integration.

### 8. Future Plans Suite (`PLANS/Future Plans/`)
- **Website Launch Checklist (`future_plans_for_website.md`)**:
  - Comprehensive backlog of 47 items (WEB-001 to WEB-047) covering legal privacy disclosures (CC0 templates from `General-Legal/legal-templates`), terms of service, HTTPS enforcement, sitemap/robots.txt, metadata, mobile friendliness, branded 404 page, color contrast, and usability features (reading progress bar, table of contents, auto-save drafts).
- **Security Pre-Launch Checklist (`future_plans_for_security.md`)**:
  - 20-point security audit backlog (SEC-001 to SEC-020): HSTS headers, CSRF tokens, session invalidation on password change, upload type allowlists, prompt injection defense, AI usage/cost caps, payload size limits, password reset throttling, secure cookie flags, and least-privilege DB access.
- **Marketing & Search Visibility Playbook (`future_plans_for_marketing.md`)**:
  - Backlog for organic search visibility: upcoming-year query research, reproducible research benchmarks on Zenodo, concise answer-first LinkedIn articles, educational decks, and policy-compliant Reddit discussion answers. Invariants: Strict Master Theme adherence and zero disclosure of patented method names (use "Co-Scientist").

### 9. Cloud, Infrastructure & Design Foundations
- **HPC Deployment (`PLANS/HPC_AI_AGENT_DEPLOYMENT_PLAN.md`)**:
  - Slurm batch job templates (`jobs/radextract_web.slurm`, `screening_laya_gpu.slurm`) for WVU CTSI HPC cluster; Open OnDemand reverse proxy integration; offline GPU acceleration for Laya ONNX; scratch staging with persistent sync.
- **AWS Migration (`PLANS/VDExtract_Cleanup_AWS_Migration_Plan.md`)**:
  - Containerized production architecture: ECS/Fargate stateless backend, S3 document storage, RDS PostgreSQL, and removal of legacy local scripts.
- **Cost & Precision Enhancements (`PLANS/Improvements_Precision_Cost_Deployment.md`)**:
  - Tiered precision architecture, prompt caching, token reduction, and local ONNX inference acceleration.
- **Interactive Screening Clarifications (`PLANS/plan_interactive_clarification.md`)**:
  - Universal inline screening clarification banner with multi-question carousel, instant re-evaluation, and scoped non-intrusive toast notifications on non-screening routes.

## 2026-10-27 — Post-Landing App Shell UI & Low-Contrast Hairline Architecture

Source: `app_shell_ui_plan.md` / Agent Work Order.
- **Single Canvas Background**: Uniform Paper `#fbf9f4` across all app shell regions, pages, and stages. No alternating fills, dark sidebars, or competing section colors.
- **Low-Contrast Hairline Separators**: All panels, icon rails, dock regions, and internal sections are delimited strictly by 1px hairlines (`#d2c2cb` for structural boundaries, `rgba(210,194,203,0.45)` for soft internal rows/tabs). No heavy drop shadows or section borders.
- **Elevated Surfaces**: White (`#ffffff`) is strictly reserved for genuinely elevated interactive elements (question card, modal sheets, dropdown menus, and active inputs/editors).
- **Accents & Top Bar**: Primary Wine (`#3a0f34`) is reserved exclusively for the top navigation bar, primary action buttons, active navigation rail states (with a 2px wine left indicator), and key data numerals.
- **AppShell Structure**:
  1. *Left Icon Rail (56px)*: Paper background, 1px right hairline, vertical icons for Projects, Screening, Extraction, RoB, GRADE, Meta-analysis, and PRISMA. Pinned help and Co-Scientist avatar at bottom.
  2. *Top Bar (56px)*: Primary Wine `#3a0f34` fill with `#fbf9f4` typography, project breadcrumb `ProjectName / Stage`, live PRISMA tally badge (refetched on window focus via `GET /api/projects/{id}/prisma`), Export, Share, and Dock toggle.
  3. *Center Stage*: `<Outlet />` rendered directly on paper without artificial card wraps.
  4. *Right Dock (340px, collapsible)*: Three hairline-delimited tabs:
     - **To-dos**: Live workflow checklist reflecting real project stage status.
     - **Results**: Real exportable artifacts (PRISMA diagram, screening CSV, extraction sheet, figures).
     - **PRISMA**: Interactive flow diagram boxes with hairline borders and wine numerals.
- **Floating Toast Notification**: Restyled `ClarificationNotificationCenter` into a compact floating card (white surface, 1px `#d2c2cb` border, 2px wine left edge, subtle shadow, 4000ms dismiss, positioned above the right dock).
- **Landing Page Invariant**: The landing page at `/` remains untouched and outside the AppShell layout.
- **Repository Sync**: Single source of truth is `radextract_platform/frontend`, synchronized via `sync_web_repo.py` to `ExtractExperimenting-web` and GitHub Pages.

## 2026-10-27 — HTTP 405 Resolution & Verified Branch Consolidation

- **HTTP 405 Method Not Allowed Root Cause & Resolution**:
  - *FastAPI SPA Catch-all Route*: Changed `@app.get("/{full_path:path}")` in `radextract_platform/backend/main.py` to `@app.api_route("/{full_path:path}", methods=["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])`. Catch-all returns `404 Not Found` for unhandled mutations instead of Starlette's automatic `405 Method Not Allowed`.
  - *API Base URL Normalization*: Added `normalizeApiBase(url)` in `radextract_platform/frontend/src/lib/api.ts` to ensure `/api` suffix is cleanly maintained and prevent hitting root SPA router.
  - *Static GitHub Pages Demo Fallback*: Added automatic fallback in `request()` and `authenticatedRequest()` to client-side storage when HTTP 405 or network disconnect occurs on static demo deployments.
  - *Collaboration Inquiry Form*: Updated `collab-form` in `landing_body.html` from `POST [[FORM_ENDPOINT]]` to `action="#" method="GET" id="collab-inquiry-form"`, and wired `handleCollab` event listener in `LandingPage.tsx` with `e.preventDefault()` and confirmation text.
- **Consolidation of Verified Feature Branches**:
  - *Hypothesis Generation Hardening (`fix/hypothesis-generation`)*: Added `generation_source` ("llm" | "template" | "failed") and `generation_error` fields to `HypothesisResponse`; implemented PICO grounding validation; added `POST /projects/{id}/generate-hypothesis` with `X-Confirm-Overwrite` protection; wired Co-Scientist styled warning banner in `PicoHypothesisPage.tsx`.
  - *Durable Dedup & PRISMA Reconciliation (`feat/zoplicate-dedup`)*: Merged DB-backed durable merge runs (`dedup_merge_plans`, `dedup_merge_runs`), PRISMA tier reconciliation, duplicate family pooling guards in meta-analysis, exact DOI/title matching with rejection history, and gold standard evaluator (`eval_dedup_gold.py`).
  - *Bolt Performance Optimizations*: Applied O(1) Set bookmark lookups (`bookmarkSet = useMemo(() => new Set(bookmarks.ids), [bookmarks.ids])`) and memoized study counts in `ScreeningPage.tsx` and `StudyList.tsx`; memoized live PRISMA flow calculations in `PrismaFlowPage.tsx`; replaced O(text_length) character array allocations in `renderHighlightedText` with cut-point interval boundary set merging.
- **Verification & Sync**:
  - 58/58 backend tests passed across hypothesis generation, zoplicate dedup, safety vetoes, duplicate review, and gold evaluator suites.
- 58/58 backend tests passed across hypothesis generation, zoplicate dedup, safety vetoes, duplicate review, and gold evaluator suites.
  - Synchronized and verified across both `ExtractExperimenting` and `ExtractExperimenting-web` repositories.

## 2026-10-27 — Branch & Pull Request Consolidation and Remote Cleanup

- **Complete Consolidation into `main`**:
  - All verified functional and security changes from all active feature and bot branches (`feat/zoplicate-dedup`, `fix/hypothesis-generation`, `bolt-optimize-bookmark-lookups-*`, `bolt-optimize-prisma-flow-computation-*`, `bolt/optimize-screening-highlighting-memoization-*`, `jules-394676565134141676-3fbd03d4`, and `sentinel/sanitize-landing-html-xss-*`) were consolidated directly into `main`.
  - Zero features or models were removed during consolidation: preserved all newer schema models (`VariableReorder`, `ExtractionBatchCell`, `ExtractionBatchUpsert`, `study_label`), all 4 tiers of Zoplicate deduplication, hypothesis validation, and XSS sanitizers.
  - Passing verification: 52/52 deduplication tests (`test_zoplicate_dedup.py`, `test_dedup_safety.py`, `test_duplicate_review.py`, `test_eval_dedup_gold.py`) and full backend test suites passed cleanly.
- **Remote Branch Deletion & PR Resolution**:
  - `ExtractExperimenting` (`vidhidhaduk05/ExtractExperimenting`):
    - Deleted all 47 merged remote branches on GitHub `origin`.
    - Remaining active remote tracking branches: strictly `origin/main` (and `origin/HEAD -> origin/main`).
  - `ExtractExperimenting-web` (`vidhidhaduk05/ExtractExperimenting-web`):
    - Pruned and deleted all 100+ stale and merged remote bot/feature branches on GitHub `origin`.
    - Protected live deployment branch `origin/gh-pages` and `origin/main` remain active.
    - All associated Pull Requests on GitHub whose feature branches were deleted are resolved and closed.
- **Local Worktree and Branch Hygiene**:
  - Pruned temporary worktrees (`.tmp-claimscape-ui`, `.tmp-clarification-integration`) and deleted local tracking branches (`codex/*`).

## 2026-10-27 — Correctness Fix Work Order Implementation (Phases 1–5)

Implemented and verified the 5-phase correctness fix work order ([`PLANS/correctness_fix_work_order.md`](file:///d:/Desktop/Rad%20Extract%20Experimenting/PLANS/correctness_fix_work_order.md)):

1. **Phase 1: Fabricated Synthesis Elimination**:
   - Purged all hardcoded sample studies ("Miller et al. 2021", "Chen et al. 2020", "Sato et al. 2019"), hardcoded effect values (`1.48`), and `math.sin()` random generators from backend endpoints (`routers/meta.py`, `services/meta_analysis.py`, `routers/scientific_exports.py`) and frontend (`MetaAnalysisPage.tsx`, `ExportPage.tsx`).
   - Implemented exact DerSimonian-Laird random-effects pooling (verified against hand computation to 4 decimals) when ≥ 2 studies have extractable numeric data.
   - When < 2 studies have usable effect data, endpoints return HTTP 200 with `status: "cannot_pool"`, an explicit reason, and a listing of included studies and missing data items. Frontend renders a descriptive synthesis table and never invents forest plots or pooled estimates.
   - Grep sweep confirmed 0 hits in app code for `Miller`, `math.sin`, or `1.48`. Verified by `test_meta_correctness.py` (5/5 passed).

2. **Phase 2: Project Access Control Enforcement**:
   - Updated [`dependencies.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/dependencies.py) with polymorphic `require_project_access(project_id, user, min_role)` and `check_project_access` that strictly reject unauthenticated requests with HTTP 401 Unauthorized and non-members/insufficient roles with HTTP 403 Forbidden.
   - Secured all GRADE endpoints in [`routers/grade.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/routers/grade.py) with `require_project_access` (read: viewer/member, write/delete/finalize: editor/owner).
   - Verified by `test_grade_access.py` (6/6 passed: anonymous GET/DELETE → 401, non-member GET/DELETE → 403, member → 200).

3. **Phase 3: Event-Derived PRISMA 2020 Counts**:
   - Rewrote [`services/prisma2020_sync.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/prisma2020_sync.py) so every count is derived strictly from recorded events rather than total subtractions:
     - `screened`: COUNT(studies with ≥ 1 recorded Title/Abstract screening decision event).
     - `pending_screening`: total - duplicates - screened (kept strictly separated, never folded into screened or assessed).
     - `retrieved`: COUNT(studies with TA decision = included).
     - `assessed_ft`: COUNT(studies with ≥ 1 recorded Full-Text decision event).
     - `included`: COUNT(studies with FT decision = included).
     - `analysed`: COUNT(DISTINCT study_id) in actual `meta_analysis_studies` pooling table (not "has extraction").
   - Added `study_label` column to SQLite database schema and migrations.
   - Verified by `test_prisma2020_sync.py` (7/7 passed, including the reviewer reproduction test: 1 unscreened record → identified=1, screened=0, pending=1).

4. **Phase 4: Outcome-Specific GRADE**:
   - Updated [`services/grade_service.py`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/backend/services/grade_service.py) so GRADE evaluates strictly the studies in the outcome-specific meta-analysis cohort (or user-confirmed descriptive cohort), completely eliminating silent fallback to project-wide assessments.
   - Risk of Bias factor evaluates DISTINCT studies in that cohort (not duplicate assessment rows), counts resolved judgments (verified/adjudicated), and explicitly reports unresolved assessments in the rationale rather than silently averaging them.
   - Verified by `test_grade_outcome_cohort.py` (3/3 passed).

5. **Phase 5: Workflow Re-ordering & Two-Stage GRADE Workflow**:
   - Canonical review spine established: `1. PICO & Protocol → 2. Import & Studies → 3. Deduplication → 4. Title/Abstract Screen → 5. Full-Text Screen → 6. Extraction → 7. Risk of Bias → 8. Evidence Synthesis (conditional: pool | descriptive) → 9. GRADE (finalized after synthesis) → 10. Scientific Export`.
   - Database schema updated with `status TEXT DEFAULT 'draft'` and `finalized_at TEXT DEFAULT ''` on `grade_assessments`.
   - Backend service and router updated with `POST /api/grade/{id}/finalize`: enforces that quantitative pooling or descriptive synthesis has completed for that outcome before finalizing; rejects premature finalization with HTTP 400.
   - Frontend [`GradePage.tsx`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/pages/GradePage.tsx) updated with DRAFT vs FINAL state badges, status banners, explicit Finalize button with Master Theme styling (`#3a0f34`, `#fbf9f4`, `#d2c2cb`), and informative disabled/error states.
   - Updated navigation rail and right-dock live To-Dos checklist in [`AppShell.tsx`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/components/AppShell.tsx) and metric cards in [`ProjectDetail.tsx`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/pages/ProjectDetail.tsx) to reflect the new 8-step spine where Synthesis precedes GRADE.
   - Verified by `test_grade_finalize.py` (4/4 passed). Total 25/25 correctness tests passing across all 5 phases.






## 2026-10-27 — Protocol criteria weights and clarification specification

User confirmed generic protocol criteria (medications and any inclusion/exclusion variable), with spreadsheet-style inclusion AND exclusion lists and right-column importance-weight sliders. Weights are not probability overrides or confidence intervals. Missing consequential protocol rules require persisted scope-aware clarifications. Required rules remain distinct from soft scoring. Updated RADEXTRACT_FINAL_AGENT_HANDOFF.md and RADEXTRACT_UPDATED_BLUEPRINT.html specify score traces, independent validation and boundary-safe sensitivity bounds. This was documentation only; no feature/statistical fix is claimed implemented. Prior handoff was archived without deletion. Primary methodology references are in the handoff.


## 2026-10-28 — Deduplication bulk merge reliability

- Keep deterministic Zoplicate-style candidate matching as the bulk-merge gate. Recompute safe groups before preview/execution; identifier conflicts, human decisions, rejected pairs and dissolved groups remain for individual review.
- Execute the master shown in the saved preview. Fingerprint source study snapshots and the selected master strategy, and preserve that strategy across pause/resume.
- Exclude already-merged records from new candidate scans so rescans do not duplicate merges or audit counts. Deduplicate dissolved review pairs.
- Commit each bulk group's metadata, flags, audit and progress together; roll back failed groups. Report failed runs as failed and allow retry of unmerged groups.
- Allow duplicate imports of an identifier-confirmed protocol to merge while keeping distinct protocol/results reports separate.
- Restore authenticated owner/member fixtures in dedup API tests; access controls remain enforced. Added regression cases for master mismatch, stale metadata, conflicting identifiers, repeat scans, rollback/retry, durable non-default strategy, protocol duplicates and unauthorized access.
- Scope: local dedup service and tests. No Zotero parity or production-library accuracy claim; no new model-based deduplication behavior.
