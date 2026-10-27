# Zoplicate-Style Deduplication — Implementation Plan for RadExtract

Source studied: Zoplicate 5.1.1 (Zotero plugin, `stanford-oval`-style architecture) · Target: `services/dedup_service.py` + your new Excel-like accept/reject sheet · 2026-10-27
Implements the tiered cascade from `dedup_plan.md` using Zoplicate's proven patterns. Yes — this integrates cleanly, and yes, "Merge All" is directly portable.

---

## 1. What Zoplicate does (verified from source) and what we take from it

| Zoplicate component | File | What it does | Take to RadExtract? |
|---|---|---|---|
| `DuplicateFinder` | `src/db/duplicateFinder.ts` | **Cascading candidate generation per record**: dc:replaces relations → cleaned DOI (searched across DOI/url/extra fields) → ISBN → exact normalized title (`TRIM(UPPER(...)) LIKE`) → primary creators → year. Each stage narrows the candidate set. | **Yes** — becomes the T0–T2 cascade |
| `mergeItems` | `src/shared/duplicates/mergeItems.ts` | **Master-item merge**: one record is master; master wins field conflicts; non-conflicting fields from others are filled in (`{...keep, ...masterJSON}`) | **Yes** — exactly the "additive merge" from dedup_plan §3 |
| `BulkMergeController` | `src/features/bulkMerge/bulkMergeService.ts` | **Merge All**: bulk-merges every duplicate set with a master-item preference, confirmation prompt, progress window, pause/resume | **Yes** — the "Merge All" button |
| `nonDuplicates` | `src/db/nonDuplicates.ts` | **Persistent "not duplicates" memory**: pairs the user rejected are stored (composite key pair) and never flagged again; import/export | **Yes** — critical for your accept/reject sheet |
| `duplicateStats` | `src/features/duplicateStats/` | Duplicate counts/stats reporting | Yes — feeds PRISMA `duplicates_removed` by tier |

## 2. Backend changes

### 2.1 New service: `services/duplicate_finder.py` (port of DuplicateFinder)

```python
def find_candidates(study: Study, conn) -> list[CandidateGroup]:
    """Cascading candidate generation — Zoplicate pattern, SQL-backed."""
    candidates = set()
    # Stage 1 (T0): normalized DOI / PMID / PMCID / NCT exact match
    #   Zoplicate searches DOI across doi/url/extra fields; we search
    #   studies.doi + studies.pmid + study_identifiers table
    # Stage 2 (T1): exact normalized title + first-author surname + year ±1
    # Stage 3 (T2): fuzzy title (Jaro-Winkler >= 0.90) + >=1 corroboration
    #   (author overlap >= 0.5 | same year | same journal)
    # Each stage narrows; never merge on title alone (fixes H9)
    # NEVER return pairs where either record has a human decision
    #   -> those route to review queue regardless of score (fixes F7)
    # NEVER return pairs with conflicting identifiers -> review queue
```

- Port `cleanDOI`/`normalizeString`/`cleanCreator` from `src/shared/utils.ts` (they handle `https://doi.org/` prefixes, punctuation, diacritics).
- Blocking for scale: candidate SQL queries are indexed lookups (Zoplicate's approach) — no O(n²) scan.
- Cap groups at 5 records; larger groups → review queue (transitivity chains).

### 2.2 Rework `dedup_service.py`

- Replace the single union-find rule (`dedup_service.py:292`) with the cascade.
- **Master-item selection** (Zoplicate `mergeItems` semantics + dedup_plan §3.2): master = record with DOI+PMID > either > most metadata > has human decision. Master wins conflicts; missing fields filled from duplicates; duplicate rows retained as `is_duplicate=1` (soft state, reversible).
- **Non-duplicates memory** (port of `nonDuplicates.ts`): new table
  ```sql
  CREATE TABLE non_duplicates (
    project_id TEXT NOT NULL,
    study_id_a TEXT NOT NULL,
    study_id_b TEXT NOT NULL,
    created_at TEXT, decided_by TEXT,
    PRIMARY KEY (project_id, study_id_a, study_id_b)  -- store sorted pair
  );
  ```
  The finder excludes any pair present here. This is what makes your accept/reject sheet *sticky* — a rejection is remembered forever, including across re-imports.
- **Never auto-mark human-decided records** (fixes F7): auto-merge only applies to records with no human decision; everything else lands in the review sheet.

### 2.3 "Merge All" endpoint (port of BulkMergeController)

```
POST /api/projects/{project_id}/dedup/merge-all
  body: { master_strategy: "most_complete" | "newest" | "oldest" | "has_decision",
          include_auto: true, dry_run: false }
```

- **Dry-run first** (Zoplicate's confirmation prompt, adapted): returns the full merge plan — N groups, master per group, fields to fill — for a confirm dialog.
- Executes merges sequentially with **progress + pause/resume** (Zoplicate's `activeRun`/`requestSuspend` pattern): `GET .../merge-all/status`, `POST .../merge-all/pause`.
- Per-group commit (crash-resilient, same pattern as your screening pipeline); audit row per merge (tier, score, master, duplicates, actor).
- Records with human decisions are skipped and reported in the response as `skipped_human_decided: n` — Merge All never touches them.

### 2.4 Endpoints for the Excel-like sheet

```
GET  /api/projects/{id}/dedup/candidates?status=pending|accepted|rejected
     -> rows: {group_id, master, duplicates[], tier, score, field_diffs}
POST /api/projects/{id}/dedup/{group_id}/accept     -> merge (master semantics)
POST /api/projects/{id}/dedup/{group_id}/reject     -> write non_duplicates rows
POST /api/projects/{id}/dedup/{group_id}/keep-both  -> existing logic, preserved
POST /api/projects/{id}/dedup/{group_id}/set-master -> choose a different master
```

`field_diffs` (title/authors/year/journal/DOI/abstract side-by-side) is what makes accept/reject decidable in one glance — Zoplicate shows the same in its duplicates pane.

## 3. Frontend: your Excel-like sheet becomes the review queue

Your accept/reject sheet maps 1:1 onto Zoplicate's duplicates pane + bulk merge:

1. **Sheet columns:** `☑ | master title | duplicate title | year | first author | DOI | tier | score | action`. One row per duplicate record (group expanded), grouped visually by `group_id`.
2. **Row actions:** Accept (merge into master) / Reject (not a duplicate → non-duplicates memory) / Keep both / Change master (dropdown of group members).
3. **Header actions:** **Merge All** (dry-run confirm dialog → progress bar → pause/resume), Reject All (with confirm), filter by tier, "show only groups with human-decided records".
4. **Sticky rejections:** rejected rows move to a "Rejected" tab (backed by `non_duplicates`) and never reappear in pending — on re-import or re-scan.
5. **Stats bar** (port of `duplicateStats`): "X groups · Y auto-merged by tier · Z awaiting review" — feeds PRISMA `duplicates_removed` by tier.
6. Wire through `src/lib/api.ts` (after the demo-fallback removal — no `DEMO_*` branches for these endpoints).

## 4. PRISMA + meta-analysis integration

- `duplicates_removed` in `prisma_service` counts merged duplicates **by tier** (T0/T1/T2 auto vs human-accepted); rejected pairs count as unique records.
- Study grouping (T4, same-study-different-report) stays separate per `dedup_plan.md` §4 — the sheet gets a fourth action "Same study, different report" later; not in this iteration.
- Pooling guard: warn when one master record's group contributes multiple effect sizes (ties to F12).

## 5. Implementation order + acceptance tests

| Step | Deliverable | Acceptance test |
|---|---|---|
| 1 | Normalization utils (port `cleanDOI`/`normalizeString`) | `https://doi.org/10.X/Y` ≡ `10.x/y`; diacritics/punctuation folded |
| 2 | `duplicate_finder.py` cascade T0–T2 + non_duplicates exclusion | Near-title distinct papers (protocol vs results) NOT candidates; `PMID:123` ≡ `123`; conflicting DOIs → review |
| 3 | Rework `dedup_service.py`: master-item additive merge, no auto-mark on human-decided | Human-included record survives dedup untouched (F7); merge fills missing fields, master wins conflicts |
| 4 | Candidate/accept/reject/keep-both/set-master endpoints | Rejected pair never reappears; accept is reversible via audit row |
| 5 | `merge-all` with dry-run + progress + pause/resume | Dry-run plan matches executed merges exactly; `kill` mid-run leaves completed groups merged, rest pending |
| 6 | Excel-like sheet UI + stats bar | Sheet shows field diffs; Merge All respects skipped human-decided records |
| 7 | PRISMA by-tier counts + gold-set CI gate | Gold-set auto-merge precision ≥ 0.99; PRISMA box reconciles |

**Sequencing note:** this plan supersedes steps 2–3 of `dedup_plan.md` §7 (the cascade + canonical selection) and absorbs its safety rules; the gold-set evaluation (§6 there) still applies unchanged.
