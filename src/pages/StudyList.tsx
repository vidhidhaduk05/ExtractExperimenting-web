import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, saveStoredProjectStudies, type Study, type ImportBatchResponse } from "../lib/api";
import { autoIdentifyPdf } from "../lib/pdfAutoIdentifier";
import {
  Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Upload, Loader2, Download,
  Highlighter, FileSpreadsheet, ArrowRight, CheckCircle2, X,
  RefreshCw, Sparkles, FolderPlus, Check, AlertCircle, ArrowLeftRight, Copy,
  ExternalLink, HelpCircle, Undo2, Edit3, Search, Eye, Filter, Lock, ArrowUpDown
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

export const EXCEL_STUDY_COLUMNS = [
  { key: "title", letter: "A", label: "Title", width: "w-[340px]" },
  { key: "authors", letter: "B", label: "Creator (Authors)", width: "w-[200px]" },
  { key: "year", letter: "C", label: "Date / Year", width: "w-[100px]" },
  { key: "journal", letter: "D", label: "Publisher / Journal", width: "w-[190px]" },
  { key: "status", letter: "E", label: "Screening Status", width: "w-[170px]" },
  { key: "rob", letter: "F", label: "RoB Judgment", width: "w-[150px]" },
  { key: "workflows", letter: "G", label: "Workflows & Published Site", width: "w-[280px]" },
] as const;

export function StudyList({ bookmarkedOnly = false }: { bookmarkedOnly?: boolean }) {
  const { projectId } = useParams<{ projectId: string }>();
  const bookmarks = useBookmarks(projectId);
  const tagIndex = useProjectTags(projectId);
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "included" | "uncertain" | "excluded" | "pending">("all");
  const [sortBy, setSortBy] = useState<"status" | "year" | "title">("status");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
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

  // Live screening status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ studyId, newStatus }: { studyId: string; newStatus: string }) =>
      api.screeningDecision(projectId!, {
        study_id: studyId,
        decision: newStatus as any,
        reason: `Status updated via Excel Study Sheet: ${newStatus}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
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

      // PDF files (direct auto-identification)
      if (pdfFiles.length > 0) {
        setDirectProcessMsg(`Extracting text and identifying ${pdfFiles.length} PDF paper(s)...`);
        for (let i = 0; i < pdfFiles.length; i++) {
          const file = pdfFiles[i];
          setDirectProcessMsg(`Reading PDF ${i + 1}/${pdfFiles.length}: "${file.name}"...`);
          try {
            const identified = await autoIdentifyPdf(file, projectId);
            const studyPayload: Partial<Study> = {
              title: identified.title || file.name.replace(/\.[^/.]+$/, ""),
              authors: identified.authors || "Unknown Authors",
              journal: identified.journal || "Imported Clinical Document",
              publication_year: identified.year || new Date().getFullYear(),
              doi: identified.doi,
              pmid: identified.pmid,
              abstract: identified.abstract,
              screening_status: "pending",
              pdf_filename: file.name,
            };
            const created = await api.createStudy(projectId!, studyPayload);
            totalAdded += 1;
            totalRefs += 1;
            if (created && created.study_id) {
              batchStudyIds.push(created.study_id);
            }
          } catch (e: any) {
            console.error(`Failed to ingest direct PDF ${file.name}:`, e);
          }
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
      queryClient.invalidateQueries({ queryKey: ["duplicate_groups", projectId] });
      setUploadMsg(res.message || `Import of ${batch.filename} successfully undone.`);
    } catch (err: any) {
      if (err.message && err.message.includes("409")) {
        if (window.confirm(`Studies in this batch have downstream work (screening decisions or extractions). Force undo and remove downstream data?`)) {
          const forceRes = await api.undoImportBatch(projectId!, batchId, true);
          queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
          queryClient.invalidateQueries({ queryKey: ["import-batches", projectId] });
          queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
          queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
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

  // Performance optimization: O(1) Set lookup for bookmarks
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

  // Rank order helper: Included (1) -> Uncertain (2) -> Excluded (3) -> Pending (4)
  const getStatusRank = (status?: string | null): number => {
    if (!status) return 4;
    const s = status.toLowerCase();
    if (s === "included" || s === "ta_included" || s === "ft_included") return 1;
    if (s === "uncertain") return 2;
    if (s === "excluded" || s === "ta_excluded" || s === "ft_excluded") return 3;
    return 4; // pending or other
  };

  // Counts for status pills
  const statusCounts = useMemo(() => {
    const counts = { included: 0, uncertain: 0, excluded: 0, pending: 0 };
    if (!studies) return counts;
    for (const s of studies) {
      const rank = getStatusRank(s.screening_status);
      if (rank === 1) counts.included++;
      else if (rank === 2) counts.uncertain++;
      else if (rank === 3) counts.excluded++;
      else counts.pending++;
    }
    return counts;
  }, [studies]);

  const visibleStudies = useMemo(() => {
    if (!studies) return [];
    const filtered = studies.filter((s) => {
      if (savedOnly && !bookmarkSet.has(s.study_id)) return false;
      if (!matchesTag(tagIndex.data, s.study_id, tagFilter)) return false;
      if (statusFilter !== "all") {
        const rank = getStatusRank(s.screening_status);
        if (statusFilter === "included" && rank !== 1) return false;
        if (statusFilter === "uncertain" && rank !== 2) return false;
        if (statusFilter === "excluded" && rank !== 3) return false;
        if (statusFilter === "pending" && rank !== 4) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (s.title || "").toLowerCase().includes(q);
        const authorMatch = (s.authors || "").toLowerCase().includes(q);
        const journalMatch = (s.journal || "").toLowerCase().includes(q);
        const doiMatch = (s.doi || "").toLowerCase().includes(q);
        if (!titleMatch && !authorMatch && !journalMatch && !doiMatch) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "status") {
        const rankA = getStatusRank(a.screening_status);
        const rankB = getStatusRank(b.screening_status);
        if (rankA !== rankB) {
          return sortDirection === "asc" ? rankA - rankB : rankB - rankA;
        }
        return (b.publication_year || 0) - (a.publication_year || 0);
      }
      if (sortBy === "year") {
        const yearA = a.publication_year || 0;
        const yearB = b.publication_year || 0;
        return sortDirection === "asc" ? yearA - yearB : yearB - yearA;
      }
      if (sortBy === "title") {
        return sortDirection === "asc"
          ? (a.title || "").localeCompare(b.title || "")
          : (b.title || "").localeCompare(a.title || "");
      }
      return 0;
    });
  }, [studies, savedOnly, bookmarkSet, tagIndex.data, tagFilter, statusFilter, searchQuery, sortBy, sortDirection]);

  // Active cell coordinate & formula value calculation (Excel native simulation)
  const activeCol = EXCEL_STUDY_COLUMNS.find((c) => c.key === selectedCell?.colKey) || EXCEL_STUDY_COLUMNS[0];
  const activeCellCoord = selectedCell ? `${activeCol.letter}${selectedCell.rowIdx + 1}` : "A1";
  const activeStudy = selectedCell ? visibleStudies[selectedCell.rowIdx] : visibleStudies[0];

  const getPublishedUrl = (s: Study): string => {
    if (s.doi) {
      const cleanDoi = s.doi.trim().replace(/^doi:\s*/i, "");
      if (cleanDoi.startsWith("http")) return cleanDoi;
      return `https://doi.org/${cleanDoi}`;
    }
    if (s.pmid) {
      const cleanPmid = s.pmid.trim().replace(/^pmid:\s*/i, "");
      return `https://pubmed.ncbi.nlm.nih.gov/${cleanPmid}/`;
    }
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(s.title)}`;
  };

  const activeCellValue = useMemo(() => {
    if (!activeStudy) return "";
    switch (selectedCell?.colKey) {
      case "title":
        return activeStudy.title || "";
      case "authors":
        return activeStudy.authors || "Unknown Authors";
      case "year":
        return activeStudy.publication_year ? String(activeStudy.publication_year) : "";
      case "journal":
        return activeStudy.journal || "";
      case "status":
        return activeStudy.screening_status || "pending";
      case "rob": {
        const ass = robMap.get(activeStudy.study_id);
        return ass ? judgmentLabel(ass.overall_judgment) : "unassessed";
      }
      case "workflows":
        return getPublishedUrl(activeStudy);
      default:
        return activeStudy.title || "";
    }
  }, [selectedCell, activeStudy, robMap]);

  // Keyboard navigation across Excel Grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (!selectedCell && visibleStudies.length > 0) {
        if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          setSelectedCell({ rowIdx: 0, colKey: "title" });
          return;
        }
      }
      if (!selectedCell) return;

      const colIndex = EXCEL_STUDY_COLUMNS.findIndex((c) => c.key === selectedCell.colKey);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectedCell.rowIdx < visibleStudies.length - 1) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx + 1, colKey: selectedCell.colKey });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedCell.rowIdx > 0) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx - 1, colKey: selectedCell.colKey });
        }
      } else if (e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        if (colIndex < EXCEL_STUDY_COLUMNS.length - 1) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx, colKey: EXCEL_STUDY_COLUMNS[colIndex + 1].key });
        } else if (selectedCell.rowIdx < visibleStudies.length - 1) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx + 1, colKey: EXCEL_STUDY_COLUMNS[0].key });
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (colIndex > 0) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx, colKey: EXCEL_STUDY_COLUMNS[colIndex - 1].key });
        } else if (selectedCell.rowIdx > 0) {
          setSelectedCell({ rowIdx: selectedCell.rowIdx - 1, colKey: EXCEL_STUDY_COLUMNS[EXCEL_STUDY_COLUMNS.length - 1].key });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCell, visibleStudies.length]);

  return (
    <div className="p-4 sm:p-6 w-full max-w-[1600px] mx-auto space-y-5 font-['Work_Sans']">
      {/* "?"? TOP SECTION: TITLE & ACTIONS ON LEFT, SHIFTED DUPLICATE + DROPZONE ON RIGHT (Image 1) "?"? */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start border-b border-[#d2c2cb] pb-5">
        {/* Left Column (col-span-7): Breadcrumbs, Title, Description & Action Buttons */}
        <div className="lg:col-span-7 space-y-3">
          <div>
            <Link
              to={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-['Work_Sans'] text-[#62535d] hover:text-[#3a0f34] bg-black/[0.03] hover:bg-black/[0.06] transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back to Project Dashboard</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="tag-phylo-yellow text-[10px] px-2 py-0.5 font-bold">LITERATURE REPOSITORY</span>
            <span className="text-xs font-mono text-[#81737b]">{studies?.length || 0} Studies Indexed</span>
            {isBlank && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200">
                BLANK WORKSPACE
              </span>
            )}
          </div>

          <h1 className="font-['Serifon_Editorial'] text-3xl sm:text-4xl font-bold text-[#3a0f34] tracking-tight">
            {bookmarkedOnly ? "Bookmarked studies" : "Studies & Clinical Benchmarks"}
          </h1>
          <p className="font-['QuadraatSmallCaps'] italic text-sm text-[#62535d]">
            {bookmarkedOnly
              ? "Your saved studies for reviewing later. Remove a bookmark when you no longer need it."
              : "Verified study extraction records, bounding box quote locators, and evidence quality reviews."}
          </p>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center flex-wrap gap-2 pt-1">
            <Link
              to={`/projects/${projectId}/${bookmarkedOnly ? "studies" : "bookmarks"}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors shadow-2xs"
            >
              {bookmarkedOnly ? "View all studies" : "View bookmarked studies"}
            </Link>

            {/* Hidden file input */}
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

            {isBlank ? (
              <button
                type="button"
                onClick={handleRestoreBenchmark}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors shadow-2xs"
                title="Restore standard 6 benchmark demo studies"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#814d75]" />
                <span>Load Benchmark Studies</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartBlank}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d2c2cb] text-xs font-semibold text-[#62535d] hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition-colors shadow-2xs"
                title="Clear benchmark demo studies and start fresh with 0 studies"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Start Blank Workspace</span>
              </button>
            )}

            <button
              type="button"
              className="bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              onClick={() => setIsBulkModalOpen(true)}
            >
              <FolderPlus className="h-3.5 w-3.5 text-[#ffdea6]" />
              <span>Bulk Upload PDFs</span>
            </button>

            <a
              href={api.exportProjectXlsxUrl(projectId || "demo")}
              download
              className="bg-[#ffffff] text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Export all studies with extraction values to formatted Excel (.xlsx)"
            >
              <Download className="h-3.5 w-3.5 text-[#814d75]" />
              <span>Export Excel (.xlsx)</span>
            </a>

            <Link
              to={`/projects/${projectId}/studies/new`}
              className="bg-[#ffffff] text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Import Study</span>
            </Link>
          </div>
        </div>

        {/* Right Column (col-span-5): SHIFTED HERE (Image 1) - Duplicate Notice + Compact Drag & Drop Zone */}
        <div className="lg:col-span-5 space-y-3">
          {/* Shifted Duplicate Alert Banner */}
          {dedupData && dedupData.total_duplicates > 0 && (
            <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                  <ArrowLeftRight className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#3a0f34] truncate">
                      {dedupData.total_duplicates} Duplicates Found
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                      {dedupData.duplicate_groups.length} group{dedupData.duplicate_groups.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#62535d] truncate">
                    Side-by-side match comparison &amp; merging.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDuplicateModalOpen(true)}
                className="bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                <span>Review Duplicates</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Shifted Compact Direct Drag & Drop Zone */}
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
              "border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all flex items-center justify-center gap-3",
              isDragging
                ? "border-emerald-600 bg-emerald-50/80 shadow-md scale-[1.01]"
                : "border-[#d2c2cb] hover:border-[#814d75] bg-[#FAF9F3]/90 hover:bg-[#ffffff] shadow-2xs"
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
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="h-5 w-5 text-emerald-600 animate-spin shrink-0" />
                <span className="font-['Work_Sans'] text-xs font-bold text-[#3a0f34]">
                  {directProcessMsg || "Importing studies..."}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-lg bg-[#eee7ec] flex items-center justify-center text-[#814d75] shrink-0">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-['Work_Sans'] text-xs font-bold text-[#3a0f34] flex items-center gap-1.5">
                    <span>Drag &amp; drop studies here</span>
                    <span className="text-[10px] text-[#81737b] font-normal">(.ris, .bib, .pdf, .csv)</span>
                  </div>
                  <div className="text-[11px] text-[#62535d]">
                    Drop directly or <span className="text-[#814d75] font-semibold underline">browse from computer</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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

      {/* "?"? EXCEL WORKSPACE CONTAINER (Image 2) "?"? */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs overflow-hidden space-y-0">
        {/* "?"? SUB-HEADER TOOLBAR (Cell Coordinate Box, Formula Bar fx, Filters) "?"? */}
        <div className="bg-[#fbf9f4] border-b border-[#d2c2cb] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-[300px]">
            {/* Active Cell Coordinates Display (e.g. A1, B2) */}
            <div className="flex items-center bg-[#ffffff] border border-[#d2c2cb] rounded px-2.5 py-1 shadow-2xs min-w-[64px] justify-center shrink-0">
              <span className="font-mono text-xs font-bold text-[#3a0f34]">
                {activeCellCoord}
              </span>
            </div>

            <div className="h-4 w-px bg-[#d2c2cb] shrink-0" />

            {/* Active Cell Formula / Content Input Bar (Excel fx) */}
            <div className="flex items-center gap-2 bg-[#ffffff] border border-[#d2c2cb] rounded px-3 py-1 flex-1 shadow-2xs overflow-hidden">
              <span className="font-serif italic text-xs text-[#814d75] font-bold shrink-0">fx</span>
              <input
                type="text"
                readOnly
                aria-label="Formula Bar"
                value={activeCellValue}
                placeholder="Click any cell or row to view formula details"
                className="w-full bg-transparent text-xs font-mono text-[#4f444b] focus:outline-none truncate"
              />
            </div>
          </div>

          {/* Quick Filters Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live matching count */}
            <span className="text-xs font-mono text-[#81737b] hidden md:inline">
              {visibleStudies.length} matching studies
            </span>

            {/* Search studies */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#62535d]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, author, DOI..."
                className="pl-8 pr-3 py-1 text-xs border border-[#d2c2cb] rounded bg-[#ffffff] text-[#3a0f34] focus:outline-none focus:ring-1 focus:ring-[#814d75] w-44 sm:w-52 shadow-2xs font-['Work_Sans']"
              />
            </div>

            {/* Status filter dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs border border-[#d2c2cb] rounded bg-[#ffffff] px-2.5 py-1 text-[#3a0f34] focus:outline-none focus:ring-1 focus:ring-[#814d75] shadow-2xs font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="included">Included</option>
              <option value="excluded">Excluded</option>
              <option value="uncertain">Uncertain</option>
              <option value="pending">Pending</option>
            </select>

            {/* Tag Filter */}
            <TagFilter projectId={projectId!} value={tagFilter} onChange={setTagFilter} />

            {/* Bookmarks Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-[#4f444b] cursor-pointer bg-[#ffffff] border border-[#d2c2cb] px-2.5 py-1 rounded hover:bg-[#eee7ec] transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={savedOnly}
                onChange={(e) => setSavedOnly(e.target.checked)}
                className="rounded text-[#3a0f34] focus:ring-[#814d75]"
              />
              <span className="font-medium">Saved ({bookmarkedCount})</span>
            </label>
          </div>
        </div>

        {/* "?"? EXCEL-STYLE GRID TABLE (Columns A-G with Row Numbers) "?"? */}
        <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
          <table className="border-collapse table-fixed w-full text-left text-xs font-['Work_Sans'] min-w-[1050px]">
            {/* Frozen Table Header (Excel Columns A-G + Row 2 Labels) */}
            <thead className="sticky top-0 z-20 bg-[#fbf9f4] shadow-xs select-none">
              {/* Row 1: Excel Column Letters */}
              <tr className="border-b border-[#d2c2cb] bg-[#eee7ec]/70 text-[10px] font-mono text-[#62535d]">
                <th className="sticky left-0 z-30 bg-[#eee7ec] w-12 text-center p-1.5 border-r border-[#d2c2cb] select-none font-bold">
                  #
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[340px]">
                  A
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[200px]">
                  B
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[100px]">
                  C
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[190px]">
                  D
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[170px]">
                  E
                </th>
                <th className="text-center p-1.5 border-r border-[#d2c2cb] font-bold w-[150px]">
                  F
                </th>
                <th className="text-center p-1.5 font-bold w-[280px]">
                  G
                </th>
              </tr>

              {/* Row 2: Header Field Labels */}
              <tr className="border-b border-[#d2c2cb] text-[11px] text-[#3a0f34] bg-[#fbf9f4]">
                <th className="sticky left-0 z-30 bg-[#fbf9f4] w-12 text-center p-2.5 border-r border-[#d2c2cb] font-mono font-bold text-[#62535d]">
                  Row
                </th>
                <th className="px-3.5 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial']">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#814d75]" />
                      <span>Title (Citation)</span>
                    </span>
                    <Lock className="h-3 w-3 text-[#814d75]" title="Primary Identifier" />
                  </div>
                </th>
                <th className="px-3 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial']">
                  Creator (Authors)
                </th>
                <th className="px-3 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial'] text-center">
                  Date / Year
                </th>
                <th className="px-3 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial']">
                  Publisher / Journal
                </th>
                <th className="px-3 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial'] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("status");
                      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                    }}
                    className="inline-flex items-center gap-1 hover:text-[#814d75] transition-colors cursor-pointer"
                    title="Sort: Included -> Uncertain -> Excluded"
                  >
                    <span>Screening Status</span>
                    <ArrowUpDown className="w-3 h-3 text-[#814d75]" />
                  </button>
                </th>
                <th className="px-3 py-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial'] text-center">
                  RoB Judgment
                </th>
                <th className="px-3.5 py-2.5 font-bold font-['Serifon_Editorial'] text-right">
                  Workflows &amp; Published Site
                </th>
              </tr>
            </thead>

            {/* Table Body: Excel Rows */}
            <tbody className="divide-y divide-[#d2c2cb]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#81737b] text-xs">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#814d75]" />
                    <span>Loading clinical study records into spreadsheet...</span>
                  </td>
                </tr>
              ) : visibleStudies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#81737b] text-xs">
                    No studies match the selected filters.
                  </td>
                </tr>
              ) : (
                visibleStudies.map((s, idx) => (
                  <StudyRow
                    key={s.study_id}
                    rowNumber={idx + 1}
                    rowIdx={idx}
                    selectedCell={selectedCell}
                    onSelectCell={(colKey) => setSelectedCell({ rowIdx: idx, colKey })}
                    study={s}
                    assessment={robMap.get(s.study_id)}
                    tags={tagIndex.data}
                    onComments={() => setCollaborationStudy(s)}
                    onStatusChange={(studyId, newStatus) => updateStatusMutation.mutate({ studyId, newStatus })}
                    bookmark={<BookmarkButton saved={bookmarkSet.has(s.study_id)} disabled={bookmarks.disabled} onClick={() => bookmarks.toggle(s.study_id)} />}
                    projectId={projectId!}
                    onDelete={() => deleteMutation.mutate(s.study_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* "?"? EXCEL WORKSHEET TABS & STATUS BAR (Matching Image 2) "?"? */}
        <div className="bg-[#fbf9f4] border-t border-[#d2c2cb] px-3 py-1 flex items-center justify-between text-xs select-none">
          {/* Worksheet Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1 rounded-t border-t border-x font-medium transition-colors flex items-center gap-1.5 cursor-pointer text-xs",
                statusFilter === "all"
                  ? "bg-[#ffffff] text-[#3a0f34] border-[#d2c2cb] font-bold shadow-2xs border-b-white -mb-px z-10"
                  : "bg-[#eee7ec] text-[#62535d] border-transparent hover:bg-[#e4dde2]"
              )}
            >
              <FileSpreadsheet className="h-3 w-3 text-[#814d75]" />
              <span>Sheet1: All Studies ({studies?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("included")}
              className={cn(
                "px-3 py-1 rounded-t border-t border-x font-medium transition-colors flex items-center gap-1.5 cursor-pointer text-xs",
                statusFilter === "included"
                  ? "bg-[#ffffff] text-emerald-800 border-[#d2c2cb] font-bold shadow-2xs border-b-white -mb-px z-10"
                  : "bg-[#eee7ec] text-[#62535d] border-transparent hover:bg-[#e4dde2]"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Included ({statusCounts.included})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("uncertain")}
              className={cn(
                "px-3 py-1 rounded-t border-t border-x font-medium transition-colors flex items-center gap-1.5 cursor-pointer text-xs",
                statusFilter === "uncertain"
                  ? "bg-[#ffffff] text-purple-800 border-[#d2c2cb] font-bold shadow-2xs border-b-white -mb-px z-10"
                  : "bg-[#eee7ec] text-[#62535d] border-transparent hover:bg-[#e4dde2]"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>Uncertain ({statusCounts.uncertain})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("excluded")}
              className={cn(
                "px-3 py-1 rounded-t border-t border-x font-medium transition-colors flex items-center gap-1.5 cursor-pointer text-xs",
                statusFilter === "excluded"
                  ? "bg-[#ffffff] text-rose-800 border-[#d2c2cb] font-bold shadow-2xs border-b-white -mb-px z-10"
                  : "bg-[#eee7ec] text-[#62535d] border-transparent hover:bg-[#e4dde2]"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Excluded ({statusCounts.excluded})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={cn(
                "px-3 py-1 rounded-t border-t border-x font-medium transition-colors flex items-center gap-1.5 cursor-pointer text-xs",
                statusFilter === "pending"
                  ? "bg-[#ffffff] text-[#7c5800] border-[#d2c2cb] font-bold shadow-2xs border-b-white -mb-px z-10"
                  : "bg-[#eee7ec] text-[#62535d] border-transparent hover:bg-[#e4dde2]"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#7c5800]" />
              <span>Pending ({statusCounts.pending})</span>
            </button>
          </div>

          {/* Bottom Status Bar */}
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#81737b]">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Ready
            </span>
            <span>|</span>
            <span>{visibleStudies.length} rows</span>
            <span>|</span>
            <span>Cell: {activeCellCoord}</span>
            <span>|</span>
            <span>100% Zoom</span>
          </div>
        </div>
      </div>

      {/* Collaboration Dialog */}
      {collaborationStudy && (
        <CollaborationDialog title={collaborationStudy.title} onClose={() => setCollaborationStudy(null)}>
          <RecordCollaborationPanel key={collaborationStudy.study_id} projectId={projectId!} studyId={collaborationStudy.study_id} />
        </CollaborationDialog>
      )}

      {/* Bulk Upload Modal */}
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
  onStatusChange,
  assessment,
  rowNumber,
  rowIdx,
  selectedCell,
  onSelectCell,
}: {
  study: Study;
  projectId: string;
  onDelete: () => void;
  bookmark: React.ReactNode;
  tags: TagIndex | undefined;
  onComments: () => void;
  onStatusChange: (studyId: string, newStatus: string) => void;
  assessment?: { assessment_id: string; overall_judgment: string };
  rowNumber: number;
  rowIdx: number;
  selectedCell: { rowIdx: number; colKey: string } | null;
  onSelectCell: (colKey: string) => void;
}) {
  const { data: studyAssessments } = useQuery({
    queryKey: ["study-rob", study.study_id],
    queryFn: () => api.listStudyAssessments(study.study_id),
    enabled: !assessment,
  });

  const activeAssessment = assessment || (studyAssessments && studyAssessments[0]);

  const getPublishedUrl = (s: Study): string => {
    if (s.doi) {
      const cleanDoi = s.doi.trim().replace(/^doi:\s*/i, "");
      if (cleanDoi.startsWith("http")) return cleanDoi;
      return `https://doi.org/${cleanDoi}`;
    }
    if (s.pmid) {
      const cleanPmid = s.pmid.trim().replace(/^pmid:\s*/i, "");
      return `https://pubmed.ncbi.nlm.nih.gov/${cleanPmid}/`;
    }
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(s.title)}`;
  };

  const isSelectedRow = selectedCell?.rowIdx === rowIdx;
  const isCellSelected = (colKey: string) => isSelectedRow && selectedCell?.colKey === colKey;

  return (
    <tr
      className={`transition-colors ${
        isSelectedRow ? "bg-[#ffdea6]/10" : "hover:bg-[#fbf9f4]/80"
      }`}
    >
      {/* Frozen Row Number */}
      <td
        onClick={() => onSelectCell("title")}
        className="sticky left-0 z-10 bg-[#fbf9f4] text-center p-2 border-r border-[#d2c2cb] font-mono text-[11px] text-[#62535d] select-none font-bold cursor-pointer"
      >
        {rowNumber}
      </td>

      {/* Column A: Title */}
      <td
        onClick={() => onSelectCell("title")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] max-w-[340px] cursor-pointer relative",
          isCellSelected("title") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
      >
        <div className="flex items-start gap-2">
          {bookmark}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#814d75] shrink-0 mt-0.5" />
              <Link
                to={`/projects/${projectId}/screening?studyId=${study.study_id}`}
                className="font-['Serifon_Editorial'] font-bold text-xs text-[#3a0f34] hover:text-[#814d75] hover:underline line-clamp-1 block"
                title={study.title}
              >
                {study.title}
              </Link>
              <a
                href={getPublishedUrl(study)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[#814d75] hover:text-[#3a0f34] p-0.5 rounded transition-colors shrink-0"
                title="View on published journal site (external tab)"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <TagBadges index={tags} studyId={study.study_id} />
          </div>
        </div>
        {isCellSelected("title") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column B: Creator (Authors) */}
      <td
        onClick={() => onSelectCell("authors")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] text-xs font-['Work_Sans'] text-[#4f444b] truncate max-w-[200px] cursor-pointer relative",
          isCellSelected("authors") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
        title={study.authors || "Unknown"}
      >
        {study.authors || "Unknown Authors"}
        {isCellSelected("authors") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column C: Date / Year */}
      <td
        onClick={() => onSelectCell("year")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] font-mono text-xs text-[#62535d] select-none text-center cursor-pointer relative",
          isCellSelected("year") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
      >
        {study.publication_year || "—"}
        {isCellSelected("year") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column D: Publisher / Journal */}
      <td
        onClick={() => onSelectCell("journal")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] text-xs font-['Work_Sans'] text-[#62535d] truncate max-w-[190px] cursor-pointer relative",
          isCellSelected("journal") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
        title={study.journal || "—"}
      >
        {study.journal || "—"}
        {isCellSelected("journal") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column E: Screening Status */}
      <td
        onClick={() => onSelectCell("status")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] text-center cursor-pointer relative",
          isCellSelected("status") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
      >
        <div className="flex items-center justify-center gap-1.5">
          <select
            value={
              study.screening_status === "ta_included" || study.screening_status === "ft_included"
                ? "included"
                : study.screening_status === "ta_excluded" || study.screening_status === "ft_excluded"
                ? "excluded"
                : study.screening_status || "pending"
            }
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(study.study_id, e.target.value);
            }}
            className={cn(
              "text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#814d75]",
              study.screening_status === "included" || study.screening_status === "ta_included" || study.screening_status === "ft_included"
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : study.screening_status === "uncertain"
                ? "bg-purple-100 text-purple-800 border-purple-300"
                : study.screening_status === "excluded" || study.screening_status === "ta_excluded" || study.screening_status === "ft_excluded"
                ? "bg-rose-100 text-rose-800 border-rose-300"
                : "bg-amber-100 text-amber-800 border-amber-300"
            )}
            title="Update screening status live (Included, Uncertain, Excluded, Pending)"
          >
            <option value="included">Included</option>
            <option value="uncertain">Uncertain</option>
            <option value="excluded">Excluded</option>
            <option value="pending">Pending</option>
          </select>
          {Boolean(study.is_duplicate) && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#ffdea6]/60 text-[#7c5800] border border-[#d2c2cb] font-bold">
              <Copy className="h-2.5 w-2.5" />
              <span>DUP</span>
            </span>
          )}
        </div>
        {isCellSelected("status") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column F: RoB Status */}
      <td
        onClick={() => onSelectCell("rob")}
        className={cn(
          "px-3 py-2 border-r border-[#d2c2cb] text-center cursor-pointer relative",
          isCellSelected("rob") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
      >
        {activeAssessment ? (
          <Link
            to={`/projects/${projectId}/rob/${activeAssessment.assessment_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-[#3a0f34] hover:underline"
          >
            <ShieldCheck className="h-3 w-3 text-emerald-700" />
            <span
              className={`inline-flex px-1.5 py-0.2 rounded text-[10px] font-mono ${judgmentColor(
                activeAssessment.overall_judgment
              )}`}
            >
              {judgmentLabel(activeAssessment.overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-[#81737b] text-xs font-['Newsreader'] italic select-none">unassessed</span>
        )}
        {isCellSelected("rob") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
      </td>

      {/* Column G: Workflows & Published Site Link */}
      <td
        onClick={() => onSelectCell("workflows")}
        className={cn(
          "px-3 py-2 text-right relative",
          isCellSelected("workflows") && "outline-2 outline-[#3a0f34] outline-offset-[-2px] bg-white z-10"
        )}
      >
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {/* View on Published Site Button */}
          <a
            href={getPublishedUrl(study)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all shadow-2xs"
            title="View study on original published site (DOI / PubMed / Publisher)"
          >
            <ExternalLink className="h-3 w-3 text-[#814d75]" />
            <span>Published Site</span>
          </a>

          {/* Comments and tags button with exact accessible label for tests */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onComments();
            }}
            aria-label={`Comments and tags for ${study.title}`}
            className="rounded border border-[#d2c2cb] bg-white px-2 py-0.5 text-[11px] text-[#4f444b] hover:bg-[#eee7ec] transition-colors"
            title="Comments & tags"
          >
            Tags
          </button>

          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/pdf`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-2xs"
            title="Review Co-Scientist Extractions in PDF with Track Changes"
          >
            <Highlighter className="h-2.5 w-2.5 text-[#ffdea6]" />
            <span>PDF</span>
          </Link>

          <Link
            to={`/projects/${projectId}/extraction-sheet?study=${study.study_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all shadow-2xs"
            title="View Extraction Data Sheet"
          >
            <FileSpreadsheet className="h-2.5 w-2.5 text-[#814d75]" />
            <span>Sheet</span>
          </Link>

          <a
            href={api.exportStudyXlsxUrl(projectId || "demo", study.study_id)}
            download
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all shadow-2xs"
            title="Download extraction data Excel (.xlsx) for this study"
          >
            <Download className="h-2.5 w-2.5 text-[#7c5800]" />
            <span>Excel</span>
          </a>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[#81737b] hover:text-rose-700 hover:bg-[#eee7ec] transition-colors p-1 rounded"
            title="Delete study"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        {isCellSelected("workflows") && (
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#3a0f34] pointer-events-none" />
        )}
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
