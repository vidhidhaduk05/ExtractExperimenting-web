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
    <div className="p-8 max-w-6xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Studies</h1>
          <p className="text-gray-500 text-sm mt-1">{studies?.length || 0} studies in this project</p>
        </div>
        <div className="flex items-center gap-3">
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
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={refUploadMutation.isPending}
          >
            {refUploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import References
          </button>
          <Link to={`/projects/${projectId}/studies/new`} className="btn-primary">
            <Plus className="h-4 w-4" /> Import Study
          </Link>
        </div>
      </div>

      {/* Benchmark Studies & Quick Extraction Access */}
      <div className="card p-4 mb-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/80 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-600 text-white shadow-xs">
            <Highlighter className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-slate-900">AI Data Extraction & Verification Ready</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">6 Benchmark Studies</span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Review extracted clinical variables with in-situ PDF quote highlighting or inspect the consolidated multi-study matrix.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/projects/${projectId}/extraction`}
            className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Highlighter className="h-3.5 w-3.5" />
            PDF Extraction (Track Changes)
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to={`/projects/${projectId}/extraction-sheet`}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            Extraction Data Sheet
          </Link>
        </div>
      </div>

      {uploadMsg && (
        <div
          className={`rounded-md px-4 py-3 text-sm mb-4 ${
            uploadMsg.startsWith("Error")
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-green-50 border border-green-200 text-green-700"
          }`}
        >
          {uploadMsg}
        </div>
      )}

      {isLoading && <p className="text-gray-400">Loading studies...</p>}

      {studies && studies.length === 0 && (
        <div className="card p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No studies imported yet</p>
          <Link to={`/projects/${projectId}/studies/new`} className="btn-primary inline-flex">
            <Plus className="h-4 w-4" /> Import your first study
          </Link>
        </div>
      )}

      {studies && studies.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Design</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Screening</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">RoB</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
      pending: "bg-gray-100 text-gray-600",
      included: "bg-phylo-green/15 text-phylo-green",
      excluded: "bg-red-100 text-red-700",
    };
    return styles[status] || styles.pending;
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 line-clamp-1">{study.title}</div>
        <div className="text-xs text-gray-400">{study.authors} — {study.journal}</div>
      </td>
      <td className="px-4 py-3 text-gray-600">{study.publication_year || "—"}</td>
      <td className="px-4 py-3 text-gray-600">{study.study_design || "—"}</td>
      <td className="px-4 py-3">
        <span className={`badge ${screeningBadge(study.screening_status)}`}>
          {study.screening_status || "pending"}
        </span>
      </td>
      <td className="px-4 py-3">
        {assessments && assessments.length > 0 ? (
          <Link
            to={`/projects/${projectId}/rob/${assessments[0].assessment_id}`}
            className="inline-flex items-center gap-1 text-phylo-blue hover:underline"
          >
            <ShieldCheck className="h-3 w-3" />
            <span className={`badge ${judgmentColor(assessments[0].overall_judgment)}`}>
              {judgmentLabel(assessments[0].overall_judgment)}
            </span>
          </Link>
        ) : (
          <span className="text-gray-300 text-xs">none</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/pdf`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
            title="Review AI Extractions in PDF with Track Changes"
          >
            <Highlighter className="h-3 w-3" />
            <span>Extract</span>
          </Link>
          <Link
            to={`/projects/${projectId}/studies/${study.study_id}/sheet`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            title="View Extraction Data Sheet"
          >
            <FileSpreadsheet className="h-3 w-3" />
            <span>Sheet</span>
          </Link>
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 transition-colors p-1"
            title="Delete study"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
