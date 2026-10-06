import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Target, Lightbulb } from "lucide-react";

export function ProjectCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name: form.name,
        description: form.description,
      }),
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
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
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
