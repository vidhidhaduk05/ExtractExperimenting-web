"""Publication figures for prediction models, styled for Radiology (RSNA).

Seaborn-based plotting of the standard prediction-model figure set:
calibration, ROC with bootstrap band, decision curves, predictor
distributions, coefficient forest plots, and permutation importance.

Output policy (Radiology author guidelines):
- Drafts: PNG (fast iteration, not accepted by the journal).
- Finals: 300-dpi TIFF (TIF/EPS/AI/PSD only; PNG is rejected) plus a vector
  PDF companion for revision rounds.
- Widths: single column 3.35 in (8.5 cm), double column 7.0 in (17.8 cm).
- At most 4 panels (a-d) per figure.

Every plotting call accepts a DecisionTrace and logs the figure decision.
See ch12 (metrics), ch20 (Radiology submission).
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from matplotlib.figure import Figure

from .decision_trace import DecisionTrace

# Radiology print sizes (inches).
SINGLE_COL = 3.35
DOUBLE_COL = 7.0
MAX_PANELS = 4
PANEL_LABELS = ("a", "b", "c", "d")

_DRAFT_DPI = 150
_FINAL_DPI = 300


def apply_theme() -> None:
    """Radiology-ready seaborn theme: ticks, colorblind-safe palette,
    Arial-compatible font, no top/right spines. Call once per session."""
    sns.set_theme(style="ticks", palette="colorblind", context="paper",
                  font_scale=1.0, rc={
                      "font.family": ["Liberation Sans", "Arial", "DejaVu Sans"],
                      "axes.spines.top": False,
                      "axes.spines.right": False,
                      "axes.linewidth": 0.8,
                      "xtick.major.width": 0.8,
                      "ytick.major.width": 0.8,
                      "pdf.fonttype": 42,   # editable text in vector output
                      "ps.fonttype": 42,
                  })
    mpl.rcParams["svg.fonttype"] = "none"


def new_figure(n_panels: int = 1, width: float = SINGLE_COL,
               height: float | None = None, label_panels: bool = True,
               trace: DecisionTrace | None = None,
               figure_id: str = "figure") -> tuple[Figure, np.ndarray]:
    """Create a figure with at most 4 panels, sized to Radiology columns.

    Returns (fig, axes). `label_panels` adds a/b/c/d markers required for
    multipart figures. Logs the layout decision when a trace is given.
    Margins are fixed (no tight bbox at save time) so the exported figure
    keeps the exact column width the journal requires.
    """
    if not 1 <= n_panels <= MAX_PANELS:
        raise ValueError(f"Radiology allows at most {MAX_PANELS} panels; got {n_panels}")
    if height is None:
        height = width * 0.85 if n_panels == 1 else width * 0.38
    ncols = 1 if n_panels == 1 else 2
    nrows = int(np.ceil(n_panels / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(width, height))
    axes = np.atleast_1d(axes).ravel()
    for extra in axes[n_panels:]:
        extra.set_visible(False)
    if label_panels and n_panels > 1:
        fig.subplots_adjust(wspace=0.45, hspace=0.55)
        for ax, label in zip(axes[:n_panels], PANEL_LABELS):
            ax.text(-0.14, 1.04, label, transform=ax.transAxes,
                    fontsize=10, fontweight="bold", va="top")
    if trace is not None:
        trace.log("figure_layout", chosen={"figure_id": figure_id, "n_panels": n_panels,
                                           "width_in": width, "height_in": height},
                  alternatives=["more than 4 panels"],
                  rationale="Radiology: max 4 components per figure; column widths fixed",
                  stage="figures")
    return fig, axes


def save_draft(fig: Figure, path: str | Path) -> Path:
    """Save a fast-iteration PNG draft (not journal-acceptable)."""
    path = Path(path).with_suffix(".png")
    fig.savefig(path, dpi=_DRAFT_DPI, bbox_inches="tight")
    return path


def save_final(fig: Figure, path: str | Path) -> tuple[Path, Path]:
    """Save the submission figure: 300-dpi TIFF (LZW) + vector PDF companion.

    Radiology accepts TIF/EPS/AI/PSD at 300 dpi; PNG is rejected. The PDF is
    for internal review and revision rounds, not for upload. No tight bbox:
    the exported canvas keeps the exact figure size set at creation, so the
    column width (3.35 / 7.0 in) survives to the submitted file.
    """
    stem = Path(path)
    tiff_path = stem.with_suffix(".tif")
    pdf_path = stem.with_suffix(".pdf")
    fig.savefig(tiff_path, dpi=_FINAL_DPI,
                pil_kwargs={"compression": "tiff_lzw"})
    fig.savefig(pdf_path)
    return tiff_path, pdf_path


# ---------------------------------------------------------------------------
# Standard prediction-model figures (all operate on out-of-bag / held-out data)
# ---------------------------------------------------------------------------

def plot_calibration(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10,
                     trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """Observed vs predicted risk with the ideal line. Bin by decile of
    predicted risk; report intercept/slope separately via metrics.calibration."""
    apply_theme()
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob, dtype=float)
    bins = pd.qcut(y_prob, q=min(n_bins, len(np.unique(y_prob))), duplicates="drop")
    grouped = pd.DataFrame({"p": y_prob, "y": y_true, "bin": bins}).groupby("bin", observed=True)
    mean_pred = grouped["p"].mean().to_numpy()
    observed = grouped["y"].mean().to_numpy()
    fig, (ax,) = new_figure(1, SINGLE_COL, trace=trace, figure_id="calibration")
    ax.plot([0, 1], [0, 1], ls="--", lw=0.8, color="0.4", label="Ideal")
    ax.plot(mean_pred, observed, "o-", ms=4, lw=1.2, label="Model")
    ax.set_xlabel("Predicted probability")
    ax.set_ylabel("Observed proportion")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(frameon=False, loc="lower right")
    sns.despine(fig=fig)
    if trace is not None:
        trace.log("calibration_figure", chosen={"n_bins": int(len(mean_pred))},
                  rationale="Decile-binned observed vs predicted; ideal line at 45 degrees",
                  stage="figures")
    return fig, ax


def plot_roc(y_true: np.ndarray, y_score: np.ndarray,
             boot_scores: list[np.ndarray] | None = None,
             trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """ROC curve; pass per-replicate FPR/TPR grids from bootstrap validation
    as `boot_scores` to shade a percentile band."""
    apply_theme()
    from sklearn.metrics import roc_curve
    y_true = np.asarray(y_true)
    y_score = np.asarray(y_score)
    fpr, tpr, _ = roc_curve(y_true, y_score)
    fig, (ax,) = new_figure(1, SINGLE_COL, trace=trace, figure_id="roc")
    ax.plot([0, 1], [0, 1], ls="--", lw=0.8, color="0.4")
    if boot_scores is not None:
        grid = np.linspace(0, 1, 101)
        interp = np.vstack([np.interp(grid, fpr_b, tpr_b) for fpr_b, tpr_b in boot_scores])
        lo, hi = np.percentile(interp, [2.5, 97.5], axis=0)
        ax.fill_between(grid, lo, hi, alpha=0.2, lw=0, label="95% CI")
    ax.plot(fpr, tpr, lw=1.4, label="Model")
    ax.set_xlabel("False-positive rate")
    ax.set_ylabel("True-positive rate")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.legend(frameon=False, loc="lower right")
    sns.despine(fig=fig)
    if trace is not None:
        trace.log("roc_figure", chosen={"ci_band": boot_scores is not None},
                  rationale="ROC on held-out patients; band from bootstrap replicates",
                  stage="figures")
    return fig, ax


def plot_decision_curve(dc: pd.DataFrame,
                        trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """Net benefit vs threshold from metrics.decision_curve output, with
    treat-all and treat-none reference strategies."""
    apply_theme()
    fig, (ax,) = new_figure(1, SINGLE_COL, trace=trace, figure_id="decision_curve")
    ax.plot(dc["threshold"], dc["net_benefit_model"], lw=1.4, label="Model")
    ax.plot(dc["threshold"], dc["net_benefit_treat_all"], lw=1.0, ls="--", label="Treat all")
    ax.axhline(0.0, lw=0.8, color="0.4", label="Treat none")
    ax.set_xlabel("Threshold probability")
    ax.set_ylabel("Net benefit")
    ax.set_xlim(0, 1)
    ax.margins(y=0.05)
    ax.legend(frameon=False, loc="upper right")
    sns.despine(fig=fig)
    if trace is not None:
        trace.log("decision_curve_figure", chosen={"n_thresholds": len(dc)},
                  rationale="Net benefit within clinically plausible threshold range",
                  stage="figures")
    return fig, ax


def plot_predictor_distribution(df: pd.DataFrame, column: str, hue: str | None = None,
                                trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """Distribution of one predictor (optionally by outcome group)."""
    apply_theme()
    fig, (ax,) = new_figure(1, SINGLE_COL, trace=trace, figure_id=f"dist_{column}")
    sns.histplot(data=df, x=column, hue=hue, ax=ax, stat="density",
                 common_norm=False, kde=True, element="step", fill=False)
    ax.set_xlabel(column)
    ax.set_ylabel("Density")
    sns.despine(fig=fig)
    if trace is not None:
        trace.log("distribution_figure", chosen={"column": column, "hue": hue},
                  rationale="Pre-specified exploratory display of predictor distribution",
                  stage="figures")
    return fig, ax


def plot_coefficients(names: list[str], estimates: np.ndarray,
                      ci_lower: np.ndarray, ci_upper: np.ndarray,
                      reference_line: float = 0.0,
                      trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """Horizontal forest plot of (adjusted) estimates with intervals."""
    apply_theme()
    order = np.argsort(estimates)
    names = [names[i] for i in order]
    estimates = np.asarray(estimates)[order]
    ci_lower = np.asarray(ci_lower)[order]
    ci_upper = np.asarray(ci_upper)[order]
    height = max(1.6, 0.28 * len(names) + 0.8)
    fig, (ax,) = new_figure(1, SINGLE_COL, height=height, trace=trace,
                            figure_id="forest")
    y = np.arange(len(names))
    ax.hlines(y, ci_lower, ci_upper, lw=1.2, color=sns.color_palette()[0])
    ax.plot(estimates, y, "o", ms=4, color=sns.color_palette()[0])
    ax.axvline(reference_line, lw=0.8, ls="--", color="0.4")
    ax.set_yticks(y, names)
    ax.set_xlabel("Estimate (95% CI)")
    ax.margins(y=0.02)
    sns.despine(fig=fig, left=True)
    if trace is not None:
        trace.log("forest_figure", chosen={"n_predictors": len(names)},
                  rationale="Adjusted estimates with intervals; reference line at null",
                  stage="figures")
    return fig, ax


def plot_permutation_importance(importance_df: pd.DataFrame,
                                trace: DecisionTrace | None = None) -> tuple[Figure, object]:
    """Bar plot of permutation importances. Input: DataFrame with columns
    ['feature', 'importance_mean', 'importance_std'] (sklearn output renamed)."""
    apply_theme()
    df = importance_df.sort_values("importance_mean", ascending=True)
    fig, (ax,) = new_figure(1, SINGLE_COL, trace=trace, figure_id="permutation_importance")
    ax.barh(df["feature"], df["importance_mean"],
            xerr=df["importance_std"], error_kw={"lw": 0.8})
    ax.set_xlabel("Permutation importance (decrease in score)")
    ax.set_ylabel("")
    sns.despine(fig=fig, left=True)
    if trace is not None:
        trace.log("importance_figure", chosen={"n_features": len(df)},
                  rationale="Permutation importance computed on held-out patients",
                  stage="figures")
    return fig, ax
