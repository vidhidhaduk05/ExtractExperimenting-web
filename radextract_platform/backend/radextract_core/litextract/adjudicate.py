"""
adjudicate.py — the third-agent "referee".

Invoked ONLY on cells the reconciler marks 'disagree' or 'one_missing'. The
referee's task is deliberately narrow and source-grounded: given the two
candidate values and the source span(s) on the cited page, choose the value the
source supports — or ``escalate`` for human adjudication when the source is
ambiguous or absent.

Two backends share one interface:

* ``DeterministicAdjudicator`` — re-reads the document for each candidate
  (whitespace-insensitive) and picks the one that is actually present; if both
  or neither appear, it escalates. Fully reproducible (tests/demos).
* ``AgentAdjudicator`` — delegates to a ``model_fn`` (an LLM/agent referee),
  passing the field, both candidates, and the located source snippets.

Every decision is recorded with a rationale and provenance, feeding the audit.
"""
from __future__ import annotations
from typing import Callable, Optional, Any

from .document import find_in_document, in_document


def _missing(v, missing_tokens) -> bool:
    return v is None or str(v).strip() == "" or str(v).strip() in missing_tokens


class Adjudicator:
    """Interface: ``decide(cell, parsed, project) -> decision dict``.

    decision = {value, source, rationale, escalate: bool, decided_by}
    """
    name = "adjudicator"

    def decide(self, cell: dict, parsed: dict, project) -> dict:
        raise NotImplementedError


class DeterministicAdjudicator(Adjudicator):
    """Source-grounded referee: pick the candidate present in the document."""
    name = "deterministic_referee"

    def decide(self, cell: dict, parsed: dict, project) -> dict:
        a, b = cell.get("a"), cell.get("b")
        mt = project.schema.missing_tokens
        a_in = (not _missing(a, mt)) and in_document(parsed, str(a))
        b_in = (not _missing(b, mt)) and in_document(parsed, str(b))

        if a_in and not b_in:
            return self._decided(a, parsed, "value A present in source; B absent")
        if b_in and not a_in:
            return self._decided(b, parsed, "value B present in source; A absent")
        if cell["status"] == "one_missing":
            # one agent supplied a value, the other left it missing:
            present = a if not _missing(a, mt) else b
            if present is not None and in_document(parsed, str(present)):
                return self._decided(present, parsed, "single non-missing value confirmed in source")
        # ambiguous: both present, or neither present
        reason = ("both candidates present in source — needs human judgment"
                  if (a_in and b_in) else "neither candidate located in source")
        return {"value": None, "source": None, "rationale": reason,
                "escalate": True, "decided_by": self.name}

    def _decided(self, value, parsed, rationale) -> dict:
        hits = find_in_document(parsed, str(value), window=80)
        src = {"page": hits[0][0], "quote": hits[0][1]} if hits else None
        return {"value": value, "source": src, "rationale": rationale,
                "escalate": False, "decided_by": self.name}


class AgentAdjudicator(Adjudicator):
    """LLM/agent referee. ``model_fn(field, a, b, snippets, project) -> dict``."""
    name = "agent_referee"

    def __init__(self, model_fn: Callable):
        self.model_fn = model_fn

    def decide(self, cell: dict, parsed: dict, project) -> dict:
        a, b = cell.get("a"), cell.get("b")
        snippets = {
            "a": [s for _, s in find_in_document(parsed, str(a), window=120)][:3] if a else [],
            "b": [s for _, s in find_in_document(parsed, str(b), window=120)][:3] if b else [],
        }
        out = self.model_fn(field=cell["field"], a=a, b=b, snippets=snippets, project=project) or {}
        out.setdefault("escalate", out.get("value") is None)
        out.setdefault("decided_by", self.name)
        out.setdefault("source", None)
        out.setdefault("rationale", "")
        return out


def adjudicate_cells(reconciled: dict, parsed: dict, project,
                     adjudicator: Optional[Adjudicator] = None) -> dict:
    """Run the referee over every non-agreeing cell.

    Returns {"decisions": [{**cell, decision}], "resolved": int, "escalated": int}.
    """
    adjudicator = adjudicator or DeterministicAdjudicator()
    decisions, resolved, escalated = [], 0, 0
    for cell in reconciled["cells"]:
        if cell["status"] == "agree":
            continue
        dec = adjudicator.decide(cell, parsed, project)
        if dec.get("escalate"):
            escalated += 1
        else:
            resolved += 1
        decisions.append({**cell, "decision": dec})
    return {"decisions": decisions, "resolved": resolved, "escalated": escalated}
