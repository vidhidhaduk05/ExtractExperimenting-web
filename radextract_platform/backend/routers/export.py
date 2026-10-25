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
@router.get("/export/{project_id}/csv")
async def export_project_csv_alias(
    project_id: str,
    include_rob: bool = Query(True, description="Include RoB data in export"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Alias for GET /projects/{id}/export?format=csv."""
    return await export_project(project_id, format="csv", include_rob=include_rob, user=user, db=db)


@router.get("/projects/{project_id}/export/xlsx")
@router.get("/export/{project_id}/xlsx")
@router.get("/export/{project_id}/excel")
async def export_project_xlsx_alias(
    project_id: str,
    include_rob: bool = Query(True, description="Include RoB data in export"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Alias for GET /projects/{id}/export?format=xlsx."""
    return await export_project(project_id, format="xlsx", include_rob=include_rob, user=user, db=db)


@router.get("/projects/{project_id}/export/srma-workbook")
@router.get("/projects/{project_id}/export/canonical-srma")
@router.get("/export/{project_id}/srma-workbook")
async def export_canonical_srma_workbook(
    project_id: str,
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Export the canonical 8-sheet SRMA data extraction workbook."""
    check_project_access(db, project_id, user)
    from services.srma_sheet_generator import generate_srma_extraction_workbook
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    xlsx_bytes = generate_srma_extraction_workbook(project_id, db)
    filename = f"srma_extraction_workbook_{project_id}_{timestamp}.xlsx"
    storage = get_storage("export")
    storage.save_bytes(filename, xlsx_bytes)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


def _fetch_export_data(project_id: str, include_rob: bool, db: DBBackend):
    proj = db.get("projects", project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    variables = db.query("variables", {"project_id": project_id}, order_by="order_index ASC")
    studies = db.query("studies", {"project_id": project_id}, order_by="title ASC")

    # Batch fetch extractions and RoB assessments to prevent N+1 queries
    ext_by_study: dict[str, dict[str, str]] = {}
    rob_by_study: dict[str, dict] = {}

    if studies:
        # Pre-populate dictionaries for each study
        for s in studies:
            sid = s.get("study_id", "")
            ext_by_study[sid] = {}
            if include_rob:
                rob_by_study[sid] = {}

        # Fetch extractions for all studies in project in batch
        try:
            # Single SQL JOIN query for SQLiteBackend
            rows = db.execute(
                """SELECT e.study_id, e.variable_id, e.value FROM extractions e
                   JOIN studies s ON e.study_id = s.study_id
                   WHERE s.project_id = ?""",
                (project_id,),
            ).fetchall()
            for r in rows:
                sid = r["study_id"]
                vid = r["variable_id"]
                if sid in ext_by_study and vid:
                    ext_by_study[sid][vid] = r["value"] or ""
        except NotImplementedError:
            # Fallback for non-SQL backends (e.g. DynamoDB)
            for s in studies:
                sid = s.get("study_id", "")
                ext_list = db.query("extractions", {"study_id": sid})
                ext_by_study[sid] = {e.get("variable_id"): e.get("value", "") for e in ext_list if e.get("variable_id")}

        # Fetch RoB assessments for project in batch
        if include_rob:
            rob_list = db.query("rob_assessments", {"project_id": project_id})
            for r in rob_list:
                sid = r.get("study_id")
                if sid and sid not in rob_by_study:
                    rob_by_study[sid] = r
                elif sid and not rob_by_study[sid]:
                    rob_by_study[sid] = r

    return proj, variables, studies, ext_by_study, rob_by_study


async def _export_csv(project_id: str, timestamp: str, include_rob: bool, db: DBBackend) -> Response:
    proj, variables, studies, ext_by_study, rob_by_study = _fetch_export_data(project_id, include_rob, db)

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
        ext_map = ext_by_study.get(study_id, {})
        for v in variables:
            row.append(ext_map.get(v.get("variable_id"), ""))

        if include_rob:
            rob = rob_by_study.get(study_id, {})
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

    proj, variables, studies, ext_by_study, rob_by_study = _fetch_export_data(project_id, include_rob, db)

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
        ext_map = ext_by_study.get(study_id, {})
        for v in variables:
            row.append(ext_map.get(v.get("variable_id"), ""))

        if include_rob:
            rob = rob_by_study.get(study_id, {})
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
    status: str = Query("included", pattern="^(included|all|excluded)$", description="Filter by screening status: included, all, excluded"),
    user: dict = Depends(get_current_user_optional),
    db: DBBackend = Depends(get_db),
):
    """Export studies as reference manager format (RIS, BibTeX, or EndNote XML).

    By default exports only included studies. Use ?status=all for all studies.
    """
    check_project_access(db, project_id, user)

    if not db.get("projects", project_id):
        raise HTTPException(status_code=404, detail="Project not found")

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
        media = "application/x-bibtex"
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

