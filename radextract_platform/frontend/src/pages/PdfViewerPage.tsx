import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
  type PdfHighlighterUtils,
  type Highlight,
  type ScaledPosition,
  type ViewportPosition,
} from "react-pdf-highlighter-plus";
import "react-pdf-highlighter-plus/style/style.css";
import { api, type PdfDocumentData, API_BASE, type PdfHighlight as ApiPdfHighlight } from "../lib/api";
import {
  ArrowLeft, FileText, Loader2, Upload, Sparkles,
  CheckCircle, Table, Tag, Highlighter,
} from "lucide-react";

// ── Types ──

interface LocalHighlight extends Highlight {
  id: string;
  comment: string;
  color: string;
  variable_id?: string;
  db_id?: string; // database highlight_id
}

// ── Highlight container (renders each highlight) ──

function HighlightContainer() {
  const { highlight, isScrolledTo } = useHighlightContainerContext();
  const h = highlight as unknown as LocalHighlight;

  return (h as any).type === "text" ? (
    <TextHighlight
      highlight={h as any}
      isScrolledTo={isScrolledTo}
    />
  ) : (
    <AreaHighlight
      highlight={h as any}
      isScrolledTo={isScrolledTo}
    />
  );
}

// ── Main component ──

export function PdfViewerPage() {
  const { projectId, studyId } = useParams<{ projectId: string; studyId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"variables" | "text" | "tables">("variables");
  const [selectedVarId, setSelectedVarId] = useState<string | null>(searchParams.get("var") || null);
  const [highlightQuote, setHighlightQuote] = useState<string>(searchParams.get("var_name") || "");
  const [scrollToId, setScrollToId] = useState<string | null>(null);

  // Inline editing state
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [savingVarId, setSavingVarId] = useState<string | null>(null);
  const [savedSuccessVarId, setSavedSuccessVarId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlighterRef = useRef<PdfHighlighterUtils>(null);

  // ── Queries ──

  const { data: study } = useQuery({
    queryKey: ["study", studyId],
    queryFn: () => api.getStudy(studyId!),
    enabled: !!studyId,
  });

  const { data: pdfSummary } = useQuery({
    queryKey: ["pdf-summary", studyId],
    queryFn: () => api.getPdfSummary(studyId!),
    enabled: !!studyId,
  });

  const { data: pdfData } = useQuery({
    queryKey: ["pdf-data", studyId],
    queryFn: () => api.getPdfData(studyId!),
    enabled: !!studyId && pdfSummary?.has_pdf === true && pdfSummary?.pdf_status === "processed",
    retry: false,
  });

  const { data: variables } = useQuery({
    queryKey: ["variables", projectId],
    queryFn: () => api.listVariables(projectId!),
    enabled: !!projectId,
  });

  const { data: extractions, refetch: refetchExtractions } = useQuery({
    queryKey: ["extractions", studyId],
    queryFn: () => api.listExtractions(studyId!),
    enabled: !!studyId,
  });

  const { data: dbHighlights } = useQuery<ApiPdfHighlight[]>({
    queryKey: ["pdf-highlights", studyId],
    queryFn: () => api.listHighlights(studyId!),
    enabled: !!studyId && pdfSummary?.has_pdf === true,
  });

  // ── Mutations ──

  const uploadPdfMutation = useMutation({
    mutationFn: (file: File) => api.uploadPdf(studyId!, file, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", studyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-summary", studyId] });
      queryClient.invalidateQueries({ queryKey: ["pdf-data", studyId] });
      queryClient.invalidateQueries({ queryKey: ["extractions", studyId] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
    },
  });

  const autoExtractMutation = useMutation({
    mutationFn: () => api.autoExtract(studyId!, projectId!),
    onSuccess: () => {
      refetchExtractions();
      queryClient.invalidateQueries({ queryKey: ["extractions", studyId] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
      queryClient.invalidateQueries({ queryKey: ["review-progress", projectId] });
    },
  });

  const createHighlightMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createHighlight>[1]) =>
      api.createHighlight(studyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdf-highlights", studyId] });
    },
  });

  const deleteHighlightMutation = useMutation({
    mutationFn: (highlightId: string) => api.deleteHighlight(highlightId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdf-highlights", studyId] });
    },
  });

  // ── Convert DB highlights to react-pdf-highlighter format ──

  const highlights: LocalHighlight[] = (dbHighlights || []).map((h) => ({
    id: h.highlight_id,
    db_id: h.highlight_id,
    type: h.highlight_type as "text" | "area",
    position: h.position as any,
    content: { text: h.content_text },
    comment: h.comment || "",
    color: h.color || "#ffd700",
    variable_id: h.variable_id || "",
  }));

  // ── Scroll to highlight when requested ──

  useEffect(() => {
    if (scrollToId && highlighterRef.current) {
      const targetH = highlights.find((x) => x.id === scrollToId);
      if (targetH) {
        (highlighterRef.current as any).scrollToHighlight(targetH);
      }
      setScrollToId(null);
    }
  }, [scrollToId, highlights]);

  // ── Handle text selection → create highlight ──

  const handleSelectionFinished = useCallback(
    (position: ScaledPosition, content: { text: string }): LocalHighlight | undefined => {
      const text = content.text?.trim();
      if (!text || text.length < 3) return undefined;

      const highlightId = `hl-${Date.now()}`;
      const newHighlight: LocalHighlight = {
        id: highlightId,
        type: "text",
        position,
        content: { text },
        comment: "",
        color: "#ffd700",
      };

      // Save to backend
      createHighlightMutation.mutate({
        variable_id: selectedVarId || "",
        highlight_type: "text",
        page_number: position.boundingRect.pageNumber || (position.boundingRect as any).page || 1,
        position_json: position as any,
        content_text: text,
        comment: "",
        color: "#ffd700",
        created_by: "",
      });

      return newHighlight;
    },
    [createHighlightMutation, selectedVarId]
  );

  // ── Handle variable selection → scroll to highlight ──

  const handleSelectVariable = (v: any, ext?: any) => {
    setSelectedVarId(v.variable_id);
    const quote = ext?.source_text || ext?.quote || ext?.value || "";
    setHighlightQuote(quote);

    // Find a highlight linked to this variable
    const linkedHighlight = highlights.find((h) => h.variable_id === v.variable_id);
    if (linkedHighlight) {
      setScrollToId(linkedHighlight.id);
      return;
    }

    // Fallback: try to find a highlight with matching content text
    if (quote) {
      const matchingHighlight = highlights.find(
        (h) => h.content?.text && quote.includes(h.content.text.slice(0, 20))
      );
      if (matchingHighlight) {
        setScrollToId(matchingHighlight.id);
      }
    }
  };

  // ── Inline save ──

  const handleSaveInline = async (variable_id: string, ext?: any, newValue?: string) => {
    const valueToSave = newValue !== undefined ? newValue : (inlineDrafts[variable_id] ?? ext?.value ?? "");
    setSavingVarId(variable_id);
    try {
      if (ext?.extraction_id) {
        await api.updateExtraction(ext.extraction_id, {
          value: valueToSave,
          is_edited: true,
        });
      } else {
        await api.createExtraction(studyId!, {
          variable_id: variable_id,
          value: valueToSave,
          confidence: 1.0,
          quote: "Direct inline edit by reviewer",
          source_page: 1,
        });
      }
      refetchExtractions();
      queryClient.invalidateQueries({ queryKey: ["extractions", studyId] });
      queryClient.invalidateQueries({ queryKey: ["review-matrix", projectId] });
      queryClient.invalidateQueries({ queryKey: ["review-progress", projectId] });

      setSavedSuccessVarId(variable_id);
      setTimeout(() => setSavedSuccessVarId(null), 2000);
    } catch (err: any) {
      console.error("Inline save error:", err);
    } finally {
      setSavingVarId(null);
    }
  };

  // ── Build PDF URL with auth ──

  const pdfUrl = studyId ? api.pdfFileUrl(studyId) : "";
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const httpHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  // Map extractions by variable_id
  const extractionMap: Record<string, any> = {};
  (extractions || []).forEach((e) => {
    if (e.variable_id) extractionMap[e.variable_id] = e;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 shrink-0 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/studies`}
            className="text-sm font-medium text-gray-500 hover:text-phylo-blue flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to studies
          </Link>
          <div className="h-5 w-px bg-gray-200" />
          <div>
            <h1 className="font-bold text-gray-900 text-base leading-tight truncate max-w-xl">
              {study?.title || "Study PDF & Extraction"}
            </h1>
            <p className="text-xs text-gray-400 truncate max-w-lg">
              {study?.authors} · {study?.publication_year} · {study?.journal}
              {study?.pmid && <span className="ml-2 font-mono text-gray-500">PMID:{study.pmid}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) uploadPdfMutation.mutate(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPdfMutation.isPending}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Upload or replace PDF"
          >
            {uploadPdfMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {study?.pdf_path ? "Replace PDF" : "Upload PDF"}
          </button>

          {study?.pdf_path && (
            <>
              <button
                onClick={() => autoExtractMutation.mutate()}
                disabled={autoExtractMutation.isPending}
                className="btn-primary text-xs flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                title="Run LLM / Docling extraction for all variables"
              >
                {autoExtractMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Auto-Extract Variables
              </button>

              <Link
                to={`/projects/${projectId}/review`}
                className="btn-secondary text-xs flex items-center gap-1 text-phylo-blue hover:bg-phylo-blue/10"
              >
                <Table className="h-3.5 w-3.5" /> Review Matrix
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: PDF Viewer with react-pdf-highlighter-plus */}
        <div className="flex-1 flex flex-col border-r border-gray-200 bg-slate-200/90 overflow-hidden relative">
          {/* PDF Sticky Navigation Bar */}
          <div className="bg-white/95 backdrop-blur border-b border-gray-200 px-5 py-2.5 flex items-center justify-between z-20 shrink-0 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
                Document {pdfSummary?.n_pages ? `(${pdfSummary.n_pages} Pages)` : ""}
              </span>
              <span className="text-xs text-gray-400">
                {highlights.length} highlight{highlights.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Active Evidence Focus Banner */}
            {highlightQuote && (
              <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-300 text-amber-950 px-3 py-1 rounded-md max-w-sm truncate shadow-xs">
                <Highlighter className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="font-bold shrink-0">Evidence:</span>
                <span className="truncate italic font-medium">"{highlightQuote}"</span>
                <button
                  onClick={() => setHighlightQuote("")}
                  className="hover:text-black shrink-0 font-bold ml-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* PDF Rendering Area */}
          <div className="flex-1 overflow-hidden">
            {study?.pdf_path ? (
              <PdfLoader
                document={pdfUrl}
                httpHeaders={httpHeaders}
                beforeLoad={() => <LoadingSpinner />}
                errorMessage={() => <ErrorView />}
              >
                {(pdfDocument) => {
                  const HighlighterComp = PdfHighlighter as any;
                  return (
                    <HighlighterComp
                      ref={highlighterRef}
                      pdfDocument={pdfDocument}
                      highlights={highlights}
                      enableAreaSelection={(e: MouseEvent) => e.altKey}
                      onSelectionFinished={handleSelectionFinished}
                    >
                      <HighlightContainer />
                    </HighlighterComp>
                  );
                }}
              </PdfLoader>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center p-12 bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md">
                  <FileText className="h-16 w-16 text-phylo-blue/40 mx-auto mb-4" />
                  <h3 className="font-bold text-gray-800 text-lg mb-1">No PDF Uploaded</h3>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    Upload the full-text PDF for this study to view the document, highlight
                    evidence quotes, and verify extracted variables.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" /> Upload Full-Text PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Inline Editable Variables Inspector */}
        <aside className="w-[480px] shrink-0 bg-white flex flex-col border-l border-gray-200 overflow-hidden shadow-lg z-20">
          {/* Panel Header & Tabs */}
          <div className="border-b border-gray-200 px-4 pt-3 pb-0 shrink-0 bg-gray-50/50">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-phylo-blue" />
                Extraction Inspector
              </h2>
              <span className="text-xs text-gray-500 font-mono">
                {Object.keys(extractionMap).length} / {variables?.length || 0} extracted
              </span>
            </div>

            <div className="flex gap-1 border-b border-transparent">
              <button
                onClick={() => setActiveTab("variables")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "variables"
                    ? "border-phylo-blue text-phylo-blue bg-white rounded-t font-bold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                Variables & Values
              </button>
              <button
                onClick={() => setActiveTab("text")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "text"
                    ? "border-phylo-blue text-phylo-blue bg-white rounded-t font-bold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                Docling Text
              </button>
              <button
                onClick={() => setActiveTab("tables")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === "tables"
                    ? "border-phylo-blue text-phylo-blue bg-white rounded-t font-bold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                Tables ({pdfData?.tables?.length || 0})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: Variables with Direct Inline Editing & Click-to-Focus */}
            {activeTab === "variables" && (
              <div className="space-y-4">
                {(!variables || variables.length === 0) ? (
                  <div className="text-center py-12 text-gray-400">
                    <Tag className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No variables defined for this project.</p>
                    <Link to={`/projects/${projectId}/review`} className="text-xs text-phylo-blue hover:underline mt-1 inline-block">
                      Go to Data Review to generate variables
                    </Link>
                  </div>
                ) : (
                  ["Cohort_Level", "Protocol_Level", "Outcome_Level", "Other"].map((sec) => {
                    const secVars = variables.filter((v) => (v.section || "Other") === sec);
                    if (secVars.length === 0) return null;

                    return (
                      <div key={sec} className="space-y-2">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
                          {sec.replace("_", " ")}
                        </div>

                        <div className="space-y-2.5">
                          {secVars.map((v) => {
                            const ext = extractionMap[v.variable_id];
                            const isSelected = selectedVarId === v.variable_id;
                            const isSaving = savingVarId === v.variable_id;
                            const isSaved = savedSuccessVarId === v.variable_id;
                            const currentValue = inlineDrafts[v.variable_id] ?? ext?.value ?? "";
                            const linkedHighlights = highlights.filter((h) => h.variable_id === v.variable_id);

                            return (
                              <div
                                key={v.variable_id}
                                onClick={() => handleSelectVariable(v, ext)}
                                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-blue-50/90 border-phylo-blue shadow-xs ring-2 ring-phylo-blue/40"
                                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-xs text-gray-900">{v.name}</span>
                                    <span className="badge bg-gray-100 text-gray-500 text-[10px] py-0 px-1.5">
                                      {v.field_type || "text"}
                                    </span>
                                    {ext?.confidence !== undefined && (
                                      <span className={`text-[10px] font-bold ${ext.confidence >= 0.8 ? "text-emerald-600" : "text-amber-600"}`}>
                                        {Math.round(ext.confidence * 100)}% conf
                                      </span>
                                    )}
                                    {ext?.source_page && (
                                      <span className="text-[10px] text-gray-400 font-mono">
                                        p.{ext.source_page}
                                      </span>
                                    )}
                                    {ext?.is_edited && (
                                      <span className="badge bg-purple-50 text-purple-700 text-[10px] py-0 px-1">
                                        Edited
                                      </span>
                                    )}
                                    {linkedHighlights.length > 0 && (
                                      <span className="badge bg-amber-50 text-amber-700 text-[10px] py-0 px-1 flex items-center gap-0.5">
                                        <Highlighter className="h-2.5 w-2.5" />
                                        {linkedHighlights.length}
                                      </span>
                                    )}
                                  </div>

                                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-phylo-blue shrink-0" />}
                                  {isSaved && <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                                </div>

                                {/* Direct Inline Editable Field */}
                                <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                  {v.allowed_values ? (
                                    <select
                                      className="input w-full text-xs font-semibold text-gray-900 bg-gray-50/80 border-gray-200 focus:bg-white focus:border-phylo-blue py-1 px-2 rounded-md"
                                      value={currentValue}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInlineDrafts((prev) => ({ ...prev, [v.variable_id]: val }));
                                        handleSaveInline(v.variable_id, ext, val);
                                      }}
                                    >
                                      <option value="">-- Select Choice --</option>
                                      {v.allowed_values.split(";").map((opt: string) => (
                                        <option key={opt.trim()} value={opt.trim()}>
                                          {opt.trim()}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      className="input w-full text-xs font-mono font-medium text-emerald-900 bg-gray-50/80 border-gray-200 focus:bg-white focus:border-phylo-blue py-1.5 px-2.5 rounded-md focus:ring-1 focus:ring-phylo-blue"
                                      value={currentValue}
                                      placeholder="Click to type / edit value..."
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInlineDrafts((prev) => ({ ...prev, [v.variable_id]: val }));
                                      }}
                                      onBlur={() => {
                                        if (inlineDrafts[v.variable_id] !== undefined && inlineDrafts[v.variable_id] !== ext?.value) {
                                          handleSaveInline(v.variable_id, ext);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Verbatim Supporting Evidence Quote */}
                                {ext?.source_text || ext?.quote ? (
                                  <div className="mt-1.5 text-[11px] text-gray-600 italic bg-amber-50/70 border border-amber-200 rounded px-2.5 py-1.5 line-clamp-2">
                                    "{ext.source_text || ext.quote}"
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: Full Extracted Text */}
            {activeTab === "text" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Viewing Docling text</span>
                  <span className="font-mono">{pdfData?.pages?.length || 0} total pages</span>
                </div>
                {pdfData?.pages ? (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-[650px] overflow-y-auto border border-gray-200 space-y-4">
                    {pdfData.pages.map((pg) => (
                      <div key={pg.page_number} className="p-3 bg-white rounded border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 mb-1 font-mono">Page {pg.page_number}</div>
                        <div>{pg.text || "(No text)"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 text-xs">
                    Process the PDF with Docling to view page text.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Extracted Tables */}
            {activeTab === "tables" && (
              <div className="space-y-4">
                {pdfData?.tables && pdfData.tables.length > 0 ? (
                  pdfData.tables.map((tbl: any, idx: number) => (
                    <div key={idx} className="card p-3 space-y-2 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-gray-800">Table {idx + 1}</h4>
                        {tbl.page && <span className="badge text-[10px]">Page {tbl.page}</span>}
                      </div>
                      {tbl.caption && <p className="text-[11px] text-gray-500 italic">{tbl.caption}</p>}
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-[10px]">
                          {tbl.rows && tbl.rows.map((row: any[], rIdx: number) => (
                            <tr key={rIdx} className={rIdx === 0 ? "bg-gray-100 font-bold" : "even:bg-gray-50"}>
                              {row.map((cell: any, cIdx: number) => (
                                <td key={cIdx} className="px-2 py-1 border border-gray-200 truncate max-w-[120px]">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </table>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-400 text-xs">
                    No tables detected in this publication.
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Helper components ──

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-10 w-10 text-phylo-blue animate-spin" />
    </div>
  );
}

function ErrorView() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center p-8 max-w-md">
        <FileText className="h-12 w-12 text-red-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Failed to load PDF</p>
        <p className="text-xs text-gray-500 mt-1">
          The PDF file could not be rendered. Ensure the file is a valid PDF.
        </p>
      </div>
    </div>
  );
}
