#!/usr/bin/env python3
"""One-time migration script for RadExtract Storage Plan.

Relocates existing PDF uploads and generated files from legacy paths
into the official per-project STUDY DATA structure:
    {settings.storage_root}/{project_folder}/
        01_SOURCE/       <- Renamed to FirstAuthor-Year-ShortTitle.pdf + .docling.json
        02_SCREENING/    <- RIS / screening decisions
        03_EXTRACTION/   <- Extraction sheets
        04_ROB/          <- RoB assessments
        05_GRADE/        <- GRADE profiles
        06_META/         <- Meta-analysis plots
        07_EXPORTS/      <- PRISMA diagrams & final exports
        08_AUDIT/        <- Search & audit logs

Updates database records to store relative paths (e.g. "{folder}/01_SOURCE/{file}.pdf")
so the entire STUDY DATA folder can be moved between drives without breaking paths.

Guard: Requires MIGRATE_STORAGE=1 environment variable to execute.
"""
import os
import shutil
import sys
from pathlib import Path

if os.environ.get("MIGRATE_STORAGE") != "1":
    print("=" * 68)
    print("ERROR: Safety guard prevented migration.")
    print("MIGRATE_STORAGE=1 environment variable required to execute storage migration.")
    print("Usage:")
    print("    MIGRATE_STORAGE=1 python scripts/migrate_storage.py")
    print("=" * 68)
    sys.exit(1)

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import settings
from database import get_db_backend, init_sqlite_db
from services.storage_manager import (
    ensure_storage_tree,
    ensure_project_storage,
    format_study_pdf_filename,
    resolve_storage_path,
    get_projects_root,
)


def run_migration() -> int:
    print("=" * 68)
    print("STARTING RADEXTRACT STUDY DATA STORAGE MIGRATION")
    print(f"Target Storage Root: {settings.storage_root}")
    print(f"Database Path:       {settings.db_path}")
    print("=" * 68)

    # 1. Ensure DB schema and columns are initialized
    init_sqlite_db()

    # 2. Ensure top-level directory structure exists
    tree = ensure_storage_tree()
    print(f"✓ Verified storage tree at: {tree['study_data_root']}")

    db = get_db_backend()

    # 2. Query all projects
    projects = db.query("projects", {})
    print(f"Found {len(projects)} project(s) in database.\n")

    total_studies_checked = 0
    total_pdfs_migrated = 0
    total_doclings_migrated = 0
    missing_paths = []

    for proj in projects:
        pid = proj["project_id"]
        pname = proj.get("name") or "Project"
        created_at = proj.get("created_at")

        # Ensure project folder and 8 subfolders exist
        folder_name, proj_dir = ensure_project_storage(
            project_id=pid,
            project_name=pname,
            created_at=created_at,
            db=db,
        )
        source_dir = proj_dir / "01_SOURCE"

        print(f"── Project [{pid[:8]}...] '{pname}'")
        print(f"   Storage folder: {folder_name}")

        studies = db.query("studies", {"project_id": pid})
        for s in studies:
            total_studies_checked += 1
            sid = s["study_id"]
            pdf_path_stored = s.get("pdf_path") or ""

            if not pdf_path_stored:
                continue

            # Check if already migrated to new structure
            clean_stored = pdf_path_stored.replace("\\", "/")
            if "01_SOURCE" in clean_stored and (get_projects_root() / clean_stored).exists():
                print(f"   ✓ Study {sid[:8]} already at {clean_stored}")
                continue

            # Try to resolve physical source file
            source_file = resolve_storage_path(pdf_path_stored)
            if not source_file or not source_file.exists():
                # Check legacy fallback in upload_root or sid.pdf
                candidates = [
                    Path(settings.upload_root) / pdf_path_stored,
                    Path(settings.upload_root) / f"{sid}.pdf",
                    Path(settings.storage_root) / f"{sid}.pdf",
                    Path(settings.storage_root) / f"{pid}/{sid}.pdf",
                ]
                for c in candidates:
                    if c.exists():
                        source_file = c
                        break

            if not source_file or not source_file.exists():
                print(f"   ⚠ Study {sid[:8]}: PDF file not found on disk for '{pdf_path_stored}'")
                missing_paths.append((sid, pdf_path_stored))
                continue

            # Determine new canonical filename: FirstAuthor-Year-ShortTitle.pdf
            new_filename = format_study_pdf_filename(
                author=s.get("authors"),
                year=s.get("publication_year"),
                title=s.get("title"),
                study_id=sid,
            )
            dest_file = source_dir / new_filename
            new_rel_path = f"{folder_name}/01_SOURCE/{new_filename}"

            # Copy PDF if not already identical destination
            if source_file.resolve() != dest_file.resolve():
                shutil.copy2(str(source_file), str(dest_file))
                total_pdfs_migrated += 1

            # Check and copy .docling.json sidecar file
            docling_candidates = [
                source_file.with_suffix(".docling.json"),
                source_file.parent / (source_file.stem + ".docling.json"),
                Path(settings.upload_root) / f"{sid}.docling.json",
                Path(settings.storage_root) / f"{sid}.docling.json",
            ]
            dest_docling = source_dir / (dest_file.stem + ".docling.json")
            for dc in docling_candidates:
                if dc.exists():
                    if dc.resolve() != dest_docling.resolve():
                        shutil.copy2(str(dc), str(dest_docling))
                        total_doclings_migrated += 1
                    break

            # Update DB with relative path
            db.execute(
                "UPDATE studies SET pdf_path = ? WHERE study_id = ?",
                (new_rel_path, sid),
            )
            db.commit()
            print(f"   ✓ Study {sid[:8]} -> {new_rel_path}")

    # 3. Final Verification (CHECK: after migration, zero DB paths point to missing files)
    print("\n" + "=" * 68)
    print("VERIFICATION CHECK: Validating all database PDF paths...")
    print("=" * 68)

    all_studies_with_pdf = db.execute(
        "SELECT study_id, project_id, pdf_path FROM studies WHERE pdf_path IS NOT NULL AND pdf_path != ''"
    ).fetchall()

    missing_post_check = []
    for row in all_studies_with_pdf:
        sp = row["pdf_path"]
        resolved = resolve_storage_path(sp)
        if not resolved or not resolved.exists():
            missing_post_check.append((row["study_id"], sp))

    print(f"Total projects processed:        {len(projects)}")
    print(f"Total studies checked:           {total_studies_checked}")
    print(f"PDFs copied into 01_SOURCE:      {total_pdfs_migrated}")
    print(f"Docling JSONs copied:            {total_doclings_migrated}")
    print(f"Total studies with PDF in DB:    {len(all_studies_with_pdf)}")
    print(f"Verified files existing on disk: {len(all_studies_with_pdf) - len(missing_post_check)}")
    print(f"Missing files after migration:   {len(missing_post_check)}")

    if missing_post_check:
        print("\nWARNING: The following studies have records pointing to missing files:")
        for sid, p in missing_post_check[:10]:
            print(f"  - Study {sid}: {p}")
        if len(missing_post_check) > 10:
            print(f"  ... and {len(missing_post_check) - 10} more.")
        return 1

    print("\n🎉 SUCCESS: All database PDF paths resolve to existing files on disk!")
    print("=" * 68)
    return 0


if __name__ == "__main__":
    sys.exit(run_migration())
