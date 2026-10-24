"""R plot service: call R scripts via subprocess to generate professional SVG plots.

Uses R packages (metafor, mada, grid) to produce standard R-library-themed plots:
  - Forest plots (metafor)
  - SROC curves (mada)
  - Funnel plots (metafor)
  - PRISMA 2020 flow diagrams (grid graphics)

Falls back to matplotlib if R is unavailable or script fails.
"""
from __future__ import annotations
import json
import logging
import os
import shutil
import subprocess
import tempfile
import hashlib
from typing import Optional

logger = logging.getLogger(__name__)

_CONDA_RSCRIPT = "/opt/conda/bin/Rscript"


def _windows_rscript() -> Optional[str]:
    """Newest Rscript.exe when R is installed but not on PATH."""
    if os.name != "nt":
        return None
    roots = [
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "R"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "R"),
        os.path.join(os.path.expanduser("~"), "R"),
    ]
    candidates = []
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            if "Rscript.exe" in filenames and os.path.basename(dirpath).lower() == "bin":
                candidates.append(os.path.join(dirpath, "Rscript.exe"))
    return sorted(candidates, reverse=True)[0] if candidates else None


def _resolve_rscript() -> str:
    """RADEXTRACT_RSCRIPT, conda, PATH, then a Windows Program Files install."""
    env_path = os.environ.get("RADEXTRACT_RSCRIPT")
    if env_path and os.path.isfile(env_path):
        return env_path
    hpc_conda_r = "/cm/shared/anaconda/envs/qiime2-amplicon-2026.1/bin/Rscript"
    if os.path.isfile(hpc_conda_r):
        return hpc_conda_r
    if os.path.isfile(_CONDA_RSCRIPT):
        return _CONDA_RSCRIPT
    found = shutil.which("Rscript")
    if found:
        return found
    return _windows_rscript() or _CONDA_RSCRIPT


RSCRIPT_PATH = _resolve_rscript()
R_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "r_scripts")


def _is_r_available() -> bool:
    """Check if Rscript is available. Resolved on each call so a new install is picked up."""
    path = _resolve_rscript()
    return os.path.isfile(path) and os.access(path, os.X_OK)


def _cache_key(data: dict) -> str:
    """Generate a cache key from data content."""
    data_str = json.dumps(data, sort_keys=True)
    return hashlib.md5(data_str.encode()).hexdigest()


def call_r_script(script_name: str, data: dict) -> Optional[str]:
    """Call an R script with JSON data and return SVG output.

    Args:
        script_name: name of the R script file (e.g., "forest_plot.R")
        data: dict to pass as JSON to the R script

    Returns:
        SVG string if successful, None if R fails
    """
    if not _is_r_available():
        return None

    script_path = os.path.abspath(os.path.join(R_SCRIPTS_DIR, script_name))
    r_scripts_dir = os.path.abspath(R_SCRIPTS_DIR)
    try:
        if os.path.commonpath([r_scripts_dir, script_path]) != r_scripts_dir:
            return None
    except ValueError:
        return None

    if not os.path.exists(script_path):
        return None

    # Write data to temp JSON file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        input_path = f.name

    # Output SVG path
    output_path = input_path.replace(".json", ".svg")
    data["output_path"] = output_path

    # Re-write with output_path included
    with open(input_path, "w") as f:
        json.dump(data, f)

    try:
        result = subprocess.run(
            [_resolve_rscript(), script_path, input_path],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Some R scripts (e.g., mada SROC) emit warnings that cause
        # non-zero exit but still produce valid SVG. Check for output file
        # regardless of exit code.
        if os.path.exists(output_path):
            with open(output_path, "r") as f:
                svg = f.read()
            if svg and svg.strip():
                return svg

        return None

    except (subprocess.TimeoutExpired, Exception):
        return None

    finally:
        # Clean up temp files
        for path in [input_path, output_path]:
            try:
                os.remove(path)
            except OSError:
                pass


def call_r_script_bytes(script_name: str, data: dict, ext: str = ".png") -> Optional[bytes]:
    """Call an R script with JSON data and return binary file output (e.g. PNG).

    Same contract as call_r_script but reads the output file as bytes.
    The R script selects its output device from the output_path extension.
    """
    if not _is_r_available():
        return None

    script_path = os.path.abspath(os.path.join(R_SCRIPTS_DIR, script_name))
    r_scripts_dir = os.path.abspath(R_SCRIPTS_DIR)
    try:
        if os.path.commonpath([r_scripts_dir, script_path]) != r_scripts_dir:
            return None
    except ValueError:
        return None

    if not os.path.exists(script_path):
        return None

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        input_path = f.name

    output_path = input_path.replace(".json", ext)
    data["output_path"] = output_path

    with open(input_path, "w") as f:
        json.dump(data, f)

    try:
        subprocess.run(
            [_resolve_rscript(), script_path, input_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if os.path.exists(output_path):
            with open(output_path, "rb") as f:
                blob = f.read()
            if blob:
                return blob
        return None
    except Exception:
        return None
    finally:
        for path in [input_path, output_path]:
            try:
                os.remove(path)
            except OSError:
                pass


def generate_forest_plot(
    labels: list[str],
    effect_sizes: list[float],
    variances: list[float],
    pooled_effect: float,
    pooled_ci_lower: float,
    pooled_ci_upper: float,
    weights: list[float],
    effect_measure: str = "md",
    is_log: bool = False,
    i_squared: float = 0.0,
) -> str:
    """Generate a forest plot SVG using R metafor.

    Falls back to matplotlib if R is unavailable.
    """
    data = {
        "labels": labels,
        "effect_sizes": effect_sizes,
        "variances": variances,
        "pooled_effect": pooled_effect,
        "pooled_ci_lower": pooled_ci_lower,
        "pooled_ci_upper": pooled_ci_upper,
        "weights": weights,
        "effect_measure": effect_measure,
        "is_log": is_log,
        "i_squared": i_squared,
    }

    svg = call_r_script("forest_plot.R", data)
    if svg:
        return svg

    # Fallback to matplotlib
    return _matplotlib_forest_fallback(
        labels, effect_sizes, variances, pooled_effect,
        pooled_ci_lower, pooled_ci_upper, effect_measure, is_log, i_squared,
        weights=weights,
    )


def generate_sroc_curve(
    sensitivities: list[float],
    specificities: list[float],
    n_pos: list[int],
    n_neg: list[int],
    bivariate_result: dict,
) -> str:
    """Generate an SROC curve SVG using R mada.

    Falls back to matplotlib if R is unavailable.
    """
    data = {
        "sensitivities": sensitivities,
        "specificities": specificities,
        "n_pos": n_pos,
        "n_neg": n_neg,
        "pooled_sensitivity": bivariate_result.get("pooled_sensitivity", 0),
        "pooled_specificity": bivariate_result.get("pooled_specificity", 0),
        "sroc_a": bivariate_result.get("sroc_a", 0),
        "sroc_b": bivariate_result.get("sroc_b", 0),
        "auc": bivariate_result.get("auc", 0),
    }

    svg = call_r_script("sroc_curve.R", data)
    if svg:
        return svg

    # Fallback to matplotlib
    return _matplotlib_sroc_fallback(sensitivities, specificities, bivariate_result)


def generate_funnel_plot(
    effect_sizes: list[float],
    variances: list[float],
    egger_result: Optional[dict] = None,
    is_log: bool = False,
    pooled_effect: float = 0.0,
) -> str:
    """Generate a funnel plot SVG using R metafor.

    Falls back to matplotlib if R is unavailable.
    """
    data = {
        "effect_sizes": effect_sizes,
        "variances": variances,
        "egger_intercept": egger_result.get("intercept") if egger_result else None,
        "egger_p_value": egger_result.get("p_value") if egger_result else None,
        "is_log": is_log,
        "pooled_effect": pooled_effect,
    }

    svg = call_r_script("funnel_plot.R", data)
    if svg:
        return svg

    # Fallback to matplotlib
    return _matplotlib_funnel_fallback(effect_sizes, variances, egger_result, is_log)


def generate_prisma_flow(flow_data: dict) -> str:
    """Generate a PRISMA 2020 flow diagram SVG.

    Primary: R grid graphics (if R is available).
    Fallback 1: High-fidelity Python PRISMA 2020 SVG engine (services.prisma_service).
    Fallback 2: Python chart_engine matplotlib generator.
    """
    svg = call_r_script("prisma_flow.R", flow_data)
    if svg:
        return svg

    # Fallback 1: Native PRISMA 2020 SVG engine
    try:
        from services.prisma_service import generate_prisma_2020_svg
        svg2020 = generate_prisma_2020_svg(flow_data)
        if svg2020 and svg2020.strip():
            return svg2020
    except Exception as e:
        logger.debug(f"Native PRISMA SVG generation failed: {e}")

    # Fallback 2: chart_engine
    try:
        from services.chart_engine import generate_prisma_flow as ce_prisma
        ident = {
            "records_identified": flow_data.get("identification", {}).get("records_total", flow_data.get("identification", {}).get("records_database", 0)),
            "records_duplicates_removed": flow_data.get("screening", {}).get("duplicates", 0),
        }
        screen = {
            "records_screened": flow_data.get("screening", {}).get("screened", 0),
            "records_excluded": flow_data.get("screening", {}).get("excluded", 0),
        }
        elig = {
            "full_text_assessed": flow_data.get("screening", {}).get("assessed", 0),
            "full_text_excluded": flow_data.get("screening", {}).get("excluded_eligibility", 0),
        }
        incl = flow_data.get("included", {}).get("total_studies", 0)
        res = ce_prisma(ident, screen, elig, incl)
        return res.get("svg", "")
    except Exception:
        return ""




# ── Matplotlib fallbacks ──

def _matplotlib_forest_fallback(labels, effect_sizes, variances, pooled,
                                 pooled_lower, pooled_upper, effect_measure,
                                 is_log, i_squared, weights=None):
    """Matplotlib fallback for forest plot formatted to exact R metafor publication standard."""
    import math
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans", "sans-serif"]
    plt.rcParams["svg.fonttype"] = "none"

    sei = [math.sqrt(max(1e-6, v)) for v in variances]
    n = len(labels)

    if weights is None or len(weights) != n:
        inv_vars = [1.0 / max(1e-6, v) for v in variances]
        tot = sum(inv_vars) or 1.0
        w_pct = [iv / tot * 100.0 for iv in inv_vars]
    else:
        tot = sum(weights) or 1.0
        w_pct = [w / tot * 100.0 for w in weights]

    if is_log:
        display = [math.exp(e) for e in effect_sizes]
        disp_pooled = math.exp(pooled)
        disp_lower = [math.exp(e - 1.96 * s) for e, s in zip(effect_sizes, sei)]
        disp_upper = [math.exp(e + 1.96 * s) for e, s in zip(effect_sizes, sei)]
        disp_pooled_lower = math.exp(pooled_lower)
        disp_pooled_upper = math.exp(pooled_upper)
        null_val = 1.0
    else:
        display = effect_sizes
        disp_pooled = pooled
        disp_lower = [e - 1.96 * s for e, s in zip(effect_sizes, sei)]
        disp_upper = [e + 1.96 * s for e, s in zip(effect_sizes, sei)]
        disp_pooled_lower = pooled_lower
        disp_pooled_upper = pooled_upper
        null_val = 0.0

    fig_height = max(5.0, 1.8 + n * 0.5)
    fig, ax = plt.subplots(figsize=(10.5, fig_height))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    y_pos = list(range(n, 0, -1))

    # Calculate x range
    min_x = min(disp_lower + [disp_pooled_lower])
    max_x = max(disp_upper + [disp_pooled_upper])
    x_span = max(1.0, max_x - min_x)
    x_axis_min = max(0.01, min_x - x_span * 0.25) if is_log else min_x - x_span * 0.25
    x_axis_max = max_x + x_span * 0.75

    # Null effect dashed line
    ax.axvline(x=null_val, color="#718096", linestyle="--", linewidth=1.2, alpha=0.8)

    # Vertical dotted guide through pooled effect
    ax.axvline(x=disp_pooled, color="#4A5568", linestyle=":", linewidth=1.0, alpha=0.7)

    # Study rows
    for i in range(n):
        y = y_pos[i]
        # Whisker CI line
        ax.plot([disp_lower[i], disp_upper[i]], [y, y], color="#1A202C", linewidth=1.6, solid_capstyle="round")
        # Tick caps at CI ends
        cap_h = 0.12
        ax.plot([disp_lower[i], disp_lower[i]], [y - cap_h, y + cap_h], color="#1A202C", linewidth=1.2)
        ax.plot([disp_upper[i], disp_upper[i]], [y - cap_h, y + cap_h], color="#1A202C", linewidth=1.2)

        # Center point estimate marker sized by inverse-variance weight
        box_size = max(5, min(14, math.sqrt(max(0.1, w_pct[i])) * 2.8))
        ax.plot(display[i], y, marker="s", markersize=box_size,
                color="#2B6CB0", markeredgecolor="#1A202C", markeredgewidth=1.0)

        # Right annotations (Effect [95% CI] and Weight %)
        annot_effect = f"{display[i]:.2f} [{disp_lower[i]:.2f}, {disp_upper[i]:.2f}]"
        annot_w = f"{w_pct[i]:.1f}%"
        annot_x_eff = max_x + x_span * 0.12
        annot_x_w = max_x + x_span * 0.55
        ax.text(annot_x_eff, y, annot_effect, fontsize=8.5, fontfamily="monospace", va="center")
        ax.text(annot_x_w, y, annot_w, fontsize=8.5, fontfamily="monospace", va="center")

    # Column Headers
    header_y = n + 0.8
    ax.text(max_x + x_span * 0.12, header_y, "Effect [95% CI]", fontsize=9, fontweight="bold", va="center")
    ax.text(max_x + x_span * 0.55, header_y, "Weight", fontsize=9, fontweight="bold", va="center")
    ax.plot([x_axis_min, x_axis_max], [header_y - 0.4, header_y - 0.4], color="#CBD5E0", linewidth=0.8)

    # Pooled Diamond (Polygon)
    y_overall = 0.1
    diamond_h = 0.35
    diamond_pts = [
        [disp_pooled_lower, y_overall],
        [disp_pooled, y_overall + diamond_h],
        [disp_pooled_upper, y_overall],
        [disp_pooled, y_overall - diamond_h],
    ]
    diamond = patches.Polygon(diamond_pts, closed=True, facecolor="#75A025",
                              edgecolor="#2D3748", linewidth=1.5, zorder=5)
    ax.add_patch(diamond)

    # Summary Row text
    ax.text(max_x + x_span * 0.12, y_overall,
            f"{disp_pooled:.2f} [{disp_pooled_lower:.2f}, {disp_pooled_upper:.2f}]",
            fontsize=9, fontweight="bold", fontfamily="monospace", va="center", color="#2D3748")
    ax.text(max_x + x_span * 0.55, y_overall, "100.0%",
            fontsize=9, fontweight="bold", fontfamily="monospace", va="center", color="#2D3748")

    all_y = y_pos + [y_overall]
    all_labels = labels + ["Overall (RE Model)"]
    ax.set_yticks(all_y)
    ax.set_yticklabels(all_labels, fontsize=9, fontweight="medium")

    if is_log and null_val > 0:
        ax.set_xscale("log")

    ax.set_xlim(x_axis_min, x_axis_max)
    ax.set_xlabel(f"Effect Measure: {effect_measure.upper() if effect_measure else 'Odds Ratio'}", fontsize=10, fontweight="bold")
    ax.set_title("Meta-Analysis Forest Plot (R metafor DL Model)", fontsize=12, fontweight="bold", pad=12)

    # Footer heterogeneity
    fig.text(0.12, 0.02,
             f"Heterogeneity: I\u00b2 = {i_squared:.1f}% | Method: DerSimonian-Laird Random-Effects (metafor)",
             fontsize=8.5, style="italic", color="#4A5568")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    import io
    buf = io.StringIO()
    plt.tight_layout()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _matplotlib_sroc_fallback(sensitivities, specificities, bivariate_result):
    """Matplotlib fallback for SROC curve using R mada styling."""
    import io
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans", "sans-serif"]
    plt.rcParams["svg.fonttype"] = "none"

    fig, ax = plt.subplots(figsize=(7, 7))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    fpr = [1 - sp for sp in specificities]
    tpr = sensitivities

    ax.scatter(fpr, tpr, s=50, color="#0279EE", zorder=5, edgecolors="white", linewidth=0.5)

    # SROC curve
    a = bivariate_result.get("sroc_a", 0)
    b = bivariate_result.get("sroc_b", 0)
    fpr_range = np.linspace(0.01, 0.99, 200)
    tpr_range = [1.0 / (1.0 + np.exp(-(a + b * np.log(f / (1 - f))))) for f in fpr_range]
    ax.plot(fpr_range, tpr_range, color="#75A025", linewidth=2,
            label=f"SROC (AUC = {bivariate_result.get('auc', 0):.3f})")

    # Pooled point
    pooled_fpr = 1 - bivariate_result.get("pooled_specificity", 0)
    pooled_tpr = bivariate_result.get("pooled_sensitivity", 0)
    ax.scatter([pooled_fpr], [pooled_tpr], s=120, color="#FF9400", marker="*", zorder=6)

    ax.plot([0, 1], [0, 1], color="#999999", linestyle="--", linewidth=0.8, alpha=0.5)
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_xlabel("1 - Specificity (FPR)", fontsize=10)
    ax.set_ylabel("Sensitivity (TPR)", fontsize=10)
    ax.set_title("Summary ROC (SROC) Curve — R mada", fontsize=12, fontweight="bold")
    ax.legend(loc="lower right", fontsize=8)
    ax.set_aspect("equal")
    ax.grid(alpha=0.3)

    buf = io.StringIO()
    plt.tight_layout()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _matplotlib_funnel_fallback(effect_sizes, variances, egger_result, is_log):
    """Matplotlib fallback for funnel plot formatted to R metafor standard."""
    import io
    import math
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans", "sans-serif"]
    plt.rcParams["svg.fonttype"] = "none"

    fig, ax = plt.subplots(figsize=(8, 6))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    se = [math.sqrt(max(1e-6, v)) for v in variances]
    display = [math.exp(e) if is_log else e for e in effect_sizes]

    y = np.array(effect_sizes, dtype=float)
    v = np.array(variances, dtype=float)
    w = 1.0 / np.maximum(1e-6, v)
    pooled = float(np.sum(w * y) / np.sum(w))
    pooled_display = math.exp(pooled) if is_log else pooled

    max_se = max(se) * 1.25 if se else 0.4
    se_apex = 0.0

    # 95% CI pseudo funnel triangle vertices
    if is_log:
        funnel_left_95 = math.exp(pooled - 1.96 * max_se)
        funnel_right_95 = math.exp(pooled + 1.96 * max_se)
        funnel_left_99 = math.exp(pooled - 2.576 * max_se)
        funnel_right_99 = math.exp(pooled + 2.576 * max_se)
    else:
        funnel_left_95 = pooled - 1.96 * max_se
        funnel_right_95 = pooled + 1.96 * max_se
        funnel_left_99 = pooled - 2.576 * max_se
        funnel_right_99 = pooled + 2.576 * max_se

    # Shaded pseudo 95% CI triangle (metafor standard shade)
    funnel_pts = [
        [pooled_display, se_apex],
        [funnel_left_95, max_se],
        [funnel_right_95, max_se],
    ]
    funnel_patch = patches.Polygon(funnel_pts, closed=True, facecolor="#ECE9E2",
                                   edgecolor="#A0AEC0", linestyle="--", linewidth=1.2, zorder=1)
    ax.add_patch(funnel_patch)

    # 99% CI limits (outer dashed)
    ax.plot([pooled_display, funnel_left_99], [se_apex, max_se], color="#CBD5E0", linestyle=":", linewidth=1.0)
    ax.plot([pooled_display, funnel_right_99], [se_apex, max_se], color="#CBD5E0", linestyle=":", linewidth=1.0)

    # Pooled vertical center line
    ax.axvline(x=pooled_display, color="#75A025", linewidth=1.5, zorder=2, label="Pooled Estimate")

    # Plot individual studies (R metafor signature style: blue dots with white border)
    ax.scatter(display, se, s=55, color="#0279EE", edgecolors="white", linewidth=1.2, zorder=5)

    ax.set_xlabel("Effect Size (log scale)" if is_log else "Effect Size", fontsize=10, fontweight="bold")
    ax.set_ylabel("Standard Error", fontsize=10, fontweight="bold")
    ax.set_title("Publication Bias Assessment (Funnel Plot — metafor)", fontsize=12, fontweight="bold", pad=12)
    ax.set_ylim(max_se * 1.05, 0.0)  # Inverted Y-axis
    ax.grid(alpha=0.25, linestyle="--")

    if egger_result and egger_result.get("p_value") is not None:
        p_val = egger_result["p_value"]
        sig = "significant asymmetry" if p_val < 0.05 else "no significant asymmetry"
        ax.text(0.97, 0.05, f"Egger's test: p = {p_val:.3f} ({sig})",
                transform=ax.transAxes, fontsize=8.5, ha="right", va="bottom",
                bbox=dict(boxstyle="round,pad=0.4", facecolor="#F7FAFC", edgecolor="#CBD5E0"))

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    buf = io.StringIO()
    plt.tight_layout()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()

