import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { autoIdentifyPdf } from "../lib/pdfAutoIdentifier";
import {
  ArrowLeft, Upload, FileText, CheckCircle, Search, Loader2,
  BookOpen, ExternalLink, Copy, Sparkles, CheckCircle2, ArrowRight
} from "lucide-react";

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
  const [isAutoIdentifying, setIsAutoIdentifying] = useState(false);
  const [autoIdentifiedBadge, setAutoIdentifiedBadge] = useState<string | null>(null);
  const [directExtract, setDirectExtract] = useState(true);
  const [error, setError] = useState("");
  const [createdStudyId, setCreatedStudyId] = useState<string | null>(null);
  const [activeCitationTab, setActiveCitationTab] = useState("vancouver");
  const [copied, setCopied] = useState(false);

  // Multi-Database Preview / Dry-run state
  const [previewQuery, setPreviewQuery] = useState("");

  // Multi-Database Preview dry-run mutation
  const previewMutation = useMutation({
    mutationFn: (query: string) =>
      api.searchMultiDatabase({ query, sources: ['PubMed', 'OpenAlex'], max_per_source: 5 }),
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
    enabled: false,
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
      refetchCitations();

      if (directExtract) {
        setTimeout(() => navigate(`/projects/${projectId}/extraction-sheet?study=${study.study_id}`), 1000);
      } else {
        setTimeout(() => navigate(`/projects/${projectId}/studies`), 2000);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const handlePdfSelected = async (file: File) => {
    setPdfFile(file);
    setIsAutoIdentifying(true);
    setError("");
    try {
      const identified = await autoIdentifyPdf(file, projectId);
      setForm({
        title: identified.title,
        authors: identified.authors,
        publication_year: String(identified.publication_year),
        journal: identified.journal,
        doi: identified.doi,
        pmid: identified.pmid || "",
        abstract: identified.abstract,
        study_design: identified.study_design,
        source: "PDF Auto-Extraction",
      });
      setAutoIdentifiedBadge(`Auto-identified: "${identified.title}" (${identified.publication_year}, ${identified.journal})`);
    } catch (err: any) {
      setError(`Failed to parse PDF metadata: ${err?.message || "Unknown error"}`);
    } finally {
      setIsAutoIdentifying(false);
    }
  };

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
      screening_status: directExtract ? "included" : "pending",
      screening_stage: directExtract ? "fulltext" : "title_abstract",
      extraction_status: directExtract ? "complete" : "pending",
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
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <Link to={`/projects/${projectId}/studies`} className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 font-sans">
        <ArrowLeft className="h-3 w-3" /> Back to studies
      </Link>

      <div>
        <h1 className="text-2xl font-serif font-bold text-[#3a0f34]">Import Study</h1>
        <p className="text-[#62535d] text-sm mt-1 font-sans">
          Upload a study PDF to auto-identify all metadata into JSON without manual typing, or look up via PubMed PMID.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[#fff2f2] border border-[#d2c2cb] px-4 py-3 text-sm text-[#a42b2b]">
          {error}
        </div>
      )}

      {createMutation.isSuccess && (
        <div className="rounded-xl bg-[#f4fbf7] border border-[#d2c2cb] px-4 py-3 text-sm text-[#2d6a4f] flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          Study imported successfully{pdfUploaded ? " with PDF registered" : ""}. {directExtract ? "Navigating to Extraction Sheet..." : "Redirecting..."}
        </div>
      )}

      {/* Primary Auto-Identification Dropzone */}
      <div className="bg-[#ffffff] p-6 rounded-xl border border-[#d2c2cb] hover:border-[#814d75] transition-all shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-sm font-serif font-semibold text-[#3a0f34]">
            <Sparkles className="h-4 w-4 text-[#7c5800]" />
            PDF Auto-Identification & Instant JSON Conversion
          </label>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#ffdea6] text-[#3a0f34] font-mono font-medium border border-[#d2c2cb]">
            RECOMMENDED (NO MANUAL TYPING)
          </span>
        </div>
        <p className="text-xs text-[#62535d] mb-4 font-sans">
          Drop your study PDF here. The engine will extract the title, authors, year, journal, DOI, abstract, and study design automatically.
        </p>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handlePdfSelected(f);
          }}
          className="border border-[#d2c2cb] rounded-lg p-6 text-center cursor-pointer bg-[#fbf9f4] hover:bg-[#ffffff] transition-all"
        >
          {isAutoIdentifying ? (
            <div className="flex flex-col items-center justify-center gap-2 text-[#7c5800] py-2">
              <Loader2 className="h-7 w-7 animate-spin text-[#814d75]" />
              <span className="text-xs font-serif font-medium">Auto-identifying clinical metadata from PDF...</span>
            </div>
          ) : pdfFile ? (
            <div className="flex flex-col items-center justify-center gap-1.5 text-[#2d6a4f]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#2d6a4f]" />
                <span className="text-sm font-medium font-sans">{pdfFile.name}</span>
              </div>
              <span className="text-xs text-[#2d6a4f] font-mono">PDF Loaded & Parsed to JSON</span>
            </div>
          ) : (
            <div className="text-[#81737b] py-2">
              <Upload className="h-7 w-7 mx-auto mb-1.5 text-[#814d75]" />
              <p className="text-sm font-serif font-medium text-[#3a0f34]">Drop PDF here or click to browse</p>
              <p className="text-[11px] font-sans text-[#81737b] mt-0.5">Supports academic and clinical publications (.pdf)</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePdfSelected(f);
          }}
        />

        {autoIdentifiedBadge && (
          <div className="mt-3.5 p-3 rounded-lg bg-[#fbf9f4] border border-[#d2c2cb] text-xs font-sans text-[#4f444b] flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#814d75] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block text-[#3a0f34]">{autoIdentifiedBadge}</span>
              <span className="text-[11px] text-[#62535d] block">Form fields below have been pre-filled automatically. You can review them or submit directly.</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Direct Extraction Fast-Track Option */}
        <div className="bg-[#ffffff] p-4 rounded-xl flex items-start gap-3 border border-[#d2c2cb]">
          <input
            id="directExtract"
            type="checkbox"
            checked={directExtract}
            onChange={(e) => setDirectExtract(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-[#d2c2cb] text-[#3a0f34] focus:ring-[#814d75] accent-[#3a0f34]"
          />
          <label htmlFor="directExtract" className="text-xs space-y-0.5 cursor-pointer">
            <span className="font-serif font-medium text-[#3a0f34] block">
              Direct Data Extraction Mode (Skip manual screening)
            </span>
            <span className="font-sans text-[#62535d] block leading-relaxed">
              Auto-includes this study and immediately redirects to the Extraction Sheet for variable review.
            </span>
          </label>
        </div>

        {/* Study Details Form (Pre-filled) */}
        <div className="bg-[#ffffff] p-6 rounded-xl border border-[#d2c2cb] space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-3">
            <h2 className="font-serif text-base font-semibold text-[#3a0f34]">Study Information</h2>
            <span className="text-[10px] font-mono text-[#81737b]">
              {autoIdentifiedBadge ? "AUTO-IDENTIFIED" : "MANUAL / PUBMED"}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Title *</label>
            <input
              className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Endovascular treatment of pure arterial malformations"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Authors</label>
              <input
                className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
                value={form.authors}
                onChange={(e) => update("authors", e.target.value)}
                placeholder="e.g. Chua et al."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Publication Year</label>
              <input
                className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
                type="number"
                value={form.publication_year}
                onChange={(e) => update("publication_year", e.target.value)}
                placeholder="e.g. 2021"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Journal</label>
              <input
                className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
                value={form.journal}
                onChange={(e) => update("journal", e.target.value)}
                placeholder="e.g. World Neurosurgery"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Study Design</label>
              <select
                className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
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
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">DOI</label>
              <input
                className="input text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
                value={form.doi}
                onChange={(e) => update("doi", e.target.value)}
                placeholder="e.g. 10.1016/j.wneu.2021.05.012"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">PMID</label>
              <div className="flex gap-2">
                <input
                  className="input text-xs flex-1 bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
                  value={form.pmid}
                  onChange={(e) => update("pmid", e.target.value)}
                  placeholder="e.g. 34023533"
                />
                <button
                  type="button"
                  onClick={handlePmidLookup}
                  disabled={pmidLookupMutation.isPending}
                  className="px-3 py-1.5 rounded-lg border border-[#d2c2cb] bg-[#ffffff] text-[#3a0f34] hover:bg-[#eee7ec] text-xs shrink-0 font-medium font-sans transition-colors"
                >
                  {pmidLookupMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Lookup"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4f444b] mb-1 font-sans">Abstract</label>
            <textarea
              className="input min-h-[100px] font-mono text-xs w-full bg-[#fbf9f4] border border-[#d2c2cb] text-[#4f444b] focus:border-[#814d75] rounded-lg p-2.5"
              value={form.abstract}
              onChange={(e) => update("abstract", e.target.value)}
              placeholder="Study abstract text..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-medium font-sans text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : directExtract ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Import & Jump to Extraction Sheet</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            ) : (
              <span>Import Study</span>
            )}
          </button>
          <Link
            to={`/projects/${projectId}/studies`}
            className="px-4 py-2 rounded-lg border border-[#d2c2cb] bg-[#ffffff] text-[#3a0f34] hover:bg-[#eee7ec] font-medium font-sans text-xs transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
