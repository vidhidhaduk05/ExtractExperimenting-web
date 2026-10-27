# Changelog

All notable changes to the RadExtract platform are documented here.

## [0.9.0] - 2026-10-27

### Added
- **Version 0.9.0 Baseline Release**: Consolidated repository architecture with verified local Laya / JEV inference.
- **Stage Navigation (`StageTabs`)**: Horizontal stage strip (`Protocol · Studies · Screening · Extraction · RoB · GRADE · Meta · Export`) with wine `#3a0f34` active indicators and live blocking gate tooltips.
- **Screening Split View (`SplitLayout`)**: Native pointer event resizable split panel layout (persisted width) with left study table and right multi-tab reading pane (`Abstract | Full Text | Details | Notes`), bottom pinned decision bar, and keyboard shortcuts (`↑`/`↓`, `J`/`K`, `I`/`U`/`E`).
- **Authorization Guard**: Added `require_project_access` dependency returning 401 for anonymous calls and 403 for unauthorized users on all sensitive project routes.
- **GRADE Finalization Workflow**: Mandatory DRAFT and FINAL states with finalization gating contingent on completed synthesis.

### Changed
- **Meta-Analysis Scientific Engine**: Rewrote pooling logic in `routers/meta.py` to use exclusively verified extracted effect data (inverse-variance fixed effects and DerSimonian-Laird random effects on log scale). Returns clean `cannot_pool` when $k < 2$.
- **PRISMA 2020 Flow Sync**: Derived all PRISMA buckets strictly from recorded historical decision events (`screened`, `retrieved`, `assessed_ft`, `included`, `analysed`), with explicit pending counts.
- **GRADE RoB Factoring**: RoB factors now count distinct studies strictly within the explicit outcome cohort with verified assessments.
- **Jargon Elimination**: Renamed internal backend modules:
  - `jev_client.py` → `laya_client.py`
  - `jev_screener.py` → `laya_screener.py`
  - `antigravity_*.py` → `agent_*.py`
  - `clinical_storm_service.py` → `study_triage_service.py`
- Replaced frontend legacy jargon strings ("Co-Scientist", "Velvet", "Senior Mode", "[LAB]") with plain editorial and systematic review terminology.

### Removed
- Removed duplicate root `src/` tree (`git rm -r src`) to enforce single source of truth in `radextract_platform/frontend`.
- Removed unrouted `PicoPage.tsx` and `HypothesisPage.tsx` (superseded by `PicoHypothesisPage.tsx`).
- Removed unrouted `BlindReviewPage.tsx` (superseded by single-reviewer screening workflow).
- Pruned 18 stale remote development branches after tagging tips to `archive/*`.
- Removed synthetic mock data generators and hardcoded forest plot fallbacks.
