"""Separate MTR/RC reporting-completeness assessment and aggregation."""
from __future__ import annotations

import json
import io
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

from services.db_backend import DBBackend

PROFILE_PATH = Path(__file__).resolve().parent.parent / "profiles" / "mtr_rc.json"


def load_profile() -> dict:
    with PROFILE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _text(pdf_data: Optional[dict], study: dict) -> str:
    full = str((pdf_data or {}).get("full_text") or "")
    if len(full.strip()) > 100:
        return full
    pages = (pdf_data or {}).get("pages") or []
    page_text = "\n\n".join(str(p.get("text") or "") for p in pages if isinstance(p, dict))
    return page_text or f"{study.get('title', '')}\n{study.get('abstract', '')}"


def assess_profile(
    study: dict,
    pdf_data: Optional[dict],
    model_fn: Optional[Callable[[str], Any]] = None,
) -> list[dict]:
    profile = load_profile()
    article = _text(pdf_data, study)
    lower = article.lower()
    applicable = any(signal in lower for signal in ("cerebrovascular reactivity", "cvr", "fmri", "bold", "mri"))

    items = []
    for section in profile["sections"]:
        for item in section["items"]:
            match = next((signal for signal in item.get("signals", []) if signal.lower() in lower), "")
            status = "complete" if match else ("not_reported" if applicable else "not_applicable")
            evidence = match
            if match:
                pos = lower.find(match.lower())
                evidence = article[max(0, pos - 80): pos + len(match) + 120].replace("\n", " ").strip()
            items.append({
                "section_key": section["key"],
                "item_key": item["key"],
                "item_label": item["label"],
                "status": status,
                "evidence": evidence,
                "confidence": 0.8 if match else (0.75 if not applicable else 0.55),
            })

    if model_fn and applicable:
        prompt_items = "\n".join(f"- {i['item_key']}: {i['item_label']}" for i in items)
        prompt = f"""Assess each reporting item using only the article text.
Statuses: complete, not_reported, not_applicable. Include a short verbatim quote.
Items:
{prompt_items}
Article:
{article[:30000]}"""
        try:
            raw = model_fn(prompt) or {}
            by_key = {str(i.get("item_key")): i for i in raw.get("items", []) if isinstance(i, dict)}
            for item in items:
                candidate = by_key.get(item["item_key"])
                if not candidate:
                    continue
                status = candidate.get("status")
                quote = str(candidate.get("evidence") or "").strip()
                if status not in ("complete", "not_reported", "not_applicable"):
                    continue
                if quote and quote.lower() not in lower:
                    quote = ""
                confidence = max(0.0, min(1.0, float(candidate.get("confidence", 0.0) or 0.0)))
                if status == "complete" and not quote:
                    confidence = min(confidence, 0.5)
                item.update(status=status, evidence=quote, confidence=confidence)
        except Exception:
            pass
    return items


def persist_profile(
    db: DBBackend,
    project_id: str,
    study_id: str,
    items: list[dict],
    profile_key: str = "mtr_rc_v1",
) -> str:
    existing = db.query("reporting_profile_assessments", {"study_id": study_id})
    if existing:
        assessment_id = existing[0]["profile_assessment_id"]
        for old in db.query("reporting_profile_items", {"profile_assessment_id": assessment_id}):
            db.delete("reporting_profile_items", old["profile_item_id"])
    else:
        assessment_id = str(uuid.uuid4())
        db.insert("reporting_profile_assessments", {
            "profile_assessment_id": assessment_id,
            "study_id": study_id,
            "project_id": project_id,
            "profile_key": profile_key,
        })
    for item in items:
        db.insert("reporting_profile_items", {
            "profile_item_id": str(uuid.uuid4()),
            "profile_assessment_id": assessment_id,
            **item,
        })
    db.commit()
    return assessment_id


def get_project_profile(project_id: str, db: DBBackend) -> dict:
    profile = load_profile()
    assessments = db.query("reporting_profile_assessments", {"project_id": project_id})
    studies = {s["study_id"]: s for s in db.query("studies", {"project_id": project_id})}
    rows = []
    for assessment in assessments:
        study = studies.get(assessment["study_id"], {})
        for item in db.query("reporting_profile_items", {
            "profile_assessment_id": assessment["profile_assessment_id"],
        }):
            rows.append({
                "study_id": assessment["study_id"],
                "study_title": study.get("title", ""),
                **item,
            })
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        bucket = counts.setdefault(row["item_key"], {
            "complete": 0, "not_reported": 0, "not_applicable": 0,
        })
        bucket[row["status"]] = bucket.get(row["status"], 0) + 1
    return {"profile": profile, "rows": rows, "counts": counts}


def render_profile_figure(profile_data: dict, fmt: str = "svg") -> bytes:
    """Render the separate MTR/RC aggregate completeness profile."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    profile = profile_data["profile"]
    counts = profile_data["counts"]
    fig, axes = plt.subplots(1, 2, figsize=(16, 7))
    colors = {
        "complete": "#00BA38",
        "not_reported": "#D7191C",
        "not_applicable": "#BDBDBD",
    }
    labels = {
        "complete": "Complete / Addressed",
        "not_reported": "Incomplete / Not Reported",
        "not_applicable": "Not Applicable",
    }
    for ax, section in zip(axes, profile["sections"]):
        item_labels = [item["label"] for item in section["items"]]
        keys = [item["key"] for item in section["items"]]
        left = [0.0] * len(keys)
        for status in ("complete", "not_reported", "not_applicable"):
            values = []
            for key in keys:
                bucket = counts.get(key, {})
                total = sum(bucket.values())
                values.append(100.0 * bucket.get(status, 0) / total if total else 0.0)
            ax.barh(range(len(keys)), values, left=left, color=colors[status],
                    edgecolor="#555555", linewidth=0.5, label=labels[status])
            for index, value in enumerate(values):
                if value >= 8:
                    ax.text(left[index] + value / 2, index, f"{value:.0f}%",
                            ha="center", va="center", fontsize=7)
            left = [a + b for a, b in zip(left, values)]
        ax.set_yticks(range(len(item_labels)))
        ax.set_yticklabels(item_labels, fontsize=8)
        ax.invert_yaxis()
        ax.set_xlim(0, 100)
        ax.set_xlabel("Proportion of studies (%)")
        ax.set_title(section["name"], fontsize=10, fontweight="bold")
    handles, legend_labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, legend_labels, loc="lower center", ncol=3)
    fig.suptitle(profile["name"], fontweight="bold")
    fig.patch.set_facecolor("white")
    plt.tight_layout(rect=(0, 0.08, 1, 0.94))
    buffer = io.BytesIO()
    fig.savefig(buffer, format=fmt, dpi=220, bbox_inches="tight")
    plt.close(fig)
    return buffer.getvalue()
