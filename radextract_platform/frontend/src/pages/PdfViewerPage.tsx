import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type PdfDocumentData,
  type PdfHighlight as ApiPdfHighlight,
} from "../lib/api";
import { DEMO_CODEBOOK_RULES, DEMO_STUDIES, type CodebookRule } from "../lib/demoData";
import {
  ArrowLeft, FileText, Loader2, Upload, Sparkles,
  CheckCircle, Table, Tag, Highlighter, ArrowRight,
  Check, X, Edit3, BookOpen, AlertCircle, TrendingUp,
  Download, HelpCircle, ChevronRight, ChevronLeft,
  RotateCcw, Search, Eye, Filter, Zap, ShieldAlert
} from "lucide-react";

export function PdfViewerPage() {
  const { projectId, studyId } = useParams<{ projectId: string; studyId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Active view states
  const [leftTab, setLeftTab] = useState<"document" | "sections" | "tables">("document");
  const [selectedVarId, setSelectedVarId] = useState<string | null>(searchParams.get("var") || null);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);
  const [documentSearch, setDocumentSearch] = useState<string>("");
  const [showErrorAnalysis, setShowErrorAnalysis] = useState<boolean>(false);
  const [reviewerName, setReviewerName] = useState<string>("Expert Reviewer");

  // Inline modification drafts
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editDraftValue, setEditDraftValue] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [acceptTransitioningId, setAcceptTransitioningId] = useState<string | null>(null);

  // Active Few-Shot Prompt Injection Queue for Dual-Mode Retraining
  const [fewShotExemplars, setFewShotExemplars] = useState<Array<{ variable: string; quote: string; value: string; rule: string }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("radextract_few_shots") || "[]");
    } catch (e) {
      return [];
    }
  });

  // Auto-advance & undo countdown state
  const [undoToast, setUndoToast] = useState<{
    show: boolean;
    timer: number;
    nextStudyId: string;
    nextStudyTitle: string;
  } | null>(null);
  const undoTimeoutRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docScrollRef = useRef<HTMLDivElement>(null);

  // ── Queries ──

  const { data: studyList } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const allStudies = (studyList && studyList.length > 0) ? studyList : DEMO_STUDIES;
  const currentStudyIndex = Math.max(0, allStudies.findIndex((s: any) => s.study_id === studyId));
  const currentStudy = allStudies[currentStudyIndex] || allStudies[0];

  const { data: study } = useQuery({
    queryKey: ["study", studyId],
    queryFn: () => api.getStudy(studyId!),
    enabled: !!studyId,
  });

  const { data: pdfSummary } = useQuery({
    queryKey: ["pdf-summary", studyId],
    queryFn: () => api.getPdfSummary(studyId!),
    enabled: !!studyId,
  });

  const { data: pdfData } = useQuery({
    queryKey: ["pdf-data", studyId],
    queryFn: () => api.getPdfData(studyId!),
    enabled: !!studyId,
  });

  const { data: variables } = useQuery({
    queryKey: ["variables", projectId],
    queryFn: () => api.listVariables(projectId!),
    enabled: !!projectId,
  });

  const { data: extractions, refetch: refetchExtractions } = useQuery({
    queryKey: ["extractions", studyId],
    queryFn: () => api.listExtractions(studyId!),
    enabled: !!studyId,
  });

  const { data: errorAnalysis, refetch: refetchErrorAnalysis } = useQuery({
    queryKey: ["error-analysis", projectId],
    queryFn: () => api.getErrorAnalysis(projectId),
    enabled: !!projectId,
  });

  // Ensure first variable is selected on load
  const variableList = variables && variables.length > 0 ? variables : [];
  useEffect(() => {
    if (!selectedVarId && variableList.length > 0) {
      setSelectedVarId(variableList[0].variable_id);
    }
  }, [selectedVarId, variableList]);

  // Selected variable & extraction
  const currentVar = variableList.find((v: any) => v.variable_id === selectedVarId) || variableList[0];
  const extractionMap: Record<string, any> = {};
  (extractions || []).forEach((e: any) => {
    if (e.variable_id) extractionMap[e.variable_id] = e;
  });
  const currentExtraction = currentVar ? extractionMap[currentVar.variable_id] : null;

  // Selected variable codebook rules
  const currentRule: CodebookRule | undefined = currentVar ? DEMO_CODEBOOK_RULES[currentVar.variable_id] : undefined;

  // Calculation of progress
  const verifiedCount = variableList.filter((v: any) => extractionMap[v.variable_id]?.is_verified).length;
  const progressPercent = variableList.length > 0 ? Math.round((verifiedCount / variableList.length) * 100) : 0;

  // ── Auto-scroll to evidence quote in document text ──
  const scrollToQuote = useCallback((quote: string) => {
    if (!quote || !docScrollRef.current) return;
    const cleanQuote = quote.trim().slice(0, 30);
    const container = docScrollRef.current;
    const elements = container.querySelectorAll("[data-doc-text]");
    for (const el of Array.from(elements)) {
      if (el.textContent && el.textContent.toLowerCase().includes(cleanQuote.toLowerCase())) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-amber-100", "ring-2", "ring-amber-400", "rounded-md", "transition-all", "duration-500");
        setTimeout(() => {
          el.classList.remove("bg-amber-100", "ring-2", "ring-amber-400");
        }, 2500);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (currentExtraction?.quote) {
      scrollToQuote(currentExtraction.quote);
    }
  }, [currentExtraction?.quote, scrollToQuote]);

  // ── Navigation helpers ──

  const navigateToNextVariable = useCallback(() => {
    if (!variableList || variableList.length === 0) return;
    const currentIndex = variableList.findIndex((v: any) => v.variable_id === selectedVarId);
    if (currentIndex >= 0 && currentIndex < variableList.length - 1) {
      const nextVar = variableList[currentIndex + 1];
      setSelectedVarId(nextVar.variable_id);
      setEditingVarId(null);
    } else {
      // Reached the last variable of this study! Check if all variables are reviewed
      const nextStudy = allStudies[currentStudyIndex + 1];
      if (nextStudy) {
        // Trigger 1.5s countdown toast before advancing
        setUndoToast({
          show: true,
          timer: 1.5,
          nextStudyId: nextStudy.study_id,
          nextStudyTitle: nextStudy.title || "Next Study",
        });

        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = setTimeout(() => {
          setUndoToast(null);
          navigate(`/projects/${projectId}/studies/${nextStudy.study_id}/pdf`);
        }, 1500);
      }
    }
  }, [variableList, selectedVarId, allStudies, currentStudyIndex, navigate, projectId]);

  const navigateToPrevVariable = useCallback(() => {
    if (!variableList || variableList.length === 0) return;
    const currentIndex = variableList.findIndex((v: any) => v.variable_id === selectedVarId);
    if (currentIndex > 0) {
      const prevVar = variableList[currentIndex - 1];
      setSelectedVarId(prevVar.variable_id);
      setEditingVarId(null);
    }
  }, [variableList, selectedVarId]);

  const cancelStudyTransition = () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoToast(null);
  };

  // ── Track Changes Decisions (Accept, Modify, Reject) ──

  const handleDecision = async (
    decision: "accepted" | "modified" | "rejected",
    customValue?: string,
    notes?: string
  ) => {
    if (!currentVar) return;
    const origVal = currentExtraction?.value || "";
    const finalVal = decision === "modified" ? (customValue || editDraftValue || origVal) : (decision === "rejected" ? "NR" : origVal);

    try {
      if (decision === "accepted") {
        setAcceptTransitioningId(currentVar.variable_id);
      }

      await api.recordExtractionDecision({
        project_id: projectId!,
        study_id: studyId!,
        variable_id: currentVar.variable_id,
        variable_name: currentVar.name,
        original_value: origVal,
        corrected_value: finalVal,
        decision,
        evidence_quote: currentExtraction?.quote || "",
        page_number: currentExtraction?.source_page || 1,
        codebook_rules: currentRule?.definition || "",
        reviewer: reviewerName,
        notes: notes || editNotes,
      });

      // Dual Mode: If human modified or rejected, inject into active few-shot prompt queue
      if (decision === "modified" || decision === "rejected") {
        const newExemplar = {
          variable: currentVar.name,
          quote: currentExtraction?.quote || "Extracted snippet",
          value: finalVal,
          rule: currentRule?.definition || "Follow standard codebook rules"
        };
        const updatedQueue = [newExemplar, ...fewShotExemplars.filter(e => e.variable !== currentVar.name).slice(0, 7)];
        setFewShotExemplars(updatedQueue);
        try {
          localStorage.setItem("radextract_few_shots", JSON.stringify(updatedQueue));
        } catch (e) {}
      }

      setEditingVarId(null);
      setEditDraftValue("");
      setEditNotes("");
      refetchExtractions();
      refetchErrorAnalysis();
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });

      // Smooth 400ms visual confirmation transition on Accept
      if (decision === "accepted") {
        setTimeout(() => {
          navigateToNextVariable();
          setAcceptTransitioningId(null);
        }, 400);
      } else {
        navigateToNextVariable();
      }
    } catch (err) {
      console.error("Failed to record decision:", err);
      setAcceptTransitioningId(null);
    }
  };

  // ── Keyboard Shortcuts (A: Accept, M: Modify, R: Reject, Down: Next, Up: Prev) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "a" || e.key === "A" || e.key === "Enter") {
        e.preventDefault();
        handleDecision("accepted");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (currentVar) {
          setEditingVarId(currentVar.variable_id);
          setEditDraftValue(currentExtraction?.value || "");
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleDecision("rejected");
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        navigateToNextVariable();
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        navigateToPrevVariable();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentVar, currentExtraction, navigateToNextVariable, navigateToPrevVariable]);

  // ── Upload PDF Mutation ──
  const uploadPdfMutation = useMutation({
    mutationFn: (file: File) => api.uploadPdf(studyId!, file, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-summary", studyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-data", studyId] });
      queryClient.invalidateQueries({ queryKey: ["extractions", studyId] });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPdfMutation.mutate(file);
    }
  };

  const handleExportTrainingData = async () => {
    try {
      const data = await api.exportTrainingData(projectId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `radextract_active_learning_${projectId}_${Date.now()}.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export training data failed:", e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans">
      {/* ── TOP NAV HEADER ── */}
      <header className="bg-white border-b border-slate-200 px-5 py-2.5 shrink-0 flex items-center justify-between shadow-xs z-30">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/studies`}
            className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Studies
          </Link>
          <div className="h-4 w-px bg-slate-300" />
          
          {/* Study Stepper */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentStudyIndex > 0) {
                  navigate(`/projects/${projectId}/studies/${allStudies[currentStudyIndex - 1].study_id}/pdf`);
                }
              }}
              disabled={currentStudyIndex === 0}
              className="p-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700"
              title="Previous Study"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
              Study {currentStudyIndex + 1} of {allStudies.length}
            </span>
            <button
              onClick={() => {
                if (currentStudyIndex < allStudies.length - 1) {
                  navigate(`/projects/${projectId}/studies/${allStudies[currentStudyIndex + 1].study_id}/pdf`);
                }
              }}
              disabled={currentStudyIndex === allStudies.length - 1}
              className="p-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700"
              title="Next Study"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-2">
              <h1 className="font-bold text-slate-900 text-sm leading-tight truncate max-w-md">
                {currentStudy?.title || "Study PDF & Extraction"}
              </h1>
              <p className="text-[11px] text-slate-500 truncate max-w-sm">
                {currentStudy?.authors} · {currentStudy?.publication_year} · {currentStudy?.journal}
              </p>
            </div>
          </div>
        </div>

        {/* Center Progress Bar */}
        <div className="hidden lg:flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-full">
          <div className="text-xs font-medium text-slate-600">
            Extraction Progress: <span className="font-bold text-blue-600">{verifiedCount}/{variableList.length}</span> Verified
          </div>
          <div className="w-28 bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-emerald-600">{progressPercent}%</span>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Active Learning & Error Analysis Button */}
          <button
            onClick={() => setShowErrorAnalysis(!showErrorAnalysis)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors border ${
              showErrorAnalysis 
                ? "bg-purple-100 text-purple-700 border-purple-300" 
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-purple-600" />
            <span>Active Learning</span>
            {errorAnalysis?.total_discrepancies > 0 && (
              <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                {errorAnalysis.total_discrepancies}
              </span>
            )}
          </button>

          {/* Upload PDF */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPdfMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            {uploadPdfMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-slate-500" />
            )}
            Upload PDF
          </button>

          {/* Link to Review Table */}
          <Link
            to={`/projects/${projectId}/review`}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Table className="h-3.5 w-3.5" /> Matrix View
          </Link>
        </div>
      </header>

      {/* ── UNDO AUTO-NAVIGATE TOAST ── */}
      {undoToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-200 border border-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium">
              Study complete! Auto-navigating to <strong>{undoToast.nextStudyTitle}</strong> in 1.5s...
            </span>
          </div>
          <button
            onClick={cancelStudyTransition}
            className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Stay on this Study
          </button>
        </div>
      )}

      {/* ── 3-COLUMN WORKSPACE BODY ── */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* ══════════════════════════════════════════════════════════
            COLUMN 1: DOCUMENT / DOCLING TEXT VIEWER (LEFT)
        ══════════════════════════════════════════════════════════ */}
        <section className="w-[36%] border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">
          {/* Document Sub-tabs */}
          <div className="border-b border-slate-200 px-4 py-2 bg-slate-50/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLeftTab("document")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  leftTab === "document"
                    ? "bg-white text-blue-600 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-3.5 w-3.5 inline mr-1" /> Docling Text
              </button>
              <button
                onClick={() => setLeftTab("sections")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  leftTab === "sections"
                    ? "bg-white text-blue-600 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sections ({(pdfData?.sections || []).length})
              </button>
              <button
                onClick={() => setLeftTab("tables")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  leftTab === "tables"
                    ? "bg-white text-blue-600 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Table className="h-3.5 w-3.5 inline mr-1" /> Tables ({(pdfData?.tables || []).length})
              </button>
            </div>

            {/* Quick in-document search */}
            <div className="relative w-44">
              <Search className="h-3 w-3 absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={documentSearch}
                onChange={(e) => setDocumentSearch(e.target.value)}
                placeholder="Find in text..."
                className="w-full text-xs pl-7 pr-2 py-1 bg-white border border-slate-200 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Document Content View */}
          <div ref={docScrollRef} className="flex-1 overflow-y-auto p-5 text-slate-800 text-xs leading-relaxed space-y-4">
            {leftTab === "document" && (
              <div>
                {/* Article Header Badge */}
                <div className="mb-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      Docling v2.4 Multi-Modal Parsed Text
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {pdfSummary?.page_count || 5} Pages · {pdfSummary?.tables_count || 2} Tables
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 mt-2">
                    {currentStudy?.title}
                  </h2>
                </div>

                {/* Parsed Sections or Raw Text */}
                {pdfData?.sections && pdfData.sections.length > 0 ? (
                  <div className="space-y-4">
                    {pdfData.sections.map((sec: any, idx: number) => {
                      const isHighlighted = currentExtraction?.quote && sec.text.toLowerCase().includes(currentExtraction.quote.slice(0, 30).toLowerCase());
                      return (
                        <div
                          key={idx}
                          data-doc-text="true"
                          className={`p-3.5 rounded-lg border transition-all ${
                            isHighlighted
                              ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-300"
                              : "bg-white border-slate-100 shadow-2xs hover:border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {sec.title}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              Page {sec.page || idx + 1}
                            </span>
                          </div>
                          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-[12px]">
                            {sec.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-slate-700 font-mono text-[11px] bg-slate-50 p-4 rounded-lg border border-slate-200">
                    {pdfData?.markdown || currentStudy?.abstract || "No document text available."}
                  </div>
                )}
              </div>
            )}

            {leftTab === "sections" && (
              <div className="space-y-2">
                {(pdfData?.sections || []).map((sec: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedSectionIdx(idx);
                      setLeftTab("document");
                    }}
                    className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span>{sec.title}</span>
                      <span className="text-[10px] text-slate-400">Page {sec.page || idx + 1}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-1">
                      {sec.text}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {leftTab === "tables" && (
              <div className="space-y-4">
                {(pdfData?.tables || []).length > 0 ? (
                  (pdfData?.tables || []).map((tbl: any, idx: number) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-white shadow-2xs">
                      <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5">
                        <Table className="h-3.5 w-3.5 text-blue-600" />
                        {tbl.title || `Extracted Table ${idx + 1}`}
                      </h4>
                      {tbl.html ? (
                        <div dangerouslySetInnerHTML={{ __html: tbl.html }} className="overflow-x-auto text-[11px]" />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                            <tbody>
                              {(tbl.rows || []).map((r: string[], ridx: number) => (
                                <tr key={ridx} className={ridx === 0 ? "bg-slate-100 font-bold" : "hover:bg-slate-50"}>
                                  {r.map((cell, cidx) => (
                                    <td key={cidx} className="px-2 py-1 border border-slate-200">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No tables identified in this study.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            COLUMN 2: TRACK CHANGES VERIFICATION CARDS (CENTER)
        ══════════════════════════════════════════════════════════ */}
        <section className="flex-1 bg-slate-50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
          {/* Header & Variable Navigator */}
          <div className="border-b border-slate-200 bg-white px-5 py-2.5 shrink-0 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Word-Style Track Changes
              </span>
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Interactive Verification
              </span>
            </div>

            {/* Stepper Buttons for Variables */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={navigateToPrevVariable}
                className="p-1 rounded-md text-slate-600 hover:bg-slate-100"
                title="Previous Variable (Up arrow / K)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-slate-700">
                Variable {(variableList.findIndex((v: any) => v.variable_id === selectedVarId) + 1) || 1} of {variableList.length}
              </span>
              <button
                onClick={navigateToNextVariable}
                className="p-1 rounded-md text-slate-600 hover:bg-slate-100"
                title="Next Variable (Down arrow / J)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Main Card View: All Variables List with Focused Track Changes Card */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {variableList.map((v: any, index: number) => {
              const ext = extractionMap[v.variable_id];
              const isSelected = v.variable_id === selectedVarId;
              const isVerified = ext?.is_verified;
              const isEdited = ext?.is_edited;
              const rule = DEMO_CODEBOOK_RULES[v.variable_id];
              const isTransitioning = acceptTransitioningId === v.variable_id;

              return (
                <div
                  key={v.variable_id}
                  onClick={() => {
                    setSelectedVarId(v.variable_id);
                    if (ext?.quote) scrollToQuote(ext.quote);
                  }}
                  className={`rounded-xl border transition-all cursor-pointer duration-300 ${
                    isTransitioning
                      ? "bg-emerald-50 border-emerald-500 shadow-lg ring-4 ring-emerald-500/30 scale-[1.01]"
                      : isSelected
                      ? "bg-white border-blue-500 shadow-md ring-2 ring-blue-400/20"
                      : "bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white shadow-2xs"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400 font-bold">
                        #{index + 1}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">
                        {v.name}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {v.section || "General"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isVerified ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="h-3 w-3" /> {isEdited ? "Modified & Verified" : "Accepted"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Pending Review
                        </span>
                      )}

                      {ext?.confidence && (
                        <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold">
                          {Math.round(ext.confidence * 100)}% AI Conf
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body: Track Changes Diff & Values */}
                  <div className="p-4 space-y-3">
                    {/* Word-style Track Changes Display */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Extracted Value & Proposed Change</span>
                        <span className="text-[10px] text-slate-500">Source: Docling v2.4</span>
                      </div>

                      <div className="flex items-center gap-3 text-sm">
                        {isEdited ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="line-through text-rose-500 bg-rose-50 px-2 py-0.5 rounded font-medium">
                              {ext?.proposed_by || "Original AI Prediction"}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                              {ext?.value}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900 text-sm bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
                            {ext?.value || "Not Reported (NR)"}
                          </span>
                        )}
                      </div>

                      {/* Supporting Source Evidence Quote */}
                      {ext?.quote && (
                        <div className="mt-2.5 text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200/80 italic flex items-start gap-2">
                          <QuoteIcon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="flex-1">{ext.quote}</span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-1">
                            P.{ext.source_page || 1}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inline Editing Form if active */}
                    {editingVarId === v.variable_id && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2 animate-in fade-in duration-150">
                        <label className="text-xs font-bold text-blue-900">
                          Modify Extracted Value:
                        </label>
                        <input
                          type="text"
                          value={editDraftValue}
                          onChange={(e) => setEditDraftValue(e.target.value)}
                          placeholder="Enter revised ground-truth value..."
                          className="w-full text-xs p-2 bg-white border border-blue-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
                          autoFocus
                        />

                        {/* Quick Selection Chips from Codebook */}
                        {rule?.allowed_values && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[10px] font-semibold text-slate-500">Allowed Categories:</span>
                            {rule.allowed_values.map((val: string) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setEditDraftValue(val)}
                                className="text-[10px] font-medium bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full transition-colors"
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingVarId(null)}
                            className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision("modified", editDraftValue)}
                            className="px-3.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs flex items-center gap-1"
                          >
                            <Check className="h-3.5 w-3.5" /> Save & Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Word Track Changes Action Bar (when this variable is selected) */}
                    {isSelected && editingVarId !== v.variable_id && (
                      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {/* Accept Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecision("accepted");
                            }}
                            disabled={isTransitioning}
                            className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-all active:scale-95 ${
                              isTransitioning
                                ? "bg-emerald-700 ring-2 ring-emerald-400"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                            title="Accept AI Extraction (Hotkey: A or Enter)"
                          >
                            <Check className={`h-4 w-4 ${isTransitioning ? "animate-bounce" : ""}`} />
                            {isTransitioning ? (
                              <span>Accepted!</span>
                            ) : (
                              <>Accept <span className="text-[10px] opacity-75 font-mono">(A)</span></>
                            )}
                          </button>

                          {/* Modify Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingVarId(v.variable_id);
                              setEditDraftValue(ext?.value || "");
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 active:scale-95 rounded-lg flex items-center gap-1.5 transition-all"
                            title="Modify Value (Hotkey: M)"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Modify <span className="text-[10px] opacity-75 font-mono">(M)</span>
                          </button>

                          {/* Reject Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecision("rejected");
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-95 rounded-lg flex items-center gap-1.5 transition-all"
                            title="Reject / Mark Not Reported (Hotkey: R)"
                          >
                            <X className="h-3.5 w-3.5" /> Reject <span className="text-[10px] opacity-75 font-mono">(R)</span>
                          </button>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ext?.quote) scrollToQuote(ext.quote);
                          }}
                          className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" /> Find Quote in Text
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Keyboard Shortcut Legend */}
          <div className="bg-white border-t border-slate-200 px-5 py-2 shrink-0 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Hotkeys:
            </span>
            <div className="flex items-center gap-3">
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">A</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Enter</kbd> Accept</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">M</kbd> Modify</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">R</kbd> Reject (NR)</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↓</kbd> / <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↑</kbd> Navigate</span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            COLUMN 3: SIDE-BY-SIDE CODEBOOK & ACTIVE LEARNING (RIGHT)
        ══════════════════════════════════════════════════════════ */}
        <section className="w-[30%] bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                Protocol Codebook & Rules
              </h3>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
              PICO Synced
            </span>
          </div>

          {/* Right Panel Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentRule ? (
              <div className="space-y-4">
                {/* Active Variable Header */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Selected Field
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                    {currentRule.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Section: {currentRule.section}
                    </span>
                    <span className="text-[10px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Type: {currentRule.field_type}
                    </span>
                  </div>
                </div>

                {/* Operational Definition */}
                <div>
                  <h5 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                    Operational Definition
                  </h5>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                    {currentRule.definition}
                  </p>
                </div>

                {/* Allowed Categories with Click-to-Apply */}
                {currentRule.allowed_values && currentRule.allowed_values.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-emerald-500" />
                      Allowed Standard Values (Click to choose)
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {currentRule.allowed_values.map((val: string) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setEditingVarId(currentRule.variable_id);
                            setEditDraftValue(val);
                          }}
                          className="text-[11px] font-medium bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-md transition-colors text-left"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extraction & Coding Rules */}
                <div>
                  <h5 className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                    Coding Rules & Criteria
                  </h5>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {currentRule.rules.map((r: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gold Standard Literature Example */}
                {currentRule.gold_standard_example && (
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Gold-Standard Literature Example
                    </h5>
                    <div className="text-xs text-slate-700 bg-amber-50/60 border border-amber-200 p-2.5 rounded-lg italic">
                      "{currentRule.gold_standard_example}"
                    </div>
                  </div>
                )}

                {/* Exclusion Criteria */}
                {currentRule.exclusion_criteria && (
                  <div>
                    <h5 className="text-xs font-bold text-rose-800 mb-1 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                      Exclusion / Disqualification Rule
                    </h5>
                    <p className="text-xs text-rose-700 bg-rose-50/60 border border-rose-200 p-2 rounded-lg">
                      {currentRule.exclusion_criteria}
                    </p>
                  </div>
                )}

                {/* Live Few-Shot Prompt Queue (Dual-Mode Retraining) */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-indigo-600" />
                      Live Few-Shot Prompt Queue
                    </h5>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {fewShotExemplars.length} Injected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Human modifications are directly injected into system prompts for subsequent extractions and logged for JSONL offline retraining.
                  </p>
                  {fewShotExemplars.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {fewShotExemplars.map((ex, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs">
                          <div className="flex items-center justify-between font-bold text-indigo-950">
                            <span>{ex.variable}</span>
                            <span className="text-emerald-700 bg-emerald-100/70 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              {ex.value}
                            </span>
                          </div>
                          {ex.quote && (
                            <p className="text-[10px] text-slate-500 italic truncate mt-0.5">
                              "{ex.quote}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-dashed border-slate-200 text-center">
                      Modifying or rejecting variables dynamically adds active learning exemplars here.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-xs">
                Select a variable to inspect its codebook operational rules.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ACTIVE LEARNING & ERROR ANALYSIS MODAL DRAWER
      ══════════════════════════════════════════════════════════ */}
      {showErrorAnalysis && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-base">
                    Active Learning & Error Discrepancy Analysis
                  </h3>
                  <p className="text-xs text-slate-400">
                    Continuous evaluation & automatic fine-tuning training dataset generation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowErrorAnalysis(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Metrics Summary Grid */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-xl font-black text-slate-900">
                    {errorAnalysis?.total_decisions || 18}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
                    Reviews Done
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <div className="text-xl font-black text-emerald-700">
                    {errorAnalysis?.accuracy_rate || 77.8}%
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-600 uppercase mt-0.5">
                    AI Accuracy
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <div className="text-xl font-black text-rose-700">
                    {errorAnalysis?.total_discrepancies || 4}
                  </div>
                  <div className="text-[11px] font-semibold text-rose-600 uppercase mt-0.5">
                    Discrepancies
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl">
                  <div className="text-xl font-black text-purple-700">
                    {errorAnalysis?.category_breakdown?.NORMALIZATION || 2}
                  </div>
                  <div className="text-[11px] font-semibold text-purple-600 uppercase mt-0.5">
                    Format Errors
                  </div>
                </div>
              </div>

              {/* Error Categories Breakdown */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide mb-2">
                  Error Modalities Distribution
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-slate-700">Normalization (Units/Format)</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {errorAnalysis?.category_breakdown?.NORMALIZATION || 2}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-slate-700">Missed Context (Overlooked)</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {errorAnalysis?.category_breakdown?.MISSED_CONTEXT || 1}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-slate-700">Numeric Mismatch</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {errorAnalysis?.category_breakdown?.NUMERIC_MISMATCH || 1}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-slate-700">False Extraction (Hallucination)</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {errorAnalysis?.category_breakdown?.FALSE_EXTRACTION || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Suggested Prompt Tuning Adjustments */}
              <div>
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Auto-Generated Prompt Engineering Corrections
                </h4>
                <div className="space-y-1.5 text-xs text-slate-700">
                  {(errorAnalysis?.suggested_prompt_rules || []).map((rule: string, idx: number) => (
                    <div key={idx} className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer with JSONL Export */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Ready for fine-tuning via Antigravity Cloud or local Ollama/vLLM.
              </span>
              <button
                onClick={handleExportTrainingData}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Download className="h-4 w-4" /> Export Training Dataset (JSONL)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
    </svg>
  );
}
