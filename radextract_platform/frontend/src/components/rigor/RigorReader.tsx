import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, CheckCircle2, AlertTriangle, AlertOctagon, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { RigorCheckItem } from "../../data/dubowitzRigorData";

interface RigorReaderProps {
  totalPages?: number;
  selectedCheck?: RigorCheckItem | null;
  targetPage?: number;
  onPageChange?: (page: number) => void;
}

export const RigorReader: React.FC<RigorReaderProps> = ({
  totalPages = 16,
  selectedCheck,
  targetPage,
  onPageChange,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [activePage, setActivePage] = useState<number>(selectedCheck?.page || 1);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 160));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 70));
  const handleResetZoom = () => setZoom(100);

  // Synchronize targetPage or selectedCheck.page
  useEffect(() => {
    const pageNum = targetPage || selectedCheck?.page || 1;
    setActivePage(pageNum);
    if (pageRefs.current[pageNum]) {
      pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetPage, selectedCheck]);

  const goToPage = (newPage: number) => {
    const p = Math.max(1, Math.min(newPage, totalPages));
    setActivePage(p);
    onPageChange?.(p);
    pageRefs.current[p]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Scientific manuscript typesetting simulation
  const renderPageContent = (pageNum: number) => {
    const isCurrentPage = selectedCheck?.page === pageNum;

    return (
      <div className="relative p-6 sm:p-8 text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-serif select-none space-y-3.5">
        {/* Academic Journal Header */}
        <div className="flex justify-between items-center border-b pb-1.5 text-[8.5px] font-mono text-zinc-400">
          <span>PLOS ONE | https://doi.org/10.1371/journal.pone.0293905</span>
          <span>November 2023 | Volume 18 | Issue 11</span>
        </div>

        {pageNum === 1 && (
          <div className="space-y-3">
            <div className="inline-block px-2 py-0.5 rounded text-[8.5px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              RESEARCH ARTICLE · OPEN ACCESS
            </div>
            <h1 className="text-base sm:text-lg font-bold font-sans tracking-tight text-zinc-900 dark:text-zinc-100 leading-snug">
              Type of anesthesia for cancer resection surgery: No differential impact on cancer recurrence in mouse models of breast cancer
            </h1>
            <p className="text-[10px] font-sans text-zinc-600 dark:text-zinc-400">
              Grant Dubowitz, Elazar Zelicof, Rachel Margalit, et al.
            </p>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5 space-y-1.5">
              <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
                Abstract
              </h2>
              <p className="text-[10px] leading-normal text-zinc-700 dark:text-zinc-300">
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">Background:</strong> Retrospective human analyses suggested volatile anesthesia may be associated with inferior oncologic recurrence compared to propofol. 
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100"> Methods:</strong> We tested whether sevoflurane vs total intravenous propofol alters primary recurrence in syngeneic orthotopic murine 4T1 and E0771 models.
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100"> Results:</strong> Rigorous blinded assessment of 120 animals revealed no significant difference in spontaneous metastasis or recurrence rates across multiple cohorts.
              </p>
            </div>
          </div>
        )}

        {pageNum === 2 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              Introduction & Study Design
            </h2>
            <p>
              Primary tumor surgery remains the cornerstone of curative therapy for non-metastatic solid malignancies. However, surgical manipulation and perioperative stress are hypothesized to release circulating tumor cells and promote immunosuppression.
            </p>
            <p className="p-2 rounded bg-amber-50/60 dark:bg-amber-950/30 border-l-2 border-amber-500 text-[10.5px]">
              "We hypothesized that choice of anesthetic agent (volatile sevoflurane vs intravenous propofol) during primary tumor resection affects metastatic recurrence."
            </p>
            <p>
              Preclinical models enable rigorous control over surgical parameters, dosing kinetics, and immunological background, avoiding confounding prevalent in observational human studies.
            </p>
          </div>
        )}

        {pageNum === 3 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              Materials & Methods: Interventions & Cell Authentication
            </h2>
            <p>
              Primary tumor surgeries were executed under standardized aseptic conditions. Murine 4T1 mammary carcinoma cells expressing firefly luciferase were cultured in RPMI 1640 supplemented with 10% fetal bovine serum.
            </p>
            <p className="p-2 rounded bg-emerald-50/60 dark:bg-emerald-950/30 border-l-2 border-emerald-500 text-[10.5px]">
              "Cell line identities were confirmed by short tandem repeat profiling (Cellbank, Australia). Mycoplasma testing was routinely performed by PCR prior to implantation."
            </p>
            <p>
              Animals were maintained in specific-pathogen-free housing under 12-hour light/dark cycles with temperature regulation (22 ± 2°C). Surgical resections were conducted under continuous monitoring with pulse oximetry and core rectal thermal probes.
            </p>
          </div>
        )}

        {pageNum === 4 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              Randomization, Blinding & In Vivo Protocol
            </h2>
            <p>
              Mice were randomly allocated to volatile sevoflurane (2.1% minimum alveolar concentration in 100% O₂) or intravenous propofol infusion (15 mg/kg induction, followed by 30 mg/kg/h continuous infusion).
            </p>
            <p className="p-2 rounded bg-emerald-50/60 dark:bg-emerald-950/30 border-l-2 border-emerald-500 text-[10.5px]">
              "Investigators measuring tumor burden and performing bioluminescence flux quantification were fully blinded to treatment allocation throughout experimental series."
            </p>
            <p>
              Animals were monitored daily for humane endpoints. Post-mortem macroscopic necropsies and lung histology were conducted to quantify micrometastases.
            </p>
          </div>
        )}

        {pageNum === 5 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              Statistical Analysis & Inter-Observer Agreement
            </h2>
            <p>
              Kaplan-Meier survival curves indicated no statistically significant difference in disease-free survival between sevoflurane and propofol cohorts (hazard ratio: 0.94, 95% CI: 0.68–1.31, p = 0.72).
            </p>
            <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center text-[9px] font-mono text-zinc-500">
              <span>[Figure 2: Bioluminescent total flux vs days post-resection (n = 30 per group)]</span>
              <span className="text-[8px] text-zinc-400">Repeated measures ANOVA p = 0.81</span>
            </div>
            <p className="p-2 rounded bg-emerald-50/60 dark:bg-emerald-950/30 border-l-2 border-emerald-500 text-[10.5px]">
              "Analysis of variance and generalized linear models accounting for surgical batch effects confirmed that neither induction speed nor anesthetic maintenance altered circulating tumor cells."
            </p>
          </div>
        )}

        {pageNum >= 6 && pageNum <= 11 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              {pageNum === 6 ? "Results: Spontaneous Pulmonary Recurrence" : pageNum === 7 ? "Results: Secondary Immune Activation" : pageNum === 8 ? "Results: Flow Cytometry & Circulating Cells" : "Detailed Multivariable Diagnostics"}
            </h2>
            <p>
              Circulating CD4+ and CD8+ T-cell subsets, regulatory T-cells (Tregs), and natural killer (NK) cells were analyzed by multi-color flow cytometry 72 hours postoperatively. Neither anesthetic regimen demonstrated differential immunosuppression.
            </p>
            <div className="h-16 rounded bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-[9px] font-mono text-zinc-500">
              [Table {pageNum - 4}: Flow cytometry cell frequencies and subset ratios across surgical cohorts]
            </div>
          </div>
        )}

        {pageNum >= 12 && (
          <div className="space-y-2.5">
            <h2 className="font-bold text-[10px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              {pageNum === 12 ? "Discussion & Translational Caveats" : pageNum === 13 ? "Limitations of Preclinical Models" : "Data Availability & Acknowledgments"}
            </h2>
            <p>
              In conclusion, this randomized preclinical evaluation provides robust negative evidence against the hypothesis that volatile anesthesia drives breast cancer recurrence. These findings caution against altering oncologic anesthetic regimens in the absence of completed Phase III trials.
            </p>
            <div className="border-t pt-2 mt-2 text-[9px] text-zinc-500 space-y-1">
              <p className="font-sans font-semibold text-zinc-700 dark:text-zinc-300">Data Availability Statement:</p>
              <p className="font-mono text-[8.5px]">
                Raw bioluminescence series, histology slide scans, and R analysis scripts are deposited on Figshare (doi: 10.6084/m9.figshare.24108819).
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Visual Highlight Overlays */}
        {isCurrentPage && selectedCheck?.highlights && (
          <div className="pointer-events-none absolute inset-0">
            {selectedCheck.highlights.map((hl, hIdx) => (
              <div
                key={hIdx}
                className={hIdx === 0 ? "rs-hl para" : "rs-hl"}
                style={{
                  "--c": selectedCheck.color || "var(--rs-good)",
                  left: `${hl.left}%`,
                  top: `${hl.top}%`,
                  width: `${hl.width}%`,
                  height: `${hl.height}%`,
                } as any}
              />
            ))}
          </div>
        )}

        {/* Live Grounding Evidence Callout Card */}
        {isCurrentPage && selectedCheck && (
          <div
            className="absolute z-10 rounded-xl border shadow-xl p-3 max-w-[88%] backdrop-blur-md transition-all text-xs"
            style={{
              borderColor: selectedCheck.color || "var(--rs-good)",
              backgroundColor: "color-mix(in srgb, var(--rs-card) 94%, transparent)",
              left: "6%",
              top: `${Math.min(Math.max((selectedCheck.highlights?.[0]?.top ?? 35) - 10, 4), 78)}%`,
            }}
          >
            <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px]" style={{ color: selectedCheck.color || "var(--rs-good)" }}>
              {selectedCheck.outcome === "good" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : selectedCheck.outcome === "mid" ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <AlertOctagon className="w-3.5 h-3.5" />
              )}
              <span>{selectedCheck.label} ({selectedCheck.evidence}% evidence)</span>
            </div>
            <p className="font-serif italic text-zinc-900 dark:text-zinc-100 text-[10.5px] leading-snug">
              "{selectedCheck.quote || selectedCheck.question}"
            </p>
            <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60 font-mono text-[9px] text-zinc-500">
              <span>{selectedCheck.location}</span>
              <span className="font-semibold uppercase">{selectedCheck.spoke?.verdict || "Reported"}</span>
            </div>
          </div>
        )}

        {/* Page Footer Number */}
        <span className="rs-pgno">Page {pageNum} of {totalPages}</span>
      </div>
    );
  };

  return (
    <div className="rs-reader shadow-sm">
      {/* Top Reader Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rs-line)] bg-[var(--rs-card)] py-2.5 px-3 sm:px-4 rs-mono text-xs uppercase tracking-wider rs-muted">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goToPage(activePage - 1)}
            disabled={activePage <= 1}
            className="p-1 rounded hover:bg-[var(--rs-panel)] disabled:opacity-30"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-[var(--rs-ink)] min-w-[70px] text-center">
            P. {activePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(activePage + 1)}
            disabled={activePage >= totalPages}
            className="p-1 rounded hover:bg-[var(--rs-panel)] disabled:opacity-30"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <span className="min-w-0 flex-1 truncate text-center font-sans text-xs normal-case tracking-normal font-semibold rs-soft hidden sm:block">
          {selectedCheck ? (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#381A61] dark:text-[#F9D14A]" />
              {selectedCheck.label} · p. {selectedCheck.page}
            </span>
          ) : (
            "Manuscript Reader"
          )}
        </span>

        {/* Zoom Controls */}
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--rs-line)] bg-[var(--rs-card)]" role="group" aria-label="Zoom controls">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 70}
            className="grid h-7 w-8 place-items-center text-sm font-bold text-[var(--rs-ink)] hover:bg-[var(--rs-panel)] disabled:opacity-30"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="min-w-[48px] border-x border-[var(--rs-line)] text-center text-[11px] leading-7 rs-soft font-semibold hover:bg-[var(--rs-panel)]"
            title="Reset Zoom"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 160}
            className="grid h-7 w-8 place-items-center text-sm font-bold text-[var(--rs-ink)] hover:bg-[var(--rs-panel)] disabled:opacity-30"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Pages Scroll Container */}
      <div className="rs-pages" style={{ transformOrigin: "top center" }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
          const isSelectedPage = pNum === (selectedCheck?.page || 1);
          return (
            <div
              key={pNum}
              ref={(el) => {
                pageRefs.current[pNum] = el;
              }}
              data-page={pNum}
              className={`rs-page transition-all duration-300 ${
                isSelectedPage ? "ring-2 ring-[#381A61] dark:ring-[#F9D14A] shadow-lg scale-[1.005]" : ""
              }`}
              style={{
                width: `${zoom}%`,
                margin: "0 auto",
              }}
            >
              {renderPageContent(pNum)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
