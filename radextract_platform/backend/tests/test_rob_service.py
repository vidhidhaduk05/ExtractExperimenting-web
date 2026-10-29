"""Tests for rob_service.py — CRUD, judgment computation, summary, export."""
import pytest
import os
import tempfile
from services import rob_service
from services.rob_tools import select_rob_tool
from database import get_connection, reset_db, init_db
from config import settings
import services.db_backend as db_mod
from services.storage_backend import get_storage


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    yield
    reset_db()
    db_mod._backend_instance = None


def _create_project_and_study(study_design="diagnostic accuracy"):
    """Helper: create a project and study, return (project_id, study_id)."""
    import uuid
    pid = str(uuid.uuid4())
    sid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO projects (project_id, name) VALUES (?, ?)",
            (pid, "Test Project"),
        )
        conn.execute(
            """INSERT INTO studies (study_id, project_id, title, study_design, abstract)
               VALUES (?, ?, ?, ?, ?)""",
            (sid, pid, "Test Study", study_design,
             "This retrospective study evaluated diagnostic accuracy."),
        )
        conn.commit()
    finally:
        conn.close()
    return pid, sid


class TestCreateAssessment:

    def test_create_quadas2_assessment(self):
        pid, sid = _create_project_and_study()
        result = rob_service.create_assessment(sid, pid, "quadas2")
        assert result["tool"] == "quadas2"
        assert result["overall_judgment"] == "pending"
        assert len(result["domain_judgments"]) == 4
        # Each domain should have signaling answers
        for dj in result["domain_judgments"]:
            assert len(dj["signaling_answers"]) > 0
            assert dj["risk_judgment"] == ""  # empty initially

    def test_create_robins_i_assessment(self):
        pid, sid = _create_project_and_study("cohort")
        result = rob_service.create_assessment(sid, pid, "robins_i")
        assert result["tool"] == "robins_i"
        assert len(result["domain_judgments"]) == 7

    def test_create_rob2_assessment(self):
        pid, sid = _create_project_and_study("randomized controlled trial")
        result = rob_service.create_assessment(sid, pid, "rob2")
        assert result["tool"] == "rob2"
        assert len(result["domain_judgments"]) == 5

    def test_create_invalid_tool_raises(self):
        pid, sid = _create_project_and_study()
        with pytest.raises(ValueError, match="Unknown RoB tool"):
            rob_service.create_assessment(sid, pid, "invalid_tool")


class TestAutoSelectAndCreate:

    def test_auto_select_diagnostic_accuracy(self):
        pid, sid = _create_project_and_study("diagnostic accuracy")
        result = rob_service.auto_select_and_create_assessment(sid, pid, "diagnostic accuracy")
        assert result["tool"] == "quadas2"

    def test_auto_select_rct(self):
        pid, sid = _create_project_and_study("randomized controlled trial")
        result = rob_service.auto_select_and_create_assessment(sid, pid, "randomized controlled trial")
        assert result["tool"] == "rob2"

    def test_auto_select_cohort(self):
        pid, sid = _create_project_and_study("retrospective cohort")
        result = rob_service.auto_select_and_create_assessment(sid, pid, "retrospective cohort")
        assert result["tool"] == "nos"

    def test_auto_select_no_match_raises(self):
        pid, sid = _create_project_and_study("narrative review")
        with pytest.raises(ValueError, match="Could not auto-select"):
            rob_service.auto_select_and_create_assessment(sid, pid, "narrative review")


class TestUpdateSignalingAnswer:

    def test_update_answer_recomputes_domain(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        # Get first domain's first answer
        first_domain = assessment["domain_judgments"][0]
        first_answer = first_domain["signaling_answers"][0]
        # Set answer to "yes"
        result = rob_service.update_signaling_answer(first_answer["answer_id"], answer="yes")
        # Find the updated domain
        for dj in result["domain_judgments"]:
            if dj["judgment_id"] == first_domain["judgment_id"]:
                # With one "yes" and rest empty, judgment should be "unclear"
                assert dj["risk_judgment"] in ("unclear", "low")

    def test_update_all_yes_gives_low(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        # Set all answers in first domain to "yes"
        first_domain = assessment["domain_judgments"][0]
        for sa in first_domain["signaling_answers"]:
            rob_service.update_signaling_answer(sa["answer_id"], answer="yes")
        # Get updated assessment
        result = rob_service.get_assessment(assessment["assessment_id"])
        for dj in result["domain_judgments"]:
            if dj["domain_key"] == first_domain["domain_key"]:
                assert dj["risk_judgment"] == "low"


class TestUpdateDomainJudgment:

    def test_human_override(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        first_domain = assessment["domain_judgments"][0]
        result = rob_service.update_domain_judgment(
            first_domain["judgment_id"],
            risk_judgment="high",
            human_verified=True,
            verified_by="researcher1",
        )
        for dj in result["domain_judgments"]:
            if dj["judgment_id"] == first_domain["judgment_id"]:
                assert dj["risk_judgment"] == "high"
                assert dj["human_verified"] == 1
                assert dj["verified_by"] == "researcher1"


class TestAIPrefill:

    def test_apply_ai_prefill(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        ai_results = {
            "domains": {
                "patient_selection": {
                    "ai_suggested": "low",
                    "ai_support": "Consecutive enrollment",
                    "ai_confidence": 0.8,
                    "answers": {
                        "sq_1_1": {"ai_answer": "yes", "ai_quote": "consecutive", "ai_page": 1, "ai_confidence": 0.9},
                    },
                },
            },
            "used_full_text": True,
            "warnings": [],
        }
        result = rob_service.apply_ai_prefill(assessment["assessment_id"], ai_results)
        assert result["domains_prefilled"] == 1
        assert result["questions_prefilled"] == 1

        # Verify AI fields were set
        updated = rob_service.get_assessment(assessment["assessment_id"])
        for dj in updated["domain_judgments"]:
            if dj["domain_key"] == "patient_selection":
                assert dj["ai_suggested"] == "low"
                assert dj["ai_confidence"] == 0.8
                for sa in dj["signaling_answers"]:
                    if sa["question_key"] == "sq_1_1":
                        assert sa["ai_answer"] == "yes"
                        assert sa["ai_quote"] == "consecutive"

    def test_accept_ai_suggestions(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        # Apply AI pre-fill
        ai_results = {
            "domains": {
                "patient_selection": {
                    "ai_suggested": "low",
                    "ai_support": "test",
                    "ai_confidence": 0.8,
                    "answers": {
                        "sq_1_1": {"ai_answer": "yes", "ai_quote": "test", "ai_page": 1, "ai_confidence": 0.9},
                        "sq_1_2": {"ai_answer": "yes", "ai_quote": "test", "ai_page": 1, "ai_confidence": 0.9},
                        "sq_1_3": {"ai_answer": "yes", "ai_quote": "test", "ai_page": 1, "ai_confidence": 0.9},
                    },
                },
            },
            "used_full_text": True,
            "warnings": [],
        }
        rob_service.apply_ai_prefill(assessment["assessment_id"], ai_results)
        # Accept
        result = rob_service.accept_ai_suggestions(assessment["assessment_id"])
        assert result["answers_accepted"] == 3

        # Verify answers were copied
        updated = rob_service.get_assessment(assessment["assessment_id"])
        for dj in updated["domain_judgments"]:
            if dj["domain_key"] == "patient_selection":
                assert dj["risk_judgment"] == "low"  # all yes → low
                for sa in dj["signaling_answers"]:
                    if sa["question_key"] in ("sq_1_1", "sq_1_2", "sq_1_3"):
                        assert sa["answer"] == "yes"


class TestProjectSummary:

    def test_summary_with_assessments(self):
        pid, sid = _create_project_and_study()
        rob_service.create_assessment(sid, pid, "quadas2")
        summary = rob_service.get_project_summary(pid)
        assert summary["total_assessments"] == 1
        assert summary["tool"] == "quadas2"
        assert len(summary["assessments"]) == 1
        assert len(summary["assessments"][0]["domains"]) == 4

    def test_summary_empty_project(self):
        import uuid
        pid = str(uuid.uuid4())
        conn = get_connection()
        try:
            conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Empty"))
            conn.commit()
        finally:
            conn.close()
        summary = rob_service.get_project_summary(pid)
        assert summary["total_assessments"] == 0


class TestExport:

    def test_export_csv(self):
        pid, sid = _create_project_and_study()
        rob_service.create_assessment(sid, pid, "quadas2")
        storage = get_storage("export")
        filename = rob_service.export_project_rob(pid, format="csv")
        assert filename.endswith(".csv")
        assert storage.file_exists(filename)
        content = storage.get_bytes(filename).decode("utf-8")
        assert len(content) > 0

    def test_export_empty_project(self):
        import uuid
        pid = str(uuid.uuid4())
        conn = get_connection()
        try:
            conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "Empty"))
            conn.commit()
        finally:
            conn.close()
        storage = get_storage("export")
        filename = rob_service.export_project_rob(pid, format="csv")
        assert storage.file_exists(filename)


class TestDeleteAssessment:

    def test_delete_removes_all(self):
        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        aid = assessment["assessment_id"]
        assert rob_service.delete_assessment(aid) is True
        assert rob_service.get_assessment(aid) is None

    def test_delete_nonexistent(self):
        assert rob_service.delete_assessment("nonexistent-id") is False

    @pytest.mark.asyncio
    async def test_delete_assessment_endpoint_auth(self):
        from routers.rob import delete_assessment as delete_assessment_endpoint
        from services.db_backend import get_db_backend
        from fastapi import HTTPException

        pid, sid = _create_project_and_study()
        assessment = rob_service.create_assessment(sid, pid, "quadas2")
        aid = assessment["assessment_id"]
        db = get_db_backend()

        # Create users in database to satisfy FOREIGN KEY constraint
        db.insert("users", {"user_id": "u_owner", "username": "owner", "password_hash": "hash"})
        db.insert("users", {"user_id": "u_viewer", "username": "viewer", "password_hash": "hash"})
        db.insert("users", {"user_id": "u_unauth", "username": "unauth", "password_hash": "hash"})

        owner_user = {"user_id": "u_owner", "username": "owner", "role": "owner"}
        viewer_user = {"user_id": "u_viewer", "username": "viewer", "role": "viewer"}
        unauth_user = {"user_id": "u_unauth", "username": "unauth", "role": "reviewer"}

        db.insert("project_members", {"project_id": pid, "user_id": "u_owner", "role": "owner"})
        db.insert("project_members", {"project_id": pid, "user_id": "u_viewer", "role": "viewer"})
        db.commit()

        # Unauthorized user (not in project) -> 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            await delete_assessment_endpoint(aid, user=unauth_user, conn=db)
        assert exc_info.value.status_code == 403

        # Viewer (insufficient role min_role="editor") -> 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            await delete_assessment_endpoint(aid, user=viewer_user, conn=db)
        assert exc_info.value.status_code == 403

        # Owner -> successful deletion
        res = await delete_assessment_endpoint(aid, user=owner_user, conn=db)
        assert res == {"deleted": True, "assessment_id": aid}

        # Delete non-existent assessment -> 404 Not Found
        with pytest.raises(HTTPException) as exc_info:
            await delete_assessment_endpoint(aid, user=owner_user, conn=db)
        assert exc_info.value.status_code == 404
