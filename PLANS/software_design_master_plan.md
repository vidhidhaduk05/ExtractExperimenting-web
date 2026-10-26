# Software Design Master Plan

Date: 2026-10-26  
Status: Planning only — application implementation is not authorized by this document.  
Target repository: https://github.com/vidhidhaduk05/ExtractExperimenting-web.git

## Objective

Redesign RadExtract as one coherent research workspace using the user's master theme Markdown as the visual source of truth. Improve working behavior and usability together: every visible action must have defined behavior, truthful feedback, and persistent results.

Do not implement, commit, push, merge, or deploy merely because this plan exists. Subsequent implementation requires explicit authorization. Preserve unrelated local changes and existing research data.

## Evidence and unresolved inputs

- The live PICO page has duplicate research-question entry, competing generation actions, and separately saved sections with an unclear sequence.
- The user identified import history as needing real, project-specific operation. A page showing zero indexed studies alongside historical batches requires investigation; the cause has not been established.
- Source inspection previously found an extraction view with variables down rows, section-first variable sorting, incomplete persistence of reordered existing variables, and demo fallbacks in multi-study lookups. Recheck these against the latest target branch before treating them as current defects.
- The exact master theme Markdown path must be located and confirmed before visual design begins. Do not reconstruct it from memory or invent missing theme rules.
- Confirm which landing-page skills were actually used. The intended candidates are UI/UX Pro Max, Taste Skill, Awwwards, and Design System. Rederive was requested earlier but could not be located; disclose its availability rather than claiming to use it.

## Working rules

1. Read applicable AGENTS.md, the decision log, and relevant skill files.
2. Query Graphify before architecture investigation or code changes; trace cross-module dependencies when needed.
3. Read affected code, callers, tests, and saved-data contracts before editing.
4. Follow the repository's required delegation workflow where available. Report unavailable services honestly.
5. Use a separate `codex/` branch from the latest main when implementation is authorized.
6. Keep a localhost preview available with isolated development data. Do not run destructive tests against live reviews.
7. Preserve scientific criteria, screening thresholds, provenance, permissions, and established local Laya screening requirements.
8. Record agreed product decisions and run `graphify update .` after edits.

## Phase 1 — Establish the theme and design foundation

### Tasks

- Locate the master theme Markdown and related assets; record exact source paths.
- Identify the authoritative theme if multiple variants exist.
- Inventory existing tokens, Tailwind configuration, styles, fonts, icons, and reusable components.
- Map approved colors to semantic roles: primary action, selection, evidence states, warning, error, success, and surfaces.
- Define typography, spacing, density, borders, focus indicators, and motion rules.
- Define light/dark behavior and layouts for desktop and the narrow browser side panel.
- Keep a recognizable relationship with the landing page while optimizing work screens for reading, data entry, and document review.

### Skill responsibilities

| Skill | Role |
| --- | --- |
| UI/UX Pro Max | Interaction patterns, forms, accessibility, navigation, responsive behavior |
| Taste Skill | Composition, hierarchy, typography, and screenshot-based refinement; use the app-screen guidance |
| Awwwards | Landing-page continuity and appropriate visual quality guidance, without imposing showcase effects on working tools |
| Design System | Shared tokens, component states, and consistent specifications |
| GRAVITAS and language extensions | Scoped implementation and evidence-backed verification |

### Deliverables and gate

- Theme source register and token mapping.
- Component inventory with reuse/replacement decisions.
- One representative screen demonstrating the proposed application density and hierarchy.
- User reviews the visual direction before broad rollout.

## Phase 2 — Audit the complete customer journey

Walk through one clearly named test project:

Create project → Define protocol → Find/import studies → Screen → Extract → Assess quality → Analyze → Report/export.

Log each step with an identifier, screen, action, expected result, actual result, reproduction steps, evidence, severity, and status. Distinguish confirmed bugs, usability issues, proposals, blocked checks, and untested behavior.

Inspect persistence after reload, realistic empty states, partial failures, back navigation, project isolation, and downstream count consistency. Do not infer backend causes from appearance alone.

### Deliverables and gate

- Screen and route inventory.
- Customer journey and dependency map.
- Prioritized issue log: data correctness and blocked workflows before cosmetic polish.
- Agreed first implementation slice.

## Phase 3 — Simplify information architecture

Proposed navigation, to validate against actual routes and user workflows:

| Area | Responsibility |
| --- | --- |
| Overview | Project status, progress, and useful next actions |
| Protocol | PICO input, protocol review, eligibility criteria, search strategies |
| Studies | Imports, records, deduplication, batch history |
| Screening | Title/abstract and full-text review |
| Extraction | Variable designer, study spreadsheet, PDF workspace |
| Quality assessment | Risk of bias and evidence certainty, preserving their distinct purposes |
| Analysis | Supported synthesis and statistical tools |
| Reporting | PRISMA, exports, reproducible outputs |

Keep specialist tools accessible without competing with the main journey. Preserve useful deep links and distinguish navigation from actions.

## Phase 4 — Redesign the priority workflows

### A. Protocol setup

Offer exactly three entry routes:

1. Upload a protocol and extract available details.
2. Enter a question and generate editable PICO fields.
3. Fill PICO manually without requiring AI.

All routes converge on one shared editable record. Do not ask for the question twice. Preserve input when switching methods; confirm replacement of populated fields. Missing information stays identifiable rather than being invented.

Then offer **Review My Protocol**. Select relevant AI reviewer roles and count from the project's question, specialty, methods, and evidence needs. Explain role selection, use bounded execution, consolidate findings, and require user action before applying corrections. Do not describe AI perspectives as independent human reviewers.

Then show one primary **Generate Search Strings** action with editable database-specific outputs. Distinguish strategy generation from executing searches. Protect manual edits and mark prior outputs out of date when their inputs change.

Keep hypotheses optional and preserve existing data. Criteria remain editable with clearly named actions; exact save and stage behavior must be specified before implementation.

Acceptance examples: all three entry routes work; saved inputs survive reload; no duplicate question input; suggestions do not silently modify the protocol; manual search edits are preserved.

### B. Studies and import history

Investigate the source of historical batches before changing presentation.

- Show genuine batches scoped to the current project and enforce authorization server-side.
- Empty projects have a real import entry point and no demo history.
- Persist filenames, dates, source provenance, status, and actual record outcomes.
- Define how processed, added, duplicate, merged, failed, and skipped counts reconcile.
- Distinguish historical batch totals from current project and screening totals.
- Provide inspectable batch records and errors with pagination where needed.
- Preview undo impact; preserve shared studies and downstream work; use recoverable behavior where supported.
- Keep undo atomic and idempotent where applicable, with truthful failure states.
- Retain undone history without inflating active counts.
- Replace oversized metric cards with compact rows and expandable details.

Acceptance examples: empty, valid, duplicate-only, mixed, failed, and undone imports; reload persistence; project isolation; shared-study preservation; counts match actual state.

### C. Variable designer, spreadsheet, and PDF workspace

Support individual variable entry, one-per-line paste, and pasted Excel headers, with a preview before saving.

Use one persisted variable order across the designer, spreadsheet, PDF modes, navigation, and Excel exports. Associate data using stable IDs, never display names or positions. Sections must not override global order.

The study-level sheet places variables across the header row and one study per row. Provide an editable user-facing Study ID while keeping internal identity stable. Preserve existing repeated arm/outcome/time-point data; determine its detail workflow before flattening anything.

Include selection, keyboard navigation, rectangular copy/paste, supported undo/redo, resizing, frozen headers, filtering, row sorting, typed validation, and visible save states. A formula engine is outside the initial scope.

Place the PDF beside an adjustable extraction workspace offering horizontal sheet mode and vertical form mode in the same variable order. Preserve study, variable, edit, and evidence context between modes.

Show quotes, source pages, provenance, confidence where available, and verification in selected-cell details. Protect verified values from silent AI overwrite. Prefill bibliographic fields only through explicit metadata mappings.

Use actual saved data for every real study. Provide blank and completed `.xlsx` exports with matching headers and a separate evidence worksheet. Export user text literally rather than accidentally treating it as a formula.

Acceptance examples: exact order after reload and export; rename/reorder preserves evidence and values; additions leave existing results intact; editing synchronizes between sheet and PDF; real multi-study results; save failure recovery.

## Phase 5 — Standardize shared components

Specify and reuse:

- Application shell, project navigation, page headers, and breadcrumbs.
- Primary/secondary actions and progress indicators.
- Inputs, dropdowns, validation, and optional sections.
- Tables, filters, selection, and bulk actions.
- Dialogs, drawers, evidence panels, and confirmations.
- Status badges and loading, empty, error, saving, saved, and stale states.

Provide keyboard access, visible focus, readable contrast, labels, and accessible drag alternatives. Reuse suitable dependencies; evaluate compatibility and licensing before adding a grid package.

## Phase 6 — Roll out across remaining screens

After the priority workflows are validated, apply the approved components and behavior to:

1. Project overview and creation.
2. Screening queues and decisions.
3. Data review and discrepancy handling.
4. Risk-of-bias assessment.
5. Meta-analysis and supported analysis tools.
6. Evidence certainty and PRISMA.
7. Export/reporting.
8. Specialist tools and settings.

For each screen, define primary task, prerequisites, stored outputs, next step, permission behavior, and error recovery. Do not redesign scientific calculations as a side effect of visual work.

## Phase 7 — Interactive implementation process

Once authorized:

1. Establish a baseline, separate branch, isolated data, and working local frontend/backend connection.
2. Implement one reviewable slice at a time rather than a large application-wide replacement.
3. Keep the local preview available; identify the screen and changes to inspect.
4. Run appropriate checks after each slice and pause for user feedback before dependent work.
5. Treat new user feedback as steering. Stop edits when asked to stop.
6. Commit or publish only when separately requested.

Suggested sequence: foundation sample → protocol → imports → extraction/PDF → screening → remaining screens → cross-workflow verification.

## Phase 8 — Verification and completion

### Functional verification

- Complete one realistic end-to-end customer journey using genuine test data.
- Verify project isolation, persistence, permissions, cancellation, retries, and partial failures.
- Verify exports against actual saved values and evidence.
- Protect existing data and protocol behavior.

### Visual and interaction verification

- Inspect screenshots in desktop and narrow side-panel layouts.
- Check light/dark themes where supported.
- Check keyboard operation, focus, overflow, long labels, large tables, and PDF usability.
- Ensure every visible control works or clearly explains its unavailable state.

### Engineering verification

- Run meaningful targeted tests and affected regression checks.
- Run the frontend production build and appropriate language checks.
- Check real browser workflows and errors where tools are available.
- Re-index Graphify and record decisions.
- State exact observed results and limitations; do not claim checks that were not run.

## Scope boundaries

- No blanket production-data cleanup or destructive migration.
- No silent replacement of genuine data with demo content.
- No unrelated performance, model-provider, or infrastructure changes.
- No formula-engine or full Excel-parity promise.
- No release or deployment implied by this plan.

## Completion checklist

- [ ] Exact master theme located and confirmed.
- [ ] Relevant skills loaded and responsibilities established.
- [ ] Customer journey and issue log reviewed.
- [ ] Navigation and representative screen approved.
- [ ] Shared components and tokens implemented after authorization.
- [ ] Three-route protocol setup verified.
- [ ] Genuine imports, count reconciliation, and safe undo verified.
- [ ] Shared variable order, spreadsheet/PDF editing, and exports verified.
- [ ] Remaining screens aligned and functional.
- [ ] End-to-end, responsive, keyboard, and persistence checks completed.
- [ ] Tests/build results and unresolved limitations documented.
- [ ] Decision log and knowledge graph synchronized.
- [ ] User separately authorizes any commit, push, merge, or deployment.
