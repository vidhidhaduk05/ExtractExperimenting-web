import { Outlet, NavLink, useParams, useLocation, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useState, useEffect } from "react";
import { FlaskConical, Folder, FileText, CheckSquare, ShieldCheck, ShieldAlert, Table, Download, Home, GitBranch, BarChart3, Award, Target, Settings, ChevronDown, Key, Layers, Wrench, Save, X, Loader2, LineChart, Network, Share2, Sun, Moon, Menu, PanelLeftClose, PanelLeftOpen, Highlighter, FileSpreadsheet, Sparkles, Mail, Bookmark } from "lucide-react";
import { cn } from "../../lib/utils";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { ClarificationNotificationCenter } from "../common/ClarificationNotificationCenter";
import { subscribeApiConnection, ApiConnectionInfo, getApiConnectionInfo } from "../../lib/api";

const navItems = [
  { to: "/claimscape", label: "Evidence Map", icon: Layers },
  { to: "/projects", label: "Projects", icon: Home, end: true },
  { to: "/rigor-scan", label: "Rigor Scan", icon: ShieldCheck },
  { to: "/citation-telephone", label: "Citation Telephone", icon: Share2 },
  { to: "/graph/code", label: "Code Graph", icon: Network },
];

const projectNavItems = (projectId: string) => [
  { to: `/projects/${projectId}`, label: "Dashboard", icon: Folder, end: true },
  { to: `/projects/${projectId}/pico`, label: "PICO & Hypothesis", icon: Target },
  { to: `/projects/${projectId}/studies`, label: "Studies", icon: FileText },
  { to: `/projects/${projectId}/bookmarks`, label: "Bookmarked studies", icon: Bookmark },
  { to: `/projects/${projectId}/screening`, label: "Screening", icon: CheckSquare },
  { to: `/projects/${projectId}/extraction-sheet`, label: "Extraction Sheet", icon: FileSpreadsheet, badge: "Matrix" },
  { to: `/projects/${projectId}/extraction`, label: "Data Extraction (PDF)", icon: Highlighter, badge: "Docling" },
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
  const [activeTab, setActiveTab] = useState<"ai" | "pubmed" | "nav">("ai");
  const [pubmedKey, setPubmedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Co-Scientist Configuration State
  const [provider, setProvider] = useState<"antigravity" | "local">("local");
  const [localEndpoint, setLocalEndpoint] = useState<string>("http://127.0.0.1:18000/v1");
  const [localModelName, setLocalModelName] = useState<string>("coscientist-v1");
  const [antigravityModel, setAntigravityModel] = useState<string>("coscientist-v1");
  const [customKey, setCustomKey] = useState<string>("sk-live-4f8a29b3c1e7492d80ef7195a62bc34e");
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load current AI configuration
      api.getLlmConfig?.().then((res: any) => {
        if (res?.config) {
          setProvider(res.config.provider || "local");
          setLocalEndpoint(res.config.local_endpoint_url || "http://127.0.0.1:18000/v1");
          setLocalModelName(res.config.local_model_name || "coscientist-v1");
          setAntigravityModel(res.config.antigravity_model || "gemini-2.5-flash");
        }
      }).catch(() => {});
    }
  }, [isOpen]);

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

  const handleSaveLlmConfig = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateLlmConfig?.({
        provider,
        local_endpoint_url: localEndpoint,
        local_model_name: localModelName,
        antigravity_model: antigravityModel,
        custom_api_key: customKey || undefined,
        temperature: 0.1,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleTestLlmConfig = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testLlmConfig?.({
        provider,
        local_endpoint_url: localEndpoint,
        model_name: provider === "local" ? localModelName : antigravityModel,
        api_key: customKey || undefined,
      });
      setTestResult(res || { success: true, message: "Co-Scientist connection verified!" });
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || "Connection failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleResetDefaults = async () => {
    try {
      await api.resetLlmConfig?.();
      setProvider("antigravity");
      setCustomKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="relative ml-auto mr-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-[#fbf9f4] transition-colors"
        aria-label="Settings"
      >
        <Settings className="h-5 w-5" />
        <ChevronDown className="h-4 w-4 opacity-75" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-[#d2c2cb] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#4f444b]">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-[#fbf9f4] border-b border-[#d2c2cb] flex items-center justify-between">
              <h3 className="font-serif font-bold text-[#3a0f34] flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-[#814d75]" />
                System & Co-Scientist Engine Settings
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-[#eee7ec] rounded text-[#62535d] hover:text-[#3a0f34]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#d2c2cb] bg-[#fbf9f4]/60 text-xs font-semibold">
              <button
                onClick={() => setActiveTab("ai")}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${
                  activeTab === "ai"
                    ? "border-[#3a0f34] text-[#3a0f34] bg-white font-bold"
                    : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                }`}
              >
                Co-Scientist Engine & Keys
              </button>
              <button
                onClick={() => setActiveTab("pubmed")}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${
                  activeTab === "pubmed"
                    ? "border-[#3a0f34] text-[#3a0f34] bg-white font-bold"
                    : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                }`}
              >
                PubMed NCBI
              </button>
              <button
                onClick={() => setActiveTab("nav")}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${
                  activeTab === "nav"
                    ? "border-[#3a0f34] text-[#3a0f34] bg-white font-bold"
                    : "border-transparent text-[#62535d] hover:text-[#3a0f34]"
                }`}
              >
                Jump to Page
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* TAB 1: AI MODEL & API KEYS */}
              {activeTab === "ai" && (
                <div className="space-y-3.5 text-xs">
                  {/* Provider Radio Selector */}
                  <div>
                    <label className="font-bold text-[#3a0f34] block mb-1.5 font-sans">
                      Active LLM Provider:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setProvider("antigravity")}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          provider === "antigravity"
                            ? "border-[#3a0f34] bg-[#eee7ec] ring-1 ring-[#3a0f34]"
                            : "border-[#d2c2cb] hover:bg-[#fbf9f4]"
                        }`}
                      >
                        <div className="font-bold text-[#3a0f34] flex items-center justify-between">
                          <span>Antigravity Cloud</span>
                          {provider === "antigravity" && <span className="w-2 h-2 rounded-full bg-[#3a0f34]" />}
                        </div>
                        <p className="text-[10px] text-[#62535d] mt-0.5">Pre-configured Gemini 2.5 Flash agent</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setProvider("local")}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          provider === "local"
                            ? "border-[#3a0f34] bg-[#eee7ec] ring-1 ring-[#3a0f34]"
                            : "border-[#d2c2cb] hover:bg-[#fbf9f4]"
                        }`}
                      >
                        <div className="font-bold text-[#3a0f34] flex items-center justify-between">
                          <span>Custom / Local Model</span>
                          {provider === "local" && <span className="w-2 h-2 rounded-full bg-[#3a0f34]" />}
                        </div>
                        <p className="text-[10px] text-[#62535d] mt-0.5">Ollama, vLLM, LM Studio, custom key</p>
                      </button>
                    </div>
                  </div>

                  {/* Antigravity Settings */}
                  {provider === "antigravity" ? (
                    <div className="p-3 bg-[#eee7ec] border border-[#d2c2cb] rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#3a0f34]">Antigravity Default Key:</span>
                        <span className="bg-[#ffdea6] text-[#3a0f34] text-[10px] font-mono px-2 py-0.5 rounded font-bold border border-[#d2c2cb]">
                          ACTIVE & READY
                        </span>
                      </div>
                      <p className="text-[11px] text-[#4f444b]">
                        Default Gemini key <code className="bg-white px-1 py-0.5 rounded border border-[#d2c2cb]">AQ.Ab8RN6...GYqKKg</code> is loaded. Zero configuration needed for high-throughput screening and extraction.
                      </p>
                      <div>
                        <label className="text-[11px] font-semibold text-[#62535d] block mb-1">
                          Model Variant:
                        </label>
                        <select
                          value={antigravityModel}
                          onChange={(e) => setAntigravityModel(e.target.value)}
                          className="w-full text-xs p-1.5 bg-white border border-[#d2c2cb] rounded-md text-[#4f444b] focus:ring-1 focus:ring-[#814d75]"
                        >
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                          <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Extraction)</option>
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    /* Custom Local Model Settings */
                    <div className="p-3 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg space-y-2.5">
                      <div>
                        <label className="font-semibold text-[#62535d] block mb-1">
                          Local Endpoint URL:
                        </label>
                        <input
                          type="text"
                          value={localEndpoint}
                          onChange={(e) => setLocalEndpoint(e.target.value)}
                          placeholder="http://127.0.0.1:18000/v1"
                          className="w-full text-xs p-1.5 bg-white border border-[#d2c2cb] rounded-md font-mono text-[#4f444b] focus:ring-1 focus:ring-[#814d75]"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-[#62535d] block mb-1">
                          Model Identifier:
                        </label>
                        <input
                          type="text"
                          value={localModelName}
                          onChange={(e) => setLocalModelName(e.target.value)}
                          placeholder="llama3.3, deepseek-r1, qwen2.5-coder"
                          className="w-full text-xs p-1.5 bg-white border border-[#d2c2cb] rounded-md font-mono text-[#4f444b] focus:ring-1 focus:ring-[#814d75]"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-[#62535d] block mb-1">
                          Custom API Key (Optional):
                        </label>
                        <input
                          type="password"
                          value={customKey}
                          onChange={(e) => setCustomKey(e.target.value)}
                          placeholder="sk-local or private API key"
                          className="w-full text-xs p-1.5 bg-white border border-[#d2c2cb] rounded-md text-[#4f444b] focus:ring-1 focus:ring-[#814d75]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Test & Action Buttons */}
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="text-xs text-[#81737b] hover:text-[#3a0f34] underline"
                    >
                      Reset Defaults
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestLlmConfig}
                        disabled={testing}
                        className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] rounded-lg flex items-center gap-1"
                      >
                        {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Test Connection
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveLlmConfig}
                        disabled={saving}
                        className="px-3.5 py-1.5 text-xs font-bold bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] rounded-lg flex items-center gap-1 shadow-xs"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Settings
                      </button>
                    </div>
                  </div>

                  {testResult && (
                    <div className={`p-2 rounded text-xs ${testResult.success ? "bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                      {testResult.message}
                    </div>
                  )}
                  {saved && <p className="text-xs text-[#3a0f34] font-bold text-right">Saved successfully!</p>}
                  {error && <p className="text-xs text-rose-600">{error}</p>}
                </div>
              )}

              {/* TAB 2: PUBMED NCBI */}
              {activeTab === "pubmed" && (
                <div>
                  <label className="block text-sm font-medium text-[#3a0f34] mb-1 flex items-center gap-1">
                    <Key className="h-4 w-4 text-[#814d75]" />
                    PubMed NCBI API Key
                  </label>
                  <p className="text-xs text-[#62535d] mb-2">
                    Optional: Enter your NCBI API key for higher rate limits (10 req/s vs 3 req/s).
                    <a href="https://www.ncbi.nlm.nih.gov/account/settings/" target="_blank" rel="noopener noreferrer" className="text-[#814d75] hover:underline ml-1">
                      Get key
                    </a>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={pubmedKey}
                      onChange={(e) => setPubmedKey(e.target.value)}
                      placeholder={pubmedKey === "********" ? "Key is set (masked)" : "Enter API key"}
                      className="input flex-1 text-sm bg-white border border-[#d2c2cb] rounded-md p-1.5 text-[#4f444b] focus:ring-1 focus:ring-[#814d75]"
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
                      className="btn-primary text-xs whitespace-nowrap bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-3 py-1.5 rounded-md"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                  {saved && <p className="text-xs text-[#3a0f34] font-bold mt-1">Saved!</p>}
                  {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
                </div>
              )}

              {/* TAB 3: PAGE NAVIGATION */}
              {activeTab === "nav" && (
                <div className="space-y-1.5">
                  <Link to={`/projects/${projectId}/pico`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <Target className="h-4 w-4 text-[#814d75]" /> PICO & Hypothesis
                  </Link>
                  <Link to={`/projects/${projectId}/extraction`} className="block px-3 py-2 text-xs text-[#3a0f34] font-medium hover:bg-[#eee7ec] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <Highlighter className="h-4 w-4 text-[#814d75]" /> Data Extraction (PDF)
                  </Link>
                  <Link to={`/projects/${projectId}/extraction-sheet`} className="block px-3 py-2 text-xs text-[#3a0f34] font-medium hover:bg-[#eee7ec] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <FileSpreadsheet className="h-4 w-4 text-[#814d75]" /> Extraction Data Sheet
                  </Link>
                  <Link to={`/projects/${projectId}/studies`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <FileText className="h-4 w-4 text-[#814d75]" /> Manage Studies
                  </Link>
                  <Link to={`/projects/${projectId}/screening`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <CheckSquare className="h-4 w-4 text-[#814d75]" /> Screening
                  </Link>
                  <Link to={`/projects/${projectId}/review`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <Table className="h-4 w-4 text-[#814d75]" /> Data Review Matrix
                  </Link>
                  <Link to={`/projects/${projectId}/rob`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <ShieldCheck className="h-4 w-4 text-[#814d75]" /> Risk of Bias
                  </Link>
                  <Link to={`/projects/${projectId}/meta-analysis`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <BarChart3 className="h-4 w-4 text-[#814d75]" /> Meta-Analysis
                  </Link>
                  <Link to={`/projects/${projectId}/analysis`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <LineChart className="h-4 w-4 text-[#814d75]" /> Data Analysis
                  </Link>
                  <Link to={`/projects/${projectId}/grade`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <Award className="h-4 w-4 text-[#814d75]" /> GRADE
                  </Link>
                  <Link to={`/projects/${projectId}/export`} className="block px-3 py-2 text-xs text-[#4f444b] hover:bg-[#eee7ec] hover:text-[#3a0f34] rounded flex items-center gap-2" onClick={() => setIsOpen(false)}>
                    <Download className="h-4 w-4 text-[#814d75]" /> Export
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppLayout() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClarificationDrawerOpen, setIsClarificationDrawerOpen] = useState(false);
  const [apiInfo, setApiInfo] = useState<ApiConnectionInfo>(getApiConnectionInfo());

  useEffect(() => { setIsMobileMenuOpen(false); }, [pathname]);
  useEffect(() => { setIsClarificationDrawerOpen(false); }, [projectId]);

  useEffect(() => {
    return subscribeApiConnection((info) => {
      setApiInfo(info);
    });
  }, []);

  const { data: pendingClarifications = [] } = useQuery({
    queryKey: ["pending-clarifications", projectId],
    queryFn: () => (projectId ? api.listClarifications(projectId, "pending") : Promise.resolve([])),
    enabled: !!projectId,
    refetchInterval: 8000,
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("radextract_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("radextract_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  return (
    <div className="flex h-screen bg-[#fbf9f4] text-[#4f444b] font-sans transition-colors">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 shrink-0 border-r border-[#d2c2cb] bg-[#fbf9f4] flex flex-col transform transition-all duration-300 md:relative md:translate-x-0 select-none",
          isMobileMenuOpen ? "translate-x-0 w-68" : "-translate-x-full md:translate-x-0",
          isSidebarCollapsed ? "md:w-16" : "md:w-68"
        )}
      >
        <div className={cn("flex items-center justify-between px-4 py-4 border-b border-[#d2c2cb] transition-all bg-[#3a0f34] text-[#fbf9f4]")}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-8 w-8 rounded-lg bg-[#fbf9f4] text-[#3a0f34] flex items-center justify-center font-serif text-sm font-bold shadow-xs shrink-0">
              R
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif font-semibold text-base text-[#fbf9f4] tracking-tight">
                    RadExtract
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-[#ffdea6] text-[#3a0f34]">LAB</span>
                </div>
                <span className="text-[10px] text-[#fbf9f4]/75 font-sans truncate">
                  Co-Scientist for Biomedical Lit
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Minimize / Expand Toggle Button */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex p-1.5 rounded-full text-[#fbf9f4]/75 hover:text-[#fbf9f4] hover:bg-white/10 transition-colors"
              title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Minimize sidebar (Ctrl+B)"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1 rounded-full hover:bg-white/10 text-[#fbf9f4]/80"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-1">
          <div className={cn(isSidebarCollapsed ? "px-2" : "px-3")}>
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} isCollapsed={isSidebarCollapsed} />
            ))}
          </div>

          {projectId && (
            <>
              <div className={cn("pt-4 pb-1", isSidebarCollapsed ? "px-2 flex justify-center" : "px-4")}>
                {isSidebarCollapsed ? (
                  <div className="w-6 h-px bg-[#d2c2cb] my-1" title="Current Project" />
                ) : (
                  <div className="text-[10px] font-mono font-semibold text-[#81737b] uppercase tracking-wider">
                    Review Workflow
                  </div>
                )}
              </div>
              <div className={cn(isSidebarCollapsed ? "px-2 space-y-0.5" : "px-3 space-y-0.5")}>
                {projectNavItems(projectId).map((item) => (
                  <NavItem key={item.to} {...item} isCollapsed={isSidebarCollapsed} />
                ))}
              </div>
            </>
          )}
        </nav>

        <div className={cn("border-t border-[#d2c2cb] py-3 text-xs text-[#81737b] transition-all bg-[#fbf9f4]", isSidebarCollapsed ? "px-2 text-center" : "px-4")}>
          {isSidebarCollapsed ? (
            <span title="Stellar Labs Academic Editorial" className="font-mono text-[10px] text-[#3a0f34]">✦</span>
          ) : (
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-serif italic text-[#62535d]">Stellar Labs</span>
              <span className="font-mono text-[10px] text-[#81737b]">v2.5</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main content with top bar */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0 bg-[#fbf9f4]">
        {/* Top Announcement & Header - Master Theme Exact Slim Wine Bar */}
        <header data-app-header className="bg-[#3a0f34] text-[#fbf9f4] border-b border-[#1a0017] px-4 sm:px-6 py-2.5 sticky top-0 z-30 transition-colors shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Mobile menu trigger */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-full hover:bg-white/10 text-[#fbf9f4] transition-colors"
                aria-label="Toggle Menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Desktop Expand Button if Sidebar is collapsed */}
              {isSidebarCollapsed && (
                <button
                  onClick={toggleSidebar}
                  className="hidden md:flex p-1.5 rounded-full text-[#fbf9f4]/80 hover:text-[#fbf9f4] hover:bg-white/10 transition-colors"
                  title="Expand sidebar (Ctrl+B)"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="h-2 w-2 rounded-full bg-[#ffdea6] animate-pulse" />
                <span className="font-serif text-sm font-medium text-[#fbf9f4] truncate">
                  {projectId ? `Project: ${projectId}` : "RadExtract Lab"}
                </span>
                <span className="hidden sm:inline-block text-[#fbf9f4]/75 text-xs font-serif italic">
                  — Systematic Review & Literature Synthesis
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Permanent Backend Indicator */}
              {(() => {
                const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.includes("github.io"));
                const isLive = apiInfo.state === "live" || isLocal;

                return (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border shadow-2xs select-none",
                      isLive
                        ? "border-[#d2c2cb]/30 bg-[#1a0017] text-[#fbf9f4]"
                        : "border-rose-400/40 bg-rose-950/40 text-rose-200"
                    )}
                    title={`Backend Status: ${apiInfo.apiBase || "Local Storage Engine"} (${isLive ? "Online" : "Offline"})`}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isLive ? "bg-[#ffdea6] animate-pulse" : "bg-rose-400"
                      )}
                    />
                    <span className="font-mono text-[10px]">
                      {isLive ? (apiInfo.state === "live" && !apiInfo.apiBase?.includes("Local") ? "HPC Live" : "Online") : "Offline"}
                    </span>
                  </div>
                );
              })()}

              <span className="hidden lg:inline-flex bg-[#ffdea6]/15 border border-[#ffdea6]/30 text-[#ffdea6] text-[10px] font-mono px-2.5 py-0.5 rounded-full">
                ✦ ACADEMIC EDITORIAL
              </span>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-full hover:bg-white/10 text-[#fbf9f4]/80 hover:text-[#fbf9f4] transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
              {projectId && (
                <button
                  onClick={() => setIsClarificationDrawerOpen(true)}
                  className="clarification-inbox-trigger text-[#fbf9f4] hover:bg-white/10"
                  title={`Clarification Inbox (${pendingClarifications.length} pending)`}
                  aria-label={`Clarification inbox, ${pendingClarifications.length} pending`}
                  aria-expanded={isClarificationDrawerOpen}
                  aria-controls="clarification-inbox"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {pendingClarifications.length > 0 && (
                    <span className="clarification-pending-badge bg-[#ffdea6] text-[#3a0f34]">
                      {pendingClarifications.length}
                    </span>
                  )}
                </button>
              )}
              {projectId && <SettingsPanel projectId={projectId} />}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#fbf9f4]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>

        {/* Global Clarification Notification Center & Drawer */}
        {projectId && (
          <ClarificationNotificationCenter
            projectId={projectId}
            isDrawerOpen={isClarificationDrawerOpen}
            onToggleDrawer={setIsClarificationDrawerOpen}
          />
        )}

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
  isCollapsed,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: string | number;
  isCollapsed?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-xl text-xs font-medium transition-all duration-150",
          isCollapsed ? "md:justify-center px-2 py-2.5 my-0.5" : "gap-2.5 px-3 py-2",
          isActive
            ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs font-semibold"
            : "text-[#4f444b] hover:text-[#3a0f34] hover:bg-[#eee7ec]"
        )
      }
    >
      <Icon className={cn("h-4 w-4 shrink-0", isCollapsed && "md:h-4.5 md:w-4.5")} />
      <span className={cn("flex-1 truncate", isCollapsed && "md:hidden")}>{label}</span>
      {badge && (
        <span className={cn(
          "inline-flex items-center justify-center font-mono font-semibold rounded-full",
          isCollapsed ? "md:hidden ml-auto px-1.5 py-0.2 text-[9px] bg-[#ffdea6] text-[#3a0f34]" : "ml-auto px-1.5 py-0.2 text-[9px] bg-[#ffdea6] text-[#3a0f34]"
        )}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}


