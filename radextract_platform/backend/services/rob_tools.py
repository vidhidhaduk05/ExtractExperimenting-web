"""Risk-of-bias tool definitions for QUADAS-2, ROBINS-I, and RoB 2.

Each tool is a structured definition with:
  - domains (key, label, has_applicability)
  - signaling questions per domain (key, text, response options)
  - judgment options
  - algorithm: mapping from signaling-question answers to domain judgment
  - overall algorithm: mapping from domain judgments to overall judgment

References:
  QUADAS-2: Whiting et al, Ann Intern Med 2011;155:529-536
  ROBINS-I: Sterne et al, BMJ 2016;355:i4919
  RoB 2:    Sterne et al, BMJ 2019;366:l4898
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# ── Response option constants ──

YES_NO_UNCLEAR = ["yes", "no", "unclear"]

ROBINS_ROB2_OPTIONS = ["yes", "probably_yes", "probably_no", "no", "no_information"]

QUADAS2_JUDGMENTS = ["low", "high", "unclear"]
ROBINS_I_JUDGMENTS = ["low", "moderate", "serious", "critical", "no_information"]
ROB2_JUDGMENTS = ["low", "some_concerns", "high"]


# ── Data structures ──

@dataclass
class SignalingQuestion:
    key: str
    text: str
    response_options: list = field(default_factory=lambda: YES_NO_UNCLEAR)
    # For conditional questions: parent key + trigger answers that make this Q active
    parent_key: Optional[str] = None
    trigger_answers: Optional[list] = None  # show this Q only if parent answer is in this list


@dataclass
class Domain:
    key: str
    label: str
    has_applicability: bool = False
    signaling_questions: list[SignalingQuestion] = field(default_factory=list)


@dataclass
class RobTool:
    key: str
    name: str
    full_name: str
    description: str
    study_designs: list[str]  # study designs this tool applies to
    domains: list[Domain]
    judgment_options: list[str]
    has_overall: bool = True

    def get_domain(self, domain_key: str) -> Optional[Domain]:
        for d in self.domains:
            if d.key == domain_key:
                return d
        return None

    def get_all_signaling_questions(self) -> list[tuple[str, SignalingQuestion]]:
        """Return (domain_key, SQ) pairs for all questions in all domains."""
        result = []
        for domain in self.domains:
            for sq in domain.signaling_questions:
                result.append((domain.key, sq))
        return result


# ── QUADAS-2 ──

QUADAS_2 = RobTool(
    key="quadas2",
    name="QUADAS-2",
    full_name="Quality Assessment of Diagnostic Accuracy Studies, 2nd edition",
    description="Assesses risk of bias and applicability of diagnostic accuracy studies.",
    study_designs=["diagnostic accuracy", "diagnostic test", "dta", "diagnostic"],
    judgment_options=QUADAS2_JUDGMENTS,
    domains=[
        Domain(
            key="patient_selection",
            label="Patient Selection",
            has_applicability=True,
            signaling_questions=[
                SignalingQuestion("sq_1_1", "Was a consecutive or random sample of patients enrolled?"),
                SignalingQuestion("sq_1_2", "Was a case-control design avoided?"),
                SignalingQuestion("sq_1_3", "Did the study avoid inappropriate exclusions?"),
            ],
        ),
        Domain(
            key="index_test",
            label="Index Test(s)",
            has_applicability=True,
            signaling_questions=[
                SignalingQuestion("sq_2_1", "Were the index test results interpreted without knowledge of the results of the reference standard?"),
                SignalingQuestion("sq_2_2", "If a threshold was used, was it pre-specified?"),
            ],
        ),
        Domain(
            key="reference_standard",
            label="Reference Standard",
            has_applicability=True,
            signaling_questions=[
                SignalingQuestion("sq_3_1", "Is the reference standard likely to correctly classify the target condition?"),
                SignalingQuestion("sq_3_2", "Were the reference standard results interpreted without knowledge of the results of the index test?"),
            ],
        ),
        Domain(
            key="flow_and_timing",
            label="Flow and Timing",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_4_1", "Was there an appropriate interval between index test(s) and reference standard?"),
                SignalingQuestion("sq_4_2", "Did all patients receive a reference standard?"),
                SignalingQuestion("sq_4_3", "Did all patients receive the same reference standard?"),
                SignalingQuestion("sq_4_4", "Were all patients included in the analysis?"),
            ],
        ),
    ],
)


# ── ROBINS-I ──

ROBINS_I = RobTool(
    key="robins_i",
    name="ROBINS-I",
    full_name="Risk Of Bias In Non-randomised Studies - of Interventions",
    description="Assesses risk of bias in non-randomized studies of interventions.",
    study_designs=["cohort", "case-control", "cross-sectional", "observational",
                   "non-randomized", "quasi-experimental", "registry"],
    judgment_options=ROBINS_I_JUDGMENTS,
    domains=[
        Domain(
            key="confounding",
            label="Bias due to confounding",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_1_1", "Is there potential for confounding of the effect of intervention in this study?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_1_2", "Was the analysis based on a technique to control for confounding?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_1_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_1_3", "Were the variables used to control for confounding measured validly and reliably?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_1_2", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_1_4", "Did the analysis control for all important confounding domains?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_1_2", trigger_answers=["yes", "probably_yes", "probably_no", "no", "no_information"]),
                SignalingQuestion("sq_1_5", "Were confounding domains treated appropriately in the analysis?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_1_4", trigger_answers=["yes", "probably_yes", "probably_no", "no", "no_information"]),
            ],
        ),
        Domain(
            key="selection_participants",
            label="Bias in selection of participants into the study",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_2_1", "Was selection of participants into the study based on participant characteristics observed after the start of intervention?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_2_2", "Were the post-intervention variables that influenced selection also influenced by the intervention?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_2_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_2_3", "Were the post-intervention variables that influenced selection likely to be associated with the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_2_2", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_2_4", "Were the post-intervention variables that influenced selection likely to be influenced by the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_2_3", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="classification_interventions",
            label="Bias in classification of interventions",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_3_1", "Were intervention groups clearly defined?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_3_2", "Was the information used to define intervention groups recorded at the start of the intervention?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_3_3", "Could classification of intervention status have been affected by knowledge of the outcome or risk of the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_2", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="deviations_interventions",
            label="Bias due to deviations from intended interventions",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_4_1", "Were there deviations from the intended intervention beyond what would be expected in usual practice?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_4_2", "Were these deviations likely to have affected the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_4_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_4_3", "Were these deviations from intended intervention unbalanced between groups?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_4_2", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_4_4", "Were these deviations likely to have introduced bias?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_4_3", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="missing_data",
            label="Bias due to missing data",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_5_1", "Were outcome data available for a large proportion of participants?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_5_2", "Were the proportions of missing data and reasons for missing data similar across intervention groups?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_5_1", trigger_answers=["no", "probably_no", "no_information"]),
                SignalingQuestion("sq_5_3", "Is there evidence that the results are robust to the amount and nature of missing data?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_5_2", trigger_answers=["no", "probably_no", "no_information"]),
            ],
        ),
        Domain(
            key="measurement_outcome",
            label="Bias in measurement of the outcome",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_6_1", "Could the outcome measure have been influenced by knowledge of the intervention received?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_6_2", "Was the outcome assessment likely to be influenced by knowledge of intervention received?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_6_1", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="selection_reported",
            label="Bias in selection of the reported result",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_7_1", "Are the reported effect estimates likely to be selected from multiple outcome measurements within the outcome domain?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_7_2", "Are the reported effect estimates likely to be selected from multiple analyses of the intervention-outcome relationship?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_7_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_7_3", "Are the reported effect estimates likely to be selected on the basis of the results?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_7_2", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
    ],
)


# ── RoB 2 ──

ROB_2 = RobTool(
    key="rob2",
    name="RoB 2",
    full_name="Cochrane Risk of Bias 2 (revised tool for randomized trials)",
    description="Assesses risk of bias in randomized controlled trials.",
    study_designs=["rct", "randomized", "randomised", "random", "controlled trial"],
    judgment_options=ROB2_JUDGMENTS,
    domains=[
        Domain(
            key="randomization",
            label="Bias arising from the randomization process",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_1_1", "Was the allocation sequence random?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_1_2", "Was the allocation sequence concealed until participants were recruited and assigned?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_1_3", "Did baseline differences between intervention groups suggest a problem with the randomization process?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="deviations",
            label="Bias due to deviations from intended interventions",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_2_1", "Were participants aware of their assigned intervention during the trial?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_2_2", "Were carers and trial personnel aware of participants' assigned intervention during the trial?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_2_3", "If Yes/Probably yes to 2.1 or 2.2: Were deviations from intended intervention reflected in the analysis?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_2_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_2_4", "Were analysis estimates likely to be biased due to unintended deviations from intended intervention?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="missing_outcome",
            label="Bias due to missing outcome data",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_3_1", "Were data for this outcome available for all, or nearly all, participants randomized?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_3_2", "If No/Probably no: Are the proportions of missing data similar across intervention groups?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_1", trigger_answers=["no", "probably_no"]),
                SignalingQuestion("sq_3_3", "If No/Probably no to 3.2: Are the reasons for missing data acceptable?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_2", trigger_answers=["no", "probably_no"]),
                SignalingQuestion("sq_3_4", "If No/Probably no to 3.1: Could missingness depend on the true value of the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_1", trigger_answers=["no", "probably_no"]),
                SignalingQuestion("sq_3_5", "If Yes/Probably yes to 3.4: Is the proportion of missing data enough to induce bias?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_3_4", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="measurement",
            label="Bias in measurement of the outcome",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_4_1", "Was the method of measuring the outcome appropriate?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_4_2", "Could the measurement or ascertainment of the outcome have differed between intervention groups?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_4_3", "If Yes/Probably yes to 4.2: Were outcome assessors aware of the assigned intervention?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_4_2", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_4_4", "If Yes/Probably yes to 4.3: Could awareness of the assigned intervention have influenced assessment of the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_4_3", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
        Domain(
            key="selection_reported",
            label="Bias in selection of the reported result",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_5_1", "Were the data that produced this result selected from multiple outcome measurements or analyses within the outcome domain?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_5_2", "If Yes/Probably yes to 5.1: Were the data that produced this result selected from multiple eligible outcome measurements?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_5_1", trigger_answers=["yes", "probably_yes"]),
                SignalingQuestion("sq_5_3", "If Yes/Probably yes to 5.2: Were the data that produced this result selected from multiple eligible analyses of the data?",
                                 response_options=ROBINS_ROB2_OPTIONS,
                                 parent_key="sq_5_2", trigger_answers=["yes", "probably_yes"]),
            ],
        ),
    ],
)


# ── ROBINS-E (Exposures) ──

ROBINS_E = RobTool(
    key="robins_e",
    name="ROBINS-E",
    full_name="Risk of Bias in Non-randomized Studies of Exposures",
    description="Assesses risk of bias in non-randomized observational studies evaluating environmental, occupational, or lifestyle exposures.",
    study_designs=["exposure", "etiology", "environmental", "occupational", "toxicology", "observational exposure"],
    judgment_options=ROBINS_I_JUDGMENTS,
    domains=[
        Domain(
            key="confounding",
            label="Bias due to confounding",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_1_1", "Did the authors identify important potential confounders in their protocol/methods?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_1_2", "Did the authors use an appropriate analysis method to control for all important confounders?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_1_3", "Were confounders measured validly and reliably across all participants?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="measurement_exposure",
            label="Bias in measurement of the exposure",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_2_1", "Was exposure measurement objective, valid, and reliable?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_2_2", "Was the exposure measured prior to the development of the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_2_3", "Was exposure classification unaffected by knowledge of the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="selection_participants",
            label="Bias in selection of participants into the study",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_3_1", "Was selection of participants into the study unrelated to both exposure and outcome status?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_3_2", "Did the study include all eligible participants or a consecutive/random sample?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="post_exposure_interventions",
            label="Bias due to post-exposure interventions or co-exposures",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_4_1", "Were there post-exposure interventions or co-exposures that could influence the outcome?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_4_2", "Were important co-exposures balanced between groups or adjusted for?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="missing_data",
            label="Bias due to missing data",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_5_1", "Were exposure and outcome data complete for a high proportion of participants?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_5_2", "Were the proportions and reasons for missing data balanced across exposure levels?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="measurement_outcome",
            label="Bias in measurement of the outcome",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_6_1", "Was outcome assessment objective or blinded to exposure status?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_6_2", "Were measurement methods comparable across exposed and unexposed groups?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
        Domain(
            key="selection_reported",
            label="Bias in selection of the reported result",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_7_1", "Are reported results free from selective reporting among multiple exposure-outcome models?",
                                 response_options=ROBINS_ROB2_OPTIONS),
                SignalingQuestion("sq_7_2", "Was the analysis conducted according to a pre-specified analysis plan?",
                                 response_options=ROBINS_ROB2_OPTIONS),
            ],
        ),
    ],
)


# ── Newcastle-Ottawa Scale (NOS) ──

NOS_JUDGMENTS = ["low", "moderate", "high"]
NOS_OPTIONS = ["yes", "no", "unclear", "not_applicable"]

NOS = RobTool(
    key="nos",
    name="Newcastle-Ottawa Scale",
    full_name="Newcastle-Ottawa Scale for Assessing the Quality of Nonrandomised Studies in Meta-analyses",
    description="Assesses observational cohort, case-control, and case series studies across Selection, Comparability, and Outcome/Exposure using star-based scoring.",
    study_designs=["cohort", "case-control", "case series", "case report", "observational"],
    judgment_options=NOS_JUDGMENTS,
    domains=[
        Domain(
            key="selection",
            label="Selection of Study Groups (Max 4 Stars ★★★★)",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_sel_1", "★ Representativeness of the exposed cohort (truly or somewhat representative of average in community)"),
                SignalingQuestion("sq_sel_2", "★ Selection of the non-exposed cohort (drawn from the same community)"),
                SignalingQuestion("sq_sel_3", "★ Ascertainment of exposure (secure record or structured interview)"),
                SignalingQuestion("sq_sel_4", "★ Demonstration that outcome of interest was not present at start of study"),
            ],
        ),
        Domain(
            key="comparability",
            label="Comparability of Cohorts (Max 2 Stars ★★)",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_comp_1", "★ Study controls for primary confounding factor (age/sex/disease severity)"),
                SignalingQuestion("sq_comp_2", "★ Study controls for any additional important factor"),
            ],
        ),
        Domain(
            key="outcome",
            label="Outcome / Exposure Assessment (Max 3 Stars ★★★)",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_out_1", "★ Assessment of outcome (independent blind assessment or record linkage)"),
                SignalingQuestion("sq_out_2", "★ Was follow-up long enough for outcomes to occur?"),
                SignalingQuestion("sq_out_3", "★ Adequacy of follow-up of cohorts (complete follow up or subjects lost unlikely to introduce bias)"),
            ],
        ),
    ],
)



# ── JBI Critical Appraisal Tools ──

JBI_OPTIONS = ["yes", "no", "unclear", "not applicable"]
JBI_JUDGMENTS = ["yes", "no", "unclear", "not applicable"]

JBI_CASE_REPORT = RobTool(
    key="jbi_case_report",
    name="JBI Case Report",
    full_name="JBI Critical Appraisal Checklist for Case Reports",
    description="Assesses the methodological quality of case reports.",
    study_designs=["case report"],
    judgment_options=JBI_JUDGMENTS,
    has_overall=False,
    domains=[
        Domain(
            key="jbi_cr",
            label="JBI Critical Appraisal Checklist for Case Reports",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_cr_1", "Were patient's demographic characteristics clearly described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_2", "Was the patient's history clearly described and presented as a timeline?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_3", "Was the current clinical condition of the patient on presentation clearly described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_4", "Were diagnostic tests or assessment methods and the results clearly described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_5", "Was the intervention(s) or treatment procedure(s) clearly described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_6", "Was the post-intervention clinical condition clearly described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_7", "Were adverse events (harms) or unanticipated events identified and described?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cr_8", "Does the case report provide takeaway lessons?", response_options=JBI_OPTIONS),
            ],
        ),
    ]
)

JBI_CASE_SERIES = RobTool(
    key="jbi_case_series",
    name="JBI Case Series",
    full_name="JBI Critical Appraisal Checklist for Case Series",
    description="Assesses the methodological quality of case series.",
    study_designs=["case series"],
    judgment_options=JBI_JUDGMENTS,
    has_overall=False,
    domains=[
        Domain(
            key="jbi_cs",
            label="JBI Critical Appraisal Checklist for Case Series",
            has_applicability=False,
            signaling_questions=[
                SignalingQuestion("sq_cs_1", "Were there clear criteria for inclusion in the case series?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_2", "Was the condition measured in a standard, reliable way for all participants included in the case series?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_3", "Were valid methods used for identification of the condition for all participants included in the case series?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_4", "Did the case series have consecutive inclusion of participants?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_5", "Did the case series have complete inclusion of participants?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_6", "Was there clear reporting of the demographics of the participants in the study?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_7", "Was there clear reporting of clinical information of the participants?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_8", "Were the outcomes or follow up results of cases clearly reported?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_9", "Was there clear reporting of the presenting site(s)/clinic(s) demographic information?", response_options=JBI_OPTIONS),
                SignalingQuestion("sq_cs_10", "Was statistical analysis appropriate?", response_options=JBI_OPTIONS),
            ],
        ),
    ]
)

# ── Tool registry ──

TOOLS: dict[str, RobTool] = {
    "quadas2": QUADAS_2,
    "robins_i": ROBINS_I,
    "rob2": ROB_2,
    "robins_e": ROBINS_E,
    "nos": NOS,
    "jbi_case_report": JBI_CASE_REPORT,
    "jbi_case_series": JBI_CASE_SERIES,
}


def get_tool(tool_key: str) -> Optional[RobTool]:
    return TOOLS.get(tool_key)


def list_tools() -> list[RobTool]:
    return list(TOOLS.values())


# ── Auto-selection ──

def select_rob_tool(study_design: str) -> str:
    """Auto-select the appropriate RoB tool based on study design classification.

    Returns tool key ('quadas2', 'robins_i', 'rob2', 'robins_e', 'nos') or 'manual' if no match.
    """
    selected, _, _ = select_rob_tool_with_alternatives(study_design)
    return selected


def select_rob_tool_with_alternatives(study_design: str) -> tuple[str, float, list[str]]:
    """Auto-select RoB tool with confidence score and alternative suggestions."""
    design = (study_design or "").lower().strip()
    if not design:
        return ("manual", 0.0, ["rob2", "robins_i", "nos", "quadas2"])

    # Diagnostic accuracy studies → QUADAS-2
    if any(kw in design for kw in [
        "diagnostic accuracy", "diagnostic test", "dta", "diagnostic",
        "sensitivity", "specificity", "index test", "accuracy study",
    ]):
        return ("quadas2", 0.95, ["robins_i", "rob2"])

    # Randomized controlled trials → RoB 2
    if any(kw in design for kw in [
        "rct", "randomized", "randomised", "random", "controlled trial",
        "randomized controlled", "crossover", "cluster",
    ]) and not any(kw in design for kw in ["non-randomized", "non randomised", "non-randomised"]):
        return ("rob2", 0.98, ["robins_i"])

    # Non-randomized interventional studies → ROBINS-I
    if any(kw in design for kw in [
        "non-randomized", "non randomised", "non-randomised",
        "quasi-experimental", "quasi experimental", "quasi",
    ]):
        return ("robins_i", 0.90, ["rob2", "nos"])

    # Exposure / Etiology / Environmental / Occupational studies → ROBINS-E
    if any(kw in design for kw in [
        "exposure", "etiology", "environmental", "occupational", "toxicology",
    ]):
        return ("robins_e", 0.88, ["robins_i", "nos"])

    # Case report
    if "case report" in design:
        return ("jbi_case_report", 0.95, ["nos", "jbi_case_series"])

    # Case series
    if any(kw in design for kw in ["case series", "cases", "clinical series"]):
        return ("jbi_case_series", 0.95, ["nos", "jbi_case_report"])

    # Observational cohort or case-control studies → ROBINS-I / NOS
    if any(kw in design for kw in [
        "prospective cohort", "retrospective cohort", "case-control", "case control",
        "cross-sectional", "observational", "registry", "cohort",
    ]):
        # Confidence is borderline. Do not force ROBINS-I if confidence is below threshold.
        # Returning "manual" for ambiguous non-randomized studies avoids forcing ROBINS-I.
        return ("manual", 0.70, ["robins_i", "nos", "robins_e"])

    return ("manual", 0.2, ["robins_i", "rob2", "nos", "quadas2", "jbi_case_report", "jbi_case_series"])


# ── Judgment algorithms ──

def compute_quadas2_domain_judgment(answers: dict[str, str]) -> str:
    """Compute QUADAS-2 domain risk-of-bias judgment from signaling question answers.

    Algorithm (per Whiting et al 2011):
      - All SQs = "yes" → "low"
      - Any SQ = "no" → "high"
      - Any SQ = "unclear" (and none "no") → "unclear"
      - Empty/missing answers → "unclear"
    """
    active_answers = [a for a in answers.values() if a and a != ""]
    if not active_answers:
        return "unclear"
    if any(a == "no" for a in active_answers):
        return "high"
    if any(a == "unclear" for a in active_answers):
        return "unclear"
    if all(a == "yes" for a in active_answers):
        return "low"
    return "unclear"


def compute_robins_i_domain_judgment(answers: dict[str, str]) -> str:
    """Compute ROBINS-I domain risk-of-bias judgment from signaling question answers.

    Simplified algorithm (per Sterne et al 2016):
      - All relevant SQs = "yes"/"probably_yes" → "low"
      - Any "no"/"probably_no" on critical questions → "serious" or "critical"
      - "no_information" on key questions → "no_information"
      - Mixed → "moderate"
    """
    active_answers = [a for a in answers.values() if a and a != ""]
    if not active_answers:
        return "no_information"

    if any(a == "no_information" for a in active_answers):
        if any(a == "no" for a in active_answers):
            return "serious"
        return "no_information"

    no_count = sum(1 for a in active_answers if a in ("no", "probably_no"))
    yes_count = sum(1 for a in active_answers if a in ("yes", "probably_yes"))

    if no_count == 0 and yes_count > 0:
        return "low"
    if no_count >= 2:
        return "serious"
    if no_count == 1:
        return "moderate"

    return "moderate"


def compute_robins_e_domain_judgment(answers: dict[str, str]) -> str:
    """Compute ROBINS-E domain risk-of-bias judgment from signaling question answers."""
    return compute_robins_i_domain_judgment(answers)


def compute_rob2_domain_judgment(answers: dict[str, str]) -> str:
    """Compute RoB 2 domain risk-of-bias judgment from signaling question answers.

    Simplified algorithm (per Sterne et al 2019):
      - All relevant SQs = "yes"/"probably_yes" → "low"
      - Any "no" on critical questions → "high"
      - Mixed or "some concerns" indicators → "some_concerns"
      - "no_information" → "some_concerns" (per RoB 2 guidance)
    """
    active_answers = [a for a in answers.values() if a and a != ""]
    if not active_answers:
        return "some_concerns"

    if any(a == "no_information" for a in active_answers):
        return "some_concerns"

    no_count = sum(1 for a in active_answers if a in ("no", "probably_no"))
    yes_count = sum(1 for a in active_answers if a in ("yes", "probably_yes"))

    if no_count == 0 and yes_count > 0:
        return "low"
    if no_count >= 1:
        strong_no = sum(1 for a in active_answers if a == "no")
        if strong_no >= 1:
            return "high"
        return "some_concerns"

    return "some_concerns"


def compute_nos_domain_judgment(answers: dict[str, str]) -> str:
    """Compute Newcastle-Ottawa Scale domain judgment based on star counts.

    Answers indicating a star: 'yes', 'yes_star', '1', 'true', etc.
    Thresholds:
      High quality / low risk: >= 75% of questions awarded stars
      Moderate quality: >= 50% of questions awarded stars
      Low quality / high risk: < 50% of questions awarded stars
    """
    active_answers = [a for a in answers.values() if a and a != ""]
    if not active_answers:
        return "high"

    star_count = sum(1 for a in active_answers if a.lower() in ("yes", "yes_star", "1", "true", "star"))
    total_q = len(active_answers)

    if total_q == 0:
        return "high"

    ratio = star_count / total_q
    if ratio >= 0.75:
        return "low"
    elif ratio >= 0.50:
        return "moderate"
    else:
        return "high"


def compute_domain_judgment(tool_key: str, answers: dict[str, str]) -> str:
    """Dispatch to the appropriate tool's domain judgment algorithm."""
    if tool_key == "quadas2":
        return compute_quadas2_domain_judgment(answers)
    elif tool_key in ("robins_i", "robins-i"):
        return compute_robins_i_domain_judgment(answers)
    elif tool_key in ("robins_e", "robins-e"):
        return compute_robins_e_domain_judgment(answers)
    elif tool_key in ("rob2", "rob-2"):
        return compute_rob2_domain_judgment(answers)
    elif tool_key == "nos":
        return compute_nos_domain_judgment(answers)
    elif tool_key.startswith("jbi_"):
        return "pending"
    return "unclear"


# ── Overall judgment algorithms ──

def compute_quadas2_overall(domain_judgments: dict[str, str]) -> str:
    """QUADAS-2 overall: typically the highest risk among domains (sensitivity-first)."""
    active = [j for j in domain_judgments.values() if j and j != ""]
    if not active:
        return "unclear"
    if any(j == "high" for j in active):
        return "high"
    if any(j == "unclear" for j in active):
        return "unclear"
    return "low"


def compute_robins_i_overall(domain_judgments: dict[str, str]) -> str:
    """ROBINS-I overall: at least as severe as the most severe domain."""
    severity_order = {"low": 0, "moderate": 1, "serious": 2, "critical": 3, "no_information": 1}
    active = [j for j in domain_judgments.values() if j and j != ""]
    if not active:
        return "no_information"
    max_severity = max(severity_order.get(j, 1) for j in active)
    serious_or_worse = sum(1 for j in active if severity_order.get(j, 0) >= 2)
    if serious_or_worse >= 2:
        max_severity = max(max_severity, 2)
    reverse = {0: "low", 1: "moderate", 2: "serious", 3: "critical"}
    return reverse.get(max_severity, "moderate")


def compute_robins_e_overall(domain_judgments: dict[str, str]) -> str:
    """ROBINS-E overall: follows the ROBINS hierarchy."""
    return compute_robins_i_overall(domain_judgments)


def compute_rob2_overall(domain_judgments: dict[str, str]) -> str:
    """RoB 2 overall: Low (all low), Some concerns (≥1 some concerns), High (≥1 high or multiple some concerns)."""
    active = [j for j in domain_judgments.values() if j and j != ""]
    if not active:
        return "some_concerns"
    if any(j == "high" for j in active):
        return "high"
    some_concerns_count = sum(1 for j in active if j == "some_concerns")
    if some_concerns_count >= 2:
        return "high"
    if some_concerns_count >= 1:
        return "some_concerns"
    return "low"


def compute_nos_overall(domain_judgments: dict[str, str]) -> str:
    """Newcastle-Ottawa Scale overall: Low (all low), Moderate (1-2 moderate), High (any high)."""
    active = [j for j in domain_judgments.values() if j and j != ""]
    if not active:
        return "moderate"
    if any(j == "high" for j in active):
        return "high"
    if any(j == "moderate" for j in active):
        return "moderate"
    return "low"


def compute_overall_judgment(tool_key: str, domain_judgments: dict[str, str]) -> str:
    """Dispatch to the appropriate tool's overall judgment algorithm."""
    if tool_key == "quadas2":
        return compute_quadas2_overall(domain_judgments)
    elif tool_key in ("robins_i", "robins-i"):
        return compute_robins_i_overall(domain_judgments)
    elif tool_key in ("robins_e", "robins-e"):
        return compute_robins_e_overall(domain_judgments)
    elif tool_key in ("rob2", "rob-2"):
        return compute_rob2_overall(domain_judgments)
    elif tool_key == "nos":
        return compute_nos_overall(domain_judgments)
    elif tool_key.startswith("jbi_"):
        return "pending"
    return "unclear"


# ── Judgment display helpers ──

JUDGMENT_COLORS = {
    "low": "#75A025",           # green
    "some_concerns": "#FF9400", # orange
    "unclear": "#FF9400",       # orange (same as some concerns for display)
    "moderate": "#FF9400",      # orange
    "high": "#E94444",          # red
    "serious": "#E94444",       # red
    "critical": "#B00000",      # dark red
    "no_information": "#999999", # gray
    "pending": "#CCCCCC",       # light gray
}

JUDGMENT_LABELS = {
    "low": "Low",
    "some_concerns": "Some Concerns",
    "unclear": "Unclear",
    "moderate": "Moderate",
    "high": "High",
    "serious": "Serious",
    "critical": "Critical",
    "no_information": "No Information",
    "pending": "Pending",
}


def get_judgment_color(judgment: str) -> str:
    return JUDGMENT_COLORS.get(judgment, "#CCCCCC")


def get_judgment_label(judgment: str) -> str:
    return JUDGMENT_LABELS.get(judgment, judgment.replace("_", " ").title())


def tool_to_dict(tool: RobTool) -> dict:
    """Serialize a tool definition to a dict for API responses."""
    return {
        "key": tool.key,
        "name": tool.name,
        "full_name": tool.full_name,
        "description": tool.description,
        "study_designs": tool.study_designs,
        "judgment_options": tool.judgment_options,
        "has_overall": tool.has_overall,
        "domains": [
            {
                "key": d.key,
                "label": d.label,
                "has_applicability": d.has_applicability,
                "signaling_questions": [
                    {
                        "key": sq.key,
                        "text": sq.text,
                        "response_options": sq.response_options,
                        "parent_key": sq.parent_key,
                        "trigger_answers": sq.trigger_answers,
                    }
                    for sq in d.signaling_questions
                ],
            }
            for d in tool.domains
        ],
    }
