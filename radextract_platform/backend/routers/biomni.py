"""
FastAPI Router for Biomni Biomedical Intelligence Tools.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from services.biomni_service import (
    fetch_supplementary_materials,
    predict_drug_admet,
    query_biomedical_entity,
)

router = APIRouter(prefix="/api/biomni", tags=["biomni"])

class SuppRequest(BaseModel):
    doi: str

class AdmetRequest(BaseModel):
    compound: str

class EntityRequest(BaseModel):
    entity_type: str # "uniprot", "hpo", "pdb"
    query_term: str

@router.post("/doi/supplementary")
def get_supplementary(req: SuppRequest):
    """Fetch supplementary material files and tables from a published DOI."""
    try:
        res = fetch_supplementary_materials(req.doi)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pharmacology/admet")
def get_admet_prediction(req: AdmetRequest):
    """Predict comprehensive ADMET pharmacological profile for a therapeutic compound."""
    try:
        res = predict_drug_admet(req.compound)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cross-ref")
def cross_reference_entity(req: EntityRequest):
    """Cross-reference biomedical entities across UniProt, HPO, and PDB."""
    try:
        res = query_biomedical_entity(req.entity_type, req.query_term)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
