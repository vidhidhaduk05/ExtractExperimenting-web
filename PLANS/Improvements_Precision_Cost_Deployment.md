# VDExtract: Precision, Cost & Deployment Improvement Plan

**Author context:** compiled from a code-level audit of the current pipeline (Sep 2026).
**Scope:** three independent tracks — (1) extraction/screening precision, (2) LLM/infra cost control, (3) deployment architecture. Each item lists current state, the problem, the fix, and rough effort.

---

## 0. Two findings that affect all three tracks

These aren't separate improvements — they change how you should read everything below.

### 0.1 There are two extraction engines, and only the weaker one is wired up
`radextract_core/litextract/` implements a **two-agent + adjudicator** pipeline (Agent A + Agent B extract independently → type-aware reconciliation → a third "referee" agent only on disagreements → audit trail). This is the more rigorous design — dual extraction + arbitration is a well-established way to catch single-model hallucination.

**But no router or service currently imports it.** `grep` across `routers/` and `services/` for `litextract` returns nothing. The live path is `services/auto_extract_service.py`, which does a **single LLM pass** + a cascade of regex/keyword fallbacks (`exhaustive_search.py`, `gap_rules.py`). That cascade is well thought out for *catching what one model missed*, but it never catches what one model *got wrong* — there's no second opinion and no adjudication.

**Fix:** either (a) wire `litextract.pipeline.run()` into `auto_extract_service.auto_extract()` as the primary pass — run Agent A/B as two calls with different temperature or model, reconcile, and only escalate disagreements to a third adjudicator call (this actually *reduces* average cost per field vs. always calling once at high temperature, because agreement cases short-circuit); or (b) if it was abandoned for a reason, delete it — right now it's dead code that looks load-bearing to anyone reading `AGENTS.md`/the graph report, which will keep costing reviewer time.
**Effort:** M (the pipeline code already exists; the work is wiring + prompt adaptation to the current codebook format).

### 0.2 Docling isn't a pinned dependency, so you don't reliably know which parser ran
`radextract_platform/backend/pyproject.toml` has no `docling` entry. `DoclingProcessor._check_available()` silently returns `False` if the import fails, and `get_processor()` silently drops to `FallbackProcessor` (pdfplumber). Pdfplumber does not do layout-aware table reconstruction or figure detection — the bounding-box annotation layer that powers the PDF highlight overlay will be thinner, and multi-column radiology papers (common in this domain) parse worse.

**Fix:** pin `docling` (and its model weights) as a real dependency, and make `process_pdf()` record `processor_engine` prominently in the study status so reviewers can see "this study was parsed with the fallback" and treat its extraction confidence accordingly. Currently `processor_engine` is stored but not surfaced anywhere in the frontend.
**Effort:** S.

---

## 1. Precision — more accurate tools & methods

| # | Area | Current state | Problem | Recommendation | Effort |
|---|------|---------------|---------|-----------------|--------|
| 1.1 | Extraction architecture | Single LLM pass (`extract_variables_with_aide_engine`) + regex cascade | No cross-check on the LLM's answer itself, only on what it left blank | Wire up the dual-agent + adjudicator design (§0.1). Even cheaply: run the same prompt twice at different temperature (0.0 and 0.4) and only escalate to a third call when the two disagree — this is the "self-consistency" technique, cheap and proven to cut hallucination rate | M |
| 1.2 | Quote/provenance validation | LLM returns a `source_text` "verbatim quote" that is trusted as-is | LLMs paraphrase or invent supporting quotes fairly often ("citation hallucination") | Cheap guardrail: after extraction, check `source_text in full_text` (fuzzy match, e.g. `difflib.SequenceMatcher` ratio > 0.85, to allow whitespace/OCR noise). If it fails, downgrade confidence and tag `[UNVERIFIED QUOTE]`. This is pure Python, no extra API cost | S |
| 1.3 | RoB tool selection | Pure keyword match on `study_design` string (`rob_tools.py:374`) | A design string like "retrospective analysis of a prospectively randomized cohort" can hit both the RCT and cohort branches depending on keyword order; free-text study designs are messy | Keep the keyword rule as the fast path (it's free and usually right), but when it's ambiguous (matches >1 category, or `study_design` is empty/very short) fall back to one LLM classification call constrained to the 3 valid tool keys — cheap because it's rare | S |
| 1.4 | Confidence calibration | Confidence values are hardcoded per source (`[DS]`→0.70/0.80, `[CALC]`→0.85–0.90, `[INF]`→0.65, LLM→whatever it self-reports) | Self-reported LLM confidence is known to be poorly calibrated (models say 0.9 whether right or wrong); hardcoded regex confidences were never validated against ground truth | Build a small gold-standard eval set from the papers already in `TEST/` (6 PDFs + `PROTOCOL.docx` looks like exactly this) — manually extract the codebook once, then score the pipeline's precision/recall/field-level accuracy against it. This turns "confidence: 0.85" from a guess into a number you can defend, and gives you a regression test whenever you change prompts | M |
| 1.5 | Screening classifier | `ai_screening_service.py` trains TF-IDF + LogisticRegression on ≥20 decisions | Reasonable low-data baseline, but TF-IDF has no semantic understanding — "arterial malformation" and "AVM" won't share features unless they literally co-occur in training text | If/when the review has enough labeled decisions (50+), swap the TF-IDF vectors for sentence embeddings (e.g. a small local `sentence-transformers` model, no API cost) — same LogisticRegression head, much better generalization on synonyms/abbreviations, which radiology text is full of | M |
| 1.6 | Structured output validation | `ToolCallingClient` validates against a JSON schema (`tool_registry.validate_tool_response`) but repairs failures via text-regex parsing | Reasonable, but every gateway/model swap risks silently breaking the tool-calling contract | Add a small contract test that runs the 3–4 core tool schemas (`screen_fulltext`, `extract_variables`, `prefill_rob_domain`) against the live gateway in CI (or at least in `dev-start`) and fails loudly if the response shape changes | S |
| 1.7 | Gap rules G1–G5 | Regex-only, hand-picked drug names (VKA/DOAC/specific anticoagulants), phrasing patterns | Brittle to any paper that doesn't use these exact phrasings; scoped to one clinical domain (anticoagulation trials), not general to radiology PAM/AVM studies you're actually working with (per `TEST/`) | These are a good pattern — keep them — but they were clearly written for a different systematic review (cardiology anticoagulation) and copy-pasted in. Write domain-specific gap rules for the PAM/neurovascular protocol actually in `TEST/PROTOCOL.docx` (e.g. imaging-modality conflicts, treatment-technique heterogeneity) instead of anticoagulant heterogeneity that will never fire on this corpus | S–M |

---

## 2. Cost control

The single biggest cost/precision lever available to you is that **the entire LLM layer currently runs on `gemini-web2api`** — a self-hosted wrapper that drives Gemini's *consumer web UI* via a synced browser cookie, not Google's billed API. This is why the project currently looks "free," but it's worth being explicit about what that trade-off actually costs you:

- **No SLA, no rate-limit guarantee** — Google can change the web UI, invalidate the session, or rate-limit/flag the scraping pattern at any time, with no notice and no support channel.
- **Single session bottleneck** — one cookie session likely can't be parallelized safely the way a real API key with proper quota can, which caps your real throughput regardless of what the code allows.
- **ToS exposure** — automating the consumer web client is against Gemini's consumer ToS; fine for a personal research project, risky if this becomes a shared/production tool.

**Recommendation: keep it for prototyping, but budget for a real API key path before this goes beyond solo use.** Concretely:

| # | Item | Recommendation | Why it saves cost |
|---|------|-----------------|--------------------|
| 2.1 | Model tiering | Route by task difficulty: screening decisions and single-field lookups → a small/cheap model (Gemini Flash or Claude Haiku tier); RoB domain judgments and adjudication (litextract §0.1) → a stronger model only when the cheap pass disagrees or is low-confidence | Most fields are trivial lookups ("mean age: 54"); paying frontier-model rates for every field extracted from every paper is the single largest avoidable spend once you're on billed APIs |
| 2.2 | Caching | `ToolCallingClient.call_with_tool(..., use_cache=True)` exists but most call sites (`screen_fulltext_with_llm`, `extract_variables_with_aide_engine`) don't pass it | Turn caching on by default for extraction (keyed on `study_id` + prompt hash) so re-running the pipeline after a code fix (very common during development) doesn't re-bill every paper |
| 2.3 | One-shot batching | `extract_variables_with_aide_engine` already batches all codebook variables into a single call — good, keep this pattern | Confirmed already correct; just don't regress it if litextract's dual-agent design (§0.1) is wired in — batch per-agent, not per-field |
| 2.4 | Heavy local models off the request path | Docling (PyTorch-based layout model) and R (`Rscript` subprocess for plots) are both compute-heavy, non-LLM costs that are easy to forget when budgeting "AI cost" | Covered under deployment (§3) — these should not run inside a billed-per-invocation serverless function |
| 2.5 | Token-budget guardrails | Prompts already truncate (`study_text[:20000]`, `[:28000]`) — reasonable, but there's no budget enforcement or per-project cost tracking | Add a lightweight per-project running total (tokens or $, logged to a `usage` table) so a review with 200 papers doesn't produce a surprise bill mid-project — cheap to add, `services/metrics.py` already exists in the repo (currently dead code, per the cleanup plan — a good place to hook this) |

---

## 3. Deployment — a better fit than the current AWS serverless plan

`PLANS/VDExtract_Cleanup_AWS_Migration_Plan.md` targets Lambda + API Gateway + DynamoDB + S3, with a container-based (ECR) Lambda specifically because the Antigravity SDK needs it. Two things in the current codebase actively fight that architecture:

- **R subprocess dependency.** `services/r_plot_service.py` hardcodes `RSCRIPT_PATH = "/opt/conda/bin/Rscript"` and shells out to `.R` scripts for forest/funnel/SROC/PRISMA plots. Lambda doesn't ship R; you'd need a custom Lambda layer bundling an R runtime + packages, which is a real maintenance burden and adds meaningful cold-start size.
- **Docling + PyTorch.** If §0.2 is fixed and Docling becomes a real dependency, that's a multi-GB model payload — workable in a container Lambda, but every cold start pays for loading it, and Lambda's 15-minute timeout is a real ceiling for batch PDF conversion of a large corpus.

**Recommendation: split the deployment instead of forcing everything into Lambda.**

```
┌─────────────────────┐     ┌──────────────────────────────┐
│   Frontend (static)  │     │        API (Lambda, zip)      │
│  S3 + CloudFront     │────▶│  auth, CRUD, screening logic  │
└─────────────────────┘     │  (fast, cheap, scales to zero)│
                             └───────────────┬───────────────┘
                                             │ enqueue job
                                             ▼
                             ┌──────────────────────────────┐
                             │  Worker (Fargate task / ECS)  │
                             │  Docling PDF conversion       │
                             │  R plot generation             │
                             │  triggered by SQS, scales 0-N  │
                             └──────────────────────────────┘
```

- **Lightweight API on Lambda (zip, not container)** for everything that's fast and doesn't need heavy native deps — auth, project/study CRUD, screening endpoints. This part genuinely benefits from serverless: bursty, cheap, scales to zero between review sessions.
- **A separate worker for heavy jobs** (Docling conversion, R plotting, and the dual-agent extraction pipeline once wired up) as an ECS Fargate task or a small always-on box, triggered via SQS from the API. Fargate has no 15-minute ceiling, no cold-start-per-request tax for a multi-GB image, and you pay only while a job actually runs. This also directly replaces the R-on-Lambda problem — install R once in a normal container image, no custom layer needed.
- **Keep DynamoDB + S3** as planned — those parts of the AWS migration plan are fine and genuinely serverless-friendly (pay-per-request, no idle cost).
- **The LLM gateway (`gemini-web2api`) should not run inside Lambda at all.** It needs a persistent process holding a browser session/cookie; that's architecturally a bad fit for a function that can be frozen/thawed/duplicated. Run it as a small always-on container (Fargate with `desired_count=1`, or even a $5–6/mo VPS) — and per §2, plan a migration path to a real billed API key so this stops being a single fragile cookie session in the critical path.

**If the goal is "get this working and cheap for a solo/small-team research project" rather than "production SaaS scale," an even simpler option is worth considering before committing to the AWS split above:** a single small container (FastAPI + SQLite + built React static files, all in one Docker image) on a $5–10/mo box (Fly.io, Railway, or a small EC2/Lightsail instance) with R and Docling installed natively. No Lambda cold starts, no ECR builds, no DynamoDB schema to maintain, no API Gateway CORS config — the entire AWS serverless migration is solving problems (burst scale, pay-per-request idle cost) that a solo research tool with a handful of concurrent users doesn't have yet. Revisit serverless if/when this is shared across many reviewers or projects and idle-cost matters.

| Option | Best when | Rough monthly cost (light use) |
|---|---|---|
| Single VPS/container (Fly.io / Railway / Lightsail) | Solo or small-team use, few concurrent projects | ~$5–15 |
| Split Lambda (API) + Fargate (worker) | Multiple teams/orgs, bursty usage, want pay-per-use | ~$10–40 depending on job volume, plus dev time for the split |
| Full serverless incl. container Lambda for everything (current plan) | Only if Antigravity's container requirement can't be avoided and you specifically need Lambda's auto-scaling for the API tier too | Similar $ to above but highest engineering/maintenance cost given the R/Docling packaging problem |

---

## Suggested priority order

1. **§0.1 decide on litextract** (wire up or delete) — biggest precision question, blocks other extraction work from being wasted effort either way.
2. **§1.2 quote verification** — cheap, immediate trust improvement, no cost.
3. **§1.4 build the gold-standard eval set** from `TEST/` — you can't validate any other change here without it.
4. **§3 deployment simplification** — before investing more engineering time finishing the container-Lambda/ECR AWS path, confirm it's actually the right target given current scale.
5. **§2 model tiering + caching** — do this alongside whichever extraction architecture change you land on from #1.
