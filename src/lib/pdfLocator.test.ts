import { describe, it, expect } from "vitest";
import {
  locateQuoteRects,
  parseTargetPage,
  type PercentRect,
} from "./pdfLocator";

function createMockPage(rawItems: Array<{ str: string; x: number; y: number; width: number; height: number }>, width = 600, height = 800) {
  return {
    getTextContent: async () => ({
      items: rawItems.map((item) => ({
        str: item.str,
        transform: [1, 0, 0, item.height, item.x, item.y],
        width: item.width,
        height: item.height,
      })),
    }),
    getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
      width: width * scale,
      height: height * scale,
    }),
  };
}

describe("pdfLocator - Academic PDF Text & Quote Spatial Locator", () => {
  it("should parse various target page representations correctly", () => {
    expect(parseTargetPage(1)).toBe(1);
    expect(parseTargetPage(3)).toBe(3);
    expect(parseTargetPage("Page 2")).toBe(2);
    expect(parseTargetPage("p. 4")).toBe(4);
    expect(parseTargetPage("Section 3, page 5")).toBe(5);
    expect(parseTargetPage("unknown page", 1)).toBe(1);
  });

  it("should locate exact quote across simulated PDF text items and return percent rects", async () => {
    // Simulated PDF page (width: 600, height: 800)
    // In PDF.js coordinate system: y=0 is bottom, y=800 is top
    const mockPage = createMockPage([
      { str: "Title of Academic Paper", x: 50, y: 750, width: 200, height: 12 },
      { str: "A 45-year-old female presented with sudden headache.", x: 50, y: 700, width: 300, height: 10 },
      { str: "Diagnostic DSA demonstrated pure arterial malformation", x: 50, y: 680, width: 320, height: 10 },
      { str: "involving the posterior cerebral artery.", x: 50, y: 660, width: 250, height: 10 },
    ]);

    const rects = await locateQuoteRects(
      mockPage,
      "Diagnostic DSA demonstrated pure arterial malformation involving the posterior cerebral artery."
    );

    expect(rects.length).toBeGreaterThan(0);

    // Verify all rectangles are within 0-100% bounds
    rects.forEach((rect) => {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.left).toBeLessThanOrEqual(100);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.top).toBeLessThanOrEqual(100);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    });
  });

  it("should support prefix fuzzy matching when LLM quote has trailing words", async () => {
    const mockPage = createMockPage([
      { str: "The patient underwent successful endovascular coiling.", x: 50, y: 600, width: 310, height: 10 },
      { str: "Postoperative course was uneventful without deficits.", x: 50, y: 580, width: 290, height: 10 },
    ]);

    // Quote with slight trailing mismatch
    const rects = await locateQuoteRects(
      mockPage,
      "The patient underwent successful endovascular coiling and was discharged in good condition."
    );

    expect(rects.length).toBeGreaterThan(0);
  });

  it("should return empty array gracefully when quote is completely absent", async () => {
    const mockPage = createMockPage([
      { str: "Introduction to neuroscience", x: 50, y: 700, width: 200, height: 10 },
    ]);

    const rects = await locateQuoteRects(
      mockPage,
      "completely missing quote that does not exist anywhere in text"
    );

    expect(rects).toEqual([]);
  });
});
