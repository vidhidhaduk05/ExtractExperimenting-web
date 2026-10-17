"""Seed script: Pure Arterial Malformations of the Brain (PAM) Systematic Review.

Implements the protocol from TEST PROTOCOL.docx:
- Project creation with full PICO framework
- 30-variable extraction codebook across 5 research questions + context
- Custom exclusion taxonomy
- Seed/Fetch of PubMed literature
"""
from __future__ import annotations
import json
import os
import sys
import uuid
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import get_connection, init_db
from services import pubmed_service

PROJECT_ID = "pam_review_2026"
PROJECT_NAME = "Pure Arterial Malformations of the Brain (PAM)"
PROJECT_DESC = "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes"

SEARCH_QUERY = '("pure arterial malformation"[tiab] OR "pure arterial malformations"[tiab] OR "pure pial arterial malformation"[tiab] OR "pial arterial malformation"[tiab] OR "pure artery malformation"[tiab] OR "pure artery malformations"[tiab] OR "pure pial artery malformation"[tiab] OR "pial artery malformation"[tiab] OR "pure arterial anomalies"[tiab] OR "pure arterial anomaly"[tiab] OR ("arterial malformation*"[tiab] AND ("intracranial"[tiab] OR "cerebral"[tiab])))'

VARIABLES = [
    # ── Q1: Angioarchitecture ──
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V1_PAM_location_anatomic",
        "field_type": "categorical",
        "allowed_values": "cortical, subcortical, deep_white_matter, basal_ganglia, thalamus, brainstem, cerebellum, intraventricular, other, NR",
        "description": "Anatomic location of the PAM coil-like mass lesion",
        "order_index": 1,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V2_Vascular_territory",
        "field_type": "categorical",
        "allowed_values": "anterior_circulation_MCA, anterior_circulation_ACA, anterior_circulation_ICA, posterior_circulation_PCA, posterior_circulation_SCA, posterior_circulation_AICA, posterior_circulation_PICA, posterior_circulation_basilar, posterior_circulation_vertebral, anterior_choroidal, multi_territory, other, NR",
        "description": "Arterial territory bearing the PAM",
        "order_index": 2,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V3_Vessel_count_in_PAM",
        "field_type": "categorical",
        "allowed_values": "single_vessel, two_vessels, three_or_more_vessels, NR",
        "description": "Number of distinct arteries participating in the PAM coil mass",
        "order_index": 3,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V4_Dominant_feeding_artery",
        "field_type": "text",
        "allowed_values": "",
        "description": "Primary/main arterial feeder supplying the PAM",
        "order_index": 4,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V5_All_feeding_vessels",
        "field_type": "text",
        "allowed_values": "",
        "description": "All identifiable arterial inputs to the lesion",
        "order_index": 5,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V6_Draining_arteries_efferent",
        "field_type": "text",
        "allowed_values": "",
        "description": "Efferent arteries exiting the PAM coil mass (no veins)",
        "order_index": 6,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V7_Bilateral_or_multiple_PAMs",
        "field_type": "categorical",
        "allowed_values": "single_unilateral, bilateral, multiple_separate_PAMs, NR",
        "description": "Presence of separate distinct PAM masses in different locations",
        "order_index": 7,
    },
    {
        "section": "Q1 - Angioarchitecture",
        "name": "V8_Collateral_circulation",
        "field_type": "categorical",
        "allowed_values": "present, absent, NR",
        "description": "Ectatic collateral circulation supplying the PAM territory",
        "order_index": 8,
    },

    # ── Q2: Aneurysm Association ──
    {
        "section": "Q2 - Aneurysm Association",
        "name": "V9_Aneurysm_associated",
        "field_type": "categorical",
        "allowed_values": "present, absent, NR",
        "description": "Presence of aneurysm arising from or adjacent to PAM",
        "order_index": 9,
    },
    {
        "section": "Q2 - Aneurysm Association",
        "name": "V10_Aneurysm_size_mm",
        "field_type": "number",
        "allowed_values": "",
        "range_min": 0.5,
        "range_max": 50.0,
        "description": "Maximum diameter of associated aneurysm in millimeters",
        "order_index": 10,
    },
    {
        "section": "Q2 - Aneurysm Association",
        "name": "V11_Aneurysm_morphologic_type",
        "field_type": "categorical",
        "allowed_values": "saccular, fusiform, dissecting, blister_like, pseudoaneurysm, dysplastic, none, NR",
        "description": "Morphological type of associated aneurysm",
        "order_index": 11,
    },
    {
        "section": "Q2 - Aneurysm Association",
        "name": "V12_Aneurysm_location_relative_to_PAM",
        "field_type": "categorical",
        "allowed_values": "arising_from_PAM, adjacent_to_PAM, proximal_to_PAM, distal_to_PAM, nearby_bifurcation, separate_from_PAM, none, NR",
        "description": "Spatial relationship between aneurysm and PAM coil",
        "order_index": 12,
    },

    # ── Q3: Atherosclerosis, Vessel Wall, Risk Factors ──
    {
        "section": "Q3 - Atherosclerosis & Risk Factors",
        "name": "V13_Atherosclerosis_ICAD_associated",
        "field_type": "categorical",
        "allowed_values": "present, absent, NR",
        "description": "Evidence of intracranial atherosclerosis in PAM-bearing vessel or systemically",
        "order_index": 13,
    },
    {
        "section": "Q3 - Atherosclerosis & Risk Factors",
        "name": "V14_Vessel_wall_imaging_VWI",
        "field_type": "categorical",
        "allowed_values": "performed_with_enhancement, performed_without_enhancement, not_performed, NR",
        "description": "High-resolution MR vessel wall imaging performed specifically on PAM",
        "order_index": 14,
    },
    {
        "section": "Q3 - Atherosclerosis & Risk Factors",
        "name": "V15_Calcification_within_PAM",
        "field_type": "categorical",
        "allowed_values": "present, absent, NR",
        "description": "Arterial wall calcification within the PAM mass itself",
        "order_index": 15,
    },
    {
        "section": "Q3 - Atherosclerosis & Risk Factors",
        "name": "V16_Cardiovascular_risk_factors",
        "field_type": "text",
        "allowed_values": "",
        "description": "Hypertension, smoking, diabetes, hyperlipidemia status",
        "order_index": 16,
    },
    {
        "section": "Q3 - Atherosclerosis & Risk Factors",
        "name": "V17_Arterial_thrombus_occlusion",
        "field_type": "categorical",
        "allowed_values": "intraluminal_within_PAM, parent_vessel_occlusion, aneurysm_thrombosis, distal_embolic, absent, NR",
        "description": "Thrombosis or occlusion within PAM loops or parent vessel",
        "order_index": 17,
    },

    # ── Q4: Treatment ──
    {
        "section": "Q4 - Treatment & Management",
        "name": "V18_Treatment_modality",
        "field_type": "categorical",
        "allowed_values": "conservative_observation, surgical_clipping, surgical_bypass, surgical_decompression, surgical_resection, endovascular_coiling, endovascular_flow_diverter, endovascular_embolization, hybrid_multimodal, antiplatelet_anticoagulation_only, other, NR",
        "description": "Treatment performed for PAM or associated aneurysm",
        "order_index": 18,
    },

    # ── Q5: Stroke Outcomes ──
    {
        "section": "Q5 - Stroke Outcomes",
        "name": "V19_Ischemic_stroke_in_territory",
        "field_type": "categorical",
        "allowed_values": "present, absent, NR",
        "description": "Infarction or acute ischemia in the territory supplied by PAM-bearing vessel",
        "order_index": 19,
    },
    {
        "section": "Q5 - Stroke Outcomes",
        "name": "V20_Hemorrhagic_stroke_attributable",
        "field_type": "categorical",
        "allowed_values": "present_SAH, present_IPH, present_IVH, present_combined_SAH_IVH, absent, uncertain, NR",
        "description": "Subarachnoid or parenchymal hemorrhage attributable to PAM or aneurysm",
        "order_index": 20,
    },
    {
        "section": "Q5 - Stroke Outcomes",
        "name": "V21_Mass_effect_compression",
        "field_type": "categorical",
        "allowed_values": "present_optic_chiasm, present_brainstem, present_cranial_nerve, present_cortex, absent, NR",
        "description": "Compression of adjacent neural structures by the PAM mass",
        "order_index": 21,
    },
    {
        "section": "Q5 - Stroke Outcomes",
        "name": "V22_Hydrocephalus_associated",
        "field_type": "categorical",
        "allowed_values": "present_obstructive, present_communicating, absent, NR",
        "description": "Hydrocephalus associated with PAM mass or complication",
        "order_index": 22,
    },

    # ── Context Variables & Demographics ──
    {
        "section": "Context & Natural History",
        "name": "V23_Clinical_presentation",
        "field_type": "categorical",
        "allowed_values": "incidental, headache, seizure, cranial_nerve_palsy, focal_neurological_deficit, SAH_rupture, altered_consciousness, visual_loss, other, NR",
        "description": "Initial presentation leading to PAM discovery",
        "order_index": 23,
    },
    {
        "section": "Context & Natural History",
        "name": "V24_Associated_conditions_variants",
        "field_type": "text",
        "allowed_values": "",
        "description": "Moyamoya, cortical dysplasia, ICA agenesis, fetal PCA, head trauma history, etc.",
        "order_index": 24,
    },
    {
        "section": "Context & Natural History",
        "name": "V25_Family_history_genetics",
        "field_type": "categorical",
        "allowed_values": "positive_aneurysm, positive_connective_tissue_disease, positive_genetic_syndrome, negative, NR",
        "description": "Familial vascular disease or genetic predisposition",
        "order_index": 25,
    },
    {
        "section": "Context & Natural History",
        "name": "V26_Radiographic_progression",
        "field_type": "categorical",
        "allowed_values": "stable, enlarged, new_aneurysm, new_calcification, resolved, NR",
        "description": "Follow-up imaging change over time",
        "order_index": 26,
    },
    {
        "section": "Demographics & Outcomes",
        "name": "Demographics_Age",
        "field_type": "number",
        "allowed_values": "",
        "range_min": 0,
        "range_max": 100,
        "description": "Patient age in years at presentation",
        "order_index": 27,
    },
    {
        "section": "Demographics & Outcomes",
        "name": "Demographics_Sex",
        "field_type": "categorical",
        "allowed_values": "male, female, NR",
        "description": "Biological sex of the patient",
        "order_index": 28,
    },
    {
        "section": "Demographics & Outcomes",
        "name": "Follow_up_duration_months",
        "field_type": "number",
        "allowed_values": "",
        "range_min": 0,
        "range_max": 240,
        "description": "Total clinical and/or radiographic follow-up in months",
        "order_index": 29,
    },
    {
        "section": "Demographics & Outcomes",
        "name": "Outcome_mRS_or_symptom_course",
        "field_type": "categorical",
        "allowed_values": "favorable_mRS_0_2, poor_mRS_3_6, symptom_improved, symptom_stable, symptom_worsened, deceased, NR",
        "description": "Functional outcome at latest follow-up",
        "order_index": 30,
    },
]

EXCLUSION_REASONS = [
    {"code": "wrong_lesion_avm", "label": "Wrong lesion: AVM / AV shunting / early draining vein"},
    {"code": "wrong_lesion_davf", "label": "Wrong lesion: Dural arteriovenous fistula (dAVF)"},
    {"code": "wrong_lesion_dva", "label": "Wrong lesion: Developmental venous anomaly (DVA)"},
    {"code": "wrong_lesion_cavernoma", "label": "Wrong lesion: Cavernous malformation"},
    {"code": "wrong_lesion_dolichoectasia", "label": "Wrong lesion: Dolichoectasia (uniform ectasia without mass loop)"},
    {"code": "wrong_lesion_rete_mirabile", "label": "Wrong lesion: Rete mirabile / interconnecting arterial network"},
    {"code": "no_patient_data", "label": "No original patient-level data (review / editorial / classification)"},
    {"code": "duplicate_cohort", "label": "Duplicate population / shared institutional cohort"},
    {"code": "conference_abstract_no_data", "label": "Conference abstract without extractable patient-level data"},
    {"code": "corrigendum_erratum", "label": "Corrigendum or erratum"},
    {"code": "other", "label": "Other (specify in notes)"},
]


def seed_pam():
    init_db()
    conn = get_connection()
    try:
        print(f"\n[1/4] Seeding Project '{PROJECT_NAME}'...")
        pico_obj = {
            "population": "Patients with intracranial pure arterial malformations (PAM) of the brain",
            "index_test": "Angiography (DSA, CTA, MRA, VWI-MRI)",
            "comparator": "None / Conservative vs Interventional (Surgery / Endovascular)",
            "outcome": "Angioarchitecture, Aneurysm association, Stroke outcomes, Treatment flow status, Clinical recovery",
            "study_design": "Observational studies (case reports, case series, cohort)",
        }
        search_strings = {
            "pubmed": SEARCH_QUERY,
            "ovid_medline": '(pure arterial malformation* OR pure pial arterial malformation* OR pial arterial malformation* OR pure artery malformation* OR pure pial artery malformation* OR pial artery malformation* OR pure arterial anomal* OR (arterial malformation* AND (intracranial OR cerebral))).ti,ab.',
            "scopus": 'TITLE-ABS-KEY("pure arterial malformation*" OR "pure pial arterial malformation*" OR "pial arterial malformation*" OR "pure artery malformation*" OR "pure pial artery malformation*" OR "pial artery malformation*" OR "pure arterial anomal*" OR ("arterial malformation*" AND (intracranial OR cerebral)))',
            "web_of_science": 'TS=("pure arterial malformation*" OR "pure pial arterial malformation*" OR "pial arterial malformation*" OR "pure artery malformation*" OR "pure pial artery malformation*" OR "pial artery malformation*" OR "pure arterial anomal*") OR (TS="arterial malformation*" AND TS=(intracranial OR cerebral))',
        }

        existing = conn.execute("SELECT project_id FROM projects WHERE project_id = ?", (PROJECT_ID,)).fetchone()
        if existing:
            print(f"Project '{PROJECT_ID}' already exists, updating...")
            conn.execute(
                """UPDATE projects SET
                   name = ?, description = ?, pico_json = ?,
                   hypothesis = ?, research_question = ?,
                   search_strings_json = ?, exclusion_reasons_json = ?
                   WHERE project_id = ?""",
                (
                    PROJECT_NAME,
                    PROJECT_DESC,
                    json.dumps(pico_obj),
                    "PAMs are congenital mass-like arterial coil loops associated with high rates of flow-related aneurysms and distinct ischemic/hemorrhagic stroke risks.",
                    "What are the angioarchitectural characteristics, aneurysm association rates, and stroke outcomes in patients with intracranial pure arterial malformations?",
                    json.dumps(search_strings),
                    json.dumps(EXCLUSION_REASONS),
                    PROJECT_ID,
                ),
            )
        else:
            conn.execute(
                """INSERT INTO projects (
                   project_id, name, description, pico_json,
                   hypothesis, research_question, search_strings_json, exclusion_reasons_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    PROJECT_ID,
                    PROJECT_NAME,
                    PROJECT_DESC,
                    json.dumps(pico_obj),
                    "PAMs are congenital mass-like arterial coil loops associated with high rates of flow-related aneurysms and distinct ischemic/hemorrhagic stroke risks.",
                    "What are the angioarchitectural characteristics, aneurysm association rates, and stroke outcomes in patients with intracranial pure arterial malformations?",
                    json.dumps(search_strings),
                    json.dumps(EXCLUSION_REASONS),
                ),
            )

        print(f"\n[2/4] Seeding 30 Protocol Variables...")
        # Delete existing variables for this project to re-seed cleanly
        conn.execute("DELETE FROM variables WHERE project_id = ?", (PROJECT_ID,))
        for var in VARIABLES:
            var_id = f"var_{PROJECT_ID}_{var['name']}"
            conn.execute(
                """INSERT INTO variables (
                   variable_id, project_id, section, name, field_type,
                   allowed_values, range_min, range_max, description, order_index, is_base
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                (
                    var_id,
                    PROJECT_ID,
                    var["section"],
                    var["name"],
                    var["field_type"],
                    var.get("allowed_values", ""),
                    var.get("range_min"),
                    var.get("range_max"),
                    var["description"],
                    var["order_index"],
                ),
            )
        conn.commit()
        print(f"Successfully seeded {len(VARIABLES)} variables.")

        print(f"\n[3/4] Fetching and Importing PubMed Search Results for PAM...")
        results = pubmed_service.batch_search(SEARCH_QUERY, max_results=65)
        print(f"Retrieved {len(results)} records from PubMed.")

        imported_count = 0
        skipped_count = 0
        for r in results:
            pmid = r.get("pmid")
            existing_study = conn.execute(
                "SELECT study_id FROM studies WHERE project_id = ? AND pmid = ?",
                (PROJECT_ID, pmid),
            ).fetchone()
            if existing_study:
                skipped_count += 1
                continue

            study_id = f"study_{PROJECT_ID}_{pmid}" if pmid else f"study_{uuid.uuid4().hex[:8]}"
            conn.execute(
                """INSERT INTO studies (
                   study_id, project_id, title, authors, publication_year,
                   journal, doi, pmid, source, study_design, screening_status, screening_stage
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'ta')""",
                (
                    study_id,
                    PROJECT_ID,
                    r.get("title", ""),
                    r.get("authors", ""),
                    r.get("publication_year"),
                    r.get("journal", ""),
                    r.get("doi", ""),
                    pmid,
                    "PubMed",
                    "case report / series",
                ),
            )
            imported_count += 1

        conn.commit()
        print(f"Imported {imported_count} studies (Skipped {skipped_count} existing).")

        print(f"\n[4/4] Seed Complete!")
        print(f"  Project: {PROJECT_NAME} (ID: {PROJECT_ID})")
        print(f"  Variables: {len(VARIABLES)} items in codebook")
        print(f"  Studies ready for screening: {imported_count}")
        print("=" * 72)
    finally:
        conn.close()


if __name__ == "__main__":
    seed_pam()
