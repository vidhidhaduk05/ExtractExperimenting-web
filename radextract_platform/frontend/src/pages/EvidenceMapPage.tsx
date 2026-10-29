import React, { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type EvidenceMapPacket } from "../lib/api";
import {
  Download,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
} from "lucide-react";

// Canonical design hierarchy for Evidence Maps (strongest to weakest)
const DESIGN_ORDER: Record<string, number> = {
  "meta-analysis": 1,
  "systematic review": 2,
  "randomized controlled trial": 3,
  "rct": 3,
  "cohort study": 4,
  "prospective cohort": 4,
  "retrospective cohort": 5,
  "case-control": 6,
  "observational": 7,
  "cross-sectional": 8,
  "case series": 9,
  "case report": 10,
  "narrative review": 11,
  "review": 11,
  "other": 99,
  "not reported": 100,
};

function designRank(label: string): number {
  const norm = (label || "").trim().toLowerCase();
  for (const [key, rank] of Object.entries(DESIGN_ORDER)) {
    if (norm.includes(key)) return rank;
  }
  return 50;
}

// Region palette conforming to ClaimScape tokens & Master Theme
const REGION_COLORS = [
  "#3a0f34", // Primary Wine
  "#814d75", // Editorial Plum
  "#7c5800", // Ochre
  "#66365c", // Muted Plum
  "#4f444b", // Reading Ink
  "#b37d4e", // Warm Ochre
  "#62535d", // Secondary Ink
];

export function EvidenceMapPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => (projectId ? api.getProject(projectId) : null),
    enabled: !!projectId,
  });

  const { data: mapData, isLoading, error } = useQuery<EvidenceMapPacket>({
    queryKey: ["evidence-map", projectId],
    queryFn: () => (projectId ? api.getEvidenceMap(projectId) : Promise.reject("no-id")),
    enabled: !!projectId,
  });

  // Sort designs strongest first
  const sortedDesigns = useMemo(() => {
    if (!mapData?.by_design) return [];
    return [...mapData.by_design].sort((a, b) => designRank(a.label) - designRank(b.label));
  }, [mapData]);

  // Memoize year range, cross-tab, and funnel metrics to avoid O(N_rows * N_cols) flatMap and array reduces on re-renders
  const { minYear, maxYear, yearSpan, maxCellVal, totalIncluded, withYear, withDesign, withRegion } = useMemo(() => {
    if (!mapData) {
      return {
        minYear: 2000,
        maxYear: 2026,
        yearSpan: 26,
        maxCellVal: 1,
        totalIncluded: 0,
        withYear: 0,
        withDesign: 0,
        withRegion: 0,
      };
    }

    const minY = mapData.year_span?.min ?? (mapData.by_year?.length ? Math.min(...mapData.by_year.map((y) => Number(y.label)).filter(Boolean)) : 2000);
    const maxY = mapData.year_span?.max ?? (mapData.by_year?.length ? Math.max(...mapData.by_year.map((y) => Number(y.label)).filter(Boolean)) : 2026);
    const ySpan = Math.max(maxY - minY, 1);

    const xtData = mapData.design_by_region;
    let maxCell = 1;
    if (xtData?.row_labels && xtData?.col_labels) {
      for (const r of xtData.row_labels) {
        for (const c of xtData.col_labels) {
          const val = xtData.matrix[r]?.[c] || 0;
          if (val > maxCell) maxCell = val;
        }
      }
    }

    const totalInc = mapData.total_included || 0;
    const wYear = mapData.by_year?.reduce((acc, y) => acc + y.n, 0) || 0;
    const wDesign = mapData.by_design?.filter((d) => d.label.toLowerCase() !== "not reported").reduce((acc, d) => acc + d.n, 0) || 0;
    const wRegion = xtData?.n_studies || 0;

    return {
      minYear: minY,
      maxYear: maxY,
      yearSpan: ySpan,
      maxCellVal: maxCell,
      totalIncluded: totalInc,
      withYear: wYear,
      withDesign: wDesign,
      withRegion: wRegion,
    };
  }, [mapData]);

  // Region color mapping from cross-tab column labels
  const regionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (mapData?.design_by_region?.col_labels) {
      mapData.design_by_region.col_labels.forEach((col, idx) => {
        map[col] = REGION_COLORS[idx % REGION_COLORS.length];
      });
    }
    return map;
  }, [mapData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-[#62535d] gap-3 font-['Work_Sans']">
        <Loader2 className="h-7 w-7 animate-spin text-[#814d75]" />
        <span className="text-sm font-semibold">Generating evidence map synthesis...</span>
      </div>
    );
  }

  if (error || !mapData) {
    return (
      <div className="p-8 max-w-5xl mx-auto font-['Work_Sans'] space-y-4">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-xs text-[#814d75] hover:underline font-medium">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Project
        </Link>
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-8 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-[#814d75] mx-auto" />
          <h2 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">
            No Evidence Map Available
          </h2>
          <p className="text-sm text-[#62535d] max-w-md mx-auto">
            Please verify that studies have been marked as included in this project, and that extraction variables have been configured.
          </p>
        </div>
      </div>
    );
  }

  // Cross-tab data reference
  const xt = mapData.design_by_region;

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-8 font-['Work_Sans'] text-[#4f444b]">
      {/* ── HEADER & BREADCRUMB ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#d2c2cb] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/projects/${projectId}`}
              className="inline-flex items-center gap-1 text-xs text-[#814d75] hover:underline font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {project?.name || "Project"}
            </Link>
            <span className="text-[#81737b]">/</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffdea6]/60 text-[#7c5800] border border-[#d2c2cb]">
              SCOPING SYNTHESIS
            </span>
          </div>
          <h1 className="font-['Serifon_Editorial'] text-3xl sm:text-4xl font-bold text-[#3a0f34] tracking-tight">
            Evidence Map & Aggregation
          </h1>
          <p className="font-['Newsreader'] italic text-sm text-[#62535d] mt-1">
            Visualizing publication chronology, methodological hierarchy, and geographic concentration.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href={api.exportEvidenceMapUrl(projectId!, "xlsx")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] bg-[#ffffff] text-xs font-semibold text-[#3a0f34] hover:bg-[#eee7ec] hover:border-[#814d75] transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Export Excel
          </a>
          <a
            href={api.exportEvidenceMapUrl(projectId!, "csv")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d2c2cb] bg-[#3a0f34] text-xs font-semibold text-[#fbf9f4] hover:bg-[#1a0017] transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
        </div>
      </div>

      {/* ── 1. FUNNEL STRIP (ClaimScape Funnel Convention) ── */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-4 shadow-2xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#81737b] mb-3">
          Aggregation Funnel
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border-l-2 border-[#3a0f34] pl-3 space-y-0.5">
            <span className="text-[11px] text-[#62535d] block">1. Total Included</span>
            <span className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">{totalIncluded}</span>
            <span className="text-[10px] text-[#81737b] block">100% eligible</span>
          </div>

          <div className="border-l-2 border-[#814d75] pl-3 space-y-0.5">
            <span className="text-[11px] text-[#62535d] block">2. Publication Year</span>
            <span className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">{withYear}</span>
            <span className="text-[10px] text-[#81737b] block">
              {totalIncluded > 0 ? Math.round((withYear / totalIncluded) * 100) : 0}% chronology
            </span>
          </div>

          <div className="border-l-2 border-[#7c5800] pl-3 space-y-0.5">
            <span className="text-[11px] text-[#62535d] block">3. Design Classified</span>
            <span className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">{withDesign}</span>
            <span className="text-[10px] text-[#81737b] block">
              {totalIncluded > 0 ? Math.round((withDesign / totalIncluded) * 100) : 0}% typed
            </span>
          </div>

          <div className="border-l-2 border-[#66365c] pl-3 space-y-0.5">
            <span className="text-[11px] text-[#62535d] block">4. Region Mapped</span>
            <span className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">{withRegion}</span>
            <span className="text-[10px] text-[#81737b] block">
              {totalIncluded > 0 ? Math.round((withRegion / totalIncluded) * 100) : 0}% spatial
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. CLAIMSCAPE-STYLE DESIGN ROWS × YEAR DOT PLOT ── */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#d2c2cb] pb-4">
          <div>
            <h2 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">
              Study Design Hierarchy × Publication Chronology
            </h2>
            <p className="text-xs text-[#62535d]">
              Strongest evidence designs listed top to bottom. Dots represent study frequency across publication years.
            </p>
          </div>

          {/* Region Legend */}
          {xt?.col_labels && xt.col_labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-[11px] font-bold text-[#81737b]">Region:</span>
              {xt.col_labels.map((col) => (
                <div key={col} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: regionColorMap[col] || "#814d75" }}
                  />
                  <span className="text-[11px] font-medium text-[#4f444b]">{col}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Year Axis Header */}
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-2 text-[11px] font-mono text-[#81737b] border-b border-[#eee7ec] pb-1">
            <div className="col-span-3 font-semibold uppercase">Study Design</div>
            <div className="col-span-8 flex justify-between">
              <span>{minYear}</span>
              <span>{Math.round((minYear + maxYear) / 2)}</span>
              <span>{maxYear}</span>
            </div>
            <div className="col-span-1 text-right font-semibold">Total (N)</div>
          </div>

          {/* Design Rows */}
          {sortedDesigns.map((ds) => {
            const isNotReported = ds.label.toLowerCase() === "not reported" || ds.label.toLowerCase() === "other";
            return (
              <div
                key={ds.label}
                className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-[#fbf9f4] hover:bg-[#eee7ec]/30 transition-colors px-1 rounded"
              >
                {/* Design Label */}
                <div className="col-span-3 text-xs font-semibold text-[#3a0f34] truncate" title={ds.label}>
                  {ds.label}
                </div>

                {/* Plot Area */}
                <div className="col-span-8 relative h-7 bg-[#fbf9f4] border border-[#d2c2cb]/60 rounded-md flex items-center px-2">
                  {/* Subtle Grid ticks */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none px-2 opacity-25">
                    <div className="w-px h-full bg-[#d2c2cb]" />
                    <div className="w-px h-full bg-[#d2c2cb]" />
                    <div className="w-px h-full bg-[#d2c2cb]" />
                  </div>

                  {/* Dot placement based on by_year distribution */}
                  {mapData.by_year?.map((yr) => {
                    const yNum = Number(yr.label);
                    if (!yNum) return null;
                    const posPct = Math.max(0, Math.min(100, ((yNum - minYear) / yearSpan) * 100));
                    // Proportion of studies in this year estimated for this row
                    const dotWeight = Math.min(yr.n, ds.n);
                    if (dotWeight <= 0) return null;

                    return (
                      <div
                        key={yr.label}
                        className={`absolute w-3 h-3 rounded-full transition-transform hover:scale-150 cursor-pointer ${
                          isNotReported ? "border-2 border-[#81737b] bg-transparent" : "shadow-xs"
                        }`}
                        style={{
                          left: `calc(${posPct}% - 6px)`,
                          backgroundColor: isNotReported ? "transparent" : "#3a0f34",
                        }}
                        title={`${ds.label} (${yNum}): ~${dotWeight} studies`}
                      />
                    );
                  })}
                </div>

                {/* Total Count */}
                <div className="col-span-1 text-right font-mono text-xs font-bold text-[#814d75]">
                  {ds.n}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. CROSS-TABULATION MATRIX (DESIGN × REGION) ── */}
      {xt && xt.row_labels.length > 0 && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">
                Cross-Tabulation: {xt.row_variable} × {xt.col_variable}
              </h2>
              <p className="text-xs text-[#62535d]">
                Contingency matrix with color saturation scaled by study volume.
              </p>
            </div>
            <span className="text-xs font-mono text-[#81737b]">N = {xt.n_studies} mapped</span>
          </div>

          <div className="overflow-x-auto border border-[#d2c2cb] rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#fbf9f4] text-[#3a0f34] border-b border-[#d2c2cb]">
                  <th className="p-3 font-semibold border-r border-[#d2c2cb]">{xt.row_variable}</th>
                  {xt.col_labels.map((c) => (
                    <th key={c} className="p-3 font-semibold text-center border-r border-[#d2c2cb]">
                      {c}
                    </th>
                  ))}
                  <th className="p-3 font-bold text-center bg-[#eee7ec]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {xt.row_labels.map((r) => (
                  <tr key={r} className="hover:bg-[#eee7ec]/20 transition-colors">
                    <td className="p-3 font-medium text-[#3a0f34] border-r border-[#d2c2cb]">{r}</td>
                    {xt.col_labels.map((c) => {
                      const count = xt.matrix[r]?.[c] || 0;
                      const intensity = Math.min(1, count / maxCellVal);
                      return (
                        <td
                          key={c}
                          className="p-3 text-center border-r border-[#d2c2cb] font-mono font-medium"
                          style={{
                            backgroundColor:
                              count > 0 ? `rgba(129, 77, 117, ${0.08 + intensity * 0.35})` : undefined,
                            color: count > 0 ? "#3a0f34" : "#81737b",
                          }}
                        >
                          {count > 0 ? count : "—"}
                        </td>
                      );
                    })}
                    <td className="p-3 text-center font-mono font-bold text-[#814d75] bg-[#fbf9f4]">
                      {xt.row_totals[r] || 0}
                    </td>
                  </tr>
                ))}
                {/* Column Totals */}
                <tr className="bg-[#eee7ec] font-bold text-[#3a0f34] border-t-2 border-[#d2c2cb]">
                  <td className="p-3 border-r border-[#d2c2cb]">Total</td>
                  {xt.col_labels.map((c) => (
                    <td key={c} className="p-3 text-center font-mono border-r border-[#d2c2cb]">
                      {xt.col_totals[c] || 0}
                    </td>
                  ))}
                  <td className="p-3 text-center font-mono text-[#3a0f34]">{xt.n_studies}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. VARIABLE COVERAGE & MISSINGNESS TABLE ── */}
      {mapData.variable_coverage && mapData.variable_coverage.length > 0 && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">
                Variable Reporting & Missingness Summary
              </h2>
              <p className="text-xs text-[#62535d]">
                Reporting integrity across variables. Missingness exceeding 50% highlighted in rose.
              </p>
            </div>
            <span className="text-xs font-mono text-[#81737b]">
              {mapData.variable_coverage.length} Variables Configured
            </span>
          </div>

          <div className="overflow-x-auto border border-[#d2c2cb] rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#fbf9f4] text-[#3a0f34] border-b border-[#d2c2cb]">
                  <th className="p-3 font-semibold">Variable Name</th>
                  <th className="p-3 font-semibold">Section</th>
                  <th className="p-3 font-semibold">Type</th>
                  <th className="p-3 font-semibold text-right">Reported (N)</th>
                  <th className="p-3 font-semibold text-right">Missing (N)</th>
                  <th className="p-3 font-semibold text-right">% Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7ec]">
                {mapData.variable_coverage.map((v) => {
                  const isHighMissing = v.pct_missing > 50;
                  return (
                    <tr key={v.name} className="hover:bg-[#eee7ec]/20 transition-colors">
                      <td className="p-3 font-semibold text-[#3a0f34]">{v.name}</td>
                      <td className="p-3 text-[#62535d]">{v.section}</td>
                      <td className="p-3 font-mono text-[11px] text-[#81737b]">{v.field_type}</td>
                      <td className="p-3 text-right font-mono font-medium text-emerald-800">{v.n_reported}</td>
                      <td className="p-3 text-right font-mono font-medium text-[#62535d]">{v.n_missing}</td>
                      <td
                        className={`p-3 text-right font-mono font-bold ${
                          isHighMissing ? "text-rose-700 bg-rose-50/50" : "text-[#4f444b]"
                        }`}
                      >
                        {v.pct_missing}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 5. TOP JOURNALS CHIPS ── */}
      {mapData.top_journals && mapData.top_journals.length > 0 && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-xl p-6 shadow-2xs space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#81737b]">
            Top Publishing Journals
          </div>
          <div className="flex flex-wrap gap-2">
            {mapData.top_journals.map((j) => (
              <span
                key={j.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffdea6]/40 border border-[#d2c2cb] text-xs text-[#3a0f34] font-medium"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#7c5800]" />
                <span className="font-serif italic">{j.label}</span>
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#3a0f34] text-[#fbf9f4]">
                  {j.n}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
