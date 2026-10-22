## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-10-22 - Optimizing Map Construction and Linear CSV Matrix Exporters
**Learning:** Constructing new `Map` instances (e.g. `robByStudy` in workspace lists) or re-aggregating section/group objects directly in React component render bodies causes memory allocation churn on every state update or background query poll. Furthermore, exporting large cross-study data matrices using linear array `.find()` lookups inside nested loops produces O(V * P * E) computational overhead.
**Action:** Always wrap Map instantiations and grouping routines in `useMemo` with minimal dependency arrays, and reuse pre-computed composite O(1) lookup maps (`paperVariableExtMap`) when generating CSV reports or rendering matrix grids.
