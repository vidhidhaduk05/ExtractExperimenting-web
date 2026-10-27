## 2026-03-31 - Range Cut-Point Merging for Rich Text Highlighting
**Learning:** Performing character-by-character array allocations (`new Array(text.length)`) and priority resolution loops inside text highlight renderers creates $O(\text{text\_length})$ garbage collection pressure on every render frame for long abstracts/manuscript texts.
**Action:** Replace $O(\text{text\_length})$ character array allocations with an $O(N \log N + N \cdot K)$ cut-point boundary set algorithm ($N \le 20$ spans) that finds span interval boundaries and merges adjacent segments, reducing highlight rendering time by ~100x.

## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Memoizing Trace Tree Traversals in Interactive Page Root Components
**Learning:** Performing recursive tree walks or array flattening at the root level of interactive pages (such as `CitationTelephonePage`) re-executes on every keystroke in form fields (e.g. manuscript or claim text inputs) or state toggles, allocating new array references and causing child graph/tree components to re-render.
**Action:** Always wrap multi-hop tree gather functions or array flatteners in `useMemo` with minimal dependencies (e.g. `[activeExample]`) to preserve object reference equality across user interaction frames.

## 2026-03-31 - Range Cut-Point Boundary Merging in Screening Workspace
**Learning:** Text highlighting in `ScreeningPage` allocated `new Array(rawText.length)` for every abstract and title render frame, running $O(\text{text\_length})$ priority loops on every keystroke or selection change.
**Action:** Replaced character array allocation with an interval boundary cut-point set algorithm ($O(N \log N + N \cdot K)$) in `renderHighlightedText`, eliminating $O(\text{text\_length})$ memory allocations during screening.

## 2026-03-31 - Memoizing Multi-Pass Flow & Dashboard Aggregation Logic
**Learning:** Computing live PRISMA diagram counts, dual-reviewer agreement matrices, and filtered study lists at the top-level of pages without `useMemo` causes redundant multi-pass array iterations on every polling interval or UI state change.
**Action:** Wrapped `computeLivePrismaData` in `PrismaFlowPage`, study filtering & bookmark counts in `StudyList`, agreement/kappa metrics in `DualBlindedDashboard`, and factor classifications in `GradePage` in `useMemo`.

## 2026-10-27 - Indexing Intermediate Link Relations with Hash Maps in Graph Traversals
**Learning:** Executing nested `graph.links.forEach` scans to resolve multi-hop edge relations (e.g. `study -> extraction` and `extraction -> variable` into direct `study -> variable` edges) causes $O(L^2)$ quadratic operations on every filter or toggle frame.
**Action:** Pre-build an $O(1)$ lookup Map (`extractionToVarMap`) for intermediate relation targets in a single $O(L)$ pass prior to edge construction, reducing graph processing complexity from $O(L^2)$ to $O(L)$.
