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

import uuid
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend

from functools import lru_cache

TITLE_SIMILARITY_THRESHOLD = 0.90

# Try python-Levenshtein (fast C extension), fall back to difflib with length bound pre-check
try:
    from Levenshtein import ratio as _lev_ratio

    @lru_cache(maxsize=2048)
    def _title_similarity(a: str, b: str) -> float:
        if a == b:
            return 1.0
        la, lb = len(a), len(b)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        # Fast path: Mathematical upper bound on Levenshtein ratio based on string lengths.
        # Evaluated BEFORE lowercasing to skip string allocations for dissimilar titles.
        min_len = la if la < lb else lb
        if (2 * min_len) / (la + lb) < TITLE_SIMILARITY_THRESHOLD:
            return 0.0

        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0

        la, lb = len(a_lower), len(b_lower)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        min_len = la if la < lb else lb
        max_ratio = (2 * min_len) / (la + lb)
        if max_ratio < TITLE_SIMILARITY_THRESHOLD:
            return 0.0

        return _lev_ratio(a_lower, b_lower)
except ImportError:
    import difflib
    from collections import Counter

    @lru_cache(maxsize=2048)
    def _title_similarity(a: str, b: str) -> float:
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
        if (2 * min_len) / (la + lb) < TITLE_SIMILARITY_THRESHOLD:
            return 0.0

        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0

        # Fast path 3: Multiset character count upper bound on SequenceMatcher ratio.
        # SequenceMatcher finds matching contiguous blocks, so total matched characters M
        # can never exceed the sum of min character frequencies shared between both strings:
        # M <= sum((Counter(a_lower) & Counter(b_lower)).values()).
        # If 2 * common_chars / (la + lb) < threshold, skip SequenceMatcher calculation completely.
        common_chars = sum((Counter(a_lower) & Counter(b_lower)).values())
        if (2 * common_chars) / (la + lb) < TITLE_SIMILARITY_THRESHOLD:
            return 0.0

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
    import re
    t = title.lower().strip()
    # Remove punctuation
    t = re.sub(r"[^\w\s]", " ", t)
    # Collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _normalize_authors(authors: str) -> set[str]:
    """Extract a set of author last names for comparison."""
    if not authors:
        return set()
    import re
    # Split on common delimiters
    parts = re.split(r"[,;]&]", authors)
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


def _author_overlap(a1: str, a2: str) -> float:
    """Compute author name overlap ratio."""
    s1 = _normalize_authors(a1)
    s2 = _normalize_authors(a2)
    if not s1 or not s2:
        return 0.0
    overlap = s1 & s2
    return len(overlap) / min(len(s1), len(s2))


def deduplicate_studies(project_id: str, auto_mark: bool = True, db: Optional[DBBackend] = None) -> dict:
    """Detect and optionally mark duplicate studies in a project.

    Args:
        project_id: The project to deduplicate.
        auto_mark: If True, mark duplicates in the studies table
                   (is_duplicate, duplicate_of_study_id, duplicate_group_id).

    Returns:
        Dict with:
          - project_id
          - total_studies
          - duplicate_groups: list of groups, each with canonical + duplicates
          - total_duplicates: count of duplicate studies
          - duplicates_marked: count actually marked in DB
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
        }

    # Build normalized lookup structures
    doi_map: dict[str, list[int]] = {}  # normalized_doi -> study indices
    pmid_map: dict[str, list[int]] = {}
    norm_titles: list[str] = []
    norm_dois: list[str] = []
    norm_pmids: list[str] = []

    for i, s in enumerate(studies):
        ndoi = _normalize_doi(s.get("doi", ""))
        npmid = _normalize_pmid(s.get("pmid", ""))
        ntitle = _normalize_title(s.get("title", ""))
        norm_titles.append(ntitle)
        norm_dois.append(ndoi)
        norm_pmids.append(npmid)
        if ndoi:
            doi_map.setdefault(ndoi, []).append(i)
        if npmid:
            pmid_map.setdefault(npmid, []).append(i)

    # Union-Find for grouping
    parent = list(range(len(studies)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # Strategy 1: DOI exact match
    for doi, indices in doi_map.items():
        for j in range(1, len(indices)):
            union(indices[0], indices[j])

    # Strategy 2: PMID exact match
    for pmid, indices in pmid_map.items():
        for j in range(1, len(indices)):
            union(indices[0], indices[j])

    # Strategy 3: case-insensitive exact title
    exact_titles: dict[str, list[int]] = {}
    for i, study in enumerate(studies):
        exact = (study.get("title") or "").strip().casefold()
        if exact:
            exact_titles.setdefault(exact, []).append(i)
    for indices in exact_titles.values():
        for j in range(1, len(indices)):
            union(indices[0], indices[j])

    # Strategy 4: alphanumeric title + first author surname + year
    author_year: dict[tuple, list[int]] = {}
    for i, study in enumerate(studies):
        alnum = "".join(ch for ch in (study.get("title") or "").lower() if ch.isalnum())
        first = ""
        authors = study.get("authors") or ""
        if authors:
            first = authors.split(",")[0].split(";")[0].strip().split()
            first = first[0].lower() if first else ""
        year = study.get("publication_year")
        if alnum and first and year:
            author_year.setdefault((alnum, first, year), []).append(i)
    for indices in author_year.values():
        for j in range(1, len(indices)):
            union(indices[0], indices[j])

    # Strategy 3: Title similarity + author/year
    titles = [s.get("title", "") for s in studies]
    years = [s.get("publication_year") for s in studies]
    authors = [s.get("authors", "") for s in studies]

    for i in range(len(studies)):
        t_i = titles[i]
        if not t_i:
            continue
        y_i = years[i]
        a_i = authors[i]

        for j in range(i + 1, len(studies)):
            if find(i) == find(j):
                continue  # already grouped

            t_j = titles[j]
            if not t_j:
                continue

            sim = _title_similarity(t_i, t_j)

            if sim >= TITLE_SIMILARITY_THRESHOLD:
                # Strong title match — check author/year as secondary signal
                y_j = years[j]
                year_match = (
                    y_i is not None
                    and y_j is not None
                    and y_i == y_j
                )
                author_sim = _author_overlap(a_i, authors[j])

                # If title is very similar (>0.95), group regardless
                # If title is 0.90-0.95, require either year match or author overlap > 0.3
                if sim >= 0.95 or year_match or author_sim > 0.3:
                    union(i, j)

    # Build groups from union-find
    groups: dict[int, list[int]] = {}
    for i in range(len(studies)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    # Filter to only groups with duplicates (size > 1)
    dup_groups = []
    for root, indices in groups.items():
        if len(indices) < 2:
            continue
        # Canonical = first by created_at (already sorted)
        canonical_idx = indices[0]
        canonical = studies[canonical_idx]
        group_id = str(uuid.uuid4())

        duplicates = []
        for idx in indices[1:]:
            s = studies[idx]
            # Determine match reason
            match_reason = "title_similarity"
            sim_score = _title_similarity(
                canonical.get("title", ""),
                s.get("title", ""),
            )

            ndoi_c = _normalize_doi(canonical.get("doi", ""))
            ndoi_s = _normalize_doi(s.get("doi", ""))
            if ndoi_c and ndoi_s and ndoi_c == ndoi_s:
                match_reason = "doi"
                sim_score = 1.0
            else:
                npmid_c = _normalize_pmid(canonical.get("pmid", ""))
                npmid_s = _normalize_pmid(s.get("pmid", ""))
                if npmid_c and npmid_s and npmid_c == npmid_s:
                    match_reason = "pmid"
                    sim_score = 1.0
                elif sim_score >= 0.95:
                    match_reason = "title_similarity"
                else:
                    # Check if author/year contributed
                    year_match = (
                        canonical.get("publication_year")
                        and s.get("publication_year")
                        and canonical["publication_year"] == s["publication_year"]
                    )
                    if year_match:
                        match_reason = "author_year"

            duplicates.append({
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
                "match_reason": match_reason,
                "similarity_score": round(sim_score, 4),
            })

        dup_groups.append({
            "group_id": group_id,
            "canonical_study_id": canonical["study_id"],
            "canonical_title": canonical.get("title", ""),
            "canonical_doi": canonical.get("doi", ""),
            "canonical_pmid": canonical.get("pmid", ""),
            "canonical_authors": canonical.get("authors", ""),
            "canonical_year": canonical.get("publication_year"),
            "canonical_journal": canonical.get("journal", ""),
            "canonical_abstract": canonical.get("abstract", ""),
            "canonical_is_duplicate": canonical.get("is_duplicate", 0),
            "canonical_screening_status": canonical.get("screening_status", "pending"),
            "duplicates": duplicates,
        })

    # Mark duplicates in DB if requested
    duplicates_marked = 0
    if auto_mark and dup_groups:
        for g in dup_groups:
            for d in g["duplicates"]:
                db.update("studies", d["study_id"], {
                    "is_duplicate": 1,
                    "duplicate_of_study_id": g["canonical_study_id"],
                    "duplicate_group_id": g["group_id"],
                    "screening_status": "excluded",
                    "screening_reason": "Duplicate publication",
                    "screening_stage": "dedup",
                })
                d["is_duplicate"] = 1
                d["screening_status"] = "excluded"
                duplicates_marked += 1
        db.commit()

    total_dups = sum(len(g["duplicates"]) for g in dup_groups)

    return {
        "project_id": project_id,
        "total_studies": len(studies),
        "duplicate_groups": dup_groups,
        "total_duplicates": total_dups,
        "duplicates_marked": duplicates_marked,
    }


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



