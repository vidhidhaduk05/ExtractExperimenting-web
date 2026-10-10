# Deployment Readiness Plan — ExtractExperimenting (Systematic Review Tool)

**Repo:** `vidhidhaduk05/ExtractExperimenting-web`
**Date:** 2026-10-07
**Companion doc:** `plan_integrated_rob_ai_screening.md` (integrated RoB + popup plan — builds on this foundation)

---

## 1. Diagnosis (why nothing saves or runs today)

| Finding | Evidence | Consequence |
|---|---|---|
| **The backend was never written** | No FastAPI/Flask code in any branch of the repo; no backend repo on the GitHub profile; only `patch_api_*.js` frontend patches | Every real feature (AI screening, RoB, saving to a shared database) has never had a server |
| **The deployed site is hard-coded to demo mode** | `api.ts` → `request()`: `if (isGithubPages \|\| isDemoExplicit \|\| ...) return handleDemoRequest(...)` | On GitHub Pages, no network call is ever attempted; "saves" mutate in-memory demo objects and vanish on refresh |
| **Local persistence is browser-only** | `getStoredProjectStudies()` / `saveStoredProjectStudies()` use `localStorage` | Data is per-browser, per-device, lost on cache clear, invisible to other users |
| **Silent fallback masks failures** | `catch (err) { return handleDemoRequest(...) }` | When the API is down, the app quietly shows demo data instead of an error — this is why the breakage is confusing |

**Conclusion:** the fix is not storage (Google Drive ruled out) — it is **building and deploying the real backend**, then pointing the frontend at it.

---

## 2. Confirmed Constraints

| Decision | Choice |
|---|---|
| Backend code | Does not exist — must be built (scoped from `src/lib/api.ts`, which is a de-facto complete API spec: ~2,700 lines of typed endpoints + demo data giving exact response shapes) |
| Users | Just the owner + small team → **single-tenant, minimal auth** (one shared login or simple per-user passwords, no org management) |
| Hosting | **Own server / VPS** → Docker Compose, HTTPS via Caddy or nginx + Let's Encrypt |
| Storage | **No Google Drive** — PDFs and data stored server-side (volume-mounted directory + database) |

---

## 3. Target Architecture

```
 Browser ──HTTPS──► GitHub Pages (static frontend, KEEP for now)
                    │   vite build output; API base = https://api.<domain>/api
                    │   (remove isGithubPages demo-gating in api.ts)
                    │
                    │  cross-origin API calls (CORS enabled on backend)
                    ▼
          ┌────────────── VPS (Docker Compose) ──────────────┐
          │  Caddy (auto-HTTPS)                              │
          │    └── /api/*  → FastAPI backend container       │
          │          ├── SQLite (data) on volume             │
          │          ├── /data/pdfs (uploads) on volume      │
          │          └── asyncio background workers          │
          │              (AI screening, batch RoB)           │
          └──────────────────────────────────────────────────┘
                                   │
                                   ▼
                        LLM provider API (key via env var)
```

**Note:** the earlier suggestion of serving the frontend from the VPS remains the simpler long-term option (same-origin, no CORS); GitHub Pages is fully workable and is the chosen path for now.

**Stack choices (simplest that works for a single team):**
- **Backend:** FastAPI + SQLAlchemy + SQLite (WAL mode). SQLite is genuinely sufficient at this scale (one team, tens of thousands of rows); Postgres is a drop-in upgrade later via `DATABASE_URL`.
- **PDF storage:** plain files under `/data/pdfs/{project_id}/`, path referenced in DB.
- **Background jobs:** FastAPI asyncio background tasks (matches the in-memory progress pattern the frontend already polls). No Celery/Redis needed at this size.
- **LLM:** any OpenAI-compatible endpoint via env vars (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) — keeps the provider swappable.
- **Frontend:** `vite build` output served by Caddy; **remove the GitHub Pages demo gating** (§5.2).

---

## 4. Backend Build Plan (the main work item)

### 4.1 Scope — endpoint groups derived from `api.ts`

Priority order; each group is a router. The demo data in `src/lib/demoData.ts` doubles as the fixture set for tests.

| Priority | Router | Endpoints (from `api.ts`) | Notes |
|---|---|---|---|
| **P0 — core loop** | Auth | login / token issue | Simple: username + password (bcrypt), JWT. One admin user seeded; team members added via CLI/script |
| | Projects | CRUD `/projects` | |
| | Studies | CRUD `/projects/{id}/studies`, bulk PDF upload, PDF retrieval | Upload → store file → extract text (PyMuPDF) → metadata |
| | Screening | `listScreening`, `screeningSummary`, `screening-decision`, exclusion reasons, keywords CRUD | |
| | AI screening | `ai-screening/start`, `/continue`, `/status`, `/progress` | Multi-stage (title→abstract→fulltext) asyncio task; in-memory progress dict keyed by project — the frontend already polls this exact shape |
| | Clarifications | list per project/study, answer, batch-answer, dismiss, stats | Question creation inside the screening loop when confidence < threshold; answer → re-evaluate single study |
| **P1 — review layer** | RoB | tools, auto-select, assessments CRUD, answers, judgments, ai-prefill, accept-ai, summary, export | Tool definitions (RoB 2 first; ROBINS-I/ROBINS-E/QUADAS-2/NOS per the integrated-RoB plan) as seed data |
| | Extraction | coded extract, extraction decide/verify, review matrix | |
| | Export | CSV / XLSX / JSON per project | `openpyxl` for XLSX |
| **P2 — analytics** | PRISMA, GRADE, meta-analysis, PICO, manuscript/bibliography drafts | | Can ship after the review loop works end-to-end |

### 4.2 Data model (SQLite tables)

`users`, `projects` (+ `auto_rob_enabled`, `rob_confidence_threshold` from the RoB plan), `studies`, `screening_keywords`, `exclusion_reasons`, `clarification_questions`, `ai_runs` (persisted runs — fixes the in-memory restart risk), `rob_tools` (seeded), `rob_assessments`, `rob_domain_judgments`, `rob_signaling_answers`, `extraction_variables`, `extraction_records`, `grade_assessments`, `grade_factors`, `meta_analyses`.

### 4.3 AI screening worker (backend)

1. `POST .../ai-screening/start` creates an `ai_runs` row, launches an asyncio task.
2. Loop over pending studies per stage: build prompt (PICO criteria + stage instructions + title/abstract/full text), call LLM, parse `{decision, confidence, reason, highlights}`.
3. Confidence < threshold → set `awaiting_clarification`, create `ClarificationQuestion` row, **continue to next study** (never block).
4. Update in-memory progress dict (`active, stage, current_study_id, done_ids, pending_ids`) after each study — the frontend renders studies live from this.
5. On completion: mark run done; if `auto_rob_enabled`, enqueue the batch RoB run (per the integrated-RoB plan).
6. On answer to a clarification: re-evaluate that one study, write `final_decision`.

### 4.4 Repository layout (new backend repo, e.g. `ExtractExperimenting-api`)

```
app/
  main.py            # FastAPI app, CORS, routers, startup
  auth.py  models.py  schemas.py  database.py
  routers/           # projects, studies, screening, ai_screening, clarifications,
                     # rob, extraction, grade, meta_analysis, export, prisma, pico
  services/          # llm_client.py, pdf_text.py, screening_engine.py, rob_engine.py
  tools/             # rob tool definitions as JSON/YAML seed (rob2.json, robins_i.json, ...)
tests/               # pytest; fixtures mirror demoData.ts
Dockerfile
docker-compose.yml   # api + caddy + volumes
.env.example         # LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, SECRET_KEY, ADMIN_PASSWORD
```

---

## 5. Frontend Changes (small but required)

### 5.1 `src/lib/api.ts`
- Delete the `isGithubPages` / `API_BASE === "/api"` demo-gating branch in `request()` — the deployed site must call the real API.
- Keep `handleDemoRequest` only behind an explicit `demo_mode` localStorage flag (useful for offline demos).
- On fetch failure: **surface an error banner** instead of silently falling back to demo data (this silent fallback is what hid the missing backend).

### 5.2 Deployment config (GitHub Pages kept as frontend host)
- **Keep** the GitHub Pages deployment; it continues to serve the static bundle.
- Remove the `isGithubPages` / `API_BASE === "/api"` demo-gating branch in `request()` so the Pages site calls the real backend.
- Set `VITE_API_BASE_URL=https://api.<your-domain>/api` (or VPS URL) at build time — cross-origin, so:
  - Backend must enable CORS for the Pages origin (`https://<user>.github.io`) — one `CORSMiddleware` line in FastAPI.
  - Backend must be **HTTPS** (GitHub Pages is HTTPS; browsers block mixed content). Caddy auto-HTTPS covers this.
- Keep `handleDemoRequest` behind the explicit `demo_mode` localStorage flag as an offline demo of the Pages site until the backend is live; after go-live, replace the silent fallback with a visible error banner.
- GitHub Pages serves whatever is pushed to `gh-pages` — rebuild/deploy is just `npm run build` + push, unchanged from today's workflow.

### 5.3 Minor
- `localStorage` study persistence can remain as an offline cache but must never be the source of truth once the API exists.

---

## 6. VPS Deployment Steps (runbook)

1. **Provision:** any 2 vCPU / 4 GB VPS (the LLM calls are remote; the box only runs FastAPI + SQLite + Caddy). Ubuntu 24.04 + Docker.
2. **Clone the backend repo**, create `/opt/extractexp/` with `docker-compose.yml`:
   - `caddy` (80/443, auto-HTTPS with your domain, proxies `/api/*` → `api:8000`; frontend stays on GitHub Pages)
   - `api` (built from backend Dockerfile; volumes: `./data/db`, `./data/pdfs`; env: LLM keys, `SECRET_KEY`, `ADMIN_PASSWORD`, `CORS_ORIGINS=https://<user>.github.io`)
3. **First boot:** `docker compose up -d`, then `docker compose exec api python -m app.seed` (creates admin user + RoB tool definitions).
4. **DNS:** point an A record at the VPS; Caddy obtains the Let's Encrypt cert automatically.
5. **Backups:** nightly cron `sqlite3 .backup` + `rsync` of `/data` off-box (or litestream to S3 if preferred).
6. **Smoke test:** upload one PDF → run AI screening on it → answer a forced clarification → confirm the study persists after `docker compose restart` (proves DB, not localStorage).

---

## 7. Milestones

| Milestone | Deliverable | Est. effort |
|---|---|---|
| **D1** | Backend skeleton: auth, projects, studies CRUD, PDF upload + text extraction, SQLite schema | 4–6 days |
| **D2** | AI screening engine + progress endpoint + clarification loop (P0 routers complete) — **the system now saves and runs for real** | 5–7 days |
| **D3** | Frontend de-demo-gating + error banner + VPS deployment (Caddy, HTTPS, backups) — **deployed and usable** | 2–3 days |
| **D4** | RoB module backend (RoB 2 first) + summary/export | 4–6 days |
| **D5** | P2 routers (GRADE, meta-analysis, PRISMA, PICO, manuscript drafts) | 5–8 days |
| **D6+** | Integrated RoB + popup plan (`plan_integrated_rob_ai_screening.md`) phases 1–3 | per that plan |

**Minimum viable deployment = D1 + D2 + D3 (~11–16 days).** Everything from the earlier RoB integration plan layers on top.

---

## 8. Risks & Assumptions

| # | Risk | Mitigation |
|---|---|---|
| 1 | `api.ts` contract may not cover every backend behavior (edge cases in demo handler only) | Build to the contract + fixtures from `demoData.ts`; keep the demo handler as a contract test oracle |
| 2 | LLM cost/quality of screening runs depends on provider choice | Env-var-swappable provider; per-project token budget; cache LLM responses per study+stage hash |
| 3 | Single VPS = single point of failure | Nightly DB + PDF backups off-box; compose file is re-deployable in minutes |
| 4 | SQLite write concurrency during background runs | WAL mode + single writer task; upgrade path to Postgres documented |
| 5 | Auth is minimal by design (single team) | Fine for internal use; do not expose publicly without adding rate limiting + HTTPS-only cookies review |
| 6 | Scope creep: P2 routers before the core loop is stable | Enforce milestone order; P2 is disabled-by-default feature flags until D5 |
| 7 | Cross-origin setup (Pages → VPS): CORS misconfig or mixed-content blocking | Backend CORS allow-list for the Pages origin only; Caddy auto-HTTPS; smoke-test from the Pages URL before removing demo fallback |

---

## 9. Explicitly Out of Scope

- Google Drive / third-party cloud storage (ruled out).
- Multi-tenancy, org management, granular RBAC (single-team deployment).
- Migrating the frontend off GitHub Pages (kept for now; same-origin VPS hosting remains a later simplification option).
- Real-time push (SSE/WebSockets) — polling stays, per the integrated-RoB plan.
