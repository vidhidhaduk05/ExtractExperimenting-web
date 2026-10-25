#!/bin/bash
# ==============================================================================
# Tier 2: FastAPI Platform & Background Workers Launcher
# Port: 8000 (0.0.0.0:8000)
# Workers: 2-4 concurrent uvicorn workers
# DB Storage: Node-local scratch (/tmp) with SQLite WAL mode
# LLM Backend: Local Tier 1 Biomni-R0 on http://127.0.0.1:18000/v1
# ==============================================================================

set -euo pipefail

BACKEND_DIR="/home/vd00026/Desktop/Software/radextract_platform/backend"
PYTHON_BIN="/home/vd00026/Desktop/Software/.venv/bin/python"
LOG_FILE="/home/vd00026/fastapi_platform.log"

echo "=== Launching Tier 2: FastAPI Platform & Workers (Port 8000) ==="

# 1. Stop existing FastAPI on port 8000 if running
pkill -f "uvicorn.*8000" 2>/dev/null || true
sleep 1

# 2. Configure environment pointing to Tier 1 Biomni (127.0.0.1:18000) & scratch DB
export LLM_BASE_URL="http://127.0.0.1:18000/v1/chat/completions"
export LLM_API_URL="http://127.0.0.1:18000/v1/chat/completions"
export LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
export LLM_MODEL="biomni-r0"
export LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"

export RADEXTRACT_LLM_API_URL="http://127.0.0.1:18000/v1/chat/completions"
export RADEXTRACT_LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
export RADEXTRACT_LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
export RADEXTRACT_LLM_MODEL="biomni-r0"

export STAGE_DB_SCRATCH="1"
export ENVIRONMENT="production"
export PYTHONPATH="$BACKEND_DIR"
cd "$BACKEND_DIR"

# 3. Launch uvicorn with 2 workers on 0.0.0.0:8000
echo "[*] Starting uvicorn with 2 workers on 0.0.0.0:8000..."
nohup "$PYTHON_BIN" -m uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --timeout-keep-alive 120 \
  > "$LOG_FILE" 2>&1 & disown

# 4. Wait for /health to become available
echo "[*] Waiting for FastAPI to initialize..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
    echo "[+] FastAPI platform is healthy on http://127.0.0.1:8000/health !"
    curl -s http://127.0.0.1:8000/health
    echo ""
    exit 0
  fi
  sleep 1
done

echo "[-] Timed out waiting for FastAPI on port 8000. Check $LOG_FILE"
tail -n 25 "$LOG_FILE"
exit 1
