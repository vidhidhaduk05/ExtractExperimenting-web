"""Dedup performance + correctness tests (Zoplicate cascade optimization).

Guards the blocking-based candidate-pair generation:
  - a 1,885-study project with generic shared title phrases must complete in
    seconds, not minutes (the old full O(N^2) scan did ~1.77M comparisons)
  - planted duplicates must still be found (blocking must not lose real pairs)
  - thresholds are parameterized and change results predictably
"""
import time
import uuid

import pytest

from services.dedup_service import (
    deduplicate_studies,
    find_candidate_pairs,
    _title_similarity,
)


_SURNAMES = [f"{a}{b}{c}" for a in "abcdefghij" for b in "aeiou" for c in "bcdfgklmnprst"]

_VOCAB = ["stroke", "aneurysm", "malformation", "stenosis", "hemorrhage", "dementia",
          "dissection", "moyamoya", "cohort", "registry", "trial", "survey", "multicenter",
          "rural", "urban", "validation", "imaging", "magnetic", "computed", "tomography",
          "ultrasound", "angiography", "perfusion", "diffusion", "vessel", "wall", "plaque",
          "calcification", "flow", "velocity", "patients", "adults", "children", "elderly",
          "followup", "screening", "diagnosis", "prognosis", "outcome", "mortality",
          "morbidity", "recurrence"]


def _make_studies(n, shared_prefix="Cerebrovascular outcomes and molecular genetics of"):
    """Synthetic studies sharing a generic search-phrase title prefix but with
    substantial unique content (real distinct records from one PubMed search).

    Seeded RNG -> deterministic titles that never repeat and stay well below
    the similarity threshold pairwise.
    """
    import random
    rng = random.Random(42)
    studies = []
    for i in range(n):
        unique = " ".join(rng.choice(_VOCAB) for _ in range(7))
        studies.append({
            "study_id": f"s_{uuid.uuid4().hex[:10]}",
            "title": f"{shared_prefix} {unique}",
            "authors": f"{_SURNAMES[i % len(_SURNAMES)]}, A.; Colleague, B.",
            "publication_year": 2000 + (i % 25),
            "doi": f"10.1000/dedup-perf-{i}",
            "pmid": "",
            "abstract": "",
        })
    return studies


def _insert_studies(db, project_id, studies):
    for s in studies:
        db.execute(
            "INSERT INTO studies (study_id, project_id, title, authors, publication_year, doi, pmid, abstract) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (s["study_id"], project_id, s["title"], s["authors"],
             s["publication_year"], s["doi"], s["pmid"], s["abstract"]),
        )
    db.commit()


@pytest.fixture
def perf_project():
    """Project with 1,885 synthetic studies sharing a generic title prefix."""
    import uuid as _uuid
    from database import get_db_backend
    db = get_db_backend()
    pid = f"p_{_uuid.uuid4().hex[:10]}"
    db.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Dedup Perf Test"))
    studies = _make_studies(1885)
    _insert_studies(db, pid, studies)
    yield pid, studies
    db.execute("DELETE FROM studies WHERE project_id = ?", (pid,))
    db.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
    db.commit()


def test_blocking_avoids_quadratic_explosion(perf_project):
    """1,885 studies with colliding generic title buckets complete quickly."""
    pid, _ = perf_project
    from database import get_db_backend
    db = get_db_backend()

    start = time.perf_counter()
    result = deduplicate_studies(pid, auto_mark=False, db=db)
    elapsed = time.perf_counter() - start

    # The old full scan took 30-60+ s at this size; blocked candidates must
    # finish in a few seconds with generous CI headroom.
    assert elapsed < 10.0, f"dedup took {elapsed:.2f}s — blocking regressed to quadratic"
    # No planted duplicates -> no groups fabricated from the shared prefix
    assert result["total_duplicates"] == 0


def test_planted_duplicates_still_found():
    """Blocking must not lose real duplicate pairs."""
    from database import get_db_backend
    db = get_db_backend()
    pid = f"p_{uuid.uuid4().hex[:10]}"
    db.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Dedup Correctness"))

    base = [
        # Duplicate pair: same surname+year bucket, near-identical titles
        {"title": "Magnetic resonance imaging of cardiac tumors in adults",
         "authors": "Smith, J.; Jones, K.", "publication_year": 2020,
         "doi": "10.1/a", "pmid": "", "abstract": ""},
        {"title": "Magnetic resonance imaging of cardiac tumours in adults",
         "authors": "Smith, J.; Jones, K.", "publication_year": 2020,
         "doi": "10.1/b", "pmid": "", "abstract": ""},
        # Unrelated study
        {"title": "Ultrasound guided biopsy of the thyroid gland",
         "authors": "Nguyen, T.", "publication_year": 2019,
         "doi": "10.1/c", "pmid": "", "abstract": ""},
    ]
    studies = []
    for s in base:
        s = dict(s)
        s["study_id"] = f"s_{uuid.uuid4().hex[:10]}"
        studies.append(s)
    _insert_studies(db, pid, studies)

    try:
        result = deduplicate_studies(pid, auto_mark=False, db=db)
        assert result["total_duplicates"] == 1
        group = result["duplicate_groups"][0]
        titles_in_group = {group["canonical_title"]} | {d["title"] for d in group["duplicates"]}
        assert any("cardiac" in t for t in titles_in_group)
    finally:
        db.execute("DELETE FROM studies WHERE project_id = ?", (pid,))
        db.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        db.commit()


def test_thresholds_parameterized():
    """Higher title threshold -> fewer or equal duplicate groups."""
    from database import get_db_backend
    db = get_db_backend()
    pid = f"p_{uuid.uuid4().hex[:10]}"
    db.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Dedup Thresholds"))

    studies = [
        {"study_id": f"s_{uuid.uuid4().hex[:10]}",
         "title": "Computed tomography patterns of pulmonary aspergillosis",
         "authors": " Rossi, A.; Bianchi, P.", "publication_year": 2021,
         "doi": "10.2/a", "pmid": "", "abstract": ""},
        {"study_id": f"s_{uuid.uuid4().hex[:10]}",
         "title": "Computed tomography patterns of pulmonary aspergillosis in children",
         "authors": " Rossi, A.; Bianchi, P.", "publication_year": 2021,
         "doi": "10.2/b", "pmid": "", "abstract": ""},
    ]
    _insert_studies(db, pid, studies)
    try:
        lenient = deduplicate_studies(pid, auto_mark=False, db=db, title_threshold=0.80)
        strict = deduplicate_studies(pid, auto_mark=False, db=db, title_threshold=0.99)
        assert lenient["total_duplicates"] >= strict["total_duplicates"]
    finally:
        db.execute("DELETE FROM studies WHERE project_id = ?", (pid,))
        db.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
        db.commit()


def test_length_ratio_pre_check_skips_dissimilar_lengths():
    """min/max length ratio below (threshold - 0.15) can never reach the threshold."""
    short = "A short title"
    long_title = "A " * 200 + "long title that differs completely in every possible way"
    # Even at a very low threshold the lengths make similarity impossible
    assert _title_similarity(short, long_title, 0.50) < 0.50


def test_candidate_pairs_deterministic():
    """Same studies -> same candidate set, always."""
    studies = _make_studies(200)
    a = find_candidate_pairs(studies)
    b = find_candidate_pairs(studies)
    assert a == b
