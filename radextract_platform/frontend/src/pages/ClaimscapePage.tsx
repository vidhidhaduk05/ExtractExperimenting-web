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

  const isCustomClaim = !!(urlClaim && urlClaim !== hrtDataRaw.claim);
  const initialClaim = urlClaim || hrtDataRaw.claim;
  const initialQuery = urlQ || (urlClaim ? urlClaim.split("+").join(" ") : hrtDataRaw.query);
  const initialCount = urlN ? parseInt(urlN, 10) || 200 : 200;

  // Active dataset state: start empty if custom claim URL so HRT data does not flash
  const [dataset, setDataset] = useState<{
    claim: string;
    query: string;
    total: number;
    papers: Paper[];
    judgments: Judgment[];
  }>({
    claim: initialClaim,
    query: initialQuery,
    total: isCustomClaim ? 0 : (hrtDataRaw.total || 594),
    papers: isCustomClaim ? [] : (hrtDataRaw.papers as Paper[]),
    judgments: isCustomClaim ? [] : ((hrtDataRaw as any).judgments || []),
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

  // Form & filter states
  const [claim, setClaim] = useState<string>(initialClaim);
  const [query, setQuery] = useState<string>(initialQuery);
  const [paperCount, setPaperCount] = useState<number>(initialCount);
  const [studyType, setStudyType] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [includeCommentary, setIncludeCommentary] = useState<boolean>(false);
  const [directOnly, setDirectOnly] = useState<boolean>(false);
  const [showReviews, setShowReviews] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(isCustomClaim);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [scanError, setScanError] = useState("");
  const [resultSource, setResultSource] = useState(
    isCustomClaim
      ? "Synthesizing evidence across biomedical literature…"
      : "Evidence synthesis active · 300 publications analyzed across study designs"
  );
  const [evalSpeed, setEvalSpeed] = useState<number | null>(null);

  // Typewriter suggestions when input is empty
  const suggestions = [
    "Hormone replacement therapy reduces the risk of Alzheimer's disease",
    "Metformin extends lifespan in model organisms",
    "Statins reduce all-cause mortality in primary prevention",
    "What are the cardiovascular outcomes of GLP-1 receptor agonists?",
    "How does sleep deprivation affect memory consolidation?",
    "What are the clinical outcomes of therapeutic cancer vaccines?",
    "Daily aspirin reduces the incidence of colorectal cancer"
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState("What does the evidence say about…");

  useEffect(() => {
    if (claim.length > 0) return;
    const timeout = setTimeout(() => {
      const targetText = suggestions[placeholderIndex];
      if (!isDeleting) {
        if (subIndex < targetText.length) {
          setCurrentPlaceholder(targetText.substring(0, subIndex + 1));
          setSubIndex(subIndex + 1);
        } else {
          setTimeout(() => setIsDeleting(true), 2400);
        }
      } else {
        if (subIndex > 0) {
          setCurrentPlaceholder(targetText.substring(0, subIndex - 1));
          setSubIndex(subIndex - 1);
        } else {
          setIsDeleting(false);
          setPlaceholderIndex((prev) => (prev + 1) % suggestions.length);
        }
      }
    }, isDeleting ? 25 : 50);
    return () => clearTimeout(timeout);
  }, [subIndex, isDeleting, placeholderIndex, claim]);

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
      totalMatches: dataset.total ?? 0,
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
    }, 200);
  };

  const runEvidenceSearch = async (nextClaim: string, nextQuery: string, nextCount?: number) => {
    const activeClaim = nextClaim.trim();
    let activeQuery = nextQuery.trim() || buildPubMedQuery(activeClaim);
    if (!activeClaim) return;
    const targetCount = nextCount ?? paperCount;
    if (nextCount && nextCount !== paperCount) {
      setPaperCount(nextCount);
    }

    // Apply studyType and period to query if user toggled them
    if (studyType && !activeQuery.includes(studyType)) {
      activeQuery = `(${activeQuery}) AND "${studyType}"[Publication Type]`;
    }
    if (period && !activeQuery.includes("Publication Date")) {
      activeQuery = `(${activeQuery}) AND "last ${period === "1" ? "year" : period + " years"}"[Publication Date]`;
    }

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
          setScanStepLabel("Reading abstracts & analyzing semantic stances...");
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
      newUrl.searchParams.set("n", targetCount.toString());
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
      const res = await api.evaluateClaimscape(activeClaim, activeQuery, targetCount);
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
        setResultSource(`Live PubMed search · ${res.papers.length} publications indexed · Engine: ${res.engine || "ClaimScape Engine"}`);
        finishScan();
        return;
      }
    } catch {
      // Backend not running on this domain/host, proceed to direct client-side live PubMed
    }

    // Step 2: Query Live PubMed directly via NCBI E-Utilities with Laya System-1 Inference
    try {
      const liveRes = await fetchLivePubMedEvidence(activeClaim, activeQuery, targetCount);
      if (Array.isArray(liveRes?.papers) && liveRes.papers.length > 0) {
        setDataset({
          claim: activeClaim,
          query: activeQuery,
          total: liveRes.totalMatches || liveRes.papers.length,
          papers: liveRes.papers,
          judgments: liveRes.judgments,
        });
        setSelectedPmid(liveRes.papers[0]?.pmid || "");
        setResultSource(`Live PubMed search: "${activeQuery}" · ${liveRes.papers.length} publications indexed · ClaimScape Engine`);
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
  const initialSearchRanRef = useRef(false);
  useEffect(() => {
    if (urlClaim && urlClaim !== hrtDataRaw.claim && !initialSearchRanRef.current) {
      initialSearchRanRef.current = true;
      void runEvidenceSearch(urlClaim, urlQ || buildPubMedQuery(urlClaim), initialCount);
    }
  }, [urlClaim, urlQ, urlN]);

  const handleSelectExample = (ex: typeof PRESET_EXAMPLES[0]) => {
    if (isScanning) return;
    setSelectedExample(ex.id);
    setClaim(ex.claim);
    setQuery(ex.query);
    setUserEditedQuery(false);
    void runEvidenceSearch(ex.claim, ex.query);
  };

  const handleTopicClick = (topicClaim: string) => {
    if (isScanning) return;
    setClaim(topicClaim);
    const builtQ = buildPubMedQuery(topicClaim);
    setQuery(builtQ);
    setUserEditedQuery(false);
    void runEvidenceSearch(topicClaim, builtQ);
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
    <div className="cs min-h-screen bg-[#fbf9f4] text-[#1b1c19] selection:bg-[#66365c]/15 transition-colors duration-200 font-['Newsreader']">
      <div className="px-6 pt-3 text-xs font-['Work_Sans'] text-[#72636d]" role="status">{resultSource}</div>
      {scanError && (
        <div role="alert" className="mx-6 mt-3 border border-red-300 bg-red-50 p-3 text-sm text-red-900 font-['Work_Sans']">
          {scanError}
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto grid w-full max-w-[1340px] grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-12 pt-2 sm:px-6 lg:px-8">
        
        {/* Section 1: Hero & Question Card - Compact 2-Column Editorial Velvet Layout */}
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10 pt-1 pb-2">
          {/* Left Column: Headline, Restored Description & Legend Bullets */}
          <div className="max-w-[580px] xl:pt-1">
            <p className="text-[11px] font-['Work_Sans'] font-bold uppercase tracking-[0.12em] text-[#7c5800] mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800]"></span>
              Evidence map for any research claim
            </p>
            <h1 className="font-['Bodoni_Moda'] text-[clamp(30px,3.5vw,44px)] font-normal leading-[1.08] text-[#3a0f34] tracking-tight">
              Stay curious.<br />
              <span className="italic font-normal text-[#814d75]">See what the evidence says.</span>
            </h1>

            {/* Restored Description Paragraph */}
            <p className="mt-3 text-[15px] sm:text-[15.5px] text-[#4f444b] font-['Newsreader'] leading-[1.58]">
              Type a claim and see where the literature stands on it. Up to 300 of the most relevant PubMed abstracts are read, sorted by study design and plotted by year, so you can see which kinds of evidence agree and how consensus shifted over time.
            </p>

            {/* Restored 3 Bullets with Legend Markers */}
            <ul className="mt-4 grid gap-2.5 text-[13px] text-[#4f444b] font-['Work_Sans']">
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

            {/* Compact Technical Pillars Strip */}
            <div className="mt-5 pt-3 border-t border-[#e4e2dd] flex flex-wrap items-center gap-3 text-[11px] font-['Work_Sans'] text-[#72636d]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#3a0f34]"></span>
                PubMed Live Retrieval
              </span>
              <span className="w-px h-3 bg-[#d2c2cb]"></span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#814d75]"></span>
                Laya Fast Screening
              </span>
              <span className="w-px h-3 bg-[#d2c2cb]"></span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800]"></span>
                Wilson 95% Confidence
              </span>
            </div>
          </div>

          {/* Right Column: Search Card & Progress */}
          <div className="w-full">
            <form
              onSubmit={handleMapEvidence}
              className="bg-white border border-[#d2c2cb] p-5 sm:p-6 shadow-xs grid gap-3.5 transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]"
            >
              {/* Claim statement label and helper */}
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-[11px] font-['Work_Sans'] font-semibold text-[#62535d] uppercase tracking-wider">
                  <label htmlFor="claim-textarea" className="text-[#3a0f34] cursor-pointer">
                    Claim statement
                  </label>
                  <span className="hidden sm:inline normal-case tracking-normal text-[#81737b] font-normal">
                    Enter to explore · Shift + Enter for a new line
                  </span>
                </div>

                <textarea
                  id="claim-textarea"
                  value={claim}
                  onChange={(e) => handleClaimChange(e.target.value)}
                  onKeyDown={handleClaimKeyDown}
                  className="w-full resize-none border border-[#d2c2cb] bg-[#fbf9f4] px-3.5 py-2.5 text-[#3a0f34] font-['Newsreader'] text-[16.5px] sm:text-[18px] font-medium leading-[1.35] focus:outline-none focus:border-[#3a0f34] placeholder:text-[#72636d]/65"
                  rows={2}
                  maxLength={300}
                  placeholder={currentPlaceholder}
                />
                <span className="text-[11.5px] text-[#72636d] font-['Work_Sans']">
                  One plain statement works best, phrased positively: “X reduces Y in Z”. Press Enter to map.
                </span>
              </div>

              {/* Toolbar: PubMed query, papers pills, map button */}
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="grid gap-1">
                  <span className="flex items-center justify-between text-[11px] font-semibold text-[#62535d] font-['Work_Sans']">
                    <span className="flex items-center gap-1.5">
                      <span>PubMed search query</span>
                      <span className="text-[10.5px] font-normal text-[#81737b]">auto-built, edit to refine</span>
                    </span>
                    {userEditedQuery && (
                      <span className="text-[10px] text-amber-700 font-medium">Custom query</span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setUserEditedQuery(true);
                    }}
                    onKeyDown={handleQueryKeyDown}
                    placeholder="e.g. hormone replacement therapy coronary heart disease"
                    className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] px-3 py-1.5 text-[12px] font-mono font-medium focus:outline-none focus:border-[#3a0f34] h-[36px]"
                  />
                </label>

                {/* Papers count pills */}
                <div className="grid gap-1">
                  <span className="text-[11px] font-semibold text-[#62535d] font-['Work_Sans']">
                    Papers to read
                  </span>
                  <div className="flex items-center border border-[#d2c2cb] bg-[#fbf9f4] overflow-hidden h-[36px]">
                    {[100, 200, 300].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        aria-pressed={paperCount === cnt}
                        onClick={() => setPaperCount(cnt)}
                        className={`px-3 py-1 text-[12px] font-['Work_Sans'] transition-colors h-full ${
                          paperCount === cnt
                            ? "bg-[#3a0f34] text-[#fbf9f4] font-bold"
                            : "text-[#4f444b] hover:bg-[#f0eee9]"
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isScanning}
                  className="font-['Work_Sans'] font-semibold text-[13px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] px-4 py-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 h-[36px] whitespace-nowrap"
                >
                  {isScanning ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                      <span>Mapping...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-[#ffdea6]" />
                      <span>Map the evidence</span>
                    </>
                  )}
                </button>
              </div>

              {/* Example Chips & Toggle Row */}
              <div className="mt-1 pt-3 border-t border-[#e4e2dd] flex flex-wrap items-center justify-between gap-2.5 text-[11.5px] font-['Work_Sans']">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[#72636d]">Examples:</span>
                  {[
                    { label: "HRT and heart disease", claim: "Hormone replacement therapy reduces the risk of coronary heart disease in postmenopausal women" },
                    { label: "Anesthesia and cancer recurrence", claim: "Regional anesthesia improves recurrence-free survival compared to general anesthesia in cancer surgery" },
                    { label: "Vitamin D and fractures", claim: "Vitamin D supplementation reduces fracture risk in older adults" },
                    { label: "Metformin and lifespan", claim: "Metformin extends lifespan in model organisms" },
                  ].map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => handleTopicClick(ex.claim)}
                      className="px-2.5 py-1 bg-[#f0eee9] hover:bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] transition-colors cursor-pointer text-[11px]"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer text-[#4f444b] text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={includeCommentary}
                    onChange={(e) => setIncludeCommentary(e.target.checked)}
                    className="rounded-none border-[#d2c2cb] text-[#3a0f34] focus:ring-0"
                  />
                  <span>Include narrative reviews & commentary</span>
                </label>
              </div>
            </form>

            {/* Progress Bar under the Question Card */}
            {(isScanning || scanProgress > 0) && (
              <div className="w-full mt-3 border border-[#d2c2cb] bg-white p-3 shadow-xs transition-all duration-300 animate-in fade-in text-left">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold mb-1.5 font-['Work_Sans']">
                  <div className="flex items-center gap-2">
                    {isScanning ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[#814d75] opacity-75"></span>
                        <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-[#814d75]"></span>
                      </span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    )}
                    <span className="text-[#3a0f34] font-medium text-[12px]">
                      {scanStepLabel || "Analyzing evidence..."}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#72636d]">
                    {Math.round(scanProgress)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden bg-[#e4e2dd]">
                  <div
                    className="h-full bg-gradient-to-r from-[#3a0f34] via-[#814d75] to-[#7c5800] transition-all duration-300 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Dynamic Headline & Stat KPIs */}
        <section className="grid gap-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="grid max-w-[900px] gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="cs-eyebrow text-[#7c5800] font-bold">Synthesized Map Headline</p>
                {evalSpeed !== null && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-[#ffdea6] text-[#7c5800] border border-[#7c5800]/30 inline-flex items-center gap-1 shadow-2xs">
                    <span>⚡ Laya Fast Pipeline:</span>
                    <span>{evalSpeed < 10 ? `${evalSpeed.toFixed(1)}ms (Cached)` : `${(evalSpeed / 1000).toFixed(2)}s`}</span>
                  </span>
                )}
              </div>
              <h2 className="text-[clamp(24px,2.8vw,34px)] font-['Bodoni_Moda'] font-normal leading-tight tracking-tight text-[#3a0f34]">
                {headlineData.text}
              </h2>
              {headlineData.detail && (
                <p className="text-[16px] text-[#4f444b] leading-relaxed">
                  {headlineData.detail} {headlineData.context}
                </p>
              )}
              <p className="text-[13.5px] text-[#72636d]">
                Evaluated claim: “<strong className="text-[#3a0f34]">{claim}</strong>”
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 border border-[#d2c2cb] bg-white px-3.5 py-2 text-xs font-semibold font-['Work_Sans'] text-[#3a0f34] hover:bg-[#ffdea6] transition-colors shadow-2xs cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedLink ? "Link copied" : "Copy link"}</span>
            </button>
          </div>

          {/* KPI Count Cards */}
          <dl className="grid grid-cols-2 overflow-hidden border border-[#d2c2cb] bg-white sm:grid-cols-5 shadow-2xs">
            <div className="grid gap-0.5 px-4 py-3.5">
              <dt className="text-[11px] uppercase tracking-wider text-[#72636d] font-bold font-['Work_Sans']">PubMed matches</dt>
              <dd className="text-[26px] font-['Bodoni_Moda'] font-normal tracking-tight text-[#3a0f34]">{stats.totalMatches}</dd>
              <dd className="text-[11px] text-[#72636d] font-['Work_Sans']">before reading</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#d2c2cb]">
              <dt className="text-[11px] uppercase tracking-wider text-[#72636d] font-bold font-['Work_Sans']">Read</dt>
              <dd className="text-[26px] font-['Bodoni_Moda'] font-normal tracking-tight text-[#3a0f34]">{stats.read}</dd>
              <dd className="text-[11px] text-[#72636d] font-['Work_Sans']">top {paperCount} by Best Match</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#d2c2cb]">
              <dt className="text-[11px] uppercase tracking-wider text-[#72636d] font-bold font-['Work_Sans']">On topic</dt>
              <dd className="text-[26px] font-['Bodoni_Moda'] font-normal tracking-tight text-[#3a0f34]">{stats.onTopic}</dd>
              <dd className="text-[11px] text-[#72636d] font-['Work_Sans']">study the claim</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#d2c2cb]">
              <dt className="text-[11px] uppercase tracking-wider text-[#72636d] font-bold font-['Work_Sans']">On the map</dt>
              <dd className="text-[26px] font-['Bodoni_Moda'] font-normal tracking-tight text-[#3a0f34]">{stats.onMap}</dd>
              <dd className="text-[11px] text-[#72636d] font-['Work_Sans']">sorted by study type</dd>
            </div>
            <div className="grid gap-0.5 px-4 py-3.5 border-l border-[#d2c2cb]">
              <dt className="text-[11px] uppercase tracking-wider text-[#72636d] font-bold font-['Work_Sans']">With a verdict</dt>
              <dd className="text-[26px] font-['Bodoni_Moda'] font-normal tracking-tight text-[#3a0f34]">{stats.withVerdict}</dd>
              <dd className="text-[11px] text-[#72636d] font-['Work_Sans']">counted in Wilson CI</dd>
            </div>
          </dl>

          {/* Section 3: Interactive SVG Scatter Map */}
          <div ref={mapSectionRef} id="claimscape-map-section" className="cs-card overflow-hidden shadow-sm scroll-mt-6 border border-[#d2c2cb]">
            {/* Map Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[#d2c2cb] px-5 py-3 bg-[#f0eee9]">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-['Work_Sans'] text-xs">
                <label className="cs-toggle flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={directOnly}
                    onChange={(e) => setDirectOnly(e.target.checked)}
                    className="rounded-none border-[#d2c2cb] text-[#3a0f34]"
                  />
                  <span className="font-medium text-[#3a0f34]">Direct evidence only</span>
                </label>

                <label className="cs-toggle flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showReviews}
                    onChange={(e) => setShowReviews(e.target.checked)}
                    className="rounded-none border-[#d2c2cb] text-[#3a0f34]"
                  />
                  <span className="font-medium text-[#3a0f34]">Show reviews & commentary</span>
                </label>
              </div>

              <p className="cs-mono text-[12px] text-[#72636d]" aria-live="polite">
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
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-[#d2c2cb] px-5 py-3 text-[12.5px] font-['Work_Sans'] text-[#4f444b] bg-[#fbf9f4]">
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
            <div className="cs-card grid content-start gap-3 p-5 sm:p-6 text-[13.5px] border border-[#d2c2cb] bg-white">
              <h2 className="text-[18px] font-['Bodoni_Moda'] font-medium text-[#3a0f34]">
                Reading the map
              </h2>
              <ul className="grid list-disc gap-2 pl-5 text-[13px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
                <li>
                  <strong>Hierarchy:</strong> Rows represent study designs, ordered by strength of causal inference (Systematic Reviews & Meta-Analyses down to Narrative Reviews).
                </li>
                <li>
                  <strong>Dot Placement:</strong> Each dot corresponds to one published paper, placed at its exact calendar publication date on the horizontal axis.
                </li>
                <li>
                  <strong>Color & Saturation:</strong> Indigo-blue denotes support for the claim, crimson denotes refutation, and split circles indicate mixed findings.
                </li>
                <li>
                  <strong>Wilson Interval:</strong> The right column displays the proportion of supporting evidence and its 95% Wilson score interval (minimum 3 papers required for a verdict).
                </li>
              </ul>
            </div>

            {/* Quick Workspace Integration Card */}
            <div className="cs-card p-5 sm:p-6 grid gap-3 bg-[#f0eee9] border border-[#d2c2cb]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3a0f34]" />
                <h3 className="font-['Bodoni_Moda'] font-medium text-[16px] text-[#3a0f34]">
                  Take these studies into Systematic Review
                </h3>
              </div>
              <p className="text-[13px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
                Import these {stats.onMap} mapped PubMed papers directly into your project's PICO screening queue, full-text PDF viewer, and Risk of Bias appraisal matrix.
              </p>
              <div className="pt-1 flex flex-wrap gap-2">
                <Link
                  to="/projects"
                  className="font-['Work_Sans'] font-semibold text-xs py-2 px-4 bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Launch in Review Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#ffdea6]" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Filterable Evidence Table */}
        <section className="cs-card overflow-hidden shadow-sm border border-[#d2c2cb]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d2c2cb] p-4 sm:p-5 bg-white">
            <div>
              <h3 className="text-[18px] font-['Bodoni_Moda'] font-medium text-[#3a0f34]">
                Literature Inventory ({filteredTablePapers.length} papers)
              </h3>
              <p className="text-[12px] font-['Work_Sans'] text-[#72636d] mt-0.5">
                Click any citation row to highlight on the swarm and inspect sentence-level findings.
              </p>
            </div>

            <div className="w-full sm:w-72">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#72636d]" />
                <input
                  type="text"
                  placeholder="Filter by title, journal, or PMID..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="border border-[#d2c2cb] bg-[#fbf9f4] pl-9 pr-3 py-1.5 text-xs font-['Work_Sans'] text-[#3a0f34] focus:outline-none focus:border-[#3a0f34] w-full"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="cs-table w-full text-left font-['Work_Sans']">
              <thead className="bg-[#f0eee9] border-b border-[#d2c2cb] text-[11px] uppercase tracking-wider text-[#72636d]">
                <tr>
                  <th className="p-3 w-16">Year</th>
                  <th className="p-3">Title & Publication</th>
                  <th className="p-3 w-48">Study Design</th>
                  <th className="p-3 w-36">Verdict</th>
                  <th className="p-3 w-28">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d2c2cb]">
                {filteredTablePapers.map((p) => {
                  const isSel = selectedPmid === p.paper.pmid;
                  const year = p.paper.date ? Math.floor(p.paper.date) : "—";
                  const tier = p.tier ? TIER_BY_ID[p.tier] : null;

                  return (
                    <tr
                      key={p.paper.pmid}
                      data-sel={isSel}
                      onClick={() => setSelectedPmid(p.paper.pmid)}
                      className={`cursor-pointer transition-colors ${
                        isSel ? "bg-[#ffdea6]/35" : "hover:bg-[#f5f3ee]"
                      }`}
                    >
                      <td className="p-3 font-mono font-medium text-[12px] text-[#3a0f34]">{year}</td>
                      <td className="p-3">
                        <p className="font-semibold text-[13px] text-[#1b1c19] line-clamp-1 font-['Newsreader']">
                          {p.paper.title}
                        </p>
                        <p className="text-[11.5px] text-[#72636d] mt-0.5">
                          {p.paper.journal || "PubMed"} · PMID {p.paper.pmid}
                        </p>
                      </td>
                      <td className="p-3">
                        <span className="text-[12.5px] font-medium text-[#4f444b]">
                          {tier?.label || "Unclassified"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className="text-[12px] font-semibold inline-flex items-center gap-1.5"
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
                            className="w-2 h-2 rounded-none inline-block"
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
                      <td className="p-3">
                        <span className="text-[11.5px] text-[#72636d]">
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
