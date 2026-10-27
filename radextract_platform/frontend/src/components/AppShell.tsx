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
  ArrowLeft,
  ChevronDown,
  LayoutGrid,
  Bell,
  Plus,
  Check,
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
    to: () => "/projects",
    matchPattern: /^\/projects\/?$/,
    label: "All Projects",
    icon: LayoutGrid,
  },
  {
    to: (pid) => (pid ? `/projects/${pid}` : "/projects"),
    matchPattern: /^\/projects\/[^/]+\/?$/,
    label: "Project Overview",
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
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);

  // Close project switcher on navigation or outside click
  useEffect(() => {
    setIsProjectSwitcherOpen(false);
  }, [location.pathname]);

  // Fetch all projects for quick switcher dropdown
  const { data: allProjects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    staleTime: 30000,
  });

  // Effective project ID for universal clarification notifications
  const effectiveProjectId = projectId || (allProjects.length > 0 ? allProjects[0]?.id : "proj_pam_current");

  // Fetch pending clarification questions count for universal notification bell badge
  const { data: pendingClarifications = [] } = useQuery({
    queryKey: ["pending-clarifications", effectiveProjectId],
    queryFn: () => (effectiveProjectId ? api.listClarifications(effectiveProjectId, "pending") : Promise.resolve([])),
    refetchInterval: 6000,
  });

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
            to="/projects"
            className="w-9 h-9 rounded flex items-center justify-center font-serif text-lg font-bold text-[#3a0f34] hover:bg-[#eee7ec] transition-colors"
            title="All Projects (Catalog)"
          >
            R
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
          className="h-[56px] min-h-[56px] max-h-[56px] bg-[#3a0f34] text-[#fbf9f4] px-3 sm:px-4 flex items-center justify-between z-20 select-none shadow-xs border-b border-[#4e1c47]"
          role="banner"
        >
          {/* Left Breadcrumb & Universal Navigation */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {/* Universal Return to All Projects Action Button */}
            <Link
              to="/projects"
              className={cn(
                "inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-all shrink-0",
                "bg-[#4e1c47] hover:bg-[#1a0017] text-[#fbf9f4] border border-[#814d75] shadow-2xs hover:border-[#ffdea6]",
                !projectId && location.pathname.startsWith("/projects") && "ring-1 ring-[#ffdea6] bg-[#1a0017]"
              )}
              title="Return to All Projects (Global Project Catalog)"
              aria-label="All Projects Catalog"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#ffdea6] shrink-0" />
              <span className="inline tracking-tight">All Projects</span>
            </Link>

            {projectId ? (
              <>
                <span className="text-[#814d75] font-sans text-xs select-none">/</span>

                {/* Project Name + Project Switcher Dropdown */}
                <div className="relative flex items-center min-w-0">
                  <div className="inline-flex items-center gap-1 max-w-[170px] sm:max-w-[280px] md:max-w-[380px] bg-[#4e1c47]/50 hover:bg-[#4e1c47] px-2 py-0.5 rounded border border-transparent hover:border-[#814d75] transition-colors">
                    <Link
                      to={`/projects/${projectId}`}
                      className="font-serif font-bold text-xs sm:text-sm text-[#fbf9f4] hover:text-[#ffdea6] truncate"
                      title={project?.name || `Project ${projectId}`}
                    >
                      {project?.name || `Project ${projectId.slice(0, 8)}`}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setIsProjectSwitcherOpen(!isProjectSwitcherOpen)}
                      className="p-0.5 hover:text-[#ffdea6] text-[#d2c2cb] transition-colors"
                      title="Switch project"
                      aria-label="Toggle project switcher"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Project Switcher Dropdown Menu */}
                  {isProjectSwitcherOpen && (
                    <div
                      className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 bg-[#ffffff] border border-[#d2c2cb] rounded-lg shadow-xl py-2 z-50 text-[#4f444b] font-['Work_Sans']"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-1.5 border-b border-[#d2c2cb] flex items-center justify-between">
                        <span className="text-[11px] font-mono uppercase font-bold text-[#814d75]">
                          Switch Research Project
                        </span>
                        <Link
                          to="/projects/new"
                          onClick={() => setIsProjectSwitcherOpen(false)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3a0f34] hover:underline"
                        >
                          <Plus className="w-3 h-3" /> New
                        </Link>
                      </div>

                      <div className="max-h-56 overflow-y-auto py-1">
                        {allProjects.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[#72636d]">No other projects found</div>
                        ) : (
                          allProjects.map((p) => {
                            const isCurrent = p.id === projectId;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setIsProjectSwitcherOpen(false);
                                  navigate(`/projects/${p.id}`);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#eee7ec]/60 transition-colors",
                                  isCurrent && "bg-[#eee7ec] font-semibold text-[#3a0f34]"
                                )}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="truncate font-medium">{p.name}</div>
                                  <div className="text-[10px] text-[#72636d] font-mono truncate">
                                    {p.id.slice(0, 10)}
                                  </div>
                                </div>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-[#814d75] shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="border-t border-[#d2c2cb] px-3 pt-2 pb-1">
                        <Link
                          to="/projects"
                          onClick={() => setIsProjectSwitcherOpen(false)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#814d75] hover:text-[#3a0f34] transition-colors"
                        >
                          <Folder className="w-3.5 h-3.5" />
                          <span>View All Projects Catalog</span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <span className="text-[#814d75] font-sans text-xs select-none">/</span>

                {/* Current Stage Pill */}
                <span className="text-xs font-['Work_Sans'] font-medium text-[#ffdea6] truncate px-2 py-0.5 rounded bg-[#4e1c47]/70 border border-[#814d75]/70 hidden xs:inline-block">
                  {stageName}
                </span>
              </>
            ) : (
              <>
                <span className="text-[#814d75] font-sans text-xs select-none">/</span>
                <span className="text-xs font-['Work_Sans'] font-medium text-[#ffdea6] truncate px-2 py-0.5 rounded bg-[#4e1c47]/70 border border-[#814d75]/70">
                  {stageName}
                </span>
              </>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Universal Clarification Notification Bell */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("toggle-clarification-inbox"))}
              className="relative inline-flex items-center justify-center p-1.5 rounded bg-[#4e1c47] hover:bg-[#1a0017] text-[#fbf9f4] border border-[#814d75] transition-colors"
              title={`Clarification Questions & Notifications (${pendingClarifications.length} pending)`}
              aria-label="Toggle notifications and clarifications"
            >
              <Bell className="h-4 w-4 text-[#ffdea6]" />
              {pendingClarifications.length > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[16px] h-4 rounded-full bg-[#ffdea6] text-[#3a0f34] text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {pendingClarifications.length}
                </span>
              )}
            </button>

            {/* Live PRISMA Badge */}
            {projectId && (
              <Link
                to={`/projects/${projectId}/prisma`}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#4e1c47] hover:bg-[#66365c] text-[#fbf9f4] border border-[#814d75] text-xs font-mono transition-colors"
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
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#4e1c47] hover:bg-[#1a0017] border border-[#814d75] rounded transition-colors"
                title="Export synthesis package"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Link>
            )}

            {/* Share Action */}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#fbf9f4] bg-[#4e1c47] hover:bg-[#1a0017] border border-[#814d75] rounded transition-colors"
              title="Share review workspace link"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{shareCopied ? "Copied!" : "Share"}</span>
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
      <ClarificationNotificationCenter
        projectId={effectiveProjectId}
      />
    </div>
  );
}
