"""Tests for Plan 3: Production Hardening, Rate Limiting, Health, Circuit Breaker, & Advanced Tool Calling."""
import time
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from main import create_app
from services.rate_limiter import RateLimiter
from services.circuit_breaker import CircuitBreaker
from services.tool_calling_client import ToolCallingClient
from services.tool_registry import get_tool, validate_tool_response


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "db_backend" in data
        assert "storage_backend" in data
        assert "metrics" in data

    def test_api_health_check(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


class TestRateLimiter:
    def test_rate_limiter_allows_under_limit(self):
        limiter = RateLimiter(max_requests=5, window_seconds=10.0)
        key = "127.0.0.1"
        for _ in range(5):
            assert limiter.check(key) is True

    def test_rate_limiter_blocks_over_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=10.0)
        key = "192.168.1.100"
        assert limiter.check(key) is True
        assert limiter.check(key) is True
        assert limiter.check(key) is True
        # 4th request exceeds limit
        assert limiter.check(key) is False


class TestCircuitBreaker:
    def test_circuit_breaker_transitions(self):
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        assert cb.can_execute() is True
        assert cb.state == "closed"

        # Record 2 failures -> remains closed
        cb.record_failure()
        cb.record_failure()
        assert cb.can_execute() is True

        # 3rd failure -> trips to open
        cb.record_failure()
        assert cb.state == "open"
        assert cb.can_execute() is False

        # Wait for recovery timeout
        time.sleep(0.15)
        # Should transition to half-open
        assert cb.can_execute() is True
        assert cb.state == "half-open"

        # Success resets to closed
        cb.record_success()
        assert cb.state == "closed"
        assert cb.can_execute() is True


class TestAdvancedToolCalling:
    def test_tool_registry_contains_new_tools(self):
        batch_tool = get_tool("batch_extract_variables")
        assert batch_tool is not None
        assert batch_tool["function"]["name"] == "batch_extract_variables"

        screen_tool = get_tool("screen_and_extract")
        assert screen_tool is not None
        assert screen_tool["function"]["name"] == "screen_and_extract"

    def test_tool_calling_cache_behavior(self):
        client = ToolCallingClient()
        test_tool = "screen_title_abstract"
        test_prompt = "Title: Test Study\nAbstract: Test Abstract"
        fake_result = {
            "status": "included",
            "reason": "Meets criteria",
            "confidence": 0.95,
            "picos_matches": {},
        }

        # Mock the network call
        with patch.object(client, "_try_tool_call", return_value=fake_result) as mock_call:
            res1 = client.call_with_tool(test_tool, test_prompt, use_cache=True)
            assert res1 == fake_result
            assert mock_call.call_count == 1

            # Second call with same prompt should hit cache without calling _try_tool_call again
            res2 = client.call_with_tool(test_tool, test_prompt, use_cache=True)
            assert res2 == fake_result
            assert mock_call.call_count == 1  # Not incremented due to cache hit
