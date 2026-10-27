"""Build a reproducible mixed-tool RoB ZIP export package."""
from __future__ import annotations

import base64
import io
import json
import re
import zipfile
from datetime import datetime, timezone

import openpyxl
from openpyxl.styles import Font, PatternFill

from services.db_backend import DBBackend
from services.reporting_profile_service import get_project_profile, render_profile_figure
from services.rob_classification_service import decode_classification
from services.rob_service import get_assessment, get_project_summary
from services.rob_tools import get_tool
from services.robvis_service import render_project_figures
from services.storage_backend import get_storage


def _sheet_name(value: str) -> str:
    return re.sub(r"[\[\]:*?/\\]", "_", value)[:31] or "Sheet"


def _file_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "figure"


def _write_rows(ws, rows: list[dict], headers: list[str] | None = None) -> None:
    if not rows and not headers:
        ws.append(["No data"])
        return
    headers = headers or list(rows[0].keys())
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="315B7D")
    for row in rows:
        ws.append([row.get(header, "") for header in headers])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for column in ws.columns:
        width = min(60, max(10, max(len(str(cell.value or "")) for cell in column) + 2))
        ws.column_dimensions[column[0].column_letter].width = width


def _workbook_bytes(workbook: openpyxl.Workbook) -> bytes:
    stream = io.BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def _rob_workbook(summary: dict, classifications: list[dict], db: DBBackend) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    classification_rows = [{
        "study_id": row.get("study_id", ""),
        "study_title": row.get("study_title", ""),
        "study_design": row.get("study_design", ""),
        "selected_tool": row.get("selected_tool", ""),
        "confidence": row.get("confidence", 0.0),
        "status": row.get("status", ""),
        "alternatives": ", ".join(row.get("alternatives", [])),
        "rationale": row.get("rationale", ""),
        "evidence": " | ".join(row.get("evidence", [])),
        "model": row.get("model_name", ""),
        "human_verified": bool(row.get("human_verified")),
    } for row in classifications]
    _write_rows(wb.create_sheet("Study Classification"), classification_rows, [
        "study_id", "study_title", "study_design", "selected_tool", "confidence",
        "status", "alternatives", "rationale", "evidence", "model", "human_verified",
    ])
    _write_rows(
        wb.create_sheet("Manual Review"),
        [row for row in classification_rows if row["status"] == "manual_review"],
        list(classification_rows[0].keys()) if classification_rows else [
            "study_id", "study_title", "study_design", "selected_tool", "confidence",
            "status", "alternatives", "rationale", "evidence", "model", "human_verified",
        ],
    )

    for tool_key, group in sorted((summary.get("tool_groups") or {}).items()):
        tool = get_tool(tool_key)
        tool_name = tool.name if tool else tool_key
        summary_rows = []
        detail_rows = []
        for assessment in group.get("assessments", []):
            row = {
                "study_id": assessment["study_id"],
                "study_title": assessment["study_title"],
                "study_design": assessment.get("study_design", ""),
                "overall_judgment": assessment.get("overall_judgment", ""),
                "outcome_label": assessment.get("outcome_label", ""),
            }
            for domain in assessment.get("domains", []):
                row[domain.get("domain_label") or domain.get("domain_key")] = domain.get("risk_judgment", "")
            summary_rows.append(row)

            full = get_assessment(assessment["assessment_id"], db=db) or {}
            for domain in full.get("domain_judgments", []):
                answers = domain.get("signaling_answers") or []
                if not answers:
                    detail_rows.append({
                        "study_id": assessment["study_id"],
                        "study_title": assessment["study_title"],
                        "domain": domain.get("domain_label", ""),
                        "domain_judgment": domain.get("risk_judgment", ""),
                    })
                for answer in answers:
                    detail_rows.append({
                        "study_id": assessment["study_id"],
                        "study_title": assessment["study_title"],
                        "study_design": assessment.get("study_design", ""),
                        "outcome_label": assessment.get("outcome_label", ""),
                        "domain": domain.get("domain_label", ""),
                        "domain_judgment": domain.get("risk_judgment", ""),
                        "question": answer.get("question_text", ""),
                        "answer": answer.get("answer", ""),
                        "ai_answer": answer.get("ai_answer", ""),
                        "evidence": answer.get("ai_quote", ""),
                        "confidence": answer.get("ai_confidence", 0.0),
                        "human_verified": bool(answer.get("human_verified")),
                    })
        _write_rows(wb.create_sheet(_sheet_name(f"{tool_name} Summary")), summary_rows)
        _write_rows(wb.create_sheet(_sheet_name(f"{tool_name} Detail")), detail_rows)
    return _workbook_bytes(wb)


def _profile_workbook(profile_data: dict) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    rows = profile_data.get("rows") or []
    for section_key in ("mtr", "rc"):
        section_rows = [row for row in rows if row.get("section_key") == section_key]
        _write_rows(wb.create_sheet(f"{section_key.upper()} Study Detail"), section_rows)
        aggregate = []
        for item in profile_data["profile"]["sections"]:
            if item["key"] != section_key:
                continue
            for definition in item["items"]:
                counts = profile_data.get("counts", {}).get(definition["key"], {})
                total = sum(counts.values())
                aggregate.append({
                    "item_key": definition["key"],
                    "item_label": definition["label"],
                    "complete_n": counts.get("complete", 0),
                    "not_reported_n": counts.get("not_reported", 0),
                    "not_applicable_n": counts.get("not_applicable", 0),
                    "complete_percent": round(100 * counts.get("complete", 0) / total, 1) if total else 0,
                })
        _write_rows(wb.create_sheet(f"{section_key.upper()} Summary"), aggregate)
    return _workbook_bytes(wb)


def export_project_package(project_id: str, db: DBBackend) -> str:
    """Create ZIP with per-tool workbooks, PNG/SVG figures, and a manifest."""
    summary = get_project_summary(project_id, db=db)
    studies = {s["study_id"]: s for s in db.query("studies", {"project_id": project_id})}
    classifications = []
    for row in db.query("rob_tool_classifications", {"project_id": project_id}):
        decoded = decode_classification(row)
        decoded["study_title"] = studies.get(row.get("study_id"), {}).get("title", "")
        classifications.append(decoded)
    profile_data = get_project_profile(project_id, db)
    figures = render_project_figures(summary)

    files: dict[str, bytes] = {
        "risk_of_bias.xlsx": _rob_workbook(summary, classifications, db),
        "reporting_completeness.xlsx": _profile_workbook(profile_data),
    }
    for figure in figures:
        base = _file_name(f"{figure['tool']}_{figure['plot']}")
        if figure.get("svg"):
            files[f"figures/{base}.svg"] = figure["svg"].encode("utf-8")
        if figure.get("png_base64"):
            files[f"figures/{base}.png"] = base64.b64decode(figure["png_base64"])
    if profile_data.get("rows"):
        files["figures/MTR_RC_completeness.svg"] = render_profile_figure(profile_data, "svg")
        files["figures/MTR_RC_completeness.png"] = render_profile_figure(profile_data, "png")

    manifest = {
        "schema_version": "1.0",
        "project_id": project_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tool_groups": {
            key: group.get("total_assessments", 0)
            for key, group in (summary.get("tool_groups") or {}).items()
        },
        "manual_review_count": len(summary.get("manual_review") or []),
        "reporting_profile": profile_data["profile"]["profile_key"],
        "files": sorted([*files.keys(), "manifest.json"]),
    }
    files["manifest.json"] = json.dumps(manifest, indent=2).encode("utf-8")

    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"rob_package_{project_id}_{timestamp}.zip"
    from services.storage_manager import save_stage_file
    rel_path, abs_path = save_stage_file(project_id, "04_ROB", filename, stream.getvalue())
    return str(abs_path)
