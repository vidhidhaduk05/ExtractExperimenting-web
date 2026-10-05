import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, Upload, FileText, CheckCircle, Search, Loader2, BookOpen, ExternalLink, Copy } from "lucide-react";

export function StudyImport() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    authors: "",
    publication_year: "",
    journal: "",
    doi: "",
    pmid: "",
    abstract: "",
    study_design: "diagnostic accuracy",
    source: "",
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [error, setError] = useState("");
  const [createdStudyId, setCreatedStudyId] = useState<string | null>(null);
  const [activeCitationTab, setActiveCitationTab] = useState("vancouver");
  const [copied, setCopied] = useState(false);

  // PubMed Preview / Dry-run state
  const [previewQuery, setPreviewQuery] = useState("");

  // PubMed Preview dry-run mutation
  const previewMutation = useMutation({
    mutationFn: (query: string) =>
      api.pubmedPreview({ query, project_id: projectId, sample_size: 5 }),
  });

  // PMID lookup
  const pmidLookupMutation = useMutation({
    mutationFn: (pmid: string) => api.pubmedLookup(pmid),
    onSuccess: (data) => {
      setForm((prev) => ({
        ...prev,
        title: data.title || prev.title,
        authors: data.authors || prev.authors,
        journal: data.journal || prev.journal,
        doi: data.doi || prev.doi,
        pmid: data.pmid || prev.pmid,
        abstract: data.abstract || prev.abstract,
        study_design: data.study_design || prev.study_design,
        source: "PubMed",
        publication_year: data.publication_year ? String(data.publication_year) : prev.publication_year,
      }));
    },
    onError: (e: Error) => setError(`PubMed lookup failed: ${e.message}`),
  });

  // Full-text fetch
  const fulltextMutation = useMutation({
    mutationFn: (pmid: string) => api.pubmedFulltext(pmid),
  });

  // Citations for created study
  const { data: citations, refetch: refetchCitations } = useQuery({
    queryKey: ["citations", createdStudyId],
    queryFn: () => api.getCitations(createdStudyId!),
    enabled: false, // manually triggered
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.createStudy(projectId!, data as any),
    onSuccess: async (study) => {
      setCreatedStudyId(study.study_id);
      if (pdfFile) {
        try {
          await api.uploadPdf(study.study_id, pdfFile);
          setPdfUploaded(true);
        } catch (e) {
          // PDF upload failure is non-fatal
        }
      }
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      // Fetch citations for the newly created study
      refetchCitations();
      setTimeout(() => navigate(`/projects/${projectId}/studies`), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    createMutation.mutate({
      ...form,
      publication_year: form.publication_year ? parseInt(form.publication_year) : null,
      project_id: projectId,
    });
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePmidLookup = () => {
    if (!form.pmid.trim()) {
      setError("Enter a PMID first");
      return;
    }
    setError("");
    pmidLookupMutation.mutate(form.pmid.trim());
  };

  const handleFulltextFetch = () => {
    if (!form.pmid.trim()) return;
    fulltextMutation.mutate(form.pmid.trim());
  };

  const copyCitation = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const designOptions = [
    "diagnostic accuracy",
    "randomized controlled trial",
    "non-randomized intervention",
    "cohort study",
    "case-control study",
    "cross-sectional study",
    "case series",
    "systematic review",
    "meta-analysis",
    "other",
  ];

  const citationFormats = ["vancouver", "apa", "mla", "chicago", "harvard", "bibtex"];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link to={`/projects/${projectId}/studies`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to studies
      </Link>

      <h1 className="text-2xl font-bold mb-1">Import Study</h1>
      <p className="text-gray-500 text-sm mb-6">Add a study manually or via PubMed PMID, and optionally upload the full-text PDF</p>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {createMutation.isSuccess && (
        <div className="rounded-md bg-phylo-green/10 border border-phylo-green/30 px-4 py-3 text-sm text-phylo-green mb-4 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Study imported successfully{pdfUploaded ? " with PDF uploaded" : ""}. Redirecting...
        </div>
      )}

      {/* PubMed Query Preview & Dry-Run Card */}
      <div className="card p-5 bg-phylo-cream/30 border border-phylo-blue/20 mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Search className="h-4 w-4 text-phylo-blue" />
            PubMed AutoFetch & Dry-Run Preview
          </label>
          <span className="text-xs px-2 py-0.5 rounded-full bg-phylo-blue/10 text-phylo-blue font-medium">
            Dry-Run Enabled
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Test and preview complex search strings against PubMed before importing. Shows exact record counts and duplicate detection against your project.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            className="input flex-1 font-mono text-xs"
            value={previewQuery}
            onChange={(e) => setPreviewQuery(e.target.value)}
            placeholder='e.g. ("Multiparametric MRI"[tiab] OR "mpMRI"[tiab]) AND ("Prostate Cancer"[MeSH])'
          />
          <button
            type="button"
            onClick={() => {
              if (!previewQuery.trim()) {
                setError("Enter a search query to preview");
                return;
              }
              setError("");
              previewMutation.mutate(previewQuery.trim());
            }}
            disabled={previewMutation.isPending}
            className="btn-secondary whitespace-nowrap text-xs"
          >
            {previewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Preview Count
          </button>
        </div>

        {previewMutation.isPending && (
          <div className="p-3 bg-white/70 rounded-lg border border-gray-200 text-xs text-gray-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-phylo-blue" /> Querying NCBI E-utilities for count and sample records...
          </div>
        )}

        {previewMutation.isSuccess && (
          <div className="space-y-3 mt-3 pt-3 border-t border-gray-200/60">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm text-center">
                <div className="text-xs text-gray-500">Total Matching</div>
                <div className="text-lg font-bold text-phylo-blue">{previewMutation.data.total_matching_records.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm text-center">
                <div className="text-xs text-gray-500">Sample Duplicate Check</div>
                <div className="text-lg font-bold text-amber-600">
                  {previewMutation.data.existing_in_project_samples} / {previewMutation.data.sample_count}
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm text-center">
                <div className="text-xs text-gray-500">Net Status</div>
                <div className="text-xs font-semibold text-phylo-green mt-1">Ready for Search Refinement</div>
              </div>
            </div>

            {previewMutation.data.sample_previews.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-200 text-xs space-y-2">
                <div className="font-semibold text-gray-700">Top Sample Records:</div>
                {previewMutation.data.sample_previews.map((sample) => (
                  <div key={sample.pmid} className="p-2 rounded bg-gray-50 border border-gray-100 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900 line-clamp-1">{sample.title}</div>
                      <div className="text-gray-500 text-[11px]">
                        PMID: {sample.pmid} · {sample.authors} · {sample.journal} ({sample.publication_year || "N/A"})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        update("pmid", sample.pmid);
                        pmidLookupMutation.mutate(sample.pmid);
                      }}
                      className="px-2 py-1 text-[11px] rounded bg-phylo-blue/10 text-phylo-blue hover:bg-phylo-blue hover:text-white shrink-0"
                    >
                      Fill Form
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* PubMed Lookup */}
        <div className="card p-5 bg-phylo-cream/20">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <BookOpen className="h-4 w-4 text-phylo-blue" />
            Single PMID Quick Lookup
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={form.pmid}
              onChange={(e) => update("pmid", e.target.value)}
              placeholder="Enter PMID (e.g. 36789123)"
            />
            <button
              type="button"
              onClick={handlePmidLookup}
              disabled={pmidLookupMutation.isPending}
              className="btn-primary whitespace-nowrap"
            >
              {pmidLookupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Lookup
            </button>
          </div>
          {pmidLookupMutation.isSuccess && (
            <p className="text-xs text-phylo-green mt-2 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Metadata fetched from PubMed. Fields below auto-filled.
            </p>
          )}
          {fulltextMutation.isSuccess && (
            <div className="mt-2 text-xs">
              {fulltextMutation.data.has_fulltext ? (
                <a
                  href={fulltextMutation.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-phylo-blue hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Full text available via {fulltextMutation.data.source}
                </a>
              ) : (
                <span className="text-gray-500">
                  {fulltextMutation.data.message || "Full text not available via open access."}
                </span>
              )}
            </div>
          )}
          {form.pmid && (
            <button
              type="button"
              onClick={handleFulltextFetch}
              disabled={fulltextMutation.isPending}
              className="text-xs text-gray-500 hover:text-phylo-blue mt-2 flex items-center gap-1"
            >
              {fulltextMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
              Check full-text availability
            </button>
          )}
        </div>

        {/* Study metadata form */}
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Study title"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Authors</label>
              <input
                className="input"
                value={form.authors}
                onChange={(e) => update("authors", e.target.value)}
                placeholder="e.g. Smith J, Doe A"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Publication Year</label>
              <input
                className="input"
                type="number"
                value={form.publication_year}
                onChange={(e) => update("publication_year", e.target.value)}
                placeholder="e.g. 2024"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Journal</label>
              <input
                className="input"
                value={form.journal}
                onChange={(e) => update("journal", e.target.value)}
                placeholder="e.g. Radiology"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Study Design</label>
              <select
                className="input"
                value={form.study_design}
                onChange={(e) => update("study_design", e.target.value)}
              >
                {designOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DOI</label>
              <input
                className="input"
                value={form.doi}
                onChange={(e) => update("doi", e.target.value)}
                placeholder="e.g. 10.1148/radiol.202323001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PMID</label>
              <input
                className="input"
                value={form.pmid}
                onChange={(e) => update("pmid", e.target.value)}
                placeholder="e.g. 36789123"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Abstract</label>
            <textarea
              className="input min-h-[120px] font-mono text-xs"
              value={form.abstract}
              onChange={(e) => update("abstract", e.target.value)}
              placeholder="Paste the study abstract here..."
            />
          </div>
        </div>

        {/* Citation Preview (after study creation) */}
        {citations && citations.citations && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BookOpen className="h-4 w-4 text-phylo-blue" />
                Citation Preview
              </label>
              {copied && <span className="text-xs text-phylo-green">Copied!</span>}
            </div>
            <div className="flex gap-1 mb-3 flex-wrap">
              {citationFormats.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setActiveCitationTab(fmt)}
                  className={`px-3 py-1 text-xs rounded-md font-medium capitalize transition-colors ${
                    activeCitationTab === fmt
                      ? "bg-phylo-blue text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <div className="relative">
              <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {citations.citations[activeCitationTab]}
              </pre>
              <button
                type="button"
                onClick={() => copyCitation(citations.citations[activeCitationTab])}
                className="absolute top-2 right-2 text-gray-400 hover:text-phylo-blue p-1 rounded bg-white/80"
                title="Copy citation"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* PDF Upload */}
        <div className="card p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Full-Text PDF (optional)</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-phylo-blue transition-colors"
          >
            {pdfFile ? (
              <div className="flex items-center justify-center gap-2 text-phylo-green">
                <FileText className="h-5 w-5" />
                <span className="text-sm font-medium">{pdfFile.name}</span>
              </div>
            ) : (
              <div className="text-gray-400">
                <Upload className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Click to select a PDF file</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
          />
        </div>

        {/* Info note */}
        <div className="card p-4 bg-phylo-cream/30">
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <FileText className="h-4 w-4 text-phylo-blue mt-0.5 shrink-0" />
            <p>
              After importing, use the Screening page to include studies at full-text,
              then start risk-of-bias assessments from there. PDF processing and
              auto-extraction are available from the study's PDF viewer page.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Importing..." : "Import Study"}
          </button>
          <Link to={`/projects/${projectId}/studies`} className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
