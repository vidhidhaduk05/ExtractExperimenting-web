"""
generate_base_prompts.py — create the radiology base prompts JSON.

Produces base_prompts.json with per-field extraction prompts including
navigation hints for Graphify-aware extraction.
"""
from __future__ import annotations
import json
import os
import sys

# Reuse the FIELDS list from generate_base_codebook
sys.path.insert(0, os.path.dirname(__file__))
from generate_base_codebook import FIELDS


# Navigation hints: where in a radiology paper each field is typically found
NAV_HINTS = {
    "Study_Level": {
        "Study ID": "Assign based on citation (e.g., Author2024)",
        "First Author": "Title page or header",
        "Publication Year": "Title page or header",
        "Journal": "Title page or header",
        "DOI": "Title page or footer",
        "PMID": "Not in paper; assign from PubMed metadata",
        "Country": "Methods: Study Setting or Affiliations",
        "Study Design": "Abstract or Methods: Study Design",
        "Study Setting": "Methods: Study Setting",
        "N Centers": "Methods: Study Setting",
        "Enrollment Period": "Methods: Patient Enrollment",
        "Funding Source": "Funding/Acknowledgments section",
        "Conflict of Interest": "Conflicts of Interest section",
        "Registration": "Methods or abstract",
        "Registration ID": "Methods or abstract",
    },
    "Cohort_Level": {
        "Study ID": "Same as Study_Level",
        "Cohort ID": "Assign sequentially (e.g., C1, C2)",
        "Cohort Role": "Methods: Study Population",
        "Disease/Condition": "Methods: Study Population or Abstract",
        "Sample Size (Enrolled)": "Abstract or Methods: Sample Size",
        "N Analyzed": "Results or Methods: Statistical Analysis",
        "Age Group": "Methods: Study Population",
        "Age, Central Value (years)": "Results: Table 1 or Methods: Population",
        "Age, Dispersion Type": "Results: Table 1",
        "Age, Dispersion Value": "Results: Table 1",
        "Female (%)": "Results: Table 1 or Methods: Population",
        "Race/Ethnicity": "Results: Table 1",
        "Clinical Indication": "Methods: Clinical Indication",
        "Inclusion Criteria": "Methods: Inclusion/Exclusion Criteria",
        "Exclusion Criteria": "Methods: Inclusion/Exclusion Criteria",
        "Comorbidities": "Results: Table 1 or Methods: Population",
    },
    "Protocol_Level": {
        "Cohort ID": "Same as Cohort_Level",
        "Protocol ID": "Assign sequentially (e.g., P1, P2)",
        "Modality": "Methods: Imaging Protocol or Abstract",
        "Scanner Manufacturer": "Methods: Imaging Protocol or Equipment",
        "Scanner Model": "Methods: Imaging Protocol or Equipment",
        "Field Strength (T)": "Methods: MRI Parameters or Table 1",
        "kVp": "Methods: CT Parameters or Table 1",
        "mAs": "Methods: CT Parameters or Table 1",
        "Contrast Agent": "Methods: Contrast Protocol",
        "Contrast Dose": "Methods: Contrast Protocol",
        "Contrast Route": "Methods: Contrast Protocol",
        "Acquisition Phase": "Methods: Imaging Protocol",
        "TR (ms)": "Methods: MRI Parameters or Table 1",
        "TE (ms)": "Methods: MRI Parameters or Table 1",
        "Flip Angle (degrees)": "Methods: MRI Parameters or Table 1",
        "Sequence Type": "Methods: MRI Parameters or Table 1",
        "Voxel Size": "Methods: MRI Parameters or Table 1",
        "Slice Thickness (mm)": "Methods: Imaging Parameters or Table 1",
        "Matrix Size": "Methods: Imaging Parameters or Table 1",
        "FOV": "Methods: Imaging Parameters or Table 1",
        "Reconstruction Algorithm": "Methods: CT Reconstruction",
        "CTDIvol (mGy)": "Methods: CT Dose or Table 1",
        "DLP (mGy·cm)": "Methods: CT Dose or Table 1",
        "Scan Duration (s)": "Methods: Imaging Protocol",
    },
    "Outcome_Level": {
        "Protocol ID": "Same as Protocol_Level",
        "Outcome ID": "Assign sequentially (e.g., O1, O2)",
        "Result Type": "Results or Abstract",
        "Specific Outcome Label": "Results or Abstract",
        "Reference Standard": "Methods: Reference Standard",
        "Reference Standard Details": "Methods: Reference Standard",
        "ROI/Region Category": "Methods: Image Analysis or ROI Definition",
        "N Analyzed": "Results or Methods: Statistical Analysis",
        "Sensitivity (%)": "Results: Diagnostic Performance or Table 2",
        "Specificity (%)": "Results: Diagnostic Performance or Table 2",
        "PPV (%)": "Results: Diagnostic Performance or Table 2",
        "NPV (%)": "Results: Diagnostic Performance or Table 2",
        "AUC": "Results: ROC Analysis or Table 2",
        "AUC 95CI Lower": "Results: ROC Analysis or Table 2",
        "AUC 95CI Upper": "Results: ROC Analysis or Table 2",
        "Central Estimate": "Results: Quantitative Measurements or Table 2",
        "Dispersion Type": "Results: Quantitative Measurements or Table 2",
        "Dispersion Value": "Results: Quantitative Measurements or Table 2",
        "Unit (as reported)": "Results or Methods: Definitions",
        "Standardized Unit Family": "Derive from Unit (as reported)",
        "Statistical Test": "Methods: Statistical Analysis or Results",
        "P-value": "Results or Table 2",
        "Agreement Metric": "Results: Inter-reader Agreement or Table 3",
        "Agreement Value": "Results: Inter-reader Agreement or Table 3",
        "N Readers": "Methods: Image Analysis or Readers",
        "Reader Blinding": "Methods: Image Analysis or Readers",
    },
    "Quality_Assessment": {
        "Study ID": "Same as Study_Level",
        "QA ID": "Assign sequentially (e.g., QA1)",
        "Assessment Tool": "Determine from study design: diagnostic_accuracy → QUADAS_2; observational → ROBINS_I",
        "D1: Patient Selection — Risk of Bias": "Methods: Patient Selection",
        "D1: Patient Selection — Applicability": "Methods: Patient Selection",
        "D2: Index Test — Risk of Bias": "Methods: Index Test (Imaging Protocol)",
        "D2: Index Test — Applicability": "Methods: Index Test (Imaging Protocol)",
        "D3: Reference Standard — Risk of Bias": "Methods: Reference Standard",
        "D3: Reference Standard — Applicability": "Methods: Reference Standard",
        "D4: Flow and Timing — Risk of Bias": "Methods: Flow and Timing",
        "Overall Risk of Bias": "Synthesize from all domains",
        "Overall Applicability": "Synthesize from all applicability domains",
        "D1: Confounding": "Methods: Study Design and Confounding Control",
        "D2: Selection of Participants": "Methods: Participant Selection",
        "D3: Classification of Interventions": "Methods: Intervention Classification",
        "D4: Deviations from Interventions": "Methods: Intervention Delivery",
        "D5: Missing Data": "Results: Missing Data or Methods: Analysis",
        "D6: Measurement of Outcomes": "Methods: Outcome Measurement",
        "D7: Selection of Reported Result": "Results: Reporting",
        "D1 Support for Judgment": "Methods: Patient Selection",
        "D2 Support for Judgment": "Methods: Index Test",
        "D3 Support for Judgment": "Methods: Reference Standard",
        "D4 Support for Judgment": "Methods: Flow and Timing",
        "D5 Support for Judgment": "Results: Missing Data",
        "D6 Support for Judgment": "Methods: Outcome Measurement",
        "D7 Support for Judgment": "Results: Reporting",
    },
}


def generate_prompts(output_path: str):
    """Generate the base prompts JSON from the field definitions."""
    prompts = []
    for f in FIELDS:
        sheet, order, name, why, what_to_enter, fmt, allowed, required, notes = f

        # Build the prompt text
        prompt_text = (
            f"From this study, identify the **{name.lower()}** for this "
            f"{'study' if sheet == 'Study_Level' else 'cohort' if sheet == 'Cohort_Level' else 'protocol' if sheet == 'Protocol_Level' else 'outcome' if sheet == 'Outcome_Level' else 'quality assessment'}: "
            f"{what_to_enter}. (Purpose: {why}.)"
        )

        if notes:
            prompt_text += f" NOTE: {notes}"

        # Build constraints
        if fmt == "Category":
            constraints = "Controlled vocabulary (must match a dropdown value exactly). Format: Category."
        elif fmt == "Integer":
            constraints = "Free text / number as reported. Format: Integer."
        elif fmt == "Number":
            constraints = "Free text / number as reported. Format: Number."
        elif fmt == "Percentage":
            constraints = "Free text / number as reported. Format: Percentage (0-100)."
        elif fmt == "Text":
            constraints = "Free text / number as reported. Format: Text."
        else:
            constraints = f"Format: {fmt}."

        # Build missing instruction
        missing = "If not reported, use `NR` (text)."
        if allowed and allowed != "Unique free text":
            missing = "Use `NR` (must be an allowed list value)."

        # Get navigation hint
        nav_hint = NAV_HINTS.get(sheet, {}).get(name, "")

        entry = {
            "sheet": sheet,
            "order": order,
            "name": name,
            "required": required,
            "prompt": prompt_text,
            "constraints": constraints,
            "allowed": allowed,
            "missing": missing,
            "notes": notes,
            "navigation_hint": nav_hint,
        }
        prompts.append(entry)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(prompts, fh, indent=2, ensure_ascii=False)

    print(f"Generated {output_path}")
    print(f"  Total prompts: {len(prompts)}")
    by_sheet = {}
    for p in prompts:
        by_sheet.setdefault(p["sheet"], 0)
        by_sheet[p["sheet"]] += 1
    for s, n in sorted(by_sheet.items()):
        print(f"  {s}: {n} prompts")
    return len(prompts)


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "/workspace/radextract/configs/radiology_base/prompts/field_prompts.json"
    generate_prompts(output)
