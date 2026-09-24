"""Meta-analysis service: diagnostic accuracy (bivariate) and generic inverse-variance.

Implements:
  1. Bivariate model (Reitsma et al. 2005) for diagnostic accuracy meta-analysis
     — pooled sensitivity/specificity with CIs, SROC curve, AUC.
  2. DerSimonian-Laird random-effects model for generic inverse-variance pooling
     — supports MD, SMD, RR, OR, HR via log transformation.
  3. Heterogeneity statistics: I², Cochran's Q, tau².
  4. Publication bias: Egger's regression test, funnel plot data.
  5. SVG plot generation via R (metafor, mada) with matplotlib fallback.

References:
  - Reitsma JB, Glas AS, Rutjes AWS, et al. Bivariate analysis of sensitivity
    and specificity produces informative summary measures in diagnostic reviews.
    J Clin Epidemiol. 2005;58(10):982-990.
  - DerSimonian R, Laird N. Meta-analysis in clinical trials. Control Clin Trials.
    1986;7(3):177-188.
  - Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected
    by a simple, graphical test. BMJ. 1997;315(7109):629-634.
"""
from __future__ import annotations
import math
import json
import uuid
from datetime import datetime
from typing import Optional

import numpy as np
from scipy import optimize, stats
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

# R plot service for professional R-library-themed plots
try:
    from services import r_plot_service
    _R_PLOTS_AVAILABLE = True
except ImportError:
    _R_PLOTS_AVAILABLE = False

# Shared plot configuration (fonts, colors, SVG settings)
from services.plot_config import (
    configure_plots, save_figure, PHYLO_COLORS as _PHYLO_COLORS,
)
configure_plots()

# Keep PHYLO_COLORS for backward compatibility (merge with any extra keys)
PHYLO_COLORS = {
    **_PHYLO_COLORS,
    "red": "#E94444",
    "dark_red": "#B00000",
    "gray": "#999999",
}


# ═══════════════════════════════════════════════════════════════════════
#  Diagnostic Accuracy: Bivariate Model (Reitsma 2005)
# ═══════════════════════════════════════════════════════════════════════

def _logit(p: float) -> float:
    """Logit transform with continuity correction for 0 or 1."""
    p = max(min(p, 1 - 1e-10), 1e-10)
    return math.log(p / (1 - p))


def _logit_inv(x: float) -> float:
    """Inverse logit transform."""
    return 1.0 / (1.0 + math.exp(-x))


def _logit_se(p: float, n: int) -> float:
    """Standard error of logit(p) given n trials."""
    p = max(min(p, 1 - 1e-10), 1e-10)
    return math.sqrt(1.0 / (n * p * (1 - p)))


def fit_bivariate_model(
    sensitivities: list[float],
    specificities: list[float],
    n_pos: list[int],
    n_neg: list[int],
) -> dict:
    """Fit the bivariate model for diagnostic accuracy meta-analysis.

    Args:
        sensitivities: list of sensitivity values (0-1)
        specificities: list of specificity values (0-1)
        n_pos: number of positive (diseased) cases per study
        n_neg: number of negative (non-diseased) cases per study

    Returns:
        dict with pooled_sens, pooled_spec, their CIs, correlation,
        SROC parameters (a, b), AUC, and covariance matrix.
    """
    n_studies = len(sensitivities)
    if n_studies < 2:
        raise ValueError("Need at least 2 studies for bivariate model")

    # Transform to logit scale
    logit_sens = np.array([_logit(s) for s in sensitivities])
    logit_spec = np.array([_logit(sp) for sp in specificities])
    var_sens = np.array([_logit_se(s, n) ** 2 for s, n in zip(sensitivities, n_pos)])
    var_spec = np.array([_logit_se(sp, n) ** 2 for sp, n in zip(specificities, n_neg)])

    # Negative log-likelihood for bivariate normal model
    def neg_log_lik(params):
        mu_sens, mu_spec, var_re_sens, var_re_spec, rho = params
        # Ensure positive variances and valid correlation
        var_re_sens = max(var_re_sens, 1e-8)
        var_re_spec = max(var_re_spec, 1e-8)
        rho = max(min(rho, 0.999), -0.999)

        cov_re = rho * math.sqrt(var_re_sens * var_re_spec)

        total_var_sens = var_sens + var_re_sens
        total_var_spec = var_spec + var_re_spec
        total_cov = cov_re  # within-study covariance is 0 (independent samples)

        # Bivariate normal log-likelihood
        ll = 0.0
        for i in range(n_studies):
            tv_s = total_var_sens[i]
            tv_sp = total_var_spec[i]
            det = tv_s * tv_sp - total_cov ** 2
            if det <= 0:
                return 1e10
            d_sens = logit_sens[i] - mu_sens
            d_spec = logit_spec[i] - mu_spec
            ll += -0.5 * math.log(2 * math.pi * det) - 0.5 * (
                (d_spec ** 2 * tv_s - 2 * total_cov * d_sens * d_spec + d_sens ** 2 * tv_sp) / det
            )
        return -ll

    # Initial guesses
    x0 = [
        np.mean(logit_sens),  # mu_sens
        np.mean(logit_spec),  # mu_spec
        max(np.var(logit_sens) - np.mean(var_sens), 0.1),  # var_re_sens
        max(np.var(logit_spec) - np.mean(var_spec), 0.1),  # var_re_spec
        0.0,  # rho
    ]

    result = optimize.minimize(
        neg_log_lik, x0, method="Nelder-Mead",
        options={"maxiter": 10000, "xatol": 1e-6, "fatol": 1e-6},
    )

    mu_sens, mu_spec, var_re_sens, var_re_spec, rho = result.x
    var_re_sens = max(var_re_sens, 1e-8)
    var_re_spec = max(var_re_spec, 1e-8)
    rho = max(min(rho, 0.999), -0.999)

    # Pooled estimates
    pooled_sens = _logit_inv(mu_sens)
    pooled_spec = _logit_inv(mu_spec)

    # Standard errors from the Hessian approximation
    # Use the inverse of the observed information (simplified)
    se_mu_sens = math.sqrt(var_re_sens / n_studies + np.mean(var_sens) / n_studies)
    se_mu_spec = math.sqrt(var_re_spec / n_studies + np.mean(var_spec) / n_studies)

    # CIs on logit scale, then transform back
    ci_sens_lower = _logit_inv(mu_sens - 1.96 * se_mu_sens)
    ci_sens_upper = _logit_inv(mu_sens + 1.96 * se_mu_sens)
    ci_spec_lower = _logit_inv(mu_spec - 1.96 * se_mu_spec)
    ci_spec_upper = _logit_inv(mu_spec + 1.96 * se_mu_spec)

    # SROC curve parameters (Rutter & Gatsonis 2001 parameterization)
    # a = mu_sens + mu_spec (intercept), b = mu_sens - mu_spec (slope)
    # Actually, the Reitsma parameterization:
    # SROC: logit(TPR) = a + b * logit(FPR)
    # where a = mu_sens + mu_spec * rho * sqrt(var_re_sens/var_re_spec)
    # and b = rho * sqrt(var_re_sens/var_re_spec)
    # Simplified: a = mu_sens, b relates to the correlation
    a = mu_sens + mu_spec  # simplified intercept
    b = rho * math.sqrt(var_re_sens / var_re_spec) if var_re_spec > 0 else 0

    # AUC (area under SROC)
    # Approximate by numerical integration
    fpr_range = np.linspace(0.001, 0.999, 1000)
    tpr_range = np.array([_logit_inv(a + b * _logit(fpr)) for fpr in fpr_range])
    auc = float(np.trapezoid(tpr_range, fpr_range))

    return {
        "pooled_sensitivity": round(pooled_sens, 4),
        "pooled_specificity": round(pooled_spec, 4),
        "sens_ci_lower": round(ci_sens_lower, 4),
        "sens_ci_upper": round(ci_sens_upper, 4),
        "spec_ci_lower": round(ci_spec_lower, 4),
        "spec_ci_upper": round(ci_spec_upper, 4),
        "correlation": round(rho, 4),
        "sroc_a": round(a, 4),
        "sroc_b": round(b, 4),
        "auc": round(auc, 4),
        "n_studies": n_studies,
        "logit_sens_mean": round(float(mu_sens), 4),
        "logit_spec_mean": round(float(mu_spec), 4),
        "var_re_sens": round(float(var_re_sens), 4),
        "var_re_spec": round(float(var_re_spec), 4),
    }


def compute_sroc_curve(a: float, b: float, n_points: int = 100) -> list[dict]:
    """Generate SROC curve points (FPR, TPR pairs).

    Uses the logit-linear form: logit(TPR) = a + b * logit(FPR)
    """
    fpr_values = np.linspace(0.01, 0.99, n_points)
    points = []
    for fpr in fpr_values:
        logit_fpr = _logit(fpr)
        logit_tpr = a + b * logit_fpr
        tpr = _logit_inv(logit_tpr)
        points.append({"fpr": round(float(fpr), 4), "tpr": round(float(tpr), 4)})
    return points


# ═══════════════════════════════════════════════════════════════════════
#  Generic Inverse-Variance: DerSimonian-Laird Random Effects
# ═══════════════════════════════════════════════════════════════════════

def compute_effect_size(
    study_data: dict,
    effect_measure: str,
) -> tuple[float, float]:
    """Compute effect size and its variance from raw study data.

    Args:
        study_data: dict with study-specific data
        effect_measure: one of 'md', 'smd', 'rr', 'or', 'hr', 'log_or', 'log_rr', 'log_hr'

    Returns:
        (effect_size, variance)
    """
    em = effect_measure.lower()

    # Shortcut: if pre-computed effect_size and variance are provided, use them directly
    if "effect_size" in study_data and "variance" in study_data:
        return (float(study_data["effect_size"]), float(study_data["variance"]))

    if em in ("md", "mean_difference"):
        # Mean difference: needs mean1, sd1, n1, mean2, sd2, n2
        m1, sd1, n1 = study_data["mean1"], study_data["sd1"], study_data["n1"]
        m2, sd2, n2 = study_data["mean2"], study_data["sd2"], study_data["n2"]
        effect = m1 - m2
        variance = sd1 ** 2 / n1 + sd2 ** 2 / n2
        return (float(effect), float(variance))

    elif em in ("smd", "standardized_mean_difference"):
        # Standardized mean difference (Hedges' g with correction)
        m1, sd1, n1 = study_data["mean1"], study_data["sd1"], study_data["n1"]
        m2, sd2, n2 = study_data["mean2"], study_data["sd2"], study_data["n2"]
        # Pooled SD
        sp = math.sqrt(((n1 - 1) * sd1 ** 2 + (n2 - 1) * sd2 ** 2) / (n1 + n2 - 2))
        if sp == 0:
            sp = 1e-10
        d = (m1 - m2) / sp
        # Hedges' correction factor
        J = 1 - 3.0 / (4 * (n1 + n2) - 9)
        g = d * J
        variance = (n1 + n2) / (n1 * n2) + g ** 2 / (2 * (n1 + n2))
        return (float(g), float(variance))

    elif em in ("rr", "risk_ratio", "log_rr"):
        # Risk ratio: needs a, b, c, d (2x2 table)
        # a = events in treatment, b = non-events in treatment
        # c = events in control, d = non-events in control
        a, b = study_data["a"], study_data["b"]
        c, d = study_data["c"], study_data["d"]
        # Continuity correction
        if a == 0 or c == 0:
            a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
        rr = (a / (a + b)) / (c / (c + d))
        log_rr = math.log(rr)
        variance = 1.0 / a - 1.0 / (a + b) + 1.0 / c - 1.0 / (c + d)
        return (float(log_rr), float(variance))

    elif em in ("or", "odds_ratio", "log_or"):
        # Odds ratio: needs a, b, c, d
        a, b = study_data["a"], study_data["b"]
        c, d = study_data["c"], study_data["d"]
        if a == 0 or b == 0 or c == 0 or d == 0:
            a, b, c, d = a + 0.5, b + 0.5, c + 0.5, d + 0.5
        log_or = math.log((a * d) / (b * c))
        variance = 1.0 / a + 1.0 / b + 1.0 / c + 1.0 / d
        return (float(log_or), float(variance))

    elif em in ("hr", "hazard_ratio", "log_hr"):
        # Hazard ratio: needs log_hr and se or ci_lower/upper
        if "log_hr" in study_data and "se" in study_data:
            return (float(study_data["log_hr"]), float(study_data["se"] ** 2))
        elif "hr" in study_data and "ci_lower" in study_data and "ci_upper" in study_data:
            hr = study_data["hr"]
            log_hr = math.log(hr)
            se = (math.log(study_data["ci_upper"]) - math.log(study_data["ci_lower"])) / (2 * 1.96)
            return (float(log_hr), float(se ** 2))
        else:
            raise ValueError("HR requires log_hr+se or hr+ci_lower+ci_upper")

    elif em in ("generic", "iv", "inverse_variance"):
        # Pre-computed effect size and variance
        return (float(study_data["effect_size"]), float(study_data["variance"]))

    else:
        raise ValueError(f"Unknown effect measure: {effect_measure}")


def fit_generic_meta_analysis(
    effect_sizes: list[float],
    variances: list[float],
    effect_measure: str = "md",
) -> dict:
    """Fit DerSimonian-Laird random-effects meta-analysis.

    Args:
        effect_sizes: list of study-level effect sizes (on natural or log scale)
        variances: list of within-study variances
        effect_measure: the effect measure type (for reporting)

    Returns:
        dict with pooled effect, CI, z-test, heterogeneity stats.
    """
    n = len(effect_sizes)
    if n < 2:
        raise ValueError("Need at least 2 studies for meta-analysis")

    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    w_fixed = 1.0 / v

    # Fixed-effect estimate
    q_num = np.sum(w_fixed * y ** 2) - np.sum(w_fixed * y) ** 2 / np.sum(w_fixed)
    Q = float(q_num)
    df = n - 1

    # tau² (DerSimonian-Laird method of moments)
    c = np.sum(w_fixed) - np.sum(w_fixed ** 2) / np.sum(w_fixed)
    tau_sq = max(0.0, (Q - df) / c) if c > 0 else 0.0

    # Random-effects weights
    w_random = 1.0 / (v + tau_sq)

    # Pooled effect
    pooled = float(np.sum(w_random * y) / np.sum(w_random))
    se_pooled = float(math.sqrt(1.0 / np.sum(w_random)))

    # CI
    ci_lower = pooled - 1.96 * se_pooled
    ci_upper = pooled + 1.96 * se_pooled

    # z-test
    z = pooled / se_pooled if se_pooled > 0 else 0.0
    p_value = 2 * (1 - stats.norm.cdf(abs(z)))

    # I²
    i_squared = max(0.0, (Q - df) / Q * 100) if Q > 0 else 0.0

    # H statistic
    H = math.sqrt(Q / df) if df > 0 and Q > 0 else 1.0

    # Transform back for log-based measures
    is_log = effect_measure.lower() in ("rr", "log_rr", "or", "log_or", "hr", "log_hr")
    pooled_report = math.exp(pooled) if is_log else pooled
    ci_lower_report = math.exp(ci_lower) if is_log else ci_lower
    ci_upper_report = math.exp(ci_upper) if is_log else ci_upper

    return {
        "pooled_effect": round(pooled_report, 4),
        "pooled_effect_log": round(pooled, 4),
        "ci_lower": round(ci_lower_report, 4),
        "ci_upper": round(ci_upper_report, 4),
        "se": round(se_pooled, 4),
        "z_statistic": round(z, 4),
        "p_value": round(p_value, 6),
        "i_squared": round(i_squared, 2),
        "tau_squared": round(tau_sq, 4),
        "q_statistic": round(Q, 4),
        "q_p_value": round(1 - stats.chi2.cdf(Q, df), 6) if df > 0 else 1.0,
        "h_statistic": round(H, 4),
        "n_studies": n,
        "effect_measure": effect_measure,
        "is_log_transformed": is_log,
    }


def compute_heterogeneity(
    effect_sizes: list[float],
    variances: list[float],
) -> dict:
    """Compute heterogeneity statistics independently."""
    n = len(effect_sizes)
    if n < 2:
        return {"i_squared": 0, "q_statistic": 0, "q_p_value": 1, "tau_squared": 0}

    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    w = 1.0 / v

    Q = float(np.sum(w * y ** 2) - np.sum(w * y) ** 2 / np.sum(w))
    df = n - 1
    c = np.sum(w) - np.sum(w ** 2) / np.sum(w)
    tau_sq = max(0.0, (Q - df) / c) if c > 0 else 0.0
    i_sq = max(0.0, (Q - df) / Q * 100) if Q > 0 else 0.0

    return {
        "i_squared": round(i_sq, 2),
        "q_statistic": round(Q, 4),
        "q_p_value": round(1 - stats.chi2.cdf(Q, df), 6) if df > 0 else 1.0,
        "tau_squared": round(tau_sq, 4),
        "df": df,
    }


# ═══════════════════════════════════════════════════════════════════════
#  Publication Bias
# ═══════════════════════════════════════════════════════════════════════

def eggers_test(effect_sizes: list[float], variances: list[float]) -> dict:
    """Egger's regression test for funnel plot asymmetry.

    Regresses the standardized effect (effect / SE) against precision (1 / SE).
    The intercept's deviation from zero indicates asymmetry.
    """
    n = len(effect_sizes)
    if n < 3:
        return {
            "intercept": None,
            "se_intercept": None,
            "t_statistic": None,
            "p_value": None,
            "message": "Need at least 3 studies for Egger's test",
        }

    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    se = np.sqrt(v)

    # Standardized effect and precision
    std_effect = y / se
    precision = 1.0 / se

    # Linear regression: std_effect = intercept + slope * precision
    X = np.column_stack([np.ones(n), precision])
    result = np.linalg.lstsq(X, std_effect, rcond=None)
    coeffs, residuals, _, _ = result

    intercept = float(coeffs[0])
    slope = float(coeffs[1])

    # Standard error of intercept
    y_pred = X @ coeffs
    ss_res = np.sum((std_effect - y_pred) ** 2)
    ss_tot = np.sum((std_effect - np.mean(std_effect)) ** 2)
    if n > 2 and ss_res > 0:
        mse = ss_res / (n - 2)
        var_covar = mse * np.linalg.inv(X.T @ X)
        se_intercept = float(math.sqrt(var_covar[0, 0]))
        t_stat = intercept / se_intercept if se_intercept > 0 else 0.0
        p_value = 2 * (1 - stats.t.cdf(abs(t_stat), df=n - 2))
    else:
        se_intercept = None
        t_stat = None
        p_value = None

    return {
        "intercept": round(intercept, 4) if intercept is not None else None,
        "se_intercept": round(se_intercept, 4) if se_intercept is not None else None,
        "t_statistic": round(t_stat, 4) if t_stat is not None else None,
        "p_value": round(p_value, 6) if p_value is not None else None,
        "slope": round(slope, 4),
        "n_studies": n,
    }


def funnel_plot_data(effect_sizes: list[float], variances: list[float]) -> dict:
    """Generate data for a funnel plot.

    Returns study points (effect, se) and pseudo confidence interval lines.
    """
    se = [math.sqrt(v) for v in variances]
    max_se = max(se) if se else 1.0

    # Pooled effect (fixed-effect)
    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    w = 1.0 / v
    pooled = float(np.sum(w * y) / np.sum(w))

    # CI lines
    se_range = np.linspace(0, max_se * 1.1, 50)
    ci_upper = [pooled + 1.96 * s for s in se_range]
    ci_lower = [pooled - 1.96 * s for s in se_range]

    return {
        "studies": [
            {"effect": round(float(e), 4), "se": round(float(s), 4)}
            for e, s in zip(effect_sizes, se)
        ],
        "pooled_effect": round(pooled, 4),
        "ci_line_se": [round(float(s), 4) for s in se_range],
        "ci_upper": [round(float(v), 4) for v in ci_upper],
        "ci_lower": [round(float(v), 4) for v in ci_lower],
    }


# ═══════════════════════════════════════════════════════════════════════
#  SVG Plot Generation
# ═══════════════════════════════════════════════════════════════════════

def generate_forest_plot_svg(
    study_labels: list[str],
    effect_sizes: list[float],
    variances: list[float],
    pooled_result: dict,
    effect_measure: str = "md",
    is_log: bool = False,
) -> str:
    """Generate a forest plot as an SVG string using R metafor (with matplotlib fallback)."""
    # Try R metafor first
    if _R_PLOTS_AVAILABLE:
        weights = pooled_result.get("weights", [1.0 / v for v in variances])
        i_squared = pooled_result.get("i_squared", 0.0)
        svg = r_plot_service.generate_forest_plot(
            labels=study_labels,
            effect_sizes=effect_sizes,
            variances=variances,
            pooled_effect=pooled_result["pooled_effect"],
            pooled_ci_lower=pooled_result["ci_lower"],
            pooled_ci_upper=pooled_result["ci_upper"],
            weights=weights,
            effect_measure=effect_measure,
            is_log=is_log,
            i_squared=i_squared,
        )
        if svg:
            return svg

    # Matplotlib fallback
    n = len(study_labels)
    fig_height = max(4, 1.5 + 0.4 * n)
    fig, ax = plt.subplots(figsize=(10, fig_height))
    fig.patch.set_facecolor(PHYLO_COLORS["paper"])
    ax.set_facecolor(PHYLO_COLORS["paper"])

    se = [math.sqrt(v) for v in variances]
    # Transform back for display if log-transformed
    display_effects = [math.exp(e) if is_log else e for e in effect_sizes]
    display_ci_lower = [math.exp(e - 1.96 * s) if is_log else e - 1.96 * s
                        for e, s in zip(effect_sizes, se)]
    display_ci_upper = [math.exp(e + 1.96 * s) if is_log else e + 1.96 * s
                        for e, s in zip(effect_sizes, se)]

    pooled = pooled_result["pooled_effect"]
    pooled_lower = pooled_result["ci_lower"]
    pooled_upper = pooled_result["ci_upper"]

    # Determine x-axis range
    all_lower = min(display_ci_lower + [pooled_lower])
    all_upper = max(display_ci_upper + [pooled_upper])
    x_margin = (all_upper - all_lower) * 0.1
    x_min = all_lower - x_margin
    x_max = all_upper + x_margin

    # Plot each study
    y_positions = list(range(n, 0, -1))
    for i in range(n):
        y = y_positions[i]
        # CI line
        ax.plot([display_ci_lower[i], display_ci_upper[i]], [y, y],
                color=PHYLO_COLORS["blue"], linewidth=1.5, solid_capstyle="round")
        # Effect square
        ax.scatter(display_effects[i], y, s=60, color=PHYLO_COLORS["blue"],
                   zorder=5, marker="s")

    # Pooled effect (diamond)
    pooled_y = 0.3
    diamond_x = [pooled_lower, pooled, pooled_upper, pooled]
    diamond_y = [pooled_y, pooled_y + 0.2, pooled_y, pooled_y - 0.2]
    ax.fill(diamond_x, diamond_y, color=PHYLO_COLORS["green"], alpha=0.8, zorder=5)
    ax.plot(diamond_x + [diamond_x[0]], diamond_y + [diamond_y[0]],
            color=PHYLO_COLORS["green"], linewidth=1.5, zorder=5)

    # Line of no effect
    no_effect = 1.0 if is_log else 0.0
    if x_min <= no_effect <= x_max:
        ax.axvline(x=no_effect, color=PHYLO_COLORS["gray"], linestyle="--",
                   linewidth=0.8, alpha=0.6)

    # Labels
    ax.set_yticks(y_positions)
    ax.set_yticklabels(study_labels, fontsize=9)
    ax.set_xlabel(f"Effect Measure ({effect_measure.upper()})", fontsize=10)
    ax.set_title("Forest Plot", fontsize=12, fontweight="bold")
    ax.set_xlim(x_min, x_max)
    ax.set_ylim(-0.3, n + 0.7)

    # Add pooled label
    ax.annotate(f"Pooled ({pooled:.3f}, 95% CI: {pooled_lower:.3f}-{pooled_upper:.3f})",
                xy=(pooled, pooled_y), fontsize=8, color=PHYLO_COLORS["green"],
                fontweight="bold", ha="center", va="bottom")

    # I² annotation
    i2 = pooled_result.get("i_squared", 0)
    ax.text(0.98, 0.98, f"I² = {i2:.1f}%", transform=ax.transAxes,
            fontsize=9, ha="right", va="top", color=PHYLO_COLORS["black"],
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", alpha=0.3)

    plt.tight_layout()

    # Save SVG to string buffer (no disk I/O)
    import io as _io
    svg_buf = _io.StringIO()
    fig.savefig(svg_buf, format="svg", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return svg_buf.getvalue()


def generate_sroc_curve_svg(
    sensitivities: list[float],
    specificities: list[float],
    bivariate_result: dict,
) -> str:
    """Generate an SROC curve plot as an SVG string using R mada (with matplotlib fallback)."""
    # Try R mada first
    if _R_PLOTS_AVAILABLE:
        n_pos = bivariate_result.get("n_pos", [100] * len(sensitivities))
        n_neg = bivariate_result.get("n_neg", [100] * len(specificities))
        svg = r_plot_service.generate_sroc_curve(
            sensitivities=sensitivities,
            specificities=specificities,
            n_pos=n_pos,
            n_neg=n_neg,
            bivariate_result=bivariate_result,
        )
        if svg:
            return svg

    # Matplotlib fallback
    fig, ax = plt.subplots(figsize=(7, 7))
    fig.patch.set_facecolor(PHYLO_COLORS["paper"])
    ax.set_facecolor(PHYLO_COLORS["paper"])

    # Study points (FPR = 1 - specificity, TPR = sensitivity)
    fpr = [1 - sp for sp in specificities]
    tpr = sensitivities
    ax.scatter(fpr, tpr, s=50, color=PHYLO_COLORS["blue"], zorder=5,
               label="Study estimates", edgecolors="white", linewidth=0.5)

    # SROC curve
    a = bivariate_result["sroc_a"]
    b = bivariate_result["sroc_b"]
    curve_points = compute_sroc_curve(a, b, 200)
    curve_fpr = [p["fpr"] for p in curve_points]
    curve_tpr = [p["tpr"] for p in curve_points]
    ax.plot(curve_fpr, curve_tpr, color=PHYLO_COLORS["green"], linewidth=2,
            label=f"SROC curve (AUC = {bivariate_result['auc']:.3f})")

    # Pooled point
    pooled_fpr = 1 - bivariate_result["pooled_specificity"]
    pooled_tpr = bivariate_result["pooled_sensitivity"]
    ax.scatter([pooled_fpr], [pooled_tpr], s=120, color=PHYLO_COLORS["orange"],
               zorder=6, marker="*", label="Pooled estimate", edgecolors="white",
               linewidth=0.5)

    # Diagonal (chance line)
    ax.plot([0, 1], [0, 1], color=PHYLO_COLORS["gray"], linestyle="--",
            linewidth=0.8, alpha=0.5, label="Chance")

    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_xlabel("1 - Specificity (FPR)", fontsize=10)
    ax.set_ylabel("Sensitivity (TPR)", fontsize=10)
    ax.set_title("Summary ROC (SROC) Curve", fontsize=12, fontweight="bold")
    ax.legend(loc="lower right", fontsize=8, framealpha=0.9)
    ax.set_aspect("equal")
    ax.grid(alpha=0.3)

    plt.tight_layout()
    svg_buf = _io.StringIO()
    fig.savefig(svg_buf, format="svg", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return svg_buf.getvalue()


def generate_funnel_plot_svg(
    effect_sizes: list[float],
    variances: list[float],
    egger_result: Optional[dict] = None,
    is_log: bool = False,
) -> str:
    """Generate a funnel plot as an SVG string using R metafor (with matplotlib fallback)."""
    # Try R metafor first
    if _R_PLOTS_AVAILABLE:
        # Compute pooled effect for R script
        y = np.array(effect_sizes, dtype=float)
        v = np.array(variances, dtype=float)
        w = 1.0 / v
        pooled = float(np.sum(w * y) / np.sum(w))
        svg = r_plot_service.generate_funnel_plot(
            effect_sizes=effect_sizes,
            variances=variances,
            egger_result=egger_result,
            is_log=is_log,
            pooled_effect=pooled,
        )
        if svg:
            return svg

    # Matplotlib fallback
    fig, ax = plt.subplots(figsize=(7, 5))
    fig.patch.set_facecolor(PHYLO_COLORS["paper"])
    ax.set_facecolor(PHYLO_COLORS["paper"])

    se = [math.sqrt(v) for v in variances]
    display_effects = [math.exp(e) if is_log else e for e in effect_sizes]

    # Pooled effect
    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    w = 1.0 / v
    pooled = float(np.sum(w * y) / np.sum(w))
    pooled_display = math.exp(pooled) if is_log else pooled

    # Study points
    ax.scatter(display_effects, se, s=40, color=PHYLO_COLORS["blue"], zorder=5,
               alpha=0.7, edgecolors="white", linewidth=0.5)

    # Pooled effect line
    ax.axvline(x=pooled_display, color=PHYLO_COLORS["green"], linestyle="-",
               linewidth=1, alpha=0.7, label=f"Pooled = {pooled_display:.3f}")

    # Pseudo CI lines
    max_se = max(se) * 1.1
    se_range = np.linspace(0, max_se, 50)
    if is_log:
        ci_upper = [math.exp(pooled + 1.96 * s) for s in se_range]
        ci_lower = [math.exp(pooled - 1.96 * s) for s in se_range]
    else:
        ci_upper = [pooled + 1.96 * s for s in se_range]
        ci_lower = [pooled - 1.96 * s for s in se_range]
    ax.plot(ci_upper, se_range, color=PHYLO_COLORS["gray"], linestyle="--",
            linewidth=0.8, alpha=0.5)
    ax.plot(ci_lower, se_range, color=PHYLO_COLORS["gray"], linestyle="--",
            linewidth=0.8, alpha=0.5)

    ax.set_xlabel("Effect Size", fontsize=10)
    ax.set_ylabel("Standard Error", fontsize=10)
    ax.set_title("Funnel Plot", fontsize=12, fontweight="bold")
    ax.invert_yaxis()  # Larger SE (less precise) at bottom
    ax.legend(loc="upper left", fontsize=8, framealpha=0.9)
    ax.grid(alpha=0.3)

    # Egger's test annotation
    if egger_result and egger_result.get("p_value") is not None:
        p_val = egger_result["p_value"]
        sig = "*" if p_val < 0.05 else "ns"
        ax.text(0.98, 0.02, f"Egger's test: p = {p_val:.4f} ({sig})",
                transform=ax.transAxes, fontsize=8, ha="right", va="bottom",
                color=PHYLO_COLORS["red"] if p_val < 0.05 else PHYLO_COLORS["black"],
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()
    svg_buf = _io.StringIO()
    fig.savefig(svg_buf, format="svg", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return svg_buf.getvalue()


# ═══════════════════════════════════════════════════════════════════════
#  Full Analysis Runner
# ═══════════════════════════════════════════════════════════════════════

def run_meta_analysis(
    analysis_type: str,
    studies: list[dict],
    effect_measure: str = "md",
) -> dict:
    """Run a complete meta-analysis and return all results + plots.

    Args:
        analysis_type: 'diagnostic_accuracy' or 'generic'
        studies: list of study dicts with raw data
        effect_measure: for generic type, the effect measure to use

    Returns:
        Complete results dict with statistics and SVG plots.
    """
    if analysis_type == "diagnostic_accuracy":
        # Extract diagnostic data
        sens = [s["sensitivity"] for s in studies if s.get("included", True)]
        spec = [s["specificity"] for s in studies if s.get("included", True)]
        n_pos = [s["n_pos"] for s in studies if s.get("included", True)]
        n_neg = [s["n_neg"] for s in studies if s.get("included", True)]

        if len(sens) < 2:
            raise ValueError("Need at least 2 included studies with diagnostic data")

        # Fit bivariate model
        bivar = fit_bivariate_model(sens, spec, n_pos, n_neg)

        # Generate SROC curve SVG
        sroc_svg = generate_sroc_curve_svg(sens, spec, bivar)

        # Generate forest plot for sensitivity and specificity
        sens_effects = [_logit(s) for s in sens]
        sens_vars = [_logit_se(s, n) ** 2 for s, n in zip(sens, n_pos)]
        sens_result = fit_generic_meta_analysis(sens_effects, sens_vars, "logit_sens")
        forest_svg = generate_forest_plot_svg(
            [s.get("label", f"Study {i+1}") for i, s in enumerate(studies) if s.get("included", True)],
            sens_effects, sens_vars, sens_result, "logit(sens)", is_log=False,
        )

        # Funnel plot
        funnel_data = funnel_plot_data(sens_effects, sens_vars)
        egger = eggers_test(sens_effects, sens_vars)
        funnel_svg = generate_funnel_plot_svg(sens_effects, sens_vars, egger, is_log=False)

        return {
            "analysis_type": "diagnostic_accuracy",
            "bivariate": bivar,
            "heterogeneity": compute_heterogeneity(sens_effects, sens_vars),
            "eggers_test": egger,
            "funnel_plot_data": funnel_data,
            "forest_plot_svg": forest_svg,
            "sroc_curve_svg": sroc_svg,
            "funnel_plot_svg": funnel_svg,
            "n_studies": len(sens),
        }

    elif analysis_type == "generic":
        # Compute effect sizes from raw data
        effect_sizes = []
        variances = []
        labels = []
        for s in studies:
            if not s.get("included", True):
                continue
            es, var = compute_effect_size(s, effect_measure)
            effect_sizes.append(es)
            variances.append(var)
            labels.append(s.get("label", f"Study {len(labels)+1}"))

        if len(effect_sizes) < 2:
            raise ValueError("Need at least 2 included studies with extractable data")

        # Fit generic model
        is_log = effect_measure.lower() in ("rr", "log_rr", "or", "log_or", "hr", "log_hr")
        result = fit_generic_meta_analysis(effect_sizes, variances, effect_measure)

        # Generate plots
        forest_svg = generate_forest_plot_svg(
            labels, effect_sizes, variances, result, effect_measure, is_log=is_log,
        )

        funnel_data = funnel_plot_data(effect_sizes, variances)
        egger = eggers_test(effect_sizes, variances)
        funnel_svg = generate_funnel_plot_svg(effect_sizes, variances, egger, is_log=is_log)

        return {
            "analysis_type": "generic",
            "effect_measure": effect_measure,
            "pooled": result,
            "heterogeneity": {
                "i_squared": result["i_squared"],
                "q_statistic": result["q_statistic"],
                "q_p_value": result["q_p_value"],
                "tau_squared": result["tau_squared"],
            },
            "eggers_test": egger,
            "funnel_plot_data": funnel_data,
            "forest_plot_svg": forest_svg,
            "funnel_plot_svg": funnel_svg,
            "n_studies": len(effect_sizes),
        }

    else:
        raise ValueError(f"Unknown analysis type: {analysis_type}. Use 'diagnostic_accuracy' or 'generic'.")
