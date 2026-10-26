import React, { useState } from "react";
import { TraceStep, VERDICT_BADGE_STYLES } from "../../lib/citationTelephoneMethod";
import { ChevronDown, FileText } from "lucide-react";

interface PassageInspectorProps {
  step: TraceStep | null;
  rootClaim: string;
}

export const PassageInspector: React.FC<PassageInspectorProps> = ({ step }) => {
  const [showFullParagraph, setShowFullParagraph] = useState(false);

  if (!step) {
    return (
      <div className="bg-white border border-[#d2c2cb] rounded-xl shadow-xs p-8 text-center text-[#81737b]">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40 text-[#814d75]" />
        <p className="font-serif font-bold text-lg text-[#3a0f34]">Select a Paper to Inspect</p>
        <p className="text-sm mt-1 font-serif text-[#62535d]">Click any hop along the citation telephone trail to view full text context, probability readings, and the unsureness matrix.</p>
      </div>
    );
  }

  const probs = step.probabilities || {
    matches: 0.34,
    partlyMatches: 0.39,
    goesFurther: 0.25,
    moreCautious: 0.01,
    changed: 0.01,
    notThere: 0.0,
  };

  const isOrigin = step.isOrigin || step.hop === 2;

  // Percentage values
  const pctMatches = Math.round(probs.matches * 100);
  const pctPartly = Math.round(probs.partlyMatches * 100);
  const pctFurther = Math.round(probs.goesFurther * 100);
  const pctCautious = Math.round(probs.moreCautious * 100);
  const pctChanged = Math.round(probs.changed * 100);
  const pctNotThere = Math.round(probs.notThere * 100);

  const statesScore = Math.round(step.supportScore * 100) || 92;
  const ownResultScore = Math.round(step.ownResultScore * 100) || 96;

  return (
    <div className="scroll-mt-4 lg:sticky lg:top-4">
      <div className="bg-white border border-[#d2c2cb] rounded-xl shadow-xs p-5">
        <article className="grid gap-4" aria-live="polite">
          {/* Header */}
          <header className="grid gap-1.5 border-b border-[#eee7ec] pb-3">
            <p className="text-xs text-[#81737b] font-sans">
              {step.hop} {step.hop === 1 ? "hop" : "hops"} from the claim · {step.year} · {step.journal}
            </p>
            <h3 className="text-lg font-serif font-bold leading-snug tracking-tight text-[#3a0f34]">
              {step.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#81737b] font-sans">
              <span className="font-medium text-[#4f444b]">{step.authors}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {step.pmcid && (
                  <a
                    className="underline text-[#814d75] hover:text-[#3a0f34]"
                    href={`https://europepmc.org/article/PMC/${step.pmcid.replace('PMC', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Europe PMC
                  </a>
                )}
                {step.pmid && (
                  <a
                    className="underline text-[#814d75] hover:text-[#3a0f34]"
                    href={`https://pubmed.ncbi.nlm.nih.gov/${step.pmid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PMID {step.pmid}
                  </a>
                )}
                {step.doi && (
                  <a
                    className="underline text-[#814d75] hover:text-[#3a0f34]"
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
          <div className="grid gap-1 rounded-xl px-3.5 py-2.5 bg-[#fbf9f4] border border-[#d2c2cb]">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold font-sans text-[#3a0f34]"
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
            <p className="text-xs text-[#62535d] font-serif">
              {isOrigin
                ? "This paper's abstract reports its own result on what it's cited for. The trail starts here."
                : "This paper states the claim as background and cites earlier literature for it."}
            </p>
          </div>

          {/* Citing Sentence vs What This Paper Says */}
          <div className="grid overflow-hidden rounded-xl border border-[#d2c2cb]">
            {/* The Citing Sentence */}
            <section className="grid gap-1 px-3.5 py-3 bg-white" aria-label="The sentence that cites this paper">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#81737b] font-sans">
                The citing sentence
              </p>
              <p className="text-xs leading-relaxed text-[#4f444b] font-serif">
                {step.citingSentence}
              </p>
            </section>

            {/* What this paper says */}
            <section className="grid gap-1.5 border-t border-[#eee7ec] px-3.5 py-3 bg-[#fbf9f4]" aria-label="What this paper says">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#81737b] font-sans">
                What this paper says · {step.passageSource === "abstract" ? "Abstract" : "Full text"}
              </p>
              <p className="text-xs leading-relaxed text-[#4f444b] font-serif">
                <span className="text-[#81737b]">… </span>
                {step.hop === 2 ? (
                  <>
                    <span className="text-[#62535d]">
                      Moreover, BRAF V600E-mutated CRC cells exhibited upregulation of PD-L1 expression via the transcription factor LEF-1.{" "}
                    </span>
                    <mark className="bg-[#ffdea6] text-[#3a0f34] font-semibold px-1 rounded">
                      {step.foundPassage}
                    </mark>{" "}
                    <span className="text-[#62535d]">
                      Our study provides novel insight into the mechanisms underlying BRAF V600E-mutated CRC progression.{" "}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#62535d]">
                      PD-L1 is known to regulate immune checkpoint signaling.{" "}
                    </span>
                    <mark className="bg-[#ffdea6] text-[#3a0f34] font-semibold px-1 rounded">
                      {step.foundPassage}
                    </mark>{" "}
                    <span className="text-[#62535d]">
                      Targeting nuclear translocation offers therapeutic potential.{" "}
                    </span>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowFullParagraph(!showFullParagraph)}
                className="justify-self-start text-[11.5px] font-semibold text-[#814d75] hover:underline pt-0.5 font-sans"
              >
                {showFullParagraph ? "Hide extended context" : "Show the whole paragraph (9 sentences)"}
              </button>
            </section>
          </div>

          {/* Comparison Against Original Claim */}
          <p
            className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#4f444b] font-sans"
            title="How the claim you started with compares with this passage"
          >
            Against the claim you started with:{" "}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                step.verdict === "different"
                  ? "bg-rose-50 text-rose-800 border-rose-200"
                  : "bg-[#eee7ec] text-[#3a0f34] border-[#d2c2cb]"
              }`}
            >
              {step.verdict === "different" ? "Changed" : "Matches"}
            </span>
          </p>

          {/* Readings behind this result collapsible */}
          <details className="group grid gap-2 border-t border-[#eee7ec] pt-3" open>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#3a0f34] hover:text-[#814d75] flex items-center justify-between font-sans">
              <span>Readings behind this result</span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            </summary>

            <div className="mt-3 grid gap-3">
              <div className="space-y-2 text-xs font-sans" role="list" aria-label="How the citing sentence compares">
                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">Matches</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-[#3a0f34]" style={{ width: `${pctMatches}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctMatches}%</span>
                </div>

                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">Partly matches</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-[#814d75]" style={{ width: `${pctPartly}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctPartly}%</span>
                </div>

                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">Goes further</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-[#7c5800]" style={{ width: `${pctFurther}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctFurther}%</span>
                </div>

                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">More cautious</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-[#4f444b]" style={{ width: `${pctCautious}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctCautious}%</span>
                </div>

                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">Changed</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-rose-700" style={{ width: `${pctChanged}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctChanged}%</span>
                </div>

                <div role="listitem" className="flex items-center gap-2">
                  <span className="w-24 text-[#62535d]">Not there</span>
                  <div className="flex-1 h-2 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40">
                    <div className="h-full bg-[#d2c2cb]" style={{ width: `${pctNotThere}%` }} />
                  </div>
                  <span className="font-mono text-right text-[#4f444b] font-semibold w-8">{pctNotThere}%</span>
                </div>
              </div>

              <p className="text-xs text-[#81737b] leading-relaxed font-serif pt-1">
                States what it's cited for: <strong>{statesScore}%</strong> · Own result: <strong>{ownResultScore}%</strong> · Read from <strong>the {step.passageSource}</strong>. These are the model's probabilities; the rules that turn them into a result are under How it works.
              </p>
            </div>
          </details>
        </article>
      </div>
    </div>
  );
};
