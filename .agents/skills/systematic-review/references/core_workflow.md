# Core Systematic Review Workflow & Protocol Specifications

## 1. PICO / PECO Framework

Every systematic review begins with an unambiguous formulation of eligibility boundaries:
- **P**opulation: Target condition, species, setting, diagnostic criteria.
- **I**ntervention: Modality, dosage, algorithm architecture, procedure.
- **C**omparator: Standard of care, placebo, benchmark baseline, alternative model.
- **O**utcome: Primary metric (e.g. Sensitivity/Specificity, AUC, Overall Survival, Hazard Ratio) and secondary endpoints.

## 2. Inclusion & Exclusion Criteria Matrix

Prospective criteria must be established *before* screening commences:
- **Inclusion Criteria**:
  1. Peer-reviewed original investigation (or explicitly registered clinical preprint).
  2. Study design matches specified target (e.g. RCT, prospective cohort, diagnostic trial).
  3. Meets defined PICO thresholds.
  4. Quantitatively reports target endpoints with variances (SD, SE, or 95% CI).
- **Exclusion Criteria**:
  1. Inappropriate study design (narrative reviews, opinion editorials, case reports with $N < 5$).
  2. Inappropriate population or off-target condition.
  3. Missing primary outcome data where authors did not provide clarification.
  4. Duplicate publication or overlapping cohort reporting.

## 3. PRISMA 2020 Flow Tracking Counts

Every step must record cardinal numbers:
- $N_1$: Records identified from electronic databases (PubMed, arXiv, etc.).
- $N_2$: Records identified from registries and supplementary searches.
- $N_3$: Duplicates removed (recorded by removal criterion: DOI, ID, Title).
- $N_4$: Records screened by Title & Abstract.
- $N_5$: Records excluded during Title & Abstract phase.
- $N_6$: Full-text reports sought for retrieval.
- $N_7$: Full-text reports not retrieved (paywalled, missing).
- $N_8$: Full-text reports assessed for eligibility.
- $N_9$: Full-text reports excluded, **itemized by reason** (Reason A, Reason B, etc.).
- $N_{10}$: Studies included in qualitative synthesis.
- $N_{11}$: Studies included in quantitative meta-analysis.

## 4. Extraction & Risk of Bias Matrix

Standardized table template:

| Study ID | Year | Country | Design | Sample Size ($N$) | Mean Age | Female (%) | Intervention | Comparator | Primary Metric | Effect Size (95% CI) | RoB 2 Overall |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Smith et al. | 2024 | USA | RCT | 120 | 58.4 | 48% | AI CADe | Radiologist Alone | Sensitivity | 0.92 [0.86, 0.96] | Low Risk |
| Chen et al. | 2023 | China | Cohort | 340 | 62.1 | 51% | Deep Learning | Standard Protocol | AUC | 0.89 [0.84, 0.93] | Some Concerns |

## 5. Risk of Bias Appraisal Tools

1. **RoB 2 (Cochrane Risk of Bias for Randomized Trials)**:
   - D1: Randomization process.
   - D2: Deviations from intended interventions.
   - D3: Missing outcome data.
   - D4: Measurement of the outcome.
   - D5: Selection of the reported result.
2. **ROBINS-I (Risk of Bias in Non-randomized Studies of Interventions)**:
   - Evaluates confounding, selection, classification of interventions, deviations, missing data, outcome measurement, and selection of results.
3. **QUADAS-2 (Quality Assessment of Diagnostic Accuracy Studies)**:
   - Evaluates Patient Selection, Index Test, Reference Standard, and Flow and Timing.
