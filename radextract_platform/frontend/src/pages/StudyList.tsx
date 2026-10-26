import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  saveStoredProjectStudies,
  type Study,
  type ImportBatch,
  type ImportBatchDetail,
  type UndoImpactPreview,
} from "../lib/api";
import { autoIdentifyPdf } from "../lib/pdfAutoIdentifier";
import {
  Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Upload, Loader2,
  Highlighter, FileSpreadsheet, ArrowRight, CheckCircle2, X,
  RefreshCw, Sparkles, FolderPlus, Check, AlertCircle, ArrowLeftRight, Copy,
  ExternalLink, HelpCircle, Undo2, Edit3, Search
} from "lucide-react";
import { judgmentColor, judgmentLabel } from "../lib/utils";
import { useRef, useState, useMemo, useEffect } from "react";
import { DuplicateReviewModal } from "../components/common/DuplicateReviewModal";
import { BookmarkButton } from "../components/common/BookmarkButton";
import { useBookmarks } from "../lib/bookmarks";
import { matchesTag, useProjectTags, type TagIndex } from "../lib/recordCollaboration";
import { CollaborationDialog, RecordCollaborationPanel, TagBadges, TagFilter } from "../components/common/RecordCollaboration";
import { cn } from "../lib/utils";

function BatchDetailsModal({
  isOpen,
  batchId,
  projectId,
  onClose,
}: {
  isOpen: boolean;
  batchId: string | null;
  projectId: string;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "added" | "duplicate" | "error">("all");
  const [search, setSearch] = useState("");

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["batch_detail", projectId, batchId],
    queryFn: () => api.getImportBatchDetail(projectId, batchId!),
    enabled: !!batchId && isOpen,
  });

  if (!isOpen) return null;

  const records = detail?.records || [];
  const filteredRecords = records.filter((r) => {
    if (filter === "added" && r.status !== "added") return false;
    if (filter === "duplicate" && r.status !== "duplicate") return false;
    if (filter === "error" && r.status !== "error") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (r.title || "").toLowerCase().includes(q);
      const matchAuthors = (r.authors || "").toLowerCase().includes(q);
      const matchDoi = (r.doi || "").toLowerCase().includes(q);
      if (!matchTitle && !matchAuthors && !matchDoi) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] font-semibold uppercase">
                Batch Details
              </span>
              {detail && (
                <span
                  className={cn(
                    "text-[10px] font-mono px-2 py-0.5 rounded-full border",
                    detail.status === "completed"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : detail.status === "completed_with_errors"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : detail.status === "undone"
                      ? "bg-slate-100 text-slate-700 border-slate-300"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  )}
                >
                  {detail.status === "undone" && detail.undone_at
                    ? `Undone on ${detail.undone_at}`
                    : detail.status.replace("_", " ").toUpperCase()}
                </span>
              )}
            </div>
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#3a0f34] break-all">
              {detail?.filename || "Loading batch..."}
            </h3>
            <p className="text-xs text-[#62535d] mt-1 font-sans">
              Imported on {detail?.created_at || "—"} • Source:{" "}
              <span className="font-medium text-[#4f444b]">{detail?.source || "Unknown"}</span> • Format:{" "}
              <span className="font-medium text-[#4f444b]">{detail?.format || "Unknown"}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary Counts Strip */}
        {detail && (
          <div className="px-6 py-3 bg-[#ffffff] border-b border-[#d2c2cb] flex flex-wrap items-center gap-4 text-xs">
            <span className="text-[#62535d]">
              Processed: <strong className="text-[#4f444b]">{detail.total_records}</strong>
            </span>
            <span className="text-emerald-700">
              Newly Added: <strong>{detail.imported_count}</strong>
            </span>
            <span className="text-amber-800">
              Duplicates: <strong>{detail.duplicate_count}</strong>
            </span>
            {detail.failed_count > 0 && (
              <span className="text-rose-700">
                Failed/Malformed: <strong>{detail.failed_count}</strong>
              </span>
            )}
            <span className="text-[#814d75] ml-auto font-medium">
              Currently Retained in Project: <strong>{detail.retained_studies_count ?? detail.imported_count}</strong>
            </span>
          </div>
        )}

        {/* Body */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="py-16 text-center text-[#62535d] flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-7 w-7 text-[#814d75] animate-spin" />
              <span className="font-serif italic text-sm">Loading records and validation outcomes...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              Failed to load batch details: {(error as Error).message}
            </div>
          ) : (
            <>
              {/* Filter Tabs & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={cn(
                      "px-3 py-1 rounded-lg font-medium transition-colors",
                      filter === "all" ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs" : "text-[#62535d] hover:text-[#3a0f34]"
                    )}
                  >
                    All ({records.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("added")}
                    className={cn(
                      "px-3 py-1 rounded-lg font-medium transition-colors",
                      filter === "added" ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs" : "text-[#62535d] hover:text-[#3a0f34]"
                    )}
                  >
                    Added ({records.filter((r) => r.status === "added").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("duplicate")}
                    className={cn(
                      "px-3 py-1 rounded-lg font-medium transition-colors",
                      filter === "duplicate" ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs" : "text-[#62535d] hover:text-[#3a0f34]"
                    )}
                  >
                    Duplicates ({records.filter((r) => r.status === "duplicate").length})
                  </button>
                  {records.some((r) => r.status === "error") && (
                    <button
                      type="button"
                      onClick={() => setFilter("error")}
                      className={cn(
                        "px-3 py-1 rounded-lg font-medium transition-colors",
                        filter === "error" ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs" : "text-[#62535d] hover:text-[#3a0f34]"
                      )}
                    >
                      Errors ({records.filter((r) => r.status === "error").length})
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#81737b]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search titles, authors, DOI..."
                    className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#d2c2cb] bg-[#fbf9f4] text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                  />
                </div>
              </div>

              {/* Records List */}
              {filteredRecords.length === 0 ? (
                <div className="py-12 text-center text-[#81737b] text-xs font-serif italic border border-dashed border-[#d2c2cb] rounded-xl">
                  No records match the current filter.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredRecords.map((r, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-[#d2c2cb] bg-[#ffffff] hover:border-[#814d75]/50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] text-[#81737b]">#{r.index ?? idx + 1}</span>
                          <span
                            className={cn(
                              "text-[10px] font-mono px-2 py-0.2 rounded-full border",
                              r.status === "added"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : r.status === "duplicate"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                            )}
                          >
                            {r.status === "added"
                              ? "NEWLY ADDED"
                              : r.status === "duplicate"
                              ? `DUPLICATE (${r.match_reason?.toUpperCase() || "MATCH"})`
                              : "MALFORMED"}
                          </span>
                          {r.publication_year && (
                            <span className="font-mono text-[10px] text-[#62535d]">{r.publication_year}</span>
                          )}
                          {r.doi && (
                            <span className="font-mono text-[10px] text-[#81737b] truncate max-w-[200px]" title={r.doi}>
                              DOI: {r.doi}
                            </span>
                          )}
                        </div>
                        <h4 className="font-serif text-sm font-medium text-[#4f444b] leading-snug">
                          {r.title || "(Untitled record)"}
                        </h4>
                        {r.authors && <p className="text-[11px] text-[#62535d] truncate">{r.authors}</p>}
                      </div>

                      {/* Right Status / Link */}
                      <div className="shrink-0 flex items-center gap-2">
                        {r.study_active && r.study_id ? (
                          <Link
                            to={`/projects/${projectId}/studies`}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#3a0f34] bg-[#fbf9f4] hover:bg-[#eee7ec] border border-[#d2c2cb] transition-colors"
                          >
                            <span>Study Record</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : r.status === "added" ? (
                          <span className="text-[11px] font-mono text-[#81737b] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                            Removed (Batch undone)
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-[#81737b] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                            Duplicate (Retained primary)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Malformed records section if any */}
              {detail?.malformed_records && detail.malformed_records.length > 0 && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <span>Malformed Records ({detail.malformed_records.length})</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-amber-800">
                    {detail.malformed_records.map((m, i) => (
                      <div key={i} className="p-2 rounded-lg bg-white/70 border border-amber-200/80 font-mono text-[11px]">
                        <div>{m.reason}</div>
                        {m.snippet && <div className="text-[#81737b] mt-0.5 truncate">{m.snippet}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2c2cb] bg-[#fbf9f4] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[#ffffff] border border-[#d2c2cb] text-[#4f444b] hover:bg-[#eee7ec] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchUndoModal({
  isOpen,
  batch,
  projectId,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  batch: ImportBatch | null;
  projectId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [confirmedDownstream, setConfirmedDownstream] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["undo_preview", projectId, batch?.batch_id],
    queryFn: () => api.previewUndoBatch(projectId, batch!.batch_id),
    enabled: !!batch && isOpen,
  });

  if (!isOpen || !batch) return null;

  const handleConfirmUndo = async () => {
    setIsUndoing(true);
    setErrorMsg(null);
    try {
      const res = await api.undoImportBatch(projectId, batch.batch_id, confirmedDownstream);
      onSuccess(res.message);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to undo batch");
    } finally {
      setIsUndoing(false);
    }
  };

  const hasDownstream = preview?.has_downstream_work;
  const canProceed = !hasDownstream || confirmedDownstream;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-5 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
              <Undo2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-medium text-[#3a0f34]">
                Confirm Undo Import
              </h3>
              <p className="text-xs text-[#62535d] font-mono truncate max-w-xs sm:max-w-md">
                {batch.filename}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 text-xs text-[#4f444b]">
          {isLoading ? (
            <div className="py-8 text-center text-[#62535d] flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-[#814d75] animate-spin" />
              <span className="font-serif italic">Analyzing study contributions and downstream work...</span>
            </div>
          ) : (
            <>
              <div className="p-3.5 rounded-xl bg-[#fbf9f4] border border-[#d2c2cb] space-y-2">
                <div className="font-medium text-[#3a0f34]">Impact Summary:</div>
                <ul className="list-disc list-inside space-y-1 text-[#62535d]">
                  <li>
                    <strong>{preview?.studies_to_remove_count ?? 0}</strong> study record(s) will leave the active project.
                  </li>
                  {preview && preview.studies_retained_count > 0 && (
                    <li className="text-emerald-800">
                      <strong>{preview.studies_retained_count}</strong> study record(s) will be <em>retained</em> because they are also part of other active imports.
                    </li>
                  )}
                  <li>
                    Batch history will retain this entry marked as <strong>Inactive (Undone)</strong>.
                  </li>
                </ul>
              </div>

              {/* Downstream warning */}
              {hasDownstream && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Downstream Work Detected:</strong>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Studies from this batch have active screening decisions or extractions ({preview.downstream_work.screening_decisions_count} decision(s), {preview.downstream_work.extractions_count} extraction(s)).
                      </p>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmedDownstream}
                      onChange={(e) => setConfirmedDownstream(e.target.checked)}
                      className="mt-0.5 rounded text-[#3a0f34] focus:ring-[#814d75]"
                    />
                    <span className="text-[11px] font-medium text-amber-950">
                      I understand and confirm that downstream screening decisions and extractions on these studies will be removed.
                    </span>
                  </label>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {errorMsg}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isUndoing}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[#ffffff] border border-[#d2c2cb] text-[#4f444b] hover:bg-[#eee7ec] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmUndo}
            disabled={!canProceed || isUndoing || isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
          >
            {isUndoing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Confirm & Undo Batch</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function StudyList({ bookmarkedOnly = false }: { bookmarkedOnly?: boolean }) {
  const { projectId } = useParams<{ projectId: string }>();
  const bookmarks = useBookmarks(projectId);
  const tagIndex = useProjectTags(projectId);
  const [tagFilter, setTagFilter] = useState("");
  const [collaborationStudy, setCollaborationStudy] = useState<Study | null>(null);
  const [savedFilter, setSavedOnly] = useState(false);
  const savedOnly = bookmarkedOnly || savedFilter;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkPdfInputRef = useRef<HTMLInputElement>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Direct Drag & Drop and Batch History State
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingDirect, setIsProcessingDirect] = useState(false);
  const [directProcessMsg, setDirectProcessMsg] = useState<string | null>(null);

  // Real Batch History & Undo state
  const [selectedDetailBatchId, setSelectedDetailBatchId] = useState<string | null>(null);
  const [selectedUndoBatch, setSelectedUndoBatch] = useState<ImportBatch | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingSourceValue, setEditingSourceValue] = useState("");

  const { data: rawImportBatches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: ["import_batches", projectId],
    queryFn: () => api.getImportBatches(projectId!),
    enabled: !!projectId,
  });
  const importBatches = Array.isArray(rawImportBatches) ? rawImportBatches : [];

  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const { data: dedupData } = useQuery({
    queryKey: ["duplicate_groups", projectId],
    queryFn: () => api.getDuplicateGroups(projectId!),
    enabled: !!projectId,
  });

  // Performance optimization: Batch Risk of Bias assessment lookups in a single request (1 query vs N queries)
  const { data: robSummary } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.robSummary(projectId!),
    enabled: !!projectId,
  });

  const robMap = useMemo(() => {
    const map = new Map<string, { assessment_id: string; overall_judgment: string }>();
    if (robSummary?.assessments) {
      for (const a of robSummary.assessments) {
        if (a.study_id && !map.has(a.study_id)) {
          map.set(a.study_id, a);
        }
      }
    }
    return map;
  }, [robSummary]);


  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteStudy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import_batches", projectId] });
    },
  });

  const refUploadMutation = useMutation({
    mutationFn: (files: File[]) => api.uploadReferences(projectId!, files),
    onSuccess: (data) => {
      const parts = [
        `Imported ${data.imported_count} references`,
        `skipped ${data.skipped_duplicates} duplicates`,
      ];
      if (data.errors && data.errors.length > 0) {
        parts.push(`${data.errors.length} file(s) with errors`);
      }
      setUploadMsg(parts.join(", "));
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import_batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
    },
    onError: (err: Error) => {
      setUploadMsg(`Error: ${err.message}`);
    },
  });

  const handleRefUpload = (files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      refUploadMutation.mutate(fileArray);
    }
  };

  const handleDirectFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsProcessingDirect(true);
    setDirectProcessMsg(`Processing ${fileArray.length} file(s)...`);

    try {
      const pdfFiles = fileArray.filter(f => f.name.toLowerCase().endsWith(".pdf"));
      const refFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith(".pdf"));

      let totalAdded = 0;
      let totalDuplicates = 0;

      // Reference files (.ris, .bib, .csv, .xml, .nbib, .txt)
      if (refFiles.length > 0) {
        setDirectProcessMsg(`Parsing ${refFiles.length} bibliographic reference file(s)...`);
        const res = await api.uploadReferences(projectId!, refFiles);
        totalAdded += res.imported_count || 0;
        totalDuplicates += res.skipped_duplicates || 0;
      }

      // PDF files
      if (pdfFiles.length > 0) {
        setDirectProcessMsg(`Extracting clinical metadata from ${pdfFiles.length} PDF(s)...`);
        const created: Study[] = [];
        for (const pdf of pdfFiles) {
          try {
            const identified = await autoIdentifyPdf(pdf, projectId);
            created.push(identified as any);
          } catch (e) {
            console.error(e);
          }
        }
        if (created.length > 0) {
          await api.bulkAddStudies(projectId!, created);
          totalAdded += created.length;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import_batches", projectId] });
      setUploadMsg(`Import successful: ${totalAdded} studies added, ${totalDuplicates} duplicates skipped.`);
    } catch (err: any) {
      setUploadMsg(`Import error: ${err.message || "Failed to process files"}`);
    } finally {
      setIsProcessingDirect(false);
      setDirectProcessMsg(null);
    }
  };

  const handleSaveSource = async (batchId: string) => {
    try {
      await api.updateBatchSource(projectId!, batchId, editingSourceValue);
      setEditingBatchId(null);
      queryClient.invalidateQueries({ queryKey: ["import_batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      setUploadMsg("Batch source metadata updated successfully.");
    } catch (err: any) {
      setUploadMsg(`Failed to update source: ${err.message}`);
    }
  };

  const handleStartBlank = async () => {
    if (window.confirm("Start blank workspace? This will clear benchmark demo studies so you can upload and extract your own literature.")) {
      await api.resetStudies(projectId!, true);
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      setUploadMsg("Workspace cleared. Repository is now blank and ready for custom study uploads.");
    }
  };

  const handleRestoreBenchmark = async () => {
    await api.resetStudies(projectId!, false);
    queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    setUploadMsg("Benchmark clinical studies restored (6 verified intracranial PAM literature datasets).");
  };

  const isBlank = studies && studies.length === 0;

  // Optimize O(1) bookmark lookup and memoize filter results to avoid O(N*M) linear scans on every render
  const bookmarkedIdsSet = useMemo(() => new Set(bookmarks.ids), [bookmarks.ids]);

  const bookmarkedCount = useMemo(() => {
    if (!studies) return 0;
    return studies.reduce((acc, s) => (bookmarkedIdsSet.has(s.study_id) ? acc + 1 : acc), 0);
  }, [studies, bookmarkedIdsSet]);

  const visibleStudies = useMemo(() => {
    return (studies || []).filter(
      (s) => (!savedOnly || bookmarkedIdsSet.has(s.study_id)) && matchesTag(tagIndex.data, s.study_id, tagFilter)
    );
  }, [studies, savedOnly, bookmarkedIdsSet, tagIndex.data, tagFilter]);

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb Navigation */}
      <div>
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans text-[#6B665E] hover:text-[#141413] bg-black/[0.03] hover:bg-black/[0.06] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>Back to Project Dashboard</span>
        </Link>
      </div>

      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-black/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">LITERATURE REPOSITORY</span>
            <span className="text-xs font-mono text-[#8A817A]">{studies?.length || 0} Studies Indexed</span>
            {isBlank && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                BLANK WORKSPACE
              </span>
            )}
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#141413] tracking-tight">
            {bookmarkedOnly ? "Bookmarked studies" : "Studies & Clinical Benchmarks"}
          </h1>
          <p className="font-serif italic text-sm text-[#6B665E] mt-1">
            {bookmarkedOnly ? "Your saved studies for reviewing later. Remove a bookmark when you no longer need it." : "Verified study extraction records, bounding box quote locators, and evidence quality reviews."}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <Link to={`/projects/${projectId}/${bookmarkedOnly ? "studies" : "bookmarks"}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 text-xs font-medium hover:bg-black/5">
            {bookmarkedOnly ? "View all studies" : "View bookmarked studies"}
          </Link>
          {/* Hidden reference file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".ris,.bib,.bibtex,.csv,.xml,.nbib,.txt"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleRefUpload(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Blank / Benchmark Toggle */}
          {isBlank ? (
            <button
              type="button"
              onClick={handleRestoreBenchmark}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 text-xs font-medium text-[#141413] hover:bg-black/5 transition-colors"
              title="Restore standard 6 benchmark demo studies"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#6B665E]" />
              <span>Load Benchmark Studies</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartBlank}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 text-xs font-medium text-[#6B665E] hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors"
              title="Clear benchmark demo studies and start fresh with 0 studies"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Start Blank Workspace</span>
            </button>
          )}

          {/* Duplicate Review Button */}
          <button
            type="button"
            onClick={() => setIsDuplicateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/15 bg-white text-xs font-medium text-[#141413] hover:bg-black/5 transition-colors shadow-2xs"
            title="Open side-by-side duplicate review workspace (Keep primary, Keep both, Merge metadata)"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-[#6B665E]" />
            <span>Duplicate Review</span>
            {dedupData && dedupData.total_duplicates > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                {dedupData.total_duplicates}
              </span>
            ) : null}
          </button>

          {/* Bulk Upload PDFs Button */}
          <button
            type="button"
            className="btn-phylo-primary text-xs flex items-center gap-1.5 shadow-xs"
            onClick={() => setIsBulkModalOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>Bulk Upload PDFs</span>
          </button>

          {/* Import Single Study */}
          <Link to={`/projects/${projectId}/studies/new`} className="btn-phylo-secondary text-xs flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
          </Link>
        </div>
      </div>


      {/* Quick Extraction Banner */}
      <div className="card-phylo-warm p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-[#141413] text-[#FAF9F3] flex items-center justify-center shrink-0 shadow-xs">
            <Highlighter className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-serif text-lg font-medium text-[#141413]">
                Direct AI Quote Extraction & Verification
              </h2>
              <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">FAST-TRACK EXTRACTION</span>
            </div>
            <p className="font-sans text-xs text-[#6B665E] max-w-xl leading-relaxed">
              Upload multiple study PDFs to automatically parse clinical metadata into JSON and jump directly to the Extraction Sheet without manual screening.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
          <Link
            to={`/projects/${projectId}/extraction-sheet`}
            className="btn-phylo-primary text-xs px-4 py-2 flex-1 md:flex-initial"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Extraction Sheet</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to={`/projects/${projectId}/extraction`}
            className="btn-phylo-secondary text-xs px-4 py-2 flex-1 md:flex-initial bg-white/80"
          >
            <Highlighter className="h-3.5 w-3.5 text-[#141413]" />
            <span>In-situ PDF Viewer</span>
          </Link>
        </div>
      </div>

      {/* Duplicate Detection Alert Banner */}
      {dedupData && dedupData.total_duplicates > 0 && (
        <div className="bg-amber-50/80 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-sm font-medium text-[#141413]">
                  Duplicate Bibliographic Records Identified ({dedupData.total_duplicates} candidate duplicates in {dedupData.duplicate_groups.length} group{dedupData.duplicate_groups.length > 1 ? "s" : ""})
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                  DEDUPLICATION STEP
                </span>
              </div>
              <p className="font-sans text-xs text-[#6B665E] mt-0.5 max-w-2xl leading-relaxed">
                Side-by-side comparison of title, abstract, DOI, PMID, year, and authors with match reasons. Keep this record, Keep both, or Merge metadata where appropriate with reversible duplicate marking.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsDuplicateModalOpen(true)}
            className="btn-phylo-primary text-xs px-4 py-2 shrink-0 flex items-center gap-1.5 shadow-xs"
          >
            <span>Review Duplicates</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {uploadMsg && (

        <div
          className={`rounded-xl px-4 py-3 text-xs font-sans flex items-center justify-between ${
            uploadMsg.startsWith("Error")
              ? "bg-rose-50 border border-rose-200 text-rose-800"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          }`}
        >
          <span>{uploadMsg}</span>
          <button onClick={() => setUploadMsg(null)} className="text-black/40 hover:text-black">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="p-12 text-center text-[#8A817A] font-serif italic text-sm">
          Loading clinical study records...
        </div>
      )}

      {/* ── Direct Inline Drag & Drop Zone (No Dialog!) ── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleDirectFiles(e.dataTransfer.files);
        }}
        onClick={() => directFileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl p-7 sm:p-9 text-center cursor-pointer transition-all",
          isDragging
            ? "border-emerald-600 bg-emerald-50/60 shadow-lg scale-[1.005]"
            : "border-black/20 hover:border-black/50 bg-[#FAF9F3]/80 hover:bg-[#FAF9F3] shadow-xs"
        )}
      >
        <input
          ref={directFileInputRef}
          type="file"
          accept=".pdf,.ris,.bib,.bibtex,.csv,.xml,.nbib,.txt,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleDirectFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {isProcessingDirect ? (
          <div className="flex flex-col items-center justify-center py-4 space-y-3">
            <Loader2 className="h-9 w-9 text-emerald-600 animate-spin" />
            <div className="font-serif text-lg font-medium text-[#141413]">
              {directProcessMsg || "Importing studies..."}
            </div>
            <p className="font-sans text-xs text-[#6B665E]">
              Parsing citations, extracting study metadata, and screening eligibility...
            </p>
          </div>
        ) : (
          <div className="max-w-xl mx-auto space-y-2">
            <div className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center mx-auto transition-transform",
              isDragging ? "bg-emerald-600 text-white scale-110" : "bg-[#141413] text-[#FAF9F3]"
            )}>
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-xl font-normal text-[#141413] tracking-tight">
              Drag & drop studies here
            </h3>
            <p className="font-sans text-xs text-[#6B665E] leading-relaxed">
              Drop study files directly onto this area (<span className="font-mono font-medium text-[#141413]">.ris, .bib, .pdf, .csv, .xml, .nbib</span>).
              Files process instantly without opening another dialog box.
            </p>
            <div className="pt-1.5 flex items-center justify-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-black/15 text-[#141413] shadow-2xs hover:bg-black/5">
                <FolderPlus className="h-3.5 w-3.5 text-[#6B665E]" />
                <span>Or browse files from your computer</span>
              </span>
              {isBlank && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestoreBenchmark();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs hover:bg-amber-100"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-amber-700" />
                  <span>Restore Benchmark PAM Studies</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Import Batches & Screening History (Compact Table + Real Project Data) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg font-normal text-[#141413]">
              Import Batches & Screening History
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-black/[0.05] text-[#6B665E]">
              {importBatches.length} {importBatches.length === 1 ? "Batch" : "Batches"}
            </span>
          </div>
          {importBatches.length > 0 && (
            <span className="text-xs text-[#81737b] italic font-serif hidden sm:inline">
              Click "Undo" on any batch to preview impact and safely revert study inclusions
            </span>
          )}
        </div>

        {importBatches.length === 0 ? (
          <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-8 text-center space-y-3 shadow-2xs">
            <div className="h-10 w-10 rounded-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#814d75] flex items-center justify-center mx-auto">
              <FolderPlus className="h-5 w-5" />
            </div>
            <h4 className="font-serif text-base font-normal text-[#141413]">
              No imports yet — import references to get started.
            </h4>
            <p className="font-sans text-xs text-[#62535d] max-w-md mx-auto">
              Upload RIS, BibTeX, PubMed NBIB, CSV, or XML bibliographic references or study PDFs to build this project's literature repository.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-colors shadow-2xs"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import References</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fbf9f4] border-b border-[#d2c2cb] text-[11px] font-semibold text-[#62535d] tracking-wider uppercase font-sans">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4 text-center">Added</th>
                    <th className="py-3 px-4 text-center">Duplicates</th>
                    <th className="py-3 px-4 text-center">Retained</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d2c2cb]/60 font-sans text-xs">
                  {importBatches.map((batch) => {
                    const isUndone = batch.status === "undone" || !!batch.undone_at;
                    const isEditingThisSource = editingBatchId === batch.batch_id;
                    const retainedCount = batch.retained_studies_count ?? (isUndone ? 0 : batch.imported_count);

                    return (
                      <tr
                        key={batch.batch_id}
                        className={cn(
                          "hover:bg-[#fbf9f4]/60 transition-colors",
                          isUndone && "opacity-70 bg-slate-50/40"
                        )}
                      >
                        {/* Date */}
                        <td className="py-3 px-4 text-[#62535d] whitespace-nowrap">
                          {new Date(batch.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        {/* Filename */}
                        <td className="py-3 px-4 font-mono font-medium text-[#141413] max-w-[220px] truncate" title={batch.filename}>
                          {batch.filename}
                        </td>

                        {/* Source (Editable Inline) */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isEditingThisSource ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingSourceValue}
                                onChange={(e) => setEditingSourceValue(e.target.value)}
                                className="text-xs px-2 py-1 rounded border border-[#814d75] focus:outline-none focus:ring-1 focus:ring-[#814d75] bg-white font-sans w-28"
                                placeholder="e.g. PubMed"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveSource(batch.batch_id);
                                  if (e.key === "Escape") setEditingBatchId(null);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveSource(batch.batch_id)}
                                className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                                title="Save Source"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBatchId(null)}
                                className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <span className="font-sans text-xs text-[#4f444b] font-medium truncate max-w-[120px]" title={batch.source || "Unspecified"}>
                                {batch.source || <span className="text-[#81737b] italic font-normal">Unspecified</span>}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBatchId(batch.batch_id);
                                  setEditingSourceValue(batch.source || "");
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-[#81737b] hover:text-[#3a0f34] transition-opacity"
                                title="Edit source"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Added to TA Screening */}
                        <td className="py-3 px-4 text-center font-mono font-medium text-[#141413]">
                          {batch.imported_count}
                        </td>

                        {/* Duplicates */}
                        <td className="py-3 px-4 text-center font-mono text-[#62535d]">
                          {batch.duplicate_count}
                        </td>

                        {/* Retained / Active Studies */}
                        <td className="py-3 px-4 text-center font-mono font-semibold text-[#3a0f34]">
                          {retainedCount}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isUndone ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200" title={batch.undone_at ? `Undone on ${batch.undone_at}` : "Undone"}>
                              <Check className="h-3 w-3 text-slate-400" />
                              <span>Undone</span>
                            </span>
                          ) : batch.status === "completed_with_errors" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              <span>Errors ({batch.failed_count})</span>
                            </span>
                          ) : batch.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-50 text-rose-800 border border-rose-200">
                              <AlertCircle className="h-3 w-3 text-rose-600" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Active</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailBatchId(batch.batch_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#4f444b] hover:text-[#3a0f34] bg-white hover:bg-[#eee7ec] border border-[#d2c2cb] transition-colors"
                              title="View batch details, record items, and duplicate outcomes"
                            >
                              <span>Details</span>
                            </button>
                            {!isUndone ? (
                              <button
                                type="button"
                                onClick={() => setSelectedUndoBatch(batch)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-[#d2c2cb] hover:border-rose-200 transition-colors"
                                title="Revert this batch and remove its studies from review"
                              >
                                <Undo2 className="h-3 w-3" />
                                <span>Undo</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-mono text-[#81737b] px-2 py-1">
                                Reverted
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <TagFilter projectId={projectId!} value={tagFilter} onChange={setTagFilter} />
        {bookmarkedOnly ? <span className="font-medium">{bookmarkedCount} bookmarked studies</span> : <label className="flex items-center gap-2"><input type="checkbox" checked={savedOnly} onChange={e => setSavedOnly(e.target.checked)} />Saved for later ({bookmarkedCount})</label>}
        <span className="text-xs text-slate-500">{bookmarks.local ? "Bookmarks are saved in this browser." : "Your personal bookmarks."}</span>
        {bookmarks.error && <span role="alert" className="text-red-600">{bookmarks.error} <button type="button" onClick={bookmarks.retry} className="underline">Retry</button></span>}
      </div>
      {savedOnly && studies && studies.length > 0 && !studies.some(s => bookmarkedIdsSet.has(s.study_id)) && <p className="text-sm text-slate-500">No saved studies yet. Use the bookmark icon to save a study for later.</p>}
      {/* Populated Study Table */}
      {studies && studies.length > 0 && <p className="text-xs text-slate-500">{visibleStudies.length} matching studies</p>}
      {tagFilter && studies && studies.length > 0 && visibleStudies.length === 0 && <p className="text-sm text-slate-500">No studies match this tag and the current filters.</p>}
      {studies && studies.length > 0 && (
        <div className="card-phylo overflow-hidden rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F2F1EB]/70 border-b border-black/[0.08] text-[10px] font-mono text-[#8A817A] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-medium">Study & Citation</th>
                  <th className="px-4 py-3 font-medium">Year</th>
                  <th className="px-4 py-3 font-medium">Design</th>
                  <th className="px-4 py-3 font-medium">Screening</th>
                  <th className="px-4 py-3 font-medium">RoB Status</th>
                  <th className="px-5 py-3 font-medium text-right">Extraction Workflows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {visibleStudies.map((s) => (
                  <StudyRow
                    key={s.study_id}
                    study={s}
                    assessment={robMap.get(s.study_id)}
                    hasRobSummary={Boolean(robSummary)}
                    tags={tagIndex.data}
                    onComments={() => setCollaborationStudy(s)}
                    bookmark={<BookmarkButton saved={bookmarkedIdsSet.has(s.study_id)} disabled={bookmarks.disabled} onClick={() => bookmarks.toggle(s.study_id)} />}
                    projectId={projectId!}
                    onDelete={() => deleteMutation.mutate(s.study_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {collaborationStudy && <CollaborationDialog title={collaborationStudy.title} onClose={() => setCollaborationStudy(null)}>
        <RecordCollaborationPanel key={collaborationStudy.study_id} projectId={projectId!} studyId={collaborationStudy.study_id} />
      </CollaborationDialog>}
      {isBulkModalOpen && (
        <BulkUploadModal
          projectId={projectId!}
          onClose={() => setIsBulkModalOpen(false)}
          onSuccess={(count, fastTrack) => {
            setIsBulkModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
            setUploadMsg(`Successfully processed and converted ${count} PDF(s) to JSON!`);
            if (fastTrack) {
              navigate(`/projects/${projectId}/extraction-sheet`);
            }
          }}
        />
      )}

      {/* Duplicate Review Modal */}
      <DuplicateReviewModal
        projectId={projectId!}
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        onResolved={() => {
          queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
          queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
        }}
      />

      {/* Batch Details Modal */}
      <BatchDetailsModal
        isOpen={!!selectedDetailBatchId}
        batchId={selectedDetailBatchId}
        projectId={projectId!}
        onClose={() => setSelectedDetailBatchId(null)}
      />

      {/* Batch Undo Modal */}
      <BatchUndoModal
        isOpen={!!selectedUndoBatch}
        batch={selectedUndoBatch}
        projectId={projectId!}
        onClose={() => setSelectedUndoBatch(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["import_batches", projectId] });
          queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
          queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
          setUploadMsg("Batch successfully undone.");
        }}
      />
    </div>
  );
}


function StudyRow({
  study,
  projectId,
  onDelete,
  bookmark,
  tags,
  onComments,
  assessment,
  hasRobSummary,
}: {
  study: Study;
  projectId: string;
  onDelete: () => void;
  bookmark: React.ReactNode;
  tags: TagIndex | undefined;
  onComments: () => void;
  assessment?: { assessment_id: string; overall_judgment: string };
  hasRobSummary?: boolean;
}) {
  // Batch optimization: Only query per-study if bulk assessment and robSummary were not supplied
  const { data: studyAssessments } = useQuery({
    queryKey: ["study-rob", study.study_id],
    queryFn: () => api.listStudyAssessments(study.study_id),
    enabled: !assessment && !hasRobSummary,
  });

  const activeAssessment = assessment || (studyAssessments && studyAssessments[0]);

  const screeningBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-black/[0.06] text-[#6B665E]",
      included: "bg-[#E9ED4C] text-[#62631E]",
      excluded: "bg-rose-100 text-rose-800",
    };
    return styles[status] || styles.pending;
  };

  return (
    <tr className="hover:bg-black/[0.015] transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-start gap-2">{bookmark}<div className="font-serif font-medium text-sm text-[#141413] line-clamp-1">{study.title}</div></div>
        <TagBadges index={tags} studyId={study.study_id} />
        <div className="text-xs font-sans text-[#8A817A] mt-0.5 line-clamp-1">
          {study.authors || "Unknown Authors"} {study.journal ? `— ${study.journal}` : ""}
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-[#6B665E]">{study.publication_year || "—"}</td>
      <td className="px-4 py-3.5 text-xs text-[#6B665E]">{study.study_design || "—"}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${screeningBadge(study.screening_status)}`}>
            {study.screening_status || "pending"}
          </span>
          {Boolean(study.is_duplicate) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 font-medium">
              <Copy className="h-2.5 w-2.5" />
              <span>DUPLICATE</span>
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5">
        {activeAssessment ? (
          <Link
            to={`/projects/${projectId}/rob/${activeAssessment.assessment_id}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#141413] hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono ${judgmentColor(activeAssessment.overall_judgment)}`}>
              {judgmentLabel(activeAssessment.overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-[#8A817A] text-xs font-serif italic">unassessed</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onComments} className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs hover:bg-black/5" aria-label={`Comments and tags for ${study.title}`}>Comments & tags</button>
          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/pdf`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-[#141413] text-[#FAF9F3] hover:bg-[#282724] transition-all shadow-2xs"
            title="Review AI Extractions in PDF with Track Changes"
          >
            <Highlighter className="h-3 w-3" />
            <span>PDF</span>
          </Link>
          <Link
            to={`/projects/${projectId}/extraction-sheet?study=${study.study_id}`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-white hover:bg-black/5 text-[#141413] border border-black/15 transition-all"
            title="View Extraction Data Sheet"
          >
            <FileSpreadsheet className="h-3 w-3" />
            <span>Sheet</span>
          </Link>
          <button
            onClick={onDelete}
            className="text-[#8A817A] hover:text-rose-600 transition-colors p-1.5 rounded-full hover:bg-black/5"
            title="Delete study"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface BulkUploadModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: (count: number, fastTrack: boolean) => void;
}

function BulkUploadModal({ projectId, onClose, onSuccess }: BulkUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fastTrack, setFastTrack] = useState(true);
  const [progressItems, setProgressItems] = useState<{ name: string; status: "pending" | "processing" | "done" | "error"; meta?: any }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf");
    if (pdfs.length > 0) {
      setSelectedFiles(prev => [...prev, ...pdfs]);
      setProgressItems(prev => [
        ...prev,
        ...pdfs.map(f => ({ name: f.name, status: "pending" as const }))
      ]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const processUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    const createdStudies: Study[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgressItems(prev => {
        const copy = [...prev];
        if (copy[i]) copy[i].status = "processing";
        return copy;
      });

      try {
        // Auto-identify metadata & convert to JSON structure
        const identified = await autoIdentifyPdf(file, projectId);

        if (fastTrack) {
          identified.screening_status = "included";
          identified.screening_stage = "fulltext";
          identified.extraction_status = "complete";
        }

        createdStudies.push(identified as any);

        setProgressItems(prev => {
          const copy = [...prev];
          if (copy[i]) {
            copy[i].status = "done";
            copy[i].meta = identified;
          }
          return copy;
        });
      } catch (err) {
        setProgressItems(prev => {
          const copy = [...prev];
          if (copy[i]) copy[i].status = "error";
          return copy;
        });
      }
    }

    if (createdStudies.length > 0) {
      await api.bulkAddStudies(projectId, createdStudies);
    }

    setIsProcessing(false);
    setTimeout(() => {
      onSuccess(createdStudies.length, fastTrack);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-[#FAF9F3] border border-black/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-black/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-[#141413] text-[#FAF9F3] flex items-center justify-center">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-normal text-[#141413]">Bulk Upload Study PDFs</h3>
              <p className="font-serif italic text-xs text-[#6B665E]">
                Auto-extract clinical metadata, parse to JSON, and jump directly to Extraction Sheet.
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="p-1 rounded-full text-black/40 hover:text-black">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-black/20 hover:border-black/50 bg-black/[0.02] hover:bg-black/[0.04] rounded-xl p-8 text-center cursor-pointer transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-8 w-8 mx-auto text-[#8A817A] mb-2" />
          <p className="font-serif text-sm font-medium text-[#141413]">
            Click to browse or drag & drop multiple PDF files here
          </p>
          <p className="font-sans text-xs text-[#6B665E] mt-1">
            Supports batch processing of 5, 10, or 20+ study papers simultaneously
          </p>
        </div>

        {/* Direct Extraction Fast-Track Option */}
        <div className="card-phylo-warm p-4 rounded-xl flex items-start gap-3 border border-black/[0.08]">
          <input
            id="fastTrack"
            type="checkbox"
            checked={fastTrack}
            onChange={(e) => setFastTrack(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-gray-300 text-[#141413] focus:ring-black"
          />
          <label htmlFor="fastTrack" className="text-xs space-y-0.5 cursor-pointer">
            <span className="font-serif font-medium text-[#141413] block">
              Direct Data Extraction Mode (Skip manual title/abstract screening)
            </span>
            <span className="font-sans text-[#6B665E] block leading-relaxed">
              Auto-includes uploaded papers and immediately navigates to the Extraction Sheet for variable review.
            </span>
          </label>
        </div>

        {/* Selected Files List & Parsing Progress */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#6B665E]">
              <span>Selected Papers ({selectedFiles.length})</span>
              <span>{progressItems.filter(p => p.status === "done").length} / {selectedFiles.length} parsed</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-black/10 rounded-xl p-2 bg-white/70">
              {progressItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-black/[0.02]">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <FileText className="h-3.5 w-3.5 text-[#8A817A] shrink-0" />
                    <span className="font-mono truncate">{item.name}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 font-mono text-[11px]">
                    {item.status === "pending" && <span className="text-[#8A817A]">queued</span>}
                    {item.status === "processing" && (
                      <span className="text-amber-700 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> parsing
                      </span>
                    )}
                    {item.status === "done" && (
                      <span className="text-emerald-700 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        {item.meta ? `${item.meta.publication_year}` : "JSON ready"}
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="text-rose-700 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> error
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-black/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="btn-phylo-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={processUpload}
            disabled={selectedFiles.length === 0 || isProcessing}
            className="btn-phylo-primary text-xs flex items-center gap-1.5"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Auto-Identifying & Converting ({progressItems.filter(p => p.status === "done").length}/{selectedFiles.length})...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Identify {selectedFiles.length} Paper(s) & Proceed</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
