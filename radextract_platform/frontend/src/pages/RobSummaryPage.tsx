import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type RobSummary } from "../lib/api";
import { ArrowLeft, ShieldCheck, Plus, Sparkles, CheckCircle } from "lucide-react";
import { judgmentLabel, judgmentDotColor } from "../lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";

export function RobSummaryPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.robSummary(projectId!),
    enabled: !!projectId,
  });

  if (isLoading) return <div className="p-8 text-gray-400">Loading risk-of-bias summary...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
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
        <Link to={`/projects/${projectId}/studies`} className="btn-secondary">
          <Plus className="h-4 w-4" /> Add studies to assess
        </Link>
      </div>

      {summary && (summary?.total_assessments ?? 0) > 0 ? (
        <div className="space-y-6">
          {/* Judgment Distribution */}
          <JudgmentDistribution summary={summary} />

          {/* Traffic-Light Chart */}
          <TrafficLightChart summary={summary} />

          {/* Assessment List */}
          <AssessmentList summary={summary} />
        </div>
      ) : (
        <div className="card p-12 text-center">
          <ShieldCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No risk-of-bias assessments yet</p>
          <p className="text-sm text-gray-400">
            Screen studies as "included" at full-text, then use the "Start RoB" button
            on the Screening page to create assessments.
          </p>
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

function TrafficLightChart({ summary }: { summary: RobSummary }) {
  // Get all unique domain keys across assessments
  const assessments = Array.isArray(summary?.assessments) ? summary.assessments : [];
  const domainKeys = assessments[0]?.domains?.map((d) => d.domain_key) || [];
  const domainLabels = assessments[0]?.domains?.map((d) => d.domain_label) || [];

  return (
    <div className="card p-5 overflow-x-auto">
      <h2 className="font-semibold mb-4">Traffic-Light Chart</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 sticky left-0 bg-white">
              Study
            </th>
            {domainLabels.map((label, i) => (
              <th key={i} className="px-2 py-2 font-semibold text-gray-600 border-b border-gray-200 text-center min-w-[100px]">
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
                <div className="flex items-center gap-1 mt-0.5">
                  {a.ai_prefilled && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-phylo-orange">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </span>
                  )}
                  {a.domains.every((d) => d.human_verified) && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-phylo-green">
                      <CheckCircle className="h-2.5 w-2.5" /> Verified
                    </span>
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
        {["low", "some_concerns", "unclear", "moderate", "high", "serious", "critical", "no_information", "pending"].map((j) => (
          <div key={j} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: judgmentDotColor(j) }} />
            <span className="text-xs text-gray-500">{judgmentLabel(j)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentList({ summary }: { summary: RobSummary }) {
  // Group assessments by study
  const assessments = Array.isArray(summary?.assessments) ? summary.assessments : [];
  const studyGroups: Record<string, { study_title: string; study_design: string; assessments: typeof summary.assessments }> = {};
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
            <div className="font-medium text-sm mb-2">{group.study_title}</div>
            <div className="text-xs text-gray-400 mb-2">{group.study_design}</div>
            <div className="space-y-1.5">
              {group.assessments.map((a) => (
                <Link
                  key={a.assessment_id}
                  to={`/projects/${summary.project_id}/rob/${a.assessment_id}`}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {a.outcome_label && (
                      <span className="text-xs text-gray-600">{a.outcome_label}</span>
                    )}
                    {a.ai_prefilled && (
                      <span className="badge bg-phylo-orange/10 text-phylo-orange">
                        <Sparkles className="h-3 w-3 mr-0.5" /> AI
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
