"""Evidence-grounded, per-study selection of an appraisal instrument."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from services.db_backend import DBBackend
from services.rob_tools import get_tool, select_rob_tool_with_alternatives

logger = logging.getLogger("radextract.rob.classification")

ALLOWED_TOOLS = {
    "rob2", "robins_i", "robins_e", "quadas2", "nos",
    "jbi_case_report", "jbi_case_series", "manual",
}


def _document_text(study: dict, pdf_data: Optional[dict]) -> str:
    full_text = str((pdf_data or {}).get("full_text") or "")
    if len(full_text.strip()) > 100:
        return full_text
    pages = (pdf_data or {}).get("pages") or []
    page_text = "\n\n".join(str(p.get("text") or "") for p in pages if isinstance(p, dict))
    if len(page_text.strip()) > 100:
        return page_text
    return "\n\n".join(
        str(study.get(key) or "") for key in ("title", "study_design", "abstract")
    )


def _heuristic_classification(study: dict, text: str) -> dict[str, Any]:
    declared = str(study.get("study_design") or "").strip()
    sample = f"{declared}\n{text[:12000]}".lower()

    # Prefer explicit article statements over generic project-level labels.
    design = declared
    patterns = [
        ("jbi_case_report", 0.96, ["case report", "a case of", "single patient"]),
        ("jbi_case_series", 0.94, ["case series", "clinical series"]),
        ("quadas2", 0.94, ["diagnostic accuracy", "sensitivity and specificity", "index test"]),
        ("rob2", 0.96, ["randomized controlled trial", "randomised controlled trial", "random allocation"]),
        ("robins_i", 0.90, ["non-randomized intervention", "non-randomised intervention", "quasi-experimental"]),
        ("robins_e", 0.88, ["exposure study", "environmental exposure", "occupational exposure", "etiology"]),
        ("nos", 0.82, ["prospective cohort", "retrospective cohort", "case-control", "observational cohort"]),
    ]

    matched_evidence = []
    for tool, confidence, phrases in patterns:
        phrase = next((p for p in phrases if p in sample), "")
        if phrase:
            matched_evidence.append((tool, confidence, phrase))

    # Ambiguity: Multiple distinct designs found in document (§1.3)
    if len(matched_evidence) > 1:
        top_tool, _, top_phrase = matched_evidence[0]
        other_tools = [m[0] for m in matched_evidence[1:]]
        all_alts = other_tools + [t for t in ALLOWED_TOOLS if t not in other_tools and t != top_tool and t != "manual"]
        return {
            "study_design": design or top_phrase,
            "tool": top_tool,
            "confidence": 0.55,
            "alternatives": all_alts,
            "rationale": f"Ambiguous study design signals: matches multiple patterns ({', '.join(f'{m[0]}: {m[2]}' for m in matched_evidence)}).",
            "evidence": [m[2] for m in matched_evidence],
            "model_name": "deterministic-evidence-v1",
        }

    if len(matched_evidence) == 1:
        tool, confidence, phrase = matched_evidence[0]
        alternatives = {
            "jbi_case_report": ["jbi_case_series"],
            "jbi_case_series": ["jbi_case_report", "nos"],
            "quadas2": ["robins_i"],
            "rob2": ["robins_i"],
            "robins_i": ["nos", "robins_e"],
            "robins_e": ["nos", "robins_i"],
            "nos": ["robins_i", "robins_e"],
        }.get(tool, ["robins_i", "rob2"])
        return {
            "study_design": design or phrase,
            "tool": tool,
            "confidence": confidence,
            "alternatives": alternatives,
            "rationale": f"Document evidence contains the design signal '{phrase}'.",
            "evidence": [phrase],
            "model_name": "deterministic-evidence-v1",
        }

    tool, confidence, alternatives = select_rob_tool_with_alternatives(declared)
    return {
        "study_design": declared,
        "tool": tool,
        "confidence": confidence,
        "alternatives": alternatives,
        "rationale": (
            f"Selected from the stored study design '{declared}'."
            if declared else "No sufficiently specific study-design evidence was found."
        ),
        "evidence": [declared] if declared else [],
        "model_name": "deterministic-evidence-v1",
    }


def _llm_classification(
    study: dict,
    text: str,
    model_fn: Callable[[str], Any],
    candidate_tools: Optional[list[str]] = None,
) -> Optional[dict]:
    allowed_list = candidate_tools or list(ALLOWED_TOOLS)
    tool_descriptions = "\n".join(
        f"- {t}: { { 'rob2': 'randomized intervention trials', 'robins_i': 'non-randomized studies of interventions', 'robins_e': 'causal studies of exposures', 'quadas2': 'diagnostic accuracy studies', 'nos': 'eligible cohort or case-control quality assessment', 'jbi_case_report': 'one clinical case', 'jbi_case_series': 'descriptive case series', 'manual': 'insufficient or conflicting evidence' }.get(t, t) }"
        for t in allowed_list
    )
    prompt = f"""Select exactly one appraisal tool for this study.

Candidate tools:
{tool_descriptions}

Stored design: {study.get('study_design', '')}
Title: {study.get('title', '')}
Article text:
{text[:24000]}

Return JSON with keys: "tool", "study_design", "confidence" (0.0 to 1.0), "alternatives" (list), "rationale", "evidence" (list of short verbatim quotes).
Do not infer a tool from clinical topic alone."""
    raw = model_fn(prompt)
    if not isinstance(raw, dict):
        return None
    tool = str(raw.get("tool") or "manual")
    if tool not in ALLOWED_TOOLS:
        return None
    try:
        confidence = max(0.0, min(1.0, float(raw.get("confidence", 0.0))))
    except (TypeError, ValueError):
        confidence = 0.0
    evidence = [
        str(q).strip() for q in (raw.get("evidence") or [])
        if str(q).strip() and str(q).strip().lower() in text.lower()
    ]
    # A confident automatic assignment must be grounded in the parsed document.
    if tool != "manual" and confidence >= 0.7 and not evidence:
        confidence = 0.5
    return {
        "study_design": str(raw.get("study_design") or study.get("study_design") or ""),
        "tool": tool,
        "confidence": confidence,
        "alternatives": [str(v) for v in (raw.get("alternatives") or []) if str(v) in ALLOWED_TOOLS],
        "rationale": str(raw.get("rationale") or ""),
        "evidence": evidence,
        "model_name": "configured-llm",
    }


def classify_study(
    study: dict,
    pdf_data: Optional[dict],
    threshold: float = 0.7,
    model_fn: Optional[Callable[[str], Any]] = None,
    use_llm: bool = True,
) -> dict[str, Any]:
    """Classify one study, resolving ambiguous designs via LLM fallback or routing to manual review (§1.3)."""
    text = _document_text(study, pdf_data)

    # 1. Deterministic heuristic classification
    heuristic_res = _heuristic_classification(study, text)

    # If heuristic is decisive and confident, accept immediately
    if heuristic_res["confidence"] >= threshold and heuristic_res["tool"] != "manual":
        heuristic_res["status"] = "assigned"
        return heuristic_res

    # 2. If ambiguous or below threshold, try LLM fallback
    resolved_model_fn = model_fn
    if resolved_model_fn is None and use_llm:
        try:
            from services.llm_extractor import is_llm_available
            if is_llm_available():
                from services.llm_client import get_client
                resolved_model_fn = get_client().as_model_fn("classify_rob_tool")
        except Exception as e:
            logger.debug(f"LLM client unavailable for rob classification: {e}")
            resolved_model_fn = None

    if resolved_model_fn:
        try:
            candidate_tools = [heuristic_res["tool"]] + [a for a in heuristic_res.get("alternatives", []) if a in ALLOWED_TOOLS]
            llm_res = _llm_classification(study, text, resolved_model_fn, candidate_tools=candidate_tools)
            if llm_res and llm_res.get("tool") in ALLOWED_TOOLS:
                assigned = llm_res["tool"] != "manual" and llm_res["confidence"] >= threshold
                llm_res["status"] = "assigned" if assigned else "manual_review"
                if not assigned:
                    if llm_res["tool"] != "manual" and llm_res["tool"] not in llm_res["alternatives"]:
                        llm_res["alternatives"] = [llm_res["tool"], *llm_res["alternatives"]]
                    llm_res["tool"] = "manual"
                return llm_res
        except Exception as e:
            logger.warning(f"LLM fallback classification failed: {e}")

    # 3. Fallback to heuristic result (routed to manual_review)
    assigned = heuristic_res["tool"] != "manual" and heuristic_res["confidence"] >= threshold
    heuristic_res["status"] = "assigned" if assigned else "manual_review"
    if not assigned:
        if heuristic_res["tool"] != "manual" and heuristic_res["tool"] not in heuristic_res["alternatives"]:
            heuristic_res["alternatives"] = [heuristic_res["tool"], *heuristic_res["alternatives"]]
        heuristic_res["tool"] = "manual"
    return heuristic_res


def persist_classification(
    db: DBBackend,
    study_id: str,
    project_id: str,
    result: dict[str, Any],
) -> dict:
    """Upsert the latest classification for a study."""
    existing = db.query("rob_tool_classifications", {"study_id": study_id})
    payload = {
        "study_id": study_id,
        "project_id": project_id,
        "study_design": result.get("study_design", ""),
        "selected_tool": result.get("tool", "manual"),
        "confidence": float(result.get("confidence", 0.0) or 0.0),
        "alternatives_json": json.dumps(result.get("alternatives", [])),
        "rationale": result.get("rationale", ""),
        "evidence_json": json.dumps(result.get("evidence", [])),
        "status": result.get("status", "manual_review"),
        "model_name": result.get("model_name", ""),
        "classified_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        classification_id = existing[0]["classification_id"]
        db.update("rob_tool_classifications", classification_id, payload)
    else:
        classification_id = str(uuid.uuid4())
        db.insert("rob_tool_classifications", {"classification_id": classification_id, **payload})
    db.commit()
    return {"classification_id": classification_id, **payload}


def decode_classification(row: dict) -> dict:
    item = dict(row)
    for source, target in (("alternatives_json", "alternatives"), ("evidence_json", "evidence")):
        try:
            item[target] = json.loads(item.get(source) or "[]")
        except (TypeError, json.JSONDecodeError):
            item[target] = []
    return item
