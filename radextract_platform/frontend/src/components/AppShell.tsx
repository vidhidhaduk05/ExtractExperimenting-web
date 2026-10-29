import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  ChevronLeft,
  ChevronRight,
  Home,
  X,
  ExternalLink,
  Table,
  Layers,
  Play,
  Loader2,
  Sparkles,
  Pause,
  Square,
} from "lucide-react";
import { cn } from "../lib/utils";
import { ErrorBoundary } from "./common/ErrorBoundary";
import { ClarificationNotificationCenter } from "./common/ClarificationNotificationCenter";
import { GoogleTasksPanel } from "./common/GoogleTasksPanel";
import { ClarificationSidePanel } from "./screening/ClarificationSidePanel";
import type { ClarificationQuestion } from "../lib/api";
import { GripVertical } from "lucide-react";

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
    to: (pid) => (pid ? `/projects/${pid}/studies` : "/projects"),
    matchPattern: /\/(studies|deduplicat)/,
    label: "Deduplication",
    icon: Layers,
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
  if (pathname.includes("/studies") || pathname.includes("/deduplicate")) return "Studies & Deduplication";
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

  const [activeDockTab, setActiveDockTab] = useState<"todos" | "tasks" | "questions" | "results" | "prisma">("todos");

  const queryClient = useQueryClient();

  const continuePipelineMutation = useMutation({
    mutationFn: (stage: "abstract" | "fulltext") => api.continueAIScreening(projectId!, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["prisma-flow", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
    },
  });

  const { data: screeningProgress } = useQuery({
    queryKey: ["screening-progress", projectId],
    queryFn: () => (projectId ? api.getAIScreeningProgress(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
    refetchInterval: (query) => (query.state.data?.active ? 1500 : 8000),
  });

  const { data: missingDataSummary } = useQuery({
    queryKey: ["missing-data-summary", projectId],
    queryFn: () => (projectId && projectId !== "demo" ? api.getMissingDataSummary(projectId) : Promise.resolve(null)),
    enabled: !!projectId && projectId !== "demo",
  });

  const startAnalysisMutation = useMutation({
    mutationFn: () => api.startAIAnalysis(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    },
  });

  const startFullPipelineMutation = useMutation({
    mutationFn: () => api.startAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.resumeAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelAIScreening(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screening-progress", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-studies", projectId] });
      queryClient.invalidateQueries({ queryKey: ["screening-summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["studies", projectId] });
    },
  });

  // Adjustable dock width state (persisted in localStorage, default 380px, clamped [280px, 720px])
  const [dockWidth, setDockWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("radextract_dock_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 280 && parsed <= 800) return parsed;
      }
    }
    return 380;
  });
  const [isResizing, setIsResizing] = useState(false);
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

  // Pending clarifications query for the Questions tab badge
  const { data: pendingClarifications = [] } = useQuery<ClarificationQuestion[]>({
    queryKey: ["pending-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId, "pending") : Promise.resolve([])),
    enabled: !!projectId,
    refetchInterval: 6000,
  });

  // Listen for global custom event to open Questions dock tab from anywhere (e.g. ScreeningPage Questions bundle button)
  useEffect(() => {
    const handleOpenQuestions = () => {
      setIsDockOpen(true);
      setActiveDockTab("questions");
    };
    window.addEventListener("open-clarification-dock", handleOpenQuestions);
    return () => window.removeEventListener("open-clarification-dock", handleOpenQuestions);
  }, []);

  // Mouse move and mouse up for resizing the right dock
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dock is on the right side: width = window.innerWidth - mouseX
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 280), Math.min(window.innerWidth * 0.75, 800));
      setDockWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem("radextract_dock_width", dockWidth.toString());
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, dockWidth]);

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

  // Derive workflow checklist status & PRISMA numbers
  const hasPico = Boolean(project?.pico_json && project.pico_json.trim().length > 10);
  const totalStudies = (prismaFlow?.identification?.total ?? (prismaFlow as any)?.identified) || studies.length;
  const screenedCount =
    prismaFlow?.screening?.records_screened ??
    (prismaFlow as any)?.screened ??
    studies.filter((s) => s.screening_status && s.screening_status !== "pending").length;
  const duplicatesRemovedCount =
    prismaFlow?.identification?.duplicates_removed ??
    (prismaFlow as any)?.duplicates_removed ??
    studies.filter((s) => s.is_duplicate === 1).length;
  const includedCount =
    prismaFlow?.included?.studies_in_review ??
    (prismaFlow as any)?.included ??
    studies.filter((s) => s.screening_status === "included").length;
  const fullTextAssessedCount =
    prismaFlow?.eligibility?.full_text_assessed ??
    (prismaFlow as any)?.full_text_assessed ??
    0;
  const fullTextExcludedCount =
    prismaFlow?.eligibility?.full_text_excluded ??
    (prismaFlow as any)?.full_text_excluded ??
    0;
  const abstractExcludedCount =
    prismaFlow?.screening?.records_excluded ??
    (prismaFlow as any)?.excluded ??
    studies.filter((s) => s.screening_status === "excluded").length;
  const extractedCount = studies.filter((s) => s.extractions && s.extractions.length > 0).length;
  const robAssessmentsCount = robSummary?.total_assessments || 0;
  const metaCount = metaList.length;
  const gradeCount = gradeList.length;

  // Hotkeys for browser-style Back / Forward navigation (Alt+ArrowLeft, Alt+ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Review stage sequence for Stage Prev / Next Stepper
  const stageOrder = [
    { label: "Overview", path: projectId ? `/projects/${projectId}` : "/projects" },
    { label: "Deduplication", path: projectId ? `/projects/${projectId}/studies` : "/projects" },
    { label: "Screening", path: projectId ? `/projects/${projectId}/screening` : "/projects" },
    { label: "Extraction", path: projectId ? `/projects/${projectId}/extraction-sheet` : "/projects" },
    { label: "Risk of Bias", path: projectId ? `/projects/${projectId}/rob` : "/projects" },
    { label: "Synthesis", path: projectId ? `/projects/${projectId}/meta-analysis` : "/projects" },
    { label: "GRADE", path: projectId ? `/projects/${projectId}/grade` : "/projects" },
    { label: "PRISMA", path: projectId ? `/projects/${projectId}/prisma` : "/projects" },
  ];

  const currentStageIndex = stageOrder.findIndex((s) => {
    if (s.path === location.pathname) return true;
    if (location.pathname.includes("/studies") && s.path.includes("/studies")) return true;
    if (location.pathname.includes("/screening") && s.path.includes("/screening")) return true;
    if (location.pathname.includes("/extraction") && s.path.includes("/extraction")) return true;
    if (location.pathname.includes("/rob") && s.path.includes("/rob")) return true;
    if ((location.pathname.includes("/meta-analysis") || location.pathname.includes("/analysis")) && s.path.includes("/meta-analysis")) return true;
    if (location.pathname.includes("/grade") && s.path.includes("/grade")) return true;
    if (location.pathname.includes("/prisma") && s.path.includes("/prisma")) return true;
    if (projectId && location.pathname === `/projects/${projectId}`) return true;
    return false;
  });

  const prevStage = currentStageIndex > 0 ? stageOrder[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex >= 0 && currentStageIndex < stageOrder.length - 1 ? stageOrder[currentStageIndex + 1] : null;

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
            title="RadExtract"
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
          className="h-[56px] min-h-[56px] max-h-[56px] bg-[#3a0f34] text-[#fbf9f4] px-4 flex items-center justify-between z-20 select-none shadow-xs"
          role="banner"
        >
          {/* Left Navigation Controls & Breadcrumb */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* History Back / Forward Controls */}
            <div className="flex items-center gap-1 shrink-0 bg-[#4e1c47] p-0.5 rounded border border-[#814d75]">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-1 text-[#fbf9f4] hover:bg-[#66365c] rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                title="Go back (Alt+Left)"
                aria-label="Go back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                className="p-1 text-[#fbf9f4] hover:bg-[#66365c] rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                title="Go forward (Alt+Right)"
                aria-label="Go forward"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <Link
                to="/projects"
                className="p-1 text-[#fbf9f4] hover:bg-[#66365c] rounded transition-colors border-l border-[#814d75]/60 pl-1.5"
                title="All Projects"
                aria-label="All Projects"
              >
                <Home className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Stage Stepper: Previous / Next Stage */}
            {projectId && (
              <div className="hidden md:flex items-center gap-1 shrink-0 bg-[#4e1c47] px-1.5 py-0.5 rounded border border-[#814d75] text-[11px]">
                {prevStage ? (
                  <Link
                    to={prevStage.path}
                    className="flex items-center gap-0.5 text-[#fbf9f4]/80 hover:text-[#fbf9f4] hover:underline px-1 py-0.5"
                    title={`Previous stage: ${prevStage.label}`}
                  >
                    <ChevronLeft className="w-3 h-3 text-[#ffdea6]" />
                    <span>{prevStage.label}</span>
                  </Link>
                ) : (
                  <span className="text-[#814d75] px-1 py-0.5">Start</span>
                )}
                <span className="text-[#814d75]">|</span>
                {nextStage ? (
                  <Link
                    to={nextStage.path}
                    className="flex items-center gap-0.5 text-[#fbf9f4]/80 hover:text-[#fbf9f4] hover:underline px-1 py-0.5"
                    title={`Next stage: ${nextStage.label}`}
                  >
                    <span>{nextStage.label}</span>
                    <ChevronRight className="w-3 h-3 text-[#ffdea6]" />
                  </Link>
                ) : (
                  <span className="text-[#814d75] px-1 py-0.5">End</span>
                )}
              </div>
            )}

            {/* Clickable Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-xs">
              <Link
                to="/projects"
                className="hidden lg:inline font-sans text-[#fbf9f4]/80 hover:text-[#fbf9f4] hover:underline shrink-0"
              >
                Projects
              </Link>
              <span className="hidden lg:inline text-[#814d75] font-sans text-xs">/</span>

              <Link
                to={projectId ? `/projects/${projectId}` : "/projects"}
                className="font-serif font-bold text-sm text-[#fbf9f4] hover:underline truncate max-w-[180px] sm:max-w-[280px] md:max-w-[360px] flex items-center gap-1.5"
                title={project?.name || "Project Overview"}
              >
                <span>{project?.name || (projectId ? `Project ${projectId.slice(0, 8)}` : "RadExtract")}</span>
                {project?.review_type && (
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#814d75]/50 text-[#ffdea6] font-normal border border-[#814d75]">
                    {project.review_type}
                  </span>
                )}
              </Link>

              <span className="text-[#814d75] font-sans text-xs">/</span>

              <span className="font-['Work_Sans'] font-medium text-[#ffdea6] truncate">
                {stageName}
              </span>
            </nav>
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
                  {`${screenedCount} / ${totalStudies} screened`}
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

          {/* 4. RIGHT DOCK (Adjustable width) - Paper background, 1px hairline border-l */}
          <aside
            style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? `${dockWidth}px` : undefined }}
            className={cn(
              "border-l border-[#d2c2cb] bg-[#fbf9f4] flex flex-col z-50 select-none",
              isResizing ? "transition-none select-none" : "transition-all duration-200",
              // Mobile (<1024px): Slide-over drawer
              "fixed inset-y-0 right-0 w-[340px] max-w-[85vw] shadow-2xl lg:shadow-none lg:static lg:h-full relative",
              isDockOpen ? "translate-x-0" : "translate-x-full lg:hidden"
            )}
            aria-label="Review workspace dock"
          >
            {/* Desktop Drag Handle for Adjustable Width */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              className="hidden lg:flex absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize items-center justify-center group z-50 hover:bg-[#814d75]/10 transition-colors"
              title="Drag to resize dock width"
            >
              <div className="w-[3px] h-8 rounded-full bg-[#d2c2cb] group-hover:bg-[#814d75] group-hover:h-12 transition-all shadow-xs" />
            </div>
            {/* Dock Tab Header (Hairline Tab Row) */}
            <div className="h-11 border-b border-[#d2c2cb] bg-[#fbf9f4] flex items-center justify-between px-2">
              <div className="flex gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveDockTab("todos")}
                  className={cn(
                    "px-2.5 py-2 rounded-t transition-colors",
                    activeDockTab === "todos"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                  title="Stage-by-stage review checklist"
                >
                  Checklist
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDockTab("tasks")}
                  className={cn(
                    "px-2 py-2 rounded-t transition-colors",
                    activeDockTab === "tasks"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                  title="Google Tasks style custom to-do list"
                >
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDockTab("questions")}
                  className={cn(
                    "px-2 py-2 rounded-t transition-colors flex items-center gap-1",
                    activeDockTab === "questions"
                      ? "text-[#3a0f34] border-b-2 border-[#3a0f34] font-bold"
                      : "text-[#62535d] hover:text-[#3a0f34]"
                  )}
                  title="Co-Scientist clarification questions"
                >
                  <span>Questions</span>
                  {pendingClarifications.length > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb]">
                      {pendingClarifications.length}
                    </span>
                  )}
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
              {/* TAB: QUESTIONS (Co-Scientist Clarifications MCQ Side Panel) */}
              {activeDockTab === "questions" && (
                <div className="h-full">
                  <ClarificationSidePanel projectId={projectId} />
                </div>
              )}

              {/* TAB: GOOGLE TASKS (User Tasks & Notes) */}
              {activeDockTab === "tasks" && (
                <div className="h-full">
                  <GoogleTasksPanel projectId={projectId} />
                </div>
              )}

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
                  <div className="p-3.5 hover:bg-black/[0.02] transition-colors">
                    <div
                      onClick={() => projectId && navigate(`/projects/${projectId}/screening?stage=ta`)}
                      className="cursor-pointer flex items-center justify-between gap-3"
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-[#814d75] font-semibold">
                          {screenedCount}/{totalStudies}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#81737b]" />
                      </div>
                    </div>

                    {/* Stage Pipeline Execution Controls within Checklist */}
                    {projectId && (
                      <div className="mt-2.5 pt-2 border-t border-[#d2c2cb]/40 space-y-2">
                        {screeningProgress?.active ? (
                          <div className="p-2.5 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[#3a0f34] flex items-center gap-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#814d75]" />
                                {screeningProgress.paused ? "Screening Paused" : "Screening in Progress..."}
                              </span>
                              <span className="font-mono text-[11px] text-[#62535d] font-bold">
                                {screeningProgress.screened}/{screeningProgress.total}
                              </span>
                            </div>
                            <div className="w-full bg-[#eee7ec] rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-[#814d75] h-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    screeningProgress.total > 0
                                      ? (screeningProgress.screened / screeningProgress.total) * 100
                                      : 0
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 justify-end pt-1">
                              {screeningProgress.paused ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resumeMutation.mutate();
                                  }}
                                  disabled={resumeMutation.isPending}
                                  className="text-[10px] font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-emerald-800 text-emerald-800" />
                                  <span>Resume</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    pauseMutation.mutate();
                                  }}
                                  disabled={pauseMutation.isPending}
                                  className="text-[10px] font-semibold px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <Pause className="w-3 h-3 fill-amber-800 text-amber-800" />
                                  <span>Pause</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelMutation.mutate();
                                }}
                                disabled={cancelMutation.isPending}
                                className="text-[10px] font-semibold px-2 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Square className="w-3 h-3 fill-rose-600 text-rose-600" />
                                <span>Stop</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startAnalysisMutation.mutate();
                              }}
                              disabled={startAnalysisMutation.isPending || startFullPipelineMutation.isPending}
                              className="text-[10px] text-[#3a0f34] hover:text-[#1a0017] font-semibold px-2 py-1 rounded bg-[#ffffff] hover:bg-[#eee7ec] border border-[#d2c2cb] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Run Stage 1: Automated Title & Abstract screening triage"
                            >
                              {startAnalysisMutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-2.5 h-2.5 fill-[#3a0f34] text-[#3a0f34]" />
                              )}
                              <span>Start Stage 1 (T&amp;A)</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startFullPipelineMutation.mutate();
                              }}
                              disabled={startFullPipelineMutation.isPending || startAnalysisMutation.isPending}
                              className="text-[10px] text-[#fbf9f4] hover:bg-[#1a0017] font-semibold px-2 py-1 rounded bg-[#3a0f34] transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Start Full Co-Scientist Screening across all stages"
                            >
                              {startFullPipelineMutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3 text-[#ffdea6]" />
                              )}
                              <span>Start Full Pipeline</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                continuePipelineMutation.mutate("abstract");
                              }}
                              disabled={continuePipelineMutation.isPending}
                              className="col-span-full text-[10px] text-[#62535d] hover:text-[#3a0f34] font-medium px-2 py-0.5 rounded bg-[#eee7ec]/60 hover:bg-[#eee7ec] border border-[#d2c2cb]/60 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              title="Advance Abstract: Run Stage 2 on pending and uncertain studies"
                            >
                              {continuePipelineMutation.isPending && continuePipelineMutation.variables === "abstract" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-2.5 h-2.5 fill-[#62535d] text-[#62535d]" />
                              )}
                              <span>Advance Abstract &rarr;</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
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
                          {`${includedCount} studies included`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {projectId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            continuePipelineMutation.mutate("fulltext");
                          }}
                          disabled={continuePipelineMutation.isPending}
                          className="text-[10px] text-[#3a0f34] hover:text-[#1a0017] font-semibold px-2 py-0.5 rounded bg-[#eee7ec] hover:bg-[#d2c2cb] border border-[#d2c2cb] transition-colors flex items-center gap-1 cursor-pointer"
                          title="Advance Full-Text: Run Stage 3 on included studies with PDFs"
                        >
                          {continuePipelineMutation.isPending && continuePipelineMutation.variables === "fulltext" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-2.5 h-2.5 fill-[#3a0f34] text-[#3a0f34]" />
                          )}
                          <span>Advance Full-Text &rarr;</span>
                        </button>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-[#81737b]" />
                    </div>
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

                  {/* Step 7: GRADE Certainty (gated for systematic / both reviews; hidden for scoping) */}
                  {project?.review_type !== "scoping" && (
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
                  )}

                  {/* Pinned Missing-Data Summary Box (per Extraction Plan) */}
                  {location.pathname.includes("/extraction") && missingDataSummary && (
                    <div className="p-3 bg-[#fbf9f4] border-t border-[#d2c2cb] mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono uppercase font-bold text-[#814d75] tracking-wider">
                          Missing-Data Summary
                        </span>
                        <span className="text-[10px] font-mono text-[#62535d]">Top variables</span>
                      </div>
                      <div className="space-y-1.5">
                        {missingDataSummary.variables && missingDataSummary.variables.length > 0 ? (
                          missingDataSummary.variables.slice(0, 4).map((item: any, idx: number) => {
                            const pct = Math.round(item.missing_pct || (item.missing_count / (missingDataSummary.total_studies || 1)) * 100);
                            return (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="truncate max-w-[150px] text-[#4f444b] font-medium" title={item.name}>
                                  {item.name}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="w-12 h-1.5 bg-[#eee7ec] rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#814d75]"
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] text-[#3a0f34] font-bold w-7 text-right">
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-[11px] text-[#81737b] italic text-center py-1">
                            No missing values flagged across variables.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                      {duplicatesRemovedCount}
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
                      {screenedCount}
                    </div>
                    <div className="text-[11px] text-[#62535d]">
                      {abstractExcludedCount} excluded at abstract stage
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
                      {fullTextAssessedCount}
                    </div>
                    <div className="text-[11px] text-[#62535d]">
                      {fullTextExcludedCount} excluded with specific reason
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
                      {includedCount}
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
