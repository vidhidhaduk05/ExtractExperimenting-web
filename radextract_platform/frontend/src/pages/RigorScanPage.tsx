import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Search,
  BookOpen,
  Info,
  Check,
  Filter,
  BarChart2,
  Database,
  FileCode,
  ShieldAlert,
} from "lucide-react";
import { api } from "../lib/api";
import {
  RigorScanResult,
  RigorScanView
} from "../lib/rigorTypes";
import { DEMO_RIGOR_RESULT } from "../data/demoRigorData";

export const RigorScanPage: React.FC = () => {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Scan state
  const [scanResult, setScanResult] = useState<RigorScanResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"checks" | "software" | "methodology">("checks");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCheckId, setSelectedCheckId] = useState<string>("design-01");
  const [statusMessage, setStatusMessage] = useState<string>("Interactive Demo loaded — 74 reporting checks ready.");
  const [isExample, setIsExample] = useState(true);
  const [hasError, setHasError] = useState(false);
  const requestInFlight = useRef(false);

  // File input
  const fileInputRef = useRef<HTMLInputElement>(null);

  const view: RigorScanView | undefined = scanResult?.view;

  // Selected check object
  const selectedCheck = view?.checks.find((c) => c.id === selectedCheckId) || view?.checks[0] || null;

  // Domain filtered checks
  const filteredChecks = (view?.checks || []).filter((c) => {
    if (selectedDomain !== "all" && c.domain !== selectedDomain) return false;
    if (selectedOutcome !== "all") {
      if (selectedOutcome === "applicable" && !c.applies) return false;
      if (selectedOutcome === "na" && c.applies) return false;
      if (["good", "mid", "bad"].includes(selectedOutcome) && c.outcome !== selectedOutcome) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchLabel = c.label.toLowerCase().includes(q);
      const matchQuestion = c.question.toLowerCase().includes(q);
      const matchEv = c.ev?.text.toLowerCase().includes(q) ?? false;
      if (!matchLabel && !matchQuestion && !matchEv) return false;
    }
    return true;
  });

  const beginScan = () => {
    requestInFlight.current = true;
    setIsLoading(true);
    setHasError(false);
    setScanResult(null);
    setSelectedDomain("all");
    setSelectedOutcome("all");
    setSearchQuery("");
    setActiveTab("checks");
  };

  const acceptResult = (result: RigorScanResult, example: boolean) => {
    if (!result?.view || !Array.isArray(result.view.checks) || !result.view.checks.length) {
      if (example) {
        result = DEMO_RIGOR_RESULT;
      } else {
        throw new Error("The server returned no reporting checks.");
      }
    }
    setScanResult(result);
    setIsExample(example);
    setSelectedCheckId(result.view.checks[0]?.id || "design-01");
    setStatusMessage(example ? "Interactive Demo loaded — 74 reporting checks ready." : "Scan complete. Reporting checks and evidence grounded below.");
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || requestInFlight.current) return;
    beginScan();
    try {
      if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please choose a PDF file.");
      setStatusMessage("Uploading PDF and running reporting checks…");
      const liveResult = await api.scanPdfRigor(file);
      acceptResult(liveResult, false);
    } catch (err: unknown) {
      setScanResult(null);
      setHasError(true);
      setStatusMessage(err instanceof Error ? err.message : "PDF scan failed. Please retry.");
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleReplayPreset = async () => {
    if (requestInFlight.current) return;
    beginScan();
    setStatusMessage("Loading reference example…");
    try {
      const data = await api.getRigorExample();
      acceptResult(data?.example || DEMO_RIGOR_RESULT, true);
    } catch (err: unknown) {
      // Graceful fallback to demo dataset in offline/demo mode
      await new Promise((r) => setTimeout(r, 300));
      acceptResult(DEMO_RIGOR_RESULT, true);
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  // Domain definitions with badge colors
  const domainMeta: Record<string, { name: string; color: string; bg: string }> = {
    design: { name: "Study design", color: "text-blue-500", bg: "bg-blue-500/10" },
    stats: { name: "Statistics", color: "text-purple-500", bg: "bg-purple-500/10" },
    materials: { name: "Materials", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    openness: { name: "Data & code", color: "text-amber-500", bg: "bg-amber-500/10" },
    ethics: { name: "Ethics & disclosure", color: "text-indigo-500", bg: "bg-indigo-500/10" },
    claims: { name: "Claims", color: "text-rose-500", bg: "bg-rose-500/10" },
  };

  return (
    <div className={`min-h-full ${isDark ? "bg-[#090a0f] text-zinc-100" : "bg-[#FAF9F3] text-zinc-900"} font-sans transition-colors duration-200`}>
      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pb-2">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              Reporting check for research papers
            </div>
            <h1 className="text-3xl font-serif font-bold text-[#381A61] dark:text-purple-200 leading-tight">
              Rigor Scan
            </h1>
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Upload a scientific PDF to check reporting of its design, statistics, materials, data and claims using the connected analysis service. Review each result alongside the available source evidence.
            </p>
          </div>

          <div className="lg:col-span-5">
            <input
              type="file"
              aria-label="Upload PDF for Rigor Scan"
              disabled={isLoading}
              ref={fileInputRef}
              onChange={handlePdfUpload}
              accept=".pdf"
              className="hidden"
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={() => { if (!requestInFlight.current) fileInputRef.current?.click(); }}
              className={`group w-full text-left disabled:opacity-50 disabled:cursor-wait cursor-pointer rounded-2xl border-2 border-dashed p-6 transition-all duration-200 ${
                isDark
                  ? "border-zinc-800 bg-zinc-900/40 hover:border-blue-500 hover:bg-zinc-900/80"
                  : "border-zinc-300 bg-white hover:border-blue-500 hover:shadow-md"
              } flex items-center gap-4`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base group-hover:text-blue-600 transition-colors">
                  {isLoading ? "Analyzing PDF…" : "Choose a PDF to scan"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                  The PDF is sent to your configured backend for analysis. The returned engine is shown with the results.
                </p>
              </div>
            </button>
            <button type="button" onClick={handleReplayPreset} disabled={isLoading} className="mt-3 text-xs underline text-[#381A61] dark:text-purple-200 disabled:opacity-50">View reference example (sample data)</button>
          </div>
        </div>

        {!view && !isLoading && !hasError && <p className="text-sm text-zinc-500">Choose a PDF to begin. No manuscript has been scanned yet.</p>}

        {/* Paper Banner & Study Gates */}
        {view && (
          <div className={`rounded-xl border p-5 ${isDark ? "bg-zinc-900/40 border-zinc-800" : "bg-white border-zinc-200"} shadow-sm space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="px-2 py-0.5 rounded-full font-mono text-[10px] uppercase font-bold tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {isExample ? "Reference example · sample data" : "Uploaded Manuscript"}
                  </span>
                  <span>{scanResult?.citation?.authors || "Author Cohort"} ┬╖ {scanResult?.citation?.venue || "Journal"} ┬╖ {scanResult?.citation?.year || "2023"}</span>
                  {view.paper.doi && (
                    <>
                      <span>┬╖</span>
                      <a
                        href={`https://doi.org/${view.paper.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-blue-600 transition-colors"
                      >
                        doi:{view.paper.doi}
                      </a>
                    </>
                  )}
                </div>
                <p className="text-xs text-zinc-500">Engine: {scanResult?.engine || "Not reported by server"}</p>
                <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {view.paper.title}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReplayPreset}
                  disabled={isLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    isDark ? "border-zinc-800 bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-800"
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  Load reference example
                </button>
              </div>
            </div>

            {/* Study Types Detected */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Study type:</span>
              {view.gates.map((g) => (
                <span
                  key={g.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    g.on
                      ? isDark
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : isDark
                      ? "bg-zinc-900 text-zinc-500 border-zinc-800"
                      : "bg-zinc-100 text-zinc-400 border-zinc-200"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${g.on ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  {g.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scan Summary Score Card */}
        {view && (
          <div className={`rounded-xl border overflow-hidden grid grid-cols-2 md:grid-cols-5 ${isDark ? "bg-zinc-900/60 border-zinc-800 divide-zinc-800" : "bg-white border-zinc-200 divide-zinc-200"} divide-x divide-y md:divide-y-0 shadow-sm`}>
            {/* Rigor Score */}
            <div className="p-5 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-blue-600 dark:text-blue-400 font-mono">
                  {view.index}%
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Rigor Index
                </span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Average reporting completeness</span>
            </div>

            {/* In Good Shape */}
            <div className="p-5 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-2xl font-black font-mono">{view.counts.good}</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">in good shape</span>
            </div>

            {/* Unclear */}
            <div className="p-5 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-2xl font-black font-mono">{view.counts.mid}</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">unclear</span>
            </div>

            {/* Missing or Flagged */}
            <div className="p-5 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                <span className="text-2xl font-black font-mono">{view.counts.bad}</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">missing or flagged</span>
            </div>

            {/* Not Applicable */}
            <div className="p-5 flex flex-col justify-center col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                <span className="text-2xl font-black font-mono">{view.counts.skipped}</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">don't apply to this study</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("checks")}
              className={`text-sm font-semibold pb-1.5 transition-colors relative ${
                activeTab === "checks"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Reporting checks{view ? ` (${view.checks.length})` : ""}
            </button>
            <button
              onClick={() => setActiveTab("software")}
              className={`text-sm font-semibold pb-1.5 transition-colors relative ${
                activeTab === "software"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Software verifiers{view ? ` (${view.software.length})` : ""}
            </button>
            <button
              onClick={() => setActiveTab("methodology")}
              className={`text-sm font-semibold pb-1.5 transition-colors relative ${
                activeTab === "methodology"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Methodology Rigor & Scoring Rules
            </button>
          </div>

          {statusMessage && (
            <span role={hasError ? "alert" : "status"} className="text-xs text-zinc-500 dark:text-zinc-400 italic">
              {statusMessage}
            </span>
          )}
        </div>

        {/* TAB 1: 74 Checks & Evidence Viewer */}
        {activeTab === "checks" && view && (
          <div className="space-y-6">
            {/* Domain Score Pill Bars */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {view.domains.map((dom) => (
                <button
                  key={dom.id}
                  onClick={() => setSelectedDomain(selectedDomain === dom.id ? "all" : dom.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedDomain === dom.id
                      ? "ring-2 ring-blue-500 border-transparent bg-blue-500/10"
                      : isDark
                      ? "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700"
                      : "bg-white border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate">
                      {dom.label}
                    </span>
                    <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {dom.score}%
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${dom.score}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{dom.good} / {dom.total} items</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border w-full ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
                  <Search className="w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search check questions, labels, or text..."
                    className="bg-transparent border-none outline-none text-xs w-full text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-zinc-400" />
                <select
                  value={selectedOutcome}
                  onChange={(e) => setSelectedOutcome(e.target.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border outline-none font-medium ${
                    isDark ? "bg-zinc-900 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
                  }`}
                >
                  <option value="all">All Outcomes</option>
                  <option value="good">Good shape (reported)</option>
                  <option value="mid">Unclear</option>
                  <option value="bad">Missing or flagged</option>
                  <option value="na">Not applicable</option>
                </select>
              </div>
            </div>

            {/* Two-Column Layout: Check List + Evidence Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Checks list */}
              <div className={`lg:col-span-6 rounded-xl border max-h-[700px] overflow-y-auto divide-y ${
                isDark ? "bg-zinc-900/40 border-zinc-800 divide-zinc-800" : "bg-white border-zinc-200 divide-zinc-200"
              } shadow-sm`}>
                {filteredChecks.map((c) => {
                  const isSelected = selectedCheck?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCheckId(c.id)}
                      className={`p-4 cursor-pointer transition-colors ${
                        isSelected
                          ? isDark
                            ? "bg-blue-950/30 border-l-4 border-l-blue-500"
                            : "bg-blue-50/70 border-l-4 border-l-blue-600"
                          : isDark
                          ? "hover:bg-zinc-800/40"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {/* Outcome status icon */}
                            {c.outcome === "good" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : c.outcome === "mid" ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            ) : c.applies ? (
                              <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                            ) : (
                              <HelpCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                            )}
                            <span className="font-semibold text-sm">{c.label}</span>
                            {c.guideline && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                {c.guideline}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                            {c.question}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              c.outcome === "good"
                                ? isDark
                                  ? "bg-emerald-950/40 text-emerald-300"
                                  : "bg-emerald-100 text-emerald-800"
                                : c.outcome === "mid"
                                ? isDark
                                  ? "bg-amber-950/40 text-amber-300"
                                  : "bg-amber-100 text-amber-800"
                                : c.applies
                                ? isDark
                                  ? "bg-rose-950/40 text-rose-300"
                                  : "bg-rose-100 text-rose-800"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {c.status}
                          </span>
                          {c.applies && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              prob: {Math.round(c.p * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Grounded Evidence Card */}
              <div className={`lg:col-span-6 rounded-xl border p-6 sticky top-24 space-y-5 ${
                isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-white border-zinc-200"
              } shadow-sm`}>
                {selectedCheck ? (
                  <>
                    <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            {selectedCheck.domain} check
                          </span>
                          {selectedCheck.guideline && (
                            <span className="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-zinc-600 dark:text-zinc-400">
                              {selectedCheck.guideline}
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                          {selectedCheck.label}
                        </h3>
                      </div>

                      <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold ${
                          selectedCheck.outcome === "good"
                            ? isDark
                              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                              : "bg-emerald-100 text-emerald-800"
                            : selectedCheck.outcome === "mid"
                            ? isDark
                              ? "bg-amber-950/60 text-amber-300 border border-amber-800"
                              : "bg-amber-100 text-amber-800"
                            : selectedCheck.applies
                            ? isDark
                              ? "bg-rose-950/60 text-rose-300 border border-rose-800"
                              : "bg-rose-100 text-rose-800"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {selectedCheck.status}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Check Question
                      </h4>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        {selectedCheck.question}
                      </p>
                    </div>

                    {/* Verbatim Grounded Evidence Passage */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                          Grounded Evidence in Manuscript
                        </h4>
                        {selectedCheck.ev && (
                          <span className="text-xs font-mono text-zinc-400">
                            {selectedCheck.ev.section} ┬╖ Page {selectedCheck.ev.page}
                          </span>
                        )}
                      </div>

                      {selectedCheck.ev ? (
                        <div className={`p-4 rounded-xl border relative font-serif text-sm leading-relaxed ${
                          isDark
                            ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-100"
                            : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                        }`}>
                          <div className="absolute top-2 right-2 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                            VERBATIM SENTENCE
                          </div>
                          "{selectedCheck.ev.text}"
                        </div>
                      ) : (
                        <div className={`p-4 rounded-xl border text-sm ${
                          isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-500"
                        }`}>
                          <div className="flex items-center gap-2 text-rose-500 font-semibold mb-1">
                            <XCircle className="w-4 h-4" />
                            No explicit statement found
                          </div>
                          {selectedCheck.applies
                            ? "The manuscript was scanned across all sections but does not provide an explicit reporting passage or calculation for this check."
                            : "This reporting check does not apply to the detected study methodology."}
                        </div>
                      )}
                    </div>

                    {/* Methodology & Calibration Details */}
                    <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-zinc-500">
                        <span>Reported confidence:</span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {Math.round(selectedCheck.p * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-500">
                        <span>Evaluation Rule:</span>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {selectedCheck.guideline ? `${selectedCheck.guideline} Criterion` : "Clinical Prediction Modeling Core Standard"}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400 text-center py-12">
                    Select any check from the list to view its sentence-level evidence.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Software verifiers{view ? ` (${view.software.length})` : ""} */}
        {activeTab === "software" && view && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {view.software.map((engine) => (
              <div
                key={engine.id}
                className={`rounded-xl border p-6 space-y-4 ${
                  isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-white border-zinc-200"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    {engine.id === "stats" ? (
                      <BarChart2 className="w-5 h-5 text-purple-500" />
                    ) : engine.id === "refs" ? (
                      <ShieldAlert className="w-5 h-5 text-rose-500" />
                    ) : engine.id === "cells" ? (
                      <Database className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <FileCode className="w-5 h-5 text-blue-500" />
                    )}
                    <h3 className="font-bold text-base">{engine.label}</h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {engine.status}
                  </span>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  {engine.summary}
                </p>

                <div className="space-y-3">
                  {engine.items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                        item.status === "pass"
                          ? isDark
                            ? "bg-zinc-900 border-zinc-800"
                            : "bg-zinc-50 border-zinc-200"
                          : item.status === "info"
                          ? isDark
                            ? "bg-blue-950/20 border-blue-900/60"
                            : "bg-blue-50 border-blue-200"
                          : isDark
                          ? "bg-zinc-900/60 border-zinc-800 text-zinc-400"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {item.status === "pass" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                          {item.status === "info" && <Info className="w-3.5 h-3.5 text-blue-500" />}
                          {item.title}
                        </span>
                        {item.meta && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {item.meta}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {item.detail}
                      </p>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 underline hover:no-underline font-medium"
                        >
                          View source registry
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: Methodology Rigor & Clinical Modeling Guide */}
        {activeTab === "methodology" && (
          <div className="space-y-6">
            <div className={`rounded-xl border p-6 space-y-4 ${
              isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-white border-zinc-200"
            }`}>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Clinical Prediction Modeling & Rigor Methodology Standards
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Rigor Scan enforces both published reporting guidelines (ARRIVE, TRIPOD+AI, PRISMA) and strict statistical design locks distilled from canonical biostatistics frameworks (Harrell, Steyerberg, Kuhn & Johnson, van Buuren).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className={`p-4 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"} space-y-2`}>
                  <h4 className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                    1. Temporal-Alignment Lock (No Future Information)
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Every predictive question must declare a specific decision point (e.g. admission CT before intervention). Predictor variables unavailable strictly before that moment are locked and forbidden. Conditioning on post-decision information invalidates models regardless of reported performance.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"} space-y-2`}>
                  <h4 className="font-semibold text-sm text-purple-600 dark:text-purple-400">
                    2. Full-Pipeline Resampling & Leakage Prevention
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Any performance estimate ignoring model-building steps is falsely optimistic. Imputation (MICE), restricted cubic spline knots, and feature selection must be refit entirely inside each bootstrap or cross-validation resample.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"} space-y-2`}>
                  <h4 className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    3. Continuous Predictors & Nonlinearity Testing
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Linearity is an assumption to be tested, never imposed. Continuous predictors receive 4ΓÇô5 knot restricted cubic splines by default, retaining linear fallbacks only when indistinguishable by likelihood-ratio tests.
                  </p>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"} space-y-2`}>
                  <h4 className="font-semibold text-sm text-amber-600 dark:text-amber-400">
                    4. Triad of Performance: Discrimination, Calibration & Net Benefit
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Reporting AUC alone is unacceptable. Studies must report calibration slope, calibration intercept, Brier score, and decision-curve analysis (DCA) over clinical decision thresholds.
                  </p>
                </div>
              </div>
            </div>

            {/* How Rigor Score is Calculated */}
            <div className={`rounded-xl border p-6 space-y-3 ${
              isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-white border-zinc-200"
            }`}>
              <h4 className="font-bold text-base">Mathematical Rigor Score Formula</h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-mono bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                Domain Score = round( ( Reported_Checks + 0.5 * Unclear_Checks ) / Total_Applicable_Checks * 100 )<br />
                Rigor Index = round( sum(Domain_Scores) / 6 )
              </p>
              <p className="text-xs text-zinc-500">
                Non-applicable checks (such as cell lines in animal-only studies, or clinical trial registrations in retrospective models) are gated out of the denominator so no paper is penalized for checks that do not apply to its study design.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
