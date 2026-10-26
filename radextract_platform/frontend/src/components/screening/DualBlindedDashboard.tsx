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
      return { label: "Awaiting Dual Reviews", color: "bg-[#eee7ec] text-[#62535d] border-[#d2c2cb]" };
    }
    if (k >= 0.81) return { label: "Almost Perfect Agreement (κ ≥ 0.81)", color: "bg-[#ffdea6] text-[#7c5800] border-[#d2c2cb]" };
    if (k >= 0.61) return { label: "Substantial Agreement (0.61–0.80)", color: "bg-[#eee7ec] text-[#3a0f34] border-[#d2c2cb]" };
    if (k >= 0.41) return { label: "Moderate Agreement (0.41–0.60)", color: "bg-amber-50 text-amber-700 border-amber-200" };
    if (k >= 0.21) return { label: "Fair Agreement (0.21–0.40)", color: "bg-orange-50 text-orange-700 border-orange-200" };
    return { label: "Slight / Poor Agreement (κ < 0.20)", color: "bg-[#ab3329]/10 text-[#ab3329] border-[#ab3329]/30" };
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
    <div className="bg-[#fbf9f4] rounded-xl shadow-2xl border border-[#d2c2cb] overflow-hidden flex flex-col max-w-5xl w-full mx-auto max-h-[90vh] font-sans">
      {/* Header */}
      <div className="px-6 py-4 bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-between border-b border-[#1a0017]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg border border-[#d2c2cb]/30 text-[#ffdea6]">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-serif font-bold tracking-tight text-[#fbf9f4]">Dual-Blinded Review &amp; Consensus Dashboard</h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isBlindMode ? "bg-[#ffdea6]/20 text-[#ffdea6] border-[#ffdea6]/40" : "bg-white/10 text-[#d2c2cb] border-[#d2c2cb]/30"}`}>
                {isBlindMode ? "BLIND MASKING ACTIVE" : "BLIND MASKING LIFTED"}
              </span>
            </div>
            <p className="text-xs text-[#d2c2cb] mt-0.5">
              Multi-reviewer concordance analytics, Cohen's Kappa evaluation, and disagreement adjudication.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchAgreement(); refetchConflicts(); }}
            className="p-1.5 text-[#d2c2cb] hover:text-[#fbf9f4] hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Refresh Concordance &amp; Conflicts"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-[#d2c2cb] hover:text-[#fbf9f4] hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Top Statistical Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-[#eee7ec] border-b border-[#d2c2cb]">
        {/* Metric 1: Cohen's Kappa */}
        <div className="p-4 bg-white rounded-xl border border-[#d2c2cb] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#62535d] mb-1">
            <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-[#814d75]" /> Cohen's Kappa (&kappa;)
            </span>
            <span className="text-[10px] font-mono text-[#81737b]">Inter-Rater Reliability</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-[#3a0f34]">
              {agreement ? kappa.toFixed(3) : "—"}
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${kappaMeta.color}`}>
              {kappaMeta.label}
            </span>
          </div>
          <p className="text-[11px] text-[#62535d] mt-2">
            Target benchmark: <span className="font-semibold text-[#3a0f34]">&kappa; &ge; 0.70</span> recommended by Cochrane Systematic Review Handbook.
          </p>
        </div>

        {/* Metric 2: Concordance & Percent Agreement */}
        <div className="p-4 bg-white rounded-xl border border-[#d2c2cb] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#62535d] mb-1">
            <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3a0f34]" /> Percentage Agreement
            </span>
            <span className="text-[10px] font-mono text-[#81737b]">Observed Concordance</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-[#3a0f34]">
              {percentAgreement.toFixed(1)}%
            </span>
            <span className="text-xs text-[#62535d]">
              ({agreement?.total_dual_screened ?? 0} studies dual-screened)
            </span>
          </div>
          <div className="w-full bg-[#eee7ec] rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="bg-[#3a0f34] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, percentAgreement))}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Conflicts Status */}
        <div className="p-4 bg-white rounded-xl border border-[#d2c2cb] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#62535d] mb-1">
            <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#ffdea6]" /> Divergence &amp; Conflicts
            </span>
            <span className="text-[10px] font-mono text-[#81737b]">Adjudication Queue</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-[#3a0f34]">
              {unresolvedConflicts.length}
            </span>
            <span className="text-xs text-[#3a0f34] font-semibold bg-[#ffdea6]/40 px-2 py-0.5 rounded-full border border-[#d2c2cb]">Unresolved Disagreements</span>
          </div>
          <p className="text-[11px] text-[#62535d] mt-2">
            {resolvedConflicts.length} conflicts resolved and reconciled into consensus.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 border-b border-[#d2c2cb] bg-white flex items-center gap-4">
        <button
          onClick={() => setActiveTab("conflicts")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "conflicts"
              ? "border-[#3a0f34] text-[#3a0f34]"
              : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-[#814d75]" />
          <span>Disagreement Adjudication</span>
          {unresolvedConflicts.length > 0 && (
            <span className="px-1.5 py-0.2 bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] rounded-full text-[10px] font-mono font-bold">
              {unresolvedConflicts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("matrix")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "matrix"
              ? "border-[#3a0f34] text-[#3a0f34]"
              : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5 text-[#814d75]" />
          <span>2&times;2 Concordance Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "settings"
              ? "border-[#3a0f34] text-[#3a0f34]"
              : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
          }`}
        >
          <EyeOff className="w-3.5 h-3.5 text-[#814d75]" />
          <span>Blind Mode Protocol &amp; Rules</span>
        </button>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#fbf9f4]">
        {/* TAB 1: CONFLICTS & ADJUDICATION */}
        {activeTab === "conflicts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConflictFilter("unresolved")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                    conflictFilter === "unresolved"
                      ? "bg-[#3a0f34] text-[#fbf9f4] shadow-2xs border border-[#3a0f34]"
                      : "bg-white text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                  }`}
                >
                  Unresolved ({unresolvedConflicts.length})
                </button>
                <button
                  onClick={() => setConflictFilter("resolved")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                    conflictFilter === "resolved"
                      ? "bg-[#3a0f34] text-[#fbf9f4] shadow-2xs border border-[#3a0f34]"
                      : "bg-white text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                  }`}
                >
                  Resolved ({resolvedConflicts.length})
                </button>
                <button
                  onClick={() => setConflictFilter("all")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                    conflictFilter === "all"
                      ? "bg-[#3a0f34] text-[#fbf9f4] shadow-2xs border border-[#3a0f34]"
                      : "bg-white text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                  }`}
                >
                  All ({allConflicts.length})
                </button>
              </div>
              <p className="text-xs text-[#81737b]">
                Adjudications immediately update the study consensus status.
              </p>
            </div>

            {displayedConflicts.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-[#d2c2cb] shadow-2xs">
                <CheckCircle2 className="w-10 h-10 text-[#3a0f34] mx-auto mb-3" />
                <h3 className="text-sm font-serif font-bold text-[#3a0f34]">No Disagreements in this Queue</h3>
                <p className="text-xs text-[#62535d] mt-1 max-w-sm mx-auto">
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
                      className={`p-5 rounded-xl border transition-all bg-white shadow-2xs ${
                        isResolved ? "border-[#d2c2cb] opacity-90" : "border-[#ffdea6] hover:border-[#814d75]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase border ${
                              isResolved ? "bg-[#eee7ec] text-[#62535d] border-[#d2c2cb]" : "bg-[#ffdea6]/40 text-[#3a0f34] border-[#d2c2cb]"
                            }`}>
                              {c.status}
                            </span>
                            <span className="text-xs font-mono text-[#81737b]">Stage: {c.stage.toUpperCase()}</span>
                          </div>
                          <h3
                            onClick={() => onSelectStudy && onSelectStudy(c.study_id)}
                            className="text-sm font-serif font-bold text-[#3a0f34] hover:text-[#814d75] cursor-pointer"
                          >
                            {c.study_title || `Study #${c.study_id}`}
                          </h3>
                        </div>
                        {onSelectStudy && (
                          <button
                            onClick={() => onSelectStudy(c.study_id)}
                            className="text-xs text-[#814d75] hover:text-[#3a0f34] flex items-center gap-1 shrink-0 font-semibold cursor-pointer"
                          >
                            <span>Inspect Study</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Reviewer Decisions Side-by-Side Comparison */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <div className="p-3 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
                          <div className="flex items-center justify-between text-xs text-[#62535d] mb-1">
                            <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-[#814d75]" /> Reviewer 1
                            </span>
                            <span className="font-mono text-[10px] text-[#81737b]">{c.reviewer1_id || "rev_1"}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md uppercase border ${
                              c.reviewer1_decision === "included" || c.reviewer1_decision === "include"
                                ? "bg-[#3a0f34] text-[#fbf9f4] border-[#3a0f34]"
                                : c.reviewer1_decision === "excluded" || c.reviewer1_decision === "exclude"
                                ? "bg-[#ab3329]/10 text-[#ab3329] border-[#ab3329]/30"
                                : "bg-[#ffdea6] text-[#3a0f34] border-[#d2c2cb]"
                            }`}>
                              {c.reviewer1_decision}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
                          <div className="flex items-center justify-between text-xs text-[#62535d] mb-1">
                            <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-[#814d75]" /> Reviewer 2
                            </span>
                            <span className="font-mono text-[10px] text-[#81737b]">{c.reviewer2_id || "rev_2"}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md uppercase border ${
                              c.reviewer2_decision === "included" || c.reviewer2_decision === "include"
                                ? "bg-[#3a0f34] text-[#fbf9f4] border-[#3a0f34]"
                                : c.reviewer2_decision === "excluded" || c.reviewer2_decision === "exclude"
                                ? "bg-[#ab3329]/10 text-[#ab3329] border-[#ab3329]/30"
                                : "bg-[#ffdea6] text-[#3a0f34] border-[#d2c2cb]"
                            }`}>
                              {c.reviewer2_decision}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Adjudication Action Bar */}
                      {!isResolved ? (
                        <div className="mt-4 pt-4 border-t border-[#d2c2cb]">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-[#62535d] font-semibold">
                              <Scale className="w-3.5 h-3.5 text-[#814d75]" />
                              <span>Adjudicate Final Decision:</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "included")}
                                className="px-3.5 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded-lg flex items-center gap-1 shadow-2xs transition-all border border-[#3a0f34] disabled:opacity-50 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Include</span>
                              </button>
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "excluded")}
                                className="px-3.5 py-1.5 text-xs font-semibold text-[#ab3329] bg-white hover:bg-[#ab3329]/10 border border-[#ab3329]/40 rounded-lg flex items-center gap-1 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Exclude</span>
                              </button>
                              <button
                                disabled={resolvingId === c.conflict_id}
                                onClick={() => handleResolve(c.conflict_id, "maybe")}
                                className="px-3.5 py-1.5 text-xs font-semibold text-[#3a0f34] bg-[#ffdea6] hover:bg-[#ffd580] border border-[#d2c2cb] rounded-lg flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
                              >
                                <HelpCircle className="w-3.5 h-3.5 text-[#814d75]" />
                                <span>Require Full-Text</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3.5 p-3 rounded-lg bg-[#fbf9f4] border border-[#d2c2cb] flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[#3a0f34]" />
                            <span className="font-semibold text-[#4f444b]">
                              Resolved as: <span className="uppercase text-[#3a0f34] font-bold">{c.resolution}</span>
                            </span>
                          </div>
                          <span className="text-[11px] text-[#81737b] font-mono">
                            By {c.resolved_by || "Adjudicator"} &bull; {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "Consensus"}
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
            <div className="p-6 bg-white rounded-xl border border-[#d2c2cb] shadow-2xs">
              <h3 className="text-sm font-serif font-bold text-[#3a0f34] mb-1">2&times;2 Dual Reviewer Decision Matrix</h3>
              <p className="text-xs text-[#62535d] mb-4">
                Cross-tabulation of independent reviewer screening judgments across Title &amp; Abstract stages.
              </p>

              <div className="max-w-md mx-auto my-4 border border-[#d2c2cb] rounded-lg overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-[#eee7ec] text-[#3a0f34] font-semibold border-b border-[#d2c2cb]">
                      <th className="p-3 text-left border-r border-[#d2c2cb]">Reviewer 1 \ Reviewer 2</th>
                      <th className="p-3 bg-[#fbf9f4] text-[#3a0f34] border-r border-[#d2c2cb]">Include</th>
                      <th className="p-3 bg-[#fbf9f4] text-[#ab3329] border-r border-[#d2c2cb]">Exclude</th>
                      <th className="p-3 bg-[#eee7ec] text-[#62535d]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#d2c2cb]">
                      <td className="p-3 font-semibold text-left bg-[#fbf9f4] text-[#3a0f34] border-r border-[#d2c2cb]">
                        Include
                      </td>
                      <td className="p-3 font-mono font-bold text-[#3a0f34] bg-white border-r border-[#d2c2cb]">
                        {agreement?.concordant_includes ?? 0}
                        <span className="block text-[9px] text-[#81737b] font-normal">Concordant (a)</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-[#814d75] bg-[#ffdea6]/20 border-r border-[#d2c2cb]">
                        {agreement?.pairwise_reviewers?.[0]?.b ?? 0}
                        <span className="block text-[9px] text-[#81737b] font-normal">Conflict (b)</span>
                      </td>
                      <td className="p-3 font-mono text-[#4f444b] bg-[#fbf9f4]">
                        {(agreement?.concordant_includes ?? 0) + (agreement?.pairwise_reviewers?.[0]?.b ?? 0)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#d2c2cb]">
                      <td className="p-3 font-semibold text-left bg-[#fbf9f4] text-[#ab3329] border-r border-[#d2c2cb]">
                        Exclude
                      </td>
                      <td className="p-3 font-mono font-bold text-[#814d75] bg-[#ffdea6]/20 border-r border-[#d2c2cb]">
                        {agreement?.pairwise_reviewers?.[0]?.c ?? 0}
                        <span className="block text-[9px] text-[#81737b] font-normal">Conflict (c)</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-[#4f444b] bg-white border-r border-[#d2c2cb]">
                        {agreement?.concordant_excludes ?? 0}
                        <span className="block text-[9px] text-[#81737b] font-normal">Concordant (d)</span>
                      </td>
                      <td className="p-3 font-mono text-[#4f444b] bg-[#fbf9f4]">
                        {(agreement?.pairwise_reviewers?.[0]?.c ?? 0) + (agreement?.concordant_excludes ?? 0)}
                      </td>
                    </tr>
                    <tr className="bg-[#eee7ec] font-semibold text-[#3a0f34]">
                      <td className="p-3 text-left border-r border-[#d2c2cb]">Total</td>
                      <td className="p-3 font-mono border-r border-[#d2c2cb]">
                        {(agreement?.concordant_includes ?? 0) + (agreement?.pairwise_reviewers?.[0]?.c ?? 0)}
                      </td>
                      <td className="p-3 font-mono border-r border-[#d2c2cb]">
                        {(agreement?.pairwise_reviewers?.[0]?.b ?? 0) + (agreement?.concordant_excludes ?? 0)}
                      </td>
                      <td className="p-3 font-mono font-bold text-[#3a0f34]">
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
            <div className="p-6 bg-white rounded-xl border border-[#d2c2cb] shadow-2xs space-y-5">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#3a0f34]">Systematic Review Blind Mode Settings</h3>
                <p className="text-xs text-[#62535d] mt-0.5">
                  Configure double-blind protocol parameters to satisfy PRISMA 2020 and Cochrane rigor standards.
                </p>
              </div>

              {/* Blind Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
                <div className="space-y-0.5 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#3a0f34]">Double-Blind Screening Mask</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isBlindMode ? "bg-[#3a0f34] text-[#fbf9f4] border-[#3a0f34]" : "bg-[#eee7ec] text-[#62535d] border-[#d2c2cb]"}`}>
                      {isBlindMode ? "ENABLED" : "DISABLED"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#62535d]">
                    When active, peer reviews and AI suggestions are concealed from each reviewer until their own decision is locked.
                  </p>
                </div>
                <button
                  disabled={updateConfigMutation.isPending}
                  onClick={() => updateConfigMutation.mutate({ blind_mode: !isBlindMode })}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                    isBlindMode
                      ? "bg-white text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                      : "bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017]"
                  }`}
                >
                  {isBlindMode ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{isBlindMode ? "Lift Blind" : "Enable Blind Mode"}</span>
                </button>
              </div>

              {/* Required Reviewers */}
              <div className="flex items-center justify-between p-4 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[#3a0f34] block">Required Reviewers per Study</span>
                  <span className="text-[11px] text-[#62535d] block">
                    Number of independent human reviewers required before a study decision can be unblinded.
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-xs">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      disabled={updateConfigMutation.isPending}
                      onClick={() => updateConfigMutation.mutate({ n_reviewers: n })}
                      className={`w-8 h-8 rounded-lg font-semibold transition-all cursor-pointer ${
                        (config?.n_reviewers ?? 2) === n
                          ? "bg-[#3a0f34] text-[#fbf9f4] shadow-2xs border border-[#3a0f34]"
                          : "bg-white text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conflict Mode */}
              <div className="flex items-center justify-between p-4 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[#3a0f34] block">Conflict Resolution Policy</span>
                  <span className="text-[11px] text-[#62535d] block">
                    Choose how divergent decisions between reviewers are reconciled.
                  </span>
                </div>
                <select
                  disabled={updateConfigMutation.isPending}
                  value={config?.conflict_mode || "manual"}
                  onChange={(e) => updateConfigMutation.mutate({ conflict_mode: e.target.value })}
                  className="input text-xs py-1.5 px-3 bg-white border border-[#d2c2cb] text-[#4f444b] rounded-lg"
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
