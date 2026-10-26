import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Table, TrendingUp, Sparkles, Loader2, FileText, Plus, Trash2, Edit3, X, Wand2, ExternalLink, AlertCircle, Download, ScrollText } from "lucide-react";

// Missing-data code colors (match the coded Excel workbook)
const MISSING_CODE_STYLES: Record<string, { bg: string; label: string }> = {
  "-99": { bg: "#ffdea6", label: "Not reported (exhaustive search completed)" },
  "-77": { bg: "#eee7ec", label: "Not applicable" },
  "-88": { bg: "#fed7aa", label: "Unable to extract (figure-only or garbled PDF)" },
};

const TAG_STYLES: Record<string, string> = {
  DS: "bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]",
  INF: "bg-[#814d75]/15 text-[#814d75] border border-[#814d75]/30",
  CALC: "bg-[#ffdea6]/60 text-[#7c5800] border border-[#ffdea6]",
  SUP: "bg-[#3a0f34]/10 text-[#3a0f34] border border-[#3a0f34]/20",
  FIG: "bg-[#eee7ec] text-[#62535d] border border-[#d2c2cb]",
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

  const studyPdfMap = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    (studies || []).forEach((st) => map.set(st.study_id, st.pdf_path));
    return map;
  }, [studies]);

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
    <div className="p-8 max-w-7xl mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      <Link to={`/projects/${projectId}`} className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 font-sans transition-colors">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#3a0f34] flex items-center gap-2">
            <Table className="h-6 w-6 text-[#814d75]" />
            Data Review Matrix
          </h1>
          <p className="text-[#62535d] text-sm mt-1 font-serif">Extraction data matrix, variable management, and completion progress</p>
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
            {autoGenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" /> : <Wand2 className="h-4 w-4" />}
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
        <div className="card p-5 mb-6 border border-[#d2c2cb] bg-white shadow-xs rounded-xl">
          <div className="flex items-center justify-between mb-3 border-b border-[#d2c2cb] pb-2">
            <h3 className="font-serif font-bold text-base text-[#3a0f34]">Extraction Prompts (one per variable)</h3>
            <button onClick={() => setShowPrompts(false)} className="text-[#81737b] hover:text-[#3a0f34] p-1 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!prompts && <p className="text-[#81737b] text-sm">Loading prompts...</p>}
          {prompts && (
            <div className="max-h-80 overflow-y-auto divide-y divide-[#eee7ec]">
              {prompts.map((p) => (
                <div key={p.variable_id} className="py-2.5">
                  <div className="text-xs font-semibold text-[#3a0f34]">
                    {p.name} <span className="font-normal text-[#81737b]">({p.section} · {p.field_type})</span>
                  </div>
                  <div className="text-xs text-[#62535d] mt-1 whitespace-pre-wrap font-mono bg-[#fbf9f4] p-2 rounded border border-[#d2c2cb]/50">{p.extraction_prompt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-generate result */}
      {autoGenerateMutation.isSuccess && (
        <div className="card p-3.5 mb-4 text-sm text-[#3a0f34] bg-[#eee7ec] border border-[#d2c2cb] rounded-lg">
          Generated {autoGenerateMutation.data.generated_count} variables — {autoGenerateMutation.data.created_count} new, {autoGenerateMutation.data.skipped_duplicates} duplicates skipped.
        </div>
      )}

      {autoGenerateMutation.isError && (
        <div className="card p-3.5 mb-4 text-sm text-[#814d75] bg-[#eee7ec] border border-[#814d75] rounded-lg">
          Error: {(autoGenerateMutation.error as Error).message}
        </div>
      )}

      {/* Auto-extract result */}
      {autoExtractMutation.isSuccess && (
        <div className="card p-3.5 mb-4 text-sm text-[#3a0f34] bg-[#eee7ec] border border-[#d2c2cb] rounded-lg">
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
          <ProgressCard label="Included Studies" value={progress?.total_studies ?? 0} />
          <ProgressCard label="Variables" value={progress?.total_variables ?? 0} />
          <ProgressCard label="Extractions" value={progress?.total_extractions ?? 0} />
          <ProgressCard label="Edited" value={progress?.edited_count ?? 0} />
          <ProgressCard
            label="Completion"
            value={`${progress?.completion_pct ?? 0}%`}
            highlight={progress?.completion_pct === 100}
          />
        </div>
      )}

      {/* Completion Bar */}
      {progress && (
        <div className="card p-4 mb-6 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#3a0f34] flex items-center gap-1.5 font-sans">
              <TrendingUp className="h-4 w-4 text-[#814d75]" />
              Extraction Progress
            </span>
            <span className="text-xs text-[#62535d] font-sans">
              {progress?.total_extractions ?? 0} / {progress?.expected_extractions ?? 0} cells filled
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/60">
            <div
              className="h-full bg-[#3a0f34] transition-all duration-500"
              style={{ width: `${Math.min(progress?.completion_pct ?? 0, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Data Matrix */}
      {matrixLoading && <p className="text-[#81737b] py-8 text-center font-serif">Loading data matrix...</p>}

      {matrix && (matrix.studies || []).length === 0 && (
        <div className="card p-12 text-center border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
          <Table className="h-12 w-12 text-[#d2c2cb] mx-auto mb-3" />
          <p className="text-[#4f444b] font-serif text-base font-semibold">No included studies with extraction data yet</p>
          <p className="text-sm text-[#81737b] mt-1 font-serif">
            Screen studies as "included" and add extraction variables to populate this matrix.
          </p>
        </div>
      )}

      {matrix && (matrix.studies || []).length > 0 && (
        <div className="card overflow-x-auto border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-[#fbf9f4] border-b border-[#d2c2cb]">
              <tr>
                <th className="text-left px-4 py-3.5 font-semibold text-[#3a0f34] font-sans sticky left-0 bg-[#fbf9f4] border-r border-[#d2c2cb]">
                  Study
                </th>
                {(matrix.variables || []).map((v) => (
                  <th key={v.variable_id} className="px-3 py-3.5 font-semibold text-[#3a0f34] font-sans text-center min-w-[130px] border-r border-[#d2c2cb]/40">
                    <div className="text-xs leading-tight">{v.name}</div>
                    <div className="text-[11px] text-[#81737b] font-normal mt-0.5">{v.section}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee7ec]">
              {(matrix.studies || []).map((s) => {
                const studyHasPdf = studyPdfMap.get(s.study_id);
                return (
                <tr key={s.study_id} className="hover:bg-[#eee7ec]/40 transition-colors">
                  <td className="px-4 py-3 sticky left-0 bg-white border-r border-[#d2c2cb]">
                    <Link
                      to={`/projects/${projectId}/studies/${s.study_id}/pdf`}
                      className="font-serif font-medium text-[#3a0f34] line-clamp-1 max-w-[200px] hover:text-[#814d75] hover:underline"
                      title="Open study PDF viewer"
                    >
                      {s.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[#81737b] font-sans">{s.authors} — {s.year}</span>
                      {studyHasPdf && (
                        <Link
                          to={`/projects/${projectId}/studies/${s.study_id}/pdf`}
                          className="inline-flex items-center gap-0.5 text-xs text-[#814d75] hover:underline font-sans"
                        >
                          <FileText className="h-3 w-3" /> PDF
                        </Link>
                      )}
                    </div>
                  </td>
                  {(matrix.variables || []).map((v) => {
                    const cell = (s.values || {})[v.variable_id] as any;
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
                        className="px-3 py-3 text-center group relative border-r border-[#d2c2cb]/30"
                        style={missingStyle ? { backgroundColor: missingStyle.bg } : undefined}
                        title={tooltip || undefined}
                      >
                        {hasValue ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className={cell.is_edited ? "text-[#3a0f34] font-semibold" : "text-[#4f444b]"}>
                              {cell.value}
                            </span>
                            {tag && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${TAG_STYLES[tag] || "bg-[#eee7ec] text-[#62535d]"}`}>
                                [{tag}]
                              </span>
                            )}
                            {lowConfidence && (
                              <span className="text-[10px] text-[#7c5800] bg-[#ffdea6]/70 px-1 py-0.2 rounded flex items-center gap-0.5" title="Low confidence extraction">
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
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#814d75] hover:underline flex items-center gap-0.5 mt-0.5 font-sans"
                                title="Open PDF to verify/edit this extraction"
                              >
                                <ExternalLink className="h-2.5 w-2.5" /> Verify
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[#d2c2cb]">—</span>
                            {studyHasPdf && (
                              <button
                                onClick={() => window.open(
                                  `/projects/${projectId}/studies/${s.study_id}/pdf?var=${v.variable_id}&var_name=${encodeURIComponent(v.name)}&manual=true`,
                                  "_blank",
                                  "noopener,noreferrer"
                                )}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#814d75] hover:underline flex items-center gap-0.5 font-sans"
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
        <div className="card p-8 text-center text-[#62535d] text-sm bg-white border border-[#d2c2cb] rounded-xl mb-6 shadow-xs">
          <div className="font-serif font-bold text-[#3a0f34] text-base mb-1">No extraction variables defined for this project yet.</div>
          <p className="text-xs text-[#62535d] max-w-md mx-auto mb-4 font-serif">
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
  const grouped = useMemo(() => {
    return variables.reduce((acc, v) => {
      const sec = v.section || "Other";
      if (!acc[sec]) acc[sec] = [];
      acc[sec].push(v);
      return acc;
    }, {} as Record<string, any[]>);
  }, [variables]);

  return (
    <div className="card p-6 mb-6 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
      <div className="flex items-center justify-between mb-4 border-b border-[#d2c2cb] pb-3">
        <h3 className="font-serif font-bold text-base text-[#3a0f34] flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-[#814d75]" />
          Variable Management
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">
            <Plus className="h-3 w-3" /> Add Variable
          </button>
          <button onClick={onClose} className="text-[#81737b] hover:text-[#3a0f34]">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add new variable form */}
      {showAdd && (
        <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#3a0f34] font-sans">Section</label>
              <select
                className="input mt-1 text-sm bg-white border-[#d2c2cb]"
                value={newVar.section}
                onChange={(e) => setNewVar({ ...newVar, section: e.target.value })}
              >
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#3a0f34] font-sans">Name</label>
              <input
                className="input mt-1 text-sm bg-white border-[#d2c2cb]"
                value={newVar.name}
                onChange={(e) => setNewVar({ ...newVar, name: e.target.value })}
                placeholder="e.g. mean_age"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#3a0f34] font-sans">Field Type</label>
              <select
                className="input mt-1 text-sm bg-white border-[#d2c2cb]"
                value={newVar.field_type}
                onChange={(e) => setNewVar({ ...newVar, field_type: e.target.value })}
              >
                {fieldTypes.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#3a0f34] font-sans">Allowed Values (for enum)</label>
              <input
                className="input mt-1 text-sm bg-white border-[#d2c2cb]"
                value={newVar.allowed_values}
                onChange={(e) => setNewVar({ ...newVar, allowed_values: e.target.value })}
                placeholder="e.g. CT; MRI; PET"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#3a0f34] font-sans">Description</label>
            <input
              className="input mt-1 text-sm bg-white border-[#d2c2cb]"
              value={newVar.description}
              onChange={(e) => setNewVar({ ...newVar, description: e.target.value })}
              placeholder="Variable description..."
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newVar.name.trim()}
              className="btn-primary text-xs"
            >
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Create
            </button>
            {createMutation.isError && (
              <span className="text-xs text-[#814d75]">{(createMutation.error as Error).message}</span>
            )}
          </div>
        </div>
      )}

      {/* Variable list grouped by section */}
      {Object.keys(grouped).length === 0 && (
        <p className="text-sm text-[#81737b] font-serif">No variables defined. Use Auto-Generate or add manually.</p>
      )}

      <div className="space-y-4">
        {(Object.entries(grouped) as [string, any[]][]).map(([section, vars]) => (
          <div key={section}>
            <div className="text-xs font-semibold text-[#814d75] uppercase tracking-wider mb-2 font-sans">{section}</div>
            <div className="space-y-1.5">
              {vars.map((v) => (
                <div key={v.variable_id} className="flex items-center justify-between bg-[#fbf9f4] border border-[#d2c2cb] rounded-md px-3 py-2">
                  <div className="flex-1 font-sans">
                    <span className="text-sm font-medium text-[#3a0f34]">{v.name}</span>
                    <span className="ml-2 text-xs text-[#81737b]">({v.field_type})</span>
                    {v.allowed_values && (
                      <span className="ml-2 text-xs text-[#81737b]">[{v.allowed_values}]</span>
                    )}
                    {v.description && (
                      <span className="ml-2 text-xs text-[#62535d] font-serif">— {v.description}</span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(v.variable_id)}
                    className="text-[#81737b] hover:text-[#814d75] p-1"
                    title="Delete variable"
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
    <div className="card p-4 text-center border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
      <div className={`text-2xl font-serif font-bold ${highlight ? "text-[#3a0f34]" : "text-[#4f444b]"}`}>
        {value}
      </div>
      <div className="text-xs text-[#62535d] font-sans mt-0.5">{label}</div>
    </div>
  );
}
