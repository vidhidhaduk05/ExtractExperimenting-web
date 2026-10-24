#!/usr/bin/env bash
#SBATCH --job-name=docling_gpu_batch
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --gres=gpu:1
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --mail-user=vidhidhaduk05@gmail.com
#SBATCH --mail-type=BEGIN,END,FAIL
#SBATCH --output=jobs/logs/slurm_docling_%j.out
#SBATCH --error=jobs/logs/slurm_docling_%j.err

# ==============================================================================
# RadExtract GPU-Accelerated Docling Batch Converter
# West Virginia University CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# Direct Alerts sent to: vidhidhaduk05@gmail.com
# ==============================================================================

set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
cd "$REPO_DIR"

# Ensure jobs/logs exists
mkdir -p "${REPO_DIR}/jobs/logs"

# Load HPC Modules
module purge 2>/dev/null || true
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7 2>/dev/null || true

# Set environment PATH
export PATH="${REPO_DIR}/.venv/bin:${PATH}"
export VIRTUAL_ENV="${REPO_DIR}/.venv"
export REPO_DIR="$REPO_DIR"

INPUT_DIR="${1:-${REPO_DIR}/TESTING/files}"

echo "========================================================================"
echo " Starting GPU-Accelerated Docling Batch Conversion"
echo " Job ID:       ${SLURM_JOB_ID:-manual}"
echo " Node:         ${SLURMD_NODENAME:-$(hostname)}"
echo " Input Folder: ${INPUT_DIR}"
echo " GPU Device:   $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'GPU not detected')"
echo " Start Time:   $(date)"
echo " Recipient:    vidhidhaduk05@gmail.com"
echo "========================================================================"

# Send Start Email Notification
python "${REPO_DIR}/jobs/hpc_notifier.py" \
  --action alert \
  --event "Batch Docling GPU Conversion Started" \
  --tier "Tier 1: Docling GPU Acceleration" \
  --details "Job #${SLURM_JOB_ID:-manual} running on ${SLURMD_NODENAME:-$(hostname)}. Converting PDFs in ${INPUT_DIR} to .docling.json format on Tesla V100S GPU." \
  --subject "shift manager - start" 2>/dev/null || true

# Run Batch Conversion
set +e
python "${REPO_DIR}/radextract_platform/backend/scripts/convert_pdfs_to_docling.py" \
  --input-dir "$INPUT_DIR" \
  --device cuda \
  --threads 8 \
  --sync-db
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo "[+] Docling GPU conversion completed successfully."
  python "${REPO_DIR}/jobs/hpc_notifier.py" \
    --action alert \
    --event "Batch Docling GPU Conversion Completed" \
    --tier "Tier 1: Docling GPU Acceleration" \
    --details "Job #${SLURM_JOB_ID:-manual} successfully finished on ${SLURMD_NODENAME:-$(hostname)}. All PDFs converted to .docling.json and synchronized to database." \
    --subject "shift manager - success" 2>/dev/null || true
else
  echo "[-] Docling GPU conversion exited with code $EXIT_CODE."
  python "${REPO_DIR}/jobs/hpc_notifier.py" \
    --action alert \
    --event "Batch Docling GPU Conversion Failed" \
    --tier "Tier 1: Docling GPU Acceleration" \
    --details "Job #${SLURM_JOB_ID:-manual} failed on ${SLURMD_NODENAME:-$(hostname)} with exit code ${EXIT_CODE}. Check logs/slurm_docling_${SLURM_JOB_ID:-manual}.err for details." \
    --subject "shift manager - failure" 2>/dev/null || true
fi

exit $EXIT_CODE
