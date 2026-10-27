// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./utils";

describe("sanitizeSvg", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeSvg("")).toBe("");
  });

  it("leaves clean SVG untouched", () => {
    const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red" /></svg>`;
    const result = sanitizeSvg(cleanSvg);
    expect(result).toContain("<circle");
    expect(result).toContain('fill="red"');
  });

  it("strips <script> tags from SVG", () => {
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script><circle cx="50" cy="50" r="40"/></svg>`;
    const result = sanitizeSvg(maliciousSvg);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<circle");
  });

  it("strips inline event handler attributes (e.g. onload, onerror, onclick)", () => {
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="100" height="100" onclick="doSomething()"/></svg>`;
    const result = sanitizeSvg(maliciousSvg);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onclick");
    expect(result).toContain("<rect");
  });

  it("strips javascript: and data: URIs in href / xlink:href attributes", () => {
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click me</text></a><image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" /></svg>`;
    const result = sanitizeSvg(maliciousSvg);
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:");
  });

  it("strips <foreignObject> tags", () => {
    const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><iframe src="javascript:alert(1)"></iframe></foreignObject><circle cx="50" cy="50" r="40"/></svg>`;
    const result = sanitizeSvg(maliciousSvg);
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("iframe");
    expect(result).toContain("<circle");
  });
});
