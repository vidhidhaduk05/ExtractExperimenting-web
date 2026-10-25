import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Share2,
  Download,
  Copy,
  ExternalLink,
  HelpCircle,
  FileText,
  Sparkles,
  GitGraph,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  BookOpen,
} from "lucide-react";
import {
  PRESET_TELEPHONE_EXAMPLES,
  TraceStep,
  CitationTelephoneData,
} from "../lib/citationTelephoneMethod";
import { TrailViewer } from "../components/citation/TrailViewer";
import { PassageInspector } from "../components/citation/PassageInspector";
import { TrailGraphView } from "../components/citation/TrailGraphView";
import { api } from "../lib/api";

export const CitationTelephonePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlPaper = searchParams.get("paper");

  // Tab mode: "audit" (Live Claim & Manuscript Audit) or "landmark" (K-Dense Benchmark Traces)
  const [activeTab, setActiveTab] = useState<"audit" | "landmark">(urlPaper ? "landmark" : "audit");

  // Live Audit states
  const [manuscriptText, setManuscriptText] = useState<string>("");
  const [extractedClaims, setExtractedClaims] = useState<Array<{
    sentenceIndex: number;
    citingSentence: string;
    refNumber: number;
    refText: string;
  }>>([]);
  const [citingClaim, setCitingClaim] = useState<string>("");
  const [sourcePassage, setSourcePassage] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<{
    verdictLabel: string;
    verdict: string;
    supportScore: number;
    ownResultScore: number;
    probabilities: Record<string, number>;
    engine?: string;
  } | null>(null);

  // Landmark Trace states
  const initialIndex = urlPaper
    ? Math.max(0, PRESET_TELEPHONE_EXAMPLES.findIndex(ex => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper))
    : 0;

  const [selectedExampleIndex, setSelectedExampleIndex] = useState(initialIndex);
  const activeExample = PRESET_TELEPHONE_EXAMPLES[selectedExampleIndex] || PRESET_TELEPHONE_EXAMPLES[0];
  
  // Flatten steps for selection
  const allSteps: TraceStep[] = [];
  const gatherSteps = (items: TraceStep[]) => {
    for (const it of items) {
      allSteps.push(it);
      if (it.nextSteps) gatherSteps(it.nextSteps);
    }
  };
  gatherSteps(activeExample.data.steps);

  const [selectedStep, setSelectedStep] = useState<TraceStep>(allSteps[allSteps.length - 1] || activeExample.data.steps[0]);
  const [paperInput, setPaperInput] = useState(activeExample.paperId);
  const [showGraphView, setShowGraphView] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMethod, setCopiedMethod] = useState(false);

  useEffect(() => {
    if (urlPaper) {
      setActiveTab("landmark");
      const idx = PRESET_TELEPHONE_EXAMPLES.findIndex(ex => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper);
      if (idx !== -1) {
        setSelectedExampleIndex(idx);
        const ex = PRESET_TELEPHONE_EXAMPLES[idx];
        setPaperInput(ex.paperId);
        const steps: TraceStep[] = [];
        gatherSteps(ex.data.steps);
        setSelectedStep(steps[steps.length - 1] || ex.data.steps[0]);
      }
    }
  }, [urlPaper]);

  const handleSelectExample = (idx: number) => {
    setSelectedExampleIndex(idx);
    const ex = PRESET_TELEPHONE_EXAMPLES[idx];
    setPaperInput(ex.paperId);
    const steps: TraceStep[] = [];
    const getS = (s: TraceStep[]) => {
      for (const it of s) {
        steps.push(it);
        if (it.nextSteps) getS(it.nextSteps);
      }
    };
    getS(ex.data.steps);
    setSelectedStep(steps[steps.length - 1] || ex.data.steps[0]);
  };

  const handleLoadPaper = (e: React.FormEvent) => {
    e.preventDefault();
    const query = paperInput.trim().toUpperCase();
    const idx = PRESET_TELEPHONE_EXAMPLES.findIndex(
      ex => ex.paperId.toUpperCase().includes(query) || ex.data.rootPaper.id.toUpperCase().includes(query)
    );
    if (idx !== -1) {
      handleSelectExample(idx);
    }
  };

  // Live Audit Handlers
  const handleExtractCitations = async () => {
    if (!manuscriptText.trim()) return;
    setIsExtracting(true);
    setEvalError(null);
    try {
      const res = await api.auditCitationTelephoneText(manuscriptText);
      setExtractedClaims(res.claims || []);
    } catch (err: any) {
      setEvalError(err?.message || "Failed to extract citations");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSelectClaimToCompare = (claim: { citingSentence: string }) => {
    setCitingClaim(claim.citingSentence);
    setSourcePassage("");
    setEvalResult(null);
    setEvalError(null);
  };

  const handleComparePassage = async () => {
    if (!citingClaim.trim() || !sourcePassage.trim()) return;
    setIsComparing(true);
    setEvalError(null);
    setEvalResult(null);
    try {
      const res = await api.evaluateCitationTelephoneClaim(citingClaim, sourcePassage, "");
      setEvalResult(res);
    } catch (err: any) {
      setEvalError(err?.message || "Local Laya is unavailable");
      setEvalResult(null);
    } finally {
      setIsComparing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyMethod = () => {
    const methodObj = {
      name: "Citation Telephone",
      version: "0.3",
      publishedDate: "2026-10-05",
      thresholds: {
        supportMinimum: 0.40,
        confidentComparison: 0.60,
        notThereMaximum: 0.15,
        ownResultMinimum: 0.50,
        warningThreshold: 0.50
      },
      questions: [
        "1. Stated anywhere (yes/no, per window)",
        "2. Closest paragraph (paragraph id)",
        "3. Own result anywhere (yes/no, per window)",
        "4. Own-result paragraph (paragraph id)",
        "5. Sentences (sentence id)",
        "6. Support (yes/no, per candidate)",
        "7. Comparison (same/partial/stronger/weaker/different/unrelated)",
        "8. Own result (yes/no, per candidate)",
        "9. References to follow (yes/no, per ref)",
        "10. Against original claim (same/partial/stronger/weaker/different/unrelated)"
      ]
    };
    navigator.clipboard?.writeText(JSON.stringify(methodObj, null, 2));
    setCopiedMethod(true);
    setTimeout(() => setCopiedMethod(false), 2000);
  };

  return (
    <div className="ct min-h-screen bg-[var(--ct-panel)] text-[var(--ct-ink)] pb-24 font-sans selection:bg-[#F9D14A] selection:text-[#381A61]">
      <main className="mx-auto grid w-full max-w-[1380px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Top Hero & Tab Switcher */}
        <section className="grid items-start gap-6 pt-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10">
          <div className="max-w-[760px] xl:pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A] mb-2.5">
              Trace a claim to its source
            </p>
            <h1 className="text-[clamp(36px,5vw,56px)] font-serif font-bold leading-none tracking-tight text-[#381A61] dark:text-[#F9D14A]">
              Citation Telephone
            </h1>
            <p className="mt-4 max-w-[560px] text-[16px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Claims change as they pass from paper to paper. Pick a cited sentence and follow it back through the papers it cites, to see where it came from and what changed on the way.
            </p>
          </div>

          <div className="ct-card grid gap-4 p-5 rounded-2xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-black/5 dark:bg-white/5 p-1 text-xs font-semibold" role="group" aria-label="Workflow mode">
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className={`px-3.5 py-1.5 rounded-lg transition-all ${
                    activeTab === "audit"
                      ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Live Claim Audit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("landmark")}
                  className={`px-3.5 py-1.5 rounded-lg transition-all ${
                    activeTab === "landmark"
                      ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Landmark Benchmark Trace
                </button>
              </div>
              <span className="text-xs text-zinc-500">
                {activeTab === "audit" ? "Local Laya System-1 ONNX Model" : "K-Dense Ground Truth Multi-Hop Trace"}
              </span>
            </div>

            {activeTab === "landmark" ? (
              <>
                <form onSubmit={handleLoadPaper} className="grid gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Paper Identifier</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={paperInput}
                        onChange={(e) => setPaperInput(e.target.value)}
                        placeholder="DOI, PMID or PMC ID, e.g. PMC11571110"
                        className="flex-1 rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[#381A61] dark:bg-[#F9D14A] px-5 py-2.5 text-xs font-bold text-white dark:text-[#381A61] hover:opacity-90 transition-all shadow-sm"
                      >
                        Load
                      </button>
                    </div>
                  </label>
                </form>

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ct-line)] pt-3.5">
                  <span className="text-xs font-semibold text-zinc-500 mr-1">Examples:</span>
                  {PRESET_TELEPHONE_EXAMPLES.map((ex, idx) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => handleSelectExample(idx)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                        idx === selectedExampleIndex
                          ? "bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] border-transparent"
                          : "border-[var(--ct-line)] bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Audit any citing sentence against its cited source passage using the local Laya inference engine. Extract citations from manuscript text or evaluate claim alignment directly.
              </div>
            )}
          </div>
        </section>

        {/* Tab 1: Live Claim Audit Mode */}
        {activeTab === "audit" && (
          <section className="grid gap-6 border-t border-[var(--ct-line)] pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Step 1: Manuscript Text Citation Extraction */}
              <div className="ct-card p-5 rounded-2xl grid gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
                    1. Manuscript In-Text Citations
                  </h2>
                  <span className="text-xs text-zinc-500">Extracts cited sentences & bibliography</span>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="manuscript-text-input" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Manuscript text
                  </label>
                  <textarea
                    id="manuscript-text-input"
                    aria-label="Manuscript text"
                    value={manuscriptText}
                    onChange={(e) => setManuscriptText(e.target.value)}
                    placeholder="Paste manuscript text with in-text references, e.g. 'Treatment helped [1].'"
                    rows={4}
                    className="w-full rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] p-3 text-xs font-sans leading-relaxed outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleExtractCitations}
                      disabled={isExtracting || !manuscriptText.trim()}
                      className="rounded-xl bg-[#381A61] dark:bg-[#F9D14A] px-4 py-2 text-xs font-bold text-white dark:text-[#381A61] hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {isExtracting ? "Extracting..." : "Extract citations"}
                    </button>
                  </div>
                </div>

                {extractedClaims.length > 0 && (
                  <div className="border-t border-[var(--ct-line)] pt-3.5 space-y-2.5">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Discovered Claims ({extractedClaims.length}):
                    </span>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {extractedClaims.map((claim, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[var(--ct-line)] bg-white dark:bg-zinc-800/80 p-3 text-xs space-y-2"
                        >
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {claim.citingSentence}
                          </p>
                          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                            <span>Ref [{claim.refNumber}]: {claim.refText || "Cited Source"}</span>
                            <button
                              type="button"
                              onClick={() => handleSelectClaimToCompare(claim)}
                              className="rounded-lg bg-[#381A61]/10 dark:bg-[#F9D14A]/10 text-[#381A61] dark:text-[#F9D14A] px-2.5 py-1 font-semibold hover:bg-[#381A61]/20 transition-colors"
                            >
                              Compare this claim with source text
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Semantic Passage Comparison */}
              <div className="ct-card p-5 rounded-2xl grid gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
                    2. Claim vs Source Evaluation
                  </h2>
                  <span className="text-xs text-zinc-500">Local Laya Verification</span>
                </div>

                {evalError && (
                  <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs font-semibold text-rose-800 dark:text-rose-300">
                    {evalError}
                  </div>
                )}

                <div className="grid gap-2">
                  <label htmlFor="citing-claim-input" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Citing claim
                  </label>
                  <textarea
                    id="citing-claim-input"
                    aria-label="Citing claim"
                    value={citingClaim}
                    onChange={(e) => setCitingClaim(e.target.value)}
                    placeholder="The claim made in the citing manuscript"
                    rows={2}
                    className="w-full rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] p-3 text-xs font-sans leading-relaxed outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="actual-source-passage-input" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Actual source passage
                  </label>
                  <textarea
                    id="actual-source-passage-input"
                    aria-label="Actual source passage"
                    value={sourcePassage}
                    onChange={(e) => setSourcePassage(e.target.value)}
                    placeholder="The actual verbatim sentence or paragraph in the cited source paper"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] p-3 text-xs font-sans leading-relaxed outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleComparePassage}
                    disabled={!citingClaim.trim() || !sourcePassage.trim() || isComparing}
                    className="rounded-xl bg-[#381A61] dark:bg-[#F9D14A] px-5 py-2.5 text-xs font-bold text-white dark:text-[#381A61] hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {isComparing ? "Evaluating..." : "Compare passage"}
                  </button>
                </div>

                {evalResult && (
                  <div className="border-t border-[var(--ct-line)] pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Evaluation Verdict:
                      </span>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 px-3 py-0.5 text-xs font-bold">
                        {evalResult.verdictLabel || "Matches Source"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2.5">
                        <span className="text-zinc-500 block text-[11px]">Support Confidence</span>
                        <strong className="text-base font-mono font-bold text-[#381A61] dark:text-[#F9D14A]">
                          {Math.round(evalResult.supportScore * 100)}%
                        </strong>
                      </div>
                      <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2.5">
                        <span className="text-zinc-500 block text-[11px]">Own Result Confidence</span>
                        <strong className="text-base font-mono font-bold text-[#381A61] dark:text-[#F9D14A]">
                          {Math.round(evalResult.ownResultScore * 100)}%
                        </strong>
                      </div>
                    </div>

                    {evalResult.probabilities && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                          Probability Distribution:
                        </span>
                        {Object.entries(evalResult.probabilities).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <span className="w-24 capitalize text-zinc-600 dark:text-zinc-400 text-[11px]">
                              {key.replace(/([A-Z])/g, " $1")}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full bg-[#381A61] dark:bg-[#F9D14A]"
                                style={{ width: `${Math.round(val * 100)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                              {Math.round(val * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Tab 2: K-Dense Landmark Trace Mode */}
        {activeTab === "landmark" && (
          <>
            {/* Example Trace Overview Header */}
            <section className="grid gap-4 border-t border-[var(--ct-line)] pt-6">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div className="grid max-w-[900px] gap-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
                    Example trace
                  </p>
                  <h2 className="text-[clamp(22px,2.6vw,30px)] font-serif font-bold leading-tight tracking-tight text-[#381A61] dark:text-[#F9D14A]">
                    {activeExample.data.auditSummary.headline}
                  </h2>
                  <p className="text-[15px] text-zinc-700 dark:text-zinc-300">
                    {activeExample.data.auditSummary.subheadline}
                  </p>
                  <p className="text-xs font-mono text-zinc-500">
                    {activeExample.data.totalPapersRead} papers read · {activeExample.data.originsFound} origin · {activeExample.data.maxHops} hops deep · {activeExample.data.changesFound} changed on the way
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGraphView(!showGraphView)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-[var(--ct-card)] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs"
                  >
                    <GitGraph className="w-3.5 h-3.5 text-[#381A61] dark:text-[#F9D14A]" />
                    {showGraphView ? "Tree View" : "Visual DAG Graph"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-[var(--ct-card)] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    {copiedLink ? "Link Copied!" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMethod}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-[var(--ct-card)] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {copiedMethod ? "JSON Copied!" : "Download"}
                  </button>
                </div>
              </div>
            </section>

            {/* Main Interactive Workspace: Trail on Left, Passage Inspector on Right */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (7 Cols): Trail Step-by-Step Tree or DAG */}
              <div className="lg:col-span-7">
                {showGraphView ? (
                  <TrailGraphView
                    steps={activeExample.data.steps}
                    selectedStepId={selectedStep.id}
                    onSelectStep={setSelectedStep}
                    rootPaper={activeExample.data.rootPaper}
                  />
                ) : (
                  <TrailViewer
                    steps={activeExample.data.steps}
                    selectedStepId={selectedStep.id}
                    onSelectStep={setSelectedStep}
                  />
                )}
              </div>

              {/* Right Column (5 Cols): Detailed Passage & Unsureness Matrix Inspector */}
              <div className="lg:col-span-5 lg:sticky lg:top-20">
                <PassageInspector
                  step={selectedStep}
                  rootClaim={activeExample.data.claim}
                />
              </div>
            </section>

            {/* Privacy & Methodology Footer Card */}
            <section className="ct-card grid gap-3 p-5 text-xs text-zinc-600 dark:text-zinc-400 rounded-2xl">
              <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-semibold">
                <FileText className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
                <span>Zero data retention guarantee</span>
              </div>
              <p>
                Every paper on this trace is open-access or read under CC BY. Citation Telephone runs read-only extraction and evaluates probabilities without altering or storing the original scientific texts.
              </p>
            </section>

            {/* Published Method v0.3 Section */}
            <section id="method" className="grid gap-5 border-t border-[var(--ct-line)] pt-8" aria-labelledby="ct-method-title">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
                    Method v0.3 · October 5, 2026
                  </p>
                  <h2 id="ct-method-title" className="mt-1 text-2xl font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">
                    How a trace is made
                  </h2>
                  <p className="mt-1 max-w-[72ch] text-xs text-zinc-600 dark:text-zinc-400">
                    Everything that decides a trace is published here: every question exactly as it is asked, every threshold and every rule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyMethod}
                  className="rounded-xl border border-[var(--ct-line)] bg-white dark:bg-zinc-800 px-3.5 py-2 text-xs font-bold text-[#381A61] dark:text-[#F9D14A] hover:border-zinc-400 shadow-2xs"
                >
                  {copiedMethod ? "JSON Copied!" : "Copy method as JSON"}
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                {/* The 10 Questions */}
                <div className="ct-card grid gap-4 p-5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  <h3 className="text-sm font-bold text-[#381A61] dark:text-[#F9D14A]">
                    The questions asked of every cited paper
                  </h3>
                  <p>
                    Each paper is read against the sentence that cites it, given as the claim along with how it cites this paper (<code className="font-mono bg-black/5 dark:bg-white/10 px-1 rounded">[14]</code>, <code className="font-mono bg-black/5 dark:bg-white/10 px-1 rounded">Smith et al., 2010</code>). Every question is about what that sentence cites this paper for, so a sentence that also covers other points is read only for its part. The model returns a probability for every option; it doesn't write text.
                  </p>
                  <div className="grid gap-3 pt-1">
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>1. Stated anywhere (yes/no, per window):</strong> “Does this paper state what the claim cites this paper for, as its own result or as background?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>2. Closest paragraph:</strong> “Which paragraph comes closest to stating what the claim cites this paper for?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>3. Own result anywhere (yes/no):</strong> “Does this paper report its own result on what the claim cites this paper for, from its own experiments, data, analysis or pooled analysis?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>4. Own-result paragraph:</strong> “Which paragraph reports this paper's own result on what the claim cites this paper for?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>5. Sentences:</strong> “Which sentence comes closest to stating what the claim cites this paper for?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>6. Support (yes/no):</strong> “Does the passage state what the claim cites this paper for, or part of it?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>7. Comparison:</strong> “Compare what the claim cites this paper for with what the passage says: same, partial, stronger, weaker, different, unrelated.”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>8. Own result (yes/no):</strong> “Does the sentence report a result of this paper's own study, rather than describing earlier work?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>9. References to follow:</strong> “Is this reference cited in the passage as a source for what the claim cites this paper for?”
                    </div>
                    <div className="border-l-2 border-[#381A61]/30 pl-3">
                      <strong>10. Against original claim:</strong> “Compare the claim with what the passage says across the multi-hop chain.”
                    </div>
                  </div>
                </div>

                {/* From readings to results */}
                <div className="grid gap-4">
                  <div className="ct-card grid gap-2.5 p-5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    <h3 className="text-sm font-bold text-[#381A61] dark:text-[#F9D14A]">
                      From readings to results
                    </h3>
                    <ul className="grid list-disc gap-1.5 pl-4">
                      <li>A passage addresses what the paper is cited for when its support reading is at least <strong>40%</strong>, or when its comparison is confidently one of matches, goes further, more cautious, changed (at least <strong>60%</strong>) with “not there” below <strong>15%</strong>.</li>
                      <li>Of the two candidate sentences, the paper's own result is used when it addresses the claim; otherwise the one with the stronger support.</li>
                      <li>A comparison is shown on the trail when its top option reaches <strong>40%</strong>. “Goes further” and “changed” are warnings, shown only at <strong>50%</strong> or more.</li>
                    </ul>

                    <div className="grid gap-2 pt-2 border-t border-[var(--ct-line)]">
                      <div>
                        <strong className="text-[#381A61] dark:text-[#F9D14A]">Origin:</strong> The paper states what it is cited for and that passage reports the paper's own result (own-result reading ≥ 0.50).
                      </div>
                      <div>
                        <strong className="text-[#381A61] dark:text-[#F9D14A]">Passes it on:</strong> The paper states the claim as background and cites other papers for it.
                      </div>
                      <div>
                        <strong className="text-[#381A61] dark:text-[#F9D14A]">Changed:</strong> The passage addresses the same question but inverts the mechanism, effect size, or biological direction.
                      </div>
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="ct-card grid gap-2.5 p-5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    <h3 className="text-sm font-bold text-[#381A61] dark:text-[#F9D14A]">Limits</h3>
                    <ul className="grid list-disc gap-1.5 pl-4">
                      <li>Full text only for open-access papers, arXiv papers and NIH author manuscripts. Everything else is read from its abstract.</li>
                      <li>Up to 3 references followed per sentence, 6 hops and 24 papers per trace.</li>
                      <li>Figures aren't read, but tables and figure legends are parsed.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
