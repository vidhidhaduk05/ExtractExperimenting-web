import React, { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  ZoomIn, ZoomOut, Maximize2, Upload, FileText,
  CheckCircle, ChevronLeft, ChevronRight, RotateCcw,
  Sparkles, Layers, Eye, AlertCircle, FileSearch, Loader2
} from "lucide-react";
import { locateQuoteRects, parseTargetPage, type PercentRect } from "../../lib/pdfLocator";
import { cn } from "../../lib/utils";

export interface PdfHighlightItem {
  id: string; // variable_id
  varIndex: number;
  label: string;
  quote: string;
  pageNumber: number;
  isVerified?: boolean;
  value?: string;
}

export interface ActualPdfViewerProps {
  pdfUrl: string;
  highlights: PdfHighlightItem[];
  activeHighlightId: string | null;
  onHighlightClick?: (highlightId: string) => void;
  onPdfUpload?: (file: File) => void;
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  availableStudies?: Array<{ id: string; title: string; filename: string }>;
  currentStudyId?: string;
  onSelectStudy?: (studyId: string) => void;
  className?: string;
}

interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface PageHighlightOverlay {
  variableId: string;
  varIndex: number;
  label: string;
  value?: string;
  isVerified: boolean;
  isActive: boolean;
  rects: PercentRect[];
}

/**
 * Merges line-by-line quote rectangles into a unified block boundary rectangle.
 * When quotes span multiple lines within the same column or paragraph, this creates
 * a single perimeter bounding box rather than striped borders across every line.
 */
function mergeContiguousRects(rects: PercentRect[]): PercentRect[] {
  if (!rects || rects.length <= 1) return rects || [];

  // Sort by vertical position (top to bottom), then left to right
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const clusters: PercentRect[][] = [];
  let currentCluster: PercentRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentCluster[currentCluster.length - 1];
    const curr = sorted[i];

    const verticalGap = curr.top - (prev.top + prev.height);
    // Line spacing in multi-line quotes is typically within 3.5% page height
    const isAdjacent = verticalGap >= -1.0 && verticalGap <= 3.5;

    // Check horizontal overlap between curr and currentCluster bounding box
    const clusterMinX = Math.min(...currentCluster.map((r) => r.left));
    const clusterMaxX = Math.max(...currentCluster.map((r) => r.left + r.width));
    const currRight = curr.left + curr.width;

    const horizontalOverlap = Math.min(clusterMaxX, currRight) - Math.max(clusterMinX, curr.left);
    const isInSameColumn = horizontalOverlap > -3.0; // allows indentations / line wraps

    if (isAdjacent && isInSameColumn) {
      currentCluster.push(curr);
    } else {
      clusters.push(currentCluster);
      currentCluster = [curr];
    }
  }
  clusters.push(currentCluster);

  return clusters.map((cluster) => {
    const minLeft = Math.min(...cluster.map((r) => r.left));
    const minTop = Math.min(...cluster.map((r) => r.top));
    const maxRight = Math.max(...cluster.map((r) => r.left + r.width));
    const maxBottom = Math.max(...cluster.map((r) => r.top + r.height));

    // Slight breathing padding around the text
    const padX = 0.25;
    const padY = 0.15;

    const left = Math.max(0, minLeft - padX);
    const top = Math.max(0, minTop - padY);
    const width = Math.min(100 - left, (maxRight - minLeft) + padX * 2);
    const height = Math.min(100 - top, (maxBottom - minTop) + padY * 2);

    return { left, top, width, height };
  });
}

export function ActualPdfViewer({
  pdfUrl,
  highlights,
  activeHighlightId,
  onHighlightClick,
  onPdfUpload,
  zoom: externalZoom,
  onZoomChange,
  availableStudies = [],
  currentStudyId,
  onSelectStudy,
  className,
}: ActualPdfViewerProps) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<string>("Initializing PDF...");
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [internalZoom, setInternalZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageHighlights, setPageHighlights] = useState<Record<number, PageHighlightOverlay[]>>({});

  const pdfDocRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePulseTimeoutRef = useRef<any>(null);

  const zoom = externalZoom !== undefined ? externalZoom : internalZoom;
  const setZoom = (val: number | ((prev: number) => number)) => {
    const nextVal = typeof val === "function" ? val(zoom) : val;
    const clamped = Math.min(180, Math.max(60, nextVal));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
  };

  // ── 1. Load PDF Document ──
  useEffect(() => {
    if (!pdfUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setPageHighlights({});
    setLoadingProgress("Fetching document stream...");

    let loadingTask: any = null;

    const load = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          isEvalSupported: false,
        });

        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (total > 0) {
            setLoadingProgress(`Downloading PDF (${Math.round((loaded / total) * 100)}%)...`);
          }
        };

        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }

        if (pdfDocRef.current) {
          try { pdfDocRef.current.destroy(); } catch (e) {}
        }

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoadingProgress(`Rendering ${pdf.numPages} pages...`);
      } catch (err: any) {
        if (cancelled) return;
        console.error("PDF loading error:", err);
        setError(err.message || "Could not load publication PDF");
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (loadingTask) {
        try { loadingTask.destroy(); } catch (e) {}
      }
    };
  }, [pdfUrl, retryCount]);

  // ── 2. Sequentially Render Pages & Progressively Display ──
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf || numPages === 0) return;

    let cancelled = false;
    let currentRenderTask: any = null;

    const renderAll = async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        try {
          setLoadingProgress(`Rendering page ${i} of ${numPages}...`);
          const page = await pdf.getPage(i);
          if (cancelled) return;

          // Render at 2.0 scale for crisp, high-DPI text clarity
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          currentRenderTask = page.render({
            canvasContext: ctx,
            viewport,
          });

          await currentRenderTask.promise;

          if (cancelled) return;
          const dataUrl = canvas.toDataURL("image/webp", 0.92);

          setPages((prev) => {
            if (prev.some((p) => p.pageNumber === i)) return prev;
            return [...prev, { pageNumber: i, dataUrl, width: viewport.width, height: viewport.height }].sort(
              (a, b) => a.pageNumber - b.pageNumber
            );
          });
        } catch (err: any) {
          if (err.name === 'RenderingCancelledException') {
             continue;
          }
          console.error(`Page ${i} render failure:`, err);
        }
      }
      if (!cancelled) setLoading(false);
    };

    renderAll();

    return () => {
      cancelled = true;
      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch (e) {}
      }
    };
  }, [numPages]);

  // ── 3. Locate & Cache Highlight Overlays Across Pages ──
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf || numPages === 0 || highlights.length === 0) return;

    let cancelled = false;

    const locateAll = async () => {
      const pageMap: Record<number, PageHighlightOverlay[]> = {};

      for (const item of highlights) {
        const searchText = (item.quote && item.quote.trim()) ? item.quote.trim() : (item.value && item.value.trim().length >= 2 && item.value !== "NR" ? item.value.trim() : "");
        if (!searchText) continue;

        // Try referenced page first, fallback to checking other pages
        const targetPage = parseTargetPage(item.pageNumber, numPages);
        let located = false;

        try {
          const page = await pdf.getPage(targetPage);
          let rects = await locateQuoteRects(page, searchText);

          // If quote search failed, try value search on target page
          if (rects.length === 0 && item.value && item.value.trim().length >= 2 && item.value !== "NR" && searchText !== item.value.trim()) {
            rects = await locateQuoteRects(page, item.value.trim());
          }

          if (rects.length > 0) {
            located = true;
            if (!pageMap[targetPage]) pageMap[targetPage] = [];
            pageMap[targetPage].push({
              variableId: item.id,
              varIndex: item.varIndex,
              label: item.label,
              value: item.value,
              isVerified: !!item.isVerified,
              isActive: item.id === activeHighlightId,
              rects,
            });
          }
        } catch (e) {
          console.warn(`Quote matching skipped on page ${targetPage}:`, e);
        }

        // If not found on target page, scan all remaining pages
        if (!located) {
          for (let p = 1; p <= numPages; p++) {
            if (p === targetPage) continue;
            try {
              const otherPage = await pdf.getPage(p);
              let otherRects = await locateQuoteRects(otherPage, searchText);
              if (otherRects.length === 0 && item.value && item.value.trim().length >= 2 && item.value !== "NR" && searchText !== item.value.trim()) {
                otherRects = await locateQuoteRects(otherPage, item.value.trim());
              }

              if (otherRects.length > 0) {
                located = true;
                if (!pageMap[p]) pageMap[p] = [];
                pageMap[p].push({
                  variableId: item.id,
                  varIndex: item.varIndex,
                  label: item.label,
                  value: item.value,
                  isVerified: !!item.isVerified,
                  isActive: item.id === activeHighlightId,
                  rects: otherRects,
                });
                break;
              }
            } catch (e) {}
          }
        }

        // If still not located in text, attach a clean page-header indicator highlight so it can always be jumped to
        if (!located) {
          const p = Math.min(Math.max(1, targetPage), Math.max(1, numPages));
          if (!pageMap[p]) pageMap[p] = [];
          pageMap[p].push({
            variableId: item.id,
            varIndex: item.varIndex,
            label: item.label,
            value: item.value,
            isVerified: !!item.isVerified,
            isActive: item.id === activeHighlightId,
            rects: [{ left: 8, top: 2.5 + (pageMap[p].length * 3), width: 84, height: 2.8 }],
          });
        }
      }

      if (!cancelled) {
        setPageHighlights(pageMap);
      }
    };

    locateAll();

    return () => {
      cancelled = true;
    };
  }, [highlights, numPages]);

  // ── 4. Microsoft Word Track Changes Auto-Scroll Mechanism ──
  // Upon accepting/changing to the next variable, smoothly autoscroll to the next highlight!
  useEffect(() => {
    if (!activeHighlightId || pages.length === 0) return;

    const highlightItem = highlights.find((h) => h.id === activeHighlightId);
    if (!highlightItem) return;

    // Larger timeout and requestAnimationFrame ensures DOM elements are rendered fully
    // across complex multi-page rapid transitions.
    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        const highlightElement = document.getElementById(`pdf-highlight-${activeHighlightId}`);
        if (highlightElement) {
          highlightElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
          // Flash pulse animation
          highlightElement.classList.add("ring-4", "ring-amber-500", "scale-102");
          if (activePulseTimeoutRef.current) clearTimeout(activePulseTimeoutRef.current);
          activePulseTimeoutRef.current = setTimeout(() => {
            highlightElement.classList.remove("ring-4", "ring-amber-500", "scale-102");
          }, 1200);
        } else {
          // Fallback: scroll to target page if highlight rect is missing
          const targetPage = parseTargetPage(highlightItem.pageNumber, numPages);
          const pageElement = document.getElementById(`pdf-page-${targetPage}`);
          if (pageElement) {
            pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [activeHighlightId, pages, highlights, numPages]);

  // ── 4b. Explicit Find Quote Trigger Handler ──
  useEffect(() => {
    const handleFindQuote = (e: any) => {
      const vid = e.detail?.variableId;
      if (!vid) return;

      const triggerScrollAndFlash = () => {
        const highlightElement = document.getElementById(`pdf-highlight-${vid}`);
        if (highlightElement) {
          highlightElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
          highlightElement.classList.add("ring-4", "ring-[#814d75]", "scale-105", "shadow-xl");
          if (activePulseTimeoutRef.current) clearTimeout(activePulseTimeoutRef.current);
          activePulseTimeoutRef.current = setTimeout(() => {
            highlightElement.classList.remove("ring-4", "ring-[#814d75]", "scale-105", "shadow-xl");
          }, 1500);
          return true;
        }
        return false;
      };

      if (!triggerScrollAndFlash()) {
        const item = highlights.find((h) => h.id === vid);
        const targetPage = parseTargetPage(item?.pageNumber || 1, numPages);
        const pageElement = document.getElementById(`pdf-page-${targetPage}`);
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
          pageElement.classList.add("ring-4", "ring-[#814d75]", "shadow-2xl");
          setTimeout(() => {
            pageElement.classList.remove("ring-4", "ring-[#814d75]", "shadow-2xl");
          }, 1500);
          setTimeout(() => {
            triggerScrollAndFlash();
          }, 350);
        }
      }
    };

    window.addEventListener("radextract:find-quote", handleFindQuote);
    return () => window.removeEventListener("radextract:find-quote", handleFindQuote);
  }, [highlights, numPages]);

  // ── 5. File Upload Handler ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onPdfUpload) {
      onPdfUpload(file);
    }
  };

  // Jump to specific page
  const jumpToPage = (p: number) => {
    const el = document.getElementById(`pdf-page-${p}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(p);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-[#fbf9f4] relative overflow-hidden select-none", className)}>
      {/* ── TOP PDF TOOLBAR (Master Theme) ── */}
      <div className="bg-[#ffffff] border-b border-[#d2c2cb] px-3.5 py-2 flex items-center justify-between shrink-0 shadow-2xs z-20">
        {/* Left: Study Selector & Upload */}
        <div className="flex items-center gap-2">
          {availableStudies.length > 0 ? (
            <select
              value={currentStudyId || ""}
              onChange={(e) => onSelectStudy?.(e.target.value)}
              className="text-xs font-semibold bg-[#ffffff] border border-[#d2c2cb] rounded-lg px-2.5 py-1 text-[#3a0f34] focus:outline-hidden focus:ring-1 focus:ring-[#814d75] max-w-[240px] truncate shadow-2xs"
              title="Switch publication paper"
            >
              {availableStudies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#3a0f34]">
              <FileText className="h-4 w-4 text-[#814d75]" />
              <span>Publication PDF</span>
            </div>
          )}

          {/* Upload Custom PDF Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3a0f34] hover:bg-[#eee7ec] bg-[#ffffff] border border-[#d2c2cb] px-2.5 py-1 rounded-lg transition-colors shadow-2xs font-['Work_Sans']"
            title="Upload and inspect your own PDF paper"
          >
            <Upload className="h-3 w-3 text-[#814d75]" />
            <span>Upload PDF</span>
          </button>
        </div>

        {/* Center: Page Jump Pills */}
        {numPages > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#62535d] font-medium mr-1">
              Page {currentPage} of {numPages}
            </span>
            <div className="flex items-center gap-1 bg-[#eee7ec] p-0.5 rounded-lg border border-[#d2c2cb] text-[10px] font-mono font-bold">
              {Array.from({ length: numPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => jumpToPage(p)}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-all",
                    currentPage === p
                      ? "bg-[#3a0f34] text-[#fbf9f4] font-bold shadow-xs scale-105"
                      : "text-[#4f444b] hover:bg-white hover:text-[#3a0f34]"
                  )}
                  title={`Jump to Page ${p}`}
                >
                  P{p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Right: Zoom Controls & Fit */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(60, z - 10))}
            className="p-1.5 rounded-lg hover:bg-[#eee7ec] text-[#4f444b] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-mono font-bold text-[#3a0f34] w-10 text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(180, z + 10))}
            className="p-1.5 rounded-lg hover:bg-[#eee7ec] text-[#4f444b] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="text-[10px] font-bold text-[#3a0f34] hover:bg-[#eee7ec] bg-[#ffffff] border border-[#d2c2cb] px-2 py-0.5 rounded-md ml-1 shadow-2xs font-['Work_Sans']"
            title="Reset to 100% Fit"
          >
            Fit
          </button>
        </div>
      </div>

      {/* ── PDF PAGES CONTAINER WITH HIGHLIGHT OVERLAYS ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 space-y-6 flex flex-col items-center"
      >
        {loading && pages.length === 0 ? (
          <div className="my-auto py-16 flex flex-col items-center text-center">
            <Loader2 className="h-8 w-8 text-[#3a0f34] animate-spin mb-3" />
            <p className="text-sm font-semibold text-[#3a0f34] font-['Work_Sans']">{loadingProgress}</p>
            <p className="text-xs text-[#62535d] mt-1 font-serif italic">Rendering high-resolution multi-column layout with Docling-aligned highlights</p>
          </div>
        ) : error ? (
          <div className="my-auto max-w-2xl w-full p-6 bg-white rounded-xl border border-[#d2c2cb] shadow-sm text-center">
            <AlertCircle className="h-10 w-10 text-[#814d75] mx-auto mb-2" />
            <h3 className="text-base font-bold text-[#3a0f34] mb-1 font-serif">Original PDF Document Not Localized</h3>
            <p className="text-xs text-[#62535d] mb-4">
              {error.includes("404") || error.includes("Could not") 
                ? "The original publisher PDF file is not stored on this local instance. You can upload the PDF or inspect the extracted quotes below."
                : error}
            </p>
            <div className="flex justify-center gap-3 mb-6">
              <button
                onClick={() => {
                  if (availableStudies.length > 0) {
                    onSelectStudy?.(availableStudies[0].id);
                  } else {
                    setRetryCount((prev) => prev + 1);
                  }
                }}
                className="px-3.5 py-1.5 bg-[#3a0f34] text-[#fbf9f4] text-xs font-semibold rounded-lg hover:bg-[#1a0017] transition-colors flex items-center gap-1.5 shadow-2xs font-['Work_Sans']"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Inspect Bundled Demo Paper
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 bg-white border border-[#d2c2cb] text-[#3a0f34] text-xs font-semibold rounded-lg hover:bg-[#eee7ec] transition-colors flex items-center gap-1.5 shadow-2xs font-['Work_Sans']"
              >
                <Upload className="h-3.5 w-3.5 text-[#814d75]" />
                Upload Local PDF
              </button>
            </div>

            {/* Extracted Evidence Snippets Fallback */}
            {highlights && highlights.length > 0 && (
              <div className="text-left border-t border-[#d2c2cb] pt-4 mt-2">
                <h4 className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider mb-3 flex items-center gap-1.5 font-['Work_Sans']">
                  <Sparkles className="h-3.5 w-3.5 text-[#814d75]" />
                  Extracted Evidence Snippets & Verified Values ({highlights.length})
                </h4>
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {highlights.map((h) => (
                    <div 
                      key={h.id} 
                      className={cn(
                        "p-3 rounded-lg border transition-all text-xs",
                        activeHighlightId === h.id 
                          ? "bg-[#eee7ec] border-[#814d75] shadow-xs" 
                          : "bg-[#fbf9f4] border-[#d2c2cb] hover:bg-white"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#3a0f34]">{h.label}</span>
                        <div className="flex items-center gap-2">
                          {h.value && (
                            <span className="bg-white px-2 py-0.5 rounded border border-[#d2c2cb] font-mono text-[11px] text-[#4f444b] font-bold">
                              {h.value}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#62535d]">Page {h.pageNumber}</span>
                        </div>
                      </div>
                      {h.quote ? (
                        <p className="text-[11px] text-[#4f444b] italic font-serif bg-white/70 p-2 rounded border border-[#d2c2cb]/50">
                          "{h.quote}"
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#81737b] italic font-serif">
                          No direct quote string recorded for this variable.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          pages.map((page) => {
            const overlays = pageHighlights[page.pageNumber] || [];

            return (
              <div
                key={page.pageNumber}
                id={`pdf-page-${page.pageNumber}`}
                style={{ width: `${zoom}%`, maxWidth: `${Math.round(850 * (zoom / 100))}px` }}
                className="bg-white rounded-xs shadow-2xl border border-[#3a0f34]/15 relative transition-all duration-150 shrink-0 select-text"
              >
                {/* Visual Page Number Badge in Margin */}
                <div className="absolute -top-3 left-3 bg-[#3a0f34] text-[#ffdea6] font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-md shadow-xs z-30 select-none border border-[#814d75]/40">
                  Page {page.pageNumber}
                </div>

                {/* Rendered PDF Page Image */}
                <div className="relative leading-none">
                  <img
                    src={page.dataUrl}
                    alt={`Academic Publication Page ${page.pageNumber}`}
                    className="w-full h-auto block select-none pointer-events-none"
                    loading="lazy"
                  />

                  {/* ── Bounding Box Highlights Overlay ── */}
                  {overlays.map((overlay) => {
                    const isActive = overlay.variableId === activeHighlightId;
                    const isVerified = overlay.isVerified;
                    const displayRects = mergeContiguousRects(overlay.rects);

                    return (
                      <React.Fragment key={overlay.variableId}>
                        {displayRects.map((rect, rIdx) => (
                          <div
                            key={rIdx}
                            id={rIdx === 0 ? `pdf-highlight-${overlay.variableId}` : undefined}
                            data-variable-id={overlay.variableId}
                            data-is-active={isActive ? "true" : "false"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onHighlightClick?.(overlay.variableId);
                            }}
                            style={{
                              position: "absolute",
                              left: `${rect.left}%`,
                              top: `${rect.top}%`,
                              width: `${rect.width}%`,
                              height: `${rect.height}%`,
                              mixBlendMode: "multiply",
                              backgroundColor: isActive
                                ? "rgba(249, 209, 74, 0.25)" // Canary Gold #ffdea6 translucent highlight wash
                                : isVerified
                                ? "rgba(124, 75, 115, 0.10)" // Berry Plum #814d75
                                : "rgba(136, 160, 220, 0.10)", // Soft Periwinkle #eee7ec
                              border: isActive
                                ? "2px solid #7c5800" // Boundary line all over the highlight block (Tangerine Amber)
                                : isVerified
                                ? "1.5px solid #814d75" // Boundary line all over the highlight block (Berry Plum)
                                : "1.5px dashed #eee7ec", // Boundary line all over the highlight block (Soft Periwinkle)
                              boxShadow: isActive
                                ? "0 0 0 2px rgba(231, 132, 41, 0.2), 0 3px 12px rgba(249, 209, 74, 0.35)"
                                : "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              zIndex: isActive ? 25 : 15,
                              transition: "all 0.15s ease",
                            }}
                            className={cn(
                              "group/highlight hover:brightness-95",
                              isActive && "ring-1 ring-[#7c5800]/40"
                            )}
                            title={`#${overlay.varIndex} ${overlay.label}: ${overlay.value || "Extracted"} (Click to review)`}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Page Bottom Running Footer */}
                <div className="bg-[#fbf9f4] border-t border-[#3a0f34]/10 px-4 py-1.5 flex items-center justify-between text-[10px] font-sans text-[#814d75] select-none">
                  <span className="italic">Actual PDF Page {page.pageNumber} of {numPages}</span>
                  <span className="font-semibold text-[#3a0f34]">
                    {overlays.length} active extraction highlight{overlays.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
