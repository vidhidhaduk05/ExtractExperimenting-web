import sys
import os
import uuid
from pathlib import Path
import pytest

# Add the backend directory to sys.path so imports work
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


@pytest.fixture
def tmp_path(request):
    """Provide a workspace-local temporary directory to avoid Windows temp sandbox permission errors."""
    base = Path(__file__).parent / ".test_tmp"
    base.mkdir(parents=True, exist_ok=True)
    clean_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in request.node.name)[:50]
    p = base / f"{clean_name}_{uuid.uuid4().hex[:6]}"
    p.mkdir(parents=True, exist_ok=True)
    yield p
