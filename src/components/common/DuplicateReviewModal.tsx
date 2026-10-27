import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, CheckCircle2, Copy, GitMerge, RotateCcw, ExternalLink,
  ChevronLeft, ChevronRight, AlertCircle, ShieldCheck, Sparkles,
  Layers, Search, Check, ArrowRight, ArrowLeftRight, HelpCircle,
  FileText, Calendar, User, BookOpen, Hash, Tag, RefreshCw
} from "lucide-react";
import {
  api,
  type DuplicateGroup,
  type DuplicateMatch,
  type DeduplicationResult,
  type DuplicateResolveRequest,
  type Study
} from "../../lib/api";

export interface DuplicateReviewModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onResolved?: () => void;
}

export function DuplicateReviewModal({
  projectId,
  isOpen,
  onClose,
  onResolved,
}: DuplicateReviewModalProps) {
  const queryClient = useQueryClient();

  // Selected group and candidate index
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeDuplicateIndex, setActiveDuplicateIndex] = useState(0);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isMergingInteractive, setIsMergingInteractive] = useState(false);
  const [customMergedFields, setCustomMergedFields] = useState<Record<string, any>>({});

  // Query duplicates
  const {
    data: dedupResult,
    isLoading,
    refetch,
    isRefetching
  } = useQuery<DeduplicationResult>({
    queryKey: ["duplicate_groups", projectId],
    queryFn: () => api.getDuplicateGroups(projectId),
    enabled: isOpen && !!projectId,
  });

  const duplicateGroups = useMemo(() => {
    return dedupResult?.duplicate_groups || [];
  }, [dedupResult]);

  // Filtered groups if user searches
  const filteredGroups = useMemo(() => {
    if (!searchFilter.trim()) return duplicateGroups;
    const q = searchFilter.toLowerCase();
    return duplicateGroups.filter((g) => {
      const matchCanonical =
        g.canonical_title?.toLowerCase().includes(q) ||
        g.canonical_authors?.toLowerCase().includes(q) ||
        g.canonical_doi?.toLowerCase().includes(q) ||
        g.canonical_pmid?.toLowerCase().includes(q);
      const matchDuplicates = g.duplicates.some(
        (d) =>
          d.title?.toLowerCase().includes(q) ||
          d.authors?.toLowerCase().includes(q) ||
          d.doi?.toLowerCase().includes(q) ||
          d.pmid?.toLowerCase().includes(q)
      );
      return matchCanonical || matchDuplicates;
    });
  }, [duplicateGroups, searchFilter]);

  // Safe boundary check
  const currentGroup: DuplicateGroup | undefined = filteredGroups[activeGroupIndex];
  const currentDuplicate: DuplicateMatch | undefined = currentGroup?.duplicates[activeDuplicateIndex];

  // Reset interactive merge states when current pair changes
  useEffect(() => {
    setIsMergingInteractive(false);
    setCustomMergedFields({});
    setStatusMessage(null);
  }, [activeGroupIndex, activeDuplicateIndex]);

  // Auto-fill custom merged fields preview
  useEffect(() => {
    if (currentGroup && currentDuplicate) {
      const defaults: Record<string, any> = {};
      // Auto-choose non-empty / richer fields
      if (!currentGroup.canonical_doi && currentDuplicate.doi) defaults.doi = currentDuplicate.doi;
      if (!currentGroup.canonical_pmid && currentDuplicate.pmid) defaults.pmid = currentDuplicate.pmid;
      if (!currentGroup.canonical_year && currentDuplicate.publication_year) defaults.publication_year = currentDuplicate.publication_year;
      if (!currentGroup.canonical_journal && currentDuplicate.journal) defaults.journal = currentDuplicate.journal;
      if ((currentDuplicate.abstract || "").length > (currentGroup.canonical_abstract || "").length) {
        defaults.abstract = currentDuplicate.abstract;
      }
      setCustomMergedFields(defaults);
    }
  }, [currentGroup, currentDuplicate]);

  // Mutation to resolve duplicate decision
  const resolveMutation = useMutation({
    mutationFn: (payload: DuplicateResolveRequest) =>
      api.resolveDuplicate(projectId, payload),
    onSuccess: (data) => {
      setStatusMessage({
        type: "success",
        text: data.message || `Decision '${data.action}' recorded successfully.`,
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma", projectId] });
      if (onResolved) onResolved();
    },
    onError: (err: any) => {
      setStatusMessage({
        type: "error",
        text: `Error resolving duplicate: ${err?.message || "Unknown error"}`,
      });
    },
  });

  const handleResolve = (action: "keep_primary" | "keep_both" | "merge_metadata" | "revert_duplicate") => {
    if (!currentGroup || !currentDuplicate) return;

    resolveMutation.mutate({
      action,
      primary_study_id: currentGroup.canonical_study_id,
      duplicate_study_id: currentDuplicate.study_id,
      group_id: currentGroup.group_id,
      merged_fields: action === "merge_metadata" ? customMergedFields : undefined,
    });
  };

  const handleAutoResolveExactDois = async () => {
    if (!duplicateGroups.length) return;
    let resolvedCount = 0;
    for (const group of duplicateGroups) {
      for (const dup of group.duplicates) {
        if (dup.match_reason === "doi" || dup.match_reason === "pmid") {
          await api.resolveDuplicate(projectId, {
            action: "keep_primary",
            primary_study_id: group.canonical_study_id,
            duplicate_study_id: dup.study_id,
            group_id: group.group_id,
          });
          resolvedCount++;
        }
      }
    }
    setStatusMessage({
      type: "success",
      text: `Auto-resolved ${resolvedCount} exact DOI / PMID candidate matches.`,
    });
    refetch();
    queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    queryClient.invalidateQueries({ queryKey: ["prisma", projectId] });
  };

  if (!isOpen) return null;

  const totalGroups = filteredGroups.length;
  const resolvedCount = duplicateGroups.reduce(
    (acc, g) => acc + g.duplicates.filter((d) => d.is_duplicate === 1).length,
    0
  );
  const totalDuplicates = duplicateGroups.reduce((acc, g) => acc + g.duplicates.length, 0);

  const getReasonBadge = (reason: string, score: number) => {
    switch (reason) {
      case "doi":
        return {
          label: "DOI Exact Match (100%)",
          color: "bg-emerald-100 text-emerald-800 border-emerald-300",
          desc: "Normalized digital object identifiers match identical publication records.",
        };
      case "pmid":
        return {
          label: "PMID Exact Match (100%)",
          color: "bg-emerald-100 text-emerald-800 border-emerald-300",
          desc: "PubMed IDs match identical bibliographic records in NLM database.",
        };
      case "title_similarity":
        return {
          label: `Title Similarity (${Math.round((score || 0.95) * 100)}%)`,
          color: "bg-amber-100 text-amber-800 border-amber-300",
          desc: `High title textual similarity score of ${score.toFixed(3)}.`,
        };
      case "author_year":
        return {
          label: "Title & Author/Year Match",
          color: "bg-indigo-100 text-indigo-800 border-indigo-300",
          desc: "Matching normalized title, matching publication year and overlapping first author.",
        };
      default:
        return {
          label: `Candidate Match (${Math.round((score || 0.9) * 100)}%)`,
          color: "bg-slate-100 text-slate-800 border-slate-300",
          desc: "Potential duplicate publication identified by screening heuristics.",
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in duration-200">
      <div className="bg-[#FAF9F3] border border-black/15 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-black/10 bg-white/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#141413] text-[#FAF9F3] flex items-center justify-center shadow-xs">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl sm:text-2xl font-normal text-[#141413] tracking-tight">
                  Studies → Duplicate Review Workspace
                </h2>
                <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">
                  DEDUPLICATION STEP
                </span>
                {totalDuplicates > 0 && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-black/5 text-[#6B665E] border border-black/10">
                    {resolvedCount} of {totalDuplicates} Resolved
                  </span>
                )}
              </div>
              <p className="font-serif italic text-xs text-[#6B665E] mt-0.5">
                Side-by-side title, abstract, DOI, PMID, year and authors comparison. Keep this record, Keep both, or Merge metadata.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {duplicateGroups.some((g) => g.duplicates.some((d) => d.match_reason === "doi" || d.match_reason === "pmid")) && (
              <button
                type="button"
                onClick={handleAutoResolveExactDois}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-medium transition-colors"
                title="Automatically keep primary for all exact DOI/PMID matches"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Resolve Exact DOIs</span>
              </button>
            )}
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-1.5 rounded-lg text-black/60 hover:text-black hover:bg-black/5 transition-colors disabled:opacity-40"
              title="Refresh duplicates"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-black/40 hover:text-black hover:bg-black/5 transition-colors"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-sans flex items-center justify-between border-b ${
              statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : statusMessage.type === "error"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs hover:underline opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="py-24 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-black/40" />
              <p className="font-serif italic text-sm text-[#6B665E]">
                Scanning repository for duplicate bibliographic records (DOI, PMID, title Levenshtein, author/year)...
              </p>
            </div>
          ) : totalGroups === 0 ? (
            <div className="card-phylo-warm p-12 text-center rounded-2xl max-w-xl mx-auto space-y-4 my-8 border border-black/10">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="font-serif text-2xl font-normal text-[#141413]">
                No Duplicate Records Found
              </h3>
              <p className="font-sans text-xs text-[#6B665E] leading-relaxed">
                All indexed studies in this project have distinct titles, DOIs, PMIDs, and author distributions. Any previously excluded duplicates have been processed.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-phylo-primary text-xs px-5 py-2"
                >
                  Return to Studies Workspace
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Stepper & Match Reason Bar */}
              <div className="bg-white border border-black/10 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#8A817A]">
                    DUPLICATE PAIR:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={activeGroupIndex === 0}
                      onClick={() => {
                        setActiveGroupIndex((prev) => Math.max(0, prev - 1));
                        setActiveDuplicateIndex(0);
                      }}
                      className="p-1 rounded border border-black/15 hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Previous duplicate group"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="font-mono text-xs px-2.5 py-1 rounded bg-black/5 text-[#141413] font-medium">
                      Group {activeGroupIndex + 1} of {totalGroups}
                    </span>
                    <button
                      type="button"
                      disabled={activeGroupIndex >= totalGroups - 1}
                      onClick={() => {
                        setActiveGroupIndex((prev) => Math.min(totalGroups - 1, prev + 1));
                        setActiveDuplicateIndex(0);
                      }}
                      className="p-1 rounded border border-black/15 hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Next duplicate group"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {currentGroup && currentGroup.duplicates.length > 1 && (
                    <div className="flex items-center gap-1 ml-2">
                      <span className="text-[11px] text-[#8A817A] font-mono">Variant:</span>
                      {currentGroup.duplicates.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveDuplicateIndex(idx)}
                          className={`text-xs px-2 py-0.5 rounded font-mono ${
                            activeDuplicateIndex === idx
                              ? "bg-[#141413] text-white"
                              : "bg-black/5 text-black/70 hover:bg-black/10"
                          }`}
                        >
                          #{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Match reason badge */}
                {currentDuplicate && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const badge = getReasonBadge(currentDuplicate.match_reason, currentDuplicate.similarity_score);
                      return (
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium border flex items-center gap-1.5 ${badge.color}`}
                            title={badge.desc}
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>{badge.label}</span>
                          </span>
                          <span className="text-[11px] text-[#6B665E] hidden lg:inline italic">
                            {badge.desc}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Side-by-Side Comparison Workspace */}
              {currentGroup && currentDuplicate && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Left Column: Primary / Canonical Record */}
                  <div className="bg-white border-2 border-emerald-500/40 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative">
                    <div className="space-y-4">
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                            KEEP THIS (PRIMARY)
                          </span>
                          <span className="text-[11px] font-mono text-[#8A817A]">
                            ID: {currentGroup.canonical_study_id}
                          </span>
                        </div>
                        <span className="text-xs font-sans text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Canonical Record</span>
                        </span>
                      </div>

                      {/* Title */}
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-1">
                          TITLE:
                        </span>
                        <h4 className="font-serif text-base sm:text-lg font-medium text-[#141413] leading-snug">
                          {currentGroup.canonical_title || "Untitled Record"}
                        </h4>
                      </div>

                      {/* Authors & Year */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-0.5">
                            AUTHORS:
                          </span>
                          <span className="font-medium text-[#141413]">
                            {currentGroup.canonical_authors || "Authors not specified"}
                          </span>
                        </div>
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-0.5">
                            YEAR & JOURNAL:
                          </span>
                          <span className="font-medium text-[#141413]">
                            {currentGroup.canonical_year || "N/A"} &bull; {currentGroup.canonical_journal || "Journal not specified"}
                          </span>
                        </div>
                      </div>

                      {/* Identifiers: DOI & PMID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block">
                              DOI:
                            </span>
                            <span className="font-mono text-xs text-[#141413] break-all">
                              {currentGroup.canonical_doi || (
                                <span className="text-black/40 italic">Not recorded</span>
                              )}
                            </span>
                          </div>
                          {currentGroup.canonical_doi && (
                            <a
                              href={`https://doi.org/${currentGroup.canonical_doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-black/50 hover:text-black shrink-0"
                              title="Open DOI"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block">
                              PMID:
                            </span>
                            <span className="font-mono text-xs text-[#141413]">
                              {currentGroup.canonical_pmid || (
                                <span className="text-black/40 italic">Not recorded</span>
                              )}
                            </span>
                          </div>
                          {currentGroup.canonical_pmid && (
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${currentGroup.canonical_pmid}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-black/50 hover:text-black shrink-0"
                              title="Open PubMed"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Abstract */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A]">
                            ABSTRACT:
                          </span>
                          <span className="text-[10px] font-mono text-[#8A817A]">
                            {(currentGroup.canonical_abstract || "").split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                        <div className="p-3 bg-[#FAF9F3] border border-black/10 rounded-xl text-xs text-[#33302C] leading-relaxed max-h-48 overflow-y-auto">
                          {currentGroup.canonical_abstract ? (
                            <p className="whitespace-pre-line">{currentGroup.canonical_abstract}</p>
                          ) : (
                            <p className="italic text-black/40">No abstract recorded for this primary record.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Column Quick State */}
                    <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between text-xs text-[#6B665E]">
                      <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Included in systematic synthesis</span>
                      </span>
                      <span className="font-mono text-[11px] text-[#8A817A]">
                        Status: {currentGroup.canonical_screening_status || "pending"}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Candidate Duplicate */}
                  <div className={`bg-white border-2 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative ${
                    currentDuplicate.is_duplicate === 1
                      ? "border-amber-400 bg-amber-50/20"
                      : "border-black/15"
                  }`}>
                    <div className="space-y-4">
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                            currentDuplicate.is_duplicate === 1
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : "bg-slate-100 text-slate-800 border-slate-300"
                          }`}>
                            {currentDuplicate.is_duplicate === 1 ? "MARKED AS DUPLICATE" : "CANDIDATE DUPLICATE"}
                          </span>
                          <span className="text-[11px] font-mono text-[#8A817A]">
                            ID: {currentDuplicate.study_id}
                          </span>
                        </div>
                        <span className="text-xs font-sans text-[#8A817A] flex items-center gap-1">
                          {currentDuplicate.is_duplicate === 1 ? (
                            <span className="text-amber-800 font-medium">Excluded Duplicate</span>
                          ) : (
                            <span>Awaiting Action</span>
                          )}
                        </span>
                      </div>

                      {/* Title with diff styling */}
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-1">
                          TITLE:
                        </span>
                        <h4 className="font-serif text-base sm:text-lg font-medium text-[#141413] leading-snug">
                          {currentDuplicate.title || "Untitled Record"}
                        </h4>
                      </div>

                      {/* Authors & Year */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-0.5">
                            AUTHORS:
                          </span>
                          <span className="font-medium text-[#141413]">
                            {currentDuplicate.authors || "Authors not specified"}
                          </span>
                        </div>
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block mb-0.5">
                            YEAR & JOURNAL:
                          </span>
                          <span className="font-medium text-[#141413]">
                            {currentDuplicate.publication_year || "N/A"} &bull; {currentDuplicate.journal || "Journal not specified"}
                          </span>
                        </div>
                      </div>

                      {/* Identifiers: DOI & PMID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block">
                              DOI:
                            </span>
                            <span className="font-mono text-xs text-[#141413] break-all">
                              {currentDuplicate.doi || (
                                <span className="text-black/40 italic">Not recorded</span>
                              )}
                            </span>
                          </div>
                          {currentDuplicate.doi && (
                            <a
                              href={`https://doi.org/${currentDuplicate.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-black/50 hover:text-black shrink-0"
                              title="Open DOI"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="bg-[#FAF9F3] p-2.5 rounded-lg border border-black/5 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A] block">
                              PMID:
                            </span>
                            <span className="font-mono text-xs text-[#141413]">
                              {currentDuplicate.pmid || (
                                <span className="text-black/40 italic">Not recorded</span>
                              )}
                            </span>
                          </div>
                          {currentDuplicate.pmid && (
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${currentDuplicate.pmid}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-black/50 hover:text-black shrink-0"
                              title="Open PubMed"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Abstract */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A817A]">
                            ABSTRACT:
                          </span>
                          <span className="text-[10px] font-mono text-[#8A817A]">
                            {(currentDuplicate.abstract || "").split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                        <div className="p-3 bg-[#FAF9F3] border border-black/10 rounded-xl text-xs text-[#33302C] leading-relaxed max-h-48 overflow-y-auto">
                          {currentDuplicate.abstract ? (
                            <p className="whitespace-pre-line">{currentDuplicate.abstract}</p>
                          ) : (
                            <p className="italic text-black/40">No abstract recorded for this candidate.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Duplicate Status Tag */}
                    <div className="pt-3 border-t border-black/[0.08] flex items-center justify-between text-xs text-[#6B665E]">
                      <span className="font-mono text-[11px]">
                        Similarity: {(currentDuplicate.similarity_score * 100).toFixed(1)}% ({currentDuplicate.match_reason})
                      </span>
                      <span className="font-mono text-[11px] text-[#8A817A]">
                        Current: {currentDuplicate.is_duplicate === 1 ? "Excluded Duplicate" : "Active / Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Merge Options Drawer */}
              {isMergingInteractive && currentGroup && currentDuplicate && (
                <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitMerge className="h-4 w-4 text-amber-800" />
                      <h4 className="font-serif text-sm font-medium text-amber-900">
                        Merge Metadata into Primary Record
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMergingInteractive(false)}
                      className="text-xs text-amber-800 hover:underline"
                    >
                      Cancel Merge Customization
                    </button>
                  </div>
                  <p className="font-sans text-xs text-amber-800">
                    Select which non-empty fields from the duplicate candidate should overwrite or fill missing data on the primary study record:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                    {currentDuplicate.doi && currentDuplicate.doi !== currentGroup.canonical_doi && (
                      <label className="flex items-center gap-2 p-2 rounded bg-white border border-amber-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customMergedFields.doi === currentDuplicate.doi}
                          onChange={(e) => {
                            setCustomMergedFields((prev) => ({
                              ...prev,
                              doi: e.target.checked ? currentDuplicate.doi : undefined,
                            }));
                          }}
                        />
                        <span>Adopt DOI: <strong className="font-mono">{currentDuplicate.doi}</strong></span>
                      </label>
                    )}
                    {currentDuplicate.pmid && currentDuplicate.pmid !== currentGroup.canonical_pmid && (
                      <label className="flex items-center gap-2 p-2 rounded bg-white border border-amber-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customMergedFields.pmid === currentDuplicate.pmid}
                          onChange={(e) => {
                            setCustomMergedFields((prev) => ({
                              ...prev,
                              pmid: e.target.checked ? currentDuplicate.pmid : undefined,
                            }));
                          }}
                        />
                        <span>Adopt PMID: <strong className="font-mono">{currentDuplicate.pmid}</strong></span>
                      </label>
                    )}
                    {currentDuplicate.journal && currentDuplicate.journal !== currentGroup.canonical_journal && (
                      <label className="flex items-center gap-2 p-2 rounded bg-white border border-amber-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customMergedFields.journal === currentDuplicate.journal}
                          onChange={(e) => {
                            setCustomMergedFields((prev) => ({
                              ...prev,
                              journal: e.target.checked ? currentDuplicate.journal : undefined,
                            }));
                          }}
                        />
                        <span>Adopt Journal: <strong>{currentDuplicate.journal}</strong></span>
                      </label>
                    )}
                    {currentDuplicate.publication_year && currentDuplicate.publication_year !== currentGroup.canonical_year && (
                      <label className="flex items-center gap-2 p-2 rounded bg-white border border-amber-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customMergedFields.publication_year === currentDuplicate.publication_year}
                          onChange={(e) => {
                            setCustomMergedFields((prev) => ({
                              ...prev,
                              publication_year: e.target.checked ? currentDuplicate.publication_year : undefined,
                            }));
                          }}
                        />
                        <span>Adopt Year: <strong>{currentDuplicate.publication_year}</strong></span>
                      </label>
                    )}
                    {currentDuplicate.abstract && (currentDuplicate.abstract || "").length > (currentGroup.canonical_abstract || "").length && (
                      <label className="flex items-center gap-2 p-2 rounded bg-white border border-amber-200 cursor-pointer col-span-1 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={customMergedFields.abstract === currentDuplicate.abstract}
                          onChange={(e) => {
                            setCustomMergedFields((prev) => ({
                              ...prev,
                              abstract: e.target.checked ? currentDuplicate.abstract : undefined,
                            }));
                          }}
                        />
                        <span>Adopt Richer Abstract (Candidate has {(currentDuplicate.abstract || "").length} chars vs {(currentGroup.canonical_abstract || "").length} chars)</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons Toolbar */}
              <div className="bg-[#FAF9F3] border border-black/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#6B665E] space-y-1">
                  <div className="font-serif font-medium text-[#141413] text-sm">
                    Resolution Protocol for Duplicate Pair:
                  </div>
                  <p>
                    Reversible decision marking. You can reverse any action at any time without data loss.
                  </p>
                </div>

                <div className="flex items-center flex-wrap gap-2.5 w-full md:w-auto justify-end">
                  {/* Keep Both (Reversible unmarking) */}
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={() => handleResolve("keep_both")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-black/20 bg-white hover:bg-black/5 text-[#141413] text-xs font-medium transition-all shadow-2xs"
                    title="Retain both records as distinct active studies in the review"
                  >
                    <ShieldCheck className="h-4 w-4 text-[#6B665E]" />
                    <span>Keep Both</span>
                  </button>

                  {/* Merge Metadata */}
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={() => {
                      if (!isMergingInteractive) {
                        setIsMergingInteractive(true);
                      } else {
                        handleResolve("merge_metadata");
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all shadow-2xs ${
                      isMergingInteractive
                        ? "bg-amber-600 text-white border-amber-700 hover:bg-amber-700"
                        : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    }`}
                    title="Merge missing fields into primary record and mark duplicate"
                  >
                    <GitMerge className="h-4 w-4" />
                    <span>{isMergingInteractive ? "Apply Merge & Keep Primary" : "Merge Metadata"}</span>
                  </button>

                  {/* Keep This Record (Primary) */}
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={() => handleResolve("keep_primary")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#141413] text-[#FAF9F3] hover:bg-black/85 text-xs font-medium transition-all shadow-xs"
                    title="Retain primary record as active and mark candidate as duplicate"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[#E9ED4C]" />
                    <span>Keep This Record</span>
                  </button>

                  {/* Revert / Restore if already marked */}
                  {currentDuplicate?.is_duplicate === 1 && (
                    <button
                      type="button"
                      disabled={resolveMutation.isPending}
                      onClick={() => handleResolve("revert_duplicate")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 text-xs font-medium transition-colors"
                      title="Reversibly unmark duplicate and restore both records"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Revert Duplicate</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-black/10 bg-white/70 flex items-center justify-between text-xs text-[#8A817A] shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono">PRISMA 2020 Protocol Compliant</span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="hidden sm:inline">Reversible Duplicate Exclusion</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-black/15 text-[#141413] hover:bg-black/5 transition-colors font-medium text-xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
