import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Target, Lightbulb, ShieldCheck, Folder, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export function ProjectCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    description: "",
    storageFolder: "",
    autoRobEnabled: true,
    robConfidenceThreshold: 0.7,
  });

  const [provisionStatus, setProvisionStatus] = useState<{
    loading: boolean;
    success?: boolean;
    msg?: string;
    subfolders?: string[];
  }>({ loading: false });

  // Native folder picker or direct path provisioner
  const handleChooseFolder = async () => {
    try {
      if ("showDirectoryPicker" in window) {
        // Modern browser File System Access API
        const dirHandle = await (window as any).showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          // Fallback guess if exact full path is masked by browser sandbox
          const chosenName = dirHandle.name;
          const currentPath = form.storageFolder ? form.storageFolder : `D:/Desktop/${chosenName}`;
          set("storageFolder", currentPath);
          await triggerProvision(currentPath);
        }
      } else {
        // Fallback prompt for explicit path
        const manual = window.prompt("Enter or paste local disk folder path for this systematic review:", form.storageFolder || "D:/STUDY DATA");
        if (manual && manual.trim()) {
          set("storageFolder", manual.trim());
          await triggerProvision(manual.trim());
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const manual = window.prompt("Enter or paste local disk folder path:", form.storageFolder || "D:/STUDY DATA");
        if (manual && manual.trim()) {
          set("storageFolder", manual.trim());
          await triggerProvision(manual.trim());
        }
      }
    }
  };

  const triggerProvision = async (folderPath: string) => {
    if (!folderPath || !folderPath.trim()) return;
    setProvisionStatus({ loading: true });
    try {
      const res = await api.provisionStorageFolder(folderPath.trim(), true);
      setProvisionStatus({
        loading: false,
        success: true,
        msg: `Provisioned 14 review lifecycle subfolders at ${res.folder_path}`,
        subfolders: res.created_subfolders,
      });
    } catch (e: any) {
      setProvisionStatus({
        loading: false,
        success: false,
        msg: e.message || "Failed to initialize folder structure on disk",
      });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      // If user supplied a storage folder, ensure it and its subfolders are provisioned on disk
      if (form.storageFolder && form.storageFolder.trim()) {
        try {
          await api.provisionStorageFolder(form.storageFolder.trim(), true);
        } catch (e) {
          console.warn("Storage folder provisioning note:", e);
        }
      }

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
    <div className="p-8 max-w-2xl mx-auto font-['Work_Sans']">
      <Link to="/projects" className="text-xs text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 font-semibold">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Link>

      <h1 className="text-3xl font-bold font-['Serifon_Editorial'] text-[#3a0f34] mb-6">Create New Project</h1>

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

        {/* Local Storage & Folder Selection */}
        <div className="card p-6 space-y-3 bg-white border border-[#d2c2cb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-[#814d75]" />
              <h2 className="text-sm font-semibold text-[#3a0f34]">
                Local Workspace & Storage Folder
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#eee7ec] text-[#66365c] border border-[#d2c2cb]">
              SYSTEMATIC REVIEW DISK TREE
            </span>
          </div>

          <p className="text-xs text-[#62535d] leading-relaxed">
            Choose or specify a dedicated local disk folder. RadExtract will automatically generate the 14 standard systematic review lifecycle subdirectories (<code>_INBOX</code>, <code>01_SOURCE</code> through <code>08_AUDIT</code>, <code>UPLOADS</code>, <code>EXPORTS</code>) on disk.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              className="input text-xs font-mono flex-1"
              value={form.storageFolder}
              onChange={(e) => set("storageFolder", e.target.value)}
              placeholder="e.g., D:/STUDY DATA or D:/Desktop/My_Systematic_Review"
            />
            <button
              type="button"
              onClick={handleChooseFolder}
              className="px-3.5 py-1.5 bg-[#fbf9f4] hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              title="Browse disk to choose folder"
            >
              <Folder className="h-3.5 w-3.5 text-[#814d75]" />
              <span>Choose Folder</span>
            </button>
            <button
              type="button"
              onClick={() => triggerProvision(form.storageFolder)}
              disabled={!form.storageFolder.trim() || provisionStatus.loading}
              className="px-3 py-1.5 bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] rounded text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
            >
              {provisionStatus.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Init Folders"}
            </button>
          </div>

          {provisionStatus.msg && (
            <div className={`p-3 rounded text-xs flex items-start gap-2 ${provisionStatus.success ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-rose-50 text-rose-900 border border-rose-200"}`}>
              {provisionStatus.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />}
              <div className="space-y-1">
                <div>{provisionStatus.msg}</div>
                {provisionStatus.subfolders && provisionStatus.subfolders.length > 0 && (
                  <div className="text-[11px] font-mono text-[#62535d] flex flex-wrap gap-1 mt-1">
                    {provisionStatus.subfolders.map((sf) => (
                      <span key={sf} className="px-1.5 py-0.5 rounded bg-white/80 border border-emerald-200 text-emerald-950">
                        {sf}/
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Automated Risk of Bias Pipeline Configuration */}
        <div className="card p-6 space-y-4 bg-white border border-[#d2c2cb]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#814d75]" />
            <h2 className="text-sm font-semibold text-[#3a0f34]">
              Automated Risk of Bias Pipeline
            </h2>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoRobEnabled}
              onChange={(e) => setForm((f) => ({ ...f, autoRobEnabled: e.target.checked }))}
              className="mt-1 rounded text-[#3a0f34] focus:ring-[#814d75] h-4 w-4"
            />
            <div>
              <div className="text-xs font-semibold text-[#4f444b]">
                Automatically launch RoB batch phase after screening completes
              </div>
              <div className="text-[11px] text-[#62535d] leading-relaxed mt-0.5">
                When background Co-Scientist screening completes for all included studies, automatically select the appropriate tool (RoB 2, ROBINS-I, ROBINS-E, QUADAS-2, NOS) based on study design and pre-fill signaling questions using full text.
              </div>
            </div>
          </label>

          {form.autoRobEnabled && (
            <div className="pt-3 border-t border-[#d2c2cb]/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#4f444b]">Human Review Confidence Threshold</span>
                <span className="font-mono font-bold text-[#3a0f34] bg-[#eee7ec] px-2 py-0.5 rounded border border-[#d2c2cb]">
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
                className="w-full accent-[#3a0f34]"
              />
              <p className="text-[11px] text-[#62535d]">
                Questions where Co-Scientist confidence is below {Math.round(form.robConfidenceThreshold * 100)}% will be flagged with an amber badge for human verification on the RoB assessment page.
              </p>
            </div>
          )}
        </div>

        {/* Next steps preview */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded p-4">
          <p className="text-xs text-[#62535d] mb-3 font-semibold uppercase tracking-wider">After creating the project, you'll set up:</p>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-[#4f444b] font-medium">
              <Target className="h-4 w-4 text-[#814d75]" /> PICO Framework
            </span>
            <span className="text-[#81737b]">→</span>
            <span className="flex items-center gap-1.5 text-[#4f444b] font-medium">
              <Lightbulb className="h-4 w-4 text-[#7c5800]" /> Hypothesis
            </span>
            <span className="text-[#81737b]">→</span>
            <span className="text-[#4f444b] font-medium">Import Studies</span>
          </div>
        </div>

        {mutation.isError && (
          <div className="rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            Error: {(mutation.error as Error).message}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-4 py-2 rounded text-xs font-semibold transition-colors disabled:opacity-50"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Creating..." : "Create Project"}
          </button>
          <Link
            to="/projects"
            className="bg-[#ffffff] text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] px-4 py-2 rounded text-xs font-semibold transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
