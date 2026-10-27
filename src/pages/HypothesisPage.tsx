import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SecondaryHypothesis } from "../lib/api";
import { ArrowLeft, Lightbulb, HelpCircle, Plus, Trash2, Loader2, CheckCircle } from "lucide-react";

export function HypothesisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const { data: hyp, isLoading } = useQuery({
    queryKey: ["hypothesis", projectId],
    queryFn: () => api.getHypothesis(projectId!),
    enabled: !!projectId,
  });

  const [hypothesis, setHypothesis] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [secondary, setSecondary] = useState<SecondaryHypothesis[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hyp) {
      setHypothesis(hyp.hypothesis || "");
      setResearchQuestion(hyp.research_question || "");
      setSecondary(hyp.secondary_hypotheses || []);
    }
  }, [hyp]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateHypothesis(projectId!, {
        hypothesis,
        research_question: researchQuestion,
        secondary_hypotheses: secondary,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const addSecondary = () => {
    setSecondary([...secondary, { text: "", type: "alternative", status: "pending" }]);
  };

  const updateSecondary = (i: number, field: keyof SecondaryHypothesis, value: string) => {
    const next = [...secondary];
    next[i] = { ...next[i], [field]: value };
    setSecondary(next);
  };

  const removeSecondary = (i: number) => {
    setSecondary(secondary.filter((_, idx) => idx !== i));
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <h1 className="text-2xl font-bold mb-1">Research Hypothesis</h1>
      <p className="text-gray-500 text-sm mb-6">
        Define your primary and secondary hypotheses. These guide variable auto-generation
        and help structure the evidence synthesis.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      )}

      {hyp && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="space-y-4"
        >
          {/* Research Question */}
          <div className="card p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <HelpCircle className="h-4 w-4 text-phylo-blue" />
              Research Question
            </label>
            <textarea
              className="input min-h-[60px]"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              placeholder="e.g., What is the diagnostic accuracy of CT compared to MRI for detecting liver metastases in patients with colorectal cancer?"
            />
          </div>

          {/* Primary Hypothesis */}
          <div className="card p-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Lightbulb className="h-4 w-4 text-phylo-orange" />
              Primary Hypothesis
            </label>
            <textarea
              className="input min-h-[80px]"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="e.g., MRI has superior diagnostic accuracy compared to CT for the detection of liver metastases in colorectal cancer patients."
            />
          </div>

          {/* Secondary Hypotheses */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Lightbulb className="h-4 w-4 text-gray-400" />
                Secondary Hypotheses
              </label>
              <button
                type="button"
                onClick={addSecondary}
                className="text-xs text-phylo-blue hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {secondary.length === 0 && (
              <p className="text-sm text-gray-400">No secondary hypotheses defined.</p>
            )}

            <div className="space-y-3">
              {secondary.map((h, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <textarea
                    className="input min-h-[40px] flex-1 text-sm"
                    value={h.text}
                    onChange={(e) => updateSecondary(i, "text", e.target.value)}
                    placeholder="Secondary hypothesis text..."
                  />
                  <select
                    className="input w-28 text-xs"
                    value={h.type}
                    onChange={(e) => updateSecondary(i, "type", e.target.value)}
                  >
                    <option value="alternative">Alternative</option>
                    <option value="null">Null</option>
                  </select>
                  <select
                    className="input w-28 text-xs"
                    value={h.status}
                    onChange={(e) => updateSecondary(i, "status", e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSecondary(i)}
                    className="text-gray-400 hover:text-red-500 mt-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {saveMutation.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Error: {(saveMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Hypothesis
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-phylo-green">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>

          {(hypothesis || researchQuestion) && (
            <div className="card p-4 bg-phylo-cream/30">
              <p className="text-sm text-gray-600">
                Hypothesis defined. Use{" "}
                <Link to={`/projects/${projectId}/review`} className="text-phylo-blue hover:underline font-medium">
                  Data Review
                </Link>{" "}
                to auto-generate extraction variables from your PICO framework and hypothesis.
              </p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
