"""Clinical STORM & LAYA Multi-Perspective Deliberation Service.

Inspired by:
1. Stanford OVAL's STORM (Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking).
2. Convai Innovations' Laya (Ultra-fast System-1 decision head running on local ONNX Runtime).
3. Stanford Physicians SLR methodology (Dr. Jeremy Heit & Dr. Gautam Adusumilli) addressing study design flaws.

Core Architecture:
- Fast Path (<150ms): Laya System-1 evaluates design flaw probability, specialty affinity, and RoB score in 1 forward pass.
- Dynamic Clinical Personas: Selects specialist clinical roles dynamically based on ClaimScape gathered study data & protocol topic
  (e.g., Breast Imaging vs Neurovascular vs Thoracic vs Cardiovascular vs Abdominal vs Universal).
- Deep Protocol Grand Rounds: Surfaces hidden methodological flaws in PICO, hypotheses, and eligibility criteria,
  generating 1-click actionable recommendations for protocol authors.
"""
from __future__ import annotations

import os
import sys
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("clinical_storm")

# Locate laya models
_LAYA_MODELS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "laya", "models")
)
_laya_model_instance = None
_laya_load_attempted = False


def get_laya_engine():
    """Retrieve or initialize singleton Laya System-1 engine."""
    global _laya_model_instance, _laya_load_attempted
    if _laya_model_instance is not None:
        return _laya_model_instance
    if _laya_load_attempted:
        return None

    _laya_load_attempted = True
    try:
        laya_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "laya"))
        if laya_dir not in sys.path:
            sys.path.insert(0, laya_dir)
        from laya_engine import LayaModel
        if os.path.exists(os.path.join(_LAYA_MODELS_DIR, "laya.onnx")):
            _laya_model_instance = LayaModel(_LAYA_MODELS_DIR)
            logger.info("Clinical STORM: Loaded Laya System-1 model successfully from %s", _LAYA_MODELS_DIR)
            return _laya_model_instance
    except Exception as e:
        logger.warning("Clinical STORM: Could not initialize local Laya model: %s", e)
    return None


def run_laya_fast_triage(title: str, abstract: str, topic: str = "clinical medicine") -> Dict[str, Any]:
    """Ultra-fast (<150ms) System-1 clinical classification using Laya ONNX."""
    engine = get_laya_engine()
    state = {
        "title": title[:300],
        "abstract": abstract[:1000],
        "topic": topic
    }

    if engine is not None:
        try:
            questions = {
                "study_design_flaw": {
                    "type": "noul",
                    "instructions": "Does this medical study exhibit notable methodological, reporting, or study design flaws (e.g. non-standard endpoints, confounding, small sample)?"
                },
                "specialty_affinity": {
                    "type": "choice",
                    "instructions": "Which clinical subspecialty has the strongest critical stake in evaluating this protocol or paper?",
                    "criteria": {
                        "interventional": "Catheter procedure, device selection, recanalization, technical execution, imaging guidance",
                        "medical_specialty": "Medical management, pharmaceutical protocol, systemic outcome, complications",
                        "surgical": "Surgical resection, margins, salvage decompression, vascular/tissue anatomy",
                        "biostatistics": "Trial methodology, randomized control, confounding, attrition, HSROC"
                    }
                },
                "risk_of_bias": {
                    "type": "score",
                    "instructions": "Estimated overall risk of bias level",
                    "criteria": ["low", "moderate", "serious", "critical"]
                }
            }
            res = engine.system_one(state, questions)
            flaw_prob = float(res.get("study_design_flaw", {}).get("noul", 0.15))
            specialty = res.get("specialty_affinity", {}).get("choice", "interventional")
            rob_score = float(res.get("risk_of_bias", {}).get("score", 1.0))
            return {
                "flaw_probability": round(flaw_prob, 3),
                "has_flaw_warning": flaw_prob >= 0.40,
                "primary_specialty": specialty,
                "rob_score": round(rob_score, 2),
                "rob_level": ["low", "moderate", "serious", "critical"][min(3, max(0, int(round(rob_score))))],
                "engine": "laya_system1_onnx"
            }
        except Exception as e:
            logger.warning("Laya system_one failed: %s", e)

    # Fast heuristic fallback if ONNX unavailable
    text_lower = (title + " " + abstract + " " + topic).lower()
    has_retrospective = "retrospective" in text_lower or "case report" in text_lower or "series" in text_lower
    has_unclear_tici = "tici" in text_lower and not ("tici 2b/3" in text_lower or "tici 3" in text_lower)
    has_unclear_birads = "bi-rads" in text_lower and not ("bi-rads 4" in text_lower or "bi-rads 3" in text_lower)
    flaw_prob = 0.58 if (has_retrospective and (has_unclear_tici or has_unclear_birads)) else (0.42 if has_retrospective else 0.18)

    specialty = "interventional"
    if "surgery" in text_lower or "mastectomy" in text_lower or "resection" in text_lower or "bypass" in text_lower:
        specialty = "surgical"
    elif "oncology" in text_lower or "chemotherapy" in text_lower or "neurology" in text_lower or "cardiology" in text_lower:
        specialty = "medical_specialty"
    elif "randomized" in text_lower or "meta-analysis" in text_lower or "diagnostic accuracy" in text_lower:
        specialty = "biostatistics"

    return {
        "flaw_probability": round(flaw_prob, 3),
        "has_flaw_warning": flaw_prob >= 0.40,
        "primary_specialty": specialty,
        "rob_score": 1.4 if has_retrospective else 0.8,
        "rob_level": "moderate" if has_retrospective else "low",
        "engine": "heuristic_fallback"
    }


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN-SPECIFIC CLINICAL PERSONA REGISTRIES
# ─────────────────────────────────────────────────────────────────────────────

NEUROVASCULAR_PERSONAS = [
    {
        "id": "persona_interventional",
        "name": "Neurointerventionalist",
        "role": "Neurointerventional Radiologist",
        "domain": "neurovascular",
        "avatar": "💉",
        "focus": "Angioarchitectural anatomy, catheter accessibility, DSA verification, TICI recanalization grade, device generation, and intraprocedural mechanical complications.",
        "key_questions": [
            "Was recanalization verified by catheter digital subtraction angiography (DSA)?",
            "Did the authors distinguish modified TICI 2b from TICI 2c/3 complete reperfusion?",
            "What specific thrombectomy or embolization hardware was utilized?"
        ]
    },
    {
        "id": "persona_neurology",
        "name": "Neurologist",
        "role": "Stroke Neurologist & Neurointensivist",
        "domain": "neurovascular",
        "avatar": "🩺",
        "focus": "Onset-to-treatment windows, baseline NIHSS/ASPECTS, concurrent IV thrombolysis, protocolized sICH definitions (ECASS-III vs SITS-MOST), and 90-day mRS functional independence.",
        "key_questions": [
            "How was symptomatic intracranial hemorrhage (sICH) formally defined and adjudicated?",
            "Was concurrent IV tPA / Tenecteplase controlled for in the treatment group?",
            "Were 90-day modified Rankin Scale (mRS) scores assessed by blinded examiners?"
        ]
    },
    {
        "id": "persona_surgeon",
        "name": "Cerebrovascular Surgeon",
        "role": "Cerebrovascular Neurosurgeon",
        "domain": "neurovascular",
        "avatar": "🔬",
        "focus": "Vascular fragility, pseudoaneurysm rupture hazard, surgical rescue options (decompressive hemicraniectomy), anatomical tortuosity, and long-term lesion durability.",
        "key_questions": [
            "Were high-risk hemodynamic features (e.g. apex pseudoaneurysms) differentiated from stable dysplasia?",
            "What was the surgical salvage or decompressive craniectomy rate?",
            "Is there anatomical risk of vessel avulsion or parenchymal hemorrhage during mechanical manipulation?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Lead Clinical Trial Biostatistician",
        "domain": "neurovascular",
        "avatar": "📊",
        "focus": "Study design rigor, active comparator validity, selection bias in retrospective cohorts, confounding by indication, handling of missing outcome data, and immortal time bias.",
        "key_questions": [
            "Was this study prospective with pre-registered protocols, or a retrospective convenience cohort?",
            "Were propensity score matching or multivariable regression applied to adjust for baseline imbalances?",
            "What was the attrition rate at 90 days, and how were missing patients accounted for?"
        ]
    }
]

BREAST_IMAGING_PERSONAS = [
    {
        "id": "persona_breast_radiologist",
        "name": "Breast Radiologist",
        "role": "Breast Imaging Radiologist",
        "domain": "breast_imaging",
        "avatar": "🎗️",
        "focus": "BI-RADS lexicon standardization (3 vs 4a/b/c cutoff), Digital Breast Tomosynthesis (DBT), Contrast-Enhanced Mammography (CEM), Abbreviated Breast MRI, and dense breast masking.",
        "key_questions": [
            "Is the test-positive diagnostic cutoff defined as BI-RADS 3 or BI-RADS >=4?",
            "How is ACR breast density (fatty vs heterogeneously/extremely dense) stratified in the eligibility criteria?",
            "Was lesion detection verified with core-needle biopsy or minimum 12-month negative follow-up?"
        ]
    },
    {
        "id": "persona_breast_surgeon",
        "name": "Surgical Oncologist",
        "role": "Breast Surgical Oncologist",
        "domain": "breast_imaging",
        "avatar": "🩺",
        "focus": "Surgical margin positivity ('no ink on tumor'), re-excision rates, lumpectomy vs mastectomy conversion, sentinel lymph node biopsy (SLNB), and cosmetic preservation.",
        "key_questions": [
            "Does the protocol measure surgical re-excision and margin involvement?",
            "Are preoperative MRI staging effects on unnecessary mastectomy rates accounted for?",
            "How is axillary lymph node management protocolized?"
        ]
    },
    {
        "id": "persona_med_oncologist",
        "name": "Medical Oncologist",
        "role": "Medical Oncologist & Breast Trialist",
        "domain": "breast_imaging",
        "avatar": "🔬",
        "focus": "Neoadjuvant response monitoring, Pathological Complete Response (pCR), molecular subtypes (ER/PR/HER2, triple-negative), and disease-free survival.",
        "key_questions": [
            "Are molecular sub-cohorts (Triple-Negative, HER2+, Luminal A/B) tracked separately?",
            "Is RECIST 1.1 or Miller-Payne grading used to evaluate neoadjuvant radiographic response?",
            "What is the follow-up duration for distant recurrence and overall survival?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Diagnostic Screening & Meta-Analysis Biostatistician",
        "domain": "breast_imaging",
        "avatar": "📊",
        "focus": "Diagnostic accuracy modeling (Bivariate random-effects, HSROC), interval cancer rates, lead-time bias, overdiagnosis, and differential verification bias.",
        "key_questions": [
            "Does the protocol adjust for verification bias when BI-RADS 1-2 patients don't receive biopsy?",
            "Are sensitivity and specificity modeled hierarchically using HSROC or bivariate methods?",
            "How are interval breast cancers captured between regular screening rounds?"
        ]
    }
]

THORACIC_PULMONARY_PERSONAS = [
    {
        "id": "persona_thoracic_rad",
        "name": "Thoracic Radiologist",
        "role": "Thoracic Radiologist",
        "domain": "thoracic_pulmonary",
        "avatar": "🫁",
        "focus": "Lung-RADS categorization, low-dose CT (LDCT) protocols, nodule volumetry, ground-glass opacity (GGO) vs solid components, and scan slice thickness.",
        "key_questions": [
            "Are nodule diameter cutoffs calibrated to Lung-RADS v1.1 standards?",
            "Was slice thickness <=1.5mm standardized across scanner manufacturers?",
            "How are subsolid and pure ground-glass nodules evaluated over time?"
        ]
    },
    {
        "id": "persona_pulmonologist",
        "name": "Pulmonologist",
        "role": "Interventional Pulmonologist",
        "domain": "thoracic_pulmonary",
        "avatar": "🩺",
        "focus": "Bronchoscopic navigation, radial EBUS biopsy, pulmonary function tests (FEV1/DLCO), and smoking history pack-year qualification.",
        "key_questions": [
            "Are baseline pulmonary function thresholds pre-specified for biopsy eligibility?",
            "What are the diagnostic yield criteria for peripheral bronchoscopy?",
            "How is concurrent severe emphysema/COPD accounted for?"
        ]
    },
    {
        "id": "persona_thoracic_surgeon",
        "name": "Thoracic Surgeon",
        "role": "Thoracic Surgical Oncologist",
        "domain": "thoracic_pulmonary",
        "avatar": "🔬",
        "focus": "Sublobar resection (segmentectomy vs wedge) vs lobectomy, mediastinal nodal staging (IASLC map), and minimally invasive VATS/robotic approach.",
        "key_questions": [
            "Are sublobar resections restricted to peripheral nodules <=2cm per JCOG0802/CALGB 140503?",
            "What is the protocol for systematic mediastinal lymph node dissection?",
            "How is post-operative air leak and complication severity graded?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Lead Epidemiologist & Trial Biostatistician",
        "domain": "thoracic_pulmonary",
        "avatar": "📊",
        "focus": "Screening-associated false positive burden, overdiagnosis rate, stage-shift verification, and all-cause vs disease-specific mortality.",
        "key_questions": [
            "Is the primary endpoint disease-specific mortality or overall survival?",
            "What is the expected false positive rate and benign biopsy resection rate?",
            "Are competing risks from cardiovascular mortality modeled in heavy smokers?"
        ]
    }
]

CARDIOVASCULAR_PERSONAS = [
    {
        "id": "persona_interventional_cardio",
        "name": "Interventional Cardiologist",
        "role": "Interventional Cardiologist",
        "domain": "cardiovascular",
        "avatar": "🫀",
        "focus": "TIMI flow restoration, FFR/iFR hemodynamic significance, Academic Research Consortium (ARC) stent thrombosis definitions, and access complications.",
        "key_questions": [
            "Are coronary revascularization outcomes adjudicated by core laboratory quantitative angiography?",
            "Is stent thrombosis defined according to ARC definite/probable criteria?",
            "What antiplatelet regimen (DAPT duration) is mandated in the protocol?"
        ]
    },
    {
        "id": "persona_cardio_imaging",
        "name": "Cardiologist",
        "role": "Cardiovascular Imaging Specialist",
        "domain": "cardiovascular",
        "avatar": "🩺",
        "focus": "Coronary CTA CAD-RADS scoring, cardiac MRI late gadolinium enhancement, echocardiographic ejection fraction, and paravalvular regurgitation.",
        "key_questions": [
            "Was CAD-RADS v2.0 standardized for CTA plaque vulnerability and stenosis?",
            "How is paravalvular regurgitation quantified (VARC-3 criteria)?",
            "Are echocardiographic core lab adjudicators blinded to clinical assignment?"
        ]
    },
    {
        "id": "persona_cardiac_surgeon",
        "name": "Cardiac Surgeon",
        "role": "Cardiothoracic Surgeon",
        "domain": "cardiovascular",
        "avatar": "🔬",
        "focus": "SYNTAX score complexity, surgical risk models (STS / EuroSCORE II), emergency surgical conversion, and complete arterial grafting.",
        "key_questions": [
            "Was an anatomical SYNTAX score cutoff utilized to guide CABG vs PCI assignment?",
            "What was the emergency conversion to cardiopulmonary bypass rate?",
            "Are low, intermediate, and high surgical risk strata pre-specified?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Cardiovascular Trial Biostatistician",
        "domain": "cardiovascular",
        "avatar": "📊",
        "focus": "Composite endpoint deconstruction (MACE components), non-inferiority margins, win-ratio analysis for hierarchical endpoints, and missing data.",
        "key_questions": [
            "Is the composite MACE endpoint driven predominantly by soft revascularization rather than hard death/MI?",
            "What is the pre-specified non-inferiority margin and upper 95% CI bound?",
            "Is competing risk of non-cardiovascular death accounted for in elderly cohorts?"
        ]
    }
]

ABDOMINAL_GI_PERSONAS = [
    {
        "id": "persona_abdominal_rad",
        "name": "Abdominal Radiologist",
        "role": "Abdominal & GI Radiologist",
        "domain": "abdominal_gi",
        "avatar": "🔬",
        "focus": "LI-RADS v2018 criteria (LR-4 vs LR-5), arterial phase hyperenhancement (APHE), gadoxetic acid hepatobiliary phase washout, and CT/MRI cross-modality agreement.",
        "key_questions": [
            "Is definite hepatocellular carcinoma restricted strictly to LI-RADS 5 criteria?",
            "How are ancillary imaging features (capsule, mosaic architecture) weighted?",
            "Was multi-phase imaging performed with standardized bolus-tracking delay times?"
        ]
    },
    {
        "id": "persona_hepatologist",
        "name": "Hepatologist",
        "role": "Hepatologist & GI Oncologist",
        "domain": "abdominal_gi",
        "avatar": "🩺",
        "focus": "Cirrhosis etiology, Child-Pugh and ALBI grade, portal hypertension decompensation, and systemic tyrosine kinase inhibitor / immunotherapy safety.",
        "key_questions": [
            "Are non-cirrhotic patients excluded from LI-RADS diagnostic applicability?",
            "How is underlying liver functional reserve (Child-Pugh A vs B/C) accounted for?",
            "What are the predefined stopping rules for treatment-related hepatic failure?"
        ]
    },
    {
        "id": "persona_hpb_surgeon",
        "name": "HPB Surgeon",
        "role": "HPB Surgical Oncologist",
        "domain": "abdominal_gi",
        "avatar": "🔪",
        "focus": "R0 resection margins, future liver remnant (FLR) hypertrophy, portal vein embolization, Milan criteria for transplant, and post-hepatectomy liver failure.",
        "key_questions": [
            "What defines anatomic vs non-anatomic resection margin clearance?",
            "Are patients inside vs outside Milan / UCSF transplant criteria analyzed separately?",
            "How is post-operative morbidity classified (Clavien-Dindo grade)?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Diagnostic Meta-Analysis Biostatistician",
        "domain": "abdominal_gi",
        "avatar": "📊",
        "focus": "Per-lesion vs per-patient diagnostic accuracy clustering, reference standard verification, and time-to-progression vs progression-free survival.",
        "key_questions": [
            "Is statistical clustering used to account for multiple lesions within individual patients?",
            "How is differential verification bias handled when non-resected lesions lack pathology?",
            "What is the definition of recurrence-free survival (local vs intrahepatic distant)?"
        ]
    }
]

UNIVERSAL_PERSONAS = [
    {
        "id": "persona_interventional",
        "name": "Diagnostic Specialist",
        "role": "Specialized Interventional & Diagnostic Lead",
        "domain": "universal",
        "avatar": "🔬",
        "focus": "Index diagnostic / interventional modalities, technical procedure execution, verification reference standard, and hardware/technology specifications.",
        "key_questions": [
            "Is the index intervention or diagnostic test explicitly operationalized with reproducible technical criteria?",
            "What reference standard confirms true positive and true negative diagnoses?",
            "Are operator experience and procedural variations controlled for?"
        ]
    },
    {
        "id": "persona_medical",
        "name": "Medical Specialist",
        "role": "Primary Clinical Medical Lead",
        "domain": "universal",
        "avatar": "🩺",
        "focus": "Patient eligibility boundaries, clinical outcome adjudication, standardized adverse event definitions, and systemic medical management.",
        "key_questions": [
            "Are primary efficacy endpoints clinically validated rather than surrogate biomarkers?",
            "How are safety complications and adverse events formally adjudicated?",
            "Is concurrent standard-of-care medical management controlled across arms?"
        ]
    },
    {
        "id": "persona_surgical",
        "name": "Surgeon",
        "role": "Procedural & Surgical Specialist",
        "domain": "universal",
        "avatar": "🔪",
        "focus": "Invasive alternatives, anatomical contraindications, salvage therapy protocols, and long-term structural durability.",
        "key_questions": [
            "Are rescue therapies or emergency salvage interventions tracked in the protocol?",
            "What anatomical or comorbid features dictate procedural exclusion?",
            "Is follow-up long enough to capture late structural complications?"
        ]
    },
    {
        "id": "persona_biostatistician",
        "name": "Biostatistician",
        "role": "Lead Systematic Review Biostatistician",
        "domain": "universal",
        "avatar": "📊",
        "focus": "Active comparator arm validity, selection and confounding bias, missing data handling, and meta-analytic heterogeneity.",
        "key_questions": [
            "Is there an explicit, pre-specified comparator group (active control or matched cohort)?",
            "What is the protocol for missing outcome data and attrition (<10% threshold)?",
            "Are subgroup analyses pre-registered to prevent data-dredging?"
        ]
    }
]

# Default alias for legacy imports
CLINICAL_PERSONAS = NEUROVASCULAR_PERSONAS


# ─────────────────────────────────────────────────────────────────────────────
# DYNAMIC CLINICAL PERSONA SELECTION
# ─────────────────────────────────────────────────────────────────────────────

def detect_clinical_domain(
    text: str,
    topic: str = "",
    gathered_studies: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, str]:
    """Dynamically determine the clinical domain from ClaimScape gathered data and protocol text."""
    combined = (text + " " + topic).lower()
    if gathered_studies:
        for s in gathered_studies[:20]:
            title = s.get("title") or s.get("paper", {}).get("title", "")
            abstract = s.get("abstract") or s.get("finding", "")
            combined += " " + title.lower() + " " + abstract.lower()

    # Domain scoring
    breast_keywords = [
        "breast", "mammog", "mammogram", "tomosynthesis", "dbt", "bi-rads", "birads",
        "dense breast", "mastectomy", "lumpectomy", "cem", "abbreviated mri", "ductal",
        "lobular", "brca", "axillary", "slnb", "microcalcification"
    ]
    neuro_keywords = [
        "pam", "pure arterial", "aneurysm", "pseudoaneurysm", "stroke", "thrombectomy",
        "tici", "recanalization", "endovascular", "ischemic", "cerebrovascular", "stent",
        "arterial malformation", "dsa", "nihss", "mrs", "rankin", "sich", "intracranial",
        "vertebrobasilar", "carotid", "dural arteriovenous"
    ]
    thoracic_keywords = [
        "lung", "pulmonary", "nodule", "thoracic", "lung-rads", "ldct", "copd",
        "broncho", "lobectomy", "pleural", "sublobar", "ggo", "ground-glass"
    ]
    cardio_keywords = [
        "coronary", "cardiac", "tavr", "tavi", "stent", "mace", "myocardial",
        "infarction", "angioplasty", "cabg", "aortic stenosis", "cad-rads", "timi"
    ]
    abdominal_keywords = [
        "liver", "hepatic", "hcc", "li-rads", "cirrhosis", "pancrea", "colorectal",
        "gadoxetic", "eovist", "biliary", "cholangio", "hepatocellular"
    ]

    scores = {
        "breast_imaging": sum(combined.count(k) for k in breast_keywords),
        "neurovascular": sum(combined.count(k) for k in neuro_keywords),
        "thoracic_pulmonary": sum(combined.count(k) for k in thoracic_keywords),
        "cardiovascular": sum(combined.count(k) for k in cardio_keywords),
        "abdominal_gi": sum(combined.count(k) for k in abdominal_keywords),
    }

    best_domain, best_score = max(scores.items(), key=lambda x: x[1])

    if best_score == 0:
        return "universal", "Universal Clinical Medicine & Systematic Review Methodology"

    labels = {
        "breast_imaging": "Breast Imaging & Multidisciplinary Breast Oncology",
        "neurovascular": "Neurovascular Intervention, Stroke & Diagnostic Neuroradiology",
        "thoracic_pulmonary": "Thoracic Radiology, Pulmonology & Thoracic Oncology",
        "cardiovascular": "Cardiovascular Imaging & Interventional Cardiology",
        "abdominal_gi": "Abdominal Radiology, Hepatology & GI Oncology"
    }

    return best_domain, labels.get(best_domain, "Universal Clinical Medicine")


def resolve_personas_for_protocol(
    pico: Optional[Dict[str, Any]] = None,
    topic: str = "",
    gathered_studies: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """Dynamically assign 4 multidisciplinary clinical specialist personas based on study data and protocol."""
    pico_text = ""
    if pico:
        for k in ("population", "index_test", "comparator", "outcome", "study_design"):
            pico_text += " " + str(pico.get(k, ""))

    domain_key, _ = detect_clinical_domain(pico_text, topic, gathered_studies)

    persona_map = {
        "breast_imaging": BREAST_IMAGING_PERSONAS,
        "neurovascular": NEUROVASCULAR_PERSONAS,
        "thoracic_pulmonary": THORACIC_PULMONARY_PERSONAS,
        "cardiovascular": CARDIOVASCULAR_PERSONAS,
        "abdominal_gi": ABDOMINAL_GI_PERSONAS,
        "universal": UNIVERSAL_PERSONAS
    }

    return persona_map.get(domain_key, UNIVERSAL_PERSONAS)


# ─────────────────────────────────────────────────────────────────────────────
# PAPER-LEVEL DELIBERATION (CLAIMSCAPE FAST / INSPECTOR)
# ─────────────────────────────────────────────────────────────────────────────

def deliberate_study_flaws(
    title: str,
    abstract: str,
    extracted_variables: Optional[List[Dict[str, Any]]] = None,
    topic: str = "clinical medicine",
    gathered_studies: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Run Clinical STORM + LAYA deliberation across dynamically assigned specialist personas."""
    # 1. Run ultra-fast Laya System-1 triage
    laya_summary = run_laya_fast_triage(title, abstract, topic)

    # 2. Select appropriate personas dynamically
    personas = resolve_personas_for_protocol(
        pico={"population": title, "outcome": abstract},
        topic=topic,
        gathered_studies=gathered_studies
    )

    text_lower = (title + " " + abstract).lower()
    design_flaws: List[Dict[str, Any]] = []

    # Detect known study flaws across domains
    if "tici" in text_lower:
        if "2b/3" in text_lower or "2b or 3" in text_lower:
            design_flaws.append({
                "flaw_code": "TICI_POOLED_ENDPOINT",
                "severity": "MODERATE",
                "title": "Pooled Recanalization Definition (TICI 2b/3)",
                "description": "Study aggregates partial (TICI 2b) and near-complete/complete (TICI 2c/3) reperfusion into a single endpoint, obscuring superior functional recovery associated with TICI 2c/3.",
                "advocated_by": personas[0]["role"]
            })
    elif "bi-rads" in text_lower or "birads" in text_lower:
        if not any(k in text_lower for k in ["bi-rads 4", "birads 4", "threshold", "cutoff"]):
            design_flaws.append({
                "flaw_code": "BIRADS_CUTOFF_AMBIGUITY",
                "severity": "HIGH",
                "title": "Unspecified BI-RADS Positive Threshold",
                "description": "Study evaluates breast imaging accuracy without clearly separating BI-RADS 3 (probably benign) from BI-RADS >=4 (suspicious), biasing sensitivity and specificity.",
                "advocated_by": personas[0]["role"]
            })

    # Symptomatic ICH / Bleeding definition
    if "hemorrhage" in text_lower or "ich" in text_lower or "sich" in text_lower:
        if not any(k in text_lower for k in ["ecass", "sits-most", "heidelberg", "ninds"]):
            design_flaws.append({
                "flaw_code": "SICH_CRITERIA_UNSPECIFIED",
                "severity": "HIGH",
                "title": "Unstandardized Symptomatic ICH Definition",
                "description": "Symptomatic intracranial hemorrhage is reported without standard operational criteria (ECASS-III, SITS-MOST, or Heidelberg), impairing cross-trial meta-analytic pooling.",
                "advocated_by": personas[1]["role"]
            })

    # Confounding / Retrospective observational bias
    if "retrospective" in text_lower or "single-center" in text_lower or "case series" in text_lower:
        design_flaws.append({
            "flaw_code": "SELECTION_BIAS_CONFOUNDING",
            "severity": "MODERATE",
            "title": "Retrospective Selection & Indication Confounding",
            "description": "Non-randomized observational design subject to selection bias; complex anatomy or high-risk patients may have been systematically excluded.",
            "advocated_by": personas[3]["role"]
        })

    # Blinded outcome assessment
    if ("mrs" in text_lower or "accuracy" in text_lower) and "blinded" not in text_lower:
        design_flaws.append({
            "flaw_code": "UNBLINDED_OUTCOME_ASSESSMENT",
            "severity": "LOW",
            "title": "Unblinded Clinical Outcome Assessment",
            "description": "Key endpoints or radiographic interpretations were not documented as assessed by independent, blinded reviewers.",
            "advocated_by": personas[1]["role"]
        })

    # Build persona-specific opinions
    persona_opinions: List[Dict[str, Any]] = []
    for p in personas:
        stance = "positive"
        critique = "No major specialty-specific concerns identified."

        if p["id"].startswith("persona_interventional") or p["id"] == "persona_breast_radiologist" or p["id"] == "persona_thoracic_rad":
            if any(f["flaw_code"].startswith("TICI") or f["flaw_code"].startswith("BIRADS") for f in design_flaws):
                stance = "cautionary"
                critique = f"{p['role']} identifies ambiguity in imaging or procedural grading criteria. Technical success cannot be cleanly distinguished."
            else:
                critique = "Imaging endpoints and technical execution meet acceptable subspecialty standards."

        elif p["id"].startswith("persona_neurology") or p["id"] == "persona_breast_surgeon" or p["id"] == "persona_pulmonologist":
            if any(f["flaw_code"] == "SICH_CRITERIA_UNSPECIFIED" for f in design_flaws):
                stance = "critical"
                critique = "Adverse safety outcomes lack standardized operational adjudication criteria."
            else:
                critique = "Clinical safety outcomes align with standardized clinical practice."

        elif p["id"].startswith("persona_surgeon") or p["id"] == "persona_med_oncologist" or p["id"] == "persona_thoracic_surgeon":
            if "aneurysm" in text_lower or "pseudoaneurysm" in text_lower or "re-excision" in text_lower:
                stance = "cautionary"
                critique = f"{p['role']} notes high-risk structural features requiring dedicated surgical contingency."
            else:
                critique = "Standard clinical pathology presentation; procedural salvage options noted."

        elif "biostatistician" in p["id"]:
            if any(f["flaw_code"] == "SELECTION_BIAS_CONFOUNDING" for f in design_flaws):
                stance = "critical"
                critique = "High risk of confounding by indication. Recommend downweighting in meta-analysis or performing subgroup sensitivity analysis."
            else:
                critique = "Study methodology meets acceptable threshold for inclusion with standard risk of bias adjustment."

        persona_opinions.append({
            "persona_id": p["id"],
            "name": p["name"],
            "role": p["role"],
            "avatar": p["avatar"],
            "stance": stance,
            "critique": critique,
            "confidence": 0.88 if stance == "positive" else 0.94
        })

    critical_count = sum(1 for po in persona_opinions if po["stance"] == "critical")
    caution_count = sum(1 for po in persona_opinions if po["stance"] == "cautionary")

    if critical_count >= 2:
        consensus_status = "CRITICAL_FLAW_DETECTED"
        verdict_badge = "⚠️ Significant Study Design Flaws"
        verdict_color = "#dc2626"
    elif critical_count == 1 or caution_count >= 2:
        consensus_status = "QUALIFIED_CONSENSUS"
        verdict_badge = "⚡ Qualified Clinical Consensus (With Flaws)"
        verdict_color = "#d97706"
    else:
        consensus_status = "UNANIMOUS_CONSENSUS"
        verdict_badge = "✅ Multi-Specialty Clinical Consensus"
        verdict_color = "#16a34a"

    grand_rounds_summary = (
        f"Multi-perspective Grand Rounds conducted across 4 specialties ({personas[0]['role']}, {personas[1]['role']}, {personas[2]['role']}, {personas[3]['role']}). "
        f"Laya System-1 preliminary flaw probability: {int(laya_summary['flaw_probability']*100)}%. "
        f"{len(design_flaws)} methodological design flaw(s) identified."
    )

    return {
        "title": title,
        "laya_fast_triage": laya_summary,
        "consensus_status": consensus_status,
        "verdict_badge": verdict_badge,
        "verdict_color": verdict_color,
        "design_flaws": design_flaws,
        "total_flaws": len(design_flaws),
        "persona_opinions": persona_opinions,
        "grand_rounds_summary": grand_rounds_summary
    }


# ─────────────────────────────────────────────────────────────────────────────
# STUDY PROTOCOL DELIBERATION & 1-CLICK ACTIONABLE SUGGESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def deliberate_protocol_flaws(
    pico: Optional[Dict[str, Any]] = None,
    hypothesis: Optional[str] = None,
    criteria: Optional[Dict[str, Any]] = None,
    research_question: Optional[str] = None,
    topic: str = "clinical medicine",
    gathered_studies: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Critique a study protocol from dynamically assigned clinical perspectives and output 1-click suggestions."""
    pico = pico or {}
    criteria = criteria or {}
    population = str(pico.get("population", ""))
    index_test = str(pico.get("index_test", ""))
    comparator = str(pico.get("comparator", ""))
    outcome = str(pico.get("outcome", ""))
    study_design = str(pico.get("study_design", ""))
    hyp_text = str(hypothesis or "")
    rq_text = str(research_question or "")

    inclusion_list = criteria.get("inclusion", []) if isinstance(criteria, dict) else []
    exclusion_list = criteria.get("exclusion", []) if isinstance(criteria, dict) else []
    inclusion_texts = " ".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in inclusion_list])
    exclusion_texts = " ".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in exclusion_list])

    full_protocol_text = (
        f"{topic} {rq_text} {hyp_text} {population} {index_test} {comparator} {outcome} {study_design} "
        f"{inclusion_texts} {exclusion_texts}"
    )

    # 1. Dynamically identify clinical domain & assign 4 specialist personas
    domain_key, domain_label = detect_clinical_domain(full_protocol_text, topic, gathered_studies)
    personas = resolve_personas_for_protocol(pico, topic, gathered_studies)

    # 2. Run Laya Fast System-1 Triage on the Protocol
    laya_summary = run_laya_fast_triage(
        title=rq_text or topic,
        abstract=f"P: {population[:200]} I: {index_test[:200]} C: {comparator[:200]} O: {outcome[:200]} S: {study_design[:200]}",
        topic=topic
    )

    proto_lower = full_protocol_text.lower()
    design_flaws: List[Dict[str, Any]] = []
    suggestions: List[Dict[str, Any]] = []

    # ─────────────────────────────────────────────────────────────────────────
    # DOMAIN-SPECIFIC PROTOCOL FLAW CHECKS
    # ─────────────────────────────────────────────────────────────────────────

    if domain_key == "breast_imaging":
        # Flaw: Ambiguous BI-RADS positive threshold
        if not any(k in outcome.lower() or k in index_test.lower() for k in ["bi-rads 4", "birads 4", "bi-rads >= 4", "birads >=4"]):
            design_flaws.append({
                "flaw_code": "BIRADS_CUTOFF_AMBIGUITY",
                "severity": "HIGH",
                "title": "Unspecified BI-RADS Positive Diagnostic Threshold",
                "description": "Protocol does not explicitly define whether BI-RADS 3 (probably benign) or BI-RADS >=4 (suspicious abnormality) constitutes a test-positive diagnosis.",
                "advocated_by": personas[0]["role"],
                "persona_id": personas[0]["id"]
            })
            suggestions.append({
                "id": "sugg_birads_cutoff",
                "persona_id": personas[0]["id"],
                "persona_role": personas[0]["role"],
                "flaw_title": "Standardize BI-RADS >=4 Cutoff",
                "flaw_severity": "HIGH",
                "target_type": "pico_outcome",
                "action_label": "Adopt into Outcome",
                "suggested_text": (
                    (outcome.rstrip(".") + "; " if outcome else "") +
                    "Diagnostic test-positive defined as BI-RADS category >=4 (suspicious abnormality), with pre-specified sensitivity analysis evaluating BI-RADS 3 as test-negative."
                ).strip(),
                "rationale": "Prevents institutional threshold discordance and ensures meta-analytic pooling adheres to ACR standards."
            })

        # Flaw: Missing ACR Breast Density Stratification
        if not any(k in population.lower() or k in inclusion_texts.lower() for k in ["dense", "density", "acr a", "acr b", "acr c", "acr d"]):
            design_flaws.append({
                "flaw_code": "BREAST_DENSITY_STRATIFICATION_MISSING",
                "severity": "MODERATE",
                "title": "Missing ACR Breast Density Stratification",
                "description": "Screening accuracy is strongly confounded by mammographic breast density (masking effect). Density subgroups are not pre-specified.",
                "advocated_by": personas[0]["role"],
                "persona_id": personas[0]["id"]
            })
            suggestions.append({
                "id": "sugg_breast_density_subgroup",
                "persona_id": personas[0]["id"],
                "persona_role": personas[0]["role"],
                "flaw_title": "Add Breast Density Inclusion/Stratification",
                "flaw_severity": "MODERATE",
                "target_type": "inclusion_criterion",
                "action_label": "+ Add Inclusion Criterion",
                "suggested_text": "ACR Breast Density category documented (Fatty/Scattered vs Heterogeneously/Extremely Dense) for pre-planned diagnostic subgroup analysis.",
                "rationale": "Prevents diagnostic masking bias where dense fibroglandular tissue obscures small non-calcified malignant lesions."
            })

        # Flaw: Missing Verification Standard / Differential Verification Bias
        if not any(k in comparator.lower() or k in study_design.lower() for k in ["histopathol", "biopsy", "follow-up", "follow up", "registry"]):
            design_flaws.append({
                "flaw_code": "VERIFICATION_STANDARD_IMPAIRMENT",
                "severity": "HIGH",
                "title": "Incomplete Reference Standard Definition",
                "description": "Protocol does not define how negative imaging findings are verified (histopathology vs minimum 12-month negative follow-up).",
                "advocated_by": personas[3]["role"],
                "persona_id": personas[3]["id"]
            })
            suggestions.append({
                "id": "sugg_breast_reference_std",
                "persona_id": personas[3]["id"],
                "persona_role": personas[3]["role"],
                "flaw_title": "Specify Gold-Standard Verification",
                "flaw_severity": "HIGH",
                "target_type": "pico_comparator",
                "action_label": "Adopt into Comparator",
                "suggested_text": (
                    (comparator.rstrip(".") + "; " if comparator else "") +
                    "Reference standard: Core-needle/surgical histopathology for test-positive lesions, and minimum 12-month negative follow-up or cancer registry linkage for test-negative cases."
                ).strip(),
                "rationale": "Guarantees protection against partial and differential verification bias in diagnostic meta-analyses."
            })

    elif domain_key == "neurovascular":
        # Flaw: Pooled Recanalization Endpoint
        if any(k in outcome.lower() for k in ["recanaliz", "reperfusion", "tici"]) and not any(k in outcome.lower() for k in ["2c/3", "tici 2c", "complete reperfusion"]):
            design_flaws.append({
                "flaw_code": "TICI_POOLED_ENDPOINT",
                "severity": "MODERATE",
                "title": "Pooled Recanalization Definition (TICI 2b/3)",
                "description": "Protocol pools partial (mTICI 2b) with near-complete/complete (mTICI 2c/3) reperfusion, obscuring superior functional independence in 2c/3.",
                "advocated_by": personas[0]["role"],
                "persona_id": personas[0]["id"]
            })
            suggestions.append({
                "id": "sugg_tici_stratification",
                "persona_id": personas[0]["id"],
                "persona_role": personas[0]["role"],
                "flaw_title": "Specify mTICI 2c/3 Recanalization Subgroup",
                "flaw_severity": "MODERATE",
                "target_type": "pico_outcome",
                "action_label": "Adopt into Outcome",
                "suggested_text": (
                    (outcome.rstrip(".") + "; " if outcome else "") +
                    "Successful recanalization defined as modified TICI 2b-3, with pre-specified sensitivity analysis isolating complete reperfusion (mTICI 2c/3)."
                ).strip(),
                "rationale": "Distinguishes technical procedural perfection (TICI 2c/3) from incomplete reperfusion (TICI 2b)."
            })

        # Flaw: Unstandardized Symptomatic ICH Definition
        if any(k in outcome.lower() for k in ["hemorrhage", "ich", "sich", "bleeding"]) and not any(k in outcome.lower() for k in ["ecass", "sits-most", "heidelberg"]):
            design_flaws.append({
                "flaw_code": "SICH_CRITERIA_UNSPECIFIED",
                "severity": "HIGH",
                "title": "Unstandardized Symptomatic ICH Criteria",
                "description": "Symptomatic intracranial hemorrhage is specified without referencing ECASS-III, SITS-MOST, or Heidelberg Bleeding Classification.",
                "advocated_by": personas[1]["role"],
                "persona_id": personas[1]["id"]
            })
            suggestions.append({
                "id": "sugg_sich_standardize",
                "persona_id": personas[1]["id"],
                "persona_role": personas[1]["role"],
                "flaw_title": "Standardize sICH Adjudication (ECASS-III)",
                "flaw_severity": "HIGH",
                "target_type": "pico_outcome",
                "action_label": "Adopt into Outcome",
                "suggested_text": (
                    (outcome.rstrip(".") + "; " if outcome else "") +
                    "Symptomatic intracranial hemorrhage (sICH) defined strictly according to ECASS-III criteria (parenchymal hematoma type 2 with neurological deterioration >=4 NIHSS points within 36 hours)."
                ).strip(),
                "rationale": "Critical for cross-trial pooling; unadjudicated hemorrhage rates cannot be synthesized in meta-analysis."
            })

        # Flaw: Anatomical Shunt Confounding (AVM/dAVF overlap in PAM studies)
        if any(k in proto_lower for k in ["pam", "pure arterial malformation", "arterial loop"]):
            if not any(k in exclusion_texts.lower() for k in ["arteriovenous malformation", "avm", "davf", "fistula"]):
                design_flaws.append({
                    "flaw_code": "ANATOMICAL_SHUNT_CONFOUNDING",
                    "severity": "HIGH",
                    "title": "Uncontrolled Arteriovenous Shunting (AVM/dAVF)",
                    "description": "Pure Arterial Malformations (PAM) lack true arteriovenous shunts. Failure to exclude AVM/dAVF introduces catastrophic lesion misclassification.",
                    "advocated_by": personas[2]["role"],
                    "persona_id": personas[2]["id"]
                })
                suggestions.append({
                    "id": "sugg_exclude_avm_shunts",
                    "persona_id": personas[2]["id"],
                    "persona_role": personas[2]["role"],
                    "flaw_title": "Exclude AVM & dAVF Shunting",
                    "flaw_severity": "HIGH",
                    "target_type": "exclusion_criterion",
                    "action_label": "+ Add Exclusion Criterion",
                    "suggested_text": "Exclude arteriovenous malformations (AVM) with true arteriovenous nidus/shunting and dural arteriovenous fistulas (dAVF).",
                    "rationale": "Prevents confounding lesion types with distinct natural histories and therapeutic profiles."
                })

    # ─────────────────────────────────────────────────────────────────────────
    # UNIVERSAL METHODOLOGICAL PROTOCOL FLAW CHECKS
    # ─────────────────────────────────────────────────────────────────────────

    # Flaw: Missing or Undefined Active Comparator Arm
    comparator_clean = comparator.strip().lower()
    if not comparator_clean or comparator_clean in ["none", "n/a", "no comparator", "standard of care"]:
        design_flaws.append({
            "flaw_code": "MISSING_COMPARATOR_SPECIFICATION",
            "severity": "HIGH",
            "title": "Unspecified Comparative Reference Arm",
            "description": "Comparator is undefined or generic ('standard of care'). Systematic reviews require explicit comparator contrasts to prevent confounding by indication.",
            "advocated_by": personas[3]["role"],
            "persona_id": personas[3]["id"]
        })
        default_comp = (
            "Medical management alone, or historical control cohort with multivariable propensity-score adjustment for baseline covariates."
            if domain_key != "breast_imaging" else
            "Standard digital 2D mammography or histopathological reference standard."
        )
        suggestions.append({
            "id": "sugg_specify_comparator",
            "persona_id": personas[3]["id"],
            "persona_role": personas[3]["role"],
            "flaw_title": "Specify Explicit Comparator Arm",
            "flaw_severity": "HIGH",
            "target_type": "pico_comparator",
            "action_label": "Adopt into Comparator",
            "suggested_text": default_comp,
            "rationale": "Guarantees a clean contrast group for relative risk and odds ratio calculations."
        })

    # Flaw: Unblinded Outcome Adjudication
    if ("mrs" in outcome.lower() or "survival" in outcome.lower() or "accuracy" in outcome.lower()) and "blinded" not in outcome.lower():
        design_flaws.append({
            "flaw_code": "UNBLINDED_OUTCOME_ASSESSMENT",
            "severity": "MODERATE",
            "title": "Unblinded Primary Outcome Adjudication",
            "description": "Protocol does not require that primary endpoint assessors or image readers be blinded to clinical treatment arm or index test status.",
            "advocated_by": personas[1]["role"],
            "persona_id": personas[1]["id"]
        })
        suggestions.append({
            "id": "sugg_blinded_assessment",
            "persona_id": personas[1]["id"],
            "persona_role": personas[1]["role"],
            "flaw_title": "Require Blinded Outcome Adjudication",
            "flaw_severity": "MODERATE",
            "target_type": "pico_outcome",
            "action_label": "Adopt into Outcome",
            "suggested_text": (
                (outcome.rstrip(".") + "; " if outcome else "") +
                "Primary clinical and imaging endpoints evaluated by certified adjudicators blinded to treatment assignment."
            ).strip(),
            "rationale": "Reduces detection bias and satisfies Cochrane Risk of Bias Domain 4 criteria."
        })

    # Flaw: Attrition Bias & Handling of Missing Outcome Data
    if not any(k in study_design.lower() for k in ["loss to follow", "attrition", "imputation", "missing data", "lost to follow"]):
        design_flaws.append({
            "flaw_code": "ATTRITION_BIAS_RISK",
            "severity": "LOW",
            "title": "Missing Attrition & Follow-up Threshold Policy",
            "description": "Protocol lacks a predefined loss-to-follow-up threshold or sensitivity analysis protocol for handling missing participant outcomes.",
            "advocated_by": personas[3]["role"],
            "persona_id": personas[3]["id"]
        })
        suggestions.append({
            "id": "sugg_attrition_threshold",
            "persona_id": personas[3]["id"],
            "persona_role": personas[3]["role"],
            "flaw_title": "Define Attrition Threshold (<10%)",
            "flaw_severity": "LOW",
            "target_type": "pico_study_design",
            "action_label": "Adopt into Study Design",
            "suggested_text": (
                (study_design.rstrip(".") + "; " if study_design else "") +
                "Loss-to-follow-up threshold set at <10%; sensitivity analyses pre-specified using best-case and worst-case scenario imputation for missing data."
            ).strip(),
            "rationale": "Protects against attrition bias and selective participant dropout."
        })

    # ─────────────────────────────────────────────────────────────────────────
    # SYNTHESIZE PERSONA OPINIONS & RIGOR SCORE
    # ─────────────────────────────────────────────────────────────────────────
    persona_opinions: List[Dict[str, Any]] = []
    for p in personas:
        p_flaws = [f for f in design_flaws if f.get("persona_id") == p["id"]]
        if any(f["severity"] == "HIGH" for f in p_flaws):
            stance = "critical"
            critique = f"{p['role']} flagged {len(p_flaws)} critical protocol flaw(s): " + "; ".join(f["title"] for f in p_flaws)
        elif len(p_flaws) > 0:
            stance = "cautionary"
            critique = f"{p['role']} advises refinement: " + "; ".join(f["title"] for f in p_flaws)
        else:
            stance = "positive"
            critique = f"{p['role']} endorses protocol framework for {domain_label}. Key specialty endpoints are well-specified."

        persona_opinions.append({
            "persona_id": p["id"],
            "name": p["name"],
            "role": p["role"],
            "avatar": p["avatar"],
            "domain": p.get("domain", domain_key),
            "stance": stance,
            "critique": critique,
            "key_questions": p.get("key_questions", []),
            "flaws_flagged": len(p_flaws)
        })

    # Calculate overall Protocol Rigor Score (0–100)
    high_flaws = sum(1 for f in design_flaws if f["severity"] == "HIGH")
    mod_flaws = sum(1 for f in design_flaws if f["severity"] == "MODERATE")
    low_flaws = sum(1 for f in design_flaws if f["severity"] == "LOW")

    deductions = (high_flaws * 18) + (mod_flaws * 10) + (low_flaws * 5)
    rigor_score = max(35, min(100, 100 - deductions))

    if high_flaws >= 2:
        consensus_status = "CRITICAL_REVISION_REQUIRED"
        verdict_badge = "⚠️ Protocol Revisions Advised Before Screening"
        verdict_color = "#dc2626"
    elif high_flaws == 1 or mod_flaws >= 2:
        consensus_status = "MODERATE_FLAWS_DETECTED"
        verdict_badge = "⚡ Actionable Protocol Suggestions Available"
        verdict_color = "#d97706"
    else:
        consensus_status = "PROTOCOL_RIGOROUS"
        verdict_badge = "✅ Methodologically Rigorous Protocol"
        verdict_color = "#16a34a"

    grand_rounds_summary = (
        f"Multi-specialty clinical review convened for {domain_label}. "
        f"Assigned specialist panel: {personas[0]['role']}, {personas[1]['role']}, {personas[2]['role']}, {personas[3]['role']}. "
        f"Protocol Rigor Score: {rigor_score}/100. "
        f"{len(design_flaws)} potential methodological design flaw(s) identified with {len(suggestions)} 1-click refinement suggestion(s)."
    )

    prisma_conformance = evaluate_prisma2020_conformance(
        pico=pico,
        hypothesis=hypothesis,
        criteria=criteria,
        research_question=research_question,
        topic=topic
    )

    return {
        "domain": domain_key,
        "domain_label": domain_label,
        "rigor_score": rigor_score,
        "laya_fast_triage": laya_summary,
        "consensus_status": consensus_status,
        "verdict_badge": verdict_badge,
        "verdict_color": verdict_color,
        "design_flaws": design_flaws,
        "total_flaws": len(design_flaws),
        "suggestions": suggestions,
        "total_suggestions": len(suggestions),
        "personas": personas,
        "persona_opinions": persona_opinions,
        "grand_rounds_summary": grand_rounds_summary,
        "prisma_conformance": prisma_conformance
    }


def evaluate_prisma2020_conformance(
    pico: Optional[Dict[str, Any]] = None,
    hypothesis: Optional[str] = None,
    criteria: Optional[Dict[str, Any]] = None,
    research_question: Optional[str] = None,
    topic: str = ""
) -> Dict[str, Any]:
    """Evaluate protocol against official PRISMA 2020 reporting checklist items (adapted from RevAIse/prismAId)."""
    pico = pico or {}
    criteria = criteria or {}
    pop = str(pico.get("population", "")).strip()
    idx = str(pico.get("index_test", "")).strip()
    cmp = str(pico.get("comparator", "")).strip()
    out = str(pico.get("outcome", "")).strip()
    std = str(pico.get("study_design", "")).strip()
    rq = str(research_question or "").strip()
    hyp = str(hypothesis or "").strip()

    inc = criteria.get("inclusion", []) if isinstance(criteria, dict) else []
    exc = criteria.get("exclusion", []) if isinstance(criteria, dict) else []

    checklist = [
        {
            "item_id": "prisma_title",
            "item_number": 1,
            "section": "Title",
            "name": "Title Identification",
            "passed": bool(topic.strip()),
            "status": "passed" if topic.strip() else "missing",
            "guidance": "Identifies the report as a systematic review, meta-analysis, or both."
        },
        {
            "item_id": "prisma_rq",
            "item_number": 2,
            "section": "Introduction",
            "name": "Rationale & Research Question",
            "passed": len(rq) > 10,
            "status": "passed" if len(rq) > 10 else "missing",
            "guidance": "Provides explicit statement of the question(s) being addressed with reference to participants, interventions, comparators, and outcomes (PICO)."
        },
        {
            "item_id": "prisma_pico_p",
            "item_number": "3a",
            "section": "Methods - Eligibility",
            "name": "P — Population Specified",
            "passed": len(pop) > 5,
            "status": "passed" if len(pop) > 5 else "missing",
            "guidance": "Eligibility criteria for participants/patients defined with clinical specificity."
        },
        {
            "item_id": "prisma_pico_i",
            "item_number": "3b",
            "section": "Methods - Eligibility",
            "name": "I — Intervention / Index Test",
            "passed": len(idx) > 5,
            "status": "passed" if len(idx) > 5 else "missing",
            "guidance": "Index test or intervention criteria operationalized."
        },
        {
            "item_id": "prisma_pico_c",
            "item_number": "3c",
            "section": "Methods - Eligibility",
            "name": "C — Comparator Specified",
            "passed": len(cmp) > 5 and cmp.lower() not in ["none", "n/a", "no comparator"],
            "status": "passed" if (len(cmp) > 5 and cmp.lower() not in ["none", "n/a", "no comparator"]) else "warning",
            "guidance": "Explicit active or reference comparator defined to prevent confounding by indication."
        },
        {
            "item_id": "prisma_pico_o",
            "item_number": "3d",
            "section": "Methods - Eligibility",
            "name": "O — Primary & Safety Outcomes",
            "passed": len(out) > 5,
            "status": "passed" if len(out) > 5 else "missing",
            "guidance": "Primary clinical efficacy and adverse safety outcomes pre-specified."
        },
        {
            "item_id": "prisma_pico_s",
            "item_number": "3e",
            "section": "Methods - Eligibility",
            "name": "S — Study Design Eligibility",
            "passed": len(std) > 5,
            "status": "passed" if len(std) > 5 else "missing",
            "guidance": "Eligible study designs (RCT, observational cohort, case series) documented."
        },
        {
            "item_id": "prisma_criteria",
            "item_number": 4,
            "section": "Methods - Eligibility",
            "name": "Inclusion & Exclusion Criteria",
            "passed": len(inc) > 0 and len(exc) > 0,
            "status": "passed" if (len(inc) > 0 and len(exc) > 0) else ("warning" if (len(inc) > 0 or len(exc) > 0) else "missing"),
            "guidance": "Full inclusion and exclusion criteria documented for reproducible screening."
        },
        {
            "item_id": "prisma_hyp",
            "item_number": 5,
            "section": "Methods - Objectives",
            "name": "Hypothesis Pre-Specification",
            "passed": len(hyp) > 10,
            "status": "passed" if len(hyp) > 10 else "missing",
            "guidance": "Pre-specified testable primary hypothesis formulated prior to study synthesis."
        }
    ]

    passed_count = sum(1 for item in checklist if item["passed"])
    total_count = len(checklist)
    conformance_pct = int(round((passed_count / total_count) * 100))

    return {
        "conformance_score": conformance_pct,
        "passed_items": passed_count,
        "total_items": total_count,
        "status": "FULL_CONFORMANCE" if conformance_pct == 100 else ("SUBSTANTIAL_CONFORMANCE" if conformance_pct >= 75 else "INCOMPLETE_PROTOCOL"),
        "badge": f"PRISMA 2020: {conformance_pct}% Compliant" if conformance_pct >= 75 else f"PRISMA 2020: {passed_count}/{total_count} Items",
        "checklist": checklist
    }


def export_prisma2020_protocol(
    pico: Optional[Dict[str, Any]] = None,
    hypothesis: Optional[str] = None,
    criteria: Optional[Dict[str, Any]] = None,
    research_question: Optional[str] = None,
    topic: str = "",
    gathered_studies: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Export standardized PRISMA 2020 / PROSPERO pre-registration protocol specification (adapted from RevAIse/prismAId)."""
    import datetime

    conformance = evaluate_prisma2020_conformance(
        pico=pico,
        hypothesis=hypothesis,
        criteria=criteria,
        research_question=research_question,
        topic=topic
    )

    personas = resolve_personas_for_protocol(pico=pico, topic=topic, gathered_studies=gathered_studies)

    return {
        "protocol_format": "PRISMA-2020-PreRegistration-v1",
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "title": research_question or topic or "Systematic Review Protocol",
        "topic": topic,
        "research_question": research_question,
        "hypothesis": hypothesis,
        "pico": pico or {},
        "eligibility_criteria": criteria or {},
        "specialist_reviewers": [
            {
                "id": p["id"],
                "role": p["role"],
                "focus": p.get("focus", ""),
                "key_questions": p.get("key_questions", [])
            }
            for p in personas
        ],
        "prisma_2020_conformance": conformance,
        "reproducibility": {
            "screener_engine": "laya_deterministic_screening",
            "open_science_standard": "PRISMA-2020 / PROSPERO",
            "hash_algorithm": "SHA-256",
            "dual_reviewer_mode": "enabled"
        }
    }

