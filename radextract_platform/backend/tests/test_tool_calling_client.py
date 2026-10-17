"""Unit tests for services/tool_calling_client.py — tool calling, validation, repair, and fallback."""
import json
from unittest.mock import MagicMock, patch
import pytest
import httpx

from services.tool_calling_client import ToolCallingClient


class TestToolCallingClient:
    def test_init_defaults(self):
        client = ToolCallingClient()
        assert client.model in ("gemini-2.5-flash", "gemini-3.7-flash", "biomni-r0")
        assert client.tool_calling_enabled is True
        assert client.fallback_enabled is True

    @patch("httpx.Client.post")
    def test_call_with_tool_success_tool_calls(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "screen_fulltext",
                                    "arguments": json.dumps({
                                        "decision": "include",
                                        "confidence": 0.95,
                                        "reason": "Study matches all PICO criteria.",
                                        "reason_code": "eligible",
                                        "evidence_quote": "Randomized diagnostic trial",
                                    }),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        result = client.call_with_tool("screen_fulltext", "Study text...")
        assert result is not None
        assert result["decision"] == "include"
        assert result["confidence"] == 0.95

    @patch("httpx.Client.post")
    def test_call_with_tool_fallback_to_content(self, mock_post):
        # Gateway returns no tool_calls, but content contains JSON
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": """```json
{
  "decision": "exclude",
  "confidence": 0.85,
  "reason": "Wrong population",
  "reason_code": "wrong_population",
  "evidence_quote": "Pediatric cohort only"
}
```""",
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        result = client.call_with_tool("screen_fulltext", "Study text...")
        assert result is not None
        assert result["decision"] == "exclude"
        assert result["confidence"] == 0.85

    @patch("httpx.Client.post")
    def test_call_with_tool_repair_on_malformed_types(self, mock_post):
        # Arguments have string confidence and integer page that need coercion
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "extract_variables",
                                    "arguments": json.dumps([
                                        {"prompt": "sample_size", "response": "100", "source": "100 enrolled", "page": 2}
                                    ]),
                                },
                            }
                        ],
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        result = client.call_with_tool("extract_variables", "Study text...")
        assert result is not None
        assert "responses" in result
        assert len(result["responses"]) == 1
        assert result["responses"][0]["prompt"] == "sample_size"

    @patch("httpx.Client.post")
    def test_call_with_tool_disabled_tool_calling(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": '{"status": "included", "reason": "Good fit", "confidence": 0.9}',
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(tool_calling_enabled=False, fallback_enabled=True)
        result = client.call_with_tool("screen_title_abstract", "prompt...")
        assert result is not None
        assert result["status"] == "included"

    @patch("httpx.Client.post")
    def test_call_with_tool_both_fail_returns_none(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = Exception("Gateway error")
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        result = client.call_with_tool("screen_fulltext", "Study text...")
        assert result is None

    def test_repair_response_generate_variables(self):
        client = ToolCallingClient()
        raw_data = [
            {"name": "mean_age", "field_type": "float", "description": "Age in years"},
            {"name": "male_pct", "field_type": "percent"},
        ]
        repaired = client._repair_response("generate_variables", raw_data)
        assert repaired is not None
        assert "variables" in repaired
        assert len(repaired["variables"]) == 2
        assert repaired["variables"][0]["name"] == "mean_age"

    def test_repair_response_generate_schema_fields(self):
        client = ToolCallingClient()
        raw_data = {"fields": [{"field": "scanner", "field_type": "text"}]}
        repaired = client._repair_response("generate_schema_fields", raw_data)
        assert repaired is not None
        assert "fields" in repaired
        assert repaired["fields"][0]["name"] == "scanner"

    def test_as_model_fn_wrapper(self):
        client = ToolCallingClient()
        with patch.object(client, "call_with_tool", return_value={"status": "included", "confidence": 0.9, "reason": "Match"}):
            model_fn = client.as_model_fn("screen_title_abstract")
            res = model_fn("some prompt")
            assert isinstance(res, dict)
            assert res["status"] == "included"

    @patch("httpx.Client.post")
    def test_wrong_tool_name_in_response_falls_back(self, mock_post):
        # Gateway returns tool_calls for wrong tool, but content has fallback JSON
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "wrong_tool_name",
                                    "arguments": '{"some": "data"}',
                                },
                            }
                        ],
                        "content": json.dumps({
                            "decision": "include",
                            "confidence": 0.9,
                            "reason": "Fallback match",
                            "reason_code": "eligible",
                            "evidence_quote": "Included",
                        }),
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        res = client.call_with_tool("screen_fulltext", "prompt...")
        assert res is not None
        assert res["decision"] == "include"

    @patch("httpx.Client.post")
    def test_empty_response_returns_none(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"choices": []}
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token", max_retries=0)
        res = client.call_with_tool("screen_fulltext", "prompt...")
        assert res is None

    @patch("httpx.Client.post")
    def test_multiple_tool_calls_takes_matching(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "other_tool",
                                    "arguments": '{"foo": "bar"}',
                                },
                            },
                            {
                                "id": "call_2",
                                "type": "function",
                                "function": {
                                    "name": "screen_title_abstract",
                                    "arguments": json.dumps({
                                        "status": "included",
                                        "confidence": 0.88,
                                        "reason": "Second tool matched",
                                    }),
                                },
                            },
                        ]
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        res = client.call_with_tool("screen_title_abstract", "prompt...")
        assert res is not None
        assert res["status"] == "included"
        assert res["reason"] == "Second tool matched"

    @patch("httpx.Client.post")
    def test_arguments_as_dict(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "screen_title_abstract",
                                    "arguments": {
                                        "status": "excluded",
                                        "confidence": 0.95,
                                        "reason": "Not an RCT",
                                    },
                                },
                            }
                        ]
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token")
        res = client.call_with_tool("screen_title_abstract", "prompt...")
        assert res is not None
        assert res["status"] == "excluded"

    @patch("time.sleep")
    @patch("httpx.Client.post")
    def test_retry_on_timeout_succeeds_second_attempt(self, mock_post, mock_sleep):
        resp_ok = MagicMock()
        resp_ok.status_code = 200
        resp_ok.json.return_value = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "screen_title_abstract",
                                    "arguments": json.dumps({
                                        "status": "included",
                                        "confidence": 0.9,
                                        "reason": "Passes",
                                    }),
                                },
                            }
                        ]
                    }
                }
            ]
        }
        mock_post.side_effect = [
            httpx.TimeoutException("Connection timed out"),
            resp_ok,
        ]

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token", max_retries=2)
        res = client.call_with_tool("screen_title_abstract", "prompt...")
        assert res is not None
        assert res["status"] == "included"
        assert mock_post.call_count == 2
        mock_sleep.assert_called_once_with(1)  # 2^0 = 1

    @patch("time.sleep")
    @patch("httpx.Client.post")
    def test_retry_exhausted_falls_back(self, mock_post, mock_sleep):
        resp_fallback_ok = MagicMock()
        resp_fallback_ok.status_code = 200
        resp_fallback_ok.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({
                            "status": "included",
                            "confidence": 0.85,
                            "reason": "Fallback worked",
                        })
                    }
                }
            ]
        }
        # 1 initial + 2 retries on tool path fail with timeout, then fallback succeeds on 1st try
        mock_post.side_effect = [
            httpx.TimeoutException("Timeout 1"),
            httpx.TimeoutException("Timeout 2"),
            httpx.TimeoutException("Timeout 3"),
            resp_fallback_ok,
        ]

        client = ToolCallingClient(api_url="http://test-gateway", api_key="token", max_retries=2)
        res = client.call_with_tool("screen_title_abstract", "prompt...")
        assert res is not None
        assert res["status"] == "included"
        assert res["reason"] == "Fallback worked"

