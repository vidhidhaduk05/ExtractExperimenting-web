"""Zoplicate-style duplicate candidate finder for systematic review studies.

Port of Zoplicate 5.1.1's DuplicateFinder cascade (src/db/duplicateFinder.ts)
and its shared utils (cleanDOI / normalizeString / cleanCreator) to Python +
SQL-backed studies, implementing the tiered matching cascade from
dedup_plan.md §2:

  T0  Identical normalized DOI, or identical PMID/PMCID/NCT      -> auto-merge
  T1  Exact normalized title AND first-author surname AND yr ±1  -> auto-merge
  T2  Fuzzy title (Jaro-Winkler >= 0.90) AND >= 1 corroboration  -> auto-merge
  T3  Fuzzy title alone, or conflicting identifiers              -> review

Hard rules (dedup_plan §2, fixes H9 + F7):
  - Never merge on title similarity alone (every auto-merge needs an
    identifier or a second corroborating signal).
  - Never merge records with conflicting identifiers -> review queue.
  - Pairs where either record has a human screening decision are never
    auto-merged -> review queue regardless of score.
  - Merge groups are capped at 5 records; larger chains -> review queue.
  - Pairs recorded in the non_duplicates memory are never candidates again.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from itertools import combinations
from typing import Callable

TITLE_SIMILARITY_THRESHOLD = 0.90   # Jaro-Winkler floor for T2
AUTHOR_OVERLAP_THRESHOLD = 0.50     # corroboration threshold for T2
YEAR_WINDOW = 1                     # T1 allows year ±1
GROUP_SIZE_CAP = 5                  # transitivity-chain cap (dedup_plan §2)

# Zoplicate normalizeString: letters only, everything else collapses.
_NON_LETTER_RE = re.compile(r"[^a-z]+")
_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]")
# DOI validation (Zotero.Utilities.cleanDOI semantics: registrant code is
# 4-9 digits, so malformed strings like "10.1/x" are not treated as DOIs)
_DOI_RE = re.compile(r"10\.\d{4,9}/\S+")
# Clinical-trial registration IDs (NCT) — often only present in abstract text
_NCT_RE = re.compile(r"NCT\d{8}")
# Common title abbreviations to standardize (dedup_plan §1): "vs" expands
# rather than vanishes — dropping it erases the comparison the title makes.
_VS_RE = re.compile(r"\bvs\.?\b")
_ETAL_RE = re.compile(r"\bet al\.?\b")
_PMID_PREFIX_RE = re.compile(r"^\s*(?:PMID|pmid)\s*:?\s*")
_PMC_PREFIX_RE = re.compile(r"^\s*(?:PMCID|pmcid|PMC)\s*:?\s*")
_DOI_PREFIX_RE = re.compile(
    r"^\s*(?:https?://(?:dx\.)?doi\.org/|doi:\s*|info:doi/|doi\.org/)", re.IGNORECASE
)

# Words ignored when picking the "most significant" title words for blocking
_STOPWORDS = {
    "the", "a", "an", "of", "for", "in", "on", "and", "or", "to", "with",
    "without", "at", "by", "from", "is", "are", "was", "were", "study",
    "trial", "randomized", "controlled", "systematic", "review", "analysis",
}

# Known secondary-report article types (dedup_plan §2 T4): records matching
# these are proposals for same-study grouping, never auto-merged (H9).
_SECONDARY_REPORT_RE = re.compile(
    r"\bprotocol\b|\bstudy protocol\b|\bsubgroup\b|\bsecondary (?:analysis|results|outcomes?)\b"
    r"|\bfollow[- ]?up\b|\bextended (?:report|analysis|follow)\b|\binterim (?:analysis|results)\b"
    r"|\bconference (?:abstract|paper)\b|\babstract\b|\bpreprint\b|\bpilot (?:study|results)\b",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────────────────────────────────
# Normalization layer (dedup_plan §1) — port of Zoplicate shared/utils.ts
# ─────────────────────────────────────────────────────────────────────────

def _strip_diacritics(text: str) -> str:
    """Fold unicode diacritics to base ASCII letters (NFKD -> combining strip)."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def clean_doi(doi: str) -> str:
    """Port of Zoplicate cleanDOI: strip url/doi prefixes, validate, lowercase.

    Returns "" when the string does not contain a valid DOI.
    """
    if not doi:
        return ""
    d = _strip_diacritics(str(doi)).strip()
    d = _DOI_PREFIX_RE.sub("", d).strip()
    m = _DOI_RE.search(d)
    if not m:
        return ""
    return m.group(0).strip(".").lower().rstrip(".,;")


def normalize_string(input: str, wildcard: str = " ") -> str:
    """Port of Zoplicate normalizeString: keep letters only, fold diacritics.

    Non-letter characters collapse to a single wildcard (default space);
    result is uppercased like the original.
    """
    if not input:
        return ""
    folded = _strip_diacritics(str(input)).lower()
    return _NON_LETTER_RE.sub(wildcard, folded).strip().upper()


def normalize_title(title: str) -> str:
    """Dedup-plan §1 title normalization: lowercase, strip punctuation and
    diacritics, collapse whitespace, standardize common abbreviations."""
    if not title:
        return ""
    t = _strip_diacritics(str(title)).lower().strip()
    t = _VS_RE.sub(" versus ", t)
    t = _ETAL_RE.sub(" ", t)
    t = _PUNCT_RE.sub(" ", t)
    return _WHITESPACE_RE.sub(" ", t).strip()


def normalize_id(value: str) -> str:
    """Normalize PMID/PMCID: strip 'PMID:'/'PMC' prefixes and whitespace
    (fixes 'PMID:12345' vs '12345' false-splits)."""
    if not value:
        return ""
    v = _strip_diacritics(str(value)).strip()
    v = _PMID_PREFIX_RE.sub("", v)
    v = _PMC_PREFIX_RE.sub("", v)
    return v.replace(" ", "").lower()


def extract_nct_ids(text: str) -> set[str]:
    """Extract clinical-trial registration IDs (NCT########) from free text."""
    if not text:
        return set()
    return set(_NCT_RE.findall(str(text).upper()))


def clean_creator(name: str) -> str:
    """Port of Zoplicate cleanCreator: normalized surname for an author string
    like 'Smith J' or 'Smith, John A'. Returns lowercase surname."""
    if not name:
        return ""
    n = _strip_diacritics(str(name)).strip()
    n = _PUNCT_RE.sub(" ", n)
    parts = _WHITESPACE_RE.sub(" ", n).strip().split(" ")
    return parts[0].lower() if parts else ""


def normalize_authors(authors: str) -> set[str]:
    """Set of normalized surnames from a delimited author string."""
    if not authors:
        return set()
    parts = re.split(r"[,;&]", str(authors))
    return {clean_creator(p) for p in parts if clean_creator(p)}


def author_overlap(a1: str, a2: str) -> float:
    """Overlap ratio between two author strings (|intersection| / min size)."""
    s1 = normalize_authors(a1)
    s2 = normalize_authors(a2)
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / min(len(s1), len(s2))


def jaro_winkler(s1: str, s2: str, prefix_scale: float = 0.1) -> float:
    """Pure-Python Jaro-Winkler similarity on already-normalized strings.

    Callers pass normalized text (normalize_title keeps digits, so
    "Drug 1" vs "Drug 2" stay distinct); no letter-only folding here.
    """
    j1, j2 = str(s1 or ""), str(s2 or "")
    if j1 == j2:
        return 1.0
    len1, len2 = len(j1), len(j2)
    if not len1 or not len2:
        return 0.0
    match_dist = max(max(len1, len2) // 2 - 1, 0)
    j1_matches = [False] * len1
    j2_matches = [False] * len2
    matches = 0
    transpositions = 0
    for i in range(len1):
        start = max(0, i - match_dist)
        end = min(i + match_dist + 1, len2)
        for j in range(start, end):
            if j2_matches[j]:
                continue
            if j1[i] != j2[j]:
                continue
            j1_matches[i] = True
            j2_matches[j] = True
            matches += 1
            break
    if matches == 0:
        return 0.0
    k = 0
    for i in range(len1):
        if not j1_matches[i]:
            continue
        while not j2_matches[k]:
            k += 1
        if j1[i] != j2[k]:
            transpositions += 1
        k += 1
    jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
    # Winkler prefix bonus (up to 4 shared prefix chars)
    prefix = 0
    for a, b in zip(j1, j2):
        if a != b or prefix == 4:
            break
        prefix += 1
    return jaro + prefix * prefix_scale * (1 - jaro)


def title_fuzzy_similarity(t1: str, t2: str) -> float:
    """Fuzzy title similarity used by T2 (Jaro-Winkler on normalized titles)."""
    return jaro_winkler(normalize_title(t1 or ""), normalize_title(t2 or ""))


# ─────────────────────────────────────────────────────────────────────────
# Candidate generation — cascading, blocked (no O(n²) all-pairs scan)
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class CandidatePair:
    study_id_a: str
    study_id_b: str
    tier: str                 # "T0" | "T1" | "T2" | "T3" | "conflict" | "human_review"
    score: float
    reason: str               # "doi" | "pmid" | "nct" | "exact_title_author_year" | ...
    auto_mergeable: bool = False
    signals: dict = field(default_factory=dict)


def _first_author_surname(authors: str) -> str:
    """Surname of the actual first-listed author (order matters: the
    alphabetic minimum would equate 'Smith J; Adams K' with 'Adams K; Smith J')."""
    if not authors:
        return ""
    for part in re.split(r"[,;&]", str(authors)):
        surname = clean_creator(part)
        if surname:
            return surname
    return ""


def _parse_year(value) -> int | None:
    """Total year parser: accepts int, '2023', '2022-2023' (first year),
    'in press' / garbage -> None. Never raises."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    m = re.search(r"\d{4}", str(value))
    return int(m.group(0)) if m else None


def _numeric_tokens_differ(t1: str, t2: str) -> bool:
    """True when two similar titles disagree on embedded numbers
    ('Drug 1 in adults' vs 'Drug 2 in adults') — a classic false-merge
    that Jaro-Winkler scores ~0.98. Such pairs go to review, never auto."""
    return re.findall(r"\d+", t1 or "") != re.findall(r"\d+", t2 or "")


def _title_block_keys(title: str) -> set[str]:
    """Blocking key: first 6 significant title words (dedup_plan §2).
    Falls back to the raw first 6 words when all words are stopwords."""
    words = [w for w in normalize_title(title).split() if w]
    if not words:
        return set()
    significant = [w for w in words if w not in _STOPWORDS] or words
    return {" ".join(significant[:6])}


def _conflicting_identifiers(a: dict, b: dict) -> bool:
    """Both records carry a valid identifier and they disagree."""
    doi_a, doi_b = clean_doi(a.get("doi", "")), clean_doi(b.get("doi", ""))
    if doi_a and doi_b and doi_a != doi_b:
        return True
    pmid_a, pmid_b = normalize_id(a.get("pmid", "")), normalize_id(b.get("pmid", ""))
    if pmid_a and pmid_b and pmid_a != pmid_b:
        return True
    return False


def _is_secondary_report(study: dict) -> bool:
    """True when the title marks the record as a protocol / subgroup /
    secondary analysis / follow-up report — a same-study-different-report
    signal (T4), never an auto-merge (H9)."""
    return bool(_SECONDARY_REPORT_RE.search(study.get("title") or ""))


def find_candidate_pairs(
    studies: list[dict],
    human_decided_ids: set[str] | None = None,
    non_duplicate_pairs: set[tuple[str, str]] | None = None,
    title_threshold: float = TITLE_SIMILARITY_THRESHOLD,
    author_threshold: float = AUTHOR_OVERLAP_THRESHOLD,
    title_similarity: Callable[[str, str], float] | None = None,
) -> list[CandidatePair]:
    """Cascading candidate generation (Zoplicate DuplicateFinder pattern).

    Stage 1 (T0): normalized DOI / PMID / NCT exact match — identifier merge.
    Stage 2 (T1): exact normalized title + first-author surname + year ±1.
    Stage 3 (T2): fuzzy title (JW >= 0.90) + >= 1 corroboration
                  (author overlap >= 0.5 | same year | same journal),
                  via blocking keys (year-bucket x surname-initial) and
                  (first 6 title words) — never an all-pairs scan.

    Returns pairs tagged with tier/reason; auto_mergeable=False marks
    review-queue pairs (conflicts, human-decided records, title-only hits).
    """
    human_decided_ids = human_decided_ids or set()
    non_duplicate_pairs = non_duplicate_pairs or set()

    def _pair_key(id_a: str, id_b: str) -> tuple[str, str]:
        return (id_a, id_b) if id_a < id_b else (id_b, id_a)

    def _excluded(id_a: str, id_b: str) -> bool:
        return _pair_key(id_a, id_b) in non_duplicate_pairs

    ids = [s["study_id"] for s in studies]

    # ── Indexes (blocked lookups, Zoplicate style) ──
    doi_map: dict[str, list[int]] = {}
    pmid_map: dict[str, list[int]] = {}
    nct_map: dict[str, list[int]] = {}
    exact_title_map: dict[str, list[int]] = {}
    year_surname_block: dict[tuple, list[int]] = {}
    title_words_block: dict[str, list[int]] = {}

    norm_titles: list[str] = []
    for i, s in enumerate(studies):
        ndoi = clean_doi(s.get("doi", ""))
        npmid = normalize_id(s.get("pmid", ""))
        ntitle = normalize_title(s.get("title", ""))
        norm_titles.append(ntitle)
        if ndoi:
            doi_map.setdefault(ndoi, []).append(i)
        if npmid:
            pmid_map.setdefault(npmid, []).append(i)
        for nct in extract_nct_ids(
            f"{s.get('doi', '')} {s.get('title', '')} {s.get('abstract', '')}"
        ):
            nct_map.setdefault(nct, []).append(i)
        if ntitle:
            exact_title_map.setdefault(ntitle, []).append(i)
        year = _parse_year(s.get("publication_year"))
        surname = _first_author_surname(s.get("authors", ""))
        if year is not None and surname:
            # bucket both y and y±1 so ±1 neighbours share a block
            for yy in (year - 1, year, year + 1):
                year_surname_block.setdefault((yy // 2, surname[:3]), []).append(i)
        for key in _title_block_keys(s.get("title", "")):
            title_words_block.setdefault(key, []).append(i)

    found: dict[tuple[str, str], CandidatePair] = {}

    def _add(i: int, j: int, tier: str, score: float, reason: str,
             auto: bool, signals: dict | None = None):
        key = _pair_key(ids[i], ids[j])
        if key in found or _excluded(ids[i], ids[j]):
            return
        found[key] = CandidatePair(
            study_id_a=key[0], study_id_b=key[1],
            tier=tier, score=score, reason=reason,
            auto_mergeable=auto, signals=signals or {},
        )

    def _blocked_by_human(i: int, j: int) -> bool:
        return studies[i]["study_id"] in human_decided_ids or \
            studies[j]["study_id"] in human_decided_ids

    # ── Stage 1 (T0): identifier exact match ──
    for index_map, reason in ((doi_map, "doi"), (pmid_map, "pmid"), (nct_map, "nct")):
        for members in index_map.values():
            for pos in range(1, len(members)):
                i, j = members[0], members[pos]
                if _blocked_by_human(i, j):
                    _add(i, j, "human_review", 1.0, reason, auto=False,
                         signals={"blocked": "human_decision"})
                    continue
                if _conflicting_identifiers(studies[i], studies[j]):
                    # identical on one identifier, contradictory on another
                    # (e.g. same DOI but different PMIDs) -> never auto-merge
                    _add(i, j, "conflict", 1.0, f"{reason}_conflicting_ids",
                         auto=False, signals={"matched_on": reason})
                    continue
                if reason == "nct":
                    # Shared trial registration ID groups records of the same
                    # study but does not prove two publications are the same
                    # document (protocol vs results) -> review-only.
                    _add(i, j, "T0", 1.0, reason, auto=False,
                         signals={"review_only": "nct_registration"})
                    continue
                _add(i, j, "T0", 1.0, reason, auto=True)

    # ── Stage 2 (T1): exact title + first-author surname + year ±1 ──
    years = [s.get("publication_year") for s in studies]
    surnames = [_first_author_surname(s.get("authors", "")) for s in studies]
    for members in exact_title_map.values():
        for pos in range(1, len(members)):
            i, j = members[0], members[pos]
            if not surnames[i] or surnames[i] != surnames[j]:
                continue  # title alone is never enough (H9)
            y_i, y_j = _parse_year(years[i]), _parse_year(years[j])
            if y_i is None or y_j is None or abs(y_i - y_j) > YEAR_WINDOW:
                continue
            if _conflicting_identifiers(studies[i], studies[j]):
                _add(i, j, "conflict", 1.0, "exact_title_conflicting_ids", auto=False)
                continue
            if _is_secondary_report(studies[i]) or _is_secondary_report(studies[j]):
                _add(i, j, "T4", 0.99, "same_study_different_report", auto=False)
                continue
            if _blocked_by_human(i, j):
                _add(i, j, "human_review", 1.0, "exact_title_author_year",
                     auto=False, signals={"blocked": "human_decision"})
                continue
            _add(i, j, "T1", 0.99, "exact_title_author_year", auto=True)

    # ── Stage 3 (T2): fuzzy title + corroboration, via blocking ──
    candidate_blocks: set[tuple[int, int]] = set()
    for members in year_surname_block.values():
        for pos_i in range(len(members)):
            for pos_j in range(pos_i + 1, len(members)):
                candidate_blocks.add((members[pos_i], members[pos_j]))
    for members in title_words_block.values():
        if len(members) > 30:
            continue  # Preserve the web branch's cap on generic title buckets.
        for pos_i in range(len(members)):
            for pos_j in range(pos_i + 1, len(members)):
                candidate_blocks.add((members[pos_i], members[pos_j]))

    journals = [(s.get("journal") or "").strip().lower() for s in studies]
    for i, j in candidate_blocks:
        if i == j or not norm_titles[i] or not norm_titles[j]:
            continue
        key = _pair_key(ids[i], ids[j])
        if key in found or _excluded(ids[i], ids[j]):
            continue
        sim = jaro_winkler(norm_titles[i], norm_titles[j])
        if title_similarity is not None:
            # Keep the web slider's title metric; retain related-report
            # proposals for individual review even when their suffix differs.
            related_report = (_is_secondary_report(studies[i]) or _is_secondary_report(studies[j]))
            if not related_report or _conflicting_identifiers(studies[i], studies[j]):
                sim = title_similarity(norm_titles[i], norm_titles[j])
        if sim < title_threshold:
            continue
        author_sim = author_overlap(studies[i].get("authors", ""), studies[j].get("authors", ""))
        y_i, y_j = _parse_year(years[i]), _parse_year(years[j])
        same_year = y_i is not None and y_j is not None and y_i == y_j
        same_journal = bool(journals[i]) and journals[i] == journals[j]
        corroborations = sum([author_sim >= author_threshold, same_year, same_journal])
        signals = {
            "jw": round(sim, 4),
            "author_overlap": round(author_sim, 4),
            "same_year": same_year,
            "same_journal": same_journal,
        }
        if corroborations == 0:
            # fuzzy title alone -> review queue, never auto-merge (H9)
            _add(i, j, "T3", sim, "fuzzy_title_only", auto=False, signals=signals)
            continue
        if _numeric_tokens_differ(norm_titles[i], norm_titles[j]):
            # near-identical titles differing in a number ("Drug 1" vs
            # "Drug 2", dose arms, part numbers) score ~0.98 on JW but are
            # usually distinct records -> review, never auto-merge
            _add(i, j, "T3", sim, "numeric_title_mismatch",
                 auto=False, signals=signals)
            continue
        if _conflicting_identifiers(studies[i], studies[j]):
            _add(i, j, "conflict", sim, "fuzzy_title_conflicting_ids",
                 auto=False, signals=signals)
            continue
        if _is_secondary_report(studies[i]) or _is_secondary_report(studies[j]):
            _add(i, j, "T4", sim, "same_study_different_report",
                 auto=False, signals=signals)
            continue
        if _blocked_by_human(i, j):
            _add(i, j, "human_review", sim, "fuzzy_title_corroborated",
                 auto=False, signals={"blocked": "human_decision", **signals})
            continue
        _add(i, j, "T2", sim, "fuzzy_title_corroborated", auto=True, signals=signals)

    return list(found.values())


def build_merge_groups(
    studies: list[dict],
    pairs: list[CandidatePair],
    non_duplicate_pairs: set[tuple[str, str]] | None = None,
) -> tuple[list[list[str]], list[CandidatePair]]:
    """Union-find over auto-mergeable pairs with group-level safety vetoes.

    A merge group asserts that EVERY pair of its members is a duplicate, so
    each group is validated as a whole before it may auto-merge:
      - size cap: groups larger than GROUP_SIZE_CAP are dissolved (transitivity
        chains are where false merges multiply — dedup_plan §2);
      - identifier conflicts: any two members with contradictory DOIs/PMIDs
        dissolve the group, even when the conflicting pair was never a
        candidate (e.g. bridged through a record with a missing DOI);
      - human rejections: any member pair recorded in non_duplicates dissolves
        the group — a rejected indirect pair must not be re-asserted via
        transitivity.

    Returns (auto_groups, review_pairs). Pairs from dissolved groups are
    downgraded to review (auto_mergeable=False).
    """
    id_to_study = {s["study_id"]: s for s in studies}
    non_duplicate_pairs = non_duplicate_pairs or set()
    auto_pairs = [p for p in pairs if p.auto_mergeable]

    def _pair_key(id_a: str, id_b: str) -> tuple[str, str]:
        return (id_a, id_b) if id_a < id_b else (id_b, id_a)

    parent = {s["study_id"]: s["study_id"] for s in studies}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for p in auto_pairs:
        union(p.study_id_a, p.study_id_b)

    groups_by_root: dict[str, list[str]] = {}
    touched = {sid for p in auto_pairs for sid in (p.study_id_a, p.study_id_b)}
    for s in studies:
        if s["study_id"] in touched:
            groups_by_root.setdefault(find(s["study_id"]), []).append(s["study_id"])

    def _dissolve(member_set: set[str], reason: str) -> list[CandidatePair]:
        downgraded = []
        for p in auto_pairs:
            if p.study_id_a in member_set and p.study_id_b in member_set:
                p.auto_mergeable = False
                p.signals = {**p.signals, "dissolved": reason}
                downgraded.append(p)
        return downgraded

    auto_groups: list[list[str]] = []
    review_pairs: list[CandidatePair] = []
    for members in groups_by_root.values():
        member_set = set(members)
        if len(members) > GROUP_SIZE_CAP:
            review_pairs.extend(_dissolve(member_set, "group_oversize"))
            continue
        conflicting = any(
            _conflicting_identifiers(id_to_study[a], id_to_study[b])
            for a, b in combinations(sorted(members), 2)
        )
        if conflicting:
            review_pairs.extend(_dissolve(member_set, "identifier_conflict"))
            continue
        rejected = any(
            _pair_key(a, b) in non_duplicate_pairs
            for a, b in combinations(sorted(members), 2)
        )
        if rejected:
            review_pairs.extend(_dissolve(member_set, "rejected_member_pair"))
            continue
        auto_groups.append(
            sorted(members, key=lambda sid: id_to_study[sid].get("created_at") or "")
        )

    return auto_groups, review_pairs
