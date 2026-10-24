#!/usr/bin/env bash
#SBATCH --job-name=radextract_1h_shift
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --gres=gpu:1
#SBATCH --mem=32G
#SBATCH --time=01:00:00
#SBATCH --mail-user=vidhidhaduk05@gmail.com
#SBATCH --mail-type=BEGIN,END,FAIL,TIME_LIMIT_90
#SBATCH --output=jobs/logs/slurm_shift_%j.out
#SBATCH --error=jobs/logs/slurm_shift_%j.err

# ==============================================================================
# RadExtract 1-Hour Shift with Automated Overlap Handover
# West Virginia University CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# Direct Alerts sent to: vidhidhaduk05@gmail.com
# ==============================================================================

set -euo pipefail

# Load HPC Modules
module purge 2>/dev/null || true
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7 2>/dev/null || true

REPO_DIR="/home/vd00026/Desktop/Software"
cd "$REPO_DIR"

# Set environment PATH
export PATH="${REPO_DIR}/.venv/bin:${PATH}"
export VIRTUAL_ENV="${REPO_DIR}/.venv"

# Configure Shift Manager:
# - Total Runtime: 55 Minutes (3300s) -> Graceful conclusion before 1h walltime
# - Handover Trigger: 45 Minutes (2700s) -> 10-Minute Overlap Handover
# - Watchdog Interval: 3 Minutes (180s)
export TEST_TOTAL_RUNTIME_SECS=$((55 * 60))
export TEST_TRIGGER_NEXT_SECS=$((45 * 60))
export TEST_WATCHDOG_INTERVAL=180
export TEST_DRY_RUN=0
export SKIP_KILL_ON_CLEANUP=0

# Launch Shift Manager
exec bash "${REPO_DIR}/jobs/shift_manager.sh"
