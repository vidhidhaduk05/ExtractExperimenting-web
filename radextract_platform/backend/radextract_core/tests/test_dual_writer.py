"""
test_dual_writer.py — tests for the multi-format output writer.

Tests cover:
  - Column name sanitization
  - SQLite schema creation with FKs
  - SQLite round-trip (write → read → compare)
  - JSON flat output structure
  - JSON nested output with entity graph hierarchy
  - Combined write_all (Excel + JSON + SQLite)
  - S3-safe writing
"""
import os
import json
import sqlite3
import tempfile
import pytest

os.environ.setdefault("PYTHONPATH", "/workspace/radextract")

from radextract_core.radextract.dual_writer import (
    sanitize_column_name, sanitize_table_name, build_column_map,
    write_sqlite, read_sqlite, write_json_flat, write_json_nested,
    write_all, SQL_TYPE_MAP,
)
from radextract_core.litextract.schema import load_project


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture
def project():
    base_config = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../configs/radiology_base")
    )
    return load_project(base_config)


@pytest.fixture
def sample_records():
    """Sample records matching the radiology_base entity graph."""
    return {
        "Study_Level": [{
            "Study ID": "S001",
            "First Author": "Smith",
            "Publication Year": 2024,
            "Journal": "Radiology",
            "DOI": "10.1148/radiol.2024",
            "PMID": "12345678",
            "Country": "USA",
            "Study Design": "diagnostic_accuracy",
            "Study Setting": "single_center",
            "N Centers": 1,
            "Enrollment Period": "2020-2023",
            "Funding Source": "government",
            "Conflict of Interest": "none_declared",
            "Registration": "none",
            "Registration ID": "NR",
        }],
        "Cohort_Level": [{
            "Study ID": "S001",
            "Cohort ID": "C1",
            "Cohort Role": "disease",
            "Disease/Condition": "glioma",
            "Sample Size (Enrolled)": 50,
            "N Analyzed": 48,
            "Age Group": "adult",
            "Age, Central Value (years)": 45.0,
            "Age, Dispersion Type": "mean_sd",
            "Age, Dispersion Value": 12.0,
            "Female (%)": 55.0,
            "Race/Ethnicity": "NR",
            "Clinical Indication": "glioma evaluation",
            "Inclusion Criteria": "adult patients with suspected glioma",
            "Exclusion Criteria": "prior biopsy",
            "Comorbidities": "NR",
        }],
        "Protocol_Level": [{
            "Cohort ID": "C1",
            "Protocol ID": "P1",
            "Modality": "MRI",
            "Scanner Manufacturer": "Siemens",
            "Scanner Model": "Trio",
            "Field Strength (T)": "3.0",
            "Contrast Agent": "gadolinium",
            "Contrast Dose": "0.1 mmol/kg",
            "Sequence Type": "T1",
        }],
        "Outcome_Level": [{
            "Protocol ID": "P1",
            "Outcome ID": "O1",
            "Result Type": "diagnostic_accuracy",
            "Specific Outcome Label": "IDH detection accuracy",
            "Reference Standard": "histopathology",
            "ROI/Region Category": "lesion",
            "N Analyzed": 48,
            "Sensitivity (%)": 85.0,
            "Specificity (%)": 90.0,
            "Unit (as reported)": "percent",
            "Standardized Unit Family": "percent",
        }],
        "Quality_Assessment": [{
            "Study ID": "S001",
            "QA ID": "QA1",
            "Assessment Tool": "QUADAS_2",
            "D1: Patient Selection — Risk of Bias": "low",
            "D2: Index Test — Risk of Bias": "low",
            "D3: Reference Standard — Risk of Bias": "low",
            "D4: Flow and Timing — Risk of Bias": "low",
            "Overall Risk of Bias": "low",
            "Overall Applicability": "low",
        }],
    }


# --------------------------------------------------------------------------- #
# Column name sanitization tests
# --------------------------------------------------------------------------- #
class TestSanitizeColumnName:
    def test_simple_name(self):
        assert sanitize_column_name("Study ID") == "study_id"

    def test_name_with_colon(self):
        assert sanitize_column_name("D1: Patient Selection — Risk of Bias") == "d1_patient_selection_risk_of_bias"

    def test_name_with_parentheses(self):
        assert sanitize_column_name("Age, Central Value (years)") == "age_central_value_years"

    def test_name_with_slash(self):
        assert sanitize_column_name("ROI/Region Category") == "roi_region_category"

    def test_name_starting_with_digit(self):
        assert sanitize_column_name("3D Volume") == "col_3d_volume"

    def test_empty_name(self):
        assert sanitize_column_name("") == "unnamed"

    def test_table_name(self):
        assert sanitize_table_name("Study_Level") == "study_level"
        assert sanitize_table_name("Quality_Assessment") == "quality_assessment"

    def test_collision_handling(self):
        mapping = build_column_map(["Study ID", "Study_Id", "study id"])
        # All three should map to different SQL names
        sql_names = list(mapping.values())
        assert len(sql_names) == len(set(sql_names)), f"Collision: {mapping}"


# --------------------------------------------------------------------------- #
# SQLite writer tests
# --------------------------------------------------------------------------- #
class TestSQLiteWriter:
    def test_write_and_read_roundtrip(self, project, sample_records, tmp_path):
        """Write to SQLite, read back, and verify records match."""
        db_path = str(tmp_path / "test.db")
        result = write_sqlite(sample_records, project, db_path)

        assert os.path.exists(db_path)
        assert result["tables"]["Study_Level"] == 1
        assert result["tables"]["Cohort_Level"] == 1
        assert result["tables"]["Outcome_Level"] == 1

        # Read back
        loaded = read_sqlite(db_path, project)

        # Verify Study_Level
        assert len(loaded["Study_Level"]) == 1
        assert loaded["Study_Level"][0]["Study ID"] == "S001"
        assert loaded["Study_Level"][0]["First Author"] == "Smith"

        # Verify Cohort_Level
        assert len(loaded["Cohort_Level"]) == 1
        assert loaded["Cohort_Level"][0]["Cohort ID"] == "C1"
        assert loaded["Cohort_Level"][0]["Sample Size (Enrolled)"] == 50

        # Verify Quality_Assessment with colon-containing field names
        assert len(loaded["Quality_Assessment"]) == 1
        assert loaded["Quality_Assessment"][0]["D1: Patient Selection — Risk of Bias"] == "low"

    def test_foreign_keys_exist(self, project, sample_records, tmp_path):
        """Verify that foreign key constraints are created."""
        db_path = str(tmp_path / "test_fk.db")
        write_sqlite(sample_records, project, db_path)

        conn = sqlite3.connect(db_path)
        # Check FKs on cohort_level
        fks = conn.execute("PRAGMA foreign_key_list(cohort_level)").fetchall()
        assert len(fks) > 0
        # The FK should reference study_level
        fk_info = fks[0]
        assert "study_level" in fk_info[2]  # referenced table

        # Check FKs on outcome_level → protocol_level
        fks = conn.execute("PRAGMA foreign_key_list(outcome_level)").fetchall()
        assert len(fks) > 0

        conn.close()

    def test_metadata_table(self, project, sample_records, tmp_path):
        """Verify the _radextract_metadata table stores column mappings."""
        db_path = str(tmp_path / "test_meta.db")
        write_sqlite(sample_records, project, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM _radextract_metadata").fetchone()
        assert rows[0] > 0  # should have entries for all fields across all sheets

        # Check a specific mapping
        row = conn.execute(
            "SELECT original_name, sql_column FROM _radextract_metadata WHERE original_name = ?",
            ("Study ID",)
        ).fetchone()
        assert row is not None
        assert row[1] == "study_id"
        conn.close()

    def test_indexes_created(self, project, sample_records, tmp_path):
        """Verify indexes are created on parent_key columns."""
        db_path = str(tmp_path / "test_idx.db")
        write_sqlite(sample_records, project, db_path)

        conn = sqlite3.connect(db_path)
        # Check index on cohort_level.study_id
        indexes = conn.execute("PRAGMA index_list(cohort_level)").fetchall()
        assert len(indexes) > 0
        conn.close()

    def test_multiple_studies(self, project, tmp_path):
        """Test with multiple studies to verify FK relationships work."""
        records = {
            "Study_Level": [
                {"Study ID": "S001", "First Author": "Smith", "Publication Year": 2024},
                {"Study ID": "S002", "First Author": "Jones", "Publication Year": 2023},
            ],
            "Cohort_Level": [
                {"Study ID": "S001", "Cohort ID": "C1", "Disease/Condition": "glioma"},
                {"Study ID": "S001", "Cohort ID": "C2", "Disease/Condition": "meningioma"},
                {"Study ID": "S002", "Cohort ID": "C3", "Disease/Condition": "stroke"},
            ],
            "Protocol_Level": [],
            "Outcome_Level": [],
            "Quality_Assessment": [],
        }
        db_path = str(tmp_path / "multi.db")
        write_sqlite(records, project, db_path)

        loaded = read_sqlite(db_path, project)
        assert len(loaded["Study_Level"]) == 2
        assert len(loaded["Cohort_Level"]) == 3

        # Verify FK relationship via SQL join
        conn = sqlite3.connect(db_path)
        results = conn.execute("""
            SELECT s."first_author", c."disease_condition"
            FROM study_level s
            JOIN cohort_level c ON s."study_id" = c."study_id"
            ORDER BY s."study_id", c."cohort_id"
        """).fetchall()
        assert len(results) == 3
        assert results[0] == ("Smith", "glioma")
        assert results[1] == ("Smith", "meningioma")
        assert results[2] == ("Jones", "stroke")
        conn.close()


# --------------------------------------------------------------------------- #
# JSON writer tests
# --------------------------------------------------------------------------- #
class TestJSONWriter:
    def test_json_flat_structure(self, project, sample_records, tmp_path):
        json_path = str(tmp_path / "flat.json")
        result = write_json_flat(sample_records, project, json_path)

        assert os.path.exists(json_path)
        with open(json_path) as f:
            data = json.load(f)

        assert data["project"] == project.name
        assert "Study_Level" in data["sheets"]
        assert len(data["sheets"]["Study_Level"]) == 1
        assert data["sheets"]["Study_Level"][0]["Study ID"] == "S001"

    def test_json_nested_structure(self, project, sample_records, tmp_path):
        json_path = str(tmp_path / "nested.json")
        result = write_json_nested(sample_records, project, json_path)

        assert os.path.exists(json_path)
        assert result["n_studies"] == 1

        with open(json_path) as f:
            data = json.load(f)

        assert data["project"] == project.name
        assert len(data["studies"]) == 1

        study = data["studies"][0]
        assert "Study_Level" in study
        assert study["Study_Level"]["Study ID"] == "S001"

        # Check nested cohorts
        children = study["_children"]
        assert "Cohort_Level" in children
        assert len(children["Cohort_Level"]) == 1
        assert children["Cohort_Level"][0]["Cohort ID"] == "C1"

        # Check nested protocols under cohort
        cohort_children = children["Cohort_Level"][0]["_children"]
        assert "Protocol_Level" in cohort_children
        assert len(cohort_children["Protocol_Level"]) == 1

        # Check nested outcomes under protocol
        protocol_children = cohort_children["Protocol_Level"][0]["_children"]
        assert "Outcome_Level" in protocol_children
        assert len(protocol_children["Outcome_Level"]) == 1
        assert protocol_children["Outcome_Level"][0]["Outcome ID"] == "O1"

        # Check quality assessments under study
        assert "Quality_Assessment" in children
        assert len(children["Quality_Assessment"]) == 1
        assert children["Quality_Assessment"][0]["QA ID"] == "QA1"

    def test_json_nested_multiple_studies(self, project, tmp_path):
        records = {
            "Study_Level": [
                {"Study ID": "S001", "First Author": "Smith"},
                {"Study ID": "S002", "First Author": "Jones"},
            ],
            "Cohort_Level": [
                {"Study ID": "S001", "Cohort ID": "C1"},
                {"Study ID": "S002", "Cohort ID": "C2"},
            ],
            "Protocol_Level": [],
            "Outcome_Level": [],
            "Quality_Assessment": [
                {"Study ID": "S001", "QA ID": "QA1", "Assessment Tool": "QUADAS_2"},
            ],
        }
        json_path = str(tmp_path / "multi_nested.json")
        result = write_json_nested(records, project, json_path)

        with open(json_path) as f:
            data = json.load(f)

        assert len(data["studies"]) == 2
        # S001 should have 1 cohort and 1 QA
        s001 = [s for s in data["studies"] if s["Study_Level"]["Study ID"] == "S001"][0]
        assert len(s001["_children"]["Cohort_Level"]) == 1
        assert len(s001["_children"]["Quality_Assessment"]) == 1

        # S002 should have 1 cohort and 0 QAs
        s002 = [s for s in data["studies"] if s["Study_Level"]["Study ID"] == "S002"][0]
        assert len(s002["_children"]["Cohort_Level"]) == 1
        assert len(s002["_children"]["Quality_Assessment"]) == 0


# --------------------------------------------------------------------------- #
# Combined write_all tests
# --------------------------------------------------------------------------- #
class TestWriteAll:
    def test_all_formats(self, project, sample_records, tmp_path):
        src_wb = project.codebook_path
        dest_dir = str(tmp_path / "output")

        result = write_all(sample_records, project, src_wb, dest_dir, project_slug="test_proj")

        assert os.path.exists(os.path.join(dest_dir, "test_proj_extraction.xlsx"))
        assert os.path.exists(os.path.join(dest_dir, "test_proj_extraction_flat.json"))
        assert os.path.exists(os.path.join(dest_dir, "test_proj_extraction_nested.json"))
        assert os.path.exists(os.path.join(dest_dir, "test_proj_extraction.db"))

        assert result["excel"] is not None
        assert result["json_flat"] is not None
        assert result["json_nested"] is not None
        assert result["sqlite"] is not None

    def test_selective_formats(self, project, sample_records, tmp_path):
        """Only write SQLite, skip Excel and JSON."""
        src_wb = project.codebook_path
        dest_dir = str(tmp_path / "output_sqlite_only")

        result = write_all(
            sample_records, project, src_wb, dest_dir,
            project_slug="sqlite_only",
            do_excel=False,
            do_json_flat=False,
            do_json_nested=False,
            do_sqlite=True,
        )

        assert result["excel"] is None
        assert result["json_flat"] is None
        assert result["json_nested"] is None
        assert result["sqlite"] is not None
        assert os.path.exists(os.path.join(dest_dir, "sqlite_only_extraction.db"))

    def test_roundtrip_all_formats(self, project, sample_records, tmp_path):
        """Write all formats, read SQLite back, verify consistency."""
        src_wb = project.codebook_path
        dest_dir = str(tmp_path / "output_rt")

        write_all(sample_records, project, src_wb, dest_dir, project_slug="rt_test")

        # Read SQLite back
        db_path = os.path.join(dest_dir, "rt_test_extraction.db")
        loaded = read_sqlite(db_path, project)

        # Verify key fields match
        assert loaded["Study_Level"][0]["Study ID"] == sample_records["Study_Level"][0]["Study ID"]
        assert loaded["Cohort_Level"][0]["Cohort ID"] == sample_records["Cohort_Level"][0]["Cohort ID"]
        assert loaded["Outcome_Level"][0]["Outcome ID"] == sample_records["Outcome_Level"][0]["Outcome ID"]
        assert loaded["Quality_Assessment"][0]["QA ID"] == sample_records["Quality_Assessment"][0]["QA ID"]
