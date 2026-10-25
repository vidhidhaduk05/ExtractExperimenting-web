#!/usr/bin/env bash
#SBATCH --job-name=laya_gpu_screening
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=9
#SBATCH --gres=gpu:1
#SBATCH --mem=32G
#SBATCH --time=04:00:00
#SBATCH --mail-user=vidhidhaduk05@gmail.com
#SBATCH --mail-type=BEGIN,END,FAIL
#SBATCH --output=slurm_laya_screening_%j.out
#SBATCH --error=slurm_laya_screening_%j.err

# ==============================================================================
# RadExtract Platform - High-Throughput Laya System-1 GPU Screening
# GPU: NVIDIA Tesla V100S 32GB
# WVU CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# ==============================================================================

set -e

# Load HPC CUDA and compiler modules
module purge
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7

REPO_DIR="/home/vd00026/Desktop/Software"
cd "${REPO_DIR}"
source "${REPO_DIR}/.venv/bin/activate"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"

echo "========================================================================"
echo "Running Laya System-1 Screening on: $(hostname)"
echo "GPU Allocation: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)"
echo "Slurm Job ID: ${SLURM_JOB_ID}"
echo "========================================================================"

# Configure local Laya System-1 execution
export JEV_MODE="on"
export JEV_PROVIDER="laya"
export LAYA_MODEL_DIR="${REPO_DIR}/laya/models"

# Biomni-R0 32B Local LLM Configuration (fallback & extraction)
if curl -s http://127.0.0.1:18000/v1/models >/dev/null 2>&1; then
    echo "Detected local Biomni-R0 model server on port 18000."
    export LLM_BASE_URL="http://127.0.0.1:18000/v1/chat/completions"
    export LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
    export LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    export LLM_MODEL="biomni-r0"
    export RADEXTRACT_LLM_API_URL="http://127.0.0.1:18000/v1/chat/completions"
    export RADEXTRACT_LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
    export RADEXTRACT_LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    export RADEXTRACT_LLM_MODEL="biomni-r0"
fi

# Stage database in local scratch for fast I/O
SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_screening_${SLURM_JOB_ID}"
mkdir -p "${SCRATCH_DIR}"
if [ -f "${REPO_DIR}/radextract_platform/backend/radextract.db" ]; then
    cp "${REPO_DIR}/radextract_platform/backend/radextract.db" "${SCRATCH_DIR}/radextract.db"
fi
export DATABASE_PATH="${SCRATCH_DIR}/radextract.db"

# Execute screening pipeline (or custom protocol)
echo "Executing automated screening with local Laya ModernBERT engine..."
python -c "
import sys
sys.path.insert(0, '${REPO_DIR}/radextract_platform/backend')
from config import settings
from services.jev_client import is_jev_enabled, ask
print('Laya Engine Status:', 'ACTIVE' if is_jev_enabled() else 'INACTIVE')
"

# Run end-to-end systematic screening protocol
if [ -n "$1" ]; then
    echo "Running protocol script: $1"
    python "$1"
else
    echo "Running default protocol: radextract_platform/backend/scripts/run_pam_protocol.py"
    python "${REPO_DIR}/radextract_platform/backend/scripts/run_pam_protocol.py" || true
fi

# Sync database back to persistent storage
if [ -f "${SCRATCH_DIR}/radextract.db" ]; then
    cp "${SCRATCH_DIR}/radextract.db" "${REPO_DIR}/radextract_platform/backend/radextract.db"
    echo "Screening results persistently committed to database."
fi

echo "Job completed successfully."
