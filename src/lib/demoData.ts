// Preloaded Mock / Demo Data for GitHub Pages static preview
import { Project, Study, PrismaFlow, AIScreeningSummary } from "./api";

export const DEMO_PROJECT: Project = {
  project_id: "proj_pam_current",
  name: "Pure Arterial Malformations (PAM) - Live Dataset",
  description:
    "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes in Pure Arterial Malformations (Interactive Demo Preview)",
  pico_json: JSON.stringify({
    population: "Patients with Pure Arterial Malformations (PAM) of the brain",
    intervention: "PAM diagnosis & management (conservative, endovascular, surgical)",
    comparison: "Single vs multiple territory; aneurysm-associated vs non-associated",
    outcomes: "Angioarchitecture, aneurysm association, atherosclerosis, stroke outcomes, mortality",
    study_design: "Observational studies, case reports, case series",
  }),
  hypothesis:
    "PAMs are non-shunting arterial loop lesions with high aneurysm propensity requiring tailored intervention",
  research_question:
    "What is the angioarchitectural profile, aneurysm association, and stroke outcome of pure arterial malformations?",
  created_at: new Date().toISOString(),
  status: "active",
};

export const DEMO_STUDIES: Study[] = [
  {
    study_id: "study_albina_2024",
    project_id: "proj_pam_current",
    title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
    authors: "Albina-Palmarola et al.",
    publication_year: 2024,
    journal: "World Neurosurgery",
    doi: "10.1016/j.wneu.2024.01.015",
    pmid: "38244910",
    abstract: "Pure arterial malformations (PAM) are rare intracranial non-shunting vascular lesions characterized by dilated, tortuous, and coiled arterial loops. We present a patient with an accessory MCA PAM treated via hybrid clipping and coiling.",
    source: "PubMed",
    study_design: "case_report",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Meets PICO criteria for pure arterial malformation with complete angioarchitectural reporting.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Albina-Palmarola_2024.pdf",
    ai_priority_score: 0.94,
    ai_confidence: 0.96,
    ai_decision: "include",
    ai_reason: "Describes pure arterial malformation of MCA with angioarchitecture and clinical outcomes.",
  },
  {
    study_id: "study_birua_2022",
    project_id: "proj_pam_current",
    title: "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
    authors: "Birua et al.",
    publication_year: 2022,
    journal: "Asian Journal of Neurosurgery",
    doi: "10.1055/s-0042-1750831",
    pmid: "35928812",
    abstract: "Pure arterial malformations (PAMs) are unusual vascular lesions of the brain consisting of coiled arterial loops. We present a rare PCA PAM coexisting with dysplastic internal carotid artery managed conservatively.",
    source: "PubMed",
    study_design: "case_report",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Definite intracranial PAM with long-term radiographic follow-up.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Birua_2022.pdf",
    ai_priority_score: 0.88,
    ai_confidence: 0.92,
    ai_decision: "include",
    ai_reason: "PCA territory PAM confirmed on catheter angiography without arteriovenous shunting.",
  },
  {
    study_id: "study_brinjikji_2018",
    project_id: "proj_pam_current",
    title: "Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History",
    authors: "Brinjikji et al.",
    publication_year: 2018,
    journal: "Journal of NeuroInterventional Surgery",
    doi: "10.1136/neurintsurg-2017-013624",
    pmid: "29437812",
    abstract: "Background: Pure arterial malformations (PAM) are poorly understood arterial anomalies. Methods: Multi-center retrospective cohort and systematic review of 72 patients analyzing natural history, aneurysm frequency, and stroke rates.",
    source: "PubMed",
    study_design: "case_series",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Benchmark multicenter systematic cohort of pure arterial malformations.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Brinjikji_2018.pdf",
    ai_priority_score: 0.98,
    ai_confidence: 0.99,
    ai_decision: "include",
    ai_reason: "Primary multi-center cohort describing angioarchitecture, natural history, and aneurysm prevalence in PAM.",
  },
  {
    study_id: "study_chua_2021",
    project_id: "proj_pam_current",
    title: "Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case",
    authors: "Chua et al.",
    publication_year: 2021,
    journal: "Journal of Neurosurgery: Case Lessons",
    doi: "10.3171/CASE2123",
    pmid: "35928114",
    abstract: "A 59-year-old female presented with severe subarachnoid hemorrhage due to a ruptured PICA pure arterial malformation with an associated flow pseudoaneurysm successfully treated with targeted parent-artery preserving coiling.",
    source: "PubMed",
    study_design: "case_report",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Ruptured PICA pure arterial malformation with emergency intervention.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Chua_2021.pdf",
    ai_priority_score: 0.91,
    ai_confidence: 0.95,
    ai_decision: "include",
    ai_reason: "Ruptured posterior fossa PAM with detailed angiography and endovascular coiling outcomes.",
  },
  {
    study_id: "study_deshmukh_2023",
    project_id: "proj_pam_current",
    title: "Pure Arterial Malformation (PAM): Case Report and Review of Literature",
    authors: "Deshmukh et al.",
    publication_year: 2023,
    journal: "Surgical Neurology International",
    doi: "10.25259/SNI_184_2023",
    pmid: "37213812",
    abstract: "Pure arterial malformations (PAM) are rare congenital entities. We discuss a young adult presenting with seizures found to have an unruptured right MCA PAM, summarizing clinical management protocols.",
    source: "PubMed",
    study_design: "case_report",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Unruptured MCA PAM with seizure presentation and conservative monitoring.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Deshmukh_2023.pdf",
    ai_priority_score: 0.85,
    ai_confidence: 0.90,
    ai_decision: "include",
    ai_reason: "Representative conservative management of MCA PAM.",
  },
  {
    study_id: "study_feliciano_2014",
    project_id: "proj_pam_current",
    title: "Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation",
    authors: "Feliciano et al.",
    publication_year: 2014,
    journal: "Interventional Neuroradiology",
    doi: "10.15274/INR-2014-10023",
    pmid: "24975549",
    abstract: "Color-coded 2D and 3D digital subtraction angiography allows precise hemodynamic evaluation of parenchymal arterial loops in pure arterial malformations, excluding arteriovenous shunts.",
    source: "PubMed",
    study_design: "technical_note",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "High-resolution hemodynamic imaging of pure arterial malformation.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Feliciano_2014.pdf",
    ai_priority_score: 0.89,
    ai_confidence: 0.93,
    ai_decision: "include",
    ai_reason: "Hemodynamic analysis of MCA pure arterial loop without shunting.",
  },
];

export const DEMO_PRISMA: PrismaFlow = {
  project_id: "proj_pam_current",
  identification: {
    database_records: 142,
    registers: 12,
    other_sources: 0,
    total: 154,
  },
  screening: {
    records_screened: 128,
    records_excluded: 98,
    excluded_with_reasons: [
      { reason: "Arteriovenous shunt present (AVM/dAVF)", count: 68 },
      { reason: "Moyamoya or atherosclerotic stenosis", count: 22 },
      { reason: "Non-cerebrovascular entity", count: 8 },
    ],
  },
  eligibility: {
    full_text_assessed: 30,
    full_text_excluded: 24,
    excluded_reasons: [
      { reason: "Incomplete angioarchitectural reporting", count: 14 },
      { reason: "Duplicate patient cohort", count: 10 },
    ],
  },
  included: {
    studies_in_review: 6,
    studies_in_meta_analysis: 6,
  },
  pending: 0,
};

export const DEMO_SCREENING_SUMMARY: AIScreeningSummary = {
  total: 128,
  title_screened: 128,
  abstract_screened: 128,
  fulltext_screened: 30,
  included: 6,
  excluded: 122,
  uncertain: 0,
  awaiting_clarification: 0,
  awaiting_pdf: 0,
};

export const DEMO_REVIEW_MATRIX = {
  variables: [
    { variable_id: "v1_vessel_involved", project_id: "proj_pam_current", name: "Vessel Involved", section: "Clinical", order_index: 0, description: "Vessel involved" },
    { variable_id: "v9_associated_aneurysm", project_id: "proj_pam_current", name: "Associated Aneurysm", section: "Clinical", order_index: 1, description: "Aneurysm" },
    { variable_id: "v18_treatment_type", project_id: "proj_pam_current", name: "Treatment Type", section: "Clinical", order_index: 2, description: "Treatment" }
  ],
  studies: [
  {
    study_id: "study_albina_2024",
    title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
    extractions: [
      { variable_id: "v1_vessel_involved", value: "Accessory MCA", confidence: 0.98 },
      { variable_id: "v9_associated_aneurysm", value: "present", confidence: 0.97 },
      { variable_id: "v18_treatment_type", value: "hybrid", confidence: 0.99 },
    ],
  },
  {
    study_id: "study_birua_2022",
    title: "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
    extractions: [
      { variable_id: "v1_vessel_involved", value: "PCA", confidence: 0.97 },
      { variable_id: "v9_associated_aneurysm", value: "absent", confidence: 0.95 },
      { variable_id: "v18_treatment_type", value: "conservative", confidence: 0.98 },
    ],
  },
  {
    study_id: "study_brinjikji_2018",
    title: "Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History",
    extractions: [
      { variable_id: "v1_vessel_involved", value: "Multiple (MCA, ACA, PCA)", confidence: 0.99 },
      { variable_id: "v9_associated_aneurysm", value: "present", confidence: 0.98 },
      { variable_id: "v18_treatment_type", value: "conservative (82%)", confidence: 0.97 },
    ],
  },
] };


export const DEMO_ANALYSIS_PROFILE = {
  summary: { total_studies: 6, total_variables: 12, total_extractions: 72, completion_pct: 100, numeric_variables: 2, categorical_variables: 10 },
  per_variable: [],
  missing_matrix: [],
  correlation_matrix: { variables: [], values: [] },
  outliers: []
};

export const DEMO_ROB_SUMMARY = {
  project_id: "proj_pam_current",
  tool: "rob2",
  total_assessments: 6,
  judgment_counts: { low: 4, some_concerns: 2, high: 0 },
  assessments: []
};

export const DEMO_GRADE_LIST = [];

export const DEMO_META_ANALYSES = [];

export const DEMO_CRITERIA = {
  project_id: "proj_pam_current",
  inclusion: [{ id: "c1", text: "Pure arterial malformation on DSA/MRI" }],
  exclusion: [{ id: "c2", text: "Arteriovenous shunting (AVM/dAVF)" }]
};

export const DEMO_SEARCH_STRINGS = {
  project_id: "proj_pam_current",
  strings: { pubmed: '("pure arterial malformation" OR "pure artery malformation")', embase: '("pure arterial malformation" OR "pure artery malformation")', cochrane: '("pure arterial malformation" OR "pure artery malformation")' }
};

export const DEMO_REVIEW_PROGRESS = {
  project_id: "proj_pam_current",
  total_studies: 6,
  total_variables: 12,
  total_extractions: 72,
  expected_extractions: 72,
  completion_pct: 100,
  edited_count: 4
};

export const DEMO_CODE_GRAPH_STATS = {
  total_nodes: 20,
  total_links: 25,
  file_types: { ".tsx": 10, ".ts": 10 },
  relations: { "imports": 25 },
  num_communities: 3,
  top_communities: { "1": 10, "2": 5, "3": 5 },
  top_source_files: [{ path: "src/main.tsx", node_count: 5 }]
};

export const DEMO_CODE_GRAPH = {
  nodes: [
    { id: "1", label: "src/main.tsx", community: 1, file_type: ".tsx" },
    { id: "2", label: "src/App.tsx", community: 1, file_type: ".tsx" }
  ],
  links: [
    { source: "1", target: "2", relation: "imports" }
  ],
  node_count: 2,
  link_count: 1
};

export const DEMO_STATS_ANALYSIS = {
  analysis: {
    test_name: "Independent Samples t-test",
    apa_formatted_result: "t(14) = 3.42, p = .004, d = 1.71",
    apa_narrative: "An independent-samples t-test was conducted to compare the intervention effect with the null comparator. There was a significant difference in the scores for the intervention group (M = 14.45, SD = 1.15) and the null comparator group (M = 10.96, SD = 0.78); t(14) = 3.42, p = .004. These results suggest that the intervention significantly increases the measured effect. The effect size (Cohen's d = 1.71) indicates a very large practical significance.",
    assumptions: {
      normality_passed: true,
      equal_variance_passed: true
    },
    effect_size_name: "Cohen's d",
    effect_size: 1.71
  }
};

export const DEMO_DRAFT_MANUSCRIPT = {
  markdown: `## Methods

The systematic review and meta-analysis were conducted in accordance with the PRISMA 2020 guidelines. A comprehensive literature search was performed across PubMed, Embase, and Cochrane databases using pre-defined Boolean strings. Inclusion criteria encompassed observational studies and case reports detailing Pure Arterial Malformations (PAM) of the brain. Two independent reviewers screened titles, abstracts, and full texts. Discrepancies were resolved by a third adjudicator. Data extraction included angioarchitecture, aneurysm association, and stroke outcomes.

## Results

A total of 154 records were identified from databases. After removing duplicates and irrelevant records, 30 full-text articles were assessed for eligibility. Ultimately, 6 studies met the inclusion criteria and were included in the quantitative synthesis. The pooled analysis revealed a significant association with specific angioarchitectural profiles. The overall DerSimonian-Laird random-effects pooled estimate was 1.48 (95% CI: 1.22, 1.79), with moderate heterogeneity (I² = 42.5%, p = 0.156).`
};

export const DEMO_BIBLIOGRAPHY = {
  content: `Albina-Palmarola, et al. (2024). A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery. World Neurosurgery.
Birua, et al. (2022). Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery. Asian Journal of Neurosurgery.
Brinjikji, et al. (2018). Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History. Journal of NeuroInterventional Surgery.
Chua, et al. (2021). Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case. Journal of Neurosurgery: Case Lessons.
Deshmukh, et al. (2023). Pure Arterial Malformation (PAM): Case Report and Review of Literature. Surgical Neurology International.
Feliciano, et al. (2014). Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation. Interventional Neuroradiology.`
};

export const DEMO_PRISMA_MERMAID = {
  mermaid: `graph TD
    A[Records identified from databases: n = 142] --> B[Records screened: n = 128]
    B -->|Records excluded: n = 98| C[Full-text articles assessed for eligibility: n = 30]
    C -->|Full-text articles excluded: n = 24| D[Studies included in review: n = 6]
    D --> E[Studies included in quantitative synthesis: n = 6]`
};

export const DEMO_MULTI_DATABASE_SEARCH = {
  results: DEMO_STUDIES,
  total_found: 10,
  deduplicated_count: 4,
  sources: {
    PubMed: 6,
    OpenAlex: 4
  }
};
