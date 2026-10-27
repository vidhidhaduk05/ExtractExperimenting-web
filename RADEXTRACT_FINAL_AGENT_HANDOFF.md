# RadExtract: final implementation and verification handoff

Prepared: 27 October 2026

Updated companion: `RADEXTRACT_UPDATED_BLUEPRINT.html`. This revision includes the user's confirmed request for spreadsheet-style inclusion AND exclusion criteria with right-column importance-weight sliders, generic protocol clarification, reproducible score explanations and primary-source statistical validation requirements. Read the entire required addition near the end; it is part of acceptance, not background.

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

## Required addition: protocol autofill, clarification, criterion weights and research validation

This section is part of the implementation contract, not an optional future idea. Implement protocol persistence/clarification and score auditing during scientific correctness work; deliver the spreadsheet editor during UI work, before final acceptance. Read this together with Phases 0–5. Existing code observations below were inspected on 27 October 2026 and must be rechecked against the implementation checkout.

### A. Exact user intent and vocabulary

The user clarified that the requested sliders are **criterion importance weights**, for BOTH inclusion and exclusion criteria. They are not per-study probability overrides, not exclusion-threshold sliders and not controls for changing confidence intervals. Human/animal scope was only an example. This applies to arbitrary protocol criteria: medication identity, class, dose, route, duration, washout, co-interventions, diagnosis, age, imaging test, comparator, outcome definition, follow-up, design, setting, language, dates or publication type. Do not build a species-specific feature or silently import generic exclusions.

Keep five concepts separate:

| Concept | Meaning | Where it appears |
|---|---|---|
| Eligibility rule | User-confirmed requirement or reason for ineligibility | Protocol criterion row, with scope and source |
| Criterion weight | User-set relative influence on the overall recommendation score | Rightmost slider and numeric field on BOTH criterion tables |
| Model evidence score | Model output for the defined criterion question on one study | Study calculation breakdown; not editable as if it were an observation |
| Decision threshold | Cutoff applied by a versioned recommendation policy | Advanced policy details; distinct from weights |
| Confidence interval/bound | Uncertainty estimate for a defined statistical quantity under a stated sampling method | Validation summary, with numerator, denominator, method and assumptions |

Weight 0.90 means relative influence of 0.90 on a documented scale. It does not mean 90% certainty, a 90% confidence level, or automatic exclusion. A strict rule is separate from a weighted preference. No new automatic final human decisions are authorized by this UI.

### B. Protocol autofill and missing-context questions

1. Extract proposed PICO and eligibility criteria from the supplied protocol/question. Keep each criterion atomic where possible, with a stable ID, direction (inclusion/exclusion), human-readable condition, machine-readable operator/value where supported, source quotation/location, scope and confirmation state.
2. Preserve medication details and logical relationships. Do not reduce a rule such as a particular drug/dose/duration/comparator to a loose keyword. Represent AND/OR groups, conditional rules and explicit exceptions. An inclusion list is not necessarily all-AND; a row score cannot silently erase that logic.
3. Differentiate stated, suggested, missing, contradictory and not-applicable fields. Generated suggestions remain visibly unconfirmed. Mark clinical synonym/drug-name mappings as suggestions when not supported by the protocol; validate against appropriate maintained authoritative terminology if implemented. Never infer equivalence merely from string similarity.
4. Conduct a protocol completeness/consistency check on upload, generation, saved manual edits and before screening. Ask only consequential missing/conflicting questions; absence of a comparator/outcome restriction can be intentional. Allow explicit unrestricted/not-applicable choices. Do not impose language, date, design, drug, species or other limits without confirmation.
5. Questions explain what is missing, why it affects eligibility, and quote the relevant protocol passage or state that none was found. Offer appropriate mutually exclusive choices and free-text refinement. Collect multiple related gaps in a reviewable list instead of one repeated notification per study.
6. Support project/protocol-level clarification separately from study-specific ambiguity. User answers explicitly choose scope; a single-study answer must not silently become a global eligibility change. Global answers update the saved protocol version and relevant criterion IDs. Preserve author, timestamp, prior value and supersession history.
7. Deduplicate open/resolved questions using project, protocol version, criterion and ambiguity identity. Refresh/restart must retain answers. Re-ask only if a meaningful protocol edit makes the old answer inapplicable or contradictory.
8. Do not decide eligibility from a rule that is both missing and consequential. Mark affected recommendations pending clarification; do not stop unrelated criteria or overwrite prior human decisions. A missing study detail is unknown, not evidence of absence; unknown medication dose/duration must not be reported as an observed mismatch.

Examples are illustrative: unspecified dose range, undefined prior-treatment eligibility, ambiguous comparator, mixed adult/pediatric cohorts, unclear case-series eligibility, and conflicting outcome timing. Implement a generic schema, not one hardcoded question per example.

### C. Responsibility and notification wiring

Current inspected responsibilities: `services/jev_screener.py` constructs questions/state, calls the local engine and composes recommendations; its `compose()` generates limited population/intervention clarification templates. `services/clarification_generator.py` provides a model-assisted path. The frontend `ClarificationNotificationCenter.tsx` polls pending backend questions (six seconds in the inspected version) and displays them. The engine itself does not send browser notifications.

Use the configured local engine for criterion scoring. The backend owns protocol gap detection, question persistence, rule application and reproducible arithmetic. A language-model assistant may extract criteria or phrase a question, but must not fabricate scores, rewrite evidence or invent a statistical guarantee. UI copy uses Co-Scientist. Trace actual provider/fallback identity internally. Build on the existing clarification service after checking project/study scoping and authenticated authorship; do not create a competing inbox.

Protocol-scoped questions must be retrievable even when no studies exist. Check current schema assumptions (including required study IDs and joins) and use reviewed additive migrations if needed. Avoid fake study IDs to fit the old schema. Show the question inline beside protocol and in the project clarification inbox; keep a pending entry until resolved. Toast expiry does not resolve the question. Link the notification to the correct protocol/criterion or study/stage. Track-as-todo must reference the same question, not duplicate it.

### D. Spreadsheet-style editor alongside protocol

Provide two clearly named sections, **Inclusion criteria** and **Exclusion criteria**, in the protocol workspace. Each lists one criterion per row. The weight slider is the RIGHTMOST column, with its exact numeric value and keyboard-editable numeric field.

Recommended desktop columns: criterion/variable; condition or allowed value; source/confirmation; rule mode; **weight [slider + number]**. Example labels may use drug, dose or design, but rows come from the actual protocol. Show source text and complex logic on expansion rather than making the table unreadably wide. Keep the criterion name visible when scrolling, sensible row heights and readable text. On phones, expand a criterion into a labeled editor preserving access to its weight. Follow 1440/903/390px and short-viewport checks.

Rule mode distinguishes **required eligibility rule**, **weighted recommendation signal**, **inactive**, and any supported not-applicable state. Weight controls for a strict rule must explain that a soft weight cannot cancel a required rule; disable or separate the soft weighting control where it has no mathematical role. A zero weight is not permission to disable a required protocol rule. Changing strict eligibility requires an explicit protocol edit and version increment.

Sliders may use a 0.00–1.00 importance scale with 0.01 steps, a matching number input, clear endpoints and accessible labels. This is a UI design choice, not a validated probability scale. Show defaults, unsaved changes, revert-to-saved and preview/apply controls. Do not silently normalize visible values; if the scoring method normalizes them, show effective normalized values in the breakdown.

Draft sliders update a preview, not persisted eligibility or human decisions on every pointer movement. Preview reports affected records and representative score changes against fixed stored evidence. Saving a policy requires suitable project permissions, preserves the prior policy and audit trail, and marks affected evaluations stale/pending recomputation. Scope is project/stage/protocol version; users must not accidentally change other projects or other reviewers' finalized decisions. Distinguish personal view preferences from shared scientific policy.

### E. Weighted calculation contract

Do not replace the current model output with a user-entered value or call a weighted sum a probability. First trace the active engines and every scoring/routing path. Record actual equations and known defaults. Existing code has more than one confidence calculation; identify which produced each displayed result. Both fast and standard paths must consume the same saved criteria and confirmed rules, with explicit unsupported-criterion handling.

Specify and test the soft aggregation method before implementation. It must expose direction, evidence polarity, raw score, missingness, user weight, effective weight, per-criterion contribution, aggregation formula, final recommendation score and threshold. Any formula introduced here is a new heuristic until calibrated/validated; label it accordingly and compare it against the baseline. Do not learn or invent arbitrary weights from prose.

For inclusion, stronger supporting evidence may increase the score; for exclusion, stronger evidence of an applicable exclusion may decrease it. Increasing a weight must have the mathematically documented effect given that criterion's evidence; it need not always move the outcome toward inclusion or exclusion regardless of match. Define interactions, missing values, correlated criteria, all-zero weights, normalization and grouped conditions. Avoid double-counting synonymous drug/design rules. Never let positive soft signals compensate for a confirmed hard exclusion, or let a required inclusion failure be hidden by unrelated positive signals. Human review remains final.

Numerical formula changes and comparison operators require regression tests and versioning. Preview numbers are provisional; they must not appear in finalized exports as validated results. No ad hoc threshold/weight change can retain the old calibration badge.

### F. Explain the actual recommendation, not a generated story

Store an immutable evaluation trace linked to project, study/report, stage, protocol, criterion set, model/version/config, input-text hash, policy/weights, threshold and calibration versions, timestamp and actual fallback provider. Preserve raw outputs at adequate precision; round only for display. Include criterion applicability/unknown states, checked source text and page/offset when available. Never present an invented quotation or a model score as proof of a source passage.

Current inspected local scorer uses `softmax(logits / temperature)` for categorical outputs; `noul` takes a particular class output. Choice confidence can be normalized entropy `1 - H(p)/log(K)`. That measures output concentration, not validated correctness. The wrapper uses the strongest exclusion candidate, population/intervention complements and a minimum-match inclusion score; another module has logistic fusion with fixed defaults. These distinct quantities must have separate labels. A generic 95% badge is unacceptable without identifying its quantity and validation.

Show a concise study summary and expandable **How calculated** table: criterion → evidence/missingness → raw score → weight/contribution → threshold/policy result. State why a clarification was requested and which confirmed answer was used. The protocol page shows rules/settings/validation, not fabricated study-specific scores before any study was evaluated. Offer exportable JSON/CSV traces and a human-readable methods summary matching the actual computation. Replaying the trace under the same version must reproduce the score and recommendation.

### G. Research validation and statistical intervals

Primary sources reviewed for this specification are listed below. There is no universal best confidence algorithm. Calibrating probability estimates, selecting an exclusion threshold, estimating recall, and quantifying per-study uncertainty are different tasks. A model's self-reported confidence, a softmax output, entropy, two agreeing prompts, or sigmoid fusion is not a validation study.

**Observed defect requiring regression:** `screening_confidence.py::_sens_lower_bound` uses a normal/Wald approximation. When observed sensitivity is one, its variance is zero and its lower bound becomes one for any positive sample size. `ALPHA=0.95` is also ambiguously named and the inspected function ignores that argument while hardcoding the 95% quantile. `select_threshold` searches multiple cutoffs on the same positives, returns fixed fusion weights, and calls this conformal calibration. Audit this before preserving any guarantee language. Verify live callers; an unused function is a code defect, not proof that a current project's displayed confidence used it.

For a fixed classifier/threshold evaluated on an independent representative set of adjudicated eligible studies, use a defensible one-sided binomial lower bound on sensitivity; a conservative default for sparse failures is Clopper–Pearson. For k successes among n eligible studies, confidence 1-alpha, lower bound is 0 if k=0, otherwise `BetaQuantile(alpha; k, n-k+1)`. With no misses, it is `alpha^(1/n)`, not one. At 95% one-sided confidence, 50/50 gives about 0.941845; at least 149 independent eligible examples with no misses are needed for that bound to exceed 0.98. These are illustrative binomial calculations, not a universal sample-size rule or a guarantee for this project. Multiple thresholds, dependent reports, adaptive samples and reused test data invalidate that naive interpretation. Sources: NIST references below.

Separate model fitting, calibration/policy selection, and independent final validation at study/review level to prevent leakage from duplicate reports. Fix the operating policy before the final validation. If sample size precludes this, show insufficient evidence rather than relaxing the requirement. Check any multiplicity/sequential tuning through an appropriate validated statistical procedure. A generic bootstrap over actively selected labels does not solve selection bias. Account for clustered reports and finite-population/random-audit designs; use a justified cluster or design-based method where binomial independence is inappropriate.

Evaluate probability calibration on representative human-adjudicated labels with reliability plots, proper scoring metrics such as Brier/log loss and uncertainty; do not use accuracy or a single ECE number alone as a safety claim. Temperature scaling or other calibration is a candidate to compare with appropriate held-out data, not an automatically best method for every criterion. The full weighted/policy output needs its own validation; calibrated individual criterion outputs do not imply a calibrated aggregate. Preset temperature buckets are not proof of project-specific calibration.

Report recall/sensitivity, precision where estimable, specificity, confusion counts, missing-text coverage and workload separately, at both TA and FT stages as applicable. Show TP/FN denominators and the exact interval method/confidence level; do not infer specificity from an eligible-only test set. Report by important designs, language, publication period and review domain when the sample supports it; otherwise disclose sparse evidence. A lower-bound target and a confidence level are separate settings. Use a pre-specified 95% validation confidence level by default; any change must be explicit, versioned and must not silently manufacture a passed safety target.

Keep recommendations human-confirmed by default. Thresholds/weights may help prioritize and explain; new automated final exclusion is outside this handoff. Existing automatic-routing behavior must be identified and constrained to a reviewable proposal queue until separately validated and explicitly enabled under protocol governance. Preserve historical actions. Do not claim 98% sensitivity at 95% confidence merely because 50 labels exist, prompts agree, or a code constant says so. Existing targets are product choices to justify, not universal research standards.

If a conformal/risk-control method is retained, identify the actual published algorithm, risk definition, finite-sample correction, sampling/exchangeability assumptions and precise guarantee. Expected-risk control is not interchangeable with a high-probability guarantee that recall exceeds a target. A Wald-bound cutoff search must not be labeled conformal risk control without a valid derivation and tests.

Any protocol, model, weighting, threshold, stage or material domain change invalidates prior applicability unless supported by a documented validation scope. Show not calibrated / validation insufficient / validation stale instead of recycling the old percentage. Continue human review rather than blocking all work when validation data are insufficient. Use model-independent, appropriately sampled audits; record sampling design and adjudicated reversals. Repeated monitoring needs a sequentially valid plan or pre-specified fixed audits, not unlimited repeated unadjusted 95% intervals.

### H. Required tests and acceptance artifacts for this addition

- Arbitrary medication/dose/duration/comparator and other protocol criteria round-trip with stable IDs, evidence and logical grouping; no species-only implementation.
- Omitted consequential restriction creates one project-scoped question; stated/unrestricted/not-applicable rules do not get re-asked; contradictory rules are flagged. Answers survive refresh, job restart and project switching and are included in every affected scoring path.
- Project answer versus study-only answer has correct scope; another project/user cannot read or mutate unauthorized policy/questions. Failed answer/save retains the draft and does not advance or claim success.
- Both inclusion and exclusion lists have accessible slider/numeric controls in the rightmost column. Preview does not mutate data; apply versions the policy, preserves history and marks affected evaluations stale. Cancel/reset restores saved values.
- Hand-computed aggregation examples reproduce contributions and final score; enforce correct polarity, bounds, grouped-rule behavior, hard-rule precedence, unknown/missing evidence, all-zero weights and normalization. No NaN, fabricated contribution or silently renormalized slider display.
- Raw-model score, entropy confidence, heuristic aggregate, calibrated estimate and validation CI are never mislabeled or mixed. Evidence text/anchors are actually in the saved source.
- Exact-binomial reference tests cover n=0, k=0, k=n, one miss and boundary confidence levels. The 50/50 lower bound must not be 1. Test consistent alpha/confidence semantics, score ties, >= versus > operators and threshold selection/validation separation.
- Changing weights/protocol invalidates the validation badge and affected traces; human decisions remain untouched. Replay/export of a historical evaluation uses historical settings, not today's sliders.
- Independent blinded adjudication/validation and representative sampling are documented. No automatic high-confidence claim when there are too few positives, unresolved labels, label leakage or out-of-scope populations. Review methodology/statistical validation with an appropriately qualified reviewer before making safety/guarantee claims.
- Add screenshots at all target widths of protocol autofill, pending questions, BOTH criterion tables, weight preview, study calculation detail and validation summary. Add trace export, methods report and reproducible mathematical reference tests to final acceptance.

### I. Primary methodology references and limits

These support the design distinctions; they do not validate RadExtract or establish that a particular weighting formula is best. This was a focused primary-source review, not an exhaustive systematic review of all screening tools. Source access date: 27 October 2026.

1. Guo C et al. (2017), [On Calibration of Modern Neural Networks](https://proceedings.mlr.press/v70/guo17a.html). Demonstrates miscalibration and evaluates post-hoc calibration including temperature scaling. Its empirical findings are a method candidate, not evidence that this engine is calibrated.
2. Thomas J et al. (2021), [Machine learning reduced workload with minimal risk of missing studies: development and evaluation of a randomized controlled trial classifier for Cochrane Reviews](https://pmc.ncbi.nlm.nih.gov/articles/PMC8168828/). Illustrates distinct development, calibration and evaluation datasets and recall-focused validation. RCT identification results cannot be transferred to arbitrary medication/protocol eligibility.
3. [Cochrane Handbook, Chapter 4: Searching for and selecting studies](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04), especially section 4.6. The accessed text distinguishes supported prioritization from unvalidated automated stopping/elimination, noting the status of that recommendation at its stated time of writing. Do not generalize a narrow validated classifier to all reviews.
4. [NIST exact binomial confidence limits](https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbici.htm) and [NIST Technical Note 2119, Estimating Instrument Performance](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2119.pdf). Binomial interval methodology and boundary behavior; its sampling assumptions still need to be met.
5. Angelopoulos AN et al., [Conformal Risk Control](https://arxiv.org/abs/2208.02814), revised 2025. Distinguishes a formally specified expected-loss guarantee from loosely named threshold heuristics. Other guarantee types require their own justified methods and assumptions.

### J. Files to hand to the implementing agent

Provide this entire Markdown handoff and `RADEXTRACT_UPDATED_BLUEPRINT.html` from the same workspace. The HTML is a detailed target-state feature/layout companion; this Markdown defines implementation order, preservation rules, mathematical safeguards and acceptance gates. Earlier documents are background, not additional competing work orders. The implementing agent needs repository access and must re-check current state.
