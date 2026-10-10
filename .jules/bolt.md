## 2025-05-15 - [PDF Locator Stack Overflow & GC Memory Optimization]
**Learning:** `Math.min(...col1Lines.concat(col2Lines).map(l => l[0].y))` creates multiple intermediate arrays (`concat`, `map`) and spreads arguments onto the call stack. For long PDFs with hundreds of text lines, stack spreading causes `RangeError: Maximum call stack size exceeded` and high GC allocation pressure.
**Action:** Use single-pass imperative loops (`for`) to calculate `colYMin` / `colYMax` in $O(N)$ time and $O(1)$ space without intermediate array allocations or stack spreading.

## 2025-05-15 - [React Abstract Highlights Render Memoization]
**Learning:** Re-executing text-highlighting algorithms and React element generation (`<mark>`, `<span>`) on every render of a large page component like `ScreeningPage` causes main-thread lag during search typing or filter updates.
**Action:** Wrap highlighted abstract generation and derived data structures like `robByStudy` in `useMemo` tied to exact source data dependencies (`selectedStudy?.abstract`, `selectedHighlights?.all_spans`).
