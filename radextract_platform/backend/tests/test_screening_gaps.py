"""Unit and integration tests for Screening Quality Gaps (Part A).

Tests:
1. Signal Generator (MeSH baseline, LLM augmentation, universal excludes, DB caching)
2. Signal Prefilter (word boundaries, confidence ceilings, short/empty abstract detection)
3. Safety Net Overrides (hard exclude overrides, weak signals downgrade, confidence capping, fallback)
4. AI Dual-Reviewer & Conflict Detection (recording AI decisions, auto conflict generation against human reviewers)
5. Batch AI Screening & Enhanced Screening Summary
"""

import pytest
import json
import sqlite3
from unittest.mock import patch, MagicMock

from services.signal_generator import (
    generate_signals,
    UNIVERSAL_EDITORIAL_SIGNALS,
    UNIVERSAL_ANIMAL_SIGNALS,
)
from services.signal_prefilter import prefilter_study
from services.safety_net import apply_overrides
from services.db_backend import SQLiteBackend
from database import init_db, get_connection


@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    backend = SQLiteBackend(conn=conn)
    backend.execute("""
        CREATE TABLE projects (
            project_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            pico_json TEXT,
            signals_json TEXT,
            status TEXT DEFAULT 'active'
        )
    """)
    backend.execute("""
        CREATE TABLE studies (
            study_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            abstract TEXT,
            full_text TEXT,
            pdf_path TEXT,
            pdf_status TEXT DEFAULT 'pending',
            screening_status TEXT DEFAULT 'pending',
            screening_stage TEXT DEFAULT 'title_abstract',
            screening_reason TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(project_id)
        )
    """)
    backend.execute("""
        CREATE TABLE screening_decisions (
            decision_id TEXT PRIMARY KEY,
            study_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            reviewer_id TEXT NOT NULL,
            reviewer_name TEXT,
            decision TEXT NOT NULL,
            reason_code TEXT,
            reason_text TEXT,
            stage TEXT DEFAULT 'title_abstract',
            is_blinded INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    backend.execute("""
        CREATE TABLE screening_conflicts (
            conflict_id TEXT PRIMARY KEY,
            study_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            reviewer1_id TEXT NOT NULL,
            reviewer1_decision TEXT NOT NULL,
            reviewer2_id TEXT NOT NULL,
            reviewer2_decision TEXT NOT NULL,
            resolution TEXT DEFAULT 'pending',
            resolved_by TEXT,
            resolved_at TEXT,
            status TEXT DEFAULT 'unresolved',
            created_at TEXT
        )
    """)
    backend.execute("""
        CREATE TABLE screening_configs (
            project_id TEXT PRIMARY KEY,
            blind_mode INTEGER DEFAULT 1,
            n_reviewers INTEGER DEFAULT 2,
            conflict_mode TEXT DEFAULT 'consensus'
        )
    """)
    backend.commit()
    return backend


class TestSignalGenerator:
    def test_mesh_fallback_generation(self, db_conn):
        pico = {
            "population": "patients with lung cancer and covid-19",
            "intervention": "computed tomography and radiomics",
            "comparison": "standard radiography",
            "outcome": "diagnostic accuracy and sensitivity",
        }
        db_conn.execute(
            "INSERT INTO projects (project_id, name, pico_json) VALUES (?, ?, ?)",
            ("p1", "Lung CT Review", json.dumps(pico)),
        )
        db_conn.commit()

        # Without LLM API key, falls back to MeSH baseline
        with patch.dict("os.environ", {}, clear=True):
            res = generate_signals("p1", db=db_conn, force=True)

        assert "signals" in res
        signals = res["signals"]
        assert "population_signals" in signals
        assert "hard_exclude_signals" in signals
        assert len(signals["population_signals"]) > 0
        assert len(signals["hard_exclude_signals"]) > 0

        # Check DB cache
        row = db_conn.execute("SELECT signals_json FROM projects WHERE project_id = 'p1'").fetchone()
        cached = json.loads(row["signals_json"])
        assert cached["population_signals"] == signals["population_signals"]

    def test_signal_caching_behavior(self, db_conn):
        db_conn.execute(
            "INSERT INTO projects (project_id, name, pico_json, signals_json) VALUES (?, ?, ?, ?)",
            ("p2", "Cached Project", "{}", json.dumps({"population_signals": ["custom_term"]})),
        )
        db_conn.commit()

        # Force=False should return cached
        res = generate_signals("p2", db=db_conn, force=False)
        assert res["signals"]["population_signals"] == ["custom_term"]


class TestSignalPrefilter:
    def test_exclude_signal_trigger(self):
        title = "Editorial: Why machine learning in radiology is overhyped"
        abstract = "A short commentary on current literature. Letter to the editor."
        signals = {
            "population_signals": ["radiology", "machine learning"],
            "intervention_signals": [],
            "hard_exclude_signals": ["editorial", "letter to the editor", "commentary", "mouse model", "rat model"],
        }
        res = prefilter_study(title, abstract, signals, stage="ta")
        assert res["prefilter_flag"] == "hard_exclude_hit"
        assert len(res["hard_exclude_matches"]) > 0
        assert "editorial" in res["hard_exclude_matches"]

    def test_short_abstract_confidence_ceiling(self):
        title = "Diagnostic performance of MRI in rectal cancer"
        abstract = "We studied MRI for rectal cancer in 50 patients with good accuracy."  # ~12 words (<80 words)
        signals = {
            "population_signals": ["rectal cancer"],
            "intervention_signals": ["mri"],
            "hard_exclude_signals": [],
        }
        res = prefilter_study(title, abstract, signals, stage="ta")
        assert res["prefilter_flag"] == "short_abstract"
        assert res["confidence_ceiling"] == 0.55

    def test_no_abstract_confidence_ceiling(self):
        title = "Diagnostic performance of MRI in rectal cancer"
        abstract = ""
        signals = {
            "population_signals": ["rectal cancer"],
            "intervention_signals": ["mri"],
            "hard_exclude_signals": [],
        }
        res = prefilter_study(title, abstract, signals, stage="ta")
        assert res["prefilter_flag"] == "no_abstract"
        assert res["confidence_ceiling"] == 0.40

    def test_word_boundary_matching(self):
        # 'rat' should not match 'accurate' or 'rationale'
        title = "Accurate assessment of rationale in cardiac imaging"
        abstract = "This is a comprehensive study evaluating accuracy and rationale."
        signals = {
            "population_signals": ["cardiac"],
            "intervention_signals": [],
            "hard_exclude_signals": ["rat"],
        }
        res = prefilter_study(title, abstract, signals, stage="ta")
        assert res["hard_exclude_matches"] == []
        assert res["prefilter_flag"] != "hard_exclude_hit"


class TestSafetyNet:
    def test_hard_exclude_override_on_editorial(self):
        llm_result = {
            "recommendation": "included",
            "confidence": 0.95,
            "reason_code": "INC_POPULATION",
            "reason_text": "Matches population",
            "rationale": "High quality study",
        }
        prefilter_result = {
            "prefilter_flag": "hard_exclude_hit",
            "hard_exclude_matches": ["editorial"],
            "confidence_ceiling": 1.0,
        }
        signals = {"hard_exclude_signals": ["editorial"]}

        final = apply_overrides(llm_result, prefilter_result, signals, stage="ta")
        assert final["recommendation"] == "excluded"
        assert any("SAFETY-NET" in note for note in final["override_notes"])

    def test_weak_signals_downgrades_to_uncertain(self):
        llm_result = {
            "recommendation": "included",
            "confidence": 0.85,
            "reason_code": "INC_RELEVANT",
            "reason_text": "Relevant",
            "rationale": "Looks fine",
        }
        prefilter_result = {
            "prefilter_flag": "weak_signals",
            "hard_exclude_matches": [],
            "confidence_ceiling": 0.65,
        }
        signals = {"hard_exclude_signals": []}

        final = apply_overrides(llm_result, prefilter_result, signals, stage="ta")
        assert final["recommendation"] == "uncertain"
        assert final["confidence"] <= 0.65

    def test_fulltext_without_pdf_failsafe(self):
        llm_result = {
            "recommendation": "included",
            "confidence": 0.90,
            "reason_code": "INC_POPULATION",
            "reason_text": "Good",
            "rationale": "Full text screened",
        }
        prefilter_result = {"prefilter_flag": "clear", "confidence_ceiling": 1.0, "hard_exclude_matches": []}
        signals = {}

        final = apply_overrides(llm_result, prefilter_result, signals, stage="ft", pdf_text_available=False)
        assert final["recommendation"] == "uncertain"
        assert final["confidence"] <= 0.45


class TestDualReviewerAndConflicts:
    def test_ai_screen_and_conflict_creation(self, db_conn):
        from routers.screening import _check_and_record_conflict

        # Setup project & study
        db_conn.execute("INSERT INTO projects (project_id, name) VALUES ('p1', 'Test')")
        db_conn.execute("INSERT INTO studies (study_id, project_id, title) VALUES ('s1', 'p1', 'CT Imaging')")
        
        # Human reviewer says 'included'
        db_conn.execute("""
            INSERT INTO screening_decisions
            (decision_id, study_id, project_id, reviewer_id, reviewer_name, decision, stage)
            VALUES ('d1', 's1', 'p1', 'human_user', 'Dr. Smith', 'included', 'title_abstract')
        """)
        db_conn.commit()

        # AI screens and says 'excluded'
        conflict = _check_and_record_conflict(
            db_conn,
            study_id="s1",
            project_id="p1",
            stage="title_abstract",
            latest_decision="excluded",
            reason_text="Excluded due to animal model",
        )

        assert conflict is True

        # Verify conflict in DB
        row = db_conn.execute("SELECT * FROM screening_conflicts WHERE study_id = 's1'").fetchone()
        assert row is not None
        assert row["status"] == "unresolved"
        assert row["reviewer1_decision"] == "included"
        assert row["reviewer2_decision"] == "excluded"
