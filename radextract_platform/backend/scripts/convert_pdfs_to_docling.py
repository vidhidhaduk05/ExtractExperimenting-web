#!/usr/bin/env python3
"""Batch PDF to Docling JSON Converter.

Converts PDF documents to IBM Docling structured JSON with layout bounding boxes,
reconstructed tables, and clean Markdown text.
Supports Tesla V100S GPU acceleration (CUDA) or multi-threaded CPU fallback,
and can optionally synchronize the parsed documents with the RadExtract database.

Usage:
    python convert_pdfs_to_docling.py --input-dir /path/to/pdfs --device cuda --threads 8 --sync-db
"""
from __future__ import annotations

import argparse
import glob
import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add backend to Python path so radextract_core can be imported as a package
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("docling_batch")


def parse_args():
    parser = argparse.ArgumentParser(description="Batch convert PDFs to Docling JSON format.")
    parser.add_argument(
        "--input-dir",
        type=str,
        default=os.path.join(os.path.dirname(BACKEND_DIR), "TESTING", "files"),
        help="Directory containing PDF files to convert",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Optional destination directory for .docling.json files (default: alongside source PDF)",
    )
    parser.add_argument(
        "--device",
        type=str,
        choices=["auto", "cuda", "cpu"],
        default="auto",
        help="Accelerator device: 'cuda', 'cpu', or 'auto' (default: auto)",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=8,
        help="Number of CPU worker threads (default: 8)",
    )
    parser.add_argument(
        "--sync-db",
        action="store_true",
        help="Synchronize converted documents with the RadExtract SQLite database",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-conversion even if .docling.json file already exists",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=None,
        help="Maximum number of documents to convert",
    )
    return parser.parse_args()


def get_converter(device_mode: str, threads: int):
    """Initialize Docling converter with GPU or CPU acceleration."""
    has_torch = False
    cuda_available = False
    device_name = "CPU"
    try:
        import torch
        has_torch = True
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            device_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

    device_str = "CPU"
    if device_mode == "cuda" or (device_mode == "auto" and cuda_available):
        if cuda_available:
            device_str = f"CUDA ({device_name})"
        else:
            logger.warning("CUDA requested or auto-detected but torch.cuda.is_available() is False. Using CPU.")
            device_str = "CPU"

    logger.info(f"Initializing Docling Converter on {device_str} with {threads} threads...")

    
    from radextract_core.radextract.document_processor import DoclingProcessor, convert_with_fallback
    proc = DoclingProcessor()
    if proc.available:
        logger.info("[+] IBM Docling engine successfully initialized.")
    else:
        logger.warning("[-] Docling not available in this environment. Will use FallbackProcessor (pdfplumber/pypdfium2).")
    
    return proc


def sync_document_to_db(pdf_path: str, doc_dict: dict, db):
    """Synchronize a converted Docling document with the SQLite database."""
    pdf_filename = os.path.basename(pdf_path)
    stem = os.path.splitext(pdf_filename)[0]

    # Look for matching study by pdf_path or title
    matched_study = None
    try:
        all_studies = db.query("studies", {})
        for s in all_studies:
            s_path = s.get("pdf_path") or ""
            s_title = s.get("title") or ""
            if os.path.basename(s_path) == pdf_filename or stem.lower() in s_title.lower():
                matched_study = s
                break
    except Exception as e:
        logger.warning(f"Error querying studies table: {e}")

    study_id = matched_study["study_id"] if matched_study else str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc_id = str(uuid.uuid4())

    parsed = doc_dict.get("parsed", {})
    full_text = parsed.get("full_text", "")
    pages_json = json.dumps(parsed.get("pages", []), ensure_ascii=False)
    annotations = doc_dict.get("annotations", {})
    annotations_json = json.dumps(annotations, ensure_ascii=False)
    tables_json = json.dumps(parsed.get("tables", []), ensure_ascii=False)
    metadata_json = json.dumps(doc_dict.get("metadata", {}), ensure_ascii=False)
    engine = doc_dict.get("metadata", {}).get("engine", "docling")

    # If study exists, replace record in pdf_documents
    try:
        if matched_study:
            existing = db.query("pdf_documents", {"study_id": study_id})
            for ex in existing:
                db.delete("pdf_documents", ex["doc_id"])

        db.insert("pdf_documents", {
            "doc_id": doc_id,
            "study_id": study_id,
            "full_text": full_text,
            "pages_json": pages_json,
            "annotations_json": annotations_json,
            "tables_json": tables_json,
            "metadata_json": metadata_json,
            "processor_engine": engine,
            "processed_at": now,
        })

        if matched_study:
            db.update("studies", study_id, {
                "pdf_status": "processed",
                "pdf_processor_engine": engine,
            })
        db.commit()
        logger.info(f"  [DB Sync] Document synced to study_id={study_id[:8]}... (engine={engine})")
    except Exception as e_db:
        logger.warning(f"  [DB Sync Warning] Could not sync {pdf_filename} to DB: {e_db}")


def main():
    args = parse_args()
    input_dir = os.path.abspath(args.input_dir)

    if not os.path.isdir(input_dir):
        logger.error(f"Input directory does not exist: {input_dir}")
        sys.exit(1)

    output_dir = os.path.abspath(args.output_dir) if args.output_dir else None
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # Discover all PDF files
    pdf_files = sorted(glob.glob(os.path.join(input_dir, "**", "*.pdf"), recursive=True))
    if not pdf_files:
        # Check non-recursive
        pdf_files = sorted(glob.glob(os.path.join(input_dir, "*.pdf")))

    if not pdf_files:
        logger.warning(f"No PDF files found in {input_dir}")
        sys.exit(0)

    if args.max_docs:
        pdf_files = pdf_files[:args.max_docs]

    logger.info("=" * 70)
    logger.info(" RadExtract Batch PDF to Docling JSON Converter")
    logger.info(f" Input Directory:  {input_dir}")
    logger.info(f" Total PDFs Found: {len(pdf_files)}")
    logger.info(f" Output Target:    {output_dir or 'Alongside source PDFs'}")
    logger.info(f" Device Mode:      {args.device}")
    logger.info(f" CPU Threads:      {args.threads}")
    logger.info(f" Sync to DB:       {args.sync_db}")
    logger.info(f" Force Overwrite:  {args.force}")
    logger.info("=" * 70)

    from radextract_core.radextract.document_processor import convert_with_fallback
    get_converter(args.device, args.threads)

    db = None
    if args.sync_db:
        try:
            from database import get_db_backend
            db = get_db_backend()
            logger.info("[+] Connected to RadExtract database backend.")
        except Exception as e_db:
            logger.warning(f"[-] Could not connect to database backend: {e_db}")

    start_time = time.time()
    successful = 0
    skipped = 0
    failed = 0
    total_pages = 0
    total_tables = 0

    for i, pdf_path in enumerate(pdf_files, 1):
        filename = os.path.basename(pdf_path)
        if output_dir:
            json_filename = os.path.splitext(filename)[0] + ".docling.json"
            dest_json_path = os.path.join(output_dir, json_filename)
        else:
            dest_json_path = os.path.splitext(pdf_path)[0] + ".docling.json"

        if os.path.exists(dest_json_path) and not args.force:
            logger.info(f"[{i}/{len(pdf_files)}] [SKIPPED] Already exists: {os.path.basename(dest_json_path)}")
            skipped += 1
            continue

        logger.info(f"[{i}/{len(pdf_files)}] [CONVERTING] {filename}...")
        t0 = time.time()
        try:
            doc = convert_with_fallback(pdf_path, prefer_docling=True)
            doc_dict = doc.as_dict()

            with open(dest_json_path, "w", encoding="utf-8") as f:
                json.dump(doc_dict, f, ensure_ascii=False, indent=2)

            elapsed = time.time() - t0
            pages = doc.parsed.get("n_pages", 0)
            tables = len(doc.parsed.get("tables", []))
            engine = doc.metadata.get("engine", "unknown")
            size_kb = os.path.getsize(dest_json_path) / 1024

            total_pages += pages
            total_tables += tables
            successful += 1

            logger.info(
                f"  [+] Success in {elapsed:.2f}s | Engine: {engine} | Pages: {pages} | "
                f"Tables: {tables} | JSON Size: {size_kb:.1f} KB"
            )

            if db:
                sync_document_to_db(pdf_path, doc_dict, db)

        except Exception as e:
            logger.error(f"  [-] Failed {filename}: {e}")
            failed += 1

    total_elapsed = time.time() - start_time
    logger.info("=" * 70)
    logger.info(" Batch Conversion Complete")
    logger.info(f" Total Processed: {len(pdf_files)}")
    logger.info(f" Successful:      {successful}")
    logger.info(f" Skipped:         {skipped}")
    logger.info(f" Failed:          {failed}")
    logger.info(f" Total Pages:     {total_pages}")
    logger.info(f" Total Tables:    {total_tables}")
    logger.info(f" Total Time:      {total_elapsed:.2f}s (avg: {total_elapsed/max(successful, 1):.2f}s/doc)")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
