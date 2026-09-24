"""
Scientific Chart Generation Engine for RadExtract.
Produces publication-ready, accessible, high-DPI figures:
  - Forest plots (meta-analysis)
  - Funnel plots (publication bias)
  - SROC curves (diagnostic test accuracy)
  - RoB traffic light (Cochrane Risk of Bias 2.0)
  - PRISMA flow diagrams (systematic review flow)
"""
import io
import base64
import math
from typing import List, Dict, Any, Optional

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.ticker as ticker

from services.plot_config import (
    configure_plots, apply_journal_style, save_figure,
    OKABE_ITO, PHYLO_COLORS, ROB_COLORS, JOURNAL_COLORS,
)

# Ensure publication settings are active
configure_plots()


# ── Forest Plot ──

def generate_forest_plot(
    studies: List[Dict[str, Any]],
    overall_effect: float,
    ci_lower: float,
    ci_upper: float,
    measure: str = "Odds Ratio (OR)",
    is_ratio: bool = True,
    i2: float = 0.0,
    p_heterogeneity: float = 1.0,
    title: str = "Forest Plot Meta-Analysis",
) -> Dict[str, str]:
    """Generate a publication-ready Forest Plot.

    Each study dict: {'name': str, 'effect': float, 'ci_lower': float,
                      'ci_upper': float, 'weight': float}
    """
    n = len(studies)
    if n == 0:
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, "No study data available", ha="center", va="center")
        return save_figure(fig)

    fig_height = max(5.0, 1.5 + n * 0.45)
    fig, ax = plt.subplots(figsize=(10, fig_height))

    y_positions = list(range(n, 0, -1))
    null_val = 1.0 if is_ratio else 0.0

    # Null effect line
    ax.axvline(null_val, color=JOURNAL_COLORS["accent"], linestyle="--",
               linewidth=1.2, alpha=0.85, label="Null Effect")

    # Determine x-axis range for annotation placement
    all_lowers = [float(s.get("ci_lower", 0)) for s in studies]
    all_uppers = [float(s.get("ci_upper", 0)) for s in studies]
    x_min = min(all_lowers + [ci_lower]) * (0.8 if is_ratio else 0.9)
    x_max = max(all_uppers + [ci_upper]) * (1.3 if is_ratio else 1.15)

    # Plot individual studies
    for i, (y, study) in enumerate(zip(y_positions, studies)):
        name = study.get("name", f"Study {i+1}")
        eff = float(study.get("effect", 1.0))
        lower = float(study.get("ci_lower", eff * 0.8))
        upper = float(study.get("ci_upper", eff * 1.2))
        weight = float(study.get("weight", 10.0))

        # Horizontal CI line
        ax.plot([lower, upper], [y, y], color=JOURNAL_COLORS["secondary"],
                linewidth=1.8, solid_capstyle="round")

        # Point estimate marker (sized by weight)
        box_size = max(4, min(14, math.sqrt(max(0.1, weight)) * 2.5))
        ax.plot(eff, y, marker="s", markersize=box_size,
                color=JOURNAL_COLORS["secondary"],
                markeredgecolor=JOURNAL_COLORS["primary"], markeredgewidth=1)

        # Right annotation — placed at fixed x position to prevent overlap
        annot_x = x_max * 0.95 if is_ratio else x_max * 0.92
        annot = f"{eff:.2f} [{lower:.2f}, {upper:.2f}]  ({weight:.1f}%)"
        ax.text(annot_x, y, annot, va="center", ha="left",
                fontsize=8.5, color=JOURNAL_COLORS["neutral_dark"])

    # Overall Summary Diamond
    y_overall = 0
    diamond_h = 0.35
    diamond_pts = [
        [ci_lower, y_overall],
        [overall_effect, y_overall + diamond_h],
        [ci_upper, y_overall],
        [overall_effect, y_overall - diamond_h],
    ]
    diamond = patches.Polygon(diamond_pts, closed=True,
                              facecolor=PHYLO_COLORS["green"],
                              edgecolor="#5A7A1C", linewidth=1.5, zorder=5)
    ax.add_patch(diamond)

    # Y-Ticks Labels
    all_y = y_positions + [0]
    all_labels = [s.get("name", f"Study {i+1}") for i, s in enumerate(studies)] + ["Overall (Pooled)"]
    ax.set_yticks(all_y)
    ax.set_yticklabels(all_labels, fontsize=9.5, fontweight="medium")

    if is_ratio and null_val > 0:
        ax.set_xscale("log")
        ax.xaxis.set_major_formatter(ticker.ScalarFormatter())

    ax.set_xlim(x_min, x_max)
    ax.set_xlabel(f"{measure} (95% Confidence Interval)", fontsize=10,
                  fontweight="bold", labelpad=8)
    apply_journal_style(ax, title)

    # Sub-footer with heterogeneity stats
    het_text = f"Heterogeneity: I\u00b2 = {i2:.1f}%, p = {p_heterogeneity:.3f} | Model: Random-Effects"
    fig.text(0.12, 0.02, het_text, fontsize=8.5, style="italic",
             color=JOURNAL_COLORS["line"])

    plt.tight_layout()
    return save_figure(fig)


# ── Funnel Plot ──

def generate_funnel_plot(
    studies: List[Dict[str, Any]],
    overall_effect: float,
    measure: str = "Log Odds Ratio",
    title: str = "Funnel Plot of Publication Bias",
) -> Dict[str, str]:
    """Generate a Funnel Plot with 95% and 99% confidence limits."""
    n = len(studies)
    if n == 0:
        fig, ax = plt.subplots(figsize=(7, 5))
        ax.text(0.5, 0.5, "No study data available", ha="center", va="center")
        return save_figure(fig)

    fig, ax = plt.subplots(figsize=(8, 6))

    effects = [float(s.get("effect", 1.0)) for s in studies]
    ses = [float(s.get("se", 0.2)) for s in studies]
    max_se = max(ses) * 1.25 if ses else 1.0

    se_range = np.linspace(0, max_se, 100)

    # 95% and 99% Confidence regions
    ci95_lower = overall_effect - 1.96 * se_range
    ci95_upper = overall_effect + 1.96 * se_range
    ci99_lower = overall_effect - 2.58 * se_range
    ci99_upper = overall_effect + 2.58 * se_range

    # Fill confidence regions with Phylo palette
    ax.fill_betweenx(se_range, ci99_lower, ci99_upper,
                     color=PHYLO_COLORS["cream"], alpha=0.6, label="99% CI region")
    ax.fill_betweenx(se_range, ci95_lower, ci95_upper,
                     color=PHYLO_COLORS["yellow"], alpha=0.4, label="95% CI region")

    # Central pooled line
    ax.axvline(overall_effect, color=PHYLO_COLORS["blue"], linestyle="-",
               linewidth=1.5, label=f"Pooled Effect ({overall_effect:.2f})")

    # Scatter studies
    ax.scatter(effects, ses, color=PHYLO_COLORS["orange"], s=45,
               edgecolor=PHYLO_COLORS["black"], linewidth=0.8, zorder=4,
               label="Studies")

    ax.set_ylim(max_se, 0)  # Invert Y-axis
    ax.set_xlabel(measure, fontsize=10, fontweight="bold")
    ax.set_ylabel("Standard Error (SE)", fontsize=10, fontweight="bold")
    ax.legend(loc="upper right", frameon=True, fontsize=8.5)
    apply_journal_style(ax, title)

    plt.tight_layout()
    return save_figure(fig)


# ── SROC Curve (Summary Receiver Operating Characteristic) ──

def generate_sroc_curve(
    studies: List[Dict[str, Any]],
    pooled_sensitivity: float = None,
    pooled_specificity: float = None,
    auc: float = None,
    title: str = "Summary ROC Curve (Diagnostic Test Accuracy)",
) -> Dict[str, str]:
    """Generate an SROC curve for diagnostic test accuracy meta-analysis.

    Each study dict: {'name': str, 'sensitivity': float, 'specificity': float,
                      'tp': int, 'fp': int, 'fn': int, 'tn': int}
    """
    n = len(studies)
    if n == 0:
        fig, ax = plt.subplots(figsize=(7, 7))
        ax.text(0.5, 0.5, "No study data available", ha="center", va="center")
        return save_figure(fig)

    fig, ax = plt.subplots(figsize=(7, 7))

    # Plot individual study points (1 - specificity on x, sensitivity on y)
    for i, study in enumerate(studies):
        sens = float(study.get("sensitivity", 0))
        spec = float(study.get("specificity", 0))
        fpr = 1 - spec  # False positive rate

        # Calculate study size for marker scaling
        tp = int(study.get("tp", 0))
        fp = int(study.get("fp", 0))
        fn = int(study.get("fn", 0))
        tn = int(study.get("tn", 0))
        n_total = tp + fp + fn + tn
        marker_size = max(20, min(200, n_total / 5))

        ax.scatter(fpr, sens, s=marker_size, color=PHYLO_COLORS["blue"],
                   alpha=0.5, edgecolor=PHYLO_COLORS["black"], linewidth=0.8, zorder=4)

    # Diagonal reference line (no discrimination)
    ax.plot([0, 1], [0, 1], linestyle="--", color=JOURNAL_COLORS["line"],
            linewidth=1, alpha=0.7, label="Chance line")

    # SROC curve (symmetric curve through pooled point)
    if pooled_sensitivity is not None and pooled_specificity is not None:
        pooled_fpr = 1 - pooled_specificity
        ax.scatter(pooled_fpr, pooled_sensitivity, s=150, marker="*",
                   color=PHYLO_COLORS["orange"], edgecolor=PHYLO_COLORS["black"],
                   linewidth=1, zorder=5, label=f"Pooled (Sn={pooled_sensitivity:.2f}, Sp={pooled_specificity:.2f})")

        # Draw a smooth SROC curve through the pooled point
        # Using a symmetric curve: for each FPR, compute expected sensitivity
        fpr_range = np.linspace(0.01, 0.99, 100)
        # Logit transformation for symmetric SROC
        logit_sens = np.log(pooled_sensitivity / (1 - pooled_sensitivity))
        logit_fpr = np.log(pooled_fpr / (1 - pooled_fpr))
        # SROC: logit(Sn) = a + b * logit(FPR), symmetric: a = logit(Sn) - logit(FPR), b = 1
        a = logit_sens - logit_fpr
        sroc_logit_sens = a + logit_fpr * np.log(fpr_range / (1 - fpr_range))
        sroc_sens = 1 / (1 + np.exp(-sroc_logit_sens))
        ax.plot(fpr_range, sroc_sens, color=PHYLO_COLORS["green"],
                linewidth=2, alpha=0.8, label="SROC curve")

    # AUC annotation
    if auc is not None:
        ax.text(0.95, 0.05, f"AUC = {auc:.3f}", transform=ax.transAxes,
                fontsize=10, fontweight="bold", ha="right", va="bottom",
                color=JOURNAL_COLORS["primary"],
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))

    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_xlabel("1 \u2212 Specificity (False Positive Rate)", fontsize=10, fontweight="bold")
    ax.set_ylabel("Sensitivity (True Positive Rate)", fontsize=10, fontweight="bold")
    ax.legend(loc="lower right", frameon=True, fontsize=8.5)
    ax.set_aspect("equal")
    apply_journal_style(ax, title)

    plt.tight_layout()
    return save_figure(fig)


# ── RoB Traffic Light ──

def generate_rob_traffic_light(
    rob_data: List[Dict[str, Any]],
    title: str = "Risk of Bias 2.0 Assessment Summary",
) -> Dict[str, str]:
    """Generate Cochrane Risk of Bias Traffic Light matrix chart."""
    if not rob_data:
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.text(0.5, 0.5, "No RoB assessment data", ha="center", va="center")
        return save_figure(fig)

    domains = ["D1: Sequence", "D2: Allocation", "D3: Blinding(P)",
               "D4: Blinding(O)", "D5: Incomplete", "D6: Selective",
               "D7: Other", "Overall"]
    domain_keys = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "Overall"]

    n_studies = len(rob_data)
    fig_height = max(4.0, 1.2 + n_studies * 0.45)
    fig, ax = plt.subplots(figsize=(9, fig_height))

    for row_idx, study in enumerate(rob_data):
        y = n_studies - 1 - row_idx
        for col_idx, key in enumerate(domain_keys):
            judgment = study.get(key, "Unclear")
            if judgment not in ROB_COLORS:
                judgment = ("Some concerns" if "concern" in judgment.lower()
                            or "unclear" in judgment.lower()
                            else ("Low" if "low" in judgment.lower() else "High"))

            c = ROB_COLORS.get(judgment, ROB_COLORS["Some concerns"])
            circle = plt.Circle((col_idx + 0.5, y + 0.5), 0.35,
                                color=c, ec=JOURNAL_COLORS["neutral_dark"], lw=0.8)
            ax.add_patch(circle)

            sym = "+" if judgment == "Low" else ("?" if judgment in ("Some concerns", "Unclear") else "\u2212")
            ax.text(col_idx + 0.5, y + 0.5, sym, ha="center", va="center",
                    color="white", fontsize=11, fontweight="bold")

    ax.set_xlim(0, len(domain_keys))
    ax.set_ylim(0, n_studies)
    ax.set_xticks([i + 0.5 for i in range(len(domain_keys))])
    ax.set_xticklabels(domains, rotation=25, ha="right", fontsize=9, fontweight="medium")

    study_names = [s.get("study_name", f"Study {i+1}") for i, s in enumerate(rob_data)]
    ax.set_yticks([i + 0.5 for i in range(n_studies)])
    ax.set_yticklabels(list(reversed(study_names)), fontsize=9)

    ax.set_xticks(range(len(domain_keys) + 1), minor=True)
    ax.set_yticks(range(n_studies + 1), minor=True)
    ax.grid(which="minor", color=JOURNAL_COLORS["neutral_light"], linestyle="-", linewidth=1)

    legend_elements = [
        plt.Line2D([0], [0], marker="o", color="w", markerfacecolor=ROB_COLORS["Low"],
                   markersize=10, label="Low Risk (+)"),
        plt.Line2D([0], [0], marker="o", color="w", markerfacecolor=ROB_COLORS["Some concerns"],
                   markersize=10, label="Some Concerns / Unclear (?)"),
        plt.Line2D([0], [0], marker="o", color="w", markerfacecolor=ROB_COLORS["High"],
                   markersize=10, label="High Risk (\u2212)"),
    ]
    ax.legend(handles=legend_elements, loc="upper center",
              bbox_to_anchor=(0.5, -0.15), ncol=3, frameon=True, fontsize=8.5)

    apply_journal_style(ax, title)
    plt.tight_layout()
    return save_figure(fig)


# ── PRISMA Flow Diagram ──

def generate_prisma_flow(
    identification: Dict[str, int],
    screening: Dict[str, int],
    eligibility: Dict[str, int],
    included: int,
    title: str = "PRISMA 2020 Flow Diagram",
) -> Dict[str, str]:
    """Generate a PRISMA 2020 flow diagram for systematic review reporting.

    Args:
        identification: {
            'records_identified': int, 'records_databases': int,
            'records_registers': int, 'duplicates_removed': int
        }
        screening: {
            'title_abstract_screened': int, 'title_abstract_excluded': int
        }
        eligibility: {
            'fulltext_assessed': int, 'fulltext_excluded': int,
            'exclusion_reasons': dict  # {reason: count}
        }
        included: int — number of studies included in review
    """
    fig, ax = plt.subplots(figsize=(10, 12))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.axis("off")

    # Colors
    box_color = PHYLO_COLORS["cream"]
    box_edge = JOURNAL_COLORS["primary"]
    arrow_color = JOURNAL_COLORS["neutral_dark"]
    side_box_color = PHYLO_COLORS["paper"]

    def draw_box(x, y, w, h, text, fc=box_color, ec=box_edge, fontsize=9):
        """Draw a rounded rectangle with centered text."""
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.15",
                                       facecolor=fc, edgecolor=ec, linewidth=1.5)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha="center", va="center",
                fontsize=fontsize, color=JOURNAL_COLORS["neutral_dark"],
                wrap=True, multialignment="center")

    def draw_arrow(x1, y1, x2, y2):
        """Draw an arrow from (x1,y1) to (x2,y2)."""
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="->", color=arrow_color, lw=1.5))

    # ── Phase labels (left side) ──
    phase_y = [10.5, 7.5, 4.5, 1.5]
    phase_labels = ["Identification", "Screening", "Eligibility", "Included"]
    for y, label in zip(phase_y, phase_labels):
        ax.text(0.3, y, label, fontsize=10, fontweight="bold",
                color=JOURNAL_COLORS["primary"], rotation=90,
                va="center", ha="center")
        # Phase separator lines
        ax.plot([0.7, 9.7], [y - 1.2, y - 1.2], color=JOURNAL_COLORS["neutral_light"],
                linewidth=0.5, linestyle="-")

    # ── Identification phase ──
    db_records = identification.get("records_databases", 0)
    reg_records = identification.get("records_registers", 0)
    total_records = identification.get("records_identified", db_records + reg_records)
    dups_removed = identification.get("duplicates_removed", 0)

    # Main box: records identified
    draw_box(1.5, 10.0, 4.0, 1.2,
             f"Records identified from databases\n(n = {db_records})")
    # Side box: registers
    draw_box(6.0, 10.0, 3.0, 1.2,
             f"Records from registers\n(n = {reg_records})",
             fc=side_box_color)

    # Arrow down to deduplication
    draw_arrow(3.5, 10.0, 3.5, 9.2)
    draw_arrow(7.5, 10.0, 7.5, 9.2)
    draw_arrow(7.5, 9.2, 4.5, 9.2)  # merge

    # Deduplication box
    draw_box(1.5, 8.5, 4.0, 1.0,
             f"Records after duplicates removed\n(n = {total_records - dups_removed})")

    # ── Screening phase ──
    draw_arrow(3.5, 8.5, 3.5, 7.7)

    ta_screened = screening.get("title_abstract_screened", total_records - dups_removed)
    ta_excluded = screening.get("title_abstract_excluded", 0)

    draw_box(1.5, 7.0, 4.0, 1.0,
             f"Records screened\n(n = {ta_screened})")

    # Side box: excluded
    draw_box(6.0, 7.0, 3.0, 1.0,
             f"Records excluded\n(n = {ta_excluded})",
             fc=side_box_color)
    draw_arrow(5.5, 7.5, 6.0, 7.5)

    # ── Eligibility phase ──
    draw_arrow(3.5, 7.0, 3.5, 6.2)

    ft_assessed = eligibility.get("fulltext_assessed", ta_screened - ta_excluded)
    ft_excluded = eligibility.get("fulltext_excluded", 0)

    draw_box(1.5, 5.5, 4.0, 1.0,
             f"Full-text articles assessed\n(n = {ft_assessed})")

    # Side box: full-text excluded with reasons
    exclusion_reasons = eligibility.get("exclusion_reasons", {})
    reasons_text = f"Full-text articles excluded\n(n = {ft_excluded})"
    if exclusion_reasons:
        reasons_lines = [f"  {reason}: {count}" for reason, count in exclusion_reasons.items()]
        reasons_text += "\n" + "\n".join(reasons_lines[:5])  # max 5 reasons

    side_h = 1.0 + 0.25 * min(5, len(exclusion_reasons))
    draw_box(6.0, 5.5, 3.0, side_h, reasons_text, fc=side_box_color, fontsize=8)
    draw_arrow(5.5, 6.0, 6.0, 6.0)

    # ── Included phase ──
    draw_arrow(3.5, 5.5, 3.5, 2.7)

    draw_box(1.5, 1.5, 4.0, 1.2,
             f"Studies included in review\n(n = {included})",
             fc=PHYLO_COLORS["yellow"])

    # Title
    ax.text(5, 11.7, title, fontsize=13, fontweight="bold",
            ha="center", va="center", color=JOURNAL_COLORS["primary"])

    plt.tight_layout()
    return save_figure(fig)
