"""
pipeline.py — orchestration of the two-extractor + referee flow.

Per document:
    parse
      -> Agent A extract  (Extractor backend, agent_id="A")
      -> Agent B extract  (Extractor backend, agent_id="B")
      -> reconcile        (type-aware cell comparison)
      -> adjudicate       (referee on disagree / one_missing cells)
      -> assemble         (reconciled records: agreement + referee decisions)
      -> validate         (config-driven rules)
      -> [optional] append-only workbook write + audit sidecars

``run`` handles a single document; ``run_batch`` iterates with per-document
checkpointing. Records are assembled into the {sheet: [row,...]} structure that
validate() and the writer consume.
"""
from __future__ import annotations
import os
import pickle
from typing import Optional, List

from .document import parse_document, parse_text
from .extract import Extractor, Record
from .reconcile import reconcile
from .adjudicate import Adjudicator, DeterministicAdjudicator, adjudicate_cells
from .validate import validate
from .writer import append_records
from .audit import write_audit


# --------------------------------------------------------------------------- #
# Assemble reconciled records
# --------------------------------------------------------------------------- #
def _records_struct_from(rec: Record, project) -> dict:
    """Turn a single Record into {sheet: [row,...]} keyed by data sheet."""
    out = {s: [] for s in project.data_sheets()}
    parent_sheet = project.data_sheets()[0]
    if rec.parent_row:
        out[parent_sheet].append(dict(rec.parent_row))
    for sheet, rows in rec.child_rows.items():
        out.setdefault(sheet, []).extend(dict(r) for r in rows)
    return out


def assemble_reconciled(rec_a: Record, reconciled: dict, adjudication: dict,
                        project) -> dict:
    """Build the final {sheet: [row,...]} using Agent A as the base, then apply
    referee decisions on adjudicated cells. Escalated cells are tagged with the
    'escalated' confidence so the writer flags them red.

    Returns {"records": {...}, "flags": {(sheet, row_idx, field): confidence}}.
    """
    records = _records_struct_from(rec_a, project)

    # build a path -> (sheet, row_idx, field) map for the assembled records
    path_to_loc = {}
    for sheet, rows in records.items():
        kf = project.schema.key_of(sheet)
        for idx, row in enumerate(rows):
            key = str(row.get(kf, "?")) if kf else "?"
            for fld in row:
                path_to_loc[f"{sheet}[{key}].{fld}"] = (sheet, idx, fld)

    flags = {}
    for d in adjudication.get("decisions", []):
        loc = path_to_loc.get(d["path"])
        if loc is None:
            continue
        sheet, idx, fld = loc
        dec = d.get("decision", {})
        if dec.get("escalate"):
            flags[(sheet, idx, fld)] = "escalated"
        elif dec.get("value") is not None:
            records[sheet][idx][fld] = dec["value"]
            flags[(sheet, idx, fld)] = "adjudicated"
    return {"records": records, "flags": flags}


# --------------------------------------------------------------------------- #
# Single-document run
# --------------------------------------------------------------------------- #
def run(project, document, *, extractor_a: Extractor, extractor_b: Extractor,
        adjudicator: Optional[Adjudicator] = None, parsed: Optional[dict] = None,
        doc_id: Optional[str] = None, src_workbook: Optional[str] = None,
        dest_workbook: Optional[str] = None, audit_dir: Optional[str] = None,
        write: bool = False) -> dict:
    """Run the full pipeline for one document.

    ``document`` may be a path (parsed via parse_document) or raw text (parsed
    via parse_text) — or pass a pre-parsed dict as ``parsed``.
    Returns a result dict with reconciled records, validation, and audit info.
    """
    adjudicator = adjudicator or DeterministicAdjudicator()
    if parsed is None:
        if os.path.exists(str(document)):
            parsed = parse_document(document)
            doc_id = doc_id or os.path.splitext(os.path.basename(document))[0]
        else:
            parsed = parse_text(str(document))
            doc_id = doc_id or "doc"
    doc_id = doc_id or "doc"

    rec_a = extractor_a.extract(parsed, project, agent_id="A")
    rec_b = extractor_b.extract(parsed, project, agent_id="B")

    reconciled = reconcile(rec_a, rec_b, project)
    adjudication = adjudicate_cells(reconciled, parsed, project, adjudicator)
    assembled = assemble_reconciled(rec_a, reconciled, adjudication, project)

    issues, vsummary = validate(assembled["records"], project)

    result = {
        "doc_id": doc_id,
        "reconcile_summary": reconciled["summary"],
        "adjudication": {"resolved": adjudication["resolved"],
                         "escalated": adjudication["escalated"]},
        "records": assembled["records"],
        "flags": assembled["flags"],
        "validation": vsummary,
        "issues": issues,
    }

    if audit_dir:
        result["audit"] = write_audit(audit_dir, doc_id, rec_a, rec_b,
                                       reconciled, adjudication)
    if write:
        if not (src_workbook and dest_workbook):
            raise ValueError("write=True requires src_workbook and dest_workbook")
        result["write"] = append_records(assembled["records"], project,
                                          src_workbook, dest_workbook,
                                          flags=assembled["flags"])
    return result


# --------------------------------------------------------------------------- #
# Batch run with checkpointing
# --------------------------------------------------------------------------- #
def run_batch(project, documents: List, *, extractor_a: Extractor,
              extractor_b: Extractor, adjudicator: Optional[Adjudicator] = None,
              checkpoint: Optional[str] = None, **run_kwargs) -> dict:
    """Run ``run`` over a list of documents, checkpointing results after each.

    ``documents`` is a list of (doc_id, document) pairs or paths. Returns
    {doc_id: result}. Re-running skips doc_ids already in the checkpoint.
    """
    done = {}
    if checkpoint and os.path.exists(checkpoint):
        with open(checkpoint, "rb") as fh:
            done = pickle.load(fh)
    for item in documents:
        if isinstance(item, (tuple, list)):
            did, doc = item
        else:
            did, doc = (os.path.splitext(os.path.basename(item))[0], item)
        if did in done:
            continue
        res = run(project, doc, extractor_a=extractor_a, extractor_b=extractor_b,
                  adjudicator=adjudicator, doc_id=did, **run_kwargs)
        done[did] = res
        if checkpoint:
            tmp = checkpoint + ".tmp"
            with open(tmp, "wb") as fh:
                pickle.dump(done, fh)
            os.replace(tmp, checkpoint)
    return done
