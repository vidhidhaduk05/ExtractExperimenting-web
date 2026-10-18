"""Background Processing Pipeline for RadExtract.

Handles:
1. Asynchronous PDF to Docling IBM structured JSON conversion.
2. Immediate AI Full-Text Screening with Gemini LLM / heuristic fallback.
3. Automated inclusion and variable extraction directly into the Data Review matrix.
"""
from __future__ import annotations
import json
import logging
from typing import Optional

from database import get_db_backend
from services.db_backend import DBBackend
from services import pdf_service, auto_extract_service
from services.llm_extractor import screen_fulltext_with_llm

logger = logging.getLogger("radextract.pipeline")


def run_pdf_screening_pipeline(study_id: str, project_id: str, db: Optional[DBBackend] = None):
    """Execute complete end-to-end processing pipeline in the background.

    Runs:
    1. Docling IBM JSON conversion
    2. AI Full-text screening
    3. Auto-includes matched studies
    4. Auto-extracts variables for Data Review

    NOTE: This runs as a FastAPI BackgroundTask. Callers must NOT pass a
    request-scoped db (it is closed when the response finishes); let it
    create its own (the default).
    """
    logger.info(f"[Pipeline] Starting background processing for study {study_id}")

    db = db or get_db_backend()

    # 1. Convert PDF with Docling IBM
    try:
        proc_result = pdf_service.process_pdf(study_id, db=db)
        logger.info(f"[Pipeline] Docling conversion finished for {study_id}: {proc_result.get('processor_engine')}")
    except Exception as e:
        logger.error(f"[Pipeline] Docling conversion failed for {study_id}: {e}")
        return

    # 2. Run AI Full-Text Screening
    try:
        study = db.get("studies", study_id)
        project = db.get("projects", project_id)
        if not study or not project:
            return

        pico = json.loads(project["pico_json"]) if project.get("pico_json") else {}
        reasons_raw = project.get("exclusion_reasons_json") or "[]"
        reasons = json.loads(reasons_raw) if reasons_raw else []

        pdf_data = pdf_service.get_pdf_data(study_id, db=db)
        full_text = pdf_data.get("full_text", "") if pdf_data else (study.get("abstract") or "")

        if full_text:
            res = screen_fulltext_with_llm(
                text=full_text,
                study_metadata=study,
                pico=pico,
                exclusion_reasons=reasons,
            )
            recommendation = res.get("recommendation", "included")
            reason_text = res.get("reason_text", "")
            rationale = res.get("rationale", "")

            # If AI recommends inclusion
            if recommendation == "included":
                db.update("studies", study_id, {
                    "screening_status": "included",
                    "screening_stage": "ft",
                    "screening_reason": f"AI Full-Text Included: {rationale or 'Matches PICOS criteria'}",
                })
                db.commit()
                logger.info(f"[Pipeline] Study {study_id} auto-included in full-text screening")

                # 3. Automatically extract variables into Data Review matrix
                try:
                    extract_res = auto_extract_service.auto_extract(study_id, project_id, db=db)
                    logger.info(f"[Pipeline] Auto-extracted {extract_res.get('extracted_count', 0)} variables into Data Review for {study_id}")
                except Exception as ex:
                    logger.warning(f"[Pipeline] Auto-extraction warning for {study_id}: {ex}")

                # 4. Auto-create + AI-prefill Risk of Bias assessment
                #    (non-fatal: screening/extraction results already saved)
                try:
                    from services import rob_service
                    rob_res = rob_service.auto_assess_study(study_id, project_id, db=db)
                    if rob_res:
                        logger.info(
                            f"[Pipeline] RoB auto-assessment for {study_id}: "
                            f"tool={rob_res.get('tool')} created={rob_res.get('created')} "
                            f"prefilled={rob_res.get('prefilled')}"
                        )
                except Exception as rob_ex:
                    logger.warning(f"[Pipeline] RoB auto-assessment failed for {study_id}: {rob_ex}")

            elif recommendation == "excluded":
                db.update("studies", study_id, {
                    "screening_status": "excluded",
                    "screening_stage": "ft",
                    "screening_reason": f"AI Full-Text Excluded: {reason_text or rationale}",
                })
                db.commit()
                logger.info(f"[Pipeline] Study {study_id} auto-excluded in full-text screening")

    except Exception as e:
        logger.error(f"[Pipeline] AI screening error for {study_id}: {e}")
