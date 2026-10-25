"""Canonical 8-Sheet SRMA Data Extraction Workbook Generator.

Generates the canonical 8-sheet Excel workbook defined in the SRMA Data Extraction Sheet
Maker specification:
  1. Codebook: Instructions, StudyID convention, missing data codes, outcome definitions
  2. Study_Metadata: Per-study trial metadata, total N, N per arm, enrolment, follow-up
  3. Baseline_PerArm: One row per arm (N, Age, Female %, baseline covariates)
  4. Intervention_Detail: Selection algorithm, dosing, co-interventions, switch allowed
  5. Arm_Composition: Agent/technique breakdown per arm
  6. Outcomes_EventCounts: Dichotomous event counts and denominators per arm/outcome
  7. TimeToEvent_KM: Survival endpoints, HR, 95% CI, log(HR), SE
  8. RiskOfBias: Signaling questions, domain judgments, overall RoB

Color-coded missing-data coding:
  -99 Not reported (exhaustive search completed) -> FFD700 (yellow)
  -77 Not applicable                             -> D3D3D3 (grey)
  -88 Unable to extract (figure-only / garbled)  -> FFA500 (orange)
  (conflict) Discrepant values between extractors-> FF6666 (light red)
"""
from __future__ import annotations
import io
import json
import logging
from typing import Any, Optional
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

logger = logging.getLogger("radextract.srma_sheet_generator")

# Visual Styling
FONT_HEADER = Font(name="Calibri", size=11, bold=True, color="1F2937")
FONT_TITLE = Font(name="Calibri", size=14, bold=True, color="111827")
FONT_SECTION = Font(name="Calibri", size=12, bold=True, color="374151")
FONT_DATA = Font(name="Calibri", size=10, color="000000")
FONT_CODE = Font(name="Consolas", size=10, bold=True)

FILL_HEADER = PatternFill("solid", fgColor="E5E7EB")
FILL_HEADER_ACCENT = PatternFill("solid", fgColor="DDD6FE")  # Light indigo/purple
FILL_MINUS_99 = PatternFill("solid", fgColor="FFD700")       # Yellow
FILL_MINUS_77 = PatternFill("solid", fgColor="D3D3D3")       # Grey
FILL_MINUS_88 = PatternFill("solid", fgColor="FFA500")       # Orange
FILL_CONFLICT = PatternFill("solid", fgColor="FF6666")       # Light red

BORDER_THIN = Border(
    left=Side(style="thin", color="D1D5DB"),
    right=Side(style="thin", color="D1D5DB"),
    top=Side(style="thin", color="D1D5DB"),
    bottom=Side(style="thin", color="D1D5DB"),
)


def _apply_missing_code_style(cell):
    val = str(cell.value or "").strip()
    if val == "-99":
        cell.fill = FILL_MINUS_99
        cell.font = FONT_CODE
    elif val == "-77":
        cell.fill = FILL_MINUS_77
        cell.font = FONT_CODE
    elif val == "-88":
        cell.fill = FILL_MINUS_88
        cell.font = FONT_CODE
    elif "conflict" in val.lower():
        cell.fill = FILL_CONFLICT
        cell.font = FONT_CODE


def _autofit_columns(ws, min_width=12, max_width=50):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val = str(cell.value or "")
            if "\n" in val:
                val = max(val.split("\n"), key=len)
            max_len = max(max_len, len(val))
        ws.column_dimensions[col_letter].width = max(min_width, min(max_len + 3, max_width))


def generate_srma_extraction_workbook(project_id: str, db: Any) -> bytes:
    """Generate a canonical 8-sheet SRMA data extraction workbook for a systematic review project."""
    # 1. Fetch project PICO & metadata
    project_row = db.get("projects", project_id) if hasattr(db, "get") else None
    if not project_row and hasattr(db, "execute"):
        r = db.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        project_row = dict(r) if r else {}

    proj_name = project_row.get("name") or "Systematic Review"
    pico = {}
    if project_row.get("pico_json"):
        try:
            pico = json.loads(project_row["pico_json"])
        except Exception:
            pico = {}

    pop = pico.get("population") or "Target Clinical Population"
    intv = pico.get("intervention") or pico.get("index_test") or "Intervention"
    comp = pico.get("comparator") or "Comparator / Control"
    outcomes = pico.get("outcome") or pico.get("outcomes") or "Primary & Secondary Clinical Outcomes"

    # Arms labels
    arm1_label = (intv[:20] if len(intv) > 20 else intv).replace("/", "_").strip() or "Intervention"
    arm2_label = (comp[:20] if len(comp) > 20 else comp).replace("/", "_").strip() or "Control"

    # 2. Fetch included studies
    if hasattr(db, "query"):
        studies = db.query("studies", {"project_id": project_id})
    else:
        rows = db.execute("SELECT * FROM studies WHERE project_id = ? ORDER BY created_at ASC", (project_id,)).fetchall()
        studies = [dict(r) for r in rows]

    # Filter to included studies (or all if none yet screened)
    included_studies = [s for s in studies if s.get("screening_status") in ("included", "ta_included")]
    active_studies = included_studies if included_studies else studies

    # 3. Create Workbook
    wb = Workbook()
    wb.remove(wb.active)  # Remove default blank sheet

    # ─────────────────────────────────────────────────────────────
    # SHEET 1: Codebook
    # ─────────────────────────────────────────────────────────────
    ws_cb = wb.create_sheet(title="Codebook")
    ws_cb.views.sheetView[0].showGridLines = True

    cb_content = [
        ("Data Extraction Codebook — " + proj_name, FONT_TITLE),
        ("", None),
        ("INSTRUCTIONS", FONT_SECTION),
        ("1. StudyID Convention: FirstAuthor_Year (e.g. Smith_2024). Substudies append suffix '_SUB' (e.g. Smith_2024_SUB).", FONT_DATA),
        ("2. Row Structure: Study_Metadata, Intervention_Detail, and Outcomes sheets are one row per study. Baseline_PerArm and Arm_Composition are one row per arm.", FONT_DATA),
        ("3. Standard Missing-Data Codes: -99 = Not reported after exhaustive search; -77 = Not applicable; -88 = Unable to extract.", FONT_DATA),
        ("4. Confidence / Source Tags in Notes column: [DS] Directly stated | [INF] Inferred | [CALC] Calculated | [SUP] Supplementary | [FIG] Extracted from plot.", FONT_DATA),
        ("", None),
        ("PICO ELIGIBILITY SCOPE", FONT_SECTION),
        (f"• Population: {pop}", FONT_DATA),
        (f"• Intervention Arm (Arm 1): {intv}", FONT_DATA),
        (f"• Comparator Arm (Arm 2): {comp}", FONT_DATA),
        (f"• Primary & Secondary Outcomes: {outcomes}", FONT_DATA),
        ("", None),
        ("MISSING DATA CODES & FORMATTING", FONT_SECTION),
        ("-99: Cell highlighted Yellow (FFD700) — Confirmed missing after checking all text, tables, figures, and online supplementary appendix.", FONT_DATA),
        ("-77: Cell highlighted Grey (D3D3D3) — Not applicable by trial design (e.g. crossover details in a parallel trial).", FONT_DATA),
        ("-88: Cell highlighted Orange (FFA500) — Figure-only curve, low resolution, or unresolvable illegibility.", FONT_DATA),
        ("(conflict): Cell highlighted Light Red (FF6666) — Two independent extractors disagree; pending consensus.", FONT_DATA),
    ]

    for row_idx, (text, font) in enumerate(cb_content, start=1):
        cell = ws_cb.cell(row=row_idx, column=1, value=text)
        if font:
            cell.font = font
    ws_cb.column_dimensions["A"].width = 110

    # ─────────────────────────────────────────────────────────────
    # SHEET 2: Study_Metadata
    # ─────────────────────────────────────────────────────────────
    ws_meta = wb.create_sheet(title="Study_Metadata")
    ws_meta.views.sheetView[0].showGridLines = True

    meta_headers = [
        "StudyID", "FirstAuthor", "Year", "Trial_Acronym", "Country_Region",
        "Design", "Publication_Status", "Industry_Sponsored", "Funding_Source",
        "Total_N", f"N_{arm1_label}_Arm", f"N_{arm2_label}_Arm",
        "Enrolment_Year_Start", "Enrolment_Year_End", "Median_FollowUp_Months",
        "FollowUp_Range", "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(meta_headers, start=1):
        c = ws_meta.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for r_idx, s in enumerate(active_studies, start=2):
        sid = _make_study_id(s)
        ws_meta.cell(row=r_idx, column=1, value=sid)
        ws_meta.cell(row=r_idx, column=2, value=s.get("authors", "").split(",")[0].strip() or s.get("authors", ""))
        ws_meta.cell(row=r_idx, column=3, value=s.get("publication_year") or "")
        ws_meta.cell(row=r_idx, column=4, value="")
        ws_meta.cell(row=r_idx, column=5, value="")
        ws_meta.cell(row=r_idx, column=6, value=s.get("study_design") or "RCT")
        ws_meta.cell(row=r_idx, column=7, value="Full-Text Publication")
        ws_meta.cell(row=r_idx, column=8, value="")
        ws_meta.cell(row=r_idx, column=9, value="")
        ws_meta.cell(row=r_idx, column=10, value="")
        ws_meta.cell(row=r_idx, column=11, value="")
        ws_meta.cell(row=r_idx, column=12, value="")
        ws_meta.cell(row=r_idx, column=13, value="")
        ws_meta.cell(row=r_idx, column=14, value="")
        ws_meta.cell(row=r_idx, column=15, value="")
        ws_meta.cell(row=r_idx, column=16, value="")
        ws_meta.cell(row=r_idx, column=17, value="")
    _autofit_columns(ws_meta)

    # ─────────────────────────────────────────────────────────────
    # SHEET 3: Baseline_PerArm
    # ─────────────────────────────────────────────────────────────
    ws_base = wb.create_sheet(title="Baseline_PerArm")
    ws_base.views.sheetView[0].showGridLines = True

    base_headers = [
        "StudyID", "Arm", "N", "Mean_Age", "SD_Age", "Median_Age", "IQR_Age",
        "Pct_Female", "Hypertension_Pct", "Diabetes_Pct", "Smoking_Pct",
        "Prior_Stroke_TIA_Pct", "Baseline_Score_Mean", "Baseline_Score_SD", "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(base_headers, start=1):
        c = ws_base.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    curr_row = 2
    for s in active_studies:
        sid = _make_study_id(s)
        # Arm 1
        ws_base.cell(row=curr_row, column=1, value=sid)
        ws_base.cell(row=curr_row, column=2, value=arm1_label)
        curr_row += 1
        # Arm 2
        ws_base.cell(row=curr_row, column=1, value=sid)
        ws_base.cell(row=curr_row, column=2, value=arm2_label)
        curr_row += 1
    _autofit_columns(ws_base)

    # ─────────────────────────────────────────────────────────────
    # SHEET 4: Intervention_Detail
    # ─────────────────────────────────────────────────────────────
    ws_intv = wb.create_sheet(title="Intervention_Detail")
    ws_intv.views.sheetView[0].showGridLines = True

    intv_headers = [
        "StudyID", f"{arm1_label}_Dose_Regimen", f"{arm1_label}_Delivery_Route",
        f"{arm1_label}_Treatment_Duration", f"{arm2_label}_Control_Type",
        f"{arm2_label}_Delivery_Route", "Allowed_Concomitant_Medications",
        "Prohibited_Co_Interventions", "CrossOver_Permitted", "Pct_CrossOver",
        "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(intv_headers, start=1):
        c = ws_intv.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for r_idx, s in enumerate(active_studies, start=2):
        sid = _make_study_id(s)
        ws_intv.cell(row=r_idx, column=1, value=sid)
    _autofit_columns(ws_intv)

    # ─────────────────────────────────────────────────────────────
    # SHEET 5: Arm_Composition
    # ─────────────────────────────────────────────────────────────
    composition_title = f"{arm1_label}_{arm2_label}_Composition"[:31]
    ws_comp = wb.create_sheet(title=composition_title)
    ws_comp.views.sheetView[0].showGridLines = True

    comp_headers = [
        "StudyID", "Arm", "N_Assigned", "N_Analyzed", "Primary_Agent_or_Technique",
        "Secondary_Agent", "Dose_Adjustment_Permitted", "Adherence_Rate_Pct", "Discontinuation_Pct", "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(comp_headers, start=1):
        c = ws_comp.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    curr_row = 2
    for s in active_studies:
        sid = _make_study_id(s)
        ws_comp.cell(row=curr_row, column=1, value=sid)
        ws_comp.cell(row=curr_row, column=2, value=arm1_label)
        curr_row += 1
        ws_comp.cell(row=curr_row, column=1, value=sid)
        ws_comp.cell(row=curr_row, column=2, value=arm2_label)
        curr_row += 1
    _autofit_columns(ws_comp)

    # ─────────────────────────────────────────────────────────────
    # SHEET 6: Outcomes_EventCounts
    # ─────────────────────────────────────────────────────────────
    ws_out = wb.create_sheet(title="Outcomes_EventCounts")
    ws_out.views.sheetView[0].showGridLines = True

    out_headers = [
        "StudyID", "Outcome_Name", "Timepoint_Months",
        f"Events_{arm1_label}", f"Total_{arm1_label}",
        f"Events_{arm2_label}", f"Total_{arm2_label}",
        "Effect_Measure_Reported", "Reported_Point_Estimate", "Reported_95CI_Lower",
        "Reported_95CI_Upper", "P_Value", "Analysis_Population (ITT_vs_PerProtocol)", "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(out_headers, start=1):
        c = ws_out.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for r_idx, s in enumerate(active_studies, start=2):
        sid = _make_study_id(s)
        ws_out.cell(row=r_idx, column=1, value=sid)
        ws_out.cell(row=r_idx, column=2, value="Primary Clinical Endpoint")
    _autofit_columns(ws_out)

    # ─────────────────────────────────────────────────────────────
    # SHEET 7: TimeToEvent_KM
    # ─────────────────────────────────────────────────────────────
    ws_km = wb.create_sheet(title="TimeToEvent_KM")
    ws_km.views.sheetView[0].showGridLines = True

    km_headers = [
        "StudyID", "Endpoint_Name", "Hazard_Ratio", "HR_95CI_Lower", "HR_95CI_Upper",
        "Log_HR", "SE_Log_HR", "P_Value_LogRank", "KM_Median_Survival_Arm1_Mo",
        "KM_Median_Survival_Arm2_Mo", "Digitized_KM_Curve_Available", "Notes_and_Citations"
    ]
    for col_idx, h in enumerate(km_headers, start=1):
        c = ws_km.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for r_idx, s in enumerate(active_studies, start=2):
        sid = _make_study_id(s)
        ws_km.cell(row=r_idx, column=1, value=sid)
    _autofit_columns(ws_km)

    # ─────────────────────────────────────────────────────────────
    # SHEET 8: RiskOfBias
    # ─────────────────────────────────────────────────────────────
    ws_rob = wb.create_sheet(title="RiskOfBias")
    ws_rob.views.sheetView[0].showGridLines = True

    rob_headers = [
        "StudyID", "Tool_Used", "Domain_1 (Randomisation)", "Domain_2 (Deviations)",
        "Domain_3 (Missing_Outcome_Data)", "Domain_4 (Measurement)", "Domain_5 (Selective_Reporting)",
        "Overall_Risk_of_Bias", "Adjudication_Status", "Reviewer_1_Notes", "Reviewer_2_Notes"
    ]
    for col_idx, h in enumerate(rob_headers, start=1):
        c = ws_rob.cell(row=1, column=col_idx, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for r_idx, s in enumerate(active_studies, start=2):
        sid = _make_study_id(s)
        ws_rob.cell(row=r_idx, column=1, value=sid)
        ws_rob.cell(row=r_idx, column=2, value="RoB 2 (RCTs)")
    _autofit_columns(ws_rob)

    # 4. Save to buffer
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_study_id(study: dict[str, Any]) -> str:
    authors = (study.get("authors") or "").strip()
    first_author = authors.split(",")[0].split(" ")[0].strip() or "Study"
    year = study.get("publication_year") or ""
    if year:
        return f"{first_author}_{year}"
    return first_author
