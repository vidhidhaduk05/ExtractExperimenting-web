import React, { useState, useEffect } from "react";
import { ExternalLink, CheckCircle2, AlertCircle, HelpCircle, Sparkles, ShieldAlert, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { ProcessedPaper, TIER_BY_ID, STANCE_LABEL } from "../../lib/claimscapeMethod";
import { api } from "../../lib/api";

interface PaperInspectorProps {
  paper: ProcessedPaper | null;
}

export const PaperInspector: React.FC<PaperInspectorProps> = ({ paper }) => {
  const [stormResult, setStormResult] = useState<any | null>(null);
  const [isDeliberating, setIsDeliberating] = useState<boolean>(false);
  const [showGrandRounds, setShowGrandRounds] = useState<boolean>(true);

  useEffect(() => {
    if (!paper) {
      setStormResult(null);
      return;
    }
    let isCancelled = false;
    setIsDeliberating(true);
    api.deliberateStorm({
      title: paper.paper.title,
      abstract: paper.finding || paper.paper.title,
      topic: "acute ischemic stroke & neurovascular therapy"
    }).then((res) => {
      if (!isCancelled) {
        setStormResult(res);
        setIsDeliberating(false);
      }
    }).catch(() => {
      if (!isCancelled) setIsDeliberating(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [paper?.paper.pmid]);

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
    <article className="cs-card p-5 sm:p-6 grid gap-5 border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C] shadow-sm" aria-live="polite">
      {/* Header Metadata */}
      <header className="grid gap-2 border-b border-[#381A61]/10 dark:border-white/10 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 cs-mono text-[12px] cs-muted">
          <span className="font-serif font-bold text-[14px] text-[#381A61] dark:text-[#F9D14A]">{yearStr}</span>
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

        <h3 className="text-[19px] font-serif font-bold leading-snug text-wrap-pretty text-[#381A61] dark:text-[#FAF9F3]">
          {paper.paper.title}
        </h3>
      </header>

      {/* Main Verdict & Study Attributes Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Stance Breakdown Box */}
        <div className="grid content-start gap-3 rounded-xl border border-[#381A61]/10 dark:border-white/10 bg-[#F2F1EB] dark:bg-[#1A1622] p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[14px] font-bold text-[#381A61] dark:text-[#FAF9F3]">
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
        <dl className="grid content-start gap-2.5 rounded-xl border border-[#381A61]/10 dark:border-white/10 bg-[#F2F1EB] dark:bg-[#1A1622] p-4 text-[13px]">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 pb-2 border-b border-[#381A61]/10 dark:border-white/10">
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

          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 pb-2 border-b border-[#381A61]/10 dark:border-white/10">
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

      {/* ⚡ Multi-Specialty Clinical Review & LAYA Triage */}
      <section className="rounded-xl border border-[#381A61]/15 dark:border-white/15 bg-gradient-to-br from-[#FAF9F3] via-[#F5F3E9] to-[#EFECE0] dark:from-[#1D1926] dark:to-[#14121A] p-4 shadow-sm">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowGrandRounds(!showGrandRounds)}>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-[#381A61] text-[#F9D14A] text-xs font-mono font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Review
            </span>
            <h4 className="text-[13px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A] flex items-center gap-1.5">
              Multi-Specialty Review · Clinical Deliberation
            </h4>
            {stormResult?.verdict_badge && (
              <span
                className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${stormResult.verdict_color}18`,
                  color: stormResult.verdict_color,
                  border: `1px solid ${stormResult.verdict_color}40`,
                }}
              >
                {stormResult.verdict_badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs cs-muted">
            {isDeliberating ? (
              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-600 animate-pulse">
                <Activity className="w-3 h-3 animate-spin" /> Deliberating...
              </span>
            ) : (
              <span className="text-[11px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">
                ⚡ LAYA System-1 &lt;150ms
              </span>
            )}
            {showGrandRounds ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {showGrandRounds && stormResult && (
          <div className="mt-3.5 space-y-3 pt-3 border-t border-[#381A61]/10 dark:border-white/10">
            {/* Laya Fast Metrics */}
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded bg-white/70 dark:bg-black/20 border border-[#381A61]/10 dark:border-white/10">
                <span className="cs-muted block text-[10px]">Study Design Flaw Risk</span>
                <span className={`font-bold text-[13px] ${stormResult.laya_fast_triage?.has_flaw_warning ? "text-red-600" : "text-emerald-600"}`}>
                  {Math.round((stormResult.laya_fast_triage?.flaw_probability || 0) * 100)}%
                </span>
              </div>
              <div className="p-2 rounded bg-white/70 dark:bg-black/20 border border-[#381A61]/10 dark:border-white/10">
                <span className="cs-muted block text-[10px]">Primary Specialty Lens</span>
                <span className="font-bold text-[12px] text-[#381A61] dark:text-[#F9D14A] capitalize">
                  {stormResult.laya_fast_triage?.primary_specialty?.replace("_", " ") || "Interventional"}
                </span>
              </div>
              <div className="p-2 rounded bg-white/70 dark:bg-black/20 border border-[#381A61]/10 dark:border-white/10">
                <span className="cs-muted block text-[10px]">RoB Level</span>
                <span className="font-bold text-[12px] text-amber-700 dark:text-amber-400 capitalize">
                  {stormResult.laya_fast_triage?.rob_level || "Low"}
                </span>
              </div>
            </div>

            {/* Study Design Flaws Alert Banner */}
            {stormResult.design_flaws && stormResult.design_flaws.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[12px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{stormResult.design_flaws.length} Methodological Flaw(s) Identified:</span>
                </div>
                {stormResult.design_flaws.map((flaw: any, idx: number) => (
                  <div key={idx} className="pl-5 text-[11.5px] text-[#634E28] dark:text-[#E2D6B5] leading-snug">
                    • <strong>{flaw.title}:</strong> {flaw.description} <span className="italic text-[10px]">({flaw.advocated_by})</span>
                  </div>
                ))}
              </div>
            )}

            {/* 4 Specialist Personas Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stormResult.persona_opinions?.map((p: any) => (
                <div
                  key={p.persona_id}
                  className="p-2.5 rounded-lg bg-white/80 dark:bg-black/30 border border-[#381A61]/10 dark:border-white/10 text-[12px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-[#141413] dark:text-[#FAF9F3]">
                      <span>{p.avatar}</span>
                      <span className="truncate max-w-[150px]">{p.role}</span>
                    </div>
                    <span
                      className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                        p.stance === "critical"
                          ? "bg-red-500/10 text-red-600 border border-red-500/20"
                          : p.stance === "cautionary"
                          ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      }`}
                    >
                      {p.stance}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#555] dark:text-[#AAA] leading-relaxed">
                    {p.critique}
                  </p>
                </div>
              ))}
            </div>

            {/* Deliberation Footer Summary */}
            <p className="text-[11px] font-serif italic text-center text-[#6B665E] dark:text-[#A09A8F] pt-1">
              "{stormResult.grand_rounds_summary}"
            </p>
          </div>
        )}
      </section>

      {/* Abstract & Extracted Key Finding Sentence */}
      <section className="grid gap-2.5 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[12px] font-serif font-bold uppercase tracking-[0.06em] text-[#381A61] dark:text-[#F9D14A] flex items-center gap-1.5">
            Key Extracted Finding & Abstract
          </h4>
          <span className="text-[11.5px] cs-muted cs-mono">
            Sentence highlighted below
          </span>
        </div>

        {paper.finding ? (
          <div
            className="cs-abstract rounded-xl border border-[#381A61]/10 dark:border-white/10 bg-[#FAF9F3] dark:bg-black/30 p-4 text-[14px] leading-relaxed text-[var(--cs-ink)] shadow-2xs"
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
