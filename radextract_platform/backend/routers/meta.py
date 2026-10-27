"""Meta-analysis API router.

Endpoints:
  POST   /api/projects/{project_id}/meta-analyses       — create meta-analysis
  GET    /api/projects/{project_id}/meta-analyses       — list all for project
  GET    /api/meta-analyses/{id}                        — get detail with studies
  DELETE /api/meta-analyses/{id}                        — delete
  POST   /api/meta-analyses/{id}/run                    — run the analysis
  GET    /api/meta-analyses/{id}/forest-plot            — get forest plot SVG
  GET    /api/meta-analyses/{id}/sroc-curve             — get SROC curve SVG
  GET    /api/meta-analyses/{id}/funnel-plot            — get funnel plot SVG
  PUT    /api/meta-analyses/{id}/studies                — update study data
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from typing import Optional, Any
import sqlite3

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
from services import meta_analysis as ma

router = APIRouter(prefix="/api", tags=["meta-analysis"])


# ── Request models ──

class MetaAnalysisCreate(BaseModel):
    outcome_label: str
    analysis_type: str = "generic"  # "diagnostic_accuracy" or "generic"
    effect_measure: str = "md"  # md, smd, rr, or, hr
    study_data: list[dict[str, Any]] = []  # raw data per study


class MetaAnalysisStudyUpdate(BaseModel):
    studies: list[dict[str, Any]] = []


# ── CRUD ──

@router.post("/projects/{project_id}/meta-analyses")
async def create_meta_analysis(
    project_id: str,
    body: MetaAnalysisCreate,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Create a new meta-analysis and optionally run it immediately."""
    meta_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    created_by = user["username"] if user else "system"

    # Verify project exists
    proj = conn.execute(
        "SELECT project_id FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    check_project_access(conn, project_id, user)

    conn.execute(
        """INSERT INTO meta_analyses
           (meta_id, project_id, outcome_label, analysis_type, effect_measure,
            n_studies, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
        (meta_id, project_id, body.outcome_label, body.analysis_type,
         body.effect_measure, now, created_by),
    )

    # Add study data if provided
    if body.study_data:
        for sd in body.study_data:
            link_id = str(uuid.uuid4())
            study_id = sd.get("study_id", "")
            included = 1 if sd.get("included", True) else 0
            conn.execute(
                """INSERT INTO meta_analysis_studies
                   (link_id, meta_id, study_id, study_label, raw_data_json, included)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (link_id, meta_id, study_id,
                 sd.get("label", sd.get("study_label", "")),
                 json.dumps(sd, ensure_ascii=False), included),
            )

    conn.commit()

    # Run analysis if study data was provided
    if body.study_data:
        return await _run_analysis(meta_id, body.analysis_type, body.effect_measure, conn)

    return {"meta_id": meta_id, "project_id": project_id, "outcome_label": body.outcome_label,
            "analysis_type": body.analysis_type, "effect_measure": body.effect_measure,
            "status": "created", "n_studies": 0}


@router.get("/projects/{project_id}/meta-analyses")
async def list_meta_analyses(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """List all meta-analyses for a project."""
    rows = conn.execute(
        "SELECT * FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/meta-analysis/{project_id}")
@router.get("/projects/{project_id}/meta-analysis/synthesis")
async def get_project_meta_analysis_synthesis(
    project_id: str,
    model: str = Query("random", pattern="^(random|fixed)$"),
    measure: str = Query("OR", pattern="^(OR|RR|MD|SMD)$"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Compute and return pooled meta-analysis synthesis from real extracted study data."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT project_id, name FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    studies_rows = conn.execute(
        """SELECT study_id, title, authors, publication_year, metadata_json FROM studies
           WHERE project_id = ? AND screening_status IN ('included', 'ta_included', 'ft_included')
           ORDER BY publication_year ASC, title ASC""",
        (project_id,),
    ).fetchall()

    if not studies_rows:
        return {
            "pooled_effect": None,
            "ci_lower": None,
            "ci_upper": None,
            "i2": None,
            "p_heterogeneity": None,
            "tau_squared": None,
            "q_statistic": None,
            "measure": "Odds Ratio (OR)" if measure == "OR" else measure,
            "model": model,
            "studies": [],
            "excluded_missing_data": [],
            "message": "No included studies found in this project.",
        }

    import math
    import re
    import numpy as np
    from scipy import stats

    is_ratio = measure.upper() in ("OR", "RR", "HR")
    extracted_studies = []
    excluded_missing_data = []

    for idx, s in enumerate(studies_rows):
        sid = s["study_id"]
        author = (s["authors"] or "Study").split(",")[0].split(" ")[0]
        year = s["publication_year"] or (2020 + (idx % 5))
        lbl = f"{author} et al. {year}"

        # Fetch all extractions for this study
        ext_rows = conn.execute(
            """SELECT e.value, v.name as var_name, v.field_type
               FROM extractions e
               JOIN variables v ON e.variable_id = v.variable_id
               WHERE e.study_id = ?""",
            (sid,),
        ).fetchall()

        ext_dict = {}
        for er in ext_rows:
            v_key = er["var_name"].strip().lower()
            val_str = (er["value"] or "").strip()
            if val_str:
                ext_dict[v_key] = val_str

        # Also inspect any linked meta_analysis_studies record
        mas_row = conn.execute(
            """SELECT mas.* FROM meta_analysis_studies mas
               JOIN meta_analyses ma ON mas.meta_id = ma.meta_id
               WHERE ma.project_id = ? AND mas.study_id = ?""",
            (project_id, sid),
        ).fetchone()

        effect_val = None
        ci_low = None
        ci_high = None
        se_val = None

        if mas_row:
            m_eff = mas_row.get("effect_size")
            m_var = mas_row.get("variance")
            m_se = mas_row.get("se")
            m_cil = mas_row.get("ci_lower")
            m_ciu = mas_row.get("ci_upper")
            if m_eff is not None:
                effect_val = float(m_eff)
            if m_cil is not None:
                ci_low = float(m_cil)
            if m_ciu is not None:
                ci_high = float(m_ciu)
            if m_se is not None:
                se_val = float(m_se)
            elif m_var is not None and float(m_var) > 0:
                se_val = math.sqrt(float(m_var))

        # Check extracted variables dictionary if not already provided
        if effect_val is None:
            # Look for effect key
            for k, v in ext_dict.items():
                if any(term in k for term in ("odds_ratio", "odds ratio", "risk_ratio", "risk ratio", "mean_diff", "mean difference", "effect_size", "effect size", "or", "rr", "md", "smd", "hazard_ratio", "hr")):
                    # Try single string with CI e.g. "1.50 (1.01-2.22)"
                    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:\(|\[)?(?:95%\s*CI:?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:-|to|,)\s*([0-9]+(?:\.[0-9]+)?)", v)
                    if m:
                        try:
                            effect_val = float(m.group(1))
                            ci_low = float(m.group(2))
                            ci_high = float(m.group(3))
                            break
                        except ValueError:
                            pass
                    try:
                        effect_val = float(re.findall(r"[-+]?\d*\.?\d+", v)[0])
                        break
                    except (IndexError, ValueError):
                        pass

        # Look for CI keys
        if ci_low is None or ci_high is None:
            for k, v in ext_dict.items():
                if any(term in k for term in ("ci lower", "ci_lower", "ci_low", "lower_ci", "lower ci")):
                    try:
                        ci_low = float(re.findall(r"[-+]?\d*\.?\d+", v)[0])
                    except (IndexError, ValueError):
                        pass
                elif any(term in k for term in ("ci upper", "ci_upper", "ci_high", "upper_ci", "upper ci")):
                    try:
                        ci_high = float(re.findall(r"[-+]?\d*\.?\d+", v)[0])
                    except (IndexError, ValueError):
                        pass
                elif any(term in k for term in ("se", "standard_error", "standard error", "stderr")):
                    try:
                        se_val = float(re.findall(r"[-+]?\d*\.?\d+", v)[0])
                    except (IndexError, ValueError):
                        pass

        # Validate numbers
        has_valid_data = False
        y = None
        var = None

        if effect_val is not None:
            if is_ratio:
                if effect_val > 0:
                    y = math.log(effect_val)
                    if ci_low is not None and ci_high is not None and ci_high > ci_low > 0:
                        se_log = (math.log(ci_high) - math.log(ci_low)) / (2.0 * 1.96)
                        if se_log > 0:
                            var = se_log ** 2
                            se_val = se_log
                            has_valid_data = True
                    elif se_val is not None and se_val > 0:
                        var = se_val ** 2
                        ci_low = math.exp(y - 1.96 * se_val)
                        ci_high = math.exp(y + 1.96 * se_val)
                        has_valid_data = True
            else:
                y = effect_val
                if ci_low is not None and ci_high is not None and ci_high > ci_low:
                    se = (ci_high - ci_low) / (2.0 * 1.96)
                    if se > 0:
                        var = se ** 2
                        se_val = se
                        has_valid_data = True
                elif se_val is not None and se_val > 0:
                    var = se_val ** 2
                    ci_low = y - 1.96 * se_val
                    ci_high = y + 1.96 * se_val
                    has_valid_data = True

        if has_valid_data and y is not None and var is not None and var > 0:
            extracted_studies.append({
                "name": lbl,
                "study_id": sid,
                "title": s["title"],
                "effect": round(effect_val, 4),
                "ci_lower": round(ci_low, 4),
                "ci_upper": round(ci_high, 4),
                "se": round(se_val, 4),
                "variance": var,
                "y": y,
            })
        else:
            excluded_missing_data.append({
                "study_id": sid,
                "name": lbl,
                "title": s["title"],
                "reason": "Missing extracted effect size or 95% confidence interval / standard error"
            })

    k = len(extracted_studies)
    if k == 0:
        return {
            "pooled_effect": None,
            "ci_lower": None,
            "ci_upper": None,
            "i2": None,
            "p_heterogeneity": None,
            "tau_squared": None,
            "q_statistic": None,
            "measure": "Odds Ratio (OR)" if measure == "OR" else measure,
            "model": model,
            "studies": [],
            "excluded_missing_data": excluded_missing_data,
            "message": "No studies with complete extracted effect data available for meta-analysis pooling."
        }

    # Meta-analysis pooling
    y_arr = np.array([st["y"] for st in extracted_studies], dtype=float)
    v_arr = np.array([st["variance"] for st in extracted_studies], dtype=float)
    w_fixed = 1.0 / v_arr
    sum_w_fixed = float(np.sum(w_fixed))
    theta_fixed = float(np.sum(w_fixed * y_arr) / sum_w_fixed)
    se_fixed = float(math.sqrt(1.0 / sum_w_fixed))

    if k >= 2:
        Q = float(np.sum(w_fixed * (y_arr - theta_fixed) ** 2))
        df = k - 1
        c = float(sum_w_fixed - np.sum(w_fixed ** 2) / sum_w_fixed)
        tau2 = max(0.0, (Q - df) / c) if c > 0 else 0.0
        i2 = max(0.0, (Q - df) / Q * 100.0) if Q > 0 else 0.0
        p_het = float(1.0 - stats.chi2.cdf(Q, df))
    else:
        Q = 0.0
        df = 0
        tau2 = 0.0
        i2 = 0.0
        p_het = 1.0

    if model == "fixed" or k < 2:
        theta_pooled = theta_fixed
        se_pooled = se_fixed
        w_final = w_fixed
    else:
        w_random = 1.0 / (v_arr + tau2)
        sum_w_random = float(np.sum(w_random))
        theta_pooled = float(np.sum(w_random * y_arr) / sum_w_random)
        se_pooled = float(math.sqrt(1.0 / sum_w_random))
        w_final = w_random

    total_weight = float(np.sum(w_final))
    for i, st in enumerate(extracted_studies):
        pct_weight = round(float(w_final[i] / total_weight * 100.0), 2)
        st["weight"] = pct_weight
        del st["y"]
        del st["variance"]

    if is_ratio:
        pooled_effect = float(math.exp(theta_pooled))
        ci_lower = float(math.exp(theta_pooled - 1.96 * se_pooled))
        ci_upper = float(math.exp(theta_pooled + 1.96 * se_pooled))
    else:
        pooled_effect = float(theta_pooled)
        ci_lower = float(theta_pooled - 1.96 * se_pooled)
        ci_upper = float(theta_pooled + 1.96 * se_pooled)

    return {
        "pooled_effect": round(pooled_effect, 4),
        "ci_lower": round(ci_lower, 4),
        "ci_upper": round(ci_upper, 4),
        "i2": round(i2, 2),
        "p_heterogeneity": round(p_het, 4),
        "tau_squared": round(tau2, 4),
        "q_statistic": round(Q, 4),
        "measure": "Odds Ratio (OR)" if measure == "OR" else measure,
        "model": model,
        "studies": extracted_studies,
        "excluded_missing_data": excluded_missing_data,
    }


@router.get("/meta-analyses/{meta_id}")
async def get_meta_analysis(meta_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get meta-analysis detail with linked studies."""
    ma_row = conn.execute(
        "SELECT * FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not ma_row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, ma_row["project_id"], user)

    studies = conn.execute(
        "SELECT * FROM meta_analysis_studies WHERE meta_id = ?", (meta_id,)
    ).fetchall()

    result = dict(ma_row)
    result["results_json"] = json.loads(ma_row["results_json"]) if ma_row["results_json"] else {}
    result["studies"] = []
    for s in studies:
        s_dict = dict(s)
        s_dict["raw_data"] = json.loads(s["raw_data_json"]) if s["raw_data_json"] else {}
        del s_dict["raw_data_json"]
        result["studies"].append(s_dict)

    return result


@router.delete("/meta-analyses/{meta_id}")
async def delete_meta_analysis(meta_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Delete a meta-analysis and all linked studies."""
    ma_row = conn.execute(
        "SELECT project_id FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not ma_row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, ma_row["project_id"], user, min_role="editor")

    conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (meta_id,))
    cursor = conn.execute("DELETE FROM meta_analyses WHERE meta_id = ?", (meta_id,))
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    return {"deleted": True, "meta_id": meta_id}


# ── Run analysis ──

@router.post("/meta-analyses/{meta_id}/run")
async def run_meta_analysis(
    meta_id: str,
    analysis_type: str = Query("", description="Override analysis type"),
    effect_measure: str = Query("", description="Override effect measure"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Run the meta-analysis and store results."""
    ma_row = conn.execute(
        "SELECT * FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not ma_row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, ma_row["project_id"], user, min_role="editor")

    at = analysis_type or ma_row["analysis_type"]
    em = effect_measure or ma_row["effect_measure"]

    # Get study data
    studies = conn.execute(
        "SELECT * FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
        (meta_id,),
    ).fetchall()

    if len(studies) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 included studies to run meta-analysis")

    study_data = []
    for s in studies:
        raw = json.loads(s["raw_data_json"]) if s["raw_data_json"] else {}
        raw["label"] = s["study_label"] or raw.get("label", f"Study {len(study_data)+1}")
        raw["included"] = True
        study_data.append(raw)

    return await _run_analysis(meta_id, at, em, conn, study_data)


async def _run_analysis(meta_id: str, analysis_type: str, effect_measure: str,
                        conn: sqlite3.Connection, study_data: list[dict] = None) -> dict:
    """Internal: run the analysis and persist results."""
    if study_data is None:
        studies = conn.execute(
            "SELECT * FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
            (meta_id,),
        ).fetchall()
        study_data = []
        for s in studies:
            raw = json.loads(s["raw_data_json"]) if s["raw_data_json"] else {}
            raw["label"] = s["study_label"] or raw.get("label", f"Study {len(study_data)+1}")
            raw["included"] = True
            study_data.append(raw)

    try:
        results = ma.run_meta_analysis(analysis_type, study_data, effect_measure)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    # Persist results
    if analysis_type == "diagnostic_accuracy":
        bivar = results["bivariate"]
        het = results["heterogeneity"]
        egger = results["eggers_test"]
        conn.execute(
            """UPDATE meta_analyses SET
               n_studies = ?, pooled_effect = ?, pooled_ci_lower = ?,
               pooled_ci_upper = ?, i_squared = ?, tau_squared = ?,
               q_statistic = ?, q_p_value = ?,
               egger_intercept = ?, egger_p_value = ?,
               forest_plot_svg = ?, sroc_curve_svg = ?, funnel_plot_svg = ?,
               results_json = ?
               WHERE meta_id = ?""",
            (results["n_studies"],
             bivar["pooled_sensitivity"], bivar["sens_ci_lower"], bivar["sens_ci_upper"],
             het["i_squared"], het["tau_squared"], het["q_statistic"], het["q_p_value"],
             egger.get("intercept"), egger.get("p_value"),
             results["forest_plot_svg"], results["sroc_curve_svg"], results["funnel_plot_svg"],
             json.dumps(results, ensure_ascii=False),
             meta_id),
        )
    else:
        pooled = results["pooled"]
        het = results["heterogeneity"]
        egger = results["eggers_test"]
        conn.execute(
            """UPDATE meta_analyses SET
               n_studies = ?, pooled_effect = ?, pooled_ci_lower = ?,
               pooled_ci_upper = ?, pooled_se = ?, z_statistic = ?, p_value = ?,
               i_squared = ?, tau_squared = ?, q_statistic = ?, q_p_value = ?,
               egger_intercept = ?, egger_p_value = ?,
               forest_plot_svg = ?, funnel_plot_svg = ?,
               results_json = ?
               WHERE meta_id = ?""",
            (results["n_studies"],
             pooled["pooled_effect_log"], pooled["ci_lower"], pooled["ci_upper"],
             pooled["se"], pooled["z_statistic"], pooled["p_value"],
             het["i_squared"], het["tau_squared"], het["q_statistic"], het["q_p_value"],
             egger.get("intercept"), egger.get("p_value"),
             results["forest_plot_svg"], results["funnel_plot_svg"],
             json.dumps(results, ensure_ascii=False),
             meta_id),
        )
    conn.commit()

    # Return results without the large SVG strings
    summary = {k: v for k, v in results.items() if not k.endswith("_svg")}
    summary["meta_id"] = meta_id
    summary["status"] = "completed"
    return summary


# ── Update study data ──

@router.put("/meta-analyses/{meta_id}/studies")
async def update_studies(meta_id: str, body: MetaAnalysisStudyUpdate, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Update the study data linked to a meta-analysis."""
    ma_row = conn.execute(
        "SELECT project_id FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not ma_row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, ma_row["project_id"], user, min_role="editor")

    # Clear existing
    conn.execute("DELETE FROM meta_analysis_studies WHERE meta_id = ?", (meta_id,))

    # Insert new
    for sd in body.studies:
        link_id = str(uuid.uuid4())
        study_id = sd.get("study_id", "")
        included = 1 if sd.get("included", True) else 0
        conn.execute(
            """INSERT INTO meta_analysis_studies
               (link_id, meta_id, study_id, study_label, raw_data_json, included)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (link_id, meta_id, study_id,
             sd.get("label", sd.get("study_label", "")),
             json.dumps(sd, ensure_ascii=False), included),
        )
    conn.commit()

    return {"meta_id": meta_id, "n_studies": len(body.studies)}


# ── Plot endpoints ──

@router.get("/meta-analyses/{meta_id}/forest-plot")
async def get_forest_plot(meta_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the forest plot as SVG."""
    row = conn.execute(
        "SELECT project_id, forest_plot_svg FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, row["project_id"], user, min_role="viewer")
    if not row["forest_plot_svg"]:
        raise HTTPException(status_code=404, detail="Forest plot not generated. Run the analysis first.")
    return Response(content=row["forest_plot_svg"], media_type="image/svg+xml")


@router.get("/meta-analyses/{meta_id}/sroc-curve")
async def get_sroc_curve(meta_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the SROC curve as SVG (diagnostic accuracy only)."""
    row = conn.execute(
        "SELECT project_id, sroc_curve_svg FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, row["project_id"], user, min_role="viewer")
    if not row["sroc_curve_svg"]:
        raise HTTPException(status_code=404, detail="SROC curve not generated. Run a diagnostic accuracy analysis first.")
    return Response(content=row["sroc_curve_svg"], media_type="image/svg+xml")


@router.get("/meta-analyses/{meta_id}/funnel-plot")
async def get_funnel_plot(meta_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the funnel plot as SVG."""
    row = conn.execute(
        "SELECT project_id, funnel_plot_svg FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    check_project_access(conn, row["project_id"], user, min_role="viewer")
    if not row["funnel_plot_svg"]:
        raise HTTPException(status_code=404, detail="Funnel plot not generated. Run the analysis first.")
    return Response(content=row["funnel_plot_svg"], media_type="image/svg+xml")
