import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { RigorCheckItem } from "../../data/dubowitzRigorData";

interface RigorReaderProps {
  totalPages: number;
  selectedCheck: RigorCheckItem;
  targetPage?: number;
}

export const RigorReader: React.FC<RigorReaderProps> = ({
  totalPages = 16,
  selectedCheck,
  targetPage,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 160));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 70));

  // Scroll to active check's page when targetPage changes
  useEffect(() => {
    const pageNum = targetPage || selectedCheck.page;
    if (pageNum && pageRefs.current[pageNum] && typeof pageRefs.current[pageNum]?.scrollIntoView === "function") {
      pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetPage, selectedCheck]);

  // Page contents simulation with realistic scientific typography
  const renderPageContent = (pageNum: number) => {
    const isCurrentPage = pageNum === selectedCheck.page;
    return (
      <div className="p-6 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-400 font-serif select-none space-y-3">
        {/* Header on page */}
        <div className="flex justify-between border-b pb-1 text-[8px] font-mono text-zinc-400">
          <span>PLOS ONE | https://doi.org/10.1371/journal.pone.0293905</span>
          <span>November 2023 | Vol 18 | Issue 11</span>
        </div>

        {pageNum === 1 && (
          <div className="space-y-2">
            <h1 className="text-sm font-bold font-sans text-zinc-900 dark:text-zinc-100">
              Type of anesthesia for cancer resection surgery: No differential impact on cancer recurrence in mouse models of breast cancer
            {/* Title continues */}
            </h1>
            <p className="text-[9px] font-sans text-zinc-500">
              Grant Dubowitz, Elazar Zelicof, Rachel Margalit, et al.
            </p>
            <div className="border-t border-b py-1.5 my-2">
              <h2 className="font-bold text-[9px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">Abstract</h2>
              <p className="text-[9px] leading-normal mt-1">
                Background: Retrospective clinical studies suggest choice of anesthetic during primary oncologic surgery may influence long-term recurrence rates. Methods: Using immunocompetent orthotopic mouse models of 4T1 and E0771 breast adenocarcinoma, we tested whether volatile anesthesia (sevoflurane) vs total intravenous anesthesia (propofol) alters spontaneous metastasis. Findings: Rigorous blinded analysis revealed no differential impact on survival or metastatic burden across cohorts.
              </p>
            </div>
          </div>
        )}

        {pageNum >= 2 && pageNum <= 4 && (
          <div className="space-y-2">
            <h2 className="font-bold text-[9px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              {pageNum === 2 ? "Introduction & Study Design" : pageNum === 3 ? "Materials & Methods: Interventions & Cell Lines" : "Blinding, Randomization & Ethics"}
            </h2>
            <p>
              Primary tumor surgery was conducted under standardized aseptic conditions. Murine 4T1 mammary carcinoma cells expressing firefly luciferase were cultured in RPMI 1640 supplemented with 10% fetal bovine serum. Cell line identities were confirmed by short tandem repeat profiling (Cellbank, Australia). Mycoplasma testing was routinely performed by PCR prior to implantation.
            </p>
            <p>
              Animals were maintained in specific-pathogen-free housing under 12-hour light/dark cycles with temperature regulation (22 ± 2°C). Surgical resections were conducted under continuous monitoring with pulse oximetry and core rectal thermal probes.
            </p>
            <p>
              Bioluminescence imaging was performed twice weekly using an IVIS Spectrum system following intraperitoneal injection of D-luciferin (150 mg/kg). Total flux (photons/second) was quantified within regions of interest by investigators blinded to allocation.
            </p>
          </div>
        )}

        {pageNum >= 5 && pageNum <= 10 && (
          <div className="space-y-2">
            <h2 className="font-bold text-[9px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              {pageNum === 5 ? "Results: Primary Recurrence Analysis" : pageNum === 6 ? "Results: Survival & Distant Metastasis" : "Statistical Multiplicity & Diagnostics"}
            </h2>
            <p>
              Kaplan-Meier survival curves indicated no statistically significant difference in disease-free survival between sevoflurane and propofol cohorts (hazard ratio: 0.94, 95% CI: 0.68–1.31, p = 0.72). Primary lung metastatic colonies were validated by post-mortem histopathology.
            </p>
            {/* Simulated mini chart */}
            <div className="h-16 rounded bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-[9px] font-mono text-zinc-500">
              [Fig {pageNum - 3}: Bioluminescence flux vs days post-resection (n = 30)]
            </div>
            <p>
              Analysis of variance and generalized linear models accounting for surgical cohort batch effects confirmed that neither induction speed nor anesthetic maintenance altered circulating tumor cell counts.
            </p>
          </div>
        )}

        {pageNum > 10 && (
          <div className="space-y-2">
            <h2 className="font-bold text-[9px] uppercase tracking-wider font-sans text-zinc-800 dark:text-zinc-200">
              {pageNum <= 13 ? "Discussion & Limitations" : "References & Data Availability"}
            </h2>
            <p>
              In conclusion, this randomized preclinical evaluation provides robust negative evidence against the hypothesis that choice of volatile vs intravenous anesthetic drives breast cancer recurrence. These findings urge caution against modifying oncologic anesthetic regimens in the absence of completed Phase III clinical trials.
            </p>
            <p className="text-[8px] text-zinc-400">
              Data Availability: Complete raw bioluminescence series, histology slide scans, and R analysis scripts are deposited on Figshare (doi: 10.6084/m9.figshare.24108819).
            </p>
          </div>
        )}

        {/* Highlight Overlay on this page */}
        {isCurrentPage && selectedCheck.highlights && (
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
      </div>
    );
  };

  return (
    <div className="rs-reader">
      {/* Top Reader Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--rs-line)] bg-[var(--rs-card)] py-2 pl-4 pr-2.5 rs-mono text-xs uppercase tracking-wider rs-muted">
        <span>Page {selectedCheck.page} / {totalPages}</span>
        <span className="min-w-0 flex-1 truncate text-center font-sans text-xs normal-case tracking-normal font-semibold rs-soft">
          {selectedCheck.label} · p. {selectedCheck.page}
        </span>
        <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--rs-line)] bg-[var(--rs-card)]" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 70}
            className="grid h-7 w-8 place-items-center text-sm font-bold text-[var(--rs-ink)] hover:bg-[var(--rs-panel)] disabled:opacity-40"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[48px] border-x border-[var(--rs-line)] text-center text-[11px] leading-7 rs-soft font-semibold">
            {zoom}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 160}
            className="grid h-7 w-8 place-items-center text-sm font-bold text-[var(--rs-ink)] hover:bg-[var(--rs-panel)] disabled:opacity-40"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Pages Scroll Container */}
      <div className="rs-pages" style={{ transformOrigin: "top center" }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
          const isSelectedPage = pNum === selectedCheck.page;
          return (
            <div
              key={pNum}
              ref={(el) => {
                pageRefs.current[pNum] = el;
              }}
              data-page={pNum}
              className={`rs-page transition-shadow ${
                isSelectedPage ? "ring-2 ring-[var(--rs-accent)] shadow-md" : ""
              }`}
              style={{
                width: `${zoom}%`,
                margin: "0 auto",
              }}
            >
              {renderPageContent(pNum)}
              <span className="rs-pgno">{pNum}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
