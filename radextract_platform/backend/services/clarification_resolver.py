"""Clarification question resolver service.

When a human reviewer answers a mid-pipeline clarification question, this service
re-evaluates the study with the human's answer incorporated as additional context,
produces a definitive screening decision, updates the database, records the decision,
and flags conflicts against human reviews.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database import get_connection
from services.db_backend import SQLiteBackend
from services.llm_client import get_client, ToolCallingClient

RESOLUTION_PROMPT = """PICO Eligibility Criteria:
Population: {population}
Intervention/Index Test: {intervention}
Comparator: {comparator}
Outcome: {outcome}

Study:
Title: {title}
Abstract: {abstract}

Previous AI assessment:
- The AI was uncertain about: {question_type} ({pico_aspect})
- AI's question: {question_text}
- AI's interim reason: {interim_reason}

Human reviewer's answer: {answer_label}
{answer_freetext_section}

Based on the PICO criteria AND the human reviewer's clarification, make a definitive screening decision.
The human's answer resolves the specific ambiguity the AI identified. Use it to make a confident decision now.

Return JSON:
{{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.0-1.0,
  "reason": "Justification incorporating the human's answer",
  "reason_code": "short_snake_case_code_or_empty",
  "evidence_quote": "Verbatim sentence quote"
}}
"""


def resolve_clarification(
    question_id: str,
    answer: str,
    answer_label: str = "",
    answer_freetext: str = "",
    answered_by: str = "",
    db: Any = None,
    client: Optional[ToolCallingClient] = None,
) -> dict[str, Any]:
    """Resolve a pending clarification question with a human reviewer's answer."""
    from routers.screening import _check_and_record_conflict

    own_db = False
    if db is None:
        raw_conn = get_connection()
        db = SQLiteBackend(raw_conn)
        own_db = True

    try:
        q = db.execute("SELECT * FROM clarification_questions WHERE question_id = ?", (question_id,)).fetchone()
        if not q:
            raise KeyError(f"Clarification question '{question_id}' not found")

        q_dict = dict(q)
        if q_dict["status"] != "pending":
            raise ValueError(f"Clarification question '{question_id}' is already {q_dict['status']}")

        study_id = q_dict["study_id"]
        project_id = q_dict["project_id"]
        stage = q_dict["stage"] or "ta"

        # Load study
        study = db.execute("SELECT * FROM studies WHERE study_id = ?", (study_id,)).fetchone()
        if not study:
            raise KeyError(f"Study '{study_id}' not found")
        study_dict = dict(study)
        title = (study_dict.get("title") or "").strip()
        abstract = (study_dict.get("abstract") or "").strip()

        # Load project PICO
        project = db.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        pico = {}
        if project:
            proj_dict = dict(project)
            if proj_dict.get("pico_json"):
                try:
                    pico = json.loads(proj_dict["pico_json"])
                except Exception:
                    pico = {}

        # Parse options if answer_label is not provided
        if not answer_label and q_dict.get("options_json"):
            try:
                opts = json.loads(q_dict["options_json"])
                for opt in opts:
                    if opt.get("value") == answer:
                        answer_label = opt.get("label", answer)
                        break
            except Exception:
                pass
        if not answer_label:
            answer_label = answer

        # Format free-text section if provided
        freetext_section = ""
        if answer_freetext:
            freetext_section = f'Additional context from reviewer: "{answer_freetext}"'

        prompt = RESOLUTION_PROMPT.format(
            population=pico.get("population", "N/A"),
            intervention=pico.get("intervention", pico.get("index_test", "N/A")),
            comparator=pico.get("comparator", "N/A"),
            outcome=pico.get("outcome", pico.get("outcomes", "N/A")),
            title=title,
            abstract=abstract,
            question_type=q_dict.get("question_type", "study_design"),
            pico_aspect=q_dict.get("pico_aspect", "study_design"),
            question_text=q_dict.get("question_text", ""),
            interim_reason=q_dict.get("ai_interim_reason", ""),
            answer_label=answer_label,
            answer_freetext_section=freetext_section,
        )

        if client is None:
            client = get_client()

        raw = client.call_with_tool(
            tool_name="resolve_clarification",
            prompt=prompt,
            system_prompt="You are a clinical systematic review screening expert making a final decision after human clarification.",
            temperature=0.1,
            max_tokens=1024,
        )

        now_str = datetime.now(timezone.utc).isoformat()

        if not raw:
            final_decision = "uncertain"
            final_confidence = 0.0
            final_reason_text = "LLM resolution failed after human clarification"
            final_reason_code = "LLM_FAIL"
        else:
            decision_val = str(raw.get("decision", raw.get("status", "uncertain"))).lower().strip()
            if decision_val in ("include", "included"):
                final_decision = "included"
            elif decision_val in ("exclude", "excluded"):
                final_decision = "excluded"
            else:
                final_decision = "uncertain"

            final_confidence = float(raw.get("confidence", 0.85))
            final_reason_text = raw.get("reason", raw.get("reason_text", ""))
            final_reason_code = raw.get("reason_code", "")

        # 1. Update clarification_questions row
        db.execute(
            """
            UPDATE clarification_questions
            SET status = 'answered',
                answer = ?,
                answer_label = ?,
                answer_freetext = ?,
                answered_by = ?,
                answered_at = ?,
                final_decision = ?,
                final_confidence = ?,
                final_reason_text = ?,
                final_reason_code = ?
            WHERE question_id = ?
            """,
            (
                answer,
                answer_label,
                answer_freetext,
                answered_by,
                now_str,
                final_decision,
                final_confidence,
                final_reason_text,
                final_reason_code,
                question_id,
            ),
        )

        # 2. Record screening_decisions row as ai_reviewer
        clarified_reason = f"{final_reason_text} [CLARIFIED BY HUMAN: {answer_label}]".strip()
        decision_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO screening_decisions (
                decision_id, study_id, project_id, reviewer_id, reviewer_name,
                decision, reason_code, reason_text, stage, is_blinded, created_at
            ) VALUES (?, ?, ?, 'ai_reviewer', 'AI Screening Assistant', ?, ?, ?, ?, 1, ?)
            """,
            (
                decision_id,
                study_id,
                project_id,
                final_decision,
                final_reason_code,
                clarified_reason,
                stage,
                now_str,
            ),
        )

        # 3. Update study screening_status
        db.execute(
            "UPDATE studies SET screening_status = ?, screening_reason = ? WHERE study_id = ?",
            (final_decision, clarified_reason, study_id),
        )

        # 4. Check for conflicts against human decisions
        conflict_detected = _check_and_record_conflict(
            conn=db,
            study_id=study_id,
            project_id=project_id,
            stage=stage,
            latest_decision=final_decision,
            reason_text=clarified_reason,
        )
        human_row = db.execute(
            "SELECT decision FROM screening_decisions WHERE study_id = ? AND reviewer_id != 'ai_reviewer' AND stage = ? ORDER BY created_at DESC",
            (study_id, stage),
        ).fetchone()
        human_decision = human_row["decision"] if human_row else None

        if hasattr(db, "commit"):
            db.commit()

        return {
            "question_id": question_id,
            "study_id": study_id,
            "status": "answered",
            "final_decision": final_decision,
            "final_confidence": final_confidence,
            "final_reason_text": final_reason_text,
            "conflict_detected": bool(conflict_detected),
            "human_decision": human_decision,
        }
    finally:
        if own_db and hasattr(db, "close"):
            db.close()
