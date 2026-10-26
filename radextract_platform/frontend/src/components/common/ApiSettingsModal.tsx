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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a0017]/40 backdrop-blur-xs font-sans">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-modal-title"
        className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-[#4f444b] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#d2c2cb] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#3a0f34] text-[#fbf9f4]">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 id="api-modal-title" className="font-serif text-base font-bold text-[#3a0f34]">
                Backend API &amp; Server Connection
              </h2>
              <p className="text-xs text-[#62535d]">
                Configure your FastAPI VPS endpoint or switch to demo mode
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#81737b] hover:text-[#3a0f34] hover:bg-[#eee7ec] rounded-full transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
          {/* Mode Switcher */}
          <div className="p-3 rounded-lg border border-[#d2c2cb] bg-white space-y-2">
            <span className="font-semibold text-xs text-[#3a0f34] block">Platform Operation Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsDemo(false)}
                className={`py-2 px-3 rounded-lg border text-left font-semibold transition-all cursor-pointer ${
                  !isDemo
                    ? "bg-[#3a0f34] text-[#fbf9f4] border-[#3a0f34] shadow-xs"
                    : "bg-white text-[#62535d] border-[#d2c2cb] hover:bg-[#eee7ec]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${!isDemo ? "bg-[#ffdea6]" : "bg-[#d2c2cb]"}`} />
                  <span>Live Server Mode</span>
                </div>
                <p className="text-[10px] mt-0.5 opacity-80 font-normal">
                  Saves to VPS SQLite / Storage
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsDemo(true)}
                className={`py-2 px-3 rounded-lg border text-left font-semibold transition-all cursor-pointer ${
                  isDemo
                    ? "bg-[#3a0f34] text-[#fbf9f4] border-[#3a0f34] shadow-xs"
                    : "bg-white text-[#62535d] border-[#d2c2cb] hover:bg-[#eee7ec]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${isDemo ? "bg-[#ffdea6]" : "bg-[#d2c2cb]"}`} />
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
            <label htmlFor="api-url-input" className="font-semibold text-xs text-[#3a0f34] flex items-center justify-between">
              <span>FastAPI Backend Base URL</span>
              <span className="text-[10px] text-[#81737b]">Include <code>/api</code></span>
            </label>
            <div className="flex gap-2">
              <input
                id="api-url-input"
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/api"
                className="flex-1 px-3 py-2 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#814d75] text-[#4f444b]"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-2 bg-white hover:bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] font-semibold rounded-lg transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Activity className={`h-3.5 w-3.5 ${testing ? "animate-spin text-[#814d75]" : "text-[#814d75]"}`} />
                {testing ? "Testing..." : "Test"}
              </button>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2 text-[11px] text-[#62535d] flex-wrap">
              <span>Quick Presets:</span>
              <button
                type="button"
                onClick={async () => {
                  setIsDemo(false);
                  try {
                    const res = await fetch("./active_backend.json", { cache: "no-store" }).catch(() => null);
                    if (res && res.ok) {
                      const data = await res.json();
                      if (data?.api_url) {
                        setApiUrl(data.api_url);
                        return;
                      }
                    }
                  } catch (e) {}
                  setApiUrl("https://thesaurus-algorithms-exterior-estimates.trycloudflare.com/api");
                }}
                className="px-2 py-0.5 rounded bg-[#ffdea6] hover:bg-[#ffd580] text-[#3a0f34] font-semibold border border-[#d2c2cb] flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="Connect directly to the HPC Tesla V100S GPU running the high-throughput Co-Scientist research inference cluster"
              >
                <span>&sim; RadExtract Live GPU (HPC)</span>
              </button>
              <button
                type="button"
                onClick={() => setApiUrl("http://localhost:8000/api")}
                className="hover:underline text-[#814d75] cursor-pointer"
              >
                Localhost:8000
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => setApiUrl("/api")}
                className="hover:underline text-[#814d75] cursor-pointer"
              >
                Default /api
              </button>
            </div>
          </div>

          {/* Health Test Result */}
          {testResult && testResult.tested && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                testResult.ok
                  ? "bg-[#eee7ec] border-[#d2c2cb] text-[#3a0f34]"
                  : "bg-[#ab3329]/10 border-[#ab3329]/30 text-[#ab3329]"
              }`}
            >
              {testResult.ok ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#3a0f34] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#3a0f34]">Backend Connection Verified!</p>
                    <p className="text-[11px] text-[#62535d]">
                      Status: {testResult.statusText} &bull; Version: {testResult.version} &bull; Latency: {testResult.latencyMs}ms
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-[#ab3329] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#ab3329]">Connection Failed</p>
                    <p className="text-[11px] text-[#ab3329]">
                      {testResult.error || "Unable to reach endpoint."}
                    </p>
                    <p className="text-[10px] text-[#62535d] mt-1">
                      Check: 1) Is Docker running? 2) Is CORS allowed for your domain? 3) Does Caddy have HTTPS active?
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Authentication Section */}
          <div className="p-3 rounded-lg border border-[#d2c2cb] bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5 text-[#3a0f34]">
                <Lock className="h-3.5 w-3.5 text-[#814d75]" />
                User Authentication (JWT)
              </span>
              <span className="text-[10px] text-[#81737b]">
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
                  className="px-2.5 py-1.5 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg text-xs text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="px-2.5 py-1.5 bg-[#fbf9f4] border border-[#d2c2cb] rounded-lg text-xs text-[#4f444b] focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={loggingIn || !password}
                  className="px-3 py-1.5 bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] disabled:opacity-50 font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <LogIn className="h-3 w-3" />
                  {loggingIn ? "Signing In..." : "Sign In to Server"}
                </button>
                {authStatus && (
                  <span className="text-[11px] text-[#62535d] italic truncate max-w-[200px]">
                    {authStatus}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#d2c2cb] flex items-center justify-between bg-white">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-[#814d75] hover:text-[#3a0f34] hover:underline cursor-pointer"
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[#d2c2cb] text-[#3a0f34] bg-white hover:bg-[#eee7ec] transition-colors font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-colors font-semibold text-xs shadow-xs cursor-pointer"
            >
              Save &amp; Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
