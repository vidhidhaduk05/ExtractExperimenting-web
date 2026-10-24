#!/usr/bin/env bash
# ==============================================================================
# RadExtract HPC 24-Hour Continuous Shift Manager
# Orchestrates:
# 1. 24-Hour Lifecycle with 1-Hour Overlap Handover (Baton Pass)
# 2. Automated Tier 1/2/3 Spin-up & Verification
# 3. Automated Submissions of Successor Shifts at Hour 23:00
# 4. Instant Email Notifications to vidhidhaduk05@gmail.com
# ==============================================================================

set -uo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
PYTHON_BIN="$REPO_DIR/.venv/bin/python"
NOTIFIER="$REPO_DIR/jobs/hpc_notifier.py"
WATCHDOG="$REPO_DIR/jobs/troubleshoot_watchdog.sh"
STATE_FILE="$REPO_DIR/jobs/.shift_state.json"
SLURM_SCRIPT="$REPO_DIR/jobs/continuous_shift.slurm"

CURRENT_JOB="${SLURM_JOB_ID:-manual_$(date +%s)}"
CURRENT_NODE="$(hostname)"
START_TIME="$(date +%s)"
TOTAL_RUNTIME_SECS=$((24 * 3600))       # 24 Hours
TRIGGER_NEXT_SECS=$((23 * 3600))        # Trigger next shift 1 hour before expiration

echo "========================================================================"
echo " Starting 24-Hour Continuous Shift Manager"
echo " Job ID:       ${CURRENT_JOB}"
echo " Node:         ${CURRENT_NODE}"
echo " Start Time:   $(date)"
echo " Handover At:  Hour 23 (1-Hour Zero-Downtime Overlap)"
echo " Recipient:    vidhidhaduk05@gmail.com"
echo "========================================================================"

# Read previous job ID if present
PREV_JOB="None"
if [ -f "$STATE_FILE" ]; then
    PREV_JOB=$("$PYTHON_BIN" -c "import json; print(json.load(open('$STATE_FILE')).get('current_job_id', 'None'))" 2>/dev/null || echo "None")
fi

# Trap signals for graceful shutdown & WAL flush
cleanup() {
    echo "[*] [CLEANUP TRAP] Performing graceful shutdown and database flush..."
    pkill -f "uvicorn main:app.*8000" 2>/dev/null || true
    pkill -f "biomni_bridge_service.py" 2>/dev/null || true
    pkill -f "cloudflared.*8000" 2>/dev/null || true

    # Sync scratch SQLite DB to persistent storage
    if [ -f "/tmp/radextract.db" ]; then
        cp "/tmp/radextract.db" "${REPO_DIR}/radextract_platform/backend/radextract.db"
        echo "[+] SQLite database successfully synced to persistent storage."
    fi

    "$PYTHON_BIN" "$NOTIFIER" end "${CURRENT_JOB}" "${CURRENT_NODE}" || true
    echo "[*] Shift ${CURRENT_JOB} cleanup complete."
}
trap cleanup EXIT ERR TERM

# ------------------------------------------------------------------------------
# STEP 1: INITIALIZE STACK (TIER 1, TIER 2, TIER 3)
# ------------------------------------------------------------------------------
echo "[*] Booting 3-tier HPC agent stack..."
bash "$REPO_DIR/jobs/start_hpc_agent_stack.sh"

# Extract the newly active public tunnel URL
PUBLIC_URL=$("$PYTHON_BIN" -c "import json; print(json.load(open('$REPO_DIR/public/active_backend.json')).get('backend_url', ''))" 2>/dev/null || echo "")

# Update state file
"$PYTHON_BIN" -c "
import json
state = {
    'current_job_id': '${CURRENT_JOB}',
    'current_node': '${CURRENT_NODE}',
    'start_time': ${START_TIME},
    'public_url': '${PUBLIC_URL}',
    'previous_job_id': '${PREV_JOB}'
}
with open('${STATE_FILE}', 'w') as f:
    json.dump(state, f, indent=2)
"

# ------------------------------------------------------------------------------
# STEP 2: NOTIFY START & HANDOVER
# ------------------------------------------------------------------------------
if [ "$PREV_JOB" != "None" ] && [ "$PREV_JOB" != "${CURRENT_JOB}" ]; then
    echo "[+] Sending Shift Handover Success notification..."
    "$PYTHON_BIN" "$NOTIFIER" handover "${PREV_JOB}" "${CURRENT_JOB}" "${CURRENT_NODE}" "${PUBLIC_URL}" || true
else
    echo "[+] Sending Shift Started notification..."
    "$PYTHON_BIN" "$NOTIFIER" start "${CURRENT_JOB}" "${CURRENT_NODE}" "${PUBLIC_URL}" || true
fi

# ------------------------------------------------------------------------------
# STEP 3: RUN CONTINUOUS WATCHDOG & WAIT FOR HOUR 23 HANDOVER TRIGGER
# ------------------------------------------------------------------------------
echo "[*] Entering active watchdog loop. Next shift will be launched at hour 23..."

NEXT_SHIFT_SUBMITTED=0

while true; do
    NOW="$(date +%s)"
    ELAPSED=$((NOW - START_TIME))

    # Run health & troubleshooting scan
    bash "$WATCHDOG" || true

    # Check if we reached hour 23 (1-hour overlap window)
    if [ "$ELAPSED" -ge "$TRIGGER_NEXT_SECS" ] && [ "$NEXT_SHIFT_SUBMITTED" -eq 0 ]; then
        echo ""
        echo "========================================================================"
        echo " [HANDOVER WINDOW REACHED: HOUR 23:00]"
        echo " Submitting replacement shift for 1-hour seamless overlap..."
        echo "========================================================================"

        NEXT_JOB_OUT=$(sbatch "$SLURM_SCRIPT" 2>&1 || echo "ERROR")
        echo "[*] sbatch response: $NEXT_JOB_OUT"

        if echo "$NEXT_JOB_OUT" | grep -q "Submitted batch job"; then
            NEXT_JOB_ID=$(echo "$NEXT_JOB_OUT" | awk '{print $4}')
            echo "[+] Replacement shift submitted successfully! Slurm Job ID: ${NEXT_JOB_ID}"
            NEXT_SHIFT_SUBMITTED=1

            # Update state file with scheduled handover
            "$PYTHON_BIN" -c "
import json
try:
    with open('${STATE_FILE}', 'r') as f:
        s = json.load(f)
except Exception:
    s = {}
s['next_job_id'] = '${NEXT_JOB_ID}'
s['handover_triggered_at'] = ${NOW}
with open('${STATE_FILE}', 'w') as f:
    json.dump(s, f, indent=2)
"
        else
            echo "[-] Error submitting next shift: $NEXT_JOB_OUT"
            "$PYTHON_BIN" "$NOTIFIER" troubleshoot "Scheduler Handover" "sbatch failed to submit next shift" "$NEXT_JOB_OUT" "CRITICAL" || true
        fi
    fi

    # Check if 24 hours have elapsed (end of shift)
    if [ "$ELAPSED" -ge "$TOTAL_RUNTIME_SECS" ]; then
        echo "[*] 24-hour shift cycle complete. Initiating graceful retirement..."
        break
    fi

    # Sleep 180 seconds between watchdog checks
    sleep 180
done

echo "[*] Shift manager loop finished naturally."
