"""Unit tests for services/tool_registry.py — tool definitions, schemas, and validation."""
import pytest
from services.tool_registry import (
    TOOL_DEFINITIONS,
    get_tool,
    get_response_schema,
    get_tools_for_request,
    validate_tool_response,
)

EXPECTED_TOOLS = [
    "extract_variables",
    "screen_fulltext",
    "screen_title_abstract",
    "prefill_rob_domain",
    "generate_variables",
    "generate_schema_fields",
]


class TestToolRegistry:
    def test_all_expected_tools_present(self):
        for name in EXPECTED_TOOLS:
            tool = get_tool(name)
            assert tool is not None, f"Tool '{name}' should exist in registry"
            assert tool["type"] == "function"
            fn = tool["function"]
            assert fn["name"] == name
            assert len(fn["description"]) > 10
            assert "parameters" in fn
            assert fn["parameters"]["type"] == "object"

    def test_get_tool_unknown_returns_none(self):
        assert get_tool("nonexistent_tool") is None

    def test_get_response_schema(self):
        for name in EXPECTED_TOOLS:
            schema = get_response_schema(name)
            assert schema is not None
            assert schema["type"] == "object"

    def test_get_tools_for_request(self):
        req_tools = get_tools_for_request(["extract_variables", "screen_fulltext", "unknown"])
        assert len(req_tools) == 2
        names = [t["function"]["name"] for t in req_tools]
        assert "extract_variables" in names
        assert "screen_fulltext" in names

    def test_validate_extract_variables_valid(self):
        valid_args = {
            "responses": [
                {
                    "prompt": "sample_size",
                    "response": "150",
                    "source": "A total of 150 patients were enrolled.",
                    "page": "3",
                }
            ]
        }
        is_valid, err = validate_tool_response("extract_variables", valid_args)
        assert is_valid is True
        assert err == ""

    def test_validate_extract_variables_missing_required(self):
        invalid_args = {
            "responses": [
                {
                    "prompt": "sample_size",
                    # missing response, source, page
                }
            ]
        }
        is_valid, err = validate_tool_response("extract_variables", invalid_args)
        assert is_valid is False
        assert len(err) > 0

    def test_validate_screen_fulltext_valid(self):
        valid_args = {
            "decision": "include",
            "confidence": 0.92,
            "reason": "Study meets all PICO inclusion criteria.",
            "reason_code": "eligible",
            "evidence_quote": "Randomized diagnostic trial evaluating CT vs MRI.",
        }
        is_valid, err = validate_tool_response("screen_fulltext", valid_args)
        assert is_valid is True

    def test_validate_screen_fulltext_invalid_enum(self):
        invalid_args = {
            "decision": "maybe",  # not include/exclude
            "confidence": 0.5,
            "reason": "Unsure",
        }
        is_valid, err = validate_tool_response("screen_fulltext", invalid_args)
        assert is_valid is False

    def test_validate_screen_title_abstract_valid(self):
        valid_args = {
            "status": "included",
            "reason": "Relevant radiology trial",
            "confidence": 0.88,
        }
        is_valid, err = validate_tool_response("screen_title_abstract", valid_args)
        assert is_valid is True

    def test_validate_prefill_rob_domain_valid(self):
        valid_args = {
            "judgment": "low",
            "support": "Proper randomization sequence generated.",
            "confidence": 0.9,
            "answers": {"Q1": {"answer": "yes", "quote": "Random computer allocation", "page": 2, "confidence": 0.9}},
        }
        is_valid, err = validate_tool_response("prefill_rob_domain", valid_args)
        assert is_valid is True

    def test_validate_generate_variables_valid(self):
        valid_args = {
            "variables": [
                {
                    "name": "mean_age",
                    "field_type": "float",
                    "description": "Mean age of cohort",
                }
            ]
        }
        is_valid, err = validate_tool_response("generate_variables", valid_args)
        assert is_valid is True

    def test_validate_generate_schema_fields_valid(self):
        valid_args = {
            "fields": [
                {
                    "name": "scanner_type",
                    "type": "text",
                    "description": "Scanner brand",
                }
            ]
        }
        is_valid, err = validate_tool_response("generate_schema_fields", valid_args)
        assert is_valid is True
