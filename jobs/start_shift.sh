#!/usr/bin/env bash
# ==============================================================================
# RadExtract Shift Launcher
# Submits continuous shift with dynamic date and time job name (e.g. 2026-10-24_01-38)
# ==============================================================================
set -euo pipefail

REPO_DIR="/home/vd00026/Desktop/Software"
cd "$REPO_DIR"

TIMESTAMP="$(date +'%Y-%m-%d_%H-%M')"

echo "========================================================================"
echo " Submitting Continuous Shift"
echo " Job Name:   ${TIMESTAMP}"
echo " Time:       $(date)"
echo " Recipient:  vidhidhaduk05@gmail.com"
echo "========================================================================"

sbatch --job-name="${TIMESTAMP}" "${REPO_DIR}/jobs/continuous_shift.slurm" "$@"
