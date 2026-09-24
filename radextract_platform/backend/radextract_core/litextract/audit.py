"""
audit.py — persist the four per-run transparency sidecars.

For each document/run we persist:
  1. agent_a_records.json   — Agent A's raw Record
  2. agent_b_records.json   — Agent B's raw Record
  3. referee_decisions.json — every adjudicated cell + the referee's decision
  4. agreement_audit.csv    — one row per compared cell with both candidates,
                              the reconciliation status, and (if any) the
                              referee outcome.

These let a human re-adjudicate without re-running extraction.
"""
from __future__ import annotations
import csv
import json
import os
from typing import Optional

from .extract import Record


def _as_dict(rec):
    return rec.as_dict() if isinstance(rec, Record) else rec


def write_audit(out_dir: str, doc_id: str, rec_a, rec_b, reconciled: dict,
                adjudication: Optional[dict] = None) -> dict:
    """Write the four sidecars for one document into ``out_dir/<doc_id>/``."""
    run_dir = os.path.join(out_dir, doc_id)
    os.makedirs(run_dir, exist_ok=True)
    paths = {}

    with open(os.path.join(run_dir, "agent_a_records.json"), "w", encoding="utf-8") as f:
        json.dump(_as_dict(rec_a), f, indent=1, ensure_ascii=False, default=str)
    paths["agent_a"] = os.path.join(run_dir, "agent_a_records.json")

    with open(os.path.join(run_dir, "agent_b_records.json"), "w", encoding="utf-8") as f:
        json.dump(_as_dict(rec_b), f, indent=1, ensure_ascii=False, default=str)
    paths["agent_b"] = os.path.join(run_dir, "agent_b_records.json")

    decisions = (adjudication or {}).get("decisions", [])
    with open(os.path.join(run_dir, "referee_decisions.json"), "w", encoding="utf-8") as f:
        json.dump(decisions, f, indent=1, ensure_ascii=False, default=str)
    paths["referee"] = os.path.join(run_dir, "referee_decisions.json")

    # agreement audit CSV (one row per cell)
    dec_by_path = {d["path"]: d.get("decision", {}) for d in decisions}
    csv_path = os.path.join(run_dir, "agreement_audit.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["path", "sheet", "key", "field", "field_type", "value_a",
                    "value_b", "status", "referee_value", "referee_escalated",
                    "referee_rationale"])
        for c in reconciled["cells"]:
            dec = dec_by_path.get(c["path"], {})
            w.writerow([c["path"], c["sheet"], c["key"], c["field"], c.get("field_type", ""),
                        c.get("a"), c.get("b"), c["status"],
                        dec.get("value", ""), dec.get("escalate", ""),
                        dec.get("rationale", "")])
    paths["agreement_csv"] = csv_path

    return {"run_dir": run_dir, "paths": paths,
            "n_cells": len(reconciled["cells"]),
            "n_decisions": len(decisions)}
