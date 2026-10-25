import React from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ArrowDown, CheckCircle2, AlertTriangle, HelpCircle, BookOpen, ExternalLink, ChevronRight, Share2, Layers } from "lucide-react";

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
              <span>
                cited as <span className="font-mono text-[#381A61] dark:text-[#F9D14A] font-bold">{step.citedAs || `[hop ${step.hop}]`}</span>
              </span>
              <span
                className="ct-pill"
                style={{
                  // @ts-expect-error CSS variable
                  "--c": step.verdict === "different" ? "var(--ct-different)" : "var(--ct-same)",
                }}
              >
                {badge.label}
              </span>
              {step.unsureness?.isGenuinelyUnsure && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#E78429]/15 text-[#E78429] border border-[#E78429]/30">
                  <HelpCircle className="w-3 h-3" />
                  <span>Unsureness Matrix: Ambiguous</span>
                </span>
              )}
            </div>

            {/* Interactive Step Node */}
            <button
              type="button"
              onClick={() => onSelectStep(step)}
              className="ct-node"
              aria-current={isSelected}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span
                  className="ct-status"
                  style={{
                    // @ts-expect-error CSS variable
                    "--c": isOrigin ? "var(--ct-origin)" : "var(--ct-same)",
                  }}
                >
                  {isOrigin ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                        <circle cx="12" cy="12" r="8"></circle>
                        <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"></circle>
                      </svg>
                      <span>Origin</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                        <path d="M5 5v6a4 4 0 0 0 4 4h10M15 11l4 4-4 4"></path>
                      </svg>
                      <span>Passes it on</span>
                    </>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#6B665E] dark:text-[#968F84]">
                  <span>{step.journal} · {step.year}</span>
                </span>
              </div>

              <span className="ct-clamp2 text-[14.5px] font-semibold leading-snug text-[#381A61] dark:text-[#FAF9F3]">
                {step.title}
              </span>

              <span className="ct-clamp2 text-[13.5px] leading-snug text-[#4A453E] dark:text-[#C8C2BA] italic">
                “{step.foundPassage}”
              </span>

              {step.verdictDescription && (
                <p className="mt-1 text-[11.5px] text-[#AB3329] dark:text-[#ED968C] font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-none" />
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

