import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, AlertOctagon } from "lucide-react";
import { RigorCheckItem, RigorDomain } from "../../data/dubowitzRigorData";

interface RigorFingerprintProps {
  completenessIndex: number;
  checks: RigorCheckItem[];
  domains: RigorDomain[];
  selectedCheck: RigorCheckItem;
  onSelectCheck: (id: string) => void;
  selectedDomain: string;
  onSelectDomain: (domainId: string) => void;
  onShowOnPage?: (page: number) => void;
}

export const RigorFingerprint: React.FC<RigorFingerprintProps> = ({
  completenessIndex,
  checks,
  domains,
  selectedCheck,
  onSelectCheck,
  selectedDomain,
  onSelectDomain,
  onShowOnPage,
}) => {
  const selectedSpoke = selectedCheck.spoke;

  // Domain arc SVG definitions matching the published geometry
  const domainArcs = [
    {
      id: "design",
      label: "Study design",
      score: 67,
      path: "M437.78 67.76 A260 260 0 0 1 644.24 235.85",
      textX: 576.78,
      textY: 79.86,
      align: "start" as const,
    },
    {
      id: "stats",
      label: "Statistics",
      score: 80,
      path: "M656.75 284.01 A260 260 0 0 1 617.01 468.21",
      textX: 673.7,
      textY: 388.05,
      align: "start" as const,
    },
    {
      id: "materials",
      label: "Materials",
      score: 89,
      path: "M585.75 506.92 A260 260 0 0 1 349.41 580.03",
      textX: 482.74,
      textY: 606.49,
      align: "start" as const,
    },
    {
      id: "openness",
      label: "Data & code",
      score: 62,
      path: "M301.75 565.72 A260 260 0 0 1 164.95 436.13",
      textX: 207.44,
      textY: 542.28,
      align: "end" as const,
    },
    {
      id: "ethics",
      label: "Ethics & disclosure",
      score: 89,
      path: "M148.08 389.32 A260 260 0 0 1 181.81 183.61",
      textX: 123.69,
      textY: 283.7,
      align: "end" as const,
    },
    {
      id: "claims",
      label: "Claims",
      score: 87,
      path: "M212.74 144.63 A260 260 0 0 1 362.22 67.76",
      textX: 271.95,
      textY: 48,
      align: "end" as const,
    },
  ];

  return (
    <div className="rs-card">
      <div className="rs-head">
        <span>Rigor fingerprint</span>
        <span className="rs-mono text-xs font-semibold">{checks.length} checks apply</span>
      </div>

      {/* Radial Spoke Ring SVG */}
      <div className="rs-ring-wrap px-2 sm:px-4 pt-2 pb-1">
        <svg
          className="rs-ring"
          viewBox="-70 0 940 650"
          role="img"
          aria-label={`Rigor fingerprint: ${checks.length} reporting checks in 6 domains, completeness index ${completenessIndex}`}
        >
          {/* Concentric Guide Circles */}
          <circle cx="400" cy="325" r="96" fill="none" stroke="var(--rs-line-soft)" strokeWidth="1" />
          <circle cx="400" cy="325" r="153.7" fill="none" stroke="var(--rs-line)" strokeWidth="1" strokeDasharray="3 5" />
          <circle cx="400" cy="325" r="203.4" fill="none" stroke="var(--rs-line)" strokeWidth="1" strokeDasharray="3 5" />
          <circle cx="400" cy="325" r="246" fill="none" stroke="var(--rs-line)" strokeWidth="1" />

          {/* Scale Axis Labels */}
          <text x="400" y="225" textAnchor="middle" className="axis">0%</text>
          <text x="400" y="175.3" textAnchor="middle" className="axis">35%</text>
          <text x="400" y="125.6" textAnchor="middle" className="axis">70%</text>
          <text x="400" y="83" textAnchor="middle" className="axis">100%</text>

          {/* Radial Spokes */}
          {checks.map((c) => {
            const sp = c.spoke;
            if (!sp) return null;
            const isSelected = c.id === selectedCheck.id;
            return (
              <g key={c.id}>
                {/* Background Spoke Track */}
                <line
                  x1={sp.x1}
                  y1={sp.y1}
                  x2={sp.x2}
                  y2={sp.y2}
                  stroke="var(--rs-track)"
                  strokeWidth={isSelected ? 6 : 4.5}
                  className="spoke"
                />
                {/* Filled Value Spoke */}
                <line
                  x1={sp.x1}
                  y1={sp.y1}
                  x2={sp.x2}
                  y2={sp.y2}
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={sp.dashOffset}
                  stroke={sp.color}
                  strokeWidth={isSelected ? 7 : 4.5}
                  className="spoke v"
                />
                {/* Invisible Click Target */}
                <line
                  x1={sp.x1}
                  y1={sp.y1}
                  x2={sp.x2}
                  y2={sp.y2}
                  className="hit"
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.label}: ${sp.verdict}, evidence ${sp.evidence}%`}
                  onClick={() => onSelectCheck(c.id)}
                />
              </g>
            );
          })}

          {/* Selection Ring Marker around active spoke tip */}
          {selectedSpoke && (
            <circle
              cx={selectedSpoke.x2}
              cy={selectedSpoke.y2}
              r={7}
              fill="none"
              stroke="var(--rs-ink)"
              strokeWidth={2}
              pointerEvents="none"
            />
          )}

          {/* Outer Domain Boundary Arcs & Labels */}
          {domainArcs.map((d) => (
            <g
              key={d.id}
              onClick={() => onSelectDomain(selectedDomain === d.id ? "all" : d.id)}
              className="cursor-pointer transition-opacity hover:opacity-80"
            >
              <path
                d={d.path}
                fill="none"
                stroke={selectedDomain === d.id ? "var(--rs-accent)" : "var(--rs-ink-3)"}
                strokeWidth={selectedDomain === d.id ? 2.5 : 1.5}
                strokeLinecap="round"
              />
              <text x={d.textX} y={d.textY} textAnchor={d.align} className="dlabel">
                <tspan>{d.label}</tspan>
                <tspan className="dscore" x={d.textX} dy={22}>
                  {d.score}
                </tspan>
              </text>
            </g>
          ))}
        </svg>

        {/* Central Completeness Index Badge */}
        <div className="rs-center">
          <div className="big">{completenessIndex}</div>
          <div className="lbl">Completeness index</div>
          <div className="rs-mono text-[11px] rs-muted">out of 100</div>
        </div>
      </div>

      {/* Legend & Details */}
      <div className="grid gap-3.5 px-5 pb-5 pt-1">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs rs-soft">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500 text-white" />
            Reported
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border border-amber-500 overflow-hidden inline-flex items-center">
              <span className="w-1/2 h-full bg-amber-500" />
            </span>
            Unclear
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-rose-500" />
            Missing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600 fill-rose-600 text-white" />
            Warning sign found
          </span>
          <span className="rs-mono text-[11px] rs-muted">spoke length = evidence it is reported</span>
        </div>

        {/* Selected Check Card */}
        <div className="overflow-hidden rounded-xl border border-[var(--rs-line)] rs-panel p-4 space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rs-mono text-[10px] font-bold uppercase tracking-wider rs-muted">Selected</span>
            <b className="text-sm font-semibold">{selectedCheck.label}</b>
            {selectedCheck.guideline && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300">
                {selectedCheck.guideline}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            {selectedCheck.outcome === "good" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : selectedCheck.outcome === "mid" ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-500" />
            )}
            <span>{selectedCheck.spoke?.verdict || "Evaluated"}</span>
            <span className="rs-mono font-normal rs-muted">
              evidence {selectedCheck.evidence}%
            </span>
          </div>

          <p className="text-xs rs-soft leading-relaxed">{selectedCheck.question}</p>

          <blockquote className="rs-quote text-xs leading-relaxed" style={{ "--c": selectedCheck.color } as any}>
            “{selectedCheck.quote}”
          </blockquote>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] rs-muted rs-mono pt-1">
            <span>{selectedCheck.location}</span>
            {onShowOnPage && (
              <button
                type="button"
                onClick={() => onShowOnPage(selectedCheck.page)}
                className="font-sans text-xs underline text-blue-600 dark:text-blue-400 hover:text-blue-700 font-semibold"
              >
                Show on page {selectedCheck.page} →
              </button>
            )}
          </div>
        </div>

        {/* 6 Domain Score Action Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {domains.map((dom) => (
            <button
              key={dom.id}
              type="button"
              onClick={() => onSelectDomain(selectedDomain === dom.id ? "all" : dom.id)}
              className={`grid gap-1.5 rounded-lg border p-2.5 text-left transition-all ${
                selectedDomain === dom.id
                  ? "border-[var(--rs-accent)] bg-[var(--rs-accent-soft)] ring-1 ring-[var(--rs-accent)]"
                  : "border-[var(--rs-line)] bg-[var(--rs-card)] hover:border-zinc-400"
              }`}
            >
              <span className="flex items-baseline justify-between gap-1.5 text-xs">
                <span className="font-medium truncate">{dom.label}</span>
                <span className="rs-mono font-bold text-sm">{dom.score}</span>
              </span>
              <span className="rs-bar">
                <b style={{ width: `${dom.score}%` }} />
              </span>
              <small className="text-[11px] rs-muted truncate">
                {dom.good} of {dom.total} in good shape
              </small>
            </button>
          ))}
        </div>

        <p className="mx-auto max-w-[62ch] text-center text-xs rs-muted">
          This measures how completely a paper reports what it did. It does not judge whether the findings are right.
        </p>
      </div>
    </div>
  );
};
