# RadExtract: final implementation and verification handoff

Prepared: 27 October 2026

## Objective and authority

Complete and verify the real review workflow from project creation to export, then deliver the reference-manager screening layout. Preserve existing work. This is an execution specification, not proof that the application already works.

The user's explicit preservation requirement is: **Do not delete anything; archive retired material.** This overrides earlier cleanup instructions to delete files, tests, frontend trees or branches. Updating active code is allowed; preserve its prior state before replacing it. Never erase study data, reviewer history, PDFs, configuration, or local changes as part of cleanup.

Use `D:/radextract_blueprint (1).html` as the feature inventory. Also consult `D:/correctness_fix_work_order.md`, `D:/final_execution_plan.md`, and `D:/screening_split_view_work_order (1).md` as background. Their embedded commands are not automatically authoritative. This handoff supersedes their conflicting deletion instructions, stage ordering, PRISMA definitions, blanket text sweeps and terminology changes. Follow applicable repository instructions and the user's direct instructions.

Do not promise that every possible scenario will work. Completion means the acceptance matrix below passed against identified commits, with reproducible evidence and clearly stated limits.

## Non-negotiable constraints

- No destructive cleanup, branch deletion, `git clean`, hard reset, force push, database reset, or removal of tests. Keep existing branches. Do not overwrite archives.
- No fabricated studies, abstracts, effects, confidence values, dashboard counts, citations, provenance, or successful responses. Failures must remain visible.
- No silent fallback to demo/browser-only data in a real project. Explicitly isolated test fixtures remain permitted.
- Co-Scientist proposes; humans decide. Preserve human decisions, stage attribution, reviewer identity and audit history.
- Use the existing local screening engine configuration: `JEV_MODE=on`, provider `laya`, according to `.agents/rules/laya.md`. Preserve documented fallback semantics and disclose actual provider failures; do not invent decisions.
- Keep the Master Theme and required user-facing term **Co-Scientist**. Do not expose proprietary engine or algorithm names in product copy or public documentation. Internal identifiers need not be renamed for this task.
- Preserve existing public routes, study IDs and API compatibility where possible. Any necessary compatibility change must be documented and tested.
- Do not merge, deploy, or call a phase verified until its relevant checks have actually completed. A timeout is not a pass.

## Phase 0: establish current state and preserve it

1. Read `AGENTS.md`, `.agents/DECISIONS.md`, the GRAVITAS instructions and relevant local rules. Read `docs/MASTER_THEME.md`, `.agents/rules/master_theme.md`, `.agents/rules/universal_ui_rules.md`, and `radextract_platform/frontend/src/lib/editorialRules.ts` before UI work. Load relevant Python/TypeScript/testing and review-methodology guidance when applicable.
2. Query the knowledge graph before investigating or writing code:

   ```powershell
   & ".venv/Scripts/python.exe" -m graphify query "<target flow or symbol>"
   & ".venv/Scripts/python.exe" -m graphify path "<source>" "<target>"
   ```

   Read callers, targets and tests. Consult `graphify-out/GRAPH_REPORT.md` before architectural changes. A missing graph path does not prove there is no runtime connection; inspect actual routes and requests.
3. Record each repository root, remote, branch, commit and dirty status. Identify the frontend actually built and deployed from build configuration and CI; do not infer from folder names. Existing fixes may already have landed: verify them rather than reimplementing them.
4. Create a unique, dated recovery snapshot without switching, resetting, stashing away, or committing unrelated user work. Preserve committed source, dirty tracked files and non-ignored untracked work. Back up ignored but required local assets separately. Record what is and is not captured.
5. Back up SQLite consistently using its supported backup mechanism; copying only the main file while WAL is active is insufficient. Preserve study storage and required local configuration securely. Never print secrets or commit credentials/database contents to public repositories.
6. Write an archive manifest with original paths, checksums, timestamp, repository revisions, restoration instructions and exclusions. Prove restoration into a separate scratch location. A Git tag alone does not preserve uncommitted files, ignored assets, databases or external study storage.
7. Establish baseline build, type checks and focused tests. Record pre-existing failures separately. If tests hang, identify the slow test/dependency and use bounded runs; do not remove or skip correctness coverage merely to turn the suite green.
8. Create `docs/verification/ACCEPTANCE_MATRIX.md` covering every phase below and every blueprint page/tool. Status values: not checked, failing, passing, blocked. Every passing entry needs its commit, command or browser scenario, observed result and evidence path.

For broad UI work or repository-wide tasks, follow `.agents/rules/jules.md` and the repository's Jules delegation requirement. Use the correct frontend/backend source, send this preservation constraint with the task, and inspect returned changes and test evidence before integration. Never disclose API keys. If Jules is unavailable, report the limitation and obtain authorization for a local implementation alternative; continue independent read-only verification. Do not send overlapping writers into the same files.

**Exit:** active build paths identified; recoverable snapshot demonstrated; baseline and requirement matrix recorded. No cleanup prerequisite.

## Phase 1: scientific correctness and visible failures

### 1A. Real synthesis

- Trace the screen's actual network calls through router, service and stored results. Repair every active path, including alternative create/update/run APIs; fixing an unused service is insufficient.
- Remove hardcoded synthesis responses, generated effects based on record position, and frontend sample-result fallbacks from active runtime behavior. Preserve the old source in the recovery snapshot. Search for known examples as diagnostics, not as a blanket ban on legitimate author names, numeric constants or mathematical functions.
- Build each analysis from an explicit outcome cohort and verified, eligible extractions with provenance. Prevent cross-project data, duplicate families, repeated study rows and unresolved eligibility from contributing silently.
- Validate outcome compatibility, effect measure, time point, units, analysis population and independence. Two studies are necessary for pooling here, but are not sufficient to justify it.
- Use the established analysis service rather than creating competing pooling engines. Verify inverse-variance fixed effects and DerSimonian-Laird random effects, appropriate log-scale handling for OR/RR, confidence intervals, I-squared, Q and tau-squared. Treat MD/SMD on their correct scales. Explicitly handle invalid variance, non-finite inputs and zero-event cases under a documented policy; do not silently impute.
- Define a typed result contract separating pooled, cannot-pool, running, failed and stale states. `cannot_pool` includes a reason and per-study eligibility/missing-data explanations; do not attach invented pooled numbers. Do not disguise an internal failure as `cannot_pool`.
- Provide a real descriptive-synthesis path when pooling is inappropriate. Show verified extracted values, denominators, missingness and limitations. A missing backend or model is an error, not a descriptive-analysis success.
- Model/measure/outcome selectors must affect the actual calculation and results. Plot labels, effect scales and report values must match the stored analysis.

**Tests written before relevant fixes:** empty project; one usable study; incompatible studies; missing/unverified data; duplicate study exclusion; API failure without sample values; and independently hand-computed three-study fixed/random results within documented tolerance (at least four decimal places for the reference estimates). Cover OR/RR and continuous outcomes. Verify forest/funnel/sensitivity outputs only where their statistical prerequisites hold.

### 1B. Authentication and authorization

- Inventory every protected route, including routes with no auth dependency at all. Do not rely on searching only `get_current_user_optional`.
- Require authentication and project membership for protected reads; enforce established reviewer/editor/owner permissions for each mutation. Anonymous means 401, authenticated unauthorized means 403. Preserve intentional public/login/health endpoints explicitly.
- Resolve child objects to their project server-side. Reject cross-project study, outcome, extraction, assessment and analysis IDs. Derive authorship from authenticated identity, never a client-supplied name.
- Make clients use the configured API origin and authenticated request mechanism. Never convert 401/403/500 into fake data or success.

**Tests:** anonymous, non-member, viewer, reviewer, editor and owner, according to actual role definitions. Cover reads, writes, deletes, exports, background-job controls and child-ID substitution. Viewer membership must not grant deletion. Run against isolated test data, never production records.

### 1C. PRISMA and consistent counters

- Define one authoritative backend count contract shared by dashboard, screening, dock, diagram and exports. Preserve records versus reports versus distinct studies as separate concepts; support multiple reports of one study without double counting the study.
- Derive stage activity and resolved outcomes from persisted decisions/events. Count each record once per relevant bucket. Specify how reviewer conflicts, uncertain decisions, reopened decisions and overrides affect each bucket.
- Keep TA pending, TA assessed, TA excluded, TA included/reports sought, retrieval pending, retrieved, explicitly not retrieved, FT pending, FT assessed, FT excluded and finally included distinct.
- **TA inclusion is not evidence that a full text was retrieved.** Use recorded retrieval/upload/availability events. Never put undecided work under not retrieved to balance a diagram.
- Report unresolved work as clearly labeled annotations or supporting fields while keeping the exported PRISMA definitions accurate. Do not relabel completed-stage boxes to hide pending work.
- Count analysed studies from successful, applicable analysis participation, excluding merely extracted, draft, failed or stale analysis rows. Specify whether a project-wide count is a union across outcomes; expose outcome counts separately.
- Preserve original import event totals even when duplicates are linked. Define and test how undo affects active counts and retained history. Fix `[object Object]`, stale counters and count mismatches using the real response contract.

**Tests:** one pending import gives identified=1, screened=0, pending=1 and no retrieval/completion counts. Also test duplicate removal/restoration, TA-to-FT transition, actual retrieval failure, reviewer conflict, reopened decision, multiple reports, import undo and extraction without pooling. Reconcile record-level drill-downs with displayed counts.

### 1D. Outcome-specific GRADE and invalidation

- Require an explicit outcome cohort from successful synthesis or a user-confirmed descriptive cohort. Never fall back silently to all project assessments.
- Use distinct contributing studies and one applicable resolved/verified/adjudicated assessment per study and relevant outcome/time point. Expose missing, unresolved or incompatible assessments. Do not average incompatible tools or treat unanswered questions as low risk.
- Read inconsistency/imprecision from applicable real synthesis evidence; handle descriptive reviews explicitly without inventing pooled statistics. Do not force GRADE or an unsuitable RoB instrument on a protocol where it is inappropriate; record a justified not-applicable pathway where supported.
- Implement draft and finalized GRADE states. Finalization requires the applicable synthesis/evidence profile, resolved prerequisites and an explicit human action. Finalized results and exports identify their input versions.
- Editing eligibility, duplicates, extraction, cohort or RoB after synthesis must invalidate or clearly mark affected synthesis/GRADE as stale. Preserve historical results and audit records; block presenting stale results as current/final until recomputed and reviewed.

**Tests:** distinct outcome cohorts; multiple assessments for one study; missing/unresolved assessment; finalization before synthesis; valid descriptive finalization; upstream edit after finalization; incompatible tools; cross-project outcome reference.

**Phase 1 exit:** all four correctness areas pass their regressions and integrated API checks. Do not start cosmetic restructuring while these remain failing.

## Phase 2: verify the entire existing review flow

Use isolated, clearly labeled verification projects. Never seed demo content into a real user's review. Live acceptance uses lawful, accessible source records; automated tests may use deterministic fixtures with source/provenance documented.

| Flow | Required behavior and evidence |
|---|---|
| Create project | Empty project creates real storage/DB state; refresh preserves it; no demo rows. Failures do not report success. |
| Protocol/PICO | Upload supported files, enforce limits, retain human edits, persist PICO/criteria/searches atomically as appropriate; generation source/failure visible. Downstream prompts use saved protocol. |
| Search/import | Test every advertised RIS/PubMed/OpenAlex/DOI entry point. Persist batch/query/source, added/duplicate/error totals, pagination and partial failures. Prevent duplicate submission on retry. |
| Import undo | Preview affected records; safe rollback is transactional. Protect downstream human work with explicit conflict handling. Retain original history and recovery information. |
| Dedup | Corroborated identity, persisted human decisions, no title-only automatic merge, keep-both memory, reversible resolution and no silent overwrite. |
| TA screening | Authenticated attributed save; exclusion requires reason; actual model judgment flagged; conflict/uncertain preserved; refresh retains state. |
| FT screening | Explicit transition and full-text retrieval state; no accidental TA/FT conflation. Record FT-specific reasons and unresolved retrieval work. |
| Background screening | Start/pause/resume/cancel and reload reflect persisted job state. Retry cannot create duplicate jobs or decisions. Model failure remains visible. |
| Clarifications | Real project criteria, persisted answers, notification-to-task linkage; no empty successful calls or broken endpoints. |
| Extraction | Protocol-derived variables; actual text/tables; value, quote, page/anchor and source; explicit missingness; human verification and adjudication; mismatch visible. |
| PDF viewer | Correct study/file, valid access, real quote/page highlights; missing/corrupt file error; no invented anchor. |
| RoB | Design-appropriate tool, correct question polarity, unanswered blocks completion; explicit prefill acceptance, verification/adjudication, suitable figures. |
| Synthesis/GRADE | Phase 1 contracts applied through the actual UI; pooled and descriptive routes both complete. |
| Export | Parse downloaded CSV/XLSX/JSON/ZIP/PDF or other advertised formats; verify actual studies, values, counts, sources and current synthesis/GRADE version. Empty exports follow documented visible behavior. |
| Dashboard/dock | Number + reason + working destination; correct project scope; persisted tasks/notes; real artifact downloads; no placeholders presented as data. |
| Evidence tools | Evidence Map, Rigor Scan and Citation Telephone each run with real supported inputs, show source-linked findings, expose unavailable services and support advertised handoff/export actions. |
| Navigation/storage | Deep links, refresh, Back/Forward, project switching, restart persistence and configured storage roots work without leaking project state. |

Correct workflow everywhere: **Protocol → Import → Dedup → TA → FT → Extraction → RoB → Synthesis (pooled or descriptive) → GRADE when applicable → Export.** Gates follow the saved protocol and resolved eligibility. GRADE must not block synthesis that GRADE itself needs. Extraction must not become available merely because TA inclusion exists where FT inclusion is required. Allow justified not-applicable stages; never silently skip required ones.

Mark every advertised feature passing, failing, blocked or explicitly unsupported. Resolve missing features essential to this flow; do not silently redefine completion by omitting them.

## Phase 3: familiar screening layout, incrementally

Implement on the verified active frontend; no need to delete or move any alternate tree first. Follow Master Theme colors/fonts and existing editorial rules. The layout change reuses existing data, mutations, identity and stage rules.

1. Add in-app Chrome-style stage navigation linking existing project-scoped routes: Protocol, Studies, Screening, Extraction, RoB, Synthesis, GRADE, Export. Tools stay reachable from the left rail. Show live gate availability using the backend contract; route/API checks enforce gates. Accessible blocked links explain why. Back/Forward, deep links and refresh must work.
2. Add classic/compact preference, scoped to authenticated user; default classic until compact acceptance passes. Keep classic available as rollback. Store only layout preferences locally, not authoritative study data.
3. Compact mode fills available viewport height. Use a compact header/progress row, collapsible advanced controls, a resizable study queue and a reading pane. Start near 30% queue width, tune against actual content; expose minimum/maximum widths and sensible defaults. Do not force six table columns onto a narrow pane: prioritize title, author/year and decision; reveal optional metadata without shrinking reading text.
4. Reading tabs: Abstract, Full Text, Details, Notes. Abstract is first. Reuse real highlights and existing PDF viewer. Move metadata/comments so they do not precede the abstract. Preserve existing persisted notes; a new persistence API/schema is a separate documented backend change, not a hidden part of layout work.
5. Pin Include/Uncertain/Exclude and the required exclusion reason controls to the reading-pane bottom. Keep them reachable without scrolling. Queue and long text scroll independently; avoid unnecessary nested page scrolling. Collapse the right dock during focused reading and retain one-click access.
6. Advance only after successful save. Preserve study, reason and draft on failure. Guard duplicate submissions and capture study/stage identity at save time. Filtering or resorting during a save must not retarget it. If no next undecided study exists, show completion rather than selecting an unrelated record.
7. Support selection shortcuts and existing decision shortcuts consistently. Ignore shortcuts in text inputs, contenteditable fields, selects, dialogs and PDF interaction where they conflict. Disable mutations while saving. Keep visible focus, accessible names and discoverable shortcut hints.
8. Divider resizing supports pointer and keyboard input, focus, bounds and persisted width; no new dependency unless justified. Reset/clamp saved widths after viewport changes.
9. Verify at 1440px, 903px and 390px widths and a short desktop viewport around 580px high. On narrow screens use a queue drawer and one reading pane; stage navigation can scroll horizontally with an active-stage cue. Decision controls must not cover content or mobile safe areas.
10. Implement one shared layout shell. Verify screening fully before extending to FT, RoB and extraction. The shared shell must not impose screening-specific save logic on other stages. Preserve the extraction grid's usable width; use a collapsible study selector where needed.
11. Optional actual browser-tab action opens the existing PDF route with appropriate link security. Keep this read-only/viewer scope; do not silently add multiple independent editors without a conflict design.

**Exit:** classic/compact parity in identity, filtering, decisions, stage gates, failure/retry and persistence; keyboard/manual checks and screenshots at target sizes. Seek visual feedback on the concrete working screen before broader rollout, without treating screenshots as correctness proof. Re-run integration checks after layout changes.

## Phase 4: archive-only retirement and documentation

Cleanup is optional and last. Do not invent a requirement to reduce branches or frontend trees to a fixed count.

- Inventory genuinely unused material using import graphs plus routing, dynamic imports, scripts, CI and deployment references. A zero-importer report alone is not evidence that a file is unused.
- Leave uncertain or still-referenced material in place. Do not rename internal engines merely for cosmetic consistency.
- Where retirement is justified, preserve a complete copy first in a unique dated archive with checksums and restore instructions. Prefer marking inactive material in place when moving it risks breaking dependencies. Move only after verifying original/target paths and references; never overwrite or delete source without verified archival preservation. No branch deletion; document inactive branches instead.
- Put archives outside active compilation, bundling, test discovery and deployment inputs. Ensure archived credentials/data are protected and never published. Verify archive files themselves do not revive duplicate builds or trigger broad runtime-text checks.
- Fix prohibited user-facing jargon selectively while retaining **Co-Scientist** and keeping internal source identifiers stable. Test visible copy, not arbitrary matches in historical archives or valid test fixtures.
- Update README with actual active entry points, setup, required services, commands and recovery instructions. Add CHANGELOG/version metadata if useful, with no false verified claims. Correct blueprint stage order, dashboard prerequisites, data relationships and state claims; distinguish implemented/verified/target features.
- Add CI checks for meaningful contracts: regression tests, configured builds/type checks, unauthorized access, absence of fabricated fallback behavior and accidental archive/build inclusion. A substring blacklist is supplementary, not proof of correctness. Do not require destructive scratch commits to test a guardrail.

## Phase 5: final acceptance and handover

Run against the final commits, in a clean independent checkout without resetting or cleaning the user's workspace. Restore only documented required configuration/assets securely. Never use a real user's project for destructive tests.

### Required scenarios

1. **Pooled review:** create → save protocol → import at least 10 accessible real records → review duplicates → TA/FT decisions → verify eligible extraction for at least three compatible studies → resolve RoB → pool → finalize applicable GRADE → export. Eligibility and effect values must come from the sources, not be forced to satisfy the test. Use an additional documented dataset if the first cohort cannot legitimately pool.
2. **Descriptive review:** insufficient/incompatible pooling data follows descriptive synthesis and completes applicable appraisal/GRADE/export without invented statistics.
3. **Failure/recovery:** unavailable backend/model, failed save, partial import, missing/corrupt PDF, missing data and interrupted background work show accurate state and allow safe retry.
4. **Permissions/conflicts:** anonymous/non-member/viewer restrictions, cross-project ID substitution, concurrent reviewer conflict and duplicate submission. Do not implement an unrequested multi-tab editor, but existing concurrent writes must not silently corrupt records.
5. **Reopen/invalidate:** change eligibility, extraction or cohort after finalized results; affected outputs become stale, recompute correctly, preserve history and export only appropriately labeled versions.
6. **Persistence/recovery:** restart backend/browser; saved state remains consistent. Restore a backup into an isolated location and verify representative records and files. Verify deployment configuration and storage behavior on the actual intended target before claiming production readiness; a local browser run is not deployment proof.
7. **UI parity:** classic and compact at target viewports, keyboard-only actions, browser history, refresh, project switching and pinned decision controls.

At each stage reconcile displayed counts, API results, persisted state and export contents. Download and inspect artifacts; a working button or screenshot alone is insufficient. Run the focused regressions, affected integration tests, frontend build/type checks and required project CI. Explain timeouts/failures and repair them without deleting tests or fabricating passes.

### Deliverables

- Completed acceptance matrix with per-scenario evidence and exact repository commit(s).
- Source changes and regression tests, grouped into reviewable changes; before/after behavior and rollback instructions.
- Executed commands, pass/fail/skip counts, durations, environment and dependency limitations. External-service checks clearly separated from mocked tests.
- Browser screenshots for layout/flows, representative export validation and count reconciliation.
- Archive manifest, verified recovery procedure and confirmation that no user data/files/branches were discarded.
- Updated `.agents/DECISIONS.md` for protocol/product decisions, accurate README/blueprint and a concise known-limitations list.
- Re-index after edits using:

  ```powershell
  & ".venv/Scripts/python.exe" -m graphify update .
  ```

### Completion rule

Do not stop at a plan, a successful build, a screenshot set or a happy-path demo. Finish necessary implementation and verification within authorized scope. If genuinely blocked by missing credentials, unavailable services or a required product decision, identify the exact affected acceptance items and continue independent work. Never claim blocked items passed.

Final sign-off must state: **which workflows passed, on which commits, in which environment, what remains unverified, and how to roll back.** Do not claim the system is foolproof.
