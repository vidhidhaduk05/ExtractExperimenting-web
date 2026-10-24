import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Share2,
  Check,
  Search,
  Sparkles,
  ArrowRight,
  Layers,
  FileText,
  SlidersHorizontal,
  Sun,
  Moon,
  ExternalLink,
  ShieldAlert
} from "lucide-react";
import hrtDataRaw from "../data/hrt_example.json";
import {
  Paper,
  Judgment,
  classifyPaper,
  computeTierSummaries,
  generateHeadline,
  PRESET_EXAMPLES,
  ProcessedPaper,
  TIER_BY_ID,
  STANCE_LABEL
} from "../lib/claimscapeMethod";
import { ClaimscapeMap } from "../components/claimscape/ClaimscapeMap";
import { PaperInspector } from "../components/claimscape/PaperInspector";
import { MethodologySection } from "../components/claimscape/MethodologySection";
import { api } from "../lib/api";
import { fetchLivePubMedEvidence } from "../lib/pubmedLiveClient";

export const ClaimscapePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlClaim = searchParams.get("claim");
  const urlQ = searchParams.get("q");
  const urlN = searchParams.get("n");

  const initialClaim = urlClaim || hrtDataRaw.claim;
  const initialQuery = urlQ || (urlClaim ? urlClaim.split("+").join(" ") : hrtDataRaw.query);
  const initialCount = urlN ? parseInt(urlN, 10) || 300 : 300;

  // Active dataset state (initialized with 300 publications so the map renders immediately)
  const [dataset, setDataset] = useState<{
    claim: string;
    query: string;
    total: number;
    papers: Paper[];
    judgments: Judgment[];
  }>({
    claim: initialClaim,
    query: initialQuery,
    total: hrtDataRaw.total || 594,
    papers: hrtDataRaw.papers as Paper[],
    judgments: (hrtDataRaw as any).judgments || [],
  });

  // Helper to build neutral PubMed query from claim statement
  const buildPubMedQuery = (claimText: string): string => {
    let q = claimText.trim();
    if (!q) return "";
    const directional = [
      /\breduces\b/gi, /\breduce\b/gi, /\bdecreases\b/gi, /\bdecrease\b/gi,
      /\bincreases\b/gi, /\bincrease\b/gi, /\bimproves\b/gi, /\bimprove\b/gi,
      /\bworsens\b/gi, /\bworsen\b/gi, /\bprevents\b/gi, /\bprevent\b/gi,
      /\bcauses\b/gi, /\bcause\b/gi, /\bleads to\b/gi, /\bprotects against\b/gi,
      /\bprotective nature against\b/gi, /\bprotective against\b/gi,
      /\blowers\b/gi, /\blower\b/gi, /\belevates\b/gi, /\belevate\b/gi,
      /\bextends\b/gi, /\bextend\b/gi
    ];
    for (const d of directional) {
      q = q.replace(d, " ");
    }
    q = q.replace(/[^\w\s-]/g, " ");
    const stopWords = new Set(["the", "a", "an", "and", "or", "for", "with", "from", "in", "on", "at", "by", "to", "of", "is", "are", "was", "were", "risk", "nature"]);
    const terms = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    return terms.join(" ");
  };

  // Track if user explicitly edited the query field
  const [userEditedQuery, setUserEditedQuery] = useState<boolean>(false);

  // Form states
  const [claim, setClaim] = useState<string>(initialClaim);
  const [query, setQuery] = useState<string>(initialQuery);
  const [paperCount, setPaperCount] = useState<number>(initialCount);
  const [includeCommentary, setIncludeCommentary] = useState<boolean>(false);
  const [directOnly, setDirectOnly] = useState<boolean>(false);
  const [showReviews, setShowReviews] = useState<boolean>(true);
  const [selectedExample, setSelectedExample] = useState<string>("hrt");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [scanError, setScanError] = useState("");
  const [resultSource, setResultSource] = useState("Evidence synthesis active · 300 publications analyzed across study designs");
  const [evalSpeed, setEvalSpeed] = useState<number | null>(null);

  // Auto-scroll and progress bar states
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStepLabel, setScanStepLabel] = useState<string>("");
  const progressIntervalRef = useRef<any>(null);

  // Clear progress timer on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // Handle claim changes: auto-build query if user hasn't typed custom query
  const handleClaimChange = (newClaim: string) => {
    setClaim(newClaim);
    if (!userEditedQuery) {
      setQuery(buildPubMedQuery(newClaim));
    }
  };

  // Table filter search
  const [tableSearch, setTableSearch] = useState<string>("");

  // Selected paper in inspector (default to landmark WHI trial)
  const [selectedPmid, setSelectedPmid] = useState<string>("12117397");

  // Map judgments by PMID
  const judgmentMap = useMemo(() => {
    const map = new Map<string, Judgment>();
    for (const j of dataset.judgments) {
      map.set(j.pmid, j);
    }
    return map;
  }, [dataset.judgments]);

  // Classify all papers
  const processedPapers = useMemo(() => {
    return dataset.papers.map((paper) => {
      const judgment = judgmentMap.get(paper.pmid) || {
        pmid: paper.pmid,
        onTopic: 1,
        direct: 1,
        stance: { supports: 0.5, contradicts: 0.5 },
        stanceCheck: { supports: 0.5, contradicts: 0.5 }
      };
      return classifyPaper(paper, judgment);
    });
  }, [dataset.papers, judgmentMap]);

  // Compute tier summaries and metrics
  const summaries = useMemo(() => {
    return computeTierSummaries(processedPapers, directOnly);
  }, [processedPapers, directOnly]);

  // Dynamic Headline synthesis
  const headlineData = useMemo(() => {
    return generateHeadline(summaries, processedPapers.length);
  }, [summaries, processedPapers]);

  // Active selected paper
  const activePaper = useMemo(() => {
    return processedPapers.find((p) => p.paper.pmid === selectedPmid) || processedPapers[0] || null;
  }, [processedPapers, selectedPmid]);

  // Key KPI stats
  const stats = useMemo(() => {
    const onTopicList = processedPapers.filter((p) => p.onTopic);
    const mappedList = onTopicList.filter((p) => p.tier && (!directOnly || p.direct));
    const withVerdictList = mappedList.filter(
      (p) => p.tier && TIER_BY_ID[p.tier]?.counted && (p.category === "supports" || p.category === "contradicts" || p.category === "mixed")
    );

    return {
      totalMatches: dataset.total || 594,
      read: Math.min(paperCount, processedPapers.length),
      onTopic: onTopicList.length,
      onMap: mappedList.length,
      withVerdict: withVerdictList.length
    };
  }, [processedPapers, paperCount, directOnly, dataset.total]);

  // Filtered papers for bottom data table
  const filteredTablePapers = useMemo(() => {
    return processedPapers
      .filter((p) => p.onTopic && p.tier && (!directOnly || p.direct))
      .filter((p) => {
        if (!tableSearch.trim()) return true;
        const q = tableSearch.toLowerCase();
        return (
          p.paper.title.toLowerCase().includes(q) ||
          p.paper.journal?.toLowerCase().includes(q) ||
          p.paper.pmid.includes(q) ||
          (p.finding && p.finding.toLowerCase().includes(q))
        );
      });
  }, [processedPapers, directOnly, tableSearch]);

  const scrollToMap = () => {
    setTimeout(() => {
      if (mapSectionRef.current) {
        mapSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
  };

  const runEvidenceSearch = async (nextClaim: string, nextQuery: string) => {
    const activeClaim = nextClaim.trim();
    const activeQuery = nextQuery.trim() || buildPubMedQuery(activeClaim);
    if (!activeClaim) return;

    setIsScanning(true);
    setScanError("");
    setEvalSpeed(null);
    setResultSource("Synthesizing evidence across biomedical literature…");

    // Initialize progress bar
    setScanProgress(12);
    setScanStepLabel("Querying PubMed & indexing matching studies...");
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      setScanProgress((prev) => {
        if (prev < 35) {
          setScanStepLabel("Retrieving publication abstracts & study designs...");
          return prev + 6;
        }
        if (prev < 70) {
          setScanStepLabel("Reading abstracts with Laya System-1 ONNX model...");
          return prev + 4;
        }
        if (prev < 92) {
          setScanStepLabel("Synthesizing stances & plotting evidence distribution...");
          return prev + 1.5;
        }
        return prev;
      });
    }, 350);

    // Sync URL parameters without full page reload
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("claim", activeClaim);
      if (activeQuery) newUrl.searchParams.set("q", activeQuery);
      newUrl.searchParams.set("n", paperCount.toString());
      window.history.replaceState({}, "", newUrl.toString());
    } catch {}

    const finishScan = (label = "Evidence mapped successfully") => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setScanProgress(100);
      setScanStepLabel(label);
      setIsScanning(false);
      scrollToMap();
      setTimeout(() => {
        setScanProgress(0);
        setScanStepLabel("");
      }, 2500);
    };

    // Step 1: Try Local Backend API if available
    try {
      const res = await api.evaluateClaimscape(activeClaim, activeQuery, paperCount);
      if (Array.isArray(res?.papers) && res.papers.length > 0 && Array.isArray(res?.judgments)) {
        setDataset({
          claim: res.claim || activeClaim,
          query: res.query || activeQuery,
          total: res.total ?? res.papers.length,
          papers: res.papers,
          judgments: res.judgments,
        });
        setSelectedPmid(res.papers[0]?.pmid || "");
        setEvalSpeed(res.elapsed_ms);
        setResultSource(`Live Backend Search · ${res.papers.length} publications indexed from PubMed · Engine: ${res.engine || "Laya System-1"}`);
        finishScan();
        return;
      }
    } catch {
      // Backend not running on this domain/host, proceed to direct client-side live PubMed
    }

    // Step 2: Query Live PubMed directly via NCBI E-Utilities with Laya System-1 Inference
    try {
      const liveRes = await fetchLivePubMedEvidence(activeClaim, activeQuery, paperCount);
      if (Array.isArray(liveRes?.papers) && liveRes.papers.length > 0) {
        setDataset({
          claim: activeClaim,
          query: activeQuery,
          total: liveRes.totalMatches || liveRes.papers.length,
          papers: liveRes.papers,
          judgments: liveRes.judgments,
        });
        setSelectedPmid(liveRes.papers[0]?.pmid || "");
        setResultSource(`Live PubMed search: "${activeQuery}" · ${liveRes.papers.length} publications indexed · Laya System-1`);
        finishScan();
        return;
      } else {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        setScanProgress(0);
        setScanStepLabel("");
        setScanError(`No PubMed publications found matching "${activeQuery}". Try expanding or refining your claim terms.`);
        setIsScanning(false);
        return;
      }
    } catch (e: any) {
      console.warn("Live PubMed retrieval warning:", e);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setScanProgress(0);
      setScanStepLabel("");
      setScanError(`PubMed live search failed: ${e?.message || "Please check connection"}`);
      setIsScanning(false);
      return;
    }
  };

  // Run search on initial load if URL contains a custom claim
  useEffect(() => {
    if (urlClaim && urlClaim !== hrtDataRaw.claim) {
      void runEvidenceSearch(urlClaim, urlQ || buildPubMedQuery(urlClaim));
    }
  }, [urlClaim, urlQ]);

  const handleSelectExample = (ex: typeof PRESET_EXAMPLES[0]) => {
    if (isScanning) return;
    setSelectedExample(ex.id);
    setClaim(ex.claim);
    setQuery(ex.query);
    setUserEditedQuery(false);
    void runEvidenceSearch(ex.claim, ex.query);
  };

  const handleMapEvidence = (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isScanning || !claim.trim()) return;
    void runEvidenceSearch(claim.trim(), query.trim());
  };

  const handleClaimKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isScanning && claim.trim()) {
        void runEvidenceSearch(claim.trim(), query.trim());
      }
    }
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isScanning && claim.trim()) {
        void runEvidenceSearch(claim.trim(), query.trim());
      }
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="cs min-h-full bg-[#FAF9F3] dark:bg-[#14111A] text-[#141413] dark:text-[#FAF9F3] transition-colors duration-200">
      <div className="px-6 pt-3" role="status">{resultSource}</div>
      {scanError && <div role="alert" className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{scanError}</div>}
      {/* Main Container */}
      <main className="mx-auto grid w-full max-w-[1340px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        {/* Section 1: Hero & Search Form */}
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10">
          <div className="max-w-[760px] xl:pt-2">
            <p className="cs-eyebrow text-[#7C4B73] dark:text-[#88A0DC] font-bold mb-2">Evidence map for any research claim</p>
            <h1 className="text-[clamp(38px,5vw,60px)] font-serif font-bold leading-tight tracking-tight text-[#381A61] dark:text-[#F9D14A]">
              ClaimScape
            </h1>
            <p className="mt-3.5 text-[16.5px] text-[#4A453E] dark:text-[#C8C2BA] leading-relaxed text-wrap-pretty font-sans">
              Type a claim and see where the literature stands on it. Up to 300 of the most relevant PubMed abstracts are read, sorted by study design and plotted by year, so you can see which kinds of evidence agree and how consensus shifted over time.
            </p>

            <ul className="mt-5 grid gap-2.5 text-[13.5px] text-[#4A453E] dark:text-[#C8C2BA]">
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="6" fill="var(--cs-for)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                <span>Each dot is a paper, colored by what its abstract reports</span>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="7.5" fill="var(--cs-surface)" />
                  <path d="M0 -6 A 6 6 0 0 0 0 6 Z" fill="var(--cs-for)" />
                  <path d="M0 -6 A 6 6 0 0 1 0 6 Z" fill="var(--cs-against)" />
                </svg>
                <span>Rows are study designs, each with a verdict and a 95% Wilson interval</span>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="6" fill="var(--cs-against)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                <span>Every dot opens the sentence its verdict rests on</span>
              </li>
            </ul>
          </div>


          {/* Form Card */}
          <form onSubmit={handleMapEvidence} className="cs-card grid gap-4 p-5 sm:p-6 shadow-sm">
            <label className="grid gap-2">
              <span className="text-[13px] font-semibold cs-soft">Claim statement</span>
              <textarea
                value={claim}
                onChange={(e) => handleClaimChange(e.target.value)}
                onKeyDown={handleClaimKeyDown}
                className="cs-input resize-none px-4 py-3 text-[17px] leading-snug font-medium"
                rows={2}
                maxLength={300}
                placeholder="e.g. Metformin extends lifespan"
              />
              <span className="text-[12px] cs-muted">
                One plain statement works best, phrased positively: “X reduces Y in Z”. Press Enter to map.
              </span>
            </label>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
              <label className="grid gap-1.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold cs-soft">
                  PubMed search query
                  <span className="text-[11.5px] font-normal cs-muted">auto-built, edit to refine</span>
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setUserEditedQuery(true);
                  }}
                  onKeyDown={handleQueryKeyDown}
                  className="cs-input cs-mono px-3.5 py-2.5 text-[13px]"
                />
              </label>

              <div className="grid gap-1.5">
                <span className="text-[13px] font-semibold cs-soft">Papers to read</span>
                <div className="cs-seg" role="group">
                  {[100, 200, 300].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      aria-pressed={paperCount === cnt}
                      onClick={() => setPaperCount(cnt)}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isScanning}
                className="btn-palette-primary py-2.5 px-6 text-sm"
              >
                {isScanning ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Searching evidence...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#F9D14A]" />
                    <span>Map the evidence</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cs-line)] pt-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] cs-muted font-medium">Examples:</span>
                {PRESET_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => handleSelectExample(ex)}
                    className="cs-chip"
                    aria-pressed={selectedExample === ex.id}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <label className="cs-toggle">
                <input
                  type="checkbox"
                  checked={includeCommentary}
                  onChange={(e) => setIncludeCommentary(e.target.checked)}
                />
                <span className="text-[12.5px]">Include narrative reviews & commentary</span>
              </label>
            </div>
          </form>

          {/* Progress Bar under the Question Card */}
          {(isScanning || scanProgress > 0) && (
            <div className="overflow-hidden rounded-xl border border-[#381A61]/15 dark:border-white/15 bg-white dark:bg-[#1E1926] p-4 shadow-sm transition-all duration-300 animate-in fade-in">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold mb-2">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7C4B73] dark:bg-[#F9D14A] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#7C4B73] dark:bg-[#F9D14A]"></span>
                    </span>
                  ) : (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="text-[#381A61] dark:text-[#F9D14A]">
                    {scanStepLabel || "Analyzing evidence..."}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#6B665E] dark:text-[#968F84]">
                  {Math.round(scanProgress)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#381A61]/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7C4B73] via-[#88A0DC] to-[#F9D14A] transition-all duration-300 ease-out"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Dynamic Headline & Stat KPIs */}
        <section className="grid gap-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="grid max-w-[900px] gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="cs-eyebrow text-[#7C4B73] dark:text-[#F9D14A] font-bold">Synthesized Map Headline</p>
                {evalSpeed !== null && (
                  <span className="tag-palette-gold text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                    <span>⚡ Laya Fast Pipeline:</span>
                    <span>{evalSpeed < 10 ? `${evalSpeed.toFixed(1)}ms (Cached)` : `${(evalSpeed / 1000).toFixed(2)}s`}</span>
                  </span>
                )}
              </div>
              <h2 className="text-[clamp(24px,2.8vw,34px)] font-serif font-bold leading-tight tracking-tight text-[#381A61] dark:text-[#F9D14A]">
                {headlineData.text}
              </h2>
              {headlineData.detail && (
                <p className="text-[16px] cs-soft leading-relaxed">
                  {headlineData.detail} {headlineData.context}
                </p>
              )}
              <p className="text-[13.5px] cs-muted">
                Evaluated claim: “<strong className="text-[var(--cs-ink)]">{claim}</strong>”
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 rounded-xl border border-[#381A61]/15 dark:border-white/15 bg-white dark:bg-[#221D2C] px-3.5 py-2 text-xs font-semibold text-[#381A61] dark:text-[#F9D14A] hover:border-[#381A61] hover:bg-[#381A61]/5 transition-colors shadow-2xs"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedLink ? "Link copied" : "Copy link"}</span>
            </button>
          </div>

          {/* KPI Count Cards */}
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#381A61]/10 dark:border-white/10 bg-white dark:bg-[#221D2C] sm:grid-cols-5 shadow-2xs">
            <div className="grid gap-0.5 px-4 py-3.5">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] font-bold">PubMed matches</dt>
              <dd className="text-[26px] font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">{stats.totalMatches}</dd>
              <dd className="text-[11px] text-[#6B665E] dark:text-[#968F84]">before reading</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#381A61]/10 dark:border-white/10">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] font-bold">Read</dt>
              <dd className="text-[26px] font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">{stats.read}</dd>
              <dd className="text-[11px] text-[#6B665E] dark:text-[#968F84]">top {paperCount} by Best Match</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#381A61]/10 dark:border-white/10">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] font-bold">On topic</dt>
              <dd className="text-[26px] font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">{stats.onTopic}</dd>
              <dd className="text-[11px] text-[#6B665E] dark:text-[#968F84]">study the claim</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#381A61]/10 dark:border-white/10">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] font-bold">On the map</dt>
              <dd className="text-[26px] font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">{stats.onMap}</dd>
              <dd className="text-[11px] text-[#6B665E] dark:text-[#968F84]">sorted by study type</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#381A61]/10 dark:border-white/10">
              <dt className="text-[11.5px] uppercase tracking-wider text-[#6B665E] dark:text-[#968F84] font-bold">With a verdict</dt>
              <dd className="text-[26px] font-serif font-bold tracking-tight text-[#381A61] dark:text-[#F9D14A]">{stats.withVerdict}</dd>
              <dd className="text-[11px] text-[#6B665E] dark:text-[#968F84]">counted in Wilson CI</dd>
            </div>
          </dl>

          {/* Section 3: Interactive SVG Scatter Map */}
          <div ref={mapSectionRef} id="claimscape-map-section" className="cs-card overflow-hidden shadow-sm scroll-mt-6">
            {/* Map Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--cs-line)] px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="cs-toggle">
                  <input
                    type="checkbox"
                    checked={directOnly}
                    onChange={(e) => setDirectOnly(e.target.checked)}
                  />
                  <span>Direct evidence only</span>
                </label>

                <label className="cs-toggle">
                  <input
                    type="checkbox"
                    checked={showReviews}
                    onChange={(e) => setShowReviews(e.target.checked)}
                  />
                  <span>Show reviews & commentary</span>
                </label>
              </div>

              <p className="cs-mono text-[12px] cs-muted" aria-live="polite">
                {stats.onMap} papers mapped · click any dot to inspect
              </p>
            </div>

            {/* Interactive Bee-Swarm SVG Matrix */}
            <ClaimscapeMap
              summaries={summaries}
              selectedPmid={selectedPmid}
              onSelectPaper={(pmid) => setSelectedPmid(pmid)}
              showReviews={showReviews}
            />

            {/* Legend Bar */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-[var(--cs-line)] px-5 py-3 text-[12.5px] cs-soft bg-[var(--cs-panel)]">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="5.5" fill="var(--cs-for)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                For the claim
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="7" fill="var(--cs-surface)" />
                  <path d="M0 -5.5 A 5.5 5.5 0 0 0 0 5.5 Z" fill="var(--cs-for)" />
                  <path d="M0 -5.5 A 5.5 5.5 0 0 1 0 5.5 Z" fill="var(--cs-against)" />
                </svg>
                Mixed results
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="5.5" fill="var(--cs-against)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                Against the claim
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="5.5" fill="var(--cs-neutral)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                Unclear
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="3.2" fill="var(--cs-neutral)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                No direct result
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                  <circle r="4.5" fill="var(--cs-surface)" stroke="var(--cs-for)" strokeWidth="2" />
                </svg>
                Hollow: indirect proxy / model
              </span>
            </div>
          </div>
        </section>

        {/* Section 4: Paper Inspector & Guide */}
        <section className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Left Inspector */}
          <PaperInspector paper={activePaper} />

          {/* Right Guide & Workspace Actions */}
          <div className="grid content-start gap-5">
            <div className="cs-card grid content-start gap-3 p-5 sm:p-6 text-[13.5px] cs-soft shadow-2xs border border-[#381A61]/10 dark:border-white/10">
              <h2 className="text-[17px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                Reading the map
              </h2>
              <ul className="grid list-disc gap-2 pl-5 text-[13px] leading-relaxed">
                <li>
                  <strong>Hierarchy:</strong> Rows represent study designs, ordered by strength of causal inference (Systematic Reviews & Meta-Analyses down to Narrative Reviews).
                </li>
                <li>
                  <strong>Dot Placement:</strong> Each dot corresponds to one published paper, placed at its exact calendar publication date on the horizontal axis.
                </li>
                <li>
                  <strong>Color & Saturation:</strong> Indigo-blue denotes support for the claim, crimson denotes refutation, and split circles indicate mixed findings. Darker saturation denotes higher model confidence.
                </li>
                <li>
                  <strong>Wilson Interval:</strong> The right column displays the proportion of supporting evidence and its 95% Wilson score interval (minimum 3 papers required for a verdict).
                </li>
              </ul>
            </div>

            {/* Quick Workspace Integration Card */}
            <div className="cs-card p-5 sm:p-6 grid gap-3 bg-[#F2F1EB] dark:bg-[#1A1622] border border-[#381A61]/10 dark:border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#381A61] dark:text-[#F9D14A]" />
                <h3 className="font-serif font-bold text-[16px] text-[#381A61] dark:text-[#F9D14A]">
                  Take these studies into Systematic Review
                </h3>
              </div>
              <p className="text-[12.5px] text-[#4A453E] dark:text-[#C8C2BA] leading-relaxed">
                Import these {stats.onMap} mapped PubMed papers directly into your project's PICO screening queue, full-text PDF viewer, and Risk of Bias appraisal matrix.
              </p>
              <div className="pt-1 flex flex-wrap gap-2">
                <Link
                  to="/projects"
                  className="btn-palette-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                >
                  <span>Launch in Review Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#F9D14A]" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Filterable Evidence Table */}
        <section className="cs-card overflow-hidden shadow-sm border border-[#381A61]/10 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#381A61]/10 dark:border-white/10 p-4 sm:p-5 bg-white dark:bg-[#221D2C]">
            <div>
              <h3 className="text-[17px] font-serif font-bold text-[#381A61] dark:text-[#F9D14A]">
                Literature Inventory ({filteredTablePapers.length} papers)
              </h3>
              <p className="text-[12px] text-[#6B665E] dark:text-[#968F84] mt-0.5">
                Click any citation row to highlight on the swarm and inspect sentence-level findings.
              </p>
            </div>

            <div className="w-full sm:w-72">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6B665E] dark:text-[#968F84]" />
                <input
                  type="text"
                  placeholder="Filter by title, journal, or PMID..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="cs-input pl-9 pr-3 py-1.5 text-xs focus:border-[#381A61]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="cs-table">
              <thead>
                <tr>
                  <th className="w-16">Year</th>
                  <th>Title & Publication</th>
                  <th className="w-48">Study Design</th>
                  <th className="w-36">Verdict</th>
                  <th className="w-28">Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredTablePapers.map((p) => {
                  const isSel = selectedPmid === p.paper.pmid;
                  const year = p.paper.date ? Math.floor(p.paper.date) : "—";
                  const tier = p.tier ? TIER_BY_ID[p.tier] : null;

                  return (
                    <tr
                      key={p.paper.pmid}
                      data-sel={isSel}
                      onClick={() => setSelectedPmid(p.paper.pmid)}
                    >
                      <td className="cs-mono font-medium text-[12px]">{year}</td>
                      <td>
                        <p className="font-semibold text-[13px] text-[var(--cs-ink)] line-clamp-1">
                          {p.paper.title}
                        </p>
                        <p className="text-[11.5px] cs-muted mt-0.5">
                          {p.paper.journal || "PubMed"} · PMID {p.paper.pmid}
                        </p>
                      </td>
                      <td>
                        <span className="text-[12.5px] font-medium text-[var(--cs-ink)]">
                          {tier?.label || "Unclassified"}
                        </span>
                      </td>
                      <td>
                        <span
                          className="cs-pill text-[12px] font-semibold"
                          style={{
                            color:
                              p.category === "supports"
                                ? "var(--cs-for)"
                                : p.category === "contradicts"
                                ? "var(--cs-against)"
                                : "var(--cs-neutral)"
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{
                              background:
                                p.category === "supports"
                                  ? "var(--cs-for)"
                                  : p.category === "contradicts"
                                  ? "var(--cs-against)"
                                  : "var(--cs-neutral)"
                            }}
                          />
                          {STANCE_LABEL[p.category] || "Unclear"}
                        </span>
                      </td>
                      <td>
                        <span className="text-[11.5px] cs-muted">
                          {p.direct ? "Direct" : "Indirect"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 6: Methodology Section & Provenance Credit */}
        <MethodologySection />
      </main>
    </div>
  );
};
