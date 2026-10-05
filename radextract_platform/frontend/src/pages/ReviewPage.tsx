import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Table, TrendingUp, Sparkles, Loader2, FileText, Plus, Trash2, Edit3, X, Wand2, ExternalLink, AlertCircle, Download, ScrollText } from "lucide-react";

// Missing-data code colors (match the coded Excel workbook)
const MISSING_CODE_STYLES: Record<string, { bg: string; label: string }> = {
  "-99": { bg: "#FFD700", label: "Not reported (exhaustive search completed)" },
  "-77": { bg: "#D3D3D3", label: "Not applicable" },
  "-88": { bg: "#FFA500", label: "Unable to extract (figure-only or garbled PDF)" },
};

const TAG_STYLES: Record<string, string> = {
  DS: "bg-phylo-green/15 text-phylo-green",
  INF: "bg-phylo-blue/15 text-phylo-blue",
  CALC: "bg-purple-100 text-purple-700",
  SUP: "bg-teal-100 text-teal-700",
  FIG: "bg-amber-100 text-amber-700",
};

export function ReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showVarPanel, setShowVarPanel] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["review-matrix", projectId],
    queryFn: () => api.reviewMatrix(projectId!),
    enabled: !!projectId,
  });

  const { data: progress } = useQuery({
    queryKey: ["review-progress", projectId],
    queryFn: () => api.reviewProgress(projectId!),
    enabled: !!projectId,
  });

  const { data: studies } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const { data: variables } = useQuery({
    queryKey: ["variables", projectId],
    queryFn: () => api.listVariables(projectId!),
    enabled: !!projectId,
  });

  const autoExtractMutation = useMutation({
    mutationFn: async () => {
      const included = (studies || []).filter((s) => s.screening_status === "included");
      const results = [];
      for (const s of included) {
        try {
          const r = await api.codedExtract(s.study_id, projectId!);
          results.push(r);
        } catch (e) {
          // Non-fatal per study
        }
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
      queryClient.invalidateQueries({ queryKey: ["review-progress", projectId] });
    },
  });

  const { data: prompts } = useQuery({
    queryKey: ["extraction-prompts", projectId],
    queryFn: () => api.extractionPrompts(projectId!),
    enabled: !!projectId && showPrompts,
  });

  const autoGenerateMutation = useMutation({
    mutationFn: () => api.autoGenerateVariables(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variables"] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["review-progress"] });
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Table className="h-6 w-6 text-phylo-blue" />
            Data Review
          </h1>
          <p className="text-gray-500 text-sm mt-1">Extraction data matrix, variable management, and completion progress</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVarPanel(!showVarPanel)}
            className="btn-secondary"
          >
            <Edit3 className="h-4 w-4" /> Manage Variables
          </button>
          <button
            onClick={() => autoGenerateMutation.mutate()}
            disabled={autoGenerateMutation.isPending}
            className="btn-secondary"
            title="Auto-generate extraction variables from PICO + hypothesis"
          >
            {autoGenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Auto-Generate
          </button>
          <button
            onClick={() => setShowPrompts(!showPrompts)}
            className="btn-secondary"
            title="View the extraction prompt behind every variable"
          >
            <ScrollText className="h-4 w-4" /> View Prompts
          </button>
          {studies && studies.some((s) => s.screening_status === "included") && (
            <>
              <button
                onClick={() => autoExtractMutation.mutate()}
                disabled={autoExtractMutation.isPending}
                className="btn-primary"
                title="Coded extraction: per-variable prompts, confidence tags, missing-data codes"
              >
                {autoExtractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Auto-Extract All
              </button>
              <a
                href={api.codedExcelUrl(projectId!)}
                download
                className="btn-secondary"
                title="Download the coded extraction workbook (color-coded missing codes, Notes column, Prompts + Legend sheets)"
              >
                <Download className="h-4 w-4" /> Coded Excel
              </a>
            </>
          )}
        </div>
      </div>

      {/* Extraction prompts panel */}
      {showPrompts && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Extraction Prompts (one per variable)</h3>
            <button onClick={() => setShowPrompts(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!prompts && <p className="text-gray-400 text-sm">Loading prompts...</p>}
          {prompts && (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {prompts.map((p) => (
                <div key={p.variable_id} className="py-2">
                  <div className="text-xs font-semibold text-gray-700">
                    {p.name} <span className="font-normal text-gray-400">({p.section} · {p.field_type})</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{p.extraction_prompt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-generate result */}
      {autoGenerateMutation.isSuccess && (
        <div className="card p-3 mb-4 text-sm text-phylo-green bg-phylo-green/5">
          Generated {autoGenerateMutation.data.generated_count} variables — {autoGenerateMutation.data.created_count} new, {autoGenerateMutation.data.skipped_duplicates} duplicates skipped.
        </div>
      )}

      {autoGenerateMutation.isError && (
        <div className="card p-3 mb-4 text-sm text-red-600 bg-red-50">
          Error: {(autoGenerateMutation.error as Error).message}
        </div>
      )}

      {/* Auto-extract result */}
      {autoExtractMutation.isSuccess && (
        <div className="card p-3 mb-4 text-sm text-phylo-green bg-phylo-green/5">
          Auto-extraction complete for {autoExtractMutation.data.length} studies.
        </div>
      )}

      {/* Variable Management Panel */}
      {showVarPanel && (
        <VariableManagementPanel
          projectId={projectId!}
          variables={variables || []}
          onClose={() => setShowVarPanel(false)}
        />
      )}

      {/* Progress Summary */}
      {progress && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <ProgressCard label="Included Studies" value={progress.total_studies} />
          <ProgressCard label="Variables" value={progress.total_variables} />
          <ProgressCard label="Extractions" value={progress.total_extractions} />
          <ProgressCard label="Edited" value={progress.edited_count} />
          <ProgressCard
            label="Completion"
            value={`${progress.completion_pct}%`}
            highlight={progress.completion_pct === 100}
          />
        </div>
      )}

      {/* Completion Bar */}
      {progress && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-phylo-blue" />
              Extraction Progress
            </span>
            <span className="text-sm text-gray-500">
              {progress.total_extractions} / {progress.expected_extractions} cells filled
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-phylo-blue transition-all duration-500"
              style={{ width: `${Math.min(progress.completion_pct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Data Matrix */}
      {matrixLoading && <p className="text-gray-400">Loading data matrix...</p>}

      {matrix && matrix.studies.length === 0 && (
        <div className="card p-12 text-center">
          <Table className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No included studies with extraction data yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Screen studies as "included" and add extraction variables to populate this matrix.
          </p>
        </div>
      )}

      {matrix && matrix.studies.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50">
                  Study
                </th>
                {matrix.variables.map((v) => (
                  <th key={v.variable_id} className="px-3 py-3 font-semibold text-gray-600 text-center min-w-[120px]">
                    <div className="text-xs leading-tight">{v.name}</div>
                    <div className="text-xs text-gray-400 font-normal mt-0.5">{v.section}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrix.studies.map((s) => {
                const studyHasPdf = (studies || []).find((st) => st.study_id === s.study_id)?.pdf_path;
                return (
                <tr key={s.study_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 sticky left-0 bg-white">
                    <Link
                      to={`/projects/${projectId}/studies/${s.study_id}/pdf`}
                      className="font-medium text-gray-900 line-clamp-1 max-w-[200px] hover:text-phylo-blue hover:underline"
                      title="Open study PDF viewer"
                    >
                      {s.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{s.authors} — {s.year}</span>
                      {studyHasPdf && (
                        <Link
                          to={`/projects/${projectId}/studies/${s.study_id}/pdf`}
                          className="inline-flex items-center gap-0.5 text-xs text-phylo-blue hover:underline"
                        >
                          <FileText className="h-3 w-3" /> PDF
                        </Link>
                      )}
                    </div>
                  </td>
                  {matrix.variables.map((v) => {
                    const cell = s.values[v.variable_id] as any;
                    const hasValue = cell?.value && cell.value.trim();
                    const lowConfidence = cell && cell.confidence < 0.5;
                    const missingStyle = cell?.missing_code ? MISSING_CODE_STYLES[cell.missing_code] : undefined;
                    const tag = cell?.confidence_tag || cell?.confidenceTag;
                    const tooltip = [
                      missingStyle?.label,
                      tag === "CALC" && cell?.calc_note ? `Calculated: ${cell.calc_note}` : "",
                      cell?.source_text ? `Source (p.${cell.source_page}): "${cell.source_text}"` : "",
                    ].filter(Boolean).join("\n");
                    return (
                      <td
                        key={v.variable_id}
                        className="px-3 py-3 text-center group relative"
                        style={missingStyle ? { backgroundColor: missingStyle.bg } : undefined}
                        title={tooltip || undefined}
                      >
                        {hasValue ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className={cell.is_edited ? "text-gray-900 font-medium" : "text-gray-600"}>
                              {cell.value}
                            </span>
                            {tag && (
                              <span className={`text-[10px] px-1 rounded font-mono ${TAG_STYLES[tag] || "bg-gray-100 text-gray-600"}`}>
                                [{tag}]
                              </span>
                            )}
                            {lowConfidence && (
                              <span className="text-[10px] text-phylo-orange flex items-center gap-0.5" title="Low confidence extraction">
                                <AlertCircle className="h-2.5 w-2.5" /> {(cell.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                            {studyHasPdf && (
                              <button
                                onClick={() => window.open(
                                  `/projects/${projectId}/studies/${s.study_id}/pdf?var=${v.variable_id}&var_name=${encodeURIComponent(v.name)}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                )}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-phylo-blue hover:underline flex items-center gap-0.5"
                                title="Open PDF to verify/edit this extraction"
                              >
                                <ExternalLink className="h-2.5 w-2.5" /> Verify
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-gray-300">—</span>
                            {studyHasPdf && (
                              <button
                                onClick={() => window.open(
                                  `/projects/${projectId}/studies/${s.study_id}/pdf?var=${v.variable_id}&var_name=${encodeURIComponent(v.name)}&manual=true`,
                                  "_blank",
                                  "noopener,noreferrer"
                                )}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-phylo-blue hover:underline flex items-center gap-0.5"
                                title="Open PDF to manually extract this value"
                              >
                                <ExternalLink className="h-2.5 w-2.5" /> Extract
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(!variables || variables.length === 0) && (
        <div className="card p-8 text-center text-gray-600 text-sm bg-phylo-cream/20 border border-phylo-blue/20 mb-6">
          <div className="font-semibold text-gray-800 text-base mb-1">No extraction variables defined for this project yet.</div>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
            Generate standard and PICO-aligned radiology extraction variables automatically, or create your own custom variables.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => autoGenerateMutation.mutate()}
              disabled={autoGenerateMutation.isPending}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              {autoGenerateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Auto-Generate from PICO & Hypothesis
            </button>
            <button
              onClick={() => setShowVarPanel(true)}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Variable Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Variable Management Panel ──

function VariableManagementPanel({
  projectId,
  variables,
  onClose,
}: {
  projectId: string;
  variables: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState("");
  const [newVar, setNewVar] = useState({
    section: "Cohort_Level",
    name: "",
    field_type: "free_text",
    allowed_values: "",
    description: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      setAddError("");
      if (!newVar.name.trim()) {
        throw new Error("Variable name is required.");
      }
      return api.createVariable(projectId, {
        project_id: projectId,
        section: newVar.section,
        name: newVar.name.trim(),
        field_type: newVar.field_type,
        allowed_values: newVar.allowed_values,
        description: newVar.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variables"] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["review-progress"] });
      setNewVar({ section: "Cohort_Level", name: "", field_type: "free_text", allowed_values: "", description: "" });
      setAddError("");
      setShowAdd(false);
    },
    onError: (err: any) => {
      setAddError(err.message || "Failed to create variable");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteVariable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variables"] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["review-progress"] });
    },
  });

  const fieldTypes = ["free_text", "float", "int", "percent", "enum", "bool", "date"];
  const sections = ["Cohort_Level", "Protocol_Level", "Outcome_Level", "Other"];

  // Group variables by section
  const grouped = variables.reduce((acc, v) => {
    const sec = v.section || "Other";
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(v);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-phylo-blue" />
          Variable Management
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">
            <Plus className="h-3 w-3" /> Add Variable
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add new variable form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Section</label>
              <select
                className="input mt-1 text-sm"
                value={newVar.section}
                onChange={(e) => setNewVar({ ...newVar, section: e.target.value })}
              >
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Name</label>
              <input
                className="input mt-1 text-sm"
                value={newVar.name}
                onChange={(e) => setNewVar({ ...newVar, name: e.target.value })}
                placeholder="e.g. mean_age"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Field Type</label>
              <select
                className="input mt-1 text-sm"
                value={newVar.field_type}
                onChange={(e) => setNewVar({ ...newVar, field_type: e.target.value })}
              >
                {fieldTypes.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Allowed Values (for enum)</label>
              <input
                className="input mt-1 text-sm"
                value={newVar.allowed_values}
                onChange={(e) => setNewVar({ ...newVar, allowed_values: e.target.value })}
                placeholder="e.g. CT; MRI; PET"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Description</label>
            <input
              className="input mt-1 text-sm"
              value={newVar.description}
              onChange={(e) => setNewVar({ ...newVar, description: e.target.value })}
              placeholder="Variable description..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newVar.name.trim()}
              className="btn-primary text-xs"
            >
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Create
            </button>
            {createMutation.isError && (
              <span className="text-xs text-red-600">{(createMutation.error as Error).message}</span>
            )}
          </div>
        </div>
      )}

      {/* Variable list grouped by section */}
      {Object.keys(grouped).length === 0 && (
        <p className="text-sm text-gray-400">No variables defined. Use Auto-Generate or add manually.</p>
      )}

      <div className="space-y-3">
        {(Object.entries(grouped) as [string, any[]][]).map(([section, vars]) => (
          <div key={section}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{section}</div>
            <div className="space-y-1">
              {vars.map((v) => (
                <div key={v.variable_id} className="flex items-center justify-between bg-white border border-gray-100 rounded-md px-3 py-2">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700">{v.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{v.field_type}</span>
                    {v.allowed_values && (
                      <span className="ml-2 text-xs text-gray-400">[{v.allowed_values}]</span>
                    )}
                    {v.description && (
                      <span className="ml-2 text-xs text-gray-400">— {v.description}</span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(v.variable_id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-2xl font-bold ${highlight ? "text-phylo-green" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

