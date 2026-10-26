import { describe, it, expect } from "vitest";
import {
  BRAND_TERMS,
  FORBIDDEN_PATENTED_TERMS,
  sanitizeUiCopy,
  validateNoForbiddenTerms,
} from "./editorialRules";

describe("Universal Editorial Rules & Patent Secrecy Guard", () => {
  it("defines core Co-Scientist brand terms", () => {
    expect(BRAND_TERMS.CO_SCIENTIST).toBe("Co-Scientist");
    expect(BRAND_TERMS.CO_SCIENTIST_WORKSPACE).toBe("Co-Scientist Screening Workspace");
    expect(BRAND_TERMS.CO_SCIENTIST_SCREENING).toBe("Co-Scientist Screening");
    expect(BRAND_TERMS.CO_SCIENTIST_DECISION).toBe("Co-Scientist Decision");
  });

  it("lists all forbidden patented method names", () => {
    expect(FORBIDDEN_PATENTED_TERMS).toContain("biomni");
    expect(FORBIDDEN_PATENTED_TERMS).toContain("laya");
    expect(FORBIDDEN_PATENTED_TERMS).toContain("storm");
  });

  describe("validateNoForbiddenTerms", () => {
    it("approves clean copy using Co-Scientist vocabulary", () => {
      const cleanText = "Co-Scientist Screening Decision & Rapid Inference";
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
    it("redacts internal engine names to Co-Scientist", () => {
      expect(sanitizeUiCopy("Powered by Biomni-R0")).toBe("Powered by Co-Scientist");
      expect(sanitizeUiCopy("Laya System-1 ONNX Model")).toBe("Co-Scientist Model");
      expect(sanitizeUiCopy("Storm research synthesis")).toBe("Co-Scientist synthesis");
    });

    it("replaces generic AI labels with Co-Scientist", () => {
      expect(sanitizeUiCopy("AI Screening Workspace")).toBe("Co-Scientist Screening Workspace");
      expect(sanitizeUiCopy("Start Full AI Screening")).toBe("Start Full Co-Scientist Screening");
      expect(sanitizeUiCopy("AI Decision:")).toBe("Co-Scientist Decision:");
      expect(sanitizeUiCopy("AI Recommendation:")).toBe("Co-Scientist Recommendation:");
      expect(sanitizeUiCopy("AI Screening Clarifications Checklist")).toBe("Co-Scientist Screening Clarifications Checklist");
      expect(sanitizeUiCopy("Accept All AI")).toBe("Accept All Co-Scientist Recommendations");
    });
  });
});
