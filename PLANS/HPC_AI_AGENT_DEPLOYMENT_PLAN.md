# RadExtract Platform - HPC AI Agent Architecture & Deployment Plan

**Target Host**: WVU CTSI HPC (`ctsi-hpc.hsc.wvu.edu`)  
**Target Nodes**: `hsc-hpc-g-001` / `hsc-hpc-g-002` (NVIDIA Tesla V100S-PCIE-32GB)  
**Target Repository Path**: `/home/vd00026/Desktop/Software`  
**Public Frontend Client**: `https://vidhidhaduk05.github.io/ExtractExperimenting-web/`  

---

## 1. Executive Summary & Objective

The objective of the AI agent on the HPC is to deploy and maintain an **always-on, high-throughput backend service** that connects:
1. **Biomni-R0 32B GPU Inference Engine** (serving OpenAI-compatible endpoints on port `18000`).
2. **FastAPI Application & Worker Service** (serving REST API, SQLite database, and background job queues on port `8000`).
3. **Public Gateway / Ingress** (exposing port `8000` via a persistent tunnel or Open OnDemand proxy with CORS enabled for GitHub Pages).

```
┌────────────────────────────────────────────────────────┐
│             GitHub Pages / Client Web UI               │
│     https://vidhidhaduk05.github.io/ExtractExperimenting-web/
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (CORS allowed)
                            ▼
┌────────────────────────────────────────────────────────┐
│           Public Ingress (Tunnel / Reverse Proxy)      │
│            https://<your-persistent-api-url>          │
└───────────────────────────┬────────────────────────────┘
                            │ Port 8000
                            ▼
┌────────────────────────────────────────────────────────┐
│      HPC Service Layer: FastAPI Platform & Workers     │
│  - SQLite with WAL mode in fast node scratch (/tmp)    │
│  - Multi-process Uvicorn / Celery-compatible Workers   │
│  - Endpoints: /health, /api/projects, /api/screening   │
└───────────────────────────┬────────────────────────────┘
                            │ Port 18000 (Internal 127.0.0.1)
                            ▼
┌────────────────────────────────────────────────────────┐
│          GPU Inference: llama-server (Biomni-R0)       │
│  - NVIDIA Tesla V100S (32 GB VRAM)                     │
│  - Model: Biomni-R0-32B-Preview-GGUF (Q4_K_M, 19 GB)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Port & Service Topology (Do Not Conflate Ports)

| Service | Host & Port | Process Binary | Primary Role |
| :--- | :--- | :--- | :--- |
| **Biomni Inference** | `127.0.0.1:18000` | `llama-server` | Raw LLM inference (`/v1/models`, `/v1/chat/completions`). **Never expose directly to the frontend**. |
| **FastAPI Backend** | `0.0.0.0:8000` | `uvicorn main:app` | Database, auth, project management, screening logic, verification guardrails, and proxying AI queries. **Expose this to the frontend**. |
| **Cloudflare Ingress** | Dynamic or Named URL | `cloudflared` | Routes incoming HTTPS requests from GitHub Pages to `http://127.0.0.1:8000`. |

---

## 3. High-Priority Gotchas for the HPC Agent

### A. Preventing SQLite Database Corruption on HPC NFS
- **Problem**: Academic HPC home directories (`/home/vd00026`) are mounted over NFS/Lustre. Concurrent access from background workers will cause `sqlite3.OperationalError: database is locked`.
- **Mandatory Fix**:
  1. Staging `radextract.db` into fast local node scratch: `SCRATCH_DIR="${TMPDIR:-/tmp}/radextract_${SLURM_JOB_ID}"`.
  2. Enable WAL (Write-Ahead Logging) mode during database startup:
     ```python
     PRAGMA journal_mode=WAL;
     PRAGMA synchronous=NORMAL;
     PRAGMA busy_timeout=15000;
     ```
  3. Sync back to persistent storage on job exit (`trap cleanup EXIT INT TERM`).

### B. CORS Configuration for GitHub Pages
- Ensure `radextract_platform/backend/main.py` explicitly allows GitHub Pages in CORS middleware:
  ```python
  allow_origins=[
      "https://vidhidhaduk05.github.io",
      "http://localhost:5173",
      "http://127.0.0.1:8000",
      "*"
  ]
  ```

### C. Persistent Cloudflare Named Tunnel (Replacing Random Ephemeral URLs)
- Do **not** rely on `cloudflared tunnel --url ...` (which generates ephemeral `*.trycloudflare.com` domains that expire when the shell dies).
- Run a **named tunnel** configured with a static token or hostname so the web frontend configuration remains permanent.

---

## 4. Step-by-Step Execution Plan for HPC Agent

### Phase 1: Environment & Dependency Validation
1. Verify CUDA and GPU availability:
   ```bash
   nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv
   ```
2. Activate repo virtual environment:
   ```bash
   cd /home/vd00026/Desktop/Software
   source .venv/bin/activate
   ```
3. Verify Python dependencies:
   ```bash
   pip install fastapi uvicorn httpx pydantic pyyaml docling
   ```

### Phase 2: Start Biomni LLM Engine (Port 18000)
1. Verify model file exists:
   ```bash
   ls -lh /path/to/Biomni-R0-32B-Preview-GGUF.gguf
   ```
2. Launch `llama-server` with GPU layer offloading:
   ```bash
   ./llama-server \
     -m /path/to/Biomni-R0-32B-Preview-GGUF.gguf \
     --host 127.0.0.1 \
     --port 18000 \
     --n-gpu-layers 99 \
     --ctx-size 16384 \
     --api-key sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e \
     --log-disable > llama_server.log 2>&1 &
   ```
3. Test inference responsiveness:
   ```bash
   curl -s -X POST http://127.0.0.1:18000/v1/chat/completions \
     -H "Authorization: Bearer sk-biomni-4f8a29b3c1e7492d80ef7195a62bc34e" \
     -H "Content-Type: application/json" \
     -d '{"model":"biomni-r0","messages":[{"role":"user","content":"ping"}]}'
   ```

### Phase 3: Start FastAPI Backend (Port 8000)
1. Export environment variables in `.env`:
   ```bash
   cat << 'EOF' > radextract_platform/backend/.env
   RADEXTRACT_ENV=production
   RADEXTRACT_DB_BACKEND=sqlite
   RADEXTRACT_STORAGE_BACKEND=local
   JEV_MODE=on
   JEV_PROVIDER=laya

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
2. Launch FastAPI with workers:
   ```bash
   cd radextract_platform/backend
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 > backend.log 2>&1 &
   ```
3. Verify `/health` and `/api/projects`:
   ```bash
   curl -s http://127.0.0.1:8000/health
   curl -s http://127.0.0.1:8000/api/projects
   ```

### Phase 4: Establish Public Ingress Tunnel (Port 8000)
1. Run Cloudflare tunnel exposing port 8000:
   ```bash
   cloudflared tunnel --url http://127.0.0.1:8000 > cloudflared_8000.log 2>&1 &
   ```
2. Extract the public HTTPS endpoint from the log:
   ```bash
   grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' cloudflared_8000.log | head -n 1
   ```
3. Verify public connectivity from outside the cluster:
   ```bash
   curl -s https://<generated-url>/health
   ```

---

## 5. Slurm Automated Job Script

To run this as an unattended batch job on the HPC, use the pre-configured Slurm script `radextract_web_repo/jobs/radextract_web.slurm`:

```bash
sbatch radextract_web_repo/jobs/radextract_web.slurm
```

This script automatically:
1. Allocates 4 CPUs, 16 GB RAM, and the GPU.
2. Stages the SQLite database into `/tmp` to bypass NFS locking.
3. Detects port 18000 and mounts the FastAPI backend.
4. Spawns the web server and prints the Open OnDemand proxy link (`https://ctsi-hpc.hsc.wvu.edu/rnode/${NODE_NAME}/${PORT}/`).
5. Handles clean teardown and persistent database flushing upon job termination.

---

## 6. GPU-Accelerated Docling PDF Conversion & Persistence Architecture

### 6.1 Acceleration on Tesla V100S GPU
* **LayoutLM & TableFormer**: IBM Docling document converter leverages PyTorch with `AcceleratorDevice.CUDA` when `torch.cuda.is_available()` is detected on compute nodes, paired with `num_threads=8` for pre-processing.
* **Speedup**: Cuts PDF parsing time from 30–60s on CPU down to ~1–3s on GPU.
* **Graceful Fallback**: If Docling is not installed or CUDA is unavailable, the pipeline falls back to `FallbackProcessor` (pdfplumber/pypdfium2) without throwing unhandled exceptions.

### 6.2 Persistent `.docling.json` Export & Endpoints
* **Persistent Disk Artifact**: Whenever a study PDF is processed, `<study_name>.docling.json` is automatically saved alongside the source PDF file.
* **REST API Endpoint**:
  * `GET /api/studies/{study_id}/docling-json`: Retrieves the structured Docling JSON representation directly (tables, cells, bboxes, pages, metadata).

### 6.3 Batch Conversion Runners
* **CLI Batch Converter**:
  ```bash
  python radextract_platform/backend/scripts/convert_pdfs_to_docling.py \
      --input-dir /home/vd00026/Desktop/Software/TESTING/files \
      --device cuda \
      --threads 8 \
      --sync-db
  ```
* **Slurm GPU Batch Runner**:
  ```bash
  sbatch jobs/convert_pdfs_docling_gpu.slurm
  ```
  Allocates 1x Tesla V100S GPU, 8 CPUs, and 32GB RAM, converting all PDFs and sending status alerts to `vidhidhaduk05@gmail.com`.

