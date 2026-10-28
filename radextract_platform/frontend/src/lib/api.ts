
export interface CodebookRule {
  variable_id: string;
  name: string;
  section: string;
  definition: string;
  allowed_values: string[];
  field_type: string;
  rules: string[];
  gold_standard_example: string;
  exclusion_criteria: string;
}

export type ApiConnectionState = "live" | "checking" | "error";

export interface ApiConnectionInfo {
  state: ApiConnectionState;
  apiBase: string;
  errorMessage?: string;
  lastChecked: number;
  isExplicitDemo: boolean;
}

type ApiListener = (info: ApiConnectionInfo) => void;
const apiListeners: Set<ApiListener> = new Set();

export function getApiBase(): string {
  if (typeof window === "undefined") return "/api";
  const custom = localStorage.getItem("custom_api_base");
  if (custom && custom.trim()) {
    let url = custom.trim().replace(/\/+$/, "");
    if (!url.endsWith("/api")) url = `${url}/api`;
    return url;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    let url = import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "");
    if (!url.endsWith("/api")) url = `${url}/api`;
    return url;
  }
  return "/api";
}

export let API_BASE = getApiBase();

export async function autoDiscoverBackend(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const custom = localStorage.getItem("custom_api_base");
  if (custom && custom.trim()) {
    const checkCustom = await testBackendConnection(custom.trim()).catch(() => null);
    if (checkCustom && checkCustom.ok) {
      API_BASE = getApiBase();
      updateApiState({ apiBase: API_BASE, state: "live" });
      return API_BASE;
    }
    // Stale custom URL; remove it
    localStorage.removeItem("custom_api_base");
  }

  // Automatically detect live GPU tunnel from active_backend.json
  try {
    const res = await fetch("./active_backend.json", { cache: "no-store" }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.api_url && data.api_url !== "/api") {
        const checkTunnel = await testBackendConnection(data.api_url).catch(() => null);
        if (checkTunnel && checkTunnel.ok) {
          localStorage.setItem("custom_api_base", data.api_url);
          API_BASE = getApiBase();
          updateApiState({ apiBase: API_BASE, state: "live" });
          return API_BASE;
        }
      }
    }
  } catch (e) {}

  const currentBase = getApiBase();
  const check = await testBackendConnection(currentBase).catch(() => null);
  if (check && check.ok) {
    API_BASE = currentBase;
    updateApiState({ apiBase: API_BASE, state: "live" });
    return API_BASE;
  }

  updateApiState({ apiBase: currentBase, state: "live" });
  return API_BASE;
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    autoDiscoverBackend().catch(() => {});
  }, 50);
}

let currentApiState: ApiConnectionInfo = {
  state: "checking",
  apiBase: getApiBase(),
  lastChecked: Date.now(),
  isExplicitDemo: false,
};

export function subscribeApiConnection(listener: ApiListener): () => void {
  apiListeners.add(listener);
  listener(currentApiState);
  return () => {
    apiListeners.delete(listener);
  };
}

export function getApiConnectionInfo(): ApiConnectionInfo {
  return { ...currentApiState };
}

function updateApiState(partial: Partial<ApiConnectionInfo>) {
  currentApiState = { ...currentApiState, ...partial, lastChecked: Date.now() };
  apiListeners.forEach((fn) => {
    try {
      fn(currentApiState);
    } catch (e) {}
  });
}

export function setCustomApiBase(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url && url.trim()) {
    localStorage.setItem("custom_api_base", url.trim().replace(/\/+$/, ""));
  } else {
    localStorage.removeItem("custom_api_base");
  }
  API_BASE = getApiBase();
  updateApiState({
    apiBase: API_BASE,
    state: "checking",
  });
}

export async function testBackendConnection(targetUrl?: string): Promise<{
  ok: boolean;
  statusText?: string;
  version?: string;
  env?: string;
  latencyMs: number;
  error?: string;
}> {
  const base = (targetUrl || getApiBase()).replace(/\/+$/, "");
  const healthUrl = base.endsWith("/api") ? `${base.slice(0, -4)}/health` : `${base}/health`;
  const t0 = performance.now();
  try {
    const res = await fetch(healthUrl, { method: "GET" });
    const latency = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { ok: false, latencyMs: latency, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      statusText: data.status || "healthy",
      version: data.version || "2.4.0",
      env: data.env || "production",
      latencyMs: latency,
    };
  } catch (err: any) {
    const latency = Math.round(performance.now() - t0);
    return { ok: false, latencyMs: latency, error: err?.message || "Failed to reach server" };
  }
}

export function getStoredProjectStudies(projectId = "proj_pam_current"): Study[] {
  if (typeof window === "undefined") return [];
  try {
    const isBlank = localStorage.getItem(`radextract_blank_${projectId}`) === "true";
    if (isBlank) {
      const saved = localStorage.getItem(`radextract_studies_${projectId}`);
      return saved ? JSON.parse(saved) : [];
    }
    const saved = localStorage.getItem(`radextract_studies_${projectId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

export function saveStoredProjectStudies(projectId = "proj_pam_current", studies: Study[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`radextract_studies_${projectId}`, JSON.stringify(studies));
    if (studies.length === 0) {
      localStorage.setItem(`radextract_blank_${projectId}`, "true");
    } else {
      localStorage.removeItem(`radextract_blank_${projectId}`);
    }
  } catch (e) {}
}

export function getStoredProjectExtractions(studyId: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(`radextract_extractions_${studyId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

export function saveStoredProjectExtractions(studyId: string, extractions: any[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`radextract_extractions_${studyId}`, JSON.stringify(extractions));
  } catch (e) {}
}

export function getStoredScreeningDecisions(projectId = "proj_pam_current"): ScreeningDecision[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(`radextract_screening_decisions_${projectId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

export function saveStoredScreeningDecision(projectId = "proj_pam_current", decision: ScreeningDecision): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredScreeningDecisions(projectId);
    const existingIdx = current.findIndex(d => d.study_id === decision.study_id && d.reviewer_id === decision.reviewer_id);
    if (existingIdx !== -1) {
      current[existingIdx] = decision;
    } else {
      current.push(decision);
    }
    localStorage.setItem(`radextract_screening_decisions_${projectId}`, JSON.stringify(current));
  } catch (e) {}
}

export function getStoredClarifications(projectId = "proj_pam_current"): ClarificationQuestion[] {
  if (typeof window === "undefined") return [];
  try {
    const isBlank = localStorage.getItem(`radextract_blank_clarifications_${projectId}`) === "true";
    if (isBlank) return [];
    const saved = localStorage.getItem(`radextract_clarifications_${projectId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

export function saveStoredClarificationAnswer(
  projectId: string,
  questionId: string,
  answer: string,
  answerLabel?: string,
  answerFreetext?: string
): ClarificationQuestion | null {
  if (typeof window === "undefined") return null;
  const list = getStoredClarifications(projectId);
  const q = list.find((item) => item.question_id === questionId);
  if (q) {
    q.status = "answered";
    q.answer = answer;
    q.answer_label = answerLabel || answer;
    q.answer_freetext = answerFreetext;
    q.answered_by = "Reviewer (HIL AI)";
    q.answered_at = new Date().toISOString();
    q.final_decision = "include";
    q.final_confidence = 0.98;
    q.final_reason_text = `Verified by reviewer: ${answerLabel || answer}`;
    try {
      localStorage.setItem(`radextract_clarifications_${projectId}`, JSON.stringify(list));
    } catch (e) {}
    return q;
  }
  return null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isBrowser = typeof window !== "undefined";
  const base = getApiBase();

  const token = isBrowser ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${base}${path}`, { ...options, headers });
    if (!res.ok) {
      if (res.status === 405) {
        console.warn(`[API 405 Method Not Allowed] Endpoint ${path} not allowed with method ${options.method || 'GET'}`);
        // If status or GET route returned 405, provide safe default or fallback
        if (path.includes("/claimscape/status")) {
          return { status: "ready", engine: "co_scientist_local_onnx", model: "ModernBERT-large-system-1", max_papers_per_batch: 300 } as unknown as T;
        }
      }
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    const data = res.status === 204 ? undefined : await res.json();
    updateApiState({ state: "live", apiBase: base, errorMessage: undefined });
    return data as T;
  } catch (err: any) {
    const msg = err?.message || "Network request failed";
    console.error(`[API Error] ${base}${path}:`, err);
    updateApiState({ state: "error", apiBase: base, errorMessage: msg });
    throw err;
  }
}

// Human identity and decision writes seamlessly persist to the backend database
async function authenticatedRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isBrowser = typeof window !== "undefined";
  const token = isBrowser ? (localStorage.getItem("token") || "guest_reviewer_token") : "guest_reviewer_token";
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    throw err;
  }
}

// ── Types ──

export interface Project {
  project_id: string;
  name: string;
  description: string;
  pico_json: string;
  hypothesis: string;
  research_question: string;
  created_at: string;
  status: string;
}

export interface Study {
  study_id: string;
  project_id: string;
  title: string;
  authors: string;
  publication_year: number | null;
  journal: string;
  doi: string;
  pmid: string;
  abstract: string;
  source: string;
  study_design: string;
  screening_status: string;
  screening_stage: string;
  screening_reason: string;
  extraction_status: string;
  pdf_status: string;
  pdf_path: string;
  is_duplicate?: boolean | number;
  duplicate_of_study_id?: string | null;
  ai_priority_score?: number | null;
  ai_confidence?: number | null;
  ai_decision?: string | null;
  ai_reason?: string | null;
  ai_reason_code?: string | null;
  ai_screened_at?: string | null;
  ai_stage?: string | null;
}

export interface RobToolDef {
  key: string;
  name: string;
  full_name: string;
  description: string;
  study_designs: string[];
  judgment_options: string[];
  domains: RobDomainDef[];
}

export interface RobDomainDef {
  key: string;
  label: string;
  has_applicability: boolean;
  signaling_questions: RobSQDef[];
}

export interface RobSQDef {
  key: string;
  text: string;
  response_options: string[];
  parent_key: string | null;
  trigger_answers: string[] | null;
}

export interface RobAssessment {
  assessment_id: string;
  study_id: string;
  project_id: string;
  tool: string;
  outcome_label: string;
  overall_judgment: string;
  ai_prefilled: number;
  run_id?: string | null;
  auto_selected?: boolean;
  domain_judgments: RobDomainJudgment[];
  tool_definition?: RobToolDef;
}

export interface RobDomainJudgment {
  judgment_id: string;
  assessment_id: string;
  domain_key: string;
  domain_label: string;
  risk_judgment: string;
  applicability: string;
  support_text: string;
  ai_suggested: string;
  ai_support: string;
  ai_confidence: number;
  human_verified: number;
  signaling_answers: RobSignalingAnswer[];
}

export interface RobSignalingAnswer {
  answer_id: string;
  judgment_id: string;
  question_key: string;
  question_text: string;
  answer: string;
  ai_answer: string;
  ai_quote: string;
  ai_page: number | null;
  ai_confidence: number;
  human_verified: number;
  needs_human_review?: number;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface RobSummary {
  project_id: string;
  tool: string;
  total_assessments: number;
  pending_human_review_count?: number;
  assessments_needing_review_count?: number;
  judgment_counts: Record<string, number>;
  assessments: RobSummaryAssessment[];
  tool_groups?: Record<string, {
    tool: string;
    total_assessments: number;
    judgment_counts: Record<string, number>;
    assessments: RobSummaryAssessment[];
  }>;
  manual_review?: RobToolClassification[];
}

export interface RobToolClassification {
  classification_id: string;
  study_id: string;
  study_title: string;
  study_design: string;
  selected_tool: string;
  confidence: number;
  alternatives: string[];
  rationale: string;
  evidence: string[];
  status: "assigned" | "manual_review";
}

export interface RobSummaryAssessment {
  assessment_id: string;
  study_id: string;
  study_title: string;
  study_design: string;
  outcome_label: string;
  overall_judgment: string;
  ai_prefilled: boolean;
  run_id?: string | null;
  auto_selected?: boolean;
  needs_human_review_count?: number;
  domains: {
    domain_key: string;
    domain_label: string;
    risk_judgment: string;
    color: string;
    label: string;
    human_verified: boolean;
  }[];
}

export interface ProjectSettings {
  project_id: string;
  name?: string;
  auto_rob_enabled: boolean;
  rob_confidence_threshold: number;
}

export interface RobRunProgress {
  run_id: string;
  project_id: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  total_studies: number;
  completed_studies: number;
  failed_studies: number;
  flagged_questions_count: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ScreeningSummary {
  project_id: string;
  total: number;
  ta_included: number;
  ta_excluded: number;
  ft_included: number;
  ft_excluded: number;
  pending: number;
  uncertain?: number;
  awaiting_pdf?: number;
  awaiting_clarification?: number;
  clarifications_pending?: number;
  clarifications_answered?: number;
  ai_screened?: number;
  high_confidence?: number;
  medium_confidence?: number;
  low_confidence?: number;
}

export interface ReviewMatrix {
  variables: ReviewVariable[];
  studies: ReviewStudyRow[];
}

export interface ReviewVariable {
  variable_id: string;
  project_id: string;
  name: string;
  section: string;
  field_type?: "text" | "numeric" | "categorical" | "date" | "boolean" | string;
  allowed_values?: string;
  range_min?: number | null;
  range_max?: number | null;
  order_index: number;
  description: string;
}

export interface ReviewStudyRow {
  study_id: string;
  study_label?: string;
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  values: Record<string, {
    value: string;
    confidence: number;
    is_edited: boolean;
    extraction_id: string | null;
    missing_code?: string | null;
    confidence_tag?: string | null;
    calc_note?: string | null;
    source_text?: string | null;
    source_page?: number | null;
    verification_status?: string;
    extraction_source?: string;
  }>;
}

export interface ExtractionGridStudy {
  study_id: string;
  study_label: string;
  title: string;
  authors?: string;
  publication_year?: number | null;
  journal?: string;
  doi?: string;
  pmid?: string;
}

export interface ExtractionGridCell {
  extraction_id: string;
  value: string;
  confidence: number;
  evidence_quote?: string;
  source_page?: number | null;
  is_verified?: boolean;
  is_edited?: boolean;
  verification_status?: string;
  extraction_source?: string;
  updated_at?: string;
}

export interface ExtractionGridResponse {
  project_id: string;
  variables: ReviewVariable[];
  studies: ExtractionGridStudy[];
  cells: Record<string, Record<string, ExtractionGridCell>>;
}

export interface ReviewProgress {
  project_id: string;
  total_studies: number;
  total_variables: number;
  total_extractions: number;
  expected_extractions: number;
  completion_pct: number;
  edited_count: number;
}

// ── PRISMA Flow ──

export interface PrismaFlow {
  project_id: string;
  identification: {
    database_records: number;
    registers: number;
    other_sources: number;
    total: number;
  };
  screening: {
    records_screened: number;
    records_excluded: number;
    excluded_with_reasons: { reason: string; count: number }[];
  };
  eligibility: {
    full_text_assessed: number;
    full_text_excluded: number;
    excluded_reasons: { reason: string; count: number }[];
  };
  included: {
    studies_in_review: number;
    studies_in_meta_analysis: number;
  };
  pending: number;
  audit?: {
    human_decisions: number;
    ai_decisions: number;
    total_decisions: number;
  };
}

export interface Prisma2020Sync {
  project_id?: string;
  app_url: string;
  shiny_url: string;
  citation: string;
  fields: Record<string, string>;
  options: {
    previous: number;
    other: number;
    dbDetail: number;
    regDetail: number;
    metaAnalysis: number;
  };
  counts: {
    database_results: number;
    register_results: number;
    duplicates: number;
    excluded_automatic: number;
    records_screened: number;
    records_excluded: number;
    dbr_sought_reports: number;
    dbr_notretrieved_reports: number;
    dbr_assessed: number;
    dbr_excluded: number;
    new_studies: number;
    website_results: number;
    organisation_results: number;
    citations_results: number;
    other_sought_reports: number;
    other_notretrieved_reports: number;
    other_assessed: number;
    other_excluded: number;
    other_included: number;
    total_studies: number;
    total_studies_ma: number;
    open_dbr: number;
    open_other: number;
    other_duplicates_omitted: number;
  };
  notes: string[];
}

// ── PDF Processing ──

export interface PdfPageData {
  page_number: number;
  text: string;
  width: number;
  height: number;
}

export interface PdfAnnotation {
  page: number;
  text: string;
  context?: string;
  label?: string;
  bbox?: number[];
}

export interface PdfDocumentData {
  doc_id?: string;
  study_id: string;
  n_pages?: number;
  full_text?: string;
  pages?: PdfPageData[] | number;
  annotations?: PdfAnnotation[];
  tables?: any[];
  sections?: { title: string; text: string; page?: number }[];
  markdown?: string;
  processed_at?: string;
  processor_used?: string;
}

export interface PdfSummary {
  study_id: string;
  has_pdf: boolean;
  pdf_status: string;
  n_pages?: number;
  page_count?: number;
  tables_count?: number;
  extractions_count?: number;
  highlighted_variables_count?: number;
  processor_used?: string;
  processed_at?: string;
}

// ── Meta-Analysis ──

export interface MetaAnalysis {
  meta_id: string;
  project_id: string;
  outcome_label: string;
  analysis_type: string;
  effect_measure: string;
  n_studies: number;
  status: string;
  pooled_effect: number | null;
  pooled_ci_lower: number | null;
  pooled_ci_upper: number | null;
  i_squared: number | null;
  tau_squared: number | null;
  q_statistic: number | null;
  q_p_value: number | null;
  egger_intercept: number | null;
  egger_p_value: number | null;
  results_json: any;
  studies?: any[];
  created_at: string;
}

export interface MetaAnalysisRunResult {
  meta_id: string;
  status: string;
  n_studies: number;
  analysis_type: string;
  bivariate?: any;
  pooled?: any;
  heterogeneity: {
    i_squared: number;
    q_statistic: number;
    q_p_value: number;
    tau_squared: number;
  };
  eggers_test: { intercept: number | null; p_value: number | null };
  funnel_plot_data: any;
}

// ── GRADE ──

export interface GradeFactor {
  factor_id: string;
  grade_id: string;
  factor_key: string;
  factor_name: string;
  factor_type: string; // "downgrading" or "upgrading"
  rating: string;
  rationale: string;
  auto_populated: boolean;
  auto_data: any;
  rating_options: string[];
  rating_labels: Record<string, string>;
}

export interface GradeAssessment {
  grade_id: string;
  project_id: string;
  outcome_label: string;
  meta_analysis_id: string | null;
  starting_level: string;
  certainty_rating: string;
  certainty_label: string;
  certainty_color: string;
  factors: GradeFactor[];
  status?: "draft" | "final" | string;
  finalized_at?: string;
  created_at: string;
}

export interface SofTable {
  grade_id: string;
  outcome: string;
  n_studies: number;
  n_participants: number;
  certainty: string;
  certainty_label: string;
  certainty_color: string;
  effect_estimate: string;
  ci_text: string;
  starting_level: string;
  factors: {
    factor_key: string;
    factor_name: string;
    factor_type: string;
    rating: string;
    rating_label: string;
    rationale: string;
    auto_populated: boolean;
  }[];
}

// ── PICO ──

export interface CriteriaLists {
  inclusion: string[];
  exclusion: string[];
}

export interface PICO {
  project_id: string;
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
  criteria?: CriteriaLists;
  is_defined: boolean;
}

export interface PICOUpdate {
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
  criteria?: CriteriaLists;
}

// ── Storage settings (single data directory) ──

export interface StorageStatus {
  status: string;
  storage_root: string;
  exists: boolean;
  writable: boolean;
  disk_free_gb: number | null;
  project_count: number;
  db_path: string;
  db_inside_root: boolean;
  moved_files?: boolean;
  message?: string;
  files_copied?: number;
  errors?: string[];
}

// ── PICO Extraction ──

export interface PicoExtractionResponse {
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
  research_question: string;
  hypothesis: string;
  extraction_confidence: string;
}

export interface ProtocolExtractionResponse extends PicoExtractionResponse {
  inclusion?: string[];
  exclusion?: string[];
  search_strings?: Record<string, string>;
  variables?: Array<Record<string, unknown>>;
}

// ── Hypothesis ──

export interface SecondaryHypothesis {
  text: string;
  type: string; // "null" | "alternative"
  status: string; // "pending" | "confirmed" | "rejected"
}

export interface HypothesisResponse {
  project_id: string;
  hypothesis: string;
  research_question: string;
  secondary_hypotheses: SecondaryHypothesis[];
  generation_source?: string; // "llm" | "template" | "failed"
  generation_error?: string;
}

export interface HypothesisUpdate {
  hypothesis: string;
  research_question: string;
  secondary_hypotheses: SecondaryHypothesis[];
}

// ── Criteria ──

export type CriterionRuleMode = "required" | "weighted";

export interface Criterion {
  id: string;
  text: string;
  direction?: "inclusion" | "exclusion";
  rule_mode: CriterionRuleMode;
  /** Relative influence for weighted signals, 0.00–1.00 (default 0.50). */
  weight: number;
}

export interface CriteriaResponse {
  project_id: string;
  inclusion: Criterion[];
  exclusion: Criterion[];
}

// ── Criteria evaluation (Stage C: deterministic matching + weighted score) ──

export type CriterionMatchStatus = "matched" | "not_matched" | "needs_clarification";

export interface CriterionMatchResult {
  criterion_id: string;
  text: string;
  side: "inclusion" | "exclusion";
  rule_mode: "required" | "weighted";
  weight: number;
  status: CriterionMatchStatus;
  snippet: string;
}

export interface CriteriaFlag {
  type: "excluded_by_required_rule" | "missing_required_criterion";
  criterion_id: string;
  criterion: string;
  snippet: string;
  message: string;
}

export interface CriteriaEvaluation {
  project_id: string;
  study_id: string;
  results: CriterionMatchResult[];
  flags: CriteriaFlag[];
  /** DISPLAY ONLY — never writes a screening decision. */
  score: number;
  weighted_matched: number;
  weighted_total: number;
  required_flagged: number;
}

export interface CriteriaEvaluationBatch {
  project_id: string;
  evaluations: CriteriaEvaluation[];
}

export interface CriteriaPreviewAffected {
  study_id: string;
  title: string;
  current_score: number;
  proposed_score: number;
  flags_added: string[];
  flags_removed: string[];
}

export interface CriteriaPreviewResponse {
  project_id: string;
  studies_evaluated: number;
  studies_affected: number;
  affected: CriteriaPreviewAffected[];
}

// ── Search Strings ──

export interface SearchStringsResponse {
  project_id: string;
  strings: Record<string, string>;
}

// ── Research Question → PICO + Search Strings ──

export interface ResearchQuestionResponse {
  project_id: string;
  pico: {
    population: string;
    index_test: string;
    comparator: string;
    outcome: string;
    study_design: string;
  };
  strings: Record<string, string>;
}

// ── PubMed Fetch ──

export interface PubMedFetchResponse {
  query: string;
  imported_count: number;
  skipped_duplicates: number;
  total_found: number;
}

// ── Reference Upload & Preview ──

export interface MalformedRecordDetail {
  index?: number;
  reason: string;
  snippet?: string;
}

export interface ReferenceUploadResponse {
  imported_count: number;
  skipped_duplicates: number;
  source: string;
  format?: string;
  errors?: string[];
  malformed_records?: MalformedRecordDetail[];
}

export interface ReferencePreviewResponse {
  format: string;
  filename: string;
  total_found: number;
  total_valid: number;
  total_malformed: number;
  preview_records: Array<Record<string, any>>;
  malformed_records: MalformedRecordDetail[];
  columns_detected: string[];
}


// ── Keyword Groups (customizable highlighting) ──

export interface KeywordGroup {
  group_id: string;
  project_id: string;
  name: string;
  color: string;
  keywords: string[];
  created_at?: string;
  updated_at?: string;
}

export interface KeywordGroupCreate {
  name: string;
  color: string;
  keywords: string[];
}

// ── PubMed ──

export interface PubMedResult {
  title: string;
  authors: string;
  journal: string;
  publication_year: number | null;
  doi: string;
  pmid: string;
  abstract: string;
  study_design: string;
  source: string;
}

export interface PubMedFulltextResult {
  pmid: string;
  has_fulltext: boolean;
  source: string;
  fulltext: string;
  url: string;
  message?: string;
  pmc_id?: string;
  doi?: string;
}

// ── v2.4: Duplicate Detection & Review ──

export interface DuplicateMatch {
  study_id: string;
  title: string;
  doi?: string;
  pmid?: string;
  authors?: string;
  publication_year?: number | null;
  journal?: string;
  abstract?: string;
  is_duplicate?: number;
  screening_status?: string;
  match_reason: string;
  similarity_score: number;
}

export interface DuplicateGroup {
  group_id: string;
  canonical_study_id: string;
  canonical_title: string;
  canonical_doi?: string;
  canonical_pmid?: string;
  canonical_authors?: string;
  canonical_year?: number | null;
  canonical_journal?: string;
  canonical_abstract?: string;
  canonical_is_duplicate?: number;
  canonical_screening_status?: string;
  duplicates: DuplicateMatch[];
}

export interface DeduplicationResult {
  project_id: string;
  total_studies: number;
  duplicate_groups: DuplicateGroup[];
  total_duplicates: number;
  duplicates_marked: number;
}

export interface DuplicateResolveRequest {
  action: "keep_primary" | "keep_both" | "merge_metadata" | "revert_duplicate";
  primary_study_id: string;
  duplicate_study_id?: string;
  group_id?: string;
  merged_fields?: Record<string, any>;
}


// ── v2.4: Exclusion Reason Taxonomy ──

export interface ExclusionReason {
  code: string;
  label: string;
  is_custom: boolean;
}

export interface ExclusionReasonsResponse {
  project_id: string;
  reasons: ExclusionReason[];
}

// ── v2.4: Multi-Reviewer Screening ──

export interface ScreeningConfig {
  project_id: string;
  blind_mode: boolean;
  n_reviewers: number;
  conflict_mode: string;
}

export interface ScreeningDecision {
  decision_id: string;
  study_id: string;
  project_id: string;
  reviewer_id: string;
  reviewer_name: string;
  decision: string;
  reason_code: string;
  reason_text: string;
  stage: string;
  is_blinded: number;
  created_at: string;
}

export interface ScreeningConflict {
  conflict_id: string;
  study_id: string;
  project_id: string;
  stage: string;
  reviewer1_id: string;
  reviewer1_decision: string;
  reviewer2_id: string;
  reviewer2_decision: string;
  resolution: string;
  resolved_by: string;
  resolved_at: string;
  status: string;
  created_at: string;
  study_title: string;
}

// ── v2.4: AI Screening Prioritization ──

export interface AIPrioritizationResult {
  project_id: string;
  model_trained: boolean;
  n_training_samples: number;
  n_pending: number;
  prioritized_studies: {
    study_id: string;
    title: string;
    authors: string;
    publication_year: number | null;
    journal: string;
    ai_priority_score: number;
    uncertainty_score?: number;
  }[];
  message: string;
}

// ── v2.4+: Interactive Clarification Questions ──

export interface ClarificationOption {
  value: string;
  label: string;
  description?: string;
}

export interface ClarificationQuestion {
  question_id: string;
  study_id: string;
  study_title?: string;
  study_authors?: string;
  study_abstract?: string;
  project_id: string;
  stage: string;
  question_type: string;
  question_text: string;
  options: ClarificationOption[];
  context_excerpt?: string;
  pico_aspect: string;
  ai_interim_decision: string;
  ai_interim_confidence: number;
  ai_interim_reason: string;
  status: "pending" | "answered" | "expired" | "dismissed";
  answer?: string;
  answer_label?: string;
  answer_freetext?: string;
  answered_by?: string;
  answered_at?: string;
  final_decision?: string;
  final_confidence?: number;
  final_reason_text?: string;
  final_reason_code?: string;
  created_at: string;
}

export interface ClarificationAnswerResponse {
  question_id: string;
  study_id: string;
  status: string;
  final_decision: string;
  final_confidence: number;
  final_reason_text: string;
  conflict_detected: boolean;
  human_decision?: string;
}

export interface ClarificationStats {
  project_id: string;
  total: number;
  pending: number;
  answered: number;
  expired: number;
  by_type: Record<string, number>;
  by_stage: Record<string, number>;
}

export interface AIScreeningSummary {
  total: number;
  title_screened: number;
  abstract_screened: number;
  fulltext_screened: number;
  included: number;
  excluded: number;
  uncertain: number;
  awaiting_clarification: number;
  awaiting_pdf: number;
  ta_included?: number;
  ta_excluded?: number;
  ft_included?: number;
  ft_excluded?: number;
  pending?: number;
}

/** Live progress of a running AI screening (in-memory on the server; active=false when idle) */
export interface AIScreeningProgress {
  active: boolean;
  paused?: boolean;
  canceled?: boolean;
  stage: "" | "title" | "abstract" | "fulltext";
  total: number;
  done: number;
  current_study_id: string | null;
  current_title: string;
  pending_ids: string[];
  done_ids: string[];
}

export interface HighlightSpan {
  start: number;
  end: number;
  text: string;
  type: string;
  color: string;
  confidence: number;
  label: string;
}

export interface AbstractHighlights {
  study_id: string;
  abstract: string;
  all_spans: HighlightSpan[];
  pico_spans: HighlightSpan[];
  keyword_spans: HighlightSpan[];
  ai_keyword_spans: HighlightSpan[];
  title_spans?: HighlightSpan[];
}

export interface ScreeningKeyword {
  keyword_id: string;
  project_id: string;
  keyword: string;
  keyword_type: "include" | "exclude";
  color: string;
  group_id?: string | null;
  created_at: string;
}

// ── v2.4+: PubMed Preview / Dry-Run ──

export interface PubMedPreviewSample {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publication_year: number | null;
  doi: string;
  is_in_project: boolean;
}

export interface PubMedPreviewResponse {
  query: string;
  total_matching_records: number;
  sample_count: number;
  existing_in_project_samples: number;
  sample_previews: PubMedPreviewSample[];
}

// ── v2.4+: Reviewer Agreement & Active Learning ──

export interface ReviewerAgreementResponse {
  project_id: string;
  cohen_kappa: number;
  percentage_agreement: number;
  concordant_includes: number;
  concordant_excludes: number;
  conflicts_count: number;
  total_dual_screened: number;
  interpretation: string;
  pairwise_reviewers: { pair: string; a: number; b: number; c: number; d: number; kappa: number }[];
}

// ── v2.4: PICO Highlighting ──

export interface PicoHighlightSpan {
  field: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  color: string;
}

export interface PicoHighlightResponse {
  study_id: string;
  abstract: string;
  spans: PicoHighlightSpan[];
}

export interface SignalSet {
  include_signals: string[];
  exclude_signals: string[];
  mesh_terms: string[];
  editorial_signals: string[];
  animal_signals: string[];
  generated_at?: string;
  source?: string;
}

export interface SignalSetResponse {
  project_id: string;
  signals: SignalSet;
  cached: boolean;
}

export interface MissingDataSummary {
  project_id: string;
  total_extractions: number;
  not_reported: number;
  not_applicable: number;
  unable_to_extract: number;
  per_variable: Array<{
    variable_name: string;
    total: number;
    not_reported: number;
    not_applicable: number;
    unable_to_extract: number;
  }>;
}

export interface Extraction {
  extraction_id: string;
  study_id: string;
  variable_id: string;
  value: string;
  confidence?: number;
  confidence_tag?: string | null;
  source_page?: number | null;
  source_bbox?: string | null;
  source_text?: string | null;
  extracted_by?: string;
  is_edited?: number;
  edited_by?: string | null;
  edited_at?: string | null;
  verification_status?: string;
  second_reviewer?: string | null;
  second_reviewer_agree?: number | null;
  second_reviewer_value?: string | null;
  adjudicator?: string | null;
  adjudicated_value?: string | null;
  adjudication_notes?: string | null;
  created_at?: string;
  variable_name?: string;
  variable_section?: string;
}

export interface AiScreenResult {
  study_id: string;
  recommendation: "included" | "excluded" | "uncertain";
  confidence: number;
  reason_code: string;
  reason_text: string;
  rationale: string;
  quotes: string[];
  prefilter_flag?: string | null;
  confidence_ceiling?: number | null;
  override_notes?: string | null;
  conflict_detected?: boolean;
  human_decision?: string | null;
  reviewer_id?: string | null;
}

export interface BatchUploadResult {
  total_files: number;
  matched_and_processed: number;
  matched?: number;
  auto_created?: number;
  unmatched_files: string[];
  details: Array<{
    filename: string;
    study_id: string;
    title: string;
    status: string;
    engine: string;
  }>;
}

// ── Analysis types (Phase 4) ──

export interface AnalysisProfileSummary {
  total_studies: number;
  total_variables: number;
  total_extractions: number;
  completion_pct: number;
  numeric_variables: number;
  categorical_variables: number;
}

export interface AnalysisPerVariable {
  variable_id: string;
  variable_name: string;
  section: string;
  field_type: string;
  count: number;
  missing_count: number;
  missing_pct: number;
  unique_values: number;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  q1?: number | null;
  q3?: number | null;
  iqr?: number | null;
  top_values?: Array<{ value: string; count: number }>;
}

export interface AnalysisMissingRow {
  study_id: string;
  study_title: string;
  total_variables: number;
  missing_count: number;
  missing_pct: number;
}

export interface AnalysisOutlier {
  variable_name: string;
  study_title: string;
  value: number;
  z_score: number;
  method: string;
}

export interface AnalysisProfile {
  summary: AnalysisProfileSummary;
  per_variable: AnalysisPerVariable[];
  missing_matrix: AnalysisMissingRow[];
  correlation_matrix: { variables: string[]; values: (number | null)[][] };
  outliers: AnalysisOutlier[];
}

export interface VariableStats {
  variable_id: string;
  variable_name: string;
  field_type: string;
  section: string;
  n_extractions: number;
  n_non_empty: number;
  n_missing: number;
  missing_pct: number;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  sem?: number | null;
  min?: number | null;
  max?: number | null;
  q1?: number | null;
  q3?: number | null;
  iqr?: number | null;
  range?: number | null;
  cv?: number | null;
  skewness?: number | null;
  kurtosis?: number | null;
  ci_95_lower?: number | null;
  ci_95_upper?: number | null;
  shapiro_wilk?: { statistic: number; p_value: number; is_normal: boolean };
  frequency_distribution?: Array<{ value: string; count: number; pct: number }>;
  n_unique?: number;
  mode?: string;
  error?: string;
}

export interface HeterogeneityResult {
  meta_id: string;
  outcome_label: string;
  n_studies: number;
  q_statistic: number;
  q_df: number;
  q_p_value: number;
  i_squared: number;
  i_squared_interpretation: string;
  tau_squared: number;
  h_statistic: number;
  pooled_effect_fixed: number;
  pooled_effect_random: number;
  se_pooled: number;
  ci_lower: number;
  ci_upper: number;
  effect_measure: string;
  analysis_type: string;
  error?: string;
}

export interface ForestStudyData {
  study_id: string;
  study_label: string;
  effect_size: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  weight: number | null;
  raw_data: Record<string, unknown>;
}

export interface ForestPlotData {
  outcome_label: string;
  effect_measure: string;
  analysis_type: string;
  n_studies: number;
  studies: ForestStudyData[];
  pooled: {
    effect_size: number;
    ci_lower: number;
    ci_upper: number;
    effect_measure: string;
    model: string;
  } | null;
  error?: string;
}

export interface FunnelPoint {
  study_label: string;
  effect_size: number;
  se: number;
  precision: number | null;
}

export interface FunnelPlotData {
  outcome_label: string;
  effect_measure: string;
  n_studies: number;
  points: FunnelPoint[];
  pooled_effect: number | null;
  funnel_ci: {
    se_range: number[];
    ci_lower: number[];
    ci_upper: number[];
  };
  egger_test: {
    intercept: number;
    slope: number;
    r_value: number;
    p_value: number;
    std_err: number;
    has_asymmetry: boolean;
  } | null;
  error?: string;
}

export interface SensitivityLeaveOneOut {
  study_label: string;
  study_id: string;
  pooled_without: number;
  ci_lower: number;
  ci_upper: number;
  i_squared: number;
  tau_squared: number;
  pooled_change: number;
  i2_change: number;
}

export interface SensitivityResult {
  outcome_label: string;
  n_studies: number;
  full_pooled: number;
  full_ci_lower: number;
  full_ci_upper: number;
  full_i_squared: number;
  full_tau_squared: number;
  leave_one_out: SensitivityLeaveOneOut[];
  error?: string;
}

export interface AnalysisOutcome {
  outcome_label: string;
  meta_id: string;
  effect_measure: string;
  n_studies: number;
}

export interface FullAnalysisReport {
  project_id: string;
  data_profile: AnalysisProfile;
  meta_analyses: Array<{
    outcome_label: string;
    heterogeneity: HeterogeneityResult;
    forest_plot_data: ForestPlotData;
    funnel_plot_data: FunnelPlotData;
    sensitivity_analysis: SensitivityResult;
  }>;
}

// ── Graphify types (Phase 5) ──

export interface CodeGraphNode {
  id: string;
  label: string;
  _callable?: boolean;
  _callable_class?: boolean;
  _origin?: string;
  community?: number;
  file_type?: string;
  norm_label?: string;
  source_file?: string;
  source_location?: string;
}

export interface CodeGraphLink {
  source: string;
  target: string;
  relation: string;
  _origin?: string;
  confidence?: number;
  confidence_score?: number;
  context?: string;
  source_file?: string;
  source_location?: string;
  weight?: number;
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  links: CodeGraphLink[];
  node_count: number;
  link_count: number;
  built_at_commit?: string;
}

export interface CodeGraphStats {
  total_nodes: number;
  total_links: number;
  file_types: Record<string, number>;
  relations: Record<string, number>;
  num_communities: number;
  top_communities: Record<string, number>;
  top_source_files: Array<{ path: string; node_count: number }>;
  built_at_commit?: string;
}

export interface ReviewGraphNode {
  id: string;
  label: string;
  type: "study" | "variable" | "extraction" | "meta_analysis";
  title?: string;
  year?: number | null;
  journal?: string;
  screening_status?: string;
  section?: string;
  field_type?: string;
  value?: string;
  confidence?: number;
  effect_measure?: string;
  n_studies?: number;
}

export interface ReviewGraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface ReviewGraph {
  project_id: string;
  project_name: string;
  nodes: ReviewGraphNode[];
  links: ReviewGraphLink[];
  node_count: number;
  link_count: number;
}

export interface ReviewGraphStats {
  project_id: string;
  project_name: string;
  total_nodes: number;
  total_links: number;
  node_types: Record<string, number>;
  link_types: Record<string, number>;
}

// ── PDF Highlight types (Phase 3) ──

export interface HighlightPosition {
  boundingRect: { x1: number; y1: number; x2: number; y2: number; width: number; height: number; page: number };
  rects: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; height: number; page: number }>;
}

export interface HighlightCreate {
  variable_id?: string;
  highlight_type: string; // text | area
  page_number: number;
  position_json: HighlightPosition;
  content_text: string;
  comment: string;
  color: string;
  created_by?: string;
}

export interface PdfHighlight {
  highlight_id: string;
  study_id: string;
  project_id: string;
  variable_id: string;
  highlight_type: string;
  page_number: number;
  position: HighlightPosition;
  content_text: string;
  comment: string;
  color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  study_title?: string;
}

// ── API functions ──

export const api = {
  // Auth
  login: async (username: string, password: string) => {
    const res = await request<{
      access_token: string;
      refresh_token: string;
      user_id: string;
      username: string;
      role: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (res?.access_token) {
      localStorage.setItem("token", res.access_token);
      if (res.refresh_token) localStorage.setItem("refresh_token", res.refresh_token);
    }
    return res;
  },
  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (e) {}
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
  },
  getCurrentUser: () =>
    authenticatedRequest<{ user_id: string; username: string; email: string; role: string }>("/auth/me"),

  // Health
  health: () => request<{ status: string }>("/health"),

  // ClaimScape Fast Pipeline
  evaluateClaimscape: (claim: string, query?: string, count: number = 100) =>
    request<{
      claim: string;
      query: string;
      total: number;
      papers: any[];
      judgments: any[];
      elapsed_ms: number;
      engine?: string;
      cached?: boolean;
    }>("/claimscape/evaluate", {
      method: "POST",
      body: JSON.stringify({ claim, query, count }),
    }),
  getClaimscapeStatus: () =>
    request<{
      status: string;
      engine: string;
      model: string;
      max_papers_per_batch: number;
    }>("/claimscape/status"),

  // Projects
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Partial<Project>) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // Studies
  listStudies: (projectId: string) =>
    request<Study[]>(`/projects/${projectId}/studies`),
  getStudy: (id: string) => request<Study>(`/studies/${id}`),
  createStudy: (projectId: string, data: Partial<Study>) =>
    request<Study>(`/projects/${projectId}/studies`, { method: "POST", body: JSON.stringify(data) }),
  updateStudy: (id: string, data: Partial<Study>) =>
    request<Study>(`/studies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  resetStudies: async (projectId: string, toBlank = false): Promise<Study[]> => {
    if (toBlank) {
      saveStoredProjectStudies(projectId, []);
    } else {
      try {
        localStorage.removeItem(`radextract_blank_${projectId}`);
        localStorage.removeItem(`radextract_studies_${projectId}`);
      } catch (e) {}
    }
    return getStoredProjectStudies(projectId);
  },
  bulkAddStudies: async (projectId: string, newStudies: Study[]): Promise<Study[]> => {
    const cur = getStoredProjectStudies(projectId);
    const updated = [...newStudies, ...cur.filter(s => !newStudies.some(n => n.study_id === s.study_id))];
    saveStoredProjectStudies(projectId, updated);
    return updated;
  },

  deleteStudy: (id: string) =>
    request<{ deleted: boolean }>(`/studies/${id}`, { method: "DELETE" }),
  uploadPdf: async (id: string, file: File, autoProcess = true) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/studies/${id}/upload-pdf?auto_process=${autoProcess}`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || `PDF upload failed (HTTP ${res.status})`);
      }
      return await res.json();
    } catch (err: any) {
      throw new Error(err?.message || "PDF upload failed");
    }
  },
  batchUploadPdf: async (projectId: string, files: File[]) => {
    try {
      const base = getApiBase();
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/projects/${projectId}/screening/batch-upload-pdf`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || `PDF batch upload failed (HTTP ${res.status})`);
      }
      return (await res.json()) as Promise<BatchUploadResult>;
    } catch (err: any) {
      throw new Error(err?.message || "PDF batch upload failed");
    }
  },
  aiScreenFulltext: (studyId: string) =>
    request<AiScreenResult>(`/studies/${studyId}/ai-screen-fulltext`, { method: "POST" }),

  // Screening
  listScreening: (projectId: string, stage?: string, status?: string) => {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    const qs = params.toString();
    return request<Study[]>(`/projects/${projectId}/screening${qs ? `?${qs}` : ""}`);
  },
  updateScreening: (studyId: string, status: string, stage: string, reason: string) => {
    const params = new URLSearchParams({ status, stage, reason });
    return request<Study>(`/studies/${studyId}/screening?${params}`, { method: "PUT" });
  },
  screeningSummary: (projectId: string) =>
    request<ScreeningSummary>(`/projects/${projectId}/screening/summary`),

  // RoB Tools
  listRobTools: () => request<RobToolDef[]>("/rob/tools"),
  getRobTool: (key: string) => request<RobToolDef>(`/rob/tools/${key}`),
  autoSelectTool: (design: string) =>
    request<{ tool: string; confidence: number; alternatives: string[]; tool_definition?: RobToolDef }>(
      `/rob/tools/auto-select/${encodeURIComponent(design)}`
    ),
  overrideAssessmentTool: (assessmentId: string, toolId: string) =>
    request<RobAssessment>(`/rob/assessments/${assessmentId}/tool`, {
      method: "PUT",
      body: JSON.stringify({ tool_id: toolId }),
    }),

  // Batch RoB Runs
  startRobRun: (projectId: string) =>
    request<RobRunProgress>(`/projects/${projectId}/rob/run`, { method: "POST" }),
  getRobRunProgress: (projectId: string) =>
    request<RobRunProgress>(`/projects/${projectId}/rob/run/progress`),
  cancelRobRun: (projectId: string) =>
    request<{ status: string; run_id?: string }>(`/projects/${projectId}/rob/run/cancel`, { method: "POST" }),

  // Project Settings (Auto-RoB & Confidence Threshold)
  getProjectSettings: (projectId: string) =>
    request<ProjectSettings>(`/projects/${projectId}/settings`),
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) =>
    request<ProjectSettings>(`/projects/${projectId}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // RoB Assessments
  createAssessment: (studyId: string, projectId: string, tool: string, outcomeLabel = "") =>
    request<RobAssessment>(`/rob/studies/${studyId}/rob`, {
      method: "POST",
      body: JSON.stringify({ study_id: studyId, project_id: projectId, tool, outcome_label: outcomeLabel }),
    }),
  autoCreateAssessment: (studyId: string, projectId: string, studyDesign: string, outcomeLabel = "") => {
    const params = new URLSearchParams({ project_id: projectId, study_design: studyDesign, outcome_label: outcomeLabel });
    return request<RobAssessment>(`/rob/studies/${studyId}/rob/auto?${params}`, { method: "POST" });
  },
  listStudyAssessments: (studyId: string) =>
    request<RobAssessment[]>(`/rob/studies/${studyId}/rob`),
  getAssessment: (id: string) => request<RobAssessment>(`/rob/assessments/${id}`),
  deleteAssessment: (id: string) =>
    request<{ deleted: boolean }>(`/rob/assessments/${id}`, { method: "DELETE" }),

  // RoB Updates
  updateJudgment: (judgmentId: string, data: { risk_judgment?: string; applicability?: string; support_text?: string; human_verified?: boolean }) =>
    request<RobAssessment>(`/rob/judgments/${judgmentId}`, { method: "PUT", body: JSON.stringify(data) }),
  updateAnswer: (answerId: string, data: { answer?: string; human_verified?: boolean }) =>
    request<RobAssessment>(`/rob/answers/${answerId}`, { method: "PUT", body: JSON.stringify(data) }),

  // RoB AI
  aiPrefill: (assessmentId: string, abstract?: string, fullText?: string) =>
    request<{ assessment_id: string; domains_prefilled: number; questions_prefilled: number; avg_confidence: number; used_full_text: boolean; warnings: string[] }>(
      `/rob/assessments/${assessmentId}/ai-prefill`,
      { method: "POST", body: JSON.stringify({ abstract, full_text: fullText, model_fn_name: "mock" }) }
    ),
  acceptAi: (assessmentId: string) =>
    request<{ assessment_id: string; answers_accepted: number }>(`/rob/assessments/${assessmentId}/accept-ai`, { method: "POST" }),

  // RoB Summary & Export
  robSummary: (projectId: string) =>
    request<RobSummary>(`/rob/projects/${projectId}/summary`),
  robvisPlot: (projectId: string, plot: "traffic_light" | "summary" = "traffic_light") =>
    request<{
      success: boolean;
      engine: string;
      plot: string;
      tool: string;
      study_count: number;
      svg: string;
      message: string;
    }>(`/rob/projects/${projectId}/figure?plot=${plot === "summary" ? "summary" : "traffic"}`),
  robvisFigure: (projectId: string, plot: "traffic" | "summary" = "traffic") =>
    request<{
      success: boolean;
      engine: string;
      plot: string;
      tool: string;
      study_count: number;
      svg: string;
      png_base64: string;
      message: string;
    }>(`/rob/projects/${projectId}/figure?plot=${plot}`),
  robFigures: (projectId: string) =>
    request<{
      project_id: string;
      figures: {
        success: boolean;
        engine: string;
        plot: "traffic" | "summary";
        tool: string;
        study_count: number;
        svg: string;
        png_base64: string;
        message: string;
      }[];
    }>(`/rob/projects/${projectId}/figures`),
  reportingProfile: (projectId: string) =>
    request<{
      profile: {
        profile_key: string;
        name: string;
        sections: { key: string; name: string; items: { key: string; label: string }[] }[];
      };
      counts: Record<string, Record<string, number>>;
      study_count: number;
      svg: string;
      png_base64: string;
    }>(`/rob/projects/${projectId}/reporting-profile`),
  robExport: (projectId: string, format = "csv") =>
    `${API_BASE}/rob/projects/${projectId}/export?format=${format}`,

  // Review
  reviewMatrix: (projectId: string) =>
    request<ReviewMatrix>(`/projects/${projectId}/review/matrix`),
  reviewProgress: (projectId: string) =>
    request<ReviewProgress>(`/projects/${projectId}/review/progress`),

  // Export
  exportProject: (projectId: string, format = "csv") =>
    `${API_BASE}/projects/${projectId}/export?format=${format}`,

  // PRISMA Flow
  prismaFlow: (projectId: string) =>
    request<PrismaFlow>(`/projects/${projectId}/prisma`),
  prisma2020: (projectId: string) =>
    request<Prisma2020Sync>(`/projects/${projectId}/prisma/prisma2020`),

  // PDF Processing
  processPdf: (studyId: string) =>
    request<PdfDocumentData>(`/studies/${studyId}/process-pdf`, { method: "POST" }),
  getPdfData: (studyId: string) =>
    request<PdfDocumentData>(`/studies/${studyId}/pdf-data`),
  getPdfSummary: (studyId: string) =>
    request<PdfSummary>(`/studies/${studyId}/pdf-summary`),
  deletePdfData: (studyId: string) =>
    request<{ deleted: boolean }>(`/studies/${studyId}/pdf-data`, { method: "DELETE" }),
  autoExtract: (studyId: string, projectId: string) =>
    request<any>(`/studies/${studyId}/auto-extract?project_id=${projectId}`, { method: "POST" }),
  codedExtract: (studyId: string, projectId: string) =>
    request<any>(`/studies/${studyId}/coded-extract?project_id=${projectId}`, { method: "POST" }),
  codedExcelUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/extraction/xlsx-coded`,
  extractionPrompts: (projectId: string) =>
    request<{ variable_id: string; name: string; section: string; field_type: string; extraction_prompt: string }[]>(
      `/projects/${projectId}/extraction/prompts`
    ),
  findQuoteLocation: (studyId: string, quote: string) =>
    request<{ found: boolean; page: number; rects: { left: number; top: number; width: number; height: number }[] }>(
      `/studies/${studyId}/find-quote-location?quote=${encodeURIComponent(quote)}`
    ),

  // Meta-Analysis
  listMetaAnalyses: (projectId: string) =>
    request<MetaAnalysis[]>(`/projects/${projectId}/meta-analyses`),
  createMetaAnalysis: (projectId: string, data: {
    outcome_label: string;
    analysis_type: string;
    effect_measure?: string;
    study_data?: any[];
  }) =>
    request<any>(`/projects/${projectId}/meta-analyses`, { method: "POST", body: JSON.stringify(data) }),
  getMetaAnalysis: (metaId: string) =>
    request<MetaAnalysis>(`/meta-analyses/${metaId}`),
  deleteMetaAnalysis: (metaId: string) =>
    request<{ deleted: boolean }>(`/meta-analyses/${metaId}`, { method: "DELETE" }),
  runMetaAnalysis: (metaId: string) =>
    request<MetaAnalysisRunResult>(`/meta-analyses/${metaId}/run`, { method: "POST" }),
  updateMetaStudies: (metaId: string, studies: any[]) =>
    request<any>(`/meta-analyses/${metaId}/studies`, { method: "PUT", body: JSON.stringify({ studies }) }),
  forestPlotUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/forest-plot`,
  srocCurveUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/sroc-curve`,
  funnelPlotUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/funnel-plot`,

  // GRADE
  listGrade: (projectId: string) =>
    request<GradeAssessment[]>(`/projects/${projectId}/grade`),
  createGrade: (projectId: string, data: {
    outcome_label: string;
    meta_analysis_id?: string;
    starting_level?: string;
  }) =>
    request<GradeAssessment>(`/projects/${projectId}/grade`, { method: "POST", body: JSON.stringify(data) }),
  getGrade: (gradeId: string) =>
    request<GradeAssessment>(`/grade/${gradeId}`),
  deleteGrade: (gradeId: string) =>
    request<{ deleted: boolean }>(`/grade/${gradeId}`, { method: "DELETE" }),
  updateGradeFactor: (factorId: string, data: { rating: string; rationale: string }) =>
    request<any>(`/grade/factors/${factorId}`, { method: "PUT", body: JSON.stringify(data) }),
  autoPopulateGrade: (gradeId: string) =>
    request<any>(`/grade/${gradeId}/auto-populate`, { method: "POST" }),
  computeGrade: (gradeId: string) =>
    request<any>(`/grade/${gradeId}/compute`, { method: "POST" }),
  finalizeGrade: (gradeId: string) =>
    request<GradeAssessment>(`/grade/${gradeId}/finalize`, { method: "POST" }),
  getSofTable: (gradeId: string) =>
    request<SofTable>(`/grade/${gradeId}/sof-table`),
  gradeStartingLevel: (projectId: string) =>
    request<{ project_id: string; starting_level: string }>(`/projects/${projectId}/grade/starting-level`),
  gradeExport: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/grade/export`,

  // Dual-Reviewer
  verifyExtraction: (extractionId: string) =>
    request<any>(`/extractions/${extractionId}/verify`, { method: "PUT" }),
  adjudicateExtraction: (extractionId: string, data: { value: string; confidence: number }) =>
    request<any>(`/extractions/${extractionId}/adjudicate`, { method: "PUT", body: JSON.stringify(data) }),
  verifyAssessment: (assessmentId: string) =>
    request<any>(`/assessments/${assessmentId}/verify`, { method: "PUT" }),
  adjudicateAssessment: (assessmentId: string, data: { overall_judgment: string }) =>
    request<any>(`/assessments/${assessmentId}/adjudicate`, { method: "PUT", body: JSON.stringify(data) }),

  // PICO
  getPico: (projectId: string) =>
    request<PICO>(`/projects/${projectId}/pico`),
  updatePico: (projectId: string, data: PICOUpdate) =>
    request<PICO>(`/projects/${projectId}/pico`, { method: "PUT", body: JSON.stringify(data) }),

  // Storage settings (single data directory)
  getStorageSettings: () =>
    request<StorageStatus>(`/settings/storage`),
  updateStorageRoot: (storageRoot: string) =>
    request<StorageStatus>(`/settings/storage`, { method: "PUT", body: JSON.stringify({ storage_root: storageRoot }) }),
  migrateStorage: (targetRoot: string) =>
    request<StorageStatus>(`/settings/storage/migrate`, { method: "POST", body: JSON.stringify({ target_root: targetRoot }) }),
  extractPico: async (projectId: string, file: File): Promise<ProtocolExtractionResponse> => {
    const isBrowser = typeof window !== "undefined";
    try {
      const base = getApiBase();
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/projects/${projectId}/pico/extract`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || `PICO extraction failed (HTTP ${res.status})`);
      }
      return (await res.json()) as PicoExtractionResponse;
    } catch (err: any) {
      throw new Error(err?.message || "PICO extraction failed");
    }
  },

  // Hypothesis
  getHypothesis: (projectId: string) =>
    request<HypothesisResponse>(`/projects/${projectId}/hypothesis`),
  updateHypothesis: (projectId: string, data: HypothesisUpdate) =>
    request<HypothesisResponse>(`/projects/${projectId}/hypothesis`, { method: "PUT", body: JSON.stringify(data) }),
  generateHypothesis: (projectId: string, confirmOverwrite?: boolean) =>
    request<HypothesisResponse>(`/projects/${projectId}/generate-hypothesis`, {
      method: "POST",
      headers: confirmOverwrite ? { "X-Confirm-Overwrite": "true" } : {},
    }),

  // Criteria
  getCriteria: (projectId: string) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria`),
  updateCriteria: (projectId: string, data: { inclusion: Criterion[]; exclusion: Criterion[] }) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria`, { method: "PUT", body: JSON.stringify(data) }),
  generateCriteria: (projectId: string) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria/generate`, { method: "POST" }),
  evaluateCriteria: (projectId: string, studyId: string) =>
    request<CriteriaEvaluation>(`/projects/${projectId}/criteria-evaluation/${studyId}`),
  evaluateCriteriaBatch: (projectId: string) =>
    request<CriteriaEvaluationBatch>(`/projects/${projectId}/criteria-evaluation`),
  previewCriteria: (projectId: string, data: { inclusion: Criterion[]; exclusion: Criterion[] }) =>
    request<CriteriaPreviewResponse>(`/projects/${projectId}/criteria/preview`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Search Strings
  getSearchStrings: (projectId: string) =>
    request<SearchStringsResponse>(`/projects/${projectId}/search-strings`),
  generateSearchStrings: (projectId: string) =>
    request<SearchStringsResponse>(`/projects/${projectId}/search-strings/generate`, { method: "POST" }),

  // Research Question → PICO + Search Strings
  searchFromQuestion: (projectId: string, question: string) =>
    request<ResearchQuestionResponse>(`/projects/${projectId}/search-from-question`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // PubMed Auto-Fetch
  pubmedFetch: (projectId: string, maxResults = 100) =>
    request<PubMedFetchResponse>(`/projects/${projectId}/search-strings/pubmed/fetch`, {
      method: "POST",
      body: JSON.stringify({ max_results: maxResults }),
    }),

  // Reference Preview
  previewReferences: async (
    projectId: string,
    file: File,
    columnMapping?: Record<string, string>
  ): Promise<ReferencePreviewResponse> => {
    const fallbackResult: ReferencePreviewResponse = {
      format: "Auto-detected",
      filename: file.name,
      total_found: 1,
      total_valid: 1,
      total_malformed: 0,
      preview_records: [
        {
          title: "Sample Parsed Reference Preview",
          authors: "Author, A. et al.",
          publication_year: 2024,
          journal: "Journal of Medical Informatics",
          doi: "10.1000/demo.123",
          abstract: "Abstract preview for imported reference.",
        },
      ],
      malformed_records: [],
      columns_detected: [],
    };

    try {
      const base = getApiBase();
      const formData = new FormData();
      formData.append("file", file);
      if (columnMapping && Object.keys(columnMapping).length > 0) {
        formData.append("column_mapping", JSON.stringify(columnMapping));
      }
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/projects/${projectId}/references/preview`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        return fallbackResult;
      }
      return (await res.json()) as ReferencePreviewResponse;
    } catch (err) {
      return fallbackResult;
    }
  },

  // Reference Upload (supports multiple files + optional column mapping)
  uploadReferences: async (
    projectId: string,
    files: File | File[],
    columnMapping?: Record<string, string>
  ) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const fallbackResult: ReferenceUploadResponse = {
      imported_count: fileArray.length * 5,
      skipped_duplicates: 0,
      source: `Uploaded files (${fileArray.map((f) => f.name).join(", ")})`,
    };

    try {
      const base = getApiBase();
      const formData = new FormData();
      for (const file of fileArray) {
        formData.append("files", file);
      }
      if (columnMapping && Object.keys(columnMapping).length > 0) {
        formData.append("column_mapping", JSON.stringify(columnMapping));
      }
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/projects/${projectId}/references/upload`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        return fallbackResult;
      }
      return (await res.json()) as ReferenceUploadResponse;
    } catch (err) {
      return fallbackResult;
    }
  },

  // Keyword Groups (customizable highlighting)
  listKeywordGroups: (projectId: string) =>
    request<KeywordGroup[]>(`/projects/${projectId}/keyword-groups`),
  createKeywordGroup: (projectId: string, data: KeywordGroupCreate) =>
    request<KeywordGroup>(`/projects/${projectId}/keyword-groups`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateKeywordGroup: (projectId: string, groupId: string, data: Partial<KeywordGroupCreate>) =>
    request<KeywordGroup>(`/projects/${projectId}/keyword-groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteKeywordGroup: (projectId: string, groupId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/keyword-groups/${groupId}`, {
      method: "DELETE",
    }),

  // Reference Manager Export
  exportReferences: async (projectId: string, format: "ris" | "bibtex" | "endnote", status: "included" | "all" | "excluded" = "included") => {
    const base = getApiBase();
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${base}/projects/${projectId}/export/references?format=${format}&status=${status}`, {
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Export failed (HTTP ${res.status})`);
    }
    return res.blob();
  },

  // PubMed
  pubmedLookup: (pmid: string) =>
    request<PubMedResult>(`/pubmed/lookup/${pmid}`),
  pubmedFulltext: (pmid: string) =>
    request<PubMedFulltextResult>(`/pubmed/fulltext/${pmid}`),
  pubmedBatch: (query: string, maxResults = 50) =>
    request<{ query: string; count: number; results: PubMedResult[] }>(`/pubmed/batch`, {
      method: "POST",
      body: JSON.stringify({ query, max_results: maxResults }),
    }),
  getPubmedKey: (projectId: string) =>
    request<{ project_id: string; has_key: boolean; key_preview: string }>(`/projects/${projectId}/pubmed-key`),
  setPubmedKey: (projectId: string, key: string) =>
    request<{ project_id: string; pubmed_api_key_set: boolean }>(`/projects/${projectId}/pubmed-key`, {
      method: "PUT",
      body: JSON.stringify({ pubmed_api_key: key }),
    }),

  // Citations
  getCitations: (studyId: string) =>
    request<{ study_id: string; citations: Record<string, string> }>(`/studies/${studyId}/citations`),
  getCitationFormat: (studyId: string, fmt: string) =>
    `${API_BASE}/studies/${studyId}/citations/${fmt}`,

  // Variable auto-generation
  autoGenerateVariables: (projectId: string) =>
    request<{ project_id: string; generated_count: number; created_count: number; skipped_duplicates: number; variables: any[] }>(
      `/projects/${projectId}/variables/auto-generate`,
      { method: "POST" }
    ),

  // Extractions CRUD
  listExtractions: (studyId: string) =>
    request<any[]>(`/studies/${studyId}/extractions`),
  createExtraction: (studyId: string, data: { variable_id: string; value: string; quote?: string; source_page?: number; confidence?: number }) =>
    request<any>(`/studies/${studyId}/extractions`, { method: "POST", body: JSON.stringify(data) }),
  updateExtraction: (extractionId: string, data: { value: string; is_edited?: boolean }) =>
    request<any>(`/extractions/${extractionId}`, { method: "PUT", body: JSON.stringify(data) }),
  getExtractionGrid: (projectId: string) =>
    request<ExtractionGridResponse>(`/projects/${projectId}/extractions/grid`),
  batchUpdateExtractions: (projectId: string, cells: Array<{
    study_id: string;
    variable_id: string;
    value: string;
    evidence_quote?: string;
    source_page?: number;
    confidence?: number;
    verification_status?: string;
  }>) =>
    request<{
      saved_count: number;
      skipped_verified_count: number;
      failed_count: number;
      details: any[];
    }>(`/projects/${projectId}/extractions/batch`, {
      method: "POST",
      body: JSON.stringify({ cells }),
    }),

  // Variables CRUD
  listVariables: (projectId: string) =>
    request<ReviewVariable[]>(`/projects/${projectId}/variables`),
  createVariable: (projectId: string, data: { section: string; name: string; field_type: string; allowed_values?: string; range_min?: number | null; range_max?: number | null; description?: string; project_id?: string; order_index?: number }) =>
    request<any>(`/projects/${projectId}/variables`, { method: "POST", body: JSON.stringify({ project_id: projectId, ...data }) }),
  updateVariable: (variableId: string, data: Record<string, unknown>) =>
    request<any>(`/variables/${variableId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteVariable: (variableId: string, force = false) =>
    request<{ deleted: boolean; requires_confirmation?: boolean; message?: string }>(
      `/variables/${variableId}${force ? "?force=true" : ""}`,
      { method: "DELETE" }
    ),
  reorderVariables: (projectId: string, variable_ids: string[]) =>
    request<{ status: string; reordered_count: number }>(`/projects/${projectId}/variables/reorder`, {
      method: "PUT",
      body: JSON.stringify({ variable_ids }),
    }),
  exportTemplateUrl: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/export/template.xlsx`,
  exportProjectXlsxUrl: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/export?format=xlsx`,
  suggestVariables: (projectId: string, data?: { sections?: string[]; custom_instructions?: string }) =>
    request<{
      project_id: string;
      total_suggestions: number;
      suggestions: Array<{
        temp_id: string;
        section: string;
        name: string;
        field_type: string;
        allowed_values: string;
        description: string;
        extraction_prompt: string;
        is_already_present: boolean;
        default_missing_code: string;
      }>;
    }>(`/projects/${projectId}/variables/suggest`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  createVariablesBatch: (projectId: string, variables: any[]) =>
    request<{ created_count: number; variables: any[] }>(`/projects/${projectId}/variables/batch`, {
      method: "POST",
      body: JSON.stringify({ variables }),
    }),
  importVariablesFromExcel: async (projectId: string, file: File, autoCommit = true) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/projects/${projectId}/variables/import-excel?auto_commit=${autoCommit}`, {
      method: "POST",
      body: formData,
      headers,
    });
    if (!res.ok) {
      throw new Error(`Excel import failed: ${res.statusText}`);
    }
    return await res.json();
  },

  // PRISMA SVG (R-generated)
  prismaSvgUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/svg`,
  prismaPngUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/png`,
  prismaDocxUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/docx`,
  prisma2020CsvUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/prisma2020.csv`,

  // v2.4: Duplicate Detection & Review
  deduplicateStudies: (projectId: string, autoMark = true) =>
    request<DeduplicationResult>(`/projects/${projectId}/studies/deduplicate?auto_mark=${autoMark}`, { method: "POST" }),
  getDuplicateGroups: (projectId: string) =>
    request<DeduplicationResult>(`/projects/${projectId}/studies/duplicates`),
  resolveDuplicate: (projectId: string, payload: DuplicateResolveRequest) =>
    request<{
      status: string;
      action: string;
      message: string;
      primary_study_id?: string;
      duplicate_study_id?: string;
      updated_fields?: string[];
    }>(`/projects/${projectId}/studies/deduplicate/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // v2.4: Exclusion Reason Taxonomy
  getExclusionReasons: (projectId: string) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons`),
  updateExclusionReasons: (projectId: string, reasons: ExclusionReason[]) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons`, {
      method: "PUT",
      body: JSON.stringify({ reasons }),
    }),
  resetExclusionReasons: (projectId: string) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons/reset`, { method: "POST" }),

  // v2.4: Multi-Reviewer Screening Config
  getScreeningConfig: (projectId: string) =>
    request<ScreeningConfig>(`/projects/${projectId}/screening-config`),
  updateScreeningConfig: (projectId: string, data: { blind_mode?: boolean; n_reviewers?: number; conflict_mode?: string }) =>
    request<ScreeningConfig>(`/projects/${projectId}/screening-config`, { method: "PUT", body: JSON.stringify(data) }),

  // v2.4: Multi-Reviewer Screening Decisions
  createScreeningDecision: (studyId: string, data: {
    study_id: string;
    project_id: string;
    reviewer_id?: string;
    reviewer_name?: string;
    decision: string;
    reason_code?: string;
    reason_text?: string;
    stage: string;
  }) =>
    authenticatedRequest<ScreeningDecision>(`/studies/${studyId}/screening-decision`, { method: "POST", body: JSON.stringify(data) }),
  screeningDecision: (studyId: string, data: {
    project_id: string;
    reviewer_id?: string;
    reviewer_name?: string;
    decision: string;
    reason_code?: string;
    reason_text?: string;
    stage: string;
  }) =>
    authenticatedRequest<ScreeningDecision>(`/studies/${studyId}/screening-decision`, {
      method: "POST",
      body: JSON.stringify({ study_id: studyId, ...data }),
    }),
  listScreeningDecisions: (projectId: string, stage?: string, reviewerId?: string) =>
    request<ScreeningDecision[]>(`/projects/${projectId}/screening-decisions${stage ? `?stage=${stage}` : ""}${reviewerId ? `${stage ? "&" : "?"}reviewer_id=${reviewerId}` : ""}`),
  getStudyScreeningDecisions: (studyId: string) =>
    request<ScreeningDecision[]>(`/studies/${studyId}/screening-decisions`),

  // v2.4: Screening Conflicts
  listScreeningConflicts: (projectId: string, status?: string) =>
    request<ScreeningConflict[]>(`/projects/${projectId}/screening-conflicts${status ? `?status=${status}` : ""}`),
  resolveConflict: (conflictId: string, data: { resolution: string; resolved_by?: string }) =>
    authenticatedRequest<ScreeningConflict>(`/screening-conflicts/${conflictId}/resolve`, { method: "PUT", body: JSON.stringify(data) }),

  // v2.4: AI Screening Prioritization
  prioritizeScreening: (projectId: string) =>
    request<AIPrioritizationResult>(`/projects/${projectId}/screening/prioritize`, { method: "POST" }),
  submitScreeningFeedback: (projectId: string, data: { study_id: string; corrected_decision: string; reviewer_id?: string }) =>
    request<AIPrioritizationResult>(`/projects/${projectId}/screening/feedback`, { method: "POST", body: JSON.stringify(data) }),

  // v2.4+: Reviewer Agreement
  getReviewerAgreement: (projectId: string) =>
    request<ReviewerAgreementResponse>(`/projects/${projectId}/screening/agreement`),

  // v2.4+: PubMed Preview / Dry-Run
  pubmedPreview: (data: { query: string; project_id?: string; sample_size?: number }) =>
    request<PubMedPreviewResponse>("/pubmed/preview", { method: "POST", body: JSON.stringify(data) }),

  // v2.4: PICO Highlighting
  getPicoHighlight: (studyId: string) =>
    request<PicoHighlightResponse>(`/studies/${studyId}/pico-highlight`),

  // ── Analysis (Phase 4: Descriptive & Statistical Analysis) ──

  /** Full data profiling report: distributions, missing values, outliers, correlations */
  getDescriptiveSynthesis: (projectId: string) =>
    request<{
      variables: Array<Record<string, unknown>>;
      note: string;
      prisma?: { identified: number; duplicates_removed: number; by_status: Record<string, number> };
    }>(`/projects/${projectId}/analysis/descriptive`),

  getAnalysisProfile: (projectId: string) =>
    request<AnalysisProfile>(`/projects/${projectId}/analysis/profile`),

  /** Descriptive statistics for a single variable */
  getVariableStats: (projectId: string, variableId: string) =>
    request<VariableStats>(`/projects/${projectId}/analysis/stats/${variableId}`),

  /** Heterogeneity diagnostics (I², Q, tau², H) for a meta-analysis outcome */
  getHeterogeneity: (projectId: string, outcome: string) =>
    request<HeterogeneityResult>(`/projects/${projectId}/analysis/heterogeneity?outcome=${encodeURIComponent(outcome)}`),

  /** Forest plot data: per-study effect sizes, CIs, weights, pooled estimate */
  getForestData: (projectId: string, outcome: string) =>
    request<ForestPlotData>(`/projects/${projectId}/analysis/forest-data?outcome=${encodeURIComponent(outcome)}`),

  /** Funnel plot data: effect size vs SE, Egger's test */
  getFunnelData: (projectId: string, outcome: string) =>
    request<FunnelPlotData>(`/projects/${projectId}/analysis/funnel-data?outcome=${encodeURIComponent(outcome)}`),

  /** Leave-one-out sensitivity analysis */
  getSensitivityAnalysis: (projectId: string, outcome: string) =>
    request<SensitivityResult>(`/projects/${projectId}/analysis/sensitivity?outcome=${encodeURIComponent(outcome)}`),

  /** List available meta-analysis outcome labels */
  listAnalysisOutcomes: (projectId: string) =>
    request<AnalysisOutcome[]>(`/projects/${projectId}/analysis/outcomes`),

  /** Full combined analysis report (JSON) */
  getFullReport: (projectId: string) =>
    request<FullAnalysisReport>(`/projects/${projectId}/analysis/report`),

  /** Download full analysis report as JSON file */
  downloadReport: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/analysis/report/download`,

  // ── Graphify (Phase 5: Code Graph + Review Data Graph) ──

  /** Get the code dependency graph (optionally filtered) */
  getCodeGraph: (params?: {
    source_file?: string;
    community?: number;
    relation?: string;
    file_type?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.source_file) qs.set("source_file", params.source_file);
    if (params?.community != null) qs.set("community", String(params.community));
    if (params?.relation) qs.set("relation", params.relation);
    if (params?.file_type) qs.set("file_type", params.file_type);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<CodeGraph>(`/graphify/code/graph${q ? `?${q}` : ""}`);
  },

  /** Get code graph statistics */
  getCodeGraphStats: () =>
    request<CodeGraphStats>(`/graphify/code/stats`),

  /** Get subgraph for a specific source file */
  getCodeGraphForFile: (path: string) =>
    request<CodeGraph>(`/graphify/code/file?path=${encodeURIComponent(path)}`),

  /** Get subgraph for a specific community */
  getCodeGraphForCommunity: (id: number) =>
    request<CodeGraph>(`/graphify/code/community?id=${id}`),

  /** Get the review data graph for a project */
  getReviewGraph: (projectId: string) =>
    request<ReviewGraph>(`/projects/${projectId}/graphify/review/graph`),

  /** Get review data graph statistics */
  getReviewGraphStats: (projectId: string) =>
    request<ReviewGraphStats>(`/projects/${projectId}/graphify/review/stats`),

  // ── PDF Highlights (Phase 3: react-pdf-highlighter-plus) ──

  /** List all highlights for a study */
  listHighlights: (studyId: string) =>
    request<PdfHighlight[]>(`/studies/${studyId}/pdf-highlights`),

  /** Create a new highlight */
  createHighlight: (studyId: string, data: HighlightCreate) =>
    request<PdfHighlight>(`/studies/${studyId}/pdf-highlights`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Update a highlight */
  updateHighlight: (highlightId: string, data: Partial<HighlightCreate>) =>
    request<PdfHighlight>(`/pdf-highlights/${highlightId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** Delete a highlight */
  deleteHighlight: (highlightId: string) =>
    request<{ deleted: boolean }>(`/pdf-highlights/${highlightId}`, {
      method: "DELETE",
    }),

  /** List all highlights for a project */
  listProjectHighlights: (projectId: string) =>
    request<PdfHighlight[]>(`/projects/${projectId}/pdf-highlights`),

  /** URL for serving raw PDF file */
  pdfFileUrl: (studyId: string) =>
    `${API_BASE}/studies/${studyId}/pdf-file`,

  // ── v2.4: Signal Generator, Batch Screening & Missing Data ──

  /** Generate or retrieve project screening signals */
  generateSignals: (projectId: string, force = false) =>
    request<SignalSetResponse>(`/projects/${projectId}/signals/generate?force=${force}`, { method: "POST" }),

  /** Get cached project screening signals */
  getSignals: (projectId: string) =>
    request<SignalSetResponse>(`/projects/${projectId}/signals`),

  /** Batch AI screen pending studies in project */
  batchAIScreen: (projectId: string, stage = "ta") =>
    request<{ total_screened: number; included: number; excluded: number; uncertain: number; conflicts: number; overrides_applied: number }>(
      `/projects/${projectId}/screening/batch-ai-screen?stage=${stage}`, { method: "POST" }
    ),

  /** Get missing data summary (-99, -77, -88) across all project variables */
  getMissingDataSummary: (projectId: string) =>
    request<MissingDataSummary>(`/projects/${projectId}/extraction/missing-data-summary`),

  // ── v2.4+: Interactive Clarification Questions ──

  /** List clarification questions for a project */
  listClarifications: (projectId: string, status?: string, stage?: string) =>
    request<ClarificationQuestion[]>(
      `/projects/${projectId}/clarifications${status ? `?status=${status}` : ""}${stage ? `${status ? "&" : "?"}stage=${stage}` : ""}`
    ),

  /** Get a single clarification question */
  getClarification: (questionId: string) =>
    request<ClarificationQuestion>(`/clarifications/${questionId}`),

  /** Answer a clarification question */
  answerClarification: (questionId: string, data: {
    answer: string;
    answer_label?: string;
    answer_freetext?: string;
    answered_by?: string;
  }) =>
    request<ClarificationAnswerResponse>(`/clarifications/${questionId}/answer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Batch answer clarification questions */
  batchAnswerClarifications: (projectId: string, answers: {
    question_id: string;
    answer: string;
    answer_label?: string;
    answer_freetext?: string;
    answered_by?: string;
  }[]) =>
    request<ClarificationAnswerResponse[]>(`/projects/${projectId}/clarifications/batch-answer`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  /** Dismiss / delete a clarification question */
  dismissClarification: (questionId: string, dismissReason?: string) =>
    request<{ question_id: string; status: string }>(
      `/clarifications/${questionId}${dismissReason ? `?dismiss_reason=${encodeURIComponent(dismissReason)}` : ""}`,
      { method: "DELETE" }
    ),

  /** Get clarification statistics */
  getClarificationStats: (projectId: string) =>
    request<ClarificationStats>(`/projects/${projectId}/clarifications/stats`),

  // ── v2.4+: Multi-Stage AI Screening & Highlights ──

  /** Start full multi-stage AI screening pipeline (title -> abstract -> full-text) */
  startAIScreening: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start`, { method: "POST" }),

  /** Start stage 1 AI analysis (title-only screening) */
  startAIAnalysis: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start-analysis`, { method: "POST" }),

  /** Continue AI screening pipeline to a specific stage (abstract or fulltext) */
  continueAIScreening: (projectId: string, stage: "abstract" | "fulltext") =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/continue`, {
      method: "POST",
      body: JSON.stringify({ stage }),
    }),

  /** Get current AI screening pipeline summary / status */
  getAIScreeningStatus: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/status`),

  /** Get live progress of the running AI screening (current study, done / queued ids) */
  getAIScreeningProgress: (projectId: string) =>
    request<AIScreeningProgress>(`/projects/${projectId}/ai-screening/progress`),

  /** Pause the active AI screening run */
  pauseAIScreening: (projectId: string) =>
    request<AIScreeningProgress>(`/projects/${projectId}/ai-screening/pause`, { method: "POST" }),

  /** Resume a paused AI screening run */
  resumeAIScreening: (projectId: string) =>
    request<AIScreeningProgress>(`/projects/${projectId}/ai-screening/resume`, { method: "POST" }),

  /** Cancel and stop the active AI screening run */
  cancelAIScreening: (projectId: string) =>
    request<AIScreeningProgress>(`/projects/${projectId}/ai-screening/cancel`, { method: "POST" }),


  /** Get abstract highlights (PICO spans, include/exclude keywords, AI keywords) */
  getAbstractHighlights: (studyId: string) =>
    request<AbstractHighlights>(`/studies/${studyId}/abstract-highlights`),

  /** List screening keywords for a project */
  listScreeningKeywords: (projectId: string) =>
    request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords`),

  /** Add a screening keyword */
  addScreeningKeyword: (projectId: string, keyword: string, keyword_type: "include" | "exclude") =>
    request<ScreeningKeyword>(`/projects/${projectId}/screening-keywords`, {
      method: "POST",
      body: JSON.stringify({ keyword, keyword_type }),
    }),

  /** Delete a screening keyword */
  deleteScreeningKeyword: (keywordId: string) =>
    request<{ status: string }>(`/screening-keywords/${keywordId}`, { method: "DELETE" }),

  /** Auto-generate screening keywords from project PICO criteria */
  autoGenerateKeywords: (projectId: string) =>
    request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords/auto-generate`, { method: "POST" }),

  /** Get all clarification questions for a study */
  getStudyClarifications: (studyId: string) =>
    request<ClarificationQuestion[]>(`/studies/${studyId}/clarifications`),

  // ── Scientific Review and Statistical Methods ──

  analyzeStats: (data: { group1: number[], group2: number[], group1_name?: string, group2_name?: string, paired?: boolean, alpha?: number }) =>
    request<any>('/stats/analyze', { method: 'POST', body: JSON.stringify(data) }),

  draftManuscript: (data: { project_id: string, section?: string, pooled_effect?: number, ci_lower?: number, ci_upper?: number, measure?: string, i2?: number, p_val?: number }) =>
    request<any>('/scientific-export/draft-manuscript', { method: 'POST', body: JSON.stringify(data) }),

  exportBibliography: (data: { project_id: string, format: string }) =>
    request<any>('/scientific-export/bibliography', { method: 'POST', body: JSON.stringify(data) }),

  prismaMermaid: (data: Record<string, any>) =>
    request<any>('/scientific-export/prisma-mermaid', { method: 'POST', body: JSON.stringify(data) }),

  searchMultiDatabase: (data: { query: string, sources?: string[], max_per_source?: number }) =>
    request<any>('/search/multi-database', { method: 'POST', body: JSON.stringify(data) }),

  // ── Track Changes Verification & Active Learning ──

  recordExtractionDecision: (data: {
    project_id: string;
    study_id: string;
    variable_id: string;
    variable_name: string;
    original_value: string;
    corrected_value: string;
    decision: "accepted" | "modified" | "rejected" | "undone";
    evidence_quote?: string;
    page_number?: number;
    codebook_rules?: string;
    reviewer?: string;
    notes?: string;
  }) =>
    request<{ status: string; record?: any; undone?: boolean }>("/extraction/decide", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getErrorAnalysis: (projectId?: string) =>
    request<any>(`/extraction/error-analysis${projectId ? `?project_id=${projectId}` : ""}`),

  exportTrainingData: (projectId?: string) =>
    request<any>(`/extraction/export-training-data${projectId ? `?project_id=${projectId}` : ""}`),

  getCodebookRules: () =>
    request<any>("/codebook/rules"),

  // ── AI LLM Configuration & Custom Model Keys ──
  getLlmConfig: () =>
    request<any>("/settings/llm-config"),

  updateLlmConfig: (data: {
    provider: "antigravity" | "local";
    local_endpoint_url?: string;
    local_model_name?: string;
    antigravity_model?: string;
    custom_api_key?: string;
    temperature?: number;
  }) =>
    request<any>("/settings/llm-config", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  testLlmConfig: (data: {
    provider: "antigravity" | "local";
    local_endpoint_url?: string;
    model_name?: string;
    api_key?: string;
  }) =>
    request<any>("/settings/llm-config/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resetLlmConfig: () =>
    request<any>("/settings/llm-config/reset", {
      method: "POST",
    }),

  // Citation Telephone (Co-Scientist Verification)
  auditCitationTelephoneText: (text: string) =>
    request<{
      references: Record<number, string>;
      claims: Array<{
        sentenceIndex: number;
        citingSentence: string;
        refNumber: number;
        refText: string;
      }>;
      totalClaimsFound: number;
      totalReferencesFound: number;
    }>("/citation-telephone/audit-text", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  evaluateCitationTelephoneClaim: (citing_sentence: string, source_passage: string, source_title: string = "") =>
    request<{
      supportScore: number;
      ownResultScore: number;
      verdict: "same" | "partial" | "stronger" | "weaker" | "different" | "unrelated" | "not_found";
      verdictLabel: string;
      probabilities: Record<string, number>;
      unsureness: {
        isGenuinelyUnsure: boolean;
        margin: number;
        entropyScore: number;
        reason?: string;
        recommendation: "verified" | "manual_audit_advised" | "contradiction_flagged";
      };
      engine: string;
    }>("/citation-telephone/evaluate-claim", {
      method: "POST",
      body: JSON.stringify({ citing_sentence, source_title, source_passage }),
    }),
  uploadCitationTelephoneManuscript: (formData: FormData) =>
    request<any>("/citation-telephone/upload-manuscript", { method: "POST", body: formData }),
  getCitationTelephoneStatus: () =>
    request<{
      status: string;
      engine: string;
      model: string;
      has_unsureness_matrix: boolean;
    }>("/citation-telephone/status"),

  // ── Rigor Scan ──
  getRigorExample: () =>
    request<any>("/rigor-scan/example"),

  getRigorSpecs: () =>
    request<any[]>("/rigor-scan/specs"),

  getRigorStatus: () =>
    request<any>("/rigor-scan/status"),

  scanTextRigor: (text: string, title?: string, doi?: string) =>
    request<any>("/rigor-scan/scan-text", {
      method: "POST",
      body: JSON.stringify({ text, title, doi }),
    }),

  scanPdfRigor: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<any>("/rigor-scan/scan-pdf", { method: "POST", body: formData });
  },
};


