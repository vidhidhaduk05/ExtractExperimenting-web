# V Platform (formerly RadExtract)

**Version:** `0.9.0` · **Design:** [Master Theme](docs/MASTER_THEME.md) · **Changelog:** [CHANGELOG.md](CHANGELOG.md)

V is an evidence synthesis and systematic review platform for radiology and clinical research. It pairs local Laya / JEV screening and extraction models running on local GPU infrastructure with DerSimonian-Laird meta-analyses, PRISMA 2020 flow automation, and GRADE evidence certainty assessments.

---

## Repository Layout (Directory Overview)

- **`radextract_platform/backend/`**: Python FastAPI application housing the core REST API endpoints (`routers/`), database access layer (`database.py`, `models.py`), study screening (`services/laya_screener.py`), evidence extraction tracer (`services/laya_extraction_tracer.py`), PRISMA sync (`services/prisma2020_sync.py`), and test suites (`tests/`).
- **`radextract_platform/frontend/`**: The single authoritative React/Vite web application implementing the Academic Editorial Master Theme (`#3a0f34` wine, `#fbf9f4` canvas), stage navigation (`StageTabs.tsx`), screening split view (`CompactScreeningSplitView.tsx`, `SplitLayout.tsx`), and full interactive workflows.
- **`laya/`**: Local Laya ONNX inference engine bundles and model weights for zero-key offline eligibility screening, text categorization, and clinical variable triage.
- **`jev-ultrafast/`**: High-throughput study screening pipeline and test runners for batch screening verification.
- **`docs/`**: Authoritative protocol specifications, architectural decisions, and the Master Theme styling guide.
- **`.agents/`**: Autonomous engineering rules, invariants, and multi-skill execution guides.

---

## Current State

- **Stage Navigation**: Seamless stage progression tabs (`Protocol · Studies · Screening · Extraction · RoB · GRADE · Meta · Export`) with gate tooltips and deep link support.
- **Screening Split Layout**: Compact resizable split view (default 40% left study table, right multi-tab reading pane, pinned bottom decision bar, and keyboard navigation via `↑/↓` or `J/K` and `I/U/E`).
- **Statistical Pooling**: Rigorous inverse-variance fixed effects and DerSimonian-Laird random effects meta-analysis; non-poolable states ($k < 2$) render transparent narrative synthesis tables.
- **PRISMA 2020 Tracking**: Flow diagram strictly derived from recorded decision events (`screened`, `retrieved`, `assessed_ft`, `included`, `analysed`), with explicit pending work buckets.
- **GRADE Finalization**: Outcome-specific Risk of Bias aggregation requiring verified assessments; finalization is strictly gated on completed synthesis.

---

## Branch Policy & Maintenance

- **Deployable `main`**: Main is always deployable and build-green.
- **Branch Archival**: Agent branches (`bolt/*`, `codex/*`, `jules/*`, `sentinel/*`) are tagged `archive/<branch-name>` and pruned from remote once merged.
- **Banned Strings**: The repository strictly rejects legacy mock strings (`velvet`, `steal the whole`, `senior mode`, `DEMO_STUDIES`) via automated checks.

---

## Data Reset & Seed Scripts (manual CLI tools only)

The seed scripts are **never** invoked on app startup or by any router. A fresh database boots with zero projects and zero studies; all data enters through the app's own import flow. To wipe test data deliberately, run these from `radextract_platform/backend/`:

```bash
# Reset screening decisions/AI state for a project (keeps studies)
python scripts/reset_screening.py

# Full clean slate: stop the app, delete the SQLite database, restart.
# The backend recreates an empty schema on boot. Seed scripts are opt-in only:
python scripts/seed.py                # example corpus (manual, test DBs only)
python scripts/seed_example_study.py  # single example study (manual)
python scripts/seed_pam_protocol.py   # PAM protocol example (manual)
```

Never point seed scripts at a production database.
