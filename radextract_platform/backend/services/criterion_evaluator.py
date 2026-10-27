"""Threshold-Based Criterion Evaluation Service.

Implements the deterministic arithmetic model for inclusion/exclusion criteria evaluation:
- Inclusion/Exclusion sliders with thresholds tau in [0.0, 1.0]
- Strict vs weighted evaluation rules
- Fail-closed handling for missing scores (blocks auto-exclusion, records flagged_unscored)
- Combination rule: any criterion fires -> Propose-Exclude with margin reporting
- Clopper-Pearson exact binomial upper bound on miss rate
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

try:
    from scipy.stats import beta
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


class Criterion(BaseModel):
    id: str
    text: str
    direction: Literal["inclusion", "exclusion"]
    rule_mode: Literal["strict", "weighted"]
    threshold: float = Field(default=0.90, ge=0.0, le=1.0)
    score_source: Literal["keyword", "model", "hybrid"] = "model"
    enabled: bool = True
    version: int = 1


DEFAULT_CRITERIA: List[Criterion] = [
    Criterion(
        id="crit_excl_animal",
        text="Animal-only study without human clinical data",
        direction="exclusion",
        rule_mode="weighted",
        threshold=0.90,
        score_source="model",
        enabled=True,
        version=1,
    ),
    Criterion(
        id="crit_excl_case_report",
        text="Case report or small case series under 5 patients",
        direction="exclusion",
        rule_mode="weighted",
        threshold=0.95,
        score_source="model",
        enabled=True,
        version=1,
    ),
    Criterion(
        id="crit_excl_language",
        text="Non-English publication without accessible translation",
        direction="exclusion",
        rule_mode="strict",
        threshold=1.0,
        score_source="keyword",
        enabled=True,
        version=1,
    ),
    Criterion(
        id="crit_incl_human",
        text="Human participants in target clinical cohort",
        direction="inclusion",
        rule_mode="weighted",
        threshold=0.80,
        score_source="model",
        enabled=True,
        version=1,
    ),
]


def evaluate_exclusion(criterion: Criterion, score: Optional[float]) -> Optional[bool]:
    """Evaluate if an exclusion criterion fires (score bad -> study out)."""
    if criterion.rule_mode == "strict":
        if score is None:
            return None
        return score == 1.0 or score == 1
    if score is None:
        return None
    return score >= criterion.threshold


def evaluate_inclusion_fail(criterion: Criterion, score: Optional[float]) -> Optional[bool]:
    """Evaluate if an inclusion criterion fails (score bad -> study out)."""
    if criterion.rule_mode == "strict":
        if score is None:
            return None
        return score == 0.0 or score == 0
    if score is None:
        return None
    return score < criterion.threshold


def evaluate_study_against_criteria(
    scores: Dict[str, Optional[float]],
    criteria: List[Criterion],
) -> Dict[str, Any]:
    """Evaluate a single study against user-configurable criteria.

    Implements the any-fire, report all combination rule with fail-closed missing scores.
    """
    fired = []
    flagged_unscored = []

    for c in criteria:
        if not c.enabled:
            continue

        p = scores.get(c.id)

        if p is None:
            flagged_unscored.append(c.id)
            continue

        if c.direction == "exclusion":
            vote = evaluate_exclusion(c, p)
        else:
            vote = evaluate_inclusion_fail(c, p)

        if vote is True:
            margin = round(abs(p - c.threshold), 4) if c.rule_mode == "weighted" else 0.0
            fired.append({
                "criterion": c.id,
                "text": c.text,
                "direction": c.direction,
                "rule_mode": c.rule_mode,
                "score": p,
                "threshold": c.threshold,
                "margin": margin,
            })

    # Sort fired list: margin ascending (closest calls first), then threshold descending
    fired.sort(key=lambda x: (x["margin"], -x["threshold"]))

    if fired:
        decision = "Propose-Exclude"
    else:
        decision = "Keep for Manual Review"

    return {
        "decision": decision,
        "fired": fired,
        "flagged_unscored": flagged_unscored,
    }


def compute_clopper_pearson_upper_bound(
    k: int,
    n: int,
    alpha: float = 0.05,
    two_sided: bool = False,
) -> Optional[float]:
    """Compute Clopper-Pearson exact binomial upper bound on miss rate.

    Args:
        k: Number of misses observed.
        n: Total number of human-adjudicated studies.
        alpha: Significance level (default 0.05 for 95% confidence).
        two_sided: If True, uses alpha / 2 for two-sided upper limit.

    Returns:
        Upper bound U in [0.0, 1.0], or None if n == 0.
    """
    if n <= 0:
        return None
    if k >= n:
        return 1.0
    if k == 0 and not two_sided:
        # Exact closed form: 1 - alpha^(1/n)
        return round(1.0 - math.pow(alpha, 1.0 / n), 4)

    quant = 1.0 - (alpha / 2.0 if two_sided else alpha)

    if HAS_SCIPY:
        # U = BetaQuantile(1 - a; k + 1, n - k)
        u_val = float(beta.ppf(quant, k + 1, n - k))
        return round(u_val, 4)

    # Fallback numerical approximation if scipy not available
    # For k=0: 1 - alpha^(1/n)
    if k == 0:
        return round(1.0 - math.pow(alpha if not two_sided else alpha / 2.0, 1.0 / n), 4)
    return round((k + 1.96 * math.sqrt(k * (1.0 - k / n))) / n, 4)
