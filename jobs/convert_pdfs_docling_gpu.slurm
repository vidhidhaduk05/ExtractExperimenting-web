#!/usr/bin/env bash
#SBATCH --job-name=docling_gpu_batch
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --gres=gpu:1
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --output=slurm_docling_gpu_%j.out
#SBATCH --error=slurm_docling_gpu_%j.err

# ==============================================================================
# RadExtract Platform - Batch GPU Docling PDF -> JSON Converter
# Hardware: NVIDIA Tesla V100S 32GB GPU + 8 CPU Cores
# Cluster: WVU CTSI HPC (ctsi-hpc.hsc.wvu.edu)
# ==============================================================================

set -e

# Load HPC CUDA, GCC, and Slurm modules
module purge
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7

REPO_DIR="/home/vd00026/Desktop/Software"
cd "${REPO_DIR}"

# Activate virtual environment
source "${REPO_DIR}/.venv/bin/activate"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"

# Configure Docling to use GPU acceleration with 8 threads
export DOCLING_DEVICE="cuda"
export DOCLING_NUM_THREADS="8"

echo "========================================================================"
echo "Starting GPU-Accelerated Batch Docling Conversion on: $(hostname)"
echo "GPU Device: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)"
echo "Slurm Job ID: ${SLURM_JOB_ID}"
echo "========================================================================"

# Default input directory (can be overridden as first argument to sbatch)
INPUT_DIR="${1:-${REPO_DIR}/TESTING/files}"
OUTPUT_DIR="${2:-${INPUT_DIR}}"

echo "Source PDFs Directory: ${INPUT_DIR}"
echo "Output JSON Directory: ${OUTPUT_DIR}"

python "${REPO_DIR}/radextract_platform/backend/scripts/convert_pdfs_to_docling.py" \
    --input-dir "${INPUT_DIR}" \
    --output-dir "${OUTPUT_DIR}" \
    --device cuda \
    --threads 8 \
    --sync-db

echo ""
echo "========================================================================"
echo "Batch Docling GPU conversion finished successfully."
echo "All PDFs have been converted to .docling.json files."
echo "========================================================================"
