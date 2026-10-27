/**
 * Universal Frontend UI & Editorial Policy
 * 
 * Centralized branding, vocabulary, and patent protection rules for all user-facing surfaces.
 * 
 * Rules:
 * 1. ZERO DISCLOSURE: Patented / proprietary methods and internal model architectures
 *    (Biomni, Laya, Storm) must NEVER be exposed in UI copy, tooltips, buttons, or badges.
 * 2. STANDARDIZED IDENTITY: Always use "AI Reviewer" instead of generic "AI".
 */

export const BRAND_TERMS = {
  CO_SCIENTIST: "AI Reviewer",
  CO_SCIENTIST_WORKSPACE: "Systematic Screening Workspace",
  CO_SCIENTIST_SCREENING: "AI Screening",
  CO_SCIENTIST_DECISION: "AI Decision",
  CO_SCIENTIST_RECOMMENDATION: "AI Reviewer Recommendation",
  CO_SCIENTIST_CLARIFICATION: "AI Reviewer Clarification Request",
  CO_SCIENTIST_CHECKLIST: "AI Screening Clarifications Checklist",
  CO_SCIENTIST_PREFILL: "AI Reviewer Pre-Fill",
  CO_SCIENTIST_VERIFICATION: "AI Reviewer Verification",
  CO_SCIENTIST_REASONING: "AI Reviewer Reasoning",
  CO_SCIENTIST_CLUSTER: "High-throughput AI Reviewer Research Cluster",
} as const;

export const FORBIDDEN_PATENTED_TERMS = [
  "biomni",
  "laya",
  "storm",
] as const;

/**
 * Universal Sanitizer: Guarantees that even unreviewed or dynamic text
 * is automatically cleansed of patented method names and generic AI labels
 * before rendering on screen.
 */
export function sanitizeUiCopy(text: string): string {
  if (!text) return text;
  let result = text;

  // 1. Redact / replace internal patented engine names
  result = result.replace(/\bbiomni[-_\s]*(?:r\d+|ai|service)?/gi, "AI Reviewer");
  result = result.replace(/\blaya[-_\s]*(?:system-1|onnx|model|engine|ai|fast)?/gi, "AI Reviewer");
  result = result.replace(/\bstorm[-_\s]*(?:method|pipeline|research)?/gi, "AI Reviewer");

  // 2. Standardize AI copy to AI Reviewer
  result = result.replace(/\bAI Screening\b/gi, "AI Screening");
  result = result.replace(/\bFull AI Screening\b/gi, "Full AI Screening");
  result = result.replace(/\bAI Decision\b/gi, "AI Decision");
  result = result.replace(/\bAI Recommendation\b/gi, "AI Reviewer Recommendation");
  result = result.replace(/\bAI Clarification\b/gi, "AI Reviewer Clarification");
  result = result.replace(/\bAI Pre-Fill\b/gi, "AI Reviewer Pre-Fill");
  result = result.replace(/\bAI Screener\b/gi, "AI Reviewer Screener");
  result = result.replace(/\bAI-prefill\b/gi, "AI Reviewer prefill");
  result = result.replace(/\bAI-screened\b/gi, "AI Reviewer screened");
  result = result.replace(/\bAI screened\b/gi, "AI Reviewer screened");
  result = result.replace(/\bScreened by AI\b/gi, "Screened by AI Reviewer");
  result = result.replace(/\bAccept All AI\b/gi, "Accept All AI Reviewer Recommendations");

  return result;
}

/**
 * Audit validator: Checks whether any forbidden term is present in a string.
 */
export function validateNoForbiddenTerms(text: string): { valid: boolean; violations: string[] } {
  if (!text) return { valid: true, violations: [] };
  const lower = text.toLowerCase();
  const violations = FORBIDDEN_PATENTED_TERMS.filter((term) => lower.includes(term));
  return { valid: violations.length === 0, violations };
}
