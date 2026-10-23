# RadExtract: final decisions and coding-agent implementation handoff

Finalized: 2026-10-23 (Asia/Calcutta). Repository: `vidhidhaduk05/ExtractExperimenting-web`.

This single file consolidates **113 recorded decisions and confirmed context items (D1–D113)**, their latest corrections, implementation directions, code findings and acceptance criteria. It is the planning handoff requested by the user, not a claim that the application has been implemented, deployed or validated for public production use.

User choices are identified as decisions/requests; suggested implementation mechanics remain proposals unless explicitly selected. Later refinements control earlier broad wording. The consolidated resolutions below make those dependencies explicit. Two unanswered product-permission questions are listed at the end; do not assume their recommended options were accepted.

## Current requirements at a glance

| Area | Confirmed direction |
| --- | --- |
| Application foundation | Retain React/Vite + FastAPI; refactor incrementally, no framework rewrite. |
| Public accounts | Self-service email/password, verified email before project creation, recovery, disposable-email rejection and provider-aware unique addresses. Permanent personal/institutional emails allowed. |
| Project privacy | Owner and invited collaborators only; email-bound invitations; Viewer/Reviewer/Manager roles; owner-only deletion with 30-day recovery. |
| Production data | PostgreSQL through SQLAlchemy/Alembic; university-managed database preferred. PDFs on durable university filesystem with authenticated access and backups. |
| Hosting | Pursue university-managed always-running web/API hosting. Current Cloudflare Tunnel/web process and model serving are job-scoped; they do not establish continuous availability. |
| AI compute | University-hosted inference only; no external fallback. Durable fair queue resumes when authorized HPC model service returns. |
| Capacity targets | 5,000 registered accounts, 100 concurrently active users; 10,000 references and 1,000 PDFs per large project. Not measured capacity guarantees. |
| Recovery targets | At most one hour of lost saved work; restore service within eight hours, covering DB and files together. Institutional capability unverified. |
| Review types | Systematic reviews with optional meta-analysis, plus scoping reviews. Suitable PICO/PECO, diagnostic and PCC frameworks. |
| Protocol | Human-approved/versioned protocol; AI toggle on by default, explicit Generate suggestions only, manual mode available. Amendments flag affected decisions. |
| Search/import | PubMed autofetch; external searches with database labels/date/exact executed query; platform-specific query drafting; preserve/validate all selected formats. OpenAlex code retained, autofetch disabled. |
| Deduplication | Exact identifier grouping; human confirmation of probable matches; preserve original occurrences and all database provenance. |
| Screening | Combined title/abstract then full text. One or two humans per protocol; independent votes; per-study reveal; consensus then third reviewer for remaining conflicts. AI advisory only, shown after own initial vote. |
| PDF retrieval | PubMed-sourced records only, after resolved initial Include or explicit human advancement of uncertainty. Genuine PubMed occurrence qualifies mixed-source groups. PMC/Europe PMC, Unpaywall and identified OA locations allowed. |
| PDF uploads | Identify from parsed JSON/content, not just filenames. Unique report DOI/PMID auto-attaches; ambiguous matches need selection; identical files skipped; preserve versions/supplements and evidence. |
| Extraction UX | Excel-style Add column; approved typed variables; choose study targets during setup; approval starts proposal autofill. Slow pulse follows actual work; reduced-motion status available. |
| Extraction evidence | Direct values or reproducible calculations with cited inputs/formula; otherwise missing/uncertain. Per-value human verification; source-PDF side panel with Accept/Correct/Flag. |
| Extraction structure | Separate studies/reports/document versions; repeatable arm/outcome/timepoint rows. Preserve human-approved values across reruns. |
| Jev/Laya | Shadow-only at launch, including extraction tracing and standalone paths. No changes to baseline recommendations/evidence tags until a separately approved promotion. |
| Appraisal/GRADE | Human-confirmed tool/version, one human verifies all answers/evidence/domains. Trials, observational/nonrandomized and diagnostic designs. Optional appropriate outcome-level GRADE. |
| Analysis/reporting | Explicit opt-in before pooling; confirmed specification; deterministic validated pairwise/diagnostic methods using approved values. Owners/Managers start pooling and approve its results. Changed inputs mark dependent outputs Out of date. |
| Narrative | Source-grounded AI drafts with traceable citations and human section approval. Final-report approval role is not yet selected. |
| Exports | Evidence/status-rich Excel/CSV, references, PRISMA, appraisal/analysis tables/figures and editable report. All members get approved outputs; Reviewers+ may get labelled drafts, subject to concealment. |
| Standalone tools | Keep working Claimscape, Citation Telephone and Rigor Scan accessible to public guests. Session-only inputs/results clear on refresh; explicit download allowed; no saved runs. |
| Graphs | Review graph shows actual provenance relationships, no causal inference. Code graph stays developer/operator-only. |
| Prompt governance | Maintainer-only versioned releases with rollback; automated schema/evidence regressions plus human-reviewed labelled comparisons. Existing verified examples must be inventoried. |
| Upload advisory | Concise notice, human chooses continuation. No speculative sensitive-content blocker or excessive confirmation flows. Technical file/access safeguards remain. |

## Instructions to the coding agent

Implement these confirmed requirements in the existing application, incrementally. Use the current code as evidence, not proof of correctness. Preserve user records, identifiers, source documents and scientific history. Treat reports, studies, imported occurrences and document versions as distinct entities. Keep persistent main-review workflows separate from ephemeral public tool sessions.

Do not add unnecessary rules, blocking dialogs or approval steps. Backend authorization, evidence integrity and confirmed human-review gates still apply. Do not disable assertions, replace real results with examples, fabricate model outputs, or describe unexecuted workflows as working. Do not infer approval of unanswered choices.

Do not request credentials in chat. University infrastructure and inference access are external prerequisites to verify securely. Do not provision paid services or assume login-node hosting, unlimited scheduler allocations or public-guest compute permission. A successful local build is not production readiness.

## Implementation phases and reviewable deliverables

| Phase | Work and affected areas | Required evidence |
| --- | --- | --- |
| 1. Baseline and preservation | Inventory actual routes, models, main/standalone sources and AI paths; preserve current SQLite/files; diagnose existing frontend failures. | Baseline report, recoverable backup, dependency/route map and documented defects. |
| 2. PostgreSQL and data model | SQLAlchemy/Alembic; migrate direct SQLite SQL; study/report/document versions, source occurrences, repeated measurements, immutable history and approvals. | Fresh install/upgrade, rehearsed migration, integrity checks, rollback and isolated restore. |
| 3. Accounts and access | Verification/reset, disposable/provider-aware email uniqueness, invitations, project roles, strict resource authorization. Preserve public guest tools separately. | Negative cross-user tests; real verification/invitation flows; concurrent signup uniqueness; role revocation checks. |
| 4. Always-running web and jobs | University web/API deployment, filesystem access, secure inference discovery, durable fair queues, cancellation/retry and job-scoped HPC recovery. | Web remains usable when compute ends; queue survives restarts; no external inference fallback; tested DB/file recovery. |
| 5. Protocol/search/import | Approved protocol/version lifecycle; AI toggle; framework templates; query drafting; PubMed fetch; import previews and selected formats; provenance-safe dedup. | Versioned criteria and reassessment; no unconfirmed search execution; malformed imports and multi-source counts reconcile. |
| 6. Screening and documents | Two-stage human workflows, reveal gates, consensus/adjudication, PubMed-only OA fetch, JSON-based matching, version/supplement handling and OCR. | No AI finalization; no early vote leaks; correct report/file associations; original evidence survives reprocessing. |
| 7. Extraction | Approved Excel-style columns, selected-target autofill, truthful pulse/status, repeated rows, evidence side panel, human verification and conflict-safe autosave. | Actual pipeline fills proposals; verified arithmetic/quotes/pages; reruns preserve approved cells; offline/reconnect tests. |
| 8. Appraisal/synthesis/reporting | Verified instrument catalogue, GRADE, explicit pooling and validated deterministic methods, dependency invalidation, source-grounded reports and role-aware exports. | Reference-method numerical tests; tool-specific judgment validation; stale-output markers; reproducible approved-input exports. |
| 9. Working public tools | Implement/verify missing tool endpoints; approved-method Claimscape/Citation Telephone/Rigor Scan; temporary uploads/jobs/downloads; operator code graph. | Signed-out browser completes real runs/downloads, refresh clears them, no private data leakage or demo substitution. |
| 10. Prompt releases and launch | Inventory verified dataset; versioned task contracts/evaluations; load tests; recovery drill; operator runbook and feature readiness report. | Current-vs-candidate results, rollback, measured load/recovery outcomes, exact remaining deployment blockers. |

Each phase must report changes, tests actually executed, data migrations, rollback procedure, remaining defects and prerequisites. Keep the implementation plan within this file; code changes are a later coding task.

## Prompt implementation contracts

Version prompts, user templates, schemas, parsing and validators together. Store prompt/model/protocol/form/source provenance on persistent outputs. Standalone tools expose relevant provenance only during the session/download; do not create saved run histories to satisfy provenance.

Shared contract: use supplied evidence; treat article content as source material rather than instructions; do not invent missing facts, quotes, page numbers, citations, approval or executed actions. Return validated task-specific structures and explicit missing/uncertain/failure states. Permissions and finalization are enforced in code, not entrusted to prompt wording.

| Task | Required task contract |
| --- | --- |
| Protocol/framework | Draft only on explicit request, identify proposed versus supplied criteria, preserve manual edits, require selected human approval. |
| Query drafting | Actual platform syntax, editable neutral concepts, no claim of an executed search; record the query actually run separately. |
| Screening | Stage-limited source evidence, approved criterion IDs, Include/Exclude/Uncertain proposals, no automated final outcome. |
| Extraction | Stable field/row identities, direct evidence or reproducible calculations, true page/source membership, explicit missingness, proposal-only persistence. |
| Appraisal/GRADE | Confirmed instrument/version, applicable questions and decision rules, evidence-linked drafts, no invented generic quality scores. |
| Narrative/report | Approved inputs only, traceable supported claims, deterministic numerical results, human section approval and outdated dependency markers. |
| Claimscape | Four-way stance/relevance mapping, labelled abstract/full-text coverage, design-stratified counts, no truth score. |
| Citation Telephone | Immediate-source comparison, four verdicts with paired excerpts, optional bounded tracing and explicit stop reasons. |
| Rigor Scan | Confirmed design checklist plus separate general reporting/concern layers, source evidence, no overall quality score. |
| Jev/Laya | Separate non-mutating shadow comparison; evaluate context coverage and calibration, no automatic verification/DS upgrade. |

Use the user's verified examples only after inventorying permitted use, label quality and coverage. Distinguish mocked contract tests from actual model evaluation. Maintainer review plus required automated checks governs release; numeric thresholds must be defined and justified before promotion.

## Complete decision register

Numbering preserves the interview's stable IDs. Some IDs refine earlier ones or describe confirmed current infrastructure rather than a new feature. Their cross-references identify the final interpretation. Suggested implementation details are not additional user-selected product policies.

### D1. Public self-service registration

- User decision: anyone can sign up publicly at launch.
- Implementation direction: support self-service registration, sign-in, sign-out and account recovery. Evaluate email verification, registration/login rate limits and resource quotas before public launch.
- Authorization must be enforced server-side for every project, study, PDF, job and export. Public registration must not grant elevated privileges through a client-supplied role.
- Acceptance criteria: a new user can create and recover an account; attempts to select an elevated role during signup cannot grant elevated access; unauthorized requests cannot read or modify another user's protected resources.
- Recommendations above are planning directions, not additional user-confirmed product choices.
- Consolidated resolution: Read together with D5/D106/D107/D110/D111: public signup uses verified permanent emails, disposable-domain checks and provider-aware uniqueness.

### D2. Private projects with explicit invitations

- User decision: only the owner and explicitly invited collaborators may access a project's studies, PDFs and review data.
- Enforce membership checks server-side for project resources, uploaded files, background jobs and downloadable exports. Guessing a resource identifier must not bypass access controls.
- Public signup does not expose existing projects. Search results, dashboards and project lists must respect membership.
- Acceptance criteria: an unrelated registered account cannot list, read, modify or download another project's resources; an invited member receives only the permissions assigned to them; revoked members lose access.

### D3. Assigned collaborator roles

- User decision: the owner assigns Viewer, Reviewer or Manager roles to invited collaborators.
- Viewer: read project material; no review or extraction edits.
- Reviewer: review studies and edit extraction data; no membership management.
- Manager: manage project settings and membership in addition to review and extraction.
- Enforce permissions in backend endpoints and background operations; UI visibility alone is insufficient.
- Acceptance criteria: each role can perform its allowed actions and receives access denial for forbidden actions; role changes take effect on subsequent requests.
- Consolidated resolution: D65 resolves Viewer downloads and D63 resolves deletion. Manager appointment and ownership-transfer authority remain unanswered; see the final open choices.

### D4. Email-bound project invitations

- User decision: send invitations to a specific email address; recipients sign in or register to accept.
- Implementation direction: store pending invitations with project, invited email, assigned role, inviter and status. Bind acceptance to the authenticated recipient's verified email; do not grant access merely because someone possesses the link.
- Recommended mechanics: single-use expiring invitation tokens, cancellation and resend support, and audit records for invitation and acceptance. Exact expiry remains a recommendation to specify during implementation.
- Acceptance criteria: the intended recipient can accept after registration or sign-in; another account cannot accept; cancelled, expired or consumed invitations cannot grant new access; sending an invitation alone does not grant membership before acceptance.

### D5. Verified email/password accounts and recovery

- User decision: launch with email/password sign-in, email verification and password reset.
- Implement registration, verification delivery/resend, sign-in, sign-out and password recovery. Google sign-in is outside the confirmed launch scope.
- Use hashed passwords and single-use expiring verification/reset tokens; never expose passwords or raw tokens in logs. Bind project invitation acceptance to the verified email selected in D4.
- Recommended recovery behavior: neutral responses that do not reveal account existence, request throttling, and invalidation of existing sessions following a successful password reset. These mechanics are recommendations pending detailed implementation review.
- Acceptance criteria: verification proves email ownership; valid reset links permit password replacement; expired or reused links fail; passwords are never stored as plaintext; a different email cannot claim an invitation.

### D6. Complete project persistence across devices

- User decision: save the complete project, including PDFs, references, protocol, screening decisions, extraction data, AI results, notes, assessments and history.
- Store authoritative review state server-side and uploaded documents in persistent storage. Browser storage may cache data but must not be the sole copy of saved work.
- Persist associations between studies, source documents, evidence, human decisions and AI outputs. Preserve project membership and role restrictions when accessing saved material from another device.
- Acceptance criteria: save representative data from each confirmed category, sign out, open a fresh browser/device session and retrieve it with the same account; restart the backend and retrieve the same records and PDF contents; an unrelated account cannot retrieve them.
- Consolidated resolution: Main-review persistence excludes the explicitly ephemeral standalone-tool runs in D67/D68/D113. PostgreSQL, university filesystem storage and recovery targets are selected in D28–D30.

### D7. Observable, failure-aware autosave

- User decision: autosave screening decisions, extraction fields and notes; visibly distinguish Saving, Saved and Failed; support retry and warn before leaving with unsaved work.
- Show Saved only after the server confirms persistence. A browser-cache update or optimistic UI change is not confirmation of a successful save.
- Preserve pending edits when a save fails; present actionable retry without losing the user's input. Distinguish network failure, expired authentication, permission denial, validation failure and edit conflict.
- Navigation guards must cover in-app navigation and use browser-supported unload warnings where available; do not promise browsers can always prevent closing a tab.
- Acceptance criteria: successful saves survive reload and a new session; simulated failed requests show Failed and retain edits; retry does not duplicate decisions; leaving with pending edits prompts a warning where supported; permission failures cannot be reported as Saved.

### D8. Explicit resolution of concurrent shared edits

- User decision: detect conflicting changes to the same shared extraction field or note, preserve both versions, and ask the editor to resolve before overwriting.
- Recommended implementation: version shared records/fields and check the expected version atomically on save. Reject stale writes as conflicts rather than silently accepting last-write-wins.
- Keep the attempted local value and the current saved value available to the authorized editor. Resolve against the latest version; another intervening edit must trigger a new conflict rather than being overwritten.
- Integrate with D7: conflicts are not Saved; automatic retries must not force an overwrite. Record the resolved value and relevant authorship/history.
- Acceptance criteria: two sessions editing the same version cannot silently overwrite each other; the second writer can inspect both values and resolve; history retains the competing versions and resolution; unrelated fields should not produce unnecessary conflicts where safely avoidable.

### D9. Systematic and scoping review workflows

- User decision: the first usable release supports systematic reviews with optional meta-analysis, plus scoping reviews.
- Capture the review type at project creation and tailor guidance, protocol fields, AI task context and applicable outputs accordingly. Do not require a meta-analysis to complete a systematic review.
- Recommended direction: share the reference, document, membership, persistence and audit foundations while explicitly distinguishing workflow requirements rather than treating all review types as identical.
- Acceptance criteria: users can create and complete each supported review type; a systematic review can finish without meta-analysis; a scoping review can complete its charting and reporting workflow without forced meta-analysis.

### D10. Human-approved, AI-assisted protocol setup

- User decision: guided setup begins with the user's topic; AI drafts the research question, eligibility criteria and protocol; the user edits and approves them before screening.
- Treat generated content as a draft, not an approved protocol. Save the user's inputs, generated draft, edits and approval state as part of the project.
- Prompt requirements: distinguish supplied facts from proposed methodological choices; surface missing or ambiguous criteria for clarification; do not invent user approval, registration identifiers or completed searches.
- Acceptance criteria: a user can generate, edit, save and approve the protocol; unapproved AI drafts cannot silently become authoritative screening criteria; screening and extraction tasks can identify the approved protocol version used.
- Consolidated resolution: D45 permits fully manual setup and sets the AI toggle on by default with explicit generation. D86/D91/D112 resolve approval authority, question frameworks and protocol readiness.

### D11. Versioned protocol amendments and reassessment

- User decision: changes to eligibility criteria after screening starts create a new protocol version, flag affected decisions for reassessment, and preserve original decisions and reasons in history.
- Persist the amendment, its author, time, changed criteria and relationship to the prior approved version. Keep historical versions immutable and link each decision to the criteria version actually used.
- Do not silently rewrite or delete earlier decisions. Clearly separate historical decisions, pending reassessment and decisions confirmed under the current approved version.
- Recommended implementation: identify potentially affected records conservatively; when impact cannot be established, flag potentially affected decisions for human review rather than asserting they remain valid. AI suggestions must not silently clear reassessment flags.
- Acceptance criteria: changing an approved criterion preserves the prior version and decisions; affected records enter a visible reassessment queue; reassessment records a new decision with the current protocol version and retains the original rationale.

### D12. Protocol-defined independent human screening

- User decision: each project protocol selects one or two human reviewers; in two-reviewer mode, decisions remain hidden until both finish and disagreements go to adjudication.
- Keep each reviewer's decision and rationale as independently authored records. Do not treat independent votes as concurrent edits of one shared decision.
- Preserve both original votes and the adjudicated outcome. Never silently replace an independent vote with the consensus result.
- Acceptance criteria: one-reviewer mode can progress using its configured decision rule; two-reviewer mode prevents access to the other vote before reveal; agreements resolve according to the protocol and disagreements enter an adjudication queue; historical votes remain attributable.
- Consolidated resolution: D85 sets human decision reveal per study/stage; D36 sets consensus then third-reviewer adjudication; D105 sets assignments.

### D13. Advisory AI screening with human final decisions

- User decision: AI suggests include, exclude or uncertain, supported by evidence and criterion-based reasons; every final screening decision is made by a human.
- Store AI suggestions separately from independent human votes and final/adjudicated outcomes. An AI suggestion cannot count as either human reviewer or automatically advance a study as a final decision.
- Prompt contract: apply the approved, versioned eligibility criteria to the evidence available at the screening stage; identify supporting passages and criterion identifiers; use uncertain when available evidence cannot justify a recommendation. Do not invent evidence or interpret missing information as a confirmed exclusion without an explicit applicable criterion.
- Recommended output contract: recommendation, per-criterion findings, evidence references, unresolved information and protocol version. Any confidence score must be separately defined and evaluated rather than treated as a calibrated probability by default.
- Acceptance criteria: all three recommendation states are supported; suggestions expose their evidence and criterion rationale; AI execution alone cannot finalize screening; the human's decision remains separately attributable even when it matches the suggestion.

### D14. Reveal AI recommendations after an independent initial vote

- User decision: each reviewer sees the AI recommendation and rationale only after recording their own initial independent decision; subsequent revisions are retained in history.
- Track disclosure eligibility per reviewer and study/stage. One reviewer's submission must not reveal AI output to a different reviewer who has not submitted their own initial decision.
- Enforce concealment server-side as well as in the UI. Before eligibility, do not expose recommendation-bearing fields through evidence explanations, notifications, exports or other project endpoints available to that reviewer.
- Preserve the initial vote and distinguish later revisions made after AI disclosure. Record the suggestion version shown and the relevant disclosure/revision events for auditability.
- D12 still governs concealment of the other human reviewer's vote; revealing AI does not authorize revealing another person's decision early.
- Acceptance criteria: a reviewer cannot retrieve the AI recommendation before submitting an initial decision; submitting it enables access for that reviewer alone; a second reviewer remains concealed until their own submission; revisions never erase the original vote.

### D15. Two-stage study screening

- User decision: screen title and abstract together, followed by full-text review.
- Use explicit stage identifiers and stage-specific decisions, evidence and progress. Title-only and abstract-only stages are outside the confirmed workflow.
- Apply D12–D14 independently at each stage: protocol-defined human reviewers, advisory AI, and AI disclosure after each reviewer's initial vote.
- Stage-one AI uses only the supplied title/abstract and relevant bibliographic evidence; full-text AI may use the accessible full text. Do not imply full-text verification from a title/abstract-only assessment.
- Preserve stage-one decisions when a record advances; full-text outcomes must not overwrite earlier-stage history.
- Acceptance criteria: eligible records can advance from combined title/abstract screening to full-text screening; stage-specific decisions survive reopening; an AI suggestion cannot advance a record as a final human decision; progress counts distinguish both stages.

### D16. PubMed autofetch and database-labelled external imports

- User decision: retain PubMed autofetch; users search other databases outside the app and import those results with database labels.
- Keep database provenance distinct from import filename and file format. Preserve attribution when the same reference arrives from multiple databases.
- Existing OpenAlex endpoints were found; their retention/visibility is unresolved, not implicitly approved or removed.

### D17. Retain React/Vite + FastAPI and refactor incrementally

- User decision: retain the existing React/Vite frontend and FastAPI backend as the long-term application foundation; improve the existing application incrementally rather than undertaking a complete framework rewrite.
- Rationale: reuse the existing UI, API and Python PDF/statistical services while addressing demonstrated reliability and workflow gaps. Changing frameworks alone does not fix access isolation, data loss or research-method correctness.
- Do not migrate to Next.js, Django or a TypeScript backend as part of this plan without a separately approved change in direction.
- This choice does not approve a database vendor, hosting provider, object store, queue, identity service or email provider. Confirm those independently.
- Acceptance criteria: preserve the selected application foundation and intended supported workflows; document any necessary API/data migrations and regression coverage; avoid replacing working scientific functionality merely to reorganize code.

### D18. Owner-operated application with managed hosting preference

- User decision: the owner will maintain and deploy the app mainly using coding agents; prefer managed hosting with minimal server administration.
- Architecture direction: prioritize managed deployment, database, durable document storage and operational services where feasible. Avoid making routine server patching, database administration or manual recovery a prerequisite for normal use.
- Coding-agent deliverables must include repeatable deployment, environment/secret setup instructions, migration procedures, health checks, backup/restore verification and concise operator instructions. Clearly separate automated steps from actions requiring provider-account access.
- Compare total operational complexity and cost across the API, frontend, jobs, database, files and transactional email; a free frontend alone does not establish a free production system.
- Consolidated resolution: University hosting direction in D19/D24 takes precedence over a commercial managed-hosting assumption; no external provider or commercial budget was selected.

### D19. University HPC is the intended infrastructure

- User decision/context: the user uses their university HPC for all of this application infrastructure. Do not assume commercial managed hosting or select a paid provider based on the prior budget question.
- D18's goal of minimal administration still applies; its managed-commercial-service direction is superseded by the HPC context wherever incompatible. Investigate institution-supported managed services first.
- Before selecting deployment architecture, establish whether the university supplies an approved public HTTPS app host/reverse proxy, persistent services/containers, scheduler-only compute, durable project storage, database hosting, outbound email and backup facilities.
- Do not assume an HPC login node may run a public API or that a scheduled compute allocation provides a permanent web endpoint. No university policy or capability has been verified yet.
- Keep public frontend/API availability, persistent records/PDFs and asynchronous AI/analysis compute as distinct deployment requirements, even if all are provided by the same university infrastructure.
- Coding-agent handoff must identify required institution-provided capabilities and separate tested access from prerequisites. Do not invent hostnames, credentials, scheduler configuration or guarantees about storage retention.
- Consolidated resolution: D23/D24 require a separate always-running university web/API service; scheduled HPC is retained for compute. Current expiring-job topology is not the target public hosting design.

### D20. Current HPC access is private and scheduler-based

- User-confirmed capability: HPC is accessed over SSH/VPN and compute jobs are submitted; the user has no public web endpoint.
- Subsequent clarification (D21): Cloudflare Tunnel is in use. Interpret the earlier answer as no native university public web endpoint, not evidence that the application has no tunneled route.
- This does not currently provide the continuously reachable HTTPS API needed by D1 public signup and D6 cross-device project access. The application must not be described as publicly deployed on the basis of this setup.
- Historical proposal subsequently confirmed by D23/D24: a continuously available web/API tier for accounts and saved review data, with scheduled university HPC compute; pursue university-managed web hosting first.
- Worker integration must account for scheduler waiting time, job runtime limits, failures, durable job identifiers, approved data transfer and result retrieval. Browser requests must not wait synchronously for a scheduled job to finish.
- No HPC policy, service-account permissions, storage guarantees or outbound connectivity has been verified. Do not infer these from SSH access alone.
- Public launch remains blocked until an approved public web/API hosting path and durable data storage are selected and verified. A private pilot would require an explicit change to the launch/access scope.
- Consolidated resolution: Historical topology observation: the later Cloudflare Tunnel clarification in D21/D22 establishes the current public route. The target continuous-access architecture is D23/D24.

### D21. Cloudflare Tunnel is the existing application access mechanism

- User-confirmed context: Cloudflare tunneling is already in use. Do not assume it must be replaced by external hosting or a university reverse proxy.
- Current deployment topology remains to be established: named tunnel/custom hostname versus temporary quick tunnel, where cloudflared runs, which service it targets, and whether that service survives scheduler allocation expiry or SSH disconnection.
- Cloudflare Tunnel provides a route to an origin; it does not itself supply persistent API processes, a database, file durability, backups or restart-safe compute jobs.
- Plan around the actual tunnel/origin setup once confirmed. Verify university permission separately; no policy violation or approval is established by the use of a tunnel.
- Do not request tunnel tokens or credentials in chat. Hostname/type and runtime topology are sufficient for initial design.
- Earlier recommendations to find another public-hosting path are now conditional on limitations of the existing tunnel/origin, not confirmed migration decisions.

### D22. Current web service lifetime is bound to an HPC job

- User-confirmed topology: the Cloudflare Tunnel and application run on an HPC compute node inside a scheduled job; the application stops when that job ends.
- Tunnel routing does not remove scheduler termination, queue delays or node replacement. Do not promise uninterrupted public availability or assume immediate job renewal.
- Saved records/PDFs must reside on confirmed persistent storage independent of the compute allocation; actual paths, retention, backup policy and restart recovery remain unverified. Service downtime must not be equated with data loss, nor persistence assumed from the current topology.
- Implementation planning must cover graceful shutdown, in-flight autosaves, interrupted work, durable job/result state and restart/reconnection behavior. Do not report an unacknowledged save as successful.
- If continuous availability is selected, evaluate an institution-approved continuously running web/API origin with HPC compute separated; infrastructure selection remains pending. Do not bypass scheduler policy or assume login nodes can host the app.
- Consolidated resolution: D23 subsequently confirms continuous access as a requirement; the current job-scoped web origin cannot meet it alone.

### D23. Continuous website/API availability independent of HPC jobs

- User decision: public users must be able to sign in and access saved projects continuously, including when HPC compute jobs end. Plan a separate always-running website/API service.
- The web tier must retain account access, project browsing and saved-data access when no compute allocation is active. Show queued/unavailable compute honestly; do not make ordinary sign-in or project reads wait for a scheduler allocation.
- Choose durable database and PDF storage independently of temporary compute nodes. The database, document store and web service must be reachable through approved network paths; location and technologies require confirmation.
- Cloudflare Tunnel may remain part of the access route if suitable, but an expiring compute-job origin cannot satisfy this decision. Do not claim that auto-resubmitting jobs guarantees continuous availability.
- Acceptance criteria: end the compute allocation and verify the web/API tier continues serving login, project data and permitted document access; pending compute has an accurate state; users do not lose acknowledged saves; results can be reconciled when compute resumes.

### D24. University-managed always-running hosting first

- User decision: pursue a university-managed app server or VM for the continuously available website/API; confirm availability before choosing an external hosting service.
- Treat institutional hosting as the first option to investigate, not a provisioned or verified capability. Do not select a commercial provider, incur costs or assume a university VM has been granted.
- Required institution questions: whether public users and the intended research application are permitted; continuously running service support; HTTPS/domain or approved tunnel routing; persistent storage/database facilities; approved connectivity to scheduled HPC workers; transactional email; backup, monitoring and operator responsibilities.
- Cloudflare Tunnel can be evaluated as an access mechanism for the continuously running origin, subject to the institution's supported configuration. It does not determine database or file-storage location.
- If the university cannot provide a suitable service, record the exact constraint and compare external options with the user before changing this direction.
- Coding-agent plan must separate application work that can proceed locally from deployment tasks blocked on institutional infrastructure. No public-production readiness claim until hosting and data recovery are verified.

### D25. Preserve existing data on persistent university storage

- User-confirmed context: the current database and uploaded PDFs are stored on persistent university home/project storage that survives compute jobs.
- Preserve existing projects, account/membership records, PDFs, decisions and history before any relocation or schema migration. Confirm actual configured paths and inventory the data without exposing private contents in logs.
- User confirmation establishes expected persistence across compute jobs, not verified backups, indefinite retention, suitability for a live database, or access from the proposed web VM.
- Before selecting the production database deployment, identify filesystem type and supported database locking semantics. Existing SQLite WAL configuration must not be assumed safe on shared network storage; verify university/filesystem guidance and choose a supported placement or database service.
- Verify permissions, quotas, retention/purge rules, VM/worker connectivity and recovery coverage for both database records and document bytes. Do not move acknowledged user data into compute-node scratch.
- Acceptance criteria: a preservation inventory and recoverable backup exist before migration; sample records and document checksums survive migration and a compute-job restart; ownership/membership remains intact; restoration is tested separately from ordinary storage persistence.
- Consolidated resolution: Production choices are now PostgreSQL (D28/D90), durable university document filesystem (D29) and the D30 recovery targets.

### D26. Larger-service capacity planning

- User decision: design for the larger-service category, meaning over 1,000 registered users or over 50 simultaneously active users; refine the actual targets before sizing or acceptance testing.
- Do not interpret this answer as confirmation that both thresholds are exceeded, or as a verified current capacity. No PDF-per-project limit or model-throughput requirement has been agreed.
- Architecture evaluation must cover concurrent reads/writes, autosave conflicts, API/database connection limits, file access, background queues and HPC scheduling independently. Registered-user count alone is insufficient for sizing.
- Recommended next step: select an explicit first-release load envelope and then assess a supported transactional database such as PostgreSQL against the university's managed-service options; do not approve a technology or deployment size solely from this category.
- Consolidated resolution: D27/D83 subsequently select 5,000 registered users, 100 active concurrently, 10,000 references and 1,000 PDFs per large project. These are unverified test targets.

### D27. First-release target: 5,000 accounts and 100 concurrent active users

- User decision: target up to 5,000 registered users and 100 users active concurrently for the first release.
- Use this as the selected user-load envelope refining D26, not a claim of measured capacity or authorization to provision infrastructure.
- Representative load tests must include authenticated project access, screening decisions, extraction/note autosaves and realistic permission checks. Define the activity mix, document sizes, data volume, test duration and acceptable latency/error rates before claiming the target is met.
- Assess database concurrency and connection pooling for this workload. Current SQLite-specific SQL must be inventoried and migrated/tested if a different database is selected; merely changing a connection URL is insufficient.
- University web/database resource availability and recovery support must be verified before deployment. No current benchmark demonstrates this target.

### D28. PostgreSQL production database with verified migration and recovery

- User decision: use PostgreSQL for production accounts, projects, decisions and history; prefer a university-managed database and require migration and restore tests.
- Database technology is confirmed; an available university PostgreSQL service, its version, access paths, quotas, backup features and operator support are not yet verified. If unavailable, return with supported deployment alternatives rather than silently switching database technology or choosing a paid vendor.
- Inventory direct SQLite SQL, parameter placeholders, schema types/defaults, row handling, connection lifecycle, transactions, uniqueness constraints and SQLite-specific operations across routers/services before porting. The current SQLite/DynamoDB abstraction is not already a PostgreSQL implementation.
- Introduce repeatable versioned migrations and a supported PostgreSQL access layer; exact library/ORM remains an implementation proposal to justify separately. Preserve project/resource identifiers, membership, decision authorship, timestamps, history and document associations.
- Migration plan must include a source backup, rehearsed import, integrity/count checks, application regression tests, a cutover write strategy and rollback criteria. Never assume an old SQLite backup can restore directly into PostgreSQL.
- Define appropriate pooling/connection budgets, transaction boundaries and atomic version checks for D8 conflicts; validate representative D27 load rather than assuming PostgreSQL alone meets it.
- Acceptance criteria: migrate representative existing data and retrieve it through the app; verify ownership and role restrictions, independent votes and complete histories; test concurrent saves/conflicts; restore a PostgreSQL backup into an isolated target and verify records and associated document access.
- Keep uploaded PDF bytes in the separately selected durable document-storage layer; PostgreSQL stores their metadata/associations unless a different document design is explicitly approved.

### D29. Durable university filesystem for production documents

- User decision: store production PDFs and uploaded files on durable university filesystem storage accessible to the continuously running API, with authenticated file access and backups.
- Keep document metadata, ownership/project associations and storage identifiers in PostgreSQL under D28. Private object storage is not the selected document-storage target.
- Verify the actual supported filesystem mount, service identity, permissions, quotas, retention, API-host access and backup coverage with the university. Existing compute-job access does not establish access from the proposed web service.
- Serve documents only after authentication and resource-to-project authorization; do not expose the upload directory as unrestricted static files or rely on an unguessable filename for access control. Apply the same rules to previews, page images, supplements and downloaded exports as appropriate to their project.
- Recommended implementation: server-generated storage identifiers, confined path resolution, streaming downloads, integrity checks and explicit handling of missing/unavailable storage. Do not accept arbitrary client-supplied filesystem paths or report a completed upload before its durable save is confirmed.
- HPC workers must use approved access or transfer paths; shared filesystem access is not assumed. Temporary extraction files may live in job scratch, but required source documents and accepted outputs must persist independently of allocations.
- Acceptance criteria: authorized access survives API and compute restarts; nonmembers and revoked users cannot download files; traversal requests fail; migrated document contents match preservation checks; a restored database can resolve and retrieve its restored document set.

### D30. One-hour recovery point and eight-hour restoration target

- User decision: after a recovery incident, lose at most one hour of saved work (RPO) and restore service within eight hours (RTO), covering PostgreSQL and required uploaded files together.
- These are design and validation targets, not verified university service commitments or current guarantees. Establish incident timing, recovery ownership and supported backup facilities before promising compliance.
- Design recoverable database/document sets with matching metadata and file coverage. Backing up only one layer does not satisfy complete-project recovery; ordinary filesystem persistence is not a backup.
- Recommended direction: university-supported PostgreSQL backup/PITR or suitably frequent recoverable snapshots, coordinated file protection, monitored backup freshness/failures and a restoration runbook. Exact mechanisms and retention require confirmation. An hourly cron alone does not establish a one-hour RPO when backup completion or failures are considered.
- Acceptance criteria: rehearse restoration into an isolated environment, measure lost-work window and elapsed restoration time, verify account/membership isolation and representative decisions/history, and retrieve/check restored PDFs. Include the service/configuration prerequisites needed to resume operation, not just data import time.
- Validate protected recovery copies survive relevant source-storage failures and restrict backup access. Do not overwrite live project data during a restore drill.

### D31. Conservative deduplication with preserved source records

- User decision: automatically group exact identifier matches; route probable title/author matches to human confirmation; preserve all original records and source/database labels.
- Model import occurrences separately from the canonical review record so grouping does not erase source provenance. Do not silently discard duplicates as the current upload path does.
- Normalize supported identifiers deterministically before matching. Define conflicting-identifier handling explicitly: title similarity alone must not override contradictory identifiers or justify automatic merging.
- Distinguish duplicate references to the same report from different reports of the same underlying study; do not automatically collapse multiple publications merely because they share a study population or trial identifier.
- Acceptance criteria: importing one report from PubMed and another database yields a usable grouped record with both original occurrences and source labels; probable matches stay separate pending confirmation; false matches can be corrected without losing decisions or provenance; reporting can distinguish imported occurrences from deduplicated records.
- Duplicate grouping must not expose another private project's data. Cross-project matching, if ever proposed, requires a separate privacy decision.

### D32. Reproducible external search/import batches

- User decision: require database name, search date and exact search query for external database result imports; save a batch record containing filename, counts and errors.
- Keep user-supplied external query text verbatim. Do not replace it with an AI-generated query or imply the app executed an externally performed search.
- Link original imported occurrences to their batch and preserve these links through D31 deduplication. Repeated searches of the same database need distinct search/import events rather than overwriting earlier history.
- Record filename(s), source format, import actor/time and outcomes distinguishing accepted occurrences, duplicate groups, rejected/malformed records and import errors. Define count semantics to avoid presenting skipped duplicates as newly screened records.
- Recommended direction: capture the database platform/interface separately when relevant to query syntax; use equivalent auditable search events for PubMed autofetch, including the actual executed query and fetch outcomes. These details require specification, not invented historical metadata.
- Acceptance criteria: an external batch cannot be finalized without the three required search fields; malformed records produce actionable errors; a grouped reference retains every contributing batch/database link; users can retrieve the recorded query, dates and counts for reporting.

### D33. Missing abstracts remain uncertain pending additional evidence

- User decision: when an abstract is missing and the title alone is insufficient, mark the record uncertain, seek the abstract or full text, and do not exclude solely for the missing abstract.
- Record missing evidence separately from a criterion-based eligibility mismatch. AI must not invent an abstract or report criteria as disproven merely because the source is unavailable.
- Provide a visible unresolved/retrieval state with attempts and newly attached evidence; do not silently finalize exclusion or automatically advance as an included human decision.
- Preserve each human reviewer's initial vote and D14 disclosure rules. Additional evidence may support an attributable later decision without erasing earlier uncertainty.
- Acceptance criteria: insufficient title-only evidence yields uncertainty; missing-abstract records remain findable; a later abstract or full text can be attached and reviewed; missingness alone cannot trigger an automatic exclusion.

### D34. Unretrieved reports are distinct from eligibility exclusions

- User decision: keep potentially eligible reports awaiting retrieval; an authorized reviewer may mark a report not retrieved after documenting retrieval attempts. Do not classify this as an eligibility exclusion.
- Preserve attempts, dates, actor and outcome; expose unresolved retrieval work and maintain distinct reporting counts for reports not retrieved versus full-text reports assessed and excluded.
- Reopening retrieval after a document becomes available must preserve history rather than require creating a duplicate record.
- Acceptance criteria: documented not-retrieved outcomes can be recorded and reopened; no AI or failed download silently converts them into eligibility exclusions; reporting keeps the categories distinct.

### D35. Visible DOI and direct publisher/PubMed navigation

- Confirmed interaction: separate DOI and PubMed links open in a new tab; support double-click as well as standard click and keyboard activation. Preserve the current screening page and unsaved edits; a double-click must not open duplicate tabs.

- User decision: display available DOI identifiers and support double-click navigation to the paper's website or PubMed directly.
- Use the DOI resolver (https://doi.org/<normalized DOI>) for the publisher/paper destination. Use a separate direct PubMed article link when a PMID is available; a DOI alone does not establish a PMID or that the paper is indexed in PubMed.
- If only a DOI exists, a PubMed option may search for that DOI but must be labelled as a search rather than a verified direct article link. Never fabricate a PMID or destination.
- Implement standard accessible link semantics alongside the requested double-click behavior; keep identifier text copyable and avoid conflicting click/double-click handlers that navigate twice.
- Keep external navigation available during screening/retrieval and on study details where identifiers exist; opening a page must not change screening decisions or falsely mark a PDF as retrieved.
- Normalize identifiers and build HTTPS links to known resolver/PubMed hosts instead of executing arbitrary imported URL schemes. Missing identifiers must not produce broken or fabricated links.
- Acceptance criteria: DOI/PMID fixtures resolve to their correctly constructed destinations; identifiers remain visible/copyable; double-click and keyboard access work without duplicate navigation; external access does not expose another project's data or overwrite unsaved edits.

### D36. Consensus discussion followed by third-reviewer adjudication

- User decision: after both independent reviewers finish, they discuss disagreements and record consensus; a designated third reviewer resolves disagreements that remain.
- Preserve initial independent votes, post-AI revisions, the discussion/consensus record and any adjudicated outcome separately. Never rewrite an initial vote to make it appear that reviewers originally agreed.
- Reveal the relevant human decisions only after the D12 concealment requirement is satisfied. Record the resolution actor(s), rationale, stage, protocol version and time.
- Acceptance criteria: a disagreement enters a visible queue, consensus can resolve it with history, unresolved disagreements can be assigned to a third reviewer, and AI recommendations cannot finalize either route. A reviewer without resolution authority cannot silently override the final result.

### D37. Evidence-grounded extraction and reproducible calculations

- User decision: AI may propose directly stated values and reproducible calculations with cited inputs and formulas; otherwise mark values missing or uncertain. Keep proposals separate from human-approved data.
- Direct values require source evidence and an actual source location when available. Do not invent a quote, default an unknown page to page 1, or describe a calculated result as a verbatim finding.
- Calculated proposals must expose the input values, each input's source, formula, units, assumptions and rounding as applicable. Validate arithmetic and units deterministically where possible; a plausible model explanation alone does not verify a calculation.
- Contextual inferences and figure estimates are outside the approved automatic proposal policy. Do not retain current INF/FIG behavior as acceptable solely because an existing prompt supports those tags.
- Reconcile llm_extractor.py, coded_extraction_service.py, prompt builders, schemas, parsers, UI and exports around this policy; changing the system prompt alone is insufficient.
- Acceptance criteria: direct-value fixtures point to supporting evidence; calculated fixtures reproduce from cited inputs; unsupported inference is rejected/flagged; absent values remain explicitly unresolved; reruns do not overwrite accepted human data.
- Consolidated resolution: D39–D44/D47 subsequently resolve per-value verification, approved forms, structured repeated values, report linkage and evidence display.

### D38. Jev/Laya launches in non-mutating shadow mode

- User decision: compare Jev/Laya outputs with LLM results and human labels in shadow mode; do not change recommendations or evidence tags until task-specific validation supports a later decision.
- Persist shadow outputs separately from user-visible baseline recommendations, evidence, extraction proposals and accepted human data. Retain engine/model version, task/stage, protocol/source version, coverage and execution outcome for meaningful comparison.
- Important implementation gap: the current screening decorator returns the LLM baseline in shadow mode, but laya_extraction_tracer runs whenever is_jev_enabled() is true and can mutate quote/page/tag fields. Setting jev_mode=shadow alone does not satisfy this decision. Make evidence tracing explicitly non-mutating in shadow mode or run it on an isolated copy and store only separate comparison results.
- Do not count Jev/Laya scores as calibrated accuracy or mark evidence verified solely from model output. Validate quote membership, page location and reproducible calculation provenance independently under D37.
- Preserve D14: shadow data and comparison views must not leak AI recommendations to reviewers before their initial independent vote. Limit evaluation access appropriately.
- Acceptance criteria: enabling shadow execution leaves baseline recommendations, source quotes/pages, evidence tags and human records unchanged; comparisons can be retrieved by authorized evaluators; failures/missing models are explicit; task-specific labelled evaluation distinguishes screening and evidence-checking quality and reports coverage limits.
- Promotion beyond shadow mode requires a separate explicit decision after reviewing evaluation results. No automatic threshold-based promotion is approved.
- Consolidated resolution: D57 prohibits remote external Jev/TypeSafe fallbacks. Local university-hosted Laya remains shadow-only; auxiliary direct tool paths must obey the same rule.

### D39. Per-value human verification of extraction proposals

- User decision: one human verifies each proposed extraction value against its evidence and accepts or corrects it; unresolved values remain flagged.
- Keep AI proposal, human correction and approval state distinct. Autosaving a proposal or draft edit is not approval; retain reviewer identity, time, source/version and the value actually approved.
- Present source evidence and location alongside the value; calculated proposals must expose cited inputs and formula under D37. Let reviewers reject, correct or flag a value without fabricating unavailable evidence.
- Analysis and final-result exports must use approved values, with explicit handling of unresolved/missing fields. Draft/audit exports may include proposals only when clearly labelled and authorized; they must not imply human verification.
- No second independent verifier or whole-study bulk approval is required by this decision. Do not implement a bulk action that bypasses per-value verification while claiming compliance.
- Acceptance criteria: individual values can be accepted/corrected with evidence and attribution; unresolved fields remain visible; model reruns cannot overwrite accepted values; downstream analysis distinguishes approved inputs from proposals; history shows original proposal and human changes.

### D40. Human-approved extraction forms drafted from the protocol

- User decision: AI drafts the extraction form from the approved protocol; users edit and approve each field's definition, type, units and allowed values before extraction.
- Treat generated fields as proposed schema, not automatically authoritative extraction instructions. Save draft/approval state and link the approved form version to the protocol version used to create it.
- Each approved field needs a stable identifier and clear extraction semantics. Represent units and allowed values explicitly where applicable; do not force them onto fields for which they are not meaningful.
- Prompt contract: propose fields relevant to the review question and planned synthesis, identify missing methodological choices, and avoid inventing eligibility criteria or outcomes not approved in the protocol. D37 governs evidence and calculations regardless of generated field instructions.
- Use the approved schema consistently across prompts, output validation, reviewer UI, saved values and exports. Reject or flag incompatible values rather than silently coercing a number into an inappropriate field or mixing units.
- Acceptance criteria: users can edit and approve proposed fields; extraction references the approved form version; generated but unapproved fields cannot silently enter final extraction; reopened projects retain definitions, units, options and approval provenance.

### D41. Structured arm/outcome/timepoint extraction

- User decision: represent multiple arms, outcomes and follow-up times as structured repeatable rows, with each value linked to its applicable arm, outcome, timepoint and evidence.
- Retain study-level characteristics separately from repeatable measurements. Use stable identifiers and relationships rather than relying on column names or array position to distinguish arms, outcomes and follow-up periods.
- Preserve measurement definitions, units, sample sizes and effect/comparison context where applicable. Distinguish a true zero from missing, not reported or not applicable.
- Adapt AI output schemas, persistence, reviewer UI and exports together. D39 per-value approval and D8 conflict protection apply within repeated records, not just to a single study-level cell.
- The existing extraction model centered on study_id/variable_id needs a migration/design review; adding UI rows alone cannot establish correct relational identity or prevent overwriting repeated values.
- Acceptance criteria: one study can retain multiple arms and repeated outcome/timepoint values without overwriting; reviewers can inspect evidence and approve each value; export/import and reopening preserve identities; downstream analysis selects the intended comparison/timepoint and does not silently double-count correlated data.

### D42. Spreadsheet-style variable entry and extraction table

- User request: entering a variable should feel like adding a new column in Excel. Provide an Add column action, an editable column/variable name and suitable controls for field definition, data type, units and allowed values under D40.
- Render variables as columns and extraction records as rows. Preserve D41's study/arm/outcome/timepoint identities; a familiar spreadsheet interface does not change the confirmed structured storage model into a single flat row per study.
- Keep stable variable identifiers independent of displayed column names and order. Renaming/reordering a column must not orphan evidence or reinterpret saved values; deleting a column must not silently erase accepted data/history.
- Cell editing must respect typed validation, D7 autosave states, D8 conflict handling and D39 per-value human approval. Store source evidence and approval metadata with each value and make them accessible from the cell without requiring long quotes in every visible column.
- New variable definitions remain drafts until approved under D40. Distinguish new-variable entry from entering a value for an already approved variable; the exact draft/amendment flow is still to be confirmed.
- Plan keyboard-accessible navigation and a usable layout for repeated records. Copy/paste, formulas, fill-down, bulk import and Excel-level feature parity have not been requested or approved by this interface request.
- Acceptance criteria: Add column creates a proposed variable with a stable ID and definition; approved variables can be entered as cells; reopening preserves columns, structured row identity, values and evidence; renaming/reordering does not lose approvals; concurrent edits and save failures remain visible.
- Consolidated resolution: D43 confirms multiple-report linkage; D44/D46 confirm approved-column amendments and selected-study autofill.

### D43. Human-confirmed study/report relationships

- User decision: preserve individual papers, reports and supplements as separate documents; link related reports under one underlying study only after human confirmation; identify the source report for every extracted value.
- Distinguish canonical study identity, report/reference identity, document/version identity and imported occurrences. D31 reference deduplication is not permission to merge distinct reports into one document or study automatically.
- Allow suggested links with reasons, but retain unconfirmed suggestions separately. Shared trial identifiers may support a suggestion, not substitute for confirmation.
- Extraction evidence must resolve to the actual report/document version and location. Preserve multiple sources and expose contradictory values rather than silently selecting one report's value as authoritative.
- Acceptance criteria: primary paper and supplement remain independently retrievable, can be linked after confirmation, and support separately attributable extraction values; study-level reporting can avoid double-counting without losing report-level retrieval and screening history.

### D44. Approved column amendments with selective extraction

- User decision: a variable added after extraction starts is a draft column; approve its definition, save a new form version and let the user select the studies to extract it from.
- Do not automatically rerun the entire project or retrospectively mark prior studies complete for the new field. Show applicability and completion status by study and form version.
- Extract the selected new field(s) as proposals under D37/D39. Protect existing accepted values, evidence and histories; adding a column must not overwrite unrelated fields or revoke their approvals merely because the form version changed.
- Persist the amendment author/time and approved definition, and record which studies/fields each extraction job targets. Display queued, running, failed and completed outcomes accurately under the durable-job design.
- Acceptance criteria: creating a draft column does not trigger AI; approval creates a retrievable form version; only selected studies receive new proposals; prior approved cells remain intact; reruns are attributable and failures can be retried without duplicates.

### D45. Optional AI suggestions during protocol setup

- User decision: provide a toggle during protocol generation that lets users turn AI suggestions off.
- Confirmed default/trigger: on for new projects, but generation requires an explicit click on Generate suggestions; users can disable assistance anytime. Do not generate automatically on page load or while typing solely because the toggle is on.
- Refines D10: AI-assisted drafting is available, but manual protocol creation/editing must remain fully usable when suggestions are disabled. Approval, saving, versioning and eligibility validation apply in either mode.
- When disabled, do not initiate protocol-drafting/suggestion model calls or insert newly generated suggestions. Required structural validation can still run without presenting model-generated advice.
- Keep this control scoped to protocol assistance; it does not automatically disable or enable AI screening, extraction or Jev/Laya shadow evaluation.
- Turning suggestions off must not silently delete saved user text or an approved protocol. Any removal of unaccepted AI suggestions must be distinguishable from deletion of accepted content.
- Acceptance criteria: users can create, save and approve a protocol with assistance disabled; disabling prevents new protocol suggestion requests and late response insertion; enabling allows explicit drafting without overwriting user text; the toggle does not change other AI workflows.
- Additional acceptance criteria: new projects show assistance on but initiate no drafting request until Generate suggestions is clicked; switching it off preserves saved manual/approved protocol text.

### D46. Variable-column autofill with truthful animated progress

- User request: after entering a variable such as year, offer automatic column filling and slowly pulsating loading feedback.
- Confirmed trigger: users choose target studies during column setup; approving the definition automatically queues autofill for those selected studies. Do not require a separate Run action or silently add unselected studies.
- Reconcile with D40/D44: the variable definition must be approved and extraction targets chosen before extraction runs. Save the approved form version and target selection before dispatch; recover a dispatch failure without duplicating approvals or extraction jobs.
- Reconcile with D38: Jev/Laya remains non-mutating shadow evaluation until separately approved after validation. The existing LLM extraction pipeline generates proposals; Jev/Laya cannot directly populate user-facing cells or promote evidence tags under the current decision. Display actual engine roles accurately.
- Show a slow pulse/shimmer only for selected cells or the relevant column portion with real queued/running work; accompany it with explicit status and counts. Completed, failed, cancelled, unavailable and unresolved cells must stop animating and display their actual state.
- Respect reduced-motion preferences and provide equivalent static status. Do not use animation to suggest a job exists before the server acknowledges it or to hide indefinite queue delays.
- Autofilled results are unapproved proposals under D39; persist value, evidence/source and execution provenance without overwriting approved human values. No-result outcomes remain explicit missing/uncertain states under D37.
- Acceptance criteria: selected target records receive attributable proposals after a real job is queued; loading feedback matches persisted job state across reloads; failures/cancellation stop the pulse; reduced-motion mode works; existing approved cells remain unchanged; human verification is still required.
- Additional acceptance criteria: approval starts one logically unique autofill operation for the chosen studies/fields; repeated clicks or request retries do not create duplicate work; successful form approval and failed job dispatch are reported separately and can be recovered without losing the approved column.

### D47. Per-cell evidence side panel

- User decision: selecting an extraction cell opens a side panel with the source PDF at the cited page, highlighted evidence and Accept/Correct/Flag controls.
- Resolve the source report/document version under D43 and its stored page/location. Show the extracted quote and approval/proposal status; calculated values must additionally expose cited inputs and formula under D37.
- Highlight only verified source locations. If coordinates or page evidence cannot be resolved, display the limitation and available source text rather than inventing a highlight or defaulting to page 1.
- Accept/Correct/Flag operates on the selected value under D39, retaining provenance, save status and conflict handling. Flagging must not silently approve a value.
- Acceptance criteria: selecting a value opens its correct authorized source/version and page; valid coordinates highlight the supporting region; missing locations are explicit; controls persist the selected value's review outcome without affecting other cells.
- Keep the table usable and source navigation keyboard accessible; narrow-screen behavior remains an implementation design detail.

### D48. HPC OCR/layout processing for scanned or unusable PDFs

- User decision: when an autofill target has a scanned PDF or unusable extracted text, queue OCR/layout processing on HPC, display awaiting-processing status and flag low-quality or failed results for review.
- Distinguish a missing PDF from a present document that needs OCR. Do not claim OCR can retrieve an unavailable report or silently substitute an abstract for full-text evidence.
- Preserve the original PDF and version derived OCR/layout artifacts with processor/model settings and quality/failure metadata. Evidence coordinates must map back to the correct original document/page.
- Store durable job/dependency state so selected field extraction waits for usable processing output and can resume across HPC allocation changes. Represent scheduler waiting separately from active processing and failed/cancelled work.
- Recommended quality checks: page/text coverage, empty or garbled output, table extraction limitations and document-language support. Select OCR technology, quality thresholds, resource limits and retry policy after examining university runtime capabilities and representative documents.
- Low-quality output must not silently produce accepted values. Keep proposal uncertainty visible and preserve D39 human verification; Jev/Laya remains shadow-only under D38.
- Acceptance criteria: a scanned fixture queues actual processing, pending cells show accurate state, usable output enables extraction, low-quality/failing cases remain flagged, and restart/retry does not overwrite approved data or duplicate jobs.

### D49. Human-confirmed, version-specific appraisal tools

- User decision: recommend risk-of-bias/critical-appraisal tools based on study design and review purpose; require human confirmation of tool and version before AI prefills evidence.
- Suggest only supported, methodologically appropriate instruments from a verified catalogue; uncertain study design or applicability needs clarification rather than a fabricated tool match.
- Persist confirmed tool/version and applicable assessment scope. Some instruments assess particular outcomes/results rather than a study as a whole; do not force every instrument into one generic study-level score.
- Before prompt changes, check exact instrument domains, signaling questions, permitted responses, judgment labels and decision rules against authoritative version-specific guidance. Existing rct_rob_engine naming does not prove RoB 2/ROBINS-I compliance.
- AI prefilling must cite report/document evidence and distinguish not reported from evidence of bias. It must not silently invent signaling answers, tool versions or completed human assessments.
- Acceptance criteria: suggestions state applicability/reasons; confirmation precedes prefilling; assessments preserve correct tool/version/question structure; unsupported instruments are explicit; switching tools does not reinterpret prior judgments as if made using the new instrument.
- Consolidated resolution: D50 sets one human verifier for every answer/evidence/domain and final assessment approval; D100 sets the launch design groups.

### D50. Human verification and approval of appraisal assessments

- User decision: one human checks every signaling answer, its supporting evidence and domain judgment, then approves the overall assessment.
- Keep AI-prefilled items, reviewer edits/verification and final assessment approval distinct. Save attribution, tool/version, source versions, rationale and timestamps; a completed AI job is not an approved assessment.
- Derive instrument judgments using the confirmed instrument's supported rules where applicable; AI cannot invent generic scoring or replace tool-specific decision logic. Any allowed manual override must preserve justification and the underlying answers.
- Prevent overall approval while required items are unreviewed or invalid under the instrument's rules. A valid verified response such as no information must not be misrepresented as an unreviewed item.
- Reports and downstream certainty assessment must distinguish drafts from approved assessments. New evidence or changed answers must not silently retain approval of a superseded assessment; retain history and flag affected judgments.
- Acceptance criteria: a reviewer can inspect/verify each item and domain, correct proposals with rationale and approve the overall assessment; unreviewed required items block finalization; AI reruns cannot overwrite approved judgments; exports retain tool/version and approval state.

### D51. Human-confirmed, reproducible meta-analysis specifications

- User decision: guided setup proposes effect measures, study/timepoint selection and statistical methods; a human confirms the analysis specification; deterministic statistical code computes results from approved data.
- Persist the confirmed specification and exact approved input versions, including selected outcomes/comparisons/timepoints, units, transformations and relevant model options. Identify the statistical implementation/version and retain diagnostics and warnings.
- AI may explain or propose methods but must not manufacture effect estimates, uncertainty intervals, p-values or plot data. Numerical outputs must come from the validated computation path.
- Unapproved extraction proposals are not analysis inputs under D39. Missing data must not become zero; unsupported specifications should be rejected or flagged for clarification.
- Acceptance criteria: a human can inspect/confirm the proposed specification; the same input/specification versions reproduce results within defined tolerances; regression fixtures verify calculations against trusted references; incompatible or unapproved data cannot silently enter pooled estimates.

### D52. Explicit invalidation and reviewed regeneration of derived outputs

- User decision: when approved extraction values or inclusion decisions change, mark affected analyses/reports Out of date, preserve prior versions and require explicit rerun/review before publishing updated results.
- Track dependencies on versioned inputs/specifications so the affected scope can be established. If impact is uncertain, flag potentially affected outputs rather than silently presenting them as current.
- Do not automatically overwrite prior numerical results, plots, tables, narrative drafts or final exports. Retain the input/specification versions that produced each historical output.
- Out-of-date status must be visible in the UI and download/report metadata. Historical downloads may remain available when clearly labelled; they must not be represented as current approved results.
- Rerun creates a new derived version and a review requirement, not automatic publication or approval. Changes during an in-flight computation must not cause a result from older inputs to be labelled current.
- Acceptance criteria: changing a source input flags the appropriate dependents; unaffected outputs remain identifiable; old versions remain reproducible/retrievable; regeneration uses explicit input versions; approval/publication of updated results requires the selected review step.
- Confirm exact propagation rules for protocol/form/source changes, permission to rerun/approve and final-output publication semantics during implementation planning.

### D53. Source-grounded narrative drafts with section-level human approval

- User decision: AI drafts narrative synthesis and report sections from approved review data and verified source evidence, with traceable citations; humans edit and approve every final section.
- Keep generated drafts, edits and section approval versions separate. AI generation, autosave and successful citation formatting do not constitute final approval.
- Bind factual claims to the actual approved data/source versions used. Reuse validated statistical outputs under D51; do not ask the language model to invent numerical results, references, completed methods, search dates or registration details.
- Report missing evidence and methodological limitations faithfully. Do not add outside literature as verified review evidence or infer a causal conclusion solely from a pooled estimate.
- Citation validation must check source identity and claim support, not merely that a reference exists. Unsupported claims must be flagged for correction or removed before section approval.
- D52 applies when underlying evidence or results change: preserve the old section, mark affected text Out of date and require explicit regeneration/editing and review. Avoid overwriting manually edited approved text.
- Acceptance criteria: report claims can be traced to approved inputs; unsupported-citation fixtures are flagged; all final sections carry attributable approval; changed dependencies flag affected sections; report exports distinguish draft, approved and outdated content.
- Consolidated resolution: D54 adds optional outcome-level GRADE. Final report section/report approval role is still unanswered; do not infer it from analysis approval.

### D54. Optional, human-approved outcome-level GRADE

- User decision: offer outcome-level GRADE for suitable systematic reviews, with AI drafts and human-approved factors/judgments; optional for scoping reviews.
- Keep certainty across a body of evidence distinct from individual-study risk-of-bias assessment. Assess an explicitly defined outcome/body of evidence and link relevant comparisons, timepoints, studies and approved results.
- Validate supported GRADE methodology, starting levels, factors, allowed judgments and rationale against authoritative guidance. Do not turn an arbitrary confidence score or generic model label into a GRADE rating.
- AI may propose evidence/rationales from approved inputs; a human must review and approve factors and the overall judgment. Preserve disagreements, overrides and reasons where supported rather than silently accepting model output.
- Applicability must not depend solely on whether a meta-analysis was performed; document support and limitations for narrative syntheses and different question types. Unsupported variants must be explicit.
- D52 dependency/version rules apply to changed study inclusion, appraisal, extraction and analysis inputs. Draft or stale certainty ratings must not appear as current approved Summary of Findings results.
- Acceptance criteria: applicable outcomes can receive attributable factor and overall approvals; citations trace to the evidence body; users can omit optional GRADE without blocking review completion; invalid/unsupported automatic ratings are rejected or flagged; exports disclose methodology and approval state.

### D55. Validate pairwise and diagnostic-accuracy meta-analysis separately

- User decision: first-release scope includes both pairwise intervention/exposure analyses and diagnostic-accuracy meta-analysis, with separate method validation.
- The presence of generic effect-size and bivariate/SROC functions in services/meta_analysis.py is implementation evidence, not proof those methods are correct or complete. Inventory exact estimators, assumptions, supported inputs and numerical limitations before selecting supported specifications.
- Pairwise analyses must retain comparison, effect measure, uncertainty and timepoint identity and handle multi-arm dependence appropriately. Diagnostic analyses must preserve TP/FP/FN/TN definitions, thresholds, test/comparator identity and relevant dependence rather than treating all tables as independent observations.
- Document which diagnostic model is actually fitted; do not label a simplified approximation as a validated bivariate/HSROC model solely because of function names or an SROC plot.
- Compute using approved data and a human-confirmed specification under D51. Report incompatible inputs, convergence failures, sparse-data limitations and unavailable methods honestly.
- Acceptance criteria: independent reference datasets verify both method families within defined tolerances; edge cases cover zero cells, missing inputs, invalid counts and dependent observations; output provenance records implementation/options and diagnostics; plots reflect the actual validated model.

### D56. Explicit user opt-in before any pooling

- User decision: let the user decide whether to pool before performing any pooled analysis.
- Offer a clear choice to perform pooling or continue without it. Support narrative synthesis/structured descriptive outputs when pooling is declined; systematic review completion must not require pooling under D9.
- A positive pooling choice is followed by human confirmation of the exact analysis specification under D51. The action must identify the target approved studies/outcomes/comparisons/timepoints and selected validated method family under D55.
- Do not run pooling automatically on import, screening completion, extraction approval, appraisal completion or visiting an analysis page. AI suggestions may explain options but cannot grant consent to compute.
- Changes to inputs trigger D52 outdated status and require an explicit rerun/review; do not reuse earlier opt-in as blanket authorization for silent recomputation with different inputs.
- Acceptance criteria: users can decline pooling and continue reporting; no pooled model job runs before explicit opt-in/specification confirmation; the selected scope and initiator are recorded; reruns require an explicit action and preserve prior versions.

### D57. University-only AI inference; external fallbacks prohibited

- User decision: PDF text and review content may be processed only by university-hosted models; disable external AI-provider fallbacks across protocol drafting, search-query assistance, screening, extraction, appraisal, synthesis and other applicable AI tasks.
- Enforce this rule centrally in backend provider/client configuration and every alternate model/tool path. A UI preference alone is insufficient. Untrusted project content and ordinary users must not redirect inference to arbitrary endpoints or change global provider settings.
- In jev_client.py, local Laya may currently fall back to the remote TypeSafe Jev API when unavailable. Remove/disable that external route for this deployment. D38 shadow evaluation remains subject to the same university-only rule.
- If approved university inference is unavailable or fails, show queued/unavailable/failed state and retain human/manual workflows and saved work. Do not silently route to an external vendor, fabricate a result or bypass required human approval.
- Verify endpoint ownership, approved network destinations, university gateway behavior, credentials and worker access. A university-looking URL alone does not prove that a gateway never forwards content to an outside provider; its actual routing must comply.
- Record model/engine and execution provenance without putting credentials or unnecessary source contents into logs. Use securely configured credentials; never ask for secret values in chat or embed them in the handoff.
- This governs AI inference, not a blanket ban on approved PubMed retrieval, DOI links, transactional email or Cloudflare routing. Evaluate those data flows separately; no new content-sharing permissions are inferred.
- Acceptance criteria: successful AI calls reach only approved university-hosted inference; simulated failures and unavailable local Laya cause no external fallback; attempts to configure unapproved inference endpoints are denied; manual review and data access continue when models are down.

### D58. Owner/Manager authority for pooling and final analysis approval

- User decision: Reviewers may prepare analysis specifications; only the project owner or a Manager may start pooling and approve final results.
- Apply these permissions server-side to job dispatch, explicit reruns and approval endpoints as well as UI actions. Viewer access does not permit specification edits or analysis execution.
- Preserve specification authorship separately from the authorized initiator and final approver. Starting a job is not approval of its outputs; final approval must reference the completed result and input/specification versions actually reviewed.
- D56 explicit opt-in and D52 stale-output rules still apply. A saved specification, completed background job or earlier approval must not automatically authorize a new pooling run or approve changed results.
- Acceptance criteria: a Reviewer can prepare a specification but cannot dispatch pooling or approve results through direct API requests; an owner/Manager can explicitly initiate and approve; revoked/downgraded members cannot continue exercising former permissions; all relevant actions are attributable.
- This does not require a different person to initiate and approve, or authorize a Manager to transfer ownership/delete the project. Those rules remain separate.

### D59. Integrate a job-scoped university model endpoint (corrected)

- Latest user-confirmed context: the user starts a model server inside an HPC job; its endpoint disappears when the allocation ends. The earlier answer suggesting a separately available university API is superseded. Do not assume a continuously available inference service.
- Verify endpoint ownership/routing under D57, protocol compatibility, supported models, context limits, structured output/tool support, authentication method, rate/concurrency limits and service availability. No particular model, OpenAI-compatible interface or service-level guarantee is established by this answer.
- Verify approved connectivity from the proposed continuously running API and HPC workers, including dynamic endpoint registration/discovery and service authentication if addresses change. Existing access does not automatically grant the new web service access or permission to serve public registered users through the inference service.
- Store endpoint configuration and credential bindings securely; do not collect token values in the interview. Record connection prerequisites and test authorized requests without exposing secrets or private documents.
- Model availability is tied to the inference allocation; separately inventory OCR/analysis allocations rather than assuming all compute shares one job. Endpoint loss must not make the always-running website, accounts or saved project data unavailable under D23.
- Persist AI request/job state outside the allocation, distinguish waiting for compute from active inference, and handle interrupted/ambiguous requests without duplicate accepted results or loss of acknowledged saves. Do not assume automatic resubmission is permitted or immediately scheduled.
- Acceptance criteria: an authorized application service can make a representative approved inference request and validate its output; ending the model job leaves web/data access working; interrupted requests have truthful durable states; reconnecting to a new approved endpoint does not duplicate or overwrite approved outputs; no external fallback occurs.
- Consolidated resolution: The corrected answer governs: the model endpoint is job-scoped and disappears when its HPC allocation ends, not a guaranteed continuously available university API.

### D60. Durable AI queue with automatic recovery and cancellation

- User decision: persist AI requests while the HPC model service is unavailable, automatically resume when an authorized service returns, and provide status and cancellation controls.
- Queue state and required payload/source references must survive both web-process and HPC allocation restarts. Model-server memory, daemon threads and in-process dictionaries alone do not satisfy this decision.
- Distinguish waiting-for-service, queued, running, completed, failed, cancellation-requested and cancelled as applicable; do not show progress implying active inference while waiting for a scheduler allocation.
- Before dispatch, revalidate project access, authorized service identity, source/protocol/form versions and the operation's original target scope. Superseded, revoked or invalid work must be blocked/flagged rather than run silently against changed inputs.
- Design idempotent execution/result reconciliation for retries and uncertain interruption; do not promise exactly-once model execution. Duplicate delivery must not duplicate accepted records or overwrite human-approved results.
- Cancellation must prevent pending work from dispatching and prevent late results from applying to cancelled work. Be explicit if a running model request cannot be stopped immediately; cancellation of one request must not terminate unrelated users' HPC work.
- D56/D58 remain binding: automatic queue resumption does not authorize new pooling, a broader target set or automatic final approval. Resuming AI proposals is not an exception to human-review requirements.
- Acceptance criteria: enqueue while the model is down, restart services, restore an authorized endpoint and verify accurate resumption; cancelled/revoked/stale jobs do not apply results; retries do not duplicate records; manual review and saved-data access remain usable throughout.

### D61. Fair shared AI scheduling with per-user limits

- User decision: schedule HPC AI work fairly across users and projects, impose per-user limits and prevent large batches from blocking other users.
- Split bulk work into bounded units where feasible and interleave dispatch fairly rather than executing an entire large project ahead of all later requests. Preserve per-task dependencies such as OCR before extraction.
- Enforce limits server-side across sessions, projects and workers; creating additional projects must not trivially bypass a user's quota. Project roles must not imply control over platform-wide priority.
- Separate admission/queued-work limits from active inference concurrency, token/document limits and institutional scheduler allocations. Numeric values require capacity testing and operator configuration; no inference throughput has been verified.
- Recommended behavior: display queue state and quota/limit explanations, allow cancellation, and retain partially completed batch results. Avoid promising exact queue times without measured estimates.
- Acceptance criteria: when a large batch and a second user's smaller request are queued, both receive service under the configured policy; user limits hold across multiple clients; cancelled work releases capacity; restart does not erase quota/accounting state needed for enforcement.

### D62. Advisory upload notice with human-controlled continuation (revised)

- Latest user decision: show an advisory notification about appropriate research uploads, institutional permissions and sensitive information; let the human decide whether to proceed. Do not implement a software-enforced content-policy prohibition based on the earlier selection.
- Keep research publications and review data as the intended use. Suggested concise notice: "Check that you have permission to upload this material and that it is appropriate for your university service. Avoid identifiable patient information and confidential clinical records." Exact copy/location remains a UX detail.
- Do not add automated sensitive-content classification, speculative detection rules, repeated consent dialogs or a blocking approval workflow for this notice. Do not imply an automated scan has verified the document is safe or permitted.
- This clarification does not remove D2 project privacy, backend authorization, supported file validation, path confinement or technically necessary parser/resource safeguards. Keep such checks proportional and report actionable errors rather than speculative policy failures.
- Do not expand scope into a specially certified clinical-data platform or claim that clicking Continue supplies institutional permission. The app's notice is advisory; institutional requirements still exist independently of it.
- Acceptance criteria: a concise advisory is shown in the chosen upload flow; the user can continue or cancel without a content-classification gate; normal supported research uploads proceed without extra policy checks; access isolation and technical upload validation remain intact.
- This replaces the earlier prohibition/incident-policy implementation wording. No sensitive-content screening or additional institutional approval UI is authorized by D62.

### D63. Owner-only deletion with private 30-day recovery

- User decision: only the project owner may delete a project; retain it privately for recovery for 30 days before permanent removal.
- Enforce deletion permission server-side. Managers, Reviewers and Viewers cannot delete by calling the API directly.
- Treat deletion as a recoverable state with a recorded owner/time and removal deadline. Remove deleted projects from normal collaborator access; do not make recovery copies public or available to unrelated users.
- Cancel/block project work as appropriate and prevent late job results from resurrecting deleted data. Restore project relationships, document references and history consistently within the recovery window.
- At expiry, remove active database/document data according to a coordinated purge process; disclose that separately protected backups expire under their own retention policy rather than claiming immediate erasure from every backup.
- Acceptance criteria: nonowners cannot delete; owner deletion hides/protects the project and sets a 30-day deadline; authorized restoration recovers records/files; expired recovery state is purged without orphaning files or reviving queued work.

### D64. Evidence-rich review exports and editable report documents

- User decision: first-release exports include Excel/CSV data with evidence and review status, reference files, PRISMA outputs, appraisal/analysis tables and figures, and an editable report document.
- Preserve stable study/report/arm/outcome/timepoint and variable identities in tabular outputs; include units, missing-value meaning, source/report locations and proposal/approval state without flattening away repeated data under D41.
- Distinguish approved final-result exports from clearly labelled draft/audit exports under D39/D50/D53. Disclose outdated dependencies under D52; exports must not misrepresent an AI proposal as verified data.
- PRISMA reporting must reconcile source/import counts, duplicate occurrences, reports not retrieved, assessed/excluded reports and included studies without conflating studies and reports. Validate the exact diagram/template applicable to systematic versus scoping workflows.
- Generate numerical tables/figures from validated deterministic outputs. Editable report generation must preserve human-approved sections and traceable citations; do not regenerate prose silently during export.
- Acceptance criteria: representative multi-report/multi-arm data exports retain identities/evidence/status; counts reconcile; editable report opens with citations/tables intact; download authorization and stale/draft labels are enforced; failures are actionable and do not expose files across projects.

### D65. Role-aware approved and draft exports

- User decision: all project members may download approved outputs; Reviewers, Managers and owners may additionally export clearly labelled draft data. Viewers cannot export drafts.
- Enforce permissions at export generation, job/status access and final file download, including previously issued artifact links. A hidden button alone is insufficient; recheck current project access and artifact classification as appropriate.
- Classify exports by content, not filename: an archive containing unapproved proposal values or draft sections is a draft export even if another portion is approved.
- Preserve D12/D14 concealment: draft export permission must not reveal another reviewer's still-hidden decision or AI output before the requesting reviewer is eligible to see it. Export permissions do not bypass independent review.
- Revocation/deletion must prevent new artifact access under the project privacy rules. Avoid reusable unrestricted filesystem URLs for exported files.
- Acceptance criteria: a Viewer can download approved outputs but is denied draft downloads through direct requests; Reviewers can export authorized drafts with clear status labels; a revoked member cannot retrieve an existing artifact; concealed content is absent from premature exports.

### D66. Retain standalone tools as experimental features

- User decision: keep Claimscape, Citation Telephone, Rigor Scan and graph views accessible with clear experimental limitations; prioritize completion and validation of the main review workflow.
- User clarification: all named tools must be retained. Discuss and document each tool's methodology in the remaining interview; experimental status is not permission to remove, hide or abandon them.
- Preserve existing tool code and navigation unless specific changes are necessary for correctness/security. Do not silently delete tools or present them as fully validated launch capabilities.
- Experimental status does not waive private-project authorization, temporary guest-session isolation, university-only AI routing, truthful failure states or D38 non-mutating Jev/Laya policy. D113 expressly permits guests for the public standalone tools.
- Recommendations/drafts from experimental tools must not silently modify approved screening, extraction, appraisal, analysis or report data. Require explicit adoption and the applicable human review step.
- Investigate the recorded Rigor Scan and Citation Telephone test failures when preparing these surfaces; do not hide failures by removing tests or claim experimental labels prove correctness.
- Acceptance criteria: tools remain discoverable with concise limitations; main review tasks remain accessible without them; outputs do not silently become approved review evidence; unavailable inference/processing is explicit.
- Consolidated resolution: D113 requires functional public guest access for Claimscape, Citation Telephone and Rigor Scan. Experimental disclosure is not permission to ship broken/demo-only behavior. The code graph remains operator-only under D78.

### D67. Session-only standalone tool runs (revised)

- Latest user decision: Claimscape, Citation Telephone, Rigor Scan and graph-view run inputs/results are available only in the current page session; a refresh clears them. Do not save these runs in project history or restore them after refresh.
- This explicitly supersedes the earlier project-private persistence selection and is a scoped exception to D6 complete-project persistence and D60 queue recovery. Main review data, source projects and approved review outputs remain persistent; clearing a tool view must not delete its underlying saved project data.
- Keep tool UI state in memory rather than localStorage, sessionStorage, persisted query caches or database run-history records. Do not rehydrate prior run inputs/results from URL parameters, background-job recovery or shared content caches after refresh. An empty view may offer an explicit example action, but must not present bundled example output as a restored user run.
- Backend processing may require temporary authorized work state; it must not create a permanent run archive. Specify cancellation/expiry and temporary-file cleanup appropriate to the HPC execution path. Do not promise refresh erases existing operational backups/logs; avoid storing tool payload/results in them in the first place.
- Refresh/navigation must not silently resume an old tool operation into the new page session. D57 university-only inference, access isolation and truthful job/failure status still apply to temporary work.
- Acceptance criteria: run each tool, refresh and verify no prior inputs/results/history are restored; main project data remains intact; another user cannot retrieve temporary results; late results from an old session do not populate the new session; temporary backend artifacts expire/clean up under the specified lifecycle.
- Consolidated resolution: D68 permits an explicit download but no saved run or Copy to project feature. D77 permits regenerating a fresh review-graph projection from persistent authorized records without saving prior graph-view state.

### D68. Explicit downloads from ephemeral tool sessions

- User decision: allow users to explicitly download standalone-tool results during the current session; retain no saved run inside the app.
- Downloading is opt-in, not automatic project adoption or run persistence. Refresh still clears the tool's inputs/results under D67; files the user already downloaded are outside that page-session lifecycle.
- Generate downloads from the current authorized result with actual method/source provenance, limitations and experimental status as applicable. Do not imply human approval or complete evidence coverage merely because a result is downloadable.
- Prefer in-session generation or short-lived private download artifacts as appropriate to output size; temporary server artifacts must expire and must not become a discoverable permanent run archive.
- Acceptance criteria: users can download a current result, refresh and see an empty tool state; no project-history run is created; expired or another user's temporary artifact cannot be retrieved; main review data is unaffected.

### D69. Claimscape as an inspectable claim/evidence map

- User decision: map retrieved papers as supporting, contradicting, mixed/uncertain or not addressing a user claim, with inspectable source evidence.
- Define relevance separately from stance; an irrelevant paper or unavailable finding is not contrary evidence. Avoid the current forced supports/contradicts choice for all cases.
- Preserve the exact claim, executed search query, retrieved source set and actual coverage in the current session/download. Do not equate a capped PubMed search with a complete systematic evidence base.
- Show the supporting excerpt/location and rationale for each classification; distinguish uncertain stance, mixed findings and insufficient source text where the interface permits. Label generated classifications as experimental proposals, not approved screening votes or causal proof.
- Do not produce a single numeric truth probability or overall definitive verdict as if approved by this decision. Counts or visual proportions describe retrieved/classified papers, not pooled effects or certainty ratings.
- D38 requires current Laya-based classifications to remain separate shadow comparisons; user-facing classification requires an approved university-model baseline or human labels until a later promotion decision. Do not silently exempt Claimscape from shadow-only policy.
- D67/D68 session-only lifecycle and explicit download apply. Do not initialize a new user claim with bundled example findings presented as its results.
- Acceptance criteria: fixtures cover all selected categories; each classification has traceable available evidence or an explicit evidence limitation; query/result coverage is visible; no automatic final review decisions or pooling are triggered.
- Consolidated resolution: D70–D72 resolve abstract/full-text source labels, user-confirmed neutral queries and design-stratified counts without an overall truth score.

### D70. Source-labelled abstract/full-text Claimscape evidence

- User decision: begin Claimscape with PubMed abstracts, use full text when available and label source level/coverage for each classification.
- Distinguish abstract-only, full-text-derived and incomplete/failed full-text processing. Possessing a PDF is not proof its complete content was read; record actual evidence chunks/pages and truncation/coverage limitations.
- Use permitted retrieval routes and university-only inference under D57. Do not imply access to publisher full text merely because a DOI link exists or bypass source access restrictions.
- When fuller evidence changes an initial abstract classification, preserve the distinction within the current run and explain the updated evidence basis; downloaded results should identify the classification/source actually shown.
- Missing or unreadable abstracts/full text must yield an explicit insufficient-evidence state where appropriate, not fabricated support or contradiction. Full-text unavailability does not automatically exclude a paper from the exploratory map.
- Respect D67: temporary text/documents introduced only for the standalone run must not become saved project artifacts by default. Existing project documents remain persistent and must not be deleted when the tool session clears.
- Acceptance criteria: abstract-only and full-text fixtures are correctly labelled, supporting excerpts resolve to the used source, partial context is disclosed, and fuller evidence can update the classification without misrepresenting the earlier evidence level.

### D71. User-confirmed neutral Claimscape queries

- User decision: propose a neutral PubMed query from the claim, let the user edit it, and require confirmation before fetching papers.
- Preserve the original claim separately from the proposed, edited and executed query within the ephemeral run and its explicit download. Do not silently change the confirmed query during retrieval or substitute a bundled example query.
- Query drafting should capture the topic/relationship without requiring the desired direction of effect. Explain that query neutrality does not establish search completeness or remove all retrieval bias.
- A query suggestion or claim edit must not itself initiate fetching; after a material query edit, execute only the version explicitly confirmed. Do not overwrite user edits with late AI responses.
- Follow D57 for any model-generated query and D67 for session-only state. Do not persist standalone searches as main-project search history merely to record query provenance.
- Acceptance criteria: proposed queries are editable; no fetch occurs before confirmation; actual requests use the confirmed text; result provenance/downloads show the executed query; refresh clears the standalone run.

### D72. Design-stratified Claimscape summaries without a truth score

- User decision: summarize support, mixed/uncertain and contradiction categories separately by study design, with counts and inspectable evidence; do not produce an overall truth score.
- Preserve the D69 not-addressing and insufficient-evidence states rather than forcing them into a stance category or hiding them from coverage accounting.
- State count denominators and distinguish retrieved, processed, classified and unresolved papers. Show unknown/uncertain study design explicitly rather than manufacturing a tier assignment.
- Do not convert publication counts or model scores into pooled effects, a probability that the claim is true, a GRADE assessment or a universal study-design quality ranking. Design grouping alone does not assess risk of bias.
- Acceptance criteria: each supported design group exposes category counts and contributing papers; count totals reconcile with coverage/exclusions; source evidence is inspectable; no overall weighted truth score is generated or exported.

### D73. Immediate-source checks with opt-in bounded citation tracing

- User decision: compare the citing sentence with its immediate cited source first; offer explicit bounded tracing into earlier sources where evidence is available.
- Separate immediate-source assessment from chain expansion. Do not imply that checking one passage has established the earliest source or validated an entire citation chain.
- Each link must identify the citing claim, cited report, actual available passage/location and source basis. A bibliography entry or a DOI resolving successfully is not supporting source text.
- Distinguish the cited paper's own results from background statements attributed to another paper. Do not force a chain to end with a confident primary-source label when evidence is unavailable.
- D57 university-only inference, D38 non-mutating Laya shadow mode and D67/D68 ephemeral runs/downloads apply. Trace expansion must not silently add sources or decisions to a persistent review.
- Acceptance criteria: an immediate comparison can complete without chain expansion; explicit expansion returns attributable evidence links with coverage/stop reasons; missing sources and cycles remain visible; no fabricated trace or result replaces unavailable evidence.
- Consolidated resolution: D74 supplies the four comparison verdicts and side-by-side evidence. Numeric trace limits are coding-agent proposals to document and validate.

### D74. Evidence-first Citation Telephone verdicts

- User decision: display Supported, Partly supported/overstated, Contradicted or Insufficient evidence for a citing claim/source comparison, with side-by-side excerpts and a concise reason.
- Define partly supported versus overstatement in the explanatory rationale, including scope, population, intervention, outcome or causal-strength differences where supported by the source. Do not equate absence of evidence in an excerpt with an explicit contradiction.
- Bind each verdict to the exact claim and available source passage/version; acknowledge limited passage/context coverage. Support is a statement about this comparison, not proof of the claim's overall scientific truth.
- Distinguish no source retrieved, no relevant passage found and ambiguous/conflicting evidence within the insufficient-evidence explanation. Never fabricate a source quote to complete the assessment.
- Avoid displaying numerical confidence as a calibrated probability without task-specific validation. The current detailed labels/probability schema must be adapted consistently across API, UI, downloads and tests.
- Acceptance criteria: labelled fixtures cover all four outcomes, explanations cite the actual compared excerpts, unsupported stronger wording is visible, unavailable evidence stays unresolved, and downloads retain the source basis/limitations.

### D75. Evidence-linked reporting checks and separate concern flags

- User decision: Rigor Scan assesses reporting completeness and separately flags methodological concerns; every finding links to source evidence; no overall quality score.
- Keep reporting items distinct from concern flags and from formal instrument-specific risk-of-bias judgments under D49/D50. An item not reported does not alone prove a method was not performed or a study is biased.
- Use explicit applicable/reported/partial/not-found/unassessable distinctions with clear definitions as appropriate; unavailable text or truncated context cannot justify a whole-paper absence claim.
- Concern flags must state their observable basis, scope and uncertainty rather than assert misconduct, invalidity or causal conclusions without evidence. Model findings remain experimental proposals for human inspection.
- Do not aggregate item counts into an overall quality/rigor score. If counts are displayed, label their denominator and meaning without implying validated study quality.
- Apply D67/D68 ephemeral lifecycle and explicit downloads; do not convert scan flags into approved project appraisal or exclusion decisions automatically.
- Acceptance criteria: reporting and concern findings are visibly distinct, each points to actual source evidence or an explicit evidence gap, uncertainty/coverage is represented, and neither UI nor downloads presents an overall quality score.
- Consolidated resolution: D76 confirms design-specific checklist suggestion and human confirmation, with a separate general-check layer.

### D76. Confirmed design-specific Rigor Scan checklists

- User decision: suggest an appropriate reporting checklist based on study design; users confirm or change it before scanning; retain a separate general-check layer.
- Catalogue supported checklists and versions against authoritative guidance, including applicability and valid item statuses. Uncertain design needs user clarification rather than a falsely confident automatic selection.
- Keep instrument-specific reporting items, general checks and D75 methodological concern flags distinguishable in UI and downloads. Do not assume every general check belongs to the selected official checklist.
- Persist checklist/version and confirmation only within the current ephemeral run and optional download under D67/D68, not a permanent run archive.
- Changing the selected checklist must not relabel old findings as if generated under the new checklist. Require an explicit new scan for changed items and accurately show waiting/running/failed state.
- Acceptance criteria: user can inspect/change the suggested checklist before execution; results show the actual version/item identity and applicable source evidence; unsupported designs/checklists are explicit; no overall quality score is generated.

### D77. Review graph represents verified record/provenance relationships

- User decision: graph edges represent verified data/provenance relationships and link to underlying records; they must not imply causality.
- Build graph edges deterministically from authorized explicit relationships, such as study/report membership, variable/value associations, source evidence and version dependencies. Do not invent conceptual links from text similarity or model output.
- Verified relationship means an actual supported record association, not automatic scientific approval of a connected value. Show proposal/approval/outdated state where relevant without depicting an unreviewed value as verified evidence.
- Enforce project access and D12/D14 concealment when building graph nodes, edges, labels, counts and downloads. A graph must not leak hidden reviewer votes or AI recommendations through metadata.
- D67 applies to the graph view/layout/run snapshot, not deletion of the underlying persistent review records. Refresh may clear the graph view; reopening it may explicitly regenerate a current authorized projection from saved project data, without restoring a saved prior view.
- Acceptance criteria: each edge resolves to its actual relationship/record; no AI-inferred or causal edges are added; authorization and concealment hold across filters/counts/downloads; deleted/revoked sources do not remain accessible through graph artifacts.

### D78. Developer/operator code graph

- User decision: retain the code-dependency graph as a developer/operator tool outside the researcher workflow.
- Distinguish platform developer/operator access from project Owner/Manager roles; owning a research project must not automatically grant operational privileges.
- Limit code-graph endpoints, source/path details and downloads to the intended operator access boundary. Do not expose arbitrary filesystem reads or secrets through file/subgraph parameters or generated metadata.
- Show graph build/source revision and stale/missing graph status. A static generated dependency graph is not necessarily the running application's current architecture.
- Preserve the tool under D66; separation from researcher navigation is not removal. D67 governs temporary view state and session downloads, not mandatory deletion of the repository's prebuilt code-graph source artifact.
- Acceptance criteria: researchers cannot reach operator-only code-graph data via direct API access; authorized operators can inspect graph provenance and dependencies; unavailable/stale graph state is explicit.

### D79. Maintainer-controlled evaluated prompt releases

- User decision: only platform maintainers may change production system prompts; release changes as evaluated versions with rollback.
- Project ownership/Manager status does not grant prompt-release authority. Approved project criteria and variable definitions remain editable through their selected workflows, but must be treated as task data rather than permission to override system contracts or backend safeguards.
- Maintain immutable prompt/template/tool-schema version identifiers and record the actual versions used by each persistent AI result. Evaluate changes in the relevant model/task configuration before promotion; do not silently hot-edit unversioned global prompt strings.
- Rollback changes the version selected for future permitted executions; it must not erase previous outputs, rewrite their provenance or silently rerun accepted review data. Handle already queued work with explicit version binding and stale-input policy.
- Apply the same governance to standalone-tool prompts and Jev/Laya question/policy changes where they affect behavior; D38 promotion beyond shadow still needs its separate evaluation/decision.
- Acceptance criteria: ordinary users and project Managers cannot modify/release system prompts; a candidate release has identifiable evaluation evidence; generated outputs identify their prompt/schema/model versions; rollback restores a known version for subsequent work without overwriting history.

### D80. Automated regression and human-reviewed labelled prompt evaluation

- User decision: before a prompt release, run automated schema/evidence regression tests and task-specific labelled cases reviewed by a human maintainer; compare candidate performance with the current version.
- Evaluate the actual task/model/prompt/schema combination. Mocked responses test integration contracts but do not establish real-model screening sensitivity, extraction accuracy, citation support or appraisal correctness.
- Include missing/ambiguous evidence, contradictory sources, malformed output, document truncation, multi-report/multi-arm cases and instructions embedded in source text. Validate quote/location membership and calculations using deterministic checks where possible.
- Choose task-specific metrics and release thresholds explicitly: screening false exclusions, extraction value/evidence errors, uncertainty handling and schema compliance are distinct outcomes. Do not reduce every task to a single average accuracy or accept a serious regression hidden by aggregate gains.
- Human-reviewed labels require defined guidance, provenance and ambiguity/adjudication handling. Model-generated labels are not automatically ground truth; keep an appropriate held-out evaluation set separate from prompt-tuning examples.
- Retain evaluation configuration, dataset version, comparison outcomes, limitations and release decision with the prompt version. Use approved/deidentified or permitted research material and do not make private project data a shared evaluation corpus without authorization.
- Acceptance criteria: a candidate release produces reproducible comparison records; failed required checks prevent promotion; maintainer review is attributable; task regressions and untested areas are visible; rollback remains available under D79.

### D81. Inventory existing human-verified evaluation examples

- User-confirmed context: verified research examples already exist. Inventory and assess their suitability before using them for prompt/model evaluation.
- Do not assume their location, format, permissions, task coverage or methodological correctness from this answer. Ask for an approved source/location when implementation needs access; preserve original files and labels.
- Inventory task labels, source/report versions, evidence locations, review type, study designs, languages, ambiguity and available verification/adjudication provenance. Separate genuinely verified answers from drafts or model-only outputs.
- Identify coverage gaps across the selected screening, extraction, appraisal and standalone-tool tasks. Split tuning/regression and held-out cases to support meaningful current-versus-candidate comparisons under D80.
- Existing tests/examples in the repository are candidates to inspect, not substitutes automatically deemed human-verified. Do not publish private data or copy it into shared fixtures without permission.
- Acceptance criteria: produce a versioned inventory with usability/coverage limitations, preserve verified source labels, document any corrections and obtain the human review required by D80 before using the set as release evidence.

### D82. Operator-managed inference configuration and approved model choices

- User decision: only platform operators control approved university model endpoints, credentials and platform-wide AI limits; project owners may choose among operator-approved models if options are offered.
- Enforce platform privileges separately from project roles. Project owners/Managers cannot set arbitrary endpoint URLs, read credentials or change global limits through direct requests or inherited settings APIs.
- Replace the current unauthenticated/global runtime settings pattern with appropriately scoped operator configuration. A project's approved model selection must not mutate another project's configuration or a shared singleton's effective settings unpredictably.
- Record the actual task model/version and operator-approved connection identity for execution, including queued work. If a selected model is unavailable, use D60 queue behavior rather than silently substituting an unapproved model or external provider.
- Model-specific prompt/schema compatibility and D80 evaluation must be established before listing a model as supported for a task. Offering a model name does not prove all task types work with it.
- Acceptance criteria: operators can configure approved connections securely; project users cannot retrieve or replace credentials; project selections remain isolated; all inference obeys D57; execution provenance identifies the model actually used.

### D83. Per-project target: 10,000 references and 1,000 PDFs

- User decision: first-release design/test target is up to 10,000 references and 1,000 PDFs within a large project, alongside D27's 5,000 registered users and 100 active users.
- This is not a measured capacity, guaranteed storage allocation or authorization to reject the 10,001st reference automatically. Quotas/admission limits require explicit supported configuration and user-facing explanation.
- Define reference-count semantics relative to original import occurrences, deduplicated reports and studies; preserve all occurrences under D31 while sizing import, search and reporting paths.
- Use paginated/filtered APIs, bounded import/processing batches and practical table/graph rendering; do not fetch every full-text document or extraction record into a browser by default.
- Test representative repeated extraction rows and report/arm/timepoint associations, not only metadata counts. Evaluate database indexes, filesystem access and job scheduling under realistic concurrent activity.
- Acceptance criteria: representative projects at this scale can import, deduplicate, browse, screen, save and export under specified latency/resource criteria; large batches remain cancellable/recoverable and do not monopolize the service.

### D84. In-app task status with opt-in email updates

- User decision: main-workflow AI/OCR/extraction tasks show persistent task status and in-app notifications; users may enable optional email notifications for completion/failure.
- Persist status for saved-project workflows under D60, distinguishing queued/waiting, running and actual outcomes. Avoid a separate email for every cell in a bulk extraction; summarize related batch outcomes and provide the authorized task link.
- Respect D67: standalone tool runs do not gain persistent status/history or completion-result emails merely from this preference. Their temporary-session behavior remains separate.
- Keep emails and notification previews minimal and avoid source excerpts, concealed votes or AI recommendations in unauthorized contexts. Recheck project access when opening a linked task/result.
- Offer clear opt-in/out controls for task emails; invitations, verification and password recovery remain transactional account flows rather than optional completion emails.
- Acceptance criteria: users can inspect main-task status after reload, opt into/out of task emails, receive accurate aggregate outcomes, and cannot access revoked/private task results through a notification link.

### D85. Per-study, stage-specific reveal of independent decisions

- User decision: in two-reviewer screening, reveal reviewers' decisions for a study after both have submitted for that study, then resolve disagreements.
- Apply the gate separately at combined title/abstract and full-text stages. Submission at one stage does not authorize early reveal at the next stage or for another study.
- D14 AI reveal remains individual: each reviewer becomes eligible for AI suggestions only after their own initial vote. The other human's vote remains hidden until both votes exist.
- Preserve the initial independent decisions and later revisions under D12/D36; reveal must not silently convert disagreement to consensus or finalize an AI recommendation.
- Acceptance criteria: one submitted vote leaves the other's decision inaccessible; both submissions reveal only that study/stage; disagreement appears for consensus/adjudication; exports/graphs/notifications obey the same access gate.

### D86. Owner/Manager approval of protocols and extraction schemas

- User decision: Reviewers can draft protocol, eligibility and extraction-form changes; only owners/Managers can approve initial versions and amendments/new columns.
- Enforce the distinction server-side; saving a draft is not approval. Attribute drafting and approval to the appropriate actors/versions and preserve earlier approved definitions.
- D46 autofill starts after authorized approval of a column with its selected study targets; an unauthorized Reviewer's draft save must not dispatch that approval-triggered operation.
- Criteria amendments follow D11 reassessment behavior, and new-column amendments follow D44 rather than silently rerunning the whole project. Clearly distinguish changes to field meaning from cosmetic renaming/reordering.
- Acceptance criteria: Reviewers can prepare but cannot directly approve via API; authorized approval binds the actual reviewed version; stale concurrent drafts cannot silently replace approved definitions; approval-triggered jobs retain the selected scope and permission checks.
- This does not authorize project Managers to change platform prompts, inference credentials or owner-only deletion.

### D87. Human advancement of initial uncertainty; unresolved full-text uncertainty

- Preserve the original uncertain vote and the human advancement action separately. Advancement means seek fuller assessment, not final inclusion or approval of an AI recommendation.
- Apply D12/D36 when two reviewers disagree; a unilateral advancement action must not silently resolve conflicting votes or erase the consensus/adjudication route. Specify permitted advancing roles and stage reconciliation explicitly during implementation.
- A missing abstract alone is not an exclusion under D33. Full-text not-retrieved outcomes remain separate under D34; access failure must not be recorded as a substantive eligibility decision.
- Full-text uncertain records need a visible unresolved queue and additional evidence/clarification or an authorized eventual outcome; they cannot silently enter approved included-study analysis data.
- Acceptance criteria: a human can explicitly advance initial uncertainty with attribution; AI execution does not do so as a final decision; original votes remain available; full-text uncertainty stays visible and is not counted as finally included/excluded.

### D88. Criterion-linked primary full-text exclusion reason

- User decision: record one primary reason linked to approved eligibility criteria, supporting evidence and optional notes for a full-text exclusion.
- Use a versioned criterion/reason identity and actual document/report evidence rather than relying on mutable display labels. Retain protocol version and reviewer authorship with the stage decision.
- AI can suggest a reason but D13 requires a human final decision. D34 not-retrieved outcomes and D87 unresolved uncertainty must not be repurposed as eligibility exclusions merely to complete the reason field.
- Exclusion counts should use the agreed primary reason to avoid double-counting a report across PRISMA categories; notes may describe additional context without changing that primary counting rule.
- Acceptance criteria: a final full-text exclusion has a valid primary criterion-linked reason and evidence basis; edits preserve history; reports/counts reconcile; missing/unavailable full text is represented separately.

### D89. In-page offline edit retention, without full offline mode

- User decision: retain currently unsaved main-review edits in the open page during connection loss, show Offline/Not saved and retry after reconnection; do not promise offline editing/recovery after reload.
- Reuse D7 save indicators/navigation warnings and D8 stale-write conflict handling. Reconnection retries must recheck authentication/authorization and preserve conflicting versions rather than force-overwrite newer remote edits.
- Show Saved only after server confirmation. If a browser reload/tab close discards unacknowledged in-memory edits, do not misrepresent them as recovered from the database.
- Do not build a service worker, persistent browser write queue or localStorage replica of private review data solely for this first-release behavior. Such offline capability would require a separate design decision.
- Acceptance criteria: simulated connection failure preserves typed values in the current page and shows unsaved state; reconnection can persist or surface conflicts correctly; refresh never shows unsaved edits as server-confirmed; successful saves remain retrievable under D6.
- This does not alter D67 session-only tools, or authorize browser caching as the authoritative saved-project store.

### D90. SQLAlchemy and Alembic for PostgreSQL migration

- User decision: centralize PostgreSQL access using SQLAlchemy and manage versioned migrations using Alembic; migrate incrementally behind stable API contracts.
- Inventory and replace incompatible SQLite-specific queries, row assumptions and schema operations across the existing DBBackend, routers, services, worker paths and scripts. Avoid keeping two uncoordinated write models for the same production records.
- Define request/job-scoped sessions, transaction boundaries, pooling and atomic version checks. Do not share a request session with background work after the response ends.
- Alembic revisions must be reviewed and rehearsed on representative preserved data; generated migrations are a starting point, not permission for destructive operations. Follow D28 source backup, integrity validation, cutover and rollback requirements.
- Maintain supported API behavior during incremental changes, with explicit migrations for intentionally changed entities such as D41 repeatable values and D43 report identities. Do not hide a semantic change behind an unchanged response name.
- Acceptance criteria: a fresh PostgreSQL instance can be initialized from migrations; the current supported schema can be upgraded reproducibly; preserved data passes integrity/authorization checks; affected APIs and worker saves use consistent SQLAlchemy transaction semantics.
- SQLAlchemy sync/async mode, supported PostgreSQL versions and local-development database policy remain implementation details to document based on actual runtime needs; no full rewrite is authorized.

### D91. Question-appropriate customizable protocol frameworks

- User decision: offer PICO/PECO, diagnostic-test-specific fields and PCC for scoping as appropriate to the question; let users confirm and customize the framework.
- Store framework identity/version and explicit field semantics rather than forcing all question structures into unlabeled PICO slots. Diagnostic questions should identify the relevant population, index test, reference standard, target condition and other confirmed question dimensions as applicable.
- AI assistance follows D45: enabled by default but only generates suggestions on explicit action; manual entry remains available. Users confirm the framework and the protocol/form approval roles follow D86.
- Feed the approved question structure consistently into search support, screening criteria, extraction forms and relevant analysis guidance. Do not automatically transform a broad question dimension into a strict exclusion rule without protocol approval.
- Acceptance criteria: each supported question type can be created/edited/approved without irrelevant mandatory fields; approved values survive reopening; prompts receive labelled framework context; customized fields retain stable identity and meaning.

### D92. Reviewed database-specific query drafting for external searches

- User decision: draft database-specific queries from the approved protocol, let users review/edit/copy them for external searching and record the exact executed query on import.
- Separate proposed query versions from executed-search history. A copied/generated query is not evidence a search happened or a result count was obtained.
- Match syntax to the actual database interface/platform: field tags, proximity operators, truncation and controlled vocabulary must not be blindly translated between interfaces. Unsupported syntax or uncertain vocabulary needs explicit review rather than invented valid syntax.
- Query generation uses university-only inference under D57 and the approved question framework/criteria. Broader retrieval concepts must not be narrowed automatically by an AI's assumption about the desired result.
- PubMed autofetch remains the confirmed integrated retrieval path under D16. This decision does not approve new automatic external database integrations or OpenAlex fetching.
- Acceptance criteria: users can inspect/edit/copy each supported platform query; generation alone creates no executed-search event; imported batches preserve actual query/date/database under D32, including differences from the draft.

### D93. Identify uploaded PDFs from parsed JSON and match existing sheet records

- User request: use extracted document JSON/metadata to identify a PDF and associate it with the correct study already listed in the extraction/reference sheet.
- Extract candidate DOI/PMID, title, authors, publication year and report type from actual document content/metadata. Normalize identifiers and compare within the authorized project; do not rely on filename alone or invent missing identifiers.
- Match at the report/document level under D43, then show it beneath the correct study. A supplement or secondary publication may belong to a study without being the same report as its primary paper.
- Review the existing batch-upload matching path in routers/studies.py and pdf_service.extract_pdf_metadata rather than add an unrelated duplicate ingestion pipeline. Upgrade document JSON metadata extraction as needed; identify storage/project association safely before making permanent links.
- Do not overwrite the stored study name, merge studies, discard unmatched files or replace existing PDFs merely because a candidate match is returned. Preserve incoming-file identity and processing status until the association is established.
- Acceptance criteria: a PDF with a matching identifier can be routed to its authorized existing report/study; filename-only differences do not create duplicates; ambiguous/conflicting cases remain inspectable; no cross-project records leak through matching.
- Consolidated resolution: D94–D96 resolve exact-identifier automatic attachment, human handling of ambiguity, versions/supplements and unmatched PDFs.

### D94. Exact-identifier PDF attachment with human resolution of ambiguity

- User decision: attach a PDF automatically when an extracted DOI/PMID unambiguously identifies an existing authorized report; require a user choice for title/author matches, conflicting identifiers or multiple candidates.
- Corroborate that the identifier belongs to the uploaded report rather than a cited reference. The first DOI found anywhere in full text must not automatically determine identity.
- If DOI and PMID point to different records or OCR/metadata extraction is uncertain, do not choose one silently. Present candidate records and the extracted identifying evidence for resolution.
- Attach under the report's existing study association without changing the study name, screening outcome or approved values. All matching is project-scoped and must not expose other users' records.
- Auto-attachment is not permission to overwrite an already attached PDF or collapse distinct reports. Handle existing files/versioning and unmatched uploads through separately selected workflows.
- Acceptance criteria: a valid unique report identifier attaches without unnecessary confirmation; references-list identifiers do not misroute uploads; ambiguous/conflicting cases require selection; multiple uploaded files cannot silently replace one another; mapping is attributable and correctable.

### D95. Duplicate-file detection and preserved document versions/supplements

- User decision: skip an identical PDF already attached to the matched report; for different bytes, ask whether it is a new version or supplement, preserving the original and its evidence.
- Use a content digest scoped to authorized records for exact-byte identity. Matching DOI/PMID or filename alone does not establish identical file contents; do not expose cross-project file existence through duplicate messages.
- New versions need distinct immutable document identities/storage paths and derived processing artifacts. Existing extraction/page/highlight references continue to identify the original source version; flag affected outputs for review when a new version is adopted under D52.
- Supplements remain separately identifiable linked documents rather than replacing the primary report. Preserve their own evidence locations and applicability to extracted values.
- No silent destructive replacement of `<project>/<study>.pdf` may remain in a path claiming this behavior. Store association and processing outcomes recoverably across file/database failures.
- Acceptance criteria: identical content does not create duplicate processing/artifacts; a changed file prompts the selected classification; old source bytes and evidence links stay retrievable; supplement citations resolve to the supplement; version adoption does not silently overwrite approved values.

### D96. Human-assisted assignment of unmatched PDF uploads

- User decision: display extracted metadata for an unmatched PDF and let the user create a new report/study or manually select an existing record.
- Make extracted DOI/PMID, title, authors/year and parsing uncertainty inspectable/editable before committing the association. Do not create a new study silently or discard the upload because matching failed.
- Preserve D43 report-versus-study distinctions: a newly identified report may belong to an existing study without duplicating that study. If manual assignment encounters an existing PDF, apply D95 version/supplement handling.
- New uploaded records retain their actual provenance; do not invent a database search, executed query or eligibility decision merely because metadata was extracted from a PDF.
- Association must obey upload/write permissions and remain project-scoped. Until committed, use a recoverable temporary-upload lifecycle and clean up abandoned artifacts without deleting confirmed source files.
- Acceptance criteria: unmatched metadata can be reviewed/corrected, a record can be created or selected, the PDF appears under the chosen report/study, existing evidence is preserved, and cancelling assignment does not create phantom studies or permanent orphan files.

### D97. Launch query-drafting platforms

- User decision: support PubMed, Embase.com, Ovid MEDLINE/Embase, Scopus, Web of Science and Cochrane Library query drafting at launch.
- Treat Embase.com and Ovid Embase as separate syntax targets; distinguish Ovid MEDLINE from Ovid Embase vocabulary. Name the actual supported Cochrane interface/database context rather than assuming one syntax covers every resource.
- Validate field tags, Boolean/proximity rules, truncation and supported controlled vocabulary against current platform guidance and representative queries before claiming platform compatibility.
- Generated queries remain editable proposals under D92. Do not claim an external query executed or its controlled terms were verified if the app has not performed that validation.
- PubMed is the confirmed integrated autofetch source; this catalogue does not approve automated retrieval from the external platforms. Other database names may still be retained as import labels under D32.
- Acceptance criteria: users can choose each named target, receive platform-specific query text, edit/copy it and later preserve the actual executed query; outputs do not silently reuse unsupported syntax across platforms.

### D98. Preserve but disable OpenAlex autofetch at launch

- User decision: retain OpenAlex integration code but hide/disable its autofetch in the first-release workflow; PubMed is the only active integrated autofetch source.
- Apply the launch configuration at backend dispatch as well as navigation controls so an exposed legacy endpoint cannot still initiate disabled fetching. Do not delete OpenAlex code merely to implement a launch flag.
- Preserve any existing OpenAlex-origin references, provenance and history. Disabling new fetches must not remove valid saved project data or prevent appropriately labelled reference-file imports.
- Query drafting for external platforms remains governed by D92/D97. Their presence is not permission for additional integrated retrieval.
- Acceptance criteria: launch users cannot start OpenAlex autofetch through UI or direct API; PubMed still operates; existing OpenAlex-labelled records remain usable; intentional future re-enablement requires documented configuration/validation.

### D99. Automatic open-access PDF retrieval after resolved initial inclusion

- User decision: automatically fetch available open-access PDFs for records included after combined title/abstract screening.
- Scope is narrowed by D102 to PubMed-sourced records only; other database records are not eligible for this feature.
- Trigger on the resolved human initial-stage Include outcome under the configured one/two-reviewer workflow, not on an AI recommendation or one conflicting vote. Initial inclusion advances to full-text assessment; retrieving a document does not finalize full-text eligibility.
- Enqueue retrieval through the durable main-project job system. Use approved open-access locations and metadata sources; do not bypass publisher authentication/paywalls or treat an arbitrary landing page as a valid PDF.
- Retain actual retrieval URL/provider, timestamp, access/source metadata and verification of the fetched report identity. Apply D93–D96 identification, versioning and ambiguous-match handling; do not silently attach a cited paper, wrong report or replacement document.
- Save verified original bytes to D29 persistent document storage and record association in PostgreSQL. Continue OCR/layout processing as needed, with stage/source status shown accurately. Avoid redundant downloads when a suitable document is already attached.
- Retrieval failure/unavailability leaves the report visibly awaiting retrieval under D34, with retry/manual-upload options; it is not an eligibility exclusion or permission to invent full-text findings. Do not trigger another screening finalization through the old upload pipeline.
- D98 still disables OpenAlex study autofetch. Any proposed use of OpenAlex or another provider solely to locate an open-access document requires an explicit source choice rather than silently enabling the disabled study-search integration.
- Acceptance criteria: a resolved initial Include queues a real OA retrieval; unresolved/AI-only recommendations do not; valid matched PDFs persist and can be reviewed; failures remain actionable; downloading alone does not change the final full-text decision or approved extraction values.
- Consolidated resolution: D101–D104 resolve approved discovery sources, PubMed-only provenance, mixed-source deduplication and explicit advancement of uncertainty.

### D100. Launch appraisal coverage for trials, observational/intervention and diagnostic studies

- User decision: validate launch appraisal instruments for randomized trials, non-randomized intervention/observational studies and diagnostic-accuracy studies.
- Select authoritative supported instruments/versions by actual question/design and assessment scope under D49; do not use a single generic instrument for all non-randomized or observational questions.
- Verify domains, signaling questions, permitted answers/judgments, algorithms and applicable licensing/use requirements before implementing the catalogue. Do not infer an instrument's current version or methodological compliance from existing code labels.
- Appraisal of systematic reviews and qualitative studies is outside the selected initial validated catalogue; preserve related code where present without advertising unvalidated instrument support.
- Acceptance criteria: representative cases from each selected group can receive a suitable human-confirmed instrument/version and D50-reviewed assessment; unsupported/ambiguous designs are clearly identified rather than misclassified to fill a required tool field.

### D101. Approved open-access PDF discovery sources

- User decision: locate open-access PDFs using PubMed Central/Europe PMC, Unpaywall and publisher/repository URLs explicitly identified as open access.
- D102 restricts the eligible records to PubMed-sourced records. These are permitted PDF discovery locations, not additional database populations eligible for fetching.
- Apply D99's resolved initial-inclusion trigger and D93–D96 report identity checks. Verify response type and matched source identity rather than treating any successful URL response as the correct PDF.
- Preserve discovery/retrieval provenance and available access/licence metadata without claiming rights not established by the source. Use legitimate available routes; no paywall bypass or assumed publisher entitlement.
- Configure source-specific requirements, identification/contact information, rate limits and retries using official guidance. Do not request secret values in chat or fabricate contact/credential settings.
- Unpaywall is a DOI-based discovery option where applicable; missing DOI, unavailable locations, broken URLs and inaccessible files need honest fallback to the other selected sources or manual retrieval, not fabricated availability.
- OpenAlex was not selected for PDF discovery and remains disabled for study autofetch under D98. Adding it later requires a separate choice.
- Acceptance criteria: each enabled discovery route can return a valid source-matched document or a meaningful unavailable/error outcome; fetched files and provenance persist privately; failures do not exclude reports or finalize full-text screening.

### D102. PDF autofetch restricted to PubMed-sourced records

- Latest user decision: automatic open-access PDF fetching is available only for PubMed-sourced records; do not enable it for other database records.
- Refines D99/D101: approved PDF discovery locations may be used only for the eligible PubMed record population. Discovery-provider availability does not expand the feature to other database populations.
- Use actual acquisition/import provenance, not mere presence of a DOI or PMID, to determine eligibility. Define handling of a grouped report with both PubMed and other-database occurrences explicitly before implementation.
- Enforce eligibility in backend dispatch and retries as well as the UI; no generic batch job may silently fetch PDFs for non-PubMed records.
- Non-PubMed records still support manual PDF upload and source matching under D93–D96. Do not introduce a non-PubMed Fetch PDF action unless separately requested.
- Acceptance criteria: a qualifying PubMed record with the required human screening outcome can enqueue retrieval; an otherwise identical non-PubMed-only record cannot, even if it contains a PMID/DOI; existing uploads/evidence and manual upload continue to work.
- Consolidated resolution: D103 allows retrieval after explicit human advancement of uncertain PubMed records; D104 allows genuine PubMed occurrences in mixed-source groups.

### D103. PubMed PDF retrieval after explicit advancement of uncertainty

- User decision: fetch open-access full text after a human explicitly advances an uncertain title/abstract record to full-text review; retain the original uncertain vote.
- This is scoped to PubMed-eligible records under D102/D104, not every uncertain record. Do not automatically fetch merely because an AI or human recorded Uncertain without the explicit advancement action.
- Preserve D87 stage/conflict rules: fetching obtains evidence for assessment and must not resolve an unresolved two-reviewer disagreement or finalize eligibility on its own.
- Acceptance criteria: eligible explicit advancement enqueues one attributable retrieval operation; the initial vote remains uncertain in history; non-PubMed records and unadvanced uncertainty do not trigger fetching; failure remains awaiting retrieval under D34.

### D104. Genuine PubMed provenance survives cross-database deduplication

- User decision: a grouped report qualifies for PubMed PDF autofetch if it has a genuine PubMed source occurrence, even when another database also contributed the same report. Preserve all source labels.
- Store source occurrences under D31/D32 and derive eligibility from them rather than a single overwritten source string or an identifier found in arbitrary imported data.
- Do not require exclusively PubMed provenance or drop other sources to enable fetching. A non-PubMed-only report containing a PMID does not acquire PubMed provenance merely from that identifier.
- Acceptance criteria: a verified PubMed occurrence plus another-source occurrence remains eligible under D99/D103; other-source-only reports remain ineligible; reporting and exports retain all contributing source/batch links.

### D105. Owner/Manager screening assignment and tracked reassignment

- User decision: owners/Managers assign or balance screening batches; two-reviewer mode assigns two named reviewers per study and records reassignment.
- Track assignment by study/report screening unit and stage; two independent slots must belong to distinct eligible humans. Do not count AI suggestions or two sessions of one account as two reviewers.
- Preserve earlier votes and assignment changes with attribution rather than silently transferring authorship. If reassignment follows a submitted vote or AI disclosure, define how independence/review status is retained without presenting a replacement vote as the original person's work.
- Reviewers see their assigned work and relevant progress without leaking concealed votes. Owner/Manager assignment tools must obey project membership and role permissions.
- Acceptance criteria: authorized batch assignment produces the required named reviewer slots, balancing avoids duplicate slots, reassignment retains history, and final stage progress uses valid human decisions rather than assignment counts alone.

### D106. Self-service activation after email verification

- User decision: after public registration, users can create projects/save review data once their email is verified; no manual platform-operator approval step.
- Before verification, support appropriate account verification/resend/recovery actions, but do not grant project creation through a direct API bypass. Invitation acceptance remains bound to the verified invited email under D4.
- Do not insert an administrator approval queue or institution-membership restriction into public signup unless the user separately changes that policy. Institutional permission to host the public service remains an infrastructure prerequisite, not a per-user manual approval workflow.
- Acceptance criteria: an unverified user cannot create/save a new project; completing valid verification enables self-service project creation; expired/reused verification tokens fail appropriately; no operator action is required for normal activation.

### D107. Reject disposable/temporary email accounts

- User decision: users must not proceed using temporary/disposable email addresses.
- Enforce a disposable-domain check server-side at registration and email changes, alongside D106 verification before project access. Completing verification through a known disposable provider must not bypass this eligibility rule.
- Use a maintained, versioned domain policy with normalized/case-insensitive matching; identify appropriate provider subdomains without blanket-rejecting unrelated legitimate domains. Domain age, uncommon suffixes or lack of a university domain alone do not prove disposability.
- Normal personal and institutional email services remain eligible under public signup. This is not an institutional-email-only requirement; do not block all free providers, aliases or plus-addressing merely because of this decision.
- Explain rejection clearly so users can register with a permanent email address. Provide an operator correction process for incorrectly listed domains without adding manual approval for all normal registrations.
- Do not send account/document content to a third-party email-risk API without a separate reviewed data-flow decision; a locally maintained list can be evaluated first. Select the list/dependency/update strategy during implementation.
- Acceptance criteria: representative listed disposable domains are rejected via UI and direct API; legitimate personal/institutional addresses can verify normally; email changes cannot bypass the rule; list updates and false-positive corrections are testable.
- No detection method guarantees identification of every disposable mailbox. Do not claim complete prevention or automatically delete pre-existing users/data when the policy changes without a separately specified migration process.

### D108. Unique account emails with explicit alias-normalization policy

- User requirement: prevent repeated account creation using the same email and detect dotted variants representing the same mailbox. Preserve the user's example as a requirement to resolve through an explicit normalization policy.
- Email local-part dot semantics are provider-specific: consumer Gmail treats dots as aliases, while other domains can assign dotted and undotted local parts to distinct mailboxes. Do not silently assume every domain shares Gmail behavior or merge existing accounts from string similarity.
- Store the entered/verified delivery address separately from a canonical uniqueness key; enforce uniqueness atomically in PostgreSQL for registration and email changes, including concurrent requests. Document pending/unverified account expiry/resend behavior so uniqueness does not become an indefinite account lockout.
- Define domain normalization and supported provider alias handling explicitly before implementation. Plus tags, googlemail aliases and other provider-specific variants must not be handled through undocumented global rewrites.
- Preserve verification and invitation email identity semantics; duplicate-account prevention must not allow someone with an unverified similar address to claim another user's membership or recover their account.
- Acceptance criteria: exact repeat registration is rejected; chosen provider-normalized duplicate variants are rejected under a tested policy; simultaneous requests cannot create duplicate canonical accounts; existing records are not automatically merged/deleted from heuristic matches.
- Open question: provider-aware normalization versus a deliberately stricter application-wide dot-insensitive signup policy. If a strict cross-provider rule is selected, disclose that it can block genuinely distinct addresses and handle existing collisions without merging identities.
- Consolidated resolution: D111 resolves provider-aware normalization; universal removal of dots across all providers was not selected.

### D109. Preserve and validate the existing reference-format catalogue

- User decision: support/test RIS, BibTeX, CSV with column mapping, PubMed/NBIB, EndNote tagged/XML, PubMed XML and Web of Science CIW.
- Reuse and validate the existing parser paths rather than silently narrowing supported formats during refactoring. Distinguish declared file extension from detected format and show preview/mapping/parse errors clearly.
- Preserve original source/batch provenance under D32, including malformed-record outcomes. Format support does not waive required source metadata or authorize fabricated fields.
- Acceptance criteria: representative valid/malformed files for each format exercise the actual import path; CSV mapping works; Unicode and missing fields are handled; counts/provenance reconcile through deduplication; failed records do not silently become successful imports.

### D110. Permanent personal and institutional emails remain eligible

- User decision: permanent personal and institutional email addresses, including Gmail/Outlook, are allowed; there is no university-only registration restriction.
- Apply D107 disposable-email blocking and D106 verification while preserving this provider eligibility. A free consumer mailbox is not grounds for rejection by itself.
- Acceptance criteria: supported legitimate personal and institutional addresses can register and verify, while known disposable addresses are denied; no hidden institutional-domain requirement is introduced.

### D111. Provider-aware canonical email uniqueness

- User decision: use documented provider-specific dot/alias equivalence; otherwise enforce uniqueness of the verified address without treating meaningful dots as interchangeable.
- Resolves D108's open normalization choice. For consumer Gmail, handle documented dot/alias rules; do not automatically extend them to Outlook, custom domains or Google Workspace domains without verified equivalent behavior.
- Define and version the supported canonicalization rules with tests. Keep the original delivery address for verification/contact and a separate canonical key protected by a database uniqueness constraint for signup/email changes.
- Alias similarity must never merge existing users, transfer project ownership, authorize password reset or accept an invitation without verified identity. Collision handling during migration needs an explicit non-destructive resolution path.
- Acceptance criteria: documented equivalent aliases cannot register separate accounts; provider-distinct addresses remain eligible; concurrent signup uniqueness holds; verification, recovery and invitation acceptance remain bound to the correct user.

### D112. Approved protocol readiness before screening

- User decision: before screening, the protocol covers the question/framework, eligibility criteria, search plan, reviewer/conflict process, extraction plan and intended synthesis/appraisal approach; allow not applicable where appropriate. Registration identifiers are optional.
- Apply owner/Manager approval under D86. Validate the presence/meaning of applicable sections without requiring AI generation, external registration or a meta-analysis decision in favor of pooling.
- An intended extraction/synthesis plan is not a requirement to finalize every extraction column or run analysis before screening. Respect optional appraisal/GRADE/scoping requirements and explicit later pooling choice under D56.
- Preparatory searches/imports may be stored separately from screening readiness; do not assume this decision forbids importing records before approval.
- Acceptance criteria: manual or AI-assisted protocols can reach approved readiness with the selected applicable sections; screening cannot start against an unapproved/incomplete required protocol; legitimate not-applicable choices do not create needless blocking; optional registration does not become mandatory.

### D113. Working public standalone tools without account requirement

- User decision: Claimscape, Citation Telephone and Rigor Scan must be usable by everyone, including public guests without signing in. They must work; retaining navigation or adding an experimental label alone does not meet the requirement.
- Refines D66/D67: implement the selected methodologies and verify real frontend-to-backend/inference flows, source evidence, error states and downloads. Clearly disclose validated coverage and limitations without presenting unavailable functions or examples as successful live results.
- Preserve session-only inputs/results and explicit-download behavior under D67/D68. Public guest access must not create permanent saved runs or require a project/account to use these standalone workflows.
- Apply D57 university-only inference and D38 shadow-only Jev/Laya behavior consistently. A functioning user-facing model baseline must be implemented/evaluated or availability shown honestly; do not silently activate Laya beyond the approved role to fill missing backend functionality.
- Protect shared compute with proportionate guest request/batch/concurrency limits and temporary session isolation. Exact limits are implementation proposals to validate, not grounds for forcing account signup or unrelated approval flows.
- Acceptance criteria: a clean signed-out browser can execute each selected standalone workflow and download a real result from a working approved processing path; refresh clears state; private project access remains denied; unsupported/unavailable evidence is explicit; one visitor cannot retrieve another's temporary artifacts.
- Review university authorization and capacity for public guest compute as an external deployment prerequisite, without inventing a per-guest manual approval requirement.

## Two unanswered product choices

These questions were offered but not answered. Do not treat the recommended options as confirmed decisions:

1. **Final report approval:** owner/Manager only, any Reviewer+ member, or owner only? D53 requires human section approval, but does not select that role. Drafting/export permissions and pooling approval do not answer this question.
2. **Manager appointment and ownership transfer:** who may appoint another Manager and who may transfer ownership? D3 grants Manager membership-management capability, but these elevated actions were explicitly left unresolved. Owner-only project deletion is already confirmed.

No further preference interview is required to hand this plan to a coding agent. Implement independently authorized work and resolve these two permissions before enabling the affected actions; do not silently invent an answer.

## External prerequisites and technical investigation tasks

- Confirm university approval/support for a continuously running public web/API service and public guest tool usage, domain/tunnel arrangement, PostgreSQL, filesystem permissions, SMTP/email, monitoring and operator responsibilities.
- Inventory current data paths/filesystem semantics, quotas, purge/retention and backups; verify DB/file access from the new host and HPC. Do not run PostgreSQL or assume SQLite WAL safety on an unsupported shared filesystem.
- Verify model endpoint ownership, protocol, approved networking, credentials, actual models/context limits, structured-output support and dynamic job lifecycle. No external AI fallback.
- Propose queue/worker technology, API/worker topology and fair admission/concurrency limits based on measured capacity and university capabilities. Queue resumption is selected; unrestricted automatic scheduler submission is not.
- Verify authoritative appraisal/checklist versions and statistical methods. Define supported languages, OCR technology/quality thresholds, file/page limits, trace bounds and exact export/report formats using evidence and tests.
- Inventory the user's verified evaluation set securely; propose task-specific thresholds, held-out coverage and reproducible release reports. Do not claim a measured accuracy from this plan.
- Specify backup mechanism/retention and rehearse the selected one-hour/eight-hour recovery targets across PostgreSQL, documents and configuration. Define operator alerting and recovery authority.
- Define migration details, alias collisions, pending-account expiry, document checksum/version management, temporary artifact cleanup and field/source change invalidation without destructive assumptions.
- Specify measurable latency/error/load criteria for the selected user/project envelope; 100 active people is not the same as 100 simultaneous inference requests.
- Document defaults as proposals, distinguish necessary technical validation from new product restrictions, and obtain a separate decision only for material scope/cost/permission changes.

## End-to-end acceptance checklist

- A permanent non-disposable email can verify/register; canonical duplicate emails cannot create competing accounts; invitation and recovery identities remain correct.
- A user saves a complete private project, signs in on another device and retrieves its records/PDFs; an unrelated user and a revoked member cannot retrieve them.
- API/web access survives HPC/model job termination; queued AI work resumes accurately, cancels safely and never routes externally.
- Import/dedup preserves sources; only PubMed-eligible resolved inclusion/explicit advancement triggers OA fetching; wrong/duplicate/supplement PDFs are handled correctly.
- Independent human screening/AI disclosure gates hold across API, graph, export and notification paths; adjudication history remains intact.
- Approved columns autofill only selected studies as proposals; pulse/status reflect actual work; direct/calc evidence is inspectable; human values cannot be overwritten by a rerun.
- Source/criterion/data changes preserve history and mark affected analyses/reports outdated; pooling never runs without explicit authorized action.
- Validated statistical reference cases and instrument fixtures pass; no unsupported scores, citations or fabricated final approvals appear in exports.
- Each public standalone tool works signed out, returns real evidence-based results, permits explicit download and clears on refresh without saved history or cross-session leakage.
- Backup restoration is rehearsed and measured; chosen load targets are tested with representative data. Report unverified prerequisites and failed checks plainly.

## Code-inspection evidence and baseline limitations

The following observations describe the inspected checkout. They are not proof of current HPC configuration, exhaustive security review or successful production behavior. Selected target decisions above override historical exploratory directions.

### Verified current state

- Application: React/Vite frontend and FastAPI backend, SQLite/local file defaults.
- Backend already contains registration, login, refresh sessions, project membership, studies, extractions, screening decisions, audit tables, and PDF document records. Their presence is not proof of complete authorization or production readiness.
- Local onboarding verified a production frontend build, frontend/API health proxy, and 33 selected backend tests.
- Frontend baseline: 74 passed, 8 failed, plus two unhandled scrollIntoView errors. Existing failures must be diagnosed rather than hidden.
- Local startup success does not prove deployment, durable storage across replacement machines, backup recovery, or cross-user isolation.

### Inspection findings to verify during design

- services/llm_extractor.py: extraction evidence rules need reconciliation with inferred/calculated values and required confidence fields.
- Screening instructions need a consistent uncertainty and human-escalation policy.
- services/rct_rob_engine.py: validate instrument domains and judgment labels against the actual supported risk-of-bias tools before editing prompts.
- services/coded_extraction_service.py: align missing-value codes and evidence requirements with the main extractor.
- services/antigravity_agent.py and services/tool_calling_client.py: align agent/tool contracts, schemas, validation, retry and escalation behavior.

### PDF, screening and Jev/Laya implementation review

Code inspection in the supplied checkout; actual HPC configuration, document results and model deployment have not been inspected. These findings are implementation evidence, not new user decisions.

### Current PDF path

- routers/studies.py upload_pdf saves bytes through the upload storage backend under `<project_id>/<study_id>.pdf`, stores the key on the study and marks it uploaded. Replacing a PDF uses the same key; immutable document versioning/checksums are not established by this path.
- auto_process defaults to false, but the response still reports queued processing and describes screening/extraction as running. Correct the response to reflect whether a job was actually queued and track upload, processing and AI job states separately.
- pdf_service.process_pdf resolves the saved file and prefers Docling conversion with a fallback processor. Persisted output includes full text, pages, annotations, tables, processor metadata and timestamps in pdf_documents. It deletes previous processed records for the study before saving a replacement; evidence links need version-aware protection before reprocessing.
- Docling availability, OCR configuration and quality on scanned/table-heavy papers require runtime validation. Successful fallback parsing does not establish equivalent layout/OCR quality. Keep the original PDF and make actual processor/quality/failure state visible.
- Upload authorization currently uses the permissive project helper without an editing min_role; fix both authentication and write-role enforcement. Coordinate filesystem writes and database metadata with recoverable failure behavior; do not leave silent partial saves or expose filesystem paths unnecessarily.

### Current screening and extraction path

- pipeline_service.run_pdf_screening_pipeline converts the document, calls full-text screening, directly writes included/excluded study status, and can trigger extraction and RoB prefilling after AI inclusion. This conflicts with D13 human-final screening and must be changed, not preserved as a convenient automation.
- The same pipeline can use abstract text when processed full text is absent; do not label abstract-only evidence as a completed full-text assessment.
- auto_extract_service.auto_extract primarily uses LLM extraction, then additional search/recheck/gap-rule passes, optionally calls Laya tracing, and persists extraction values. Existing values are updated in place in the inspected save loop; add proposal/version boundaries so reruns cannot overwrite accepted human data.
- Existing missing codes (-99/-77/-88), page defaults, inferred results and evidence tags must be reconciled with D37. Do not claim a supplement was checked merely because a generic missing-value message lists it.

### What Jev/Laya actually does

- services/jev_client.py supports local Laya ONNX inference and a remote TypeSafe-compatible Jev API. The configured provider and availability determine which is used; these are different deployment/data-egress paths.
- config.py defaults Jev mode to off and provider to laya. jev_screener.jev_gate supports off (LLM baseline), shadow (LLM result returned with comparison logging) and on (Jev result may replace the baseline, falling back when unavailable). Do not infer actual HPC mode from repository defaults.
- Local inference loads laya/laya_engine.py and a model directory containing the required ONNX/config/tokenizer artifacts. This checkout has tokenizer/config files under laya/onnx, but no laya/models directory or visible model weights in the inspected directory listing. A working local model has not been established.
- The local engine truncates state tokens to the remaining configured sequence budget after question/options. Whole-paper inputs therefore need deliberate evidence selection/chunking and coverage accounting; a returned score is not proof that the whole PDF was examined.
- laya_extraction_tracer checks candidate text/value relationships and can replace source quote/page or upgrade a tag to DS based on thresholds. This is an auxiliary evidence classifier, not the original value generator, deterministic proof of a quote, or human approval. Calculated values must not be relabelled directly stated solely from a model score.
- Its quick check uses the first 350 characters of an existing quote; positive classification alone does not verify that the quote occurs at the claimed PDF page. Validate source membership/location separately and preserve conflicting/failed checks.
- The inspected auto-extraction save payload does not include laya_verified/laya_confidence even though tracing adds them to working records; trace persistence and UI provenance require explicit design/testing.
- Existing Jev/Laya tests use mocked answers in important paths. They can validate routing/contracts but do not establish local ONNX compatibility, calibrated confidence or clinical screening/extraction accuracy.

### Required validation and still-open choices

- Trace real routes end to end using representative native PDFs, scanned PDFs, tables, unavailable text, supplementary documents and reuploads. Verify original bytes, derived versions, evidence coordinates, permissions and recovery.
- Evaluate Jev/Laya on labelled task-specific fixtures before relying on its scores. Persist engine/model version, coverage, candidate evidence and failure status without exposing another project's data.
- Decide whether Jev/Laya should be shadow-only, active advisory screening, evidence checking, or disabled. Regardless of the choice, D13 human-final screening and D37 evidence rules remain binding.

### Standalone methodology inspection: Claimscape baseline

- routers/claimscape.py currently accepts a claim, optional PubMed query and bounded result count; it does not authenticate evaluate requests in the inspected handlers. Apply appropriate access isolation to temporary runs and authorize any project-source access; D67 no longer requires persisted project-bound run history.
- services/claimscape_fast_pipeline.py fetches PubMed material, classifies study tiers and computes relevance/stance through its own Laya path or heuristics, with local caching. This independent path must also obey D38 shadow-only Laya and D57 university-only inference; fixing the shared screening decorator alone is insufficient.
- Its stance question offers supports/contradicts, which can force an inappropriate binary interpretation of uncertain, mixed or irrelevant findings. Review stance definitions and permitted uncertainty before choosing the output contract.
- ClaimscapePage.tsx initializes with a bundled HRT example and an analyzed-publications message. Explicitly separate example data from the user's actual run so changing a claim cannot present bundled evidence as its evaluation.
- Query construction, result limits and source coverage need transparent run provenance; a capped PubMed sample is not a complete systematic search or proof that a clinical claim is true.

### Standalone methodology inspection: Citation Telephone baseline

- CitationTelephonePage.tsx offers manuscript claim extraction and direct comparison of a citing sentence with a supplied source passage; it also contains example trace displays and methodology text describing a deeper citation-chain process. UI descriptions do not establish that the full chain workflow executes.
- frontend/src/lib/api.ts calls /citation-telephone/audit-text, /evaluate-claim and /upload-manuscript. Matching citation-telephone handlers were not found in the inspected backend router search/application route inventory; the coding agent must verify and implement the actual API contract rather than assume these methods are backed by a working service.
- services/citation_service.py formats references; it is not the Citation Telephone claim-verification implementation. Keep reference formatting distinct from source support assessment.
- Any direct local-Laya evaluation described in the UI must be reconciled with D38 shadow-only launch policy. Real verdicts need an approved university-model/human baseline or explicit unavailable state, not fabricated probabilities or examples used as live output.
- Define source retrieval, chain bounds, missing evidence and claim/source comparison semantics through the following interview before implementation.

### Standalone methodology inspection: Rigor Scan baseline

- RigorScanPage.tsx describes reporting checks across design/statistics/materials/data/claims and example radial visualizations. Its claimed check counts must be tied to an actual supported, versioned specification rather than copied from example data.
- api.scanPdfRigor sends the PDF as multipart form data to /rigor-scan/scan-pdf, while the displayed copy says the file is never uploaded and only text is sent. Fix this factual mismatch based on the chosen implementation; session-only processing is not the same as never uploading bytes.
- The inspected backend route inventory does not establish implementations for the frontend's /rigor-scan/specs, /status, /scan-text or /scan-pdf calls. Verify actual server routes before claiming a working scanner.
- Distinguish reporting completeness, methodological concerns and formal risk-of-bias assessment; they are not interchangeable. The intended scope and checklist sources require user decisions and authoritative validation.
- Apply university-only inference, session-only inputs/results, truthful processing status and source-linked evidence. Existing scrollIntoView test failures need diagnosis as recorded in the baseline.
