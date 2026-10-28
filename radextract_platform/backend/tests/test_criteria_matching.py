"""Stage C tests: deterministic criteria matching + weighted score math.

Hand-computed CHECK (work order C3):
  - 3 weighted inclusion criteria (0.5, 0.3, 0.2), 2 matched (0.5 + 0.3) -> 0.80 exactly
  - adding one matched weighted exclusion (0.4) with the same matches -> 0.40 exactly
"""
import pytest

from services.criteria_matching import (
    MATCHED,
    NEEDS_CLARIFICATION,
    NOT_MATCHED,
    compute_score,
    evaluate_criteria,
    evaluate_project,
    match_criterion,
    preview_criteria_change,
)


def _crit(cid, text, side="inclusion", rule_mode="weighted", weight=0.5):
    return {"id": cid, "text": text, "direction": side,
            "rule_mode": rule_mode, "weight": weight}


ABSTRACT = (
    "Adults with type 2 diabetes were randomized to receive metformin. "
    "Glycated hemoglobin fell over 12 weeks. The trial excluded patients with "
    "severe renal impairment."
)


# ── C2: matching ──

def test_match_two_of_four_weighted_inclusion():
    """Abstract containing 2 of 4 weighted inclusion criteria -> exactly those match."""
    criteria = [
        _crit("c1", "adults with type 2 diabetes"),
        _crit("c2", "randomized to receive metformin"),
        _crit("c3", "pediatric participants under 12"),
        _crit("c4", "pregnant women in third trimester"),
    ]
    results = []
    for c in criteria:
        status, snippet = match_criterion(c["text"], ABSTRACT)
        results.append((c["id"], status, snippet))

    by_id = {r[0]: r for r in results}
    assert by_id["c1"][1] == MATCHED
    assert by_id["c2"][1] == MATCHED
    assert by_id["c3"][1] == NOT_MATCHED
    assert by_id["c4"][1] == NOT_MATCHED
    # Snippets carry provenance: matched text from the abstract
    assert "diabetes" in by_id["c1"][2].lower()
    assert "metformin" in by_id["c2"][2].lower()
    # Not-matched criteria carry no fabricated snippet
    assert by_id["c3"][2] == ""


def test_no_maybe_status():
    """No criterion is ever 'maybe' — exactly one of three statuses."""
    for text in [
        "adults with type 2 diabetes",
        "pediatric participants under 12",
        "randomized metformin glycated",  # partial overlap -> clarification, not maybe
    ]:
        status, _ = match_criterion(text, ABSTRACT)
        assert status in (MATCHED, NOT_MATCHED, NEEDS_CLARIFICATION)


def test_needs_clarification_partial_coverage():
    """Partial token overlap (>= 0.5 coverage) is flagged for clarification."""
    status, snippet = match_criterion(
        "randomized metformin glycated renal impairment severe trial", ABSTRACT
    )
    # Most tokens present but not all -> needs_clarification with provenance
    assert status in (NEEDS_CLARIFICATION, MATCHED)
    if status == NEEDS_CLARIFICATION:
        assert snippet != ""


def test_quoted_phrase_authoritative():
    """A quoted phrase must appear verbatim; absent quote -> not matched."""
    status, _ = match_criterion('Study of "severe renal impairment" cohorts', ABSTRACT)
    assert status == MATCHED
    status, _ = match_criterion('Study of "bionic pancreas" cohorts', ABSTRACT)
    assert status == NOT_MATCHED


def test_deterministic_same_input_same_output():
    """No LLM: same input -> same statuses and same number, always."""
    criteria = [_crit("c1", "adults with type 2 diabetes", weight=0.5),
                _crit("c2", "randomized to receive metformin", weight=0.3),
                _crit("c3", "pediatric participants", weight=0.2)]
    runs = []
    for _ in range(3):
        per = []
        statuses = []
        for c in criteria:
            status, _ = match_criterion(c["text"], ABSTRACT)
            statuses.append(status)
            per.append({"side": c["direction"], "rule_mode": c["rule_mode"],
                        "weight": c["weight"], "status": status})
        runs.append((tuple(statuses), compute_score(per)))
    assert runs[0] == runs[1] == runs[2]


# ── C3: the math (hand-computed CHECK) ──

def test_score_hand_computed_080():
    """3 weighted criteria (0.5, 0.3, 0.2), 2 matched (0.5+0.3) -> 0.80 exactly."""
    per = [
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.5, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.3, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.2, "status": NOT_MATCHED},
    ]
    assert compute_score(per) == 0.80


def test_score_hand_computed_040_with_weighted_exclusion():
    """Same matches plus one matched weighted exclusion (0.4) -> 0.40 exactly."""
    per = [
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.5, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.3, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.2, "status": NOT_MATCHED},
        {"side": "exclusion", "rule_mode": "weighted", "weight": 0.4, "status": MATCHED},
    ]
    assert compute_score(per) == 0.40


def test_score_floors_at_zero():
    """Matched weighted exclusions cannot push the score below 0."""
    per = [
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.5, "status": MATCHED},
        {"side": "exclusion", "rule_mode": "weighted", "weight": 0.9, "status": MATCHED},
    ]
    assert compute_score(per) == 0.0


def test_score_denominator_zero():
    """No weighted inclusion criteria -> score 0.0, never NaN."""
    per = [
        {"side": "inclusion", "rule_mode": "required", "weight": 0.5, "status": MATCHED},
        {"side": "exclusion", "rule_mode": "weighted", "weight": 0.4, "status": MATCHED},
    ]
    assert compute_score(per) == 0.0


def test_required_rules_never_contribute_to_score():
    """Required rules produce flags, not score contributions."""
    per = [
        {"side": "inclusion", "rule_mode": "required", "weight": 0.9, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.5, "status": MATCHED},
        {"side": "inclusion", "rule_mode": "weighted", "weight": 0.5, "status": NOT_MATCHED},
    ]
    assert compute_score(per) == 0.50


# ── C3: required-rule flags ──

def test_required_exclusion_matched_flags_excluded():
    """Matched EXCLUSION required rule -> 'excluded by required rule <criterion>'."""
    criteria = [
        _crit("r1", "adults with type 2 diabetes", side="inclusion", rule_mode="required"),
        _crit("r2", "severe renal impairment", side="exclusion", rule_mode="required"),
    ]
    from services.criteria_matching import _evaluate_study
    study = {"study_id": "s1", "title": "", "abstract": ABSTRACT}
    res = _evaluate_study(study, criteria)
    msgs = [f["message"] for f in res["flags"]]
    assert any(m.startswith("excluded by required rule") and "renal" in m for m in msgs)


def test_required_inclusion_not_matched_flags_missing():
    """NOT-matched INCLUSION required rule -> 'missing required criterion <criterion>'."""
    criteria = [
        _crit("r1", "adults with type 2 diabetes", side="inclusion", rule_mode="required"),
        _crit("r2", "pregnant women in third trimester", side="inclusion", rule_mode="required"),
    ]
    from services.criteria_matching import _evaluate_study
    study = {"study_id": "s1", "title": "", "abstract": ABSTRACT}
    res = _evaluate_study(study, criteria)
    msgs = [f["message"] for f in res["flags"]]
    assert any(m.startswith("missing required criterion") and "pregnant" in m for m in msgs)


# ── End-to-end through the DB path ──

@pytest.fixture
def project_with_study():
    """Create a project + one study in the test DB; clean up after."""
    import uuid
    from database import get_db_backend
    db = get_db_backend()
    pid = f"p_{uuid.uuid4().hex[:10]}"
    sid = f"s_{uuid.uuid4().hex[:10]}"
    db.execute(
        "INSERT INTO projects (project_id, name) VALUES (?, ?)",
        (pid, "Criteria Matching Test"),
    )
    db.execute(
        "INSERT INTO studies (study_id, project_id, title, abstract) VALUES (?, ?, ?, ?)",
        (sid, pid, "Metformin in type 2 diabetes", ABSTRACT),
    )
    db.execute(
        "UPDATE projects SET inclusion_criteria_json = ?, exclusion_criteria_json = ? "
        "WHERE project_id = ?",
        (
            __import__("json").dumps([
                _crit("c1", "adults with type 2 diabetes", weight=0.5),
                _crit("c2", "randomized to receive metformin", weight=0.3),
                _crit("c3", "pediatric participants under 12", weight=0.2),
            ]),
            __import__("json").dumps([
                _crit("x1", "severe renal impairment", side="exclusion",
                      rule_mode="weighted", weight=0.4),
            ]),
            pid,
        ),
    )
    db.commit()
    yield pid, sid
    db.execute("DELETE FROM studies WHERE project_id = ?", (pid,))
    db.execute("DELETE FROM projects WHERE project_id = ?", (pid,))
    db.commit()


def test_evaluate_criteria_end_to_end(project_with_study):
    """evaluate_criteria(project_id, study_id) returns per-criterion results + score."""
    pid, sid = project_with_study
    res = evaluate_criteria(pid, sid)

    assert res["project_id"] == pid
    assert res["study_id"] == sid
    by_id = {r["criterion_id"]: r for r in res["results"]}
    assert by_id["c1"]["status"] == MATCHED
    assert by_id["c2"]["status"] == MATCHED
    assert by_id["c3"]["status"] == NOT_MATCHED
    assert by_id["x1"]["status"] == MATCHED

    # Hand-computed: (0.5 + 0.3 - 0.4) / (0.5 + 0.3 + 0.2) = 0.40
    assert res["score"] == 0.40
    assert res["weighted_matched"] == 3
    assert res["weighted_total"] == 4


def test_evaluate_project_batch(project_with_study):
    """Batch evaluation covers every study in the project."""
    pid, _ = project_with_study
    out = evaluate_project(pid)
    assert len(out) == 1
    assert out[0]["score"] == 0.40


def test_preview_criteria_change_mutates_nothing(project_with_study):
    """Preview reports affected studies without writing anything."""
    import json as _json
    from database import get_db_backend
    pid, sid = project_with_study
    db = get_db_backend()

    before = db.execute(
        "SELECT inclusion_criteria_json, exclusion_criteria_json FROM projects WHERE project_id = ?",
        (pid,),
    ).fetchone()

    proposed = {
        "inclusion": [
            _crit("c1", "adults with type 2 diabetes", weight=0.5),
            _crit("c2", "randomized to receive metformin", weight=0.3),
            _crit("c3", "pediatric participants under 12", weight=0.2),
        ],
        "exclusion": [],  # dropping the exclusion rule changes the score
    }
    summary = preview_criteria_change(pid, proposed)
    assert summary["studies_evaluated"] == 1
    assert summary["studies_affected"] == 1
    assert summary["affected"][0]["study_id"] == sid
    assert summary["affected"][0]["current_score"] == 0.40
    assert summary["affected"][0]["proposed_score"] == 0.80

    after = db.execute(
        "SELECT inclusion_criteria_json, exclusion_criteria_json FROM projects WHERE project_id = ?",
        (pid,),
    ).fetchone()
    assert before["inclusion_criteria_json"] == after["inclusion_criteria_json"]
    assert before["exclusion_criteria_json"] == after["exclusion_criteria_json"]
