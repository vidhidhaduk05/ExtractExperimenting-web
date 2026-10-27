"""Tests for Phase 4: Outcome-specific GRADE.

Work Order Requirements:
1. GRADE requires an explicit outcome -> study cohort. No silent fallback to "all project assessments".
2. RoB factor computed from DISTINCT studies in that cohort, each with a RESOLVED assessment;
   unresolved assessments count as "unresolved" and are reported, not silently averaged.
3. Inconsistency + imprecision domains read synthesis results (real pooling).
"""
import pytest
from database import get_connection, init_db
from services import grade_service
from services.db_backend import SQLiteBackend

PROJECT_ID = "p_grade_cohort_test"
GRADE_ID = "g_cohort_test_1"
META_ID = "m_cohort_test_1"


@pytest.fixture(autouse=True)
def setup_grade_cohort_data():
    init_db()
    conn = get_connection()
    try:
        # Cleanup
        conn.execute("DELETE FROM grade_factors WHERE grade_id IN (SELECT grade_id FROM grade_assessments WHERE project_id = ?)", (PROJECT_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id IN (SELECT meta_id FROM meta_analyses WHERE project_id = ?)", (PROJECT_ID,))
        conn.execute("DELETE FROM meta_analyses WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM rob_assessments WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id IN ('s_cohort_1', 's_cohort_2', 's_cohort_3')", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))

        # Create project
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (PROJECT_ID, "Grade Cohort Test Project"))

        # Create 3 studies
        conn.execute("INSERT INTO studies (study_id, project_id, title) VALUES ('s_cohort_1', ?, 'Study 1')", (PROJECT_ID,))
        conn.execute("INSERT INTO studies (study_id, project_id, title) VALUES ('s_cohort_2', ?, 'Study 2')", (PROJECT_ID,))
        conn.execute("INSERT INTO studies (study_id, project_id, title) VALUES ('s_cohort_3', ?, 'Study 3')", (PROJECT_ID,))

        conn.commit()
    finally:
        conn.close()

    yield

    conn = get_connection()
    try:
        conn.execute("DELETE FROM grade_factors WHERE grade_id IN (SELECT grade_id FROM grade_assessments WHERE project_id = ?)", (PROJECT_ID,))
        conn.execute("DELETE FROM grade_assessments WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id IN (SELECT meta_id FROM meta_analyses WHERE project_id = ?)", (PROJECT_ID,))
        conn.execute("DELETE FROM meta_analyses WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM rob_assessments WHERE project_id = ?", (PROJECT_ID,))
        conn.execute("DELETE FROM studies WHERE project_id = ? OR study_id IN ('s_cohort_1', 's_cohort_2', 's_cohort_3')", (PROJECT_ID,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (PROJECT_ID,))
        conn.commit()
    finally:
        conn.close()


def test_grade_rob_evaluates_only_outcome_cohort_studies():
    """Verify RoB factor evaluates only studies in the outcome meta-analysis cohort, not project-wide."""
    conn = get_connection()
    db = SQLiteBackend(conn)
    try:
        # Study 1: High RoB (verified)
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob1', 's_cohort_1', ?, 'rob2', 'high', 'verified')""",
            (PROJECT_ID,),
        )
        # Study 2: Low RoB (verified)
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob2', 's_cohort_2', ?, 'rob2', 'low', 'verified')""",
            (PROJECT_ID,),
        )
        # Study 3: High RoB (verified)
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob3', 's_cohort_3', ?, 'rob2', 'high', 'verified')""",
            (PROJECT_ID,),
        )

        # Meta-analysis cohort contains ONLY Study 2
        conn.execute(
            """INSERT INTO meta_analyses (meta_id, project_id, outcome_label, n_studies, i_squared, pooled_effect, pooled_ci_lower, pooled_ci_upper)
               VALUES (?, ?, 'Cohort Outcome', 1, 10.0, 0.5, 0.2, 0.8)""",
            (META_ID, PROJECT_ID),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included)
               VALUES ('link2', ?, 's_cohort_2', 1)""",
            (META_ID,),
        )

        # Create GRADE assessment linked to META_ID
        grade = grade_service.create_grade_assessment(
            project_id=PROJECT_ID,
            outcome_label="Cohort Outcome",
            meta_analysis_id=META_ID,
            db=db,
        )
        gid = grade["grade_id"]

        # Auto-populate
        res = grade_service.auto_populate_factors(gid, db=db)
        rob_factor = next(f for f in res["factors"] if f["factor_key"] == "risk_of_bias")

        # Because the outcome cohort is ONLY s2 (low risk), RoB rating must be "none", NOT serious/very_serious
        assert rob_factor["rating"] == "none", f"Expected rating 'none', got {rob_factor['rating']}: {rob_factor['rationale']}"
        assert "s_cohort_2" in str(rob_factor.get("auto_data", {})), "Expected s_cohort_2 in auto_data"
    finally:
        conn.close()


def test_grade_rob_counts_distinct_studies_not_duplicate_rows():
    """Verify RoB factor counts DISTINCT studies in cohort, not redundant assessment rows."""
    conn = get_connection()
    db = SQLiteBackend(conn)
    try:
        # Study 1 has 3 separate assessment rows, all 'high' and 'verified'
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob1_a', 's_cohort_1', ?, 'rob2', 'high', 'verified')""",
            (PROJECT_ID,),
        )
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob1_b', 's_cohort_1', ?, 'quadas2', 'high', 'verified')""",
            (PROJECT_ID,),
        )
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob1_c', 's_cohort_1', ?, 'rob2', 'high', 'verified')""",
            (PROJECT_ID,),
        )

        # Study 2 has 1 assessment row, 'low' and 'verified'
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob2', 's_cohort_2', ?, 'rob2', 'low', 'verified')""",
            (PROJECT_ID,),
        )

        # Meta-analysis cohort contains Study 1 and Study 2 (2 distinct studies)
        conn.execute(
            """INSERT INTO meta_analyses (meta_id, project_id, outcome_label, n_studies, i_squared, pooled_effect, pooled_ci_lower, pooled_ci_upper)
               VALUES (?, ?, 'Distinct Studies Outcome', 2, 20.0, 0.4, 0.1, 0.7)""",
            (META_ID, PROJECT_ID),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included)
               VALUES ('link1', ?, 's_cohort_1', 1)""",
            (META_ID,),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included)
               VALUES ('link2', ?, 's_cohort_2', 1)""",
            (META_ID,),
        )

        grade = grade_service.create_grade_assessment(
            project_id=PROJECT_ID,
            outcome_label="Distinct Studies Outcome",
            meta_analysis_id=META_ID,
            db=db,
        )
        gid = grade["grade_id"]

        res = grade_service.auto_populate_factors(gid, db=db)
        rob_factor = next(f for f in res["factors"] if f["factor_key"] == "risk_of_bias")
        auto_data = rob_factor.get("auto_data", {})

        # Cohort size should be 2 distinct studies (s1, s2), NOT 4 assessment rows
        assert auto_data.get("cohort_size") == 2, f"Expected cohort_size 2, got {auto_data}"
        assert auto_data.get("high_count") == 1, f"Expected high_count 1, got {auto_data}"
    finally:
        conn.close()


def test_grade_rob_reports_unresolved_assessments():
    """Verify unresolved assessments are counted and explicitly reported in rationale."""
    conn = get_connection()
    db = SQLiteBackend(conn)
    try:
        # Study 1: Resolved (low)
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob1', 's_cohort_1', ?, 'rob2', 'low', 'verified')""",
            (PROJECT_ID,),
        )
        # Study 2: Unresolved (pending)
        conn.execute(
            """INSERT INTO rob_assessments (assessment_id, study_id, project_id, tool, overall_judgment, verification_status)
               VALUES ('rob2', 's_cohort_2', ?, 'rob2', 'pending', 'pending')""",
            (PROJECT_ID,),
        )

        # Meta-analysis cohort contains s1 and s2
        conn.execute(
            """INSERT INTO meta_analyses (meta_id, project_id, outcome_label, n_studies)
               VALUES (?, ?, 'Unresolved Outcome', 2)""",
            (META_ID, PROJECT_ID),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included)
               VALUES ('link1', ?, 's_cohort_1', 1)""",
            (META_ID,),
        )
        conn.execute(
            """INSERT INTO meta_analysis_studies (link_id, meta_id, study_id, included)
               VALUES ('link2', ?, 's_cohort_2', 1)""",
            (META_ID,),
        )

        grade = grade_service.create_grade_assessment(
            project_id=PROJECT_ID,
            outcome_label="Unresolved Outcome",
            meta_analysis_id=META_ID,
            db=db,
        )
        gid = grade["grade_id"]

        res = grade_service.auto_populate_factors(gid, db=db)
        rob_factor = next(f for f in res["factors"] if f["factor_key"] == "risk_of_bias")
        auto_data = rob_factor.get("auto_data", {})

        assert auto_data.get("unresolved_count") == 1, f"Expected 1 unresolved study, got {auto_data}"
        assert "unresolved" in rob_factor["rationale"].lower(), f"Expected 'unresolved' in rationale, got: {rob_factor['rationale']}"
    finally:
        conn.close()
