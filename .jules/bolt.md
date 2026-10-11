## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-10-11 - Memoizing RoB Map and Active Study Selection in AI Screening Loop
**Learning:** Instantiating `Map` objects (`robByStudy = new Map(...)`) and running linear `.find()` searches directly in the component body on every render frame causes avoidable allocation overhead and GC pressure when fast polling (e.g. 1.5s AI screening progress timers) or frequent keystrokes occur.
**Action:** Wrap study lookup maps and active study selection computations in `useMemo` with explicit dependency arrays.
