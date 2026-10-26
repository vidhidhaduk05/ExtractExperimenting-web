import React from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ArrowRight, GitBranch } from "lucide-react";

interface TrailGraphViewProps {
  steps: TraceStep[];
  selectedStepId: string;
  onSelectStep: (step: TraceStep) => void;
  rootPaper: {
    id: string;
    title: string;
    authors: string;
    year: number;
    journal: string;
  };
}

export const TrailGraphView: React.FC<TrailGraphViewProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
  rootPaper,
}) => {
  return (
    <div className="rounded-xl border border-[#d2c2cb] bg-white p-5 sm:p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between border-b border-[#eee7ec] pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[#814d75]" />
          <h3 className="font-serif font-bold text-base text-[#3a0f34]">
            Citation Distortion Trail Graph
          </h3>
        </div>
        <span className="text-xs text-[#81737b] font-mono">
          Direction: Citing Manuscript ➔ Intermediate Hops ➔ Primary Origin
        </span>
      </div>

      {/* Visual Interactive Node-Link DAG */}
      <div className="relative overflow-x-auto pb-4 pt-2">
        <div className="flex items-center gap-4 min-w-[700px] justify-between relative">
          {/* Root Paper Node */}
          <div className="flex-1 max-w-[210px] p-4 rounded-xl border border-[#d2c2cb] bg-[#eee7ec] text-left shadow-2xs relative group">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#3a0f34] block mb-1 font-sans">
              Start: Citing Manuscript
            </span>
            <h4 className="font-serif font-bold text-xs text-[#3a0f34] line-clamp-2">
              {rootPaper.title}
            </h4>
            <p className="text-[11px] text-[#62535d] mt-1 font-sans">
              {rootPaper.authors} · {rootPaper.year}
            </p>
          </div>

          {/* Stepper Hops */}
          {steps.map((step) => {
            const isSelected = step.id === selectedStepId;
            const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;
            const isDistorted = step.verdict === "different" || step.verdict === "not_found" || step.verdict === "stronger";

            return (
              <React.Fragment key={step.id}>
                {/* Arrow Connector */}
                <div className="flex flex-col items-center justify-center px-1">
                  <span className="text-[10px] font-mono text-[#81737b] mb-1">
                    {step.citedAs || `[hop ${step.hop}]`}
                  </span>
                  <div className="flex items-center">
                    <div className={`w-8 h-0.5 ${isDistorted ? "bg-rose-400 border-dashed" : "bg-[#d2c2cb]"}`} />
                    <ArrowRight className={`w-4 h-4 -ml-1 ${isDistorted ? "text-rose-700" : "text-[#3a0f34]"}`} />
                  </div>
                  {isDistorted && (
                    <span className="text-[9px] font-bold text-rose-700 mt-1 uppercase tracking-tighter font-sans">
                      Drift Point
                    </span>
                  )}
                </div>

                {/* Hop Node */}
                <button
                  type="button"
                  onClick={() => onSelectStep(step)}
                  className={`flex-1 max-w-[230px] p-4 rounded-xl border text-left transition-all cursor-pointer relative shadow-2xs ${
                    isSelected
                      ? "ring-2 ring-[#814d75] bg-white border-[#3a0f34] shadow-md"
                      : "bg-[#fbf9f4] border-[#d2c2cb] hover:border-[#814d75]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#81737b] font-sans">
                      {step.isOrigin ? "Primary Origin" : `Hop ${step.hop}`}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                  </div>

                  <h4 className="font-serif font-bold text-xs text-[#3a0f34] line-clamp-2">
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-[#62535d] mt-1 font-sans">
                    {step.journal} · {step.year}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-[#eee7ec] text-[10.5px] text-[#4f444b] line-clamp-2 italic font-serif">
                    “{step.foundPassage}”
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
