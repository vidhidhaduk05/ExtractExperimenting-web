"""Calibrated confidence engine for AI screening.

Guarantees:
1. Never auto-include: An AI include is always a proposal awaiting human confirmation.
2. Auto-exclude only above a conformally calibrated threshold with target sensitivity (default 0.98 @ 1-alpha 0.95),
   or conservative fallback when uncalibrated.
3. Two independent passes required for any automated routing.
4. Full audit trail and sampled human verification.
"""
from __future__ import annotations

import json
import math
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from database import get_db_backend
from services.db_backend import DBBackend

TARGET_SENSITIVITY = 0.98
ALPHA = 0.95
MIN_CALIBRATION_N = 50

DEFAULT_WEIGHTS = [1.5, 4.0, -2.5, -2.0, -1.0]
DEFAULT_INTERCEPT = -2.0


@dataclass
class PassResult:
    decision: str                  # "include" | "exclude" | "uncertain"
    criterion_hits: dict[str, float] = field(default_factory=dict)  # {criterion_id: confidence 0-1}
    rationale: str = ""
    confidence: float = 0.0


@dataclass
class Calibration:
    weights: list[float] = field(default_factory=lambda: list(DEFAULT_WEIGHTS))
    intercept: float = DEFAULT_INTERCEPT
    t_excl: Optional[float] = None           # None => auto-exclusion disabled or conservative fallback
    t_include: float = 0.90
    n_pos: int = 0
    est_sensitivity: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Calibration:
        if not data:
            return cls()
        return cls(
            weights=data.get("weights", list(DEFAULT_WEIGHTS)),
            intercept=float(data.get("intercept", DEFAULT_INTERCEPT)),
            t_excl=float(data["t_excl"]) if data.get("t_excl") is not None else None,
            t_include=float(data.get("t_include", 0.90)),
            n_pos=int(data.get("n_pos", 0)),
            est_sensitivity=float(data["est_sensitivity"]) if data.get("est_sensitivity") is not None else None,
        )


def _sigmoid(z: float) -> float:
    z_clamped = max(-50.0, min(50.0, z))
    return 1.0 / (1.0 + math.exp(-z_clamped))


def compute_signals(
    pass_a: PassResult,
    pass_b: PassResult,
    safety_net_flag: bool,
    text_len: int,
) -> list[float]:
    """Compute normalized numeric signals for logistic score fusion."""
    _map = {"include": 1.0, "uncertain": 0.5, "exclude": 0.0}
    dec_a = (pass_a.decision or "uncertain").lower()
    dec_b = (pass_b.decision or "uncertain").lower()

    # 1. Directional pass agreement (+1 for both include, -1 for both exclude, 0 otherwise)
    if dec_a == "include" and dec_b == "include":
        pass_agreement = 1.0
    elif dec_a == "exclude" and dec_b == "exclude":
        pass_agreement = -1.0
    else:
        pass_agreement = 0.0

    # 2. Mean decision score
    mean_decision = (_map.get(dec_a, 0.5) + _map.get(dec_b, 0.5)) / 2.0

    # 3. Criterion margin on winning exclude side (applies when exclude is the consensus/winning side)
    crit_margin = 0.0
    if dec_a == "exclude" and dec_b == "exclude":
        margin_a = max(pass_a.criterion_hits.values()) if pass_a.criterion_hits else pass_a.confidence
        margin_b = max(pass_b.criterion_hits.values()) if pass_b.criterion_hits else pass_b.confidence
        crit_margin = max(margin_a, margin_b)
    elif dec_a == "exclude" and dec_b != "include":
        crit_margin = max(pass_a.criterion_hits.values()) if pass_a.criterion_hits else pass_a.confidence
    elif dec_b == "exclude" and dec_a != "include":
        crit_margin = max(pass_b.criterion_hits.values()) if pass_b.criterion_hits else pass_b.confidence

    # 4. Safety net hard flag
    s_flag = 1.0 if safety_net_flag else 0.0

    # 5. Very short text (< 200 chars) is inherently uncertain
    short_text = 1.0 if text_len < 200 else 0.0

    return [pass_agreement, mean_decision, crit_margin, s_flag, short_text]


def score_record(
    pass_a: PassResult,
    pass_b: PassResult,
    safety_net_flag: bool,
    text_len: int,
    cal: Calibration,
) -> float:
    """Fuse two passes into a calibrated P(include) probability in [0, 1]."""
    signals = compute_signals(pass_a, pass_b, safety_net_flag, text_len)
    weights = cal.weights if len(cal.weights) == len(signals) else DEFAULT_WEIGHTS
    intercept = cal.intercept if cal.intercept is not None else DEFAULT_INTERCEPT

    z = intercept + sum(w * s for w, s in zip(weights, signals))
    return _sigmoid(z)


def _sens_lower_bound(n_pos: int, sens_hat: float, alpha: float = ALPHA) -> float:
    """One-sided exact Clopper-Pearson binomial lower bound for sensitivity.

    Uses BetaQuantile(alpha; k, n-k+1). When observed sensitivity is 1.0 (k == n),
    the lower bound is alpha^(1/n), not 1.0. At 95% confidence, 50/50 yields ~0.9418.
    """
    if n_pos <= 0:
        return 0.0
    signif = (1.0 - alpha) if alpha > 0.5 else alpha
    k = int(round(sens_hat * n_pos))
    if k <= 0:
        return 0.0
    if k >= n_pos:
        return float(signif ** (1.0 / n_pos))
    try:
        from scipy.stats import beta
        return float(beta.ppf(signif, k, n_pos - k + 1))
    except Exception:
        z = 1.6449
        variance = max(0.0, sens_hat * (1.0 - sens_hat))
        return max(0.0, sens_hat - z * math.sqrt(variance / n_pos))


def select_threshold(
    calibration_records: list[dict[str, Any]],
    target: float = TARGET_SENSITIVITY,
) -> Calibration:
    """Select auto-exclusion threshold using conformal risk control over calibration records.

    calibration_records format:
    [{'p_include': float, 'human_decision': 'included' | 'excluded' | 'ta_included'}]
    """
    pos = [
        float(r["p_include"])
        for r in calibration_records
        if str(r.get("human_decision", "")).lower() in ("included", "include", "ta_included")
        and r.get("p_include") is not None
    ]

    if len(pos) < MIN_CALIBRATION_N:
        return Calibration(
            weights=list(DEFAULT_WEIGHTS),
            intercept=DEFAULT_INTERCEPT,
            t_excl=None,
            n_pos=len(pos),
            est_sensitivity=None,
        )

    best_t: Optional[float] = None
    # Candidate exclusion thresholds for P(include): higher threshold excludes more, tested from highest to lowest
    candidate_thresholds = [0.35, 0.30, 0.25, 0.20, 0.15, 0.10, 0.05, 0.02, 0.01]
    for t in candidate_thresholds:
        sens_hat = sum(1 for p in pos if p > t) / len(pos)
        if _sens_lower_bound(len(pos), sens_hat, ALPHA) >= target:
            best_t = t
            break

    est_sens = (sum(1 for p in pos if p > best_t) / len(pos)) if best_t is not None else None

    return Calibration(
        weights=list(DEFAULT_WEIGHTS),
        intercept=DEFAULT_INTERCEPT,
        t_excl=best_t,
        n_pos=len(pos),
        est_sensitivity=est_sens,
    )


def decide(
    p_include: float,
    pass_a: PassResult,
    pass_b: PassResult,
    safety_net_flag: bool,
    cal: Calibration,
) -> tuple[str, Optional[str]]:
    """Determine screening action from fused score and dual passes.

    Returns:
        (routed_status, exclusion_criterion_or_None)
        routed_status in ('auto_excluded', 'proposed_include', 'uncertain')
        Never returns final 'included'.
    """
    dec_a = (pass_a.decision or "uncertain").lower()
    dec_b = (pass_b.decision or "uncertain").lower()
    both_exclude = (dec_a == "exclude" and dec_b == "exclude")

    # 1. Auto-exclusion routing
    if both_exclude and not safety_net_flag:
        # Determine best exclusion criterion from hits or rationale
        crit = None
        if pass_a.criterion_hits:
            crit = max(pass_a.criterion_hits, key=pass_a.criterion_hits.get)
        elif pass_b.criterion_hits:
            crit = max(pass_b.criterion_hits, key=pass_b.criterion_hits.get)

        # Calibrated threshold branch
        if cal.t_excl is not None:
            if p_include <= cal.t_excl:
                return "auto_excluded", crit or "criteria_unspecified"
        else:
            # Conservative uncalibrated fallback:
            # Exclude only if high confidence (margin >= 0.85) and low include probability (P <= 0.20)
            margin_a = max(pass_a.criterion_hits.values()) if pass_a.criterion_hits else pass_a.confidence
            margin_b = max(pass_b.criterion_hits.values()) if pass_b.criterion_hits else pass_b.confidence
            if max(margin_a, margin_b) >= 0.85 and p_include <= 0.20:
                return "auto_excluded", crit or "criteria_unspecified"

    # 2. Proposed include routing (always requires human confirmation)
    both_include = (dec_a == "include" and dec_b == "include")
    if both_include and p_include >= cal.t_include:
        return "proposed_include", None

    # 3. Everything else -> uncertain human queue
    return "uncertain", None


# ── Persistence & Auditing Helpers ──

def get_calibration(project_id: str, stage: str = "ta", db: Optional[DBBackend] = None) -> Calibration:
    """Retrieve the active calibration for a project and stage."""
    db = db or get_db_backend()
    row = db.get("projects", project_id)
    if not row or not row.get("screening_config_json"):
        return Calibration()

    try:
        cfg = json.loads(row["screening_config_json"])
        key = f"calibration_{stage}"
        if key in cfg and isinstance(cfg[key], dict):
            return Calibration.from_dict(cfg[key])
    except Exception:
        pass

    return Calibration()


def save_calibration(project_id: str, stage: str, cal: Calibration, db: Optional[DBBackend] = None) -> None:
    """Persist calibration parameters for a project and stage."""
    db = db or get_db_backend()
    row = db.get("projects", project_id)
    if not row:
        return

    cfg = {}
    if row.get("screening_config_json"):
        try:
            cfg = json.loads(row["screening_config_json"])
        except Exception:
            cfg = {}

    cfg[f"calibration_{stage}"] = cal.to_dict()
    db.update("projects", project_id, {"screening_config_json": json.dumps(cfg)})
    db.commit()


def is_sampled_for_audit(study_id: str, sample_rate: float = 0.05) -> bool:
    """Deterministic sampling of auto-exclusions for blinded human audit."""
    if not study_id or sample_rate <= 0:
        return False
    digest = hashlib.md5(study_id.encode("utf-8")).hexdigest()
    val = int(digest[:4], 16) % 10000
    threshold = int(sample_rate * 10000)
    return val < threshold


def record_human_decision_feedback(
    project_id: str,
    study_id: str,
    human_decision: str,
    stage: str = "ta",
    db: Optional[DBBackend] = None,
) -> bool:
    """Handle human re-inclusion of an auto-excluded study.

    Returns True if recalibration / threshold tightening was triggered.
    """
    db = db or get_db_backend()
    study = db.get("studies", study_id)
    if not study:
        return False

    was_auto_excluded = bool(study.get("auto_decision") and study.get("screening_status") == "excluded")
    is_human_include = human_decision in ("included", "include", "ta_included")

    if was_auto_excluded and is_human_include:
        # Reversal detected! Tighten threshold immediately
        cal = get_calibration(project_id, stage, db)
        if cal.t_excl is not None:
            # Shift threshold more conservative (lower threshold excludes fewer)
            cal.t_excl = max(0.01, cal.t_excl * 0.90)
            save_calibration(project_id, stage, cal, db)
            return True

    return False


def compute_workload_and_recall(
    project_id: str,
    stage: str = "ta",
    db: Optional[DBBackend] = None,
) -> dict[str, Any]:
    """Compute continuous accuracy audit metrics, re-inclusion recall, and workload savings."""
    db = db or get_db_backend()
    studies = db.query("studies", {"project_id": project_id})

    total = len(studies)
    auto_excluded_count = 0
    reversals = 0
    sampled_audits = 0

    for s in studies:
        is_auto = bool(s.get("auto_decision"))
        status = s.get("screening_status")
        if is_auto and status == "excluded":
            auto_excluded_count += 1
        elif is_auto and status in ("included", "ta_included"):
            reversals += 1

        if s.get("sampled_audit"):
            sampled_audits += 1

    pct_auto = (auto_excluded_count / total * 100.0) if total > 0 else 0.0
    recall_reversal_rate = (reversals / (auto_excluded_count + reversals)) if (auto_excluded_count + reversals) > 0 else 0.0

    # Minutes saved: ~1.5 min per title/abstract, ~10 min per fulltext
    min_per_study = 10.0 if stage == "ft" else 1.5
    minutes_saved = auto_excluded_count * min_per_study

    cal = get_calibration(project_id, stage, db)

    return {
        "project_id": project_id,
        "stage": stage,
        "total_studies": total,
        "auto_excluded_count": auto_excluded_count,
        "auto_excluded_percentage": round(pct_auto, 2),
        "estimated_minutes_saved": round(minutes_saved, 1),
        "reversals_count": reversals,
        "re_inclusion_rate": round(recall_reversal_rate, 4),
        "sampled_audits_count": sampled_audits,
        "calibration": cal.to_dict(),
        "sensitivity_guarantee_met": bool(cal.t_excl is not None and (1.0 - recall_reversal_rate) >= TARGET_SENSITIVITY),
    }


def recalibrate_project(
    project_id: str,
    stage: str = "ta",
    db: Optional[DBBackend] = None,
) -> dict[str, Any]:
    """Recalibrate auto-exclusion threshold from human-decided records in project."""
    db = db or get_db_backend()
    decisions = db.query("screening_decisions", {"project_id": project_id, "stage": stage})

    human_decisions = [
        d for d in decisions
        if d.get("reviewer_id") not in ("ai_screener", "ai_reviewer")
    ]

    records = []
    seen_studies = set()
    for d in human_decisions:
        sid = d.get("study_id")
        if not sid or sid in seen_studies:
            continue
        seen_studies.add(sid)
        study = db.get("studies", sid)
        if not study:
            continue
        p_inc = study.get("ai_p_include")
        if p_inc is not None:
            records.append({
                "p_include": float(p_inc),
                "human_decision": d.get("decision", ""),
            })

    cal = select_threshold(records, target=TARGET_SENSITIVITY)
    save_calibration(project_id, stage, cal, db)
    return compute_workload_and_recall(project_id, stage, db)
