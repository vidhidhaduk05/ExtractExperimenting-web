"""
test_end_to_end.py — full pipeline integration test with deterministic backends.

Exercises the complete RadExtract lifecycle:
  1. PICOS input → schema generation (DeterministicSchemaGenerator)
  2. Sample papers → screening (DeterministicScreener) → ready_for_extraction
  3. Document processing (MockProcessor) → parsed dicts
  4. Dual-extractor pipeline (DeterministicBackend A + B) → reconcile → adjudicate
  5. Validation → verify 0 errors on clean records
  6. Dual-output writing (Excel + JSON flat + JSON nested + SQLite)
  7. SQLite round-trip verification

All backends are deterministic — no LLM, no PDF, no network. This test proves
the plumbing works end-to-end and that the generated config produces valid records.
"""
import os
import json
import pytest

os.environ.setdefault("PYTHONPATH", "/workspace/radextract")

from radextract_core.litextract.schema import load_project
from radextract_core.litextract.extract import DeterministicBackend, Record
from radextract_core.litextract.pipeline import run
from radextract_core.litextract.validate import validate

from radextract_core.radextract.picos_schema_generator import (
    PICOS, DeterministicSchemaGenerator, GeneratedField, generate_project_config,
)
from radextract_core.radextract.screening import (
    DeterministicScreener, screen_batch, get_ready_papers,
)
from radextract_core.radextract.document_processor import MockProcessor
from radextract_core.radextract.dual_writer import write_all, read_sqlite


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
PICOS_DICT = {
    "population": "adult patients with glioma",
    "intervention": "MRI with DSC perfusion",
    "comparator": "histopathology",
    "outcome": "IDH mutation detection accuracy",
    "study_design": "diagnostic accuracy study",
}

def _make_sample_papers():
    return [
        {"pmid": "11111111", "title": "MRI sensitivity for IDH mutation detection in glioma",
         "abstract": "We evaluated MRI perfusion for detecting IDH mutations in 50 glioma patients."},
        {"pmid": "22222222", "title": "CT vs MRI for stroke imaging",
         "abstract": "This study compared CT and MRI for acute stroke detection in 200 patients."},
        {"pmid": "33333333", "title": "A review of imaging techniques in oncology",
         "abstract": "This narrative review summarizes current imaging modalities in cancer."},
    ]


def _make_screener():
    return DeterministicScreener(decisions_by_id={
        "11111111": {"ta_status": "include", "ta_reason": "Relevant",
                      "ft_status": "include", "ft_reason": "Meets criteria"},
        "22222222": {"ta_status": "include", "ta_reason": "Possibly relevant",
                      "ft_status": "exclude", "ft_reason": "Not about IDH"},
        "33333333": {"ta_status": "exclude", "ta_reason": "Narrative review"},
    })


def _make_extraction_record(project):
    """Build a clean Record that passes all validation rules."""
    def fill(fields, overrides):
        row = {}
        for f in fields:
            row[f] = overrides.get(f, "NR")
        return row

    study_fields = [name for _, name in project.sheet_order.get("Study_Level", [])]
    cohort_fields = [name for _, name in project.sheet_order.get("Cohort_Level", [])]
    protocol_fields = [name for _, name in project.sheet_order.get("Protocol_Level", [])]
    outcome_fields = [name for _, name in project.sheet_order.get("Outcome_Level", [])]
    qa_fields = [name for _, name in project.sheet_order.get("Quality_Assessment", [])]

    parent_row = fill(study_fields, {
        "Study ID": "S001", "First Author": "Smith", "Publication Year": 2024,
        "Journal": "Radiology", "DOI": "10.1148/radiol.2024", "PMID": "11111111",
        "Country": "USA", "Study Design": "diagnostic_accuracy", "Study Setting": "single_center",
        "N Centers": 1, "Enrollment Period": "2020-2023", "Funding Source": "government",
        "Conflict of Interest": "none_declared", "Registration": "none", "Registration ID": "NR",
    })

    cohort_row = fill(cohort_fields, {
        "Study ID": "S001", "Cohort ID": "C1", "Cohort Role": "disease",
        "Disease/Condition": "glioma", "Sample Size (Enrolled)": 50, "N Analyzed": 48,
        "Age Group": "adult", "Age, Central Value (years)": 45.0,
        "Age, Dispersion Type": "SD", "Age, Dispersion Value": 12.0,
        "Female (%)": 55.0, "Race/Ethnicity": "NR", "Clinical Indication": "glioma evaluation",
        "Inclusion Criteria": "adult patients with suspected glioma",
        "Exclusion Criteria": "prior biopsy", "Comorbidities": "NR",
        "IDH Mutation Status": "mutant",
    })

    protocol_row = fill(protocol_fields, {
        "Cohort ID": "C1", "Protocol ID": "P1", "Modality": "MRI",
        "Scanner Manufacturer": "Siemens", "Scanner Model": "Trio",
        "Field Strength (T)": "3.0", "Contrast Agent": "gadolinium",
        "Contrast Dose": "0.1 mmol/kg", "Sequence Type": "T1",
        "CBV Measurement Method": "DSC",
    })

    outcome_row = fill(outcome_fields, {
        "Protocol ID": "P1", "Outcome ID": "O1", "Result Type": "diagnostic_accuracy",
        "Specific Outcome Label": "IDH detection accuracy", "Reference Standard": "histopathology",
        "ROI/Region Category": "lesion", "N Analyzed": 48,
        "Sensitivity (%)": 85.0, "Specificity (%)": 90.0,
        "Unit (as reported)": "percent", "Standardized Unit Family": "percent",
        "IDH Detection Sensitivity (%)": 85.0, "IDH Detection Specificity (%)": 90.0,
        "IDH Detection AUC": 0.92, "Optimal CBV Cutoff": 1.8,
    })

    qa_row = fill(qa_fields, {
        "Study ID": "S001", "QA ID": "QA1", "Assessment Tool": "QUADAS_2",
        "D1: Patient Selection — Risk of Bias": "low",
        "D2: Index Test — Risk of Bias": "low",
        "D3: Reference Standard — Risk of Bias": "low",
        "D4: Flow and Timing — Risk of Bias": "low",
        "Overall Risk of Bias": "low", "Overall Applicability": "low",
    })

    return Record(
        parent_row=parent_row,
        child_rows={"Cohort_Level": [cohort_row], "Protocol_Level": [protocol_row],
                    "Outcome_Level": [outcome_row], "Quality_Assessment": [qa_row]},
    )


PAPER_TEXT = (
    "Smith et al. evaluated MRI perfusion for detecting IDH mutations in glioma. "
    "Fifty adult patients with suspected glioma were enrolled. "
    "MRI was performed on a 3T Siemens scanner with gadolinium contrast. "
    "The reference standard was histopathology. "
    "Sensitivity was 85%, specificity 90%, AUC 0.92. "
    "QUADAS-2 assessment showed low risk of bias across all domains."
)


def _make_picos_fields():
    """PICOS-generated fields for the glioma IDH MRI example (from the plan)."""
    return [
        GeneratedField(sheet="Cohort_Level", order=17, name="IDH Mutation Status",
                       field_type="enum", allowed_values=["mutant", "wildtype", "unknown"],
                       description="IDH mutation status of the cohort",
                       why="Defines the molecular subtype being evaluated"),
        GeneratedField(sheet="Protocol_Level", order=25, name="CBV Measurement Method",
                       field_type="enum", allowed_values=["DSC", "DCE", "ASL", "other"],
                       description="Method used to measure cerebral blood volume",
                       why="Determines comparability of perfusion results"),
        GeneratedField(sheet="Outcome_Level", order=27, name="IDH Detection Sensitivity (%)",
                       field_type="percent", allowed_values=[], range_min=0, range_max=100,
                       description="Sensitivity for IDH mutation detection",
                       why="Primary diagnostic accuracy metric"),
        GeneratedField(sheet="Outcome_Level", order=28, name="IDH Detection Specificity (%)",
                       field_type="percent", allowed_values=[], range_min=0, range_max=100,
                       description="Specificity for IDH mutation detection",
                       why="Primary diagnostic accuracy metric"),
        GeneratedField(sheet="Outcome_Level", order=29, name="IDH Detection AUC",
                       field_type="float", allowed_values=[], range_min=0, range_max=1,
                       description="AUC for IDH mutation detection",
                       why="Overall diagnostic performance"),
        GeneratedField(sheet="Outcome_Level", order=30, name="Optimal CBV Cutoff",
                       field_type="float", allowed_values=[], range_min=0, range_max=10,
                       description="Optimal CBV cutoff value for IDH detection",
                       why="Threshold used for binary classification"),
    ]


# --------------------------------------------------------------------------- #
# End-to-end tests
# --------------------------------------------------------------------------- #
class TestEndToEnd:

    def test_full_pipeline_deterministic(self, tmp_path):
        # 1. PICOS → schema generation
        picos = PICOS(
            population="adult patients with glioma",
            intervention="MRI with DSC perfusion",
            comparator="histopathology",
            outcome="IDH mutation detection accuracy",
            study_design="diagnostic accuracy study",
        )
        gen = DeterministicSchemaGenerator(fields=_make_picos_fields())
        base_config = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../configs/radiology_base")
        )
        result = generate_project_config(picos, gen, base_config, str(tmp_path))
        config_dir = result["config_dir"]
        assert result["n_total_fields"] > 100

        project = load_project(config_dir)
        assert len(project.data_sheets()) == 5

        # 2. Screening
        papers = _make_sample_papers()
        screener = _make_screener()
        full_texts = {"11111111": PAPER_TEXT, "22222222": "Some full text for stroke study."}
        flow_result = screen_batch(papers, screener, PICOS_DICT, full_texts=full_texts)
        flow = flow_result["prisma_flow"]
        assert flow["identified"] == 3
        assert flow["ready_for_extraction"] == 1

        ready = get_ready_papers(flow_result["final_statuses"], papers)
        assert len(ready) == 1
        assert ready[0]["pmid"] == "11111111"

        # 3. Document processing
        proc = MockProcessor()
        doc = proc.convert(PAPER_TEXT, doc_id="11111111")
        assert doc.triage == "FULL_TEXT"

        # 4-5. Extraction + pipeline
        record = _make_extraction_record(project)
        extractor_a = DeterministicBackend(record=record, agent_id="A")
        extractor_b = DeterministicBackend(record=record, agent_id="B")

        pipeline_result = run(
            project, PAPER_TEXT,
            extractor_a=extractor_a, extractor_b=extractor_b,
            parsed=doc.parsed, doc_id="11111111",
        )

        # 6. Validation — 0 errors
        records = pipeline_result["records"]
        issues, vsummary = validate(records, project)
        errors = [i for i in issues if i["severity"] == "error"]
        if errors:
            for e in errors:
                print(f"VALIDATION ERROR: {e}")
        assert len(errors) == 0, f"Expected 0 errors, got {len(errors)}: {errors}"

        # Verify records structure
        assert len(records["Study_Level"]) == 1
        assert records["Study_Level"][0]["Study ID"] == "S001"
        assert len(records["Quality_Assessment"]) == 1

        # Verify PICOS-generated fields present
        cohort_fields = list(records["Cohort_Level"][0].keys())
        assert any("IDH" in f or "idh" in f.lower() for f in cohort_fields)

        # 7. Dual-output writing
        dest_dir = str(tmp_path / "output")
        write_result = write_all(
            records, project, project.codebook_path, dest_dir,
            project_slug="e2e", flags=pipeline_result.get("flags"),
        )
        assert os.path.exists(os.path.join(dest_dir, "e2e_extraction.xlsx"))
        assert os.path.exists(os.path.join(dest_dir, "e2e_extraction_flat.json"))
        assert os.path.exists(os.path.join(dest_dir, "e2e_extraction_nested.json"))
        assert os.path.exists(os.path.join(dest_dir, "e2e_extraction.db"))

        # 8. SQLite round-trip
        loaded = read_sqlite(os.path.join(dest_dir, "e2e_extraction.db"), project)
        assert loaded["Study_Level"][0]["Study ID"] == "S001"
        assert loaded["Study_Level"][0]["First Author"] == "Smith"
        assert loaded["Quality_Assessment"][0]["Assessment Tool"] == "QUADAS_2"

        # PICOS fields survive round-trip
        outcome_loaded = loaded["Outcome_Level"][0]
        assert any("IDH" in k or "idh" in k.lower() for k in outcome_loaded)

        # 9. JSON nested hierarchy
        with open(os.path.join(dest_dir, "e2e_extraction_nested.json")) as f:
            nested = json.load(f)
        assert len(nested["studies"]) == 1
        study = nested["studies"][0]
        assert study["Study_Level"]["Study ID"] == "S001"
        assert len(study["_children"]["Cohort_Level"]) == 1
        cohort = study["_children"]["Cohort_Level"][0]
        assert len(cohort["_children"]["Protocol_Level"]) == 1
        protocol = cohort["_children"]["Protocol_Level"][0]
        assert len(protocol["_children"]["Outcome_Level"]) == 1
        assert protocol["_children"]["Outcome_Level"][0]["Outcome ID"] == "O1"
        assert len(study["_children"]["Quality_Assessment"]) == 1

    def test_pipeline_with_base_config(self, tmp_path):
        """Pipeline works with the base radiology config (no PICOS layer)."""
        base_config = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../configs/radiology_base")
        )
        project = load_project(base_config)
        record = _make_extraction_record(project)
        extractor_a = DeterministicBackend(record=record, agent_id="A")
        extractor_b = DeterministicBackend(record=record, agent_id="B")

        result = run(project, PAPER_TEXT,
                     extractor_a=extractor_a, extractor_b=extractor_b, doc_id="base")
        issues, _ = validate(result["records"], project)
        errors = [i for i in issues if i["severity"] == "error"]
        assert len(errors) == 0, f"Base config should produce 0 errors: {errors}"

    def test_screening_excludes_non_ready(self):
        """Only ready_for_extraction papers proceed to extraction."""
        papers = _make_sample_papers()
        screener = _make_screener()
        full_texts = {"11111111": PAPER_TEXT, "22222222": "stroke study text"}
        result = screen_batch(papers, screener, PICOS_DICT, full_texts=full_texts)
        ready = get_ready_papers(result["final_statuses"], papers)
        assert len(ready) == 1
        assert ready[0]["pmid"] == "11111111"

    def test_prisma_flow_tracking(self):
        """PRISMA flow numbers are correctly tracked."""
        papers = _make_sample_papers()
        screener = DeterministicScreener(decisions_by_id={
            "11111111": {"ta_status": "include", "ft_status": "include"},
            "22222222": {"ta_status": "include", "ft_status": "uncertain"},
            "33333333": {"ta_status": "exclude"},
        })
        full_texts = {"11111111": PAPER_TEXT, "22222222": "stroke text"}
        result = screen_batch(papers, screener, PICOS_DICT, full_texts=full_texts)
        flow = result["prisma_flow"]
        assert flow["identified"] == 3
        assert flow["ta_screened"] == 3
        assert flow["ta_included"] == 2
        assert flow["ta_excluded"] == 1
        assert flow["ft_screened"] == 2
        assert flow["ft_included"] == 1
        assert flow["ready_for_extraction"] == 1
