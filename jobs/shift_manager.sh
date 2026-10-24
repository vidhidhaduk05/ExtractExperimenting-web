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
TOTAL_RUNTIME_SECS="${TEST_TOTAL_RUNTIME_SECS:-$(( (23 * 3600) + (55 * 60) ))}" # 23h 55m default
TRIGGER_NEXT_SECS="${TEST_TRIGGER_NEXT_SECS:-$((23 * 3600))}"                   # 23h default
WATCHDOG_INTERVAL="${TEST_WATCHDOG_INTERVAL:-180}"                             # 3m default

echo "========================================================================"
echo " Starting 24-Hour Continuous Shift Manager"
echo " Job ID:       ${CURRENT_JOB}"
echo " Node:         ${CURRENT_NODE}"
echo " Start Time:   $(date)"
echo " Handover At:  Hour 23 (Zero-Downtime Overlap)"
echo " Retirement:   Hour 23:55 (Graceful exit before 24h limit)"
echo " Recipient:    vidhidhaduk05@gmail.com"
echo "========================================================================"

NEXT_SHIFT_SUBMITTED=0
NEXT_SHIFT_CONFIRMED=0
NEXT_JOB_ID=""

# Read previous job ID if present
PREV_JOB="None"
if [ -f "$STATE_FILE" ]; then
    PREV_JOB=$("$PYTHON_BIN" -c "import json; print(json.load(open('$STATE_FILE')).get('current_job_id', 'None'))" 2>/dev/null || echo "None")
fi

# Trap signals for graceful shutdown & WAL flush
cleanup() {
    echo "[*] [CLEANUP TRAP] Performing graceful shutdown and database flush..."
    if [ "${SKIP_KILL_ON_CLEANUP:-0}" != "1" ]; then
        pkill -f "uvicorn main:app.*8000" 2>/dev/null || true
        pkill -f "biomni_bridge_service.py" 2>/dev/null || true
        pkill -f "cloudflared.*8000" 2>/dev/null || true
    else
        echo "[*] SKIP_KILL_ON_CLEANUP is set. Preserving active platform processes."
    fi

    # Only sync scratch SQLite DB if successor has not taken over active writing
    if [ "$NEXT_SHIFT_CONFIRMED" -eq 0 ] && [ -f "/tmp/radextract.db" ]; then
        sqlite3 /tmp/radextract.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        cp "/tmp/radextract.db" "${REPO_DIR}/radextract_platform/backend/radextract.db"
        echo "[+] Final SQLite database successfully synced to persistent storage."
    fi

    "$PYTHON_BIN" "$NOTIFIER" end "${CURRENT_JOB}" "${CURRENT_NODE}" || true
    echo "[*] Shift ${CURRENT_JOB} cleanup complete."
}
trap cleanup EXIT TERM INT

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

while true; do
    NOW="$(date +%s)"
    ELAPSED=$((NOW - START_TIME))

    # Run health & troubleshooting scan (pass standby status if successor active)
    STANDBY_MODE="$NEXT_SHIFT_CONFIRMED" bash "$WATCHDOG" || true

    # Check if successor has taken over active shift
    if [ "$NEXT_SHIFT_SUBMITTED" -eq 1 ] && [ "$NEXT_SHIFT_CONFIRMED" -eq 0 ]; then
        ACTIVE_ID=$("$PYTHON_BIN" -c "import json; print(json.load(open('$STATE_FILE')).get('current_job_id', ''))" 2>/dev/null || echo "")
        if [ "$ACTIVE_ID" = "$NEXT_JOB_ID" ]; then
            echo "[+] Successor shift (Job #${NEXT_JOB_ID}) confirmed active! This node entering hot-standby."
            NEXT_SHIFT_CONFIRMED=1
            "$PYTHON_BIN" "$NOTIFIER" success "${CURRENT_JOB}" "${NEXT_JOB_ID}" "${CURRENT_NODE}" "${PUBLIC_URL}" || true
        fi
    fi

    # Check if we reached hour 23 (1-hour overlap window)
    if [ "$ELAPSED" -ge "$TRIGGER_NEXT_SECS" ] && [ "$NEXT_SHIFT_SUBMITTED" -eq 0 ]; then
        echo ""
        echo "========================================================================"
        echo " [HANDOVER WINDOW REACHED: HOUR 23:00]"
        echo " Submitting replacement shift for 1-hour seamless overlap..."
        echo "========================================================================"

        # Flush & checkpoint local SQLite DB so incoming job starts with latest state
        if [ -f "/tmp/radextract.db" ]; then
            echo "[*] Checkpointing SQLite WAL and syncing to persistent storage..."
            sqlite3 /tmp/radextract.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
            cp "/tmp/radextract.db" "${REPO_DIR}/radextract_platform/backend/radextract.db"
            echo "[+] Persistent database synced prior to successor launch."
        fi

        # Dynamic job name: strictly date and time (no 'radextract')
        DYNAMIC_JOB_NAME="$(date +'%Y-%m-%d_%H-%M')"
        echo "[*] Submitting replacement shift with dynamic timestamp name: ${DYNAMIC_JOB_NAME}"

        if [ "${TEST_DRY_RUN:-0}" = "1" ]; then
            echo "[TEST DRY RUN] Testing Slurm allocation with sbatch --test-only..."
            TEST_OUT=$(sbatch --test-only --job-name="${DYNAMIC_JOB_NAME}" "$SLURM_SCRIPT" 2>&1 || echo "ERROR")
            echo "[*] Slurm test-only response: $TEST_OUT"
            if echo "$TEST_OUT" | grep -q "Job [0-9]\+ to start"; then
                MOCK_ID=$(echo "$TEST_OUT" | grep -o "Job [0-9]\+" | awk '{print $2}')
                NEXT_JOB_OUT="Submitted batch job ${MOCK_ID}"
            else
                NEXT_JOB_OUT="$TEST_OUT"
            fi
        else
            NEXT_JOB_OUT=$(sbatch --job-name="${DYNAMIC_JOB_NAME}" "$SLURM_SCRIPT" 2>&1 || echo "ERROR")
        fi
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
            # Send shifting notification to vidhidhaduk05@gmail.com
            "$PYTHON_BIN" "$NOTIFIER" shifting "${CURRENT_JOB}" "${NEXT_JOB_ID}" "${CURRENT_NODE}" "${PUBLIC_URL}" || true
        else
            echo "[-] Error submitting next shift: $NEXT_JOB_OUT"
            "$PYTHON_BIN" "$NOTIFIER" failure "Scheduler Handover" "sbatch failed: $NEXT_JOB_OUT" || true
        fi
    fi

    # Check if 23h 55m have elapsed (end of shift cycle)
    if [ "$ELAPSED" -ge "$TOTAL_RUNTIME_SECS" ]; then
        echo "[*] 24-hour shift cycle complete (Hour 23:55). Initiating graceful retirement..."
        break
    fi

    # Sleep between watchdog checks
    sleep "${WATCHDOG_INTERVAL}"
done

echo "[*] Shift manager loop finished naturally."
