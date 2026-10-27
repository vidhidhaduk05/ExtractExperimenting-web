# Sensible Deduplication Plan — RadExtract

For: `services/dedup_service.py` + PRISMA counting · 2026-10-27 · Fixes F7 + H9 from the SR logic plan; adds the study-grouping layer the platform is missing.
Evidence base: even the best dedup methods (Ovid, Covidence, Rayyan) are not perfect and need a human pass [1]; automated tools match or beat manual EndNote workflows when paired with review [2]; free tools vary widely in sensitivity [3].

---

## 0. The core insight: you have TWO problems, not one

The current code conflates them; separating them fixes most of the logic:

| | **Record deduplication** | **Study grouping** |
|---|---|---|
| Question | "Is this the *same publication* imported twice?" | "Are these *different reports of the same study*?" |
| Examples | PubMed + Embase both indexed the same paper | Protocol paper + primary results + subgroup analysis + 5-year follow-up of one RCT |
| Correct action | Merge → count once in `duplicates_removed` | **Link, never merge or exclude** → group synthesizes together |
| PRISMA impact | "Duplicates removed" box | None directly — but pooling must not double-count (ties to F12) |

Auto-excluding a secondary report as a "duplicate" (current behavior) silently deletes real data — a subgroup analysis excluded as a duplicate is an analysis lost.

## 1. Normalization layer (do this first — everything depends on it)

- **Title:** lowercase, strip punctuation/diacritics, collapse whitespace, expand/standardize common abbreviations (vs., et al.).
- **DOI:** strip `https://doi.org/`, `doi:`, `info:doi/` prefixes; lowercase; validate format.
- **PMID/PMCID:** strip `PMID:`/`PMC` prefixes and whitespace (current `_normalize_pmid` only strips whitespace — `PMID:12345` vs `12345` false-splits).
- **Year:** integer; handle ranges and "in press".
- **Journal:** prefer ISSN when available; else normalized name.
- **Authors:** surname + initials, normalized.

## 2. Tiered matching cascade (replaces the single union-find rule)

Candidate generation first (never compare all pairs): index on normalized DOI, PMID, and blocking keys `(year bucket × first-author surname initial)` and `(first 6 title words)`.

| Tier | Rule | Action | Expected precision |
|---|---|---|---|
| **T0** | Identical normalized DOI, or identical PMID/PMCID/NCT | Auto-merge | ~1.00 |
| **T1** | Exact normalized title match **AND** first-author surname match **AND** year within ±1 | Auto-merge | ~0.99 |
| **T2** | Fuzzy title (Jaro-Winkler ≥ 0.90) **AND** ≥1 corroboration: author overlap ≥ 0.5, same year, same journal | Auto-merge | ~0.97 |
| **T3** | Fuzzy title alone, or conflicting signals (same title, different DOI) | **Human review queue** | — |
| **T4** | Same title + different year/journal, or one record is a known article type (protocol, abstract, subgroup) | **Propose as same-study group**, human confirms | — |

**Hard rules (fix H9):**
- **Never merge on title similarity alone.** Every auto-merge requires an identifier or a second corroborating signal.
- **Never merge records with conflicting identifiers** (different valid DOIs or PMIDs) — route to review instead.
- Cap union-find transitivity: a merge group > 5 records goes to review (chains are where false merges multiply).

## 3. Safety rules (fix F7)

1. **Never auto-mark a record with a human decision.** If either record in a candidate pair is human-included/excluded, the pair goes to the review queue regardless of score — no exceptions.
2. **Canonical selection = most complete record**, in order: has DOI+PMID > has either identifier > most filled metadata fields > has a screening decision. Never "earliest import" (that keeps the unscreened copy).
3. **Merging is additive, not destructive:** merge copies missing metadata (abstract, keywords, MeSH) from the duplicate onto the canonical before marking the duplicate `is_duplicate=1`; the duplicate row is retained (soft state), never deleted — `keep_both` stays one click away.
4. **Every merge writes an audit row:** rule tier, score, canonical id, duplicate id, timestamp, actor (auto vs human).
5. **Dedup runs at import, before screening** by default. Re-running dedup later on a screened project only *proposes* — it never mutates.

## 4. Study grouping (new capability)

- New table `study_groups (group_id, project_id)` + `studies.study_group_id` + `studies.is_primary_report`.
- T4 hits and a manual "link as same study" UI action create groups; the record with the primary results paper is `is_primary_report=1` (human-set, defaults to the one with the most extracted data).
- **PRISMA:** grouped secondary reports are NOT in `duplicates_removed`; they appear in a "additional reports of included studies" note (PRISMA 2020-conformant).
- **Meta-analysis guard (ties to F12):** pooling warns when a `study_group_id` contributes more than one effect size for the same outcome and requires the user to pick the report or pre-specified hierarchy (primary > most recent > largest).

## 5. Human review UI

- Queue sorted by match confidence **descending** (near-threshold pairs first — most informative).
- Side-by-side metadata diff (title/authors/year/journal/DOI/abstract presence) with three actions: **Merge**, **Keep both**, **Same study, different report** (creates group).
- Bulk merge for T0/T1 groups with >10 identical pairs; undo per merge (audit row makes this trivial).
- Progress metric: "X auto-merged (tier breakdown), Y awaiting review" — so the reviewer sees exactly what the machine did.

## 6. Evaluation gate (how you know it's sensible)

- Build a **gold set**: ~200 pairs from your own imports (100 true duplicates incl. hard cases: preprint vs published, database variants with subtitle differences; 100 non-duplicates incl. near-title distinct papers, same-trial different reports).
- Metrics per release: **auto-merge precision ≥ 0.99** (a false merge is worse than a missed merge — it silently deletes data), **recall reported** with CI, review-queue size as % of records (workload estimate).
- Regression: the gold set runs in CI; any threshold change must not drop precision below target.

## 7. Implementation order for the coding agent

1. Normalization layer + candidate blocking (§1) — foundation, no behavior change yet
2. Tier cascade T0–T3 replacing the single union-find rule (§2) + hard rules (§3.1–3.4)
3. Canonical re-selection + additive merge (§3.2–3.4)
4. `study_groups` table + T4 + manual linking UI (§4)
5. Review queue UI (§5)
6. Gold set + CI evaluation (§6)
7. PRISMA integration: `duplicates_removed` counts by tier; grouped reports excluded from that box; meta-analysis multi-report warning

**Acceptance tests:** human-included record survives dedup untouched (F7); near-title distinct papers (protocol vs results) are NOT merged (H9); `PMID:123` vs `123` merges; conflicting DOIs route to review; merge is reversible with full audit trail; gold-set precision ≥ 0.99.

## References
[1] McKeown S, Mir ZM. Considerations for conducting systematic reviews: evaluating the performance of different methods for de-duplicating references. *Syst Rev.* 2021. doi:10.1186/s13643-021-01583-y
[2] Forbes C, Greenwood H, Carter M, et al. Automation of duplicate record detection for systematic reviews: Deduplicator. *Syst Rev.* 2024. doi:10.1186/s13643-024-02619-9
[3] Guimarães N, Ferreira AJF, Ribeiro-Silva RC, et al. Deduplication records in systematic reviews: there are free accurate automated ways to do so. *J Clin Epidemiol.* 2022. doi:10.1016/j.jclinepi.2022.10.009
