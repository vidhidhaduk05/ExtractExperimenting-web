from __future__ import annotations
import csv
import io
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import FileResponse, Response

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from config import settings
from services.storage_backend import get_storage
from services.reference_export import export_ris, export_bibtex, export_endnote_xml

router = APIRouter(prefix="/api", tags=["export"])


@router.get("/projects/{project_id}/export/csv")
async def export_project_csv_alias(
    project_id: str,
    include_rob: bool = Query(True, description="Include RoB data in export"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Alias for GET /projects/{id}/export?format=csv."""
    return await export_project(project_id, format="csv", include_rob=include_rob, user=user, db=db)


@router.get("/projects/{project_id}/export/xlsx")
async def export_project_xlsx_alias(
    project_id: str,
    include_rob: bool = Query(True, description="Include RoB data in export"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Alias for GET /projects/{id}/export?format=xlsx."""
    return await export_project(project_id, format="xlsx", include_rob=include_rob, user=user, db=db)


@router.get("/projects/{project_id}/export")
async def export_project(
    project_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    include_rob: bool = Query(True, description="Include RoB data in export"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Export all project data (extractions + RoB) as CSV or Excel."""
    check_project_access(db, project_id, user)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if format == "xlsx":
        return await _export_xlsx(project_id, timestamp, include_rob, db)
    else:
        return await _export_csv(project_id, timestamp, include_rob, db)


def _fetch_extractions_map(db: DBBackend, project_id: str, study_ids: list[str]) -> dict[str, dict[str, str]]:
    """Fetch extractions in bulk for all project studies to avoid N+1 queries.

    Returns dict mapping study_id -> {variable_id: value}.
    """
    ext_map_by_study: dict[str, dict[str, str]] = {sid: {} for sid in study_ids if sid}
    if not study_ids:
        return ext_map_by_study

    try:
        # Fast bulk JOIN query for relational backends (e.g., SQLite)
        rows = db.execute(
            """SELECT e.study_id, e.variable_id, e.value
               FROM extractions e
               JOIN studies s ON e.study_id = s.study_id
               WHERE s.project_id = ?""",
            (project_id,),
        ).fetchall()
        for r in rows:
            sid = r["study_id"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[0]
            vid = r["variable_id"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[1]
            val = r["value"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[2]
            if sid in ext_map_by_study:
                ext_map_by_study[sid][vid] = val if val is not None else ""
        return ext_map_by_study
    except NotImplementedError:
        # Fallback for key-value / NoSQL backends (e.g., DynamoDB)
        for sid in study_ids:
            if not sid:
                continue
            ext_list = db.query("extractions", {"study_id": sid})
            ext_map_by_study[sid] = {e.get("variable_id"): (e.get("value") or "") for e in ext_list}
        return ext_map_by_study


def _fetch_rob_map(db: DBBackend, project_id: str, include_rob: bool) -> dict[str, dict]:
    """Fetch RoB assessments in bulk for the project to avoid N+1 queries.

    Returns dict mapping study_id -> rob_assessment_dict.
    """
    if not include_rob:
        return {}
    all_rob = db.query("rob_assessments", {"project_id": project_id})
    rob_map = {}
    for r in all_rob:
        sid = r.get("study_id")
        if sid and sid not in rob_map:
            rob_map[sid] = r
    return rob_map


async def _export_csv(project_id: str, timestamp: str, include_rob: bool, db: DBBackend) -> Response:
    proj = db.get("projects", project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    variables = db.query("variables", {"project_id": project_id}, order_by="order_index ASC")
    studies = db.query("studies", {"project_id": project_id}, order_by="title ASC")

    study_ids = [s.get("study_id", "") for s in studies if s.get("study_id")]
    ext_map_by_study = _fetch_extractions_map(db, project_id, study_ids)
    rob_map = _fetch_rob_map(db, project_id, include_rob)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    headers = ["Study ID", "Title", "Authors", "Year", "Journal", "DOI"]
    headers += [f"{v.get('section', '')}/{v.get('name', '')}" for v in variables]
    if include_rob:
        headers += ["RoB Tool", "RoB Overall"]
    writer.writerow(headers)

    for s in studies:
        study_id = s.get("study_id", "")
        row = [
            study_id,
            s.get("title", ""),
            s.get("authors", ""),
            s.get("publication_year", ""),
            s.get("journal", ""),
            s.get("doi", ""),
        ]
        ext_map = ext_map_by_study.get(study_id, {})
        for v in variables:
            row.append(ext_map.get(v.get("variable_id"), ""))

        if include_rob:
            rob = rob_map.get(study_id, {})
            row.append(rob.get("tool", ""))
            row.append(rob.get("overall_judgment", ""))
        writer.writerow(row)

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"project_{project_id}_{timestamp}.csv"
    storage = get_storage("export")
    storage.save_bytes(filename, csv_bytes)

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _export_xlsx(project_id: str, timestamp: str, include_rob: bool, db: DBBackend) -> Response:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    proj = db.get("projects", project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    variables = db.query("variables", {"project_id": project_id}, order_by="order_index ASC")
    studies = db.query("studies", {"project_id": project_id}, order_by="title ASC")

    study_ids = [s.get("study_id", "") for s in studies if s.get("study_id")]
    ext_map_by_study = _fetch_extractions_map(db, project_id, study_ids)
    rob_map = _fetch_rob_map(db, project_id, include_rob)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Extraction Data"

    headers = ["Study ID", "Title", "Authors", "Year", "Journal", "DOI"]
    headers += [f"{v.get('section', '')}/{v.get('name', '')}" for v in variables]
    if include_rob:
        headers += ["RoB Tool", "RoB Overall"]
    ws.append(headers)

    for s in studies:
        study_id = s.get("study_id", "")
        row = [
            study_id,
            s.get("title", ""),
            s.get("authors", ""),
            s.get("publication_year", ""),
            s.get("journal", ""),
            s.get("doi", ""),
        ]
        ext_map = ext_map_by_study.get(study_id, {})
        for v in variables:
            row.append(ext_map.get(v.get("variable_id"), ""))

        if include_rob:
            rob = rob_map.get(study_id, {})
            row.append(rob.get("tool", ""))
            row.append(rob.get("overall_judgment", ""))
        ws.append(row)

    out_stream = io.BytesIO()

    # Apply color styling for missing data codes
    from openpyxl.styles import PatternFill, Font
    fill_99 = PatternFill(start_color="FFD700", end_color="FFD700", fill_type="solid")  # Yellow
    fill_77 = PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")  # Grey
    fill_88 = PatternFill(start_color="FFA500", end_color="FFA500", fill_type="solid")  # Orange

    for row_idx in range(2, ws.max_row + 1):
        for col_idx in range(1, ws.max_column + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            val_str = str(cell.value).strip() if cell.value is not None else ""
            if val_str == "-99":
                cell.fill = fill_99
            elif val_str == "-77":
                cell.fill = fill_77
            elif val_str == "-88":
                cell.fill = fill_88

    # Add Extraction_Legend worksheet
    ws_legend = wb.create_sheet(title="Extraction_Legend")
    ws_legend.append(["Code", "Meaning", "Description"])
    ws_legend.cell(row=1, column=1).font = Font(bold=True)
    ws_legend.cell(row=1, column=2).font = Font(bold=True)
    ws_legend.cell(row=1, column=3).font = Font(bold=True)

    legend_data = [
        ("-99", "Not reported", "Searched abstract, tables, results, supplement, and derivation; value was not reported in study", fill_99),
        ("-77", "Not applicable", "Field does not apply to this study design (e.g. comparator in single-arm study)", fill_77),
        ("-88", "Unable to extract", "PDF is scanned or image-only without an extractable text layer", fill_88),
    ]

    for r_idx, (code, meaning, desc, fill) in enumerate(legend_data, start=2):
        c1 = ws_legend.cell(row=r_idx, column=1, value=code)
        c1.fill = fill
        c1.font = Font(bold=True)
        ws_legend.cell(row=r_idx, column=2, value=meaning)
        ws_legend.cell(row=r_idx, column=3, value=desc)

    wb.save(out_stream)
    xlsx_bytes = out_stream.getvalue()
    filename = f"project_{project_id}_{timestamp}.xlsx"
    storage = get_storage("export")
    storage.save_bytes(filename, xlsx_bytes)

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════
#  Reference Manager Export (RIS, BibTeX, EndNote XML)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/export/references")
async def export_references(
    project_id: str,
    format: str = Query("ris", pattern="^(ris|bibtex|endnote)$"),
    status: str = Query("included", description="Filter by screening status: included, all, excluded"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Export studies as reference manager format (RIS, BibTeX, or EndNote XML).

    By default exports only included studies. Use ?status=all for all studies.
    """
    check_project_access(db, project_id, user)

    # Get studies
    if status == "all":
        studies = db.query("studies", {"project_id": project_id}, order_by="title ASC")
    elif status == "excluded":
        studies = db.query("studies", {"project_id": project_id, "screening_status": "excluded"}, order_by="title ASC")
    else:
        studies = db.query("studies", {"project_id": project_id, "screening_status": "included"}, order_by="title ASC")

    if not studies:
        raise HTTPException(status_code=404, detail="No studies found matching the criteria.")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if format == "ris":
        content = export_ris(studies)
        ext = "ris"
        media = "application/x-research-info-systems"
    elif format == "bibtex":
        content = export_bibtex(studies)
        ext = "bib"
        media = "text/plain"
    else:  # endnote
        content = export_endnote_xml(studies)
        ext = "xml"
        media = "application/xml"

    content_bytes = content.encode("utf-8")
    filename = f"references_{project_id}_{status}_{timestamp}.{ext}"

    return Response(
        content=content_bytes,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

