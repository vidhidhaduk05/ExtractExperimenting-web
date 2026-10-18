"""Universal clinical data extraction gap rules (G1-G5)."""
from __future__ import annotations

import re
from typing import Any, Optional


def apply_g1_fixed_horizon(extractions: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """G1: Fixed-Horizon Follow-Up rule.
    If median_followup_months is missing (-99), checks for administrative/fixed follow-up phrases."""
    results = []
    text_lower = full_text.lower()

    # Look for follow-up patterns
    match_years = re.search(r"(?:followed for|follow-up of|censored at|administrative censoring at)\s+(\d+(?:\.\d+)?)\s*(?:years|year|yr|yrs)", text_lower)
    match_months = re.search(r"(?:followed for|follow-up of|censored at|administrative censoring at)\s+(\d+(?:\.\d+)?)\s*(?:months|month|mo|mos)", text_lower)

    for ext in extractions:
        item = dict(ext)
        v_name = (item.get("variable_name") or item.get("name") or "").lower()
        val = str(item.get("value", "")).strip()

        if v_name in ("median_followup_months", "followup_months", "median_follow_up_months", "follow_up_duration") and val in ("-99", "", "None"):
            if match_years:
                yrs = float(match_years.group(1))
                mos = int(yrs * 12)
                item["value"] = str(mos)
                item["confidence"] = 0.85
                item["confidence_tag"] = "[CALC]"
                item["source_text"] = f"Fixed administrative censoring at {mos} months ({yrs} years) — no reported median"
            elif match_months:
                mos = int(float(match_months.group(1)))
                item["value"] = str(mos)
                item["confidence"] = 0.85
                item["confidence_tag"] = "[CALC]"
                item["source_text"] = f"Fixed administrative censoring at {mos} months — no reported median"

        results.append(item)
    return results


def apply_g2_comparator_heterogeneity(extractions: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """G2: Comparator Arm Heterogeneity rule.
    Detects mixed comparator classes (e.g., VKA and DOAC, multiple standard of care drugs)."""
    results = []
    text_lower = full_text.lower()

    is_mixed = False
    if ("vka" in text_lower and "doac" in text_lower) or \
       ("warfarin" in text_lower and "doac" in text_lower) or \
       ("warfarin" in text_lower and ("apixaban" in text_lower or "rivaroxaban" in text_lower or "dabigatran" in text_lower or "edoxaban" in text_lower)) or \
       "any oral anticoagulant" in text_lower or "mixed comparator" in text_lower:
        is_mixed = True

    for ext in extractions:
        item = dict(ext)
        v_name = (item.get("variable_name") or item.get("name") or "").lower()

        if any(c in v_name for c in ("comparator_type", "control_arm", "comparator", "control_type")):
            if is_mixed:
                item["value"] = "mixed"
                item["confidence_tag"] = "[INF]"
                note = "[NOTE: Comparator arm includes mixed drug classes — check pooling eligibility.]"
                if note not in item.get("source_text", ""):
                    item["source_text"] = f"{item.get('source_text', '')} {note}".strip()

        results.append(item)
    return results


def apply_g3_subgroup_detection(extractions: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """G3: Subgroup/Substudy Detection rule.
    Detects if the cohort is drawn from a larger parent trial/registry."""
    results = []
    text_lower = full_text.lower()

    subgroup_match = re.search(
        r"(?:enrolled in|drawn from|restricted to|subset of|participants from|data from the|post[- ]hoc analysis of)\s+([A-Za-z0-9\-_]+(?:\s+[A-Za-z0-9\-_]+){0,4}\s+(?:trial|study|registry|cohort))",
        text_lower,
    )
    is_subgroup = bool(subgroup_match or "subset of" in text_lower or "substudy" in text_lower or "sub-study" in text_lower)

    for ext in extractions:
        item = dict(ext)
        v_name = (item.get("variable_name") or item.get("name") or "").lower()

        if any(s in v_name for s in ("subgroup_or_substudy", "substudy", "is_subgroup", "subgroup_flag")):
            if is_subgroup:
                parent_name = subgroup_match.group(1).strip() if subgroup_match else "parent study"
                item["value"] = "Y"
                item["confidence_tag"] = "[INF]"
                item["source_text"] = f"Subgroup/substudy detected: subset of {parent_name}"
            else:
                item["value"] = "N"
                item["confidence_tag"] = "[DS]"
                item["source_text"] = "Primary publication / independent cohort"

        results.append(item)
    return results


def apply_g4_immortal_time_bias(extractions: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """G4: Immortal Time Bias detection.
    Flags potential immortal time bias in non-randomized studies."""
    results = []
    text_lower = full_text.lower()

    is_randomized = "randomized" in text_lower or "rct" in text_lower or "randomised" in text_lower
    has_timing_mismatch = bool(re.search(
        r"(?:follow-up started|time-to-event from|index date defined as|counted after)\s+(?:procedure|device implantation|waiting period|treatment initiation|discharge)",
        text_lower,
    )) or "after device implantation" in text_lower or "after procedure" in text_lower

    for ext in extractions:
        item = dict(ext)
        v_name = (item.get("variable_name") or item.get("name") or "").lower()

        if not is_randomized and has_timing_mismatch:
            if any(b in v_name for b in ("immortal_time", "bias", "confounding", "risk_of_bias", "rob", "limitations")):
                note = "[IMMORTAL TIME BIAS: Follow-up starts at different time points for intervention vs control arm]"
                if note not in item.get("source_text", ""):
                    item["source_text"] = f"{item.get('source_text', '')} {note}".strip()

        results.append(item)
    return results


def apply_g5_effect_conflict(extractions: list[dict[str, Any]], full_text: str) -> list[dict[str, Any]]:
    """G5: Effect Estimate Conflict Resolution.
    Identifies conflicting estimates (e.g. HR in abstract vs table) and picks consistent/conservative value with [CONFLICT] tag."""
    results = []

    # Find multiple HR values mentioned in text
    hr_matches = re.findall(r"(?:hazard ratio|hr)\s*(?:=|of|:)?\s*(\d+\.\d+)", full_text, re.IGNORECASE)
    unique_hrs = list(dict.fromkeys(hr_matches))

    for ext in extractions:
        item = dict(ext)
        v_name = (item.get("variable_name") or item.get("name") or "").lower()

        if v_name in ("hr", "hazard_ratio", "primary_hr") and len(unique_hrs) > 1:
            val1 = float(unique_hrs[0])
            val2 = float(unique_hrs[1])
            # Conservative estimate is closer to null (1.0)
            diff1 = abs(val1 - 1.0)
            diff2 = abs(val2 - 1.0)
            conservative_val = val1 if diff1 <= diff2 else val2

            item["value"] = str(conservative_val)
            item["confidence_tag"] = "[CONFLICT]"
            item["source_text"] = f"Conflicting HR reported ({val1} vs {val2}); selected conservative estimate {conservative_val} closer to null."

        results.append(item)
    return results
