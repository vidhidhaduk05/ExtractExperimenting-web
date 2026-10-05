"""
LLM Configuration and Provider Switching Service for RadExtract.

Supports:
1. Antigravity Cloud (Gemini 2.5 Flash / 3.7 Flash) using default Antigravity / Gemini credentials.
2. Custom Local Models (Ollama, vLLM, LM Studio, LocalAI) via OpenAI-compatible /v1 endpoints.
3. Custom API keys and runtime provider toggling without service restart.
"""
import os
import json
import logging
import time
from pathlib import Path
from typing import Dict, Any, Optional
import httpx

from config import settings

logger = logging.getLogger("radextract.llm_config")

CONFIG_FILE = Path(__file__).parent.parent / "data" / "llm_config.json"

DEFAULT_ANTIGRAVITY_KEY = os.environ.get("GEMINI_API_KEY") or getattr(settings, "antigravity_api_key", "") or "AQ.Ab8RN6KpRDE0t3Zij8KVIm8jnloStXmx1UlzxjcMfcWLGYqKKg"

DEFAULT_CONFIG: Dict[str, Any] = {
    "provider": "antigravity",  # "antigravity" | "local" | "custom"
    "antigravity_model": getattr(settings, "antigravity_model", "gemini-2.5-flash"),
    "antigravity_api_key": DEFAULT_ANTIGRAVITY_KEY,
    "local_endpoint_url": "http://localhost:11434/v1",
    "local_model_name": "llama3.3",
    "custom_api_key": "",
    "temperature": 0.1,
    "timeout_seconds": 60,
}

_active_config: Dict[str, Any] = dict(DEFAULT_CONFIG)


def _load_persisted_config():
    global _active_config
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                _active_config.update(data)
                logger.info(f"Loaded persisted LLM config: provider={_active_config.get('provider')}")
        except Exception as e:
            logger.warning(f"Could not load persisted LLM config: {e}")


def _save_persisted_config():
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(_active_config, f, indent=2)
        logger.info("Persisted LLM config updated successfully")
    except Exception as e:
        logger.error(f"Failed to persist LLM config: {e}")


# Initialize from disk on import
_load_persisted_config()


def mask_api_key(key: str) -> str:
    """Return a masked representation of an API key for safe UI display."""
    if not key:
        return ""
    if len(key) <= 8:
        return "********"
    return f"{key[:6]}...{key[-4:]}"


def get_active_config(mask_keys: bool = True) -> Dict[str, Any]:
    """Get the currently active LLM configuration."""
    cfg = dict(_active_config)
    provider = cfg.get("provider", "antigravity")

    if provider == "antigravity":
        active_key = cfg.get("antigravity_api_key") or DEFAULT_ANTIGRAVITY_KEY
        active_model = cfg.get("antigravity_model", "gemini-2.5-flash")
        active_endpoint = "https://generativelanguage.googleapis.com/v1beta"
        is_default = (active_key == DEFAULT_ANTIGRAVITY_KEY)
    else:
        active_key = cfg.get("custom_api_key", "")
        active_model = cfg.get("local_model_name", "llama3.3")
        active_endpoint = cfg.get("local_endpoint_url", "http://localhost:11434/v1")
        is_default = False

    result = {
        "provider": provider,
        "active_model": active_model,
        "active_endpoint": active_endpoint,
        "is_default_key": is_default,
        "temperature": cfg.get("temperature", 0.1),
        "timeout_seconds": cfg.get("timeout_seconds", 60),
        "local_endpoint_url": cfg.get("local_endpoint_url", "http://localhost:11434/v1"),
        "local_model_name": cfg.get("local_model_name", "llama3.3"),
        "antigravity_model": cfg.get("antigravity_model", "gemini-2.5-flash"),
    }

    if mask_keys:
        result["active_key_masked"] = mask_api_key(active_key)
        result["has_key"] = bool(active_key)
    else:
        result["active_key"] = active_key

    return result


def update_active_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update runtime configuration and persist to disk."""
    global _active_config
    
    if "provider" in updates and updates["provider"] in ("antigravity", "local", "custom"):
        _active_config["provider"] = updates["provider"]
    
    if "custom_api_key" in updates:
        _active_config["custom_api_key"] = updates["custom_api_key"].strip()
    
    if "local_endpoint_url" in updates and updates["local_endpoint_url"]:
        _active_config["local_endpoint_url"] = updates["local_endpoint_url"].strip().rstrip("/")
    
    if "local_model_name" in updates and updates["local_model_name"]:
        _active_config["local_model_name"] = updates["local_model_name"].strip()
        
    if "antigravity_model" in updates and updates["antigravity_model"]:
        _active_config["antigravity_model"] = updates["antigravity_model"].strip()

    if "antigravity_api_key" in updates and updates["antigravity_api_key"]:
        _active_config["antigravity_api_key"] = updates["antigravity_api_key"].strip()
        
    if "temperature" in updates:
        try:
            _active_config["temperature"] = float(updates["temperature"])
        except (ValueError, TypeError):
            pass

    _save_persisted_config()
    return get_active_config(mask_keys=True)


def reset_to_antigravity_defaults() -> Dict[str, Any]:
    """Reset configuration back to default Antigravity Gemini settings."""
    global _active_config
    _active_config = dict(DEFAULT_CONFIG)
    _save_persisted_config()
    return get_active_config(mask_keys=True)


async def test_connection(
    provider: Optional[str] = None,
    endpoint_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Test connection to the specified or active LLM endpoint."""
    target_provider = provider or _active_config.get("provider", "antigravity")
    
    start_time = time.perf_counter()
    
    if target_provider == "antigravity":
        key = api_key or _active_config.get("antigravity_api_key") or DEFAULT_ANTIGRAVITY_KEY
        model = model_name or _active_config.get("antigravity_model", "gemini-2.5-flash")
        
        # Test Gemini REST endpoint directly
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}?key={key}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url)
                latency = round((time.perf_counter() - start_time) * 1000, 1)
                if res.status_code == 200:
                    data = res.json()
                    return {
                        "success": True,
                        "provider": "antigravity",
                        "model": model,
                        "latency_ms": latency,
                        "message": f"Verified successfully! Model '{data.get('displayName', model)}' is ready.",
                    }
                else:
                    return {
                        "success": False,
                        "provider": "antigravity",
                        "latency_ms": latency,
                        "status_code": res.status_code,
                        "message": f"Gemini API returned status {res.status_code}: {res.text[:200]}",
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start_time) * 1000, 1)
            return {
                "success": False,
                "provider": "antigravity",
                "latency_ms": latency,
                "message": f"Connection error: {str(e)}",
            }
            
    else:  # local or custom
        endpoint = (endpoint_url or _active_config.get("local_endpoint_url", "http://localhost:11434/v1")).rstrip("/")
        key = api_key or _active_config.get("custom_api_key", "")
        model = model_name or _active_config.get("local_model_name", "llama3.3")
        
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
            
        # First test /models endpoint
        models_url = f"{endpoint}/models"
        chat_url = f"{endpoint}/chat/completions"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(models_url, headers=headers)
                latency = round((time.perf_counter() - start_time) * 1000, 1)
                
                if res.status_code == 200:
                    models_data = res.json()
                    available_models = [m.get("id") for m in models_data.get("data", [])] if "data" in models_data else []
                    model_found = (model in available_models) if available_models else True
                    
                    return {
                        "success": True,
                        "provider": "local",
                        "endpoint": endpoint,
                        "model": model,
                        "model_verified": model_found,
                        "available_models": available_models[:10],
                        "latency_ms": latency,
                        "message": f"Local endpoint connected ({latency}ms). {len(available_models)} models discovered.",
                    }
                else:
                    # Try sending a minimal chat completion
                    ping_payload = {
                        "model": model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 5,
                    }
                    res2 = await client.post(chat_url, headers=headers, json=ping_payload)
                    latency2 = round((time.perf_counter() - start_time) * 1000, 1)
                    if res2.status_code == 200:
                        return {
                            "success": True,
                            "provider": "local",
                            "endpoint": endpoint,
                            "model": model,
                            "latency_ms": latency2,
                            "message": f"Chat completions verified successfully ({latency2}ms).",
                        }
                    return {
                        "success": False,
                        "provider": "local",
                        "latency_ms": latency2,
                        "status_code": res2.status_code,
                        "message": f"Endpoint returned status {res2.status_code}: {res2.text[:200]}",
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start_time) * 1000, 1)
            return {
                "success": False,
                "provider": "local",
                "endpoint": endpoint,
                "latency_ms": latency,
                "message": f"Could not connect to {endpoint}: {str(e)}",
            }
