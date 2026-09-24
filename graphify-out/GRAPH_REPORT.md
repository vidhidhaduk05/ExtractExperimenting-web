# Graph Report - radextract_v2.4  (2026-08-27)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4209 nodes · 7130 edges · 261 communities (217 shown, 44 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 229 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4decf6c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- _query_llm_for_api
- routers/screening.py
- check_project_access
- test_dual_writer.py
- generate_citation
- A1
- gemini_web2api.py
- api.ts
- parse_ris
- dependencies.py
- extract_pico_from_text
- test_pico_hypothesis_merge.py
- analysis.py
- init_db
- backend/models.py
- OCRBackend
- rob_service.py
- test_meta_analysis.py
- utils.py
- litextract/__init__.py
- test_dedup_service.py
- studies.py
- PaperTaskExtractor
- tool/molecular_biology.py
- generate_variables_from_picos
- a1.py
- tool/genomics.py
- parse_pdf_pipeline
- scientific_exports.py
- _create_project_and_study
- test_ai_integration.py
- ToolCallingClient
- react.py
- main.py
- get_connection
- DeterministicScreener
- pdf_service.py
- worker.js
- _create_project_and_study
- KnowHowLoader
- rob.py
- Record
- meta.py
- test_routers_rob.py
- grade.py
- test_pico_highlight.py
- tool/pharmacology.py
- meta_analysis.py
- test_r_plot_service.py
- BiomniEval1
- popup.js
- test_routers_grade.py
- DeterministicAdjudicator
- validate
- charts.py
- validate_tool_response
- tool/database.py
- tool/microbiology.py
- tools.py
- _records_struct_from
- DeterministicSchemaGenerator
- ._process_ai_message
- base_task
- test_dual_reviewer.py
- test_screening_decisions.py
- compilerOptions
- tool/lab_automation.py
- TestPICOEndpoints
- App.tsx
- FunctionGenerator
- tool/physiology.py
- schema.py
- test_end_to_end.py
- validate.py
- biomni.py
- r_plot_service.py
- get_llm
- tool/immunology.py
- dependencies
- extraction.py
- MockProcessor
- _load_graph
- pubmed.py
- rob_tools.py
- AnalysisPage.tsx
- SegmentationTool
- server.py
- pdf_highlights.py
- search_string_generator.py
- compilerOptions
- install_cli_tools.sh
- tool/genetics.py
- OpenFDAClient
- devDependencies
- GeminiHandler
- test_document_processor.py
- test_pico_hypothesis.py
- ImageRegistrationTool
- TestGenerateProjectConfig
- compute_overall_judgment
- generate_search_strings
- patch
- RobAssessmentPage.tsx
- tool/literature.py
- tool/synthetic_biology.py
- log
- StreamingEndpointTests
- test_rob_tools.py
- compare_values
- parse_json_from_text
- prefill_assessment
- generate_criteria_from_pico
- GradePage.tsx
- gemini.py
- variables.py
- literature_search.py
- test_exclusion_reasons.py
- tool/bioengineering.py
- tool/pathology.py
- _process_ddinter_data_inline
- tool/systems_biology.py
- manifest.json
- ScreeningDecision
- TestPdfService
- _load_ddinter_data
- DoclingProcessor
- test_ai_screening.py
- tool/biochemistry.py
- tool/bioimaging.py
- tool/cancer_biology.py
- tool/protocols.py
- ToolRegistry
- build_domain_prompt
- ReviewPage.tsx
- _standardize_drug_name_fda
- test_modular_sync.py
- Schema
- ProcessedDocument
- TestDoclingProcessor
- get_processor
- pubmed_service.py
- api
- main
- tool/cell_biology.py
- LLMScreener
- PlaywrightService
- test_search_string_generator.py
- TestToolDefinitions
- color_print
- parse_tool_calls_with_modules
- ._process_message
- FallbackProcessor
- GeneratedField
- test_screening_extensions.py
- package.json
- ScreeningPage.tsx
- CodeGraphPage.tsx
- export_project
- tests_existing/conftest.py
- test_01_config_load.py
- parse_llm_response
- compute_rob2_domain_judgment
- compute_robins_i_domain_judgment
- TestAutoGenerateVariables
- TestPubMedKey
- PdfViewerPage.tsx
- PrismaFlowPage.tsx
- ReviewGraphPage.tsx
- .register_images
- tool/glycoengineering.py
- query_fda_adverse_events
- generate_base_codebook.py
- tool/biophysics.py
- can_user_access_project
- get
- TestAutoExtract
- AppLayout.tsx
- convert_markdown_to_pdf
- pubmed_mcp.py
- CustomBaseModel
- review_matrix
- TestPdfEndpoints
- TestMetaAnalysisCRUD
- backend/config.py
- generate_api_docs.py
- delete_pdf_data
- delete_assessment
- TestRunAnalysis
- inject_custom_functions_to_repl
- split_modalities
- get_fda_drug_label_info
- test_single_tool
- tsconfig.json
- @eslint/js
- new_software_v008.sh
- tests/__init__.py
- globals
- postcss
- radextract_core/__init__.py
- radextract_core/tests/conftest.py
- backend/tests/conftest.py
- react
- @xyflow/react
- @types/react
- typescript
- callable
- Any
- Any
- Connection
- Any
- Any
- Any
- Any
- Any
- Any
- Any
- fixture
- patch
- biomni
- gemini-web2api
- radextract-platform
- Project
- Connection
- delete
- get
- post
- put
- UploadFile
- Study

## God Nodes (most connected - your core abstractions)
1. `get_connection()` - 97 edges
2. `check_project_access()` - 71 edges
3. `A1` - 48 edges
4. `init_db()` - 43 edges
5. `ToolCallingClient` - 38 edges
6. `_query_llm_for_api()` - 38 edges
7. `reset_db()` - 37 edges
8. `_query_rest_api()` - 35 edges
9. `_format_query_results()` - 29 edges
10. `generate_citation()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `test_09_null_ocr_backend()` --uses--> `NullOCRBackend`  [INFERRED]
  radextract_platform/backend/radextract_core/tests_existing/test_09_layout_detection.py → radextract_platform/backend/radextract_core/litextract/ocr.py
- `StreamingEndpointTests` --uses--> `GeminiHandler`  [INFERRED]
  gemini-web2api-main/gemini-web2api-main/tests/test_modular_sync.py → gemini-web2api-main/gemini-web2api-main/gemini_web2api/server.py
- `StreamingEndpointTests` --uses--> `ThreadedServer`  [INFERRED]
  gemini-web2api-main/gemini-web2api-main/tests/test_modular_sync.py → gemini-web2api-main/gemini-web2api-main/gemini_web2api/server.py
- `TestDoclingProcessor` --uses--> `DoclingProcessor`  [INFERRED]
  radextract_platform/backend/radextract_core/tests/test_document_processor.py → radextract_platform/backend/radextract_core/radextract/document_processor.py
- `TestFacade` --uses--> `DoclingProcessor`  [INFERRED]
  radextract_platform/backend/radextract_core/tests/test_document_processor.py → radextract_platform/backend/radextract_core/radextract/document_processor.py

## Import Cycles
- None detected.

## Communities (261 total, 44 thin omitted)

### Community 0 - "_query_llm_for_api"
Cohesion: 0.05
Nodes (68): _format_query_results(), query_cbioportal(), query_chembl(), query_clinicaltrials(), query_dailymed(), query_emdb(), query_encode(), query_ensembl() (+60 more)

### Community 1 - "routers/screening.py"
Cohesion: 0.06
Nodes (58): AIPrioritizationResult, ExclusionReasonsResponse, ScreeningConfigResponse, ScreeningConflictResponse, create_screening_decision(), deduplicate_studies(), get_exclusion_reasons(), get_pico_highlight() (+50 more)

### Community 2 - "check_project_access"
Cohesion: 0.09
Nodes (56): HypothesisUpdate, PICOUpdate, check_project_access(), Raise 403 if user lacks access to the project. If user is None (no auth token),…, CriteriaResponse, CriteriaUpdate, Criterion, PICOResponse (+48 more)

### Community 3 - "test_dual_writer.py"
Cohesion: 0.06
Nodes (36): build_column_map(), dual_writer.py — multi-format output writer for reconciled extraction records.…, Convert a sheet name to a valid SQLite table identifier., Write records as a flat JSON file (all sheets, all rows). Structure: {…, Write records as a nested JSON file preserving the entity graph hierarchy.…, Write reconciled records to all enabled formats. Args: records: {sheet:…, Convert a field name to a valid SQLite column identifier. 'Study ID' →…, Read all records from a SQLite database back into the {sheet: [row_dict]}… (+28 more)

### Community 4 - "generate_citation"
Cohesion: 0.06
Nodes (31): _bibtex_key(), _format_apa_authors(), _format_chicago_authors(), _format_harvard_authors(), _format_mla_authors(), _format_vancouver(), generate_citation(), generate_citations() (+23 more)

### Community 5 - "A1"
Cohesion: 0.04
Nodes (29): A1, Configure the agent with the initial system prompt and workflow. Args:…, Prepare resources for retrieval and return selected resource names. Args:…, Execute the agent with the given prompt. Args: prompt: The user's query, Execute the agent with the given prompt and return a generator that yields each…, Update the system prompt with the selected resources., Create an MCP server object that exposes internal Biomni tools. This gives you…, Save the complete conversation history as PDF only. This function generates and… (+21 more)

### Community 6 - "gemini_web2api.py"
Cohesion: 0.08
Nodes (39): account_prefix(), apply_chat_persistence_flags(), clean_gemini_text(), decode_data_url(), extract_response_text(), fetch_latest_bl(), gemini_stream_generate(), gemini_stream_generate_iter() (+31 more)

### Community 7 - "api.ts"
Cohesion: 0.04
Nodes (50): AIPrioritizationResult, AnalysisMissingRow, AnalysisOutlier, AnalysisPerVariable, AnalysisProfileSummary, CriteriaResponse, DeduplicationResult, DuplicateGroup (+42 more)

### Community 8 - "parse_ris"
Cohesion: 0.07
Nodes (27): _add_ris_field(), _clean_latex(), _finalize_bibtex_record(), _finalize_ris_record(), parse_bibtex(), _parse_bibtex_fields(), parse_file(), parse_ris() (+19 more)

### Community 9 - "dependencies.py"
Cohesion: 0.08
Nodes (47): authenticate_user(), create_access_token(), create_refresh_token(), create_user(), get_current_user(), hash_password(), _hash_token(), list_user_sessions() (+39 more)

### Community 10 - "extract_pico_from_text"
Cohesion: 0.07
Nodes (31): _extract_docx_text(), _extract_pdf_text(), extract_pico_from_file(), extract_pico_from_text(), _find_keyword_match(), _find_section_content(), _is_any_header(), _looks_like_header() (+23 more)

### Community 11 - "test_pico_hypothesis_merge.py"
Cohesion: 0.04
Nodes (23): client(), fresh_db(), project(), project_with_pico(), fixture, Tests for merged PICO/Hypothesis endpoints: criteria, search strings, PubMed…, Tests for search string generation endpoints., Use a temporary database for each test. (+15 more)

### Community 12 - "analysis.py"
Cohesion: 0.09
Nodes (46): download_full_report(), get_analysis_profile(), get_forest_data(), get_full_report(), get_funnel_data(), get_heterogeneity(), get_sensitivity(), get_variable_stats() (+38 more)

### Community 13 - "init_db"
Cohesion: 0.07
Nodes (37): init_db(), Connection, SQLite database connection, schema initialization, and migrations. Extends the…, Add columns to existing tables if they don't already exist., Create all tables if they don't exist and run column migrations., Drop all tables and recreate. FOR TESTING ONLY., reset_db(), _run_migrations() (+29 more)

### Community 14 - "backend/models.py"
Cohesion: 0.08
Nodes (44): ActiveLearningFeedbackRequest, ConflictResolveRequest, DeduplicationResult, DuplicateGroup, DuplicateMatch, ExclusionReason, ExclusionReasonsUpdate, HypothesisResponse (+36 more)

### Community 15 - "OCRBackend"
Cohesion: 0.07
Nodes (27): NullOCRBackend, OCRBackend, ocr.py — OCR backend implementations including Baidu Unlimited-OCR and…, HTTP client connecting to a remote SGLang or vLLM server serving Unlimited-OCR., Abstract interface for OCR backends: ocr(image_input) -> str., Process image file path or raw bytes and return extracted text/markdown., Process a batch of images., No-op OCR backend for unit tests or environments without OCR models. (+19 more)

### Community 16 - "rob_service.py"
Cohesion: 0.07
Nodes (39): Seed script: load the example diagnostic accuracy study and run a full RoB…, Run the full seed sequence., seed(), accept_ai_suggestions(), apply_ai_prefill(), auto_select_and_create_assessment(), create_assessment(), export_project_rob() (+31 more)

### Community 17 - "test_meta_analysis.py"
Cohesion: 0.05
Nodes (21): Tests for services/meta_analysis.py — bivariate model, generic pooling, plots., Bivariate model with 5 studies should produce valid pooled estimates., Zero cells should get continuity correction., Tests for Egger's regression test., Tests that SVG plots are generated correctly., Tests for run_meta_analysis end-to-end., Pooled sensitivity should be within the range of study sensitivities., Should raise ValueError with < 2 studies. (+13 more)

### Community 18 - "utils.py"
Cohesion: 0.06
Nodes (33): clean_code_content(), create_tool_call_block(), detect_code_language_and_tool(), download_and_unzip(), execute_graphql_query(), format_default_tool_name(), format_detected_tools(), format_lists_in_text() (+25 more)

### Community 19 - "litextract/__init__.py"
Cohesion: 0.09
Nodes (32): Adjudicator, AgentAdjudicator, _missing(), adjudicate.py — the third-agent "referee". Invoked ONLY on cells the reconciler…, Interface: ``decide(cell, parsed, project) -> decision dict``. decision =…, LLM/agent referee. ``model_fn(field, a, b, snippets, project) -> dict``., find_in_document(), in_document() (+24 more)

### Community 20 - "test_dedup_service.py"
Cohesion: 0.09
Nodes (40): _author_overlap(), deduplicate_studies(), _normalize_authors(), _normalize_doi(), _normalize_pmid(), _normalize_title(), Duplicate detection service for systematic review studies. Detects duplicate…, Normalize a DOI string for comparison. (+32 more)

### Community 21 - "studies.py"
Cohesion: 0.09
Nodes (39): BackgroundTasks, Connection, get, post, put, ai_screen_fulltext(), ai_screen_title_abstract(), auto_extract() (+31 more)

### Community 22 - "PaperTaskExtractor"
Cohesion: 0.07
Nodes (29): PaperTaskExtractor, Any, Agent that extracts generalizable tasks/experiments from academic papers. It…, Process a paper and extract generalizable tasks/experiments, databases, and…, Process a single chunk of the paper to extract tasks. Args: chunk_text (str):…, Consolidate tasks, databases, and software extracted from different chunks into…, Process a paper and return the extracted tasks, databases, and software. Args:…, Initialize the PaperTaskExtractor agent. Args: llm (str): The LLM model to use… (+21 more)

### Community 23 - "tool/molecular_biology.py"
Cohesion: 0.07
Nodes (37): align_sequences(), annotate_open_reading_frames(), annotate_plasmid(), design_golden_gate_oligos(), design_knockout_sgrna(), design_primer(), design_verification_primers(), digest_sequence() (+29 more)

### Community 24 - "generate_variables_from_picos"
Cohesion: 0.08
Nodes (24): _extract_var_list(), _format_variable_dicts(), _generate_heuristic_variables(), generate_variables_from_picos(), Any, Variable auto-generation service: generate extraction variables strictly…, Normalize variable definitions into standard platform format., Generates structured fallback variables matching PICO and domain keywords. (+16 more)

### Community 25 - "a1.py"
Cohesion: 0.06
Nodes (29): AgentState, SourceType, TypedDict, Clear execution plots before new execution. This function clears any previously…, Initialize the biomni agent. Args: path: Path to the data llm: LLM to use for…, Filter out know-how documents that don't allow commercial use. This method…, _apply_matplotlib_patches(), _capture_matplotlib_plots() (+21 more)

### Community 26 - "tool/genomics.py"
Cohesion: 0.06
Nodes (31): analyze_chromatin_interactions(), analyze_comparative_genomics_and_haplotypes(), analyze_genomic_region_overlap(), annotate_celltype_with_panhumanpy(), _fetch_isoform_sequences(), find_enriched_motifs_with_homer(), gene_set_enrichment_analysis(), generate_embeddings_with_state() (+23 more)

### Community 27 - "parse_pdf_pipeline"
Cohesion: 0.10
Nodes (25): parse_pdf_pipeline(), Full multi-channel PDF parsing pipeline: Layout Detection -> (Text: Native,…, _classify_layout_type(), detect_page_layout(), _is_overlapping(), _is_overlapping_any(), LayoutRegion, PageLayout (+17 more)

### Community 28 - "scientific_exports.py"
Cohesion: 0.09
Nodes (32): BibliographyRequest, draft_manuscript_sections(), export_prisma_mermaid(), export_project_bibliography(), ManuscriptDraftRequest, PrismaMermaidRequest, BaseModel, Connection (+24 more)

### Community 29 - "_create_project_and_study"
Cohesion: 0.07
Nodes (17): _create_project_and_study(), Low start, one upgrade → moderate., Upgrading factors should not apply when starting at high., Auto-populate should detect high RoB percentage., Auto-populate should detect low RoB., Auto-populate with no RoB assessments should set none., Helper: create a project, study, and RoB assessment., High start, no downgrades → high. (+9 more)

### Community 30 - "test_ai_integration.py"
Cohesion: 0.10
Nodes (21): fixture, _clean_json_response(), extract_variables_with_aide_engine(), _normalize_extracted_item(), Any, AIDE-Web Enhanced LLM Extraction Service for RadExtract. Incorporates: 1. Field…, Runs AI full-text screening against PICO eligibility criteria. Returns a dict…, Resolves field aliases into standardized AIDE-Web {prompt, response, source,… (+13 more)

### Community 31 - "ToolCallingClient"
Cohesion: 0.11
Nodes (15): get_client(), Shared singleton factory for ToolCallingClient., Retrieve or initialize the global ToolCallingClient instance., assess_study_risk_of_bias(), _fallback_heuristic_assessment(), Any, RCT-Reviewer & Cochrane RoB 2.0 Integration Engine for RadExtract.…, Fast rule-based Cochrane domain assessment matching RCT-Reviewer classifier… (+7 more)

### Community 32 - "react.py"
Cohesion: 0.09
Nodes (17): Add a new tool to the agent's tool registry and make it available for…, AgentState, TypedDict, Create a custom ReAct agent using LangGraph., The state of the agent., Execute the agent with the given prompt. Args: prompt: The user's query, Apply timeout wrapper to all tool functions using multiprocessing., react (+9 more)

### Community 33 - "main.py"
Cohesion: 0.09
Nodes (25): FastAPI, ensure_dirs(), Create required directories if they don't exist., get_db(), FastAPI dependency that yields a database connection and closes it. Usage in…, get_current_user_optional(), Like get_current_user but returns None instead of raising 401., create_app() (+17 more)

### Community 34 - "get_connection"
Cohesion: 0.11
Nodes (28): get_connection(), Get a SQLite connection with WAL mode and foreign keys enabled., Seed script: Pure Arterial Malformations of the Brain (PAM) Systematic Review.…, seed_pam(), auto_populate_factors(), compute_certainty(), create_grade_assessment(), delete_grade_assessment() (+20 more)

### Community 35 - "DeterministicScreener"
Cohesion: 0.12
Nodes (17): RadExtract — radiology systematic review data extraction platform. Built on the…, DeterministicScreener, get_ready_papers(), screening.py — two-stage PRISMA screening for systematic reviews. Implements…, Screen a batch of papers through TA + FT stages. Args: papers: list of paper…, Filter papers that are ready for extraction., Rule-based or injected screener for reproducible tests. Provide ONE of: *…, screen_batch() (+9 more)

### Community 36 - "pdf_service.py"
Cohesion: 0.10
Nodes (28): auto_extract(), _find_keyword_in_text(), _match_variable_to_keywords(), Automated data extraction service: extracts variable values from PDF text using…, Match a variable name/description to search keywords., auto_extract_with_docling(), _extract_from_table_data(), _extract_numeric_from_text() (+20 more)

### Community 37 - "worker.js"
Cohesion: 0.18
Nodes (30): buildHeaders(), buildPayload(), buildUrl(), checkApiKey(), checkRateLimit(), cleanGeminiText(), estimateTokens(), extractResponseText() (+22 more)

### Community 38 - "_create_project_and_study"
Cohesion: 0.10
Nodes (11): _create_project_and_study(), Tests for rob_service.py — CRUD, judgment computation, summary, export., Helper: create a project and study, return (project_id, study_id)., TestAIPrefill, TestAutoSelectAndCreate, TestCreateAssessment, TestDeleteAssessment, TestExport (+3 more)

### Community 39 - "KnowHowLoader"
Cohesion: 0.08
Nodes (16): Know-How library for Biomni agent. This module provides functionality to load…, KnowHowLoader, Loader for know-how documents., Initialize the know-how loader. Args: know_how_dir: Directory containing know-…, Strip the metadata section from document content. Args: content: Full document…, Get all know-how documents as a list. Returns: List of document dictionaries…, Get a specific know-how document by ID. Args: doc_id: Document identifier…, Get summaries of all documents (without full content). Returns: List of… (+8 more)

### Community 40 - "rob.py"
Cohesion: 0.10
Nodes (29): Full assessment with all domain judgments and signaling answers., RobAssessmentDetail, RobAssessmentResponse, accept_ai_suggestions(), adjudicate_assessment(), ai_prefill(), auto_assess_study_rob(), auto_create_assessment() (+21 more)

### Community 41 - "Record"
Cohesion: 0.10
Nodes (19): AgentBackend, extract.py — extractor interface + backends. A *Record* is the generalized…, LLM/agent-driven extractor. ``model_fn(prompt, *, parsed, project, agent_id) ->…, Record, _index(), _is_missing(), _iter_cells(), _key_for() (+11 more)

### Community 42 - "meta.py"
Cohesion: 0.11
Nodes (29): create_meta_analysis(), delete_meta_analysis(), get_forest_plot(), get_funnel_plot(), get_meta_analysis(), get_sroc_curve(), list_meta_analyses(), MetaAnalysisCreate (+21 more)

### Community 43 - "test_routers_rob.py"
Cohesion: 0.07
Nodes (11): client(), project_and_study(), fixture, Tests for routers/rob.py — API endpoint integration tests., Create a project and study, return (project_id, study_id)., TestAIPrefill, TestAssessmentCRUD, TestExport (+3 more)

### Community 44 - "grade.py"
Cohesion: 0.09
Nodes (28): auto_populate_grade(), compute_grade_certainty(), create_grade(), delete_grade(), export_grade(), get_grade(), get_sof_table(), get_starting_level() (+20 more)

### Community 45 - "test_pico_highlight.py"
Cohesion: 0.09
Nodes (28): extract_pico_spans_from_abstract(), Extract PICO spans from a study abstract for highlighting. Returns a list of…, client(), fresh_db(), fixture, Tests for PICO highlighting in screening view (v2.4 feature 5)., GET /studies/{id}/pico-highlight should return highlighted spans., Study without abstract should return empty spans. (+20 more)

### Community 46 - "tool/pharmacology.py"
Cohesion: 0.07
Nodes (22): analyze_accelerated_stability_of_pharmaceutical_formulations(), analyze_pixel_distribution(), analyze_radiolabeled_antibody_biodistribution(), analyze_western_blot(), analyze_xenograft_tumor_growth_inhibition(), calculate_physicochemical_properties(), estimate_alpha_particle_radiotherapy_dosimetry(), grade_adverse_events_using_vcog_ctcae() (+14 more)

### Community 47 - "meta_analysis.py"
Cohesion: 0.11
Nodes (27): compute_effect_size(), compute_heterogeneity(), compute_sroc_curve(), eggers_test(), fit_bivariate_model(), fit_generic_meta_analysis(), funnel_plot_data(), generate_forest_plot_svg() (+19 more)

### Community 48 - "test_r_plot_service.py"
Cohesion: 0.07
Nodes (17): Tests for services/r_plot_service.py — R plot generation with matplotlib…, Funnel plot without Egger result should still work., R should be available in this environment., PRISMA flow diagram should produce valid SVG., Non-existent script should return None., R scripts directory should exist., All 4 R scripts should exist., Forest plot should produce valid SVG. (+9 more)

### Community 49 - "BiomniEval1"
Cohesion: 0.09
Nodes (15): BiomniEval1, main(), Any, DataFrame, BiomniEval1: Evaluation loader for Biomni tasks This class provides a unified…, Evaluation loader for BiomniEval1 benchmark Usage: evaluator =…, Get information about a specific instance Args: task_name: Name of the task…, Get list of all available tasks (+7 more)

### Community 50 - "popup.js"
Cohesion: 0.11
Nodes (22): buildInspection(), chooseGeminiTab(), cookieKey(), CORE_REQUIRED, EXPORT_ORDER, exportButton, getActiveGeminiAccount(), inspectButton (+14 more)

### Community 51 - "test_routers_grade.py"
Cohesion: 0.08
Nodes (13): client(), fresh_db(), project_with_study(), fixture, Tests for routers/grade.py — GRADE API endpoints., Create a project with an included RCT study and a RoB assessment., TestAutoPopulate, TestComputeCertainty (+5 more)

### Community 52 - "DeterministicAdjudicator"
Cohesion: 0.16
Nodes (23): adjudicate_cells(), DeterministicAdjudicator, Source-grounded referee: pick the candidate present in the document., Run the referee over every non-agreeing cell. Returns {"decisions": [{**cell,…, _as_dict(), audit.py — persist the four per-run transparency sidecars. For each…, Write the four sidecars for one document into ``out_dir/<doc_id>/``., write_audit() (+15 more)

### Community 53 - "validate"
Cohesion: 0.11
Nodes (15): Validate a records structure ({sheet: [row,...]}) against the project. Returns…, validate(), Modality=CT → Field Strength not required., kVp missing when Modality=CT → error., Contrast Dose missing when Contrast Agent=gadolinium (≠ none) → error., Contrast Agent=none → Contrast Dose not required., Field Strength=NR when Modality=MRI → no error (NR is a valid answer)., QUADAS-2 D1 missing when Assessment Tool=QUADAS_2 → error. (+7 more)

### Community 54 - "charts.py"
Cohesion: 0.14
Nodes (24): create_forest_plot(), create_funnel_plot(), create_rob_traffic_light(), ForestPlotRequest, FunnelPlotRequest, BaseModel, post, Router for Scientific Visualization & Plot Generation. Adapted from K-Dense-AI… (+16 more)

### Community 55 - "validate_tool_response"
Cohesion: 0.14
Nodes (12): get_response_schema(), get_tool(), get_tools_for_request(), Any, Central Tool Registry for VDExtract. Defines tool specifications in OpenAI…, Get the OpenAI function-calling definition for a tool., Get the JSON schema for validating a tool's output., Get a list of tool definitions formatted for the OpenAI tools parameter. (+4 more)

### Community 56 - "tool/database.py"
Cohesion: 0.10
Nodes (24): blast_sequence(), get_genes_near_ccre(), get_hpo_names(), Any, query_alphafold(), query_clinvar(), query_dbsnp(), query_geo() (+16 more)

### Community 57 - "tool/microbiology.py"
Cohesion: 0.08
Nodes (24): analyze_arsenic_speciation_hplc_icpms(), annotate_bacterial_genome(), count_bacterial_colonies(), enumerate_bacterial_cfu_by_serial_dilution(), model_bacterial_growth_dynamics(), optimize_anaerobic_digestion_process(), predict_rna_secondary_structure(), quantify_biofilm_biomass_crystal_violet() (+16 more)

### Community 58 - "tools.py"
Cohesion: 0.12
Nodes (19): _build_tool_choice_instruction(), build_tool_prompt(), _compress_b64_if_needed(), _decode_data_url(), google_contents_to_prompt(), _google_tool_choice_instruction(), _image_from_part(), _image_from_url() (+11 more)

### Community 59 - "_records_struct_from"
Cohesion: 0.11
Nodes (21): assemble_reconciled(), Turn a single Record into {sheet: [row,...]} keyed by data sheet., Build the final {sheet: [row,...]} using Agent A as the base, then apply…, _records_struct_from(), Acceptance test 2 — two-agent agreement. Identical A/B records → reconciler…, test_agreed_records_validate_clean(), _clone_toy_with_severity(), Acceptance test 5 — validation is config-driven. (a) The CVR ruleset reproduces… (+13 more)

### Community 60 - "DeterministicSchemaGenerator"
Cohesion: 0.12
Nodes (13): DeterministicSchemaGenerator, _generate_merged_codebook(), LLMSchemaGenerator, PICOS, picos_schema_generator.py — generate topic-specific extraction fields from…, PICOS input for a systematic review., Interface: ``generate_fields(picos) -> list[GeneratedField]``., Returns injected fields, for reproducible tests. Provide ONE of: * ``fields`` —… (+5 more)

### Community 61 - "._process_ai_message"
Cohesion: 0.09
Nodes (19): Process AI messages. This function handles AI messages in the conversation…, Process AI message with execution results. This function handles AI messages…, Format and add content to markdown. This function applies formatting to AI…, Add plots from execution results. This function adds captured plots and images…, Process regular AI message without execution results. This function handles AI…, find_matching_execution(), format_execute_tags_in_content(), format_observation_as_terminal() (+11 more)

### Community 62 - "base_task"
Cohesion: 0.11
Nodes (4): base_task, humanity_last_exam, lab_bench, shuffle()

### Community 63 - "test_dual_reviewer.py"
Cohesion: 0.09
Nodes (11): client(), fresh_db(), project_study_extraction(), fixture, Tests for dual-reviewer verification and adjudication endpoints., Test RoB assessment verification., Create project, study, variable, and a primary extraction., TestExtractionAdjudication (+3 more)

### Community 64 - "test_screening_decisions.py"
Cohesion: 0.14
Nodes (23): client(), _create_project_and_studies(), fresh_db(), _make_decision(), fixture, Tests for blinded multi-reviewer screening (v2.4 feature 2)., When two reviewers agree, no conflict should be created., PUT /screening-conflicts/{id}/resolve should resolve a conflict. (+15 more)

### Community 65 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 66 - "tool/lab_automation.py"
Cohesion: 0.13
Nodes (22): _collect_docs_from_github_zip(), _create_test_result(), _execute_script_safely(), _format_liquid_user_guide(), get_pylabrobot_documentation_liquid(), get_pylabrobot_documentation_material(), _load_pylabrobot_tutorial_content(), _modify_script_for_testing() (+14 more)

### Community 67 - "TestPICOEndpoints"
Cohesion: 0.09
Nodes (12): New project should have empty hypothesis., Updating hypothesis should persist., Secondary hypotheses should persist and be retrievable., Hypothesis should persist after update., New project should have empty PICO., Updating PICO should persist values., PICO should persist after update., PICO with only some fields filled should still be is_defined=True if any field… (+4 more)

### Community 68 - "App.tsx"
Cohesion: 0.12
Nodes (14): App(), RobSummary, queryClient, AnalysisPage(), ExportPage(), MetaAnalysisPage(), MetaResult, StudyData (+6 more)

### Community 69 - "FunctionGenerator"
Cohesion: 0.12
Nodes (11): base_agent, FunctionGenerator, Extract the first fenced code block (``` or ```python) from s., Agent that generates executable Python code scripts given a task description., Initialize the PaperTaskExtractor agent. Args: llm (str): The LLM model to use…, Configure the agent with appropriate prompts., Generate codes given a task description. Args: task_description (str): task…, Generate a safe, meaningful Python script filename from a task description.… (+3 more)

### Community 70 - "tool/physiology.py"
Cohesion: 0.09
Nodes (20): analyze_abr_waveform_p1_metrics(), analyze_ciliary_beat_frequency(), analyze_endolysosomal_calcium_dynamics(), analyze_fatty_acid_composition_by_gc(), analyze_hemodynamic_data(), analyze_protein_colocalization(), calculate_brain_adc_map(), perform_cosinor_analysis() (+12 more)

### Community 71 - "schema.py"
Cohesion: 0.13
Nodes (19): controlled_vocab(), load_codebook(), codebook.py — generic codebook loader. The codebook workbook (a sheet, by…, Parse an 'Allowed/Standardized Entries' cell into a token list. Controlled…, Return (codebook, sheet_order, controlled_vocab). codebook: {(sheet, name):…, Extract {(sheet, name): [allowed,...]} for closed-vocabulary fields only., Assert live sheet headers (row 1) match the Codebook order. Returns (ok: bool,…, split_allowed() (+11 more)

### Community 72 - "test_end_to_end.py"
Cohesion: 0.14
Nodes (16): DeterministicBackend, Any, Reproducible extractor. Provide ONE of: * ``record_fn(parsed, project,…, generate_project_config(), Generate a complete LitExtract config folder from PICOS + base template. Args:…, _make_extraction_record(), _make_picos_fields(), _make_sample_papers() (+8 more)

### Community 73 - "validate.py"
Cohesion: 0.17
Nodes (21): _blank(), _check_required(), _check_vocab(), _num(), validate.py — config-driven validation. Generalizes the original hardcoded…, A field is required when another field in the same row has a specific value.…, Read a written workbook into the {sheet: [row_dict,...]} records structure., True only when a cell is genuinely empty / an unfilled dropdown default.… (+13 more)

### Community 74 - "biomni.py"
Cohesion: 0.16
Nodes (20): AdmetRequest, cross_reference_entity(), EntityRequest, get_admet_prediction(), get_supplementary(), BaseModel, post, FastAPI Router for Biomni Biomedical Intelligence Tools. (+12 more)

### Community 75 - "r_plot_service.py"
Cohesion: 0.12
Nodes (21): generate_funnel_plot_svg(), Generate a funnel plot as an SVG string using R metafor (with matplotlib…, _cache_key(), call_r_script(), generate_forest_plot(), generate_funnel_plot(), generate_sroc_curve(), _is_r_available() (+13 more)

### Community 76 - "get_llm"
Cohesion: 0.11
Nodes (12): BaseChatModel, qa_llm, BiomniConfig, Biomni Configuration Management Simple configuration class for centralizing…, Central configuration for Biomni agent. All settings are optional and have…, Load any environment variable overrides if they exist., Convert config to dictionary for easy access., get_llm() (+4 more)

### Community 77 - "tool/immunology.py"
Cohesion: 0.10
Nodes (20): analyze_atac_seq_differential_accessibility(), analyze_bacterial_growth_curve(), analyze_cfse_cell_proliferation(), analyze_cns_lesion_histology(), analyze_cytokine_production_in_cd4_tcells(), analyze_ebv_antibody_titers(), analyze_immunohistochemistry_image(), estimate_cell_cycle_phase_durations() (+12 more)

### Community 78 - "dependencies"
Cohesion: 0.10
Nodes (21): clsx, date-fns, lucide-react, pdfjs-dist, dependencies, clsx, date-fns, lucide-react (+13 more)

### Community 79 - "extraction.py"
Cohesion: 0.17
Nodes (20): ExtractionCreate, ExtractionResponse, ExtractionUpdate, adjudicate_extraction(), create_extraction(), ExtractionAdjudicateRequest, ExtractionVerifyRequest, get_audit_log() (+12 more)

### Community 80 - "MockProcessor"
Cohesion: 0.14
Nodes (9): MockProcessor, Deterministic processor for tests — builds ProcessedDocument from text. No PDF…, Save to a regular (non-S3) path should work directly., The parsed dict should work with litextract.document.find_in_document., Pages with very little text should be triaged as SCANNED., Mix of text and empty pages should be PARTIAL., TestIntegrationWithLitExtract, TestMockProcessor (+1 more)

### Community 81 - "_load_graph"
Cohesion: 0.13
Nodes (21): _build_review_graph(), _filter_graph(), get_code_graph(), get_code_graph_for_community(), get_code_graph_for_file(), get_code_graph_stats(), get_review_graph(), get_review_graph_stats() (+13 more)

### Community 82 - "pubmed.py"
Cohesion: 0.13
Nodes (20): BatchSearchRequest, get_pubmed_key(), PreviewSearchRequest, pubmed_batch(), pubmed_fulltext(), pubmed_lookup(), pubmed_preview(), BaseModel (+12 more)

### Community 83 - "rob_tools.py"
Cohesion: 0.15
Nodes (16): auto_select_tool(), get_rob_tool(), list_rob_tools(), List all available RoB tools with full definitions., Get a specific RoB tool definition., Auto-select the appropriate RoB tool based on study design., AI-assisted risk-of-bias pre-fill. Uses the existing model_fn(prompt, **kwargs)…, Domain (+8 more)

### Community 84 - "AnalysisPage.tsx"
Cohesion: 0.10
Nodes (8): AnalysisOutcome, AnalysisProfile, ForestPlotData, FunnelPlotData, HeterogeneityResult, SensitivityResult, CorrelationHeatmap(), Tab

### Community 85 - "SegmentationTool"
Cohesion: 0.11
Nodes (15): create_segmentation_visualization(), prepare_input_for_nnunet(), Convenience function for segmentation visualization, Setup nnU-Net environment variables according to official documentation Args:…, Download model with browser-like headers to bypass Zenodo's anti-bot protection, Download and extract nnUNet model with browser-like headers - extracts directly…, Segment images using nnUNet with proper environment setup and automatic model…, A comprehensive tool for medical image segmentation using nnUNet. Handles BRATS… (+7 more)

### Community 86 - "server.py"
Cohesion: 0.15
Nodes (13): find_config(), load_config(), Configuration management., Load config from JSON file., Search for config file in standard locations., gemini-web2api: Gemini Web to OpenAI API proxy., main(), Entry point: python -m gemini_web2api (+5 more)

### Community 87 - "pdf_highlights.py"
Cohesion: 0.14
Nodes (19): create_highlight(), delete_highlight(), HighlightCreate, HighlightUpdate, list_project_highlights(), list_study_highlights(), BaseModel, Connection (+11 more)

### Community 88 - "search_string_generator.py"
Cohesion: 0.12
Nodes (16): _build_cinahl_block(), _build_cochrane_block(), _build_embase_block(), _build_pubmed_block(), _build_scopus_block(), _build_wos_block(), _lookup_term(), Search string generation service: generate database-specific search strings… (+8 more)

### Community 89 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 90 - "install_cli_tools.sh"
Cohesion: 0.23
Nodes (17): add_new_tool(), add_path_to_profile(), cleanup_old_installations(), install_all_tools(), install_cli_tools(), install_tool(), install_tool_from_config(), PATH (+9 more)

### Community 91 - "tool/genetics.py"
Cohesion: 0.11
Nodes (18): analyze_cas9_mutation_outcomes(), analyze_crispr_genome_editing(), analyze_protein_phylogeny(), bayesian_finemapping_with_deep_vi(), fit_genomic_prediction_model(), identify_transcription_factor_binding_sites(), liftover_coordinates(), perform_pcr_and_gel_electrophoresis() (+10 more)

### Community 92 - "OpenFDAClient"
Cohesion: 0.14
Nodes (10): OpenFDAClient, Client for interacting with the FDA's OpenFDA API. Provides comprehensive drug…, Implement rate limiting to respect FDA API limits., Validate FDA API response structure and handle variations., Handle known FDA API endpoint variations and parameter mappings., Build FDA API search parameters from input parameters., Make API request with retry logic and error handling., Query adverse events with robust error handling and validation. (+2 more)

### Community 93 - "devDependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks (+11 more)

### Community 94 - "GeminiHandler"
Cohesion: 0.23
Nodes (8): Resolve model name to (name, mode_id, think_mode, error, extra_fields). Unknown…, resolve_model(), GeminiHandler, BaseHTTPRequestHandler, Upload images and return list of file references. Returns None if no images., _upload_images(), parse_tool_calls(), Extract tool_call blocks. Returns (clean_text, tool_calls_list).

### Community 95 - "test_document_processor.py"
Cohesion: 0.17
Nodes (12): FigureAnnotation, load_processed_document(), document_processor.py — Docling wrapper for PDF → structured JSON with bounding…, A text segment with its location on the page., A table with its location and cell-level bounding boxes., Save a ProcessedDocument to JSON. Stages in /workspace for S3 safety., Load a ProcessedDocument from a saved JSON file., A figure/image with its location. (+4 more)

### Community 96 - "test_pico_hypothesis.py"
Cohesion: 0.12
Nodes (13): client(), fresh_db(), project(), fixture, Tests for PICO and Hypothesis endpoints in routers/projects.py., Use a temporary database for each test., Create a study with full metadata., Should return citations in all 6 formats. (+5 more)

### Community 97 - "ImageRegistrationTool"
Cohesion: 0.15
Nodes (11): calculate_similarity_metrics(), ImageRegistrationTool, A comprehensive tool for medical image registration using SimpleITK. Supports…, Initialize the ImageRegistrationTool., Load a medical image using SimpleITK. Args: image_path: Path to the image file…, Save a SimpleITK image to file. Args: image: SimpleITK Image object…, Preprocess an image with denoising and normalization. Args: image: Input…, Create a rigid transform for image registration. Args: fixed_image: Reference… (+3 more)

### Community 98 - "TestGenerateProjectConfig"
Cohesion: 0.11
Nodes (6): fixture, Generate a project config once for all tests in this class., The generated config must load with LitExtract's load_project., The generated config should validate records without errors., Clean up generated config after tests., TestGenerateProjectConfig

### Community 99 - "compute_overall_judgment"
Cohesion: 0.15
Nodes (11): compute_overall_judgment(), compute_quadas2_overall(), compute_rob2_overall(), compute_robins_i_overall(), QUADAS-2 overall: typically the highest risk among domains (sensitivity-first)., ROBINS-I overall: at least as severe as the most severe domain., RoB 2 overall: Low (all low), Some concerns (≥1 some concerns), High (≥1 high…, Dispatch to the appropriate tool's overall judgment algorithm. (+3 more)

### Community 100 - "generate_search_strings"
Cohesion: 0.18
Nodes (6): generate_search_strings(), Generate database-specific search strings from PICO framework. Args: pico: dict…, Tests for generate_search_strings function., Missing comparator and study design should still produce strings., Empty PICO should produce empty strings., TestGenerateSearchStrings

### Community 101 - "patch"
Cohesion: 0.12
Nodes (11): patch, Non-existent PMID should return 404., Batch search should return results list., Empty query should return 400., max_results > 200 should return 400., Full text not in PMC or Unpaywall should report has_fulltext=False., Full text available via Unpaywall should report has_fulltext=True., PMID lookup should return study metadata. (+3 more)

### Community 102 - "RobAssessmentPage.tsx"
Cohesion: 0.27
Nodes (14): RobDomainJudgment, RobSignalingAnswer, cn(), judgmentColor(), judgmentDotColor(), judgmentLabel(), DomainJudgmentSelect(), formatAnswer() (+6 more)

### Community 103 - "tool/literature.py"
Cohesion: 0.12
Nodes (16): advanced_web_search_claude(), extract_pdf_content(), extract_url_content(), fetch_supplementary_info_from_doi(), query_arxiv(), query_pubmed(), query_scholar(), Query Google Scholar for papers based on the provided search query. Parameters… (+8 more)

### Community 104 - "tool/synthetic_biology.py"
Cohesion: 0.12
Nodes (16): analyze_bacterial_growth_rate(), analyze_barcode_sequencing_data(), analyze_bifurcation_diagram(), create_biochemical_network_sbml_model(), engineer_bacterial_genome_for_therapeutic_delivery(), identify_fas_functional_domains(), optimize_codons_for_heterologous_expression(), Identifies functional domains within a Fatty Acid Synthase (FAS) sequence and… (+8 more)

### Community 105 - "log"
Cohesion: 0.21
Nodes (15): _get_ssl_ctx(), load_cookie(), log(), make_sapisidhash(), Load cookie from file with mtime-based caching., _cached_page_tokens(), detect_image_mime(), fetch_image_bytes() (+7 more)

### Community 106 - "StreamingEndpointTests"
Cohesion: 0.25
Nodes (3): _decode_sse(), patch, StreamingEndpointTests

### Community 107 - "test_rob_tools.py"
Cohesion: 0.16
Nodes (10): parametrize, compute_domain_judgment(), compute_quadas2_domain_judgment(), Compute QUADAS-2 domain risk-of-bias judgment from signaling question answers.…, Dispatch to the appropriate tool's domain judgment algorithm., Tests for rob_tools.py — RoB tool definitions, auto-selection, and judgment…, Test QUADAS-2 domain judgment algorithm., Test auto-selection of RoB tool by study design. (+2 more)

### Community 108 - "compare_values"
Cohesion: 0.19
Nodes (16): compare_values(), Parse the FIRST numeric token in a value; None if not a clean scalar. Returns…, Return 'agree' | 'disagree' | 'one_missing' for a single cell., _to_number(), Acceptance test 3 — type-aware matching. The reconciler's comparator is…, test_enum_different_tokens_disagree(), test_enum_whitespace_insensitive_agree(), test_float_outside_tolerance_disagree() (+8 more)

### Community 109 - "parse_json_from_text"
Cohesion: 0.11
Nodes (14): _extract_balanced_json(), parse_json_from_text(), Shared JSON extraction and repair utilities for LLM responses. Extracts and…, Extract and parse JSON (dict or list) from LLM text output. Handles: -…, Finds the first balanced { ... } or [ ... ] substring and parses it., Any, Standard prompt-and-parse fallback without tool schemas, with retry logic., Parse raw text into a schema-validated tool response. (+6 more)

### Community 110 - "prefill_assessment"
Cohesion: 0.21
Nodes (10): _avg_confidence(), mock_model_fn(), _mock_support(), prefill_assessment(), Compute average confidence across answers., Run AI pre-fill for all domains of a RoB assessment. Args: tool_key: RoB tool…, Deterministic mock model_fn for testing. Analyzes the prompt text to produce…, Generate mock support text for a domain judgment. (+2 more)

### Community 111 - "generate_criteria_from_pico"
Cohesion: 0.17
Nodes (9): generate_criteria_from_pico(), Auto-generate inclusion/exclusion criteria from PICO elements. Args: pico: dict…, Tests for generate_criteria_from_pico function., 4 PICO elements (P, I, O, S) → 4 inclusion criteria., Should have at least 3 default exclusion criteria., When comparator is defined, an exclusion criterion references it., Empty PICO should produce no inclusion criteria but still have default…, Partial PICO should produce criteria only for defined elements. (+1 more)

### Community 112 - "GradePage.tsx"
Cohesion: 0.18
Nodes (5): GradeAssessment, GradeFactor, CERTAINTY_BG, CERTAINTY_COLORS, GradePage()

### Community 113 - "gemini.py"
Cohesion: 0.23
Nodes (15): _account_prefix(), _build_headers(), clean_text(), extract_response_text(), _extract_texts_from_line(), generate(), generate_stream(), _get_httpx_client() (+7 more)

### Community 114 - "variables.py"
Cohesion: 0.19
Nodes (15): VariableCreate, VariableResponse, VariableUpdate, auto_generate_variables(), create_variable(), delete_variable(), list_variables(), Connection (+7 more)

### Community 115 - "literature_search.py"
Cohesion: 0.18
Nodes (14): MultiSearchRequest, BaseModel, post, Router for Multi-Database Literature Discovery. Adapted from K-Dense-AI paper-…, Unified literature search across PubMed and OpenAlex with deduplication., search_literature(), Any, Multi-Database Literature Search Engine for RadExtract. Adapted from K-Dense-AI… (+6 more)

### Community 116 - "test_exclusion_reasons.py"
Cohesion: 0.17
Nodes (15): client(), _create_project(), fresh_db(), fixture, Tests for exclusion reason taxonomy (v2.4 feature 3)., GET /projects/{id}/exclusion-reasons should return default taxonomy., PUT /projects/{id}/exclusion-reasons should update the taxonomy., POST /projects/{id}/exclusion-reasons/reset should restore defaults. (+7 more)

### Community 117 - "tool/bioengineering.py"
Cohesion: 0.13
Nodes (14): analyze_calcium_imaging_data(), analyze_cell_migration_metrics(), analyze_in_vitro_drug_release_kinetics(), analyze_myofiber_morphology(), decode_behavior_from_neural_trajectories(), perform_crispr_cas9_genome_editing(), Model neural activity trajectories and decode behavioral variables. Parameters…, Simulate a whole-cell model represented as a system of ordinary differential… (+6 more)

### Community 118 - "tool/pathology.py"
Cohesion: 0.13
Nodes (14): analyze_aortic_diameter_and_geometry(), analyze_atp_luminescence_assay(), analyze_bone_microct_morphometry(), analyze_intracellular_calcium_with_rhod2(), analyze_thrombus_histology(), quantify_corneal_nerve_fibers(), Analyze aortic diameter and geometry from cardiovascular imaging data. This…, Analyze luminescence-based ATP assay data to determine intracellular ATP… (+6 more)

### Community 119 - "_process_ddinter_data_inline"
Cohesion: 0.14
Nodes (15): _build_drug_registry_inline(), _create_interaction_matrix_inline(), _create_name_mapping_inline(), find_roi_from_image(), _generate_ddinter_statistics_inline(), _process_ddinter_data_inline(), Find the ROIs of the bands from the image which is determined by…, Process DDInter CSV files into standardized pickle files. This function… (+7 more)

### Community 120 - "tool/systems_biology.py"
Cohesion: 0.13
Nodes (14): compare_protein_structures(), model_protein_dimerization_network(), perform_flux_balance_analysis(), query_chatnt(), Model protein dimerization networks to find equilibrium concentrations of…, Call ChatNT to answer a question about a DNA sequence. Parameters: -----------…, Construct and simulate kinetic models of metabolic networks and analyze their…, Perform Flux Balance Analysis (FBA) on a genome-scale metabolic network model.… (+6 more)

### Community 121 - "manifest.json"
Cohesion: 0.13
Nodes (14): action, default_popup, default_title, description, host_permissions, manifest_version, name, permissions (+6 more)

### Community 122 - "ScreeningDecision"
Cohesion: 0.27
Nodes (5): advance_status(), Result of screening one paper at one stage., Compute the final screening status from TA + FT decisions., ScreeningDecision, TestAdvanceStatus

### Community 123 - "TestPdfService"
Cohesion: 0.13
Nodes (8): Test getting a lightweight summary., Summary for unprocessed study should return processed=False., Test deleting processed PDF data., Processing a study without a PDF should raise ValueError., Test that PDF processing extracts text and stores it., Test retrieving processed PDF data., Test getting just the full text., TestPdfService

### Community 124 - "_load_ddinter_data"
Cohesion: 0.19
Nodes (14): analyze_interaction_mechanisms(), check_drug_combination_safety(), find_alternative_drugs_ddinter(), _format_interaction_result(), _load_ddinter_data(), query_drug_interactions(), Load DDInter datasets from pickle files, processing if needed. Parameters…, Standardize drug names using fuzzy matching against DDInter database.… (+6 more)

### Community 125 - "DoclingProcessor"
Cohesion: 0.19
Nodes (5): DoclingProcessor, Wraps IBM Docling's DocumentConverter for PDF → structured JSON. Lazy-…, Convert a single PDF to a ProcessedDocument. Raises RuntimeError if Docling is…, Convert a DoclingDocument into parsed dict + annotation lists. Docling's…, Convert Docling TableData to a list-of-lists row format.

### Community 126 - "test_ai_screening.py"
Cohesion: 0.25
Nodes (13): _add_decision(), client(), _create_project(), _create_study(), fresh_db(), fixture, Tests for AI screening prioritization (v2.4 feature 4)., After prioritization, ai_priority_score should be stored in DB. (+5 more)

### Community 127 - "tool/biochemistry.py"
Cohesion: 0.15
Nodes (12): analyze_circular_dichroism_spectra(), analyze_enzyme_kinetics_assay(), analyze_itc_binding_thermodynamics(), analyze_protease_kinetics(), analyze_protein_conservation(), analyze_rna_secondary_structure_features(), Analyzes circular dichroism (CD) spectroscopy data to determine secondary…, Calculate numeric values for various structural features of an RNA secondary… (+4 more)

### Community 128 - "tool/bioimaging.py"
Cohesion: 0.24
Nodes (10): batch_register_images(), preprocess_image(), quick_affine_registration(), quick_deformable_registration(), quick_rigid_registration(), Standalone image preprocessing function for Biomni integration. Args:…, Quick rigid registration function for Biomni integration. Args:…, Quick affine registration function for Biomni integration. Args:… (+2 more)

### Community 129 - "tool/cancer_biology.py"
Cohesion: 0.15
Nodes (12): analyze_cell_senescence_and_apoptosis(), analyze_copy_number_purity_ploidy_and_focal_events(), analyze_ddr_network_in_cancer(), detect_and_annotate_somatic_mutations(), detect_and_characterize_structural_variations(), perform_gene_expression_nmf_analysis(), Analyze DNA Damage Response (DDR) network alterations and dependencies in…, Analyze flow cytometry data to quantify senescent and apoptotic cell… (+4 more)

### Community 130 - "tool/protocols.py"
Cohesion: 0.22
Nodes (12): get_protocol_details(), _get_protocols_directory(), list_local_protocols(), Any, Protocols.io API integration for searching and retrieving biological protocols.…, Get detailed information about a specific protocol by ID. Args: protocol_id:…, Get the path to the local protocols directory., List available protocol files in the local biomni/tool/protocols/ directory.… (+4 more)

### Community 132 - "build_domain_prompt"
Cohesion: 0.21
Nodes (6): build_domain_prompt(), _mock_answer(), Generate a deterministic mock answer for a signaling question. Uses keyword…, Construct an LLM prompt for a single RoB domain. The prompt asks the model to…, TestMockModelFn, TestPromptConstruction

### Community 133 - "ReviewPage.tsx"
Cohesion: 0.33
Nodes (3): ReviewMatrix, ReviewProgress, ReviewPage()

### Community 134 - "_standardize_drug_name_fda"
Cohesion: 0.18
Nodes (12): analyze_fda_safety_signals(), check_fda_drug_recalls(), _extract_fda_safety_signals(), _format_recall_summary(), _format_safety_signal_summary(), Standardize drug names for FDA API queries., Extract safety signals from adverse event data., Format recall information into structured output. (+4 more)

### Community 135 - "test_modular_sync.py"
Cohesion: 0.26
Nodes (5): _apply_chat_persistence_flags(), _build_payload(), Apply Gemini Web persistence flags to an outgoing request payload., _decode_payload(), PayloadPersistenceTests

### Community 136 - "Schema"
Cohesion: 0.18
Nodes (6): Resolve a field's type: explicit field_types override, else mapped from the…, Schema, cond_project(), fixture, test_conditional_required.py — test the new conditional_required validation…, A minimal project with conditional_required rules for testing.

### Community 137 - "ProcessedDocument"
Cohesion: 0.21
Nodes (4): ProcessedDocument, Convert multiple PDFs. Failed conversions are skipped with a warning., Build a ProcessedDocument directly from a pre-parsed dict (for tests)., Unified output: parsed dict (for extraction) + annotations (for UI).

### Community 138 - "TestDoclingProcessor"
Cohesion: 0.23
Nodes (6): Normalize a Docling BoundingBox to [0,1] coordinates relative to page size.…, Test bbox normalization with TOPLEFT origin., Should return None when page_size is None., Coordinates should be clamped to [0, 1]., Test conversion of Docling TableData to row format., TestDoclingProcessor

### Community 139 - "get_processor"
Cohesion: 0.20
Nodes (9): get_processor(), process_batch(), process_pdf(), Any, Return the best available processor. Prefers Docling when installed; falls back…, Convert a single PDF using the best available processor., Convert multiple PDFs using the best available processor., process_pdf should work with text files via fallback. (+1 more)

### Community 140 - "pubmed_service.py"
Cohesion: 0.24
Nodes (11): batch_search(), _eutils_url(), fetch_by_pmid(), fetch_fulltext(), preview_search(), PubMed integration service: fetch study metadata and full text via NCBI…, Attempt to retrieve full-text for a PMID. Tries: 1. PMC Open Access via…, Build an E-utilities URL with optional API key. (+3 more)

### Community 141 - "api"
Cohesion: 0.18
Nodes (5): api, Criterion, SecondaryHypothesis, DATABASES, PicoHypothesisPage()

### Community 142 - "main"
Cohesion: 0.25
Nodes (10): check_subject_availability(), combine_summaries(), main(), parse_arguments(), process_subject(), Check which subjects have papers available in the metadata. Args:…, Process a single subject by calling the extract_biorxiv_tasks.py script. Args:…, Combine frequency summaries from all subjects into a single summary. Args:… (+2 more)

### Community 143 - "tool/cell_biology.py"
Cohesion: 0.18
Nodes (10): analyze_flow_cytometry_immunophenotyping(), analyze_mitochondrial_morphology_and_potential(), perform_facs_cell_sorting(), quantify_and_cluster_cell_motility(), quantify_cell_cycle_phases_from_microscopy(), Quantify cell motility features from time-lapse microscopy images and cluster…, Quantify the percentage of cells in each cell cycle phase using Calcofluor…, Performs Fluorescence-Activated Cell Sorting (FACS) to enrich cell populations… (+2 more)

### Community 144 - "LLMScreener"
Cohesion: 0.22
Nodes (4): LLMScreener, LLM-driven screener. ``model_fn(prompt, **kwargs) -> dict`` must return a dict…, Interface: ``screen_title_abstract(paper, picos) -> ScreeningDecision``., Screener

### Community 145 - "PlaywrightService"
Cohesion: 0.22
Nodes (4): PlaywrightService, Playwright Automation and Crawler Service for RadExtract Platform. Provides…, Navigates to a web page or local view and captures a full-page screenshot., Automates browser navigation to resolve OpenAccess / Publisher DOIs and…

### Community 146 - "test_search_string_generator.py"
Cohesion: 0.25
Nodes (6): _extract_key_phrases(), Extract key phrases from a PICO field text. Splits on commas, semicolons,…, Tests for services/search_string_generator.py — database-specific search…, Tests for _extract_key_phrases helper., Phrases that are only stopwords should be filtered out., TestExtractKeyPhrases

### Community 147 - "TestToolDefinitions"
Cohesion: 0.18
Nodes (3): Test that tool definitions are structurally correct., ROBINS-I and RoB 2 should have conditional signaling questions., TestToolDefinitions

### Community 148 - "color_print"
Cohesion: 0.31
Nodes (4): BaseCallbackHandler, color_print(), NodeLogger, PromptLogger

### Community 149 - "parse_tool_calls_with_modules"
Cohesion: 0.20
Nodes (8): Parse code to detect imported tools by looking for import statements. Args:…, Parse code to detect imported tools and their modules. Args: code: The Python…, find_best_module_match(), parse_tool_calls_from_code(), parse_tool_calls_with_modules(), Parse code to detect imported tools by analyzing import statements. This…, Parse code to detect imported tools and their associated modules. This function…, Find the best matching module from a list of available modules. This function…

### Community 150 - "._process_message"
Cohesion: 0.20
Nodes (7): Process a single message and return updated state. This function is the main…, Process human messages. This function handles human messages in the…, Process other message types. This function handles message types that are…, clean_message_content(), create_parsing_error_html(), Clean message content by removing ANSI escape codes. This function removes ANSI…, Create HTML markup for displaying parsing errors in markdown output. This…

### Community 151 - "FallbackProcessor"
Cohesion: 0.27
Nodes (5): FallbackProcessor, Fallback PDF processor using LitExtract's existing pdfplumber-based parser.…, FallbackProcessor should handle .txt files via parse_document., Batch should not fail entirely if one file is bad., TestFallbackProcessor

### Community 152 - "GeneratedField"
Cohesion: 0.20
Nodes (6): GeneratedField, A topic-specific field generated from PICOS., Return a tuple matching the codebook column layout., Return a field_types entry for schema.yaml., Return a prompt entry for field_prompts.json., Return validation rules for this field (range or vocab).

### Community 153 - "test_screening_extensions.py"
Cohesion: 0.22
Nodes (9): client(), fixture, Test PubMed preview search dry-run endpoint., Test agreement endpoint when no dual decisions exist., Test Cohen's kappa and agreement calculation with dual reviews., sample_project(), test_pubmed_preview_dry_run(), test_reviewer_agreement_endpoint_empty() (+1 more)

### Community 154 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 155 - "ScreeningPage.tsx"
Cohesion: 0.22
Nodes (6): AiScreenResult, BatchUploadResult, PicoHighlightSpan, ScreeningSummary, Study, ScreeningPage()

### Community 156 - "CodeGraphPage.tsx"
Cohesion: 0.22
Nodes (8): CodeGraph, CodeGraphLink, CodeGraphNode, CodeGraphStats, CodeGraphNodeComponent(), CodeGraphPage(), EDGE_COLORS, NODE_COLORS

### Community 157 - "export_project"
Cohesion: 0.31
Nodes (9): FileResponse, _export_csv(), export_project(), _export_xlsx(), Connection, get, Export all project data (extractions + RoB) as CSV or Excel., export_rob() (+1 more)

### Community 158 - "tests_existing/conftest.py"
Cohesion: 0.33
Nodes (8): cvr_project(), cvr_record_choi(), cvr_source_text(), fixture, Shared pytest fixtures for the litextract test suite. All tests use the…, Minimal source text containing values the deterministic referee checks., toy_project(), toy_records_valid()

### Community 160 - "parse_llm_response"
Cohesion: 0.33
Nodes (4): parse_llm_response(), Any, Parse the LLM response into structured RoB answers. Handles both dict responses…, TestResponseParsing

### Community 161 - "compute_rob2_domain_judgment"
Cohesion: 0.33
Nodes (4): compute_rob2_domain_judgment(), Compute RoB 2 domain risk-of-bias judgment from signaling question answers.…, Test RoB 2 domain judgment algorithm., TestRob2DomainJudgment

### Community 162 - "compute_robins_i_domain_judgment"
Cohesion: 0.33
Nodes (4): compute_robins_i_domain_judgment(), Compute ROBINS-I domain risk-of-bias judgment from signaling question answers.…, Test ROBINS-I domain judgment algorithm., TestRobinsIDomainJudgment

### Community 163 - "TestAutoGenerateVariables"
Cohesion: 0.22
Nodes (5): Auto-generate should create variables from PICO., Auto-generate without PICO should return 400., Auto-generate on non-existent project should return 404., Running auto-generate twice should not create duplicates., TestAutoGenerateVariables

### Community 164 - "TestPubMedKey"
Cohesion: 0.22
Nodes (5): Set and retrieve PubMed API key., Project without key should report has_key=False., Non-existent project should return 404., Setting key on non-existent project should return 404., TestPubMedKey

### Community 165 - "PdfViewerPage.tsx"
Cohesion: 0.22
Nodes (5): API_BASE, PdfDocumentData, PdfHighlight, LocalHighlight, PdfViewerPage()

### Community 167 - "ReviewGraphPage.tsx"
Cohesion: 0.25
Nodes (7): ReviewGraph, ReviewGraphNode, ReviewGraphStats, EDGE_COLORS, NODE_STYLES, ReviewGraphNodeComponent(), ReviewGraphPage()

### Community 168 - ".register_images"
Cohesion: 0.29
Nodes (5): Create an affine transform for image registration. Args: fixed_image: Reference…, Setup the registration method with specified parameters. Args: transform:…, Perform image registration. Args: fixed_image: Reference (fixed) image…, ImageRegistrationMethod, Transform

### Community 169 - "tool/glycoengineering.py"
Cohesion: 0.25
Nodes (7): find_n_glycosylation_motifs(), list_glycoengineering_resources(), predict_o_glycosylation_hotspots(), Glycoengineering tools: quick, dependency-light utilities for glycosylation…, Scan a protein sequence for N-linked glycosylation sequons (N-X-[S/T]). Rules -…, Curate and summarize external glycoengineering tools and resources. Includes…, Heuristic O-glycosylation hotspot scoring. Background - O-GalNAc glycosylation…

### Community 170 - "query_fda_adverse_events"
Cohesion: 0.25
Nodes (8): _apply_fda_filters(), _format_adverse_event_summary(), _generate_fda_statistics(), query_fda_adverse_events(), Apply post-query filtering to FDA responses., Generate summary statistics from FDA responses., Format adverse event data into readable summary., Query FDA adverse event reports for specific drugs. Args: drug_name: Name of…

### Community 171 - "generate_base_codebook.py"
Cohesion: 0.25
Nodes (6): generate_codebook(), generate_base_codebook.py — create the radiology base codebook workbook.…, Generate the radiology base codebook workbook., generate_prompts(), generate_base_prompts.py — create the radiology base prompts JSON. Produces…, Generate the base prompts JSON from the field definitions.

### Community 172 - "tool/biophysics.py"
Cohesion: 0.29
Nodes (6): analyze_cell_morphology_and_cytoskeleton(), analyze_tissue_deformation_flow(), predict_protein_disorder_regions(), Quantifies cell morphology and cytoskeletal organization from fluorescence…, Predicts intrinsically disordered regions (IDRs) in a protein sequence using…, Quantify tissue deformation and flow dynamics from microscopy image sequence.…

### Community 173 - "can_user_access_project"
Cohesion: 0.33
Nodes (7): can_user_access_project(), get_user_project_role(), Connection, Get the user's role on a project, or None if not a member., Check if user has at least min_role on the project., Get project_id for a study., resolve_study_project_id()

### Community 174 - "get"
Cohesion: 0.29
Nodes (7): get_assessment(), list_study_assessments(), project_rob_summary(), get, List all RoB assessments for a study., Get full assessment detail with all domain judgments and signaling answers., Get RoB summary for traffic-light chart rendering.

### Community 175 - "TestAutoExtract"
Cohesion: 0.29
Nodes (4): Test automated extraction from processed PDF., Auto-extract without processed PDF should fail., Auto-extract with no variables defined should return 0 extracted., TestAutoExtract

### Community 176 - "AppLayout.tsx"
Cohesion: 0.33
Nodes (5): AppLayout(), NavItem(), navItems, projectNavItems(), SettingsPanelProps

### Community 177 - "convert_markdown_to_pdf"
Cohesion: 0.33
Nodes (5): Convert markdown file to PDF using weasyprint or markdown2pdf. This function is…, convert_markdown_to_pdf(), get_pdf_css_content(), Convert markdown file to PDF using weasyprint or fallback libraries. This…, Get the CSS content for PDF generation. This function returns a comprehensive…

### Community 178 - "pubmed_mcp.py"
Cohesion: 0.47
Nodes (5): Article, get_article_abstract(), BaseModel, search_pubmed(), tool

### Community 179 - "CustomBaseModel"
Cohesion: 0.33
Nodes (4): api_schema, CustomBaseModel, BaseModel, api schema specification.

### Community 180 - "review_matrix"
Cohesion: 0.40
Nodes (6): Connection, get, Get extraction data as a matrix: studies × variables., Get extraction progress summary., review_matrix(), review_progress()

### Community 183 - "backend/config.py"
Cohesion: 0.40
Nodes (4): BaseSettings, Config, Application configuration and settings., Settings

### Community 184 - "generate_api_docs.py"
Cohesion: 0.40
Nodes (4): create_index_rst(), generate_api_docs(), Creates or updates the main index file that lists all generated .rst files., Automatically generates .rst files for Sphinx API documentation. Args:…

### Community 185 - "delete_pdf_data"
Cohesion: 0.40
Nodes (5): delete, delete_pdf_data(), Delete processed PDF data for a study., delete_pdf_data(), Delete processed PDF data for a study.

### Community 186 - "delete_assessment"
Cohesion: 0.40
Nodes (5): delete_assessment(), delete, Delete a RoB assessment and all its child records., delete_assessment(), Delete an assessment and all its child records.

### Community 188 - "inject_custom_functions_to_repl"
Cohesion: 0.50
Nodes (3): Inject custom functions into the Python REPL execution environment. This makes…, inject_custom_functions_to_repl(), Inject custom functions into the Python REPL execution environment. This…

### Community 189 - "split_modalities"
Cohesion: 0.50
Nodes (3): Prepare input data for nnUNet by handling both 4D and pre-split modality files…, Convenience function for splitting modalities, split_modalities()

### Community 190 - "get_fda_drug_label_info"
Cohesion: 0.50
Nodes (4): _format_drug_label_summary(), get_fda_drug_label_info(), Format drug label information into readable summary., Retrieve FDA drug label information. Args: drug_name: Name of the drug to query…

## Knowledge Gaps
- **162 isolated node(s):** `LocalHighlight`, `SettingsPanelProps`, `Config`, `MetaResult`, `StudyData` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **44 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_load_graph()` connect `_load_graph` to `main.py`, `_process_ddinter_data_inline`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `get_connection()` connect `get_connection` to `routers/screening.py`, `dependencies.py`, `analysis.py`, `init_db`, `pubmed_service.py`, `rob_service.py`, `test_dedup_service.py`, `test_screening_extensions.py`, `_create_project_and_study`, `test_ai_integration.py`, `main.py`, `pdf_service.py`, `_create_project_and_study`, `grade.py`, `test_pico_highlight.py`, `test_routers_grade.py`, `delete_pdf_data`, `delete_assessment`, `test_dual_reviewer.py`, `test_screening_decisions.py`, `test_exclusion_reasons.py`, `test_ai_screening.py`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `init_db()` connect `init_db` to `test_pico_hypothesis.py`, `main.py`, `get_connection`, `test_screening_decisions.py`, `_create_project_and_study`, `test_pico_hypothesis_merge.py`, `test_routers_rob.py`, `test_pico_highlight.py`, `rob_service.py`, `test_routers_grade.py`, `test_dedup_service.py`, `test_exclusion_reasons.py`, `test_ai_integration.py`, `test_screening_extensions.py`, `test_ai_screening.py`, `test_dual_reviewer.py`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `get_connection()` (e.g. with `.test_pipeline_auto_exclude()` and `.test_pipeline_auto_include()`) actually correct?**
  _`get_connection()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `check_project_access()` (e.g. with `create_study()` and `delete_study()`) actually correct?**
  _`check_project_access()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `A1` (e.g. with `ToolRetriever` and `ToolRegistry`) actually correct?**
  _`A1` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LocalHighlight`, `SettingsPanelProps`, `Config` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._