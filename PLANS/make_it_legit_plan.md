# Make It Legit — Backend & Persistence Fix Plan

Repo: `ExtractExperimenting-web` · 2026-10-27 · Merges the persistence audit + demo removal + tracing findings into one ordered work plan.

## Current state (verified)

- The backend **fails to boot in a clean environment** unless every `requirements.txt` package is installed (`python-jose` missing broke startup at `dependencies.py:16`). No startup self-check exists.
- **The live database is a `/tmp` copy.** `main.py:42-44` stages the SQLite DB to `$TMPDIR` on startup (`STAGE_DB_SCRATCH` defaults on) and syncs back only on graceful exit (`database.py:24-110`). A crash, OOM, or `docker kill` silently discards **every write since process start**. Multiple workers = last-writer-wins overwriting.
- **Uploads lie about success.** `routers/studies.py:210-214` swallows PDF-processing failure (`except: pass`) and the response always says `"pdf_status": "processed"` even when nothing was processed.
- **Laya tracing never runs** (missing ONNX weights + wrong path `laya/models/` vs `laya/onnx/` + silent no-op) — extractions return quotes/pages/confidence that were never verified.
- **Demo data is reachable by real users** — `api.ts` substitutes fabricated data on any 404/5xx; default project serves `DEMO_STUDIES`; mock RoB judgments are written when the LLM gateway is down.
- No upload validation: no PDF magic-byte check, no size limit on batch endpoints, size check happens after full in-memory read.
- Orphaned files: deleting a study removes DB rows but never the PDF/sidecar files; exports accumulate forever with no cleanup.

---

## Phase 1 — Make persistence real (week 1)

1. **Kill the `/tmp` DB staging.** Make `STAGE_DB_SCRATCH` default **off**; if the NFS-lock problem it was built around is real, replace with WAL + periodic checkpoint sync (timer, not `atexit`), and never delete `-wal`/`-shm` of the persistent DB while other processes may hold it. *Acceptance: `kill -9` the server mid-write; restart; all writes present.*
2. **Stop lying about upload status.** Remove the `except: pass` in `upload_pdf`; return real `pdf_status` (`processed | failed: <reason>`); add an `error_message` column surfaced in the UI. *Acceptance: uploading a corrupt PDF returns a visible failure, not "processed".*
3. **Validate uploads.** Enforce `max_upload_mb` in all three upload endpoints **before** reading the body (stream/chunk); check `%PDF` magic bytes; reject others with 415. *Acceptance: a 600 MB file is rejected without spiking memory; a text file named `.pdf` gets 415.*
4. **File lifecycle.** Delete `{study_id}.pdf` + `.docling.json` sidecars on study/project delete; add a startup reconciliation pass (DB row without file → mark `pdf_status='missing'`; file without row → quarantine dir). Add an exports cleanup job (e.g., delete export copies >30 days).
5. **Boot self-check.** On startup, verify: all requirements importable, DB writable, uploads dir writable, LLM key present or explicitly absent, Laya model present or tracing explicitly marked disabled — log a single startup report and expose it at `/api/health/full`.

## Phase 2 — Remove everything fake (week 1, parallel)

6. **Frontend:** delete the 404/5xx demo fallback in `api.ts:1601-1606` (both frontend copies), the default-project `DEMO_STUDIES` fallback (`api.ts:229-240`), `demoData.ts`, all `DEMO_*` branches, the demo-mode toggle. *Acceptance: a 500 error shows an error state, never data.*
7. **Backend:** remove mock RoB (`models.py:636` default `"mock"`, `rob_service.py:875` fallback, `rob_ai.mock_model_fn` → move to tests/); return 503 "LLM unavailable" instead. Remove the hardcoded fallback API key (`config.py:41`) and the trycloudflare/GitHub backend discovery (`api.ts:31, 82-85`, `public/active_backend.json`) — require `VITE_API_BASE_URL`.
8. **Resolve the duplicate frontend** (`src/` vs `radextract_platform/frontend/src/`, byte-identical): keep one, delete the other, so fixes land once.

## Phase 3 — Make verification honest (week 2)

9. **Fix Laya:** download/commit the ONNX weights; fix the model-dir candidates; add `tracing: "disabled" | "failed" | "verified"` to every extraction response and the study status so a skipped trace is *visible*. *Acceptance: integration test asserts tracing is attempted with a model present and visibly skipped without one.*
10. **Honest confidence:** rename `confidence` → `score` OR calibrate against a labeled set; stop emitting `[DS]` from keyword fallback; emit `source_page: null` instead of guessed pages; feed table cells into the tracer; verify quotes against document text *before* Laya confirmation.
11. **Harden SQLite layer:** auto-commit in the `get_db` finally-block (or audit every router for commit); add `ON DELETE CASCADE` or explicit cleanup for `pdf_documents`/`extractions` so `delete_study` stops 500-ing; keep WAL + busy_timeout (verified solid).

## Phase 4 — Prove it (week 2)

12. **End-to-end smoke test** (pytest + httpx): create project → upload real PDF → screen → extract → trace → export Excel → assert DB rows, files on disk, and export contents all match. Run in CI on every push.
13. **Crash test:** `kill -9` during extraction; restart; assert no partial rows and all pre-crash writes intact (Phase 1.1 acceptance).
14. **Demo-free assertion:** grep-gate in CI — build fails if `handleDemoRequest`, `DEMO_STUDIES`, or `mock_model_fn` reappear outside `tests/`.

## Verified solid — keep
WAL + busy_timeout + per-request connections; path-traversal guard; UUID storage keys; online `sqlite3.backup()` script; exports streamed from memory; `pdf_documents` DB fallback; audit logging of extraction edits; batch-undo transaction discipline.
