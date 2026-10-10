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

  // Bolt Optimization: Maintain bounding box minX/maxX in single-pass scalar variables
  // rather than running multi-pass Math.min/max with array .map() allocations in every iteration.
  let clusterMinX = sorted[0].left;
  let clusterMaxX = sorted[0].left + sorted[0].width;

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentCluster[currentCluster.length - 1];
    const curr = sorted[i];

    const verticalGap = curr.top - (prev.top + prev.height);
    // Line spacing in multi-line quotes is typically within 3.5% page height
    const isAdjacent = verticalGap >= -1.0 && verticalGap <= 3.5;

    // Check horizontal overlap between curr and currentCluster bounding box
    const currRight = curr.left + curr.width;

    const horizontalOverlap = Math.min(clusterMaxX, currRight) - Math.max(clusterMinX, curr.left);
    const isInSameColumn = horizontalOverlap > -3.0; // allows indentations / line wraps

    if (isAdjacent && isInSameColumn) {
      currentCluster.push(curr);
      if (curr.left < clusterMinX) clusterMinX = curr.left;
      if (currRight > clusterMaxX) clusterMaxX = currRight;
    } else {
      clusters.push(currentCluster);
      currentCluster = [curr];
      clusterMinX = curr.left;
      clusterMaxX = currRight;
    }
  }
  clusters.push(currentCluster);

  return clusters.map((cluster) => {
    // Bolt Optimization: Single-pass bounding box accumulation per cluster
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (let j = 0; j < cluster.length; j++) {
      const r = cluster[j];
      if (r.left < minLeft) minLeft = r.left;
      if (r.top < minTop) minTop = r.top;
      const right = r.left + r.width;
      if (right > maxRight) maxRight = right;
      const bottom = r.top + r.height;
      if (bottom > maxBottom) maxBottom = bottom;
    }

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
        if (!item.quote || !item.quote.trim()) continue;

        // Try referenced page first, fallback to checking other pages
        const targetPage = parseTargetPage(item.pageNumber, numPages);
        let located = false;

        try {
          const page = await pdf.getPage(targetPage);
          const rects = await locateQuoteRects(page, item.quote);

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
              const otherRects = await locateQuoteRects(otherPage, item.quote);
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
          highlightElement.classList.add("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
          if (activePulseTimeoutRef.current) clearTimeout(activePulseTimeoutRef.current);
          activePulseTimeoutRef.current = setTimeout(() => {
            highlightElement.classList.remove("ring-4", "ring-amber-500", "scale-105", "shadow-xl");
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
    <div className={cn("flex flex-col h-full bg-[#ECE9E2] relative overflow-hidden select-none", className)}>
      {/* ── TOP PDF TOOLBAR ── */}
      <div className="bg-[#FAF9F3] border-b border-[#381A61]/10 px-3.5 py-2 flex items-center justify-between shrink-0 shadow-2xs z-20">
        {/* Left: Study Selector & Upload */}
        <div className="flex items-center gap-2">
          {availableStudies.length > 0 ? (
            <select
              value={currentStudyId || ""}
              onChange={(e) => onSelectStudy?.(e.target.value)}
              className="text-xs font-semibold bg-white border border-[#7C4B73]/25 rounded-lg px-2.5 py-1 text-[#381A61] focus:outline-hidden focus:ring-1 focus:ring-[#88A0DC] max-w-[240px] truncate shadow-2xs"
              title="Switch publication paper"
            >
              {availableStudies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#381A61]">
              <FileText className="h-4 w-4 text-[#88A0DC]" />
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
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#381A61] hover:text-[#381A61] bg-[#88A0DC]/20 hover:bg-[#88A0DC]/35 border border-[#88A0DC]/40 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
            title="Upload and inspect your own PDF paper"
          >
            <Upload className="h-3 w-3 text-[#7C4B73]" />
            <span>Upload PDF</span>
          </button>
        </div>

        {/* Center: Page Jump Pills */}
        {numPages > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#7C4B73] font-medium mr-1">
              Page {currentPage} of {numPages}
            </span>
            <div className="flex items-center gap-1 bg-[#88A0DC]/15 p-0.5 rounded-lg border border-[#88A0DC]/30 text-[10px] font-mono font-bold">
              {Array.from({ length: numPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => jumpToPage(p)}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-all",
                    currentPage === p
                      ? "bg-[#381A61] text-[#F9D14A] font-bold shadow-xs scale-105"
                      : "text-[#381A61]/80 hover:bg-white hover:text-[#381A61]"
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
            className="p-1.5 rounded-lg hover:bg-[#381A61]/5 text-[#381A61] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-mono font-bold text-[#381A61] w-10 text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(180, z + 10))}
            className="p-1.5 rounded-lg hover:bg-[#381A61]/5 text-[#381A61] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="text-[10px] font-bold text-[#381A61] hover:bg-[#88A0DC]/35 bg-[#88A0DC]/20 border border-[#88A0DC]/40 px-2 py-0.5 rounded-md ml-1 shadow-2xs"
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
            <Loader2 className="h-8 w-8 text-[#381A61] animate-spin mb-3" />
            <p className="text-sm font-semibold text-[#381A61]">{loadingProgress}</p>
            <p className="text-xs text-[#7C4B73] mt-1 font-serif italic">Rendering high-resolution multi-column layout with Docling-aligned highlights</p>
          </div>
        ) : error ? (
          <div className="my-auto max-w-md p-6 bg-white rounded-2xl border border-[#AB3329]/30 shadow-md text-center">
            <AlertCircle className="h-10 w-10 text-[#AB3329] mx-auto mb-2" />
            <h3 className="text-sm font-bold text-[#381A61] mb-1">Could not render PDF preview</h3>
            <p className="text-xs text-[#6B665E] mb-4">{error}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setRetryCount((prev) => prev + 1)}
                className="btn-palette-secondary text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Loading
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-palette-primary text-xs"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Local PDF
              </button>
            </div>
          </div>
        ) : (
          pages.map((page) => {
            const overlays = pageHighlights[page.pageNumber] || [];

            return (
              <div
                key={page.pageNumber}
                id={`pdf-page-${page.pageNumber}`}
                style={{ width: `${zoom}%`, maxWidth: `${Math.round(850 * (zoom / 100))}px` }}
                className="bg-white rounded-xs shadow-2xl border border-[#381A61]/15 relative transition-all duration-150 shrink-0 select-text"
              >
                {/* Visual Page Number Badge in Margin */}
                <div className="absolute -top-3 left-3 bg-[#381A61] text-[#F9D14A] font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-md shadow-xs z-30 select-none border border-[#7C4B73]/40">
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
                                ? "rgba(249, 209, 74, 0.25)" // Canary Gold #F9D14A translucent highlight wash
                                : isVerified
                                ? "rgba(124, 75, 115, 0.10)" // Berry Plum #7C4B73
                                : "rgba(136, 160, 220, 0.10)", // Soft Periwinkle #88A0DC
                              border: isActive
                                ? "2px solid #E78429" // Boundary line all over the highlight block (Tangerine Amber)
                                : isVerified
                                ? "1.5px solid #7C4B73" // Boundary line all over the highlight block (Berry Plum)
                                : "1.5px dashed #88A0DC", // Boundary line all over the highlight block (Soft Periwinkle)
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
                              isActive && "ring-1 ring-[#E78429]/40"
                            )}
                            title={`#${overlay.varIndex} ${overlay.label}: ${overlay.value || "Extracted"} (Click to review)`}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Page Bottom Running Footer */}
                <div className="bg-[#FAF9F3] border-t border-[#381A61]/10 px-4 py-1.5 flex items-center justify-between text-[10px] font-sans text-[#7C4B73] select-none">
                  <span className="italic">Actual PDF Page {page.pageNumber} of {numPages}</span>
                  <span className="font-semibold text-[#381A61]">
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
