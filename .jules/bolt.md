## 2026-03-31 - Memoizing Hot-Path Data Transformations in React Render Loops
**Learning:** Re-creating Map instances or executing array `.find()` inside nested `.map()` render loops (like cross-study matrices or study list cards) causes quadratic operations and garbage collection pressure on every render frame (e.g. state changes, user keystrokes, polling timers).
**Action:** Always wrap data index maps in `useMemo` and construct composite-key HashMaps (`${paperId}_${varId}`) for matrix grid cells to achieve O(1) lookup during component render.

## 2026-03-31 - Indexing Graph Link Relations & Memoizing SVG Canvas Elements
**Learning:**
1. Nested loops over graph links (e.g. mapping `has_extraction` -> `value_of` relations when filtering out intermediate nodes) execute quadratic O(L^2) iterations on every render frame when filters change or state updates.
2. Unmemoized SVG dot symbols and row summaries in bee-swarm scatter maps cause all 300+ SVG node trees to re-evaluate on every `onPointerMove` hover frame tick.
**Action:**
1. Pre-build single-pass HashMaps (`Map<source, target[]>`) for relation links to convert nested link lookups from O(L^2) to linear O(L).
2. Wrap leaf SVG dot symbols (`DotSymbol`) and row summaries in `React.memo` so canvas hover state updates only re-render the tooltip and targeted hover ring without re-evaluating the entire SVG DOM tree.
