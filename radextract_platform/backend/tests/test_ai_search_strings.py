"""AI chooses the strategy; syntax guardrails must not rewrite its reasoning."""
from unittest.mock import patch

import pytest

from services.search_string_generator import (
    SEARCH_DIALECTS, SearchGenerationError, check_search_syntax,
    generate_ai_search_strings,
)


def valid_strings():
    return {
        "pubmed": '"ACTA2"[tiab]',
        "embase": "'ACTA2':ti,ab,kw",
        "ovid_medline": 'ACTA2.ti,ab.',
        "ovid_embase": 'ACTA2.ti,ab.',
        "cochrane": 'ACTA2:ti,ab,kw',
        "web_of_science": 'TS=(ACTA2)',
        "scopus": 'TITLE-ABS-KEY(ACTA2)',
        "cinahl": 'TI ACTA2 OR AB ACTA2',
    }


def test_model_can_choose_one_concept_and_omit_outcome():
    strings = valid_strings()
    with patch('services.tool_calling_client.ToolCallingClient') as client:
        client.return_value.call_with_tool.return_value = {"strings": strings}
        assert generate_ai_search_strings({"population": "ACTA2", "outcome": "stroke"}) == strings
        prompt = client.return_value.call_with_tool.call_args.kwargs['prompt']
        assert 'Do NOT force' in prompt
        assert 'Embase.com' in prompt and 'Ovid Embase' in prompt
        assert client.return_value.call_with_tool.call_count == 1


def test_requests_repair_and_keeps_valid_searches():
    broken = valid_strings()
    broken['scopus'] = 'TITLE-ABS-KEY(ACTA2 AND)'
    repaired = valid_strings()
    repaired['pubmed'] = 'stroke[tiab]'  # Repair must not replace a valid strategy.
    with patch('services.tool_calling_client.ToolCallingClient') as client:
        client.return_value.call_with_tool.side_effect = [
            {"strings": broken}, {"strings": repaired},
        ]
        assert generate_ai_search_strings({"population": "ACTA2"}) == valid_strings()
        assert client.return_value.call_with_tool.call_count == 2
        prompt = client.return_value.call_with_tool.call_args.kwargs['prompt']
        assert 'Boolean operator without a right-hand term' in prompt
        assert 'Preserve the concepts' in prompt


@pytest.mark.parametrize('response', [None, {}, {"strings": valid_strings() | {"pubmed": 'stroke[tiab] AND'}}])
def test_unavailable_or_unrepaired_ai_never_uses_fixed_mapping(response):
    with patch('services.tool_calling_client.ToolCallingClient') as client:
        client.return_value.call_with_tool.return_value = response
        with pytest.raises(SearchGenerationError):
            generate_ai_search_strings({"population": "stroke"})
        assert client.return_value.call_with_tool.call_count <= 2


@pytest.mark.parametrize('database,query', [
    ('pubmed', '"stroke rehabilitation"[tiab:~3]'),
    ('pubmed', '"Stroke"[mh:noexp] OR stroke*[tiab]'),
    ('embase', "'stroke'/exp OR (stroke NEAR/3 rehabilitat*):ti,ab,kw"),
    ('ovid_medline', '1. exp Stroke/\n2. (stroke adj3 rehabilitation).ti,ab.\n3. 1 or 2'),
    ('cochrane', '#1 MeSH descriptor: [Stroke] explode all trees\n#2 stroke:ti,ab,kw\n#3 #1 OR #2'),
    ('scopus', 'TITLE-ABS-KEY({stroke rehabilitation} OR (stroke W/3 rehabilitat*)) AND PUBYEAR > 2019'),
    ('scopus', 'TITLE-ABS-KEY("stroke rehabilitation")'),
    ('scopus', 'TITLE-ABS-KEY({AND OR})'),
    ('web_of_science', 'TS=("stroke rehabilitation")'),
    ('cinahl', 'MH "Stroke+" OR TI (stroke N3 rehabilitat*) OR AB stroke'),
    ('web_of_science', 'TS=(stroke NEAR/3 rehabilitat*) AND PY=(2020-2026)'),
])
def test_alternative_valid_strategies_are_allowed(database, query):
    assert check_search_syntax(database, query) == []


@pytest.mark.parametrize('database,query', [
    ('scopus', 'TITLE-ABS-KEY(stroke'),
    ('pubmed', 'stroke[tiab] OR OR rehabilitation[tiab]'),
    ('pubmed', '"stroke* rehabilitation"[tiab:~3]'),
    ('embase', 'stroke[tiab]'),
    ('ovid_embase', "'stroke'/exp"),
    ('cinahl', 'TITLE-ABS-KEY(stroke)'),
    ('pubmed', '"HEADING_A"[Mesh]'),
])
def test_clear_errors_are_reported(database, query):
    assert check_search_syntax(database, query)


def test_missing_database_triggers_repair():
    incomplete = valid_strings()
    del incomplete['ovid_embase']
    with patch('services.tool_calling_client.ToolCallingClient') as client:
        client.return_value.call_with_tool.side_effect = [{"strings": incomplete}, {"strings": valid_strings()}]
        assert set(generate_ai_search_strings({"population": "ACTA2"})) == set(SEARCH_DIALECTS)


def test_generation_endpoint_preserves_saved_searches_on_failure():
    import asyncio
    from fastapi import HTTPException
    from unittest.mock import MagicMock
    from routers.projects import generate_search_strings

    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {'pico_json': '{"population": "stroke"}'}
    with patch('routers.projects.check_project_access'), patch(
        'services.search_string_generator.generate_ai_search_strings',
        side_effect=SearchGenerationError('AI unavailable; saved searches were not changed.'),
    ):
        with pytest.raises(HTTPException) as error:
            asyncio.run(generate_search_strings('project', user=None, conn=conn))
        assert error.value.status_code == 503
    assert conn.execute.call_count == 1  # SELECT only, no UPDATE
    conn.commit.assert_not_called()
