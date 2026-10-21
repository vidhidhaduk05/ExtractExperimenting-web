## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Memoizing Trace Tree Traversals in Interactive Page Root Components
**Learning:** Performing recursive tree walks or array flattening at the root level of interactive pages (such as `CitationTelephonePage`) re-executes on every keystroke in form fields (e.g. manuscript or claim text inputs) or state toggles, allocating new array references and causing child graph/tree components to re-render.
**Action:** Always wrap multi-hop tree gather functions or array flatteners in `useMemo` with minimal dependencies (e.g. `[activeExample]`) to preserve object reference equality across user interaction frames.
