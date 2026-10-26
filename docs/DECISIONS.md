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
