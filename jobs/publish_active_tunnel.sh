#!/bin/bash
# ==============================================================================
# Dynamic Cloudflare URL Auto-Publisher
# Automatically publishes rotating ephemeral tunnel URLs to GitHub repository
# so the GitHub Pages web app auto-discovers the active backend URL.
# ==============================================================================

set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
TUNNEL_URL="${1:-}"

cd "$REPO_DIR"

if [ -z "$TUNNEL_URL" ]; then
    # 1. Try to detect from active running cloudflared process file descriptor
    if pgrep -f "cloudflared" >/dev/null; then
        PID=$(pgrep -f "cloudflared" | head -n 1)
        PROC_LOG=$(ls -l /proc/$PID/fd/ 2>/dev/null | grep '\.log' | awk '{print $NF}' | head -n 1 || true)
        if [ -n "$PROC_LOG" ] && [ -f "$PROC_LOG" ]; then
            CANDIDATE=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$PROC_LOG" 2>/dev/null | tail -n 1 || true)
            if [ -n "$CANDIDATE" ]; then
                TUNNEL_URL="$CANDIDATE"
            fi
        fi
    fi

    # 2. Fall back to sorting all existing cloudflared logs by newest modification time
    if [ -z "$TUNNEL_URL" ]; then
        for log in $(ls -t /home/vd00026/cloudflared*.log "$REPO_DIR"/jobs/logs/cloudflared*.log 2>/dev/null || true); do
            CANDIDATE=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$log" 2>/dev/null | tail -n 1 || true)
            if [ -n "$CANDIDATE" ]; then
                TUNNEL_URL="$CANDIDATE"
                break
            fi
        done
    fi
fi

if [ -z "$TUNNEL_URL" ]; then
    echo "[-] Error: Could not determine active Cloudflare tunnel URL."
    exit 1
fi

echo "[*] Active Tunnel URL: $TUNNEL_URL"

# Verify that the URL actually responds with healthy (retry up to 24s for edge routing)
echo "[*] Verifying Cloudflare edge routing for $TUNNEL_URL..."
TUNNEL_READY=0
for i in {1..12}; do
    if curl -s --max-time 5 "$TUNNEL_URL/health" | grep -q '"status":"healthy"'; then
        TUNNEL_READY=1
        echo "[+] Cloudflare edge routing confirmed healthy."
        break
    fi
    sleep 2
done

if [ "$TUNNEL_READY" -eq 0 ]; then
    echo "[-] Warning: Tunnel $TUNNEL_URL did not respond healthy after 24s. Aborting publish."
    exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

JSON_PAYLOAD=$(cat << EOF
{
  "backend_url": "$TUNNEL_URL",
  "api_url": "$TUNNEL_URL/api",
  "health_url": "$TUNNEL_URL/health",
  "updated_at": "$TIMESTAMP",
  "status": "online",
  "model": "biomni-r0"
}
EOF
)

echo "$JSON_PAYLOAD" > "$REPO_DIR/public/active_backend.json"
echo "$JSON_PAYLOAD" > "$REPO_DIR/radextract_platform/frontend/public/active_backend.json"

echo "[*] Updated active_backend.json locally."

# Check git status for changes in active_backend.json
if git status --porcelain | grep -q "active_backend.json"; then
    echo "[*] Committing and pushing dynamic URL to GitHub..."
    git add "$REPO_DIR/public/active_backend.json" "$REPO_DIR/radextract_platform/frontend/public/active_backend.json"
    git commit -m "chore(tunnel): auto-publish dynamic backend URL $TUNNEL_URL"
    PUSHED=0
    for push_attempt in 1 2 3 4 5; do
        if git push origin main; then
            PUSHED=1
            break
        fi
        echo "[-] Push attempt $push_attempt failed. Rebasing with autostash and retrying in 3s..."
        sleep 3
        git pull --rebase --autostash origin main || true
    done
    if [ "$PUSHED" -eq 1 ]; then
        echo "[+] [SUCCESS] New dynamic URL published to GitHub!"
        echo "[+] Web app will auto-discover it at: https://raw.githubusercontent.com/vidhidhaduk05/ExtractExperimenting-web/main/public/active_backend.json"
    else
        echo "[-] Warning: Failed to push to GitHub after 5 attempts."
    fi
else
    echo "[*] active_backend.json already has current URL. Checking if remote is in sync..."
    git pull --rebase --autostash origin main || true
    git push origin main || true
fi
