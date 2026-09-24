"""
Router for Statistical Analysis & Effect Size Engine.
Adapted from K-Dense-AI statistical-analysis skill.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from services.stats_engine import run_statistical_analysis

router = APIRouter(prefix="/api/stats", tags=["statistics"])

class StatsRequest(BaseModel):
    group1: List[float]
    group2: List[float]
    group1_name: str = "Intervention"
    group2_name: str = "Control"
    paired: bool = False
    alpha: float = 0.05

@router.post("/analyze")
def analyze_groups(req: StatsRequest):
    """Execute guided statistical test selection, assumption validation, effect sizes, and APA reporting."""
    try:
        result = run_statistical_analysis(
            group1=req.group1,
            group2=req.group2,
            group1_name=req.group1_name,
            group2_name=req.group2_name,
            paired=req.paired,
            alpha=req.alpha,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"success": True, "analysis": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
