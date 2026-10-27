# WORK ORDER — Correctness Fixes from Independent Review (supersedes overlapping phases of make_it_all_work_plan)

**Verified against the code by Biomni on 27 Oct 2026 — all reviewer findings confirmed.** Fix in THIS order. Re-locate every edit by the quoted string, not line number. No `except: pass`. Every fix ships with its failing test written first.

## PHASE 1 — Fabricated synthesis (Critical — do first, it is the product's core output)

Three fabrication sites, all must die:

1.1 **`routers/meta.py`** — the `sample_studies` list ("Miller et al. 2021"…) returned for empty projects (~line 134) AND the `math.sin()` effect generator (~line 158). Delete both. The run endpoint: if the meta-analysis has < 2 studies with usable extracted effect data, return `{"status": "cannot_pool", "reason": "...", "studies": [...missing-data listing...]}` — HTTP 200 with an explicit state, never numbers.
1.2 **`MetaAnalysisPage.tsx`** — the queryFn catch/!res.ok branch returning hardcoded `{pooled_effect: 1.48, ... Miller/Chen/Sato}` (~line 58). Delete. On API failure: show the error state. On `cannot_pool`: render the descriptive-synthesis view (narrative table of extracted data + why pooling was not possible), never a forest plot with invented numbers.
1.3 **Grep sweep:** `grep -rn "Miller\|1.48\|math.sin" radextract_platform/backend radextract_platform/frontend/src` — zero hits after the fix (in app code; test fixtures exempt).

**Tests first:** hand-computed 3-study pool reproduces to 4 decimals; empty project → `cannot_pool`; API 500 → UI shows error, never numbers.

## PHASE 2 — Access control (Critical for shared deployment)

2.1 **`dependencies.py`** — the project-access helper must not pass anonymous requests. Add `require_project_access(project_id, min_role)` that raises 401 when no user, 403 when no role. Keep an explicitly-named `optional_project_access` ONLY where anonymous reading is a deliberate product decision (none today).
2.2 **`routers/grade.py`** — `get_grade` (~line 82) and `delete_grade` (~line 91) have NO auth dependency at all. Add `require_project_access` to every grade route (read: member, write/delete: owner/editor). Same sweep for every router using `get_current_user_optional` without an access check: `grep -ln "get_current_user_optional" routers/*.py` — each route must either enforce access or carry a written justification comment.
2.3 **Tests:** anonymous GET/DELETE on grade → 401; authenticated non-member → 403; member → 200.

## PHASE 3 — PRISMA derives every bucket from recorded events (High)

**`services/prisma2020_sync.py`** (~line 193): `records_screened = total − duplicates − automation` counts unscreened records as screened; `dbr_assessed = ft_excluded + included` folds pending into assessed; the meta count counts studies-with-extractions, not pooled participation.

Rewrite each bucket from its event table:
- `screened` = COUNT(studies with ≥1 recorded TA decision event)
- `pending_screening` = total − duplicates − screened (shown separately, never folded into another bucket)
- `retrieved` = COUNT(studies with TA decision = included)
- `assessed_ft` = COUNT(studies with ≥1 recorded FT decision event)
- `included` = COUNT(studies with FT decision = included)
- `analysed` = COUNT(DISTINCT study_id) in the actual pooled analysis participation table (not "has extraction")
- The PRISMA 2020 diagram gains explicit "pending" annotations so unfinished work is visible, not misclassified.

**Test (the reviewer's reproduction):** one imported, unscreened record → identified=1, screened=0, pending=1 — nothing else.

## PHASE 4 — Outcome-specific GRADE (High)

**`services/grade_service.py`** (~line 299): the RoB factor falls back to the project-wide summary and counts assessment rows. Fix:
1. GRADE requires an explicit outcome → study cohort (from the meta-analysis/synthesis participation when pooling, or a user-confirmed cohort on the descriptive path). No silent fallback to "all project assessments".
2. RoB factor computed from DISTINCT studies in THAT cohort, each with a RESOLVED assessment (verified or adjudicated); unresolved assessments count as "unresolved" and are reported, not silently averaged.
3. Inconsistency + imprecision domains read the synthesis results (Phase 1's real pooling) — which is why GRADE is finalized after synthesis.

## PHASE 5 — Workflow re-ordering (the blueprint correction)

Spine is now: `Extraction → RoB → Synthesis (conditional: pool | descriptive) → GRADE (finalized after synthesis) → Export`. Concretely:
1. GRADE page shows two states: DRAFT (RoB + consistency inputs available) and FINAL (enabled only after synthesis ran for that outcome). Finalize is an explicit button.
2. The descriptive-synthesis path is a first-class outcome: when pooling is impossible, the review proceeds to GRADE using the descriptive evidence profile, and the export labels the review "descriptive synthesis" — a review that can't pool is still a completed review.
3. Update the dashboard card + To-dos ordering to match the new spine.

**CHECK for the whole order:** the reviewer's four findings each get a regression test; the focused test suite completes within its time budget; the end-to-end run (import → screen → extract → RoB → synthesis → GRADE → export) passes in the browser with screenshots.

**Constraint:** cosmetic work waits. Nothing merges without its failing-test-first artifact.
