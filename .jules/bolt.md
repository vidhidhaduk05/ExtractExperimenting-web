## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Concurrent Parallel Execution for Multi-Record Extraction Verification
**Learning:** Sequential `for...of` loops awaiting individual API mutations (such as batch verification/acceptance on study data sheets) introduce linear cumulative network latency $O(N \times \text{RTT})$, creating multi-second UI hangs during batch operations.
**Action:** Use `Promise.all` with `.map()` to issue batch verification mutations concurrently, cutting network wait times to $O(1 \times \text{RTT})$.
