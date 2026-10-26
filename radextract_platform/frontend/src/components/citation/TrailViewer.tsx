import React from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { AlertTriangle, HelpCircle } from "lucide-react";

interface TrailViewerProps {
  steps: TraceStep[];
  selectedStepId: string;
  onSelectStep: (step: TraceStep) => void;
}

export const TrailViewer: React.FC<TrailViewerProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
}) => {
  return (
    <ol className="ct-tree">
      {steps.map((step) => {
        const isSelected = step.id === selectedStepId;
        const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;
        const isOrigin = step.isOrigin || step.verdict === "same";

        return (
          <li key={step.id}>
            {/* Edge Link */}
            <div className="ct-edge">
              <span className="font-sans text-xs text-[#62535d]">
                cited as <span className="font-mono text-[#3a0f34] font-bold">{step.citedAs || `[hop ${step.hop}]`}</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border font-sans ${badge.bg} ${badge.text} ${badge.border}`}
              >
                {badge.label}
              </span>
              {step.unsureness?.isGenuinelyUnsure && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#ffdea6]/60 text-[#7c5800] border border-[#ffdea6] font-sans">
                  <HelpCircle className="w-3 h-3" />
                  <span>Unsureness Matrix: Ambiguous</span>
                </span>
              )}
            </div>

            {/* Interactive Step Node */}
            <button
              type="button"
              onClick={() => onSelectStep(step)}
              className={`w-full text-left p-4 rounded-xl border transition-all mb-3 ${
                isSelected
                  ? "bg-white border-[#3a0f34] ring-2 ring-[#814d75] shadow-xs"
                  : "bg-[#fbf9f4] border-[#d2c2cb] hover:border-[#814d75]"
              }`}
              aria-current={isSelected}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1">
                <span
                  className="inline-flex items-center gap-1 text-xs font-bold font-sans text-[#3a0f34]"
                >
                  {isOrigin ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-[#814d75]">
                        <circle cx="12" cy="12" r="8"></circle>
                        <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"></circle>
                      </svg>
                      <span>Origin</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-[#3a0f34]">
                        <path d="M5 5v6a4 4 0 0 0 4 4h10M15 11l4 4-4 4"></path>
                      </svg>
                      <span>Passes it on</span>
                    </>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#81737b] font-sans">
                  <span>{step.journal} · {step.year}</span>
                </span>
              </div>

              <span className="block text-[14.5px] font-serif font-bold leading-snug text-[#3a0f34] mb-1">
                {step.title}
              </span>

              <span className="block text-[13px] leading-snug text-[#4f444b] italic font-serif">
                “{step.foundPassage}”
              </span>

              {step.verdictDescription && (
                <p className="mt-2 text-[11.5px] text-rose-800 font-medium flex items-center gap-1.5 font-sans">
                  <AlertTriangle className="w-3.5 h-3.5 flex-none text-rose-700" />
                  <span>{step.verdictDescription}</span>
                </p>
              )}
            </button>

            {/* Recursive nested steps */}
            {step.nextSteps && step.nextSteps.length > 0 && (
              <TrailViewer
                steps={step.nextSteps}
                selectedStepId={selectedStepId}
                onSelectStep={onSelectStep}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};
