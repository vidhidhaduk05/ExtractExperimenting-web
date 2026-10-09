"""Tests for rob_tools.py — RoB tool definitions, auto-selection, and judgment algorithms."""
import pytest
from services.rob_tools import (
    QUADAS_2, ROBINS_I, ROB_2, ROBINS_E, NOS,
    TOOLS, get_tool, list_tools, select_rob_tool, select_rob_tool_with_alternatives,
    compute_quadas2_domain_judgment, compute_robins_i_domain_judgment,
    compute_rob2_domain_judgment, compute_robins_e_domain_judgment, compute_nos_domain_judgment,
    compute_domain_judgment,
    compute_quadas2_overall, compute_robins_i_overall, compute_rob2_overall,
    compute_robins_e_overall, compute_nos_overall,
    compute_overall_judgment,
    get_judgment_color, get_judgment_label, tool_to_dict,
    JUDGMENT_COLORS, JUDGMENT_LABELS,
)


class TestToolDefinitions:
    """Test that tool definitions are structurally correct."""

    def test_five_tools_registered(self):
        assert set(TOOLS.keys()) == {"quadas2", "robins_i", "rob2", "robins_e", "nos", "jbi_case_report", "jbi_case_series"}

    def test_list_tools_returns_all(self):
        tools = list_tools()
        assert len(tools) == 7

    def test_get_tool_valid(self):
        assert get_tool("quadas2") is QUADAS_2
        assert get_tool("robins_i") is ROBINS_I
        assert get_tool("rob2") is ROB_2
        assert get_tool("robins_e") is ROBINS_E
        assert get_tool("nos") is NOS

    def test_get_tool_invalid(self):
        assert get_tool("nonexistent") is None

    def test_quadas2_structure(self):
        assert QUADAS_2.key == "quadas2"
        assert len(QUADAS_2.domains) == 4
        total_sqs = sum(len(d.signaling_questions) for d in QUADAS_2.domains)
        assert total_sqs == 11
        # 3 domains have applicability
        applicability_count = sum(1 for d in QUADAS_2.domains if d.has_applicability)
        assert applicability_count == 3

    def test_robins_i_structure(self):
        assert ROBINS_I.key == "robins_i"
        assert len(ROBINS_I.domains) == 7
        # All domains use 5-option responses
        for d in ROBINS_I.domains:
            for sq in d.signaling_questions:
                assert len(sq.response_options) == 5

    def test_rob2_structure(self):
        assert ROB_2.key == "rob2"
        assert len(ROB_2.domains) == 5

    def test_robins_e_structure(self):
        assert ROBINS_E.key == "robins_e"
        assert len(ROBINS_E.domains) == 7

    def test_nos_structure(self):
        assert NOS.key == "nos"
        assert len(NOS.domains) == 3

    def test_conditional_questions_exist(self):
        """ROBINS-I and RoB 2 should have conditional signaling questions."""
        robins_i_conditionals = 0
        for d in ROBINS_I.domains:
            for sq in d.signaling_questions:
                if sq.parent_key:
                    robins_i_conditionals += 1
        assert robins_i_conditionals > 0

        rob2_conditionals = 0
        for d in ROB_2.domains:
            for sq in d.signaling_questions:
                if sq.parent_key:
                    rob2_conditionals += 1
        assert rob2_conditionals > 0

    def test_tool_to_dict_serialization(self):
        d = tool_to_dict(QUADAS_2)
        assert d["key"] == "quadas2"
        assert d["name"] == "QUADAS-2"
        assert len(d["domains"]) == 4
        assert "signaling_questions" in d["domains"][0]


class TestAutoSelection:
    """Test auto-selection of RoB tool by study design."""

    @pytest.mark.parametrize("design,expected", [
        ("diagnostic accuracy", "quadas2"),
        ("Diagnostic Test Accuracy Study", "quadas2"),
        ("dta", "quadas2"),
        ("sensitivity and specificity analysis", "quadas2"),
        ("randomized controlled trial", "rob2"),
        ("RCT", "rob2"),
        ("randomised controlled trial", "rob2"),
        ("prospective cohort study", "manual"),
        ("retrospective cohort", "manual"),
        ("case-control study", "manual"),
        ("cross-sectional observational", "manual"),
        ("non-randomized intervention", "robins_i"),
        ("systematic review", "manual"),
        ("", "manual"),
        ("narrative review", "manual"),
    ])
    def test_select_tool(self, design, expected):
        assert select_rob_tool(design) == expected


class TestQuadas2DomainJudgment:
    """Test QUADAS-2 domain judgment algorithm."""

    def test_all_yes_low(self):
        assert compute_quadas2_domain_judgment({"sq_1_1": "yes", "sq_1_2": "yes", "sq_1_3": "yes"}) == "low"

    def test_any_no_high(self):
        assert compute_quadas2_domain_judgment({"sq_1_1": "yes", "sq_1_2": "no", "sq_1_3": "yes"}) == "high"

    def test_any_unclear(self):
        assert compute_quadas2_domain_judgment({"sq_1_1": "yes", "sq_1_2": "unclear", "sq_1_3": "yes"}) == "unclear"

    def test_empty_unclear(self):
        assert compute_quadas2_domain_judgment({}) == "unclear"

    def test_no_overrides_unclear(self):
        assert compute_quadas2_domain_judgment({"sq_1_1": "unclear", "sq_1_2": "no"}) == "high"


class TestRobinsIDomainJudgment:
    """Test ROBINS-I domain judgment algorithm."""

    def test_all_yes_low(self):
        assert compute_robins_i_domain_judgment({"sq_1_1": "yes", "sq_1_2": "yes"}) == "low"

    def test_one_no_moderate(self):
        assert compute_robins_i_domain_judgment({"sq_1_1": "yes", "sq_1_2": "no"}) == "moderate"

    def test_multiple_no_serious(self):
        assert compute_robins_i_domain_judgment({"sq_1_1": "no", "sq_1_2": "no"}) == "serious"

    def test_no_information(self):
        assert compute_robins_i_domain_judgment({"sq_1_1": "no_information"}) == "no_information"

    def test_empty_no_information(self):
        assert compute_robins_i_domain_judgment({}) == "no_information"


class TestRob2DomainJudgment:
    """Test RoB 2 domain judgment algorithm."""

    def test_all_yes_low(self):
        assert compute_rob2_domain_judgment({"sq_1_1": "yes", "sq_1_2": "yes"}) == "low"

    def test_strong_no_high(self):
        assert compute_rob2_domain_judgment({"sq_1_1": "no", "sq_1_2": "yes"}) == "high"

    def test_probably_no_some_concerns(self):
        assert compute_rob2_domain_judgment({"sq_1_1": "probably_no", "sq_1_2": "yes"}) == "some_concerns"

    def test_no_information_some_concerns(self):
        assert compute_rob2_domain_judgment({"sq_1_1": "no_information"}) == "some_concerns"

    def test_empty_some_concerns(self):
        assert compute_rob2_domain_judgment({}) == "some_concerns"


class TestOverallJudgments:
    """Test overall judgment algorithms for each tool."""

    def test_quadas2_overall_all_low(self):
        j = {"patient_selection": "low", "index_test": "low", "reference_standard": "low", "flow_and_timing": "low"}
        assert compute_quadas2_overall(j) == "low"

    def test_quadas2_overall_any_high(self):
        j = {"patient_selection": "low", "index_test": "high", "reference_standard": "low", "flow_and_timing": "low"}
        assert compute_quadas2_overall(j) == "high"

    def test_quadas2_overall_any_unclear(self):
        j = {"patient_selection": "low", "index_test": "unclear", "reference_standard": "low", "flow_and_timing": "low"}
        assert compute_quadas2_overall(j) == "unclear"

    def test_robins_i_overall_escalation(self):
        """Multiple serious domains should not downgrade overall."""
        j = {"confounding": "serious", "selection": "serious", "classification": "low",
             "deviations": "low", "missing": "low", "measurement": "low", "reporting": "low"}
        result = compute_robins_i_overall(j)
        assert result in ("serious", "critical")

    def test_rob2_overall_high(self):
        j = {"randomization": "high", "deviations": "low", "missing": "low", "measurement": "low", "reporting": "low"}
        assert compute_rob2_overall(j) == "high"

    def test_rob2_overall_multiple_some_concerns(self):
        j = {"randomization": "some_concerns", "deviations": "some_concerns",
             "missing": "low", "measurement": "low", "reporting": "low"}
        assert compute_rob2_overall(j) == "high"

    def test_dispatch(self):
        assert compute_overall_judgment("quadas2", {"d1": "low"}) == "low"
        assert compute_overall_judgment("robins_i", {"d1": "low"}) == "low"
        assert compute_overall_judgment("rob2", {"d1": "low"}) == "low"
        assert compute_overall_judgment("robins_e", {"d1": "low"}) == "low"
        assert compute_overall_judgment("nos", {"d1": "low"}) == "low"
        assert compute_overall_judgment("unknown", {}) == "unclear"


class TestSelectRobToolWithAlternatives:
    """Test auto-selection with confidence and alternatives."""

    def test_rct_selects_rob2(self):
        tool, conf, alts = select_rob_tool_with_alternatives("randomized controlled trial")
        assert tool == "rob2"
        assert conf >= 0.95
        assert "robins_i" in alts

    def test_exposure_selects_robins_e(self):
        tool, conf, alts = select_rob_tool_with_alternatives("environmental exposure study")
        assert tool == "robins_e"
        assert "robins_i" in alts

    def test_case_series_selects_nos(self):
        tool, conf, alts = select_rob_tool_with_alternatives("case series report")
        assert tool == "jbi_case_series"
        assert "nos" in alts

    def test_case_report_selects_jbi(self):
        tool, conf, alts = select_rob_tool_with_alternatives("case report")
        assert tool == "jbi_case_report"
        assert "nos" in alts

    def test_observational_cohort_selects_manual(self):
        tool, conf, alts = select_rob_tool_with_alternatives("prospective cohort")
        assert tool == "manual"
        assert conf == 0.70
        assert "robins_i" in alts

    def test_diagnostic_selects_quadas2(self):
        tool, conf, alts = select_rob_tool_with_alternatives("diagnostic test accuracy")
        assert tool == "quadas2"
        assert "robins_i" in alts

    def test_empty_defaults_to_manual(self):
        tool, conf, alts = select_rob_tool_with_alternatives("")
        assert tool == "manual"
        assert conf == 0.0
        assert "robins_i" in alts


class TestDisplayHelpers:
    """Test judgment display helpers."""

    def test_judgment_colors(self):
        assert get_judgment_color("low") == "#75A025"
        assert get_judgment_color("high") == "#E94444"
        assert get_judgment_color("unknown") == "#CCCCCC"

    def test_judgment_labels(self):
        assert get_judgment_label("low") == "Low"
        assert get_judgment_label("some_concerns") == "Some Concerns"
        assert get_judgment_label("no_information") == "No Information"

    def test_all_judgments_have_colors_and_labels(self):
        for j in ["low", "some_concerns", "unclear", "moderate", "high",
                   "serious", "critical", "no_information", "pending"]:
            assert j in JUDGMENT_COLORS
            assert j in JUDGMENT_LABELS
