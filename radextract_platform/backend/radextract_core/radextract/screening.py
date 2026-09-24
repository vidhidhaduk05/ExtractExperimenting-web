"""
screening.py — two-stage PRISMA screening for systematic reviews.

Implements the traditional systematic review screening workflow:
  1. Title/Abstract screening — LLM screens each paper against PICOS criteria
  2. Full-text screening — LLM screens full text for papers that passed TA screening

Screening tags (status field):
  pending              — not yet screened
  include_ta           — included at title/abstract level
  exclude_ta           — excluded at title/abstract level (with reason)
  uncertain_ta         — uncertain at TA level, needs human verification
  include_ft           — included at full-text level
  exclude_ft           — excluded at full-text level (with reason)
  uncertain_ft         — uncertain at FT level, needs human verification
  needs_pdf_upload     — passed TA screening but no PDF available for FT screening
  ready_for_extraction — passed all screening, ready for data extraction

Two backends (mirroring extract.py):
  DeterministicScreener — rule-based or injected decisions, for tests/demos
  LLMScreener           — delegates to a user-supplied model_fn
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Optional, Dict, List, Any


# --------------------------------------------------------------------------- #
# Screening decision
# --------------------------------------------------------------------------- #
@dataclass
class ScreeningDecision:
    """Result of screening one paper at one stage."""
    paper_id: str
    stage: str               # "title_abstract" or "full_text"
    status: str              # include, exclude, uncertain, needs_pdf
    reason: str = ""
    confidence: float = 1.0  # 0-1, LLM self-reported
    picos_matches: dict = field(default_factory=dict)  # {P: bool, I: bool, C: bool, O: bool, S: bool}

    def to_dict(self) -> dict:
        return {"paper_id": self.paper_id, "stage": self.stage, "status": self.status,
                "reason": self.reason, "confidence": self.confidence,
                "picos_matches": self.picos_matches}


# --------------------------------------------------------------------------- #
# Screening status constants
# --------------------------------------------------------------------------- #
TA_STATUSES = {"include_ta", "exclude_ta", "uncertain_ta"}
FT_STATUSES = {"include_ft", "exclude_ft", "uncertain_ft", "needs_pdf_upload"}
TERMINAL_STATUSES = {"exclude_ta", "exclude_ft", "ready_for_extraction",
                     "uncertain_ta", "uncertain_ft", "needs_pdf_upload"}


def advance_status(ta_decision: ScreeningDecision,
                   ft_decision: Optional[ScreeningDecision] = None,
                   has_pdf: bool = True) -> str:
    """Compute the final screening status from TA + FT decisions."""
    if ta_decision.status == "exclude":
        return "exclude_ta"
    if ta_decision.status == "uncertain":
        return "uncertain_ta"
    if ta_decision.status == "include":
        if not has_pdf:
            return "needs_pdf_upload"
        if ft_decision is None:
            return "include_ta"  # TA passed, FT not yet done
        if ft_decision.status == "exclude":
            return "exclude_ft"
        if ft_decision.status == "uncertain":
            return "uncertain_ft"
        if ft_decision.status == "include":
            return "ready_for_extraction"
    return "pending"


# --------------------------------------------------------------------------- #
# Screener interface
# --------------------------------------------------------------------------- #
class Screener:
    """Interface: ``screen_title_abstract(paper, picos) -> ScreeningDecision``."""

    def screen_title_abstract(self, paper: dict, picos: dict) -> ScreeningDecision:
        raise NotImplementedError

    def screen_full_text(self, paper: dict, full_text: str, picos: dict) -> ScreeningDecision:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# DeterministicScreener — for tests and demos (no LLM)
# --------------------------------------------------------------------------- #
class DeterministicScreener(Screener):
    """Rule-based or injected screener for reproducible tests.

    Provide ONE of:
      * ``decision_fn(paper, picos, stage) -> ScreeningDecision|dict``
      * ``decisions_by_id={paper_id: ScreeningDecision|dict}`` — static per-paper
      * ``default_status`` — same decision for every paper
    """
    def __init__(self, *, decision_fn: Optional[Callable] = None,
                 decisions_by_id: Optional[dict] = None,
                 default_status: str = "include",
                 default_reason: str = "deterministic include"):
        self.decision_fn = decision_fn
        self.decisions_by_id = decisions_by_id or {}
        self.default_status = default_status
        self.default_reason = default_reason

    def _make_decision(self, paper: dict, stage: str, status: str, reason: str) -> ScreeningDecision:
        return ScreeningDecision(
            paper_id=str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?")),
            stage=stage, status=status, reason=reason,
            picos_matches={"P": True, "I": True, "C": True, "O": True, "S": True}
            if status == "include" else {}
        )

    def screen_title_abstract(self, paper: dict, picos: dict) -> ScreeningDecision:
        pid = str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?"))
        if self.decision_fn:
            out = self.decision_fn(paper, picos, "title_abstract")
            return out if isinstance(out, ScreeningDecision) else ScreeningDecision(
                paper_id=pid, stage="title_abstract", **{k: v for k, v in out.items() if k in
                ("status", "reason", "confidence", "picos_matches")})
        if pid in self.decisions_by_id:
            out = self.decisions_by_id[pid]
            if isinstance(out, dict) and "ta_status" in out:
                return self._make_decision(paper, "title_abstract", out["ta_status"], out.get("ta_reason", ""))
            elif isinstance(out, dict) and "status" in out:
                return self._make_decision(paper, "title_abstract", out["status"], out.get("reason", ""))
            elif isinstance(out, ScreeningDecision) and out.stage == "title_abstract":
                return out
            elif isinstance(out, ScreeningDecision):
                return ScreeningDecision(paper_id=pid, stage="title_abstract",
                                         status=out.status, reason=out.reason,
                                         confidence=out.confidence, picos_matches=out.picos_matches)
        return self._make_decision(paper, "title_abstract", self.default_status, self.default_reason)

    def screen_full_text(self, paper: dict, full_text: str, picos: dict) -> ScreeningDecision:
        pid = str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?"))
        if self.decision_fn:
            out = self.decision_fn(paper, picos, "full_text")
            return out if isinstance(out, ScreeningDecision) else ScreeningDecision(
                paper_id=pid, stage="full_text", **{k: v for k, v in out.items() if k in
                ("status", "reason", "confidence", "picos_matches")})
        if pid in self.decisions_by_id:
            out = self.decisions_by_id[pid]
            if isinstance(out, dict) and "ft_status" in out:
                return self._make_decision(paper, "full_text", out["ft_status"], out.get("ft_reason", ""))
            elif isinstance(out, ScreeningDecision) and out.stage == "full_text":
                return out
        return self._make_decision(paper, "full_text", self.default_status, self.default_reason)


# --------------------------------------------------------------------------- #
# LLMScreener — delegates to a user-supplied model_fn
# --------------------------------------------------------------------------- #
class LLMScreener(Screener):
    """LLM-driven screener.

    ``model_fn(prompt, **kwargs) -> dict`` must return a dict with keys:
        status (str), reason (str), confidence (float), picos_matches (dict)
    """
    def __init__(self, model_fn: Callable, *, picos: Optional[dict] = None):
        self.model_fn = model_fn
        self._picos = picos or {}

    def _build_ta_prompt(self, paper: dict, picos: dict) -> str:
        return (
            f"You are screening papers for a radiology systematic review.\n\n"
            f"PICOS CRITERIA:\n"
            f"  Population: {picos.get('population', 'NR')}\n"
            f"  Intervention: {picos.get('intervention', 'NR')}\n"
            f"  Comparator: {picos.get('comparator', 'NR')}\n"
            f"  Outcome: {picos.get('outcome', 'NR')}\n"
            f"  Study design: {picos.get('study_design', 'NR')}\n\n"
            f"PAPER:\n"
            f"  Title: {paper.get('title', 'NR')}\n"
            f"  Abstract: {paper.get('abstract', 'NR')}\n\n"
            f"Screen this paper at the TITLE/ABSTRACT level.\n"
            f"Decide:\n"
            f"  - include: clearly meets ALL PICOS criteria\n"
            f"  - exclude: clearly does NOT meet one or more criteria (specify which)\n"
            f"  - uncertain: cannot determine from title/abstract alone\n\n"
            f"Return JSON: {{\"status\": \"include|exclude|uncertain\", "
            f"\"reason\": \"...\", \"confidence\": 0.0-1.0, "
            f"\"picos_matches\": {{\"P\": true/false, \"I\": true/false, "
            f"\"C\": true/false, \"O\": true/false, \"S\": true/false}}}}"
        )

    def _build_ft_prompt(self, paper: dict, full_text: str, picos: dict) -> str:
        # Truncate full text to avoid token explosion
        text = full_text[:50000] if len(full_text) > 50000 else full_text
        return (
            f"You are screening papers for a radiology systematic review.\n\n"
            f"PICOS CRITERIA:\n"
            f"  Population: {picos.get('population', 'NR')}\n"
            f"  Intervention: {picos.get('intervention', 'NR')}\n"
            f"  Comparator: {picos.get('comparator', 'NR')}\n"
            f"  Outcome: {picos.get('outcome', 'NR')}\n"
            f"  Study design: {picos.get('study_design', 'NR')}\n\n"
            f"PAPER TITLE: {paper.get('title', 'NR')}\n\n"
            f"FULL TEXT (truncated if >50k chars):\n{text}\n\n"
            f"Screen this paper at the FULL-TEXT level.\n"
            f"Decide:\n"
            f"  - include: clearly meets ALL PICOS criteria based on full text\n"
            f"  - exclude: clearly does NOT meet one or more criteria (specify which)\n"
            f"  - uncertain: full text is ambiguous or missing key information\n\n"
            f"Return JSON: {{\"status\": \"include|exclude|uncertain\", "
            f"\"reason\": \"...\", \"confidence\": 0.0-1.0, "
            f"\"picos_matches\": {{\"P\": true/false, \"I\": true/false, "
            f"\"C\": true/false, \"O\": true/false, \"S\": true/false}}}}"
        )

    def screen_title_abstract(self, paper: dict, picos: dict) -> ScreeningDecision:
        pid = str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?"))
        prompt = self._build_ta_prompt(paper, picos)
        out = self.model_fn(prompt, paper=paper, picos=picos, stage="title_abstract")
        if isinstance(out, ScreeningDecision):
            return out
        d = out or {}
        return ScreeningDecision(
            paper_id=pid, stage="title_abstract",
            status=d.get("status", "uncertain"),
            reason=d.get("reason", ""),
            confidence=float(d.get("confidence", 0.5)),
            picos_matches=d.get("picos_matches", {}),
        )

    def screen_full_text(self, paper: dict, full_text: str, picos: dict) -> ScreeningDecision:
        pid = str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?"))
        prompt = self._build_ft_prompt(paper, full_text, picos)
        out = self.model_fn(prompt, paper=paper, picos=picos, stage="full_text")
        if isinstance(out, ScreeningDecision):
            return out
        d = out or {}
        return ScreeningDecision(
            paper_id=pid, stage="full_text",
            status=d.get("status", "uncertain"),
            reason=d.get("reason", ""),
            confidence=float(d.get("confidence", 0.5)),
            picos_matches=d.get("picos_matches", {}),
        )


# --------------------------------------------------------------------------- #
# Batch screening with PRISMA flow tracking
# --------------------------------------------------------------------------- #
def screen_batch(
    papers: List[dict],
    screener: Screener,
    picos: dict,
    *,
    full_texts: Optional[Dict[str, str]] = None,
    has_pdf_fn: Optional[Callable] = None,
) -> dict:
    """Screen a batch of papers through TA + FT stages.

    Args:
        papers: list of paper dicts (must have 'pmid' or 'doi' or 'id', 'title', 'abstract')
        screener: a Screener instance
        picos: PICOS dict with keys: population, intervention, comparator, outcome, study_design
        full_texts: optional {paper_id: full_text_str} for FT screening
        has_pdf_fn: optional callable(paper) -> bool; defaults to checking full_texts

    Returns:
        {
            "decisions": [ScreeningDecision, ...],
            "final_statuses": {paper_id: status_str},
            "prisma_flow": {
                "identified": N,
                "ta_screened": N,
                "ta_included": N,
                "ta_excluded": N,
                "ta_uncertain": N,
                "ft_screened": N,
                "ft_included": N,
                "ft_excluded": N,
                "ft_uncertain": N,
                "needs_pdf": N,
                "ready_for_extraction": N,
            },
            "excluded_with_reasons": [{paper_id, stage, reason}, ...],
        """
    full_texts = full_texts or {}
    if has_pdf_fn is None:
        has_pdf_fn = lambda p: str(p.get("pmid") or p.get("doi") or p.get("id", "?")) in full_texts

    decisions = []
    final_statuses = {}
    excluded = []

    # PRISMA counters
    flow = {
        "identified": len(papers),
        "ta_screened": 0, "ta_included": 0, "ta_excluded": 0, "ta_uncertain": 0,
        "ft_screened": 0, "ft_included": 0, "ft_excluded": 0, "ft_uncertain": 0,
        "needs_pdf": 0, "ready_for_extraction": 0,
    }

    for paper in papers:
        pid = str(paper.get("pmid") or paper.get("doi") or paper.get("id", "?"))

        # Stage 1: Title/Abstract screening
        ta_dec = screener.screen_title_abstract(paper, picos)
        decisions.append(ta_dec)
        flow["ta_screened"] += 1

        if ta_dec.status == "exclude":
            flow["ta_excluded"] += 1
            final_statuses[pid] = "exclude_ta"
            excluded.append({"paper_id": pid, "stage": "title_abstract", "reason": ta_dec.reason})
            continue
        if ta_dec.status == "uncertain":
            flow["ta_uncertain"] += 1
            final_statuses[pid] = "uncertain_ta"
            continue
        if ta_dec.status == "include":
            flow["ta_included"] += 1
        else:
            final_statuses[pid] = "pending"
            continue

        # Stage 2: Full-text screening (only for TA-included papers)
        has_pdf = has_pdf_fn(paper)
        if not has_pdf:
            flow["needs_pdf"] += 1
            final_statuses[pid] = "needs_pdf_upload"
            continue

        ft_text = full_texts.get(pid, "")
        ft_dec = screener.screen_full_text(paper, ft_text, picos)
        decisions.append(ft_dec)
        flow["ft_screened"] += 1

        if ft_dec.status == "exclude":
            flow["ft_excluded"] += 1
            final_statuses[pid] = "exclude_ft"
            excluded.append({"paper_id": pid, "stage": "full_text", "reason": ft_dec.reason})
        elif ft_dec.status == "uncertain":
            flow["ft_uncertain"] += 1
            final_statuses[pid] = "uncertain_ft"
        elif ft_dec.status == "include":
            flow["ft_included"] += 1
            flow["ready_for_extraction"] += 1
            final_statuses[pid] = "ready_for_extraction"
        else:
            final_statuses[pid] = "include_ta"  # FT not completed

    return {
        "decisions": [d.to_dict() for d in decisions],
        "final_statuses": final_statuses,
        "prisma_flow": flow,
        "excluded_with_reasons": excluded,
    }


def get_ready_papers(final_statuses: dict, papers: List[dict]) -> List[dict]:
    """Filter papers that are ready for extraction."""
    ready_ids = {pid for pid, status in final_statuses.items()
                 if status == "ready_for_extraction"}
    return [p for p in papers
            if str(p.get("pmid") or p.get("doi") or p.get("id", "?")) in ready_ids]
