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
} from "lucide-react";
import { judgmentLabel, judgmentDotColor, cn, sanitizeSvg } from "../lib/utils";
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

  if (isLoading) return <div className="p-8 text-[#81737b] font-sans">Loading risk-of-bias summary...</div>;

  const isRunning = robProgress?.status === "running";
  const pendingReviewCount = summary?.pending_human_review_count ?? 0;
  const needingReviewCount = summary?.assessments_needing_review_count ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 font-sans"
      >
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#3a0f34] flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#814d75]" />
            Risk of Bias
          </h1>
          <p className="text-[#62535d] text-sm mt-1 font-sans">
            {summary?.total_assessments || 0} assessments
            {summary?.tool && ` using ${summary.tool.toUpperCase().replace("-", "-")}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending || isRunning}
            className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-xs"
            title="Auto-assess unassessed included studies with Co-Scientist full-text pre-fill"
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
        <div className="card p-4.5 mb-6 bg-[#fbf9f4] border border-[#d2c2cb] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-[#814d75] animate-spin" />
              <span className="font-serif font-semibold text-sm text-[#3a0f34]">
                Automated Batch RoB Assessment Running
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb]">
                {robProgress.completed_studies} / {robProgress.total_studies} Studies
              </span>
            </div>
            <button
              onClick={() => cancelRunMutation.mutate()}
              disabled={cancelRunMutation.isPending}
              className="text-xs px-2.5 py-1 rounded-lg border border-[#d2c2cb] bg-white text-[#a42b2b] hover:bg-[#fff2f2] flex items-center gap-1 font-medium font-sans transition-colors"
            >
              <Square className="h-3 w-3" /> Stop Run
            </button>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-[#eee7ec] rounded-full h-2 overflow-hidden mb-2 border border-[#d2c2cb]">
            <div
              className="bg-[#3a0f34] h-2 rounded-full transition-all duration-300"
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
          <div className="flex items-center justify-between text-[11px] text-[#62535d] font-sans">
            <span>
              Auto-selecting design tool (RoB 2 / ROBINS-I / ROBINS-E / QUADAS-2 / NOS) & pre-filling questions...
            </span>
            {robProgress.flagged_questions_count > 0 && (
              <span className="text-[#7c5800] font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-[#7c5800]" />
                {robProgress.flagged_questions_count} questions flagged for human review (confidence &lt; 70%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter Toolbar & Human Review Pills */}
      {summary && (summary?.total_assessments ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3 bg-[#ffffff] p-3 rounded-xl border border-[#d2c2cb] mb-6 flex-wrap shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#62535d] font-medium font-sans">Filter Assessments:</span>
            <button
              onClick={() => setFilterNeedsReview(false)}
              className={cn(
                "text-xs px-3 py-1 rounded-lg font-medium font-sans transition-colors",
                !filterNeedsReview
                  ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                  : "text-[#62535d] hover:bg-[#eee7ec]"
              )}
            >
              All ({summary.total_assessments})
            </button>
            <button
              onClick={() => setFilterNeedsReview(true)}
              className={cn(
                "text-xs px-3 py-1 rounded-lg font-medium font-sans transition-colors flex items-center gap-1.5",
                filterNeedsReview
                  ? "bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] shadow-xs font-semibold"
                  : "text-[#7c5800] bg-[#fbf9f4] hover:bg-[#eee7ec] border border-[#d2c2cb]"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Pending Human Review</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white/40 font-bold">
                {needingReviewCount || pendingReviewCount}
              </span>
            </button>
          </div>

          {(pendingReviewCount > 0 || needingReviewCount > 0) && (
            <span className="text-xs text-[#7c5800] font-serif italic flex items-center gap-1">
              ✦ {needingReviewCount || 1} studies have low-confidence questions (&lt; 70%) flagged for human review
            </span>
          )}
        </div>
      )}

      {summary && (summary?.total_assessments ?? 0) > 0 ? (
        <div className="space-y-6">
          <RobvisFigures projectId={projectId!} />

          {/* Judgment Distribution */}
          <JudgmentDistribution summary={summary} />

          {/* Traffic-Light Chart */}
          <TrafficLightChart summary={summary} filterNeedsReview={filterNeedsReview} />

          {/* Assessment List */}
          <AssessmentList summary={summary} filterNeedsReview={filterNeedsReview} />
        </div>
      ) : (
        <div className="card p-12 text-center bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <ShieldCheck className="h-12 w-12 text-[#81737b] mx-auto mb-3" />
          <p className="text-[#3a0f34] font-serif font-semibold mb-2">No risk-of-bias assessments yet</p>
          <p className="text-sm text-[#62535d] mb-4 font-sans max-w-md mx-auto">
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

function RobvisFigures({ projectId }: { projectId: string }) {
  const traffic = useQuery({
    queryKey: ["robvis", projectId, "traffic"],
    queryFn: () => api.robvisFigure(projectId, "traffic"),
    enabled: !!projectId,
  });
  const bars = useQuery({
    queryKey: ["robvis", projectId, "summary"],
    queryFn: () => api.robvisFigure(projectId, "summary"),
    enabled: !!projectId,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RobvisPanel title="Traffic light (robvis)" figure={traffic.data} loading={traffic.isLoading} />
      <RobvisPanel title="Domain summary (robvis)" figure={bars.data} loading={bars.isLoading} />
    </div>
  );
}

function RobvisPanel({
  title,
  figure,
  loading,
}: {
  title: string;
  figure?: {
    tool: string;
    svg: string;
    message: string;
    engine?: string;
  };
  loading: boolean;
}) {
  return (
    <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
      <h2 className="font-serif font-semibold text-[#3a0f34] mb-1">{title}</h2>
      <p className="text-xs text-[#62535d] mb-3 font-sans">
        Publication figure from the robvis package
        {figure?.tool ? ` (${figure.tool})` : ""}.
      </p>
      {loading ? (
        <p className="text-sm text-[#81737b] font-sans">Drawing figure...</p>
      ) : figure?.svg ? (
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: sanitizeSvg(figure.svg) }} />
      ) : (
        <p className="text-sm text-[#62535d] font-sans">{figure?.message || "Figure unavailable."}</p>
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
    <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
      <h2 className="font-serif font-semibold text-[#3a0f34] mb-4">Overall Judgment Distribution</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d2c2cb" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#4f444b" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4f444b" }} />
          <Tooltip
            cursor={{ fill: "#fbf9f4" }}
            contentStyle={{ borderRadius: "8px", border: "1px solid #d2c2cb", fontSize: "13px", backgroundColor: "#ffffff", color: "#4f444b" }}
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
  const rawAssessments = summary?.assessments;
  const assessments = useMemo(() => {
    const list = Array.isArray(rawAssessments) ? rawAssessments : [];
    if (!filterNeedsReview) return list;
    return list.filter((a) => (a.needs_human_review_count ?? 0) > 0);
  }, [rawAssessments, filterNeedsReview]);

  const domainKeys = (Array.isArray(rawAssessments) ? rawAssessments[0] : undefined)?.domains?.map((d) => d.domain_key) || [];
  const domainLabels = (Array.isArray(rawAssessments) ? rawAssessments[0] : undefined)?.domains?.map((d) => d.domain_label) || [];

  const domainMapByAssessment = useMemo(() => {
    const map = new Map<string, Map<string, any>>();
    assessments.forEach((a) => {
      const dMap = new Map<string, any>();
      (a.domains || []).forEach((d) => {
        if (d.domain_key) dMap.set(d.domain_key, d);
      });
      map.set(a.assessment_id, dMap);
    });
    return map;
  }, [assessments]);

  return (
    <div className="card p-5 overflow-x-auto bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif font-semibold text-[#3a0f34]">Traffic-Light Chart</h2>
        {filterNeedsReview && (
          <span className="text-xs text-[#3a0f34] bg-[#ffdea6] px-2.5 py-0.5 rounded border border-[#d2c2cb] font-sans font-medium">
            Showing {assessments.length} studies requiring review
          </span>
        )}
      </div>

      {assessments.length === 0 ? (
        <div className="p-8 text-center text-[#81737b] text-xs font-sans">
          No assessments match the current filter.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse font-sans">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] sticky left-0 bg-[#ffffff]">
                Study
              </th>
              {domainLabels.map((label, i) => (
                <th
                  key={i}
                  className="px-2 py-2 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] text-center min-w-[100px]"
                >
                  <div className="text-xs leading-tight">{label}</div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] text-center">
                Overall
              </th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.assessment_id} className="hover:bg-[#fbf9f4] transition-colors">
                <td className="px-3 py-2 border-b border-[#d2c2cb]/50 sticky left-0 bg-[#ffffff]">
                  <Link
                    to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                    className="text-[#3a0f34] hover:text-[#814d75] hover:underline font-serif font-medium line-clamp-1 max-w-[250px] block"
                  >
                    {a.study_title || "Untitled"}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {a.ai_prefilled && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#7c5800] font-sans">
                        <Sparkles className="h-2.5 w-2.5" /> Co-Scientist
                      </span>
                    )}
                    {(a.needs_human_review_count ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#7c5800] bg-[#ffdea6] px-1.5 py-0.2 rounded font-medium border border-[#d2c2cb] font-sans">
                        <AlertTriangle className="h-2.5 w-2.5" /> Review ({a.needs_human_review_count})
                      </span>
                    ) : (
                      a.domains.every((d) => d.human_verified) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#2d6a4f] font-sans font-medium">
                          <CheckCircle className="h-2.5 w-2.5" /> Verified
                        </span>
                      )
                    )}
                  </div>
                </td>
                {domainKeys.map((dKey, i) => {
                  const domain = domainMapByAssessment.get(a.assessment_id)?.get(dKey);
                  const judgment = domain?.risk_judgment || "pending";
                  return (
                    <td key={i} className="px-2 py-2 border-b border-[#d2c2cb]/50 text-center">
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
                <td className="px-3 py-2 border-b border-[#d2c2cb]/50 text-center">
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
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-[#d2c2cb]">
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
            <span className="text-xs text-[#62535d] font-sans">{judgmentLabel(j)}</span>
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
  const rawAssessments = summary?.assessments;
  const assessments = useMemo(() => {
    const list = Array.isArray(rawAssessments) ? rawAssessments : [];
    if (!filterNeedsReview) return list;
    return list.filter((a) => (a.needs_human_review_count ?? 0) > 0);
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
    <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
      <h2 className="font-serif font-semibold text-[#3a0f34] mb-4">Assessment Details (grouped by study)</h2>
      <div className="space-y-3">
        {Object.entries(studyGroups).map(([studyId, group]) => (
          <div key={studyId} className="border border-[#d2c2cb] rounded-lg p-3 bg-[#fbf9f4]">
            <div className="font-serif font-medium text-sm text-[#3a0f34] mb-1">{group.study_title}</div>
            <div className="text-xs text-[#81737b] mb-2 font-mono">{group.study_design}</div>
            <div className="space-y-1.5">
              {group.assessments.map((a) => (
                <Link
                  key={a.assessment_id}
                  to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                  className="flex items-center justify-between rounded-md bg-[#ffffff] border border-[#d2c2cb] px-3 py-2 hover:bg-[#eee7ec] transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.outcome_label && (
                      <span className="text-xs text-[#4f444b] font-sans">{a.outcome_label}</span>
                    )}
                    {a.ai_prefilled && (
                      <span className="badge bg-[#ffdea6] text-[#3a0f34] text-[10px] font-sans border border-[#d2c2cb]">
                        <Sparkles className="h-3 w-3 mr-0.5 text-[#7c5800]" /> Co-Scientist
                      </span>
                    )}
                    {(a.needs_human_review_count ?? 0) > 0 && (
                      <span className="badge bg-[#ffdea6] text-[#7c5800] text-[10px] font-medium border border-[#d2c2cb] font-sans">
                        <AlertTriangle className="h-3 w-3 mr-0.5 text-[#7c5800]" />
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
