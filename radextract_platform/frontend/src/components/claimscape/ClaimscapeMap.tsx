import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ProcessedPaper,
  TierSummary,
  TIER_BY_ID,
  computeSwarmY,
  VERDICT_LABEL,
  THRESHOLDS
} from "../../lib/claimscapeMethod";

interface ClaimscapeMapProps {
  summaries: TierSummary[];
  selectedPmid: string | null;
  onSelectPaper: (pmid: string) => void;
  showReviews: boolean;
}

interface TooltipState {
  pmid: string;
  paper: ProcessedPaper;
  left: number;
  top: number;
  width: number;
}

export const ClaimscapeMap: React.FC<ClaimscapeMapProps> = ({
  summaries,
  selectedPmid,
  onSelectPaper,
  showReviews
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [hovered, setHovered] = useState<TooltipState | null>(null);

  // Responsive width observer
  useEffect(() => {
    if (!axisRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(axisRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute year range [minYear, maxYear] across all eligible papers
  const allPapers = useMemo(() => {
    return summaries.flatMap((s) => s.papers);
  }, [summaries]);

  const [minYear, maxYear] = useMemo(() => {
    const dates = allPapers.map((p) => p.paper.date).filter((d) => d !== null && d !== undefined);
    if (!dates.length) return [2000, 2026];
    let min = Math.floor(Math.min(...dates)) - 0.5;
    let max = Math.ceil(Math.max(...dates)) + 0.5;
    if (max - min < 8) {
      const mid = (min + max) / 2;
      min = mid - 4;
      max = mid + 4;
    }
    return [min, max];
  }, [allPapers]);

  // Compute timeline tick marks (e.g. every 2, 5, 10, or 20 years)
  const axisTicks = useMemo(() => {
    const span = maxYear - minYear;
    const step = span <= 12 ? 2 : span <= 30 ? 5 : span <= 80 ? 10 : 20;
    const ticks: number[] = [];
    for (let t = Math.ceil(minYear / step) * step; t <= maxYear; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [minYear, maxYear]);

  // X coordinate projection
  const scaleX = (date: number) => {
    return 14 + ((date - minYear) / (maxYear - minYear)) * Math.max(1, containerWidth - 28);
  };

  // Compute placed dots for each row using the bee-swarm algorithm
  const rows = useMemo(() => {
    if (!containerWidth) return [];

    return summaries
      .filter((s) => s.id !== "review" || showReviews)
      .map((summary) => {
        const datedPapers = summary.papers.filter((p) => p.paper.date !== null && p.paper.date !== undefined);
        const xPositions = datedPapers.map((p) => scaleX(p.paper.date));
        const yOffsets = computeSwarmY(xPositions, 0, 2);

        const maxOffset = yOffsets.reduce((acc, y) => Math.max(acc, Math.abs(y)), 0);
        const rowHeight = datedPapers.length ? Math.max(58, Math.ceil(2 * maxOffset + 13 + 22)) : 44;

        const placed = datedPapers.map((p, idx) => ({
          paper: p,
          x: xPositions[idx],
          y: rowHeight / 2 + yOffsets[idx]
        }));

        return {
          summary,
          placed,
          height: rowHeight
        };
      });
  }, [summaries, showReviews, containerWidth, minYear, maxYear]);

  // Find dot nearest to (x, y) for hit-testing
  const findNearest = (
    dots: { paper: ProcessedPaper; x: number; y: number }[],
    clickX: number,
    clickY: number
  ) => {
    let best = null;
    let bestDistSq = 225; // radius 15px
    for (const d of dots) {
      const distSq = (d.x - clickX) ** 2 + (d.y - clickY) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = d;
      }
    }
    return best;
  };

  return (
    <div
      ref={containerRef}
      className="cs-map relative select-none"
      onPointerLeave={() => setHovered(null)}
    >
      <div className="cs-rows border-b border-[var(--cs-line)]">
        {/* Column Headers for Map and Forest Plot */}
        <div className="cs-row bg-[var(--cs-panel)] border-b border-[var(--cs-line)] text-[11px] font-bold uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] max-lg:hidden">
          <div className="lab !py-2.5">
            <span>Study Design Hierarchy</span>
          </div>
          <div className="flex items-center px-3.5 !py-2.5 text-[11px]">
            <span>Evidence Timeline (Publication Year)</span>
          </div>
          <div className="sum !py-2.5 flex-row items-center justify-between">
            <span>Forest Plot (Wilson 95% CI)</span>
            <span className="text-[10px] font-mono normal-case text-[var(--cs-ink-3)] font-normal">n = papers with verdict</span>
          </div>
        </div>

        {rows.map(({ summary, placed, height }) => {
          const tier = TIER_BY_ID[summary.id];
          return (
            <div
              key={summary.id}
              className={`cs-row ${summary.id === "review" ? "review" : ""}`}
            >
              {/* Left Label */}
              <div className="lab">
                <span className="text-[13.5px] font-semibold text-[#381A61] dark:text-[#FAF9F3] leading-snug">
                  {tier?.label || summary.label}
                </span>
                <span className="cs-mono text-[11.5px] cs-muted">
                  {summary.papers.length} {summary.papers.length === 1 ? "paper" : "papers"}
                </span>
              </div>

              {/* Middle SVG Swarm */}
              <div className="cs-swarm min-w-0 relative">
                <svg
                  height={height}
                  role="img"
                  aria-label={`${summary.label}: ${summary.counts.supports} for, ${summary.counts.mixed} mixed, ${summary.counts.contradicts} against, ${summary.counts.no_result} no result, ${summary.counts.unclear} unclear`}
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const localX = e.clientX - rect.left;
                    const localY = e.clientY - rect.top;
                    const match = findNearest(placed, localX, localY);
                    if (!match || !containerRef.current) {
                      setHovered((prev) => (prev === null ? prev : null));
                      return;
                    }
                    const parentRect = containerRef.current.getBoundingClientRect();
                    const left = rect.left - parentRect.left + match.x;
                    const top = rect.top - parentRect.top + match.y;
                    const width = parentRect.width;
                    const pmid = match.paper.paper.pmid;

                    // Performance optimization: Skip state update and re-render if target dot and coordinates haven't changed
                    setHovered((prev) => {
                      if (
                        prev &&
                        prev.pmid === pmid &&
                        prev.left === left &&
                        prev.top === top &&
                        prev.width === width
                      ) {
                        return prev;
                      }
                      return { pmid, paper: match.paper, left, top, width };
                    });
                  }}
                  onPointerLeave={() => setHovered(null)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const localX = e.clientX - rect.left;
                    const localY = e.clientY - rect.top;
                    const match = findNearest(placed, localX, localY);
                    if (match) {
                      onSelectPaper(match.paper.paper.pmid);
                    }
                  }}
                  style={{ cursor: hovered ? "pointer" : "default" }}
                >
                  {/* Grid lines */}
                  {axisTicks.map((tick) => (
                    <line
                      key={tick}
                      className="grid"
                      x1={scaleX(tick)}
                      x2={scaleX(tick)}
                      y1={0}
                      y2={height}
                    />
                  ))}

                  {/* Empty state text */}
                  {!placed.length && (
                    <text
                      x={14}
                      y={height / 2 + 4}
                      className="cs-mono text-[12px] fill-[var(--cs-ink-3)] font-medium"
                    >
                      None in this search
                    </text>
                  )}

                  {/* Placed paper dots */}
                  {placed.map(({ paper, x, y }) => {
                    const isSelected = selectedPmid === paper.paper.pmid;
                    const isHovered = hovered?.pmid === paper.paper.pmid;
                    const transformStr = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

                    return (
                      <g
                        key={paper.paper.pmid}
                        className="cs-dot enter"
                        style={{
                          transform: transformStr,
                          // @ts-expect-error CSS variable for transform animation
                          "--t": transformStr
                        }}
                      >
                        <DotSymbol
                          category={paper.category}
                          direct={paper.direct}
                          strength={paper.strength}
                          r={6.5}
                        />

                        {isSelected && <circle className="cs-sel" r={10} />}
                        {isHovered && !isSelected && <circle className="cs-hov" r={9.5} />}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Right Row Summary */}
              <div className="sum">
                <RowSummary summary={summary} />
              </div>
            </div>
          );
        })}

        {/* Bottom Timeline Axis */}
        <div className="cs-row" aria-hidden="true">
          <div className="lab max-lg:hidden" />
          <div ref={axisRef} className="min-w-0">
            {containerWidth > 0 && (
              <svg height={28} className="cs-axis w-full block">
                <line x1={0} x2={containerWidth} y1={0.5} y2={0.5} />
                {axisTicks.map((tick) => (
                  <g key={tick} transform={`translate(${scaleX(tick)}, 0)`}>
                    <line y1={0} y2={5} />
                    <text y={19} textAnchor="middle">
                      {tick}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
          <div className="sum max-lg:hidden" />
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hovered && (
        <Tooltip
          paper={hovered.paper}
          left={hovered.left}
          top={hovered.top}
          width={hovered.width}
        />
      )}
    </div>
  );
};

// SVG Dot representation matching exact ClaimScape rules
interface DotSymbolProps {
  category: ProcessedPaper["category"];
  direct: boolean;
  strength: number;
  r: number;
}

const DotSymbol: React.FC<DotSymbolProps> = React.memo(function DotSymbol({ category, direct, strength, r }) {
  const opacity =
    category === "supports" || category === "contradicts" || category === "mixed"
      ? 0.45 + 0.55 * Math.min(1, Math.max(0, (strength - 0.6) / 0.4))
      : 0.85;

  if (category === "no_result") {
    return (
      <circle
        r={0.55 * r}
        fill="var(--cs-neutral)"
        fillOpacity={0.7}
        stroke="var(--cs-surface)"
        strokeWidth={1.5}
      />
    );
  }

  if (category === "mixed") {
    const leftHalf = `M0 ${-r} A ${r} ${r} 0 0 0 0 ${r} Z`;
    const rightHalf = `M0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`;

    if (!direct) {
      const inR = r - 1;
      return (
        <>
          <circle r={r + 0.75} fill="var(--cs-surface)" />
          <path
            d={`M0 ${-inR} A ${inR} ${inR} 0 0 0 0 ${inR}`}
            fill="none"
            stroke="var(--cs-for)"
            strokeOpacity={opacity}
            strokeWidth={2}
          />
          <path
            d={`M0 ${-inR} A ${inR} ${inR} 0 0 1 0 ${inR}`}
            fill="none"
            stroke="var(--cs-against)"
            strokeOpacity={opacity}
            strokeWidth={2}
          />
        </>
      );
    }

    return (
      <>
        <circle r={r + 1.5} fill="var(--cs-surface)" />
        <path d={leftHalf} fill="var(--cs-for)" fillOpacity={opacity} />
        <path d={rightHalf} fill="var(--cs-against)" fillOpacity={opacity} />
      </>
    );
  }

  const fillVar =
    category === "supports"
      ? "var(--cs-for)"
      : category === "contradicts"
      ? "var(--cs-against)"
      : "var(--cs-neutral)";

  if (direct) {
    return (
      <circle
        r={r}
        fill={fillVar}
        fillOpacity={opacity}
        stroke="var(--cs-surface)"
        strokeWidth={1.5}
      />
    );
  }

  // Indirect evidence: Hollow dot
  return (
    <circle
      r={r - 1}
      fill="var(--cs-surface)"
      stroke={fillVar}
      strokeOpacity={opacity}
      strokeWidth={2}
    />
  );
});

// Row verdict & Wilson score interval summary
const RowSummary: React.FC<{ summary: TierSummary }> = React.memo(function RowSummary({ summary }) {
  const { supports, mixed, contradicts } = summary.counts;

  if (!summary.papers.length) {
    return <p className="text-[12.5px] cs-muted">No papers</p>;
  }

  const stack = (
    <div
      className="cs-stack"
      aria-hidden="true"
      style={{
        opacity: summary.counted && summary.n >= THRESHOLDS.minPapers ? 1 : 0.5
      }}
    >
      {supports > 0 && (
        <b style={{ flexGrow: supports, background: "var(--cs-for)" }} />
      )}
      {mixed > 0 && (
        <b style={{ flexGrow: mixed, background: "var(--cs-neutral)" }} />
      )}
      {contradicts > 0 && (
        <b style={{ flexGrow: contradicts, background: "var(--cs-against)" }} />
      )}
      {summary.n === 0 && <b style={{ flexGrow: 1, background: "transparent" }} />}
    </div>
  );

  const countsLine = (
    <p className="cs-mono text-[11.5px] cs-muted">
      {supports} for · {mixed} mixed · {contradicts} against
    </p>
  );

  if (!summary.counted) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-[var(--cs-ink)]">Not counted</span>
          <span className="whitespace-nowrap text-[11.5px] cs-muted">opinion, not data</span>
        </div>
        {stack}
        {countsLine}
      </>
    );
  }

  if (summary.n < THRESHOLDS.minPapers) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-[13px] font-semibold cs-soft">
            {VERDICT_LABEL.few}
          </span>
          <span
            className="cs-mono whitespace-nowrap text-[11.5px] cs-muted"
            title={`${summary.n} papers with a verdict`}
          >
            n = {summary.n}
          </span>
        </div>
        {stack}
        {countsLine}
      </>
    );
  }

  const [lower, upper] = summary.interval;
  const sharePct = `${Math.round(summary.share * 100)}%`;
  const lowerPct = `${Math.round(lower * 100)}%`;
  const upperPct = `${Math.round(upper * 100)}%`;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-semibold text-[var(--cs-ink)]">
          {VERDICT_LABEL[summary.verdict]}
        </span>
        <span
          className="cs-mono whitespace-nowrap text-[11.5px] cs-muted"
          title={`${summary.n} papers with a verdict`}
        >
          n = {summary.n}
        </span>
      </div>
      {stack}
      <div
        className="cs-ci"
        title={`${sharePct} for, 95% interval ${lowerPct} to ${upperPct}`}
      >
        <s />
        <i
          style={{
            left: `${lower * 100}%`,
            width: `${(upper - lower) * 100}%`
          }}
        />
        <b style={{ left: `${summary.share * 100}%` }} />
      </div>
      <p className="cs-mono text-[11.5px] cs-muted">
        {sharePct} for · 95% CI {lowerPct}–{upperPct}
      </p>
    </>
  );
});

// Hover tooltip box
interface TooltipProps {
  paper: ProcessedPaper;
  left: number;
  top: number;
  width: number;
}

const Tooltip: React.FC<TooltipProps> = ({ paper, left, top, width }) => {
  const isRightSide = left > width - 330;
  const yearStr =
    paper.paper.date !== null && paper.paper.date !== undefined
      ? Math.floor(paper.paper.date)
      : "n.d.";

  return (
    <div
      className="cs-tipbox"
      style={{
        top: top + 14,
        left: isRightSide ? undefined : Math.max(10, left - 20),
        right: isRightSide ? Math.max(10, width - left - 20) : undefined
      }}
    >
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--cs-line)] mb-1.5">
        <span className="cs-mono text-[11px] cs-muted">
          {yearStr} · {paper.paper.journal || "Journal"} · PMID {paper.paper.pmid}
        </span>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background:
              paper.category === "supports"
                ? "var(--cs-for-soft)"
                : paper.category === "contradicts"
                ? "var(--cs-against-soft)"
                : "rgba(137, 135, 129, 0.15)",
            color:
              paper.category === "supports"
                ? "var(--cs-for)"
                : paper.category === "contradicts"
                ? "var(--cs-against)"
                : "var(--cs-neutral)"
          }}
        >
          {paper.category === "supports"
            ? "For"
            : paper.category === "contradicts"
            ? "Against"
            : paper.category === "mixed"
            ? "Mixed"
            : "No result"}
        </span>
      </div>

      <p className="font-medium text-[13px] leading-snug line-clamp-2 text-[var(--cs-ink)]">
        {paper.paper.title}
      </p>

      {paper.finding && (
        <p className="mt-1.5 text-[12px] cs-soft italic line-clamp-2 border-l-2 border-[#381A61] dark:border-[#F9D14A] pl-2">
          "{paper.finding}"
        </p>
      )}

      <div className="mt-2 text-[11px] cs-muted flex items-center justify-between">
        <span>{paper.direct ? "Direct evidence" : "Indirect model/proxy"}</span>
        <span className="text-[#381A61] dark:text-[#F9D14A] font-bold">Click to inspect</span>
      </div>
    </div>
  );
};
