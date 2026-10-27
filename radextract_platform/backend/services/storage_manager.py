"""Storage Manager for RadExtract systematic review projects.

Implements the official RadExtract Storage Plan ("STUDY DATA" folder):
- Root folder: STUDY DATA/ (configured via settings.storage_root)
- Top-level folders:
    _INBOX/        <- Raw incoming downloads (RIS, PDFs from PubMed/publishers)
    _BACKUPS/      <- SQLite database backups (radextract-YYYY-MM-DD.db)
    _TEMPLATES/    <- Extraction templates, RoB blank forms
    PROJECTS/      <- Per-project review archives
- Per-project structure inside PROJECTS/:
    {YYYY-MM-DD_SHORT-NAME}/
        01_SOURCE/     <- Source PDFs (FirstAuthor-Year-ShortTitle.pdf) + .docling.json
        02_SCREENING/  <- RIS export files, screening decision CSVs
        03_EXTRACTION/ <- Extraction sheets (Excel/CSV, SRMA workbooks)
        04_ROB/        <- Risk-of-bias assessments (JSON, reports, sheets)
        05_GRADE/      <- GRADE evidence profiles
        06_META/       <- Effect tables, forest plots, funnel plots
        07_EXPORTS/    <- PRISMA diagrams (SVG, PNG, DOCX, CSV), final tables, figures
        08_AUDIT/      <- Paper-trail search histories, logs, reviewer notes

Relative Paths:
The database stores paths RELATIVE to settings.storage_root (e.g. "{folder}/01_SOURCE/Kastrati-2019-IVI-PCI-RCT.pdf").
This allows moving the entire STUDY DATA folder to another drive without breaking any database links.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import sqlite3
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from config import settings

logger = logging.getLogger("radextract.storage")

# Numbered stage subfolder definitions (Work Order Part A & B4)
STAGE_SUBFOLDERS: dict[str, str] = {
    "source": "01_SOURCE",
    "01_source": "01_SOURCE",
    "01": "01_SOURCE",
    "screening": "02_SCREENING",
    "02_screening": "02_SCREENING",
    "02": "02_SCREENING",
    "extraction": "03_EXTRACTION",
    "03_extraction": "03_EXTRACTION",
    "03": "03_EXTRACTION",
    "rob": "04_ROB",
    "04_rob": "04_ROB",
    "04": "04_ROB",
    "grade": "05_GRADE",
    "05_grade": "05_GRADE",
    "05": "05_GRADE",
    "meta": "06_META",
    "06_meta": "06_META",
    "06": "06_META",
    "exports": "07_EXPORTS",
    "07_exports": "07_EXPORTS",
    "07": "07_EXPORTS",
    "audit": "08_AUDIT",
    "08_audit": "08_AUDIT",
    "08": "08_AUDIT",
}

ALL_SUBFOLDERS: list[str] = [
    "01_SOURCE",
    "02_SCREENING",
    "03_EXTRACTION",
    "04_ROB",
    "05_GRADE",
    "06_META",
    "07_EXPORTS",
    "08_AUDIT",
]


def get_projects_root() -> Path:
    """Return the absolute Path for PROJECTS root (settings.storage_root)."""
    return Path(settings.storage_root).resolve()


def get_study_data_root() -> Path:
    """Return the root STUDY DATA directory (parent of PROJECTS if storage_root ends with PROJECTS)."""
    p = get_projects_root()
    if p.name.upper() in ("PROJECTS", "PROJECT"):
        return p.parent
    return p


def ensure_storage_tree() -> dict[str, Path]:
    """Ensure the top-level STUDY DATA folder structure exists."""
    study_data = get_study_data_root()
    projects = get_projects_root()

    inbox = study_data / "_INBOX"
    backups = study_data / "_BACKUPS"
    templates = study_data / "_TEMPLATES"
    archive = projects / "_ARCHIVE"

    for d in (study_data, projects, inbox, backups, templates, archive):
        d.mkdir(parents=True, exist_ok=True)

    return {
        "study_data_root": study_data,
        "projects_root": projects,
        "inbox": inbox,
        "backups": backups,
        "templates": templates,
        "archive": archive,
    }


def sanitize_folder_name(name: str) -> str:
    """Convert arbitrary project name into a clean, filesystem-safe short name."""
    if not name:
        return "PROJECT"
    # Normalize unicode characters (e.g., accents)
    n = unicodedata.normalize("NFKD", name).encode("ASCII", "ignore").decode("utf-8")
    # Replace non-alphanumeric with hyphens
    n = re.sub(r"[^A-Za-z0-9]+", "-", n)
    # Deduplicate consecutive hyphens and strip leading/trailing
    n = re.sub(r"-{2,}", "-", n).strip("-")
    # Limit length
    return n[:48] if n else "PROJECT"


def generate_project_folder_name(project_name: str, created_at: Optional[str] = None) -> str:
    """Generate YYYY-MM-DD_SHORT-NAME according to Storage Plan Naming Rule 1."""
    date_prefix = ""
    if created_at:
        try:
            # Handle ISO timestamp or YYYY-MM-DD string
            date_prefix = str(created_at)[:10]
            datetime.strptime(date_prefix, "%Y-%m-%d")
        except Exception:
            date_prefix = ""

    if not date_prefix:
        date_prefix = datetime.now().strftime("%Y-%m-%d")

    short_name = sanitize_folder_name(project_name)
    return f"{date_prefix}_{short_name}"


def ensure_project_storage(
    project_id: str,
    project_name: Optional[str] = None,
    created_at: Optional[str] = None,
    db: Optional[Any] = None,
) -> tuple[str, Path]:
    """Ensure project storage folder and all 8 subfolders exist.

    Returns:
        tuple (storage_folder_relative_name, project_directory_path)
    """
    ensure_storage_tree()
    projects_root = get_projects_root()

    folder_name: Optional[str] = None

    # Check database if db is available
    if db is not None:
        try:
            row = db.get("projects", project_id)
            if row:
                folder_name = row.get("storage_folder")
                if not project_name:
                    project_name = row.get("name")
                if not created_at:
                    created_at = row.get("created_at")
        except Exception as e:
            logger.debug(f"[Storage] Could not query db for project {project_id}: {e}")

    # Generate if not yet set
    if not folder_name:
        base_name = generate_project_folder_name(project_name or "Project", created_at)
        candidate = base_name
        target_dir = projects_root / candidate

        # Collision avoidance: if directory exists and belongs to a different project
        suffix = 2
        while target_dir.exists() and not _is_same_project_dir(target_dir, project_id):
            candidate = f"{base_name}-{suffix}"
            target_dir = projects_root / candidate
            suffix += 1

        folder_name = candidate

        # Save to DB if connection available
        if db is not None:
            try:
                db.execute(
                    "UPDATE projects SET storage_folder = ? WHERE project_id = ?",
                    (folder_name, project_id),
                )
                db.commit()
            except Exception as e:
                logger.warning(f"[Storage] Could not update storage_folder for {project_id}: {e}")

    project_dir = projects_root / folder_name
    project_dir.mkdir(parents=True, exist_ok=True)

    # Store project ID marker in folder for audit/ownership check
    marker_file = project_dir / ".project_id"
    if not marker_file.exists():
        try:
            marker_file.write_text(project_id, encoding="utf-8")
        except Exception:
            pass

    # Ensure all 8 subfolders exist
    for sub in ALL_SUBFOLDERS:
        (project_dir / sub).mkdir(parents=True, exist_ok=True)

    return folder_name, project_dir


def _is_same_project_dir(proj_dir: Path, project_id: str) -> bool:
    """Check if existing directory belongs to this project via .project_id marker."""
    marker = proj_dir / ".project_id"
    if marker.exists():
        try:
            return marker.read_text(encoding="utf-8").strip() == project_id
        except Exception:
            return False
    return False


def get_stage_folder(project_id: str, stage: str, db: Optional[Any] = None) -> Path:
    """Return the absolute path to a specific stage folder (01 through 08)."""
    subfolder = STAGE_SUBFOLDERS.get(stage.lower(), "07_EXPORTS")
    _, proj_dir = ensure_project_storage(project_id, db=db)
    target = proj_dir / subfolder
    target.mkdir(parents=True, exist_ok=True)
    return target


def sanitize_filename_token(text: Optional[str], max_len: int = 40) -> str:
    """Sanitize a token (author, title) for use in PDF filename (alphanumeric + hyphen only)."""
    if not text:
        return ""
    # Normalize unicode
    t = unicodedata.normalize("NFKD", str(text)).encode("ASCII", "ignore").decode("utf-8")
    # Replace whitespace and punctuation with hyphens
    t = re.sub(r"[^A-Za-z0-9]+", "-", t)
    # Deduplicate hyphens and strip
    t = re.sub(r"-{2,}", "-", t).strip("-")
    return t[:max_len]


def format_study_pdf_filename(
    author: Optional[str],
    year: Optional[Any],
    title: Optional[str],
    study_id: str,
) -> str:
    """Format PDF filename per Storage Plan Rule 2: FirstAuthor-Year-ShortTitle.pdf.

    Falls back to {study_id}.pdf if required metadata is missing. Never uses original browser name.
    """
    clean_author = ""
    if author:
        # If author format is "Last, First" or "Last First", extract first author's last name
        author_str = str(author).strip()
        first_token = re.split(r"[,;\n&]| and ", author_str, flags=re.IGNORECASE)[0].strip()
        # If format is "First Last", take the last word; if "Last", take it
        words = first_token.split()
        if len(words) > 1 and not ("," in author_str):
            clean_author = sanitize_filename_token(words[-1], max_len=25)
        else:
            clean_author = sanitize_filename_token(words[0] if words else "", max_len=25)

    # Clean year (must be 4-digit year)
    clean_year = ""
    if year:
        match = re.search(r"\b(19\d\d|20\d\d)\b", str(year))
        if match:
            clean_year = match.group(1)

    # Clean title
    clean_title = ""
    if title:
        title_words = str(title).strip().split()
        # Take first 3-5 words
        short_title = " ".join(title_words[:5])
        clean_title = sanitize_filename_token(short_title, max_len=35)

    if clean_author and clean_year and clean_title:
        return f"{clean_author}-{clean_year}-{clean_title}.pdf"

    # Fallback to study_id.pdf per Step B3 specification
    return f"{study_id}.pdf"


def resolve_storage_path(stored_path: Optional[str]) -> Optional[Path]:
    """Resolve a relative or absolute stored path to an absolute Path on the current system.

    Handles:
    - Relative paths to settings.storage_root (e.g. "{folder}/01_SOURCE/{file}.pdf")
    - Absolute paths that exist
    - Paths with Windows (\\) or POSIX (/) separators
    - Fallback to legacy upload_root / export_root if file still resides there
    """
    if not stored_path:
        return None

    # If absolute and exists, return immediately
    p = Path(stored_path)
    if p.is_absolute() and p.exists():
        return p

    # Normalize separators
    norm = stored_path.replace("\\", "/").lstrip("/")

    # Check relative to storage_root (PROJECTS)
    candidate = get_projects_root() / norm
    if candidate.exists():
        return candidate

    # Check relative to STUDY DATA root
    candidate_study = get_study_data_root() / norm
    if candidate_study.exists():
        return candidate_study

    # Legacy fallback: upload_root
    legacy_upload = Path(settings.upload_root) / norm
    if legacy_upload.exists():
        return legacy_upload

    # Legacy fallback: export_root
    legacy_export = Path(settings.export_root) / norm
    if legacy_export.exists():
        return legacy_export

    # If not on disk, return canonical location relative to storage_root
    return candidate


def save_study_pdf(
    project_id: str,
    study_id: str,
    content: bytes,
    author: Optional[str] = None,
    year: Optional[Any] = None,
    title: Optional[str] = None,
    db: Optional[Any] = None,
) -> tuple[str, Path]:
    """Save an uploaded PDF into {project_folder}/01_SOURCE/{FirstAuthor-Year-ShortTitle.pdf}.

    Returns:
        tuple (relative_path_for_db, absolute_path_on_disk)
    """
    folder_name, proj_dir = ensure_project_storage(project_id, db=db)
    source_dir = proj_dir / "01_SOURCE"
    source_dir.mkdir(parents=True, exist_ok=True)

    filename = format_study_pdf_filename(author, year, title, study_id)
    dest_path = source_dir / filename
    dest_path.write_bytes(content)

    rel_path = f"{folder_name}/01_SOURCE/{filename}"
    return rel_path, dest_path


def save_stage_file(
    project_id: str,
    stage: str,
    filename: str,
    content: bytes | str,
    db: Optional[Any] = None,
) -> tuple[str, Path]:
    """Save a generated file (screening, extraction, RoB, PRISMA, etc.) to its numbered stage folder.

    Returns:
        tuple (relative_path_for_db, absolute_path_on_disk)
    """
    subfolder = STAGE_SUBFOLDERS.get(stage.lower(), "07_EXPORTS")
    folder_name, proj_dir = ensure_project_storage(project_id, db=db)
    stage_dir = proj_dir / subfolder
    stage_dir.mkdir(parents=True, exist_ok=True)

    clean_filename = os.path.basename(filename).replace("\\", "").replace("/", "")
    dest_path = stage_dir / clean_filename

    if isinstance(content, str):
        dest_path.write_text(content, encoding="utf-8")
    else:
        dest_path.write_bytes(content)

    rel_path = f"{folder_name}/{subfolder}/{clean_filename}"
    return rel_path, dest_path


def archive_project_storage(project_id: str, db: Optional[Any] = None) -> Optional[Path]:
    """Archive a project folder into PROJECTS/_ARCHIVE per Rule 3 ('Never delete a project folder')."""
    ensure_storage_tree()
    projects_root = get_projects_root()
    archive_dir = projects_root / "_ARCHIVE"
    archive_dir.mkdir(parents=True, exist_ok=True)

    folder_name = None
    if db is not None:
        try:
            row = db.get("projects", project_id)
            if row:
                folder_name = row.get("storage_folder")
        except Exception:
            pass

    if not folder_name:
        for item in projects_root.iterdir():
            if item.is_dir() and _is_same_project_dir(item, project_id):
                folder_name = item.name
                break

    if not folder_name:
        return None

    source_dir = projects_root / folder_name
    if not source_dir.exists():
        return None

    dest_dir = archive_dir / folder_name
    if dest_dir.exists():
        dest_dir = archive_dir / f"{folder_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    shutil.move(str(source_dir), str(dest_dir))
    logger.info(f"[Storage] Archived project {project_id} from {source_dir} to {dest_dir}")
    return dest_dir


def backup_database(db_path: Optional[str] = None, max_backups: int = 8) -> Path:
    """Safely back up the SQLite database to STUDY DATA/_BACKUPS/radextract-YYYY-MM-DD.db.

    Uses SQLite online backup API to ensure WAL-safe consistency even while active.
    Maintains the last `max_backups` (default 8) copies.
    """
    ensure_storage_tree()
    backups_dir = get_study_data_root() / "_BACKUPS"
    backups_dir.mkdir(parents=True, exist_ok=True)

    source_db = Path(db_path or settings.db_path).resolve()
    if not source_db.exists():
        raise FileNotFoundError(f"Database not found at {source_db}")

    today_str = datetime.now().strftime("%Y-%m-%d")
    dest_name = f"radextract-{today_str}.db"
    dest_path = backups_dir / dest_name

    # If same-day backup already exists, append timestamp
    if dest_path.exists():
        time_str = datetime.now().strftime("%H%M%S")
        dest_path = backups_dir / f"radextract-{today_str}_{time_str}.db"

    # Online SQLite backup (WAL safe)
    src_conn = sqlite3.connect(str(source_db), timeout=30.0)
    dst_conn = sqlite3.connect(str(dest_path), timeout=30.0)
    try:
        with dst_conn:
            src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    logger.info(f"[Storage] Database backed up to {dest_path}")

    # Rotate old backups: keep latest max_backups
    existing = sorted(backups_dir.glob("radextract-*.db"), key=lambda f: f.stat().st_mtime, reverse=True)
    for old_file in existing[max_backups:]:
        try:
            old_file.unlink()
            logger.info(f"[Storage] Pruned old backup {old_file.name}")
        except Exception as e:
            logger.warning(f"[Storage] Could not prune {old_file}: {e}")

    return dest_path
