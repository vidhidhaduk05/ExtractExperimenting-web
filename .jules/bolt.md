## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Suppressing Child Query Fires and Static Function Re-Allocations
**Learning:** Child component rows (e.g. `StudyRow` in study lists) firing individual child queries when batch query data is unavailable can create N concurrent request cascades for empty/unassessed items. Additionally, defining regex arrays inside top-level component bodies allocates new RegExp objects on every render/keystroke.
**Action:** Pass parent batch query presence flags (e.g. `hasRobSummary`) to conditionally disable per-item fallback queries, and hoist static helper functions and RegExp arrays outside component definitions.
