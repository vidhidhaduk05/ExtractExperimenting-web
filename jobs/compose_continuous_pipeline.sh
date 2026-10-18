#!/usr/bin/env bash
# ==============================================================================
# Compose & Chain Continuous Slurm Jobs on WVU CTSI HPC
# ==============================================================================
# Usage:
#   ./compose_continuous_pipeline.sh [chain|resubmit]
# ==============================================================================

set -e

MODE="${1:-chain}"
JOBS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$MODE" = "chain" ]; then
    echo "========================================================================"
    echo "Composing Dependent Multi-Stage Pipeline:"
    echo "  Stage 1: Bulk Laya GPU Screening (GPU partition, Tesla V100S)"
    echo "  Stage 2: Launch Interactive Web Review App (after Stage 1 succeeds)"
    echo "========================================================================"

    # Submit Stage 1
    JOB1_OUT=$(sbatch "${JOBS_DIR}/screening_laya_gpu.slurm")
    JOB1_ID=$(echo "$JOB1_OUT" | awk '{print $4}')
    echo "Submitted Stage 1 (Screening): Job ID ${JOB1_ID}"

    # Submit Stage 2 with dependency
    JOB2_OUT=$(sbatch --dependency=afterok:${JOB1_ID} "${JOBS_DIR}/radextract_web.slurm")
    JOB2_ID=$(echo "$JOB2_OUT" | awk '{print $4}')
    echo "Submitted Stage 2 (Web Server): Job ID ${JOB2_ID} (waiting for ${JOB1_ID})"

    echo ""
    echo "Pipeline composed successfully! Check queue with: squeue -u \$USER"

elif [ "$MODE" = "continuous" ]; then
    echo "Submitting recurring continuous screening monitor..."
    # Self-resubmitting continuous pipeline job
    sbatch "${JOBS_DIR}/screening_laya_gpu.slurm"
fi
