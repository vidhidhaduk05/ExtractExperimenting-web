import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./sanitize";

describe("sanitizeSvg", () => {
  it("returns empty string when given null or empty input", () => {
    expect(sanitizeSvg("")).toBe("");
    // @ts-expect-error testing invalid input
    expect(sanitizeSvg(null)).toBe("");
  });

  it("preserves valid SVG content", () => {
    const validSvg = `<svg width="100" height="100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow"></circle></svg>`;
    const sanitized = sanitizeSvg(validSvg);
    expect(sanitized).toContain('width="100"');
    expect(sanitized).toContain("<circle");
    expect(sanitized).not.toContain("<script");
  });

  it("strips script tags embedded in SVG", () => {
    const maliciousSvg = `<svg><script>alert('xss')</script><rect width="10" height="10"/></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("alert");
    expect(sanitized).toContain("<rect");
  });

  it("strips inline event attributes like onload or onclick", () => {
    const maliciousSvg = `<svg onload="alert(1)"><rect onclick="javascript:alert(2)" width="10" height="10"/></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("alert");
  });

  it("strips dangerous URI schemes in href and src attributes", () => {
    const maliciousSvg = `<svg><a href="javascript:alert('xss')"><text>Click me</text></a></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert");
  });

  it("removes disallowed tags like iframe, object, embed, foreignObject", () => {
    const maliciousSvg = `<svg><iframe></iframe><foreignObject><div>test</div></foreignObject></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("iframe");
    expect(sanitized).not.toContain("foreignObject");
    expect(sanitized).not.toContain("foreignobject");
  });

  it("removes SVG animation tags and style elements", () => {
    const maliciousSvg = `<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(1)"/><style>@import 'javascript:alert(1)'</style><rect width="10" height="10"/></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("animate");
    expect(sanitized).not.toContain("set");
    expect(sanitized).not.toContain("style");
    expect(sanitized).toContain("<rect");
  });

  it("strips obfuscated javascript URIs containing tabs, newlines or control characters", () => {
    const maliciousSvg = `<svg><a href=" java\tscript:alert('xss')"><text>Click</text></a></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("java\tscript");
    expect(sanitized).not.toContain("alert");
  });

  it("strips dangerous data URIs like data:image/svg+xml or data:text/html", () => {
    const maliciousSvg = `<svg><a href="data:image/svg+xml;utf8,<svg onload=alert(1)>"><text>Click</text></a></svg>`;
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain("data:image/svg+xml");
    expect(sanitized).not.toContain("alert");
  });
});
