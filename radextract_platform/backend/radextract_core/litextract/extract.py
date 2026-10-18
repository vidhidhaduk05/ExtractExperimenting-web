"""
extract.py — extractor interface + backends.

A *Record* is the generalized version of the proven CVR record shape:

    Record = {
        "parent_row":  {field: value, ...},              # one Study_Level-like row
        "child_rows":  {sheet: [ {field: value, ...}, ... ], ...},
        "citations":   [ {sheet, key, field, value, page, quote, confidence}, ... ],
        "status":      "ok" | "partial" | "failed",
        "note":        str,
    }

Two extractor backends share one interface so they are interchangeable:

* ``DeterministicBackend`` — returns records from an injected callable or a
  static mapping. No LLM, fully reproducible: used for tests, demos, and as the
  substrate for double-entry simulations.
* ``AgentBackend`` — builds a per-field prompt from the project's prompt library
  and delegates to a user-supplied ``model_fn`` (an in-process model call or an
  adapter around the platform Agent tool). The two parallel extractors are two
  *instances*, optionally seeded/instructed differently, so they read blind to
  each other.
"""
from __future__ import annotations
from dataclasses import dataclass, field as _dc_field
from typing import Callable, Optional, Dict, List, Any


@dataclass
class Record:
    parent_row: Dict[str, Any] = _dc_field(default_factory=dict)
    child_rows: Dict[str, List[Dict[str, Any]]] = _dc_field(default_factory=dict)
    citations: List[Dict[str, Any]] = _dc_field(default_factory=list)
    status: str = "ok"
    note: str = ""

    def as_dict(self) -> dict:
        return {"parent_row": self.parent_row, "child_rows": self.child_rows,
                "citations": self.citations, "status": self.status, "note": self.note}

    @staticmethod
    def from_dict(d: dict) -> "Record":
        return Record(parent_row=dict(d.get("parent_row", {})),
                      child_rows={k: [dict(r) for r in v] for k, v in d.get("child_rows", {}).items()},
                      citations=list(d.get("citations", [])),
                      status=d.get("status", "ok"), note=d.get("note", ""))


class Extractor:
    """Interface: ``extract(parsed, project, *, agent_id) -> Record``."""
    agent_id: str = "agent"

    def extract(self, parsed: dict, project, *, agent_id: Optional[str] = None) -> Record:
        raise NotImplementedError


class DeterministicBackend(Extractor):
    """Reproducible extractor.

    Provide ONE of:
      * ``record_fn(parsed, project, agent_id) -> Record|dict`` — computed records, or
      * ``records_by_agent={agent_id: Record|dict}`` — static per-agent records, or
      * ``record=Record|dict`` — same record for any agent.
    """
    def __init__(self, *, record_fn: Optional[Callable] = None,
                 records_by_agent: Optional[dict] = None,
                 record: Optional[Any] = None, agent_id: str = "A"):
        self.record_fn = record_fn
        self.records_by_agent = records_by_agent or {}
        self.record = record
        self.agent_id = agent_id

    def extract(self, parsed: dict, project, *, agent_id: Optional[str] = None) -> Record:
        aid = agent_id or self.agent_id
        if self.record_fn is not None:
            out = self.record_fn(parsed, project, aid)
        elif aid in self.records_by_agent:
            out = self.records_by_agent[aid]
        elif self.record is not None:
            out = self.record
        else:
            out = Record(status="failed", note="DeterministicBackend: no record source")
        return out if isinstance(out, Record) else Record.from_dict(out)


class AgentBackend(Extractor):
    """LLM/agent-driven extractor.

    ``model_fn(prompt, *, parsed, project, agent_id) -> dict`` must return a
    Record-shaped dict. This indirection lets the caller wire in an in-process
    model call or an adapter around the platform Agent tool without this module
    depending on any specific runtime. ``build_prompt`` assembles a per-document
    instruction from the project's prompt library + codebook field list.
    """
    def __init__(self, model_fn: Callable, *, agent_id: str = "A",
                 instruction: str = ""):
        self.model_fn = model_fn
        self.agent_id = agent_id
        self.instruction = instruction

    def build_prompt(self, parsed: dict, project) -> str:
        lib = project.prompts or {}
        header = self.instruction or (
            "You are an independent data extractor for a systematic review. "
            "Extract every codebook field strictly as reported. Transcribe numbers "
            "verbatim (no unit conversion). Use NR/NA/unclear for missing values. "
            "Controlled-vocabulary fields must use an allowed value exactly. "
            "Cite page + source quote for every non-missing value."
        )
        fields = "\n".join(
            f"  [{sh}] {name}" + (f"  (allowed: {', '.join(project.vocab[(sh, name)])})"
                                  if (sh, name) in project.vocab else "")
            for sh in project.data_sheets()
            for _, name in project.sheet_order[sh]
        )
        context_extra = ""
        figures = parsed.get("figures", [])
        if figures:
            fig_lines = []
            for fig in figures:
                if fig.get("ocr_text"):
                    fig_lines.append(f"  Page {fig.get('page')}: {fig.get('ocr_text')}")
            if fig_lines:
                context_extra = "\n\nEXTRACTED FIGURE/IMAGE OCR TEXT:\n" + "\n".join(fig_lines)

        return (f"{header}\n\nPROJECT: {project.name}\nAGENT_ID: {self.agent_id}\n"
                f"PROMPT_LIBRARY_KEYS: {list(lib.keys())}\n\nFIELDS:\n{fields}{context_extra}\n")

    def extract(self, parsed: dict, project, *, agent_id: Optional[str] = None) -> Record:
        aid = agent_id or self.agent_id
        prompt = self.build_prompt(parsed, project)
        out = self.model_fn(prompt, parsed=parsed, project=project, agent_id=aid)
        return out if isinstance(out, Record) else Record.from_dict(out or {})
