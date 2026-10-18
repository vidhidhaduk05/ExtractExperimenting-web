"""Unit tests for services/json_utils.py — robust JSON extraction from LLM outputs."""
import pytest
from services.json_utils import parse_json_from_text


class TestJsonUtils:
    def test_parse_clean_json_object(self):
        text = '{"name": "variable_1", "value": 42}'
        result = parse_json_from_text(text)
        assert result == {"name": "variable_1", "value": 42}

    def test_parse_clean_json_array(self):
        text = '[{"name": "v1"}, {"name": "v2"}]'
        result = parse_json_from_text(text)
        assert result == [{"name": "v1"}, {"name": "v2"}]

    def test_strip_markdown_fences(self):
        text = """Here is the extracted data:
```json
{
  "decision": "include",
  "confidence": 0.95
}
```
Hope this helps!"""
        result = parse_json_from_text(text)
        assert result == {"decision": "include", "confidence": 0.95}

    def test_strip_generic_markdown_fences(self):
        text = """```
[
  {"prompt": "age", "response": "45"}
]
```"""
        result = parse_json_from_text(text)
        assert result == [{"prompt": "age", "response": "45"}]

    def test_strip_thinking_tags(self):
        text = """<thinking>
We need to extract the study details and format them as JSON.
The patient was 55 years old with aneurysm.
</thinking>
```json
{
  "age": 55,
  "condition": "aneurysm"
}
```"""
        result = parse_json_from_text(text)
        assert result == {"age": 55, "condition": "aneurysm"}

    def test_extract_json_from_mixed_prose(self):
        text = 'Based on the article text: {"responses": [{"prompt": "sample_size", "response": "120"}]} was extracted.'
        result = parse_json_from_text(text)
        assert result == {"responses": [{"prompt": "sample_size", "response": "120"}]}

    def test_nested_objects_and_strings_with_braces(self):
        text = '{"summary": "Bracket {test} in string", "nested": {"key": [1, 2, 3]}}'
        result = parse_json_from_text(text)
        assert result["summary"] == "Bracket {test} in string"
        assert result["nested"]["key"] == [1, 2, 3]

    def test_invalid_json_returns_none(self):
        assert parse_json_from_text("This contains no valid json at all.") is None
        assert parse_json_from_text("{unquoted_key: 123}") is None
        assert parse_json_from_text("") is None
        assert parse_json_from_text(None) is None
