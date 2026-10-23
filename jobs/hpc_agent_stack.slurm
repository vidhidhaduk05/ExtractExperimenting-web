#!/usr/bin/env bash
#SBATCH --job-name=radextract_hpc_agent
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=24:00:00
#SBATCH --output=slurm_radextract_agent_%j.out
#SBATCH --error=slurm_radextract_agent_%j.err

# ==============================================================================
# RadExtract 3-Tier HPC Architecture - Automated Batch Job
# Auto-stages SQLite to local scratch, starts Biomni-R0, FastAPI Platform,
# and publishes rotating ephemeral Cloudflare URL to GitHub repository.
# ==============================================================================

set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
cd "$REPO_DIR"

echo "========================================================================"
echo "Starting 3-Tier HPC Agent Stack on node: $(hostname)"
echo "SLURM Job ID: ${SLURM_JOB_ID}"
echo "Start Time: $(date)"
echo "========================================================================"

# 1. Activate Environment
source "${REPO_DIR}/.venv/bin/activate"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"

# 2. Launch 3-Tier Stack
bash "${REPO_DIR}/jobs/start_hpc_agent_stack.sh"

# 3. Publish initial dynamic URL
bash "${REPO_DIR}/jobs/publish_active_tunnel.sh"

# 4. Continuous Health & Watchdog loop
echo "[*] Entering persistent watchdog loop..."
while true; do
    sleep 180
    bash "${REPO_DIR}/jobs/tunnel_watchdog.sh" || true
done
