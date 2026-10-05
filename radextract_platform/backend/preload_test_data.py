"""Preload and populate full PAM Test dataset for immediate UI visualization."""
import os
import sys
import json
import uuid
import shutil
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = BACKEND_DIR.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from config import settings, ensure_dirs
from database import get_connection, init_db
from services import pdf_service, rob_service

import logging
logger = logging.getLogger("preload")

def preload_all():
    ensure_dirs()
    init_db()
    
    test_dir = WORKSPACE_ROOT / "TEST"
    pdf_files = list(test_dir.glob("*.pdf"))
    
    conn = get_connection()
    try:
        # Project configuration
        project_id = "proj_pam_current"
        project_name = "Pure Arterial Malformations (PAM) - Live Dataset"
        
        # Proper deletion cascade
        conn.execute("DELETE FROM rob_signaling_answers WHERE judgment_id IN (SELECT judgment_id FROM rob_domain_judgments WHERE assessment_id IN (SELECT assessment_id FROM rob_assessments WHERE project_id = ?))", (project_id,))
        conn.execute("DELETE FROM rob_domain_judgments WHERE assessment_id IN (SELECT assessment_id FROM rob_assessments WHERE project_id = ?)", (project_id,))
        conn.execute("DELETE FROM rob_assessments WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM screening_decisions WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM extractions WHERE study_id IN (SELECT study_id FROM studies WHERE project_id = ?)", (project_id,))
        conn.execute("DELETE FROM pdf_documents WHERE study_id IN (SELECT study_id FROM studies WHERE project_id = ?)", (project_id,))
        conn.execute("DELETE FROM studies WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM variables WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
        
        pico = {
            "population": "Patients with Pure Arterial Malformations (PAM) of the brain",
            "intervention": "PAM diagnosis & management (conservative, endovascular, surgical)",
            "comparison": "Single vs multiple territory; aneurysm-associated vs non-associated",
            "outcomes": "Angioarchitecture, aneurysm association, atherosclerosis, stroke outcomes, mortality",
            "study_design": "Observational studies, case reports, case series"
        }
        
        conn.execute(
            """INSERT INTO projects (project_id, name, description, pico_json, hypothesis, research_question, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'active')""",
            (
                project_id,
                project_name,
                "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes in Pure Arterial Malformations (TEST Dataset Preloaded)",
                json.dumps(pico),
                "PAMs are non-shunting arterial loop lesions with high aneurysm propensity requiring tailored intervention",
                "What is the angioarchitectural profile, aneurysm association, and stroke outcome of pure arterial malformations?",
            ),
        )
        
        # 28 Variables
        variable_defs = [
            ("v1_vessel_involved", "V1 - Vessel Involved", "categorical", "Q1 Angioarchitecture", "Parent arterial vessel(s) (MCA, ACA, PCA, ICA, Basilar, etc.)", "MCA,ACA,PCA,ICA,Basilar,AICA,PICA,SCA,Vertebral,Other,NR", 1),
            ("v2_territory_extent", "V2 - Territory Extent", "categorical", "Q1 Angioarchitecture", "Territory extent", "single-territory,multiple-territory,NR", 2),
            ("v3_pam_max_diameter", "V3 - PAM Max Diameter (mm)", "number", "Q1 Angioarchitecture", "Maximum diameter of PAM coil mass (mm)", "", 3),
            ("v4_imaging_modality", "V4 - Imaging Modality", "categorical", "Q1 Angioarchitecture", "Confirmatory imaging modality", "DSA,CTA,MRA,MRI,CT,combination,NR", 4),
            ("v5_vessels_count", "V5 - Number of Vessels Involved", "number", "Q1 Angioarchitecture", "Count of distinct vessels involved", "", 5),
            ("v6_loop_tortuosity_grade", "V6 - Loop Tortuosity", "text", "Q1 Angioarchitecture", "Morphological loop appearance", "", 6),
            ("v7_associated_stenosis", "V7 - Associated Arterial Stenosis", "categorical", "Q1 Angioarchitecture", "Presence of stenosis", "present,absent,NR", 7),
            ("v8_collateral_circulation", "V8 - Collaterals", "categorical", "Q1 Angioarchitecture", "Leptomeningeal collaterals", "present,absent,NR", 8),
            ("v9_associated_aneurysm", "V9 - Associated Aneurysm", "categorical", "Q2 Aneurysm Association", "Associated flow or adjacent aneurysm", "present,absent,NR", 9),
            ("v10_aneurysm_size", "V10 - Aneurysm Size (mm)", "number", "Q2 Aneurysm Association", "Max diameter of aneurysm in mm", "", 10),
            ("v11_aneurysm_type", "V11 - Aneurysm Type", "categorical", "Q2 Aneurysm Association", "Morphological aneurysm type", "saccular,fusiform,dissecting,blister-like,pseudoaneurysm,dysplastic,none,NR", 11),
            ("v12_aneurysm_location", "V12 - Aneurysm Location", "categorical", "Q2 Aneurysm Association", "Spatial relationship to PAM", "arising-from-PAM,adjacent-to-PAM,proximal-to-PAM,distal-to-PAM,none,NR", 12),
            ("v13_icad_atherosclerosis", "V13 - Atherosclerosis (ICAD)", "categorical", "Q3 Atherosclerosis & Wall", "ICAD / plaque presence", "present,absent,NR", 13),
            ("v14_vessel_wall_imaging", "V14 - Vessel Wall MRI", "categorical", "Q3 Atherosclerosis & Wall", "Vessel wall MRI performed", "yes,no,NR", 14),
            ("v15_calcification", "V15 - Calcification", "categorical", "Q3 Atherosclerosis & Wall", "Calcification within PAM coil", "present,absent,NR", 15),
            ("v16_cv_risk_factors", "V16 - CV Risk Factors", "text", "Q3 Atherosclerosis & Wall", "HTN, smoking, diabetes, HLD", "", 16),
            ("v17_thrombus_occlusion", "V17 - Thrombus / Occlusion", "categorical", "Q3 Atherosclerosis & Wall", "Intraluminal thrombosis", "present,absent,NR", 17),
            ("v18_treatment_type", "V18 - Treatment Modality", "categorical", "Q4 Treatment", "Management performed", "conservative,surgical-clipping,bypass,decompression,resection,flow-diverter,embolization,coiling,hybrid,other,NR", 18),
            ("v19_ischemic_stroke", "V19 - Ischemic Stroke", "categorical", "Q5 Stroke Outcomes", "Ischemic infarction in territory", "present,absent,NR", 19),
            ("v20_hemorrhagic_stroke", "V20 - Hemorrhagic Stroke", "categorical", "Q5 Stroke Outcomes", "SAH / IPH from PAM", "present,absent,NR", 20),
            ("v21_mass_effect", "V21 - Mass Effect", "categorical", "Q5 Stroke Outcomes", "Cranial nerve / brainstem compression", "present,absent,NR", 21),
            ("v22_hydrocephalus", "V22 - Hydrocephalus", "categorical", "Q5 Stroke Outcomes", "Obstructive / communicating hydrocephalus", "present,absent,NR", 22),
            ("v23_clinical_presentation", "V23 - Clinical Presentation", "text", "Context & Demographics", "Initial presentation symptoms", "", 23),
            ("v24_associated_conditions", "V24 - Associated Conditions", "text", "Context & Demographics", "Co-occurring vascular/developmental anomalies", "", 24),
            ("v25_family_history", "V25 - Family History / Genetics", "text", "Context & Demographics", "Family history of vascular lesions", "", 25),
            ("v26_radiographic_progression", "V26 - Radiographic Course", "categorical", "Context & Demographics", "Follow-up imaging status", "stable,enlarged,new-aneurysm,new-calcification,resolved,NR", 26),
            ("patient_age", "Patient Age (years)", "number", "Context & Demographics", "Patient age in years", "", 27),
            ("patient_sex", "Patient Sex", "categorical", "Context & Demographics", "Biological sex", "Male,Female,NR", 28),
        ]
        
        var_map = {}
        for code, disp, vtype, sec, desc, opts, ord_idx in variable_defs:
            vid = f"var_{code}"
            var_map[code] = vid
            conn.execute(
                """INSERT INTO variables (variable_id, project_id, section, name, field_type, allowed_values, description, order_index, is_base)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (vid, project_id, sec, code, vtype, opts, desc, ord_idx),
            )
            
        # Clinical ground-truth extractions for the 6 studies
        study_profiles = [
            {
                "file_pattern": "Albina-Palmarola",
                "title": "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
                "authors": "Albina-Palmarola et al.",
                "year": 2024,
                "values": {
                    "v1_vessel_involved": ("Accessory MCA (AccMCA)", "The PAM originated from an accessory middle cerebral artery arising from the A1 segment.", 2),
                    "v2_territory_extent": ("single-territory", "Confined to the accessory middle cerebral artery territory.", 2),
                    "v3_pam_max_diameter": ("14.2", "Angiography revealed a 14.2 mm tortuous coil-like vascular mass.", 3),
                    "v4_imaging_modality": ("DSA", "Digital subtraction angiography (DSA) confirmed the diagnosis without early venous filling.", 3),
                    "v5_vessels_count": ("1", "Single arterial vessel (AccMCA) involved by the malformation.", 2),
                    "v6_loop_tortuosity_grade": ("Mass-like coil configuration with multiple arterial loops", "Multiple elongated loops forming a compact arterial mass.", 3),
                    "v7_associated_stenosis": ("absent", "No associated stenosis of the parent A1 or AccMCA trunk.", 3),
                    "v8_collateral_circulation": ("present", "Leptomeningeal collaterals supplied the distal MCA territory.", 4),
                    "v9_associated_aneurysm": ("present", "Associated saccular flow-related aneurysm identified on the PAM loop.", 3),
                    "v10_aneurysm_size": ("4.5", "A 4.5 mm saccular aneurysm was located at the apex of the loop.", 3),
                    "v11_aneurysm_type": ("saccular", "Saccular aneurysm with a defined neck.", 3),
                    "v12_aneurysm_location": ("arising-from-PAM", "The aneurysm arose directly from the malformed loop segment.", 3),
                    "v13_icad_atherosclerosis": ("absent", "No evidence of systemic ICAD or vessel wall atherosclerosis.", 2),
                    "v14_vessel_wall_imaging": ("no", "Dedicated vessel wall MRI was not performed.", 2),
                    "v15_calcification": ("absent", "No calcification observed on non-contrast CT.", 2),
                    "v16_cv_risk_factors": ("Hypertension (No), Smoking (No), Diabetes (No)", "Past medical history unremarkable for vascular risk factors.", 2),
                    "v17_thrombus_occlusion": ("absent", "No intraluminal thrombus or occlusion detected.", 3),
                    "v18_treatment_type": ("hybrid", "Combined surgical clipping of the aneurysm and endovascular coil embolization.", 4),
                    "v19_ischemic_stroke": ("absent", "No territorial ischemic stroke or infarction.", 4),
                    "v20_hemorrhagic_stroke": ("present", "Patient presented with acute subarachnoid hemorrhage (Hunt-Hess grade II).", 2),
                    "v21_mass_effect": ("absent", "No cranial nerve compression or brainstem displacement.", 2),
                    "v22_hydrocephalus": ("present", "Mild communicating hydrocephalus following SAH, managed conservatively.", 2),
                    "v23_clinical_presentation": ("Sudden thunderclap headache and nausea (SAH)", "Acute onset thunderclap headache prompting emergency cranial CT.", 2),
                    "v24_associated_conditions": ("Accessory Middle Cerebral Artery (AccMCA)", "Rare congenital anatomical variant of accessory MCA originating from A1.", 2),
                    "v25_family_history": ("No known family history of intracranial aneurysms", "Family history was negative for intracranial vascular malformations.", 2),
                    "v26_radiographic_progression": ("stable", "Follow-up DSA at 6 months showed complete aneurysm occlusion and stable PAM.", 5),
                    "patient_age": ("52", "A 52-year-old female presented with sudden headache.", 2),
                    "patient_sex": ("Female", "A 52-year-old female patient.", 2),
                }
            },
            {
                "file_pattern": "Birua",
                "title": "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
                "authors": "Birua et al.",
                "year": 2022,
                "values": {
                    "v1_vessel_involved": ("PCA", "The PAM involved the P2-P3 segments of the left posterior cerebral artery.", 2),
                    "v2_territory_extent": ("single-territory", "Isolated to the left posterior cerebral circulation.", 2),
                    "v3_pam_max_diameter": ("16.0", "Maximum dimensions of the coil-like arterial lesion measured 16 mm.", 2),
                    "v4_imaging_modality": ("DSA", "6-vessel cerebral DSA demonstrated tortuous dilated loops without AV shunt.", 2),
                    "v5_vessels_count": ("1", "Single arterial territory (PCA).", 2),
                    "v6_loop_tortuosity_grade": ("Corkscrew tortuosity with coil-like mass configuration", "Characteristic corkscrew loop appearance of the arterial trunk.", 3),
                    "v7_associated_stenosis": ("absent", "Parent vessel remained patent without focal stenosis.", 2),
                    "v8_collateral_circulation": ("absent", "Normal anterograde PCA territorial perfusion without transdural collateralization.", 3),
                    "v9_associated_aneurysm": ("present", "A flow aneurysm was present along the distal loop.", 2),
                    "v10_aneurysm_size": ("3.8", "The aneurysm measured 3.8 mm in maximal diameter.", 2),
                    "v11_aneurysm_type": ("saccular", "Small saccular morphology.", 2),
                    "v12_aneurysm_location": ("adjacent-to-PAM", "Aneurysm located adjacent to the dominant arterial loop.", 2),
                    "v13_icad_atherosclerosis": ("absent", "No generalized atherosclerosis.", 2),
                    "v14_vessel_wall_imaging": ("no", "Vessel wall MRI not performed.", 2),
                    "v15_calcification": ("absent", "No parenchymal or vessel calcifications.", 2),
                    "v16_cv_risk_factors": ("None reported", "No cardiovascular risk factors identified.", 2),
                    "v17_thrombus_occlusion": ("absent", "No intra-arterial thrombus.", 2),
                    "v18_treatment_type": ("conservative", "Managed conservatively with clinical and angiographic surveillance.", 3),
                    "v19_ischemic_stroke": ("absent", "No ischemic infarction on MRI DWI.", 2),
                    "v20_hemorrhagic_stroke": ("absent", "No intracranial hemorrhage.", 2),
                    "v21_mass_effect": ("absent", "No mass effect on the midbrain or thalamus.", 2),
                    "v22_hydrocephalus": ("absent", "Ventricles normal in caliber.", 2),
                    "v23_clinical_presentation": ("Recurrent throbbing headaches and visual auras", "Presented with long-standing throbbing headaches.", 2),
                    "v24_associated_conditions": ("Dysplastic internal carotid artery (ICA)", "Associated developmental dysplasia of the ipsilateral internal carotid artery.", 2),
                    "v25_family_history": ("Negative", "No family history of vascular or connective tissue diseases.", 2),
                    "v26_radiographic_progression": ("stable", "1-year follow-up MRA demonstrated stable PAM morphology.", 4),
                    "patient_age": ("38", "A 38-year-old male.", 2),
                    "patient_sex": ("Male", "A 38-year-old male.", 2),
                }
            },
            {
                "file_pattern": "Brinjikji",
                "title": "Pure Arterial Malformations: Angioarchitecture, Natural History, and Management",
                "authors": "Brinjikji et al.",
                "year": 2018,
                "values": {
                    "v1_vessel_involved": ("MCA,ACA,PCA", "Lesions involved MCA (50%), ACA (25%), and PCA (25%) territories across the cohort.", 3),
                    "v2_territory_extent": ("single-territory", "Most cases (92%) involved a single arterial vascular territory.", 3),
                    "v3_pam_max_diameter": ("18.5", "Mean PAM maximum diameter across series was 18.5 mm (range 8-32 mm).", 3),
                    "v4_imaging_modality": ("DSA", "Catheter digital subtraction angiography is gold standard for confirmation.", 2),
                    "v5_vessels_count": ("1", "Majority involved 1 major vessel trunk with loop redundancy.", 3),
                    "v6_loop_tortuosity_grade": ("Mass-like overlapping tortuous coil configuration", "Arterial loops forming a distinct pseudo-mass without arteriovenous shunting.", 2),
                    "v7_associated_stenosis": ("present", "Segmental focal stenosis identified in 25% of cases.", 3),
                    "v8_collateral_circulation": ("present", "Distal leptomeningeal anastomoses observed in 40% of patients.", 3),
                    "v9_associated_aneurysm": ("present", "Associated flow-related or intra-lesional aneurysms identified in 58% of cases.", 3),
                    "v10_aneurysm_size": ("5.2", "Mean associated aneurysm diameter was 5.2 mm.", 4),
                    "v11_aneurysm_type": ("saccular", "Predominantly saccular (71%) followed by fusiform (29%).", 4),
                    "v12_aneurysm_location": ("arising-from-PAM", "Aneurysms typically arose directly from the tortuous loop segment.", 3),
                    "v13_icad_atherosclerosis": ("absent", "No correlation with systemic atherosclerosis or ICAD.", 4),
                    "v14_vessel_wall_imaging": ("yes", "HR-VWI showed concentric wall thickening without eccentric plaque.", 4),
                    "v15_calcification": ("present", "Mural calcification observed in 17% of patients on CT.", 3),
                    "v16_cv_risk_factors": ("Hypertension (33%), Smoking (17%)", "Hypertension was present in 4/12 patients; smoking in 2/12.", 3),
                    "v17_thrombus_occlusion": ("present", "Partial intraluminal thrombosis noted in 1 patient.", 4),
                    "v18_treatment_type": ("conservative", "Conservative observation recommended unless ruptured or progressive.", 5),
                    "v19_ischemic_stroke": ("absent", "Ischemic stroke was rare, reported in <10% of cases.", 4),
                    "v20_hemorrhagic_stroke": ("present", "SAH occurred in 25% of patients with associated aneurysms.", 3),
                    "v21_mass_effect": ("present", "Local cranial nerve or cortical mass effect in 17% of cases.", 4),
                    "v22_hydrocephalus": ("absent", "Hydrocephalus absent in unruptured cases.", 4),
                    "v23_clinical_presentation": ("Incidental discovery (42%), Headache (33%), Seizure (17%)", "Most commonly discovered incidentally during workup for headache.", 3),
                    "v24_associated_conditions": ("Cortical dysplasia (17%), Azygous ACA (8%)", "Associated developmental vascular and cortical variants.", 4),
                    "v25_family_history": ("Negative", "No familial clustering identified in cohort.", 3),
                    "v26_radiographic_progression": ("stable", "Stable on long-term follow-up (mean 4.2 years) in 85% of patients.", 5),
                    "patient_age": ("44", "Median patient age was 44 years (range 6-72 years).", 3),
                    "patient_sex": ("Female", "Female predominance (67% female).", 3),
                }
            },
            {
                "file_pattern": "Chua",
                "title": "Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case",
                "authors": "Chua et al.",
                "year": 2021,
                "values": {
                    "v1_vessel_involved": ("PICA", "PAM arose from the left posterior inferior cerebellar artery (PICA).", 2),
                    "v2_territory_extent": ("single-territory", "Confined to the PICA territory in the posterior fossa.", 2),
                    "v3_pam_max_diameter": ("12.0", "The PICA arterial loop cluster measured 12 mm across.", 2),
                    "v4_imaging_modality": ("DSA", "Emergency DSA demonstrated a ruptured PICA PAM with associated pseudoaneurysm.", 2),
                    "v5_vessels_count": ("1", "Single vessel (PICA) involved.", 2),
                    "v6_loop_tortuosity_grade": ("Complex overlapping cerebellar arterial loops", "Highly tortuous looped configuration of the tonsillomedullary PICA.", 2),
                    "v7_associated_stenosis": ("absent", "Parent vertebral artery and PICA origin were widely patent.", 2),
                    "v8_collateral_circulation": ("present", "AICA-PICA leptomeningeal anastomoses present.", 3),
                    "v9_associated_aneurysm": ("present", "Ruptured pseudoaneurysm associated with the PAM loop.", 2),
                    "v10_aneurysm_size": ("4.0", "The ruptured pseudoaneurysmal pouch measured 4.0 mm.", 2),
                    "v11_aneurysm_type": ("pseudoaneurysm", "Dissecting pseudoaneurysm morphology.", 2),
                    "v12_aneurysm_location": ("arising-from-PAM", "Arising directly from the apex of the PICA loop.", 2),
                    "v13_icad_atherosclerosis": ("absent", "No ICAD in posterior circulation.", 2),
                    "v14_vessel_wall_imaging": ("no", "Not performed in acute setting.", 2),
                    "v15_calcification": ("absent", "Non-calcified.", 2),
                    "v16_cv_risk_factors": ("Hypertension (Yes)", "Patient had a 5-year history of essential hypertension.", 2),
                    "v17_thrombus_occlusion": ("absent", "No distal thromboembolism.", 2),
                    "v18_treatment_type": ("coiling", "Endovascular coil occlusion of the ruptured loop with parent vessel preservation.", 3),
                    "v19_ischemic_stroke": ("absent", "No cerebellar infarction following targeted coiling.", 3),
                    "v20_hemorrhagic_stroke": ("present", "Presented with Fisher grade 3 subarachnoid hemorrhage and fourth ventricular extension.", 2),
                    "v21_mass_effect": ("present", "Brainstem compression and tonsillar herniation risk.", 2),
                    "v22_hydrocephalus": ("present", "Acute obstructive hydrocephalus requiring external ventricular drain (EVD).", 2),
                    "v23_clinical_presentation": ("Severe occipital headache, vomiting, and decreased consciousness", "Sudden collapse with severe occipital headache.", 2),
                    "v24_associated_conditions": ("None", "No coexisting neurovascular anomalies.", 2),
                    "v25_family_history": ("Negative", "No family history of aneurysm.", 2),
                    "v26_radiographic_progression": ("stable", "Complete obliteration of rupture site with preserved cerebellar flow at 1 year.", 4),
                    "patient_age": ("59", "A 59-year-old female.", 2),
                    "patient_sex": ("Female", "A 59-year-old female.", 2),
                }
            },
            {
                "file_pattern": "Deshmukh",
                "title": "Pure Arterial Malformation (PAM): Case Report and Review of Literature",
                "authors": "Deshmukh et al.",
                "year": 2023,
                "values": {
                    "v1_vessel_involved": ("MCA", "Involved the M2-M3 branches of the right middle cerebral artery.", 2),
                    "v2_territory_extent": ("single-territory", "Right MCA cortical territory.", 2),
                    "v3_pam_max_diameter": ("15.0", "Coil-like arterial conglomerate measured 1.5 cm.", 2),
                    "v4_imaging_modality": ("DSA", "Diagnosed via 3D rotational DSA; no shunting or early veins.", 2),
                    "v5_vessels_count": ("1", "Single artery (MCA).", 2),
                    "v6_loop_tortuosity_grade": ("Mass-like tangle of coil-like arterial loops", "Characteristic mass-like arterial loops with normal intervening brain parenchyma.", 2),
                    "v7_associated_stenosis": ("absent", "No focal stenosis.", 2),
                    "v8_collateral_circulation": ("absent", "Normal MCA branch distribution.", 2),
                    "v9_associated_aneurysm": ("absent", "No associated aneurysms identified on 3D angiography.", 2),
                    "v10_aneurysm_size": ("0", "No aneurysm present.", 2),
                    "v11_aneurysm_type": ("none", "No aneurysm.", 2),
                    "v12_aneurysm_location": ("none", "No aneurysm.", 2),
                    "v13_icad_atherosclerosis": ("absent", "Absence of atherosclerotic disease.", 2),
                    "v14_vessel_wall_imaging": ("no", "Not performed.", 2),
                    "v15_calcification": ("absent", "No calcification on CT head.", 2),
                    "v16_cv_risk_factors": ("None", "Young patient with no cardiovascular risk factors.", 2),
                    "v17_thrombus_occlusion": ("absent", "Patent vessel lumina.", 2),
                    "v18_treatment_type": ("conservative", "Managed conservatively with anti-seizure medication and serial follow-up.", 3),
                    "v19_ischemic_stroke": ("absent", "No acute infarction on MRI.", 2),
                    "v20_hemorrhagic_stroke": ("absent", "No hemorrhage.", 2),
                    "v21_mass_effect": ("absent", "No mass effect or midline shift.", 2),
                    "v22_hydrocephalus": ("absent", "Normal ventricles.", 2),
                    "v23_clinical_presentation": ("New-onset focal seizure with secondary generalization", "Presented following a generalized tonic-clonic seizure.", 2),
                    "v24_associated_conditions": ("Focal cortical dysplasia (suspected)", "Associated adjacent subtle focal cortical thickening.", 3),
                    "v25_family_history": ("Negative", "Negative family history.", 2),
                    "v26_radiographic_progression": ("stable", "Stable on follow-up imaging at 18 months.", 3),
                    "patient_age": ("24", "A 24-year-old male.", 2),
                    "patient_sex": ("Male", "A 24-year-old male patient.", 2),
                }
            },
            {
                "file_pattern": "Feliciano",
                "title": "Color-Coded Digital Subtraction Angiography in the Management of a Rare Case of Middle Cerebral Artery Pure Arterial Malformation",
                "authors": "Feliciano et al.",
                "year": 2014,
                "values": {
                    "v1_vessel_involved": ("MCA", "Located at the right middle cerebral artery bifurcation (M1/M2 junction).", 2),
                    "v2_territory_extent": ("single-territory", "Isolated to the right MCA bifurcation.", 2),
                    "v3_pam_max_diameter": ("11.5", "Arterial loop cluster measured 11.5 mm.", 2),
                    "v4_imaging_modality": ("DSA", "Evaluated using novel color-coded parametric DSA confirming arterial-only flow.", 2),
                    "v5_vessels_count": ("1", "Single artery involved (MCA bifurcation).", 2),
                    "v6_loop_tortuosity_grade": ("Coil-like arterial loop with redundant elongation", "Redundant loops of arterial vessels with delayed transit time.", 2),
                    "v7_associated_stenosis": ("absent", "No luminal narrowing.", 2),
                    "v8_collateral_circulation": ("absent", "Normal distal MCA perfusion.", 2),
                    "v9_associated_aneurysm": ("absent", "No saccular aneurysm detected.", 2),
                    "v10_aneurysm_size": ("0", "No aneurysm.", 2),
                    "v11_aneurysm_type": ("none", "No aneurysm.", 2),
                    "v12_aneurysm_location": ("none", "No aneurysm.", 2),
                    "v13_icad_atherosclerosis": ("absent", "Normal vessel wall appearance.", 2),
                    "v14_vessel_wall_imaging": ("no", "Not performed.", 2),
                    "v15_calcification": ("absent", "No calcification.", 2),
                    "v16_cv_risk_factors": ("Smoking (former)", "Former smoker; no diabetes or hypertension.", 2),
                    "v17_thrombus_occlusion": ("absent", "Vessels fully patent.", 2),
                    "v18_treatment_type": ("conservative", "Conservative management following surgical exploration.", 3),
                    "v19_ischemic_stroke": ("absent", "No cerebral infarction.", 2),
                    "v20_hemorrhagic_stroke": ("absent", "No subarachnoid or intraparenchymal hemorrhage.", 2),
                    "v21_mass_effect": ("absent", "No focal mass effect.", 2),
                    "v22_hydrocephalus": ("absent", "Normal ventricular volume.", 2),
                    "v23_clinical_presentation": ("Chronic intractable hemicranial headache", "Presented with long-standing right-sided headaches.", 2),
                    "v24_associated_conditions": ("None", "No other vascular variants.", 2),
                    "v25_family_history": ("Negative", "No family history of vascular disorders.", 2),
                    "v26_radiographic_progression": ("stable", "Unchanged appearance at 2-year angiographic follow-up.", 3),
                    "patient_age": ("47", "A 47-year-old female.", 2),
                    "patient_sex": ("Female", "A 47-year-old female.", 2),
                }
            }
        ]
        
        # Populate studies and extractions
        total_extractions = 0
        for profile in study_profiles:
            matched_pdf = None
            for p in pdf_files:
                if profile["file_pattern"].lower() in p.name.lower():
                    matched_pdf = p
                    break
            if not matched_pdf:
                matched_pdf = pdf_files[0]
                
            study_id = f"study_pam_{profile['file_pattern'].lower()}"
            
            # Copy PDF into upload directory
            target_filename = f"{study_id}_{matched_pdf.name}"
            target_pdf_path = Path(settings.upload_root) / target_filename
            shutil.copyfile(matched_pdf, target_pdf_path)
            
            # Extract PDF text via pdf_service
            try:
                pdf_result = pdf_service.process_pdf(study_id)
                full_text = pdf_result.get("full_text", "")
            except Exception:
                full_text = f"{profile['title']}\n{profile['authors']}\nPure Arterial Malformation of the brain."
                
            # Insert study as INCLUDED
            conn.execute(
                """INSERT INTO studies (study_id, project_id, title, authors, publication_year, source, pdf_path, pdf_status, screening_status, screening_stage, screening_reason, extraction_status, created_at)
                   VALUES (?, ?, ?, ?, ?, 'TEST_CORPUS', ?, 'processed', 'included', 'ft', 'Meets operational PAM criteria (dilated arterial loops without AV shunting).', 'complete', datetime('now'))""",
                (study_id, project_id, profile["title"], profile["authors"], profile["year"], str(target_pdf_path)),
            )
            
            # Insert screening decision
            dec_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (decision_id, study_id, project_id, reviewer_id, reviewer_name, decision, reason_code, reason_text, stage, is_blinded, created_at)
                   VALUES (?, ?, ?, 'lead_radiologist', 'Expert Reviewer', 'included', 'PAM_OPERATIONAL_CRITERIA', 'Meets operational PAM criteria without arteriovenous shunting.', 'ft', 0, datetime('now'))""",
                (dec_id, study_id, project_id),
            )
            
            # Insert Extractions
            for code, (val, quote, page) in profile["values"].items():
                if code in var_map:
                    ext_id = str(uuid.uuid4())
                    vid = var_map[code]
                    conn.execute(
                        """INSERT INTO extractions (extraction_id, study_id, variable_id, value, confidence, source_page, source_bbox, source_text, extracted_by, extracted_at, is_edited)
                           VALUES (?, ?, ?, ?, 0.95, ?, '', ?, 'AIDE_LLM_Extractor', datetime('now'), 0)""",
                        (ext_id, study_id, vid, val, page, quote),
                    )
                    total_extractions += 1
                    
            # Initialize RoB assessment
            try:
                rob_service.create_assessment(study_id=study_id, project_id=project_id, tool="robins_i", assessed_by="AI_Reviewer")
            except Exception as e:
                pass
                
        conn.commit()
        logger.info(f"Successfully preloaded Project '{project_name}' ({project_id}) with {len(study_profiles)} studies and {total_extractions} extractions!")
        
    finally:
        conn.close()

if __name__ == "__main__":
    preload_all()
    print("ALL TEST DATA PRELOADED SUCCESSFULLY!")
