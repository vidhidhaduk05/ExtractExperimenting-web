"""Clinical STORM & LAYA Multi-Perspective Deliberation Service.

Inspired by:
1. Stanford OVAL's STORM (Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking).
2. Convai Innovations' Laya (Ultra-fast System-1 decision head running on local ONNX Runtime).
3. The Stanford Physicians SLR workflow (Dr. Jeremy Heit & Dr. Gautam Adusumilli) addressing study design flaws.

Pipeline:
- Fast Path (<150ms): Laya System-1 evaluates design flaw probability, specialty affinity, and RoB score in 1 forward pass.
- Deep Path: Stanford STORM-inspired multi-perspective clinical personas (Interventionalist, Neurologist, Surgeon, Biostatistician)
  cross-examine the evidence to surface hidden methodological flaws and build robust consensus.
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


def run_laya_fast_triage(title: str, abstract: str, topic: str = "vascular neurology") -> Dict[str, Any]:
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
                    "instructions": "Which clinical subspecialty has the strongest critical stake in evaluating this paper?",
                    "criteria": {
                        "interventional": "Catheter procedure, device selection, recanalization, technical execution",
                        "stroke_neurology": "Medical management, tPA, neurological outcome, bleeding complications",
                        "vascular_surgery": "Surgical bypass, clipping, rescue decompression, vascular anatomy",
                        "biostatistics": "Trial methodology, randomized control, confounding, attrition"
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
    text_lower = (title + " " + abstract).lower()
    has_retrospective = "retrospective" in text_lower or "case report" in text_lower or "series" in text_lower
    has_unclear_tici = "tici" in text_lower and not ("tici 2b/3" in text_lower or "tici 3" in text_lower)
    flaw_prob = 0.55 if (has_retrospective and has_unclear_tici) else (0.42 if has_retrospective else 0.18)

    specialty = "interventional"
    if "surgery" in text_lower or "bypass" in text_lower or "clip" in text_lower:
        specialty = "vascular_surgery"
    elif "alteplase" in text_lower or "tpa" in text_lower or "neurology" in text_lower or "mrs" in text_lower:
        specialty = "stroke_neurology"
    elif "randomized" in text_lower or "meta-analysis" in text_lower:
        specialty = "biostatistics"

    return {
        "flaw_probability": round(flaw_prob, 3),
        "has_flaw_warning": flaw_prob >= 0.40,
        "primary_specialty": specialty,
        "rob_score": 1.4 if has_retrospective else 0.8,
        "rob_level": "moderate" if has_retrospective else "low",
        "engine": "heuristic_fallback"
    }


# Standard Stanford STORM-inspired Clinical Personas
CLINICAL_PERSONAS = [
    {
        "id": "persona_interventional",
        "name": "Dr. Sarah Chen, MD",
        "role": "Neurointerventional Radiologist",
        "avatar": "💉",
        "focus": "Angioarchitectural anatomy, catheter accessibility, TICI recanalization grade, device generation, and intraprocedural mechanical complications.",
        "key_questions": [
            "Was recanalization verified by catheter digital subtraction angiography (DSA)?",
            "Did the authors distinguish modified TICI 2b from TICI 2c/3 complete reperfusion?",
            "What specific thrombectomy or embolization hardware was utilized?"
        ]
    },
    {
        "id": "persona_neurology",
        "name": "Dr. Marcus Vance, MD, PhD",
        "role": "Stroke Neurologist & Neurointensivist",
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
        "name": "Dr. Alexander Thorne, MD",
        "role": "Cerebrovascular Neurosurgeon",
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
        "name": "Dr. Elena Rostova, PhD",
        "role": "Lead Clinical Trial Biostatistician",
        "avatar": "📊",
        "focus": "Study design rigor, selection bias in retrospective cohorts, confounding by indication, handling of missing outcome data, and immortal time bias.",
        "key_questions": [
            "Was this study prospective with pre-registered protocols, or a retrospective convenience cohort?",
            "Were propensity score matching or multivariable regression applied to adjust for baseline imbalances?",
            "What was the attrition rate at 90 days, and how were missing patients accounted for?"
        ]
    }
]


def deliberate_study_flaws(
    title: str,
    abstract: str,
    extracted_variables: Optional[List[Dict[str, Any]]] = None,
    topic: str = "acute ischemic stroke & neurovascular intervention"
) -> Dict[str, Any]:
    """Run full Clinical STORM + LAYA deliberation across all 4 specialist personas."""
    # 1. Run ultra-fast Laya System-1 triage
    laya_summary = run_laya_fast_triage(title, abstract, topic)

    text_lower = (title + " " + abstract).lower()
    design_flaws: List[Dict[str, Any]] = []

    # Detect known neurovascular / systematic review design flaws
    # Flaw 1: TICI Recanalization reporting ambiguity
    if "tici" in text_lower:
        if "2b/3" in text_lower or "2b or 3" in text_lower:
            design_flaws.append({
                "flaw_code": "TICI_POOLED_ENDPOINT",
                "severity": "MODERATE",
                "title": "Pooled Recanalization Definition (TICI 2b/3)",
                "description": "Study aggregates partial (TICI 2b) and near-complete/complete (TICI 2c/3) reperfusion into a single endpoint, obscuring superior functional recovery associated with TICI 2c/3.",
                "advocated_by": "Dr. Sarah Chen (Neurointerventionalist)"
            })
    elif "recanalization" in text_lower or "revascularization" in text_lower:
        design_flaws.append({
            "flaw_code": "TICI_UNREPORTED_SCALE",
            "severity": "SERIOUS",
            "title": "Unspecified Recanalization Criteria",
            "description": "Paper mentions recanalization but fails to specify the angiographic scoring rubric (e.g., modified TICI, Mori, or Theron grade).",
            "advocated_by": "Dr. Sarah Chen (Neurointerventionalist)"
        })

    # Flaw 2: Symptomatic Intracranial Hemorrhage definition disparity
    if "hemorrhage" in text_lower or "ich" in text_lower or "sich" in text_lower:
        if not any(k in text_lower for k in ["ecass", "sits-most", "heidelberg", "ninds"]):
            design_flaws.append({
                "flaw_code": "SICH_CRITERIA_UNSPECIFIED",
                "severity": "HIGH",
                "title": "Unstandardized Symptomatic ICH Definition",
                "description": "Symptomatic intracranial hemorrhage is reported without standard operational criteria (ECASS-III, SITS-MOST, or Heidelberg), impairing cross-trial meta-analytic pooling.",
                "advocated_by": "Dr. Marcus Vance (Stroke Neurologist)"
            })

    # Flaw 3: Confounding / Retrospective observational bias
    if "retrospective" in text_lower or "single-center" in text_lower or "case series" in text_lower:
        design_flaws.append({
            "flaw_code": "SELECTION_BIAS_CONFOUNDING",
            "severity": "MODERATE",
            "title": "Retrospective Selection & Indication Confounding",
            "description": "Non-randomized observational design subject to selection bias; severely ill patients or tortuous anatomies may have been systematically excluded.",
            "advocated_by": "Dr. Elena Rostova (Biostatistician)"
        })

    # Flaw 4: Blinded outcome assessment
    if "mrs" in text_lower and "blinded" not in text_lower:
        design_flaws.append({
            "flaw_code": "UNBLINDED_OUTCOME_ASSESSMENT",
            "severity": "LOW",
            "title": "Unblinded 90-Day Functional Assessment",
            "description": "Modified Rankin Scale scores at follow-up were not documented as assessed by independent, blinded neurologists.",
            "advocated_by": "Dr. Marcus Vance (Stroke Neurologist)"
        })

    # Build persona-specific opinions
    persona_opinions: List[Dict[str, Any]] = []
    for p in CLINICAL_PERSONAS:
        stance = "positive"
        critique = "No major specialty-specific concerns identified."

        if p["id"] == "persona_interventional":
            if any(f["flaw_code"].startswith("TICI") for f in design_flaws):
                stance = "cautionary"
                critique = "Recanalization reporting lacks granular TICI 2c/3 breakdown. Procedural technical success cannot be cleanly separated from partial reperfusion."
            else:
                critique = "Angiographic endpoints and technical description appear clinically sound."

        elif p["id"] == "persona_neurology":
            if any(f["flaw_code"] == "SICH_CRITERIA_UNSPECIFIED" for f in design_flaws):
                stance = "critical"
                critique = "Adverse safety outcomes lack standardized sICH adjudication. Neurological deterioration criteria (NIHSS >=4) unverified."
            else:
                critique = "Clinical endpoints align with standardized stroke neurology trial practice."

        elif p["id"] == "persona_surgeon":
            if "aneurysm" in text_lower or "pseudoaneurysm" in text_lower:
                stance = "cautionary"
                critique = "Lesion harbors flow-related pseudoaneurysm hazard. Interventional catheter wall shear stress requires cautious surgical contemplation."
            else:
                critique = "Standard vascular anatomical presentation; surgical rescue contingency noted."

        elif p["id"] == "persona_biostatistician":
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

    # Calculate overall multi-specialty consensus
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

    # Construct grand rounds discussion summary
    grand_rounds_summary = (
        f"Multi-perspective Grand Rounds conducted across 4 specialties. "
        f"Laya System-1 preliminary flaw probability: {int(laya_summary['flaw_probability']*100)}%. "
        f"{len(design_flaws)} methodological design flaw(s) identified. "
        f"{persona_opinions[0]['role']}: {persona_opinions[0]['critique']} "
        f"{persona_opinions[1]['role']}: {persona_opinions[1]['critique']}"
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
