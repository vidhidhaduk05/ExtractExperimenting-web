"""Integration tests for the Antigravity agent orchestration layer.

These tests mock the Antigravity SDK (which requires a compiled Go binary
not available in the test environment) to verify:
- Feature flag gating (is_antigravity_available)
- Agent config construction (create_agent_config)
- Single-study agent run with scripted responses
- Batch agent run with aggregation
- Error handling when the agent fails
- Router endpoints (503 when disabled, 200 on status)
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from config import settings


# ──────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────

@pytest.fixture
def fresh_settings(tmp_path, monkeypatch):
    """Reset settings to a clean state for each test."""
    from routers.agent import _batch_jobs
    _batch_jobs.clear()
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test_agent.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    monkeypatch.setattr(settings, "antigravity_enabled", False)
    monkeypatch.setattr(settings, "antigravity_api_key", "")
    monkeypatch.setattr(settings, "antigravity_model", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "antigravity_max_tokens_per_run", 50000)
    yield
    _batch_jobs.clear()


@pytest.fixture
def client(fresh_settings):
    from database import init_db, reset_db
    from main import app
    reset_db()
    init_db()
    return TestClient(app)


@pytest.fixture
def mock_agent_response():
    """A scripted StudyProcessingResult dict that the mock agent returns."""
    return {
        "study_id": "s1",
        "project_id": "p1",
        "screening": {
            "decision": "include",
            "confidence": 0.88,
            "reason": "Population and intervention match PICO criteria",
            "reason_code": "",
            "evidence_quote": "1000 HF patients randomized to empagliflozin",
            "needs_clarification": False,
            "clarification_question": "",
        },
        "extractions": {
            "extracted": [
                {"variable_name": "sample_size", "value": "1000",
                 "source": "llm", "page": 3, "confidence_tag": "[VS]"},
                {"variable_name": "mean_age", "value": "65",
                 "source": "keyword", "page": 4, "confidence_tag": "[S]"},
            ],
            "gaps": ["follow_up_duration"],
            "recheck_found": ["mean_age"],
        },
        "summary": "Screened by title/abstract (include, 0.88). Extracted 2 variables. 1 gap remaining.",
    }


class MockChatResponse:
    """Mock ChatResponse that returns scripted structured output."""

    def __init__(self, structured: dict | None, text: str = ""):
        self._structured = structured
        self._text = text

    async def structured_output(self):
        return self._structured

    async def text(self):
        return self._text


class MockAgent:
    """Mock Agent that simulates the async context manager + chat()."""

    def __init__(self, config, response: MockChatResponse):
        self._config = config
        self._response = response
        self.conversation_id = "vdextract-test-conversation-id-1234567890"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False

    async def chat(self, prompt):
        return self._response


# ──────────────────────────────────────────────────────────────────────
# is_antigravity_available
# ──────────────────────────────────────────────────────────────────────

class TestIsAntigravityAvailable:
    def test_returns_false_when_sdk_not_installed(self, fresh_settings):
        from services.antigravity_agent import is_antigravity_available
        # SDK is not installed in test env
        assert is_antigravity_available() is False

    def test_returns_false_when_disabled(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", False)
        assert mod.is_antigravity_available() is False

    def test_returns_true_when_installed_and_enabled(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        assert mod.is_antigravity_available() is True


# ──────────────────────────────────────────────────────────────────────
# create_agent_config
# ──────────────────────────────────────────────────────────────────────

class TestCreateAgentConfig:
    def test_raises_when_sdk_not_available(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", False)
        with pytest.raises(RuntimeError, match="not installed"):
            mod.create_agent_config(api_key="test-key")

    def test_raises_when_no_api_key(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        # Patch the SDK classes to MagicMock so config construction works
        monkeypatch.setattr(mod, "_LocalAgentConfig", MagicMock())
        monkeypatch.setattr(mod, "_CapabilitiesConfig", MagicMock())
        monkeypatch.setattr(mod, "_BudgetConfig", MagicMock())
        monkeypatch.setattr(mod, "_policy", MagicMock())
        monkeypatch.setattr(settings, "antigravity_api_key", "")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        with patch("services.llm_config_service.get_active_config", return_value={"active_key": ""}):
            with pytest.raises(RuntimeError, match="No Gemini API key"):
                mod.create_agent_config()

    def test_builds_config_with_api_key(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        mock_config_cls = MagicMock()
        mock_config_instance = MagicMock()
        mock_config_cls.return_value = mock_config_instance
        monkeypatch.setattr(mod, "_LocalAgentConfig", mock_config_cls)
        monkeypatch.setattr(mod, "_CapabilitiesConfig", MagicMock())
        monkeypatch.setattr(mod, "_BudgetConfig", MagicMock())
        mock_policy = MagicMock()
        mock_policy.deny_all.return_value = "deny_all_policy"
        mock_policy.allow.return_value = "allow_policy"
        monkeypatch.setattr(mod, "_policy", mock_policy)

        config = mod.create_agent_config(api_key="test-key-12345")
        assert config is mock_config_instance
        # Verify LocalAgentConfig was called with expected kwargs
        call_kwargs = mock_config_cls.call_args[1]
        assert call_kwargs["api_key"] == "test-key-12345"
        assert call_kwargs["model"] == "gemini-2.5-flash"
        assert call_kwargs["system_instructions"] is not None
        assert len(call_kwargs["tools"]) == 12  # AGENT_TOOLS
        assert call_kwargs["response_schema"] is not None


# ──────────────────────────────────────────────────────────────────────
# run_screening_extraction_agent
# ──────────────────────────────────────────────────────────────────────

class TestRunScreeningExtractionAgent:
    def test_raises_when_not_available(self, fresh_settings):
        from services.antigravity_agent import run_screening_extraction_agent
        with pytest.raises(RuntimeError, match="not available"):
            asyncio.run(run_screening_extraction_agent("s1", "p1"))

    def test_returns_structured_output(self, fresh_settings, monkeypatch, mock_agent_response):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")

        # Mock create_agent_config to return a dummy config
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        # Mock the Agent class
        mock_response = MockChatResponse(structured=mock_agent_response)
        mock_agent = MockAgent(config=MagicMock(), response=mock_response)
        monkeypatch.setattr(mod, "_Agent", lambda config: mock_agent)

        result = asyncio.run(mod.run_screening_extraction_agent("s1", "p1"))
        assert result["study_id"] == "s1"
        assert result["screening"]["decision"] == "include"
        assert result["screening"]["confidence"] == 0.88
        assert len(result["extractions"]["extracted"]) == 2
        assert "follow_up_duration" in result["extractions"]["gaps"]

    def test_falls_back_to_text_when_no_structured_output(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        mock_response = MockChatResponse(structured=None, text="Agent could not process the study.")
        mock_agent = MockAgent(config=MagicMock(), response=mock_response)
        monkeypatch.setattr(mod, "_Agent", lambda config: mock_agent)

        result = asyncio.run(mod.run_screening_extraction_agent("s1", "p1"))
        assert result["study_id"] == "s1"
        assert result["screening"]["decision"] == "uncertain"
        assert "could not process" in result["summary"].lower()

    def test_handles_agent_exception(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        class FailingAgent:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
            async def chat(self, prompt):
                raise RuntimeError("Gemini API rate limited")

        monkeypatch.setattr(mod, "_Agent", lambda config: FailingAgent())

        result = asyncio.run(mod.run_screening_extraction_agent("s1", "p1"))
        assert result["study_id"] == "s1"
        assert "error" in result
        assert "rate limited" in result["error"]


# ──────────────────────────────────────────────────────────────────────
# run_batch_agent
# ──────────────────────────────────────────────────────────────────────

class TestRunBatchAgent:
    def test_raises_when_not_available(self, fresh_settings):
        from services.antigravity_agent import run_batch_agent
        with pytest.raises(RuntimeError, match="not available"):
            asyncio.run(run_batch_agent(["s1", "s2"], "p1"))

    def test_processes_multiple_studies(self, fresh_settings, monkeypatch, mock_agent_response):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        # Create per-study responses
        responses = [
            {"s1": mock_agent_response},
            {"s2": {**mock_agent_response, "study_id": "s2",
                     "screening": {**mock_agent_response["screening"],
                                   "decision": "exclude", "confidence": 0.92}}},
        ]

        call_count = [0]

        def make_agent(config):
            idx = call_count[0]
            call_count[0] += 1
            resp_data = responses[idx] if idx < len(responses) else responses[-1]
            resp = list(resp_data.values())[0]
            return MockAgent(config=config, response=MockChatResponse(structured=resp))

        monkeypatch.setattr(mod, "_Agent", make_agent)

        result = asyncio.run(mod.run_batch_agent(["s1", "s2"], "p1"))
        assert result["total_studies"] == 2
        assert result["included"] == 1
        assert result["excluded"] == 1
        assert result["uncertain"] == 0
        assert len(result["results"]) == 2

    def test_handles_per_study_errors(self, fresh_settings, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        class FailingAgent:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
            async def chat(self, prompt):
                raise RuntimeError("API error")

        monkeypatch.setattr(mod, "_Agent", lambda config: FailingAgent())

        result = asyncio.run(mod.run_batch_agent(["s1", "s2"], "p1"))
        assert result["total_studies"] == 2
        assert result["uncertain"] == 2  # Errors count as uncertain
        assert len(result["errors"]) == 2


# ──────────────────────────────────────────────────────────────────────
# Router endpoints
# ──────────────────────────────────────────────────────────────────────

class TestAgentRouter:
    def test_status_endpoint_returns_200_when_disabled(self, client):
        r = client.get("/api/agent/status")
        assert r.status_code == 200
        body = r.json()
        assert body["available"] is False
        assert "sdk_installed" in body
        assert body["enabled"] is False

    def test_screen_and_extract_returns_503_when_disabled(self, client):
        r = client.post("/api/agent/screen-and-extract", json={
            "study_id": "s1", "project_id": "p1"
        })
        assert r.status_code == 503

    def test_batch_returns_503_when_disabled(self, client):
        r = client.post("/api/agent/batch", json={
            "study_ids": ["s1", "s2"], "project_id": "p1"
        })
        assert r.status_code == 503

    def test_batch_status_returns_404_for_unknown_job(self, client):
        r = client.get("/api/agent/batch/nonexistent-job-id")
        assert r.status_code == 404

    def test_screen_and_extract_returns_404_for_missing_study(self, client, monkeypatch):
        # Enable antigravity
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)

        r = client.post("/api/agent/screen-and-extract", json={
            "study_id": "nonexistent", "project_id": "p1"
        })
        assert r.status_code == 404

    def test_batch_rejects_empty_study_ids(self, client, monkeypatch):
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)

        # Need a valid project for check_project_access to pass
        r = client.post("/api/projects", json={"name": "Test Project"})
        pid = r.json()["project_id"]

        r = client.post("/api/agent/batch", json={
            "study_ids": [], "project_id": pid
        })
        assert r.status_code == 400

    def test_get_batch_status_success_direct(self, client):
        """Test GET /api/agent/batch/{job_id} returning job state directly."""
        from routers.agent import _batch_jobs

        job_id = "test-job-uuid-123"
        _batch_jobs[job_id] = {
            "job_id": job_id,
            "project_id": "proj-1",
            "total_studies": 2,
            "status": "completed",
            "results": {"total_studies": 2, "included": 1, "excluded": 1, "uncertain": 0},
            "error": None,
        }

        r = client.get(f"/api/agent/batch/{job_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["job_id"] == job_id
        assert data["project_id"] == "proj-1"
        assert data["status"] == "completed"
        assert data["total_studies"] == 2
        assert data["results"]["included"] == 1

    def test_get_batch_status_integration_flow(self, client, monkeypatch, mock_agent_response):
        """Test full flow: POST /api/agent/batch and polling GET /api/agent/batch/{job_id}."""
        import services.antigravity_agent as mod
        monkeypatch.setattr(mod, "_SDK_AVAILABLE", True)
        monkeypatch.setattr(settings, "antigravity_enabled", True)
        monkeypatch.setattr(settings, "antigravity_api_key", "test-key")
        monkeypatch.setattr(mod, "create_agent_config", lambda **kw: MagicMock())

        mock_response = MockChatResponse(structured=mock_agent_response)
        mock_agent = MockAgent(config=MagicMock(), response=mock_response)
        monkeypatch.setattr(mod, "_Agent", lambda config: mock_agent)

        # Create project first
        proj_resp = client.post("/api/projects", json={"name": "Batch Test Project"})
        pid = proj_resp.json()["project_id"]

        batch_resp = client.post("/api/agent/batch", json={
            "study_ids": ["s1"],
            "project_id": pid
        })
        assert batch_resp.status_code == 200
        job_id = batch_resp.json()["job_id"]
        assert batch_resp.json()["status"] == "queued"

        status_resp = client.get(f"/api/agent/batch/{job_id}")
        assert status_resp.status_code == 200
        job_data = status_resp.json()
        assert job_data["job_id"] == job_id
        assert job_data["project_id"] == pid
        assert job_data["status"] in ["queued", "running", "completed"]
