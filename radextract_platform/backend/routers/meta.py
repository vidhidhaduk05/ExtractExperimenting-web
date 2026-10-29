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

def _check_duplicate_family_guard(conn: Any, project_id: str, study_ids: list[str]) -> None:
    """Ensure no two included studies in meta-analysis share a duplicate family (dedup_groups row)."""
    if len(study_ids) < 2:
        return

    study_id_set = set(study_ids)
    group_to_studies: dict[str, set[str]] = {}

    placeholders = ",".join("?" for _ in study_ids)
    try:
        s_rows = conn.execute(
            f"SELECT study_id, duplicate_group_id FROM studies WHERE study_id IN ({placeholders}) AND duplicate_group_id IS NOT NULL AND duplicate_group_id != ''",
            tuple(study_ids),
        ).fetchall()
        for r in s_rows:
            r_dict = dict(r) if not isinstance(r, dict) else r
            gid = r_dict.get("duplicate_group_id")
            if gid:
                group_to_studies.setdefault(gid, set()).add(r_dict["study_id"])
    except Exception:
        pass

    try:
        g_rows = conn.execute(
            "SELECT group_id, member_study_ids, status FROM dedup_groups WHERE project_id = ?",
            (project_id,),
        ).fetchall()
        for g in g_rows:
            g_dict = dict(g) if not isinstance(g, dict) else g
            if g_dict.get("status") in ("keep_both", "rejected"):
                continue
            gid = g_dict.get("group_id")
            try:
                members = set(json.loads(g_dict.get("member_study_ids") or "[]"))
            except Exception:
                members = set()
            shared = members.intersection(study_id_set)
            if len(shared) >= 2:
                group_to_studies.setdefault(gid, set()).update(shared)
    except Exception:
        pass

    conflicting_groups = set()
    for gid, sids in group_to_studies.items():
        if len(sids) >= 2:
            try:
                grow = conn.execute("SELECT status FROM dedup_groups WHERE group_id = ?", (gid,)).fetchone()
                if grow:
                    st = grow["status"] if isinstance(grow, dict) else grow[0]
                    if st in ("keep_both", "rejected"):
                        continue
            except Exception:
                pass
            conflicting_groups.add(gid)

    if conflicting_groups:
        sorted_gids = sorted(conflicting_groups)
        raise HTTPException(
            status_code=409,
            detail=f"Cannot pool duplicate studies in meta-analysis. Duplicate group(s) detected: {sorted_gids}. Resolve duplicates first.",
        )


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

    # Dedup guard: prevent pooling duplicate family studies
    if body.study_data:
        included_study_ids = [sd["study_id"] for sd in body.study_data if sd.get("study_id") and sd.get("included", True)]
        _check_duplicate_family_guard(conn, project_id, included_study_ids)

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
async def get_project_meta_analysis_synthesis(
    project_id: str,
    model: str = Query("random", pattern="^(random|fixed)$"),
    measure: str = Query("OR", pattern="^(OR|RR|MD|SMD)$"),
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    """Compute and return pooled meta-analysis synthesis for project's included studies.
    Never fabricates sample studies or sinusoidal numbers."""
    check_project_access(conn, project_id, user)
    proj = conn.execute("SELECT project_id, name FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    import math

    # 1. First, check if there is an explicit meta-analysis with studies and results
    ma_row = conn.execute(
        "SELECT * FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
        (project_id,),
    ).fetchone()

    if ma_row and ma_row["results_json"]:
        try:
            saved_results = json.loads(ma_row["results_json"])
            if "pooled" in saved_results and saved_results.get("n_studies", 0) >= 2:
                pooled = saved_results["pooled"]
                het = saved_results.get("heterogeneity", {})
                studies_list = []
                s_rows = conn.execute(
                    "SELECT * FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
                    (ma_row["meta_id"],),
                ).fetchall()
                for s in s_rows:
                    s_dict = dict(s) if not isinstance(s, dict) else s
                    raw = json.loads(s_dict["raw_data_json"]) if s_dict.get("raw_data_json") else {}
                    eff_val = s_dict.get("effect_size") or raw.get("effect_size") or raw.get("effect")
                    if eff_val is not None:
                        eff_num = float(eff_val)
                        is_log = (ma_row["effect_measure"] or "").lower() in ("rr", "log_rr", "or", "log_or", "hr", "log_hr")
                        eff_disp = math.exp(eff_num) if is_log and eff_num < 20 else eff_num
                        ci_l = s_dict.get("ci_lower") or raw.get("ci_lower")
                        ci_u = s_dict.get("ci_upper")
                        studies_list.append({
                            "name": s_dict.get("study_label") or raw.get("label", "Study"),
                            "study_id": s_dict.get("study_id"),
                            "effect": round(eff_disp, 4),
                            "ci_lower": round(float(ci_l), 4) if ci_l is not None else None,
                            "ci_upper": round(float(ci_u), 4) if ci_u is not None else None,
                            "weight": round(float(s_dict.get("weight") or raw.get("weight", 0)), 2),
                            "se": round(float(s_dict.get("se") or raw.get("se", 0)), 4) if (s_dict.get("se") or raw.get("se")) else None,
                        })
                if len(studies_list) >= 2:
                    return {
                        "status": "pooled",
                        "pooled_effect": pooled.get("pooled_effect_natural", pooled.get("pooled_effect", 0.0)),
                        "ci_lower": pooled.get("ci_lower_natural", pooled.get("ci_lower", 0.0)),
                        "ci_upper": pooled.get("ci_upper_natural", pooled.get("ci_upper", 0.0)),
                        "i2": het.get("i_squared", 0.0),
                        "p_heterogeneity": het.get("q_p_value", 1.0),
                        "measure": ma_row["effect_measure"],
                        "model": model,
                        "studies": studies_list,
                    }
        except Exception:
            pass

    # 2. Check included studies from the studies table
    studies_rows = conn.execute(
        """SELECT study_id, title, authors, publication_year FROM studies
           WHERE project_id = ? AND COALESCE(is_duplicate, 0) = 0
             AND screening_status IN ('included', 'ta_included', 'ft_included')
           ORDER BY publication_year ASC, title ASC""",
        (project_id,),
    ).fetchall()

    if not studies_rows or len(studies_rows) < 2:
        missing_studies = []
        for s in (studies_rows or []):
            s_dict = dict(s) if not isinstance(s, dict) else s
            missing_studies.append({
                "study_id": s_dict["study_id"],
                "name": f"{(s_dict.get('authors') or 'Study').split(',')[0].split(' ')[0]} et al. {s_dict.get('publication_year') or ''}".strip(),
                "title": s_dict.get("title", ""),
                "missing_data": "Insufficient study count for pooling (< 2 included studies)"
            })
        return {
            "status": "cannot_pool",
            "reason": "Need at least 2 included studies with usable extracted effect data to compute pooled meta-analysis",
            "studies": missing_studies,
        }

    # 3. Check extractions for usable effect sizes across the included studies
    usable_studies = []
    missing_studies = []

    for s in studies_rows:
        s_dict = dict(s) if not isinstance(s, dict) else s
        sid = s_dict["study_id"]
        author = (s_dict.get("authors") or "Study").split(",")[0].split(" ")[0]
        year = s_dict.get("publication_year") or ""
        lbl = f"{author} et al. {year}".strip()

        ext_rows = conn.execute(
            """SELECT v.name, v.field_type, e.value
               FROM extractions e
               JOIN variables v ON v.variable_id = e.variable_id
               WHERE e.study_id = ?""",
            (sid,),
        ).fetchall()

        ext_map = {}
        for er in ext_rows:
            vname = er["name"].lower().strip()
            ext_map[vname] = er["value"]

        parsed_data = None
        for eff_key in ("effect_size", "effect", "or", "odds_ratio", "rr", "risk_ratio", "hr", "hazard_ratio", "md", "smd"):
            if eff_key in ext_map and ext_map[eff_key]:
                try:
                    val = float(str(ext_map[eff_key]).replace(",", "").strip())
                    parsed_data = {"effect": val, "label": lbl, "study_id": sid}
                    break
                except ValueError:
                    pass

        if not parsed_data and all(k in ext_map for k in ("a", "b", "c", "d")):
            try:
                parsed_data = {
                    "a": float(ext_map["a"]), "b": float(ext_map["b"]),
                    "c": float(ext_map["c"]), "d": float(ext_map["d"]),
                    "label": lbl, "study_id": sid
                }
            except ValueError:
                pass

        if parsed_data:
            has_var = False
            for se_key in ("se", "standard_error", "variance"):
                if se_key in ext_map:
                    try:
                        v = float(str(ext_map[se_key]).replace(",", "").strip())
                        if se_key == "variance":
                            parsed_data["variance"] = v
                        else:
                            parsed_data["se"] = v
                            parsed_data["variance"] = v ** 2
                        has_var = True
                        break
                    except ValueError:
                        pass
            if not has_var and "ci_lower" in ext_map and "ci_upper" in ext_map:
                try:
                    ci_l = float(str(ext_map["ci_lower"]).replace(",", "").strip())
                    ci_u = float(str(ext_map["ci_upper"]).replace(",", "").strip())
                    parsed_data["ci_lower"] = ci_l
                    parsed_data["ci_upper"] = ci_u
                    has_var = True
                except ValueError:
                    pass

            if has_var:
                usable_studies.append(parsed_data)
            else:
                missing_studies.append({
                    "study_id": sid,
                    "name": lbl,
                    "title": s_dict.get("title", ""),
                    "missing_data": "Effect size found but standard error / confidence intervals missing"
                })
        else:
            missing_studies.append({
                "study_id": sid,
                "name": lbl,
                "title": s_dict.get("title", ""),
                "missing_data": "No extractable effect data (effect size, odds ratio, risk ratio, or 2x2 table)"
            })

    if len(usable_studies) < 2:
        return {
            "status": "cannot_pool",
            "reason": f"Need at least 2 included studies with usable extracted effect data to compute pooled meta-analysis (found {len(usable_studies)} usable)",
            "studies": missing_studies + usable_studies,
        }

    try:
        eff_sizes = []
        variances = []
        labels = []
        for us in usable_studies:
            es, var = ma.compute_effect_size(us, measure)
            eff_sizes.append(es)
            variances.append(var)
            labels.append(us["label"])

        res = ma.fit_generic_meta_analysis(eff_sizes, variances, measure)
        out_studies = []
        tot_weight = sum(1.0 / (v + res["tau_squared"]) for v in variances) if (variances and res.get("tau_squared") is not None) else 1.0
        for i, us in enumerate(usable_studies):
            w = (1.0 / (variances[i] + res["tau_squared"])) / tot_weight * 100.0 if tot_weight > 0 else 0
            se_i = math.sqrt(variances[i])
            is_log = measure.lower() in ("rr", "log_rr", "or", "log_or", "hr", "log_hr")
            eff_disp = math.exp(eff_sizes[i]) if is_log else eff_sizes[i]
            ci_l = math.exp(eff_sizes[i] - 1.96 * se_i) if is_log else eff_sizes[i] - 1.96 * se_i
            ci_u = math.exp(eff_sizes[i] + 1.96 * se_i) if is_log else eff_sizes[i] + 1.96 * se_i
            out_studies.append({
                "name": us["label"],
                "study_id": us.get("study_id"),
                "effect": round(eff_disp, 4),
                "ci_lower": round(ci_l, 4),
                "ci_upper": round(ci_u, 4),
                "weight": round(w, 2),
                "se": round(se_i, 4),
            })

        is_log = measure.lower() in ("rr", "log_rr", "or", "log_or", "hr", "log_hr")
        pooled_disp = math.exp(res["pooled_effect"]) if is_log else res["pooled_effect"]
        ci_low_disp = math.exp(res["ci_lower"]) if is_log else res["ci_lower"]
        ci_high_disp = math.exp(res["ci_upper"]) if is_log else res["ci_upper"]

        return {
            "status": "pooled",
            "pooled_effect": round(pooled_disp, 4),
            "ci_lower": round(ci_low_disp, 4),
            "ci_upper": round(ci_high_disp, 4),
            "i2": round(res["i_squared"], 2),
            "p_heterogeneity": round(res["p_value"], 4),
            "measure": f"Odds Ratio ({measure})" if measure == "OR" else measure,
            "model": model,
            "studies": out_studies,
        }
    except Exception as e:
        return {
            "status": "cannot_pool",
            "reason": f"Calculation error during meta-analysis pooling: {str(e)}",
            "studies": missing_studies + usable_studies,
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
        missing_studies = []
        for s in studies:
            s_dict = dict(s) if not isinstance(s, dict) else s
            missing_studies.append({
                "study_id": s_dict.get("study_id", ""),
                "label": s_dict.get("study_label", ""),
                "missing_data": "Insufficient study count for pooling (< 2 included studies)"
            })
        return {
            "status": "cannot_pool",
            "reason": "Need at least 2 included studies with usable extracted effect data to run meta-analysis",
            "studies": missing_studies,
        }

    study_data = []
    missing_studies = []
    for s in studies:
        s_dict = dict(s) if not isinstance(s, dict) else s
        raw = json.loads(s_dict["raw_data_json"]) if s_dict.get("raw_data_json") else {}
        raw["label"] = s_dict.get("study_label") or raw.get("label", f"Study {len(study_data)+1}")
        raw["included"] = True
        try:
            ma.compute_effect_size(raw, em)
            study_data.append(raw)
        except Exception:
            missing_studies.append({
                "study_id": s_dict.get("study_id", ""),
                "label": raw["label"],
                "missing_data": f"Missing required effect data for measure '{em}'"
            })

    if len(study_data) < 2:
        return {
            "status": "cannot_pool",
            "reason": f"Need at least 2 included studies with usable extracted effect data for measure '{em}' to run meta-analysis",
            "studies": missing_studies + study_data,
        }

    return await _run_analysis(meta_id, at, em, conn, study_data)


async def _run_analysis(meta_id: str, analysis_type: str, effect_measure: str,
                        conn: sqlite3.Connection, study_data: list[dict] = None) -> dict:
    """Internal: run the analysis and persist results."""
    meta_row = conn.execute("SELECT project_id FROM meta_analyses WHERE meta_id = ?", (meta_id,)).fetchone()
    project_id = (meta_row["project_id"] if isinstance(meta_row, dict) else meta_row[0]) if meta_row else ""

    mas_rows = conn.execute(
        "SELECT study_id FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
        (meta_id,),
    ).fetchall()
    included_study_ids = [(r["study_id"] if isinstance(r, dict) else r[0]) for r in mas_rows if (r["study_id"] if isinstance(r, dict) else r[0])]

    if study_data is None:
        studies = conn.execute(
            "SELECT * FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
            (meta_id,),
        ).fetchall()
        study_data = []
        for s in studies:
            s_dict = dict(s) if not isinstance(s, dict) else s
            raw = json.loads(s_dict["raw_data_json"]) if s_dict.get("raw_data_json") else {}
            raw["label"] = s_dict.get("study_label") or raw.get("label", f"Study {len(study_data)+1}")
            raw["included"] = True
            if s_dict.get("study_id") and "study_id" not in raw:
                raw["study_id"] = s_dict["study_id"]
            study_data.append(raw)

    if not included_study_ids and study_data:
        included_study_ids = [sd["study_id"] for sd in study_data if sd.get("study_id") and sd.get("included", True)]

    if project_id and included_study_ids:
        _check_duplicate_family_guard(conn, project_id, included_study_ids)

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
