import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type PdfDocumentData,
  type PdfHighlight as ApiPdfHighlight,
} from "../lib/api";
import { DEMO_CODEBOOK_RULES, DEMO_STUDIES, DEMO_EXTRACTIONS, DEMO_VARIABLES, type CodebookRule } from "../lib/demoData";
import {
  ArrowLeft, FileText, Loader2, Upload, Sparkles,
  CheckCircle, Table, Tag, Highlighter, ArrowRight,
  Check, X, Edit3, BookOpen, AlertCircle, TrendingUp,
  Download, HelpCircle, ChevronRight, ChevronLeft,
  RotateCcw, Search, Eye, Filter, Zap, ShieldAlert,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Sliders,
  PanelRightClose, PanelRightOpen, FileSpreadsheet,
  CheckCheck, ExternalLink
} from "lucide-react";
import { cn } from "../lib/utils";
import { CodebookDesignerModal } from "../components/common/CodebookDesignerModal";
import { ActualPdfViewer, type PdfHighlightItem } from "../components/common/ActualPdfViewer";

export const BENCHMARK_PAPERS = [
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

interface UndoRecord {
  studyId: string;
  variableId: string;
  variableName: string;
  previousValue: string;
  previousVerified: boolean;
  previousEdited: boolean;
  previousDecision: "accepted" | "modified" | "rejected";
  previousFewShotQueue: Array<{ variable: string; quote: string; value: string; rule: string }>;
}

export function PdfViewerPage() {
  const { projectId, studyId } = useParams<{ projectId: string; studyId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const queryStudy = searchParams.get("study");
  const rawTargetStudy = studyId || queryStudy;

  // Active view states
  const [leftTab, setLeftTab] = useState<"document" | "sections" | "tables">("document");
  const [selectedVarId, setSelectedVarId] = useState<string | null>(searchParams.get("var") || null);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);
  const [documentSearch, setDocumentSearch] = useState<string>("");
  const [showErrorAnalysis, setShowErrorAnalysis] = useState<boolean>(false);
  const [reviewerName, setReviewerName] = useState<string>("Expert Reviewer");
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [selectedPaperId, setSelectedPaperId] = useState<string>(() => {
    const match = BENCHMARK_PAPERS.find((p) => p.id === rawTargetStudy || p.shortId === rawTargetStudy);
    return match ? match.id : "study_birua_2022";
  });
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(null);

  const activeStudyId = selectedPaperId || (rawTargetStudy ? (BENCHMARK_PAPERS.find(p => p.id === rawTargetStudy || p.shortId === rawTargetStudy)?.id || rawTargetStudy) : "study_birua_2022");

  // Synchronize selected paper with route parameter or query
  useEffect(() => {
    const target = studyId || searchParams.get("study");
    if (!target) return;
    const match = BENCHMARK_PAPERS.find((p) => p.id === target || p.shortId === target);
    if (match && match.id !== selectedPaperId) {
      setSelectedPaperId(match.id);
    }
  }, [studyId, searchParams, selectedPaperId]);

  // Collapsible Protocol Rules panel (collapsed by default on extraction side as requested)
  const [showCodebookPanel, setShowCodebookPanel] = useState<boolean>(false);
  // In-app Codebook designer modal (create inside app without uploading)
  const [showCodebookDesigner, setShowCodebookDesigner] = useState<boolean>(false);
  // AIDE-style Recorded answers matrix / data sheet modal
  const [showDataSheetModal, setShowDataSheetModal] = useState<boolean>(false);
  // Dynamic in-app codebook rules state
  const [customRules, setCustomRules] = useState<Record<string, CodebookRule>>(() => {
    try {
      const saved = localStorage.getItem("radextract_codebook_rules");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_CODEBOOK_RULES;
  });

  // Undo system
  const [undoStack, setUndoStack] = useState<UndoRecord[]>([]);
  const [undoToastMessage, setUndoToastMessage] = useState<string | null>(null);

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

  // Auto-advance & countdown state to next study
  const [undoToast, setUndoToast] = useState<{
    show: boolean;
    timer: number;
    nextStudyId: string;
    nextStudyTitle: string;
  } | null>(null);
  const undoTimeoutRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docScrollRef = useRef<HTMLDivElement>(null);

  // Element refs for smooth auto-scrolling
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Queries ──

  const { data: studyList } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const allStudies = (studyList && studyList.length > 0) ? studyList : DEMO_STUDIES;
  const currentStudyIndex = Math.max(0, allStudies.findIndex((s: any) => s.study_id === activeStudyId));
  const currentStudy = allStudies[currentStudyIndex] || allStudies[0];

  const { data: study } = useQuery({
    queryKey: ["study", activeStudyId],
    queryFn: () => api.getStudy(activeStudyId),
    enabled: !!activeStudyId,
  });

  const { data: pdfSummary } = useQuery({
    queryKey: ["pdf-summary", activeStudyId],
    queryFn: () => api.getPdfSummary(activeStudyId),
    enabled: !!activeStudyId,
  });

  const { data: pdfData } = useQuery({
    queryKey: ["pdf-data", activeStudyId],
    queryFn: () => api.getPdfData(activeStudyId),
    enabled: !!activeStudyId,
  });

  const { data: variables } = useQuery({
    queryKey: ["variables", projectId],
    queryFn: () => api.listVariables(projectId!),
    enabled: !!projectId,
  });

  const { data: extractions, refetch: refetchExtractions } = useQuery({
    queryKey: ["extractions", activeStudyId],
    queryFn: () => api.listExtractions(activeStudyId),
    enabled: !!activeStudyId,
  });

  const { data: errorAnalysis, refetch: refetchErrorAnalysis } = useQuery({
    queryKey: ["error-analysis", projectId],
    queryFn: () => api.getErrorAnalysis(projectId),
    enabled: !!projectId,
  });

  // Ensure first variable is selected on load
  const variableList = (variables && variables.length > 0) ? variables : DEMO_VARIABLES;
  useEffect(() => {
    if (!selectedVarId && variableList.length > 0) {
      setSelectedVarId(variableList[0].variable_id);
    }
  }, [selectedVarId, variableList]);

  // When switching studies, ensure selected variable is valid
  useEffect(() => {
    if (variableList.length > 0) {
      const exists = variableList.some((v: any) => v.variable_id === selectedVarId);
      if (!exists) {
        setSelectedVarId(variableList[0].variable_id);
      }
    }
  }, [activeStudyId, variableList, selectedVarId]);

  // Selected variable & extraction
  const currentVar = variableList.find((v: any) => v.variable_id === selectedVarId) || variableList[0];
  const extractionMap: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    const fallbackList = (DEMO_EXTRACTIONS as any)[activeStudyId] || (DEMO_EXTRACTIONS as any)["study_birua_2022"] || [];
    const sourceList = (extractions && extractions.length > 0) ? extractions : fallbackList;
    sourceList.forEach((e: any) => {
      if (e.variable_id) map[e.variable_id] = e;
    });
    return map;
  }, [extractions, activeStudyId]);

  const currentExtraction = currentVar ? extractionMap[currentVar.variable_id] : null;
  const currentRule: CodebookRule | undefined = currentVar ? (customRules[currentVar.variable_id] || DEMO_CODEBOOK_RULES[currentVar.variable_id]) : undefined;

  // Progress metrics
  const currentVarIndex = Math.max(0, variableList.findIndex((v: any) => v.variable_id === selectedVarId));
  const verifiedCount = variableList.filter((v: any) => extractionMap[v.variable_id]?.is_verified).length;
  const progressPercent = variableList.length > 0 ? Math.round((verifiedCount / variableList.length) * 100) : 0;

  // Active Publication PDF URL computation
  const currentPdfUrl = useMemo(() => {
    if (customPdfUrl) return customPdfUrl;
    const paper = BENCHMARK_PAPERS.find((p) => p.id === activeStudyId) || BENCHMARK_PAPERS[0];
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base : base + "/";
    return cleanBase + "papers/" + paper.filename;
  }, [customPdfUrl, activeStudyId]);

  // Map extraction variables to spatial PDF highlights for ActualPdfViewer
  const pdfHighlightItems = useMemo<PdfHighlightItem[]>(() => {
    return variableList.map((v: any, idx: number) => {
      const ext = extractionMap[v.variable_id];
      return {
        id: v.variable_id,
        varIndex: idx + 1,
        label: v.name,
        quote: ext?.quote || "",
        pageNumber: ext?.source_page || 1,
        isVerified: !!ext?.is_verified,
        value: ext?.value,
      };
    });
  }, [variableList, extractionMap]);

  // Export study recorded extraction data sheet (CSV) - AIDE-Web style
  const handleExportStudyCsv = () => {
    const headers = ["Variable ID", "Variable Name", "Section", "Extracted Value", "Status", "Source Page", "Evidence Quote"];
    const rows = variableList.map((v: any) => {
      const ext = extractionMap[v.variable_id];
      return [
        v.variable_id,
        `"${(v.name || "").replace(/"/g, '""')}"`,
        `"${(v.section || "").replace(/"/g, '""')}"`,
        `"${(ext?.value || "").replace(/"/g, '""')}"`,
        ext?.is_verified ? "Recorded (Verified)" : "Pending Review",
        ext?.source_page || 1,
        `"${(ext?.quote || "").replace(/"/g, '""')}"`
      ].join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extraction_${activeStudyId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Find Quote in PDF: Scroll, center, and flash the highlight in ActualPdfViewer ──
  const findQuoteInPdf = useCallback((targetVarId?: string) => {
    const vid = targetVarId || selectedVarId;
    if (!vid) return;

    if (selectedVarId !== vid) {
      setSelectedVarId(vid);
    }

    // 1. Dispatch custom event for ActualPdfViewer
    window.dispatchEvent(new CustomEvent("radextract:find-quote", { detail: { variableId: vid } }));

    // 2. Direct DOM scroll fallback with pulsing glow
    requestAnimationFrame(() => {
      const highlightElement = document.getElementById(`pdf-highlight-${vid}`);
      if (highlightElement) {
        highlightElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        highlightElement.classList.add("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
        setTimeout(() => {
          highlightElement.classList.remove("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
        }, 1500);
      } else {
        const ext = extractionMap[vid];
        const pageNum = ext?.source_page || 1;
        const pageElement = document.getElementById(`pdf-page-${pageNum}`);
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const retryEl = document.getElementById(`pdf-highlight-${vid}`);
            if (retryEl) {
              retryEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
              retryEl.classList.add("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
              setTimeout(() => {
                retryEl.classList.remove("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
              }, 1500);
            }
          }, 350);
        }
      }
    });
  }, [selectedVarId, extractionMap]);

  // ── Auto-scroll when selected variable changes ──
  useEffect(() => {
    if (!selectedVarId) return;

    // Center column card auto-scroll
    const targetCard = cardRefs.current[selectedVarId];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedVarId]);

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

    // Save state to undoStack before performing decision
    setUndoStack((prev) => [
      ...prev,
      {
        studyId: activeStudyId,
        variableId: currentVar.variable_id,
        variableName: currentVar.name,
        previousValue: origVal,
        previousVerified: !!currentExtraction?.is_verified,
        previousEdited: !!currentExtraction?.is_edited,
        previousDecision: decision,
        previousFewShotQueue: [...fewShotExemplars],
      },
    ]);

    try {
      if (decision === "accepted") {
        setAcceptTransitioningId(currentVar.variable_id);
      }

      await api.recordExtractionDecision({
        project_id: projectId!,
        study_id: activeStudyId,
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

      // Smooth visual confirmation transition on Accept
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

  // ── Undo Last Decision ──

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    try {
      await api.recordExtractionDecision({
        project_id: projectId!,
        study_id: lastAction.studyId,
        variable_id: lastAction.variableId,
        variable_name: lastAction.variableName,
        original_value: lastAction.previousValue,
        corrected_value: lastAction.previousValue,
        decision: "undone",
        reviewer: reviewerName,
        notes: "Reverted via Undo action",
      });

      // Restore previous few-shot queue
      setFewShotExemplars(lastAction.previousFewShotQueue);
      try {
        localStorage.setItem("radextract_few_shots", JSON.stringify(lastAction.previousFewShotQueue));
      } catch {}

      // Navigate back to the undone variable
      setSelectedVarId(lastAction.variableId);
      setEditingVarId(null);

      // Refresh data
      await refetchExtractions();
      await refetchErrorAnalysis();
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });

      // Flash undo toast
      setUndoToastMessage(`Undone: Reverted "${lastAction.variableName}" to Pending Review`);
      setTimeout(() => setUndoToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to undo decision:", err);
    }
  }, [undoStack, projectId, reviewerName, refetchExtractions, refetchErrorAnalysis, queryClient]);

  // ── Accept All High-Confidence (>95%) Extractions ──
  const highConfPendingVariables = useMemo(() => {
    return variableList.filter((v: any) => {
      const ext = extractionMap[v.variable_id];
      if (!ext || ext.is_verified) return false;
      const confPercent = Math.round((ext.confidence || 0) * 100);
      return confPercent > 95;
    });
  }, [variableList, extractionMap]);

  const [isAcceptingAll, setIsAcceptingAll] = useState(false);

  const handleAcceptAllHighConfidence = async () => {
    if (highConfPendingVariables.length === 0 || isAcceptingAll) return;
    setIsAcceptingAll(true);

    try {
      const batchUndos: any[] = [];
      for (const v of highConfPendingVariables) {
        const ext = extractionMap[v.variable_id];
        const val = ext?.value || "";
        const rule = customRules[v.variable_id] || DEMO_CODEBOOK_RULES[v.variable_id];

        batchUndos.push({
          studyId: activeStudyId,
          variableId: v.variable_id,
          variableName: v.name,
          previousValue: val,
          previousVerified: !!ext?.is_verified,
          previousEdited: !!ext?.is_edited,
          previousDecision: "accepted",
          previousFewShotQueue: [...fewShotExemplars],
        });

        await api.recordExtractionDecision({
          project_id: projectId!,
          study_id: activeStudyId,
          variable_id: v.variable_id,
          variable_name: v.name,
          original_value: val,
          corrected_value: val,
          decision: "accepted",
          evidence_quote: ext?.quote || "",
          page_number: ext?.source_page || 1,
          codebook_rules: rule?.definition || "",
          reviewer: reviewerName,
          notes: "Accepted via Batch High Confidence (>95%)",
        });
      }

      setUndoStack((prev) => [...prev, ...batchUndos]);
      await refetchExtractions();
      await refetchErrorAnalysis();
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });

      setUndoToastMessage(`Accepted ${highConfPendingVariables.length} high-confidence (>95%) extractions ✓`);
      setTimeout(() => setUndoToastMessage(null), 3500);

      // Select first remaining unverified variable (e.g. low-confidence ones)
      const remainingUnverified = variableList.find((v: any) => {
        const ext = extractionMap[v.variable_id];
        const isJustAccepted = highConfPendingVariables.some((hv: any) => hv.variable_id === v.variable_id);
        return ext && !ext.is_verified && !isJustAccepted;
      });

      if (remainingUnverified) {
        setSelectedVarId(remainingUnverified.variable_id);
        findQuoteInPdf(remainingUnverified.variable_id);
      }
    } catch (err) {
      console.error("Failed to batch accept high confidence extractions:", err);
    } finally {
      setIsAcceptingAll(false);
    }
  };

  // ── Keyboard Shortcuts (A: Accept, M: Modify, R: Reject, Z/U: Undo, Down: Next, Up: Prev) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input, textarea, select, or contentEditable element
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInput) return;

      // Also ignore Enter key if a button is focused to prevent double action
      if ((e.key === "Enter" || e.key === " ") && target.tagName === "BUTTON") return;

      // Undo hotkey: Z, Ctrl+Z, Cmd+Z, U
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) ||
        e.key === "u" ||
        e.key === "U" ||
        e.key === "z" ||
        e.key === "Z"
      ) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Find Quote in PDF hotkey: F or Q
      if (e.key === "f" || e.key === "F" || e.key === "q" || e.key === "Q") {
        e.preventDefault();
        findQuoteInPdf(currentVar?.variable_id);
        return;
      }

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
  }, [currentVar, currentExtraction, handleUndo, handleDecision, navigateToNextVariable, navigateToPrevVariable, findQuoteInPdf]);

  // ── Upload PDF Mutation ──
  const uploadPdfMutation = useMutation({
    mutationFn: (file: File) => api.uploadPdf(activeStudyId, file, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", activeStudyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-summary", activeStudyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-data", activeStudyId] });
      queryClient.invalidateQueries({ queryKey: ["extractions", activeStudyId] });
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

  const jumpToPage = (pageNum: number) => {
    const pageEl = pageRefs.current[pageNum];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ── Text Highlight Renderer ──
  // Takes any text string and renders interactive highlights for all matching extraction quotes
  const renderTextWithHighlights = useCallback((text: string) => {
    if (!text) return null;

    // Collect all quotes from all variables in this study
    const matchItems: Array<{
      start: number;
      end: number;
      quote: string;
      variable: any;
      extraction: any;
      varIndex: number;
    }> = [];

    variableList.forEach((v: any, idx: number) => {
      const ext = extractionMap[v.variable_id];
      if (!ext?.quote) return;
      const quote = ext.quote.trim();
      if (!quote) return;

      const lowerText = text.toLowerCase();
      const lowerQuote = quote.toLowerCase();
      let pos = lowerText.indexOf(lowerQuote);
      if (pos === -1) {
        // Fallback partial match of first 28 chars
        const shortQ = lowerQuote.slice(0, 28);
        pos = lowerText.indexOf(shortQ);
        if (pos !== -1) {
          matchItems.push({
            start: pos,
            end: pos + shortQ.length,
            quote: text.substring(pos, pos + shortQ.length),
            variable: v,
            extraction: ext,
            varIndex: idx + 1,
          });
        }
      } else {
        matchItems.push({
          start: pos,
          end: pos + quote.length,
          quote: text.substring(pos, pos + quote.length),
          variable: v,
          extraction: ext,
          varIndex: idx + 1,
        });
      }
    });

    if (matchItems.length === 0) {
      // Check in-document search query
      if (documentSearch.trim() && text.toLowerCase().includes(documentSearch.toLowerCase())) {
        const parts = text.split(new RegExp(`(${documentSearch})`, "gi"));
        return (
          <>
            {parts.map((p, i) =>
              p.toLowerCase() === documentSearch.toLowerCase() ? (
                <mark key={i} className="bg-cyan-200 text-slate-900 rounded px-0.5 font-bold">
                  {p}
                </mark>
              ) : (
                p
              )
            )}
          </>
        );
      }
      return text;
    }

    // Sort non-overlapping match items
    matchItems.sort((a, b) => a.start - b.start);
    const nonOverlapping: typeof matchItems = [];
    let lastEnd = 0;
    for (const item of matchItems) {
      if (item.start >= lastEnd) {
        nonOverlapping.push(item);
        lastEnd = item.end;
      }
    }

    const elements: React.ReactNode[] = [];
    let curIndex = 0;

    nonOverlapping.forEach((match, mIdx) => {
      if (match.start > curIndex) {
        elements.push(text.substring(curIndex, match.start));
      }

      const isSelected = match.variable.variable_id === selectedVarId;
      const isVerified = match.extraction.is_verified;

      elements.push(
        <span
          key={`match-${mIdx}-${match.variable.variable_id}`}
          ref={(el) => {
            if (isSelected) {
              highlightRefs.current[match.variable.variable_id] = el;
            } else if (!highlightRefs.current[match.variable.variable_id]) {
              highlightRefs.current[match.variable.variable_id] = el;
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedVarId(match.variable.variable_id);
          }}
          className={cn(
            "inline transition-all duration-300 rounded px-1 py-0.5 cursor-pointer relative group",
            isSelected
              ? "bg-amber-300 text-slate-950 font-semibold ring-2 ring-amber-500 shadow-md"
              : isVerified
              ? "bg-emerald-100 hover:bg-emerald-200 border-b-2 border-emerald-400 text-slate-900"
              : "bg-amber-100 hover:bg-amber-200 border-b-2 border-amber-400 text-slate-900"
          )}
          title={`Click to inspect: #${match.varIndex} ${match.variable.name} (${match.extraction.value})`}
        >
          {/* Tag Pill */}
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-mono font-bold rounded px-1 py-0.2 mr-1 align-middle select-none shadow-2xs",
              isSelected
                ? "bg-amber-600 text-white"
                : isVerified
                ? "bg-emerald-600 text-white"
                : "bg-amber-500 text-white"
            )}
          >
            #{match.varIndex}
          </span>
          {match.quote}
          {isSelected && (
            <span className="ml-1 text-[10px] font-sans font-bold bg-amber-400 text-amber-950 px-1 py-0.2 rounded shadow-xs select-none">
              ✓ {match.extraction.value}
            </span>
          )}
        </span>
      );

      curIndex = match.end;
    });

    if (curIndex < text.length) {
      elements.push(text.substring(curIndex));
    }

    return elements;
  }, [variableList, extractionMap, selectedVarId, documentSearch]);

  return (
    <div className="flex flex-col h-screen bg-[#ECE9E2] overflow-hidden font-sans">
      {/* ── TOP NAV HEADER ── */}
      <header className="bg-[#FAF9F3] border-b border-[#381A61]/10 px-5 py-2.5 shrink-0 flex items-center justify-between shadow-xs z-30">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/studies`}
            className="text-xs font-semibold text-[#381A61] hover:text-[#381A61] flex items-center gap-1.5 bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 px-3 py-1.5 rounded-xl border border-[#88A0DC]/40 transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Studies
          </Link>
          <div className="h-4 w-px bg-[#381A61]/15" />

          {/* Study Stepper */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentStudyIndex > 0) {
                  const prevStudy = allStudies[currentStudyIndex - 1];
                  setSelectedPaperId(prevStudy.study_id);
                  navigate(`/projects/${projectId}/studies/${prevStudy.study_id}/pdf`);
                }
              }}
              disabled={currentStudyIndex === 0}
              className="p-1 rounded-lg hover:bg-[#381A61]/5 disabled:opacity-30 disabled:pointer-events-none text-[#381A61]"
              title="Previous Study"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-[#381A61] bg-[#7C4B73]/10 border border-[#7C4B73]/20 px-2.5 py-1 rounded-lg">
              Study {currentStudyIndex + 1} of {allStudies.length}
            </span>
            <button
              onClick={() => {
                if (currentStudyIndex < allStudies.length - 1) {
                  const nextStudy = allStudies[currentStudyIndex + 1];
                  setSelectedPaperId(nextStudy.study_id);
                  navigate(`/projects/${projectId}/studies/${nextStudy.study_id}/pdf`);
                }
              }}
              disabled={currentStudyIndex === allStudies.length - 1}
              className="p-1 rounded-lg hover:bg-[#381A61]/5 disabled:opacity-30 disabled:pointer-events-none text-[#381A61]"
              title="Next Study"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-2">
              <h1 className="font-serif font-bold text-[#381A61] text-sm sm:text-base leading-tight truncate max-w-md">
                {currentStudy?.title || "Study PDF & Extraction"}
              </h1>
              <p className="text-[11px] text-[#6B665E] font-serif italic truncate max-w-sm">
                {currentStudy?.authors} · {currentStudy?.publication_year} · {currentStudy?.journal}
              </p>
            </div>
          </div>
        </div>

        {/* Center Progress Bar */}
        <div className="hidden lg:flex items-center gap-3 bg-white border border-[#381A61]/10 px-4 py-1.5 rounded-full shadow-2xs">
          <div className="text-xs font-medium text-[#381A61]">
            Extraction Progress: <span className="font-bold text-[#7C4B73] font-mono">{verifiedCount}/{variableList.length}</span> Verified
          </div>
          <div className="w-28 bg-[#88A0DC]/25 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#381A61] to-[#7C4B73] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-[#381A61] font-mono">{progressPercent}%</span>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* In-App Codebook Designer Button */}
          <button
            onClick={() => setShowCodebookDesigner(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 text-[#381A61] border border-[#88A0DC]/40 transition-colors shadow-2xs"
            title="Design and customize codebook variables directly in-app (No file upload required)"
          >
            <Sliders className="h-3.5 w-3.5 text-[#381A61]" />
            <span>In-App Codebook</span>
          </button>

          {/* AIDE-Web Style Recorded Answers Data Sheet Button & Full Page Link */}
          <button
            onClick={() => setShowDataSheetModal(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 bg-[#7C4B73]/10 hover:bg-[#7C4B73]/20 text-[#7C4B73] border border-[#7C4B73]/30 transition-colors shadow-2xs"
            title="Inspect recorded study answers matrix modal"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#7C4B73]" />
            <span>Recorded Sheet</span>
          </button>

          <Link
            to={`/projects/${projectId}/extraction-sheet?study=${selectedPaperId}`}
            className="px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 bg-[#381A61] hover:bg-[#4E2487] text-[#FAF9F3] transition-colors shadow-xs"
            title="Open full dedicated Extraction Sheet page with multi-study matrix"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Full-Page Matrix</span>
          </Link>

          {/* Toggle Protocol Rules Panel Button */}
          <button
            onClick={() => setShowCodebookPanel(!showCodebookPanel)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 border transition-colors",
              showCodebookPanel
                ? "bg-[#7C4B73]/15 text-[#7C4B73] border-[#7C4B73]/40"
                : "bg-white text-[#381A61] border-[#381A61]/15 hover:bg-[#381A61]/5"
            )}
            title={showCodebookPanel ? "Minimize Protocol Rules Panel" : "Open Protocol Rules & Guidelines"}
          >
            {showCodebookPanel ? (
              <PanelRightClose className="h-3.5 w-3.5 text-[#7C4B73]" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5 text-[#6B665E]" />
            )}
            <span>{showCodebookPanel ? "Hide Rules" : "Protocol Rules"}</span>
          </button>

          {/* Active Learning & Error Analysis Button */}
          <button
            onClick={() => setShowErrorAnalysis(!showErrorAnalysis)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors border ${
              showErrorAnalysis 
                ? "bg-[#ED968C]/25 text-[#AB3329] border-[#ED968C]/50" 
                : "bg-white text-[#381A61] border-[#381A61]/15 hover:bg-[#381A61]/5"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-[#AB3329]" />
            <span>Active Learning</span>
            {errorAnalysis?.total_discrepancies > 0 && (
              <span className="bg-[#AB3329] text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
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
            className="px-3 py-1.5 text-xs font-semibold text-[#381A61] hover:text-[#381A61] bg-white border border-[#381A61]/15 rounded-xl hover:bg-[#381A61]/5 flex items-center gap-1.5 shadow-2xs"
          >
            {uploadPdfMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#381A61]" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-[#7C4B73]" />
            )}
            Upload PDF
          </button>

          {/* Link to Review Table */}
          <Link
            to={`/projects/${projectId}/review`}
            className="px-3.5 py-1.5 text-xs font-bold text-[#381A61] bg-[#F9D14A] hover:bg-[#F9D14A]/90 border border-[#E78429]/40 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
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

      {/* ── UNDO ACTION NOTIFICATION TOAST ── */}
      {undoToastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 text-amber-100 px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 border border-amber-500 animate-in fade-in slide-in-from-top-2 duration-150 text-xs font-medium">
          <RotateCcw className="h-4 w-4 text-amber-300" />
          <span>{undoToastMessage}</span>
        </div>
      )}

      {/* ── 3-COLUMN WORKSPACE BODY ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        
        {/* ══════════════════════════════════════════════════════════
            COLUMN 1: ACTUAL PDF PUBLICATION VIEWER & HIGHLIGHTS (LEFT)
        ══════════════════════════════════════════════════════════ */}
        <section className={cn(
          "border-r border-[#381A61]/10 bg-[#ECE9E2] flex flex-col h-full overflow-hidden transition-all duration-300",
          showCodebookPanel ? "w-[38%]" : "w-[56%]"
        )}>
          <ActualPdfViewer
            pdfUrl={currentPdfUrl}
            highlights={pdfHighlightItems}
            activeHighlightId={selectedVarId}
            onHighlightClick={(varId) => {
              setSelectedVarId(varId);
              cardRefs.current[varId]?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onPdfUpload={(file) => {
              const url = URL.createObjectURL(file);
              setCustomPdfUrl(url);
            }}
            zoom={pdfZoom}
            onZoomChange={setPdfZoom}
            availableStudies={BENCHMARK_PAPERS}
            currentStudyId={selectedPaperId}
            onSelectStudy={(id) => {
              setSelectedPaperId(id);
              setCustomPdfUrl(null);
              if (projectId) {
                navigate(`/projects/${projectId}/studies/${id}/pdf`);
              }
            }}
          />
        </section>

        {/* ══════════════════════════════════════════════════════════
            COLUMN 2: TRACK CHANGES VERIFICATION CARDS (CENTER)
        ══════════════════════════════════════════════════════════ */}
        <section className="flex-1 bg-[#F2F1EB] border-r border-[#381A61]/10 flex flex-col h-full overflow-hidden min-w-0">
          {/* Microsoft Word Track Changes Review Ribbon Bar */}
          <div className="border-b border-[#381A61]/10 bg-[#FAF9F3] px-4 py-2.5 shrink-0 flex flex-col gap-2 shadow-2xs z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#381A61] uppercase tracking-wide flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#381A61] animate-pulse" />
                  Word-Style Track Changes
                </span>
                <span className="bg-[#88A0DC]/20 text-[#381A61] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#88A0DC]/35">
                  Revision {currentVarIndex + 1} of {variableList.length}
                </span>
                <span className="text-[11px] font-medium text-[#7C4B73] hidden sm:inline font-serif italic">
                  · {progressPercent}% Verified
                </span>
              </div>

              {/* Fast Action Ribbon Buttons: Accept All >95%, Accept & Next, Reject & Next, Modify, Prev, Next, Undo */}
              <div className="flex items-center gap-1.5">
                {/* Accept All High-Confidence (>95%) Button */}
                <button
                  onClick={handleAcceptAllHighConfidence}
                  disabled={highConfPendingVariables.length === 0 || isAcceptingAll}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all",
                    highConfPendingVariables.length > 0
                      ? "text-[#381A61] bg-[#F9D14A] hover:bg-[#F9D14A]/90 border border-[#E78429]/40 active:scale-95 cursor-pointer ring-1 ring-[#F9D14A]/50"
                      : "text-slate-400 bg-slate-100 border border-slate-200 opacity-60 cursor-not-allowed"
                  )}
                  title={
                    highConfPendingVariables.length > 0
                      ? `Accept all ${highConfPendingVariables.length} extractions with AI confidence >95%`
                      : "No pending extractions with confidence >95%"
                  }
                >
                  {isAcceptingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#381A61]" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 text-[#381A61]" />
                  )}
                  <span>Accept All &gt;95%</span>
                  {highConfPendingVariables.length > 0 && (
                    <span className="text-[10px] font-mono font-bold bg-[#381A61] text-[#F9D14A] rounded-full px-1.5 py-0.2">
                      {highConfPendingVariables.length}
                    </span>
                  )}
                </button>

                {/* Accept & Next Button */}
                <button
                  onClick={() => handleDecision("accepted")}
                  disabled={acceptTransitioningId === currentVar?.variable_id}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-[#381A61] hover:bg-[#4E2487] active:scale-95 rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                  title="Accept AI extraction and autoscroll to next highlight (Hotkey: A or Enter)"
                >
                  <Check className="h-3.5 w-3.5 text-[#F9D14A]" />
                  <span>Accept & Next</span>
                  <kbd className="text-[10px] bg-white/20 text-[#FAF9F3] px-1 py-0.2 rounded font-mono font-normal">A</kbd>
                </button>

                {/* Reject & Next Button */}
                <button
                  onClick={() => handleDecision("rejected")}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#AB3329] bg-[#AB3329]/10 hover:bg-[#AB3329]/20 border border-[#AB3329]/30 active:scale-95 rounded-xl flex items-center gap-1 transition-all"
                  title="Reject / Mark NR and autoscroll to next highlight (Hotkey: R)"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Reject</span>
                  <kbd className="text-[10px] bg-[#AB3329]/20 text-[#AB3329] px-1 py-0.2 rounded font-mono font-normal">R</kbd>
                </button>

                {/* Modify Button */}
                <button
                  onClick={() => {
                    if (currentVar) {
                      setEditingVarId(currentVar.variable_id);
                      setEditDraftValue(currentExtraction?.value || "");
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-[#7C4B73] bg-[#7C4B73]/10 hover:bg-[#7C4B73]/20 border border-[#7C4B73]/25 rounded-xl flex items-center gap-1 transition-all active:scale-95"
                  title="Modify extracted value inline (Hotkey: M)"
                >
                  <Edit3 className="h-3 w-3 text-[#7C4B73]" />
                  <kbd className="text-[10px] bg-white border border-[#7C4B73]/30 px-1 rounded font-mono text-[#7C4B73]">M</kbd>
                </button>

                {/* Find Quote in PDF Button in Ribbon */}
                <button
                  onClick={() => findQuoteInPdf(currentVar?.variable_id)}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#381A61] bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 border border-[#88A0DC]/40 rounded-xl flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="Find & jump to quote in PDF (Hotkey: F or Q)"
                >
                  <Eye className="h-3.5 w-3.5 text-[#381A61]" />
                  <span className="hidden sm:inline">Find Quote</span>
                  <kbd className="text-[10px] bg-white border border-[#88A0DC]/60 px-1 rounded font-mono text-[#381A61] font-bold">F</kbd>
                </button>

                <div className="h-4 w-px bg-[#381A61]/15 mx-0.5" />

                {/* Previous Change Button */}
                <button
                  onClick={navigateToPrevVariable}
                  disabled={currentVarIndex === 0}
                  className="p-1.5 rounded-lg text-[#381A61] hover:bg-[#381A61]/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Previous Change & Highlight (Hotkey: [ or ↑ or K)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Next Change Button */}
                <button
                  onClick={navigateToNextVariable}
                  disabled={currentVarIndex >= variableList.length - 1}
                  className="p-1.5 rounded-lg text-[#381A61] hover:bg-[#381A61]/5 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Next Change & Highlight (Hotkey: ] or ↓ or J)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Undo Button */}
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-xl flex items-center gap-1 transition-all shadow-2xs",
                    undoStack.length > 0
                      ? "bg-[#E78429]/15 hover:bg-[#E78429]/25 text-[#E78429] border border-[#E78429]/30 cursor-pointer active:scale-95"
                      : "bg-slate-100 text-slate-400 border border-slate-200 opacity-60 cursor-not-allowed"
                  )}
                  title="Undo last accepted/modified change and scroll back (Hotkey: Z or U or Ctrl+Z)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Undo</span>
                  <kbd className="text-[9px] bg-white border border-[#E78429]/30 rounded px-1 font-mono text-[#E78429]">Z</kbd>
                  {undoStack.length > 0 && (
                    <span className="text-[9px] font-bold bg-[#E78429] text-white rounded-full px-1.5 py-0.2">
                      {undoStack.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Word Review Progress Bar */}
            <div className="w-full bg-[#88A0DC]/20 rounded-full h-1 overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-[#381A61] to-[#7C4B73] h-1 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Main Card View: All Variables List with Focused Track Changes Card */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {variableList.map((v: any, index: number) => {
              const ext = extractionMap[v.variable_id];
              const isSelected = v.variable_id === selectedVarId;
              const isVerified = ext?.is_verified;
              const isEdited = ext?.is_edited;
              const rule = customRules[v.variable_id] || DEMO_CODEBOOK_RULES[v.variable_id];
              const isTransitioning = acceptTransitioningId === v.variable_id;

              const confPercent = Math.round((ext?.confidence || 0) * 100);
              const isLowConfidence = !isVerified && confPercent > 0 && confPercent <= 95;

              return (
                <div
                  key={v.variable_id}
                  ref={(el) => { cardRefs.current[v.variable_id] = el; }}
                  onClick={() => {
                    setSelectedVarId(v.variable_id);
                    findQuoteInPdf(v.variable_id);
                  }}
                  className={cn(
                    "rounded-2xl border transition-all cursor-pointer duration-300",
                    isTransitioning
                      ? "bg-[#7C4B73]/10 border-2 border-[#7C4B73] shadow-lg ring-4 ring-[#7C4B73]/30 scale-[1.01]"
                      : isSelected
                      ? isLowConfidence
                        ? "bg-white border-2 border-[#E78429] shadow-lg ring-4 ring-[#E78429]/30 scale-[1.005]"
                        : "bg-white border-2 border-[#381A61] shadow-lg ring-4 ring-[#F9D14A]/60 scale-[1.005]"
                      : isLowConfidence
                      ? "bg-white/95 border border-[#E78429]/40 hover:border-[#E78429] hover:bg-white shadow-xs"
                      : "bg-white/90 border border-[#381A61]/10 hover:border-[#7C4B73]/40 hover:bg-white shadow-2xs"
                  )}
                >
                  {/* Card Header */}
                  <div className={`p-3.5 border-b flex items-center justify-between transition-colors ${
                    isLowConfidence && !isVerified
                      ? "bg-[#E78429]/10 border-[#E78429]/25"
                      : "border-[#381A61]/10 bg-[#FAF9F3]"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[#7C4B73] font-bold">
                        #{index + 1}
                      </span>
                      <span className="font-serif font-bold text-[#381A61] text-base">
                        {v.name}
                      </span>
                      <span className="text-[10px] font-semibold text-[#381A61] bg-[#88A0DC]/20 border border-[#88A0DC]/35 px-2.5 py-0.5 rounded-full">
                        {v.section || "General"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isVerified ? (
                        <span className="text-[11px] font-bold text-[#7C4B73] bg-[#7C4B73]/15 border border-[#7C4B73]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <Check className="h-3 w-3 text-[#7C4B73]" /> {isEdited ? "Modified & Verified" : "Accepted"}
                        </span>
                      ) : isLowConfidence ? (
                        <span className="text-[11px] font-bold text-[#E78429] bg-[#E78429]/15 border border-[#E78429]/35 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <AlertCircle className="h-3 w-3 text-[#E78429]" /> Review Required
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#6B665E] bg-[#88A0DC]/10 border border-[#88A0DC]/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-[#88A0DC]" /> Pending Review
                        </span>
                      )}

                      {ext?.confidence && (
                        isLowConfidence ? (
                          <span className="text-[10px] font-mono text-[#E78429] bg-[#E78429]/15 border border-[#E78429]/35 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shadow-2xs" title="Confidence ≤ 95% - Requires manual scrutiny">
                            <span>{confPercent}% AI Conf</span>
                            <span className="text-[9px] bg-[#E78429] text-white px-1 rounded uppercase tracking-wider font-extrabold">Low</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#381A61] bg-[#F9D14A]/30 border border-[#F9D14A] px-2 py-0.5 rounded-md font-bold" title="High confidence (>95%)">
                            {confPercent}% AI Conf
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Card Body: Track Changes Diff & Values */}
                  <div className="p-4 space-y-3">
                    {/* AIDE-Web Inspired Prominent Recorded Answer Banner */}
                    {isVerified && (
                      <div className="bg-[#7C4B73]/10 border border-[#7C4B73]/30 rounded-xl p-2.5 flex items-center justify-between text-xs animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle className="h-4 w-4 text-[#7C4B73] shrink-0" />
                          <span className="font-semibold text-[#381A61] truncate">
                            Recorded (Verified by Human):
                          </span>
                          <span className="font-mono font-bold text-[#381A61] bg-white px-2.5 py-0.5 rounded-md border border-[#7C4B73]/30 shrink-0">
                            {ext?.value || "Not Reported"}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#7C4B73] font-bold shrink-0 ml-2">
                          Saved to Study Dataset ✓
                        </span>
                      </div>
                    )}

                    {/* In-App Variable Coding Guideline / Definition */}
                    {rule?.definition && (
                      <div className="text-xs text-[#381A61]/90 bg-[#7C4B73]/5 p-2.5 rounded-xl border-l-3 border-[#7C4B73] border-y border-r border-[#7C4B73]/15 leading-relaxed flex items-start gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-[#7C4B73] shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-[#381A61]">Coding Guideline: </span>
                          <span>{rule.definition}</span>
                        </div>
                      </div>
                    )}

                    {/* Word-style Track Changes Display */}
                    <div className={`border rounded-xl p-3.5 ${
                      isLowConfidence && !isVerified
                        ? "bg-white border-[#E78429]/30 shadow-2xs"
                        : "bg-[#FAF9F3] border-[#381A61]/10"
                    }`}>
                      {isLowConfidence && !isVerified && (
                        <div className="mb-2.5 text-[11px] font-semibold text-[#E78429] bg-[#E78429]/10 border border-[#E78429]/30 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-[#E78429] shrink-0" />
                          <span>AI model flagged lower extraction certainty ({confPercent}%). Please verify quote vs paper.</span>
                        </div>
                      )}
                      <div className="text-[10px] font-bold text-[#7C4B73] uppercase tracking-wider mb-1 flex items-center justify-between font-mono">
                        <span>Extracted Value & Proposed Change</span>
                        <span className="text-[10px] text-[#88A0DC] font-mono font-bold">Source: Docling v2.4</span>
                      </div>

                      <div className="flex items-center gap-3 text-sm">
                        {isEdited ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="line-through text-[#AB3329] bg-[#ED968C]/20 border border-[#ED968C]/40 px-2 py-0.5 rounded-md font-medium">
                              {ext?.proposed_by || "Original AI Prediction"}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-[#7C4B73]" />
                            <span className="text-[#381A61] bg-[#F9D14A]/35 border border-[#F9D14A] px-2.5 py-0.5 rounded-md font-bold">
                              {ext?.value}
                            </span>
                          </div>
                        ) : (
                          <span className="font-serif font-bold text-base text-[#381A61] bg-white px-3 py-1 rounded-lg border border-[#381A61]/15 shadow-2xs">
                            {ext?.value || "Not Reported (NR)"}
                          </span>
                        )}
                      </div>

                      {/* Supporting Source Evidence Quote */}
                      {ext?.quote && (
                        <div className="mt-2.5 text-xs text-[#381A61] bg-[#F9D14A]/10 p-3 rounded-r-xl border-l-3 border-[#E78429] border-y border-r border-[#E78429]/20 italic flex items-start gap-2 font-serif">
                          <QuoteIcon className="h-3.5 w-3.5 text-[#E78429] shrink-0 mt-0.5" />
                          <span className="flex-1 leading-relaxed">{ext.quote}</span>
                          <span className="text-[10px] font-mono text-[#7C4B73] font-bold shrink-0 ml-1">
                            P.{ext.source_page || 1}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Inline Editing Form if active */}
                    {editingVarId === v.variable_id && (
                      <div className="p-3.5 bg-[#88A0DC]/10 border border-[#88A0DC]/35 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                        <label className="text-xs font-bold text-[#381A61]">
                          Modify Extracted Value:
                        </label>
                        <input
                          type="text"
                          value={editDraftValue}
                          onChange={(e) => setEditDraftValue(e.target.value)}
                          placeholder="Enter revised ground-truth value..."
                          className="w-full text-xs p-2 bg-white border border-[#88A0DC]/50 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#381A61] font-medium"
                          autoFocus
                        />

                        {/* Quick Selection Chips from Codebook */}
                        {rule?.allowed_values && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[10px] font-semibold text-[#6B665E]">Allowed Categories:</span>
                            {rule.allowed_values.map((val: string) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setEditDraftValue(val)}
                                className="text-[10px] font-medium bg-white hover:bg-[#88A0DC]/25 text-[#381A61] border border-[#88A0DC]/40 px-2 py-0.5 rounded-full transition-colors"
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
                            className="px-3 py-1.5 text-xs text-[#6B665E] hover:bg-black/5 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision("modified", editDraftValue)}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-[#381A61] hover:bg-[#4E2487] rounded-xl shadow-xs flex items-center gap-1"
                          >
                            <Check className="h-3.5 w-3.5 text-[#F9D14A]" /> Save & Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Word Track Changes Action Bar (when this variable is selected) */}
                    {isSelected && editingVarId !== v.variable_id && (
                      <div className="pt-2.5 flex items-center justify-between border-t border-[#381A61]/10">
                        <div className="flex items-center gap-2">
                          {/* Accept Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecision("accepted");
                            }}
                            disabled={isTransitioning}
                            className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95 ${
                              isTransitioning
                                ? "bg-[#7C4B73] ring-2 ring-[#7C4B73]/50"
                                : "bg-[#381A61] hover:bg-[#4E2487]"
                            }`}
                            title="Accept AI Extraction (Hotkey: A or Enter)"
                          >
                            <Check className={`h-4 w-4 text-[#F9D14A] ${isTransitioning ? "animate-bounce" : ""}`} />
                            {isTransitioning ? (
                              <span>Accepted!</span>
                            ) : (
                              <>Accept <span className="text-[10px] opacity-75 font-mono text-[#F9D14A]">(A)</span></>
                            )}
                          </button>

                          {/* Modify Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingVarId(v.variable_id);
                              setEditDraftValue(ext?.value || "");
                            }}
                            className="px-3.5 py-2 text-xs font-bold text-[#7C4B73] bg-[#7C4B73]/10 hover:bg-[#7C4B73]/20 border border-[#7C4B73]/30 active:scale-95 rounded-xl flex items-center gap-1.5 transition-all"
                            title="Modify Value (Hotkey: M)"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-[#7C4B73]" /> Modify <span className="text-[10px] opacity-75 font-mono">(M)</span>
                          </button>

                          {/* Reject Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecision("rejected");
                            }}
                            className="px-3.5 py-2 text-xs font-bold text-[#AB3329] bg-[#AB3329]/10 hover:bg-[#AB3329]/20 border border-[#AB3329]/30 active:scale-95 rounded-xl flex items-center gap-1.5 transition-all"
                            title="Reject / Mark Not Reported (Hotkey: R)"
                          >
                            <X className="h-3.5 w-3.5 text-[#AB3329]" /> Reject <span className="text-[10px] opacity-75 font-mono">(R)</span>
                          </button>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            findQuoteInPdf(v.variable_id);
                          }}
                          className="text-xs font-bold text-[#381A61] hover:text-[#381A61] bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 border border-[#88A0DC]/40 flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
                          title="Scroll and flash quote highlight in PDF (Hotkey: F or Q)"
                        >
                          <Eye className="h-3.5 w-3.5 text-[#381A61]" />
                          <span>Find Quote in PDF</span>
                          <kbd className="text-[10px] bg-white border border-[#88A0DC]/60 text-[#381A61] px-1 py-0.2 rounded font-mono font-bold">F</kbd>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Keyboard Shortcut Legend */}
          <div className="bg-[#FAF9F3] border-t border-[#381A61]/10 px-4 py-2.5 shrink-0 flex items-center justify-between text-[11px] text-[#381A61]">
            <span className="font-semibold text-[#381A61] flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-[#E78429]" /> Hotkeys:
            </span>
            <div className="flex items-center gap-3">
              <span><kbd className="px-1.5 py-0.5 bg-[#381A61] text-[#F9D14A] rounded font-mono text-[10px] font-bold">A</kbd> or <kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 rounded font-mono text-[10px]">Enter</kbd> Accept</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-[#7C4B73]/30 text-[#7C4B73] rounded font-mono text-[10px] font-bold">M</kbd> Modify</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#AB3329]/15 border border-[#AB3329]/30 text-[#AB3329] rounded font-mono text-[10px] font-bold">R</kbd> Reject (NR)</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#88A0DC]/30 border border-[#88A0DC]/60 text-[#381A61] rounded font-mono text-[10px] font-bold">F</kbd> / <kbd className="px-1.5 py-0.5 bg-[#88A0DC]/30 border border-[#88A0DC]/60 text-[#381A61] rounded font-mono text-[10px] font-bold">Q</kbd> Find Quote</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#E78429]/20 border border-[#E78429]/40 text-[#E78429] rounded font-mono text-[10px] font-bold">Z</kbd> / <kbd className="px-1.5 py-0.5 bg-[#E78429]/20 border border-[#E78429]/40 text-[#E78429] rounded font-mono text-[10px] font-bold">U</kbd> Undo</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 text-[#381A61] rounded font-mono text-[10px]">↓</kbd> / <kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 text-[#381A61] rounded font-mono text-[10px]">↑</kbd> Navigate</span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
            COLUMN 3: SIDE-BY-SIDE CODEBOOK & ACTIVE LEARNING (RIGHT)
        ══════════════════════════════════════════════════════════ */}
        {showCodebookPanel && (
          <section className="w-[30%] bg-white border-l border-[#381A61]/15 flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="border-b border-[#381A61]/15 bg-[#FAF9F3] px-4 py-3 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#381A61]" />
                <h3 className="font-bold text-[#381A61] text-xs uppercase tracking-wide">
                  Protocol Codebook & Rules
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowCodebookDesigner(true)}
                  className="text-[10px] font-bold text-[#381A61] bg-[#88A0DC]/25 hover:bg-[#88A0DC]/40 border border-[#88A0DC]/50 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                  title="Open In-App Codebook Designer"
                >
                  <Sliders className="h-3 w-3 text-[#381A61]" /> Designer
                </button>
                <button
                  onClick={() => setShowCodebookPanel(false)}
                  className="p-1 hover:bg-[#381A61]/10 rounded text-[#381A61]/70 hover:text-[#381A61] transition-colors"
                  title="Minimize Protocol Rules Panel"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Right Panel Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentRule ? (
                <div className="space-y-4">
                  {/* Active Variable Header */}
                  <div className="p-3 bg-[#FAF9F3] border border-[#381A61]/15 rounded-lg">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#7C4B73]">
                      Selected Field
                    </div>
                    <h4 className="text-sm font-bold text-[#381A61] mt-0.5">
                      {currentRule.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-medium text-[#381A61] bg-white px-2 py-0.5 rounded border border-[#381A61]/15">
                        Section: {currentRule.section}
                      </span>
                      <span className="text-[10px] font-medium text-[#381A61] bg-white px-2 py-0.5 rounded border border-[#381A61]/15">
                        Type: {currentRule.field_type}
                      </span>
                    </div>
                  </div>

                  {/* Operational Definition */}
                  <div>
                    <h5 className="text-xs font-bold text-[#381A61] mb-1 flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7C4B73]" />
                      Operational Definition
                    </h5>
                    <p className="text-xs text-[#381A61]/85 bg-[#FAF9F3] p-2.5 rounded-lg border border-[#381A61]/10 leading-relaxed">
                      {currentRule.definition}
                    </p>
                  </div>

                  {/* Allowed Categories with Click-to-Apply */}
                  {currentRule.allowed_values && currentRule.allowed_values.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-[#381A61] mb-1.5 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-[#7C4B73]" />
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
                            className="text-[11px] font-medium bg-white hover:bg-[#F9D14A]/25 text-[#381A61] border border-[#381A61]/15 hover:border-[#E78429]/50 px-2.5 py-1 rounded-md transition-colors text-left"
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extraction & Coding Rules */}
                  <div>
                    <h5 className="text-xs font-bold text-[#381A61] mb-1.5 flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-[#381A61]" />
                      Coding Rules & Criteria
                    </h5>
                    <ul className="space-y-1.5 text-xs text-[#381A61]/85">
                      {currentRule.rules.map((r: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-1.5 bg-[#FAF9F3] p-2 rounded border border-[#381A61]/10">
                          <span className="text-[#E78429] font-bold">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Gold Standard Literature Example */}
                  {currentRule.gold_standard_example && (
                    <div>
                      <h5 className="text-xs font-bold text-[#381A61] mb-1 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#E78429]" />
                        Gold-Standard Literature Example
                      </h5>
                      <div className="text-xs text-[#381A61] bg-[#F9D14A]/15 border border-[#F9D14A]/40 p-2.5 rounded-lg italic">
                        "{currentRule.gold_standard_example}"
                      </div>
                    </div>
                  )}

                  {/* Exclusion Criteria */}
                  {currentRule.exclusion_criteria && (
                    <div>
                      <h5 className="text-xs font-bold text-[#AB3329] mb-1 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-[#AB3329]" />
                        Exclusion / Disqualification Rule
                      </h5>
                      <p className="text-xs text-[#AB3329] bg-[#ED968C]/15 border border-[#ED968C]/40 p-2 rounded-lg">
                        {currentRule.exclusion_criteria}
                      </p>
                    </div>
                  )}

                  {/* Live Few-Shot Prompt Queue (Dual-Mode Retraining) */}
                  <div className="pt-3 border-t border-[#381A61]/15 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-[#381A61] flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-[#E78429]" />
                        Live Few-Shot Prompt Queue
                      </h5>
                      <span className="text-[10px] font-bold text-[#381A61] bg-[#88A0DC]/25 border border-[#88A0DC]/40 px-2 py-0.5 rounded-full">
                        {fewShotExemplars.length} Injected
                      </span>
                    </div>
                    <p className="text-[11px] text-[#381A61]/70 leading-relaxed">
                      Human modifications are directly injected into system prompts for subsequent extractions and logged for JSONL offline retraining.
                    </p>
                    {fewShotExemplars.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {fewShotExemplars.map((ex, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-[#FAF9F3] border border-[#88A0DC]/30 text-xs">
                            <div className="flex items-center justify-between font-bold text-[#381A61]">
                              <span>{ex.variable}</span>
                              <span className="text-[#381A61] bg-[#F9D14A]/30 border border-[#F9D14A]/60 text-[10px] px-1.5 py-0.5 rounded font-mono">
                                {ex.value}
                              </span>
                            </div>
                            {ex.quote && (
                              <p className="text-[10px] text-[#381A61]/70 italic truncate mt-0.5">
                                "{ex.quote}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#381A61]/50 bg-[#FAF9F3] p-2.5 rounded-lg border border-dashed border-[#381A61]/20 text-center">
                        Modifying or rejecting variables dynamically adds active learning exemplars here.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-[#381A61]/50 text-xs">
                  Select a variable to inspect its codebook operational rules.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ACTIVE LEARNING & ERROR ANALYSIS MODAL DRAWER
      ══════════════════════════════════════════════════════════ */}
      {showErrorAnalysis && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#381A61] text-white px-6 py-4 flex items-center justify-between border-b border-[#F9D14A]/30">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#F9D14A]" />
                <div>
                  <h3 className="font-bold text-base text-[#FAF9F3]">
                    Active Learning & Error Discrepancy Analysis
                  </h3>
                  <p className="text-xs text-[#88A0DC]">
                    Continuous evaluation & automatic fine-tuning training dataset generation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowErrorAnalysis(false)}
                className="text-[#88A0DC] hover:text-white p-1 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FAF9F3]">
              {/* Metrics Summary Grid */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-white border border-[#381A61]/15 p-3 rounded-xl shadow-2xs">
                  <div className="text-xl font-black text-[#381A61]">
                    {errorAnalysis?.total_decisions || 18}
                  </div>
                  <div className="text-[11px] font-semibold text-[#381A61]/70 uppercase mt-0.5">
                    Reviews Done
                  </div>
                </div>

                <div className="bg-[#7C4B73]/10 border border-[#7C4B73]/30 p-3 rounded-xl shadow-2xs">
                  <div className="text-xl font-black text-[#7C4B73]">
                    {errorAnalysis?.accuracy_rate || 77.8}%
                  </div>
                  <div className="text-[11px] font-semibold text-[#7C4B73] uppercase mt-0.5">
                    AI Accuracy
                  </div>
                </div>

                <div className="bg-[#ED968C]/20 border border-[#ED968C]/50 p-3 rounded-xl shadow-2xs">
                  <div className="text-xl font-black text-[#AB3329]">
                    {errorAnalysis?.total_discrepancies || 4}
                  </div>
                  <div className="text-[11px] font-semibold text-[#AB3329] uppercase mt-0.5">
                    Discrepancies
                  </div>
                </div>

                <div className="bg-[#88A0DC]/20 border border-[#88A0DC]/40 p-3 rounded-xl shadow-2xs">
                  <div className="text-xl font-black text-[#381A61]">
                    {errorAnalysis?.category_breakdown?.NORMALIZATION || 2}
                  </div>
                  <div className="text-[11px] font-semibold text-[#381A61] uppercase mt-0.5">
                    Format Errors
                  </div>
                </div>
              </div>

              {/* Error Categories Breakdown */}
              <div>
                <h4 className="font-bold text-[#381A61] text-xs uppercase tracking-wide mb-2">
                  Error Modalities Distribution
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white border border-[#381A61]/15 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-[#381A61]">Normalization (Units/Format)</span>
                    <span className="font-bold text-[#381A61] font-mono">
                      {errorAnalysis?.category_breakdown?.NORMALIZATION || 2}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white border border-[#381A61]/15 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-[#381A61]">Missed Context (Overlooked)</span>
                    <span className="font-bold text-[#381A61] font-mono">
                      {errorAnalysis?.category_breakdown?.MISSED_CONTEXT || 1}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white border border-[#381A61]/15 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-[#381A61]">Numeric Mismatch</span>
                    <span className="font-bold text-[#381A61] font-mono">
                      {errorAnalysis?.category_breakdown?.NUMERIC_MISMATCH || 1}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white border border-[#381A61]/15 rounded-lg flex items-center justify-between">
                    <span className="font-medium text-[#381A61]">False Extraction (Hallucination)</span>
                    <span className="font-bold text-[#381A61] font-mono">
                      {errorAnalysis?.category_breakdown?.FALSE_EXTRACTION || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Suggested Prompt Tuning Adjustments */}
              <div>
                <h4 className="font-bold text-[#381A61] text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#E78429]" />
                  Auto-Generated Prompt Engineering Corrections
                </h4>
                <div className="space-y-1.5 text-xs text-[#381A61]">
                  {(errorAnalysis?.suggested_prompt_rules || []).map((rule: string, idx: number) => (
                    <div key={idx} className="p-2.5 bg-[#F9D14A]/15 border border-[#F9D14A]/40 rounded-lg flex items-start gap-2">
                      <span className="text-[#E78429] font-bold">•</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer with JSONL Export */}
            <div className="bg-[#FAF9F3] border-t border-[#381A61]/15 px-6 py-3.5 flex items-center justify-between">
              <span className="text-xs text-[#381A61]/70">
                Ready for fine-tuning via Antigravity Cloud or local Ollama/vLLM.
              </span>
              <button
                onClick={handleExportTrainingData}
                className="px-4 py-2 text-xs font-bold text-white bg-[#381A61] hover:bg-[#381A61]/90 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors border border-[#F9D14A]/30"
              >
                <Download className="h-4 w-4 text-[#F9D14A]" /> Export Training Dataset (JSONL)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          IN-APP CODEBOOK DESIGNER MODAL
      ══════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════
          AIDE-WEB STYLE RECORDED ANSWERS DATA SHEET MODAL
      ══════════════════════════════════════════════════════════ */}
      {showDataSheetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#381A61] text-white px-6 py-4 flex items-center justify-between border-b border-[#F9D14A]/30">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-[#F9D14A]" />
                <div>
                  <h3 className="font-bold text-base text-[#FAF9F3]">
                    Study Recorded Extraction Data Sheet
                  </h3>
                  <p className="text-xs text-[#88A0DC]">
                    AIDE-Web Matrix View &middot; {verifiedCount}/{variableList.length} Variables Human-Verified
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDataSheetModal(false)}
                className="text-[#88A0DC] hover:text-white p-1 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#FAF9F3]">
              <div className="border border-[#381A61]/15 rounded-xl overflow-hidden shadow-2xs bg-white">
                <table className="min-w-full divide-y divide-[#381A61]/10 text-xs">
                  <thead className="bg-[#FAF9F3] font-bold text-[#381A61]">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Variable</th>
                      <th className="px-3 py-2.5 text-left">Section</th>
                      <th className="px-3 py-2.5 text-left">Extracted / Verified Value</th>
                      <th className="px-3 py-2.5 text-left">Verification Status</th>
                      <th className="px-3 py-2.5 text-left">Evidence Source Quote</th>
                      <th className="px-3 py-2.5 text-left">Page</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#381A61]/10 bg-white">
                    {variableList.map((v: any, idx: number) => {
                      const ext = extractionMap[v.variable_id];
                      const isVerified = ext?.is_verified;
                      const isEdited = ext?.is_edited;
                      return (
                        <tr key={v.variable_id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FAF9F3]/50"}>
                          <td className="px-3 py-2.5 font-bold text-[#381A61] whitespace-nowrap">
                            #{idx + 1} {v.name}
                          </td>
                          <td className="px-3 py-2.5 text-[#381A61]/70 whitespace-nowrap">
                            {v.section || "General"}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-[#381A61]">
                            {ext?.value || <span className="text-[#381A61]/40 italic">Not Reported</span>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {isVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7C4B73] bg-[#7C4B73]/15 border border-[#7C4B73]/30 px-2 py-0.5 rounded-full">
                                <Check className="h-3 w-3" /> {isEdited ? "Modified" : "Accepted"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E78429] bg-[#E78429]/15 border border-[#E78429]/30 px-2 py-0.5 rounded-full">
                                <AlertCircle className="h-3 w-3" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[#381A61]/80 italic max-w-xs truncate" title={ext?.quote}>
                            {ext?.quote || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[#381A61]/60 font-mono">
                            {ext?.source_page || 1}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-[#FAF9F3] border-t border-[#381A61]/15 px-6 py-3.5 flex items-center justify-between">
              <span className="text-xs text-[#381A61]/70">
                Exports all recorded variables with verified status and ground-truth citations.
              </span>
              <div className="flex items-center gap-2">
                <Link
                  to={`/projects/${projectId}/extraction-sheet?study=${selectedPaperId}`}
                  className="px-3.5 py-2 text-xs font-bold text-[#381A61] bg-[#88A0DC]/25 hover:bg-[#88A0DC]/40 border border-[#88A0DC]/50 rounded-lg flex items-center gap-1.5 transition-colors"
                  onClick={() => setShowDataSheetModal(false)}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#381A61]" />
                  <span>Open Full-Page Sheet</span>
                </Link>
                <button
                  onClick={handleExportStudyCsv}
                  className="px-3.5 py-2 text-xs font-bold text-[#381A61] bg-[#F9D14A] hover:bg-[#F9D14A]/90 border border-[#E78429]/40 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-4 w-4 text-[#381A61]" /> Export CSV (AIDE Data Sheet)
                </button>
                <button
                  onClick={() => setShowDataSheetModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#381A61] bg-white border border-[#381A61]/20 hover:bg-[#FAF9F3] rounded-lg"
                >
                  Close
                </button>
              </div>
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
