## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-04-01 - Preventing Redundant State Updates in Interactive Mouse Pointer Handlers
**Learning:** Calling React state setters directly inside high-frequency event handlers (`onPointerMove` / `onMouseMove` at 60-120Hz) with freshly allocated objects (`{ pmid, x, y }`) forces React to schedule re-renders on every single mouse pixel movement—even when hover target or tooltip position coordinates haven't changed.
**Action:** Use functional state updaters (`setState(prev => ...)`), check if `prev` matches target coordinates/IDs, and return `prev` unchanged so React bails out of re-rendering. Combine with `React.memo` on SVG sub-components (e.g. scatter plot dots) to skip DOM reconciliation for unchanged elements.
