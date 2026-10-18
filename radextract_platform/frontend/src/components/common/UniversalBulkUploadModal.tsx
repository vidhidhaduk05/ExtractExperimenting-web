import React, { useState, useRef, useEffect } from "react";
import {
  Upload, FileText, CheckCircle2, AlertCircle, X, Loader2, Sparkles,
  FolderPlus, FileSpreadsheet, ShieldCheck, ArrowRight, RefreshCw, File
} from "lucide-react";
import { autoIdentifyPdf, type AutoIdentifiedStudy } from "../../lib/pdfAutoIdentifier";
import { api, type Study } from "../../lib/api";
import * as XLSX from "xlsx";

export interface UniversalBulkUploadModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultTarget?: "screening" | "extraction";
  onSuccess: (count: number, target: "screening" | "extraction", firstStudyId?: string) => void;
}

interface QueuedFile {
  id: string;
  file: globalThis.File;
  name: string;
  size: number;
  type: string;
  status: "queued" | "identifying" | "success" | "error";
  errorMsg?: string;
  identifiedStudy?: AutoIdentifiedStudy;
}

export function UniversalBulkUploadModal({
  projectId,
  isOpen,
  onClose,
  defaultTarget = "extraction",
  onSuccess,
}: UniversalBulkUploadModalProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [targetWorkflow, setTargetWorkflow] = useState<"screening" | "extraction">(defaultTarget);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeStep, setActiveStep] = useState<"select" | "processing" | "complete">("select");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync default target if changed
  useEffect(() => {
    setTargetWorkflow(defaultTarget);
  }, [defaultTarget]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setQueuedFiles([]);
      setIsProcessing(false);
      setActiveStep("select");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddFiles = (files: globalThis.File[]) => {
    if (!files || files.length === 0) return;

    const newItems: QueuedFile[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.name.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls") || f.name.toLowerCase().endsWith(".csv")
        ? "spreadsheet"
        : f.name.toLowerCase().endsWith(".ris") || f.name.toLowerCase().endsWith(".bib")
        ? "citation"
        : "other",
      status: "queued",
    }));

    setQueuedFiles((prev) => {
      // Avoid duplicate file names in the active list
      const existingNames = new Set(prev.map((p) => p.name));
      const filtered = newItems.filter((item) => !existingNames.has(item.name));
      return [...prev, ...filtered];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedList = Array.from(e.dataTransfer.files);
      handleAddFiles(droppedList);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const removeFile = (id: string) => {
    if (isProcessing) return;
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    if (isProcessing) return;
    setQueuedFiles([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Process all queued files
  const handleStartUpload = async () => {
    if (queuedFiles.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setActiveStep("processing");

    const createdStudies: Study[] = [];
    const isDirectExtraction = targetWorkflow === "extraction";

    for (let i = 0; i < queuedFiles.length; i++) {
      const item = queuedFiles[i];

      setQueuedFiles((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "identifying" } : q))
      );

      try {
        if (item.type === "pdf") {
          // Client-side auto identification to extract title, author, year, abstract, DOI
          const identified = await autoIdentifyPdf(item.file, projectId);

          if (isDirectExtraction) {
            identified.screening_status = "included";
            identified.screening_stage = "fulltext";
            identified.extraction_status = "complete";
          } else {
            identified.screening_status = "pending";
            identified.screening_stage = "ta";
            identified.extraction_status = "pending";
          }

          createdStudies.push(identified as unknown as Study);

          // Upload binary if backend is running
          try {
            await api.uploadPdf(identified.study_id, item.file);
          } catch (e) {
            // Non-fatal, local fallback is already registered
          }

          setQueuedFiles((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? { ...q, status: "success", identifiedStudy: identified }
                : q
            )
          );
        } else if (item.type === "spreadsheet") {
          // Parse spreadsheet studies with SheetJS
          const buffer = await item.file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: "array" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);

          if (rows.length > 0) {
            rows.forEach((row, rowIdx) => {
              const studyTitle = row["Title"] || row["title"] || row["Study Title"] || row["Study"] || `Study #${rowIdx + 1} from ${item.name}`;
              const authors = row["Authors"] || row["Author"] || row["authors"] || "Curated Authors";
              const year = Number(row["Year"] || row["publication_year"] || 2024) || 2024;
              const journal = row["Journal"] || row["journal"] || "Curated Journal";
              const abstract = row["Abstract"] || row["abstract"] || `Imported clinical study from curated dataset ${item.name}.`;
              const doi = row["DOI"] || row["doi"] || "";

              const spreadsheetStudy: Study = {
                study_id: `study_excel_${Date.now()}_${rowIdx}`,
                project_id: projectId,
                title: studyTitle,
                authors,
                publication_year: year,
                journal,
                doi,
                pmid: "",
                abstract,
                study_design: "retrospective cohort",
                source: "Curated Excel Upload",
                screening_status: isDirectExtraction ? "included" : "pending",
                screening_stage: isDirectExtraction ? "fulltext" : "ta",
                screening_reason: "",
                extraction_status: isDirectExtraction ? "complete" : "pending",
                pdf_status: "parsed",
                pdf_path: `${item.name}#row${rowIdx + 1}`,
                ai_priority_score: 0.95,
                ai_confidence: 0.95,
                ai_decision: "include",
              };
              createdStudies.push(spreadsheetStudy);
            });
          }

          setQueuedFiles((prev) =>
            prev.map((q, idx) => (idx === i ? { ...q, status: "success" } : q))
          );
        } else {
          // Citation or generic text
          await api.uploadReferences(projectId, [item.file]);
          setQueuedFiles((prev) =>
            prev.map((q, idx) => (idx === i ? { ...q, status: "success" } : q))
          );
        }
      } catch (err: any) {
        setQueuedFiles((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? { ...q, status: "error", errorMsg: err?.message || "Failed to identify study" }
              : q
          )
        );
      }
    }

    if (createdStudies.length > 0) {
      await api.bulkAddStudies(projectId, createdStudies);
    }

    setIsProcessing(false);
    setActiveStep("complete");

    setTimeout(() => {
      const firstId = createdStudies[0]?.study_id;
      onSuccess(createdStudies.length || queuedFiles.length, targetWorkflow, firstId);
      onClose();
    }, 900);
  };

  const successCount = queuedFiles.filter((q) => q.status === "success").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans animate-in fade-in duration-200"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="bg-[#FAF9F3] border border-black/10 rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#141413] text-[#FAF9F3] flex items-center justify-center shadow-xs">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#141413] tracking-tight">
                  Bulk Upload from Laptop
                </h3>
                <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">
                  MULTI-FILE READY
                </span>
              </div>
              <p className="font-serif italic text-xs text-[#6B665E] mt-0.5">
                Drop multiple study PDFs, Excel sheets, or citations directly from your laptop.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-full text-black/40 hover:text-black hover:bg-black/5 transition-colors disabled:opacity-40"
            title="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Target Workflow Switcher */}
          <div className="bg-white border border-black/10 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8A817A] block">
              TARGET DESTINATION IN PROJECT:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetWorkflow("extraction")}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 ${
                  targetWorkflow === "extraction"
                    ? "bg-[#141413] text-[#FAF9F3] border-[#141413] shadow-xs"
                    : "bg-white text-[#141413] border-black/10 hover:border-black/30"
                }`}
              >
                <FileSpreadsheet className={`h-4 w-4 mt-0.5 shrink-0 ${targetWorkflow === "extraction" ? "text-[#E9ED4C]" : "text-[#141413]"}`} />
                <div>
                  <div className="font-serif font-medium text-xs">Direct Data Extraction Sheet</div>
                  <div className={`text-[11px] mt-0.5 ${targetWorkflow === "extraction" ? "text-[#FAF9F3]/70" : "text-[#6B665E]"}`}>
                    Auto-includes studies and immediately loads them into the extraction matrix & PDF quotes.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetWorkflow("screening")}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 ${
                  targetWorkflow === "screening"
                    ? "bg-[#141413] text-[#FAF9F3] border-[#141413] shadow-xs"
                    : "bg-white text-[#141413] border-black/10 hover:border-black/30"
                }`}
              >
                <ShieldCheck className={`h-4 w-4 mt-0.5 shrink-0 ${targetWorkflow === "screening" ? "text-emerald-400" : "text-[#141413]"}`} />
                <div>
                  <div className="font-serif font-medium text-xs">AI Screening Queue</div>
                  <div className={`text-[11px] mt-0.5 ${targetWorkflow === "screening" ? "text-[#FAF9F3]/70" : "text-[#6B665E]"}`}>
                    Places studies into Title & Abstract screening queue with keyboard hotkeys & AI ratings.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Primary Laptop Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none ${
              isDragging
                ? "border-[#141413] bg-[#E9ED4C]/25 scale-[0.99] ring-4 ring-[#E9ED4C]/30"
                : "border-black/20 hover:border-black/50 bg-white/70 hover:bg-white shadow-2xs hover:shadow-xs"
            }`}
          >
            <input
              id="laptop-bulk-file-input"
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.PDF,.xlsx,.XLSX,.xls,.XLS,.csv,.CSV,.ris,.bib,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddFiles(Array.from(e.target.files));
                }
                e.target.value = "";
              }}
            />

            <div className="space-y-3 pointer-events-auto">
              <div className="h-12 w-12 rounded-full bg-black/[0.05] text-[#141413] flex items-center justify-center mx-auto transition-transform group-hover:scale-105">
                <Upload className="h-6 w-6 text-[#141413]" />
              </div>

              <div>
                <p className="font-serif text-base font-normal text-[#141413]">
                  Click to select or drag & drop files from your laptop
                </p>
                <p className="font-sans text-xs text-[#6B665E] mt-1">
                  Supports selecting multiple files simultaneously (e.g. hold Ctrl or Shift)
                </p>
              </div>

              <div className="pt-1 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="btn-phylo-primary text-xs inline-flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#E9ED4C]" />
                  <span>Browse Laptop Files</span>
                </button>
              </div>

              <p className="text-[11px] font-mono text-[#8A817A] pt-1">
                Supports: <strong className="text-[#141413]">.PDF</strong> (Full text papers) &bull; <strong className="text-[#141413]">.XLSX / .CSV</strong> (Curated datasets) &bull; <strong className="text-[#141413]">.RIS / .BIB</strong> (Citations)
              </p>
            </div>
          </div>

          {/* Queued Files List */}
          {queuedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6B665E]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#141413]">Selected Files ({queuedFiles.length})</span>
                  <span>&bull;</span>
                  <span>{formatFileSize(queuedFiles.reduce((acc, f) => acc + f.size, 0))}</span>
                </div>
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={clearAllFiles}
                    className="text-[11px] font-mono text-rose-700 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto space-y-1.5 border border-black/10 rounded-xl p-2 bg-white/80">
                {queuedFiles.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-black/[0.02] border border-black/[0.04]"
                  >
                    <div className="flex items-center gap-2.5 truncate pr-3">
                      {item.type === "pdf" ? (
                        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                      ) : item.type === "spreadsheet" ? (
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <File className="h-4 w-4 text-[#8A817A] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-mono text-xs font-medium text-[#141413] truncate">{item.name}</div>
                        <div className="text-[10px] text-[#8A817A] flex items-center gap-2">
                          <span>{formatFileSize(item.size)}</span>
                          {item.identifiedStudy && (
                            <>
                              <span>&bull;</span>
                              <span className="text-emerald-700 truncate font-serif">
                                {item.identifiedStudy.title}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 font-mono text-[11px]">
                      {item.status === "queued" && (
                        <span className="px-2 py-0.5 rounded-full bg-black/[0.05] text-[#8A817A]">
                          Ready
                        </span>
                      )}
                      {item.status === "identifying" && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Processing
                        </span>
                      )}
                      {item.status === "success" && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Converted
                        </span>
                      )}
                      {item.status === "error" && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Error
                        </span>
                      )}

                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          className="p-1 text-[#8A817A] hover:text-rose-700 hover:bg-rose-50 rounded"
                          title="Remove file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-black/[0.08] shrink-0">
          <div className="text-xs text-[#6B665E]">
            {isProcessing ? (
              <span className="flex items-center gap-1.5 font-medium text-[#141413]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                Processing {successCount} of {queuedFiles.length} papers...
              </span>
            ) : queuedFiles.length > 0 ? (
              <span>
                <strong>{queuedFiles.length}</strong> file(s) selected
              </span>
            ) : (
              <span>Select files from your laptop to begin</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="btn-phylo-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartUpload}
              disabled={queuedFiles.length === 0 || isProcessing}
              className="btn-phylo-primary text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing Laptop Upload...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    Upload & Auto-Identify ({queuedFiles.length})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
