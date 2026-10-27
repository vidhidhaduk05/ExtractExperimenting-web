import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type PrismaFlow, type Project } from "../lib/api";
import {
  Folder,
  CheckSquare,
  FileSpreadsheet,
  ShieldCheck,
  Award,
  BarChart3,
  GitBranch,
  Download,
  Share2,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  CheckCircle2,
  Circle,
  FileText,
  LineChart,
  ArrowRight,
  X,
  ExternalLink,
  Table,
} from "lucide-react";
import { cn } from "../lib/utils";
import { ErrorBoundary } from "./common/ErrorBoundary";
import { ClarificationNotificationCenter } from "./common/ClarificationNotificationCenter";

interface NavItemDef {
  to: (projectId?: string) => string;
  matchPattern: RegExp;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SHELL_NAV_ITEMS: NavItemDef[] = [
  {
    to: (pid) => (pid ? `/projects/${pid}` : "/projects"),
    matchPattern: /^\/projects(\/[^/]+)?$/,
    label: "Projects",
    icon: Folder,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/screening` : "/projects"),
    matchPattern: /\/screening/,
    label: "Screening",
    icon: CheckSquare,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/extraction-sheet` : "/projects"),
    matchPattern: /\/extraction(-sheet)?/,
    label: "Extraction",
    icon: FileSpreadsheet,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/rob` : "/projects"),
    matchPattern: /\/rob/,
    label: "Risk of Bias",
    icon: ShieldCheck,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/meta-analysis` : "/projects"),
    matchPattern: /\/(meta-analysis|analysis)/,
    label: "Synthesis",
    icon: BarChart3,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/grade` : "/projects"),
    matchPattern: /\/grade/,
    label: "GRADE",
    icon: Award,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}/prisma` : "/projects"),
    matchPattern: /\/prisma/,
    label: "PRISMA",
    icon: GitBranch,
  },
];

function getStageName(pathname: string): string {
  if (pathname.includes("/screening")) return "Eligibility Screening";
  if (pathname.includes("/extraction-sheet")) return "Extraction Sheet";
  if (pathname.includes("/extraction")) return "PDF Extraction";
  if (pathname.includes("/rob")) return "Risk of Bias";
  if (pathname.includes("/grade")) return "GRADE Evidence";
  if (pathname.includes("/meta-analysis")) return "Meta-Analysis";
  if (pathname.includes("/analysis")) return "Data Analysis";
  if (pathname.includes("/prisma")) return "PRISMA Flow";
  if (pathname.includes("/pico")) return "PICO & Protocol";
  if (pathname.includes("/studies")) return "Studies";
  if (pathname.includes("/export")) return "Export & Report";
  if (pathname.includes("/graph/code")) return "Code Graph";
  if (pathname.includes("/claimscape")) return "Evidence Map";
  if (pathname.includes("/rigor-scan")) return "Rigor Scan";
  if (pathname.includes("/citation-telephone")) return "Citation Telephone";
  if (pathname === "/projects" || pathname === "/projects/") return "All Projects";
  return "Overview";
}

export function AppShell() {
  const { projectId } = useParams<{ projectId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Dock state: open on desktop (>=1024px), closed on mobile (<1024px)
  const [isDockOpen, setIsDockOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const [activeDockTab, setActiveDockTab] = useState<"todos" | "results" | "prisma">("todos");
  const [shareCopied, setShareCopied] = useState(false);

  // Fetch project details for breadcrumbs
  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => (projectId ? api.getProject(projectId) : Promise.reject("No project id")),
    enabled: !!projectId,
    staleTime: 60000,
  });

  // Live PRISMA badge query: refetched on focus
  const { data: prismaFlow } = useQuery<PrismaFlow>({
    queryKey: ["prisma-flow", projectId],
    queryFn: () => (projectId ? api.prismaFlow(projectId) : Promise.reject("No project id")),
    enabled: !!projectId,
    refetchOnWindowFocus: true,
    refetchInterval: 12000,
  });

  // Studies query for live To-Do checklist counts
  const { data: studies = [] } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => (projectId ? api.listStudies(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 10000,
  });

  // RoB summary query
  const { data: robSummary } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => (projectId ? api.robSummary(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
    staleTime: 15000,
  });

  // Meta-analysis list query
  const { data: metaList = [] } = useQuery({
    queryKey: ["meta-analyses", projectId],
    queryFn: () => (projectId ? api.listMetaAnalyses(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 15000,
  });

  // GRADE list query
  const { data: gradeList = [] } = useQuery({
    queryKey: ["grade-list", projectId],
    queryFn: () => (projectId ? api.listGrade(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 15000,
  });

  const stageName = getStageName(location.pathname);

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  };

  // Derive workflow checklist status
  const hasPico = Boolean(project?.pico_json && project.pico_json.trim().length > 10);
  const totalStudies = studies.length;
  const screenedCount = studies.filter((s) => s.screening_status && s.screening_status !== "pending").length;
  const includedCount = studies.filter((s) => s.screening_status === "included").length;
  const extractedCount = studies.filter((s) => s.extractions && s.extractions.length > 0).length;
  const robAssessmentsCount = robSummary?.total_assessments || 0;
  const metaCount = metaList.length;
  const gradeCount = gradeList.length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#fbf9f4] text-[#4f444b] font-['Work_Sans']">
      {/* 1. LEFT ICON RAIL (56px) - Paper background, 1px hairline border-r */}
      <aside
        className="w-[56px] min-w-[56px] max-w-[56px] h-full border-r border-[#d2c2cb] bg-[#fbf9f4] flex flex-col justify-between py-3 z-30 select-none"
        aria-label="Navigation rail"
      >
        <div className="flex flex-col items-center gap-4">
          {/* Top Brand Monogram */}
          <Link
            to={projectId ? `/projects/${projectId}` : "/projects"}
            className="w-9 h-9 rounded flex items-center justify-center font-serif text-lg font-bold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
            title="V"
            aria-label="Home"
          >
            V
          </Link>

          {/* Navigation Items */}
          <nav className="flex flex-col items-center gap-1 w-full">
            {SHELL_NAV_ITEMS.map((item) => {
              const targetUrl = item.to(projectId);
              const isActive = item.matchPattern.test(location.pathname);
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.label}
                  to={targetUrl}
                  title={item.label}
                  className={cn(
                    "w-full h-11 flex items-center justify-center transition-colors relative group",
                    isActive
                      ? "text-[#3a0f34] border-l-2 border-[#3a0f34]"
                      : "text-[#62535d] border-l-2 border-transparent hover:text-[#3a0f34] hover:bg-[#eee7ec]/50"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {/* Tooltip on hover */}
                  <span className="absolute left-[58px] px-2.5 py-1 bg-[#3a0f34] text-[#fbf9f4] text-[11px] font-medium rounded shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom Rail Actions */}
        <div className="flex flex-col items-center gap-2">
          <Link
            to={projectId ? `/projects/${projectId}/export` : "/projects"}
            className="w-10 h-10 flex items-center justify-center text-[#62535d] hover:text-[#3a0f34] hover:bg-[#eee7ec]/50 rounded transition-colors group relative"
            title="Help & Guides"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="absolute left-[58px] px-2.5 py-1 bg-[#3a0f34] text-[#fbf9f4] text-[11px] font-medium rounded shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              Help & Documentation
            </span>
          </Link>

          {/* Reviewer Monogram Avatar */}
          <div
            className="w-8 h-8 rounded-full border border-[#d2c2cb] bg-[#eee7ec] text-[#3a0f34] text-xs font-semibold flex items-center justify-center"
            title="Reviewer Active"
          >
            CS
          </div>
        </div>
      </aside>

      {/* 2. MAIN APP SHELL COLUMN (Top Bar + Center Content + Right Dock) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#fbf9f4]">
        {/* 2. TOP BAR (56px) - Wine #3a0f34 Background, Light Text #fbf9f4 */}
        <header
          className="h-[56px] min-h-[56px] max-h-[56px] bg-[#3a0f34] text-[#fbf9f4] px-4 flex items-center justify-between z-20 select-none shadow-xs"
          role="banner"
        >
          {/* Left Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to={projectId ? `/projects/${projectId}` : "/projects"}
              className="font-serif font-bold text-sm text-[#fbf9f4] hover:underline truncate max-w-[280px] sm:max-w-[420px]"
              title={project?.name || "Projects"}
            >
              {project?.name || (projectId ? `Project ${projectId.slice(0, 8)}` : "V")}
            </Link>
            <span className="text-[#814d75] font-sans text-xs">/</span>
            <span className="text-xs font-['Work_Sans'] font-medium text-[#ffdea6] truncate">
              {stageName}
            </span>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5">
            {/* Live PRISMA Badge */}
            {projectId && (
              <Link
                to={`/projects/${projectId}/prisma`}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#4e1c47] hover:bg-[#66365c] text-[#fbf9f4] border border-[#814d75] text-xs font-mono transition-colors"
                title="PRISMA live progress (refetched on focus)"
              >
                <GitBranch className="h-3.5 w-3.5 text-[#ffdea6]" />
                <span>
                  {prismaFlow ? `${prismaFlow.screened || 0} / ${prismaFlow.identified || 0} screened` : "PRISMA Flow"}
                </span>
              </Link>
            )}

            {/* Export Action */}
            {projectId && (
              <Link
                to={`/projects/${projectId}/export`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#4e1c47] hover:bg-[#1a0017] border border-[#814d75] rounded transition-colors"
                title="Export synthesis package"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Export</span>
              </Link>
            )}

            {/* Share Action */}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#4e1c47] hover:bg-[#1a0017] border border-[#814d75] rounded transition-colors"
              title="Share review workspace link"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{shareCopied ? "Copied!" : "Share"}</span>
            </button>

            {/* Dock Toggle Button */}
            <button
              type="button"
              onClick={() => setIsDockOpen(!isDockOpen)}
              className={cn(
                "p-1.5 rounded transition-colors border",
                isDockOpen
                  ? "bg-[#66365c] text-[#fbf9f4] border-[#814d75]"
                  : "bg-[#4e1c47] text-[#fbf9f4] border-[#814d75]/50 hover:bg-[#66365c]"
              )}
              title={isDockOpen ? "Collapse review dock" : "Expand review dock"}
              aria-label="Toggle review dock"
            >
              {isDockOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* 3. CENTER CONTENT + RIGHT DOCK CONTAINER */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative bg-[#fbf9f4]">
          {/* Center Pane: <Outlet /> on paper, hairline dividers, zero card shadows */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-[#fbf9f4] transition-all">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>

          {/* Backdrop for Slide-over Dock on small screens (<1024px) */}
          {isDockOpen && (
            <div
              className="fixed inset-0 z-40 bg-[#1a0017]/30 backdrop-blur-2xs lg:hidden"
              onClick={() => setIsDockOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* 4. RIGHT DOCK (340px) - Paper background, 1px hairline border-l */}
          <aside
            className={cn(
              "border-l border-[#d2c2cb] bg-[#fbf9f4] flex flex-col z-50 select-none transition-all duration-200",
              // Mobile (<1024px): Slide-over drawer
              "fixed inset-y-0 right-0 w-[340px] max-w-[85vw] shadow-2xl lg:shadow-none lg:static lg:h-full",
              isDockOpen ? "translate-x-0" : "translate-x-full lg:hidden"
            )}
            aria-label="Review workspace dock"
          >
            {/* Dock Tab Header (Hairline Tab Row) */}
            <div className="h-11 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between px-2">
              <div className="flex gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveDockTab("todos")}
                  className={cn(
                    "px-3 py-2 rounded-t transition-colors",
                    activeDockTab === "todos"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                >
                  To-dos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDockTab("results")}
                  className={cn(
                    "px-3 py-2 rounded-t transition-colors",
                    activeDockTab === "results"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                >
                  Results
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDockTab("prisma")}
                  className={cn(
                    "px-3 py-2 rounded-t transition-colors",
                    activeDockTab === "prisma"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                >
                  PRISMA
                </button>
              </div>

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={() => setIsDockOpen(false)}
                className="p-1 rounded text-[#62535d] hover:text-[#3a0f34] lg:hidden"
                aria-label="Close dock"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Dock Tab Content (Hairline-separated list rows, no card boxes) */}
            <div className="flex-1 overflow-y-auto">
              {/* TAB 1: TO-DOS (Live API checklist) */}
              {activeDockTab === "todos" && (
                <div className="divide-y divide-[rgba(210,194,203,0.45)] text-xs">
                  {/* Step 1: PICO */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/pico`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {hasPico ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">PICO Protocol</div>
                        <div className="text-[11px] text-[#62535d]">
                          {hasPico ? "Criteria configured" : "Draft protocol pending"}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-[#81737b] shrink-0" />
                  </div>

                  {/* Step 2: Title & Abstract Screening */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/screening?stage=ta`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {screenedCount >= totalStudies && totalStudies > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">Title / Abstract Screening</div>
                        <div className="text-[11px] text-[#62535d]">
                          {totalStudies > 0 ? `${screenedCount} of ${totalStudies} decided` : "No studies imported"}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#814d75] font-semibold shrink-0">
                      {screenedCount}/{totalStudies}
                    </span>
                  </div>

                  {/* Step 3: Full-Text Eligibility */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/screening?stage=ft`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {includedCount > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">Full-Text Assessment</div>
                        <div className="text-[11px] text-[#62535d]">
                          {prismaFlow ? `${prismaFlow.included || 0} studies included` : "0 included"}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-[#81737b] shrink-0" />
                  </div>

                  {/* Step 4: Data Extraction */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/extraction-sheet`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {extractedCount > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">Extraction Sheet</div>
                        <div className="text-[11px] text-[#62535d]">
                          {extractedCount} studies with verified values
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#814d75] font-semibold shrink-0">
                      {extractedCount}
                    </span>
                  </div>

                  {/* Step 5: Risk of Bias */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/rob`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {robAssessmentsCount > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">Risk of Bias</div>
                        <div className="text-[11px] text-[#62535d]">
                          {robAssessmentsCount} assessments recorded
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#814d75] font-semibold shrink-0">
                      {robAssessmentsCount}
                    </span>
                  </div>

                  {/* Step 6: Evidence Synthesis (conditional: pool | descriptive) */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/meta-analysis`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {metaCount > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">Evidence Synthesis</div>
                        <div className="text-[11px] text-[#62535d]">
                          {metaCount > 0 ? `${metaCount} synthesis cohorts` : "Pooled or descriptive profile"}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#814d75] font-semibold shrink-0">
                      {metaCount}
                    </span>
                  </div>

                  {/* Step 7: GRADE Certainty (finalized after synthesis) */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/grade`)}
                    className="p-3.5 hover:bg-black/[0.02] cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {gradeCount > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-[#7c5800] shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-[#81737b] shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#4f444b] truncate">GRADE Certainty</div>
                        <div className="text-[11px] text-[#62535d]">
                          {gradeCount > 0 ? `${gradeCount} outcomes evaluated` : "Finalized after synthesis"}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#814d75] font-semibold shrink-0">
                      {gradeCount}
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: RESULTS (Exportable Artifacts with Direct Action) */}
              {activeDockTab === "results" && (
                <div className="divide-y divide-[rgba(210,194,203,0.45)] text-xs">
                  {/* PRISMA Diagram */}
                  <div className="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <div className="font-semibold text-[#4f444b]">PRISMA 2020 Flow Diagram</div>
                      <div className="text-[11px] text-[#62535d]">Publication-grade SVG & PNG</div>
                    </div>
                    <Link
                      to={`/projects/${projectId}/prisma`}
                      className="px-2.5 py-1 rounded border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] font-semibold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      <span>Export</span>
                    </Link>
                  </div>

                  {/* Screening Decisions CSV */}
                  <div className="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <div className="font-semibold text-[#4f444b]">Screening Decisions CSV</div>
                      <div className="text-[11px] text-[#62535d]">Full audit trail & reason codes</div>
                    </div>
                    <Link
                      to={`/projects/${projectId}/export`}
                      className="px-2.5 py-1 rounded border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] font-semibold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      <span>CSV</span>
                    </Link>
                  </div>

                  {/* Extraction Sheet */}
                  <div className="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <div className="font-semibold text-[#4f444b]">Extraction Data Matrix</div>
                      <div className="text-[11px] text-[#62535d]">Multi-variable formatted Excel</div>
                    </div>
                    <Link
                      to={`/projects/${projectId}/export`}
                      className="px-2.5 py-1 rounded border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] font-semibold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      <span>XLSX</span>
                    </Link>
                  </div>

                  {/* RoB Visual Package */}
                  <div className="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <div className="font-semibold text-[#4f444b]">Risk of Bias Summary Package</div>
                      <div className="text-[11px] text-[#62535d]">Traffic-light plots & domain tables</div>
                    </div>
                    <Link
                      to={`/projects/${projectId}/rob`}
                      className="px-2.5 py-1 rounded border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] font-semibold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      <span>View</span>
                    </Link>
                  </div>

                  {/* Meta-Analysis Synthesis */}
                  <div className="p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <div className="font-semibold text-[#4f444b]">Meta-Analysis Forest Plots</div>
                      <div className="text-[11px] text-[#62535d]">Pooled effect estimates & CIs</div>
                    </div>
                    <Link
                      to={`/projects/${projectId}/meta-analysis`}
                      className="px-2.5 py-1 rounded border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] font-semibold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      <span>Plots</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* TAB 3: PRISMA MINI-FLOW (Hairline Outlines, Wine Numerals, Clickable) */}
              {activeDockTab === "prisma" && (
                <div className="p-3.5 space-y-2.5 text-xs">
                  <div className="text-[11px] text-[#62535d] mb-2 font-mono uppercase tracking-wider">
                    PRISMA 2020 Live Flow
                  </div>

                  {/* 1. Identification */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/studies`)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] rounded p-2.5 hover:border-[#814d75] cursor-pointer transition-colors"
                  >
                    <div className="text-[10px] uppercase font-mono text-[#81737b] font-semibold">
                      1. Identification
                    </div>
                    <div className="font-serif text-xl font-bold text-[#3a0f34]">
                      {prismaFlow?.identified ?? totalStudies}
                    </div>
                    <div className="text-[11px] text-[#62535d]">Records identified from databases</div>
                  </div>

                  {/* 2. Deduplication */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/studies`)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] rounded p-2.5 hover:border-[#814d75] cursor-pointer transition-colors"
                  >
                    <div className="text-[10px] uppercase font-mono text-[#81737b] font-semibold">
                      2. Duplicates Removed
                    </div>
                    <div className="font-serif text-xl font-bold text-[#3a0f34]">
                      {prismaFlow?.duplicates_removed ?? 0}
                    </div>
                    <div className="text-[11px] text-[#62535d]">Exact & fuzzy duplicates eliminated</div>
                  </div>

                  {/* 3. Title / Abstract Screened */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/screening?stage=ta`)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] rounded p-2.5 hover:border-[#814d75] cursor-pointer transition-colors"
                  >
                    <div className="text-[10px] uppercase font-mono text-[#81737b] font-semibold">
                      3. Title / Abstract Screened
                    </div>
                    <div className="font-serif text-xl font-bold text-[#3a0f34]">
                      {prismaFlow?.screened ?? screenedCount}
                    </div>
                    <div className="text-[11px] text-[#62535d]">
                      {prismaFlow?.excluded ?? 0} excluded at abstract stage
                    </div>
                  </div>

                  {/* 4. Full Text Assessed */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/screening?stage=ft`)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] rounded p-2.5 hover:border-[#814d75] cursor-pointer transition-colors"
                  >
                    <div className="text-[10px] uppercase font-mono text-[#81737b] font-semibold">
                      4. Full-Text Assessed
                    </div>
                    <div className="font-serif text-xl font-bold text-[#3a0f34]">
                      {prismaFlow?.full_text_assessed ?? 0}
                    </div>
                    <div className="text-[11px] text-[#62535d]">
                      {prismaFlow?.full_text_excluded ?? 0} excluded with specific reason
                    </div>
                  </div>

                  {/* 5. Included in Synthesis */}
                  <div
                    onClick={() => projectId && navigate(`/projects/${projectId}/extraction-sheet`)}
                    className="border border-[#3a0f34] bg-[#fbf9f4] rounded p-2.5 hover:border-[#1a0017] cursor-pointer transition-colors"
                  >
                    <div className="text-[10px] uppercase font-mono text-[#814d75] font-bold">
                      5. Included in Synthesis
                    </div>
                    <div className="font-serif text-2xl font-bold text-[#3a0f34]">
                      {prismaFlow?.included ?? includedCount}
                    </div>
                    <div className="text-[11px] text-[#62535d]">Studies included in systematic review</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Global Clarification Toast Notification Center */}
      {projectId && (
        <ClarificationNotificationCenter
          projectId={projectId}
        />
      )}
    </div>
  );
}
