"""Pydantic models for request/response validation.

Covers projects, studies, variables, extractions, users, and the
full risk-of-bias assessment hierarchy (assessments → domain judgments →
signaling answers).
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


# ── Mixin for ORM-compatible models ──

class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ═══════════════════════════════════════════════════════════════════════
#  Projects
# ═══════════════════════════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    hypothesis: str = ""
    research_question: str = ""
    pico_json: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    hypothesis: Optional[str] = None
    research_question: Optional[str] = None
    pico_json: Optional[str] = None
    status: Optional[str] = None


class ProjectResponse(ORMBase):
    project_id: str
    name: str
    description: str = ""
    pico_json: str = ""
    hypothesis: str = ""
    research_question: str = ""
    secondary_hypotheses_json: str = "[]"
    pubmed_api_key: str = ""
    inclusion_criteria_json: str = "[]"
    exclusion_criteria_json: str = "[]"
    search_strings_json: str = "{}"
    config_path: str = ""
    created_at: str = ""
    created_by: str = ""
    status: str = "active"


# ── PICO ──

class PICOUpdate(BaseModel):
    population: str = ""
    index_test: str = ""
    comparator: str = ""
    outcome: str = ""
    study_design: str = ""


class PICOResponse(BaseModel):
    project_id: str
    population: str = ""
    index_test: str = ""
    comparator: str = ""
    outcome: str = ""
    study_design: str = ""
    is_defined: bool = False


# ── Hypothesis ──

class SecondaryHypothesis(BaseModel):
    text: str
    type: str = "alternative"  # null | alternative
    status: str = "pending"  # pending | confirmed | rejected


class HypothesisUpdate(BaseModel):
    hypothesis: str = ""
    research_question: str = ""
    secondary_hypotheses: list[SecondaryHypothesis] = Field(default_factory=list)


class HypothesisResponse(BaseModel):
    project_id: str
    hypothesis: str = ""
    research_question: str = ""
    secondary_hypotheses: list[SecondaryHypothesis] = Field(default_factory=list)


# ── PubMed API Key ──

class PubMedKeyUpdate(BaseModel):
    pubmed_api_key: str


# ── Inclusion/Exclusion Criteria ──

class Criterion(BaseModel):
    id: str
    text: str


class CriteriaUpdate(BaseModel):
    inclusion: list[Criterion] = Field(default_factory=list)
    exclusion: list[Criterion] = Field(default_factory=list)


class CriteriaResponse(BaseModel):
    project_id: str
    inclusion: list[Criterion] = Field(default_factory=list)
    exclusion: list[Criterion] = Field(default_factory=list)


# ── Search Strings ──

class SearchStringsResponse(BaseModel):
    project_id: str
    strings: dict = {}


class ResearchQuestionRequest(BaseModel):
    question: str


class ResearchQuestionResponse(BaseModel):
    project_id: str
    pico: dict
    strings: dict = {}


# ── PICO Extraction ──

class PicoExtractionResponse(BaseModel):
    population: str = ""
    index_test: str = ""
    comparator: str = ""
    outcome: str = ""
    study_design: str = ""
    research_question: str = ""
    hypothesis: str = ""
    extraction_confidence: str = "medium"
    inclusion: list[str] = []
    exclusion: list[str] = []
    search_strings: dict = {}
    variables: list[dict] = []


# ── PubMed Fetch ──

class PubMedFetchRequest(BaseModel):
    max_results: int = 10000
    mindate: str = ""
    maxdate: str = ""


class PubMedFetchResponse(BaseModel):
    query: str
    imported_count: int
    skipped_duplicates: int
    total_found: int


class OpenAlexFetchRequest(BaseModel):
    max_results: int = 500
    mindate: str = "1960-01-01"
    maxdate: str = "2026-08-31"


# ── Reference Upload ──

class MalformedRecordDetail(BaseModel):
    index: Optional[int] = None
    reason: str
    snippet: Optional[str] = None

class ReferenceUploadResponse(BaseModel):
    imported_count: int
    skipped_duplicates: int
    source: str
    format: Optional[str] = None
    errors: list[str] = []
    malformed_records: list[MalformedRecordDetail] = []

class ReferencePreviewResponse(BaseModel):
    format: str
    filename: str
    total_found: int
    total_valid: int
    total_malformed: int
    preview_records: list[dict] = []
    malformed_records: list[MalformedRecordDetail] = []
    columns_detected: list[str] = []



# ── Keyword Groups (customizable highlighting) ──

class KeywordGroupCreate(BaseModel):
    name: str
    color: str = "#ffd700"
    keywords: list[str] = []

class KeywordGroupUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    keywords: Optional[list[str]] = None

class KeywordGroupResponse(BaseModel):
    group_id: str
    project_id: str
    name: str
    color: str
    keywords: list[str] = []
    created_at: str = ""
    updated_at: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  Studies
# ═══════════════════════════════════════════════════════════════════════

class StudyCreate(BaseModel):
    project_id: str
    title: str
    authors: str = ""
    publication_year: Optional[int] = None
    journal: str = ""
    doi: str = ""
    pmid: str = ""
    abstract: str = ""
    source: str = ""
    study_design: str = ""
    metadata_json: str = ""


class StudyUpdate(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    journal: Optional[str] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    study_design: Optional[str] = None
    screening_status: Optional[str] = None
    screening_reason: Optional[str] = None
    screening_stage: Optional[str] = None
    extraction_status: Optional[str] = None
    pdf_status: Optional[str] = None
    metadata_json: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_decision: Optional[str] = None
    ai_reason: Optional[str] = None
    ai_reason_code: Optional[str] = None
    ai_screened_at: Optional[str] = None
    ai_stage: Optional[str] = None


class StudyResponse(ORMBase):
    study_id: str
    project_id: str
    title: str
    authors: str = ""
    publication_year: Optional[int] = None
    journal: str = ""
    doi: str = ""
    pmid: str = ""
    abstract: str = ""
    source: str = ""
    study_design: str = ""
    pdf_path: str = ""
    pdf_status: str = "none"
    screening_status: str = "pending"
    screening_reason: str = ""
    screening_stage: str = ""
    extraction_status: str = "pending"
    metadata_json: str = ""
    ai_confidence: Optional[float] = 0.0
    ai_decision: Optional[str] = ""
    ai_reason: Optional[str] = ""
    ai_reason_code: Optional[str] = ""
    ai_screened_at: Optional[str] = ""
    ai_stage: Optional[str] = ""
    created_at: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  Variables
# ═══════════════════════════════════════════════════════════════════════

class VariableCreate(BaseModel):
    project_id: Optional[str] = None
    section: str = "Cohort_Level"
    name: str
    field_type: str = "free_text"
    allowed_values: str = ""
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    description: str = ""
    order_index: int = 0
    is_base: bool = False


class VariableUpdate(BaseModel):
    section: Optional[str] = None
    name: Optional[str] = None
    field_type: Optional[str] = None
    allowed_values: Optional[str] = None
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    description: Optional[str] = None
    order_index: Optional[int] = None


class VariableResponse(ORMBase):
    variable_id: str
    project_id: str
    section: str
    name: str
    field_type: str
    allowed_values: str = ""
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    description: str = ""
    order_index: int = 0
    is_base: int = 1
    created_at: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  Extractions
# ═══════════════════════════════════════════════════════════════════════

class ExtractionCreate(BaseModel):
    study_id: str
    variable_id: str
    value: str = ""
    confidence: float = 0.0
    confidence_tag: str = ""
    source_page: Optional[int] = None
    source_bbox: str = ""
    source_text: str = ""
    extracted_by: str = ""


class ExtractionUpdate(BaseModel):
    value: Optional[str] = None
    confidence: Optional[float] = None
    confidence_tag: Optional[str] = None
    source_page: Optional[int] = None
    source_text: Optional[str] = None
    is_edited: Optional[bool] = None
    edited_by: Optional[str] = None
    reason: Optional[str] = None


class ExtractionResponse(ORMBase):
    extraction_id: str
    study_id: str
    variable_id: str
    value: str = ""
    confidence: float = 0.0
    confidence_tag: str = ""
    source_page: Optional[int] = None
    source_bbox: str = ""
    source_text: str = ""
    extracted_by: str = ""
    extracted_at: str = ""
    is_edited: int = 0
    edited_by: str = ""
    edited_at: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  Users / Auth
# ═══════════════════════════════════════════════════════════════════════

class UserCreate(BaseModel):
    username: str
    password: str
    email: str = ""
    role: str = "reviewer"


class UserResponse(ORMBase):
    user_id: str
    username: str
    email: str = ""
    role: str = "reviewer"
    created_at: str = ""


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str
    refresh_token: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class SessionResponse(BaseModel):
    session_id: str
    ip_address: str = ""
    user_agent: str = ""
    created_at: str = ""
    last_active: str = ""
    expires_at: str = ""


class ProjectMemberResponse(BaseModel):
    user_id: str
    username: str = ""
    email: str = ""
    role: str = "reviewer"
    joined_at: str = ""


class ProjectMemberInvite(BaseModel):
    username: str
    role: str = "reviewer"  # owner | editor | reviewer | viewer


class ProjectMemberUpdate(BaseModel):
    role: str  # owner | editor | reviewer | viewer


# ═══════════════════════════════════════════════════════════════════════
#  Risk-of-Bias
# ═══════════════════════════════════════════════════════════════════════

class RobToolDomainSchema(BaseModel):
    key: str
    label: str
    has_applicability: bool
    signaling_questions: list[dict[str, Any]]


class RobToolResponse(BaseModel):
    key: str
    name: str
    full_name: str
    description: str
    study_designs: list[str]
    judgment_options: list[str]
    has_overall: bool
    domains: list[RobToolDomainSchema]


class RobAssessmentCreate(BaseModel):
    study_id: str
    project_id: str
    tool: str
    outcome_label: str = ""


class RobSignalingAnswerResponse(ORMBase):
    answer_id: str
    judgment_id: str
    question_key: str
    question_text: str
    answer: str = ""
    ai_answer: str = ""
    ai_quote: str = ""
    ai_page: Optional[int] = None
    ai_confidence: float = 0.0
    human_verified: int = 0
    needs_human_review: int = 0
    reviewed_by: str = ""
    reviewed_at: str = ""


class RobSignalingAnswerUpdate(BaseModel):
    answer: Optional[str] = None
    human_verified: Optional[bool] = None
    needs_human_review: Optional[bool] = None
    reviewed_by: Optional[str] = None


class RobDomainJudgmentResponse(ORMBase):
    judgment_id: str
    assessment_id: str
    domain_key: str
    domain_label: str
    risk_judgment: str = ""
    applicability: str = ""
    support_text: str = ""
    ai_suggested: str = ""
    ai_support: str = ""
    ai_confidence: float = 0.0
    human_verified: int = 0
    verified_by: str = ""
    verified_at: str = ""
    signaling_answers: list[RobSignalingAnswerResponse] = Field(default_factory=list)


class RobDomainJudgmentUpdate(BaseModel):
    risk_judgment: Optional[str] = None
    applicability: Optional[str] = None
    support_text: Optional[str] = None
    human_verified: Optional[bool] = None


class RobAssessmentResponse(ORMBase):
    assessment_id: str
    study_id: str
    project_id: str
    tool: str
    outcome_label: str = ""
    overall_judgment: str = "pending"
    overall_risk: str = ""
    assessed_by: str = ""
    assessed_at: str = ""
    ai_prefilled: int = 0
    ai_prefilled_at: str = ""
    run_id: str = ""
    auto_selected: int = 0


class RobAssessmentDetail(RobAssessmentResponse):
    """Full assessment with all domain judgments and signaling answers."""
    domain_judgments: list[RobDomainJudgmentResponse] = Field(default_factory=list)
    tool_definition: Optional[dict[str, Any]] = None


class RobAIPrefillRequest(BaseModel):
    """Request AI pre-fill for an assessment."""
    full_text: Optional[str] = None  # full text of the study (from PDF processing)
    abstract: Optional[str] = None   # fallback if no full text
    model_fn_name: str = "mock"      # which model_fn to use


class RobAIPrefillResult(BaseModel):
    """Result of AI pre-fill operation."""
    assessment_id: str
    domains_prefilled: int
    questions_prefilled: int
    avg_confidence: float
    used_full_text: bool
    warnings: list[str] = Field(default_factory=list)


class RobProjectSummary(BaseModel):
    """Summary of RoB assessments across a project for traffic-light chart."""
    project_id: str
    tool: str
    total_assessments: int
    judgment_counts: dict[str, int]
    assessments: list[dict[str, Any]]
    pending_human_review_count: int = 0
    assessments_needing_review_count: int = 0
    tool_groups: dict[str, Any] = Field(default_factory=dict)
    manual_review: list[dict[str, Any]] = Field(default_factory=list)


class ProjectSettingsUpdate(BaseModel):
    auto_rob_enabled: Optional[bool] = None
    rob_confidence_threshold: Optional[float] = None


class ProjectSettingsResponse(BaseModel):
    auto_rob_enabled: bool = True
    rob_confidence_threshold: float = 0.7


class RobRunProgressResponse(BaseModel):
    run_id: Optional[str] = None
    active: bool = False
    stage: str = "rob"
    total: int = 0
    completed: int = 0
    current_study_id: Optional[str] = None
    done_ids: list[str] = Field(default_factory=list)
    pending_ids: list[str] = Field(default_factory=list)


class RobExportRequest(BaseModel):
    project_id: str
    format: str = "csv"  # "csv", "xlsx", or complete "zip" package


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Duplicate Detection
# ═══════════════════════════════════════════════════════════════════════

class DuplicateMatch(BaseModel):
    study_id: str
    title: str
    doi: str = ""
    pmid: str = ""
    authors: str = ""
    publication_year: Optional[int] = None
    journal: str = ""
    abstract: str = ""
    is_duplicate: int = 0
    screening_status: str = "pending"
    match_reason: str  # "doi" | "pmid" | "title_similarity" | "author_year"
    similarity_score: float = 0.0


class DuplicateGroup(BaseModel):
    group_id: str
    canonical_study_id: str  # the primary one
    canonical_title: str
    canonical_doi: str = ""
    canonical_pmid: str = ""
    canonical_authors: str = ""
    canonical_year: Optional[int] = None
    canonical_journal: str = ""
    canonical_abstract: str = ""
    canonical_is_duplicate: int = 0
    canonical_screening_status: str = "pending"
    duplicates: list[DuplicateMatch] = Field(default_factory=list)


class DeduplicationResult(BaseModel):
    project_id: str
    total_studies: int
    duplicate_groups: list[DuplicateGroup] = Field(default_factory=list)
    total_duplicates: int
    duplicates_marked: int


class DuplicateResolveRequest(BaseModel):
    action: str  # "keep_primary" | "keep_both" | "merge_metadata" | "revert_duplicate"
    primary_study_id: str
    duplicate_study_id: Optional[str] = None
    group_id: Optional[str] = None
    merged_fields: Optional[dict] = None



# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Exclusion Reason Taxonomy
# ═══════════════════════════════════════════════════════════════════════

class ExclusionReason(BaseModel):
    code: str          # e.g. "wrong_population"
    label: str         # e.g. "Wrong population"
    is_custom: bool = False


class ExclusionReasonsUpdate(BaseModel):
    reasons: list[ExclusionReason] = Field(default_factory=list)


class ExclusionReasonsResponse(BaseModel):
    project_id: str
    reasons: list[ExclusionReason] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Multi-Reviewer Screening
# ═══════════════════════════════════════════════════════════════════════

class ScreeningConfig(BaseModel):
    blind_mode: bool = True
    n_reviewers: int = 2
    conflict_mode: str = "manual"  # "manual" | "auto_majority"


class ScreeningConfigUpdate(BaseModel):
    blind_mode: Optional[bool] = None
    n_reviewers: Optional[int] = None
    conflict_mode: Optional[str] = None


class ScreeningConfigResponse(BaseModel):
    project_id: str
    blind_mode: bool = True
    n_reviewers: int = 2
    conflict_mode: str = "manual"


class ScreeningUpdate(BaseModel):
    status: str  # pending, included, excluded
    stage: str   # ta, ft
    reason: str = ""


class ScreeningDecisionCreate(BaseModel):
    study_id: str
    project_id: str
    reviewer_id: str = ""  # Legacy input ignored; authentication owns identity.
    reviewer_name: str = ""
    decision: str  # included | excluded | maybe
    reason_code: str = ""
    reason_text: str = ""
    stage: Literal["ta", "ft"]


class ScreeningDecisionResponse(ORMBase):
    decision_id: str
    study_id: str
    project_id: str
    reviewer_id: str
    reviewer_name: str = ""
    decision: str
    reason_code: str = ""
    reason_text: str = ""
    stage: str
    is_blinded: int = 1
    created_at: str = ""


class ScreeningConflictResponse(ORMBase):
    conflict_id: str
    study_id: str
    project_id: str
    stage: str
    reviewer1_id: str = ""
    reviewer1_decision: str = ""
    reviewer2_id: str = ""
    reviewer2_decision: str = ""
    resolution: str = ""
    resolved_by: str = ""
    resolved_at: str = ""
    status: str = "unresolved"
    created_at: str = ""
    study_title: str = ""


class ConflictResolveRequest(BaseModel):
    resolution: str  # included | excluded | maybe
    resolved_by: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: AI Screening Prioritization
# ═══════════════════════════════════════════════════════════════════════

class AIPrioritizationResult(BaseModel):
    project_id: str
    model_trained: bool
    n_training_samples: int
    n_pending: int
    prioritized_studies: list[dict[str, Any]] = Field(default_factory=list)
    message: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: PICO Highlighting
# ═══════════════════════════════════════════════════════════════════════

class PicoHighlightSpan(BaseModel):
    field: str  # population | index_test | comparator | outcome
    start: int
    end: int
    text: str
    confidence: float = 0.0
    color: str = ""  # purple | blue | orange


class PicoHighlightResponse(BaseModel):
    study_id: str
    abstract: str
    spans: list[PicoHighlightSpan] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4+: Active Learning Feedback & Agreement
# ═══════════════════════════════════════════════════════════════════════

class ActiveLearningFeedbackRequest(BaseModel):
    study_id: str
    corrected_decision: str  # included | excluded
    reviewer_id: str = ""


class ReviewerAgreementResponse(BaseModel):
    project_id: str
    cohen_kappa: float = 0.0
    percentage_agreement: float = 0.0
    concordant_includes: int = 0
    concordant_excludes: int = 0
    conflicts_count: int = 0
    total_dual_screened: int = 0
    interpretation: str = "insufficient_data"  # poor | moderate | strong | almost_perfect | insufficient_data
    pairwise_reviewers: list[dict[str, Any]] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Screening & Extraction Quality Gap Models
# ═══════════════════════════════════════════════════════════════════════

class SignalSet(BaseModel):
    population_signals: list[str] = Field(default_factory=list)
    intervention_signals: list[str] = Field(default_factory=list)
    study_type_signals: list[str] = Field(default_factory=list)
    hard_exclude_signals: list[str] = Field(default_factory=list)
    lenient_outcome_signals: list[str] = Field(default_factory=list)
    strict_outcome_signals: list[str] = Field(default_factory=list)


class SignalSetResponse(BaseModel):
    project_id: str
    signals: SignalSet
    generated_at: str = ""
    source: str = ""  # "hybrid" | "mesh_only_fallback"


class AiScreenResult(BaseModel):
    study_id: str
    recommendation: str  # included | excluded | uncertain | needs_clarification
    confidence: float
    reason_code: str = ""
    reason_text: str = ""
    rationale: str = ""
    quotes: list[str] = Field(default_factory=list)
    prefilter_flag: str = "clear"
    confidence_ceiling: float = 1.0
    override_notes: list[str] = Field(default_factory=list)
    conflict_detected: bool = False
    human_decision: Optional[str] = None
    reviewer_id: str = "ai_reviewer"
    suggestion: Optional[str] = None  # alias for recommendation
    reason: Optional[str] = None  # alias for reason_text
    clarification: Optional[ClarificationData] = None


class MissingDataSummary(BaseModel):
    project_id: str
    total_extractions: int
    not_reported: int  # -99 count
    not_applicable: int  # -77 count
    unable_to_extract: int  # -88 count
    per_variable: list[dict[str, Any]] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Mid-Pipeline Clarification Questions Models
# ═══════════════════════════════════════════════════════════════════════

class ClarificationOption(BaseModel):
    value: str
    label: str


class ClarificationData(BaseModel):
    question_type: str  # study_design | population_match | intervention_match | outcome_match
    pico_aspect: str
    question_text: str
    options: list[ClarificationOption] = Field(default_factory=list)
    context_excerpt: str = ""
    interim_decision: str = "uncertain"
    interim_reason: str = ""


class ClarificationQuestionResponse(BaseModel):
    question_id: str
    study_id: str
    project_id: str
    stage: str
    question_type: str
    pico_aspect: str = ""
    question_text: str
    options: list[ClarificationOption] = Field(default_factory=list)
    context_excerpt: str = ""
    ai_interim_decision: str = ""
    ai_interim_reason: str = ""
    status: str = "pending"
    answer: str = ""
    answer_label: str = ""
    answer_freetext: str = ""
    answered_by: str = ""
    answered_at: str = ""
    final_decision: str = ""
    final_confidence: float = 0.0
    final_reason_text: str = ""
    created_at: str = ""
    # Joined study fields
    study_title: str = ""
    study_authors: str = ""
    study_abstract: str = ""


class ClarificationAnswerRequest(BaseModel):
    answer: str
    answer_label: str = ""
    answer_freetext: str = ""
    answered_by: str = ""


class ClarificationAnswerResponse(BaseModel):
    question_id: str
    study_id: str
    status: str
    final_decision: str
    final_confidence: float
    final_reason_text: str
    conflict_detected: bool = False
    human_decision: Optional[str] = None


class ClarificationStatsResponse(BaseModel):
    project_id: str
    pending: int
    answered: int
    expired: int
    by_type: dict[str, int] = Field(default_factory=dict)
    by_stage: dict[str, int] = Field(default_factory=dict)


class BatchClarificationItem(BaseModel):
    question_id: str
    answer: str
    answer_label: str = ""
    answer_freetext: str = ""


class BatchClarificationAnswerRequest(BaseModel):
    answers: list[BatchClarificationItem]
    answered_by: str = ""


# ═══════════════════════════════════════════════════════════════════════
#  v2.4: Multi-Stage AI Screening & Highlighting Models
# ═══════════════════════════════════════════════════════════════════════

class AIScreeningStartRequest(BaseModel):
    stage: str = "all"  # "title" | "abstract" | "fulltext" | "all"


class AIScreeningSummary(BaseModel):
    total: int = 0
    title_screened: int = 0
    abstract_screened: int = 0
    fulltext_screened: int = 0
    included: int = 0
    excluded: int = 0
    uncertain: int = 0
    awaiting_clarification: int = 0
    awaiting_pdf: int = 0


class ContinueScreeningRequest(BaseModel):
    stage: str  # "abstract" | "fulltext"


class HighlightSpan(BaseModel):
    start: int
    end: int
    text: str
    type: str  # population | intervention | comparator | outcome | include_keyword | exclude_keyword
    color: str  # purple | blue | orange | green | red
    confidence: float = 1.0
    label: str = ""


class AbstractHighlightsResponse(BaseModel):
    study_id: str
    abstract: str
    all_spans: list[HighlightSpan] = Field(default_factory=list)
    pico_spans: list[HighlightSpan] = Field(default_factory=list)
    keyword_spans: list[HighlightSpan] = Field(default_factory=list)
    ai_keyword_spans: list[HighlightSpan] = Field(default_factory=list)
    title_spans: list[HighlightSpan] = Field(default_factory=list)



class ScreeningKeywordCreate(BaseModel):
    keyword: str
    keyword_type: str  # include | exclude


class ScreeningKeywordResponse(BaseModel):
    keyword_id: str
    project_id: str
    keyword: str
    keyword_type: str
    color: str


