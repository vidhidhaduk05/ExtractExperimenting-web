// PDF.js worker configuration — required by react-pdf-highlighter-plus
import * as pdfjsLib from "pdfjs-dist";

// Use a robust CDN URL to guarantee it works cleanly across all browser targets and static hosting (GitHub Pages)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

// If a legacy hash URL was passed, seamlessly normalize to HTML5 path
if (typeof window !== "undefined" && window.location.hash.startsWith("#/")) {
  const targetPath = window.location.hash.slice(1);
  window.history.replaceState(null, "", targetPath);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
