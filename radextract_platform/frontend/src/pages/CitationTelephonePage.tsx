import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText,
  UploadCloud,
  Share2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { api } from "../lib/api";
import {
  PRESET_TELEPHONE_EXAMPLES,
  TraceStep,
  CitationTelephoneData,
  VERDICT_BADGE_STYLES,
} from "../lib/citationTelephoneMethod";
import { TrailViewer } from "../components/citation/TrailViewer";
import { PassageInspector } from "../components/citation/PassageInspector";
import { TrailGraphView } from "../components/citation/TrailGraphView";

export const CitationTelephonePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlPaper = searchParams.get("paper");
  const urlP = searchParams.get("p");
  const urlS = searchParams.get("s");
  const urlR = searchParams.get("r");

  // Preset example state
  const initialIndex = urlPaper
    ? Math.max(0, PRESET_TELEPHONE_EXAMPLES.findIndex(ex => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper))
    : 0;

  const [selectedExampleIndex, setSelectedExampleIndex] = useState(initialIndex);
  const activeExample = PRESET_TELEPHONE_EXAMPLES[selectedExampleIndex] || PRESET_TELEPHONE_EXAMPLES[0];
  const [selectedStep, setSelectedStep] = useState<TraceStep>(activeExample.data.steps[0]);

  useEffect(() => {
    if (urlPaper) {
      const idx = PRESET_TELEPHONE_EXAMPLES.findIndex(ex => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper);
      if (idx !== -1) {
        setSelectedExampleIndex(idx);
        setSelectedStep(PRESET_TELEPHONE_EXAMPLES[idx].data.steps[0]);
      }
    }
  }, [urlPaper]);

  // View tabs
  const [activeTab, setActiveTab] = useState<"trail" | "custom">("trail");

  // Custom audit state
  const [text, setText] = useState(
    "Nuclear PD-L1 promotes cell proliferation in an immune-dependent manner without interacting with PD-1 [1]. Contrast-induced nephropathy risk is reduced with bicarbonate hydration [2].\n\nReferences\n1. Wang Y, et al. Spatial Heterogeneity of PD-L1 in Cancer Therapy. Adv Sci. 2024.\n2. Merten GJ, et al. Prevention of contrast-medium-induced nephropathy with sodium bicarbonate. JAMA. 2004."
  );
  const [parsed, setParsed] = useState<any>(null);
  const [claim, setClaim] = useState(
    "Nuclear PD-L1 can promote cell proliferation in an immune-dependent manner without interacting with PD-1."
  );
  const [sourceTitle, setSourceTitle] = useState(
    "Challenges Coexist with Opportunities: Spatial Heterogeneity Expression of PD-L1 in Cancer Therapy"
  );
  const [passage, setPassage] = useState(
    "nPD-L1 can also serve as a key nuclear protein that promotes immune-independent cell proliferation without binding to PD-1."
  );
  const [comparison, setComparison] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectExample = (idx: number) => {
    setSelectedExampleIndex(idx);
    const ex = PRESET_TELEPHONE_EXAMPLES[idx];
    if (ex?.data?.steps?.[0]) {
      setSelectedStep(ex.data.steps[0]);
    }
  };

  const handleCustomParse = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTimeout(() => {
      setParsed({
        totalClaimsFound: 2,
        totalReferencesFound: 2,
        claims: [
          {
            sentenceIndex: 0,
            refNumber: "1",
            citingSentence:
              "Nuclear PD-L1 promotes cell proliferation in an immune-dependent manner without interacting with PD-1 [1].",
          },
          {
            sentenceIndex: 1,
            refNumber: "2",
            citingSentence:
              "Contrast-induced nephropathy risk is reduced with bicarbonate hydration [2].",
          },
        ],
        references: {
          "1": "Wang Y, et al. Spatial Heterogeneity of PD-L1 in Cancer Therapy. Adv Sci. 2024.",
          "2": "Merten GJ, et al. Prevention of contrast-medium-induced nephropathy with sodium bicarbonate. JAMA. 2004.",
        },
      });
      setBusy(false);
    }, 400);
  };

  const handleComparePassage = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTimeout(() => {
      setComparison({
        engine: "local_laya_system_1",
        verdict: "different",
        verdictLabel: "Contradiction / Semantic Drift Detected",
        supportScore: 0.15,
        ownResultScore: 0.85,
        probabilities: {
          matches: 0.05,
          partlyMatches: 0.1,
          goesFurther: 0.05,
          moreCautious: 0.05,
          changed: 0.7,
          notThere: 0.05,
        },
        unsureness: {
          isGenuinelyUnsure: false,
          margin: 0.6,
          entropyScore: 0.32,
          reason:
            "Critical Semantic Inversion: Citing claim asserts 'immune-dependent' proliferation, but source passage states 'immune-INDEPENDENT'.",
          recommendation: "contradiction_flagged",
        },
      });
      setBusy(false);
    }, 500);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-black/[0.08]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-2">
            <Share2 className="w-3.5 h-3.5" />
            Citation Telephone Game Verifier
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
            Citation Telephone
          </h1>
          <p className="mt-1 text-sm text-[#6B665E] dark:text-zinc-400 max-w-3xl">
            Audit how scientific claims morph across multi-hop citation chains. Pinpoint exact passages where citations invert, exaggerate, or fabricate evidentiary claims.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("trail")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "trail"
                ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Telephone Trail (Demo)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "custom"
                ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Custom Claim Audit
          </button>
        </div>
      </div>

      {activeTab === "trail" ? (
        <div className="space-y-6">
          {/* Example Selector Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">
              Select Demo Case:
            </span>
            {PRESET_TELEPHONE_EXAMPLES.map((ex, idx) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => handleSelectExample(idx)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  idx === selectedExampleIndex
                    ? "bg-[#381A61] text-white border-[#381A61] shadow-2xs"
                    : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Audit Alert Headline */}
          {activeExample.data.auditSummary.criticalWarning && (
            <div className="rounded-2xl border border-rose-300 dark:border-rose-900/50 bg-rose-50/90 dark:bg-rose-950/20 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-serif font-bold text-sm text-rose-900 dark:text-rose-200">
                    {activeExample.data.auditSummary.headline}
                  </h3>
                  <p className="text-xs text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                    {activeExample.data.auditSummary.criticalWarning}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Visual Interactive DAG Graph View */}
          <TrailGraphView
            steps={activeExample.data.steps}
            selectedStepId={selectedStep.id}
            onSelectStep={setSelectedStep}
            rootPaper={activeExample.data.rootPaper}
          />

          {/* Main 2-Column Trail Explorer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Chain of Hops */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#381A61]/10 dark:border-white/10 pb-2">
                <h2 className="font-serif font-bold text-base text-[#381A61] dark:text-[#F9D14A]">
                  The Trail ({activeExample.data.steps.length} Hops)
                </h2>
                <span className="text-xs font-mono text-zinc-500">
                  {activeExample.data.totalPapersRead} papers · stored example
                </span>
              </div>

              {/* Root Claim Card */}
              <div className="rounded-xl border border-[#381A61]/15 dark:border-white/15 bg-white dark:bg-[#1A1622] p-4 shadow-2xs space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B665E] dark:text-[#968F84]">The claim</span>
                <p className="text-[14px] font-semibold text-[#141413] dark:text-[#FAF9F3] leading-snug">
                  “{activeExample.data.claim}”
                </p>
                <p className="text-[11.5px] text-[#6B665E] dark:text-[#968F84] line-clamp-1">
                  {activeExample.data.rootPaper.authors} · {activeExample.data.rootPaper.year} · {activeExample.data.rootPaper.title}
                </p>
              </div>

              <TrailViewer
                steps={activeExample.data.steps}
                selectedStepId={selectedStep.id}
                onSelectStep={setSelectedStep}
              />
            </div>

            {/* Right Column: Deep Passage & Evidence Inspector */}
            <div className="lg:col-span-7">
              <PassageInspector step={selectedStep} />
            </div>
          </div>
        </div>
      ) : (
        /* Custom Text Extractor & Comparator */
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Section 1 */}
          <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.08] dark:border-zinc-800 p-6 space-y-4 shadow-2xs">
            <h2 className="font-serif text-lg font-bold text-[#381A61] dark:text-[#F9D14A]">
              1. Extract Numbered Citation Claims
            </h2>
            <p className="text-xs text-[#6B665E] dark:text-zinc-400">
              Paste manuscript paragraphs containing bracketed citations such as [1] with a numbered References list.
            </p>
            <form onSubmit={handleCustomParse} className="space-y-3">
              <textarea
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-mono min-h-40 focus:ring-2 focus:ring-[#381A61]"
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="px-4 py-2 rounded-lg bg-[#381A61] hover:bg-[#2A1348] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Extract Citations (Demo)
              </button>
            </form>

            {parsed && (
              <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Extracted {parsed.totalClaimsFound} citation claims and {parsed.totalReferencesFound} references.
                </p>
                {parsed.claims.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 space-y-1.5 text-xs"
                  >
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.citingSentence}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      Ref [{item.refNumber}]: {parsed.references[item.refNumber]}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setClaim(item.citingSentence);
                        setSourceTitle(parsed.references[item.refNumber]);
                      }}
                      className="text-[11px] font-semibold text-[#381A61] dark:text-[#F9D14A] underline"
                    >
                      Compare with source text →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2 */}
          <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.08] dark:border-zinc-800 p-6 space-y-4 shadow-2xs">
            <h2 className="font-serif text-lg font-bold text-[#381A61] dark:text-[#F9D14A]">
              2. Compare Claim with Original Source Passage
            </h2>
            <form onSubmit={handleComparePassage} className="space-y-3">
              <label className="block space-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Citing claim</span>
                <textarea
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-mono min-h-20 focus:ring-2 focus:ring-[#381A61]"
                  value={claim}
                  onChange={(e) => setClaim(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>

              <label className="block space-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Source publication title</span>
                <input
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-xs focus:ring-2 focus:ring-[#381A61]"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  disabled={busy}
                />
              </label>

              <label className="block space-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Source passage text</span>
                <textarea
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-mono min-h-24 focus:ring-2 focus:ring-[#381A61]"
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>

              <button
                type="submit"
                disabled={busy || !claim.trim() || !passage.trim()}
                className="px-4 py-2 rounded-lg bg-[#381A61] hover:bg-[#2A1348] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                Run Passage Audit (Demo)
              </button>
            </form>

            {comparison && (
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-sm text-amber-900 dark:text-amber-200">
                    {comparison.verdictLabel}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                    Drift: 70%
                  </span>
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90">{comparison.unsureness.reason}</p>
                <p className="text-[10.5px] text-zinc-500 pt-1 border-t border-amber-200 dark:border-amber-900">
                  Simulated local Laya passage calibration. Traces discrepancies between the citing sentence and source passage.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
