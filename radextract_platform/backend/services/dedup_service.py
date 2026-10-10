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
        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0
        return _lev_ratio(a_lower, b_lower)
except ImportError:
    import difflib

    @lru_cache(maxsize=2048)
    def _title_similarity(a: str, b: str) -> float:
        # Fast path 1: Exact string identity
        if a == b:
            return 1.0
        a_lower, b_lower = a.lower(), b.lower()
        if a_lower == b_lower:
            return 1.0

        la, lb = len(a_lower), len(b_lower)
        if not la or not lb:
            return 1.0 if la == lb else 0.0

        # Fast path 2: Mathematical upper bound on Levenshtein / SequenceMatcher ratio.
        # SequenceMatcher ratio is defined as 2 * M / (la + lb), where M <= min(la, lb).
        # Thus, max possible ratio = 2 * min(la, lb) / (la + lb).
        # If this bound is below TITLE_SIMILARITY_THRESHOLD (0.90), difflib calculation can be safely skipped.
        min_len = la if la < lb else lb
        max_ratio = (2 * min_len) / (la + lb)
        if max_ratio < TITLE_SIMILARITY_THRESHOLD:
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

    # Strategy 3: Title similarity + author/year
    for i in range(len(studies)):
        for j in range(i + 1, len(studies)):
            if find(i) == find(j):
                continue  # already grouped

            sim = _title_similarity(
                studies[i].get("title", ""),
                studies[j].get("title", ""),
            )

            if sim >= TITLE_SIMILARITY_THRESHOLD:
                # Strong title match — check author/year as secondary signal
                year_match = (
                    studies[i].get("publication_year")
                    and studies[j].get("publication_year")
                    and studies[i]["publication_year"] == studies[j]["publication_year"]
                )
                author_sim = _author_overlap(
                    studies[i].get("authors", ""),
                    studies[j].get("authors", ""),
                )

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
                "match_reason": match_reason,
                "similarity_score": round(sim_score, 4),
            })

        dup_groups.append({
            "group_id": group_id,
            "canonical_study_id": canonical["study_id"],
            "canonical_title": canonical.get("title", ""),
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
                })
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


