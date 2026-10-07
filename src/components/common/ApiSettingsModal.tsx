import React, { useState, useEffect } from "react";
import {
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  X,
  ExternalLink,
  Lock,
  LogIn,
  KeyRound,
  RefreshCw,
  Sliders
} from "lucide-react";
import {
  getApiBase,
  setCustomApiBase,
  isDemoModeEnabled,
  setDemoModeEnabled,
  testBackendConnection,
  api
} from "../../lib/api";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({ isOpen, onClose }) => {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    ok: boolean;
    latencyMs?: number;
    version?: string;
    statusText?: string;
    error?: string;
  } | null>(null);

  // Auth fields
  const [username, setUsername] = useState<string>("admin");
  const [password, setPassword] = useState<string>("");
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem("custom_api_base") || "";
      setApiUrl(stored || getApiBase());
      setIsDemo(isDemoModeEnabled());
      setTestResult(null);
      setAuthStatus("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testBackendConnection(apiUrl);
      setTestResult({
        tested: true,
        ok: res.ok,
        latencyMs: res.latencyMs,
        version: res.version,
        statusText: res.statusText,
        error: res.error,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setCustomApiBase(apiUrl);
    setDemoModeEnabled(isDemo);
    onClose();
  };

  const handleReset = () => {
    setCustomApiBase(null);
    setDemoModeEnabled(false);
    setApiUrl(getApiBase());
    setIsDemo(false);
    setTestResult(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoggingIn(true);
    setAuthStatus("");
    try {
      const token = await api.login(username, password);
      setAuthStatus(`Logged in as ${token.username} (${token.role})`);
      setPassword("");
    } catch (err: any) {
      setAuthStatus(`Login failed: ${err?.message || "Invalid credentials"}`);
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-modal-title"
        className="bg-[#FAF9F3] border border-black/10 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-[#141413] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/[0.08] flex items-center justify-between bg-white/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-black/5 text-[#141413]">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 id="api-modal-title" className="font-serif text-base font-semibold">
                Backend API & Server Connection
              </h2>
              <p className="text-xs text-[#8A817A]">
                Configure your FastAPI VPS endpoint or switch to demo mode
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8A817A] hover:text-[#141413] hover:bg-black/5 rounded-full transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
          {/* Mode Switcher */}
          <div className="p-3 rounded-xl border border-black/10 bg-white/80 space-y-2">
            <span className="font-medium text-xs text-[#141413] block">Platform Operation Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsDemo(false)}
                className={`py-2 px-3 rounded-lg border text-left font-medium transition-all ${
                  !isDemo
                    ? "bg-[#141413] text-[#FAF9F3] border-[#141413] shadow-xs"
                    : "bg-white text-[#6B665E] border-black/10 hover:border-black/20"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${!isDemo ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <span>Live Server Mode</span>
                </div>
                <p className="text-[10px] mt-0.5 opacity-80 font-normal">
                  Saves to VPS SQLite / Storage
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsDemo(true)}
                className={`py-2 px-3 rounded-lg border text-left font-medium transition-all ${
                  isDemo
                    ? "bg-[#141413] text-[#FAF9F3] border-[#141413] shadow-xs"
                    : "bg-white text-[#6B665E] border-black/10 hover:border-black/20"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${isDemo ? "bg-amber-400" : "bg-gray-300"}`} />
                  <span>Offline Demo Mode</span>
                </div>
                <p className="text-[10px] mt-0.5 opacity-80 font-normal">
                  In-memory preview, no server
                </p>
              </button>
            </div>
          </div>

          {/* Endpoint Input */}
          <div className="space-y-2">
            <label htmlFor="api-url-input" className="font-medium text-xs text-[#141413] flex items-center justify-between">
              <span>FastAPI Backend Base URL</span>
              <span className="text-[10px] text-[#8A817A]">Include <code>/api</code></span>
            </label>
            <div className="flex gap-2">
              <input
                id="api-url-input"
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/api"
                className="flex-1 px-3 py-2 bg-white border border-black/15 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-black/20 text-[#141413]"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-2 bg-black/5 hover:bg-black/10 text-[#141413] font-medium rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
              >
                <Activity className={`h-3.5 w-3.5 ${testing ? "animate-spin text-purple-600" : ""}`} />
                {testing ? "Testing..." : "Test"}
              </button>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2 text-[11px] text-[#8A817A]">
              <span>Quick Presets:</span>
              <button
                type="button"
                onClick={() => setApiUrl("http://localhost:8000/api")}
                className="hover:underline text-sky-700"
              >
                Localhost:8000
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setApiUrl("/api")}
                className="hover:underline text-sky-700"
              >
                Default /api
              </button>
            </div>
          </div>

          {/* Health Test Result */}
          {testResult && testResult.tested && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                testResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              {testResult.ok ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Backend Connection Verified!</p>
                    <p className="text-[11px] text-emerald-700">
                      Status: {testResult.statusText} • Version: {testResult.version} • Latency: {testResult.latencyMs}ms
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Connection Failed</p>
                    <p className="text-[11px] text-rose-700">
                      {testResult.error || "Unable to reach endpoint."}
                    </p>
                    <p className="text-[10px] text-rose-600 mt-1">
                      Check: 1) Is Docker running? 2) Is CORS allowed for your domain? 3) Does Caddy have HTTPS active?
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Authentication Section */}
          <div className="p-3 rounded-xl border border-black/10 bg-white/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs flex items-center gap-1.5 text-[#141413]">
                <Lock className="h-3.5 w-3.5 text-[#8A817A]" />
                User Authentication (JWT)
              </span>
              <span className="text-[10px] text-[#8A817A]">
                {localStorage.getItem("token") ? "Logged In" : "Not logged in"}
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username (admin)"
                  className="px-2.5 py-1.5 bg-white border border-black/15 rounded-lg text-xs"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="px-2.5 py-1.5 bg-white border border-black/15 rounded-lg text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={loggingIn || !password}
                  className="px-3 py-1 bg-black/5 hover:bg-black/10 disabled:opacity-50 text-[#141413] font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  <LogIn className="h-3 w-3" />
                  {loggingIn ? "Signing In..." : "Sign In to Server"}
                </button>
                {authStatus && (
                  <span className="text-[11px] text-[#6B665E] italic truncate max-w-[200px]">
                    {authStatus}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-black/[0.08] flex items-center justify-between bg-white/60">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-[#8A817A] hover:text-[#141413] hover:underline"
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-black/15 text-[#141413] hover:bg-black/5 transition-colors font-medium text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-[#141413] text-[#FAF9F3] hover:bg-[#141413]/90 transition-colors font-medium text-xs shadow-xs"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
