#!/bin/bash
# ==============================================================================
# Tunnel & Service Health Watchdog
# Runs in the background. If Cloudflare cycles or dies, automatically starts
# a new tunnel and publishes the newly assigned ephemeral URL to GitHub.
# ==============================================================================

set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
PYTHON_BIN="$REPO_DIR/.venv/bin/python"
CLOUDFLARED="/home/vd00026/.local/bin/cloudflared"
LOG_FILE="/home/vd00026/watchdog.log"

exec >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Tunnel Watchdog check..."

# 1. Check Tier 1 (Port 18000 Biomni)
if ! curl -s --max-time 4 http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
    echo "[!] Tier 1 Biomni on port 18000 is down. Restarting..."
    nohup "$PYTHON_BIN" "$REPO_DIR/jobs/biomni_bridge_service.py" > /home/vd00026/biomni_bridge.log 2>&1 & disown
    sleep 3
fi

# 2. Check Tier 2 (Port 8000 FastAPI)
if ! curl -s --max-time 4 http://127.0.0.1:8000/health | grep -q '"status":"healthy"'; then
    echo "[!] Tier 2 FastAPI on port 8000 is down. Restarting..."
    "$REPO_DIR/jobs/start_tier2_fastapi.sh" || true
    sleep 3
fi

# 3. Check Tier 3 (Public Cloudflare Ingress)
NODE_ID="$(hostname)"
NODE_LOG="$REPO_DIR/jobs/logs/cloudflared_${NODE_ID}_8000.log"
RUNNING_URL=""

if [ -f "$NODE_LOG" ]; then
    RUNNING_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$NODE_LOG" 2>/dev/null | tail -n 1 || true)
fi
if [ -z "$RUNNING_URL" ] && [ -f /home/vd00026/cloudflared_8000.log ]; then
    RUNNING_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/cloudflared_8000.log 2>/dev/null | tail -n 1 || true)
fi

CURRENT_URL=$(cat "$REPO_DIR/public/active_backend.json" 2>/dev/null | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | head -n 1 || true)
TUNNEL_HEALTHY=0

# First test the actively running process URL if found
if [ -n "$RUNNING_URL" ] && curl -s --max-time 6 "$RUNNING_URL/health" | grep -q '"status":"healthy"'; then
    TUNNEL_HEALTHY=1
    echo "[+] Running local tunnel $RUNNING_URL is healthy."
    if [ "$CURRENT_URL" != "$RUNNING_URL" ]; then
        echo "[*] Synchronizing mismatched active_backend.json with running tunnel $RUNNING_URL..."
        bash "$REPO_DIR/jobs/publish_active_tunnel.sh" "$RUNNING_URL" || true
    fi
elif [ -n "$CURRENT_URL" ] && curl -s --max-time 6 "$CURRENT_URL/health" | grep -q '"status":"healthy"'; then
    TUNNEL_HEALTHY=1
    echo "[+] Tunnel $CURRENT_URL from active_backend.json is healthy."
fi

if [ "$TUNNEL_HEALTHY" -eq 0 ]; then
    echo "[!] Cloudflare tunnel is offline or expired. Launching fresh tunnel..."
    pkill -f "cloudflared.*8000" 2>/dev/null || true
    sleep 1

    nohup "$CLOUDFLARED" tunnel --protocol http2 --url http://127.0.0.1:8000 > /home/vd00026/cloudflared_8000.log 2>&1 & disown
    
    # Wait for URL to appear
    NEW_URL=""
    for i in {1..25}; do
        NEW_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/cloudflared_8000.log | tail -n 1 || true)
        if [ -n "$NEW_URL" ]; then
            if curl -s --max-time 5 "$NEW_URL/health" | grep -q '"status":"healthy"'; then
                break
            fi
        fi
        sleep 1
    done

    if [ -n "$NEW_URL" ]; then
        echo "[+] New Tunnel created and healthy: $NEW_URL. Publishing to GitHub..."
        bash "$REPO_DIR/jobs/publish_active_tunnel.sh" "$NEW_URL" || true
    else
        echo "[-] Failed to extract and verify new tunnel URL from /home/vd00026/cloudflared_8000.log"
    fi
fi
