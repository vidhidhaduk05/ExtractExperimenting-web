import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SecondaryHypothesis, type Criterion } from "../lib/api";
import {
  ArrowLeft, Users, Stethoscope, GitCompare, Target, FlaskConical,
  Lightbulb, HelpCircle, Plus, Trash2, Loader2, CheckCircle,
  Upload, FileText, Copy, Search, Sparkles, Database,
  ChevronDown, ChevronRight, AlertCircle, AlertTriangle,
} from "lucide-react";

const DATABASES = [
  { key: "pubmed", label: "PubMed", hasAutoFetch: true },
  { key: "ovid_medline", label: "Ovid MEDLINE", hasAutoFetch: false },
  { key: "openalex", label: "OpenAlex", hasAutoFetch: false },
  { key: "embase", label: "Embase", hasAutoFetch: false },
  { key: "cochrane", label: "Cochrane", hasAutoFetch: false },
  { key: "web_of_science", label: "Web of Science", hasAutoFetch: false },
  { key: "scopus", label: "Scopus", hasAutoFetch: false },
  { key: "cinahl", label: "CINAHL", hasAutoFetch: false },
] as const;

export function PicoHypothesisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

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

  // ── PICO form state ──
  const [picoForm, setPicoForm] = useState({
    population: "",
    index_test: "",
    comparator: "",
    outcome: "",
    study_design: "",
  });
  const [picoSaved, setPicoSaved] = useState(false);

  useEffect(() => {
    if (pico) {
      setPicoForm({
        population: pico.population || "",
        index_test: pico.index_test || "",
        comparator: pico.comparator || "",
        outcome: pico.outcome || "",
        study_design: pico.study_design || "",
      });
    }
  }, [pico]);

  const setPicoField = (k: string, v: string) =>
    setPicoForm((f) => ({ ...f, [k]: v }));

  const picoSaveMutation = useMutation({
    mutationFn: () => api.updatePico(projectId!, picoForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setPicoSaved(true);
      setTimeout(() => setPicoSaved(false), 2500);
    },
  });

  // ── Hypothesis state ──
  const [hypothesis, setHypothesis] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [secondary, setSecondary] = useState<SecondaryHypothesis[]>([]);
  const [hypSaved, setHypSaved] = useState(false);

  useEffect(() => {
    if (hyp) {
      setHypothesis(hyp.hypothesis || "");
      setResearchQuestion(hyp.research_question || "");
      setSecondary(hyp.secondary_hypotheses || []);
    }
  }, [hyp]);

  const hypSaveMutation = useMutation({
    mutationFn: () =>
      api.updateHypothesis(projectId!, {
        hypothesis,
        research_question: researchQuestion,
        secondary_hypotheses: secondary,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setHypSaved(true);
      setTimeout(() => setHypSaved(false), 2500);
    },
  });

  const addSecondary = () =>
    setSecondary([...secondary, { text: "", type: "alternative", status: "pending" }]);

  const updateSecondary = (i: number, field: keyof SecondaryHypothesis, value: string) => {
    const next = [...secondary];
    next[i] = { ...next[i], [field]: value };
    setSecondary(next);
  };

  const removeSecondary = (i: number) =>
    setSecondary(secondary.filter((_, idx) => idx !== i));

  // ── Criteria state ──
  const [inclusion, setInclusion] = useState<Criterion[]>([]);
  const [exclusion, setExclusion] = useState<Criterion[]>([]);
  const [criteriaSaved, setCriteriaSaved] = useState(false);

  useEffect(() => {
    if (criteria) {
      setInclusion(criteria.inclusion || []);
      setExclusion(criteria.exclusion || []);
    }
  }, [criteria]);

  const criteriaSaveMutation = useMutation({
    mutationFn: () =>
      api.updateCriteria(projectId!, { inclusion, exclusion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
      setCriteriaSaved(true);
      setTimeout(() => setCriteriaSaved(false), 2500);
    },
  });

  const criteriaGenerateMutation = useMutation({
    mutationFn: () => api.generateCriteria(projectId!),
    onSuccess: (data) => {
      setInclusion(data.inclusion);
      setExclusion(data.exclusion);
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
    },
  });

  const addCriterion = (type: "inclusion" | "exclusion") => {
    const newCrit: Criterion = {
      id: `crit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: "",
    };
    if (type === "inclusion") setInclusion([...inclusion, newCrit]);
    else setExclusion([...exclusion, newCrit]);
  };

  const updateCriterion = (
    type: "inclusion" | "exclusion",
    i: number,
    text: string
  ) => {
    if (type === "inclusion") {
      const next = [...inclusion];
      next[i] = { ...next[i], text };
      setInclusion(next);
    } else {
      const next = [...exclusion];
      next[i] = { ...next[i], text };
      setExclusion(next);
    }
  };

  const removeCriterion = (type: "inclusion" | "exclusion", i: number) => {
    if (type === "inclusion")
      setInclusion(inclusion.filter((_, idx) => idx !== i));
    else setExclusion(exclusion.filter((_, idx) => idx !== i));
  };

  // ── Search strings state ──
  const [activeDb, setActiveDb] = useState<string>("pubmed");
  const [copiedDb, setCopiedDb] = useState<string | null>(null);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // ── Research question state ──
  const [researchQuestionInput, setResearchQuestionInput] = useState("");
  const [questionResult, setQuestionResult] = useState<string | null>(null);

  const questionMutation = useMutation({
    mutationFn: (question: string) => api.searchFromQuestion(projectId!, question),
    onSuccess: (data) => {
      setQuestionResult(
        `PICO extracted and search strings generated for all 6 databases.`
      );
      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["search-strings", projectId] });
    },
    onError: (err: Error) => {
      setQuestionResult(`Error: ${err.message}`);
    },
  });

  const stringsGenerateMutation = useMutation({
    mutationFn: () => api.generateSearchStrings(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search-strings", projectId] });
    },
  });

  const pubmedFetchMutation = useMutation({
    mutationFn: () => api.pubmedFetch(projectId!, 100),
    onSuccess: (data) => {
      setFetchResult(
        `Imported ${data.imported_count} studies, skipped ${data.skipped_duplicates} duplicates (${data.total_found} found on PubMed)`
      );
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    },
    onError: (err: Error) => {
      setFetchResult(`Error: ${err.message}`);
    },
  });

  const refUploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadReferences(projectId!, file),
    onSuccess: (data) => {
      setUploadResult(
        `Imported ${data.imported_count} references, skipped ${data.skipped_duplicates} duplicates (source: ${data.source})`
      );
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    },
    onError: (err: Error) => {
      setUploadResult(`Error: ${err.message}`);
    },
  });

  const handleCopy = async (dbKey: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDb(dbKey);
      setTimeout(() => setCopiedDb(null), 2000);
    } catch {
      // fallback
    }
  };

  // ── Protocol upload state ──
  const [extractionStatus, setExtractionStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [extractionConfidence, setExtractionConfidence] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const handleProtocolUpload = async (file: File) => {
    setExtractionStatus("loading");
    setExtractionError("");
    setUploadedFileName(file.name);
    try {
      const result = await api.extractPico(projectId!, file);
      
      const newPico = {
        population: result.population || picoForm.population,
        index_test: result.index_test || picoForm.index_test,
        comparator: result.comparator || picoForm.comparator,
        outcome: result.outcome || picoForm.outcome,
        study_design: result.study_design || picoForm.study_design,
      };

      const newRq = result.research_question || researchQuestion;
      const newHyp = result.hypothesis || hypothesis;

      // Auto-fill PICO form and Hypothesis in local state immediately
      setPicoForm(newPico);
      if (result.research_question) setResearchQuestion(result.research_question);
      if (result.hypothesis) setHypothesis(result.hypothesis);
      setExtractionConfidence(result.extraction_confidence || "high");
      setExtractionStatus("done");

      // Synchronously populate React Query caches so refetches never revert values
      queryClient.setQueryData(["pico", projectId], newPico);
      queryClient.setQueryData(["hypothesis", projectId], (prev: any) => ({
        ...(prev || {}),
        hypothesis: newHyp,
        research_question: newRq,
      }));

      // Immediately persist PICO and Hypothesis to ensure database & UI are synced
      try {
        await Promise.all([
          api.updatePico(projectId!, newPico),
          api.updateHypothesis(projectId!, {
            hypothesis: newHyp,
            research_question: newRq,
            secondary_hypotheses: secondary,
          }),
        ]);
        setPicoSaved(true);
        setHypSaved(true);
        setTimeout(() => {
          setPicoSaved(false);
          setHypSaved(false);
        }, 3500);
      } catch (saveErr) {
        console.warn("[Auto-persist Warning]", saveErr);
      }

      queryClient.invalidateQueries({ queryKey: ["pico", projectId] });
      queryClient.invalidateQueries({ queryKey: ["hypothesis", projectId] });
      queryClient.invalidateQueries({ queryKey: ["criteria", projectId] });
      queryClient.invalidateQueries({ queryKey: ["search-strings", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });

      // Auto-expand PICO, Hypothesis, and Criteria sections so user immediately views all fields filled
      setOpenSections((prev) => ({
        ...prev,
        protocol: true,
        pico: true,
        hypothesis: true,
        criteria: true,
      }));
    } catch (err) {
      console.error("[Protocol Upload Error]", err);
      setExtractionError((err as Error).message || "Failed to process protocol file");
      setExtractionStatus("error");
    }
  };

  const handleRefUpload = (file: File) => {
    refUploadMutation.mutate(file);
  };

  // ── Collapsible sections ──
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    protocol: true,
    pico: true,
    hypothesis: true,
    criteria: true,
    search: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const picoFields = [
    { key: "population", label: "P — Population", icon: Users, placeholder: "e.g., Patients with colorectal cancer undergoing staging imaging" },
    { key: "index_test", label: "I — Index Test", icon: Stethoscope, placeholder: "e.g., Contrast-enhanced computed tomography (CT)" },
    { key: "comparator", label: "C — Comparator", icon: GitCompare, placeholder: "e.g., Gadoxetic acid-enhanced MRI as reference standard" },
    { key: "outcome", label: "O — Outcome", icon: Target, placeholder: "e.g., Diagnostic accuracy (sensitivity and specificity)" },
    { key: "study_design", label: "S — Study Design", icon: FlaskConical, placeholder: "e.g., Diagnostic accuracy studies (cross-sectional)" },
  ];

  const currentDbString =
    searchStrings?.strings?.[activeDb] || "";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <h1 className="text-2xl font-bold mb-1">PICO & Hypothesis</h1>
      <p className="text-gray-500 text-sm mb-6">
        Upload a study protocol to auto-extract PICO elements, define your research
        question and hypotheses, generate inclusion/exclusion criteria, and build
        database-specific search strings.
      </p>

      {/* ═══════════════════════════════════════════════════════════════
          Section 1: Protocol Document Upload
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Protocol Document"
        icon={FileText}
        isOpen={openSections.protocol}
        onToggle={() => toggleSection("protocol")}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload a study protocol (PDF, DOCX, or TXT) to automatically extract PICO
            elements, research question, and hypothesis via NLP analysis.
          </p>

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
            className={`rounded-2xl border-2 border-dashed p-5 transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isDragging
                ? "border-[#381A61] bg-[#88A0DC]/10"
                : "border-[#381A61]/15 bg-[#F2F1EB]/30 hover:border-[#381A61]/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#381A61]/10 flex items-center justify-center text-[#381A61] shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#141413]">
                  {uploadedFileName ? (
                    <span className="flex items-center gap-1.5 text-[#381A61]">
                      <span>{uploadedFileName}</span>
                    </span>
                  ) : (
                    "Select a protocol file or drag & drop here"
                  )}
                </p>
                <p className="text-[11px] text-black/50 mt-0.5">
                  Supports PDF, DOCX, TXT, MD, RTF (up to 50MB)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
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
                id="btn-upload-protocol"
                className="btn-palette-primary cursor-pointer !px-4 !py-2 text-xs font-bold shadow-sm inline-flex items-center gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={extractionStatus === "loading"}
              >
                {extractionStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {extractionStatus === "done" ? "Upload Different Protocol" : "Upload Protocol"}
              </button>
            </div>
          </div>

          {extractionStatus === "loading" && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#88A0DC]/15 border border-[#88A0DC]/30 text-xs font-medium text-[#381A61]">
              <Loader2 className="h-4 w-4 animate-spin text-[#381A61]" />
              <span>Analyzing protocol text and extracting PICO elements via NLP...</span>
            </div>
          )}

          {extractionStatus === "done" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">Protocol Successfully Extracted</span>
                {extractionConfidence && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {extractionConfidence.toUpperCase()} CONFIDENCE
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 px-4 py-3 text-xs text-emerald-900 leading-relaxed">
                PICO elements, research question, and hypothesis have been auto-populated below from <strong className="font-semibold">{uploadedFileName || "your protocol"}</strong>. Review and edit as needed, then click Save on each section.
              </div>
            </div>
          )}

          {extractionStatus === "error" && (
            <div className="flex items-center justify-between rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{extractionError || "Failed to extract protocol. Please try again."}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="underline font-semibold hover:text-red-900"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════
          Section 1b: Research Question → PICO + Search Strings
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Research Question (Auto-Generate PICO)"
        icon={HelpCircle}
        isOpen={openSections.protocol}
        onToggle={() => toggleSection("protocol")}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Type your research question in plain English and let AI extract PICO
            elements and generate database-specific search strings automatically.
          </p>
          <div className="flex items-start gap-3">
            <textarea
              className="input min-h-[80px] flex-1"
              placeholder="e.g., Is MRI more accurate than CT for detecting liver metastases in patients with colorectal cancer?"
              value={researchQuestionInput}
              onChange={(e) => setResearchQuestionInput(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={() => {
                if (researchQuestionInput.trim()) {
                  questionMutation.mutate(researchQuestionInput.trim());
                }
              }}
              disabled={questionMutation.isPending || !researchQuestionInput.trim()}
            >
              {questionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </button>
          </div>
          {questionResult && (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                questionResult.startsWith("Error")
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-green-50 border border-green-200 text-green-700"
              }`}
            >
              {questionResult}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════
          Section 2: PICO Framework
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="PICO Framework"
        icon={Target}
        isOpen={openSections.pico}
        onToggle={() => toggleSection("pico")}
      >
        {picoLoading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              picoSaveMutation.mutate();
            }}
            className="space-y-4"
          >
            {picoFields.map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
                  <Icon className="h-4 w-4 text-phylo-blue" />
                  {label}
                </label>
                <textarea
                  className="input min-h-[60px]"
                  value={picoForm[key as keyof typeof picoForm]}
                  onChange={(e) => setPicoField(key, e.target.value)}
                  placeholder={placeholder}
                />
              </div>
            ))}

            {picoSaveMutation.isError && (
              <ErrorBanner msg={(picoSaveMutation.error as Error).message} />
            )}

            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={picoSaveMutation.isPending}>
                {picoSaveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save PICO
              </button>
              {picoSaved && (
                <span className="flex items-center gap-1 text-sm text-phylo-green">
                  <CheckCircle className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </form>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════
          Section 3: Research Question & Hypothesis
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Research Question & Hypothesis"
        icon={Lightbulb}
        isOpen={openSections.hypothesis}
        onToggle={() => toggleSection("hypothesis")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hypSaveMutation.mutate();
          }}
          className="space-y-4"
        >
          {/* Research Question */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
              <HelpCircle className="h-4 w-4 text-phylo-blue" />
              Research Question
            </label>
            <textarea
              className="input min-h-[60px]"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              placeholder="e.g., What is the diagnostic accuracy of CT compared to MRI for detecting liver metastases in patients with colorectal cancer?"
            />
          </div>

          {/* Primary Hypothesis */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1.5">
              <Lightbulb className="h-4 w-4 text-phylo-orange" />
              Primary Hypothesis
            </label>
            <textarea
              className="input min-h-[80px]"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="e.g., MRI has superior diagnostic accuracy compared to CT for the detection of liver metastases in colorectal cancer patients."
            />
          </div>

          {/* Secondary Hypotheses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Lightbulb className="h-4 w-4 text-gray-400" />
                Secondary Hypotheses
              </label>
              <button
                type="button"
                onClick={addSecondary}
                className="text-xs text-phylo-blue hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>

            {secondary.length === 0 && (
              <p className="text-sm text-gray-400">No secondary hypotheses defined.</p>
            )}

            <div className="space-y-2">
              {secondary.map((h, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <textarea
                    className="input min-h-[40px] flex-1 text-sm"
                    value={h.text}
                    onChange={(e) => updateSecondary(i, "text", e.target.value)}
                    placeholder="Secondary hypothesis text..."
                  />
                  <select
                    className="input w-28 text-xs"
                    value={h.type}
                    onChange={(e) => updateSecondary(i, "type", e.target.value)}
                  >
                    <option value="alternative">Alternative</option>
                    <option value="null">Null</option>
                  </select>
                  <select
                    className="input w-28 text-xs"
                    value={h.status}
                    onChange={(e) => updateSecondary(i, "status", e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSecondary(i)}
                    className="text-gray-400 hover:text-red-500 mt-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {hypSaveMutation.isError && (
            <ErrorBanner msg={(hypSaveMutation.error as Error).message} />
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={hypSaveMutation.isPending}>
              {hypSaveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Hypothesis
            </button>
            {hypSaved && (
              <span className="flex items-center gap-1 text-sm text-phylo-green">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════
          Section 4: Inclusion/Exclusion Criteria
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Inclusion / Exclusion Criteria"
        icon={CheckCircle}
        isOpen={openSections.criteria}
        onToggle={() => toggleSection("criteria")}
      >
        <div className="space-y-4">
          {/* Warning banner: auto-generated search strings require expert review */}
          <div className="rounded-lg border border-phylo-orange/30 bg-phylo-orange/5 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-phylo-orange shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold text-phylo-orange">Auto-generated search strings are a starting point.</span>{" "}
              <span className="text-gray-600">
                These strings are generated from your PICO framework using built-in MeSH/Emtree mappings.
                They must be reviewed and refined by a medical librarian or systematic review methodologist
                before use in a formal search. Synonym coverage, database-specific syntax, and field tags
                may require adjustment for your specific research question.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => criteriaGenerateMutation.mutate()}
              disabled={criteriaGenerateMutation.isPending}
            >
              {criteriaGenerateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate from PICO
            </button>
            {criteriaGenerateMutation.isError && (
              <span className="text-sm text-red-600">
                {(criteriaGenerateMutation.error as Error).message}
              </span>
            )}
          </div>

          {/* Inclusion criteria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Inclusion Criteria</h4>
              <button
                type="button"
                onClick={() => addCriterion("inclusion")}
                className="text-xs text-phylo-blue hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {inclusion.length === 0 && (
              <p className="text-sm text-gray-400">No inclusion criteria defined.</p>
            )}
            <div className="space-y-2">
              {inclusion.map((c, i) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <span className="text-sm font-medium text-gray-400 mt-2 w-6 shrink-0">
                    {i + 1}.
                  </span>
                  <textarea
                    className="input min-h-[36px] flex-1 text-sm"
                    value={c.text}
                    onChange={(e) => updateCriterion("inclusion", i, e.target.value)}
                    placeholder="Inclusion criterion..."
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion("inclusion", i)}
                    className="text-gray-400 hover:text-red-500 mt-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Exclusion criteria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Exclusion Criteria</h4>
              <button
                type="button"
                onClick={() => addCriterion("exclusion")}
                className="text-xs text-phylo-blue hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {exclusion.length === 0 && (
              <p className="text-sm text-gray-400">No exclusion criteria defined.</p>
            )}
            <div className="space-y-2">
              {exclusion.map((c, i) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <span className="text-sm font-medium text-gray-400 mt-2 w-6 shrink-0">
                    {i + 1}.
                  </span>
                  <textarea
                    className="input min-h-[36px] flex-1 text-sm"
                    value={c.text}
                    onChange={(e) => updateCriterion("exclusion", i, e.target.value)}
                    placeholder="Exclusion criterion..."
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion("exclusion", i)}
                    className="text-gray-400 hover:text-red-500 mt-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {criteriaSaveMutation.isError && (
            <ErrorBanner msg={(criteriaSaveMutation.error as Error).message} />
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => criteriaSaveMutation.mutate()}
              disabled={criteriaSaveMutation.isPending}
            >
              {criteriaSaveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Criteria
            </button>
            {criteriaSaved && (
              <span className="flex items-center gap-1 text-sm text-phylo-green">
                <CheckCircle className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════
          Section 5: Search Strings
          ═══════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Search Strings"
        icon={Search}
        isOpen={openSections.search}
        onToggle={() => toggleSection("search")}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => stringsGenerateMutation.mutate()}
              disabled={stringsGenerateMutation.isPending}
            >
              {stringsGenerateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate from PICO
            </button>
            {stringsGenerateMutation.isError && (
              <span className="text-sm text-red-600">
                {(stringsGenerateMutation.error as Error).message}
              </span>
            )}
          </div>

          {/* Database tabs */}
          <div className="flex flex-wrap gap-1 border-b border-gray-200">
            {DATABASES.map((db) => (
              <button
                key={db.key}
                type="button"
                onClick={() => {
                  setActiveDb(db.key);
                  setFetchResult(null);
                  setUploadResult(null);
                }}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeDb === db.key
                    ? "border-phylo-blue text-phylo-blue"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {db.label}
              </button>
            ))}
          </div>

          {/* Active database content */}
          <div className="space-y-3">
            {currentDbString ? (
              <>
                <div className="relative">
                  <pre className="input min-h-[120px] whitespace-pre-wrap font-mono text-xs bg-gray-50 overflow-x-auto">
                    {currentDbString}
                  </pre>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Copy button */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleCopy(activeDb, currentDbString)}
                  >
                    {copiedDb === activeDb ? (
                      <CheckCircle className="h-4 w-4 text-phylo-green" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedDb === activeDb ? "Copied" : "Copy"}
                  </button>

                  {/* AutoFetch button (PubMed only) */}
                  {DATABASES.find((d) => d.key === activeDb)?.hasAutoFetch && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setFetchResult(null);
                        pubmedFetchMutation.mutate();
                      }}
                      disabled={pubmedFetchMutation.isPending}
                    >
                      {pubmedFetchMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4" />
                      )}
                      AutoFetch
                    </button>
                  )}
                </div>

                {/* Fetch result */}
                {fetchResult && (
                  <div
                    className={`rounded-md px-4 py-3 text-sm ${
                      fetchResult.startsWith("Error")
                        ? "bg-red-50 border border-red-200 text-red-700"
                        : "bg-green-50 border border-green-200 text-green-700"
                    }`}
                  >
                    {fetchResult}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">
                No search string generated yet. Click "Generate from PICO" to create
                database-specific search strings.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Reusable section card with collapsible header ──

function SectionCard({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <Icon className="h-4 w-4 text-phylo-blue" />
        <span className="font-semibold text-gray-800">{title}</span>
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      Error: {msg}
    </div>
  );
}
