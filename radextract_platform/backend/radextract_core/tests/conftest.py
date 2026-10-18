"""Pytest configuration for radextract_core tests.

Ensures the backend directory is on sys.path so that
``radextract_core.radextract`` is importable as a package.
"""
import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
