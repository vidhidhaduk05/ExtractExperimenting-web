## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Memoizing Domain and Question Definitions in Nested Review Grids
**Learning:** In assessment tools (like RoB 2, ROBINS-I, QUADAS-2) where signaling questions are nested under domain judgments, calling `.find()` on questions or domains within render loops generates O(Domains * Questions) array lookups on every keystroke, selection, or hotkey event.
**Action:** Pre-build composite-key `Map` instances (`${domain_key}:${question_key}`) inside `useMemo` hooks to achieve O(1) constant-time access during interactive render passes.
