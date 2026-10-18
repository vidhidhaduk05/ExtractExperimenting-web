"""Shared JSON extraction and repair utilities for LLM responses.

Extracts and parses JSON from text containing thinking tags, markdown fences,
and surrounding natural language explanations.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Any

logger = logging.getLogger("radextract.json_utils")


def parse_json_from_text(raw_text: str) -> dict | list | None:
    """Extract and parse JSON (dict or list) from LLM text output.

    Handles:
    - <thinking>...</thinking> tags removal
    - Markdown code fences (```json ... ``` or ``` ... ```)
    - Direct JSON parsing
    - Balanced bracket/brace extraction from mixed prose
    """
    if not raw_text or not isinstance(raw_text, str):
        return None

    # 1. Strip reasoning / thinking tags
    cleaned = re.sub(r"<thinking>[\s\S]*?</thinking>", "", raw_text, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None

    # 2. Try direct json.loads
    try:
        data = json.loads(cleaned)
        if isinstance(data, (dict, list)):
            return data
    except Exception:
        pass

    # 3. Extract JSON inside markdown fences ```json ... ``` or ``` ... ```
    for match in re.finditer(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE):
        block = match.group(1).strip()
        try:
            data = json.loads(block)
            if isinstance(data, (dict, list)):
                return data
        except Exception:
            # Maybe the block itself has trailing or leading prose, try balanced extraction on block
            extracted = _extract_balanced_json(block)
            if extracted is not None:
                return extracted

    # 4. Find balanced JSON object or array in text
    return _extract_balanced_json(cleaned)


def _extract_balanced_json(text: str) -> dict | list | None:
    """Finds the first balanced { ... } or [ ... ] substring and parses it."""
    if not text:
        return None

    # Search for first opening brace or bracket
    start_brace = text.find("{")
    start_bracket = text.find("[")

    if start_brace == -1 and start_bracket == -1:
        return None

    # Determine which starts first
    if start_brace != -1 and (start_bracket == -1 or start_brace < start_bracket):
        start_idx = start_brace
        open_char, close_char = "{", "}"
    else:
        start_idx = start_bracket
        open_char, close_char = "[", "]"

    stack = 0
    in_string = False
    escape = False

    for i in range(start_idx, len(text)):
        ch = text[i]

        if escape:
            escape = False
            continue

        if ch == "\\" and in_string:
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if not in_string:
            if ch == open_char:
                stack += 1
            elif ch == close_char:
                stack -= 1
                if stack == 0:
                    candidate = text[start_idx : i + 1]
                    try:
                        data = json.loads(candidate)
                        if isinstance(data, (dict, list)):
                            return data
                    except Exception:
                        pass
                    # If this block fails, break and try subsequent scan
                    break

    # Fallback regex search for longest outer { ... } or [ ... ]
    try:
        obj_match = re.search(r"\{[\s\S]*\}", text)
        if obj_match:
            return json.loads(obj_match.group(0))
    except Exception:
        pass

    try:
        arr_match = re.search(r"\[[\s\S]*\]", text)
        if arr_match:
            return json.loads(arr_match.group(0))
    except Exception:
        pass

    return None
