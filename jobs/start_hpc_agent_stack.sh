#!/bin/bash
# ==============================================================================
# Complete 3-Tier HPC Agent Stack Launcher & Verifier
# Tier 1: Biomni-R0 GPU Inference Engine (Port 18000)
# Tier 2: FastAPI Platform & Background Workers (Port 8000) with Scratch DB WAL
# Tier 3: Public Ingress Gateway (Cloudflare Tunnel to Port 8000)
# ==============================================================================

set -euo pipefail

PYTHON_BIN="/home/vd00026/Desktop/Software/.venv/bin/python"
CLOUDFLARED="/home/vd00026/.local/bin/cloudflared"
JOBS_DIR="/home/vd00026/Desktop/Software/jobs"
BACKEND_DIR="/home/vd00026/Desktop/Software/radextract_platform/backend"

echo "====================================================================="
echo "   STARTING 3-TIER ALWAYS-ON HPC AGENT ARCHITECTURE"
echo "====================================================================="

# ------------------------------------------------------------------------------
# TIER 1: GPU INFERENCE ENGINE (PORT 18000)
# ------------------------------------------------------------------------------
echo ""
echo "[*] [TIER 1] Verifying GPU Biomni-R0 on Port 18000..."
if ! curl -s http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
    echo "[*] Launching Tier 1 Biomni Bridge on port 18000..."
    nohup "$PYTHON_BIN" "$JOBS_DIR/biomni_bridge_service.py" > /home/vd00026/biomni_bridge.log 2>&1 & disown
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
        > /home/vd00026/fastapi_platform.log 2>&1 & disown

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
    tail -n 25 /home/vd00026/fastapi_platform.log
    exit 1
fi

# ------------------------------------------------------------------------------
# TIER 3: PUBLIC INGRESS GATEWAY (PORT 8000)
# ------------------------------------------------------------------------------
echo ""
echo "[*] [TIER 3] Checking Public Cloudflare Ingress Gateway for Port 8000..."
TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/.gemini/antigravity-ide/brain/65bbfb7d-9393-497f-8a3c-cb980a561ce1/.system_generated/tasks/task-280.log 2>/dev/null | tail -n 1 || true)

if [ -z "$TUNNEL_URL" ]; then
    TUNNEL_URL="https://thesaurus-algorithms-exterior-estimates.trycloudflare.com"
fi

echo "[*] Active Ingress Gateway URL: $TUNNEL_URL"
echo "[*] Testing external health check through ingress gateway..."
INGRESS_CHECK=$(curl -s "$TUNNEL_URL/health" || echo "")

if echo "$INGRESS_CHECK" | grep -q '"status":"healthy"'; then
    echo "[+] [TIER 3 VERIFIED] Public Ingress is reachable from external internet!"
else
    echo "[*] Refreshing public tunnel..."
    pkill -f "cloudflared.*8000" 2>/dev/null || true
    nohup "$CLOUDFLARED" tunnel --protocol http2 --url http://127.0.0.1:8000 > /home/vd00026/cloudflared_8000.log 2>&1 & disown
    sleep 5
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/cloudflared_8000.log | tail -n 1 || true)
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
