"""
test_screening.py — test the two-stage PRISMA screening module.

Tests cover:
  - DeterministicScreener with default include
  - DeterministicScreener with per-paper decisions
  - DeterministicScreener with decision_fn
  - Batch screening with PRISMA flow tracking
  - Full-text screening path (PDF available vs needs_pdf_upload)
  - Exclusion tracking with reasons
  - get_ready_papers filtering
  - advance_status logic
"""
import os
import sys
import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO not in sys.path:
    sys.path.insert(0, REPO)

from radextract_core.radextract.screening import (
    ScreeningDecision, DeterministicScreener, LLMScreener,
    screen_batch, get_ready_papers, advance_status,
)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
PICOS = {
    "population": "patients with suspected glioma undergoing MRI",
    "intervention": "DSC perfusion MRI",
    "comparator": "histopathology (WHO 2021 grading)",
    "outcome": "diagnostic accuracy for IDH mutation status",
    "study_design": "diagnostic accuracy studies",
}

PAPERS = [
    {"id": "1", "pmid": "111", "title": "DSC MRI for glioma IDH prediction",
     "abstract": "We evaluated DSC perfusion MRI for IDH mutation prediction in glioma patients."},
    {"id": "2", "pmid": "222", "title": "CT for lung nodule detection",
     "abstract": "We assessed CT screening for lung nodule detection in smokers."},
    {"id": "3", "pmid": "333", "title": "MRI biomarkers in glioma: a review",
     "abstract": "This review summarizes MRI biomarkers in glioma including perfusion imaging."},
    {"id": "4", "pmid": "444", "title": "ASL perfusion for glioma grading",
     "abstract": "We compared ASL perfusion MRI with histopathology for glioma grading."},
    {"id": "5", "pmid": "555", "title": "DWI for stroke diagnosis",
     "abstract": "We evaluated DWI for acute stroke diagnosis in the emergency department."},
]


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
class TestDeterministicScreener:
    def test_default_include(self):
        screener = DeterministicScreener(default_status="include")
        dec = screener.screen_title_abstract(PAPERS[0], PICOS)
        assert dec.status == "include"
        assert dec.stage == "title_abstract"
        assert dec.paper_id == "111"

    def test_default_exclude(self):
        screener = DeterministicScreener(default_status="exclude", default_reason="wrong population")
        dec = screener.screen_title_abstract(PAPERS[1], PICOS)
        assert dec.status == "exclude"
        assert "wrong population" in dec.reason

    def test_per_paper_decisions(self):
        decisions = {
            "111": {"status": "include", "reason": "matches PICOS"},
            "222": {"status": "exclude", "reason": "CT not MRI, lung not glioma"},
            "333": {"status": "uncertain", "reason": "review article, not primary study"},
        }
        screener = DeterministicScreener(decisions_by_id=decisions)
        d1 = screener.screen_title_abstract(PAPERS[0], PICOS)
        d2 = screener.screen_title_abstract(PAPERS[1], PICOS)
        d3 = screener.screen_title_abstract(PAPERS[2], PICOS)
        assert d1.status == "include"
        assert d2.status == "exclude"
        assert d3.status == "uncertain"

    def test_decision_fn(self):
        def fn(paper, picos, stage):
            title = paper.get("title", "").lower()
            if "review" in title:
                return {"status": "exclude", "reason": "review article"}
            elif "glioma" in title and "mri" in title:
                return {"status": "include", "reason": "glioma MRI study"}
            else:
                return {"status": "exclude", "reason": "wrong topic"}

        screener = DeterministicScreener(decision_fn=fn)
        d1 = screener.screen_title_abstract(PAPERS[0], PICOS)
        d3 = screener.screen_title_abstract(PAPERS[2], PICOS)
        d5 = screener.screen_title_abstract(PAPERS[4], PICOS)
        assert d1.status == "include"
        assert d3.status == "exclude"
        assert d5.status == "exclude"


class TestBatchScreening:
    def test_all_include_with_pdfs(self):
        """All papers included at TA, all have PDFs, all included at FT."""
        screener = DeterministicScreener(default_status="include")
        full_texts = {p["pmid"]: "Full text of the paper..." for p in PAPERS}
        result = screen_batch(PAPERS, screener, PICOS, full_texts=full_texts)

        assert result["prisma_flow"]["identified"] == 5
        assert result["prisma_flow"]["ta_screened"] == 5
        assert result["prisma_flow"]["ta_included"] == 5
        assert result["prisma_flow"]["ft_screened"] == 5
        assert result["prisma_flow"]["ready_for_extraction"] == 5
        assert all(s == "ready_for_extraction" for s in result["final_statuses"].values())

    def test_mixed_decisions(self):
        """Some included, some excluded, some uncertain at TA level."""
        decisions = {
            "111": {"status": "include", "reason": "matches"},
            "222": {"status": "exclude", "reason": "wrong modality"},
            "333": {"status": "uncertain", "reason": "review"},
            "444": {"status": "include", "reason": "matches"},
            "555": {"status": "exclude", "reason": "wrong disease"},
        }
        screener = DeterministicScreener(decisions_by_id=decisions)
        full_texts = {"111": "text...", "444": "text..."}
        result = screen_batch(PAPERS, screener, PICOS, full_texts=full_texts)

        flow = result["prisma_flow"]
        assert flow["ta_included"] == 2
        assert flow["ta_excluded"] == 2
        assert flow["ta_uncertain"] == 1
        assert flow["ft_screened"] == 2  # only TA-included with PDFs
        assert flow["ready_for_extraction"] == 2

        statuses = result["final_statuses"]
        assert statuses["111"] == "ready_for_extraction"
        assert statuses["222"] == "exclude_ta"
        assert statuses["333"] == "uncertain_ta"
        assert statuses["444"] == "ready_for_extraction"
        assert statuses["555"] == "exclude_ta"

    def test_needs_pdf_upload(self):
        """TA-included but no PDF → needs_pdf_upload."""
        decisions = {"111": {"status": "include", "reason": "matches"}}
        screener = DeterministicScreener(decisions_by_id=decisions)
        result = screen_batch([PAPERS[0]], screener, PICOS, full_texts={})

        assert result["final_statuses"]["111"] == "needs_pdf_upload"
        assert result["prisma_flow"]["needs_pdf"] == 1
        assert result["prisma_flow"]["ready_for_extraction"] == 0

    def test_ft_exclusion(self):
        """TA-include but FT-exclude → exclude_ft."""
        decisions = {
            "111": {"status": "include", "reason": "TA match", "ft_status": "exclude", "ft_reason": "wrong study design"},
        }
        screener = DeterministicScreener(decisions_by_id=decisions)
        result = screen_batch([PAPERS[0]], screener, PICOS, full_texts={"111": "text..."})

        assert result["final_statuses"]["111"] == "exclude_ft"
        assert result["prisma_flow"]["ft_excluded"] == 1
        assert len(result["excluded_with_reasons"]) == 1
        assert result["excluded_with_reasons"][0]["stage"] == "full_text"

    def test_excluded_with_reasons(self):
        """Excluded papers should have reasons tracked."""
        decisions = {
            "111": {"status": "include", "reason": "match"},
            "222": {"status": "exclude", "reason": "wrong modality"},
        }
        screener = DeterministicScreener(decisions_by_id=decisions)
        result = screen_batch(PAPERS[:2], screener, PICOS, full_texts={"111": "text..."})

        excluded = result["excluded_with_reasons"]
        assert len(excluded) == 1  # 222 excluded at TA
        assert any(e["paper_id"] == "222" for e in excluded)
        assert excluded[0]["stage"] == "title_abstract"
        assert "wrong modality" in excluded[0]["reason"]


class TestGetReadyPapers:
    def test_filtering(self):
        screener = DeterministicScreener(default_status="include")
        full_texts = {p["pmid"]: "text..." for p in PAPERS[:3]}
        result = screen_batch(PAPERS[:3], screener, PICOS, full_texts=full_texts)
        ready = get_ready_papers(result["final_statuses"], PAPERS[:3])
        assert len(ready) == 3
        assert all(p["pmid"] in full_texts for p in ready)

    def test_empty_when_all_excluded(self):
        decisions = {p["pmid"]: {"status": "exclude", "reason": "no"} for p in PAPERS}
        screener = DeterministicScreener(decisions_by_id=decisions)
        result = screen_batch(PAPERS, screener, PICOS)
        ready = get_ready_papers(result["final_statuses"], PAPERS)
        assert len(ready) == 0


class TestAdvanceStatus:
    def test_ta_exclude(self):
        ta = ScreeningDecision("1", "title_abstract", "exclude", "reason")
        assert advance_status(ta) == "exclude_ta"

    def test_ta_uncertain(self):
        ta = ScreeningDecision("1", "title_abstract", "uncertain", "reason")
        assert advance_status(ta) == "uncertain_ta"

    def test_ta_include_no_pdf(self):
        ta = ScreeningDecision("1", "title_abstract", "include", "reason")
        assert advance_status(ta, has_pdf=False) == "needs_pdf_upload"

    def test_ta_include_ft_include(self):
        ta = ScreeningDecision("1", "title_abstract", "include", "reason")
        ft = ScreeningDecision("1", "full_text", "include", "reason")
        assert advance_status(ta, ft) == "ready_for_extraction"

    def test_ta_include_ft_exclude(self):
        ta = ScreeningDecision("1", "title_abstract", "include", "reason")
        ft = ScreeningDecision("1", "full_text", "exclude", "reason")
        assert advance_status(ta, ft) == "exclude_ft"

    def test_ta_include_ft_uncertain(self):
        ta = ScreeningDecision("1", "title_abstract", "include", "reason")
        ft = ScreeningDecision("1", "full_text", "uncertain", "reason")
        assert advance_status(ta, ft) == "uncertain_ft"
