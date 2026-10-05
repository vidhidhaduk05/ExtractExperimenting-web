import { Outlet, NavLink, useParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useState, useEffect } from "react";
import { FlaskConical, Folder, FileText, CheckSquare, ShieldCheck, Table, Download, Home, GitBranch, BarChart3, Award, Target, Settings, ChevronDown, Key, Layers, Wrench, Save, X, Loader2, LineChart, Network, Share2, Sun, Moon, Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import { ErrorBoundary } from "../common/ErrorBoundary";

const navItems = [
  { to: "/projects", label: "Projects", icon: Home, end: true },
  { to: "/graph/code", label: "Code Graph", icon: Network },
];

const projectNavItems = (projectId: string) => [
  { to: `/projects/${projectId}`, label: "Dashboard", icon: Folder, end: true },
  { to: `/projects/${projectId}/pico`, label: "PICO & Hypothesis", icon: Target },
  { to: `/projects/${projectId}/studies`, label: "Studies", icon: FileText },
  { to: `/projects/${projectId}/screening`, label: "Screening", icon: CheckSquare },
  { to: `/projects/${projectId}/prisma`, label: "PRISMA Flow", icon: GitBranch },
  { to: `/projects/${projectId}/review`, label: "Data Review", icon: Table },
  { to: `/projects/${projectId}/rob`, label: "Risk of Bias", icon: ShieldCheck },
  { to: `/projects/${projectId}/meta-analysis`, label: "Meta-Analysis", icon: BarChart3 },
  { to: `/projects/${projectId}/analysis`, label: "Data Analysis", icon: LineChart },
  { to: `/projects/${projectId}/graph/review`, label: "Review Graph", icon: Share2 },
  { to: `/projects/${projectId}/grade`, label: "GRADE", icon: Award },
  { to: `/projects/${projectId}/export`, label: "Export", icon: Download },
];

// Settings panel state
interface SettingsPanelProps {
  projectId?: string;
}

function SettingsPanel({ projectId }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pubmedKey, setPubmedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const saveMutation = useMutation({
    mutationFn: (key: string) => api.setPubmedKey(projectId!, key),
    onSuccess: () => {
      setSaved(true);
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e: Error) => {
      setError(e.message);
      setSaving(false);
    },
  });

  return (
    <div className="relative ml-auto mr-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Settings"
      >
        <Settings className="h-5 w-5 text-gray-600" />
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-phylo-blue" />
                Project Settings
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* PubMed API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Key className="h-4 w-4 text-phylo-blue" />
                  PubMed API Key
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Optional: Enter your NCBI API key for higher rate limits (10 req/s vs 3 req/s).
                  <a href="https://www.ncbi.nlm.nih.gov/account/settings/" target="_blank" rel="noopener noreferrer" className="text-phylo-blue hover:underline ml-1">
                    Get key
                  </a>
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={pubmedKey}
                    onChange={(e) => setPubmedKey(e.target.value)}
                    placeholder={pubmedKey === "********" ? "Key is set (masked)" : "Enter API key"}
                    className="input flex-1 text-sm"
                    disabled={saving}
                  />
                  <button
                    onClick={() => {
                      if (pubmedKey.trim()) {
                        setSaving(true);
                        setError("");
                        saveMutation.mutate(pubmedKey.trim());
                      }
                    }}
                    disabled={saving || !pubmedKey.trim()}
                    className="btn-primary text-xs whitespace-nowrap"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
                {saved && <p className="text-xs text-phylo-green">Saved!</p>}
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <Link to={`/projects/${projectId}/pico`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <Target className="h-4 w-4" /> PICO & Hypothesis
                </Link>
                <Link to={`/projects/${projectId}/studies`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <FileText className="h-4 w-4" /> Manage Studies
                </Link>
                <Link to={`/projects/${projectId}/screening`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <CheckSquare className="h-4 w-4" /> Screening
                </Link>
                <Link to={`/projects/${projectId}/review`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <Table className="h-4 w-4" /> Data Review
                </Link>
                <Link to={`/projects/${projectId}/rob`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <ShieldCheck className="h-4 w-4" /> Risk of Bias
                </Link>
                <Link to={`/projects/${projectId}/meta-analysis`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <BarChart3 className="h-4 w-4" /> Meta-Analysis
                </Link>
                <Link to={`/projects/${projectId}/analysis`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <LineChart className="h-4 w-4" /> Data Analysis
                </Link>
                <Link to={`/projects/${projectId}/grade`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <Award className="h-4 w-4" /> GRADE
                </Link>
                <Link to={`/projects/${projectId}/export`} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                  <Download className="h-4 w-4" /> Export
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppLayout() {
  const { projectId } = useParams();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  return (
    <div className="flex h-screen bg-phylo-paper dark:bg-gray-900 transition-colors">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col transform transition-transform duration-300 md:relative md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-phylo-blue" />
            <span className="font-bold text-lg dark:text-gray-100">RadExtract</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>

          {projectId && (
            <>
              <div className="px-4 py-2 mt-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Current Project
              </div>
              <div className="px-3">
                {projectNavItems(projectId).map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
          RadExtract Platform v2.4
        </div>
      </aside>

      {/* Main content with top bar */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Top bar with settings */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sticky top-0 z-30 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle Menu"
              >
                <Menu className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
              <Layers className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {projectId ? "Project: " + projectId.substring(0, 20) : "RadExtract Platform"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 text-gray-400" />
                ) : (
                  <Moon className="h-5 w-5 text-gray-600" />
                )}
              </button>
              {projectId && <SettingsPanel projectId={projectId} />}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  badge,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: string | number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02]",
          isActive
            ? "bg-phylo-blue/10 text-phylo-blue dark:bg-phylo-blue/20 dark:text-blue-400"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[0.65rem] font-bold text-white bg-phylo-blue rounded-full">
          {badge}
        </span>
      )}
    </NavLink>
  );
}


