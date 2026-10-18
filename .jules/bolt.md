## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Memoizing Top-Level Maps and Aggregation Calculations in Page Views
**Learning:** Instantiating `new Map(...)` or performing array `.filter()` / `.reduce()` directly at the top level of heavy page components (e.g. `ScreeningPage`, `ExtractionSheetPage`, `RobSummaryPage`) causes repeated allocations and garbage collection pressure on every keystroke, filter toggle, or timer tick.
**Action:** Wrap top-level Map indexing and array aggregations in `useMemo` to ensure stable object references and prevent O(N) recalculations on unrelated render triggers.
