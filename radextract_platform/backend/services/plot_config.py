"""Shared publication-ready plot configuration.

Centralizes font, color, DPI, and SVG settings so all chart modules
produce consistent, journal-quality figures.

Usage:
    from services.plot_config import configure_plots, save_figure, PHYLO_COLORS, OKABE_ITO, ROB_COLORS
    configure_plots()  # call once at module import
    fig, ax = plt.subplots(...)
    result = save_figure(fig)  # returns {"png_base64": ..., "svg": ...}
"""
from __future__ import annotations

import os
import tempfile

# Prevent permission denied errors on Windows / locked font cache
if "MPLCONFIGDIR" not in os.environ:
    os.environ["MPLCONFIGDIR"] = os.path.join(tempfile.gettempdir(), "matplotlib_radextract")
    try:
        os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)
    except Exception:
        pass

import io
import base64
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm


# ── Color Palettes ──

# Okabe-Ito colorblind-safe palette
OKABE_ITO = {
    "black": "#000000",
    "orange": "#E69F00",
    "sky_blue": "#56B4E9",
    "bluish_green": "#009E73",
    "yellow": "#F0E442",
    "blue": "#0072B2",
    "vermillion": "#D55E00",
    "reddish_purple": "#CC79A7",
    "gray": "#999999",
}

# Phylo brand palette
PHYLO_COLORS = {
    "black": "#000000",
    "cream": "#ECE9E2",
    "paper": "#FAF9F3",
    "yellow": "#E9ED4C",
    "orange": "#FF9400",
    "green": "#75A025",
    "pink": "#FD9BED",
    "blue": "#0279EE",
}

# Cochrane RoB 2.0 traffic light colors
ROB_COLORS = {
    "Low": "#00A651",            # Cochrane green
    "Some concerns": "#FFD700",  # Cochrane yellow
    "Unclear": "#FFD700",        # alias for Some concerns
    "High": "#E63946",           # Cochrane red
    "Critical": "#C1121F",       # Darker red
}

# Journal styling colors
JOURNAL_COLORS = {
    "primary": "#1A365D",
    "secondary": "#2B6CB0",
    "accent": "#C53030",
    "neutral_dark": "#2D3748",
    "neutral_light": "#EDF2F7",
    "line": "#718096",
    "grid": "#CBD5E0",
    "spine": "#4A5568",
}


# ── Matplotlib Configuration ──

def configure_plots():
    """Set matplotlib rcParams for publication-ready figures.

    Call this once at module import time.
    """
    # Font: Arial / DejaVu Sans / standard sans-serif
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans", "sans-serif"]
    plt.rcParams["font.size"] = 10
    plt.rcParams["axes.titlesize"] = 12
    plt.rcParams["axes.labelsize"] = 10
    plt.rcParams["xtick.labelsize"] = 9
    plt.rcParams["ytick.labelsize"] = 9
    plt.rcParams["legend.fontsize"] = 8.5

    # SVG: keep text as editable text (not outlined paths)
    plt.rcParams["svg.fonttype"] = "none"

    # PNG: publication standard DPI
    plt.rcParams["savefig.dpi"] = 300
    plt.rcParams["figure.dpi"] = 100

    # General styling
    plt.rcParams["axes.spines.top"] = False
    plt.rcParams["axes.spines.right"] = False
    plt.rcParams["axes.grid"] = True
    plt.rcParams["grid.alpha"] = 0.3
    plt.rcParams["grid.linestyle"] = "--"
    plt.rcParams["grid.color"] = JOURNAL_COLORS["grid"]
    plt.rcParams["figure.facecolor"] = "white"
    plt.rcParams["axes.facecolor"] = "white"
    plt.rcParams["savefig.facecolor"] = "white"


# Apply configuration on import
configure_plots()


# ── Helper Functions ──

def apply_journal_style(ax, title: str | None = None):
    """Apply clean, minimal journal styling to an axes object."""
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(JOURNAL_COLORS["spine"])
    ax.spines["bottom"].set_color(JOURNAL_COLORS["spine"])
    ax.tick_params(colors=JOURNAL_COLORS["spine"], labelsize=9)
    ax.grid(True, linestyle="--", alpha=0.3, color=JOURNAL_COLORS["grid"])
    if title:
        ax.set_title(title, fontsize=12, fontweight="bold", pad=14, color="#1A202C")


def save_figure(fig) -> dict[str, str]:
    """Convert a Matplotlib Figure to base64 PNG (300 DPI) and raw SVG string.

    Returns:
        {"png_base64": "data:image/png;base64,...", "svg": "<svg>...</svg>"}
    """
    # PNG at 300 DPI (publication standard)
    png_buf = io.BytesIO()
    fig.savefig(png_buf, format="png", dpi=300, bbox_inches="tight", facecolor="white")
    png_buf.seek(0)
    png_base64 = base64.b64encode(png_buf.read()).decode("utf-8")
    png_data_url = f"data:image/png;base64,{png_base64}"

    # SVG with editable text
    svg_buf = io.StringIO()
    fig.savefig(svg_buf, format="svg", bbox_inches="tight", facecolor="white")
    svg_str = svg_buf.getvalue()

    plt.close(fig)
    return {
        "png_base64": png_data_url,
        "svg": svg_str,
    }


def save_figure_to_file(fig, filepath: str, formats: list[str] = None):
    """Save a figure to file in multiple formats.

    Args:
        fig: Matplotlib Figure
        filepath: Base path without extension
        formats: List of formats to save (default: ["png", "svg"])
    """
    if formats is None:
        formats = ["png", "svg"]
    for fmt in formats:
        fig.savefig(f"{filepath}.{fmt}", format=fmt, dpi=300,
                    bbox_inches="tight", facecolor="white")
    plt.close(fig)
