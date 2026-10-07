import React, { useState, useMemo, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DEMO_CODEBOOK_RULES, DEMO_STUDIES, DEMO_EXTRACTIONS, DEMO_VARIABLES, type CodebookRule } from "../lib/demoData";
import { BENCHMARK_PAPERS } from "./PdfViewerPage";
import {
  FileSpreadsheet, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Download, Eye, Check, X, Edit3, Sliders, Search, Filter,
  Sparkles, ExternalLink, RefreshCw, CheckCheck, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, Tag
} from "lucide-react";
import { cn } from "../lib/utils";
import { CodebookDesignerModal } from "../components/common/CodebookDesignerModal";

export function ExtractionSheetPage() {
  const { projectId, studyId: routeStudyId } = useParams<{ projectId: string; studyId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const queryStudyId = searchParams.get("study");
  const initialStudyId = routeStudyId || queryStudyId || "study_chua_2021";

  const [selectedStudyId, setSelectedStudyId] = useState<string>(initialStudyId);
  const [viewMode, setViewMode] = useState<"single" | "matrix">("single");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "pending" | "low_conf">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [showCodebookDesigner, setShowCodebookDesigner] = useState<boolean>(false);

  // Inline editing state
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // In-app codebook rules state
  const [customRules, setCustomRules] = useState<Record<string, CodebookRule>>(() => {
    try {
      const saved = localStorage.getItem("radextract_codebook_rules");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_CODEBOOK_RULES;
  });

  // Queries
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });

  const { data: variables } = useQuery({
    queryKey: ["variables", projectId],
    queryFn: () => api.listVariables(projectId!),
    enabled: !!projectId,
  });

  const { data: extractions, refetch: refetchExtractions } = useQuery({
    queryKey: ["extractions", selectedStudyId],
    queryFn: () => api.listExtractions(selectedStudyId),
    enabled: !!selectedStudyId,
  });

  const variableList = variables && variables.length > 0 ? variables : DEMO_VARIABLES;

  const { data: projectStudies } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const availablePapers = useMemo(() => {
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
  }, [projectStudies]);

  // Sync selectedStudyId if current is not in available papers
  useEffect(() => {
    if (availablePapers.length > 0 && !availablePapers.some((p) => p.id === selectedStudyId)) {
      setSelectedStudyId(availablePapers[0].id);
    }
  }, [availablePapers, selectedStudyId]);

  // Active study object
  const currentPaper = availablePapers.find((p) => p.id === selectedStudyId) || availablePapers[0] || {
    id: selectedStudyId || "none",
    shortId: "s0",
    title: "No Study Selected",
    filename: "",
  };

  // Map extractions for the active study
  const extractionMap = useMemo(() => {
    const map: Record<string, any> = {};
    (extractions || []).forEach((e: any) => {
      if (e.variable_id) map[e.variable_id] = e;
    });
    return map;
  }, [extractions]);

  // Overall metrics across all papers
  const allBenchmarkStats = useMemo(() => {
    let totalVars = 0;
    let verifiedVars = 0;
    let highConfCount = 0;

    availablePapers.forEach((paper) => {
      const paperExts = (DEMO_EXTRACTIONS as any)[paper.id] || [];
      paperExts.forEach((e: any) => {
        totalVars++;
        if (e.is_verified) verifiedVars++;
        if ((e.confidence || 0) >= 0.95) highConfCount++;
      });
    });

    return {
      totalVars,
      verifiedVars,
      highConfCount,
      percent: totalVars > 0 ? Math.round((verifiedVars / totalVars) * 100) : 0,
    };
  }, [availablePapers, extractions]);

  // Filtered variables for single-study sheet
  const filteredVariables = useMemo(() => {
    return variableList.filter((v: any) => {
      const ext = extractionMap[v.variable_id];
      const matchesSearch =
        !searchQuery ||
        v.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.section?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext?.value?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext?.quote?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (sectionFilter !== "all" && v.section !== sectionFilter) {
        return false;
      }

      if (statusFilter === "verified") return !!ext?.is_verified;
      if (statusFilter === "pending") return !ext?.is_verified;
      if (statusFilter === "low_conf") return (ext?.confidence || 0) <= 0.95;

      return true;
    });
  }, [variableList, extractionMap, searchQuery, sectionFilter, statusFilter]);

  // Distinct sections for filter chips
  const sections = useMemo(() => {
    const s = new Set<string>();
    variableList.forEach((v: any) => {
      if (v.section) s.add(v.section);
    });
    return Array.from(s);
  }, [variableList]);

  // Verification actions
  const handleVerifyDecision = async (
    varId: string,
    decision: "accepted" | "modified" | "rejected",
    customVal?: string
  ) => {
    const ext = extractionMap[varId];
    const variable = variableList.find((v: any) => v.variable_id === varId);
    if (!variable) return;

    const origVal = ext?.value || "";
    const finalVal = decision === "modified" ? (customVal || editValue || origVal) : (decision === "rejected" ? "NR" : origVal);

    try {
      await api.recordExtractionDecision({
        project_id: projectId!,
        study_id: selectedStudyId,
        variable_id: varId,
        variable_name: variable.name,
        original_value: origVal,
        corrected_value: finalVal,
        decision,
        evidence_quote: ext?.quote || "",
        page_number: ext?.source_page || 1,
        codebook_rules: customRules[varId]?.definition || "",
        reviewer: "Data Manager",
        notes: decision === "modified" ? "Manual edit on Data Sheet" : undefined,
      });

      setEditingVarId(null);
      setEditValue("");
      refetchExtractions();
      queryClient.invalidateQueries({ queryKey: ["extractions", selectedStudyId] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
    } catch (err) {
      console.error("Error recording verification on sheet:", err);
    }
  };

  // Accept all high confidence for this study
  const handleAcceptAllHighConfidence = async () => {
    const eligible = variableList.filter((v: any) => {
      const ext = extractionMap[v.variable_id];
      return ext && !ext.is_verified && (ext.confidence || 0) >= 0.95;
    });

    for (const v of eligible) {
      const ext = extractionMap[v.variable_id];
      await api.recordExtractionDecision({
        project_id: projectId!,
        study_id: selectedStudyId,
        variable_id: v.variable_id,
        variable_name: v.name,
        original_value: ext?.value || "",
        corrected_value: ext?.value || "",
        decision: "accepted",
        evidence_quote: ext?.quote || "",
        page_number: ext?.source_page || 1,
        codebook_rules: customRules[v.variable_id]?.definition || "",
        reviewer: "Auto Batch Reviewer",
        notes: "Batch Accepted via Data Sheet (>95% confidence)",
      });
    }

    refetchExtractions();
    queryClient.invalidateQueries({ queryKey: ["extractions", selectedStudyId] });
  };

  // Export CSV for active study
  const handleExportStudyCsv = () => {
    const headers = ["Study ID", "Study Title", "Variable ID", "Variable Name", "Section", "Extracted Value", "Verification Status", "Source Page", "Evidence Quote"];
    const rows = variableList.map((v: any) => {
      const ext = extractionMap[v.variable_id];
      return [
        selectedStudyId,
        `"${currentPaper.title.replace(/"/g, '""')}"`,
        v.variable_id,
        `"${(v.name || "").replace(/"/g, '""')}"`,
        `"${(v.section || "").replace(/"/g, '""')}"`,
        `"${(ext?.value || "").replace(/"/g, '""')}"`,
        ext?.is_verified ? (ext?.is_edited ? "Modified" : "Accepted") : "Pending Review",
        ext?.source_page || 1,
        `"${(ext?.quote || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data_sheet_${selectedStudyId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Combined Matrix CSV across all studies
  const handleExportAllStudiesMatrixCsv = () => {
    const headers = ["Variable ID", "Variable Name", "Section", ...availablePapers.map((p) => `"${p.title}"`)];
    const rows = variableList.map((v: any) => {
      const studyValues = availablePapers.map((p) => {
        const exts = (DEMO_EXTRACTIONS as any)[p.id] || [];
        const found = exts.find((e: any) => e.variable_id === v.variable_id);
        const val = found?.value || "NR";
        const status = found?.is_verified ? " [Verified]" : "";
        return `"${val}${status}"`;
      });

      return [
        v.variable_id,
        `"${(v.name || "").replace(/"/g, '""')}"`,
        `"${(v.section || "").replace(/"/g, '""')}"`,
        ...studyValues,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `full_matrix_benchmark_studies_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeStudyVerifiedCount = variableList.filter((v: any) => extractionMap[v.variable_id]?.is_verified).length;
  const activeStudyPercent = variableList.length > 0 ? Math.round((activeStudyVerifiedCount / variableList.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FAF9F3] text-[#141413] pb-16">
      {/* ── Top Header Navigation Bar ── */}
      <div className="bg-[#FAF9F3]/90 backdrop-blur-md border-b border-black/[0.08] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Breadcrumbs & Title */}
            <div>
              <div className="flex items-center gap-2 text-xs text-[#8A817A] mb-1">
                <Link to={`/projects/${projectId}`} className="hover:text-[#141413] transition-colors flex items-center gap-1 font-sans">
                  <ArrowLeft className="h-3 w-3" /> Dashboard
                </Link>
                <span>/</span>
                <Link to={`/projects/${projectId}/studies`} className="hover:text-[#141413] transition-colors font-sans">
                  Studies
                </Link>
                <span>/</span>
                <span className="text-[#141413] font-medium flex items-center gap-1">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#141413]" />
                  Extraction Data Sheet
                </span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="font-serif text-2xl sm:text-3xl font-normal text-[#141413] tracking-tight flex items-center gap-2">
                  <span>Study Extraction Data Sheet</span>
                  <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">
                    MATRIX VIEW
                  </span>
                </h1>
              </div>
            </div>

            {/* Right: Primary Quick Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Jump to Word-Style Track Changes PDF Viewer */}
              <Link
                to={`/projects/${projectId}/studies/${selectedStudyId}/pdf`}
                className="btn-phylo-primary text-xs"
                title="Open Split PDF Word-Style Track Changes Viewer with spatial highlighting"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Open PDF Track Changes</span>
              </Link>

              {/* In-App Codebook Designer Button */}
              <button
                onClick={() => setShowCodebookDesigner(true)}
                className="btn-phylo-secondary text-xs bg-white/80"
                title="Design codebook variables and schema directly in-app"
              >
                <Sliders className="h-3.5 w-3.5 text-[#141413]" />
                <span>Codebook Rules</span>
              </button>

              {/* Accept All >95% */}
              <button
                onClick={handleAcceptAllHighConfidence}
                className="btn-phylo-secondary text-xs bg-white/80 hover:bg-[#E9ED4C]/20"
                title="Accept all variables with confidence score higher than 95%"
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-700" />
                <span>Accept All &gt;95%</span>
              </button>

              {/* Export Dropdown / Buttons */}
              <button
                onClick={handleExportStudyCsv}
                className="btn-phylo-secondary text-xs bg-white/80"
                title="Export this study's extraction data sheet to CSV"
              >
                <Download className="h-3.5 w-3.5 text-[#6B665E]" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* ── Summary Metrics Bar (Serif numbers as per warm-editorial rules) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card-phylo p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[#8A817A] text-[10px] font-mono uppercase tracking-wider mb-1">
              <span>ACTIVE STUDY STATUS</span>
              <FileText className="h-3.5 w-3.5 text-[#141413]" />
            </div>
            <div className="font-serif text-2xl font-normal text-[#141413]">
              {activeStudyVerifiedCount} / {variableList.length} <span className="text-sm font-sans text-[#6B665E]">Verified</span>
            </div>
            <div className="mt-2 w-full bg-black/[0.06] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#141413] h-full rounded-full transition-all duration-300"
                style={{ width: `${activeStudyPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-[#8A817A] mt-1.5 block">{activeStudyPercent}% Completed</span>
          </div>

          <div className="card-phylo p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[#8A817A] text-[10px] font-mono uppercase tracking-wider mb-1">
              <span>BENCHMARK CORPUS</span>
              <Layers className="h-3.5 w-3.5 text-[#141413]" />
            </div>
            <div className="font-serif text-2xl font-normal text-[#141413]">
              6 Studies
            </div>
            <p className="text-xs font-sans text-[#6B665E] mt-1">
              {allBenchmarkStats.totalVars} total clinical extraction variables
            </p>
          </div>

          <div className="card-phylo p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[#8A817A] text-[10px] font-mono uppercase tracking-wider mb-1">
              <span>AI CONFIDENCE</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="font-serif text-2xl font-normal text-[#141413]">
              Docling v2.4
            </div>
            <p className="text-xs font-sans text-[#6B665E] mt-1">
              {allBenchmarkStats.highConfCount} variables &gt;95% confidence
            </p>
          </div>

          <div className="card-phylo p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[#8A817A] text-[10px] font-mono uppercase tracking-wider mb-1">
              <span>CROSS-STUDY MATRIX</span>
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            </div>
            <div className="font-serif text-2xl font-normal text-[#141413]">
              {allBenchmarkStats.verifiedVars} Verified
            </div>
            <button
              onClick={handleExportAllStudiesMatrixCsv}
              className="text-xs text-[#141413] hover:underline font-mono mt-1 flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Export Matrix CSV
            </button>
          </div>
        </div>

        {/* ── View Mode & Study Switcher Tabs ── */}
        <div className="card-phylo overflow-hidden mb-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <div className="px-6 py-4 border-b border-black/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F2F1EB]/50">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-black/[0.05] p-1 rounded-full">
              <button
                onClick={() => setViewMode("single")}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                  viewMode === "single"
                    ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                    : "text-[#6B665E] hover:text-[#141413]"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Single Study Sheet</span>
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                  viewMode === "matrix"
                    ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                    : "text-[#6B665E] hover:text-[#141413]"
                )}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Consolidated Multi-Study Matrix</span>
              </button>
            </div>

            {/* If Single Mode: Study Selection Pills */}
            {viewMode === "single" && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {availablePapers.map((paper, idx) => {
                  const isSelected = paper.id === selectedStudyId;
                  const paperExts = (DEMO_EXTRACTIONS as any)[paper.id] || [];
                  const paperVerified = paperExts.filter((e: any) => e.is_verified).length;

                  return (
                    <button
                      key={paper.id}
                      onClick={() => setSelectedStudyId(paper.id)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all border flex items-center gap-1.5 shrink-0",
                        isSelected
                          ? "bg-[#141413] text-[#FAF9F3] border-[#141413] shadow-2xs"
                          : "bg-white text-[#6B665E] border-black/10 hover:border-black/30 hover:text-[#141413]"
                      )}
                    >
                      <span className="font-serif font-medium">#{idx + 1} {paper.title.split("(")[0].trim()}</span>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded-full",
                        isSelected ? "bg-white/20 text-[#FAF9F3]" : "bg-black/[0.04] text-[#8A817A]"
                      )}>
                        {paperVerified}/10
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Filter & Search Toolbar (Single View) ── */}
          {viewMode === "single" && (
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search variables, values, or evidence quotes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status and Section Filters */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setStatusFilter("all")}
                    className={cn("px-2.5 py-1 rounded-md font-medium transition-colors", statusFilter === "all" ? "bg-white dark:bg-slate-900 font-bold shadow-2xs text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400")}
                  >
                    All ({variableList.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter("verified")}
                    className={cn("px-2.5 py-1 rounded-md font-medium transition-colors", statusFilter === "verified" ? "bg-white dark:bg-slate-900 font-bold shadow-2xs text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400")}
                  >
                    Verified ({activeStudyVerifiedCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter("pending")}
                    className={cn("px-2.5 py-1 rounded-md font-medium transition-colors", statusFilter === "pending" ? "bg-white dark:bg-slate-900 font-bold shadow-2xs text-amber-700 dark:text-amber-400" : "text-slate-600 dark:text-slate-400")}
                  >
                    Pending ({variableList.length - activeStudyVerifiedCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter("low_conf")}
                    className={cn("px-2.5 py-1 rounded-md font-medium transition-colors", statusFilter === "low_conf" ? "bg-white dark:bg-slate-900 font-bold shadow-2xs text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-400")}
                  >
                    Low Conf
                  </button>
                </div>

                {/* Section Filter */}
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs font-medium"
                >
                  <option value="all">All Sections</option>
                  {sections.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 1: SINGLE STUDY RECORDED EXTRACTION SHEET TABLE
          ══════════════════════════════════════════════════════════ */}
          {viewMode === "single" && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left w-12">#</th>
                    <th className="px-4 py-3 text-left min-w-[140px]">Variable</th>
                    <th className="px-4 py-3 text-left min-w-[100px]">Section</th>
                    <th className="px-4 py-3 text-left min-w-[200px]">Extracted / Verified Value</th>
                    <th className="px-4 py-3 text-left w-24">Confidence</th>
                    <th className="px-4 py-3 text-left w-36">Verification Status</th>
                    <th className="px-4 py-3 text-left min-w-[280px]">Evidence Source Quote</th>
                    <th className="px-4 py-3 text-center w-16">Page</th>
                    <th className="px-4 py-3 text-right min-w-[160px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                  {filteredVariables.map((v: any, idx: number) => {
                    const ext = extractionMap[v.variable_id];
                    const isVerified = ext?.is_verified;
                    const isEdited = ext?.is_edited;
                    const isLowConf = (ext?.confidence || 0) <= 0.95;
                    const isEditingThis = editingVarId === v.variable_id;

                    return (
                      <tr
                        key={v.variable_id}
                        className={cn(
                          "transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                          isLowConf && !isVerified && "bg-amber-50/30 dark:bg-amber-950/20",
                          idx % 2 === 1 && "bg-slate-50/20"
                        )}
                      >
                        {/* Index */}
                        <td className="px-4 py-3.5 font-mono text-slate-400 font-semibold">
                          #{idx + 1}
                        </td>

                        {/* Variable Name */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{v.name}</span>
                          </div>
                          {customRules[v.variable_id]?.definition && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[220px]" title={customRules[v.variable_id].definition}>
                              {customRules[v.variable_id].definition}
                            </div>
                          )}
                        </td>

                        {/* Section */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {v.section || "General"}
                          </span>
                        </td>

                        {/* Extracted Value / Inline Editor */}
                        <td className="px-4 py-3.5">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono font-bold bg-white text-slate-900"
                                autoFocus
                              />
                              <button
                                onClick={() => handleVerifyDecision(v.variable_id, "modified", editValue)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                title="Save & Accept"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingVarId(null)}
                                className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/val">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                                {ext?.value || <span className="text-slate-400 italic">Not Reported</span>}
                              </span>
                              {isEdited && (
                                <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0.2 rounded font-sans">
                                  edited
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setEditingVarId(v.variable_id);
                                  setEditValue(ext?.value || "");
                                }}
                                className="opacity-0 group-hover/val:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity"
                                title="Edit Value"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Confidence */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {ext?.confidence != null ? (
                            <span
                              className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border",
                                ext.confidence >= 0.95
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300"
                                  : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300"
                              )}
                            >
                              {Math.round(ext.confidence * 100)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">—</span>
                          )}
                        </td>

                        {/* Verification Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full shadow-2xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isEdited ? "Modified" : "Accepted"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                              <span>Pending Review</span>
                            </span>
                          )}
                        </td>

                        {/* Evidence Quote */}
                        <td className="px-4 py-3.5">
                          {ext?.quote ? (
                            <div className="flex items-start gap-1.5 group/quote">
                              <span className="text-slate-400 text-xs shrink-0 select-none">“</span>
                              <p className="text-slate-600 dark:text-slate-300 italic text-[11px] leading-relaxed line-clamp-2" title={ext.quote}>
                                {ext.quote}
                              </p>
                              <span className="text-slate-400 text-xs shrink-0 select-none">”</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Source Page */}
                        <td className="px-4 py-3.5 text-center font-mono text-slate-500 whitespace-nowrap">
                          P. {ext?.source_page || 1}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Jump to Quote in PDF Viewer */}
                            <Link
                              to={`/projects/${projectId}/studies/${selectedStudyId}/pdf?var=${v.variable_id}`}
                              className="px-2 py-1 text-[11px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1"
                              title="Jump directly to this exact quote highlight in the PDF viewer"
                            >
                              <Eye className="h-3 w-3 text-blue-600" />
                              <span>View Quote</span>
                            </Link>

                            {/* Quick Accept */}
                            {!isVerified && (
                              <button
                                onClick={() => handleVerifyDecision(v.variable_id, "accepted")}
                                className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                                title="Accept this proposed extraction"
                              >
                                Accept
                              </button>
                            )}

                            {/* Quick Reject */}
                            {!isVerified && (
                              <button
                                onClick={() => handleVerifyDecision(v.variable_id, "rejected")}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                                title="Reject extraction"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredVariables.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-sm">No variables match the current filters</p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                      setSectionFilter("all");
                    }}
                    className="mt-2 text-xs text-blue-600 hover:underline"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW 2: CONSOLIDATED CROSS-STUDY MATRIX
          ══════════════════════════════════════════════════════════ */}
          {viewMode === "matrix" && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3.5 text-left w-56 sticky left-0 bg-slate-50 dark:bg-slate-850 z-20 shadow-xs">
                      Variable & Domain
                    </th>
                    {availablePapers.map((paper, idx) => (
                      <th key={paper.id} className="px-4 py-3.5 text-left min-w-[200px]">
                        <div className="flex flex-col">
                          <span className="text-blue-600 font-bold text-[10px]">Study #{idx + 1}</span>
                          <span className="font-bold text-slate-900 dark:text-white truncate" title={paper.title}>
                            {paper.title.split("(")[0].trim()}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal truncate">
                            {paper.title.includes("(") ? paper.title.split("(")[1].replace(")", "") : ""}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {variableList.map((v: any, vIdx: number) => (
                    <tr key={v.variable_id} className={vIdx % 2 === 1 ? "bg-slate-50/20" : ""}>
                      {/* Left Frozen Column: Variable */}
                      <td className="px-4 py-3.5 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="font-bold text-slate-900 dark:text-white">
                          #{vIdx + 1} {v.name}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {v.section || "General"}
                        </span>
                      </td>

                      {/* Columns for Each Study */}
                      {availablePapers.map((paper) => {
                        const paperExts = (DEMO_EXTRACTIONS as any)[paper.id] || [];
                        const foundExt = paperExts.find((e: any) => e.variable_id === v.variable_id);
                        const isVerified = !!foundExt?.is_verified;
                        const value = foundExt?.value || "Not Reported";

                        return (
                          <td key={paper.id} className="px-4 py-3.5 group/cell hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[150px]" title={value}>
                                  {value}
                                </span>
                                {isVerified ? (
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Human-Verified" />
                                ) : (
                                  <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Pending Review" />
                                )}
                              </div>

                              {foundExt?.quote && (
                                <p className="text-[10px] text-slate-400 italic truncate max-w-[180px]" title={foundExt.quote}>
                                  “{foundExt.quote}”
                                </p>
                              )}

                              <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                                <span className="text-slate-400 font-mono">
                                  {foundExt?.confidence ? `${Math.round(foundExt.confidence * 100)}% conf` : ""}
                                </span>
                                <Link
                                  to={`/projects/${projectId}/studies/${paper.id}/pdf?var=${v.variable_id}`}
                                  className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity"
                                >
                                  <span>View PDF</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </Link>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer Information ── */}
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              All recorded variables adhere strictly to your study protocol and codebook rules. Changes made here persist directly into the review matrix.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}/studies/${selectedStudyId}/pdf`}
              className="text-blue-600 hover:underline font-semibold flex items-center gap-1"
            >
              <span>Switch to PDF Word-Style Track Changes Reviewer</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Codebook Designer Modal ── */}
      {showCodebookDesigner && (
        <CodebookDesignerModal
          isOpen={showCodebookDesigner}
          onClose={() => setShowCodebookDesigner(false)}
          onCodebookUpdated={(updatedVars, updatedRules) => {
            setCustomRules(updatedRules);
            try {
              localStorage.setItem("radextract_codebook_rules", JSON.stringify(updatedRules));
            } catch (e) {}
            queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
          }}
        />
      )}
    </div>
  );
}
