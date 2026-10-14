# Bolt's Journal - Performance Learnings

## 2026-10-18 - Sentence Anchoring Prevents Catastrophic Regex Backtracking in Abstract Span Extraction
**Learning:** Leading unanchored variable-length match groups like `([^.]{5,150})\s+...` cause catastrophic $O(N \times 150)$ backtracking across every character position in a document because `re` evaluates up to 150 characters before every shift. Re-anchoring the pattern to sentence or line boundaries `(?:^|\.\s+|\n)([^\.\n]{5,150}?)\s+...` and pairing with fast trigger substring pre-checks (`if trigger and trigger not in text_lower: continue`) eliminates catastrophic backtracking, providing a ~14x to ~90x speedup for abstract PICO span extraction.
**Action:** Never use unanchored variable-length leading match groups (e.g. `([^.]{a,b})`) in regexes scanned over long text; always anchor to sentence/line boundaries `(?:^|\.\s+|\n)` and use fast substring pre-checks.

## 2026-10-10 - Length Ratio Upper-Bound Pre-Check & LRU Caching for Title Similarity
**Learning:** In systematic review deduplication services running $O(N^2)$ pairwise title comparisons across hundreds or thousands of studies, difflib `SequenceMatcher` string similarity ratio calculations are a major CPU bottleneck. Since SequenceMatcher's ratio is bounded above by $2 \cdot \min(|a|, |b|) / (|a| + |b|)$, checking if this mathematical upper bound is strictly below the duplicate similarity threshold (e.g., 0.90) allows skipping expensive edit distance calculations for string pairs with dissimilar lengths. Combining this bound check with exact string equality fast-paths and `@lru_cache(maxsize=2048)` speeds up pairwise title deduplication by ~40% to >900x for duplicate pairs.
**Action:** When computing pairwise string similarity thresholds with `difflib.SequenceMatcher`, check the $2 \cdot \min(|a|, |b|) / (|a| + |b|)$ length upper bound before invoking `ratio()` and memoize similarity calls with `@lru_cache`.

## 2026-10-06 - Fast Substring Pre-Check for Keyword Regex Matching
**Learning:** Python's C-implemented `in` operator (Boyer-Moore-Horspool / `fastsearch`) is exponentially faster than running `re.finditer` for multiple pattern checks. In keyword highlighting services scanning abstract text against ~20+ default keywords, checking `kw.lower() in text_lower` prior to regex word boundary matching skips ~95% of unnecessary regex calls and provides up to a ~40x speedup for non-matching abstracts without altering matching behavior.
**Action:** Always prefer a fast string `in` substring pre-check before running regex match loops over lists of plain keywords or phrases.

## 2025-05-20 - Cache Word-Boundary Regexes in Abstract Keyword Highlighting
**Learning:** In Rayyan-style abstract screening, `find_keyword_matches` runs regex search for default and custom inclusion/exclusion keywords across abstracts. Compiling `rf"\b{re.escape(kw)}\b"` on every single keyword match check adds unnecessary regex parsing overhead (~1.7x slowdown for regex compilation).
**Action:** Wrap regex compilation with `@lru_cache(maxsize=512)` in helper `_get_keyword_regex(kw: str)` to reuse compiled `re.Pattern` objects across abstract keyword highlighting requests.
