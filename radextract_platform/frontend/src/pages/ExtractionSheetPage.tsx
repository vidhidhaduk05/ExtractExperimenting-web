import React, { useState, useMemo, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { DEMO_CODEBOOK_RULES, DEMO_STUDIES, DEMO_EXTRACTIONS, DEMO_VARIABLES, type CodebookRule } from "../lib/demoData";

const BENCHMARK_PAPERS = [
  {
    id: "study_birua_2022",
    shortId: "s1",
    title: "Birua et al. 2022 (Pure Arterial Malformation PCA)",
    filename: "Birua_2022.pdf",
  },
  {
    id: "study_albina_2024",
    shortId: "s2",
    title: "Albina-Palmarola et al. 2024 (Accessory MCA)",
    filename: "Albina-Palmarola_2024_A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery.pdf",
  },
  {
    id: "study_brinjikji_2018",
    shortId: "s3",
    title: "Brinjikji et al. 2018 (Pure Arterial Malformations Review)",
    filename: "Brinjikji_2018_Pure arterial malformations.pdf",
  },
  {
    id: "study_chua_2021",
    shortId: "s4",
    title: "Chua et al. 2021 (Ruptured Posterior Fossa PAM)",
    filename: "Chua_2021_Endovascular treatment of a ruptured posterior fossa pure arterial malformation illustrative case.pdf",
  },
  {
    id: "study_deshmukh_2023",
    shortId: "s5",
    title: "Deshmukh et al. 2023 (PAM Case Report)",
    filename: "Deshmukh_2023_Pure Arterial Malformation (PAM) Case Report and Review of Literature.pdf",
  },
  {
    id: "study_feliciano_2014",
    shortId: "s6",
    title: "Feliciano et al. 2014 (Color-coded DSA MCA PAM)",
    filename: "Feliciano_2014_Color-coded digital subtraction angiography in the management of a rare case of middle cerebral artery pure arterial malformation. A technical and case report.pdf",
  },
];
import {
  FileSpreadsheet, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Download, Eye, Check, X, Edit3, Sliders, Search, Filter,
  Sparkles, ExternalLink, RefreshCw, CheckCheck, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, Tag, FolderPlus, Upload,
  Lock, Unlock, Plus, ChevronDown, ChevronUp, FileUp, Database, Save, Loader2, Table,
  ChevronLeft, Trash2, Activity, ShieldAlert
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
  const [viewMode, setViewMode] = useState<"single" | "matrix" | "variables_setup">("single");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "pending" | "low_conf">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [showCodebookDesigner, setShowCodebookDesigner] = useState<boolean>(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState<boolean>(false);
  const [showCuratedExcelModal, setShowCuratedExcelModal] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Standard 18 SRMA Sections Preset
  const STANDARD_18_SECTIONS = useMemo(() => [
    "Study_Metadata",
    "Baseline_Demographics",
    "Inclusion_Exclusion",
    "Comorbidities",
    "Imaging_Characteristics",
    "Intervention_Experimental",
    "Intervention_Comparator",
    "Procedural_Details",
    "Co_Interventions",
    "Primary_Efficacy_Outcomes",
    "Secondary_Outcomes",
    "Safety_Adverse_Events",
    "Mortality",
    "TimeToEvent_Survival",
    "FollowUp_Adherence",
    "Quality_Of_Life",
    "Subgroup_Analyses",
    "Risk_Of_Bias",
  ], []);

  // Custom Sections (persisted per project)
  const [customSections, setCustomSections] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`radextract_custom_sections_${projectId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const saveCustomSections = (secs: string[]) => {
    setCustomSections(secs);
    try {
      localStorage.setItem(`radextract_custom_sections_${projectId}`, JSON.stringify(secs));
    } catch (e) {}
  };

  // Section Sheet Tab Addition & Navigation
  const [isAddingSectionTab, setIsAddingSectionTab] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const tabsScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Excel Grid Interactive Variables Phase State
  const [draftVariables, setDraftVariables] = useState<any[]>([]);
  const [isSavingDraftVars, setIsSavingDraftVars] = useState(false);

  // On-Demand AI Suggestions Modal State
  const [showAiSuggestModal, setShowAiSuggestModal] = useState(false);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [aiSuggestPrompt, setAiSuggestPrompt] = useState("");
  const [aiSuggestTargetSections, setAiSuggestTargetSections] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [selectedAiSuggestionIds, setSelectedAiSuggestionIds] = useState<Set<string>>(new Set());
  const [isAcceptingAiSuggestions, setIsAcceptingAiSuggestions] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState<boolean>(false);
  const excelUploadInputRef = React.useRef<HTMLInputElement | null>(null);

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
  const [sheetMode, setSheetMode] = useState<"view" | "edit">("edit");
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [matrixEditingCell, setMatrixEditingCell] = useState<{ paperId: string; varId: string } | null>(null);
  const [matrixEditValue, setMatrixEditValue] = useState<string>("");

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
      return BENCHMARK_PAPERS;
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

  // Stanford STORM & LAYA Multi-Perspective Deliberation State
  const [showGrandRoundsPanel, setShowGrandRoundsPanel] = useState<boolean>(true);
  const [stormDeliberation, setStormDeliberation] = useState<any | null>(null);
  const [isStormLoading, setIsStormLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedStudyId || !currentPaper?.title || currentPaper.id === "none") return;
    let cancelled = false;
    setIsStormLoading(true);
    api.deliberateStorm({
      title: currentPaper.title,
      abstract: currentPaper.title,
      topic: "acute ischemic stroke & pure arterial malformations"
    }).then((res) => {
      if (!cancelled) {
        setStormDeliberation(res);
        setIsStormLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsStormLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedStudyId, currentPaper?.title]);

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
      const paperExts = (paper.id === selectedStudyId && extractions) ? extractions : ((DEMO_EXTRACTIONS as any)[paper.id] || []);
      paperExts.forEach((e: any) => {
        if (e.variable_id) {
          map.set(`${paper.id}:${e.variable_id}`, e);
        }
      });
    });
    if (selectedStudyId && extractions && Array.isArray(extractions)) {
      extractions.forEach((e: any) => {
        if (e.variable_id) {
          map.set(`${selectedStudyId}:${e.variable_id}`, e);
        }
      });
    }
    return map;
  }, [availablePapers, projectId, selectedStudyId, extractions]);

  // Overall metrics across all papers
  const allBenchmarkStats = useMemo(() => {
    let totalVars = 0;
    let verifiedVars = 0;
    let highConfCount = 0;

    paperVariableExtMap.forEach((e) => {
      totalVars++;
      if (e.is_verified) verifiedVars++;
      if ((e.confidence || 0) >= 0.95) highConfCount++;
    });

    return {
      totalVars,
      verifiedVars,
      highConfCount,
      percent: totalVars > 0 ? Math.round((verifiedVars / totalVars) * 100) : 0,
    };
  }, [paperVariableExtMap]);

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

  // Distinct sections for Excel sheet tabs navigation (up to 18 sections or custom)
  const allSections = useMemo(() => {
    const s = new Set<string>();
    variableList.forEach((v: any) => {
      if (v.section) s.add(v.section);
    });
    customSections.forEach((sec) => {
      if (sec) s.add(sec);
    });
    if (s.size === 0) {
      return ["Study_Metadata", "Baseline_Demographics", "Intervention_Detail", "Outcomes"];
    }
    return Array.from(s);
  }, [variableList, customSections]);

  const sections = allSections; // alias for backwards compatibility

  // Sync draftVariables whenever variableList updates
  useEffect(() => {
    if (variableList && variableList.length > 0) {
      setDraftVariables(
        variableList.map((v: any, idx: number) => ({
          variable_id: v.variable_id || `var_${idx}`,
          name: v.name || "",
          section: v.section || "General",
          field_type: v.field_type || "free_text",
          allowed_values: v.allowed_values || "",
          default_code: "NR",
          description: v.description || "",
          is_new: false,
        }))
      );
    } else if (projectId !== "demo") {
      setDraftVariables([]);
    }
  }, [variableList, projectId]);

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
        // Bolt Optimization: Use O(1) paperVariableExtMap lookup instead of O(E) array search per cell
        const found = paperVariableExtMap.get(`${p.id}:${v.variable_id}`);
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

  // Auto-retrieve OA PDFs
  const handleAutoRetrieveOaPdfs = async () => {
    if (!projectId) return;
    setIsRetrievingOa(true);
    try {
      const res = await api.retrieveProjectOaPdfs(projectId);
      setFeedbackToast(res.message || "Started auto-retrieval of OA PDFs");
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    } catch (e: any) {
      setFeedbackToast(`OA Retrieval: ${e.message}`);
    } finally {
      setIsRetrievingOa(false);
    }
  };

  const handleSingleStudyRetrieveOa = async () => {
    if (!selectedStudyId) return;
    setIsRetrievingOa(true);
    try {
      const res = await api.retrieveStudyOaPdf(selectedStudyId);
      const outcome = res.result?.outcome;
      if (outcome === "fetched") {
        setFeedbackToast("Retrieved open-access PDF & converted with Docling!");
      } else if (outcome === "already_has_text") {
        setFeedbackToast("Study already has full text or PDF processed.");
      } else {
        setFeedbackToast("No legal open-access copy found. Please upload manually.");
      }
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      refetchExtractions();
    } catch (e: any) {
      setFeedbackToast(`OA Retrieval error: ${e.message}`);
    } finally {
      setIsRetrievingOa(false);
    }
  };

  const handleDownloadSrmaWorkbook = async () => {
    if (!projectId) return;
    setIsDownloadingSrma(true);
    try {
      setFeedbackToast("Generating canonical 8-sheet SRMA extraction workbook...");
      const res = await fetch(`/api/projects/${projectId}/export/srma-workbook`);
      if (!res.ok) throw new Error("Failed to generate workbook");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `srma_extraction_workbook_${projectId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedbackToast("Downloaded canonical 8-sheet SRMA extraction sheet!");
      setTimeout(() => setFeedbackToast(null), 3500);
    } catch (e: any) {
      setFeedbackToast("SRMA export failed: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setIsDownloadingSrma(false);
    }
  };

  const handleEnrichCtgov = async () => {
    if (!projectId) return;
    setIsEnrichingCtgov(true);
    try {
      setFeedbackToast("Querying ClinicalTrials.gov API v2 for trial designs, official arms, & primary outcomes...");
      const res = await fetch(`/api/projects/${projectId}/studies/enrich-ctgov`, { method: "POST" });
      const data = await res.json();
      setFeedbackToast(`ClinicalTrials.gov: Enriched ${data.enriched_count || 0} studies with verified trial metadata.`);
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      setTimeout(() => setFeedbackToast(null), 3500);
    } catch (e: any) {
      setFeedbackToast("CT.gov enrichment failed: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setIsEnrichingCtgov(false);
    }
  };

  // Tab Bar scroll helpers
  const scrollTabsLeft = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: -220, behavior: "smooth" });
    }
  };
  const scrollTabsRight = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: 220, behavior: "smooth" });
    }
  };

  const handleAddSectionTab = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (!allSections.includes(clean)) {
      const updated = [...customSections, clean];
      saveCustomSections(updated);
      setSectionFilter(clean);
      setFeedbackToast(`Added Sheet Tab: "${clean}"`);
      setTimeout(() => setFeedbackToast(null), 3000);
    } else {
      setSectionFilter(clean);
    }
    setIsAddingSectionTab(false);
    setNewSectionName("");
  };

  const handleLoad18SectionsPreset = () => {
    const merged = Array.from(new Set([...customSections, ...STANDARD_18_SECTIONS]));
    saveCustomSections(merged);
    setFeedbackToast("Loaded 18 Standard SRMA Sheet Sections!");
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleDeleteSectionTab = (secName: string) => {
    const updated = customSections.filter((s) => s !== secName);
    saveCustomSections(updated);
    if (sectionFilter === secName) {
      setSectionFilter("all");
    }
    setFeedbackToast(`Removed Sheet Tab: "${secName}"`);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  // Draft Variable Grid Handlers
  const handleAddDraftVariableRow = () => {
    const activeSec = sectionFilter !== "all" ? sectionFilter : (allSections[0] || "General");
    const newRow = {
      variable_id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: "",
      section: activeSec,
      field_type: "free_text",
      allowed_values: "",
      default_code: "NR",
      description: "",
      is_new: true,
    };
    setDraftVariables((prev) => [...prev, newRow]);
  };

  const handleUpdateDraftVariable = (id: string, field: string, val: any) => {
    setDraftVariables((prev) =>
      prev.map((row) => (row.variable_id === id ? { ...row, [field]: val } : row))
    );
  };

  const handleDeleteDraftVariable = async (id: string, isNew: boolean) => {
    if (isNew) {
      setDraftVariables((prev) => prev.filter((r) => r.variable_id !== id));
      return;
    }
    try {
      await api.deleteVariable(id);
      setDraftVariables((prev) => prev.filter((r) => r.variable_id !== id));
      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setFeedbackToast("Deleted variable from project.");
      setTimeout(() => setFeedbackToast(null), 2500);
    } catch (e: any) {
      setFeedbackToast("Failed to delete variable: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 3500);
    }
  };

  const handleSaveAllDraftVariables = async () => {
    if (!projectId) return;
    setIsSavingDraftVars(true);
    try {
      const validRows = draftVariables.filter((r) => r.name && r.name.trim().length > 0);
      const newRows = validRows.filter((r) => r.is_new);
      const existingRows = validRows.filter((r) => !r.is_new);

      if (newRows.length > 0) {
        await api.createVariablesBatch(
          projectId,
          newRows.map((r, idx) => ({
            name: r.name.trim(),
            section: r.section || "General",
            field_type: r.field_type || "free_text",
            allowed_values: r.allowed_values || "",
            description: r.description ? `${r.description} [Coding: ${r.default_code || "NR"}]` : `[Coding: ${r.default_code || "NR"}]`,
            order_index: idx + 1,
          }))
        );
      }

      for (const r of existingRows) {
        await api.updateVariable(r.variable_id, {
          name: r.name.trim(),
          section: r.section,
          field_type: r.field_type,
          allowed_values: r.allowed_values,
          description: r.description,
        });
      }

      const usedSecs = validRows.map((r) => r.section).filter(Boolean);
      const mergedSecs = Array.from(new Set([...customSections, ...usedSecs]));
      saveCustomSections(mergedSecs);

      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setFeedbackToast(`Saved ${validRows.length} variables to project extraction sheet!`);
      setTimeout(() => setFeedbackToast(null), 3500);
    } catch (e: any) {
      setFeedbackToast("Save failed: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setIsSavingDraftVars(false);
    }
  };

  // On-Demand AI Suggestions
  const handleOpenAiSuggestModal = () => {
    setAiSuggestTargetSections(sectionFilter !== "all" ? [sectionFilter] : allSections.slice(0, 6));
    setAiSuggestPrompt("");
    setAiSuggestions([]);
    setSelectedAiSuggestionIds(new Set());
    setShowAiSuggestModal(true);
  };

  const handleFetchAiSuggestions = async () => {
    if (!projectId) return;
    setAiSuggestLoading(true);
    try {
      const res = await api.suggestVariables(projectId, {
        sections: aiSuggestTargetSections.length > 0 ? aiSuggestTargetSections : undefined,
        custom_instructions: aiSuggestPrompt || undefined,
      });
      const list = res.suggestions || [];
      setAiSuggestions(list);
      const initialSelected = new Set<string>();
      list.forEach((s) => {
        if (!s.is_already_present) {
          initialSelected.add(s.temp_id);
        }
      });
      setSelectedAiSuggestionIds(initialSelected);
      if (list.length === 0) {
        setFeedbackToast("No suggestions returned. Try specifying a different section or prompt.");
        setTimeout(() => setFeedbackToast(null), 3500);
      }
    } catch (e: any) {
      setFeedbackToast("AI Suggestion failed: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setAiSuggestLoading(false);
    }
  };

  const handleAcceptSelectedAiSuggestions = async () => {
    if (!projectId) return;
    const toAccept = aiSuggestions.filter((s) => selectedAiSuggestionIds.has(s.temp_id));
    if (toAccept.length === 0) {
      setFeedbackToast("Please check at least one variable to accept.");
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }
    setIsAcceptingAiSuggestions(true);
    try {
      await api.createVariablesBatch(
        projectId,
        toAccept.map((s, idx) => ({
          name: s.name,
          section: s.section,
          field_type: s.field_type,
          allowed_values: s.allowed_values,
          description: s.description ? `${s.description} [Coding: ${s.default_missing_code || "NR"}]` : `[Coding: ${s.default_missing_code || "NR"}]`,
          order_index: idx + 1,
        }))
      );
      const newSecs = toAccept.map((s) => s.section).filter((sec) => !customSections.includes(sec));
      if (newSecs.length > 0) {
        saveCustomSections([...customSections, ...newSecs]);
      }
      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setFeedbackToast(`Accepted ${toAccept.length} AI suggested variables into your sheet!`);
      setTimeout(() => setFeedbackToast(null), 3500);
      setShowAiSuggestModal(false);
    } catch (e: any) {
      setFeedbackToast("Failed to accept variables: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setIsAcceptingAiSuggestions(false);
    }
  };

  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setIsImportingExcel(true);
    try {
      setFeedbackToast("Analyzing Excel sheets and column headers...");
      const res = await api.importVariablesFromExcel(projectId, file, true);
      if (res.sections && res.sections.length > 0) {
        const mergedSecs = Array.from(new Set([...customSections, ...res.sections]));
        saveCustomSections(mergedSecs);
      }
      queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setFeedbackToast(`Adapted ${res.total_variables || 0} variables across ${res.total_sections || 0} sheet sections!`);
      setTimeout(() => setFeedbackToast(null), 4000);
    } catch (err: any) {
      setFeedbackToast("Excel import failed: " + (err?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    } finally {
      setIsImportingExcel(false);
      if (e.target) e.target.value = "";
    }
  };

  // Doctor helper: 1-Click fill all remaining empty cells with "NR" (Not Reported)
  const handleFillEmptyWithNR = async () => {
    if (!selectedStudyId) return;
    const emptyVars = filteredVariables.filter((v: any) => {
      const ext = extractionMap[v.variable_id];
      return !ext || !ext.value || ext.value.trim() === "";
    });

    if (emptyVars.length === 0) {
      setFeedbackToast("All variables in this sheet already have recorded values!");
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    try {
      for (const v of emptyVars) {
        await handleVerifyDecision(v.variable_id, "modified", "NR");
      }
      setFeedbackToast(`Filled ${emptyVars.length} empty variables with 'NR' (Not Reported).`);
      setTimeout(() => setFeedbackToast(null), 4000);
    } catch (e: any) {
      setFeedbackToast("Failed to fill empty cells: " + (e?.message || "Unknown error"));
      setTimeout(() => setFeedbackToast(null), 4000);
    }
  };

  // Familiar Excel Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setFeedbackToast("Excel workbook saved. All clinical values are up to date.");
        setTimeout(() => setFeedbackToast(null), 3000);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        {/* Hidden File Input for Excel/CSV Adaptation */}
        <input
          ref={excelUploadInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportExcelFile}
        />

        {/* ── Top Coding Conventions Example Banner ── */}
        <div className="mb-6 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50/90 via-[#FAF9F3] to-amber-50/70 p-4 text-[#141413] shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-400/20 text-amber-800 flex items-center justify-center text-lg font-bold shrink-0">
                💡
              </div>
              <div>
                <h4 className="text-sm font-semibold font-serif text-[#141413]">
                  Interactive Variable Coding Standards & Conventions
                </h4>
                <p className="text-xs text-[#6B665E] mt-0.5 font-sans">
                  You decide what sections, variables, and coding you want. For missing, unavailable, or pending data, you can use standard clinical codes:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2 font-mono text-[11px]">
                  <span className="bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-md border border-amber-300 font-semibold" title="Searched all text, tables, and supplement; value is absent">
                    NR = Not Reported
                  </span>
                  <span className="bg-slate-200 text-slate-800 px-2.5 py-0.5 rounded-md border border-slate-300 font-semibold" title="Field does not apply to this trial arm or design">
                    NA = Not Applicable
                  </span>
                  <span className="bg-orange-100 text-orange-900 px-2.5 py-0.5 rounded-md border border-orange-300 font-semibold" title="Standard numeric missing code for R, Python, and Stata">
                    -99 = Numeric Missing
                  </span>
                  <span className="bg-red-100 text-red-900 px-2.5 py-0.5 rounded-md border border-red-300 font-semibold" title="Figure-only, blurred scan, or illegible text layer">
                    UE = Unable to Extract
                  </span>
                  <span className="bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-md border border-purple-300 font-semibold" title="Pending team discussion or dual-reviewer consensus">
                    TBD = To Be Discussed
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={handleLoad18SectionsPreset}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs flex items-center gap-1.5"
                title="Populate 18 standard clinical systematic review sheet tabs"
              >
                <Layers className="h-3.5 w-3.5 text-amber-700" />
                <span>Load 18 SRMA Sections Preset</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Awaiting PDF Alert Banner ── */}
        {(currentPaper as any).extraction_status === "awaiting_pdf" && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-950 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold font-serif">Full-Text PDF Awaiting Upload</h4>
                <p className="text-xs text-amber-800 mt-0.5 font-sans">
                  This study was included during screening, but no legal open-access copy was found automatically.
                  Upload the full-text PDF, Zotero reference export (.ris, .xml, .bib), or EndNote file.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSingleStudyRetrieveOa}
                disabled={isRetrievingOa}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs flex items-center gap-1.5"
                title="Retry automated open-access retrieval"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>Retry OA Retrieval</span>
              </button>
              <button
                onClick={() => setShowBulkUploadModal(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#141413] text-[#FAF9F3] hover:bg-black transition-colors shadow-2xs flex items-center gap-1.5"
                title="Upload PDF or reference export file"
              >
                <Upload className="h-3.5 w-3.5 text-[#E9ED4C]" />
                <span>Upload PDF / Zotero File</span>
              </button>
            </div>
          </div>
        )}

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
            {/* View Mode & Sheet Mode Toggle */}
            <div className="flex items-center flex-wrap gap-3">
              <div className="flex items-center gap-1 bg-black/[0.05] p-1 rounded-full flex-wrap">
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
                  <span>Consolidated Matrix</span>
                </button>
                <button
                  onClick={() => setViewMode("variables_setup")}
                  className={cn(
                    "px-4 py-1.5 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                    viewMode === "variables_setup"
                      ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                      : "text-[#6B665E] hover:text-[#141413]"
                  )}
                >
                  <Sliders className="h-3.5 w-3.5 text-amber-500" />
                  <span>Variables &amp; Coding Setup (Excel Grid)</span>
                </button>
              </div>

              {/* View Mode vs Edit Mode Toggle */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-black/10 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    setSheetMode("view");
                    setEditingVarId(null);
                    setMatrixEditingCell(null);
                  }}
                  className={cn(
                    "px-3.5 py-1 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                    sheetMode === "view"
                      ? "bg-[#141413] text-[#FAF9F3] shadow-2xs font-semibold"
                      : "text-[#6B665E] hover:text-[#141413]"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheetMode("edit")}
                  className={cn(
                    "px-3.5 py-1 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                    sheetMode === "edit"
                      ? "bg-emerald-700 text-[#FAF9F3] shadow-2xs font-bold"
                      : "text-[#6B665E] hover:text-emerald-700"
                  )}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Mode (Excel)</span>
                </button>
              </div>
            </div>
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
            <div className="overflow-x-auto border-t border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              {/* ── EXCEL GREEN RIBBON (Familiar & Intuitive for Physicians) ── */}
              <div className="bg-[#107C41] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs border-b border-[#0c6233]">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-[#0c5c30] px-3 py-1 rounded text-xs font-semibold tracking-wide shadow-2xs">
                    <FileSpreadsheet className="h-4 w-4 text-[#85e0a3]" />
                    <span>EXCEL CLINICAL SHEET</span>
                  </div>
                  <button
                    onClick={() => {
                      setFeedbackToast("Workbook saved successfully. All clinical values are stored.");
                      setTimeout(() => setFeedbackToast(null), 3000);
                    }}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium flex items-center gap-1.5 transition border border-white/20"
                    title="Save all changes (Ctrl+S)"
                  >
                    <Save className="h-3.5 w-3.5 text-[#85e0a3]" />
                    <span>Save Sheet (Ctrl+S)</span>
                  </button>
                  <button
                    onClick={handleExportAllStudiesMatrixCsv}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium flex items-center gap-1.5 transition border border-white/20"
                    title="Download this extraction sheet as a real Excel file"
                  >
                    <Download className="h-3.5 w-3.5 text-white" />
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => setShowGrandRoundsPanel(!showGrandRoundsPanel)}
                    className={`px-3 py-1 ${showGrandRoundsPanel ? "bg-amber-400 text-slate-900 font-bold" : "bg-white/10 hover:bg-white/20 text-white font-medium"} rounded text-xs flex items-center gap-1.5 transition border border-white/20`}
                    title="Toggle Multi-Specialty Clinical Review Panel"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    <span>⚡ Multi-Specialty Review</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <button
                    onClick={handleFillEmptyWithNR}
                    className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded font-bold flex items-center gap-1.5 transition shadow-2xs"
                    title="Fill all remaining empty cells in this sheet with 'NR' (Not Reported)"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-slate-900" />
                    <span>⚡ Fill Empty with "NR"</span>
                  </button>

                  <button
                    onClick={handleAcceptAllHighConfidence}
                    className="px-3 py-1 bg-emerald-200 hover:bg-emerald-100 text-emerald-950 rounded font-bold flex items-center gap-1.5 transition shadow-2xs"
                    title="Accept all AI extractions that have >95% confidence with 1 click"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-900" />
                    <span>✓ Accept All High-Confidence (&gt;95%)</span>
                  </button>
                </div>
              </div>

              {/* ── EXCEL FORMULA BAR ── */}
              <div className="px-4 py-2 bg-[#F3F2F1] border-b border-slate-300 dark:border-slate-700 flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-400 rounded text-xs font-bold text-slate-800 min-w-[65px] justify-center shadow-2xs">
                  {activeCell ? `${activeCell.col.toUpperCase()}${activeCell.row + 1}` : "C1"}
                </div>
                <span className="text-slate-500 font-bold select-none text-sm font-serif italic">fx</span>
                <div className="flex-1 px-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900 font-sans flex items-center justify-between gap-2 shadow-2xs">
                  {activeCell && filteredVariables[activeCell.row] ? (
                    <div className="truncate flex items-center gap-2">
                      <strong className="font-semibold text-emerald-900">
                        {filteredVariables[activeCell.row].name}:
                      </strong>
                      <span className="font-mono font-bold text-slate-900">
                        {extractionMap[filteredVariables[activeCell.row].variable_id]?.value || "Not Reported (NR)"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">Select any cell below to view evidence quote from the research paper</span>
                  )}
                  <span className="text-[11px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                    Double-click cell or press Enter to edit
                  </span>
                </div>
              </div>

              {/* ── MULTI-SPECIALTY CLINICAL REVIEW STRIP ── */}
              {showGrandRoundsPanel && (
                <div className="px-4 py-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900 text-xs flex flex-wrap items-center justify-between gap-3 shadow-inner">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono text-[10px] border border-indigo-500/30 font-semibold">
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>MULTI-SPECIALTY CLINICAL REVIEW</span>
                    </div>

                    {isStormLoading ? (
                      <span className="text-amber-300 text-[11px] font-mono animate-pulse flex items-center gap-1">
                        <Activity className="w-3 h-3 animate-spin" /> Cross-examining 4 specialties with Laya &lt;150ms...
                      </span>
                    ) : stormDeliberation ? (
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                          style={{
                            backgroundColor: `${stormDeliberation.verdict_color}25`,
                            color: stormDeliberation.verdict_color,
                            border: `1px solid ${stormDeliberation.verdict_color}60`
                          }}
                        >
                          {stormDeliberation.verdict_badge}
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-300">
                          Flaw Risk: <strong className={stormDeliberation.laya_fast_triage?.has_flaw_warning ? "text-amber-400" : "text-emerald-400"}>
                            {Math.round((stormDeliberation.laya_fast_triage?.flaw_probability || 0) * 100)}%
                          </strong>
                        </span>
                        <span className="text-slate-400">|</span>
                        {/* 4 Specialist Stances */}
                        <div className="flex items-center gap-1.5">
                          {stormDeliberation.persona_opinions?.map((p: any) => (
                            <span
                              key={p.persona_id}
                              title={`${p.role}: ${p.critique}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help flex items-center gap-1 border ${
                                p.stance === "critical"
                                  ? "bg-red-950/60 text-red-300 border-red-700/50"
                                  : p.stance === "cautionary"
                                  ? "bg-amber-950/60 text-amber-300 border-amber-700/50"
                                  : "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
                              }`}
                            >
                              <span>{p.avatar}</span>
                              <span className="hidden sm:inline">{p.role.split(" ")[0]}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {stormDeliberation?.design_flaws?.length > 0 && (
                    <div className="flex items-center gap-2 text-amber-300 text-[11px] bg-amber-500/15 px-2.5 py-0.5 rounded border border-amber-500/30">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-semibold">{stormDeliberation.design_flaws[0].title}</span>
                      <span className="text-slate-400 hidden md:inline">({stormDeliberation.design_flaws[0].description.slice(0, 65)}...)</span>
                      <button
                        type="button"
                        onClick={() => {
                          const activeVar = filteredVariables[activeCell?.row ?? 0];
                          if (activeVar) {
                            const currentVal = extractionMap[activeVar.variable_id]?.value ?? "";
                            const flawNote = `[Flaw Detected: ${stormDeliberation.design_flaws[0].title}]`;
                            const nextVal = currentVal ? `${currentVal} | ${flawNote}` : flawNote;
                            handleCellChange(activeVar.variable_id, nextVal);
                            setFeedbackToast(`Annotated flaw "${stormDeliberation.design_flaws[0].title}" into active cell.`);
                            setTimeout(() => setFeedbackToast(null), 3500);
                          } else {
                            setFeedbackToast(`Flaw flagged: ${stormDeliberation.design_flaws[0].title}`);
                            setTimeout(() => setFeedbackToast(null), 3000);
                          }
                        }}
                        className="ml-auto px-2 py-0.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-400/40 font-bold text-[10px] cursor-pointer whitespace-nowrap transition-colors"
                        title="Document this methodological flaw directly into your extraction sheet"
                      >
                        + Document Flaw Caveat
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── DOCTOR EVIDENCE & DECISION STRIP (Human-in-the-loop) ── */}
              {activeCell && filteredVariables[activeCell.row] && (
                <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold font-mono text-[10px] shrink-0 mt-0.5 shadow-2xs">
                      PAPER EVIDENCE
                    </span>
                    <div className="min-w-0 flex-1">
                      {extractionMap[filteredVariables[activeCell.row].variable_id]?.quote ? (
                        <p className="text-slate-900 italic leading-snug line-clamp-2 font-serif text-[12px]">
                          “{extractionMap[filteredVariables[activeCell.row].variable_id]?.quote}”
                        </p>
                      ) : (
                        <p className="text-slate-500 italic">
                          No direct quote reported in study text. Default missing code: NR.
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600 font-mono">
                        <span>Page {extractionMap[filteredVariables[activeCell.row].variable_id]?.source_page || 1}</span>
                        {extractionMap[filteredVariables[activeCell.row].variable_id]?.confidence != null && (
                          <>
                            <span>•</span>
                            <span className="font-bold text-emerald-800">
                              Confidence: {Math.round(extractionMap[filteredVariables[activeCell.row].variable_id]?.confidence * 100)}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Doctor Decision Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleVerifyDecision(filteredVariables[activeCell.row].variable_id, "accepted")}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs flex items-center gap-1 shadow-2xs"
                      title="Accept this extraction as verified"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditingVarId(filteredVariables[activeCell.row].variable_id);
                        setEditValue(extractionMap[filteredVariables[activeCell.row].variable_id]?.value || "");
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs flex items-center gap-1 shadow-2xs"
                      title="Change or type your own value"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Cell</span>
                    </button>
                    <button
                      onClick={() => handleVerifyDecision(filteredVariables[activeCell.row].variable_id, "modified", "NR")}
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-medium text-xs flex items-center gap-1 shadow-2xs"
                      title="Mark as Not Reported (NR)"
                    >
                      <X className="h-3.5 w-3.5 text-rose-500" />
                      <span>Set NR</span>
                    </button>
                    <Link
                      to={`/projects/${projectId}/studies/${selectedStudyId}/pdf?var=${filteredVariables[activeCell.row].variable_id}`}
                      className="px-3 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded font-medium text-xs flex items-center gap-1"
                      title="Open PDF viewer with verbatim highlight"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View in PDF</span>
                    </Link>
                  </div>
                </div>
              )}

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
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCell({ row: idx, col: "value" });
                            if (sheetMode === "edit" && editingVarId !== v.variable_id) {
                              setEditingVarId(v.variable_id);
                              setEditValue(ext?.value || "");
                            }
                          }}
                          className={cn(
                            "px-3 py-2 border-r border-slate-200 transition-all cursor-pointer",
                            sheetMode === "edit" ? "hover:bg-emerald-50/40" : "",
                            activeCell?.row === idx && activeCell?.col === "value" && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                          )}
                        >
                          {isEditingThis ? (
                            <div className="relative w-full">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  if (editValue !== (ext?.value || "")) {
                                    handleVerifyDecision(v.variable_id, "modified", editValue);
                                  } else if (sheetMode === "view") {
                                    setEditingVarId(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleVerifyDecision(v.variable_id, "modified", editValue);
                                    if (idx < filteredVariables.length - 1) {
                                      const nextV = filteredVariables[idx + 1];
                                      const nextExt = extractionMap[nextV.variable_id];
                                      setEditingVarId(nextV.variable_id);
                                      setEditValue(nextExt?.value || "");
                                      setActiveCell({ row: idx + 1, col: "value" });
                                    } else {
                                      setEditingVarId(null);
                                    }
                                  } else if (e.key === "Tab") {
                                    e.preventDefault();
                                    handleVerifyDecision(v.variable_id, "modified", editValue);
                                    if (idx < filteredVariables.length - 1) {
                                      const nextV = filteredVariables[idx + 1];
                                      const nextExt = extractionMap[nextV.variable_id];
                                      setEditingVarId(nextV.variable_id);
                                      setEditValue(nextExt?.value || "");
                                      setActiveCell({ row: idx + 1, col: "value" });
                                    } else {
                                      setEditingVarId(null);
                                    }
                                  } else if (e.key === "Escape") {
                                    setEditingVarId(null);
                                    setEditValue(ext?.value || "");
                                  }
                                }}
                                className="w-full px-2 py-1 text-xs border-2 border-emerald-600 rounded bg-white text-slate-900 font-mono font-bold shadow-xs focus:outline-hidden"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div
                              onDoubleClick={() => {
                                setEditingVarId(v.variable_id);
                                setEditValue(ext?.value || "");
                              }}
                              className="flex items-center justify-between gap-2 min-h-[22px]"
                              title={sheetMode === "edit" ? "Click to edit directly like Excel" : "Double-click to edit or switch to Edit Mode"}
                            >
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {ext?.value || <span className="text-slate-400 italic">Not Reported</span>}
                              </span>
                              {isEdited && (
                                <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0.2 rounded font-sans">
                                  edited
                                </span>
                              )}
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
                        const isMatrixEditing = matrixEditingCell?.paperId === paper.id && matrixEditingCell?.varId === v.variable_id;

                        const saveMatrixEdit = async (newVal: string) => {
                          if (newVal !== (foundExt?.value || "")) {
                            try {
                              await api.recordExtractionDecision({
                                project_id: projectId!,
                                study_id: paper.id,
                                variable_id: v.variable_id,
                                variable_name: v.name,
                                original_value: foundExt?.value || "",
                                corrected_value: newVal,
                                decision: "modified",
                                evidence_quote: foundExt?.quote || "",
                                page_number: foundExt?.source_page || 1,
                                codebook_rules: customRules[v.variable_id]?.definition || "",
                                reviewer: "Data Manager",
                                notes: "Matrix Excel inline edit",
                              });
                              queryClient.invalidateQueries({ queryKey: ["extractions"] });
                              queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
                            } catch (e) {
                              console.error(e);
                            }
                          }
                          setMatrixEditingCell(null);
                        };

                        return (
                          <td
                            key={paper.id}
                            onClick={() => {
                              if (sheetMode === "edit" && !isMatrixEditing) {
                                setMatrixEditingCell({ paperId: paper.id, varId: v.variable_id });
                                setMatrixEditValue(foundExt?.value || "");
                              }
                            }}
                            className={cn(
                              "px-3 py-2 border-r border-slate-200 group/cell transition-colors",
                              sheetMode === "edit" ? "hover:bg-emerald-50/40 cursor-pointer" : "hover:bg-emerald-50/20",
                              isMatrixEditing && "ring-2 ring-emerald-600 bg-emerald-50/30 z-10"
                            )}
                          >
                            {isMatrixEditing ? (
                              <input
                                type="text"
                                value={matrixEditValue}
                                onChange={(e) => setMatrixEditValue(e.target.value)}
                                onBlur={() => saveMatrixEdit(matrixEditValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    saveMatrixEdit(matrixEditValue);
                                  } else if (e.key === "Escape") {
                                    setMatrixEditingCell(null);
                                  }
                                }}
                                className="w-full px-2 py-1 text-xs border-2 border-emerald-600 rounded bg-white text-slate-900 font-mono font-bold shadow-xs focus:outline-hidden"
                                autoFocus
                              />
                            ) : (
                              <div
                                onDoubleClick={() => {
                                  setMatrixEditingCell({ paperId: paper.id, varId: v.variable_id });
                                  setMatrixEditValue(foundExt?.value || "");
                                }}
                                className="flex flex-col gap-0.5"
                                title={sheetMode === "edit" ? "Click to edit directly like Excel" : "Double-click to edit"}
                              >
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
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              VIEW MODE 3: VARIABLES & CODING SETUP (EXCEL GRID)
          ══════════════════════════════════════════════════════════ */}
          {viewMode === "variables_setup" && (
            <div className="p-6 bg-white dark:bg-slate-900">
              {/* Studio Header Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-black/[0.08]">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#141413] flex items-center gap-2">
                    <Table className="h-5 w-5 text-emerald-700" />
                    <span>Interactive Variables &amp; Coding Designer</span>
                  </h3>
                  <p className="text-xs text-[#6B665E] mt-0.5 font-sans">
                    Decide what variables you want, what sheet sections they belong to, and what custom coding you prefer.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* On-Demand AI Suggestions Button */}
                  <button
                    onClick={handleOpenAiSuggestModal}
                    className="btn-phylo-primary text-xs flex items-center gap-1.5 shadow-xs"
                    title="Ask AI to recommend variables based on PICO, but you review and decide what to accept"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#E9ED4C]" />
                    <span>✨ AI Suggest Variables</span>
                  </button>

                  {/* Add Variable Row */}
                  <button
                    onClick={handleAddDraftVariableRow}
                    className="btn-phylo-secondary text-xs bg-white/90 hover:bg-emerald-50 border-emerald-300 text-emerald-800 flex items-center gap-1.5"
                    title="Add a new variable row to this sheet"
                  >
                    <Plus className="h-3.5 w-3.5 text-emerald-700" />
                    <span>+ Add Variable Row</span>
                  </button>

                  {/* Import from Existing Excel */}
                  <button
                    onClick={() => excelUploadInputRef.current?.click()}
                    disabled={isImportingExcel}
                    className="btn-phylo-secondary text-xs bg-white/90 hover:bg-slate-100 border-black/15 flex items-center gap-1.5"
                    title="Upload an already made Excel extraction sheet to adapt its sections and variables"
                  >
                    {isImportingExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-blue-600" />}
                    <span>{isImportingExcel ? "Importing..." : "Import Existing Excel"}</span>
                  </button>

                  {/* 18 Sections Preset */}
                  <button
                    onClick={handleLoad18SectionsPreset}
                    className="btn-phylo-secondary text-xs bg-white/90 hover:bg-amber-50 border-amber-300 text-amber-900 flex items-center gap-1.5"
                    title="Set up the 18 standard clinical systematic review sheet tabs"
                  >
                    <Layers className="h-3.5 w-3.5 text-amber-700" />
                    <span>Preset 18 Sections</span>
                  </button>

                  {/* Save All Variables Button */}
                  <button
                    onClick={handleSaveAllDraftVariables}
                    disabled={isSavingDraftVars || draftVariables.length === 0}
                    className="btn-phylo-primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 shadow-xs"
                    title="Persist all variables and coding rules to the project"
                  >
                    {isSavingDraftVars ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-[#E9ED4C]" />}
                    <span>{isSavingDraftVars ? "Saving..." : "Save Variables to Sheet"}</span>
                  </button>
                </div>
              </div>

              {/* Spreadsheet Table */}
              {draftVariables.length === 0 ? (
                <div className="text-center py-12 px-4 border-2 border-dashed border-black/10 rounded-2xl bg-[#FAF9F3]/60 my-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-100/80 text-amber-800 flex items-center justify-center mx-auto mb-3 text-xl">
                    📊
                  </div>
                  <h4 className="font-serif text-base font-bold text-[#141413] mb-1">
                    No Extraction Variables Defined Yet
                  </h4>
                  <p className="text-xs text-[#6B665E] max-w-md mx-auto mb-5">
                    Start fresh! You have complete control to decide what sections, variables, and coding conventions you want for this review.
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <button
                      onClick={handleAddDraftVariableRow}
                      className="btn-phylo-secondary text-xs bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Add Variable Row Manually</span>
                    </button>
                    <button
                      onClick={handleOpenAiSuggestModal}
                      className="btn-phylo-primary text-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#E9ED4C]" />
                      <span>✨ On-Demand AI Suggestions</span>
                    </button>
                    <button
                      onClick={() => excelUploadInputRef.current?.click()}
                      className="btn-phylo-secondary text-xs bg-white text-blue-800 border-blue-300 hover:bg-blue-50 flex items-center gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5 text-blue-600" />
                      <span>Import Existing Excel Sheet</span>
                    </button>
                    <button
                      onClick={handleLoad18SectionsPreset}
                      className="btn-phylo-secondary text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-50 flex items-center gap-1.5"
                    >
                      <Layers className="h-3.5 w-3.5 text-amber-700" />
                      <span>Preset 18 Sections</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-black/[0.12] rounded-xl overflow-x-auto shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F2F1EB] text-[#141413] border-b border-black/[0.12] font-mono text-[11px] uppercase tracking-wider">
                        <th className="px-3 py-2.5 w-12 text-center border-r border-black/[0.08]">#</th>
                        <th className="px-3 py-2.5 min-w-[200px] border-r border-black/[0.08]">Variable Name *</th>
                        <th className="px-3 py-2.5 min-w-[180px] border-r border-black/[0.08]">Sheet Section</th>
                        <th className="px-3 py-2.5 min-w-[130px] border-r border-black/[0.08]">Data Type</th>
                        <th className="px-3 py-2.5 min-w-[180px] border-r border-black/[0.08]">Allowed Options / Units</th>
                        <th className="px-3 py-2.5 min-w-[120px] border-r border-black/[0.08]">Missing Coding</th>
                        <th className="px-3 py-2.5 min-w-[250px] border-r border-black/[0.08]">Extraction Guidance / Rules</th>
                        <th className="px-3 py-2.5 w-14 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06] bg-white">
                      {draftVariables
                        .filter((r) => sectionFilter === "all" || r.section === sectionFilter)
                        .map((row, idx) => (
                          <tr key={row.variable_id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3 py-2 text-center text-[#8A817A] font-mono text-[11px] border-r border-black/[0.06] bg-[#FAF9F3]/40">
                              {idx + 1}
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <input
                                type="text"
                                placeholder="e.g. mean_age, mortality_30d"
                                value={row.name}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "name", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden font-mono font-semibold text-slate-900 bg-transparent focus:bg-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <select
                                value={row.section}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "section", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden font-mono bg-transparent focus:bg-white"
                              >
                                {allSections.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <select
                                value={row.field_type}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "field_type", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden font-mono bg-transparent focus:bg-white text-blue-800 font-medium"
                              >
                                <option value="free_text">Free Text</option>
                                <option value="float">Numeric / Float</option>
                                <option value="int">Integer</option>
                                <option value="dropdown">Dropdown / Enum</option>
                                <option value="boolean">Boolean (Yes/No)</option>
                                <option value="date">Date</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <input
                                type="text"
                                placeholder="e.g. Mild; Moderate; Severe"
                                value={row.allowed_values}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "allowed_values", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden text-slate-700 bg-transparent focus:bg-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <input
                                type="text"
                                placeholder="NR"
                                value={row.default_code || "NR"}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "default_code", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden font-mono font-bold text-amber-800 bg-transparent focus:bg-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 border-r border-black/[0.06]">
                              <input
                                type="text"
                                placeholder="Extraction source or rule..."
                                value={row.description}
                                onChange={(e) => handleUpdateDraftVariable(row.variable_id, "description", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-transparent hover:border-black/20 focus:border-emerald-600 rounded focus:outline-hidden text-slate-700 bg-transparent focus:bg-white"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => handleDeleteDraftVariable(row.variable_id, row.is_new)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                                title="Remove row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="p-3 bg-[#FAF9F3] border-t border-black/[0.08] flex items-center justify-between">
                    <button
                      onClick={handleAddDraftVariableRow}
                      className="px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-white border border-black/15 hover:bg-emerald-50 hover:border-emerald-300 text-emerald-800 flex items-center gap-1.5 transition shadow-2xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Add Row Below</span>
                    </button>
                    <span className="text-[11px] font-mono text-[#8A817A]">
                      Showing {draftVariables.filter((r) => sectionFilter === "all" || r.section === sectionFilter).length} variables in current tab
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              EXCEL WORKBOOK BOTTOM SHEET TABS NAVIGATION SYSTEM
          ══════════════════════════════════════════════════════════ */}
          <div className="bg-[#EFEFEA] border-t border-black/[0.12] px-4 py-1.5 flex items-center justify-between gap-2 shadow-inner">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1" ref={tabsScrollRef}>
              {/* Tab Scroll Arrows */}
              <button onClick={scrollTabsLeft} className="p-1 rounded hover:bg-black/10 text-[#6B665E] shrink-0" title="Scroll tabs left">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={scrollTabsRight} className="p-1 rounded hover:bg-black/10 text-[#6B665E] shrink-0" title="Scroll tabs right">
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* All Sheets Tab */}
              <button
                onClick={() => setSectionFilter("all")}
                className={cn(
                  "px-3 py-1 text-xs font-mono rounded-t border-t border-l border-r transition-all flex items-center gap-1.5 shrink-0 shadow-2xs",
                  sectionFilter === "all"
                    ? "bg-white text-[#141413] border-black/25 font-bold border-b-2 border-b-emerald-600"
                    : "bg-[#E2E1DA] text-[#6B665E] border-transparent hover:bg-white/60"
                )}
              >
                <span>📋 All Sections ({variableList.length})</span>
              </button>

              {/* Section Sheet Tabs */}
              {allSections.map((sec, idx) => {
                const varCount = variableList.filter((v: any) => v.section === sec).length;
                const isActive = sectionFilter === sec;
                return (
                  <div
                    key={sec}
                    onClick={() => setSectionFilter(sec)}
                    className={cn(
                      "group relative px-3 py-1 text-xs font-mono rounded-t border-t border-l border-r transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs",
                      isActive
                        ? "bg-white text-[#141413] border-black/25 font-bold border-b-2 border-b-emerald-600"
                        : "bg-[#E2E1DA] text-[#6B665E] border-transparent hover:bg-white/60"
                    )}
                  >
                    <span>Sheet {idx + 1}: {sec}</span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full",
                        isActive ? "bg-emerald-100 text-emerald-800 font-bold" : "bg-black/5 text-[#8A817A]"
                      )}
                    >
                      {varCount}
                    </span>
                    {varCount === 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSectionTab(sec);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[#8A817A] hover:text-red-600 p-0.5 rounded transition"
                        title="Remove empty sheet tab"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Inline Add Sheet Tab Form */}
              {isAddingSectionTab ? (
                <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-emerald-400 shrink-0">
                  <input
                    type="text"
                    placeholder="New Section Name..."
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSectionTab(newSectionName);
                      if (e.key === "Escape") setIsAddingSectionTab(false);
                    }}
                    className="px-1.5 py-0.5 text-xs font-mono border-0 focus:outline-hidden w-36"
                    autoFocus
                  />
                  <button
                    onClick={() => handleAddSectionTab(newSectionName)}
                    className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    title="Confirm Add"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setIsAddingSectionTab(false)}
                    className="p-1 text-slate-500 hover:text-slate-700"
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingSectionTab(true)}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-emerald-600/10 text-emerald-800 hover:bg-emerald-600/20 border border-emerald-300 flex items-center gap-1 shrink-0 transition"
                  title="Add a new sheet section tab"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Add Sheet Tab</span>
                </button>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-2 shrink-0 text-xs font-mono text-[#8A817A]">
              <button
                onClick={handleLoad18SectionsPreset}
                className="hover:text-[#141413] underline flex items-center gap-1 text-[11px]"
                title="Populate 18 standard clinical systematic review sheet tabs"
              >
                <Layers className="h-3 w-3 text-amber-700" />
                <span>18 SRMA Sections Preset</span>
              </button>
            </div>
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

      {/* ── On-Demand AI Suggestions Modal (Human Decides First) ── */}
      {showAiSuggestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FAF9F3] dark:bg-slate-900 border border-black/15 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#F2F1EB] dark:bg-slate-800 border-b border-black/[0.08] dark:border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#141413] dark:text-white flex items-center gap-2">
                    <span>On-Demand AI Variable Suggestions</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                      HUMAN-IN-THE-LOOP
                    </span>
                  </h3>
                  <p className="text-xs text-[#6B665E] dark:text-slate-400">
                    AI analyzes your review protocol to recommend variables. You review and decide which ones to accept.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiSuggestModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Step 1: Prompt & Target Sections */}
              <div className="bg-white dark:bg-slate-800/60 p-4 rounded-xl border border-black/[0.08] dark:border-slate-700">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#6B665E] dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-amber-600" />
                  <span>1. Configure AI Generation Scope</span>
                </h4>
                
                {/* Target Section Chips */}
                <div className="mb-3">
                  <label className="block text-[11px] font-sans text-slate-600 dark:text-slate-400 mb-1.5">
                    Target Sheet Sections (Click to toggle):
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-900 rounded-lg border border-black/5">
                    {allSections.map((sec) => {
                      const isTargeted = aiSuggestTargetSections.includes(sec);
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            if (isTargeted) {
                              setAiSuggestTargetSections(aiSuggestTargetSections.filter((s) => s !== sec));
                            } else {
                              setAiSuggestTargetSections([...aiSuggestTargetSections, sec]);
                            }
                          }}
                          className={cn(
                            "px-2.5 py-1 text-[11px] font-mono rounded-md border transition-all",
                            isTargeted
                              ? "bg-amber-100 text-amber-900 border-amber-300 font-bold shadow-2xs"
                              : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                          )}
                        >
                          {sec}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Instructions Input */}
                <div className="mb-3">
                  <label className="block text-[11px] font-sans text-slate-600 dark:text-slate-400 mb-1">
                    Custom Prompt or Specific Focus (Optional):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Focus on aneurysm geometry (aspect ratio, dome-to-neck ratio), Raymond-Roy occlusion classification, 30-day stroke/mortality, and anticoagulation protocols..."
                    value={aiSuggestPrompt}
                    onChange={(e) => setAiSuggestPrompt(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-black/15 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                  />
                </div>

                {/* Generate Button */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#8A817A] font-mono">
                    Uses local Biomni / LLaMA model on GPU
                  </span>
                  <button
                    onClick={handleFetchAiSuggestions}
                    disabled={aiSuggestLoading}
                    className="btn-phylo-primary text-xs bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs"
                  >
                    {aiSuggestLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span>{aiSuggestLoading ? "Generating Suggestions..." : "Generate AI Suggestions"}</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Human Review & Decision Table */}
              <div className="bg-white dark:bg-slate-800/60 p-4 rounded-xl border border-black/[0.08] dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#6B665E] dark:text-slate-300 flex items-center gap-1.5">
                    <Table className="h-3.5 w-3.5 text-emerald-700" />
                    <span>2. Human Decision: Select Variables to Accept</span>
                  </h4>

                  {aiSuggestions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const allIds = new Set<string>();
                          aiSuggestions.forEach((s) => {
                            if (!s.is_already_present) allIds.add(s.temp_id);
                          });
                          setSelectedAiSuggestionIds(allIds);
                        }}
                        className="text-[11px] font-mono text-emerald-700 hover:underline"
                      >
                        Select All New
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => setSelectedAiSuggestionIds(new Set())}
                        className="text-[11px] font-mono text-slate-500 hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  )}
                </div>

                {aiSuggestions.length === 0 ? (
                  <div className="text-center py-8 px-4 border-2 border-dashed border-black/10 rounded-xl bg-slate-50/50">
                    <Sparkles className="h-8 w-8 text-amber-500 mx-auto mb-2 opacity-60" />
                    <p className="text-xs text-[#6B665E] font-medium">
                      No suggestions generated yet.
                    </p>
                    <p className="text-[11px] text-[#8A817A] mt-1 max-w-sm mx-auto">
                      Click "Generate AI Suggestions" above to inspect proposed clinical variables before adding them to your sheet.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px] uppercase border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="w-10 px-3 py-2 text-center">Accept</th>
                          <th className="px-3 py-2 text-left">Variable Name</th>
                          <th className="px-3 py-2 text-left">Section</th>
                          <th className="px-2 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Allowed Values / Coding</th>
                          <th className="px-3 py-2 text-left">Description / Prompt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {aiSuggestions.map((s) => {
                          const isSelected = selectedAiSuggestionIds.has(s.temp_id);
                          const isPresent = s.is_already_present;

                          return (
                            <tr
                              key={s.temp_id}
                              onClick={() => {
                                if (isPresent) return;
                                const next = new Set(selectedAiSuggestionIds);
                                if (next.has(s.temp_id)) next.delete(s.temp_id);
                                else next.add(s.temp_id);
                                setSelectedAiSuggestionIds(next);
                              }}
                              className={cn(
                                "transition-colors cursor-pointer",
                                isSelected ? "bg-amber-50/40 dark:bg-amber-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                                isPresent && "opacity-50 cursor-not-allowed bg-slate-50"
                              )}
                            >
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isPresent}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const next = new Set(selectedAiSuggestionIds);
                                    if (e.target.checked) next.add(s.temp_id);
                                    else next.delete(s.temp_id);
                                    setSelectedAiSuggestionIds(next);
                                  }}
                                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900 dark:text-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <span>{s.name}</span>
                                  {isPresent && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                                      In Sheet
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200">
                                  {s.section}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <span className="text-[10px] font-mono text-slate-600 uppercase">
                                  {s.field_type}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {s.allowed_values ? (
                                  <span>{s.allowed_values}</span>
                                ) : (
                                  <span className="text-slate-400 italic">Default missing: {s.default_missing_code || "NR"}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-[11px] max-w-xs truncate" title={s.description || s.extraction_prompt}>
                                {s.description || s.extraction_prompt || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-[#F2F1EB] dark:bg-slate-800 border-t border-black/[0.08] dark:border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>
                  <strong>{selectedAiSuggestionIds.size}</strong> variables selected to accept
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAiSuggestModal(false)}
                  className="px-4 py-1.5 text-xs text-[#6B665E] hover:text-[#141413] rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAcceptSelectedAiSuggestions}
                  disabled={isAcceptingAiSuggestions || selectedAiSuggestionIds.size === 0}
                  className="btn-phylo-primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 shadow-xs"
                >
                  {isAcceptingAiSuggestions ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 text-[#E9ED4C]" />
                  )}
                  <span>Accept Selected ({selectedAiSuggestionIds.size}) into Sheet</span>
                </button>
              </div>
            </div>
          </div>
        </div>
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
