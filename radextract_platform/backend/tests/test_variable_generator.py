"""Tests for services/variable_generator.py — hypothesis-driven auto-generation.

The generator must derive sections and variables from the project's research
question + hypothesis + PICO, with NO hardcoded domain content, and must attach
a per-variable extraction_prompt to every variable.
"""
import pytest
from services.variable_generator import (
    generate_variables_from_picos,
    _generate_heuristic_variables,
    _default_extraction_prompt,
)


# ── Test PICO inputs ──

PICO_DIAGNOSTIC = {
    "population": "Patients with suspected colorectal liver metastases",
    "index_test": "Contrast-enhanced CT",
    "comparator": "Gadoxetic acid-enhanced MRI",
    "outcome": "Diagnostic accuracy (sensitivity and specificity)",
    "study_design": "Diagnostic accuracy study",
}

PICO_GENERIC = {
    "population": "Adults with chronic low back pain",
    "index_test": "MRI",
    "comparator": "Conservative treatment",
    "outcome": "Pain reduction at 6 months",
    "study_design": "Randomized controlled trial",
}

PICO_EMPTY = {
    "population": "",
    "index_test": "",
    "comparator": "",
    "outcome": "",
    "study_design": "",
}

RADIOLOGY_TERMS = {
    "aneurysm", "stroke", "scanner_type", "field_strength", "reader_experience",
    "imaging_modality", "anatomical_location", "dsa", "cta", "mra",
}


class TestHeuristicGeneration:
    """Heuristic fallback (no LLM) — PICO-token-derived, domain-neutral."""

    def test_minimum_fields_present(self):
        """study_design, sample_size, and an outcome variable are always generated."""
        for pico in [PICO_DIAGNOSTIC, PICO_GENERIC]:
            variables = _generate_heuristic_variables(pico, "test hypothesis")
            names = {v["name"] for v in variables}
            assert "study_design" in names
            assert "sample_size" in names
            assert "supports_hypothesis" in names
            assert any(n.startswith("outcome") for n in names)

    def test_sections_derived_not_fixed(self):
        """Sections come from the standard dynamic set, not the old fixed 3."""
        variables = _generate_heuristic_variables(PICO_GENERIC, "test")
        sections = {v["section"] for v in variables}
        assert "Study_Metadata" in sections
        assert "Population" in sections
        assert "Outcomes" in sections
        # Old hardcoded sections are gone
        assert "Cohort_Level" not in sections
        assert "Protocol_Level" not in sections
        assert "Outcome_Level" not in sections

    def test_no_radiology_terms_for_non_radiology_topic(self):
        """A back-pain RCT must not get neurovascular/imaging variables."""
        variables = _generate_heuristic_variables(
            PICO_GENERIC, "MRI-guided care reduces pain more than conservative treatment"
        )
        names = {v["name"] for v in variables}
        assert not (names & RADIOLOGY_TERMS), f"Radiology terms leaked: {names & RADIOLOGY_TERMS}"

    def test_pico_tokens_appear_in_variable_names(self):
        """Variable names derive from PICO vocabulary."""
        variables = _generate_heuristic_variables(PICO_DIAGNOSTIC, "test")
        names = {v["name"] for v in variables}
        # Population tokens: colorectal/liver/metastases
        assert any("colorectal" in n or "liver" in n or "metastases" in n for n in names)
        # Outcome tokens: diagnostic/accuracy/sensitivity/specificity
        assert any("diagnostic" in n or "accuracy" in n or "sensitivity" in n for n in names)

    def test_comparator_section_only_when_comparator_exists(self):
        with_cmp = _generate_heuristic_variables(PICO_GENERIC, "test")
        assert any(v["section"] == "Comparator_Details" for v in with_cmp)
        no_cmp = _generate_heuristic_variables(
            {**PICO_GENERIC, "comparator": ""}, "test"
        )
        assert not any(v["section"] == "Comparator_Details" for v in no_cmp)

    def test_every_variable_has_extraction_prompt(self):
        variables = _generate_heuristic_variables(PICO_GENERIC, "test")
        for v in variables:
            assert v["extraction_prompt"].strip(), f"{v['name']} missing extraction_prompt"

    def test_empty_pico_still_generates(self):
        variables = _generate_heuristic_variables(PICO_EMPTY, "")
        assert len(variables) > 0
        names = {v["name"] for v in variables}
        assert "sample_size" in names


class TestFormatting:
    def test_variable_structure(self):
        variables = generate_variables_from_picos(PICO_DIAGNOSTIC, "test", use_llm=False)
        for v in variables:
            for key in ["section", "name", "field_type", "allowed_values",
                        "range_min", "range_max", "description",
                        "extraction_prompt", "order_index", "is_base"]:
                assert key in v, f"missing key {key}"
            assert v["is_base"] is False

    def test_order_indices_are_integers(self):
        variables = generate_variables_from_picos(PICO_DIAGNOSTIC, "test", use_llm=False)
        for v in variables:
            assert isinstance(v["order_index"], int)

    def test_enum_fields_have_allowed_values(self):
        variables = generate_variables_from_picos(PICO_DIAGNOSTIC, "test", use_llm=False)
        for v in variables:
            if v["field_type"] == "enum":
                assert v["allowed_values"], f"Enum field {v['name']} should have allowed_values"


class TestLlmMode:
    def test_llm_mode_with_custom_model_fn(self):
        """LLM mode with a custom model_fn should use it, with dynamic sections."""
        def custom_fn(prompt, **kwargs):
            return {"variables": [{
                "section": "Surgical_Details",
                "name": "resection_margin",
                "field_type": "dropdown",
                "allowed_values": ["R0", "R1", "R2"],
                "description": "Surgical resection margin status",
                "extraction_prompt": "Extract the resection margin status (R0/R1/R2) from the pathology results.",
            }]}

        variables = generate_variables_from_picos(
            PICO_DIAGNOSTIC, "test", use_llm=True, model_fn=custom_fn
        )
        assert len(variables) == 1
        v = variables[0]
        assert v["name"] == "resection_margin"
        assert v["section"] == "Surgical_Details"  # dynamic section preserved
        assert v["field_type"] == "enum"           # dropdown normalized
        assert v["allowed_values"] == "R0; R1; R2"
        assert v["extraction_prompt"].startswith("Extract the resection margin")

    def test_llm_prompt_is_hypothesis_driven(self):
        """The prompt sent to the LLM contains the hypothesis and research question."""
        seen = {}

        def capturing_fn(prompt, **kwargs):
            seen["prompt"] = prompt
            return {"variables": []}

        generate_variables_from_picos(
            PICO_GENERIC,
            hypothesis_text="Exercise therapy reduces pain more than usual care",
            research_question="Does exercise therapy help chronic low back pain?",
            use_llm=True,
            model_fn=capturing_fn,
        )
        prompt = seen["prompt"]
        assert "Exercise therapy reduces pain more than usual care" in prompt
        assert "Does exercise therapy help chronic low back pain?" in prompt
        # No radiology exemplars in the prompt itself
        assert "aneurysm" not in prompt.lower()
        assert "stroke subtype" not in prompt.lower()

    def test_llm_variable_without_prompt_gets_default(self):
        """If the LLM omits extraction_prompt, one is built from name+description."""
        def custom_fn(prompt, **kwargs):
            return {"variables": [{
                "section": "Outcomes",
                "name": "median_followup_months",
                "field_type": "float",
                "description": "Convert from years if needed. Median preferred.",
            }]}

        variables = generate_variables_from_picos(
            PICO_GENERIC, "test", use_llm=True, model_fn=custom_fn
        )
        prompt = variables[0]["extraction_prompt"]
        assert "median followup months" in prompt
        assert "Convert from years if needed" in prompt
        assert "NOT_FOUND" in prompt


class TestDefaultExtractionPrompt:
    def test_prompt_contains_name_description_format(self):
        p = _default_extraction_prompt(
            "median_followup_months",
            "Convert from years if needed. Median preferred.",
            "float",
        )
        assert "median followup months" in p
        assert "Convert from years if needed" in p
        assert "numeric" in p
        assert "NOT_FOUND" in p

    def test_prompt_enum_mentions_allowed_values(self):
        p = _default_extraction_prompt("support", "", "enum")
        assert "allowed values" in p.lower()
