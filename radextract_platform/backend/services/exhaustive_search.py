"""Exhaustive Search Strategy (7-Step + Recheck Pass) for clinical data extraction."""
from __future__ import annotations

import re
from typing import Any, Optional

COMMON_ABBREVIATIONS = {
    "hr": "hazard ratio",
    "ci": "confidence interval",
    "rr": "relative risk",
    "or": "odds ratio",
    "sd": "standard deviation",
    "se": "standard error",
    "iqr": "interquartile range",
    "auc": "area under the curve",
    "roc": "receiver operating characteristic",
    "ppv": "positive predictive value",
    "npv": "negative predictive value",
    "sens": "sensitivity",
    "spec": "specificity",
}


def _extract_number_or_sentence(text: str, keyword: str) -> Optional[tuple[str, str]]:
    """Search for a keyword in text and try to extract a numerical value and surrounding sentence."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    kw_pattern = r"\b" + re.escape(keyword.lower()) + r"\b"

    for s in sentences:
        if re.search(kw_pattern, s.lower()):
            # Look for number patterns in sentence
            num_match = re.search(r"(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?(?:\s*%)?)", s)
            if num_match:
                return num_match.group(1).strip(), s.strip()
            return s.strip(), s.strip()
    return None


def exhaustive_extract(
    variable: str,
    full_text: str,
    pdf_pages: Optional[list[dict]] = None,
    supplement_text: Optional[str] = None,
    existing_values: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """7-Step multi-location search before declaring a variable missing."""
    v_clean = variable.strip().lower()
    existing = existing_values or {}

    # Step 1: Check if already present in structured results
    if v_clean in existing and existing[v_clean] not in (None, "", "-99", "-77", "-88"):
        val = str(existing[v_clean])
        return {
            "value": val,
            "confidence": 0.85,
            "source_text": f"Found in structured blocks: {val}",
            "source_page": 1,
            "confidence_tag": "[DS]",
        }

    # Step 2: Abstract search
    abstract_match = re.search(r"abstract[\s\S]*?(?:introduction|background|methods|results|1\.)", full_text, re.IGNORECASE)
    abstract_text = abstract_match.group(0) if abstract_match else full_text[:1500]
    res_abs = _extract_number_or_sentence(abstract_text, v_clean)
    if res_abs:
        val, sent = res_abs
        return {
            "value": val,
            "confidence": 0.80,
            "source_text": sent,
            "source_page": 1,
            "confidence_tag": "[DS]",
        }

    # Step 3: Table search in pdf_pages / table text
    if pdf_pages:
        for p in pdf_pages:
            p_text = p.get("text", "") or ""
            p_num = p.get("page_number", 1)
            # Look for table indicators
            if ("table" in p_text.lower() or "|" in p_text or "\t" in p_text) and v_clean in p_text.lower():
                res_tab = _extract_number_or_sentence(p_text, v_clean)
                if res_tab:
                    val, sent = res_tab
                    return {
                        "value": val,
                        "confidence": 0.80,
                        "source_text": sent,
                        "source_page": p_num,
                        "confidence_tag": "[DS]",
                    }

    # Step 4: Results section search
    results_match = re.search(r"(?:results|findings)[\s\S]*?(?:discussion|conclusion|limitations|references)", full_text, re.IGNORECASE)
    if results_match:
        results_text = results_match.group(0)
        res_res = _extract_number_or_sentence(results_text, v_clean)
        if res_res:
            val, sent = res_res
            return {
                "value": val,
                "confidence": 0.75,
                "source_text": sent,
                "source_page": 1,
                "confidence_tag": "[DS]",
            }

    # Step 5: Supplement search
    if supplement_text:
        res_sup = _extract_number_or_sentence(supplement_text, v_clean)
        if res_sup:
            val, sent = res_sup
            return {
                "value": val,
                "confidence": 0.70,
                "source_text": sent,
                "source_page": 1,
                "confidence_tag": "[SUP: supplement]",
            }

    # Step 6: Synonym / Abbreviation search
    expanded_synonyms = []
    if v_clean in COMMON_ABBREVIATIONS:
        expanded_synonyms.append(COMMON_ABBREVIATIONS[v_clean])
    for k, syn in COMMON_ABBREVIATIONS.items():
        if syn == v_clean or syn in v_clean:
            expanded_synonyms.append(k)

    words = v_clean.replace("_", " ").split()
    for syn in expanded_synonyms + words:
        if len(syn) > 2:
            res_syn = _extract_number_or_sentence(full_text, syn)
            if res_syn:
                val, sent = res_syn
                return {
                    "value": val,
                    "confidence": 0.65,
                    "source_text": sent,
                    "source_page": 1,
                    "confidence_tag": "[INF]",
                }

    # Step 7: Mathematical derivations
    try:
        if v_clean == "pct_female" and "pct_male" in existing:
            m_val = float(str(existing["pct_male"]).replace("%", "").strip())
            f_val = 100.0 - m_val
            return {
                "value": str(round(f_val, 1)),
                "confidence": 0.90,
                "source_text": f"Calculated: 100 - pct_male ({m_val}) = {f_val}",
                "source_page": 1,
                "confidence_tag": "[CALC]",
            }
        if v_clean == "pct_male" and "pct_female" in existing:
            f_val = float(str(existing["pct_female"]).replace("%", "").strip())
            m_val = 100.0 - f_val
            return {
                "value": str(round(m_val, 1)),
                "confidence": 0.90,
                "source_text": f"Calculated: 100 - pct_female ({f_val}) = {m_val}",
                "source_page": 1,
                "confidence_tag": "[CALC]",
            }
        if v_clean in ("total_n", "sample_size", "n_total") and "n_arm1" in existing and "n_arm2" in existing:
            n1 = float(str(existing["n_arm1"]).strip())
            n2 = float(str(existing["n_arm2"]).strip())
            total = int(n1 + n2)
            return {
                "value": str(total),
                "confidence": 0.90,
                "source_text": f"Calculated: n_arm1 ({n1}) + n_arm2 ({n2}) = {total}",
                "source_page": 1,
                "confidence_tag": "[CALC]",
            }
        if v_clean == "sd" and "iqr" in existing:
            iqr_val = float(str(existing["iqr"]).strip())
            sd_val = round(iqr_val / 1.35, 2)
            return {
                "value": str(sd_val),
                "confidence": 0.85,
                "source_text": f"Calculated: iqr ({iqr_val}) / 1.35 = {sd_val} (normal approximation)",
                "source_page": 1,
                "confidence_tag": "[CALC]",
            }
    except Exception:
        pass

    return None


def recheck_missing(
    extractions: list[dict[str, Any]],
    full_text: str,
    pdf_pages: Optional[list[dict]] = None,
) -> list[dict[str, Any]]:
    """Recheck pass on extractions with value '-99' by targeting the single most likely location."""
    results = []

    # Map field patterns to search sections
    location_patterns = {
        "demographics": ("table 1", "baseline", "characteristics", "patient demographics", "demographic"),
        "followup": ("follow-up", "follow up", "median follow-up", "months", "duration"),
        "primary_outcome": ("primary endpoint", "hazard ratio", "hr", "relative risk", "odds ratio"),
        "secondary_outcome": ("secondary endpoint", "secondary outcome", "table 2", "table 3"),
        "procedure": ("procedure", "intervention", "technique", "protocol", "methods"),
        "registration": ("clinicaltrials.gov", "nct", "isrctn", "registration", "ethics"),
        "funding": ("funding", "supported by", "grant", "financial support", "acknowledgements"),
        "subgroup": ("subgroup", "subset", "cohort", "drawn from", "enrolled in"),
    }

    for ext in extractions:
        item = dict(ext)
        val = str(item.get("value", "")).strip()

        if val == "-99":
            v_name = (item.get("variable_name") or item.get("name") or "").lower()

            # Determine likely section
            matched_keywords = []
            if any(k in v_name for k in ("age", "male", "female", "bmi", "demographic", "baseline", "sample_size")):
                matched_keywords = location_patterns["demographics"]
            elif any(k in v_name for k in ("followup", "follow_up", "duration", "horizon")):
                matched_keywords = location_patterns["followup"]
            elif any(k in v_name for k in ("primary", "hr", "rr", "or", "endpoint", "mortality")):
                matched_keywords = location_patterns["primary_outcome"]
            elif any(k in v_name for k in ("registration", "trial_id", "nct")):
                matched_keywords = location_patterns["registration"]
            elif any(k in v_name for k in ("subgroup", "substudy", "cohort")):
                matched_keywords = location_patterns["subgroup"]

            # Recheck search
            found_val = None
            found_sentence = None
            for kw in matched_keywords:
                match = _extract_number_or_sentence(full_text, kw)
                if match:
                    found_val, found_sentence = match
                    break

            if found_val and found_sentence:
                item["value"] = str(found_val)
                item["confidence"] = 0.70
                item["confidence_tag"] = "[RECHECK]"
                item["source_text"] = f"[RECHECK PASS]: {found_sentence}"

        results.append(item)

    return results
