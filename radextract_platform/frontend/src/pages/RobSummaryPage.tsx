import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type RobSummary,
  type RobRunProgress,
} from "../lib/api";
import {
  ArrowLeft,
  ShieldCheck,
  Plus,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Square,
  Play,
  RotateCcw,
} from "lucide-react";
import { judgmentLabel, judgmentDotColor, cn } from "../lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";

export function RobSummaryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);

  // Fetch summary
  const { data: summary, isLoading } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.robSummary(projectId!),
    enabled: !!projectId,
  });

  // Fetch Batch RoB run progress (poll every 3s if running, 15s otherwise)
  const { data: robProgress } = useQuery<RobRunProgress | null>({
    queryKey: ["rob-run-progress", projectId],
    queryFn: () => (projectId ? api.getRobRunProgress(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 3000 : 15000;
    },
  });

  // Start Batch RoB Mutation
  const startRunMutation = useMutation({
    mutationFn: () => api.startRobRun(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-run-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
    onError: (err: any) => {
      alert(`Failed to start batch RoB: ${err.message}`);
    },
  });

  // Cancel Batch RoB Mutation
  const cancelRunMutation = useMutation({
    mutationFn: () => api.cancelRobRun(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rob-run-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["rob-summary", projectId] });
    },
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading risk-of-bias summary...</div>;

  const isRunning = robProgress?.status === "running";
  const pendingReviewCount = summary?.pending_human_review_count ?? 0;
  const needingReviewCount = summary?.assessments_needing_review_count ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-phylo-blue" />
            Risk of Bias
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {summary?.total_assessments || 0} assessments
            {summary?.tool && ` using ${summary.tool.toUpperCase().replace("-", "-")}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending || isRunning}
            className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-xs"
            title="Auto-assess unassessed included studies with AI full-text pre-fill"
          >
            {startRunMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting Batch...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Run Batch RoB
              </>
            )}
          </button>
          <Link to={`/projects/${projectId}/studies`} className="btn-secondary text-xs py-2 px-3">
            <Plus className="h-3.5 w-3.5" /> Add studies
          </Link>
        </div>
      </div>

      {/* Live Batch RoB Progress Banner */}
      {robProgress && isRunning && (
        <div className="card p-4.5 mb-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-amber-50 border border-purple-200 shadow-sm animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-purple-700 animate-spin" />
              <span className="font-serif font-semibold text-sm text-purple-950">
                Automated Batch RoB Assessment Running
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-200 text-purple-900">
                {robProgress.completed_studies} / {robProgress.total_studies} Studies
              </span>
            </div>
            <button
              onClick={() => cancelRunMutation.mutate()}
              disabled={cancelRunMutation.isPending}
              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 flex items-center gap-1 font-medium transition-colors"
            >
              <Square className="h-3 w-3" /> Stop Run
            </button>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-black/10 rounded-full h-2 overflow-hidden mb-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((robProgress.completed_studies || 0) /
                      Math.max(1, robProgress.total_studies || 1)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#6B665E]">
            <span>
              Auto-selecting design tool (RoB 2 / ROBINS-I / ROBINS-E / QUADAS-2 / NOS) & pre-filling questions...
            </span>
            {robProgress.flagged_questions_count > 0 && (
              <span className="text-amber-800 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                {robProgress.flagged_questions_count} questions flagged for human review (confidence &lt; 70%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter Toolbar & Human Review Pills */}
      {summary && (summary?.total_assessments ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-black/[0.08] mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B665E] font-medium">Filter Assessments:</span>
            <button
              onClick={() => setFilterNeedsReview(false)}
              className={cn(
                "text-xs px-3 py-1 rounded-lg font-medium transition-colors",
                !filterNeedsReview
                  ? "bg-[#141413] text-[#FAF9F3] shadow-xs"
                  : "text-[#6B665E] hover:bg-black/5"
              )}
            >
              All ({summary.total_assessments})
            </button>
            <button
              onClick={() => setFilterNeedsReview(true)}
              className={cn(
                "text-xs px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5",
                filterNeedsReview
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Pending Human Review</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-bold">
                {needingReviewCount || pendingReviewCount}
              </span>
            </button>
          </div>

          {(pendingReviewCount > 0 || needingReviewCount > 0) && (
            <span className="text-xs text-amber-800 font-serif italic flex items-center gap-1">
              ✦ {needingReviewCount || 1} studies have low-confidence questions (&lt; 70%) flagged for human review
            </span>
          )}
        </div>
      )}

      {summary && (summary?.total_assessments ?? 0) > 0 ? (
        <div className="space-y-6">
          {/* Judgment Distribution */}
          <JudgmentDistribution summary={summary} />

          {/* Traffic-Light Chart */}
          <TrafficLightChart summary={summary} filterNeedsReview={filterNeedsReview} />

          {/* Assessment List */}
          <AssessmentList summary={summary} filterNeedsReview={filterNeedsReview} />
        </div>
      ) : (
        <div className="card p-12 text-center">
          <ShieldCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No risk-of-bias assessments yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Screen studies as "included" at full-text, then use the "Run Batch RoB" button
            to automatically select tools and pre-fill signaling questions.
          </p>
          <button
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending}
            className="btn-primary text-xs mx-auto"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Run Batch RoB
          </button>
        </div>
      )}
    </div>
  );
}

function JudgmentDistribution({ summary }: { summary: RobSummary }) {
  const data = Object.entries(summary?.judgment_counts || {}).map(([key, count]) => ({
    name: judgmentLabel(key),
    key,
    count,
    fill: judgmentDotColor(key),
  }));

  if (data.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-4">Overall Judgment Distribution</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E2DA" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "#F5F3EC" }}
            contentStyle={{ borderRadius: "8px", border: "1px solid #E5E2DA", fontSize: "13px" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrafficLightChart({
  summary,
  filterNeedsReview,
}: {
  summary: RobSummary;
  filterNeedsReview?: boolean;
}) {
  const rawAssessments = Array.isArray(summary?.assessments) ? summary.assessments : [];
  const assessments = useMemo(() => {
    if (!filterNeedsReview) return rawAssessments;
    return rawAssessments.filter((a) => (a.needs_human_review_count ?? 0) > 0);
  }, [rawAssessments, filterNeedsReview]);

  const domainKeys = rawAssessments[0]?.domains?.map((d) => d.domain_key) || [];
  const domainLabels = rawAssessments[0]?.domains?.map((d) => d.domain_label) || [];

  return (
    <div className="card p-5 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Traffic-Light Chart</h2>
        {filterNeedsReview && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Showing {assessments.length} studies requiring review
          </span>
        )}
      </div>

      {assessments.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-xs">
          No assessments match the current filter.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 sticky left-0 bg-white">
                Study
              </th>
              {domainLabels.map((label, i) => (
                <th
                  key={i}
                  className="px-2 py-2 font-semibold text-gray-600 border-b border-gray-200 text-center min-w-[100px]"
                >
                  <div className="text-xs leading-tight">{label}</div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 text-center">
                Overall
              </th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.assessment_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 border-b border-gray-100 sticky left-0 bg-white">
                  <Link
                    to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                    className="text-phylo-blue hover:underline font-medium line-clamp-1 max-w-[250px] block"
                  >
                    {a.study_title || "Untitled"}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {a.ai_prefilled && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-phylo-orange">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                    {(a.needs_human_review_count ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded font-medium">
                        <AlertTriangle className="h-2.5 w-2.5" /> Review ({a.needs_human_review_count})
                      </span>
                    ) : (
                      a.domains.every((d) => d.human_verified) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-phylo-green">
                          <CheckCircle className="h-2.5 w-2.5" /> Verified
                        </span>
                      )
                    )}
                  </div>
                </td>
                {domainKeys.map((dKey, i) => {
                  const domain = a.domains.find((d) => d.domain_key === dKey);
                  const judgment = domain?.risk_judgment || "pending";
                  return (
                    <td key={i} className="px-2 py-2 border-b border-gray-100 text-center">
                      <Link
                        to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                        className="inline-block w-full rounded-md py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
                        style={{ backgroundColor: judgmentDotColor(judgment) }}
                        title={domain?.domain_label || ""}
                      >
                        {judgmentLabel(judgment)}
                      </Link>
                    </td>
                  );
                })}
                <td className="px-3 py-2 border-b border-gray-100 text-center">
                  <span
                    className="inline-block rounded-md px-2 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: judgmentDotColor(a.overall_judgment) }}
                  >
                    {judgmentLabel(a.overall_judgment)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
        {[
          "low",
          "some_concerns",
          "unclear",
          "moderate",
          "high",
          "serious",
          "critical",
          "no_information",
          "pending",
        ].map((j) => (
          <div key={j} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: judgmentDotColor(j) }}
            />
            <span className="text-xs text-gray-500">{judgmentLabel(j)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentList({
  summary,
  filterNeedsReview,
}: {
  summary: RobSummary;
  filterNeedsReview?: boolean;
}) {
  const rawAssessments = Array.isArray(summary?.assessments) ? summary.assessments : [];
  const assessments = useMemo(() => {
    if (!filterNeedsReview) return rawAssessments;
    return rawAssessments.filter((a) => (a.needs_human_review_count ?? 0) > 0);
  }, [rawAssessments, filterNeedsReview]);

  // Group assessments by study
  const studyGroups: Record<
    string,
    { study_title: string; study_design: string; assessments: typeof summary.assessments }
  > = {};
  for (const a of assessments) {
    if (!studyGroups[a.study_id]) {
      studyGroups[a.study_id] = {
        study_title: a.study_title || "Untitled",
        study_design: a.study_design || "unknown design",
        assessments: [],
      };
    }
    studyGroups[a.study_id].assessments.push(a);
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-4">Assessment Details (grouped by study)</h2>
      <div className="space-y-3">
        {Object.entries(studyGroups).map(([studyId, group]) => (
          <div key={studyId} className="border border-gray-100 rounded-lg p-3">
            <div className="font-medium text-sm mb-1">{group.study_title}</div>
            <div className="text-xs text-gray-400 mb-2">{group.study_design}</div>
            <div className="space-y-1.5">
              {group.assessments.map((a) => (
                <Link
                  key={a.assessment_id}
                  to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.outcome_label && (
                      <span className="text-xs text-gray-600">{a.outcome_label}</span>
                    )}
                    {a.ai_prefilled && (
                      <span className="badge bg-phylo-orange/10 text-phylo-orange text-[10px]">
                        <Sparkles className="h-3 w-3 mr-0.5" /> AI
                      </span>
                    )}
                    {(a.needs_human_review_count ?? 0) > 0 && (
                      <span className="badge bg-amber-100 text-amber-800 text-[10px] font-medium border border-amber-200">
                        <AlertTriangle className="h-3 w-3 mr-0.5 text-amber-600" />
                        {a.needs_human_review_count} Flagged for Review
                      </span>
                    )}
                  </div>
                  <span
                    className="badge text-white"
                    style={{ backgroundColor: judgmentDotColor(a.overall_judgment) }}
                  >
                    {judgmentLabel(a.overall_judgment)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
