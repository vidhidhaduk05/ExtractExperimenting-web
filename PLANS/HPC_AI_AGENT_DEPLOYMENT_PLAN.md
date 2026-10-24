# RadExtract Platform - HPC AI Agent Master Operational & Deployment Plan

**Target Host**: WVU CTSI HPC Cluster (`ctsi-hpc.hsc.wvu.edu`)  
**Target Compute Nodes**: `hsc-hpc-g-001` / `hsc-hpc-g-002` (NVIDIA Tesla V100S-PCIE-32GB)  
**Target Repository Directory**: `/home/vd00026/Desktop/Software`  
**Web Frontend (GitHub Pages)**: `https://vidhidhaduk05.github.io/ExtractExperimenting-web/`  
**Core Monorepo**: `https://github.com/vidhidhaduk05/ExtractExperimenting.git`  
**Web UI Repo**: `https://github.com/vidhidhaduk05/ExtractExperimenting-web.git`  

---

## 1. System Mission & Core Objective

RadExtract is a systematic literature review, PICO eligibility screening, and clinical data extraction platform.
The public frontend runs on **GitHub Pages**, but all data processing, SQLite storage, and AI inference must run on the **WVU CTSI HPC cluster**.

The HPC AI Agent is responsible for maintaining an **always-on, high-throughput backend environment** integrating:
1. **System 1 (Local Laya)**: Ultra-fast non-autoregressive ModernBERT-large classifier (sub-20ms PICO screening of 5,000+ candidate abstracts).
2. **System 2 (Biomni-R0 32B)**: Deep clinical reasoning LLM running on the Tesla V100S GPU via `llama-server` on port `18000`.
3. **Core Platform API (FastAPI)**: REST endpoints, SQLite database, and pipeline coordination on port `8000`.
4. **Public Ingress Gateway (Cloudflare Tunnel)**: Secure, HTTPS-encrypted bridge forwarding external GitHub Pages traffic to port `8000`.

---

## 2. Port & Service Architecture (CRITICAL: DO NOT CONFLATE PORTS)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      GitHub Pages / Client Web UI                      │
│            https://vidhidhaduk05.github.io/ExtractExperimenting-web/    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Encrypted Public Traffic)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Public Ingress Tunnel (Cloudflare Tunnel)                 │
│              https://<dynamic-or-named>.trycloudflare.com              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Proxied to Local Port 8000
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│     HPC Service Layer: FastAPI Platform Backend (Port 8000)             │
│  - Process: python -m uvicorn main:app --host 0.0.0.0 --port 8000       │
│  - Database: SQLite (WAL mode, staged in node-local /tmp scratch)      │
│  - Routes: /health, /api/projects, /api/screening, /api/extraction     │
│  - System 1 Engine: Local Laya ModernBERT (in-process, 15ms/abstract)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Port 18000 (Internal Loopback Only)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│     System 2 Engine: Biomni-R0 32B Local LLM Server (Port 18000)       │
│  - Process: llama-server -m Biomni-R0-32B.gguf --port 18000            │
│  - Hardware: NVIDIA Tesla V100S 32GB VRAM (~19 GB allocated)           │
│  - Endpoints: /v1/models, /v1/chat/completions                         │
│  - WARNING: NEVER expose Port 18000 directly to the frontend!          │
└────────────────────────────────────────────────────────────────────────┘
```

| Component | Network Bind | Port | Accessibility | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Biomni-R0 32B** | `127.0.0.1` | `18000` | **HPC Internal Only** | Complex data extraction, table parsing, Risk of Bias (RoB 2). |
| **FastAPI Backend** | `0.0.0.0` | `8000` | **Local & Tunnel Target** | Database, API routes, screening orchestration, AI proxying. |
| **Laya ModernBERT** | In-Process | N/A | **Internal Memory** | Millisecond-level System 1 title/abstract eligibility screening. |
| **Cloudflare Tunnel** | Public Edge | `443` -> `8000` | **Public Web** | Secure ingress from GitHub Pages to FastAPI on port 8000. |

---

## 3. High-Priority Engineering Gotchas on HPC

### A. SQLite Database Locking on NFS
- **Problem**: HPC home directories (`/home/vd00026`) are mounted over distributed NFS/Lustre. Concurrent reads/writes to `radextract.db` across multiple workers will throw:
  ```text
  sqlite3.OperationalError: database is locked
  ```
- **Mandatory Solution**:
  1. Copy `radextract.db` from persistent storage into node-local scratch at job start:
     ```bash
     SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_${SLURM_JOB_ID:-manual}"
     mkdir -p "${SCRATCH_DIR}"
     cp /home/vd00026/Desktop/Software/radextract_platform/backend/radextract.db "${SCRATCH_DIR}/radextract.db"
     export DATABASE_PATH="${SCRATCH_DIR}/radextract.db"
     ```
  2. The backend enforces SQLite WAL mode on connection:
     ```sql
     PRAGMA journal_mode=WAL;
     PRAGMA synchronous=NORMAL;
     PRAGMA busy_timeout=15000;
     ```
  3. When shutting down or exiting, always copy the updated database back:
     ```bash
     cp "${SCRATCH_DIR}/radextract.db" /home/vd00026/Desktop/Software/radextract_platform/backend/radextract.db
     ```

### B. SSH Port Forwarding vs Cloudflare Tunnels
- Academic login nodes (`ctsi-hpc.hsc.wvu.edu`) have `AllowTcpForwarding no` enabled in `sshd_config`, and compute nodes are isolated on private subnets. **Do not waste time trying to make `ssh -L 8000:...` work.**
- Always use `cloudflared` because it creates an **outbound** connection over HTTPS (port 443), bypassing institutional firewall restrictions.

### C. Automatic Frontend Discovery via `active_backend.json`
- The frontend on GitHub Pages dynamically discovers the active backend URL by fetching:
  `https://raw.githubusercontent.com/vidhidhaduk05/ExtractExperimenting-web/main/public/active_backend.json`
- Whenever a new tunnel is spun up, the HPC agent updates this file and pushes it to git:
  ```json
  {
    "backend_url": "https://<new-tunnel-id>.trycloudflare.com",
    "api_url": "https://<new-tunnel-id>.trycloudflare.com/api",
    "health_url": "https://<new-tunnel-id>.trycloudflare.com/health",
    "updated_at": "2026-10-24T06:00:00Z",
    "status": "online",
    "model": "biomni-r0"
  }
  ```
- This guarantees that GitHub Pages users are connected instantly **with zero manual configuration or popups**.

---

## 4. End-to-End HPC Agent Execution Checklist

### Step 1: Environment & GPU Verification
```bash
cd /home/vd00026/Desktop/Software
source .venv/bin/activate

# Check GPU allocation and available VRAM
nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
```
*Expected: NVIDIA Tesla V100S-PCIE-32GB with >30 GB free.*

---

### Step 2: Launch Biomni-R0 32B (Port 18000)
```bash
# Verify model weights exist
MODEL_PATH="/home/vd00026/Desktop/Software/models/biomni/Biomni-R0-32B-Preview-Q4_K_M.gguf"

# If llama-server is not already running on port 18000:
if ! curl -s http://127.0.0.1:18000/v1/models >/dev/null 2>&1; then
    nohup llama-server \
        -m "${MODEL_PATH}" \
        --host 127.0.0.1 \
        --port 18000 \
        --n-gpu-layers 99 \
        --ctx-size 16384 \
        --api-key sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e \
        --log-disable > llama_18000.log 2>&1 &
    sleep 5
fi

# Verify port 18000 response:
curl -s http://127.0.0.1:18000/v1/models
```

---

### Step 3: Configure and Start FastAPI Backend (Port 8000)
Configure environment variables in `/home/vd00026/Desktop/Software/radextract_platform/backend/.env`:
```bash
cat << 'EOF' > /home/vd00026/Desktop/Software/radextract_platform/backend/.env
# Local Execution & Database
RADEXTRACT_ENV=production
RADEXTRACT_DB_BACKEND=sqlite
RADEXTRACT_STORAGE_BACKEND=local

# System 1: Local Laya Screening (Mandatory)
JEV_MODE=on
JEV_PROVIDER=laya
LAYA_MODEL_DIR=/home/vd00026/Desktop/Software/laya/models

# System 2: Local Biomni-R0 32B Inference (Port 18000)
LLM_BASE_URL=http://127.0.0.1:18000/v1/chat/completions
LLM_MODELS_URL=http://127.0.0.1:18000/v1/models
LLM_MODEL=biomni-r0
LLM_API_KEY=sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e

RADEXTRACT_LLM_PROVIDER=local
RADEXTRACT_LOCAL_ENDPOINT_URL=http://127.0.0.1:18000/v1
RADEXTRACT_LOCAL_MODEL_NAME=biomni-r0
RADEXTRACT_CUSTOM_API_KEY=sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e
EOF
```

Launch FastAPI with local scratch database:
```bash
cd /home/vd00026/Desktop/Software/radextract_platform/backend

# Stage database in local scratch
SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_scratch"
mkdir -p "${SCRATCH_DIR}"
if [ -f "radextract.db" ]; then
    cp radextract.db "${SCRATCH_DIR}/radextract.db"
fi
export DATABASE_PATH="${SCRATCH_DIR}/radextract.db"

# Start uvicorn
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 > backend_8000.log 2>&1 &
sleep 3

# Verify backend health & projects endpoint:
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/api/projects
```

---

### Step 4: Launch Ingress Tunnel & Broadcast URL
```bash
# Launch Cloudflare tunnel inside a persistent tmux session or background process
nohup cloudflared tunnel --url http://127.0.0.1:8000 > cloudflared.log 2>&1 &
sleep 5

# Extract the assigned trycloudflare URL
TUNNEL_URL=$(grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' cloudflared.log | head -n 1)
echo "Active Backend Tunnel: ${TUNNEL_URL}"

# Verify tunnel endpoint responds externally
curl -s "${TUNNEL_URL}/health"
```

---

### Step 5: Update `active_backend.json` & Sync with GitHub Pages
When the tunnel URL is generated, sync it with the web repository:
```bash
cat << EOF > /home/vd00026/Desktop/Software/radextract_web_repo/public/active_backend.json
{
  "backend_url": "${TUNNEL_URL}",
  "api_url": "${TUNNEL_URL}/api",
  "health_url": "${TUNNEL_URL}/health",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "online",
  "model": "biomni-r0"
}
EOF

cd /home/vd00026/Desktop/Software/radextract_web_repo
git add public/active_backend.json
git commit -m "chore(hpc): update active backend tunnel URL to ${TUNNEL_URL}"
git push origin main
```

---

## 5. Unattended Slurm Automation Script

To run the entire pipeline automatically as a scheduled batch job, submit:
```bash
sbatch /home/vd00026/Desktop/Software/jobs/radextract_web.slurm
```
This batch script handles resource allocation, local database scratch staging, uvicorn backgrounding, Open OnDemand proxy routing, and graceful database sync on exit.

---

## 6. Verification Matrix

| Check | Command | Expected Output |
| :--- | :--- | :--- |
| **GPU Status** | `nvidia-smi` | Tesla V100S, ~19 GB used by `llama-server` |
| **Biomni 32B** | `curl -s http://127.0.0.1:18000/v1/models` | `{"object":"list","data":[{"id":"biomni-r0"}]}` |
| **Laya Engine** | `python -c "from services.jev_client import is_jev_enabled; print(is_jev_enabled())"` | `True` |
| **FastAPI Core** | `curl -s http://127.0.0.1:8000/health` | `{"status":"healthy","db_backend":"sqlite","version":"2.4.0"}` |
| **Projects Route**| `curl -s http://127.0.0.1:8000/api/projects` | `[{"id":"stroke_sr_ich_lvo",...}]` |
| **Public Gateway**| `curl -s https://<tunnel>/health` | `{"status":"healthy",...}` |
