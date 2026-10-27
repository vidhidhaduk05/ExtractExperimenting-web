import { describe, it, expect } from "vitest";
import {
  BRAND_TERMS,
  FORBIDDEN_PATENTED_TERMS,
  sanitizeUiCopy,
  validateNoForbiddenTerms,
} from "./editorialRules";

describe("Universal Editorial Rules & Patent Secrecy Guard", () => {
  it("defines core AI Reviewer brand terms", () => {
    expect(BRAND_TERMS.CO_SCIENTIST).toBe("AI Reviewer");
    expect(BRAND_TERMS.CO_SCIENTIST_WORKSPACE).toBe("Systematic Screening Workspace");
    expect(BRAND_TERMS.CO_SCIENTIST_SCREENING).toBe("AI Screening");
    expect(BRAND_TERMS.CO_SCIENTIST_DECISION).toBe("AI Decision");
  });

  it("lists all forbidden patented method names", () => {
    expect(FORBIDDEN_PATENTED_TERMS).toContain("biomni");
    expect(FORBIDDEN_PATENTED_TERMS).toContain("laya");
    expect(FORBIDDEN_PATENTED_TERMS).toContain("storm");
  });

  describe("validateNoForbiddenTerms", () => {
    it("approves clean copy using AI Reviewer vocabulary", () => {
      const cleanText = "AI Screening Decision & Rapid Inference";
      const result = validateNoForbiddenTerms(cleanText);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("flags patented Biomni references", () => {
      const result = validateNoForbiddenTerms("Biomni AI Clarification Request");
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("biomni");
    });

    it("flags patented Laya references", () => {
      const result = validateNoForbiddenTerms("Auto-Recorded by Laya System-1");
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("laya");
    });

    it("flags patented Storm references", () => {
      const result = validateNoForbiddenTerms("Synthesizing literature via STORM method");
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("storm");
    });
  });

  describe("sanitizeUiCopy", () => {
    it("redacts internal engine names to AI Reviewer", () => {
      expect(sanitizeUiCopy("Powered by Biomni-R0")).toBe("Powered by AI Reviewer");
      expect(sanitizeUiCopy("Laya System-1 ONNX Model")).toBe("AI Reviewer Model");
      expect(sanitizeUiCopy("Storm research synthesis")).toBe("AI Reviewer synthesis");
    });

    it("replaces generic AI labels with AI Reviewer", () => {
      expect(sanitizeUiCopy("AI Screening Workspace")).toBe("Systematic Screening Workspace");
      expect(sanitizeUiCopy("Start Full AI Screening")).toBe("Start Full AI Screening");
      expect(sanitizeUiCopy("AI Decision:")).toBe("AI Decision:");
      expect(sanitizeUiCopy("AI Recommendation:")).toBe("AI Reviewer Recommendation:");
      expect(sanitizeUiCopy("AI Screening Clarifications Checklist")).toBe("AI Screening Clarifications Checklist");
      expect(sanitizeUiCopy("Accept All AI")).toBe("Accept All AI Reviewer Recommendations");
    });
  });
});
