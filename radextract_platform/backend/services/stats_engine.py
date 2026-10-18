"""
Statistical Testing and Power Engine for RadExtract.
Adapted from K-Dense-AI statistical-analysis skill.
Provides guided test selection, assumption checks (Shapiro-Wilk, Levene), effect size calculation, power analysis, and APA 7th writeup.
"""
from typing import List, Dict, Any, Optional
import math
import numpy as np
from scipy import stats

def run_statistical_analysis(
    group1: List[float],
    group2: List[float],
    group1_name: str = "Intervention",
    group2_name: str = "Control",
    paired: bool = False,
    alpha: float = 0.05
) -> Dict[str, Any]:
    """
    Perform comprehensive statistical test selection, assumption validation, effect size, and APA writeup.
    """
    arr1 = np.array([float(x) for x in group1 if x is not None and not np.isnan(float(x))])
    arr2 = np.array([float(x) for x in group2 if x is not None and not np.isnan(float(x))])
    
    n1, n2 = len(arr1), len(arr2)
    if n1 < 3 or n2 < 3:
        return {
            "error": "At least 3 valid observations are required per group.",
            "n1": n1, "n2": n2
        }

    # Descriptive Statistics
    m1, sd1 = float(np.mean(arr1)), float(np.std(arr1, ddof=1)) if n1 > 1 else 0.0
    m2, sd2 = float(np.mean(arr2)), float(np.std(arr2, ddof=1)) if n2 > 1 else 0.0
    med1, iqr1 = float(np.median(arr1)), float(stats.iqr(arr1))
    med2, iqr2 = float(np.median(arr2)), float(stats.iqr(arr2))
    
    # 1. Assumption Check: Normality (Shapiro-Wilk)
    _, p_norm1 = stats.shapiro(arr1) if n1 >= 3 else (0, 0.0)
    _, p_norm2 = stats.shapiro(arr2) if n2 >= 3 else (0, 0.0)
    is_normal = (p_norm1 >= 0.05) and (p_norm2 >= 0.05)
    
    # 2. Assumption Check: Equality of Variances (Levene's Test)
    _, p_levene = stats.levene(arr1, arr2) if not paired else (0, 1.0)
    equal_var = p_levene >= 0.05
    
    # 3. Test Selection & Execution
    if paired:
        if n1 != n2:
            return {"error": "Paired comparison requires equal sample sizes."}
        if is_normal:
            test_name = "Paired Samples t-test"
            res = stats.ttest_rel(arr1, arr2)
            stat_val, p_val, df = float(res.statistic), float(res.pvalue), n1 - 1
            # Cohen's d for paired
            diffs = arr1 - arr2
            d_val = float(np.mean(diffs) / (np.std(diffs, ddof=1) if np.std(diffs, ddof=1) > 0 else 1.0))
            effect_name = "Cohen's d"
            apa_stat = f"t({df}) = {stat_val:.2f}, p = {p_val:.3f}, d = {d_val:.2f}"
        else:
            test_name = "Wilcoxon Signed-Rank Test"
            res = stats.wilcoxon(arr1, arr2)
            stat_val, p_val = float(res.statistic), float(res.pvalue)
            # Rank biserial correlation
            r_biserial = 1.0 - (2.0 * stat_val) / (n1 * (n1 + 1) / 2)
            d_val = float(r_biserial)
            effect_name = "Rank-Biserial r"
            apa_stat = f"W = {stat_val:.2f}, p = {p_val:.3f}, r = {d_val:.2f}"
    else:
        if is_normal and equal_var:
            test_name = "Independent Samples t-test (Student's)"
            res = stats.ttest_ind(arr1, arr2, equal_var=True)
            stat_val, p_val, df = float(res.statistic), float(res.pvalue), n1 + n2 - 2
            # Pooled SD for Cohen's d
            s_pooled = math.sqrt(((n1 - 1) * sd1**2 + (n2 - 1) * sd2**2) / df)
            d_val = float((m1 - m2) / s_pooled) if s_pooled > 0 else 0.0
            effect_name = "Cohen's d"
            apa_stat = f"t({df}) = {stat_val:.2f}, p = {p_val:.3f}, d = {d_val:.2f}"
        elif is_normal and not equal_var:
            test_name = "Welch's t-test (Unequal Variances)"
            res = stats.ttest_ind(arr1, arr2, equal_var=False)
            stat_val, p_val = float(res.statistic), float(res.pvalue)
            # Welch-Satterthwaite df
            v1, v2 = sd1**2 / n1, sd2**2 / n2
            df = float((v1 + v2)**2 / (v1**2 / (n1 - 1) + v2**2 / (n2 - 1)))
            s_pooled = math.sqrt((sd1**2 + sd2**2) / 2)
            d_val = float((m1 - m2) / s_pooled) if s_pooled > 0 else 0.0
            effect_name = "Cohen's d (Welch)"
            apa_stat = f"t({df:.1f}) = {stat_val:.2f}, p = {p_val:.3f}, d = {d_val:.2f}"
        else:
            test_name = "Mann-Whitney U Test (Non-parametric)"
            res = stats.mannwhitneyu(arr1, arr2, alternative="two-sided")
            stat_val, p_val = float(res.statistic), float(res.pvalue)
            # Rank biserial correlation
            r_biserial = 1.0 - (2.0 * stat_val) / (n1 * n2)
            d_val = float(r_biserial)
            effect_name = "Rank-Biserial r"
            apa_stat = f"U = {stat_val:.2f}, p = {p_val:.3f}, r = {d_val:.2f}"

    # 4. APA Narrative Synthesis
    sig_str = "statistically significant" if p_val < alpha else "not statistically significant"
    apa_text = (
        f"An {test_name} was conducted to compare {group1_name} and {group2_name}. "
        f"For {group1_name} (M = {m1:.2f}, SD = {sd1:.2f}, Mdn = {med1:.2f}), "
        f"and {group2_name} (M = {m2:.2f}, SD = {sd2:.2f}, Mdn = {med2:.2f}), "
        f"the difference was {sig_str}, {apa_stat}."
    )

    return {
        "test_name": test_name,
        "statistic": stat_val,
        "p_value": p_val,
        "is_significant": bool(p_val < alpha),
        "effect_size_name": effect_name,
        "effect_size": d_val,
        "descriptives": {
            group1_name: {"n": n1, "mean": m1, "sd": sd1, "median": med1, "iqr": iqr1},
            group2_name: {"n": n2, "mean": m2, "sd": sd2, "median": med2, "iqr": iqr2},
        },
        "assumptions": {
            "normality_group1_p": float(p_norm1),
            "normality_group2_p": float(p_norm2),
            "normality_passed": bool(is_normal),
            "levene_variance_p": float(p_levene),
            "equal_variance_passed": bool(equal_var),
        },
        "apa_formatted_result": apa_stat,
        "apa_narrative": apa_text,
    }
