# ExtractExperimenting Web App

A high-performance, modern web application for biomedical systematic reviews, automated screening, PICO formulation, and data extraction.

[![Deploy to GitHub Pages](https://github.com/vidhidhaduk05/ExtractExperimenting-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/vidhidhaduk05/ExtractExperimenting-web/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://vidhidhaduk05.github.io/ExtractExperimenting-web/)

---

## 🚀 Live Demo
Visit the live interactive web demo right in your browser:
👉 **[https://vidhidhaduk05.github.io/ExtractExperimenting-web/](https://vidhidhaduk05.github.io/ExtractExperimenting-web/)**

### Key Features:
- **Interactive Review Dashboard**: Real-time project overview, study tracking, and audit metrics.
- **PICO Formulation & Hypothesis Generation**: Structured clinical criteria builder with keyword expansion.
- **PRISMA 2020 Flow Diagram**: Dynamic SVG-rendered flow chart showing identification, screening, eligibility, and inclusion counts.
- **Standalone Offline / Demo Mode**: Pre-loaded with Post-Acute Myocardial Infarction Beta-Blocker therapy trials.
- **Configurable Backend / Edge API**: Seamlessly connects to any FastAPI backend or Cloudflare Worker edge proxy.

---

## 🏗️ Architecture

```
ExtractExperimenting-web/
├── src/
│   ├── components/      # Reusable UI widgets & layout navigation
│   ├── pages/           # Review, Screening, PRISMA, Grade & Analysis pages
│   ├── lib/
│   │   ├── api.ts       # Smart API client with offline demo fallback
│   │   └── demoData.ts  # Pre-loaded benchmark medical datasets
│   └── main.tsx         # HashRouter application entry point
├── cloudflare/
│   └── worker.js        # Serverless Cloudflare Worker edge API proxy
└── .github/workflows/
    └── deploy.yml       # Automated GitHub Pages CI/CD pipeline
```

---

## 🛠️ Local Development

### Prerequisites
- Node.js 18+ (Node 22 recommended)
- npm or bun

### Setup
```bash
# Clone the repository
git clone https://github.com/vidhidhaduk05/ExtractExperimenting-web.git
cd ExtractExperimenting-web

# Install dependencies
npm install --legacy-peer-deps

# Start Vite development server
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 🌐 Connecting to a Custom Backend / Cloudflare Worker

By default, the web app loads the offline demo dataset if no backend is reachable. To connect to your own backend server or Cloudflare Worker:

1. **Option A: Via LocalStorage in the browser console:**
   ```javascript
   localStorage.setItem("custom_api_base", "https://your-worker.workers.dev/api");
   location.reload();
   ```

2. **Option B: Via Environment Variable before building:**
   ```bash
   VITE_API_BASE_URL="https://api.yourdomain.com/api" npm run build
   ```

---

## 🤖 Autonomous Agent Integration (Google Jules)
This repository is configured for autonomous engineering tasks with **Google Jules**:
- Agent rules: [`AGENTS.md`](./AGENTS.md), [`GEMINI.md`](./GEMINI.md), and [`.agents/rules/jules.md`](./.agents/rules/jules.md).
- Automated PR merge & live preview synchronization is monitored continuously.
