import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Study } from "../lib/api";
import { autoIdentifyPdf } from "../lib/pdfAutoIdentifier";
import {
  Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Upload, Loader2,
  Highlighter, FileSpreadsheet, ArrowRight, CheckCircle2, X,
  RefreshCw, Sparkles, FolderPlus, Check, AlertCircle, ArrowLeftRight, Copy
} from "lucide-react";
import { judgmentColor, judgmentLabel } from "../lib/utils";
import { useRef, useState, useCallback } from "react";
import { DuplicateReviewModal } from "../components/common/DuplicateReviewModal";


export function StudyList() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkPdfInputRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

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
            Studies & Clinical Benchmarks
          </h1>
          <p className="font-serif italic text-sm text-[#6B665E] mt-1">
            Verified study extraction records, bounding box quote locators, and evidence quality reviews.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
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

      {/* Blank State View */}
      {studies && studies.length === 0 && (
        <div className="card-phylo p-12 text-center rounded-2xl border-2 border-dashed border-black/15 bg-[#FAF9F3]/60">
          <div className="max-w-md mx-auto space-y-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
              <FolderPlus className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-serif text-xl text-[#141413]">Study Repository is Blank</h3>
              <p className="font-sans text-xs text-[#6B665E] mt-1.5 leading-relaxed">
                You have started a clean workspace with 0 preloaded studies. Upload your study PDFs in bulk to automatically identify metadata and extract variables, or restore the benchmark demo dataset.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="btn-phylo-primary text-xs w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>Bulk Upload Study PDFs</span>
              </button>
              <button
                type="button"
                onClick={handleRestoreBenchmark}
                className="btn-phylo-secondary text-xs w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Load Benchmark Studies</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Populated Study Table */}
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
                {studies.map((s) => (
                  <StudyRow
                    key={s.study_id}
                    study={s}
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


function StudyRow({ study, projectId, onDelete }: { study: Study; projectId: string; onDelete: () => void }) {
  const { data: assessments } = useQuery({
    queryKey: ["study-rob", study.study_id],
    queryFn: () => api.listStudyAssessments(study.study_id),
  });

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
        <div className="font-serif font-medium text-sm text-[#141413] line-clamp-1">{study.title}</div>
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
        {assessments && assessments.length > 0 ? (
          <Link
            to={`/projects/${projectId}/rob/${assessments[0].assessment_id}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#141413] hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono ${judgmentColor(assessments[0].overall_judgment)}`}>
              {judgmentLabel(assessments[0].overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-[#8A817A] text-xs font-serif italic">unassessed</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
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
