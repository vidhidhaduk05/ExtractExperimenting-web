"""Shared singleton factory for ToolCallingClient."""
from __future__ import annotations
from typing import Optional

from config import settings
from services.tool_calling_client import ToolCallingClient

_client: Optional[ToolCallingClient] = None
_client_config_version = -1


def get_client() -> ToolCallingClient:
    """Retrieve or initialize the global ToolCallingClient instance.

    The client is rebuilt whenever the AI settings are changed from the UI.
    """
    global _client, _client_config_version
    try:
        from services import llm_config_service
        version = llm_config_service.config_version()
    except Exception:
        version = 0
    if _client is None or version != _client_config_version:
        # url / key / model are left unset on purpose: ToolCallingClient resolves them from
        # config.py plus any settings saved in the UI.
        _client = ToolCallingClient(
            tool_calling_enabled=getattr(settings, "llm_tool_calling_enabled", True),
            fallback_enabled=getattr(settings, "llm_tool_call_fallback", True),
            timeout=getattr(settings, "llm_request_timeout", 90),
        )
        _client_config_version = version
    return _client
