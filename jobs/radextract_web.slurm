#!/usr/bin/env bash
#SBATCH --job-name=radextract_web
#SBATCH --partition=defq
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=08:00:00
#SBATCH --output=slurm_radextract_web_%j.out
#SBATCH --error=slurm_radextract_web_%j.err

# ==============================================================================
# RadExtract Platform - Interactive Web & API Server for Open OnDemand
# WVU CTSI HPC Cluster (ctsi-hpc.hsc.wvu.edu)
# ==============================================================================

set -e

# Load modules
module purge
module load shared DefaultModules gcc/10.2.0 slurm/slurm/20.02.7

NODE_NAME=$(hostname)
PORT=5173
BACKEND_PORT=8000
REPO_DIR="/home/vd00026/Desktop/Software"

echo "========================================================================"
echo "Starting RadExtract on Compute Node: ${NODE_NAME}"
echo "Slurm Job ID: ${SLURM_JOB_ID}"
echo "========================================================================"

# Activate python virtual environment & ensure node/npm are in PATH
cd "${REPO_DIR}"
source "${REPO_DIR}/.venv/bin/activate"
export PATH="${REPO_DIR}/.venv/bin:${PATH}"

# Staging SQLite in fast node-local scratch to avoid NFS locking
SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_${SLURM_JOB_ID}"
mkdir -p "${SCRATCH_DIR}"
if [ -f "${REPO_DIR}/radextract_platform/backend/radextract.db" ]; then
    cp "${REPO_DIR}/radextract_platform/backend/radextract.db" "${SCRATCH_DIR}/radextract.db"
fi

export DATABASE_PATH="${SCRATCH_DIR}/radextract.db"
export RADEXTRACT_ENV="production"
export RADEXTRACT_DB_BACKEND="sqlite"
export RADEXTRACT_STORAGE_BACKEND="local"
export JEV_MODE="on"
export JEV_PROVIDER="laya"

# Start FastAPI Backend in background
echo "[1/2] Starting FastAPI Backend on port ${BACKEND_PORT}..."
cd "${REPO_DIR}/radextract_platform/backend"
uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 2 &
BACKEND_PID=$!

# Wait for backend health
sleep 3
curl -s http://127.0.0.1:${BACKEND_PORT}/health || true

# Start Vite Frontend
echo "[2/2] Starting Vite Frontend on port ${PORT}..."
cd "${REPO_DIR}/radextract_platform/frontend"
npm run dev -- --host 0.0.0.0 --port ${PORT} &
FRONTEND_PID=$!

# Print exact Open OnDemand Web Proxy URL
echo ""
echo "========================================================================"
echo " RADEXTRACT WEB APP IS READY FOR BROWSER ACCESS:"
echo ""
echo " Open OnDemand Proxy URL:"
echo "   https://ctsi-hpc.hsc.wvu.edu/rnode/${NODE_NAME}/${PORT}/"
echo ""
echo " Direct Node URL (if on campus/VPN):"
echo "   http://${NODE_NAME}:${PORT}/"
echo "========================================================================"
echo ""

# Cleanup handler on job exit
cleanup() {
    echo "Stopping services and saving database..."
    kill ${FRONTEND_PID} ${BACKEND_PID} 2>/dev/null || true
    if [ -f "${SCRATCH_DIR}/radextract.db" ]; then
        cp "${SCRATCH_DIR}/radextract.db" "${REPO_DIR}/radextract_platform/backend/radextract.db"
        echo "Database synced back to persistent storage."
    fi
}
trap cleanup EXIT INT TERM

# Keep job active
wait ${FRONTEND_PID} ${BACKEND_PID}
