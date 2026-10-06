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

        // If not found on target page, scan page 1 or 2
        if (!located && targetPage !== 1) {
          try {
            const page1 = await pdf.getPage(1);
            const rects1 = await locateQuoteRects(page1, item.quote);
            if (rects1.length > 0) {
              if (!pageMap[1]) pageMap[1] = [];
              pageMap[1].push({
                variableId: item.id,
                varIndex: item.varIndex,
                label: item.label,
                value: item.value,
                isVerified: !!item.isVerified,
                isActive: item.id === activeHighlightId,
                rects: rects1,
              });
            }
          } catch (e) {}
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
  }, [highlights, numPages, activeHighlightId]);

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
    <div className={cn("flex flex-col h-full bg-slate-200/90 relative overflow-hidden select-none", className)}>
      {/* ── TOP PDF TOOLBAR ── */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 shadow-2xs z-20">
        {/* Left: Study Selector & Upload */}
        <div className="flex items-center gap-2">
          {availableStudies.length > 0 ? (
            <select
              value={currentStudyId || ""}
              onChange={(e) => onSelectStudy?.(e.target.value)}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500 max-w-[220px] truncate"
              title="Switch publication paper"
            >
              {availableStudies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <FileText className="h-4 w-4 text-blue-600" />
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
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
            title="Upload and inspect your own PDF paper"
          >
            <Upload className="h-3 w-3 text-slate-500" />
            <span>Upload PDF</span>
          </button>
        </div>

        {/* Center: Page Jump Pills */}
        {numPages > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-mono text-slate-500 mr-1">
              Page {currentPage} of {numPages}
            </span>
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-mono font-bold">
              {Array.from({ length: numPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => jumpToPage(p)}
                  className={cn(
                    "px-1.5 py-0.5 rounded transition-colors",
                    currentPage === p
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-white"
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
            className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-mono font-bold text-slate-700 w-9 text-center">
            {zoom}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(180, z + 10))}
            className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded ml-1"
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
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-700">{loadingProgress}</p>
            <p className="text-xs text-slate-400 mt-1">Rendering high-resolution multi-column layout with Docling-aligned highlights</p>
          </div>
        ) : error ? (
          <div className="my-auto max-w-md p-6 bg-white rounded-xl border border-rose-200 shadow-md text-center">
            <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-900 mb-1">Could not render PDF preview</h3>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setRetryCount((prev) => prev + 1)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Loading
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
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
                className="bg-white rounded-xs shadow-2xl border border-slate-300 relative transition-all duration-150 shrink-0 select-text"
              >
                {/* Visual Page Number Badge in Margin */}
                <div className="absolute -top-3 left-3 bg-slate-800 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-30 select-none">
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

                    return (
                      <React.Fragment key={overlay.variableId}>
                        {overlay.rects.map((rect, rIdx) => (
                          <div
                            key={rIdx}
                            id={isActive && rIdx === 0 ? `pdf-highlight-${overlay.variableId}` : undefined}
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
                              backgroundColor: isActive
                                ? "rgba(245, 158, 11, 0.38)" // Luminous amber glow for active
                                : isVerified
                                ? "rgba(16, 185, 129, 0.25)" // Emerald for verified
                                : "rgba(245, 158, 11, 0.18)", // Soft amber for unverified
                              border: isActive
                                ? "2.5px solid #d97706"
                                : isVerified
                                ? "1.5px solid #059669"
                                : "1.5px solid #f59e0b",
                              boxShadow: isActive
                                ? "0 0 0 2px rgba(245, 158, 11, 0.4), 0 0 16px rgba(245, 158, 11, 0.85)"
                                : isVerified
                                ? "0 0 8px rgba(16, 185, 129, 0.3)"
                                : "none",
                              borderRadius: "3px",
                              cursor: "pointer",
                              zIndex: isActive ? 25 : 15,
                              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                            }}
                            className={cn(
                              "group/highlight hover:scale-[1.01]",
                              isActive && "animate-pulse"
                            )}
                            title={`#${overlay.varIndex} ${overlay.label}: ${overlay.value || "Extracted"} (Click to focus Track Changes card)`}
                          >
                            {/* Word-Style Flag Tag on First Rect */}
                            {rIdx === 0 && (
                              <span
                                style={{ transform: "translateY(-100%)" }}
                                className={cn(
                                  "absolute left-0 top-0 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-t shadow-xs whitespace-nowrap transition-colors select-none",
                                  isActive
                                    ? "bg-amber-600 text-white font-extrabold"
                                    : isVerified
                                    ? "bg-emerald-600 text-white"
                                    : "bg-amber-500 text-white"
                                )}
                              >
                                #{overlay.varIndex} {isActive ? "● REVIEWING" : isVerified ? "✓" : ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Page Bottom Running Footer */}
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-1.5 flex items-center justify-between text-[10px] font-sans text-slate-500 select-none">
                  <span className="italic">Actual PDF Page {page.pageNumber} of {numPages}</span>
                  <span className="font-semibold text-slate-600">
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
