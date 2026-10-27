import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ClarificationQuestion,
  type ClarificationOption,
  type ClarificationAnswerResponse,
} from "../../lib/api";
import {
  Bell,
  X,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Layers,
  Inbox,
  AlertCircle,
  Check,
  Send,
  Loader2,
  ExternalLink,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { BorderBeam } from "./BorderBeam";

interface ClarificationNotificationCenterProps {
  projectId?: string;
  isDrawerOpen?: boolean;
  onToggleDrawer?: (open: boolean) => void;
  beamActive?: boolean;
}

export function ClarificationNotificationCenter({
  projectId,
  isDrawerOpen: externalDrawerOpen,
  onToggleDrawer,
  beamActive = true,
}: ClarificationNotificationCenterProps) {
  const location = useLocation();
  const isScreeningPage = location.pathname.includes("/screening");
  const queryClient = useQueryClient();
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const isDrawerOpen = externalDrawerOpen ?? internalDrawerOpen;

  const setDrawerOpen = (open: boolean) => {
    if (onToggleDrawer) {
      onToggleDrawer(open);
    } else {
      setInternalDrawerOpen(open);
    }
  };

  // Listen for global custom event to toggle drawer (e.g. from header bell)
  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ open?: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === "boolean") {
        setDrawerOpen(customEvent.detail.open);
      } else {
        setDrawerOpen(!isDrawerOpen);
      }
    };
    window.addEventListener("toggle-clarification-inbox", handleToggle);
    return () => window.removeEventListener("toggle-clarification-inbox", handleToggle);
  }, [isDrawerOpen]);

  // Dismissed / snoozed question IDs from toast view in current session
  const [dismissedToastIds, setDismissedToastIds] = useState<Set<string>>(new Set());
  // Tracks answered questions showing immediate green feedback: { [questionId]: ClarificationAnswerResponse }
  const [successFeedback, setSuccessFeedback] = useState<Record<string, ClarificationAnswerResponse>>({});
  // Selected option per question in toast or drawer
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [expandedExcerpts, setExpandedExcerpts] = useState<Set<string>>(new Set());
  const [activeDrawerTab, setActiveDrawerTab] = useState<"pending" | "answered">("pending");
  const [stageFilter, setStageFilter] = useState<string>("all");

  // Fetch pending clarification questions (poll every 6s)
  const { data: pendingQuestions = [], isLoading: isLoadingPending } = useQuery<ClarificationQuestion[]>({
    queryKey: ["pending-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId, "pending") : Promise.resolve([])),
    enabled: !!projectId,
    refetchInterval: 6000,
  });

  // Fetch all clarification questions for drawer history (poll every 20s)
  const { data: allQuestions = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["all-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId) : Promise.resolve([])),
    enabled: !!projectId && isDrawerOpen,
    refetchInterval: 20000,
  });

  // Answer mutation
  const answerMutation = useMutation({
    mutationFn: ({
      questionId,
      answer,
      answerLabel,
      answerFreetext,
    }: {
      questionId: string;
      answer: string;
      answerLabel?: string;
      answerFreetext?: string;
    }) =>
      api.answerClarification(questionId, {
        answer,
        answer_label: answerLabel,
        answer_freetext: answerFreetext,
        answered_by: "Reviewer (Co-Scientist Consultation)",
      }),
    onSuccess: (result, variables) => {
      setSuccessFeedback((prev) => ({ ...prev, [variables.questionId]: result }));
      // Invalidate relevant queries across screening, study, and clarifications
      queryClient.invalidateQueries({ queryKey: ["pending-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["all-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["study-clarifications"] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });

      // Automatically remove from toast after 3 seconds of showing success banner
      setTimeout(() => {
        setDismissedToastIds((prev) => new Set([...prev, variables.questionId]));
        setSuccessFeedback((prev) => {
          const next = { ...prev };
          delete next[variables.questionId];
          return next;
        });
      }, 3000);
    },
  });

  // Questions to display in bottom-right toast stack (up to 2 un-dismissed pending items)
  const activeToasts = useMemo(() => {
    return pendingQuestions.filter((q) => !dismissedToastIds.has(q.question_id)).slice(0, 2);
  }, [pendingQuestions, dismissedToastIds]);

  // Auto-dismiss pending toasts after 4000ms per Master Theme shell rules
  useEffect(() => {
    if (activeToasts.length === 0) return;
    const timers = activeToasts.map((toast) =>
      setTimeout(() => {
        setDismissedToastIds((prev) => new Set([...prev, toast.question_id]));
      }, 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [activeToasts]);

  // Drawer list filtered by tab and stage
  const drawerList = useMemo(() => {
    const list = activeDrawerTab === "pending" ? pendingQuestions : allQuestions.filter((q) => q.status === "answered");
    if (stageFilter === "all") return list;
    return list.filter((q) => q.stage === stageFilter);
  }, [activeDrawerTab, pendingQuestions, allQuestions, stageFilter]);

  // Keyboard shortcut for toast (digits 1, 2, 3 to select and Enter to submit on topmost toast)
  useEffect(() => {
    if (activeToasts.length === 0 || isDrawerOpen) return;
    const topToast = activeToasts[0];
    const options = topToast.options || [];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= options.length) {
        e.preventDefault();
        const opt = options[num - 1];
        setSelectedOptions((prev) => ({ ...prev, [topToast.question_id]: opt.value }));
      } else if (e.key === "Enter") {
        const curSelected = selectedOptions[topToast.question_id];
        if (curSelected) {
          e.preventDefault();
          const opt = options.find((o) => o.value === curSelected);
          answerMutation.mutate({
            questionId: topToast.question_id,
            answer: curSelected,
            answerLabel: opt?.label,
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeToasts, selectedOptions, isDrawerOpen]);

  const [expandedToastAnswerIds, setExpandedToastAnswerIds] = useState<Set<string>>(new Set());

  const toggleToastQuickAnswer = (qId: string) => {
    setExpandedToastAnswerIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  if (!projectId) return null;

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. BOTTOM-RIGHT DESKTOP NOTIFICATION (Only alert on other screens)
          ───────────────────────────────────────────────────────────── */}
      {!isScreeningPage && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {/* Floating counter pill if there are pending questions */}
          {pendingQuestions.length > 0 && !isDrawerOpen && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#141413] text-[#FAF9F3] text-xs font-medium shadow-lg hover:bg-black/85 transition-all transform hover:-translate-y-0.5 border border-purple-500/30"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
              <span className="font-serif italic font-medium">Clarification Inbox</span>
              <span className="bg-purple-600 text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pendingQuestions.length}
              </span>
            </button>
          )}

          {/* Sequential Toast Notifications (Desktop-style floating notification) */}
          {activeToasts.map((q) => {
            const feedback = successFeedback[q.question_id];
            const curSelected = selectedOptions[q.question_id] || "";
            const isSubmitting = answerMutation.isPending && (answerMutation.variables as any)?.questionId === q.question_id;
            const isQuickOpen = expandedToastAnswerIds.has(q.question_id);

            return (
              <div
                key={q.question_id}
                className={cn(
                  "pointer-events-auto w-88 max-w-sm rounded-lg border border-[#d2c2cb] border-l-2 border-l-[#3a0f34] p-3.5 shadow-md bg-white text-[#4f444b] transition-all duration-300 relative overflow-hidden",
                  feedback
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950 border-l-2 border-l-emerald-600"
                    : "bg-white text-[#4f444b]"
                )}
                role="alert"
              >
                {/* Desktop Notification Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-5 h-5 rounded bg-[#eee7ec] text-[#3a0f34] flex items-center justify-center shrink-0">
                      <Sparkles className="h-3 w-3" />
                    </div>
                    <span className="text-[11px] font-bold text-[#3a0f34] truncate">
                      Co-Scientist Screening Clarification
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-semibold bg-[#eee7ec] text-[#814d75] shrink-0">
                      {q.stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-sans">Just now</span>
                    <button
                      onClick={() => setDismissedToastIds((prev) => new Set([...prev, q.question_id]))}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="Dismiss notification"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Study Title with Link */}
                <div className="mb-1">
                  <Link
                    to={`/projects/${projectId}/screening#clarifications`}
                    className="font-sans font-semibold text-xs text-[#3a0f34] hover:text-[#814d75] hover:underline line-clamp-1 flex items-center gap-1 group"
                    title={q.study_title}
                  >
                    <span className="truncate">{q.study_title || `Study ${q.study_id}`}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-[#81737b] transition-opacity shrink-0" />
                  </Link>
                </div>

                {/* Success Banner if just answered */}
                {feedback ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 flex items-start gap-2 text-xs text-emerald-950 animate-fadeIn mt-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[11px]">Clarified & Re-screened!</p>
                      <p className="text-[10px] text-emerald-800 mt-0.5 font-medium">
                        Decision: <span className="font-bold uppercase">{feedback.final_decision}</span> ({Math.round(feedback.final_confidence * 100)}% conf)
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Question Text (Compact snippet) */}
                    <p className="text-[11px] text-[#4f444b] font-normal leading-snug line-clamp-2 mb-2.5">
                      {q.question_text}
                    </p>

                    {/* Actions Bar */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#d2c2cb]/50">
                      <Link
                        to={`/projects/${projectId}/screening#clarifications`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3a0f34] hover:text-[#1a0017] bg-[#eee7ec] hover:bg-[#d2c2cb]/50 px-2.5 py-1 rounded border border-[#d2c2cb] transition-colors"
                      >
                        <ClipboardCheck className="h-3 w-3 text-[#814d75]" />
                        <span>Clarify in Dashboard</span>
                        <ChevronRight className="h-3 w-3" />
                      </Link>

                      <button
                        type="button"
                        onClick={() => toggleToastQuickAnswer(q.question_id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#62535d] hover:text-[#3a0f34] px-2 py-1 rounded hover:bg-[#eee7ec]/50 transition-colors"
                      >
                        <span>Quick Answer</span>
                        <ChevronDown className={cn("h-3 w-3 transition-transform", isQuickOpen && "rotate-180")} />
                      </button>
                    </div>

                    {/* Expandable Quick Answer Options (Collapsible drawer) */}
                    {isQuickOpen && (
                      <div className="mt-2.5 pt-2 border-t border-[#d2c2cb] space-y-1.5 animate-fadeIn">
                        <div className="space-y-1">
                          {q.options.map((opt, optIdx) => {
                            const isChosen = curSelected === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  setSelectedOptions((prev) => ({ ...prev, [q.question_id]: opt.value }));
                                }}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 rounded border text-[11px] transition-all flex items-start gap-1.5",
                                  isChosen
                                    ? "bg-[#ffdea6]/40 border-[#814d75] text-[#3a0f34] font-medium"
                                    : "bg-[#fbf9f4] border-[#d2c2cb] hover:bg-[#eee7ec] text-[#4f444b]"
                                )}
                              >
                                <span className="font-mono text-[9px] font-bold px-1 rounded bg-[#d2c2cb]/30 text-[#62535d] shrink-0 mt-0.5">
                                  {optIdx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="leading-tight font-medium truncate">{opt.label}</div>
                                </div>
                                {isChosen && <Check className="h-3 w-3 text-[#814d75] shrink-0 mt-0.5" />}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[9px] text-slate-400 font-mono">
                            Keys [1-{q.options.length}]
                          </span>
                          <button
                            disabled={!curSelected || isSubmitting}
                            onClick={() => {
                              const opt = q.options.find((o) => o.value === curSelected);
                              answerMutation.mutate({
                                questionId: q.question_id,
                                answer: curSelected,
                                answerLabel: opt?.label,
                              });
                            }}
                            className={cn(
                              "btn-primary text-[10px] py-1 px-2.5 flex items-center gap-1 rounded-md",
                              !curSelected && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <span>Submit</span>
                                <ChevronRight className="h-2.5 w-2.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. SLIDE-IN INBOX DRAWER (Full Project Clarification Review)
          ───────────────────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop overlay */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-[#FAF9F3] border-l border-black/10 shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="px-6 py-4 border-b border-black/[0.08] flex items-center justify-between bg-[#FAF9F3] sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center">
                    <Inbox className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-serif font-semibold text-base text-[#141413]">
                      Clarification Inbox
                    </h2>
                    <p className="text-[11px] text-[#6B665E]">
                      Human-in-the-loop decisions for Co-Scientist screening ambiguity
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-full text-[#6B665E] hover:text-[#141413] hover:bg-black/5 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tabs & Stage Filters */}
              <div className="px-6 py-3 border-b border-black/[0.06] bg-black/[0.02] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveDrawerTab("pending")}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                      activeDrawerTab === "pending"
                        ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                        : "text-[#6B665E] hover:text-[#141413] hover:bg-black/5"
                    )}
                  >
                    <span>Pending</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-500 text-white font-mono font-bold">
                      {pendingQuestions.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveDrawerTab("answered")}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                      activeDrawerTab === "answered"
                        ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                        : "text-[#6B665E] hover:text-[#141413] hover:bg-black/5"
                    )}
                  >
                    Answered History
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {["all", "title", "abstract", "fulltext"].map((stg) => (
                    <button
                      key={stg}
                      onClick={() => setStageFilter(stg)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors",
                        stageFilter === stg
                          ? "bg-purple-100 text-purple-900 font-bold border border-purple-200"
                          : "text-[#8A817A] hover:bg-black/5"
                      )}
                    >
                      {stg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {drawerList.length === 0 ? (
                  <div className="text-center py-16 text-[#8A817A]">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500/50 mx-auto mb-2" />
                    <p className="font-serif text-sm font-medium text-[#141413]">
                      {activeDrawerTab === "pending"
                        ? "All screening clarifications resolved!"
                        : "No answered clarifications yet."}
                    </p>
                    <p className="text-xs text-[#8A817A] mt-1">
                      {activeDrawerTab === "pending"
                        ? "Background Co-Scientist screening proceeds automatically without blocking."
                        : "Answered questions will be preserved here."}
                    </p>
                  </div>
                ) : (
                  drawerList.map((q) => {
                    const isExpanded = expandedExcerpts.has(q.question_id);
                    const curSelected = selectedOptions[q.question_id] || "";
                    const feedback = successFeedback[q.question_id];
                    const isSubmitting = answerMutation.isPending && (answerMutation.variables as any)?.questionId === q.question_id;

                    return (
                      <div
                        key={q.question_id}
                        className={cn(
                          "rounded-2xl border p-4.5 bg-white shadow-xs transition-all",
                          q.status === "answered"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : "border-black/[0.08] hover:border-black/20"
                        )}
                      >
                        {/* Meta Tags */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-black/[0.05] text-[#6B665E]">
                              {q.stage}
                            </span>
                            {q.pico_aspect && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                PICO: {q.pico_aspect}
                              </span>
                            )}
                            {q.status === "answered" && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                <Check className="h-3 w-3" /> Resolved
                              </span>
                            )}
                          </div>
                          {q.ai_interim_confidence != null && (
                            <span className="text-[10px] text-[#8A817A] font-mono">
                              Confidence: {Math.round(q.ai_interim_confidence * 100)}%
                            </span>
                          )}
                        </div>

                        {/* Study Title with Link */}
                        <Link
                          to={`/projects/${projectId}/screening`}
                          className="font-serif font-semibold text-xs text-[#141413] hover:underline block mb-1.5"
                        >
                          {q.study_title || `Study ${q.study_id}`}
                        </Link>

                        {/* Question Text */}
                        <p className="text-xs font-medium text-[#141413] leading-relaxed mb-3">
                          {q.question_text}
                        </p>

                        {/* Collapsible Context Excerpt */}
                        {q.context_excerpt && (
                          <div className="mb-3">
                            <button
                              onClick={() => {
                                setExpandedExcerpts((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(q.question_id)) next.delete(q.question_id);
                                  else next.add(q.question_id);
                                  return next;
                                });
                              }}
                              className="text-[11px] text-purple-700 hover:text-purple-900 font-medium flex items-center gap-1 mb-1"
                            >
                              <span>{isExpanded ? "Hide context excerpt" : "View context excerpt"}</span>
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="text-[11px] text-[#6B665E] bg-purple-50/50 border border-purple-200/60 rounded-xl p-3 font-serif italic">
                                "{q.context_excerpt}"
                              </div>
                            )}
                          </div>
                        )}

                        {/* If Answered: Display Resolution Summary */}
                        {q.status === "answered" ? (
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-emerald-950">
                                Recorded Answer: {q.answer_label || q.answer}
                              </span>
                              {q.final_decision && (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 uppercase">
                                  {q.final_decision}
                                </span>
                              )}
                            </div>
                            {q.final_reason_text && (
                              <p className="text-[11px] text-emerald-800 italic mt-0.5">
                                {q.final_reason_text}
                              </p>
                            )}
                            <div className="text-[10px] text-emerald-700 mt-1 font-mono">
                              By {q.answered_by || "Reviewer"} {q.answered_at ? `at ${new Date(q.answered_at).toLocaleTimeString()}` : ""}
                            </div>
                          </div>
                        ) : feedback ? (
                          <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-xs text-emerald-950">
                            <p className="font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              Resolution updated: {feedback.final_decision.toUpperCase()}
                            </p>
                            <p className="text-[11px] text-emerald-800 mt-1">{feedback.final_reason_text}</p>
                          </div>
                        ) : (
                          /* Pending: Interactive Option Radios & Submit */
                          <div className="space-y-2">
                            <div className="space-y-1.5">
                              {q.options.map((opt) => {
                                const isChecked = curSelected === opt.value;
                                return (
                                  <label
                                    key={opt.value}
                                    className={cn(
                                      "flex items-start gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all",
                                      isChecked
                                        ? "bg-purple-50/70 border-purple-400 font-medium"
                                        : "bg-white border-black/10 hover:border-black/20"
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      name={`drawer_${q.question_id}`}
                                      value={opt.value}
                                      checked={isChecked}
                                      onChange={() =>
                                        setSelectedOptions((prev) => ({
                                          ...prev,
                                          [q.question_id]: opt.value,
                                        }))
                                      }
                                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="flex-1">
                                      <div className="text-[#141413]">{opt.label}</div>
                                      {opt.description && (
                                        <div className="text-[10px] text-[#6B665E] mt-0.5">
                                          {opt.description}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>

                            {/* Submit Button */}
                            <div className="flex justify-end pt-2">
                              <button
                                disabled={!curSelected || isSubmitting}
                                onClick={() => {
                                  const opt = q.options.find((o) => o.value === curSelected);
                                  answerMutation.mutate({
                                    questionId: q.question_id,
                                    answer: curSelected,
                                    answerLabel: opt?.label,
                                  });
                                }}
                                className={cn(
                                  "btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5",
                                  !curSelected && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Re-evaluating Study...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Confirm Decision</span>
                                    <Check className="h-3 w-3" />
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
