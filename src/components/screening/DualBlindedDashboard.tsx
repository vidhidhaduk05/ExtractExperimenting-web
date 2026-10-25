import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ScreeningConflict } from "../../lib/api";
import {
  ShieldCheck, Users, EyeOff, Eye, CheckCircle2, XCircle,
  AlertTriangle, Scale, RefreshCw, Lock, Unlock, Check, X,
  FileText, ExternalLink, HelpCircle, ChevronRight, BarChart2
} from "lucide-react";

interface DualBlindedDashboardProps {
  projectId: string;
  onClose?: () => void;
  onSelectStudy?: (studyId: string) => void;
}

export function DualBlindedDashboard({ projectId, onClose, onSelectStudy }: DualBlindedDashboardProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"conflicts" | "matrix" | "settings">("conflicts");
  const [conflictFilter, setConflictFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [adjudicationNotes, setAdjudicationNotes] = useState<Record<string, string>>({});

  // 1. Fetch Screening Configuration
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["screening-config", projectId],
    queryFn: () => api.getScreeningConfig(projectId),
    enabled: !!projectId,
  });

  // 2. Fetch Reviewer Agreement & Kappa
  const { data: agreement, isLoading: agreementLoading, refetch: refetchAgreement } = useQuery({
    queryKey: ["screening-agreement", projectId],
    queryFn: () => api.getReviewerAgreement(projectId),
    enabled: !!projectId,
  });

  // 3. Fetch Conflicts
  const { data: conflicts, isLoading: conflictsLoading, refetch: refetchConflicts } = useQuery({
    queryKey: ["screening-conflicts", projectId],
    queryFn: () => api.listScreeningConflicts(projectId),
    enabled: !!projectId,
  });

  // 4. Update Screening Config Mutation
  const updateConfigMutation = useMutation({
    mutationFn: (data: { blind_mode?: boolean; n_reviewers?: number; conflict_mode?: string }) =>
      api.updateScreeningConfig(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-config", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
    },
  });

  // 5. Resolve Conflict Mutation
  const resolveMutation = useMutation({
    mutationFn: ({ conflictId, resolution, notes }: { conflictId: string; resolution: string; notes?: string }) =>
      api.resolveConflict(conflictId, { resolution, resolved_by: "Lead Adjudicator" }),
    onSuccess: () => {
      setResolvingId(null);
      queryClient.invalidateQueries({ queryKey: ["screening-conflicts", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-agreement", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
    },
  });

  const allConflicts = conflicts || [];
  const unresolvedConflicts = allConflicts.filter((c) => c.status === "unresolved");
  const resolvedConflicts = allConflicts.filter((c) => c.status === "resolved");

  const displayedConflicts =
    conflictFilter === "unresolved"
      ? unresolvedConflicts
      : conflictFilter === "resolved"
      ? resolvedConflicts
      : allConflicts;

  const kappa = agreement?.cohen_kappa ?? 0;
  const percentAgreement = agreement?.percentage_agreement ?? 0;
  const isBlindMode = config?.blind_mode ?? true;

  const getKappaBadge = (k: number) => {
    if (!agreement || agreement.total_dual_screened === 0) {
      return { label: "Awaiting Dual Reviews", color: "bg-slate-100 text-slate-700 border-slate-200" };
    }
    if (k >= 0.81) return { label: "Almost Perfect Agreement (κ ≥ 0.81)", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (k >= 0.61) return { label: "Substantial Agreement (0.61–0.80)", color: "bg-teal-50 text-teal-700 border-teal-200" };
    if (k >= 0.41) return { label: "Moderate Agreement (0.41–0.60)", color: "bg-amber-50 text-amber-700 border-amber-200" };
    if (k >= 0.21) return { label: "Fair Agreement (0.21–0.40)", color: "bg-orange-50 text-orange-700 border-orange-200" };
    return { label: "Slight / Poor Agreement (κ < 0.20)", color: "bg-rose-50 text-rose-700 border-rose-200" };
  };

  const kappaMeta = getKappaBadge(kappa);

  const handleResolve = (conflictId: string, resolution: string) => {
    setResolvingId(conflictId);
    resolveMutation.mutate({
      conflictId,
      resolution,
      notes: adjudicationNotes[conflictId] || "",
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden flex flex-col max-w-5xl w-full mx-auto max-h-[90vh]">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-white">Dual-Blinded Review &amp; Consensus Dashboard</h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isBlindMode ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"}`}>
                {isBlindMode ? "BLIND MASKING ACTIVE" : "BLIND MASKING LIFTED"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-reviewer concordance analytics, Cohen's Kappa evaluation, and disagreement adjudication.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchAgreement(); refetchConflicts(); }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Refresh Concordance &amp; Conflicts"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Top Statistical Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-50/70 border-b border-slate-200/70">
        {/* Metric 1: Cohen's Kappa */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-indigo-600" /> Cohen's Kappa (κ)
            </span>
            <span className="text-[10px] font-mono text-slate-400">Inter-Rater Reliability</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {agreement ? kappa.toFixed(3) : "—"}
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${kappaMeta.color}`}>
              {kappaMeta.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Target benchmark: <span className="font-semibold text-slate-700">κ ≥ 0.70</span> recommended by Cochrane Systematic Review Handbook.
          </p>
        </div>

        {/* Metric 2: Concordance & Percent Agreement */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Percentage Agreement
            </span>
            <span className="text-[10px] font-mono text-slate-400">Observed Concordance</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {percentAgreement.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">
              ({agreement?.total_dual_screened ?? 0} studies dual-screened)
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, percentAgreement))}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Conflicts Status */}
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Divergence &amp; Conflicts
            </span>
            <span className="text-[10px] font-mono text-slate-400">Adjudication Queue</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {unresolvedConflicts.length}
            </span>
            <span className="text-xs text-amber-700 font-medium">Unresolved Disagreements</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {resolvedConflicts.length} conflicts resolved and reconciled into consensus.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-4">
        <button
          onClick={() => setActiveTab("conflicts")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "conflicts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Disagreement Adjudication</span>
          {unresolvedConflicts.length > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-mono">
              {unresolvedConflicts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("matrix")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "matrix"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>2×2 Concordance Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "settings"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Blind Mode Protocol &amp; Rules</span>
        </button>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        {/* TAB 1: CONFLICTS & ADJUDICATION */}
        {activeTab === "conflicts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConflictFilter("unresolved")}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                    conflictFilter === "unresolved"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Unresolved ({unresolvedConflicts.length})
                </button>
                <button
                  onClick={() => setConflictFilter("resolved")}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                    conflictFilter === "resolved"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Resolved ({resolvedConflicts.length})
                </button>
                <button
                  onClick={() => setConflictFilter("all")}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                    conflictFilter === "all"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  All ({allConflicts.length})
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Adjudications immediately update the study consensus status.
              </p>
            </div>

            {displayedConflicts.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-900">No Disagreements in this Queue</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {conflictFilter === "unresolved"
                    ? "All dual reviews are in consensus! No studies currently require tie-breaking adjudication."
                    : "No conflicts recorded under this filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayedConflicts.map((c) => {
                  const isResolved = c.status === "resolved";
                  return (
                    <div
                      key={c.conflict_id}
                      className={`p-5 rounded-2xl border transition-all bg-white shadow-2xs ${
                        isResolved ? "border-slate-200 opacity-90" : "border-amber-200 hover:border-amber-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                              isResolved ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"
                            }`}>
                              {c.status}
                            </span>
                            <span className="text-xs font-mono text-slate-400">Stage: {c.stage.toUpperCase()}</span>
                          </div>
                          <h3
                            onClick={() => onSelectStudy && onSelectStudy(c.study_id)}
                            className="text-sm font-semibold text-slate-900 hover:text-indigo-600 cursor-pointer"
                          >
                            {c.study_title || `Study #${c.study_id}`}
                          </h3>
                        </div>
                        {onSelectStudy && (
                          <button
                            onClick={() => onSelectStudy(c.study_id)}
                            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 shrink-0 font-medium"
                          >
                            <span>Inspect Study</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Reviewer Decisions Side-by-Side Comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-blue-500" /> Reviewer 1
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">{c.reviewer1_id || "rev_1"}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              c.reviewer1_decision === "included" || c.reviewer1_decision === "include"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.reviewer1_decision === "excluded" || c.reviewer1_decision === "exclude"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {c.reviewer1_decision}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-purple-500" /> Reviewer 2
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">{c.reviewer2_id || "rev_2"}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              c.reviewer2_decision === "included" || c.reviewer2_decision === "include"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.reviewer2_decision === "excluded" || c.reviewer2_decision === "exclude"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {c.reviewer2_decision}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Adjudication Action Bar */}
                      {!isResolved ? (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                              <Scale className="w-3.5 h-3.5 text-amber-600" />
                              <span>Adjudicate Final Decision:</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "included")}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Include</span>
                              </button>
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "excluded")}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Exclude</span>
                              </button>
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "maybe")}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                              >
                                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Require Full-Text</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="font-semibold text-slate-800">
                              Resolved as: <span className="uppercase text-emerald-700">{c.resolution}</span>
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            By {c.resolved_by || "Adjudicator"} • {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "Consensus"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 2×2 CONTINGENCY MATRIX */}
        {activeTab === "matrix" && (
          <div className="space-y-6">
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">2×2 Dual Reviewer Decision Matrix</h3>
              <p className="text-xs text-slate-500 mb-4">
                Cross-tabulation of independent reviewer screening judgments across Title &amp; Abstract stages.
              </p>

              <div className="max-w-md mx-auto my-4 border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                      <th className="p-3 text-left border-r border-slate-300">Reviewer 1 \ Reviewer 2</th>
                      <th className="p-3 bg-emerald-50 text-emerald-900 border-r border-slate-300">Include</th>
                      <th className="p-3 bg-rose-50 text-rose-900 border-r border-slate-300">Exclude</th>
                      <th className="p-3 bg-slate-100 text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-3 font-semibold text-left bg-emerald-50/50 text-emerald-900 border-r border-slate-300">
                        Include
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-700 bg-emerald-50/30 border-r border-slate-300">
                        {agreement?.concordant_includes ?? 0}
                        <span className="block text-[9px] text-slate-400 font-normal">Concordant (a)</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-700 bg-amber-50/20 border-r border-slate-300">
                        {agreement?.pairwise_reviewers?.[0]?.b ?? 0}
                        <span className="block text-[9px] text-slate-400 font-normal">Conflict (b)</span>
                      </td>
                      <td className="p-3 font-mono text-slate-700 bg-slate-50">
                        {(agreement?.concordant_includes ?? 0) + (agreement?.pairwise_reviewers?.[0]?.b ?? 0)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-3 font-semibold text-left bg-rose-50/50 text-rose-900 border-r border-slate-300">
                        Exclude
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-700 bg-amber-50/20 border-r border-slate-300">
                        {agreement?.pairwise_reviewers?.[0]?.c ?? 0}
                        <span className="block text-[9px] text-slate-400 font-normal">Conflict (c)</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700 bg-slate-50 border-r border-slate-300">
                        {agreement?.concordant_excludes ?? 0}
                        <span className="block text-[9px] text-slate-400 font-normal">Concordant (d)</span>
                      </td>
                      <td className="p-3 font-mono text-slate-700 bg-slate-50">
                        {(agreement?.pairwise_reviewers?.[0]?.c ?? 0) + (agreement?.concordant_excludes ?? 0)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-semibold text-slate-700">
                      <td className="p-3 text-left border-r border-slate-300">Total</td>
                      <td className="p-3 font-mono border-r border-slate-300">
                        {(agreement?.concordant_includes ?? 0) + (agreement?.pairwise_reviewers?.[0]?.c ?? 0)}
                      </td>
                      <td className="p-3 font-mono border-r border-slate-300">
                        {(agreement?.pairwise_reviewers?.[0]?.b ?? 0) + (agreement?.concordant_excludes ?? 0)}
                      </td>
                      <td className="p-3 font-mono font-bold text-indigo-700">
                        {agreement?.total_dual_screened ?? 0}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BLIND PROTOCOL SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Systematic Review Blind Mode Settings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure double-blind protocol parameters to satisfy PRISMA 2020 and Cochrane rigor standards.
                </p>
              </div>

              {/* Blind Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="space-y-0.5 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">Double-Blind Screening Mask</span>
                    <span className={`text-[10px] font-mono px-2 py-0.2 rounded-full ${isBlindMode ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {isBlindMode ? "ENABLED" : "DISABLED"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    When active, peer reviews and AI suggestions are concealed from each reviewer until their own decision is locked.
                  </p>
                </div>
                <button
                  disabled={updateConfigMutation.isPending}
                  onClick={() => updateConfigMutation.mutate({ blind_mode: !isBlindMode })}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-2xs ${
                    isBlindMode
                      ? "bg-slate-800 text-white hover:bg-slate-900"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {isBlindMode ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{isBlindMode ? "Lift Blind" : "Enable Blind Mode"}</span>
                </button>
              </div>

              {/* Required Reviewers */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-900 block">Required Reviewers per Study</span>
                  <span className="text-[11px] text-slate-500 block">
                    Number of independent human reviewers required before a study decision can be unblinded.
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      disabled={updateConfigMutation.isPending}
                      onClick={() => updateConfigMutation.mutate({ n_reviewers: n })}
                      className={`w-8 h-8 rounded-lg font-semibold transition-all ${
                        (config?.n_reviewers ?? 2) === n
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conflict Mode */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-900 block">Conflict Resolution Policy</span>
                  <span className="text-[11px] text-slate-500 block">
                    Choose how divergent decisions between reviewers are reconciled.
                  </span>
                </div>
                <select
                  disabled={updateConfigMutation.isPending}
                  value={config?.conflict_mode || "manual"}
                  onChange={(e) => updateConfigMutation.mutate({ conflict_mode: e.target.value })}
                  className="input text-xs py-1.5 px-3 bg-white"
                >
                  <option value="manual">Manual Lead Adjudication</option>
                  <option value="majority">Majority Rule</option>
                  <option value="consensus">Require Consensus Meeting</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
