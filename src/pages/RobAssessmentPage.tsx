import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type RobDomainJudgment,
  type RobSignalingAnswer,
  type RobToolDef,
  API_BASE,
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
  Layers,
  HelpCircle,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { judgmentColor, judgmentLabel, judgmentDotColor, cn } from "../lib/utils";

export function RobAssessmentPage() {
  const { projectId, assessmentId } = useParams<{ projectId: string; assessmentId: string }>();
  const queryClient = useQueryClient();

  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [prefillMsg, setPrefillMsg] = useState("");
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [selectedNewTool, setSelectedNewTool] = useState("");

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

  useEffect(() => {
    if (assessment?.tool && !selectedNewTool) {
      setSelectedNewTool(assessment.tool);
    }
  }, [assessment?.tool, selectedNewTool]);

  // Pre-fill mutation
  const prefillMutation = useMutation({
    mutationFn: () => api.aiPrefill(assessmentId!, study?.abstract || "", ""),
    onSuccess: (result) => {
      setPrefillMsg(
        `AI pre-filled ${result.questions_prefilled} questions across ${result.domains_prefilled} domains ` +
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
        `Accepted ${result.answers_accepted} AI-suggested answers. Domain and overall judgments recomputed.`
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

  // When Review Mode is toggled on, auto-expand all domains that have flagged questions
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

  if (isLoading) return <div className="p-8 text-gray-400">Loading assessment...</div>;
  if (!assessment) return <div className="p-8 text-gray-400">Assessment not found.</div>;

  const toolDef = assessment.tool_definition;
  const hasAiSuggestions = assessment.domain_judgments.some((dj) =>
    dj.signaling_answers.some((sa) => sa.ai_answer)
  );

  // Compute NOS Star scores if using NOS tool
  const isNosTool = assessment.tool === "nos";
  const nosStars = isNosTool
    ? assessment.domain_judgments.map((dj) => {
        // Count 'yes' answers in signaling questions
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
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        to={`/projects/${projectId}/rob`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-3 w-3" /> Back to RoB summary
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-phylo-blue" />
              {toolDef?.full_name || assessment.tool.toUpperCase()}
            </h1>
            <button
              onClick={() => setShowToolModal(true)}
              className="text-xs px-2.5 py-1 rounded-lg border border-black/10 bg-white hover:bg-black/5 text-[#6B665E] flex items-center gap-1 font-medium transition-colors shadow-2xs"
              title="Change assessment tool"
            >
              <Settings2 className="h-3 w-3" />
              <span>Change Tool</span>
            </button>
          </div>

          {study && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{study.title}</p>
          )}
          {assessment.outcome_label && (
            <p className="text-gray-400 text-xs mt-1">Outcome: {assessment.outcome_label}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Review Mode Toggle Switch */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-black/[0.08] shadow-2xs">
            <label className="text-xs font-medium text-[#141413] flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isReviewMode}
                onChange={(e) => setIsReviewMode(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
              />
              <span>Review Mode (Flagged Only)</span>
            </label>
            {flaggedCount > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                {flaggedCount}
              </span>
            )}
          </div>

          <button
            onClick={() => deleteMutation.mutate()}
            className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            title="Delete assessment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Review Mode Active Banner */}
      {isReviewMode && (
        <div className="p-3.5 mb-6 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Review Mode Active:</strong> Showing {flaggedCount} questions where AI confidence is below 70%.
              Answering a question automatically marks it confirmed and clears the flag.
            </span>
          </div>
          <button
            onClick={() => setIsReviewMode(false)}
            className="text-amber-800 hover:underline font-semibold text-xs shrink-0 ml-4"
          >
            Exit Review Mode
          </button>
        </div>
      )}

      {/* Tool-Specific Highlights */}
      {isNosTool && (
        <div className="card p-4 mb-6 bg-amber-50/30 border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              Newcastle-Ottawa Scale (NOS) Rating
            </span>
            <span className="font-serif font-bold text-sm text-amber-950">
              {totalNosStars} / 9 Stars — {totalNosStars >= 7 ? "Good Quality" : totalNosStars >= 5 ? "Fair Quality" : "Poor Quality"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-amber-900 pt-1 border-t border-amber-200/50">
            {nosStars.map((ns) => (
              <div key={ns.domain_key} className="flex items-center justify-between bg-white/70 p-2 rounded-lg">
                <span className="font-medium text-xs">{ns.label}</span>
                <span className="font-mono font-bold text-amber-700">{"★".repeat(ns.stars)}{"☆".repeat(Math.max(0, 4 - ns.stars))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Judgment Banner */}
      <div
        className="rounded-xl p-4 mb-6 flex items-center justify-between"
        style={{ backgroundColor: `${judgmentDotColor(assessment.overall_judgment)}20` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-2xs"
            style={{ backgroundColor: judgmentDotColor(assessment.overall_judgment) }}
          >
            {judgmentLabel(assessment.overall_judgment)}
          </span>
          <div>
            <div className="text-sm font-semibold text-gray-800">Overall Risk of Bias</div>
            <div className="text-xs text-gray-500">
              Computed deterministically from domain judgments using {toolDef?.name || assessment.tool} rules
            </div>
          </div>
        </div>
        {assessment.ai_prefilled === 1 && (
          <span className="badge bg-phylo-orange/10 text-phylo-orange">
            <Sparkles className="h-3 w-3 mr-0.5" /> AI-assisted
          </span>
        )}
      </div>

      {/* AI Actions */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">AI Signaling Pre-fill</h2>
            <span className="text-[11px] text-[#6B665E]">
              Confidence threshold: 70% (lower values flagged for review)
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => prefillMutation.mutate()}
              disabled={prefillMutation.isPending}
              className="btn-secondary text-xs"
            >
              {prefillMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Re-run AI Pre-fill
            </button>
            {hasAiSuggestions && (
              <button
                onClick={() => acceptAiMutation.mutate()}
                disabled={acceptAiMutation.isPending}
                className="btn-primary text-xs"
              >
                {acceptAiMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                Accept All AI
              </button>
            )}
          </div>
        </div>
        {prefillMsg && (
          <div className="text-xs text-gray-600 bg-phylo-cream/30 rounded-md px-3 py-2">
            {prefillMsg}
          </div>
        )}
      </div>

      {/* Domain Sections */}
      <div className="space-y-3">
        {displayedDomainJudgments.length === 0 && isReviewMode ? (
          <div className="card p-12 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="font-semibold text-sm">All Flagged Questions Resolved!</h3>
            <p className="text-xs text-gray-500 mt-1">
              There are no low-confidence questions remaining for this assessment.
            </p>
            <button
              onClick={() => setIsReviewMode(false)}
              className="btn-primary text-xs mt-3 mx-auto"
            >
              View Full Assessment
            </button>
          </div>
        ) : (
          displayedDomainJudgments.map((dj) => {
            const domainDef = toolDef?.domains.find((d) => d.key === dj.domain_key);
            const isExpanded = expandedDomains.has(dj.domain_key);
            const allVerified = dj.signaling_answers.every((sa) => sa.human_verified === 1);
            const flaggedInDomain = dj.signaling_answers.filter(
              (sa) => sa.needs_human_review === 1
            ).length;

            return (
              <div key={dj.judgment_id} className="card overflow-hidden">
                {/* Domain Header */}
                <button
                  onClick={() => toggleDomain(dj.domain_key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="font-semibold text-sm">{dj.domain_label}</span>
                    {flaggedInDomain > 0 ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {flaggedInDomain} needs review
                      </span>
                    ) : (
                      allVerified && <CheckCircle className="h-3.5 w-3.5 text-phylo-green" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dj.ai_suggested && (
                      <span className="text-xs text-phylo-orange flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                    <DomainJudgmentSelect
                      judgment={dj}
                      judgmentOptions={toolDef?.judgment_options || []}
                      onChange={(val) =>
                        judgmentMutation.mutate({ judgmentId: dj.judgment_id, riskJudgment: val })
                      }
                    />
                  </div>
                </button>

                {/* Domain Body */}
                {isExpanded && domainDef && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50/30">
                    {/* Signaling Questions */}
                    {domainDef.signaling_questions.map((sq) => {
                      const answer = dj.signaling_answers.find((a) => a.question_key === sq.key);
                      if (!answer) return null;

                      // In review mode, hide questions that don't need review
                      if (isReviewMode && answer.needs_human_review !== 1) {
                        return null;
                      }

                      // Check conditional logic
                      const isConditional = sq.parent_key && sq.trigger_answers;
                      let isActive = true;
                      if (isConditional && sq.parent_key && sq.trigger_answers) {
                        const parentAnswer = dj.signaling_answers.find(
                          (a) => a.question_key === sq.parent_key
                        );
                        isActive = parentAnswer
                          ? sq.trigger_answers.includes(parentAnswer.answer)
                          : false;
                      }

                      return (
                        <SignalingQuestion
                          key={answer.answer_id}
                          answer={answer}
                          questionText={sq.text}
                          responseOptions={sq.response_options}
                          isConditional={!!isConditional}
                          isActive={isActive}
                          parentKey={sq.parent_key}
                          triggerAnswers={sq.trigger_answers}
                          onAnswerChange={(val) =>
                            answerMutation.mutate({
                              answerId: answer.answer_id,
                              answer: val,
                            })
                          }
                        />
                      );
                    })}

                    {/* Support Text */}
                    {!isReviewMode && (
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Support / Justification
                        </label>
                        <textarea
                          className="input text-xs min-h-[60px]"
                          defaultValue={dj.support_text}
                          placeholder="Notes supporting this judgment..."
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

                    {/* Applicability (if applicable, e.g. QUADAS-2) */}
                    {!isReviewMode && domainDef.has_applicability && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Applicability Concerns
                        </label>
                        <select
                          className="input text-xs max-w-[200px]"
                          defaultValue={dj.applicability || ""}
                          onChange={(e) =>
                            judgmentMutation.mutate({
                              judgmentId: dj.judgment_id,
                              riskJudgment: dj.risk_judgment,
                              applicability: e.target.value,
                            })
                          }
                        >
                          <option value="">Not assessed</option>
                          <option value="low">Low concern</option>
                          <option value="high">High concern</option>
                          <option value="unclear">Unclear</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
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
          "rounded-md border-0 px-2 py-1 text-xs font-medium text-white cursor-pointer outline-none",
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

function SignalingQuestion({
  answer,
  questionText,
  responseOptions,
  isConditional,
  isActive,
  parentKey,
  triggerAnswers,
  onAnswerChange,
}: {
  answer: RobSignalingAnswer;
  questionText: string;
  responseOptions: string[];
  isConditional: boolean;
  isActive: boolean;
  parentKey: string | null;
  triggerAnswers: string[] | null;
  onAnswerChange: (val: string) => void;
}) {
  const hasAi = answer.ai_answer && answer.ai_answer !== "";
  const confidencePct = Math.round((answer.ai_confidence || 0) * 100);
  const isFlagged = answer.needs_human_review === 1;

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 transition-all",
        isFlagged
          ? "border-amber-300 bg-amber-50/40 shadow-2xs"
          : isActive
          ? "border-gray-200 bg-white"
          : "border-gray-100 bg-gray-50 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-gray-800 leading-snug">{questionText}</span>
            {isFlagged && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-700" />
                Needs Review ({confidencePct}% conf &lt; 70%)
              </span>
            )}
            {isConditional && (
              <span className="text-[11px] text-gray-400 italic">
                (conditional: if {parentKey} = {triggerAnswers?.join("/")})
              </span>
            )}
            {answer.human_verified === 1 && !isFlagged && (
              <CheckCircle className="h-3.5 w-3.5 text-phylo-green shrink-0" />
            )}
          </div>

          {/* AI Suggestion */}
          {hasAi && (
            <div className="mt-2 rounded-lg bg-phylo-orange/5 border border-phylo-orange/20 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-phylo-orange mb-1">
                <Sparkles className="h-3 w-3" />
                <span className="font-semibold">AI Suggestion: {formatAnswer(answer.ai_answer)}</span>
                <span className="text-gray-400 font-mono text-[11px]">({confidencePct}% confidence)</span>
              </div>
              {answer.ai_quote && (
                <div className="text-xs text-gray-600 italic pl-3 border-l-2 border-phylo-orange/30 font-serif">
                  "{answer.ai_quote}"
                  {answer.ai_page && <span className="text-gray-400 ml-1 font-sans">(p.{answer.ai_page})</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Answer Selector */}
        <div className="shrink-0 w-[170px]">
          <select
            className={cn(
              "input text-xs py-1.5 w-full",
              isFlagged && "border-amber-400 focus:border-amber-500"
            )}
            value={answer.answer || ""}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={!isActive}
          >
            <option value="">— Select —</option>
            {responseOptions.map((opt) => (
              <option key={opt} value={opt}>
                {formatAnswer(opt)}
              </option>
            ))}
          </select>
          {hasAi && answer.answer === "" && (
            <button
              onClick={() => onAnswerChange(answer.ai_answer)}
              className="text-[11px] text-phylo-blue hover:underline mt-1.5 block font-medium"
            >
              Accept AI suggestion
            </button>
          )}
          {isFlagged && answer.answer && (
            <button
              onClick={() => onAnswerChange(answer.answer)}
              className="text-[11px] text-amber-800 hover:underline mt-1 block font-medium flex items-center gap-1"
            >
              <Check className="h-2.5 w-2.5" /> Confirm this answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatAnswer(val: string): string {
  const labels: Record<string, string> = {
    yes: "Yes",
    no: "No",
    unclear: "Unclear",
    probably_yes: "Probably yes",
    probably_no: "Probably no",
    no_information: "No information",
    low: "Low",
    high: "High",
  };
  return labels[val] || val;
}
