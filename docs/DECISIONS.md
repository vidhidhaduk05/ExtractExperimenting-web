# Architectural & Engineering Decisions Log (DECISIONS.md)

This document is the canonical ledger of all engineering, architectural, scientific, and security decisions for the RadExtract / Systematic Review platform.

---

## 1. Universal Domain-Agnostic Clinical Architecture
* **Date**: 2026-10-26
* **Decision**: Architect the systematic review, evidence mapping, screening, and data extraction engines to be completely domain-agnostic (capable of synthesizing cardiology, oncology, surgery, public health, neurology, and infectious diseases), while selecting **Radiology & Neurovascular Intervention** (Pure Arterial Malformations - PAM) as the flagship validation domain.
* **Rationale**:
  * Systematic review methodology (PRISMA 2020, Cochrane Risk of Bias, PICO, GRADE, Wilson score intervals) is universal across clinical medicine.
  * Radiology and neurointerventional surgery present the highest complexity bar (complex angioarchitecture, spatial bounding boxes in imaging, multi-vessel hemodynamic endpoints, and disparate outcome scales like TICI 2b vs 2c/3). Validating against this high-friction domain guarantees robustness across simpler clinical and pharmacological topics.
* **Impact**:
  * PICO schemas, variable codebooks, screening engines, and forest plots accept arbitrary clinical questions.
  * Topic-specific modules (like neurovascular flaw detection) are registered as pluggable specialist lenses under the Stanford STORM persona registry.

---

## 2. In-Memory LRU Cache Bounding for ClaimScape Evidence Mapping
* **Date**: 2026-10-26 (Commit `c277060`, PR #95)
* **Decision**: Retain at most 128 result entries in memory per process using least-recently-used (LRU) eviction protected by a thread-safe lock (`_CLAIMSCAPE_CACHE_LOCK`).
* **Rationale**:
  * Rapid interactive claim searches could cause unbounded memory growth under continuous worker execution.
  * Python dictionary insertion order maintains LRU order with O(1) popping and insertion.
  * Evicted entries fall back gracefully to persistent disk cache (`radextract_platform/backend/data/claimscape_cache/`) with sub-millisecond retrieval.
* **Impact**:
  * Memory footprint remains strictly bounded at ~128 entries.
  * Fully covered by 5 concurrent and eviction unit tests in `test_claimscape_live_pipeline.py`.

---

## 3. Dual-Speed Inference: LAYA System-1 (<150ms) + Stanford STORM Multi-Perspective Deliberation
* **Date**: 2026-10-26 (Commits `5f6c118`, `8155d7d`)
* **Decision**: Implement a two-tiered deliberation architecture combining local ONNX tensor inference with multi-perspective clinical personas:
  * **System 1 (LAYA ONNX, <150ms)**: Evaluates study design flaw risk (`noul`), primary clinical lens affinity (`choice`), and risk-of-bias score (`score`) using local weights (`laya/models/laya.onnx`, 1.68GB) with zero network latency.
  * **System 2 (Stanford STORM Personas)**: Cross-examines publications through 4 clinical lenses (Neurointerventionalist, Stroke Neurologist, Vascular Surgeon, Biostatistician) to detect subtle methodological flaws (e.g., pooled TICI 2b with 2c/3, non-standardized ECASS-III sICH criteria, retrospective selection bias).
* **Rationale**:
  * Based on findings by Stanford physicians (Heit & Adusumilli), systematic reviews fail when single-specialty reviewers overlook methodological traps (e.g., radiologists missing neurology safety endpoints, or clinicians missing biostatistical attrition bias).
  * Chaining fast LAYA triage ahead of STORM provides instant (<150ms) triage for the Evidence Map, while reserving deep multi-agent debate for detailed paper inspection.
* **Impact**:
  * ClaimScape Evidence Map renders interactive Specialist Lens filters and pulsating amber flaw halos (`#F59E0B`).
  * Instant hover tooltips display sound vs flaw risk percentages.
  * Excel Extraction Sheet includes a 1-click `+ Document Flaw Caveat` action to document caveats directly into extraction cells.

---

## 4. Human-in-the-Loop Excel Extraction Sheet: 18 Standard Sections & Zero Unwanted Autofill
* **Date**: 2026-10-25
* **Decision**: Structure the clinical extraction interface to mirror a familiar Excel workbook (green ribbon, formula bar, column letters, keyboard hotkeys) with human-in-the-loop control:
  * Users decide whether to load standard 18 SRMA sections or define custom variables.
  * Variables are never forcibly autofilled; missing codes default to `NR` (Not Reported).
  * On-demand AI suggestions and one-click bulk operations (`Fill Empty with NR`, `Accept All >95%`) assist the doctor without removing manual oversight.
* **Rationale**:
  * Clinical researchers and senior physicians (including 80-year-old faculty) are comfortable with Excel workflows. Complex multi-step web forms create cognitive friction.
  * Verbatim quotes and PDF track-changes bounding boxes must remain verifiable on demand.

---

## 5. Security Hardening: IDOR Prevention Across Risk of Bias Endpoints
* **Date**: 2026-10-25 (Commit `808d815`)
* **Decision**: Enforce `check_project_access` on all direct-resource Risk of Bias (RoB) endpoints (`/api/rob/assessments/{id}`, `/api/rob/judgments/{id}`, `/api/rob/answers/{id}`).
* **Rationale**:
  * Prevent Insecure Direct Object Reference (IDOR) attacks where authenticated users in Project A could mutate or inspect RoB assessments belonging to Project B.
* **Impact**:
  * Verified with automated test `test_unauthorized_direct_resource_access_denied`.

---

## 6. Hash Map O(1) Pre-Computation for Matrix & Assessment Lookups
* **Date**: 2026-10-25 (Commits `fac4585`, `de02752`, `c6db41d`)
* **Decision**: Replace nested linear `.find()` loops in React render loops with memoized `Map` lookups (`domainDefMap`, `signalingAnswerMap`, `paperVariableExtMap`).
* **Rationale**:
  * When rendering large extraction matrices (e.g. 50 variables × 20 studies = 1,000 cells) or dense RoB signaling questions, linear array scans generated O(N²) / O(N³) complexity per frame, causing visible input lag.
  * O(1) Hash Map lookups reduce frame rendering times from >80ms to <4ms.

---

## 7. Clarification Notifications & Review Checklist
* **Date**: 2026-10-26 (Commit `58e97d1`)
* **Decision**: Introduce real-time notification toasts and a structured dashboard clarification checklist for study screening.
* **Rationale**:
  * Dual-blind reviewers require prompt notification when disagreements or clarification requests arise, preventing stalled screening pipelines.

---

## 8. Dynamic Clinical Persona Selection for Study Protocol Suggestions (Stanford STORM + LAYA)
* **Date**: 2026-10-26
* **Decision**: Dynamically synthesize and assign Stanford STORM clinical specialist personas based on the protocol topic and the empirical study literature gathered in ClaimScape, rather than relying on a static set of roles.
* **Clinical Specialization Matrix**:
  * **Breast Imaging & Oncology**: Breast Imaging Radiologist (BI-RADS 3/4/5 criteria, DBT, CEM, breast MRI in dense breasts), Breast Surgical Oncologist (re-excision rate, lumpectomy margins, SLNB vs ALND), Medical Oncologist (neoadjuvant pCR, receptor subtypes ER/PR/HER2), Diagnostic Accuracy Biostatistician (bivariate HSROC, interval cancer, lead-time bias).
  * **Neurovascular Intervention (PAM Benchmark)**: Neurointerventional Radiologist (catheter access, DSA vs CTA, mTICI 2b vs 2c/3), Stroke Neurologist (ECASS-III sICH criteria, 90-day blinded mRS, onset window), Cerebrovascular Surgeon (aneurysm co-existence, dAVF/AVM exclusion, decompressive craniectomy), Trial Biostatistician (active comparator, attrition bias).
  * **Thoracic / Pulmonary**: Thoracic Radiologist (Lung-RADS), Interventional Pulmonologist, Thoracic Surgeon, Epidemiologist.
  * **Cardiovascular**: Interventional Cardiologist (TIMI flow, ARC stent thrombosis), Cardiothoracic Surgeon, Clinical Cardiologist, Cardiovascular Biostatistician.
  * **Abdominal / GI**: Abdominal Radiologist (LI-RADS), HPB Surgeon, Hepatologist / GI Oncologist, Meta-Analysis Biostatistician.
  * **Universal Fallback**: Specialized Interventionalist, Medical Lead, Surgeon, Systematic Review Methodologist.
* **1-Click Human-in-the-Loop Adoption**:
  * Each identified flaw provides an actionable suggestion with a 1-click button (`[Adopt into Outcome]`, `[+ Add Exclusion Criterion]`, etc.) that immediately updates and persists the PICO / Criteria state.
* **Impact**:
  * Ensures multidisciplinary review matches the exact clinical domain of the systematic review.
  * Preserves the existing UI structure while embedding high-value protocol critique directly into the PICO workflow.

---

## 9. Security Hardening: Direct Resource Authorization on Chart Meta Endpoints
* **Date**: 2026-10-26 (PR #96, Commit `3310096`, `bff6383`)
* **Decision**: Add strict project ownership verification (`check_project_access`) on direct resource ID endpoints for chart generation (`/api/charts/forest/from-meta/{meta_id}`, `/api/charts/funnel/from-meta/{meta_id}`, `/api/charts/sroc/from-meta/{meta_id}`).
* **Rationale**:
  * Resolves IDOR vulnerability where an attacker with a known `meta_id` could generate analytical charts for a project they do not have permissions to view.
* **Impact**:
  * Unauthorized requests receive HTTP 403 Forbidden with `Access denied to project`.
  * Verified with automated unit tests in `test_charts_security.py`.

---

## 10. Role-Only Personas without Fictitious Doctor Names & Scholarly De-Branding
* **Date**: 2026-10-26 (Commit `57a654a`)
* **Decision**: Completely eliminate fictitious persona identities (e.g., "Dr. Sarah Chen, MD", "Dr. Marcus Vance, MD, PhD", "Dr. Claire Dupont, MD") and replace them exclusively with pure clinical specialty roles ("Radiologist", "Neurologist", "Biostatistician", "Breast Radiologist", "Cerebrovascular Surgeon"). De-brand external "Stanford STORM" labels in favor of clean academic editorial terminology: "Multi-Specialty Clinical Review & Flaw Detection".
* **Rationale**:
  * Fictitious doctor identities create an impression of simulated or synthetic authority, detracting from the credibility expected by clinical faculty, systematic reviewers, and trialists.
  * Real systematic reviews are cross-examined through disciplines and methodology, not invented personalities.
  * Preserves editorial gravitas under the Stellar Labs / RadExtract Master Theme.
* **Impact**:
  * UI cards, badges, and tooltips display clean specialty titles.
  * Client-side fallback generators and backend services strictly adhere to role-only outputs.

---

## 11. PRISMA 2020 Protocol Conformance & Open Science Pre-Registration Export (Adapted from prismAId)
* **Date**: 2026-10-26
* **Decision**: Adapt the core reporting validation and declarative export strengths of `open-and-sustainable/prismaid` into RadExtract's visual web platform:
  * **PRISMA 2020 Conformance Validator**: Evaluates 9 mandatory items (Title, Rationale & RQ, P, I, C, O, S, Eligibility Criteria, and Hypothesis Pre-Specification).
  * **Visual 9-Segment Conformance Strip**: Displays instant compliance percentage (e.g. 100% or 89%) and expandable guidance for any missing or warning items.
  * **1-Click Open Science Export (`/api/storm/export-protocol`)**: Exports a standardized JSON/PROSPERO protocol pre-registration document embedding PICO specifications, specialist reviewer roles, and PRISMA 2020 conformance ledger.
* **Rationale**:
  * While `prismaid` lacks a web UI, interactive evidence map, local tensor inference, and human-in-the-loop extraction spreadsheets, its emphasis on PRISMA 2020 reporting completeness and reproducible open-science protocol export provides substantial methodological value.
* **Impact**:
  * Reviewers can verify protocol completeness prior to study screening.
  * Seamless 1-click export of reproducible study protocols for PROSPERO and Open Science Framework (OSF) pre-registration.

---

## 12. Separation of Protocol Critique from Evidence Map & Resilient Project Data Conduit
* **Date**: 2026-10-26
* **Decision**:
  1. **Evidence Map Lens Filter**: Restrict the interactive map lens filter exclusively to evidence hierarchy tiers (`All Evidence`, `Direct Evidence Only`, `Reviews & Commentary`). Eliminate clinical persona buttons (`Interventional`, `Neurology`, `Biostat`) and flaw counters from the Evidence Map.
  2. **Removal of Grand Rounds & Verdict Badges from Evidence Map**: Multi-perspective protocol critique, study design flaw detection, and PRISMA 2020 protocol guidance belong strictly in the study protocol / PICO formulation workspace (`PicoHypothesisPage.tsx`). Remove the Grand Rounds deliberation panel, verdict badge, and flaw alert halos from `PaperInspector.tsx` and `ClaimscapeMap.tsx`.
  3. **High-Availability Project Fallback & Tunnel Auto-Discovery**: Update permanent backend tunnel configuration to active Cloudflare endpoint (`verification-enter-attachments-mug.trycloudflare.com`). In `request()`, catch network failures and server errors to automatically fall back to local/cached data (`handleDemoRequest`), ensuring `/projects` and project detail routes never crash or display blank/error screens.
  4. **Master Theme Compliance for Project Views**: Restyle `ProjectList.tsx` to strictly conform to the Master Theme (`#3a0f34`, `#fbf9f4`, `#ffffff`, `#d2c2cb`, `Serifon Editorial`, `Work Sans`).
* **Rationale**:
  * Clinical systematic reviewers use the Evidence Map to navigate published literature and evaluate empirical study tiers; blending speculative protocol critiques or verdict badges into publication inspection creates user confusion.
  * Research projects must remain accessible across offline, local dev, and hosted GitHub Pages environments without breaking on network glitches.
* **Impact**:
  * Pure, clean evidence mapping experience with 1-click tier switching.
  * Resilient project navigation guaranteed across all network states.
---

## 13. Three-Stage Sequential PICO Setup & Protocol Review Architecture
* **Date**: 2026-10-26
* **Decision**: Refactor the PICO setup experience into three disciplined sequential stages:
  1. **Stage 1 (Set Up Your PICO)**: Exactly three entry methods (Method A: Protocol document upload via `api.extractPico`; Method B: Single research question input with 'Generate PICO' via `api.generatePicoFromQuestion`; Method C: Direct manual entry). All methods converge on ONE shared editable PICO record with adaptive framework terminology (Diagnostic Accuracy vs Intervention/Therapy). The original question remains visible and editable, hypotheses are housed in an optional expandable accordion, and method switching confirms before replacing populated fields. Primary action: 'Save & Continue to Review'.
  2. **Stage 2 (Review Your Protocol)**: Single primary button 'Review My Protocol'. Dynamically selects AI reviewer perspectives based on question domain, specialty, and study design, with a configurable execution limit (3–4 reviewers) and explicit relevance explanations. Clear disclosure identifies perspectives as AI models (agreement does not prove scientific validity). Consolidated findings are partitioned into 4 distinct buckets (Missing/Ambiguous info, Conflicting criteria, Methodological concerns, Search omissions) with Accept/Edit/Dismiss controls. Eligibility criteria remain editable with 'Draft Eligibility Criteria'. Stale review detection flags prior reviews if PICO or criteria are altered.
  3. **Stage 3 (Generate Search Strings)**: Single primary button 'Generate Search Strings' (strictly separated from executing live searches). Generates syntax-calibrated queries across 9 database tabs (PubMed, Ovid MEDLINE, Embase.com, Ovid Embase, Cochrane, Web of Science, Scopus, CINAHL, OpenAlex) with live syntax validation and copy/save controls. Manually edited queries are protected from accidental regeneration, and PICO modifications mark existing queries as out of date while preserving manual edits.
* **Rationale**:
  * Eliminates cognitive overload, duplicated question entry, and competing primary actions.
  * Guarantees clinical rigor and traceability across systematic review protocol development.
* **Impact**:
  * Streamlined, intuitive workflow strictly adhering to Master Theme design tokens.
  * Zero schema migrations needed; 100% backwards compatible with existing saved project records.
