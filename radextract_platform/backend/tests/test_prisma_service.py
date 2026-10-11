import pytest
from services.prisma_service import (
    get_prisma_2020_data,
    generate_prisma_2020_svg,
    verify_exclusion_with_laya,
)
from config import settings
from database import get_connection, init_db, reset_db


@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    test_db_path = str(tmp_path / "test_prisma.db")
    monkeypatch.setattr(settings, "db_path", test_db_path)
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(settings, "jev_provider", "laya")
    reset_db()
    init_db()


def test_get_prisma_2020_data_live_sync():
    conn = get_connection()
    pid = "proj_test_prisma"

    conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "PRISMA Test"))
    # Add studies
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, screening_status, screening_stage, is_duplicate) VALUES (?, ?, ?, ?, ?, ?)",
        ("s1", pid, "Study 1", "included", "ft", 0),
    )
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, screening_status, screening_stage, screening_reason, is_duplicate) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("s2", pid, "Study 2", "excluded", "ta", "wrong_population", 0),
    )
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, screening_status, screening_stage, screening_reason, is_duplicate) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("s3", pid, "Study 3", "excluded", "ft", "wrong_outcome", 0),
    )
    conn.execute(
        "INSERT INTO studies (study_id, project_id, title, screening_status, screening_stage, is_duplicate) VALUES (?, ?, ?, ?, ?, ?)",
        ("s4", pid, "Study 4 (dup)", "pending", "ta", 1),
    )

    # Add screening decisions (human vs AI)
    conn.execute(
        "INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, reviewer_name, decision, stage) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("d1", "s1", pid, "human_reviewer", "Dr. Smith", "included", "ft"),
    )
    conn.execute(
        "INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, reviewer_name, decision, stage) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("d2", "s2", pid, "ai_laya_screener", "Laya", "excluded", "ta"),
    )
    conn.commit()

    data = get_prisma_2020_data(pid, conn)
    assert data["project_id"] == pid
    assert data["identification"]["total"] == 4
    assert data["identification"]["duplicates_removed"] == 1
    assert data["identification"]["records_after_duplicates"] == 3
    assert data["screening"]["records_excluded"] == 1
    assert data["eligibility"]["full_text_excluded"] == 1
    assert data["included"]["studies_in_review"] == 1

    # Check human vs AI decision audit metrics
    assert data["audit"]["total_decisions"] == 2
    assert data["audit"]["human_decisions"] == 1
    assert data["audit"]["ai_decisions"] == 1


def test_generate_prisma_2020_svg():
    sample_flow = {
        "identification": {"total": 120, "duplicates_removed": 15},
        "screening": {"records_screened": 105, "records_excluded": 70, "excluded_with_reasons": [{"reason": "Wrong population", "count": 50}]},
        "eligibility": {"full_text_assessed": 35, "full_text_excluded": 20, "excluded_reasons": [{"reason": "Wrong intervention", "count": 20}]},
        "included": {"studies_in_review": 15, "studies_in_meta_analysis": 12},
    }
    svg = generate_prisma_2020_svg(sample_flow)
    assert "<svg" in svg
    assert "PRISMA 2020 Flow Diagram" in svg
    assert "n = 120" in svg
    assert "n = 15" in svg


def test_verify_exclusion_with_laya():
    title = "Pure arterial malformation treated conservatively"
    abstract = "We evaluated 20 patients treated conservatively without any endovascular surgery or stenting."
    res = verify_exclusion_with_laya(title, abstract, "no_endovascular_treatment")
    assert "verified" in res
    assert "confidence" in res
    assert res["confidence"] >= 0.0
