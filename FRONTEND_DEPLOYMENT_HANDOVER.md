# Stellar Labs frontend — deployment handover

Updated: 26 October 2026, Asia/Calcutta.

## Current objective and status

The user approved the standalone Stellar Labs landing and ClaimScape designs, then explicitly requested integration into the main frontend, a GitHub commit/push, and publication to GitHub Pages. The user’s latest request is to save this handover because usage limits are low.

**Integration is implemented and browser-verified. The release source has been copied to the web repository. No commit or push has been performed, and the new design has NOT been deployed yet.**

## Locations

- Workspace: `D:\Desktop\Rad Extract Experimenting`
- Main local frontend: `radextract_platform/frontend`
- Publication checkout: `radextract_web_repo`
- Publication remote: `https://github.com/vidhidhaduk05/ExtractExperimenting-web.git`
- Live site: `https://vidhidhaduk05.github.io/ExtractExperimenting-web/`
- Live ClaimScape: `https://vidhidhaduk05.github.io/ExtractExperimenting-web/#/claimscape`
- Approved references: `D:\Desktop\Website Updated`
- Canonical design preferences: `D:\Desktop\Website Updated\MASTER_THEME.md`
- Release documentation: `radextract_web_repo/docs/MASTER_THEME.md`

The web checkout was clean and fast-forwarded from `820c5f05` to `e6918c8e` before copying this release. Its current modifications are the explicit approved frontend release. Confirm status before committing in case another actor has changed it.

## What was integrated

- Existing landing layout/content preserved, including the draggable ten-note notebook, carousel, use-case gallery, placeholders, reading-room section, contact/footer bands and oversized wordmark.
- Slim top bar exactly `#3a0f34`.
- Local Serifon Editorial Regular/Italic headings and question text; QuadraatSmallCaps body text; Work Sans controls. ClaimScape synthesized headline deliberately retains Quadraat.
- Compact permanently open search options; custom PubMed query/reset, paper counts, narrative/commentary control and seven topic buttons.
- Radiology-only typewriter prompts: mammography, stroke imaging and pulmonary nodules.
- Seven explicit PubMed preset queries, verified live. Radiology presets each retrieved 100 real publications in previous frontend checks. No evidence/results were fabricated; scientific scoring/API behavior was not changed by this integration.
- ClaimScape introduction and three explanation bullets retained. Its “Stay curious” heading and selected framework footer sentence remain removed.
- npm Lenis dependency, rhythmic spring reveals and restrained wheel-edge resistance with reduced-motion/native-touch support.
- React-safe listener/timer/observer/RAF cleanup, route-class cleanup and edge-wrapper teardown.
- Fixed existing landing carousel selector mismatch.
- Landing CSS is isolated to its route. The original app `src/index.css` is restored byte-for-byte to the tracked base; approved ClaimScape CSS is separately scoped to `.claimscape-theme`, imported from `src/main.tsx`.
- Updated document title, description and Stellar Labs favicon.

## Exact release files

`.tmp-release-manifest.json` in the workspace is the authoritative explicit list of **36 destination paths relative to `radextract_web_repo`**. It includes nested build source plus mirrored root `src` files, local fonts, typed motion modules, metadata, Lenis license and master-theme documentation.

Nested frontend files include:

```text
index.html
package.json
package-lock.json
public/stellar-mark.svg
public/licenses/lenis-MIT.txt
src/main.tsx
src/styles/approved-theme.css
src/pages/LandingPage.tsx
src/landing.css
src/landing_body.html
src/assets/motion/spring.ts
src/assets/motion/edgeMotion.ts
src/assets/motion/landingCarousel.ts
src/assets/fonts/QuadraatSmallCaps.ttf
src/assets/fonts/TheSerifonEditorialRegular-G3dBy.otf
src/assets/fonts/TheSerifonEditorialItalic-j9gYj.otf
src/pages/ClaimscapePage.tsx
src/components/claimscape/MethodologySection.tsx
src/lib/researchPresets.ts
src/data/research_presets.json
```

Legacy unimported `landing_scripts.js`, `assets/motion/rhythm.js/css`, vendor clone assets, duplicate public/fonts, prototypes, `.jury` files and all `.tmp-*` helpers are intentionally excluded.

## Verification already observed

- Production Vite build in the main frontend passed after integration: 2647 modules, about 14 seconds. Normal existing large-chunk warning only.
- Browser checks at **1440, 903 and 390 px** passed: correct header color/font, no horizontal overflow or page errors, ten notebook notes, visible controls, seven presets, query editing/reset and correct query/count routing to ClaimScape.
- Repeated landing → ClaimScape → landing navigation passed. Leaving the landing removes route classes, Lenis and edge wrappers; returning initializes one instance. ClaimScape body zoom stays 1.
- Section anchors, notebook dragging and dynamic reduced-motion switching passed.
- All approved ClaimScape instructions/removals and Quadraat synthesized headline checked.
- Local font requests succeeded at all tested widths.
- Focused registry and ClaimScape esbuild checks passed.
- Full TypeScript check still has **pre-existing unrelated errors** in `api.ts`, CitationTelephone, PDF/Pico/Rigor/Rob pages. Changed landing/motion/ClaimScape files have no reported TS errors. Do not fix unrelated files as part of this release.

Useful screenshots in the workspace:

```text
release-landing-1440.png / -903.png / -390.png
release-claimscape-1440.png / -903.png / -390.png
landing-react-integrated-1440.png
claimscape-main-903.png / -390.png
```

Browser verification script: `.tmp-verify-release.mjs`. It blocks API/NCBI calls for UI/lifecycle checks and does not run real backend inference. Run with bundled Node package path below. It defaults to `http://127.0.0.1:5180/`; override `FRONTEND_PREVIEW_URL` for the release preview.

## Running processes when handed over

- Main Vite preview: `http://127.0.0.1:5180/`, command session **35444**.
- `npm ci --legacy-peer-deps` in `radextract_web_repo/radextract_platform/frontend` started and returned command session **68394**. **Poll this first**; it had not produced output at handover creation. Do not assume installation/build completed.
- Main browser QA session 67163 finished successfully.

Sessions may not survive a new agent/app session. If absent, inspect state and rerun the relevant command.

## Remaining steps

1. Poll dependency-install session 68394, or check/install dependencies in the nested release frontend.
2. Run `npm run build` **from `radextract_web_repo/radextract_platform/frontend`**. Validate this exact checkout, not just the workspace source. It uses Vite with relative base `./` and React HashRouter.
3. Serve that release build locally and rerun focused browser checks, especially repository-subpath font/icon loading and landing→ClaimScape routing. The original UI/lifecycle tests already passed on the main source.
4. Inspect `git -C radextract_web_repo status --short`, the explicit manifest, and staged diff. Stage only the manifest paths; check new/untracked files, which do not appear in ordinary `git diff --stat`.
5. Commit with a descriptive message, e.g. `feat: integrate approved Stellar Labs landing and ClaimScape theme`.
6. **Normal** `git -C radextract_web_repo push origin main` using configured Git Credential Manager. The user already authorized commit/push/deployment; no new confirmation is needed for this scoped release.
7. Monitor the existing GitHub Pages workflow for the exact source commit, then verify both live URLs and representative font/preset/motion behavior. Do not claim live until observed.
8. Report the source commit/link, successful deployment and live URL, with any real remaining limitation.

Safe staging from workspace PowerShell:

```powershell
$releasePaths = Get-Content -LiteralPath '.tmp-release-manifest.json' -Raw | ConvertFrom-Json
git -C radextract_web_repo add -- $releasePaths
git -C radextract_web_repo diff --cached --stat
git -C radextract_web_repo diff --cached --name-only
# Inspect staged files, then commit and normally push.
```

Bundled browser-test packages:

```powershell
$env:NODE_PATH='C:\Users\HP\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node '.tmp-verify-release.mjs'
```

## Critical safety/scope notes

- **Do not run `sync_web_repo.py`.** It copies too broadly, stages everything, rewrites workflow and force-pushes with TLS verification disabled. A safe explicit sync already ran using `.tmp-sync-approved-release.py`; no repeat is needed unless integration source changes.
- Do not commit/push the Lenis checkout or fork `darkroomengineering/lenis`. Use npm Lenis only.
- Do not `git add -A` in the main workspace. It has numerous unrelated dirty backend, API, extraction, PDF and other UI files plus graph outputs and temporary artifacts. Preserve/exclude these.
- Do not copy workspace `src/lib/api.ts` or unrelated dirty pages over the web checkout. That would overwrite newer published connection work.
- Main frontend original `src/index.css` and publication base hash match `55d5947975d2e4f1b6f6d937b534a5c4b5a88da5`; it is deliberately not in the release manifest.
- Do not edit approved standalone references to finish this deployment.
- The web repo uses sparse checkout: `.github/workflows` may be tracked but absent on disk. Read via `git show origin/main:.github/workflows/deploy-pages.yml`.
- Existing workflow builds **nested `radextract_platform/frontend`**, then publishes to `gh-pages`; it also attempts artifact deployment. It is redundant but currently works. **Do not rewrite the workflow in this release.** Root `src` is a mirror, not CI build input.
- No destructive operation, force-push, backend/config migration or workflow change is needed.
- `gh` is unavailable. Public GitHub REST endpoints can monitor runs, e.g. `https://api.github.com/repos/vidhidhaduk05/ExtractExperimenting-web/actions/runs?branch=main&per_page=5`.

## Repository instructions and delegated review

Follow `AGENTS.md`: graphify query before code investigation; graphify update after edits. No original repository architectural refactor is needed.

A repository-required Jules read-only deployment audit was created:

- Session: `7755785477396523019`
- URL: `https://jules.google.com/session/7755785477396523019`
- Source: `sources/github/vidhidhaduk05/ExtractExperimenting-web`
- State was IN_PROGRESS on last check; activities already contained review findings.
- It noted the redundant dual Pages strategy and base-path/icon considerations. Keep the proven workflow unchanged; font/icon output needs live verification.
- Key is configured in `.agents/.env`; load into memory only and never print it. No missing-key question is needed.

Agents completed ClaimScape integration, landing integration and deployment audit. No agent committed or pushed. Their detailed results are summarized above; no delegation has to be repeated.
