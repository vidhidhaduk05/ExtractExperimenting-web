"""Descriptive analysis & statistical computation API router.

Endpoints:
  GET  /api/projects/{project_id}/analysis/profile           — full data profiling report
  GET  /api/projects/{project_id}/analysis/stats/{variable_id} — descriptive stats for one variable
  GET  /api/projects/{project_id}/analysis/heterogeneity      — heterogeneity diagnostics (query: outcome)
  GET  /api/projects/{project_id}/analysis/forest-data        — forest plot data (query: outcome)
  GET  /api/projects/{project_id}/analysis/funnel-data        — funnel plot data (query: outcome)
  GET  /api/projects/{project_id}/analysis/sensitivity        — leave-one-out sensitivity (query: outcome)
  GET  /api/projects/{project_id}/analysis/report             — full combined report (JSON)
  GET  /api/projects/{project_id}/analysis/outcomes           — list available outcome labels
"""
from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response
import sqlite3

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from services import analysis_service

router = APIRouter(prefix="/api", tags=["analysis"])


def _verify_project(project_id: str, conn: sqlite3.Connection) -> None:
    """Raise 404 if project does not exist."""
    row = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/projects/{project_id}/analysis/descriptive")
async def get_descriptive_synthesis(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Wilson proportions and medians for extracted variables. NR stays missing."""
    from services.descriptive_synthesis import synthesize_project
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    rows = conn.execute(
        """SELECT v.name, v.field_type, e.value, e.study_id
           FROM extractions e
           JOIN variables v ON v.variable_id = e.variable_id
           JOIN studies s ON s.study_id = e.study_id
           WHERE v.project_id = ?
             AND COALESCE(s.is_duplicate, 0) = 0
             AND s.screening_status IN ('ta_included', 'ft_included', 'included')""",
        (project_id,),
    ).fetchall()
    payload = synthesize_project([dict(row) for row in rows])
    studies = conn.execute(
        """SELECT screening_status, COUNT(*) AS n
           FROM studies WHERE project_id = ? AND COALESCE(is_duplicate, 0) = 0
           GROUP BY screening_status""",
        (project_id,),
    ).fetchall()
    identified = conn.execute(
        "SELECT COUNT(*) AS n FROM studies WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    duplicates = conn.execute(
        "SELECT COUNT(*) AS n FROM studies WHERE project_id = ? AND COALESCE(is_duplicate, 0) = 1",
        (project_id,),
    ).fetchone()
    payload["prisma"] = {
        "identified": identified["n"] if identified else 0,
        "duplicates_removed": duplicates["n"] if duplicates else 0,
        "by_status": {row["screening_status"]: row["n"] for row in studies},
    }
    return payload


@router.get("/projects/{project_id}/analysis/profile")
async def get_analysis_profile(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Full data profiling report: distributions, missing values, outliers, correlations."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        return analysis_service.profile_extraction_data(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/stats/{variable_id}")
async def get_variable_stats(project_id: str, variable_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Descriptive statistics for a single variable."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_descriptive_stats(project_id, variable_id)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/heterogeneity")
async def get_heterogeneity(
    project_id: str,
    outcome: str = Query(..., description="Outcome label (meta-analysis outcome_label)"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Heterogeneity diagnostics: I², Q-statistic, tau², H-statistic."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_heterogeneity(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/forest-data")
async def get_forest_data(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Forest plot data: per-study effect sizes, CIs, weights, pooled estimate."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.prepare_forest_plot_data(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/funnel-data")
async def get_funnel_data(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Funnel plot data: effect size vs SE, Egger's test for asymmetry."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.prepare_funnel_plot_data(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/sensitivity")
async def get_sensitivity(
    project_id: str,
    outcome: str = Query(..., description="Outcome label"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Leave-one-out sensitivity analysis."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        result = analysis_service.compute_sensitivity_analysis(project_id, outcome)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/outcomes")
async def list_outcomes(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """List available meta-analysis outcome labels for this project."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    rows = conn.execute(
        "SELECT outcome_label, meta_id, effect_measure, n_studies "
        "FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/projects/{project_id}/analysis/report")
async def get_full_report(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Full combined analysis report (data profile + all meta-analyses)."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        report = analysis_service.generate_full_report(project_id)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("/projects/{project_id}/analysis/report/download")
async def download_full_report(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Download the full analysis report as a JSON file."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    try:
        report = analysis_service.generate_full_report(project_id)
        content = json.dumps(report, indent=2, ensure_ascii=False, default=str)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="analysis_report_{project_id}.json"'
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

# ═══════════════════════════════════════════════════════════════════════
#  Aggregated data: scoping-review evidence maps + cross-tabs
#  (quantitative pooling lives in routers/meta.py + the synthesis plan)
# ═══════════════════════════════════════════════════════════════════════

_INCLUDED_STATUSES = "('ta_included', 'ft_included', 'included')"
_NOT_REPORTED = "Not reported"


def _included_studies(conn: DBBackend, project_id: str) -> list:
    """Included, non-duplicate studies for aggregation."""
    return conn.execute(
        f"""SELECT study_id, title, publication_year, journal, study_design
            FROM studies
            WHERE project_id = ?
              AND COALESCE(is_duplicate, 0) = 0
              AND screening_status IN {_INCLUDED_STATUSES}""",
        (project_id,),
    ).fetchall()


def _extraction_map(conn: DBBackend, project_id: str, variable_id: str,
                    study_ids: list[str]) -> dict[str, str]:
    """Map study_id -> extracted value for one variable (included studies only)."""
    if not study_ids:
        return {}
    placeholders = ",".join("?" for _ in study_ids)
    rows = conn.execute(
        f"""SELECT e.study_id, e.value
            FROM extractions e
            WHERE e.variable_id = ? AND e.study_id IN ({placeholders})""",
        [variable_id, *study_ids],
    ).fetchall()
    return {row["study_id"]: (row["value"] or "").strip() or _NOT_REPORTED
            for row in rows}


def _find_variable_by_name(conn: DBBackend, project_id: str, name: str) -> Optional[dict]:
    row = conn.execute(
        "SELECT variable_id, name, field_type FROM variables "
        "WHERE project_id = ? AND LOWER(name) = LOWER(?)",
        (project_id, name),
    ).fetchone()
    return dict(row) if row else None


def _crosstab_payload(conn: DBBackend, project_id: str,
                      row_var: dict, col_var: dict) -> dict:
    studies = _included_studies(conn, project_id)
    study_ids = [s["study_id"] for s in studies]
    row_vals = _extraction_map(conn, project_id, row_var["variable_id"], study_ids)
    col_vals = _extraction_map(conn, project_id, col_var["variable_id"], study_ids)

    row_labels: list[str] = []
    col_labels: list[str] = []
    for s in studies:
        rv = row_vals.get(s["study_id"], _NOT_REPORTED)
        cv = col_vals.get(s["study_id"], _NOT_REPORTED)
        if rv not in row_labels:
            row_labels.append(rv)
        if cv not in col_labels:
            col_labels.append(cv)
    row_labels.sort()
    col_labels.sort()

    matrix = {r: {c: 0 for c in col_labels} for r in row_labels}
    row_totals = {r: 0 for r in row_labels}
    col_totals = {c: 0 for c in col_labels}
    for s in studies:
        rv = row_vals.get(s["study_id"], _NOT_REPORTED)
        cv = col_vals.get(s["study_id"], _NOT_REPORTED)
        matrix[rv][cv] += 1
        row_totals[rv] += 1
        col_totals[cv] += 1

    return {
        "row_variable": row_var["name"],
        "col_variable": col_var["name"],
        "row_labels": row_labels,
        "col_labels": col_labels,
        "matrix": matrix,
        "row_totals": row_totals,
        "col_totals": col_totals,
        "n_studies": len(studies),
    }


@router.get("/projects/{project_id}/analysis/crosstab")
async def get_crosstab(project_id: str,
                       row_var: str = Query(..., description="row variable_id"),
                       col_var: str = Query(..., description="column variable_id"),
                       user: Optional[dict] = Depends(get_current_user_optional),
                       conn: DBBackend = Depends(get_db)):
    """Contingency table of two extracted variables across included studies."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    rrow = conn.execute(
        "SELECT variable_id, name, field_type FROM variables WHERE variable_id = ? AND project_id = ?",
        (row_var, project_id),
    ).fetchone()
    crow = conn.execute(
        "SELECT variable_id, name, field_type FROM variables WHERE variable_id = ? AND project_id = ?",
        (col_var, project_id),
    ).fetchone()
    if not rrow or not crow:
        raise HTTPException(status_code=404, detail="row_var or col_var not found in project variables")
    return _crosstab_payload(conn, project_id, dict(rrow), dict(crow))


@router.get("/projects/{project_id}/analysis/trends")
async def get_trends(project_id: str,
                     bucket: str = Query("year", description="year | design | region | <variable_id>"),
                     user: Optional[dict] = Depends(get_current_user_optional),
                     conn: DBBackend = Depends(get_db)):
    """Counts of included studies bucketed by year, design, region, or any variable."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    studies = _included_studies(conn, project_id)

    counts: dict[str, int] = {}
    if bucket == "year":
        for s in studies:
            label = str(s["publication_year"]) if s["publication_year"] else _NOT_REPORTED
            counts[label] = counts.get(label, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: kv[0])
    elif bucket == "design":
        for s in studies:
            label = (s["study_design"] or "").strip() or _NOT_REPORTED
            counts[label] = counts.get(label, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    elif bucket == "region":
        var = _find_variable_by_name(conn, project_id, "region")
        if not var:
            raise HTTPException(status_code=404, detail="No variable named 'region' — create it or pass a variable_id")
        vals = _extraction_map(conn, project_id, var["variable_id"], [s["study_id"] for s in studies])
        for s in studies:
            label = vals.get(s["study_id"], _NOT_REPORTED)
            counts[label] = counts.get(label, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    else:
        vrow = conn.execute(
            "SELECT variable_id, name FROM variables WHERE variable_id = ? AND project_id = ?",
            (bucket, project_id),
        ).fetchone()
        if not vrow:
            raise HTTPException(status_code=422, detail="bucket must be 'year', 'design', 'region', or a variable_id")
        vals = _extraction_map(conn, project_id, vrow["variable_id"], [s["study_id"] for s in studies])
        for s in studies:
            label = vals.get(s["study_id"], _NOT_REPORTED)
            counts[label] = counts.get(label, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])

    return {
        "bucket": bucket,
        "n_studies": len(studies),
        "counts": [{"label": k, "n": v} for k, v in ordered],
    }


@router.get("/projects/{project_id}/analysis/evidence-map")
async def get_evidence_map(project_id: str,
                           user: Optional[dict] = Depends(get_current_user_optional),
                           conn: DBBackend = Depends(get_db)):
    """Full scoping-review aggregation packet: counts, ranges, cross-tabs, outcome inventory."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)
    studies = _included_studies(conn, project_id)
    study_ids = [s["study_id"] for s in studies]

    years = [s["publication_year"] for s in studies if s["publication_year"]]
    by_year: dict[str, int] = {}
    for y in years:
        by_year[str(y)] = by_year.get(str(y), 0) + 1

    by_design: dict[str, int] = {}
    for s in studies:
        label = (s["study_design"] or "").strip() or _NOT_REPORTED
        by_design[label] = by_design.get(label, 0) + 1

    by_journal: dict[str, int] = {}
    for s in studies:
        label = (s["journal"] or "").strip() or _NOT_REPORTED
        by_journal[label] = by_journal.get(label, 0) + 1
    top_journals = sorted(by_journal.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

    # Variable coverage: how many included studies have a non-empty value per variable
    variables = conn.execute(
        "SELECT variable_id, name, section, field_type FROM variables WHERE project_id = ? ORDER BY order_index",
        (project_id,),
    ).fetchall()
    coverage = []
    for v in variables:
        vals = _extraction_map(conn, project_id, v["variable_id"], study_ids)
        reported = sum(1 for sid in study_ids if vals.get(sid, _NOT_REPORTED) != _NOT_REPORTED)
        coverage.append({
            "variable_id": v["variable_id"],
            "name": v["name"],
            "section": v["section"],
            "field_type": v["field_type"],
            "n_reported": reported,
            "n_missing": len(study_ids) - reported,
            "pct_missing": round(100.0 * (len(study_ids) - reported) / len(study_ids), 1) if study_ids else 0.0,
        })

    # Design x region cross-tab when a region variable exists
    region_var = _find_variable_by_name(conn, project_id, "region")
    design_var = _find_variable_by_name(conn, project_id, "study design") or _find_variable_by_name(conn, project_id, "design")
    crosstab = None
    if region_var and design_var:
        crosstab = _crosstab_payload(conn, project_id, design_var, region_var)

    prow = conn.execute("SELECT review_type FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    return {
        "review_type": prow["review_type"] if prow else "systematic",
        "total_included": len(studies),
        "year_span": {"min": min(years) if years else None,
                      "max": max(years) if years else None},
        "by_year": [{"label": k, "n": v} for k, v in sorted(by_year.items())],
        "by_design": [{"label": k, "n": v} for k, v in sorted(by_design.items(), key=lambda kv: -kv[1])],
        "top_journals": [{"label": k, "n": v} for k, v in top_journals],
        "variable_coverage": coverage,
        "design_by_region": crosstab,
    }

@router.get("/projects/{project_id}/analysis/evidence-map/export")
async def export_evidence_map_tables(
    project_id: str,
    format: str = Query("csv", description="csv | xlsx"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Export summary tables of the scoping evidence map as CSV or multi-tab XLSX."""
    check_project_access(conn, project_id, user)
    _verify_project(project_id, conn)

    # Re-use evidence map calculation
    map_data = await get_evidence_map(project_id, user=user, conn=conn)

    import io
    import csv

    if format.lower() == "xlsx":
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            # Sheet 1: Summary Overview
            ws_ov = wb.active
            ws_ov.title = "Overview"
            ws_ov.append(["Metric", "Value"])
            ws_ov.append(["Review Type", map_data.get("review_type", "scoping")])
            ws_ov.append(["Total Included Studies", map_data.get("total_included", 0)])
            ys = map_data.get("year_span", {})
            ws_ov.append(["Publication Date Span", f"{ys.get('min')} - {ys.get('max')}"])

            # Sheet 2: Studies by Year
            ws_yr = wb.create_sheet(title="Studies by Year")
            ws_yr.append(["Year", "Count (N)"])
            for item in map_data.get("by_year", []):
                ws_yr.append([item["label"], item["n"]])

            # Sheet 3: Study Design Mix
            ws_ds = wb.create_sheet(title="Study Designs")
            ws_ds.append(["Study Design", "Count (N)"])
            for item in map_data.get("by_design", []):
                ws_ds.append([item["label"], item["n"]])

            # Sheet 4: Variable Coverage & Missingness
            ws_vc = wb.create_sheet(title="Variable Coverage")
            ws_vc.append(["Variable Name", "Section", "Type", "Reported (N)", "Missing (N)", "% Missing"])
            for v in map_data.get("variable_coverage", []):
                ws_vc.append([v["name"], v["section"], v["field_type"], v["n_reported"], v["n_missing"], f"{v['pct_missing']}%"])

            # Sheet 5: Cross-Tab (Design x Region) if available
            xt = map_data.get("design_by_region")
            if xt:
                ws_xt = wb.create_sheet(title="Design x Region")
                header = [f"{xt['row_variable']} \\ {xt['col_variable']}"] + xt["col_labels"] + ["Total"]
                ws_xt.append(header)
                for r in xt["row_labels"]:
                    row_data = [r] + [xt["matrix"][r].get(c, 0) for c in xt["col_labels"]] + [xt["row_totals"].get(r, 0)]
                    ws_xt.append(row_data)
                col_tot_row = ["Total"] + [xt["col_totals"].get(c, 0) for c in xt["col_labels"]] + [xt["n_studies"]]
                ws_xt.append(col_tot_row)

            out_buf = io.BytesIO()
            wb.save(out_buf)
            out_buf.seek(0)
            return Response(
                content=out_buf.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="evidence_map_{project_id}.xlsx"'},
            )
        except ImportError:
            pass  # Fall back to CSV

    # CSV fallback
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["# SCOPING EVIDENCE MAP SUMMARY"])
    writer.writerow(["Total Included Studies", map_data.get("total_included", 0)])
    ys = map_data.get("year_span", {})
    writer.writerow(["Year Span", f"{ys.get('min')} - {ys.get('max')}"])
    writer.writerow([])

    writer.writerow(["# STUDIES BY YEAR"])
    writer.writerow(["Year", "Count"])
    for item in map_data.get("by_year", []):
        writer.writerow([item["label"], item["n"]])
    writer.writerow([])

    writer.writerow(["# STUDY DESIGNS"])
    writer.writerow(["Design", "Count"])
    for item in map_data.get("by_design", []):
        writer.writerow([item["label"], item["n"]])
    writer.writerow([])

    writer.writerow(["# VARIABLE COVERAGE"])
    writer.writerow(["Variable", "Section", "Reported", "Missing", "% Missing"])
    for v in map_data.get("variable_coverage", []):
        writer.writerow([v["name"], v["section"], v["n_reported"], v["n_missing"], f"{v['pct_missing']}%"])

    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="evidence_map_{project_id}.csv"'},
    )
