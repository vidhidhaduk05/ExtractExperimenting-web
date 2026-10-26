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

  const { data: descriptive } = useQuery({
    queryKey: ["analysis-descriptive", projectId],
    queryFn: () => api.getDescriptiveSynthesis(projectId!),
    enabled: !!projectId,
  });

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
    <div className="p-8 max-w-7xl mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-[#3a0f34] flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-[#814d75]" />
          Data Analysis
        </h1>
        <p className="text-sm text-[#62535d] mt-1 font-serif">
          Automated exploratory data analysis, descriptive statistics, and meta-analysis diagnostics — computed
          deterministically.
        </p>
      </div>

      {descriptive && (
        <div className="mb-6 rounded-xl border border-[#d2c2cb] bg-white p-5 shadow-xs">
          <h2 className="text-sm font-serif font-bold text-[#3a0f34]">Descriptive synthesis</h2>
          <p className="mt-1 text-xs text-[#62535d] font-serif">{descriptive.note}</p>
          {descriptive.prisma && (
            <p className="mt-2 text-sm text-[#4f444b] font-sans">
              Identified {descriptive.prisma.identified}. Duplicates removed {descriptive.prisma.duplicates_removed}.
              {" "}
              {Object.entries(descriptive.prisma.by_status || {})
                .map(([status, count]) => `${status}: ${count}`)
                .join(" · ")}
            </p>
          )}
          {Array.isArray(descriptive.variables) && descriptive.variables.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-[#4f444b] font-sans">
              {descriptive.variables.slice(0, 12).map((item) => {
                const row = item as { name?: string; summary?: string; result?: { median?: number; n?: number }; binary?: { proportion?: number; n?: number; ci_low?: number; ci_high?: number } };
                const binary = row.binary;
                const median = row.result;
                const detail = binary
                  ? `${Math.round((binary.proportion || 0) * 1000) / 10}% (n=${binary.n}, ${binary.ci_low}–${binary.ci_high})`
                  : median
                    ? `median ${median.median} (n=${median.n})`
                    : row.summary;
                return <li key={row.name}><strong className="text-[#3a0f34]">{row.name}:</strong> {detail}</li>;
              })}
            </ul>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#d2c2cb]">
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
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-sans font-medium border-b-2 transition-colors ${
        active
          ? "border-[#3a0f34] text-[#3a0f34] font-semibold"
          : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Variable</th>
                  <th className="py-2.5 px-3">Section</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">N</th>
                  <th className="py-2.5 px-3 text-right">Missing</th>
                  <th className="py-2.5 px-3 text-right">Mean</th>
                  <th className="py-2.5 px-3 text-right">Median</th>
                  <th className="py-2.5 px-3 text-right">Std</th>
                  <th className="py-2.5 px-3 text-right">Min</th>
                  <th className="py-2.5 px-3 text-right">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {per_variable.map((v) => (
                  <tr key={v.variable_id} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34]">{v.variable_name}</td>
                    <td className="py-2 px-3 text-[#62535d] font-serif">{v.section}</td>
                    <td className="py-2 px-3">
                      <FieldTypeBadge type={v.field_type} />
                    </td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.count}</td>
                    <td className="py-2 px-3 text-right font-sans">
                      <MissingBadge pct={v.missing_pct} />
                    </td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.mean ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.median ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.std ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.min ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{v.max ?? "—"}</td>
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Study</th>
                  <th className="py-2.5 px-3 text-right">Variables</th>
                  <th className="py-2.5 px-3 text-right">Missing</th>
                  <th className="py-2.5 px-3 text-right">Missing %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {missing_matrix.map((m) => (
                  <tr key={m.study_id} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34] font-serif">{m.study_title || m.study_id}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{m.total_variables}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{m.missing_count}</td>
                    <td className="py-2 px-3 text-right font-sans">
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
      {correlation_matrix && correlation_matrix.variables.length >= 2 && (
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Variable</th>
                  <th className="py-2.5 px-3">Study</th>
                  <th className="py-2.5 px-3 text-right">Value</th>
                  <th className="py-2.5 px-3 text-right">Z-Score</th>
                  <th className="py-2.5 px-3">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {outliers.map((o, i) => (
                  <tr key={i} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34]">{o.variable_name}</td>
                    <td className="py-2 px-3 text-[#62535d] font-serif">{o.study_title}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{o.value}</td>
                    <td className="py-2 px-3 text-right font-sans">
                      <span className={Math.abs(o.z_score) > 2 ? "text-[#7c5800] font-semibold" : "text-[#4f444b]"}>
                        {o.z_score}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#62535d] font-sans">{o.method}</td>
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
        <label className="text-sm font-semibold text-[#3a0f34] font-sans">Outcome:</label>
        <select
          value={activeOutcome}
          onChange={(e) => onSelectOutcome(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[#d2c2cb] text-sm bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Study</th>
                  <th className="py-2.5 px-3 text-right">Effect</th>
                  <th className="py-2.5 px-3 text-right">SE</th>
                  <th className="py-2.5 px-3 text-right">CI Lower</th>
                  <th className="py-2.5 px-3 text-right">CI Upper</th>
                  <th className="py-2.5 px-3 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {forestData.studies.map((s, i) => (
                  <tr key={i} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34] font-serif">{s.study_label}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{s.effect_size ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{s.se ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{s.ci_lower ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{s.ci_upper ?? "—"}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{s.weight != null ? `${s.weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {forestData.pooled && (
                <tfoot>
                  <tr className="border-t-2 border-[#d2c2cb] bg-[#fbf9f4] font-semibold">
                    <td className="py-2.5 px-3 text-[#3a0f34] font-serif">Pooled (Random)</td>
                    <td className="py-2.5 px-3 text-right text-[#3a0f34] font-sans">{forestData.pooled.effect_size}</td>
                    <td className="py-2.5 px-3 text-right text-[#81737b] font-sans">—</td>
                    <td className="py-2.5 px-3 text-right text-[#3a0f34] font-sans">{forestData.pooled.ci_lower}</td>
                    <td className="py-2.5 px-3 text-right text-[#3a0f34] font-sans">{forestData.pooled.ci_upper}</td>
                    <td className="py-2.5 px-3 text-right text-[#81737b] font-sans">100%</td>
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Study</th>
                  <th className="py-2.5 px-3 text-right">Effect Size</th>
                  <th className="py-2.5 px-3 text-right">SE</th>
                  <th className="py-2.5 px-3 text-right">Precision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {funnelData.points.map((p, i) => (
                  <tr key={i} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34] font-serif">{p.study_label}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{p.effect_size}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{p.se}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{p.precision ?? "—"}</td>
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
                <tr className="border-b border-[#d2c2cb] text-left text-xs font-semibold text-[#3a0f34] uppercase font-sans bg-[#fbf9f4]">
                  <th className="py-2.5 px-3">Study Removed</th>
                  <th className="py-2.5 px-3 text-right">Pooled Without</th>
                  <th className="py-2.5 px-3 text-right">CI Lower</th>
                  <th className="py-2.5 px-3 text-right">CI Upper</th>
                  <th className="py-2.5 px-3 text-right">I²</th>
                  <th className="py-2.5 px-3 text-right">Δ Pooled</th>
                  <th className="py-2.5 px-3 text-right">Δ I²</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {sensitivity.leave_one_out.map((r, i) => (
                  <tr key={i} className="hover:bg-[#eee7ec]/40 transition-colors">
                    <td className="py-2 px-3 font-medium text-[#3a0f34] font-serif">{r.study_label}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{r.pooled_without}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{r.ci_lower}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{r.ci_upper}</td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">{r.i_squared}%</td>
                    <td className="py-2 px-3 text-right font-sans">
                      <span className={Math.abs(r.pooled_change) > 0.1 ? "text-[#7c5800] font-semibold" : "text-[#4f444b]"}>
                        {r.pooled_change > 0 ? "+" : ""}{r.pooled_change}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-[#4f444b] font-sans">
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
        <p className="text-sm text-[#62535d] mb-4 font-serif">
          Download a complete JSON report containing the data profiling summary, per-variable
          statistics, missing value matrix, correlation matrix, outlier list, and all
          meta-analysis diagnostics (heterogeneity, forest plot data, funnel plot data, and
          leave-one-out sensitivity analysis).
        </p>
        <button
          onClick={handleDownload}
          className="btn-primary text-xs flex items-center gap-2"
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
    <div className="bg-white p-4.5 rounded-xl border border-[#d2c2cb] shadow-xs">
      <p className="text-xs text-[#81737b] uppercase tracking-wide font-sans">{label}</p>
      <p className="text-2xl font-serif font-bold text-[#3a0f34] mt-1">{value}</p>
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
    <div className="bg-white rounded-xl border border-[#d2c2cb] overflow-hidden shadow-xs">
      <div className="px-5 py-3 border-b border-[#eee7ec] flex items-center gap-2 bg-[#fbf9f4]">
        <Icon className="h-4 w-4 text-[#814d75]" />
        <h3 className="text-sm font-serif font-bold text-[#3a0f34]">{title}</h3>
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
    <div className={`p-3.5 rounded-lg border ${highlight ? "border-[#ffdea6] bg-[#ffdea6]/30" : "border-[#d2c2cb] bg-[#fbf9f4]"}`}>
      <p className="text-xs text-[#81737b] font-sans">{label}</p>
      <p className={`text-lg font-serif font-bold mt-0.5 ${highlight ? "text-[#7c5800]" : "text-[#3a0f34]"}`}>{value}</p>
      {sub && <p className="text-xs text-[#62535d] mt-0.5 font-serif">{sub}</p>}
    </div>
  );
}

function FieldTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    float: "bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]",
    int: "bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]",
    percent: "bg-[#814d75]/15 text-[#814d75] border border-[#814d75]/25",
    enum: "bg-[#ffdea6]/60 text-[#7c5800] border border-[#ffdea6]",
    bool: "bg-[#3a0f34]/10 text-[#3a0f34] border border-[#3a0f34]/20",
    free_text: "bg-[#fbf9f4] text-[#62535d] border border-[#d2c2cb]",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-sans font-medium ${colors[type] || colors.free_text}`}>
      {type}
    </span>
  );
}

function MissingBadge({ pct }: { pct: number }) {
  const color = pct === 0 ? "text-[#3a0f34]" : pct < 25 ? "text-[#7c5800]" : "text-rose-700";
  return <span className={`${color} font-medium font-sans`}>{pct}%</span>;
}

function CorrelationHeatmap({
  variables,
  values,
}: {
  variables: string[];
  values: (number | null)[][];
}) {
  function colorFor(v: number | null): string {
    if (v === null) return "bg-[#eee7ec] text-[#81737b]";
    if (v >= 0.8) return "bg-[#3a0f34] text-[#fbf9f4]";
    if (v >= 0.5) return "bg-[#814d75] text-[#fbf9f4]";
    if (v >= 0.3) return "bg-[#814d75]/25 text-[#3a0f34]";
    if (v >= -0.3) return "bg-[#fbf9f4] text-[#62535d]";
    if (v >= -0.5) return "bg-[#ffdea6] text-[#7c5800]";
    if (v >= -0.8) return "bg-rose-200 text-rose-900";
    return "bg-rose-700 text-white";
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="py-1 px-2"></th>
            {variables.map((v) => (
              <th key={v} className="py-1 px-2 text-[#62535d] font-sans font-medium max-w-[120px] truncate" title={v}>
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={i}>
              <td className="py-1 px-2 text-[#62535d] font-sans font-medium max-w-[120px] truncate" title={variables[i]}>
                {variables[i]}
              </td>
              {row.map((v, j) => (
                <td key={j} className={`py-1.5 px-2 text-center font-mono border border-white ${colorFor(v)}`}>
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
      <Loader2 className="h-8 w-8 text-[#814d75] animate-spin" />
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
    <div className="flex flex-col items-center justify-center py-16 text-[#81737b]">
      <Icon className="h-12 w-12 mb-3 text-[#d2c2cb]" />
      <p className="text-sm font-serif">{message}</p>
    </div>
  );
}
