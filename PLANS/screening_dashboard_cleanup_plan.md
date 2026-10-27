# WORK ORDER — Screening View De-Demo, Professional Wording, Dashboard Redesign, Navigation Fix

**Repo:** `ExtractExperimenting-web`. Apply to the ONE surviving frontend tree. Theme rules: MASTER_THEME colors, hairline separators, no filled cards (see app-shell work order). Do phases in order; each has a CHECK.

---

## PHASE 1 — Remove the demo theater from the screening view

Files: `src/pages/ScreeningPage.tsx`, `src/components/screening/ExploratoryScreeningView.tsx` (both mirrored in `radextract_platform/frontend/` if that tree still exists).

**1.1 — Delete the wording.** Remove the header block "steal the whole literature", the subtitle "CO-SCIENTIST SYSTEMATIC SCREENING • VELVET EDITORIAL • HIGH-THROUGHPUT MODE", the "TURN 15 — STREAMING LIVE" badge, and the view-switcher button labeled "Velvet Stream + Senior Mode" (`ScreeningPage.tsx` ~lines 935–942). The page title becomes "Eligibility Screening" — nothing else.

**1.2 — Delete the fake data.** `ExploratoryScreeningView.tsx` contains `BASE_BIOMEDICAL_DATA` — a hardcoded array of fake papers (intracranial aneurysm, acute ischemic stroke…). Delete it entirely. The view must render ONLY `projectStudies` from the API; when the project has 0 studies, show an empty state with an "Import studies" button. Never fall back to sample data.

**1.3 — Delete the simulation engine.** Remove: the `setInterval`/cadence timers (350 ms / 900 ms / 1200 ms, lines ~237–239), `generateNextPaper()` (line ~253), the `Math.random()` confidence generator (line ~117), and the fabricated "85% KEEP / 64% UNSURE" badges. Confidence percentages must come ONLY from real screening judgments returned by the backend (`engine` field on the judgment). If a study has no AI judgment yet, show "—" — never a made-up number.

**1.4 — Decision:** delete `ExploratoryScreeningView.tsx` outright and keep the standard screening table as the only view. The "live process" the user wants is Phase 2's real progress header, not a second theatrical view. Remove `viewMode` state and the switcher from `ScreeningPage.tsx`.
**CHECK:** `grep -rn -i "velvet\|steal the whole\|senior mode\|BASE_BIOMEDICAL" src/` → nothing. Screening page with 0 studies → empty state, no fake cards ever.

## PHASE 2 — Show the REAL live process on the screening page

Rebuild the top of `ScreeningPage.tsx` as a real progress header driven by API state:
1. **Progress bar:** `screened / total` from `GET /api/projects/{id}/screening` — real counts, refetched after every decision and during batch runs (poll every 2 s while a batch job is active, stop when done).
2. **Stat tiles (real only):** Included / Uncertain / Excluded counts from the same endpoint — same numbers as PRISMA. Remove the "JUD/SEC 21" tile (throughput theater) and the "TURN" counter.
3. **Batch status:** when a batch AI screen is running, show "AI screening in progress — 28 of 40 done" from the real job state; when idle, show nothing.
4. Per-study cards keep: real AI confidence (if a judgment exists), real criterion-level exclusion reasons, and the Include/Uncertain/Exclude buttons writing to the backend immediately.
**CHECK:** import 5 real studies → header shows 0/5; decide 2 → 2/5 without refresh; every visible number matches the DB.

## PHASE 3 — Import history: real entries only

**3.1** Locate the import-history UI (on StudyImport / StudyList). Every entry must come from the backend's import records (source, query/DOI list, counts, timestamp) — delete any hardcoded demo import rows.
**3.2** De-duplicate the display: one row per import event with expandable detail (query used, PMIDs imported, duplicates removed) — not one row per study repeating the same source text. If the backend doesn't persist import events yet, add an `import_events` table (project_id, source_type, query, n_records, n_duplicates, created_at) written by the import endpoints, and render from it.
**CHECK:** import twice via RIS + once via PubMed query → history shows exactly 3 events with correct counts; refresh-stable.

## PHASE 4 — Dashboard: keep the card grid, but every card must EARN its place

File: `src/pages/ProjectDetail.tsx`. The layout already has a left rail and a right To-dos panel listing the stages — so NO headline stepper (it would duplicate the panel). Keep the card grid, but change what a card IS. Every card must answer three things: **what the number is, why it matters right now (a reason line), and what clicking does.** A card that can't answer all three is deleted, not redecorated.

**4.1 — Card anatomy (all cards):**
```
[real number]        ← DB-derived, live, large (Serifon Editorial)
Stage name           ← small caps, Work Sans
reason line          ← one sentence: what this number implies RIGHT NOW
                     ← thin wine progress bar where a fraction exists
```
Whole card is clickable → navigates to that stage. Hover: hairline border darkens to wine. No icons-for-decoration.

**4.2 — The cards (and their reason lines):**
- **Screening:** "12 / 40 decided" — reason: "16 studies waiting on a decision" (or "AI batch running — 28/40 read" while a job is live) → `/screening`.
- **Full-Text:** "0 / 12 included" — reason: "Blocked: finish Title/Abstract first" when upstream is incomplete → `/screening?stage=ft`.
- **Extraction:** "3 / 12 verified" — reason: "2 studies have unverified AI values" → `/extraction-sheet`.
- **Risk of Bias:** "0 / 12 assessed" — reason: "Required before GRADE can run" → `/rob`.
- **GRADE:** "0 outcomes evaluated" — reason: "Needs RoB + extraction data" → `/grade`.
- **Meta-analysis:** "0 effect sizes pooled" — reason: "Needs ≥2 studies with extracted effect data" → `/meta-analysis`.
- **PRISMA card:** mini flow numbers (identified → screened → included) live from `compute_prisma_counts` → `/prisma`. This is the ONLY card that may repeat To-dos numbers, deliberately.
- **Import card:** total studies + last import ("6 studies · last import 2 days ago") → `/studies`.

**4.3 — Deletion rule:** "Matrix" and "View" label tiles are deleted. The "Data Review —" tile is deleted unless a real data-verification metric exists in the backend; if the agent wants to keep the concept, it must first add the backend metric (verified-values % from extraction) — never ship a card with a placeholder dash.
**4.4 — Reason lines are computed, not copy:** each reason line comes from the same API response (e.g. waiting counts, blocking relationships). If the reason is "everything done", the card shows a wine check and "Complete".
**CHECK:** every card shows a number that matches the DB + a reason line that changes when the data changes; clicking each card lands on the right stage; no card displays only a noun or a dash.

## PHASE 5 — Navigation: Evidence Map, Rigor Scan, ClaimScape reachable

The routes exist (`App.tsx:32-39`: `/claimscape`, `/rigor-scan`, plus redirects) and nav entries are defined (`AppLayout.tsx:12,14`) — but they are evidently not reachable in the rendered UI (likely only inside the mobile hamburger menu, lines ~405–435, or missing from the desktop rail).

**5.1** Add to the LEFT ICON RAIL (always visible, desktop + mobile): Evidence Map (`/claimscape`), Rigor Scan (`/rigor-scan`), Citation Telephone (`/citation-telephone`) — below the project-stage icons, separated by a hairline, with tooltips.
**5.2** Also add the same three as text links in the project top bar's overflow menu, so they're reachable from inside a project.
**5.3** Verify each route renders (not blank): log in, click each — Evidence Map loads the claim input, Rigor Scan loads its page, ClaimScape loads the map. If a page 404s or blanks, fix the import/lazy-load error before finishing.
**CHECK:** from ANY page in the app, all three are ≤2 clicks away; each renders its real content.

## FINAL VERIFICATION
1. `grep -rn -i "velvet\|steal the whole\|senior mode\|BASE_BIOMEDICAL\|demo" src/ --include="*.tsx" --include="*.ts" | grep -v test` → nothing.
2. Screening: 0 studies → empty state; 5 studies → real progress header, real judgments only, decisions persist.
3. Import history: 3 real events, expandable, refresh-stable.
4. Dashboard: stepper with live per-stage counts + next-step CTA; no label-only tiles.
5. Click-through: Evidence Map, Rigor Scan, ClaimScape all render from the rail.
6. Full pytest suite green.

**CONSTRAINTS:** do not touch the landing page or `docs/MASTER_THEME.md`; keep the 4-second clarification toast behavior; all numbers from the backend, never hardcoded; hairline theme rules throughout.
