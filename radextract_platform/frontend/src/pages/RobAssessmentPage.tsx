import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type RobDomainJudgment,
  type RobSignalingAnswer,
  type RobToolDef,
  type RobDomainDef,
  type RobSQDef,
} from "../lib/api";
import {
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  AlertTriangle,
  Settings2,
  Star,
  Check,
  X,
  Edit3,
  RotateCcw,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
  Quote as QuoteIcon,
  Zap,
} from "lucide-react";
import { judgmentColor, judgmentLabel, judgmentDotColor, cn } from "../lib/utils";
import { ActualPdfViewer, type PdfHighlightItem } from "../components/common/ActualPdfViewer";
import { BENCHMARK_PAPERS } from "./PdfViewerPage";

interface UndoRecord {
  answerId: string;
  previousAnswer: string;
  previousVerified: number;
  previousNeedsReview: number;
}

export function RobAssessmentPage() {
  const { projectId, assessmentId } = useParams<{ projectId: string; assessmentId: string }>();
  const queryClient = useQueryClient();

  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [prefillMsg, setPrefillMsg] = useState("");
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [selectedNewTool, setSelectedNewTool] = useState("");

  // Visual layout state (mirroring PdfViewerPage.tsx)
  const [showPdfPanel, setShowPdfPanel] = useState(true);
  const [selectedQuestionKey, setSelectedQuestionKey] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(null);

  // Inline modification and review transition state
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editDraftAnswer, setEditDraftAnswer] = useState<string>("");
  const [acceptTransitioningId, setAcceptTransitioningId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoRecord[]>([]);

  // Card element refs for auto-scrolling
  const questionCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: assessment, isLoading } = useQuery({
    queryKey: ["rob-assessment", assessmentId],
    queryFn: () => api.getAssessment(assessmentId!),
    enabled: !!assessmentId,
  });

  const { data: availableTools = [] } = useQuery<RobToolDef[]>({
    queryKey: ["rob-tools"],
    queryFn: () => api.listRobTools(),
  });

  const { data: study } = useQuery({
    queryKey: ["study", assessment?.study_id],
    queryFn: () => api.getStudy(assessment!.study_id),
    enabled: !!assessment?.study_id,
  });

  const { data: dynamicStudies = [] } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const allStudies: any[] = useMemo(() => {
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
  }, [dynamicStudies]);

  // Compute PDF URL for the current study
  const currentPdfUrl = useMemo(() => {
    if (customPdfUrl) return customPdfUrl;
    const currentStudyId = assessment?.study_id || "study_birua_2022";
    const paper = allStudies.find((p: any) => p.study_id === currentStudyId || p.id === currentStudyId) || allStudies[0];
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base : base + "/";
    return cleanBase + "papers/" + (paper?.filename || paper?.title + ".pdf" || "Birua_2022.pdf");
  }, [customPdfUrl, assessment?.study_id, allStudies]);

  useEffect(() => {
    if (assessment?.tool && !selectedNewTool) {
      setSelectedNewTool(assessment.tool);
    }
  }, [assessment?.tool, selectedNewTool]);

  // Expand all domains by default so questions are immediately visible
  useEffect(() => {
    if (assessment?.domain_judgments && expandedDomains.size === 0) {
      setExpandedDomains(new Set(assessment.domain_judgments.map((d) => d.domain_key)));
    }
  }, [assessment]);

  // Performance Optimization: O(1) HashMaps for hot-path lookups during render loop
  const domainDefMap = useMemo(() => {
    const map = new Map<string, RobDomainDef>();
    (assessment?.tool_definition?.domains || []).forEach((d) => {
      map.set(d.key, d);
    });
    return map;
  }, [assessment?.tool_definition?.domains]);

  const signalingQuestionDefMap = useMemo(() => {
    const map = new Map<string, RobSQDef>();
    (assessment?.tool_definition?.domains || []).forEach((d) => {
      d.signaling_questions.forEach((q) => {
        map.set(`${d.key}:${q.key}`, q);
      });
    });
    return map;
  }, [assessment?.tool_definition?.domains]);

  const signalingAnswerMap = useMemo(() => {
    const map = new Map<string, RobSignalingAnswer>();
    (assessment?.domain_judgments || []).forEach((dj) => {
      (dj.signaling_answers || []).forEach((sa) => {
        map.set(`${dj.domain_key}:${sa.question_key}`, sa);
      });
    });
    return map;
  }, [assessment?.domain_judgments]);

  // Flatten signaling questions list for linear hotkey navigation
  const allSignalingQuestions = useMemo(() => {
    if (!assessment) return [];
    const list: Array<{
      answer: RobSignalingAnswer;
      domain: RobDomainJudgment;
      questionDef?: { key: string; text: string; response_options: string[]; parent_key?: string | null; trigger_answers?: string[] | null };
      globalIndex: number;
    }> = [];
    let idx = 1;
    for (const dj of assessment.domain_judgments) {
      for (const sa of dj.signaling_answers) {
        const sqDef = signalingQuestionDefMap.get(`${dj.domain_key}:${sa.question_key}`);
        list.push({
          answer: sa,
          domain: dj,
          questionDef: sqDef,
          globalIndex: idx++,
        });
      }
    }
    return list;
  }, [assessment, signalingQuestionDefMap]);

  // Map RoB signaling questions to spatial PDF highlight items for ActualPdfViewer
  const pdfHighlightItems = useMemo<PdfHighlightItem[]>(() => {
    return allSignalingQuestions.map((item) => {
      return {
        id: item.answer.question_key,
        varIndex: item.globalIndex,
        label: item.questionDef?.text || item.answer.question_key,
        quote: item.answer.ai_quote || "",
        pageNumber: item.answer.ai_page || 1,
        isVerified: item.answer.human_verified === 1,
        value: item.answer.answer || item.answer.ai_answer || "Not Answered",
      };
    });
  }, [allSignalingQuestions]);

  // Ensure first question is selected initially
  useEffect(() => {
    if (!selectedQuestionKey && allSignalingQuestions.length > 0) {
      setSelectedQuestionKey(allSignalingQuestions[0].answer.question_key);
    }
  }, [selectedQuestionKey, allSignalingQuestions]);

  // Pre-fill mutation with local Laya
  const prefillMutation = useMutation({
    mutationFn: () => api.aiPrefill(assessmentId!, study?.abstract || "", ""),
    onSuccess: (result) => {
      setPrefillMsg(
        `Laya AI auto-recorded ${result.questions_prefilled} answers across ${result.domains_prefilled} domains ` +
          `(avg confidence: ${(result.avg_confidence * 100).toFixed(0)}%, ${result.used_full_text ? "full text" : "abstract"} mode).`
      );
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
    onError: (e: Error) => setPrefillMsg(`Error: ${e.message}`),
  });

  // Accept all AI mutation
  const acceptAiMutation = useMutation({
    mutationFn: () => api.acceptAi(assessmentId!),
    onSuccess: (result) => {
      setPrefillMsg(
        `Verified and confirmed ${result.answers_accepted} AI-inferred answers. Domain and overall judgments updated.`
      );
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
    onError: (e: Error) => setPrefillMsg(`Error: ${e.message}`),
  });

  // Tool override mutation
  const overrideToolMutation = useMutation({
    mutationFn: (toolId: string) => api.overrideAssessmentTool(assessmentId!, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
      setShowToolModal(false);
      setPrefillMsg("Switched assessment tool. Question schema re-initialized.");
    },
    onError: (e: Error) => alert(`Failed to switch tool: ${e.message}`),
  });

  // Delete assessment mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAssessment(assessmentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
      window.location.href = `/projects/${projectId}/rob`;
    },
  });

  // Answer question mutation (clears needs_human_review on backend)
  const answerMutation = useMutation({
    mutationFn: ({ answerId, answer }: { answerId: string; answer: string }) =>
      api.updateAnswer(answerId, { answer, human_verified: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
  });

  // Domain judgment update mutation
  const judgmentMutation = useMutation({
    mutationFn: (params: {
      judgmentId: string;
      riskJudgment?: string;
      applicability?: string;
      supportText?: string;
    }) =>
      api.updateJudgment(params.judgmentId, {
        risk_judgment: params.riskJudgment,
        applicability: params.applicability,
        support_text: params.supportText,
        human_verified: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
  });

  const toggleDomain = (key: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Find Quote in PDF: Scroll, center, and flash the highlight in ActualPdfViewer
  const findQuoteInPdf = useCallback((targetKey?: string) => {
    const key = targetKey || selectedQuestionKey;
    if (!key) return;

    if (selectedQuestionKey !== key) {
      setSelectedQuestionKey(key);
    }

    // 1. Dispatch custom event for ActualPdfViewer
    window.dispatchEvent(new CustomEvent("radextract:find-quote", { detail: { variableId: key } }));

    // 2. Direct DOM scroll fallback with pulsing glow
    requestAnimationFrame(() => {
      const highlightElement = document.getElementById(`pdf-highlight-${key}`);
      if (highlightElement && typeof highlightElement.scrollIntoView === "function") {
        highlightElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        highlightElement.classList.remove("ring-4", "ring-[#F9D14A]", "animate-pulse");
        void highlightElement.offsetWidth;
        highlightElement.classList.add("ring-4", "ring-[#F9D14A]", "animate-pulse");
        setTimeout(() => {
          highlightElement.classList.remove("ring-4", "ring-[#F9D14A]", "animate-pulse");
        }, 2500);
      }
    });
  }, [selectedQuestionKey]);

  // Navigate to Next / Previous Question
  const navigateToNextQuestion = useCallback(() => {
    if (allSignalingQuestions.length === 0) return;
    const curIdx = allSignalingQuestions.findIndex((q) => q.answer.question_key === selectedQuestionKey);
    if (curIdx >= 0 && curIdx < allSignalingQuestions.length - 1) {
      const nextQ = allSignalingQuestions[curIdx + 1];
      setSelectedQuestionKey(nextQ.answer.question_key);
      setEditingAnswerId(null);
      const card = questionCardRefs.current[nextQ.answer.question_key];
      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [allSignalingQuestions, selectedQuestionKey]);

  const navigateToPrevQuestion = useCallback(() => {
    if (allSignalingQuestions.length === 0) return;
    const curIdx = allSignalingQuestions.findIndex((q) => q.answer.question_key === selectedQuestionKey);
    if (curIdx > 0) {
      const prevQ = allSignalingQuestions[curIdx - 1];
      setSelectedQuestionKey(prevQ.answer.question_key);
      setEditingAnswerId(null);
      const card = questionCardRefs.current[prevQ.answer.question_key];
      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [allSignalingQuestions, selectedQuestionKey]);

  // Decision Handlers: Accept, Modify, Reject, Retain
  const handleDecision = async (
    targetAnswer: RobSignalingAnswer,
    decision: "accepted" | "modified" | "rejected" | "retain",
    customVal?: string
  ) => {
    let finalAnswer = targetAnswer.answer || targetAnswer.ai_answer;
    if (decision === "accepted") {
      finalAnswer = targetAnswer.answer || targetAnswer.ai_answer || "yes";
    } else if (decision === "modified") {
      finalAnswer = customVal || editDraftAnswer;
    } else if (decision === "rejected") {
      finalAnswer = "no_information";
    } else if (decision === "retain") {
      finalAnswer = targetAnswer.answer;
    }

    // Save undo record
    setUndoStack((prev) => [
      ...prev,
      {
        answerId: targetAnswer.answer_id,
        previousAnswer: targetAnswer.answer,
        previousVerified: targetAnswer.human_verified,
        previousNeedsReview: targetAnswer.needs_human_review,
      },
    ]);

    setAcceptTransitioningId(targetAnswer.question_key);
    setTimeout(() => setAcceptTransitioningId(null), 800);

    await answerMutation.mutateAsync({
      answerId: targetAnswer.answer_id,
      answer: finalAnswer,
    });

    setEditingAnswerId(null);
    navigateToNextQuestion();
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));

    await api.updateAnswer(last.answerId, {
      answer: last.previousAnswer,
      human_verified: last.previousVerified === 1,
    });

    queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
    queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isInput) return;

      const currentQ = allSignalingQuestions.find((q) => q.answer.question_key === selectedQuestionKey);

      if (e.key === "a" || e.key === "A" || e.key === "Enter") {
        e.preventDefault();
        if (currentQ) handleDecision(currentQ.answer, "accepted");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (currentQ) {
          setEditingAnswerId(currentQ.answer.answer_id);
          setEditDraftAnswer(currentQ.answer.answer || currentQ.answer.ai_answer || "");
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (currentQ) handleDecision(currentQ.answer, "rejected");
      } else if (e.key === "f" || e.key === "F" || e.key === "q" || e.key === "Q") {
        e.preventDefault();
        findQuoteInPdf(selectedQuestionKey || undefined);
      } else if (e.key === "z" || e.key === "Z" || e.key === "u" || e.key === "U") {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "ArrowDown" || e.key === "j" || e.key === "J" || e.key === "]") {
        e.preventDefault();
        navigateToNextQuestion();
      } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "K" || e.key === "[") {
        e.preventDefault();
        navigateToPrevQuestion();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedQuestionKey, allSignalingQuestions, undoStack]);

  // Flagged questions count (needs_human_review === 1)
  const flaggedCount = useMemo(() => {
    if (!assessment) return 0;
    let count = 0;
    for (const dj of assessment.domain_judgments) {
      for (const sa of dj.signaling_answers) {
        if (sa.needs_human_review === 1) count++;
      }
    }
    return count;
  }, [assessment]);

  // Verified questions count
  const verifiedCount = useMemo(() => {
    if (!assessment) return 0;
    return allSignalingQuestions.filter((q) => q.answer.human_verified === 1).length;
  }, [assessment, allSignalingQuestions]);

  const progressPercent = allSignalingQuestions.length > 0
    ? Math.round((verifiedCount / allSignalingQuestions.length) * 100)
    : 0;

  // Auto-expand all domains with flagged questions when Review Mode is toggled
  useEffect(() => {
    if (isReviewMode && assessment) {
      const flaggedDomainKeys = new Set<string>();
      for (const dj of assessment.domain_judgments) {
        if (dj.signaling_answers.some((sa) => sa.needs_human_review === 1)) {
          flaggedDomainKeys.add(dj.domain_key);
        }
      }
      setExpandedDomains(flaggedDomainKeys);
    }
  }, [isReviewMode, assessment]);

  if (isLoading) return <div className="p-8 text-gray-400">Loading risk of bias assessment...</div>;
  if (!assessment) return <div className="p-8 text-gray-400">Assessment not found.</div>;

  const toolDef = assessment.tool_definition;
  const hasAiSuggestions = assessment.domain_judgments.some((dj) =>
    dj.signaling_answers.some((sa) => sa.ai_answer)
  );

  // Compute NOS Star scores if using NOS tool
  const isNosTool = assessment.tool === "nos";
  const nosStars = isNosTool
    ? assessment.domain_judgments.map((dj) => {
        const stars = dj.signaling_answers.filter((sa) => sa.answer === "yes").length;
        return { domain_key: dj.domain_key, label: dj.domain_label, stars };
      })
    : [];
  const totalNosStars = nosStars.reduce((acc, curr) => acc + curr.stars, 0);

  // Filter domain judgments when Review Mode is active
  const displayedDomainJudgments = isReviewMode
    ? assessment.domain_judgments.filter((dj) =>
        dj.signaling_answers.some((sa) => sa.needs_human_review === 1)
      )
    : assessment.domain_judgments;

  return (
    <div className="flex flex-col h-screen bg-[#ECE9E2] overflow-hidden font-sans">
      {/* ── TOP NAV HEADER (Extraction Theme) ── */}
      <header className="bg-[#FAF9F3] border-b border-[#381A61]/10 px-5 py-2.5 shrink-0 flex items-center justify-between shadow-xs z-30">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/rob`}
            className="text-xs font-semibold text-[#381A61] hover:text-[#381A61] flex items-center gap-1.5 bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 px-3 py-1.5 rounded-xl border border-[#88A0DC]/40 transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to RoB Summary
          </Link>
          <div className="h-4 w-px bg-[#381A61]/15" />

          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#381A61]/10 text-[#381A61]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-bold text-[#381A61] text-sm sm:text-base leading-tight truncate max-w-md">
                  {toolDef?.full_name || assessment.tool.toUpperCase()} Assessment
                </h1>
                <button
                  onClick={() => setShowToolModal(true)}
                  className="text-[10px] px-2 py-0.5 rounded-md border border-[#381A61]/20 bg-white hover:bg-black/5 text-[#381A61] flex items-center gap-1 font-medium shadow-2xs"
                  title="Change assessment tool"
                >
                  <Settings2 className="h-2.5 w-2.5" />
                  <span>Tool</span>
                </button>
              </div>
              <p className="text-[11px] text-[#6B665E] font-serif italic truncate max-w-md">
                {study?.title || "Evaluating Study Publication"}
              </p>
            </div>
          </div>
        </div>

        {/* Center Progress Bar & Overall Judgment */}
        <div className="hidden lg:flex items-center gap-3 bg-white border border-[#381A61]/10 px-4 py-1.5 rounded-full shadow-2xs">
          <div className="text-xs font-medium text-[#381A61]">
            Verified: <span className="font-bold text-[#7C4B73] font-mono">{verifiedCount}/{allSignalingQuestions.length}</span>
          </div>
          <div className="w-24 bg-[#88A0DC]/25 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#381A61] to-[#7C4B73] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-[#381A61] font-mono">{progressPercent}%</span>

          <div className="h-3 w-px bg-[#381A61]/20 mx-1" />

          {/* Overall Judgment Pill */}
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs"
            style={{ backgroundColor: judgmentDotColor(assessment.overall_judgment) }}
          >
            Overall: {judgmentLabel(assessment.overall_judgment)}
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Review Mode Toggle Switch */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-black/[0.08] shadow-2xs">
            <label className="text-xs font-medium text-[#141413] flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isReviewMode}
                onChange={(e) => setIsReviewMode(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
              />
              <span className="hidden sm:inline">Review Flagged</span>
            </label>
            {flaggedCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                {flaggedCount}
              </span>
            )}
          </div>

          {/* Toggle PDF View Column */}
          <button
            onClick={() => setShowPdfPanel(!showPdfPanel)}
            className="p-1.5 rounded-xl bg-white border border-[#381A61]/15 text-[#381A61] hover:bg-[#88A0DC]/20 transition-colors shadow-2xs"
            title={showPdfPanel ? "Collapse PDF Viewer" : "Open PDF Viewer"}
          >
            {showPdfPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          <button
            onClick={() => deleteMutation.mutate()}
            className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            title="Delete assessment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE: SPLIT SCREEN (PDF LEFT, REVIEW CARDS RIGHT) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ══════════════════════════════════════════════════════════
            COLUMN 1: ACTUAL PDF PUBLICATION VIEWER & HIGHLIGHTS (LEFT)
        ══════════════════════════════════════════════════════════ */}
        {showPdfPanel && (
          <section className="w-[50%] lg:w-[54%] border-r border-[#381A61]/10 bg-[#ECE9E2] flex flex-col h-full overflow-hidden transition-all duration-300">
            <ActualPdfViewer
              pdfUrl={currentPdfUrl}
              highlights={pdfHighlightItems}
              activeHighlightId={selectedQuestionKey}
              onHighlightClick={(key) => {
                setSelectedQuestionKey(key);
                const card = questionCardRefs.current[key];
                if (card && typeof card.scrollIntoView === "function") {
                  card.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
              onPdfUpload={(file) => {
                const url = URL.createObjectURL(file);
                setCustomPdfUrl(url);
              }}
              zoom={pdfZoom}
              onZoomChange={setPdfZoom}
              availableStudies={allStudies.map((s: any) => ({
                id: s.study_id || s.id,
                title: s.title,
                filename: s.filename || s.title + ".pdf",
              }))}
              currentStudyId={assessment.study_id}
            />
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════
            COLUMN 2: TRACK CHANGES VERIFICATION CARDS (RIGHT)
        ══════════════════════════════════════════════════════════ */}
        <section className="flex-1 bg-[#F2F1EB] flex flex-col h-full overflow-hidden min-w-0">
          {/* Word Track Changes Review Ribbon Bar */}
          <div className="border-b border-[#381A61]/10 bg-[#FAF9F3] px-4 py-2.5 shrink-0 flex flex-col gap-2 shadow-2xs z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#381A61] uppercase tracking-wide flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-[#381A61] animate-pulse" />
                  Word-Style Track Changes
                </span>
                <span className="bg-[#88A0DC]/20 text-[#381A61] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#88A0DC]/35">
                  Question {(allSignalingQuestions.findIndex((q) => q.answer.question_key === selectedQuestionKey) + 1) || 1} of {allSignalingQuestions.length}
                </span>
                <span className="text-[11px] font-medium text-[#7C4B73] hidden sm:inline font-serif italic">
                  · {progressPercent}% Verified
                </span>
              </div>

              {/* Fast Action Ribbon Buttons: Laya AI Pre-Fill, Accept All AI, Undo */}
              <div className="flex items-center gap-1.5">
                {/* Laya Pre-fill Button */}
                <button
                  onClick={() => prefillMutation.mutate()}
                  disabled={prefillMutation.isPending}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#381A61] bg-[#F9D14A] hover:bg-[#F9D14A]/90 border border-[#E78429]/40 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs ring-1 ring-[#F9D14A]/50"
                  title="Run local Laya engine to evaluate signaling questions and extract supporting quotes"
                >
                  {prefillMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#381A61]" />
                  )}
                  <span>Run Laya AI</span>
                </button>

                {/* Accept All AI Button */}
                {hasAiSuggestions && (
                  <button
                    onClick={() => acceptAiMutation.mutate()}
                    disabled={acceptAiMutation.isPending}
                    className="px-2.5 py-1.5 text-xs font-bold text-white bg-[#381A61] hover:bg-[#4E2487] rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                    title="Confirm and verify all AI recorded answers"
                  >
                    {acceptAiMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 text-[#F9D14A]" />
                    )}
                    <span>Accept All</span>
                  </button>
                )}

                {/* Find Quote in PDF Button in Ribbon */}
                <button
                  onClick={() => findQuoteInPdf(selectedQuestionKey || undefined)}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#381A61] bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 border border-[#88A0DC]/40 rounded-xl flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="Find & jump to quote in PDF (Hotkey: F or Q)"
                >
                  <Eye className="h-3.5 w-3.5 text-[#381A61]" />
                  <span className="hidden sm:inline">Find Quote</span>
                  <kbd className="text-[10px] bg-white border border-[#88A0DC]/60 px-1 rounded font-mono text-[#381A61] font-bold">F</kbd>
                </button>

                <div className="h-4 w-px bg-[#381A61]/15 mx-0.5" />

                {/* Previous Question Button */}
                <button
                  onClick={navigateToPrevQuestion}
                  className="p-1.5 rounded-lg text-[#381A61] hover:bg-[#381A61]/5 transition-colors"
                  title="Previous Question (Hotkey: [ or ↑ or K)"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>

                {/* Next Question Button */}
                <button
                  onClick={navigateToNextQuestion}
                  className="p-1.5 rounded-lg text-[#381A61] hover:bg-[#381A61]/5 transition-colors"
                  title="Next Question (Hotkey: ] or ↓ or J)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Undo Button */}
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={cn(
                    "px-2 py-1 text-xs font-bold rounded-xl flex items-center gap-1 transition-all shadow-2xs",
                    undoStack.length > 0
                      ? "bg-[#E78429]/15 hover:bg-[#E78429]/25 text-[#E78429] border border-[#E78429]/30 cursor-pointer active:scale-95"
                      : "bg-slate-100 text-slate-400 border border-slate-200 opacity-60 cursor-not-allowed"
                  )}
                  title="Undo last change (Hotkey: Z or U)"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Undo</span>
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

          {/* Notification banner if prefill executed */}
          {prefillMsg && (
            <div className="px-4 py-2 bg-[#F9D14A]/20 border-b border-[#F9D14A] text-xs text-[#381A61] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#E78429]" />
                <span>{prefillMsg}</span>
              </div>
              <button onClick={() => setPrefillMsg("")} className="text-[#381A61] font-bold text-xs hover:underline">
                ✕
              </button>
            </div>
          )}

          {/* NOS Star rating if applicable */}
          {isNosTool && (
            <div className="mx-4 mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl shadow-2xs shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-900 flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  Newcastle-Ottawa Scale (NOS) Rating:
                </span>
                <span className="font-bold text-amber-950">
                  {totalNosStars} / 9 Stars — {totalNosStars >= 7 ? "Good Quality" : totalNosStars >= 5 ? "Fair Quality" : "Poor Quality"}
                </span>
              </div>
            </div>
          )}

          {/* Main Scrollable Review Area: Domains & Signaling Questions */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {displayedDomainJudgments.map((dj) => {
              // Performance Optimization: O(1) map lookup replaces array .find() on every render
              const domainDef = domainDefMap.get(dj.domain_key);
              const isExpanded = expandedDomains.has(dj.domain_key);
              const allVerified = dj.signaling_answers.every((sa) => sa.human_verified === 1);
              const flaggedInDomain = dj.signaling_answers.filter(
                (sa) => sa.needs_human_review === 1
              ).length;

              return (
                <div key={dj.judgment_id} className="rounded-2xl border border-[#381A61]/10 bg-white shadow-xs overflow-hidden">
                  {/* Domain Header Accordion */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[#FAF9F3] border-b border-[#381A61]/10">
                    <button
                      onClick={() => toggleDomain(dj.domain_key)}
                      className="flex items-center gap-2.5 text-left flex-1 hover:opacity-80 transition-opacity"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[#7C4B73]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#7C4B73]" />
                      )}
                      <div>
                        <span className="font-serif font-bold text-sm text-[#381A61]">{dj.domain_label}</span>
                        <div className="text-[11px] text-[#6B665E]">
                          {dj.signaling_answers.length} signaling questions
                        </div>
                      </div>
                      {flaggedInDomain > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 ml-2">
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                          {flaggedInDomain} needs review
                        </span>
                      ) : (
                        allVerified && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7C4B73]/15 text-[#7C4B73] border border-[#7C4B73]/30 flex items-center gap-1 ml-2">
                            <CheckCircle className="h-2.5 w-2.5 text-[#7C4B73]" />
                            All Verified
                          </span>
                        )
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#6B665E]">Domain Judgment:</span>
                      <DomainJudgmentSelect
                        judgment={dj}
                        judgmentOptions={toolDef?.judgment_options || []}
                        onChange={(val) =>
                          judgmentMutation.mutate({ judgmentId: dj.judgment_id, riskJudgment: val })
                        }
                      />
                    </div>
                  </div>

                  {/* Domain Signaling Questions Body */}
                  {isExpanded && domainDef && (
                    <div className="p-4 space-y-3.5 bg-[#FAF9F3]/40">
                      {domainDef.signaling_questions.map((sq) => {
                        // Performance Optimization: O(1) HashMap lookup replaces quadratic .find() in render loop
                        const sa = signalingAnswerMap.get(`${dj.domain_key}:${sq.key}`);
                        if (!sa) return null;
                        if (isReviewMode && sa.needs_human_review !== 1) return null;

                        const isSelected = sa.question_key === selectedQuestionKey;
                        const isVerified = sa.human_verified === 1;
                        const isFlagged = sa.needs_human_review === 1;
                        const isTransitioning = acceptTransitioningId === sa.question_key;
                        const confPercent = Math.round((sa.ai_confidence || 0) * 100);

                        return (
                          <div
                            key={sa.answer_id}
                            ref={(el) => { questionCardRefs.current[sa.question_key] = el; }}
                            onClick={() => {
                              setSelectedQuestionKey(sa.question_key);
                              findQuoteInPdf(sa.question_key);
                            }}
                            className={cn(
                              "rounded-2xl border transition-all cursor-pointer duration-200",
                              isTransitioning
                                ? "bg-[#7C4B73]/10 border-2 border-[#7C4B73] shadow-lg ring-4 ring-[#7C4B73]/30 scale-[1.005]"
                                : isSelected
                                ? isFlagged
                                  ? "bg-white border-2 border-[#E78429] shadow-lg ring-4 ring-[#E78429]/30"
                                  : "bg-white border-2 border-[#381A61] shadow-lg ring-4 ring-[#F9D14A]/60"
                                : isFlagged
                                ? "bg-white/95 border border-[#E78429]/40 hover:border-[#E78429] shadow-xs"
                                : "bg-white/90 border border-[#381A61]/10 hover:border-[#7C4B73]/40 shadow-2xs"
                            )}
                          >
                            {/* Card Header */}
                            <div className={`p-3 border-b flex items-center justify-between transition-colors ${
                              isFlagged && !isVerified
                                ? "bg-[#E78429]/10 border-[#E78429]/25"
                                : "border-[#381A61]/10 bg-[#FAF9F3]"
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-[#7C4B73] font-bold">
                                  {sq.key.toUpperCase()}
                                </span>
                                <span className="font-serif font-bold text-[#381A61] text-xs sm:text-sm">
                                  {sq.text}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isVerified ? (
                                  <span className="text-[10px] font-bold text-[#7C4B73] bg-[#7C4B73]/15 border border-[#7C4B73]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                                    <Check className="h-3 w-3 text-[#7C4B73]" /> Verified by Human
                                  </span>
                                ) : isFlagged ? (
                                  <span className="text-[10px] font-bold text-[#E78429] bg-[#E78429]/15 border border-[#E78429]/35 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                                    <AlertTriangle className="h-3 w-3 text-[#E78429]" /> Needs Review
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-[#6B665E] bg-[#88A0DC]/10 border border-[#88A0DC]/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    Auto-Recorded by Laya
                                  </span>
                                )}

                                {sa.ai_confidence && (
                                  <span
                                    className={cn(
                                      "text-[10px] font-mono px-2 py-0.5 rounded-md font-bold",
                                      isFlagged
                                        ? "text-[#E78429] bg-[#E78429]/15 border border-[#E78429]/35"
                                        : "text-[#381A61] bg-[#F9D14A]/30 border border-[#F9D14A]"
                                    )}
                                  >
                                    {confPercent}% Conf
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Card Body: Recorded Answer Banner & Track Changes Diff */}
                            <div className="p-3.5 space-y-2.5">
                              {/* Prominent Recorded Answer Display */}
                              <div className="bg-[#FAF9F3] border border-[#381A61]/10 rounded-xl p-2.5 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CheckCircle className="h-4 w-4 text-[#7C4B73] shrink-0" />
                                  <span className="font-semibold text-[#381A61]">
                                    Recorded Answer:
                                  </span>
                                  <span className="font-mono font-bold text-[#381A61] bg-white px-2.5 py-0.5 rounded-md border border-[#7C4B73]/30 shadow-2xs">
                                    {formatAnswer(sa.answer || sa.ai_answer || "Not Answered")}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#7C4B73] font-serif italic shrink-0">
                                  {isVerified ? "Human Verified ✓" : "Auto-Recorded (Pending Verification)"}
                                </span>
                              </div>

                              {/* Supporting Verbatim Source Quote Highlight */}
                              {sa.ai_quote && (
                                <div className="text-xs text-[#381A61] bg-[#F9D14A]/15 p-2.5 rounded-r-xl border-l-3 border-[#E78429] border-y border-r border-[#E78429]/20 italic flex items-start gap-2 font-serif">
                                  <QuoteIcon className="h-3.5 w-3.5 text-[#E78429] shrink-0 mt-0.5" />
                                  <span className="flex-1 leading-relaxed">"{sa.ai_quote}"</span>
                                  {sa.ai_page && (
                                    <span className="text-[10px] font-mono text-[#7C4B73] font-bold shrink-0 ml-1">
                                      P.{sa.ai_page}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Inline Modification Controls */}
                              {editingAnswerId === sa.answer_id && (
                                <div className="p-3 bg-[#88A0DC]/10 border border-[#88A0DC]/35 rounded-xl space-y-2">
                                  <label className="text-xs font-bold text-[#381A61]">
                                    Select Ground-Truth Answer:
                                  </label>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {sq.response_options.map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setEditDraftAnswer(opt)}
                                        className={cn(
                                          "text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors",
                                          editDraftAnswer === opt
                                            ? "bg-[#381A61] text-white border-[#381A61] font-bold"
                                            : "bg-white text-[#381A61] border-[#88A0DC]/40 hover:bg-[#88A0DC]/25"
                                        )}
                                      >
                                        {formatAnswer(opt)}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="pt-2 flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingAnswerId(null)}
                                      className="px-3 py-1 text-xs text-[#6B665E] hover:bg-black/5 rounded-lg"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDecision(sa, "modified", editDraftAnswer)}
                                      className="px-4 py-1 text-xs font-bold text-white bg-[#381A61] hover:bg-[#4E2487] rounded-xl shadow-xs flex items-center gap-1"
                                    >
                                      <Check className="h-3.5 w-3.5 text-[#F9D14A]" /> Save & Next
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Word Track Changes Action Bar (when selected) */}
                              {isSelected && editingAnswerId !== sa.answer_id && (
                                <div className="pt-2 flex items-center justify-between border-t border-[#381A61]/10 flex-wrap gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Accept Button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDecision(sa, "accepted");
                                      }}
                                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#381A61] hover:bg-[#4E2487] rounded-xl shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                                      title="Accept and verify this answer (Hotkey: A or Enter)"
                                    >
                                      <Check className="h-3.5 w-3.5 text-[#F9D14A]" />
                                      <span>Accept <span className="text-[10px] text-[#F9D14A] font-mono">(A)</span></span>
                                    </button>

                                    {/* Modify Button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingAnswerId(sa.answer_id);
                                        setEditDraftAnswer(sa.answer || sa.ai_answer || "");
                                      }}
                                      className="px-3 py-1.5 text-xs font-bold text-[#7C4B73] bg-[#7C4B73]/10 hover:bg-[#7C4B73]/20 border border-[#7C4B73]/30 active:scale-95 rounded-xl flex items-center gap-1.5 transition-all"
                                      title="Modify Value (Hotkey: M)"
                                    >
                                      <Edit3 className="h-3 w-3 text-[#7C4B73]" />
                                      <span>Modify <span className="text-[10px] font-mono">(M)</span></span>
                                    </button>

                                    {/* Reject Button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDecision(sa, "rejected");
                                      }}
                                      className="px-3.5 py-1.5 text-xs font-bold text-[#AB3329] bg-[#AB3329]/10 hover:bg-[#AB3329]/20 border border-[#AB3329]/30 active:scale-95 rounded-xl flex items-center gap-1.5 transition-all"
                                      title="Reject / Mark No Information (Hotkey: R)"
                                    >
                                      <X className="h-3 w-3 text-[#AB3329]" />
                                      <span>Reject (NR) <span className="text-[10px] font-mono">(R)</span></span>
                                    </button>
                                  </div>

                                  {/* Find Quote in PDF Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      findQuoteInPdf(sa.question_key);
                                    }}
                                    className="text-xs font-bold text-[#381A61] hover:text-[#381A61] bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 border border-[#88A0DC]/40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
                                    title="Scroll and flash quote highlight in PDF (Hotkey: F or Q)"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-[#381A61]" />
                                    <span>Find Quote</span>
                                    <kbd className="text-[10px] bg-white border border-[#88A0DC]/60 text-[#381A61] px-1 py-0.2 rounded font-mono font-bold">F</kbd>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Domain Support Text */}
                      {!isReviewMode && (
                        <div className="pt-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            Domain Support & Justification
                          </label>
                          <textarea
                            className="input text-xs min-h-[50px] w-full bg-white"
                            defaultValue={dj.support_text}
                            placeholder="Notes supporting this domain judgment..."
                            onBlur={(e) => {
                              if (e.target.value !== (dj.support_text || "")) {
                                judgmentMutation.mutate({
                                  judgmentId: dj.judgment_id,
                                  riskJudgment: dj.risk_judgment,
                                  supportText: e.target.value,
                                });
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Keyboard Shortcut Legend */}
          <div className="bg-[#FAF9F3] border-t border-[#381A61]/10 px-4 py-2 shrink-0 flex items-center justify-between text-[11px] text-[#381A61]">
            <span className="font-semibold text-[#381A61] flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-[#E78429]" /> RoB Hotkeys:
            </span>
            <div className="flex items-center gap-3">
              <span><kbd className="px-1.5 py-0.5 bg-[#381A61] text-[#F9D14A] rounded font-mono text-[10px] font-bold">A</kbd> or <kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 rounded font-mono text-[10px]">Enter</kbd> Accept</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-[#7C4B73]/30 text-[#7C4B73] rounded font-mono text-[10px] font-bold">M</kbd> Modify</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#AB3329]/15 border border-[#AB3329]/30 text-[#AB3329] rounded font-mono text-[10px] font-bold">R</kbd> Reject</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#88A0DC]/30 border border-[#88A0DC]/60 text-[#381A61] rounded font-mono text-[10px] font-bold">F</kbd> Find Quote</span>
              <span><kbd className="px-1.5 py-0.5 bg-[#E78429]/20 border border-[#E78429]/40 text-[#E78429] rounded font-mono text-[10px] font-bold">Z</kbd> Undo</span>
              <span><kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 text-[#381A61] rounded font-mono text-[10px]">↓</kbd> / <kbd className="px-1.5 py-0.5 bg-white border border-[#381A61]/15 text-[#381A61] rounded font-mono text-[10px]">↑</kbd> Navigate</span>
            </div>
          </div>
        </section>
      </div>

      {/* Tool Switcher Modal */}
      {showToolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-black/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-bold text-base text-[#141413]">
                Switch Assessment Tool
              </h3>
              <button
                onClick={() => setShowToolModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Select an alternative Risk of Bias tool. Changing the tool will reset signaling questions
              and recompute domain judgments according to the new instrument.
            </p>

            <div className="space-y-2 mb-6">
              {availableTools.map((t) => {
                const isSelected = selectedNewTool === t.key;
                return (
                  <label
                    key={t.key}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all",
                      isSelected
                        ? "bg-purple-50/80 border-purple-500 text-purple-950 font-medium"
                        : "bg-white border-black/10 hover:border-black/20 text-[#141413]"
                    )}
                  >
                    <input
                      type="radio"
                      name="tool_select"
                      value={t.key}
                      checked={isSelected}
                      onChange={() => setSelectedNewTool(t.key)}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-semibold text-xs">{t.name}</div>
                      <div className="text-[11px] text-[#6B665E]">{t.full_name}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowToolModal(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={() => overrideToolMutation.mutate(selectedNewTool)}
                disabled={overrideToolMutation.isPending || selectedNewTool === assessment.tool}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {overrideToolMutation.isPending ? "Switching..." : "Confirm & Switch Tool"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DomainJudgmentSelect({
  judgment,
  judgmentOptions,
  onChange,
}: {
  judgment: RobDomainJudgment;
  judgmentOptions: string[];
  onChange: (val: string) => void;
}) {
  const current = judgment.risk_judgment || "pending";
  return (
    <div className="flex items-center gap-2">
      <select
        className={cn(
          "rounded-md border-0 px-2.5 py-1 text-xs font-bold text-white cursor-pointer outline-none shadow-2xs",
          judgmentColor(current)
        )}
        style={{ backgroundColor: judgmentDotColor(current) }}
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="pending">Pending</option>
        {judgmentOptions.map((opt) => (
          <option key={opt} value={opt}>
            {judgmentLabel(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatAnswer(val: string): string {
  const labels: Record<string, string> = {
    yes: "Yes",
    no: "No",
    unclear: "Unclear",
    probably_yes: "Probably Yes",
    probably_no: "Probably No",
    no_information: "No Information",
    low: "Low",
    high: "High",
  };
  return labels[val] || val;
}
