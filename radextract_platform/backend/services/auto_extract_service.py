"""Automated data extraction service: extracts variable values from PDF text using Gemini LLM, exhaustive search, gap rules, and missing data taxonomy."""
from __future__ import annotations

import difflib
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import pdf_service
from services.llm_extractor import is_llm_available, extract_variables_with_llm
from services.exhaustive_search import exhaustive_extract, recheck_missing
from services.gap_rules import (
    apply_g1_fixed_horizon,
    apply_g2_comparator_heterogeneity,
    apply_g3_subgroup_detection,
    apply_g4_immortal_time_bias,
    apply_g5_effect_conflict,
)
from services.laya_extraction_tracer import trace_all_extractions

logger = logging.getLogger("radextract.extraction")

VARIABLE_KEYWORDS: dict[str, list[str]] = {
    "sensitivity": ["sensitivity", "sensitivities", "true positive rate", "TPR"],
    "specificity": ["specificity", "specificities", "true negative rate", "TNR"],
    "accuracy": ["accuracy", "diagnostic accuracy", "overall accuracy"],
    "ppv": ["positive predictive value", "PPV", "precision"],
    "npv": ["negative predictive value", "NPV"],
    "auc": ["AUC", "area under the curve", "ROC"],
    "sample_size": ["sample size", "total of", "patients were", "participants were", "subjects were", "n ="],
    "mean_age": ["mean age", "average age", "age range", "median age", "years old"],
    "age": ["mean age", "average age", "age range", "median age", "years old"],
    "male": ["male", "men", "sex", "gender"],
    "female": ["female", "women", "sex", "gender"],
    "study_design": ["study design", "retrospective", "prospective", "cross-sectional", "case report", "cohort"],
    "modality": ["modality", "imaging", "MRI", "CT", "ultrasound", "radiography", "DSA", "MRA", "CTA", "angiography"],
    "aneurysm": ["aneurysm", "aneurysms", "flow-related", "saccular", "fusiform", "dysplastic"],
    "stroke": ["stroke", "infarct", "infarction", "ischemia", "ischemic", "hemorrhage", "hemorrhagic", "SAH", "ICH"],
    "treatment": ["treatment", "management", "conservative", "surgical", "endovascular", "coiling", "stenting", "clipping"],
    "outcome": ["outcome", "mRS", "modified Rankin", "recovery", "follow-up", "survival", "death"],
    "location": ["location", "artery", "territory", "MCA", "ACA", "ICA", "PCA", "PICA", "Acom", "Pcom"],
}


def _is_scanned_pdf(pdf_data: Optional[dict[str, Any]]) -> bool:
    """Check if PDF has pages but lacks a text layer (< 100 characters)."""
    if not pdf_data:
        return False
    pages = pdf_data.get("pages") or []
    full_text = (pdf_data.get("full_text") or "").strip()
    if len(pages) > 0 and len(full_text) < 100:
        return True
    return False


def _find_keyword_in_text(text: str, keywords: list[str]) -> Optional[dict]:
    text_lower = text.lower()
    for kw in keywords:
        kw_lower = kw.lower()
        idx = text_lower.find(kw_lower)
        if idx != -1:
            start = max(0, text.rfind(".", 0, idx) + 1)
            end = text.find(".", idx + len(kw_lower))
            if end == -1:
                end = min(len(text), idx + 200)
            else:
                end = end + 1

            sentence = text[start:end].strip()
            if len(sentence) > 10:
                est_page = max(1, idx // 2500 + 1)
                return {
                    "value": sentence[:150],
                    "source_page": est_page,
                    "confidence": 0.70,
                    "source_text": sentence[:300],
                    "confidence_tag": "[DS]",
                }
    return None


def _match_variable_to_keywords(var_name: str, var_desc: str = "") -> list[str]:
    """Map variable name to extraction keyword patterns."""
    name_lower = var_name.lower().replace("_", " ")
    desc_lower = (var_desc or "").lower()
    combined = f"{name_lower} {desc_lower}"

    for cat_name, kw_list in VARIABLE_KEYWORDS.items():
        if cat_name in combined or any(kw.lower() in combined for kw in kw_list):
            return kw_list

    # Fallback to variable name words
    words = [w for w in name_lower.split() if len(w) > 2]
    return words or [name_lower]


def verify_quote_provenance(quote: str, full_text: str, threshold: float = 0.85) -> tuple[bool, float]:
    """Verify that an extracted quote actually appears in the document text (§1.2).
    Uses normalized exact matching, punctuation-insensitive matching, and difflib fuzzy matching.
    Returns (is_verified, match_score).
    """
    if not quote or not full_text:
        return False, 0.0
    if quote.startswith("[MISSING:"):
        return True, 1.0

    q_norm = " ".join(quote.lower().split())
    if not q_norm:
        return False, 0.0

    t_norm = " ".join(full_text.lower().split())
    if q_norm in t_norm:
        return True, 1.0

    # Punctuation/hyphen-insensitive match (common OCR variation)
    q_nopunct = " ".join(re.sub(r"[^\w\s]", " ", q_norm).split())
    t_nopunct = " ".join(re.sub(r"[^\w\s]", " ", t_norm).split())
    if q_nopunct and q_nopunct in t_nopunct:
        return True, 0.98

    sentences = re.split(r"(?<=[.!?])\s+", t_norm)
    q_words = [w for w in q_norm.split() if len(w) > 3]
    best_ratio = 0.0

    for s in sentences:
        if q_words and not any(w in s for w in q_words):
            continue
        # Direct ratio
        direct_ratio = difflib.SequenceMatcher(None, q_norm, s).ratio()
        if direct_ratio > best_ratio:
            best_ratio = direct_ratio
        if best_ratio >= threshold:
            return True, best_ratio

        # Sliding window within the sentence if sentence is longer than quote
        if len(s) > len(q_norm):
            q_len = len(q_norm)
            for start_idx in range(0, len(s) - q_len + 1, max(1, q_len // 4)):
                window = s[start_idx : start_idx + q_len]
                w_ratio = difflib.SequenceMatcher(None, q_norm, window).ratio()
                if w_ratio > best_ratio:
                    best_ratio = w_ratio
                    if best_ratio >= threshold:
                        return True, best_ratio

    # Document-wide sliding window fallback for long quotes spanning boundaries
    if best_ratio < threshold and len(q_norm) > 30:
        step = max(10, len(q_norm) // 4)
        for i in range(0, max(1, len(t_norm) - len(q_norm) + 1), step):
            window = t_norm[i : i + len(q_norm)]
            ratio = difflib.SequenceMatcher(None, q_norm, window).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                if best_ratio >= threshold:
                    return True, best_ratio

    return best_ratio >= threshold, best_ratio


def auto_extract(study_id: str, project_id: str, reviewer: str = "auto", db: Optional[DBBackend] = None) -> dict:
    db = db or get_db_backend()
    pdf_data = pdf_service.get_pdf_data(study_id, db=db)
    if not pdf_data:
        try:
            pdf_data = pdf_service.process_pdf(study_id, db=db)
        except Exception as e:
            logger.warning(f"Could not process PDF for study {study_id}: {e}")

    full_text = pdf_data.get("full_text", "") if pdf_data else ""

    study = db.get("studies", study_id)
    if not study:
        raise ValueError(f"Study {study_id} not found")

    if not full_text:
        t = study.get("title") or ""
        ab = study.get("abstract") or ""
        full_text = f"Title: {t}\nAbstract: {ab}"

    variables = db.query("variables", {"project_id": project_id}, order_by="section")
    if not variables:
        return {"study_id": study_id, "extracted": 0, "skipped": 0, "message": "No variables defined"}

    now = datetime.now(timezone.utc).isoformat()
    pdf_pages = pdf_data.get("pages") if pdf_data else []
    is_scanned = _is_scanned_pdf(pdf_data)

    # Scanned PDF handling (-88)
    if is_scanned:
        for var in variables:
            var_id = var["variable_id"]
            existing = db.query("extractions", {"study_id": study_id, "variable_id": var_id})
            data = {
                "value": "-88",
                "confidence": 0.0,
                "confidence_tag": "",
                "source_page": None,
                "source_bbox": "",
                "source_text": "[MISSING: -88] Unable to extract — PDF is scanned/image-only",
                "extracted_by": reviewer,
                "extracted_at": now,
                "is_edited": 0,
            }
            if existing:
                db.update("extractions", existing[0]["extraction_id"], data)
            else:
                db.insert("extractions", {"extraction_id": str(uuid.uuid4()), "study_id": study_id, "variable_id": var_id, **data})
        db.update("studies", study_id, {"extraction_status": "auto_extracted"})
        db.commit()
        return {
            "study_id": study_id,
            "extracted": len(variables),
            "skipped": 0,
            "total_variables": len(variables),
            "missing_code": "-88",
        }

    # 1. Primary Extraction: LLM
    llm_results = {}
    if is_llm_available() and len(full_text) > 30:
        try:
            raw_results = extract_variables_with_llm(
                study_text=full_text,
                variables=variables,
            )
            for item in raw_results:
                name = item.get("name", "")
                if name:
                    llm_results[name] = item
        except Exception as e:
            logger.warning(f"LLM extraction failed for {study_id}: {e}")

    # Build initial extraction candidate list
    extractions_work: list[dict[str, Any]] = []
    found_values_map: dict[str, Any] = {}

    for var in variables:
        var_id = var["variable_id"]
        var_name = var["name"]

        val = None
        conf = 0.0
        quote = ""
        src_page = 1
        conf_tag = ""

        # Check LLM output
        if var_name in llm_results and llm_results[var_name].get("value"):
            l_item = llm_results[var_name]
            l_val = str(l_item.get("value", "")).strip()
            if l_val and l_val.lower() not in ("not reported", "n/a", "none", "unknown", "null", "-99"):
                val = l_val
                quote = str(l_item.get("source_text", l_item.get("quote", ""))).strip()
                conf = float(l_item.get("confidence", 0.90))
                src_page = int(l_item.get("source_page", 1))
                conf_tag = l_item.get("confidence_tag", "[DS]")

        # Check Keyword match if LLM missed
        if not val and full_text:
            kws = [var_name.replace("_", " ")]
            for k, kw_list in VARIABLE_KEYWORDS.items():
                if k in var_name.lower():
                    kws.extend(kw_list)
            match = _find_keyword_in_text(full_text, kws)
            if match:
                val = match["value"]
                quote = match["source_text"]
                conf = match["confidence"]
                src_page = match["source_page"]
                conf_tag = match.get("confidence_tag", "[DS]")

        if val:
            found_values_map[var_name.lower()] = val

        extractions_work.append({
            "variable_id": var_id,
            "variable_name": var_name,
            "name": var_name,
            "value": val,
            "confidence": conf,
            "source_text": quote,
            "source_page": src_page,
            "confidence_tag": conf_tag,
        })

    # 2. Exhaustive Search for missing variables
    for item in extractions_work:
        if not item.get("value"):
            v_name = item["variable_name"]
            ex_res = exhaustive_extract(
                variable=v_name,
                full_text=full_text,
                pdf_pages=pdf_pages,
                existing_values=found_values_map,
            )
            if ex_res:
                item["value"] = ex_res["value"]
                item["confidence"] = ex_res["confidence"]
                item["source_text"] = ex_res["source_text"]
                item["source_page"] = ex_res["source_page"]
                item["confidence_tag"] = ex_res["confidence_tag"]
                found_values_map[v_name.lower()] = ex_res["value"]
            else:
                # Check not applicable vs not reported
                study_design_val = str(study.get("study_design", "")).lower()
                is_single_arm = "single arm" in study_design_val or "case series" in study_design_val
                if is_single_arm and any(c in v_name.lower() for c in ("comparator", "control", "nma_arm")):
                    item["value"] = "-77"
                    item["confidence"] = 0.0
                    item["confidence_tag"] = ""
                    item["source_text"] = f"[MISSING: -77] Not applicable — single-arm study design"
                else:
                    item["value"] = "-99"
                    item["confidence"] = 0.0
                    item["confidence_tag"] = ""
                    item["source_text"] = f"[MISSING: -99] {v_name} — not reported. Checked: abstract, tables, results, supplement, synonyms, derivation."

    # 3. Targeted Recheck Pass for -99 fields
    extractions_work = recheck_missing(extractions_work, full_text, pdf_pages=pdf_pages)

    # 4. Universal Gap Rules (G1-G5)
    extractions_work = apply_g1_fixed_horizon(extractions_work, full_text)
    extractions_work = apply_g2_comparator_heterogeneity(extractions_work, full_text)
    extractions_work = apply_g3_subgroup_detection(extractions_work, full_text)
    extractions_work = apply_g4_immortal_time_bias(extractions_work, full_text)
    extractions_work = apply_g5_effect_conflict(extractions_work, full_text)

    # 4.5. Laya Verbatim Evidence Tracing (choxos/jev-reviewer pattern)
    try:
        extractions_work = trace_all_extractions(extractions_work, pdf_data or {}, full_text=full_text)
    except Exception as e:
        logger.warning(f"Laya evidence tracing failed for {study_id}: {e}")

    # 5. Save to database
    extracted = 0
    skipped = 0
    results = []

    for item in extractions_work:
        var_id = item["variable_id"]
        var_name = item["variable_name"]
        val = str(item.get("value", "-99"))
        conf = float(item.get("confidence", 0.0))
        conf_tag = item.get("confidence_tag", "")
        src_page = item.get("source_page")
        tracing_status = item.get("tracing_status", "none")
        verification_note = item.get("verification_note", "")
        quote = item.get("source_text") or ""

        # §1.2 Quote/provenance verification guardrail
        if quote and val not in ("-99", "-77", "-88", None, ""):
            is_verified, score = verify_quote_provenance(quote, full_text)
            if not is_verified:
                conf = min(conf, 0.40)
                conf_tag = "[UNVERIFIED QUOTE]"
                if not quote.startswith("[UNVERIFIED QUOTE]"):
                    quote = f"[UNVERIFIED QUOTE] {quote}"

        existing = db.query("extractions", {"study_id": study_id, "variable_id": var_id})
        # D30 / Phase 7: Preserve human-verified or human-edited values across reruns
        if existing and (existing[0].get("is_edited") == 1 or existing[0].get("is_verified") == 1):
            results.append({
                "variable_id": var_id,
                "variable_name": var_name,
                "value": str(existing[0].get("value", ""))[:100],
                "confidence": float(existing[0].get("confidence", 1.0)),
                "confidence_tag": existing[0].get("confidence_tag", "[HUMAN]"),
                "source_page": existing[0].get("source_page"),
                "tracing_status": existing[0].get("tracing_status", "verified"),
            })
            extracted += 1
            continue

        data = {
            "value": val,
            "confidence": conf,
            "confidence_tag": conf_tag,
            "source_page": src_page,
            "source_bbox": "",
            "source_text": quote,
            "tracing_status": tracing_status,
            "verification_note": verification_note,
            "extracted_by": reviewer,
            "extracted_at": now,
            "is_edited": 0,
        }

        if existing:
            db.update("extractions", existing[0]["extraction_id"], data)
        else:
            db.insert("extractions", {
                "extraction_id": str(uuid.uuid4()),
                "study_id": study_id,
                "variable_id": var_id,
                **data,
            })

        if val not in ("-99", "-77", "-88", None, ""):
            extracted += 1
        else:
            skipped += 1

        results.append({
            "variable_id": var_id,
            "variable_name": var_name,
            "value": val[:100],
            "confidence": conf,
            "confidence_tag": conf_tag,
            "source_page": src_page,
        })

    db.update("studies", study_id, {"extraction_status": "auto_extracted"})
    db.commit()

    return {
        "study_id": study_id,
        "extracted": extracted,
        "skipped": skipped,
        "total_variables": len(variables),
        "results": results,
    }
