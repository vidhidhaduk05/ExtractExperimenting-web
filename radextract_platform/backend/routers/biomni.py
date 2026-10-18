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
    query_biomedical_entities_batch,
    generate_csl_citation_field,
)

router = APIRouter(prefix="/api/biomni", tags=["biomni"])


class SuppRequest(BaseModel):
    doi: str


class AdmetRequest(BaseModel):
    compound: str


class EntityRequest(BaseModel):
    entity_type: str  # "uniprot", "hpo", "pdb"
    query_term: str


class BatchEntityRequest(BaseModel):
    entities: List[Dict[str, str]]


class CslCitationRequest(BaseModel):
    citation_id: str
    title: str
    authors: str
    year: Optional[int] = None
    journal: str = ""
    doi: str = ""
    pmid: str = ""


@router.post("/doi/supplementary")
def get_supplementary(req: SuppRequest):
    """Fetch supplementary material files, appendices, and datasets from a published DOI."""
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
    """Cross-reference biomedical entities across UniProt, HPO, and PDB (cached)."""
    try:
        res = query_biomedical_entity(req.entity_type, req.query_term)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cross-ref/batch")
def cross_reference_batch(req: BatchEntityRequest):
    """Batch cross-reference multiple biomedical entities in a single call."""
    try:
        res = query_biomedical_entities_batch(req.entities)
        return {"success": True, "results": res, "total": len(res)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/zotero/csl-field")
def generate_zotero_csl_field(req: CslCitationRequest):
    """Generate native Zotero Word OpenXML CSL field code for direct manuscript injection."""
    try:
        res = generate_csl_citation_field(
            citation_id=req.citation_id,
            title=req.title,
            authors=req.authors,
            year=req.year,
            journal=req.journal,
            doi=req.doi,
            pmid=req.pmid,
        )
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
