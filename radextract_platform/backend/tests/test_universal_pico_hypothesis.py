"""Tests for Universal PICO Extraction, Hypothesis Generation, and Search Strings across domains."""
import pytest
from services import search_string_generator
from services.tool_registry import get_tool


def test_tool_registry_registration():
    """Ensure extract_pico and generate_hypothesis are registered in tool_registry."""
    extract_tool = get_tool("extract_pico")
    assert extract_tool is not None
    assert "population" in extract_tool["function"]["parameters"]["properties"]
    assert "index_test" in extract_tool["function"]["parameters"]["properties"]
    assert "outcome" in extract_tool["function"]["parameters"]["properties"]

    hypo_tool = get_tool("generate_hypothesis")
    assert hypo_tool is not None
    assert "primary_hypothesis" in hypo_tool["function"]["parameters"]["properties"]
    assert "null_hypothesis" in hypo_tool["function"]["parameters"]["properties"]
    assert "secondary_hypotheses" in hypo_tool["function"]["parameters"]["properties"]


def test_universal_pico_extraction_diagnostic():
    """Test diagnostic accuracy question in oncology/radiology."""
    q = "In men suspected of prostate cancer, does multiparametric MRI (mpMRI) targeted biopsy demonstrate superior detection of clinically significant cancer (ISUP grade group >= 2) compared to standard 12-core transrectal ultrasound-guided biopsy (TRUS)?"
    pico = search_string_generator._simple_pico_extraction(q)

    assert "prostate cancer" in pico["population"].lower()
    assert "mri" in pico["index_test"].lower()
    assert "transrectal ultrasound" in pico["comparator"].lower() or "trus" in pico["comparator"].lower()
    assert "clinically significant cancer" in pico["outcome"].lower()


def test_universal_pico_extraction_cardiology():
    """Test pharmacotherapy question in interventional cardiology."""
    q = "In patients with heart failure with preserved ejection fraction (HFpEF), does sodium-glucose cotransporter-2 (SGLT2) inhibitor therapy reduce cardiovascular death or heart failure hospitalization compared with placebo?"
    pico = search_string_generator._simple_pico_extraction(q)

    assert "heart failure" in pico["population"].lower() or "hfpef" in pico["population"].lower()
    assert "sglt2" in pico["index_test"].lower()
    assert "placebo" in pico["comparator"].lower()
    assert "cardiovascular death" in pico["outcome"].lower() or "hospitalization" in pico["outcome"].lower()


def test_universal_pico_extraction_psychiatry_non_inferiority():
    """Test behavioral/psychiatric non-inferiority question."""
    q = "In adolescents diagnosed with major depressive disorder, is internet-delivered cognitive behavioral therapy (iCBT) non-inferior to face-to-face cognitive behavioral therapy in reducing depressive symptom severity on the CDRS-R scale at 6-month follow-up?"
    pico = search_string_generator._simple_pico_extraction(q)

    assert "adolescents" in pico["population"].lower() or "depressive" in pico["population"].lower()
    assert "internet-delivered" in pico["index_test"].lower() or "icbt" in pico["index_test"].lower()
    assert "face-to-face" in pico["comparator"].lower()
    assert "non-inferiority" in pico["study_design"].lower()


def test_universal_pico_extraction_computer_vision():
    """Test non-clinical technological comparison in remote sensing."""
    q = "In satellite remote sensing for agricultural monitoring, do vision transformer architectures achieve higher mean Intersection over Union (mIoU) than convolutional neural networks for crop classification across multi-temporal optical imagery?"
    pico = search_string_generator._simple_pico_extraction(q)

    assert "remote sensing" in pico["population"].lower() or "satellite" in pico["population"].lower()
    assert "vision transformer" in pico["index_test"].lower()
    assert "convolutional neural network" in pico["comparator"].lower() or "cnn" in pico["comparator"].lower()
    assert "intersection over union" in pico["outcome"].lower() or "miou" in pico["outcome"].lower()


def test_directional_hypothesis_generation():
    """Verify directional primary (H1), null (H0), and secondary hypotheses."""
    pico = {
        "population": "patients with heart failure with preserved ejection fraction",
        "index_test": "SGLT2 inhibitors",
        "comparator": "placebo",
        "outcome": "cardiovascular death or hospitalization",
        "study_design": "Randomized controlled trial"
    }
    hypo = search_string_generator.generate_hypothesis_from_pico(pico)

    assert "SGLT2 inhibitors" in hypo["primary_hypothesis"]
    assert "cardiovascular death" in hypo["primary_hypothesis"]
    assert "placebo" in hypo["primary_hypothesis"]
    assert "SGLT2 inhibitors" in hypo["null_hypothesis"]
    null_lower = hypo["null_hypothesis"].lower()
    assert (
        ("no" in null_lower and ("difference" in null_lower or "effect" in null_lower))
        or "does not" in null_lower
        or "will not" in null_lower
        or "not reduce" in null_lower
        or "inferior" in null_lower
    )
    assert len(hypo["secondary_hypotheses"]) >= 2


def test_non_inferiority_hypothesis_generation():
    """Verify non-inferiority directional hypotheses."""
    pico = {
        "population": "adolescents with major depressive disorder",
        "index_test": "internet-delivered CBT",
        "comparator": "face-to-face CBT",
        "outcome": "depressive symptom reduction",
        "study_design": "Non-inferiority randomized trial"
    }
    hypo = search_string_generator.generate_hypothesis_from_pico(pico)

    assert "non-inferior" in hypo["primary_hypothesis"].lower()
    assert "inferior" in hypo["null_hypothesis"].lower()
    assert len(hypo["secondary_hypotheses"]) >= 2


def test_universal_search_strings_balanced_parens():
    """Ensure search strings for universal topics have perfectly balanced parentheses across all 6 databases."""
    pico = {
        "population": "patients with heart failure with preserved ejection fraction (HFpEF)",
        "index_test": "sodium-glucose cotransporter-2 (SGLT2) inhibitor therapy",
        "comparator": "placebo",
        "outcome": "cardiovascular death or heart failure hospitalization",
        "study_design": "randomized controlled trial"
    }
    strings = search_string_generator.generate_search_strings(pico)

    for db in ["pubmed", "embase", "cochrane", "web_of_science", "scopus", "cinahl"]:
        query = strings.get(db, "")
        assert query, f"Query for {db} must not be empty"
        assert query.count("(") == query.count(")"), f"Unbalanced parentheses in {db}: {query}"
