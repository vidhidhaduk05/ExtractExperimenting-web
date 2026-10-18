import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Target, Lightbulb, ShieldCheck, Sparkles } from "lucide-react";

export function ProjectCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
    autoRobEnabled: true,
    robConfidenceThreshold: 0.7,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const project = await api.createProject({
        name: form.name,
        description: form.description,
      });
      // Save project settings
      try {
        await api.updateProjectSettings(project.project_id, {
          auto_rob_enabled: form.autoRobEnabled,
          rob_confidence_threshold: form.robConfidenceThreshold,
        });
      } catch (e) {
        // Fallback gracefully in demo/offline mode
      }
      return project;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // Navigate to PICO page to continue setup
      navigate(`/projects/${project.project_id}/pico`);
    },
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link to="/projects" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Link>

      <h1 className="text-2xl font-bold mb-6">Create New Project</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Project Name *</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g., CT vs MRI for Metastasis Detection in CRC"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="input min-h-[80px]"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of the systematic review..."
            />
          </div>
        </div>

        {/* Automated Risk of Bias Pipeline Configuration */}
        <div className="card p-6 space-y-4 bg-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-phylo-blue" />
            <h2 className="text-sm font-semibold text-[#141413]">
              Automated Risk of Bias Pipeline
            </h2>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoRobEnabled}
              onChange={(e) => setForm((f) => ({ ...f, autoRobEnabled: e.target.checked }))}
              className="mt-1 rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
            />
            <div>
              <div className="text-xs font-semibold text-[#141413]">
                Automatically launch RoB batch phase after screening completes
              </div>
              <div className="text-[11px] text-[#6B665E] leading-relaxed mt-0.5">
                When background AI screening completes for all included studies, automatically select the appropriate tool (RoB 2, ROBINS-I, ROBINS-E, QUADAS-2, NOS) based on study design and pre-fill signaling questions using full text.
              </div>
            </div>
          </label>

          {form.autoRobEnabled && (
            <div className="pt-3 border-t border-black/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#141413]">Human Review Confidence Threshold</span>
                <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {Math.round(form.robConfidenceThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                value={form.robConfidenceThreshold}
                onChange={(e) =>
                  setForm((f) => ({ ...f, robConfidenceThreshold: parseFloat(e.target.value) }))
                }
                className="w-full accent-purple-600"
              />
              <p className="text-[11px] text-[#6B665E]">
                Questions where AI confidence is below {Math.round(form.robConfidenceThreshold * 100)}% will be flagged with an amber badge for human verification on the RoB assessment page.
              </p>
            </div>
          )}
        </div>

        {/* Next steps preview */}
        <div className="card p-4 bg-phylo-cream/30">
          <p className="text-sm text-gray-600 mb-3 font-medium">After creating the project, you'll set up:</p>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-gray-500">
              <Target className="h-4 w-4 text-phylo-blue" /> PICO Framework
            </span>
            <span className="text-gray-300">→</span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <Lightbulb className="h-4 w-4 text-phylo-orange" /> Hypothesis
            </span>
            <span className="text-gray-300">→</span>
            <span className="text-gray-500">Import Studies</span>
          </div>
        </div>

        {mutation.isError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Error: {(mutation.error as Error).message}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create Project"}
          </button>
          <Link to="/projects" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
