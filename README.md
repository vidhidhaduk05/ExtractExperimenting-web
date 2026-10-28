# V Platform (formerly RadExtract)

Systematic literature review platform: PRISMA 2020 protocol, PICO extraction from
uploaded protocols, clinical eligibility screening, data extraction, GRADE,
meta-analysis, and exports.

- **Frontend**: React + Vite + TypeScript (`radextract_platform/frontend`) — deployed to GitHub Pages.
- **Backend**: FastAPI + SQLite (`radextract_platform/backend`) — runs locally or on any Python host.

## Live site

https://vidhidhaduk05.github.io/ExtractExperimenting-web/

The Pages site is static — it needs a backend to be functional. Connect one via the
in-app API settings (or the auto-published `active_backend.json` tunnel URL).

## Deploying the backend

The backend is containerized (`radextract_platform/backend/Dockerfile`) and ships
configs for three providers. All of them mount a persistent volume at `/data`,
where the SQLite database (`/data/database/radextract.db`) and the STUDY DATA tree
(`/data/storage/PROJECTS/...`) live. CORS is pre-wired for the GitHub Pages origin.

### Render (render.yaml blueprint)

1. Push this repo to GitHub (already done).
2. Render Dashboard → **New → Blueprint** → select this repo. Render reads `render.yaml`:
   Docker build from `radextract_platform/backend`, health check `/health`,
   5 GB disk mounted at `/data`, env vars set.
3. Click **Apply**. When live, note the URL (e.g. `https://radextract-backend.onrender.com`).
4. On the Pages site, open API settings and set the API base to that URL.

Note: persistent disks require a paid plan; on the free tier the disk is ephemeral
and the database resets on every restart.

### Fly.io (fly.toml)

```bash
fly launch --no-deploy --copy-config          # creates the app from fly.toml
fly volumes create radextract_data --size 5 --region iad
fly deploy
fly status                                    # note the *.fly.dev URL
```

### Railway (railway.json)

1. Railway → **New Project → Deploy from GitHub repo**.
2. Railway auto-detects `railway.json` (Dockerfile build, `/health` check).
3. Add a **Volume** mounted at `/data`, and set env vars `DATABASE_PATH=/data/database/radextract.db`,
   `STORAGE_ROOT=/data/storage/PROJECTS`.
4. Generate a public domain under Settings → Networking, then set it as the API base on the Pages site.

### After deploying

- Health check: `GET /health` → `{"status": "healthy", ...}`
- Storage settings: `GET /api/settings/storage` shows the live data folder.
- The Pages frontend stores the backend URL in the browser (API settings modal);
  every page then reads real data — no demo content exists anywhere.

## Local development

```bash
# Backend
cd radextract_platform/backend
python -m venv venv_backend && source venv_backend/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# Frontend
cd radextract_platform/frontend
npm install && npm run dev
```

Environment variables: `DATABASE_PATH` (SQLite location), `STORAGE_ROOT`
(STUDY DATA tree), `CORS_ORIGINS`, `PUBMED_API_KEY` (optional, higher PubMed rate limit).

## Data reset & seed scripts (manual CLI tools only)

Seed scripts (`scripts/seed.py`, `seed_example_study.py`, `seed_pam_protocol.py`)
are manual tools — nothing runs them at startup.

- Reset screening decisions: `python scripts/reset_screening.py`
- Full reset: stop the app, delete the database file (`DATABASE_PATH`, default
  `radextract_platform/backend/radextract.db`) and the storage tree
  (`STORAGE_ROOT`), then restart — the app boots empty.
- On a deployed instance, delete the project from the UI, or wipe the volume's
  `database/` and `storage/` folders and restart.
