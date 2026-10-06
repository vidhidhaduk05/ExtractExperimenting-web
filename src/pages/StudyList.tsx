import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Study } from "../lib/api";
import { Plus, FileText, Trash2, ShieldCheck, ArrowLeft, Eye, Upload, Loader2, Highlighter, FileSpreadsheet, Sparkles, ArrowRight } from "lucide-react";
import { judgmentColor, judgmentLabel } from "../lib/utils";
import { useRef, useState } from "react";

export function StudyList() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

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
            accept=".ris,.bib,.bibtex,.csv,.xml,.nbib,.txt"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleRefUpload(e.target.files);
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
        <div className="card-phylo p-16 text-center">
          <FileText className="h-10 w-10 text-[#8A817A] mx-auto mb-3 opacity-60" />
          <h3 className="font-serif text-lg text-[#141413] mb-1">No studies indexed yet</h3>
          <p className="font-sans text-xs text-[#6B665E] mb-5 max-w-sm mx-auto">
            Import reference files (RIS, BibTeX, CSV) or manually register study publications to begin systematic extraction.
          </p>
          <Link to={`/projects/${projectId}/studies/new`} className="btn-phylo-primary text-xs inline-flex">
            <Plus className="h-3.5 w-3.5" /> Import Your First Study
          </Link>
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
