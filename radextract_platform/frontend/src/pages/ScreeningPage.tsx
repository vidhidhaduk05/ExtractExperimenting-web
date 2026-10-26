import { resolveScreeningStage } from "../lib/screeningStage";
import { BookmarkButton } from "../components/common/BookmarkButton";
import { useBookmarks } from "../lib/bookmarks";
import { matchesTag, useProjectTags } from "../lib/recordCollaboration";
import { RecordCollaborationPanel, TagBadges, TagFilter } from "../components/common/RecordCollaboration";
import { useState, useRef, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import {
  api,
  type Study,
  type AIScreeningProgress,
  type ScreeningSummary,
  type AIScreeningSummary,
  type AbstractHighlights,
  type HighlightSpan,
  type ScreeningKeyword,
  type ClarificationQuestion,
  type ClarificationOption,
  type ClarificationAnswerResponse,
  type BatchUploadResult,
} from "../lib/api";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  ShieldCheck,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  AlertTriangle,
  Upload,
  FileText,
  Bot,
  Check,
  ExternalLink,
  HelpCircle,
  MessageSquare,
  Send,
  X,
  Tag,
  Plus,
  Trash2,
  Play,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Layers,
  FileUp,
  FileCheck,
  AlertCircle,
  BookOpen,
  Minimize2,
  Maximize2,
  Keyboard,
  FolderPlus,
  ArrowLeftRight,
  RotateCcw,
  Pause,
  Square,
  ListChecks,
  CheckSquare,
  CheckCircle2,
  ChevronDown,
  Sliders,
} from "lucide-react";
import { cn } from "../lib/utils";
import { UniversalBulkUploadModal } from "../components/common/UniversalBulkUploadModal";
import { ExploratoryScreeningView } from "../components/screening/ExploratoryScreeningView";

export function ScreeningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [viewMode, setViewMode] = useState<"standard" | "exploratory">("standard");
  const bookmarks = useBookmarks(projectId);
  const tagIndex = useProjectTags(projectId);
  const [tagFilter, setTagFilter] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout & Selection state
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Protocol Screening Rules & PICO Criteria Right-Side Slider State
  const [isProtocolSliderOpen, setIsProtocolSliderOpen] = useState(false);
  const [activeBumpKey, setActiveBumpKey] = useState<string | null>(null);

  const handleBundleClick = (bundleKey: string) => {
    setActiveBumpKey(bundleKey);
    setTimeout(() => setActiveBumpKey(null), 350);
    if (statusFilter === bundleKey) {
      setStatusFilter("all");
    } else {
      setStatusFilter(bundleKey);
      if (bundleKey === "awaiting_clarification") {
        setIsChecklistExpanded(true);
      }
    }
  };

  // Project-level clarification questions for checklist
  const { data: projectClarifications = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["project-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId).catch(() => []) : Promise.resolve([])),
    enabled: !!projectId,
  });

  const [isChecklistExpanded, setIsChecklistExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.location.hash.includes("clarifications");
    }
    return false;
  });
  const [checklistFilter, setChecklistFilter] = useState<"all" | "pending" | "answered">("pending");
  const [expandedChecklistQuestionId, setExpandedChecklistQuestionId] = useState<string | null>(null);
  const [checklistSelectedOption, setChecklistSelectedOption] = useState<Record<string, string>>({});
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("clarifications")) {
      setIsChecklistExpanded(true);
      const el = document.getElementById("clarifications-checklist");
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 200);
      }
    }
  }, []);

  const pendingClarifications = useMemo(() => {
    return projectClarifications.filter((q) => q.status === "pending");
  }, [projectClarifications]);

  const answeredClarifications = useMemo(() => {
    return projectClarifications.filter((q) => q.status === "answered");
  }, [projectClarifications]);

  const filteredChecklistQuestions = useMemo(() => {
    if (checklistFilter === "pending") return pendingClarifications;
    if (checklistFilter === "answered") return answeredClarifications;
    return projectClarifications;
  }, [projectClarifications, pendingClarifications, answeredClarifications, checklistFilter]);

  // Reviewer identity
  const authToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const { data: currentReviewer, error: reviewerError } = useQuery({
    queryKey: ["screening-reviewer", authToken],
    queryFn: api.getCurrentUser,
    enabled: !!authToken,
    retry: false,
  });
  const reviewerName = currentReviewer?.username || "";

  // Highlight toggles & Keywords drawer state
  const [showHighlights, setShowHighlights] = useState(true);
  const [showKeywordsDrawer, setShowKeywordsDrawer] = useState(false);
  const [newKeywordText, setNewKeywordText] = useState("");
  const [newKeywordType, setNewKeywordType] = useState<"include" | "exclude">("include");

  // Clarification active answering state
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [freetextAnswer, setFreetextAnswer] = useState<string>("");
  const [resolutionFeedback, setResolutionFeedback] = useState<Record<string, ClarificationAnswerResponse>>({});

  // Exclude reason code for selected study
  const [excludeReasonCode, setExcludeReasonCode] = useState<string>("");
  const [excludeReasonText, setExcludeReasonText] = useState<string>("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonSelectRef = useRef<HTMLSelectElement>(null);

  // Save failure recovery state (Task 30)
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedDecision, setFailedDecision] = useState<{
    studyId: string;
    stage: "ta" | "ft";
    decision: "included" | "excluded" | "maybe";
    reasonCode?: string;
    reasonText?: string;
  } | null>(null);

  // PDF upload for selected study
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Bulk Upload & Hotkeys state
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [hotkeysEnabled, setHotkeysEnabled] = useState(true);


  // While an AI screening run is in flight, poll so each screened study appears as soon as it is saved
  const isMutating = useIsMutating() > 0;

  // Live progress (which study is being screened now). Fetched on load so a run started earlier,
  // or before a page refresh, is picked up too; polls quickly only while something is running.
  const { data: progress } = useQuery<AIScreeningProgress>({
    queryKey: ["screening-progress", projectId],
    queryFn: () => api.getAIScreeningProgress(projectId!),
    enabled: !!projectId,
    refetchInterval: (q) => (isMutating || q.state.data?.active ? 1500 : false),
  });
  const isRunning = isMutating || !!progress?.active;
  const queuedIds = useMemo(() => new Set(progress?.active ? progress.pending_ids : []), [progress]);
  const doneIds = useMemo(() => new Set(progress?.active ? progress.done_ids : []), [progress]);

  // Queries
  const { data: studies = [], isLoading: isLoadingStudies } = useQuery({
    queryKey: ["screening-studies", projectId, stageFilter, statusFilter],
    queryFn: () => api.listScreening(projectId!, stageFilter === "all" ? undefined : stageFilter, statusFilter === "all" ? undefined : statusFilter),
    enabled: !!projectId,
    refetchInterval: isRunning ? 3000 : false,
  });

  const { data: summary } = useQuery<ScreeningSummary>({
    queryKey: ["screening-summary", projectId],
    queryFn: () => api.screeningSummary(projectId!),
    enabled: !!projectId,
    refetchInterval: isRunning ? 3000 : false,
  });

  const { data: exclusionReasonsData } = useQuery({
    queryKey: ["exclusion-reasons", projectId],
    queryFn: () => api.getExclusionReasons(projectId!),
    enabled: !!projectId,
  });
  const exclusionReasons = exclusionReasonsData?.reasons || [];

  const { data: keywords = [] } = useQuery<ScreeningKeyword[]>({
    queryKey: ["screening-keywords", projectId],
    queryFn: () => api.listScreeningKeywords(projectId!),
    enabled: !!projectId,
  });

  const { data: selectedHighlights } = useQuery<AbstractHighlights>({
    queryKey: ["abstract-highlights", selectedStudyId],
    queryFn: () => api.getAbstractHighlights(selectedStudyId!),
    enabled: !!selectedStudyId && showHighlights,
  });

  const { data: studyClarifications = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["study-clarifications", selectedStudyId],
    queryFn: () => api.getStudyClarifications(selectedStudyId!),
    enabled: !!selectedStudyId,
  });

  const { data: robSummary } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.robSummary(projectId!),
    enabled: !!projectId,
  });

  const { data: robRunProgress } = useQuery({
    queryKey: ["rob-run-progress", projectId],
    queryFn: () => (projectId ? api.getRobRunProgress(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const startBatchRobMutation = useMutation({
    mutationFn: () => api.startRobRun(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-run-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
    onError: (err: any) => {
      alert(`Failed to start batch RoB: ${err.message}`);
    },
  });

  const [robStarting, setRobStarting] = useState<Record<string, boolean>>({});
  const [extractionMsg, setExtractionMsg] = useState<Record<string, string>>({});
  const [extractingStudyId, setExtractingStudyId] = useState<string | null>(null);

  // Map study_id -> existing RoB assessment (for Start RoB / View RoB rendering)
  const robByStudy = new Map(
    (robSummary?.assessments || []).map((a: any) => [a.study_id, a])
  );

  const handleStartRob = async (study: Study) => {
    setRobStarting((prev) => ({ ...prev, [study.study_id]: true }));
    try {
      const assessment = await api.autoCreateAssessment(
        study.study_id, projectId!, study.study_design || ""
      );
      await api.aiPrefill(assessment.assessment_id, study.abstract || "");
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    } catch (err: any) {
      alert(`RoB start failed: ${err.message}`);
    } finally {
      setRobStarting((prev) => ({ ...prev, [study.study_id]: false }));
    }
  };

  const handleRobAllIncluded = async () => {
    if (projectId) {
      startBatchRobMutation.mutate();
    }
  };

  const handleCodedExtract = async (study: Study) => {
    setExtractingStudyId(study.study_id);
    setExtractionMsg((prev) => ({ ...prev, [study.study_id]: "" }));
    try {
      const res = await api.codedExtract(study.study_id, projectId!);
      const missing = (res.minus_99?.length || 0) + (res.minus_77?.length || 0) + (res.minus_88?.length || 0);
      setExtractionMsg((prev) => ({
        ...prev,
        [study.study_id]: `Extracted ${res.extracted || 0} variables` +
          (res.coded_ds ? ` (${res.coded_ds} direct` +
            (res.coded_calc ? `, ${res.coded_calc} calculated` : "") +
            (res.coded_inf ? `, ${res.coded_inf} inferred` : "") + ")" : "") +
          (missing ? `, ${missing} coded missing` : "")
      }));
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
      queryClient.invalidateQueries({ queryKey: ["review-progress", projectId] });
    } catch (err: any) {
      setExtractionMsg((prev) => ({
        ...prev,
        [study.study_id]: `Error: ${err.message}`
      }));
    } finally {
      setExtractingStudyId(null);
    }
  };

  const studyList = Array.isArray(studies) ? studies : [];

  // Filtered Studies List with Instant Bundle Filtering
  const filteredStudies = useMemo(() => {
    return studyList.filter((s) => {
      if (savedOnly && !bookmarks.ids.includes(s.study_id)) return false;
      if (!matchesTag(tagIndex.data, s.study_id, tagFilter)) return false;

      // Stage filter
      if (stageFilter !== "all") {
        if (stageFilter === "ta" && s.screening_stage !== "ta" && s.screening_status !== "ta_included") {
          return false;
        }
        if (stageFilter === "ft" && s.screening_stage !== "ft" && s.screening_status !== "included") {
          return false;
        }
      }

      // Status & Interactive Bundle filter
      if (statusFilter !== "all") {
        if (statusFilter === "ta_included") {
          const isTaInc = s.screening_status === "ta_included" ||
            (s.screening_status === "included" && s.screening_stage === "ta") ||
            s.ai_decision === "include";
          if (!isTaInc) return false;
        } else if (statusFilter === "included") {
          const isFtInc = s.screening_status === "included" && s.screening_stage !== "ta";
          if (!isFtInc && s.screening_status !== "included") return false;
        } else if (statusFilter === "excluded") {
          const isExc = s.screening_status === "excluded" || s.ai_decision === "exclude";
          if (!isExc) return false;
        } else if (statusFilter === "uncertain") {
          const isUnc = s.screening_status === "uncertain" || s.screening_status === "pending" || s.ai_decision === "maybe";
          if (!isUnc) return false;
        } else if (statusFilter === "awaiting_clarification") {
          const isClar = s.screening_status === "awaiting_clarification" || (s as any).clarification_needed;
          if (!isClar) return false;
        } else if (statusFilter === "awaiting_pdf") {
          const isPdf = s.screening_status === "awaiting_pdf" || (!s.pdf_path && s.screening_status === "included");
          if (!isPdf) return false;
        } else if (statusFilter === "pending") {
          if (s.screening_status !== "pending") return false;
        } else {
          if (s.screening_status !== statusFilter) return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (s.title || "").toLowerCase().includes(q);
        const matchesAuthors = (s.authors || "").toLowerCase().includes(q);
        const matchesAbstract = (s.abstract || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthors && !matchesAbstract) return false;
      }
      // Confidence filter
      if (confidenceFilter !== "all") {
        const conf = s.ai_confidence ?? 0;
        if (confidenceFilter === "high" && conf < 0.8) return false;
        if (confidenceFilter === "medium" && (conf < 0.6 || conf >= 0.8)) return false;
        if (confidenceFilter === "low" && (conf <= 0 || conf >= 0.6)) return false;
      }
      return true;
    });
  }, [studyList, stageFilter, statusFilter, searchQuery, confidenceFilter, savedOnly, bookmarks.ids, tagIndex.data, tagFilter]);

  // Auto-select first study in filtered set if current selectedStudyId is filtered out
  useEffect(() => {
    if (filteredStudies.length > 0) {
      const isVisible = filteredStudies.some((s) => s.study_id === selectedStudyId);
      if (!isVisible) {
        setSelectedStudyId(filteredStudies[0].study_id);
      }
    }
  }, [statusFilter, stageFilter, filteredStudies, selectedStudyId]);

  // Selection and keyboard actions use the same visible record set as all filters.
  const selectedStudy = filteredStudies.find(s => s.study_id === selectedStudyId) || filteredStudies[0] || (failedDecision ? studyList.find(s => s.study_id === failedDecision.studyId) : null) || null;
  const prevActiveStudyIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selectedStudy?.study_id || null;
    if (prevActiveStudyIdRef.current && currentId && prevActiveStudyIdRef.current !== currentId) {
      setReasonError(null);
      setSaveError(null);
      setFailedDecision(null);
    }
    prevActiveStudyIdRef.current = currentId;
  }, [selectedStudy?.study_id]);

  // Mutations
  const startFullPipelineMutation = useMutation({
    mutationFn: () => api.startAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

  const startAnalysisMutation = useMutation({
    mutationFn: () => api.startAIAnalysis(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

  const continuePipelineMutation = useMutation({
    mutationFn: (stage: "abstract" | "fulltext") => api.continueAIScreening(projectId!, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.resumeAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

  type DecisionPayload = {
    studyId: string;
    stage: "ta" | "ft";
    decision: "included" | "excluded" | "maybe";
    reasonCode?: string;
    reasonText?: string;
  };

  const decisionMutation = useMutation({
    mutationFn: (data: DecisionPayload) =>
      api.screeningDecision(data.studyId, {
        project_id: projectId!,
        decision: data.decision,
        stage: data.stage,
        reason_code: data.reasonCode,
        reason_text: data.reasonText,
      }),
    onSuccess: (_, variables) => {
      // Clear errors on confirmed server save
      setSaveError(null);
      setFailedDecision(null);
      setReasonError(null);

      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      if (variables.decision === "included") {
        queryClient.invalidateQueries({ queryKey: ["extraction-grid", projectId] });
        queryClient.invalidateQueries({ queryKey: ["extractions", variables.studyId] });
        queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      }

      // Clear the reason selector for the next record ONLY after successful save
      if (variables.decision === "excluded") {
        setExcludeReasonCode("");
        setExcludeReasonText("");
      }

      // Advance to next study in filtered list ONLY after the server confirms a successful save
      const currentIndex = filteredStudies.findIndex((s) => s.study_id === variables.studyId);
      if (currentIndex >= 0 && currentIndex < filteredStudies.length - 1) {
        setSelectedStudyId(filteredStudies[currentIndex + 1].study_id);
      }
    },
    onError: (err: any, variables) => {
      const errMsg = err?.message || "Failed to save screening decision due to a server or network error.";
      setSaveError(errMsg);
      setFailedDecision(variables);
    },
  });

  // Retry the same decision without creating duplicate entries
  const handleRetry = () => {
    if (!failedDecision || decisionMutation.isPending) return;
    setSaveError(null);
    decisionMutation.mutate(failedDecision);
  };

  // Screening decision handler (auto-advances to next study ONLY on server confirmation)
  const handleScreenDecision = (decision: "included" | "excluded" | "maybe", targetStudyId?: string) => {
    // Prevent duplicate submissions while a save is in flight
    if (decisionMutation.isPending) return;

    if (!currentReviewer) {
      setSaveError("Sign in with a valid account to save screening decisions.");
      return;
    }

    const currentStudyId = targetStudyId || selectedStudy?.study_id;
    if (!currentStudyId) return;
    const targetStudy = studyList.find(study => study.study_id === currentStudyId);
    if (!targetStudy) {
      setSaveError("Record could not be found. Refresh before saving.");
      return;
    }
    let stage: "ta" | "ft";
    try { stage = resolveScreeningStage(targetStudy); }
    catch (error) {
      setSaveError(error instanceof Error ? error.message : "Screening stage could not be determined.");
      return;
    }


    if (decision === "excluded") {
      // Must have a valid exclusion reason selected (Task 27)
      if (!excludeReasonCode || !excludeReasonCode.trim()) {
        if (targetStudyId && selectedStudy?.study_id !== targetStudyId) {
          setSelectedStudyId(targetStudyId);
        }
        setReasonError("Please select a valid exclusion reason before excluding this record.");
        reasonSelectRef.current?.focus();
        return;
      }

      setReasonError(null);
      setSaveError(null);
      setFailedDecision(null);

      // Find label for reasonCode if custom rationale text is not provided
      const selectedReasonObj = exclusionReasons.find(
        (r: any) => (r.code || r.reason_id) === excludeReasonCode
      );
      const reasonLabel = selectedReasonObj ? (selectedReasonObj.label || selectedReasonObj.code) : excludeReasonCode;

      decisionMutation.mutate({
        studyId: currentStudyId,
        stage,
        decision: "excluded",
        reasonCode: excludeReasonCode,
        reasonText: excludeReasonText.trim() || reasonLabel || "Ineligible based on criteria",
      });
      return;
    }

    // Include and Maybe: clear any reason error & save error, and mutate
    setReasonError(null);
    setSaveError(null);
    setFailedDecision(null);

    if (decision === "included") {
      decisionMutation.mutate({
        studyId: currentStudyId,
        stage,
        decision: "included",
        reasonText: "Eligible under PICO criteria",
      });
    } else if (decision === "maybe") {
      decisionMutation.mutate({
        studyId: currentStudyId,
        stage,
        decision: "maybe",
        reasonText: "Uncertain - requires further assessment",
      });
    }
  };

  const handleSelectPreviousStudy = () => {
    if (!selectedStudy || filteredStudies.length === 0) return;
    const currentIndex = filteredStudies.findIndex((s) => s.study_id === selectedStudy.study_id);
    if (currentIndex > 0) {
      setSelectedStudyId(filteredStudies[currentIndex - 1].study_id);
    }
  };

  const handleSelectNextStudy = () => {
    if (!selectedStudy || filteredStudies.length === 0) return;
    const currentIndex = filteredStudies.findIndex((s) => s.study_id === selectedStudy.study_id);
    if (currentIndex < filteredStudies.length - 1) {
      setSelectedStudyId(filteredStudies[currentIndex + 1].study_id);
    }
  };

  // Keyboard hotkeys listener: I/1 (Include), E/2 (Exclude), M/3 (Maybe), ←/J (Prev), →/K (Next), ? (Cheatsheet)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][data-record-collaboration]')) return;
      if (!hotkeysEnabled) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (showKeywordsDrawer || showBulkUploadModal || showHotkeysModal) {
        if (e.key === "Escape") {
          setShowBulkUploadModal(false);
          setShowHotkeysModal(false);
          setShowKeywordsDrawer(false);
        }
        return;
      }

      if (decisionMutation.isPending || !currentReviewer) return;

      if (e.key === "i" || e.key === "I" || e.key === "1") {
        e.preventDefault();
        handleScreenDecision("included");
      } else if (e.key === "e" || e.key === "E" || e.key === "2") {
        e.preventDefault();
        handleScreenDecision("excluded");
      } else if (e.key === "m" || e.key === "M" || e.key === "3" || e.key === "u" || e.key === "U") {
        e.preventDefault();
        handleScreenDecision("maybe");
      } else if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        handleSelectPreviousStudy();
      } else if (e.key === "ArrowRight" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        handleSelectNextStudy();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHotkeysModal(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hotkeysEnabled,
    currentReviewer,
    selectedStudy,
    filteredStudies,
    excludeReasonCode,
    excludeReasonText,
    showKeywordsDrawer,
    showBulkUploadModal,
    showHotkeysModal,
  ]);

  const addKeywordMutation = useMutation({
    mutationFn: (data: { keyword: string; type: "include" | "exclude" }) =>
      api.addScreeningKeyword(projectId!, data.keyword, data.type),
    onSuccess: () => {
      setNewKeywordText("");
      queryClient.invalidateQueries({ queryKey: ["screening-keywords", projectId] });
      queryClient.invalidateQueries({ queryKey: ["abstract-highlights"] });
    },
  });

  const deleteKeywordMutation = useMutation({
    mutationFn: (keywordId: string) => api.deleteScreeningKeyword(keywordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-keywords", projectId] });
      queryClient.invalidateQueries({ queryKey: ["abstract-highlights"] });
    },
  });

  const autoGenerateKeywordsMutation = useMutation({
    mutationFn: () => api.autoGenerateKeywords(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-keywords", projectId] });
      queryClient.invalidateQueries({ queryKey: ["abstract-highlights"] });
    },
  });

  const answerClarificationMutation = useMutation({
    mutationFn: (data: { questionId: string; answer: string; label?: string; freetext?: string }) =>
      api.answerClarification(data.questionId, {
        answer: data.answer,
        answer_label: data.label,
        answer_freetext: data.freetext,
        answered_by: reviewerName,
      }),
    onSuccess: (res, vars) => {
      setResolutionFeedback((prev) => ({ ...prev, [vars.questionId]: res }));
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["study-clarifications", selectedStudyId] });
      queryClient.invalidateQueries({ queryKey: ["pending-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["all-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
  });

  // Render Highlighted Text (Abstract or Title) with Priority Resolution & Instant Fallback
  const renderHighlightedText = (
    rawText: string,
    spans: HighlightSpan[] = [],
    fallbackKeywordsList: ScreeningKeyword[] = [],
    isTitle: boolean = false
  ) => {
    if (!rawText) {
      return isTitle ? null : <p className="text-gray-400 italic">No abstract available for this study.</p>;
    }
    if (!showHighlights) {
      return isTitle ? (
        <span className="text-slate-900">{rawText}</span>
      ) : (
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{rawText}</p>
      );
    }

    // Combine backend spans with dynamic client-side matching from active keywords if spans are empty
    const activeSpans = [...spans];
    if (activeSpans.length === 0 && fallbackKeywordsList.length > 0) {
      fallbackKeywordsList.forEach((kw) => {
        const word = kw.keyword.trim();
        if (!word) return;
        try {
          const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escaped}\\b`, "gi");
          let match;
          while ((match = regex.exec(rawText)) !== null) {
            activeSpans.push({
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
              type: kw.keyword_type === "include" ? "include_keyword" : "exclude_keyword",
              color: kw.keyword_type === "include" ? "green" : "red",
              confidence: 1.0,
              label: `${kw.keyword_type === "include" ? "Include" : "Exclude"} keyword: ${kw.keyword}`,
            });
          }
        } catch {
          // ignore regex errors for special chars
        }
      });
    }

    if (activeSpans.length === 0) {
      return isTitle ? (
        <span className="text-slate-900">{rawText}</span>
      ) : (
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{rawText}</p>
      );
    }

    // Resolve character-level priority so keywords (green/red) are never swallowed by broad sentence spans
    const priorityMap: Record<string, number> = {
      exclude_keyword: 40,
      include_keyword: 30,
      ai_keyword: 20,
      population: 10,
      intervention: 10,
      comparator: 10,
      outcome: 10,
    };

    const charSpans: (HighlightSpan | null)[] = new Array(rawText.length).fill(null);
    for (const span of activeSpans) {
      const start = Math.max(0, span.start);
      const end = Math.min(rawText.length, span.end);
      if (end <= start) continue;
      const prio = priorityMap[span.type] || 0;
      for (let i = start; i < end; i++) {
        const curr = charSpans[i];
        if (!curr || (priorityMap[curr.type] || 0) < prio) {
          charSpans[i] = span;
        }
      }
    }

    const segments: { start: number; end: number; span: HighlightSpan | null }[] = [];
    let currentSpan = charSpans[0];
    let currentStart = 0;
    for (let i = 1; i < rawText.length; i++) {
      if (charSpans[i] !== currentSpan) {
        segments.push({ start: currentStart, end: i, span: currentSpan });
        currentSpan = charSpans[i];
        currentStart = i;
      }
    }
    segments.push({ start: currentStart, end: rawText.length, span: currentSpan });

    const elements: React.ReactNode[] = segments.map((seg, idx) => {
      const segText = rawText.substring(seg.start, seg.end);
      if (!seg.span) {
        return <span key={`plain-${seg.start}-${idx}`}>{segText}</span>;
      }
      const s = seg.span;
      let colorClass = "bg-yellow-100 text-yellow-900 border-yellow-300";
      if (s.color === "green" || s.type === "include_keyword") {
        colorClass = "bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold";
      } else if (s.color === "red" || s.type === "exclude_keyword") {
        colorClass = "bg-rose-100 text-rose-900 border-rose-300 font-semibold";
      } else if (s.color === "purple" || s.type === "population") {
        colorClass = "bg-purple-100 text-purple-900 border-purple-300";
      } else if (s.color === "blue" || s.type === "intervention" || s.type === "comparator") {
        colorClass = "bg-sky-100 text-sky-900 border-sky-300";
      } else if (s.color === "orange" || s.type === "outcome") {
        colorClass = "bg-amber-100 text-amber-900 border-amber-300";
      }

      return (
        <mark
          key={`mark-${seg.start}-${idx}`}
          className={`px-1 py-0.5 rounded border ${isTitle ? "text-base inline" : "text-sm inline"} transition-colors ${colorClass}`}
          title={`${s.label || s.type} (${s.type})`}
        >
          {segText}
        </mark>
      );
    });

    if (isTitle) {
      return <span className="leading-tight">{elements}</span>;
    }
    return <div className="text-gray-800 leading-relaxed text-sm whitespace-pre-wrap">{elements}</div>;
  };

  // Upload single PDF handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudy) return;
    setUploadingPdf(true);
    setUploadError(null);
    try {
      await api.uploadPdf(selectedStudy.study_id, file);
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload PDF");
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (viewMode === "exploratory") {
    return (
      <ExploratoryScreeningView
        projectId={projectId}
        projectStudies={studies}
        summary={summary}
        exclusionReasons={exclusionReasons}
        onScreenStudy={(payload) => decisionMutation.mutateAsync(payload)}
        isDecisionPending={decisionMutation.isPending}
        onSwitchToStandard={() => setViewMode("standard")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}`}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to Project"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                Co-Scientist Screening Workspace
              </h1>
              <p className="text-xs text-slate-500">
                Multi-Stage Screening: Title &rarr; Abstract &rarr; Full-Text with Rayyan-Style Highlighting
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk Upload from Laptop Button */}
            <button
              onClick={() => setShowBulkUploadModal(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
              title="Bulk upload study PDFs, spreadsheets, or citations directly from your laptop"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-300" />
              <span>Bulk Upload from Laptop</span>
            </button>

            {/* Hotkeys Cheatsheet Button */}
            <button
              onClick={() => setShowHotkeysModal(true)}
              className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1.5 shadow-sm transition-all"
              title="Keyboard Shortcuts: [I/1] Include, [E/2] Exclude, [M/3] Maybe, [←/J] Prev, [→/K] Next"
            >
              <Keyboard className="w-3.5 h-3.5 text-indigo-600" />
              <span>Hotkeys</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-indigo-200/70 text-indigo-900 rounded font-bold">?</kbd>
            </button>

            {/* View Switcher: Exploratory Velvet + Senior Mode */}
            <button
              onClick={() => setViewMode("exploratory")}
              className="px-3.5 py-2 text-xs font-bold text-[#2E1231] bg-[#FAF7F2] border-2 border-[#2E1231] hover:bg-[#E8C5E0]/40 rounded-lg flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              title="Switch to Velvet Exploratory View with Senior Doctor Mode, Toggles, and Step-by-Step Process Trace"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-600" />
              <span>Velvet Stream + Senior Mode</span>
              <span className="text-[10px] font-mono uppercase bg-[#2E1231] text-white px-1.5 py-0.2 rounded font-bold">
                Live
              </span>
            </button>

            <button
              onClick={() => setShowKeywordsDrawer(true)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              Keywords & Highlighting ({keywords.length})
            </button>

            {progress?.active ? (
              progress.paused ? (
                <>
                  <button
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending || cancelMutation.isPending}
                    className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Resume Co-Scientist screening from current study"
                  >
                    {resumeMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-emerald-700 fill-emerald-700" />
                    )}
                    <span>Resume Screening</span>
                  </button>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || resumeMutation.isPending}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Stop Co-Scientist screening run completely"
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-rose-600 fill-rose-600" />
                    )}
                    <span>Stop</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending || cancelMutation.isPending}
                    className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Pause screening cleanly after current study finishes"
                  >
                    {pauseMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Pause className="w-3.5 h-3.5 text-amber-800 fill-amber-800" />
                    )}
                    <span>{pauseMutation.isPending ? "Pausing..." : "Pause Screening"}</span>
                  </button>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || pauseMutation.isPending}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Stop Co-Scientist screening run completely"
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-rose-600 fill-rose-600" />
                    )}
                    <span>Stop</span>
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  onClick={() => startAnalysisMutation.mutate()}
                  disabled={startAnalysisMutation.isPending || startFullPipelineMutation.isPending}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  title="Run Stage 1: Automated Title & Abstract screening triage"
                >
                  {startAnalysisMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                  )}
                  <span>Start Stage 1 (Title & Abstract)</span>
                </button>

                <button
                  onClick={() => startFullPipelineMutation.mutate()}
                  disabled={startFullPipelineMutation.isPending || startAnalysisMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {startFullPipelineMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Start Full Co-Scientist Screening
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metric Summary Ribbon with Interactive Click-to-Filter Bundles */}
        {summary && (
          <div className="max-w-7xl mx-auto mt-2.5 px-4 md:px-0 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {/* TOTAL */}
            <button
              type="button"
              onClick={() => handleBundleClick("all")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "all"
                  ? "bg-slate-200/90 border-slate-400 ring-2 ring-slate-400/40 shadow-xs scale-[1.02]"
                  : "bg-slate-100/70 border-slate-200/80 hover:bg-slate-100 hover:border-slate-300"
              }`}
              title="Click to view all studies in the project"
            >
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total</span>
              <span className={`text-base font-bold text-slate-800 block ${activeBumpKey === "all" ? "animate-bump" : ""}`}>
                {summary.total}
              </span>
            </button>

            {/* T/A INC */}
            <button
              type="button"
              onClick={() => handleBundleClick("ta_included")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "ta_included"
                  ? "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-400/50 shadow-xs scale-[1.02]"
                  : "bg-emerald-50/80 border-emerald-200 hover:bg-emerald-100/70 hover:border-emerald-300"
              }`}
              title="Click to filter to Title & Abstract Included studies"
            >
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">T/A Inc</span>
              <span className={`text-base font-bold text-emerald-800 block ${activeBumpKey === "ta_included" ? "animate-bump" : ""}`}>
                {summary.ta_included}
              </span>
            </button>

            {/* FT INC */}
            <button
              type="button"
              onClick={() => handleBundleClick("included")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "included"
                  ? "bg-emerald-200/80 border-emerald-600 ring-2 ring-emerald-500/50 shadow-xs scale-[1.02]"
                  : "bg-emerald-100/60 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400"
              }`}
              title="Click to filter to Full-Text Included studies"
            >
              <span className="text-[10px] font-semibold text-emerald-900 uppercase tracking-wider block">FT Inc</span>
              <span className={`text-base font-bold text-emerald-900 block ${activeBumpKey === "included" ? "animate-bump" : ""}`}>
                {summary.ft_included}
              </span>
            </button>

            {/* EXCLUDED */}
            <button
              type="button"
              onClick={() => handleBundleClick("excluded")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "excluded"
                  ? "bg-rose-100 border-rose-500 ring-2 ring-rose-400/50 shadow-xs scale-[1.02]"
                  : "bg-rose-50/80 border-rose-200 hover:bg-rose-100/70 hover:border-rose-300"
              }`}
              title="Click to filter to Excluded studies"
            >
              <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider block">Excluded</span>
              <span className={`text-base font-bold text-rose-800 block ${activeBumpKey === "excluded" ? "animate-bump" : ""}`}>
                {summary.ta_excluded + summary.ft_excluded}
              </span>
            </button>

            {/* UNCERTAIN */}
            <button
              type="button"
              onClick={() => handleBundleClick("uncertain")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "uncertain"
                  ? "bg-amber-100 border-amber-500 ring-2 ring-amber-400/50 shadow-xs scale-[1.02]"
                  : "bg-amber-50/80 border-amber-200 hover:bg-amber-100/70 hover:border-amber-300"
              }`}
              title="Click to filter to Uncertain & Pending studies"
            >
              <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">Uncertain</span>
              <span className={`text-base font-bold text-amber-800 block ${activeBumpKey === "uncertain" ? "animate-bump" : ""}`}>
                {summary.uncertain ?? summary.pending}
              </span>
            </button>

            {/* QUESTIONS */}
            <button
              type="button"
              onClick={() => handleBundleClick("awaiting_clarification")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "awaiting_clarification"
                  ? "bg-purple-100 border-purple-500 ring-2 ring-purple-400/50 shadow-xs scale-[1.02]"
                  : "bg-purple-50/80 border-purple-200 hover:bg-purple-100/70 hover:border-purple-300"
              }`}
              title="Click to filter to Studies Awaiting Human Clarification"
            >
              <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider block">Questions</span>
              <span className={`text-base font-bold text-purple-800 block ${activeBumpKey === "awaiting_clarification" ? "animate-bump" : ""}`}>
                {summary.awaiting_clarification ?? 0}
              </span>
            </button>

            {/* NEED PDF */}
            <button
              type="button"
              onClick={() => handleBundleClick("awaiting_pdf")}
              className={`text-left rounded-lg px-3 py-1.5 transition-all cursor-pointer border ${
                statusFilter === "awaiting_pdf"
                  ? "bg-blue-100 border-blue-500 ring-2 ring-blue-400/50 shadow-xs scale-[1.02]"
                  : "bg-blue-50/80 border-blue-200 hover:bg-blue-100/70 hover:border-blue-300"
              }`}
              title="Click to filter to Studies Awaiting Full-Text PDF"
            >
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider block">Need PDF</span>
              <span className={`text-base font-bold text-blue-800 block ${activeBumpKey === "awaiting_pdf" ? "animate-bump" : ""}`}>
                {summary.awaiting_pdf ?? 0}
              </span>
            </button>
          </div>
        )}
      </header>

      {/* Live Co-Scientist screening progress & controls */}
      {progress?.active && (
        <div className={`border-b px-6 py-2.5 transition-colors ${
          progress.paused ? "bg-amber-50/95 border-amber-200" : "bg-indigo-50 border-indigo-200"
        }`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {progress.paused ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300 shrink-0">
                    <Pause className="w-3 h-3 fill-amber-800" />
                    PAUSED
                  </span>
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                )}
                <span className={`font-semibold shrink-0 ${progress.paused ? "text-amber-900" : "text-indigo-800"}`}>
                  Co-Scientist screening &middot; {progress.stage === "fulltext" ? "Full-text" : progress.stage === "abstract" ? "Abstract" : "Title"} stage
                </span>
                <span className={`truncate ${progress.paused ? "text-amber-800" : "text-indigo-700"}`}>
                  {progress.paused
                    ? (progress.current_study_id ? `Paused at: ${progress.current_title || progress.current_study_id}` : "Paused between studies (clean state)")
                    : (progress.current_study_id ? `Screening: ${progress.current_title || progress.current_study_id}` : "Preparing next study…")}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className={`font-bold whitespace-nowrap ${progress.paused ? "text-amber-900" : "text-indigo-800"}`}>
                  {progress.done} / {progress.total} screened ({progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%)
                </span>
                <div className="flex items-center gap-1.5">
                  {progress.paused ? (
                    <button
                      onClick={() => resumeMutation.mutate()}
                      disabled={resumeMutation.isPending || cancelMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                      title="Resume screening"
                    >
                      {resumeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-emerald-700 fill-emerald-700" />}
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseMutation.mutate()}
                      disabled={pauseMutation.isPending || cancelMutation.isPending}
                      className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-300 rounded flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                      title="Pause screening after current study"
                    >
                      {pauseMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3 text-amber-800 fill-amber-800" />}
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || pauseMutation.isPending || resumeMutation.isPending}
                    className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                    title="Stop screening run"
                  >
                    {cancelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 text-rose-600 fill-rose-600" />}
                    <span>Stop</span>
                  </button>
                </div>
              </div>
            </div>
            <div className={`mt-1.5 h-1.5 rounded-full overflow-hidden ${progress.paused ? "bg-amber-200/80" : "bg-indigo-100"}`}>
              <div
                className={`h-full transition-all duration-500 ${progress.paused ? "bg-amber-500" : "bg-indigo-600"}`}
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {!currentReviewer && (
        <div role="alert" className="px-6 py-3 text-sm text-amber-800 bg-amber-50">
          Sign in with a valid account to save screening decisions.
        </div>
      )}

      {/* Compact Single-Line Filter & Search Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Stage Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setStageFilter("all")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                stageFilter === "all" ? "bg-white text-slate-900 shadow-2xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              All Stages
            </button>
            <button
              onClick={() => setStageFilter("ta")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                stageFilter === "ta" ? "bg-white text-slate-900 shadow-2xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              Title & Abstract
            </button>
            <button
              onClick={() => setStageFilter("ft")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                stageFilter === "ft" ? "bg-white text-slate-900 shadow-2xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              Full-Text
            </button>
          </div>

          {/* Quick Dropdowns & Saved Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="included">FT Included</option>
              <option value="ta_included">T/A Included</option>
              <option value="excluded">Excluded</option>
              <option value="uncertain">Uncertain</option>
              <option value="awaiting_clarification">Needs Clarification</option>
              <option value="awaiting_pdf">Awaiting PDF</option>
            </select>

            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="all">All Confidence</option>
              <option value="high">&ge; 80% (High Confidence)</option>
              <option value="medium">60% - 79% (Moderate)</option>
              <option value="low">&lt; 60% (Low Confidence)</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={savedOnly}
                onChange={(e) => setSavedOnly(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium">Saved ({studyList.filter((s) => bookmarks.ids.includes(s.study_id)).length})</span>
            </label>

            {/* Tag Filter */}
            <TagFilter projectId={projectId!} value={tagFilter} onChange={setTagFilter} />
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search title, authors, DOI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
            />
          </div>
        </div>
      </div>

      {/* ── RIGHT-SIDE PROTOCOL SLIDER RIBBON TAB ── */}
      <aside
        aria-label="Protocol and PICO Rules"
        onClick={() => setIsProtocolSliderOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-gradient-to-b from-[#381A61] to-[#4F46E5] text-white py-4 px-2 rounded-l-xl cursor-pointer shadow-xl border-l border-t border-b border-indigo-300 hover:shadow-2xl hover:scale-105 transition-all flex flex-col items-center gap-2.5 group select-none"
        title="Click to slide open Protocol Eligibility & PICO Rules"
      >
        <BookOpen className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
        <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 text-indigo-100 group-hover:text-white">
          Protocol &amp; PICO Criteria
        </span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <ChevronRight className="w-3.5 h-3.5 text-indigo-200 group-hover:text-white rotate-180" />
      </aside>

      {/* ── SLIDE-OVER PROTOCOL DRAWER ── */}
      {isProtocolSliderOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsProtocolSliderOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-tag-pop">
              {/* Drawer Header */}
              <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-[#381A61] text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-5 h-5 text-amber-300" />
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">Protocol &amp; PICO Rules</h3>
                    <p className="text-[11px] text-indigo-200">Systematic Review Eligibility Criteria</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsProtocolSliderOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-indigo-200 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {/* Protocol Badge */}
                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg">
                  <span className="font-bold text-indigo-900 text-[11px]">PRISMA Protocol Active</span>
                  <span className="text-[10px] bg-indigo-600 text-white font-semibold px-2 py-0.5 rounded-full">Automated Triage</span>
                </div>

                {/* PICO Cards */}
                <div className="space-y-2.5">
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg">
                    <div className="font-bold text-indigo-900 flex items-center gap-1.5 mb-1 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">P</span>
                      <span>Population</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Patients with pure arterial malformations (PAM) or tortuous dilated intracranial arteries without nidus or direct arteriovenous shunts.
                    </p>
                  </div>

                  <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-lg">
                    <div className="font-bold text-sky-900 flex items-center gap-1.5 mb-1 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black">I</span>
                      <span>Intervention</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Endovascular embolization (coiling, onyx, flow diverter stenting), microsurgical clipping/resection, or conservative clinical surveillance.
                    </p>
                  </div>

                  <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-lg">
                    <div className="font-bold text-purple-900 flex items-center gap-1.5 mb-1 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">C</span>
                      <span>Comparator</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Conservative angiographic follow-up vs active interventional occlusion or historical lesion cohorts.
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-lg">
                    <div className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1 text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">O</span>
                      <span>Outcomes</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Aneurysm co-occurrence, angiographic obliteration, recurrent hemorrhage, ischemic stroke, and modified Rankin Scale (mRS).
                    </p>
                  </div>
                </div>

                {/* Mandatory Inclusion & Explicit Exclusion */}
                <div className="space-y-2.5 pt-1">
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                    <span className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1.5 text-[11px]">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Mandatory Inclusion Criteria
                    </span>
                    <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                      <li>Human subjects (in vivo) with radiographically confirmed intracranial PAM.</li>
                      <li>Reports angiographic details (DSA, CTA, or 3T MRA) and clinical management.</li>
                      <li>Peer-reviewed original research, cohort studies, or clinical case series.</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
                    <span className="font-bold text-rose-900 flex items-center gap-1.5 mb-1.5 text-[11px]">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      Explicit Exclusion Disqualifiers
                    </span>
                    <ul className="text-[11px] text-rose-800 space-y-1 list-disc list-inside">
                      <li>Classic AVMs with parenchymal nidus or early draining cortical veins.</li>
                      <li>Dural arteriovenous fistulas (dAVF) or cavernous hemangiomas without PAM.</li>
                      <li>Animal models, in vitro hydrodynamic bench studies, or non-English abstracts.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                <button
                  onClick={() => setIsProtocolSliderOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Close Ribbon
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CO-SCIENTIST SCREENING CLARIFICATIONS & REVIEWER CHECKLIST ── */}
      {projectClarifications.length > 0 && (
        <section
          id="clarifications-checklist"
          className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-3"
          aria-label="Co-Scientist Screening Clarifications Checklist"
        >
          <div className="bg-white border border-purple-200/90 rounded-xl shadow-xs overflow-hidden transition-all">
            {/* Checklist Ribbon Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-purple-50/90 via-indigo-50/50 to-white flex flex-wrap items-center justify-between gap-3 border-b border-purple-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <ListChecks className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                      Co-Scientist Screening Clarifications Checklist
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      {pendingClarifications.length} Pending
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Review and clarify ambiguous PICO criteria flagged by Co-Scientist screener
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter Pills */}
                {isChecklistExpanded && (
                  <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-lg text-xs font-medium text-slate-600">
                    <button
                      onClick={() => setChecklistFilter("pending")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] transition-all",
                        checklistFilter === "pending"
                          ? "bg-purple-100 text-purple-900 font-bold"
                          : "hover:text-slate-900"
                      )}
                    >
                      Pending ({pendingClarifications.length})
                    </button>
                    <button
                      onClick={() => setChecklistFilter("answered")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] transition-all",
                        checklistFilter === "answered"
                          ? "bg-purple-100 text-purple-900 font-bold"
                          : "hover:text-slate-900"
                      )}
                    >
                      Resolved ({answeredClarifications.length})
                    </button>
                    <button
                      onClick={() => setChecklistFilter("all")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] transition-all",
                        checklistFilter === "all"
                          ? "bg-purple-100 text-purple-900 font-bold"
                          : "hover:text-slate-900"
                      )}
                    >
                      All ({projectClarifications.length})
                    </button>
                  </div>
                )}

                {/* Expand / Collapse Button */}
                <button
                  onClick={() => setIsChecklistExpanded((prev) => !prev)}
                  className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{isChecklistExpanded ? "Hide Checklist" : `Show Checklist (${pendingClarifications.length})`}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isChecklistExpanded && "rotate-180")} />
                </button>
              </div>
            </div>

            {/* Checklist Body */}
            {isChecklistExpanded && (
              <div className="p-4 space-y-3 divide-y divide-slate-100">
                {filteredChecklistQuestions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5 opacity-80" />
                    <p className="font-semibold text-slate-700">No clarification questions in this view.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">All items in this filter are resolved or up to date.</p>
                  </div>
                ) : (
                  filteredChecklistQuestions.map((q, idx) => {
                    const isAnswered = q.status === "answered";
                    const isExpanded = expandedChecklistQuestionId === q.question_id || (!isAnswered && filteredChecklistQuestions.length <= 3);
                    const curSelected = checklistSelectedOption[q.question_id] || (isAnswered ? q.answer : "");
                    const curNotes = checklistNotes[q.question_id] || q.answer_freetext || "";
                    const feedback = resolutionFeedback[q.question_id];
                    const isSubmitting = answerClarificationMutation.isPending && (answerClarificationMutation.variables as any)?.questionId === q.question_id;

                    return (
                      <div
                        key={q.question_id}
                        className={cn(
                          "pt-3 first:pt-0 transition-all rounded-lg",
                          selectedStudyId === q.study_id ? "bg-purple-50/40 p-3 -mx-1" : ""
                        )}
                      >
                        {/* Checklist Item Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Checkbox Icon */}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedChecklistQuestionId(isExpanded ? null : q.question_id);
                              }}
                              className="mt-0.5 text-left focus:outline-none cursor-pointer"
                              title={isAnswered ? "Resolved (Click to view details)" : "Pending (Click to answer)"}
                            >
                              {isAnswered ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100 shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-md border-2 border-purple-400 bg-white hover:bg-purple-50 flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                                  <span className="font-mono text-[9px] font-bold text-purple-700">{idx + 1}</span>
                                </div>
                              )}
                            </button>

                            {/* Content Preview */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedStudyId(q.study_id)}
                                  className="text-xs font-bold text-slate-900 hover:text-indigo-600 hover:underline truncate text-left group flex items-center gap-1 cursor-pointer"
                                  title="Click to view and screen this study in the workspace below"
                                >
                                  <span>{q.study_title || `Study ${q.study_id}`}</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
                                </button>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  {q.stage}
                                </span>
                                {q.pico_aspect && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                    {q.pico_aspect}
                                  </span>
                                )}
                                {isAnswered && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    Resolved: {q.answer_label || q.answer}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-slate-800 font-medium leading-relaxed">
                                {q.question_text}
                              </p>

                              {q.context_excerpt && (
                                <p className="text-[11px] text-slate-600 bg-slate-50 border-l-2 border-purple-400 px-2 py-1 rounded-r mt-1.5 italic font-serif line-clamp-2">
                                  &ldquo;{q.context_excerpt}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Expand/Collapse Button */}
                          <button
                            type="button"
                            onClick={() => setExpandedChecklistQuestionId(isExpanded ? null : q.question_id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title={isExpanded ? "Collapse" : "Expand Question"}
                          >
                            <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                          </button>
                        </div>

                        {/* Expanded MCQ Form */}
                        {isExpanded && (
                          <div className="mt-3 ml-8 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3 animate-fadeIn">
                            {/* Feedback Banner if answered in this session */}
                            {feedback && (
                              <div className="p-2.5 rounded-lg bg-emerald-100/90 border border-emerald-300 flex items-start gap-2 text-xs text-emerald-950">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold">Clarification recorded and study re-evaluated!</p>
                                  <p className="text-[11px] text-emerald-800 mt-0.5">
                                    Co-Scientist Decision: <span className="font-bold uppercase">{feedback.final_decision}</span> ({Math.round(feedback.final_confidence * 100)}% confidence)
                                  </p>
                                  {feedback.final_reason_text && (
                                    <p className="text-[10px] text-emerald-700 italic mt-0.5">{feedback.final_reason_text}</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Multiple Choice Options */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                Multiple Choice Questions (Select One):
                              </label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {q.options.map((opt, optIdx) => {
                                  const isSelected = curSelected === opt.value;
                                  return (
                                    <button
                                      type="button"
                                      key={opt.value}
                                      onClick={() => {
                                        setChecklistSelectedOption((prev) => ({ ...prev, [q.question_id]: opt.value }));
                                      }}
                                      className={cn(
                                        "p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between cursor-pointer",
                                        isSelected
                                          ? "bg-purple-50 border-purple-500 ring-2 ring-purple-400/40 shadow-xs"
                                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                                      )}
                                    >
                                      <div className="flex items-start gap-2">
                                        <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                          {optIdx + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-bold text-slate-900 leading-tight">
                                            {opt.label}
                                          </p>
                                          {opt.description && (
                                            <p className="text-[10px] text-slate-500 leading-normal mt-1">
                                              {opt.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      {isSelected && (
                                        <div className="mt-2 text-right">
                                          <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                                            Selected
                                          </span>
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Reviewer Notes / Rationale */}
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Reviewer Rationale / Clarification Notes (Optional):
                              </label>
                              <input
                                type="text"
                                value={curNotes}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setChecklistNotes((prev) => ({ ...prev, [q.question_id]: val }));
                                }}
                                placeholder="Add clinical rationale or citation excerpt reference..."
                                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                              <button
                                type="button"
                                onClick={() => setSelectedStudyId(q.study_id)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                              >
                                <span>Inspect Study Full-Text / Abstract &rarr;</span>
                              </button>

                              <button
                                type="button"
                                disabled={!curSelected || isSubmitting}
                                onClick={() => {
                                  const opt = q.options.find((o) => o.value === curSelected);
                                  answerClarificationMutation.mutate({
                                    questionId: q.question_id,
                                    answer: curSelected,
                                    label: opt?.label,
                                    freetext: curNotes,
                                  });
                                }}
                                className={cn(
                                  "px-4 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer",
                                  (!curSelected || isSubmitting) && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Saving Clarification...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{isAnswered ? "Update Clarification" : "Confirm Clarification & Re-Screen"}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Main Two-Pane Screening Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Study List (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-185px)] sticky top-[135px]">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-xl">
            <span className="text-xs font-semibold text-slate-700">
              Studies ({filteredStudies.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => continuePipelineMutation.mutate("abstract")}
                disabled={continuePipelineMutation.isPending}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100"
                title="Run Stage 2 (Abstract) on pending & uncertain studies"
              >
                Advance Abstract &rarr;
              </button>
              <button
                onClick={() => continuePipelineMutation.mutate("fulltext")}
                disabled={continuePipelineMutation.isPending}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100"
                title="Run Stage 3 (Full-text) on included studies with PDFs"
              >
                Advance Full-Text &rarr;
              </button>
              {robRunProgress?.status === "running" ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Auto RoB Running ({robRunProgress.completed_studies}/{robRunProgress.total_studies})
                </span>
              ) : (
                <button
                  onClick={handleRobAllIncluded}
                  disabled={startBatchRobMutation.isPending}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1"
                  title="Run automated batch Risk of Bias assessment on all included studies"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {startBatchRobMutation.isPending ? "Starting RoB..." : "Batch RoB Included"}
                </button>
              )}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {isLoadingStudies ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading studies...</span>
              </div>
            ) : filteredStudies.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No studies match the selected filters.
              </div>
            ) : (
              filteredStudies.map((study) => {
                const isSelected = selectedStudy?.study_id === study.study_id;
                const conf = study.ai_confidence ? Math.round(study.ai_confidence * 100) : null;
                const isCurrent = !!progress?.active && progress.current_study_id === study.study_id;
                const isQueued = !isCurrent && queuedIds.has(study.study_id);
                const isJustDone = doneIds.has(study.study_id);

                return (
                  <div
                    key={study.study_id}
                    onClick={() => setSelectedStudyId(study.study_id)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isCurrent
                        ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300 animate-pulse"
                        : isSelected
                        ? "bg-indigo-50/60 border-indigo-300 shadow-sm"
                        : "hover:bg-slate-50 border-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                        {study.title}
                      </h3>
                      <BookmarkButton saved={bookmarks.ids.includes(study.study_id)} disabled={bookmarks.disabled} onClick={() => bookmarks.toggle(study.study_id)} />
                      {conf !== null && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap animate-tag-pop ${
                            conf >= 80
                              ? "bg-emerald-100 text-emerald-800"
                              : conf >= 60
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {conf}%
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                      {study.authors || "Unknown Authors"} &bull; {study.publication_year || "N/A"} &bull; {study.journal || "No Journal"}
                    </p>
                    <TagBadges index={tagIndex.data} studyId={study.study_id} />

                    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Status Badge with pop-up animation */}
                        <span
                          className={`px-2 py-0.5 rounded font-medium animate-tag-pop ${
                            study.screening_status === "included" || study.screening_status === "ta_included"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : study.screening_status === "excluded"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : study.screening_status === "awaiting_clarification"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : study.screening_status === "awaiting_pdf"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {study.screening_status.replace("_", " ")}
                        </span>

                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded font-semibold bg-indigo-600 text-white flex items-center gap-1 animate-tag-pop">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Screening now
                          </span>
                        )}
                        {isQueued && (
                          <span className="px-2 py-0.5 rounded font-medium bg-slate-50 text-slate-500 border border-dashed border-slate-300 flex items-center gap-1 animate-tag-pop">
                            <Clock className="w-3 h-3" />
                            Queued
                          </span>
                        )}
                        {!isCurrent && !isQueued && study.ai_decision && (
                          <span
                            className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 animate-tag-pop ${
                              study.ai_decision === "include"
                                ? "bg-emerald-50 text-emerald-700"
                                : study.ai_decision === "exclude"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                            title={isJustDone ? "Screened in the current run" : "Screened by Co-Scientist"}
                          >
                            <CheckCircle className="w-3 h-3" />
                            Co-Scientist screened: {study.ai_decision}
                          </span>
                        )}

                        {study.ai_stage && (
                          <span className="text-slate-400 capitalize">
                            stage: {study.ai_stage}
                          </span>
                        )}
                      </div>

                      {/* Quick Action Icons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (decisionMutation.isPending) return;
                            handleScreenDecision("included", study.study_id);
                          }}
                          disabled={decisionMutation.isPending || !currentReviewer}
                          className="p-1 hover:bg-emerald-100 rounded text-emerald-600 disabled:opacity-40"
                          title="Quick Include"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (decisionMutation.isPending) return;
                            handleScreenDecision("excluded", study.study_id);
                          }}
                          disabled={decisionMutation.isPending || !currentReviewer}
                          className="p-1 hover:bg-rose-100 rounded text-rose-600 disabled:opacity-40"
                          title="Quick Exclude (Reason required)"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Rayyan-Style Preview Pane (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-185px)] overflow-y-auto">
          {selectedStudy ? (
            <div className="p-6 space-y-6">
              {/* Header section */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {renderHighlightedText(
                      selectedStudy.title,
                      selectedHighlights?.title_spans || [],
                      keywords,
                      true
                    )}
                  </h2>
                  <BookmarkButton saved={bookmarks.ids.includes(selectedStudy.study_id)} disabled={bookmarks.disabled} onClick={() => bookmarks.toggle(selectedStudy.study_id)} />
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap animate-tag-pop ${
                      selectedStudy.screening_status === "included" || selectedStudy.screening_status === "ta_included"
                        ? "bg-emerald-100 text-emerald-800"
                        : selectedStudy.screening_status === "excluded"
                        ? "bg-rose-100 text-rose-800"
                        : selectedStudy.screening_status === "awaiting_clarification"
                        ? "bg-purple-100 text-purple-800"
                        : selectedStudy.screening_status === "awaiting_pdf"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {selectedStudy.screening_status.replace("_", " ")}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mb-1">
                  <span className="font-semibold">Authors:</span> {selectedStudy.authors || "Not reported"}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                  <span><span className="font-semibold">Journal:</span> {selectedStudy.journal || "N/A"}</span>
                  <span><span className="font-semibold">Year:</span> {selectedStudy.publication_year || "N/A"}</span>
                  {selectedStudy.doi && (
                    <a
                      href={`https://doi.org/${selectedStudy.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      DOI: {selectedStudy.doi} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Co-Scientist Verdict & Confidence Card */}
              {selectedStudy.ai_decision && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Co-Scientist Recommendation: <span className="capitalize">{selectedStudy.ai_decision}</span>
                      </span>
                    </div>
                    {selectedStudy.ai_confidence && (
                      <span className="text-xs font-semibold text-slate-600">
                        {Math.round(selectedStudy.ai_confidence * 100)}% Confidence
                      </span>
                    )}
                  </div>

                  {/* Confidence Progress Bar */}
                  {selectedStudy.ai_confidence && (
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          selectedStudy.ai_confidence >= 0.8
                            ? "bg-emerald-500"
                            : selectedStudy.ai_confidence >= 0.6
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.round(selectedStudy.ai_confidence * 100)}%` }}
                      />
                    </div>
                  )}

                  {selectedStudy.ai_reason && (
                    <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded border border-slate-200">
                      &ldquo;{selectedStudy.ai_reason}&rdquo;
                    </p>
                  )}
                </div>
              )}

              <TagBadges index={tagIndex.data} studyId={selectedStudy.study_id} />
              <details className="rounded-lg border border-slate-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Comments & tags</summary>
                <RecordCollaborationPanel key={selectedStudy.study_id} projectId={projectId!} studyId={selectedStudy.study_id} />
              </details>

              {/* Co-Scientist Clarification Questions Panel */}
              {(studyClarifications.length > 0 || selectedStudy.screening_status === "awaiting_clarification" || selectedStudy.ai_decision === "maybe") && (
                <div className="bg-gradient-to-r from-purple-50/90 to-indigo-50/90 border-2 border-purple-300 rounded-xl p-4 space-y-3 shadow-xs animate-tag-pop">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-950 font-bold text-xs">
                      <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="block text-purple-900 font-bold">Co-Scientist Clarification Request</span>
                        <span className="text-[10px] text-purple-600 font-normal">Ambiguous eligibility against PICO criteria &bull; Human clarification needed</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 border border-purple-300">
                      Awaiting Clarification
                    </span>
                  </div>

                  {studyClarifications.length > 0 ? (
                    studyClarifications.map((q) => {
                      const isAnswered = q.status === "answered";

                      return (
                        <div key={q.question_id} className="bg-white border border-purple-100 rounded-lg p-3 space-y-2.5">
                          <p className="text-xs font-semibold text-slate-800">{q.question_text}</p>
                          {q.context_excerpt && (
                            <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 italic">
                              Excerpt: &ldquo;{q.context_excerpt}&rdquo;
                            </p>
                          )}

                          {!isAnswered ? (
                            <div className="space-y-2 pt-1">
                              <div className="space-y-1.5">
                                {q.options.map((opt) => (
                                  <label
                                    key={opt.value}
                                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                                  >
                                    <input
                                      type="radio"
                                      name={`option-${q.question_id}`}
                                      value={opt.value}
                                      checked={selectedOption === opt.value}
                                      onChange={() => {
                                        setSelectedOption(opt.value);
                                        setAnsweringQuestionId(q.question_id);
                                      }}
                                      className="text-purple-600 focus:ring-purple-500"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`option-${q.question_id}`}
                                    value="other"
                                    checked={selectedOption === "other"}
                                    onChange={() => {
                                      setSelectedOption("other");
                                      setAnsweringQuestionId(q.question_id);
                                    }}
                                    className="text-purple-600 focus:ring-purple-500"
                                  />
                                  <span>Other (specify below)</span>
                                </label>
                              </div>

                              {selectedOption === "other" && (
                                <input
                                  type="text"
                                  placeholder="Enter custom clarification answer..."
                                  value={freetextAnswer}
                                  onChange={(e) => setFreetextAnswer(e.target.value)}
                                  className="w-full text-xs p-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              )}

                              <button
                                onClick={() => {
                                  const selectedLabel = q.options.find((o) => o.value === selectedOption)?.label || selectedOption;
                                  answerClarificationMutation.mutate({
                                    questionId: q.question_id,
                                    answer: selectedOption,
                                    label: selectedLabel,
                                    freetext: selectedOption === "other" ? freetextAnswer : undefined,
                                  });
                                }}
                                disabled={!selectedOption || answerClarificationMutation.isPending}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {answerClarificationMutation.isPending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                Submit Answer & Re-Evaluate Study
                              </button>
                            </div>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800">
                              <span className="font-semibold">Answered:</span> {q.answer_label || q.answer}
                              {q.final_decision && (
                                <p className="text-[11px] mt-1 text-slate-700">
                                  Re-evaluated Verdict: <span className="font-bold capitalize">{q.final_decision}</span> &bull; {q.final_reason_text}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-white border border-purple-100 rounded-lg p-3 space-y-3">
                      <p className="text-xs font-semibold text-slate-800">
                        The Co-Scientist requires clarification whether this study meets the Population (pure arterial malformation without nidus) or Intervention criteria. Please clarify:
                      </p>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                          <input
                            type="radio"
                            name="coscientist-clarify"
                            value="included"
                            checked={selectedOption === "included"}
                            onChange={() => setSelectedOption("included")}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span>Eligible: Meets Population criteria (Pure arterial malformation confirmed on angio)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                          <input
                            type="radio"
                            name="coscientist-clarify"
                            value="excluded"
                            checked={selectedOption === "excluded"}
                            onChange={() => setSelectedOption("excluded")}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span>Disqualified: Meets Exclusion criteria (Classic AVM with nidus or dAVF present)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                          <input
                            type="radio"
                            name="coscientist-clarify"
                            value="pdf"
                            checked={selectedOption === "pdf"}
                            onChange={() => setSelectedOption("pdf")}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span>Awaiting PDF: Need full-text angio review to verify vessel morphology</span>
                        </label>
                      </div>

                      <button
                        onClick={() => {
                          if (selectedOption === "included") {
                            handleScreenDecision("included");
                          } else if (selectedOption === "excluded") {
                            handleScreenDecision("excluded");
                          } else if (selectedOption === "pdf") {
                            handleScreenDecision("maybe");
                          }
                        }}
                        disabled={!selectedOption || decisionMutation.isPending}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {decisionMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Confirm Clarification & Re-Evaluate</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Abstract with Rayyan-Style Highlights */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Abstract
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHighlights(!showHighlights)}
                      className={`text-xs px-2.5 py-1 rounded border flex items-center gap-1 transition-all ${
                        showHighlights
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                          : "bg-white border-slate-200 text-slate-500"
                      }`}
                    >
                      {showHighlights ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      Highlights {showHighlights ? "On" : "Off"}
                    </button>
                  </div>
                </div>

                {/* Highlight Legend Ribbon */}
                {showHighlights && (
                  <div className="flex items-center gap-2 flex-wrap text-[10px] pb-1">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium border border-emerald-300">
                      Include Keywords
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-medium border border-rose-300">
                      Exclude Keywords
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
                      Population (P)
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300">
                      Intervention (I/C)
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      Outcome (O)
                    </span>
                  </div>
                )}

                {/* Abstract Text Area */}
                <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-4 min-h-[140px]">
                  {renderHighlightedText(
                    selectedStudy.abstract,
                    selectedHighlights?.all_spans || [],
                    keywords,
                    false
                  )}
                </div>
              </div>

              {/* Full-Text Stage & PDF Dropzone */}
              {(stageFilter === "ft" || selectedStudy.screening_status === "awaiting_pdf" || selectedStudy.screening_stage === "ft") && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Full-Text Document
                  </h3>
                  {selectedStudy.pdf_path ? (
                    <div className="flex items-center justify-between bg-white p-3 rounded border border-slate-200">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-emerald-600" />
                        <span className="text-xs font-semibold text-slate-800">
                          PDF Document Processed ({selectedStudy.pdf_status})
                        </span>
                      </div>
                      <a
                        href={`/api/studies/${selectedStudy.study_id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        View Full PDF <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center space-y-2">
                      <FileUp className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-600">
                        No PDF uploaded for full-text evaluation.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPdf}
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                      >
                        {uploadingPdf ? "Uploading & Processing..." : "Upload Full-Text PDF"}
                      </button>
                      {uploadError && (
                        <p className="text-xs text-rose-600">{uploadError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Reviewer Action Bar */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Reviewer Decision
                  </span>
                  <span className="text-xs text-slate-500">
                    Reviewer: <span className="font-semibold text-slate-700">{reviewerName || "Not signed in"}</span>
                  </span>
                </div>

                {/* Exclude reason selection (for exclude decisions) */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      ref={reasonSelectRef}
                      value={excludeReasonCode}
                      onChange={(e) => {
                        setExcludeReasonCode(e.target.value);
                        if (e.target.value) setReasonError(null);
                      }}
                      className={`text-xs bg-white border rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 ${
                        reasonError
                          ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/40"
                          : "border-slate-300 focus:ring-indigo-500"
                      }`}
                    >
                      <option value="">Select Exclusion Reason (Required to exclude)</option>
                      {exclusionReasons.map((r: any) => (
                        <option key={r.code || r.reason_id} value={r.code || r.reason_id}>
                          {r.label || r.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Custom exclusion rationale..."
                      value={excludeReasonText}
                      onChange={(e) => setExcludeReasonText(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  {reasonError && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{reasonError}</span>
                    </div>
                  )}
                </div>

                {/* Save in Progress Indicator */}
                {decisionMutation.isPending && (
                  <div
                    role="status"
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 text-xs font-semibold animate-pulse"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                    <span>Saving screening decision to server... Please wait.</span>
                  </div>
                )}

                {/* Save Failure Recovery Banner with Retry */}
                {saveError && (
                  <div
                    role="alert"
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs shadow-xs"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Failed to save decision</p>
                        <p className="text-rose-700 text-[11px] mt-0.5">{saveError}</p>
                        <p className="text-slate-600 text-[11px] mt-0.5 font-medium">
                          Your selected decision, exclusion reason, and rationale were kept.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={decisionMutation.isPending || !currentReviewer}
                        className="px-3 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 text-xs"
                      >
                        {decisionMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Retry Save</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Main Action Buttons with Hotkey badges */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => handleScreenDecision("included")}
                    disabled={decisionMutation.isPending || !currentReviewer}
                    className="py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Include Study (Hotkeys: 'I' or '1')"
                  >
                    {decisionMutation.isPending && decisionMutation.variables?.decision === "included" ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {decisionMutation.isPending && decisionMutation.variables?.decision === "included"
                        ? "Saving..."
                        : "Include Study"}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-black/20 text-white font-mono text-[10px] font-bold">
                      I / 1
                    </kbd>
                  </button>

                  <button
                    onClick={() => handleScreenDecision("excluded")}
                    disabled={decisionMutation.isPending || !currentReviewer}
                    className="py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    title="Exclude Study (Hotkeys: 'E' or '2')"
                  >
                    {decisionMutation.isPending && decisionMutation.variables?.decision === "excluded" ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {decisionMutation.isPending && decisionMutation.variables?.decision === "excluded"
                        ? "Saving..."
                        : "Exclude Study"}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-black/20 text-white font-mono text-[10px] font-bold">
                      E / 2
                    </kbd>
                  </button>

                  <button
                    onClick={() => handleScreenDecision("maybe")}
                    disabled={decisionMutation.isPending || !currentReviewer}
                    className="py-2.5 text-xs font-bold text-slate-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    title="Maybe / Uncertain (Hotkeys: 'M' or '3')"
                  >
                    {decisionMutation.isPending && decisionMutation.variables?.decision === "maybe" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-800 shrink-0" />
                    ) : (
                      <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    )}
                    <span>
                      {decisionMutation.isPending && decisionMutation.variables?.decision === "maybe"
                        ? "Saving..."
                        : "Maybe / Uncertain"}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-black/10 text-amber-900 font-mono text-[10px] font-bold">
                      M / 3
                    </kbd>
                  </button>
                </div>

                {/* Hotkey Navigation Ribbon */}
                <div className="flex items-center justify-between pt-1 px-1 text-xs text-slate-500 border-b border-slate-100 pb-2">
                  <button
                    type="button"
                    onClick={handleSelectPreviousStudy}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors py-1 px-2 rounded hover:bg-slate-100"
                    title="Previous Study (Hotkeys: '←' or 'J')"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-800 text-[10px] font-mono font-medium">← / J</kbd>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">
                      Study {filteredStudies.findIndex(s => s.study_id === selectedStudy.study_id) + 1} of {filteredStudies.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHotkeysModal(true)}
                      className="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5"
                    >
                      <Keyboard className="w-3 h-3" /> All Shortcuts
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectNextStudy}
                    className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors py-1 px-2 rounded hover:bg-slate-100"
                    title="Next Study (Hotkeys: '→' or 'K')"
                  >
                    <span>Next</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-800 text-[10px] font-mono font-medium">→ / K</kbd>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* RoB + Coded Extraction actions for included studies */}
                {selectedStudy.screening_status === "included" && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {robByStudy.has(selectedStudy.study_id) ? (
                      <Link
                        to={`/projects/${projectId}/rob/${robByStudy.get(selectedStudy.study_id)!.assessment_id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                        title="View the Risk of Bias assessment for this study"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> View RoB
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleStartRob(selectedStudy)}
                        disabled={!!robStarting[selectedStudy.study_id]}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                        title="Auto-create a Risk of Bias assessment (tool selected from study design) and AI-prefill it"
                      >
                        {robStarting[selectedStudy.study_id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        Start RoB
                      </button>
                    )}
                    <button
                      onClick={() => handleCodedExtract(selectedStudy)}
                      disabled={extractingStudyId === selectedStudy.study_id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      title="Coded extraction: per-variable prompts, confidence tags, missing-data codes"
                    >
                      {extractingStudyId === selectedStudy.study_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Coded Extract
                    </button>
                    {extractionMsg[selectedStudy.study_id] && (
                      <span className="text-[11px] text-slate-500">{extractionMsg[selectedStudy.study_id]}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
              <ShieldCheck className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-600">No Study Selected</p>
              <p className="text-xs text-slate-400 mt-1">
                Select a study from the left pane to view its abstract and bibliographic highlights.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Keywords & Highlighting Drawer / Modal */}
      {showKeywordsDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-indigo-600" />
                  Screening Keywords
                </h2>
                <button
                  onClick={() => setShowKeywordsDrawer(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sync from Protocol */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">Sync with Protocol</span>
                  <button
                    onClick={() => autoGenerateKeywordsMutation.mutate()}
                    disabled={autoGenerateKeywordsMutation.isPending}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    {autoGenerateKeywordsMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Sync from Protocol
                  </button>
                </div>
                <p className="text-[11px] text-indigo-700">
                  Automatically synchronizes include and exclude keywords with this review's research protocol, PICO criteria, study designs, and search strings.
                </p>
              </div>

              {/* Add Custom Keyword */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Add Custom Keyword</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. randomized, pediatric..."
                    value={newKeywordText}
                    onChange={(e) => setNewKeywordText(e.target.value)}
                    className="flex-1 text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={newKeywordType}
                    onChange={(e) => setNewKeywordType(e.target.value as any)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2 text-slate-700"
                  >
                    <option value="include">Include (Green)</option>
                    <option value="exclude">Exclude (Red)</option>
                  </select>
                  <button
                    onClick={() => {
                      if (newKeywordText.trim()) {
                        addKeywordMutation.mutate({
                          keyword: newKeywordText.trim(),
                          type: newKeywordType,
                        });
                      }
                    }}
                    disabled={!newKeywordText.trim() || addKeywordMutation.isPending}
                    className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Keywords List */}
              <div className="space-y-4">
                {/* Include Keywords */}
                <div>
                  <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
                    Include Keywords ({keywords.filter((k) => k.keyword_type === "include").length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {keywords
                      .filter((k) => k.keyword_type === "include")
                      .map((k) => (
                        <span
                          key={k.keyword_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300"
                        >
                          {k.keyword}
                          <button
                            onClick={() => deleteKeywordMutation.mutate(k.keyword_id)}
                            className="hover:text-emerald-950"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                </div>

                {/* Exclude Keywords */}
                <div>
                  <h3 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2">
                    Exclude Keywords ({keywords.filter((k) => k.keyword_type === "exclude").length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {keywords
                      .filter((k) => k.keyword_type === "exclude")
                      .map((k) => (
                        <span
                          key={k.keyword_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-300"
                        >
                          {k.keyword}
                          <button
                            onClick={() => deleteKeywordMutation.mutate(k.keyword_id)}
                            className="hover:text-rose-950"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <button
                onClick={() => setShowKeywordsDrawer(false)}
                className="w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Bulk Upload Modal for Screening */}
      {showBulkUploadModal && (
        <UniversalBulkUploadModal
          projectId={projectId!}
          isOpen={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          defaultTarget="screening"
          onSuccess={(count, target, firstStudyId) => {
            queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
            queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
            queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
            if (firstStudyId) {
              setSelectedStudyId(firstStudyId);
            }
          }}
        />
      )}

      {/* Keyboard Hotkeys Cheatsheet Modal */}
      {showHotkeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Keyboard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Screening Keyboard Hotkeys</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-medium text-emerald-700">Hotkeys Active in Workspace</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowHotkeysModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Screen hundreds of titles & abstracts efficiently without leaving your keyboard. Pressing a decision hotkey automatically applies the decision and advances to the next study.
            </p>

            <div className="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/60 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Include Study & Advance
                </span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">I</kbd>
                  <span className="text-slate-400 font-mono text-[11px]">or</span>
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">1</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-600" /> Exclude Study & Advance (Reason required)
                </span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">E</kbd>
                  <span className="text-slate-400 font-mono text-[11px]">or</span>
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">2</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-amber-600" /> Maybe / Uncertain & Advance
                </span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">M</kbd>
                  <span className="text-slate-400 font-mono text-[11px]">or</span>
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">3</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4 text-slate-500" /> Navigate to Previous Study
                </span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">←</kbd>
                  <span className="text-slate-400 font-mono text-[11px]">or</span>
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">J</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-slate-500" /> Navigate to Next Study
                </span>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">→</kbd>
                  <span className="text-slate-400 font-mono text-[11px]">or</span>
                  <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">K</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-700 font-medium flex items-center gap-2">
                  <Keyboard className="h-4 w-4 text-indigo-500" /> Show / Hide Shortcuts
                </span>
                <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-slate-800 shadow-2xs">?</kbd>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hotkeysEnabled}
                  onChange={(e) => setHotkeysEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Enable keyboard shortcuts</span>
              </label>

              <button
                type="button"
                onClick={() => setShowHotkeysModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Universal Bulk Upload Modal from Laptop ── */}
      {showBulkUploadModal && (
        <UniversalBulkUploadModal
          projectId={projectId!}
          isOpen={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          defaultTarget="screening"
          onSuccess={(count, target, firstStudyId) => {
            queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
            queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
            queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
            if (firstStudyId) {
              setSelectedStudyId(firstStudyId);
            }
          }}
        />
      )}
    </div>
  );
}

