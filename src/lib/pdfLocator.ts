/**
 * RadExtract PDF Text & Quote Spatial Locator
 * Adapted from AIDE-Web (AI-Assisted Data Extraction) by Noah Schroeder
 * Locates verbatim source quotes across PDF.js page text items and returns
 * percentage-based bounding rectangles (0-100%) that scale across zoom levels.
 */

export interface PercentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const LINE_Y_TOLERANCE = 3;
const COLUMN_GAP_THRESHOLD = 0.08;
const COLUMN_LINE_RATIO = 0.3;
const FUZZY_PREFIX_WORDS = 8; // fallback prefix word count for truncated LLM quotes
const UNICODE_HYPHEN_REGEX = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/;

/**
 * Maps raw PDF.js text items into normalized coordinate records.
 */
function mapTextItems(rawItems: any[]): TextItem[] {
  return rawItems
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
      height: item.height || Math.abs(item.transform[3]) || 10,
    }));
}

/**
 * Clusters text items into visual lines by vertical y-proximity.
 */
function clusterItemsIntoLines(items: TextItem[]): TextItem[][] {
  if (items.length === 0) return [];
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextItem[][] = [];
  let currentLine: TextItem[] = [items[0]];

  for (let i = 1; i < items.length; i++) {
    const prevY = currentLine[0].y;
    if (Math.abs(items[i].y - prevY) <= LINE_Y_TOLERANCE) {
      currentLine.push(items[i]);
    } else {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
      currentLine = [items[i]];
    }
  }
  currentLine.sort((a, b) => a.x - b.x);
  lines.push(currentLine);
  return lines;
}

/**
 * Detects the column midpoint of academic 2-column layouts.
 */
function getReadingOrderedLines(items: TextItem[], pageWidth: number): TextItem[][] {
  if (items.length === 0) return [];

  const lines = clusterItemsIntoLines(items);
  const mid = pageWidth / 2;

  // Detect whether page has multi-column content
  const col1Lines: TextItem[][] = [];
  const col2Lines: TextItem[][] = [];
  for (const l of lines) {
    const minX = l[0].x;
    const maxX = l[l.length - 1].x + l[l.length - 1].width;
    if (maxX < mid + 15) {
      col1Lines.push(l);
    } else if (minX > mid - 15) {
      col2Lines.push(l);
    }
  }

  const isMultiCol = col1Lines.length >= 3 && col2Lines.length >= 3;
  if (!isMultiCol) {
    return lines;
  }

  // Compute Y bounds in a single pass O(1) space to prevent call-stack overflow on large PDFs
  let colYMin = Infinity;
  let colYMax = -Infinity;
  for (let i = 0; i < col1Lines.length; i++) {
    const y = col1Lines[i][0].y;
    if (y < colYMin) colYMin = y;
    if (y > colYMax) colYMax = y;
  }
  for (let i = 0; i < col2Lines.length; i++) {
    const y = col2Lines[i][0].y;
    if (y < colYMin) colYMin = y;
    if (y > colYMax) colYMax = y;
  }

  const topSpanning: TextItem[][] = [];
  const leftLines: TextItem[][] = [];
  const rightLines: TextItem[][] = [];
  const bottomSpanning: TextItem[][] = [];

  for (const l of lines) {
    const minX = l[0].x;
    const maxX = l[l.length - 1].x + l[l.length - 1].width;

    // Check if line spans across center
    if (minX < mid - 30 && maxX > mid + 30) {
      // Check for column gap near center
      let hasGap = false;
      for (let j = 1; j < l.length; j++) {
        const gap = l[j].x - (l[j - 1].x + l[j - 1].width);
        const gapMid = (l[j - 1].x + l[j - 1].width + l[j].x) / 2;
        if (gap >= 12 && Math.abs(gapMid - mid) < pageWidth * 0.15) {
          hasGap = true;
          break;
        }
      }

      if (hasGap) {
        const lItems = l.filter((it) => it.x + it.width / 2 < mid);
        const rItems = l.filter((it) => it.x + it.width / 2 >= mid);
        if (lItems.length > 0) leftLines.push(lItems);
        if (rItems.length > 0) rightLines.push(rItems);
      } else {
        // Continuous spanning line (e.g. title/abstract at top or reference/footer at bottom)
        // In PDF.js, y increases upwards (top is higher y, bottom is lower y)
        if (l[0].y >= colYMax - 5) {
          topSpanning.push(l);
        } else if (l[0].y <= colYMin + 5) {
          bottomSpanning.push(l);
        } else {
          topSpanning.push(l);
        }
      }
    } else if (maxX < mid + 30) {
      leftLines.push(l);
    } else {
      rightLines.push(l);
    }
  }

  return [...topSpanning, ...leftLines, ...rightLines, ...bottomSpanning];
}

/**
 * Normalizes text for robust matching:
 * straightens quotes, removes hyphenated line breaks, collapses whitespace, lowercases.
 */
export function normalizeForMatch(str: string): string {
  return str
    .replace(/\ufffe/g, "")
    .replace(/\u00ad/g, "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/-\s+/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds a normalized index mapping each character back to its source TextItem.
 */
function buildNormalizedIndex(orderedLines: TextItem[][]): { normText: string; normOwners: (TextItem | null)[] } {
  const rawChars: Array<{ ch: string; item: TextItem | null }> = [];
  let first = true;
  for (const line of orderedLines) {
    for (const item of line) {
      if (!first) rawChars.push({ ch: " ", item: null });
      first = false;
      for (const ch of item.str) rawChars.push({ ch, item });
    }
  }

  let normText = "";
  const normOwners: (TextItem | null)[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < rawChars.length; i++) {
    let { ch, item } = rawChars[i];

    // Strip soft-hyphens, PDF ligature break artifacts (\ufffe, \u00ad)
    if (ch === "\ufffe" || ch === "\u00ad") {
      continue;
    }

    if (ch === "‘" || ch === "’" || ch === "‚" || ch === "‛") ch = "'";
    else if (ch === "“" || ch === "”" || ch === "„" || ch === "‟") ch = '"';
    else if (UNICODE_HYPHEN_REGEX.test(ch)) ch = "-";

    // Rejoin hyphenated line breaks
    if (ch === "-" && i + 1 < rawChars.length && /\s/.test(rawChars[i + 1].ch)) {
      i++;
      while (i + 1 < rawChars.length && /\s/.test(rawChars[i + 1].ch)) i++;
      continue;
    }

    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      normText += " ";
      normOwners.push(null);
      lastWasSpace = true;
    } else {
      normText += ch.toLowerCase();
      normOwners.push(item);
      lastWasSpace = false;
    }
  }

  return { normText, normOwners };
}

/**
 * Converts matched items into visual lines and returns percentage rectangles (0-100%).
 */
function itemsToPercentRects(items: TextItem[], viewport: any): PercentRect[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const clusters: TextItem[][] = [];
  let current: TextItem[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - current[0].y) <= LINE_Y_TOLERANCE) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  const rects: PercentRect[] = [];
  for (const cluster of clusters) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of cluster) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.width);
      maxY = Math.max(maxY, it.y + it.height);
    }
    let left: number;
    let top: number;
    let width: number;
    let height: number;

    if (typeof viewport.convertToViewportPoint === "function") {
      const [x1, y1] = viewport.convertToViewportPoint(minX, minY);
      const [x2, y2] = viewport.convertToViewportPoint(maxX, maxY);
      left = Math.min(x1, x2);
      top = Math.min(y1, y2);
      width = Math.abs(x1 - x2);
      height = Math.abs(y1 - y2);
    } else {
      left = minX;
      top = Math.max(0, viewport.height - maxY);
      width = maxX - minX;
      height = maxY - minY;
    }

    const finalLeft = Math.max(0, Math.min(100, (left / viewport.width) * 100));
    const finalTop = Math.max(0, Math.min(100, (top / viewport.height) * 100));
    const finalWidth = Math.max(0.5, Math.min(100 - finalLeft, (width / viewport.width) * 100));
    const finalHeight = Math.max(0.5, Math.min(100 - finalTop, (height / viewport.height) * 100));

    rects.push({
      left: finalLeft,
      top: finalTop,
      width: finalWidth,
      height: finalHeight,
    });
  }
  return rects;
}

/**
 * Locates an evidence quote on a rendered PDF page and returns bounding rectangles as percentages.
 */
export async function locateQuoteRects(page: any, quote: string): Promise<PercentRect[]> {
  if (!quote) return [];
  const trimmed = quote.trim();
  if (!trimmed || /^(not found|n\/a|unreported)$/i.test(trimmed)) return [];

  // Edge case: handle quotes ending in ellipses often used in LLM truncation
  const cleanQuote = trimmed.replace(/\.{3,}$|…$/, '').trim();

  const textContent = await page.getTextContent();
  const items = mapTextItems(textContent.items);
  if (items.length === 0) return [];

  const viewport = page.getViewport({ scale: 1 });
  const orderedLines = getReadingOrderedLines(items, viewport.width);
  const { normText, normOwners } = buildNormalizedIndex(orderedLines);

  const normQuote = normalizeForMatch(cleanQuote);
  if (!normQuote) return [];

  // 1. Try exact match
  let idx = normText.indexOf(normQuote);
  let matchLen = normQuote.length;

  // 2. Fall back to progressive prefix matching (handles LLM truncation & hallucinated endings)
  if (idx === -1) {
    const words = normQuote.split(" ").filter(Boolean);
    const startCount = Math.min(words.length, 12);
    for (let count = startCount; count >= 4; count--) {
      const prefix = words.slice(0, count).join(" ");
      const foundIdx = normText.indexOf(prefix);
      if (foundIdx !== -1) {
        idx = foundIdx;
        matchLen = prefix.length;
        break;
      }
    }
  }

  // 3. Fall back to searching without punctuation
  if (idx === -1) {
    const cleanQuote = normQuote.replace(/[^\w\s]/g, "");
    const cleanText = normText.replace(/[^\w\s]/g, "");
    const cleanIdx = cleanText.indexOf(cleanQuote);
    if (cleanIdx !== -1) {
      // Map approximate position
      idx = Math.min(cleanIdx, normText.length - 1);
      matchLen = Math.min(cleanQuote.length, normText.length - idx);
    }
  }

  if (idx === -1) return [];

  const owners: TextItem[] = [];
  const seen = new Set<TextItem>();
  for (let i = idx; i < idx + matchLen && i < normOwners.length; i++) {
    const owner = normOwners[i];
    if (owner && !seen.has(owner)) {
      seen.add(owner);
      owners.push(owner);
    }
  }
  if (owners.length === 0) return [];

  return itemsToPercentRects(owners, viewport);
}

/**
 * Parses target page number from LLM or data string (e.g. "Page 1", "2", "p. 3").
 */
export function parseTargetPage(pageStr: any, numPages?: number): number {
  if (pageStr == null) return 1;
  const str = String(pageStr);
  const explicitMatch = str.match(/(?:page|p\.?)\s*(\d+)/i);
  const match = explicitMatch || str.match(/\d+/);
  if (!match) return 1;
  const n = parseInt(match[1] || match[0], 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (numPages && n > numPages) return Math.min(n, numPages);
  return n;
}
