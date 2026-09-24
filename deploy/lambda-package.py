"""Lambda packaging script for RadExtract.

Builds a self-contained, deployment-ready ZIP artifact for AWS Lambda:
1. Copies backend application code (FastAPI, routers, services, config, database).
2. Packages runtime dependencies via pip target directory without requiring Docker.
3. Excludes development files, SQLite databases, test caches, and temp artifacts.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "radextract_platform" / "backend"
BUILD_DIR = ROOT_DIR / "build"
PACKAGE_DIR = BUILD_DIR / "lambda_pkg"
OUTPUT_ZIP = BUILD_DIR / "lambda-package.zip"

RUNTIME_REQUIREMENTS = [
    "fastapi>=0.110.0",
    "mangum>=0.17.0",
    "pydantic>=2.6.0",
    "pydantic-settings>=2.2.0",
    "boto3>=1.34.0",
    "pyjwt>=2.8.0",
    "bcrypt>=4.1.0",
    "python-multipart>=0.0.9",
    "requests>=2.31.0",
    "scipy>=1.12.0",
    "pandas>=2.2.0",
    "scikit-learn>=1.4.0",
    "numpy>=1.26.0",
]


def clean():
    """Remove previous build directories and zip artifacts."""
    if PACKAGE_DIR.exists():
        shutil.rmtree(PACKAGE_DIR)
    if OUTPUT_ZIP.exists():
        OUTPUT_ZIP.unlink()
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    PACKAGE_DIR.mkdir(parents=True, exist_ok=True)


def install_dependencies(slim: bool = True):
    """Install runtime dependencies directly into the packaging directory."""
    print("Installing runtime dependencies for Lambda...")
    reqs_file = BUILD_DIR / "lambda_requirements.txt"
    with open(reqs_file, "w") as f:
        f.write("\n".join(RUNTIME_REQUIREMENTS) + "\n")

    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--target",
        str(PACKAGE_DIR),
        "-r",
        str(reqs_file),
        "--no-compile",
        "--upgrade",
    ]
    subprocess.run(cmd, check=True)


def copy_backend_code():
    """Copy application Python source files to packaging directory."""
    print("Copying backend source code...")
    exclude_dirs = {
        "__pycache__",
        ".pytest_cache",
        "tests",
        "scripts",
        "data",
        "uploads",
        "exports",
        "output",
        "cache",
    }
    exclude_extensions = {".pyc", ".db", ".sqlite", ".sqlite3", ".log", ".tmp"}

    for root, dirs, files in os.walk(BACKEND_DIR):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        rel_path = Path(root).relative_to(BACKEND_DIR)
        dest_dir = PACKAGE_DIR / rel_path
        dest_dir.mkdir(parents=True, exist_ok=True)

        for file in files:
            file_path = Path(root) / file
            if file_path.suffix in exclude_extensions:
                continue
            shutil.copy2(file_path, dest_dir / file)


def build_zip():
    """Create the final zip file from PACKAGE_DIR."""
    print(f"Creating Lambda deployment archive at: {OUTPUT_ZIP}...")
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(PACKAGE_DIR):
            for file in files:
                file_path = Path(root) / file
                rel_path = file_path.relative_to(PACKAGE_DIR)
                zip_file.write(file_path, arcname=str(rel_path))

    size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)
    print(f"Successfully created {OUTPUT_ZIP} ({size_mb:.2f} MB)")
    return OUTPUT_ZIP


def main():
    clean()
    # Install dependencies only if flag not set or explicitly requested
    skip_deps = "--skip-deps" in sys.argv
    if not skip_deps:
        install_dependencies()
    copy_backend_code()
    build_zip()


if __name__ == "__main__":
    main()
