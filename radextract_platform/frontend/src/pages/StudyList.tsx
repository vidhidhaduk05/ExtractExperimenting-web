import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, saveStoredProjectStudies, type Study } from "../lib/api";
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
  return [
    {
      id: `batch_seed_1_${pid}`,
      projectId: pid,
      date: "14 Oct 2026",
      filename: "ACTA2_Included_103_Studies.ris",
      addedCount: 75,
      referencesCount: 103,
      duplicatesCount: 28,
      mergedCount: 0,
      source: "Scopus",
      studyIds: [],
    },
    {
      id: `batch_seed_2_${pid}`,
      projectId: pid,
      date: "14 Oct 2026",
      filename: "export_0b88f950-fa22-4142-bbd2-282685ff0f2f_2026-10-13T194351.786774561.ris",
      addedCount: 1181,
      referencesCount: 1226,
      duplicatesCount: 45,
      mergedCount: 0,
      source: "Scopus",
      undoneAt: "14 Oct 2026",
      studyIds: [],
    },
    {
      id: `batch_seed_3_${pid}`,
      projectId: pid,
      date: "14 Oct 2026",
      filename: "records.ris",
      addedCount: 1271,
      referencesCount: 1396,
      duplicatesCount: 125,
      mergedCount: 0,
      source: "Embase",
      undoneAt: "18 Oct 2026",
      studyIds: [],
    },
  ];
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
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Direct Drag & Drop and Batch History State
  const [importBatches, setImportBatches] = useState<ImportBatch[]>(() => getInitialBatches(projectId || "default"));
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingDirect, setIsProcessingDirect] = useState(false);
  const [directProcessMsg, setDirectProcessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      setImportBatches(getInitialBatches(projectId));
    }
  }, [projectId]);

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

      const newBatch: ImportBatch = {
        id: `batch_${Date.now()}`,
        projectId: projectId!,
        date: todayStr,
        filename: mainName,
        addedCount: totalAdded,
        referencesCount: totalRefs || totalAdded,
        duplicatesCount: totalDuplicates,
        mergedCount: 0,
        source: sourceGuess,
        studyIds: batchStudyIds,
      };

      const nextBatches = [newBatch, ...importBatches];
      setImportBatches(nextBatches);
      try {
        localStorage.setItem(`radextract_import_batches_${projectId}`, JSON.stringify(nextBatches));
      } catch (e) {}

      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      setUploadMsg(`Import successful: ${totalAdded} studies added to screening from ${mainName}.`);
    } catch (err: any) {
      setUploadMsg(`Import error: ${err.message || "Failed to process files"}`);
    } finally {
      setIsProcessingDirect(false);
      setDirectProcessMsg(null);
    }
  };

  const handleUndoImport = async (batchId: string) => {
    const batch = importBatches.find(b => b.id === batchId);
    if (!batch || batch.undoneAt) return;

    if (!window.confirm(`Undo import of ${batch.filename}? This will remove the studies imported in this batch.`)) {
      return;
    }

    const todayStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const updated = importBatches.map(b => b.id === batchId ? { ...b, undoneAt: todayStr } : b);
    setImportBatches(updated);
    try {
      localStorage.setItem(`radextract_import_batches_${projectId}`, JSON.stringify(updated));
    } catch (e) {}

    try {
      const curStudies = await api.listStudies(projectId!);
      let remaining: Study[];
      if (batch.studyIds && batch.studyIds.length > 0) {
        const toRemove = new Set(batch.studyIds);
        remaining = curStudies.filter(s => !toRemove.has(s.study_id));
        for (const id of batch.studyIds) {
          api.deleteStudy(id).catch(() => {});
        }
      } else {
        remaining = curStudies.slice(0, Math.max(0, curStudies.length - (batch.addedCount || 1)));
      }
      saveStoredProjectStudies(projectId!, remaining);
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      setUploadMsg(`Import undone: ${batch.filename} was successfully undone on ${todayStr}.`);
    } catch (err: any) {
      console.error("Error undoing import:", err);
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
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans text-[#62535d] hover:text-[#3a0f34] bg-[#eee7ec] hover:bg-[#eee7ec] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>Back to Project Dashboard</span>
        </Link>
      </div>

      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#d2c2cb] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">LITERATURE REPOSITORY</span>
            <span className="text-xs font-mono text-[#81737b]">{studies?.length || 0} Studies Indexed</span>
            {isBlank && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                BLANK WORKSPACE
              </span>
            )}
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#3a0f34] tracking-tight">
            {bookmarkedOnly ? "Bookmarked studies" : "Studies & Clinical Benchmarks"}
          </h1>
          <p className="font-serif italic text-sm text-[#62535d] mt-1">
            {bookmarkedOnly ? "Your saved studies for reviewing later. Remove a bookmark when you no longer need it." : "Verified study extraction records, bounding box quote locators, and evidence quality reviews."}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <Link to={`/projects/${projectId}/${bookmarkedOnly ? "studies" : "bookmarks"}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] text-xs font-medium hover:bg-[#eee7ec]">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] text-xs font-medium text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
              title="Restore standard 6 benchmark demo studies"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#62535d]" />
              <span>Load Benchmark Studies</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartBlank}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] text-xs font-medium text-[#62535d] hover:text-[#ab3329] hover:border-[#ab3329]/30 hover:bg-[#ab3329]/10 transition-colors"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] bg-white text-xs font-medium text-[#3a0f34] hover:bg-[#eee7ec] transition-colors shadow-2xs"
            title="Open side-by-side duplicate review workspace (Keep primary, Keep both, Merge metadata)"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-[#62535d]" />
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
          <div className="h-10 w-10 rounded-full bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center shrink-0 shadow-xs">
            <Highlighter className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-serif text-lg font-medium text-[#3a0f34]">
                Direct Co-Scientist Quote Extraction & Verification
              </h2>
              <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">FAST-TRACK EXTRACTION</span>
            </div>
            <p className="font-sans text-xs text-[#62535d] max-w-xl leading-relaxed">
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
            <Highlighter className="h-3.5 w-3.5 text-[#3a0f34]" />
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
                <h3 className="font-serif text-sm font-medium text-[#3a0f34]">
                  Duplicate Bibliographic Records Identified ({dedupData.total_duplicates} candidate duplicates in {dedupData.duplicate_groups.length} group{dedupData.duplicate_groups.length > 1 ? "s" : ""})
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                  DEDUPLICATION STEP
                </span>
              </div>
              <p className="font-sans text-xs text-[#62535d] mt-0.5 max-w-2xl leading-relaxed">
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
              ? "bg-[#ab3329]/10 border border-[#ab3329]/30 text-[#ab3329]"
              : "bg-[#ffdea6] border border-[#d2c2cb] text-[#3a0f34]"
          }`}
        >
          <span>{uploadMsg}</span>
          <button onClick={() => setUploadMsg(null)} className="text-black/40 hover:text-black">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="p-12 text-center text-[#81737b] font-serif italic text-sm">
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
            ? "border-[#814d75] bg-[#ffdea6]/60 shadow-lg scale-[1.005]"
            : "border-[#d2c2cb] hover:border-[#814d75] bg-[#fbf9f4]/80 hover:bg-[#fbf9f4] shadow-xs"
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
            <Loader2 className="h-9 w-9 text-[#7c5800] animate-spin" />
            <div className="font-serif text-lg font-medium text-[#3a0f34]">
              {directProcessMsg || "Importing studies..."}
            </div>
            <p className="font-sans text-xs text-[#62535d]">
              Parsing citations, extracting study metadata, and screening eligibility...
            </p>
          </div>
        ) : (
          <div className="max-w-xl mx-auto space-y-2">
            <div className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center mx-auto transition-transform",
              isDragging ? "bg-[#814d75] text-[#fbf9f4] scale-110" : "bg-[#3a0f34] text-[#fbf9f4]"
            )}>
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-xl font-normal text-[#3a0f34] tracking-tight">
              Drag & drop studies here
            </h3>
            <p className="font-sans text-xs text-[#62535d] leading-relaxed">
              Drop study files directly onto this area (<span className="font-mono font-medium text-[#3a0f34]">.ris, .bib, .pdf, .csv, .xml, .nbib</span>).
              Files process instantly without opening another dialog box.
            </p>
            <div className="pt-1.5 flex items-center justify-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#d2c2cb] text-[#3a0f34] shadow-2xs hover:bg-[#eee7ec]">
                <FolderPlus className="h-3.5 w-3.5 text-[#62535d]" />
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

      {/* ── Import Batches History (Covidence-Style Cards with Undo Import) ── */}
      {importBatches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-normal text-[#3a0f34]">
                Import Batches & Screening History
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#eee7ec] text-[#62535d]">
                {importBatches.length} Batches
              </span>
            </div>
            <span className="text-xs text-[#81737b] italic font-serif hidden sm:inline">
              Click "Undo import" on any batch to revert study inclusions
            </span>
          </div>

          <div className="space-y-4">
            {importBatches.map((batch) => (
              <div
                key={batch.id}
                className="bg-white border border-black/10 rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4 transition-all hover:border-[#d2c2cb]"
              >
                {/* Header: Date + Filename on Left, Status / Undo Import on Right */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.04] pb-3">
                  <div>
                    <div className="text-xs text-[#81737b] font-sans font-medium">{batch.date}</div>
                    <div className="text-sm font-semibold font-mono text-[#3a0f34] mt-0.5 break-all">
                      {batch.filename}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {batch.undoneAt ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans text-[#62535d] bg-[#eee7ec] border border-[#d2c2cb]">
                        <Check className="h-3.5 w-3.5 text-[#81737b]" />
                        <span>Undone on {batch.undoneAt}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUndoImport(batch.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#4f444b] hover:text-[#ab3329] bg-white hover:bg-[#ab3329]/10 border border-[#d2c2cb] hover:border-[#ab3329]/30 transition-colors"
                        title="Revert this batch and remove its studies from review"
                      >
                        <Undo2 className="h-3.5 w-3.5 text-[#81737b] hover:text-[#ab3329]" />
                        <span>Undo import</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5 Metric Cards in a Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {/* Card 1: Added to title and abstract screening */}
                  <div className="bg-[#eee7ec] border border-[#d2c2cb] rounded-xl p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] text-[#62535d] font-sans leading-tight">
                      Added to title and abstract screening
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#3a0f34] mt-2">
                      {batch.addedCount}
                    </span>
                  </div>

                  {/* Card 2: References */}
                  <div className="bg-white border border-[#d2c2cb] rounded-xl p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] text-[#62535d] font-sans leading-tight">
                      References
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#3a0f34] mt-2">
                      {batch.referencesCount}
                    </span>
                  </div>

                  {/* Card 3: Duplicates */}
                  <div className="bg-white border border-[#d2c2cb] rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Duplicates</span>
                      <ExternalLink className="h-3 w-3 text-[#81737b]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#3a0f34] mt-2">
                      {batch.duplicatesCount}
                    </span>
                  </div>

                  {/* Card 4: Merged */}
                  <div className="bg-white border border-[#d2c2cb] rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Merged</span>
                      <HelpCircle className="h-3 w-3 text-[#81737b]" />
                    </div>
                    <span className="text-2xl sm:text-3xl font-bold font-sans text-[#3a0f34] mt-2">
                      {batch.mergedCount}
                    </span>
                  </div>

                  {/* Card 5: Source */}
                  <div className="bg-white border border-[#d2c2cb] rounded-xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-[#62535d] font-sans leading-tight">
                      <span>Source</span>
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
      {studies && studies.length > 0 && <p className="text-xs text-[#81737b]">{visibleStudies.length} matching studies</p>}
      {tagFilter && studies && studies.length > 0 && visibleStudies.length === 0 && <p className="text-sm text-[#62535d]">No studies match this tag and the current filters.</p>}
      {studies && studies.length > 0 && (
        <div className="card-phylo overflow-hidden rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#fbf9f4]/70 border-b border-[#d2c2cb] text-[10px] font-mono text-[#81737b] uppercase tracking-wider">
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
      pending: "bg-[#eee7ec] text-[#62535d]",
      included: "bg-[#ffdea6] text-[#7c5800]",
      excluded: "bg-[#ab3329]/10 text-[#ab3329]",
    };
    return styles[status] || styles.pending;
  };

  return (
    <tr className="hover:bg-black/[0.015] transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-start gap-2">{bookmark}<div className="font-serif font-medium text-sm text-[#3a0f34] line-clamp-1">{study.title}</div></div>
        <TagBadges index={tags} studyId={study.study_id} />
        <div className="text-xs font-sans text-[#81737b] mt-0.5 line-clamp-1">
          {study.authors || "Unknown Authors"} {study.journal ? `— ${study.journal}` : ""}
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-[#62535d]">{study.publication_year || "—"}</td>
      <td className="px-4 py-3.5 text-xs text-[#62535d]">{study.study_design || "—"}</td>
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
            className="inline-flex items-center gap-1.5 text-xs text-[#3a0f34] hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#7c5800]" />
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono ${judgmentColor(activeAssessment.overall_judgment)}`}>
              {judgmentLabel(activeAssessment.overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-[#81737b] text-xs font-serif italic">unassessed</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onComments} className="rounded-full border border-[#d2c2cb] bg-white px-3 py-1 text-xs hover:bg-[#eee7ec]" aria-label={`Comments and tags for ${study.title}`}>Comments & tags</button>
          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/pdf`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-2xs"
            title="Review Co-Scientist Extractions in PDF with Track Changes"
          >
            <Highlighter className="h-3 w-3" />
            <span>PDF</span>
          </Link>
          <Link
            to={`/projects/${projectId}/extraction-sheet?study=${study.study_id}`}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all"
            title="View Extraction Data Sheet"
          >
            <FileSpreadsheet className="h-3 w-3" />
            <span>Sheet</span>
          </Link>
          <button
            onClick={onDelete}
            className="text-[#81737b] hover:text-[#ab3329] transition-colors p-1.5 rounded-full hover:bg-[#eee7ec]"
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
      <div className="bg-[#fbf9f4] border border-black/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-normal text-[#3a0f34]">Bulk Upload Study PDFs</h3>
              <p className="font-serif italic text-xs text-[#62535d]">
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
          className="border-2 border-dashed border-[#d2c2cb] hover:border-[#814d75] bg-black/[0.02] hover:bg-black/[0.04] rounded-xl p-8 text-center cursor-pointer transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-8 w-8 mx-auto text-[#81737b] mb-2" />
          <p className="font-serif text-sm font-medium text-[#3a0f34]">
            Click to browse or drag & drop multiple PDF files here
          </p>
          <p className="font-sans text-xs text-[#62535d] mt-1">
            Supports batch processing of 5, 10, or 20+ study papers simultaneously
          </p>
        </div>

        {/* Direct Extraction Fast-Track Option */}
        <div className="card-phylo-warm p-4 rounded-xl flex items-start gap-3 border border-[#d2c2cb]">
          <input
            id="fastTrack"
            type="checkbox"
            checked={fastTrack}
            onChange={(e) => setFastTrack(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-[#d2c2cb] text-[#3a0f34] focus:ring-[#814d75]"
          />
          <label htmlFor="fastTrack" className="text-xs space-y-0.5 cursor-pointer">
            <span className="font-serif font-medium text-[#3a0f34] block">
              Direct Data Extraction Mode (Skip manual title/abstract screening)
            </span>
            <span className="font-sans text-[#62535d] block leading-relaxed">
              Auto-includes uploaded papers and immediately navigates to the Extraction Sheet for variable review.
            </span>
          </label>
        </div>

        {/* Selected Files List & Parsing Progress */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#62535d]">
              <span>Selected Papers ({selectedFiles.length})</span>
              <span>{progressItems.filter(p => p.status === "done").length} / {selectedFiles.length} parsed</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-black/10 rounded-xl p-2 bg-white/70">
              {progressItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-black/[0.02]">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <FileText className="h-3.5 w-3.5 text-[#81737b] shrink-0" />
                    <span className="font-mono truncate">{item.name}</span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 font-mono text-[11px]">
                    {item.status === "pending" && <span className="text-[#81737b]">queued</span>}
                    {item.status === "processing" && (
                      <span className="text-amber-700 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> parsing
                      </span>
                    )}
                    {item.status === "done" && (
                      <span className="text-[#7c5800] flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        {item.meta ? `${item.meta.publication_year}` : "JSON ready"}
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="text-[#ab3329] flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> error
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#d2c2cb]">
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
