# Data Extraction & Tracing — Demo Removal + "Does It Actually Work" Plan

Repo: `ExtractExperimenting-web` · 2026-10-27 · Companion to `sr_logic_fix_plan.md` (independent; can run in parallel)

## Verdict

**Extraction: real and mostly well-built. Tracing: dead in this deployment. Demo code: pervasive and reachable by real users.**

The LLM → tables → regex → keyword extraction cascade is genuine and writes real rows. But **Laya evidence tracing never runs**: the ONNX weights were never downloaded, the loader looks in the wrong directory, and every tracing call silently no-ops — while extractions still "succeed" with quotes, pages, and confidence scores that look verified but aren't.

---

## PART A — Why Laya tracing is dead (fix first)

### A1. [FATAL] ONNX weights missing
`laya/onnx/` contains only `README.md`, `laya_config.json`, `tokenizer/` — **no `laya.onnx`**. `laya_engine.py:63` would raise on load. `download_models.py` downloads to `laya/models/` and was never run successfully.
**Fix:** Run `laya/download_models.py`; commit weights via Git LFS or a release asset; document the step in the backend README.

### A2. [FATAL] Path mismatch — loader looks in `laya/models/`, repo ships `laya/onnx/`
`jev_client.py:47-56` checks only `laya/models/laya.onnx`; the config and tokenizer actually live in `laya/onnx/`. `_get_laya_model_dir()` returns `""` even with weights present.
**Fix:** Add `laya/onnx/` to the candidate paths, or make `LAYA_MODEL_DIR` mandatory with a loud startup error.

### A3. [FATAL] Tracing failure is a silent no-op
`laya_extraction_tracer.py:60-61`: `if not is_jev_enabled(): return None` — with no key and no model dir, `trace_all_extractions` returns extractions unchanged, wrapped in `try/except → logger.warning` (`auto_extract_service.py:246-249`). The API response has **no field telling the user tracing was skipped**.
**Fix:** Add `tracing: "disabled" | "failed" | "verified"` to the extraction response and study status; log WARNING once per batch.

### A4. [HIGH] Per-candidate verification errors swallowed at DEBUG
`laya_extraction_tracer.py:139-140` — a Jev outage degrades tracing to nothing with no WARN and no user signal.
**Fix:** WARNING once per batch; annotate items `tracing_failed`.

### A5. [HIGH] "Calibrated confidence" is false advertising
Tracer docstring promises "high-precision calibrated probability" but the model card says logits are **uncalibrated**; hardcoded confidences everywhere: keyword matches `0.70` (`auto_extract_service.py:66-84`), Docling range-checks `0.85–0.93` (`docling_extract_service.py:110-133`), LLM `0.95/0.70` (`llm_extractor.py:196`).
**Fix:** Rename field to `score`, or calibrate against a labeled set; stop emitting `[DS]` ("directly stated") from the keyword fallback — a 150-char sentence snippet is not a verbatim value.

### A6. [HIGH] Page numbers are estimates
Full-text fallback assigns **page 1 to every sentence** (`laya_extraction_tracer.py:44-46`); character-position guesses elsewhere (`auto_extract_service.py:74`, `docling_extract_service.py:297-301`); CALC derivations hardcode page 1 (`coded_extraction_service.py:186-193`).
**Fix:** Emit `source_page: null` unless the quote was located in a specific page's text.

### A7. [HIGH] Table values can never be Laya-verified
Table "quotes" are reconstructed strings (`docling_extract_service.py:196`, `coded_extraction_service.py:170`) that fail `verify_quote_provenance` and get `[UNVERIFIED QUOTE]`; the tracer only scans page text, never Docling tables.
**Fix:** Feed table cell text (with page) into the tracer's page-sentence index.

### A8. [HIGH] Tracer trusts an existing quote without verbatim check
`laya_extraction_tracer.py:163-183` — asks Laya "does this excerpt state X?" about **the quote itself**; a hallucinated quote scoring ≥0.5 gets `laya_verified=True`.
**Fix:** Verify the quote against document text *before* Laya confirmation.

## What's verified working (do not touch)
- Real extraction chain: `/studies/{id}/auto-extract` → `docling_extract_service`; `/studies/{id}/coded-extract` → `coded_extract_study`
- `verify_quote_provenance` (`auto_extract_service.py:96-146`) — real normalized/fuzzy quote verification with downgrade
- Coded extraction discipline: verbatim check before `[DS]`, CALC requires shown arithmetic, `-99/-77/-88` taxonomy, human-edit preservation on rerun
- Jev client engineering: circuit breaker, retries, engine selection — sound once a model/key exists
- Tests are meaningful but monkeypatch `jev_client.ask` with constant `noul: 0.85` — they would never catch A1–A3. Add an integration test that asserts tracing is actually attempted.

---

## PART B — Demo removal (ordered by risk)

### B1. [WORST] Frontend silently substitutes fake data on server errors
`src/lib/api.ts:1601-1606` (+ identical `radextract_platform/frontend` copy): `request()` catches any 404/5xx and returns `handleDemoRequest()` — **fabricated results shown with no demo mode required**. The banner even claims "No demo results have been substituted."
**Action:** Delete the 404/5xx fallback branch; throw instead.

### B2. Default project silently serves DEMO_STUDIES
`api.ts:229-231, 240` — `getStoredProjectStudies` returns `DEMO_STUDIES` for `"demo"` **or the default `"proj_pam_current"`** when localStorage is empty.
**Action:** Remove the `isDemo` branch.

### B3. Full demo dataset + demo mode
`src/lib/demoData.ts` (1,654 lines of fake studies with real-looking PMIDs/DOIs, fake RoB/GRADE/meta results, fake accuracy metrics); ~40 `DEMO_*` branches across `api.ts`; demo-mode toggle in `ApiSettingsModal.tsx`; consumers in `ApiConnectionBanner`, `CodebookDesignerModal`, `CuratedExcelModal`, `ExtractionSheetPage`, `PdfViewerPage`, `ProjectList`. Also `radextract_platform/frontend/src/data/demoRigorData.ts` (dead code, no importers).
**Action:** Delete `demoData.ts` + all `DEMO_*` branches + demo toggle, in **both** frontend copies.

### B4. Mock RoB runs in production when LLM gateway is down
`routers/rob.py:304-312` + `models.py:636` — `model_fn_name` **defaults to `"mock"`**; `rob_service.py:875` falls back to `mock_model_fn` when LLM unavailable; `rob_ai.py:401-560` is the fabricated-answer generator ("This is NOT a real AI — it's a deterministic stand-in") writing fake judgments with quotes and `page: 1` into real projects.
**Action:** Default to real LLM; raise 503 if unavailable; delete `mock_model_fn` family (move a copy to tests/).

### B5. Hardcoded ephemeral backend + public discovery
`api.ts:31, 100-104` — production "backend" is a `*.trycloudflare.com` tunnel; auto-discovery fetches the backend URL from a public GitHub raw URL (`api.ts:82-85`) + `public/active_backend.json`.
**Action:** Remove tunnel URL, GitHub discovery, and the JSON file; require `VITE_API_BASE_URL`.

### B6. Example endpoints + hardcoded API key
`routers/rigor_scan.py:31-47` serves a pre-scanned example paper/PDF to any user; `config.py:41` has a committed secret-shaped fallback API key.
**Action:** Gate examples behind env flag or move to tests/; remove the fallback key, require env config.

### B7. Seed scripts (CLI-only, keep out of prod)
`scripts/seed.py` (fabricated studies, fake DOIs), `preload_test_data.py` (wipes & reseeds `proj_pam_current` with hardcoded extraction values), `seed_example_study.py` (runs mock RoB prefill), `seed_pam_protocol.py`, `run_pam_protocol.py`.
**Action:** Exclude from prod image; never run against a production DB. Nothing in the app imports them (verified).

### B8. Decide the duplicate frontend
`src/` and `radextract_platform/frontend/src/` are byte-identical duplicates — every fix must land twice, or delete one.
**Action:** Confirm which one builds; delete the other.

### False positives — do NOT remove
`sample_size` (clinical variable), SQL placeholders, `DeterministicScreener`/`DeterministicBackend`/`MockProcessor` (test substrates, never instantiated in prod code), disposable-email blocklist, "demographics" hits.

---

## Suggested execution order for the coding agent
1. **B1 + B2** (fake data on server errors / default project) — highest user risk, ~1 hr
2. **A1 + A2 + A3** (Laya weights, path fix, tracing visibility) — makes tracing actually exist, ~half day
3. **B4** (mock RoB) — fabricated judgments in real projects
4. **B3 + B5 + B6** (demo dataset, tunnel, examples, key)
5. **A5–A8** (confidence honesty, pages, tables, quote pre-check)
6. **B7 + B8** (hygiene)
7. **Regression rule:** every removal ships with a test asserting the demo path no longer exists (e.g., `request()` on a 500 throws); add an integration test that tracing is attempted when a model is present and *visibly skipped* when not.
