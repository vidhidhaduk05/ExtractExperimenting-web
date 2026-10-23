## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-04-01 - Eliminating O(D * Q^2) Nested Array Scans in Interactive Risk of Bias and Screening Workspaces
**Learning:** Re-evaluating `array.find()` within nested domain and question `.map()` calls on every render frame severely degrades input responsiveness during keystroke navigation and fast option toggling.
**Action:** Pre-build memoized `Map` lookups (`domainDefMap`, `signalingAnswerMap`, `questionDefMap`) via `useMemo` using composite key pairs (`${domain_key}:${question_key}`) to convert nested searches into O(1) lookups during user interactions.
