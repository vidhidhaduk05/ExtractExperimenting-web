"""Unit tests for §1.2 quote provenance verification and rerun preservation."""
import pytest
from services.auto_extract_service import verify_quote_provenance, auto_extract
from database import init_db, reset_db, get_connection
from config import settings
from services.db_backend import get_db_backend


def test_verify_quote_provenance_verbatim():
    text = "In this multi-center randomized trial, the mean age was 54.2 years."
    quote = "the mean age was 54.2 years"
    is_ver, score = verify_quote_provenance(quote, text)
    assert is_ver is True
    assert score == 1.0


def test_verify_quote_provenance_ocr_noise():
    text = "In this trial, the median follow-up period was 24.5 months."
    quote = "the median follow up period was 24.5 months"  # missing hyphen
    is_ver, score = verify_quote_provenance(quote, text)
    assert is_ver is True
    assert score >= 0.85


def test_verify_quote_provenance_hallucination_detected():
    text = "We studied 100 radiology patients undergoing CT."
    quote = "Treatment with oral anticoagulation reduced stroke by 75%"  # completely made up
    is_ver, score = verify_quote_provenance(quote, text)
    assert is_ver is False
    assert score < 0.50


def test_verify_quote_provenance_missing_codes_ignored():
    is_ver, score = verify_quote_provenance("[MISSING: -99] not reported", "any text")
    assert is_ver is True
