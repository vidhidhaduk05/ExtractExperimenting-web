"""Tests for the weighted inclusion/exclusion scoring engine (blueprint §4E)."""
from __future__ import annotations

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.weighted_scoring import (
    CriterionEvidence,
    EvaluationTrace,
    ScreeningPolicy,
    WeightedCriterion,
    build_trace,
    evaluate_weighted,
    replay_trace,
)


def _criteria():
    return [
        WeightedCriterion(id="inc_pop", text="Target population", direction="inclusion",
                          rule_mode="weighted", weight=0.8),
        WeightedCriterion(id="inc_int", text="Index intervention", direction="inclusion",
                          rule_mode="weighted", weight=0.6),
        WeightedCriterion(id="exc_animal", text="Animal only", direction="exclusion",
                          rule_mode="weighted", weight=0.9),
        WeightedCriterion(id="req_rct", text="Must be an RCT", direction="inclusion",
                          rule_mode="required"),
        WeightedCriterion(id="hard_lang", text="Non-English no translation", direction="exclusion",
                          rule_mode="required"),
    ]


def test_hand_computed_soft_aggregation():
    """Hand-computed fixture: known weights/evidence -> known score.

    inc_pop: s=0.9, w=0.8 -> +0.72 ; inc_int: s=0.5, w=0.6 -> +0.30
    exc_animal: s=0.2, w=0.9 -> -0.18
    aggregate = (0.72+0.30-0.18)/(0.8+0.6+0.9) = 0.84/2.3 = 0.365217...
    rec_score = (0.365217...+1)/2 = 0.682609 (rounded 6)
    """
    crits = [c for c in _criteria() if c.rule_mode == "weighted"]
    ev = [
        CriterionEvidence(criterion_id="inc_pop", score=0.9),
        CriterionEvidence(criterion_id="inc_int", score=0.5),
        CriterionEvidence(criterion_id="exc_animal", score=0.2),
    ]
    r = evaluate_weighted(ev, crits)
    assert r["recommendation"] == "include_review"  # 0.682609 >= 0.65
    assert abs(r["rec_score"] - 0.682609) < 1e-6
    contrib = {c["criterion"]: c["contribution"] for c in r["contributions"]}
    assert abs(contrib["inc_pop"] - 0.72) < 1e-9
    assert abs(contrib["inc_int"] - 0.30) < 1e-9
    assert abs(contrib["exc_animal"] - (-0.18)) < 1e-9


def test_hard_exclusion_cannot_be_compensated():
    """A confirmed strict exclusion dominates regardless of positive signals."""
    crits = _criteria()
    ev = [
        CriterionEvidence(criterion_id="inc_pop", score=1.0),
        CriterionEvidence(criterion_id="inc_int", score=1.0),
        CriterionEvidence(criterion_id="hard_lang", score=1.0),  # hard exclude fires
    ]
    r = evaluate_weighted(ev, crits)
    assert r["recommendation"] == "exclude"
    assert "hard_exclude:hard_lang" in r["hard_flags"]


def test_required_inclusion_failure_not_hidden():
    """A failed required inclusion is not rescued by other positive signals."""
    crits = _criteria()
    ev = [
        CriterionEvidence(criterion_id="inc_pop", score=1.0),
        CriterionEvidence(criterion_id="inc_int", score=1.0),
        CriterionEvidence(criterion_id="req_rct", score=0.0),  # required inclusion fails
    ]
    r = evaluate_weighted(ev, crits)
    assert r["recommendation"] == "exclude"
    assert "required_inclusion_failed:req_rct" in r["hard_flags"]


def test_required_unscored_is_fail_closed():
    """Unknown evidence on a required rule -> uncertain, never a confident call."""
    crits = _criteria()
    ev = [
        CriterionEvidence(criterion_id="inc_pop", score=1.0),
        CriterionEvidence(criterion_id="inc_int", score=1.0),
        CriterionEvidence(criterion_id="req_rct", score=None, applicability="unknown"),
    ]
    r = evaluate_weighted(ev, crits)
    assert r["recommendation"] == "uncertain"
    assert "required_unscored:req_rct" in r["hard_flags"]
    assert "req_rct" in r["missing"]


def test_missing_soft_criteria_excluded_from_denominator():
    """Missing soft evidence must not dilute or inflate the aggregate."""
    crits = [c for c in _criteria() if c.rule_mode == "weighted"]
    ev = [CriterionEvidence(criterion_id="inc_pop", score=1.0)]  # others missing
    r = evaluate_weighted(ev, crits)
    # aggregate = (0.8*1.0)/0.8 = 1.0 -> rec 1.0
    assert abs(r["rec_score"] - 1.0) < 1e-9
    assert set(r["missing"]) == {"inc_int", "exc_animal"}


def test_all_zero_weights_and_no_evidence_is_uncertain():
    crits = [WeightedCriterion(id="x", text="x", direction="inclusion",
                               rule_mode="weighted", weight=0.0)]
    r = evaluate_weighted([CriterionEvidence(criterion_id="x", score=0.7)], crits)
    assert r["recommendation"] == "uncertain"
    assert r["rec_score"] == 0.5


def test_exclusion_evidence_polarity():
    """Stronger evidence FOR an exclusion must push the score DOWN."""
    crits = [c for c in _criteria() if c.id == "exc_animal"]
    weak = evaluate_weighted([CriterionEvidence(criterion_id="exc_animal", score=0.2)], crits)
    strong = evaluate_weighted([CriterionEvidence(criterion_id="exc_animal", score=0.95)], crits)
    assert strong["rec_score"] < weak["rec_score"]
    assert strong["recommendation"] == "exclude_review"
    # weak exclusion evidence alone (rec 0.40) sits in the uncertain band
    assert weak["recommendation"] == "uncertain"


def test_trace_replay_reproduces():
    crits = _criteria()
    ev = [
        CriterionEvidence(criterion_id="inc_pop", score=0.9, quote="p < .001",
                          source_locator="p.3", engine="laya"),
        CriterionEvidence(criterion_id="inc_int", score=0.5),
        CriterionEvidence(criterion_id="exc_animal", score=0.2),
        CriterionEvidence(criterion_id="req_rct", score=1.0),
    ]
    res = evaluate_weighted(ev, crits)
    trace = build_trace(res, trace_id="t1", project_id="p1", study_id="s1",
                        stage="ta", criteria=crits, input_text="abstract text")
    replay = replay_trace(trace, crits, "abstract text")
    assert replay["reproduces"] is True

    # Any change to inputs must be detected, not silently reproduced.
    bad = replay_trace(trace, crits, "DIFFERENT abstract")
    assert bad["reproduces"] is False
    bad2 = replay_trace(trace, [c for c in crits if c.id != "inc_int"], "abstract text")
    assert bad2["reproduces"] is False


def test_weight_increase_moves_score_in_documented_direction():
    """Increasing a weight must have the documented effect given the evidence.

    Note: with a single criterion the weight cancels in the normalized
    aggregate (w*s/w = s); weights matter only relative to each other.
    """
    pop = WeightedCriterion(id="inc_pop", text="pop", direction="inclusion",
                            rule_mode="weighted", weight=0.3)
    exc = WeightedCriterion(id="exc_x", text="x", direction="exclusion",
                            rule_mode="weighted", weight=0.3)
    ev = [CriterionEvidence(criterion_id="inc_pop", score=0.9),
          CriterionEvidence(criterion_id="exc_x", score=0.9)]
    low_w = evaluate_weighted(ev, [pop, exc])
    # Raise the inclusion weight: positive evidence now dominates the mix.
    pop.weight = 0.9
    high_w = evaluate_weighted(ev, [pop, exc])
    assert high_w["rec_score"] > low_w["rec_score"]

    # For exclusion evidence, higher relative weight pushes the score down.
    pop2 = WeightedCriterion(id="inc_pop", text="pop", direction="inclusion",
                             rule_mode="weighted", weight=0.3)
    exc2 = WeightedCriterion(id="exc_x", text="x", direction="exclusion",
                             rule_mode="weighted", weight=0.3)
    low_w2 = evaluate_weighted(ev, [pop2, exc2])
    exc2.weight = 0.9
    high_w2 = evaluate_weighted(ev, [pop2, exc2])
    assert high_w2["rec_score"] < low_w2["rec_score"]
