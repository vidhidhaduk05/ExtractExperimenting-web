import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GradeAssessment, type GradeFactor } from "../lib/api";
import { ArrowLeft, Award, Plus, Trash2, Sparkles, Calculator, Download, Loader2, CheckCircle2 } from "lucide-react";

const CERTAINTY_COLORS: Record<string, string> = {
  high: "#3a0f34",
  moderate: "#814d75",
  low: "#7c5800",
  very_low: "#be123c",
};

const CERTAINTY_BG: Record<string, string> = {
  high: "bg-[#3a0f34]/10 text-[#3a0f34] border border-[#3a0f34]/25",
  moderate: "bg-[#814d75]/15 text-[#814d75] border border-[#814d75]/30",
  low: "bg-[#ffdea6]/60 text-[#7c5800] border border-[#ffdea6]",
  very_low: "bg-rose-50 text-rose-800 border border-rose-200",
};

export function GradePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);

  const { data: gradeList, isLoading } = useQuery({
    queryKey: ["grade-list", projectId],
    queryFn: () => api.listGrade(projectId!),
    enabled: !!projectId,
  });

  const { data: metaList } = useQuery({
    queryKey: ["meta-analyses", projectId],
    queryFn: () => api.listMetaAnalyses(projectId!),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteGrade(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-list", projectId] }),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      <Link to={`/projects/${projectId}`} className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 font-sans transition-colors">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-[#814d75]" />
            <h1 className="text-2xl font-serif font-bold text-[#3a0f34]">GRADE Certainty Assessment</h1>
          </div>
          <p className="text-[#62535d] text-sm mt-1 font-serif">
            Summary of Findings tables with auto-population from RoB and meta-analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href={api.gradeExport(projectId!)} className="btn-secondary">
            <Download className="h-4 w-4" /> Export CSV
          </a>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> New Assessment
          </button>
        </div>
      </div>

      {isLoading && <p className="text-[#81737b] font-serif py-6">Loading assessments...</p>}

      {showCreate && (
        <CreateGradeForm
          projectId={projectId!}
          metaAnalyses={metaList || []}
          onCancel={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedGradeId(id);
            queryClient.invalidateQueries({ queryKey: ["grade-list", projectId] });
          }}
        />
      )}

      {gradeList && gradeList.length === 0 && !showCreate && (
        <div className="card p-12 text-center border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
          <Award className="h-12 w-12 text-[#d2c2cb] mx-auto mb-3" />
          <p className="text-[#4f444b] font-serif text-base mb-4 font-semibold">No GRADE assessments yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex">
            <Plus className="h-4 w-4" /> Create your first assessment
          </button>
        </div>
      )}

      {gradeList && gradeList.length > 0 && (
        <div className="space-y-3 mb-6">
          {(Array.isArray(gradeList) ? gradeList : []).map((g) => (
            <GradeCard
              key={g.grade_id}
              grade={g}
              isSelected={selectedGradeId === g.grade_id}
              onSelect={() => setSelectedGradeId(g.grade_id)}
              onDelete={() => deleteMutation.mutate(g.grade_id)}
            />
          ))}
        </div>
      )}

      {selectedGradeId && <GradeDetail gradeId={selectedGradeId} />}
    </div>
  );
}

function CreateGradeForm({
  projectId,
  metaAnalyses,
  onCancel,
  onCreated,
}: {
  projectId: string;
  metaAnalyses: any[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [outcomeLabel, setOutcomeLabel] = useState("");
  const [metaAnalysisId, setMetaAnalysisId] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createGrade(projectId, {
        outcome_label: outcomeLabel || "Untitled Outcome",
        meta_analysis_id: metaAnalysisId || undefined,
      }),
    onSuccess: (data) => onCreated(data.grade_id),
  });

  return (
    <div className="card p-6 mb-6 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
      <h3 className="font-serif font-bold text-[#3a0f34] text-base mb-4">Create GRADE Assessment</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs font-semibold text-[#3a0f34] font-sans">Outcome Label</label>
          <input
            className="input mt-1 bg-white border-[#d2c2cb]"
            placeholder="e.g., Diagnostic accuracy of MRI for detecting tumor"
            value={outcomeLabel}
            onChange={(e) => setOutcomeLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#3a0f34] font-sans">Link to Meta-Analysis (optional)</label>
          <select
            className="input mt-1 bg-white border-[#d2c2cb]"
            value={metaAnalysisId}
            onChange={(e) => setMetaAnalysisId(e.target.value)}
          >
            <option value="">None</option>
            {(Array.isArray(metaAnalyses) ? metaAnalyses : []).map((m) => (
              <option key={m.meta_id} value={m.meta_id}>
                {m.outcome_label} ({m.analysis_type})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="btn-primary"
        >
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
      {createMutation.isError && (
        <div className="mt-3 text-sm text-[#814d75]">
          Error: {(createMutation.error as Error).message}
        </div>
      )}
    </div>
  );
}

function GradeCard({
  grade,
  isSelected,
  onSelect,
  onDelete,
}: {
  grade: GradeAssessment;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`card p-4.5 cursor-pointer transition-all border rounded-xl bg-white shadow-xs ${
        isSelected ? "border-[#3a0f34] ring-2 ring-[#814d75]" : "border-[#d2c2cb] hover:border-[#814d75]"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <span className="font-serif font-bold text-[#3a0f34]">{grade.outcome_label}</span>
            <span className={`badge ${CERTAINTY_BG[grade.certainty_rating] || "bg-[#eee7ec] text-[#62535d]"}`}>
              {grade.certainty_label || grade.certainty_rating}
            </span>
          </div>
          <div className="text-xs text-[#81737b] mt-1 font-sans">
            Starting: {grade.starting_level} | {grade.factors?.length || 0} factors
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[#81737b] hover:text-[#814d75] p-1"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GradeDetail({ gradeId }: { gradeId: string }) {
  const queryClient = useQueryClient();
  const [sofVisible, setSofVisible] = useState(false);

  const { data: grade } = useQuery({
    queryKey: ["grade-detail", gradeId],
    queryFn: () => api.getGrade(gradeId),
  });

  const { data: sof } = useQuery({
    queryKey: ["sof-table", gradeId],
    queryFn: () => api.getSofTable(gradeId),
    enabled: sofVisible,
  });

  const downgrading = useMemo(
    () => (grade?.factors || []).filter((f) => f.factor_type === "downgrading"),
    [grade?.factors]
  );
  const upgrading = useMemo(
    () => (grade?.factors || []).filter((f) => f.factor_type === "upgrading"),
    [grade?.factors]
  );

  const autoPopulateMutation = useMutation({
    mutationFn: () => api.autoPopulateGrade(gradeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  const computeMutation = useMutation({
    mutationFn: () => api.computeGrade(gradeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  if (!grade) return null;

  return (
    <div className="space-y-5">
      {/* Certainty banner */}
      <div className="card p-5 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[#81737b] uppercase font-sans">Certainty Rating</div>
            <div className="flex items-center gap-3 mt-1.5">
              <div
                className="px-4 py-1.5 rounded-lg font-serif font-bold text-lg border border-[#d2c2cb]"
                style={{
                  backgroundColor: "#eee7ec",
                  color: CERTAINTY_COLORS[grade.certainty_rating] || "#3a0f34",
                }}
              >
                {grade.certainty_label || grade.certainty_rating}
              </div>
              <div className="text-sm text-[#62535d] font-sans">
                Starting: <span className="font-semibold text-[#3a0f34]">{grade.starting_level}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => autoPopulateMutation.mutate()}
              disabled={autoPopulateMutation.isPending}
              className="btn-secondary"
            >
              {autoPopulateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" /> : <Sparkles className="h-4 w-4" />}
              Auto-Populate
            </button>
            <button
              onClick={() => computeMutation.mutate()}
              disabled={computeMutation.isPending}
              className="btn-primary"
            >
              {computeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Compute
            </button>
          </div>
        </div>
        {autoPopulateMutation.isSuccess && (
          <div className="mt-3 text-xs text-[#3a0f34] bg-[#eee7ec] p-2 rounded border border-[#d2c2cb] flex items-center gap-1.5 font-sans">
            <CheckCircle2 className="h-4 w-4 text-[#814d75]" /> Auto-populated from RoB and meta-analysis data.
          </div>
        )}
      </div>

      {/* Downgrading factors */}
      <div className="card p-5 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
        <h3 className="text-base font-serif font-bold text-[#3a0f34] mb-4">Factors Reducing Certainty</h3>
        <div className="space-y-3">
          {(Array.isArray(downgrading) ? downgrading : []).map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} />
          ))}
        </div>
      </div>

      {/* Upgrading factors */}
      <div className="card p-5 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
        <h3 className="text-base font-serif font-bold text-[#3a0f34] mb-4">Factors Raising Certainty</h3>
        <div className="space-y-3">
          {(Array.isArray(upgrading) ? upgrading : []).map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} />
          ))}
        </div>
      </div>

      {/* SoF Table */}
      <div className="card p-5 border border-[#d2c2cb] bg-white rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-[#eee7ec] pb-2">
          <h3 className="text-base font-serif font-bold text-[#3a0f34]">Summary of Findings (SoF) Table</h3>
          <button
            onClick={() => setSofVisible(!sofVisible)}
            className="btn-secondary text-xs"
          >
            {sofVisible ? "Hide" : "Show"}
          </button>
        </div>
        {sofVisible && sof && <SofTable sof={sof} />}
        {sofVisible && !sof && <p className="text-[#81737b] text-sm font-serif">Loading SoF table...</p>}
      </div>
    </div>
  );
}

function FactorRow({ factor, gradeId }: { factor: GradeFactor; gradeId: string }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(factor.rating);
  const [rationale, setRationale] = useState(factor.rationale);

  const updateMutation = useMutation({
    mutationFn: () => api.updateGradeFactor(factor.factor_id, { rating, rationale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  return (
    <div className="border border-[#d2c2cb] rounded-lg p-3 bg-[#fbf9f4]">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#3a0f34] font-sans">{factor.factor_name}</span>
            {factor.auto_populated && (
              <span className="badge bg-[#eee7ec] text-[#814d75] border border-[#d2c2cb] text-[10px]">auto</span>
            )}
          </div>
        </div>
        <select
          className="input py-1 text-xs max-w-[180px] bg-white border-[#d2c2cb]"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
        >
          {factor.rating_options.map((opt) => (
            <option key={opt} value={opt}>
              {factor.rating_labels?.[opt] || opt}
            </option>
          ))}
        </select>
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="btn-secondary text-xs px-2.5 py-1"
        >
          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </button>
      </div>
      <input
        className="input text-xs bg-white border-[#d2c2cb]"
        placeholder="Rationale for this rating..."
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      {updateMutation.isSuccess && (
        <div className="text-xs text-[#3a0f34] mt-1 font-sans">Saved & certainty recomputed.</div>
      )}
    </div>
  );
}

function SofTable({ sof }: { sof: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-[#d2c2cb] rounded-lg">
        <thead className="bg-[#fbf9f4]">
          <tr>
            <th className="text-left px-3 py-2.5 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Outcome</th>
            <th className="text-center px-3 py-2.5 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Studies</th>
            <th className="text-center px-3 py-2.5 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Certainty</th>
            <th className="text-left px-3 py-2.5 font-semibold text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Effect Estimate</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          <tr className="border-b border-[#eee7ec]">
            <td className="px-3 py-3 font-medium text-[#3a0f34]">{sof.outcome}</td>
            <td className="px-3 py-3 text-center text-[#4f444b] font-sans">{sof.n_studies}</td>
            <td className="px-3 py-3 text-center">
              <span
                className="inline-block px-2.5 py-1 rounded font-semibold text-xs border"
                style={{
                  backgroundColor: "#eee7ec",
                  borderColor: "#d2c2cb",
                  color: sof.certainty_color || "#3a0f34",
                }}
              >
                {sof.certainty_label}
              </span>
            </td>
            <td className="px-3 py-3 text-[#4f444b] font-sans">
              {sof.effect_estimate || "—"}
              {sof.ci_text && <span className="text-[#81737b]"> ({sof.ci_text})</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Factor breakdown */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-[#814d75] uppercase mb-2 font-sans">Factor Assessment</div>
        <table className="w-full text-xs border border-[#d2c2cb] rounded-lg">
          <thead className="bg-[#fbf9f4]">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Factor</th>
              <th className="text-left px-3 py-2 font-medium text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Rating</th>
              <th className="text-left px-3 py-2 font-medium text-[#3a0f34] border-b border-[#d2c2cb] font-sans">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee7ec] bg-white">
            {sof.factors?.map((f: any) => (
              <tr key={f.factor_key}>
                <td className="px-3 py-2 font-sans">
                  <span className="font-medium text-[#3a0f34]">{f.factor_name}</span>
                  <span className={`ml-2 text-xs font-bold ${f.factor_type === "downgrading" ? "text-rose-700" : "text-[#7c5800]"}`}>
                    {f.factor_type === "downgrading" ? "↓" : "↑"}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#4f444b] font-sans">{f.rating_label}</td>
                <td className="px-3 py-2 text-[#62535d] font-serif">{f.rationale || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
