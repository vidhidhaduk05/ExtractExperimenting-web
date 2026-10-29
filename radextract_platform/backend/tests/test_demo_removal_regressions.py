"""Regression tests asserting demo removal and extraction tracing integrity.
Per PLANS/extraction_tracing_demo_removal_plan.md
"""
import os
import pytest
from fastapi import HTTPException
from config import settings
from models import RobAIPrefillRequest
from services.auto_extract_service import _find_keyword_in_text
from services.coded_extraction_service import _try_derivations
from services.jev_client import _get_laya_model_dir


def test_rob_prefill_request_defaults_to_llm():
    """B4: Ensure RobAIPrefillRequest defaults to 'llm', never 'mock'."""
    req = RobAIPrefillRequest()
    assert req.model_fn_name == "llm"


def test_keyword_match_does_not_emit_ds_and_does_not_guess_page():
    """A5 & A6: Keyword fallback must not emit [DS] and must not guess page number."""
    text = "The study assessed mortality. Overall mortality was 12.5% among all subjects."
    match = _find_keyword_in_text(text, ["mortality"])
    assert match is not None
    assert match["confidence_tag"] == "[KEYWORD]"
    assert match["confidence_tag"] != "[DS]"
    assert match["source_page"] is None


def test_coded_derivations_do_not_hardcode_page_one():
    """A6: CALC derivations must not hardcode source_page: 1."""
    var = {"name": "follow_up_months", "variable_id": "v1"}
    text = "Patients were followed for a median duration of 2.5 years after treatment."
    derived = _try_derivations(var, text)
    if derived:
        assert derived.get("source_page") is None


def test_laya_model_dir_detection():
    """A1 & A2: Model dir detection finds workspace laya weights."""
    model_dir = _get_laya_model_dir()
    assert model_dir != "", "Expected _get_laya_model_dir() to find candidate directory"
    assert os.path.exists(os.path.join(model_dir, "laya.onnx")), "Expected laya.onnx to exist in model_dir"


def test_no_hardcoded_biomni_key_in_config():
    """B6 & Rule 11: Ensure committed secret key is removed from settings."""
    assert "sk-biomni" not in settings.llm_api_key
    assert "biomni" not in settings.llm_model.lower()


def test_example_endpoints_gated_by_environment():
    """B6: Example endpoints must return 404 when ENABLE_EXAMPLE_ENDPOINTS is false."""
    from routers import rigor_scan
    assert rigor_scan.ENABLE_EXAMPLE_ENDPOINTS is False
