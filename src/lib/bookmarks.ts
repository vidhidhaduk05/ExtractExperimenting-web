import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiBase, shouldUseDemoFallback } from "./api";

// JWT subject is only a cache namespace. The server verifies identity and access.
export function bookmarkScope(): string {
  if (shouldUseDemoFallback()) return `demo:${localStorage.getItem("username") || "guest"}`;
  try {
    const part = (localStorage.getItem("token") || "").split(".")[1];
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return `user:${payload.sub || "unknown"}`;
  } catch { return "anonymous"; }
}

function localKey(projectId: string): string {
  return `radextract_bookmarks:${bookmarkScope()}:${projectId}`;
}

async function bookmarkRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) {
    throw new Error("Sign in to view and save bookmarks.");
  }
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Bookmarks could not be saved. Please retry.");
  }
  return response.json();
}

export async function listBookmarks(projectId: string): Promise<string[]> {
  if (shouldUseDemoFallback()) {
    const saved = JSON.parse(localStorage.getItem(localKey(projectId)) || "[]");
    if (!Array.isArray(saved) || saved.some(id => typeof id !== "string")) {
      throw new Error("Saved bookmarks could not be read.");
    }
    return [...new Set(saved)];
  }
  const result = await bookmarkRequest<{ study_ids: string[] }>(`/projects/${encodeURIComponent(projectId)}/bookmarks`);
  return result.study_ids;
}

export async function saveBookmark(projectId: string, studyId: string, bookmarked: boolean): Promise<void> {
  if (shouldUseDemoFallback()) {
    const ids = new Set(await listBookmarks(projectId));
    if (bookmarked) ids.add(studyId); else ids.delete(studyId);
    localStorage.setItem(localKey(projectId), JSON.stringify([...ids]));
    return;
  }
  await bookmarkRequest(`/studies/${encodeURIComponent(studyId)}/bookmark`, {
    method: "PUT", body: JSON.stringify({ bookmarked }),
  });
}

export function useBookmarks(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const scope = bookmarkScope();
  const key = ["bookmarks", getApiBase(), scope, projectId];
  const enabled = !!projectId && (shouldUseDemoFallback() || !!localStorage.getItem("token"));
  const query = useQuery({ queryKey: key, queryFn: () => listBookmarks(projectId!), enabled, retry: false });
  const mutation = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => saveBookmark(projectId!, id, saved),
    onSuccess: (_, { id, saved }) => queryClient.setQueryData<string[]>(key, (previous = []) =>
      saved ? [...new Set([...previous, id])] : previous.filter(value => value !== id)),
    onSettled: () => { busy.current = false; },
  });
  return {
    ids: query.data || [],
    disabled: !enabled || !query.isSuccess || mutation.isPending,
    local: shouldUseDemoFallback(),
    error: !enabled ? "Sign in to save studies for later." : (mutation.error || query.error)?.message,
    retry: () => { mutation.reset(); void query.refetch(); },
    toggle: (id: string) => {
      if (!enabled || !query.isSuccess || busy.current) return;
      busy.current = true;
      mutation.mutate({ id, saved: !query.data.includes(id) });
    },
  };
}
