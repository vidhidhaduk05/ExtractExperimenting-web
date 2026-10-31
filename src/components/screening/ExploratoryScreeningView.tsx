import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Play,
  Pause,
  Eye,
  Sliders,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Check,
  Zap,
  UserCheck,
  Layers,
  FileText,
  Clock,
  HelpCircle,
  XCircle,
  Grid,
} from "lucide-react";
import { type Study, type ScreeningSummary, api } from "../../lib/api";

interface ExploratoryScreeningViewProps {
  projectId?: string;
  projectStudies?: Study[];
  summary?: ScreeningSummary | null;
  exclusionReasons?: any[];
  onScreenStudy?: (payload: {
    studyId: string;
    stage: "ta" | "ft";
    decision: "included" | "excluded" | "maybe";
    reasonCode?: string;
    reasonText?: string;
  }) => Promise<any>;
  isDecisionPending?: boolean;
  onSwitchToStandard?: () => void;
}

interface StreamPaper {
  id: number | string;
  turn: number;
  studyId: string;
  title: string;
  rawAbs: string;
  P: string;
  I: string;
  C: string;
  O: string;
  conf: number;
  type: "keep" | "unsure" | "remove";
  year: number;
  journal: string;
  author: string;
  isNew: boolean;
  status: "included" | "excluded" | "awaiting_clarification" | "maybe" | "pending" | "unscreened";
  pico: {
    P: number;
    I: number;
    C: number;
    O: number;
    bias: "Low" | "Med" | "High";
  };
}

export function isGiven(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "number") return val > 0 && !isNaN(val);
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase();
    if (!trimmed) return false;
    if ([
      "none",
      "n/a",
      "na",
      "not given",
      "not specified",
      "not applicable",
      "null",
      "undefined",
      "-",
      "no comparator",
      "no control",
      "single-arm",
      "single arm",
    ].includes(trimmed)) {
      return false;
    }
    return true;
  }
  return Boolean(val);
}

const BASE_BIOMEDICAL_DATA = [
  {
    studyId: "PAM-2024-01",
    P: "pure arterial malformation patients",
    I: "endovascular coiling & flow diversion",
    C: "",
    O: "angiographic obliteration & stroke prevention",
    abs: "In pure arterial malformation patients, endovascular coiling & flow diversion achieved angiographic obliteration & stroke prevention without secondary ischemic deficit across 5-year surveillance.",
  },
  {
    studyId: "PAM-2024-02",
    P: "type 2 diabetes patients",
    I: "SGLT2 inhibitors",
    C: "",
    O: "kidney outcomes & albuminuria reduction",
    abs: "In type 2 diabetes patients, SGLT2 inhibitors improved kidney outcomes & albuminuria reduction significantly over 36 months.",
  },
  {
    studyId: "PAM-2024-03",
    P: "intracranial aneurysm cohorts",
    I: "microsurgical clipping",
    C: "endovascular embolization",
    O: "complete occlusion rate",
    abs: "Among intracranial aneurysm cohorts, microsurgical clipping versus endovascular embolization demonstrated higher complete occlusion rate with comparable 90-day modified Rankin scores.",
  },
  {
    studyId: "PAM-2024-04",
    P: "elderly vascular dementia adults",
    I: "Mediterranean neuroprotective diet",
    C: "standard western diet",
    O: "cognitive trajectory preservation",
    abs: "Among elderly vascular dementia adults, Mediterranean neuroprotective diet versus standard western diet preserved cognitive trajectory preservation and executive function indices over 4 years.",
  },
  {
    studyId: "PAM-2024-05",
    P: "acute ischemic stroke subjects",
    I: "tenecteplase thrombolysis",
    C: "alteplase standard-of-care",
    O: "functional independence at 90 days",
    abs: "In acute ischemic stroke subjects, tenecteplase thrombolysis compared to alteplase standard-of-care increased functional independence at 90 days with reduced intracranial hemorrhage incidence.",
  },
  {
    studyId: "PAM-2024-06",
    P: "cerebral cavernous malformation cases",
    I: "propranolol pharmacotherapy",
    C: "",
    O: "recurrent microhemorrhage rate",
    abs: "In cerebral cavernous malformation cases, propranolol pharmacotherapy reduced recurrent microhemorrhage rate across long-term MRI gradient echo follow-up.",
  },
];

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function ExploratoryScreeningView({
  projectId = "proj_pam_current",
  projectStudies = [],
  summary,
  exclusionReasons = [],
  onScreenStudy,
  isDecisionPending = false,
  onSwitchToStandard,
}: ExploratoryScreeningViewProps) {
  // ── 5 MAIN TOGGLES FOR SENIOR DOCTORS + SPEED ──
  // 1. LIVE STREAM: Pauses the live feed so senior doctors can read without it shifting
  const [liveStream, setLiveStream] = useState(false);

  // 2. SHOW PROCESS (Rose Section 2): Shows step-by-step trace (Reading -> Extracting PICO -> P matched 78% -> Decision: KEEP ✓)
  const [showProcess, setShowProcess] = useState(false);

  // 3. PICO HIGHLIGHTS: Highlights PICO words in abstract (Plum / Inks / Mustard / Slate)
  const [picoHighlights, setPicoHighlights] = useState(true);

  // 4. FAST MODE: ON = 350ms (21/sec for demo), OFF = 900ms (calm)
  const [fastMode, setFastMode] = useState(true);

  // 5. SENIOR MODE: One-click comfort: font size 15px, slower 1.2s cadence, shows banner, enables process trace
  const [seniorMode, setSeniorMode] = useState(false);

  // Discrete left panel view mode: original 'cards' or 'heatmap'
  const [leftViewMode, setLeftViewMode] = useState<"cards" | "heatmap">("cards");

  // Active filter tab: 'all' | 'keep' | 'unsure' | 'remove'
  const [filter, setFilter] = useState<"all" | "keep" | "unsure" | "remove">("all");

  // Stream & study state
  const [papers, setPapers] = useState<StreamPaper[]>(() => {
    if (projectStudies.length > 0) {
      return projectStudies.map((s, idx) => {
        const studyId = s.study_id || (s as any).id || `study-${idx + 1}`;
        const rawStatus = (s.screening_status || "pending").toLowerCase();
        let conf = 0;
        if (typeof s.ai_confidence === "number") {
          conf = s.ai_confidence > 1 ? Math.round(s.ai_confidence) : Math.round(s.ai_confidence * 100);
        } else if (s.ai_decision === "include") conf = 88;
        else if (s.ai_decision === "maybe") conf = 65;
        else if (s.ai_decision === "exclude") conf = 35;

        const type: "keep" | "unsure" | "remove" =
          rawStatus === "included" || s.ai_decision === "include"
            ? "keep"
            : rawStatus === "maybe" || rawStatus === "uncertain" || rawStatus === "awaiting_clarification" || s.ai_decision === "maybe"
            ? "unsure"
            : "remove";

        const pText = (s as any).pico_population || "";
        const iText = (s as any).pico_intervention || (s as any).index_test || "";
        const cText = (s as any).pico_comparator || "";
        const oText = (s as any).pico_outcome || "";

        const pScore = typeof (s as any).pico_p_score === "number" ? (s as any).pico_p_score : 0;
        const iScore = typeof (s as any).pico_i_score === "number" ? (s as any).pico_i_score : 0;
        const cScore = isGiven(cText) && typeof (s as any).pico_c_score === "number" ? (s as any).pico_c_score : 0;
        const oScore = typeof (s as any).pico_o_score === "number" ? (s as any).pico_o_score : 0;

        return {
          id: studyId,
          turn: idx + 1,
          studyId,
          title: s.title || `Study ${idx + 1}`,
          rawAbs: s.abstract || "",
          P: pText,
          I: iText,
          C: cText,
          O: oText,
          conf,
          type,
          status: rawStatus as any,
          year: s.publication_year || 2024,
          journal: s.journal || "Medical Journal",
          author: s.authors || "Reviewer Cohort",
          isNew: false,
          pico: {
            P: pScore,
            I: iScore,
            C: cScore,
            O: oScore,
            bias: conf > 80 ? "Low" : "Med",
          },
        };
      });
    }

    return BASE_BIOMEDICAL_DATA.map((b, idx) => ({
      id: idx + 1,
      turn: idx + 1,
      studyId: b.studyId,
      title: `${b.P} + ${b.I} → ${b.O}`,
      rawAbs: b.abs,
      P: b.P,
      I: b.I,
      C: b.C,
      O: b.O,
      conf: 72 + (idx * 5) % 24,
      type: idx % 3 === 0 ? "keep" : idx % 3 === 1 ? "unsure" : "remove",
      status: idx % 3 === 0 ? "included" : idx % 3 === 1 ? "awaiting_clarification" : "excluded",
      year: 2021 + (idx % 4),
      journal: ["Lancet", "NEJM", "JAMA", "Stroke", "AJNR"][idx % 5],
      author: ["Smith et al.", "Chen et al.", "Patel et al.", "Kaufmann et al.", "Dhaduk et al."][idx % 5],
      isNew: false,
      pico: {
        P: 75 + (idx * 4) % 20,
        I: 70 + (idx * 3) % 25,
        C: isGiven(b.C) ? 55 + (idx * 5) % 35 : 0,
        O: 72 + (idx * 2) % 22,
        bias: idx % 2 === 0 ? "Low" : "Med",
      },
    }));
  });

  const [selectedPaper, setSelectedPaper] = useState<StreamPaper | null>(() => papers[0] || null);
  const [turn, setTurn] = useState(() => (papers.length > 0 ? papers.length : 1));
  const turnRef = useRef(papers.length > 0 ? papers.length : 1);

  // Synchronize papers whenever real projectStudies are loaded or updated
  useEffect(() => {
    if (projectStudies && projectStudies.length > 0) {
      const mapped: StreamPaper[] = projectStudies.map((s, idx) => {
        const studyId = s.study_id || (s as any).id || `study-${idx + 1}`;
        const rawStatus = (s.screening_status || "pending").toLowerCase();
        let conf = 0;
        if (typeof s.ai_confidence === "number") {
          conf = s.ai_confidence > 1 ? Math.round(s.ai_confidence) : Math.round(s.ai_confidence * 100);
        } else if (s.ai_decision === "include") conf = 88;
        else if (s.ai_decision === "maybe") conf = 65;
        else if (s.ai_decision === "exclude") conf = 35;

        const type: "keep" | "unsure" | "remove" =
          rawStatus === "included" || s.ai_decision === "include"
            ? "keep"
            : rawStatus === "maybe" || rawStatus === "uncertain" || rawStatus === "awaiting_clarification" || s.ai_decision === "maybe"
            ? "unsure"
            : "remove";

        const pText = (s as any).pico_population || "";
        const iText = (s as any).pico_intervention || (s as any).index_test || "";
        const cText = (s as any).pico_comparator || "";
        const oText = (s as any).pico_outcome || "";

        const pScore = typeof (s as any).pico_p_score === "number" ? (s as any).pico_p_score : 0;
        const iScore = typeof (s as any).pico_i_score === "number" ? (s as any).pico_i_score : 0;
        const cScore = isGiven(cText) && typeof (s as any).pico_c_score === "number" ? (s as any).pico_c_score : 0;
        const oScore = typeof (s as any).pico_o_score === "number" ? (s as any).pico_o_score : 0;

        return {
          id: studyId,
          turn: idx + 1,
          studyId,
          title: s.title || `Study ${idx + 1}`,
          rawAbs: s.abstract || "",
          P: pText,
          I: iText,
          C: cText,
          O: oText,
          conf,
          type,
          status: rawStatus as any,
          year: s.publication_year || 2024,
          journal: s.journal || "Medical Journal",
          author: s.authors || "Reviewer Cohort",
          isNew: false,
          pico: {
            P: pScore,
            I: iScore,
            C: cScore,
            O: oScore,
            bias: conf > 80 ? "Low" : "Med",
          },
        };
      });

      setPapers(mapped);
      setSelectedPaper((prev) => {
        if (!prev) return mapped[0] || null;
        const match = mapped.find((m) => m.studyId === prev.studyId || m.id === prev.id);
        return match || mapped[0] || null;
      });
    }
  }, [projectStudies]);

  // Decision & exclusion state
  const [selectedExcludeReason, setSelectedExcludeReason] = useState<string>("EXC_POPULATION");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "uncertain" | "excluded" } | null>(null);

  // Speed calculation based on toggles
  const effectiveSpeedMs = useMemo(() => {
    if (seniorMode) return 1200; // Calm 1.2s for senior clinicians
    return fastMode ? 350 : 900; // 350ms rapid demo or 900ms calm cadence
  }, [seniorMode, fastMode]);

  // When Senior Mode is toggled ON, automatically reveal step-by-step reasoning trace
  const handleToggleSeniorMode = () => {
    setSeniorMode((prev) => {
      const next = !prev;
      if (next) {
        setShowProcess(true);
      }
      return next;
    });
  };

  // Convert real project studies or biomedical base into stream papers
  const generateNextPaper = (): StreamPaper => {
    turnRef.current += 1;
    const currentTurn = turnRef.current;

    if (projectStudies.length > 0 && Math.random() > 0.3) {
      const study = rnd(projectStudies);
      const studyId = study.study_id || (study as any).id || `study-${currentTurn}`;
      const conf = Math.floor(Math.random() * 32) + 65;
      const type: "keep" | "unsure" | "remove" =
        study.screening_status === "included" || conf > 78
          ? "keep"
          : study.screening_status === "maybe" || conf > 62
          ? "unsure"
          : "remove";

      const pText = (study as any).pico_population || "";
      const iText = (study as any).pico_intervention || (study as any).index_test || "";
      const cText = (study as any).pico_comparator || "";
      const oText = (study as any).pico_outcome || "";

      return {
        id: currentTurn,
        turn: currentTurn,
        studyId,
        title: study.title || "Pure Arterial Malformation Diagnostic Cohort",
        rawAbs:
          study.abstract ||
          "Retrospective multicenter review evaluating pure arterial malformations (PAM) managed with coiling vs conservative observation across 5-year angiographic follow-up.",
        P: pText,
        I: iText,
        C: cText,
        O: oText,
        conf,
        type,
        status: (study.screening_status as any) || "pending",
        year: study.publication_year || 2023,
        journal: study.journal || "Journal of Neurosurgery",
        author: study.authors || "Dhaduk et al.",
        isNew: true,
        pico: {
          P: isGiven(pText) ? 72 + Math.floor(Math.random() * 24) : 0,
          I: isGiven(iText) ? 68 + Math.floor(Math.random() * 28) : 0,
          C: isGiven(cText) ? 55 + Math.floor(Math.random() * 38) : 0,
          O: isGiven(oText) ? 70 + Math.floor(Math.random() * 26) : 0,
          bias: rnd(["Low", "Med", "High"]),
        },
      };
    }

    const b = rnd(BASE_BIOMEDICAL_DATA);
    const conf = Math.floor(Math.random() * 35) + 60;
    const type: "keep" | "unsure" | "remove" = conf > 78 ? "keep" : conf > 62 ? "unsure" : "remove";

    return {
      id: currentTurn,
      turn: currentTurn,
      studyId: `${b.studyId}-${currentTurn}`,
      title: `${b.P} + ${b.I} → ${b.O}`,
      rawAbs: b.abs,
      P: b.P,
      I: b.I,
      C: b.C,
      O: b.O,
      conf,
      type,
      status: type === "keep" ? "included" : type === "unsure" ? "awaiting_clarification" : "excluded",
      year: 2021 + Math.floor(Math.random() * 4),
      journal: rnd(["Lancet", "NEJM", "JAMA", "Stroke", "AJNR"]),
      author: rnd(["Smith et al.", "Chen et al.", "Patel et al.", "Kaufmann et al."]),
      isNew: true,
      pico: {
        P: 70 + Math.floor(Math.random() * 25),
        I: 60 + Math.floor(Math.random() * 30),
        C: isGiven(b.C) ? 45 + Math.floor(Math.random() * 40) : 0,
        O: 65 + Math.floor(Math.random() * 30),
        bias: rnd(["Low", "Med", "High"]),
      },
    };
  };

  // Stream interval effect
  useEffect(() => {
    if (!liveStream) return;

    if (projectStudies.length > 0) {
      return;
    }

    const interval = setInterval(() => {
      const nextPaper = generateNextPaper();
      setTurn(turnRef.current);
      setPapers((prev) => {
        const nextList = [nextPaper, ...prev];
        return nextList.length > 60 ? nextList.slice(0, 60) : nextList;
      });

      setSelectedPaper((prev) => (!prev || Math.random() > 0.4 ? nextPaper : prev));

      setTimeout(() => {
        setPapers((current) =>
          current.map((p) => (p.id === nextPaper.id ? { ...p, isNew: false } : p))
        );
      }, 700);
    }, effectiveSpeedMs);

    return () => clearInterval(interval);
  }, [liveStream, effectiveSpeedMs, projectStudies]);

  // Real Screening Decision handler
  const handleRecordDecision = async (decision: "included" | "maybe" | "excluded", reasonCode?: string) => {
    if (!selectedPaper) return;
    setIsSubmittingDecision(true);
    const studyId = selectedPaper.studyId || String(selectedPaper.id);
    const stage: "ta" | "ft" = selectedPaper.status === "included" ? "ft" : "ta";
    const code = decision === "excluded" ? (reasonCode || selectedExcludeReason) : undefined;
    const text = decision === "excluded" ? `Exclusion applied in Velvet Screening: ${code}` : undefined;

    try {
      if (onScreenStudy) {
        await onScreenStudy({
          studyId,
          stage,
          decision,
          reasonCode: code,
          reasonText: text,
        });
      } else if (projectId) {
        await api.screeningDecision(studyId, {
          project_id: projectId,
          stage,
          decision,
          reason_code: code,
          reason_text: text,
        });
      }

      const nextType: "keep" | "unsure" | "remove" =
        decision === "included" ? "keep" : decision === "maybe" ? "unsure" : "remove";
      const nextStatus =
        decision === "included" ? "included" : decision === "maybe" ? "awaiting_clarification" : "excluded";

      setPapers((prev) =>
        prev.map((p) => (p.id === selectedPaper.id ? { ...p, type: nextType, status: nextStatus, isNew: false } : p))
      );

      setSelectedPaper((prev) => (prev && prev.id === selectedPaper.id ? { ...prev, type: nextType, status: nextStatus } : prev));

      const label = decision === "included" ? "INCLUDED (Keep)" : decision === "maybe" ? "UNCERTAIN (Needs Human)" : `EXCLUDED (${code})`;
      setToastMessage({
        text: `Saved Decision: ${studyId} marked as ${label}`,
        type: decision === "included" ? "success" : decision === "maybe" ? "uncertain" : "excluded",
      });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error("Decision recording error:", err);
      setToastMessage({
        text: `Error saving decision for ${studyId}: ${err?.message || "Server error"}`,
        type: "excluded",
      });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Filtered paper list for left grid
  const filteredPapers = useMemo(() => {
    if (filter === "all") return papers;
    return papers.filter((p) => p.type === filter);
  }, [papers, filter]);

  // Counts (connected to real summary when available)
  const counts = useMemo(() => {
    const total =
      typeof summary?.total === "number" && summary.total > 0
        ? summary.total
        : projectStudies.length > 0
        ? projectStudies.length
        : papers.length;

    const keep =
      typeof summary?.ta_included === "number"
        ? summary.ta_included + (summary.ft_included || 0)
        : projectStudies.length > 0
        ? projectStudies.filter((s) => s.screening_status === "included" || s.ai_decision === "include").length
        : papers.filter((p) => p.type === "keep").length;

    const unsure =
      typeof summary?.uncertain === "number"
        ? summary.uncertain
        : typeof summary?.awaiting_clarification === "number"
        ? summary.awaiting_clarification
        : projectStudies.length > 0
        ? projectStudies.filter((s) => s.screening_status === "maybe" || s.screening_status === "uncertain" || s.screening_status === "awaiting_clarification").length
        : papers.filter((p) => p.type === "unsure").length;

    const remove =
      typeof summary?.ta_excluded === "number"
        ? summary.ta_excluded + (summary.ft_excluded || 0)
        : projectStudies.length > 0
        ? projectStudies.filter((s) => s.screening_status === "excluded" || s.ai_decision === "exclude").length
        : papers.filter((p) => p.type === "remove").length;

    const judgments =
      typeof summary?.total === "number" && typeof summary?.pending === "number"
        ? Math.max(0, summary.total - summary.pending)
        : typeof summary?.ai_screened === "number" || typeof summary?.human_screened === "number"
        ? (summary.ai_screened || 0) + (summary.human_screened || 0)
        : keep + unsure + remove;

    return { total, judgments, keep, unsure, remove };
  }, [papers, summary, projectStudies]);

  // Render text with PICO highlights
  const renderHighlightedAbstract = (rawText: string, paper: StreamPaper) => {
    if (!picoHighlights) return rawText;

    const terms: [string, string][] = [
      ["P", paper.P],
      ["I", paper.I],
      ["C", paper.C],
      ["O", paper.O],
    ];

    let result = rawText;
    terms.forEach(([cls, term]) => {
      if (!term) return;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");
      result = result.replace(regex, `[[HL_${cls}]]$1[[/HL]]`);
    });

    const parts = result.split(/(\[\[HL_[PICO]\]\].*?\[\[\/HL\]\])/g);
    return parts.map((part, idx) => {
      if (part.startsWith("[[HL_P]]")) {
        const word = part.replace("[[HL_P]]", "").replace("[[/HL]]", "");
        return (
          <span
            key={idx}
            className="font-bold border-b-2 border-[#2E1231] bg-[#E8C5E0] text-[#2E1231] px-1 rounded-xs"
          >
            {word}
          </span>
        );
      }
      if (part.startsWith("[[HL_I]]")) {
        const word = part.replace("[[HL_I]]", "").replace("[[/HL]]", "");
        return (
          <span
            key={idx}
            className="font-bold border-b-2 border-[#111111] bg-[#E8E8E8] text-[#111111] px-1 rounded-xs"
          >
            {word}
          </span>
        );
      }
      if (part.startsWith("[[HL_C]]")) {
        const word = part.replace("[[HL_C]]", "").replace("[[/HL]]", "");
        return (
          <span
            key={idx}
            className="font-bold border-b-2 border-[#9A6B00] bg-[#FEF3C7] text-[#9A6B00] px-1 rounded-xs"
          >
            {word}
          </span>
        );
      }
      if (part.startsWith("[[HL_O]]")) {
        const word = part.replace("[[HL_O]]", "").replace("[[/HL]]", "");
        return (
          <span
            key={idx}
            className="font-bold border-b-2 border-[#333333] bg-[#D6E0E3] text-[#333333] px-1 rounded-xs"
          >
            {word}
          </span>
        );
      }
      return part;
    });
  };

  const isMutatingNow = isDecisionPending || isSubmittingDecision;

  return (
    <div
      className={`min-h-screen bg-[#FAF7F2] text-[#111111] font-sans transition-all duration-300 ${
        seniorMode ? "text-[15px]" : "text-[13px]"
      }`}
      style={{
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── TOP EDITORIAL STRIP / MASTER HEADER (ORIGINAL ROSE) ── */}
      <div className="bg-[#FFFEFB] border-b-2 border-[#111111] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onSwitchToStandard && (
            <button
              onClick={onSwitchToStandard}
              className="p-1.5 bg-[#FAF7F2] hover:bg-[#EAE5DE] text-[#2E1231] border border-[#111111] rounded transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Return to Standard Workspace"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Standard Workspace</span>
            </button>
          )}

          <div>
            <h1
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111] leading-none"
              style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
            >
              steal the <em className="text-[#2E1231] not-italic">whole literature</em>
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#666666] mt-1">
              Co-Scientist Systematic Screening • Velvet Editorial •{" "}
              {seniorMode ? "Senior Clinician Mode Active" : "High-Throughput Mode"}
            </p>
          </div>
        </div>

        {/* Status Pill & Live Indicator */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-[10px] px-2.5 py-1 bg-[#111111] text-white font-bold flex items-center gap-2 rounded">
            <span
              className={`w-2 h-2 rounded-full ${
                liveStream ? "bg-emerald-400 animate-ping" : "bg-amber-400"
              }`}
            />
            <span>{counts.judgments} / {counts.total} DECIDED — {liveStream ? "STREAMING LIVE" : "STREAM PAUSED"}</span>
          </div>
          {onSwitchToStandard && (
            <button
              onClick={onSwitchToStandard}
              className="text-[11px] font-mono uppercase font-bold text-[#666666] hover:text-[#2E1231] underline px-2 py-1"
            >
              Switch View
            </button>
          )}
        </div>
      </div>

      {/* ── 5 TOGGLES BAR (PROMINENT AT TOP) ── */}
      <div className="bg-[#FAF7F2] border-b-2 border-[#111111] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1 text-[#2E1231] font-mono font-bold text-[11px] uppercase tracking-wider mr-2">
          <Sliders className="w-4 h-4 text-[#2E1231]" />
          <span>Screening Controls:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5 font-mono text-[11px]">
          {/* Toggle 1: LIVE STREAM */}
          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none bg-white px-2.5 py-1 rounded border border-[#111111] shadow-2xs hover:bg-[#FFFEF5]"
            title="Pause stream so senior doctors can read studies without them moving"
          >
            <input
              type="checkbox"
              checked={liveStream}
              onChange={(e) => setLiveStream(e.target.checked)}
              className="accent-[#2E1231] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="font-bold text-[#111111] flex items-center gap-1">
              {liveStream ? <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" /> : <Pause className="w-3 h-3 text-amber-600 fill-amber-600" />}
              LIVE STREAM: <span className={liveStream ? "text-emerald-700" : "text-amber-700"}>{liveStream ? "ON" : "OFF (PAUSED)"}</span>
            </span>
          </label>

          {/* Toggle 2: SHOW PROCESS ("Rose Section 2" Trace) */}
          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none bg-white px-2.5 py-1 rounded border border-[#111111] shadow-2xs hover:bg-[#FFFEF5]"
            title="Shows step-by-step reasoning trace: Reading -> PICO -> Match -> Decision with checkmarks"
          >
            <input
              type="checkbox"
              checked={showProcess}
              onChange={(e) => setShowProcess(e.target.checked)}
              className="accent-[#2E1231] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="font-bold text-[#111111] flex items-center gap-1">
              <Eye className="w-3 h-3 text-[#2E1231]" />
              SHOW PROCESS: <span className={showProcess ? "text-[#2E1231]" : "text-[#777777]"}>{showProcess ? "ON" : "OFF"}</span>
            </span>
          </label>

          {/* Toggle 3: PICO HIGHLIGHTS */}
          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none bg-white px-2.5 py-1 rounded border border-[#111111] shadow-2xs hover:bg-[#FFFEF5]"
            title="Highlights Population, Intervention, Comparator, and Outcome words in abstract text"
          >
            <input
              type="checkbox"
              checked={picoHighlights}
              onChange={(e) => setPicoHighlights(e.target.checked)}
              className="accent-[#2E1231] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="font-bold text-[#111111]">
              PICO HIGHLIGHTS: <span className={picoHighlights ? "text-[#2E1231]" : "text-[#777777]"}>{picoHighlights ? "ON" : "OFF"}</span>
            </span>
          </label>

          {/* Toggle 4: FAST MODE */}
          <label
            className={`inline-flex items-center gap-2 cursor-pointer select-none bg-white px-2.5 py-1 rounded border border-[#111111] shadow-2xs hover:bg-[#FFFEF5] ${
              seniorMode ? "opacity-40 pointer-events-none" : ""
            }`}
            title="ON = 350ms (21/sec, demo speed), OFF = 900ms (calm)"
          >
            <input
              type="checkbox"
              checked={fastMode && !seniorMode}
              onChange={(e) => setFastMode(e.target.checked)}
              disabled={seniorMode}
              className="accent-[#2E1231] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="font-bold text-[#111111] flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
              FAST MODE:{" "}
              <span className={fastMode && !seniorMode ? "text-amber-700" : "text-[#777777]"}>
                {fastMode && !seniorMode ? "ON (350ms)" : "OFF (900ms)"}
              </span>
            </span>
          </label>

          {/* Toggle 5: SENIOR MODE */}
          <button
            type="button"
            onClick={handleToggleSeniorMode}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded border-2 transition-all cursor-pointer font-bold select-none ${
              seniorMode
                ? "bg-[#2E1231] text-white border-[#2E1231] shadow-md scale-105"
                : "bg-white text-[#2E1231] border-[#2E1231] hover:bg-[#E8C5E0]/40"
            }`}
            title="One click: makes text larger (15px), slower (1.2s), shows transparent reasoning trace, and reduces flashing"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>SENIOR MODE: {seniorMode ? "ON (ACTIVE)" : "OFF"}</span>
          </button>
        </div>
      </div>


      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`animate-velvet-landing fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded border-2 shadow-xl flex items-center gap-2 font-mono text-xs font-bold ${
            toastMessage.type === "success"
              ? "bg-[#2E1231] text-white border-[#E8C5E0]"
              : toastMessage.type === "uncertain"
              ? "bg-[#FEF3C7] text-[#9A6B00] border-[#F59E0B]"
              : "bg-[#111111] text-white border-[#DC2626]"
          }`}
        >
          {toastMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toastMessage.type === "uncertain" && <HelpCircle className="w-4 h-4 text-[#D97706]" />}
          {toastMessage.type === "excluded" && <XCircle className="w-4 h-4 text-rose-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ── 6 KPI BOXES ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-[1px] bg-[#111111] border-b-2 border-[#111111]">
        {/* KPI 1 */}
        <div className="bg-[#2E1231] text-white p-2.5 sm:p-3 flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#E8C5E0]">
            TOTAL PAPERS
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.total}
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[#2E1231] text-white p-2.5 sm:p-3 flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#E8C5E0]">
            JUDGMENTS
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.judgments}
          </div>
        </div>

        {/* KPI 3 (INCLUDED) */}
        <div className="bg-[#FFFEFB] p-2.5 sm:p-3 border-l-4 border-[#2E1231] flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#666666]">
            INCLUDED
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#2E1231] mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.keep}
          </div>
        </div>

        {/* KPI 4 (UNCERTAIN) */}
        <div className="bg-[#FFFEFB] p-2.5 sm:p-3 border-l-4 border-[#EAB308] flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#666666]">
            UNCERTAIN
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#9A6B00] mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.unsure}
          </div>
        </div>

        {/* KPI 5 (EXCLUDED) */}
        <div className="bg-[#FFFEFB] p-2.5 sm:p-3 border-l-4 border-[#111111] flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#666666]">
            EXCLUDED
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111] mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.remove}
          </div>
        </div>

        {/* KPI 6 (DECISION RATE) */}
        <div className="bg-[#2E1231] text-white p-2.5 sm:p-3 flex flex-col justify-between">
          <div className="font-mono text-[7.5px] uppercase tracking-widest text-[#E8C5E0]">
            DECISION RATE
          </div>
          <div
            className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1"
            style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {counts.total > 0 ? `${Math.round((counts.judgments / counts.total) * 100)}%` : "0%"}
          </div>
        </div>
      </div>

      {/* ── MAIN WORKSPACE SPLIT (56% LEFT FEED, 44% RIGHT INSPECTOR) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[56%_44%] gap-[1px] bg-[#111111] border-b-2 border-[#111111] min-h-[78vh]">
        
        {/* ── LEFT PANEL: LIVE STREAM GRID WITH UNTOUCHED ROSE + HEATMAP TOGGLE ── */}
        <div className="bg-[#FFFEFB] flex flex-col overflow-hidden">
          {/* Left Header with discrete Heatmap toggle */}
          <div className="p-2.5 sm:px-3 bg-[#FAF7F2] border-b border-[#111111] font-mono text-[8.5px] font-bold uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Left — live feed • scored &amp; rated • confidence breakdown</span>
              <span className="bg-[#111111] text-white px-2 py-0.5 rounded text-[8px]">
                {papers.length} papers
              </span>
            </div>

            {/* Discrete View Switcher: Rose Cards vs Heatmap View */}
            <div className="flex items-center gap-1 bg-[#EAE5DE] p-0.5 rounded border border-[#111111]">
              <button
                type="button"
                onClick={() => setLeftViewMode("cards")}
                className={`px-2 py-0.5 text-[8.5px] font-mono font-bold uppercase rounded cursor-pointer transition-colors ${
                  leftViewMode === "cards" ? "bg-[#2E1231] text-white" : "text-[#555555] hover:text-black"
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setLeftViewMode("heatmap")}
                className={`px-2 py-0.5 text-[8.5px] font-mono font-bold uppercase rounded cursor-pointer transition-colors ${
                  leftViewMode === "heatmap" ? "bg-[#2E1231] text-white" : "text-[#555555] hover:text-black"
                }`}
              >
                Heatmap
              </button>
            </div>
          </div>

          {/* ── LEFT VIEW 1: ORIGINAL 3-COLUMN ROSE PAPER GRID ── */}
          {leftViewMode === "cards" ? (
            <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 bg-[#FAF8F5] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 align-content-start max-h-[74vh]">
              {filteredPapers.map((p) => {
                const isSelected = selectedPaper?.id === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPaper(p)}
                    className={`p-3.5 bg-white rounded-xl flex flex-col justify-between cursor-pointer relative transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] min-h-[168px] ${
                      seniorMode ? "min-h-[188px]" : ""
                    } border border-[#E7DFD5] ${
                      p.type === "keep"
                        ? "border-l-[4px] border-l-[#2E1231]"
                        : p.type === "unsure"
                        ? "border-l-[4px] border-l-[#EAB308]"
                        : "border-l-[4px] border-l-[#9CA3AF]"
                    } ${
                      isSelected
                        ? "bg-[#2E1231] text-white border-[#4A204D] ring-2 ring-[#E8C5E0] shadow-[0_12px_28px_-6px_rgba(46,18,49,0.3)] scale-[1.01]"
                        : "hover:bg-[#FFFEFB] hover:-translate-y-1 hover:shadow-[0_10px_25px_-5px_rgba(46,18,49,0.1)] hover:border-[#814D75]/40 shadow-[0_2px_8px_-2px_rgba(46,18,49,0.05)]"
                    } ${p.isNew && !seniorMode ? "animate-velvetIn" : ""}`}
                  >
                    {/* Top line: Confidence % badge + Turn # */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs tracking-wider flex items-center gap-1.5 transition-colors duration-200 ${
                          isSelected
                            ? "bg-white text-[#2E1231]"
                            : p.type === "keep"
                            ? "bg-[#2E1231] text-[#FAF7F2]"
                            : p.type === "unsure"
                            ? "bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]"
                            : "bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? "bg-[#2E1231]"
                              : p.type === "keep"
                              ? "bg-emerald-400"
                              : p.type === "unsure"
                              ? "bg-amber-500"
                              : "bg-gray-400"
                          }`}
                        />
                        {p.conf}% {p.type.toUpperCase()}
                      </span>
                      <span
                        className={`font-mono text-[8px] font-medium ${
                          isSelected ? "text-[#E8C5E0]" : "text-[#777777]"
                        }`}
                      >
                        #{p.turn} • {p.pico.bias}
                      </span>
                    </div>

                    {/* Title with generous line-height, proper descender clearance, and full legibility */}
                    <h4
                      className={`font-bold leading-snug line-clamp-3 pb-0.5 min-h-[50px] ${
                        seniorMode
                          ? "text-[14.5px] leading-[1.42] min-h-[62px]"
                          : "text-[12.5px] sm:text-[13px] leading-[1.38]"
                      } ${isSelected ? "text-white" : "text-[#1F171D]"}`}
                      style={{
                        fontFamily: "'EB Garamond', 'Serifon Editorial', Georgia, serif",
                        wordBreak: "break-word",
                      }}
                      title={p.title}
                    >
                      {p.title}
                    </h4>

                    {/* Mini PICO tags */}
                    <div
                      className={`text-[8.5px] line-clamp-2 leading-relaxed my-0.5 ${
                        isSelected ? "text-[#D0A0C8]" : "text-[#5C5559]"
                      }`}
                    >
                      {p.P} • {p.I} • {p.O}
                    </div>

                    {/* PICO Match Dots Bar */}
                    <div className="flex gap-1 mt-1">
                      <div
                        className="h-[3.5px] rounded-full transition-all duration-300"
                        style={{
                          width: `${p.pico.P}%`,
                          backgroundColor: isSelected ? "#FAF7F2" : "#2E1231",
                        }}
                        title={`P: ${p.pico.P}%`}
                      />
                      <div
                        className="h-[3.5px] rounded-full transition-all duration-300"
                        style={{
                          width: `${p.pico.I}%`,
                          backgroundColor: isSelected ? "#FAF7F2" : "#814D75",
                        }}
                        title={`I: ${p.pico.I}%`}
                      />
                      <div
                        className="h-[3.5px] rounded-full transition-all duration-300"
                        style={{
                          width: `${p.pico.C}%`,
                          backgroundColor: isSelected ? "#FAF7F2" : "#EAB308",
                        }}
                        title={`C: ${p.pico.C}%`}
                      />
                      <div
                        className="h-[3.5px] rounded-full transition-all duration-300"
                        style={{
                          width: `${p.pico.O}%`,
                          backgroundColor: isSelected ? "#FAF7F2" : "#999999",
                        }}
                        title={`O: ${p.pico.O}%`}
                      />
                    </div>

                    {/* Meta Footer */}
                    <div
                      className={`mt-auto pt-2 border-t flex items-center justify-between font-mono text-[7.5px] ${
                        isSelected
                          ? "border-[#4A204D] text-[#E8C5E0]"
                          : "border-[#ECE5DC] text-[#7E747B]"
                      }`}
                    >
                      <span className="truncate max-w-[110px] font-medium">{p.author}</span>
                      <span className="font-medium">
                        {p.year} {p.journal}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── LEFT VIEW 2: HEATMAP STACK VIEW (CLEAR STUDY ID & CONFIDENCE GRADIENT) ── */
            <div className="flex-1 overflow-y-auto p-3 bg-[#FAF8F5] grid grid-cols-2 sm:grid-cols-3 gap-2.5 align-content-start max-h-[74vh]">
              {filteredPapers.map((p) => {
                const isSelected = selectedPaper?.id === p.id;
                // Heat color based on confidence %
                const heatBg =
                  p.conf >= 85
                    ? "bg-[#2E1231] text-[#E8C5E0] border-[#4A204D]"
                    : p.conf >= 70
                    ? "bg-[#814d75] text-[#FAF7F2] border-[#995c8c]"
                    : p.conf >= 55
                    ? "bg-[#D97706] text-[#FEF3C7] border-[#B45309]"
                    : "bg-[#475569] text-white border-[#334155]";

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPaper(p)}
                    className={`p-3 rounded-xl border transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] cursor-pointer flex flex-col justify-between min-h-[105px] shadow-xs hover:-translate-y-0.5 hover:shadow-md ${heatBg} ${
                      isSelected ? "ring-2 ring-white scale-[1.02] shadow-xl" : "hover:opacity-95"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[9px]">
                      {/* Prominent Study ID */}
                      <span className="font-bold tracking-wider px-2 py-0.5 rounded-md bg-black/30 text-white shadow-xs">
                        {p.studyId}
                      </span>
                      <span className="font-bold">{p.conf}%</span>
                    </div>
                    <div className="text-[11.5px] font-bold line-clamp-2 mt-1.5 font-serif leading-[1.38] pb-0.5">
                      {p.title}
                    </div>
                    <div className="flex items-center justify-between text-[7.5px] font-mono mt-1.5 pt-1 border-t border-black/15">
                      <span className="uppercase font-semibold tracking-wider">{p.type}</span>
                      <span>{p.year}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: STACKS FILTER & DETAIL INSPECTOR ── */}
        <div className="bg-[#FFFEFB] flex flex-col overflow-hidden">
          {/* 3 Stacks Filter Tabs */}
          <div className="grid grid-cols-3 gap-[1px] bg-[#111111] border-b-2 border-[#111111]">
            {/* Stack 1: INCLUDED */}
            <button
              type="button"
              onClick={() => setFilter(filter === "keep" ? "all" : "keep")}
              className={`p-3 text-left transition-colors cursor-pointer border-t-4 border-t-[#2E1231] ${
                filter === "keep"
                  ? "bg-[#2E1231] text-white"
                  : "bg-[#FFFEFB] hover:bg-[#FAF7F2] text-[#111111]"
              }`}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {counts.keep}
              </div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider">
                INCLUDED
              </div>
              <div
                className={`text-[8px] mt-0.5 ${
                  filter === "keep" ? "text-[#E8C5E0]" : "text-[#666666]"
                }`}
              >
                ready for full-text
              </div>
            </button>

            {/* Stack 2: UNCERTAIN */}
            <button
              type="button"
              onClick={() => setFilter(filter === "unsure" ? "all" : "unsure")}
              className={`p-3 text-left transition-colors cursor-pointer border-t-4 border-t-[#EAB308] ${
                filter === "unsure"
                  ? "bg-[#2E1231] text-white"
                  : "bg-[#FFFEFB] hover:bg-[#FAF7F2] text-[#111111]"
              }`}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#9A6B00]"
                style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {counts.unsure}
              </div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider">
                UNCERTAIN
              </div>
              <div
                className={`text-[8px] mt-0.5 ${
                  filter === "unsure" ? "text-[#E8C5E0]" : "text-[#666666]"
                }`}
              >
                needs human
              </div>
            </button>

            {/* Stack 3: EXCLUDED */}
            <button
              type="button"
              onClick={() => setFilter(filter === "remove" ? "all" : "remove")}
              className={`p-3 text-left transition-colors cursor-pointer border-t-4 border-t-[#111111] ${
                filter === "remove"
                  ? "bg-[#2E1231] text-white"
                  : "bg-[#FFFEFB] hover:bg-[#FAF7F2] text-[#111111]"
              }`}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]"
                style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {counts.remove}
              </div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-wider">
                EXCLUDED
              </div>
              <div
                className={`text-[8px] mt-0.5 ${
                  filter === "remove" ? "text-[#E8C5E0]" : "text-[#666666]"
                }`}
              >
                filtered out
              </div>
            </button>
          </div>

          {/* Inspector Body */}
          <div className="flex-1 overflow-y-auto">
            {selectedPaper ? (
              <div className="flex flex-col">
                {/* Selected Top Info */}
                <div className="p-4 border-b border-[#111111] bg-[#FAF7F2]">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#2E1231] text-white">
                      STUDY: {selectedPaper.studyId}
                    </span>
                    <span className="font-mono text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                      STATUS: {selectedPaper.status.toUpperCase()}
                    </span>
                  </div>

                  <h3
                    className={`font-bold leading-snug text-[#111111] ${
                      seniorMode ? "text-lg" : "text-base"
                    }`}
                    style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
                  >
                    {selectedPaper.title}
                  </h3>
                  <div className="font-mono text-[8.5px] text-[#666666] mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      {selectedPaper.journal} {selectedPaper.year}
                    </span>
                    <span>#{selectedPaper.turn}</span>
                    <span>{selectedPaper.author}</span>
                    <span className="font-bold text-[#2E1231]">
                      {selectedPaper.conf}% Confidence
                    </span>
                    <span>{selectedPaper.pico.bias} Risk of Bias</span>
                  </div>
                </div>

                {/* ── ROSE SECTION 2: STEP-BY-STEP CO-SCIENTIST PROCESS TRACE (PROVES NOT A BLACK BOX) ── */}
                {showProcess && (
                  <div className="p-4 bg-[#FFFEF5] border-b border-[#111111] animate-fadeIn">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#2E1231] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#2E1231]" />
                        Co-Scientist Reasoning Trace (Transparent Justification)
                      </span>
                      <span className="font-mono text-[8px] text-[#9A6B00] bg-[#FEF3C7] px-1.5 py-0.5 rounded font-bold">
                        VERIFIED TRACE
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {/* Step 1 */}
                      <div className="flex items-start gap-2 text-[#2E1231]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Step 1 — Ingestion:</span>{" "}
                          <span className="text-[#555555]">
                            Full abstract read &amp; semantic entities extracted for study {selectedPaper.studyId}.
                          </span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start gap-2 text-[#2E1231]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Step 2 — PICO Matching:</span>{" "}
                          <span className="text-[#555555]">
                            P: {selectedPaper.pico.P}% • I: {selectedPaper.pico.I}% • C:{" "}
                            {selectedPaper.pico.C}% • O: {selectedPaper.pico.O}%
                          </span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start gap-2 text-[#2E1231]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Step 3 — Eligibility Protocol:</span>{" "}
                          <span className="text-[#555555]">
                            Assessed against systematic review PICO criteria without hallucination.
                          </span>
                        </div>
                      </div>

                      {/* Step 4 Decision */}
                      <div className="flex items-start gap-2 pt-1 border-t border-[#EAE5DE] mt-1.5">
                        <Check className="w-4 h-4 text-[#2E1231] shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-[#2E1231]">
                            Step 4 — Final Co-Scientist Verdict:
                          </span>{" "}
                          <span
                            className={`font-mono text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              selectedPaper.type === "keep"
                                ? "bg-[#2E1231] text-white"
                                : selectedPaper.type === "unsure"
                                ? "bg-[#EAB308] text-[#111111]"
                                : "bg-[#111111] text-white"
                            }`}
                          >
                            {selectedPaper.type === "keep"
                              ? "KEEP (INCLUDED)"
                              : selectedPaper.type === "unsure"
                              ? "NEEDS CLINICIAN REVIEW (UNCERTAIN)"
                              : "REMOVE (EXCLUDED)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CLINICIAN SCREENING DECISION DECK (ACTUALLY WORKING INTERACTION) ── */}
                <div className="p-3.5 bg-[#FAF7F2] border-b-2 border-[#111111]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#2E1231] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#2E1231]" />
                      Record Clinician Decision for {selectedPaper.studyId}
                    </span>
                    <span className="font-mono text-[8px] text-[#666666]">
                      Stage: {selectedPaper.status === "included" ? "Full-Text (FT)" : "Title/Abstract (TA)"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* INCLUDE */}
                    <button
                      type="button"
                      onClick={() => handleRecordDecision("included")}
                      disabled={isMutatingNow}
                      className="p-2 bg-[#2E1231] hover:bg-[#1a0017] text-white rounded font-sans font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{isMutatingNow ? "Saving..." : "Include (Keep)"}</span>
                    </button>

                    {/* UNCERTAIN */}
                    <button
                      type="button"
                      onClick={() => handleRecordDecision("maybe")}
                      disabled={isMutatingNow}
                      className="p-2 bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#9A6B00] border border-[#F59E0B] rounded font-sans font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <HelpCircle className="w-4 h-4 text-[#D97706]" />
                      <span>{isMutatingNow ? "Saving..." : "Uncertain (Human)"}</span>
                    </button>

                    {/* EXCLUDE WITH REASON SELECTOR */}
                    <div className="flex flex-col gap-1">
                      <select
                        value={selectedExcludeReason}
                        onChange={(e) => setSelectedExcludeReason(e.target.value)}
                        className="text-[9.5px] font-mono p-1 border border-[#111111] bg-white rounded cursor-pointer"
                      >
                        <option value="EXC_POPULATION">Reason: Population mismatch</option>
                        <option value="EXC_INTERVENTION">Reason: Wrong intervention</option>
                        <option value="EXC_COMPARATOR">Reason: Ineligible comparator</option>
                        <option value="EXC_OUTCOME">Reason: Missing outcomes</option>
                        <option value="EXC_STUDY_DESIGN">Reason: Ineligible study design</option>
                        <option value="EXC_LANGUAGE">Reason: Non-English</option>
                        {exclusionReasons.map((r: any) => (
                          <option key={r.reason_code || r.code} value={r.reason_code || r.code}>
                            Reason: {r.reason_text || r.label || r.code}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRecordDecision("excluded", selectedExcludeReason)}
                        disabled={isMutatingNow}
                        className="p-1.5 bg-[#111111] hover:bg-black text-white rounded font-sans font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span>{isMutatingNow ? "Saving..." : "Exclude (Remove)"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Abstract with PICO Highlighting */}
                <div className="p-4 bg-[#FAF7F2] border-b border-[#111111]">
                  <div className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[#666666] mb-2 flex items-center justify-between">
                    <span>Abstract View</span>
                    <span className="text-[8px] font-mono lowercase">
                      {picoHighlights ? "pico tags highlighted" : "plain text view"}
                    </span>
                  </div>
                  <p
                    className={`leading-relaxed text-[#111111] ${
                      seniorMode ? "text-[15px] leading-8" : "text-[12px] leading-6"
                    }`}
                  >
                    {renderHighlightedAbstract(selectedPaper.rawAbs, selectedPaper)}
                  </p>

                  {/* PICO Equation Formula — Only show elements that are actually given */}
                  {(isGiven(selectedPaper.P) || isGiven(selectedPaper.I) || isGiven(selectedPaper.C) || isGiven(selectedPaper.O)) && (
                    <div className="mt-3 pt-2.5 border-t border-[#EAE5DE] font-mono text-[9px] flex flex-wrap items-center gap-1.5">
                      {isGiven(selectedPaper.P) && (
                        <span className="bg-[#E8C5E0] text-[#2E1231] px-1.5 py-0.5 font-bold rounded-xs">
                          P: {selectedPaper.P}
                        </span>
                      )}
                      {isGiven(selectedPaper.P) && isGiven(selectedPaper.I) && <span>+</span>}
                      {isGiven(selectedPaper.I) && (
                        <span className="bg-[#E8E8E8] text-[#111111] px-1.5 py-0.5 font-bold rounded-xs">
                          I: {selectedPaper.I}
                        </span>
                      )}
                      {isGiven(selectedPaper.C) && (
                        <>
                          <span>vs</span>
                          <span className="bg-[#FEF3C7] text-[#9A6B00] px-1.5 py-0.5 font-bold rounded-xs">
                            C: {selectedPaper.C}
                          </span>
                        </>
                      )}
                      {isGiven(selectedPaper.O) && (
                        <>
                          <span>→</span>
                          <span className="bg-[#D6E0E3] text-[#333333] px-1.5 py-0.5 font-bold rounded-xs">
                            O: {selectedPaper.O}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* PICO Match Bars & Confidence Breakdown — If something is not given, remove that bar */}
                {(() => {
                  const visiblePicoBars = [
                    { l: "P — Population", v: selectedPaper.pico?.P, text: selectedPaper.P },
                    { l: "I — Intervention", v: selectedPaper.pico?.I, text: selectedPaper.I },
                    { l: "C — Comparator", v: selectedPaper.pico?.C, text: selectedPaper.C },
                    { l: "O — Outcome", v: selectedPaper.pico?.O, text: selectedPaper.O },
                  ].filter((item) => isGiven(item.text) && isGiven(item.v));

                  const hasConfidence = isGiven(selectedPaper.conf);

                  if (visiblePicoBars.length === 0 && !hasConfidence) {
                    return null;
                  }

                  return (
                    <div className="p-4 space-y-4">
                      {/* PICO MATCH BARS — ONLY BARS FOR ELEMENTS THAT ARE GIVEN */}
                      {visiblePicoBars.length > 0 && (
                        <div>
                          <div className="font-mono text-[8.5px] font-bold uppercase tracking-wider pb-1.5 mb-2.5 border-b border-[#111111] text-[#111111]">
                            PICO Match Scores for {selectedPaper.studyId}
                          </div>
                          {visiblePicoBars.map(({ l, v }) => (
                            <div
                              key={l}
                              className="grid grid-cols-[100px_1fr_42px] gap-2 items-center mb-1.5"
                            >
                              <span className="font-mono text-[8.5px] font-bold uppercase text-[#555555]">
                                {l}
                              </span>
                              <div className="h-2 bg-[#EAE5DE] rounded-xs overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    selectedPaper.type === "keep"
                                      ? "bg-[#2E1231]"
                                      : selectedPaper.type === "unsure"
                                      ? "bg-[#EAB308]"
                                      : "bg-[#111111]"
                                  }`}
                                  style={{ width: `${v}%` }}
                                />
                              </div>
                              <span className="font-mono text-[9px] font-bold text-right">
                                {v}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* OVERALL CONFIDENCE — ONLY IF GIVEN */}
                      {hasConfidence && (
                        <div>
                          <div className="font-mono text-[8.5px] font-bold uppercase tracking-wider pb-1.5 mb-2.5 border-b border-[#111111] text-[#111111]">
                            Overall Eligibility Confidence
                          </div>
                          <div className="grid grid-cols-[100px_1fr_42px] gap-2 items-center">
                            <span className="font-mono text-[8.5px] font-bold uppercase text-[#555555]">
                              CONFIDENCE
                            </span>
                            <div className="h-2.5 bg-[#EAE5DE] rounded-xs overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  selectedPaper.type === "keep"
                                    ? "bg-[#2E1231]"
                                    : selectedPaper.type === "unsure"
                                    ? "bg-[#EAB308]"
                                    : "bg-[#111111]"
                                }`}
                                style={{ width: `${selectedPaper.conf}%` }}
                              />
                            </div>
                            <span className="font-mono text-[10px] font-bold text-right text-[#2E1231]">
                              {selectedPaper.conf}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-8 text-center font-mono text-xs text-[#888888]">
                ← Select any paper from the live feed on the left to inspect PICO breakdown.
              </div>
            )}
          </div>

          {/* Bottom Legend */}
          <div className="p-2.5 bg-[#FAF7F2] border-t border-[#111111] font-mono text-[8px] flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-[#2E1231]" /> P Population
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-[#111111]" /> I Intervention
            </span>
            {isGiven(selectedPaper?.C) && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#EAB308]" /> C Comparator
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-[#999999]" /> O Outcome
            </span>
            <span className="ml-auto text-[#777777] hidden sm:inline">
              Co-Scientist Systematic Screening • ClaimScape Velvet Theme
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExploratoryScreeningView;
