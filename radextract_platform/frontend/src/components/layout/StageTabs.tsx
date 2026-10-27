import React from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

interface StageTabDef {
  id: string;
  label: string;
  path: string;
  isBlocked: (data: { studyCount: number; includedCount: number; robCount: number; metaCount: number }) => { blocked: boolean; reason?: string };
}

const STAGE_TABS: StageTabDef[] = [
  {
    id: "protocol",
    label: "Protocol",
    path: "pico",
    isBlocked: () => ({ blocked: false }),
  },
  {
    id: "studies",
    label: "Studies",
    path: "studies",
    isBlocked: () => ({ blocked: false }),
  },
  {
    id: "screening",
    label: "Screening",
    path: "screening",
    isBlocked: ({ studyCount }) =>
      studyCount === 0
        ? { blocked: true, reason: "Blocked: import studies first" }
        : { blocked: false },
  },
  {
    id: "extraction",
    label: "Extraction",
    path: "extraction-sheet",
    isBlocked: ({ includedCount }) =>
      includedCount === 0
        ? { blocked: true, reason: "Blocked: finish Title/Abstract screening first" }
        : { blocked: false },
  },
  {
    id: "rob",
    label: "RoB",
    path: "rob",
    isBlocked: ({ includedCount }) =>
      includedCount === 0
        ? { blocked: true, reason: "Blocked: finish Title/Abstract screening first" }
        : { blocked: false },
  },
  {
    id: "grade",
    label: "GRADE",
    path: "grade",
    isBlocked: ({ includedCount, robCount }) =>
      includedCount === 0 || robCount === 0
        ? { blocked: true, reason: "Blocked: complete screening and Risk of Bias first" }
        : { blocked: false },
  },
  {
    id: "meta",
    label: "Meta",
    path: "meta-analysis",
    isBlocked: ({ includedCount }) =>
      includedCount < 2
        ? { blocked: true, reason: "Blocked: at least 2 included studies required for synthesis" }
        : { blocked: false },
  },
  {
    id: "export",
    label: "Export",
    path: "export",
    isBlocked: () => ({ blocked: false }),
  },
];

export function StageTabs() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const { data: studies } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.getStudies(projectId!),
    enabled: !!projectId,
  });

  const { data: robSummary } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.getRobSummary(projectId!),
    enabled: !!projectId,
  });

  const { data: metaList } = useQuery({
    queryKey: ["meta-list", projectId],
    queryFn: () => api.listMetaAnalyses(projectId!),
    enabled: !!projectId,
  });

  if (!projectId) return null;

  const studyCount = studies?.length || 0;
  const includedCount = studies?.filter((s) => s.screening_status === "included").length || 0;
  const robCount = robSummary?.total_assessments || 0;
  const metaCount = metaList?.length || 0;

  const gateData = { studyCount, includedCount, robCount, metaCount };

  return (
    <nav
      aria-label="Review Workflow Stages"
      className="bg-[#fbf9f4] border-b border-[#d2c2cb] px-4 sm:px-6 flex items-center gap-1 sm:gap-2 overflow-x-auto select-none no-scrollbar"
      style={{ minHeight: "41px" }}
    >
      {STAGE_TABS.map((tab, idx) => {
        const fullPath = `/projects/${projectId}/${tab.path}`;
        const isActive =
          location.pathname === fullPath ||
          location.pathname.startsWith(`${fullPath}/`) ||
          (tab.path === "extraction-sheet" && location.pathname.includes("/extraction"));
        const { blocked, reason } = tab.isBlocked(gateData);

        return (
          <React.Fragment key={tab.id}>
            {idx > 0 && (
              <span className="text-[#d2c2cb] text-xs font-serif select-none" aria-hidden="true">
                ·
              </span>
            )}
            {blocked ? (
              <span
                title={reason}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-['Work_Sans'] font-medium text-[#81737b]/50 cursor-not-allowed group relative"
                aria-disabled="true"
              >
                <span>{tab.label}</span>
                <span className="text-[10px] opacity-60">🔒</span>
                {reason && (
                  <span className="sr-only">({reason})</span>
                )}
              </span>
            ) : (
              <Link
                to={fullPath}
                title={tab.label}
                className={cn(
                  "inline-flex items-center px-2.5 py-2 text-xs font-['Work_Sans'] transition-all relative border-b-2",
                  isActive
                    ? "font-semibold text-[#3a0f34] border-[#3a0f34]"
                    : "font-medium text-[#62535d] border-transparent hover:text-[#3a0f34] hover:border-[#814d75]/30"
                )}
              >
                {tab.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default StageTabs;
