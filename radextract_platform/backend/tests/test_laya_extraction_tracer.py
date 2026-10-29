import pytest
from config import settings
from services import jev_client
from services.laya_extraction_tracer import (
    trace_variable_evidence,
    trace_all_extractions,
    _split_into_sentences,
)

@pytest.fixture(autouse=True)
def setup_laya_settings(monkeypatch):
    jev_client.reset_breaker()
    monkeypatch.setattr(settings, "jev_api_key", "test-key")
    monkeypatch.setattr(settings, "jev_mode", "on")
    monkeypatch.setattr(settings, "jev_provider", "typesafe")
    fake_ask = lambda state, questions: {q: {"noul": 0.85} for q in questions}
    monkeypatch.setattr(jev_client, "ask", fake_ask)
    monkeypatch.setattr("services.laya_extraction_tracer.ask", fake_ask)
    yield
    jev_client.reset_breaker()


def test_split_into_sentences():
    text = "In this trial, 100 patients were evaluated. The mean age was 62.5 years. Overall mortality was 4%."
    sentences = _split_into_sentences(text)
    assert len(sentences) == 3
    assert "mean age was 62.5 years" in sentences[1]


def test_trace_variable_evidence_verbatim_page():
    pdf_data = {
        "pages": [
            {
                "page_number": 1,
                "text": "Introduction: Stroke is a major cause of death worldwide. We investigated mechanical thrombectomy.",
            },
            {
                "page_number": 2,
                "text": "Results: Baseline demographics showed 200 patients enrolled. The mean patient age was 67.4 years (SD 8.2).",
            },
            {
                "page_number": 3,
                "text": "Outcomes: Successful recanalization occurred in 164 of 200 patients (82.0%). Symptomatic hemorrhage was rare.",
            },
        ]
    }

    # Trace recanalization rate
    traced = trace_variable_evidence(
        var_name="recanalization_rate",
        extracted_value="82.0%",
        pdf_data=pdf_data,
    )
    assert traced is not None
    assert traced["source_page"] == 3
    assert "82.0%" in traced["source_text"]
    assert "Successful recanalization" in traced["source_text"]
    assert traced["confidence"] > 0.50
    assert traced["verified"] is True

    # Trace patient age
    traced_age = trace_variable_evidence(
        var_name="mean_age",
        extracted_value="67.4",
        pdf_data=pdf_data,
    )
    assert traced_age is not None
    assert traced_age["source_page"] == 2
    assert "67.4 years" in traced_age["source_text"]
    assert traced_age["verified"] is True


def test_trace_variable_evidence_missing_codes_return_none():
    pdf_data = {"pages": [{"page_number": 1, "text": "Some text."}]}
    assert trace_variable_evidence("age", "-99", pdf_data) is None
    assert trace_variable_evidence("age", "-77", pdf_data) is None
    assert trace_variable_evidence("age", "-88", pdf_data) is None
    assert trace_variable_evidence("age", "not reported", pdf_data) is None


def test_trace_all_extractions():
    pdf_data = {
        "pages": [
            {
                "page_number": 1,
                "text": "Patients received either treatment A or B. Total cohort was 150 patients.",
            },
            {
                "page_number": 2,
                "text": "The median follow-up duration was 14.2 months across both groups.",
            },
        ]
    }

    extractions = [
        {
            "variable_name": "follow_up_duration",
            "value": "14.2 months",
            "source_text": "",
            "source_page": 1,
        },
        {
            "variable_name": "adverse_events",
            "value": "-99",
            "source_text": "",
            "source_page": 1,
        },
    ]

    updated = trace_all_extractions(extractions, pdf_data)
    assert len(updated) == 2
    item = updated[0]
    assert item["source_page"] == 2
    assert "14.2 months" in item["source_text"]
    assert item.get("laya_verified") is True
    assert item.get("confidence_tag") == "[DS]"


def test_fabricated_existing_quote_is_not_verified():
    item = {"name": "mortality", "value": "18%",
            "source_text": "Mortality was 18% in the treatment group.", "source_page": 1}
    result = trace_all_extractions([item], {"pages": [{"page_number": 1, "text": "No outcomes available."}]})
    assert result[0].get("laya_verified") is False


def test_existing_quote_is_located_on_actual_page():
    quote = "The median follow-up duration was 14.2 months."
    item = {"name": "follow_up", "value": "14.2 months", "source_text": quote, "source_page": 1}
    trace_all_extractions([item], {"pages": [{"page_number": 7, "text": quote}]})
    assert item["laya_verified"] is True
    assert item["source_page"] == 7


def test_quote_with_fabricated_suffix_is_not_verified():
    prefix = "The study enrolled adult participants from multiple centres across the country."
    item = {"name": "mortality", "value": "18%", "source_text": prefix + " Mortality was 18%."}
    trace_all_extractions([item], {"pages": [{"page_number": 1, "text": prefix}]})
    assert item.get("laya_verified") is False


def test_whitespace_only_quote_variation_is_located():
    quote = "The median follow-up duration was 14.2 months."
    item = {"name": "follow_up", "value": "14.2 months", "source_text": quote}
    trace_all_extractions([item], {"pages": [{"page_number": 3, "text": quote.replace(" ", "\n")}]})
    assert item["laya_verified"] is True
    assert item["source_page"] == 3


def test_unpaginated_evidence_does_not_invent_page_one():
    quote = "The median follow-up duration was 14.2 months."
    item = {"name": "follow_up", "value": "14.2 months", "source_text": quote, "source_page": 1}
    trace_all_extractions([item], {}, full_text=quote)
    assert item["laya_verified"] is True
    assert item["source_page"] is None
    traced = trace_variable_evidence("follow_up", "14.2 months", {}, full_text=quote)
    assert traced["source_page"] is None


def test_stale_verification_is_cleared_when_engine_unavailable(monkeypatch):
    monkeypatch.setattr("services.laya_extraction_tracer.is_jev_enabled", lambda: False)
    item = {"name": "age", "value": "62", "laya_verified": True, "laya_confidence": 0.99}
    trace_all_extractions([item], {})
    assert item["laya_verified"] is False
    assert item["laya_confidence"] == 0.0


def test_long_excerpt_is_not_verified_from_only_its_prefix():
    quote = "Background information about the study population " * 10 + "Mortality was 18%."
    item = {"name": "mortality", "value": "18%", "source_text": quote}
    trace_all_extractions([item], {}, full_text=quote)
    assert item.get("laya_verified") is False


def test_table_evidence_is_located_and_verified():
    pdf_data = {
        "pages": [{"page_number": 1, "text": "See tables below for outcomes."}],
        "tables": [
            {
                "page_number": 4,
                "caption": "Table 2: Clinical Outcomes at 90 Days",
                "rows": [
                    ["Outcome", "Intervention (n=50)", "Control (n=50)"],
                    ["Primary Patency", "42 (84.0%)", "31 (62.0%)"],
                    ["Secondary Patency", "46 (92.0%)", "38 (76.0%)"],
                ],
            }
        ],
    }

    item = {
        "variable_name": "primary_patency",
        "value": "84.0%",
        "source_text": "",
        "source_page": None,
    }

    updated = trace_all_extractions([item], pdf_data)
    assert updated[0]["laya_verified"] is True
    assert updated[0]["source_page"] == 4
    assert "84.0%" in updated[0]["source_text"]
    assert updated[0]["tracing_status"] == "verified"


def test_tracing_status_disabled_when_jev_off(monkeypatch):
    monkeypatch.setattr("services.laya_extraction_tracer.is_jev_enabled", lambda: False)
    item = {"name": "age", "value": "62", "source_text": "Age was 62."}
    res = trace_all_extractions([item], {"pages": [{"page_number": 1, "text": "Age was 62."}]})
    assert res[0]["tracing_status"] == "disabled"
    assert res[0]["laya_verified"] is False
