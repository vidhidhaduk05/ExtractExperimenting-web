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
      <Link to={`/projects/${projectId}`} className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 font-sans">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <h1 className="text-2xl font-serif font-bold text-[#3a0f34] mb-1">Research Hypothesis</h1>
      <p className="text-[#62535d] text-sm mb-6 font-sans">
        Define your primary and secondary hypotheses. These guide variable auto-generation
        and help structure the evidence synthesis.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-[#81737b]">
          <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" /> Loading...
        </div>
      )}

      {hyp && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="space-y-4"
        >
          {/* Research Question */}
          <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl">
            <label className="flex items-center gap-2 text-sm font-serif font-semibold text-[#3a0f34] mb-2">
              <HelpCircle className="h-4 w-4 text-[#814d75]" />
              Research Question
            </label>
            <textarea
              className="input min-h-[60px] text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5 font-sans"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              placeholder="e.g., What is the diagnostic accuracy of CT compared to MRI for detecting liver metastases in patients with colorectal cancer?"
            />
          </div>

          {/* Primary Hypothesis */}
          <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl">
            <label className="flex items-center gap-2 text-sm font-serif font-semibold text-[#3a0f34] mb-2">
              <Lightbulb className="h-4 w-4 text-[#7c5800]" />
              Primary Hypothesis
            </label>
            <textarea
              className="input min-h-[80px] text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5 font-sans"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="e.g., MRI has superior diagnostic accuracy compared to CT for the detection of liver metastases in colorectal cancer patients."
            />
          </div>

          {/* Secondary Hypotheses */}
          <div className="card p-5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm font-serif font-semibold text-[#3a0f34]">
                <Lightbulb className="h-4 w-4 text-[#81737b]" />
                Secondary Hypotheses
              </label>
              <button
                type="button"
                onClick={addSecondary}
                className="text-xs text-[#814d75] hover:text-[#3a0f34] hover:underline flex items-center gap-1 font-medium font-sans"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {secondary.length === 0 && (
              <p className="text-sm text-[#81737b] font-sans">No secondary hypotheses defined.</p>
            )}

            <div className="space-y-3">
              {secondary.map((h, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <textarea
                    className="input min-h-[40px] flex-1 text-xs bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5 font-sans"
                    value={h.text}
                    onChange={(e) => updateSecondary(i, "text", e.target.value)}
                    placeholder="Secondary hypothesis text..."
                  />
                  <select
                    className="input w-28 text-xs bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2 font-sans"
                    value={h.type}
                    onChange={(e) => updateSecondary(i, "type", e.target.value)}
                  >
                    <option value="alternative">Alternative</option>
                    <option value="null">Null</option>
                  </select>
                  <select
                    className="input w-28 text-xs bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2 font-sans"
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
                    className="text-[#81737b] hover:text-[#a42b2b] mt-1 p-1 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {saveMutation.isError && (
            <div className="rounded-md bg-[#fff2f2] border border-[#d2c2cb] px-4 py-3 text-sm text-[#a42b2b]">
              Error: {(saveMutation.error as Error).message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Hypothesis
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-[#2d6a4f] font-sans font-medium">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>

          {(hypothesis || researchQuestion) && (
            <div className="card p-4 bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl">
              <p className="text-sm text-[#62535d] font-sans">
                Hypothesis defined. Use{" "}
                <Link to={`/projects/${projectId}/review`} className="text-[#814d75] hover:text-[#3a0f34] hover:underline font-medium">
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
