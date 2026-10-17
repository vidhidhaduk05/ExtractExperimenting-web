import React from "react";
import { ExternalLink, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { ProcessedPaper, TIER_BY_ID, STANCE_LABEL } from "../../lib/claimscapeMethod";

interface PaperInspectorProps {
  paper: ProcessedPaper | null;
}

export const PaperInspector: React.FC<PaperInspectorProps> = ({ paper }) => {
  if (!paper) {
    return (
      <div className="cs-card p-6 text-center text-sm cs-muted flex flex-col items-center justify-center min-h-[320px]">
        <HelpCircle className="w-8 h-8 text-[var(--cs-ink-3)] mb-2 stroke-[1.5]" />
        <p className="font-medium text-[var(--cs-ink-2)]">No paper selected</p>
        <p className="text-[12.5px] mt-1 max-w-sm">
          Click any dot in the scatter plot above or select a row from the table below to inspect its abstract, probability breakdown, and key extracted finding.
        </p>
      </div>
    );
  }

  const yearStr =
    paper.paper.date !== null && paper.paper.date !== undefined
      ? Math.floor(paper.paper.date)
      : "n.d.";

  const tier = paper.tier ? TIER_BY_ID[paper.tier] : null;

  const stanceColorVar =
    paper.category === "supports"
      ? "var(--cs-for)"
      : paper.category === "contradicts"
      ? "var(--cs-against)"
      : "var(--cs-neutral)";

  const forPct = Math.round((paper.probs.supports || 0) * 100);
  const mixedPct = Math.round((paper.probs.mixed || 0) * 100);
  const againstPct = Math.round((paper.probs.contradicts || 0) * 100);
  const noResultPct = Math.round((paper.probs.no_result || 0) * 100);

  const directPct = Math.round((paper.judgment.direct ?? 1) * 100);
  const onTopicPct = Math.round((paper.judgment.onTopic ?? 1) * 100);

  return (
    <article className="cs-card p-5 sm:p-6 grid gap-5" aria-live="polite">
      {/* Header Metadata */}
      <header className="grid gap-2 border-b border-[var(--cs-line)] pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 cs-mono text-[12px] cs-muted">
          <span className="font-bold text-[var(--cs-ink)]">{yearStr}</span>
          <span>·</span>
          <span>{paper.paper.journal || "PubMed publication"}</span>
          <span>·</span>
          <a
            className="cs-link inline-flex items-center gap-1 font-semibold"
            href={`https://pubmed.ncbi.nlm.nih.gov/${paper.paper.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            PMID {paper.paper.pmid}
            <ExternalLink className="w-3 h-3 inline" />
          </a>
          {paper.paper.doi && (
            <>
              <span>·</span>
              <a
                className="cs-link inline-flex items-center gap-1"
                href={`https://doi.org/${paper.paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                doi
                <ExternalLink className="w-2.5 h-2.5 inline" />
              </a>
            </>
          )}
        </div>

        <h3 className="text-[18px] font-semibold leading-snug text-wrap-pretty text-[var(--cs-ink)]">
          {paper.paper.title}
        </h3>
      </header>

      {/* Main Verdict & Study Attributes Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Stance Breakdown Box */}
        <div className="grid content-start gap-3 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)] p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--cs-ink)]">
              <span
                className="w-3.5 h-3.5 rounded-full inline-block flex-none"
                style={{ background: stanceColorVar }}
              />
              {STANCE_LABEL[paper.category] || "Unclear"}
            </p>
            <span className="cs-mono text-[11px] cs-muted">
              Confidence {Math.round(paper.strength * 100)}%
            </span>
          </div>

          <div className="cs-probs">
            <div className="contents">
              <span className="cs-soft text-[12px]">For the claim</span>
              <span className="bar">
                <b style={{ width: `${forPct}%`, background: "var(--cs-for)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] cs-muted">{forPct}%</span>
            </div>
            <div className="contents">
              <span className="cs-soft text-[12px]">Mixed</span>
              <span className="bar">
                <b
                  style={{
                    width: `${mixedPct}%`,
                    background: "linear-gradient(90deg, var(--cs-for) 50%, var(--cs-against) 50%)"
                  }}
                />
              </span>
              <span className="cs-mono text-right text-[12px] cs-muted">{mixedPct}%</span>
            </div>
            <div className="contents">
              <span className="cs-soft text-[12px]">Against the claim</span>
              <span className="bar">
                <b style={{ width: `${againstPct}%`, background: "var(--cs-against)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] cs-muted">{againstPct}%</span>
            </div>
            <div className="contents">
              <span className="cs-soft text-[12px]">No result on claim</span>
              <span className="bar">
                <b style={{ width: `${noResultPct}%`, background: "var(--cs-neutral)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] cs-muted">{noResultPct}%</span>
            </div>
          </div>

          <p className="text-[12px] cs-muted pt-1 border-t border-[var(--cs-line)]">
            {paper.agree
              ? "Both evaluation prompts agree. Averaged across 2 independently worded questions."
              : "Readings differed between wording checks; classified as unclear."}
          </p>
        </div>

        {/* Study Details DL */}
        <dl className="grid content-start gap-2.5 rounded-xl border border-[var(--cs-line)] bg-[var(--cs-panel)] p-4 text-[13px]">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 pb-2 border-b border-[var(--cs-line)]">
            <dt className="cs-muted font-medium">Study type</dt>
            <dd className="font-semibold text-[var(--cs-ink)]">
              {tier?.label || "Unclassified"}
              {paper.paper.pubTypes?.length > 0 && (
                <span className="block text-[11.5px] cs-muted font-normal mt-0.5">
                  NLM type: {paper.paper.pubTypes.join(", ")}
                </span>
              )}
            </dd>
          </div>

          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 pb-2 border-b border-[var(--cs-line)]">
            <dt className="cs-muted font-medium">Evidence</dt>
            <dd className="text-[var(--cs-ink)]">
              <span className="font-semibold">
                {paper.direct ? "Tests claim directly" : "Indirect model / proxy"}
              </span>
              <span className="block text-[11.5px] cs-muted">
                {directPct}% direct test confidence
              </span>
            </dd>
          </div>

          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
            <dt className="cs-muted font-medium">On topic</dt>
            <dd className="text-[var(--cs-ink)] font-semibold">
              {onTopicPct}%{" "}
              <span className="text-[11.5px] font-normal cs-muted">
                relevance match
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Abstract & Extracted Key Finding Sentence */}
      <section className="grid gap-2.5 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[12px] font-bold uppercase tracking-[0.06em] cs-muted flex items-center gap-1.5">
            Key Extracted Finding & Abstract
          </h4>
          <span className="text-[11.5px] cs-muted cs-mono">
            Sentence highlighted below
          </span>
        </div>

        {paper.finding ? (
          <div
            className="cs-abstract rounded-xl border border-[var(--cs-line)] bg-white dark:bg-black/30 p-4 text-[14px] leading-relaxed text-[var(--cs-ink)] shadow-2xs"
            // @ts-expect-error CSS variable for highlight color
            style={{ "--c": stanceColorVar }}
          >
            <mark className="font-medium text-[var(--cs-ink)]">
              {paper.finding}
            </mark>
          </div>
        ) : (
          <p className="text-[13px] cs-muted italic">
            No specific finding sentence extracted from this abstract.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px] cs-muted">
          <span>
            Abstract read and verified by clinical model. Always check primary sources before citing.
          </span>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${paper.paper.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="cs-link font-medium inline-flex items-center gap-1"
          >
            Open on PubMed <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>
    </article>
  );
};
