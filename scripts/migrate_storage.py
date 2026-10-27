#!/usr/bin/env python3
"""Wrapper to run migrate_storage.py from repo root using the project virtualenv."""
import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
venv_python = root_dir / ".venv" / "bin" / "python"
if not venv_python.exists():
    venv_python = root_dir / ".venv" / "Scripts" / "python.exe"

py_exe = str(venv_python) if venv_python.exists() else sys.executable
backend_script = root_dir / "radextract_platform" / "backend" / "scripts" / "migrate_storage.py"

os.execv(py_exe, [py_exe, str(backend_script)] + sys.argv[1:])
