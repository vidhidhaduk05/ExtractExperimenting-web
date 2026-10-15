"""Project settings and AI (LLM) settings."""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.db_backend as db_mod
from config import settings
from database import get_connection, init_db, reset_db
from routers import projects, settings as settings_router
from services import llm_client, llm_config_service as cfg
from services.tool_calling_client import ToolCallingClient


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    # database
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "upload_root", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "export_root", str(tmp_path / "exports"))
    db_mod._backend_instance = None
    reset_db()
    init_db()
    # AI settings: never read or write the real saved file
    monkeypatch.setattr(cfg, "CONFIG_FILE", tmp_path / "llm_config.json")
    monkeypatch.setattr(cfg, "_active_config", dict(cfg.DEFAULT_CONFIG))
    llm_client._client = None
    yield
    llm_client._client = None
    reset_db()
    db_mod._backend_instance = None


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(projects.router)
    app.include_router(settings_router.router)
    return TestClient(app)


def _project():
    pid = str(uuid.uuid4())
    conn = get_connection()
    try:
        conn.execute("INSERT INTO projects (project_id, name) VALUES (?, ?)", (pid, "My Review"))
        conn.commit()
    finally:
        conn.close()
    return pid


# ───────────────────────── project settings ─────────────────────────

def test_project_settings_defaults_are_off_and_point_seven(client):
    pid = _project()
    body = client.get(f"/api/projects/{pid}/settings").json()
    assert body == {"project_id": pid, "name": "My Review", "auto_rob_enabled": False, "rob_confidence_threshold": 0.7}


def test_project_settings_update_is_partial_and_persists(client):
    pid = _project()
    r = client.put(f"/api/projects/{pid}/settings", json={"auto_rob_enabled": True})
    assert r.status_code == 200 and r.json()["auto_rob_enabled"] is True
    assert r.json()["rob_confidence_threshold"] == 0.7  # untouched
    r = client.put(f"/api/projects/{pid}/settings", json={"rob_confidence_threshold": 0.85})
    assert r.json()["auto_rob_enabled"] is True and r.json()["rob_confidence_threshold"] == 0.85
    assert client.get(f"/api/projects/{pid}/settings").json()["rob_confidence_threshold"] == 0.85


def test_project_settings_validation_and_404(client):
    pid = _project()
    assert client.put(f"/api/projects/{pid}/settings", json={"rob_confidence_threshold": 1.5}).status_code == 422
    assert client.get("/api/projects/missing/settings").status_code == 404
    assert client.put("/api/projects/missing/settings", json={"auto_rob_enabled": True}).status_code == 404


# ───────────────────────── AI settings ─────────────────────────

def test_default_config_changes_nothing():
    assert cfg.get_runtime_override() == {}
    c = ToolCallingClient()
    assert c.api_url.startswith(settings.llm_api_url.rstrip("/"))
    assert c.api_key == settings.llm_api_key and c.model == settings.llm_model


def test_default_config_has_no_embedded_key():
    shown = cfg.get_active_config(mask_keys=False)
    assert shown["active_key"] == settings.llm_api_key  # only what config.py already had
    assert "AQ." not in json.dumps(cfg.DEFAULT_CONFIG)


def test_local_provider_overrides_url_key_and_model():
    cfg.update_active_config({"provider": "local", "local_endpoint_url": "http://host:1234/v1/",
                              "local_model_name": "qwen2.5", "custom_api_key": "sk-secret-1234"})
    assert cfg.get_runtime_override() == {"api_url": "http://host:1234/v1/chat/completions",
                                          "api_key": "sk-secret-1234", "model": "qwen2.5"}
    c = ToolCallingClient()
    assert c.api_url == "http://host:1234/v1/chat/completions" and c.model == "qwen2.5"


def test_explicit_arguments_still_win_over_saved_settings():
    cfg.update_active_config({"provider": "local", "local_model_name": "qwen2.5"})
    c = ToolCallingClient(api_url="http://other/v1", model="forced")
    assert c.api_url == "http://other/v1/chat/completions" and c.model == "forced"


def test_saving_the_default_model_is_not_an_override():
    cfg.update_active_config({"antigravity_model": settings.llm_model})
    assert cfg.get_runtime_override() == {}
    cfg.update_active_config({"antigravity_model": "gemini-2.5-flash"})
    assert cfg.get_runtime_override() == {"model": "gemini-2.5-flash"}


def test_keys_are_masked_in_the_public_config():
    cfg.update_active_config({"provider": "local", "custom_api_key": "sk-very-secret-key-9999"})
    public = cfg.get_active_config(mask_keys=True)
    assert "sk-very-secret-key-9999" not in json.dumps(public)
    assert public["active_key_masked"] == "sk-v...9999" and public["has_key"] is True


def test_reset_restores_the_gateway():
    cfg.update_active_config({"provider": "local", "local_model_name": "x"})
    result = cfg.reset_to_defaults()
    assert result["provider"] == "antigravity" and cfg.get_runtime_override() == {}


def test_settings_survive_a_restart(tmp_path):
    cfg.update_active_config({"provider": "local", "local_model_name": "persisted-model"})
    saved = json.loads((tmp_path / "llm_config.json").read_text(encoding="utf-8"))
    assert saved["local_model_name"] == "persisted-model"
    cfg._active_config.clear()
    cfg._active_config.update(cfg.DEFAULT_CONFIG)
    cfg._load_persisted_config()
    assert cfg.get_active_config()["local_model_name"] == "persisted-model"


def test_shared_client_is_rebuilt_when_settings_change():
    first = llm_client.get_client()
    assert llm_client.get_client() is first
    cfg.update_active_config({"provider": "local", "local_model_name": "fresh-model"})
    second = llm_client.get_client()
    assert second is not first and second.model == "fresh-model"
    cfg.reset_to_defaults()
    assert llm_client.get_client().model == settings.llm_model


def test_http_llm_config_roundtrip(client):
    body = client.get("/api/settings/llm-config").json()
    assert body["status"] == "success" and body["config"]["provider"] == "antigravity"
    r = client.post("/api/settings/llm-config", json={"provider": "local", "local_model_name": "m1", "temperature": 0.3})
    assert r.status_code == 200 and r.json()["config"]["active_model"] == "m1"
    assert client.post("/api/settings/llm-config", json={"temperature": 5}).status_code == 422
    r = client.post("/api/settings/llm-config/reset")
    assert r.json()["config"]["provider"] == "antigravity"


def test_connection_test_reports_failure_instead_of_raising(client):
    r = client.post("/api/settings/llm-config/test",
                    json={"provider": "local", "endpoint_url": "http://127.0.0.1:9/v1", "model_name": "m"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False and "Could not connect" in body["message"]
