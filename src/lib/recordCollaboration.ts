export function useProjectTags(_projectId?: string) {
  return { data: {} };
}

export function matchesTag(_data: any, _studyId: string, tagFilter: string) {
  if (!tagFilter) return true;
  return true;
}
