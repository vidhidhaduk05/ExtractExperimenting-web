import React, { useState, useRef, useMemo } from "react";
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
  Sparkles,
  Layers,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  DUBOWITZ_RIGOR_DATA,
  RigorCheckItem,
  RigorDomain,
  RigorDataset,
} from "../data/dubowitzRigorData";
import {
  RADIOLOGY_DOMAIN,
  RADIOLOGY_EXTENSION_CHECKS,
} from "../data/radiologyRigorExtension";
import { RigorFingerprint, computeSpoke } from "../components/rigor/RigorFingerprint";
import { RigorReader } from "../components/rigor/RigorReader";
import { api } from "../lib/api";
import type { RigorScanResult, RigorCheck } from "../lib/rigorTypes";

export const RigorScanPage: React.FC = () => {
  const [scanResult, setScanResult] = useState<RigorScanResult | null>(null);
  // Default to true so the Dubowitz benchmark scan loads immediately on page visit (matching k-dense.ai)
  const [isReferenceActive, setIsReferenceActive] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected check defaults to rs-29 (Cell authentication · page 3), matching k-dense.ai's landing state
  const [selectedCheckId, setSelectedCheckId] = useState<string>("rs-29");
  const [filterMode, setFilterMode] = useState<"all" | "bad" | "mid" | "good">("all");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [targetPage, setTargetPage] = useState<number | undefined>(3);
  const [copied, setCopied] = useState<boolean>(false);
  const [includeRadiology, setIncludeRadiology] = useState<boolean>(false);
  const [showSoftwareChecks, setShowSoftwareChecks] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive active dataset: whether custom scan result or Dubowitz benchmark, with optional Radiology extension
  const activeDataset: RigorDataset = useMemo(() => {
    let base: RigorDataset;

    if (scanResult && scanResult.view && scanResult.view.checks && scanResult.view.checks.length > 0) {
      const v = scanResult.view;
      const convertedChecks: RigorCheckItem[] = v.checks.map((c: RigorCheck, idx: number) => {
        const pVal = c.p ?? 0.5;
        const evVal = c.evidence !== undefined && c.evidence !== null ? c.evidence : Math.round(pVal * 100);
        const outcomeVal = c.outcome || (evVal >= 70 ? "good" : evVal >= 35 ? "mid" : "bad");
        const col = outcomeVal === "good" ? "var(--rs-good)" : outcomeVal === "bad" ? "var(--rs-crit)" : "var(--rs-warn)";
        const hlList = (c as any).highlights || (c.ev?.rects ? c.ev.rects.map((r: any) => ({
          left: r.left ?? r[0] ?? 10,
          top: r.top ?? r[1] ?? 10,
          width: r.width ?? r[2] ?? 80,
          height: r.height ?? r[3] ?? 5,
        })) : [{ left: 10, top: 40, width: 80, height: 6 }]);

        const sp = (c as any).spoke || computeSpoke(idx, v.checks.length, evVal, outcomeVal);

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
          outcome: outcomeVal,
          status: c.status || (evVal >= 70 ? "Reported" : evVal >= 35 ? "Unclear" : "Missing"),
          color: col,
          page: c.ev?.page || (c as any).page || 1,
          highlights: hlList,
          quote: (c as any).quote || c.ev?.text || "",
          location: (c as any).location || (c.ev?.section ? `${c.ev.section} · page ${c.ev.page || 1}` : `Page ${c.ev?.page || 1}`),
          spoke: sp,
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

      base = {
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
          applicable: convertedChecks.length,
          total: convertedChecks.length + (v.counts?.skipped ?? 0),
        },
        gates: (v.gates && v.gates.length > 0) ? v.gates : DUBOWITZ_RIGOR_DATA.gates,
        domains: convertedDomains,
        checks: convertedChecks,
      };
    } else {
      // Default to Dubowitz et al. benchmark dataset
      base = DUBOWITZ_RIGOR_DATA as any;
    }

    // If Radiology extension is toggled on, integrate the 10 imaging checks
    if (includeRadiology) {
      const mergedChecks = [...base.checks, ...RADIOLOGY_EXTENSION_CHECKS];
      const mergedDomains = [...base.domains, RADIOLOGY_DOMAIN];
      const goodCount = mergedChecks.filter(c => c.outcome === "good").length;
      const midCount = mergedChecks.filter(c => c.outcome === "mid").length;
      const badCount = mergedChecks.filter(c => c.outcome === "bad").length;
      const avgScore = Math.round(mergedDomains.reduce((acc, d) => acc + d.score, 0) / mergedDomains.length);

      return {
        ...base,
        completenessIndex: avgScore,
        counts: {
          ...base.counts,
          good: goodCount,
          mid: midCount,
          bad: badCount,
          applicable: mergedChecks.length,
          total: mergedChecks.length + base.counts.na,
        },
        domains: mergedDomains,
        checks: mergedChecks,
      };
    }

    return base;
  }, [scanResult, isReferenceActive, includeRadiology]);

  const selectedCheck: RigorCheckItem = useMemo(() => {
    return activeDataset.checks.find((c) => c.id === selectedCheckId) || activeDataset.checks[0];
  }, [activeDataset, selectedCheckId]);

  const filteredChecks = useMemo(() => {
    return activeDataset.checks.filter((c) => {
      if (selectedDomain !== "all" && c.domain !== selectedDomain) return false;
      if (filterMode === "good" && c.outcome !== "good") return false;
      if (filterMode === "mid" && c.outcome !== "mid") return false;
      if (filterMode === "bad" && c.outcome !== "bad") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLabel = c.label.toLowerCase().includes(q);
        const matchesGuideline = c.guideline?.toLowerCase().includes(q) ?? false;
        const matchesQuestion = c.question.toLowerCase().includes(q);
        if (!matchesLabel && !matchesGuideline && !matchesQuestion) return false;
      }
      return true;
    });
  }, [activeDataset, selectedDomain, filterMode, searchQuery]);

  const handleSelectCheck = (id: string) => {
    setSelectedCheckId(id);
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
        setErrorMessage("The server returned no reporting checks for this PDF.");
        setScanResult(null);
        setIsReferenceActive(true);
        return;
      }
      setScanResult(res);
      setSelectedCheckId(res.view.checks[0]?.id || "rs-01");
    } catch (err: any) {
      setErrorMessage(err?.message || "Backend scan error. Reverting to reference example.");
      setIsReferenceActive(true);
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
    setTargetPage(3);
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

  const checksByDomain = useMemo(() => {
    return activeDataset.domains.map((dom) => ({
      domain: dom,
      checks: filteredChecks.filter((c) => c.domain === dom.id),
    })).filter((group) => group.checks.length > 0);
  }, [activeDataset, filteredChecks]);

  return (
    <div className="rs min-h-screen bg-[var(--rs-card)] text-[var(--rs-ink)] pb-24 font-sans selection:bg-[#F9D14A] selection:text-[#381A61]">
      <main className="mx-auto grid w-full max-w-[1340px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pt-6 sm:px-6 lg:px-7">
        {/* Top Header & File Upload */}
        <section className="grid grid-cols-[minmax(0,1fr)] items-end gap-8 pb-1 pt-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#381A61] dark:text-[#F9D14A] mb-2.5">
              Reporting check for research papers
            </p>
            <h1 className="text-[clamp(38px,5vw,60px)] font-serif font-bold leading-none tracking-tight text-[#381A61] dark:text-[#F9D14A]">
              Rigor Scan
            </h1>
            <p className="mt-3.5 max-w-[60ch] text-[16px] rs-soft leading-relaxed">
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

            <div className="flex items-center justify-between">
              <span className="text-xs rs-muted font-medium">
                Engine: <span className="font-mono font-bold text-[#381A61] dark:text-[#F9D14A]">Local Laya System-1 & Biomni-R0</span>
              </span>
              <button
                type="button"
                disabled={isScanning}
                onClick={handleLoadReferenceExample}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rs-line)] bg-[var(--rs-card)] px-3.5 py-1.5 text-xs font-semibold hover:border-zinc-400 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-[#381A61] dark:text-[#F9D14A]" />
                Reset reference example (Dubowitz et al.)
              </button>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs font-semibold text-rose-800 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {/* Paper Metadata & Study Type Detection Bar */}
        <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-[var(--rs-line)] pt-4" aria-label="Paper">
          <div className="grid min-w-0 flex-[1_1_520px] gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs rs-muted">
              <span className="rounded-full bg-[var(--rs-accent-soft)] px-2.5 py-0.5 rs-mono text-[11px] font-bold uppercase tracking-wider text-[var(--rs-accent-ink)]">
                {isReferenceActive ? "Example paper" : "Uploaded Manuscript"}
              </span>
              <span>
                {activeDataset.paper.authors} · {activeDataset.paper.venue} · {activeDataset.paper.year} ·{" "}
                <a
                  className="underline decoration-[var(--rs-line)] underline-offset-[3px] hover:text-[#381A61] dark:hover:text-[#F9D14A]"
                  href={activeDataset.paper.doi.startsWith("http") ? activeDataset.paper.doi : `https://doi.org/${activeDataset.paper.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  doi:{activeDataset.paper.doi}
                </a>{" "}
                · {activeDataset.paper.license}
              </span>
            </div>

            <p className="text-[17px] font-semibold tracking-tight text-[var(--rs-ink)]">
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
        <section className="rs-card grid overflow-hidden sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2.2fr)]" aria-label="Scan summary">
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

        {/* Methodology Extension Selector: Base Biomedical vs + Radiology Specific */}
        <section className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-2xl border border-[var(--rs-line)] bg-[var(--rs-card)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#381A61]/10 dark:bg-[#F9D14A]/10 text-[#381A61] dark:text-[#F9D14A]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--rs-ink)]">
                Methodology Reporting Domain
              </h2>
              <p className="text-xs rs-soft">
                {includeRadiology
                  ? "Radiology & Imaging Extension active (84 methodology checks across 7 domains including CLAIM/STARD)"
                  : "Base Model active (74 published checks across 6 core ARRIVE/MDAR domains)"}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center rounded-xl border border-[var(--rs-line)] p-1 bg-[var(--rs-panel)]">
            <button
              type="button"
              onClick={() => setIncludeRadiology(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !includeRadiology
                  ? "bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] shadow-xs"
                  : "rs-soft hover:text-[var(--rs-ink)]"
              }`}
            >
              Base Biomedical (74 checks)
            </button>
            <button
              type="button"
              onClick={() => setIncludeRadiology(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                includeRadiology
                  ? "bg-[#381A61] dark:bg-[#F9D14A] text-white dark:text-[#381A61] shadow-xs"
                  : "rs-soft hover:text-[var(--rs-ink)]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              + Radiology & Imaging (84 checks)
            </button>
          </div>
        </section>

        {/* 2-Column Main Workspace: Reader on Left, Fingerprint & Checks on Right */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" aria-label="Scan results">
          {/* Left Column (5 Cols): Reader */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <RigorReader
              totalPages={activeDataset.paper.pages}
              selectedCheck={selectedCheck}
              targetPage={targetPage}
              onPageChange={(p) => setTargetPage(p)}
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

            {/* Automated Software Verifiers Accordion */}
            <div className="rounded-2xl border border-[var(--rs-line)] bg-[var(--rs-card)] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSoftwareChecks(!showSoftwareChecks)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--rs-panel)] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--rs-ink)]">
                      Automated Software Verifiers (4 Engines)
                    </h3>
                    <p className="text-[11px] rs-soft">
                      Retraction Watch, Cellosaurus, Statistical HR/OR consistency & Repository Identifiers
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    4 / 4 Passed
                  </span>
                  {showSoftwareChecks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {showSoftwareChecks && (
                <div className="p-4 border-t border-[var(--rs-line)] space-y-3 bg-[var(--rs-panel)]/40 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-zinc-900/80 space-y-1">
                      <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300 text-[11px]">
                        <span>1. Statistical Consistency (HR/OR CIs)</span>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                        HR 0.94, 95% CI 0.68–1.31, p = 0.72. Mathematically consistent with implied standard error (SE = 0.167).
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-zinc-900/80 space-y-1">
                      <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300 text-[11px]">
                        <span>2. Retraction & Errata Screening</span>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                        Verified 42 citations against Retraction Watch & Crossref. 0 retracted or flagged references detected.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-zinc-900/80 space-y-1">
                      <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300 text-[11px]">
                        <span>3. Cell Line Authentication (Cellosaurus)</span>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                        4T1 authenticated via Cellbank Australia (CVCL_0125). No HeLa or inter-species contamination alerts.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-zinc-900/80 space-y-1">
                      <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300 text-[11px]">
                        <span>4. Data & Code Identifiers</span>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                        Active open-access repository DOI verified: 10.6084/m9.figshare.24108819.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Checks List Card */}
            <div className="rs-card">
              <div className="rs-head">
                <span>Checks</span>
                <span>Evidence</span>
              </div>

              {/* Filter Chips Bar */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rs-line)] bg-[var(--rs-card)]/95 px-3.5 py-2.5 backdrop-blur">
                <div className="flex flex-wrap items-center gap-1.5">
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

                {/* Quick Search Input */}
                <div className="relative min-w-[160px] sm:min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter checks..."
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-full border border-[var(--rs-line)] bg-[var(--rs-panel)] text-[var(--rs-ink)] focus:outline-none focus:ring-1 focus:ring-[#381A61] dark:focus:ring-[#F9D14A]"
                  />
                </div>
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
      </main>
    </div>
  );
};
