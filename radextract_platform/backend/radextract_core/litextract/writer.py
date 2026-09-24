"""
writer.py — append-only workbook writer.

Preserves the contract proven in the CVR pipeline:
  * never modify rows 1-2 (header + instruction) or any existing data row;
  * append new rows contiguously after the last populated row per sheet;
  * preserve all existing data-validation dropdowns;
  * colour-code flagged cells by confidence;
  * write to /workspace then shell-``cp`` to the S3-backed destination (the
    FUSE mount rejects random-access writes and metadata copies).

Accepts assembled records in the {sheet: [row_dict, ...]} structure and writes
each row's values in the codebook column order.
"""
from __future__ import annotations
import os
import shutil
import subprocess
from typing import Optional

# confidence -> fill colour (amber/blue/peach/orange), matching the CVR scheme
FLAG_FILLS = {
    "derived": "FFF2CC",
    "inferred": "DDEBF7",
    "ocr_low_confidence": "FCE4D6",
    "figure": "F8CBAD",
    "adjudicated": "E2EFDA",     # green — value set by the referee
    "escalated": "FFC7CE",       # red — needs human adjudication
}


def _lastrow(ws, start=3):
    last = start - 1
    for r in range(start, ws.max_row + 1):
        if ws.cell(r, 1).value not in (None, ""):
            last = r
    return last


def append_records(records: dict, project, src_workbook: str, dest_workbook: str,
                   *, flags: Optional[dict] = None, work_dir: str = "/workspace"):
    """Append ``records`` to a copy of ``src_workbook``, save to ``dest_workbook``.

    ``flags``: optional {(sheet, row_index_in_records, field): confidence} to
    colour-code specific appended cells. Returns a write summary.
    """
    import openpyxl
    from openpyxl.styles import PatternFill

    flags = flags or {}
    os.makedirs(work_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(dest_workbook))[0]
    # unique staging name so it never collides with the destination even when
    # work_dir == dirname(dest_workbook) (cp would otherwise fail "same file").
    work_path = os.path.join(work_dir, f"{stem}.staging.{os.getpid()}.xlsx")
    if os.path.abspath(work_path) == os.path.abspath(dest_workbook):
        work_path = os.path.join(work_dir, f"{stem}.staging.alt.xlsx")

    # start from the source workbook to preserve headers/instructions/dropdowns
    shutil.copy(src_workbook, work_path)
    wb = openpyxl.load_workbook(work_path)

    written = {}
    flagged_cells = 0
    for sheet in project.data_sheets():
        ws = wb[sheet]
        col_names = [name for _, name in project.sheet_order[sheet]]
        col_idx = {name: i + 1 for i, name in enumerate(col_names)}
        start_row = _lastrow(ws, project.schema.data_start_row) + 1
        rows = records.get(sheet, [])
        for j, row in enumerate(rows):
            rownum = start_row + j
            for name, value in row.items():
                if name not in col_idx:
                    continue
                c = col_idx[name]
                ws.cell(row=rownum, column=c, value=value)
                conf = flags.get((sheet, j, name))
                if conf in FLAG_FILLS:
                    ws.cell(row=rownum, column=c).fill = PatternFill(
                        "solid", fgColor=FLAG_FILLS[conf])
                    flagged_cells += 1
        written[sheet] = {"start_row": start_row, "n_rows": len(rows)}

    wb.save(work_path)
    wb.close()

    # stage -> copy to destination (cross-platform & FUSE-safe)
    dest_dir = os.path.dirname(dest_workbook)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)
    shutil.copyfile(work_path, dest_workbook)
    # remove the local staging copy (best-effort)
    try:
        os.remove(work_path)
    except OSError:
        pass

    return {"dest": dest_workbook, "written": written, "flagged_cells": flagged_cells,
            "bytes": os.path.getsize(dest_workbook)}


def count_dropdowns(workbook_path, data_sheets) -> dict:
    """Return {sheet: n_data_validations, '_total': n} for a workbook."""
    import openpyxl
    wb = openpyxl.load_workbook(workbook_path)
    out, total = {}, 0
    for sh in data_sheets:
        n = len(wb[sh].data_validations.dataValidation)
        out[sh] = n
        total += n
    out["_total"] = total
    return out
