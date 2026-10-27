import React, { useState, useRef } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Share2,
  AlertOctagon,
  Search,
  Filter,
  FileCheck2,
} from "lucide-react";
import {
  DUBOWITZ_RIGOR_DATA,
  RigorCheckItem,
  RigorDomain,
  RigorDataset,
} from "../data/dubowitzRigorData";
import { RigorFingerprint } from "../components/rigor/RigorFingerprint";
import { RigorReader } from "../components/rigor/RigorReader";
import { api } from "../lib/api";
import type { RigorScanResult, RigorCheck } from "../lib/rigorTypes";

export const RigorScanPage: React.FC = () => {
  const [scanResult, setScanResult] = useState<RigorScanResult | null>(null);
  const [isReferenceActive, setIsReferenceActive] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedCheckId, setSelectedCheckId] = useState<string>("rs-29");
  const [filterMode, setFilterMode] = useState<"all" | "bad" | "mid" | "good">("all");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive active dataset: whether custom scan result or Dubowitz benchmark
  const activeDataset: RigorDataset | null = React.useMemo(() => {
    if (isReferenceActive) {
      return DUBOWITZ_RIGOR_DATA;
    }
    if (scanResult && scanResult.view && scanResult.view.checks && scanResult.view.checks.length > 0) {
      const v = scanResult.view;
      const convertedChecks: RigorCheckItem[] = v.checks.map((c: RigorCheck, idx: number) => {
        const pVal = c.p ?? 0.5;
        const evVal = c.evidence !== undefined && c.evidence !== null ? c.evidence : Math.round(pVal * 100);
        const col = c.outcome === "good" ? "#2E7D32" : c.outcome === "bad" ? "#C62828" : "#E65100";
        return {
          id: c.id || `chk-${idx}`,
          spokeId: c.id || `chk-${idx}`,
          label: c.label || "Reporting Item",
          question: c.question || c.label,
          domain: (c.domain as any) || "design",
          guideline: c.guideline || null,
          polarity: c.polarity || "good",
          applies: c.applies ?? true,
          p: pVal,
          evidence: evVal,
          outcome: c.outcome || (evVal >= 70 ? "good" : evVal >= 35 ? "mid" : "bad"),
          status: c.status || (evVal >= 70 ? "Good" : evVal >= 35 ? "Unclear" : "Missing"),
          color: col,
          page: c.ev?.page || 1,
          ev: c.ev ? {
            kind: c.ev.kind || "sentence",
            text: c.ev.text || "",
            section: c.ev.section || "Manuscript",
            page: c.ev.page || 1,
            rects: c.ev.rects,
            paraRects: c.ev.paraRects,
          } : null,
        };
      });

      const convertedDomains: RigorDomain[] = (v.domains && v.domains.length > 0)
        ? v.domains.map(d => ({
            id: d.id,
            label: d.label,
            score: d.score,
            total: d.total,
            good: d.good,
            answered: d.answered,
          }))
        : DUBOWITZ_RIGOR_DATA.domains;

      return {
        paper: {
          title: v.paper?.title || "Uploaded Manuscript",
          authors: "Uploaded Manuscript",
          venue: "Rigor Scan Evaluation",
          year: 2026,
          doi: v.paper?.doi || "Local evaluation",
          license: "Open Access",
          pages: v.paper?.pages || 16,
        },
        completenessIndex: v.index || 50,
        counts: {
          good: v.counts?.good ?? convertedChecks.filter(c => c.outcome === "good").length,
          mid: v.counts?.mid ?? convertedChecks.filter(c => c.outcome === "mid").length,
          bad: v.counts?.bad ?? convertedChecks.filter(c => c.outcome === "bad").length,
          na: v.counts?.skipped ?? 0,
        },
        gates: (v.gates && v.gates.length > 0) ? v.gates : [
          { id: "g1", label: "Randomized Trial", on: true },
          { id: "g2", label: "Blinded Assessment", on: true },
          { id: "g3", label: "Pre-registration", on: false },
        ],
        domains: convertedDomains,
        checks: convertedChecks,
      };
    }
    return null;
  }, [scanResult, isReferenceActive]);

  // ⚡ Bolt Optimization: Memoize active selected check lookup to preserve reference equality across unrelated state changes
  const selectedCheck: RigorCheckItem | undefined = React.useMemo(() => {
    if (!activeDataset) return undefined;
    return activeDataset.checks.find((c) => c.id === selectedCheckId) || activeDataset.checks[0];
  }, [activeDataset, selectedCheckId]);

  // ⚡ Bolt Optimization: Memoize filtered check items array based on active filters
  const filteredChecks = React.useMemo(() => {
    if (!activeDataset) return [];
    return activeDataset.checks.filter((c) => {
      if (selectedDomain !== "all" && c.domain !== selectedDomain) return false;
      if (filterMode === "good" && c.outcome !== "good") return false;
      if (filterMode === "mid" && c.outcome !== "mid") return false;
      if (filterMode === "bad" && c.outcome !== "bad") return false;
      return true;
    });
  }, [activeDataset, selectedDomain, filterMode]);

  const handleSelectCheck = (id: string) => {
    setSelectedCheckId(id);
    if (!activeDataset) return;
    const item = activeDataset.checks.find((c) => c.id === id);
    if (item) {
      setTargetPage(item.page);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setErrorMessage(null);
    setScanResult(null);
    setIsReferenceActive(false);

    try {
      const res = await api.scanPdfRigor(file);
      if (!res?.view?.checks || res.view.checks.length === 0) {
        setErrorMessage("The server returned no reporting checks");
        setScanResult(null);
        return;
      }
      setScanResult(res);
      setSelectedCheckId(res.view.checks[0]?.id || "hypothesis");
    } catch (err: any) {
      setErrorMessage(err?.message || "Backend unavailable");
      setScanResult(null);
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleLoadReferenceExample = () => {
    setErrorMessage(null);
    setScanResult(null);
    setIsReferenceActive(true);
    setSelectedCheckId("rs-29");
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplayScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 600);
  };

  // ⚡ Bolt Optimization: Memoize domain-grouped checks using a single-pass O(N) Map algorithm
  // This avoids redundant O(D * N) array filtering and object allocations on every render frame
  const checksByDomain = React.useMemo(() => {
    if (!activeDataset) return [];

    const domainChecksMap = new Map<string, RigorCheckItem[]>();
    for (const c of filteredChecks) {
      const existing = domainChecksMap.get(c.domain);
      if (existing) {
        existing.push(c);
      } else {
        domainChecksMap.set(c.domain, [c]);
      }
    }

    const result: Array<{ domain: RigorDomain; checks: RigorCheckItem[] }> = [];
    for (const dom of activeDataset.domains) {
      const checks = domainChecksMap.get(dom.id);
      if (checks && checks.length > 0) {
        result.push({ domain: dom, checks });
      }
    }
    return result;
  }, [activeDataset, filteredChecks]);

  return (
    <div className="rs min-h-screen bg-[var(--rs-card)] text-[var(--rs-ink)] pb-24 font-sans selection:bg-[#F9D14A] selection:text-[#381A61]">
      <main className="mx-auto grid w-full max-w-[1380px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Top Header & File Upload */}
        <section className="grid grid-cols-[minmax(0,1fr)] items-end gap-8 pb-1 pt-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A] mb-2">
              Reporting check for research papers
            </p>
            <h1 className="text-[clamp(36px,5vw,56px)] font-serif font-bold leading-none tracking-tight text-[#381A61] dark:text-[#F9D14A]">
              Rigor Scan
            </h1>
            <p className="mt-3.5 max-w-[60ch] text-[15.5px] rs-soft leading-relaxed">
              Drop in a paper and get a reporting check on its design, statistics, materials, data and claims in seconds. Every result points to the sentence it rests on.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="rs-file"
              className={`grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed px-5 py-4 transition-all border-[var(--rs-line)] rs-panel hover:border-[var(--rs-accent)] group ${isScanning ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                id="rs-file"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                aria-label="Upload PDF for Rigor Scan"
                disabled={isScanning}
                onChange={handleFileUpload}
                className="sr-only"
              />
              <span className="grid h-[44px] w-[44px] place-items-center rounded-xl bg-[var(--rs-card)] text-[var(--rs-accent)] shadow-sm group-hover:scale-105 transition-transform">
                <UploadCloud className="w-5 h-5" />
              </span>
              <span>
                <strong className="block font-semibold text-sm">
                  {isScanning ? "Scanning manuscript…" : "Drop a PDF or choose a file"}
                </strong>
                <span className="text-xs rs-muted">
                  Read in your browser. The file is never uploaded. Only its text is sent for checking, and nothing is saved.
                </span>
              </span>
            </label>

            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={isScanning}
                onClick={handleLoadReferenceExample}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rs-line)] bg-[var(--rs-card)] px-3.5 py-1.5 text-xs font-semibold hover:border-zinc-400 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-[#381A61] dark:text-[#F9D14A]" />
                View reference example (Dubowitz et al.)
              </button>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs font-semibold text-rose-800 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {!activeDataset ? (
          <section className="rs-card p-10 text-center my-6">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#381A61]/10 dark:bg-[#F9D14A]/10 flex items-center justify-center text-[#381A61] dark:text-[#F9D14A]">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                No manuscript has been scanned yet
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Upload a PDF file using the dropzone above, or view the reference example to explore the 61 radial spokes, 6 domains, and 74 reporting checks.
              </p>
              <button
                type="button"
                disabled={isScanning}
                onClick={handleLoadReferenceExample}
                className="inline-flex items-center gap-2 rounded-xl bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] px-4 py-2 text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <FileCheck2 className="w-4 h-4" />
                View reference example (Dubowitz et al.)
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Paper Metadata & Study Type Detection Bar */}
            <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-[var(--rs-line)] pt-4">
              <div className="grid min-w-0 flex-[1_1_520px] gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs rs-muted">
                  <span className="rounded-full bg-[var(--rs-accent-soft)] px-2.5 py-0.5 rs-mono text-[11px] font-bold uppercase tracking-wider text-[var(--rs-accent-ink)]">
                    {isReferenceActive ? "Example paper" : "Uploaded Manuscript"}
                  </span>
                  <span>
                    {activeDataset.paper.authors} · {activeDataset.paper.venue} · {activeDataset.paper.year}
                    {scanResult?.engine && (
                      <span className="ml-2 font-mono font-semibold text-[#381A61] dark:text-[#F9D14A]">
                        Engine: {scanResult.engine}
                      </span>
                    )}
                  </span>
                </div>

                <p className="text-[16px] font-semibold tracking-tight text-[var(--rs-ink)]">
                  {activeDataset.paper.title}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs font-semibold rs-muted">Study type</span>
                  {activeDataset.gates.map((g) => (
                    <span
                      key={g.id}
                      title={g.on ? "Detected in this paper" : "Not detected"}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                        g.on
                          ? "border-emerald-300 dark:border-emerald-800/60 bg-[var(--rs-card)] font-medium text-emerald-800 dark:text-emerald-300"
                          : "border-[var(--rs-line)] rs-muted bg-[var(--rs-card)]"
                      }`}
                    >
                      <span
                        className={`h-[7px] w-[7px] rounded-full ${
                          g.on ? "bg-emerald-500" : "bg-[var(--rs-na)]"
                        }`}
                      />
                      {g.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rs-line)] bg-[var(--rs-card)] px-3.5 py-2 text-xs font-semibold hover:border-zinc-400 transition-colors shadow-2xs"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied ? "Link Copied!" : "Share results"}
                </button>
                <button
                  type="button"
                  onClick={handleReplayScan}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#381A61] dark:bg-[#F9D14A] px-4 py-2 text-xs font-bold text-white dark:text-[#381A61] hover:opacity-90 transition-all shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                  Replay scan
                </button>
              </div>
            </section>

            {/* Scan Summary Score Card */}
            <section className="rs-card grid overflow-hidden sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.2fr)]">
              <div className="grid gap-0.5 border-[var(--rs-line)] px-4 py-3.5 border-r border-b sm:border-b-0">
                <span className="inline-flex items-center gap-2 rs-mono text-2xl font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  {activeDataset.counts.good}
                </span>
                <span className="text-xs rs-muted">in good shape</span>
              </div>

              <div className="grid gap-0.5 border-[var(--rs-line)] px-4 py-3.5 border-r border-b sm:border-b-0">
                <span className="inline-flex items-center gap-2 rs-mono text-2xl font-bold">
                  <span className="w-4 h-4 rounded-full border border-amber-500 overflow-hidden inline-flex items-center">
                    <span className="w-1/2 h-full bg-amber-500" />
                  </span>
                  {activeDataset.counts.mid}
                </span>
                <span className="text-xs rs-muted">unclear</span>
              </div>

              <div className="grid gap-0.5 border-[var(--rs-line)] px-4 py-3.5 border-r">
                <span className="inline-flex items-center gap-2 rs-mono text-2xl font-bold">
                  <span className="w-4 h-4 rounded-full border-2 border-rose-500" />
                  {activeDataset.counts.bad}
                </span>
                <span className="text-xs rs-muted">missing or flagged</span>
              </div>

              <div className="grid gap-0.5 border-[var(--rs-line)] px-4 py-3.5 sm:border-r-0 lg:border-r">
                <span className="inline-flex items-center gap-2 rs-mono text-2xl font-bold">
                  <span className="w-3.5 h-3.5 rounded-full bg-[var(--rs-na)]" />
                  {activeDataset.counts.na}
                </span>
                <span className="text-xs rs-muted">don't apply to this study</span>
              </div>

              <div className="grid content-center gap-2 border-t border-[var(--rs-line)] px-5 py-3 sm:col-span-4 lg:col-span-1 lg:border-t-0">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="grid gap-1 text-[11px] rs-soft font-medium">
                    <i className="block h-1 overflow-hidden rounded bg-[var(--rs-track)]">
                      <b className="block h-full rounded bg-[var(--rs-accent)] w-full" />
                    </i>
                    Read on device
                  </div>
                  <div className="grid gap-1 text-[11px] rs-soft font-medium">
                    <i className="block h-1 overflow-hidden rounded bg-[var(--rs-track)]">
                      <b className="block h-full rounded bg-[var(--rs-accent)] w-full" />
                    </i>
                    Software checks
                  </div>
                  <div className="grid gap-1 text-[11px] rs-soft font-medium">
                    <i className="block h-1 overflow-hidden rounded bg-[var(--rs-track)]">
                      <b className="block h-full rounded bg-[var(--rs-accent)] w-full" />
                    </i>
                    Check items
                  </div>
                  <div className="grid gap-1 text-[11px] rs-soft font-medium">
                    <i className="block h-1 overflow-hidden rounded bg-[var(--rs-track)]">
                      <b className="block h-full rounded bg-[var(--rs-accent)] w-full" />
                    </i>
                    Link evidence
                  </div>
                </div>
                <p className="text-xs rs-soft" aria-live="polite">
                  Scan complete. Select any check to see its evidence on the page.
                </p>
              </div>
            </section>


        {/* 2-Column Main Workspace: Reader on Left, Fingerprint & Checks on Right */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (5 Cols): Reader */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <RigorReader
              totalPages={activeDataset.paper.pages}
              selectedCheck={selectedCheck}
              targetPage={targetPage}
            />
          </div>

          {/* Right Column (7 Cols): Rigor Fingerprint + Checklist */}
          <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">
            {/* The Radial Spoke Rigor Fingerprint */}
            <RigorFingerprint
              completenessIndex={activeDataset.completenessIndex}
              checks={activeDataset.checks}
              domains={activeDataset.domains}
              selectedCheck={selectedCheck}
              onSelectCheck={handleSelectCheck}
              selectedDomain={selectedDomain}
              onSelectDomain={setSelectedDomain}
              onShowOnPage={(p) => setTargetPage(p)}
            />

            {/* Checks List Card */}
            <div className="rs-card">
              <div className="rs-head">
                <span>Checks</span>
                <span>Evidence</span>
              </div>

              {/* Filter Chips Bar */}
              <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-[var(--rs-line)] bg-[var(--rs-card)]/95 px-3.5 py-2.5 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    filterMode === "all"
                      ? "bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] border-transparent"
                      : "border-[var(--rs-line)] bg-[var(--rs-card)] hover:border-zinc-400"
                  }`}
                >
                  All <span className="rs-mono text-[11px] opacity-75">{activeDataset.checks.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("bad")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    filterMode === "bad"
                      ? "bg-rose-600 text-white border-transparent"
                      : "border-[var(--rs-line)] bg-[var(--rs-card)] hover:border-zinc-400"
                  }`}
                >
                  Missing or flagged <span className="rs-mono text-[11px] opacity-75">{activeDataset.counts.bad}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("mid")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    filterMode === "mid"
                      ? "bg-amber-600 text-white border-transparent"
                      : "border-[var(--rs-line)] bg-[var(--rs-card)] hover:border-zinc-400"
                  }`}
                >
                  Unclear <span className="rs-mono text-[11px] opacity-75">{activeDataset.counts.mid}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("good")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    filterMode === "good"
                      ? "bg-emerald-600 text-white border-transparent"
                      : "border-[var(--rs-line)] bg-[var(--rs-card)] hover:border-zinc-400"
                  }`}
                >
                  In good shape <span className="rs-mono text-[11px] opacity-75">{activeDataset.counts.good}</span>
                </button>
              </div>

              {/* Grouped Checks Rows */}
              <div className="max-h-[640px] overflow-y-auto divide-y divide-[var(--rs-line-soft)]">
                {checksByDomain.map(({ domain, checks }) => (
                  <div key={domain.id}>
                    {/* Domain Sticky Header */}
                    <div className="sticky top-[47px] z-[5] flex items-baseline justify-between gap-2 border-b border-[var(--rs-line-soft)] bg-[var(--rs-card)]/95 px-4 py-2 backdrop-blur">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rs-ink)]">
                        {domain.label}
                      </h3>
                      <span className="text-xs font-mono font-bold text-zinc-500">
                        index {domain.score}
                      </span>
                    </div>

                    {/* Check items in this domain */}
                    {checks.map((c) => {
                      const isSelected = selectedCheck && c.id === selectedCheck.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCheck(c.id)}
                          aria-current={isSelected}
                          className="rs-row group"
                        >
                          {/* Outcome Status Icon */}
                          {c.outcome === "good" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : c.outcome === "mid" ? (
                            <span className="w-3.5 h-3.5 rounded-full border border-amber-500 overflow-hidden inline-flex items-center flex-shrink-0">
                              <span className="w-1/2 h-full bg-amber-500" />
                            </span>
                          ) : c.evidence <= 30 ? (
                            <AlertOctagon className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-rose-500 flex-shrink-0" />
                          )}

                          {/* Label + Guideline */}
                          <span className="truncate text-xs font-medium text-[var(--rs-ink)] text-left flex-1">
                            {c.label}
                            {c.guideline && (
                              <em className="ml-1.5 not-italic rs-mono text-[10px] text-zinc-400">
                                {c.guideline}
                              </em>
                            )}
                          </span>

                          {/* Mini Progress Bar */}
                          <span className="rs-mini" style={{ "--c": c.color } as any}>
                            <i style={{ left: "35%" }} />
                            <i style={{ left: "70%" }} />
                            <b style={{ width: `${c.evidence}%` }} />
                          </span>

                          {/* Exact Percentage Text */}
                          <span className="text-right rs-mono text-xs rs-soft font-semibold w-9 flex-shrink-0">
                            {c.evidence}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
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
