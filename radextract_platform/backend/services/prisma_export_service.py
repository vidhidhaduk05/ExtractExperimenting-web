"""PRISMA 2020 flow diagram export service.

Single source of truth for PRISMA flow counts (get_prisma_flow_data) plus
renderers for downloadable formats:
  - PNG  (R grid graphics png() device; cairosvg/matplotlib fallbacks)
  - DOCX (python-docx: embedded diagram + fully editable data tables)

The SVG path (r_plot_service.generate_prisma_flow) is unchanged.
"""
from __future__ import annotations

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_prisma_flow_data(project_id: str, db) -> dict:
    """Compute PRISMA 2020 flow counts for a project.

    This is the single source of truth used by the /prisma JSON endpoint,
    the /prisma/svg endpoint, and the PNG/DOCX exporters.
    """
    total_records = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ?", (project_id,)
    ).fetchone()["c"]
    ta_screened = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage IN ('ta', 'ft')",
        (project_id,),
    ).fetchone()["c"]
    ta_excluded = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ta' AND screening_status = 'excluded'",
        (project_id,),
    ).fetchone()["c"]
    ta_excluded_reasons = db.execute(
        "SELECT screening_reason, COUNT(*) as c FROM studies "
        "WHERE project_id = ? AND screening_stage = 'ta' AND screening_status = 'excluded' "
        "GROUP BY screening_reason ORDER BY c DESC",
        (project_id,),
    ).fetchall()
    ft_assessed = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ft'",
        (project_id,),
    ).fetchone()["c"]
    ft_excluded = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'excluded'",
        (project_id,),
    ).fetchone()["c"]
    ft_excluded_reasons = db.execute(
        "SELECT screening_reason, COUNT(*) as c FROM studies "
        "WHERE project_id = ? AND screening_stage = 'ft' AND screening_status = 'excluded' "
        "GROUP BY screening_reason ORDER BY c DESC",
        (project_id,),
    ).fetchall()
    included = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'included'",
        (project_id,),
    ).fetchone()["c"]
    in_meta = db.execute(
        """SELECT COUNT(DISTINCT s.study_id) as c FROM studies s
           JOIN extractions e ON s.study_id = e.study_id
           WHERE s.project_id = ? AND s.screening_status = 'included'""",
        (project_id,),
    ).fetchone()["c"]
    pending = db.execute(
        "SELECT COUNT(*) as c FROM studies WHERE project_id = ? AND screening_status = 'pending'",
        (project_id,),
    ).fetchone()["c"]

    return {
        "project_id": project_id,
        "identification": {
            "database_records": total_records,
            "registers": 0,
            "other_sources": 0,
            "total": total_records,
        },
        "screening": {
            "records_screened": ta_screened,
            "records_excluded": ta_excluded,
            "excluded_with_reasons": [
                {"reason": r["screening_reason"] or "Not specified", "count": r["c"]}
                for r in ta_excluded_reasons
            ],
        },
        "eligibility": {
            "full_text_assessed": ft_assessed,
            "full_text_excluded": ft_excluded,
            "excluded_reasons": [
                {"reason": r["screening_reason"] or "Not specified", "count": r["c"]}
                for r in ft_excluded_reasons
            ],
        },
        "included": {
            "studies_in_review": included,
            "studies_in_meta_analysis": in_meta,
        },
        "pending": pending,
    }


def render_prisma_png(flow_data: dict) -> Optional[bytes]:
    """Render the PRISMA diagram to PNG bytes.

    Primary: R prisma_flow.R with png() device (selected by .png extension).
    Fallback: convert the SVG (R or chart_engine) to PNG with cairosvg.
    """
    from services.r_plot_service import call_r_script_bytes, generate_prisma_flow

    # Primary: R png() device
    try:
        png = call_r_script_bytes("prisma_flow.R", dict(flow_data), ext=".png")
        if png:
            return png
    except Exception as e:
        logger.warning(f"[PRISMA] R PNG render failed: {e}")

    # Fallback: SVG -> PNG via cairosvg
    try:
        import cairosvg
        svg = generate_prisma_flow(flow_data)
        if svg:
            return cairosvg.svg2png(
                bytestring=svg.encode("utf-8"),
                output_width=2200,
                output_height=1600,
                background_color="white",
            )
    except Exception as e:
        logger.warning(f"[PRISMA] cairosvg PNG fallback failed: {e}")

    return None


def _add_table(doc, title: str, rows: list[tuple[str, object]]):
    """Add a headed, editable 2-column table to the document."""
    doc.add_heading(title, level=2)
    table = doc.add_table(rows=len(rows) + 1, cols=2)
    table.style = "Light Grid Accent 1"
    table.rows[0].cells[0].text = "Item"
    table.rows[0].cells[1].text = "Count"
    for i, (label, value) in enumerate(rows, start=1):
        table.rows[i].cells[0].text = str(label)
        table.rows[i].cells[1].text = str(value)


def render_prisma_docx(flow_data: dict, project_name: str = "",
                       png_bytes: Optional[bytes] = None) -> bytes:
    """Build an editable Word document for the PRISMA 2020 flow.

    Contains the diagram image (when available) followed by native Word
    tables holding every count and exclusion reason, so the numbers can be
    edited afterwards for manuscripts.
    """
    from docx import Document
    from docx.shared import Inches

    id_ = flow_data["identification"]
    scr = flow_data["screening"]
    elig = flow_data["eligibility"]
    incl = flow_data["included"]
    pending = flow_data.get("pending", 0)

    doc = Document()
    title = "PRISMA 2020 Flow Diagram"
    if project_name:
        title += f" — {project_name}"
    doc.add_heading(title, level=0)

    if png_bytes:
        doc.add_picture(io.BytesIO(png_bytes), width=Inches(6.5))
        doc.add_paragraph(
            "The diagram above is a static image. All counts below are editable "
            "tables — update the numbers there, then regenerate or adjust your "
            "diagram for publication."
        )

    _add_table(doc, "Identification", [
        ("Records identified from databases", id_["database_records"]),
        ("Records identified from registers", id_["registers"]),
        ("Records identified from other sources", id_["other_sources"]),
        ("Total records identified", id_["total"]),
    ])

    _add_table(doc, "Screening (title/abstract)", [
        ("Records screened", scr["records_screened"]),
        ("Records excluded", scr["records_excluded"]),
    ])

    ta_rows = [(r["reason"], r["count"]) for r in scr.get("excluded_with_reasons", [])]
    if ta_rows:
        _add_table(doc, "Title/abstract exclusion reasons", ta_rows)

    _add_table(doc, "Eligibility (full-text)", [
        ("Full-text articles assessed", elig["full_text_assessed"]),
        ("Full-text articles excluded", elig["full_text_excluded"]),
    ])

    ft_rows = [(r["reason"], r["count"]) for r in elig.get("excluded_reasons", [])]
    if ft_rows:
        _add_table(doc, "Full-text exclusion reasons", ft_rows)

    _add_table(doc, "Included", [
        ("Studies included in review", incl["studies_in_review"]),
        ("Studies included in meta-analysis", incl["studies_in_meta_analysis"]),
        ("Records pending screening", pending),
    ])

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
