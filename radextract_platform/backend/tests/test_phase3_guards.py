"""Tests for Phase 3 Dedup guards and RoB polarity + vocabulary alignment.

Guards to test:
1. Dedup auto-mark skips pairs where either record has a human decision,
   and reports skipped_human_decided count.
2. RoB signaling question polarity:
   - Positive polarity (e.g. sq_1_1 'random sequence'): 'yes' -> low, 'no' -> high
   - Negative polarity (e.g. sq_1_3 'baseline differences suggest problem'): 'yes' -> high, 'no' -> low
3. Two-vocabulary mismatch:
   - 'High' (capitalized) AI judgments are recognized by GRADE auto-population as 'high'.
"""
import pytest
from services import rob_tools
from services.dedup_service import deduplicate_studies
from services.grade_service import auto_populate_factors, create_grade_assessment
from services.db_backend import get_db_backend
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_file = tmp_path / "test_phase3.db"
    monkeypatch.setattr(settings, "db_path", str(db_file))
    reset_db()
    init_db()
    yield


def test_rob2_polarity_positive_vs_negative_questions():
    """Signaling question polarity must correctly map 'yes' to high for negative questions."""
    # sq_1_1: Was allocation sequence random? (Positive polarity)
    # sq_1_2: Was allocation sequence concealed? (Positive polarity)
    # sq_1_3: Did baseline differences suggest a problem? (Negative polarity: YES = BIAS!)

    # All favorable: sq_1_1=yes, sq_1_2=yes, sq_1_3=no -> should be 'low'
    favorable_answers = {
        "sq_1_1": "yes",
        "sq_1_2": "yes",
        "sq_1_3": "no",
    }
    j_favorable = rob_tools.compute_rob2_domain_judgment(favorable_answers, domain_key="randomization")
    assert j_favorable == "low"

    # Problem detected via negative-polarity question: sq_1_3=yes (baseline differences suggest problem!)
    unfavorable_answers = {
        "sq_1_1": "yes",
        "sq_1_2": "yes",
        "sq_1_3": "yes",
    }
    j_unfavorable = rob_tools.compute_rob2_domain_judgment(unfavorable_answers, domain_key="randomization")
    assert j_unfavorable in ("high", "some_concerns")
    assert j_unfavorable != "low"


def test_robins_i_polarity_negative_question():
    """ROBINS-I signaling questions with negative polarity (e.g. selection bias) must treat 'yes' as high bias."""
    # sq_2_1: Was selection based on post-intervention characteristics? (Negative polarity: YES = BIAS!)
    favorable = {"sq_2_1": "no"}
    assert rob_tools.compute_robins_i_domain_judgment(favorable, domain_key="selection_participants") == "low"

    unfavorable = {"sq_2_1": "yes"}
    j_unfavorable = rob_tools.compute_robins_i_domain_judgment(unfavorable, domain_key="selection_participants")
    assert j_unfavorable in ("serious", "critical", "moderate")
    assert j_unfavorable != "low"


def test_grade_recognizes_capitalized_high_judgment():
    """GRADE auto-population must recognize 'High'/'Some concerns' as valid risk of bias."""
    db = get_db_backend()
    project_id = "test_grade_proj"
    db.insert("projects", {
        "project_id": project_id,
        "name": "GRADE Test Proj",
    })

    # Add a study with capitalized "High" overall judgment
    s1 = "study_high_1"
    db.insert("studies", {
        "study_id": s1,
        "project_id": project_id,
        "title": "Study 1",
        "screening_status": "included",
    })
    db.insert("rob_assessments", {
        "assessment_id": "a1",
        "project_id": project_id,
        "study_id": s1,
        "tool": "rob2",
        "overall_judgment": "High",  # Capitalized from AI engine
    })
    db.commit()

    grade = create_grade_assessment(project_id=project_id, outcome_label="Primary Outcome", db=db)
    grade_id = grade["grade_id"]
    updates = auto_populate_factors(grade_id, db=db)
    rob_info = updates.get("risk_of_bias", {})

    # Must count the High study and not say "No studies with high/serious risk of bias"
    assert rob_info.get("rating") in ("serious", "very_serious")
    assert rob_info.get("auto_data", {}).get("high_count") == 1


def test_dedup_auto_mark_preserves_human_decision():
    """A duplicate study that was already human-decided must NOT be flipped by auto_mark."""
    db = get_db_backend()
    project_id = "test_dedup_guard"
    db.insert("projects", {"project_id": project_id, "name": "Dedup Guard"})

    # Study 1 (Canonical)
    s1 = "study_canon"
    db.insert("studies", {
        "study_id": s1,
        "project_id": project_id,
        "title": "Clinical Trial on Metformin in Pancreatic Cancer",
        "doi": "10.1001/jama.2023.001",
        "screening_status": "included",
        "screening_stage": "ta",  # Human decided in TA stage!
    })

    # Study 2 (Duplicate by DOI)
    s2 = "study_dup"
    db.insert("studies", {
        "study_id": s2,
        "project_id": project_id,
        "title": "Clinical Trial on Metformin in Pancreatic Cancer (Reprint)",
        "doi": "10.1001/jama.2023.001",
        "screening_status": "maybe",
        "screening_stage": "ta",  # Human decided!
    })
    db.commit()

    # Run auto_mark deduplication
    result = deduplicate_studies(project_id, auto_mark=True, db=db)

    # Must skip marking because of human decision
    assert result["skipped_human_decided"] >= 1
    assert result["duplicates_marked"] == 0

    # s2 status must NOT be flipped to excluded/duplicate
    s2_row = db.get("studies", s2)
    assert s2_row["screening_status"] == "maybe"
    assert s2_row["is_duplicate"] == 0
