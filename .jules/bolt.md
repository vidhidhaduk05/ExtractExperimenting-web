## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-04-01 - Optimizing Matrix Exports and Filtered Data Aggregating Loops
**Learning:** Computing summary stats or exporting multi-study matrices by scanning raw array lookups (e.g. `availablePapers.forEach(...)` with nested `extractions.find(...)`) inside render loops or CSV export handlers degrades user responsiveness exponentially with dataset size.
**Action:** Unify live and demo data lookups into a single `paperVariableExtMap` composite-key Map, and reuse `paperVariableExtMap` directly for computing overall summary statistics and generating CSV exports in O(1) cell lookup time.
