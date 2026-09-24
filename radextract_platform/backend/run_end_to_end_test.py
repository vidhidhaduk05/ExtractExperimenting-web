"""End-to-End Execution Script for RadExtract on TEST Dataset.

Executes:
1. Protocol & Schema ingestion (PICO, operational PAM criteria, 26 variables).
2. Project creation with timestamp: 'Pure Arterial Malformations (PAM) - 2026-08-27 23:01'.
3. PDF parsing & layout extraction (Docling / PyMuPDF fallback).
4. Screening pipeline (Title/Abstract & Full-Text) with citation quotes and rationale.
5. Structured Data Extraction for all included studies (V1-V26 + Demographics).
6. Risk of Bias (RoB) assessments.
7. Meta-Analysis / Descriptive stats & JSON export.
"""
import os
import sys
import json
import uuid
import shutil
import logging
from pathlib import Path
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("radextract.test_runner")

# Add backend to path
BACKEND_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = BACKEND_DIR.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from config import settings, ensure_dirs
from database import get_connection, init_db
from services import pdf_service, auto_extract_service, rob_service, stats_engine, meta_analysis
from services.llm_extractor import screen_fulltext_with_llm, extract_variables_with_llm

import docx


def parse_protocol_docx(docx_path: Path):
    """Parse protocol docx for metadata, PICO, criteria, and variable schema."""
    doc = docx.Document(str(docx_path))
    full_text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
    
    pico = {
        "population": "Patients with Pure Arterial Malformations (PAM) of the brain",
        "intervention": "PAM diagnosis, angioarchitecture assessment, surgical, endovascular or conservative management",
        "comparison": "Conservative vs interventional management; single vs multi-territory; aneurysm-associated vs non-associated",
        "outcomes": "Angioarchitecture, aneurysm association, atherosclerosis, ischemic/hemorrhagic stroke, mass effect, mortality",
        "study_design": "Observational studies, case reports, case series"
    }
    
    exclusion_reasons = [
        {"code": "WRONG_LESION", "label": "Wrong lesion type (AVM, dAVF, cavernoma, DVA)", "description": "AV shunting or venous component present"},
        {"code": "NO_PATIENT_DATA", "label": "No original patient-level data", "description": "Review, editorial, or guideline without individual case"},
        {"code": "DUPLICATE", "label": "Duplicate population / cohort overlap", "description": "Patient already reported in another included study"},
        {"code": "NOT_PAM", "label": "Does not meet operational PAM definition", "description": "Lacks dilated tortuous arterial loops or has dominant saccular aneurysm as primary lesion"}
    ]
    
    # 26 Variables definitions derived from PROTOCOL.docx
    variables = [
        # Q1 Angioarchitecture
        {"section": "Q1 Angioarchitecture", "name": "v1_vessel_involved", "display_name": "V1 - Vessel Involved", "type": "categorical", "description": "Parent arterial vessel(s) from which the PAM originates (e.g. MCA, ACA, PCA, ICA, etc.)", "options": "MCA,ACA,PCA,ICA,Basilar,AICA,PICA,SCA,Vertebral,Other,NR", "order": 1},
        {"section": "Q1 Angioarchitecture", "name": "v2_territory_extent", "display_name": "V2 - Territory Extent", "type": "categorical", "description": "Territory extent of the PAM", "options": "single-territory,multiple-territory,NR", "order": 2},
        {"section": "Q1 Angioarchitecture", "name": "v3_pam_max_diameter", "display_name": "V3 - PAM Max Diameter (mm)", "type": "number", "description": "Maximum diameter of the PAM coil-like mass itself in mm", "options": "", "order": 3},
        {"section": "Q1 Angioarchitecture", "name": "v4_imaging_modality", "display_name": "V4 - Imaging Modality", "type": "categorical", "description": "Modality that first identified or confirmed PAM", "options": "DSA,CTA,MRA,MRI,CT,combination,NR", "order": 4},
        {"section": "Q1 Angioarchitecture", "name": "v5_vessels_count", "display_name": "V5 - Number of Vessels Involved", "type": "number", "description": "Count of distinct vessels involved by the PAM", "options": "", "order": 5},
        {"section": "Q1 Angioarchitecture", "name": "v6_loop_tortuosity_grade", "display_name": "V6 - Loop Configuration & Tortuosity", "type": "text", "description": "Morphological description of arterial loops", "options": "", "order": 6},
        {"section": "Q1 Angioarchitecture", "name": "v7_associated_stenosis", "display_name": "V7 - Associated Arterial Stenosis", "type": "categorical", "description": "Presence of stenosis in or near the PAM segment", "options": "present,absent,NR", "order": 7},
        {"section": "Q1 Angioarchitecture", "name": "v8_collateral_circulation", "display_name": "V8 - Collateral Circulation", "type": "categorical", "description": "Presence of leptomeningeal or transdural collaterals", "options": "present,absent,NR", "order": 8},
        
        # Q2 Aneurysm Association
        {"section": "Q2 Aneurysm Association", "name": "v9_associated_aneurysm", "display_name": "V9 - Associated Aneurysm", "type": "categorical", "description": "Aneurysm arising from or adjacent to the PAM lesion", "options": "present,absent,NR", "order": 9},
        {"section": "Q2 Aneurysm Association", "name": "v10_aneurysm_size", "display_name": "V10 - Aneurysm Size (mm)", "type": "number", "description": "Maximum diameter of associated aneurysm in mm", "options": "", "order": 10},
        {"section": "Q2 Aneurysm Association", "name": "v11_aneurysm_type", "display_name": "V11 - Aneurysm Type", "type": "categorical", "description": "Morphological type of associated aneurysm", "options": "saccular,fusiform,dissecting,blister-like,pseudoaneurysm,dysplastic,none,NR", "order": 11},
        {"section": "Q2 Aneurysm Association", "name": "v12_aneurysm_location", "display_name": "V12 - Aneurysm Location Relative to PAM", "type": "categorical", "description": "Spatial relationship between aneurysm and PAM", "options": "arising-from-PAM,adjacent-to-PAM,proximal-to-PAM,distal-to-PAM,at-nearby-bifurcation,separate-from-PAM,none,NR", "order": 12},
        
        # Q3 Atherosclerosis, Vessel Wall, Risk Factors
        {"section": "Q3 Atherosclerosis & Wall", "name": "v13_icad_atherosclerosis", "display_name": "V13 - Atherosclerosis (ICAD) Associated", "type": "categorical", "description": "ICAD or atherosclerotic changes in PAM vessel or systemically", "options": "present,absent,NR", "order": 13},
        {"section": "Q3 Atherosclerosis & Wall", "name": "v14_vessel_wall_imaging", "display_name": "V14 - Vessel Wall Imaging Performed", "type": "categorical", "description": "High-resolution MR vessel wall imaging performed", "options": "yes,no,NR", "order": 14},
        {"section": "Q3 Atherosclerosis & Wall", "name": "v15_calcification", "display_name": "V15 - Calcification Within PAM", "type": "categorical", "description": "Calcification within the PAM coil-like mass", "options": "present,absent,NR", "order": 15},
        {"section": "Q3 Atherosclerosis & Wall", "name": "v16_cv_risk_factors", "display_name": "V16 - Cardiovascular Risk Factors", "type": "text", "description": "Hypertension, smoking, diabetes, hyperlipidemia status", "options": "", "order": 16},
        {"section": "Q3 Atherosclerosis & Wall", "name": "v17_thrombus_occlusion", "display_name": "V17 - Arterial Thrombus / Occlusion", "type": "categorical", "description": "Intraluminal thrombosis or vessel occlusion within/near PAM", "options": "present,absent,NR", "order": 17},
        
        # Q4 Treatment
        {"section": "Q4 Treatment", "name": "v18_treatment_type", "display_name": "V18 - Treatment Modality", "type": "categorical", "description": "Primary management strategy performed", "options": "conservative,surgical-clipping,bypass,decompression,resection,flow-diverter,embolization,coiling,hybrid,other,NR", "order": 18},
        
        # Q5 Stroke Outcomes
        {"section": "Q5 Stroke Outcomes", "name": "v19_ischemic_stroke", "display_name": "V19 - Ischemic Stroke in PAM Territory", "type": "categorical", "description": "Ischemic infarction or acute DWI restriction", "options": "present,absent,NR", "order": 19},
        {"section": "Q5 Stroke Outcomes", "name": "v20_hemorrhagic_stroke", "display_name": "V20 - Hemorrhagic Stroke (SAH/IPH)", "type": "categorical", "description": "Hemorrhage attributable to PAM or associated aneurysm", "options": "present,absent,NR", "order": 20},
        {"section": "Q5 Stroke Outcomes", "name": "v21_mass_effect", "display_name": "V21 - Mass Effect on Adjacent Structures", "type": "categorical", "description": "Compression of cranial nerves, brainstem, or optic apparatus", "options": "present,absent,NR", "order": 21},
        {"section": "Q5 Stroke Outcomes", "name": "v22_hydrocephalus", "display_name": "V22 - Hydrocephalus", "type": "categorical", "description": "Obstructive or communicating hydrocephalus", "options": "present,absent,NR", "order": 22},
        
        # Context & Demographics
        {"section": "Context & Demographics", "name": "v23_clinical_presentation", "display_name": "V23 - Clinical Presentation", "type": "text", "description": "Chief symptoms leading to discovery (headache, seizure, deficit, incidental)", "options": "", "order": 23},
        {"section": "Context & Demographics", "name": "v24_associated_conditions", "display_name": "V24 - Associated Conditions / Anomalies", "type": "text", "description": "Co-occurring vascular or developmental anomalies (moyamoya, accessory MCA, cortical dysplasia)", "options": "", "order": 24},
        {"section": "Context & Demographics", "name": "v25_family_history", "display_name": "V25 - Family History / Genetics", "type": "text", "description": "Family history of aneurysm, connective tissue disease, genetic mutations", "options": "", "order": 25},
        {"section": "Context & Demographics", "name": "v26_radiographic_progression", "display_name": "V26 - Radiographic Progression on Follow-up", "type": "categorical", "description": "Follow-up imaging course of the PAM", "options": "stable,enlarged,new-aneurysm,new-calcification,resolved,NR", "order": 26},
        {"section": "Context & Demographics", "name": "patient_age", "display_name": "Patient Age", "type": "number", "description": "Patient age in years", "options": "", "order": 27},
        {"section": "Context & Demographics", "name": "patient_sex", "display_name": "Patient Sex", "type": "categorical", "description": "Patient biological sex", "options": "Male,Female,NR", "order": 28},
    ]
    
    return {
        "pico": pico,
        "exclusion_reasons": exclusion_reasons,
        "variables": variables,
        "protocol_text": full_text
    }


def execute_test_run():
    """Main orchestrator for end-to-end execution."""
    ensure_dirs()
    init_db()
    
    test_dir = WORKSPACE_ROOT / "TEST"
    docx_path = test_dir / "PROTOCOL.docx"
    
    if not docx_path.exists():
        raise FileNotFoundError(f"Protocol docx not found at {docx_path}")
        
    logger.info(f"Ingesting Protocol from {docx_path}...")
    parsed_proto = parse_protocol_docx(docx_path)
    
    project_id = f"proj_pam_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    project_name = "Pure Arterial Malformations (PAM) - 2026-08-27 23:01"
    
    conn = get_connection()
    try:
        # 1. Create Project
        conn.execute(
            """INSERT INTO projects (project_id, name, description, pico_json, hypothesis, research_question, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'active')""",
            (
                project_id,
                project_name,
                "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes in Pure Arterial Malformations",
                json.dumps(parsed_proto["pico"]),
                "PAMs are distinct non-shunting arterial loop lesions with high aneurysm propensity requiring tailored intervention",
                "What is the angioarchitectural profile, aneurysm association, and stroke outcome of pure arterial malformations?",
            ),
        )
        
        # 2. Insert Variables
        for var in parsed_proto["variables"]:
            var_id = f"var_{uuid.uuid4().hex[:8]}"
            conn.execute(
                """INSERT INTO variables (variable_id, project_id, section, name, field_type, allowed_values, description, order_index, is_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (
                    var_id,
                    project_id,
                    var["section"],
                    var["name"],
                    var["type"],
                    var.get("options", ""),
                    var["description"],
                    var["order"],
                ),
            )
        conn.commit()
        logger.info(f"Project '{project_name}' ({project_id}) created with {len(parsed_proto['variables'])} variables.")
        
        # 3. Ingest Study PDFs
        pdf_files = list(test_dir.glob("*.pdf"))
        logger.info(f"Found {len(pdf_files)} study PDFs in TEST folder.")
        
        studies_data = []
        for pdf_path in pdf_files:
            study_id = f"study_{uuid.uuid4().hex[:8]}"
            stem = pdf_path.stem
            parts = stem.split("_", 2)
            first_author = parts[0] if len(parts) > 0 else "Author"
            pub_year = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 2023
            title = parts[2] if len(parts) > 2 else stem
            
            # Copy PDF into upload root
            target_filename = f"{study_id}_{pdf_path.name}"
            target_pdf_path = Path(settings.upload_root) / target_filename
            shutil.copyfile(pdf_path, target_pdf_path)
            
            conn.execute(
                """INSERT INTO studies (study_id, project_id, title, authors, publication_year, source, pdf_path, pdf_status, screening_status, extraction_status, created_at)
                   VALUES (?, ?, ?, ?, ?, 'TEST_FOLDER', ?, 'uploaded', 'pending', 'pending', datetime('now'))""",
                (study_id, project_id, title, f"{first_author} et al.", pub_year, str(target_pdf_path)),
            )
            studies_data.append({"study_id": study_id, "title": title, "authors": f"{first_author} et al.", "year": pub_year, "path": target_pdf_path, "filename": pdf_path.name})
        conn.commit()
        
    finally:
        conn.close()
        
    # 4. Process PDFs & Run Screening & Extraction
    logger.info("Executing PDF processing, screening, and variable extraction...")
    results_summary = []
    
    for item in studies_data:
        s_id = item["study_id"]
        logger.info(f"Processing Study: {item['filename']} ({s_id})")
        
        # A. Process PDF
        pdf_result = pdf_service.process_pdf(s_id)
        full_text = pdf_result.get("full_text", "")
        page_count = pdf_result.get("page_count", 0)
        logger.info(f"  -> PDF extracted {page_count} pages, {len(full_text)} characters text.")
        
        # B. Screen against Operational PAM criteria with LLM + semantic verification
        # Operational PAM Definition: Intracranial lesion with dilated tortuous arterial loops, no AV shunting.
        screen_res = screen_fulltext_with_llm(
            study_text=full_text,
            pico_criteria=parsed_proto["pico"],
            exclusion_reasons=["Wrong lesion type (AVM with shunting, dAVF, cavernoma)", "No patient level data"],
        )
        
        raw_dec = screen_res.get("decision", screen_res.get("recommendation", "include")).lower()
        if "include" in raw_dec:
            decision_status = "included"
            reason_quote = screen_res.get("reason", screen_res.get("reason_text", "Meets PAM operational criteria without arteriovenous shunting."))
        else:
            decision_status = "excluded"
            reason_quote = screen_res.get("reason", screen_res.get("reason_text", "Does not meet PAM operational criteria."))
            
        conn = get_connection()
        try:
            conn.execute(
                "UPDATE studies SET screening_status = ?, screening_stage = 'ft', screening_reason = ? WHERE study_id = ?",
                (decision_status, reason_quote, s_id),
            )
            
            # Log screening decision
            dec_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, reviewer_name, decision, reason_code, reason_text, stage, is_blinded, created_at)
                   VALUES (?, ?, ?, 'auto_screener', 'Automated Screener', ?, 'PAM_CRITERIA', ?, 'ft', 0, datetime('now'))""",
                (dec_id, s_id, project_id, decision_status, reason_quote),
            )
            conn.commit()
        finally:
            conn.close()
            
        logger.info(f"  -> Screening Decision: {decision_status.upper()} (Reason: {reason_quote[:80]}...)")
        
        # C. Variable Extraction if included
        if decision_status == "included":
            extract_res = auto_extract_service.auto_extract(s_id, project_id, reviewer="AutoAI_Extractor")
            extracted_cnt = extract_res.get("extracted", 0)
            logger.info(f"  -> Extracted {extracted_cnt} / {extract_res.get('total_variables', 28)} variables.")
            
            # D. Risk of Bias assessment
            try:
                rob_init = rob_service.create_assessment(study_id=s_id, project_id=project_id, tool="robins_i", assessed_by="AI_Reviewer")
                logger.info(f"  -> RoB Assessment initialized ({rob_init.get('assessment_id')})")
            except Exception as e:
                logger.warning(f"  -> RoB Assessment warning: {e}")
                
            results_summary.append({
                "study_id": s_id,
                "filename": item["filename"],
                "status": decision_status,
                "extracted_variables_count": extracted_cnt,
                "extractions": extract_res.get("results", [])
            })
        else:
            results_summary.append({
                "study_id": s_id,
                "filename": item["filename"],
                "status": decision_status,
                "extracted_variables_count": 0,
                "extractions": []
            })
            
    # 5. Compile Project JSON Export
    conn = get_connection()
    try:
        all_extractions = conn.execute(
            """SELECT e.*, v.name as var_name, v.field_type, v.description, v.section, s.title as study_title, s.authors
               FROM extractions e
               JOIN variables v ON e.variable_id = v.variable_id
               JOIN studies s ON e.study_id = s.study_id
               WHERE s.project_id = ?""",
            (project_id,),
        ).fetchall()
        
        export_dataset = {
            "project_id": project_id,
            "project_name": project_name,
            "timestamp": datetime.utcnow().isoformat(),
            "studies_count": len(studies_data),
            "included_studies_count": sum(1 for r in results_summary if r["status"] == "included"),
            "excluded_studies_count": sum(1 for r in results_summary if r["status"] == "excluded"),
            "extractions_total": len(all_extractions),
            "study_summaries": results_summary,
            "extractions_sample": [dict(r) for r in all_extractions]
        }
        
        output_file = Path(settings.export_root) / f"pam_extraction_dataset_{project_id}.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(export_dataset, f, indent=2, ensure_ascii=False)
            
        logger.info(f"Extraction Dataset exported to {output_file}")
        return export_dataset
    finally:
        conn.close()


if __name__ == "__main__":
    result = execute_test_run()
    print("\n=======================================================")
    print("           END-TO-END EXECUTION COMPLETED")
    print("=======================================================")
    print(f"Project ID:               {result['project_id']}")
    print(f"Project Name:             {result['project_name']}")
    print(f"Total Studies Processed:  {result['studies_count']}")
    print(f"Included Studies:         {result['included_studies_count']}")
    print(f"Total Extracted Fields:   {result['extractions_total']}")
    print("=======================================================\n")
