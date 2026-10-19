## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-10-20 - Pre-Computing Object Lookups Before O(N^2) Pairwise Metric Loops
**Learning:** In pairwise similarity/comparison loops (such as study deduplication, clustering, or matrix reconciliation), calling normalization functions or string parsing repeatedly inside inner loops results in O(N^2) overhead and unnecessary object allocations.
**Action:** Pre-compute normalized data structures (e.g. author name sets `norm_author_sets`) during initial $O(N)$ iteration pass and compile regex patterns at module scope (`_AUTHOR_DELIM_RE`) to achieve up to 11.5x speedups on pairwise loops.
