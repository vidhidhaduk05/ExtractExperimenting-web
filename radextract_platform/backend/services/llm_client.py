"""Shared singleton factory for ToolCallingClient."""
from __future__ import annotations
from typing import Optional

from config import settings
from services.tool_calling_client import ToolCallingClient

_client: Optional[ToolCallingClient] = None


def get_client() -> ToolCallingClient:
    """Retrieve or initialize the global ToolCallingClient instance."""
    global _client
    if _client is None:
        _client = ToolCallingClient(
            api_url=settings.llm_api_url,
            api_key=settings.llm_api_key,
            model=getattr(settings, "llm_model", "gemini-3.7-flash"),
            tool_calling_enabled=getattr(settings, "llm_tool_calling_enabled", True),
            fallback_enabled=getattr(settings, "llm_tool_call_fallback", True),
            timeout=getattr(settings, "llm_request_timeout", 90),
        )
    return _client
