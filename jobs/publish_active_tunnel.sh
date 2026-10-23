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
    # Auto-detect from running task log or cloudflared log
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/.gemini/antigravity-ide/brain/65bbfb7d-9393-497f-8a3c-cb980a561ce1/.system_generated/tasks/task-280.log 2>/dev/null | tail -n 1 || true)
    if [ -z "$TUNNEL_URL" ]; then
        TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /home/vd00026/cloudflared_8000.log 2>/dev/null | tail -n 1 || true)
    fi
fi

if [ -z "$TUNNEL_URL" ]; then
    echo "[-] Error: Could not determine active Cloudflare tunnel URL."
    exit 1
fi

echo "[*] Active Tunnel URL: $TUNNEL_URL"

# Verify that the URL actually responds with healthy
if ! curl -s --max-time 8 "$TUNNEL_URL/health" | grep -q '"status":"healthy"'; then
    echo "[-] Warning: Tunnel $TUNNEL_URL did not respond healthy. Aborting publish."
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
    git commit -m "chore(tunnel): auto-publish dynamic backend URL $TUNNEL_URL [skip ci]"
    git push origin main
    echo "[+] [SUCCESS] New dynamic URL published to GitHub!"
    echo "[+] Web app will auto-discover it at: https://raw.githubusercontent.com/vidhidhaduk05/ExtractExperimenting-web/main/public/active_backend.json"
else
    echo "[*] active_backend.json already has current URL. No push needed."
fi
