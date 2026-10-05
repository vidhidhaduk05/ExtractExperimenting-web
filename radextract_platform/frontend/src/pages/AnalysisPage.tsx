import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Download,
  Loader2,
  Table2,
  ScatterChart,
  Activity,
  FileBarChart,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  AnalysisProfile,
  HeterogeneityResult,
  ForestPlotData,
  FunnelPlotData,
  SensitivityResult,
  AnalysisOutcome,
} from "../lib/api";

type Tab = "profile" | "stats" | "export";

export function AnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("profile");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");

  // ── Data queries ──

  const { data: profile, isLoading: profileLoading } = useQuery<AnalysisProfile>({
    queryKey: ["analysis-profile", projectId],
    queryFn: () => api.getAnalysisProfile(projectId!),
    enabled: !!projectId && tab === "profile",
  });

  const { data: outcomes } = useQuery<AnalysisOutcome[]>({
    queryKey: ["analysis-outcomes", projectId],
    queryFn: () => api.listAnalysisOutcomes(projectId!),
    enabled: !!projectId && tab === "stats",
  });

  const activeOutcome = selectedOutcome || outcomes?.[0]?.outcome_label || "";

  const { data: heterogeneity } = useQuery<HeterogeneityResult>({
    queryKey: ["analysis-heterogeneity", projectId, activeOutcome],
    queryFn: () => api.getHeterogeneity(projectId!, activeOutcome),
    enabled: !!projectId && !!activeOutcome && tab === "stats",
  });

  const { data: forestData } = useQuery<ForestPlotData>({
    queryKey: ["analysis-forest", projectId, activeOutcome],
    queryFn: () => api.getForestData(projectId!, activeOutcome),
    enabled: !!projectId && !!activeOutcome && tab === "stats",
  });

  const { data: funnelData } = useQuery<FunnelPlotData>({
    queryKey: ["analysis-funnel", projectId, activeOutcome],
    queryFn: () => api.getFunnelData(projectId!, activeOutcome),
    enabled: !!projectId && !!activeOutcome && tab === "stats",
  });

  const { data: sensitivity } = useQuery<SensitivityResult>({
    queryKey: ["analysis-sensitivity", projectId, activeOutcome],
    queryFn: () => api.getSensitivityAnalysis(projectId!, activeOutcome),
    enabled: !!projectId && !!activeOutcome && tab === "stats",
  });

  // ── Render ──

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-phylo-blue" />
          Data Analysis
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Automated EDA, descriptive statistics, and meta-analysis diagnostics — computed
          deterministically (no LLM).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")} icon={Table2} label="Data Profiling" />
        <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon={Activity} label="Statistical Analysis" />
        <TabButton active={tab === "export"} onClick={() => setTab("export")} icon={Download} label="Export" />
      </div>

      {/* ── Data Profiling Tab ── */}
      {tab === "profile" && (
        <ProfileTab profile={profile} loading={profileLoading} />
      )}

      {/* ── Statistical Analysis Tab ── */}
      {tab === "stats" && (
        <StatsTab
          outcomes={outcomes || []}
          activeOutcome={activeOutcome}
          onSelectOutcome={setSelectedOutcome}
          heterogeneity={heterogeneity}
          forestData={forestData}
          funnelData={funnelData}
          sensitivity={sensitivity}
        />
      )}

      {/* ── Export Tab ── */}
      {tab === "export" && projectId && (
        <ExportTab projectId={projectId} />
      )}
    </div>
  );
}

// ── Tab Button ──

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-phylo-blue text-phylo-blue"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ── Profile Tab ──

function ProfileTab({
  profile,
  loading,
}: {
  profile?: AnalysisProfile;
  loading: boolean;
}) {
  if (loading) return <LoadingSpinner />;
  if (!profile) return <EmptyState message="No profiling data available." />;

  const { summary, per_variable = [], missing_matrix = [], correlation_matrix, outliers = [] } = profile;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Studies" value={summary?.total_studies ?? 0} />
        <SummaryCard label="Variables" value={summary?.total_variables ?? 0} />
        <SummaryCard label="Extractions" value={summary?.total_extractions ?? 0} />
        <SummaryCard label="Completion" value={`${summary?.completion_pct ?? 0}%`} />
      </div>

      {/* Per-variable table */}
      <SectionCard title="Per-Variable Profiling" icon={Table2}>
        {per_variable.length === 0 ? (
          <EmptyState message="No variables extracted yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Variable</th>
                  <th className="py-2 px-3">Section</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3 text-right">N</th>
                  <th className="py-2 px-3 text-right">Missing</th>
                  <th className="py-2 px-3 text-right">Mean</th>
                  <th className="py-2 px-3 text-right">Median</th>
                  <th className="py-2 px-3 text-right">Std</th>
                  <th className="py-2 px-3 text-right">Min</th>
                  <th className="py-2 px-3 text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {per_variable.map((v) => (
                  <tr key={v.variable_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{v.variable_name}</td>
                    <td className="py-2 px-3 text-slate-500">{v.section}</td>
                    <td className="py-2 px-3">
                      <FieldTypeBadge type={v.field_type} />
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.count}</td>
                    <td className="py-2 px-3 text-right">
                      <MissingBadge pct={v.missing_pct} />
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.mean ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.median ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.std ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.min ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{v.max ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Missing value matrix */}
      <SectionCard title="Missing Values by Study" icon={AlertTriangle}>
        {missing_matrix.length === 0 ? (
          <EmptyState message="No missing value data." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Study</th>
                  <th className="py-2 px-3 text-right">Variables</th>
                  <th className="py-2 px-3 text-right">Missing</th>
                  <th className="py-2 px-3 text-right">Missing %</th>
                </tr>
              </thead>
              <tbody>
                {missing_matrix.map((m) => (
                  <tr key={m.study_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{m.study_title || m.study_id}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{m.total_variables}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{m.missing_count}</td>
                    <td className="py-2 px-3 text-right">
                      <MissingBadge pct={m.missing_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Correlation matrix */}
      {correlation_matrix.variables.length >= 2 && (
        <SectionCard title="Correlation Matrix (Numeric Variables)" icon={ScatterChart}>
          <CorrelationHeatmap variables={correlation_matrix.variables} values={correlation_matrix.values} />
        </SectionCard>
      )}

      {/* Outliers */}
      <SectionCard title="Outliers (IQR Method)" icon={AlertTriangle}>
        {outliers.length === 0 ? (
          <EmptyState message="No outliers detected." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Variable</th>
                  <th className="py-2 px-3">Study</th>
                  <th className="py-2 px-3 text-right">Value</th>
                  <th className="py-2 px-3 text-right">Z-Score</th>
                  <th className="py-2 px-3">Method</th>
                </tr>
              </thead>
              <tbody>
                {outliers.map((o, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{o.variable_name}</td>
                    <td className="py-2 px-3 text-slate-500">{o.study_title}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{o.value}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={Math.abs(o.z_score) > 2 ? "text-red-600 font-medium" : "text-slate-600"}>
                        {o.z_score}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500">{o.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Stats Tab ──

function StatsTab({
  outcomes,
  activeOutcome,
  onSelectOutcome,
  heterogeneity,
  forestData,
  funnelData,
  sensitivity,
}: {
  outcomes: AnalysisOutcome[];
  activeOutcome: string;
  onSelectOutcome: (o: string) => void;
  heterogeneity?: HeterogeneityResult;
  forestData?: ForestPlotData;
  funnelData?: FunnelPlotData;
  sensitivity?: SensitivityResult;
}) {
  if (outcomes.length === 0) {
    return (
      <EmptyState
        message="No meta-analyses found. Create a meta-analysis first to see statistical diagnostics."
        icon={FileBarChart}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Outcome selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Outcome:</label>
        <select
          value={activeOutcome}
          onChange={(e) => onSelectOutcome(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-phylo-blue focus:border-transparent"
        >
          {outcomes.map((o) => (
            <option key={o.meta_id} value={o.outcome_label}>
              {o.outcome_label} ({o.n_studies} studies)
            </option>
          ))}
        </select>
      </div>

      {/* Heterogeneity */}
      {heterogeneity && !heterogeneity.error && (
        <SectionCard title="Heterogeneity Diagnostics" icon={Activity}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatBox label="I²" value={`${heterogeneity.i_squared}%`} sub={heterogeneity.i_squared_interpretation} />
            <StatBox label="Q-statistic" value={heterogeneity.q_statistic} sub={`df=${heterogeneity.q_df}, p=${heterogeneity.q_p_value}`} />
            <StatBox label="τ²" value={heterogeneity.tau_squared} sub="Between-study variance" />
            <StatBox label="H-statistic" value={heterogeneity.h_statistic} sub="H > 1 suggests heterogeneity" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatBox label="Pooled (Fixed)" value={heterogeneity.pooled_effect_fixed} sub={heterogeneity.effect_measure} />
            <StatBox label="Pooled (Random)" value={heterogeneity.pooled_effect_random} sub="DerSimonian-Laird" />
            <StatBox label="95% CI" value={`${heterogeneity.ci_lower} – ${heterogeneity.ci_upper}`} sub={`SE = ${heterogeneity.se_pooled}`} />
          </div>
        </SectionCard>
      )}

      {/* Forest plot data */}
      {forestData && !forestData.error && (
        <SectionCard title="Forest Plot Data" icon={TrendingUp}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Study</th>
                  <th className="py-2 px-3 text-right">Effect</th>
                  <th className="py-2 px-3 text-right">SE</th>
                  <th className="py-2 px-3 text-right">CI Lower</th>
                  <th className="py-2 px-3 text-right">CI Upper</th>
                  <th className="py-2 px-3 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {forestData.studies.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{s.study_label}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{s.effect_size ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{s.se ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{s.ci_lower ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{s.ci_upper ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{s.weight != null ? `${s.weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {forestData.pooled && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td className="py-2 px-3 text-slate-900">Pooled (Random)</td>
                    <td className="py-2 px-3 text-right text-slate-900">{forestData.pooled.effect_size}</td>
                    <td className="py-2 px-3 text-right text-slate-500">—</td>
                    <td className="py-2 px-3 text-right text-slate-900">{forestData.pooled.ci_lower}</td>
                    <td className="py-2 px-3 text-right text-slate-900">{forestData.pooled.ci_upper}</td>
                    <td className="py-2 px-3 text-right text-slate-500">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </SectionCard>
      )}

      {/* Funnel plot data */}
      {funnelData && !funnelData.error && (
        <SectionCard title="Funnel Plot Data & Egger's Test" icon={ScatterChart}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatBox label="N Studies" value={funnelData.n_studies} />
            <StatBox label="Pooled Effect" value={funnelData.pooled_effect ?? "—"} />
            {funnelData.egger_test && (
              <>
                <StatBox
                  label="Egger Intercept"
                  value={funnelData.egger_test.intercept}
                  sub={`p = ${funnelData.egger_test.p_value}`}
                />
                <StatBox
                  label="Asymmetry"
                  value={funnelData.egger_test.has_asymmetry ? "Detected" : "None"}
                  sub={funnelData.egger_test.has_asymmetry ? "p < 0.10" : "p ≥ 0.10"}
                  highlight={funnelData.egger_test.has_asymmetry}
                />
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Study</th>
                  <th className="py-2 px-3 text-right">Effect Size</th>
                  <th className="py-2 px-3 text-right">SE</th>
                  <th className="py-2 px-3 text-right">Precision</th>
                </tr>
              </thead>
              <tbody>
                {funnelData.points.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{p.study_label}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{p.effect_size}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{p.se}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{p.precision ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Sensitivity analysis */}
      {sensitivity && !sensitivity.error && (
        <SectionCard title="Leave-One-Out Sensitivity Analysis" icon={ChevronRight}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatBox label="Full Pooled" value={sensitivity.full_pooled} sub={`CI: ${sensitivity.full_ci_lower} – ${sensitivity.full_ci_upper}`} />
            <StatBox label="Full I²" value={`${sensitivity.full_i_squared}%`} />
            <StatBox label="Full τ²" value={sensitivity.full_tau_squared} />
            <StatBox label="N Studies" value={sensitivity.n_studies} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Study Removed</th>
                  <th className="py-2 px-3 text-right">Pooled Without</th>
                  <th className="py-2 px-3 text-right">CI Lower</th>
                  <th className="py-2 px-3 text-right">CI Upper</th>
                  <th className="py-2 px-3 text-right">I²</th>
                  <th className="py-2 px-3 text-right">Δ Pooled</th>
                  <th className="py-2 px-3 text-right">Δ I²</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.leave_one_out.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">{r.study_label}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{r.pooled_without}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{r.ci_lower}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{r.ci_upper}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{r.i_squared}%</td>
                    <td className="py-2 px-3 text-right">
                      <span className={Math.abs(r.pooled_change) > 0.1 ? "text-amber-600 font-medium" : "text-slate-600"}>
                        {r.pooled_change > 0 ? "+" : ""}{r.pooled_change}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {r.i2_change > 0 ? "+" : ""}{r.i2_change}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Export Tab ──

function ExportTab({ projectId }: { projectId: string }) {
  const handleDownload = () => {
    const url = api.downloadReport(projectId);
    const token = localStorage.getItem("token");
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analysis_report_${projectId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => console.error(err));
  };

  return (
    <div className="max-w-2xl">
      <SectionCard title="Download Full Analysis Report" icon={Download}>
        <p className="text-sm text-slate-600 mb-4">
          Download a complete JSON report containing the data profiling summary, per-variable
          statistics, missing value matrix, correlation matrix, outlier list, and all
          meta-analysis diagnostics (heterogeneity, forest plot data, funnel plot data, and
          leave-one-out sensitivity analysis).
        </p>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-phylo-blue hover:bg-blue-700 text-white font-medium text-sm transition"
        >
          <Download className="h-4 w-4" />
          Download Report (JSON)
        </button>
      </SectionCard>
    </div>
  );
}

// ── Shared components ──

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${highlight ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FieldTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    float: "bg-blue-100 text-blue-700",
    int: "bg-blue-100 text-blue-700",
    percent: "bg-purple-100 text-purple-700",
    enum: "bg-amber-100 text-amber-700",
    bool: "bg-green-100 text-green-700",
    free_text: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || colors.free_text}`}>
      {type}
    </span>
  );
}

function MissingBadge({ pct }: { pct: number }) {
  const color = pct === 0 ? "text-green-600" : pct < 25 ? "text-amber-600" : "text-red-600";
  return <span className={`${color} font-medium`}>{pct}%</span>;
}

function CorrelationHeatmap({
  variables,
  values,
}: {
  variables: string[];
  values: (number | null)[][];
}) {
  function colorFor(v: number | null): string {
    if (v === null) return "bg-slate-100";
    if (v >= 0.8) return "bg-blue-600 text-white";
    if (v >= 0.5) return "bg-blue-400 text-white";
    if (v >= 0.3) return "bg-blue-200";
    if (v >= -0.3) return "bg-slate-100";
    if (v >= -0.5) return "bg-red-200";
    if (v >= -0.8) return "bg-red-400 text-white";
    return "bg-red-600 text-white";
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="py-1 px-2"></th>
            {variables.map((v) => (
              <th key={v} className="py-1 px-2 text-slate-500 font-medium max-w-[120px] truncate" title={v}>
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={i}>
              <td className="py-1 px-2 text-slate-500 font-medium max-w-[120px] truncate" title={variables[i]}>
                {variables[i]}
              </td>
              {row.map((v, j) => (
                <td key={j} className={`py-1 px-2 text-center ${colorFor(v)}`}>
                  {v !== null ? v.toFixed(2) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 text-phylo-blue animate-spin" />
    </div>
  );
}

function EmptyState({
  message,
  icon: Icon = FileBarChart,
}: {
  message: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Icon className="h-12 w-12 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
