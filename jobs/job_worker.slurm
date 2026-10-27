#!/usr/bin/env bash
#SBATCH --job-name=worker
#SBATCH --partition=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --gres=gpu:1
#SBATCH --mem=16G
#SBATCH --time=24:00:00
#SBATCH --mail-user=vidhidhaduk05@gmail.com
#SBATCH --mail-type=BEGIN,END,FAIL
#SBATCH --output=jobs/logs/worker_%j.out
#SBATCH --error=jobs/logs/worker_%j.err

# ==============================================================================
# RadExtract Job Worker — Canonical Resource Spec
# 1 process | 1 GPU | 8 CPUs | 16 GB RAM | batch_size=32 | fp16
# WVU CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# ==============================================================================

set -euo pipefail

module purge 2>/dev/null || true
module load shared DefaultModules gcc/10.2.0 cuda11.2/toolkit/11.2.2 slurm/slurm/20.02.7 2>/dev/null || true

REPO_DIR="/home/vd00026/Desktop/Software"
BACKEND_DIR="${REPO_DIR}/radextract_platform/backend"
PYTHON_BIN="${REPO_DIR}/.venv/bin/python"
LOG_DIR="${REPO_DIR}/jobs/logs"
mkdir -p "${LOG_DIR}"

cd "${REPO_DIR}"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"
export VIRTUAL_ENV="${REPO_DIR}/.venv"
export PYTHONPATH="${BACKEND_DIR}"

# ── Resource knobs ──────────────────────────────────────────────────────────
export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8
export OPENBLAS_NUM_THREADS=8

# ── Laya / Jev ───────────────────────────────────────────────────────────────
export JEV_MODE="on"
export JEV_PROVIDER="laya"
export LAYA_MODEL_DIR="${REPO_DIR}/laya/models"

# ── LLM gateway (Biomni-R0, optional for extraction fallback) ─────────────
if curl -s --max-time 3 http://127.0.0.1:18000/health | grep -q '"status":"ok"'; then
    export LLM_BASE_URL="http://127.0.0.1:18000/v1/chat/completions"
    export LLM_MODELS_URL="http://127.0.0.1:18000/v1/models"
    export LLM_API_KEY="sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e"
    export LLM_MODEL="biomni-r0"
    echo "[+] Biomni-R0 reachable on port 18000 — extraction fallback enabled."
else
    echo "[!] Biomni-R0 not reachable — Laya-only screening mode."
fi

# ── Stage DB in node-local scratch for fast I/O ───────────────────────────
SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_worker_${SLURM_JOB_ID}"
mkdir -p "${SCRATCH_DIR}"
if [ -f "${BACKEND_DIR}/radextract.db" ]; then
    cp "${BACKEND_DIR}/radextract.db" "${SCRATCH_DIR}/radextract.db"
    echo "[+] Database staged to ${SCRATCH_DIR}/radextract.db"
fi
export DATABASE_PATH="${SCRATCH_DIR}/radextract.db"

# ── Sync DB back on exit ─────────────────────────────────────────────────
cleanup() {
    echo "[*] Syncing database back to persistent storage …"
    if [ -f "${SCRATCH_DIR}/radextract.db" ]; then
        sqlite3 "${SCRATCH_DIR}/radextract.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        cp "${SCRATCH_DIR}/radextract.db" "${BACKEND_DIR}/radextract.db"
        echo "[+] Database synced."
    fi
}
trap cleanup EXIT TERM INT

echo "========================================================================"
echo " RadExtract Job Worker"
echo " Job ID  : ${SLURM_JOB_ID:-local}"
echo " Node    : $(hostname)"
echo " Started : $(date)"
echo " Config  : 1 worker | 1 GPU | 8 CPUs | 16 GB | batch=32 | fp16"
echo "========================================================================"

echo "[*] GPU info:"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null || echo "  (no GPU or nvidia-smi unavailable)"

exec "${PYTHON_BIN}" "${REPO_DIR}/jobs/job_worker.py"
