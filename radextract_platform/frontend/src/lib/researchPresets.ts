import presets from '../data/research_presets.json';

export interface ResearchPreset {
  id: string;
  label: string;
  question: string;
  claim: string;
  query: string;
  sources: readonly string[];
  verification: {
    checked: string;
    database: string;
    queryExcludesNarrativeCommentary: boolean;
    matches: number;
    samplePmids: readonly string[];
    warnings: Record<string, unknown>;
  };
}

/** Verified PubMed search scopes, not clinical findings or preassigned verdicts. */
export const RESEARCH_PRESETS: readonly ResearchPreset[] = presets;

export function findResearchPreset(text: string): ResearchPreset | undefined {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalized = normalize(text);
  return RESEARCH_PRESETS.find(preset => normalize(preset.question) === normalized || normalize(preset.claim) === normalized || normalize(preset.id) === normalized);
}
