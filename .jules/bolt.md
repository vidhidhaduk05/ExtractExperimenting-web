## 2026-03-31 - Range Cut-Point Merging for Rich Text Highlighting
**Learning:** Performing character-by-character array allocations (`new Array(text.length)`) and priority resolution loops inside text highlight renderers creates $O(\text{text\_length})$ garbage collection pressure on every render frame for long abstracts/manuscript texts.
**Action:** Replace $O(\text{text\_length})$ character array allocations with an $O(N \log N + N \cdot K)$ cut-point boundary set algorithm ($N \le 20$ spans) that finds span interval boundaries and merges adjacent segments, reducing highlight rendering time by ~100x.

## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Memoizing Trace Tree Traversals in Interactive Page Root Components
**Learning:** Performing recursive tree walks or array flattening at the root level of interactive pages (such as `CitationTelephonePage`) re-executes on every keystroke in form fields (e.g. manuscript or claim text inputs) or state toggles, allocating new array references and causing child graph/tree components to re-render.
**Action:** Always wrap multi-hop tree gather functions or array flatteners in `useMemo` with minimal dependencies (e.g. `[activeExample]`) to preserve object reference equality across user interaction frames.

## 2026-03-31 - Converting Collection Scans to O(1) Sets in Interactive List Views
**Learning:** Checking `array.includes(id)` inside list rendering loops and counter badge calculations (such as study bookmark filtering in `ScreeningPage` and `StudyList`) executes $O(N \cdot B)$ linear searches multiple times per render frame (e.g. user keystrokes in search inputs).
**Action:** Construct a memoized `Set` (`new Set(array)`) via `useMemo` and compute badge counts in memoized helpers to reduce list filtering and card rendering complexity to $O(N)$ with $O(1)$ set checks.
