import React from "react";
import { TraceStep, CitationTelephoneData, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ArrowRight, AlertTriangle, GitBranch, Layers, CheckCircle2 } from "lucide-react";

export interface TrailGraphViewProps {
  data: CitationTelephoneData;
  selectedStep: TraceStep | null;
  onSelectStep: (step: TraceStep) => void;
}

export const TrailGraphView: React.FC<TrailGraphViewProps> = ({
  data,
  selectedStep,
  onSelectStep,
}) => {
  // Collect all steps in trail order
  const allSteps: TraceStep[] = [];
  const collect = (steps: TraceStep[]) => {
    for (const step of steps) {
      allSteps.push(step);
      if (step.nextSteps) collect(step.nextSteps);
    }
  };
  collect(data.steps);

  return (
    <div className="rounded-2xl border border-[#381A61]/15 dark:border-white/10 bg-white dark:bg-[#1E1928] p-5 sm:p-6 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ct-line)] pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
          <h3 className="font-serif font-bold text-base text-[#381A61] dark:text-[#F9D14A]">
            Citation Distortion Directed Graph
          </h3>
        </div>
        <span className="text-xs text-zinc-500 font-mono">
          Citing Manuscript ➔ Intermediate Hops ➔ Primary Origin
        </span>
      </div>

      {/* Visual Interactive Node-Link DAG */}
      <div className="relative overflow-x-auto pb-4 pt-2">
        <div className="flex items-center gap-4 min-w-[720px] justify-between relative">
          {/* Root Paper Node */}
          <div className="flex-1 max-w-[220px] p-4 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/30 text-left shadow-2xs relative">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 block mb-1">
              Start: Citing Manuscript
            </span>
            <h4 className="font-serif font-bold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-2">
              {data.rootPaper.title}
            </h4>
            <p className="text-[11px] text-zinc-500 mt-1">
              {data.rootPaper.authors} · {data.rootPaper.year}
            </p>
          </div>

          {/* Stepper Hops */}
          {allSteps.map((step) => {
            const isSelected = selectedStep ? step.id === selectedStep.id : false;
            const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;
            const isDistorted =
              step.verdict === "different" ||
              step.verdict === "not_found" ||
              step.verdict === "stronger";

            return (
              <React.Fragment key={step.id}>
                {/* Arrow Connector */}
                <div className="flex flex-col items-center justify-center px-1">
                  <span className="text-[10px] font-mono text-zinc-500 mb-1">
                    {step.citedAs || `[hop ${step.hop}]`}
                  </span>
                  <div className="flex items-center">
                    <div
                      className={`w-8 h-0.5 ${
                        isDistorted
                          ? "bg-rose-400 border-dashed"
                          : "bg-[#381A61]/30 dark:bg-white/30"
                      }`}
                    />
                    <ArrowRight
                      className={`w-4 h-4 -ml-1 ${
                        isDistorted
                          ? "text-rose-500"
                          : "text-[#381A61] dark:text-[#F9D14A]"
                      }`}
                    />
                  </div>
                  {isDistorted && (
                    <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 mt-1 uppercase tracking-tighter">
                      Drift Point
                    </span>
                  )}
                </div>

                {/* Hop Node */}
                <button
                  type="button"
                  onClick={() => onSelectStep(step)}
                  className={`flex-1 max-w-[240px] p-4 rounded-xl border text-left transition-all cursor-pointer relative shadow-2xs ${
                    isSelected
                      ? "ring-2 ring-[#381A61] dark:ring-[#F9D14A] bg-white dark:bg-[#251F33] border-transparent shadow-md"
                      : "bg-white/80 dark:bg-[#1A1622] border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {step.isOrigin ? "Primary Origin" : `Hop ${step.hop}`}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <h4 className="font-serif font-bold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-2">
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {step.authors} · {step.year}
                  </p>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
