import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./utils";

describe("sanitizeSvg", () => {
  it("preserves valid SVG markup", () => {
    const validSvg = `<svg width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="red"/></svg>`;
    const sanitized = sanitizeSvg(validSvg);
    expect(sanitized).toContain("<svg");
    expect(sanitized).toContain("<rect");
    expect(sanitized).toContain('fill="red"');
  });

  it("strips script tags and executable content", () => {
    const maliciousSvg = `<svg><script>alert('xss')</script><circle cx="50" cy="50" r="40"/></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).toContain("<circle");
  });

  it("removes inline event handlers like onload, onerror, onclick", () => {
    const maliciousSvg = `<svg onload="alert('xss')" onerror="console.log('err')"><rect onclick="evil()" x="0" y="0" width="10" height="10"/></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).toContain("<rect");
  });

  it("removes dangerous URIs in href or xlink:href", () => {
    const maliciousSvg = `<svg><a href="javascript:alert('xss')"><text>Click</text></a></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("javascript:");
  });

  it("handles empty or falsy inputs gracefully", () => {
    expect(sanitizeSvg("")).toBe("");
  });
});
