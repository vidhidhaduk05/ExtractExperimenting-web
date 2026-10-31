# HPC FastAPI Backend — Live GitHub Pages Endpoint Specification

> **Target Frontend Deployment:** `https://vidhidhaduk05.github.io/ExtractExperimenting-web/` (or custom domain)  
> **Backend Architecture:** FastAPI on HPC with Laya/SLURM workers and SQLite/PostgreSQL persistence.  
> **Base Prefix:** Direct routes (`/projects`, `/studies`) and prefixed routes (`/api/...`) routed via Nginx/Caddy reverse proxy on HPC.

---

## 1. CORS, Proxy & Health Requirements

To allow the GitHub Pages static frontend to contact the HPC backend securely:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `OPTIONS` | `/*` | **CORS Preflight**: Must return headers `Access-Control-Allow-Origin: https://vidhidhaduk05.github.io` (or `*`), `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`. |
| `GET` | `/health` | Server heartbeat and DB connection status (`{"status": "ok"}`). |
| `POST` | `/auth/login` | JWT access token issuance for reviewer accounts. |
| `POST` | `/auth/logout` | Token revocation. |

---

## 2. Projects & Review Configuration

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects` | List all review projects. |
| `POST` | `/projects` | Create new review project (with `review_type`: `systematic`, `scoping`, `both`). |
| `GET` | `/projects/{project_id}` | Fetch project details, review type, PICO criteria, and stats. |
| `PUT` | `/projects/{project_id}` | Update project metadata or `review_type`. |
| `DELETE`| `/projects/{project_id}` | Delete project. |
| `GET` | `/projects/{project_id}/settings` | Fetch project settings (auto-RoB thresholds, JEV mode). |
| `PUT` | `/projects/{project_id}/settings` | Update settings. |
| `GET` | `/projects/{project_id}/pico` | Retrieve current PICO criteria. |
| `PUT` | `/projects/{project_id}/pico` | Save/update structured PICO criteria. |
| `POST` | `/projects/{project_id}/pico/extract` | Auto-extract PICO criteria from clinical question via LLM/Laya. |
| `GET` | `/projects/{project_id}/hypothesis` | Get primary and secondary hypotheses. |
| `POST` | `/projects/{project_id}/generate-hypothesis` | AI-assisted clinical hypothesis generation. |
| `GET` | `/projects/{project_id}/search-strings` | Retrieve multi-database search strings (PubMed, Embase, Scopus). |
| `POST` | `/projects/{project_id}/search-strings/generate` | Generate publication-grade boolean search strings. |
| `POST` | `/projects/{project_id}/search-strings/pubmed/fetch` | Live PubMed query execution & count preview. |

---

## 3. Studies, Deduplication & Reference Ingestion

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/studies` | List studies with pagination, filters (`screening_status`, `screening_stage`, `search`). |
| `POST` | `/projects/{project_id}/studies` | Add a single study manually. |
| `POST` | `/projects/{project_id}/references/upload` | Upload `.ris`, `.bib`, `.xml`, `.csv`, `.tsv` reference library. |
| `POST` | `/projects/{project_id}/references/preview` | Preview incoming citation file before importing. |
| `GET` | `/projects/{project_id}/studies/duplicates` | Retrieve candidate duplicate pairs/clusters. |
| `POST` | `/projects/{project_id}/studies/deduplicate` | Trigger tiered deduplication (exact DOI/PMID + fuzzy Title/Author). |
| `POST` | `/projects/{project_id}/studies/deduplicate/resolve` | Merge duplicate pair or mark as distinct. |
| `POST` | `/projects/{project_id}/studies/deduplicate/merge-all-metadata` | Bulk master merge across identified duplicate clusters. |
| `POST` | `/projects/{project_id}/batches/{batch_id}/undo` | Undo a specific deduplication merge or screening batch action. |
| `GET` | `/projects/{project_id}/bookmarks` | Get all saved/bookmarked studies. |
| `POST` | `/studies/{study_id}/bookmark` | Toggle study bookmark for reviewer. |
| `GET` | `/projects/{project_id}/tags` | Get list of review tags. |
| `POST` | `/studies/{study_id}/tags` | Add/remove collaborative tags on a study. |

---

## 4. Title & Abstract / Full-Text Screening

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/screening/summary` | Live screening counts (`total`, `screened`, `included`, `excluded`, `uncertain`). |
| `POST` | `/projects/{project_id}/screening-decisions` | Record clinician decision (`include`, `uncertain`, `exclude` + reason). |
| `GET` | `/projects/{project_id}/screening-decisions` | List past screening judgments. |
| `POST` | `/projects/{project_id}/ai-screening/start` | Launch asynchronous Co-Scientist background screening on HPC. |
| `POST` | `/projects/{project_id}/ai-screening/start-analysis` | Start continuous live streaming screening loop. |
| `GET` | `/projects/{project_id}/ai-screening/progress` | Poll background screening job progress (total, processed, throughput). |
| `POST` | `/projects/{project_id}/ai-screening/pause` | Pause active screening queue. |
| `POST` | `/projects/{project_id}/ai-screening/resume` | Resume paused screening queue. |
| `POST` | `/projects/{project_id}/ai-screening/cancel` | Cancel active background screening job. |
| `POST` | `/projects/{project_id}/ai-screening/continue` | Advance studies from Title/Abstract stage to Full-Text stage. |
| `GET` | `/projects/{project_id}/screening-keywords` | Retrieve Rayyan-style inclusion/exclusion keyword highlights. |
| `POST` | `/projects/{project_id}/screening-keywords` | Add/edit keyword rules. |
| `POST` | `/projects/{project_id}/screening-keywords/auto-generate` | Generate high-yield keywords from PICO criteria. |
| `GET` | `/studies/{study_id}/abstract-highlights` | Retrieve pre-calculated PICO token spans for abstract highlighting. |
| `GET` | `/studies/{study_id}/pico-highlight` | Live abstract text highlighting. |

---

## 5. Clarification Inquiries (Co-Scientist Ambiguity Checklist)

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/clarifications` | List ambiguous PICO criteria flagged by the screener. |
| `GET` | `/projects/{project_id}/clarifications/stats` | Pending vs. resolved clarification counter. |
| `POST` | `/clarifications/{question_id}/answer` | Submit clinician answer to resolve clarification and trigger auto-rescreen. |
| `POST` | `/projects/{project_id}/clarifications/batch-answer` | Bulk resolve multiple clarification items. |
| `GET` | `/projects/{project_id}/screening-conflicts` | List dual-reviewer disagreements requiring adjudication. |

---

## 6. PDF Full-Text Management & Ingestion

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/fulltext/availability` | PDF queue status per study (`uploaded`, `processed`, `text_only`, `awaiting_pdf`, `no_text`). |
| `POST` | `/projects/{project_id}/studies/{study_id}/pdf` | Upload study PDF document to HPC storage. |
| `POST` | `/projects/{project_id}/screening/batch-upload-pdf` | Bulk multi-PDF drag-and-drop upload. |
| `GET` | `/studies/{study_id}/pdf-data` | Serve raw PDF bytes or data URL for in-browser inspection. |
| `GET` | `/studies/{study_id}/pdf-summary` | Docling structured text, sections, and metadata summary. |
| `POST` | `/studies/{study_id}/process-pdf` | Trigger Docling / OCR text extraction pipeline. |
| `GET` | `/studies/{study_id}/pdf-highlights` | Bounding box coordinates for cited evidence text. |
| `POST` | `/studies/{study_id}/find-quote-location` | Search document for exact verbatim quote bounding box coordinates. |

---

## 7. Data Extraction Sheet (Spreadsheet Workspace)

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/variables` | List configured extraction variables in persistent sequence. |
| `POST` | `/projects/{project_id}/variables` | Create new extraction variable. |
| `PUT` | `/variables/{variable_id}` | Edit variable definitions, types, or allowed values. |
| `DELETE`| `/variables/{variable_id}` | Delete variable. |
| `POST` | `/projects/{project_id}/variables/reorder` | Persist reordered column index sequence. |
| `POST` | `/projects/{project_id}/variables/batch` | Batch create variables. |
| `POST` | `/projects/{project_id}/variables/import-excel` | Import custom variables from `.xlsx` codebook sheet. |
| `GET` | `/projects/{project_id}/extractions/grid` | **The Core Extraction Matrix**: studies $\times$ variables, values, confidences, sources. |
| `POST` | `/projects/{project_id}/extractions/batch` | Update multiple extraction cells in a single request (inline edits, paste, prefill). |
| `POST` | `/projects/{project_id}/extractions/ai-batch` | Run Co-Scientist AI batch extraction across included studies. |
| `PUT` | `/extractions/{extraction_id}` | Update single cell value with required correction `reason`. |
| `PUT` | `/extractions/{extraction_id}/verify` | Mark extracted cell verified and accurate. |
| `PUT` | `/extractions/{extraction_id}/adjudicate` | Adjudicate conflicting values. |
| `GET` | `/studies/{study_id}/extractions/audit` | Immutable audit log of cell mutations and verifications. |
| `GET` | `/projects/{project_id}/extraction/missing-data-summary` | % missing per variable (pinned sidebar summary). |
| `GET` | `/projects/{project_id}/extraction/srma-workbook` | Download SRMA extraction workbook `.xlsx`. |
| `GET` | `/projects/{project_id}/extraction/xlsx-coded` | Download machine-readable coded `.xlsx`. |

---

## 8. Evidence Synthesis, Evidence Map & Meta-Analysis

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/analysis/evidence-map` | **Scoping Evidence Map Packet**: counts by year, design mix, leading sources, variable coverage, design $\times$ region cross-tab. |
| `GET` | `/projects/{project_id}/analysis/evidence-map/export` | Export scoping summary tables as multi-tab `.xlsx` or `.csv`. |
| `GET` | `/projects/{project_id}/analysis/crosstab` | Dynamic contingency table (`?row_var={id}&col_var={id}`). |
| `GET` | `/projects/{project_id}/analysis/trends` | Publication / variable trend histogram (`?bucket=year|design|region`). |
| `GET` | `/projects/{project_id}/analysis/descriptive` | Wilson score proportions, medians, and IQRs. |
| `GET` | `/projects/{project_id}/analysis/outcomes` | List meta-analysis outcome cohorts. |
| `GET` | `/projects/{project_id}/analysis/forest-data` | DerSimonian-Laird random-effects pooling, weights, effect sizes, and CIs (`?outcome={name}`). |
| `GET` | `/projects/{project_id}/analysis/heterogeneity` | $I^2$, Cochrane's $Q$, $\tau^2$, and $H^2$ metrics. |
| `GET` | `/projects/{project_id}/analysis/funnel-data` | Funnel plot coordinates and Egger's regression test for publication bias. |
| `GET` | `/projects/{project_id}/analysis/sensitivity` | Leave-one-out sensitivity re-pooling. |
| `POST` | `/api/charts/forest` | Generate 300 DPI R metafor publication forest plot SVG/PNG. |
| `POST` | `/api/charts/funnel` | Generate 300 DPI R metafor funnel plot SVG/PNG. |

---

## 9. Risk of Bias (RoB 2 & ROBINS-I)

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/rob/projects/{project_id}/summary` | Traffic-light matrix and domain risk summaries. |
| `GET` | `/rob/tools` | Available assessment tools (`rob2_rct`, `robins_i`). |
| `GET` | `/rob/studies/{study_id}/rob` | Retrieve study RoB signaling questions, answers, and rationale. |
| `POST` | `/rob/studies/{study_id}/rob/auto` | Run automated AI appraisal for study. |
| `POST` | `/rob/answers/{answer_id}` | Record clinician answer to signaling question. |
| `PUT` | `/assessments/{assessment_id}/verify` | Verify RoB domain judgment. |
| `PUT` | `/assessments/{assessment_id}/adjudicate` | Adjudicate RoB domain judgment. |
| `POST` | `/projects/{project_id}/rob/run` | Launch bulk RoB assessment job on included studies. |
| `GET` | `/projects/{project_id}/rob/run/progress` | Poll bulk RoB assessment progress. |

---

## 10. GRADE Certainty of Evidence

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/grade` | List GRADE profiles across synthesized outcomes. |
| `GET` | `/grade/{grade_id}` | Fetch 5-domain evaluation (Risk of Bias, Inconsistency, Indirectness, Imprecision, Publication Bias). |
| `POST` | `/grade/{grade_id}/auto-populate` | Auto-fill statistical metrics ($I^2$, sample sizes, pooled effects) from synthesis into GRADE table. |
| `PUT` | `/grade/{grade_id}/compute` | Recompute overall certainty rating (`High`, `Moderate`, `Low`, `Very Low`). |
| `POST` | `/grade/{grade_id}/finalize` | Finalize and lock Summary of Findings (SoF) profile. |
| `GET` | `/grade/{grade_id}/sof-table` | Export Summary of Findings table. |

---

## 11. PRISMA 2020 Flow & Scientific Exports

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/projects/{project_id}/prisma` | PRISMA 2020 node counts (`identification`, `screening`, `retrieval`, `eligibility`, `included`). |
| `POST` | `/charts/prisma-flow` | Generate publication-grade PRISMA 2020 Flow Diagram SVG/PNG stamped with `review_type`. |
| `GET` | `/projects/{project_id}/export` | Export hub: PRISMA diagram, screening log CSV, extraction tables, RoB summary. |
| `GET` | `/scientific-export/draft-manuscript` | Export automated Methods & Results manuscript narrative draft. |
| `GET` | `/scientific-export/bibliography` | Export deduplicated, Vancouver-formatted bibliography `.bib` / `.ris`. |
| `GET` | `/scientific-export/prisma-mermaid` | Export raw Mermaid diagram code for direct manuscript insertion. |

---

## 12. Knowledge Graph & Rigor Scan Diagnostics

| Method | Endpoint | Purpose / Frontend Caller |
| :--- | :--- | :--- |
| `GET` | `/api/graphify/code/graph` | Codebase architecture and symbol graph for interactive viewer. |
| `GET` | `/api/graphify/code/stats` | Node, edge, and community cluster metrics. |
| `GET` | `/projects/{project_id}/graphify/review/graph` | Evidence citation & study relationship network. |
| `POST` | `/rigor-scan/scan-pdf` | 74-check methodological rigor audit on uploaded full-text study. |
| `GET` | `/rigor-scan/status` | Rigor audit results and benchmark control score. |

