#!/usr/bin/env python3
"""Batch PDF to Docling Structured JSON Converter for RadExtract (HPC GPU Accelerated).

Converts a directory of clinical PDFs into Docling structured JSON (.docling.json)
using Docling's DocumentConverter accelerated with CUDA on NVIDIA Tesla V100S GPU
and multi-threaded layout parsing.

Usage:
    # Convert all PDFs in a folder to .docling.json files (e.g. on HPC)
    python convert_pdfs_to_docling.py --input-dir /home/vd00026/Desktop/Software/TESTING/files

    # Specify output directory and force CUDA:
    python convert_pdfs_to_docling.py --input-dir ./pdfs --output-dir ./docling_json --device cuda --threads 8

    # Convert and automatically sync with the RadExtract database:
    python convert_pdfs_to_docling.py --input-dir ./pdfs --project-id stroke_sr_ich_lvo --sync-db
"""
from __future__ import annotations

import argparse
import glob
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Setup path to import backend modules
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
CORE_DIR = BACKEND_DIR / "radextract_core"
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("convert_pdfs_to_docling")

from radextract_core.radextract.document_processor import (
    DoclingProcessor,
    convert_with_fallback,
    save_processed_document,
)


def convert_pdf_to_docling_json(
    pdf_path: str,
    output_dir: Optional[str] = None,
    overwrite: bool = False,
    processor: Optional[DoclingProcessor] = None,
) -> tuple[bool, str, float]:
    """Convert a single PDF file to .docling.json.

    Returns:
        (success: bool, output_json_path: str, elapsed_seconds: float)
    """
    pdf_path = os.path.abspath(pdf_path)
    stem = Path(pdf_path).stem

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        json_path = os.path.join(output_dir, f"{stem}.docling.json")
    else:
        json_path = os.path.splitext(pdf_path)[0] + ".docling.json"

    if os.path.exists(json_path) and not overwrite:
        logger.info(f"[SKIP] Already exists: {os.path.basename(json_path)}")
        return True, json_path, 0.0

    t0 = time.time()
    try:
        if processor and processor.available:
            doc = processor.convert(pdf_path)
        else:
            doc = convert_with_fallback(pdf_path, prefer_docling=True)

        save_processed_document(doc, json_path)
        elapsed = time.time() - t0
        n_pages = doc.parsed.get("n_pages", 0)
        n_tables = len(doc.parsed.get("tables", []))
        engine = doc.metadata.get("engine", "unknown")
        logger.info(
            f"[OK] {os.path.basename(pdf_path)} -> {os.path.basename(json_path)} "
            f"({elapsed:.2f}s, {n_pages} pages, {n_tables} tables, engine={engine})"
        )
        return True, json_path, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        logger.error(f"[ERROR] Failed to convert {os.path.basename(pdf_path)}: {e}")
        return False, json_path, elapsed


def sync_document_with_db(study_id: str, json_path: str, db_path: Optional[str] = None) -> bool:
    """Sync a converted .docling.json file into the SQLite database."""
    try:
        from database import get_db_backend
        import uuid
        from datetime import datetime, timezone

        db = get_db_backend()
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        parsed = data.get("parsed", {})
        annotations = data.get("annotations", {})
        metadata = data.get("metadata", {})
        engine = metadata.get("engine", "docling")
        now = datetime.now(timezone.utc).isoformat()

        # Delete existing record
        for old in db.query("pdf_documents", {"study_id": study_id}):
            db.delete("pdf_documents", old["doc_id"])

        # Insert new record
        db.insert("pdf_documents", {
            "doc_id": str(uuid.uuid4()),
            "study_id": study_id,
            "full_text": parsed.get("full_text", ""),
            "pages_json": json.dumps(parsed.get("pages", []), ensure_ascii=False),
            "annotations_json": json.dumps(annotations, ensure_ascii=False),
            "tables_json": json.dumps(parsed.get("tables", []), ensure_ascii=False),
            "metadata_json": json.dumps(metadata, ensure_ascii=False),
            "processor_engine": engine,
            "processed_at": now,
        })

        db.update("studies", study_id, {
            "pdf_status": "processed",
            "pdf_processor_engine": engine,
        })
        db.commit()
        return True
    except Exception as e:
        logger.warning(f"Could not sync {study_id} with database: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Batch convert PDFs to Docling structured JSON (.docling.json) on HPC GPU."
    )
    parser.add_argument(
        "--input-dir",
        type=str,
        required=True,
        help="Directory containing PDF files to convert.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Optional directory to save .docling.json files (defaults to same folder as PDFs).",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cuda", "cpu"],
        help="Hardware accelerator to use: 'cuda' (NVIDIA GPU), 'cpu', or 'auto'.",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=8,
        help="Number of CPU threads for layout/pipeline execution (default: 8).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-convert files even if .docling.json already exists.",
    )
    parser.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="Optional project ID to match and sync studies in SQLite database.",
    )
    parser.add_argument(
        "--sync-db",
        action="store_true",
        help="Sync converted output with the active database.",
    )

    args = parser.parse_args()

    # Set environment variables for Docling accelerator configuration
    if args.device != "auto":
        os.environ["DOCLING_DEVICE"] = args.device
    os.environ["DOCLING_NUM_THREADS"] = str(args.threads)

    # Detect CUDA
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if cuda_available else "None"
    except ImportError:
        cuda_available = False
        gpu_name = "PyTorch not installed"

    logger.info("========================================================================")
    logger.info(" RadExtract - High-Throughput Docling GPU PDF Converter")
    logger.info(f" Input Directory:  {os.path.abspath(args.input_dir)}")
    logger.info(f" Output Directory: {os.path.abspath(args.output_dir) if args.output_dir else 'Adjacent to PDFs'}")
    logger.info(f" CUDA Acceleration: {'ACTIVE (' + gpu_name + ')' if cuda_available else 'INACTIVE (CPU Fallback)'}")
    logger.info(f" Pipeline Threads:  {args.threads}")
    logger.info("========================================================================")

    pdf_files = sorted(glob.glob(os.path.join(args.input_dir, "**", "*.pdf"), recursive=True))
    if not pdf_files:
        pdf_files = sorted(glob.glob(os.path.join(args.input_dir, "*.pdf")))

    if not pdf_files:
        logger.warning(f"No PDF files found in {args.input_dir}")
        return

    logger.info(f"Found {len(pdf_files)} PDF file(s) to process.")

    processor = DoclingProcessor()
    if not processor.available:
        logger.warning("Docling is not installed in current environment; will use fallback parser.")

    success_count = 0
    fail_count = 0
    total_time = 0.0

    start_all = time.time()
    for idx, pdf_path in enumerate(pdf_files, 1):
        logger.info(f"[{idx}/{len(pdf_files)}] Processing {os.path.basename(pdf_path)}...")
        ok, json_path, elapsed = convert_pdf_to_docling_json(
            pdf_path=pdf_path,
            output_dir=args.output_dir,
            overwrite=args.overwrite,
            processor=processor,
        )
        if ok:
            success_count += 1
            total_time += elapsed
            if args.sync_db:
                # Attempt to extract study_id from filename or folder
                study_id = Path(pdf_path).stem
                sync_document_with_db(study_id, json_path)
        else:
            fail_count += 1

    total_elapsed = time.time() - start_all
    avg_time = (total_time / success_count) if success_count > 0 else 0.0

    logger.info("========================================================================")
    logger.info(" BATCH DOCLING CONVERSION COMPLETE:")
    logger.info(f" Total Files:     {len(pdf_files)}")
    logger.info(f" Succeeded:       {success_count}")
    logger.info(f" Failed:          {fail_count}")
    logger.info(f" Wall Clock Time: {total_elapsed:.2f}s")
    logger.info(f" Average Speed:   {avg_time:.2f}s per PDF")
    logger.info("========================================================================")


if __name__ == "__main__":
    main()
