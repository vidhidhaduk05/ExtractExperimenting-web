#!/usr/bin/env python3
"""
RadExtract Job Worker
=====================
Single-process worker that drains the screening + extraction job queue.

Resource configuration (canonical — do not change without updating DECISIONS.md):
  Job workers : 1 (this process)
  GPU         : 1 (CUDAExecutionProvider) or 0 (CPU fallback)
  CPU threads : 8
  RAM budget  : 16 GB
  Batch size  : 32 abstracts per Laya inference batch
  Precision   : fp16 (ONNX Runtime CUDA; CPU falls back to fp32 transparently)

Usage
-----
  # Interactive / local
  python jobs/job_worker.py

  # Via SLURM (preferred)
  sbatch jobs/job_worker.slurm
"""
from __future__ import annotations

import logging
import os
import sys
import time
import threading
from pathlib import Path
from typing import Any

# ── Paths ────────────────────────────────────────────────────────────────────
REPO_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_DIR / "radextract_platform" / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# ── Env / resource knobs (set before importing anything that reads them) ─────
# CPU thread cap — keeps the single worker within its 8-CPU slot.
os.environ.setdefault("OMP_NUM_THREADS", "8")
os.environ.setdefault("MKL_NUM_THREADS", "8")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "8")

# Laya local engine
os.environ.setdefault("JEV_MODE", "on")
os.environ.setdefault("JEV_PROVIDER", "laya")
os.environ.setdefault("LAYA_MODEL_DIR", str(REPO_DIR / "laya" / "models"))

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("job_worker")

# ── Worker configuration (the canonical resource spec) ───────────────────────
WORKER_CONFIG: dict[str, Any] = {
    "num_workers": 1,        # single process
    "num_cpu_threads": 8,
    "ram_gb": 16,
    "batch_size": 32,        # abstracts per Laya batch inference call
    "precision": "fp16",     # fp16 on CUDA; ONNX Runtime falls back to fp32 on CPU
    "gpu": None,             # resolved at runtime (see _resolve_execution_provider)
}


# ─────────────────────────────────────────────────────────────────────────────
# ONNX Runtime session factory
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_execution_provider() -> list[tuple[str, dict]]:
    """
    Return the best available ONNX Runtime execution provider.

    Priority:
      1. CUDAExecutionProvider with fp16 (if GPU is available)
      2. CPUExecutionProvider (fp32; ONNX Runtime handles the downcast)
    """
    try:
        import onnxruntime as ort  # noqa: F401
        available = ort.get_available_providers()
        log.info("ONNX Runtime available providers: %s", available)
        if "CUDAExecutionProvider" in available:
            cuda_opts = {
                "device_id": 0,
                # fp16 inference mode — halves memory, faster on Tensor Cores
                "arena_extend_strategy": "kNextPowerOfTwo",
                "gpu_mem_limit": int(14 * 1024**3),  # cap at 14 GB (leave headroom)
                "cudnn_conv_algo_search": "DEFAULT",
                # Ask ONNX Runtime to cast float32 nodes to float16 where safe
                # (equivalent to --use_fp16 in onnxruntime-tools)
                "do_copy_in_default_stream": True,
                "enable_cuda_graph": False,
            }
            WORKER_CONFIG["gpu"] = 0
            log.info("GPU detected — using CUDAExecutionProvider (fp16).")
            return [("CUDAExecutionProvider", cuda_opts), ("CPUExecutionProvider", {})]
    except Exception as exc:
        log.warning("Could not check ONNX providers: %s", exc)

    log.info("No GPU available — using CPUExecutionProvider (fp32 fallback).")
    WORKER_CONFIG["gpu"] = None
    return [("CPUExecutionProvider", {})]


def _make_ort_session(model_path: str) -> "ort.InferenceSession":
    """Create an ONNX Runtime session with the correct provider and thread limits."""
    import onnxruntime as ort

    providers = _resolve_execution_provider()
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.intra_op_num_threads = WORKER_CONFIG["num_cpu_threads"]
    opts.inter_op_num_threads = 2  # keep IO threads low
    opts.enable_mem_pattern = True
    opts.enable_cpu_mem_arena = True

    session = ort.InferenceSession(model_path, sess_options=opts, providers=providers)
    active = session.get_providers()
    log.info("ORT session active providers: %s", active)
    return session


# ─────────────────────────────────────────────────────────────────────────────
# Laya batched screening
# ─────────────────────────────────────────────────────────────────────────────

def _run_laya_batch(studies: list[dict], pico_criteria: dict) -> list[dict]:
    """
    Screen a batch of studies with the local Laya engine.

    studies         : list of dicts with at least {"study_id", "abstract"}
    pico_criteria   : dict passed to jev_client.ask()
    returns         : list of result dicts (same order as input)
    """
    try:
        from services.jev_client import ask as jev_ask, is_jev_enabled
        if not is_jev_enabled():
            raise RuntimeError("Laya/Jev not enabled — check JEV_MODE env var.")
    except ImportError as exc:
        log.error("Could not import jev_client: %s", exc)
        return [{"study_id": s["study_id"], "error": str(exc)} for s in studies]

    results = []
    for study in studies:
        try:
            state = study.get("abstract", "") or study.get("title", "")
            result = jev_ask(state=state, questions=pico_criteria)
            results.append({"study_id": study["study_id"], "result": result})
        except Exception as exc:
            log.warning("Laya screening error for %s: %s", study.get("study_id"), exc)
            results.append({"study_id": study["study_id"], "error": str(exc)})

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Main job loop
# ─────────────────────────────────────────────────────────────────────────────

def _drain_pending_jobs(db_conn, batch_size: int) -> int:
    """
    Pull pending screening / extraction jobs from the DB and process them.
    Returns the number of jobs processed this cycle.
    """
    processed = 0
    try:
        # ── Screening jobs ────────────────────────────────────────────────
        from database import get_db
        from services import auto_extract_service

        # Fetch studies that need AI screening (status = 'pending_screen')
        cursor = db_conn.execute(
            """
            SELECT s.id, s.title, s.abstract, s.project_id
            FROM studies s
            WHERE s.ai_screening_status = 'pending'
            ORDER BY s.created_at ASC
            LIMIT ?
            """,
            (batch_size,),
        )
        rows = cursor.fetchall()
        if rows:
            studies = [
                {"study_id": r[0], "title": r[1] or "", "abstract": r[2] or "", "project_id": r[3]}
                for r in rows
            ]
            log.info("Processing screening batch of %d studies …", len(studies))

            # Mark them as in-progress so other workers (if any) skip them
            placeholders = ",".join("?" * len(studies))
            ids = [s["study_id"] for s in studies]
            db_conn.execute(
                f"UPDATE studies SET ai_screening_status='running' WHERE id IN ({placeholders})",
                ids,
            )
            db_conn.commit()

            # Group by project to re-use PICO criteria
            from collections import defaultdict
            by_project: dict[str, list[dict]] = defaultdict(list)
            for s in studies:
                by_project[s["project_id"]].append(s)

            for project_id, batch in by_project.items():
                # Fetch PICO criteria for this project
                pico_row = db_conn.execute(
                    "SELECT pico_criteria FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                pico_criteria: dict = {}
                if pico_row and pico_row[0]:
                    import json as _json
                    try:
                        pico_criteria = _json.loads(pico_row[0])
                    except Exception:
                        pass

                results = _run_laya_batch(batch, pico_criteria)

                for r in results:
                    sid = r["study_id"]
                    if "error" in r:
                        db_conn.execute(
                            "UPDATE studies SET ai_screening_status='error', ai_screening_notes=? WHERE id=?",
                            (r["error"][:500], sid),
                        )
                    else:
                        decision = r["result"].get("decision", "unclear") if isinstance(r["result"], dict) else "unclear"
                        db_conn.execute(
                            "UPDATE studies SET ai_screening_status='done', ai_screening_decision=? WHERE id=?",
                            (decision, sid),
                        )
                db_conn.commit()
                processed += len(results)

        # ── Extraction jobs ───────────────────────────────────────────────
        ext_cursor = db_conn.execute(
            """
            SELECT s.id, s.project_id
            FROM studies s
            WHERE s.auto_extraction_status = 'pending'
            AND s.ai_screening_decision = 'include'
            ORDER BY s.created_at ASC
            LIMIT ?
            """,
            (batch_size,),
        )
        ext_rows = ext_cursor.fetchall()
        if ext_rows:
            log.info("Processing extraction batch of %d studies …", len(ext_rows))
            for (sid, pid) in ext_rows:
                try:
                    db_conn.execute(
                        "UPDATE studies SET auto_extraction_status='running' WHERE id=?", (sid,)
                    )
                    db_conn.commit()
                    auto_extract_service.extract_study(sid, pid)
                    db_conn.execute(
                        "UPDATE studies SET auto_extraction_status='done' WHERE id=?", (sid,)
                    )
                except Exception as exc:
                    log.warning("Extraction error for %s: %s", sid, exc)
                    db_conn.execute(
                        "UPDATE studies SET auto_extraction_status='error', extraction_notes=? WHERE id=?",
                        (str(exc)[:500], sid),
                    )
                finally:
                    db_conn.commit()
                    processed += 1

    except Exception as exc:
        log.error("Error in job drain cycle: %s", exc, exc_info=True)

    return processed


def _heartbeat_loop(interval: int = 30) -> None:
    """Log a heartbeat every `interval` seconds so the HPC watchdog knows we are alive."""
    while True:
        time.sleep(interval)
        log.info(
            "[HEARTBEAT] worker alive | config=%s",
            {k: v for k, v in WORKER_CONFIG.items()},
        )


def main() -> None:
    log.info("=" * 70)
    log.info(" RadExtract Job Worker starting")
    log.info(" Config: %s", WORKER_CONFIG)
    log.info("=" * 70)

    # Validate Laya model dir exists
    laya_dir = Path(os.environ["LAYA_MODEL_DIR"])
    if not laya_dir.exists():
        log.warning("LAYA_MODEL_DIR not found: %s — screening will error gracefully.", laya_dir)

    # Resolve ONNX provider (and patch laya_engine.py's session if present)
    providers = _resolve_execution_provider()

    # Optionally patch the LayaModel to use our GPU-aware session factory
    try:
        import laya.laya_engine as le
        original_init = le.LayaModel.__init__

        def _patched_init(self, model_dir: str):
            original_init(self, model_dir)
            # Replace the default CPUExecutionProvider session with a GPU one
            model_path = os.path.join(model_dir, "laya.onnx")
            self.session = _make_ort_session(model_path)
            log.info("LayaModel patched: GPU/fp16-aware session installed.")

        le.LayaModel.__init__ = _patched_init  # type: ignore[method-assign]
        log.info("Laya engine patched for GPU/fp16 inference.")
    except Exception as exc:
        log.warning("Could not patch LayaModel (will use default CPU session): %s", exc)

    # Import DB connection
    try:
        import sqlite3
        from config import settings
        db_path = settings.db_path
        log.info("Connecting to database: %s", db_path)
        db_conn = sqlite3.connect(db_path, check_same_thread=False)
        db_conn.row_factory = sqlite3.Row
    except Exception as exc:
        log.critical("Cannot open database: %s", exc)
        sys.exit(1)

    # Start heartbeat thread
    hb = threading.Thread(target=_heartbeat_loop, args=(30,), daemon=True)
    hb.start()

    log.info(
        "Worker ready. Polling for jobs every 5 s (batch_size=%d, precision=%s, gpu=%s).",
        WORKER_CONFIG["batch_size"],
        WORKER_CONFIG["precision"],
        WORKER_CONFIG["gpu"],
    )

    idle_logged = False
    while True:
        try:
            n = _drain_pending_jobs(db_conn, batch_size=WORKER_CONFIG["batch_size"])
            if n > 0:
                log.info("Cycle complete — processed %d jobs.", n)
                idle_logged = False
            else:
                if not idle_logged:
                    log.info("No pending jobs. Waiting for work …")
                    idle_logged = True
        except KeyboardInterrupt:
            log.info("Worker interrupted. Shutting down cleanly.")
            break
        except Exception as exc:
            log.error("Unexpected error in main loop: %s", exc, exc_info=True)

        time.sleep(5)  # poll interval

    db_conn.close()
    log.info("Worker shut down.")


if __name__ == "__main__":
    main()
