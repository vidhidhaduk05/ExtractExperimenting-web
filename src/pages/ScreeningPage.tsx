import { useState, useRef, useMemo } from "react";
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
} from "lucide-react";

export function ScreeningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout & Selection state
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Protocol Screening Rules & PICO Criteria Minimization
  const [isProtocolRulesMinimized, setIsProtocolRulesMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem("radextract_screening_rules_minimized") === "true";
    } catch {
      return false;
    }
  });

  const toggleProtocolRulesMinimized = () => {
    setIsProtocolRulesMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("radextract_screening_rules_minimized", String(next));
      } catch {}
      return next;
    });
  };

  // Reviewer identity
  const [reviewerId] = useState(() => localStorage.getItem("username") || "reviewer1");
  const [reviewerName] = useState(() => localStorage.getItem("username") || "Reviewer 1");

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

  // PDF upload for selected study
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    const targets = (studies || []).filter(
      (s) => s.screening_status === "included" && !robByStudy.has(s.study_id)
    );
    if (targets.length === 0) {
      alert("All included studies already have a RoB assessment.");
      return;
    }
    for (const s of targets) {
      await handleStartRob(s);
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

  // Effective selected study
  const selectedStudy = useMemo(() => {
    if (!studyList || studyList.length === 0) return null;
    if (selectedStudyId) {
      const found = studyList.find((s) => s.study_id === selectedStudyId);
      if (found) return found;
    }
    return studyList[0];
  }, [studyList, selectedStudyId]);

  // Filtered Studies List
  const filteredStudies = useMemo(() => {
    return studyList.filter((s) => {
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
  }, [studies, searchQuery, confidenceFilter]);

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

  const decisionMutation = useMutation({
    mutationFn: (data: { studyId: string; decision: "included" | "excluded" | "maybe"; reasonCode?: string; reasonText?: string }) =>
      api.screeningDecision(data.studyId, {
        project_id: projectId!,
        reviewer_id: reviewerId,
        reviewer_name: reviewerName,
        decision: data.decision,
        stage: stageFilter === "ft" ? "ft" : "ta",
        reason_code: data.reasonCode,
        reason_text: data.reasonText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

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
    },
  });

  // Render Highlighted Abstract
  const renderHighlightedAbstract = (abstractText: string, spans: HighlightSpan[] = []) => {
    if (!abstractText) {
      return <p className="text-gray-400 italic">No abstract available for this study.</p>;
    }
    if (!showHighlights || spans.length === 0) {
      return <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{abstractText}</p>;
    }

    // Sort spans by start offset
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let currentIdx = 0;

    sorted.forEach((span, i) => {
      if (span.start > currentIdx) {
        elements.push(
          <span key={`text-${currentIdx}`}>{abstractText.substring(currentIdx, span.start)}</span>
        );
      }
      if (span.end > span.start && span.start >= currentIdx) {
        const text = abstractText.substring(span.start, span.end);
        let colorClass = "bg-yellow-100 text-yellow-900 border-yellow-300";
        if (span.color === "green" || span.type === "include_keyword") {
          colorClass = "bg-emerald-100 text-emerald-900 border-emerald-300 font-medium";
        } else if (span.color === "red" || span.type === "exclude_keyword") {
          colorClass = "bg-rose-100 text-rose-900 border-rose-300 font-medium";
        } else if (span.color === "purple" || span.type === "population") {
          colorClass = "bg-purple-100 text-purple-900 border-purple-300";
        } else if (span.color === "blue" || span.type === "intervention" || span.type === "comparator") {
          colorClass = "bg-sky-100 text-sky-900 border-sky-300";
        } else if (span.color === "orange" || span.type === "outcome") {
          colorClass = "bg-amber-100 text-amber-900 border-amber-300";
        }

        elements.push(
          <mark
            key={`span-${span.start}-${i}`}
            className={`px-1 py-0.5 rounded border text-sm inline-block transition-colors ${colorClass}`}
            title={`${span.label} (${span.type})`}
          >
            {text}
          </mark>
        );
        currentIdx = span.end;
      }
    });

    if (currentIdx < abstractText.length) {
      elements.push(<span key={`text-end`}>{abstractText.substring(currentIdx)}</span>);
    }

    return <div className="text-gray-800 leading-relaxed text-sm">{elements}</div>;
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
                AI Screening Workspace
              </h1>
              <p className="text-xs text-slate-500">
                Multi-Stage Screening: Title &rarr; Abstract &rarr; Full-Text with Rayyan-Style Highlighting
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowKeywordsDrawer(true)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              Keywords & Highlighting ({keywords.length})
            </button>

            <button
              onClick={() => startAnalysisMutation.mutate()}
              disabled={startAnalysisMutation.isPending || startFullPipelineMutation.isPending}
              className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {startAnalysisMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 text-indigo-600" />
              )}
              Start Stage 1 (Title Only)
            </button>

            <button
              onClick={() => startFullPipelineMutation.mutate()}
              disabled={startFullPipelineMutation.isPending || startAnalysisMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {startFullPipelineMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Start Full AI Screening
            </button>
          </div>
        </div>

        {/* Metric Summary Ribbon */}
        {summary && (
          <div className="max-w-7xl mx-auto mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            <div className="bg-slate-100/70 border border-slate-200/80 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total</span>
              <span className="text-sm font-bold text-slate-800">{summary.total}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">T/A Inc</span>
              <span className="text-sm font-bold text-emerald-800">{summary.ta_included}</span>
            </div>
            <div className="bg-emerald-100/60 border border-emerald-300 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">FT Inc</span>
              <span className="text-sm font-bold text-emerald-900">{summary.ft_included}</span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider block">Excluded</span>
              <span className="text-sm font-bold text-rose-800">{summary.ta_excluded + summary.ft_excluded}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">Uncertain</span>
              <span className="text-sm font-bold text-amber-800">{summary.uncertain ?? summary.pending}</span>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider block">Questions</span>
              <span className="text-sm font-bold text-purple-800">{summary.awaiting_clarification ?? 0}</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider block">Need PDF</span>
              <span className="text-sm font-bold text-blue-800">{summary.awaiting_pdf ?? 0}</span>
            </div>
          </div>
        )}
      </header>

      {/* Live AI screening progress */}
      {progress?.active && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-2.5">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                <span className="font-semibold text-indigo-800 shrink-0">
                  AI screening &middot; {progress.stage === "fulltext" ? "Full-text" : progress.stage === "abstract" ? "Abstract" : "Title"} stage
                </span>
                <span className="text-indigo-700 truncate">
                  {progress.current_study_id ? `Screening: ${progress.current_title || progress.current_study_id}` : "Preparing next study…"}
                </span>
              </div>
              <span className="font-bold text-indigo-800 whitespace-nowrap">
                {progress.done} / {progress.total} screened
              </span>
            </div>
            <div className="mt-1.5 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Stage & Status Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
              <button
                onClick={() => setStageFilter("all")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  stageFilter === "all" ? "bg-white text-slate-900 shadow-sm font-semibold" : "hover:text-slate-900"
                }`}
              >
                All Stages
              </button>
              <button
                onClick={() => setStageFilter("ta")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  stageFilter === "ta" ? "bg-white text-slate-900 shadow-sm font-semibold" : "hover:text-slate-900"
                }`}
              >
                Title & Abstract
              </button>
              <button
                onClick={() => setStageFilter("ft")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  stageFilter === "ft" ? "bg-white text-slate-900 shadow-sm font-semibold" : "hover:text-slate-900"
                }`}
              >
                Full-Text
              </button>
            </div>

            <div className="h-4 w-px bg-slate-300" />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="included">Included</option>
              <option value="ta_included">T/A Included</option>
              <option value="excluded">Excluded</option>
              <option value="uncertain">Uncertain</option>
              <option value="awaiting_clarification">Needs Clarification</option>
              <option value="awaiting_pdf">Awaiting PDF</option>
            </select>

            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Confidence</option>
              <option value="high">&ge; 80% (High Confidence)</option>
              <option value="medium">60% - 79% (Moderate)</option>
              <option value="low">&lt; 60% (Low Confidence)</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search studies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* ── COLLAPSIBLE PROTOCOL SCREENING RULES & PICO CRITERIA PANEL ── */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 pt-4">
        {isProtocolRulesMinimized ? (
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-slate-800">
                Protocol Eligibility & PICO Rules:
              </span>
              <span className="text-slate-500">
                Population: Intracranial PAMs / Arterial Malformations &bull; Intervention: Endovascular / Surgical &bull; Outcomes: Occlusion / Safety
              </span>
            </div>
            <button
              onClick={toggleProtocolRulesMinimized}
              className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Expand full protocol screening rules"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Expand Protocol Rules</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-indigo-100 rounded-xl shadow-xs overflow-hidden transition-all duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Protocol Screening Rules & PICO Eligibility Criteria
                </h3>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                  PRISMA Protocol Active
                </span>
              </div>
              <button
                onClick={toggleProtocolRulesMinimized}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                title="Minimize protocol rules panel"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Minimize Rules</span>
              </button>
            </div>

            {/* PICO Grid & Inclusion/Exclusion Rules */}
            <div className="p-4 space-y-3">
              {/* PICO 4-Pill Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                  <div className="font-bold text-indigo-900 flex items-center gap-1 mb-1">
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">P</span>
                    <span>Population</span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Patients with pure arterial malformations (PAM) or tortuous dilated intracranial arteries without nidus or direct arteriovenous shunts.
                  </p>
                </div>

                <div className="p-2.5 bg-sky-50/60 border border-sky-100 rounded-lg">
                  <div className="font-bold text-sky-900 flex items-center gap-1 mb-1">
                    <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black">I</span>
                    <span>Intervention</span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Endovascular embolization (coiling, onyx, flow diverter stenting), microsurgical clipping/resection, or conservative clinical surveillance.
                  </p>
                </div>

                <div className="p-2.5 bg-purple-50/60 border border-purple-100 rounded-lg">
                  <div className="font-bold text-purple-900 flex items-center gap-1 mb-1">
                    <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">C</span>
                    <span>Comparator</span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Conservative angiographic follow-up vs active interventional occlusion or historical lesion cohorts.
                  </p>
                </div>

                <div className="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                  <div className="font-bold text-emerald-900 flex items-center gap-1 mb-1">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">O</span>
                    <span>Outcomes</span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    Aneurysm co-occurrence, angiographic obliteration, recurrent hemorrhage, ischemic stroke, and modified Rankin Scale (mRS).
                  </p>
                </div>
              </div>

              {/* Explicit Inclusion vs Exclusion Criteria Rows */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-2.5 bg-emerald-50/40 border border-emerald-200/80 rounded-lg">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Mandatory Inclusion Criteria
                  </span>
                  <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                    <li>Human subjects (in vivo) with radiographically confirmed intracranial PAM.</li>
                    <li>Reports angiographic details (DSA, CTA, or 3T MRA) and clinical management.</li>
                    <li>Peer-reviewed original research, cohort studies, or clinical case series.</li>
                  </ul>
                </div>

                <div className="p-2.5 bg-rose-50/40 border border-rose-200/80 rounded-lg">
                  <span className="font-bold text-rose-900 flex items-center gap-1.5 mb-1 text-[11px]">
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
          </div>
        )}
      </div>

      {/* Main Two-Pane Screening Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Study List (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-230px)] sticky top-[180px]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-xl">
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
              <button
                onClick={handleRobAllIncluded}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1"
                title="Create + AI-prefill Risk of Bias assessments for all included studies that don't have one yet"
              >
                <ShieldCheck className="w-3 h-3" />
                RoB All Included
              </button>
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
                      {conf !== null && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
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

                    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded font-medium ${
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
                          <span className="px-2 py-0.5 rounded font-semibold bg-indigo-600 text-white flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Screening now
                          </span>
                        )}
                        {isQueued && (
                          <span className="px-2 py-0.5 rounded font-medium bg-slate-50 text-slate-500 border border-dashed border-slate-300 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Queued
                          </span>
                        )}
                        {!isCurrent && !isQueued && study.ai_decision && (
                          <span
                            className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                              study.ai_decision === "include"
                                ? "bg-emerald-50 text-emerald-700"
                                : study.ai_decision === "exclude"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                            title={isJustDone ? "Screened in the current run" : "Screened by AI"}
                          >
                            <CheckCircle className="w-3 h-3" />
                            AI screened: {study.ai_decision}
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
                            decisionMutation.mutate({ studyId: study.study_id, decision: "included" });
                          }}
                          className="p-1 hover:bg-emerald-100 rounded text-emerald-600"
                          title="Quick Include"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            decisionMutation.mutate({ studyId: study.study_id, decision: "excluded" });
                          }}
                          className="p-1 hover:bg-rose-100 rounded text-rose-600"
                          title="Quick Exclude"
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
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[calc(100vh-230px)]">
          {selectedStudy ? (
            <div className="p-6 space-y-6">
              {/* Header section */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {selectedStudy.title}
                  </h2>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
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

              {/* AI Verdict & Confidence Card */}
              {selectedStudy.ai_decision && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        AI Recommendation: <span className="capitalize">{selectedStudy.ai_decision}</span>
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

              {/* Clarification Questions Panel (if study requires clarification) */}
              {studyClarifications.length > 0 && (
                <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                    <HelpCircle className="w-4 h-4 text-purple-600" />
                    Reviewer Clarification Required
                  </div>

                  {studyClarifications.map((q) => {
                    const isAnswered = q.status === "answered";
                    const isAnswering = answeringQuestionId === q.question_id;

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
                  })}
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
                  {renderHighlightedAbstract(
                    selectedStudy.abstract,
                    selectedHighlights?.all_spans || []
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
                    Reviewer: <span className="font-semibold text-slate-700">{reviewerName}</span>
                  </span>
                </div>

                {/* Exclude reason selection (for exclude decisions) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={excludeReasonCode}
                    onChange={(e) => setExcludeReasonCode(e.target.value)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select Exclusion Reason (Optional)</option>
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

                {/* Main Action Buttons */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() =>
                      decisionMutation.mutate({
                        studyId: selectedStudy.study_id,
                        decision: "included",
                        reasonText: "Eligible under PICO criteria",
                      })
                    }
                    disabled={decisionMutation.isPending}
                    className="py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Include Study
                  </button>

                  <button
                    onClick={() =>
                      decisionMutation.mutate({
                        studyId: selectedStudy.study_id,
                        decision: "excluded",
                        reasonCode: excludeReasonCode || "wrong_population",
                        reasonText: excludeReasonText || "Ineligible based on criteria",
                      })
                    }
                    disabled={decisionMutation.isPending}
                    className="py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Exclude Study
                  </button>

                  <button
                    onClick={() =>
                      decisionMutation.mutate({
                        studyId: selectedStudy.study_id,
                        decision: "maybe",
                        reasonText: "Uncertain - requires further assessment",
                      })
                    }
                    disabled={decisionMutation.isPending}
                    className="py-2.5 text-xs font-bold text-slate-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-700" />
                    Maybe / Uncertain
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

              {/* Auto-generate from PICO */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">Auto-Generate Keywords</span>
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
                    Generate from PICO
                  </button>
                </div>
                <p className="text-[11px] text-indigo-700">
                  Automatically derives include/exclude keywords from the project's PICO statement and study designs.
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
    </div>
  );
}
