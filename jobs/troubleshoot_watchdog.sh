#!/bin/bash
# ==============================================================================
# RadExtract HPC Automated Troubleshooter & Watchdog
# Runs periodically (every 3 minutes). Performs active self-healing and
# notifies vidhidhaduk05@gmail.com on any anomaly and its resolution.
# ==============================================================================

set -uo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
PYTHON_BIN="$REPO_DIR/.venv/bin/python"
CLOUDFLARED="/home/vd00026/.local/bin/cloudflared"
NOTIFIER="$REPO_DIR/jobs/hpc_notifier.py"
LOG_FILE="/home/vd00026/troubleshoot_watchdog.log"
CURRENT_JOB="${SLURM_JOB_ID:-local}"

exec >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running automated troubleshooting health scan..."

# ------------------------------------------------------------------------------
# 1. Tier 1: Biomni-R0 GPU Model Server (Port 18000)
# ------------------------------------------------------------------------------
if ! curl -s --max-time 5 http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
    echo "[!] Tier 1 Biomni-R0 on port 18000 is UNRESPONSIVE. Initiating auto-recovery..."
    pkill -f "biomni_bridge_service.py" 2>/dev/null || true
    sleep 2
    nohup "$PYTHON_BIN" "$REPO_DIR/jobs/biomni_bridge_service.py" > /home/vd00026/biomni_bridge.log 2>&1 & disown

    # Verify recovery
    RECOVERED=0
    for i in {1..20}; do
        if curl -s --max-time 3 http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
            RECOVERED=1
            break
        fi
        sleep 1
    done

    if [ "$RECOVERED" -eq 1 ]; then
        echo "[+] Biomni-R0 successfully recovered."
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 1: Biomni-R0 GPU" "Port 18000 unresponsive" "Killed stale process, restarted bridge service, verified /health OK" || true
    else
        echo "[-] Biomni-R0 recovery failed."
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 1: Biomni-R0 GPU" "Port 18000 unresponsive" "Restart attempt failed to return healthy within 20s" "FAILED" || true
    fi
else
    echo "[+] Tier 1 (Biomni-R0:18000): Healthy"
fi

# ------------------------------------------------------------------------------
# 2. Tier 2: FastAPI Backend Platform (Port 8000)
# ------------------------------------------------------------------------------
if ! curl -s --max-time 5 http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
    echo "[!] Tier 2 FastAPI on port 8000 is UNRESPONSIVE. Initiating auto-recovery..."
    pkill -f "uvicorn main:app.*8000" 2>/dev/null || true
    sleep 2

    export STAGE_DB_SCRATCH="1"
    export LLM_BASE_URL="http://127.0.0.1:18000/v1/chat/completions"
    export LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
    export LLM_MODEL="biomni-r0"
    export LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    export PYTHONPATH="$REPO_DIR/radextract_platform/backend"

    nohup "$PYTHON_BIN" -m uvicorn main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --workers 2 \
        --timeout-keep-alive 120 \
        > /home/vd00026/fastapi_platform.log 2>&1 & disown

    RECOVERED=0
    for i in {1..25}; do
        if curl -s --max-time 3 http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
            RECOVERED=1
            break
        fi
        sleep 1
    done

    if [ "$RECOVERED" -eq 1 ]; then
        echo "[+] FastAPI successfully recovered."
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 2: FastAPI Backend" "Port 8000 unresponsive" "Cleaned worker pool, restarted uvicorn with scratch DB, verified /health OK" || true
    else
        echo "[-] FastAPI recovery failed."
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 2: FastAPI Backend" "Port 8000 unresponsive" "Uvicorn failed to respond within 25s" "FAILED" || true
    fi
else
    echo "[+] Tier 2 (FastAPI:8000): Healthy"
fi

# ------------------------------------------------------------------------------
# 3. Tier 3: Public Cloudflare Ingress Gateway
# ------------------------------------------------------------------------------
CURRENT_URL=$(cat "$REPO_DIR/public/active_backend.json" 2>/dev/null | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | head -n 1 || true)
TUNNEL_HEALTHY=0

if [ -n "$CURRENT_URL" ]; then
    if curl -s --max-time 8 "$CURRENT_URL/health" | grep -q '"status":"healthy"'; then
        TUNNEL_HEALTHY=1
        echo "[+] Tier 3 (Cloudflare Gateway): Healthy at $CURRENT_URL"
    fi
fi

if [ "$TUNNEL_HEALTHY" -eq 0 ]; then
    echo "[!] Cloudflare Ingress is OFFLINE or severed. Re-establishing fresh tunnel..."
    pkill -f "cloudflared.*8000" 2>/dev/null || true
    sleep 2

    nohup "$CLOUDFLARED" tunnel --protocol http2 --url http://127.0.0.1:8000 > /home/vd00026/cloudflared_8000.log 2>&1 & disown

    NEW_URL=""
    for i in {1..30}; do
        NEW_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/cloudflared_8000.log 2>/dev/null | tail -n 1 || true)
        if [ -n "$NEW_URL" ]; then
            if curl -s --max-time 6 "$NEW_URL/health" | grep -q '"status":"healthy"'; then
                break
            fi
        fi
        sleep 1
    done

    if [ -n "$NEW_URL" ]; then
        echo "[+] Fresh tunnel active at $NEW_URL. Auto-publishing to GitHub..."
        bash "$REPO_DIR/jobs/publish_active_tunnel.sh" "$NEW_URL" || true
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 3: Public Ingress Gateway" "Tunnel connection severed" "Launched fresh tunnel ($NEW_URL) and published to GitHub Pages" || true
    else
        echo "[-] Cloudflare tunnel recovery failed."
        "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Tier 3: Public Ingress Gateway" "Tunnel connection severed" "Cloudflared could not establish public endpoint" "FAILED" || true
    fi
fi

# ------------------------------------------------------------------------------
# 4. Storage & Memory Sanitation
# ------------------------------------------------------------------------------
# Check /tmp disk usage
TMP_USAGE=$(df /tmp | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$TMP_USAGE" -gt 90 ]; then
    echo "[!] /tmp is at ${TMP_USAGE}%. Cleaning old temporary files..."
    find /tmp -name "tmp*prisma*" -mmin +60 -delete 2>/dev/null || true
    find /tmp -name "*.tmp" -mmin +120 -delete 2>/dev/null || true
    "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Disk Storage" "/tmp disk usage exceeded 90%" "Purged temporary image and cache files" || true
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Health scan complete. All checks finished."
