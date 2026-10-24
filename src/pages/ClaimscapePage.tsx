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
  const [selectedExample, setSelectedExample] = useState<string>("hrt");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [scanError, setScanError] = useState("");
  const [resultSource, setResultSource] = useState("Evidence synthesis active · 300 publications analyzed across study designs");
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
    }, 200);
  };

  const runEvidenceSearch = async (nextClaim: string, nextQuery: string) => {
    const activeClaim = nextClaim.trim();
    let activeQuery = nextQuery.trim() || buildPubMedQuery(activeClaim);
    if (!activeClaim) return;

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
      <main className="mx-auto grid w-full max-w-[1340px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        
        {/* Section 1: Hero & Question Card Harmonized with Editorial Velvet */}
        <section className="flex flex-col items-center text-center pt-2 pb-6 max-w-[960px] mx-auto w-full">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-[#ffdea6]/60 border border-[#7c5800]/20 text-[#7c5800] text-[11px] font-['Work_Sans'] font-semibold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800] animate-pulse"></span>
            From Evidence to the Bedside · ClaimScape Evidence Map
          </div>

          {/* Headline */}
          <h1 className="font-['Bodoni_Moda'] text-[clamp(38px,5.2vw,64px)] font-normal leading-[1.08] text-[#3a0f34] tracking-[-0.02em]">
            Stay curious.<br />
            <span className="italic font-normal text-[#814d75]">See what the evidence says.</span>
          </h1>

          {/* Subhead */}
          <p className="mt-3.5 text-[17px] sm:text-[19px] text-[#4f444b] font-['Newsreader'] italic leading-relaxed max-w-[68ch]">
            Research begins with a patient, a careful observation, and a question worth asking. Type a claim to see where the biomedical literature stands across study designs and calendar time.
          </p>

          {/* Merged .rq-card Question Box */}
          <div className="w-full mt-7 text-left bg-white border border-[#d2c2cb] p-6 sm:p-7 shadow-sm transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]">
            <form onSubmit={handleMapEvidence}>
              {/* Card Heading */}
              <div className="flex items-center justify-between text-[11px] font-['Work_Sans'] font-medium text-[#62535d] tracking-wider uppercase mb-2">
                <label htmlFor="claim-textarea" className="font-semibold text-[#3a0f34]">
                  Your research question / Claim
                </label>
                <span className="hidden sm:inline normal-case tracking-normal text-[#81737b]">
                  Enter to explore · Shift + Enter for a new line
                </span>
              </div>

              {/* Large Question Input */}
              <textarea
                id="claim-textarea"
                rows={2}
                value={claim}
                onChange={(e) => handleClaimChange(e.target.value)}
                onKeyDown={handleClaimKeyDown}
                placeholder={currentPlaceholder}
                className="w-full resize-none border-0 bg-transparent py-2.5 text-[#3a0f34] font-['Newsreader'] text-[clamp(21px,2.6vw,28px)] font-medium leading-[1.35] focus:outline-none placeholder:text-[#72636d]/65"
              />

              {/* Toolbar */}
              <div className="mt-3 pt-3.5 border-t border-[#e4e2dd] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-['Work_Sans'] text-[12px] text-[#3a0f34] bg-[#fbf9f4] border border-[#d2c2cb] px-3 py-1.5 flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-none bg-emerald-600 inline-block"></span>
                    PubMed
                  </span>

                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className="font-['Work_Sans'] text-[12px] text-[#3a0f34] bg-[#fbf9f4] border border-[#d2c2cb] hover:bg-[#ffdea6] px-3 py-1.5 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#814d75]" />
                    <span>Filters</span>
                    <span className="font-bold text-xs">{showFilters ? "−" : "+"}</span>
                  </button>

                  <div className="flex items-center border border-[#d2c2cb] bg-[#fbf9f4] overflow-hidden">
                    <span className="px-2 text-[11px] font-['Work_Sans'] text-[#72636d] uppercase tracking-wider font-semibold">
                      Papers:
                    </span>
                    {[100, 200, 300].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        aria-pressed={paperCount === cnt}
                        onClick={() => setPaperCount(cnt)}
                        className={`px-2.5 py-1 text-[12px] font-['Work_Sans'] transition-colors ${
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
                  className="font-['Work_Sans'] font-semibold text-[13.5px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] px-6 py-2.5 transition-all cursor-pointer flex items-center gap-2 shadow-xs group disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                      <span>Synthesizing evidence...</span>
                    </>
                  ) : (
                    <>
                      <span>Map the evidence</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </div>

              {/* Expandable Filters & PubMed Search String Drawer */}
              {showFilters && (
                <div className="mt-4 pt-4 border-t border-[#e4e2dd] grid gap-4 animate-in fade-in">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-[11px] font-['Work_Sans'] uppercase tracking-wider text-[#62535d]">
                      Study Type
                      <select
                        value={studyType}
                        onChange={(e) => setStudyType(e.target.value)}
                        className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] p-2 text-[13px] font-normal"
                      >
                        <option value="">All study types</option>
                        <option value="systematic review">Systematic reviews</option>
                        <option value="randomized controlled trial">Randomized trials</option>
                        <option value="case reports">Case reports</option>
                      </select>
                    </label>

                    <label className="grid gap-1 text-[11px] font-['Work_Sans'] uppercase tracking-wider text-[#62535d]">
                      Publication Date
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] p-2 text-[13px] font-normal"
                      >
                        <option value="">Any time</option>
                        <option value="1">Past 1 year</option>
                        <option value="2">Past 2 years</option>
                        <option value="5">Past 5 years</option>
                        <option value="10">Past 10 years</option>
                      </select>
                    </label>
                  </div>

                  {/* Live Editable PubMed Query */}
                  <label className="grid gap-1 text-[11px] font-['Work_Sans'] uppercase tracking-wider text-[#62535d]">
                    <span className="flex items-center justify-between">
                      <span>PubMed Search String (auto-built from claim, edit to refine)</span>
                      {userEditedQuery && <span className="normal-case text-amber-700 font-medium">Custom query active</span>}
                    </span>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setUserEditedQuery(true);
                      }}
                      onKeyDown={handleQueryKeyDown}
                      placeholder="e.g. (hormone replacement therapy OR estrogen) AND Alzheimer's"
                      className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] px-3 py-2 text-[13px] font-mono font-medium focus:outline-none focus:border-[#3a0f34]"
                    />
                  </label>

                  <div className="flex items-center gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-['Work_Sans'] text-[12px] text-[#4f444b]">
                      <input
                        type="checkbox"
                        checked={includeCommentary}
                        onChange={(e) => setIncludeCommentary(e.target.checked)}
                        className="rounded-none border-[#d2c2cb] text-[#3a0f34] focus:ring-0"
                      />
                      <span>Include narrative reviews & commentary</span>
                    </label>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Progress Bar under the Question Card */}
          {(isScanning || scanProgress > 0) && (
            <div className="w-full mt-4 border border-[#d2c2cb] bg-white p-4 shadow-sm transition-all duration-300 animate-in fade-in text-left">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold mb-2 font-['Work_Sans']">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[#814d75] opacity-75"></span>
                      <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-[#814d75]"></span>
                    </span>
                  ) : (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  )}
                  <span className="text-[#3a0f34] font-medium">
                    {scanStepLabel || "Analyzing evidence..."}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#72636d]">
                  {Math.round(scanProgress)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden bg-[#e4e2dd]">
                <div
                  className="h-full bg-gradient-to-r from-[#3a0f34] via-[#814d75] to-[#7c5800] transition-all duration-300 ease-out"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Quick Suggested Topics Strip */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 font-['Work_Sans'] text-[12px] text-[#62535d]">
            <span className="font-semibold text-[#72636d]">Try a topic:</span>
            {[
              { label: "Sleep & memory ↗", q: "How does sleep deprivation affect memory consolidation?" },
              { label: "Cardiovascular health ↗", q: "What are the cardiovascular outcomes of GLP-1 receptor agonists?" },
              { label: "Mental health ↗", q: "What does the evidence say about treatments for treatment-resistant depression?" },
              { label: "Cancer vaccines ↗", q: "What are the clinical outcomes of therapeutic cancer vaccines?" },
              { label: "HRT & Alzheimer's ↗", q: "Hormone replacement therapy reduces the risk of Alzheimer's disease" },
              { label: "Metformin & longevity ↗", q: "Metformin extends lifespan in model organisms" },
              { label: "Statins primary prevention ↗", q: "Statins reduce all-cause mortality in primary prevention" },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => handleTopicClick(t.q)}
                className="px-2.5 py-1 bg-transparent hover:bg-[#ffdea6] border border-[#d2c2cb] hover:border-[#7c5800] text-[#3a0f34] transition-colors cursor-pointer"
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Proof Strip */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[12px] font-['Work_Sans'] text-[#72636d]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-[#66365c] inline-block"></span>
              Careful observation
            </span>
            <span className="w-px h-3 bg-[#d2c2cb]"></span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800] inline-block"></span>
              Transparent methods
            </span>
            <span className="w-px h-3 bg-[#d2c2cb]"></span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-[#814d75] inline-block"></span>
              Honest interpretation
            </span>
          </div>

          {/* Details of What We Do (3-Pillar Editorial Cards) */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 w-full text-left font-['Work_Sans']">
            <div className="p-4 bg-[#f0eee9] border border-[#d2c2cb]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#66365c] block mb-1">
                01 // Screen with intention
              </span>
              <h4 className="font-['Bodoni_Moda'] text-[15px] font-medium text-[#3a0f34] mb-1">
                Abstract-Level Stance
              </h4>
              <p className="text-[12px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
                Each dot represents a peer-reviewed publication, categorized into supports, contradicts, or neutral stance.
              </p>
            </div>

            <div className="p-4 bg-[#f0eee9] border border-[#d2c2cb]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7c5800] block mb-1">
                02 // Extract with structure
              </span>
              <h4 className="font-['Bodoni_Moda'] text-[15px] font-medium text-[#3a0f34] mb-1">
                Evidence Hierarchy
              </h4>
              <p className="text-[12px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
                Studies sorted by causal inference strength (Meta-analyses down to Observational) with 95% Wilson confidence intervals.
              </p>
            </div>

            <div className="p-4 bg-[#f0eee9] border border-[#d2c2cb]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#814d75] block mb-1">
                03 // Verify at the source
              </span>
              <h4 className="font-['Bodoni_Moda'] text-[15px] font-medium text-[#3a0f34] mb-1">
                Verbatim Sentence Quote
              </h4>
              <p className="text-[12px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
                Click any citation dot to inspect the exact sentence from the abstract that justifies its verdict and view on PubMed.
              </p>
            </div>
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
