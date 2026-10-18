"""Tests for services/coded_extraction_service.py + extraction_prompt_builder.py.

Covers: per-variable prompt building, confidence tag assignment, verbatim-quote
verification, CALC arithmetic requirement, numeric double-check, exhaustive
search (tables/synonyms/derivations), recheck pass, missing codes, summary.
"""
import json
import pytest
from database import reset_db, init_db, get_connection
from config import settings
from services.db_backend import SQLiteBackend


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_coded.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


def _db():
    return SQLiteBackend(get_connection())


def _setup(project_vars, full_text="", pages=None, tables=None):
    """Create project + study + variables + pdf_document; return (pid, sid, var_ids)."""
    import uuid
    db = _db()
    pid = str(uuid.uuid4())
    sid = str(uuid.uuid4())
    db.insert("projects", {"project_id": pid, "name": "Coded Extraction Review"})
    db.insert("studies", {
        "study_id": sid, "project_id": pid, "title": "Trial of Drug X",
        "abstract": "An RCT of Drug X in 200 adults.",
    })
    var_ids = {}
    for i, v in enumerate(project_vars):
        vid = str(uuid.uuid4())
        var_ids[v["name"]] = vid
        db.insert("variables", {
            "variable_id": vid, "project_id": pid,
            "section": v.get("section", "General"),
            "name": v["name"],
            "field_type": v.get("field_type", "free_text"),
            "allowed_values": v.get("allowed_values", ""),
            "description": v.get("description", ""),
            "extraction_prompt": v.get("extraction_prompt", ""),
            "order_index": i + 1, "is_base": 0,
        })
    if full_text or pages or tables:
        db.insert("pdf_documents", {
            "doc_id": str(uuid.uuid4()), "study_id": sid,
            "full_text": full_text,
            "pages_json": json.dumps(pages or []),
            "tables_json": json.dumps(tables or []),
            "annotations_json": "{}", "metadata_json": "{}",
            "processor_engine": "docling",
        })
    db.commit()
    return pid, sid, var_ids


def _get_extraction(sid, vid):
    rows = _db().query("extractions", {"study_id": sid, "variable_id": vid})
    return rows[0] if rows else None


class TestPromptBuilder:
    def test_prompt_built_from_name_description_type(self):
        from services.extraction_prompt_builder import build_field_prompt
        p = build_field_prompt({
            "name": "median_followup_months",
            "description": "Convert from years if needed. Median preferred.",
            "field_type": "float",
        })
        assert "median followup months" in p
        assert "Convert from years if needed" in p
        assert "numeric" in p
        assert "NOT_FOUND" in p

    def test_stored_prompt_takes_precedence(self):
        from services.extraction_prompt_builder import build_field_prompt
        p = build_field_prompt({
            "name": "x", "description": "y", "field_type": "free_text",
            "extraction_prompt": "CUSTOM PROMPT",
        })
        assert p == "CUSTOM PROMPT"

    def test_enum_prompt_lists_allowed_values(self):
        from services.extraction_prompt_builder import build_field_prompt
        p = build_field_prompt({
            "name": "support", "field_type": "enum",
            "allowed_values": "Yes; No; Partially",
        })
        assert "Yes; No; Partially" in p


class TestCodedExtraction:
    VARS = [
        {"name": "sample_size", "field_type": "int", "section": "Study_Metadata",
         "description": "Total number of participants enrolled"},
        {"name": "mean_age", "field_type": "float", "section": "Population",
         "description": "Mean participant age in years"},
        {"name": "median_followup_months", "field_type": "float", "section": "Outcomes",
         "description": "Median follow-up in months. Convert from years if needed."},
    ]

    def test_llm_response_parsed_with_confidence_tag(self):
        full_text = "We enrolled 200 patients. " * 10
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [{
                "prompt": "sample_size", "response": "200",
                "source": "We enrolled 200 patients.", "page": "1",
                "confidence_tag": "DS", "calc_note": "",
            }]}

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["sample_size"])
        assert row["value"] == "200"
        assert row["confidence_tag"] == "DS"
        assert row["missing_code"] == ""
        assert row["source_text"] == "We enrolled 200 patients."
        assert row["extraction_prompt"] != ""

    def test_calc_requires_calc_note(self):
        full_text = "Patients were followed for a median of 2 years. " * 8
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [{
                "prompt": "median_followup_months", "response": "24",
                "source": "followed for a median of 2 years", "page": "1",
                "confidence_tag": "CALC", "calc_note": "",  # missing arithmetic
            }]}

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["median_followup_months"])
        assert row["confidence_tag"] == "INF"  # downgraded: no arithmetic shown

    def test_ds_downgraded_when_quote_not_verbatim(self):
        full_text = "The study included adults with back pain. " * 8
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [{
                "prompt": "sample_size", "response": "150",
                "source": "THIS QUOTE DOES NOT APPEAR IN THE DOCUMENT AT ALL", "page": "1",
                "confidence_tag": "DS", "calc_note": "",
            }]}

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["sample_size"])
        assert row["confidence_tag"] == "INF"

    def test_exhaustive_table_search_rescues_not_found(self):
        """LLM says NOT_FOUND but the value sits in a Docling table -> no -99."""
        full_text = "A study of back pain patients. " * 10
        tables = [{"page": 2, "rows": [
            ["Characteristic", "Value"],
            ["Sample size", "312"],
            ["Mean age", "54.2"],
        ]}]
        pid, sid, vids = _setup(self.VARS, full_text=full_text, tables=tables)

        def model_fn(prompt, **kwargs):
            return {"responses": []}  # LLM found nothing

        from services.coded_extraction_service import coded_extract_study
        summary = coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["sample_size"])
        assert row["value"] == "312"
        assert row["missing_code"] == ""
        assert "sample_size" not in summary["minus_99"]

    def test_synonym_search_finds_follow_up(self):
        """'followed for' synonym should locate the follow-up field."""
        full_text = "Methods. Participants were followed for 18 months after treatment. Results. Pain improved."
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=lambda p, **k: {"responses": []})
        row = _get_extraction(sid, vids["median_followup_months"])
        assert row["missing_code"] == ""
        assert "followed for 18 months" in row["value"]

    def test_derivation_years_to_months_tagged_calc(self):
        """Follow-up reported in years -> derived to months, tagged [CALC]."""
        full_text = "The median follow-up was 2 years for the cohort."
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=lambda p, **k: {"responses": []})
        row = _get_extraction(sid, vids["median_followup_months"])
        assert row["value"] == "24"
        assert row["confidence_tag"] == "CALC"
        assert "2" in row["calc_note"] and "24" in row["calc_note"]

    def test_recheck_pass_rescues_minus_99(self):
        """A field missed by exact search is found by the loose recheck pass."""
        # 'median_followup_months' tokens: median, followup, months — need 2 in one sentence
        full_text = ("Baseline characteristics are in Table 1. " * 3 +
                     "The median followup interval reached 30 months overall.")
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        from services.coded_extraction_service import coded_extract_study
        coded_extract_study(sid, pid, db=_db(), model_fn=lambda p, **k: {"responses": []})
        row = _get_extraction(sid, vids["median_followup_months"])
        assert row["missing_code"] == ""
        assert row["confidence_tag"] == "INF"

    def test_true_minus_99_written(self):
        """Genuinely absent field -> -99 after exhaustive search + recheck."""
        full_text = "A study about imaging. " * 10
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        from services.coded_extraction_service import coded_extract_study
        summary = coded_extract_study(sid, pid, db=_db(), model_fn=lambda p, **k: {"responses": []})
        row = _get_extraction(sid, vids["mean_age"])
        assert row["value"] == "-99"
        assert row["missing_code"] == "-99"
        assert "mean_age" in summary["minus_99"]

    def test_minus_77_for_not_applicable(self):
        full_text = "A study. " * 20
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [{
                "prompt": "mean_age", "response": "NOT_APPLICABLE",
                "source": "", "page": "1", "confidence_tag": "DS", "calc_note": "",
            }]}

        from services.coded_extraction_service import coded_extract_study
        summary = coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["mean_age"])
        assert row["value"] == "-77"
        assert row["missing_code"] == "-77"
        assert "mean_age" in summary["minus_77"]

    def test_summary_counts(self):
        full_text = "We enrolled 200 patients with a mean age of 55 years. " * 5
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [
                {"prompt": "sample_size", "response": "200",
                 "source": "We enrolled 200 patients", "page": "1",
                 "confidence_tag": "DS", "calc_note": ""},
                {"prompt": "mean_age", "response": "55",
                 "source": "mean age of 55 years", "page": "1",
                 "confidence_tag": "DS", "calc_note": ""},
            ]}

        from services.coded_extraction_service import coded_extract_study
        summary = coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        assert summary["extracted"] >= 2
        assert summary["coded_ds"] == 2
        assert isinstance(summary["minus_99"], list)
        assert isinstance(summary["conflicts"], list)

    def test_numeric_double_check_flags_unlocatable_value(self):
        """Numeric value that appears nowhere in the document -> [INF] + conflict."""
        full_text = "A trial of many patients. " * 10
        pid, sid, vids = _setup(self.VARS, full_text=full_text)

        def model_fn(prompt, **kwargs):
            return {"responses": [{
                "prompt": "sample_size", "response": "987654",
                "source": "", "page": "1", "confidence_tag": "INF", "calc_note": "",
            }]}

        from services.coded_extraction_service import coded_extract_study
        summary = coded_extract_study(sid, pid, db=_db(), model_fn=model_fn)
        row = _get_extraction(sid, vids["sample_size"])
        assert row["confidence_tag"] == "INF"
        assert any("sample_size" in c for c in summary["conflicts"])
