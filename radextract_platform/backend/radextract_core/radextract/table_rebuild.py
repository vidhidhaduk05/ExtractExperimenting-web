"""Rebuild Docling tables into an upright, per-record layout and record how sure we are.

Docling returns each table as a grid of cells. For tables printed sideways on a portrait
page (common for wide clinical tables) the grid comes out transposed: each grid row is a
variable and each grid column a patient. This module:

  1. detects whether the table's text runs vertically (from the PDF text direction),
  2. flips the grid so every row is one record and row 0 is the header,
  3. builds ``records`` (one dict per row, keyed by header),
  4. checks every cell's text against the PDF text inside the table box and reports any
     cell that cannot be found there (``issues``), instead of silently trusting it.

Everything is additive: callers keep the raw grid (``raw_rows``) and an index map so
cell-level highlight boxes can be re-pointed at the upright grid.
"""
from __future__ import annotations

import logging
import re
from typing import Any, List, Optional, Tuple

logger = logging.getLogger("radextract.table_rebuild")

# Share of text lines running vertically needed to call a table "rotated".
ROTATED_MIN_RATIO = 0.6


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _to_pdf_rect(bbox: Any, page_height: float) -> Optional[Tuple[float, float, float, float]]:
    """Docling bbox -> (x0, top, x1, bottom) in PDF points with a top-left origin."""
    if bbox is None:
        return None
    try:
        if hasattr(bbox, "to_top_left_origin"):
            bbox = bbox.to_top_left_origin(page_height)
        return float(bbox.l), float(bbox.t), float(bbox.r), float(bbox.b)
    except Exception:
        return None


def detect_orientation(fitz_page: Any, rect: Tuple[float, float, float, float]) -> str:
    """'rotated' if most text lines in ``rect`` run vertically, 'upright' if horizontally, else 'unknown'."""
    import pymupdf  # local import: optional dependency

    clip = pymupdf.Rect(*rect)
    data = fitz_page.get_text("dict", clip=clip)
    rotated = upright = 0
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            dx, dy = line.get("dir", (1.0, 0.0))
            if abs(dy) > 0.7:
                rotated += 1
            elif abs(dx) > 0.7:
                upright += 1
    total = rotated + upright
    if total == 0:
        return "unknown"
    return "rotated" if rotated / total >= ROTATED_MIN_RATIO else "upright"


def vertical_reading_sign(fitz_page: Any, rect: Tuple[float, float, float, float]) -> float:
    """Mean direction of vertical text lines in ``rect``: -1.0 = reads bottom-to-top, +1.0 = top-to-bottom."""
    import pymupdf

    data = fitz_page.get_text("dict", clip=pymupdf.Rect(*rect))
    dys = [line["dir"][1] for b in data.get("blocks", []) for line in b.get("lines", [])
           if abs(line.get("dir", (1.0, 0.0))[1]) > 0.7]
    return sum(dys) / len(dys) if dys else 0.0


def page_text_in_rect(fitz_page: Any, rect: Tuple[float, float, float, float]) -> str:
    import pymupdf

    return _norm(fitz_page.get_text("text", clip=pymupdf.Rect(*rect)))


def transpose(grid: List[List[str]]) -> List[List[str]]:
    """Swap rows and columns, padding short rows with empty strings."""
    if not grid:
        return []
    width = max(len(r) for r in grid)
    padded = [list(r) + [""] * (width - len(r)) for r in grid]
    return [list(col) for col in zip(*padded)]


def unique_header(names: List[str]) -> List[str]:
    """Make header names unique so they can be used as dict keys."""
    seen: dict[str, int] = {}
    out = []
    for n in names:
        base = n.strip() or "column"
        seen[base] = seen.get(base, 0) + 1
        out.append(base if seen[base] == 1 else f"{base} ({seen[base]})")
    return out


def build_records(rows: List[List[str]]) -> Tuple[List[str], List[dict]]:
    """Header = row 0. Each later non-empty row becomes a dict keyed by the header."""
    if not rows:
        return [], []
    header = unique_header(rows[0])
    records = []
    for r in rows[1:]:
        if not any(_norm(c) for c in r):
            continue
        padded = list(r) + [""] * (len(header) - len(r))
        records.append({h: padded[i] for i, h in enumerate(header)})
    return header, records


def find_issues(grid: List[List[str]], table_text: Optional[str]) -> List[dict]:
    """Cells whose text cannot be found in the PDF text of the table box.

    ``table_text`` None means the PDF text was unavailable, so nothing can be checked.
    Indices refer to ``grid`` (the grid as Docling returned it).
    """
    if table_text is None:
        return []
    issues = []
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            text = _norm(cell)
            if text and text not in table_text:
                issues.append({"row": r, "col": c, "text": text, "reason": "cell text not found in table area of the PDF"})
    return issues


# "Table 3", "Table 2.", "Supplementary Table S1:", "Tab. 4" ... at the start of a cell.
CAPTION_LABEL_RE = re.compile(r"^(supplement(ary|al)\s+)?(table|tab\.?)\s*[\w.\-]+\s*[:.\-]?(\s|$)", re.IGNORECASE)


def _filled(row: List[str]) -> List[str]:
    return [_norm(c) for c in row if _norm(c)]


def split_caption_rows(grid: List[List[str]], max_rows: int = 2) -> Tuple[List[str], List[List[str]], int]:
    """Peel title rows off the top of an upright grid.

    Docling often folds the printed table title into the first grid row, which would then be
    read as the header. A leading row is a title when one of its cells starts with a table label ("Table 3",
    "Supplementary Table S1"), or when it is a single value (possibly repeated across spanned
    cells) over a row with several different values.
    Returns (caption lines, remaining grid, number of rows removed).
    """
    captions: List[str] = []
    removed = 0
    rows = [list(r) for r in grid]
    while removed < max_rows and len(rows) >= 2:
        first, below = _filled(rows[0]), _filled(rows[1])
        if not first or not below:
            break
        labelled = any(CAPTION_LABEL_RE.match(c) for c in first)
        single = len(set(first)) == 1 and len(set(below)) >= 2
        if not (labelled or single):
            break
        text = " ".join(dict.fromkeys(first))
        captions.append(text)
        rows = rows[1:]
        removed += 1
    return captions, rows, removed


def drop_empty_columns(grid: List[List[str]]) -> Tuple[List[List[str]], List[Optional[int]]]:
    """Remove columns with no text in any row (spacer columns Docling invents).

    Returns (grid, column_map) where column_map[old_col] is the new index, or None when the column
    was dropped. A grid that is entirely empty is returned unchanged.
    """
    if not grid:
        return grid, []
    width = max(len(r) for r in grid)
    keep = [c for c in range(width) if any(_norm(r[c]) for r in grid if c < len(r))]
    if not keep or len(keep) == width:
        return grid, list(range(width))
    new_index = {old: new for new, old in enumerate(keep)}
    out = [[r[c] if c < len(r) else "" for c in keep] for r in grid]
    return out, [new_index.get(c) for c in range(width)]


COLUMN_TOL = 2.0       # points; words within this distance count as aligned
HEADER_GAP = 3.0       # points; header words further apart than this are different columns
LINE_TOL = 2.0         # points; words this close vertically are on the same line
ROW_TOL = 2.0          # points; a word this close above a case number still belongs to that record
CASE_NUMBER_RE = re.compile(r"^\d+$")


def _segment_starts(line: List[dict], gap: float) -> List[float]:
    """Start positions of the runs of words on one line that are separated by more than ``gap``."""
    starts: List[float] = []
    prev: Optional[dict] = None
    for it in sorted(line, key=lambda i: i["start"]):
        if prev is None or it["start"] - prev["end"] > gap:
            starts.append(it["start"])
        prev = it
    return starts


def _lines(items: List[dict]) -> List[List[dict]]:
    """Group words into text lines (words with the same 'down' position)."""
    lines: List[List[dict]] = []
    for it in sorted(items, key=lambda i: (i["down"], i["start"])):
        if lines and abs(it["down"] - lines[-1][-1]["down"]) <= LINE_TOL:
            lines[-1].append(it)
        else:
            lines.append([it])
    return lines


def _header_column_starts(header_items: List[dict]) -> List[float]:
    """Column left edges, read from the header band.

    A header label starts exactly at its column's left edge and header text is not justified,
    so the start of each run of header words (split by wide gaps) is a column. Several header
    lines can share one column, so starts are merged when they line up.
    """
    starts: List[float] = []
    for line in _lines(header_items):
        starts += _segment_starts(line, HEADER_GAP)
    merged: List[float] = []
    for s in sorted(starts):
        if not merged or s - merged[-1] > COLUMN_TOL:
            merged.append(s)
    return merged


def _header_rule_down(fitz_page: Any, rect: Tuple[float, float, float, float], dx: float, dy: float) -> Optional[float]:
    """Position ('down' coordinate) of the rule under the header, if the table is ruled.

    Sideways tables are drawn with vertical rules; the one that runs the full table length
    just inside the top border is the line under the header row.
    """
    x0, y0, x1, y1 = rect
    downs = [dx * x + dy * y for x in (x0, x1) for y in (y0, y1)]
    top, bottom = min(downs), max(downs)
    length = y1 - y0
    totals: dict[float, float] = {}
    for d in fitz_page.get_drawings():
        r = d["rect"]
        if r.width >= 1.5 or r.height <= 20:
            continue
        pos = dx * (r.x0 + r.x1) / 2 + dy * (r.y0 + r.y1) / 2
        if not (top + 3 < pos < bottom - 3):
            continue
        key = round(pos, 0)
        totals[key] = totals.get(key, 0.0) + r.height
    candidates = [pos for pos, total in totals.items() if total >= 0.5 * length]
    return min(candidates) if candidates else None


def word_grid(fitz_page: Any, rect: Tuple[float, float, float, float], reading_sign: float) -> Optional[dict]:
    """Rebuild a sideways table from word positions, not from Docling's cell boxes.

    The tables are left-aligned: the text of a column starts at the column's left edge. So:
      * the table's leftmost words are the case numbers, one record per case number,
      * columns come from the header band (see _header_column_starts),
      * each body word goes to the column it starts in and the record band it sits in.
    Docling's split/merge decisions are ignored, so "No No" stays two values, one per case.

    Returns ``rows`` (header first, then one row per record), ``issues`` and ``cell_boxes``
    (highlight boxes as fractions of the page), or None when the layout is not clear enough.
    """
    import pymupdf

    # Reading direction in page coordinates, and "down the table" = reading direction turned 90 degrees.
    ux, uy = 0.0, (-1.0 if reading_sign < 0 else 1.0)
    dx, dy = -uy, ux

    items = []
    for x0, y0, x1, y1, text, *_ in fitz_page.get_text("words", clip=pymupdf.Rect(*rect)):
        alongs = [ux * x + uy * y for x, y in ((x0, y0), (x0, y1), (x1, y0), (x1, y1))]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        items.append({"text": text, "start": min(alongs), "end": max(alongs),
                      "down": dx * cx + dy * cy, "box": (x0, y0, x1, y1)})
    if not items:
        return None

    # Record anchors: the case numbers in the leftmost position of the table, top to bottom.
    case_left = min(i["start"] for i in items)
    anchors = sorted(
        (i["down"], int(i["text"])) for i in items
        if abs(i["start"] - case_left) <= COLUMN_TOL and CASE_NUMBER_RE.match(i["text"])
    )
    if len(anchors) < 2:
        return None
    anchor_downs = [a[0] for a in anchors]

    # Header band: above the rule under the header if the table is ruled, else above the first record.
    header_limit = _header_rule_down(fitz_page, rect, dx, dy)
    if header_limit is None:
        header_limit = anchor_downs[0] - ROW_TOL
    header_items = [i for i in items if i["down"] < header_limit]
    columns = _header_column_starts(header_items)
    if len(columns) < 2 or abs(columns[0] - case_left) > COLUMN_TOL:
        return None

    def column_of(start: float) -> Optional[int]:
        found = None
        for idx, left in enumerate(columns):
            if start >= left - COLUMN_TOL:
                found = idx
        return found

    # A record's band runs from its case number down to the next case number.
    boundaries = [a - ROW_TOL for a in anchor_downs[1:]]

    def band_of(down: float) -> int:
        """-1 = header, otherwise the index of the record the word belongs to."""
        if down < header_limit:
            return -1
        return sum(1 for b in boundaries if down >= b)

    cells: dict[Tuple[int, int], List[dict]] = {}
    issues: List[dict] = []
    for it in items:
        col = column_of(it["start"])
        band = band_of(it["down"])
        if col is None:
            issues.append({"row": band + 1 if band >= 0 else 0, "col": -1, "text": it["text"],
                           "reason": "word is left of the table columns"})
            continue
        cells.setdefault((band, col), []).append(it)

    def text_of(its: List[dict]) -> str:
        """Words in reading order. A word hyphenated at a line break is joined to the next line's word."""
        ordered = sorted(its, key=lambda i: (round(i["down"] / 4), i["start"]))
        out = ""
        prev: Optional[dict] = None
        for it in ordered:
            if prev is None:
                out = it["text"]
            elif prev["text"].endswith("-") and abs(it["down"] - prev["down"]) > LINE_TOL:
                out += it["text"]
            else:
                out += " " + it["text"]
            prev = it
        return out

    n_cols = len(columns)
    header = [text_of(cells.get((-1, c), [])) for c in range(n_cols)]
    body = [[text_of(cells.get((k, c), [])) for c in range(n_cols)] for k in range(len(anchors))]
    rows = [header] + body

    numbers = [n for _, n in anchors]
    for k in range(1, len(numbers)):
        if numbers[k] != numbers[k - 1] + 1:
            issues.append({"row": k + 1, "col": 0, "text": str(numbers[k]),
                           "reason": "case number is out of sequence"})
    for k, row in enumerate(body):
        for c, value in enumerate(row):
            if not value:
                issues.append({"row": k + 1, "col": c, "text": "",
                               "reason": "empty cell in word layout (check the PDF)"})

    page_w = float(fitz_page.rect.width)
    page_h = float(fitz_page.rect.height)
    cell_boxes = []
    for (band, col), its in cells.items():
        x0 = min(i["box"][0] for i in its)
        y0 = min(i["box"][1] for i in its)
        x1 = max(i["box"][2] for i in its)
        y1 = max(i["box"][3] for i in its)
        cell_boxes.append({
            "row": 0 if band < 0 else band + 1,
            "col": col,
            "text": text_of(its),
            "bbox": (x0 / page_w, y0 / page_h, x1 / page_w, y1 / page_h),
        })
    return {"rows": rows, "issues": issues, "cell_boxes": cell_boxes}


def analyze_table(
    pdf_path: Optional[str],
    page_no: int,
    bbox: Any,
    grid: List[List[str]],
) -> dict[str, Any]:
    """Work out orientation, upright rows, header, records and issues for one Docling table.

    Returns a dict with ``orientation``, ``method`` (how the rows were built), ``rows`` (upright),
    ``header``, ``records``, ``caption`` (title text peeled off an upright table), ``issues``,
    ``index_map`` (Docling (row, col) -> upright (row, col), or None for a removed cell; the function
    itself is None when ``cell_boxes`` is used instead) and ``cell_boxes`` (None unless word positions were used).
    Never raises: if the PDF cannot be read, the table is kept as Docling returned it and marked unknown.
    """
    orientation = "unknown"
    reading_sign = 0.0
    table_text: Optional[str] = None
    rect = None
    words_layout: Optional[dict] = None

    if pdf_path and bbox is not None:
        try:
            import pymupdf

            doc = pymupdf.open(pdf_path)
            try:
                fpage = doc[page_no - 1]
                rect = _to_pdf_rect(bbox, fpage.rect.height)
                if rect is not None:
                    orientation = detect_orientation(fpage, rect)
                    if orientation == "rotated":
                        reading_sign = vertical_reading_sign(fpage, rect)
                        if reading_sign:
                            words_layout = word_grid(fpage, rect, reading_sign)
                    table_text = page_text_in_rect(fpage, rect)
            finally:
                doc.close()
        except Exception as e:
            logger.warning("Table layout check failed on page %s: %s", page_no, e)

    if words_layout is not None:
        rows = words_layout["rows"]
        header, records = build_records(rows)
        return {
            "orientation": orientation,
            "method": "word_positions",
            "rows": rows,
            "header": header,
            "records": records,
            "caption": "",
            "issues": words_layout["issues"],
            "index_map": None,
            "cell_boxes": words_layout["cell_boxes"],
        }

    rotated = orientation == "rotated"
    # Docling lists a sideways table's variables in reverse when the text reads bottom-to-top,
    # so reverse them back before flipping. Seen on a PDF whose text reads bottom-to-top.
    reverse_fields = rotated and reading_sign < 0
    n_grid_rows = len(grid)

    captions: List[str] = []
    caption_rows = 0
    column_map: Optional[List[Optional[int]]] = None
    if rotated:
        ordered = list(reversed(grid)) if reverse_fields else [list(r) for r in grid]
        rows = transpose(ordered)
    else:
        # Upright: peel off a title row folded into the grid, then drop spacer columns.
        captions, rows, caption_rows = split_caption_rows(grid)
        rows, column_map = drop_empty_columns(rows)

    def index_map(r: int, c: int) -> Optional[Tuple[int, int]]:
        """Docling (row, col) -> upright (row, col); None for cells that were removed (title, spacer)."""
        if not rotated:
            r -= caption_rows
            new_c = column_map[c] if column_map is not None and c < len(column_map) else c
            return None if r < 0 or new_c is None else (r, new_c)
        upright_r = n_grid_rows - 1 - r if reverse_fields else r
        return (c, upright_r)

    header, records = build_records(rows)
    # Issues are reported in the upright grid's coordinates; a problem in a removed title cell
    # is kept with row/col -1 so it is still visible.
    issues = []
    for i in find_issues(grid, table_text):
        mapped = index_map(i["row"], i["col"])
        row, col = mapped if mapped is not None else (-1, -1)
        issues.append({**i, "row": row, "col": col})
    return {
        "orientation": orientation,
        "method": "docling_transposed" if rotated else "docling_grid",
        "rows": rows,
        "header": header,
        "records": records,
        "caption": " ".join(captions),
        "issues": issues,
        "index_map": index_map,
        "cell_boxes": None,
    }
