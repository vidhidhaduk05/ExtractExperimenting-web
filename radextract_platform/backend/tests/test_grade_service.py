"""Tests for services/grade_service.py — GRADE factors, certainty, SoF."""
import pytest
import uuid
from database import reset_db, init_db, get_connection
from services import grade_service


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_grade.db"))
    reset_db()
    init_db()
    yield


def _create_project_and_study(design="randomized controlled trial", rob_judgment="low"):
    """Helper: create a project, study, and RoB assessment."""
    pid = str(uuid.uuid4())
    sid = str(uuid.uuid4())
    aid = str(uuid.uuid4())
    conn = get_connection()
    conn.execute("INSERT INTO projects (project_id, name) VALUES (?, 'Test')", (pid,))
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, study_design, screening_status) "
        "VALUES (?, ?, 'Test Study', ?, 'included')",
        (sid, pid, design),
    )
    conn.execute(
        "INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment) "
        "VALUES (?, ?, ?, 'rob2', ?)",
        (aid, sid, pid, rob_judgment),
    )
    conn.commit()
    conn.close()
    return pid, sid, aid


class TestCreateGradeAssessment:

    def test_create_with_8_factors(self):
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "Primary Outcome")
        assert len(grade["factors"]) == 8
        factor_keys = {f["factor_key"] for f in grade["factors"]}
        assert "risk_of_bias" in factor_keys
        assert "inconsistency" in factor_keys
        assert "indirectness" in factor_keys
        assert "imprecision" in factor_keys
        assert "publication_bias" in factor_keys
        assert "large_effect" in factor_keys
        assert "dose_response" in factor_keys
        assert "plausible_confounding" in factor_keys

    def test_all_factors_start_none(self):
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "Outcome")
        for f in grade["factors"]:
            assert f["rating"] == "none"

    def test_initial_certainty_matches_starting(self):
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "Outcome", starting_level="high")
        assert grade["certainty_rating"] == "high"


class TestCertaintyComputation:

    def test_high_no_downgrades(self):
        """High start, no downgrades → high."""
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        cert = grade_service.compute_certainty(grade["grade_id"])
        assert cert["certainty_rating"] == "high"

    def test_high_one_serious(self):
        """High start, one serious downgrade → moderate."""
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        # Set risk_of_bias to serious
        rob_factor = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        updated = grade_service.update_factor(rob_factor["factor_id"], "serious", "test")
        assert updated["certainty_rating"] == "moderate"

    def test_high_two_serious(self):
        """High start, two serious downgrades → low."""
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        rob_f = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        inc_f = [f for f in grade["factors"] if f["factor_key"] == "inconsistency"][0]
        grade_service.update_factor(rob_f["factor_id"], "serious", "")
        grade = grade_service.update_factor(inc_f["factor_id"], "serious", "")
        assert grade["certainty_rating"] == "low"

    def test_high_one_very_serious(self):
        """High start, one very serious → low."""
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        rob_f = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        grade = grade_service.update_factor(rob_f["factor_id"], "very_serious", "")
        assert grade["certainty_rating"] == "low"

    def test_low_with_upgrade(self):
        """Low start, one upgrade → moderate."""
        pid, _, _ = _create_project_and_study(design="cohort")
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="low")
        le_f = [f for f in grade["factors"] if f["factor_key"] == "large_effect"][0]
        grade = grade_service.update_factor(le_f["factor_id"], "large", "")
        assert grade["certainty_rating"] == "moderate"

    def test_no_upgrade_from_high(self):
        """Upgrading factors should not apply when starting at high."""
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        le_f = [f for f in grade["factors"] if f["factor_key"] == "large_effect"][0]
        grade = grade_service.update_factor(le_f["factor_id"], "very_large", "")
        assert grade["certainty_rating"] == "high"  # no upgrade from high


class TestAutoPopulate:

    def test_auto_populate_risk_of_bias_high(self):
        """Auto-populate should detect high RoB percentage."""
        pid, _, _ = _create_project_and_study(rob_judgment="high")
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        grade = grade_service.auto_populate_factors(grade["grade_id"])
        rob_f = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        assert rob_f["auto_populated"] == 1
        assert rob_f["rating"] in ("serious", "very_serious")

    def test_auto_populate_risk_of_bias_low(self):
        """Auto-populate should detect low RoB."""
        pid, _, _ = _create_project_and_study(rob_judgment="low")
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        grade = grade_service.auto_populate_factors(grade["grade_id"])
        rob_f = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        assert rob_f["rating"] == "none"

    def test_auto_populate_no_rob(self):
        """Auto-populate with no RoB assessments should set none."""
        pid = str(uuid.uuid4())
        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, 'Test')", (pid,))
        conn.commit()
        conn.close()
        grade = grade_service.create_grade_assessment(pid, "O", starting_level="high")
        grade = grade_service.auto_populate_factors(grade["grade_id"])
        rob_f = [f for f in grade["factors"] if f["factor_key"] == "risk_of_bias"][0]
        assert rob_f["rating"] == "none"

    def test_two_outcomes_different_cohorts_produce_different_rob_factors(self):
        """CHECK: two outcomes with different study cohorts produce different RoB factors."""
        pid = str(uuid.uuid4())
        s1, s2, s3 = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        m1, m2 = str(uuid.uuid4()), str(uuid.uuid4())

        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, 'Cohort Test')", (pid,))
        for sid in (s1, s2, s3):
            conn.execute(
                "INSERT INTO studies (study_id, project_id, title, screening_status) VALUES (?, ?, 'S', 'included')",
                (sid, pid),
            )
        # Outcome 1: Mortality (studies s1 and s2, both high risk of bias)
        conn.execute(
            "INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, outcome_label, overall_judgment) "
            "VALUES (?, ?, ?, 'rob2', 'Mortality', 'high')",
            (str(uuid.uuid4()), s1, pid),
        )
        conn.execute(
            "INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, outcome_label, overall_judgment) "
            "VALUES (?, ?, ?, 'rob2', 'Mortality', 'high')",
            (str(uuid.uuid4()), s2, pid),
        )
        # Outcome 2: Recanalization (study s3, low risk of bias)
        conn.execute(
            "INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, outcome_label, overall_judgment) "
            "VALUES (?, ?, ?, 'rob2', 'Recanalization', 'low')",
            (str(uuid.uuid4()), s3, pid),
        )

        # Meta-analysis 1 for Mortality with s1, s2
        conn.execute("INSERT INTO meta_analyses (meta_id, project_id, outcome_label) VALUES (?, ?, 'Mortality')", (m1, pid))
        conn.execute("INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included) VALUES (?, ?, ?, 1)", (str(uuid.uuid4()), m1, s1))
        conn.execute("INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included) VALUES (?, ?, ?, 1)", (str(uuid.uuid4()), m1, s2))

        # Meta-analysis 2 for Recanalization with s3
        conn.execute("INSERT INTO meta_analyses (meta_id, project_id, outcome_label) VALUES (?, ?, 'Recanalization')", (m2, pid))
        conn.execute("INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included) VALUES (?, ?, ?, 1)", (str(uuid.uuid4()), m2, s3))
        conn.commit()
        conn.close()

        # Create GRADE assessment 1 (Mortality)
        grade1 = grade_service.create_grade_assessment(pid, "Mortality", meta_analysis_id=m1)
        grade1_pop = grade_service.auto_populate_factors(grade1["grade_id"])
        rob1 = next(f for f in grade1_pop["factors"] if f["factor_key"] == "risk_of_bias")

        # Create GRADE assessment 2 (Recanalization)
        grade2 = grade_service.create_grade_assessment(pid, "Recanalization", meta_analysis_id=m2)
        grade2_pop = grade_service.auto_populate_factors(grade2["grade_id"])
        rob2 = next(f for f in grade2_pop["factors"] if f["factor_key"] == "risk_of_bias")

        # Check: two outcomes with different study cohorts produce different RoB factors
        assert rob1["rating"] == "very_serious"
        assert rob1["auto_data"]["pct_high"] == 100.0
        assert rob2["rating"] == "none"
        assert rob2["auto_data"]["pct_high"] == 0.0
        assert rob1["rating"] != rob2["rating"]



class TestSoFTable:

    def test_generate_sof(self):
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "Primary Outcome")
        sof = grade_service.generate_sof_table(grade["grade_id"])
        assert sof["outcome"] == "Primary Outcome"
        assert "certainty" in sof
        assert len(sof["factors"]) == 8
        for f in sof["factors"]:
            assert "rating_label" in f
            assert "rationale" in f


class TestStartingLevel:

    def test_all_rct(self):
        pid, _, _ = _create_project_and_study(design="randomized controlled trial")
        assert grade_service.determine_starting_level(pid) == "high"

    def test_all_observational(self):
        pid, _, _ = _create_project_and_study(design="retrospective cohort")
        assert grade_service.determine_starting_level(pid) == "low"

    def test_no_studies(self):
        pid = str(uuid.uuid4())
        conn = get_connection()
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, 'Test')", (pid,))
        conn.commit()
        conn.close()
        # No included studies → default high
        assert grade_service.determine_starting_level(pid) == "high"


class TestCRUD:

    def test_get_nonexistent(self):
        assert grade_service.get_grade_assessment("nonexistent") is None

    def test_delete(self):
        pid, _, _ = _create_project_and_study()
        grade = grade_service.create_grade_assessment(pid, "O")
        assert grade_service.delete_grade_assessment(grade["grade_id"]) is True
        assert grade_service.get_grade_assessment(grade["grade_id"]) is None

    def test_list(self):
        pid, _, _ = _create_project_and_study()
        grade_service.create_grade_assessment(pid, "O1")
        grade_service.create_grade_assessment(pid, "O2")
        assessments = grade_service.list_grade_assessments(pid)
        assert len(assessments) == 2
