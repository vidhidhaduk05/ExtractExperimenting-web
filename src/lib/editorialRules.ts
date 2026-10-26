/**
 * Universal Frontend UI & Editorial Policy
 * 
 * Centralized branding, vocabulary, and patent protection rules for all user-facing surfaces.
 * 
 * Rules:
 * 1. ZERO DISCLOSURE: Patented / proprietary methods and internal model architectures
 *    (Biomni, Laya, Storm) must NEVER be exposed in UI copy, tooltips, buttons, or badges.
 * 2. STANDARDIZED IDENTITY: Always use "Co-Scientist" instead of generic "AI".
 */

export const BRAND_TERMS = {
  CO_SCIENTIST: "Co-Scientist",
  CO_SCIENTIST_WORKSPACE: "Co-Scientist Screening Workspace",
  CO_SCIENTIST_SCREENING: "Co-Scientist Screening",
  CO_SCIENTIST_DECISION: "Co-Scientist Decision",
  CO_SCIENTIST_RECOMMENDATION: "Co-Scientist Recommendation",
  CO_SCIENTIST_CLARIFICATION: "Co-Scientist Clarification Request",
  CO_SCIENTIST_CHECKLIST: "Co-Scientist Screening Clarifications Checklist",
  CO_SCIENTIST_PREFILL: "Co-Scientist Pre-Fill",
  CO_SCIENTIST_VERIFICATION: "Co-Scientist Verification",
  CO_SCIENTIST_REASONING: "Co-Scientist Reasoning",
  CO_SCIENTIST_CLUSTER: "High-throughput Co-Scientist Research Cluster",
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
  result = result.replace(/\bbiomni[-_\s]*(?:r\d+|ai|service)?/gi, "Co-Scientist");
  result = result.replace(/\blaya(?:[-_\s]+(?:system-1|onnx|engine|ai|fast))*/gi, "Co-Scientist");
  result = result.replace(/\bstorm[-_\s]*(?:method|pipeline|research)?/gi, "Co-Scientist");

  // 2. Standardize AI copy to Co-Scientist
  result = result.replace(/\bAI Screening\b/gi, "Co-Scientist Screening");
  result = result.replace(/\bFull AI Screening\b/gi, "Full Co-Scientist Screening");
  result = result.replace(/\bAI Decision\b/gi, "Co-Scientist Decision");
  result = result.replace(/\bAI Recommendation\b/gi, "Co-Scientist Recommendation");
  result = result.replace(/\bAI Clarification\b/gi, "Co-Scientist Clarification");
  result = result.replace(/\bAI Pre-Fill\b/gi, "Co-Scientist Pre-Fill");
  result = result.replace(/\bAI Screener\b/gi, "Co-Scientist Screener");
  result = result.replace(/\bAI-prefill\b/gi, "Co-Scientist prefill");
  result = result.replace(/\bAI-screened\b/gi, "Co-Scientist screened");
  result = result.replace(/\bAI screened\b/gi, "Co-Scientist screened");
  result = result.replace(/\bScreened by AI\b/gi, "Screened by Co-Scientist");
  result = result.replace(/\bAccept All AI\b/gi, "Accept All Co-Scientist Recommendations");

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
