import React, { useState, useRef, useEffect } from "react";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, AlertCircle, X, Loader2,
  Table, RefreshCw, ArrowRight, Info, HelpCircle, FileCheck, Layers
} from "lucide-react";
import { api, type ReferencePreviewResponse, type MalformedRecordDetail, type ReferenceUploadResponse } from "../../lib/api";

export interface ReferenceImportModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number, source: string) => void;
}

const SUPPORTED_FORMATS = [
  { name: "RIS", ext: ".ris", desc: "RefMan / EndNote / PubMed / Embase export" },
  { name: "BibTeX", ext: ".bib, .bibtex", desc: "LaTeX / Zotero / Mendeley export" },
  { name: "CSV (Column Mapping)", ext: ".csv", desc: "Custom tabular spreadsheets with column matching" },
  { name: "PubMed / NBIB", ext: ".nbib, .txt", desc: "PubMed 'Send to Citation Manager' format" },
  { name: "EndNote Tagged", ext: ".enw, .txt", desc: "EndNote tagged format (%0, %A, %T, %J, %X)" },
  { name: "EndNote XML", ext: ".xml", desc: "EndNote XML database export" },
  { name: "PubMed XML", ext: ".xml", desc: "NCBI PubMed E-Utilities XML" },
  { name: "Web of Science CIW", ext: ".ciw", desc: "Clarivate Web of Science export format" },
];

const TARGET_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "title", label: "Title", required: true },
  { key: "authors", label: "Authors" },
  { key: "publication_year", label: "Year" },
  { key: "journal", label: "Journal / Source" },
  { key: "doi", label: "DOI" },
  { key: "pmid", label: "PMID" },
  { key: "abstract", label: "Abstract" },
];

export function ReferenceImportModal({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: ReferenceImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<ReferencePreviewResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<ReferenceUploadResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "malformed" | "mapping">("preview");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setPreviewData(null);
      setColumnMapping({});
      setImportResult(null);
      setErrorMsg(null);
      setIsAnalyzing(false);
      setIsImporting(false);
      setActiveTab("preview");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChosen = async (file: File) => {
    setSelectedFile(file);
    setErrorMsg(null);
    setImportResult(null);
    setIsAnalyzing(true);
    setPreviewData(null);

    try {
      const res = await api.previewReferences(projectId, file);
      setPreviewData(res);

      // Auto-initialize column mapping if CSV
      if (res.columns_detected && res.columns_detected.length > 0) {
        const initMap: Record<string, string> = {};
        for (const col of res.columns_detected) {
          const lower = col.toLowerCase().trim();
          if (lower.includes("title")) initMap[col] = "title";
          else if (lower.includes("author")) initMap[col] = "authors";
          else if (lower === "year" || lower.includes("pub year") || lower.includes("publication year")) initMap[col] = "publication_year";
          else if (lower.includes("journal") || lower.includes("source")) initMap[col] = "journal";
          else if (lower.includes("doi")) initMap[col] = "doi";
          else if (lower.includes("pmid") || lower.includes("pubmed id")) initMap[col] = "pmid";
          else if (lower.includes("abstract")) initMap[col] = "abstract";
        }
        setColumnMapping(initMap);
        if (res.format === "CSV with column mapping" || file.name.endsWith(".csv")) {
          setActiveTab("mapping");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to inspect reference file");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateMapping = async (col: string, targetField: string) => {
    const updated = { ...columnMapping, [col]: targetField };
    if (!targetField) {
      delete updated[col];
    }
    setColumnMapping(updated);

    // Re-preview with new mapping
    if (selectedFile) {
      setIsAnalyzing(true);
      try {
        const res = await api.previewReferences(projectId, selectedFile, updated);
        setPreviewData(res);
      } catch (err) {
        // keep old preview if error
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setErrorMsg(null);

    try {
      const res = await api.uploadReferences(projectId, selectedFile, columnMapping);
      setImportResult(res);
      if (res.imported_count > 0) {
        onSuccess(res.imported_count, res.source);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to import references");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a0017]/40 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="relative w-full max-w-4xl bg-[#fbf9f4] rounded-xl shadow-2xl border border-[#d2c2cb] flex flex-col max-h-[90vh] text-[#4f444b]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d2c2cb] px-6 py-4 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#3a0f34] text-[#fbf9f4]">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-[#3a0f34]">
                Import Bibliographic References
              </h2>
              <p className="text-xs text-[#62535d]">
                Support for RIS, BibTeX, CSV, PubMed/NBIB, EndNote Tagged, EndNote XML, PubMed XML, and Web of Science CIW
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#81737b] hover:text-[#3a0f34] hover:bg-[#eee7ec] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Upload Dropzone */}
          {!importResult && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileChosen(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-[#814d75] bg-[#eee7ec]"
                  : selectedFile
                  ? "border-[#3a0f34] bg-white"
                  : "border-[#d2c2cb] hover:border-[#814d75] bg-white hover:bg-[#eee7ec]/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".ris,.bib,.bibtex,.csv,.nbib,.xml,.enw,.ciw,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChosen(e.target.files[0]);
                  }
                }}
              />
              <div className="flex flex-col items-center gap-2">
                {selectedFile ? (
                  <>
                    <FileCheck className="w-8 h-8 text-[#3a0f34] animate-in zoom-in-75 duration-200" />
                    <div className="text-sm font-semibold text-[#3a0f34]">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-[#62535d]">
                      {(selectedFile.size / 1024).toFixed(1)} KB &bull; Click to change file
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[#814d75]" />
                    <div className="text-sm font-medium text-[#4f444b]">
                      Drag and drop your reference file here, or <span className="text-[#814d75] underline font-semibold">browse</span>
                    </div>
                    <div className="text-xs text-[#81737b] max-w-md">
                      Accepts .ris, .bib, .csv, .nbib, .enw, .ciw, .xml, .txt
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Format Badges Grid */}
          {!previewData && !importResult && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#81737b]">
                Supported Database &amp; Manager Formats
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUPPORTED_FORMATS.map((fmt) => (
                  <div
                    key={fmt.name}
                    className="p-2.5 rounded-lg border border-[#d2c2cb] bg-white flex flex-col justify-between"
                  >
                    <div className="text-xs font-medium text-[#4f444b]">
                      {fmt.name}
                    </div>
                    <div className="text-[11px] text-[#81737b] font-mono mt-0.5">
                      {fmt.ext}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[#62535d] flex items-center gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 text-[#814d75] flex-shrink-0" />
                <span>Automatic format detection inspects headers, tags, and markers. Compressed batch archives (ZIP / GZ) planned in upcoming release.</span>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isAnalyzing && (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-[#62535d]">
              <Loader2 className="w-6 h-6 animate-spin text-[#814d75]" />
              <div className="text-sm font-medium">Detecting format & parsing reference records...</div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Import Complete Card */}
          {importResult && (
            <div className="space-y-4">
              <div className="p-6 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-[#7c5800] mx-auto" />
                <h3 className="text-lg font-semibold text-[#3a0f34]">
                  Import Completed Successfully
                </h3>
                <p className="text-sm text-[#4f444b]">
                  Added <strong>{importResult.imported_count}</strong> new studies to your review.
                  {importResult.skipped_duplicates > 0 && (
                    <span> ({importResult.skipped_duplicates} duplicate records safely skipped).</span>
                  )}
                </p>
                {importResult.format && (
                  <div className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-[#ffdea6] text-[#7c5800] border border-[#d2c2cb]">
                    Format: {importResult.format}
                  </div>
                )}
              </div>

              {/* Malformed records if any were detected during import */}
              {importResult.malformed_records && importResult.malformed_records.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{importResult.malformed_records.length} Malformed or Incomplete Records Ignored</span>
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    These entries had missing titles or unparseable syntax and were safely excluded from insertion:
                  </div>
                  <ul className="text-xs space-y-1 max-h-32 overflow-y-auto pl-4 list-disc text-amber-900 dark:text-amber-200">
                    {importResult.malformed_records.map((m, idx) => (
                      <li key={idx}>
                        {m.index ? `Record #${m.index}: ` : ""}{m.reason}
                        {m.snippet && <span className="opacity-75"> - {m.snippet.slice(0, 70)}...</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Format Detected & Inspection Workspace */}
          {previewData && !importResult && !isAnalyzing && (
            <div className="space-y-4">
              {/* Format Badge Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[#eee7ec] border border-[#d2c2cb]">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-[#62535d] uppercase tracking-wider">
                    Format Detected:
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb]">
                    {previewData.format}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#62535d]">
                  <span><strong className="text-[#3a0f34]">{previewData.total_valid}</strong> valid</span>
                  {previewData.total_malformed > 0 && (
                    <span className="text-[#814d75] font-medium">
                      &bull; <strong>{previewData.total_malformed}</strong> malformed
                    </span>
                  )}
                  <span>&bull; {previewData.total_found} total detected</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#d2c2cb] gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                    activeTab === "preview"
                      ? "border-[#3a0f34] text-[#3a0f34]"
                      : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Preview Records ({previewData.preview_records.length})</span>
                </button>

                {previewData.columns_detected && previewData.columns_detected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("mapping")}
                    className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                      activeTab === "mapping"
                        ? "border-[#3a0f34] text-[#3a0f34]"
                        : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>CSV Column Mapping ({previewData.columns_detected.length} columns)</span>
                  </button>
                )}

                {previewData.malformed_records && previewData.malformed_records.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("malformed")}
                    className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                      activeTab === "malformed"
                        ? "border-[#ab3329] text-[#ab3329]"
                        : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-[#ab3329]" />
                    <span>Malformed Records ({previewData.malformed_records.length})</span>
                  </button>
                )}
              </div>

              {/* Tab: Preview Records */}
              {activeTab === "preview" && (
                <div className="space-y-3">
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-[#d2c2cb] divide-y divide-[#eee7ec] bg-white">
                    {previewData.preview_records.map((rec, idx) => (
                      <div key={idx} className="p-3 text-xs space-y-1 hover:bg-[#eee7ec]/50 transition-colors">
                        <div className="font-serif font-bold text-[#3a0f34] line-clamp-1">
                          {rec.title || <span className="text-[#ab3329]">Untitled</span>}
                        </div>
                        <div className="text-[#62535d] flex flex-wrap gap-2 text-[11px]">
                          {rec.authors && <span><strong>Authors:</strong> {rec.authors}</span>}
                          {rec.publication_year && <span><strong>Year:</strong> {rec.publication_year}</span>}
                          {rec.journal && <span><strong>Journal:</strong> {rec.journal}</span>}
                          {rec.doi && <span className="font-mono text-[#814d75]">DOI: {rec.doi}</span>}
                        </div>
                        {rec.abstract && (
                          <div className="text-[11px] text-[#4f444b] line-clamp-2 italic pt-0.5 font-serif">
                            "{rec.abstract}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#81737b]">
                    Showing first {previewData.preview_records.length} of {previewData.total_valid} valid parsed references.
                  </div>
                </div>
              )}

              {/* Tab: Column Mapping for CSV */}
              {activeTab === "mapping" && (
                <div className="space-y-3">
                  <div className="text-xs text-[#62535d]">
                    Map columns in your CSV file to standard review fields. Title is mandatory.
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-[#d2c2cb] divide-y divide-[#eee7ec] p-2 bg-white">
                    {previewData.columns_detected.map((col) => {
                      const currentMapped = columnMapping[col] || "";
                      return (
                        <div key={col} className="flex items-center justify-between py-2 px-3 text-xs">
                          <span className="font-mono font-medium text-[#4f444b]">
                            {col}
                          </span>
                          <div className="flex items-center gap-2">
                            <ArrowRight className="w-3.5 h-3.5 text-[#81737b]" />
                            <select
                              value={currentMapped}
                              onChange={(e) => handleUpdateMapping(col, e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border border-[#d2c2cb] bg-[#fbf9f4] text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                            >
                              <option value="">-- Ignore Column --</option>
                              {TARGET_FIELDS.map((tf) => (
                                <option key={tf.key} value={tf.key}>
                                  {tf.label} {tf.required ? "(Required)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab: Malformed Records */}
              {activeTab === "malformed" && (
                <div className="space-y-3">
                  <div className="text-xs text-[#62535d]">
                    These items in the file had formatting or missing title defects. They will be skipped automatically to maintain dataset integrity.
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-[#ab3329]/30 bg-[#ab3329]/5 divide-y divide-[#ab3329]/20">
                    {previewData.malformed_records.map((m, idx) => (
                      <div key={idx} className="p-3 text-xs space-y-1">
                        <div className="font-semibold text-[#ab3329] flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#ab3329] flex-shrink-0" />
                          <span>{m.index ? `Row #${m.index}: ` : ""}{m.reason}</span>
                        </div>
                        {m.snippet && (
                          <div className="font-mono text-[11px] text-[#ab3329] bg-white p-1.5 rounded border border-[#ab3329]/20 truncate">
                            {m.snippet}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#d2c2cb] px-6 py-4 bg-white">
          <div className="text-xs text-[#62535d]">
            {selectedFile && !importResult && (
              <span>Ready to import into project studies</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] border border-[#d2c2cb] rounded-lg transition-colors cursor-pointer"
            >
              {importResult ? "Close" : "Cancel"}
            </button>
            {!importResult && (
              <button
                type="button"
                disabled={!selectedFile || isAnalyzing || isImporting || (previewData ? previewData.total_valid === 0 : true)}
                onClick={handleImport}
                className="px-4 py-2 text-xs font-semibold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>
                      Import {previewData ? `${previewData.total_valid} References` : "References"}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
