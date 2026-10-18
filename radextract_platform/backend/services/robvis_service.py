"""Build robvis data frames from stored RoB assessments and render figures.

robvis (https://github.com/mcguinlu/robvis) draws the traffic-light and summary
bar charts. When R or the package is missing, the traffic-light falls back to
the matplotlib chart already used by /api/charts/rob-traffic-light.
"""
from __future__ import annotations

import base64
import io

from services.r_plot_service import call_r_script, call_r_script_bytes

# Domain keys in the order robvis expects for each template.
TOOL_DOMAINS: dict[str, list[str]] = {
    "ROB2": [
        "randomization",
        "deviations",
        "missing_outcome",
        "measurement",
        "selection_reported",
    ],
    "ROBINS-I": [
        "confounding",
        "selection_participants",
        "classification_interventions",
        "deviations_interventions",
        "missing_data",
        "measurement_outcome",
        "selection_reported",
    ],
    "ROBINS-E": [
        "confounding",
        "measurement_exposure",
        "selection_participants",
        "post_exposure_interventions",
        "missing_data",
        "measurement_outcome",
        "selection_reported",
    ],
    "QUADAS-2": [
        "patient_selection",
        "index_test",
        "reference_standard",
        "flow_and_timing",
    ],
}

_TOOL_ALIASES = {
    "rob2": "ROB2",
    "rob 2": "ROB2",
    "rob2.0": "ROB2",
    "robins_i": "ROBINS-I",
    "robins-i": "ROBINS-I",
    "robinsi": "ROBINS-I",
    "robins_e": "ROBINS-E",
    "robins-e": "ROBINS-E",
    "robinse": "ROBINS-E",
    "quadas2": "QUADAS-2",
    "quadas-2": "QUADAS-2",
    "quadas_2": "QUADAS-2",
    "generic": "Generic",
    "nos": "Generic",
    "jbi_case_report": "Generic",
    "jbi_case_series": "Generic",
}

# robvis matches these strings exactly.
_ROB2 = {
    "low": "Low",
    "some_concerns": "Some concerns",
    "high": "High",
    "unclear": "No information",
    "no_information": "No information",
    "pending": "No information",
    "": "No information",
}
_ROBINS = {
    "low": "Low",
    "moderate": "Moderate",
    "serious": "Serious",
    "critical": "Critical",
    "high": "Serious",
    "some_concerns": "Moderate",
    "unclear": "No information",
    "no_information": "No information",
    "pending": "No information",
    "": "No information",
}
_QUADAS = {
    "low": "Low",
    "high": "High",
    "unclear": "Unclear",
    "some_concerns": "Unclear",
    "no_information": "Unclear",
    "pending": "Unclear",
    "": "Unclear",
}


def robvis_tool_name(tool_key: str) -> str:
    key = (tool_key or "").strip().lower().replace(" ", "")
    if key in _TOOL_ALIASES:
        return _TOOL_ALIASES[key]
    spaced = (tool_key or "").strip().lower()
    return _TOOL_ALIASES.get(spaced, "Generic")


def _judgment_map(tool: str) -> dict[str, str]:
    if tool == "QUADAS-2":
        return _QUADAS
    if tool in ("ROBINS-I", "ROBINS-E"):
        return _ROBINS
    return _ROB2


def normalize_judgment(tool: str, judgment: str) -> str:
    table = _judgment_map(tool)
    raw = (judgment or "").strip().lower().replace(" ", "_").replace("-", "_")
    if raw in table:
        return table[raw]
    missing = "Unclear" if tool == "QUADAS-2" else "No information"
    return missing


def to_robvis_rows(summary: dict) -> tuple[str, list[str], list[dict]]:
    """Return (robvis tool name, column order, study rows)."""
    tool = robvis_tool_name(summary.get("tool", ""))
    domain_keys = TOOL_DOMAINS.get(tool)
    assessments = summary.get("assessments") or []

    if domain_keys is None:
        tool = "Generic"
        seen: list[str] = []
        for assessment in assessments:
            for domain in assessment.get("domains") or []:
                key = domain.get("domain_key") or ""
                if key and key not in seen:
                    seen.append(key)
        domain_keys = seen

    columns = ["Study"] + [f"D{i}" for i in range(1, len(domain_keys) + 1)] + ["Overall"]
    rows = []
    for assessment in assessments:
        by_key = {
            d.get("domain_key"): d.get("risk_judgment", "")
            for d in (assessment.get("domains") or [])
        }
        title = (assessment.get("study_title") or assessment.get("study_id") or "Study").strip()
        label = title if len(title) <= 48 else title[:45] + "..."
        used = [row["Study"] for row in rows]
        if label in used:
            label = f"{label} ({used.count(label) + 1})"
        row = {"Study": label}
        for index, key in enumerate(domain_keys, start=1):
            row[f"D{index}"] = normalize_judgment(tool, by_key.get(key, ""))
        row["Overall"] = normalize_judgment(tool, assessment.get("overall_judgment", ""))
        rows.append(row)
    return tool, columns, rows


_PLOT_COLORS = {
    "Low": "#00BFC4",
    "Some concerns": "#E7B800",
    "Moderate": "#E7B800",
    "Unclear": "#E7B800",
    "High": "#F8766D",
    "Serious": "#D73027",
    "Critical": "#7F0000",
    "No information": "#8DA0CB",
}


def _matplotlib_plot(summary: dict, plot: str, fmt: str = "svg") -> bytes:
    """Tool-agnostic publication fallback for SVG and PNG."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    tool, columns, rows = to_robvis_rows(summary)
    assessments = summary.get("assessments") or []
    domain_labels = [
        d.get("domain_label") or d.get("domain_key") or f"D{i + 1}"
        for i, d in enumerate((assessments[0].get("domains") or []) if assessments else [])
    ]
    labels = domain_labels + ["Overall"]
    value_columns = [c for c in columns if c != "Study"]

    if plot == "summary":
        fig, ax = plt.subplots(figsize=(11, max(4.5, 0.6 * len(value_columns) + 2)))
        categories = []
        for category in _PLOT_COLORS:
            if any(row.get(column) == category for row in rows for column in value_columns):
                categories.append(category)
        left = [0.0] * len(value_columns)
        for category in categories:
            values = [
                100.0 * sum(1 for row in rows if row.get(column) == category) / max(1, len(rows))
                for column in value_columns
            ]
            ax.barh(range(len(value_columns)), values, left=left, color=_PLOT_COLORS[category],
                    edgecolor="#555555", linewidth=0.5, label=category)
            for index, value in enumerate(values):
                if value >= 8:
                    ax.text(left[index] + value / 2, index, f"{value:.1f}%",
                            ha="center", va="center", fontsize=8, fontweight="bold")
            left = [a + b for a, b in zip(left, values)]
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels, fontsize=9)
        ax.set_xlim(0, 100)
        ax.set_xlabel("Proportion of studies (%)")
        ax.set_title(f"Risk of bias domains ({tool}, n={len(rows)})", fontweight="bold")
        ax.invert_yaxis()
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.14), ncol=max(1, min(4, len(categories))))
    else:
        fig, ax = plt.subplots(figsize=(max(9, 1.2 * len(value_columns) + 4), max(4.5, 0.55 * len(rows) + 2.5)))
        for row_index, row in enumerate(rows):
            for column_index, column in enumerate(value_columns):
                value = row.get(column, "No information")
                color = _PLOT_COLORS.get(value, "#8DA0CB")
                circle = plt.Circle((column_index, row_index), 0.32, color=color, ec="#444444", lw=0.7)
                ax.add_patch(circle)
                symbol = "+" if value == "Low" else ("?" if value in ("No information", "Unclear") else "−")
                ax.text(column_index, row_index, symbol, ha="center", va="center", fontweight="bold")
        ax.set_xlim(-0.6, len(value_columns) - 0.4)
        ax.set_ylim(-0.6, len(rows) - 0.4)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=35, ha="left", fontsize=8)
        ax.xaxis.tick_top()
        ax.set_yticks(range(len(rows)))
        ax.set_yticklabels([row["Study"] for row in rows], fontsize=8)
        ax.invert_yaxis()
        ax.grid(color="#DDDDDD", linewidth=0.7)
        ax.set_title(f"Study-level risk-of-bias assessments ({tool}, n={len(rows)})",
                     pad=45, fontweight="bold")
        present = list(dict.fromkeys(row.get(c) for row in rows for c in value_columns))
        ax.legend(
            handles=[Patch(facecolor=_PLOT_COLORS.get(v, "#8DA0CB"), edgecolor="#444444", label=v) for v in present],
            loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=max(1, min(5, len(present))),
        )
    fig.patch.set_facecolor("white")
    plt.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format=fmt, dpi=220, bbox_inches="tight")
    plt.close(fig)
    return buffer.getvalue()


def render_traffic_light(summary: dict, colour: str = "cochrane") -> dict:
    """Render a robvis traffic-light SVG, or the matplotlib fallback."""
    tool, columns, rows = to_robvis_rows(summary)
    if not rows:
        return {
            "svg": "",
            "engine": "none",
            "tool": tool,
            "study_count": 0,
            "message": "No risk-of-bias assessments to plot.",
        }

    plot_data = {
        "tool": tool,
        "plot": "traffic_light",
        "studies": rows,
        "columns": columns,
        "colour": colour,
    }
    svg = call_r_script("robvis_plot.R", plot_data)
    if svg:
        png = call_r_script_bytes("robvis_plot.R", plot_data, ext=".png") or b""
        return {"svg": svg, "png": png, "engine": "robvis", "tool": tool, "study_count": len(rows), "message": ""}

    svg = _matplotlib_plot(summary, "traffic", "svg").decode("utf-8")
    return {
        "svg": svg,
        "engine": "matplotlib",
        "tool": tool,
        "study_count": len(rows),
        "message": "robvis was not available, so the figure used the built-in chart.",
    }


def render_robvis(summary: dict, plot: str = "traffic", colour: str = "cochrane") -> dict:
    """Shape used by GET /api/rob/projects/{id}/figure."""
    if plot == "summary":
        rendered = render_summary(summary, colour=colour)
        plot_name = "summary"
    else:
        rendered = render_traffic_light(summary, colour=colour)
        plot_name = "traffic"
    svg = rendered.get("svg") or ""
    png = rendered.get("png") or (_matplotlib_plot(summary, plot_name, "png") if svg else b"")
    return {
        "success": bool(svg),
        "engine": rendered.get("engine", "none"),
        "plot": plot_name,
        "tool": rendered.get("tool", ""),
        "study_count": rendered.get("study_count", 0),
        "svg": svg,
        "png_base64": base64.b64encode(png).decode("ascii") if png else "",
        "message": rendered.get("message", ""),
    }


def render_summary(summary: dict, colour: str = "cochrane") -> dict:
    """Render a robvis summary bar chart with a deterministic fallback."""
    tool, columns, rows = to_robvis_rows(summary)
    if not rows:
        return {
            "svg": "",
            "engine": "none",
            "tool": tool,
            "study_count": 0,
            "message": "No risk-of-bias assessments to plot.",
        }
    plot_data = {
        "tool": tool,
        "plot": "summary",
        "studies": rows,
        "columns": columns,
        "colour": colour,
    }
    svg = call_r_script("robvis_plot.R", plot_data)
    if svg:
        png = call_r_script_bytes("robvis_plot.R", plot_data, ext=".png") or b""
        return {"svg": svg, "png": png, "engine": "robvis", "tool": tool, "study_count": len(rows), "message": ""}
    svg = _matplotlib_plot(summary, "summary", "svg").decode("utf-8")
    return {
        "svg": svg,
        "engine": "matplotlib",
        "tool": tool,
        "study_count": len(rows),
        "message": "robvis was not available, so the figure used the built-in chart.",
    }


def render_project_figures(summary: dict, colour: str = "cochrane") -> list[dict]:
    """Return traffic and summary figures independently for every tool group."""
    figures = []
    groups = summary.get("tool_groups") or {}
    if not groups and summary.get("assessments"):
        groups = {summary.get("tool", "unknown"): summary}
    for tool_key, group in groups.items():
        group_summary = {**group, "tool": tool_key}
        for plot in ("traffic", "summary"):
            figure = render_robvis(group_summary, plot=plot, colour=colour)
            figure["template"] = figure["tool"]
            figure["tool"] = tool_key
            figures.append(figure)
    return figures
