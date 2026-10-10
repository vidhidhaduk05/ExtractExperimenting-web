"""Protocol descriptive synthesis: Wilson proportions and medians with IQR.

NR and blank values stay missing. Nothing is imputed.
"""
from __future__ import annotations

import math
from typing import Any, Optional


_MISSING = {"", "nr", "n/r", "not reported", "not found", "na", "n/a", "none"}


def wilson_ci(successes: int, total: int, z: float = 1.96) -> Optional[dict]:
    """Wilson score interval for a binomial proportion."""
    if total <= 0:
        return None
    phat = successes / total
    z2 = z * z
    denom = 1 + z2 / total
    center = (phat + z2 / (2 * total)) / denom
    margin = z * math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total) / denom
    low = max(0.0, center - margin)
    high = min(1.0, center + margin)
    return {
        "k": successes,
        "n": total,
        "proportion": round(phat, 4),
        "ci_low": round(low, 4),
        "ci_high": round(high, 4),
    }


def _is_missing(value: str) -> bool:
    return value.strip().lower() in _MISSING


def _quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = (len(sorted_vals) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return sorted_vals[lo]
    weight = pos - lo
    return sorted_vals[lo] * (1 - weight) + sorted_vals[hi] * weight


def median_iqr(values: list[float]) -> Optional[dict]:
    if not values:
        return None
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "median": round(_quantile(ordered, 0.5), 4),
        "q1": round(_quantile(ordered, 0.25), 4),
        "q3": round(_quantile(ordered, 0.75), 4),
    }


def _as_number(value: str) -> Optional[float]:
    text = value.strip().replace(",", "")
    if not text or _is_missing(text):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def summarize_variable(name: str, field_type: str, values: list[str]) -> dict:
    """Summarize one extracted variable. Missing codes are excluded from the denominator."""
    present = [value.strip() for value in values if not _is_missing(value or "")]
    missing = len(values) - len(present)
    field = (field_type or "").lower()
    numbers = [_as_number(value) for value in present]
    numeric = [value for value in numbers if value is not None]
    use_numeric = field in {"number", "numeric", "continuous", "integer", "float"} or (
        present and len(numeric) == len(present)
    )
    if use_numeric:
        return {
            "name": name,
            "field_type": field_type,
            "missing": missing,
            "summary": "median_iqr",
            "result": median_iqr(numeric),
        }

    counts: dict[str, int] = {}
    for value in present:
        key = value.lower()
        counts[key] = counts.get(key, 0) + 1
    n = len(present)
    levels = []
    for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        interval = wilson_ci(count, n)
        levels.append({"level": key, "count": count, **(interval or {})})
    binary_keys = {"present", "absent", "yes", "no", "y", "n"}
    binary = None
    if counts and set(counts).issubset(binary_keys):
        successes = counts.get("present", 0) + counts.get("yes", 0) + counts.get("y", 0)
        binary = wilson_ci(successes, n)
    return {
        "name": name,
        "field_type": field_type,
        "missing": missing,
        "summary": "proportions",
        "binary": binary,
        "levels": levels,
    }


def synthesize_project(rows: list[dict]) -> dict:
    """rows: variable_name, field_type, value, study_id."""
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = row.get("name") or ""
        if not name:
            continue
        bucket = grouped.setdefault(name, {
            "field_type": row.get("field_type") or "",
            "values": [],
            "studies": set(),
        })
        bucket["values"].append(row.get("value") or "")
        if row.get("study_id"):
            bucket["studies"].add(row["study_id"])
    variables = []
    for name, bucket in grouped.items():
        summary = summarize_variable(name, bucket["field_type"], bucket["values"])
        summary["studies"] = len(bucket["studies"])
        variables.append(summary)
    return {
        "variables": variables,
        "note": (
            "Proportions use Wilson 95% CIs. Continuous variables use median and IQR. "
            "NR values are left missing and are not imputed. "
            "This is descriptive pooling, not a formal meta-analysis."
        ),
    }
