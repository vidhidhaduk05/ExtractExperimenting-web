from __future__ import annotations
import json
import uuid
from datetime import datetime
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import rob_service


# ── GRADE factor definitions ──

DOWNGRADING_FACTORS = [
    {
        "factor_key": "risk_of_bias",
        "factor_name": "Risk of Bias",
        "factor_type": "downgrading",
        "rating_options": ["none", "serious", "very_serious"],
        "rating_labels": {
            "none": "Not serious",
            "serious": "Serious (-1)",
            "very_serious": "Very serious (-2)",
        },
        "rating_penalty": {"none": 0, "serious": -1, "very_serious": -2},
    },
    {
        "factor_key": "inconsistency",
        "factor_name": "Inconsistency",
        "factor_type": "downgrading",
        "rating_options": ["none", "serious", "very_serious"],
        "rating_labels": {
            "none": "Not serious",
            "serious": "Serious (-1)",
            "very_serious": "Very serious (-2)",
        },
        "rating_penalty": {"none": 0, "serious": -1, "very_serious": -2},
    },
    {
        "factor_key": "indirectness",
        "factor_name": "Indirectness",
        "factor_type": "downgrading",
        "rating_options": ["none", "serious", "very_serious"],
        "rating_labels": {
            "none": "Not serious",
            "serious": "Serious (-1)",
            "very_serious": "Very serious (-2)",
        },
        "rating_penalty": {"none": 0, "serious": -1, "very_serious": -2},
    },
    {
        "factor_key": "imprecision",
        "factor_name": "Imprecision",
        "factor_type": "downgrading",
        "rating_options": ["none", "serious", "very_serious"],
        "rating_labels": {
            "none": "Not serious",
            "serious": "Serious (-1)",
            "very_serious": "Very serious (-2)",
        },
        "rating_penalty": {"none": 0, "serious": -1, "very_serious": -2},
    },
    {
        "factor_key": "publication_bias",
        "factor_name": "Publication Bias",
        "factor_type": "downgrading",
        "rating_options": ["none", "likely", "undetected"],
        "rating_labels": {
            "none": "None",
            "likely": "Likely (-1)",
            "undetected": "Undetected",
        },
        "rating_penalty": {"none": 0, "likely": -1, "undetected": 0},
    },
]

UPGRADING_FACTORS = [
    {
        "factor_key": "large_effect",
        "factor_name": "Large Effect",
        "factor_type": "upgrading",
        "rating_options": ["none", "large", "very_large"],
        "rating_labels": {
            "none": "None",
            "large": "Large (+1)",
            "very_large": "Very large (+2)",
        },
        "rating_bonus": {"none": 0, "large": 1, "very_large": 2},
    },
    {
        "factor_key": "dose_response",
        "factor_name": "Dose-Response",
        "factor_type": "upgrading",
        "rating_options": ["none", "present"],
        "rating_labels": {
            "none": "Not present",
            "present": "Present (+1)",
        },
        "rating_bonus": {"none": 0, "present": 1},
    },
    {
        "factor_key": "plausible_confounding",
        "factor_name": "Plausible Confounding",
        "factor_type": "upgrading",
        "rating_options": ["none", "present"],
        "rating_labels": {
            "none": "Not present",
            "present": "Present (+1)",
        },
        "rating_bonus": {"none": 0, "present": 1},
    },
]

ALL_FACTORS = DOWNGRADING_FACTORS + UPGRADING_FACTORS

# Certainty levels
CERTAINTY_LEVELS = ["high", "moderate", "low", "very_low"]
CERTAINTY_LABELS = {
    "high": "High",
    "moderate": "Moderate",
    "low": "Low",
    "very_low": "Very Low",
}
CERTAINTY_COLORS = {
    "high": "#75A025",     # green
    "moderate": "#E9ED4C", # yellow
    "low": "#FF9400",      # orange
    "very_low": "#E94444", # red
}

# Starting levels by study design
RCT_DESIGNS = {"rct", "randomized controlled trial", "randomised controlled trial",
               "randomized trial", "randomised trial"}
OBSERVATIONAL_DESIGNS = {"cohort", "case-control", "cross-sectional", "case series",
                         "observational", "retrospective", "prospective"}


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.utcnow().isoformat()


# ═══════════════════════════════════════════════════════════════════════
#  GRADE Assessment CRUD
# ═══════════════════════════════════════════════════════════════════════

def create_grade_assessment(
    project_id: str,
    outcome_label: str,
    meta_analysis_id: Optional[str] = None,
    starting_level: str = "high",
    created_by: str = "",
    db: Optional[DBBackend] = None,
) -> dict:
    """Create a new GRADE assessment with all 8 factors initialized."""
    grade_id = _uuid()
    now = _now()
    db = db or get_db_backend()

    db.insert("grade_assessments", {
        "grade_id": grade_id,
        "project_id": project_id,
        "outcome_label": outcome_label,
        "meta_analysis_id": meta_analysis_id,
        "certainty_rating": starting_level,
        "starting_level": starting_level,
        "n_studies": 0,
        "n_participants": 0,
        "effect_estimate": "",
        "ci_text": "",
        "sof_table_json": "{}",
        "created_at": now,
        "created_by": created_by,
    })

    # Create all 8 factors
    for factor_def in ALL_FACTORS:
        factor_id = _uuid()
        db.insert("grade_factors", {
            "factor_id": factor_id,
            "grade_id": grade_id,
            "factor_type": factor_def["factor_type"],
            "factor_key": factor_def["factor_key"],
            "factor_name": factor_def["factor_name"],
            "rating": "none",
            "rationale": "",
            "auto_populated": 0,
            "auto_data": "{}",
        })

    db.commit()
    return get_grade_assessment(grade_id, db=db)


def get_grade_assessment(grade_id: str, db: Optional[DBBackend] = None) -> Optional[dict]:
    """Get a GRADE assessment with all its factors."""
    db = db or get_db_backend()
    row = db.get("grade_assessments", grade_id)
    if not row:
        return None

    factors = db.query("grade_factors", {"grade_id": grade_id})
    factor_list = []
    for f in factors:
        f_dict = dict(f)
        auto_data_raw = f_dict.get("auto_data")
        f_dict["auto_data"] = json.loads(auto_data_raw) if isinstance(auto_data_raw, str) and auto_data_raw else (auto_data_raw if isinstance(auto_data_raw, dict) else {})
        # Add rating options and labels from definitions
        for fd in ALL_FACTORS:
            if fd["factor_key"] == f_dict["factor_key"]:
                f_dict["rating_options"] = fd["rating_options"]
                f_dict["rating_labels"] = fd["rating_labels"]
                break
        factor_list.append(f_dict)

    result = dict(row)
    result["factors"] = factor_list
    for f_item in factor_list:
        fk = f_item.get("factor_key")
        if fk:
            result[fk] = f_item
    result["certainty_label"] = CERTAINTY_LABELS.get(result["certainty_rating"], "")
    result["certainty_color"] = CERTAINTY_COLORS.get(result["certainty_rating"], "")
    return result


def list_grade_assessments(project_id: str, db: Optional[DBBackend] = None) -> list[dict]:
    """List all GRADE assessments for a project."""
    db = db or get_db_backend()
    rows = db.query("grade_assessments", {"project_id": project_id}, order_by="created_at DESC")
    results = []
    for r in rows:
        r_dict = dict(r)
        r_dict["certainty_label"] = CERTAINTY_LABELS.get(r_dict["certainty_rating"], "")
        r_dict["certainty_color"] = CERTAINTY_COLORS.get(r_dict["certainty_rating"], "")
        results.append(r_dict)
    return results


def delete_grade_assessment(grade_id: str, db: Optional[DBBackend] = None) -> bool:
    """Delete a GRADE assessment and all its factors."""
    db = db or get_db_backend()
    factors = db.query("grade_factors", {"grade_id": grade_id})
    for f in factors:
        db.delete("grade_factors", f["factor_id"])
    db.delete("grade_assessments", grade_id)
    db.commit()
    return True


def update_factor(
    factor_id: str,
    rating: str,
    rationale: str = "",
    db: Optional[DBBackend] = None,
) -> Optional[dict]:
    """Update a single GRADE factor's rating and rationale."""
    db = db or get_db_backend()
    row = db.get("grade_factors", factor_id)
    if not row:
        return None

    db.update("grade_factors", factor_id, {
        "rating": rating,
        "rationale": rationale,
    })
    db.commit()

    # Recompute certainty
    grade_id = row["grade_id"]
    compute_certainty(grade_id, db=db)

    return get_grade_assessment(grade_id, db=db)


# ═══════════════════════════════════════════════════════════════════════
#  Auto-population
# ═══════════════════════════════════════════════════════════════════════

def auto_populate_factors(grade_id: str, db: Optional[DBBackend] = None) -> dict:
    """Auto-populate GRADE factors from linked RoB assessments and meta-analysis.

    Sources:
      - Risk of bias: RoB summary → percentage of high/serious/critical studies
      - Inconsistency: I² from meta-analysis heterogeneity
      - Imprecision: CI width from meta-analysis pooled result
      - Publication bias: Egger's test p-value from meta-analysis
    """
    db = db or get_db_backend()
    grade = db.get("grade_assessments", grade_id)
    if not grade:
        raise ValueError(f"GRADE assessment not found: {grade_id}")

    project_id = grade["project_id"]
    meta_id = grade.get("meta_analysis_id")
    updates = {}

    # 1. Risk of Bias — from RoB summary
    try:
        rob_summary = rob_service.get_project_summary(project_id, db=db)
        total = rob_summary.get("total_assessments", 0)
        if total > 0:
            judgment_counts = rob_summary.get("judgment_counts", {})
            jc = {str(k).lower().strip(): v for k, v in judgment_counts.items()}
            high_count = (jc.get("high", 0) +
                          jc.get("serious", 0) +
                          jc.get("critical", 0))
            pct_high = high_count / total * 100

            if pct_high >= 50:
                rating = "very_serious"
                rationale = f"{pct_high:.0f}% of studies have high/serious risk of bias ({high_count}/{total})"
            elif pct_high > 0:
                rating = "serious"
                rationale = f"{pct_high:.0f}% of studies have high/serious risk of bias ({high_count}/{total})"
            else:
                rating = "none"
                rationale = f"No studies with high/serious risk of bias ({total} assessments)"

            updates["risk_of_bias"] = {
                "rating": rating,
                "rationale": rationale,
                "auto_data": {"pct_high": round(pct_high, 1), "high_count": high_count,
                              "total": total, "judgment_counts": judgment_counts},
            }
    except Exception:
        updates["risk_of_bias"] = {
            "rating": "none",
            "rationale": "No RoB assessments available for auto-population",
            "auto_data": {},
        }

    # 2-4. From meta-analysis if linked
    if meta_id:
        ma_row = db.get("meta_analyses", meta_id)

        if ma_row:
            # 2. Inconsistency — from I²
            i_squared = ma_row.get("i_squared")
            if i_squared is not None:
                if i_squared > 75:
                    inc_rating = "very_serious"
                    inc_rationale = f"I² = {i_squared:.1f}% (>75%, considerable heterogeneity)"
                elif i_squared >= 40:
                    inc_rating = "serious"
                    inc_rationale = f"I² = {i_squared:.1f}% (40-75%, substantial heterogeneity)"
                else:
                    inc_rating = "none"
                    inc_rationale = f"I² = {i_squared:.1f}% (<40%, low heterogeneity)"

                updates["inconsistency"] = {
                    "rating": inc_rating,
                    "rationale": inc_rationale,
                    "auto_data": {"i_squared": i_squared, "q_statistic": ma_row.get("q_statistic"),
                                  "q_p_value": ma_row.get("q_p_value"), "tau_squared": ma_row.get("tau_squared")},
                }

            # 3. Imprecision — from CI width
            ci_lower = ma_row.get("pooled_ci_lower")
            ci_upper = ma_row.get("pooled_ci_upper")
            if ci_lower is not None and ci_upper is not None:
                ci_width = ci_upper - ci_lower
                pooled = ma_row.get("pooled_effect") or 0
                # Relative CI width (ratio of CI width to pooled effect)
                if pooled != 0:
                    rel_width = abs(ci_width / pooled)
                else:
                    rel_width = ci_width

                if rel_width > 2.0 or (pooled > 0 and ci_lower <= 0 and ci_upper > 0):
                    imp_rating = "very_serious"
                    imp_rationale = f"95% CI [{ci_lower:.3f}, {ci_upper:.3f}] is very wide (width={ci_width:.3f}), CI crosses no-effect"
                elif rel_width > 1.0:
                    imp_rating = "serious"
                    imp_rationale = f"95% CI [{ci_lower:.3f}, {ci_upper:.3f}] is wide (width={ci_width:.3f})"
                else:
                    imp_rating = "none"
                    imp_rationale = f"95% CI [{ci_lower:.3f}, {ci_upper:.3f}] is adequately precise"

                updates["imprecision"] = {
                    "rating": imp_rating,
                    "rationale": imp_rationale,
                    "auto_data": {"ci_lower": ci_lower, "ci_upper": ci_upper,
                                  "ci_width": round(ci_width, 4), "pooled": pooled},
                }

            # 4. Publication bias — from Egger's test
            egger_p = ma_row.get("egger_p_value")
            if egger_p is not None:
                if egger_p < 0.05:
                    pb_rating = "likely"
                    pb_rationale = f"Egger's test p = {egger_p:.4f} (<0.05, significant asymmetry)"
                else:
                    pb_rating = "undetected"
                    pb_rationale = f"Egger's test p = {egger_p:.4f} (≥0.05, no significant asymmetry)"

                updates["publication_bias"] = {
                    "rating": pb_rating,
                    "rationale": pb_rationale,
                    "auto_data": {"egger_p_value": egger_p,
                                  "egger_intercept": ma_row.get("egger_intercept")},
                }

            # Update n_studies and n_participants on the grade assessment
            n_studies = ma_row.get("n_studies") or 0
            db.update("grade_assessments", grade_id, {
                "n_studies": n_studies,
                "effect_estimate": f"{ma_row.get('pooled_effect'):.4f}" if ma_row.get("pooled_effect") is not None else "",
                "ci_text": f"[{ci_lower:.4f}, {ci_upper:.4f}]" if ci_lower is not None and ci_upper is not None else "",
            })

    # Apply updates to factors
    factors = db.query("grade_factors", {"grade_id": grade_id})
    for f in factors:
        fk = f["factor_key"]
        if fk in updates:
            data = updates[fk]
            db.update("grade_factors", f["factor_id"], {
                "rating": data["rating"],
                "rationale": data["rationale"],
                "auto_populated": 1,
                "auto_data": json.dumps(data["auto_data"], ensure_ascii=False),
            })

    db.commit()

    # Recompute certainty
    compute_certainty(grade_id, db=db)

    return get_grade_assessment(grade_id, db=db)


# ═══════════════════════════════════════════════════════════════════════
#  Certainty Computation
# ═══════════════════════════════════════════════════════════════════════

def compute_certainty(grade_id: str, db: Optional[DBBackend] = None) -> dict:
    """Compute the final certainty rating from factor ratings.

    Algorithm:
      1. Start at starting_level (high for RCTs, low for observational)
      2. Sum penalties from downgrading factors
      3. Sum bonuses from upgrading factors (only if starting at low)
      4. Apply net change to starting level
      5. Clamp to [very_low, high]
    """
    db = db or get_db_backend()
    grade = db.get("grade_assessments", grade_id)
    if not grade:
        raise ValueError(f"GRADE assessment not found: {grade_id}")

    factors = db.query("grade_factors", {"grade_id": grade_id})

    starting_level = grade.get("starting_level", "high")
    start_idx = CERTAINTY_LEVELS.index(starting_level) if starting_level in CERTAINTY_LEVELS else 0

    total_penalty = 0
    total_bonus = 0

    for f in factors:
        for fd in ALL_FACTORS:
            if fd["factor_key"] == f["factor_key"]:
                if f["factor_type"] == "downgrading":
                    penalty_map = fd.get("rating_penalty", {})
                    total_penalty += penalty_map.get(f["rating"], 0)
                else:
                    bonus_map = fd.get("rating_bonus", {})
                    total_bonus += bonus_map.get(f["rating"], 0)
                break

    # Upgrading only applies if starting at low or very_low (observational)
    if starting_level in ("high", "moderate"):
        total_bonus = 0

    net_change = total_penalty + total_bonus
    final_idx = max(0, min(3, start_idx - net_change))
    final_rating = CERTAINTY_LEVELS[final_idx]

    db.update("grade_assessments", grade_id, {
        "certainty_rating": final_rating,
    })
    db.commit()

    return {
        "grade_id": grade_id,
        "starting_level": starting_level,
        "total_penalty": total_penalty,
        "total_bonus": total_bonus,
        "net_change": net_change,
        "certainty_rating": final_rating,
        "certainty_label": CERTAINTY_LABELS[final_rating],
        "certainty_color": CERTAINTY_COLORS[final_rating],
    }


# ═══════════════════════════════════════════════════════════════════════
#  Summary of Findings Table
# ═══════════════════════════════════════════════════════════════════════

def generate_sof_table(grade_id: str, db: Optional[DBBackend] = None) -> dict:
    """Generate a Summary of Findings (SoF) table for a GRADE assessment.

    The SoF table includes:
      - Outcome
      - Number of studies
      - Number of participants
      - Certainty rating
      - Effect estimate with CI
      - Factor ratings summary
    """
    db = db or get_db_backend()
    assessment = get_grade_assessment(grade_id, db=db)
    if not assessment:
        raise ValueError(f"GRADE assessment not found: {grade_id}")

    # Build factor summary
    factor_summary = []
    for f in assessment.get("factors", []):
        for fd in ALL_FACTORS:
            if fd["factor_key"] == f["factor_key"]:
                labels = fd.get("rating_labels", {})
                factor_summary.append({
                    "factor_key": f["factor_key"],
                    "factor_name": f["factor_name"],
                    "factor_type": f["factor_type"],
                    "rating": f["rating"],
                    "rating_label": labels.get(f["rating"], f["rating"]),
                    "rationale": f["rationale"],
                    "auto_populated": bool(f["auto_populated"]),
                })
                break

    sof = {
        "grade_id": grade_id,
        "outcome": assessment["outcome_label"],
        "n_studies": assessment.get("n_studies", 0),
        "n_participants": assessment.get("n_participants", 0),
        "certainty": assessment["certainty_rating"],
        "certainty_label": CERTAINTY_LABELS.get(assessment["certainty_rating"], ""),
        "certainty_color": CERTAINTY_COLORS.get(assessment["certainty_rating"], ""),
        "effect_estimate": assessment.get("effect_estimate", ""),
        "ci_text": assessment.get("ci_text", ""),
        "starting_level": assessment.get("starting_level", "high"),
        "factors": factor_summary,
    }

    # Save to database
    db.update("grade_assessments", grade_id, {
        "sof_table_json": json.dumps(sof, ensure_ascii=False),
    })
    db.commit()

    return sof


# ═══════════════════════════════════════════════════════════════════════
#  Starting Level Determination
# ═══════════════════════════════════════════════════════════════════════

def determine_starting_level(project_id: str, db: Optional[DBBackend] = None) -> str:
    """Auto-determine the GRADE starting level from study designs in the project.

    - All RCTs → "high"
    - All observational → "low"
    - Mixed → "low" (conservative)
    - Unknown → "low" (conservative)
    """
    db = db or get_db_backend()
    studies = db.query("studies", {"project_id": project_id})
    included_studies = [s for s in studies if s.get("screening_status") == "included"]

    if not included_studies:
        return "high"  # default, will be adjusted when studies are added

    designs = [s["study_design"].lower().strip() for s in included_studies if s.get("study_design")]
    if not designs:
        return "high"

    import re
    all_rct = all(any(re.search(rf"\b{re.escape(rct_term)}\b", d) for rct_term in RCT_DESIGNS) for d in designs)
    all_obs = all(any(re.search(rf"\b{re.escape(obs_term)}\b", d) for obs_term in OBSERVATIONAL_DESIGNS) for d in designs)

    if all_rct:
        return "high"
    elif all_obs:
        return "low"
    else:
        return "low"  # mixed → conservative


# ═══════════════════════════════════════════════════════════════════════
#  Export
# ═══════════════════════════════════════════════════════════════════════

def export_grade_csv(project_id: str, db: Optional[DBBackend] = None) -> str:
    """Export all GRADE assessments for a project as CSV."""
    import csv
    import io
    from services.storage_backend import get_storage

    db = db or get_db_backend()
    assessments = list_grade_assessments(project_id, db=db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Outcome", "N Studies", "N Participants", "Starting Level",
        "Certainty", "Effect Estimate", "CI",
        "Risk of Bias", "Inconsistency", "Indirectness",
        "Imprecision", "Publication Bias",
        "Large Effect", "Dose-Response", "Plausible Confounding",
    ])

    for a in assessments:
        detail = get_grade_assessment(a["grade_id"], db=db)
        factor_ratings = {f["factor_key"]: f["rating"] for f in detail.get("factors", [])} if detail else {}
        writer.writerow([
            a["outcome_label"], a.get("n_studies", 0), a.get("n_participants", 0),
            a.get("starting_level", ""), a["certainty_rating"],
            a.get("effect_estimate", ""), a.get("ci_text", ""),
            factor_ratings.get("risk_of_bias", ""),
            factor_ratings.get("inconsistency", ""),
            factor_ratings.get("indirectness", ""),
            factor_ratings.get("imprecision", ""),
            factor_ratings.get("publication_bias", ""),
            factor_ratings.get("large_effect", ""),
            factor_ratings.get("dose_response", ""),
            factor_ratings.get("plausible_confounding", ""),
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"grade_{project_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    from services.storage_manager import save_stage_file
    rel_path, abs_path = save_stage_file(project_id, "05_GRADE", filename, csv_bytes)
    return str(abs_path)

