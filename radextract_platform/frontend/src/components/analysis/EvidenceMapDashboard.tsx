import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type EvidenceMapPacket,
  type CrosstabResult,
  type TrendCount,
} from "../../lib/api";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  BookOpen,
  Filter,
  CheckCircle2,
  Table,
  Loader2,
  AlertCircle,
  HelpCircle,
  BarChart2,
} from "lucide-react";

interface EvidenceMapDashboardProps {
  projectId: string;
}

export function EvidenceMapDashboard({ projectId }: EvidenceMapDashboardProps) {
  const [selectedBucket, setSelectedBucket] = useState<string>("year");

  // Query evidence map packet
  const { data: evidenceMap, isLoading, error, refetch } = useQuery<EvidenceMapPacket>({
    queryKey: ["evidence-map", projectId],
    queryFn: () => (projectId && projectId !== "demo" ? api.getEvidenceMap(projectId) : Promise.reject("demo")),
    enabled: !!projectId && projectId !== "demo",
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#62535d] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#814d75]" />
        <span className="text-xs font-semibold">Loading scoping review evidence map...</span>
      </div>
    );
  }

  if (error || !evidenceMap) {
    return (
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-[#814d75] mx-auto" />
        <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
          Unable to Load Evidence Map
        </h3>
        <p className="text-xs text-[#62535d]">
          Ensure studies are included in the review and variables are configured.
        </p>
      </div>
    );
  }

  const maxYearCount = Math.max(...(evidenceMap.by_year?.map((d) => d.n) || [1]), 1);
  const maxDesignCount = Math.max(...(evidenceMap.by_design?.map((d) => d.n) || [1]), 1);

  return (
    <div className="space-y-6 font-['Work_Sans']">
      {/* ── TOP SUMMARY CARDS (ClaimScape Paper Surface) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Included Studies */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[#814d75]">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Total Included Studies</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">
            {evidenceMap.total_included}
          </div>
          <p className="text-[11px] text-[#62535d]">Eligible studies mapped</p>
        </div>

        {/* Publication Date Span */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[#814d75]">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Publication Span</span>
            <Calendar className="h-4 w-4" />
          </div>
          <div className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">
            {evidenceMap.year_span?.min && evidenceMap.year_span?.max
              ? `${evidenceMap.year_span.min} – ${evidenceMap.year_span.max}`
              : "Not reported"}
          </div>
          <p className="text-[11px] text-[#62535d]">Chronological range of records</p>
        </div>

        {/* Study Designs Count */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[#814d75]">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Design Mix</span>
            <Layers className="h-4 w-4" />
          </div>
          <div className="font-['Serifon_Editorial'] text-2xl font-bold text-[#3a0f34]">
            {evidenceMap.by_design?.length || 0} Types
          </div>
          <p className="text-[11px] text-[#62535d]">
            Top: {evidenceMap.by_design?.[0]?.label || "N/A"} ({evidenceMap.by_design?.[0]?.n || 0})
          </p>
        </div>

        {/* Top Journal */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[#814d75]">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Leading Source</span>
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34] truncate" title={evidenceMap.top_journals?.[0]?.label}>
            {evidenceMap.top_journals?.[0]?.label || "Not specified"}
          </div>
          <p className="text-[11px] text-[#62535d]">
            {evidenceMap.top_journals?.[0]?.n ? `${evidenceMap.top_journals[0].n} studies published` : "No journal recorded"}
          </p>
        </div>
      </div>

      {/* ── EXPORT ACTION BAR ── */}
      <div className="flex items-center justify-between bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl px-4 py-2.5">
        <div className="text-xs text-[#4f444b]">
          <strong className="text-[#3a0f34]">Scoping Review Summary Tables</strong> · Wilson proportions, ranges, and cross-tabulations
        </div>
        <div className="flex items-center gap-2">
          <a
            href={api.exportEvidenceMapUrl(projectId, "csv")}
            download
            className="px-3 py-1.5 text-xs font-semibold rounded bg-[#ffffff] hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="h-3 w-3 text-[#814d75]" />
            <span>Export CSV</span>
          </a>
          <a
            href={api.exportEvidenceMapUrl(projectId, "xlsx")}
            download
            className="px-3 py-1.5 text-xs font-bold rounded bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#ffdea6]" />
            <span>Export Tables (XLSX)</span>
          </a>
        </div>
      </div>

      {/* ── 2-UP CHARTS ROW: STUDIES PER YEAR & DESIGN MIX ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 1: Studies per Year (Clean SVG Bar Chart) */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#d2c2cb]/60">
            <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[#814d75]" />
              Studies Published by Year
            </h3>
            <span className="text-[10px] font-mono text-[#62535d]">{evidenceMap.by_year?.length || 0} intervals</span>
          </div>

          <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
            {evidenceMap.by_year && evidenceMap.by_year.length > 0 ? (
              evidenceMap.by_year.map((item) => {
                const pct = Math.round((item.n / maxYearCount) * 100);
                return (
                  <div key={item.label} className="flex items-center text-xs gap-3">
                    <span className="font-mono text-[11px] text-[#4f444b] w-14 shrink-0 font-medium">
                      {item.label}
                    </span>
                    <div className="flex-1 h-5 bg-[#fbf9f4] rounded border border-[#d2c2cb]/60 overflow-hidden relative">
                      <div
                        className="h-full bg-[#814d75] transition-all rounded-xs"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-[#3a0f34] w-6 text-right shrink-0">
                      {item.n}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-[#81737b] italic py-6 text-center">No publication years recorded.</div>
            )}
          </div>
        </div>

        {/* Chart 2: Studies by Design Mix */}
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#d2c2cb]/60">
            <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#814d75]" />
              Study Design Distribution
            </h3>
            <span className="text-[10px] font-mono text-[#62535d]">{evidenceMap.by_design?.length || 0} categories</span>
          </div>

          <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
            {evidenceMap.by_design && evidenceMap.by_design.length > 0 ? (
              evidenceMap.by_design.map((item) => {
                const pct = Math.round((item.n / maxDesignCount) * 100);
                return (
                  <div key={item.label} className="flex items-center text-xs gap-3">
                    <span className="text-[11px] text-[#4f444b] w-28 truncate shrink-0 font-medium" title={item.label}>
                      {item.label}
                    </span>
                    <div className="flex-1 h-5 bg-[#fbf9f4] rounded border border-[#d2c2cb]/60 overflow-hidden relative">
                      <div
                        className="h-full bg-[#3a0f34] transition-all rounded-xs"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-[#3a0f34] w-6 text-right shrink-0">
                      {item.n}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-[#81737b] italic py-6 text-center">No study designs classified.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTINGENCY CROSS-TAB TABLE (Design × Region or Row × Col) ── */}
      {evidenceMap.design_by_region && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#d2c2cb]/60">
            <div>
              <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] flex items-center gap-2">
                <Table className="h-4 w-4 text-[#814d75]" />
                Evidence-Map Cross-Tabulation: {evidenceMap.design_by_region.row_variable} × {evidenceMap.design_by_region.col_variable}
              </h3>
              <p className="text-[11px] text-[#62535d] mt-0.5">
                Contingency matrix mapping study designs across geographical locations or extracted variables.
              </p>
            </div>
            <span className="text-[10px] font-mono bg-[#eee7ec] px-2 py-0.5 rounded text-[#4f444b] font-bold">
              N = {evidenceMap.design_by_region.n_studies} studies
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#fbf9f4] border-b border-[#d2c2cb] font-semibold text-[#3a0f34]">
                  <th className="p-2.5 border-r border-[#d2c2cb]">
                    {evidenceMap.design_by_region.row_variable} \ {evidenceMap.design_by_region.col_variable}
                  </th>
                  {evidenceMap.design_by_region.col_labels.map((col) => (
                    <th key={col} className="p-2.5 border-r border-[#d2c2cb] text-center">
                      {col}
                    </th>
                  ))}
                  <th className="p-2.5 text-center font-bold bg-[#eee7ec]">Total</th>
                </tr>
              </thead>
              <tbody>
                {evidenceMap.design_by_region.row_labels.map((row) => (
                  <tr key={row} className="border-b border-[#d2c2cb]/60 hover:bg-[#fbf9f4] transition-colors">
                    <td className="p-2.5 border-r border-[#d2c2cb] font-medium text-[#4f444b]">
                      {row}
                    </td>
                    {evidenceMap.design_by_region!.col_labels.map((col) => {
                      const count = evidenceMap.design_by_region!.matrix[row]?.[col] || 0;
                      return (
                        <td
                          key={col}
                          className={`p-2.5 border-r border-[#d2c2cb] text-center font-mono ${
                            count > 0 ? "font-bold text-[#3a0f34] bg-[#ffdea6]/20" : "text-[#81737b]"
                          }`}
                        >
                          {count}
                        </td>
                      );
                    })}
                    <td className="p-2.5 text-center font-mono font-bold text-[#3a0f34] bg-[#eee7ec]/50">
                      {evidenceMap.design_by_region!.row_totals[row] || 0}
                    </td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="bg-[#eee7ec]/50 font-bold border-t-2 border-[#d2c2cb]">
                  <td className="p-2.5 border-r border-[#d2c2cb] text-[#3a0f34]">Total</td>
                  {evidenceMap.design_by_region.col_labels.map((col) => (
                    <td key={col} className="p-2.5 border-r border-[#d2c2cb] text-center font-mono text-[#3a0f34]">
                      {evidenceMap.design_by_region!.col_totals[col] || 0}
                    </td>
                  ))}
                  <td className="p-2.5 text-center font-mono text-[#3a0f34] bg-[#eee7ec]">
                    {evidenceMap.design_by_region.n_studies}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VARIABLE COVERAGE & MISSINGNESS INVENTORY ── */}
      <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#d2c2cb]/60">
          <div>
            <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#814d75]" />
              Variable Coverage & Missing-Data Inventory
            </h3>
            <p className="text-[11px] text-[#62535d] mt-0.5">
              Completeness of extracted variables across included studies (scoping-review convention: NR preserved).
            </p>
          </div>
          <span className="text-[10px] font-mono text-[#62535d]">
            {evidenceMap.variable_coverage?.length || 0} variables evaluated
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[#fbf9f4] border-b border-[#d2c2cb] font-semibold text-[#3a0f34]">
                <th className="p-2.5 border-r border-[#d2c2cb]">Variable</th>
                <th className="p-2.5 border-r border-[#d2c2cb]">Section</th>
                <th className="p-2.5 border-r border-[#d2c2cb]">Field Type</th>
                <th className="p-2.5 border-r border-[#d2c2cb] text-center">Reported (N)</th>
                <th className="p-2.5 border-r border-[#d2c2cb] text-center">Missing (N)</th>
                <th className="p-2.5 text-right w-44">Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d2c2cb]/50">
              {evidenceMap.variable_coverage && evidenceMap.variable_coverage.length > 0 ? (
                evidenceMap.variable_coverage.map((v) => {
                  const reportedPct = Math.round(100 - v.pct_missing);
                  return (
                    <tr key={v.variable_id} className="hover:bg-[#fbf9f4] transition-colors">
                      <td className="p-2.5 border-r border-[#d2c2cb] font-medium text-[#3a0f34]">
                        {v.name}
                      </td>
                      <td className="p-2.5 border-r border-[#d2c2cb] text-[#62535d]">
                        {v.section || "General"}
                      </td>
                      <td className="p-2.5 border-r border-[#d2c2cb] font-mono text-[11px] text-[#814d75]">
                        {v.field_type}
                      </td>
                      <td className="p-2.5 border-r border-[#d2c2cb] text-center font-mono font-semibold text-emerald-800">
                        {v.n_reported}
                      </td>
                      <td className="p-2.5 border-r border-[#d2c2cb] text-center font-mono text-[#81737b]">
                        {v.n_missing}
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-2 bg-[#eee7ec] rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                reportedPct >= 80 ? "bg-emerald-600" : reportedPct >= 50 ? "bg-amber-600" : "bg-rose-600"
                              }`}
                              style={{ width: `${reportedPct}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-xs w-9 text-right text-[#3a0f34]">
                            {reportedPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-xs text-[#81737b] italic">
                    No variables configured for this project.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

