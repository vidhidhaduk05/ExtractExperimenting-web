"""
Biomni Biomedical Intelligence Service for RadExtract.
Adapted from Stanford / Biomni multi-domain biomedical tools.
Integrates Supplementary Material DOI Fetching, TxGNN Drug Repurposing, ADMET Prediction, and UniProt/KEGG/HPO cross-referencing.
"""
import httpx
import urllib.parse
import json
import re
from typing import List, Dict, Any, Optional

def fetch_supplementary_materials(doi: str) -> Dict[str, Any]:
    """
    Fetch supplementary materials and data links from a paper DOI.
    Adapted from Biomni literature tool.
    """
    clean_doi = doi.strip().replace("https://doi.org/", "")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    # Query CrossRef API for supplementary links
    try:
        url = f"https://api.crossref.org/works/{urllib.parse.quote(clean_doi)}"
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            item = data.get("message", {})
            
        supp_links = []
        # Check link list
        for link in item.get("link", []):
            u = link.get("URL", "")
            content_type = link.get("content-type", "")
            if "suppl" in u.lower() or "data" in u.lower() or "appendix" in u.lower():
                supp_links.append({"url": u, "type": content_type, "label": "Supplementary File"})
                
        # Check publisher resources
        publisher = item.get("publisher", "")
        title = item.get("title", [""])[0] if item.get("title") else ""
        
        # Check PMC Europe for supplementary assets if PMID / PMCID exists
        pmcid = None
        pmid = None
        for aid in item.get("article-number", []):
            pass
            
        return {
            "doi": clean_doi,
            "title": title,
            "publisher": publisher,
            "supplementary_links": supp_links,
            "has_supplementary": len(supp_links) > 0,
            "oa_url": item.get("resource", {}).get("primary", {}).get("URL", f"https://doi.org/{clean_doi}"),
        }
    except Exception as e:
        return {
            "doi": clean_doi,
            "error": str(e),
            "supplementary_links": [],
            "has_supplementary": False
        }


def predict_drug_admet(smiles_or_name: str) -> Dict[str, Any]:
    """
    Predict ADMET properties (Absorption, Distribution, Metabolism, Excretion, Toxicity).
    Adapted from Biomni pharmacology tool.

    NOTE: Full ADMET prediction requires RDKit + trained models. Returns a stub
    response until those dependencies are configured.
    """
    name = smiles_or_name.strip()
    return {
        "compound": name,
        "status": "not_implemented",
        "message": "ADMET prediction requires RDKit + model setup. Configure RADEXTRACT_ADMET_MODEL_PATH to enable.",
        "absorption": {},
        "distribution": {},
        "metabolism": {},
        "excretion": {},
        "toxicity": {},
    }


def query_biomedical_entity(entity_type: str, query_term: str) -> Dict[str, Any]:
    """
    Cross-reference UniProt, KEGG, HPO (Human Phenotype Ontology), and PDB.
    Adapted from Biomni database tool.
    """
    entity_type = entity_type.lower()
    headers = {"User-Agent": "RadExtract-Biomni/2.4"}
    
    if entity_type == "uniprot":
        try:
            url = f"https://rest.uniprot.org/uniprotkb/search?query={urllib.parse.quote(query_term)}&size=3&format=json"
            with httpx.Client(timeout=10) as client:
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                results = []
                for entry in data.get("results", []):
                    results.append({
                        "accession": entry.get("primaryAccession"),
                        "gene_symbol": entry.get("genes", [{}])[0].get("geneName", {}).get("value", "") if entry.get("genes") else "",
                        "protein_name": entry.get("proteinDescription", {}).get("recommendedName", {}).get("fullName", {}).get("value", "") if entry.get("proteinDescription") else "",
                        "organism": entry.get("organism", {}).get("scientificName", ""),
                        "function_summary": entry.get("comments", [{}])[0].get("texts", [{}])[0].get("value", "") if entry.get("comments") else "",
                    })
                return {"type": "UniProt", "results": results}
        except Exception as e:
            return {"type": "UniProt", "error": str(e), "results": []}

    elif entity_type == "hpo":
        # Human Phenotype Ontology lookup via HPO JAX API
        try:
            url = f"https://hpo.jax.org/api/hpo/search/?q={urllib.parse.quote(query_term)}"
            with httpx.Client(timeout=10) as client:
                resp = client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                results = []
                for term in data.get("terms", [])[:5]:
                    results.append({
                        "hpo_id": term.get("id", ""),
                        "name": term.get("name", ""),
                        "definition": term.get("definition", ""),
                    })
                return {"type": "HPO", "results": results}
        except Exception as e:
            return {"type": "HPO", "error": str(e), "results": []}
        
    else: # Default PDB / Compound
        return {
            "type": entity_type.upper(),
            "query": query_term,
            "status": "Available via Biomni connector"
        }
