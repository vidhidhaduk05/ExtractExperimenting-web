import { DEMO_PDF_DATA, DEMO_PDF_SUMMARIES, DEMO_EXTRACTIONS, DEMO_VARIABLES } from "./demoData";

export async function parsePdfToStudyData(file: File) {
  // Client-side auto-identification
  const filename = file.name;

  let title = filename.replace('.pdf', '');
  let authors = "Unknown Author";
  let publication_year = new Date().getFullYear();
  let journal = "Unknown Journal";
  let study_design = "case report";

  const parts = filename.split('_');
  if (parts.length >= 3) {
    authors = parts[0] + " et al.";
    const yearMatch = parts[1].match(/(19|20)\d{2}/);
    if (yearMatch) {
      publication_year = parseInt(yearMatch[0], 10);
    }
    title = parts.slice(2).join(' ').replace('.pdf', '').trim();
  } else {
    const yearMatch = filename.match(/(19|20)\d{2}/);
    if (yearMatch) {
      publication_year = parseInt(yearMatch[0], 10);
    }
  }

  return {
    title,
    authors,
    publication_year,
    journal,
    doi: "",
    abstract: `Auto-generated abstract for ${title}. This study discusses relevant findings.`,
    study_design
  };
}

export function registerPdfDemoData(studyId: string, file: File, data: any) {
  // Inject into demoData memory objects so the extraction sheet and PDF viewer work
  const objectUrl = URL.createObjectURL(file);

  // Register PDF Data
  (DEMO_PDF_DATA as any)[studyId] = {
    pages: [{ page_number: 1, text: `Content of ${data.title}`, bounds: [] }],
    pdf_url: objectUrl,
    filename: file.name
  };

  // Register Summary
  (DEMO_PDF_SUMMARIES as any)[studyId] = {
    key_findings: [`Findings for ${data.title}`],
    methodology: data.study_design,
    conclusions: "Auto-identified conclusions",
    quotes: []
  };

  // Register Extractions
  (DEMO_EXTRACTIONS as any)[studyId] = DEMO_VARIABLES.map(v => ({
     variable_id: v.variable_id,
     value: v.type === "categorical" ? (v.options?.[0] || "NR") : (v.type === "boolean" ? "false" : "NR"),
     confidence: 0.9,
     justification: "Auto-identified fast-track extraction.",
     is_verified: true,
     is_edited: false
  }));
}
