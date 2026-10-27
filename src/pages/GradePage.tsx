import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GradeAssessment, type GradeFactor } from "../lib/api";
import {
  ArrowLeft,
  Award,
  Plus,
  Trash2,
  Sparkles,
  Calculator,
  Download,
  Loader2,
  CheckCircle2,
  Lock,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

const CERTAINTY_COLORS: Record<string, string> = {
  high: "#065f46",
  moderate: "#7c5800",
  low: "#9a3412",
  very_low: "#991b1b",
};

const CERTAINTY_BG: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-50 text-amber-900 border-amber-200",
  low: "bg-orange-50 text-orange-900 border-orange-200",
  very_low: "bg-red-50 text-red-900 border-red-200",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grade-list", projectId] });
      if (selectedGradeId) setSelectedGradeId(null);
    },
  });

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-6 font-['Work_Sans']">
      <Link
        to={`/projects/${projectId}`}
        className="text-xs text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1.5 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to project overview
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#d2c2cb] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffdea6]/60 text-[#7c5800] border border-[#d2c2cb]">
              WORKFLOW SPINE: STEP 9
            </span>
            <span className="text-xs font-mono text-[#81737b]">Post-Synthesis Certainty</span>
          </div>
          <h1 className="font-['Serifon_Editorial'] text-3xl sm:text-4xl font-bold text-[#3a0f34] tracking-tight">
            GRADE Certainty Assessment
          </h1>
          <p className="text-[#62535d] text-sm mt-1 max-w-2xl leading-relaxed">
            Evaluate certainty of evidence across 5 downgrading and 3 upgrading domains. Assessments start in{" "}
            <span className="font-semibold text-[#7c5800]">DRAFT</span> and are finalized only after quantitative or descriptive synthesis has run.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={api.gradeExport(projectId!)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#3a0f34] bg-[#ffffff] hover:bg-[#eee7ec] border border-[#d2c2cb] rounded-lg transition-colors shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-[#814d75]" /> Export CSV
          </a>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded-lg transition-colors shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" /> New Assessment
          </button>
        </div>
      </div>

      {isLoading && <p className="text-[#81737b] text-sm">Loading GRADE assessments...</p>}

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
        <div className="bg-[#ffffff] border border-[#d2c2cb] p-12 text-center rounded-xl">
          <Award className="h-12 w-12 text-[#81737b]/40 mx-auto mb-3" />
          <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34] mb-1">
            No GRADE assessments yet
          </h3>
          <p className="text-[#62535d] text-xs max-w-md mx-auto mb-5 leading-relaxed">
            Create an outcome-specific GRADE assessment to evaluate Risk of Bias, inconsistency, indirectness, imprecision, and publication bias.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded-lg transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" /> Create first assessment
          </button>
        </div>
      )}

      {gradeList && gradeList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-6">
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

      {selectedGradeId && <GradeDetail gradeId={selectedGradeId} projectId={projectId!} />}
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
    <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded-xl shadow-xs mb-6">
      <h3 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34] mb-4">
        Create Outcome-Specific GRADE Assessment
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="text-xs font-semibold text-[#4f444b] uppercase tracking-wider block mb-1">
            Outcome Label
          </label>
          <input
            className="w-full text-xs border border-[#d2c2cb] rounded-lg px-3 py-2 bg-[#fbf9f4] focus:outline-none focus:ring-2 focus:ring-[#814d75] focus:bg-[#ffffff] transition-all"
            placeholder="e.g., All-cause mortality at 12 months"
            value={outcomeLabel}
            onChange={(e) => setOutcomeLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#4f444b] uppercase tracking-wider block mb-1">
            Linked Synthesis Cohort (Optional)
          </label>
          <select
            className="w-full text-xs border border-[#d2c2cb] rounded-lg px-3 py-2 bg-[#fbf9f4] focus:outline-none focus:ring-2 focus:ring-[#814d75] focus:bg-[#ffffff] transition-all"
            value={metaAnalysisId}
            onChange={(e) => setMetaAnalysisId(e.target.value)}
          >
            <option value="">None (Descriptive Synthesis Cohort)</option>
            {(Array.isArray(metaAnalyses) ? metaAnalyses : []).map((m) => (
              <option key={m.meta_id} value={m.meta_id}>
                {m.outcome_label} ({m.analysis_type || "generic"})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !outcomeLabel.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create Assessment
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-[#62535d] hover:text-[#3a0f34] bg-[#ffffff] hover:bg-[#eee7ec] border border-[#d2c2cb] rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
      {createMutation.isError && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-lg">
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
  const isFinal = grade.status === "final";

  return (
    <div
      className={`p-4 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? "border-[#3a0f34] bg-[#ffffff] ring-2 ring-[#814d75] shadow-xs"
          : "border-[#d2c2cb] bg-[#ffffff] hover:border-[#814d75] hover:bg-[#eee7ec]/25"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-sm text-[#3a0f34] truncate">{grade.outcome_label}</span>
            {isFinal ? (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#3a0f34] text-[#fbf9f4] border border-[#3a0f34] uppercase tracking-wider">
                FINAL
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#ffdea6] text-[#7c5800] border border-[#d2c2cb] uppercase tracking-wider">
                DRAFT
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded border uppercase tracking-wider ${
                CERTAINTY_BG[grade.certainty_rating] || "bg-gray-100 text-gray-700 border-gray-200"
              }`}
            >
              {grade.certainty_label || grade.certainty_rating}
            </span>
            <span className="text-xs text-[#81737b] truncate">
              {grade.starting_level === "high" ? "RCT baseline (High)" : "Observational baseline (Low)"}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this GRADE assessment?")) onDelete();
          }}
          className="text-[#81737b] hover:text-red-700 p-1 transition-colors"
          title="Delete assessment"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GradeDetail({ gradeId, projectId }: { gradeId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const [sofVisible, setSofVisible] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

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

  const finalizeMutation = useMutation({
    mutationFn: () => api.finalizeGrade(gradeId),
    onSuccess: () => {
      setFinalizeError(null);
      queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] });
      queryClient.invalidateQueries({ queryKey: ["grade-list", projectId] });
    },
    onError: (err: any) => {
      setFinalizeError(err.message || "Cannot finalize GRADE assessment before synthesis has run.");
    },
  });

  if (!grade) return null;

  const isFinal = grade.status === "final";
  const downgrading = grade.factors.filter((f) => f.factor_type === "downgrading");
  const upgrading = grade.factors.filter((f) => f.factor_type === "upgrading");

  return (
    <div className="space-y-5">
      {/* 1. Workflow State Banner */}
      {isFinal ? (
        <div className="bg-[#ffffff] border border-[#d2c2cb] p-4 rounded-xl flex items-start gap-3 shadow-xs">
          <CheckCircle2 className="h-5 w-5 text-[#3a0f34] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#3a0f34] flex items-center gap-2">
              <span>Assessment Finalized</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#3a0f34] text-[#fbf9f4]">
                FINAL
              </span>
            </div>
            <p className="text-xs text-[#62535d] mt-0.5 leading-relaxed">
              This GRADE certainty rating is officially finalized and locked for reporting.
              {grade.finalized_at && (
                <span> Recorded on {new Date(grade.finalized_at).toLocaleDateString()}.</span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[#fffdf7] border border-[#ffdea6] p-4.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#7c5800] mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-[#7c5800] flex items-center gap-2">
                <span>Assessment in DRAFT</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffdea6] text-[#7c5800] border border-[#d2c2cb]">
                  DRAFT
                </span>
              </div>
              <p className="text-xs text-[#62535d] mt-1 leading-relaxed max-w-xl">
                Review Risk of Bias and consistency domain inputs below. Once synthesis (quantitative pooling or descriptive evidence profile) has run for this outcome, finalize the assessment.
              </p>
            </div>
          </div>
          <button
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded-lg transition-colors shadow-xs shrink-0"
          >
            {finalizeMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-[#ffdea6]" />
            )}
            Finalize Assessment
          </button>
        </div>
      )}

      {finalizeError && (
        <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-700 mt-0.5 shrink-0" />
          <div className="leading-relaxed">{finalizeError}</div>
        </div>
      )}

      {/* 2. Certainty & Domain Actions Card */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded-xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-[#81737b] uppercase tracking-wider">
              Overall Certainty Rating
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <span
                className={`px-3.5 py-1.5 rounded-lg font-['Serifon_Editorial'] font-bold text-xl border tracking-wide ${
                  CERTAINTY_BG[grade.certainty_rating] || "bg-gray-100 text-gray-800 border-gray-200"
                }`}
              >
                {grade.certainty_label || grade.certainty_rating}
              </span>
              <div className="text-xs text-[#62535d]">
                Starting level:{" "}
                <span className="font-semibold text-[#3a0f34]">
                  {grade.starting_level === "high" ? "High (RCTs)" : "Low (Observational)"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => autoPopulateMutation.mutate()}
              disabled={autoPopulateMutation.isPending || isFinal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#3a0f34] bg-[#fbf9f4] hover:bg-[#eee7ec] disabled:opacity-50 border border-[#d2c2cb] rounded-lg transition-colors"
              title="Populate domains from Risk of Bias and synthesis cohort"
            >
              {autoPopulateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-[#814d75]" />
              )}
              Auto-Populate
            </button>
            <button
              onClick={() => computeMutation.mutate()}
              disabled={computeMutation.isPending || isFinal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
            >
              {computeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Calculator className="h-3.5 w-3.5 text-[#ffdea6]" />
              )}
              Recompute
            </button>
          </div>
        </div>
        {autoPopulateMutation.isSuccess && (
          <div className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
            <span>Successfully auto-populated from outcome study cohort and synthesis metrics.</span>
          </div>
        )}
      </div>

      {/* 3. Downgrading factors */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">
              Factors Reducing Certainty
            </h3>
            <p className="text-xs text-[#62535d] mt-0.5">
              Risk of bias, inconsistency, indirectness, imprecision, and publication bias.
            </p>
          </div>
          <span className="font-mono text-xs text-[#81737b]">{downgrading.length} domains</span>
        </div>
        <div className="space-y-3">
          {(Array.isArray(downgrading) ? downgrading : []).map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} isFinal={isFinal} />
          ))}
        </div>
      </div>

      {/* 4. Upgrading factors */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">
              Factors Raising Certainty
            </h3>
            <p className="text-xs text-[#62535d] mt-0.5">
              Large effect, dose-response gradient, and plausible residual confounding (observational designs).
            </p>
          </div>
          <span className="font-mono text-xs text-[#81737b]">{upgrading.length} domains</span>
        </div>
        <div className="space-y-3">
          {(Array.isArray(upgrading) ? upgrading : []).map((f) => (
            <FactorRow key={f.factor_id} factor={f} gradeId={gradeId} isFinal={isFinal} />
          ))}
        </div>
      </div>

      {/* 5. Summary of Findings (SoF) Table */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded-xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">
              Summary of Findings (SoF) Table
            </h3>
            <p className="text-xs text-[#62535d] mt-0.5">
              Standardized evidence table ready for inclusion in systematic review manuscripts.
            </p>
          </div>
          <button
            onClick={() => setSofVisible(!sofVisible)}
            className="px-3 py-1.5 text-xs font-semibold text-[#3a0f34] bg-[#fbf9f4] hover:bg-[#eee7ec] border border-[#d2c2cb] rounded-lg transition-colors"
          >
            {sofVisible ? "Hide SoF Table" : "Show SoF Table"}
          </button>
        </div>
        {sofVisible && sof && <SofTable sof={sof} />}
        {sofVisible && !sof && <p className="text-[#81737b] text-xs">Loading SoF table...</p>}
      </div>
    </div>
  );
}

function FactorRow({ factor, gradeId, isFinal }: { factor: GradeFactor; gradeId: string; isFinal: boolean }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(factor.rating);
  const [rationale, setRationale] = useState(factor.rationale);

  const updateMutation = useMutation({
    mutationFn: () => api.updateGradeFactor(factor.factor_id, { rating, rationale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grade-detail", gradeId] }),
  });

  return (
    <div className="border border-[#d2c2cb] bg-[#fbf9f4] rounded-lg p-3.5 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#3a0f34]">{factor.factor_name}</span>
            {factor.auto_populated ? (
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#814d75]/15 text-[#814d75] border border-[#814d75]/30">
                auto
              </span>
            ) : null}
          </div>
        </div>
        <select
          className="text-xs border border-[#d2c2cb] rounded px-2.5 py-1 bg-[#ffffff] text-[#3a0f34] focus:outline-none focus:ring-1 focus:ring-[#814d75] disabled:opacity-60"
          value={rating}
          disabled={isFinal}
          onChange={(e) => setRating(e.target.value)}
        >
          {factor.rating_options.map((opt) => (
            <option key={opt} value={opt}>
              {factor.rating_labels?.[opt] || opt}
            </option>
          ))}
        </select>
        {!isFinal && (
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="px-2.5 py-1 text-xs font-semibold text-[#3a0f34] bg-[#ffffff] hover:bg-[#eee7ec] border border-[#d2c2cb] rounded transition-colors"
          >
            {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
        )}
      </div>
      <input
        className="w-full text-xs border border-[#d2c2cb] rounded px-2.5 py-1.5 bg-[#ffffff] text-[#4f444b] placeholder-[#81737b] focus:outline-none focus:ring-1 focus:ring-[#814d75] disabled:opacity-60"
        placeholder="Rationale for this domain rating..."
        value={rationale}
        disabled={isFinal}
        onChange={(e) => setRationale(e.target.value)}
      />
      {updateMutation.isSuccess && (
        <div className="text-[11px] text-emerald-800">Domain saved and certainty recomputed.</div>
      )}
    </div>
  );
}

function SofTable({ sof }: { sof: any }) {
  return (
    <div className="overflow-x-auto space-y-4">
      <table className="w-full text-xs border border-[#d2c2cb] bg-[#ffffff]">
        <thead className="bg-[#eee7ec]/50 border-b border-[#d2c2cb]">
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-[#3a0f34]">Outcome</th>
            <th className="text-center px-3 py-2 font-semibold text-[#3a0f34]">Studies</th>
            <th className="text-center px-3 py-2 font-semibold text-[#3a0f34]">Certainty</th>
            <th className="text-left px-3 py-2 font-semibold text-[#3a0f34]">Effect Estimate (95% CI)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#d2c2cb]">
            <td className="px-3 py-2.5 font-semibold text-[#3a0f34]">{sof.outcome}</td>
            <td className="px-3 py-2.5 text-center font-mono text-[#4f444b]">{sof.n_studies}</td>
            <td className="px-3 py-2.5 text-center">
              <span
                className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border uppercase tracking-wider ${
                  CERTAINTY_BG[sof.certainty] || "bg-gray-100 text-gray-800 border-gray-200"
                }`}
              >
                {sof.certainty_label || sof.certainty}
              </span>
            </td>
            <td className="px-3 py-2.5 text-[#4f444b] font-mono">
              {sof.effect_estimate || "Descriptive evidence profile"}
              {sof.ci_text && <span className="text-[#62535d]"> {sof.ci_text}</span>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Factor breakdown */}
      <div>
        <div className="text-xs font-semibold text-[#3a0f34] uppercase tracking-wider mb-2">
          Domain Evaluation Breakdown
        </div>
        <table className="w-full text-xs border border-[#d2c2cb] bg-[#ffffff]">
          <thead className="bg-[#eee7ec]/50 border-b border-[#d2c2cb]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-[#3a0f34]">Domain</th>
              <th className="text-left px-3 py-2 font-semibold text-[#3a0f34]">Evaluation</th>
              <th className="text-left px-3 py-2 font-semibold text-[#3a0f34]">Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d2c2cb]/50">
            {sof.factors?.map((f: any) => (
              <tr key={f.factor_key}>
                <td className="px-3 py-2">
                  <span className="font-semibold text-[#4f444b]">{f.factor_name}</span>
                  <span
                    className={`ml-1.5 text-xs font-bold ${
                      f.factor_type === "downgrading" ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {f.factor_type === "downgrading" ? "↓" : "↑"}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-[#3a0f34]">{f.rating_label}</td>
                <td className="px-3 py-2 text-[#62535d]">{f.rationale || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
