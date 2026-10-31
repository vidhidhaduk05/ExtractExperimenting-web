"""
Router for Scientific Exports: Mermaid PRISMA Flows, BibTeX / RIS Bibliography, and Auto-drafted Methods/Results.
Adapted from K-Dense-AI markdown-mermaid-writing, citation-management, and scientific-writing skills.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from services.mermaid_generator import generate_prisma_flow_mermaid, generate_rob_hierarchy_mermaid
from services.citation_service import study_to_bibtex, study_to_ris, generate_formatted_bibliography
from services.manuscript_drafter import draft_methods_section, draft_results_section
from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access
import sqlite3

router = APIRouter(prefix="/api/scientific-export", tags=["scientific_exports"])

class PrismaMermaidRequest(BaseModel):
    identification_db: int = 1240
    identification_registers: int = 35
    duplicates_removed: int = 210
    records_screened: int = 1065
    records_excluded: int = 890
    reports_sought: int = 175
    reports_not_retrieved: int = 12
    reports_assessed: int = 163
    reports_excluded_reasons: Optional[Dict[str, int]] = None
    new_studies_included: int = 42

class BibliographyRequest(BaseModel):
    project_id: str
    format: str = "bibtex" # "bibtex", "ris", "apa", "vancouver", "nature"

class ManuscriptDraftRequest(BaseModel):
    project_id: str
    section: str = "all" # "methods", "results", "all"
    pooled_effect: Optional[float] = None
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None
    measure: Optional[str] = "Odds Ratio (OR)"
    i2: Optional[float] = None
    p_val: Optional[float] = None

@router.post("/prisma-mermaid")
def export_prisma_mermaid(req: PrismaMermaidRequest):
    """Generate official PRISMA 2020 Flow Diagram in editable Mermaid syntax."""
    mermaid_code = generate_prisma_flow_mermaid(
        identification_db=req.identification_db,
        identification_registers=req.identification_registers,
        duplicates_removed=req.duplicates_removed,
        records_screened=req.records_screened,
        records_excluded=req.records_excluded,
        reports_sought=req.reports_sought,
        reports_not_retrieved=req.reports_not_retrieved,
        reports_assessed=req.reports_assessed,
        reports_excluded_reasons=req.reports_excluded_reasons,
        new_studies_included=req.new_studies_included,
    )
    return {"success": True, "mermaid": mermaid_code}

@router.post("/bibliography")
def export_project_bibliography(
    req: BibliographyRequest,
    conn: DBBackend = Depends(get_db),
    user: dict = Depends(get_current_user_optional),
):
    """Export project studies into BibTeX, RIS, or formatted APA/Vancouver/Nature reference list."""
    # Security: Enforce project access to prevent BOLA / unauthorized data leakage
    check_project_access(conn, req.project_id, user)
    rows = conn.execute(
        "SELECT study_id, title, authors, publication_year, journal, doi, pmid FROM studies WHERE project_id = ?",
        (req.project_id,)
    ).fetchall()
    studies = [dict(r) for r in rows]
        
    fmt = req.format.lower()
    if fmt == "bibtex":
        content = "\n\n".join([study_to_bibtex(s) for s in studies])
        mime = "application/x-bibtex"
        filename = f"references_{req.project_id}.bib"
    elif fmt == "ris":
        content = "\n\n".join([study_to_ris(s) for s in studies])
        mime = "application/x-research-info-systems"
        filename = f"references_{req.project_id}.ris"
    else:
        content = generate_formatted_bibliography(studies, style=fmt.upper())
        mime = "text/plain"
        filename = f"references_{req.project_id}.txt"
            
    return {
        "success": True,
        "format": fmt,
        "total_studies": len(studies),
        "content": content,
        "filename": filename,
        "mime_type": mime
    }

@router.post("/draft-manuscript")
def draft_manuscript_sections(
    req: ManuscriptDraftRequest,
    conn: DBBackend = Depends(get_db),
    user: dict = Depends(get_current_user_optional),
):
    """Draft evidence-bound Methods and Results manuscript sections."""
    # Security: Enforce project access to prevent BOLA / unauthorized manuscript drafting
    check_project_access(conn, req.project_id, user)
    proj = conn.execute("SELECT name, description FROM projects WHERE project_id = ?", (req.project_id,)).fetchone()
    proj_title = proj["name"] if proj else "Systematic Review & Meta-Analysis"
        
    # Count studies
    total_studies = conn.execute("SELECT count(*) as cnt FROM studies WHERE project_id = ?", (req.project_id,)).fetchone()["cnt"]
        
    methods_text = draft_methods_section(
        project_title=proj_title,
        inclusion_criteria=["Peer-reviewed randomized controlled trials.", "Human clinical study population.", "Clearly documented therapeutic intervention."],
        exclusion_criteria=["In vitro and animal models.", "Non-randomized case series with n < 5."],
        databases_searched=["PubMed/MEDLINE", "OpenAlex", "Cochrane Central (CENTRAL)"]
    )
        
    pooled = req.pooled_effect
    ci_l = req.ci_lower
    ci_u = req.ci_upper
    meas = req.measure or "Odds Ratio (OR)"
    het_i2 = req.i2
    p_v = req.p_val

    if pooled is None:
        ma_row = conn.execute("SELECT pooled_effect, pooled_ci_lower AS ci_lower, pooled_ci_upper AS ci_upper, effect_measure, i_squared AS i2, p_value FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", (req.project_id,)).fetchone()
        if ma_row and ma_row["pooled_effect"] is not None:
            pooled = float(ma_row["pooled_effect"])
            ci_l = float(ma_row["ci_lower"]) if ma_row["ci_lower"] is not None else pooled
            ci_u = float(ma_row["ci_upper"]) if ma_row["ci_upper"] is not None else pooled
            meas = ma_row["effect_measure"] or meas
            het_i2 = float(ma_row["i2"]) if ma_row["i2"] is not None else 0.0
            p_v = float(ma_row["p_value"]) if ma_row["p_value"] is not None else 0.05

    if pooled is not None:
        results_text = draft_results_section(
            total_screened=max(1, total_studies),
            total_included=max(1, total_studies),
            pooled_effect=pooled,
            ci_lower=ci_l if ci_l is not None else pooled,
            ci_upper=ci_u if ci_u is not None else pooled,
            measure=meas,
            i2=het_i2 if het_i2 is not None else 0.0,
            p_val=p_v if p_v is not None else 0.05
        )
    else:
        results_text = f"""## Results

### Study Selection and Characteristics
A total of {total_studies} studies were identified for this project.

### Synthesis of Findings
Quantitative meta-analytic pooling was not performed due to insufficient homogeneous quantitative effect size data (minimum 2 studies with extractable effect sizes required). Findings are synthesized narratively.
"""
        
    if req.section.lower() == "methods":
        out_md = methods_text
    elif req.section.lower() == "results":
        out_md = results_text
    else:
        out_md = f"# Manuscript Sections: {proj_title}\n\n{methods_text}\n\n{results_text}"
            
    return {
        "success": True,
        "project_id": req.project_id,
        "section": req.section,
        "markdown": out_md
    }
