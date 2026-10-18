"""Safety net service: Post-LLM hard-override safety net rules."""
from __future__ import annotations

from typing import Any, Optional


def apply_overrides(
    llm_result: dict[str, Any],
    prefilter_result: dict[str, Any],
    signals: Optional[dict[str, Any]] = None,
    stage: str = "ta",
    pdf_text_available: bool = True,
) -> dict[str, Any]:
    """Apply PICO hard-override safety net rules to an LLM screening result based on pre-filter findings.

    Args:
        llm_result: Dict containing recommendation, confidence, reason_text, etc.
        prefilter_result: Dict from prefilter_study
        signals: Topic signals dict
        stage: "ta" or "ft"
        pdf_text_available: Whether PDF text was available (for FT stage)

    Returns:
        Modified copy of result dict with updated recommendation, confidence, override_notes, and reason_text.
    """
    result = dict(llm_result)
    rec = (result.get("recommendation") or "uncertain").lower()
    conf = float(result.get("confidence", 0.0))
    reason_text = result.get("reason_text") or ""
    override_notes = list(result.get("override_notes") or [])

    prefilter_flag = prefilter_result.get("prefilter_flag", "clear")
    ceiling = float(prefilter_result.get("confidence_ceiling", 1.0))
    hard_matches = prefilter_result.get("hard_exclude_matches") or []

    # Rule 5 (LLM failure check):
    if rec == "uncertain" and ("LLM screening failed" in reason_text or "[LLM-FAIL]" in reason_text or result.get("is_llm_failure")):
        conf = 0.0
        rec = "uncertain"
        note = "[LLM-FAIL]"
        if note not in reason_text:
            reason_text = f"{reason_text} {note}".strip()
        if note not in override_notes:
            override_notes.append(note)

    # Rule 1: Hard-exclude override
    elif prefilter_flag == "hard_exclude_hit" and hard_matches:
        term = hard_matches[0]
        note = f"[SAFETY-NET: Hard-exclude signal '{term}' matched]"
        if rec != "excluded":
            rec = "excluded"
        if note not in reason_text:
            reason_text = f"{reason_text} {note}".strip()
        if note not in override_notes:
            override_notes.append(note)

    # Rule 2: Weak-signals override (only if LLM says included)
    elif prefilter_flag == "weak_signals" and rec == "included":
        rec = "uncertain"
        note = "[SAFETY-NET: Zero population/intervention signals — downgraded to uncertain]"
        if note not in reason_text:
            reason_text = f"{reason_text} {note}".strip()
        if note not in override_notes:
            override_notes.append(note)

    # Rule 6: Full-text specific — no PDF text available
    if stage == "ft" and not pdf_text_available:
        ceiling = min(ceiling, 0.45)
        if rec == "included":
            rec = "uncertain"
        note = "[SAFETY-NET: Full-text screened from abstract only — no PDF text available]"
        if note not in reason_text:
            reason_text = f"{reason_text} {note}".strip()
        if note not in override_notes:
            override_notes.append(note)

    # Rule 3: Confidence ceiling capping
    if conf > ceiling:
        note = f"[SAFETY-NET: Confidence capped to {ceiling} due to {prefilter_flag}]"
        conf = round(ceiling, 2)
        if note not in reason_text:
            reason_text = f"{reason_text} {note}".strip()
        if note not in override_notes:
            override_notes.append(note)

    result["recommendation"] = rec
    result["confidence"] = conf
    result["reason_text"] = reason_text
    result["override_notes"] = override_notes
    result["prefilter_flag"] = prefilter_flag
    result["confidence_ceiling"] = ceiling

    return result
