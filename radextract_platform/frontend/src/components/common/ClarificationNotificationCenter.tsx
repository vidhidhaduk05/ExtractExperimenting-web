import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ClarificationQuestion,
} from "../../lib/api";
import { Mail, X, CheckCircle2, ChevronRight, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { sanitizeUiCopy } from "../../lib/editorialRules";
import "./ClarificationNotificationCenter.css";

const EMPTY_QUESTIONS: ClarificationQuestion[] = [];
const announcedByProject = new Map<string, Set<string>>();

function announcedQuestions(projectId: string): Set<string> {
  const remembered = announcedByProject.get(projectId) ?? new Set<string>();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`clarification-announced:${projectId}`) ?? "[]");
    if (Array.isArray(stored)) {
      for (const id of stored) if (typeof id === "string") remembered.add(id);
    }
  } catch { /* Storage may be unavailable; retain tracking for this session. */ }
  announcedByProject.set(projectId, remembered);
  return remembered;
}

function ClarificationToast({ questions, onMinimize, onReview }: {
  questions: ClarificationQuestion[];
  onMinimize: () => void;
  onReview: () => void;
}) {
  const [remaining, setRemaining] = useState(5000);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [headerBottom, setHeaderBottom] = useState(72);

  useEffect(() => {
    const header = document.querySelector('[data-app-header]');
    const update = () => setHeaderBottom((header?.getBoundingClientRect().bottom ?? 60) + 12);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (header) observer?.observe(header);
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (hovered || focused || hidden) return;
    let previous = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - previous);
      previous = now;
      setRemaining(value => Math.max(0, value - elapsed));
    }, 50);
    return () => window.clearInterval(timer);
  }, [hovered, focused, hidden]);

  useEffect(() => { if (remaining === 0) onMinimize(); }, [remaining, onMinimize]);

  const first = questions[0];
  return (
    <section className="clarification-toast" style={{ top: headerBottom }} aria-label="New clarification"
      data-exiting={remaining <= 150 && !hovered && !focused && !hidden}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onKeyDown={event => event.stopPropagation()}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="clarification-toast-heading">
        <Mail size={18} aria-hidden="true" />
        <strong>Clarification needed</strong>
        <button type="button" className="clarification-minimize" aria-label="Minimize clarification notification" onClick={onMinimize}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div>
        {questions.length > 1 ? <p>{questions.length} clarifications need your review.</p> : <>
          <p className="clarification-study">{sanitizeUiCopy(first.study_title || `Study ${first.study_id}`)}</p>
          <p className="clarification-preview">{sanitizeUiCopy(first.question_text)}</p>
        </>}
      </div>
      <button type="button" className="clarification-review" onClick={onReview}>
        {questions.length > 1 ? "Review questions" : "Review question"}<ChevronRight size={16} aria-hidden="true" />
      </button>
      <div className="clarification-countdown" aria-hidden="true">
        <div style={{ transform: `scaleX(${remaining / 5000})` }} />
      </div>
    </section>
  );
}

interface ClarificationNotificationCenterProps {
  projectId?: string;
  isDrawerOpen?: boolean;
  onToggleDrawer?: (open: boolean) => void;
}

function ProjectClarificationNotificationCenter({
  projectId,
  isDrawerOpen: externalDrawerOpen,
  onToggleDrawer,
}: ClarificationNotificationCenterProps) {
  const queryClient = useQueryClient();
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const isDrawerOpen = externalDrawerOpen ?? internalDrawerOpen;

  const setDrawerOpen = useCallback((open: boolean) => {
    if (onToggleDrawer) {
      onToggleDrawer(open);
    } else {
      setInternalDrawerOpen(open);
    }
  }, [onToggleDrawer]);

  // Listen for global custom event to toggle drawer (e.g. from header envelope)
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
  }, [isDrawerOpen, setDrawerOpen]);

  const [toastQueue, setToastQueue] = useState<string[][]>([]);
  const [announcement, setAnnouncement] = useState("");
  const inboxRef = useRef<HTMLDivElement>(null);
  // Answer controls live only in the persistent inbox
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [expandedExcerpts, setExpandedExcerpts] = useState<Set<string>>(new Set());
  const [activeDrawerTab, setActiveDrawerTab] = useState<"pending" | "answered">("pending");
  const [stageFilter, setStageFilter] = useState<string>("all");

  // Fetch pending clarification questions (poll every 6s)
  const { data: pendingQuestions = EMPTY_QUESTIONS, isSuccess: pendingLoaded } = useQuery<ClarificationQuestion[]>({
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
    onSuccess: async (_result, variables) => {
      await queryClient.cancelQueries({ queryKey: ["pending-clarifications", projectId] });
      // Only a successful save resolves pending state and updates the shared header badge.
      queryClient.setQueryData<ClarificationQuestion[]>(["pending-clarifications", projectId],
        previous => previous?.filter(question => question.question_id !== variables.questionId));
      // Invalidate relevant queries across screening, study, and clarifications
      queryClient.invalidateQueries({ queryKey: ["pending-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["all-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["study-clarifications"] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });

    },
  });

  useEffect(() => {
    if (!projectId || !pendingLoaded) return;
    const seen = announcedQuestions(projectId);
    const newIds = pendingQuestions.filter(question => !seen.has(question.question_id)).map(question => question.question_id);
    for (const id of newIds) seen.add(id);
    if (newIds.length) {
      try { localStorage.setItem(`clarification-announced:${projectId}`, JSON.stringify([...seen])); } catch { /* Session fallback above. */ }
      const first = pendingQuestions.find(question => question.question_id === newIds[0]);
      setAnnouncement(newIds.length > 1 ? `${newIds.length} clarifications need your review.`
        : `Clarification needed. ${sanitizeUiCopy(first?.study_title ?? "")}. ${sanitizeUiCopy(first?.question_text ?? "")}`);
    }
    const pending = new Set(pendingQuestions.map(question => question.question_id));
    setToastQueue(previous => {
      if (isDrawerOpen) return previous.length ? [] : previous;
      const next = previous.map(batch => batch.filter(id => pending.has(id))).filter(batch => batch.length);
      if (newIds.length) next.push(newIds);
      return next;
    });
  }, [pendingQuestions, pendingLoaded, projectId, isDrawerOpen]);

  const minimizeToast = useCallback(() => setToastQueue(previous => previous.slice(1)), []);
  const activeToast = (toastQueue[0] ?? []).flatMap(id => {
    const question = pendingQuestions.find(question => question.question_id === id);
    return question ? [question] : [];
  });

  // Keep keyboard focus inside the manually opened inbox, then return it to its trigger.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousFocus = document.activeElement;
    inboxRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      // The screening page listens on window; inbox keystrokes belong to this dialog.
      event.stopPropagation();
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab") return;
      const controls = inboxRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === inboxRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isDrawerOpen, setDrawerOpen]);

  // Drawer list filtered by tab and stage
  const drawerList = useMemo(() => {
    const list = activeDrawerTab === "pending" ? pendingQuestions : allQuestions.filter((q) => q.status === "answered");
    if (stageFilter === "all") return list;
    return list.filter((q) => q.stage === stageFilter);
  }, [activeDrawerTab, pendingQuestions, allQuestions, stageFilter]);

  if (!projectId) return null;

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {!isDrawerOpen && activeToast.length > 0 && (
        <ClarificationToast key={toastQueue[0][0]} questions={activeToast} onMinimize={minimizeToast}
          onReview={() => { setToastQueue([]); setDrawerOpen(true); }} />
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. SLIDE-IN INBOX DRAWER (Full Project Clarification Review)
          ───────────────────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div className="clarification-inbox fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop overlay */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div ref={inboxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="clarification-inbox-title" id="clarification-inbox" className="clarification-inbox-panel w-screen max-w-lg flex flex-col">
              {/* Drawer Header */}
              <div className="px-6 py-4 border-b border-black/[0.08] flex items-center justify-between bg-[#fbf9f4] sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                  <div className="text-[#3a0f34] flex items-center justify-center">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="clarification-inbox-title" className="font-serif font-semibold text-base text-[#3a0f34]">
                      Clarification Inbox
                    </h2>
                    <p className="text-[11px] text-[#62535d]">
                      Human-in-the-loop decisions for Co-Scientist screening ambiguity
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close clarification inbox"
                  className="p-1.5 rounded-full text-[#62535d] hover:text-[#3a0f34] hover:bg-black/5 transition-colors"
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
                        ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                        : "text-[#62535d] hover:text-[#3a0f34] hover:bg-black/5"
                    )}
                  >
                    <span>Pending</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#3a0f34] text-white font-sans font-bold">
                      {pendingQuestions.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveDrawerTab("answered")}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium transition-all",
                      activeDrawerTab === "answered"
                        ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                        : "text-[#62535d] hover:text-[#3a0f34] hover:bg-black/5"
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
                        "px-2 py-0.5 rounded text-[10px] font-sans uppercase transition-colors",
                        stageFilter === stg
                          ? "bg-[#eee7ec] text-[#3a0f34] font-bold border border-[#d2c2cb]"
                          : "text-[#62535d] hover:bg-black/5"
                      )}
                    >
                      {stg}
                    </button>
                  ))}
                </div>
              </div>

              {answerMutation.isError && <p role="alert" className="clarification-save-error">Your answer could not be saved. The question is still pending. Please try again.</p>}
              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {drawerList.length === 0 ? (
                  <div className="text-center py-16 text-[#62535d]">
                    <CheckCircle2 className="h-10 w-10 text-[#3a0f34] mx-auto mb-2" />
                    <p className="font-serif text-sm font-medium text-[#3a0f34]">
                      {activeDrawerTab === "pending"
                        ? "All screening clarifications resolved!"
                        : "No answered clarifications yet."}
                    </p>
                    <p className="text-xs text-[#62535d] mt-1">
                      {activeDrawerTab === "pending"
                        ? "Questions stay here until you answer them."
                        : "Answered questions will be preserved here."}
                    </p>
                  </div>
                ) : (
                  drawerList.map((q) => {
                    const isExpanded = expandedExcerpts.has(q.question_id);
                    const curSelected = selectedOptions[q.question_id] || "";
                    const isSubmitting = answerMutation.isPending && answerMutation.variables?.questionId === q.question_id;

                    return (
                      <div
                        key={q.question_id}
                        className={cn(
                          "rounded-sm border p-4 bg-white shadow-xs transition-all",
                          q.status === "answered"
                            ? "border-[#d2c2cb] bg-[#eee7ec]"
                            : "border-black/[0.08] hover:border-black/20"
                        )}
                      >
                        {/* Meta Tags */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-sans uppercase font-bold bg-black/[0.05] text-[#62535d]">
                              {q.stage}
                            </span>
                            {q.pico_aspect && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]">
                                PICO: {q.pico_aspect}
                              </span>
                            )}
                            {q.status === "answered" && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eee7ec] text-[#3a0f34] flex items-center gap-1">
                                <Check className="h-3 w-3" /> Resolved
                              </span>
                            )}
                          </div>
                          {q.ai_interim_confidence != null && (
                            <span className="text-[10px] text-[#62535d] font-sans">
                              Confidence: {Math.round(q.ai_interim_confidence * 100)}%
                            </span>
                          )}
                        </div>

                        {/* Study Title with Link */}
                        <Link
                          to={`/projects/${projectId}/screening`}
                          className="font-serif font-semibold text-xs text-[#3a0f34] hover:underline block mb-1.5"
                        >
                          {sanitizeUiCopy(q.study_title || `Study ${q.study_id}`)}
                        </Link>

                        {/* Question Text */}
                        <p className="text-xs font-medium text-[#3a0f34] leading-relaxed mb-3">
                          {sanitizeUiCopy(q.question_text)}
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
                              className="text-[11px] text-[#3a0f34] hover:text-[#814d75] font-medium flex items-center gap-1 mb-1"
                            >
                              <span>{isExpanded ? "Hide context excerpt" : "View context excerpt"}</span>
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="text-[11px] text-[#62535d] bg-[#eee7ec] border border-[#d2c2cb] rounded-sm p-3 font-serif italic">
                                "{sanitizeUiCopy(q.context_excerpt)}"
                              </div>
                            )}
                          </div>
                        )}

                        {/* If Answered: Display Resolution Summary */}
                        {q.status === "answered" ? (
                          <div className="p-3 rounded-sm bg-[#eee7ec] border border-[#d2c2cb] text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-[#3a0f34]">
                                Recorded Answer: {sanitizeUiCopy(q.answer_label || q.answer || "")}
                              </span>
                              {q.final_decision && (
                                <span className="font-sans text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#eee7ec] text-[#3a0f34] uppercase">
                                  {q.final_decision}
                                </span>
                              )}
                            </div>
                            {q.final_reason_text && (
                              <p className="text-[11px] text-[#3a0f34] italic mt-0.5">
                                {sanitizeUiCopy(q.final_reason_text)}
                              </p>
                            )}
                            <div className="text-[10px] text-[#3a0f34] mt-1 font-sans">
                              By {q.answered_by || "Reviewer"} {q.answered_at ? `at ${new Date(q.answered_at).toLocaleTimeString()}` : ""}
                            </div>
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
                                      "flex items-start gap-2.5 p-2 rounded-sm border text-xs cursor-pointer transition-all",
                                      isChecked
                                        ? "bg-[#eee7ec] border-[#d2c2cb] font-medium"
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
                                      className="mt-0.5 text-[#3a0f34] focus:ring-[#814d75]"
                                    />
                                    <div className="flex-1">
                                      <div className="text-[#3a0f34]">{sanitizeUiCopy(opt.label)}</div>
                                      {opt.description && (
                                        <div className="text-[10px] text-[#62535d] mt-0.5">
                                          {sanitizeUiCopy(opt.description)}
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

// Project identity owns all transient state; announcements themselves survive navigation/reload.
export function ClarificationNotificationCenter(props: ClarificationNotificationCenterProps) {
  return <ProjectClarificationNotificationCenter key={props.projectId ?? "none"} {...props} />;
}
