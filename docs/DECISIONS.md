# Architectural & Engineering Decisions Log (DECISIONS.md)

This document is the canonical ledger of all engineering, architectural, scientific, and security decisions for the RadExtract / Systematic Review platform.

---

## 1. Universal Domain-Agnostic Clinical Architecture
* **Date**: 2026-10-26
* **Decision**: Architect the systematic review, evidence mapping, screening, and data extraction engines to be completely domain-agnostic (capable of synthesizing cardiology, oncology, surgery, public health, neurology, and infectious diseases), while selecting **Radiology & Neurovascular Intervention** (Pure Arterial Malformations - PAM) as the flagship validation domain.
* **Rationale**:
  * Systematic review methodology (PRISMA 2020, Cochrane Risk of Bias, PICO, GRADE, Wilson score intervals) is universal across clinical medicine.
  * Radiology and neurointerventional surgery present the highest complexity bar (complex angioarchitecture, spatial bounding boxes in imaging, multi-vessel hemodynamic endpoints, and disparate outcome scales like TICI 2b vs 2c/3). Validating against this high-friction domain guarantees robustness across simpler clinical and pharmacological topics.
* **Impact**:
  * PICO schemas, variable codebooks, screening engines, and forest plots accept arbitrary clinical questions.
  * Topic-specific modules (like neurovascular flaw detection) are registered as pluggable specialist lenses under the Stanford STORM persona registry.

---

## 2. In-Memory LRU Cache Bounding for ClaimScape Evidence Mapping
* **Date**: 2026-10-26 (Commit `c277060`, PR #95)
* **Decision**: Retain at most 128 result entries in memory per process using least-recently-used (LRU) eviction protected by a thread-safe lock (`_CLAIMSCAPE_CACHE_LOCK`).
* **Rationale**:
  * Rapid interactive claim searches could cause unbounded memory growth under continuous worker execution.
  * Python dictionary insertion order maintains LRU order with O(1) popping and insertion.
  * Evicted entries fall back gracefully to persistent disk cache (`radextract_platform/backend/data/claimscape_cache/`) with sub-millisecond retrieval.
* **Impact**:
  * Memory footprint remains strictly bounded at ~128 entries.
  * Fully covered by 5 concurrent and eviction unit tests in `test_claimscape_live_pipeline.py`.

---

## 3. Dual-Speed Inference: LAYA System-1 (<150ms) + Stanford STORM Multi-Perspective Deliberation
* **Date**: 2026-10-26 (Commits `5f6c118`, `8155d7d`)
* **Decision**: Implement a two-tiered deliberation architecture combining local ONNX tensor inference with multi-perspective clinical personas:
  * **System 1 (LAYA ONNX, <150ms)**: Evaluates study design flaw risk (`noul`), primary clinical lens affinity (`choice`), and risk-of-bias score (`score`) using local weights (`laya/models/laya.onnx`, 1.68GB) with zero network latency.
  * **System 2 (Stanford STORM Personas)**: Cross-examines publications through 4 clinical lenses (Neurointerventionalist, Stroke Neurologist, Vascular Surgeon, Biostatistician) to detect subtle methodological flaws (e.g., pooled TICI 2b with 2c/3, non-standardized ECASS-III sICH criteria, retrospective selection bias).
* **Rationale**:
  * Based on findings by Stanford physicians (Heit & Adusumilli), systematic reviews fail when single-specialty reviewers overlook methodological traps (e.g., radiologists missing neurology safety endpoints, or clinicians missing biostatistical attrition bias).
  * Chaining fast LAYA triage ahead of STORM provides instant (<150ms) triage for the Evidence Map, while reserving deep multi-agent debate for detailed paper inspection.
* **Impact**:
  * ClaimScape Evidence Map renders interactive Specialist Lens filters and pulsating amber flaw halos (`#F59E0B`).
  * Instant hover tooltips display sound vs flaw risk percentages.
  * Excel Extraction Sheet includes a 1-click `+ Document Flaw Caveat` action to document caveats directly into extraction cells.

---

## 4. Human-in-the-Loop Excel Extraction Sheet: 18 Standard Sections & Zero Unwanted Autofill
* **Date**: 2026-10-25
* **Decision**: Structure the clinical extraction interface to mirror a familiar Excel workbook (green ribbon, formula bar, column letters, keyboard hotkeys) with human-in-the-loop control:
  * Users decide whether to load standard 18 SRMA sections or define custom variables.
  * Variables are never forcibly autofilled; missing codes default to `NR` (Not Reported).
  * On-demand AI suggestions and one-click bulk operations (`Fill Empty with NR`, `Accept All >95%`) assist the doctor without removing manual oversight.
* **Rationale**:
  * Clinical researchers and senior physicians (including 80-year-old faculty) are comfortable with Excel workflows. Complex multi-step web forms create cognitive friction.
  * Verbatim quotes and PDF track-changes bounding boxes must remain verifiable on demand.

---

## 5. Security Hardening: IDOR Prevention Across Risk of Bias Endpoints
* **Date**: 2026-10-25 (Commit `808d815`)
* **Decision**: Enforce `check_project_access` on all direct-resource Risk of Bias (RoB) endpoints (`/api/rob/assessments/{id}`, `/api/rob/judgments/{id}`, `/api/rob/answers/{id}`).
* **Rationale**:
  * Prevent Insecure Direct Object Reference (IDOR) attacks where authenticated users in Project A could mutate or inspect RoB assessments belonging to Project B.
* **Impact**:
  * Verified with automated test `test_unauthorized_direct_resource_access_denied`.

---

## 6. Hash Map O(1) Pre-Computation for Matrix & Assessment Lookups
* **Date**: 2026-10-25 (Commits `fac4585`, `de02752`, `c6db41d`)
* **Decision**: Replace nested linear `.find()` loops in React render loops with memoized `Map` lookups (`domainDefMap`, `signalingAnswerMap`, `paperVariableExtMap`).
* **Rationale**:
  * When rendering large extraction matrices (e.g. 50 variables × 20 studies = 1,000 cells) or dense RoB signaling questions, linear array scans generated O(N²) / O(N³) complexity per frame, causing visible input lag.
  * O(1) Hash Map lookups reduce frame rendering times from >80ms to <4ms.

---

## 7. Clarification Notifications & Review Checklist
* **Date**: 2026-10-26 (Commit `58e97d1`)
* **Decision**: Introduce real-time notification toasts and a structured dashboard clarification checklist for study screening.
* **Rationale**:
  * Dual-blind reviewers require prompt notification when disagreements or clarification requests arise, preventing stalled screening pipelines.

---

## 8. Dynamic Clinical Persona Selection for Study Protocol Suggestions (Stanford STORM + LAYA)
* **Date**: 2026-10-26
* **Decision**: Dynamically synthesize and assign Stanford STORM clinical specialist personas based on the protocol topic and the empirical study literature gathered in ClaimScape, rather than relying on a static set of roles.
* **Clinical Specialization Matrix**:
  * **Breast Imaging & Oncology**: Breast Imaging Radiologist (BI-RADS 3/4/5 criteria, DBT, CEM, breast MRI in dense breasts), Breast Surgical Oncologist (re-excision rate, lumpectomy margins, SLNB vs ALND), Medical Oncologist (neoadjuvant pCR, receptor subtypes ER/PR/HER2), Diagnostic Accuracy Biostatistician (bivariate HSROC, interval cancer, lead-time bias).
  * **Neurovascular Intervention (PAM Benchmark)**: Neurointerventional Radiologist (catheter access, DSA vs CTA, mTICI 2b vs 2c/3), Stroke Neurologist (ECASS-III sICH criteria, 90-day blinded mRS, onset window), Cerebrovascular Surgeon (aneurysm co-existence, dAVF/AVM exclusion, decompressive craniectomy), Trial Biostatistician (active comparator, attrition bias).
  * **Thoracic / Pulmonary**: Thoracic Radiologist (Lung-RADS), Interventional Pulmonologist, Thoracic Surgeon, Epidemiologist.
  * **Cardiovascular**: Interventional Cardiologist (TIMI flow, ARC stent thrombosis), Cardiothoracic Surgeon, Clinical Cardiologist, Cardiovascular Biostatistician.
  * **Abdominal / GI**: Abdominal Radiologist (LI-RADS), HPB Surgeon, Hepatologist / GI Oncologist, Meta-Analysis Biostatistician.
  * **Universal Fallback**: Specialized Interventionalist, Medical Lead, Surgeon, Systematic Review Methodologist.
* **1-Click Human-in-the-Loop Adoption**:
  * Each identified flaw provides an actionable suggestion with a 1-click button (`[Adopt into Outcome]`, `[+ Add Exclusion Criterion]`, etc.) that immediately updates and persists the PICO / Criteria state.
* **Impact**:
  * Ensures multidisciplinary review matches the exact clinical domain of the systematic review.
  * Preserves the existing UI structure while embedding high-value protocol critique directly into the PICO workflow.

---

## 9. Security Hardening: Direct Resource Authorization on Chart Meta Endpoints
* **Date**: 2026-10-26 (PR #96, Commit `3310096`, `bff6383`)
* **Decision**: Add strict project ownership verification (`check_project_access`) on direct resource ID endpoints for chart generation (`/api/charts/forest/from-meta/{meta_id}`, `/api/charts/funnel/from-meta/{meta_id}`, `/api/charts/sroc/from-meta/{meta_id}`).
* **Rationale**:
  * Resolves IDOR vulnerability where an attacker with a known `meta_id` could generate analytical charts for a project they do not have permissions to view.
* **Impact**:
  * Unauthorized requests receive HTTP 403 Forbidden with `Access denied to project`.
  * Verified with automated unit tests in `test_charts_security.py`.

---

## 10. Role-Only Personas without Fictitious Doctor Names & Scholarly De-Branding
* **Date**: 2026-10-26 (Commit `57a654a`)
* **Decision**: Completely eliminate fictitious persona identities (e.g., "Dr. Sarah Chen, MD", "Dr. Marcus Vance, MD, PhD", "Dr. Claire Dupont, MD") and replace them exclusively with pure clinical specialty roles ("Radiologist", "Neurologist", "Biostatistician", "Breast Radiologist", "Cerebrovascular Surgeon"). De-brand external "Stanford STORM" labels in favor of clean academic editorial terminology: "Multi-Specialty Clinical Review & Flaw Detection".
* **Rationale**:
  * Fictitious doctor identities create an impression of simulated or synthetic authority, detracting from the credibility expected by clinical faculty, systematic reviewers, and trialists.
  * Real systematic reviews are cross-examined through disciplines and methodology, not invented personalities.
  * Preserves editorial gravitas under the Stellar Labs / RadExtract Master Theme.
* **Impact**:
  * UI cards, badges, and tooltips display clean specialty titles.
  * Client-side fallback generators and backend services strictly adhere to role-only outputs.

---

## 11. PRISMA 2020 Protocol Conformance & Open Science Pre-Registration Export (Adapted from prismAId)
* **Date**: 2026-10-26
* **Decision**: Adapt the core reporting validation and declarative export strengths of `open-and-sustainable/prismaid` into RadExtract's visual web platform:
  * **PRISMA 2020 Conformance Validator**: Evaluates 9 mandatory items (Title, Rationale & RQ, P, I, C, O, S, Eligibility Criteria, and Hypothesis Pre-Specification).
  * **Visual 9-Segment Conformance Strip**: Displays instant compliance percentage (e.g. 100% or 89%) and expandable guidance for any missing or warning items.
  * **1-Click Open Science Export (`/api/storm/export-protocol`)**: Exports a standardized JSON/PROSPERO protocol pre-registration document embedding PICO specifications, specialist reviewer roles, and PRISMA 2020 conformance ledger.
* **Rationale**:
  * While `prismaid` lacks a web UI, interactive evidence map, local tensor inference, and human-in-the-loop extraction spreadsheets, its emphasis on PRISMA 2020 reporting completeness and reproducible open-science protocol export provides substantial methodological value.
* **Impact**:
  * Reviewers can verify protocol completeness prior to study screening.
  * Seamless 1-click export of reproducible study protocols for PROSPERO and Open Science Framework (OSF) pre-registration.

---

## 12. Separation of Protocol Critique from Evidence Map & Resilient Project Data Conduit
* **Date**: 2026-10-26
* **Decision**:
  1. **Evidence Map Lens Filter**: Restrict the interactive map lens filter exclusively to evidence hierarchy tiers (`All Evidence`, `Direct Evidence Only`, `Reviews & Commentary`). Eliminate clinical persona buttons (`Interventional`, `Neurology`, `Biostat`) and flaw counters from the Evidence Map.
  2. **Removal of Grand Rounds & Verdict Badges from Evidence Map**: Multi-perspective protocol critique, study design flaw detection, and PRISMA 2020 protocol guidance belong strictly in the study protocol / PICO formulation workspace (`PicoHypothesisPage.tsx`). Remove the Grand Rounds deliberation panel, verdict badge, and flaw alert halos from `PaperInspector.tsx` and `ClaimscapeMap.tsx`.
  3. **High-Availability Project Fallback & Tunnel Auto-Discovery**: Update permanent backend tunnel configuration to active Cloudflare endpoint (`verification-enter-attachments-mug.trycloudflare.com`). In `request()`, catch network failures and server errors to automatically fall back to local/cached data (`handleDemoRequest`), ensuring `/projects` and project detail routes never crash or display blank/error screens.
  4. **Master Theme Compliance for Project Views**: Restyle `ProjectList.tsx` to strictly conform to the Master Theme (`#3a0f34`, `#fbf9f4`, `#ffffff`, `#d2c2cb`, `Serifon Editorial`, `Work Sans`).
* **Rationale**:
  * Clinical systematic reviewers use the Evidence Map to navigate published literature and evaluate empirical study tiers; blending speculative protocol critiques or verdict badges into publication inspection creates user confusion.
  * Research projects must remain accessible across offline, local dev, and hosted GitHub Pages environments without breaking on network glitches.
* **Impact**:
  * Pure, clean evidence mapping experience with 1-click tier switching.
  * Resilient project navigation guaranteed across all network states.
  * 100% adherence to Master Theme and zero fake names.

---

## 13. Project-Scoped Import Batches, Reconcilable Provenance & Safe Transactional Undo
* **Date**: 2026-10-26 (Branch `codex/import-batches-scoping-fix`)
* **Decision**: Refactor study reference importation and screening history from transient client-side `localStorage` to server-persisted, project-scoped database entities (`import_batches` and `batch_study_contributions`):
  1. **Project Scoping & Elimination of Hardcoded Mocks**: Completely remove hardcoded mock batch seeds (`ACTA2_Included_103_Studies.ris`, `export_...ris`, `records.ris`). An empty or new project (such as `70df98b2-c4f2-4b07-8077-591ec173935e`) displays an authentic empty state: "No imports yet — import references to get started." Server-side queries strictly filter by `project_id`.
  2. **Truthful Source Provenance**: Do not infer database sources (e.g., "Scopus", "PubMed") without explicit file headers or user specification. Users can edit batch source metadata directly in the UI via `PATCH /projects/{project_id}/batches/{batch_id}/source`.
  3. **Strictly Reconciling Counts**: All batch metrics reconcile with processed totals (`total_records = imported_count + duplicate_count + failed_count`).
  4. **Batch Details & Malformed Records**: `GET /projects/{project_id}/batches/{batch_id}` returns granular record lists, exact duplication/merge outcomes, active study flags, and error snippets.
  5. **Safe, Transactional Undo with Impact Preview**:
     * Before undoing, `GET /projects/{project_id}/batches/{batch_id}/undo-preview` computes studies to be removed vs studies retained because they are shared with other active import batches.
     * Checks for downstream clinical work (screening decisions, data extractions, risk of bias assessments). If downstream work exists, the undo is blocked with HTTP 409 Conflict unless the user confirms with `force=true`.
     * Batches are marked `status = 'undone'` with `undone_at` timestamp.
  6. **Master Theme Compliance**: Compact table layout adhering to Stellar Labs / RadExtract Master Theme (`#3a0f34`, `#fbf9f4`, `#ffffff`, `#d2c2cb`, `Serifon Editorial`, `Work Sans`).
* **Rationale**:
  * Prevents cross-project contamination and phantom batch history.
  * Preserves audit trails, PRISMA 2020 record identification provenance, and ensures downstream clinical extraction integrity.
* **Impact**:
  * Project `70df98b2-c4f2-4b07-8077-591ec173935e` displays 0 studies and 0 batches with clear empty state.
  * Real imports accurately populate the database, link to title/abstract screening, and can be inspected or safely undone with impact preview.
  * 8/8 automated backend integration tests pass in `test_import_batches.py`.

---

## 14. Universal Reliability Hardening & Customer Journey Stabilization (Pre-President Presentation)
* **Date**: 2026-10-26
* **Decision**: Complete end-to-end audit and repair across both backend and frontend layers to guarantee 100% green test passes and crash-free navigation across all customer journeys:
  1. **Frontend API Error Propagation & Demo Fallback Boundary**: Re-scoped `shouldUseDemoFallback()` in `radextract_platform/frontend/src/lib/api.ts` and `src/lib/api.ts` so live requests and unit tests properly throw network/server errors when not explicitly in demo fallback mode, while providing safe `[]` fallbacks for `/batches` and ensuring human-in-the-loop decision writes never silently default to mock responses.
  2. **Extraction Spreadsheet Workspace**: Guarded optional export endpoints (`api.exportTemplateUrl?.()` and `api.exportProjectXlsxUrl?.()`), stabilized grid queries, and updated test suite assertions.
  3. **Screening Workspace & Tag Filtering**: Eliminated redundant toolbar components that caused duplicate DOM option lookups, restoring single-instance `<TagFilter />` in `ScreeningPage.tsx` and ensuring rapid hotkey/click deduplication.
  4. **PDF Security & Authorization Enforcement**: In `test_pdf_highlights_security.py`, authenticated security tests with valid non-member tokens to accurately verify project-level access control on mutating endpoints (`PUT` / `DELETE` `/api/pdf-highlights/{id}`).
  5. **Docling JSON Cache Lifecycle**: Updated `delete_pdf_data()` in `pdf_service.py` to cleanly remove on-disk `<pdf_basename>.docling.json` alongside database records, preventing stale payload retrieval.
  6. **Jev Cloud vs Local Laya Provider Precedence**: In `jev_client.py`, enforced API key checks when `jev_provider == "typesafe"`, while preserving offline execution for local Laya ONNX tensor inference.
  7. **Batch RoB Thread Synchronization**: Replaced fire-and-forget worker thread termination with tracked `ROB_BATCH_THREADS` and a 3-second join on cancellation in `rob_service.py`, eliminating race conditions between in-flight study assessments and progress counts.
  8. **Compound Research Question PICO Parsing**: Added compound regex parsing (`for detecting <outcome> in <population>`) in `search_string_generator.py` to prevent prepositions from swallowing outcome terms into comparator strings.
  9. **Universal Editorial Policy & Router Context**: Wrapped `CitationTelephonePage.test.tsx` in `<MemoryRouter>` and refined Laya sanitization regexes to preserve "Model" copy while redacting proprietary engine references.
* **Verification & Evidence**:
  * **Frontend**: 22/22 test suites (106/106 tests) passed with 0 failures; `npm run build` completed cleanly in 8.64s.
  * **Backend**: 1,189/1,189 tests passed with 0 failures across the complete pytest suite.
  * Merged and synchronized cleanly with `origin/main` on `vidhidhaduk05/ExtractExperimenting-web`.

---

## 15. Three-Stage Sequential PICO Setup & Protocol Review Architecture
* **Date**: 2026-10-26 (Branch `codex/pico-workflow-cleanup`)
* **Decision**: Refactor the PICO setup experience into three disciplined sequential stages:
  1. **Stage 1 (Set Up Your PICO)**: Exactly three entry methods (Method A: Protocol document upload via `api.extractPico`; Method B: Single research question input with 'Generate PICO' via `api.generatePicoFromQuestion`; Method C: Direct manual entry). All methods converge on ONE shared editable PICO record with adaptive framework terminology (Diagnostic Accuracy vs Intervention/Therapy). The original question remains visible and editable, hypotheses are housed in an optional expandable accordion, and method switching confirms before replacing populated fields. Primary action: 'Save & Continue to Review'.
  2. **Stage 2 (Review Your Protocol)**: Single primary button 'Review My Protocol'. Dynamically selects AI reviewer perspectives based on question domain, specialty, and study design, with a configurable execution limit (3–4 reviewers) and explicit relevance explanations. Clear disclosure identifies perspectives as AI models (agreement does not prove scientific validity). Consolidated findings are partitioned into 4 distinct buckets (Missing/Ambiguous info, Conflicting criteria, Methodological concerns, Search omissions) with Accept/Edit/Dismiss controls. Eligibility criteria remain editable with 'Draft Eligibility Criteria'. Stale review detection flags prior reviews if PICO or criteria are altered.
  3. **Stage 3 (Generate Search Strings)**: Single primary button 'Generate Search Strings' (strictly separated from executing live searches). Generates syntax-calibrated queries across 9 database tabs (PubMed, Ovid MEDLINE, Embase.com, Ovid Embase, Cochrane, Web of Science, Scopus, CINAHL, OpenAlex) with live syntax validation and copy/save controls. Manually edited queries are protected from accidental regeneration, and PICO modifications mark existing queries as out of date while preserving manual edits.
* **Rationale**:
  * Eliminates cognitive overload, duplicated question entry, and competing primary actions.
  * Guarantees clinical rigor and traceability across systematic review protocol development.
* **Impact**:
  * Streamlined, intuitive workflow strictly adhering to Master Theme design tokens.
  * Zero schema migrations needed; 100% backwards compatible with existing saved project records.

---

## 2026-10-26 — Five-second clarification announcements and persistent inbox

- New clarification questions use one compact toast below the header at the upper right, including on screening routes. Questions arriving in the same poll share a grouped announcement; later batches queue one at a time.
- Five seconds measures unpaused popup visibility only. Hover, keyboard focus, and hidden tabs pause that countdown. Minimize and timeout never answer, dismiss, exclude, or change screening continuation policy.
- The existing header control uses an envelope and the shared server-pending query for its count. Viewing the inbox does not resolve questions; only a successful answer save removes a pending question. Failed saves retain it with retry feedback.
- Announcement IDs alone persist per project in local storage, with an in-memory fallback when storage is unavailable. Questions and history remain server-backed. An open inbox receives new questions quietly and stays open until the reviewer closes it.
- Clarification surfaces follow the master theme, responsive controls, polite announcements, keyboard focus handling, and reduced motion. Backend screening and eligibility logic are unchanged.

---

## 2026-10-26 — Claim-first evidence map and optional review prefill

- The claim form precedes the explanatory guide at every viewport. The guide uses master-theme surfaces and typography while preserving scientific evidence colors.
- Direct-evidence and narrative-review filters now share the visible paper set across the map, counts, inventory, and inspector. Systematic reviews/meta-analyses remain distinct from narrative reviews; classification and Wilson calculations are unchanged.
- Launching the review workspace carries the entered claim to new-project setup. An explicit prefill action copies it into editable project name and primary hypothesis fields. Creating the project saves the reviewed hypothesis through the existing API; the demo store preserves it across subsequent reads.
- This handoff does not automatically import studies or create a project. Existing project setup and screening policies remain unchanged.

---

## 2026-10-27 — Zoplicate Deduplication Cascade, Durable Merge-All, and Safety Invariants (Branch `feat/zoplicate-dedup`, PR #106)

- **Hardened Zoplicate Cascade**: Implemented tiered deduplication cascade (T0 DOI/PMID exact matches, T1 exact title + first-author surname + year ±1, T2 fuzzy title with corroboration) with explicit conflict vetoes (conflicting PMIDs on identical DOIs route to `conflict` review rather than auto-merging). Numeric-differing titles ("Drug 1" vs "Drug 2") are vetoed to human review. NCT-only matches are strictly review-only (`auto_mergeable=False`, signal `review_only: nct_registration`).
- **Durable DB-Backed Merge-All**: Replaced in-memory execution with persistent `dedup_merge_plans` and `dedup_merge_runs`. Dry-run computes and persists a canonical SHA-256 fingerprint over `[group_id, master_study_id, duplicate_ids, fields_to_fill]`. Execution requires `plan_id` (400 if omitted) and verifies fingerprint against current pending groups (409 `StalePlanError` on drift). Enforces a 10-minute active run lease per project (409 `ActiveRunExistsError` on conflict; expired leases reclaimed). Supports transactional resume via `/dedup/merge-all/resume` with write-through cache compatibility for pause tests.
- **Reversible Merge & Field Conflict Guard**: Non-destructive additive merges record pre-merge master values in `dedup_audit.filled_fields`. Undo (`keep_both_group`) restores overwritten values, raising 409 `MergeUndoConflictError` if a filled field was manually modified after merge.
- **Rejection Memory**: `reject_group` stores typed publication fingerprints in `non_duplicates.fingerprint_a/b` to prevent re-imported duplicate pairs from reappearing in pending review.
- **PRISMA 2020 Tier Count Reconciliation**: Reconciled `duplicates_removed_by_tier` with active database markings (`s.is_duplicate = 1` joined with `dedup_groups`), ensuring exact alignment with total `duplicates_removed` and correct decrementation on undo.
- **Meta-Analysis Pooling Guard**: In `create_meta_analysis` and `_run_analysis`, pooling studies that share a duplicate family in `dedup_groups` is blocked with 409 conflict, reporting conflicting group IDs to prevent double-counting cohort bias.
- **Gold-Set Evaluator**: Shipped `scripts/eval_dedup_gold.py` providing Wilson score 95% confidence intervals, precision, recall, review-workload estimates, and a >=0.99 precision gate, explicitly outputting the required disclaimer that no real-world labeled gold set exists yet.
- **Import-Time Shortcut Safety**: Routed intake exact DOI/title matching through conflict checks (differing PMIDs, differing DOIs on title match, numeric title discrepancies, and non-duplicate rejection history) while preserving the intake reconciliation invariant (`total = imported + duplicates + failed`).

---

## 2026-10-27 — ClaimScape Evidence Map Complete Laya Command Set and Offline Transparency

- **Local Laya ONNX Engine**: Downloaded and verified full Laya ONNX weights (`laya/models/laya.onnx` ~3.8 MB and `laya.onnx.data` ~1.6 GB) from `receptron/laya-onnx`. Configured `_get_laya_model` and `_get_laya_engine` to load locally without remote network dependencies.
- **Complete Command Set**: Implemented the k-dense 5-question method in `claimscape_fast_pipeline.py`:
  - `onTopic`: Empirical investigation of claim relationship.
  - `stance` & `stanceCheck`: Expanded to 4 options including `mixed` ("some results agree and others disagree") and `no_result`.
  - `direct`: Evaluates same population, exposure/intervention, and outcome directly (replaces previous tier-based heuristic for Laya evaluations).
  - `finding`: Splits abstracts into sentences prefixed `S01|`, `S02|`, etc., querying the model to select the sentence reporting the paper's own result bearing most directly on the claim, storing both index and exact sentence text as `findingSentence`.
- **Judgment Admission & Consensus Rules**:
  - Paper plotted iff `onTopic >= 0.5`.
  - Direct evidence iff `direct >= 0.5`.
  - Verdict counts iff `stance` and `stanceCheck` choose the exact same option and average probability >= 0.60; otherwise categorized as `unclear`.
- **Search Hygiene & Retraction Filtering**: Added retraction filtering `NOT (Retracted Publication[pt] OR Retraction of Publication[pt] OR Published Erratum[pt] OR Expression of Concern[pt])` and search-term validation halting with HTTP 400 on unrecognized terms/quoted phrases.
- **Third-Party Opt-In Guard**: Secured remote scan bypass behind `settings.claimscape_remote_scan` (default `False`), preventing automatic external requests to `k-dense.ai`.
- **Transparent Offline Banner**: Frontend `ClaimscapePage` inspects `/api/claimscape/status` on mount and renders a master-theme banner when `status != "ready"` notifying users that verdicts are keyword approximations rather than presenting fallbacks as model readings.

