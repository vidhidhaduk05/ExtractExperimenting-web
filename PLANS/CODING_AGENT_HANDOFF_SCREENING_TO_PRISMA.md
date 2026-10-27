# Coding-agent handoff: accurate, fast screening through PRISMA

Date: 2026-10-27 (Asia/Calcutta)
Companion decisions and full test matrix: PLANS/SCREENING_TO_PRISMA_DEMO_MASTER_PLAN.md.
Status: implementation handoff, not a completed validation report. Read both documents before coding.

## Objective

Deliver a real, persistent live meeting demo: existing protocol upload → faithful extraction → reviewer edits/approval → source-labelled imports and import history → spreadsheet duplicate review → fast evidence-based screening → full-text decisions → traceable extraction → applicable appraisal/synthesis → reconciled PRISMA/export.

Preserve future PICO/protocol-authoring and other features; keep their landing-page descriptions visible, with future-only launch/navigation actions disabled. Upload, criteria editing and active review actions must work. Maintain Master Theme and Co-Scientist public wording. Internal engine names belong only in internal engineering materials.

## Read first and preserve current work

1. Follow AGENTS.md, Graphify-first navigation, .agents/DECISIONS.md, GRAVITAS, and .agents/rules/jules.md. Read graphify-out/GRAPH_REPORT.md before architectural refactors. Use graphify path for cross-module relationships and update the graph after edits.
2. Inspect git status and existing diffs. There are uncommitted plan/decision/graph changes and a local evidence-tracer patch. Do not reset or overwrite them.
3. Current local patch: services/laya_extraction_tracer.py checks complete quote membership before semantic verification, corrects supplied page locations, preserves unknown pages as null, clears stale verification flags, and abstains from certifying long excerpts based on a truncated prefix. Seven regression cases were added to tests/test_laya_extraction_tracer.py.
4. Observed validation: python -m pytest radextract_platform/backend/tests/test_laya_extraction_tracer.py radextract_platform/backend/tests/test_coded_extraction.py radextract_platform/backend/tests/test_quote_verification.py -q → 29 passed in 33.92s. The seven new cases failed before the patch. These use mocked semantic responses; they establish guardrail behavior, not real model accuracy. Review null-page handling and long-evidence coverage before extending the patch.
5. Ruff is not installed in the current virtual environment; do not claim lint passed. No live browser validation, model benchmark, SLIDERS integration, deployment, or full-week test run has occurred.
6. JULES_API_KEY was absent in this session. Broad implementation must follow the prescribed Jules route when available; otherwise report the constraint and seek the necessary local-work authorization rather than silently bypassing it.

## Work package 1 — Baseline and reference data

- Trace active frontend/API/services through Graphify. Inventory parallel/legacy screening, extraction and PRISMA paths before consolidating anything.
- Reproduce reported Import History demo-only behavior and capture other failures.
- Establish reviewer-adjudicated protocol fields, criterion-level eligibility labels, extracted values and source spans. Use independent second review/adjudication for difficult cases where possible.
- Split by study/report family into development and held-out sets; include an unseen protocol for cross-protocol claims.
- Freeze metric definitions and performance/accuracy gates before evaluation. Record actual model/provider, source/criteria versions, token coverage and hardware.
- Deliver a defect register with reproduction, severity, owner and evidence.

## Work package 2 — Source-labelled imports and real Import History

New explicit user requirement:

- During reference import, ask for the source name, such as PubMed, Embase, Scopus, Web of Science or a custom label. Pre-fill detected source where possible and let the reviewer confirm/edit it.
- Preserve user label alongside detected source/database, filename, original record metadata and per-run provenance. A display label must not overwrite true database provenance or PRISMA source category.
- Persist one real import run with project, actor, timestamps, status, source identity and precise counts of parsed, added, duplicate-linked and failed rows. Explain count definitions; do not conflate historical imports with current active records.
- Repeat imports from the same source attach to the source identity and remain separate history runs. Distinct sources have distinct columns in duplicate review; confirm rename/merge behavior before collapsing identities.
- Show actual saved history after reload/restart, with empty/failed/partial states and no demo-data fallback.
- Gate: fresh project, two sources, repeated import, partial failure, retry, cross-project isolation, source rename and provenance/count reconciliation all pass.

## Work package 3 — Spreadsheet-style duplicate review tab

New explicit user requirement: an Excel-like deduplication tab with **one column per named source** and candidate duplicate groups as rows. The number of source columns equals the number of distinct imported sources. Fixed group/review columns are additional controls, not extra sources.

- Source header: reviewer-supplied name, with access to import runs and original provenance.
- Each row: one candidate group; cells contain records from that source with title, year, authors, DOI/PMID and match evidence. Support multiple records from the same source inside a cell; never discard them to fit one cell.
- Put group status, match reason and review actions in fixed columns. Horizontal scrolling/frozen context should keep wide source matrices usable; detail inspection remains accessible on narrow screens.
- Actions: Confirm duplicate; Not a duplicate / Keep both; and undo/reconsider. Let reviewers select the records involved and choose the canonical record when a group has more than two records.
- Confirming duplicates preserves original records and provenance while linking inactive duplicate copies to the canonical record. Prefer a richer canonical record or an explicit reviewer choice, rather than silently keeping the first imported record.
- Not-a-duplicate is a persistent negative decision. Re-running detection with unchanged records must not silently regroup/re-mark that pair. Multi-record groups must allow splitting a mistaken member out without rejecting genuine duplicate pairs.
- Keep separate reports of one study linked as reports, not deleted as duplicate references. Conflicting identifiers, near-identical titles and transitive similarity chains need explicit tests.
- Existing code to inspect: backend/services/dedup_service.py, backend/routers/screening.py, frontend screening/study duplicate views, tests/test_dedup_service.py and tests/test_duplicate_review.py.
- Current risks: auto_mark defaults true; title similarity >=0.95 unions records without secondary signals; fuzzy matching remains O(N²). Use safe candidate blocking/indexing and reviewer confirmation for ambiguous matches. Demonstrate scaling without lowering precision.
- Gate: named-source columns match imports; accept/reject/undo survive reload, restart and detector reruns; no record/evidence loss; Import History and PRISMA stay consistent.

## Work package 4 — Faithful protocol extraction and reviewer rule approval

- Keep existing protocol upload, manual criteria entry and edits fully active.
- Extract exact inclusion/exclusion rules, all exceptions, AND/OR, thresholds, timing, population/design, outcomes and requested extraction/appraisal/synthesis fields from the complete protocol, including tables/appendices.
- Store source passages and real locations; unknown location remains unknown. Current pico_extractor fallback uses text[:8000] and populated-field count as confidence; replace these as claims of completeness/correctness.
- Stable criterion IDs, explicit structured logic, stage applicability and immutable versions; reviewer approval before use.
- Clarify contradictions and differentiating rules. Allow this-study-only versus versioned review-wide interpretation with a preview of affected records and preserved human overrides.
- Group repeated ambiguities into one reviewer question; distinguish missing evidence, technical errors and criteria ambiguity.
- Gate: all annotated rules extracted correctly or explicitly flagged, no invented scientific requirements, edits persist and affect only intended records.

## Work package 5 — Correct and ultra-fast screening

- Local Laya remains primary (JEV_MODE=on, JEV_PROVIDER=laya). Observe actual provider and execution device; no silent substitution.
- Fix jev_screener search-string veto: current mismatch can produce automatic exclusion with fixed confidence 0.99. Retrieval syntax is not an independent eligibility criterion.
- Compose decisions from every applicable reviewer-approved criterion and exceptions. Population/intervention match alone cannot establish complete eligibility. Missing information is not demonstrated exclusion.
- Track criterion evidence and text coverage. Current local model config is 512 tokens and input truncates leading text; current full-text path also limits characters. Test decisive evidence at the end and in tables/supplements.
- Preserve recommendations, human decisions, conflicts and final eligibility separately. Abstain/clarify rather than force unsupported decisions.
- Wire existing jev_screener.screen_batch / LayaModel.system_one_batch into the actual active workflow with bounded, length-aware batches, correct study/question IDs and partial-failure handling.
- Reuse warm sessions and approved criterion representations. Cache by content hash + criteria version + model/version + stage; invalidate after changes. Avoid repeated title and abstract inference where one approved combined stage suffices.
- Preserve persistence, pause/resume/cancel and reviewer overrides under batching; avoid CPU thread oversubscription and duplicate worker models.
- Provisional targets to validate on actual hardware: 1,000 title/abstract records/minute end to end; first persisted results <=5s after warmed start; pause/cancel acknowledgement <=2s. These are targets, not current claims. Measure 100/1,000/10,000 records, different lengths/criterion counts, cold startup, p50/p95, peak RAM/VRAM and fallback rate.
- Gate: held-out eligible-study recall/false exclusions and precision satisfy pre-agreed thresholds with confidence intervals; inspect every false exclusion. Batch and single-study decisions must have identical semantics. No speed gain by dropping rules or evidence.

## Work package 6 — SLIDERS evaluation and extraction hardening

Exact candidate upstream: https://github.com/stanford-oval/sliders (MIT). This is Stanford OVAL's long-document structured extraction/reconciliation project, not a reference deduplication system and not the frontend Sliders icon.

- Inspect and pin upstream revision/license/dependencies before installing. No proven integration exists in the reviewed checkout. Do not claim it is already active.
- Evaluate as an isolated optional extraction adapter, not a replacement for the whole review platform or fast title/abstract screening.
- Reuse Docling output and document identity, page/table boundaries and supplements where possible. Preserve canonical source spans, record original source text, and track coverage and skipped chunks. Relevance gating must be tested for missed evidence.
- Pin a fully specified reviewer-approved codebook/schema, including field definitions, types, units, arms and time points. Do not allow schema induction to invent scientific fields or eligibility requirements.
- Compare existing extraction versus SLIDERS on the same held-out sources and model configuration where feasible. Record generation/extraction/reconciliation model calls independently of Laya verification.
- Store conflicting candidate values and supporting evidence; reconcile only with deterministic rules or reviewer-approved choices. No autonomous SQL repair of authoritative review records, human decisions or criteria. Run generated SQL/code in an isolated experimental database with bounded permissions/resources; validated candidate results cross the adapter boundary for review.
- Verify complete quote occurrence, true page/table/cell location, numeric value, unit, arm, denominator and timepoint. A real quote with the wrong clinical interpretation must still fail.
- SLIDERS benchmark results on other tasks do not establish clinical-review accuracy. Adopt only if our benchmark improves coverage/correctness with acceptable latency/resources; otherwise retain the current path and document findings.
- Gate: no unsupported approved values or fabricated source quotes in acceptance fixtures; independent field-level scoring, long-document and conflict tests, no loss of reviewer edits. Model agreement alone is not an oracle.

## Work package 7 — Full text, appraisal/synthesis, PRISMA and exports

- Separate full text sought, not retrieved, unreadable, awaiting decision, excluded and included. Verify report identity and linked supplements.
- Require supported full-text exclusion reasons. Retrieval or parser failure is not an eligibility exclusion.
- Select applicable appraisal tools by study design and review requirements; unclear classifications require reviewer action. Reporting completeness remains separate from risk of bias.
- Synthesis consumes approved compatible values; test units, denominators, time points, overlapping cohorts and independent expected calculations.
- Reconcile record/report/study identities and counts across UI/API/exports. Current prisma2020_sync maps open rows to not-retrieved and equates report/study totals: correct the semantics and relevant tests deliberately.
- Every PRISMA box drills down to actual IDs and events; completed and unfinished reviews remain truthful after corrections, duplicate reversal and clarification.
- Gate: matching diagrams/spreadsheets/documents/API counts and independently checked calculations; no unexplained records or count balancing through false states.

## Required testing method and evidence

Use **Jev Ultrafast × Laya: Automated Field Entry & Verification** for browser acceptance tests: local Laya ONNX System-I action decisions; Biomni-R0 32B candidate verbatim field generation where needed; browser entry/save/reload; independent comparison with reviewer-annotated sources and expected values.

The prior setup was user-reported, not verified in this session. Locate the exact Jev Ultrafast upstream; inspect existing dependencies, clone only if needed (user authorized the conditional clone), and pin version/license. Do not guess the upstream URL or equate Laya installation with working browser orchestration. Confirm actual Tesla V100S/device if claimed. Missing engines block relevant acceptance runs rather than silently changing providers.

Complement browser testing with deterministic unit/API/integration tests and PRISMA conservation checks. Add adversarial cases: negation, synonyms, mixed populations, missing abstracts, evidence moved to document end, invented quote suffix, changed number/unit/timepoint, multiple reports, repeated imports, false-duplicate chains, failed saves, timeouts, restart, retry, stale criteria, concurrency and human edits.

Keep expected labels independent of generator/verifier. Publish case-level pass/fail/blocked evidence and confusion matrices; audit confident cases as well as uncertainties. Never describe mocked tests as real model or browser validation.

## Seven-day execution and meeting gate

- Day 1: baseline, orchestration verification, fixtures and threshold definitions.
- Day 2: real source-labelled imports/history and duplicate matrix/persistent review decisions.
- Day 3: protocol coverage, editable approved criteria and grouped reviewer clarifications.
- Day 4: screening correctness, batching and speed benchmark.
- Day 5: SLIDERS comparison, source verification and extraction correctness.
- Day 6: full-text/appraisal/synthesis and PRISMA/export reconciliation; failure recovery.
- Day 7: fixes, affected regressions and two complete release-candidate rehearsals.

This is a sequence, not a guarantee that seven days establishes clinical validation. Accuracy gates take precedence; disclose any blocked scope. Meeting date is still unspecified. No unattended recurring testing has been scheduled.

Final gate: fresh-project walkthrough with real persistence, named-source import history, accept/reject duplicate review, protocol edit/approval, reviewer clarification, full-text decision, source-verified extraction, reconciled PRISMA/export, no unresolved critical demo-path defects, two full rehearsals after the last material change. Resource measurements accompany the result. Prepared fallback material must be explicitly labelled rather than presented as live execution.

## Deliverables from the coding agent

- Scoped patches/PRs with clear acceptance evidence and preserved current work.
- Daily defect/evidence register and updated master plan/decision log.
- Gold/reference fixture definitions and held-out accuracy report.
- End-to-end throughput/resource report and batch/single consistency checks.
- SLIDERS adopt/reject comparison with pinned dependency details.
- Live-demo runbook, known limitations and honest release verdict.


## Work package 8 — Master Theme and Co-Scientist shield (planning only)

User clarification: this chat is for planning/handoff; do not implement further application changes without a new implementation request. A screening styling attempt was undone after that clarification. Existing earlier evidence-tracer patch remains separately documented above; it is not part of this UI plan.

- Reference screenshots: user supplied screening screenshot (2026-10-27) showing legacy blue/purple controls and a robot beside the recommendation; shield reference shows a simple outlined shield with a muted filled interior.
- Apply docs/MASTER_THEME.md and .agents/rules/master_theme.md across the screening page, recommendation/clarification cards, filters, metric ribbon, protocol drawer, overlays and shared child components. Audit Rigor Scan against the same theme.
- Use primary wine #3a0f34, paper #fbf9f4, white cards, outline #d2c2cb, editorial plum #814d75 and approved reading inks. Replace legacy gradients and bright utility colors with shared semantic theme tokens; do not add repeated CSS overrides or indiscriminately collapse distinct states to one unreadable color.
- Serifon Editorial for headings, QuadraatSmallCaps for study reading copy, Work Sans for controls/metadata. Preserve readable contrast, focus indication, status labels and restrained borders.
- Replace the Bot icon at Co-Scientist Recommendation and Co-Scientist Clarification Request with a consistent simple shield matching the supplied silhouette. Prefer the existing vector icon system with a restrained filled interior; mark decorative icons aria-hidden. No robot emoji/icon should remain beside Co-Scientist.
- Files to inspect: frontend/src/pages/ScreeningPage.tsx (Bot import and usages near original lines 37, 2033 and 2081), frontend/src/styles/approved-theme.css, frontend/src/index.css, frontend/src/lib/editorialRules.ts, related child components, and mirrored web frontend sources.
- Scope styles so approved landing/ClaimScape designs remain intact. Synchronize corresponding source changes to the web repository through the established release process, without overwriting unrelated work or claiming deployment merely because local sources changed.
- Gate: actual screenshots and computed style checks at 1440px, 903px and 390px; readable study/recommendation layout, no clipping, visible keyboard focus, theme-compliant dialogs, vector shield present and no robot. Run affected existing screening tests and the frontend build. Record local versus deployed revision explicitly.

## Work package 9 — Rigor Scan: functional audit and repair plan

Reference behavior: https://www.k-dense.ai/tools/rigor-scan (read 2026-10-27). Use it as a functional reference for upload → applicable reporting checks → fingerprint → selected evidence → actual PDF page. Preserve RadExtract branding and Master Theme; do not claim the original implementation or its results are ours. Reporting completeness is not proof of scientific validity or a substitute for formal risk-of-bias appraisal.

### Source-grounded findings to reproduce

1. frontend/src/components/rigor/RigorReader.tsx explicitly renders simulated scientific page content, including a fixed example title/DOI and repeated passages. It does not render the actual uploaded manuscript. The screenshot's repeated content is consistent with this code path.
2. frontend/src/pages/RigorScanPage.tsx converts uploaded checks without populating spoke geometry. RigorFingerprint.tsx returns no spoke when c.spoke is absent. This is a concrete candidate cause of the missing chart; reproduce on an uploaded PDF and test the adapter/renderer boundary.
3. RigorFingerprint.tsx has fixed example domain arc scores (67, 80, 89, 62, 89, 87) while other score cards use incoming domains. Current labels can contradict the current scan.
4. RigorScanPage.tsx uses v.index || 50, replacing a legitimate zero score with 50. It also falls back to example domains, default study gates, invented Open Access metadata and default page/location values. Audit and remove misleading live-result substitutions.
5. backend/services/rigor_scan_service.py generates fixed evidence rectangles and guesses Abstract/Methods from page number (near original lines 457-460). Such coordinates are not verified locations.
6. verify_references_and_retractions in that service extracts identifiers with regex and reports no retractions / claims Crossref checks without actually querying those services in that function. Identifier discovery is not registry verification.
7. verify_cell_lines uses local name dictionaries but claims broad database coverage. Report the real checked set/version/coverage, or implement verified lookups; absence from a small local list is not a clean registry result.
8. The service includes fixed methods-detail and claim-strength probability arrays near original lines 609-627. Treat these as placeholders to replace with actual results or explicitly unavailable states.
9. The page renders scanResult.engine into user-facing copy; apply the universal vocabulary/secrecy policy to internal engine identifiers. Do not hide actionable connection failures when sanitizing.

These are static observations. No live scan reproduction or correctness benchmark was executed in this planning session. The reference page's own example numbers are illustrative, not target scores to copy.

### Ordered repair tasks

A. Reproduce a reference-example run and a new uploaded-manuscript run separately. Preserve request/response, actual source document hash, page count, gates, check counts, index, domain values, selected check and evidence location. Identify every demo-only code path and every live fallback before editing.

B. Retain the selected upload and render its actual pages using the established PDF renderer. Bind evidence to page text offsets/bounding boxes from the real parser/renderer coordinate system. Show on page must navigate to the correct page and highlight the actual source span after zoom/scroll. Unknown location remains unknown; no fabricated highlights. Display parsing/OCR failures and allow retry.

C. Derive fingerprint geometry from current applicable checks and derive domain labels/scores from the current scan. Ensure tracks, filled spokes, selection markers, legends and keyboard activation work. Handle zero applicable checks and missing selected checks. Add accessible text/table alternatives. Selection must consistently link the spoke, check list and evidence pane.

D. Define and version the scoring contract: applicable versus not-applicable versus unknown applicability; reported/unclear/missing/warning polarity; domain denominators; handling of empty domains; completeness aggregation. Genuine zero stays zero. Absence of evidence remains different from explicit contrary evidence, and incomplete parsing cannot justify confident missing claims. Reviewer corrections trigger consistent recomputation.

E. Replace heuristic/fixed evidence and judgments with actual source-backed results. Validate applicability gates against the study's methods rather than mentions in references/background. Include negation, human/animal mixed content, case reports, diagnostic studies and prediction-model examples. Record coverage and abstain if unavailable.

F. Implement truthful deterministic software checks. For statistical recomputation, validate formulas, assumptions, rounding and extractable inputs with independent fixtures. For retractions/corrections, query actual authoritative sources and record matched identifier, response/time, checked/unmatched totals and unavailable outcomes. Link/data/registry checks must distinguish identifier found, request attempted, verified accessible, blocked and failed. No network error or unperformed lookup becomes a pass.

G. Separate reference/demo fixtures from uploads. No example paper content, scores, study gates, licensing or geometry may leak into uploaded-paper results. Selecting a different paper must invalidate old results/selection. Replay must rerun the intended document; tests verify stale-response races. Public privacy statements must describe the actual backend upload/text handling rather than copying the reference site's browser-only claim.

H. Apply the Master Theme and public vocabulary, then run functional and responsive browser QA. Example/reference fixtures must be labelled. Avoid adding external account/signup or sharing dependencies to the required demo flow. Add Share/Replay behavior only if it can truthfully operate on current data and within explicit project access rules.

### Acceptance fixtures and release gate

- Two different PDFs yield their own visible pages/metadata/checks; no repeated synthetic example body.
- A zero-index result displays 0; a partial/missing response stays visibly incomplete rather than borrowing example scores.
- Applicable + not-applicable/unknown categories reconcile to the versioned check specification. Fingerprint labels/cards/summary derive from the same current dataset.
- Clicking/tapping/keyboard-activating any available check links to its real evidence; highlights remain aligned at different zoom levels and 1440/903/390 widths.
- Actual reference lookups can return retracted, corrected, clean-with-coverage, unmatched or unavailable, with independent oracle fixtures for each.
- No fabricated coordinates, unsupported registry claims, fixed judgment distributions or internal engine names in live output.
- No external-service outage produces a clean result; errors persist with retry and no stale success state.
- Existing files to inspect: frontend/src/pages/RigorScanPage.test.tsx, frontend/src/components/rigor/RigorFingerprint.tsx, frontend/src/components/rigor/RigorReader.tsx, frontend/src/lib/rigorTypes.ts, backend/routers/rigor_scan.py, backend/services/rigor_scan_service.py and relevant backend tests. Extend existing tests before creating competing check/score implementations.

Priority: treat synthetic source rendering and unperformed-check success claims as demo blockers. Place this audit on Day 1; schedule repairs with the core review work by severity. Do not silently promise the original seven-day scope still fits after adding these tasks; keep a separate Rigor Scan acceptance lane and report any blocked work before the meeting.


## Work package 10 — Actual Graphify graph in Code Graph (planning only)

User requirement: Code Graph must display the actual persistent Graphify codebase graph, not sample nodes. Maintain planning-only scope until implementation is separately requested.

### Existing integration and observed gaps

- backend/routers/graphify.py already loads graphify-out/graph.json through _load_graph and exposes /api/graphify/code/graph, /stats, /file and /community. main.py includes the router. Reuse this integration.
- frontend/src/pages/CodeGraphPage.tsx calls api.getCodeGraph and api.getCodeGraphStats, defaults to 200 nodes and uses a simple circular layout. Backend graph endpoint defaults to 500 and caps the requested limit at 2685, below the current full corpus.
- frontend/src/lib/api.ts has demo graph/stats responses. Trace when request fallback activates and replace silent sample substitution for this view with an explicit unavailable/error state; a separately selected sample mode must be visibly labelled.
- _GRAPH_CACHE currently persists indefinitely; it does not invalidate when graph.json changes. RADEXTRACT_GRAPH_PATH is currently only consulted when the default graph file is absent. Correct configuration precedence and refresh behavior deliberately.

### Implementation tasks

1. Serve the configured authoritative graph snapshot and metadata: schema/version, built_at_commit, indexed timestamp or file modification time, snapshot fingerprint, total nodes/edges and applied filters. Keep stats and graph responses tied to the same snapshot.
2. On the static frontend, load via the connected backend. Package/mount the actual graph artifact in that backend deployment; do not assume a local Windows path exists on the cluster. If offline snapshot support is needed, make it an explicit real versioned export mode, never invented fallback data.
3. Invalidate parsed graph cache by file identity/mtime/size or content version, using atomic snapshot loading. Refresh must reveal graphify update results without restarting the API. Handle missing, malformed and partially replaced files with truthful errors and safe last-good-snapshot labelling if retained.
4. Start with a community overview derived from all current nodes/links, then load selected communities, files, symbol neighborhoods and relationship paths. Show full corpus totals separately from displayed subset totals. Every real node must be reachable through navigation; a capped initial view must not claim to show the entire graph.
5. Preserve real node IDs, labels, source paths/locations, communities, relationship types, directionality, edge provenance and extracted/inferred status. Inspect directed/multigraph metadata rather than imposing unsupported direction. Validate endpoint references; handle dangling links explicitly.
6. Use bounded pagination/neighborhood queries and scalable layout, not a single circular rendering of 11k+ nodes. Avoid animation and per-edge labels at full density; show details on selection. Search/filter by symbol, file, community and relation, with zoom/fit/reset and clear selection.
7. Display graph freshness, source revision and partial-view status. Refresh must refresh both graph and statistics. Changing backend/filters must not combine old snapshot stats with new nodes.
8. Keep this code/dependency graph separate from the project's review-data graph. It contains internal identifiers and repository structure: restrict it to the intended internal/developer audience according to existing access policy; do not publish graph.json or source details into public site assets by default. Public scientific review screens still use Co-Scientist wording, while authorized internal graph detail must preserve actual symbol names accurately.
9. Apply Master Theme and accessible keyboard navigation/text details. Retain useful connected components and selected node context during progressive loading.

### Acceptance gates

- Compare API totals and representative node IDs/relationships directly with the actual on-disk snapshot; sample data cannot satisfy this check.
- File/community/neighborhood filters return correct endpoints and display accurate total-versus-shown counts.
- Changing the graph fixture or running graphify update then pressing Refresh changes both graph and stats to the new snapshot without an API restart.
- Valid zero-node results remain empty; missing/corrupt graph and backend outage remain errors, not demo graphs.
- Benchmark the current 11k+ node corpus: overview remains responsive; drill-down reaches nodes beyond the old 2685 cap. Record load/layout time, memory and interaction responsiveness.
- Static-site-plus-backend deployment test proves the graph artifact is present and its revision is the expected one. No accidental public snapshot exposure.

Status: repository/source inspection only; no graph-view application changes made in this chat.
