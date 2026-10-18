import React from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ExternalLink, CheckCircle2, AlertTriangle, HelpCircle, FileText, Bookmark, Share2 } from "lucide-react";

interface PassageInspectorProps {
  step: TraceStep | null;
  rootClaim: string;
}

export const PassageInspector: React.FC<PassageInspectorProps> = ({ step, rootClaim }) => {
  if (!step) {
    return (
      <div className="rounded-2xl border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#1A1622] p-8 text-center text-[#6B665E] dark:text-[#968F84]">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-serif font-bold text-lg text-[#381A61] dark:text-[#F9D14A]">Select a Paper to Inspect</p>
        <p className="text-sm mt-1">Click any hop along the citation telephone trail to view full text context, probability readings, and the unsureness matrix.</p>
      </div>
    );
  }

  const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;
  const probs = step.probabilities;

  return (
    <article className="rounded-2xl border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C] p-5 sm:p-6 shadow-sm space-y-5">
      {/* Article Header */}
      <header className="space-y-2 border-b border-[#381A61]/10 dark:border-white/10 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono text-[#6B665E] dark:text-[#968F84]">
            Hop {step.hop} · {step.journal} ({step.year})
          </span>
          <div className="flex items-center gap-2">
            {step.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${step.pmid}/`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#381A61] dark:text-[#F9D14A] hover:underline inline-flex items-center gap-1"
              >
                <span>PMID {step.pmid}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {step.pmcid && (
              <a
                href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${step.pmcid}/`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#381A61] dark:text-[#F9D14A] hover:underline inline-flex items-center gap-1"
              >
                <span>PMC</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {step.doi && (
              <a
                href={`https://doi.org/${step.doi}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-[#381A61] dark:text-[#F9D14A] hover:underline inline-flex items-center gap-1"
              >
                <span>DOI</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <h3 className="font-serif font-bold text-lg sm:text-xl text-[#381A61] dark:text-[#FAF9F3] leading-snug">
          {step.title}
        </h3>
        <p className="text-xs text-[#6B665E] dark:text-[#968F84]">{step.authors}</p>
      </header>

      {/* Citing Context vs Found Passage Comparison */}
      <div className="space-y-3">
        {/* The Citing Sentence */}
        <div className="rounded-xl border border-[#381A61]/10 dark:border-white/10 p-3.5 bg-[#FAF9F3] dark:bg-[#14111A]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] mb-1">
            The Citing Sentence (What the citing author claimed)
          </p>
          <p className="text-sm text-[#141413] dark:text-[#FAF9F3] leading-relaxed">
            {step.citingSentence}
          </p>
        </div>

        {/* What this paper actually says */}
        <div className="rounded-xl border border-[#381A61]/15 dark:border-white/15 p-4 bg-white dark:bg-[#1A1622] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
            <span>What this paper actually says ({step.passageSource})</span>
            {step.paragraphId && <span>{step.paragraphId}</span>}
          </div>
          <p className="text-sm text-[#141413] dark:text-[#C8C2BA] leading-relaxed italic bg-[#F9D14A]/10 dark:bg-[#F9D14A]/5 p-3 rounded-lg border-l-4 border-[#F9D14A]">
            “{step.foundPassage}”
          </p>
        </div>
      </div>

      {/* Verdict & Impact on Original Claim */}
      <div className="rounded-xl p-3.5 border border-[#381A61]/10 dark:border-white/10 bg-[#FAF9F3] dark:bg-[#14111A] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#6B665E] dark:text-[#968F84]">Verdict on trail:</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-[#141413] dark:text-[#C8C2BA]">
          {step.verdictDescription}
        </p>
      </div>

      {/* Genuine Unsureness Calibration Matrix */}
      <div className="rounded-xl border border-[#E78429]/30 bg-[#E78429]/5 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[#E78429]" />
            <h4 className="font-serif font-bold text-sm text-[#381A61] dark:text-[#F9D14A]">
              Unsureness & Calibration Matrix
            </h4>
          </div>
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
            step.unsureness.isGenuinelyUnsure
              ? "bg-[#E78429]/20 text-[#E78429] border border-[#E78429]/40"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
          }`}>
            {step.unsureness.isGenuinelyUnsure ? "Ambiguous (Audit Advised)" : "Calibrated High-Certainty"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-white/60 dark:bg-[#221D2C]/60 border border-[#381A61]/5">
            <span className="text-[#6B665E] dark:text-[#968F84] block text-[10.5px]">Probability Margin</span>
            <span className="font-mono font-bold text-[13px] text-[#381A61] dark:text-[#F9D14A]">
              {(step.unsureness.margin * 100).toFixed(1)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-white/60 dark:bg-[#221D2C]/60 border border-[#381A61]/5">
            <span className="text-[#6B665E] dark:text-[#968F84] block text-[10.5px]">Semantic Entropy</span>
            <span className="font-mono font-bold text-[13px] text-[#381A61] dark:text-[#F9D14A]">
              {step.unsureness.entropyScore.toFixed(2)}
            </span>
          </div>
        </div>

        {step.unsureness.reason && (
          <p className="text-[12px] text-[#4A453E] dark:text-[#C8C2BA] leading-snug">
            <strong>Diagnostic:</strong> {step.unsureness.reason}
          </p>
        )}
      </div>

      {/* Model Probability Readings */}
      <div className="space-y-2 pt-2 border-t border-[#381A61]/10 dark:border-white/10">
        <h4 className="text-xs font-bold text-[#6B665E] dark:text-[#968F84] uppercase tracking-wider">
          Classification Probabilities
        </h4>
        <div className="space-y-1.5 text-xs">
          {[
            { label: "Matches exactly", val: probs.matches, color: "bg-[#88A0DC]" },
            { label: "Partly matches", val: probs.partlyMatches, color: "bg-[#F9D14A]" },
            { label: "Goes further (Overclaimed)", val: probs.goesFurther, color: "bg-[#E78429]" },
            { label: "More cautious", val: probs.moreCautious, color: "bg-[#7C4B73]" },
            { label: "Changed / Inverted", val: probs.changed, color: "bg-[#AB3329]" },
            { label: "Not addressed", val: probs.notThere, color: "bg-gray-400" },
          ].map((item) => (
            <div key={item.label} className="grid grid-cols-[160px_1fr_45px] items-center gap-2">
              <span className="text-[#4A453E] dark:text-[#C8C2BA] truncate">{item.label}</span>
              <div className="h-2 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                <div
                  className={`h-full ${item.color} rounded-full transition-all`}
                  style={{ width: `${Math.round(item.val * 100)}%` }}
                />
              </div>
              <span className="font-mono text-right text-[11px] text-[#6B665E] dark:text-[#968F84]">
                {Math.round(item.val * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};
