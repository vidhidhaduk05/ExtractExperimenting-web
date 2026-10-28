import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  api,
  type ClarificationQuestion,
  type ClarificationAnswerResponse,
} from "../../lib/api";
import {
  Shield,
  HelpCircle,
  CheckCircle2,
  Send,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface ClarificationSidePanelProps {
  projectId?: string;
  selectedStudyId?: string | null;
  onSelectStudy?: (studyId: string) => void;
}

export function ClarificationSidePanel({
  projectId,
  selectedStudyId,
  onSelectStudy,
}: ClarificationSidePanelProps) {
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<"pending" | "answered" | "all">("pending");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [expandedExcerpts, setExpandedExcerpts] = useState<Set<string>>(new Set());
  const [successFeedback, setSuccessFeedback] = useState<Record<string, ClarificationAnswerResponse>>({});

  // Query clarifications for this project
  const { data: questions = [], isLoading } = useQuery<ClarificationQuestion[]>({
    queryKey: ["all-clarifications", projectId, filterMode],
    queryFn: () => {
      if (!projectId) return Promise.resolve([]);
      if (filterMode === "all") return api.listClarifications(projectId);
      return api.listClarifications(projectId, filterMode);
    },
    enabled: !!projectId,
    refetchInterval: 6000,
  });

  // Query pending count specifically for badge
  const { data: pendingQuestions = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["pending-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId, "pending") : Promise.resolve([])),
    enabled: !!projectId,
    refetchInterval: 6000,
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
      queryClient.invalidateQueries({ queryKey: ["pending-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["all-clarifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["study", result.study_id] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
    },
  });

  const toggleExcerpt = (id: string) => {
    setExpandedExcerpts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectOption = (questionId: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = (q: ClarificationQuestion) => {
    const selected = selectedOptions[q.question_id] || "yes";
    const customText = customAnswers[q.question_id] || "";
    const matchedOpt = q.options?.find((o) => o.value === selected);
    const label = matchedOpt ? matchedOpt.label : selected === "other" ? customText || "Other" : selected;

    answerMutation.mutate({
      questionId: q.question_id,
      answer: selected === "other" ? customText || "other" : selected,
      answerLabel: label,
      answerFreetext: selected === "other" ? customText : undefined,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#fbf9f4] text-xs">
      {/* Subheader Filter Bar */}
      <div className="p-3 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-[#814d75]" />
          <span className="font-semibold text-[#3a0f34]">Clarification Inquiries</span>
        </div>
        <div className="inline-flex rounded-md border border-[#d2c2cb] bg-[#ffffff] p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setFilterMode("pending")}
            className={cn(
              "px-2 py-0.5 rounded font-medium transition-colors",
              filterMode === "pending"
                ? "bg-[#3a0f34] text-[#fbf9f4]"
                : "text-[#62535d] hover:text-[#3a0f34]"
            )}
          >
            Pending ({pendingQuestions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("answered")}
            className={cn(
              "px-2 py-0.5 rounded font-medium transition-colors",
              filterMode === "answered"
                ? "bg-[#3a0f34] text-[#fbf9f4]"
                : "text-[#62535d] hover:text-[#3a0f34]"
            )}
          >
            Answered
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={cn(
              "px-2 py-0.5 rounded font-medium transition-colors",
              filterMode === "all"
                ? "bg-[#3a0f34] text-[#fbf9f4]"
                : "text-[#62535d] hover:text-[#3a0f34]"
            )}
          >
            All
          </button>
        </div>
      </div>

      {/* Questions Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#814d75] gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p className="text-xs">Loading clarification questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="py-12 px-4 text-center text-[#62535d] space-y-2">
            <HelpCircle className="w-8 h-8 mx-auto text-[#814d75]/60" />
            <p className="font-serif font-bold text-sm text-[#3a0f34]">
              {filterMode === "pending" ? "Zero Pending Clarifications" : "No Clarifications Found"}
            </p>
            <p className="text-[11px] leading-relaxed max-w-[280px] mx-auto text-[#81737b]">
              {filterMode === "pending"
                ? "The Co-Scientist screener has resolved all borderline studies or is awaiting fresh batches."
                : "No clarification records match the selected filter."}
            </p>
          </div>
        ) : (
          questions.map((q) => {
            const isAnswered = q.status === "answered";
            const feedback = successFeedback[q.question_id];
            const isSubmitting =
              answerMutation.isPending &&
              (answerMutation.variables as { questionId?: string })?.questionId === q.question_id;
            const currentSelected = selectedOptions[q.question_id] ?? "yes";
            const isExcerptExpanded = expandedExcerpts.has(q.question_id);
            const isTargetStudy = selectedStudyId && q.study_id === selectedStudyId;

            return (
              <div
                key={q.question_id}
                className={cn(
                  "bg-[#ffffff] border rounded-xl p-3.5 space-y-3 transition-all shadow-xs",
                  isTargetStudy
                    ? "border-[#3a0f34] ring-1 ring-[#3a0f34]"
                    : "border-[#d2c2cb] hover:border-[#814d75]/60"
                )}
              >
                {/* Header matching Screenshot 1 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-3.5 h-3.5 fill-[#fbf9f4]/20" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#3a0f34] leading-tight">
                        Co-Scientist Clarification Request
                      </h4>
                      <p className="text-[10px] text-[#62535d] leading-snug">
                        Ambiguous eligibility against PICO criteria &bull; Human clarification needed
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider",
                      isAnswered
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-[#ffdea6] text-[#3a0f34] border-[#d2c2cb]"
                    )}
                  >
                    {isAnswered ? "Resolved" : "Awaiting Clarification"}
                  </span>
                </div>

                {/* Target Study Link (Click to open abstract in Screening workspace) */}
                {q.study_title && (
                  <div className="text-[11px] font-medium text-[#4f444b] border-t border-[#d2c2cb]/50 pt-2 flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectStudy) {
                          onSelectStudy(q.study_id);
                        }
                        // Dispatch global event so ScreeningPage immediately selects this study & displays its abstract
                        window.dispatchEvent(
                          new CustomEvent("select-study-abstract", {
                            detail: { studyId: q.study_id },
                          })
                        );
                      }}
                      className="text-left font-serif hover:text-[#3a0f34] hover:underline line-clamp-2 text-[#3a0f34] font-bold cursor-pointer group flex items-center gap-1.5"
                      title="Click to view and open this study's abstract"
                    >
                      <span className="group-hover:text-[#814d75] transition-colors">{q.study_title}</span>
                      <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0 text-[#814d75]" />
                    </button>
                  </div>
                )}

                {/* Question Text Box (Screenshot 1: White Card with Rounded Border) */}
                <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-[#3a0f34] leading-snug">
                    {q.question_text}
                  </p>

                  {/* Excerpt with Show More toggle */}
                  {q.context_excerpt && (
                    <div className="text-[11px] text-[#4f444b] bg-[#ffffff] p-2 rounded border border-[#d2c2cb]/80 italic relative">
                      <p className={cn("leading-relaxed", !isExcerptExpanded && "line-clamp-3")}>
                        Excerpt: &ldquo;{q.context_excerpt}&rdquo;
                      </p>
                      {q.context_excerpt.length > 140 && (
                        <button
                          type="button"
                          onClick={() => toggleExcerpt(q.question_id)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-[#814d75] font-semibold hover:underline not-italic"
                        >
                          {isExcerptExpanded ? (
                            <>
                              <span>Show less</span>
                              <ChevronUp className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              <span>Show full excerpt</span>
                              <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Multiple Choice Radio List */}
                  {!isAnswered ? (
                    <div className="space-y-2 pt-1">
                      <div className="space-y-1.5 font-sans">
                        {q.options && q.options.length > 0 ? (
                          q.options.map((opt) => (
                            <label
                              key={opt.value}
                              className={cn(
                                "flex items-start gap-2.5 p-1.5 rounded cursor-pointer transition-colors border",
                                currentSelected === opt.value
                                  ? "bg-[#ffffff] border-[#3a0f34]/40 font-medium text-[#3a0f34]"
                                  : "bg-transparent border-transparent text-[#4f444b] hover:bg-black/[0.02]"
                              )}
                            >
                              <input
                                type="radio"
                                name={`dock-opt-${q.question_id}`}
                                value={opt.value}
                                checked={currentSelected === opt.value}
                                onChange={() => handleSelectOption(q.question_id, opt.value)}
                                className="mt-0.5 text-[#3a0f34] accent-[#3a0f34] focus:ring-[#814d75]"
                              />
                              <span className="text-xs leading-snug">{opt.label}</span>
                            </label>
                          ))
                        ) : (
                          <>
                            <label className="flex items-center gap-2 text-xs text-[#4f444b] cursor-pointer">
                              <input
                                type="radio"
                                name={`dock-opt-${q.question_id}`}
                                value="yes"
                                checked={currentSelected === "yes"}
                                onChange={() => handleSelectOption(q.question_id, "yes")}
                                className="text-[#3a0f34] accent-[#3a0f34]"
                              />
                              <span>Yes, matches</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[#4f444b] cursor-pointer">
                              <input
                                type="radio"
                                name={`dock-opt-${q.question_id}`}
                                value="no"
                                checked={currentSelected === "no"}
                                onChange={() => handleSelectOption(q.question_id, "no")}
                                className="text-[#3a0f34] accent-[#3a0f34]"
                              />
                              <span>No, does not match</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[#4f444b] cursor-pointer">
                              <input
                                type="radio"
                                name={`dock-opt-${q.question_id}`}
                                value="partial"
                                checked={currentSelected === "partial"}
                                onChange={() => handleSelectOption(q.question_id, "partial")}
                                className="text-[#3a0f34] accent-[#3a0f34]"
                              />
                              <span>Partially matches</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[#4f444b] cursor-pointer">
                              <input
                                type="radio"
                                name={`dock-opt-${q.question_id}`}
                                value="unsure"
                                checked={currentSelected === "unsure"}
                                onChange={() => handleSelectOption(q.question_id, "unsure")}
                                className="text-[#3a0f34] accent-[#3a0f34]"
                              />
                              <span>Unsure</span>
                            </label>
                          </>
                        )}

                        {/* Other (specify below) */}
                        <label
                          className={cn(
                            "flex items-start gap-2.5 p-1.5 rounded cursor-pointer transition-colors border",
                            currentSelected === "other"
                              ? "bg-[#ffffff] border-[#3a0f34]/40 font-medium text-[#3a0f34]"
                              : "bg-transparent border-transparent text-[#4f444b] hover:bg-black/[0.02]"
                          )}
                        >
                          <input
                            type="radio"
                            name={`dock-opt-${q.question_id}`}
                            value="other"
                            checked={currentSelected === "other"}
                            onChange={() => handleSelectOption(q.question_id, "other")}
                            className="mt-0.5 text-[#3a0f34] accent-[#3a0f34] focus:ring-[#814d75]"
                          />
                          <span className="text-xs leading-snug">Other (specify below)</span>
                        </label>

                        {currentSelected === "other" && (
                          <input
                            type="text"
                            placeholder="Enter specific clarification or rule..."
                            value={customAnswers[q.question_id] || ""}
                            onChange={(e) =>
                              setCustomAnswers((prev) => ({
                                ...prev,
                                [q.question_id]: e.target.value,
                              }))
                            }
                            className="w-full text-xs p-2 rounded border border-[#d2c2cb] bg-[#ffffff] text-[#3a0f34] focus:outline-none focus:border-[#814d75] focus:ring-1 focus:ring-[#814d75]"
                          />
                        )}
                      </div>

                      {/* Submit Action Button matching Screenshot 1 */}
                      <button
                        type="button"
                        onClick={() => handleSubmit(q)}
                        disabled={isSubmitting}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs shadow-xs transition-colors",
                          "bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] disabled:opacity-50"
                        )}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Re-Evaluating Study...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5 rotate-45" />
                            <span>Submit Answer &amp; Re-Evaluate Study</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* Answered Record */
                    <div className="bg-[#ffffff] border border-emerald-200 rounded p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Clarified: {q.answer_label || q.answer}</span>
                      </div>
                      {q.answer_freetext && (
                        <p className="text-[10px] text-[#62535d] italic">
                          Notes: {q.answer_freetext}
                        </p>
                      )}
                      {q.answered_by && (
                        <p className="text-[9px] text-[#81737b]">
                          By: {q.answered_by} &bull; {q.answered_at ? new Date(q.answered_at).toLocaleTimeString() : "recently"}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Immediate Feedback Notification */}
                  {feedback && (
                    <div className="bg-emerald-50 border border-emerald-300 rounded p-2 text-[11px] text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">Answer recorded &amp; Study Re-evaluated</p>
                        <p className="text-[10px] text-emerald-800">
                          Status: <span className="font-bold uppercase">{feedback.study_status}</span>
                          {feedback.ai_decision && (
                            <> &bull; Co-Scientist Decision: <span className="font-bold uppercase">{feedback.ai_decision}</span></>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
