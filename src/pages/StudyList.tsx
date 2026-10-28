import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, saveStoredProjectStudies, type Study, type ImportBatchResponse } from "../lib/api";
import { autoIdentifyPdf } from "../lib/pdfAutoIdentifier";
import {
  Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Upload, Loader2,
  Highlighter, FileSpreadsheet, ArrowRight, CheckCircle2, X,
  RefreshCw, Sparkles, FolderPlus, Check, AlertCircle, ArrowLeftRight, Copy,
  ExternalLink, HelpCircle, Undo2, Edit3
} from "lucide-react";
import { judgmentColor, judgmentLabel } from "../lib/utils";
import { useRef, useState, useMemo, useEffect } from "react";
import { DuplicateReviewModal } from "../components/common/DuplicateReviewModal";
import { BookmarkButton } from "../components/common/BookmarkButton";
import { useBookmarks } from "../lib/bookmarks";
import { matchesTag, useProjectTags, type TagIndex } from "../lib/recordCollaboration";
import { CollaborationDialog, RecordCollaborationPanel, TagBadges, TagFilter } from "../components/common/RecordCollaboration";
import { cn } from "../lib/utils";

export interface ImportBatch {
  id: string;
  projectId: string;
  date: string;
  filename: string;
  addedCount: number;
  referencesCount: number;
  duplicatesCount: number;
  mergedCount: number;
  source: string;
  studyIds: string[];
  undoneAt?: string | null;
}

const getInitialBatches = (pid: string): ImportBatch[] => {
  try {
    const saved = localStorage.getItem(`radextract_import_batches_${pid}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
};

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
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.hash.includes("dedup") || window.location.search.includes("dedup");
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.hash.includes("dedup") || window.location.search.includes("dedup")) {
        setIsDuplicateModalOpen(true);
      }
    }
  }, []);

  // Direct Drag & Drop and Persistent Server Batch History State
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingDirect, setIsProcessingDirect] = useState(false);
  const [directProcessMsg, setDirectProcessMsg] = useState<string | null>(null);

  const { data: serverBatches = [], refetch: refetchBatches } = useQuery<ImportBatchResponse[]>({
    queryKey: ["import-batches", projectId],
    queryFn: () => (projectId ? api.listImportBatches(projectId).catch(() => []) : Promise.resolve([])),
    enabled: !!projectId,
    refetchInterval: isProcessingDirect ? 2000 : false,
  });

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["studies", projectId] }),
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
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
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
      let totalRefs = 0;
      let totalDuplicates = 0;
      const batchStudyIds: string[] = [];

      // Reference files (.ris, .bib, .csv, .xml, .nbib, .txt)
      if (refFiles.length > 0) {
        setDirectProcessMsg(`Parsing ${refFiles.length} bibliographic reference file(s)...`);
        const res = await api.uploadReferences(projectId!, refFiles);
        const added = res.imported_count || 0;
        const skipped = res.skipped_duplicates || 0;
        totalAdded += added;
        totalDuplicates += skipped;
        totalRefs += (added + skipped);
        if (res.imported_studies) {
          batchStudyIds.push(...res.imported_studies.map((s: any) => s.study_id));
        }
      }

      // PDF files
      if (pdfFiles.length > 0) {
        setDirectProcessMsg(`Extracting clinical metadata from ${pdfFiles.length} PDF(s)...`);
        const created: Study[] = [];
        for (const pdf of pdfFiles) {
          try {
            const identified = await autoIdentifyPdf(pdf, projectId);
            created.push(identified as any);
            batchStudyIds.push(identified.study_id);
          } catch (e) {
            console.error(e);
          }
        }
        if (created.length > 0) {
          await api.bulkAddStudies(projectId!, created);
          totalAdded += created.length;
          totalRefs += created.length;
        }
      }

      const todayStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const mainName = fileArray.length === 1 ? fileArray[0].name : `${fileArray[0].name} (+${fileArray.length - 1} more)`;
      const sourceGuess = mainName.toLowerCase().includes("embase")
        ? "Embase"
        : mainName.toLowerCase().includes("scopus")
        ? "Scopus"
        : mainName.toLowerCase().includes("pubmed")
        ? "PubMed"
        : refFiles.length > 0
        ? "RIS File"
        : "Direct PDF Upload";

      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      setUploadMsg(`Import successful: ${totalAdded} studies added to screening from ${mainName}.`);
    } catch (err: any) {
      setUploadMsg(`Import error: ${err.message || "Failed to process files"}`);
    } finally {
      setIsProcessingDirect(false);
      setDirectProcessMsg(null);
    }
  };

  const handleUndoImport = async (batchId: string) => {
    const batch = serverBatches.find(b => b.batch_id === batchId);
    if (!batch || batch.status === "undone") return;

    if (!window.confirm(`Undo import of ${batch.filename}? This will atomically remove studies introduced in this batch from the database.`)) {
      return;
    }

    try {
      const res = await api.undoImportBatch(projectId!, batchId, false);
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      setUploadMsg(res.message || `Import of ${batch.filename} successfully undone.`);
    } catch (err: any) {
      if (err.message && err.message.includes("409")) {
        if (window.confirm(`Studies in this batch have downstream work (screening decisions or extractions). Force undo and remove downstream data?`)) {
          const forceRes = await api.undoImportBatch(projectId!, batchId, true);
          queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
          queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
          queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
          setUploadMsg(forceRes.message || `Import of ${batch.filename} forcibly undone.`);
          return;
        }
      }
      setUploadMsg(`Error undoing batch: ${err.message || "Failed to undo import"}`);
    }
  };

  const handleStartBlank = async () => {
    if (window.confirm("Start blank workspace? This will clear benchmark demo studies so you can upload and extract your own literature.")) {
      await api.resetStudies(projectId!, true);
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      setUploadMsg("Workspace cleared. Repository is now blank and ready for custom study uploads.");
    }
  };

  const handleRestoreBenchmark = async () => {
    await api.resetStudies(projectId!, false);
    queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
    setUploadMsg("Benchmark clinical studies restored (6 verified intracranial PAM literature datasets).");
  };

  const isBlank = studies && studies.length === 0;

  // Performance optimization: O(1) Set lookup for bookmarks instead of O(N*B) array searches
  const bookmarkSet = useMemo(() => new Set(bookmarks.ids), [bookmarks.ids]);

  // Memoized count of bookmarked studies
  const bookmarkedCount = useMemo(() => {
    if (!studies) return 0;
    let count = 0;
    for (let i = 0; i < studies.length; i++) {
      if (bookmarkSet.has(studies[i].study_id)) count++;
    }
    return count;
  }, [studies, bookmarkSet]);

  const visibleStudies = useMemo(() => {
    if (!studies) return [];
    return studies.filter(s => (!savedOnly || bookmarkSet.has(s.study_id)) && matchesTag(tagIndex.data, s.study_id, tagFilter));
  }, [studies, savedOnly, bookmarkSet, tagIndex.data, tagFilter]);

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
          <h1 className="font-['Serifon_Editorial'] text-3xl sm:text-4xl font-bold text-[#3a0f34] tracking-tight">
            {bookmarkedOnly ? "Bookmarked studies" : "Studies & Clinical Benchmarks"}
          </h1>
          <p className="font-['Newsreader'] italic text-sm text-[#62535d] mt-1">
            {bookmarkedOnly ? "Your saved studies for reviewing later. Remove a bookmark when you no longer need it." : "Verified study extraction records, bounding box quote locators, and evidence quality reviews."}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <Link to={`/projects/${projectId}/${bookmarkedOnly ? "studies" : "bookmarks"}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
              title="Restore standard 6 benchmark demo studies"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#814d75]" />
              <span>Load Benchmark Studies</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartBlank}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#62535d] hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] bg-white text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
            title="Open side-by-side duplicate review workspace (Keep primary, Keep both, Merge metadata)"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-[#814d75]" />
            <span>Duplicate Review</span>
            {dedupData && dedupData.total_duplicates > 0 ? (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#ffdea6]/50 text-[#7c5800] border border-[#d2c2cb]">
                {dedupData.total_duplicates}
              </span>
            ) : null}
          </button>

          {/* Bulk Upload PDFs Button */}
          <button
            type="button"
            className="bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => setIsBulkModalOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5 text-[#ffdea6]" />
            <span>Bulk Upload PDFs</span>
          </button>

          {/* Import Single Study */}
          <Link
            to={`/projects/${projectId}/studies/new`}
            className="bg-[#ffffff] text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
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

      {/* ── Import Batches History (Real Server Persistent Batches with Atomic Undo) ── */}
      {serverBatches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-bold text-[#3a0f34]">
                Import Batches & Screening History
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]">
                {serverBatches.length} Batches Recorded
              </span>
            </div>
            <span className="text-xs text-[#62535d] italic font-serif hidden sm:inline">
              Click "Undo import" on any batch to revert study inclusions and remove from review
            </span>
          </div>

          <div className="space-y-4">
            {serverBatches.map((batch) => (
              <div
                key={batch.batch_id}
                className="bg-white border border-[#d2c2cb] rounded p-5 sm:p-6 shadow-xs space-y-4 transition-all hover:border-[#814d75]"
              >
                {/* Header: Date + Filename on Left, Status / Undo Import on Right */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#d2c2cb]/40 pb-3">
                  <div>
                    <div className="text-xs text-[#62535d] font-sans font-medium">{batch.created_at} &middot; format: <span className="uppercase font-mono">{batch.format}</span></div>
                    <div className="text-sm font-semibold font-mono text-[#3a0f34] mt-0.5 break-all">
                      {batch.filename}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {batch.status === "undone" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-sans text-[#62535d] bg-[#eee7ec] border border-[#d2c2cb]">
                        <Check className="h-3.5 w-3.5 text-[#7c5800]" />
                        <span>Undone {batch.undone_at ? `on ${batch.undone_at}` : ""}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUndoImport(batch.batch_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-[#3a0f34] hover:text-rose-700 bg-white hover:bg-rose-50 border border-[#d2c2cb] hover:border-rose-300 transition-colors cursor-pointer"
                        title="Revert this batch and remove its studies from review"
                      >
                        <Undo2 className="h-3.5 w-3.5 text-[#814d75] hover:text-rose-600" />
                        <span>Undo import</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5 Metric Cards in a Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {/* Card 1: Added to title and abstract screening */}
                  <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] text-[#62535d] font-sans leading-tight">
                      Added to Screening
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#3a0f34] mt-2">
                      {batch.imported_count}
                    </span>
                  </div>

                  {/* Card 2: References */}
                  <div className="bg-white border border-[#d2c2cb] rounded p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] text-[#62535d] font-sans leading-tight">
                      Total Records
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#4f444b] mt-2">
                      {batch.total_records || batch.imported_count}
                    </span>
                  </div>

                  {/* Card 3: Duplicates */}
                  <div className="bg-white border border-[#d2c2cb] rounded p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Duplicates</span>
                      <ExternalLink className="h-3 w-3 text-[#81737b]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#4f444b] mt-2">
                      {batch.duplicate_count}
                    </span>
                  </div>

                  {/* Card 4: Retained Active */}
                  <div className="bg-white border border-[#d2c2cb] rounded p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Retained Active</span>
                      <HelpCircle className="h-3 w-3 text-[#81737b]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#4f444b] mt-2">
                      {batch.retained_studies_count ?? batch.imported_count}
                    </span>
                  </div>

                  {/* Card 5: Source */}
                  <div className="bg-white border border-[#d2c2cb] rounded p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Source Database</span>
                      <Edit3 className="h-3 w-3 text-[#81737b]" />
                    </div>
                    <span className="text-sm sm:text-base font-semibold font-sans text-[#3a0f34] mt-2 truncate" title={batch.source}>
                      {batch.source}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <TagFilter projectId={projectId!} value={tagFilter} onChange={setTagFilter} />
        {bookmarkedOnly ? <span className="font-medium">{bookmarkedCount} bookmarked studies</span> : <label className="flex items-center gap-2"><input type="checkbox" checked={savedOnly} onChange={e => setSavedOnly(e.target.checked)} />Saved for later ({bookmarkedCount})</label>}
        <span className="text-xs text-[#81737b]">{bookmarks.local ? "Bookmarks are saved in this browser." : "Your personal bookmarks."}</span>
        {bookmarks.error && <span role="alert" className="text-red-600">{bookmarks.error} <button type="button" onClick={bookmarks.retry} className="underline">Retry</button></span>}
      </div>
      {savedOnly && studies && studies.length > 0 && bookmarkedCount === 0 && <p className="text-sm text-[#62535d]">No saved studies yet. Use the bookmark icon to save a study for later.</p>}
      {/* Populated Study Table */}
      {studies && studies.length > 0 && <p className="text-xs text-slate-500">{visibleStudies.length} matching studies</p>}
      {tagFilter && studies && studies.length > 0 && visibleStudies.length === 0 && <p className="text-sm text-slate-500">No studies match this tag and the current filters.</p>}
      {studies && studies.length > 0 && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#fbf9f4] border-b border-[#d2c2cb] text-[10px] font-mono text-[#62535d] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-semibold">Study & Citation</th>
                  <th className="px-4 py-3 font-semibold">Year</th>
                  <th className="px-4 py-3 font-semibold">Design</th>
                  <th className="px-4 py-3 font-semibold">Screening</th>
                  <th className="px-4 py-3 font-semibold">RoB Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Extraction Workflows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2c2cb]/40">
                {visibleStudies.map((s) => (
                  <StudyRow
                    key={s.study_id}
                    study={s}
                    assessment={robMap.get(s.study_id)}
                    tags={tagIndex.data}
                    onComments={() => setCollaborationStudy(s)}
                    bookmark={<BookmarkButton saved={bookmarkSet.has(s.study_id)} disabled={bookmarks.disabled} onClick={() => bookmarks.toggle(s.study_id)} />}
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
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
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
      queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
          queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
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
}: {
  study: Study;
  projectId: string;
  onDelete: () => void;
  bookmark: React.ReactNode;
  tags: TagIndex | undefined;
  onComments: () => void;
  assessment?: { assessment_id: string; overall_judgment: string };
}) {
  // Batch optimization: Only query per-study if bulk assessment was not supplied
  const { data: studyAssessments } = useQuery({
    queryKey: ["study-rob", study.study_id],
    queryFn: () => api.listStudyAssessments(study.study_id),
    enabled: !assessment,
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
    <tr className="hover:bg-[#eee7ec]/30 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-start gap-2">{bookmark}<div className="font-['Serifon_Editorial'] font-bold text-sm text-[#3a0f34] line-clamp-1">{study.title}</div></div>
        <TagBadges index={tags} studyId={study.study_id} />
        <div className="text-xs font-['Work_Sans'] text-[#62535d] mt-0.5 line-clamp-1">
          {study.authors || "Unknown Authors"} {study.journal ? `— ${study.journal}` : ""}
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-[#62535d]">{study.publication_year || "—"}</td>
      <td className="px-4 py-3.5 text-xs text-[#62535d]">{study.study_design || "—"}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-mono font-medium ${screeningBadge(study.screening_status)}`}>
            {study.screening_status || "pending"}
          </span>
          {Boolean(study.is_duplicate) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#ffdea6]/50 text-[#7c5800] border border-[#d2c2cb] font-medium">
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
            className="inline-flex items-center gap-1.5 text-xs text-[#3a0f34] hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono ${judgmentColor(activeAssessment.overall_judgment)}`}>
              {judgmentLabel(activeAssessment.overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-[#81737b] text-xs font-['Newsreader'] italic">unassessed</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onComments} className="rounded border border-[#d2c2cb] bg-white px-3 py-1 text-xs text-[#4f444b] hover:bg-[#eee7ec] transition-colors" aria-label={`Comments and tags for ${study.title}`}>Comments & tags</button>
          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/pdf`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all"
            title="Review Co-Scientist Extractions in PDF with Track Changes"
          >
            <Highlighter className="h-3 w-3 text-[#ffdea6]" />
            <span>PDF</span>
          </Link>
          <Link
            to={`/projects/${projectId}/extraction-sheet?study=${study.study_id}`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all"
            title="View Extraction Data Sheet"
          >
            <FileSpreadsheet className="h-3 w-3 text-[#814d75]" />
            <span>Sheet</span>
          </Link>
          <button
            onClick={onDelete}
            className="text-[#81737b] hover:text-rose-700 hover:bg-[#eee7ec] transition-colors p-1.5 rounded"
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
