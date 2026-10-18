"""robvis row mapping. Rendering falls back when R is absent."""
from services.robvis_service import normalize_judgment, render_robvis, to_robvis_rows


def _summary():
    return {
        "tool": "rob2",
        "assessments": [
            {
                "study_title": "Smith 2021 arterial malformation",
                "overall_judgment": "some_concerns",
                "domains": [
                    {"domain_key": "randomization", "risk_judgment": "low"},
                    {"domain_key": "deviations", "risk_judgment": "high"},
                    {"domain_key": "missing_outcome", "risk_judgment": "some_concerns"},
                    {"domain_key": "measurement", "risk_judgment": "low"},
                    {"domain_key": "selection_reported", "risk_judgment": "no_information"},
                ],
            }
        ],
    }


def test_rob2_rows_use_robvis_labels():
    tool, columns, rows = to_robvis_rows(_summary())
    assert tool == "ROB2"
    assert columns == ["Study", "D1", "D2", "D3", "D4", "D5", "Overall"]
    assert rows[0]["D1"] == "Low"
    assert rows[0]["D2"] == "High"
    assert rows[0]["D3"] == "Some concerns"
    assert rows[0]["D5"] == "No information"
    assert rows[0]["Overall"] == "Some concerns"


def test_quadas_blank_judgment_is_unclear():
    assert normalize_judgment("QUADAS-2", "") == "Unclear"
    assert normalize_judgment("QUADAS-2", "high") == "High"


def test_duplicate_study_labels_are_unique():
    summary = _summary()
    summary["assessments"].append(dict(summary["assessments"][0]))
    _tool, _columns, rows = to_robvis_rows(summary)
    assert rows[0]["Study"] != rows[1]["Study"]


def test_empty_project_does_not_invent_a_figure():
    result = render_robvis({"tool": "rob2", "assessments": []})
    assert result["success"] is False
    assert result["study_count"] == 0
    assert result["svg"] == ""
