# Fatal Systematic-Review Logic — Audit Findings & Coding-Agent Work Plan

Repo: `ExtractExperimenting-web` (RadExtract platform) · Audited via graphify graph + full code read · 2026-10-27
Scope: `radextract_platform/backend/services/` + `routers/` + `frontend/src/pages/PrismaFlowPage.tsx`

**Verdict: 12 FATAL + 15 HIGH issues found.** Items F1–F7, F9–F11, F13–F14 are FATAL; F8, F12, F15 are HIGH (misleading but not silently wrong); H1–H12 are HIGH. The platform can silently fabricate pooled results, corrupt PRISMA counts, invert RoB 2 / ROBINS-I judgment logic, and let AI decisions override humans without a trace. The test suite only checks ranges/signs, so none of these are caught by CI.

---

## PHASE 0 — Stop the silent fabrication (highest priority, ~1 day)

### F1. [FATAL] Meta-analysis endpoint returns fabricated results as real
- **File:** `radextract_platform/backend/routers/meta.py` → `get_project_meta_analysis_synthesis` (~lines 108–160)
- **Bug:** `GET /api/meta-analysis/{project_id}` never computes anything. With no studies it returns hardcoded fake studies and `pooled_effect: 1.48, i2: 42.5`. **With real studies it fabricates per-study effect sizes from a sine wave** (`eff = 1.35 + 0.15*sin(idx+1)`) and returns constant pooled results (`1.42 [1.18–1.71], i2 38.2`) attached to real study titles. `measure`/`model` params are cosmetic.
- **Fix:** Delete the fabrication. Compute via `ma.run_meta_analysis` / `analysis_service` from actual extracted data, or return 404 / "insufficient data".
- **Acceptance:** Endpoint output changes deterministically with input data; golden-file test comparing two different datasets produces different pooled estimates.

### F2. [FATAL] RoB 2 domain algorithm inverts signaling-question polarity
- **File:** `services/rob_tools.py:712-739` (`compute_rob2_domain_judgment`); wrong behavior codified in `tests/test_rob_tools.py:162-172`
- **Bug:** Generic answer counter (`no_count == 0 and yes_count > 0 → "low"`) instead of the official per-domain RoB 2 decision trees. Answering **"yes" to harm questions yields "low" risk**: D1 `sq_1_3` (baseline imbalance → randomization problem), D3 `sq_3_4` (missingness depends on true value), D4 `sq_4_4` (awareness influenced assessment) — all "yes" → official **High**, code returns **Low**. Conversely D1 `sq_1_1="no"` alone → official Some concerns, code returns **high**.
- **Fix:** Replace with explicit per-domain answer→judgment tables per Sterne 2019 (tag each SQ with polarity + criticality).
- **Acceptance:** Table-driven test with the exact worked examples from the RoB 2 algorithm document for all 5 domains.

### F3. [FATAL] ROBINS-I domain algorithm: same sign errors, "critical" unreachable
- **File:** `services/rob_tools.py:676-704` (`compute_robins_i_domain_judgment`)
- **Bug:** `sq_1_1` (potential for confounding) "yes" → official Moderate/Serious, code → **low**. `sq_2_1` (selection on post-intervention characteristics) "yes" → official Serious, code → **low**. "Critical" judgment is unreachable in the entire function.
- **Fix:** Per-domain ROBINS-I decision tables (Sterne 2016) including critical branches.
- **Acceptance:** Worked-example tests per domain from the ROBINS-I paper.

### F4. [FATAL] Unanswered signaling questions silently default toward "low"
- **Files:** `services/rob_tools.py:658`; `rob_service.py:_recompute_domain_judgment`
- **Bug:** Blank answers are filtered out before the domain algorithm runs. RoB 2 D1 with only `sq_1_1="yes"` answered → **"low"**. Partial assessments default to low risk — the classic silent-default failure.
- **Fix:** Treat blanks on active questions as "no_information"/"unclear", or block overall computation until all active SQs are answered.
- **Acceptance:** Partial-completion test asserts NOT "low".

---

## PHASE 1 — PRISMA flow integrity (~1–2 days)

### F5. [FATAL] Batch full-text screening targets wrong records and never sets stage → FT exclusions counted as TA exclusions
- **File:** `routers/screening.py:1452, 1604` (`batch_ai_screen`)
- **Bug:** Study selection ignores the `stage` param (`WHERE screening_status = 'pending'` even for `stage=ft`), and the status UPDATE never touches `screening_stage`. FT-excluded records keep `screening_stage='ta'` and are counted as TA exclusions by `screening_summary` (line 136) and `prisma_service.get_prisma_2020_data` (lines 47–52). FT includes are counted as `ta_included` and never appear in `full_text_assessed`.
- **Fix:** Select `screening_status='ta_included'` when `stage=ft`; include `screening_stage=?` in the UPDATE.
- **Acceptance:** Integration test running both stages; PRISMA boxes reconcile.

### F6. [FATAL] Include at title/abstract skips full-text assessment entirely
- **File:** `routers/screening.py:676-677, 113-114, 561-562`
- **Bug:** Any `included` decision at stage `ta` immediately calls `transition_study_to_extraction` with no stage check. TA-included studies are counted in `included.studies_in_review` without ever passing FT eligibility.
- **Fix:** Only transition to extraction when `stage == "ft"`; TA includes become `ta_included` awaiting FT review.
- **Acceptance:** TA-include test asserts study does NOT reach extraction; FT-include test asserts it does.

### F7. [FATAL] Dedup auto-marking flips existing human decisions and corrupts PRISMA counts
- **File:** `services/dedup_service.py:376-388` (auto-mark), `:307` (canonical = `indices[0]`, earliest import)
- **Bug:** `deduplicate_studies` runs over all studies regardless of status. A human-included record can be silently flipped to `excluded/Duplicate publication`; canonical = earliest import, so the *unscreened* copy is kept. PRISMA then misroutes the record.
- **Fix:** Never auto-mark records with a human decision (require explicit resolution); canonical = record with a decision / most metadata.
- **Acceptance:** Test: dedup run after human inclusion leaves the decision intact.

### F8. [HIGH] Frontend PRISMA "studies in meta-analysis" hard-coded equal to all included studies
- **File:** `frontend/src/pages/PrismaFlowPage.tsx` → `computeLivePrismaData` (`const total_studies_ma = new_studies`)
- **Bug:** The "Reports in meta-analysis" box always equals the included count, ignoring the backend's distinct-extraction count the same component already fetches as fallback.
- **Fix:** Use the backend `studies_in_meta_analysis` value.
- **Acceptance:** Render test with included > in-MA shows different numbers in the two boxes.

---

## PHASE 2 — Pooling correctness (~2 days)

### F9. [FATAL] Effect/variance arrays filtered independently → silent mispairing
- **File:** `services/analysis_service.py` ~lines 394–396, 470–472, 560–562 (`compute_heterogeneity`, `prepare_forest_plot_data`, `compute_sensitivity_analysis`)
- **Bug:** `effects` and `variances` are built with *different* predicates. When counts differ, numpy raises (500); when counts coincidentally match, effects pair with the **wrong studies' variances** — every downstream statistic silently wrong.
- **Fix:** Filter once with a joint predicate; assert equal lengths.
- **Acceptance:** Unit test with a study missing only variance asserts no mispairing.

### F10. [FATAL] Leave-one-out deletes the wrong study
- **File:** `services/analysis_service.py` `compute_sensitivity_analysis` ~lines 575–590
- **Bug:** Loop index `i` runs over the full `studies` list but `np.delete(effects, i)` indexes the filtered array — wrong study removed, result mislabeled.
- **Fix:** Build the filtered complete-studies list first; iterate over its indices.
- **Acceptance:** Test with one incomplete study: each leave-one-out result matches a manual recompute.

### F11. [FATAL] Log-scale pooled effect persisted with natural-scale CIs
- **File:** `routers/meta.py` `_run_analysis` generic branch ~lines 300–310
- **Bug:** `pooled_effect_log` (log scale, e.g. 0.30) is stored alongside back-transformed CIs (e.g. 1.20–2.50) in the `meta_analyses` table the UI reads — a meaningless point estimate inconsistent with its own CI.
- **Fix:** Persist the back-transformed `pooled["pooled_effect"]` alongside the back-transformed CIs.
- **Acceptance:** Round-trip test: stored point estimate lies inside stored CI.

### F12. [HIGH] No dedup/overlap check before pooling
- **Files:** `routers/meta.py` (`create_meta_analysis`/`update_studies`/`run`); `services/meta_analysis.py` `run_meta_analysis`
- **Bug:** Same `study_id` can be inserted multiple times; multiple outcomes/arm-pairs per study pooled as independent — inflated precision, deflated p-values.
- **Fix:** Unique `(meta_id, study_id)` constraint + warning when one study contributes multiple rows.
- **Acceptance:** Duplicate insert test raises or warns; pooling test with duplicated study shows inflated SE flagged.

---

## PHASE 3 — GRADE consumes the fixed RoB layer (~1–2 days)

### F13. [FATAL] GRADE risk-of-bias factor from project-wide RoB tally, not outcome-level studies
- **File:** `services/grade_service.py:296-320` (`auto_populate_factors`)
- **Bug:** Downgrades based on % high-risk across the whole project (≥50% → very serious, >0% → serious), mixing tools (RoB 2 / ROBINS-I / NOS) and unrelated studies. One high-risk study in a 20-study project downgrades an unrelated outcome.
- **Fix:** Restrict RoB input to studies in the linked meta-analysis/outcome; map tool-specific judgments onto the GRADE scale explicitly.

### F14. [FATAL] Two RoB pipelines store incompatible vocabularies; GRADE silently ignores AI-engine judgments
- **Files:** `routers/rob.py` `auto_assess_study_rob` (stores `"Low"/"High"/"Some concerns"` from `rct_rob_engine.py:297-303`) vs main pipeline (lowercase `"low"/"some_concerns"/"high"`); `grade_service.auto_populate_factors` reads `judgment_counts.get("high", 0)`
- **Bug:** Assessments via `/auto-assess` contribute **0** to `high_count` — high-risk studies produce no GRADE downgrade.
- **Fix:** Normalize judgment vocabulary at write time; validate `final_judgment` against the tool's `judgment_options` (adjudication endpoint currently accepts arbitrary strings).

### F15. [HIGH] GRADE imprecision from ad-hoc CI-width thresholds; no OIS
- **File:** `services/grade_service.py` ~355–375
- **Bug:** `rel_width > 2.0` or CI crossing null → "very serious". GRADE imprecision requires optimal information size + decision thresholds; relative width is wrong for ratio measures (log scale).
- **Fix:** OIS-based imprecision, or leave unrated for human judgment.

---

## PHASE 4 — Trust & audit trail (~2 days)

### H1. [HIGH] AI decisions finalize inclusion/exclusion with no human confirmation (automation bias)
- `services/ai_screening_pipeline.py:140-146, 307-313, 491-495` — single LLM call at 0.60–0.80 confidence permanently decides; `screening_config` (blind_mode, n_reviewers) never consulted. **Fix:** "require human confirmation" config flag; AI sets proposed status.

### H2. [HIGH] Last-writer-wins in dual review
- `routers/screening.py:656-663` — second reviewer's decision overwrites study status even when a conflict was just recorded. **Fix:** derive status from consensus/resolution only.

### H3. [HIGH] AI-vs-human agreement recorded as conflict (vocabulary mismatch `ta_included` vs `included`)
- `services/ai_screening_pipeline.py:188, 355` vs `routers/screening.py` — agreeing decisions create unresolved conflicts; consensus auto-resolve can never fire. **Fix:** normalize AI TA decisions to human vocabulary in `screening_decisions`.

### H4. [HIGH] `update_screening` mutates stage before the stage guard runs
- `routers/screening.py:86-88` — stage relocated before `create_screening_decision`'s guard; misrouted PRISMA counts in one call. **Fix:** validate requested stage against current stage first.

### H5. [HIGH] Adjudicated RoB judgment silently overwritten by later edits
- `routers/rob.py` `adjudicate_assessment` + `rob_service.py:_recompute_overall_judgment` — no finalized/lock state anywhere. **Fix:** locked flag; recompute skips adjudicated assessments.

### H6. [HIGH] Unverified AI RoB answers become recorded answers and drive GRADE
- `rob_service.py:apply_ai_prefill` ~368 — AI answer written into human `answer` field; summary counts ignore `human_verified`. **Fix:** keep AI answers in `ai_answer` until accepted; exclude unverified from GRADE inputs.

### H7. [HIGH] `rct_rob_engine` fabricates verbatim "support quotes"
- `services/rct_rob_engine.py:159-295` — canned quotes returned regardless of study text, fixed confidence 0.85. **Fix:** extract from document or leave empty; never synthesize evidence text.

### H8. [HIGH] Egger's test wrong in analysis_service copy
- `services/analysis_service.py` `prepare_funnel_plot_data` ~530–545 — regresses effect on precision instead of standard normal deviate on precision; funnel center uses unweighted mean. The correct implementation exists in `meta_analysis.py eggers_test` — call it.

### H9. [HIGH] Over-aggressive dedup merging
- `services/dedup_service.py:292` — titles ≥0.95 merge with no author/year check; 0.90–0.95 merge on year alone; union-find transitivity chains dissimilar records. **Fix:** require secondary signal (author overlap or DOI/PMID) for all title merges.

### H10. [HIGH] Zero-cell clamp 1e-10 in diagnostic meta-analysis
- `services/meta_analysis.py` `_logit` ~68 + `fit_bivariate_model` ~110–115 — 0/50 sensitivity gets variance ≈2×10⁸ instead of ≈2.0; study silently vanishes from pooling. **Fix:** standard 0.5 continuity correction before logit; flag corrected studies.

### H11. [HIGH] Active-learning feedback endpoint: unvalidated status flip, no decision record, no project check
- `services/ai_screening_service.py` `submit_active_learning_feedback`. **Fix:** validate value, verify study∈project, route through `create_screening_decision`.

### H12. [HIGH] SROC curve doesn't pass through the pooled estimate; pooled sens/spec CIs from ad-hoc SE
- `services/meta_analysis.py` `fit_bivariate_model` ~168–196. **Fix:** Moses–Littenberg / proper Reitsma parameterization; SEs from inverse Hessian (or delegate to R `mada`).

---

## Verified correct — do NOT "fix" these
- DerSimonian-Laird tau², Q, I², H; inverse-variance weights; ±1.96·SE CIs; MD/SMD (Hedges J)/OR/RR/HR formulas; Egger's test in `meta_analysis.py`; Wilson CIs in `descriptive_synthesis.py`
- No default-to-include on LLM parse failure (returns `uncertain`); safety-net overrides with audit notes; crash-resilient per-study commits; server-side blinding; reversible `keep_both` dedup; stage guard on the decision endpoint; pipeline idempotency
- RoB 2 **overall** aggregation (≥2 some concerns → high) matches Cochrane; QUADAS-2 domain rule correct; GRADE certainty arithmetic + RCT-high/observational-low starting levels correct; GRADE is per-outcome; `prisma2020_sync.py` box arithmetic is PRISMA-2020-conformant and tested

## Suggested execution order for the coding agent
1. **Phase 0 first** (F1–F4): fabrication + RoB polarity — these corrupt published outputs today.
2. **Phase 1** (F5–F8): PRISMA integrity — needed before any real review run.
3. **Phase 2** (F9–F12): pooling correctness.
4. **Phase 3** (F13–F15): GRADE, only after RoB vocabulary is normalized.
5. **Phase 4** (H1–H12): trust/audit hardening.
6. **Regression rule:** every fix ships with a failing-test-first unit test; extend `test_meta_analysis.py` beyond range checks (exact-value golden tests); add router tests for `get_project_meta_analysis_synthesis` (currently uncovered).
7. **Not yet audited (follow-up):** extraction services (`coded_extraction_service.py`, `pico_extractor.py`, `llm_extractor.py` data-path), `citation_verification_service.py`, `rigor_scan_service.py`.
