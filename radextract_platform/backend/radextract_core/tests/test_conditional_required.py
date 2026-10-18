"""
test_conditional_required.py — test the new conditional_required validation rule.

Verifies:
  - Field is required when condition_field == condition_value (equal mode)
  - Field is required when condition_field != condition_value (not_equal mode)
  - No error when condition is not met
  - No error when required field is populated
  - Missing tokens (NR, NA) satisfy the requirement
  - QUADAS-2 / ROBINS-I conditional domains work correctly
"""
import os
import sys
import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO not in sys.path:
    sys.path.insert(0, REPO)

from radextract_core.litextract.validate import validate, _rule_conditional_required
from radextract_core.litextract.schema import Schema, Project
from dataclasses import dataclass
import yaml


# --------------------------------------------------------------------------- #
# Minimal project for testing conditional_required
# --------------------------------------------------------------------------- #
@pytest.fixture
def cond_project():
    """A minimal project with conditional_required rules for testing."""
    schema = Schema(
        data_sheets=["Protocol_Level", "Quality_Assessment"],
        entity_graph={
            "Protocol_Level": {"role": "parent", "key": "Protocol ID", "parent": None, "parent_key": None},
            "Quality_Assessment": {"role": "child", "key": "QA ID", "parent": "Protocol_Level", "parent_key": "Protocol ID"},
        },
        field_types={},
        missing_tokens=["NR", "NA", "unclear", "not_reported", "none", ""],
        type_defaults={},
        data_start_row=3,
    )

    rules = [
        # equal mode: Field Strength required when Modality == MRI
        {"id": "mri_fs", "kind": "conditional_required", "sheet": "Protocol_Level",
         "condition_field": "Modality", "condition_value": "MRI",
         "required_field": "Field Strength (T)", "severity": "error",
         "message": "Field Strength required when Modality is MRI"},
        # equal mode: kVp required when Modality == CT
        {"id": "ct_kvp", "kind": "conditional_required", "sheet": "Protocol_Level",
         "condition_field": "Modality", "condition_value": "CT",
         "required_field": "kVp", "severity": "error",
         "message": "kVp required when Modality is CT"},
        # not_equal mode: Contrast Dose required when Contrast Agent != none
        {"id": "contrast_dose", "kind": "conditional_required", "sheet": "Protocol_Level",
         "condition_field": "Contrast Agent", "condition_value": "none",
         "required_field": "Contrast Dose", "condition_mode": "not_equal",
         "severity": "error",
         "message": "Contrast Dose required when Contrast Agent is not 'none'"},
        # QUADAS-2: D1 Risk of Bias required when Assessment Tool == QUADAS_2
        {"id": "quadas_d1", "kind": "conditional_required", "sheet": "Quality_Assessment",
         "condition_field": "Assessment Tool", "condition_value": "QUADAS_2",
         "required_field": "D1: Patient Selection — Risk of Bias", "severity": "error",
         "message": "QUADAS-2 D1 required"},
        # ROBINS-I: D1 Confounding required when Assessment Tool == ROBINS_I
        {"id": "robins_d1", "kind": "conditional_required", "sheet": "Quality_Assessment",
         "condition_field": "Assessment Tool", "condition_value": "ROBINS_I",
         "required_field": "D1: Confounding", "severity": "error",
         "message": "ROBINS-I D1 required"},
    ]

    @dataclass
    class FakeProject:
        schema: Schema
        rules: list
        def data_sheets(self): return self.schema.data_sheets

    return FakeProject(schema=schema, rules=rules)


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
class TestConditionalRequired:
    """Test the conditional_required rule kind."""

    def test_equal_mode_triggers_error(self, cond_project):
        """Field Strength missing when Modality=MRI → error."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "MRI"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error"]
        assert any("Field Strength" in i["issue"] for i in errors), \
            f"Expected Field Strength error, got: {issues}"

    def test_equal_mode_no_error_when_populated(self, cond_project):
        """Field Strength present when Modality=MRI → no error."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "MRI", "Field Strength (T)": "3.0"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "Field Strength" in i["issue"]]
        assert len(errors) == 0, f"Unexpected error: {errors}"

    def test_equal_mode_no_error_when_condition_not_met(self, cond_project):
        """Modality=CT → Field Strength not required."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "CT", "kVp": 120}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "Field Strength" in i["issue"]]
        assert len(errors) == 0, f"Unexpected Field Strength error: {errors}"

    def test_ct_kvp_triggers_error(self, cond_project):
        """kVp missing when Modality=CT → error."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "CT"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "kVp" in i["issue"]]
        assert len(errors) > 0, f"Expected kVp error, got: {issues}"

    def test_not_equal_mode_triggers_error(self, cond_project):
        """Contrast Dose missing when Contrast Agent=gadolinium (≠ none) → error."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "MRI",
                                        "Field Strength (T)": "3.0",
                                        "Contrast Agent": "gadolinium"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "Contrast Dose" in i["issue"]]
        assert len(errors) > 0, f"Expected Contrast Dose error, got: {issues}"

    def test_not_equal_mode_no_error_when_none(self, cond_project):
        """Contrast Agent=none → Contrast Dose not required."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "MRI",
                                        "Field Strength (T)": "3.0",
                                        "Contrast Agent": "none"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "Contrast Dose" in i["issue"]]
        assert len(errors) == 0, f"Unexpected Contrast Dose error: {errors}"

    def test_missing_token_satisfies_requirement(self, cond_project):
        """Field Strength=NR when Modality=MRI → no error (NR is a valid answer)."""
        records = {"Protocol_Level": [{"Protocol ID": "P1", "Modality": "MRI", "Field Strength (T)": "NR"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "Field Strength" in i["issue"]]
        assert len(errors) == 0, f"NR should satisfy requirement, but got: {errors}"

    def test_quadas_conditional(self, cond_project):
        """QUADAS-2 D1 missing when Assessment Tool=QUADAS_2 → error."""
        records = {"Protocol_Level": [],
                   "Quality_Assessment": [{"QA ID": "QA1", "Assessment Tool": "QUADAS_2"}]}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "QUADAS-2 D1" in i["issue"]]
        assert len(errors) > 0, f"Expected QUADAS-2 D1 error, got: {issues}"

    def test_robins_conditional(self, cond_project):
        """ROBINS-I D1 missing when Assessment Tool=ROBINS_I → error."""
        records = {"Protocol_Level": [],
                   "Quality_Assessment": [{"QA ID": "QA1", "Assessment Tool": "ROBINS_I"}]}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        errors = [i for i in issues if i["severity"] == "error" and "ROBINS-I D1" in i["issue"]]
        assert len(errors) > 0, f"Expected ROBINS-I D1 error, got: {issues}"

    def test_quadas_no_robins_error(self, cond_project):
        """When Assessment Tool=QUADAS_2, ROBINS-I D1 should NOT be required."""
        records = {"Protocol_Level": [],
                   "Quality_Assessment": [{"QA ID": "QA1", "Assessment Tool": "QUADAS_2",
                                           "D1: Patient Selection — Risk of Bias": "low"}]}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        robins_errors = [i for i in issues if i["severity"] == "error" and "ROBINS-I" in i["issue"]]
        assert len(robins_errors) == 0, f"ROBINS-I should not be required for QUADAS_2: {robins_errors}"

    def test_condition_field_blank_skips(self, cond_project):
        """When condition field is blank, rule should not fire."""
        records = {"Protocol_Level": [{"Protocol ID": "P1"}],
                   "Quality_Assessment": []}
        issues, summary = validate(records, cond_project, run_required=False, run_vocab=False)
        cond_errors = [i for i in issues if i["severity"] == "error"]
        assert len(cond_errors) == 0, f"Should not fire when condition field is blank: {cond_errors}"
