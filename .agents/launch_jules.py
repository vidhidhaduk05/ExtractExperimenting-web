import urllib.request
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# Load .env from the same directory as this script
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

API_KEY = os.environ.get("JULES_API_KEY", "")
if not API_KEY:
    raise RuntimeError("JULES_API_KEY not set. Add it to .agents/.env")
URL = "https://jules.googleapis.com/v1alpha/sessions"

prompt_text = """Fix all failing pytest tests and stabilize deployment configs for ExtractExperimenting:

1. Fix async pytest failures in radextract_platform/backend/tests/:
   - test_ai_screening_pipeline.py::test_start_ai_analysis_direct_function_call
   - test_ai_screening_pipeline.py::test_get_ai_screening_status_unit_function_mock
   - test_export_benchmark.py::test_export_performance_benchmark
   Resolve the "async def functions are not natively supported" errors by configuring pytest-asyncio or using pytest.mark.anyio / asyncio.run(). Ensure the entire backend test suite passes cleanly.
2. Verify radextract_platform/backend/Dockerfile, docker-compose.yml, Caddyfile, requirements.txt, seed.py, backup_db.py.
3. Automatically run pytest and submit a Pull Request with the fixes.
"""

payload = {
    "prompt": prompt_text,
    "sourceContext": {
        "source": "sources/github/vidhidhaduk05/ExtractExperimenting",
        "githubRepoContext": {
            "startingBranch": "main"
        }
    },
    "requirePlanApproval": False,
    "automationMode": "AUTO_CREATE_PR"
}

req = urllib.request.Request(
    URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }
)

try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode('utf-8'))
    print("SESSION_CREATED:", data.get("name"), "URL:", data.get("url"))
except Exception as e:
    print("ERROR:", e)
