import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SecondaryHypothesis, type Criterion } from "../lib/api";
import {
  ArrowLeft, Users, Stethoscope, GitCompare, Target, FlaskConical,
  HelpCircle, Plus, Trash2, Loader2, CheckCircle,
  Upload, FileText, Copy, Sparkles, Database,
  ChevronDown, ChevronRight, AlertCircle, AlertTriangle, FileUp,
  ExternalLink, Check, Download, ShieldCheck, ClipboardCheck,
  Edit3, RotateCcw, Save, Info, AlertOctagon,
} from "lucide-react";
import { ReferenceImportModal } from "../components/common/ReferenceImportModal";

const DATABASES = [
  { key: "pubmed", label: "PubMed", interfaceName: "NCBI Entrez", syntaxDesc: "MeSH terms [Mesh] and title/abstract [tiab], capitalized AND/OR/NOT", hasAutoFetch: true },
  { key: "ovid_medline", label: "Ovid MEDLINE", interfaceName: "OvidSP", syntaxDesc: "Subject headings /, multi-purpose .mp., title/abstract .ti,ab., adjacency adjN", hasAutoFetch: false },
  { key: "embase", label: "Embase.com", interfaceName: "Elsevier Embase", syntaxDesc: "Emtree terms /exp, title/abstract/keywords :ti,ab,kw, NEXT/NEAR operators", hasAutoFetch: false },
  { key: "ovid_embase", label: "Ovid Embase", interfaceName: "OvidSP Embase", syntaxDesc: "Emtree headings /, field tags .ti,ab., case-insensitive Boolean", hasAutoFetch: false },
  { key: "cochrane", label: "Cochrane Library", interfaceName: "Wiley Cochrane", syntaxDesc: "MeSH descriptors [mh], title/abstract/keyword [ti,ab,kw], wildcard *", hasAutoFetch: false },
  { key: "web_of_science", label: "Web of Science", interfaceName: "Clarivate WoS", syntaxDesc: "Topic field TS=(...), NEAR/x operators, quotation marks for exact phrases", hasAutoFetch: false },
  { key: "scopus", label: "Scopus", interfaceName: "Elsevier Scopus", syntaxDesc: "TITLE-ABS-KEY(...), W/n proximity operators, exact phrases in quotes", hasAutoFetch: false },
  { key: "cinahl", label: "CINAHL", interfaceName: "EBSCOhost", syntaxDesc: "Major headings (MH \"...\"), text fields TI or AB, Boolean AND/OR", hasAutoFetch: false },
  { key: "openalex", label: "OpenAlex", interfaceName: "OpenAlex API / Web", syntaxDesc: "Semantic concepts and inverted index title/abstract match queries", hasAutoFetch: false },
] as const;

export function PicoHypothesisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  // ── Stage Navigation State ──
  // Stage 1: Set up PICO | Stage 2: Review protocol | Stage 3: Generate search strings
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3>(1);
  const [genWarning, setGenWarning] = useState("");

  // ── Data queries ──
  const { data: pico, isLoading: picoLoading } = useQuery({
    queryKey: ["pico", projectId],
    queryFn: () => api.getPico(projectId!),
    enabled: !!projectId,
  });

  const { data: hyp } = useQuery({
    queryKey: ["hypothesis", projectId],
    queryFn: () => api.getHypothesis(projectId!),
    enabled: !!projectId,
  });

  const { data: criteria } = useQuery({
    queryKey: ["criteria", projectId],
    queryFn: () => api.getCriteria(projectId!),
    enabled: !!projectId,
  });

  const { data: searchStrings } = useQuery({
    queryKey: ["search-strings", projectId],
    queryFn: () => api.getSearchStrings(projectId!),
    enabled: !!projectId,
  });

  // ── Stage 1: Entry Method & Form State ──
  const [entryMethod, setEntryMethod] = useState<"upload" | "question" | "manual">("question");
  const [frameworkType, setFrameworkType] = useState<"diagnostic" | "intervention">("diagnostic");
  const [researchQuestionInput, setResearchQuestionInput] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [secondary, setSecondary] = useState<SecondaryHypothesis[]>([]);
  const [showHypothesesAccordion, setShowHypothesesAccordion] = useState(false);

  const [picoForm, setPicoForm] = useState({
    population: "",
    index_test: "",
    comparator: "",
    outcome: "",
    study_design: "",
  });

  // Tracking baseline for stale review / search string invalidation
  const [lastReviewedSnapshot, setLastReviewedSnapshot] = useState<string>("");
  const [lastSearchedSnapshot, setLastSearchedSnapshot] = useState<string>("");

  const currentPicoSnapshot = JSON.stringify({ picoForm, researchQuestion });

  // PICO Save status: idle | saving | saved | error
  const [picoSaveState, setPicoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [picoSaveError, setPicoSaveError] = useState<string>("");

  // Ambiguity notes & missing info flagged during extraction/generation
  const [extractionAmbiguities, setExtractionAmbiguities] = useState<string[]>([]);
  const [missingFieldsNotice, setMissingFieldsNotice] = useState<string[]>([]);

  // Method switch confirmation modal
  const [pendingMethod, setPendingMethod] = useState<"upload" | "question" | "manual" | null>(null);

  // Sync loaded PICO into local form state
  useEffect(() => {
    if (pico) {
      setPicoForm({
        population: pico.population || "",
        index_test: pico.index_test || "",
        comparator: pico.comparator || "",
        outcome: pico.outcome || "",
        study_design: pico.study_design || "",
      });
      // Infer framework type if intervention terminology is prevalent
      const combined = `${pico.index_test || ""} ${pico.comparator || ""}`.toLowerCase();
      if (combined.includes("therapy") || combined.includes("drug") || combined.includes("treatment") || combined.includes("placebo") || combined.includes("surgery")) {
        setFrameworkType("intervention");
      }
    }
  }, [pico]);

  // Sync loaded Hypothesis & Research Question
  useEffect(() => {
    if (hyp) {
      setHypothesis(hyp.hypothesis || "");
      if (hyp.generation_source && hyp.generation_source !== "llm" && hyp.hypothesis) {
        setGenWarning(hyp.generation_error || "Hypothesis was generated from a fallback template, not the LLM. Check API settings.");
      } else {
        setGenWarning("");
      }
      if (hyp.research_question) {
        setResearchQuestion(hyp.research_question);
        setResearchQuestionInput(hyp.research_question);
      }
      setSecondary(hyp.secondary_hypotheses || []);
    }
  }, [hyp]);

  const setPicoField = (k: string, v: string) =>
    setPicoForm((f) => ({ ...f, [k]: v }));

  // Save PICO & Continue to Review
  const handleSaveAndContinue = async () => {
    // Validation check: at least Population and Index Test / Intervention should have text
    if (!picoForm.population.trim() && !picoForm.index_test.trim()) {
      setPicoSaveError("Please provide at least a Population and Index Test / Intervention before continuing.");
      setPicoSaveState("error");
      return;
    }

    setPicoSaveState("saving");
    setPicoSaveError("");

    try {
      await Promise.all([
        api.updatePico(projectId!, picoForm),
        api.updateHypothesis(projectId!, {
          hypothesis,
          research_question: researchQuestion || researchQuestionInput,
          secondary_hypotheses: secondary,
        }),
      ]);

      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });

      setPicoSaveState("saved");
      setTimeout(() => {
        setPicoSaveState("idle");
        setCurrentStage(2);
      }, 700);
    } catch (err: any) {
      setPicoSaveState("error");
      setPicoSaveError(err.message || "Failed to save PICO data.");
    }
  };

  // Method switching with safe guard
  const handleSelectMethod = (target: "upload" | "question" | "manual") => {
    if (target === entryMethod) return;
    const hasPopulatedPico = Object.values(picoForm).some((v) => v.trim().length > 0);
    const hasActiveInput = researchQuestionInput.trim().length > 0;
    if (hasPopulatedPico || hasActiveInput) {
      setPendingMethod(target);
    } else {
      setEntryMethod(target);
    }
  };

  // ── Method A: Protocol File Upload ──
  const [extractionStatus, setExtractionStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [extractionConfidence, setExtractionConfidence] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProtocolUpload = async (file: File) => {
    setExtractionStatus("loading");
    setExtractionError("");
    setUploadedFileName(file.name);
    try {
      const result = await api.extractPico(projectId!, file);
      const newPico = {
        population: result.population || picoForm.population || "",
        index_test: result.index_test || picoForm.index_test || "",
        comparator: result.comparator || picoForm.comparator || "",
        outcome: result.outcome || picoForm.outcome || "",
        study_design: result.study_design || picoForm.study_design || "",
      };

      const newRq = result.research_question || researchQuestion || "";
      const newHyp = result.hypothesis || hypothesis || "";

      setPicoForm(newPico);
      if (newRq) {
        setResearchQuestion(newRq);
        setResearchQuestionInput(newRq);
      }
      if (newHyp) setHypothesis(newHyp);

      // Auto-fill Inclusion and Exclusion criteria from protocol
      let nextInclusion: Criterion[] = [];
      let nextExclusion: Criterion[] = [];

      if (Array.isArray(result.inclusion) && result.inclusion.length > 0) {
        nextInclusion = result.inclusion.map((item: any, idx: number) => {
          if (typeof item === "string") {
            return { id: `inc_${Date.now()}_${idx}`, text: item };
          }
          return { id: item.id || `inc_${Date.now()}_${idx}`, text: item.text || String(item) };
        });
      }

      if (Array.isArray(result.exclusion) && result.exclusion.length > 0) {
        nextExclusion = result.exclusion.map((item: any, idx: number) => {
          if (typeof item === "string") {
            return { id: `exc_${Date.now()}_${idx}`, text: item };
          }
          return { id: item.id || `exc_${Date.now()}_${idx}`, text: item.text || String(item) };
        });
      }

      // If criteria were not returned from document extraction, auto-draft from the newly extracted PICO
      if (nextInclusion.length === 0 && nextExclusion.length === 0 && (newPico.population || newPico.index_test)) {
        try {
          const generated = await api.generateCriteria(projectId!);
          if (generated.inclusion && generated.inclusion.length > 0) {
            nextInclusion = generated.inclusion;
          }
          if (generated.exclusion && generated.exclusion.length > 0) {
            nextExclusion = generated.exclusion;
          }
        } catch (e) {
          console.warn("Could not auto-generate criteria fallback:", e);
        }
      }

      if (nextInclusion.length > 0) {
        setInclusion(nextInclusion);
      }
      if (nextExclusion.length > 0) {
        setExclusion(nextExclusion);
      }

      setExtractionConfidence(result.extraction_confidence || "medium");
      setExtractionStatus("done");

      // Identify unextracted fields needing confirmation without fabricating
      const missing: string[] = [];
      if (!result.population) missing.push("Population / Participants (P)");
      if (!result.index_test) missing.push("Index Test / Intervention (I)");
      if (!result.comparator) missing.push("Comparator / Reference Standard (C)");
      if (!result.outcome) missing.push("Outcome / Primary Endpoint (O)");
      if (!result.study_design) missing.push("Study Design (S)");
      setMissingFieldsNotice(missing);

      // Persist to sync backend project
      api.updatePico(projectId!, newPico).catch(() => {});
      if (newRq || newHyp) {
        api.updateHypothesis(projectId!, {
          hypothesis: newHyp,
          research_question: newRq,
          secondary_hypotheses: secondary,
        }).catch(() => {});
      }
      if (nextInclusion.length > 0 || nextExclusion.length > 0) {
        api.updateCriteria(projectId!, { inclusion: nextInclusion, exclusion: nextExclusion }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });

      setReviewToast("Protocol loaded: PICO and eligibility criteria auto-filled.");
      setTimeout(() => setReviewToast(null), 4000);
    } catch (err: any) {
      setExtractionError(err.message || "Failed to process protocol file.");
      setExtractionStatus("error");
    }
  };

  // ── Method B: Single Question → Generate PICO ──
  const [isGeneratingPico, setIsGeneratingPico] = useState(false);
  const [generatePicoError, setGeneratePicoError] = useState<string>("");

  const handleGeneratePicoFromQuestion = async () => {
    const q = researchQuestionInput.trim();
    if (!q) return;

    setIsGeneratingPico(true);
    setGeneratePicoError("");
    setExtractionAmbiguities([]);
    setMissingFieldsNotice([]);

    try {
      const res = await api.generatePicoFromQuestion(projectId!, q, true);
      const newPico = {
        population: res.pico.population || "",
        index_test: res.pico.index_test || "",
        comparator: res.pico.comparator || "",
        outcome: res.pico.outcome || "",
        study_design: res.pico.study_design || "",
      };
      setPicoForm(newPico);
      setResearchQuestion(q);
      if (res.hypothesis) setHypothesis(res.hypothesis);
      if (res.secondary_hypotheses && res.secondary_hypotheses.length > 0) {
        setSecondary(
          res.secondary_hypotheses.map((txt) => ({ text: txt, type: "alternative", status: "pending" }))
        );
      }

      if (res.ambiguities && res.ambiguities.length > 0) {
        setExtractionAmbiguities(res.ambiguities);
      }
      if (res.missing_fields && res.missing_fields.length > 0) {
        setMissingFieldsNotice(res.missing_fields);
      }

      // Auto-draft eligibility criteria if currently empty
      if (inclusion.length === 0 && exclusion.length === 0 && (newPico.population || newPico.index_test)) {
        try {
          const generated = await api.generateCriteria(projectId!);
          if (generated.inclusion?.length) setInclusion(generated.inclusion);
          if (generated.exclusion?.length) setExclusion(generated.exclusion);
          queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
        } catch (e) {
          console.warn("Could not draft criteria from question PICO", e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
    } catch (err: any) {
      setGeneratePicoError(err.message || "Failed to generate PICO from research question.");
    } finally {
      setIsGeneratingPico(false);
    }
  };

  // ── Stage 2: Protocol Review State ──
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<any | null>(null);
  const [maxReviewers, setMaxReviewers] = useState<number>(4);
  const [dismissedFindingIds, setDismissedFindingIds] = useState<Set<string>>(new Set());
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [editingFindingText, setEditingFindingText] = useState<string>("");
  const [reviewToast, setReviewToast] = useState<string | null>(null);
  const [showPrismaChecklist, setShowPrismaChecklist] = useState<boolean>(false);
  const [isExportingProtocol, setIsExportingProtocol] = useState<boolean>(false);

  // Inclusion / Exclusion criteria state
  const [inclusion, setInclusion] = useState<Criterion[]>([]);
  const [exclusion, setExclusion] = useState<Criterion[]>([]);
  const [isDraftingCriteria, setIsDraftingCriteria] = useState(false);

  useEffect(() => {
    if (criteria) {
      setInclusion(criteria.inclusion || []);
      setExclusion(criteria.exclusion || []);
    }
  }, [criteria]);

  const criteriaSaveMutation = useMutation({
    mutationFn: () => api.updateCriteria(projectId!, { inclusion, exclusion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
    },
  });

  const handleDraftEligibilityCriteria = async () => {
    setIsDraftingCriteria(true);
    try {
      const res = await api.generateCriteria(projectId!);
      setInclusion(res.inclusion || []);
      setExclusion(res.exclusion || []);
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
      setReviewToast("Drafted eligibility criteria from confirmed PICO framework.");
      setTimeout(() => setReviewToast(null), 3000);
    } catch (err: any) {
      console.warn("Draft criteria error", err);
    } finally {
      setIsDraftingCriteria(false);
    }
  };

  const handleRunProtocolReview = async () => {
    setIsReviewLoading(true);
    try {
      const activePico = picoForm;
      const res = await api.deliberateProtocolStorm({
        pico: activePico,
        hypothesis,
        criteria: { inclusion, exclusion },
        research_question: researchQuestion || researchQuestionInput,
        topic: researchQuestion || researchQuestionInput || (activePico.population ? `${activePico.population} ${activePico.index_test}` : "clinical medicine"),
      });
      setReviewResult(res);
      setLastReviewedSnapshot(currentPicoSnapshot);
      setDismissedFindingIds(new Set());
    } catch (err: any) {
      console.warn("Protocol deliberation error", err);
    } finally {
      setIsReviewLoading(false);
    }
  };

  const isReviewOutOfDate = !!reviewResult && lastReviewedSnapshot !== currentPicoSnapshot;

  const handleAdoptSuggestion = async (sugg: any) => {
    const target = sugg.target_type;
    const txt = editingFindingId === sugg.id ? editingFindingText : sugg.suggested_text;

    if (target === "pico_outcome") {
      setPicoForm((prev) => ({ ...prev, outcome: txt }));
      api.updatePico(projectId!, { ...picoForm, outcome: txt }).catch(() => {});
    } else if (target === "pico_comparator") {
      setPicoForm((prev) => ({ ...prev, comparator: txt }));
      api.updatePico(projectId!, { ...picoForm, comparator: txt }).catch(() => {});
    } else if (target === "pico_index_test") {
      setPicoForm((prev) => ({ ...prev, index_test: txt }));
      api.updatePico(projectId!, { ...picoForm, index_test: txt }).catch(() => {});
    } else if (target === "pico_population") {
      setPicoForm((prev) => ({ ...prev, population: txt }));
      api.updatePico(projectId!, { ...picoForm, population: txt }).catch(() => {});
    } else if (target === "pico_study_design") {
      setPicoForm((prev) => ({ ...prev, study_design: txt }));
      api.updatePico(projectId!, { ...picoForm, study_design: txt }).catch(() => {});
    } else if (target === "criteria_inclusion" || target === "inclusion_criterion") {
      const updated = [...inclusion, { id: `crit-${Date.now()}`, text: txt }];
      setInclusion(updated);
      api.updateCriteria(projectId!, { inclusion: updated, exclusion }).catch(() => {});
    } else if (target === "criteria_exclusion" || target === "exclusion_criterion") {
      const updated = [...exclusion, { id: `crit-${Date.now()}`, text: txt }];
      setExclusion(updated);
      api.updateCriteria(projectId!, { inclusion, exclusion: updated }).catch(() => {});
    }

    setDismissedFindingIds((prev) => new Set([...prev, sugg.id]));
    setEditingFindingId(null);
    setReviewToast(`Applied recommendation: "${sugg.flaw_title || "Protocol refinement"}"`);
    setTimeout(() => setReviewToast(null), 3500);

    queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
    queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
  };

  const handleExportProtocolJson = async () => {
    setIsExportingProtocol(true);
    try {
      const activePico = picoForm;
      const exportData = await api.exportProtocol({
        pico: activePico,
        hypothesis,
        criteria: { inclusion, exclusion },
        research_question: researchQuestion || researchQuestionInput,
        topic: researchQuestion || researchQuestionInput || (activePico.population ? `${activePico.population} ${activePico.index_test}` : "clinical medicine"),
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `protocol-prisma2020-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setReviewToast("Downloaded PRISMA 2020 protocol specification (JSON).");
      setTimeout(() => setReviewToast(null), 4000);
    } catch (err) {
      console.error("[Export Protocol Error]", err);
    } finally {
      setIsExportingProtocol(false);
    }
  };

  // ── Stage 3: Search Strings State ──
  const [activeDb, setActiveDb] = useState<string>("pubmed");
  const [localSearchStrings, setLocalSearchStrings] = useState<Record<string, string>>({});
  const [manuallyEditedDbs, setManuallyEditedDbs] = useState<Set<string>>(new Set());
  const [copiedDb, setCopiedDb] = useState<string | null>(null);
  const [isGeneratingSearches, setIsGeneratingSearches] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [savedDbQuery, setSavedDbQuery] = useState<string | null>(null);

  // Sync loaded search strings into local state
  useEffect(() => {
    if (searchStrings?.strings) {
      setLocalSearchStrings((prev) => ({
        ...searchStrings.strings,
        ...prev,
      }));
    }
  }, [searchStrings]);

  const handleGenerateSearchStrings = async (forceOverwrite = false) => {
    if (!forceOverwrite && manuallyEditedDbs.size > 0) {
      setShowRegenConfirm(true);
      return;
    }
    setShowRegenConfirm(false);
    setIsGeneratingSearches(true);
    try {
      const res = await api.generateSearchStrings(projectId!);
      if (res?.strings) {
        setLocalSearchStrings(res.strings);
        setManuallyEditedDbs(new Set());
        setLastSearchedSnapshot(currentPicoSnapshot);
      }
      queryClient.invalidateQueries({ queryKey: ["search-strings", projectId] });
    } catch (err: any) {
      console.warn("Search generation error", err);
    } finally {
      setIsGeneratingSearches(false);
    }
  };

  const isSearchOutOfDate = Object.keys(localSearchStrings).length > 0 && lastSearchedSnapshot !== "" && lastSearchedSnapshot !== currentPicoSnapshot;

  const handleCopySearch = async (dbKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDb(dbKey);
      setTimeout(() => setCopiedDb(null), 2000);
    } catch {
      // clipboard fallback
    }
  };

  const handleSaveSearchString = (dbKey: string) => {
    setSavedDbQuery(dbKey);
    setTimeout(() => setSavedDbQuery(null), 2000);
  };

  // Validate balanced parentheses and quotes for search string
  const validateQuerySyntax = (q: string) => {
    let openParen = 0;
    let quoteCount = 0;
    for (const char of q) {
      if (char === "(") openParen++;
      else if (char === ")") openParen--;
      else if (char === '"') quoteCount++;
      if (openParen < 0) return { valid: false, error: "Unmatched closing parenthesis" };
    }
    if (openParen !== 0) return { valid: false, error: `${openParen} unclosed parenthesis` };
    if (quoteCount % 2 !== 0) return { valid: false, error: "Unclosed quotation mark" };
    return { valid: true, error: "" };
  };

  // Dynamic field labels based on framework terminology
  const fieldConfigs = [
    {
      key: "population",
      letter: "P",
      label: "Population / Target Participants",
      icon: Users,
      placeholder: "e.g., Patients with suspected hepatocellular carcinoma undergoing liver resection evaluation",
      help: "Patient cohort, disease condition, or clinical setting.",
    },
    {
      key: "index_test",
      letter: "I",
      label: frameworkType === "diagnostic" ? "Index Test / Imaging Modality" : "Intervention / Treatment",
      icon: Stethoscope,
      placeholder: frameworkType === "diagnostic"
        ? "e.g., Gadoxetic acid-enhanced liver MRI (EOB-MRI)"
        : "e.g., Catheter-directed mechanical thrombectomy",
      help: frameworkType === "diagnostic" ? "Test or imaging protocol under diagnostic evaluation." : "Active therapeutic intervention.",
    },
    {
      key: "comparator",
      letter: "C",
      label: frameworkType === "diagnostic" ? "Reference Standard / Baseline" : "Comparator / Control",
      icon: GitCompare,
      placeholder: frameworkType === "diagnostic"
        ? "e.g., Histopathological examination or multi-phase contrast CT"
        : "e.g., Best medical management or intravenous thrombolysis",
      help: frameworkType === "diagnostic" ? "Gold standard or comparative test." : "Control group or active comparator.",
    },
    {
      key: "outcome",
      letter: "O",
      label: "Outcome / Primary Endpoint",
      icon: Target,
      placeholder: "e.g., Diagnostic sensitivity, specificity, positive predictive value, and false-positive recall",
      help: "Primary clinical or diagnostic diagnostic efficacy metrics.",
    },
    {
      key: "study_design",
      letter: "S",
      label: "Study Design & Methods",
      icon: FlaskConical,
      placeholder: "e.g., Prospective or retrospective cross-sectional diagnostic accuracy studies",
      help: "Eligible study methodologies and trial designs.",
    },
  ];

  const currentDbMeta = DATABASES.find((d) => d.key === activeDb) || DATABASES[0];
  const activeQueryText = localSearchStrings[activeDb] || searchStrings?.strings?.[activeDb] || "";
  const syntaxCheck = validateQuerySyntax(activeQueryText);

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-[#4f444b] font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        
        {/* Navigation Breadcrumb */}
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#814d75] hover:text-[#3a0f34] transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Project Workspace
        </Link>

        {/* Page Title & Mission */}
        <div className="mb-6">
          <h1 className="text-3xl font-serif text-[#3a0f34] font-normal tracking-tight">
            Protocol Specification & Search Formulation
          </h1>
          <p className="text-sm text-[#62535d] mt-1 max-w-2xl leading-relaxed">
            Formulate your PICO framework, conduct multi-perspective protocol reviews, and generate syntax-calibrated search strategies.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            3-STEP NUMBERED STAGE INDICATOR
            ═══════════════════════════════════════════════════════════════ */}
        <nav aria-label="Workflow Steps" className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStage(1)}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                currentStage === 1
                  ? "bg-[#ffffff] border-[#814d75] shadow-sm ring-1 ring-[#814d75]"
                  : "bg-[#ffffff]/60 border-[#d2c2cb] hover:bg-[#ffffff]"
              }`}
            >
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  currentStage === 1
                    ? "bg-[#3a0f34] text-[#fbf9f4]"
                    : Object.values(picoForm).some((v) => v.trim())
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#eee7ec] text-[#62535d]"
                }`}
              >
                1
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider block text-[#3a0f34]">
                  Stage 1
                </span>
                <span className="text-sm font-semibold block truncate text-[#4f444b]">
                  Set Up Your PICO
                </span>
              </div>
            </button>

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => setCurrentStage(2)}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                currentStage === 2
                  ? "bg-[#ffffff] border-[#814d75] shadow-sm ring-1 ring-[#814d75]"
                  : "bg-[#ffffff]/60 border-[#d2c2cb] hover:bg-[#ffffff]"
              }`}
            >
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  currentStage === 2
                    ? "bg-[#3a0f34] text-[#fbf9f4]"
                    : reviewResult
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#eee7ec] text-[#62535d]"
                }`}
              >
                2
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider block text-[#3a0f34]">
                  Stage 2
                </span>
                <span className="text-sm font-semibold block truncate text-[#4f444b]">
                  Review Your Protocol
                </span>
              </div>
            </button>

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => setCurrentStage(3)}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                currentStage === 3
                  ? "bg-[#ffffff] border-[#814d75] shadow-sm ring-1 ring-[#814d75]"
                  : "bg-[#ffffff]/60 border-[#d2c2cb] hover:bg-[#ffffff]"
              }`}
            >
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  currentStage === 3
                    ? "bg-[#3a0f34] text-[#fbf9f4]"
                    : Object.keys(localSearchStrings).length > 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#eee7ec] text-[#62535d]"
                }`}
              >
                3
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider block text-[#3a0f34]">
                  Stage 3
                </span>
                <span className="text-sm font-semibold block truncate text-[#4f444b]">
                  Generate Search Strings
                </span>
              </div>
            </button>
          </div>
        </nav>

        {/* ═══════════════════════════════════════════════════════════════
            STAGE 1 — SET UP YOUR PICO
            ═══════════════════════════════════════════════════════════════ */}
        {currentStage === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Entry Method Selector */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#d2c2cb]/40">
                <div>
                  <h2 className="text-base font-serif font-bold text-[#3a0f34]">
                    Choose PICO Entry Method
                  </h2>
                  <p className="text-xs text-[#62535d]">
                    Select how you wish to initiate your PICO specification. All three methods populate the shared form below.
                  </p>
                </div>
                
                {/* Framework Terminology Selector */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto bg-[#fbf9f4] border border-[#d2c2cb] p-1 rounded-lg">
                  <span className="text-[11px] font-bold text-[#62535d] px-2">Framework:</span>
                  <button
                    type="button"
                    onClick={() => setFrameworkType("diagnostic")}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                      frameworkType === "diagnostic"
                        ? "bg-[#3a0f34] text-[#fbf9f4]"
                        : "text-[#62535d] hover:text-[#3a0f34]"
                    }`}
                  >
                    Diagnostic Accuracy
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameworkType("intervention")}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                      frameworkType === "intervention"
                        ? "bg-[#3a0f34] text-[#fbf9f4]"
                        : "text-[#62535d] hover:text-[#3a0f34]"
                    }`}
                  >
                    Intervention / Therapy
                  </button>
                </div>
              </div>

              {/* 3-Option Segmented Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <button
                  type="button"
                  id="tab-method-question"
                  onClick={() => handleSelectMethod("question")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    entryMethod === "question"
                      ? "border-[#3a0f34] bg-[#3a0f34]/5 shadow-xs"
                      : "border-[#d2c2cb] hover:border-[#814d75] bg-[#ffffff]"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${entryMethod === "question" ? "bg-[#3a0f34] text-[#fbf9f4]" : "bg-[#eee7ec] text-[#62535d]"}`}>
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[#3a0f34]">Method B</span>
                    <span className="text-xs font-medium text-[#4f444b]">Enter Research Question</span>
                  </div>
                </button>

                <button
                  type="button"
                  id="tab-method-upload"
                  onClick={() => handleSelectMethod("upload")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    entryMethod === "upload"
                      ? "border-[#3a0f34] bg-[#3a0f34]/5 shadow-xs"
                      : "border-[#d2c2cb] hover:border-[#814d75] bg-[#ffffff]"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${entryMethod === "upload" ? "bg-[#3a0f34] text-[#fbf9f4]" : "bg-[#eee7ec] text-[#62535d]"}`}>
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[#3a0f34]">Method A</span>
                    <span className="text-xs font-medium text-[#4f444b]">Upload a Protocol</span>
                  </div>
                </button>

                <button
                  type="button"
                  id="tab-method-manual"
                  onClick={() => handleSelectMethod("manual")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    entryMethod === "manual"
                      ? "border-[#3a0f34] bg-[#3a0f34]/5 shadow-xs"
                      : "border-[#d2c2cb] hover:border-[#814d75] bg-[#ffffff]"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${entryMethod === "manual" ? "bg-[#3a0f34] text-[#fbf9f4]" : "bg-[#eee7ec] text-[#62535d]"}`}>
                    <Edit3 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[#3a0f34]">Method C</span>
                    <span className="text-xs font-medium text-[#4f444b]">Fill PICO Manually</span>
                  </div>
                </button>
              </div>

              {/* METHOD B CONTROLS: Enter a research question */}
              {entryMethod === "question" && (
                <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 text-[#814d75]" />
                      Clinical Research Question
                    </label>
                    <span className="text-[11px] text-[#62535d]">Single question input</span>
                  </div>
                  <textarea
                    id="input-research-question"
                    rows={3}
                    className="w-full bg-[#ffffff] border border-[#d2c2cb] rounded-lg p-3 text-sm text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75] placeholder:text-[#81737b]"
                    placeholder="e.g., Is gadoxetic acid-enhanced MRI more accurate than contrast-enhanced CT for detecting liver metastases in patients with colorectal cancer?"
                    value={researchQuestionInput}
                    onChange={(e) => {
                      setResearchQuestionInput(e.target.value);
                      setResearchQuestion(e.target.value);
                    }}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[#62535d]">
                      Generates editable PICO fields below without altering saved search strings.
                    </span>
                    <button
                      type="button"
                      id="btn-generate-pico"
                      onClick={handleGeneratePicoFromQuestion}
                      disabled={isGeneratingPico || !researchQuestionInput.trim()}
                      className="px-4 py-2 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isGeneratingPico ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Generating PICO...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-[#ffdea6]" />
                          <span>Generate PICO</span>
                        </>
                      )}
                    </button>
                  </div>

                  {generatePicoError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{generatePicoError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* METHOD A CONTROLS: Upload a protocol */}
              {entryMethod === "upload" && (
                <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#814d75]" />
                      Upload Protocol Document
                    </label>
                    <span className="text-[11px] text-[#62535d]">PDF, DOCX, TXT, MD, RTF</span>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProtocolUpload(file);
                    }}
                    className={`rounded-xl border-2 border-dashed p-6 text-center transition-all flex flex-col items-center justify-center gap-2 ${
                      isDragging
                        ? "border-[#3a0f34] bg-[#eee7ec]"
                        : "border-[#d2c2cb] bg-[#ffffff] hover:border-[#814d75]"
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-[#eee7ec] flex items-center justify-center text-[#3a0f34]">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#3a0f34]">
                        {uploadedFileName || "Click to browse or drag protocol file here"}
                      </p>
                      <p className="text-[11px] text-[#62535d] mt-0.5">
                        Extracts available PICO details and leaves unstated fields blank.
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProtocolUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={extractionStatus === "loading"}
                      className="mt-1 px-3.5 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      {extractionStatus === "loading" ? "Analyzing Protocol..." : "Select Document File"}
                    </button>
                  </div>

                  {extractionStatus === "loading" && (
                    <div className="p-3 bg-[#eee7ec] border border-[#d2c2cb] rounded-lg text-xs text-[#3a0f34] flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" />
                      <span>Parsing sections and extracting verified protocol elements...</span>
                    </div>
                  )}

                  {extractionStatus === "done" && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Protocol extracted from <strong>{uploadedFileName}</strong>. Fields populated below.</span>
                      </div>
                      {extractionConfidence && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {extractionConfidence} confidence
                        </span>
                      )}
                    </div>
                  )}

                  {extractionStatus === "error" && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{extractionError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* METHOD C: Fill manually announcement */}
              {entryMethod === "manual" && (
                <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl p-3 text-xs text-[#62535d] flex items-center gap-2">
                  <Info className="h-4 w-4 text-[#814d75] shrink-0" />
                  <span>Manual entry active. No automated AI generation required. Populate the PICO fields directly below.</span>
                </div>
              )}

              {/* Ambiguity & Missing Information Notices */}
              {(extractionAmbiguities.length > 0 || missingFieldsNotice.length > 0) && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Ambiguities & Unspecified Elements Requiring Confirmation</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 pl-1">
                    {missingFieldsNotice.map((m, idx) => (
                      <li key={`missing-${idx}`}>
                        <strong>Missing Field:</strong> {m} was not stated and left blank.
                      </li>
                    ))}
                    {extractionAmbiguities.map((a, idx) => (
                      <li key={`ambiguity-${idx}`}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                SHARED EDITABLE PICO FORM
                ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#d2c2cb]/50">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#3a0f34]">
                    Shared PICO Specification
                  </h3>
                  <p className="text-xs text-[#62535d]">
                    One consolidated record populated from your chosen entry method. Review and edit all fields.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]">
                  {frameworkType === "diagnostic" ? "Diagnostic Accuracy" : "Intervention / Therapy"}
                </span>
              </div>

              {/* Original Research Question (Always accessible without asking user to re-enter) */}
              <div>
                <label className="block text-xs font-bold text-[#3a0f34] uppercase tracking-wider mb-1">
                  Primary Research Question
                </label>
                <input
                  type="text"
                  className="w-full bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg px-3 py-2 text-sm text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                  placeholder="e.g., In patients with colorectal cancer, does MRI demonstrate higher sensitivity than CT for liver metastases?"
                  value={researchQuestion}
                  onChange={(e) => {
                    setResearchQuestion(e.target.value);
                    setResearchQuestionInput(e.target.value);
                  }}
                />
              </div>

              {/* 5 PICO Fields */}
              <div className="space-y-4">
                {fieldConfigs.map((field) => {
                  const Icon = field.icon;
                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#3a0f34] flex items-center gap-1.5">
                          <span className="h-5 w-5 rounded bg-[#3a0f34]/10 text-[#3a0f34] inline-flex items-center justify-center font-bold text-[11px]">
                            {field.letter}
                          </span>
                          <span>{field.label}</span>
                        </label>
                        <span className="text-[11px] text-[#81737b]">{field.help}</span>
                      </div>
                      <textarea
                        rows={2}
                        className="w-full bg-[#ffffff] border border-[#d2c2cb] rounded-lg p-2.5 text-sm text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75] placeholder:text-[#81737b]/60"
                        placeholder={field.placeholder}
                        value={(picoForm as any)[field.key] || ""}
                        onChange={(e) => setPicoField(field.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Optional Expandable Accordion: Research Hypotheses */}
              <div className="border border-[#d2c2cb] rounded-xl overflow-hidden bg-[#fbf9f4]">
                <button
                  type="button"
                  onClick={() => setShowHypothesesAccordion(!showHypothesesAccordion)}
                  className="w-full px-4 py-3 text-left font-bold text-xs text-[#3a0f34] flex items-center justify-between cursor-pointer hover:bg-[#eee7ec]/50"
                >
                  <span className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-[#814d75]" />
                    <span>Hypotheses & Falsifiable Claims (Optional)</span>
                    {hypothesis && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">Configured</span>}
                  </span>
                  {showHypothesesAccordion ? (
                    <ChevronDown className="h-4 w-4 text-[#814d75]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#814d75]" />
                  )}
                </button>

                {showHypothesesAccordion && (
                  <div className="p-4 border-t border-[#d2c2cb] space-y-4 bg-[#ffffff]">
                    {genWarning && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-xs text-amber-800">{genWarning}</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-[#3a0f34] mb-1">
                        Primary Alternative Hypothesis (H₁)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg px-3 py-2 text-sm text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                        placeholder="e.g., Gadoxetic acid-enhanced MRI provides significantly superior sensitivity compared to contrast CT."
                        value={hypothesis}
                        onChange={(e) => setHypothesis(e.target.value)}
                      />
                    </div>

                    {/* Secondary Hypotheses */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-[#3a0f34]">
                          Secondary Hypotheses & Sub-claims
                        </label>
                        <button
                          type="button"
                          onClick={() => setSecondary([...secondary, { text: "", type: "alternative", status: "pending" }])}
                          className="text-xs text-[#814d75] hover:text-[#3a0f34] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Add Hypothesis
                        </button>
                      </div>

                      {secondary.length === 0 ? (
                        <p className="text-xs text-[#81737b] italic">No secondary hypotheses defined.</p>
                      ) : (
                        <div className="space-y-2">
                          {secondary.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                className="flex-1 bg-[#ffffff] border border-[#d2c2cb] rounded-lg px-3 py-1.5 text-xs text-[#4f444b]"
                                placeholder="Secondary hypothesis..."
                                value={item.text}
                                onChange={(e) => {
                                  const updated = [...secondary];
                                  updated[idx] = { ...updated[idx], text: e.target.value };
                                  setSecondary(updated);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setSecondary(secondary.filter((_, i) => i !== idx))}
                                className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                                title="Remove hypothesis"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Save & Continue Primary Action */}
              <div className="pt-3 border-t border-[#d2c2cb]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  {picoSaveState === "saved" && (
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 animate-in fade-in">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      PICO saved successfully. Transitioning to Protocol Review...
                    </span>
                  )}
                  {picoSaveState === "error" && (
                    <span className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      {picoSaveError}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-save-continue-review"
                  onClick={handleSaveAndContinue}
                  disabled={picoSaveState === "saving"}
                  className="px-6 py-2.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-50"
                >
                  {picoSaveState === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[#ffdea6]" />
                      <span>Saving PICO...</span>
                    </>
                  ) : (
                    <>
                      <span>Save & Continue to Review</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STAGE 2 — REVIEW YOUR PROTOCOL
            ═══════════════════════════════════════════════════════════════ */}
        {currentStage === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header & Main Review Action */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#d2c2cb]/50">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#3a0f34]">
                    Protocol Multi-Perspective Review
                  </h2>
                  <p className="text-xs text-[#62535d] mt-0.5">
                    Dynamically evaluates study design, eligibility criteria, and methodological traps before literature screening.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-[#62535d]">
                    <span className="font-semibold">Reviewer limit:</span>
                    <select
                      value={maxReviewers}
                      onChange={(e) => setMaxReviewers(Number(e.target.value))}
                      className="bg-[#fbf9f4] border border-[#d2c2cb] rounded px-2 py-1 text-xs text-[#3a0f34] font-medium"
                    >
                      <option value={3}>3 AI Reviewers</option>
                      <option value={4}>4 AI Reviewers</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    id="btn-review-protocol"
                    onClick={handleRunProtocolReview}
                    disabled={isReviewLoading}
                    className="px-5 py-2 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                  >
                    {isReviewLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#ffdea6]" />
                        <span>Running AI Review...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-[#ffdea6]" />
                        <span>Review My Protocol</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Clear AI Perspective Disclosure */}
              <div className="p-3 bg-[#eee7ec]/60 border border-[#d2c2cb] rounded-xl text-xs text-[#62535d] flex items-start gap-2.5">
                <Info className="h-4 w-4 text-[#814d75] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="text-[#3a0f34]">AI Methodology Perspectives:</strong> The reviewer roles below represent simulated clinical and statistical perspectives configured to uncover study design flaws. They do not constitute independent human peer review or establish scientific validity.
                </div>
              </div>

              {/* Out of Date Banner */}
              {isReviewOutOfDate && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>PICO framework has been edited since last review. Findings may be out of date.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunProtocolReview}
                    className="underline font-bold text-amber-900 hover:text-[#3a0f34] cursor-pointer"
                  >
                    Re-run Review
                  </button>
                </div>
              )}

              {/* Selected Dynamic Reviewer Roles & Relevance Explanations */}
              {reviewResult?.personas && reviewResult.personas.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#3a0f34]">
                    Selected AI Reviewer Panel ({reviewResult.personas.length} Roles)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {reviewResult.personas.map((p: any) => (
                      <div
                        key={p.id || p.role}
                        className="p-3 rounded-xl border border-[#d2c2cb] bg-[#fbf9f4] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#3a0f34] flex items-center gap-1.5">
                            <span>{p.avatar || "🩺"}</span>
                            <span>{p.role || p.name}</span>
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3a0f34]/10 text-[#3a0f34]">
                            AI Perspective
                          </span>
                        </div>
                        <p className="text-xs text-[#62535d] leading-relaxed">
                          <strong className="text-[#4f444b]">Why selected:</strong> {p.relevance_reason || p.focus || "Clinical domain expert."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                CONSOLIDATED FINDINGS (4 BUCKETS)
                ═══════════════════════════════════════════════════════════════ */}
            {reviewResult && (
              <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-[#d2c2cb]/50">
                  <div>
                    <h3 className="text-base font-serif font-bold text-[#3a0f34]">
                      Consolidated Protocol Findings
                    </h3>
                    <p className="text-xs text-[#62535d]">
                      Actionable findings partitioned into clinical and methodological categories. Accept, edit, or dismiss suggestions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#3a0f34]">Rigor Score:</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#3a0f34] text-[#fbf9f4]">
                      {reviewResult.rigor_score || 85}/100
                    </span>
                  </div>
                </div>

                {/* 4 Distinct Buckets */}
                <div className="space-y-5">
                  
                  {/* Bucket 1: Missing or Ambiguous Information */}
                  <FindingsBucketCard
                    title="1. Missing or Ambiguous Information"
                    badge="Clarification"
                    badgeColor="amber"
                    items={reviewResult.findings_by_category?.missing_ambiguous || []}
                    dismissedIds={dismissedFindingIds}
                    editingId={editingFindingId}
                    editingText={editingFindingText}
                    onStartEdit={(id, text) => {
                      setEditingFindingId(id);
                      setEditingFindingText(text);
                    }}
                    onCancelEdit={() => setEditingFindingId(null)}
                    onChangeEditText={(val) => setEditingFindingText(val)}
                    onAccept={handleAdoptSuggestion}
                    onDismiss={(id) => setDismissedFindingIds((prev) => new Set([...prev, id]))}
                  />

                  {/* Bucket 2: Conflicting Eligibility Criteria */}
                  <FindingsBucketCard
                    title="2. Conflicting Eligibility Criteria"
                    badge="Criteria Conflict"
                    badgeColor="purple"
                    items={reviewResult.findings_by_category?.conflicting_criteria || []}
                    dismissedIds={dismissedFindingIds}
                    editingId={editingFindingId}
                    editingText={editingFindingText}
                    onStartEdit={(id, text) => {
                      setEditingFindingId(id);
                      setEditingFindingText(text);
                    }}
                    onCancelEdit={() => setEditingFindingId(null)}
                    onChangeEditText={(val) => setEditingFindingText(val)}
                    onAccept={handleAdoptSuggestion}
                    onDismiss={(id) => setDismissedFindingIds((prev) => new Set([...prev, id]))}
                  />

                  {/* Bucket 3: Study-Design or Methodological Concerns */}
                  <FindingsBucketCard
                    title="3. Study-Design or Methodological Concerns"
                    badge="Methodology"
                    badgeColor="red"
                    items={reviewResult.findings_by_category?.methodological_concerns || []}
                    dismissedIds={dismissedFindingIds}
                    editingId={editingFindingId}
                    editingText={editingFindingText}
                    onStartEdit={(id, text) => {
                      setEditingFindingId(id);
                      setEditingFindingText(text);
                    }}
                    onCancelEdit={() => setEditingFindingId(null)}
                    onChangeEditText={(val) => setEditingFindingText(val)}
                    onAccept={handleAdoptSuggestion}
                    onDismiss={(id) => setDismissedFindingIds((prev) => new Set([...prev, id]))}
                  />

                  {/* Bucket 4: Search-Relevant Concepts and Omissions */}
                  <FindingsBucketCard
                    title="4. Search-Relevant Concepts and Omissions"
                    badge="Search Terms"
                    badgeColor="blue"
                    items={reviewResult.findings_by_category?.search_omissions || []}
                    dismissedIds={dismissedFindingIds}
                    editingId={editingFindingId}
                    editingText={editingFindingText}
                    onStartEdit={(id, text) => {
                      setEditingFindingId(id);
                      setEditingFindingText(text);
                    }}
                    onCancelEdit={() => setEditingFindingId(null)}
                    onChangeEditText={(val) => setEditingFindingText(val)}
                    onAccept={handleAdoptSuggestion}
                    onDismiss={(id) => setDismissedFindingIds((prev) => new Set([...prev, id]))}
                  />
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                ELIGIBILITY CRITERIA REVIEW & EDITING
                ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d2c2cb]/50">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#3a0f34]">
                    Eligibility Criteria (Inclusion & Exclusion)
                  </h3>
                  <p className="text-xs text-[#62535d]">
                    Define precise criteria governing study inclusion and reason codes for screening exclusion.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-draft-criteria"
                  onClick={handleDraftEligibilityCriteria}
                  disabled={isDraftingCriteria}
                  className="px-3.5 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isDraftingCriteria ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#814d75]" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#814d75]" />
                  )}
                  <span>Draft Eligibility Criteria</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Inclusion criteria */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                      Inclusion Criteria ({inclusion.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setInclusion([...inclusion, { id: `inc-${Date.now()}`, text: "" }])}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Add Criterion
                    </button>
                  </div>
                  {inclusion.length === 0 ? (
                    <p className="text-xs text-[#81737b] italic p-3 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg">No inclusion criteria set. Click "Draft Eligibility Criteria" or add manually.</p>
                  ) : (
                    <div className="space-y-2">
                      {inclusion.map((crit, idx) => (
                        <div key={crit.id || idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-[#ffffff] border border-[#d2c2cb] rounded-lg px-3 py-1.5 text-xs text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                            value={crit.text}
                            onChange={(e) => {
                              const updated = [...inclusion];
                              updated[idx] = { ...updated[idx], text: e.target.value };
                              setInclusion(updated);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setInclusion(inclusion.filter((_, i) => i !== idx))}
                            className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exclusion criteria */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                      Exclusion Criteria ({exclusion.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setExclusion([...exclusion, { id: `exc-${Date.now()}`, text: "" }])}
                      className="text-xs text-rose-700 hover:text-rose-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Add Criterion
                    </button>
                  </div>
                  {exclusion.length === 0 ? (
                    <p className="text-xs text-[#81737b] italic p-3 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg">No exclusion criteria set. Click "Draft Eligibility Criteria" or add manually.</p>
                  ) : (
                    <div className="space-y-2">
                      {exclusion.map((crit, idx) => (
                        <div key={crit.id || idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-[#ffffff] border border-[#d2c2cb] rounded-lg px-3 py-1.5 text-xs text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                            value={crit.text}
                            onChange={(e) => {
                              const updated = [...exclusion];
                              updated[idx] = { ...updated[idx], text: e.target.value };
                              setExclusion(updated);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setExclusion(exclusion.filter((_, i) => i !== idx))}
                            className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => criteriaSaveMutation.mutate()}
                  className="px-4 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="h-3.5 w-3.5 text-[#814d75]" />
                  <span>Save Criteria Changes</span>
                </button>
              </div>
            </div>

            {/* Expandable Secondary Tools: PRISMA Checklist & Protocol Export */}
            <div className="border border-[#d2c2cb] rounded-xl overflow-hidden bg-[#fbf9f4]">
              <button
                type="button"
                onClick={() => setShowPrismaChecklist(!showPrismaChecklist)}
                className="w-full px-4 py-3 text-left font-bold text-xs text-[#3a0f34] flex items-center justify-between cursor-pointer hover:bg-[#eee7ec]/50"
              >
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-[#814d75]" />
                  <span>PRISMA 2020 Protocol Validation & Export (Secondary Tools)</span>
                </span>
                {showPrismaChecklist ? (
                  <ChevronDown className="h-4 w-4 text-[#814d75]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#814d75]" />
                )}
              </button>

              {showPrismaChecklist && (
                <div className="p-4 border-t border-[#d2c2cb] space-y-4 bg-[#ffffff]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#62535d]">
                      PRISMA 2020 protocol checklist items automatically verified against your current specification.
                    </p>
                    <button
                      type="button"
                      onClick={handleExportProtocolJson}
                      disabled={isExportingProtocol}
                      className="px-3.5 py-1.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {isExportingProtocol ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-[#ffdea6]" />}
                      <span>Export Protocol (JSON)</span>
                    </button>
                  </div>

                  {reviewResult?.prisma_conformance?.checklist && (
                    <div className="space-y-1.5">
                      {reviewResult.prisma_conformance.checklist.map((item: any) => (
                        <div
                          key={item.item_id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#fbf9f4] border border-[#d2c2cb] text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#3a0f34]">{item.item_number}.</span>
                            <span className="font-medium text-[#4f444b]">{item.name}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.passed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {item.passed ? "Conformant" : "Check Needed"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Continue to Stage 3 */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage(1)}
                className="px-4 py-2 border border-[#d2c2cb] text-[#62535d] hover:bg-[#eee7ec] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to PICO Setup</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentStage(3)}
                className="px-5 py-2.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <span>Continue to Search Generation</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STAGE 3 — GENERATE SEARCH STRINGS
            ═══════════════════════════════════════════════════════════════ */}
        {currentStage === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header & Primary Action */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#d2c2cb]/50">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#3a0f34]">
                    Database-Specific Search Formulation
                  </h2>
                  <p className="text-xs text-[#62535d] mt-0.5">
                    Generates syntax-adapted search queries across 9 academic databases using confirmed PICO elements.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-generate-search-strings"
                    onClick={() => handleGenerateSearchStrings(false)}
                    disabled={isGeneratingSearches}
                    className="px-6 py-2.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isGeneratingSearches ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#ffdea6]" />
                        <span>Generating Strategies...</span>
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 text-[#ffdea6]" />
                        <span>Generate Search Strings</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Clarification banner: Strategy generation vs running search */}
              <div className="p-3 bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl text-xs text-[#62535d] flex items-center gap-2.5">
                <Info className="h-4 w-4 text-[#814d75] shrink-0" />
                <span>
                  <strong>Search Strategy Generation:</strong> Formulates and validates queries for each target database interface. Does <em>not</em> execute live searches automatically.
                </span>
              </div>

              {/* Stale Warning Banner */}
              {isSearchOutOfDate && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>PICO framework was modified since these strategies were generated. Manual edits are preserved below.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateSearchStrings(false)}
                    className="underline font-bold text-amber-900 hover:text-[#3a0f34] cursor-pointer"
                  >
                    Refresh Queries
                  </button>
                </div>
              )}
            </div>

            {/* Regeneration Confirmation Modal */}
            {showRegenConfirm && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-3 shadow-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">Regenerate Search Strategies?</h4>
                    <p className="mt-1 leading-relaxed">
                      You have manually edited search strings for: <strong>{[...manuallyEditedDbs].join(", ")}</strong>. Regenerating will overwrite all strategies with fresh PICO-derived queries.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowRegenConfirm(false)}
                    className="px-3 py-1.5 bg-[#ffffff] border border-[#d2c2cb] rounded-lg text-xs font-semibold text-[#62535d] hover:bg-[#eee7ec]"
                  >
                    Cancel (Keep My Edits)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateSearchStrings(true)}
                    className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-[#ffffff] rounded-lg text-xs font-bold"
                  >
                    Overwrite All Strategies
                  </button>
                </div>
              </div>
            )}

            {/* 9 Database Tabs & Query Editor */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-5">
              
              {/* Tab Bar (9 databases) */}
              <div className="border-b border-[#d2c2cb] pb-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {DATABASES.map((db) => {
                    const isEdited = manuallyEditedDbs.has(db.key);
                    const isCurrent = activeDb === db.key;
                    return (
                      <button
                        key={db.key}
                        type="button"
                        onClick={() => setActiveDb(db.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isCurrent
                            ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                            : "bg-[#fbf9f4] text-[#62535d] hover:bg-[#eee7ec] hover:text-[#3a0f34]"
                        }`}
                      >
                        <span>{db.label}</span>
                        {isEdited && (
                          <span className={`h-1.5 w-1.5 rounded-full ${isCurrent ? "bg-[#ffdea6]" : "bg-[#814d75]"}`} title="Manually edited" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Tab Header & Syntax Guide */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#fbf9f4] border border-[#d2c2cb]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#3a0f34]">{currentDbMeta.label}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#eee7ec] text-[#62535d]">
                      {currentDbMeta.interfaceName}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#62535d] mt-0.5">
                    Syntax: {currentDbMeta.syntaxDesc}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {syntaxCheck.valid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      <Check className="h-3 w-3" /> Syntax Balanced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                      <AlertOctagon className="h-3 w-3" /> {syntaxCheck.error}
                    </span>
                  )}
                </div>
              </div>

              {/* Query Textarea & Guidance */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                
                {/* Editor Column */}
                <div className="lg:col-span-2 space-y-3">
                  <div className="relative">
                    <textarea
                      rows={8}
                      className="w-full font-mono text-xs p-3.5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75] leading-relaxed resize-y"
                      value={activeQueryText}
                      placeholder={`Click "Generate Search Strings" above to produce calibrated syntax for ${currentDbMeta.label}...`}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLocalSearchStrings((prev) => ({ ...prev, [activeDb]: val }));
                        setManuallyEditedDbs((prev) => new Set([...prev, activeDb]));
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopySearch(activeDb, activeQueryText)}
                        disabled={!activeQueryText}
                        className="px-3.5 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {copiedDb === activeDb ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-[#814d75]" />}
                        <span>{copiedDb === activeDb ? "Copied Strategy" : "Copy Query"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveSearchString(activeDb)}
                        className="px-3.5 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Save className="h-3.5 w-3.5 text-[#814d75]" />
                        <span>{savedDbQuery === activeDb ? "Saved Query!" : "Save Query"}</span>
                      </button>
                    </div>

                    {manuallyEditedDbs.has(activeDb) && (
                      <span className="text-[11px] font-semibold text-[#814d75] bg-[#eee7ec] px-2 py-0.5 rounded">
                        Manual edit preserved
                      </span>
                    )}
                  </div>
                </div>

                {/* PRESS Search Review Guidance Column */}
                <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#3a0f34] flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#814d75]" />
                    <span>PRESS Peer Review Guidelines</span>
                  </h4>
                  <p className="text-[11px] text-[#62535d] leading-relaxed">
                    Evaluate strategy quality against standard systematic search criteria before executing searches:
                  </p>
                  <ul className="text-xs space-y-2 text-[#4f444b]">
                    <li className="flex items-start gap-1.5">
                      <span className="text-[#814d75] font-bold">•</span>
                      <span><strong>Translation:</strong> Verify syntax operators (e.g. [Mesh] vs /, .mp.) match the target interface.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-[#814d75] font-bold">•</span>
                      <span><strong>Boolean Logic:</strong> Confirm AND connects distinct PICO concepts; OR connects internal synonyms.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-[#814d75] font-bold">•</span>
                      <span><strong>Free-Text Coverage:</strong> Truncate root words (e.g. tomosynth*) to capture plural or derivative forms.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-[#814d75] font-bold">•</span>
                      <span><strong>Controlled Terms:</strong> Check whether subject headings are exploded where broad coverage is required.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Literature Import Card (Distinct from query formulation) */}
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#3a0f34]">
                    Run Literature Search & Import Studies
                  </h3>
                  <p className="text-xs text-[#62535d]">
                    Ready to populate your screening library? Import references from file exports or PubMed auto-fetch.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-4 py-2 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FileUp className="h-4 w-4 text-[#814d75]" />
                    <span>Import Reference Files (.ris, .bib, .xml)</span>
                  </button>
                </div>
              </div>

              {fetchResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                  {fetchResult}
                </div>
              )}
            </div>

            {/* Back to Step 2 Navigation */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage(2)}
                className="px-4 py-2 border border-[#d2c2cb] text-[#62535d] hover:bg-[#eee7ec] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Protocol Review</span>
              </button>

              <Link
                to={`/projects/${projectId}/screening`}
                className="px-5 py-2.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
              >
                <span>Proceed to Study Screening</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            GLOBAL MODALS & TOAST NOTIFICATIONS
            ═══════════════════════════════════════════════════════════════ */}

        {/* Method Switch Confirmation Dialog */}
        {pendingMethod && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-serif font-bold text-[#3a0f34]">
                    Switch PICO Entry Method?
                  </h4>
                  <p className="text-xs text-[#62535d] mt-0.5">
                    You have existing inputs in your current method.
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#4f444b] leading-relaxed">
                Switching to <strong>{pendingMethod === "upload" ? "Protocol Upload" : pendingMethod === "question" ? "Research Question" : "Manual Entry"}</strong> will open that input control. Your shared PICO form values below will be preserved.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#d2c2cb]/50">
                <button
                  type="button"
                  onClick={() => setPendingMethod(null)}
                  className="px-3.5 py-1.5 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#62535d] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Stay in Current Method
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMethod(pendingMethod);
                    setPendingMethod(null);
                  }}
                  className="px-4 py-1.5 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-lg text-xs font-bold cursor-pointer"
                >
                  Switch Method
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reference Import Modal */}
        {projectId && (
          <ReferenceImportModal
            projectId={projectId}
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={(count, source) => {
              queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
              setFetchResult(`Successfully imported ${count} references from ${source}`);
            }}
          />
        )}

        {/* Floating Toast Notification */}
        {reviewToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#3a0f34] text-[#fbf9f4] px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold border border-[#d2c2cb] animate-in fade-in slide-in-from-bottom-3">
            <CheckCircle className="h-4 w-4 text-[#ffdea6] shrink-0" />
            <span>{reviewToast}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Findings Bucket Component for Stage 2 ──

function FindingsBucketCard({
  title,
  badge,
  badgeColor,
  items,
  dismissedIds,
  editingId,
  editingText,
  onStartEdit,
  onCancelEdit,
  onChangeEditText,
  onAccept,
  onDismiss,
}: {
  title: string;
  badge: string;
  badgeColor: "amber" | "purple" | "red" | "blue";
  items: Array<{ flaw: any; suggestions: any[] }>;
  dismissedIds: Set<string>;
  editingId: string | null;
  editingText: string;
  onStartEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onChangeEditText: (val: string) => void;
  onAccept: (sugg: any) => void;
  onDismiss: (id: string) => void;
}) {
  const activeItems = items.filter((item) => !dismissedIds.has(item.flaw.flaw_code || item.flaw.title));

  return (
    <div className="border border-[#d2c2cb] rounded-xl p-4 bg-[#fbf9f4] space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#d2c2cb]/40">
        <h4 className="text-xs font-bold text-[#3a0f34] uppercase tracking-wider flex items-center gap-2">
          <span>{title}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#eee7ec] text-[#3a0f34]">
            {activeItems.length} issue(s)
          </span>
        </h4>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            badgeColor === "amber"
              ? "bg-amber-100 text-amber-800"
              : badgeColor === "purple"
              ? "bg-purple-100 text-purple-800"
              : badgeColor === "red"
              ? "bg-red-100 text-red-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {badge}
        </span>
      </div>

      {activeItems.length === 0 ? (
        <p className="text-xs text-[#81737b] italic py-1">
          No issues identified in this category.
        </p>
      ) : (
        <div className="space-y-3">
          {activeItems.map((item, idx) => {
            const flaw = item.flaw;
            const sugg = item.suggestions?.[0];
            const findingKey = flaw.flaw_code || flaw.title || `finding-${idx}`;
            const isEditing = editingId === (sugg?.id || findingKey);

            return (
              <div
                key={findingKey}
                className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#3a0f34]">
                        {flaw.title}
                      </span>
                      {flaw.severity && (
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                            flaw.severity === "HIGH"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {flaw.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#4f444b] mt-1 leading-relaxed">
                      {flaw.description}
                    </p>
                  </div>
                  {flaw.advocated_by && (
                    <span className="text-[10px] font-medium text-[#62535d] bg-[#fbf9f4] border border-[#d2c2cb] px-2 py-0.5 rounded shrink-0">
                      Advocated by {flaw.advocated_by}
                    </span>
                  )}
                </div>

                {/* Actionable Suggestion */}
                {sugg && (
                  <div className="p-3 rounded-lg bg-[#eee7ec]/50 border border-[#d2c2cb] space-y-2">
                    <div className="text-[11px] font-bold text-[#3a0f34] flex items-center justify-between">
                      <span>Recommendation: {sugg.action_label || "Apply Refinement"}</span>
                      <span className="text-[10px] text-[#814d75] font-semibold">{sugg.target_type}</span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          className="w-full text-xs p-2 bg-[#ffffff] border border-[#814d75] rounded focus:outline-none"
                          value={editingText}
                          onChange={(e) => onChangeEditText(e.target.value)}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={onCancelEdit}
                            className="px-2.5 py-1 text-xs text-[#62535d] hover:bg-[#ffffff] rounded"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => onAccept(sugg)}
                            className="px-3 py-1 bg-[#3a0f34] text-[#fbf9f4] text-xs font-bold rounded"
                          >
                            Apply Edited Text
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-[#4f444b] font-mono bg-[#ffffff] p-2 rounded border border-[#d2c2cb]">
                          {sugg.suggested_text}
                        </p>
                        {sugg.rationale && (
                          <p className="text-[11px] text-[#62535d] italic">
                            Rationale: {sugg.rationale}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onDismiss(findingKey)}
                            className="px-2.5 py-1 text-xs text-[#62535d] hover:text-[#3a0f34] rounded cursor-pointer"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => onStartEdit(sugg.id || findingKey, sugg.suggested_text)}
                            className="px-2.5 py-1 text-xs text-[#814d75] hover:bg-[#ffffff] font-semibold rounded cursor-pointer border border-[#d2c2cb]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onAccept(sugg)}
                            className="px-3 py-1 bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-bold rounded cursor-pointer transition-colors shadow-xs"
                          >
                            Accept Suggestion
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
