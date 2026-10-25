from pathlib import Path

base = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_platform\frontend\src\pages")

# 1. Fix PdfViewerPage.tsx
pdf_viewer_path = base / "PdfViewerPage.tsx"
pdf_content = pdf_viewer_path.read_text(encoding="utf-8")

old_studies_block = '''  const allStudies: any[] = useMemo(() => {
    if (dynamicStudies && dynamicStudies.length > 0) {
      return dynamicStudies.map((s, idx) => ({
        ...s,
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title || `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      }));
    }
    return BENCHMARK_PAPERS.map((b) => ({
      ...b,
      study_id: b.id,
      authors: b.title.split("(")[0].trim(),
      publication_year: 2024,
      journal: "Journal of NeuroInterventional Surgery",
    }));
  }, [dynamicStudies]);'''

new_studies_block = '''  const allStudies: any[] = useMemo(() => {
    if (dynamicStudies && dynamicStudies.length > 0) {
      return dynamicStudies.map((s, idx) => ({
        ...s,
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title || `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      }));
    }
    if (projectId === "demo") {
      return BENCHMARK_PAPERS.map((b) => ({
        ...b,
        study_id: b.id,
        authors: b.title.split("(")[0].trim(),
        publication_year: 2024,
        journal: "Journal of NeuroInterventional Surgery",
      }));
    }
    return [];
  }, [dynamicStudies, projectId]);'''

if old_studies_block in pdf_content:
    pdf_content = pdf_content.replace(old_studies_block, new_studies_block)
    print("Fixed allStudies in PdfViewerPage.tsx")
else:
    print("Could not find old_studies_block in PdfViewerPage.tsx")

# Also fix the default activeStudyId and selectedPaperId fallback
old_active_id = '''  const [selectedPaperId, setSelectedPaperId] = useState<string>(() => {
    const match = allStudies?.find((p: any) => p.study_id === rawTargetStudy || p.shortId === rawTargetStudy);
    return match ? match.study_id : "study_birua_2022";
  });
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(null);

  const activeStudyId = selectedPaperId || (rawTargetStudy ? (allStudies.find((p: any) => p.study_id === rawTargetStudy || p.shortId === rawTargetStudy)?.study_id || rawTargetStudy) : "study_birua_2022");'''

new_active_id = '''  const [selectedPaperId, setSelectedPaperId] = useState<string>(() => {
    const match = allStudies?.find((p: any) => p.study_id === rawTargetStudy || p.shortId === rawTargetStudy);
    return match ? match.study_id : (allStudies[0]?.study_id || "");
  });
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(null);

  const activeStudyId = selectedPaperId || (rawTargetStudy ? (allStudies.find((p: any) => p.study_id === rawTargetStudy || p.shortId === rawTargetStudy)?.study_id || rawTargetStudy) : (allStudies[0]?.study_id || ""));'''

if old_active_id in pdf_content:
    pdf_content = pdf_content.replace(old_active_id, new_active_id)
    print("Fixed activeStudyId in PdfViewerPage.tsx")

# Also add empty state before main return in PdfViewerPage.tsx
old_return = '  return (\n    <div className="flex flex-col h-screen bg-[#ECE9E2] overflow-hidden font-sans">'
new_return = '''  if (allStudies.length === 0 && !studyLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#ECE9E2] font-sans items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white border border-[#d2c2cb] p-8 shadow-xs rounded-none">
          <FileText className="w-12 h-12 text-[#814d75] mx-auto mb-3" />
          <h2 className="text-xl font-['Bodoni_Moda'] font-medium text-[#3a0f34] mb-2">No studies in this project yet</h2>
          <p className="text-sm text-[#4f444b] font-['Newsreader'] mb-6 leading-relaxed">
            This project has no literature records or uploaded manuscripts yet. Import studies from PubMed or upload PDF files to begin data extraction.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/projects/${projectId}/studies`}
              className="px-4 py-2 bg-[#3a0f34] text-[#fbf9f4] font-['Work_Sans'] text-xs font-semibold hover:bg-[#1a0017] transition-all"
            >
              Go to Studies / Import
            </Link>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[#f0eee9] text-[#3a0f34] border border-[#d2c2cb] font-['Work_Sans'] text-xs font-semibold hover:bg-[#ffdea6] transition-all"
            >
              Upload PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#ECE9E2] overflow-hidden font-sans">'''

if old_return in pdf_content:
    pdf_content = pdf_content.replace(old_return, new_return)
    print("Added empty state to PdfViewerPage.tsx")

pdf_viewer_path.write_text(pdf_content, encoding="utf-8")


# 2. Fix ExtractionSheetPage.tsx
sheet_path = base / "ExtractionSheetPage.tsx"
sheet_content = sheet_path.read_text(encoding="utf-8")

old_sheet_papers = '''  const availablePapers = useMemo(() => {
    if (!projectStudies) return BENCHMARK_PAPERS;
    if (projectStudies.length === 0) return [];
    return projectStudies.map((s, idx) => {
      const match = BENCHMARK_PAPERS.find((b) => b.id === s.study_id);
      if (match) return match;
      return {
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title ? `${s.title} (${s.publication_year || 2024})` : `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      };
    });
  }, [projectStudies]);'''

new_sheet_papers = '''  const availablePapers = useMemo(() => {
    if (!projectStudies || projectStudies.length === 0) {
      if (projectId === "demo") return BENCHMARK_PAPERS;
      return [];
    }
    return projectStudies.map((s, idx) => {
      const match = BENCHMARK_PAPERS.find((b) => b.id === s.study_id);
      if (match) return match;
      return {
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title ? `${s.title} (${s.publication_year || 2024})` : `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      };
    });
  }, [projectStudies, projectId]);'''

if old_sheet_papers in sheet_content:
    sheet_content = sheet_content.replace(old_sheet_papers, new_sheet_papers)
    sheet_path.write_text(sheet_content, encoding="utf-8")
    print("Fixed availablePapers in ExtractionSheetPage.tsx")
else:
    print("Could not find old_sheet_papers in ExtractionSheetPage.tsx")


# 3. Fix RobAssessmentPage.tsx
rob_path = base / "RobAssessmentPage.tsx"
rob_content = rob_path.read_text(encoding="utf-8")

old_rob_studies = '''  const allStudies: any[] = useMemo(() => {
    if (dynamicStudies && dynamicStudies.length > 0) {
      return dynamicStudies.map((s, idx) => ({
        ...s,
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title || `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      }));
    }
    return BENCHMARK_PAPERS.map((b) => ({
      ...b,
      study_id: b.id,
      authors: b.title.split("(")[0].trim(),
      publication_year: 2024,
      journal: "Journal of NeuroInterventional Surgery",
    }));
  }, [dynamicStudies]);'''

new_rob_studies = '''  const allStudies: any[] = useMemo(() => {
    if (dynamicStudies && dynamicStudies.length > 0) {
      return dynamicStudies.map((s, idx) => ({
        ...s,
        id: s.study_id,
        shortId: `s${idx + 1}`,
        title: s.title || `Study #${idx + 1}`,
        filename: s.pdf_path || `${s.title}.pdf`,
      }));
    }
    if (projectId === "demo") {
      return BENCHMARK_PAPERS.map((b) => ({
        ...b,
        study_id: b.id,
        authors: b.title.split("(")[0].trim(),
        publication_year: 2024,
        journal: "Journal of NeuroInterventional Surgery",
      }));
    }
    return [];
  }, [dynamicStudies, projectId]);'''

if old_rob_studies in rob_content:
    rob_content = rob_content.replace(old_rob_studies, new_rob_studies)
    rob_path.write_text(rob_content, encoding="utf-8")
    print("Fixed allStudies in RobAssessmentPage.tsx")
else:
    print("Could not find old_rob_studies in RobAssessmentPage.tsx")
