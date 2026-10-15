"""Tests for upright table rebuild (radextract_core/radextract/table_rebuild.py)."""
from types import SimpleNamespace

import pytest

from radextract_core.radextract import table_rebuild as tr


# ── pure helpers ──

def test_transpose_pads_short_rows():
    assert tr.transpose([["a", "b", "c"], ["1"]]) == [["a", "1"], ["b", ""], ["c", ""]]


def test_transpose_empty():
    assert tr.transpose([]) == []


def test_unique_header_suffixes_duplicates():
    assert tr.unique_header(["Age", "Age", "", "Sex"]) == ["Age", "Age (2)", "column", "Sex"]


def test_build_records_uses_header_and_skips_empty_rows():
    header, records = tr.build_records([["Case", "Age"], ["1", "47"], ["", ""], ["2", "41"]])
    assert header == ["Case", "Age"]
    assert records == [{"Case": "1", "Age": "47"}, {"Case": "2", "Age": "41"}]


def test_build_records_pads_short_rows():
    _, records = tr.build_records([["Case", "Age", "HTN"], ["1", "47"]])
    assert records == [{"Case": "1", "Age": "47", "HTN": ""}]


def test_find_issues_flags_text_not_in_table_area():
    grid = [["Case", "1"], ["Ghost value", "47"]]
    issues = tr.find_issues(grid, table_text="Case 1 47")
    assert [(i["row"], i["col"], i["text"]) for i in issues] == [(1, 0, "Ghost value")]


def test_find_issues_none_text_checks_nothing():
    assert tr.find_issues([["x"]], table_text=None) == []


# ── analyze_table on a real generated PDF with sideways text ──

def _sideways_pdf(path):
    """A page where each *Docling row* is drawn as vertical text (reads bottom-to-top),
    i.e. the transposed layout Docling returns for a table printed sideways."""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(path), pagesize=letter)
    # Docling grid: rows = variables (listed in REVERSE for bottom-to-top text, as seen on the
    # Oushy PDF), columns = patients
    grid = [["HTN", "Yes", "No"], ["Age", "47", "41"], ["Case", "1", "2"]]
    for r, row in enumerate(grid):
        c.saveState()
        c.translate(100 + r * 40, 500)
        c.rotate(90)
        c.drawString(0, 0, "   ".join(row))
        c.restoreState()
    c.showPage()
    c.save()
    return grid


def _box():
    # Docling-style box with top-left origin (no to_top_left_origin, so used as-is)
    return SimpleNamespace(l=50, t=150, r=300, b=350)


def test_sideways_table_is_detected_and_flipped(tmp_path):
    pdf = tmp_path / "sideways.pdf"
    grid = _sideways_pdf(pdf)

    out = tr.analyze_table(str(pdf), page_no=1, bbox=_box(), grid=grid)

    assert out["orientation"] == "rotated"
    assert out["rows"] == [["Case", "Age", "HTN"], ["1", "47", "Yes"], ["2", "41", "No"]]
    assert out["header"] == ["Case", "Age", "HTN"]
    assert out["records"] == [
        {"Case": "1", "Age": "47", "HTN": "Yes"},
        {"Case": "2", "Age": "41", "HTN": "No"},
    ]
    assert out["issues"] == []


def test_index_map_points_docling_cells_at_upright_positions(tmp_path):
    pdf = tmp_path / "sideways.pdf"
    grid = _sideways_pdf(pdf)
    out = tr.analyze_table(str(pdf), page_no=1, bbox=_box(), grid=grid)
    # Docling (row 1, col 2) = "Age" row, patient 2 -> upright row 2 (patient 2), col 1 (Age)
    assert out["index_map"](1, 2) == (2, 1)
    # Docling (row 2, col 1) = "Case" row, patient 1 -> upright row 1, col 0
    assert out["index_map"](2, 1) == (1, 0)


def test_unreadable_pdf_keeps_table_as_docling_returned_it(tmp_path):
    grid = [["Case", "1"], ["Age", "47"]]
    out = tr.analyze_table(str(tmp_path / "missing.pdf"), page_no=1, bbox=_box(), grid=grid)
    assert out["orientation"] == "unknown"
    assert out["rows"] == grid
    assert out["records"] == [{"Case": "Age", "1": "47"}]


def test_no_pdf_path_marks_unknown_without_error():
    out = tr.analyze_table(None, page_no=1, bbox=None, grid=[["H", "V"]])
    assert out["orientation"] == "unknown" and out["rows"] == [["H", "V"]]


# ── word-position rebuild (cells come from where the words sit, not from Docling's cell boxes) ──

def _ruled_sideways_pdf(path):
    """A sideways table as printed in the Oushy paper: left-aligned cells, wrapped text,
    a rule under the header. Text reads bottom-to-top; each record is one vertical band."""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(path), pagesize=letter)
    c.setFont("Helvetica", 8)

    def put(x, y, text):
        c.saveState()
        c.translate(x, y)
        c.rotate(90)
        c.drawString(0, 0, text)
        c.restoreState()

    # Column start positions (PDF y); reading goes upward, so the first column is the lowest.
    for name, y in {"Case": 200, "Age": 260, "Imaging appearance": 340, "Smoker": 600}.items():
        put(100, y, name)
    c.line(120, 150, 120, 650)  # rule under the header row
    records = [
        ("1", "47", ["Tortuous artery,", "mildly dilated"], "No"),
        ("2", "41", ["Tortuous"], "Yes"),
        ("3", "17", ["Tortuous SCA", "tightly wound"], "No"),
    ]
    for k, (case, age, lines, smoker) in enumerate(records):
        x = 135 + k * 40
        put(x, 200, case)
        put(x, 260, age)
        put(x, 600, smoker)
        for n, line in enumerate(lines):
            put(x + n * 10, 340, line)
    c.showPage()
    c.save()


def test_word_grid_keeps_wrapped_cells_and_one_value_per_record(tmp_path):
    pdf = tmp_path / "ruled.pdf"
    _ruled_sideways_pdf(pdf)
    import pymupdf

    page = pymupdf.open(str(pdf))[0]
    g = tr.word_grid(page, (0, 0, 612, 792), -1.0)

    assert g is not None
    assert g["rows"][0] == ["Case", "Age", "Imaging appearance", "Smoker"]
    assert g["rows"][1:] == [
        ["1", "47", "Tortuous artery, mildly dilated", "No"],
        ["2", "41", "Tortuous", "Yes"],
        ["3", "17", "Tortuous SCA tightly wound", "No"],
    ]
    assert g["issues"] == []


def test_analyze_table_uses_word_positions_for_sideways_tables(tmp_path):
    pdf = tmp_path / "ruled.pdf"
    _ruled_sideways_pdf(pdf)
    # Docling's grid for this table is not needed: the words decide the cells.
    out = tr.analyze_table(str(pdf), page_no=1, bbox=SimpleNamespace(l=0, t=0, r=612, b=792), grid=[["junk"]])

    assert out["orientation"] == "rotated"
    assert out["method"] == "word_positions"
    assert out["records"][0] == {"Case": "1", "Age": "47", "Imaging appearance": "Tortuous artery, mildly dilated", "Smoker": "No"}
    assert len(out["records"]) == 3
    assert out["cell_boxes"] and all(len(cb["bbox"]) == 4 for cb in out["cell_boxes"])


# ── upright tables: title row folded into the grid, spacer columns ──

def test_title_row_is_peeled_off_and_the_next_row_becomes_the_header():
    grid = [["Table 3", "Diagnostic guide for PAMs", ""],
            ["Criterion", "", "Characteristics"],
            ["Imaging", "", "Catheter angiography"],
            ["Location", "", "All intracranial arteries"]]
    out = tr.analyze_table(None, 1, None, grid)
    assert out["caption"] == "Table 3 Diagnostic guide for PAMs"
    assert out["header"] == ["Criterion", "Characteristics"]
    assert out["records"] == [{"Criterion": "Imaging", "Characteristics": "Catheter angiography"},
                              {"Criterion": "Location", "Characteristics": "All intracranial arteries"}]
    assert out["raw_rows"] if "raw_rows" in out else True


@pytest.mark.parametrize("title", ["Table 2.", "Table S1:", "Supplementary Table 4", "TABLE IV", "Tab. 5 Baseline"])
def test_common_caption_labels(title):
    out = tr.analyze_table(None, 1, None, [[title, ""], ["A", "B"], ["1", "2"]])
    assert out["header"] == ["A", "B"] and out["caption"].startswith(title.split()[0])


def test_single_spanned_title_over_a_wider_header():
    # Docling repeats a spanned title in each column it covers.
    grid = [["Patient characteristics", "Patient characteristics", "Patient characteristics"],
            ["Age", "Sex", "Smoker"], ["47", "F", "No"]]
    out = tr.analyze_table(None, 1, None, grid)
    assert out["caption"] == "Patient characteristics" and out["header"] == ["Age", "Sex", "Smoker"]


def test_a_normal_header_row_is_left_alone():
    grid = [["Age", "Sex", "Smoker"], ["47", "F", "No"], ["41", "M", "Yes"]]
    out = tr.analyze_table(None, 1, None, grid)
    assert out["caption"] == "" and out["header"] == ["Age", "Sex", "Smoker"] and len(out["records"]) == 2


def test_a_two_column_table_with_a_short_first_row_is_not_mistaken_for_a_title():
    grid = [["Criterion", "Characteristics"], ["Imaging", "Angiography"]]
    assert tr.analyze_table(None, 1, None, grid)["caption"] == ""


def test_spacer_columns_are_dropped_but_columns_with_any_text_stay():
    grid = [["A", "", "C", ""], ["1", "", "", ""], ["2", "", "x", ""]]
    out = tr.analyze_table(None, 1, None, grid)
    assert out["header"] == ["A", "C"]
    assert out["rows"] == [["A", "C"], ["1", ""], ["2", "x"]]


def test_index_map_follows_removed_title_and_spacer_cells():
    grid = [["Table 3", "Guide", ""], ["Criterion", "", "Text"], ["Imaging", "", "Angio"]]
    m = tr.analyze_table(None, 1, None, grid)["index_map"]
    assert m(0, 0) is None            # title cell, removed
    assert m(1, 0) == (0, 0)          # "Criterion" is now the header
    assert m(1, 1) is None            # spacer column, removed
    assert m(2, 2) == (1, 1)          # "Angio"


def test_all_empty_or_single_row_grids_do_not_crash():
    assert tr.analyze_table(None, 1, None, [])["rows"] == []
    assert tr.analyze_table(None, 1, None, [["Table 1", "x"]])["header"] == ["Table 1", "x"]
