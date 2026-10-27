import React, { useState, useRef, useEffect, useCallback } from "react";

interface SplitLayoutProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  storageKey?: string;
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  className?: string;
}

export function SplitLayout({
  leftPane,
  rightPane,
  storageKey = "split_layout_width",
  defaultLeftPercent = 40,
  minLeftPercent = 20,
  maxLeftPercent = 75,
  className = "",
}: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [leftPercent, setLeftPercent] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= minLeftPercent && parsed <= maxLeftPercent) {
          return parsed;
        }
      }
    }
    return defaultLeftPercent;
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const currentX = e.clientX;
      const newPercent = ((currentX - rect.left) / rect.width) * 100;
      const clamped = Math.max(minLeftPercent, Math.min(maxLeftPercent, newPercent));
      setLeftPercent(clamped);
      try {
        localStorage.setItem(storageKey, clamped.toFixed(2));
      } catch {
        // Ignore localStorage errors
      }
    },
    [isDragging, minLeftPercent, maxLeftPercent, storageKey]
  );

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }
  };

  // Prevent text selection across the container while dragging
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className={`flex w-full h-full overflow-hidden relative select-none ${className}`}
      style={{ userSelect: isDragging ? "none" : "auto" }}
    >
      {/* Left Pane */}
      <div
        className="h-full overflow-y-auto flex-shrink-0"
        style={{ width: `${leftPercent}%` }}
      >
        {leftPane}
      </div>

      {/* Resizable Divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize layout panes"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-2 hover:w-2 relative flex-shrink-0 cursor-col-resize z-20 group transition-colors duration-150 ${
          isDragging ? "bg-[#814d75]" : "bg-[#d2c2cb]/40 hover:bg-[#814d75]/50"
        }`}
        style={{ touchAction: "none" }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-[#d2c2cb] group-hover:bg-[#814d75] transition-colors" />
        <div
          className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-3.5 h-8 rounded-full border border-[#d2c2cb] bg-white shadow-sm flex items-center justify-center transition-opacity ${
            isDragging ? "opacity-100 ring-2 ring-[#814d75]" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="w-0.5 h-0.5 bg-[#62535d] rounded-full" />
            <span className="w-0.5 h-0.5 bg-[#62535d] rounded-full" />
            <span className="w-0.5 h-0.5 bg-[#62535d] rounded-full" />
          </div>
        </div>
      </div>

      {/* Right Pane */}
      <div
        className="h-full overflow-y-auto flex-1 min-w-0"
        style={{ width: `${100 - leftPercent}%` }}
      >
        {rightPane}
      </div>
    </div>
  );
}
