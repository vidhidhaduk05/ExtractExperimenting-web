# Skills Documentation Registry

This registry documents the 12 core AI and scientific computing capabilities of the RadExtract/VDExtract platform.

| Skill | Primary Module | Description |
|---|---|---|
| [`variable-extraction`](./variable-extraction/SKILL.md) | `llm_extractor.py` | Extracts structured data from research PDFs |
| [`title-abstract-screening`](./title-abstract-screening/SKILL.md) | `llm_extractor.py` | Fast title and abstract PICO screening |
| [`fulltext-screening`](./fulltext-screening/SKILL.md) | `llm_extractor.py` | Full-text inclusion/exclusion with evidence quotes |
| [`rob-assessment`](./rob-assessment/SKILL.md) | `rob_ai.py` | AI-prefilled Cochrane RoB 2.0 judgments |
| [`variable-generation`](./variable-generation/SKILL.md) | `variable_generator.py` | Auto-generates variables from project PICO |
| [`schema-generation`](./schema-generation/SKILL.md) | `picos_schema_generator.py` | Generates extraction schemas |
| [`publication-charts`](./publication-charts/SKILL.md) | `chart_engine.py` | Publication-quality Forest, Funnel, SROC, PRISMA plots |
| [`statistical-analysis`](./statistical-analysis/SKILL.md) | `stats_engine.py` | Descriptive and inferential statistics |
| [`meta-analysis`](./meta-analysis/SKILL.md) | `meta_analysis.py` | Bivariate diagnostic model and random effects pooling |
| [`manuscript-drafting`](./manuscript-drafting/SKILL.md) | `manuscript_drafter.py` | Automated PRISMA manuscript draft generator |
| [`biomni-intelligence`](./biomni-intelligence/SKILL.md) | `biomni_service.py` | Biomedical ontology and supplementary data resolution |
| [`citation-generation`](./citation-generation/SKILL.md) | `citation_service.py` | Formats citations across 6 academic formats |
