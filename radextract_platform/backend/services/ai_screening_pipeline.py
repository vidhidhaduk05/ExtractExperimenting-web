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
from services.screening_confidence import (
    PassResult,
    score_record,
    decide,
    get_calibration,
    is_sampled_for_audit,
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
        inclusion = []
        if proj.get("inclusion_criteria_json"):
            try:
                inclusion_data = json.loads(proj["inclusion_criteria_json"])
                for item in inclusion_data:
                    if isinstance(item, dict) and item.get("text"):
                        inclusion.append(item["text"])
                    elif isinstance(item, str):
                        inclusion.append(item)
            except Exception:
                pass
        if inclusion:
            pico = dict(pico)
            pico["inclusion_criteria"] = inclusion

        search_str = ""
        if proj.get("search_strings_json"):
            try:
                s_dict = json.loads(proj["search_strings_json"])
                if isinstance(s_dict, dict):
                    search_str = s_dict.get("pubmed") or s_dict.get("default") or next(iter(s_dict.values()), "")
                elif isinstance(s_dict, str):
                    search_str = s_dict
            except Exception:
                search_str = ""
        if search_str:
            pico = dict(pico)
            pico["search_string"] = search_str

        return pico, exclusions

    def _requires_human_confirmation(self, project_id: str, conn: Any) -> bool:
        """Check whether human confirmation is required for AI screening decisions."""
        row = conn.execute("SELECT screening_config_json FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        if not row or not row["screening_config_json"]:
            return False
        try:
            cfg = json.loads(row["screening_config_json"])
            return bool(cfg.get("require_human_confirmation", False))
        except Exception:
            return False

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

        if not progress.check_pause_or_cancel(project_id):
            return self.get_pipeline_summary(project_id, conn, title_count=len(title_results), abstract_count=0, ft_count=0)

        # Stage 2: Abstract screening on uncertain/pending studies
        abstract_results = self.run_abstract_screening(project_id, conn, client=client)

        if not progress.check_pause_or_cancel(project_id):
            return self.get_pipeline_summary(project_id, conn, title_count=len(title_results), abstract_count=len(abstract_results), ft_count=0)

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
        require_confirm = self._requires_human_confirmation(project_id, conn)

        studies = conn.execute(
            "SELECT * FROM studies WHERE project_id = ? AND screening_status = 'pending'",
            (project_id,),
        ).fetchall()
        progress.start(project_id, "title", [dict(r)["study_id"] for r in studies])

        results: list[dict[str, Any]] = []
        now_str = datetime.now(timezone.utc).isoformat()

        cal = get_calibration(project_id, stage="ta")

        for s_row in studies:
            if not progress.check_pause_or_cancel(project_id):
                break
            s = dict(s_row)
            study_id = s["study_id"]
            progress.set_current(project_id, study_id, s.get("title") or "")
            title = (s.get("title") or "").strip()

            # Two independent passes (include-focused and exclude-focused)
            res_a = screen_title_only_with_llm(
                title=title,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="include_focused",
            )
            res_b = screen_title_only_with_llm(
                title=title,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="exclude_focused",
            )

            crit_hits_a = {res_a["reason_code"]: float(res_a.get("confidence", 0.0))} if (res_a.get("decision") == "exclude" and res_a.get("reason_code")) else {}
            crit_hits_b = {res_b["reason_code"]: float(res_b.get("confidence", 0.0))} if (res_b.get("decision") == "exclude" and res_b.get("reason_code")) else {}
            pass_a = PassResult(
                decision=res_a.get("decision", "uncertain"),
                criterion_hits=crit_hits_a,
                rationale=res_a.get("reason_text") or res_a.get("reason") or "",
                confidence=float(res_a.get("confidence", 0.0)),
            )
            pass_b = PassResult(
                decision=res_b.get("decision", "uncertain"),
                criterion_hits=crit_hits_b,
                rationale=res_b.get("reason_text") or res_b.get("reason") or "",
                confidence=float(res_b.get("confidence", 0.0)),
            )

            p_include = score_record(pass_a, pass_b, safety_net_flag=False, text_len=len(title), cal=cal)
            routed_status, crit = decide(p_include, pass_a, pass_b, safety_net_flag=False, cal=cal)
            is_audit = 1 if is_sampled_for_audit(study_id) else 0

            if routed_status == "auto_excluded":
                decision = "exclude"
                confidence = max(pass_a.confidence, pass_b.confidence, round(1.0 - p_include, 4))
                reason = pass_b.rationale or pass_a.rationale or "Exclusion criteria clearly met"
                reason_code = crit or res_b.get("reason_code") or res_a.get("reason_code") or "EXCLUDE"
                new_status = "pending" if require_confirm else "excluded"
                new_stage = "ta"
                auto_dec = 1
            elif routed_status == "proposed_include":
                decision = "include"
                confidence = max(pass_a.confidence, pass_b.confidence, round(p_include, 4))
                reason = pass_a.rationale or pass_b.rationale or "Eligibility criteria clearly met"
                reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "INCLUDE"
                new_status = "pending" if require_confirm else "ta_included"
                new_stage = "ta"
                auto_dec = 1
            else:
                decision = "uncertain"
                confidence = round(p_include, 4)
                reason = pass_a.rationale or pass_b.rationale or "Uncertain from title alone — needs abstract review"
                reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "UNCERTAIN_TITLE"
                new_status = "pending"
                new_stage = "ta"
                auto_dec = 0

            priority_score = round(abs(p_include - 0.5), 4)

            # Update study row with calibrated confidence and audit metadata
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
                   screening_reason = ?,
                   ai_p_include = ?,
                   auto_decision = ?,
                   sampled_audit = ?,
                   ai_priority_score = ?
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
                    round(p_include, 4),
                    auto_dec,
                    is_audit,
                    priority_score,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at,
                   auto_decision, sampled_audit
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ta', 0, ?, ?, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status if new_status in ("ta_included", "excluded") else "uncertain",
                    reason_code,
                    reason,
                    now_str,
                    auto_dec,
                    is_audit,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "title",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
                "p_include": round(p_include, 4),
                "auto_decision": auto_dec,
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
        require_confirm = self._requires_human_confirmation(project_id, conn)

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

        cal = get_calibration(project_id, stage="ta")

        for s_row in studies:
            if not progress.check_pause_or_cancel(project_id):
                break
            s = dict(s_row)
            study_id = s["study_id"]
            progress.set_current(project_id, study_id, s.get("title") or "")
            title = (s.get("title") or "").strip()
            abstract = (s.get("abstract") or "").strip()

            # Two independent passes
            res_a = screen_title_abstract_with_llm(
                title=title,
                abstract=abstract,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="include_focused",
            )
            res_b = screen_title_abstract_with_llm(
                title=title,
                abstract=abstract,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="exclude_focused",
            )

            needs_clarification = res_a.get("needs_clarification", False) or res_b.get("needs_clarification", False)
            clar_res = res_a if res_a.get("needs_clarification") else res_b

            if needs_clarification and clar_res.get("clarification_question"):
                decision = "uncertain"
                confidence = float(clar_res.get("confidence", 0.5))
                reason = clar_res.get("reason_text") or clar_res.get("reason") or "Awaiting reviewer clarification"
                reason_code = clar_res.get("reason_code", "AMBIGUOUS_DESIGN")
                new_status = "awaiting_clarification"
                new_stage = "ta"
                auto_dec = 0
                is_audit = 0
                p_include = 0.5
                priority_score = 0.0

                q_id = str(uuid.uuid4())
                raw_opts = clar_res.get("clarification_options") or [
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
                        clar_res.get("clarification_type", "study_design"),
                        clar_res.get("clarification_question", ""),
                        opts_json,
                        abstract[:250] if abstract else title,
                        clar_res.get("clarification_type", "study_design"),
                        confidence,
                        reason,
                        now_str,
                    ),
                )
            else:
                crit_hits_a = {res_a["reason_code"]: float(res_a.get("confidence", 0.0))} if (res_a.get("decision") == "exclude" and res_a.get("reason_code")) else {}
                crit_hits_b = {res_b["reason_code"]: float(res_b.get("confidence", 0.0))} if (res_b.get("decision") == "exclude" and res_b.get("reason_code")) else {}
                pass_a = PassResult(
                    decision=res_a.get("decision", "uncertain"),
                    criterion_hits=crit_hits_a,
                    rationale=res_a.get("reason_text") or res_a.get("reason") or "",
                    confidence=float(res_a.get("confidence", 0.0)),
                )
                pass_b = PassResult(
                    decision=res_b.get("decision", "uncertain"),
                    criterion_hits=crit_hits_b,
                    rationale=res_b.get("reason_text") or res_b.get("reason") or "",
                    confidence=float(res_b.get("confidence", 0.0)),
                )

                text_len = len(title) + len(abstract)
                p_include = score_record(pass_a, pass_b, safety_net_flag=False, text_len=text_len, cal=cal)
                routed_status, crit = decide(p_include, pass_a, pass_b, safety_net_flag=False, cal=cal)
                is_audit = 1 if is_sampled_for_audit(study_id) else 0

                if routed_status == "auto_excluded":
                    decision = "exclude"
                    confidence = max(pass_a.confidence, pass_b.confidence, round(1.0 - p_include, 4))
                    reason = pass_b.rationale or pass_a.rationale or "Exclusion criteria clearly met"
                    reason_code = crit or res_b.get("reason_code") or res_a.get("reason_code") or "EXCLUDE"
                    new_status = "pending" if require_confirm else "excluded"
                    new_stage = "ta"
                    auto_dec = 1
                elif routed_status == "proposed_include":
                    decision = "include"
                    confidence = max(pass_a.confidence, pass_b.confidence, round(p_include, 4))
                    reason = pass_a.rationale or pass_b.rationale or "Eligibility criteria clearly met"
                    reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "INCLUDE"
                    new_status = "pending" if require_confirm else "ta_included"
                    new_stage = "ta"
                    auto_dec = 1
                else:
                    decision = "uncertain"
                    confidence = round(p_include, 4)
                    reason = pass_a.rationale or pass_b.rationale or "Uncertain from title and abstract review"
                    reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "UNCERTAIN"
                    new_status = "uncertain"
                    new_stage = "ta"
                    auto_dec = 0

                priority_score = round(abs(p_include - 0.5), 4)

            # Update study row with calibrated confidence and audit metadata
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
                   screening_reason = ?,
                   ai_p_include = ?,
                   auto_decision = ?,
                   sampled_audit = ?,
                   ai_priority_score = ?
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
                    round(p_include, 4),
                    auto_dec,
                    is_audit,
                    priority_score,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at,
                   auto_decision, sampled_audit
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ta', 0, ?, ?, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status if new_status in ("ta_included", "excluded") else "uncertain",
                    reason_code,
                    reason,
                    now_str,
                    auto_dec,
                    is_audit,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "abstract",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
                "p_include": round(p_include, 4),
                "auto_decision": auto_dec,
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
        require_confirm = self._requires_human_confirmation(project_id, conn)

        studies = conn.execute(
            """SELECT * FROM studies
               WHERE project_id = ? AND screening_status = 'ta_included'""",
            (project_id,),
        ).fetchall()
        # Studies parked at awaiting_pdf are picked up again once their full text exists
        # (uploaded PDF or retrieved open-access text); the rest stay parked.
        waiting = conn.execute(
            """SELECT * FROM studies
               WHERE project_id = ? AND screening_status = 'awaiting_pdf'""",
            (project_id,),
        ).fetchall()
        for w in waiting:
            doc = conn.execute(
                "SELECT full_text FROM pdf_documents WHERE study_id = ?", (dict(w)["study_id"],)
            ).fetchone()
            if doc and (dict(doc).get("full_text") or "").strip():
                studies = list(studies) + [w]
        progress.start(project_id, "fulltext", [dict(r)["study_id"] for r in studies])

        results: list[dict[str, Any]] = []
        now_str = datetime.now(timezone.utc).isoformat()

        for s_row in studies:
            if not progress.check_pause_or_cancel(project_id):
                break
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

            cal = get_calibration(project_id, stage="ft")
            # Full text screening with dual independent LLM passes
            study_text = full_text or s.get("abstract") or s.get("title") or ""
            res_a = screen_fulltext_with_llm(
                study_text=study_text,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="include_focused",
            )
            res_b = screen_fulltext_with_llm(
                study_text=study_text,
                pico_criteria=pico,
                exclusion_reasons=exclusions,
                client=client,
                framing="exclude_focused",
            )

            crit_hits_a = {res_a["reason_code"]: float(res_a.get("confidence", 0.0))} if (res_a.get("decision") in ("exclude", "excluded") and res_a.get("reason_code")) else {}
            crit_hits_b = {res_b["reason_code"]: float(res_b.get("confidence", 0.0))} if (res_b.get("decision") in ("exclude", "excluded") and res_b.get("reason_code")) else {}
            pass_a = PassResult(
                decision="exclude" if res_a.get("decision") in ("exclude", "excluded") else ("include" if res_a.get("decision") in ("include", "included") else "uncertain"),
                criterion_hits=crit_hits_a,
                rationale=res_a.get("reason_text") or res_a.get("reason") or "",
                confidence=float(res_a.get("confidence", 0.0)),
            )
            pass_b = PassResult(
                decision="exclude" if res_b.get("decision") in ("exclude", "excluded") else ("include" if res_b.get("decision") in ("include", "included") else "uncertain"),
                criterion_hits=crit_hits_b,
                rationale=res_b.get("reason_text") or res_b.get("reason") or "",
                confidence=float(res_b.get("confidence", 0.0)),
            )

            p_include = score_record(pass_a, pass_b, safety_net_flag=False, text_len=len(study_text), cal=cal)
            routed_status, crit = decide(p_include, pass_a, pass_b, safety_net_flag=False, cal=cal)
            is_audit = 1 if is_sampled_for_audit(study_id) else 0

            if routed_status == "auto_excluded":
                decision = "exclude"
                confidence = max(pass_a.confidence, pass_b.confidence, round(1.0 - p_include, 4))
                reason = pass_b.rationale or pass_a.rationale or "Full-text exclusion criteria clearly met"
                reason_code = crit or res_b.get("reason_code") or res_a.get("reason_code") or "EXCLUDE"
                new_status = "ta_included" if require_confirm else "excluded"
                new_stage = "ft"
                auto_dec = 1
            elif routed_status == "proposed_include":
                decision = "include"
                confidence = max(pass_a.confidence, pass_b.confidence, round(p_include, 4))
                reason = pass_a.rationale or pass_b.rationale or "Full-text eligibility criteria clearly met"
                reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "INCLUDE"
                new_status = "ta_included" if require_confirm else "included"
                new_stage = "ft"
                auto_dec = 1
            else:
                decision = "uncertain"
                confidence = round(p_include, 4)
                reason = pass_a.rationale or pass_b.rationale or "Uncertain from full-text review"
                reason_code = res_a.get("reason_code") or res_b.get("reason_code") or "UNCERTAIN"
                new_status = "uncertain"
                new_stage = "ft"
                auto_dec = 0

            priority_score = round(abs(p_include - 0.5), 4)

            # Update study row with calibrated confidence and audit metadata
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
                   screening_reason = ?,
                   ai_p_include = ?,
                   auto_decision = ?,
                   sampled_audit = ?,
                   ai_priority_score = ?
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
                    round(p_include, 4),
                    auto_dec,
                    is_audit,
                    priority_score,
                    study_id,
                ),
            )

            # Record in screening_decisions
            decision_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO screening_decisions (
                   decision_id, study_id, project_id, reviewer_id, reviewer_name,
                   decision, reason_code, reason_text, stage, is_blinded, created_at,
                   auto_decision, sampled_audit
                ) VALUES (?, ?, ?, 'ai_screener', 'AI Screener', ?, ?, ?, 'ft', 0, ?, ?, ?)""",
                (
                    decision_id,
                    study_id,
                    project_id,
                    new_status,
                    reason_code,
                    reason,
                    now_str,
                    auto_dec,
                    is_audit,
                ),
            )

            results.append({
                "study_id": study_id,
                "stage": "fulltext",
                "decision": decision,
                "screening_status": new_status,
                "confidence": confidence,
                "reason": reason,
                "p_include": round(p_include, 4),
                "auto_decision": auto_dec,
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
