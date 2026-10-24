#!/bin/bash
# ==============================================================================
# Complete 3-Tier HPC Agent Stack Launcher & Verifier
# Tier 1: Biomni-R0 GPU Inference Engine (Port 18000)
# Tier 2: FastAPI Platform & Background Workers (Port 8000) with Scratch DB WAL
# Tier 3: Public Ingress Gateway (Cloudflare Tunnel to Port 8000)
# ==============================================================================

set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
PYTHON_BIN="$REPO_DIR/.venv/bin/python"
CLOUDFLARED="/home/vd00026/.local/bin/cloudflared"
JOBS_DIR="$REPO_DIR/jobs"
LOG_DIR="$JOBS_DIR/logs"
BACKEND_DIR="$REPO_DIR/radextract_platform/backend"
mkdir -p "$LOG_DIR"

echo "====================================================================="
echo "   STARTING 3-TIER ALWAYS-ON HPC AGENT ARCHITECTURE"
echo "====================================================================="

# ------------------------------------------------------------------------------
# TIER 1: GPU INFERENCE ENGINE (PORT 18000)
# ------------------------------------------------------------------------------
echo ""
echo "[*] [TIER 1] Verifying GPU Biomni-R0 & Ollama on compute node..."
OLLAMA_BIN="/home/vd00026/.local/bin/ollama"
if ! curl -s --max-time 3 http://127.0.0.1:11434/api/tags | grep -q 'models'; then
    echo "[*] Starting Ollama GPU daemon on port 11434..."
    if [ -x "$OLLAMA_BIN" ]; then
        nohup "$OLLAMA_BIN" serve > "$LOG_DIR/ollama_serve.log" 2>&1 & disown
        for i in {1..15}; do
            if curl -s --max-time 2 http://127.0.0.1:11434/api/tags | grep -q 'models'; then
                echo "[+] Ollama GPU daemon online on port 11434."
                break
            fi
            sleep 1
        done
    fi
fi

if ! curl -s http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
    echo "[*] Launching Tier 1 Biomni Bridge on port 18000..."
    nohup "$PYTHON_BIN" "$JOBS_DIR/biomni_bridge_service.py" > "$LOG_DIR/biomni_bridge.log" 2>&1 & disown
    for i in {1..20}; do
        if curl -s http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
            break
        fi
        sleep 1
    done
fi

T1_MODELS=$(curl -s http://127.0.0.1:18000/v1/models || echo "")
if echo "$T1_MODELS" | grep -q "biomni-r0"; then
    echo "[+] [TIER 1 VERIFIED] Biomni-R0 is ONLINE on http://127.0.0.1:18000"
else
    echo "[-] [TIER 1 ERROR] Biomni-R0 not answering properly on port 18000."
    exit 1
fi

# ------------------------------------------------------------------------------
# TIER 2: FASTAPI PLATFORM & WORKERS (PORT 8000)
# ------------------------------------------------------------------------------
echo ""
echo "[*] [TIER 2] Verifying FastAPI Platform & Workers on Port 8000..."
if ! curl -s http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
    echo "[*] Starting FastAPI platform (uvicorn 2 workers, node-local scratch DB)..."
    export STAGE_DB_SCRATCH="1"
    export LLM_BASE_URL="http://127.0.0.1:18000/v1/chat/completions"
    export LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
    export LLM_MODEL="biomni-r0"
    export LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    export PYTHONPATH="$BACKEND_DIR"

    nohup "$PYTHON_BIN" -m uvicorn main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --workers 2 \
        --timeout-keep-alive 120 \
        > "$LOG_DIR/fastapi_platform.log" 2>&1 & disown

    for i in {1..30}; do
        if curl -s http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
            break
        fi
        sleep 1
    done
fi

T2_HEALTH=$(curl -s http://127.0.0.1:8000/health || echo "")
if echo "$T2_HEALTH" | grep -q '"status":"healthy"'; then
    echo "[+] [TIER 2 VERIFIED] FastAPI platform is ONLINE and healthy on http://127.0.0.1:8000"
else
    echo "[-] [TIER 2 ERROR] FastAPI platform failed to start on port 8000."
    tail -n 25 "$LOG_DIR/fastapi_platform.log"
    exit 1
fi

# ------------------------------------------------------------------------------
# TIER 3: PUBLIC INGRESS GATEWAY (PORT 8000)
# ------------------------------------------------------------------------------
echo ""
echo "[*] [TIER 3] Checking Public Cloudflare Ingress Gateway for Port 8000 on $(hostname)..."
NODE_ID="$(hostname)"
CLOUDFLARED_LOG="$LOG_DIR/cloudflared_${NODE_ID}_8000.log"
TUNNEL_HEALTHY=0

# Only reuse tunnel if cloudflared is actively running on this compute node
if pgrep -f "cloudflared.*8000" > /dev/null; then
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null | tail -n 1 || true)
    if [ -n "$TUNNEL_URL" ]; then
        echo "[*] Local cloudflared process found. Testing active tunnel: $TUNNEL_URL..."
        if curl -s --max-time 6 "$TUNNEL_URL/health" | grep -q '"status":"healthy"'; then
            TUNNEL_HEALTHY=1
            echo "[+] [TIER 3 VERIFIED] Public Ingress is reachable from external internet: $TUNNEL_URL"
        fi
    fi
fi

if [ "$TUNNEL_HEALTHY" -eq 0 ]; then
    echo "[*] Launching fresh public tunnel on ${NODE_ID}..."
    pkill -f "cloudflared.*8000" 2>/dev/null || true
    sleep 2
    nohup "$CLOUDFLARED" tunnel --protocol http2 --url http://127.0.0.1:8000 > "$CLOUDFLARED_LOG" 2>&1 & disown
    
    TUNNEL_URL=""
    for i in {1..30}; do
        TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null | tail -n 1 || true)
        if [ -n "$TUNNEL_URL" ]; then
            if curl -s --max-time 5 "$TUNNEL_URL/health" | grep -q '"status":"healthy"'; then
                break
            fi
        fi
        sleep 1
    done

    if [ -n "$TUNNEL_URL" ]; then
        echo "[+] Fresh tunnel active at $TUNNEL_URL. Auto-publishing to GitHub..."
        bash "$REPO_DIR/jobs/publish_active_tunnel.sh" "$TUNNEL_URL" || true
    else
        echo "[-] Warning: Cloudflare tunnel could not be verified within 30s."
    fi
fi

echo ""
echo "====================================================================="
echo "   HPC AI AGENT STACK FULLY DEPLOYED & OPERATIONAL"
echo "====================================================================="
echo "  [TIER 1] Biomni-R0 Model Server:  http://127.0.0.1:18000/v1"
echo "  [TIER 2] FastAPI App & Workers:   http://127.0.0.1:8000"
echo "  [TIER 3] Public Gateway (Tunnel): $TUNNEL_URL"
echo ""
echo "  >>> PASTE THIS URL INTO YOUR WEB APP MODAL (SETTINGS):"
echo "      $TUNNEL_URL"
echo "====================================================================="
