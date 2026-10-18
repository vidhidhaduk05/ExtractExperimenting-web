import React, { useState, useEffect } from "react";
import { AlertCircle, Server, CheckCircle2, X, RefreshCw } from "lucide-react";
import {
  subscribeApiConnection,
  getApiConnectionInfo,
  ApiConnectionInfo,
  isDemoModeEnabled,
  getApiBase,
  testBackendConnection
} from "../../lib/api";

interface ApiConnectionBannerProps {
  onOpenSettings: () => void;
}

export const ApiConnectionBanner: React.FC<ApiConnectionBannerProps> = ({ onOpenSettings }) => {
  const [info, setInfo] = useState<ApiConnectionInfo>(getApiConnectionInfo());
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    return subscribeApiConnection((newInfo) => {
      setInfo(newInfo);
    });
  }, []);

  if (dismissed) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await testBackendConnection();
      if (res.ok) {
        setDismissed(true);
      }
    } finally {
      setRetrying(false);
    }
  };

  // State 1: Active Error / Backend unreachable
  if (info.state === "error") {
    return (
      <aside
        aria-label="API connection failure"
        className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-rose-900 text-xs transition-colors"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>
              <strong className="font-semibold">Backend Unreachable:</strong> Failed to connect to{" "}
              <code className="bg-rose-100 px-1.5 py-0.5 rounded font-mono text-[11px] text-rose-800">
                {info.apiBase || getApiBase()}
              </code>
              . Currently displaying offline demo preview.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="px-2.5 py-1 bg-white border border-rose-300 hover:bg-rose-100 rounded text-rose-800 font-medium transition-colors flex items-center gap-1 shadow-xs"
            >
              <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Checking..." : "Retry"}
            </button>
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium transition-colors shadow-xs"
            >
              Configure API
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-rose-500 hover:text-rose-700 rounded transition-colors"
              title="Dismiss warning"
              aria-label="Dismiss warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // State 2: Explicit Demo Mode
  if (info.state === "explicit_demo" || isDemoModeEnabled()) {
    return (
      <aside
        aria-label="Offline demo mode active"
        className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-900 text-xs transition-colors"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>
              <strong className="font-semibold">Offline Demo Mode:</strong> Changes are temporary and stored in memory.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium transition-colors shadow-xs text-[11px]"
            >
              Connect VPS Backend
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-amber-500 hover:text-amber-700 rounded transition-colors"
              title="Dismiss banner"
              aria-label="Dismiss banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // State 3: Unconfigured on GitHub Pages (fallback)
  if (info.state === "demo_fallback") {
    return (
      <aside
        aria-label="GitHub Pages demo mode"
        className="bg-sky-50 border-b border-sky-200 px-4 py-2 text-sky-900 text-xs transition-colors"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-sky-600 shrink-0" />
            <span>
              <strong className="font-semibold">GitHub Pages Demo Preview:</strong> To save data persistently and run live AI screening, point to your FastAPI server.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-0.5 bg-sky-700 hover:bg-sky-800 text-white rounded font-medium transition-colors shadow-xs text-[11px]"
            >
              Connect Backend
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-sky-500 hover:text-sky-700 rounded transition-colors"
              title="Dismiss banner"
              aria-label="Dismiss banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return null;
};
