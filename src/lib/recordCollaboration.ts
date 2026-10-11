import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface ProjectTag {
  tag_id: string;
  project_id: string;
  study_id: string;
  tag_name: string;
  color?: string;
}

export function matchesTag(
  tags: ProjectTag[] | undefined,
  studyId: string,
  filterTag: string
): boolean {
  if (!filterTag || filterTag.trim() === "") return true;
  if (!tags || tags.length === 0) return false;
  return tags.some(
    (t) => t.study_id === studyId && t.tag_name.toLowerCase() === filterTag.toLowerCase()
  );
}

export function useProjectTags(projectId?: string) {
  return useQuery<ProjectTag[]>({
    queryKey: ["project-tags", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      try {
        const res = await (api as any).getProjectTags?.(projectId);
        return res || [];
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
  });
}
