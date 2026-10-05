# ExtractExperimenting Web App & Live Demo

A modern, high-performance web interface for automated biomedical systematic reviews, screening, PICO formulation, and data extraction.

## 🚀 Live Demo on GitHub Pages
Visit the live interactive web demo:
👉 **[https://vidhidhaduk05.github.io/ExtractExperimenting-web/](https://vidhidhaduk05.github.io/ExtractExperimenting-web/)**

### Features:
- **Interactive Review Dashboard**: Full PRISMA 2020 flow diagrams, study status triage, and screening summaries.
- **Offline / Standalone Demo Mode**: Pre-loaded with Post-Acute Myocardial Infarction Beta-Blocker therapy trials.
- **Configurable Backend Connection**: Connect to any FastAPI backend or Cloudflare Worker edge API by setting `localStorage.setItem('custom_api_base', 'https://your-api-url')`.

## 🛠️ Local Development
```bash
npm install --legacy-peer-deps
npm run dev
```

## 📦 Build for Production
```bash
npm run build
```
