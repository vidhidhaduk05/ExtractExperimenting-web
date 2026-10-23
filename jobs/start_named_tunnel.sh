#!/bin/bash
# ==============================================================================
# Persistent Named Cloudflare Tunnel Runner for Biomni-R0 (Port 18000)
# Runs resiliently inside a detached tmux session ("biomni-tunnel")
# Protocol: http2 (bypasses HPC UDP firewalls)
# ==============================================================================

set -euo pipefail

SESSION_NAME="biomni-tunnel"
CLOUDFLARED="/home/vd00026/.local/bin/cloudflared"
BRIDGE_SCRIPT="/home/vd00026/Desktop/Software/jobs/biomni_bridge_service.py"
PYTHON_BIN="/home/vd00026/Desktop/Software/.venv/bin/python"

usage() {
    echo "Usage: $0 [start <tunnel-name-or-token> | stop | status | attach | logs]"
    echo ""
    echo "Examples:"
    echo "  $0 start my-biomni-tunnel"
    echo "  $0 start eyJhIjoi... (Cloudflare Zero Trust token)"
    echo "  $0 status"
    echo "  $0 attach"
    echo "  $0 stop"
    exit 1
}

# 1. Ensure Port 18000 Bridge is running
ensure_bridge() {
    if ! curl -s http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
        echo "[*] Port 18000 bridge is not running. Starting bridge service..."
        nohup "$PYTHON_BIN" "$BRIDGE_SCRIPT" > /home/vd00026/biomni_bridge.log 2>&1 &
        for i in {1..20}; do
            if curl -s http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
                echo "[+] Port 18000 bridge is online!"
                break
            fi
            sleep 1
        done
    else
        echo "[+] Port 18000 bridge is already healthy."
    fi
}

start_tunnel() {
    local TARGET="${1:-}"
    if [ -z "$TARGET" ]; then
        echo "[-] Error: Missing tunnel name or token."
        usage
    fi

    ensure_bridge

    # Check if tmux session already exists
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "[*] Existing tmux session '$SESSION_NAME' detected. Stopping old process..."
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        sleep 1
    fi

    # Determine if argument is a Cloudflare Zero Trust token (long base64 string) or a tunnel name
    if [[ "$TARGET" =~ ^ey[A-Za-z0-9_-]{20,} ]]; then
        RUN_CMD="$CLOUDFLARED tunnel --protocol http2 run --token $TARGET"
        echo "[*] Starting Named Cloudflare Tunnel using Zero Trust Token..."
    else
        RUN_CMD="$CLOUDFLARED tunnel --protocol http2 run $TARGET"
        echo "[*] Starting Named Cloudflare Tunnel for tunnel name: $TARGET..."
    fi

    # Start inside a detached tmux session
    tmux new-session -d -s "$SESSION_NAME" "$RUN_CMD 2>&1 | tee -a /home/vd00026/named_cloudflared.log"
    sleep 3

    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "====================================================================="
        echo "  [SUCCESS] Persistent Named Tunnel is running in tmux session: $SESSION_NAME"
        echo "====================================================================="
        echo "  - Commands to manage:"
        echo "      Attach to view live console:  tmux attach -t $SESSION_NAME"
        echo "      Detach from tmux console:     Press Ctrl+B then D"
        echo "      Check status:                 $0 status"
        echo "      Stop tunnel:                  $0 stop"
        echo "  - Log file: /home/vd00026/named_cloudflared.log"
        echo "====================================================================="
    else
        echo "[-] Tunnel failed to start. Check /home/vd00026/named_cloudflared.log for details."
        exit 1
    fi
}

stop_tunnel() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "[*] Stopping tmux session '$SESSION_NAME'..."
        tmux kill-session -t "$SESSION_NAME"
        pkill -f "cloudflared tunnel.*run" 2>/dev/null || true
        echo "[+] Named tunnel stopped."
    else
        echo "[*] No active tmux session '$SESSION_NAME' found."
    fi
}

check_status() {
    echo "=== Named Cloudflare Tunnel Status ==="
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "[+] Tmux Session: '$SESSION_NAME' is ACTIVE"
        echo "--- Recent Logs (/home/vd00026/named_cloudflared.log) ---"
        tail -n 12 /home/vd00026/named_cloudflared.log 2>/dev/null || echo "No logs yet."
    else
        echo "[-] Tmux Session: '$SESSION_NAME' is NOT running."
    fi
    echo ""
    echo "=== Local Port 18000 Bridge Status ==="
    curl -s http://127.0.0.1:18000/health || echo "Port 18000 bridge is down."
    echo ""
}

attach_tmux() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        tmux attach -t "$SESSION_NAME"
    else
        echo "[-] No active tmux session '$SESSION_NAME' found."
    fi
}

view_logs() {
    tail -f -n 30 /home/vd00026/named_cloudflared.log
}

ACTION="${1:-}"
case "$ACTION" in
    start)
        start_tunnel "${2:-}"
        ;;
    stop)
        stop_tunnel
        ;;
    status)
        check_status
        ;;
    attach)
        attach_tmux
        ;;
    logs)
        view_logs
        ;;
    *)
        usage
        ;;
esac
