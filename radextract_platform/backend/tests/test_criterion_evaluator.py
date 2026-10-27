"""10-point test checklist for Threshold-Based Criterion Evaluation & Math Spec."""
import pytest
from services.criterion_evaluator import (
    Criterion,
    DEFAULT_CRITERIA,
    evaluate_exclusion,
    evaluate_inclusion_fail,
    evaluate_study_against_criteria,
    compute_clopper_pearson_upper_bound,
)


def test_01_boundary_conditions():
    """1. Boundary: p == tau fires for exclusion; p == tau does NOT fire for inclusion failure."""
    crit_excl = Criterion(
        id="c_excl", text="Animal", direction="exclusion", rule_mode="weighted", threshold=0.90
    )
    crit_incl = Criterion(
        id="c_incl", text="Human", direction="inclusion", rule_mode="weighted", threshold=0.80
    )

    # For exclusion, p >= tau fires
    assert evaluate_exclusion(crit_excl, 0.90) is True
    assert evaluate_exclusion(crit_excl, 0.8999) is False

    # For inclusion, p < tau fires (failure to meet inclusion). When p == tau, it meets inclusion, so does NOT fire
    assert evaluate_inclusion_fail(crit_incl, 0.80) is False
    assert evaluate_inclusion_fail(crit_incl, 0.7999) is True


def test_02_any_fire_reports_all_order_independent():
    """2. Any-fire reports ALL fired criteria, order-independent."""
    c1 = Criterion(id="c1", text="Crit 1", direction="exclusion", rule_mode="weighted", threshold=0.80)
    c2 = Criterion(id="c2", text="Crit 2", direction="exclusion", rule_mode="weighted", threshold=0.85)

    scores_forward = {"c1": 0.90, "c2": 0.95}
    scores_reverse = {"c2": 0.95, "c1": 0.90}

    res1 = evaluate_study_against_criteria(scores_forward, [c1, c2])
    res2 = evaluate_study_against_criteria(scores_reverse, [c2, c1])

    assert res1["decision"] == "Propose-Exclude"
    assert res2["decision"] == "Propose-Exclude"
    assert len(res1["fired"]) == 2
    assert len(res2["fired"]) == 2

    # Margins: c1 is |0.90 - 0.80| = 0.10, c2 is |0.95 - 0.85| = 0.10
    fired_ids_1 = {f["criterion"] for f in res1["fired"]}
    fired_ids_2 = {f["criterion"] for f in res2["fired"]}
    assert fired_ids_1 == {"c1", "c2"}
    assert fired_ids_2 == {"c1", "c2"}


def test_03_strict_rules():
    """3. Strict exclusion hit fires regardless of threshold; strict inclusion miss fires."""
    crit_strict_excl = Criterion(
        id="c_s_ex", text="Wrong Drug", direction="exclusion", rule_mode="strict", threshold=0.5
    )
    crit_strict_incl = Criterion(
        id="c_s_in", text="RCT Only", direction="inclusion", rule_mode="strict", threshold=0.5
    )

    # Exclusion strict: score 1 fires, score 0 does not
    assert evaluate_exclusion(crit_strict_excl, 1.0) is True
    assert evaluate_exclusion(crit_strict_excl, 0.0) is False

    # Inclusion strict: score 0 fires (fails inclusion), score 1 does not
    assert evaluate_inclusion_fail(crit_strict_incl, 0.0) is True
    assert evaluate_inclusion_fail(crit_strict_incl, 1.0) is False


def test_04_missing_score_fail_closed():
    """4. Missing score -> no exclusion vote on that criterion + visible flag; never silently model-kept."""
    crit = Criterion(id="c_model", text="Complex AI", direction="exclusion", rule_mode="weighted", threshold=0.8)
    scores = {"c_model": None}

    res = evaluate_study_against_criteria(scores, [crit])
    assert res["decision"] == "Keep for Manual Review"
    assert len(res["fired"]) == 0
    assert "c_model" in res["flagged_unscored"]


def test_05_disabled_criteria_contribute_nothing():
    """5. Disabled criteria contribute nothing."""
    c_off = Criterion(
        id="c_off", text="Disabled", direction="exclusion", rule_mode="weighted", threshold=0.5, enabled=False
    )
    scores = {"c_off": 0.99}

    res = evaluate_study_against_criteria(scores, [c_off])
    assert res["decision"] == "Keep for Manual Review"
    assert len(res["fired"]) == 0


def test_06_empty_criteria_set():
    """6. Empty criteria set -> everything goes to manual review."""
    res = evaluate_study_against_criteria({"any": 1.0}, [])
    assert res["decision"] == "Keep for Manual Review"
    assert res["fired"] == []
    assert res["flagged_unscored"] == []


def test_07_worked_example_2():
    """7. Hand-computed multi-criterion example from Section 5 reproduces exactly."""
    # A: excl, weighted, 0.90
    # B: excl, weighted, 0.95
    # C: excl, strict, -
    # D: incl, weighted, 0.80
    crit_a = Criterion(id="A", text="Animal", direction="exclusion", rule_mode="weighted", threshold=0.90)
    crit_b = Criterion(id="B", text="Case Report", direction="exclusion", rule_mode="weighted", threshold=0.95)
    crit_c = Criterion(id="C", text="Wrong Drug", direction="exclusion", rule_mode="strict", threshold=1.0)
    crit_d = Criterion(id="D", text="Human", direction="inclusion", rule_mode="weighted", threshold=0.80)

    criteria = [crit_a, crit_b, crit_c, crit_d]

    # Study 2: scores {A: 0.10, B: 0.96, C: 1, D: 0.99}
    scores_s2 = {"A": 0.10, "B": 0.96, "C": 1.0, "D": 0.99}
    res_s2 = evaluate_study_against_criteria(scores_s2, criteria)

    assert res_s2["decision"] == "Propose-Exclude"
    fired_ids = [f["criterion"] for f in res_s2["fired"]]
    assert "B" in fired_ids
    assert "C" in fired_ids
    assert "A" not in fired_ids
    assert "D" not in fired_ids

    # B margin: |0.96 - 0.95| = 0.01, C margin = 0.0
    # Closest margin sorted first (C margin 0.0, then B margin 0.01)
    assert fired_ids == ["C", "B"]


def test_08_version_bump_marks_stale():
    """8. Criterion versioning reflects edits."""
    c = Criterion(id="crit_001", text="Original", direction="exclusion", rule_mode="weighted", threshold=0.9, version=1)
    # Edit criterion
    c_updated = c.model_copy(update={"threshold": 0.85, "version": c.version + 1})
    assert c_updated.version == 2
    assert c_updated.threshold == 0.85


def test_09_clopper_pearson_reference_values():
    """9. Clopper-Pearson reference values: (n=50, k=0) -> U ~ 0.0582; (n=0) -> None."""
    # (n=50, k=0) at alpha=0.05
    u_0 = compute_clopper_pearson_upper_bound(k=0, n=50, alpha=0.05)
    assert u_0 == 0.0582

    # (n=0) -> None
    assert compute_clopper_pearson_upper_bound(k=0, n=0) is None

    # (k=n) -> 1.0
    assert compute_clopper_pearson_upper_bound(k=50, n=50) == 1.0


def test_10_proposal_queue_default():
    """10. Default decision remains proposal queue ('Propose-Exclude') and never auto-excludes silently."""
    crit = Criterion(id="c", text="Animal", direction="exclusion", rule_mode="weighted", threshold=0.5)
    res = evaluate_study_against_criteria({"c": 0.95}, [crit])
    assert res["decision"] == "Propose-Exclude"
    assert "Propose" in res["decision"]
