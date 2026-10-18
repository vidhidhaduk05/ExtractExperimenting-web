import React, { useState } from "react";
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
    <div className="space-y-4">
      {steps.map((step) => {
        const isSelected = step.id === selectedStepId;
        const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;

        return (
          <div key={step.id} className="relative">
            {/* Edge Connector / Citing Link */}
            <div className="flex items-center gap-2 mb-2 ml-4">
              <span className="text-[11.5px] font-mono px-2 py-0.5 rounded bg-[#381A61]/10 dark:bg-white/10 text-[#381A61] dark:text-[#F9D14A] font-bold">
                cited as {step.citedAs || `[hop ${step.hop}]`}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                {badge.label}
              </span>
              {step.unsureness.isGenuinelyUnsure && (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#E78429]/15 text-[#E78429] border border-[#E78429]/30">
                  <HelpCircle className="w-3 h-3" />
                  <span>Unsureness Matrix: Ambiguous</span>
                </span>
              )}
            </div>

            {/* Step Card Node */}
            <button
              type="button"
              onClick={() => onSelectStep(step)}
              className={`w-full text-left rounded-2xl p-4 sm:p-5 transition-all border ${
                isSelected
                  ? "bg-white dark:bg-[#221D2C] border-[#381A61] dark:border-[#F9D14A] shadow-md ring-2 ring-[#381A61]/20 dark:ring-[#F9D14A]/20"
                  : "bg-white/70 dark:bg-[#1A1622] border-[#381A61]/10 dark:border-white/10 hover:border-[#381A61]/30 hover:bg-white dark:hover:bg-[#221D2C] shadow-2xs"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {step.isOrigin ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#88A0DC]/20 text-[#381A61] dark:text-[#88A0DC] border border-[#88A0DC]/40">
                      <span className="w-2 h-2 rounded-full bg-[#381A61] dark:bg-[#88A0DC]" />
                      Primary Origin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#7C4B73]/15 text-[#7C4B73] dark:text-[#C8C2BA]">
                      <ArrowDown className="w-3 h-3" />
                      Passes It On (Hop {step.hop})
                    </span>
                  )}
                  <span className="text-xs text-[#6B665E] dark:text-[#968F84]">
                    {step.journal} ┬╖ {step.year}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-[#381A61] dark:text-[#F9D14A] font-semibold">
                  <span>Inspect passage</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              <h4 className="font-serif font-bold text-[15px] sm:text-[16px] text-[#381A61] dark:text-[#FAF9F3] leading-snug line-clamp-2 mb-2">
                {step.title}
              </h4>

              <div className="space-y-1.5 rounded-xl bg-[#FAF9F3] dark:bg-[#14111A] p-3 border border-[#381A61]/5 dark:border-white/5">
                <div className="flex items-center justify-between text-[11px] text-[#6B665E] dark:text-[#968F84]">
                  <span>Matched passage ({step.passageSource}):</span>
                  {step.paragraphId && <span className="font-mono text-[10.5px]">{step.paragraphId}</span>}
                </div>
                <p className="text-[13px] text-[#141413] dark:text-[#C8C2BA] italic leading-relaxed line-clamp-2">
                  ΓÇ£{step.foundPassage}ΓÇ¥
                </p>
              </div>

              {step.verdictDescription && (
                <p className="mt-2 text-[12px] text-[#AB3329] dark:text-[#ED968C] font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-none" />
                  <span>{step.verdictDescription}</span>
                </p>
              )}
            </button>

            {/* Render nested children steps recursively */}
            {step.nextSteps && step.nextSteps.length > 0 && (
              <div className="pl-6 sm:pl-8 mt-3 border-l-2 border-dashed border-[#381A61]/20 dark:border-white/20">
                <TrailViewer
                  steps={step.nextSteps}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
