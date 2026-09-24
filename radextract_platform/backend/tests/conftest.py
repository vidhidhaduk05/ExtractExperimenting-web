"""Pytest configuration: ensure backend dir is on sys.path."""
import sys
import os

# Add the backend directory to sys.path so imports work
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
