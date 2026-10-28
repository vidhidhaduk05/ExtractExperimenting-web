import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type StorageStatus } from "../../lib/api";
import { HardDrive, Pencil, Check, X, FolderInput, Loader2, AlertTriangle } from "lucide-react";

/**
 * Storage settings card for the dashboard: shows the single data directory
 * (Zotero-style — everything lives in one folder), free disk space, project
 * count, and a writable/problem dot. Lets the user change the folder and
 * move everything over. No automatic backup machinery: one static line tells
 * the user the folder holds all their data.
 */
export function StorageSettingsCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [migrateOffered, setMigrateOffered] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["storage-settings"],
    queryFn: api.getStorageSettings,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["storage-settings"] });

  const putMutation = useMutation({
    mutationFn: (root: string) => api.updateStorageRoot(root),
    onSuccess: (updated: StorageStatus) => {
      invalidate();
      setEditing(false);
      setMigrateOffered(true);
      setActionMessage(
        updated.message || "Folder updated. Existing files stay in the old folder. Use Move to transfer them."
      );
    },
    onError: (err: Error) => setActionMessage(err.message),
  });

  const migrateMutation = useMutation({
    mutationFn: (target: string) => api.migrateStorage(target),
    onSuccess: (updated: StorageStatus) => {
      invalidate();
      setMigrateOffered(false);
      setActionMessage(
        `Moved ${updated.files_copied ?? 0} files to the new folder. The old folder is untouched.`
      );
    },
    onError: (err: Error) => setActionMessage(err.message),
  });

  if (isLoading) {
    return (
      <div className="bg-white border border-[#d2c2cb] rounded-lg p-4 shadow-2xs flex items-center gap-2 text-sm text-[#72636d]">
        <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" /> Checking storage folder...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="bg-white border border-[#d2c2cb] rounded-lg p-4 shadow-2xs text-sm text-[#4f444b]">
        <div className="flex items-center gap-2 font-semibold text-[#3a0f34]">
          <HardDrive className="h-4 w-4 text-[#814d75]" /> Storage
        </div>
        <p className="text-xs text-[#62535d] mt-1">
          Cannot reach the backend to read storage settings: {(error as Error)?.message || "no response"}
        </p>
      </div>
    );
  }

  const dotColor = data.writable ? "bg-emerald-500" : "bg-amber-500";
  const dotLabel = data.writable ? "Writable" : "Problem";

  const startEditing = () => {
    setPathInput(data.storage_root);
    setEditing(true);
    setActionMessage("");
  };

  const submitChange = () => {
    if (pathInput.trim() && pathInput.trim() !== data.storage_root) {
      putMutation.mutate(pathInput.trim());
    } else {
      setEditing(false);
    }
  };

  return (
    <div className="bg-white border border-[#d2c2cb] rounded-lg p-4 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-[#3a0f34] text-sm">
          <HardDrive className="h-4 w-4 text-[#814d75]" /> Storage
          <span className="flex items-center gap-1.5 text-[11px] font-normal text-[#62535d]">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden /> {dotLabel}
          </span>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#814d75] hover:text-[#3a0f34]"
          >
            <Pencil className="h-3 w-3" /> Change folder
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-1">
          <p className="text-xs text-[#4f444b] font-mono break-all bg-[#fbf9f4] border border-[#d2c2cb] rounded px-2 py-1.5">
            {data.storage_root}
          </p>
          <p className="text-[11px] text-[#72636d]">
            {data.disk_free_gb != null ? <>Free disk space: {data.disk_free_gb} GB &middot; </> : null}
            Projects: {data.project_count}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-[#3a0f34]" htmlFor="storage-root-input">
            Data folder (absolute path)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="storage-root-input"
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/home/you/STUDY DATA/PROJECTS"
              className="flex-1 text-xs font-mono border border-[#d2c2cb] rounded px-2 py-1.5 focus:outline-none focus:border-[#814d75]"
            />
            <button
              type="button"
              onClick={submitChange}
              disabled={putMutation.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] disabled:opacity-50"
            >
              {putMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1.5 rounded text-[#72636d] hover:text-[#3a0f34]"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {putMutation.isError && (
            <p role="alert" className="text-[11px] text-red-600">{putMutation.error.message}</p>
          )}
        </div>
      )}

      {migrateOffered && !migrateMutation.isPending && (
        <div className="flex items-center gap-2 border border-[#d2c2cb] bg-[#fbf9f4] rounded px-2.5 py-2">
          <FolderInput className="h-4 w-4 text-[#814d75] shrink-0" />
          <span className="text-[11px] text-[#4f444b] flex-1">
            Move everything (files + database) from the old folder into this one?
          </span>
          <button
            type="button"
            onClick={() => migrateMutation.mutate(data.storage_root)}
            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017]"
          >
            Move everything
          </button>
          <button
            type="button"
            onClick={() => setMigrateOffered(false)}
            className="px-2 py-1 rounded text-[11px] text-[#72636d] hover:text-[#3a0f34]"
          >
            Later
          </button>
        </div>
      )}

      {migrateMutation.isPending && (
        <div className="flex items-center gap-2 text-[11px] text-[#62535d]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#814d75]" /> Copying files and database...
        </div>
      )}

      {migrateMutation.isError && (
        <p role="alert" className="flex items-center gap-1.5 text-[11px] text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {migrateMutation.error.message}
        </p>
      )}

      {actionMessage && (
        <p className="text-[11px] text-[#4f444b] bg-[#fbf9f4] border border-[#d2c2cb] rounded px-2 py-1.5">
          {actionMessage}
        </p>
      )}

      <p className="text-[11px] text-[#72636d]">
        This folder contains all your data — copy it elsewhere to back up.
      </p>
    </div>
  );
}
