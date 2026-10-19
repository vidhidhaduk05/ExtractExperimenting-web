## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-04-01 - Composite-Key Lookups in Nested Medical Assessment & Spreadsheet UI Render Loops
**Learning:** In complex clinical review tools (such as Risk of Bias domain signaling question trees and multi-sheet Excel export/import matrices), searching arrays with `.find()` inside domain maps or paper iteration loops results in $O(\text{Domains} \times \text{Questions})$ or $O(\text{Variables} \times \text{Papers} \times \text{Extractions})$ operations per render frame or export pass.
**Action:** Pre-compute composite HashMaps (`${domainKey}:${questionKey}` and `${studyId}:${variableId}`) inside `useMemo` hooks or export handlers. Replace nested `.find()` iterations with O(1) Map `.get()` calls to ensure smooth user keystrokes, instant hotkey navigation, and high-performance spreadsheet exports.
