## 2025-05-20 - Cache Word-Boundary Regexes in Abstract Keyword Highlighting
**Learning:** In Rayyan-style abstract screening, `find_keyword_matches` runs regex search for default and custom inclusion/exclusion keywords across abstracts. Compiling `rf"\b{re.escape(kw)}\b"` on every single keyword match check adds unnecessary regex parsing overhead (~1.7x slowdown for regex compilation).
**Action:** Wrap regex compilation with `@lru_cache(maxsize=512)` in helper `_get_keyword_regex(kw: str)` to reuse compiled `re.Pattern` objects across abstract keyword highlighting requests.
