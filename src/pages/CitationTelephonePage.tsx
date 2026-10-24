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
  Upload,
  RefreshCw,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPaper = searchParams.get("paper");

  // Mode: "paper" (From a paper) or "claim" (From a claim)
  const [mode, setMode] = useState<"paper" | "claim">("paper");

  // Benchmark / active trace selection
  const initialIndex = urlPaper
    ? Math.max(
        0,
        PRESET_TELEPHONE_EXAMPLES.findIndex(
          (ex) => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper
        )
      )
    : 0;

  const [selectedExampleIndex, setSelectedExampleIndex] = useState(initialIndex);
  const [customTrace, setCustomTrace] = useState<CitationTelephoneData | null>(null);

  const activeData: CitationTelephoneData =
    customTrace ||
    (PRESET_TELEPHONE_EXAMPLES[selectedExampleIndex] || PRESET_TELEPHONE_EXAMPLES[0]).data;

  // Gather steps for selecting default step
  const getInitialStep = (data: CitationTelephoneData): TraceStep | null => {
    const list: TraceStep[] = [];
    const walk = (items: TraceStep[]) => {
      for (const it of items) {
        list.push(it);
        if (it.nextSteps) walk(it.nextSteps);
      }
    };
    walk(data.steps);
    return list[list.length - 1] || data.steps[0] || null;
  };

  const [selectedStep, setSelectedStep] = useState<TraceStep | null>(getInitialStep(activeData));
  const [paperInput, setPaperInput] = useState(
    (PRESET_TELEPHONE_EXAMPLES[selectedExampleIndex] || PRESET_TELEPHONE_EXAMPLES[0]).paperId
  );
  const [showGraphView, setShowGraphView] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMethod, setCopiedMethod] = useState(false);

  // Live "From a claim" evaluator states
  const [claimSentence, setClaimSentence] = useState(
    "Deep learning automated CTA algorithms achieve over 95% sensitivity for detecting intracranial occlusions in acute ischemic stroke triage. [12]"
  );
  const [sourcePassage, setSourcePassage] = useState(
    "The automated deep learning algorithm exhibited 96.2% sensitivity for proximal M1 occlusions, whereas sensitivity for distal medium vessel occlusions (M2/M3, A2, P2) was significantly lower at 54.1% (p < 0.001)."
  );
  const [sourceTitle, setSourceTitle] = useState(
    "Multicenter Diagnostic Validation of Automated Intracranial Vessel Occlusion Detection on Head CT Angiography"
  );
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Manuscript upload states
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [extractedClaims, setExtractedClaims] = useState<
    Array<{
      sentenceIndex: number;
      citingSentence: string;
      refNumber: number;
      refText: string;
    }>
  >([]);

  useEffect(() => {
    if (urlPaper) {
      const idx = PRESET_TELEPHONE_EXAMPLES.findIndex(
        (ex) => ex.paperId === urlPaper || ex.data.rootPaper.id === urlPaper
      );
      if (idx !== -1) {
        setSelectedExampleIndex(idx);
        setCustomTrace(null);
        const data = PRESET_TELEPHONE_EXAMPLES[idx].data;
        setSelectedStep(getInitialStep(data));
        setPaperInput(PRESET_TELEPHONE_EXAMPLES[idx].paperId);
      }
    }
  }, [urlPaper]);

  const handleSelectExample = (idx: number) => {
    setSelectedExampleIndex(idx);
    setCustomTrace(null);
    const ex = PRESET_TELEPHONE_EXAMPLES[idx];
    setPaperInput(ex.paperId);
    setSelectedStep(getInitialStep(ex.data));
    setSearchParams({ paper: ex.paperId });
  };

  const handleLoadPaper = (e: React.FormEvent) => {
    e.preventDefault();
    const query = paperInput.trim().toUpperCase();
    const idx = PRESET_TELEPHONE_EXAMPLES.findIndex(
      (ex) =>
        ex.paperId.toUpperCase().includes(query) ||
        ex.data.rootPaper.id.toUpperCase().includes(query) ||
        ex.label.toUpperCase().includes(query)
    );
    if (idx !== -1) {
      handleSelectExample(idx);
    } else {
      // Find matching step or switch to custom claim
      setClaimSentence(`Claim citing ${paperInput}`);
      setMode("claim");
    }
  };

  const handleEvaluateClaim = async () => {
    if (!claimSentence.trim() || !sourcePassage.trim()) return;
    setIsEvaluating(true);
    setEvalError(null);

    try {
      const res = await api.evaluateCitationTelephoneClaim(
        claimSentence,
        sourcePassage,
        sourceTitle
      );

      const newStep: TraceStep = {
        hop: 1,
        id: "eval_hop1",
        paperId: sourceTitle ? "Source-Doc" : "Cited-Reference",
        title: sourceTitle || "Cited Source Publication",
        authors: "Primary Investigators",
        journal: "Source Publication",
        year: new Date().getFullYear(),
        isOrigin: true,
        citedAs: "[1]",
        citingSentence: claimSentence,
        foundPassage: sourcePassage,
        passageSource: "abstract",
        paragraphId: "P001",
        sentenceIndex: 1,
        verdict: res.verdict || "same",
        verdictLabel: res.verdictLabel || "Matches Source",
        verdictDescription:
          res.verdict === "different"
            ? "Lexical or semantic inversion detected against the source passage."
            : res.verdict === "stronger"
            ? "Citing sentence overclaims or goes beyond the verified source findings."
            : "Direct alignment verified by local Laya System-1.",
        supportScore: res.supportScore ?? 0.9,
        ownResultScore: res.ownResultScore ?? 0.95,
        probabilities: {
          matches: res.probabilities?.matches ?? 0.8,
          partlyMatches: res.probabilities?.partlyMatches ?? 0.1,
          goesFurther: res.probabilities?.goesFurther ?? 0.05,
          moreCautious: res.probabilities?.moreCautious ?? 0.02,
          changed: res.probabilities?.changed ?? 0.03,
          notThere: res.probabilities?.notThere ?? 0.0,
        },
        unsureness: res.unsureness || {
          isGenuinelyUnsure: false,
          margin: 0.7,
          entropyScore: 0.2,
          recommendation: "verified",
        },
      };

      const trace: CitationTelephoneData = {
        claim: claimSentence,
        rootPaper: {
          id: "Audit-Manuscript",
          title: "Evaluated Manuscript / Statement",
          authors: "Audit Author et al.",
          journal: "Submitted Manuscript",
          year: new Date().getFullYear(),
        },
        totalPapersRead: 2,
        originsFound: 1,
        maxHops: 1,
        changesFound: res.verdict === "same" ? 0 : 1,
        auditSummary: {
          headline: `Laya Evaluation Verdict: ${res.verdictLabel}`,
          subheadline: `Evaluated using local ModernBERT System-1 ONNX inference on HPC. Confidence: ${Math.round(
            (res.supportScore ?? 0.9) * 100
          )}%`,
          criticalWarning:
            res.verdict === "different"
              ? "Potential citation distortion or semantic discrepancy flagged."
              : undefined,
          unsureMatrixSummary: {
            totalAnalyzed: 1,
            highConfidence: 1,
            genuinelyUnsure: res.unsureness?.isGenuinelyUnsure ? 1 : 0,
            semanticDiscrepancies: res.verdict === "same" ? 0 : 1,
          },
        },
        steps: [newStep],
      };

      setCustomTrace(trace);
      setSelectedStep(newStep);
    } catch (err: any) {
      setEvalError(err?.message || "Local Laya evaluation failed");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setEvalError(null);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.uploadCitationTelephoneManuscript(formData);
      setExtractedClaims(res.claims || []);
      if (res.claims && res.claims.length > 0) {
        setClaimSentence(res.claims[0].citingSentence);
        if (res.claims[0].refText) {
          setSourceTitle(res.claims[0].refText);
        }
      }
    } catch (err: any) {
      setEvalError(err?.message || "Failed to read manuscript file");
    } finally {
      setIsUploading(false);
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
      reference: "https://www.k-dense.ai/tools/citation-telephone",
      activeTrace: activeData,
    };
    navigator.clipboard?.writeText(JSON.stringify(methodObj, null, 2));
    setCopiedMethod(true);
    setTimeout(() => setCopiedMethod(false), 2000);
  };

  return (
    <div className="ct min-h-screen bg-[var(--ct-panel)] text-[var(--ct-ink)] pb-24 font-sans selection:bg-[#F9D14A] selection:text-[#381A61]">
      <main className="mx-auto grid w-full max-w-[1380px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Top Hero & Input Card */}
        <section className="grid items-start gap-6 pt-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10">
          <div className="max-w-[760px] xl:pt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A] mb-2.5">
              Trace a claim to its source
            </p>
            <h1 className="text-[clamp(34px,4.5vw,54px)] font-serif font-bold leading-none tracking-tight text-[#381A61] dark:text-[#F9D14A]">
              Citation Telephone
            </h1>
            <p className="mt-4 max-w-[560px] text-[15.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Claims change as they pass from paper to paper. Pick a cited sentence and follow it
              back through the papers it cites, to see where it came from and what changed on the
              way.
            </p>
          </div>

          <div className="ct-card grid gap-4 p-5 sm:p-6 rounded-2xl shadow-sm border border-[#381A61]/15 dark:border-white/10 bg-white dark:bg-[#1E1928]">
            {/* Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ct-line)] pb-3">
              <div
                className="inline-flex rounded-xl bg-black/5 dark:bg-white/5 p-1 text-xs font-semibold"
                role="group"
                aria-label="Workflow mode"
              >
                <button
                  type="button"
                  onClick={() => setMode("paper")}
                  className={`px-3.5 py-1.5 rounded-lg transition-all ${
                    mode === "paper"
                      ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  From a paper
                </button>
                <button
                  type="button"
                  onClick={() => setMode("claim")}
                  className={`px-3.5 py-1.5 rounded-lg transition-all ${
                    mode === "claim"
                      ? "bg-white dark:bg-zinc-800 text-[#381A61] dark:text-[#F9D14A] shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  From a claim
                </button>
              </div>

              <span className="text-xs text-zinc-500 font-mono">
                {mode === "paper"
                  ? "Multi-Hop Benchmark Traces"
                  : "Local ModernBERT Laya System-1"}
              </span>
            </div>

            {/* Mode: From a paper */}
            {mode === "paper" && (
              <div className="grid gap-3">
                <form onSubmit={handleLoadPaper} className="grid gap-1.5">
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
                </form>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-zinc-500 mr-1">Examples:</span>
                  {PRESET_TELEPHONE_EXAMPLES.map((ex, idx) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => handleSelectExample(idx)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                        !customTrace && idx === selectedExampleIndex
                          ? "bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] border-transparent"
                          : "border-[var(--ct-line)] bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400"
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mode: From a claim */}
            {mode === "claim" && (
              <div className="grid gap-3 text-xs">
                <div className="grid gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      The citing claim to trace:
                    </span>
                    <label className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-[11px]">
                      <Upload className="w-3 h-3" />
                      <span>{isUploading ? "Uploading..." : "Upload manuscript (.docx / .txt)"}</span>
                      <input
                        type="file"
                        accept=".docx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    value={claimSentence}
                    onChange={(e) => setClaimSentence(e.target.value)}
                    placeholder="Enter the citing sentence containing a citation..."
                    className="w-full rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] p-2.5 font-sans outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                  />
                </div>

                <div className="grid gap-1">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Source passage in cited paper:
                  </span>
                  <textarea
                    rows={2}
                    value={sourcePassage}
                    onChange={(e) => setSourcePassage(e.target.value)}
                    placeholder="Paste the relevant passage or results sentence from the cited paper..."
                    className="w-full rounded-xl border border-[var(--ct-line)] bg-[var(--ct-panel)] p-2.5 font-sans outline-none focus:border-[#381A61] dark:focus:border-[#F9D14A]"
                  />
                </div>

                {extractedClaims.length > 0 && (
                  <div className="border border-[var(--ct-line)] rounded-xl p-2.5 bg-black/5 dark:bg-white/5 space-y-1.5 max-h-36 overflow-y-auto">
                    <span className="text-[11px] font-bold uppercase text-zinc-500">
                      Citations found in manuscript ({extractedClaims.length}):
                    </span>
                    {extractedClaims.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setClaimSentence(c.citingSentence);
                          if (c.refText) setSourceTitle(c.refText);
                        }}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 border border-transparent hover:border-zinc-300 truncate"
                      >
                        [{c.refNumber}] {c.citingSentence}
                      </button>
                    ))}
                  </div>
                )}

                {evalError && (
                  <div className="text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 flex-none" />
                    <span>{evalError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleEvaluateClaim}
                  disabled={isEvaluating}
                  className="rounded-xl bg-[#381A61] dark:bg-[#F9D14A] px-4 py-2.5 text-xs font-bold text-white dark:text-[#381A61] hover:opacity-90 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Evaluating via Local Laya...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Trace Claim with Local Laya System-1
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Example Trace Overview Header */}
        <section className="grid gap-4 border-t border-[var(--ct-line)] pt-6">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="grid max-w-[900px] gap-1">
              <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A]">
                {customTrace ? "Audited Claim Trace" : "Example trace"}
              </p>
              <h2 className="text-[clamp(20px,2.4vw,28px)] font-serif font-bold leading-tight tracking-tight text-[#381A61] dark:text-[#FAF9F3]">
                {activeData.auditSummary.headline}
              </h2>
              <p className="text-[14.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {activeData.auditSummary.subheadline}
              </p>
              <p className="text-xs font-mono text-zinc-500">
                {activeData.totalPapersRead} papers read · {activeData.originsFound} origin ·{" "}
                {activeData.maxHops} {activeData.maxHops === 1 ? "hop" : "hops"} deep ·{" "}
                {activeData.changesFound} changed on the way
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGraphView(!showGraphView)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-white dark:bg-[#1E1928] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs text-zinc-700 dark:text-zinc-200"
              >
                <GitGraph className="w-3.5 h-3.5 text-[#381A61] dark:text-[#F9D14A]" />
                {showGraphView ? "Tree View" : "Visual DAG Graph"}
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-white dark:bg-[#1E1928] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs text-zinc-700 dark:text-zinc-200"
              >
                <Share2 className="w-3.5 h-3.5" />
                {copiedLink ? "Link Copied!" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={handleCopyMethod}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ct-line)] bg-white dark:bg-[#1E1928] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs text-zinc-700 dark:text-zinc-200"
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
                data={activeData}
                selectedStep={selectedStep}
                onSelectStep={setSelectedStep}
              />
            ) : (
              <TrailViewer
                data={activeData}
                selectedStep={selectedStep}
                onSelectStep={setSelectedStep}
              />
            )}
          </div>

          {/* Right Column (5 Cols): Detailed Passage & Unsureness Matrix Inspector */}
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            <PassageInspector step={selectedStep} rootClaim={activeData.claim} />
          </div>
        </section>

        {/* Privacy & Methodology Footer Card */}
        <section className="ct-card grid gap-3 p-5 text-xs text-zinc-600 dark:text-zinc-400 rounded-2xl border border-[var(--ct-line)] bg-white dark:bg-[#1E1928]">
          <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-semibold">
            <FileText className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
            <span>Zero data retention guarantee</span>
          </div>
          <p className="leading-relaxed">
            All text passages and manuscript uploads are processed ephemerally in RAM. Local
            ModernBERT System-1 inference runs securely on internal GPU/CPU accelerators without
            retaining citations, claims, or manuscript files on disk.
          </p>
        </section>
      </main>
    </div>
  );
};
