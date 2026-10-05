import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GradeAssessment, type GradeFactor } from "../lib/api";
import { ArrowLeft, Award, Plus, Trash2, Sparkles, Calculator, Download, Loader2, CheckCircle2 } from "lucide-react";

const CERTAINTY_COLORS: Record<string, string> = {
  high: "#75A025",
  moderate: "#E9ED4C",
  low: "#FF9400",
  very_low: "#E94444",
};

const CERTAINTY_BG: Record<string, string> = {
  high: "bg-phylo-green/15 text-phylo-green",
  moderate: "bg-phylo-yellow/20 text-gray-700",
  low: "bg-phylo-orange/15 text-phylo-orange",
  very_low: "bg-red-100 text-red-700",
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
    <div className="p-8 max-w-6xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-phylo-blue" />
            <h1 className="text-2xl font-bold">GRADE Certainty Assessment</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
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

      {isLoading && <p className="text-gray-400">Loading...</p>}

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
        <div className="card p-12 text-center">
          <Award className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No GRADE assessments yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex">
            <Plus className="h-4 w-4" /> Create your first assessment
          </button>
        </div>
      )}

      {gradeList && gradeList.length > 0 && (
        <div className="space-y-3 mb-6">
          {gradeList.map((g) => (
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
    <div className="card p-6 mb-6">
      <h3 className="font-semibold mb-4">Create GRADE Assessment</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs font-medium text-gray-500">Outcome Label</label>
          <input
            className="input mt-1"
            placeholder="e.g., Diagnostic accuracy of MRI for detecting tumor"
            value={outcomeLabel}
            onChange={(e) => setOutcomeLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Link to Meta-Analysis (optional)</label>
          <select
            className="input mt-1"
            value={metaAnalysisId}
            onChange={(e) => setMetaAnalysisId(e.target.value)}
          >
            <option value="">None</option>
            {metaAnalyses.map((m) => (
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
        <div className="mt-3 text-sm text-red-600">
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
      className={`card p-4 cursor-pointer transition-all ${isSelected ? "ring-2 ring-phylo-blue" : "hover:shadow-md"}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{grade.outcome_label}</span>
            <span className={`badge ${CERTAINTY_BG[grade.certainty_rating] || "bg-gray-100 text-gray-600"}`}>
              {grade.certainty_label || grade.certainty_rating}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Starting: {grade.starting_level} | {grade.factors?.length || 0} factors
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-400 hover:text-red-500"
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

  const autoPopulateMutation = useMutation({
    mutationFn: () => api.autoPopulateGrade(gradeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  const computeMutation = useMutation({
    mutationFn: () => api.computeGrade(gradeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  if (!grade) return null;

  const downgrading = grade.factors.filter((f) => f.factor_type === "downgrading");
  const upgrading = grade.factors.filter((f) => f.factor_type === "upgrading");

  return (
    <div className="space-y-4">
      {/* Certainty banner */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase">Certainty Rating</div>
            <div className="flex items-center gap-3 mt-1">
              <div
                className="px-4 py-2 rounded-lg font-bold text-lg"
                style={{
                  backgroundColor: `${CERTAINTY_COLORS[grade.certainty_rating]}20`,
                  color: CERTAINTY_COLORS[grade.certainty_rating],
                }}
              >
                {grade.certainty_label || grade.certainty_rating}
              </div>
              <div className="text-sm text-gray-500">
                Starting: <span className="font-medium">{grade.starting_level}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => autoPopulateMutation.mutate()}
              disabled={autoPopulateMutation.isPending}
              className="btn-secondary"
            >
              {autoPopulateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
          <div className="mt-3 text-sm text-phylo-green flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Auto-populated from RoB and meta-analysis data.
          </div>
        )}
      </div>

      {/* Downgrading factors */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4">Factors Reducing Certainty</h3>
        <div className="space-y-3">
          {downgrading.map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} />
          ))}
        </div>
      </div>

      {/* Upgrading factors */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4">Factors Raising Certainty</h3>
        <div className="space-y-3">
          {upgrading.map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} />
          ))}
        </div>
      </div>

      {/* SoF Table */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Summary of Findings (SoF) Table</h3>
          <button
            onClick={() => setSofVisible(!sofVisible)}
            className="btn-secondary text-xs"
          >
            {sofVisible ? "Hide" : "Show"}
          </button>
        </div>
        {sofVisible && sof && <SofTable sof={sof} />}
        {sofVisible && !sof && <p className="text-gray-400 text-sm">Loading SoF table...</p>}
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
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{factor.factor_name}</span>
            {factor.auto_populated && (
              <span className="badge bg-phylo-blue/10 text-phylo-blue text-xs">auto</span>
            )}
          </div>
        </div>
        <select
          className="input py-1 text-xs max-w-[180px]"
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
          className="btn-secondary text-xs px-2 py-1"
        >
          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </button>
      </div>
      <input
        className="input text-xs"
        placeholder="Rationale for this rating..."
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      {updateMutation.isSuccess && (
        <div className="text-xs text-phylo-green mt-1">Saved & certainty recomputed.</div>
      )}
    </div>
  );
}

function SofTable({ sof }: { sof: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b">Outcome</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b">Studies</th>
            <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b">Certainty</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b">Effect Estimate</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="px-3 py-3 font-medium">{sof.outcome}</td>
            <td className="px-3 py-3 text-center">{sof.n_studies}</td>
            <td className="px-3 py-3 text-center">
              <span
                className="inline-block px-2 py-1 rounded font-semibold"
                style={{
                  backgroundColor: `${sof.certainty_color}20`,
                  color: sof.certainty_color,
                }}
              >
                {sof.certainty_label}
              </span>
            </td>
            <td className="px-3 py-3 text-gray-600">
              {sof.effect_estimate || "—"}
              {sof.ci_text && <span className="text-gray-400"> ({sof.ci_text})</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Factor breakdown */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Factor Assessment</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Factor</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Rating</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sof.factors?.map((f: any) => (
              <tr key={f.factor_key}>
                <td className="px-3 py-2">
                  <span className="font-medium">{f.factor_name}</span>
                  <span className={`ml-2 text-xs ${f.factor_type === "downgrading" ? "text-red-400" : "text-phylo-green"}`}>
                    {f.factor_type === "downgrading" ? "↓" : "↑"}
                  </span>
                </td>
                <td className="px-3 py-2">{f.rating_label}</td>
                <td className="px-3 py-2 text-gray-500">{f.rationale || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
