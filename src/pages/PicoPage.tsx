import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Users, Stethoscope, GitCompare, Target, FlaskConical, Loader2, CheckCircle } from "lucide-react";

export function PicoPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const { data: pico, isLoading } = useQuery({
    queryKey: ["pico", projectId],
    queryFn: () => api.getPico(projectId!),
    enabled: !!projectId,
  });

  const [form, setForm] = useState({
    population: "",
    index_test: "",
    comparator: "",
    outcome: "",
    study_design: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pico) {
      setForm({
        population: pico.population || "",
        index_test: pico.index_test || "",
        comparator: pico.comparator || "",
        outcome: pico.outcome || "",
        study_design: pico.study_design || "",
      });
    }
  }, [pico]);

  const saveMutation = useMutation({
    mutationFn: () => api.updatePico(projectId!, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fields = [
    { key: "population", label: "P — Population", icon: Users, placeholder: "e.g., Patients with colorectal cancer undergoing staging imaging" },
    { key: "index_test", label: "I — Index Test", icon: Stethoscope, placeholder: "e.g., Contrast-enhanced computed tomography (CT)" },
    { key: "comparator", label: "C — Comparator", icon: GitCompare, placeholder: "e.g., Gadoxetic acid-enhanced MRI as reference standard" },
    { key: "outcome", label: "O — Outcome", icon: Target, placeholder: "e.g., Diagnostic accuracy (sensitivity and specificity)" },
    { key: "study_design", label: "S — Study Design", icon: FlaskConical, placeholder: "e.g., Diagnostic accuracy studies (cross-sectional)" },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <h1 className="text-2xl font-bold mb-1">PICO Framework</h1>
      <p className="text-gray-500 text-sm mb-6">
        Define the Population, Index test, Comparator, Outcome, and Study design for your systematic review.
        This framework drives variable auto-generation on the Data Review page.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      )}

      {pico && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="space-y-4"
        >
          {fields.map(({ key, label, icon: Icon, placeholder }) => (
            <div key={key} className="card p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Icon className="h-4 w-4 text-phylo-blue" />
                {label}
              </label>
              <textarea
                className="input min-h-[60px]"
                value={form[key as keyof typeof form]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}

          {saveMutation.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Error: {(saveMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save PICO Framework
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-phylo-green">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>

          {pico.is_defined && (
            <div className="card p-4 bg-phylo-cream/30">
              <p className="text-sm text-gray-600">
                PICO is defined. Go to the{" "}
                <Link to={`/projects/${projectId}/hypothesis`} className="text-phylo-blue hover:underline font-medium">
                  Hypothesis page
                </Link>{" "}
                to define your research hypothesis, then use{" "}
                <Link to={`/projects/${projectId}/review`} className="text-phylo-blue hover:underline font-medium">
                  Data Review
                </Link>{" "}
                to auto-generate extraction variables.
              </p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
