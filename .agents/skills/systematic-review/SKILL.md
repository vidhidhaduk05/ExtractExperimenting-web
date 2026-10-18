---
name: systematic-review
description: Comprehensive systematic literature review skill incorporating K-Dense-AI methodology and PRISMA 2020 standards. Conducts reproducible multi-database search planning (PubMed, arXiv, bioRxiv/medRxiv, Semantic Scholar), 4-tier deduplication, 3-stage screening with explicit exclusion logging, structured PICO extraction, Risk of Bias (RoB 2/ROBINS-I) appraisal, thematic & meta-analytic synthesis, and programmatic citation verification against Crossref/DOI.
allowed-tools: Read Write Edit Bash run_command
license: MIT
metadata:
  version: "2.0.0"
  framework: PRISMA-2020
  author: "K-Dense-AI / RadExtract"
  last-reviewed: "2026-10-05"
---

# Systematic Literature Review Skill (K-Dense-AI Methodology)

## Overview

Conduct rigorous, reproducible systematic, scoping, and narrative literature reviews adhering to **PRISMA 2020** (Preferred Reporting Items for Systematic Reviews and Meta-Analyses) and **Cochrane Handbook** standards.

This skill equips the agent to:
1. Formulate structured research questions using **PICO / PECO** frameworks.
2. Execute reproducible multi-database searches across PubMed, arXiv, bioRxiv/medRxiv, and Semantic Scholar with recorded queries and date bounds.
3. Apply deterministic 4-stage deduplication (DOI -> PMID/arXiv -> Exact Title -> Fuzzy Author/Year).
4. Conduct 3-stage screening (Title -> Abstract -> Full-text) with reconciled PRISMA flow counts and explicit exclusion reasoning.
5. Extract structured clinical and technical parameters into standardized evidence tables.
6. Assess Risk of Bias (RoB 2 for RCTs, ROBINS-I for observational, QUADAS-2 for diagnostic studies).
7. Synthesize evidence thematically with GRADE confidence levels (High, Moderate, Low, Very Low) and support meta-analysis parameterization.
8. Verify all citations and DOIs against official registries (`doi.org` and Crossref APIs) to eliminate hallucinated sources.

---

## 7-Phase Core Workflow

```
[Phase 1: Scoping & PICO] 
       │
       ▼
[Phase 2: Multi-Database Search & Audit Logging]
       │
       ▼
[Phase 3: Deduplication & Screening (PRISMA Flow)]
       │
       ▼
[Phase 4: Structured Extraction & Risk of Bias (RoB)]
       │
       ▼
[Phase 5: Synthesis & GRADE Assessment]
       │
       ▼
[Phase 6: Programmatic Citation Verification (Crossref/DOI)]
       │
       ▼
[Phase 7: Document Generation & Report Export]
```

### Phase 1: Planning and Protocol Formulation
- **Biomedical/Clinical Reviews**: Define PICO:
  - **P**opulation / Patient problem
  - **I**ntervention / Exposure
  - **C**omparator / Control
  - **O**utcome (primary & secondary endpoints)
- **Technical/AI Reviews**: Define System, Method/Architecture, Baseline Benchmark, and Evaluation Metrics.
- **Protocol Pre-Specification**: Define prospective inclusion and exclusion criteria before running queries.

### Phase 2: Systematic Multi-Database Search
- Query multiple complementary bibliographic databases:
  - **PubMed / MEDLINE**: Use MeSH terms, field tags `[tiab]`, Boolean operators (`AND`, `OR`, `NOT`).
  - **arXiv**: Preprints in physics, mathematics, computer science, quantitative biology.
  - **bioRxiv / medRxiv**: Biomedical preprints and early trial readouts.
  - **Semantic Scholar / Crossref**: Cross-disciplinary citation graphs and open-access corpus.
- **Audit Logging**: Every search must record:
  - Exact query string
  - Database name and interface (Web, E-utilities API, Graph API)
  - Date and time executed
  - Filters applied (date ranges, publication types, language)
  - Raw record count retrieved

### Phase 3: Deduplication & Screening
- **Deduplication Sequence**:
  1. Primary key match on clean DOI (`10.xxxx/...`)
  2. Database unique ID match (PMID, arXiv ID)
  3. Case-insensitive exact title match
  4. Normalized title (alphanumeric only) + First author surname + Publication year
- **PRISMA Flow Reconciliation**:
  - Track: $N_{\text{identified}} \to N_{\text{deduplicated}} \to N_{\text{title/abstract screened}} \to N_{\text{excluded}} \to N_{\text{full-text assessed}} \to N_{\text{included}}$.
  - Record explicit exclusion reasons for every paper rejected at full-text review.

### Phase 4: Data Extraction & Quality Appraisal
- Populate standardized extraction tables:
  `| Study ID | Year | Design | Sample / Cohort | Intervention | Control | Primary Outcome | Effect Size (95% CI) | Limitations |`
- Apply standardized Risk of Bias appraisal:
  - RCTs: Cochrane **RoB 2** (Randomization, Deviations, Missing outcome data, Measurement, Selective reporting).
  - Non-randomized: **ROBINS-I** (Confounding, Selection, Classification, Deviations, Missing data, Measurement, Reporting).
  - Diagnostic accuracy: **QUADAS-2** (Patient selection, Index test, Reference standard, Flow & timing).

### Phase 5: Synthesis & Certainty of Evidence
- Group evidence by thematic findings, direction of effect, and methodological consistency.
- Evaluate certainty of evidence using **GRADE**:
  - High $\to$ Moderate $\to$ Low $\to$ Very Low
  - Rate down for: Risk of Bias, Inconsistency ($I^2 > 50\%$), Indirectness, Imprecision (wide CIs), Publication Bias.
  - Rate up for: Large magnitude of effect, Dose-response gradient, Plausible residual confounding.

### Phase 6: Programmatic Citation Verification
- **Never trust model memory for citations or DOIs**.
- Execute `python scripts/verify_citations.py <manuscript_or_json>` to verify:
  - DOI resolves to an active handle via `https://doi.org/api/handles/`
  - Crossref metadata matches author, title, and year.
  - Preprints are explicitly tagged to prevent mistaking non-peer-reviewed work for established clinical consensus.

### Phase 7: Document Assembly & Export
- Structure final reports with PRISMA 2020 checklist sections:
  1. Title & Structured Abstract
  2. Introduction & Objective (PICO)
  3. Methods (Eligibility, Information Sources, Search Strategy, Selection, Data Collection, RoB)
  4. Results (Study Selection PRISMA Flow, Study Characteristics, Risk of Bias, Synthesis)
  5. Discussion (Limitations of Evidence, Limitations of Review, Conclusions)
  6. Verified References with active DOI hyperlinks

---

## Bundled Utilities

- `scripts/verify_citations.py`: Validates DOI handles and Crossref bibliographic metadata.
- `scripts/search_databases.py`: Formats normalized search outputs, deduplicates records, and outputs Markdown/BibTeX.
- `references/database_strategies.md`: Query syntax guides for PubMed, arXiv, bioRxiv, and Semantic Scholar.
- `references/core_workflow.md`: In-depth step-by-step methodology and extraction templates.
