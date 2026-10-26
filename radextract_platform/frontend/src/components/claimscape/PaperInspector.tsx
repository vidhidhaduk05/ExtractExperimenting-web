import React from "react";
import { ExternalLink, HelpCircle } from "lucide-react";
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
    <article className="cs-card p-5 sm:p-6 grid gap-5 border border-[#d2c2cb] bg-white shadow-2xs font-['Work_Sans']" aria-live="polite">
      {/* Header Metadata */}
      <header className="grid gap-2 border-b border-[#d2c2cb] pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 cs-mono text-[12px] text-[#72636d]">
          <span className="font-serif font-bold text-[14px] text-[#3a0f34]">{yearStr}</span>
          <span>·</span>
          <span>{paper.paper.journal || "PubMed publication"}</span>
          <span>·</span>
          <a
            className="cs-link inline-flex items-center gap-1 font-semibold text-[#814d75] hover:text-[#3a0f34]"
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
                className="cs-link inline-flex items-center gap-1 text-[#814d75] hover:text-[#3a0f34]"
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

        <h3 className="text-[19px] font-serif font-bold leading-snug text-wrap-pretty text-[#3a0f34]">
          {paper.paper.title}
        </h3>
      </header>

      {/* Main Evidence Stance & Study Attributes Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Stance Breakdown Box */}
        <div className="grid content-start gap-3 rounded-lg border border-[#d2c2cb] bg-[#fbf9f4] p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[14px] font-bold text-[#3a0f34]">
              <span
                className="w-3.5 h-3.5 rounded-full inline-block flex-none"
                style={{ background: stanceColorVar }}
              />
              {STANCE_LABEL[paper.category] || "Unclear"}
            </p>
            <span className="cs-mono text-[11px] text-[#72636d]">
              Confidence {Math.round(paper.strength * 100)}%
            </span>
          </div>

          <div className="cs-probs">
            <div className="contents">
              <span className="cs-soft text-[12px]">For the claim</span>
              <span className="bar">
                <b style={{ width: `${forPct}%`, background: "var(--cs-for)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] text-[#72636d]">{forPct}%</span>
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
              <span className="cs-mono text-right text-[12px] text-[#72636d]">{mixedPct}%</span>
            </div>
            <div className="contents">
              <span className="cs-soft text-[12px]">Against the claim</span>
              <span className="bar">
                <b style={{ width: `${againstPct}%`, background: "var(--cs-against)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] text-[#72636d]">{againstPct}%</span>
            </div>
            <div className="contents">
              <span className="cs-soft text-[12px]">No result on claim</span>
              <span className="bar">
                <b style={{ width: `${noResultPct}%`, background: "var(--cs-neutral)" }} />
              </span>
              <span className="cs-mono text-right text-[12px] text-[#72636d]">{noResultPct}%</span>
            </div>
          </div>
        </div>

        {/* Study Type & Directness Box */}
        <dl className="grid content-start gap-2.5 rounded-lg border border-[#d2c2cb] bg-[#fbf9f4] p-4 text-[12.5px]">
          <div>
            <dt className="text-[#72636d] font-medium">Study design hierarchy</dt>
            <dd className="text-[#4f444b] font-semibold flex items-center gap-1.5 mt-0.5">
              <span>{tier?.label || "Unclassified study type"}</span>
              {tier && !tier.counted && (
                <span className="text-[11px] font-normal text-[#814d75]">
                  (not counted in pooled statistics)
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-[#72636d] font-medium">Evidence directness</dt>
            <dd className="text-[#4f444b] font-semibold mt-0.5">
              {directPct >= 50 ? "Direct evidence" : "Indirect / animal / model"}{" "}
              <span className="text-[11.5px] font-normal text-[#72636d]">
                ({directPct}% confidence)
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-[#72636d] font-medium">Topic relevance</dt>
            <dd className="text-[#4f444b] font-semibold mt-0.5">
              {onTopicPct}%{" "}
              <span className="text-[11.5px] font-normal text-[#72636d]">
                relevance match
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Abstract & Extracted Key Finding Sentence */}
      <section className="grid gap-2.5 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[12px] font-serif font-bold uppercase tracking-[0.06em] text-[#3a0f34] flex items-center gap-1.5">
            Key Extracted Finding & Abstract
          </h4>
          <span className="text-[11.5px] text-[#72636d] cs-mono">
            Sentence highlighted below
          </span>
        </div>

        {paper.finding ? (
          <div
            className="cs-abstract rounded-lg border border-[#d2c2cb] bg-[#fbf9f4] p-4 text-[14px] leading-relaxed text-[#4f444b] shadow-2xs"
            // @ts-expect-error CSS variable for highlight color
            style={{ "--c": stanceColorVar }}
          >
            <mark className="font-medium text-[#4f444b]">
              {paper.finding}
            </mark>
          </div>
        ) : (
          <p className="text-[13px] text-[#72636d] italic">
            No specific finding sentence extracted from this abstract.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px] text-[#72636d]">
          <span>
            Abstract synthesized according to systematic review criteria. Always inspect full text before clinical application.
          </span>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${paper.paper.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="cs-link font-medium inline-flex items-center gap-1 text-[#814d75] hover:text-[#3a0f34]"
          >
            Open on PubMed <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>
    </article>
  );
};
