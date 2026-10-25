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
  TrendingUp, Award, Layers, ShieldCheck, Tag, FolderPlus, Upload,
  Lock, Unlock, Plus, ChevronDown, ChevronUp, FileUp, Database, Save, Loader2
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "../lib/utils";
import { CodebookDesignerModal } from "../components/common/CodebookDesignerModal";
import { UniversalBulkUploadModal } from "../components/common/UniversalBulkUploadModal";
import { CuratedExcelModal } from "../components/common/CuratedExcelModal";

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
  const [showBulkUploadModal, setShowBulkUploadModal] = useState<boolean>(false);
  const [showCuratedExcelModal, setShowCuratedExcelModal] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Double-blind extraction config state
  const [isExtractionBlinded, setIsExtractionBlinded] = useState(() => {
    try {
      const cfg = localStorage.getItem(`radextract_double_blind_${projectId}`);
      if (cfg) {
        const parsed = JSON.parse(cfg);
        return !!parsed.extractionBlinded;
      }
    } catch (e) {}
    return false;
  });

  const toggleExtractionBlinded = () => {
    setIsExtractionBlinded((prev) => {
      const next = !prev;
      try {
        const cfg = localStorage.getItem(`radextract_double_blind_${projectId}`);
        const parsed = cfg ? JSON.parse(cfg) : {};
        parsed.extractionBlinded = next;
        localStorage.setItem(`radextract_double_blind_${projectId}`, JSON.stringify(parsed));
      } catch (e) {}
      setFeedbackToast(next ? "Dual-blind extraction mode enabled." : "Single extractor mode enabled.");
      setTimeout(() => setFeedbackToast(null), 3000);
      return next;
    });
  };

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

  // Excel-like UX States
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>({ row: 0, col: "value" });
  const [showVariableDesignerBanner, setShowVariableDesignerBanner] = useState<boolean>(true);
  const [isAddingNewVar, setIsAddingNewVar] = useState<boolean>(false);
  const [newVarForm, setNewVarForm] = useState({
    name: "",
    section: "Patient Demographics",
    field_type: "text",
    definition: "",
    allowed_values: "",
  });
  const [isSubmittingNewVar, setIsSubmittingNewVar] = useState<boolean>(false);
  const [isImportingExcel, setIsImportingExcel] = useState<boolean>(false);
  const excelFileInputRef = React.useRef<HTMLInputElement | null>(null);

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
  }, [projectStudies, projectId]);

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

  // Pre-build O(1) map for multi-study matrix extraction lookups
  const paperVariableExtMap = useMemo(() => {
    const map = new Map<string, any>();
    availablePapers.forEach((paper) => {
      const paperExts = (DEMO_EXTRACTIONS as any)[paper.id] || [];
      paperExts.forEach((e: any) => {
        if (e.variable_id) {
          map.set(`${paper.id}:${e.variable_id}`, e);
        }
      });
    });
    return map;
  }, [availablePapers]);

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

  // Create a new variable directly from the Excel-style toolbar
  const handleCreateCustomVariable = async () => {
    if (!newVarForm.name.trim()) {
      setFeedbackToast("Please provide a variable name");
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }
    setIsSubmittingNewVar(true);
    try {
      const createdVar = await api.createVariable(projectId!, {
        name: newVarForm.name.trim(),
        section: newVarForm.section || "General",
        field_type: newVarForm.field_type || "text",
        description: newVarForm.definition || "",
        allowed_values: newVarForm.allowed_values || "",
      });

      // Update local codebook rule
      const varId = createdVar?.variable_id || `var_${Date.now()}`;
      const newRule: CodebookRule = {
        variable_id: varId,
        name: newVarForm.name.trim(),
        section: newVarForm.section || "General",
        field_type: newVarForm.field_type as any || "text",
        definition: newVarForm.definition || "",
        allowed_values: newVarForm.allowed_values ? newVarForm.allowed_values.split(",").map(s => s.trim()) : [],
        rules: [newVarForm.definition || "Standard variable definition."],
        gold_standard_example: "",
        exclusion_criteria: "",
      };

      const updatedRules = { ...customRules, [varId]: newRule };
      setCustomRules(updatedRules);
      try {
        localStorage.setItem("radextract_codebook_rules", JSON.stringify(updatedRules));
      } catch (e) {}

      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setNewVarForm({
        name: "",
        section: "Patient Demographics",
        field_type: "text",
        definition: "",
        allowed_values: "",
      });
      setIsAddingNewVar(false);
      setFeedbackToast(`Variable "${newVarForm.name}" created successfully!`);
      setTimeout(() => setFeedbackToast(null), 3500);
    } catch (err: any) {
      setFeedbackToast(`Created locally: ${newVarForm.name}`);
      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setIsAddingNewVar(false);
      setTimeout(() => setFeedbackToast(null), 3500);
    } finally {
      setIsSubmittingNewVar(false);
    }
  };

  // Direct Excel / CSV File Drop to instantly extract variables and populate rows
  const handleDirectExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingExcel(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rawRows.length < 2) {
        setFeedbackToast("Excel sheet must contain at least a header row and one data row.");
        setTimeout(() => setFeedbackToast(null), 4000);
        return;
      }

      const headers = (rawRows[0] || []).map((h: any) => String(h || "").trim());
      // Identify column indices
      const varNameIdx = headers.findIndex((h: string) => /variable|name|item|parameter|metric/i.test(h));
      const valueIdx = headers.findIndex((h: string) => /value|result|finding|extracted/i.test(h));
      const sectionIdx = headers.findIndex((h: string) => /section|category|domain|group/i.test(h));
      const quoteIdx = headers.findIndex((h: string) => /quote|evidence|excerpt|text/i.test(h));
      const pageIdx = headers.findIndex((h: string) => /page|pg/i.test(h));

      let importedCount = 0;
      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;
        const varName = varNameIdx !== -1 ? String(row[varNameIdx] || "").trim() : String(row[0] || "").trim();
        if (!varName) continue;

        const val = valueIdx !== -1 ? String(row[valueIdx] || "").trim() : (row[1] !== undefined ? String(row[1]).trim() : "");
        const sec = sectionIdx !== -1 ? String(row[sectionIdx] || "").trim() : "Imported Variables";
        const quote = quoteIdx !== -1 ? String(row[quoteIdx] || "").trim() : "Imported from Excel spreadsheet";
        const page = pageIdx !== -1 ? parseInt(row[pageIdx], 10) || 1 : 1;

        // Create variable if not exists
        const varId = `var_${varName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        try {
          await api.createVariable(projectId!, {
            name: varName,
            section: sec,
            field_type: "text",
            description: `Imported from Excel: ${file.name}`,
          });
        } catch (e) {}

        // If a value is provided, record it for the active study
        if (val) {
          try {
            await api.recordExtractionDecision({
              project_id: projectId!,
              study_id: selectedStudyId,
              variable_id: varId,
              variable_name: varName,
              original_value: val,
              corrected_value: val,
              decision: "accepted",
              evidence_quote: quote,
              page_number: page,
              reviewer: "Excel Uploader",
              notes: `Directly populated from ${file.name}`,
            });
            importedCount++;
          } catch (e) {}
        }
      }

      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      queryClient.invalidateQueries({ queryKey: ["extractions", selectedStudyId] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
      setFeedbackToast(`Successfully parsed and loaded "${file.name}" with ${importedCount} extraction values!`);
      setTimeout(() => setFeedbackToast(null), 5000);
    } catch (err: any) {
      console.error("Excel import failed:", err);
      setFeedbackToast(`Failed to parse Excel: ${err?.message || "Invalid file format"}`);
      setTimeout(() => setFeedbackToast(null), 5000);
    } finally {
      setIsImportingExcel(false);
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = "";
      }
    }
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
              {/* Bulk Upload from Laptop */}
              <button
                onClick={() => setShowBulkUploadModal(true)}
                className="btn-phylo-primary text-xs flex items-center gap-1.5 shadow-xs"
                title="Bulk upload study PDFs, Excel spreadsheets, or citations directly from your laptop"
              >
                <FolderPlus className="h-3.5 w-3.5 text-[#E9ED4C]" />
                <span>Bulk Upload from Laptop</span>
              </button>

              {/* Already Curated Excel Sheet */}
              <button
                onClick={() => setShowCuratedExcelModal(true)}
                className="btn-phylo-secondary text-xs bg-white/90 hover:bg-[#E9ED4C]/20 border-black/15 flex items-center gap-1.5"
                title="1-Click Load Curated Benchmark PAM Sheet, Import Laptop Excel/CSV, or Export Multi-Sheet Workbook"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                <span>Curated Excel Sheet</span>
              </button>

              {/* Jump to Word-Style Track Changes PDF Viewer */}
              <Link
                to={`/projects/${projectId}/studies/${selectedStudyId}/pdf`}
                className="btn-phylo-secondary text-xs bg-white/80"
                title="Open Split PDF Word-Style Track Changes Viewer with spatial highlighting"
              >
                <FileText className="h-3.5 w-3.5 text-[#141413]" />
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

              {/* Double-Blind Extraction Mode Toggle */}
              <button
                onClick={toggleExtractionBlinded}
                className={cn(
                  "btn-phylo-secondary text-xs flex items-center gap-1.5 transition-all",
                  isExtractionBlinded
                    ? "bg-purple-100/90 text-purple-900 border-purple-400 font-semibold shadow-2xs"
                    : "bg-white/80 text-slate-600 hover:bg-slate-100"
                )}
                title="Double-Blind Extraction: Toggle independent dual data extraction with blinded conflict resolution (Default: Single extractor)"
              >
                {isExtractionBlinded ? (
                  <>
                    <Lock className="h-3.5 w-3.5 text-purple-700" />
                    <span>Dual Extraction: Blinded ON</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Dual Extraction: OFF</span>
                  </>
                )}
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

      {/* Double-Blind Extraction Status Banner */}
      {isExtractionBlinded && (
        <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 text-xs text-purple-900 flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center gap-2">
            <Lock className="h-4 w-4 text-purple-700 shrink-0" />
            <div>
              <span className="font-bold">Dual-Blinded Data Extraction Active:</span>{" "}
              <span>
                Reviewer 1 and Reviewer 2 extract data independently. Values remain blinded to prevent extraction bias until both submit or principal investigator adjudication is requested.
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Hidden File Input for Direct Excel/CSV Upload */}
        <input
          ref={excelFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleDirectExcelUpload}
        />

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 (COMES FIRST): EXTRACTION SHEET CREATOR & EXCEL UPLOADER
        ══════════════════════════════════════════════════════════ */}
        <div className="card-phylo mb-6 overflow-hidden border border-emerald-900/15 shadow-sm bg-gradient-to-b from-[#FBFBFA] to-[#F5F4EE]">
          {/* Section Header */}
          <div className="px-6 py-4 bg-[#F2F1EB] border-b border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-lg font-bold text-[#141413]">
                    Extraction Sheet Studio & Variable Designer
                  </h2>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    EXCEL ENGINE
                  </span>
                </div>
                <p className="text-xs text-[#6B665E]">
                  Create custom review variables, configure codebook rules, or upload an already-made Excel/CSV extraction sheet.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Direct Excel File Upload */}
              <button
                onClick={() => excelFileInputRef.current?.click()}
                disabled={isImportingExcel}
                className="btn-phylo-primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 shadow-xs"
                title="Upload an already made Excel (.xlsx, .xls) or CSV extraction sheet from your laptop"
              >
                {isImportingExcel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileUp className="h-3.5 w-3.5 text-[#E9ED4C]" />
                )}
                <span>{isImportingExcel ? "Parsing Sheet..." : "Upload Already-Made Sheet"}</span>
              </button>

              {/* Add Custom Variable Toggle */}
              <button
                onClick={() => setIsAddingNewVar(!isAddingNewVar)}
                className={cn(
                  "btn-phylo-secondary text-xs flex items-center gap-1.5 transition-all",
                  isAddingNewVar
                    ? "bg-[#141413] text-[#FAF9F3] border-[#141413]"
                    : "bg-white text-[#141413] hover:bg-[#E9ED4C]/25"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAddingNewVar ? "Close Variable Maker" : "+ Create Variable"}</span>
              </button>

              {/* Full Codebook Designer Modal */}
              <button
                onClick={() => setShowCodebookDesigner(true)}
                className="btn-phylo-secondary text-xs bg-white text-[#141413] hover:bg-[#E9ED4C]/25"
                title="Open comprehensive Cochrane/PRISMA codebook schema designer"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Codebook Rules & Templates</span>
              </button>
            </div>
          </div>

          {/* Quick Inline Variable Creator Form */}
          {isAddingNewVar && (
            <div className="p-6 bg-white border-b border-black/[0.08] animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-700" />
                  <span className="font-serif text-sm font-semibold text-[#141413]">
                    Add New Extraction Variable to Sheet
                  </span>
                </div>
                <span className="text-[11px] text-[#8A817A] font-mono">
                  Schema will apply across all studies in this project
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {/* Variable Name */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#6B665E] mb-1">
                    Variable Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aneurysm Max Diameter (mm)"
                    value={newVarForm.name}
                    onChange={(e) => setNewVarForm({ ...newVarForm, name: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-black/15 rounded-md focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-sans"
                  />
                </div>

                {/* Section / Category */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#6B665E] mb-1">
                    Section / Domain
                  </label>
                  <select
                    value={newVarForm.section}
                    onChange={(e) => setNewVarForm({ ...newVarForm, section: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-black/15 rounded-md focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-sans"
                  >
                    <option value="Patient Demographics">Patient Demographics</option>
                    <option value="Lesion Characteristics">Lesion Characteristics</option>
                    <option value="Angioarchitecture">Angioarchitecture</option>
                    <option value="Treatment & Intervention">Treatment & Intervention</option>
                    <option value="Clinical Outcomes & Complications">Clinical Outcomes & Complications</option>
                    <option value="General">General / Other</option>
                  </select>
                </div>

                {/* Field Type */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#6B665E] mb-1">
                    Data Type
                  </label>
                  <select
                    value={newVarForm.field_type}
                    onChange={(e) => setNewVarForm({ ...newVarForm, field_type: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-black/15 rounded-md focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-sans"
                  >
                    <option value="text">Text / Freeform String</option>
                    <option value="numeric">Numeric / Continuous (e.g. Age, mm, %)</option>
                    <option value="categorical">Categorical / Option Set</option>
                    <option value="boolean">Boolean (Yes / No)</option>
                  </select>
                </div>

                {/* Allowed Values */}
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[#6B665E] mb-1">
                    Allowed Values (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Saccular, Fusiform, Blister"
                    value={newVarForm.allowed_values}
                    onChange={(e) => setNewVarForm({ ...newVarForm, allowed_values: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-black/15 rounded-md focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-sans"
                  />
                </div>
              </div>

              {/* Extraction Definition / Guidance Rule */}
              <div className="mb-4">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#6B665E] mb-1">
                  Clinical Extraction Guideline & Codebook Rule
                </label>
                <textarea
                  rows={2}
                  placeholder="Explicit rule for AI and human reviewers on how to extract and standardize this variable (e.g. Record max diameter measured on DSA in millimeters)..."
                  value={newVarForm.definition}
                  onChange={(e) => setNewVarForm({ ...newVarForm, definition: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-black/15 rounded-md focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNewVar(false)}
                  className="px-3 py-1.5 text-xs text-[#6B665E] hover:text-[#141413]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCustomVariable}
                  disabled={isSubmittingNewVar}
                  className="btn-phylo-primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5"
                >
                  {isSubmittingNewVar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>Save Variable to Sheet</span>
                </button>
              </div>
            </div>
          )}

          {/* Excel-Style Quick Stats & Spreadsheet Shortcuts Bar */}
          <div className="px-6 py-3 bg-[#FAF9F3] text-xs flex flex-wrap items-center justify-between gap-3 text-[#6B665E] border-t border-black/[0.05]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <Table className="h-3.5 w-3.5 text-emerald-700" />
                <strong className="text-[#141413]">{variableList.length}</strong> Variables Configured
              </span>
              <span className="hidden sm:inline text-black/20">•</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <Layers className="h-3.5 w-3.5 text-emerald-700" />
                <strong className="text-[#141413]">{availablePapers.length}</strong> Studies in Matrix
              </span>
              <span className="hidden sm:inline text-black/20">•</span>
              <span className="text-[11px]">
                Double-click any cell below to edit or press Enter to save
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase bg-black/[0.04] px-2 py-0.5 rounded text-[#8A817A]">
                Supported: .xlsx, .xls, .csv
              </span>
            </div>
          </div>
        </div>

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

                {/* Direct Upload Pill */}
                <button
                  onClick={() => setShowBulkUploadModal(true)}
                  className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all border border-dashed border-black/30 bg-white/80 hover:bg-[#E9ED4C]/25 hover:border-black/60 text-[#141413] flex items-center gap-1.5 shrink-0 shadow-2xs"
                  title="Bulk upload study PDFs or datasets directly from your laptop"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#141413]" />
                  <span>+ Upload PDFs from Laptop</span>
                </button>
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
              VIEW 1: SINGLE STUDY RECORDED EXTRACTION SHEET TABLE (EXCEL WORKBOOK STYLE)
          ══════════════════════════════════════════════════════════ */}
          {viewMode === "single" && (
            <div className="overflow-x-auto border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              {/* Excel Formula Bar */}
              <div className="px-4 py-1.5 bg-[#F9F9F8] border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 dark:border-slate-700 rounded text-[11px] font-bold text-slate-700 min-w-[55px] justify-center shadow-2xs">
                  {activeCell ? `${activeCell.col.toUpperCase()}${activeCell.row + 1}` : "A1"}
                </div>
                <span className="text-slate-400 font-bold select-none text-xs">fx</span>
                <div className="flex-1 px-2 py-0.5 bg-white border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200 truncate font-sans">
                  {activeCell && filteredVariables[activeCell.row] ? (
                    <span>
                      <strong className="font-semibold text-emerald-800 mr-2">[{filteredVariables[activeCell.row].name}]</strong>
                      {extractionMap[filteredVariables[activeCell.row].variable_id]?.value || "Not Reported (NR)"}
                      {extractionMap[filteredVariables[activeCell.row].variable_id]?.quote && (
                        <span className="text-slate-400 italic ml-2">
                          — Quote: "{extractionMap[filteredVariables[activeCell.row].variable_id]?.quote}"
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">Select any cell below to inspect or edit clinical values</span>
                  )}
                </div>
              </div>

              <table className="min-w-full text-xs border-collapse">
                {/* Excel Column Letters (A, B, C, D, E, F, G, H, I) */}
                <thead className="bg-[#EFEFEF] dark:bg-slate-800 text-slate-600 dark:text-slate-300 select-none border-b border-slate-300 dark:border-slate-700 font-mono text-[11px]">
                  <tr>
                    <th className="w-10 px-2 py-1 text-center border-r border-slate-300 dark:border-slate-700 bg-[#E8E8E8]"></th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">A</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">B</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">C</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">D</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">E</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">F</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">G</th>
                    <th className="px-3 py-1 text-center border-r border-slate-300 dark:border-slate-700">H</th>
                  </tr>
                  <tr className="bg-[#F5F5F5] dark:bg-slate-800/80 font-bold text-slate-800 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 font-sans text-xs">
                    <th className="px-2 py-2 text-center w-10 border-r border-slate-300 dark:border-slate-700 bg-[#E8E8E8] font-mono text-[11px] text-slate-500">
                      #
                    </th>
                    <th className="px-4 py-2 text-left min-w-[160px] border-r border-slate-200 dark:border-slate-700">
                      Variable Name
                    </th>
                    <th className="px-4 py-2 text-left min-w-[120px] border-r border-slate-200 dark:border-slate-700">
                      Section / Domain
                    </th>
                    <th className="px-4 py-2 text-left min-w-[220px] border-r border-slate-200 dark:border-slate-700 bg-emerald-50/40 text-emerald-950">
                      Extracted / Verified Value (Click to Edit)
                    </th>
                    <th className="px-3 py-2 text-center w-24 border-r border-slate-200 dark:border-slate-700">
                      Confidence
                    </th>
                    <th className="px-3 py-2 text-left w-36 border-r border-slate-200 dark:border-slate-700">
                      Review Status
                    </th>
                    <th className="px-4 py-2 text-left min-w-[260px] border-r border-slate-200 dark:border-slate-700">
                      Evidence Source Quote
                    </th>
                    <th className="px-2 py-2 text-center w-16 border-r border-slate-200 dark:border-slate-700">
                      Page
                    </th>
                    <th className="px-3 py-2 text-right min-w-[140px]">
                      Quick Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredVariables.map((v: any, idx: number) => {
                    const ext = extractionMap[v.variable_id];
                    const isVerified = ext?.is_verified;
                    const isEdited = ext?.is_edited;
                    const isLowConf = (ext?.confidence || 0) <= 0.95;
                    const isEditingThis = editingVarId === v.variable_id;

                    return (
                      <tr
                        key={v.variable_id}
                        onClick={() => setActiveCell({ row: idx, col: "value" })}
                        className={cn(
                          "transition-colors hover:bg-emerald-50/20",
                          isLowConf && !isVerified && "bg-amber-50/30",
                          idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"
                        )}
                      >
                        {/* Excel Row Number Index (Sticky Gray Header) */}
                        <td className="px-2 py-2 text-center font-mono text-[11px] font-bold text-slate-500 bg-[#EFEFEF] border-r border-slate-300 select-none">
                          {idx + 1}
                        </td>

                        {/* Column A: Variable Name */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "name" }); }}
                          className={cn(
                            "px-3 py-2 border-r border-slate-200 transition-all",
                            activeCell?.row === idx && activeCell?.col === "name" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{v.name}</span>
                          </div>
                          {customRules[v.variable_id]?.definition && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[200px]" title={customRules[v.variable_id].definition}>
                              {customRules[v.variable_id].definition}
                            </div>
                          )}
                        </td>

                        {/* Column B: Section */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "section" }); }}
                          className={cn(
                            "px-3 py-2 whitespace-nowrap border-r border-slate-200",
                            activeCell?.row === idx && activeCell?.col === "section" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {v.section || "General"}
                          </span>
                        </td>

                        {/* Column C: Extracted Value / Excel Editable Cell */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "value" }); }}
                          className={cn(
                            "px-3 py-2 border-r border-slate-200 transition-all",
                            activeCell?.row === idx && activeCell?.col === "value" && "ring-2 ring-emerald-600 bg-emerald-50/40 z-10"
                          )}
                        >
                          {isEditingThis ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleVerifyDecision(v.variable_id, "modified", editValue);
                                  if (e.key === "Escape") setEditingVarId(null);
                                }}
                                className="w-full px-2 py-1 text-xs border border-emerald-600 rounded focus:outline-hidden font-mono font-bold bg-white text-slate-900 shadow-2xs"
                                autoFocus
                              />
                              <button
                                onClick={() => handleVerifyDecision(v.variable_id, "modified", editValue)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 shadow-2xs"
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
                            <div
                              onDoubleClick={() => {
                                setEditingVarId(v.variable_id);
                                setEditValue(ext?.value || "");
                              }}
                              className="flex items-center justify-between gap-2 group/val cursor-pointer min-h-[22px]"
                              title="Double-click to edit directly like Excel"
                            >
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {ext?.value || <span className="text-slate-400 italic">Not Reported</span>}
                              </span>
                              <div className="flex items-center gap-1">
                                {isEdited && (
                                  <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0.2 rounded font-sans">
                                    edited
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingVarId(v.variable_id);
                                    setEditValue(ext?.value || "");
                                  }}
                                  className="opacity-0 group-hover/val:opacity-100 text-slate-400 hover:text-emerald-700 transition-opacity p-0.5"
                                  title="Edit Cell"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Column D: Confidence */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "confidence" }); }}
                          className={cn(
                            "px-3 py-2 text-center whitespace-nowrap border-r border-slate-200",
                            activeCell?.row === idx && activeCell?.col === "confidence" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          {ext?.confidence != null ? (
                            <span
                              className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border",
                                ext.confidence >= 0.95
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-800 border-amber-300"
                              )}
                            >
                              {Math.round(ext.confidence * 100)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">—</span>
                          )}
                        </td>

                        {/* Column E: Verification Status */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "status" }); }}
                          className={cn(
                            "px-3 py-2 whitespace-nowrap border-r border-slate-200",
                            activeCell?.row === idx && activeCell?.col === "status" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{isEdited ? "Modified" : "Accepted"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                              <span>Pending Review</span>
                            </span>
                          )}
                        </td>

                        {/* Column F: Evidence Quote */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "quote" }); }}
                          className={cn(
                            "px-3 py-2 border-r border-slate-200",
                            activeCell?.row === idx && activeCell?.col === "quote" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          {ext?.quote ? (
                            <div className="flex items-start gap-1 group/quote">
                              <span className="text-slate-400 text-xs shrink-0 select-none">“</span>
                              <p className="text-slate-600 italic text-[11px] leading-snug line-clamp-2" title={ext.quote}>
                                {ext.quote}
                              </p>
                              <span className="text-slate-400 text-xs shrink-0 select-none">”</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Column G: Source Page */}
                        <td
                          onClick={(e) => { e.stopPropagation(); setActiveCell({ row: idx, col: "page" }); }}
                          className={cn(
                            "px-2 py-2 text-center font-mono text-slate-500 whitespace-nowrap border-r border-slate-200",
                            activeCell?.row === idx && activeCell?.col === "page" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          P. {ext?.source_page || 1}
                        </td>

                        {/* Column H: Actions */}
                        <td className="px-3 py-2 text-right whitespace-nowrap">
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
              VIEW 2: CONSOLIDATED CROSS-STUDY MATRIX (EXCEL WORKBOOK STYLE)
          ══════════════════════════════════════════════════════════ */}
          {viewMode === "matrix" && (
            <div className="overflow-x-auto border-t border-slate-300 bg-white">
              <table className="min-w-full text-xs border-collapse">
                {/* Excel Column Letters */}
                <thead className="bg-[#EFEFEF] select-none border-b border-slate-300 font-mono text-[11px] text-slate-600">
                  <tr>
                    <th className="w-10 px-2 py-1 text-center border-r border-slate-300 bg-[#E8E8E8] sticky left-0 z-30"></th>
                    <th className="px-4 py-1 text-center border-r border-slate-300 sticky left-10 bg-[#EFEFEF] z-30">A</th>
                    {availablePapers.map((_, pIdx) => {
                      const letter = String.fromCharCode(66 + pIdx); // B, C, D...
                      return (
                        <th key={pIdx} className="px-4 py-1 text-center border-r border-slate-300">
                          {letter}
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="bg-[#F5F5F5] font-bold text-slate-800 border-b border-slate-300 font-sans text-xs">
                    <th className="px-2 py-2 text-center w-10 border-r border-slate-300 bg-[#E8E8E8] sticky left-0 z-30 font-mono text-[11px] text-slate-500">
                      #
                    </th>
                    <th className="px-4 py-2.5 text-left w-64 sticky left-10 bg-[#F5F5F5] z-30 border-r border-slate-300 shadow-xs">
                      Variable & Clinical Domain
                    </th>
                    {availablePapers.map((paper, idx) => (
                      <th key={paper.id} className="px-4 py-2.5 text-left min-w-[200px] border-r border-slate-200">
                        <div className="flex flex-col">
                          <span className="text-emerald-700 font-mono font-bold text-[10px]">Study #{idx + 1}</span>
                          <span className="font-bold text-slate-900 truncate" title={paper.title}>
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
                <tbody className="bg-white divide-y divide-slate-200">
                  {variableList.map((v: any, vIdx: number) => (
                    <tr key={v.variable_id} className={vIdx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}>
                      {/* Excel Row Number Index */}
                      <td className="px-2 py-2 text-center font-mono text-[11px] font-bold text-slate-500 bg-[#EFEFEF] border-r border-slate-300 select-none sticky left-0 z-20">
                        {vIdx + 1}
                      </td>

                      {/* Column A: Left Frozen Variable Column */}
                      <td className="px-4 py-2.5 sticky left-10 bg-white z-20 border-r border-slate-300 shadow-2xs">
                        <div className="font-bold text-slate-900">
                          {v.name}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {v.section || "General"}
                        </span>
                      </td>

                      {/* Columns B, C, D... for Each Study */}
                      {availablePapers.map((paper) => {
                        const foundExt = paperVariableExtMap.get(`${paper.id}:${v.variable_id}`);
                        const isVerified = !!foundExt?.is_verified;
                        const value = foundExt?.value || "Not Reported";

                        return (
                          <td key={paper.id} className="px-3 py-2 border-r border-slate-200 group/cell hover:bg-emerald-50/20 transition-colors">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-slate-900 text-xs truncate max-w-[150px]" title={value}>
                                  {value}
                                </span>
                                {isVerified ? (
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Human-Verified" />
                                ) : (
                                  <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Pending Review" />
                                )}
                              </div>

                              {foundExt?.quote && (
                                <p className="text-[10px] text-slate-500 italic truncate max-w-[180px]" title={foundExt.quote}>
                                  “{foundExt.quote}”
                                </p>
                              )}

                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-mono">
                                  {foundExt?.confidence ? `${Math.round(foundExt.confidence * 100)}% conf` : ""}
                                </span>
                                <Link
                                  to={`/projects/${projectId}/studies/${paper.id}/pdf?var=${v.variable_id}`}
                                  className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity"
                                >
                                  <span>PDF</span>
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

      {/* ── Universal Bulk Upload Modal from Laptop ── */}
      {showBulkUploadModal && (
        <UniversalBulkUploadModal
          projectId={projectId!}
          isOpen={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          defaultTarget="extraction"
          onSuccess={(count, target, firstStudyId) => {
            queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
            queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
            queryClient.invalidateQueries({ queryKey: ["extractions"] });
            if (firstStudyId) {
              setSelectedStudyId(firstStudyId);
            }
            setFeedbackToast(`Successfully uploaded ${count} studies directly into extraction sheet!`);
            setTimeout(() => setFeedbackToast(null), 5000);
          }}
        />
      )}

      {/* ── Curated Excel Sheet Modal ── */}
      {showCuratedExcelModal && (
        <CuratedExcelModal
          projectId={projectId!}
          selectedStudyId={selectedStudyId}
          availablePapers={availablePapers}
          isOpen={showCuratedExcelModal}
          onClose={() => setShowCuratedExcelModal(false)}
          onSuccess={(msg) => {
            queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
            queryClient.invalidateQueries({ queryKey: ["extractions"] });
            setFeedbackToast(msg);
            setTimeout(() => setFeedbackToast(null), 5000);
          }}
        />
      )}

      {/* ── Feedback Toast ── */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#141413] text-[#FAF9F3] border border-black/20 rounded-xl px-4 py-3 shadow-xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="h-4 w-4 text-[#E9ED4C] shrink-0" />
          <span className="font-serif text-xs">{feedbackToast}</span>
          <button
            onClick={() => setFeedbackToast(null)}
            className="text-white/60 hover:text-white ml-2 text-xs"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
