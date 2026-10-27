import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  type Study,
  type ScreeningKeyword,
  type AbstractHighlights,
  type ClarificationQuestion,
  type ClarificationAnswerResponse,
} from "../../lib/api";
import { SplitLayout } from "../common/SplitLayout";
import { BookmarkButton } from "../common/BookmarkButton";
import { RecordCollaborationPanel } from "../common/RecordCollaboration";
import {
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  FileUp,
  ExternalLink,
  Loader2,
  AlertCircle,
  RotateCcw,
  Eye,
  EyeOff,
  Send,
  Shield,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BookOpen,
} from "lucide-react";

interface CompactScreeningSplitViewProps {
  studies: Study[];
  selectedStudy: Study | null;
  onSelectStudy: (studyId: string) => void;
  onScreenDecision: (decision: "included" | "excluded" | "maybe") => void;
  isDecisionPending: boolean;
  saveError: string | null;
  failedDecision: any;
  onRetry: () => void;
  excludeReasonCode: string;
  setExcludeReasonCode: (code: string) => void;
  excludeReasonText: string;
  setExcludeReasonText: (text: string) => void;
  reasonError: string | null;
  exclusionReasons: any[];
  keywords: ScreeningKeyword[];
  selectedHighlights?: AbstractHighlights;
  showHighlights: boolean;
  onToggleHighlights: () => void;
  renderHighlightedText: (
    text: string | undefined,
    spans: any[],
    keywords: ScreeningKeyword[],
    isTitle?: boolean
  ) => React.ReactNode;
  studyClarifications: ClarificationQuestion[];
  onAnswerClarification?: (data: {
    questionId: string;
    answer: string;
    label?: string;
    freetext?: string;
  }) => void;
  isAnsweringClarification?: boolean;
  onPdfUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingPdf: boolean;
  uploadError: string | null;
  bookmarkSet: Set<string>;
  bookmarks: { disabled: boolean; toggle: (id: string) => void };
  projectId: string;
  storageKey?: string;
}

export function CompactScreeningSplitView({
  studies,
  selectedStudy,
  onSelectStudy,
  onScreenDecision,
  isDecisionPending,
  saveError,
  onRetry,
  excludeReasonCode,
  setExcludeReasonCode,
  excludeReasonText,
  setExcludeReasonText,
  reasonError,
  exclusionReasons,
  keywords,
  selectedHighlights,
  showHighlights,
  onToggleHighlights,
  renderHighlightedText,
  studyClarifications,
  onAnswerClarification,
  isAnsweringClarification,
  onPdfUpload,
  uploadingPdf,
  uploadError,
  bookmarkSet,
  bookmarks,
  projectId,
  storageKey = "screening_split_width",
}: CompactScreeningSplitViewProps) {
  const [subTab, setSubTab] = useState<"abstract" | "fulltext" | "details" | "notes">("abstract");
  const [sortField, setSortField] = useState<"year" | "confidence" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local per-study notes persisted to localStorage
  const [localNote, setLocalNote] = useState<string>("");
  useEffect(() => {
    if (selectedStudy?.study_id) {
      const saved = localStorage.getItem(`screening_notes_${selectedStudy.study_id}`) || "";
      setLocalNote(saved);
    }
  }, [selectedStudy?.study_id]);

  const handleNoteChange = (text: string) => {
    setLocalNote(text);
    if (selectedStudy?.study_id) {
      localStorage.setItem(`screening_notes_${selectedStudy.study_id}`, text);
    }
  };

  const handleToggleSort = (field: "year" | "confidence") => {
    if (sortField === field) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedStudies = useMemo(() => {
    if (!sortField) return studies;
    return [...studies].sort((a, b) => {
      if (sortField === "year") {
        const yA = parseInt(a.publication_year || "0", 10) || 0;
        const yB = parseInt(b.publication_year || "0", 10) || 0;
        return sortDirection === "asc" ? yA - yB : yB - yA;
      }
      if (sortField === "confidence") {
        const cA = a.ai_confidence ?? -1;
        const cB = b.ai_confidence ?? -1;
        return sortDirection === "asc" ? cA - cB : cB - cA;
      }
      return 0;
    });
  }, [studies, sortField, sortDirection]);

  // Clarification options local selection state
  const [selectedClarificationOption, setSelectedClarificationOption] = useState<string>("");
  const [clarificationFreetext, setClarificationFreetext] = useState<string>("");

  // Helper to extract first author
  const getFirstAuthor = (authors?: string) => {
    if (!authors) return "—";
    const first = authors.split(";")[0]?.split(",")[0]?.trim();
    return first || authors;
  };

  // Helper for status badge formatting
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "included":
      case "ta_included":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
            {status === "ta_included" ? "T/A Inc" : "Included"}
          </span>
        );
      case "excluded":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">
            Excluded
          </span>
        );
      case "uncertain":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap">
            Uncertain
          </span>
        );
      case "awaiting_clarification":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 whitespace-nowrap">
            Clarify
          </span>
        );
      case "awaiting_pdf":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
            Need PDF
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#fbf9f4] text-[#62535d] border border-[#d2c2cb] whitespace-nowrap">
            Pending
          </span>
        );
    }
  };

  /* ────────────── LEFT PANE: STUDY TABLE ────────────── */
  const leftPane = (
    <div className="flex flex-col h-full bg-white border-r border-[#d2c2cb]">
      {/* Table Sub-header */}
      <div className="px-3 py-2 bg-[#fbf9f4] border-b border-[#d2c2cb] flex items-center justify-between">
        <span className="text-xs font-semibold text-[#3a0f34]">
          Studies ({sortedStudies.length})
        </span>
        <div className="flex items-center gap-1 text-[11px] text-[#62535d]">
          <span>Sort:</span>
          <button
            type="button"
            onClick={() => handleToggleSort("year")}
            className={`px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer transition-colors ${
              sortField === "year"
                ? "bg-[#3a0f34] text-[#fbf9f4] font-semibold"
                : "hover:bg-[#eee7ec]"
            }`}
          >
            Year
            {sortField === "year" ? (
              sortDirection === "asc" ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            ) : (
              <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleToggleSort("confidence")}
            className={`px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer transition-colors ${
              sortField === "confidence"
                ? "bg-[#3a0f34] text-[#fbf9f4] font-semibold"
                : "hover:bg-[#eee7ec]"
            }`}
          >
            Confidence
            {sortField === "confidence" ? (
              sortDirection === "asc" ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            ) : (
              <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
            )}
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#fbf9f4] border-b border-[#d2c2cb] sticky top-0 z-10 text-[11px] font-semibold text-[#62535d]">
            <tr>
              <th className="py-2 px-2.5 w-[38%]">Title</th>
              <th className="py-2 px-2 w-[18%]">Author</th>
              <th
                className="py-2 px-1.5 w-[10%] cursor-pointer hover:text-[#3a0f34]"
                onClick={() => handleToggleSort("year")}
                title="Sort by publication year"
              >
                <div className="flex items-center gap-0.5">
                  Year
                  {sortField === "year" && (
                    sortDirection === "asc" ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                  )}
                </div>
              </th>
              <th className="py-2 px-2 w-[14%]">Journal</th>
              <th className="py-2 px-1.5 w-[10%]">Status</th>
              <th
                className="py-2 px-1.5 w-[10%] text-right cursor-pointer hover:text-[#3a0f34]"
                onClick={() => handleToggleSort("confidence")}
                title="Sort by AI confidence"
              >
                <div className="flex items-center justify-end gap-0.5">
                  Conf
                  {sortField === "confidence" && (
                    sortDirection === "asc" ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d2c2cb]/40">
            {sortedStudies.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-[#81737b]">
                  No studies found in this filter.
                </td>
              </tr>
            ) : (
              sortedStudies.map((study) => {
                const isSelected = selectedStudy?.study_id === study.study_id;
                const confPercent =
                  study.ai_confidence !== null && study.ai_confidence !== undefined
                    ? Math.round(study.ai_confidence * 100)
                    : null;

                return (
                  <tr
                    key={study.study_id}
                    onClick={() => onSelectStudy(study.study_id)}
                    className={`cursor-pointer transition-colors group ${
                      isSelected
                        ? "border-l-4 border-l-[#3a0f34] bg-[#eee7ec]"
                        : "hover:bg-[#fbf9f4]"
                    }`}
                  >
                    <td className="py-2 px-2.5">
                      <div className="flex items-start gap-1.5">
                        <BookmarkButton
                          saved={bookmarkSet.has(study.study_id)}
                          disabled={bookmarks.disabled}
                          onClick={() => bookmarks.toggle(study.study_id)}
                        />
                        <span
                          className={`font-semibold line-clamp-2 leading-tight ${
                            isSelected ? "text-[#3a0f34]" : "text-[#4f444b] group-hover:text-[#3a0f34]"
                          }`}
                          title={study.title}
                        >
                          {study.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-[#62535d] truncate" title={study.authors || ""}>
                      {getFirstAuthor(study.authors)}
                    </td>
                    <td className="py-2 px-1.5 font-mono text-[#62535d]">
                      {study.publication_year || "—"}
                    </td>
                    <td className="py-2 px-2 text-[#62535d] truncate" title={study.journal || ""}>
                      {study.journal || "—"}
                    </td>
                    <td className="py-2 px-1.5">{getStatusBadge(study.screening_status)}</td>
                    <td className="py-2 px-1.5 text-right font-mono font-medium">
                      {confPercent !== null ? (
                        <span
                          className={`px-1 py-0.5 rounded text-[10px] ${
                            confPercent >= 80
                              ? "bg-emerald-100 text-emerald-800"
                              : confPercent >= 60
                              ? "bg-amber-100 text-amber-900"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {confPercent}%
                        </span>
                      ) : (
                        <span className="text-[#81737b]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* ────────────── RIGHT PANE: READING PANE & DECISION BAR ────────────── */
  const rightPane = (
    <div className="flex flex-col h-full bg-white relative">
      {selectedStudy ? (
        <>
          {/* Sub-tabs header */}
          <div className="px-4 py-2 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between gap-4 shrink-0">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSubTab("abstract")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-all cursor-pointer ${
                  subTab === "abstract"
                    ? "text-[#3a0f34] border-b-2 border-[#3a0f34] bg-white shadow-2xs font-bold"
                    : "text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
                }`}
              >
                Abstract
              </button>
              <button
                type="button"
                onClick={() => setSubTab("fulltext")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-all flex items-center gap-1 cursor-pointer ${
                  subTab === "fulltext"
                    ? "text-[#3a0f34] border-b-2 border-[#3a0f34] bg-white shadow-2xs font-bold"
                    : "text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Full Text</span>
                {selectedStudy.pdf_path && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSubTab("details")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-all cursor-pointer ${
                  subTab === "details"
                    ? "text-[#3a0f34] border-b-2 border-[#3a0f34] bg-white shadow-2xs font-bold"
                    : "text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setSubTab("notes")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t transition-all cursor-pointer ${
                  subTab === "notes"
                    ? "text-[#3a0f34] border-b-2 border-[#3a0f34] bg-white shadow-2xs font-bold"
                    : "text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
                }`}
              >
                Notes {localNote.trim() && "•"}
              </button>
            </div>

            {/* Quick Actions / External Links */}
            <div className="flex items-center gap-2 text-xs">
              {selectedStudy.doi && (
                <a
                  href={`https://doi.org/${selectedStudy.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#814d75] hover:underline flex items-center gap-0.5"
                  title="View publisher source DOI"
                >
                  DOI <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {selectedStudy.pmid && (
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${selectedStudy.pmid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#814d75] hover:underline flex items-center gap-0.5"
                  title="View PubMed entry"
                >
                  PMID: {selectedStudy.pmid} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Reading Pane Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 1. ABSTRACT TAB */}
            {subTab === "abstract" && (
              <div className="space-y-4">
                {/* Study Title & Citation Metadata */}
                <div>
                  <h2 className="text-base font-bold font-['Serifon_Editorial'] text-[#3a0f34] leading-snug">
                    {renderHighlightedText(
                      selectedStudy.title,
                      selectedHighlights?.title_spans || [],
                      keywords,
                      true
                    )}
                  </h2>
                  <p className="text-xs text-[#62535d] mt-1">
                    <span className="font-semibold text-[#4f444b]">Authors:</span>{" "}
                    {selectedStudy.authors || "Not reported"}
                  </p>
                  <p className="text-xs text-[#62535d]">
                    <span className="font-semibold text-[#4f444b]">Journal:</span>{" "}
                    {selectedStudy.journal || "—"} ({selectedStudy.publication_year || "—"})
                  </p>
                </div>

                {/* AI / Screening Verdict & Confidence Card */}
                {selectedStudy.ai_decision && (
                  <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#814d75]" />
                        <span className="font-bold text-[#3a0f34]">
                          AI Triage: <span className="capitalize">{selectedStudy.ai_decision}</span>
                        </span>
                      </div>
                      {selectedStudy.ai_confidence !== null && (
                        <span className="font-mono text-[#62535d] font-semibold">
                          {Math.round((selectedStudy.ai_confidence || 0) * 100)}% Confidence
                        </span>
                      )}
                    </div>
                    {selectedStudy.ai_reason && (
                      <p className="text-xs text-[#4f444b] italic bg-white p-2 rounded border border-[#d2c2cb]">
                        &ldquo;{selectedStudy.ai_reason}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Clarification Questions if pending */}
                {studyClarifications.length > 0 && (
                  <div className="bg-[#fbf9f4] border border-[#814d75] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#3a0f34]">
                        Clarification Question Pending
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffdea6] text-[#3a0f34]">
                        Clarify
                      </span>
                    </div>
                    {studyClarifications.map((q) => (
                      <div key={q.question_id} className="space-y-2 text-xs">
                        <p className="font-semibold text-[#3a0f34]">{q.question_text}</p>
                        {q.context_excerpt && (
                          <p className="text-[11px] text-[#4f444b] italic bg-white p-1.5 rounded border border-[#d2c2cb]">
                            &ldquo;{q.context_excerpt}&rdquo;
                          </p>
                        )}
                        {!q.answer ? (
                          <div className="space-y-1.5 pt-1">
                            {q.options.map((opt) => (
                              <label
                                key={opt.value}
                                className="flex items-center gap-2 text-xs text-[#4f444b] cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={`clarify-${q.question_id}`}
                                  value={opt.value}
                                  checked={selectedClarificationOption === opt.value}
                                  onChange={() => setSelectedClarificationOption(opt.value)}
                                  className="text-[#3a0f34]"
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                if (onAnswerClarification && selectedClarificationOption) {
                                  onAnswerClarification({
                                    questionId: q.question_id,
                                    answer: selectedClarificationOption,
                                  });
                                }
                              }}
                              disabled={!selectedClarificationOption || isAnsweringClarification}
                              className="mt-1 px-3 py-1 bg-[#3a0f34] text-[#fbf9f4] text-xs font-semibold rounded hover:bg-[#1a0017] disabled:opacity-50 flex items-center gap-1"
                            >
                              {isAnsweringClarification ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              <span>Submit Clarification</span>
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-emerald-800 font-medium">
                            Answered: {q.answer_label || q.answer}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Abstract Text & Highlight Controls */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-1.5">
                    <span className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider">
                      Abstract Text
                    </span>
                    <button
                      type="button"
                      onClick={onToggleHighlights}
                      className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                        showHighlights
                          ? "bg-[#eee7ec] border-[#814d75] text-[#3a0f34] font-semibold"
                          : "bg-white border-[#d2c2cb] text-[#62535d]"
                      }`}
                    >
                      {showHighlights ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      <span>Highlights {showHighlights ? "On" : "Off"}</span>
                    </button>
                  </div>

                  {showHighlights && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] pb-1">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Include
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                        Exclude
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
                        Population (P)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300">
                        Intervention (I)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                        Outcome (O)
                      </span>
                    </div>
                  )}

                  <div className="bg-[#fbf9f4]/60 border border-[#d2c2cb] rounded-lg p-3.5 min-h-[160px] text-xs font-['QuadraatSmallCaps'] leading-relaxed">
                    {renderHighlightedText(
                      selectedStudy.abstract,
                      selectedHighlights?.all_spans || [],
                      keywords,
                      false
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. FULL TEXT TAB */}
            {subTab === "fulltext" && (
              <div className="space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#814d75]" />
                    <span className="text-xs font-bold text-[#3a0f34]">
                      Full-Text Document {selectedStudy.pdf_path ? "(Processed)" : "(Missing)"}
                    </span>
                  </div>
                  {selectedStudy.pdf_path && (
                    <a
                      href={`/api/studies/${selectedStudy.study_id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#814d75] hover:underline flex items-center gap-1 font-semibold"
                      title="Open full PDF document in a new browser tab"
                    >
                      Open in new tab <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {selectedStudy.pdf_path ? (
                  <div className="flex-1 min-h-[480px] border border-[#d2c2cb] rounded overflow-hidden">
                    <iframe
                      src={`/api/studies/${selectedStudy.study_id}/pdf`}
                      title="Full-text Study PDF"
                      className="w-full h-full min-h-[480px] bg-slate-100 border-0"
                    />
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-[#d2c2cb] rounded-lg p-8 text-center space-y-3 bg-[#fbf9f4]">
                    <FileUp className="w-10 h-10 text-[#81737b] mx-auto" />
                    <p className="text-xs text-[#62535d]">
                      No PDF uploaded for full-text evaluation.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={onPdfUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPdf}
                      className="px-4 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded transition-all cursor-pointer disabled:opacity-50"
                    >
                      {uploadingPdf ? "Uploading..." : "Upload Full-Text PDF"}
                    </button>
                    {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
                  </div>
                )}
              </div>
            )}

            {/* 3. DETAILS TAB */}
            {subTab === "details" && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider border-b border-[#d2c2cb] pb-1.5">
                  Bibliographic & Protocol Metadata
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Study ID</dt>
                    <dd className="font-mono text-[#3a0f34]">{selectedStudy.study_id}</dd>
                  </div>
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Publication Year</dt>
                    <dd className="text-[#3a0f34]">{selectedStudy.publication_year || "—"}</dd>
                  </div>
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Journal</dt>
                    <dd className="text-[#3a0f34]">{selectedStudy.journal || "—"}</dd>
                  </div>
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Study Design</dt>
                    <dd className="text-[#3a0f34]">{selectedStudy.study_design || "Unclassified"}</dd>
                  </div>
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Screening Stage</dt>
                    <dd className="text-[#3a0f34] uppercase">{selectedStudy.screening_stage || "TA"}</dd>
                  </div>
                  <div className="bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb]">
                    <dt className="text-[#62535d] font-semibold text-[11px]">Current Decision Status</dt>
                    <dd className="text-[#3a0f34] font-semibold">{selectedStudy.screening_status}</dd>
                  </div>
                </dl>
              </div>
            )}

            {/* 4. NOTES & COLLABORATION TAB */}
            {subTab === "notes" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#3a0f34] uppercase tracking-wider mb-1.5">
                    Per-Study Reviewer Notes (Persisted)
                  </label>
                  <textarea
                    rows={4}
                    value={localNote}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    placeholder="Enter review notes, clinical considerations, or methodology observations for this study..."
                    className="w-full text-xs p-2.5 border border-[#d2c2cb] rounded bg-[#fbf9f4] text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                  />
                  <p className="text-[10px] text-[#62535d] mt-1">
                    Notes are automatically saved locally and preserved between sessions.
                  </p>
                </div>

                {/* Collaboration Comments & Tags */}
                <div className="border-t border-[#d2c2cb] pt-3">
                  <h4 className="text-xs font-bold text-[#3a0f34] mb-2">Team Collaboration</h4>
                  <RecordCollaborationPanel
                    key={selectedStudy.study_id}
                    projectId={projectId}
                    studyId={selectedStudy.study_id}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fixed Decision Bar pinned to bottom */}
          <div className="border-t border-[#d2c2cb] bg-[#fbf9f4] p-3 shadow-md shrink-0 space-y-2">
            {/* Exclusion reason dropdown and rationale (for exclude decisions) */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <select
                value={excludeReasonCode}
                onChange={(e) => setExcludeReasonCode(e.target.value)}
                className={`text-xs bg-white border rounded px-2.5 py-1.5 text-[#4f444b] w-full sm:w-1/2 focus:outline-none focus:ring-1 ${
                  reasonError
                    ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/40"
                    : "border-[#d2c2cb] focus:ring-[#814d75]"
                }`}
              >
                <option value="">Select Exclusion Reason (Required to exclude)</option>
                {exclusionReasons.map((r: any) => (
                  <option key={r.code || r.reason_id} value={r.code || r.reason_id}>
                    {r.label || r.code}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Optional custom rationale..."
                value={excludeReasonText}
                onChange={(e) => setExcludeReasonText(e.target.value)}
                className="text-xs bg-white border border-[#d2c2cb] rounded px-2.5 py-1.5 text-[#4f444b] w-full sm:w-1/2 focus:outline-none focus:ring-1 focus:ring-[#814d75]"
              />
            </div>

            {reasonError && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{reasonError}</span>
              </div>
            )}

            {/* Save Failure Recovery */}
            {saveError && (
              <div className="flex items-center justify-between gap-2 p-2 bg-rose-50 border border-rose-300 rounded text-rose-900 text-xs">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{saveError}</span>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isDecisionPending}
                  className="px-2 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {/* Decision Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              {/* Include */}
              <button
                type="button"
                onClick={() => onScreenDecision("included")}
                disabled={isDecisionPending}
                className="py-2 px-3 text-xs font-bold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Include Study (Hotkeys: 'I' or '1')"
              >
                {isDecisionPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span>Include</span>
                <kbd className="px-1.5 py-0.5 rounded bg-black/20 text-[#fbf9f4] font-mono text-[9px]">
                  I
                </kbd>
              </button>

              {/* Uncertain / Maybe */}
              <button
                type="button"
                onClick={() => onScreenDecision("maybe")}
                disabled={isDecisionPending}
                className="py-2 px-3 text-xs font-bold text-[#3a0f34] bg-[#ffdea6] hover:bg-[#ffdea6]/80 border border-[#d2c2cb] rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="Uncertain / Maybe (Hotkeys: 'U', 'M', or '3')"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#7c5800] shrink-0" />
                <span>Uncertain</span>
                <kbd className="px-1.5 py-0.5 rounded bg-black/10 text-[#3a0f34] font-mono text-[9px]">
                  U
                </kbd>
              </button>

              {/* Exclude */}
              <button
                type="button"
                onClick={() => onScreenDecision("excluded")}
                disabled={isDecisionPending}
                className="py-2 px-3 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title="Exclude Study (Hotkeys: 'E' or '2')"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-200 shrink-0" />
                <span>Exclude</span>
                <kbd className="px-1.5 py-0.5 rounded bg-black/20 text-white font-mono text-[9px]">
                  E
                </kbd>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#81737b]">
          <BookOpen className="w-10 h-10 text-[#d2c2cb] mb-2" />
          <p className="text-sm font-semibold text-[#62535d]">No Study Selected</p>
          <p className="text-xs text-[#81737b] mt-1">
            Select a study from the left pane to view its abstract and full text.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <SplitLayout
      leftPane={leftPane}
      rightPane={rightPane}
      storageKey={storageKey}
      defaultLeftPercent={40}
      minLeftPercent={20}
      maxLeftPercent={75}
      className="h-[calc(100vh-185px)] bg-white border border-[#d2c2cb] rounded overflow-hidden"
    />
  );
}
