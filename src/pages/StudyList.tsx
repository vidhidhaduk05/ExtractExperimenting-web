import { useParams, Link, useNavigate } from "react-router-dom";
import { parsePdfToStudyData, registerPdfDemoData } from "../lib/pdfAutoIdentifier";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Study } from "../lib/api";
import { Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Eye, Upload, Loader2, X, Highlighter, FileSpreadsheet, Sparkles, ArrowRight } from "lucide-react";
import { judgmentColor, judgmentLabel } from "../lib/utils";
import { useRef, useState } from "react";

export function StudyList() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false);
  const [fastTrackExtraction, setFastTrackExtraction] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkParsingProgress, setBulkParsingProgress] = useState(0);
  const [bulkParsingComplete, setBulkParsingComplete] = useState(false);
  const [parsedStudies, setParsedStudies] = useState<any[]>([]);
  const navigate = useNavigate();

  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
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

    const handleBulkUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (fileArray.length === 0) return;

    setBulkFiles(fileArray);
    setBulkUploadModalOpen(true);
    setBulkParsingProgress(0);
    setBulkParsingComplete(false);
    setParsedStudies([]);

    const results = [];
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const data = await parsePdfToStudyData(file);
      results.push({ file, data });
      setBulkParsingProgress(Math.round(((i + 1) / fileArray.length) * 100));
    }

    setParsedStudies(results);
    setBulkParsingComplete(true);
  };

  const commitBulkUpload = async () => {
    // Actually create the studies
    for (const item of parsedStudies) {
       const studyData = {
          ...item.data,
          fast_track: fastTrackExtraction
       };
       // Create study using the mutate function or directly via API
       try {
           const newStudy = await api.createStudy(projectId!, studyData);
           try {
             await api.uploadPdf(newStudy.study_id, item.file);
           } catch(e) {}
           registerPdfDemoData(newStudy.study_id, item.file, item.data);
       } catch (err) {}
    }
    setBulkUploadModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["studies", projectId] });

    if (fastTrackExtraction) {
        navigate(`/projects/${projectId}/extraction-sheet`);
    }
  };

  const handleRefUpload = (files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      refUploadMutation.mutate(fileArray);
    }
  };

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
            <button
              onClick={() => {
                 localStorage.setItem(`radextract_blank_${projectId}`, "true");
                 localStorage.setItem(`radextract_studies_${projectId}`, JSON.stringify([]));
                 window.location.reload();
              }}
              className="text-[10px] px-2 py-0.5 border border-black/10 rounded-full hover:bg-black/5"
            >
              Start Blank Workspace
            </button>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#141413] tracking-tight">
            Studies & Clinical Benchmarks
          </h1>
          <p className="font-serif italic text-sm text-[#6B665E] mt-1">
            Verified study extraction records, bounding box quote locators, and evidence quality reviews.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ris,.bib,.bibtex,.csv,.xml,.nbib,.txt,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                 const hasPdfs = Array.from(e.target.files).some(f => f.name.toLowerCase().endsWith('.pdf'));
                 if (hasPdfs) {
                    handleBulkUpload(e.target.files);
                 } else {
                    handleRefUpload(e.target.files);
                 }
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-phylo-secondary text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={refUploadMutation.isPending}
          >
            {refUploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Import References
          </button>
          <button
            type="button"
            className="btn-phylo-secondary text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> Bulk Upload Study PDFs
          </button>
          <Link to={`/projects/${projectId}/studies/new`} className="btn-phylo-primary text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
          </Link>
        </div>
      </div>

      {/* Warm Editorial Quick Extraction Banner */}
      <div className="card-phylo-warm p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-[#141413] text-[#FAF9F3] flex items-center justify-center shrink-0 shadow-xs">
            <Highlighter className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-serif text-lg font-medium text-[#141413]">
                AI Quote Extraction & Verification Ready
              </h2>
              <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">6 BENCHMARKS</span>
            </div>
            <p className="font-sans text-xs text-[#6B665E] max-w-xl leading-relaxed">
              Review extracted variables with Docling-aligned in-situ PDF quote highlighting or inspect the multi-study consolidated matrix sheet.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
          <Link
            to={`/projects/${projectId}/extraction`}
            className="btn-phylo-primary text-xs px-4 py-2 flex-1 md:flex-initial"
          >
            <Highlighter className="h-3.5 w-3.5" />
            <span>PDF Viewer (Track Changes)</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to={`/projects/${projectId}/extraction-sheet`}
            className="btn-phylo-secondary text-xs px-4 py-2 flex-1 md:flex-initial bg-white/80"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#141413]" />
            <span>Extraction Sheet</span>
          </Link>
        </div>
      </div>

      {uploadMsg && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-sans ${
            uploadMsg.startsWith("Error")
              ? "bg-rose-50 border border-rose-200 text-rose-800"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          }`}
        >
          {uploadMsg}
        </div>
      )}

      {isLoading && (
        <div className="p-12 text-center text-[#8A817A] font-serif italic text-sm">
          Loading clinical study records...
        </div>
      )}

      {studies && studies.length === 0 && (
        <div className="card-phylo p-16 text-center border-2 border-dashed border-[#8A817A]/30 bg-black/[0.015]">
          <Upload className="h-12 w-12 text-[#8A817A] mx-auto mb-4 opacity-70" />
          <h3 className="font-serif text-2xl text-[#141413] mb-2">Study Repository is Blank</h3>
          <p className="font-sans text-sm text-[#6B665E] mb-6 max-w-md mx-auto leading-relaxed">
            Drop PDFs to auto-convert to JSON and begin extraction. No manual entry needed.
          </p>
          <div className="flex justify-center gap-3">
             <button onClick={() => fileInputRef.current?.click()} className="btn-phylo-primary text-sm px-6 py-2.5">
               <Upload className="h-4 w-4" /> Bulk Upload Study PDFs
             </button>
             <button onClick={() => {
                localStorage.removeItem(`radextract_blank_${projectId}`);
                localStorage.removeItem(`radextract_studies_${projectId}`);
                window.location.reload();
             }} className="btn-phylo-secondary text-sm px-6 py-2.5">
               Load Benchmark Studies
             </button>
          </div>
        </div>
      )}

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

      {bulkUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-black/10 flex justify-between items-center bg-[#F2F1EB]">
              <h3 className="font-serif text-xl text-[#141413]">Bulk Upload & Auto-Identify</h3>
              <button onClick={() => setBulkUploadModalOpen(false)} className="text-[#8A817A] hover:text-[#141413]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                 <div className="text-blue-600 mt-0.5"><Sparkles className="h-5 w-5" /></div>
                 <div>
                    <h4 className="text-sm font-medium text-blue-900">Auto-identifying metadata from {bulkFiles.length} PDF(s)</h4>
                    <div className="w-full bg-blue-200 rounded-full h-2 mt-2 mb-1 overflow-hidden">
                       <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${bulkParsingProgress}%` }}></div>
                    </div>
                    <p className="text-xs text-blue-700">{bulkParsingProgress}% complete</p>
                 </div>
              </div>

              {parsedStudies.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-[#141413]">Identified Studies:</h4>
                  {parsedStudies.map((ps, idx) => (
                    <div key={idx} className="p-3 border border-black/5 rounded-lg bg-black/[0.02]">
                       <div className="font-medium text-sm text-[#141413] truncate">{ps.data.title}</div>
                       <div className="text-xs text-[#6B665E] mt-1">{ps.data.authors} • {ps.data.publication_year} • {ps.data.journal}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 p-4 rounded-xl border border-[#E9ED4C] bg-[#E9ED4C]/10 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="fastTrack"
                  checked={fastTrackExtraction}
                  onChange={(e) => setFastTrackExtraction(e.target.checked)}
                  className="rounded border-black/20 text-[#62631E] focus:ring-[#62631E] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="fastTrack" className="text-sm text-[#141413] cursor-pointer select-none">
                  <span className="font-medium block">Direct Data Extraction Mode (Fast-Track)</span>
                  <span className="text-xs text-[#6B665E]">Skip screening and go straight to Extraction Sheet. Marks as included and complete.</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-black/10 bg-[#F2F1EB]/50 flex justify-end gap-3">
              <button
                onClick={() => setBulkUploadModalOpen(false)}
                className="btn-phylo-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={commitBulkUpload}
                disabled={!bulkParsingComplete}
                className="btn-phylo-primary px-5 py-2 text-sm flex items-center gap-2"
              >
                {!bulkParsingComplete && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {parsedStudies.length} Studies
              </button>
            </div>
          </div>
        </div>
      )}

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
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${screeningBadge(study.screening_status)}`}>
          {study.screening_status || "pending"}
        </span>
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
            to={`/projects/${projectId}/studies/${study.study_id}/sheet`}
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
