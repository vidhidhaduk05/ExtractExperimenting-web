"""Duplicate detection service for systematic review studies.

Detects duplicate studies using three strategies:
  1. DOI/PMID exact match — highest confidence
  2. Title similarity — Levenshtein ratio > 0.9 (via python-Levenshtein)
  3. Author/year match — secondary signal combined with title similarity

Returns groups of duplicates with match reasons and similarity scores.
The first study in each group (by created_at) is designated the canonical
study; others are marked as duplicates.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import duplicate_finder
from services.duplicate_finder import CandidatePair, find_candidate_pairs

import re
from functools import lru_cache

TITLE_SIMILARITY_THRESHOLD = 0.90

# Pre-compiled regex patterns for title & author normalization
_PUNCTUATION_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")
_AUTHOR_DELIM_RE = re.compile(r"[,;&]")
_NON_ALNUM_RE = re.compile(r"\W+")

# Try python-Levenshtein (fast C extension), fall back to difflib with length bound pre-check
try:
    from Levenshtein import ratio as _lev_ratio

    @lru_cache(maxsize=2048)
    def _title_similarity(a: str, b: str, threshold: float = TITLE_SIMILARITY_THRESHOLD) -> float:
        if a == b:
            return 1.0
        la, lb = len(a), len(b)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        # Fast path: Mathematical upper bound on Levenshtein ratio based on string lengths.
        # Evaluated BEFORE lowercasing to skip string allocations for dissimilar titles.
        min_len = la if la < lb else lb
        if (2 * min_len) / (la + lb) < threshold:
            return 0.0

        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0

        la, lb = len(a_lower), len(b_lower)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        min_len = la if la < lb else lb
        max_ratio = (2 * min_len) / (la + lb)
        if max_ratio < threshold:
            return 0.0

        return _lev_ratio(a_lower, b_lower)
except ImportError:
    import difflib

    @lru_cache(maxsize=2048)
    def _title_similarity(a: str, b: str, threshold: float = TITLE_SIMILARITY_THRESHOLD) -> float:
        # Fast path 1: Exact string identity
        if a == b:
            return 1.0
        la, lb = len(a), len(b)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        # Fast path 2: Mathematical upper bound on Levenshtein / SequenceMatcher ratio.
        # SequenceMatcher ratio is defined as 2 * M / (la + lb), where M <= min(la, lb).
        # Evaluated BEFORE lowercasing to skip string allocations for dissimilar titles.
        min_len = la if la < lb else lb
        if (2 * min_len) / (la + lb) < threshold:
            return 0.0

        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0

        return difflib.SequenceMatcher(None, a_lower, b_lower).ratio()


def _normalize_doi(doi: str) -> str:
    """Normalize a DOI string for comparison."""
    if not doi:
        return ""
    d = doi.strip().lower()
    # Remove common URL prefixes
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:", "doi.org/"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d


def _normalize_pmid(pmid: str) -> str:
    """Normalize a PMID string for comparison."""
    if not pmid:
        return ""
    return pmid.strip()


def _normalize_title(title: str) -> str:
    """Normalize a title for comparison — lowercase, strip punctuation/whitespace."""
    if not title:
        return ""
    t = title.lower().strip()
    # Remove punctuation
    t = _PUNCTUATION_RE.sub(" ", t)
    # Collapse whitespace
    return _WHITESPACE_RE.sub(" ", t).strip()


def _normalize_authors(authors: str) -> set[str]:
    """Extract a set of author last names for comparison."""
    if not authors:
        return set()
    # Split on common delimiters (, ; &)
    parts = _AUTHOR_DELIM_RE.split(authors)
    names = set()
    for p in parts:
        p = p.strip().lower()
        if not p:
            continue
        # Take the first word (usually last name)
        words = p.split()
        if words:
            names.add(words[0])
    return names


def _author_overlap_sets(s1: set[str], s2: set[str]) -> float:
    """Compute author name overlap ratio directly from pre-normalized author sets.

    Avoids O(N^2) string parsing and splitting when called in pairwise deduplication loops.
    """
    if not s1 or not s2:
        return 0.0
    overlap = s1 & s2
    min_len = len(s1) if len(s1) < len(s2) else len(s2)
    return len(overlap) / min_len


def _author_overlap(a1: str, a2: str) -> float:
    """Compute author name overlap ratio."""
    s1 = _normalize_authors(a1)
    s2 = _normalize_authors(a2)
    return _author_overlap_sets(s1, s2)


def _get_human_decided_ids(db: DBBackend, project_id: str) -> set[str]:
    """IDs of studies with a human screening decision (fixes F7).

    A study is human-decided when a reviewer decision exists in
    screening_decisions, or its studies row carries a non-dedup
    included/excluded status.
    """
    decided: set[str] = set()
    try:
        rows = db.execute(
            "SELECT DISTINCT study_id FROM screening_decisions WHERE project_id = ?",
            (project_id,),
        ).fetchall()
        decided.update(r["study_id"] if isinstance(r, dict) else r[0] for r in rows)
    except Exception:
        pass
    try:
        rows = db.execute(
            """SELECT study_id FROM studies
               WHERE project_id = ?
                 AND screening_status IN ('included', 'excluded')
                 AND (screening_stage IS NULL OR screening_stage != 'dedup')""",
            (project_id,),
        ).fetchall()
        decided.update(r["study_id"] if isinstance(r, dict) else r[0] for r in rows)
    except Exception:
        pass
    return decided


def _load_non_duplicate_pairs(db: DBBackend, project_id: str) -> set[tuple[str, str]]:
    """Load the persistent 'not duplicates' memory (port of nonDuplicates.ts)."""
    try:
        rows = db.execute(
            "SELECT study_id_a, study_id_b FROM non_duplicates WHERE project_id = ?",
            (project_id,),
        ).fetchall()
    except Exception:
        return set()
    pairs = set()
    for r in rows:
        a = r["study_id_a"] if isinstance(r, dict) else r[0]
        b = r["study_id_b"] if isinstance(r, dict) else r[1]
        pairs.add((a, b) if a < b else (b, a))
    return pairs


def _completeness_score(s: dict) -> int:
    """Count filled metadata fields (dedup_plan §3.2 'most filled metadata')."""
    score = 0
    for f in ("title", "authors", "journal", "abstract", "study_design", "source"):
        if (s.get(f) or "").strip():
            score += 1
    if s.get("publication_year") not in (None, "", 0):
        score += 1
    return score


def _select_master(members: list[dict], strategy: str = "most_complete") -> dict:
    """Master-item selection (Zoplicate mergeItems semantics + dedup_plan §3.2).

    most_complete: has DOI+PMID > has either identifier > most filled fields
                   > has a screening decision. Never 'earliest import'.
    newest / oldest: by publication_year then created_at.
    has_decision: prefer records with a human screening decision.
    """
    if len(members) == 1:
        return members[0]

    def _id_rank(s: dict) -> int:
        has_doi = 1 if duplicate_finder.clean_doi(s.get("doi", "")) else 0
        has_pmid = 1 if duplicate_finder.normalize_id(s.get("pmid", "")) else 0
        return has_doi + has_pmid

    if strategy == "has_decision":
        decided = [m for m in members if (m.get("screening_status") or "pending") not in ("pending", "")]
        if decided:
            return max(decided, key=_completeness_score)
        return max(members, key=_completeness_score)
    if strategy in ("newest", "oldest"):
        def _year_key(s: dict):
            y = s.get("publication_year")
            return (int(y) if y else 0, s.get("created_at") or "", s["study_id"])
        return (max if strategy == "newest" else min)(members, key=_year_key)

    # default: most_complete — study_id as final tie-break so master selection
    # is deterministic across runs (identical records otherwise tie arbitrarily)
    def _key(s: dict):
        ids = _id_rank(s)
        complete = _completeness_score(s)
        decided = 1 if (s.get("screening_status") or "pending") not in ("pending", "") else 0
        return (ids, complete, decided, s["study_id"])

    best = max(members, key=_key)
    return best


_MERGEABLE_FIELDS = ["doi", "pmid", "abstract", "authors", "publication_year",
                     "journal", "study_design", "source"]


def _fields_to_fill(master: dict, dup: dict) -> dict:
    """Additive merge field plan: master wins ALL conflicts, including the
    abstract — a longer abstract on the duplicate is a conflicting claim
    (e.g. abstract of a different report), not a free upgrade. Only fields
    the master is missing are filled from the duplicate (Zoplicate
    `{...keep, ...masterJSON}` pattern)."""
    fills: dict = {}
    for f in _MERGEABLE_FIELDS:
        m_val = master.get(f)
        d_val = dup.get(f)
        if m_val in (None, "", 0) and d_val not in (None, "", 0):
            fills[f] = d_val
    return fills


def _write_audit(db: DBBackend, project_id: str, group_id: str, tier: str,
                 score: float, master_study_id: str, duplicate_study_id: str,
                 action: str, actor: str = "auto", filled_fields_json: str = ""):
    db.insert("dedup_audit", {
        "audit_id": str(uuid.uuid4()),
        "project_id": project_id,
        "group_id": group_id,
        "tier": tier,
        "score": score,
        "master_study_id": master_study_id,
        "duplicate_study_id": duplicate_study_id,
        "action": action,
        "actor": actor,
        "filled_fields": filled_fields_json,
    })


# ─────────────────────────────────────────────────────────────────────────
# Typed publication fingerprints — rejection memory that survives re-import
# ─────────────────────────────────────────────────────────────────────────

def _study_fingerprints(study: dict) -> set[str]:
    """Typed identity keys for a study record: doi:<ndoi>, pmid:<npmid>,
    title:<normalized title>. Study IDs change on re-import; these do not."""
    keys: set[str] = set()
    ndoi = duplicate_finder.clean_doi(study.get("doi", ""))
    if ndoi:
        keys.add(f"doi:{ndoi}")
    npmid = duplicate_finder.normalize_id(study.get("pmid", ""))
    if npmid:
        keys.add(f"pmid:{npmid}")
    ntitle = duplicate_finder.normalize_title(study.get("title", ""))
    if ntitle:
        keys.add(f"title:{ntitle}")
    return keys


def _load_non_duplicate_fingerprints(db: DBBackend, project_id: str) -> list[tuple[set, set]]:
    """Rejected pairs as fingerprint sets (fallback when study IDs changed)."""
    try:
        rows = db.execute(
            "SELECT fingerprint_a, fingerprint_b FROM non_duplicates "
            "WHERE project_id = ? AND (fingerprint_a != '' OR fingerprint_b != '')",
            (project_id,),
        ).fetchall()
    except Exception:
        return []
    out = []
    for r in rows:
        row = r if isinstance(r, dict) else dict(r)
        try:
            fa = set(json.loads(row.get("fingerprint_a") or "[]"))
            fb = set(json.loads(row.get("fingerprint_b") or "[]"))
        except Exception:
            continue
        if fa and fb:
            out.append((fa, fb))
    return out


def _fingerprint_rejected_pairs(studies: list[dict],
                                fp_pairs: list[tuple[set, set]]) -> set[tuple[str, str]]:
    """Study-id pairs whose records match a rejected fingerprint pair on both
    sides (either orientation) — used to exclude re-imported rejected pairs.
    Inverted index over fingerprint keys; no all-pairs scan."""
    key_to_ids: dict[str, list[str]] = {}
    for s in studies:
        for key in _study_fingerprints(s):
            key_to_ids.setdefault(key, []).append(s["study_id"])
    rejected: set[tuple[str, str]] = set()
    for ra, rb in fp_pairs:
        ids_a = {sid for key in ra for sid in key_to_ids.get(key, [])}
        ids_b = {sid for key in rb for sid in key_to_ids.get(key, [])}
        for a in ids_a:
            for b in ids_b:
                if a != b:
                    rejected.add((a, b) if a < b else (b, a))
    return rejected


def _execute_merge(db: DBBackend, project_id: str, group_id: str, tier: str,
                   score: float, master: dict, dup: dict, actor: str = "auto") -> list[str]:
    """Additive, non-destructive merge (dedup_plan §3.3): fill missing fields
    on the master from the duplicate, then soft-mark the duplicate
    (is_duplicate=1, row retained). Writes one audit row per merge carrying
    the overwritten master values so undo can restore them."""
    fills = _fields_to_fill(master, dup)
    # snapshot the PRE-merge master values for every field we are about to
    # fill, so keep-both/undo can restore exactly what this merge changed
    pre_merge = {f: master.get(f) for f in fills}
    if fills:
        db.update("studies", master["study_id"], fills)
        master.update(fills)
    db.update("studies", dup["study_id"], {
        "is_duplicate": 1,
        "duplicate_of_study_id": master["study_id"],
        "duplicate_group_id": group_id,
        "screening_status": "excluded",
        "screening_reason": "Duplicate publication",
        "screening_stage": "dedup",
    })
    # keep the caller's in-memory snapshot consistent for response building
    dup.update({
        "is_duplicate": 1,
        "duplicate_of_study_id": master["study_id"],
        "duplicate_group_id": group_id,
        "screening_status": "excluded",
        "screening_stage": "dedup",
    })
    # audit stores the PRE-merge master values for every filled field, so
    # keep-both/undo can restore them unless the field was edited afterwards
    _write_audit(db, project_id, group_id, tier, score,
                 master["study_id"], dup["study_id"],
                 "accept_merge" if actor != "auto" else "auto_merge", actor,
                 filled_fields_json=json.dumps(pre_merge) if fills else "")
    return list(fills.keys())


def _build_field_diffs(master: dict, dup: dict) -> dict:
    """Side-by-side metadata diff for the review sheet (zoplicate plan §2.4)."""
    diffs = {}
    for f in ("title", "authors", "publication_year", "journal", "doi", "abstract"):
        m_val = master.get(f)
        d_val = dup.get(f)
        diffs[f] = {
            "master": m_val,
            "duplicate": d_val,
            "differs": (m_val or "") != (d_val or ""),
        }
    return diffs


def _persist_group(db: DBBackend, project_id: str, group_id: str, tier: str,
                   score: float, master_study_id: str, member_ids: list[str],
                   studies_by_id: dict, status: str = "pending",
                   decided_by: str = ""):
    """Insert or refresh a dedup_groups row with a field-diff payload."""
    master = studies_by_id.get(master_study_id, {})
    dup_ids = [sid for sid in member_ids if sid != master_study_id]
    diffs = {sid: _build_field_diffs(master, studies_by_id[sid]) for sid in dup_ids}
    existing = db.query("dedup_groups", {"group_id": group_id})
    row = {
        "project_id": project_id,
        "master_study_id": master_study_id,
        "tier": tier,
        "score": score,
        "status": status,
        "member_study_ids": json.dumps(member_ids),
        "field_diffs": json.dumps(diffs),
        "decided_by": decided_by,
        "decided_at": datetime.utcnow().isoformat() if decided_by else "",
    }
    if existing:
        db.update("dedup_groups", group_id, row)
    else:
        row["group_id"] = group_id
        db.insert("dedup_groups", row)


def _load_groups(db: DBBackend, project_id: str, status: Optional[str] = None) -> list[dict]:
    """Load dedup_groups rows (optionally by status) with parsed JSON fields."""
    if status:
        rows = db.execute(
            "SELECT * FROM dedup_groups WHERE project_id = ? AND status = ? ORDER BY score DESC, created_at",
            (project_id, status),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM dedup_groups WHERE project_id = ? ORDER BY score DESC, created_at",
            (project_id,),
        ).fetchall()
    groups = []
    for r in rows:
        g = dict(r) if not isinstance(r, dict) else r
        try:
            g["members"] = json.loads(g.get("member_study_ids") or "[]")
        except Exception:
            g["members"] = []
        try:
            g["field_diffs_parsed"] = json.loads(g.get("field_diffs") or "{}")
        except Exception:
            g["field_diffs_parsed"] = {}
        groups.append(g)
    return groups


def deduplicate_studies(project_id: str, auto_mark: bool = True, db: Optional[DBBackend] = None, title_threshold: float = TITLE_SIMILARITY_THRESHOLD) -> dict:
    """Detect and optionally mark duplicate studies using the Zoplicate-style
    tiered cascade (T0 identifiers, T1 exact title+author+year, T2 fuzzy
    title+corroboration).

    Safety rules (dedup_plan §3):
      - Records with human screening decisions are never auto-marked; their
        pairs land in the review queue (dedup_groups, status pending).
      - Conflicting identifiers route to review, never merge.
      - Merge groups are capped at 5 records; larger chains go to review.
      - Merging is additive and reversible; every merge writes an audit row.

    Returns the legacy DeduplicationResult shape plus tier_breakdown and
    review_queue_size.
    """
    db = db or get_db_backend()
    studies = db.query("studies", {"project_id": project_id}, order_by="created_at")

    if len(studies) < 2:
        return {
            "project_id": project_id,
            "total_studies": len(studies),
            "duplicate_groups": [],
            "total_duplicates": 0,
            "duplicates_marked": 0,
            "tier_breakdown": {},
            "review_queue_size": 0,
        }

    human_decided_ids = _get_human_decided_ids(db, project_id)
    non_dup_pairs = _load_non_duplicate_pairs(db, project_id)
    # rejection memory inherited across re-imports via typed fingerprints
    # (study IDs change on re-import; doi:/pmid:/title: keys do not)
    fp_pairs = _load_non_duplicate_fingerprints(db, project_id)
    if fp_pairs:
        non_dup_pairs = non_dup_pairs | _fingerprint_rejected_pairs(studies, fp_pairs)

    # ── Cascading candidate generation (Zoplicate DuplicateFinder port) ──
    active_studies = [s for s in studies if not s.get("is_duplicate")]
    pairs = duplicate_finder.find_candidate_pairs(active_studies, human_decided_ids, non_dup_pairs)
    auto_groups, oversize_pairs = duplicate_finder.build_merge_groups(
        active_studies, pairs, non_dup_pairs)

    studies_by_id = {s["study_id"]: s for s in studies}
    id_to_pair = {(p.study_id_a, p.study_id_b): p for p in pairs}
    for p in pairs:  # both orderings for lookup convenience
        id_to_pair[(p.study_id_b, p.study_id_a)] = p

    def _pair_for(a: str, b: str) -> CandidatePair:
        return id_to_pair.get((a, b)) or CandidatePair(a, b, "T3", 0.0, "unknown", False)

    # Refresh pending groups: drop previous pending rows, keep decided ones
    try:
        db.execute("DELETE FROM dedup_groups WHERE project_id = ? AND status = 'pending'", (project_id,))
    except Exception:
        pass

    dup_groups: list[dict] = []
    tier_breakdown: dict[str, int] = {}
    duplicates_marked = 0
    review_queue_size = 0

    # ── Auto-merge groups (T0-T2, no human-decided members, <= cap) ──
    for member_ids in auto_groups:
        members = [studies_by_id[sid] for sid in member_ids]
        master = _select_master(members, "most_complete")
        group_id = str(uuid.uuid4())
        # group tier = strongest tier among member pairs
        member_pairs = [_pair_for(master["study_id"], sid) for sid in member_ids if sid != master["study_id"]]
        tier = min((p.tier for p in member_pairs), default="T0")
        score = max((p.score for p in member_pairs), default=1.0)

        if auto_mark:
            for dup in members:
                if dup["study_id"] == master["study_id"]:
                    continue
                p = _pair_for(master["study_id"], dup["study_id"])
                _execute_merge(db, project_id, group_id, p.tier, p.score, master, dup, actor="auto")
                tier_breakdown[p.tier] = tier_breakdown.get(p.tier, 0) + 1
                duplicates_marked += 1
            _persist_group(db, project_id, group_id, tier, score, master["study_id"],
                           member_ids, studies_by_id, status="accepted", decided_by="auto")
        else:
            _persist_group(db, project_id, group_id, tier, score, master["study_id"],
                           member_ids, studies_by_id, status="pending")

    # ── Review-queue pairs: T3/T4/conflict/human_review + oversize chains ──
    review_pairs = list({(p.study_id_a, p.study_id_b): p
                         for p in [p for p in pairs if not p.auto_mergeable] + oversize_pairs}.values())
    for p in review_pairs:
        a, b = studies_by_id.get(p.study_id_a), studies_by_id.get(p.study_id_b)
        if not a or not b:
            continue
        group_id = str(uuid.uuid4())
        master = _select_master([a, b], "most_complete")
        _persist_group(db, project_id, group_id, p.tier, p.score, master["study_id"],
                       [p.study_id_a, p.study_id_b], studies_by_id, status="pending")
        review_queue_size += 1

    db.commit()

    # ── Build legacy response shape from unresolved groups only ──
    # (rejected / keep_both groups are resolved: those pairs are unique records)
    for g in _load_groups(db, project_id):
        if g["status"] not in ("pending", "accepted"):
            continue
        member_ids = g["members"]
        master = studies_by_id.get(g["master_study_id"]) or {}
        dup_entries = []
        for sid in member_ids:
            if sid == g["master_study_id"]:
                continue
            s = studies_by_id.get(sid)
            if not s:
                continue
            p = _pair_for(g["master_study_id"], sid)
            dup_entries.append({
                "study_id": s["study_id"],
                "title": s.get("title", ""),
                "doi": s.get("doi", ""),
                "pmid": s.get("pmid", ""),
                "authors": s.get("authors", ""),
                "publication_year": s.get("publication_year"),
                "journal": s.get("journal", ""),
                "abstract": s.get("abstract", ""),
                "is_duplicate": s.get("is_duplicate", 0),
                "screening_status": s.get("screening_status", "pending"),
                "match_reason": p.reason,
                "similarity_score": round(p.score, 4),
                "tier": p.tier,
            })
        dup_groups.append({
            "group_id": g["group_id"],
            "canonical_study_id": g["master_study_id"],
            "canonical_title": master.get("title", ""),
            "canonical_doi": master.get("doi", ""),
            "canonical_pmid": master.get("pmid", ""),
            "canonical_authors": master.get("authors", ""),
            "canonical_year": master.get("publication_year"),
            "canonical_journal": master.get("journal", ""),
            "canonical_abstract": master.get("abstract", ""),
            "canonical_is_duplicate": master.get("is_duplicate", 0),
            "canonical_screening_status": master.get("screening_status", "pending"),
            "duplicates": dup_entries,
            "tier": g["tier"],
            "status": g["status"],
        })

    total_dups = sum(len(g["duplicates"]) for g in dup_groups)
    return {
        "project_id": project_id,
        "total_studies": len(studies),
        "duplicate_groups": dup_groups,
        "total_duplicates": total_dups,
        "duplicates_marked": duplicates_marked,
        "tier_breakdown": tier_breakdown,
        "review_queue_size": review_queue_size,
    }


# ─────────────────────────────────────────────────────────────────────────
# Review-sheet endpoints support (zoplicate plan §2.4)
# ─────────────────────────────────────────────────────────────────────────

def get_candidate_groups(project_id: str, status: str = "pending",
                         db: Optional[DBBackend] = None) -> dict:
    """Rows for the Excel-like accept/reject sheet, with field diffs."""
    db = db or get_db_backend()
    studies_rows = db.query("studies", {"project_id": project_id})
    studies_by_id = {s["study_id"]: s for s in studies_rows}
    groups = _load_groups(db, project_id, status=status or None)
    rows = []
    for g in groups:
        master = studies_by_id.get(g["master_study_id"], {})
        rows.append({
            "group_id": g["group_id"],
            "tier": g["tier"],
            "score": g["score"],
            "status": g["status"],
            "master": {
                "study_id": master.get("study_id", ""),
                "title": master.get("title", ""),
                "authors": master.get("authors", ""),
                "publication_year": master.get("publication_year"),
                "journal": master.get("journal", ""),
                "doi": master.get("doi", ""),
                "abstract": master.get("abstract", ""),
            },
            "duplicates": [
                {
                    "study_id": sid,
                    **{k: studies_by_id.get(sid, {}).get(k) for k in
                       ("title", "authors", "publication_year", "journal", "doi", "abstract")},
                }
                for sid in g["members"] if sid != g["master_study_id"]
            ],
            "field_diffs": g["field_diffs_parsed"],
            "decided_by": g.get("decided_by", ""),
            "decided_at": g.get("decided_at", ""),
        })
    stats = get_duplicate_stats(project_id, db)
    return {"project_id": project_id, "status": status, "groups": rows, "stats": stats}


def get_duplicate_stats(project_id: str, db: Optional[DBBackend] = None) -> dict:
    """Stats bar (port of Zoplicate duplicateStats): groups by status and
    auto-merged counts by tier — feeds PRISMA duplicates_removed by tier."""
    db = db or get_db_backend()
    by_status: dict[str, int] = {}
    for row in db.execute(
        "SELECT status, COUNT(*) AS c FROM dedup_groups WHERE project_id = ? GROUP BY status",
        (project_id,),
    ).fetchall():
        r = dict(row) if not isinstance(row, dict) else row
        by_status[r["status"]] = r["c"]
    by_tier: dict[str, int] = {}
    for row in db.execute(
        """SELECT tier, COUNT(*) AS c FROM dedup_audit
           WHERE project_id = ? AND action IN ('auto_merge', 'accept_merge')
           GROUP BY tier""",
        (project_id,),
    ).fetchall():
        r = dict(row) if not isinstance(row, dict) else row
        by_tier[r["tier"]] = r["c"]
    return {
        "groups_pending": by_status.get("pending", 0),
        "groups_accepted": by_status.get("accepted", 0),
        "groups_rejected": by_status.get("rejected", 0),
        "groups_keep_both": by_status.get("keep_both", 0),
        "auto_merged_by_tier": by_tier,
    }


def _get_group_or_raise(db: DBBackend, project_id: str, group_id: str) -> dict:
    rows = db.query("dedup_groups", {"group_id": group_id, "project_id": project_id})
    if not rows:
        raise ValueError(f"Dedup group {group_id} not found in project {project_id}")
    g = rows[0]
    try:
        g["members"] = json.loads(g.get("member_study_ids") or "[]")
    except Exception:
        g["members"] = []
    return g


def accept_group(project_id: str, group_id: str, db: Optional[DBBackend] = None,
                 actor: str = "user", master_study_id: Optional[str] = None,
                 commit: bool = True) -> dict:
    """Accept a candidate group: merge duplicates into master (master wins
    conflicts, missing fields filled), soft-mark duplicates, audit row."""
    db = db or get_db_backend()
    g = _get_group_or_raise(db, project_id, group_id)
    if g["status"] == "accepted":
        return {"status": "success", "action": "accept", "message": "Group already accepted.",
                "group_id": group_id}
    if g["status"] == "rejected":
        raise ValueError("Group was rejected as not-duplicates; it cannot be accepted.")

    studies_rows = db.query("studies", {"project_id": project_id})
    studies_by_id = {s["study_id"]: s for s in studies_rows}
    members = [studies_by_id[sid] for sid in g["members"] if sid in studies_by_id]
    if len(members) < 2:
        raise ValueError("Group has fewer than two surviving members.")

    # Never merge through a human-decided record without explicit action (F7):
    # the human-decided record becomes master and is never marked duplicate.
    # Honour a master chosen via set-master; otherwise select by strategy.
    if master_study_id is not None:
        if master_study_id not in {m["study_id"] for m in members}:
            raise ValueError("Planned master is no longer a member of this group.")
        master = studies_by_id[master_study_id]
    elif g.get("master_study_id") in {m["study_id"] for m in members}:
        master = next(m for m in members if m["study_id"] == g["master_study_id"])
    else:
        master = _select_master(members, "most_complete")
    # Validate the complete group before writing any member. A protocol and
    # results paper stay separate, but two imports of the same protocol may merge.
    for dup in members:
        if dup["study_id"] == master["study_id"]:
            continue
        if duplicate_finder._is_secondary_report(dup) or duplicate_finder._is_secondary_report(master):
            same_doi = duplicate_finder.clean_doi(master.get("doi", ""))
            same_pmid = duplicate_finder.normalize_id(master.get("pmid", ""))
            identifier_confirmed = (
                (same_doi and same_doi == duplicate_finder.clean_doi(dup.get("doi", "")))
                or (same_pmid and same_pmid == duplicate_finder.normalize_id(dup.get("pmid", "")))
            ) and not duplicate_finder._conflicting_identifiers(master, dup)
            if not identifier_confirmed:
                raise ValueError("This group contains a protocol/secondary report; use keep-both or study grouping instead.")
    filled: list[str] = []
    for dup in members:
        if dup["study_id"] == master["study_id"]:
            continue
        fills = _execute_merge(db, project_id, group_id, g["tier"], g["score"],
                               master, dup, actor=actor)
        filled.extend(fills)

    db.update("dedup_groups", group_id, {
        "status": "accepted",
        "master_study_id": master["study_id"],
        "decided_by": actor,
        "decided_at": datetime.utcnow().isoformat(),
    })
    if commit:
        db.commit()
    return {
        "status": "success",
        "action": "accept",
        "group_id": group_id,
        "master_study_id": master["study_id"],
        "merged_count": len(members) - 1,
        "message": f"Merged {len(members) - 1} duplicate(s) into master {master['study_id']}.",
    }


def reject_group(project_id: str, group_id: str, db: Optional[DBBackend] = None,
                 actor: str = "user") -> dict:
    """Reject a candidate group: record every pair in the non_duplicates
    memory (port of nonDuplicates.ts) so it never reappears — on re-import
    or re-scan."""
    db = db or get_db_backend()
    g = _get_group_or_raise(db, project_id, group_id)
    member_ids = sorted(g["members"])
    studies_rows = db.query("studies", {"project_id": project_id})
    fp_by_id = {s["study_id"]: _study_fingerprints(s) for s in studies_rows}
    now = datetime.utcnow().isoformat()
    for i in range(len(member_ids)):
        for j in range(i + 1, len(member_ids)):
            a, b = member_ids[i], member_ids[j]
            key = (a, b) if a < b else (b, a)
            try:
                db.insert("non_duplicates", {
                    "project_id": project_id,
                    "study_id_a": key[0],
                    "study_id_b": key[1],
                    "fingerprint_a": json.dumps(sorted(fp_by_id.get(key[0], set()))),
                    "fingerprint_b": json.dumps(sorted(fp_by_id.get(key[1], set()))),
                    "decided_by": actor,
                })
            except Exception:
                pass  # pair already remembered
            _write_audit(db, project_id, group_id, g["tier"], g["score"],
                         "", "", "reject", actor)
    db.update("dedup_groups", group_id, {
        "status": "rejected",
        "decided_by": actor,
        "decided_at": now,
    })
    db.commit()
    return {
        "status": "success",
        "action": "reject",
        "group_id": group_id,
        "pairs_recorded": len(member_ids) * (len(member_ids) - 1) // 2,
        "message": "Pair(s) recorded as not-duplicates and will not be flagged again.",
    }


class MergeUndoConflictError(ValueError):
    """Undo would clobber a field a human edited after the merge (HTTP 409)."""


def _restore_filled_fields(db: DBBackend, project_id: str, group_id: str,
                           master_study_id: str, dup_study_id: str) -> list[str]:
    """Undo field fills recorded on the merge audit row.

    A filled field is restored only if the master still carries the value
    this merge wrote; if the value differs, a human edited it afterwards and
    we refuse (MergeUndoConflictError) rather than clobber their work.
    """
    try:
        rows = db.execute(
            """SELECT filled_fields, created_at FROM dedup_audit
               WHERE project_id = ? AND group_id = ?
                 AND master_study_id = ? AND duplicate_study_id = ?
                 AND action IN ('auto_merge', 'accept_merge')
               ORDER BY created_at DESC LIMIT 1""",
            (project_id, group_id, master_study_id, dup_study_id),
        ).fetchall()
    except Exception:
        return []
    if not rows:
        return []
    row = rows[0] if isinstance(rows[0], dict) else dict(rows[0])
    try:
        pre_merge = json.loads(row.get("filled_fields") or "")
    except Exception:
        return []
    if not isinstance(pre_merge, dict) or not pre_merge:
        return []
    master_row = db.query("studies", {"study_id": master_study_id})
    if not master_row:
        return []
    master = master_row[0]
    dup_row = db.query("studies", {"study_id": dup_study_id})
    written = dup_row[0] if dup_row else {}
    restore: dict = {}
    for field, previous in pre_merge.items():
        current = master.get(field)
        # the merge wrote the duplicate's value; anything else = later edit
        if current not in (None, "") and current != written.get(field):
            raise MergeUndoConflictError(
                f"Field '{field}' on the master record was edited after the merge; "
                "undo would overwrite that edit. Resolve the field manually or "
                "keep the current value."
            )
        restore[field] = previous if previous not in (None, "") else ""
    if restore:
        db.update("studies", master_study_id, restore)
    return list(restore.keys())


def keep_both_group(project_id: str, group_id: str, db: Optional[DBBackend] = None,
                    actor: str = "user") -> dict:
    """Keep both records: unmark any duplicate flags inside the group, undo
    the field fills recorded at merge time (unless edited since — 409), and
    close the group as keep_both (one click away from merge, reversible)."""
    db = db or get_db_backend()
    g = _get_group_or_raise(db, project_id, group_id)
    master_study_id = g.get("master_study_id") or ""
    restored: list[str] = []
    for sid in g["members"]:
        row = db.query("studies", {"study_id": sid, "project_id": project_id})
        if row and row[0].get("is_duplicate"):
            if master_study_id and master_study_id != sid:
                restored.extend(_restore_filled_fields(
                    db, project_id, group_id, master_study_id, sid))
            updates = {"is_duplicate": 0, "duplicate_of_study_id": ""}
            if row[0].get("screening_stage") == "dedup":
                updates["screening_status"] = "pending"
                updates["screening_reason"] = ""
                updates["screening_stage"] = ""
            db.update("studies", sid, updates)
    db.update("dedup_groups", group_id, {
        "status": "keep_both",
        "decided_by": actor,
        "decided_at": datetime.utcnow().isoformat(),
    })
    _write_audit(db, project_id, group_id, g["tier"], g["score"], "", "", "keep_both", actor)
    db.commit()
    return {"status": "success", "action": "keep_both", "group_id": group_id,
            "message": "Both records retained as unique studies."}


def set_group_master(project_id: str, group_id: str, master_study_id: str,
                     db: Optional[DBBackend] = None, actor: str = "user") -> dict:
    """Choose a different master for a pending group (Zoplicate master-item
    preference). Only pending groups can change master."""
    db = db or get_db_backend()
    g = _get_group_or_raise(db, project_id, group_id)
    if g["status"] not in ("pending",):
        raise ValueError("Master can only be changed while a group is pending.")
    if master_study_id not in g["members"]:
        raise ValueError("Master must be a member of the group.")
    db.update("dedup_groups", group_id, {
        "master_study_id": master_study_id,
        "decided_by": actor,
        "decided_at": datetime.utcnow().isoformat(),
    })
    _write_audit(db, project_id, group_id, g["tier"], g["score"],
                 master_study_id, "", "set_master", actor)
    db.commit()
    return {"status": "success", "action": "set_master", "group_id": group_id,
            "master_study_id": master_study_id}


# ─────────────────────────────────────────────────────────────────────────
# Merge All (port of Zoplicate BulkMergeController)
# ─────────────────────────────────────────────────────────────────────────

class StalePlanError(ValueError):
    """Raised when an executed merge-all plan fingerprint does not match current state."""
    pass


class ActiveRunExistsError(ValueError):
    """Raised when another merge-all run is currently active and within its lease."""
    pass


RUN_LEASE_MINUTES = 10

# In-memory write-through cache: {run_id: run_dict}
_merge_runs: dict[str, dict] = {}


def _parse_db_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(dt_str.split("+")[0].rstrip("Z"), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _plan_fingerprint(plan: list[dict]) -> str:
    """Fingerprint the selected master, merge values and source study snapshots."""
    canonical = []
    for item in sorted(plan, key=lambda x: str(x.get("group_id", ""))):
        canonical.append([
            str(item.get("group_id", "")),
            str(item.get("master_study_id", "")),
            sorted(str(d) for d in item.get("duplicate_ids", [])),
            item.get("fields_to_fill") or {},
            item.get("study_snapshot") or {},
            item.get("master_strategy", "most_complete"),
        ])
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_plan_items(db: DBBackend, project_id: str, master_strategy: str = "most_complete") -> tuple[list[dict], int]:
    studies_rows = db.query("studies", {"project_id": project_id})
    studies_by_id = {s["study_id"]: s for s in studies_rows}
    human_decided_ids = _get_human_decided_ids(db, project_id)
    groups = _load_groups(db, project_id, status="pending")
    # If no pending groups exist in dedup_groups, check all groups that have candidate duplicates
    # or dynamically generate candidates if dedup table is empty
    if not groups:
        all_groups = _load_groups(db, project_id)
        # Check if there are groups with candidate duplicates that haven't had their duplicates marked
        unresolved = []
        for g in all_groups:
            # Check if any member other than master is still not marked as duplicate
            unmarked_members = [
                sid for sid in g["members"]
                if sid != g.get("master_study_id") and studies_by_id.get(sid) and not studies_by_id[sid].get("is_duplicate")
            ]
            if len(unmarked_members) > 0:
                unresolved.append(g)
        
        if unresolved:
            groups = unresolved
        else:
            # If no groups in DB at all, run deduplicate_studies to find them
            dedup_run = deduplicate_studies(project_id, auto_mark=False, db=db)
            groups = _load_groups(db, project_id, status="pending")
    active_studies = [s for s in studies_rows if not s.get("is_duplicate")]
    rejected = _load_non_duplicate_pairs(db, project_id)
    fingerprints = _load_non_duplicate_fingerprints(db, project_id)
    rejected |= _fingerprint_rejected_pairs(active_studies, fingerprints)
    pairs = duplicate_finder.find_candidate_pairs(active_studies, human_decided_ids, rejected)
    safe_groups, _ = duplicate_finder.build_merge_groups(active_studies, pairs, rejected)
    safe_members = {frozenset(ids) for ids in safe_groups}

    plan = []
    skipped_human_decided = 0
    for g in groups:
        member_ids = [sid for sid in g["members"] if sid in studies_by_id]
        if len(member_ids) < 2:
            continue
        if any(sid in human_decided_ids for sid in member_ids):
            skipped_human_decided += 1
            continue
        if frozenset(member_ids) not in safe_members:
            continue
        members = [studies_by_id[sid] for sid in member_ids]
        master = _select_master(members, master_strategy)
        fills = {}
        for dup in members:
            if dup["study_id"] != master["study_id"]:
                fills[dup["study_id"]] = _fields_to_fill(master, dup)
        plan.append({
            "group_id": g["group_id"],
            "tier": g["tier"],
            "score": g["score"],
            "master_study_id": master["study_id"],
            "master_title": master.get("title", ""),
            "duplicate_ids": [sid for sid in member_ids if sid != master["study_id"]],
            "fields_to_fill": fills,
            "master_strategy": master_strategy,
            "study_snapshot": {sid: studies_by_id[sid] for sid in sorted(member_ids)},
        })
    return plan, skipped_human_decided


def _current_plan_fingerprint(db: DBBackend, project_id: str, master_strategy: str = "most_complete") -> str:
    plan, _ = _build_plan_items(db, project_id, master_strategy)
    return _plan_fingerprint(plan)


def _persist_plan(db: DBBackend, project_id: str, plan: list[dict], skip_report: dict) -> tuple[str, str]:
    plan_id = str(uuid.uuid4())
    fp = _plan_fingerprint(plan)
    db.insert("dedup_merge_plans", {
        "plan_id": plan_id,
        "project_id": project_id,
        "fingerprint": fp,
        "plan_json": json.dumps(plan),
        "skip_report": json.dumps(skip_report),
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    })
    return plan_id, fp


def _load_plan(db: DBBackend, plan_id: str) -> Optional[dict]:
    row = db.get("dedup_merge_plans", plan_id)
    if not row:
        return None
    res = dict(row)
    if isinstance(res.get("plan_json"), str):
        try:
            res["plan"] = json.loads(res["plan_json"])
        except Exception:
            res["plan"] = []
    else:
        res["plan"] = res.get("plan_json") or []
    if isinstance(res.get("skip_report"), str):
        try:
            res["skip_report"] = json.loads(res["skip_report"])
        except Exception:
            res["skip_report"] = {}
    else:
        res["skip_report"] = res.get("skip_report") or {}
    return res


def _write_run_row(db: DBBackend, run: dict) -> None:
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "run_id": run["run_id"],
        "plan_id": run.get("plan_id", ""),
        "project_id": run["project_id"],
        "status": run.get("status", "running"),
        "total_groups": run.get("total_groups", 0),
        "processed": run.get("processed", 0),
        "merged": run.get("merged", 0),
        "failed": run.get("failed", 0),
        "skipped_human_decided": run.get("skipped_human_decided", 0),
        "merged_group_ids": json.dumps(run.get("merged_group_ids", [])),
        "errors": json.dumps(run.get("errors", [])),
        "pause_requested": 1 if run.get("pause_requested") else 0,
        "updated_at": now_str,
    }
    existing = db.get("dedup_merge_runs", run["run_id"])
    if existing:
        db.update("dedup_merge_runs", run["run_id"], payload)
    else:
        payload["created_at"] = run.get("created_at") or now_str
        db.insert("dedup_merge_runs", payload)


def _load_run_from_db(db: DBBackend, run_id: str) -> Optional[dict]:
    row = db.get("dedup_merge_runs", run_id)
    if not row:
        return None
    res = dict(row)
    if isinstance(res.get("merged_group_ids"), str):
        try:
            res["merged_group_ids"] = json.loads(res["merged_group_ids"])
        except Exception:
            res["merged_group_ids"] = []
    if isinstance(res.get("errors"), str):
        try:
            res["errors"] = json.loads(res["errors"])
        except Exception:
            res["errors"] = []
    res["pause_requested"] = bool(res.get("pause_requested"))
    return res


def get_merge_all_status(run_id: str, db: Optional[DBBackend] = None) -> dict:
    db = db or get_db_backend()
    db_run = _load_run_from_db(db, run_id)
    if db_run:
        _merge_runs[run_id] = db_run
        return dict(db_run)
    run = _merge_runs.get(run_id)
    if not run:
        raise ValueError(f"Unknown merge-all run {run_id}")
    return dict(run)


def pause_merge_all(run_id: str, db: Optional[DBBackend] = None) -> dict:
    db = db or get_db_backend()
    run = _merge_runs.get(run_id)
    if run and run.get("status") == "running":
        run["pause_requested"] = True
    row = db.get("dedup_merge_runs", run_id)
    if row:
        if row.get("status") == "running":
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            db.update("dedup_merge_runs", run_id, {
                "pause_requested": 1,
                "updated_at": now_str,
            })
            db.commit()
    elif not run:
        raise ValueError(f"Unknown merge-all run {run_id}")
    return get_merge_all_status(run_id, db=db)


def _execute_plan_items(db: DBBackend, project_id: str, items: list[dict], run: dict,
                        actor: str, run_id: str) -> dict:
    for item in items:
        # Check pause requested: in memory cache or in DB
        if _merge_runs.get(run_id, {}).get("pause_requested"):
            run["status"] = "paused"
            run["pause_requested"] = True
            _write_run_row(db, run)
            db.commit()
            break
        db_check = db.get("dedup_merge_runs", run_id)
        if db_check and db_check.get("pause_requested"):
            run["status"] = "paused"
            run["pause_requested"] = True
            _write_run_row(db, run)
            db.commit()
            break

        db.execute("SAVEPOINT dedup_merge_group")
        try:
            for sid, snapshot in item.get("study_snapshot", {}).items():
                if db.get("studies", sid) != snapshot:
                    raise StalePlanError("Study data changed while the merge was running; preview again.")
            accept_group(project_id, item["group_id"], db=db, actor=actor,
                         master_study_id=item["master_study_id"], commit=False)
            run["merged"] += 1
            run["merged_group_ids"].append(item["group_id"])
        except Exception as e:
            db.execute("ROLLBACK TO SAVEPOINT dedup_merge_group")
            run["failed"] += 1
            run.setdefault("errors", []).append({"group_id": item["group_id"], "error": str(e)})

        run["processed"] += 1
        _write_run_row(db, run)
        # Commit the group's metadata/audit changes and progress together.
        db.execute("RELEASE SAVEPOINT dedup_merge_group")
        db.commit()
    else:
        if run["status"] == "running":
            run["status"] = "failed" if run["failed"] else "completed"
            _write_run_row(db, run)
            db.commit()

    return {
        "project_id": project_id,
        "run_id": run_id,
        "plan_id": run.get("plan_id", ""),
        "status": run["status"],
        "total_groups": run["total_groups"],
        "processed": run["processed"],
        "merged": run["merged"],
        "failed": run["failed"],
        "errors": run.get("errors", []),
        "skipped_human_decided": run["skipped_human_decided"],
        "merged_group_ids": run["merged_group_ids"],
        "plan": items,
    }


def merge_all(project_id: str, master_strategy: str = "most_complete",
              include_auto: bool = True, dry_run: bool = False,
              db: Optional[DBBackend] = None, actor: str = "user",
              run_id: Optional[str] = None,
              plan_id: Optional[str] = None) -> dict:
    """Bulk-merge pending duplicate groups (Zoplicate BulkMergeController).

    - Dry-run: returns the full merge plan (N groups, master per group,
      fields to fill) and persists it to dedup_merge_plans with a sha256 fingerprint.
    - Execute: requires a valid plan_id. Recomputes current fingerprint; raises
      StalePlanError if changed. Enforces single active run lease per project.
      Executes merges sequentially with per-group commit (crash-resilient).
    """
    db = db or get_db_backend()
    if master_strategy not in ("most_complete", "newest", "oldest", "has_decision"):
        raise ValueError(f"Invalid master_strategy: {master_strategy}")

    if dry_run:
        plan, skipped_human_decided = _build_plan_items(db, project_id, master_strategy)
        saved_plan_id, fp = _persist_plan(db, project_id, plan, {"skipped_human_decided": skipped_human_decided})
        db.commit()
        return {
            "project_id": project_id,
            "dry_run": True,
            "plan_id": saved_plan_id,
            "fingerprint": fp,
            "master_strategy": master_strategy,
            "total_groups": len(plan),
            "plan": plan,
            "skipped_human_decided": skipped_human_decided,
        }

    # Execute path requires plan_id
    if not plan_id:
        raise ValueError("plan_id is required to execute merge-all")

    saved_plan = _load_plan(db, plan_id)
    if not saved_plan or saved_plan.get("project_id") != project_id:
        raise StalePlanError(f"Plan '{plan_id}' not found for project '{project_id}'")

    current_fp = _current_plan_fingerprint(db, project_id, master_strategy)
    if current_fp != saved_plan.get("fingerprint"):
        raise StalePlanError("Plan is stale; study data or groups have changed since plan was generated")

    # Enforce single active run per project
    running_runs = db.query("dedup_merge_runs", {"project_id": project_id, "status": "running"})
    now = datetime.now(timezone.utc)
    for r_run in running_runs:
        up_dt = _parse_db_datetime(r_run.get("updated_at") or r_run.get("created_at"))
        if up_dt and (now - up_dt).total_seconds() < RUN_LEASE_MINUTES * 60:
            raise ActiveRunExistsError(f"An active merge-all run ({r_run['run_id']}) is already in progress")
        else:
            # Lease expired: mark failed and reclaim
            now_str = now.strftime("%Y-%m-%d %H:%M:%S")
            db.update("dedup_merge_runs", r_run["run_id"], {
                "status": "failed",
                "errors": json.dumps([{"error": "Lease expired"}]),
                "updated_at": now_str,
            })
            if r_run["run_id"] in _merge_runs:
                _merge_runs[r_run["run_id"]]["status"] = "failed"
            db.commit()

    run_id = run_id or str(uuid.uuid4())
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    plan_items = saved_plan["plan"]
    run = {
        "run_id": run_id,
        "plan_id": plan_id,
        "project_id": project_id,
        "status": "running",
        "total_groups": len(plan_items),
        "processed": 0,
        "merged": 0,
        "failed": 0,
        "skipped_human_decided": saved_plan.get("skip_report", {}).get("skipped_human_decided", 0),
        "merged_group_ids": [],
        "errors": [],
        "pause_requested": False,
        "created_at": now_str,
        "updated_at": now_str,
    }
    _write_run_row(db, run)
    _merge_runs[run_id] = run
    db.commit()

    return _execute_plan_items(db, project_id, plan_items, run, actor, run_id)


def resume_merge_all(project_id: str, run_id: str, db: Optional[DBBackend] = None,
                     actor: str = "user") -> dict:
    """Resume a paused or failed merge-all run."""
    db = db or get_db_backend()
    run = _load_run_from_db(db, run_id)
    if not run:
        run = _merge_runs.get(run_id)
    if not run:
        raise ValueError(f"Run {run_id} not found")
    if run.get("project_id") != project_id:
        raise ValueError("Run does not belong to this project")
    if run.get("status") not in ("paused", "failed"):
        raise ValueError(f"Cannot resume run with status '{run.get('status')}'; must be 'paused' or 'failed'")

    plan_id = run.get("plan_id")
    saved_plan = _load_plan(db, plan_id)
    if not saved_plan:
        raise StalePlanError(f"Original plan {plan_id} not found")

    merged_ids = set(run.get("merged_group_ids") or [])
    remaining_items = [item for item in saved_plan["plan"] if item["group_id"] not in merged_ids]

    strategy = saved_plan["plan"][0].get("master_strategy", "most_complete") if saved_plan["plan"] else "most_complete"
    current_plan, _ = _build_plan_items(db, project_id, strategy)
    if _plan_fingerprint(remaining_items) != _plan_fingerprint(current_plan):
        raise StalePlanError("Plan is stale; remaining study data or groups have changed")

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    run["status"] = "running"
    run["failed"] = 0
    run["processed"] = run.get("merged", 0)
    run["errors"] = []
    run["pause_requested"] = False
    run["updated_at"] = now_str
    _write_run_row(db, run)
    _merge_runs[run_id] = run
    db.commit()

    return _execute_plan_items(db, project_id, remaining_items, run, actor, run_id)


def resolve_duplicate_decision(
    project_id: str,
    action: str,  # "keep_primary", "keep_both", "merge_metadata", "revert_duplicate"
    primary_study_id: str,
    duplicate_study_id: Optional[str] = None,
    group_id: Optional[str] = None,
    merged_fields: Optional[dict] = None,
    db: Optional[DBBackend] = None,
) -> dict:
    """Resolve duplicate review decision for a pair or group of studies.
    
    Actions:
      - 'keep_primary': Marks duplicate_study_id as duplicate (is_duplicate=1, excluded)
                        and ensures primary_study_id is not marked as duplicate (is_duplicate=0).
      - 'keep_both': Reversibly unmarks duplicate_study_id (is_duplicate=0, screening_status='pending',
                     screening_reason='', duplicate_of_study_id=''). Both records are retained.
      - 'merge_metadata': Keeps primary_study_id, applies non-empty/chosen fields from duplicate
                          (or merged_fields payload) to primary, and marks duplicate_study_id as duplicate.
      - 'revert_duplicate': Alias for keep_both (reversible duplicate marking).
    
    Every action writes a dedup_audit row (dedup_plan §3.4).
    """
    db = db or get_db_backend()

    if action not in ("keep_primary", "keep_both", "merge_metadata", "revert_duplicate"):
        raise ValueError(f"Invalid action: {action}")
    if not primary_study_id:
        raise ValueError("primary_study_id is required")
    if duplicate_study_id and primary_study_id == duplicate_study_id:
        raise ValueError("primary_study_id and duplicate_study_id cannot be the same")
    if not duplicate_study_id and not group_id:
        raise ValueError("duplicate_study_id or group_id is required")

    primary = db.query("studies", {"study_id": primary_study_id, "project_id": project_id})
    if not primary:
        raise ValueError(f"Primary study {primary_study_id} not found in project {project_id}")
    primary_row = primary[0]

    dup_row = None
    if duplicate_study_id:
        dup = db.query("studies", {"study_id": duplicate_study_id, "project_id": project_id})
        if not dup:
            raise ValueError(f"Duplicate study {duplicate_study_id} not found in project {project_id}")
        dup_row = dup[0]

    if action in ("keep_both", "revert_duplicate"):
        # Unmark duplicate - reversible
        if duplicate_study_id:
            updates = {
                "is_duplicate": 0,
                "duplicate_of_study_id": "",
            }
            # Only reset status to pending if it was excluded by dedup
            if not dup_row or dup_row.get("screening_stage") == "dedup":
                updates["screening_status"] = "pending"
                updates["screening_reason"] = ""
                updates["screening_stage"] = ""
            db.update("studies", duplicate_study_id, updates)
        if group_id:
            # Also ensure primary is clear
            db.update("studies", primary_study_id, {
                "is_duplicate": 0,
                "duplicate_of_study_id": "",
            })
        _write_audit(db, project_id, group_id or "", "", 0.0,
                     primary_study_id, duplicate_study_id or "", "keep_both", "human")
        db.commit()
        return {
            "status": "success",
            "action": action,
            "message": f"Study {duplicate_study_id or primary_study_id} restored as non-duplicate (reversible).",
            "primary_study_id": primary_study_id,
            "duplicate_study_id": duplicate_study_id,
        }

    elif action == "keep_primary":
        # Keep primary record, mark duplicate record as duplicate
        db.update("studies", primary_study_id, {
            "is_duplicate": 0,
            "duplicate_of_study_id": "",
        })
        if duplicate_study_id:
            db.update("studies", duplicate_study_id, {
                "is_duplicate": 1,
                "duplicate_of_study_id": primary_study_id,
                "duplicate_group_id": group_id or primary_row.get("duplicate_group_id") or str(uuid.uuid4()),
                "screening_status": "excluded",
                "screening_reason": "Duplicate publication",
                "screening_stage": "dedup",
            })
            _write_audit(db, project_id, group_id or "", "", 0.0,
                         primary_study_id, duplicate_study_id, "accept_merge", "human")
        db.commit()
        return {
            "status": "success",
            "action": "keep_primary",
            "message": f"Kept primary study {primary_study_id}; marked {duplicate_study_id} as duplicate.",
            "primary_study_id": primary_study_id,
            "duplicate_study_id": duplicate_study_id,
        }

    elif action == "merge_metadata":
        # Merge fields from duplicate or custom payload into primary study
        updates: dict = {}
        fields_to_check = ["doi", "pmid", "abstract", "authors", "publication_year", "journal", "study_design"]
        
        if merged_fields and isinstance(merged_fields, dict):
            for f in fields_to_check:
                if f in merged_fields and merged_fields[f] not in (None, ""):
                    updates[f] = merged_fields[f]
        elif dup_row:
            # Auto-fill missing fields on primary from duplicate
            for f in fields_to_check:
                p_val = primary_row.get(f)
                d_val = dup_row.get(f)
                if (p_val is None or p_val == "" or p_val == 0) and d_val not in (None, "", 0):
                    updates[f] = d_val
                # If duplicate has longer/more detailed abstract, can preserve
                if f == "abstract" and len(str(d_val or "")) > len(str(p_val or "")):
                    updates["abstract"] = d_val

        if updates:
            db.update("studies", primary_study_id, updates)

        db.update("studies", primary_study_id, {
            "is_duplicate": 0,
            "duplicate_of_study_id": "",
        })
        if duplicate_study_id:
            db.update("studies", duplicate_study_id, {
                "is_duplicate": 1,
                "duplicate_of_study_id": primary_study_id,
                "duplicate_group_id": group_id or primary_row.get("duplicate_group_id") or str(uuid.uuid4()),
                "screening_status": "excluded",
                "screening_reason": "Duplicate publication (merged into primary)",
                "screening_stage": "dedup",
            })
            _write_audit(db, project_id, group_id or "", "", 0.0,
                         primary_study_id, duplicate_study_id, "accept_merge", "human")
        db.commit()
        return {
            "status": "success",
            "action": "merge_metadata",
            "message": f"Merged metadata into primary study {primary_study_id} and marked {duplicate_study_id} as duplicate.",
            "primary_study_id": primary_study_id,
            "duplicate_study_id": duplicate_study_id,
            "updated_fields": list(updates.keys()),
        }

    else:
        raise ValueError(f"Unknown resolution action: {action}")


def merge_all_groups_metadata(
    project_id: str,
    master_strategy: str = "most_complete",
    db: Optional[DBBackend] = None,
    actor: str = "user",
) -> dict:
    """Merge metadata across ALL pending duplicate groups for all studies in the project.
    
    For every candidate duplicate group:
      - Selects the canonical/master study using master_strategy (default 'most_complete').
      - Adopts and merges all non-empty / richer metadata fields (DOI, PMID, abstract,
        authors, year, journal, study_design) from duplicates into the primary study.
      - Reversibly marks duplicates (is_duplicate=1, duplicate_of_study_id=primary_id).
      - Records individual dedup_audit log rows for complete traceability and PRISMA compliance.
    """
    db = db or get_db_backend()
    studies_rows = db.query("studies", {"project_id": project_id})
    studies_by_id = {s["study_id"]: s for s in studies_rows}
    groups = _load_groups(db, project_id, status="pending")
    # If no pending groups exist in dedup_groups, check all groups that have candidate duplicates
    # or dynamically generate candidates if dedup table is empty
    if not groups:
        all_groups = _load_groups(db, project_id)
        # Check if there are groups with candidate duplicates that haven't had their duplicates marked
        unresolved = []
        for g in all_groups:
            # Check if any member other than master is still not marked as duplicate
            unmarked_members = [
                sid for sid in g["members"]
                if sid != g.get("master_study_id") and studies_by_id.get(sid) and not studies_by_id[sid].get("is_duplicate")
            ]
            if len(unmarked_members) > 0:
                unresolved.append(g)
        
        if unresolved:
            groups = unresolved
        else:
            # If no groups in DB at all, run deduplicate_studies to find them
            dedup_run = deduplicate_studies(project_id, auto_mark=False, db=db)
            groups = _load_groups(db, project_id, status="pending")

    # If no pending groups exist, check for groups with unmarked duplicate members
    # or dynamically generate candidate groups if dedup table is empty
    if not groups:
        all_groups = _load_groups(db, project_id)
        unresolved = []
        for g in all_groups:
            unmarked_members = [
                sid for sid in g.get("members", [])
                if sid != g.get("master_study_id") and studies_by_id.get(sid) and not studies_by_id[sid].get("is_duplicate")
            ]
            if len(unmarked_members) > 0:
                unresolved.append(g)

        if unresolved:
            groups = unresolved
        else:
            deduplicate_studies(project_id, auto_mark=False, db=db)
            groups = _load_groups(db, project_id, status="pending")
            studies_rows = db.query("studies", {"project_id": project_id})
            studies_by_id = {s["study_id"]: s for s in studies_rows}

    merged_groups_count = 0
    total_duplicates_merged = 0
    all_updated_fields: dict[str, list[str]] = {}

    for g in groups:
        member_ids = [sid for sid in g["members"] if sid in studies_by_id]
        if len(member_ids) < 2:
            continue
        members = [studies_by_id[sid] for sid in member_ids]
        master = _select_master(members, master_strategy)
        master_id = master["study_id"]
        group_id = g["group_id"]

        for dup in members:
            dup_id = dup["study_id"]
            if dup_id == master_id:
                continue
            res = resolve_duplicate_decision(
                project_id=project_id,
                action="merge_metadata",
                primary_study_id=master_id,
                duplicate_study_id=dup_id,
                group_id=group_id,
                db=db,
            )
            total_duplicates_merged += 1
            if res.get("updated_fields"):
                all_updated_fields[master_id] = res["updated_fields"]

        db.update("dedup_groups", group_id, {
            "status": "accepted",
            "master_study_id": master_id,
            "decided_by": actor,
            "decided_at": datetime.utcnow().isoformat(),
        })
        merged_groups_count += 1

    db.commit()
    return {
        "status": "success",
        "action": "merge_all_metadata",
        "project_id": project_id,
        "merged_groups_count": merged_groups_count,
        "total_duplicates_merged": total_duplicates_merged,
        "updated_studies": all_updated_fields,
        "message": f"Successfully merged metadata across all {merged_groups_count} duplicate groups ({total_duplicates_merged} duplicate records processed).",
    }

