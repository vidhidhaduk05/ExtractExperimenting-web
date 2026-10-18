"""Descriptive analysis and statistical computation service for RadExtract.

Provides two modules:
1. Data profiling: distributions, missing values, outliers, correlations, summary tables
2. Statistical/meta-analysis: descriptive stats, heterogeneity diagnostics (I², Q, tau²),
   forest/funnel plot data preparation, leave-one-out sensitivity analysis

All computations are deterministic (pandas, scipy, statsmodels, numpy) — zero LLM calls.
"""
from __future__ import annotations

import json
import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from database import get_db_backend
from services.db_backend import DBBackend

logger = logging.getLogger("radextract.analysis")

NUMERIC_FIELD_TYPES = {"float", "int", "percent"}


# ── Helpers ──────────────────────────────────────────────────

def _parse_numeric(value: str) -> Optional[float]:
    """Try to parse a string value as float. Returns None if not numeric."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in ("not reported", "n/a", "none", "unknown", "null", "not found", ""):
        return None
    # Remove common non-numeric chars: %, ranges, CI brackets
    s = s.replace("%", "").replace("±", " ").strip()
    # Handle ranges like "45-55" → take midpoint
    if "-" in s and not s.startswith("-"):
        parts = s.split("-")
        if len(parts) == 2:
            try:
                lo = float(parts[0].strip())
                hi = float(parts[1].strip())
                return (lo + hi) / 2
            except ValueError:
                pass
    # Handle "mean ± SD" format — take the first number
    if "±" in s or " " in s:
        parts = s.split()
        for p in parts:
            try:
                return float(p)
            except ValueError:
                continue
    try:
        return float(s)
    except ValueError:
        return None


def _load_extractions_df(project_id: str, db: Optional[DBBackend] = None) -> pd.DataFrame:
    """Load all extractions for a project into a DataFrame.

    Returns DataFrame with columns: study_id, variable_id, variable_name,
    section, field_type, value (raw text), numeric_value (parsed float or NaN),
    confidence, is_edited, source_page.
    """
    db = db or get_db_backend()
    variables = db.query("variables", {"project_id": project_id}, order_by="section")
    studies = {s["study_id"]: s for s in db.query("studies", {"project_id": project_id})}
    var_map = {v["variable_id"]: v for v in variables}

    rows = []
    for var_id, var in var_map.items():
        exts = db.query("extractions", {"variable_id": var_id})
        for e in exts:
            s = studies.get(e["study_id"])
            if not s:
                continue
            rows.append({
                "study_id": e["study_id"],
                "variable_id": e["variable_id"],
                "value": e.get("value", ""),
                "confidence": e.get("confidence", 0.0),
                "is_edited": e.get("is_edited", 0),
                "source_page": e.get("source_page"),
                "extracted_by": e.get("extracted_by", ""),
                "variable_name": var["name"],
                "section": var.get("section", ""),
                "field_type": var.get("field_type", "text"),
                "allowed_values": var.get("allowed_values", ""),
                "range_min": var.get("range_min"),
                "range_max": var.get("range_max"),
                "study_title": s.get("title", ""),
                "publication_year": s.get("publication_year"),
                "journal": s.get("journal", ""),
                "screening_status": s.get("screening_status", ""),
            })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df.sort_values(by=["study_title", "section", "variable_name"], inplace=True)

    # Parse numeric values
    df["numeric_value"] = df.apply(
        lambda row: _parse_numeric(row["value"])
        if row["field_type"] in NUMERIC_FIELD_TYPES
        else np.nan,
        axis=1,
    )

    return df


def _load_meta_studies_df(meta_id: str, db: Optional[DBBackend] = None) -> pd.DataFrame:
    """Load meta-analysis study-level data for heterogeneity computations."""
    db = db or get_db_backend()
    studies = db.query("meta_analysis_studies", {"meta_id": meta_id, "included": 1}, order_by="study_label")
    if not studies:
        return pd.DataFrame()
    return pd.DataFrame(studies)


# ── Data Profiling ───────────────────────────────────────────

def profile_extraction_data(project_id: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Generate a full data profiling report for a project's extractions."""
    df = _load_extractions_df(project_id, db=db)

    if df.empty:
        return {
            "summary": {"total_studies": 0, "total_variables": 0, "total_extractions": 0},
            "per_variable": [],
            "missing_matrix": [],
            "correlation_matrix": {"variables": [], "values": []},
            "outliers": [],
        }

    total_studies = df["study_id"].nunique()
    total_variables = df["variable_id"].nunique()
    total_extractions = len(df)

    # Per-variable profiling
    per_variable = []
    for (var_id, var_name, section, field_type), group in df.groupby(
        ["variable_id", "variable_name", "section", "field_type"]
    ):
        count = len(group)
        non_empty = group[group["value"].str.strip() != ""]
        missing_count = count - len(non_empty)
        missing_pct = round(missing_count / count * 100, 1) if count > 0 else 0
        unique_values = non_empty["value"].nunique()

        entry: Dict[str, Any] = {
            "variable_id": var_id,
            "variable_name": var_name,
            "section": section,
            "field_type": field_type,
            "count": count,
            "missing_count": missing_count,
            "missing_pct": missing_pct,
            "unique_values": unique_values,
        }

        if field_type in NUMERIC_FIELD_TYPES:
            nums = group["numeric_value"].dropna()
            if len(nums) > 0:
                entry.update({
                    "mean": round(float(nums.mean()), 4),
                    "median": round(float(nums.median()), 4),
                    "std": round(float(nums.std()), 4) if len(nums) > 1 else 0.0,
                    "min": round(float(nums.min()), 4),
                    "max": round(float(nums.max()), 4),
                    "q1": round(float(nums.quantile(0.25)), 4),
                    "q3": round(float(nums.quantile(0.75)), 4),
                    "iqr": round(float(nums.quantile(0.75) - nums.quantile(0.25)), 4),
                })
            else:
                entry.update({
                    "mean": None, "median": None, "std": None,
                    "min": None, "max": None, "q1": None, "q3": None, "iqr": None,
                })
        else:
            # Categorical: top values
            value_counts = non_empty["value"].value_counts().head(10)
            entry["top_values"] = [
                {"value": v, "count": int(c)}
                for v, c in value_counts.items()
            ]

        per_variable.append(entry)

    # Missing value matrix (per study)
    missing_matrix = []
    for study_id, group in df.groupby("study_id"):
        study_title = group["study_title"].iloc[0] if not group.empty else ""
        missing_count = (group["value"].str.strip() == "").sum()
        total_vars = len(group)
        missing_matrix.append({
            "study_id": study_id,
            "study_title": study_title,
            "total_variables": total_vars,
            "missing_count": int(missing_count),
            "missing_pct": round(missing_count / total_vars * 100, 1) if total_vars > 0 else 0,
        })

    # Correlation matrix (numeric variables only)
    numeric_vars = df[df["field_type"].isin(NUMERIC_FIELD_TYPES)].copy()
    corr_vars = []
    corr_values = []

    if not numeric_vars.empty:
        pivot = numeric_vars.pivot_table(
            index="study_id", columns="variable_name", values="numeric_value", aggfunc="first"
        )
        valid_cols = [c for c in pivot.columns if pivot[c].notna().sum() >= 3]
        pivot = pivot[valid_cols]

        if len(valid_cols) >= 2:
            corr_matrix = pivot.corr(method="pearson")
            corr_vars = list(corr_matrix.columns)
            corr_values = [
                [round(float(v), 3) if not math.isnan(v) else None for v in row]
                for row in corr_matrix.values
            ]

    # Outlier detection (IQR method for numeric variables)
    outliers = []
    for (var_id, var_name), group in df[df["field_type"].isin(NUMERIC_FIELD_TYPES)].groupby(
        ["variable_id", "variable_name"]
    ):
        nums = group["numeric_value"].dropna()
        if len(nums) < 4:
            continue
        q1 = nums.quantile(0.25)
        q3 = nums.quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        mean = nums.mean()
        std = nums.std()
        if std == 0:
            continue

        for _, row in group.iterrows():
            val = row["numeric_value"]
            if pd.isna(val):
                continue
            if val < lower_bound or val > upper_bound:
                z_score = round(float((val - mean) / std), 3) if std > 0 else 0.0
                outliers.append({
                    "variable_name": var_name,
                    "study_title": row["study_title"],
                    "value": float(val),
                    "z_score": z_score,
                    "method": "IQR (1.5×)",
                })

    return {
        "summary": {
            "total_studies": int(total_studies),
            "total_variables": int(total_variables),
            "total_extractions": int(total_extractions),
            "completion_pct": round(
                (total_extractions - sum(v["missing_count"] for v in per_variable))
                / total_extractions * 100,
                1,
            ) if total_extractions > 0 else 0,
            "numeric_variables": sum(1 for v in per_variable if v["field_type"] in NUMERIC_FIELD_TYPES),
            "categorical_variables": sum(1 for v in per_variable if v["field_type"] not in NUMERIC_FIELD_TYPES),
        },
        "per_variable": per_variable,
        "missing_matrix": missing_matrix,
        "correlation_matrix": {"variables": corr_vars, "values": corr_values},
        "outliers": outliers,
    }


# ── Statistical Analysis ─────────────────────────────────────

def compute_descriptive_stats(project_id: str, variable_id: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Compute detailed descriptive statistics for a single variable."""
    db = db or get_db_backend()
    var = db.get("variables", variable_id)
    if not var or var.get("project_id") != project_id:
        return {"error": "Variable not found"}

    extractions = db.query("extractions", {"variable_id": variable_id})
    if not extractions:
        return {"error": "No extractions found", "variable_name": var["name"]}

    values = [e["value"] for e in extractions if e.get("value") and str(e["value"]).strip()]
    field_type = var.get("field_type", "text")

    result: Dict[str, Any] = {
        "variable_id": variable_id,
        "variable_name": var["name"],
        "field_type": field_type,
        "section": var.get("section", ""),
        "n_extractions": len(extractions),
        "n_non_empty": len(values),
        "n_missing": len(extractions) - len(values),
        "missing_pct": round((len(extractions) - len(values)) / len(extractions) * 100, 1),
    }

    if field_type in NUMERIC_FIELD_TYPES:
        nums = [_parse_numeric(v) for v in values]
        nums = [n for n in nums if n is not None]
        if nums:
            arr = np.array(nums)
            result.update({
                "mean": round(float(arr.mean()), 4),
                "median": round(float(np.median(arr)), 4),
                "std": round(float(arr.std()), 4) if len(arr) > 1 else 0.0,
                "sem": round(float(arr.std() / math.sqrt(len(arr))), 4) if len(arr) > 1 else 0.0,
                "min": round(float(arr.min()), 4),
                "max": round(float(arr.max()), 4),
                "q1": round(float(np.percentile(arr, 25)), 4),
                "q3": round(float(np.percentile(arr, 75)), 4),
                "iqr": round(float(np.percentile(arr, 75) - np.percentile(arr, 25)), 4),
                "range": round(float(arr.max() - arr.min()), 4),
                "cv": round(float(arr.std() / arr.mean()), 4) if arr.mean() != 0 else None,
                "skewness": round(float(sp_stats.skew(arr)), 4) if len(arr) >= 3 else None,
                "kurtosis": round(float(sp_stats.kurtosis(arr)), 4) if len(arr) >= 4 else None,
                "ci_95_lower": round(float(arr.mean() - 1.96 * arr.std() / math.sqrt(len(arr))), 4) if len(arr) > 1 else None,
                "ci_95_upper": round(float(arr.mean() + 1.96 * arr.std() / math.sqrt(len(arr))), 4) if len(arr) > 1 else None,
            })
            if len(arr) >= 3 and len(arr) <= 5000:
                try:
                    sw_stat, sw_p = sp_stats.shapiro(arr)
                    result["shapiro_wilk"] = {
                        "statistic": round(float(sw_stat), 4),
                        "p_value": round(float(sw_p), 4),
                        "is_normal": bool(sw_p > 0.05),
                    }
                except Exception:
                    pass
    else:
        from collections import Counter
        counts = Counter(values)
        total = len(values)
        result["frequency_distribution"] = [
            {"value": v, "count": c, "pct": round(c / total * 100, 1)}
            for v, c in counts.most_common()
        ]
        result["n_unique"] = len(counts)
        result["mode"] = counts.most_common(1)[0][0] if counts else None

    return result


def compute_heterogeneity(project_id: str, outcome_label: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Compute heterogeneity diagnostics (I², Q-statistic, tau², H-statistic).

    Uses the DerSimonian-Laird random-effects estimator.
    """
    db = db or get_db_backend()
    metas = db.query("meta_analyses", {"project_id": project_id, "outcome_label": outcome_label}, order_by="created_at")
    if not metas:
        return {"error": f"No meta-analysis found for outcome '{outcome_label}'"}
    meta = metas[-1]

    studies = db.query("meta_analysis_studies", {"meta_id": meta["meta_id"], "included": 1}, order_by="study_label")

    if len(studies) < 2:
        return {"error": "Need at least 2 studies for heterogeneity analysis",
                "n_studies": len(studies)}

    effects = np.array([s["effect_size"] for s in studies if s.get("effect_size") is not None])
    variances = np.array([s["variance"] for s in studies if s.get("variance") is not None])

    if len(effects) < 2 or len(variances) < 2:
        return {"error": "Insufficient numeric effect size data", "n_studies": len(studies)}

    # Fixed-effect weights
    w_fixed = 1.0 / variances
    pooled_fixed = np.sum(w_fixed * effects) / np.sum(w_fixed)
    q = np.sum(w_fixed * (effects - pooled_fixed) ** 2)
    df = len(effects) - 1
    q_p_value = 1.0 - sp_stats.chi2.cdf(q, df) if df > 0 else 1.0
    i_squared = max(0.0, (q - df) / q * 100) if q > 0 else 0.0

    c = np.sum(w_fixed) - (np.sum(w_fixed ** 2) / np.sum(w_fixed))
    tau_squared = max(0.0, (q - df) / c) if c > 0 else 0.0
    h_statistic = math.sqrt(q / df) if df > 0 else 1.0

    w_random = 1.0 / (variances + tau_squared)
    pooled_random = np.sum(w_random * effects) / np.sum(w_random)
    se_pooled = 1.0 / math.sqrt(np.sum(w_random))
    ci_lower = pooled_random - 1.96 * se_pooled
    ci_upper = pooled_random + 1.96 * se_pooled

    if i_squared < 25:
        interpretation = "Low heterogeneity"
    elif i_squared < 50:
        interpretation = "Moderate heterogeneity"
    elif i_squared < 75:
        interpretation = "Substantial heterogeneity"
    else:
        interpretation = "Considerable heterogeneity"

    return {
        "meta_id": meta["meta_id"],
        "outcome_label": outcome_label,
        "n_studies": int(len(effects)),
        "q_statistic": round(float(q), 4),
        "q_df": int(df),
        "q_p_value": round(float(q_p_value), 4),
        "i_squared": round(float(i_squared), 2),
        "i_squared_interpretation": interpretation,
        "tau_squared": round(float(tau_squared), 6),
        "h_statistic": round(float(h_statistic), 4),
        "pooled_effect_fixed": round(float(pooled_fixed), 4),
        "pooled_effect_random": round(float(pooled_random), 4),
        "se_pooled": round(float(se_pooled), 4),
        "ci_lower": round(float(ci_lower), 4),
        "ci_upper": round(float(ci_upper), 4),
        "effect_measure": meta.get("effect_measure", ""),
        "analysis_type": meta.get("analysis_type", ""),
    }


def prepare_forest_plot_data(project_id: str, outcome_label: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Prepare data for rendering a forest plot."""
    db = db or get_db_backend()
    metas = db.query("meta_analyses", {"project_id": project_id, "outcome_label": outcome_label}, order_by="created_at")
    if not metas:
        return {"error": f"No meta-analysis found for outcome '{outcome_label}'"}
    meta = metas[-1]

    studies = db.query("meta_analysis_studies", {"meta_id": meta["meta_id"], "included": 1}, order_by="study_label")
    if not studies:
        return {"error": "No studies in meta-analysis", "outcome_label": outcome_label}

    effects = np.array([s["effect_size"] for s in studies if s.get("effect_size") is not None])
    variances = np.array([s["variance"] for s in studies if s.get("variance") is not None])

    study_data = []
    for s in studies:
        study_data.append({
            "study_id": s["study_id"],
            "study_label": s["study_label"],
            "effect_size": round(float(s["effect_size"]), 4) if s.get("effect_size") is not None else None,
            "se": round(float(s["se"]), 4) if s.get("se") is not None else None,
            "ci_lower": round(float(s["ci_lower"]), 4) if s.get("ci_lower") is not None else None,
            "ci_upper": round(float(s["ci_upper"]), 4) if s.get("ci_upper") is not None else None,
            "weight": round(float(s["weight"]), 2) if s.get("weight") is not None else None,
            "raw_data": json.loads(s["raw_data_json"]) if s.get("raw_data_json") else {},
        })

    pooled = None
    if len(effects) >= 2 and len(variances) >= 2:
        w_fixed = 1.0 / variances
        pooled_fixed = np.sum(w_fixed * effects) / np.sum(w_fixed)
        q = np.sum(w_fixed * (effects - pooled_fixed) ** 2)
        df = len(effects) - 1
        c = np.sum(w_fixed) - (np.sum(w_fixed ** 2) / np.sum(w_fixed))
        tau_sq = max(0.0, (q - df) / c) if c > 0 else 0.0
        w_random = 1.0 / (variances + tau_sq)
        pooled_random = np.sum(w_random * effects) / np.sum(w_random)
        se_pooled = 1.0 / math.sqrt(np.sum(w_random))

        pooled = {
            "effect_size": round(float(pooled_random), 4),
            "ci_lower": round(float(pooled_random - 1.96 * se_pooled), 4),
            "ci_upper": round(float(pooled_random + 1.96 * se_pooled), 4),
            "effect_measure": meta.get("effect_measure", ""),
            "model": "random-effects (DerSimonian-Laird)",
        }

    return {
        "outcome_label": outcome_label,
        "effect_measure": meta.get("effect_measure", ""),
        "analysis_type": meta.get("analysis_type", ""),
        "n_studies": len(study_data),
        "studies": study_data,
        "pooled": pooled,
    }


def prepare_funnel_plot_data(project_id: str, outcome_label: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Prepare data for rendering a funnel plot (effect size vs SE)."""
    db = db or get_db_backend()
    metas = db.query("meta_analyses", {"project_id": project_id, "outcome_label": outcome_label}, order_by="created_at")
    if not metas:
        return {"error": f"No meta-analysis found for outcome '{outcome_label}'"}
    meta = metas[-1]

    studies = db.query("meta_analysis_studies", {"meta_id": meta["meta_id"], "included": 1}, order_by="study_label")
    if len(studies) < 3:
        return {"error": "Need at least 3 studies for funnel plot", "n_studies": len(studies)}

    points = []
    for s in studies:
        if s.get("effect_size") is None or s.get("se") is None:
            continue
        points.append({
            "study_label": s["study_label"],
            "effect_size": round(float(s["effect_size"]), 4),
            "se": round(float(s["se"]), 4),
            "precision": round(1.0 / float(s["se"]), 4) if s["se"] else None,
        })

    if len(points) < 3:
        return {"error": "Insufficient data for funnel plot", "n_studies": len(points)}

    effects = np.array([p["effect_size"] for p in points])
    ses = np.array([p["se"] for p in points])
    precision = 1.0 / ses

    n = len(points)
    if n >= 3:
        slope, intercept, r_value, p_value, std_err = sp_stats.linregress(precision, effects)
        pooled_effect = float(np.mean(effects))
        se_range = np.linspace(float(ses.min()), float(ses.max()) * 1.5, 50)
        ci_lower = pooled_effect - 1.96 * se_range
        ci_upper = pooled_effect + 1.96 * se_range

        egger_test = {
            "intercept": round(float(intercept), 4),
            "slope": round(float(slope), 4),
            "r_value": round(float(r_value), 4),
            "p_value": round(float(p_value), 4),
            "std_err": round(float(std_err), 4),
            "has_asymmetry": bool(p_value < 0.10),
        }
    else:
        egger_test = None
        ci_lower = []
        ci_upper = []
        se_range = []
        pooled_effect = None

    return {
        "outcome_label": outcome_label,
        "effect_measure": meta.get("effect_measure", ""),
        "n_studies": len(points),
        "points": points,
        "pooled_effect": round(float(pooled_effect), 4) if pooled_effect is not None else None,
        "funnel_ci": {
            "se_range": [round(float(s), 4) for s in se_range],
            "ci_lower": [round(float(v), 4) for v in ci_lower],
            "ci_upper": [round(float(v), 4) for v in ci_upper],
        },
        "egger_test": egger_test,
    }


def compute_sensitivity_analysis(project_id: str, outcome_label: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Leave-one-out sensitivity analysis."""
    db = db or get_db_backend()
    metas = db.query("meta_analyses", {"project_id": project_id, "outcome_label": outcome_label}, order_by="created_at")
    if not metas:
        return {"error": f"No meta-analysis found for outcome '{outcome_label}'"}
    meta = metas[-1]

    studies = db.query("meta_analysis_studies", {"meta_id": meta["meta_id"], "included": 1}, order_by="study_label")
    if len(studies) < 3:
        return {"error": "Need at least 3 studies for sensitivity analysis", "n_studies": len(studies)}

    effects = np.array([s["effect_size"] for s in studies if s.get("effect_size") is not None])
    variances = np.array([s["variance"] for s in studies if s.get("variance") is not None])

    if len(effects) < 3:
        return {"error": "Insufficient numeric data", "n_studies": len(studies)}

    def _pooled_random(effs, vars):
        w_f = 1.0 / vars
        p_f = np.sum(w_f * effs) / np.sum(w_f)
        q = np.sum(w_f * (effs - p_f) ** 2)
        df = len(effs) - 1
        c = np.sum(w_f) - (np.sum(w_f ** 2) / np.sum(w_f))
        tau_sq = max(0.0, (q - df) / c) if c > 0 else 0.0
        w_r = 1.0 / (vars + tau_sq)
        p_r = np.sum(w_r * effs) / np.sum(w_r)
        se = 1.0 / math.sqrt(np.sum(w_r))
        i_sq = max(0.0, (q - df) / q * 100) if q > 0 else 0.0
        return p_r, se, i_sq, tau_sq

    full_pooled, full_se, full_i2, full_tau2 = _pooled_random(effects, variances)

    results = []
    for i, s in enumerate(studies):
        if s.get("effect_size") is None or s.get("variance") is None:
            continue
        remaining_eff = np.delete(effects, i)
        remaining_var = np.delete(variances, i)

        if len(remaining_eff) < 2:
            continue

        pooled, se, i2, tau2 = _pooled_random(remaining_eff, remaining_var)
        results.append({
            "study_label": s["study_label"],
            "study_id": s["study_id"],
            "pooled_without": round(float(pooled), 4),
            "ci_lower": round(float(pooled - 1.96 * se), 4),
            "ci_upper": round(float(pooled + 1.96 * se), 4),
            "i_squared": round(float(i2), 2),
            "tau_squared": round(float(tau2), 6),
            "pooled_change": round(float(pooled - full_pooled), 4),
            "i2_change": round(float(i2 - full_i2), 2),
        })

    return {
        "outcome_label": outcome_label,
        "n_studies": len(studies),
        "full_pooled": round(float(full_pooled), 4),
        "full_ci_lower": round(float(full_pooled - 1.96 * full_se), 4),
        "full_ci_upper": round(float(full_pooled + 1.96 * full_se), 4),
        "full_i_squared": round(float(full_i2), 2),
        "full_tau_squared": round(float(full_tau2), 6),
        "leave_one_out": results,
    }


def generate_full_report(project_id: str, db: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Generate a complete analysis report combining all modules."""
    db = db or get_db_backend()
    profile = profile_extraction_data(project_id, db=db)
    metas = db.query("meta_analyses", {"project_id": project_id})

    meta_analyses = []
    for m in metas:
        outcome = m.get("outcome_label", "")
        if not outcome:
            continue
        heterogeneity = compute_heterogeneity(project_id, outcome, db=db)
        forest = prepare_forest_plot_data(project_id, outcome, db=db)
        funnel = prepare_funnel_plot_data(project_id, outcome, db=db)
        sensitivity = compute_sensitivity_analysis(project_id, outcome, db=db)
        meta_analyses.append({
            "outcome_label": outcome,
            "heterogeneity": heterogeneity,
            "forest_plot_data": forest,
            "funnel_plot_data": funnel,
            "sensitivity_analysis": sensitivity,
        })

    return {
        "project_id": project_id,
        "data_profile": profile,
        "meta_analyses": meta_analyses,
    }
