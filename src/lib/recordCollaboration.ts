import { useQuery } from "@tanstack/react-query";
import { getApiBase, shouldUseDemoFallback } from "./api";

export interface RecordAnnotation {
  annotation_id: string;
  study_id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  text: string;
  visibility: "shared" | "private";
  created_at: string;
}
export interface ProjectTag {
  tag_id: string;
  project_id: string;
  name: string;
  archived: boolean;
}
export interface TagIndex {
  tags: ProjectTag[];
  study_tags: Record<string, string[]>;
  can_write: boolean;
}
export interface AnnotationInput {
  text: string;
  visibility: "shared" | "private";
  request_id: string;
}

export function collaborationAvailability(): string | null {
  if (shouldUseDemoFallback()) return "Comments, private notes and shared tags require a connected backend. Connect your backend in Settings.";
  if (!localStorage.getItem("token")) return "Sign in to view comments, private notes and shared tags.";
  return null;
}

// Namespace every cache by backend AND signed-in session, including private notes.
export function collaborationKey(projectId: string, studyId?: string) {
  return ["record-collaboration", getApiBase(), localStorage.getItem("token"), projectId, ...(studyId ? [studyId] : [])];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const unavailable = collaborationAvailability();
  if (unavailable) throw new Error(unavailable);
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = typeof error.detail === "string" ? error.detail : `Request failed (${response.status}). Please retry.`;
    throw new Error(detail);
  }
  return response.json();
}
const segment = encodeURIComponent;
export const recordCollaboration = {
  listTags: (projectId: string) => request<TagIndex>(`/projects/${segment(projectId)}/tags`),
  createTag: (projectId: string, name: string) => request<ProjectTag>(`/projects/${segment(projectId)}/tags`, {
    method: "POST", body: JSON.stringify({ name }),
  }),
  updateTag: (projectId: string, tagId: string, changes: { name?: string; archived?: boolean }) =>
    request<ProjectTag>(`/projects/${segment(projectId)}/tags/${segment(tagId)}`, {
      method: "PATCH", body: JSON.stringify(changes),
    }),
  setTag: (studyId: string, tagId: string, attached: boolean) =>
    request(`/studies/${segment(studyId)}/tags/${segment(tagId)}`, { method: attached ? "PUT" : "DELETE" }),
  listAnnotations: (studyId: string) => request<{ annotations: RecordAnnotation[]; can_write: boolean }>(`/studies/${segment(studyId)}/annotations`),
  addAnnotation: (studyId: string, body: AnnotationInput) => request<RecordAnnotation>(`/studies/${segment(studyId)}/annotations`, {
    method: "POST", body: JSON.stringify(body),
  }),
};

export function useProjectTags(projectId: string | undefined) {
  return useQuery({
    queryKey: collaborationKey(projectId || ""),
    queryFn: () => recordCollaboration.listTags(projectId!),
    enabled: !!projectId && !collaborationAvailability(),
    retry: false, refetchInterval: 15000,
  });
}

export function matchesTag(index: TagIndex | undefined, studyId: string, tagId: string): boolean {
  return !tagId || !!index?.study_tags[studyId]?.includes(tagId);
}
