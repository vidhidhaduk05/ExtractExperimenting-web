import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RobDomainJudgment, type RobSignalingAnswer, API_BASE } from "../lib/api";
import {
  ArrowLeft, ShieldCheck, Sparkles, CheckCircle,
  ChevronDown, ChevronRight, Loader2, Trash2,
} from "lucide-react";
import { judgmentColor, judgmentLabel, judgmentDotColor, cn } from "../lib/utils";

export function RobAssessmentPage() {
  const { projectId, assessmentId } = useParams<{ projectId: string; assessmentId: string }>();
  const queryClient = useQueryClient();


  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [prefillMsg, setPrefillMsg] = useState("");

    const autoAssessMutation = useMutation({
    mutationFn: () => {
      const sId = assessment?.study_id;
      const tId = (assessment as any)?.tool_id || 'rob2';
      return fetch(`${API_BASE}/rob/projects/${projectId}/studies/${sId}/auto-assess?tool_id=${tId}`, { method: 'POST' }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rob-assessment', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['rob-summary', projectId] });
    }
  });

  const { data: assessment, isLoading } = useQuery({
    queryKey: ["rob-assessment", assessmentId],
    queryFn: () => api.getAssessment(assessmentId!),
    enabled: !!assessmentId,
  });

  const { data: study } = useQuery({
    queryKey: ["study", assessment?.study_id],
    queryFn: () => api.getStudy(assessment!.study_id),
    enabled: !!assessment?.study_id,
  });

  const prefillMutation = useMutation({
    mutationFn: () =>
      api.aiPrefill(assessmentId!, study?.abstract || "", ""),
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

  const acceptAiMutation = useMutation({
    mutationFn: () => api.acceptAi(assessmentId!),
    onSuccess: (result) => {
      setPrefillMsg(`Accepted ${result.answers_accepted} AI-suggested answers. Domain and overall judgments recomputed.`);
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
    onError: (e: Error) => setPrefillMsg(`Error: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAssessment(assessmentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
      window.location.href = `/projects/${projectId}/rob`;
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ answerId, answer }: { answerId: string; answer: string }) =>
      api.updateAnswer(answerId, { answer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-assessment", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
  });

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

  if (isLoading) return <div className="p-8 text-gray-400">Loading assessment...</div>;
  if (!assessment) return <div className="p-8 text-gray-400">Assessment not found.</div>;

  const toolDef = assessment.tool_definition;
  const hasAiSuggestions = assessment.domain_judgments.some((dj) =>
    dj.signaling_answers.some((sa) => sa.ai_answer)
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to={`/projects/${projectId}/rob`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to RoB summary
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-phylo-blue" />
            {toolDef?.full_name || assessment.tool}
          </h1>
          {study && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{study.title}</p>
          )}
          {assessment.outcome_label && (
            <p className="text-gray-400 text-xs mt-1">Outcome: {assessment.outcome_label}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => deleteMutation.mutate()}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Delete assessment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Overall Judgment Banner */}
      <div
        className="rounded-lg p-4 mb-6 flex items-center justify-between"
        style={{ backgroundColor: `${judgmentDotColor(assessment.overall_judgment)}20` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-bold text-white"
            style={{ backgroundColor: judgmentDotColor(assessment.overall_judgment) }}
          >
            {judgmentLabel(assessment.overall_judgment)}
          </span>
          <span className="text-sm text-gray-600">Overall Risk of Bias</span>
        </div>
        {assessment.ai_prefilled === 1 && (
          <span className="badge bg-phylo-orange/10 text-phylo-orange">
            <Sparkles className="h-3 w-3 mr-0.5" /> AI-assisted
          </span>
        )}
      </div>

      {/* AI Actions */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">AI Assistance</h2>
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
              Run AI Pre-fill
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
        {!hasAiSuggestions && !prefillMsg && (
          <p className="text-xs text-gray-400">
            Run AI pre-fill to get suggested answers for signaling questions based on the study abstract.
            Then review and accept or override each suggestion.
          </p>
        )}
      </div>

      {/* Domain Sections */}
      <div className="space-y-3">
        {assessment.domain_judgments.map((dj) => {
          const domainDef = toolDef?.domains.find((d) => d.key === dj.domain_key);
          const isExpanded = expandedDomains.has(dj.domain_key);
          const allVerified = dj.signaling_answers.every((sa) => sa.human_verified === 1);

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
                  {allVerified && (
                    <CheckCircle className="h-3.5 w-3.5 text-phylo-green" />
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

                  {/* Applicability (if applicable) */}
                  {domainDef.has_applicability && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Applicability
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
        })}
      </div>
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

  return (
    <div className={cn("rounded-md border p-3", isActive ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-700">{questionText}</span>
            {isConditional && (
              <span className="text-xs text-gray-400 italic">
                (conditional: if {parentKey} = {triggerAnswers?.join("/")})
              </span>
            )}
            {answer.human_verified === 1 && (
              <CheckCircle className="h-3 w-3 text-phylo-green shrink-0" />
            )}
          </div>

          {/* AI Suggestion */}
          {hasAi && (
            <div className="mt-2 rounded-md bg-phylo-orange/5 border border-phylo-orange/20 p-2">
              <div className="flex items-center gap-1.5 text-xs text-phylo-orange mb-1">
                <Sparkles className="h-3 w-3" />
                <span className="font-medium">AI suggests: {formatAnswer(answer.ai_answer)}</span>
                <span className="text-gray-400 ml-1">({confidencePct}% confidence)</span>
              </div>
              {answer.ai_quote && (
                <div className="text-xs text-gray-500 italic pl-4 border-l-2 border-phylo-orange/20">
                  "{answer.ai_quote}"
                  {answer.ai_page && <span className="text-gray-400 ml-1">(p.{answer.ai_page})</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Answer Selector */}
        <div className="shrink-0 w-[160px]">
          <select
            className="input text-xs py-1"
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
              className="text-xs text-phylo-blue hover:underline mt-1 block"
            >
              Accept AI suggestion
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
  };
  return labels[val] || val;
}
