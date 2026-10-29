"""Laya System-1 ONNX Screener Adapter.

Thin wrapper / alias for jev_screener to provide clean, unified access to local
Laya inference per the architectural blueprint.
"""
from __future__ import annotations

from typing import Any, Optional

from services import jev_screener


def screen(
    stage: str,
    title: str = "",
    abstract: str = "",
    full_text: str = "",
    pico: Optional[dict[str, Any]] = None,
    exclusion_reasons: Optional[list[str]] = None,
    search_string: Optional[str] = None,
    fast_mode: bool = False,
) -> Optional[dict[str, Any]]:
    """Screen one study with local Laya."""
    return jev_screener.screen(
        stage=stage,
        title=title,
        abstract=abstract,
        full_text=full_text,
        pico=pico,
        exclusion_reasons=exclusion_reasons,
        search_string=search_string,
        fast_mode=fast_mode,
    )


def screen_batch(
    studies: list[dict[str, Any]],
    pico: Optional[dict[str, Any]] = None,
    search_string: Optional[str] = None,
    exclusion_reasons: Optional[list[str]] = None,
    stage: str = "abstract",
    fast_mode: bool = True,
) -> list[dict[str, Any]]:
    """Batch screen studies with local Laya."""
    return jev_screener.screen_batch(
        studies=studies,
        pico=pico,
        search_string=search_string,
        exclusion_reasons=exclusion_reasons,
        stage=stage,
        fast_mode=fast_mode,
    )

