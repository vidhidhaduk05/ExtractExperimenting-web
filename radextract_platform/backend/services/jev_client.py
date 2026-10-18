"""Minimal TypeSafe System One (Jev) HTTP client.

Uses httpx (already a dependency) so enabling Jev needs no new packages in either the
zip or the container Lambda build. Everything here is opt-in via ``settings.jev_mode``.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger("jev_client")

_RETRY_STATUSES = {429, 529, 500, 502, 503, 504}

# Circuit breaker: after repeated failures skip Jev for a cooldown so a Jev outage does not
# add its timeout to every study on top of the fallback LLM call.
_BREAKER_THRESHOLD = 3
_BREAKER_COOLDOWN_S = 60.0
_lock = threading.Lock()
_consecutive_failures = 0
_open_until = 0.0

_laya_model: Any = None
_laya_init_failed = False


class JevError(Exception):
    """Raised when a Jev request cannot be completed."""


def _get_laya_model_dir() -> str:
    if settings.laya_model_dir and os.path.exists(settings.laya_model_dir):
        return settings.laya_model_dir
    # Check default workspace location: <project_root>/laya/models
    # services -> backend -> radextract_platform -> workspace_root
    services_dir = os.path.abspath(os.path.dirname(__file__))
    candidates = [
        os.path.abspath(os.path.join(services_dir, "..", "..", "..", "laya", "models")),
        os.path.abspath(os.path.join(services_dir, "..", "..", "laya", "models")),
        os.path.abspath(os.path.join(services_dir, "..", "laya", "models")),
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, "laya.onnx")):
            return c
    return ""


def _get_laya_engine():
    global _laya_model, _laya_init_failed
    if _laya_model is not None:
        return _laya_model
    if _laya_init_failed:
        return None
    with _lock:
        if _laya_model is not None:
            return _laya_model
        try:
            model_dir = _get_laya_model_dir()
            if not model_dir:
                return None
            # Import laya_engine from workspace
            import sys
            root_dir = os.path.abspath(os.path.join(model_dir, "..", ".."))
            if root_dir not in sys.path:
                sys.path.insert(0, root_dir)
            from laya.laya_engine import LayaModel
            _laya_model = LayaModel(model_dir)
            logger.info("Loaded local Laya model from %s", model_dir)
            return _laya_model
        except Exception as e:
            logger.warning("Could not load local Laya model: %s", e)
            _laya_init_failed = True
            return None


def _api_key() -> str:
    return settings.jev_api_key or os.getenv("TYPESAFE_API_KEY", "")


def jev_mode() -> str:
    mode = (settings.jev_mode or "off").strip().lower()
    return mode if mode in ("off", "shadow", "on") else "off"


def is_jev_enabled() -> bool:
    """True when screening should be attempted via local Laya or TypeSafe Jev API."""
    if jev_mode() == "off":
        return False
    if time.monotonic() < _open_until:
        return False

    provider = getattr(settings, "jev_provider", "laya").lower()
    if provider == "laya":
        if bool(_get_laya_model_dir()):
            return True
        # If local Laya files not found, check if remote API key is configured
        return bool(_api_key())

    # Provider is "typesafe" (remote API)
    return bool(_api_key())


def _record_success() -> None:
    global _consecutive_failures
    with _lock:
        _consecutive_failures = 0


def _record_failure() -> None:
    global _consecutive_failures, _open_until
    with _lock:
        _consecutive_failures += 1
        if _consecutive_failures >= _BREAKER_THRESHOLD:
            _open_until = time.monotonic() + _BREAKER_COOLDOWN_S
            _consecutive_failures = 0
            logger.warning("Jev circuit opened for %.0fs after repeated failures", _BREAKER_COOLDOWN_S)


def reset_breaker() -> None:
    """Test helper."""
    global _consecutive_failures, _open_until
    with _lock:
        _consecutive_failures = 0
        _open_until = 0.0


def ask(state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Send one System One request and return the ``answers`` map (keyed by question id).

    Uses local Laya ONNX engine if available, or TypeSafe cloud API if configured.
    Raises JevError on any failure after retries.
    """
    provider = getattr(settings, "jev_provider", "laya").lower()
    if provider == "laya":
        engine = _get_laya_engine()
        if engine is not None:
            try:
                answers = engine.system_one(state, questions)
                _record_success()
                return answers
            except Exception as e:
                _record_failure()
                raise JevError(f"Local Laya inference failed: {e}")

    # Fallback to Remote TypeSafe Jev API
    key = _api_key()
    if not key:
        raise JevError("No Jev API key configured and local Laya unavailable")

    payload = {"state": state, "model": settings.jev_model, "questions": questions}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    attempts = max(1, int(settings.jev_max_retries) + 1)
    last_err: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            resp = httpx.post(
                settings.jev_api_url, json=payload, headers=headers, timeout=settings.jev_timeout
            )
            if resp.status_code in _RETRY_STATUSES and attempt < attempts - 1:
                time.sleep(min(2 ** attempt, 8))
                continue
            if resp.status_code != 200:
                raise JevError(f"Jev HTTP {resp.status_code}: {resp.text[:200]}")
            answers = resp.json().get("answers")
            if not isinstance(answers, dict):
                raise JevError("Jev response missing 'answers'")
            _record_success()
            return answers
        except (httpx.HTTPError, ValueError) as e:
            last_err = e
            if attempt < attempts - 1:
                time.sleep(min(2 ** attempt, 8))
                continue
        except JevError as e:
            last_err = e
            break
    _record_failure()
    raise JevError(str(last_err) if last_err else "Jev request failed")

