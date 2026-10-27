# Screening-to-PRISMA live demo: master decisions and validation plan

Date: 2026-10-27 (Asia/Calcutta)
Status: agreed product direction and proposed acceptance plan; implementation and validation pending.
Audience: internal engineering and meeting preparation. Internal model names must not appear in the public interface or public documentation.

## 1. Purpose and scope

Deliver a credible live demonstration of a complete, persistent review workflow: upload an existing protocol → extract settings → reviewer edits and approves → import references and resolve duplicates → title/abstract screening → full-text retrieval and screening → data extraction → appraisal and synthesis where applicable → reconciled PRISMA and exports.

Accuracy, reviewer control, traceability, and recovery take priority over speed or feature breadth. No claim of foolproof screening or completed validation without evidence.

This document is the consolidated plan for this work. Append subsequent decisions here; add a pointer in .agents/DECISIONS.md. Historical decisions remain history; this scope governs the demo work where earlier plans conflict.

## 2. Confirmed product decisions

- Preserve existing PICO, protocol-authoring, and other future features for later use; do not delete them.
- Keep future-feature descriptions visible on the landing page for meeting discussion. Disable only their launch/navigation actions, including keyboard activation, with a clear unavailable/coming-later state. Inventory and explicitly classify actions before changing them; active review actions remain usable.
- Uploading an existing protocol remains active. Manual addition, editing, and removal of inclusion/exclusion criteria remain active.
- Protocol extraction reads and structures the reviewer's existing document; it must not silently rewrite its scientific intent or invent requirements.
- Reviewers approve criteria and extraction settings before they govern processing.
- Reviewers decide differentiating eligibility interpretations. The system identifies shared ambiguity and asks targeted questions.
- A reviewer can apply a clarification to this study only or to the review as a versioned rule. Preview affected records; preserve previous decisions and reassess only the relevant scope. Do not overwrite approved human decisions silently.
- Reduce the uncertain queue by resolving recurring ambiguity, not by forcing unsupported include/exclude decisions.
- Distinguish ambiguous criteria, conflicting evidence, missing information, missing full text, and technical failure; these require different resolutions.
- Use local Laya for primary screening (JEV_MODE=on; JEV_PROVIDER=laya). Record actual runtime provider and fallback on every relevant run.
- Retain the larger-model generation capability in the testing architecture requested below. Its need and resource sizing must be measured, not assumed. This is not a decision to remove Biomni or to reserve a GPU continuously.
- All public copy uses Co-Scientist terminology and the Master Theme. Keep internal engines and orchestration invisible in product copy.

## 3. Mandatory testing approach: Jev Ultrafast × Laya

Internal label: **Jev Ultrafast × Laya: Automated Field Entry & Verification**.

User-supplied setup description (reported prior setup, not independently verified in this planning session): Jev Ultrafast powered by the Local Laya Engine (ONNX) for System-I action decisions, with Biomni-R0 (32B) on a Tesla V100S GPU for verbatim field generation; an agent automates browser interaction with protocol input fields and independently validates each value.

Treat this as the required browser-testing workflow throughout the validation week. Verify the actual orchestration exists and operates as described before reporting it as executed. Inspect existing local dependencies first. Identify the exact upstream Jev Ultrafast repository, revision, license, and integration requirements; clone it into the repository only if required and absent. The user has authorized that conditional clone. Do not guess an upstream URL, treat local Laya as proof that browser orchestration exists, or copy credentials. Record the pinned revision and dependency approach. Keep the roles explicit:

1. Laya makes System-I action decisions for automated field entry and verification.
2. Biomni-R0 generates candidate verbatim field content where generation is needed.
3. The browser agent enters values through the real user controls, saves, reloads, and checks persisted results.
4. An independent oracle compares values against reviewer-annotated expected data and source passages. The generator's own approval, or Laya agreeing with generation, is not sufficient evidence of correctness.
5. Apply this approach to all browser acceptance scenarios. Complement it with deterministic unit, API, integration, and reconciliation checks; a browser agent does not replace those checks.
6. Record engine/model versions, execution provider (CPU/CUDA), endpoint identity without secrets, criteria version, fixture version, application revision, actual GPU, timings, screenshots, and pass/fail evidence.
7. If an engine is unavailable, mark the affected test blocked or failed. Never substitute another provider silently or claim the specified setup passed.

Verify Laya's ability to extract protocol fields separately from its ability to verify candidate values. ONNX classification does not by itself establish reliable free-form generation. Start with Laya-led field mapping/verification; use the requested generation engine where needed, then verify against the source and reviewer labels. Record the actual generator for every field.

## 4. Workflow requirements and acceptance gates

### A. Baseline and architecture audit

- Query Graphify first; trace existing services and callers rather than adding competing pipelines.
- Inventory protocol extraction, criteria storage, screening routes, clarification handling, extraction, appraisal, synthesis, PRISMA, exports, and runtime model routing.
- Read existing tests and decision history; distinguish implemented behavior from unverified claims.
- Deliver a gap register with severity, reproduction, affected stage, owner, and evidence.
- Gate: every demo step maps to its real read/write path and has an executable acceptance scenario.

### B. Protocol upload and editable criteria

- Parse supported uploaded formats; detect unreadable/scanned documents and expose parsing failures.
- Extract population, eligible designs, inclusion/exclusion rules, alternatives, exceptions, thresholds, timing, outcomes, extraction fields, and explicitly stated appraisal/synthesis settings.
- Store exact source passage and page/section when available. Do not invent a page number when unavailable.
- Preserve AND/OR, negation, subgroup conditions, and exceptions. Clarify contradictions rather than resolving them silently.
- Assign stable criterion IDs, stage applicability, and criteria versions. Permit manual additions, edits, deletions, and approval.
- Gate: every annotated field is either correctly extracted with provenance or visibly flagged for review; edits survive save/reload and govern subsequent screening. No silent omissions or invented approved criteria.

### C. Reference import, provenance, and duplicates

- Preserve original record and source metadata. Detect exact and near duplicates with reversible reviewer resolution.
- Distinguish duplicate reference records from separate reports of the same study; link related reports without discarding their evidence.
- Test repeated imports, missing identifiers, conflicting metadata, merge, keep-both, and undo.
- Gate: no unexplained record loss; all count changes trace to recorded actions.

### D. Title/abstract screening and reviewer clarifications

- Evaluate applicable criteria separately: met, not met, unclear, or not applicable, with evidence and stage.
- Do not treat an absent abstract or unreported detail as demonstrated ineligibility. Use conservative title-stage rejection and escalate when evidence is insufficient.
- Apply explicit reviewer-approved eligibility logic, including exceptions. Every exclusion has a supported criterion and recorded reason.
- Group related uncertainties into targeted clarification questions. Preview the effect of reusable interpretations and preserve human overrides.
- Separate recommendations, reviewer decisions, consensus/conflicts, and final eligibility.
- Gate: compare with adjudicated labels; inspect every false exclusion. Automatic exclusion remains gated until reviewer-approved performance thresholds and confidence intervals are satisfied on held-out data. Do not interpret model confidence as measured accuracy.

### E. Full-text retrieval and eligibility

- Distinguish sought, not retrieved, retrieved but unreadable, awaiting decision, included, and excluded.
- Verify correct article identity and account for supplements and linked reports.
- Retain full-text exclusion reasons and evidence; a retrieval/parser failure is not an eligibility exclusion.
- Gate: each final full-text decision is reproducible from the source and criteria version; unresolved records remain explicit.

### F. Data extraction

- Extract only review-approved fields; validate types, units, denominators, arms, time points, and missing-value states.
- Attach exact source quotes and page/table/cell references where available; verify quote existence and that it supports the value.
- Test narrative text, tables, scanned pages, contradictory sections, multiple reports, and absent values.
- Separate proposed from approved data. Derived values require source inputs, formula, and reviewer approval. Unsupported data stays missing or flagged.
- Gate: measure field-level accuracy against manual reference data; no fabricated quotes or unsupported approved values in the acceptance set. Edits and undo persist correctly.

### G. Appraisal and synthesis

- Select appraisal tools from study design and approved review requirements; unclear cases go to the reviewer.
- Keep reporting completeness separate from risk of bias. Preserve question-level evidence and reviewer corrections.
- Use approved, compatible extraction values for synthesis; prevent repeated cohorts or reports from being counted as independent studies without justification.
- Gate: calculations match independently computed fixtures; tool-specific judgments and exports remain consistent. Unsupported analyses are visibly unavailable.

### H. PRISMA and exports

- Audit current counting implementations together; establish consistent definitions across UI and export formats.
- Distinguish records, reports, and studies; account for source categories, duplicates, automation removals, screening, retrieval, full-text reasons, and final inclusions.
- Keep pending decisions explicit. Do not relabel awaiting decisions as reports not retrieved merely to balance a diagram; audit the existing historical rule before changing behavior.
- Recompute after duplicate reversal, clarification, decision correction, linked-report changes, and re-screening.
- Gate: every count drills down to underlying IDs; applicable conservation checks pass; diagrams, spreadsheets, documents, and API agree for completed and in-progress reviews.

### I. Import History: known demo-only gap

User report, 2026-10-27: Import History currently appears only in the demo version and is not functioning against real project data. Treat this as an unverified implementation gap to reproduce during baseline, not a completed feature.

- Make Import History part of the active review workflow and live-demo acceptance scope.
- Trace the existing demo UI, import handlers, backend persistence, and project access rules before implementation; reuse established abstractions.
- Persist actual import runs with a stable run ID, project, source/database, filename or supplied source label, authenticated actor, timestamps, status, and imported/duplicate/failed counts with precise definitions.
- Link imported records to the relevant run and preserve provenance across duplicate resolution. Do not mix historical run totals with current deduplicated PRISMA totals.
- Show real success, partial success, failure, and interrupted states. Empty history must remain empty; never substitute demonstration entries for backend errors or absence of data.
- Verify refresh/restart persistence, project isolation, repeated import and retry behavior, supported import sources, partial failures, and reconciliation to actual records. Retries must not silently duplicate records or falsify history.
- Gate: perform a real reference import in a fresh project, inspect its history entry, reload/restart and inspect it again, then verify counts and provenance against database records and PRISMA definitions.

## 5. Reference datasets and aggressive testing

Create reviewer-adjudicated fixtures before tuning. Use a small fully traceable demo set plus a broader challenge set with clear includes/excludes, borderline cases, missing abstracts, mixed populations, exceptions, negation, conflicting criteria, tables, scans, linked reports, and retrieval failures.

Maintain separate development and held-out cases. Reviewers resolve disputed labels. Choose dataset size and acceptable error thresholds before testing; report uncertainty and eligible-case sample size, not accuracy alone. Passing a small demo set is not general clinical validation.

For each run record: case ID, input/source version, expected result, observed result, evidence, provider, reviewer adjudication, defect, fix revision, and retest result. Do not store credentials or sensitive content in public logs.

Required tests:

- Deterministic tests for criteria logic, state transitions, field validation, and PRISMA arithmetic.
- Integration tests from protocol approval through persistent screening/extraction/export.
- Real browser tests using the required Jev Ultrafast × Laya workflow, with independent field verification after reload.
- Recovery tests: failed save, double click, retry, refresh, restart, timeout, model outage, pause/resume/cancel, and partial completion.
- Reviewer tests: study-only versus reusable clarification, contradictory edits, changed criteria versions, conflict resolution, and human override retention.
- Repeated fresh-project runs: no fixture/demo fallback masquerading as real backend success; no carry-over state masking failures.
- Responsive browser checks at 1440px, 903px, and 390px, including keyboard-disabled future actions and active upload/edit controls.

## 6. Seven-day execution sequence

Relative days; meeting date is not supplied. Adjust dates once known. This document does not schedule unattended runs or claim testing has begun.

| Day | Main work | Evidence required |
| --- | --- | --- |
| 1 | Baseline audit, verify test orchestration, freeze reference fixtures and metric definitions | Gap register, reproducible baseline, actual provider/device logs |
| 2 | Protocol extraction, editable criteria, versioning, reviewer approval | Field-by-field oracle comparison and persisted browser edits |
| 3 | Import/deduplication and screening logic | Held-out decisions, false-exclusion analysis, reversible-count checks |
| 4 | Clarification grouping, reviewer distinctions, full-text review | Scoped re-evaluation, retained overrides, retrieval-state checks |
| 5 | Extraction, evidence verification, appraisal/synthesis paths | Field accuracy report, source checks, independent calculations |
| 6 | PRISMA/export reconciliation and failure recovery | ID-level count ledger, matching exports, interruption/retry evidence |
| 7 | Full rehearsal on the release candidate; targeted fixes and regression | At least two clean full rehearsals, known limitations, release verdict |

After each fix, rerun the reproducer and affected regression tests. Repeat full rehearsal after material workflow changes. Preserve a daily pass/fail/blocked log; unresolved failures remain visible.

## 7. Live demo acceptance and runbook

Demonstrate a real saved project: upload protocol → inspect evidence → edit criteria → approve → import references → resolve duplicate → screen → answer one reusable clarification → inspect a full text → extract and verify a value → correct/save/reload → inspect appraisal/synthesis if applicable → reconcile and export PRISMA.

Before meeting: verify deployed revision, backend/model/tunnel health, correct execution providers, available resources, persistent storage, and the complete walkthrough. Keep a separately labeled prepared project and captured evidence as recovery material; never present replayed or seeded results as live execution.

Release gates:

- [ ] Active review workflow works end to end with persisted data.
- [ ] Import History shows actual persisted import runs and passes fresh-project, reload/restart, failure, and count checks.
- [ ] Future landing features remain visible with inactive launch actions.
- [ ] Protocol fields and editable criteria pass annotated checks.
- [ ] Reviewer clarifications reduce repeated ambiguity without hiding unresolved evidence gaps.
- [ ] Screening meets pre-agreed held-out gates; all false exclusions investigated.
- [ ] Extraction provenance and approved values pass independent checks.
- [ ] PRISMA reconciles and exports agree.
- [ ] Failure recovery and human overrides pass.
- [ ] Required browser-testing engine setup is verified, with evidence.
- [ ] No unresolved critical/high-severity defects in the demo path; remaining limitations documented.
- [ ] Two complete release-candidate rehearsals pass after the last material change.

## 8. Cluster resources and implementation discipline

Measure actual allocated versus used CPU, peak host RAM, GPU memory/utilization, model loading, idle time, and wall time. Keep the API lightweight; investigate duplicated worker models and reserve GPU jobs according to real work. Optimize only after correctness baselines; do not assume 32 GB RAM or a whole GPU is required for every stage.

No deployment, model removal, or resource-setting changes are authorized by writing this plan. During implementation follow Graphify navigation/update, GRAVITAS verification, the Master Theme, and applicable Jules workflow for broad engineering/UI work. Test fixtures belong in isolated repository tests; keep local TESTING data out of version control.

## 9. Open items to resolve during baseline

- Meeting date, exact demo protocol, and target deployment revision.
- Which landing actions are future-only versus active for the demo.
- Verify Jev Ultrafast orchestration availability and actual model/GPU configuration.
- Reviewer/adjudicator availability, benchmark size, and performance acceptance thresholds.
- Exact supported upload formats and which appraisal/synthesis paths are applicable.
- Whether the existing extraction generator meets accuracy gates; retain or change it based on evidence.

## 10. Evidence and decision log

2026-10-27: Consolidated the user-approved direction in this document. No application changes or accuracy benchmarks executed as part of document creation. Prior reported engine setup is recorded as reported, not independently validated.

| Date/run | Revision/dataset | Scenario | Result | Evidence link | Defect/decision and retest |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Baseline | Not run | Pending | Begin Day 1 |

2026-10-27 addendum: User identified Import History as demo-only/nonfunctional. Added it as an active workflow gap and mandatory live-demo release gate; implementation remains pending.

## 11. Graphify-guided accuracy and speed review — 2026-10-27

Status: static source review findings; no benchmark or functional reproducer executed. These are priority audit/fix targets, not verified fixes. Graphify query and path traced AIScreeningPipeline → llm_extractor → jev_screener → jev_client → LayaModel.system_one_batch.

| Priority | Observed source behavior | Required action and validation |
| --- | --- | --- |
| P0 | jev_screener.py:312-330 and 385-405 automatically exclude on search-string mismatch with fixed confidence 0.99 | Treat search syntax as retrieval metadata/ranking rather than an independent eligibility veto. Only reviewer-approved evidence-based eligibility rules may exclude. Test synonyms, indexed terms absent from abstracts, and valid retrieved records failing literal matches. |
| P0 | jev_screener.py:29-45 normalizes only four PICO fields; compose():209-224 can include based on population/intervention scores. Additional outcomes/design answers do not constitute a complete criterion-by-criterion decision contract | Evaluate every applicable approved criterion and its Boolean logic. Missing answers cannot satisfy mandatory inclusion. Test eligibility exceptions and mixed populations. |
| P0 | Laya config max_len=512; laya_engine.py:152-157 keeps only the leading state tokens; jev_screener.py:68 also limits full text to 20,000 characters | Introduce coverage-aware evidence segmentation and aggregation; test decisive evidence at start, middle, end, tables and supplements. Unknown coverage must not produce a confident whole-document exclusion. Reordering document sections must not silently reverse final eligibility. |
| P0 | laya_extraction_tracer.py:163-181 verifies supplied quote text without first checking its occurrence in the document; threshold is 0.50. Full-text-only fallback labels sentences as page 1 at lines 48-50 | Require source membership and valid location before semantic verification; missing location remains unknown. Validate arm/timepoint/unit/value support and calibrate verification thresholds on held-out examples. No fabricated quote may pass as source-verified. |
| P1 | pico_extractor.py:501 sends the first 8,000 characters to its LLM fallback; lines 522-527 call extraction high-confidence based on populated-field count | Check complete protocol coverage including appendices/tables, preserve source spans, and measure extraction completeness/correctness independently of field count. |
| P1 | prisma2020_sync.py:196 maps open records to not-retrieved; lines 246-249 equate reports and studies | Correct semantic state mapping and linked-report counts; verify all diagram/export implementations on completed and unfinished reviews. |
| P1 | ai_screening_pipeline.py:254-269 iterates one study at a time; jev_screener.screen_batch and LayaModel.system_one_batch already exist | Connect bounded batching to the real active workflow, preserving pause/cancel, persistence, reviewer overrides and ID mapping. Test exact equivalence of batch and single-study semantics. |
| P1 | Fast mode reduces the question set; engine batches all supplied study-question items together; evidence tracer checks candidates sequentially | Improve execution efficiency without omitting required criteria. Bound batch size by tokens/questions and available memory; batch evidence verification and benchmark before increasing concurrency. |

### Accuracy measurement additions

- Reviewer-adjudicate gold labels independently of model suggestions; use a second reviewer and adjudication for disputed/borderline reference cases where feasible.
- Report eligible-study recall, false exclusions, excluded-study precision, abstention/clarification rate, and reviewer time. Report results by protocol, criterion, document type and difficult-case subgroup.
- Hold out entire studies/report families, including near duplicates, to prevent development/evaluation leakage. Include a held-out protocol if making cross-protocol claims.
- Calibrate on development data and freeze thresholds before held-out evaluation. Store model/provider/version and coverage with results. Audit samples of confident decisions as well as uncertain cases.
- Add mutation-style fixtures: change a decisive criterion, negate a sentence, move evidence to the document end, change an arm/timepoint/unit, remove evidence, and confirm the expected decision changes or becomes unclear.
- Do not fine-tune or replace models until the input-coverage, rule-composition, provenance and oracle failures are understood. Model replacement is an evidence-based later option.

### Ultra-fast screening requirement

Ultra-fast is an explicit product requirement. Speed targets below are provisional engineering targets to validate on the actual cluster, not measured claims or an accuracy tradeoff:

- Warm title/abstract screening: target 1,000 records/minute end to end for the agreed representative fixture and criterion set; report actual throughput if this is not met rather than disabling checks.
- First persisted results within 5 seconds after a warmed job begins; progress visible at least once per second where practical.
- Pause/cancel acknowledgement within 2 seconds; bound in-flight batch work and document completion/commit behavior.
- Report cold model-load time separately. Benchmark 100, 1,000 and 10,000 records, short/long abstracts, and different criterion counts. Full-text screening and PDF parsing have separate targets after baseline.
- Measure tokenization, model inference, evidence retrieval, persistence, and browser updates separately; include p50/p95 latency, peak RAM/VRAM, CPU/GPU utilization, retries and fallback rate.
- Keep one warm inference service/session per intended worker boundary; avoid redundant model loading. Use length-aware bounded batches, reusable approved criterion representations, and caching keyed by content hash, criteria version, model version and stage.
- Cache invalidation must follow protocol edits, reviewer clarifications, source correction and model changes. Never reuse an eligibility result across changed rules.
- Avoid repeating title and abstract passes over records with available abstracts unless the approved workflow needs both; retain conservative handling of title-only records and complete stage audit history.
- Use technical outage handling that preserves pending work and alerts reviewers; silent slow LLM fallback must not masquerade as ultra-fast local screening.
- Evaluate speed and accuracy on the same held-out inputs and identical rule semantics. Reject optimizations that increase false exclusions or discard evidence/criteria.

2026-10-27: User explicitly requires ultra-fast screening. Added provisional performance gates and source-grounded accuracy blockers; no runtime performance result claimed.

## 12. Coding-agent handoff and source-column duplicate review — 2026-10-27

Implementation handoff: [CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md](CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md).

User requires a spreadsheet-style duplicate review tab: one column per named import source, candidate duplicate groups as rows, and persistent Confirm duplicate / Not a duplicate / undo decisions. Ask for a source name during import; preserve true original provenance and repeat-import history. Support multiple same-source records per group and multi-record group splitting. Detector reruns must respect rejected duplicate pairs.

Added a staged SLIDERS evaluation rather than claiming it is integrated. Current local evidence-tracer hardening and seven new regressions are documented in the handoff; 29 targeted/neighboring tests passed, with semantic calls mocked. Other workflow changes, clinical benchmarks, browser tests and SLIDERS integration remain pending.

## 13. Planning-only clarification: theme, shield and Rigor Scan — 2026-10-27

User requests planning only for the coding agent. Screening styling edits started in this chat were undone; no new UI implementation is retained. Work packages 8 and 9 in CODING_AGENT_HANDOFF_SCREENING_TO_PRISMA.md now specify the Master Theme repair, replacement of robot icons with the supplied shield style, and the Rigor Scan reference comparison and functional repair gates. Source review identified simulated PDF pages, missing uploaded-check spoke geometry, fixed domain labels/default scores and unperformed-check success claims; these require reproducible tests and fixes before demo claims. Earlier evidence-tracer patch/test status remains separately documented.

## 14. Actual Graphify code graph — 2026-10-27

User requests loading the actual persistent graph in Code Graph. Handoff work package 10 covers the existing API, removal of silent sample fallbacks, snapshot cache invalidation, real corpus metadata, full-corpus community overview with progressive drill-down, deployment artifact availability, and internal access boundaries. Planning only; no code-graph implementation changed.
