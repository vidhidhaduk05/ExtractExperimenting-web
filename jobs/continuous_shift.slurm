#!/usr/bin/env bash
#SBATCH --job-name=radextract_24h_shift
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --gres=gpu:1
#SBATCH --mem=32G
#SBATCH --time=24:00:00
#SBATCH --mail-user=vidhidhaduk05@gmail.com
#SBATCH --mail-type=BEGIN,END,FAIL,TIME_LIMIT_90
#SBATCH --output=slurm_shift_%j.out
#SBATCH --error=slurm_shift_%j.err

# ==============================================================================
# RadExtract 24/7 Continuous Autonomous Engine
# West Virginia University CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# 24-Hour Shift with 1-Hour Overlap Handover & Auto-Troubleshooting
# Direct Alerts sent to: vidhidhaduk05@gmail.com
# ==============================================================================

set -euo pipefail

# Load HPC Modules
module purge 2>/dev/null || true
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7 2>/dev/null || true

REPO_DIR="/home/vd00026/Desktop/Software"
cd "$REPO_DIR"

# Activate environment
source "${REPO_DIR}/.venv/bin/activate"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"

# Hand execution to Shift Manager
exec bash "${REPO_DIR}/jobs/shift_manager.sh"
