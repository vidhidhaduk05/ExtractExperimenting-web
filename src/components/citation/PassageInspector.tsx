import React, { useState } from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ExternalLink, CheckCircle2, ChevronDown, FileText, AlertTriangle, HelpCircle } from "lucide-react";

interface PassageInspectorProps {
  step: TraceStep | null;
  rootClaim: string;
}

export const PassageInspector: React.FC<PassageInspectorProps> = ({ step, rootClaim }) => {
  const [showFullParagraph, setShowFullParagraph] = useState(false);

  if (!step) {
    return (
      <div className="ct-card p-8 text-center text-[#6B665E] dark:text-[#968F84] rounded-2xl border border-[var(--ct-line)] bg-white dark:bg-[#1E1928]">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40 text-[#381A61] dark:text-[#F9D14A]" />
        <p className="font-serif font-bold text-lg text-[#381A61] dark:text-[#F9D14A]">
          Select a Paper to Inspect
        </p>
        <p className="text-xs mt-1.5 max-w-sm mx-auto leading-relaxed">
          Click any hop along the citation telephone trail to view verbatim text context, probability readings, and the unsureness matrix.
        </p>
      </div>
    );
  }

  const badge = VERDICT_BADGE_STYLES[step.verdict] || VERDICT_BADGE_STYLES.same;
  const probs = step.probabilities || {
    matches: 0.34,
    partlyMatches: 0.39,
    goesFurther: 0.25,
    moreCautious: 0.01,
    changed: 0.01,
    notThere: 0.0,
  };

  const isOrigin = step.isOrigin;

  // Percentage values
  const pctMatches = Math.round(probs.matches * 100);
  const pctPartly = Math.round(probs.partlyMatches * 100);
  const pctFurther = Math.round(probs.goesFurther * 100);
  const pctCautious = Math.round(probs.moreCautious * 100);
  const pctChanged = Math.round(probs.changed * 100);
  const pctNotThere = Math.round(probs.notThere * 100);

  const statesScore = Math.round(step.supportScore * 100);
  const ownResultScore = Math.round(step.ownResultScore * 100);

  return (
    <div className="scroll-mt-4">
      <div className="ct-card p-5 sm:p-6 rounded-2xl border border-[#381A61]/15 dark:border-white/10 bg-white dark:bg-[#1E1928] shadow-sm">
        <article className="grid gap-4" aria-live="polite">
          {/* Header */}
          <header className="grid gap-1.5 border-b border-[var(--ct-line)] pb-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {step.hop} {step.hop === 1 ? "hop" : "hops"} from the claim · {step.year} · {step.journal}
            </p>
            <h3 className="text-base sm:text-lg font-serif font-bold leading-snug tracking-tight text-[#381A61] dark:text-[#FAF9F3]">
              {step.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{step.authors}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {step.pmcid && (
                  <a
                    className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
                    href={`https://europepmc.org/article/PMC/${step.pmcid.replace("PMC", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Europe PMC
                  </a>
                )}
                {step.pmid && (
                  <a
                    className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
                    href={`https://pubmed.ncbi.nlm.nih.gov/${step.pmid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PMID {step.pmid}
                  </a>
                )}
                {step.doi && (
                  <a
                    className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
                    href={`https://doi.org/${step.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    DOI
                  </a>
                )}
              </span>
            </div>
          </header>

          {/* Status Panel */}
          <div className="grid gap-1 rounded-xl px-3.5 py-2.5 bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--ct-line)]">
            <span
              className="ct-status"
              style={{
                // @ts-expect-error CSS variable
                "--c": isOrigin ? "var(--ct-origin)" : "var(--ct-same)",
              }}
            >
              {isOrigin ? (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="flex-none"
                  >
                    <circle cx="12" cy="12" r="8"></circle>
                    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"></circle>
                  </svg>
                  <span>Origin</span>
                </>
              ) : (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="flex-none"
                  >
                    <path d="M5 5v6a4 4 0 0 0 4 4h10M15 11l4 4-4 4"></path>
                  </svg>
                  <span>Passes it on</span>
                </>
              )}
            </span>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              {isOrigin
                ? "This paper reports its own primary result on what it is cited for. The trail originates here."
                : "This paper cites earlier literature for this statement rather than demonstrating it originally."}
            </p>
          </div>

          {/* Citing Sentence vs What This Paper Says */}
          <div className="grid overflow-hidden rounded-xl border border-[var(--ct-line)]">
            {/* The Citing Sentence */}
            <section
              className="grid gap-1 px-3.5 py-3 bg-white dark:bg-zinc-900/60"
              aria-label="The sentence that cites this paper"
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                The citing sentence
              </p>
              <p className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                {step.citingSentence}
              </p>
            </section>

            {/* What this paper says */}
            <section
              className="grid gap-1.5 border-t border-[var(--ct-line)] px-3.5 py-3 bg-[#FAF9F3] dark:bg-zinc-900/40"
              aria-label="What this paper says"
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                What this paper says · {step.passageSource === "abstract" ? "Abstract" : "Full text"}
              </p>
              <div className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                <span className="text-zinc-400">… </span>
                <mark className="bg-[#F9D14A] text-zinc-900 font-semibold px-1 py-0.5 rounded">
                  {step.foundPassage}
                </mark>
                <span className="text-zinc-400"> …</span>
              </div>

              {step.verdictDescription && (
                <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-none mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>{step.verdictDescription}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowFullParagraph(!showFullParagraph)}
                className="justify-self-start text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline pt-1"
              >
                {showFullParagraph ? "Hide detailed paragraph context" : "Show paragraph context"}
              </button>

              {showFullParagraph && (
                <div className="mt-1 p-3 rounded-lg bg-black/5 dark:bg-white/5 text-[11.5px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-mono">
                  {step.paragraphId && (
                    <span className="text-zinc-400 block text-[10px] mb-1 uppercase font-sans">
                      Section / Paragraph: {step.paragraphId}
                    </span>
                  )}
                  “{step.foundPassage}”
                </div>
              )}
            </section>
          </div>

          {/* Comparison Against Original Claim */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 border-t border-[var(--ct-line)] pt-3">
            <span>Against the claim you started with:</span>
            <span
              className="ct-pill"
              style={{
                // @ts-expect-error CSS variable
                "--c":
                  step.verdict === "different" || step.verdict === "not_found"
                    ? "var(--ct-different)"
                    : step.verdict === "stronger"
                    ? "#E78429"
                    : "var(--ct-same)",
              }}
            >
              {badge.label}
            </span>
          </div>

          {/* Unsureness Matrix Card */}
          {step.unsureness && (
            <div className="rounded-xl p-3 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Unsureness Matrix (Local Laya System-1)
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  Margin: {Math.round(step.unsureness.margin * 100)}% · Entropy: {step.unsureness.entropyScore.toFixed(2)}
                </span>
              </div>
              {step.unsureness.reason && (
                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">
                  {step.unsureness.reason}
                </p>
              )}
              <div className="text-[10.5px] text-zinc-500">
                Audit recommendation:{" "}
                <strong className="capitalize text-zinc-700 dark:text-zinc-200">
                  {step.unsureness.recommendation.replace(/_/g, " ")}
                </strong>
              </div>
            </div>
          )}

          {/* Readings behind this result collapsible */}
          <details className="group grid gap-2 border-t border-[var(--ct-line)] pt-3" open>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center justify-between">
              <span>Readings behind this result</span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            </summary>

            <div className="mt-3 grid gap-3">
              <div className="ct-bars text-xs" role="list" aria-label="How the citing sentence compares">
                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">Matches</span>
                  <span className="bar">
                    <b style={{ width: `${pctMatches}%`, "--c": "var(--ct-same)" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctMatches}%</span>
                </div>

                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">Partly matches</span>
                  <span className="bar">
                    <b style={{ width: `${pctPartly}%`, "--c": "#0ea5e9" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctPartly}%</span>
                </div>

                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">Goes further</span>
                  <span className="bar">
                    <b style={{ width: `${pctFurther}%`, "--c": "#E78429" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctFurther}%</span>
                </div>

                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">More cautious</span>
                  <span className="bar">
                    <b style={{ width: `${pctCautious}%`, "--c": "#7C4B73" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctCautious}%</span>
                </div>

                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">Changed</span>
                  <span className="bar">
                    <b style={{ width: `${pctChanged}%`, "--c": "var(--ct-different)" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctChanged}%</span>
                </div>

                <div role="listitem" className="contents">
                  <span className="text-zinc-600 dark:text-zinc-400">Not there</span>
                  <span className="bar">
                    <b style={{ width: `${pctNotThere}%`, "--c": "#94a3b8" } as any} />
                  </span>
                  <span className="font-mono text-right text-zinc-500 font-semibold">{pctNotThere}%</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                States what it's cited for: <strong>{statesScore}%</strong> · Own result: <strong>{ownResultScore}%</strong> · Read from <strong>the {step.passageSource.replace("_", " ")}</strong>. Calibrated via local ModernBERT System-1.
              </p>
            </div>
          </details>
        </article>
      </div>
    </div>
  );
};
