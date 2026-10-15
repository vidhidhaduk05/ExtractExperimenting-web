// Preloaded Mock / Demo Data for GitHub Pages static preview and zero-latency local preview
import { 
  Project, 
  Study, 
  PrismaFlow, 
  AIScreeningSummary, 
  ScreeningKeyword, 
  AbstractHighlights, 
  ClarificationQuestion, 
  ExclusionReason, 
  MetaAnalysis, 
  GradeAssessment,
  ReviewVariable
} from "./api";

export const DEMO_PROJECT: Project = {
  project_id: "proj_pam_current",
  name: "Pure Arterial Malformations (PAM) - Live Dataset",
  description:
    "A Systematic Review of Angioarchitecture, Aneurysm Association, and Stroke Outcomes in Pure Arterial Malformations (Interactive Demo Preview)",
  pico_json: JSON.stringify({
    population: "Patients with Pure Arterial Malformations (PAM) of the brain",
    index_test: "Catheter DSA, 3D Rotational Angiography, 3T MRA/MRI",
    intervention: "PAM diagnosis & management (conservative, endovascular, surgical)",
    comparator: "Single vs multiple territory PAM; aneurysm-associated vs non-aneurysmal",
    comparison: "Single vs multiple territory PAM; aneurysm-associated vs non-aneurysmal",
    outcome: "Angioarchitecture, aneurysm propensity (38%), stroke outcomes, intervention durability",
    outcomes: "Angioarchitecture, aneurysm propensity (38%), stroke outcomes, intervention durability",
    study_design: "Multicenter cohorts, observational studies, case reports, case series",
  }),
  hypothesis:
    "Pure arterial malformations represent non-shunting developmental vascular anomalies characterized by coiled arterial segments with a ~40% lifetime propensity for flow pseudoaneurysms.",
  research_question:
    "What is the angioarchitectural profile, aneurysm association, and stroke outcome of pure arterial malformations?",
  created_at: "2026-09-01T00:00:00Z",
  status: "active",
};

export let DEMO_STUDIES: Study[] = [
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
    screening_reason: "Conservative observation in MCA pure arterial malformation.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Deshmukh_2023.pdf",
    ai_priority_score: 0.85,
    ai_confidence: 0.89,
    ai_decision: "include",
    ai_reason: "Non-aneurysmal right MCA PAM with longitudinal EEG and angiographic follow-up.",
  },
  {
    study_id: "study_feliciano_2014",
    project_id: "proj_pam_current",
    title: "Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation",
    authors: "Feliciano et al.",
    publication_year: 2014,
    journal: "Interventional Neuroradiology",
    doi: "10.15274/INR-2014-10041",
    pmid: "25363259",
    abstract: "Color-coded DSA facilitates detailed hemodynamic assessment of pure arterial malformations by color-encoding transit times, helping to distinguish them from arteriovenous fistulas.",
    source: "PubMed",
    study_design: "case_report",
    screening_status: "included",
    screening_stage: "fulltext",
    screening_reason: "Advanced quantitative hemodynamic characterization of MCA pure arterial malformation.",
    extraction_status: "complete",
    pdf_status: "parsed",
    pdf_path: "Feliciano_2014.pdf",
    ai_priority_score: 0.89,
    ai_confidence: 0.93,
    ai_decision: "include",
    ai_reason: "Detailed color-coded angiography proving absence of arteriovenous shunting.",
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
      { reason: "Non-cerebral arterial malformation", count: 42 },
      { reason: "Arteriovenous shunting / fistula", count: 36 },
      { reason: "Animal / in-vitro laboratory study", count: 20 },
    ],
  },
  eligibility: {
    full_text_assessed: 30,
    full_text_excluded: 24,
    excluded_reasons: [
      { reason: "Arteriovenous shunting identified (AVM/dAVF)", count: 14 },
      { reason: "Fusiform/dissecting aneurysm without loop", count: 6 },
      { reason: "Review article without original cases", count: 4 },
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
  ta_included: 30,
  ta_excluded: 98,
  ft_included: 6,
  ft_excluded: 24,
  pending: 0,
};

export const DEMO_SCREENING_KEYWORDS: ScreeningKeyword[] = [
  { keyword_id: "kw-1", project_id: "proj_pam_current", keyword: "pure arterial malformation", keyword_type: "include", color: "#10b981", created_at: "2026-09-01T00:00:00Z" },
  { keyword_id: "kw-2", project_id: "proj_pam_current", keyword: "arteriovenous shunt", keyword_type: "exclude", color: "#ef4444", created_at: "2026-09-01T00:00:00Z" },
  { keyword_id: "kw-3", project_id: "proj_pam_current", keyword: "aneurysm", keyword_type: "include", color: "#3b82f6", created_at: "2026-09-01T00:00:00Z" },
  { keyword_id: "kw-4", project_id: "proj_pam_current", keyword: "dural arteriovenous fistula", keyword_type: "exclude", color: "#f97316", created_at: "2026-09-01T00:00:00Z" },
  { keyword_id: "kw-5", project_id: "proj_pam_current", keyword: "DSA catheter angiography", keyword_type: "include", color: "#8b5cf6", created_at: "2026-09-01T00:00:00Z" },
];

export const DEMO_ABSTRACT_HIGHLIGHTS: Record<string, AbstractHighlights> = {
  default: {
    study_id: "study_albina_2024",
    abstract: "Pure arterial malformations (PAM) are rare intracranial non-shunting vascular lesions characterized by dilated, tortuous, and coiled arterial loops. We present a patient with an accessory MCA PAM treated via hybrid clipping and coiling.",
    all_spans: [
      { start: 0, end: 27, text: "Pure arterial malformations", type: "keyword_include", color: "#10b981", confidence: 0.98, label: "Inclusion Keyword" },
      { start: 49, end: 61, text: "non-shunting", type: "keyword_include", color: "#10b981", confidence: 0.99, label: "Diagnostic Feature" },
      { start: 164, end: 181, text: "accessory MCA PAM", type: "pico_population", color: "#3b82f6", confidence: 0.95, label: "PICO: Population" },
      { start: 194, end: 219, text: "hybrid clipping and coiling", type: "pico_intervention", color: "#8b5cf6", confidence: 0.94, label: "PICO: Intervention" }
    ],
    pico_spans: [
      { start: 164, end: 181, text: "accessory MCA PAM", type: "pico_population", color: "#3b82f6", confidence: 0.95, label: "Population" },
      { start: 194, end: 219, text: "hybrid clipping and coiling", type: "pico_intervention", color: "#8b5cf6", confidence: 0.94, label: "Intervention" }
    ],
    keyword_spans: [
      { start: 0, end: 27, text: "Pure arterial malformations", type: "keyword_include", color: "#10b981", confidence: 0.98, label: "Include" },
      { start: 49, end: 61, text: "non-shunting", type: "keyword_include", color: "#10b981", confidence: 0.99, label: "Include" }
    ],
    ai_keyword_spans: []
  }
};

export const DEMO_STUDY_CLARIFICATIONS: ClarificationQuestion[] = [
  {
    question_id: "q_clarify_pending_1",
    study_id: "study_birua_2022",
    study_title: "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
    project_id: "proj_pam_current",
    stage: "abstract",
    question_type: "study_design",
    question_text: "Does the study report an isolated single-case observational report or a prospective comparative cohort?",
    options: [
      { value: "case_report", label: "Single Case Report", description: "Describes single patient angiographic presentation and clinical management" },
      { value: "cohort_study", label: "Observational Cohort", description: "Follows multiple patients consecutively" },
      { value: "unclear", label: "Unclear / Needs Full Text", description: "Abstract text insufficient to establish design" }
    ],
    pico_aspect: "Study Design",
    ai_interim_decision: "include",
    ai_interim_confidence: 0.65,
    ai_interim_reason: "Title indicates single artery presentation, but cohort language used in background.",
    status: "pending",
    created_at: "2026-10-07T08:00:00Z"
  },
  {
    question_id: "q_clarify_pending_2",
    study_id: "study_brinjikji_2018",
    study_title: "Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History",
    project_id: "proj_pam_current",
    stage: "fulltext",
    question_type: "intervention",
    question_text: "Are conservative observation cases reported with distinct follow-up outcomes from coiled cases?",
    options: [
      { value: "stratified_outcomes", label: "Yes - Stratified Outcomes", description: "Outcomes reported separately for treated vs observed cohorts" },
      { value: "pooled_only", label: "No - Pooled Follow-up Only", description: "Aggregate outcomes cannot be decoupled" }
    ],
    pico_aspect: "Intervention",
    ai_interim_decision: "include",
    ai_interim_confidence: 0.68,
    ai_interim_reason: "Both conservative and surgical patients discussed in discussion section.",
    status: "pending",
    created_at: "2026-10-07T08:05:00Z"
  },
  {
    question_id: "q_clarify_1",
    study_id: "study_albina_2024",
    study_title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
    project_id: "proj_pam_current",
    stage: "fulltext",
    question_type: "eligibility",
    question_text: "Does the angiogram unequivocally demonstrate absent venous drainage in the early arterial phase?",
    options: [
      { value: "confirmed_no_shunting", label: "Confirmed Absent (Pure Arterial)", description: "No early draining vein on 4-vessel DSA" },
      { value: "shunting_present", label: "Early Vein Detected (AVM / Fistula)", description: "Shunting present, exclude study" }
    ],
    pico_aspect: "Population",
    ai_interim_decision: "include",
    ai_interim_confidence: 0.94,
    ai_interim_reason: "Report notes absence of capillary nidus or early draining vein.",
    status: "answered",
    answer: "confirmed_no_shunting",
    answer_label: "Confirmed Absent (Pure Arterial)",
    answered_by: "AI Screener Consensus",
    final_decision: "include",
    final_confidence: 0.98,
    final_reason_text: "True non-shunting pure arterial malformation verified.",
    created_at: "2026-09-02T10:00:00Z"
  }
];

export const DEMO_EXCLUSION_REASONS: ExclusionReason[] = [
  { code: "NOT_PAM", label: "Wrong condition (e.g. classical AVM, dAVF, aneurysm without PAM)", is_custom: false },
  { code: "EARLY_VEIN", label: "Early draining vein identified (arteriovenous shunting present)", is_custom: false },
  { code: "ANIMAL_STUDY", label: "Non-human / Animal laboratory study", is_custom: false },
  { code: "REVIEW_EDITORIAL", label: "Narrative review, editorial, or letter without novel case data", is_custom: false },
  { code: "DUPLICATE_COHORT", label: "Duplicate patient cohort or overlapping series", is_custom: false },
];

export const DEMO_VARIABLES: ReviewVariable[] = [
  { variable_id: "v1_vessel_involved", project_id: "proj_pam_current", name: "Vessel Involved", section: "Anatomy", order_index: 0, description: "Arterial vessel/branch harboring the malformation" },
  { variable_id: "v9_associated_aneurysm", project_id: "proj_pam_current", name: "Associated Aneurysm", section: "Angioarchitecture", order_index: 1, description: "Presence of aneurysm along the looping arterial trunk" },
  { variable_id: "v18_treatment_type", project_id: "proj_pam_current", name: "Treatment Type", section: "Management", order_index: 2, description: "Management modality (conservative, endovascular, surgical)" },
  { variable_id: "v4_presentation", project_id: "proj_pam_current", name: "Presentation", section: "Clinical", order_index: 3, description: "Initial symptom (headache, seizure, hemorrhage, incidental)" },
  { variable_id: "v12_age", project_id: "proj_pam_current", name: "Patient Age", section: "Demographics", order_index: 4, description: "Age at diagnosis in years" }
];

export const DEMO_REVIEW_MATRIX = {
  variables: DEMO_VARIABLES,
  studies: [
    {
      study_id: "study_albina_2024",
      title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
      authors: "Albina-Palmarola et al.",
      year: 2024,
      journal: "World Neurosurg",
      values: {
        v1_vessel_involved: { value: "Accessory MCA", confidence: 0.98, is_edited: false, extraction_id: "e1" },
        v9_associated_aneurysm: { value: "Present", confidence: 0.97, is_edited: false, extraction_id: "e2" },
        v18_treatment_type: { value: "Hybrid (Clip + Coil)", confidence: 0.99, is_edited: false, extraction_id: "e3" },
        v4_presentation: { value: "Subarachnoid Hemorrhage", confidence: 0.96, is_edited: false, extraction_id: "e4" },
        v12_age: { value: "48", confidence: 0.99, is_edited: false, extraction_id: "e5" }
      }
    },
    {
      study_id: "study_birua_2022",
      title: "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
      authors: "Birua et al.",
      year: 2022,
      journal: "Asian J Neurosurg",
      values: {
        v1_vessel_involved: { value: "PCA (P2 segment)", confidence: 0.97, is_edited: false, extraction_id: "e6" },
        v9_associated_aneurysm: { value: "Absent", confidence: 0.95, is_edited: false, extraction_id: "e7" },
        v18_treatment_type: { value: "Conservative (Observation)", confidence: 0.98, is_edited: false, extraction_id: "e8" },
        v4_presentation: { value: "Chronic Headache", confidence: 0.94, is_edited: false, extraction_id: "e9" },
        v12_age: { value: "32", confidence: 0.99, is_edited: false, extraction_id: "e10" }
      }
    },
    {
      study_id: "study_brinjikji_2018",
      title: "Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History",
      authors: "Brinjikji et al.",
      year: 2018,
      journal: "J Neurointerv Surg",
      values: {
        v1_vessel_involved: { value: "Multiple (MCA 42%, PCA 31%, ACA 27%)", confidence: 0.99, is_edited: false, extraction_id: "e11" },
        v9_associated_aneurysm: { value: "Present (41%)", confidence: 0.98, is_edited: false, extraction_id: "e12" },
        v18_treatment_type: { value: "Conservative (82%), Endovascular (18%)", confidence: 0.97, is_edited: false, extraction_id: "e13" },
        v4_presentation: { value: "Seizure (38%), Incidental (34%), Hemorrhage (14%)", confidence: 0.98, is_edited: false, extraction_id: "e14" },
        v12_age: { value: "Mean 39.4", confidence: 0.98, is_edited: false, extraction_id: "e15" }
      }
    },
    {
      study_id: "study_chua_2021",
      title: "Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case",
      authors: "Chua et al.",
      year: 2021,
      journal: "J Neurosurg Case Lessons",
      values: {
        v1_vessel_involved: { value: "PICA", confidence: 0.96, is_edited: false, extraction_id: "e16" },
        v9_associated_aneurysm: { value: "Present (Ruptured)", confidence: 0.99, is_edited: false, extraction_id: "e17" },
        v18_treatment_type: { value: "Endovascular Coiling", confidence: 0.98, is_edited: false, extraction_id: "e18" },
        v4_presentation: { value: "Subarachnoid Hemorrhage (WFNS 3)", confidence: 0.97, is_edited: false, extraction_id: "e19" },
        v12_age: { value: "59", confidence: 0.99, is_edited: false, extraction_id: "e20" }
      }
    },
    {
      study_id: "study_deshmukh_2023",
      title: "Pure Arterial Malformation (PAM): Case Report and Review of Literature",
      authors: "Deshmukh et al.",
      year: 2023,
      journal: "Surg Neurol Int",
      values: {
        v1_vessel_involved: { value: "MCA (M1/M2 junction)", confidence: 0.95, is_edited: false, extraction_id: "e21" },
        v9_associated_aneurysm: { value: "Absent", confidence: 0.96, is_edited: false, extraction_id: "e22" },
        v18_treatment_type: { value: "Conservative (Antiepileptic)", confidence: 0.97, is_edited: false, extraction_id: "e23" },
        v4_presentation: { value: "Focal Motor Seizure", confidence: 0.98, is_edited: false, extraction_id: "e24" },
        v12_age: { value: "24", confidence: 0.99, is_edited: false, extraction_id: "e25" }
      }
    },
    {
      study_id: "study_feliciano_2014",
      title: "Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation",
      authors: "Feliciano et al.",
      year: 2014,
      journal: "Interv Neuroradiol",
      values: {
        v1_vessel_involved: { value: "MCA (Bifurcation)", confidence: 0.98, is_edited: false, extraction_id: "e26" },
        v9_associated_aneurysm: { value: "Present (Unruptured)", confidence: 0.94, is_edited: false, extraction_id: "e27" },
        v18_treatment_type: { value: "Conservative", confidence: 0.95, is_edited: false, extraction_id: "e28" },
        v4_presentation: { value: "Transient Ischemic Attack", confidence: 0.93, is_edited: false, extraction_id: "e29" },
        v12_age: { value: "52", confidence: 0.99, is_edited: false, extraction_id: "e30" }
      }
    }
  ]
};

export const DEMO_REVIEW_PROGRESS = {
  project_id: "proj_pam_current",
  total_studies: 6,
  total_variables: 5,
  total_extractions: 30,
  expected_extractions: 30,
  completion_pct: 100,
  edited_count: 0
};

export const DEMO_ROB_SUMMARY = {
  project_id: "proj_pam_current",
  tool: "rob2",
  total_assessments: 6,
  pending_human_review_count: 2,
  assessments_needing_review_count: 2,
  judgment_counts: { low: 4, some_concerns: 2, high: 0, critical: 0, no_information: 0 },
  assessments: [
    {
      assessment_id: "rob_albina_2024",
      study_id: "study_albina_2024",
      study_title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
      tool: "rob2",
      overall_judgment: "low",
      status: "completed",
      ai_prefilled: true,
      needs_human_review_count: 0,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    },
    {
      assessment_id: "rob_birua_2022",
      study_id: "study_birua_2022",
      study_title: "Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery",
      tool: "rob2",
      overall_judgment: "some_concerns",
      status: "completed",
      ai_prefilled: true,
      needs_human_review_count: 1,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "some_concerns", color: "#f59e0b", label: "Some concerns", human_verified: false },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    },
    {
      assessment_id: "rob_brinjikji_2018",
      study_id: "study_brinjikji_2018",
      study_title: "Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History",
      tool: "rob2",
      overall_judgment: "low",
      status: "completed",
      ai_prefilled: true,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    },
    {
      assessment_id: "rob_chua_2021",
      study_id: "study_chua_2021",
      study_title: "Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case",
      tool: "rob2",
      overall_judgment: "low",
      status: "completed",
      ai_prefilled: true,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    },
    {
      assessment_id: "rob_deshmukh_2023",
      study_id: "study_deshmukh_2023",
      study_title: "Pure Arterial Malformation (PAM): Case Report and Review of Literature",
      tool: "rob2",
      overall_judgment: "some_concerns",
      status: "completed",
      ai_prefilled: true,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "some_concerns", color: "#f59e0b", label: "Some concerns", human_verified: true },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    },
    {
      assessment_id: "rob_feliciano_2014",
      study_id: "study_feliciano_2014",
      study_title: "Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation",
      tool: "rob2",
      overall_judgment: "low",
      status: "completed",
      ai_prefilled: true,
      domains: [
        { domain_key: "D1", domain_label: "Bias arising from randomization process", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D2", domain_label: "Bias due to deviations from intended interventions", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D3", domain_label: "Bias due to missing outcome data", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D4", domain_label: "Bias in measurement of the outcome", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true },
        { domain_key: "D5", domain_label: "Bias in selection of the reported result", risk_judgment: "low", color: "#10b981", label: "Low", human_verified: true }
      ],
      updated_at: "2026-09-03T12:00:00Z"
    }
  ]
};

export const DEMO_ANALYSIS_PROFILE = {
  summary: { total_studies: 6, total_variables: 5, total_extractions: 30, completion_pct: 100, numeric_variables: 1, categorical_variables: 4 },
  per_variable: [
    { variable_id: "v1_vessel_involved", name: "Vessel Involved", non_null_count: 6, missing_count: 0, unique_count: 4, top_value: "MCA" },
    { variable_id: "v9_associated_aneurysm", name: "Associated Aneurysm", non_null_count: 6, missing_count: 0, unique_count: 2, top_value: "Present (41%)" },
    { variable_id: "v18_treatment_type", name: "Treatment Type", non_null_count: 6, missing_count: 0, unique_count: 3, top_value: "Conservative" }
  ],
  missing_matrix: [],
  correlation_matrix: { variables: ["v12_age", "v9_associated_aneurysm"], values: [[1.0, 0.42], [0.42, 1.0]] },
  outliers: []
};

export const DEMO_GRADE_LIST: GradeAssessment[] = [
  {
    grade_id: "grade_aneurysm_prevalence",
    project_id: "proj_pam_current",
    outcome_label: "Associated Intracranial Aneurysm Prevalence",
    meta_analysis_id: "meta_aneurysm_propensity",
    starting_level: "high",
    certainty_rating: "moderate",
    certainty_label: "Moderate",
    certainty_color: "#E9ED4C",
    factors: [
      { factor_id: "f1", grade_id: "grade_aneurysm_prevalence", factor_key: "risk_of_bias", factor_name: "Risk of bias", factor_type: "downgrading", rating: "not_serious", rationale: "Validated DSA catheter angiography across all cohorts.", auto_populated: true, auto_data: {}, rating_options: ["not_serious", "serious", "very_serious"], rating_labels: { not_serious: "Not serious", serious: "Serious (-1)", very_serious: "Very serious (-2)" } },
      { factor_id: "f2", grade_id: "grade_aneurysm_prevalence", factor_key: "inconsistency", factor_name: "Inconsistency", factor_type: "downgrading", rating: "not_serious", rationale: "I² is 31.4% with consistent effect direction.", auto_populated: true, auto_data: {}, rating_options: ["not_serious", "serious", "very_serious"], rating_labels: { not_serious: "Not serious", serious: "Serious (-1)", very_serious: "Very serious (-2)" } },
      { factor_id: "f3", grade_id: "grade_aneurysm_prevalence", factor_key: "indirectness", factor_name: "Indirectness", factor_type: "downgrading", rating: "not_serious", rationale: "Direct patient population with pure arterial malformations.", auto_populated: true, auto_data: {}, rating_options: ["not_serious", "serious", "very_serious"], rating_labels: { not_serious: "Not serious", serious: "Serious (-1)", very_serious: "Very serious (-2)" } },
      { factor_id: "f4", grade_id: "grade_aneurysm_prevalence", factor_key: "imprecision", factor_name: "Imprecision", factor_type: "downgrading", rating: "serious", rationale: "Downgraded by 1 level due to rare disease small total sample size (n=80).", auto_populated: true, auto_data: {}, rating_options: ["not_serious", "serious", "very_serious"], rating_labels: { not_serious: "Not serious", serious: "Serious (-1)", very_serious: "Very serious (-2)" } },
      { factor_id: "f5", grade_id: "grade_aneurysm_prevalence", factor_key: "publication_bias", factor_name: "Publication bias", factor_type: "downgrading", rating: "undetected", rationale: "Egger's test non-significant (p=0.412).", auto_populated: true, auto_data: {}, rating_options: ["undetected", "strongly_suspected"], rating_labels: { undetected: "Undetected", strongly_suspected: "Strongly suspected (-1)" } }
    ],
    created_at: "2026-09-04T10:00:00Z"
  }
];

export const DEMO_META_ANALYSES: MetaAnalysis[] = [
  {
    meta_id: "meta_aneurysm_propensity",
    project_id: "proj_pam_current",
    outcome_label: "Associated Intracranial Aneurysm Prevalence",
    analysis_type: "proportion",
    effect_measure: "PR",
    n_studies: 6,
    status: "completed",
    pooled_effect: 0.38,
    pooled_ci_lower: 0.24,
    pooled_ci_upper: 0.54,
    i_squared: 31.4,
    tau_squared: 0.042,
    q_statistic: 7.29,
    q_p_value: 0.200,
    egger_intercept: 0.82,
    egger_p_value: 0.412,
    results_json: {
      model: "DerSimonian-Laird Random Effects",
      subgroup: "All PAM Anatomical Territories",
      heterogeneity: {
        i_squared: 31.4,
        p_value: 0.200,
        tau_squared: 0.042
      }
    },
    studies: [
      { study_id: "study_brinjikji_2018", label: "Brinjikji 2018 (Multicenter)", effect: 0.41, ci_lower: 0.29, ci_upper: 0.54, weight: 34.2, events: 29, total: 72 },
      { study_id: "study_albina_2024", label: "Albina 2024", effect: 0.50, ci_lower: 0.12, ci_upper: 0.88, weight: 11.5, events: 1, total: 2 },
      { study_id: "study_chua_2021", label: "Chua 2021", effect: 1.00, ci_lower: 0.20, ci_upper: 1.00, weight: 8.4, events: 1, total: 1 },
      { study_id: "study_birua_2022", label: "Birua 2022", effect: 0.00, ci_lower: 0.00, ci_upper: 0.80, weight: 8.4, events: 0, total: 1 },
      { study_id: "study_deshmukh_2023", label: "Deshmukh 2023", effect: 0.00, ci_lower: 0.00, ci_upper: 0.80, weight: 8.4, events: 0, total: 1 },
      { study_id: "study_feliciano_2014", label: "Feliciano 2014", effect: 0.33, ci_lower: 0.05, ci_upper: 0.77, weight: 29.1, events: 1, total: 3 }
    ],
    created_at: "2026-09-04T10:00:00Z"
  }
];

export const DEMO_CRITERIA = {
  project_id: "proj_pam_current",
  inclusion: [
    { id: "c1", text: "Pure arterial malformation on catheter DSA or 3T MRA" },
    { id: "c2", text: "Absence of early draining vein or arteriovenous shunting (non-shunting)" },
    { id: "c3", text: "Documented angiographic anatomy or longitudinal clinical management" }
  ],
  exclusion: [
    { id: "c4", text: "True arteriovenous malformation (AVM) with capillary nidus" },
    { id: "c5", text: "Dural arteriovenous fistula (dAVF)" },
    { id: "c6", text: "Solitary saccular or fusiform aneurysm without coiled arterial loop" }
  ]
};

export const DEMO_SEARCH_STRINGS = {
  project_id: "proj_pam_current",
  strings: {
    pubmed: '("pure arterial malformation"[Title/Abstract] OR "pure artery malformation"[Title/Abstract] OR "arterial loop malformation"[Title/Abstract]) AND ("aneurysm" OR "stroke" OR "angioarchitecture" OR "embolization" OR "natural history")',
    embase: "('pure arterial malformation'/exp OR 'pure arterial malformation':ti,ab OR 'pure artery malformation':ti,ab) AND ('aneurysm'/exp OR 'cerebrovascular accident'/exp)",
    cochrane: '("pure arterial malformation" OR "pure artery malformation"):ti,ab,kw'
  }
};

export const DEMO_CODE_GRAPH_STATS = {
  total_nodes: 5345,
  total_links: 9746,
  file_types: { ".tsx": 1420, ".ts": 1820, ".py": 1650, ".json": 455 },
  relations: { "imports": 4200, "calls": 3120, "defines": 2426 },
  num_communities: 311,
  top_communities: { "1": 420, "2": 310, "3": 280, "4": 210 },
  top_source_files: [
    { path: "radextract_platform/backend/main.py", node_count: 48 },
    { path: "radextract_platform/backend/services/biomni_service.py", node_count: 36 },
    { path: "radextract_web_repo/src/lib/api.ts", node_count: 52 }
  ]
};

export const DEMO_CODE_GRAPH = {
  nodes: [
    { id: "1", label: "radextract_platform/backend/main.py", community: 1, file_type: ".py" },
    { id: "2", label: "radextract_platform/backend/services/biomni_service.py", community: 1, file_type: ".py" },
    { id: "3", label: "radextract_platform/backend/routers/settings.py", community: 1, file_type: ".py" },
    { id: "4", label: "radextract_web_repo/src/App.tsx", community: 2, file_type: ".tsx" },
    { id: "5", label: "radextract_web_repo/src/lib/api.ts", community: 2, file_type: ".ts" },
    { id: "6", label: "radextract_web_repo/src/pages/ScreeningPage.tsx", community: 2, file_type: ".tsx" },
    { id: "7", label: "radextract_web_repo/src/pages/MetaAnalysisPage.tsx", community: 2, file_type: ".tsx" },
    { id: "8", label: "radextract_web_repo/src/pages/RobSummaryPage.tsx", community: 2, file_type: ".tsx" }
  ],
  links: [
    { source: "1", target: "2", relation: "calls" },
    { source: "1", target: "3", relation: "registers" },
    { source: "4", target: "5", relation: "imports" },
    { source: "6", target: "5", relation: "calls" },
    { source: "7", target: "5", relation: "calls" },
    { source: "8", target: "5", relation: "calls" }
  ],
  node_count: 8,
  link_count: 6
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

A total of 154 records were identified from databases. After removing duplicates and irrelevant records, 30 full-text articles were assessed for eligibility. Ultimately, 6 studies met the inclusion criteria and were included in the quantitative synthesis. The pooled analysis revealed a significant association with specific angioarchitectural profiles. The overall DerSimonian-Laird random-effects pooled estimate was 0.38 (95% CI: 0.24, 0.54), with moderate heterogeneity (I² = 31.4%, p = 0.200).`
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

// ── Codebook Rules and Operational Definitions ──

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

export const DEMO_CODEBOOK_RULES: Record<string, CodebookRule> = {
  v1_vessel_involved: {
    variable_id: "v1_vessel_involved",
    name: "Vessel Involved",
    section: "Anatomy",
    field_type: "categorical",
    definition: "Primary intracranial arterial trunk or anomalous branch harboring the coiled pure arterial loops.",
    allowed_values: ["Accessory MCA", "MCA (M1/M2)", "PCA (P1/P2)", "ACA (A1/A2)", "PICA", "Basilar Artery", "Multiple Arteries"],
    rules: [
      "Record the highest-order parent trunk from which the coiled arterial loop originates.",
      "If multiple vessels are involved in a cohort, record predominant branches or distribution percentages.",
      "Distinguish accessory MCA (arising from ICA) from duplicated MCA (arising from M1)."
    ],
    gold_standard_example: "Diagnostic catheter angiography revealed an anomalous accessory middle cerebral artery supplying the tortuous looped coil.",
    exclusion_criteria: "Exclude venous channels or dural arteries that do not constitute the primary brain parenchyma feeder."
  },
  v9_associated_aneurysm: {
    variable_id: "v9_associated_aneurysm",
    name: "Associated Aneurysm",
    section: "Angioarchitecture",
    field_type: "categorical",
    definition: "Presence of distinct saccular or flow-related aneurysmal outpouching along the looped trunk or at the loop apex.",
    allowed_values: ["Present", "Absent", "Not Reported"],
    rules: [
      "Must show focal outpouching > 2mm distinct from uniform ectasia or loop tortuosity.",
      "Verify whether the aneurysm is flow-related (on feeding loop) or unrelated remote circle of Willis aneurysm.",
      "Record 'Present' if any confirmed aneurysmal dilation is documented in radiological findings."
    ],
    gold_standard_example: "A 4.2-mm saccular flow-related pseudoaneurysm was identified at the apex of the PICA hairpin turn.",
    exclusion_criteria: "Do not code fusiform ectasia without discrete saccular neck as an associated aneurysm."
  },
  v18_treatment_type: {
    variable_id: "v18_treatment_type",
    name: "Treatment Type",
    section: "Management",
    field_type: "categorical",
    definition: "Primary clinical or neurointerventional strategy deployed for patient management.",
    allowed_values: ["Conservative (Observation)", "Endovascular (Coiling/Stenting)", "Surgical (Clipping/Bypass)", "Hybrid (Clip + Coil)", "Radiosurgery"],
    rules: [
      "Code the definitive intervention performed. If patient underwent watchful waiting with serial imaging, code Conservative.",
      "If aneurysm was selectively treated while preserving parent loop artery, code modality (e.g. Endovascular).",
      "If parent artery was sacrificed or bypassed, note in extraction comments."
    ],
    gold_standard_example: "Due to asymptomatic presentation and intact vessel lumen, the patient was managed with conservative clinical and serial MRA monitoring.",
    exclusion_criteria: "Do not classify diagnostic catheter angiography as an endovascular treatment."
  },
  v4_presentation: {
    variable_id: "v4_presentation",
    name: "Presentation",
    section: "Clinical",
    field_type: "categorical",
    definition: "Initial clinical presentation or symptom triggering the neurological and imaging investigation.",
    allowed_values: ["Subarachnoid Hemorrhage", "Intracerebral Hemorrhage", "Chronic Headache", "Seizure / Epilepsy", "Ischemic Stroke / TIA", "Incidental"],
    rules: [
      "If acute hemorrhagic presentation is documented (verified on CT/LP), prioritize hemorrhage over secondary symptoms like headache.",
      "If discovered during evaluation for unrelated minor trauma or headache, code as Incidental if imaging was non-targeted.",
      "Identify whether hemorrhage arose directly from PAM rupture or associated aneurysm."
    ],
    gold_standard_example: "The patient presented with acute onset thunderclap headache and was found to have Fisher Grade 3 subarachnoid hemorrhage.",
    exclusion_criteria: "Do not code chronic tension headache as hemorrhage unless extravasation is radiographically proven."
  },
  v12_age: {
    variable_id: "v12_age",
    name: "Patient Age",
    section: "Demographics",
    field_type: "numeric",
    definition: "Patient chronological age in years at the time of initial clinical diagnosis.",
    allowed_values: ["Numeric integer (years)"],
    rules: [
      "Extract exact integer age at diagnosis.",
      "In cohort studies, record mean or median age with range if specified (e.g. '44.2 (18-72)').",
      "Verify baseline demographic tables against case text."
    ],
    gold_standard_example: "A 48-year-old woman presented to the emergency department...",
    exclusion_criteria: "Do not extract follow-up age; record presentation age only."
  }
};

// ── Per-Study Docling Data & Extractions ──

export const DEMO_PDF_SUMMARIES: Record<string, any> = {
  study_albina_2024: {
    study_id: "study_albina_2024",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 5,
    tables_count: 2,
    extractions_count: 5,
    highlighted_variables_count: 5
  },
  study_birua_2022: {
    study_id: "study_birua_2022",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 4,
    tables_count: 1,
    extractions_count: 5,
    highlighted_variables_count: 5
  },
  study_brinjikji_2018: {
    study_id: "study_brinjikji_2018",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 8,
    tables_count: 4,
    extractions_count: 5,
    highlighted_variables_count: 5
  },
  study_chua_2021: {
    study_id: "study_chua_2021",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 4,
    tables_count: 1,
    extractions_count: 5,
    highlighted_variables_count: 5
  },
  study_deshmukh_2023: {
    study_id: "study_deshmukh_2023",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 4,
    tables_count: 1,
    extractions_count: 5,
    highlighted_variables_count: 5
  },
  study_feliciano_2014: {
    study_id: "study_feliciano_2014",
    has_pdf: true,
    pdf_status: "processed",
    page_count: 5,
    tables_count: 2,
    extractions_count: 5,
    highlighted_variables_count: 5
  }
};

export const DEMO_PDF_DATA: Record<string, any> = {
  study_albina_2024: {
    study_id: "study_albina_2024",
    pages: 5,
    sections: [
      {
        title: "Title & Abstract",
        page: 1,
        text: "World Neurosurgery (2024). A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery.\n\nAbstract: Pure arterial malformations (PAMs) are rare intracranial non-shunting vascular lesions characterized by dilated, tortuous, and coiled arterial loops. We present a 48-year-old female presenting with acute subarachnoid hemorrhage due to a ruptured accessory MCA PAM with an associated flow pseudoaneurysm. Treatment achieved via combined microvascular clipping of the aneurysm and targeted endovascular coiling."
      },
      {
        title: "Case Description & Demographics",
        page: 2,
        text: "A 48-year-old woman presented with sudden severe headache and vomiting. Non-contrast cranial CT demonstrated diffuse subarachnoid hemorrhage predominantly in the right Sylvian fissure (Fisher grade 3). Catheter digital subtraction angiography (DSA) revealed an anomalous vessel branching from the right internal carotid artery conforming to an accessory MCA. The arterial segment exhibited prominent loops and tortuosity without an early draining vein or capillary nidus."
      },
      {
        title: "Angiographic Findings & Aneurysm Association",
        page: 3,
        text: "Detailed 3D rotational catheter angiography demonstrated a 3.8-mm saccular flow-related pseudoaneurysm located at the apex of the looped accessory middle cerebral artery. The pure arterial malformation loops themselves supplied normal distal right frontoparietal cortex. Preservation of the arterial parent loop was deemed critical to avoid major territorial cerebral infarction."
      },
      {
        title: "Management & Outcome",
        page: 4,
        text: "The patient underwent a hybrid surgical and endovascular approach. Right pterional craniotomy enabled microvascular clip reconstruction of the aneurysm neck, complemented by endovascular coil stabilization of the residual loop apex. Postoperative DSA confirmed complete aneurysm obliteration with patent accessory MCA flow. At 6-month follow-up, the patient had recovered completely (mRS 0)."
      }
    ],
    tables: [
      {
        table_id: "tbl_1",
        page: 2,
        title: "Table 1: Baseline Patient Characteristics & Angiographic Parameters",
        html: "<table class='min-w-full text-xs'><thead><tr><th class='p-1 border'>Parameter</th><th class='p-1 border'>Finding</th></tr></thead><tbody><tr><td class='p-1 border font-medium'>Age / Sex</td><td class='p-1 border'>48 / Female</td></tr><tr><td class='p-1 border font-medium'>Arterial Vessel</td><td class='p-1 border'>Accessory Middle Cerebral Artery (AccMCA)</td></tr><tr><td class='p-1 border font-medium'>Aneurysm</td><td class='p-1 border'>Present (Apex pseudoaneurysm, 3.8 mm)</td></tr><tr><td class='p-1 border font-medium'>Initial Presentation</td><td class='p-1 border'>Subarachnoid Hemorrhage (Fisher 3)</td></tr><tr><td class='p-1 border font-medium'>Treatment Modality</td><td class='p-1 border'>Hybrid (Clipping + Coiling)</td></tr></tbody></table>",
        rows: [
          ["Parameter", "Finding"],
          ["Age / Sex", "48 / Female"],
          ["Arterial Vessel", "Accessory MCA"],
          ["Aneurysm", "Present (3.8 mm apex)"],
          ["Presentation", "Subarachnoid Hemorrhage"],
          ["Treatment", "Hybrid (Clip + Coil)"]
        ]
      }
    ],
    markdown: `# A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery\n\n## Abstract\nPure arterial malformations (PAMs) are rare intracranial non-shunting vascular lesions characterized by dilated, tortuous, and coiled arterial loops. We present a 48-year-old female presenting with acute subarachnoid hemorrhage due to a ruptured accessory MCA PAM with an associated flow pseudoaneurysm. Treatment achieved via combined microvascular clipping of the aneurysm and targeted endovascular coiling.\n\n## Case Presentation\nA 48-year-old woman presented with sudden severe headache and vomiting. Non-contrast cranial CT demonstrated diffuse subarachnoid hemorrhage predominantly in the right Sylvian fissure (Fisher grade 3). Catheter digital subtraction angiography (DSA) revealed an anomalous vessel branching from the right internal carotid artery conforming to an accessory MCA. The arterial segment exhibited prominent loops and tortuosity without an early draining vein or capillary nidus.\n\n## Angiographic Characteristics\nDetailed 3D rotational catheter angiography demonstrated a 3.8-mm saccular flow-related pseudoaneurysm located at the apex of the looped accessory middle cerebral artery. The pure arterial malformation loops themselves supplied normal distal right frontoparietal cortex. Preservation of the arterial parent loop was deemed critical to avoid major territorial cerebral infarction.\n\n## Intervention and Follow-Up\nThe patient underwent a hybrid surgical and endovascular approach. Right pterional craniotomy enabled microvascular clip reconstruction of the aneurysm neck, complemented by endovascular coil stabilization of the residual loop apex. Postoperative DSA confirmed complete aneurysm obliteration with patent accessory MCA flow. At 6-month follow-up, the patient had recovered completely (mRS 0).`
  },
  study_birua_2022: {
    study_id: "study_birua_2022",
    pages: 4,
    sections: [
      {
        title: "Abstract & Clinical History",
        page: 1,
        text: "Asian J Neurosurg 2022. Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery.\n\nA 32-year-old male presented with a 2-year history of episodic chronic throbbing occipital headaches without focal neurological deficits."
      },
      {
        title: "Neuroimaging & Angiography",
        page: 2,
        text: "Brain MRI revealed coiled flow voids in the left ambient cistern. Digital subtraction angiography demonstrated marked tortuosity and multiple arterial loops along the left PCA (P2 segment). No arteriovenous shunting or associated aneurysm was identified."
      },
      {
        title: "Management Decision",
        page: 3,
        text: "Because the lesion was unruptured and lacked aneurysmal dilatation, conservative observation with annual MRI/MRA follow-up was selected. Over 3 years of clinical follow-up, the patient remained neurologically intact with stable angioarchitecture."
      }
    ],
    tables: [],
    markdown: `# Pure Artery Malformation of Posterior Cerebral Artery with Dysplastic Internal Carotid Artery\n\n## Abstract\nA 32-year-old male presented with chronic headache. DSA demonstrated a left PCA (P2 segment) pure arterial malformation with coiled loops. No aneurysm or shunting was identified. The patient was managed conservatively with serial clinical follow-up.`
  },
  study_brinjikji_2018: {
    study_id: "study_brinjikji_2018",
    pages: 8,
    sections: [
      {
        title: "Multicenter Cohort Overview",
        page: 1,
        text: "Journal of NeuroInterventional Surgery (2018). Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History.\n\nMethods: We analyzed 72 patients (mean age 44.2 years; 58% female) with confirmed pure arterial malformations across 9 international neurointerventional centers."
      },
      {
        title: "Angioarchitectural Distribution",
        page: 2,
        text: "Vessel involvement was distributed across intracranial territories: MCA 42% (30/72), PCA 31% (22/72), ACA 27% (19/72). Multiple arteries were involved in 11% of patients. Associated aneurysms were identified in 41% of cases (29/72)."
      },
      {
        title: "Clinical Presentation & Outcomes",
        page: 3,
        text: "Presentation was subarachnoid hemorrhage in 34%, chronic headache in 28%, seizure in 16%, and incidental in 22%. Management was conservative in 56% and endovascular in 36%. Long-term annual rupture risk in unruptured, non-aneurysmal PAM was exceptionally low (<0.5%/year)."
      }
    ],
    tables: [],
    markdown: `# Pure Arterial Malformations: Multi-Center Case Series and Systematic Review of Natural History\n\n## Abstract\nMulti-center retrospective cohort and systematic review of 72 patients with pure arterial malformations. Mean age was 44.2 years. Associated aneurysms occurred in 41%. Unruptured lesions without aneurysm have a benign course under conservative observation.`
  },
  study_chua_2021: {
    study_id: "study_chua_2021",
    pages: 4,
    sections: [
      {
        title: "Case Report",
        page: 1,
        text: "J Neurosurg Case Lessons (2021). Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation.\n\nA 59-year-old female presented with sudden severe headache and altered consciousness. CT showed fourth ventricular and cisternal subarachnoid hemorrhage."
      },
      {
        title: "DSA and Treatment",
        page: 2,
        text: "Catheter DSA confirmed a pure arterial malformation involving the left posterior inferior cerebellar artery (PICA) with an associated 5-mm ruptured flow pseudoaneurysm. Successful parent-artery preserving endovascular coiling of the aneurysm was performed."
      }
    ],
    tables: [],
    markdown: `# Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation\n\n## Case Report\nA 59-year-old female with SAH from a ruptured PICA pure arterial malformation with flow pseudoaneurysm. Endovascular coiling of the aneurysm was performed successfully.`
  },
  study_deshmukh_2023: {
    study_id: "study_deshmukh_2023",
    pages: 4,
    sections: [
      {
        title: "Case Summary",
        page: 1,
        text: "Surg Neurol Int (2023). Pure Arterial Malformation (PAM): Case Report and Review of Literature.\n\nA 27-year-old male presented with new-onset focal motor seizures with secondary generalization. MRI and DSA showed an anterior cerebral artery (A2/A3 segment) pure arterial malformation without associated aneurysm."
      },
      {
        title: "Surgical Resection",
        page: 2,
        text: "Due to refractory seizures, microsurgical exploration and surgical lesion management was performed with complete seizure freedom postoperatively."
      }
    ],
    tables: [],
    markdown: `# Pure Arterial Malformation: Case Report and Review\n\n## Case Report\nA 27-year-old male with new-onset seizures caused by an ACA pure arterial malformation without aneurysm, successfully treated with surgical intervention.`
  },
  study_feliciano_2014: {
    study_id: "study_feliciano_2014",
    pages: 5,
    sections: [
      {
        title: "Study Description",
        page: 1,
        text: "Interv Neuroradiol (2014). Color-Coded Digital Subtraction Angiography in the Management of Middle Cerebral Artery Pure Arterial Malformation.\n\nA 51-year-old female presented for workup of mild head trauma. Routine neuroimaging revealed an incidental MCA bifurcation pure arterial malformation without aneurysm."
      },
      {
        title: "Conservative Observation",
        page: 2,
        text: "Color-coded DSA demonstrated preserved laminar flow in distal branches. Managed conservatively with 5-year radiographic stability."
      }
    ],
    tables: [],
    markdown: `# Color-Coded DSA in MCA Pure Arterial Malformation\n\n## Report\nA 51-year-old female with incidental MCA pure arterial malformation without aneurysm, managed conservatively with long-term stability.`
  }
};

DEMO_PDF_SUMMARIES.s1 = DEMO_PDF_SUMMARIES.study_birua_2022;
DEMO_PDF_SUMMARIES.s2 = DEMO_PDF_SUMMARIES.study_albina_2024;
DEMO_PDF_SUMMARIES.s3 = DEMO_PDF_SUMMARIES.study_brinjikji_2018;
DEMO_PDF_SUMMARIES.s4 = DEMO_PDF_SUMMARIES.study_chua_2021;
DEMO_PDF_SUMMARIES.s5 = DEMO_PDF_SUMMARIES.study_deshmukh_2023;
DEMO_PDF_SUMMARIES.s6 = DEMO_PDF_SUMMARIES.study_feliciano_2014;

DEMO_PDF_DATA.s1 = DEMO_PDF_DATA.study_birua_2022;
DEMO_PDF_DATA.s2 = DEMO_PDF_DATA.study_albina_2024;
DEMO_PDF_DATA.s3 = DEMO_PDF_DATA.study_brinjikji_2018;
DEMO_PDF_DATA.s4 = DEMO_PDF_DATA.study_chua_2021;
DEMO_PDF_DATA.s5 = DEMO_PDF_DATA.study_deshmukh_2023;
DEMO_PDF_DATA.s6 = DEMO_PDF_DATA.study_feliciano_2014;

export const DEMO_EXTRACTIONS: Record<string, any[]> = {
  study_birua_2022: [
    {
      extraction_id: "ext_birua_v1",
      study_id: "study_birua_2022",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Left PCA & Right ICA",
      confidence: 0.98,
      quote: "dysplastic right cavernous and clinoidal segments of internal carotid artery (ICA) along with tortuous, redundant vascular compact loops of purely arterial mass (PAM) of left posterior cerebral artery (PCA) were evident",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Left PCA and Right ICA involvement"
    },
    {
      extraction_id: "ext_birua_v9",
      study_id: "study_birua_2022",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Absent",
      confidence: 0.89,
      quote: "There was no evidence of parenchymal hemorrhage, infarction, or subarachnoid hemorrhage (SAH) on CT or magnetic resonance imaging (MRI) of the brain.",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "No hemorrhage or aneurysm"
    },
    {
      extraction_id: "ext_birua_v18",
      study_id: "study_birua_2022",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Conservative (Observation)",
      confidence: 0.99,
      quote: "The patient was managed conservatively and advised for regular radiological follow-up.",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Managed conservatively with regular follow-up"
    },
    {
      extraction_id: "ext_birua_v4",
      study_id: "study_birua_2022",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Sudden Onset Holocranial Headache",
      confidence: 0.84,
      quote: "A 40-year-old female presented to the emergency ward with a history of sudden onset holocranial headache associated with episodes of vomiting for five days.",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Sudden onset holocranial headache"
    },
    {
      extraction_id: "ext_birua_v12",
      study_id: "study_birua_2022",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "40",
      confidence: 0.99,
      quote: "A 40-year-old female presented to the emergency ward with a history of sudden onset holocranial headache associated with episodes of vomiting for five days.",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "40 years old female"
    }
  ],
  study_albina_2024: [
    {
      extraction_id: "ext_albina_v1",
      study_id: "study_albina_2024",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Accessory MCA",
      confidence: 0.98,
      quote: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Accessory MCA"
    },
    {
      extraction_id: "ext_albina_v9",
      study_id: "study_albina_2024",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Present (Flow-related)",
      confidence: 0.87,
      quote: "revascularization and endovascular occlusion using Glubran2/Lipiodol",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Flow-related pseudoaneurysm"
    },
    {
      extraction_id: "ext_albina_v18",
      study_id: "study_albina_2024",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Bypass + Endovascular (nBCA)",
      confidence: 0.99,
      quote: "Revascularization Followed by Endovascular Occlusion Using nBCA",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Revascularization and endovascular occlusion"
    },
    {
      extraction_id: "ext_albina_v4",
      study_id: "study_albina_2024",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Basal Ganglia Hemorrhage",
      confidence: 0.89,
      quote: "A 58-year-old woman with a history of spontaneous basal ganglia hemorrhage 2 years",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Spontaneous basal ganglia hemorrhage"
    },
    {
      extraction_id: "ext_albina_v12",
      study_id: "study_albina_2024",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "58",
      confidence: 0.99,
      quote: "A 58-year-old woman with a history of spontaneous basal ganglia hemorrhage 2 years",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "58 years old woman"
    }
  ],
  study_brinjikji_2018: [
    {
      extraction_id: "ext_brinjikji_v1",
      study_id: "study_brinjikji_2018",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Multiple Territories (12 Patients)",
      confidence: 0.99,
      quote: "Herein we report on a consecutive series of 12 patients with pure arterial malformations",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "12 patients multicenter series"
    },
    {
      extraction_id: "ext_brinjikji_v9",
      study_id: "study_brinjikji_2018",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Present",
      confidence: 0.86,
      quote: "aneurysms associated with the pure arterial malformation, and 5 were partially calcified",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Aneurysms associated with PAM"
    },
    {
      extraction_id: "ext_brinjikji_v18",
      study_id: "study_brinjikji_2018",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Conservative",
      confidence: 0.96,
      quote: "managed conservatively. Herein we report on a consecutive series of 12 patients with pure arterial malformations",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Managed conservatively"
    },
    {
      extraction_id: "ext_brinjikji_v4",
      study_id: "study_brinjikji_2018",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Headache",
      confidence: 0.90,
      quote: "The most common imaging indication was headache",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Most common indication: headache"
    },
    {
      extraction_id: "ext_brinjikji_v12",
      study_id: "study_brinjikji_2018",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "26.2",
      confidence: 0.98,
      quote: "Their mean age at diagnosis was 26.2",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Mean age at diagnosis 26.2 years"
    }
  ],
  study_chua_2021: [
    {
      extraction_id: "ext_chua_v1",
      study_id: "study_chua_2021",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Right PICA",
      confidence: 0.98,
      quote: "angiography revealed a right posterior inferior cerebellar artery-associated PAM",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Right PICA"
    },
    {
      extraction_id: "ext_chua_v9",
      study_id: "study_chua_2021",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Present (Pseudoaneurysm)",
      confidence: 0.88,
      quote: "A small percentage of them may also be associated with an aneurysm",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Associated pseudoaneurysm"
    },
    {
      extraction_id: "ext_chua_v18",
      study_id: "study_chua_2021",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Endovascular (Onyx)",
      confidence: 0.97,
      quote: "The PAM was treated with endovascular Onyx embolization",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Endovascular Onyx embolization"
    },
    {
      extraction_id: "ext_chua_v4",
      study_id: "study_chua_2021",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Subarachnoid Hemorrhage",
      confidence: 0.85,
      quote: "A computed tomography scan demonstrated diffuse SAH with intraventricular extension",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Computed tomography scan demonstrated diffuse SAH"
    },
    {
      extraction_id: "ext_chua_v12",
      study_id: "study_chua_2021",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "38",
      confidence: 0.99,
      quote: "A 38-year-old man presented with a 1-day history of headaches and nausea",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "38 years old male"
    }
  ],
  study_deshmukh_2023: [
    {
      extraction_id: "ext_deshmukh_v1",
      study_id: "study_deshmukh_2023",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Left ACA",
      confidence: 0.97,
      quote: "We describe a case of PAM involving the left anterior cerebral",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Left ACA"
    },
    {
      extraction_id: "ext_deshmukh_v9",
      study_id: "study_deshmukh_2023",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Absent",
      confidence: 0.85,
      quote: "loops without evidence of AV shunting or aneurysmal dilatation",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Without aneurysmal dilatation"
    },
    {
      extraction_id: "ext_deshmukh_v18",
      study_id: "study_deshmukh_2023",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Conservative (Observation)",
      confidence: 0.98,
      quote: "history and is generally managed conservatively",
      source_page: 2,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Managed conservatively"
    },
    {
      extraction_id: "ext_deshmukh_v4",
      study_id: "study_deshmukh_2023",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Incidental / Meningioma Workup",
      confidence: 0.88,
      quote: "underwent vascular imaging for a recently diagnosed left medial frontal",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Incidental on tumor workup"
    },
    {
      extraction_id: "ext_deshmukh_v12",
      study_id: "study_deshmukh_2023",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "Mid-sixties",
      confidence: 0.99,
      quote: "A male in his mid-sixties underwent vascular imaging",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Male in mid-sixties"
    }
  ],
  study_feliciano_2014: [
    {
      extraction_id: "ext_feliciano_v1",
      study_id: "study_feliciano_2014",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      variable_section: "Anatomy",
      value: "Right MCA",
      confidence: 0.98,
      quote: "Cerebral digital subtraction angiography (DSA) showed a right middle cerebral artery malformation",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Right MCA"
    },
    {
      extraction_id: "ext_feliciano_v9",
      study_id: "study_feliciano_2014",
      variable_id: "v9_associated_aneurysm",
      variable_name: "Associated Aneurysm",
      variable_section: "Angioarchitecture",
      value: "Present (Lenticulostriate)",
      confidence: 0.89,
      quote: "An associated medial lenticulostriate artery aneurysm was found",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Associated medial lenticulostriate aneurysm"
    },
    {
      extraction_id: "ext_feliciano_v18",
      study_id: "study_feliciano_2014",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      variable_section: "Management",
      value: "Conservative (Statin Therapy)",
      confidence: 0.98,
      quote: "decided upon conservative management on a statin",
      source_page: 3,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Conservative on statin wall stabilizing agent"
    },
    {
      extraction_id: "ext_feliciano_v4",
      study_id: "study_feliciano_2014",
      variable_id: "v4_presentation",
      variable_name: "Presentation",
      variable_section: "Clinical",
      value: "Severe Headache & Hemorrhage",
      confidence: 0.91,
      quote: "A 42-year-old male chronic smoker was evaluated in the emergency room due to sudden onset of severe headache",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "Sudden onset severe headache"
    },
    {
      extraction_id: "ext_feliciano_v12",
      study_id: "study_feliciano_2014",
      variable_id: "v12_age",
      variable_name: "Patient Age",
      variable_section: "Demographics",
      value: "42",
      confidence: 0.99,
      quote: "A 42-year-old male chronic smoker was evaluated in the emergency room",
      source_page: 1,
      is_verified: false,
      is_edited: false,
      proposed_by: "AI Extractor (Docling v2.4)",
      notes: "42 years old male"
    }
  ]
};

// Aliases for short IDs (s1..s6)
DEMO_EXTRACTIONS.s1 = DEMO_EXTRACTIONS.study_birua_2022;
DEMO_EXTRACTIONS.s2 = DEMO_EXTRACTIONS.study_albina_2024;
DEMO_EXTRACTIONS.s3 = DEMO_EXTRACTIONS.study_brinjikji_2018;
DEMO_EXTRACTIONS.s4 = DEMO_EXTRACTIONS.study_chua_2021;
DEMO_EXTRACTIONS.s5 = DEMO_EXTRACTIONS.study_deshmukh_2023;
DEMO_EXTRACTIONS.s6 = DEMO_EXTRACTIONS.study_feliciano_2014;

export const DEMO_ERROR_ANALYSIS = {
  total_decisions: 18,
  verified_accurate: 14,
  total_discrepancies: 4,
  accuracy_rate: 77.8,
  category_breakdown: {
    NORMALIZATION: 2,
    FALSE_EXTRACTION: 0,
    MISSED_CONTEXT: 1,
    NUMERIC_MISMATCH: 1,
    VALUE_CORRECTION: 0
  },
  high_error_variables: [
    { variable: "Treatment Type", error_count: 2 },
    { variable: "Vessel Involved", error_count: 1 },
    { variable: "Patient Age", error_count: 1 }
  ],
  suggested_prompt_rules: [
    "Enforce strict matching against Codebook allowed category values before emission.",
    "Standardize numerical percentages and ranges to bracketed notation: '42% (30/72)'.",
    "Require verbatim source quote confirmation for every clinical symptom before asserting SAH."
  ],
  recent_records: [
    {
      id: "err_101",
      timestamp: "2026-10-05T20:15:00Z",
      study_id: "study_albina_2024",
      variable_id: "v18_treatment_type",
      variable_name: "Treatment Type",
      decision: "modified",
      original_value: "Surgery and Endovascular Coiling",
      corrected_value: "Hybrid (Clip + Coil)",
      has_discrepancy: true,
      category: "NORMALIZATION",
      rationale: "Model output was clinically accurate but lacked codebook category alignment ('Hybrid (Clip + Coil)').",
      evidence_quote: "The patient underwent a hybrid surgical and endovascular approach.",
      reviewer: "Expert Reviewer"
    },
    {
      id: "err_102",
      timestamp: "2026-10-05T19:40:00Z",
      study_id: "study_brinjikji_2018",
      variable_id: "v1_vessel_involved",
      variable_name: "Vessel Involved",
      decision: "modified",
      original_value: "MCA",
      corrected_value: "Multiple Arteries",
      has_discrepancy: true,
      category: "MISSED_CONTEXT",
      rationale: "Model captured the single largest group (MCA 42%) instead of coding the multicenter cohort category ('Multiple Arteries').",
      evidence_quote: "Vessel involvement was distributed across intracranial territories: MCA 42%, PCA 31%, ACA 27%.",
      reviewer: "Expert Reviewer"
    }
  ]
};
