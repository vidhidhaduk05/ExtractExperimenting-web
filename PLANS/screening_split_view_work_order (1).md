# WORK ORDER — Reference-Manager Screening Layout (stage tabs + split view)

**Repo:** `ExtractExperimenting-web`. PRESENTATION-ONLY change: same routes, same API calls, same study IDs, same save operations, same stage gates. Re-locate edits by quoted string. MASTER_THEME hairline rules throughout. Apply to the ONE surviving frontend tree.

## PHASE 1 — Stage tab strip (the Chrome-style tabs, in-app)

**1.1** New component `src/components/layout/StageTabs.tsx`: a horizontal tab strip rendered inside `AppLayout`'s content area (below the top bar) when a project route is active. Tabs in review order: `Protocol · Studies · Screening · Extraction · RoB · GRADE · Meta · Export` — each a `<Link>` to the EXISTING route (`/projects/:id/pico`, `/studies`, `/screening`, `/extraction-sheet`, `/rob`, `/grade`, `/meta-analysis`, `/export`). Active tab: wine underline + wine text; inactive: `--ink2`; hairline bottom border across the strip.
**1.2 — Tabs reflect gates, never bypass them.** Each tab computes availability from the same live data the dashboard cards use (e.g., Extraction disabled with tooltip "Blocked: finish Title/Abstract first" when no TA-included studies). A disabled tab is rendered disabled (`aria-disabled`, no navigation) — the underlying route guard stays as the real enforcement. Tools (Evidence Map, Rigor Scan, Citation Telephone) stay in the left rail, NOT in this strip.
**1.3** Browser Back/Forward must keep working (tabs are links, not state) — no `pushState` tricks.
**CHECK:** tabs follow review order; disabled tabs show why; Back/Forward works; deep-linking to a stage URL still renders.

## PHASE 2 — Screening split view (behind a layout toggle)

**2.1 — Toggle.** In `ScreeningPage.tsx`, add `layout: "compact" | "classic"` state persisted to `localStorage` per user; toggle button in the screening header. Default `classic` until Phase 4 verification passes. The classic view remains untouched.
**2.2 — Compact layout.** Two panes filling the viewport height below the tab strip:
- **Left: study table** (resizable, default 40%). Columns: Title · First author · Year · Journal · Decision status · AI confidence (real values only, "—" when none). Selected row: wine left edge + `--field` background. Sortable by year/confidence; existing filters (stage, confidence, search) keep working — they filter the same array.
- **Right: reading pane** with its own sub-tabs: `Abstract | Full Text | Details | Notes`. Abstract = real abstract with existing PICO highlights; Full Text = existing PDF viewer embed (upload control moves here); Details = metadata + clarifications; Notes = per-study notes (existing or new persisted field). Sub-tabs keep metadata/notes from pushing the abstract down.
**2.3 — Fixed decision bar.** Bottom of the reading pane, always visible: existing `Include / Uncertain / Exclude` buttons + reason dropdown, unchanged logic, same mutations. After a decision: auto-advance selection to the next undecided study (existing behavior if present; otherwise add).
**2.4 — Resizing without dependencies.** Draggable divider via native pointer events (pattern: `CodebookDesignerModal` drag handling); width persisted to localStorage. No DnD/resize libraries.
**2.5 — Keyboard navigation.** ↑/↓ or J/K moves selection; I/U/E = Include/Uncertain/Exclude on the selected study; visible shortcut hints in the decision bar tooltips. Disabled when a save is in flight.
**CHECK:** select → read → decide entirely from the keyboard; decision persists and PRISMA/progress header updates; resize survives refresh; toggle back to classic → identical behavior to today.

## PHASE 3 — Verify before extending (agent + user, in the browser)

Selection, saving, filtering, navigation, keyboard, resize, gate enforcement, classic/compact parity — screenshot each. Fix findings before Phase 4. **Do not extend the pattern until this passes.**

## PHASE 4 — Extend the split pattern to the other reading-heavy stages

Same compact pattern (table left, detail pane right, action bar fixed) applied to: Full-Text screening (same component, FT data), RoB assessment (assessment list left, signaling questions right), Extraction sheet (study list left, variable grid right). Each behind the same layout toggle, each reusing ONE shared `SplitLayout` component extracted in Phase 2 — not four copies.
**CHECK:** each stage's compact mode passes the Phase 3 checklist against its own data.

## PHASE 5 — Optional, deferred: "Open study in new browser tab"

Add ONLY a per-study "Open in new tab" context action (`/studies/:id/pdf` already is a route) with `target="_blank"`. Do NOT implement multi-tab editing sync, stale-data warnings, or tab-scoped state in this pass — those need their own design. Stage navigation stays in-app.

## CONSTRAINTS
- No new dependencies (native DnD/resize/split).
- Same mutations, same endpoints — if any save path changes, STOP and report.
- Gates enforced by route guards, not by tab cosmetics.
- The demo-removal and correctness work orders take precedence; do not reintroduce any fallback data.
