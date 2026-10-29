"""Tests for hypothesis generation metadata, grounding, and endpoint hardening."""
import pytest
from fastapi.testclient import TestClient
from main import app
from database import reset_db, init_db
from config import settings


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    db_path = str(tmp_path / "test_api.db")
    monkeypatch.setattr(settings, "db_path", db_path)
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    reset_db()
    init_db()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project(client):
    """Create a project and return its ID."""
    r = client.post("/api/projects", json={"name": "Test Review", "description": "A test"})
    return r.json()["project_id"]


FULL_PICO = {
    "population": "adults with stroke",
    "index_test": "thrombectomy",
    "comparator": "medical therapy",
    "outcome": "functional independence",
    "study_design": "RCT",
}


def _configured_llm(monkeypatch, enabled: bool):
    """Make ToolCallingClient appear configured; optionally stub call_with_tool."""
    monkeypatch.setattr(settings, "llm_api_url", "http://localhost/v1/chat/completions")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    if not enabled:
        monkeypatch.setattr(
            "services.tool_calling_client.ToolCallingClient.call_with_tool",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("LLM unavailable")),
        )


# â”€â”€ generate_hypothesis_from_pico unit tests â”€â”€

class TestGenerateHypothesisFromPico:

    def test_llm_unavailable_returns_template_flagged(self, monkeypatch):
        """When the LLM raises, fall back to template with a non-empty error."""
        from services.tool_calling_client import ToolCallingClient
        _configured_llm(monkeypatch, enabled=False)

        def boom(*args, **kwargs):
            raise RuntimeError("connection refused")

        monkeypatch.setattr(ToolCallingClient, "call_with_tool", boom)

        from services.search_string_generator import generate_hypothesis_from_pico
        result = generate_hypothesis_from_pico(FULL_PICO, "Does thrombectomy help?")

        assert result["generation_source"] == "template"
        assert result["generation_error"] != ""
        assert result["primary_hypothesis"] != ""

    def test_llm_success_returns_llm_flag(self, monkeypatch):
        """A grounded LLM hypothesis is returned flagged as llm."""
        from services.tool_calling_client import ToolCallingClient
        _configured_llm(monkeypatch, enabled=True)

        grounded = (
            "Adults with stroke receiving thrombectomy achieve higher functional "
            "independence compared to medical therapy."
        )

        def fake_call(*args, **kwargs):
            return {
                "primary_hypothesis": grounded,
                "null_hypothesis": "Thrombectomy results in no difference in functional independence.",
                "secondary_hypotheses": ["Safety profiles are comparable."],
            }

        monkeypatch.setattr(ToolCallingClient, "call_with_tool", fake_call)

        from services.search_string_generator import generate_hypothesis_from_pico
        result = generate_hypothesis_from_pico(FULL_PICO, "Does thrombectomy help?")

        assert result["generation_source"] == "llm"
        assert result["generation_error"] == ""
        assert result["primary_hypothesis"] == grounded

    def test_ungrounded_llm_output_flagged(self, monkeypatch):
        """LLM output lacking PICO stems falls back to template with a grounding error."""
        from services.tool_calling_client import ToolCallingClient
        _configured_llm(monkeypatch, enabled=True)

        def fake_call(*args, **kwargs):
            return {"primary_hypothesis": "Treatment A is better."}

        monkeypatch.setattr(ToolCallingClient, "call_with_tool", fake_call)

        from services.search_string_generator import generate_hypothesis_from_pico
        result = generate_hypothesis_from_pico(FULL_PICO, "Does thrombectomy help?")

        assert result["generation_source"] == "template"
        assert "grounding" in result["generation_error"].lower()

    def test_non_inferiority_null_mentions_margin(self, monkeypatch):
        """Non-inferiority designs produce a null hypothesis citing the margin."""
        from services.tool_calling_client import ToolCallingClient
        _configured_llm(monkeypatch, enabled=False)

        pico = dict(FULL_PICO, study_design="non-inferiority trial")
        from services.search_string_generator import generate_hypothesis_from_pico
        result = generate_hypothesis_from_pico(pico, "")

        assert result["generation_source"] == "template"
        assert "non-inferiority margin" in result["null_hypothesis"]


# â”€â”€ generate-hypothesis endpoint tests â”€â”€

class TestGenerateHypothesisEndpoint:

    def test_endpoint_rejects_empty_pico(self, client, project):
        """POST generate-hypothesis without a saved PICO returns 400."""
        r = client.post(f"/api/projects/{project}/generate-hypothesis")
        assert r.status_code == 400
        assert "PICO" in r.json()["detail"]

    def test_endpoint_overwrite_protection(self, client, project, monkeypatch):
        """Manually edited hypotheses require X-Confirm-Overwrite to regenerate."""
        from services.tool_calling_client import ToolCallingClient
        _configured_llm(monkeypatch, enabled=False)

        # Save a PICO so generation is allowed
        r = client.put(f"/api/projects/{project}/pico", json=FULL_PICO)
        assert r.status_code == 200

        # Save a manual hypothesis (differs from anything generated)
        r = client.put(f"/api/projects/{project}/hypothesis", json={
            "hypothesis": "My hand-written hypothesis.",
        })
        assert r.status_code == 200

        # Without the confirmation header -> 409
        r = client.post(f"/api/projects/{project}/generate-hypothesis")
        assert r.status_code == 409
        assert "manually edited" in r.json()["detail"].lower()

        # With the confirmation header -> 200
        r = client.post(
            f"/api/projects/{project}/generate-hypothesis",
            headers={"X-Confirm-Overwrite": "true"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["hypothesis"] != "My hand-written hypothesis."
        assert data["generation_source"] == "template"
