"""Runtime AI provider settings (which model / endpoint / key the backend uses).

Settings are kept in memory and saved to ``backend/data/llm_config.json`` (git-ignored) so they
survive a restart. Nothing here has a built-in key: with no saved settings Stellar keeps using the
gateway configured in ``config.py`` (``llm_api_url`` / ``llm_api_key`` / ``llm_model``), exactly as
before. Saved settings only override what the user actually chose.

Providers
  antigravity  the default gateway (config.py). A saved model name overrides ``llm_model``.
               A saved Gemini key is used only by the "test connection" check.
  local        any OpenAI-compatible /v1 endpoint (Ollama, vLLM, LM Studio ...).
  custom       same as local, kept for the UI's third option.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from config import settings

logger = logging.getLogger("radextract.llm_config")

CONFIG_FILE = Path(__file__).parent.parent / "data" / "llm_config.json"
PROVIDERS = ("antigravity", "local", "custom")

DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "antigravity",
    "antigravity_model": "",          # empty = use settings.llm_model
    "antigravity_api_key": "",        # optional Gemini key (connection test only)
    "local_endpoint_url": os.environ.get("OPENAI_BASE_URL") or "http://127.0.0.1:18000/v1",
    "local_model_name": os.environ.get("OPENAI_MODEL") or "co-scientist-screening",
    "custom_api_key": os.environ.get("OPENAI_API_KEY") or "",
    "temperature": 0.1,
    "timeout_seconds": 90,
}

_lock = threading.RLock()
_active_config: Dict[str, Any] = dict(DEFAULT_CONFIG)
_version = 0  # bumped on every change so cached clients know to rebuild


def _load_persisted_config() -> None:
    if not CONFIG_FILE.exists():
        return
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        with _lock:
            _active_config.update({k: v for k, v in data.items() if k in DEFAULT_CONFIG})
    except Exception as e:  # a corrupt file must never stop the backend from starting
        logger.warning("Could not load persisted LLM config: %s", e)


def _save_persisted_config() -> None:
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(_active_config, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error("Failed to persist LLM config: %s", e)


_load_persisted_config()


def config_version() -> int:
    return _version


def mask_api_key(key: str) -> str:
    """Safe-to-display form of a key."""
    if not key:
        return ""
    if len(key) <= 8:
        return "********"
    return f"{key[:4]}...{key[-4:]}"


def _effective_model() -> str:
    return _active_config.get("antigravity_model") or getattr(settings, "llm_model", "gemini-3.7-flash")


def get_active_config(mask_keys: bool = True) -> Dict[str, Any]:
    """The configuration currently in force (keys masked unless ``mask_keys`` is False)."""
    with _lock:
        cfg = dict(_active_config)
    provider = cfg.get("provider", "antigravity")

    if provider == "antigravity":
        active_key = cfg.get("antigravity_api_key") or settings.llm_api_key
        active_model = _effective_model()
        active_endpoint = settings.llm_api_url
        is_default = not cfg.get("antigravity_api_key") and not cfg.get("antigravity_model")
    else:
        active_key = cfg.get("custom_api_key", "")
        active_model = cfg.get("local_model_name", "llama3.3")
        active_endpoint = cfg.get("local_endpoint_url", DEFAULT_CONFIG["local_endpoint_url"])
        is_default = False

    result = {
        "provider": provider,
        "active_model": active_model,
        "active_endpoint": active_endpoint,
        "is_default_key": is_default,
        "temperature": cfg.get("temperature", 0.1),
        "timeout_seconds": cfg.get("timeout_seconds", 60),
        "local_endpoint_url": cfg.get("local_endpoint_url"),
        "local_model_name": cfg.get("local_model_name"),
        "antigravity_model": _effective_model(),
    }
    if mask_keys:
        result["active_key_masked"] = mask_api_key(active_key)
        result["has_key"] = bool(active_key)
    else:
        result["active_key"] = active_key
    return result


def update_active_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Apply changes, save them, and return the masked configuration."""
    global _version
    with _lock:
        if updates.get("provider") in PROVIDERS:
            _active_config["provider"] = updates["provider"]
        if "custom_api_key" in updates and updates["custom_api_key"] is not None:
            _active_config["custom_api_key"] = str(updates["custom_api_key"]).strip()
        if updates.get("local_endpoint_url"):
            _active_config["local_endpoint_url"] = str(updates["local_endpoint_url"]).strip().rstrip("/")
        if updates.get("local_model_name"):
            _active_config["local_model_name"] = str(updates["local_model_name"]).strip()
        if updates.get("antigravity_model"):
            name = str(updates["antigravity_model"]).strip()
            # saving the model that is already the default is not an override
            _active_config["antigravity_model"] = "" if name == getattr(settings, "llm_model", "") else name
        if updates.get("antigravity_api_key"):
            _active_config["antigravity_api_key"] = str(updates["antigravity_api_key"]).strip()
        if "temperature" in updates and updates["temperature"] is not None:
            try:
                _active_config["temperature"] = max(0.0, min(1.0, float(updates["temperature"])))
            except (TypeError, ValueError):
                pass
        _version += 1
        _save_persisted_config()
    return get_active_config(mask_keys=True)


def reset_to_defaults() -> Dict[str, Any]:
    """Forget every saved setting: back to the gateway from config.py."""
    global _active_config, _version
    with _lock:
        _active_config = dict(DEFAULT_CONFIG)
        _version += 1
        _save_persisted_config()
    return get_active_config(mask_keys=True)


def get_runtime_override() -> Dict[str, str]:
    """Values the AI client should use instead of config.py (empty = change nothing)."""
    with _lock:
        cfg = dict(_active_config)
    if cfg.get("provider") in ("local", "custom"):
        endpoint = (cfg.get("local_endpoint_url") or DEFAULT_CONFIG["local_endpoint_url"]).rstrip("/")
        return {
            "api_url": f"{endpoint}/chat/completions",
            "api_key": cfg.get("custom_api_key", ""),
            "model": cfg.get("local_model_name") or "llama3.3",
        }
    if cfg.get("antigravity_model"):
        return {"model": cfg["antigravity_model"]}
    return {}


async def test_connection(
    provider: Optional[str] = None,
    endpoint_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Check that the active (or proposed) AI endpoint answers. Never raises."""
    with _lock:
        cfg = dict(_active_config)
    target = provider or cfg.get("provider", "antigravity")
    started = time.perf_counter()

    def ms() -> float:
        return round((time.perf_counter() - started) * 1000, 1)

    if target == "antigravity":
        gemini_key = api_key or cfg.get("antigravity_api_key")
        model = model_name or _effective_model()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if gemini_key:  # a Gemini key was supplied: verify it against Google directly
                    res = await client.get(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}",
                        params={"key": gemini_key},
                    )
                    target_name = "Gemini API"
                else:           # default: check the gateway Stellar really uses
                    res = await client.get(
                        settings.llm_models_url,
                        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                    )
                    target_name = "AI gateway"
            if res.status_code == 200:
                return {"success": True, "provider": "antigravity", "model": model, "latency_ms": ms(),
                        "message": f"Verified: {target_name} is reachable (model '{model}')."}
            return {"success": False, "provider": "antigravity", "latency_ms": ms(),
                    "status_code": res.status_code,
                    "message": f"{target_name} returned status {res.status_code}."}
        except Exception as e:
            return {"success": False, "provider": "antigravity", "latency_ms": ms(),
                    "message": f"Connection error: {e}"}

    endpoint = (endpoint_url or cfg.get("local_endpoint_url") or DEFAULT_CONFIG["local_endpoint_url"]).rstrip("/")
    key = api_key or cfg.get("custom_api_key", "")
    model = model_name or cfg.get("local_model_name", "llama3.3")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{endpoint}/models", headers=headers)
            if res.status_code == 200:
                body = res.json()
                available = [m.get("id") for m in body.get("data", [])] if isinstance(body, dict) else []
                return {"success": True, "provider": target, "endpoint": endpoint, "model": model,
                        "model_verified": (model in available) if available else True,
                        "available_models": available[:10], "latency_ms": ms(),
                        "message": f"Endpoint connected ({ms()} ms). {len(available)} models found."}
            res2 = await client.post(
                f"{endpoint}/chat/completions", headers=headers,
                json={"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5},
            )
            if res2.status_code == 200:
                return {"success": True, "provider": target, "endpoint": endpoint, "model": model,
                        "latency_ms": ms(), "message": f"Chat completions verified ({ms()} ms)."}
            return {"success": False, "provider": target, "latency_ms": ms(),
                    "status_code": res2.status_code,
                    "message": f"Could not connect to {endpoint}: Endpoint returned status {res2.status_code}."}
    except Exception as e:
        return {"success": False, "provider": target, "endpoint": endpoint, "latency_ms": ms(),
                "message": f"Could not connect to {endpoint}: {e}"}
