"""SQLite database connection, schema initialization, and migrations.

Extends the original RadExtract schema with:
  - Risk-of-bias tables: rob_assessments, rob_domain_judgments, rob_signaling_answers
  - PDF processing: pdf_documents
  - Meta-analysis: meta_analyses, meta_analysis_studies
  - GRADE certainty: grade_assessments, grade_factors
  - Dual-reviewer columns on extractions and rob_assessments (via migration)
"""
from __future__ import annotations
import os
import atexit
import shutil
import sqlite3
import logging
from pathlib import Path
from typing import Generator, Union
from config import settings, ensure_dirs
from services.db_backend import DBBackend, SQLiteBackend, get_db_backend, init_dynamodb_tables

logger = logging.getLogger("radextract.database")

_ORIGINAL_PERSISTENT_DB_PATH: str | None = None
_SCRATCH_STAGED: bool = False


def stage_db_to_scratch(scratch_dir: str | None = None) -> str:
    """Stage radextract.db from academic NFS onto fast node-local scratch storage (/tmp or $TMPDIR).
    Eliminates SQLite 'database is locked' errors under multi-worker concurrent loads.
    """
    global _ORIGINAL_PERSISTENT_DB_PATH, _SCRATCH_STAGED
    if _SCRATCH_STAGED:
        return settings.db_path

    persistent_path = Path(settings.db_path).resolve()
    target_dir = Path(scratch_dir or os.environ.get("TMPDIR") or "/tmp")
    target_dir.mkdir(parents=True, exist_ok=True)
    scratch_path = (target_dir / "radextract.db").resolve()

    # Do not stage if already in scratch directory
    if persistent_path == scratch_path or str(persistent_path).startswith(str(target_dir)):
        _SCRATCH_STAGED = True
        return str(persistent_path)

    _ORIGINAL_PERSISTENT_DB_PATH = str(persistent_path)

    # If persistent DB exists, copy over to node-local scratch
    if persistent_path.exists():
        if not scratch_path.exists() or persistent_path.stat().st_mtime > scratch_path.stat().st_mtime:
            shutil.copy2(persistent_path, scratch_path)
            for ext in ("-wal", "-shm"):
                src = Path(f"{persistent_path}{ext}")
                dst = Path(f"{scratch_path}{ext}")
                if src.exists():
                    shutil.copy2(src, dst)
            logger.info(f"Staged persistent DB {persistent_path} to local scratch {scratch_path}")

    settings.db_path = str(scratch_path)
    _SCRATCH_STAGED = True

    atexit.register(sync_scratch_to_persistent)
    return str(scratch_path)


def sync_scratch_to_persistent():
    """Checkpoint WAL and sync node-local scratch DB back to persistent NFS storage on exit."""
    global _ORIGINAL_PERSISTENT_DB_PATH, _SCRATCH_STAGED
    if not _SCRATCH_STAGED or not _ORIGINAL_PERSISTENT_DB_PATH:
        return
    scratch_path = Path(settings.db_path)
    persistent_path = Path(_ORIGINAL_PERSISTENT_DB_PATH)

    if scratch_path.exists():
        try:
            conn = sqlite3.connect(str(scratch_path), timeout=30.0)
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.close()
        except Exception as e:
            logger.warning(f"WAL checkpoint before sync warning: {e}")

        try:
            persistent_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(scratch_path, persistent_path)
            for ext in ("-wal", "-shm"):
                src_ext = Path(f"{scratch_path}{ext}")
                dst_ext = Path(f"{persistent_path}{ext}")
                if src_ext.exists():
                    try:
                        shutil.copy2(src_ext, dst_ext)
                    except Exception:
                        pass
            logger.info(f"Successfully synced scratch DB {scratch_path} back to persistent {persistent_path}")
        except Exception as e:
            logger.error(f"Failed to sync scratch DB to {persistent_path}: {e}")


SCHEMA_SQL = """
-- Record collaboration. CREATE IF NOT EXISTS also upgrades existing databases.
CREATE TABLE IF NOT EXISTS record_annotations (
    annotation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    study_id TEXT NOT NULL REFERENCES studies(study_id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    text TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('shared', 'private')),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_record_annotations_study ON record_annotations(study_id, visibility, author_id);
CREATE TABLE IF NOT EXISTS project_tags (
    tag_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, normalized_name)
);
CREATE TABLE IF NOT EXISTS study_tag_links (
    link_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    study_id TEXT NOT NULL REFERENCES studies(study_id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES project_tags(tag_id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (study_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_study_tag_links_project ON study_tag_links(project_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_study_tag_links_study ON study_tag_links(study_id);
-- ── Existing tables (migrated from Streamlit app) ──

CREATE TABLE IF NOT EXISTS projects (
    project_id        TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    description       TEXT DEFAULT '',
    pico_json         TEXT DEFAULT '',
    hypothesis        TEXT DEFAULT '',
    research_question TEXT DEFAULT '',
    config_path       TEXT DEFAULT '',
    created_at        TEXT DEFAULT (datetime('now')),
    created_by        TEXT DEFAULT '',
    status            TEXT DEFAULT 'active',
    auto_rob_enabled  INTEGER DEFAULT 0,
    rob_confidence_threshold REAL DEFAULT 0.7,
    storage_folder    TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS studies (
    study_id          TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL,
    title             TEXT NOT NULL,
    authors           TEXT DEFAULT '',
    publication_year  INTEGER,
    journal           TEXT DEFAULT '',
    doi               TEXT DEFAULT '',
    pmid              TEXT DEFAULT '',
    abstract          TEXT DEFAULT '',
    source            TEXT DEFAULT '',
    study_design      TEXT DEFAULT '',
    pdf_path          TEXT DEFAULT '',
    pdf_status        TEXT DEFAULT 'none',
    pdf_processor_engine TEXT DEFAULT '',
    error_message     TEXT DEFAULT '',
    tracing_status    TEXT DEFAULT 'none',
    screening_status  TEXT DEFAULT 'pending',
    screening_reason  TEXT DEFAULT '',
    screening_stage   TEXT DEFAULT '',
    extraction_status TEXT DEFAULT 'pending',
    metadata_json     TEXT DEFAULT '',
    created_at        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS variables (
    variable_id      TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    section          TEXT NOT NULL,
    name             TEXT NOT NULL,
    field_type       TEXT NOT NULL,
    allowed_values   TEXT DEFAULT '',
    range_min        REAL,
    range_max        REAL,
    description      TEXT DEFAULT '',
    order_index      INTEGER DEFAULT 0,
    is_base          INTEGER DEFAULT 1,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS extractions (
    extraction_id    TEXT PRIMARY KEY,
    study_id         TEXT NOT NULL,
    variable_id      TEXT NOT NULL,
    value            TEXT DEFAULT '',
    confidence       REAL DEFAULT 0.0,
    source_page      INTEGER,
    source_bbox      TEXT DEFAULT '',
    source_text      TEXT DEFAULT '',
    tracing_status   TEXT DEFAULT 'none',
    verification_note TEXT DEFAULT '',
    extracted_by     TEXT DEFAULT '',
    extracted_at     TEXT DEFAULT (datetime('now')),
    is_edited        INTEGER DEFAULT 0,
    edited_by        TEXT DEFAULT '',
    edited_at        TEXT DEFAULT '',
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (variable_id) REFERENCES variables(variable_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id         TEXT PRIMARY KEY,
    study_id         TEXT NOT NULL,
    variable_id      TEXT DEFAULT '',
    variable_name    TEXT DEFAULT '',
    old_value        TEXT DEFAULT '',
    new_value        TEXT DEFAULT '',
    changed_by       TEXT NOT NULL,
    changed_at       TEXT DEFAULT (datetime('now')),
    reason           TEXT DEFAULT '',
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

CREATE TABLE IF NOT EXISTS users (
    user_id          TEXT PRIMARY KEY,
    username         TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    email            TEXT DEFAULT '',
    role             TEXT DEFAULT 'reviewer',
    created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cache_store (
    cache_key        TEXT PRIMARY KEY,
    cache_value      TEXT NOT NULL,
    created_at       TEXT DEFAULT (datetime('now')),
    expires_at       TEXT,
    cache_type       TEXT DEFAULT ''
);

-- ── NEW: Risk-of-Bias tables ──

CREATE TABLE IF NOT EXISTS rob_assessments (
    assessment_id    TEXT PRIMARY KEY,
    study_id         TEXT NOT NULL,
    project_id       TEXT NOT NULL,
    tool             TEXT NOT NULL,
    outcome_label    TEXT DEFAULT '',
    overall_judgment TEXT DEFAULT 'pending',
    overall_risk     TEXT DEFAULT '',
    assessed_by      TEXT DEFAULT '',
    assessed_at      TEXT DEFAULT '',
    ai_prefilled     INTEGER DEFAULT 0,
    ai_prefilled_at  TEXT DEFAULT '',
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

CREATE TABLE IF NOT EXISTS rob_domain_judgments (
    judgment_id      TEXT PRIMARY KEY,
    assessment_id    TEXT NOT NULL,
    domain_key       TEXT NOT NULL,
    domain_label     TEXT NOT NULL,
    risk_judgment    TEXT DEFAULT '',
    applicability    TEXT DEFAULT '',
    support_text     TEXT DEFAULT '',
    ai_suggested     TEXT DEFAULT '',
    ai_support       TEXT DEFAULT '',
    ai_confidence    REAL DEFAULT 0.0,
    human_verified   INTEGER DEFAULT 0,
    verified_by      TEXT DEFAULT '',
    verified_at      TEXT DEFAULT '',
    FOREIGN KEY (assessment_id) REFERENCES rob_assessments(assessment_id)
);

CREATE TABLE IF NOT EXISTS rob_signaling_answers (
    answer_id        TEXT PRIMARY KEY,
    judgment_id      TEXT NOT NULL,
    question_key     TEXT NOT NULL,
    question_text    TEXT NOT NULL,
    answer           TEXT DEFAULT '',
    ai_answer        TEXT DEFAULT '',
    ai_quote         TEXT DEFAULT '',
    ai_page          INTEGER,
    ai_confidence    REAL DEFAULT 0.0,
    human_verified   INTEGER DEFAULT 0,
    FOREIGN KEY (judgment_id) REFERENCES rob_domain_judgments(judgment_id)
);

-- ── NEW: PDF processing ──

CREATE TABLE IF NOT EXISTS pdf_documents (
    doc_id            TEXT PRIMARY KEY,
    study_id          TEXT NOT NULL,
    full_text         TEXT DEFAULT '',
    pages_json        TEXT DEFAULT '[]',
    annotations_json  TEXT DEFAULT '[]',
    tables_json       TEXT DEFAULT '[]',
    metadata_json     TEXT DEFAULT '{}',
    processor_engine  TEXT DEFAULT '',
    processed_at      TEXT DEFAULT '',
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

-- ── NEW: Meta-analysis ──

CREATE TABLE IF NOT EXISTS meta_analyses (
    meta_id           TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL,
    outcome_label     TEXT NOT NULL,
    analysis_type     TEXT DEFAULT 'generic',
    effect_measure    TEXT DEFAULT 'md',
    n_studies         INTEGER DEFAULT 0,
    pooled_effect     REAL,
    pooled_ci_lower   REAL,
    pooled_ci_upper   REAL,
    pooled_se         REAL,
    z_statistic       REAL,
    p_value           REAL,
    i_squared         REAL,
    tau_squared       REAL,
    q_statistic       REAL,
    q_p_value         REAL,
    egger_intercept   REAL,
    egger_p_value     REAL,
    forest_plot_svg   TEXT DEFAULT '',
    sroc_curve_svg    TEXT DEFAULT '',
    funnel_plot_svg   TEXT DEFAULT '',
    results_json      TEXT DEFAULT '{}',
    created_at        TEXT DEFAULT (datetime('now')),
    created_by        TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS meta_analysis_studies (
    link_id           TEXT PRIMARY KEY,
    meta_id           TEXT NOT NULL,
    study_id          TEXT DEFAULT '',
    study_label       TEXT DEFAULT '',
    effect_size       REAL,
    variance          REAL,
    se                REAL,
    ci_lower          REAL,
    ci_upper          REAL,
    weight            REAL,
    raw_data_json     TEXT DEFAULT '{}',
    included          INTEGER DEFAULT 1,
    FOREIGN KEY (meta_id) REFERENCES meta_analyses(meta_id)
);

-- ── NEW: GRADE certainty assessment ──

CREATE TABLE IF NOT EXISTS grade_assessments (
    grade_id          TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL,
    outcome_label     TEXT NOT NULL,
    meta_analysis_id  TEXT,
    certainty_rating  TEXT DEFAULT 'high',
    starting_level    TEXT DEFAULT 'high',
    n_studies         INTEGER DEFAULT 0,
    n_participants    INTEGER DEFAULT 0,
    effect_estimate   TEXT DEFAULT '',
    ci_text           TEXT DEFAULT '',
    sof_table_json    TEXT DEFAULT '{}',
    created_at        TEXT DEFAULT (datetime('now')),
    created_by        TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (meta_analysis_id) REFERENCES meta_analyses(meta_id)
);

CREATE TABLE IF NOT EXISTS grade_factors (
    factor_id         TEXT PRIMARY KEY,
    grade_id          TEXT NOT NULL,
    factor_type       TEXT NOT NULL,
    factor_key        TEXT NOT NULL,
    factor_name       TEXT NOT NULL,
    rating            TEXT DEFAULT 'none',
    rationale         TEXT DEFAULT '',
    auto_populated    INTEGER DEFAULT 0,
    auto_data         TEXT DEFAULT '{}',
    FOREIGN KEY (grade_id) REFERENCES grade_assessments(grade_id)
);

-- ── NEW: Batch Risk-of-Bias runs ──

CREATE TABLE IF NOT EXISTS rob_runs (
    run_id            TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL,
    trigger           TEXT DEFAULT 'auto',
    status            TEXT DEFAULT 'active',
    started_at        TEXT DEFAULT (datetime('now')),
    finished_at       TEXT DEFAULT '',
    total_studies     INTEGER DEFAULT 0,
    completed_studies INTEGER DEFAULT 0,
    current_study_id  TEXT DEFAULT '',
    done_ids_json     TEXT DEFAULT '[]',
    pending_ids_json  TEXT DEFAULT '[]',
    error             TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_rob_runs_project ON rob_runs(project_id);

CREATE TABLE IF NOT EXISTS rob_tool_classifications (
    classification_id TEXT PRIMARY KEY,
    study_id           TEXT NOT NULL,
    project_id         TEXT NOT NULL,
    study_design       TEXT DEFAULT '',
    selected_tool      TEXT DEFAULT '',
    confidence         REAL DEFAULT 0.0,
    alternatives_json  TEXT DEFAULT '[]',
    rationale          TEXT DEFAULT '',
    evidence_json      TEXT DEFAULT '[]',
    status             TEXT DEFAULT 'manual_review',
    model_name         TEXT DEFAULT '',
    classified_at      TEXT DEFAULT (datetime('now')),
    human_verified     INTEGER DEFAULT 0,
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_rob_classification_project
    ON rob_tool_classifications(project_id);
CREATE INDEX IF NOT EXISTS idx_rob_classification_study
    ON rob_tool_classifications(study_id);

CREATE TABLE IF NOT EXISTS reporting_profile_assessments (
    profile_assessment_id TEXT PRIMARY KEY,
    study_id              TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    profile_key           TEXT NOT NULL,
    assessed_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS reporting_profile_items (
    profile_item_id       TEXT PRIMARY KEY,
    profile_assessment_id TEXT NOT NULL,
    section_key           TEXT NOT NULL,
    item_key              TEXT NOT NULL,
    item_label            TEXT NOT NULL,
    status                TEXT DEFAULT 'not_reported',
    evidence              TEXT DEFAULT '',
    confidence            REAL DEFAULT 0.0,
    human_verified        INTEGER DEFAULT 0,
    FOREIGN KEY (profile_assessment_id)
        REFERENCES reporting_profile_assessments(profile_assessment_id)
);

CREATE INDEX IF NOT EXISTS idx_reporting_profile_project
    ON reporting_profile_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_reporting_profile_study
    ON reporting_profile_assessments(study_id);
CREATE INDEX IF NOT EXISTS idx_reporting_profile_items_assessment
    ON reporting_profile_items(profile_assessment_id);

-- ── NEW: v2.4 Screening decisions (multi-reviewer) ──

CREATE TABLE IF NOT EXISTS screening_decisions (
    decision_id       TEXT PRIMARY KEY,
    study_id          TEXT NOT NULL,
    project_id        TEXT NOT NULL,
    reviewer_id       TEXT NOT NULL,
    reviewer_name     TEXT DEFAULT '',
    decision          TEXT NOT NULL,   -- included | excluded | maybe | pending
    reason_code       TEXT DEFAULT '',  -- taxonomy code for exclusion
    reason_text       TEXT DEFAULT '',  -- free-text reason
    stage             TEXT NOT NULL,    -- ta | ft
    is_blinded        INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- ── NEW: v2.4 Screening conflicts ──

CREATE TABLE IF NOT EXISTS screening_conflicts (
    conflict_id        TEXT PRIMARY KEY,
    study_id           TEXT NOT NULL,
    project_id         TEXT NOT NULL,
    stage              TEXT NOT NULL,
    reviewer1_id       TEXT DEFAULT '',
    reviewer1_decision TEXT DEFAULT '',
    reviewer2_id       TEXT DEFAULT '',
    reviewer2_decision TEXT DEFAULT '',
    resolution         TEXT DEFAULT '',   -- included | excluded | maybe
    resolved_by        TEXT DEFAULT '',
    resolved_at        TEXT DEFAULT '',
    status             TEXT DEFAULT 'unresolved',  -- unresolved | resolved
    created_at         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- ── NEW: Clarification questions (mid-pipeline interactive clarification) ──

CREATE TABLE IF NOT EXISTS clarification_questions (
    question_id        TEXT PRIMARY KEY,
    study_id           TEXT NOT NULL,
    project_id         TEXT NOT NULL,
    stage              TEXT NOT NULL,          -- ta | ft
    question_type      TEXT NOT NULL,          -- study_design | population_match | intervention_match | outcome_match
    question_text      TEXT NOT NULL,          -- the multiple-choice question
    options_json       TEXT NOT NULL,          -- JSON array: [{"value": "rct", "label": "Randomized controlled trial"}, ...]
    context_excerpt    TEXT DEFAULT '',        -- relevant excerpt from abstract/full-text that triggered the question
    pico_aspect        TEXT DEFAULT '',        -- which PICO element is uncertain: population | index_test | comparator | outcome | study_design
    ai_interim_decision TEXT DEFAULT '',       -- what AI would decide without the answer (usually "uncertain")
    ai_interim_confidence REAL DEFAULT 0.0,
    ai_interim_reason  TEXT DEFAULT '',        -- why the AI is uncertain
    status             TEXT DEFAULT 'pending', -- pending | answered | expired
    answer             TEXT DEFAULT '',        -- the selected option value
    answer_label       TEXT DEFAULT '',        -- the selected option label (human-readable)
    answer_freetext    TEXT DEFAULT '',        -- if "Other" was selected, the free-text answer
    answered_by        TEXT DEFAULT '',
    answered_at        TEXT DEFAULT '',
    final_decision     TEXT DEFAULT '',        -- AI's decision after incorporating the answer
    final_confidence   REAL DEFAULT 0.0,
    final_reason_text  TEXT DEFAULT '',
    final_reason_code  TEXT DEFAULT '',
    created_at         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_clarification_project ON clarification_questions(project_id);
CREATE INDEX IF NOT EXISTS idx_clarification_status ON clarification_questions(status);
CREATE INDEX IF NOT EXISTS idx_clarification_study ON clarification_questions(study_id);

-- ── PDF Highlights (react-pdf-highlighter-plus) ──

CREATE TABLE IF NOT EXISTS pdf_highlights (
    highlight_id       TEXT PRIMARY KEY,
    study_id           TEXT NOT NULL,
    project_id         TEXT NOT NULL,
    variable_id        TEXT DEFAULT '',     -- optional link to extraction variable
    highlight_type     TEXT DEFAULT 'text', -- text | area
    page_number        INTEGER NOT NULL,
    position_json      TEXT DEFAULT '{}',   -- {boundingRect, rects} in scaled coords
    content_text       TEXT DEFAULT '',     -- selected text content
    comment            TEXT DEFAULT '',     -- reviewer comment
    color              TEXT DEFAULT '#ffd700', -- highlight color
    created_by         TEXT DEFAULT '',
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- ── Session management (auth sessions) ──

CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    ip_address      TEXT DEFAULT '',
    user_agent      TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now')),
    last_active     TEXT DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL,
    is_revoked      INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- ── Human Track Changes decisions on AI extractions (error analysis / training data) ──

CREATE TABLE IF NOT EXISTS extraction_decisions (
    decision_id     TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    study_id        TEXT NOT NULL,
    variable_id     TEXT NOT NULL,
    variable_name   TEXT DEFAULT '',
    decision        TEXT NOT NULL,      -- accepted | modified | rejected
    original_value  TEXT DEFAULT '',
    corrected_value TEXT DEFAULT '',
    category        TEXT DEFAULT '',    -- VERIFIED_ACCURATE | NORMALIZATION | ...
    has_discrepancy INTEGER DEFAULT 0,
    rationale       TEXT DEFAULT '',
    evidence_quote  TEXT DEFAULT '',
    page_number     INTEGER,
    codebook_rules  TEXT DEFAULT '',
    reviewer        TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    undone          INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_decisions_project ON extraction_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_extraction_decisions_cell ON extraction_decisions(study_id, variable_id);

-- ── Project membership (roles-based access control) ──

CREATE TABLE IF NOT EXISTS project_members (
    member_id       TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'reviewer',
    invited_by      TEXT DEFAULT '',
    joined_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE(project_id, user_id)
);

-- ── Per-user review state tracking ──

CREATE TABLE IF NOT EXISTS user_review_state (
    state_id        TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    project_id      TEXT NOT NULL,
    study_id        TEXT DEFAULT '',
    stage           TEXT NOT NULL DEFAULT 'screening',
    status          TEXT DEFAULT 'pending',
    last_visited_at TEXT DEFAULT (datetime('now')),
    notes           TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (study_id) REFERENCES studies(study_id),
    UNIQUE(user_id, project_id, study_id, stage)
);

-- ── Keyword groups (customizable highlighting for screening) ──

CREATE TABLE IF NOT EXISTS keyword_groups (
    group_id        TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    name            TEXT NOT NULL,
    color           TEXT DEFAULT '#ffd700',
    keywords_json   TEXT DEFAULT '[]',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- ── Screening keywords (Rayyan-style include/exclude keyword highlighting) ──

CREATE TABLE IF NOT EXISTS screening_keywords (
    keyword_id      TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    keyword         TEXT NOT NULL,
    keyword_type    TEXT NOT NULL,              -- include | exclude
    color           TEXT DEFAULT '',            -- green | red (auto-assigned)
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS search_logs (
    log_id            TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL,
    database_name     TEXT NOT NULL,
    date_searched     TEXT NOT NULL,
    query_string      TEXT DEFAULT '',
    filters_json      TEXT DEFAULT '{}',
    results_count     INTEGER DEFAULT 0,
    export_format     TEXT DEFAULT 'json',
    raw_results_json  TEXT DEFAULT '[]',
    created_by        TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

-- ── Reference Import Batches & Multi-Batch Study Provenance ──

CREATE TABLE IF NOT EXISTS import_batches (
    batch_id         TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    filename         TEXT NOT NULL,
    source           TEXT DEFAULT 'Unknown',
    format           TEXT DEFAULT 'Unknown',
    total_records    INTEGER NOT NULL DEFAULT 0,
    imported_count   INTEGER NOT NULL DEFAULT 0,
    duplicate_count  INTEGER NOT NULL DEFAULT 0,
    merged_count     INTEGER NOT NULL DEFAULT 0,
    failed_count     INTEGER NOT NULL DEFAULT 0,
    status           TEXT DEFAULT 'completed', -- completed | completed_with_errors | failed | undone
    undone_at        TEXT DEFAULT NULL,
    created_at       TEXT DEFAULT (datetime('now')),
    created_by       TEXT DEFAULT '',
    details_json     TEXT DEFAULT '{}',
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS batch_study_contributions (
    contribution_id  TEXT PRIMARY KEY,
    batch_id         TEXT NOT NULL,
    study_id         TEXT NOT NULL,
    project_id       TEXT NOT NULL,
    is_primary_creator INTEGER DEFAULT 1,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (batch_id) REFERENCES import_batches(batch_id) ON DELETE CASCADE,
    FOREIGN KEY (study_id) REFERENCES studies(study_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    UNIQUE(batch_id, study_id)
);

CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',        -- 'manual' | 'study' | 'notification'
    study_id TEXT,                                -- set when source='study'
    notification_id TEXT,                         -- set when source='notification'
    created_at TEXT NOT NULL
);

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_studies_project ON studies(project_id);
CREATE INDEX IF NOT EXISTS idx_variables_project ON variables(project_id);
CREATE INDEX IF NOT EXISTS idx_extractions_study ON extractions(study_id);
CREATE INDEX IF NOT EXISTS idx_extractions_variable ON extractions(variable_id);
CREATE INDEX IF NOT EXISTS idx_audit_study ON audit_log(study_id);
CREATE INDEX IF NOT EXISTS idx_cache_type ON cache_store(cache_type);
CREATE INDEX IF NOT EXISTS idx_rob_assessment_study ON rob_assessments(study_id);
CREATE INDEX IF NOT EXISTS idx_rob_assessment_project ON rob_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_rob_judgment_assessment ON rob_domain_judgments(assessment_id);
CREATE INDEX IF NOT EXISTS idx_rob_answer_judgment ON rob_signaling_answers(judgment_id);
CREATE INDEX IF NOT EXISTS idx_pdf_doc_study ON pdf_documents(study_id);
CREATE INDEX IF NOT EXISTS idx_meta_project ON meta_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_meta_studies_meta ON meta_analysis_studies(meta_id);
CREATE INDEX IF NOT EXISTS idx_grade_project ON grade_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_grade_factors_grade ON grade_factors(grade_id);
CREATE INDEX IF NOT EXISTS idx_screening_decisions_study ON screening_decisions(study_id);
CREATE INDEX IF NOT EXISTS idx_screening_decisions_project ON screening_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_conflicts_study ON screening_conflicts(study_id);
CREATE INDEX IF NOT EXISTS idx_screening_conflicts_project ON screening_conflicts(project_id);
CREATE INDEX IF NOT EXISTS idx_pdf_highlights_study ON pdf_highlights(study_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_review_state_user ON user_review_state(user_id);
CREATE INDEX IF NOT EXISTS idx_review_state_project ON user_review_state(project_id);
CREATE INDEX IF NOT EXISTS idx_screening_keywords_project ON screening_keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_project ON search_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_project ON import_batches(project_id);
CREATE INDEX IF NOT EXISTS idx_batch_contributions_batch ON batch_study_contributions(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_contributions_study ON batch_study_contributions(study_id);
CREATE INDEX IF NOT EXISTS idx_batch_contributions_project ON batch_study_contributions(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_study ON todos(study_id);
CREATE INDEX IF NOT EXISTS idx_todos_notification ON todos(notification_id);
"""

# ── Column migrations for existing tables ──
# SQLite ALTER TABLE ADD COLUMN is safe on existing databases.
# Each tuple: (table, column_name, column_def)
MIGRATION_COLUMNS = [
    ("clarification_questions", "is_tracked", "INTEGER DEFAULT 0"),
    # Dual-reviewer columns on extractions
    ("extractions", "verification_status", "TEXT DEFAULT 'pending'"),
    ("extractions", "second_value", "TEXT DEFAULT ''"),
    ("extractions", "second_reviewer", "TEXT DEFAULT ''"),
    ("extractions", "verified_at", "TEXT DEFAULT ''"),
    ("extractions", "adjudicated_value", "TEXT DEFAULT ''"),
    ("extractions", "adjudicator", "TEXT DEFAULT ''"),
    ("extractions", "adjudication_notes", "TEXT DEFAULT ''"),
    # Dual-reviewer columns on rob_assessments
    ("rob_assessments", "verification_status", "TEXT DEFAULT 'pending'"),
    ("rob_assessments", "second_assessor", "TEXT DEFAULT ''"),
    ("rob_assessments", "second_assessment_json", "TEXT DEFAULT ''"),
    ("rob_assessments", "adjudicator", "TEXT DEFAULT ''"),
    # v2.2: PICO/hypothesis/PubMed/citation columns
    ("projects", "secondary_hypotheses_json", "TEXT DEFAULT '[]'"),
    ("projects", "pubmed_api_key", "TEXT DEFAULT ''"),
    ("projects", "storage_folder", "TEXT DEFAULT ''"),
    ("studies", "citation_format", "TEXT DEFAULT 'vancouver'"),
    # v2.3: criteria + search strings columns
    ("projects", "inclusion_criteria_json", "TEXT DEFAULT '[]'"),
    ("projects", "exclusion_criteria_json", "TEXT DEFAULT '[]'"),
    ("projects", "search_strings_json", "TEXT DEFAULT '{}'"),
    # v2.4: screening config + exclusion taxonomy
    ("projects", "screening_config_json", "TEXT DEFAULT '{}'"),
    ("projects", "exclusion_reasons_json", "TEXT DEFAULT '[]'"),
    # v2.4: signal generation + extraction gaps
    ("projects", "signals_json", "TEXT DEFAULT ''"),
    ("extractions", "confidence_tag", "TEXT DEFAULT ''"),
    # v2.4: duplicate detection columns
    ("studies", "duplicate_group_id", "TEXT DEFAULT ''"),
    ("studies", "is_duplicate", "INTEGER DEFAULT 0"),
    ("studies", "duplicate_of_study_id", "TEXT DEFAULT ''"),
    # v2.4: AI screening priority
    ("studies", "ai_priority_score", "REAL DEFAULT 0.0"),
    # v2.4: AI multi-stage screening columns
    ("studies", "ai_confidence", "REAL DEFAULT 0.0"),
    ("studies", "ai_decision", "TEXT DEFAULT ''"),
    ("studies", "ai_reason", "TEXT DEFAULT ''"),
    ("studies", "ai_reason_code", "TEXT DEFAULT ''"),
    ("studies", "ai_screened_at", "TEXT DEFAULT ''"),
    ("studies", "ai_stage", "TEXT DEFAULT ''"),
    # v2.5: coded extraction (per-variable prompts, confidence tags, missing codes)
    ("variables", "extraction_prompt", "TEXT DEFAULT ''"),
    ("extractions", "missing_code", "TEXT DEFAULT ''"),
    ("extractions", "extraction_prompt", "TEXT DEFAULT ''"),
    ("extractions", "calc_note", "TEXT DEFAULT ''"),
    # Phase 2: Batch RoB and Human-in-the-loop screening settings & flags
    ("projects", "auto_rob_enabled", "INTEGER DEFAULT 0"),
    ("projects", "rob_confidence_threshold", "REAL DEFAULT 0.7"),
    ("rob_assessments", "run_id", "TEXT DEFAULT ''"),
    ("rob_assessments", "auto_selected", "INTEGER DEFAULT 0"),
    ("rob_signaling_answers", "needs_human_review", "INTEGER DEFAULT 0"),
    ("rob_signaling_answers", "reviewed_by", "TEXT DEFAULT ''"),
    ("rob_signaling_answers", "reviewed_at", "TEXT DEFAULT ''"),
    ("studies", "pdf_processor_engine", "TEXT DEFAULT ''"),
    ("studies", "import_batch_id", "TEXT DEFAULT ''"),
    ("studies", "error_message", "TEXT DEFAULT ''"),
    ("studies", "tracing_status", "TEXT DEFAULT 'none'"),
    ("extractions", "tracing_status", "TEXT DEFAULT 'none'"),
    ("extractions", "verification_note", "TEXT DEFAULT ''"),
]


def _run_migrations(conn: sqlite3.Connection):
    """Add columns to existing tables if they don't already exist."""
    for table, column, col_def in MIGRATION_COLUMNS:
        # Check if column already exists
        cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")


def get_connection() -> sqlite3.Connection:
    """Get a SQLite connection with WAL mode, foreign keys, and busy timeout enabled."""
    ensure_dirs()
    conn = sqlite3.connect(settings.db_path, check_same_thread=False, timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def get_db() -> Generator[Union[sqlite3.Connection, DBBackend], None, None]:
    """FastAPI dependency that yields a database connection and closes it.

    Returns a DBBackend instance (SQLiteBackend or DynamoDBBackend) based on
    the RADEXTRACT_DB_BACKEND setting. SQLiteBackend wraps sqlite3.Connection
    and passes through execute() calls, so existing router code works unchanged.
    """
    if settings.db_backend == "dynamodb":
        yield get_db_backend()
    else:
        conn = get_connection()
        backend = SQLiteBackend(conn)
        try:
            yield backend
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            backend.close()


def init_sqlite_db(conn: sqlite3.Connection | None = None):
    """Create all SQLite tables and run column migrations."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        conn.executescript(SCHEMA_SQL)
        _run_migrations(conn)
        conn.commit()
    finally:
        if close_after:
            conn.close()


def init_db():
    """Create all tables if they don't exist and run column migrations.

    For SQLite: creates tables and runs column migrations.
    For DynamoDB: creates DynamoDB tables with GSIs.
    """
    if settings.db_backend == "dynamodb":
        init_dynamodb_tables()
        return

    init_sqlite_db()


def reset_db():
    """Drop all tables and recreate. FOR TESTING ONLY."""
    conn = get_connection()
    try:
        tables = [
            "todos",
            "record_annotations", "study_tag_links", "project_tags",
            "screening_keywords", "keyword_groups",
            "clarification_questions",
            "grade_factors", "grade_assessments",
            "meta_analysis_studies", "meta_analyses",
            "pdf_highlights",
            "pdf_documents",
            "reporting_profile_items", "reporting_profile_assessments",
            "rob_tool_classifications",
            "rob_signaling_answers", "rob_domain_judgments", "rob_assessments",
            "rob_runs",
            "screening_conflicts", "screening_decisions",
            "user_review_state",
            "project_members",
            "sessions",
            "extraction_decisions",
            "extractions", "audit_log", "variables",
            "batch_study_contributions", "import_batches",
            "studies",
            "search_logs",
            "projects", "users", "cache_store",
        ]
        for t in tables:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.commit()
        conn.executescript(SCHEMA_SQL)
        _run_migrations(conn)
        conn.commit()
    finally:
        conn.close()
