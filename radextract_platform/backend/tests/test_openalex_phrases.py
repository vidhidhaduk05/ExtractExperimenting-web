from services.literature_search_service import openalex_phrases

PAM = (
    '("pure arterial malformation"[tiab] OR "pial arterial malformation"[tiab] OR '
    '("arterial malformation*"[tiab] AND ("intracranial"[tiab] OR "cerebral"[tiab])))'
)


def test_and_group_is_not_searched_as_a_bare_phrase():
    phrases = openalex_phrases(PAM)
    assert "pure arterial malformation" in phrases
    assert "pial arterial malformation" in phrases
    assert "arterial malformation" not in phrases
    assert "intracranial" not in phrases
    assert "cerebral" not in phrases
