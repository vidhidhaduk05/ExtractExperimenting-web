/**
 * PDF metadata detection for local uploads.
 *
 * Detects study metadata (title, authors, year, journal, DOI, design, abstract
 * if actually present) from an uploaded PDF using client-side heuristics.
 *
 * Honesty contract: ONLY what is actually detected is returned. Fields that
 * cannot be detected are empty strings. Screening/extraction status is always
 * pending — the client never fabricates decisions, confidence values, page
 * text, findings, or extraction results. Real PDF parsing and extraction
 * happen server-side via the upload endpoints.
 */

import { type Study } from "./api";

export interface AutoIdentifiedStudy {
  study_id: string;
  project_id: string;
  title: string;
  authors: string;
  publication_year: number;
  journal: string;
  doi: string;
  pmid: string;
  abstract: string;
  study_design: string;
  source: string;
  screening_status: string;
  screening_stage: string;
  screening_reason: string;
  extraction_status: string;
  pdf_status: string;
  pdf_path: string;
  pdf_url?: string;
  ai_priority_score: number;
  ai_confidence: number;
  ai_decision: string;
  extracted_json?: any;
}

export async function autoIdentifyPdf(file: File, projectId = "proj_pam_current"): Promise<AutoIdentifiedStudy> {
  let fileText = "";
  try {
    const raw = await file.text();
    // Grab printable characters
    const cleanChars = raw.replace(/[^\x20-\x7E\n\r\t]/g, " ");
    if (cleanChars.trim().length > 100) {
      fileText = cleanChars;
    }
  } catch (e) {
    fileText = "";
  }

  const filename = file.name;
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // 1. Year detection (from text or filename); unknown stays 0
  let year = 0;
  const yearMatch = fileText.match(/\b(19\d{2}|20\d{2})\b/) || filename.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const parsedYear = parseInt(yearMatch[1], 10);
    if (parsedYear >= 1970 && parsedYear <= 2026) {
      year = parsedYear;
    }
  }

  // 2. DOI detection — only reported when actually found
  let doi = "";
  const doiMatch = fileText.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i) || filename.match(/10\.\d{4,9}[_@/][-._;()/:A-Za-z0-9]+/i);
  if (doiMatch) {
    doi = doiMatch[0].replace(/[@_]/g, "/");
  }

  // 3. Authors detection — only reported when actually found
  let authors = "";
  const etAlMatch = fileText.match(/([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+et\s+al\.?)/i) || filename.match(/([A-Z][a-z]+)\s*(?:et\s*al|_et_al)/i);
  if (etAlMatch) {
    authors = etAlMatch[1].replace(/_/g, " ");
  }

  // 4. Journal detection — only reported when actually found
  let journal = "";
  const knownJournals = [
    "World Neurosurgery", "Journal of Neurosurgery", "AJNR Am J Neuroradiol",
    "American Journal of Neuroradiology", "Stroke", "Radiology",
    "Asian Journal of Neurosurgery", "Neurosurgery", "Lancet Neurology",
    "Frontiers in Neurology", "BMJ Case Reports", "Interventional Neuroradiology",
    "European Radiology", "Clinical Neuroradiology"
  ];
  for (const j of knownJournals) {
    if (fileText.toLowerCase().includes(j.toLowerCase()) || filename.toLowerCase().includes(j.toLowerCase().replace(/\s+/g, ""))) {
      journal = j;
      break;
    }
  }

  // 5. Title detection & cleaning — filename-derived titles are marked as
  // provisional by the caller in the UI; no invented study titles.
  let title = "";
  const titleMetaMatch = fileText.match(/\/Title\s*\(([^)]+)\)/i);
  if (titleMetaMatch && titleMetaMatch[1].trim().length > 10) {
    title = titleMetaMatch[1].trim();
  } else {
    const cleaned = nameWithoutExt
      .replace(/\b(19\d{2}|20\d{2})\b/g, "")
      .replace(/\b(et\s+al|_et_al)\b/gi, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    title = cleaned
      .split(" ")
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // 6. Study Design detection — only when the text actually indicates it
  let studyDesign = "";
  const lowerText = (fileText + " " + filename).toLowerCase();
  if (lowerText.includes("randomized") || lowerText.includes("rct") || lowerText.includes("trial")) {
    studyDesign = "randomized controlled trial";
  } else if (lowerText.includes("cohort")) {
    studyDesign = "cohort study";
  } else if (lowerText.includes("case report") || lowerText.includes("case-report")) {
    studyDesign = "case report";
  } else if (lowerText.includes("case series")) {
    studyDesign = "case series";
  } else if (lowerText.includes("systematic review") || lowerText.includes("meta-analysis")) {
    studyDesign = "systematic review";
  }

  // 7. Abstract — only when actually present in the file text; never generated
  let abstract = "";
  const abstractMatch = fileText.match(/abstract[:\s\n]+([^\n\r]+(?:\n[^\n\r]+){1,6})/i);
  if (abstractMatch && abstractMatch[1].trim().length > 50) {
    abstract = abstractMatch[1].replace(/\s+/g, " ").trim();
  }

  const studyId = `study_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const objectUrl = URL.createObjectURL(file);

  const study: AutoIdentifiedStudy = {
    study_id: studyId,
    project_id: projectId,
    title,
    authors,
    publication_year: year,
    journal,
    doi,
    pmid: "",
    abstract,
    study_design: studyDesign,
    source: "PDF Upload (metadata detected locally)",
    // Nothing is decided client-side: every study lands as pending review.
    screening_status: "pending",
    screening_stage: "ta",
    screening_reason: "",
    extraction_status: "pending",
    pdf_status: fileText ? "uploaded" : "uploaded_unparsed",
    pdf_path: filename,
    pdf_url: objectUrl,
    ai_priority_score: 0,
    ai_confidence: 0,
    ai_decision: "",
  };

  return study;
}

// Backward compatibility for existing imports
export const parsePdfToStudyData = autoIdentifyPdf;
