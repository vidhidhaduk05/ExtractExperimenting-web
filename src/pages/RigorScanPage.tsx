import React, { useState, useRef } from "react";
import {
  UploadCloud,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Share2,
  AlertOctagon,
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
        const col = c.outcome === "good" ? "#3a0f34" : c.outcome === "bad" ? "#be123c" : "#7c5800";
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

  const selectedCheck: RigorCheckItem | undefined = activeDataset
    ? (activeDataset.checks.find((c) => c.id === selectedCheckId) || activeDataset.checks[0])
    : undefined;

  const filteredChecks = activeDataset
    ? activeDataset.checks.filter((c) => {
        if (selectedDomain !== "all" && c.domain !== selectedDomain) return false;
        if (filterMode === "good" && c.outcome !== "good") return false;
        if (filterMode === "mid" && c.outcome !== "mid") return false;
        if (filterMode === "bad" && c.outcome !== "bad") return false;
        return true;
      })
    : [];

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
    try {
      navigator.clipboard?.writeText(window.location.href)?.catch(() => {});
    } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplayScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 600);
  };

  const checksByDomain = activeDataset
    ? activeDataset.domains.map((dom) => ({
        domain: dom,
        checks: filteredChecks.filter((c) => c.domain === dom.id),
      })).filter((group) => group.checks.length > 0)
    : [];

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-[#4f444b] pb-24 font-sans selection:bg-[#ffdea6] selection:text-[#3a0f34]">
      <main className="mx-auto grid w-full max-w-[1380px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Top Header & File Upload */}
        <section className="grid grid-cols-[minmax(0,1fr)] items-end gap-8 pb-1 pt-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#814d75] mb-2 font-sans">
              Reporting check for research papers
            </p>
            <h1 className="text-[clamp(36px,5vw,56px)] font-serif font-bold leading-none tracking-tight text-[#3a0f34]">
              Rigor Scan
            </h1>
            <p className="mt-3.5 max-w-[60ch] text-[15.5px] text-[#62535d] leading-relaxed font-serif">
              Drop in a paper and get a reporting check on its design, statistics, materials, data and claims in seconds. Every result points to the sentence it rests on.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="rs-file"
              className={`grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3.5 rounded-xl border border-dashed px-5 py-4 transition-all border-[#d2c2cb] bg-white hover:border-[#3a0f34] shadow-xs group ${isScanning ? "opacity-60 cursor-not-allowed" : ""}`}
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
              <span className="grid h-[44px] w-[44px] place-items-center rounded-xl bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] shadow-xs group-hover:scale-105 transition-transform">
                <UploadCloud className="w-5 h-5" />
              </span>
              <span>
                <strong className="block font-semibold text-sm text-[#3a0f34]">
                  {isScanning ? "Scanning manuscript…" : "Drop a PDF or choose a file"}
                </strong>
                <span className="text-xs text-[#81737b] font-serif">
                  Read in your browser. The file is never uploaded. Only its text is sent for checking, and nothing is saved.
                </span>
              </span>
            </label>

            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={isScanning}
                onClick={handleLoadReferenceExample}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-[#814d75]" />
                View reference example (Dubowitz et al.)
              </button>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div role="alert" className="rounded-xl border border-[#814d75] bg-[#eee7ec] p-4 text-xs font-semibold text-[#3a0f34]">
            {errorMessage}
          </div>
        )}

        {!activeDataset ? (
          <section className="bg-white border border-[#d2c2cb] rounded-xl shadow-xs p-10 text-center my-6">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75]">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-serif font-bold text-[#3a0f34]">
                No manuscript has been scanned yet
              </h2>
              <p className="text-xs text-[#62535d] leading-relaxed font-serif">
                Upload a PDF file using the dropzone above, or view the reference example to explore the 61 radial spokes, 6 domains, and 74 reporting checks.
              </p>
              <button
                type="button"
                disabled={isScanning}
                onClick={handleLoadReferenceExample}
                className="btn-primary text-xs inline-flex items-center gap-2"
              >
                <FileCheck2 className="w-4 h-4" />
                View reference example (Dubowitz et al.)
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Paper Metadata & Study Type Detection Bar */}
            <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-[#d2c2cb] pt-4">
              <div className="grid min-w-0 flex-[1_1_520px] gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#81737b] font-sans">
                  <span className="rounded-full bg-[#eee7ec] border border-[#d2c2cb] px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#3a0f34]">
                    {isReferenceActive ? "Example paper" : "Uploaded Manuscript"}
                  </span>
                  <span>
                    {activeDataset.paper.authors} · {activeDataset.paper.venue} · {activeDataset.paper.year}
                    {scanResult?.engine && (
                      <span className="ml-2 font-mono font-semibold text-[#814d75]">
                        Engine: {scanResult.engine}
                      </span>
                    )}
                  </span>
                </div>

                <p className="text-[16px] font-serif font-bold tracking-tight text-[#3a0f34]">
                  {activeDataset.paper.title}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs font-semibold text-[#81737b] font-sans">Study type</span>
                  {activeDataset.gates.map((g) => (
                    <span
                      key={g.id}
                      title={g.on ? "Detected in this paper" : "Not detected"}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-sans ${
                        g.on
                          ? "border-[#d2c2cb] bg-[#eee7ec] font-semibold text-[#3a0f34]"
                          : "border-[#d2c2cb] text-[#81737b] bg-white"
                      }`}
                    >
                      <span
                        className={`h-[7px] w-[7px] rounded-full ${
                          g.on ? "bg-[#3a0f34]" : "bg-[#d2c2cb]"
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
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied ? "Link Copied!" : "Share results"}
                </button>
                <button
                  type="button"
                  onClick={handleReplayScan}
                  disabled={isScanning}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                  Replay scan
                </button>
              </div>
            </section>

            {/* Scan Summary Score Card */}
            <section className="bg-white border border-[#d2c2cb] rounded-xl shadow-xs grid overflow-hidden sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.2fr)]">
              <div className="grid gap-0.5 border-[#eee7ec] px-4 py-3.5 border-r border-b sm:border-b-0">
                <span className="inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#3a0f34]">
                  <CheckCircle2 className="w-5 h-5 text-[#3a0f34]" />
                  {activeDataset.counts.good}
                </span>
                <span className="text-xs text-[#81737b] font-sans">in good shape</span>
              </div>

              <div className="grid gap-0.5 border-[#eee7ec] px-4 py-3.5 border-r border-b sm:border-b-0">
                <span className="inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#7c5800]">
                  <span className="w-4 h-4 rounded-full border border-[#7c5800] overflow-hidden inline-flex items-center">
                    <span className="w-1/2 h-full bg-[#7c5800]" />
                  </span>
                  {activeDataset.counts.mid}
                </span>
                <span className="text-xs text-[#81737b] font-sans">unclear</span>
              </div>

              <div className="grid gap-0.5 border-[#eee7ec] px-4 py-3.5 border-r">
                <span className="inline-flex items-center gap-2 font-mono text-2xl font-bold text-rose-700">
                  <span className="w-4 h-4 rounded-full border-2 border-rose-700" />
                  {activeDataset.counts.bad}
                </span>
                <span className="text-xs text-[#81737b] font-sans">missing or flagged</span>
              </div>

              <div className="grid gap-0.5 border-[#eee7ec] px-4 py-3.5 sm:border-r-0 lg:border-r">
                <span className="inline-flex items-center gap-2 font-mono text-2xl font-bold text-[#81737b]">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#d2c2cb]" />
                  {activeDataset.counts.na}
                </span>
                <span className="text-xs text-[#81737b] font-sans">don't apply to this study</span>
              </div>

              <div className="grid content-center gap-2 border-t border-[#eee7ec] px-5 py-3 sm:col-span-4 lg:col-span-1 lg:border-t-0 bg-[#fbf9f4]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="grid gap-1 text-[11px] text-[#62535d] font-medium font-sans">
                    <i className="block h-1 overflow-hidden rounded bg-[#eee7ec]">
                      <b className="block h-full rounded bg-[#3a0f34] w-full" />
                    </i>
                    Read on device
                  </div>
                  <div className="grid gap-1 text-[11px] text-[#62535d] font-medium font-sans">
                    <i className="block h-1 overflow-hidden rounded bg-[#eee7ec]">
                      <b className="block h-full rounded bg-[#3a0f34] w-full" />
                    </i>
                    Software checks
                  </div>
                  <div className="grid gap-1 text-[11px] text-[#62535d] font-medium font-sans">
                    <i className="block h-1 overflow-hidden rounded bg-[#eee7ec]">
                      <b className="block h-full rounded bg-[#3a0f34] w-full" />
                    </i>
                    Check items
                  </div>
                  <div className="grid gap-1 text-[11px] text-[#62535d] font-medium font-sans">
                    <i className="block h-1 overflow-hidden rounded bg-[#eee7ec]">
                      <b className="block h-full rounded bg-[#3a0f34] w-full" />
                    </i>
                    Link evidence
                  </div>
                </div>
                <p className="text-xs text-[#62535d] font-serif" aria-live="polite">
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
                <div className="bg-white border border-[#d2c2cb] rounded-xl shadow-xs overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#fbf9f4] border-b border-[#d2c2cb] text-xs font-semibold text-[#3a0f34] font-sans">
                    <span>Checks</span>
                    <span>Evidence</span>
                  </div>

                  {/* Filter Chips Bar */}
                  <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-[#eee7ec] bg-white/95 px-3.5 py-2.5 backdrop-blur">
                    <button
                      type="button"
                      onClick={() => setFilterMode("all")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all font-sans ${
                        filterMode === "all"
                          ? "bg-[#3a0f34] text-[#fbf9f4] border-transparent"
                          : "border-[#d2c2cb] bg-white text-[#4f444b] hover:bg-[#eee7ec]"
                      }`}
                    >
                      All <span className="font-mono text-[11px] opacity-75">{activeDataset.checks.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("bad")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all font-sans ${
                        filterMode === "bad"
                          ? "bg-rose-700 text-white border-transparent"
                          : "border-[#d2c2cb] bg-white text-[#4f444b] hover:bg-[#eee7ec]"
                      }`}
                    >
                      Missing or flagged <span className="font-mono text-[11px] opacity-75">{activeDataset.counts.bad}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("mid")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all font-sans ${
                        filterMode === "mid"
                          ? "bg-[#7c5800] text-white border-transparent"
                          : "border-[#d2c2cb] bg-white text-[#4f444b] hover:bg-[#eee7ec]"
                      }`}
                    >
                      Unclear <span className="font-mono text-[11px] opacity-75">{activeDataset.counts.mid}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("good")}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all font-sans ${
                        filterMode === "good"
                          ? "bg-[#3a0f34] text-[#fbf9f4] border-transparent"
                          : "border-[#d2c2cb] bg-white text-[#4f444b] hover:bg-[#eee7ec]"
                      }`}
                    >
                      In good shape <span className="font-mono text-[11px] opacity-75">{activeDataset.counts.good}</span>
                    </button>
                  </div>

                  {/* Grouped Checks Rows */}
                  <div className="max-h-[640px] overflow-y-auto divide-y divide-[#eee7ec]">
                    {checksByDomain.map(({ domain, checks }) => (
                      <div key={domain.id}>
                        {/* Domain Sticky Header */}
                        <div className="sticky top-[47px] z-[5] flex items-baseline justify-between gap-2 border-b border-[#eee7ec] bg-[#fbf9f4]/95 px-4 py-2 backdrop-blur">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[#3a0f34] font-sans">
                            {domain.label}
                          </h3>
                          <span className="text-xs font-mono font-bold text-[#81737b]">
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
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[#eee7ec]/60 ${
                                isSelected ? "bg-[#eee7ec] border-l-4 border-l-[#3a0f34]" : "hover:bg-[#eee7ec]/40"
                              }`}
                            >
                              {/* Outcome Status Icon */}
                              {c.outcome === "good" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#3a0f34] flex-shrink-0" />
                              ) : c.outcome === "mid" ? (
                                <span className="w-3.5 h-3.5 rounded-full border border-[#7c5800] overflow-hidden inline-flex items-center flex-shrink-0">
                                  <span className="w-1/2 h-full bg-[#7c5800]" />
                                </span>
                              ) : c.evidence <= 30 ? (
                                <AlertOctagon className="w-3.5 h-3.5 text-rose-700 flex-shrink-0" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-rose-700 flex-shrink-0" />
                              )}

                              {/* Label + Guideline */}
                              <span className="truncate text-xs font-medium text-[#4f444b] text-left flex-1 font-sans">
                                {c.label}
                                {c.guideline && (
                                  <em className="ml-1.5 not-italic font-mono text-[10px] text-[#81737b]">
                                    {c.guideline}
                                  </em>
                                )}
                              </span>

                              {/* Mini Progress Bar */}
                              <span className="w-16 h-1.5 rounded-full bg-[#eee7ec] overflow-hidden border border-[#d2c2cb]/40 flex-shrink-0">
                                <b
                                  className="block h-full bg-[#3a0f34]"
                                  style={{ width: `${c.evidence}%` }}
                                />
                              </span>

                              {/* Exact Percentage Text */}
                              <span className="text-right font-mono text-xs text-[#62535d] font-semibold w-9 flex-shrink-0">
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
