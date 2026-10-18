import React, { useState } from "react";
import { Check, Copy, Code, BookOpen, ShieldCheck, Scale, Database, AlertTriangle } from "lucide-react";
import { publishedMethod, THRESHOLDS, VERDICT_DESCRIPTIONS } from "../../lib/claimscapeMethod";

export const MethodologySection: React.FC = () => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(publishedMethod(), null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section
      id="method"
      className="cs grid scroll-mt-6 grid-cols-[minmax(0,1fr)] gap-6 border-t border-[var(--cs-line)] pt-12"
      aria-labelledby="cs-method-title"
    >
      {/* Top Header & Copy Button */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="cs-eyebrow text-[#7C4B73] dark:text-[#F9D14A] font-bold">Method v0.1 · Published Transparent Protocol</p>
          <h2 id="cs-method-title" className="mt-1.5 text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">
            How the map is made
          </h2>
          <p className="mt-1.5 max-w-[76ch] text-[14.5px] cs-soft leading-relaxed">
            Everything that decides a map is published and reproducible: the search queries, every evaluation question exactly as prompt-engineered, every statistical threshold, and every NLM indexing rule.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyJson}
          className="btn-palette-accept-all px-4 py-2 text-xs"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-700" />
              <span>Copied method JSON</span>
            </>
          ) : (
            <>
              <Code className="w-4 h-4 text-[#381A61]" />
              <span>Copy method as JSON</span>
            </>
          )}
        </button>
      </div>

      {/* Grid of Method Breakdown Cards */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Left Column: Questions asked */}
        <div className="cs-card grid gap-5 p-5 sm:p-6 text-sm cs-soft border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C]">
          <div className="flex items-center gap-2 pb-2 border-b border-[#381A61]/10 dark:border-white/10">
            <BookOpen className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
            <h3 className="text-[17px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
              The questions asked of every abstract
            </h3>
          </div>

          <p className="leading-relaxed">
            Each abstract is evaluated independently alongside the claim:{" "}
            <code className="cs-mono text-[12px] bg-[var(--cs-panel)] border border-[var(--cs-line)] px-1.5 py-0.5 rounded text-[var(--cs-ink)]">
              {"{ claim, paper: { title, abstract } }"}
            </code>
            . The abstract is split into sentences, each prefixed with a unique index. The model returns normalized probabilities over discrete options rather than generating unconstrained text.
          </p>

          <div className="space-y-4">
            {/* Question 1 */}
            <div className="p-3.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)]">
              <p className="font-bold text-[var(--cs-ink)] text-[13.5px]">
                1. On topic <span className="font-normal cs-muted">(yes / no)</span>
              </p>
              <p className="mt-1 italic text-[var(--cs-ink-2)]">
                “Does the paper investigate the relationship described in the claim?”
              </p>
              <ul className="mt-2 space-y-1.5 text-[12.5px]">
                <li>
                  <strong className="text-[var(--cs-for)]">Yes:</strong> Studies or reviews the same exposure/intervention and outcome as the claim, across any population, species or model.
                </li>
                <li>
                  <strong className="text-[var(--cs-against)]">No:</strong> Investigates a different question, or mentions the topic only in passing.
                </li>
              </ul>
            </div>

            {/* Questions 2 & 3 */}
            <div className="p-3.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)]">
              <p className="font-bold text-[var(--cs-ink)] text-[13.5px]">
                2 & 3. Verdict, evaluated two ways{" "}
                <span className="font-normal cs-muted">(dual-prompt verification)</span>
              </p>
              <p className="mt-1 italic text-[var(--cs-ink-2)]">
                “What do the paper's own results say about the claim?” and “Taken as a whole, which way does the paper's evidence point?”
              </p>
              <ul className="mt-2 space-y-1.5 text-[12.5px]">
                <li>
                  <strong className="text-[var(--cs-for)]">Supports:</strong> Results or conclusions agree with the direction asserted in the claim.
                </li>
                <li>
                  <strong className="text-[var(--cs-against)]">Contradicts:</strong> Results disagree with the claim (e.g. no association where one was claimed, or harm where benefit was claimed).
                </li>
                <li>
                  <strong className="text-amber-600 dark:text-amber-400">Mixed:</strong> Results conflict across outcomes, dosages, subgroups, or follow-up intervals.
                </li>
                <li>
                  <strong className="text-[var(--cs-neutral)]">No result:</strong> Protocol paper, narrative overview without synthesized results, or uninformative endpoint.
                </li>
              </ul>
            </div>

            {/* Question 4 */}
            <div className="p-3.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)]">
              <p className="font-bold text-[var(--cs-ink)] text-[13.5px]">
                4. Direct evidence <span className="font-normal cs-muted">(yes / no)</span>
              </p>
              <p className="mt-1 italic text-[var(--cs-ink-2)]">
                “Does the paper test the claim directly?”
              </p>
              <p className="mt-1.5 text-[12.5px]">
                Distinguishes papers testing the exact named population and clinical endpoint from animal models, cell cultures, or proxy biomarkers (rendered as hollow dots).
              </p>
            </div>

            {/* Question 5 */}
            <div className="p-3.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)]">
              <p className="font-bold text-[var(--cs-ink)] text-[13.5px]">
                5. Study type <span className="font-normal cs-muted">(hierarchical categorization)</span>
              </p>
              <p className="mt-1 italic text-[var(--cs-ink-2)]">
                “What kind of study design is this paper?”
              </p>
              <p className="mt-1.5 text-[12.5px]">
                Classifies into Systematic Reviews & Meta-Analyses, RCTs, Observational Studies, Case Reports, Animal, In Vitro, or Narrative Commentary.
              </p>
            </div>

            {/* Question 6 */}
            <div className="p-3.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)]">
              <p className="font-bold text-[var(--cs-ink)] text-[13.5px]">
                6. Key Finding Extraction <span className="font-normal cs-muted">(sentence index)</span>
              </p>
              <p className="mt-1 italic text-[var(--cs-ink-2)]">
                “Which sentence of the abstract reports this paper's own result bearing most directly on the claim?”
              </p>
              <p className="mt-1.5 text-[12.5px]">
                Picks an exact sentence ID directly from the abstract text, eliminating extractive hallucination.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Search, Wilson interval, and rules */}
        <div className="grid gap-5">
          {/* Search Strategy */}
          <div className="cs-card grid gap-3 p-5 sm:p-6 text-sm cs-soft border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C]">
            <div className="flex items-center gap-2 pb-1 border-b border-[#381A61]/10 dark:border-white/10">
              <Database className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
              <h3 className="text-[16px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                Search & PubMed Ingestion
              </h3>
            </div>
            <p className="leading-relaxed text-[13px]">
              The clinical claim is transformed into optimized PubMed terms by stripping directional verbs (e.g. “reduces”, “increases”) to prevent confirmation bias.
            </p>
            <div className="p-3 rounded-lg bg-[#FAF9F3] dark:bg-[#1A1622] text-[12px] cs-mono border border-[#381A61]/10 dark:border-white/10">
              hasabstract AND english[la] NOT ((review[pt] NOT systematic[sb]) OR editorial[pt] OR comment[pt] OR letter[pt] OR news[pt])
            </div>
            <ul className="list-disc list-inside space-y-1 text-[12.5px] text-[var(--cs-ink-2)]">
              <li>Ingests top 100, 200, or 300 citations by PubMed Best Match.</li>
              <li>Excludes retractions, published errata, and expressions of concern automatically.</li>
            </ul>
          </div>

          {/* Wilson 95% Confidence Intervals */}
          <div className="cs-card grid gap-3 p-5 sm:p-6 text-sm cs-soft border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C]">
            <div className="flex items-center gap-2 pb-1 border-b border-[#381A61]/10 dark:border-white/10">
              <Scale className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
              <h3 className="text-[16px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                Verdicts & 95% Wilson Score Intervals
              </h3>
            </div>
            <p className="text-[13px] leading-relaxed">
              A paper is placed on the map when on-topic confidence reaches at least{" "}
              <strong>{THRESHOLDS.onTopic * 100}%</strong>. A verdict is scored when both phrasing checks agree and average confidence is at least{" "}
              <strong>{THRESHOLDS.stance * 100}%</strong>.
            </p>

            <div className="p-3 rounded-lg bg-[#FAF9F3] dark:bg-[#1A1622] text-[12px] cs-mono border border-[#381A61]/10 dark:border-white/10 space-y-1">
              <div>share for = (for + mixed / 2) / (for + mixed + against)</div>
              <div>interval = Wilson score interval (95%, z = 1.96)</div>
            </div>

            <div className="space-y-2 pt-1">
              {VERDICT_DESCRIPTIONS.map(([id, desc]) => (
                <div key={id} className="text-[12.5px] flex items-start gap-2">
                  <span className="font-bold text-[var(--cs-ink)] min-w-[110px] flex-none">
                    {id === "few" ? "Too few to say" : id.replace("_", " ")}:
                  </span>
                  <span className="cs-muted">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Methodological Limits */}
          <div className="cs-card grid gap-3 p-5 sm:p-6 text-sm cs-soft border border-amber-500/20 bg-amber-500/[0.04] dark:bg-amber-500/[0.06]">
            <div className="flex items-center gap-2 pb-1 border-b border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-[#E78429]" />
              <h3 className="text-[16px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                Methodological Limits & Guardrails
              </h3>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-[12.5px]">
              <li><strong>Abstracts Only:</strong> Results reported exclusively in full-text tables may not appear in the initial map.</li>
              <li><strong>Publication Bias:</strong> Positive trial results are historically published faster and more frequently than null findings.</li>
              <li><strong>Direct Link Verification:</strong> Every single point on the scatter plot connects directly to its PubMed ID and DOI for independent audit.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Credit & Provenance Statement */}
      <footer className="mt-8 border-t border-[var(--cs-line)] pt-6 text-[12.5px] cs-muted space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p>
            <strong>Methodology & Academic Provenance Credit:</strong> The Claimscape evidence mapping framework, dual-prompt stance verification protocol, and Wilson score visual synthesis implemented here follow the open research methodology and reproducible standards pioneered by <strong>K-Dense AI</strong> (Claimscape v0.1).
          </p>
          <span className="cs-mono text-[11px] text-[var(--cs-ink-3)]">
            NLM / NCBI E-Utilities Citation Data
          </span>
        </div>
        <p className="text-[11.5px] text-[var(--cs-ink-3)]">
          RadExtract Systematic Platform · Free open-science clinical research synthesis tool.
        </p>
      </footer>
    </section>
  );
};
