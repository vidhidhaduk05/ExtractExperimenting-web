// Radiology & Medical Imaging Reporting Methodology Extension
// Extends the 74 baseline biomedical checks with 10 specialized imaging methodology items
// Based on CLAIM (Checklist for AI in Medical Imaging), STARD 2015, and RSNA reporting standards

import { RigorCheckItem, RigorDomain } from "./dubowitzRigorData";

export const RADIOLOGY_DOMAIN: RigorDomain = {
  id: "radiology",
  label: "Radiology & Imaging",
  score: 85,
  good: 8,
  total: 10,
};

export const RADIOLOGY_EXTENSION_CHECKS: RigorCheckItem[] = [
  {
    id: "rad-01",
    label: "CLAIM / STARD Compliance",
    domain: "radiology",
    guideline: "CLAIM 1-5",
    outcome: "good",
    evidence: 95,
    color: "var(--rs-good)",
    question: "Does the manuscript report adherence to CLAIM, STARD, or TRIPOD reporting guidelines for imaging studies?",
    quote: "Methodology and diagnostic reporting adhered strictly to the CLAIM (Checklist for Artificial Intelligence in Medical Imaging) criteria.",
    location: "Methods · page 3",
    page: 3,
    highlights: [
      { left: 12.0, top: 48.0, width: 76.0, height: 4.2 }
    ],
    spoke: {
      name: "spoke-rad-01",
      verdict: "Reported",
      evidence: 95,
      x1: 442.0,
      y1: 180.0,
      x2: 510.0,
      y2: 70.0,
      dashOffset: 0.05,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-02",
    label: "Scanner Hardware & Field Strength",
    domain: "radiology",
    guideline: "CLAIM 12",
    outcome: "good",
    evidence: 98,
    color: "var(--rs-good)",
    question: "Are imaging hardware specifications clearly documented (scanner manufacturer, model, magnetic field strength 1.5T/3.0T, or CT tube voltage/current)?",
    quote: "Imaging was acquired on a 3.0-Tesla MRI scanner (Magnetom Prisma, Siemens Healthineers) using a 64-channel phased-array head/neck coil.",
    location: "Imaging Protocol · page 3",
    page: 3,
    highlights: [
      { left: 10.0, top: 54.0, width: 80.0, height: 4.5 }
    ],
    spoke: {
      name: "spoke-rad-02",
      verdict: "Reported",
      evidence: 98,
      x1: 450.0,
      y1: 188.0,
      x2: 525.0,
      y2: 82.0,
      dashOffset: 0.02,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-03",
    label: "Acquisition & Slice Thickness",
    domain: "radiology",
    guideline: "CLAIM 13",
    outcome: "good",
    evidence: 92,
    color: "var(--rs-good)",
    question: "Are sequence parameters, matrix size, field-of-view (FOV), repetition time (TR), echo time (TE), and reconstructive slice thickness reported?",
    quote: "T1-weighted MPRAGE volumetric sequences were acquired with TR/TE = 2300/2.98 ms, flip angle = 9°, FOV = 256 mm, isotropic 1.0 mm³ voxel resolution.",
    location: "MRI Sequences · page 4",
    page: 4,
    highlights: [
      { left: 11.5, top: 22.0, width: 78.0, height: 4.0 }
    ],
    spoke: {
      name: "spoke-rad-03",
      verdict: "Reported",
      evidence: 92,
      x1: 458.0,
      y1: 196.0,
      x2: 540.0,
      y2: 95.0,
      dashOffset: 0.08,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-04",
    label: "Contrast Protocol & Timing",
    domain: "radiology",
    guideline: "CLAIM 14",
    outcome: "good",
    evidence: 90,
    color: "var(--rs-good)",
    question: "Are contrast agent details, dose (mmol/kg or mL), power-injector rate (mL/s), saline chaser, and post-injection phase timing reported?",
    quote: "Intravenous gadobutrol (0.1 mmol/kg) was administered at 2.0 mL/s via automated power injector followed by a 20 mL saline flush, with dynamic multiphase acquisitions at 30 s, 70 s, and 180 s.",
    location: "Contrast Administration · page 4",
    page: 4,
    highlights: [
      { left: 10.0, top: 38.0, width: 80.0, height: 4.8 }
    ],
    spoke: {
      name: "spoke-rad-04",
      verdict: "Reported",
      evidence: 90,
      x1: 466.0,
      y1: 205.0,
      x2: 554.0,
      y2: 110.0,
      dashOffset: 0.10,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-05",
    label: "Radiologist Reader Experience",
    domain: "radiology",
    guideline: "STARD 13",
    outcome: "good",
    evidence: 96,
    color: "var(--rs-good)",
    question: "Are the number of radiologist readers, their board certifications, and years of specialized imaging experience stated?",
    quote: "All examinations were independently reviewed by two fellowship-trained subspecialty thoracic radiologists with 14 and 9 years of post-training experience.",
    location: "Image Interpretation · page 4",
    page: 4,
    highlights: [
      { left: 10.5, top: 62.0, width: 79.0, height: 4.2 }
    ],
    spoke: {
      name: "spoke-rad-05",
      verdict: "Reported",
      evidence: 96,
      x1: 474.0,
      y1: 215.0,
      x2: 568.0,
      y2: 126.0,
      dashOffset: 0.04,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-06",
    label: "Reader Blinding Protocol",
    domain: "radiology",
    guideline: "STARD 14",
    outcome: "good",
    evidence: 97,
    color: "var(--rs-good)",
    question: "Were image readers blinded to patient identifiers, clinical history, histopathology outcomes, and prior follow-up scans?",
    quote: "Readers were masked to all clinical identifiers, surgical records, pathology reports, and longitudinal follow-up outcomes.",
    location: "Blinding & Randomization · page 4",
    page: 4,
    highlights: [
      { left: 12.0, top: 78.0, width: 76.0, height: 3.8 }
    ],
    spoke: {
      name: "spoke-rad-06",
      verdict: "Reported",
      evidence: 97,
      x1: 482.0,
      y1: 226.0,
      x2: 582.0,
      y2: 144.0,
      dashOffset: 0.03,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-07",
    label: "Inter-Reader Agreement (Kappa/ICC)",
    domain: "radiology",
    guideline: "CLAIM 28",
    outcome: "good",
    evidence: 94,
    color: "var(--rs-good)",
    question: "Is inter-reader or intra-reader agreement reported using standardized statistical metrics with 95% confidence intervals?",
    quote: "Inter-observer concordance demonstrated substantial agreement (Cohen's kappa = 0.84, 95% CI: 0.76–0.92; continuous volumetry ICC = 0.91).",
    location: "Statistical Analysis · page 5",
    page: 5,
    highlights: [
      { left: 11.0, top: 32.0, width: 78.0, height: 4.0 }
    ],
    spoke: {
      name: "spoke-rad-07",
      verdict: "Reported",
      evidence: 94,
      x1: 490.0,
      y1: 238.0,
      x2: 596.0,
      y2: 164.0,
      dashOffset: 0.06,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-08",
    label: "Pathologic Reference Standard",
    domain: "radiology",
    guideline: "STARD 8",
    outcome: "good",
    evidence: 98,
    color: "var(--rs-good)",
    question: "Is imaging diagnosis verified against an objective reference standard (surgical histopathology, biopsy, or structured clinical follow-up)?",
    quote: "Surgical histopathologic examination served as the definitive ground truth reference standard for all resected lesions.",
    location: "Reference Standard · page 5",
    page: 5,
    highlights: [
      { left: 10.0, top: 52.0, width: 80.0, height: 4.4 }
    ],
    spoke: {
      name: "spoke-rad-08",
      verdict: "Reported",
      evidence: 98,
      x1: 496.0,
      y1: 251.0,
      x2: 608.0,
      y2: 186.0,
      dashOffset: 0.02,
      color: "var(--rs-good)",
    }
  },
  {
    id: "rad-09",
    label: "Image Segmentation & Preprocessing",
    domain: "radiology",
    guideline: "CLAIM 18",
    outcome: "mid",
    evidence: 58,
    color: "var(--rs-warn)",
    question: "Are image normalization, bias-field correction, and manual/semi-automated volume-of-interest segmentation protocols documented?",
    quote: "Volumes of interest were contoured using ITK-SNAP v3.8 with N4ITK bias correction; however, inter-observer Dice coefficients were not formally reported.",
    location: "Image Processing · page 5",
    page: 5,
    highlights: [
      { left: 10.5, top: 72.0, width: 79.0, height: 4.6 }
    ],
    spoke: {
      name: "spoke-rad-09",
      verdict: "Unclear",
      evidence: 58,
      x1: 501.0,
      y1: 265.0,
      x2: 618.0,
      y2: 210.0,
      dashOffset: 0.42,
      color: "var(--rs-warn)",
    }
  },
  {
    id: "rad-10",
    label: "External Multicenter Validation",
    domain: "radiology",
    guideline: "CLAIM 34",
    outcome: "bad",
    evidence: 22,
    color: "var(--rs-crit)",
    question: "Was imaging diagnostic performance externally validated on independent cohorts from different institutions or scanner vendors?",
    quote: "Evaluation was restricted to a single tertiary academic medical center cohort using a single scanner vendor platform.",
    location: "Limitations · page 12",
    page: 12,
    highlights: [
      { left: 11.0, top: 40.0, width: 78.0, height: 4.2 }
    ],
    spoke: {
      name: "spoke-rad-10",
      verdict: "Missing",
      evidence: 22,
      x1: 504.0,
      y1: 280.0,
      x2: 626.0,
      y2: 235.0,
      dashOffset: 0.78,
      color: "var(--rs-crit)",
    }
  }
];
