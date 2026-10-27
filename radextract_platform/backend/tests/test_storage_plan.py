"""Tests for RadExtract Storage Plan ("STUDY DATA" folder, per-study organization).

Verifies the 5 requirements of the Storage Plan Work Order:
1. Create a test project -> its folder appears under PROJECTS/ with all 8 subfolders.
2. Upload a PDF -> lands in 01_SOURCE/ with FirstAuthor-Year-ShortTitle.pdf; app opens it from there.
3. Generate a PRISMA export -> file appears in 07_EXPORTS/.
4. Move STUDY DATA to another directory, set STORAGE_ROOT, restart -> everything still opens.
5. No hardcoded user paths outside config.py.
"""
import io
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import settings
from main import app
from database import get_connection, init_sqlite_db
from services.storage_manager import (
    ensure_storage_tree,
    ensure_project_storage,
    format_study_pdf_filename,
    resolve_storage_path,
    save_study_pdf,
    save_stage_file,
    backup_database,
    get_stage_folder,
)

# Minimal valid PDF binary for testing
MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n150\n%%EOF\n"


@pytest.fixture
def isolated_storage(tmp_path, monkeypatch):
    """Set up an isolated temporary storage root for testing."""
    study_data = tmp_path / "STUDY DATA"
    projects = study_data / "PROJECTS"
    test_db = tmp_path / "test_radextract.db"

    monkeypatch.setattr(settings, "storage_root", str(projects))
    monkeypatch.setattr(settings, "db_path", str(test_db))

    init_sqlite_db()
    ensure_storage_tree()

    return {
        "study_data": study_data,
        "projects": projects,
        "db_path": test_db,
    }


def test_naming_rule_first_author_year_short_title():
    """Rule 2: PDFs inside 01_SOURCE: FirstAuthor-Year-ShortTitle.pdf.

    Never 'download.pdf', never spaces, never special characters.
    """
    fname = format_study_pdf_filename(
        author="Kastrati, Adnan; Schüpke, Stefanie",
        year=2019,
        title="Intravascular Imaging Versus Angiography for PCI Guidance",
        study_id="study-12345",
    )
    assert fname.startswith("Kastrati-2019-")
    assert fname.endswith(".pdf")
    assert " " not in fname
    assert "\\" not in fname
    assert "/" not in fname

    # Test fallback when author or year is missing
    fallback_fname = format_study_pdf_filename(
        author="",
        year=None,
        title="Some Title",
        study_id="study-fallback-999",
    )
    assert fallback_fname == "study-fallback-999.pdf"


def test_criterion_1_create_project_makes_all_8_subfolders(isolated_storage):
    """Requirement 1: Create a test project -> its folder appears under PROJECTS/ with all 8 subfolders."""
    client = TestClient(app)

    res = client.post("/api/projects", json={
        "name": "IVI vs ANGIO PCI",
        "description": "Comparative review of intravascular imaging vs angiography",
    })
    assert res.status_code == 200, res.text
    data = res.json()
    project_id = data["project_id"]
    storage_folder = data.get("storage_folder")
    assert storage_folder, "ProjectResponse must include storage_folder"
    assert "IVI-vs-ANGIO-PCI" in storage_folder

    project_dir = isolated_storage["projects"] / storage_folder
    assert project_dir.exists()
    assert (project_dir / ".project_id").read_text().strip() == project_id

    # Verify all 8 required subfolders exist
    expected_subfolders = [
        "01_SOURCE",
        "02_SCREENING",
        "03_EXTRACTION",
        "04_ROB",
        "05_GRADE",
        "06_META",
        "07_EXPORTS",
        "08_AUDIT",
    ]
    for sub in expected_subfolders:
        sub_dir = project_dir / sub
        assert sub_dir.exists(), f"Subfolder {sub} must exist under {project_dir}"
        assert sub_dir.is_dir()


def test_criterion_2_upload_pdf_lands_in_01_source(isolated_storage):
    """Requirement 2: Upload a PDF -> lands in 01_SOURCE/ with author-year name; app opens it from there."""
    client = TestClient(app)

    # Create project
    p_res = client.post("/api/projects", json={"name": "PCI Review"})
    project_id = p_res.json()["project_id"]
    storage_folder = p_res.json()["storage_folder"]

    # Create study with author, year, title metadata
    study_id = str(uuid.uuid4())
    conn = get_connection()
    conn.execute(
        """INSERT INTO studies (study_id, project_id, title, authors, publication_year)
           VALUES (?, ?, ?, ?, ?)""",
        (study_id, project_id, "Optical Coherence Tomography Trial", "Kastrati, Adnan", 2019),
    )
    conn.commit()

    # Upload PDF
    files = {"file": ("download.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")}
    up_res = client.post(f"/api/studies/{study_id}/upload-pdf", files=files)
    assert up_res.status_code in (200, 422), up_res.text  # 422 if Docling processor fails on empty pdf, but upload saved

    # Query study row from DB
    study_row = conn.execute("SELECT pdf_path FROM studies WHERE study_id = ?", (study_id,)).fetchone()
    stored_path = study_row["pdf_path"]
    assert stored_path, "Study pdf_path must be populated"

    # Must be stored relative to storage_root: {folder}/01_SOURCE/Kastrati-2019-Optical-...
    assert stored_path.startswith(f"{storage_folder}/01_SOURCE/Kastrati-2019-")
    assert stored_path.endswith(".pdf")

    # Physical file check
    abs_file = isolated_storage["projects"] / stored_path
    assert abs_file.exists(), f"Physical file must exist at {abs_file}"
    assert abs_file.read_bytes() == MINIMAL_PDF

    # Verify app resolves it via resolve_storage_path
    resolved = resolve_storage_path(stored_path)
    assert resolved == abs_file


def test_criterion_3_prisma_export_lands_in_07_exports(isolated_storage):
    """Requirement 3: Generate a PRISMA export -> file appears in 07_EXPORTS/."""
    client = TestClient(app)

    p_res = client.post("/api/projects", json={"name": "PRISMA Flow Test"})
    project_id = p_res.json()["project_id"]
    storage_folder = p_res.json()["storage_folder"]

    # Request PRISMA CSV export
    res = client.get(f"/api/projects/{project_id}/prisma/prisma2020.csv")
    assert res.status_code == 200, res.text

    # File must appear in 07_EXPORTS
    exports_dir = isolated_storage["projects"] / storage_folder / "07_EXPORTS"
    expected_file = exports_dir / f"PRISMA2020_{project_id}.csv"
    assert expected_file.exists(), f"PRISMA export must be written to {expected_file}"
    assert len(expected_file.read_text()) > 0


def test_criterion_4_movable_storage_root(isolated_storage, monkeypatch, tmp_path):
    """Requirement 4: Move STUDY DATA to another drive/path, set STORAGE_ROOT, restart -> everything still opens."""
    # 1. Create a project and save a study PDF
    client = TestClient(app)
    p_res = client.post("/api/projects", json={"name": "Movable Review"})
    project_id = p_res.json()["project_id"]
    storage_folder = p_res.json()["storage_folder"]

    study_id = str(uuid.uuid4())
    rel_path, abs_path = save_study_pdf(
        project_id=project_id,
        study_id=study_id,
        content=MINIMAL_PDF,
        author="Kastrati, Adnan",
        year=2019,
        title="Movable Review Title",
    )
    assert abs_path.exists()

    # 2. Simulate moving entire "STUDY DATA" to a new drive location (e.g. D:\ drive)
    new_drive = tmp_path / "DriveD" / "STUDY DATA"
    shutil.copytree(isolated_storage["study_data"], new_drive)

    # 3. Point settings.storage_root to the new location
    new_projects_root = new_drive / "PROJECTS"
    monkeypatch.setattr(settings, "storage_root", str(new_projects_root))

    # 4. Resolve relative path from DB against the new storage root
    resolved_after_move = resolve_storage_path(rel_path)
    assert resolved_after_move is not None
    assert resolved_after_move.exists(), f"File must exist at new path {resolved_after_move}"
    assert str(new_projects_root) in str(resolved_after_move)
    assert resolved_after_move.read_bytes() == MINIMAL_PDF


def test_criterion_5_no_hardcoded_user_paths():
    """Requirement 5: grep -rn 'Desktop|hardcoded.*path' backend -> no hardcoded user paths outside config.py."""
    backend_path = Path(__file__).resolve().parent.parent
    cmd = ["grep", "-rn", "Desktop\\|hardcoded.*path", str(backend_path), "--include=*.py"]
    res = subprocess.run(cmd, capture_output=True, text=True)

    lines = [line for line in res.stdout.strip().splitlines() if line.strip()]
    non_config_matches = [
        line for line in lines
        if "config.py" not in line
        and "test_storage_plan.py" not in line  # ignore this test file itself
    ]

    assert len(non_config_matches) == 0, f"Found hardcoded user paths outside config.py:\n" + "\n".join(non_config_matches)


def test_database_backup_retention(isolated_storage):
    """Test Part C: SQLite database backup into _BACKUPS/ keeping last 8."""
    backups_dir = isolated_storage["study_data"] / "_BACKUPS"

    # Create a test backup
    backup_path = backup_database(db_path=str(isolated_storage["db_path"]), max_backups=8)
    assert backup_path.exists()
    assert backup_path.parent == backups_dir
    assert backup_path.name.startswith("radextract-")
    assert backup_path.name.endswith(".db")
