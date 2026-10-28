"""Deterministic criteria matching against study title + abstract (Stage C, v1).

No LLM in this path. Every result is reproducible from the stored criteria and
the study text: same input -> same statuses, same score, always.

Statuses are exactly one of:
  - "matched"             : criterion text found in the study
  - "not_matched"         : criterion text absent
  - "needs_clarification" : partial evidence (token coverage >= 0.5) — flagged
                            for human review, never silently resolved

The computed score is DISPLAY ONLY: it sorts and explains, it never writes a
screening decision. AI proposes; the human decides.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from database import get_db_backend
from services.db_backend import DBBackend

# Statuses (exactly three — there is no "maybe")
MATCHED = "matched"
NOT_MATCHED = "not_matched"
NEEDS_CLARIFICATION = "needs_clarification"

# Token coverage at or above this (with >= 2 significant tokens) is flagged
# for clarification instead of being called not-matched.
CLARIFICATION_COVERAGE = 0.5

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
    "from", "has", "have", "in", "into", "is", "it", "its", "of", "on", "or",
    "our", "per", "shall", "should", "studies", "study", "than", "that", "the",
    "their", "then", "there", "these", "this", "those", "to", "was", "were",
    "which", "will", "with", "would", "we", "must", "may", "only", "also",
    "any", "all", "not", "no", "who", "whom", "whose", "reported", "report",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def normalize_text(text: str) -> str:
    """Lowercase and collapse whitespace — same normalization style as the extractor."""
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _significant_tokens(text: str) -> List[str]:
    """Deduplicated significant tokens, in order of first appearance."""
    seen: List[str] = []
    for tok in _TOKEN_RE.findall(normalize_text(text)):
        if len(tok) < 3 or tok in _STOPWORDS:
            continue
        if tok not in seen:
            seen.append(tok)
    return seen


def _sentences(text: str) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _quoted_phrases(criterion_text: str) -> List[str]:
    return [q.strip().lower() for q in re.findall(r'"([^"]+)"', criterion_text or "") if q.strip()]


def _find_snippet(norm_study: str, sentences: List[str], needles: List[str]) -> str:
    """First sentence containing any needle, as provenance. Truncated for display."""
    for sent in sentences:
        norm_sent = normalize_text(sent)
        if any(needle in norm_sent for needle in needles):
            snippet = sent.strip()
            return snippet[:200]
    return ""


def match_criterion(criterion_text: str, study_text: str) -> tuple:
    """Match one criterion against study text.

    Returns (status, snippet). Deterministic: same inputs -> same output.
    """
    norm_study = normalize_text(study_text)
    if not normalize_text(criterion_text) or not norm_study:
        return (NOT_MATCHED, "")

    sentences = _sentences(study_text)

    # 1. Quoted phrases in the criterion are matched verbatim.
    quotes = _quoted_phrases(criterion_text)
    if quotes:
        found = [q for q in quotes if q in norm_study]
        if found:
            return (MATCHED, _find_snippet(norm_study, sentences, found))
        # Quoted phrases are authoritative: absent quote -> not matched.
        return (NOT_MATCHED, "")

    # 2. Token coverage over significant (non-stopword) tokens.
    tokens = _significant_tokens(criterion_text)
    if not tokens:
        return (NOT_MATCHED, "")
    present = [t for t in tokens if t in norm_study]
    coverage = len(present) / len(tokens)

    if coverage == 1.0:
        return (MATCHED, _find_snippet(norm_study, sentences, present))
    if coverage >= CLARIFICATION_COVERAGE and len(tokens) >= 2:
        return (NEEDS_CLARIFICATION, _find_snippet(norm_study, sentences, present))
    return (NOT_MATCHED, "")


def _is_required(rule_mode: str) -> bool:
    """Both spellings map to a strict eligibility rule."""
    return (rule_mode or "").lower() in ("required", "strict")


def compute_score(per_results: List[Dict[str, Any]]) -> float:
    """Weighted criteria score, 0.00-1.00. DISPLAY ONLY — never a decision.

    score = (sum of matched weighted-inclusion weights
             - sum of matched weighted-exclusion weights, floored at 0)
            / sum of ALL weighted-inclusion weights

    Denominator 0 (no weighted inclusion criteria) -> 0.0. Rounded to 2 decimals.
    """
    denominator = sum(
        float(r.get("weight", 0.0))
        for r in per_results
        if r.get("side") == "inclusion"
        and not _is_required(r.get("rule_mode", ""))
    )
    if denominator <= 0:
        return 0.0
    numerator = 0.0
    for r in per_results:
        if _is_required(r.get("rule_mode", "")):
            continue  # required rules produce flags, not score contributions
        if r.get("status") != MATCHED:
            continue
        w = float(r.get("weight", 0.0))
        if r.get("side") == "inclusion":
            numerator += w
        elif r.get("side") == "exclusion":
            numerator -= w
    score = max(0.0, numerator) / denominator
    return round(score, 2)


def _evaluate_study(study: Dict[str, Any], criteria: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Core evaluation of one study against a list of criterion dicts."""
    study_text = " ".join(
        (study.get("title") or "", study.get("abstract") or "")
    ).strip()

    results: List[Dict[str, Any]] = []
    flags: List[Dict[str, Any]] = []
    for c in criteria:
        status, snippet = match_criterion(c.get("text", ""), study_text)
        side = c.get("direction") or c.get("side") or "inclusion"
        rule_mode = c.get("rule_mode", "required")
        entry = {
            "criterion_id": c.get("id", ""),
            "text": c.get("text", ""),
            "side": side,
            "rule_mode": rule_mode,
            "weight": float(c.get("weight", 0.5)),
            "status": status,
            "snippet": snippet,
        }
        results.append(entry)

        if _is_required(rule_mode):
            if side == "exclusion" and status == MATCHED:
                flags.append({
                    "type": "excluded_by_required_rule",
                    "criterion_id": entry["criterion_id"],
                    "criterion": entry["text"],
                    "snippet": snippet,
                    "message": f"excluded by required rule \"{entry['text']}\"",
                })
            elif side == "inclusion" and status == NOT_MATCHED:
                flags.append({
                    "type": "missing_required_criterion",
                    "criterion_id": entry["criterion_id"],
                    "criterion": entry["text"],
                    "snippet": "",
                    "message": f"missing required criterion \"{entry['text']}\"",
                })

    weighted_results = [r for r in results if not _is_required(r["rule_mode"])]
    weighted_matched = sum(1 for r in weighted_results if r["status"] == MATCHED)

    return {
        "results": results,
        "flags": flags,
        "score": compute_score(results),
        "weighted_matched": weighted_matched,
        "weighted_total": len(weighted_results),
        "required_flagged": len(flags),
    }


def _load_criteria(conn: DBBackend, project_id: str) -> List[Dict[str, Any]]:
    row = conn.execute(
        "SELECT inclusion_criteria_json, exclusion_criteria_json FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        raise ValueError(f"Project {project_id} not found")

    criteria: List[Dict[str, Any]] = []
    for column, side in (("inclusion_criteria_json", "inclusion"),
                         ("exclusion_criteria_json", "exclusion")):
        raw = row[column] if column in row.keys() else None
        try:
            items = json.loads(raw) if raw else []
        except (json.JSONDecodeError, TypeError):
            items = []
        for item in items:
            if isinstance(item, str):
                # Plain-string criteria (extraction-level) default to required rules.
                criteria.append({"id": f"{side}-{len(criteria)}", "text": item,
                                 "direction": side, "rule_mode": "required", "weight": 0.5})
            elif isinstance(item, dict):
                c = dict(item)
                c.setdefault("direction", side)
                c.setdefault("rule_mode", "required")
                c.setdefault("weight", 0.5)
                criteria.append(c)
    return criteria


def _load_study(conn: DBBackend, project_id: str, study_id: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT study_id, title, abstract FROM studies WHERE study_id = ? AND project_id = ?",
        (study_id, project_id),
    ).fetchone()
    if not row:
        raise ValueError(f"Study {study_id} not found in project {project_id}")
    return {"study_id": row["study_id"], "title": row["title"] or "",
            "abstract": row["abstract"] or ""}


def evaluate_criteria(project_id: str, study_id: str, conn: Optional[DBBackend] = None) -> Dict[str, Any]:
    """Evaluate every criterion for one study. Deterministic, no LLM."""
    db = conn or get_db_backend()
    criteria = _load_criteria(db, project_id)
    study = _load_study(db, project_id, study_id)
    result = _evaluate_study(study, criteria)
    result["project_id"] = project_id
    result["study_id"] = study_id
    return result


def evaluate_project(project_id: str, conn: Optional[DBBackend] = None) -> List[Dict[str, Any]]:
    """Batch evaluation of every study in a project (for table sorting)."""
    db = conn or get_db_backend()
    criteria = _load_criteria(db, project_id)
    rows = db.execute(
        "SELECT study_id, title, abstract FROM studies WHERE project_id = ? ORDER BY created_at",
        (project_id,),
    ).fetchall()
    out = []
    for row in rows:
        study = {"study_id": row["study_id"], "title": row["title"] or "",
                 "abstract": row["abstract"] or ""}
        result = _evaluate_study(study, criteria)
        result["project_id"] = project_id
        result["study_id"] = row["study_id"]
        out.append(result)
    return out


def preview_criteria_change(
    project_id: str,
    proposed: Dict[str, List[Dict[str, Any]]],
    conn: Optional[DBBackend] = None,
) -> Dict[str, Any]:
    """Dry-run: how many studies' flags/scores would change under proposed criteria?

    Mutates nothing. Returns per-study current/proposed score + flags added/removed.
    """
    db = conn or get_db_backend()

    def _as_dicts(items: List[Any], side: str) -> List[Dict[str, Any]]:
        out = []
        for i, item in enumerate(items):
            if isinstance(item, str):
                out.append({"id": f"{side}-{i}", "text": item, "direction": side,
                            "rule_mode": "required", "weight": 0.5})
            elif isinstance(item, dict):
                c = dict(item)
                c.setdefault("direction", side)
                c.setdefault("rule_mode", "required")
                c.setdefault("weight", 0.5)
                out.append(c)
        return out

    proposed_criteria = (
        _as_dicts(proposed.get("inclusion", []), "inclusion")
        + _as_dicts(proposed.get("exclusion", []), "exclusion")
    )
    current_criteria = _load_criteria(db, project_id)

    rows = db.execute(
        "SELECT study_id, title, abstract FROM studies WHERE project_id = ? ORDER BY created_at",
        (project_id,),
    ).fetchall()

    affected: List[Dict[str, Any]] = []
    for row in rows:
        study = {"study_id": row["study_id"], "title": row["title"] or "",
                 "abstract": row["abstract"] or ""}
        current = _evaluate_study(study, current_criteria)
        after = _evaluate_study(study, proposed_criteria)
        changed = (
            current["score"] != after["score"]
            or {f["message"] for f in current["flags"]} != {f["message"] for f in after["flags"]}
        )
        if changed:
            affected.append({
                "study_id": row["study_id"],
                "title": study["title"],
                "current_score": current["score"],
                "proposed_score": after["score"],
                "flags_added": [f["message"] for f in after["flags"]
                                if f["message"] not in {g["message"] for g in current["flags"]}],
                "flags_removed": [f["message"] for f in current["flags"]
                                  if f["message"] not in {g["message"] for g in after["flags"]}],
            })

    return {
        "project_id": project_id,
        "studies_evaluated": len(rows),
        "studies_affected": len(affected),
        "affected": affected,
    }
