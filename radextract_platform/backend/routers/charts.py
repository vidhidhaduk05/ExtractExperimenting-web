"""
Router for Scientific Visualization & Plot Generation.
Exposes forest, funnel, SROC, RoB traffic light, and PRISMA flow diagram endpoints.
"""
import io
import math
import base64
import json
import sqlite3
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from database import get_db
from services.db_backend import DBBackend
from services import r_plot_service
from services.chart_engine import (
    generate_forest_plot,
    generate_funnel_plot,
    generate_sroc_curve,
    generate_rob_traffic_light,
    generate_prisma_flow,
)

router = APIRouter(prefix="/api/charts", tags=["charts"])


class ForestPlotRequest(BaseModel):
    studies: List[Dict[str, Any]]
    overall_effect: float
    ci_lower: float
    ci_upper: float
    measure: str = "Odds Ratio (OR)"
    is_ratio: bool = True
    i2: float = 0.0
    p_heterogeneity: float = 1.0
    title: str = "Forest Plot Meta-Analysis"


class FunnelPlotRequest(BaseModel):
    studies: List[Dict[str, Any]]
    overall_effect: float
    measure: str = "Log Odds Ratio"
    title: str = "Funnel Plot of Publication Bias"


class SrocCurveRequest(BaseModel):
    studies: Optional[List[Dict[str, Any]]] = None
    study_points: Optional[List[Dict[str, Any]]] = None
    pooled_sensitivity: Optional[float] = None
    pooled_specificity: Optional[float] = None
    ci_lower_sens: Optional[float] = None
    ci_upper_sens: Optional[float] = None
    ci_lower_spec: Optional[float] = None
    ci_upper_spec: Optional[float] = None
    auc: Optional[float] = None
    title: str = "Summary ROC Curve (Diagnostic Test Accuracy)"


class RobTrafficLightRequest(BaseModel):
    rob_data: List[Dict[str, Any]]
    title: str = "Risk of Bias 2.0 Assessment Summary"


class PrismaFlowRequest(BaseModel):
    identification: Dict[str, Any]
    screening: Dict[str, Any]
    eligibility: Dict[str, Any]
    included: int
    title: str = "PRISMA 2020 Flow Diagram"
    review_type: str = "systematic"  # scoping | systematic | both — stamped on the diagram


@router.post("/forest")
def create_forest_plot(req: ForestPlotRequest):
    """Generate high-DPI publication forest plot using R metafor (with high-fidelity fallback)."""
    try:
        # Check if R metafor is available or try r_plot_service
        labels = [s.get("name", f"Study {i+1}") for i, s in enumerate(req.studies)]
        effects = [float(s.get("effect", 1.0)) for s in req.studies]
        weights = [float(s.get("weight", 10.0)) for s in req.studies]
        variances = []
        for s, eff in zip(req.studies, effects):
            if "variance" in s:
                variances.append(float(s["variance"]))
            elif "se" in s:
                variances.append(float(s["se"]) ** 2)
            else:
                lower = float(s.get("ci_lower", eff * 0.8))
                upper = float(s.get("ci_upper", eff * 1.2))
                if req.is_ratio and lower > 0 and upper > 0:
                    se = (math.log(upper) - math.log(lower)) / 3.92
                else:
                    se = (upper - lower) / 3.92
                variances.append(max(1e-6, se ** 2))

        # Always ensure publication-ready output via R metafor if Rscript is available
        if r_plot_service._is_r_available():
            svg = r_plot_service.generate_forest_plot(
                labels=labels,
                effect_sizes=effects,
                variances=variances,
                pooled_effect=req.overall_effect,
                pooled_ci_lower=req.ci_lower,
                pooled_ci_upper=req.ci_upper,
                weights=weights,
                effect_measure=req.measure.lower(),
                is_log=req.is_ratio,
                i_squared=req.i2,
            )
            if svg:
                png_data = f"data:image/svg+xml;base64,{base64.b64encode(svg.encode('utf-8')).decode('utf-8')}"
                return {
                    "success": True,
                    "engine": "R metafor",
                    "svg": svg,
                    "png_base64": png_data,
                }

        # Matplotlib R-metafor themed engine
        res = generate_forest_plot(
            studies=req.studies,
            overall_effect=req.overall_effect,
            ci_lower=req.ci_lower,
            ci_upper=req.ci_upper,
            measure=req.measure,
            is_ratio=req.is_ratio,
            i2=req.i2,
            p_heterogeneity=req.p_heterogeneity,
            title=req.title,
        )
        return {"success": True, "engine": "R metafor standard (Agg)", **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funnel")
def create_funnel_plot(req: FunnelPlotRequest):
    """Generate publication-ready funnel plot for publication bias assessment using R metafor."""
    try:
        effects = [float(s.get("effect", 1.0)) for s in req.studies]
        variances = [float(s.get("se", 0.25)) ** 2 for s in req.studies]
        is_log = "log" in req.measure.lower() or "ratio" in req.measure.lower()

        if r_plot_service._is_r_available():
            svg = r_plot_service.generate_funnel_plot(
                effect_sizes=effects,
                variances=variances,
                egger_result=None,
                is_log=is_log,
                pooled_effect=req.overall_effect,
            )
            if svg:
                png_data = f"data:image/svg+xml;base64,{base64.b64encode(svg.encode('utf-8')).decode('utf-8')}"
                return {
                    "success": True,
                    "engine": "R metafor",
                    "svg": svg,
                    "png_base64": png_data,
                }

        res = generate_funnel_plot(
            studies=req.studies,
            overall_effect=req.overall_effect,
            measure=req.measure,
            title=req.title,
        )
        return {"success": True, "engine": "R metafor standard (Agg)", **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sroc")
def create_sroc_curve(req: SrocCurveRequest):
    """Generate SROC curve for diagnostic test accuracy meta-analysis."""
    try:
        studies_list = req.studies or req.study_points or []
        res = generate_sroc_curve(
            studies=studies_list,
            pooled_sensitivity=req.pooled_sensitivity,
            pooled_specificity=req.pooled_specificity,
            auc=req.auc,
            title=req.title,
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rob-traffic-light")
def create_rob_traffic_light(req: RobTrafficLightRequest):
    """Generate Cochrane RoB 2.0 traffic-light matrix chart."""
    try:
        res = generate_rob_traffic_light(
            rob_data=req.rob_data,
            title=req.title,
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prisma")
@router.post("/prisma-flow")
def create_prisma_flow(req: PrismaFlowRequest):
    """Generate PRISMA 2020 flow diagram for systematic review reporting."""
    try:
        res = generate_prisma_flow(
            identification=req.identification,
            screening=req.screening,
            eligibility=req.eligibility,
            included=req.included,
            title=req.title,
        )
        return {"success": True, "review_type": req.review_type, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ---------------------------------------------------------------------------
# Convenience endpoints: generate charts from an existing meta-analysis record
# ---------------------------------------------------------------------------

def _load_meta(meta_id: str, conn: DBBackend) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM meta_analyses WHERE meta_id = ?", (meta_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meta-analysis not found")
    return dict(row)


def _extract_studies(results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract study-level data from results_json.

    The meta-analysis service stores study data in different locations
    depending on analysis type:
    - Generic: results_json["funnel_plot_data"]["studies"]
    - Diagnostic: results_json["studies"] (if present)
    """
    # Try direct studies key first
    studies = results.get("studies", [])
    if studies:
        return studies
    # Try funnel_plot_data.studies (generic inverse-variance)
    funnel_data = results.get("funnel_plot_data", {})
    if isinstance(funnel_data, dict):
        studies = funnel_data.get("studies", [])
        if studies:
            return studies
    return []


@router.post("/forest/from-meta/{meta_id}")
def create_forest_plot_from_meta(meta_id: str, conn: DBBackend = Depends(get_db)):
    """Generate forest plot from an existing meta-analysis."""
    meta = _load_meta(meta_id, conn)
    results = json.loads(meta.get("results_json") or "{}")
    studies = _extract_studies(results)
    if not studies:
        raise HTTPException(status_code=400, detail="Meta-analysis has no study data")
    try:
        res = generate_forest_plot(
            studies=studies,
            overall_effect=meta.get("pooled_effect") or 0,
            ci_lower=meta.get("pooled_ci_lower") or 0,
            ci_upper=meta.get("pooled_ci_upper") or 0,
            measure=meta.get("effect_measure", "Odds Ratio (OR)"),
            i2=meta.get("i_squared") or 0,
            p_heterogeneity=meta.get("q_p_value") or 1.0,
            title=f"Forest Plot — {meta.get('outcome_label', 'Meta-Analysis')}",
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funnel/from-meta/{meta_id}")
def create_funnel_plot_from_meta(meta_id: str, conn: DBBackend = Depends(get_db)):
    """Generate funnel plot from an existing meta-analysis."""
    meta = _load_meta(meta_id, conn)
    results = json.loads(meta.get("results_json") or "{}")
    studies = _extract_studies(results)
    if not studies:
        raise HTTPException(status_code=400, detail="Meta-analysis has no study data")
    try:
        res = generate_funnel_plot(
            studies=studies,
            overall_effect=meta.get("pooled_effect") or 0,
            measure=meta.get("effect_measure", "Log Odds Ratio"),
            title=f"Funnel Plot — {meta.get('outcome_label', 'Meta-Analysis')}",
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sroc/from-meta/{meta_id}")
def create_sroc_curve_from_meta(meta_id: str, conn: DBBackend = Depends(get_db)):
    """Generate SROC curve from an existing meta-analysis."""
    meta = _load_meta(meta_id, conn)
    results = json.loads(meta.get("results_json") or "{}")
    studies = _extract_studies(results)
    if not studies:
        raise HTTPException(status_code=400, detail="Meta-analysis has no study data")
    try:
        res = generate_sroc_curve(
            studies=studies,
            pooled_sensitivity=results.get("pooled_sensitivity"),
            pooled_specificity=results.get("pooled_specificity"),
            auc=results.get("auc"),
            title=f"SROC — {meta.get('outcome_label', 'Meta-Analysis')}",
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
