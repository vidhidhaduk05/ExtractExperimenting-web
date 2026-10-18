"""
generate_base_codebook.py — create the radiology base codebook workbook.

Produces codebook.xlsx with:
  - Codebook sheet: all fields with metadata (9 columns)
  - 5 data sheets: headers (row 1) + instruction row (row 2) + empty data rows
  - Data validation dropdowns for controlled-vocabulary fields

Codebook column layout (1-indexed):
  1 Worksheet | 2 Column Order | 3 Final Column Name | 4 Why |
  5 What to enter | 6 Expected Format | 7 Allowed/Standardized Entries |
  8 Required? | 9 Notes
"""
from __future__ import annotations
import os
import sys

import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation


# --------------------------------------------------------------------------- #
# Field definitions: (sheet, order, name, why, what_to_enter, format,
#                      allowed_entries, required, notes)
# --------------------------------------------------------------------------- #

FIELDS = [
    # ==================== Study_Level (15) ====================
    ("Study_Level", 1, "Study ID", "Unique key linking the same study across all tabs",
     "One stable unique identifier for the included paper (e.g., Author2024 or PMID)",
     "Text", "Unique free text", "Required",
     "Use exactly the same Study ID in all worksheets"),
    ("Study_Level", 2, "First Author", "Basic study identification",
     "Surname of the first listed author", "Text", "Unique free text", "Required",
     "Use only the surname unless disambiguation is needed"),
    ("Study_Level", 3, "Publication Year", "Basic study identification",
     "Year the paper was published", "Integer", "4-digit year", "Required",
     "Use the main publication year shown in the article"),
    ("Study_Level", 4, "Journal", "Basic study identification",
     "Journal name as published", "Text", "Unique free text", "Required", ""),
    ("Study_Level", 5, "DOI", "Linking and retrieval",
     "Digital Object Identifier", "Text", "Unique free text", "Conditional", ""),
    ("Study_Level", 6, "PMID", "Linking and retrieval",
     "PubMed Unique Identifier", "Text", "Unique free text", "Conditional", ""),
    ("Study_Level", 7, "Country", "Study context",
     "Country or countries where the study was conducted", "Text", "Unique free text", "Required",
     "Keep concise. Use NR if not reported"),
    ("Study_Level", 8, "Study Design", "Captures the design actually used",
     "The study design label that best fits the article", "Category",
     "RCT; prospective_cohort; retrospective_cohort; cross_sectional; case_control; diagnostic_accuracy; case_series; other; NR",
     "Required", "Choose the most defensible reported design"),
    ("Study_Level", 9, "Study Setting", "Study context",
     "Single-center or multicenter", "Category", "single_center; multicenter; NR", "Required", ""),
    ("Study_Level", 10, "N Centers", "Study context",
     "Number of centers if multicenter", "Integer", "0-100", "Conditional",
     "Required if Study Setting is multicenter"),
    ("Study_Level", 11, "Enrollment Period", "Study context",
     "Date range of patient enrollment as reported", "Text", "Unique free text", "Conditional", ""),
    ("Study_Level", 12, "Funding Source", "Potential conflicts of interest",
     "Funding sources as reported", "Text", "Unique free text", "Conditional", ""),
    ("Study_Level", 13, "Conflict of Interest", "Potential conflicts of interest",
     "Whether authors declared a conflict of interest", "Category",
     "none_declared; declared; unclear; NR", "Required", ""),
    ("Study_Level", 14, "Registration", "Study registration",
     "Whether the study was registered in a public registry", "Category",
     "PROSPERO; ClinicalTrials_gov; none; NR", "Required", ""),
    ("Study_Level", 15, "Registration ID", "Study registration",
     "Registration number if registered", "Text", "Unique free text", "Conditional",
     "Required if Registration is not 'none'"),

    # ==================== Cohort_Level (16) ====================
    ("Cohort_Level", 1, "Study ID", "FK to Study_Level",
     "Same Study ID as in Study_Level", "Text", "Unique free text", "Required",
     "Must match a Study ID in Study_Level"),
    ("Cohort_Level", 2, "Cohort ID", "Unique key within study",
     "Unique identifier for this cohort/group within the study", "Text", "Unique free text", "Required", ""),
    ("Cohort_Level", 3, "Cohort Role", "Distinguishes groups within a study",
     "Role of this cohort in the study", "Category",
     "overall; disease; control; comparator; subgroup; not_separable; NR", "Required", ""),
    ("Cohort_Level", 4, "Disease/Condition", "What disease/condition is being studied",
     "Standardized disease name", "Text", "Unique free text", "Required", ""),
    ("Cohort_Level", 5, "Sample Size (Enrolled)", "Cohort size",
     "Number of subjects enrolled in this cohort", "Integer", "1-100000", "Required", ""),
    ("Cohort_Level", 6, "N Analyzed", "May differ from enrolled",
     "Number of subjects actually analyzed", "Integer", "0-100000", "Conditional", ""),
    ("Cohort_Level", 7, "Age Group", "Population characterization",
     "Age group of the cohort", "Category", "pediatric; adult; mixed; unclear", "Required", ""),
    ("Cohort_Level", 8, "Age, Central Value (years)", "Population characterization",
     "Mean or median age as reported", "Number", "0-120", "Conditional",
     "Use 0.1 tolerance"),
    ("Cohort_Level", 9, "Age, Dispersion Type", "Population characterization",
     "Type of dispersion reported for age", "Category",
     "SD; SE; IQR; range; none; NR", "Conditional", ""),
    ("Cohort_Level", 10, "Age, Dispersion Value", "Population characterization",
     "Value of the dispersion measure", "Number", "0-100", "Conditional", ""),
    ("Cohort_Level", 11, "Female (%)", "Population characterization",
     "Percentage of female subjects", "Percentage", "0-100", "Conditional", ""),
    ("Cohort_Level", 12, "Race/Ethnicity", "Population characterization",
     "Race/ethnicity distribution as reported", "Text", "Unique free text", "Conditional", ""),
    ("Cohort_Level", 13, "Clinical Indication", "Why imaging was performed",
     "Clinical indication for the imaging study", "Text", "Unique free text", "Required", ""),
    ("Cohort_Level", 14, "Inclusion Criteria", "Eligibility",
     "Inclusion criteria as reported", "Text", "Unique free text", "Conditional", ""),
    ("Cohort_Level", 15, "Exclusion Criteria", "Eligibility",
     "Exclusion criteria as reported", "Text", "Unique free text", "Conditional", ""),
    ("Cohort_Level", 16, "Comorbidities", "Population characterization",
     "Relevant comorbidities as reported", "Text", "Unique free text", "Conditional", ""),

    # ==================== Protocol_Level (24) ====================
    ("Protocol_Level", 1, "Cohort ID", "FK to Cohort_Level",
     "Same Cohort ID as in Cohort_Level", "Text", "Unique free text", "Required",
     "Must match a Cohort ID in Cohort_Level"),
    ("Protocol_Level", 2, "Protocol ID", "Unique key within cohort",
     "Unique identifier for this imaging protocol", "Text", "Unique free text", "Required", ""),
    ("Protocol_Level", 3, "Modality", "Imaging modality",
     "Imaging modality used", "Category",
     "CT; MRI; X-ray; US; PET; PET-CT; SPECT; DSA; mammography; fluoroscopy; other; NR",
     "Required", ""),
    ("Protocol_Level", 4, "Scanner Manufacturer", "Equipment characterization",
     "Scanner manufacturer as reported", "Text", "Unique free text", "Conditional", ""),
    ("Protocol_Level", 5, "Scanner Model", "Equipment characterization",
     "Scanner model as reported", "Text", "Unique free text", "Conditional", ""),
    ("Protocol_Level", 6, "Field Strength (T)", "MRI acquisition parameter",
     "Magnetic field strength in Tesla", "Category", "1.0; 1.5; 3.0; 7.0; other; NR", "Conditional",
     "Required if Modality is MRI"),
    ("Protocol_Level", 7, "kVp", "CT acquisition parameter",
     "Peak kilovoltage for CT", "Integer", "60-150", "Conditional",
     "Required if Modality is CT"),
    ("Protocol_Level", 8, "mAs", "CT acquisition parameter",
     "Milliampere-seconds for CT", "Number", "0-1000", "Conditional", ""),
    ("Protocol_Level", 9, "Contrast Agent", "Contrast information",
     "Type of contrast agent used", "Category",
     "none; iodinated; gadolinium; barium; other; NR", "Required", ""),
    ("Protocol_Level", 10, "Contrast Dose", "Contrast information",
     "Contrast dose as reported", "Text", "Unique free text", "Conditional",
     "Required if Contrast Agent is not 'none'"),
    ("Protocol_Level", 11, "Contrast Route", "Contrast information",
     "Route of contrast administration", "Category",
     "IV; oral; rectal; intra-articular; other; NR", "Conditional", ""),
    ("Protocol_Level", 12, "Acquisition Phase", "Imaging protocol detail",
     "Phase of image acquisition", "Category",
     "pre_contrast; arterial; venous; portal; delayed; non_contrast; NR", "Conditional", ""),
    ("Protocol_Level", 13, "TR (ms)", "MRI acquisition parameter",
     "Repetition time in milliseconds", "Number", "0-20000", "Conditional", "MRI only"),
    ("Protocol_Level", 14, "TE (ms)", "MRI acquisition parameter",
     "Echo time in milliseconds", "Number", "0-500", "Conditional", "MRI only"),
    ("Protocol_Level", 15, "Flip Angle (degrees)", "MRI acquisition parameter",
     "Flip angle in degrees", "Number", "0-180", "Conditional", "MRI only"),
    ("Protocol_Level", 16, "Sequence Type", "MRI acquisition parameter",
     "MRI sequence type", "Category",
     "T1; T2; FLAIR; DWI; DTI; SWI; GRE; T2*; MPRAGE; SSFP; other; NR", "Conditional", "MRI only"),
    ("Protocol_Level", 17, "Voxel Size", "Spatial resolution",
     "Voxel dimensions as reported", "Text", "Unique free text", "Conditional", ""),
    ("Protocol_Level", 18, "Slice Thickness (mm)", "Spatial resolution",
     "Slice thickness in millimeters", "Number", "0-20", "Conditional", ""),
    ("Protocol_Level", 19, "Matrix Size", "Spatial resolution",
     "Matrix dimensions as reported", "Text", "Unique free text", "Conditional", ""),
    ("Protocol_Level", 20, "FOV", "Spatial coverage",
     "Field of view as reported", "Text", "Unique free text", "Conditional", ""),
    ("Protocol_Level", 21, "Reconstruction Algorithm", "CT reconstruction",
     "Image reconstruction algorithm", "Category",
     "FBP; iterative; AI-based; other; NR", "Conditional", "CT only"),
    ("Protocol_Level", 22, "CTDIvol (mGy)", "CT dose",
     "CT dose index volume", "Number", "0-200", "Conditional", "CT only"),
    ("Protocol_Level", 23, "DLP (mGy·cm)", "CT dose",
     "Dose-length product", "Number", "0-5000", "Conditional", "CT only"),
    ("Protocol_Level", 24, "Scan Duration (s)", "Acquisition time",
     "Total scan duration in seconds", "Number", "0-3600", "Conditional", ""),

    # ==================== Outcome_Level (26) ====================
    ("Outcome_Level", 1, "Protocol ID", "FK to Protocol_Level",
     "Same Protocol ID as in Protocol_Level", "Text", "Unique free text", "Required",
     "Must match a Protocol ID in Protocol_Level"),
    ("Outcome_Level", 2, "Outcome ID", "Unique key within protocol",
     "Unique identifier for this outcome", "Text", "Unique free text", "Required", ""),
    ("Outcome_Level", 3, "Result Type", "Type of result reported",
     "Category of result", "Category",
     "diagnostic_accuracy; quantitative_measurement; inter_reader_agreement; feasibility; treatment_response; other",
     "Required", ""),
    ("Outcome_Level", 4, "Specific Outcome Label", "Human-readable metric name",
     "Name of the specific metric being reported", "Text", "Unique free text", "Required", ""),
    ("Outcome_Level", 5, "Reference Standard", "What the index test is compared against",
     "Reference standard used for comparison", "Category",
     "histopathology; surgical_findings; follow_up_imaging; clinical_outcome; consensus_reading; composite; other; NR",
     "Required", ""),
    ("Outcome_Level", 6, "Reference Standard Details", "Reference standard detail",
     "Details of the reference standard", "Text", "Unique free text", "Conditional", ""),
    ("Outcome_Level", 7, "ROI/Region Category", "What region is being measured",
     "Category of region of interest", "Category",
     "whole_organ; lesion; vascular_territory; voxelwise; multi_region; other; NA", "Required", ""),
    ("Outcome_Level", 8, "N Analyzed", "Sample size for this outcome",
     "Number of subjects/observations analyzed for this outcome", "Integer", "0-100000", "Required", ""),
    ("Outcome_Level", 9, "Sensitivity (%)", "Diagnostic accuracy metric",
     "Sensitivity percentage", "Percentage", "0-100", "Conditional",
     "Required if Result Type is diagnostic_accuracy"),
    ("Outcome_Level", 10, "Specificity (%)", "Diagnostic accuracy metric",
     "Specificity percentage", "Percentage", "0-100", "Conditional",
     "Required if Result Type is diagnostic_accuracy"),
    ("Outcome_Level", 11, "PPV (%)", "Diagnostic accuracy metric",
     "Positive predictive value percentage", "Percentage", "0-100", "Conditional", ""),
    ("Outcome_Level", 12, "NPV (%)", "Diagnostic accuracy metric",
     "Negative predictive value percentage", "Percentage", "0-100", "Conditional", ""),
    ("Outcome_Level", 13, "AUC", "Diagnostic accuracy metric",
     "Area under the ROC curve", "Number", "0-1", "Conditional", ""),
    ("Outcome_Level", 14, "AUC 95CI Lower", "AUC confidence interval",
     "Lower bound of AUC 95% CI", "Number", "0-1", "Conditional", ""),
    ("Outcome_Level", 15, "AUC 95CI Upper", "AUC confidence interval",
     "Upper bound of AUC 95% CI", "Number", "0-1", "Conditional", ""),
    ("Outcome_Level", 16, "Central Estimate", "Quantitative measurement",
     "Central value for quantitative measurements", "Number", "0-1000000", "Conditional", ""),
    ("Outcome_Level", 17, "Dispersion Type", "Quantitative measurement",
     "Type of dispersion reported", "Category",
     "SD; SE; IQR; 95CI; range; none; NR", "Conditional", ""),
    ("Outcome_Level", 18, "Dispersion Value", "Quantitative measurement",
     "Value of the dispersion measure", "Number", "0-1000000", "Conditional", ""),
    ("Outcome_Level", 19, "Unit (as reported)", "Preserve original wording",
     "Unit as reported in the paper", "Text", "Unique free text", "Required", ""),
    ("Outcome_Level", 20, "Standardized Unit Family", "Cross-study comparison",
     "Standardized unit category", "Category",
     "hounsfield_unit; millimeter; millimeter_squared; millimeter_cubed; percent; ratio; signal_intensity; other; NA",
     "Required", ""),
    ("Outcome_Level", 21, "Statistical Test", "Statistical analysis",
     "Statistical test used", "Category",
     "t_test; mann_whitney; chi_square; fisher_exact; anova; kruskal_wallis; regression; de_long; other; NR",
     "Conditional", ""),
    ("Outcome_Level", 22, "P-value", "Statistical significance",
     "P-value as reported", "Text", "Unique free text", "Conditional", ""),
    ("Outcome_Level", 23, "Agreement Metric", "Inter-reader agreement",
     "Type of agreement metric", "Category",
     "cohen_kappa; ICC; concordance_correlation; other; NA", "Conditional",
     "Required if Result Type is inter_reader_agreement"),
    ("Outcome_Level", 24, "Agreement Value", "Inter-reader agreement",
     "Value of the agreement metric", "Number", "0-1", "Conditional", ""),
    ("Outcome_Level", 25, "N Readers", "Inter-reader agreement",
     "Number of readers", "Integer", "2-20", "Conditional",
     "Should be >= 2 if agreement metric populated"),
    ("Outcome_Level", 26, "Reader Blinding", "Inter-reader agreement",
     "Blinding status of readers", "Category",
     "fully_blinded; partially_blinded; unblinded; NR", "Conditional", ""),

    # ==================== Quality_Assessment (shared QUADAS-2 / ROBINS-I) ====================
    ("Quality_Assessment", 1, "Study ID", "FK to Study_Level",
     "Same Study ID as in Study_Level", "Text", "Unique free text", "Required",
     "Must match a Study ID in Study_Level"),
    ("Quality_Assessment", 2, "QA ID", "Unique key within study",
     "Unique identifier for this quality assessment", "Text", "Unique free text", "Required", ""),
    ("Quality_Assessment", 3, "Assessment Tool", "Which tool was used",
     "Quality assessment tool applied", "Category", "QUADAS_2; ROBINS_I", "Required", ""),
    # QUADAS-2 domains
    ("Quality_Assessment", 4, "D1: Patient Selection — Risk of Bias", "QUADAS-2 domain 1",
     "Risk of bias for patient selection", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 5, "D1: Patient Selection — Applicability", "QUADAS-2 domain 1",
     "Applicability concern for patient selection", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 6, "D2: Index Test — Risk of Bias", "QUADAS-2 domain 2",
     "Risk of bias for index test", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 7, "D2: Index Test — Applicability", "QUADAS-2 domain 2",
     "Applicability concern for index test", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 8, "D3: Reference Standard — Risk of Bias", "QUADAS-2 domain 3",
     "Risk of bias for reference standard", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 9, "D3: Reference Standard — Applicability", "QUADAS-2 domain 3",
     "Applicability concern for reference standard", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 10, "D4: Flow and Timing — Risk of Bias", "QUADAS-2 domain 4",
     "Risk of bias for flow and timing", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    ("Quality_Assessment", 11, "Overall Risk of Bias", "Overall assessment",
     "Overall risk of bias judgment", "Category", "low; high; unclear; low; moderate; serious; critical; no_information",
     "Conditional", "Required for both QUADAS-2 and ROBINS-I"),
    ("Quality_Assessment", 12, "Overall Applicability", "Overall assessment",
     "Overall applicability concern", "Category", "low; high; unclear", "Conditional",
     "Required if Assessment Tool is QUADAS_2"),
    # ROBINS-I domains
    ("Quality_Assessment", 13, "D1: Confounding", "ROBINS-I domain 1",
     "Risk of bias due to confounding", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 14, "D2: Selection of Participants", "ROBINS-I domain 2",
     "Risk of bias in selection of participants", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 15, "D3: Classification of Interventions", "ROBINS-I domain 3",
     "Risk of bias in classification of interventions", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 16, "D4: Deviations from Interventions", "ROBINS-I domain 4",
     "Risk of bias due to deviations from interventions", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 17, "D5: Missing Data", "ROBINS-I domain 5",
     "Risk of bias due to missing data", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 18, "D6: Measurement of Outcomes", "ROBINS-I domain 6",
     "Risk of bias in measurement of outcomes", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    ("Quality_Assessment", 19, "D7: Selection of Reported Result", "ROBINS-I domain 7",
     "Risk of bias in selection of reported result", "Category",
     "low; moderate; serious; critical; no_information", "Conditional",
     "Required if Assessment Tool is ROBINS_I"),
    # Support for judgment
    ("Quality_Assessment", 20, "D1 Support for Judgment", "Supporting text",
     "Text supporting the D1 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 21, "D2 Support for Judgment", "Supporting text",
     "Text supporting the D2 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 22, "D3 Support for Judgment", "Supporting text",
     "Text supporting the D3 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 23, "D4 Support for Judgment", "Supporting text",
     "Text supporting the D4 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 24, "D5 Support for Judgment", "Supporting text",
     "Text supporting the D5 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 25, "D6 Support for Judgment", "Supporting text",
     "Text supporting the D6 judgment", "Text", "Unique free text", "Conditional", ""),
    ("Quality_Assessment", 26, "D7 Support for Judgment", "Supporting text",
     "Text supporting the D7 judgment", "Text", "Unique free text", "Conditional", ""),
]


# --------------------------------------------------------------------------- #
# Instruction row (row 2) for each data sheet
# --------------------------------------------------------------------------- #
INSTRUCTION_ROW = "Enter data below. Use NR for not reported, NA for not applicable. Controlled-vocab fields must match dropdown values exactly."


def generate_codebook(output_path: str):
    """Generate the radiology base codebook workbook."""
    wb = openpyxl.Workbook()

    # --- Codebook sheet ---
    cb = wb.active
    cb.title = "Codebook"
    headers = ["Worksheet", "Column Order", "Final Column Name", "Why",
               "What to enter", "Expected Format", "Allowed/Standardized Entries",
               "Required?", "Notes"]
    for c, h in enumerate(headers, 1):
        cb.cell(1, c, h)

    for r, field in enumerate(FIELDS, 2):
        for c, val in enumerate(field, 1):
            cb.cell(r, c, val)

    # --- Data sheets ---
    data_sheets = ["Study_Level", "Cohort_Level", "Protocol_Level",
                   "Outcome_Level", "Quality_Assessment"]

    # Group fields by sheet
    by_sheet = {}
    for f in FIELDS:
        by_sheet.setdefault(f[0], []).append(f)

    for sheet_name in data_sheets:
        ws = wb.create_sheet(sheet_name)
        sheet_fields = by_sheet.get(sheet_name, [])

        # Row 1: headers (field names in column order)
        for col, f in enumerate(sheet_fields, 1):
            ws.cell(1, col, f[2])  # Final Column Name

        # Row 2: instruction
        ws.cell(2, 1, INSTRUCTION_ROW)

        # Data validation dropdowns for controlled-vocab fields
        for col, f in enumerate(sheet_fields, 1):
            allowed = f[6]  # Allowed/Standardized Entries
            if allowed and allowed != "Unique free text":
                # Create dropdown from the allowed values
                values = [v.strip() for v in allowed.split(";") if v.strip()]
                # openpyxl data validation formula has a 255-char limit
                formula = '"' + ",".join(values) + '"'
                if len(formula) <= 255:
                    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
                    dv.add(f"{openpyxl.utils.get_column_letter(col)}3:{openpyxl.utils.get_column_letter(col)}1000")
                    ws.add_data_validation(dv)

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    wb.close()

    # Report
    total = len(FIELDS)
    by_count = {s: len(by_sheet.get(s, [])) for s in data_sheets}
    print(f"Generated {output_path}")
    print(f"  Total fields: {total}")
    for s, n in by_count.items():
        print(f"  {s}: {n} fields")
    return total


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "/workspace/radextract/configs/radiology_base/codebook.xlsx"
    generate_codebook(output)
