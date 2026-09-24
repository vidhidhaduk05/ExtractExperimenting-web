"""Multi-Stage AI Screening Pipeline.

Orchestrates sequential AI screening:
Stage 1: Title screening
Stage 2: Abstract screening (for uncertain/pending studies from Stage 1)
Stage 3: Full-text screening (for ta_included studies with PDFs; pauses at awaiting_pdf if no PDF)
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from database import get_connection
from services.db_backend import DBBackend, SQLiteBackend
from services import screening_progress as progress
from services.llm_client import get_client, ToolCallingClient
from services.llm_extractor import (
    screen_title_only_with_llm,
    screen_title_abstract_with_llm,
    screen_fulltext_with_llm,
)


class AIScreeningPipeline:
    """Runs multi-stage AI screening: title -> abstract -> full-text."""

    def _get_project_pico_and_exclusions(self, project_id: str, conn: Any) -> tuple[dict, list[str]]:
        """Load PICO criteria and exclusion reason labels for a project."""
        row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        if not row:
            return {}, []
        proj = dict(row)
        pico = {}
        if proj.get("pico_json"):
            try:
                pico = json.loads(proj["pico_json"])
            except Exception:
                pico = {}

        exclusions = []
        if proj.get("exclusion_reasons_json"):
            try:
                reasons_data = json.loads(proj["exclusion_reasons_json"])
                for r in reasons_data:
                    if isinstance(r, dict) and "label" in r:
                        exclusions.append(r["label"])
                    elif isinstance(r, str):
                        exclusions.append(r)
            except Exception:
                pass
        return pico, exclusions

    def run_full_pipeline(
        self,
        project_id: str,
        conn: Any,
        client: Optional[ToolCallingClient] = None,
    ) -> dict[str, Any]:
        """Run all screening stages sequentially. Returns summary dict."""
        if client is None:
            client = get_client()

        # Stage 1: Title screening on pending studies
        title_results = self.run_title_screening(project_id, conn, client=client)

        # Stage 2: Abstract screening on uncertain/pending studies
        abstract_results = self.run_abstract_screening(project_id, conn, client=client)

        # Stage 3: Full-text screening on ta_included studies
        ft_results = self.run_fulltext_screening(project_id, conn, client=client)

        return self.get_pipeline_summary(project_id, conn, title_count=len(title_results), abstract_count=len(abstract_results), ft_count=len(ft_results))

    def run_title_screening(
        self,
        project_id: str,
        conn: Any,
        client: Optional[ToolCallingClient] = None,
    ) -> list[dict[str, Any]]:
        """Screen all pending studies in project by title only."""
        if client is None:
            client = get_client()

        pico, exclusions = self._get_project_pico_and_exclusions(project_id, conn)

        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'pending'",
            (project_id,),
        ).fetchall()
        progress.start(project_id, "title", [dict(r)["study_id"] for r in studies])

        results: list[dict[str, Any]] = []
        now_str = datetime.now(timezone.utc).isoformat()

        for s_row in studies:
            s = dict(s_row)
            study_id = s["study_id"]
            progress.set_current(project_id, study_id, s.get("title") or "")
            title = (s.get("title") or "").strip()

            res = screen_title_only_with_llm(
                title=title,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
            )

            decision = res.get("decision", "uncertain")
            confidence = float(res.get("confidence", 0.0))
            reason = res.get("reason_text") or res.get("reason") or ""
            reason_code = res.get("reason_code", "")

            # If confident include (>= 0.80) -> ta_included
            # If confident exclude (>= 0.80) -> excluded
            # If uncertain -> stays pending for abstract stage, but record ai_decision
            if decision == "include" and confidence >= 0.80:
                new_status = "ta_included"
                new_stage = "ta"
            elif decision == "exclude" and confidence >= 0.80:
                new_status = "excluded"
                new_stage = "ta"
            else:
                decision = "uncertain"
                new_status = "pending"
                new_stage = "ta"

            # Update study row
            conn.execute(
                """UPDATE studies SET
                   ai_confidence = ?,
                   ai_decision = ?,
                   ai_reason = ?,
                   ai_reason_code = ?,
                   ai_screened_at = ?,
                   ai_stage = 'title',
                   screening_status = ?,
                   screening_stage = ?,
                   screening_reason = ?
                   WHERE study_id = ?""",
                (
                    confidence,
                    decision,
                    reason,
                    reason_code,
                    now_str,
                    new_status,
                    new_stage,
                    reason,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ta', 0, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status if new_status in ("ta_included", "excluded") else "uncertain",
                    reason_code,
                    reason,
                    now_str,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "title",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
            })

            # Persist each study as soon as it is screened so progress is visible immediately
            # and an interrupted run keeps the studies already done.
            if hasattr(conn, "commit"):
                conn.commit()
            progress.mark_done(project_id, study_id)

        if hasattr(conn, "commit"):
            conn.commit()

        return results

    def run_abstract_screening(
        self,
        project_id: str,
        conn: Any,
        client: Optional[ToolCallingClient] = None,
    ) -> list[dict[str, Any]]:
        """Screen pending/uncertain studies with abstract."""
        if client is None:
            client = get_client()

        pico, exclusions = self._get_project_pico_and_exclusions(project_id, conn)

        # Studies to screen: pending or uncertain
        studies = conn.execute(
            """SELECT * FROM studies
               WHERE project_id = ?
               AND (screening_status = 'pending' OR (screening_status = 'uncertain' AND screening_stage = 'ta'))""",
            (project_id,),
        ).fetchall()
        progress.start(project_id, "abstract", [dict(r)["study_id"] for r in studies])

        results: list[dict[str, Any]] = []
        now_str = datetime.now(timezone.utc).isoformat()

        for s_row in studies:
            s = dict(s_row)
            study_id = s["study_id"]
            progress.set_current(project_id, study_id, s.get("title") or "")
            title = (s.get("title") or "").strip()
            abstract = (s.get("abstract") or "").strip()

            res = screen_title_abstract_with_llm(
                title=title,
                abstract=abstract,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
            )

            decision = res.get("decision", "uncertain")
            confidence = float(res.get("confidence", 0.0))
            reason = res.get("reason_text") or res.get("reason") or ""
            reason_code = res.get("reason_code", "")
            needs_clarification = res.get("needs_clarification", False)

            if needs_clarification and res.get("clarification_question"):
                new_status = "awaiting_clarification"
                new_stage = "ta"
                q_id = str(uuid.uuid4())
                raw_opts = res.get("clarification_options") or [
                    {"label": "Yes", "value": "yes"},
                    {"label": "No", "value": "no"},
                ]
                opts_json = json.dumps(raw_opts)

                conn.execute(
                    """INSERT INTO clarification_questions (
                       question_id, study_id, project_id, stage, question_type,
                       question_text, options_json, context_excerpt, pico_aspect,
                       ai_interim_decision, ai_interim_confidence, ai_interim_reason,
                       status, created_at
                    ) VALUES (?, ?, ?, 'ta', ?, ?, ?, ?, ?, 'uncertain', ?, ?, 'pending', ?)""",
                    (
                        q_id,
                        study_id,
                        project_id,
                        res.get("clarification_type", "study_design"),
                        res.get("clarification_question", ""),
                        opts_json,
                        abstract[:250] if abstract else title,
                        res.get("clarification_type", "study_design"),
                        confidence,
                        reason,
                        now_str,
                    ),
                )
            elif decision in ("include", "included") and confidence >= 0.60:
                new_status = "ta_included"
                new_stage = "ta"
            elif decision in ("exclude", "excluded") and confidence >= 0.60:
                new_status = "excluded"
                new_stage = "ta"
            else:
                decision = "uncertain"
                new_status = "uncertain"
                new_stage = "ta"

            # Update study row
            conn.execute(
                """UPDATE studies SET
                   ai_confidence = ?,
                   ai_decision = ?,
                   ai_reason = ?,
                   ai_reason_code = ?,
                   ai_screened_at = ?,
                   ai_stage = 'abstract',
                   screening_status = ?,
                   screening_stage = ?,
                   screening_reason = ?
                   WHERE study_id = ?""",
                (
                    confidence,
                    decision,
                    reason,
                    reason_code,
                    now_str,
                    new_status,
                    new_stage,
                    reason,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ta', 0, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status if new_status in ("ta_included", "excluded") else "uncertain",
                    reason_code,
                    reason,
                    now_str,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "abstract",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
            })

            # Persist each study as soon as it is screened so progress is visible immediately
            # and an interrupted run keeps the studies already done.
            if hasattr(conn, "commit"):
                conn.commit()
            progress.mark_done(project_id, study_id)

        if hasattr(conn, "commit"):
            conn.commit()

        return results

    def run_fulltext_screening(
        self,
        project_id: str,
        conn: Any,
        client: Optional[ToolCallingClient] = None,
    ) -> list[dict[str, Any]]:
        """Screen ta_included studies by full text."""
        if client is None:
            client = get_client()

        pico, exclusions = self._get_project_pico_and_exclusions(project_id, conn)

        studies = conn.execute(
            """SELECT * FROM studies
               WHERE project_id = ? AND screening_status = 'ta_included'""",
            (project_id,),
        ).fetchall()
        progress.start(project_id, "fulltext", [dict(r)["study_id"] for r in studies])

        results: list[dict[str, Any]] = []
        now_str = datetime.now(timezone.utc).isoformat()

        for s_row in studies:
            s = dict(s_row)
            study_id = s["study_id"]
            progress.set_current(project_id, study_id, s.get("title") or "")
            pdf_path = (s.get("pdf_path") or "").strip()

            # Check if PDF text exists in pdf_documents table
            pdf_doc = conn.execute(
                "SELECT * FROM pdf_documents WHERE study_id = ?",
                (study_id,),
            ).fetchone()

            full_text = ""
            if pdf_doc:
                full_text = (dict(pdf_doc).get("full_text") or "").strip()

            if not full_text and not pdf_path:
                # No PDF uploaded -> pause at awaiting_pdf
                conn.execute(
                    """UPDATE studies SET
                       screening_status = 'awaiting_pdf',
                       screening_stage = 'ft',
                       screening_reason = 'Awaiting PDF upload for full-text screening'
                       WHERE study_id = ?""",
                    (study_id,),
                )
                results.append({
                    "study_id": study_id,
                    "stage": "fulltext",
                    "decision": "awaiting_pdf",
                    "screening_status": "awaiting_pdf",
                    "confidence": 0.0,
                    "reason": "Awaiting PDF upload",
                })
                progress.mark_done(project_id, study_id)
                continue

            # Full text screening with LLM
            study_text = full_text or s.get("abstract") or s.get("title") or ""
            res = screen_fulltext_with_llm(
                study_text=study_text,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
            )

            decision = res.get("decision", "uncertain")
            confidence = float(res.get("confidence", 0.0))
            reason = res.get("reason_text") or res.get("reason") or ""
            reason_code = res.get("reason_code", "")

            if decision in ("include", "included") and confidence >= 0.60:
                new_status = "included"
                new_stage = "ft"
            elif decision in ("exclude", "excluded") and confidence >= 0.60:
                new_status = "excluded"
                new_stage = "ft"
            else:
                decision = "uncertain"
                new_status = "uncertain"
                new_stage = "ft"

            # Update study row
            conn.execute(
                """UPDATE studies SET
                   ai_confidence = ?,
                   ai_decision = ?,
                   ai_reason = ?,
                   ai_reason_code = ?,
                   ai_screened_at = ?,
                   ai_stage = 'fulltext',
                   screening_status = ?,
                   screening_stage = ?,
                   screening_reason = ?
                   WHERE study_id = ?""",
                (
                    confidence,
                    decision,
                    reason,
                    reason_code,
                    now_str,
                    new_status,
                    new_stage,
                    reason,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ft', 0, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status,
                    reason_code,
                    reason,
                    now_str,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "fulltext",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
            })

            # Persist each study as soon as it is screened so progress is visible immediately
            # and an interrupted run keeps the studies already done.
            if hasattr(conn, "commit"):
                conn.commit()
            progress.mark_done(project_id, study_id)

        if hasattr(conn, "commit"):
            conn.commit()

        return results

    def get_pipeline_summary(
        self,
        project_id: str,
        conn: Any,
        title_count: int = 0,
        abstract_count: int = 0,
        ft_count: int = 0,
    ) -> dict[str, Any]:
        """Build summary of screening status and counts for project."""
        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ?",
            (project_id,),
        ).fetchall()

        total = len(studies)
        included = 0
        excluded = 0
        uncertain = 0
        awaiting_clarification = 0
        awaiting_pdf = 0

        for s_row in studies:
            s = dict(s_row)
            st = s.get("screening_status", "pending")
            if st in ("included", "ta_included"):
                included += 1
            elif st == "excluded":
                excluded += 1
            elif st == "uncertain":
                uncertain += 1
            elif st == "awaiting_clarification":
                awaiting_clarification += 1
            elif st == "awaiting_pdf":
                awaiting_pdf += 1

        return {
            "total": total,
            "title_screened": title_count,
            "abstract_screened": abstract_count,
            "fulltext_screened": ft_count,
            "included": included,
            "excluded": excluded,
            "uncertain": uncertain,
            "awaiting_clarification": awaiting_clarification,
            "awaiting_pdf": awaiting_pdf,
        }
