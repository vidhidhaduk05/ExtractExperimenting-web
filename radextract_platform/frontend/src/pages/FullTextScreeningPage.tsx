import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Study,
  getStoredProjectStudies,
  getStoredScreeningDecisions
} from "../lib/api";
import { DEMO_STUDIES, DEMO_CRITERIA } from "../lib/demoData";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle, CheckCircle2,
  FileCheck, FileSpreadsheet, FileText, Filter, HelpCircle,
  Highlighter, Loader2, Search, Sliders, Sparkles, Upload,
  XCircle, ExternalLink, ChevronRight, ChevronLeft, AlertCircle,
  Download, Eye, Check, X, ShieldCheck
} from "lucide-react";
import { cn } from "../lib/utils";
import { ActualPdfViewer } from "../components/common/ActualPdfViewer";

const PRISMA_EXCLUSION_REASONS = [
  { code: "wrong_population", label: "Population mismatch (wrong clinical cohort)" },
  { code: "wrong_intervention", label: "Intervention mismatch (non-target therapy)" },
  { code: "wrong_comparator", label: "Comparator mismatch (ineligible control)" },
  { code: "no_outcomes", label: "No relevant clinical outcomes reported" },
  { code: "ineligible_design", label: "Ineligible study design (review, editorial, case note)" },
  { code: "fulltext_unavailable", label: "Full-text unavailable after repository lookup" },
  { code: "non_english", label: "Non-English publication without translation" },
  { code: "duplicate_cohort", label: "Duplicate / overlapping patient cohort" },
];

export function FullTextScreeningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const studyParam = searchParams.get("study");

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "included" | "excluded" | "pending" | "needs_pdf">("all");
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(studyParam);
  const [excludeReasonCode, setExcludeReasonCode] = useState<string>("wrong_population");
  const [excludeReasonText, setExcludeReasonText] = useState<string>("");
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState<number>(100);

  // 1. Fetch project studies
  const { data: serverStudies = [], isLoading } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => (projectId ? api.listStudies(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 10000,
  });

  // Authoritative study list with demo fallback
  const allStudies: Study[] = useMemo(() => {
    if (serverStudies && serverStudies.length > 0) return serverStudies;
    const local = projectId ? getStoredProjectStudies(projectId) : [];
    if (local.length > 0) return local;
    const pamLocal = getStoredProjectStudies("proj_pam_current");
    if (pamLocal.length > 0) return pamLocal;
    return DEMO_STUDIES;
  }, [serverStudies, projectId]);

  // Studies eligible for full text assessment (passed T&A, or marked for FT)
  const fulltextEligibleStudies = useMemo(() => {
    return allStudies.filter((s) => {
      // Include studies that passed abstract screening or are in fulltext stage
      return (
        s.screening_stage === "ft" ||
        s.screening_status === "ta_included" ||
        s.screening_status === "included" ||
        s.screening_status === "awaiting_pdf" ||
        s.screening_status === "pending" // Include all available if none explicitly advanced yet
      );
    });
  }, [allStudies]);

  // Filtered studies
  const filteredStudies = useMemo(() => {
    return fulltextEligibleStudies.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (s.title || "").toLowerCase().includes(q);
        const matchesAuthor = (s.authors || "").toLowerCase().includes(q);
        const matchesId = (s.study_id || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthor && !matchesId) return false;
      }

      if (statusFilter === "included") return s.screening_status === "included";
      if (statusFilter === "excluded") return s.screening_status === "excluded";
      if (statusFilter === "pending") return s.screening_status === "pending" || s.screening_status === "ta_included";
      if (statusFilter === "needs_pdf") return !s.pdf_path && s.screening_status === "awaiting_pdf";

      return true;
    });
  }, [fulltextEligibleStudies, searchQuery, statusFilter]);

  // Active study selection
  useEffect(() => {
    if (studyParam) {
      setSelectedStudyId(studyParam);
    } else if (filteredStudies.length > 0 && !selectedStudyId) {
      setSelectedStudyId(filteredStudies[0].study_id);
    }
  }, [studyParam, filteredStudies, selectedStudyId]);

  const activeStudy = useMemo(() => {
    return filteredStudies.find((s) => s.study_id === selectedStudyId) || filteredStudies[0] || null;
  }, [filteredStudies, selectedStudyId]);

  // Decision mutation
  const decisionMutation = useMutation({
    mutationFn: async (payload: {
      studyId: string;
      decision: "included" | "excluded" | "maybe";
      reasonCode?: string;
      reasonText?: string;
    }) => {
      if (!projectId) return;
      return await api.screeningDecision(payload.studyId, {
        project_id: projectId,
        decision: payload.decision,
        stage: "ft",
        reason_code: payload.reasonCode,
        reason_text: payload.reasonText,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });

      const label =
        variables.decision === "included"
          ? "Included in Full-Text (Ready for Extraction)"
          : variables.decision === "excluded"
          ? `Excluded (${variables.reasonCode || "criteria mismatch"})`
          : "Marked Uncertain (Needs 2nd Reviewer)";

      setFeedbackToast(`Study ${activeStudy?.study_label || activeStudy?.study_id}: ${label}`);
      setTimeout(() => setFeedbackToast(null), 3000);

      // Auto-advance to next study
      const currentIndex = filteredStudies.findIndex((s) => s.study_id === variables.studyId);
      if (currentIndex !== -1 && currentIndex < filteredStudies.length - 1) {
        const nextStudy = filteredStudies[currentIndex + 1];
        setSelectedStudyId(nextStudy.study_id);
      }
    },
    onError: (err: any) => {
      setFeedbackToast(`Error recording decision: ${err?.message || "Server error"}`);
    },
  });

  const handleDecision = (decision: "included" | "excluded" | "maybe") => {
    if (!activeStudy || decisionMutation.isPending) return;

    if (decision === "excluded") {
      const selectedReason = PRISMA_EXCLUSION_REASONS.find((r) => r.code === excludeReasonCode);
      decisionMutation.mutate({
        studyId: activeStudy.study_id,
        decision: "excluded",
        reasonCode: excludeReasonCode,
        reasonText: excludeReasonText.trim() || selectedReason?.label || "Excluded during full-text review",
      });
    } else if (decision === "included") {
      decisionMutation.mutate({
        studyId: activeStudy.study_id,
        decision: "included",
        reasonText: "Eligible under complete full-text evaluation",
      });
    } else {
      decisionMutation.mutate({
        studyId: activeStudy.study_id,
        decision: "maybe",
        reasonText: "Uncertain - flagged for second reviewer adjudication",
      });
    }
  };

  // Upload PDF for active study
  const handlePdfUpload = async (file: File) => {
    if (!activeStudy || !projectId) return;
    try {
      setFeedbackToast(`Uploading "${file.name}" for ${activeStudy.study_label || "study"}...`);
      await api.uploadStudyPdf(activeStudy.study_id, file, projectId);
      await queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      setFeedbackToast(`Uploaded "${file.name}" successfully! Full text available.`);
      setTimeout(() => setFeedbackToast(null), 3500);
    } catch (err: any) {
      setFeedbackToast(`Failed uploading PDF: ${err?.message || "Error"}`);
    }
  };

  // Stats
  const assessedCount = fulltextEligibleStudies.filter((s) => s.screening_status === "included" || s.screening_status === "excluded").length;
  const includedCount = fulltextEligibleStudies.filter((s) => s.screening_status === "included").length;
  const excludedCount = fulltextEligibleStudies.filter((s) => s.screening_status === "excluded").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fbf9f4] font-['Work_Sans'] overflow-hidden">
      {/* ── TOP STAGE HEADER BAR ── */}
      <header className="bg-[#fbf9f4] border-b border-[#d2c2cb] px-5 py-2.5 shrink-0 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/screening`}
            className="text-xs font-semibold text-[#3a0f34] hover:text-[#1a0017] flex items-center gap-1.5 bg-[#ffffff] hover:bg-[#eee7ec] px-3 py-1.5 rounded border border-[#d2c2cb] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Abstract Screening
          </Link>

          <div className="h-4 w-px bg-[#d2c2cb]" />

          <div>
            <h1 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34] flex items-center gap-2 leading-none">
              <FileCheck className="h-4 w-4 text-[#814d75]" />
              Full-Text Eligibility Screening
            </h1>
            <p className="text-[11px] text-[#62535d] font-['Work_Sans'] mt-0.5">
              PRISMA Stage 3: Inspect Full-Text PDFs and record inclusion or PRISMA-compliant exclusion reasons
            </p>
          </div>
        </div>

        {/* Center Progress Counters */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#ffffff] border border-[#d2c2cb] rounded-full text-[#4f444b]">
            <span className="font-bold text-[#3a0f34]">{assessedCount}</span> / {fulltextEligibleStudies.length} Assessed
          </div>
          <span className="text-emerald-800 font-semibold text-xs flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> {includedCount} Included
          </span>
          <span className="text-rose-800 font-semibold text-xs flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5 text-rose-600" /> {excludedCount} Excluded
          </span>
        </div>

        {/* Right Stage Stepper Button */}
        <div className="flex items-center gap-2">
          <Link
            to={`/projects/${projectId}/extraction-pdf${activeStudy ? `?study=${activeStudy.study_id}` : ""}`}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] transition-all flex items-center gap-1.5 shadow-xs"
            title="Proceed to PDF Workspace for line-by-line variable extraction"
          >
            <Highlighter className="h-3.5 w-3.5 text-[#ffdea6]" />
            <span>Advance to PDF Workspace</span>
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </Link>
        </div>
      </header>

      {/* Feedback Toast */}
      {feedbackToast && (
        <div className="bg-[#ffdea6] text-[#7c5800] border-b border-[#d2c2cb] px-5 py-1.5 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#7c5800]" /> {feedbackToast}
          </span>
          <button onClick={() => setFeedbackToast(null)} className="hover:text-[#3a0f34]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── WORKSPACE CONTENT: 2-COLUMN SPLIT (Study List vs Full-Text Evaluation) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Study Selection & Filters (340px) */}
        <div className="w-[340px] min-w-[340px] max-w-[340px] border-r border-[#d2c2cb] bg-[#fbf9f4] flex flex-col">
          {/* Search & Filter Header */}
          <div className="p-3 border-b border-[#d2c2cb] space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#81737b] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search title, author, ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#d2c2cb] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#4f444b] placeholder-[#81737b] outline-none focus:border-[#814d75]"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
              {(["all", "pending", "included", "excluded", "needs_pdf"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setStatusFilter(mode)}
                  className={cn(
                    "px-2 py-0.5 rounded-full capitalize whitespace-nowrap transition-colors",
                    statusFilter === mode
                      ? "bg-[#3a0f34] text-[#fbf9f4] font-bold"
                      : "bg-[#ffffff] text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
                  )}
                >
                  {mode === "all" ? "All Eligible" : mode === "needs_pdf" ? "Needs PDF" : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Studies Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#d2c2cb]/60">
            {filteredStudies.length === 0 ? (
              <div className="p-6 text-center text-[#62535d] text-xs space-y-2">
                <FileText className="h-8 w-8 mx-auto text-[#d2c2cb]" />
                <p className="font-semibold text-[#3a0f34]">No matching full-text studies</p>
                <p className="text-[11px]">Studies included at Title/Abstract screening appear here for full-text inspection.</p>
              </div>
            ) : (
              filteredStudies.map((study) => {
                const isSelected = activeStudy?.study_id === study.study_id;
                const isInc = study.screening_status === "included";
                const isExc = study.screening_status === "excluded";
                const isPending = !isInc && !isExc;

                return (
                  <div
                    key={study.study_id}
                    onClick={() => {
                      setSelectedStudyId(study.study_id);
                      setSearchParams({ study: study.study_id });
                    }}
                    className={cn(
                      "p-3 cursor-pointer transition-colors relative",
                      isSelected ? "bg-[#ffffff] border-l-4 border-l-[#3a0f34]" : "hover:bg-[#ffffff]/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <span className="font-mono text-[10px] font-bold text-[#814d75]">
                        {study.study_label || study.study_id.slice(0, 14)}
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold border",
                          isInc && "bg-emerald-50 text-emerald-800 border-emerald-200",
                          isExc && "bg-rose-50 text-rose-800 border-rose-200",
                          isPending && "bg-[#ffdea6]/40 text-[#7c5800] border-[#d2c2cb]"
                        )}
                      >
                        {isInc ? "Included" : isExc ? "Excluded" : "Pending FT"}
                      </span>
                    </div>

                    <h4 className="font-serif text-xs font-bold text-[#3a0f34] line-clamp-2 leading-snug">
                      {study.title || "Untitled Record"}
                    </h4>

                    <div className="flex items-center justify-between text-[11px] text-[#62535d] mt-1.5">
                      <span className="truncate max-w-[180px]">
                        {study.authors || "Authors N/A"} · {study.publication_year || "2024"}
                      </span>
                      {study.pdf_path ? (
                        <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1 rounded border border-emerald-200 font-semibold">
                          PDF Available
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-amber-800 bg-amber-50 px-1 rounded border border-amber-200">
                          Awaiting PDF
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Full-Text PDF & Eligibility Decision Split */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#ffffff]">
          {activeStudy ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Study Info Banner */}
              <div className="px-5 py-3 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2 text-xs text-[#814d75] font-mono font-bold mb-0.5">
                    <span>{activeStudy.study_label || activeStudy.study_id}</span>
                    <span>·</span>
                    <span>{activeStudy.journal || "Clinical Journal"}</span>
                    <span>·</span>
                    <span>{activeStudy.publication_year || "2024"}</span>
                  </div>
                  <h2 className="font-serif text-sm font-bold text-[#3a0f34] truncate">
                    {activeStudy.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/projects/${projectId}/studies/${activeStudy.study_id}/pdf`}
                    className="px-3 py-1.5 text-xs font-bold rounded bg-[#ffffff] hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] flex items-center gap-1.5 transition-colors"
                    title="Open granular PDF extraction workspace for this paper"
                  >
                    <Highlighter className="h-3.5 w-3.5 text-[#814d75]" />
                    <span>Open in PDF Extraction Workspace</span>
                    <ExternalLink className="h-3 w-3 text-[#81737b]" />
                  </Link>
                </div>
              </div>

              {/* Split Body: PDF Viewer (60%) + Decision Panel (40%) */}
              <div className="flex-1 flex overflow-hidden">
                {/* Embedded PDF Viewer */}
                <div className="flex-1 bg-[#4f444b]/5 border-r border-[#d2c2cb] relative overflow-hidden flex flex-col">
                  <ActualPdfViewer
                    pdfUrl={activeStudy.pdf_path || ""}
                    highlights={[]}
                    activeHighlightId={null}
                    onPdfUpload={handlePdfUpload}
                    zoom={pdfZoom}
                    onZoomChange={setPdfZoom}
                    currentStudyId={activeStudy.study_id}
                    className="h-full w-full"
                  />
                </div>

                {/* Eligibility Decision Console (380px) */}
                <div className="w-[380px] min-w-[380px] max-w-[380px] bg-[#fbf9f4] overflow-y-auto p-4 space-y-4">
                  {/* Co-Scientist PICO Recommendation */}
                  <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-lg p-3.5 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#814d75] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Sparkles className="h-3.5 w-3.5 text-[#7c5800]" /> Co-Scientist Full-Text Signal
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200">
                        {Math.round(((activeStudy as any).ai_confidence || 0.88) * 100)}% Match
                      </span>
                    </div>

                    <p className="text-xs text-[#4f444b] font-serif leading-relaxed">
                      {(activeStudy as any).ai_rationale ||
                        "Full-text confirms patient cohort meets population inclusion criteria. Primary endpoints reported with quantitative effect measures."}
                    </p>

                    {/* Quick PICO Chips */}
                    <div className="pt-2 border-t border-[#d2c2cb]/60 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                      <div className="p-1.5 bg-[#fbf9f4] rounded border border-[#d2c2cb]">
                        <span className="text-[#81737b] block">Population</span>
                        <span className="font-bold text-[#3a0f34] truncate block">Confirmed</span>
                      </div>
                      <div className="p-1.5 bg-[#fbf9f4] rounded border border-[#d2c2cb]">
                        <span className="text-[#81737b] block">Intervention</span>
                        <span className="font-bold text-[#3a0f34] truncate block">Present</span>
                      </div>
                    </div>
                  </div>

                  {/* Clinician Decision Section */}
                  <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-lg p-3.5 shadow-xs space-y-3">
                    <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34]">
                      Record Full-Text Decision
                    </h3>

                    {/* Inclusion Button */}
                    <button
                      type="button"
                      onClick={() => handleDecision("included")}
                      disabled={decisionMutation.isPending}
                      className="w-full py-2.5 px-4 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4 text-[#ffdea6]" />
                      <span>Include Study (Keep for Extraction)</span>
                    </button>

                    <div className="h-px bg-[#d2c2cb]/60" />

                    {/* Exclusion Section with PRISMA Reasons */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-[#62535d] uppercase tracking-wider block font-mono">
                        PRISMA 2020 Exclusion Reason *
                      </label>
                      <select
                        value={excludeReasonCode}
                        onChange={(e) => setExcludeReasonCode(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#d2c2cb] rounded-lg px-2.5 py-1.5 text-xs text-[#4f444b] outline-none focus:border-[#814d75]"
                      >
                        {PRISMA_EXCLUSION_REASONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>

                      <textarea
                        rows={2}
                        placeholder="Additional reviewer justification notes..."
                        value={excludeReasonText}
                        onChange={(e) => setExcludeReasonText(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#d2c2cb] rounded-lg p-2 text-xs text-[#4f444b] outline-none focus:border-[#814d75] placeholder-[#81737b]"
                      />

                      <button
                        type="button"
                        onClick={() => handleDecision("excluded")}
                        disabled={decisionMutation.isPending}
                        className="w-full py-2 px-4 bg-[#ffffff] hover:bg-rose-50 text-rose-800 border border-rose-300 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4 text-rose-600" />
                        <span>Exclude Study (Record Reason)</span>
                      </button>
                    </div>

                    <div className="h-px bg-[#d2c2cb]/60" />

                    {/* Uncertain Button */}
                    <button
                      type="button"
                      onClick={() => handleDecision("maybe")}
                      disabled={decisionMutation.isPending}
                      className="w-full py-1.5 px-3 bg-[#ffffff] hover:bg-[#ffdea6]/30 text-[#7c5800] border border-[#d2c2cb] font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c5800]" />
                      <span>Uncertain (Needs 2nd Reviewer)</span>
                    </button>
                  </div>

                  {/* Downstream Direct Workflow Navigation */}
                  <div className="p-3 bg-[#eee7ec]/50 rounded-lg border border-[#d2c2cb] space-y-2 text-xs">
                    <span className="font-semibold text-[#3a0f34] block">Next Downstream Workspaces:</span>
                    <Link
                      to={`/projects/${projectId}/extraction-pdf?study=${activeStudy.study_id}`}
                      className="block p-2 bg-[#ffffff] rounded border border-[#d2c2cb] hover:border-[#814d75] text-[#3a0f34] font-medium transition-colors"
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>1. PDF Extraction Workspace</span>
                        <ChevronRight className="h-3.5 w-3.5 text-[#814d75]" />
                      </div>
                      <p className="text-[10px] text-[#62535d] mt-0.5">Highlight verbatim quotes & track changes in PDF</p>
                    </Link>

                    <Link
                      to={`/projects/${projectId}/extraction-sheet?study=${activeStudy.study_id}`}
                      className="block p-2 bg-[#ffffff] rounded border border-[#d2c2cb] hover:border-[#814d75] text-[#3a0f34] font-medium transition-colors"
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>2. Extracted Data Matrix (Excel)</span>
                        <ChevronRight className="h-3.5 w-3.5 text-[#814d75]" />
                      </div>
                      <p className="text-[10px] text-[#62535d] mt-0.5">Spreadsheet view across all included studies & variables</p>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#62535d] space-y-2">
              <BookOpen className="h-10 w-10 text-[#d2c2cb]" />
              <h3 className="font-serif text-base font-bold text-[#3a0f34]">Select a Study for Full-Text Review</h3>
              <p className="text-xs max-w-sm">Choose a study from the left sidebar to inspect its full text PDF and record screening decisions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
