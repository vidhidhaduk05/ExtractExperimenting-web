import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Sliders,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { api } from "../../lib/api";

interface ProtocolCriteriaPanelProps {
  projectId?: string;
}

export function ProtocolCriteriaPanel({ projectId }: ProtocolCriteriaPanelProps) {
  const { data: projectPico, isLoading: isPicoLoading } = useQuery({
    queryKey: ["pico", projectId],
    queryFn: () => (projectId ? api.getPico(projectId).catch(() => null) : Promise.resolve(null)),
    enabled: !!projectId,
  });

  const { data: projectCriteria } = useQuery({
    queryKey: ["criteria", projectId],
    queryFn: () => (projectId ? api.getCriteria(projectId).catch(() => null) : Promise.resolve(null)),
    enabled: !!projectId,
  });

  const { data: calibrationData } = useQuery({
    queryKey: ["calibration", projectId],
    queryFn: () => (projectId ? api.getScreeningCalibration(projectId).catch(() => null) : Promise.resolve(null)),
    enabled: !!projectId,
  });

  const { data: exclusionReasonsData } = useQuery({
    queryKey: ["exclusion-reasons", projectId],
    queryFn: () => (projectId ? api.getExclusionReasons(projectId).catch(() => null) : Promise.resolve(null)),
    enabled: !!projectId,
  });
  const exclusionReasons = exclusionReasonsData?.reasons || [];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-xs font-['Work_Sans'] bg-[#fbf9f4] text-[#4f444b]">
      {/* Protocol Header & Navigation */}
      <div className="flex items-center justify-between bg-[#ffffff] border border-[#d2c2cb] p-3 rounded-xl shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#eee7ec] text-[#3a0f34]">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-[#3a0f34] text-[12px] block">PRISMA Protocol Active</span>
            <span className="text-[11px] text-[#62535d]">Dual-Pass Mathematical Screening</span>
          </div>
        </div>
        {projectId && (
          <Link
            to={`/projects/${projectId}/pico`}
            className="text-[11px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-semibold px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1 shadow-xs"
          >
            <span>Edit Criteria</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Mathematical Scoring Engine & Stanford SLIDERS Calibration */}
      <div className="p-3.5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#3a0f34] text-[11.5px] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#814d75]" />
            Mathematical Scoring Engine
          </span>
          <span className="text-[10px] font-mono font-bold bg-[#eee7ec] text-[#3a0f34] px-1.5 py-0.5 rounded border border-[#d2c2cb]">
            SLIDERS Microbatch
          </span>
        </div>

        <div className="p-2.5 bg-[#fbf9f4] rounded-lg border border-[#eee7ec] font-mono text-[10.5px] text-[#4f444b] space-y-1.5">
          <div className="text-[11px] font-semibold text-[#3a0f34]">Logistic Match Equation:</div>
          <div className="bg-[#ffffff] p-2 rounded border border-[#d2c2cb] text-[#814d75] font-bold text-center">
            P(Include) = σ(β₀ + Σ wᵢ · sᵢ)
          </div>
          <div className="text-[10px] text-[#62535d] pt-0.5 leading-snug">
            Intercept β₀ = {calibrationData?.calibration?.intercept ?? -2.0} | w = [
            {(calibrationData?.calibration?.weights ?? [1.5, 4.0, -2.5, -2.0, -1.0]).join(", ")}]
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          <div className="p-2 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
            <span className="text-[#62535d] block text-[10px]">Auto-Include Threshold:</span>
            <strong className="text-emerald-700 font-mono text-[12px]">
              P ≥ {Math.round((calibrationData?.calibration?.t_include ?? 0.90) * 100)}%
            </strong>
          </div>
          <div className="p-2 bg-[#fbf9f4] rounded-lg border border-[#d2c2cb]">
            <span className="text-[#62535d] block text-[10px]">Auto-Exclude Threshold:</span>
            <strong className="text-rose-700 font-mono text-[12px]">
              P ≤ {Math.round((calibrationData?.calibration?.t_excl ?? 0.20) * 100)}%
            </strong>
          </div>
        </div>
      </div>

      {/* PICO Cards */}
      <div className="space-y-2.5">
        <div className="p-3 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <div className="font-bold text-[#3a0f34] flex items-center justify-between mb-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#814d75] text-white flex items-center justify-center text-[10px] font-black">
                P
              </span>
              <span>Population</span>
            </div>
            <span className="text-[9.5px] font-mono text-[#3a0f34] bg-[#eee7ec] px-1.5 py-0.2 rounded font-semibold border border-[#d2c2cb]">
              Weight: 1.5
            </span>
          </div>
          <p className="text-[#4f444b] text-[11.5px] leading-relaxed">
            {projectPico?.population || "Patients meeting systematic review population criteria."}
          </p>
        </div>

        <div className="p-3 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <div className="font-bold text-[#3a0f34] flex items-center justify-between mb-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#3a0f34] text-white flex items-center justify-center text-[10px] font-black">
                I
              </span>
              <span>Intervention / Index Test</span>
            </div>
            <span className="text-[9.5px] font-mono text-[#3a0f34] bg-[#eee7ec] px-1.5 py-0.2 rounded font-semibold border border-[#d2c2cb]">
              Weight: 4.0
            </span>
          </div>
          <p className="text-[#4f444b] text-[11.5px] leading-relaxed">
            {projectPico?.index_test || (projectPico as any)?.intervention || "Evaluated intervention or diagnostic modality."}
          </p>
        </div>

        <div className="p-3 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <div className="font-bold text-[#3a0f34] flex items-center justify-between mb-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#62535d] text-white flex items-center justify-center text-[10px] font-black">
                C
              </span>
              <span>Comparator</span>
            </div>
            <span className="text-[9.5px] font-mono text-[#3a0f34] bg-[#eee7ec] px-1.5 py-0.2 rounded font-semibold border border-[#d2c2cb]">
              Weight: 1.0
            </span>
          </div>
          <p className="text-[#4f444b] text-[11.5px] leading-relaxed">
            {projectPico?.comparator || "Reference standard or comparative control group."}
          </p>
        </div>

        <div className="p-3 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <div className="font-bold text-[#3a0f34] flex items-center justify-between mb-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#7c5800] text-white flex items-center justify-center text-[10px] font-black">
                O
              </span>
              <span>Outcomes</span>
            </div>
            <span className="text-[9.5px] font-mono text-[#3a0f34] bg-[#eee7ec] px-1.5 py-0.2 rounded font-semibold border border-[#d2c2cb]">
              Weight: 1.5
            </span>
          </div>
          <p className="text-[#4f444b] text-[11.5px] leading-relaxed">
            {projectPico?.outcome || "Primary and secondary clinical endpoints."}
          </p>
        </div>
      </div>

      {/* Mandatory Inclusion & Explicit Exclusion */}
      <div className="space-y-2.5 pt-1">
        <div className="p-3.5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <span className="font-bold text-[#3a0f34] flex items-center justify-between mb-2 text-[11.5px]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Inclusion Criteria &amp; Mathematical Filters
            </span>
            <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              {projectCriteria?.inclusion?.length || 0} active
            </span>
          </span>
          <ul className="text-[11.5px] text-[#4f444b] space-y-1.5 list-disc list-inside">
            {projectCriteria?.inclusion && projectCriteria.inclusion.length > 0 ? (
              projectCriteria.inclusion.map((crit, idx) => (
                <li key={crit.id || idx} className="leading-snug">
                  {crit.text}
                </li>
              ))
            ) : (
              <>
                <li>Human subjects with confirmed clinical diagnosis.</li>
                <li>Peer-reviewed original research reporting relevant endpoints.</li>
              </>
            )}
          </ul>
        </div>

        <div className="p-3.5 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-xs">
          <span className="font-bold text-[#3a0f34] flex items-center justify-between mb-2 text-[11.5px]">
            <span className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-700" />
              Exclusion Criteria &amp; Absolute Penalties
            </span>
            <span className="text-[10px] font-mono text-rose-800 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
              {(projectCriteria?.exclusion?.length || 0) + (exclusionReasons?.length || 0)} active
            </span>
          </span>
          <ul className="text-[11.5px] text-[#4f444b] space-y-1.5 list-disc list-inside">
            {projectCriteria?.exclusion && projectCriteria.exclusion.length > 0 ? (
              projectCriteria.exclusion.map((crit, idx) => (
                <li key={crit.id || idx} className="leading-snug">
                  {crit.text}
                </li>
              ))
            ) : (
              <li>Non-clinical, animal, or in vitro studies.</li>
            )}
            {exclusionReasons &&
              exclusionReasons.slice(0, 3).map((r, idx) => (
                <li key={idx} className="leading-snug">
                  {typeof r === "string" ? r : r.label}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
